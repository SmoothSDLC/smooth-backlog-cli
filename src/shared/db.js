// backlog.db mirror for the shared backlog repository mode (cli-parity job 9). The item files are
// the source of truth; <folder>/backlog.db mirrors them so the Python scripts (new_phase.py takes
// its next number from MAX(seq) here) see what Node wrote. Oracle: lib_db.py SCHEMA/connect/
// _migrate, ensure_handoff_anchor, ingest_phase, scan_stack, log_event and archive.py:89-93.
// Synchronous like store.js. The caller closes the handle.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { operation } from '../errors.js';
import { hasFrontMatter, parse } from './frontmatter.js';
import { assertFolder, assertNoSymlinks, beginJournal, endJournal, journalled, load, note, now, reflow } from './store.js';
import { commit } from './sync.js';

// node:sqlite prints an ExperimentalWarning on some Node 24 builds: keep it off stderr (as store.nextSeq does).
function sqlite() {
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => {
    const type = typeof a[0] === 'string' ? a[0] : a[0]?.type ?? w?.name;
    if (!(type === 'ExperimentalWarning' && /sqlite/i.test(String(w?.message ?? w)))) emit.call(process, w, ...a);
  };
  try { return process.getBuiltinModule('node:sqlite'); } finally { process.emitWarning = emit; }
}

// lib_db.py SCHEMA, verbatim: the table SQL in a committed db must not differ from Python's.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS handoff (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT, objective TEXT,
  path TEXT, sha TEXT, status TEXT DEFAULT 'active', source_context TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS phase (
  id INTEGER PRIMARY KEY, handoff_id INTEGER REFERENCES handoff(id),
  slug TEXT NOT NULL, seq INTEGER, name TEXT, objective TEXT, summary TEXT,
  status TEXT DEFAULT 'pending', severity TEXT DEFAULT 'normal',
  priority INTEGER DEFAULT 50, path TEXT, sha TEXT,
  branch TEXT DEFAULT '', commit_sha TEXT DEFAULT '', location TEXT DEFAULT '', repository TEXT DEFAULT '',
  size_score INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT, completed_at TEXT,
  UNIQUE(handoff_id, slug)
);
CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY, ts TEXT, handoff_id INTEGER, phase_id INTEGER,
  event TEXT, branch TEXT DEFAULT '', commit_sha TEXT DEFAULT '', note TEXT DEFAULT ''
);
`;

// store.load over phases/ only: scan_stack never reads archive/, so archive content cannot block a scan.
function loadPhases(folder) {
  assertNoSymlinks(folder, join(folder, 'phases'));
  let names;
  try { names = readdirSync(join(folder, 'phases')).filter(n => n.endsWith('.md')).sort(); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return names.map(n => {
    const path = `phases/${n}`;
    assertNoSymlinks(folder, join(folder, path));
    const text = readFileSync(join(folder, path), 'utf8');
    const sha256 = createHash('sha256').update(text).digest('hex'); // lib_db.py:163-164
    return { path, text, ...parse(text), sha256, sha: sha256 };
  }).filter(i => hasFrontMatter(i.text)).map(({ text, ...item }) => item); // a README or note is no item: same rule as store.load
}

// lib_db.py connect + _migrate; the busy timeout is Python's 30 s. Opening an up-to-date db writes nothing.
// readOnly (a dry run): no folder, file or migration is created; an absent backlog.db reads as an empty mirror (in memory).
// A run that leaves nothing to commit (refused, dry-run, failed) must not leave the backlog.db it created: untracked, it blocks every later pull.
// Call before connect; call the result when the run did not end in a commit.
export function freshDb(folder) {
  const file = join(folder, 'backlog.db');
  const had = existsSync(file);
  return () => { if (!had) for (const s of ['', '-journal', '-wal', '-shm']) rmSync(file + s, { force: true }); };
}

export function connect(folder, { readOnly = false } = {}) {
  assertFolder(folder); // <home>/<owner>/<name>: no link at the owner or the name
  assertNoSymlinks(folder, join(folder, 'backlog.db'));
  if (readOnly) {
    const file = join(folder, 'backlog.db');
    const mem = !existsSync(file);
    const ro = new (sqlite().DatabaseSync)(mem ? ':memory:' : file, { readOnly: !mem });
    if (mem) ro.exec(SCHEMA);
    return ro;
  }
  mkdirSync(folder, { recursive: true });
  const db = new (sqlite().DatabaseSync)(join(folder, 'backlog.db'), { timeout: 30000 });
  db.exec(SCHEMA);
  const have = new Set(db.prepare('PRAGMA table_info(phase)').all().map(r => r.name));
  if (!have.has('severity')) db.exec("ALTER TABLE phase ADD COLUMN severity TEXT DEFAULT 'normal'");
  if (!have.has('repository')) db.exec("ALTER TABLE phase ADD COLUMN repository TEXT DEFAULT ''");
  return db;
}

// A command that writes item files and then scans must leave nothing behind when it throws (nothing is committed yet, so the
// next successful command would publish it): fn() runs, and on a throw exactly the files it wrote, renamed or removed (store.note,
// called by every writer) and every row of the mirror go back as they were. A file the command did not write is never touched.
// Beyond python parity. shortcut: the files are held in memory; fine for a backlog folder.
export async function undoOnThrow(db, folder, fn) {
  const rowsOf = () => ['handoff', 'phase', 'event'].map(t => [t, db.prepare(`SELECT * FROM ${t}`).all().map(r => ({ ...r }))]);
  const tables = rowsOf();
  let touched;
  const opened = beginJournal(folder);
  try {
   try { return await journalled(async j => { touched = j; return fn(); }); } catch (e) {
    for (const [p, prior] of touched) {
      if (prior === null) rmSync(p, { force: true }); else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, prior); }
    }
    let now;
    try { now = JSON.stringify(rowsOf()); } catch { throw e; } // the command closed its db (it is past the rescans): nothing of the mirror to put back
    if (now === JSON.stringify(tables)) throw e; // untouched: do not rewrite the db file
    db.exec('BEGIN');
    for (const [t] of [...tables].reverse()) db.exec(`DELETE FROM ${t}`); // phase references handoff
    for (const [t, rows] of tables) {
      for (const r of rows) db.prepare(`INSERT INTO ${t}(${Object.keys(r)}) VALUES(${Object.keys(r).map(() => '?')})`).run(...Object.values(r));
    }
    db.exec('COMMIT');
    throw e;
  } finally {
    // a nested undo that succeeded hands its paths to the outer one, which may still fail
    if (touched) for (const [p, prior] of touched) note(p, prior);
  }
  } finally { if (opened) endJournal(); }
}

// lib_db.py log_event
export function logEvent(db, event, { handoffId = null, phaseId = null, branch = '', commitSha = '', note = '' } = {}) {
  db.prepare('INSERT INTO event(ts,handoff_id,phase_id,event,branch,commit_sha,note) VALUES(?,?,?,?,?,?,?)')
    .run(now(), handoffId, phaseId, event, branch, commitSha, note);
}

// lib_db.py ensure_handoff_anchor: the single synthetic row the phases point at.
export function ensureAnchor(db) {
  const row = db.prepare("SELECT id FROM handoff WHERE status='active' LIMIT 1").get();
  if (row) return Number(row.id);
  db.prepare("INSERT INTO handoff(slug,title,objective,path,sha,status,source_context,created_at,updated_at) VALUES('BACKLOG','Backlog','phase anchor (no document)','','','active','',?,?)").run(now(), now());
  return Number(db.prepare("SELECT id FROM handoff WHERE slug='BACKLOG'").get().id);
}

// lib_db.py ingest_phase: upsert by slug; the row changes (and logs) only when the sha differs.
// item = a store.load entry. Returns { id, changed }.
export function ingest(db, item, hid = ensureAnchor(db)) {
  const fm = item.fm;
  const v = (k, d) => (k in fm ? fm[k] : d); // dict.get(k, d): a key present with null stays null
  const slug = fm.phase || basename(item.path, '.md');
  const cols = {
    seq: v('seq', 0), name: v('name', ''), objective: v('objective', ''), summary: v('summary', ''), status: v('status', 'pending'),
    severity: fm.severity || 'normal', priority: v('priority', 50), path: item.path, sha: item.sha256, branch: fm.branch || '',
    repository: fm.repository || '', commit_sha: fm.commit || '', location: fm.location || '', size_score: v('size_score', 0),
    completed_at: v('completed', null),
  };
  const row = db.prepare('SELECT id, sha FROM phase WHERE handoff_id=? AND slug=?').get(hid, slug);
  const ev = { handoffId: hid, branch: cols.branch, commitSha: cols.commit_sha };
  if (!row) {
    const names = ['handoff_id', 'slug', ...Object.keys(cols), 'created_at', 'updated_at'];
    const id = Number(db.prepare(`INSERT INTO phase(${names}) VALUES(${names.map(() => '?')})`).run(hid, slug, ...Object.values(cols), now(), now()).lastInsertRowid);
    // Beyond the oracle: phase.id is a bare INTEGER PRIMARY KEY, so after move.py deleted the row with the highest id the new row
    // reuses it. Events still naming that id belong to the departed item (move.py keeps its history there): detach them, keep them.
    db.prepare('UPDATE event SET phase_id=NULL WHERE phase_id=?').run(id);
    logEvent(db, 'ingested', { ...ev, phaseId: id, note: `new phase ${slug}` });
    return { id, changed: true };
  }
  if (row.sha === item.sha256) return { id: Number(row.id), changed: false };
  db.prepare(`UPDATE phase SET ${[...Object.keys(cols), 'updated_at'].map(k => `${k}=?`)} WHERE id=?`).run(...Object.values(cols), now(), row.id);
  logEvent(db, 'reingested', { ...ev, phaseId: Number(row.id), note: `sha drift ${String(row.sha ?? '').slice(0, 7)}->${item.sha256.slice(0, 7)}` });
  return { id: Number(row.id), changed: true };
}

// lib_db.py scan_stack over phases/*.md (reconciliation opts into archive/ too): ingest what is new or changed, log
// file_missing for every non-archived row without a file. One transaction, so a failed scan leaves the db as it was.
// renumbered = the [old, new] pairs sync.commit returned: a row of the old number whose file is gone is the stale
// row of a renumbered item, and is renamed in place to the new number so it is not reported as a ghost.
export function scan(db, folder, renumbered = [], { includeArchived = false } = {}) {
  const summary = { handoff: 0, phases: 0, changed: 0, missing: 0 };
  db.exec('BEGIN');
  try {
    const hid = ensureAnchor(db);
    for (const [old, next] of renumbered) {
      for (const r of db.prepare(`SELECT id, slug, path, branch, commit_sha FROM phase WHERE handoff_id=? AND seq=?${includeArchived ? '' : " AND status != 'archived'"}`).all(hid, Number(old))) {
        if (existsSync(join(folder, r.path))) continue;
        // in place, keeping the id: the row's events stay its own (a deleted id can be reused by another item).
        // The ingest below then sees the sha drift and logs 'reingested'.
        const num = String(next).padStart(3, '0');
        const slug = num + r.slug.replace(/^\d+/, '');
        if (db.prepare('SELECT 1 FROM phase WHERE handoff_id=? AND slug=?').get(hid, slug)) continue; // unique slug: leave it to file_missing
        db.prepare('UPDATE phase SET slug=?, seq=?, path=? WHERE id=?').run(slug, next, r.path.replace(/[^/]*$/, f => num + f.replace(/^\d+/, '')), r.id);
        logEvent(db, 'renumbered', { handoffId: hid, phaseId: Number(r.id), branch: r.branch, commitSha: r.commit_sha, note: `${r.slug} renumbered to ${String(next).padStart(3, '0')}` });
      }
    }
    const seen = new Set();
    // Ordinary scans keep Python's active-only contract. Recovery must also derive the archive mirror from its files.
    const items = includeArchived ? load(folder).filter(i => hasFrontMatter(readFileSync(join(folder, i.path), 'utf8'))) : loadPhases(folder);
    for (const item of items) {
      summary.phases += 1;
      summary.changed += Number(ingest(db, item, hid).changed);
      seen.add(item.fm.phase || basename(item.path, '.md'));
    }
    for (const r of db.prepare('SELECT id, slug, status FROM phase WHERE handoff_id=?').all(hid)) {
      if (seen.has(r.slug) || r.status === 'archived') continue;
      summary.missing += 1;
      logEvent(db, 'file_missing', { handoffId: hid, phaseId: Number(r.id), note: `phase ${r.slug} row present but file absent` });
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return summary;
}

// archive.py:89-93: the row becomes archived at its new folder-relative path. null when the slug has no row.
export function markArchived(db, slug, location) {
  operation(!isAbsolute(location) && !location.split(/[/\\]/).includes('..'), `Unsafe path: ${location}.`); // folder-relative, no escape
  const r = db.prepare('SELECT * FROM phase WHERE slug=?').get(slug);
  if (!r) return null;
  db.prepare("UPDATE phase SET status='archived', path=?, updated_at=? WHERE id=?").run(location, now(), r.id);
  logEvent(db, 'archived', { handoffId: r.handoff_id, phaseId: r.id, branch: r.branch, commitSha: r.commit_sha, note: `${r.slug} -> ${location}` });
  return { id: Number(r.id), slug };
}

// A conflict on backlog.db took upstream's copy (the mirror is derived from the files). What the files cannot give back is this clone's own
// unpushed change to the mirror: replay it onto upstream's copy, as the difference between the local db and the merge base `base` (null:
// no base, everything local is new). One function for every kind of change: rows the local side changed (an archive: status and path),
// rows it deleted (a move out of the repository), and events it logged (notes, claims, reviews, moves). The files are rescanned in between:
// locally added rows (including already archived ones) are restored before their events, and renumbered items use their new slug.
// Events the scan writes by itself are not replayed; an event upstream has already (same item, time, kind, branch, commit, note) is not added twice.
const SCAN_EVENTS = ['ingested', 'reingested', 'file_missing', 'renumbered'];
const NOT_REPLAYED = ['id', 'handoff_id', 'slug', 'seq', 'sha']; // identity, and what the rescan derives from the file
function replayLocal(db, folder, { local: localFile, base: baseFile }, renumbered) {
  const open = file => new (sqlite().DatabaseSync)(file, { readOnly: true });
  const local = open(localFile); const base = baseFile ? open(baseFile) : null;
  try {
    const rowsOf = d => (d ? d.prepare('SELECT * FROM phase').all().map(r => ({ ...r })) : []);
    const [mine, was] = [rowsOf(local), rowsOf(base)];
    const [mineBy, wasBy] = [new Map(mine.map(r => [r.slug, r])), new Map(was.map(r => [r.slug, r]))];
    const moved = new Map(renumbered.map(([old, next]) => [Number(old), next]));
    const rename = slug => { const n = moved.get(Number(/^\d+/.exec(slug)?.[0])); return n === undefined ? slug : String(n).padStart(3, '0') + slug.replace(/^\d+/, ''); };
    db.exec('BEGIN');
    try {
      for (const r of mine) {
        const b = wasBy.get(r.slug); const u = db.prepare('SELECT id FROM phase WHERE slug=?').get(rename(r.slug));
        if (!b && !u) {
          // Database ids belong to each clone. Restore the row with a fresh id and the current anchor; events are matched by slug below.
          const restored = { ...r, handoff_id: ensureAnchor(db), slug: rename(r.slug), seq: moved.get(Number(r.seq)) ?? r.seq,
            path: r.path == null ? null : r.path.replace(/[^/]*$/, rename) };
          delete restored.id;
          const id = Number(db.prepare(`INSERT INTO phase(${Object.keys(restored)}) VALUES(${Object.keys(restored).map(() => '?')})`).run(...Object.values(restored)).lastInsertRowid);
          db.prepare('UPDATE event SET phase_id=NULL WHERE phase_id=?').run(id); // a deleted upstream id can still have history
          continue;
        }
        const cols = b && u ? Object.keys(r).filter(c => !NOT_REPLAYED.includes(c) && r[c] !== b[c] && !(c === 'path' && !String(r.path).startsWith('archive/'))) : [];
        if (cols.length) db.prepare(`UPDATE phase SET ${cols.map(c => `${c}=?`).join(', ')} WHERE id=?`).run(...cols.map(c => r[c]), u.id);
      }
      for (const b of was) if (!mineBy.has(b.slug)) db.prepare('DELETE FROM phase WHERE slug=?').run(rename(b.slug)); // the row is gone locally, and so is its file
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    scan(db, folder, renumbered, { includeArchived: true });

    const key = (slug, e) => JSON.stringify([slug, e.ts, e.event, e.branch, e.commit_sha, e.note]);
    // Row ids are private to each snapshot: a deletion and insertion can reuse one even in the same clone.
    const localSlugOf = new Map(mine.map(r => [r.id, r.slug]));
    const baseSlugOf = new Map(was.map(r => [r.id, r.slug]));
    const wasEvents = new Set((base ? base.prepare('SELECT * FROM event').all() : []).map(e => key(e.phase_id === null ? null : baseSlugOf.get(e.phase_id) ?? null, e)));
    const have = new Set(db.prepare('SELECT p.slug, e.ts, e.event, e.branch, e.commit_sha, e.note FROM event e LEFT JOIN phase p ON p.id = e.phase_id').all().map(e => key(e.slug, e)));
    db.exec('BEGIN');
    try {
      for (const e of local.prepare('SELECT * FROM event ORDER BY id').all()) {
        const slug = e.phase_id === null || !localSlugOf.has(e.phase_id) ? null : rename(localSlugOf.get(e.phase_id));
        if (SCAN_EVENTS.includes(e.event) || wasEvents.has(key(e.phase_id === null ? null : localSlugOf.get(e.phase_id) ?? null, e)) || have.has(key(slug, e))) continue;
        const p = slug === null ? null : db.prepare('SELECT id, handoff_id FROM phase WHERE slug=?').get(slug); // gone (moved out): the event stays, without an item
        db.prepare('INSERT INTO event(ts,handoff_id,phase_id,event,branch,commit_sha,note) VALUES(?,?,?,?,?,?,?)')
          .run(e.ts, e.handoff_id === null ? null : p?.handoff_id ?? ensureAnchor(db), p?.id ?? null, e.event, e.branch, e.commit_sha, e.note);
        have.add(key(slug, e));
      }
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  } finally { local.close(); base?.close(); }
}

// sync.commit with a reconcile step: after a rebase renumbered items or took upstream's backlog.db, the mirror is rebuilt from the files
// (local changes replayed, priorities reflowed) and folded into the commit BEFORE its first push, so origin/main never holds a mirror
// that disagrees with its files. Resolves to every [old, new] pair renumbered on the way.
export async function commitSettled(home, folders, message, guard = []) {
  const list = [].concat(folders);
  return commit(home, list, message, pairs => reconcileFolders(list, pairs), guard);
}

export function reconcileFolders(list, pairs) {
    try {
      for (const folder of list) {
        const again = connect(folder);
        try {
          const own = pairs.filter(p => p.folder === undefined || p.folder === resolve(folder)); // the renumberings of this folder only
          const mine = (pairs.localDbs ?? []).filter(f => f.folder === folder);
          if (mine.length) for (const files of mine) replayLocal(again, folder, files, own);
          else scan(again, folder, own, { includeArchived: true });
          reflow(folder); // two writers each ranked their item against their own queue: ties are possible now that the queues are merged
          scan(again, folder, [], { includeArchived: true });
        } finally { again.close(); }
      }
    } finally { for (const { local } of pairs.localDbs ?? []) rmSync(dirname(local), { recursive: true, force: true }); }
}
