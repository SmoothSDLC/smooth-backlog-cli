// Tests for src/shared/db.js — cli-parity job 9 (the backlog.db mirror with node:sqlite).
// Oracle: lib_db.py connect/_migrate (SCHEMA), ensure_handoff_anchor, ingest_phase, scan_stack and
// archive.py:89-93, the pinned scripts. Oracle-backed tests skip when SMOOTH_BACKLOG_SCRIPTS is
// not configured or PyYAML is missing. Local bare repos only (shared-fixtures.js, job 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';

const DB = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'shared', 'db.js'));
const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const pad = n => String(n).padStart(3, '0');
const rows = (con, sql, ...p) => con.prepare(sql).all(...p).map(r => ({ ...r }));
const STAMPS = ({ created_at, updated_at, ts, ...rest }) => rest; // eslint-disable-line no-unused-vars

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'db-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [k, v] of Object.entries(GIT_IDENTITY)) { const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; }); }
  return dir;
}
// A folder in the <home>/<owner>/<name> layout, as the containment check of connect expects.
const inHome = t => { const d = join(scratch(t), 'acme', 'demo'); mkdirSync(d, { recursive: true }); return d; };
// The shared home, a consumer (origin acme/demo, branch main) and the item folder.
function fixture(t) {
  const dir = scratch(t);
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  return { t: dir, home, cons, folder: join(home, 'acme', 'demo') };
}
function oracle(t, f, script, args) {
  const r = py(script, args, { cwd: f.cons, tmp: f.t });
  if (!r) { t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing'); return null; }
  assert.equal(r.status, 0, `${script} ${args.join(' ')} failed: ${r.stdout}${r.stderr}`);
  return r;
}
// An item file as new_phase.py writes it (front matter order of new_phase.py:122-138).
function putItem(folder, seq, name, extra = {}, rel) {
  const phase = `${pad(seq)}-${name}`;
  store.write({
    path: join(folder, rel ?? `phases/${phase}.md`),
    fm: {
      phase, seq, name, objective: `do ${name}`, summary: `sum ${name}`, status: 'pending', severity: 'normal', priority: seq - 1,
      repository: 'acme/demo', branch: 'main', commit: 'abc1234', location: '', created: '2026-10-23T00:00:00Z', updated: '2026-10-23T00:00:00Z',
      depends_on: [], claimed_by: '', claimed_at: '', review_state: 'none', reviewer: '', ...extra,
    },
    body: `\n# Phase ${pad(seq)} — ${name}\n\n**Objective:** do ${name}\n`,
  });
  return phase;
}
const scanned = (folder, fn) => { const con = db.connect(folder); try { const s = db.scan(con, folder); return fn?.(con, s); } finally { con.close(); } };
const PY_ARGS = ['--name', 'Alpha', '--objective', 'o', '--summary', 's', '--depends-on', 'none'];

// ---------------------------------------------------------------- connect / migrate / anchor

test('connect: creates <folder>/backlog.db with the schema of lib_db.py SCHEMA (oracle: same table SQL as Python)', t => {
  const f = fixture(t);
  if (!oracle(t, f, 'new_phase.py', PY_ARGS)) return;
  const pyDb = db.connect(f.folder); // Python made this file; connect must not change it
  const pySql = rows(pyDb, "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  pyDb.close();
  const fresh = join(f.t, 'fresh');
  const con = db.connect(fresh);
  assert.ok(existsSync(join(fresh, 'backlog.db')));
  assert.deepEqual(rows(con, "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"), pySql);
  assert.deepEqual(pySql.map(r => r.name), ['event', 'handoff', 'phase']);
  con.close();
});

test('connect: opening an existing database writes nothing (the tracked file stays byte-identical)', t => {
  const d = inHome(t);
  db.connect(d).close();
  const before = readFileSync(join(d, 'backlog.db'));
  db.connect(d).close();
  assert.ok(before.equals(readFileSync(join(d, 'backlog.db'))));
});

test('connect: migrates a committed database that lacks severity and repository (lib_db.py _migrate)', t => {
  const d = scratch(t);
  const raw = db.connect(join(d, 'old'));
  raw.exec('DROP TABLE phase; CREATE TABLE phase (id INTEGER PRIMARY KEY, handoff_id INTEGER, slug TEXT NOT NULL, seq INTEGER, status TEXT DEFAULT \'pending\')');
  raw.close();
  const con = db.connect(join(d, 'old'));
  const cols = rows(con, 'PRAGMA table_info(phase)').map(r => r.name);
  assert.ok(cols.includes('severity') && cols.includes('repository'));
  assert.equal(rows(con, 'PRAGMA table_info(phase)').find(r => r.name === 'severity').dflt_value, "'normal'");
  con.close();
});

test('ensureAnchor: one synthetic BACKLOG row, created once, id returned each time', t => {
  const d = inHome(t);
  const con = db.connect(d);
  const id = db.ensureAnchor(con);
  assert.equal(db.ensureAnchor(con), id);
  assert.deepEqual(rows(con, 'SELECT slug, title, objective, path, sha, status, source_context FROM handoff'),
    [{ slug: 'BACKLOG', title: 'Backlog', objective: 'phase anchor (no document)', path: '', sha: '', status: 'active', source_context: '' }]);
  con.close();
});

// ---------------------------------------------------------------- ingest / scan

test('ingest: new file -> row (integers stay integers) and an "ingested" event; same sha -> nothing; changed sha -> "reingested"', t => {
  const d = inHome(t);
  const con = db.connect(d);
  putItem(d, 3, 'x', { size_score: 2, completed: '2026-10-23T01:00:00Z' });
  const it = store.load(d)[0];
  const first = db.ingest(con, it);
  assert.equal(first.changed, true);
  const row = rows(con, 'SELECT *, typeof(seq) AS ts, typeof(priority) AS tp FROM phase')[0];
  assert.equal(row.slug, '003-x'); assert.equal(row.seq, 3); assert.equal(row.ts, 'integer'); assert.equal(row.tp, 'integer');
  assert.deepEqual([row.status, row.severity, row.priority, row.path, row.sha, row.branch, row.repository, row.commit_sha, row.location, row.size_score, row.completed_at],
    ['pending', 'normal', 2, 'phases/003-x.md', it.sha256, 'main', 'acme/demo', 'abc1234', '', 2, '2026-10-23T01:00:00Z']);
  assert.match(row.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(db.ingest(con, it).changed, false);
  assert.equal(rows(con, 'SELECT * FROM event').length, 1);
  putItem(d, 3, 'x', { status: 'in_progress' });
  const again = db.ingest(con, store.load(d)[0]);
  assert.deepEqual([again.id, again.changed], [first.id, true]);
  const ev = rows(con, 'SELECT event, note, phase_id, branch, commit_sha FROM event ORDER BY id');
  assert.deepEqual(ev.map(e => e.event), ['ingested', 'reingested']);
  assert.equal(ev[0].note, 'new phase 003-x');
  assert.match(ev[1].note, new RegExp(`^sha drift ${it.sha256.slice(0, 7)}->[0-9a-f]{7}$`));
  assert.equal(ev[1].branch, 'main'); assert.equal(ev[1].commit_sha, 'abc1234');
  assert.equal(rows(con, 'SELECT status FROM phase')[0].status, 'in_progress');
  con.close();
});

test('ingest: missing keys take the lib_db.py defaults (seq 0, status pending, priority 50, slug from the file name)', t => {
  const d = inHome(t);
  const con = db.connect(d);
  store.write({ path: join(d, 'phases', '009-bare.md'), fm: { name: 'Bare' }, body: 'x\n' });
  db.ingest(con, store.load(d)[0]);
  const r = rows(con, 'SELECT slug, seq, status, severity, priority, branch, repository, size_score, completed_at FROM phase')[0];
  assert.deepEqual(r, { slug: '009-bare', seq: 0, status: 'pending', severity: 'normal', priority: 50, branch: '', repository: '', size_score: 0, completed_at: null });
  con.close();
});

test('scan: ingests phases/*.md only (archive/ is not scanned), reports the summary, is idempotent', t => {
  const d = inHome(t);
  putItem(d, 1, 'a'); putItem(d, 2, 'b');
  putItem(d, 3, 'old', { status: 'archived' }, 'archive/phases/003-old.md');
  scanned(d, (con, s) => {
    assert.deepEqual(s, { handoff: 0, phases: 2, changed: 2, missing: 0 });
    assert.deepEqual(rows(con, 'SELECT slug FROM phase ORDER BY id').map(r => r.slug), ['001-a', '002-b']);
    assert.deepEqual(db.scan(con, d), { handoff: 0, phases: 2, changed: 0, missing: 0 });
    assert.equal(rows(con, 'SELECT * FROM event').length, 2);
  });
});

test('scan: a row whose file is gone logs file_missing on every scan; an archived row does not', t => {
  const d = inHome(t);
  putItem(d, 1, 'a'); putItem(d, 2, 'b');
  scanned(d);
  rmSync(join(d, 'phases', '001-a.md'));
  renameSync(join(d, 'phases', '002-b.md'), join(d, 'moved.md'));
  const con = db.connect(d);
  db.markArchived(con, '002-b', 'archive/phases/002-b.md');
  assert.equal(db.scan(con, d).missing, 1);
  assert.equal(db.scan(con, d).missing, 1);
  const ev = rows(con, "SELECT note FROM event WHERE event='file_missing'");
  assert.deepEqual(ev.map(e => e.note), ['phase 001-a row present but file absent', 'phase 001-a row present but file absent']);
  con.close();
});

test('markArchived: status archived, new path, updated_at, an "archived" event; an unknown slug changes nothing', t => {
  const d = inHome(t);
  putItem(d, 1, 'a', { commit: 'c0ffee1' });
  const con = db.connect(d);
  db.scan(con, d);
  assert.equal(db.markArchived(con, 'nope', 'archive/phases/x.md'), null);
  assert.ok(db.markArchived(con, '001-a', 'archive/phases/001-a.md'));
  assert.deepEqual(rows(con, 'SELECT status, path FROM phase'), [{ status: 'archived', path: 'archive/phases/001-a.md' }]);
  const ev = rows(con, "SELECT note, branch, commit_sha, phase_id, handoff_id FROM event WHERE event='archived'");
  assert.deepEqual(ev.map(e => [e.note, e.branch, e.commit_sha]), [['001-a -> archive/phases/001-a.md', 'main', 'c0ffee1']]);
  assert.ok(ev[0].phase_id && ev[0].handoff_id);
  con.close();
});

test('node:sqlite prints no ExperimentalWarning to stderr', () => {
  const d = mkdtempSync(join(tmpdir(), 'db-warn-'));
  try {
    const r = spawnSync(process.execPath, ['-e', 'const m = await import(process.argv[1]); const c = m.connect(process.argv[2]); m.scan(c, process.argv[2]); c.close();', DB, join(d, 'acme', 'demo')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- Python parity (oracle)

test('Python rows equal Node rows: Node scan of Python-made files reproduces the phase table; a Node scan over the Python db changes nothing', t => {
  const f = fixture(t);
  if (!oracle(t, f, 'new_phase.py', PY_ARGS)) return;
  oracle(t, f, 'new_phase.py', ['--name', 'Beta', '--objective', 'o2', '--summary', 's2', '--depends-on', 'none', '--priority', '0', '--severity', 'critical']);
  const phases = con => rows(con, 'SELECT * FROM phase ORDER BY id').map(STAMPS);
  const mirror = join(f.t, 'mirror');
  cpSync(join(f.folder, 'phases'), join(mirror, 'phases'), { recursive: true });
  const nodeRows = scanned(mirror, con => phases(con));
  const count = () => { const c = db.connect(f.folder); try { return rows(c, 'SELECT * FROM event').length; } finally { c.close(); } };
  const before = count();
  const pythonRows = scanned(f.folder, (con, s) => { assert.equal(s.changed, 0, 'the Python rows already match the files'); return phases(con); });
  assert.equal(pythonRows.length, 2);
  assert.deepEqual(nodeRows, pythonRows);
  assert.equal(count(), before, 'sha parity: no drift, no new event');
});

test('Python reads Node writes: query.py --status lists the items with status, priority and branch', t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'one', { priority: 1, status: 'in_progress' });
  putItem(f.folder, 2, 'two', { priority: 0 });
  putItem(f.folder, 3, 'three', { priority: 2, branch: 'other' });
  scanned(f.folder);
  const r = oracle(t, f, 'query.py', ['--status', '--json']);
  if (!r) return;
  const out = JSON.parse(r.stdout);
  const by = Object.fromEntries(out.phases.map(p => [p.slug, p]));
  assert.deepEqual(Object.keys(by).sort(), ['001-one', '002-two']);
  assert.deepEqual([by['001-one'].status, by['001-one'].priority, by['001-one'].branch], ['in_progress', 1, 'main']);
  assert.deepEqual([by['002-two'].status, by['002-two'].priority, by['002-two'].branch], ['pending', 0, 'main']);
  assert.deepEqual(out.findings, { foreign: [], untagged: [], ghost: [] });
  const s = oracle(t, f, 'scan.py', []);
  assert.match(s.stdout, /scanned: 3 phase\(s\); 0 \(re\)ingested, 0 file\(s\) missing/, 'Python finds no drift in what Node scanned');
});

test('Python new_phase.py after a Node create takes the next number (the db carries the Node seq)', t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'node-made');
  scanned(f.folder);
  const r = oracle(t, f, 'new_phase.py', ['--name', 'After', '--objective', 'o', '--summary', 's', '--depends-on', 'none']);
  if (!r) return;
  assert.match(r.stdout, /\(seq 2\)/);
});

test('Python archive.py on a Node-archived item is a no-op: the db row says archived', t => {
  const f = fixture(t);
  if (!oracle(t, f, 'new_phase.py', PY_ARGS)) return;
  const slug = readFileSync(join(f.folder, 'phases', '001-alpha.md'), 'utf8').match(/^phase: (\S+)/m)[1];
  mkdirSync(join(f.folder, 'archive', 'phases'), { recursive: true });
  renameSync(join(f.folder, 'phases', `${slug}.md`), join(f.folder, 'archive', 'phases', `${slug}.md`));
  scanned(f.folder, con => db.markArchived(con, slug, `archive/phases/${slug}.md`));
  const r = oracle(t, f, 'archive.py', ['1']);
  assert.match(r.stdout, /already archived \(archive\/phases\/001-alpha\.md\)/);
});

// ---------------------------------------------------------------- stale rows after sync.commit renumbers

test('scan(db, folder, renumbered): rows of renumbered items are replaced by the rescan and the fixed db is pushed', async t => {
  const dir = scratch(t);
  const home = sharedBacklog(dir);
  const bare = join(dir, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git');
  const home2 = join(dir, 'home2');
  git(dir, 'clone', '-q', bare, home2);
  const folder = join(home, 'acme', 'demo'); const folder2 = join(home2, 'acme', 'demo');
  putItem(folder2, 1, 'alpha');                       // the other clone takes number 1 first (files only)
  await sync.commit(home2, folder2, 'new_phase.py --name alpha');
  putItem(folder, 1, 'beta');                         // this clone also took number 1 and mirrors it
  scanned(folder);
  const renumbered = await sync.commit(home, folder, 'new_phase.py --name beta');
  assert.deepEqual(renumbered, [[1, 2]]);
  assert.ok(existsSync(join(folder, 'phases', '002-beta.md')));
  let con = db.connect(folder);
  assert.deepEqual(rows(con, 'SELECT slug, seq FROM phase').map(r => [r.slug, r.seq]), [['001-beta', 1]], 'stale before the rescan');
  const s = db.scan(con, folder, renumbered);
  assert.equal(s.changed, 2);
  assert.deepEqual(rows(con, 'SELECT slug, seq, path FROM phase ORDER BY seq').map(r => [r.slug, r.seq, r.path]),
    [['001-alpha', 1, 'phases/001-alpha.md'], ['002-beta', 2, 'phases/002-beta.md']]);
  assert.equal(rows(con, "SELECT note FROM event WHERE event='file_missing'").length, 0);
  assert.equal(rows(con, "SELECT event FROM event WHERE event='renumbered'").length, 1);
  assert.equal(store.nextSeq(folder), 3);
  con.close();
  assert.deepEqual(await sync.commit(home, folder, 'rescan'), []);
  git(home2, 'pull', '-q', '--rebase');
  con = db.connect(folder2);
  assert.deepEqual(rows(con, 'SELECT slug FROM phase ORDER BY seq').map(r => r.slug), ['001-alpha', '002-beta']);
  con.close();
});

// ---------------------------------------------------------------- review fixes (job 9)

test('connect: refuses a symlinked folder and a symlinked backlog.db, and writes nothing through them', t => {
  const d = scratch(t);
  mkdirSync(join(d, 'outside'));
  symlinkSync(join(d, 'outside'), join(d, 'linked'));
  assert.throws(() => db.connect(join(d, 'linked')), /Symlink destination is unsupported/);
  assert.equal(existsSync(join(d, 'outside', 'backlog.db')), false);
  mkdirSync(join(d, 'real'));
  writeFileSync(join(d, 'elsewhere.db'), '');
  symlinkSync(join(d, 'elsewhere.db'), join(d, 'real', 'backlog.db'));
  assert.throws(() => db.connect(join(d, 'real')), /Symlink destination is unsupported/);
  assert.equal(readFileSync(join(d, 'elsewhere.db')).length, 0);
});

test('markArchived: refuses an absolute or ..-crossing location and leaves the row alone', t => {
  const d = inHome(t);
  putItem(d, 1, 'a');
  const con = db.connect(d);
  db.scan(con, d);
  for (const bad of ['../../outside.md', '/etc/outside.md', 'archive/../../outside.md', 'archive\\..\\..\\x.md']) {
    assert.throws(() => db.markArchived(con, '001-a', bad), /Unsafe path/, bad);
  }
  assert.deepEqual(rows(con, 'SELECT status, path FROM phase'), [{ status: 'pending', path: 'phases/001-a.md' }]);
  assert.equal(rows(con, "SELECT * FROM event WHERE event='archived'").length, 0);
  con.close();
});

test('scan(db, folder, renumbered): the renumbered row keeps its id and its earlier events; no other item inherits them', async t => {
  const dir = scratch(t);
  const home = sharedBacklog(dir);
  const bare = join(dir, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git');
  const home2 = join(dir, 'home2');
  git(dir, 'clone', '-q', bare, home2);
  const folder = join(home, 'acme', 'demo'); const folder2 = join(home2, 'acme', 'demo');
  putItem(folder2, 1, 'alpha');
  await sync.commit(home2, folder2, 'new_phase.py --name alpha');
  putItem(folder, 1, 'beta');
  let con = db.connect(folder);
  db.scan(con, folder);
  const betaId = rows(con, "SELECT id FROM phase WHERE slug='001-beta'")[0].id;
  con.close();
  const renumbered = await sync.commit(home, folder, 'new_phase.py --name beta');
  con = db.connect(folder); // the rebase replaced the tracked db file
  db.scan(con, folder, renumbered);
  assert.deepEqual(rows(con, "SELECT id, seq, path FROM phase WHERE slug='002-beta'"), [{ id: betaId, seq: 2, path: 'phases/002-beta.md' }]);
  const alphaId = rows(con, "SELECT id FROM phase WHERE slug='001-alpha'")[0].id;
  assert.notEqual(alphaId, betaId);
  const evOf = id => rows(con, 'SELECT event FROM event WHERE phase_id=? ORDER BY id', id).map(e => e.event);
  assert.deepEqual(evOf(alphaId), ['ingested']);
  assert.deepEqual(evOf(betaId), ['ingested', 'renumbered', 'reingested']);
  con.close();
});

test('scan: unsupported archive front matter cannot block the scan of the active items', t => {
  const d = inHome(t);
  putItem(d, 1, 'a');
  mkdirSync(join(d, 'archive', 'phases'), { recursive: true });
  writeFileSync(join(d, 'archive', 'phases', '002-bad.md'), '---\nphase: 002-bad\nnested:\n  key: 1\n---\nbody\n');
  scanned(d, (con, s) => {
    assert.deepEqual(s, { handoff: 0, phases: 1, changed: 1, missing: 0 });
    assert.deepEqual(rows(con, 'SELECT slug FROM phase').map(r => r.slug), ['001-a']);
  });
});

test('review P2: reconciliation rebuilds missing archive rows and refreshes archive file hashes', t => {
  const d = inHome(t);
  putItem(d, 1, 'archived', { status: 'archived' }, 'archive/phases/001-archived.md');
  db.reconcileFolders([d], []);
  const check = () => {
    const con = db.connect(d);
    try {
      const row = con.prepare("SELECT status, path, sha, summary FROM phase WHERE slug='001-archived'").get();
      assert.ok(row, 'reconciliation visits archive/');
      const item = store.load(d)[0];
      assert.deepEqual({ ...row }, { status: 'archived', path: item.path, sha: item.sha256, summary: item.fm.summary });
    } finally { con.close(); }
  };
  check();
  putItem(d, 1, 'archived', { status: 'archived', summary: 'reconciled archive content' }, 'archive/phases/001-archived.md');
  db.reconcileFolders([d], []);
  check();
});

test('review P2: recovery renumbers an archived mirror row in place, retaining its event identity', t => {
  const d = inHome(t);
  putItem(d, 1, 'archived', { status: 'archived' }, 'archive/phases/001-archived.md');
  db.reconcileFolders([d], []);
  const con = db.connect(d);
  try {
    const id = con.prepare("SELECT id FROM phase WHERE slug='001-archived'").get().id;
    db.logEvent(con, 'archived', { phaseId: id, handoffId: db.ensureAnchor(con), note: 'keep this identity' });
    renameSync(join(d, 'archive/phases/001-archived.md'), join(d, 'archive/phases/002-archived.md'));
    putItem(d, 2, 'archived', { status: 'archived' }, 'archive/phases/002-archived.md');
    db.scan(con, d, [[1, 2]], { includeArchived: true });
    assert.deepEqual(rows(con, 'SELECT id, slug, path FROM phase'), [{ id, slug: '002-archived', path: 'archive/phases/002-archived.md' }]);
    assert.deepEqual(rows(con, "SELECT phase_id FROM event WHERE event='archived'"), [{ phase_id: id }]);
  } finally { con.close(); }
});

test('scan: an active item that is a symlink is still refused', t => {
  const d = inHome(t);
  mkdirSync(join(d, 'phases'), { recursive: true });
  writeFileSync(join(d, 'outside.md'), '---\nphase: x\n---\n');
  symlinkSync(join(d, 'outside.md'), join(d, 'phases', '001-x.md'));
  const con = db.connect(d);
  assert.throws(() => db.scan(con, d), /Symlink destination is unsupported/);
  con.close();
});

test('node:sqlite warning filter drops only an ExperimentalWarning that mentions SQLite; other warnings stay visible', () => {
  const d = mkdtempSync(join(tmpdir(), 'db-warn-'));
  try {
    const script = `
      const seen = [];
      process.emitWarning = (w, ...a) => seen.push([typeof w === 'string' ? w : w.message, typeof a[0] === 'string' ? a[0] : a[0]?.type]);
      const real = process.getBuiltinModule;
      process.getBuiltinModule = id => {
        process.emitWarning('SQLite is an experimental feature', 'ExperimentalWarning');
        process.emitWarning('sqlite thing is deprecated', 'DeprecationWarning');
        process.emitWarning('another experimental feature', 'ExperimentalWarning');
        return real.call(process, id);
      };
      const m = await import(process.argv[1]);
      m.connect(process.argv[2]).close();
      console.log(JSON.stringify(seen));`;
    const r = spawnSync(process.execPath, ['-e', script, DB, join(d, 'acme', 'demo')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [['sqlite thing is deprecated', 'DeprecationWarning'], ['another experimental feature', 'ExperimentalWarning']]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('review P1: connect refuses a symlinked owner folder (<home>/<owner>) before any database is created or migrated outside', t => {
  const d = scratch(t);
  mkdirSync(join(d, 'home'));
  mkdirSync(join(d, 'outside'));
  symlinkSync(join(d, 'outside'), join(d, 'home', 'acme'));
  assert.throws(() => db.connect(join(d, 'home', 'acme', 'demo')), /Symlink destination is unsupported/);
  assert.deepEqual(readdirSync(join(d, 'outside')), [], 'no folder and no database outside the backlog clone');
});

test('undoOnThrow puts back only what the command wrote: a file that appears meanwhile (a pull) is not deleted', async t => {
  const dir = scratch(t);
  const folder = join(dir, 'o', 'n'); mkdirSync(join(folder, 'phases'), { recursive: true });
  const con = db.connect(folder);
  const mine = join(folder, 'phases', '001-mine.md'); const pulled = join(folder, 'phases', '002-pulled.md'); const edited = join(folder, 'phases', '003-edited.md');
  writeFileSync(edited, '---\nphase: 003-edited\nseq: 3\n---\nold\n');
  await assert.rejects(db.undoOnThrow(con, folder, async () => {
    store.write({ path: mine, fm: { phase: '001-mine', seq: 1 }, body: 'x\n' }, folder);
    store.write({ path: edited, fm: { phase: '003-edited', seq: 3 }, body: 'new\n' }, folder);
    writeFileSync(pulled, 'pulled by someone else\n');
    throw new Error('boom');
  }), /boom/);
  con.close();
  assert.equal(existsSync(mine), false, 'the file it created is removed');
  assert.match(readFileSync(edited, 'utf8'), /old/, 'the file it changed is restored');
  assert.equal(readFileSync(pulled, 'utf8'), 'pulled by someone else\n', 'a file it did not write stays');
});

test('review P2: replay resolves reused row ids in their own database snapshots', t => {
  const folder = inHome(t);
  const snapshots = join(scratch(t), 'snapshots'); mkdirSync(snapshots);
  const base = join(snapshots, 'base.db'); const local = join(snapshots, 'local.db');
  putItem(folder, 1, 'departed');
  let con = db.connect(folder); db.scan(con, folder);
  const oldId = con.prepare("SELECT id FROM phase WHERE slug='001-departed'").get().id;
  db.logEvent(con, 'note', { phaseId: oldId, note: 'BASE_HISTORY' });
  con.close(); cpSync(join(folder, 'backlog.db'), base);
  con = db.connect(folder); con.prepare('DELETE FROM phase WHERE id=?').run(oldId); con.close();
  renameSync(join(folder, 'phases', '001-departed.md'), join(snapshots, 'departed.md'));
  putItem(folder, 2, 'replacement');
  con = db.connect(folder); db.scan(con, folder);
  const newId = con.prepare("SELECT id FROM phase WHERE slug='002-replacement'").get().id;
  assert.equal(newId, oldId, 'SQLite reuses the deleted maximum row id');
  db.logEvent(con, 'note', { phaseId: newId, note: 'LOCAL_REPLACEMENT_HISTORY' });
  con.close(); cpSync(join(folder, 'backlog.db'), local);
  cpSync(base, join(folder, 'backlog.db')); // upstream still has the departed item
  db.reconcileFolders([folder], Object.assign([], { localDbs: [{ folder, local, base }] }));
  con = db.connect(folder);
  try {
    const events = rows(con, "SELECT p.slug, e.note FROM event e LEFT JOIN phase p ON p.id=e.phase_id WHERE e.event='note' ORDER BY e.note");
    assert.deepEqual(events, [
      { slug: null, note: 'BASE_HISTORY' },
      { slug: '002-replacement', note: 'LOCAL_REPLACEMENT_HISTORY' },
    ]);
  } finally { con.close(); }
});
