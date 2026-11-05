// Tests for src/shared/db.js — cli-parity job 9 (the backlog.db mirror with node:sqlite).
// Local bare repositories only (shared-fixtures.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKLOG_NAME, BACKLOG_OWNER, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
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

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'db-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [k, v] of Object.entries(GIT_IDENTITY)) { const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; }); }
  return dir;
}
// A folder in the <home>/<owner>/<name> layout, as the containment check of connect expects.
const inHome = t => { const d = join(scratch(t), 'acme', 'demo'); mkdirSync(d, { recursive: true }); return d; };
// An item file as `backlog new` writes it (its front matter order).
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

// ---------------------------------------------------------------- connect / migrate / anchor

test('connect opens a per-clone cache under the state folder and rebuilds it from the files', t => {
  const folder = inHome(t);
  const home = dirname(dirname(folder));
  putItem(folder, 1, 'a');
  putItem(folder, 2, 'b');
  const con = db.connect(folder);
  try { assert.deepEqual(rows(con, 'SELECT seq FROM phase ORDER BY seq').map(r => r.seq), [1, 2]); } finally { con.close(); }
  assert.ok(existsSync(join(store.stateDir(home), 'cache', 'acme--demo.db')));
  assert.ok(!existsSync(join(folder, 'backlog.db')), 'nothing is written into the item folder');
  rmSync(join(folder, 'phases', '002-b.md'));
  const again = db.connect(folder);
  try { assert.deepEqual(rows(again, 'SELECT seq FROM phase').map(r => r.seq), [1], 'a deleted file is gone from the cache: no ghost rows'); } finally { again.close(); }
});

test('a read-only connect rebuilds in memory and creates no cache file', t => {
  const folder = inHome(t);
  const home = dirname(dirname(folder));
  putItem(folder, 1, 'a');
  const con = db.connect(folder, { readOnly: true });
  try { assert.equal(rows(con, 'SELECT COUNT(*) AS n FROM phase')[0].n, 1); } finally { con.close(); }
  assert.ok(!existsSync(join(store.stateDir(home), 'cache')));
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

test('ingest: missing keys take the defaults (seq 0, status pending, priority 50, slug from the file name)', t => {
  const d = inHome(t);
  const con = db.connect(d);
  store.write({ path: join(d, 'phases', '009-bare.md'), fm: { name: 'Bare' }, body: 'x\n' });
  db.ingest(con, store.load(d)[0]);
  const r = rows(con, 'SELECT slug, seq, status, severity, priority, branch, repository, size_score, completed_at FROM phase')[0];
  assert.deepEqual(r, { slug: '009-bare', seq: 0, status: 'pending', severity: 'normal', priority: 50, branch: '', repository: '', size_score: 0, completed_at: null });
  con.close();
});

test('connect ingests phases/ and archive/; a later scan of the active items changes nothing', t => {
  const d = inHome(t);
  putItem(d, 1, 'a'); putItem(d, 2, 'b');
  putItem(d, 3, 'old', { status: 'archived' }, 'archive/phases/003-old.md');
  scanned(d, (con, s) => {
    assert.deepEqual(s, { handoff: 0, phases: 2, changed: 0, missing: 0 });
    assert.deepEqual(rows(con, 'SELECT slug FROM phase ORDER BY id').map(r => r.slug), ['001-a', '002-b', '003-old']);
    assert.deepEqual(db.scan(con, d), { handoff: 0, phases: 2, changed: 0, missing: 0 });
    assert.equal(rows(con, 'SELECT * FROM event').length, 3);
  });
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

// ---------------------------------------------------------------- stale rows after sync.commit renumbers

// ---------------------------------------------------------------- review fixes (job 9)

test('connect: refuses a symlinked folder and writes nothing through it', t => {
  const d = scratch(t);
  mkdirSync(join(d, 'outside'));
  symlinkSync(join(d, 'outside'), join(d, 'linked'));
  assert.throws(() => db.connect(join(d, 'linked')), /Symlink destination is unsupported/);
  assert.deepEqual(readdirSync(join(d, 'outside')), []);
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

test('connect: an item that is a symlink is refused', t => {
  const d = inHome(t);
  mkdirSync(join(d, 'phases'), { recursive: true });
  writeFileSync(join(d, 'outside.md'), '---\nphase: x\n---\n');
  symlinkSync(join(d, 'outside.md'), join(d, 'phases', '001-x.md'));
  assert.throws(() => db.connect(d), /Symlink destination is unsupported/);
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
