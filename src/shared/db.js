// The per-clone SQLite cache of the item files (store.cacheFile). The item files are the only data: connect rebuilds the cache
// from them, so it never disagrees with them and nothing of it is committed. Synchronous like store.js. The caller closes the handle.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { operation } from '../errors.js';
import { hasFrontMatter, parse } from './frontmatter.js';
import { assertFolder, assertNoSymlinks, beginJournal, cacheFile, endJournal, journalled, addEvent, load, note, now, reflow } from './store.js';
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

// SCHEMA, verbatim: the table SQL in a committed db must not differ from Python's.
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
    const sha256 = createHash('sha256').update(text).digest('hex'); //
    return { path, text, ...parse(text), sha256, sha: sha256 };
  }).filter(i => hasFrontMatter(i.text)).map(({ text, ...item }) => item); // a README or note is no item: same rule as store.load
}

// The database is a per-clone cache of the item files (store.cacheFile), rebuilt at every connect, so it can never disagree with them.
// readOnly (a dry run): the cache is rebuilt in memory and no folder or file is created. The busy timeout is 30 s.
// shortcut: a full rebuild per command; fine up to a few thousand items, switch to a tree-hash stamp if a command gets slow.
export function connect(folder, { readOnly = false } = {}) {
  assertFolder(folder); // <home>/<owner>/<name>: no link at the owner or the name
  let file = ':memory:';
  if (!readOnly) { file = cacheFile(folder); mkdirSync(dirname(file), { recursive: true }); }
  const db = new (sqlite().DatabaseSync)(file, { timeout: 30000 });
  db.exec(SCHEMA);
  db.exec('DELETE FROM phase;');
  db.folder = folder;
  scan(db, folder, { includeArchived: true });
  return db;
}

// A command that writes item files must leave nothing behind when it throws (nothing is committed yet, so the next successful
// command would publish it): fn runs, and on a throw exactly the files it wrote, renamed or removed (store.note, called by every
// writer) go back as they were. A file the command did not write is never touched.
// Beyond python parity. shortcut: the files are held in memory; fine for a backlog folder.
export async function undoOnThrow(db, folder, fn) {
  let touched;
  const opened = beginJournal(folder);
  try {
    try { return await journalled(async j => { touched = j; return fn(); }); } catch (e) {
      for (const [p, prior] of touched) {
        if (prior === null) rmSync(p, { force: true }); else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, prior); }
      }
      throw e;
    } finally {
      // a nested undo that succeeded hands its paths to the outer one, which may still fail
      if (touched) for (const [p, prior] of touched) note(p, prior);
    }
  } finally { if (opened) endJournal(); }
}

// log_event: the item carries its history, so the event is a line in the item file.
export function logEvent(db, event, { phaseId = null, branch = '', commitSha = '', note = '' } = {}) {
  const row = phaseId && db.folder ? db.prepare('SELECT path FROM phase WHERE id=?').get(phaseId) : null;
  if (row && existsSync(join(db.folder, row.path))) addEvent(db.folder, row.path, { event, branch, commitSha, note });
}

// ensure_handoff_anchor: the single synthetic row the phases point at.
export function ensureAnchor(db) {
  const row = db.prepare("SELECT id FROM handoff WHERE status='active' LIMIT 1").get();
  if (row) return Number(row.id);
  db.prepare("INSERT INTO handoff(slug,title,objective,path,sha,status,source_context,created_at,updated_at) VALUES('BACKLOG','Backlog','phase anchor (no document)','','','active','',?,?)").run(now(), now());
  return Number(db.prepare("SELECT id FROM handoff WHERE slug='BACKLOG'").get().id);
}

// ingest_phase: upsert by slug; the row changes (and logs) only when the sha differs.
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
  if (!row) {
    const names = ['handoff_id', 'slug', ...Object.keys(cols), 'created_at', 'updated_at'];
    const id = Number(db.prepare(`INSERT INTO phase(${names}) VALUES(${names.map(() => '?')})`).run(hid, slug, ...Object.values(cols), now(), now()).lastInsertRowid);
    return { id, changed: true };
  }
  if (row.sha === item.sha256) return { id: Number(row.id), changed: false };
  db.prepare(`UPDATE phase SET ${[...Object.keys(cols), 'updated_at'].map(k => `${k}=?`)} WHERE id=?`).run(...Object.values(cols), now(), row.id);
  return { id: Number(row.id), changed: true };
}

// scan_stack over phases/*.md (reconciliation opts into archive/ too): ingest what is new or changed.
// One transaction, so a failed scan leaves the db as it was.
export function scan(db, folder, { includeArchived = false } = {}) {
  const summary = { handoff: 0, phases: 0, changed: 0 };
  db.exec('BEGIN');
  try {
    const hid = ensureAnchor(db);
    // Ordinary scans keep Python's active-only contract. Recovery must also derive the archive mirror from its files.
    const items = includeArchived ? load(folder).filter(i => hasFrontMatter(readFileSync(join(folder, i.path), 'utf8'))) : loadPhases(folder);
    for (const item of items) {
      summary.phases += 1;
      summary.changed += Number(ingest(db, item, hid).changed);
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
  logEvent(db, 'archived', { phaseId: r.id, branch: r.branch, commitSha: r.commit_sha, note: `${r.slug} -> ${location}` });
  return { id: Number(r.id), slug };
}

// sync.commit with a reconcile step: after a rebase renumbered items or took upstream's copy of a re-ranked item, the priorities are reflowed
// (and the cache rescanned) and folded into the commit BEFORE its first push, so origin/main never holds a queue with two items at one rank.
// Resolves to every [old, new] pair renumbered on the way.
export async function commitSettled(home, folders, message, guard = [], claims = []) {
  const list = [].concat(folders);
  return commit(home, list, message, () => reconcileFolders(list), guard, claims);
}

export function reconcileFolders(list) {
  for (const folder of list) {
    const again = connect(folder);
    try {
      reflow(folder); // two writers each ranked their item against their own queue: ties are possible now that the queues are merged
      scan(again, folder, { includeArchived: true });
    } finally { again.close(); }
  }
}
