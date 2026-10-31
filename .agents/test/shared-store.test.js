// Tests for src/shared/store.js — cli-parity job 5 (STORE: home, repository folder, items, numbers, priorities).
// Local bare repositories only (shared-fixtures.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, consumer, env, sharedBacklog } from './shared-fixtures.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';

const STORE = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'shared', 'store.js'));

const tmp = () => mkdtempSync(join(tmpdir(), 'store-test-'));
const sha256File = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const readItem = (folder, rel) => readFileSync(join(folder, rel), 'utf8');

function scratch(t) {
  const dir = tmp();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function withEnv(t, vars) {
  const old = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  t.after(() => { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}

const item = (n, extra = {}) => ({
  phase: `00${n}-i${n}`, seq: n, name: `I${n}`, status: 'pending', repository: 'acme/demo', branch: 'main', priority: n - 1, ...extra,
});
function putItem(folder, fm, rel = `phases/${fm.phase}.md`) {
  store.write({ path: join(folder, rel), fm, body: `Body ${fm.phase}.\n` });
}

// ---------------------------------------------------------------- resolveHome

test('resolveHome: BACKLOG_HOME > home record > ~/git/smoothsdlc-backlog; a missing home is tagged exit 4 with the ASK text, never cloned', t => {
  const d = scratch(t);
  const homeA = join(d, 'homeA'); const homeB = join(d, 'homeB');
  mkdirSync(homeA); mkdirSync(homeB);
  mkdirSync(join(d, 'config', 'smoothsdlc-backlog'), { recursive: true });
  withEnv(t, { HOME: join(d, 'home'), XDG_CONFIG_HOME: join(d, 'config'), BACKLOG_HOME: homeA });
  assert.deepEqual(store.resolveHome(), { home: realpathSync(homeA), ask: null });
  delete process.env.BACKLOG_HOME;
  writeFileSync(join(d, 'config', 'smoothsdlc-backlog', 'home'), `${homeB}\n`);
  assert.deepEqual(store.resolveHome(), { home: realpathSync(homeB), ask: null });
  rmSync(join(d, 'config', 'smoothsdlc-backlog', 'home'));
  const dflt = join(d, 'home', 'git', 'smoothsdlc-backlog');
  const missing = store.resolveHome();
  assert.equal(missing.home, dflt, 'the default location');
  assert.equal(missing.ask.code, 4);
  assert.equal(missing.ask.text,
    `the backlog repository is not at ${dflt}. ASK THE USER: where is the local clone of SmoothSDLC/smoothsdlc-backlog, `
    + `or should it be cloned to ${dflt}? Then run 'backlog setup' in this repository (it clones it beside the repository) or `
    + `'backlog setup --ask' (it asks for the path), and run this command again.`, 'item 043: the answer is backlog setup');
  assert.equal(existsSync(dflt), false, 'never clones');
  mkdirSync(dflt, { recursive: true });
  assert.deepEqual(store.resolveHome(), { home: realpathSync(dflt), ask: null });
});

// ---------------------------------------------------------------- getMode / setMode

test('getMode/setMode: mode.json in $XDG_CONFIG_HOME (or ~/.config), exactly one JSON object, absent means local', t => {
  const d = scratch(t);
  withEnv(t, { HOME: join(d, 'home'), XDG_CONFIG_HOME: join(d, 'config') });
  const file = join(d, 'config', 'smooth-backlog-cli', 'mode.json');
  assert.equal(store.getMode(), 'local');
  store.setMode('shared');
  assert.equal(readFileSync(file, 'utf8'), '{"mode":"shared"}');
  assert.equal(store.getMode(), 'shared');
  store.setMode('local');
  assert.equal(readFileSync(file, 'utf8'), '{"mode":"local"}');
  assert.equal(store.getMode(), 'local');
  writeFileSync(file, 'not json');
  assert.equal(store.getMode(), 'local', 'an unreadable record means local');
  delete process.env.XDG_CONFIG_HOME;
  store.setMode('shared');
  assert.equal(readFileSync(join(d, 'home', '.config', 'smooth-backlog-cli', 'mode.json'), 'utf8'), '{"mode":"shared"}');
  assert.throws(() => store.setMode('team'), /mode/);
});

// ---------------------------------------------------------------- folder / repoId / branch

test('folder(home, repoId): <home>/<owner>/<name>', () => {
  assert.equal(store.folder('/srv/home', 'SmoothSDLC/demo'), join('/srv/home', 'SmoothSDLC', 'demo'));
});

test('repoId: owner/name of the origin; a worktree maps to it; refused without an origin or outside git', t => {
  const d = scratch(t);
  const cons = consumer(d, 'acme', 'demo', 'main');
  const e = { ...process.env, ...env(d) };
  assert.equal(store.repoId(cons), 'acme/demo');
  const wt = join(d, 'wt');
  execFileSync('git', ['-C', cons, 'worktree', 'add', '-q', '-b', 'dev', wt], { env: e });
  assert.equal(store.repoId(wt), 'acme/demo');
  const noOrigin = join(d, 'noorigin');
  mkdirSync(noOrigin);
  execFileSync('git', ['init', '-q'], { cwd: noOrigin, env: e });
  assert.throws(() => store.repoId(noOrigin), /no remote 'origin'/);
  const plain = join(d, 'plain');
  mkdirSync(plain);
  assert.throws(() => store.repoId(plain), /inside a git repository/);
});

test('branch: the checked-out branch; a detached HEAD is refused', t => {
  const d = scratch(t);
  const cons = consumer(d, 'acme', 'demo', 'main');
  const e = { ...process.env, ...env(d) };
  assert.equal(store.branch(cons), 'main');
  execFileSync('git', ['checkout', '-q', '-b', 'dev'], { cwd: cons, env: e });
  assert.equal(store.branch(cons), 'dev');
  execFileSync('git', ['checkout', '-q', '--detach'], { cwd: cons, env: e });
  assert.throws(() => store.branch(cons), /HEAD is detached; check out the branch the item belongs to first/);
});

// ---------------------------------------------------------------- load / write

test('load: phases/*.md and archive/**/*.md with path, fm, body, sha256 (sha aliases it); a missing folder is empty', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(1));
  putItem(folder, item(2, { status: 'in_progress' }));
  putItem(folder, item(3, { status: 'archived' }), 'archive/phases/003-i3.md');
  writeFileSync(join(folder, 'phases', 'notes.txt'), 'not an item');
  const items = store.load(folder);
  assert.deepEqual(items.map(i => i.path), ['phases/001-i1.md', 'phases/002-i2.md', 'archive/phases/003-i3.md']);
  const [a] = items;
  assert.equal(a.fm.seq, 1);
  assert.equal(a.body, 'Body 001-i1.\n');
  assert.equal(a.sha256, sha256File(join(folder, 'phases/001-i1.md')));
  assert.equal(a.sha, a.sha256);
  assert.deepEqual(store.load(join(d, 'nowhere')), []);
});

test('write: atomic, mode 0o600, parent folders created, no temp file left, key order preserved on rewrite', t => {
  const d = scratch(t);
  const abs = join(d, 'acme', 'demo', 'phases', '009-new.md');
  const fm = item(9, { phase: '009-new', priority: 0 });
  store.write({ path: abs, fm, body: 'New body.\n' });
  const parsed = parse(readFileSync(abs, 'utf8'));
  assert.deepEqual(parsed.fm, fm);
  assert.equal(parsed.body, 'New body.\n');
  assert.equal(statSync(abs).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dirname(abs)), ['009-new.md']);
  const orig = readFileSync(abs, 'utf8');
  store.write({ path: abs, fm: { ...parsed.fm, priority: 4 }, body: parsed.body });
  assert.equal(readFileSync(abs, 'utf8'), orig.replace(/^priority: .*$/m, 'priority: 4'));
});

// ---------------------------------------------------------------- nextSeq

test('nextSeq: 1 on an empty folder; 1 + max of the file seqs (phases and archive) and of backlog.db; stderr stays clean', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  assert.equal(store.nextSeq(folder), 1);
  putItem(folder, item(1));
  putItem(folder, item(2, { status: 'archived' }), 'archive/phases/002-i2.md');
  assert.equal(store.nextSeq(folder), 3, 'archive counts');
  const db = new DatabaseSync(join(folder, 'backlog.db'));
  db.exec('CREATE TABLE phase (id INTEGER PRIMARY KEY, seq INTEGER); INSERT INTO phase (seq) VALUES (5)');
  db.close();
  assert.equal(store.nextSeq(folder), 6, 'MAX(seq) of backlog.db wins when higher');
  const r = spawnSync(process.execPath, ['-e', 'const s = await import(process.argv[1]); process.stdout.write(String(s.nextSeq(process.argv[2])));', STORE, folder],
    { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '', 'node:sqlite prints no ExperimentalWarning to stderr');
  assert.equal(r.stdout, '6');
});

// ---------------------------------------------------------------- reflow / reorder

test('reflow: the target is clamped to 0..len(rest); zero priorities are not rewritten', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  for (const n of [1, 2, 3]) putItem(folder, item(n));
  const sha = rel => sha256File(join(folder, rel));
  const first = sha('phases/001-i1.md');
  assert.deepEqual(store.reflow(folder), [['001-i1', 0], ['002-i2', 1], ['003-i3', 2]]);
  assert.equal(sha('phases/001-i1.md'), first, 'priority 0 at rank 0 is already right');
  assert.deepEqual(store.reflow(folder, { slug: '001-i1', target: 99 }).map(x => x[0]), ['002-i2', '003-i3', '001-i1']);
  assert.deepEqual(store.reflow(folder, { slug: '003-i3', target: -3 }).map(x => x[0]), ['003-i3', '002-i2', '001-i1']);
});

test('reflow: only pending/in_progress items of ALL branches are ranked; done and archived are left alone', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(1, { priority: 7 }));
  putItem(folder, item(2, { branch: 'dev', priority: 9 }));
  putItem(folder, item(3, { status: 'done', priority: 5 }));
  putItem(folder, item(4, { status: 'archived', priority: 5 }), 'archive/phases/004-i4.md');
  const doneSha = sha256File(join(folder, 'phases/003-i3.md'));
  assert.deepEqual(store.reflow(folder), [['001-i1', 0], ['002-i2', 1]]);
  assert.match(readItem(folder, 'phases/002-i2.md'), /^priority: 1$/m);
  assert.equal(sha256File(join(folder, 'phases/003-i3.md')), doneSha);
});

// ---------------------------------------------------------------- inQueue / findings / now

test('inQueue: only the exact repository and branch match; missing fields never match', () => {
  const it = { fm: { repository: 'acme/demo', branch: 'main' } };
  assert.equal(store.inQueue(it, 'acme/demo', 'main'), true);
  assert.equal(store.inQueue(it, 'acme/demo', 'dev'), false);
  assert.equal(store.inQueue(it, 'acme/other', 'main'), false);
  assert.equal(store.inQueue({ fm: { branch: 'main' } }, 'acme/demo', 'main'), false);
  assert.equal(store.inQueue({ fm: {} }, '', ''), true, 'both sides empty compare equal, as in_queue does');
});

test('findings: a foreign and an untagged item are flagged, archived items are not', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(1));
  putItem(folder, item(2, { repository: 'acme/other' }));
  const untagged = item(3); delete untagged.branch;
  putItem(folder, untagged);
  putItem(folder, item(4, { repository: 'acme/other', status: 'archived' }), 'archive/phases/004-i4.md');
  const noRepo = item(5, { repository: '' });
  putItem(folder, noRepo);
  const fd = store.findings(folder);
  assert.deepEqual(Object.keys(fd), ['foreign', 'untagged', 'ghost']);
  assert.deepEqual(fd.foreign.map(i => i.fm.phase), ['002-i2']);
  assert.deepEqual(fd.untagged.map(i => i.fm.phase), ['003-i3', '005-i5']);
  assert.deepEqual(fd.ghost, []);
});

test('now(): second-precision UTC with a Z suffix', () => {
  const n = store.now();
  assert.match(n, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(Math.abs(Date.now() - new Date(n).getTime()) < 5000);
});

// ---------------------------------------------------------------- review fixes (Codex review 2026-10-23, job 5)

function link(t, target, path) {
  try { symlinkSync(target, path); } catch (e) { t.skip(`cannot create a symlink here: ${e.code}`); return false; }
  return true;
}

test('review P1: a symlinked phases/ folder, archive subfolder or item file is refused by load, reflow, nextSeq and write; nothing outside is touched', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  const outside = join(d, 'outside');
  putItem(outside, item(1, { priority: 5 }), '001-i1.md');
  const victim = join(outside, '001-i1.md');
  const before = sha256File(victim);
  mkdirSync(folder, { recursive: true });
  if (!link(t, outside, join(folder, 'phases'))) return;
  assert.throws(() => store.load(folder), /Symlink/);
  assert.throws(() => store.reflow(folder), /Symlink/);
  assert.throws(() => store.reorder(folder, ['1']), /Symlink/);
  assert.throws(() => store.nextSeq(folder), /Symlink/);
  assert.throws(() => store.findings(folder), /Symlink/);
  assert.throws(() => store.write({ path: join(folder, 'phases', '002-new.md'), fm: item(2), body: '' }), /Symlink/);
  assert.throws(() => store.write({ path: victim, fm: item(1), body: '' }, folder), /Unsafe path/, 'an explicit root still contains the path');
  assert.equal(sha256File(victim), before, 'the file outside the backlog is unchanged');
  assert.deepEqual(readdirSync(outside), ['001-i1.md'], 'nothing was created outside');

  // archive/<sub> symlinked, and an item file symlinked inside a real phases/
  const folder2 = join(d, 'acme', 'demo2');
  mkdirSync(join(folder2, 'phases'), { recursive: true });
  mkdirSync(join(folder2, 'archive'), { recursive: true });
  if (!link(t, outside, join(folder2, 'archive', 'phases'))) return;
  assert.throws(() => store.load(folder2), /Symlink/);
  rmSync(join(folder2, 'archive', 'phases'));
  if (!link(t, victim, join(folder2, 'phases', '001-i1.md'))) return;
  assert.throws(() => store.load(folder2), /Symlink/);
  assert.throws(() => store.write({ path: join(folder2, 'phases', '001-i1.md'), fm: item(1), body: 'x' }), /Symlink/);
  assert.equal(sha256File(victim), before);
});

test('review P1: only a missing folder reads as empty; any other listing failure propagates (a file where a folder belongs stands in for a denied read: tests run as root)', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(7, { phase: '007-i7' }), 'archive/phases/007-i7.md'); // the number a swallowed phases/ error would let nextSeq reuse
  writeFileSync(join(folder, 'phases'), 'not a folder');
  assert.throws(() => store.load(folder), { code: 'ENOTDIR' });
  assert.throws(() => store.nextSeq(folder), { code: 'ENOTDIR' });
  assert.throws(() => store.reflow(folder), { code: 'ENOTDIR' });
  rmSync(join(folder, 'phases'));
  mkdirSync(join(folder, 'phases'));
  rmSync(join(folder, 'archive'), { recursive: true });
  writeFileSync(join(folder, 'archive'), 'not a folder');
  assert.throws(() => store.load(folder), { code: 'ENOTDIR' });
  assert.throws(() => store.nextSeq(folder), { code: 'ENOTDIR' });
  rmSync(join(folder, 'archive'));
  assert.deepEqual(store.load(folder), [], 'both folders missing is an empty result');
  assert.equal(store.nextSeq(folder), 1);
});

function mirrorDb(folder, rows) {
  mkdirSync(folder, { recursive: true });
  const db = new DatabaseSync(join(folder, 'backlog.db'));
  db.exec('CREATE TABLE phase (id INTEGER PRIMARY KEY, slug TEXT, seq INTEGER, status TEXT, path TEXT, repository TEXT, branch TEXT)');
  const ins = db.prepare('INSERT INTO phase (slug, seq, status, path, repository, branch) VALUES (?, ?, ?, ?, ?, ?)');
  for (const r of rows) ins.run(r.slug, r.seq, r.status, r.path, 'acme/demo', 'main');
  db.close();
}

test('review P2: findings reports ghost rows (a non-archived mirror row whose file is gone) without modifying the database', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(1));
  mirrorDb(folder, [
    { slug: '001-i1', seq: 1, status: 'pending', path: 'phases/001-i1.md' },
    { slug: '002-gone', seq: 2, status: 'in_progress', path: 'phases/002-gone.md' },
    { slug: '003-gone-archived', seq: 3, status: 'archived', path: 'archive/phases/003-gone-archived.md' },
    { slug: '004-null-status', seq: 4, status: null, path: 'phases/004-null-status.md' },
  ]);
  const dbBefore = sha256File(join(folder, 'backlog.db'));
  const files = readdirSync(folder).sort();
  assert.deepEqual(store.findings(folder).ghost.map(r => r.slug), ['002-gone']);
  assert.equal(store.findings(folder).ghost[0].path, 'phases/002-gone.md');
  assert.equal(sha256File(join(folder, 'backlog.db')), dbBefore, 'the database is read-only here');
  assert.deepEqual(readdirSync(folder).sort(), files, 'no journal or other file appears');
  assert.deepEqual(store.findings(join(d, 'acme', 'none')).ghost, [], 'no database, no ghosts');
});

test('review P2: an explicit status: null is kept (not defaulted to pending): the item is neither ranked, rewritten nor flagged', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(1, { priority: 4 }));
  putItem(folder, item(2, { status: null, priority: 9 }));
  const untaggedNull = item(3, { status: null }); delete untaggedNull.branch;
  putItem(folder, untaggedNull);
  putItem(folder, { phase: '004-i4', seq: 4, name: 'I4', repository: 'acme/demo', branch: 'main' }); // absent status and priority: the mirror defaults
  const nullSha = sha256File(join(folder, 'phases/002-i2.md'));
  assert.deepEqual(store.reflow(folder), [['001-i1', 0], ['004-i4', 1]]);
  assert.deepEqual(store.reorder(folder, ['002-i2', '004-i4']), [['004-i4', 0], ['001-i1', 1]]);
  assert.equal(sha256File(join(folder, 'phases/002-i2.md')), nullSha, 'the null-status item is not rewritten');
  assert.deepEqual(store.findings(folder).untagged.map(i => i.fm.phase), [], 'NOT IN (...) never matches a NULL status');
});

test('review P2: a quoted numeric priority already at its rank is left alone (int(priority) comparison)', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(1, { priority: '0' }));
  putItem(folder, item(2, { priority: ' 1 ' }));
  putItem(folder, item(3, { priority: '9' }));
  const sha = rel => sha256File(join(folder, rel));
  const [a, b, c] = ['phases/001-i1.md', 'phases/002-i2.md', 'phases/003-i3.md'].map(sha);
  assert.deepEqual(store.reflow(folder), [['001-i1', 0], ['002-i2', 1], ['003-i3', 2]]);
  assert.equal(sha('phases/001-i1.md'), a, '"0" at rank 0: same bytes');
  assert.equal(sha('phases/002-i2.md'), b, '" 1 " at rank 1: same bytes');
  assert.notEqual(sha('phases/003-i3.md'), c, '"9" at rank 2 is rewritten');
  assert.match(readItem(folder, 'phases/003-i3.md'), /^priority: 2$/m);
});

// ---------------------------------------------------------------- review fixes (Codex review 2026-10-23, job 5, second review)

test('review P1: a symlinked repository folder or owner folder is refused from the home by load, reflow, nextSeq, findings and write; nothing outside is touched', t => {
  for (const owner of [true, false]) {
    const d = scratch(t);
    const outside = join(d, 'outside');
    putItem(outside, item(1, { priority: 5 }), owner ? 'demo/phases/001-i1.md' : 'phases/001-i1.md');
    const victim = join(outside, owner ? 'demo/phases/001-i1.md' : 'phases/001-i1.md');
    const before = sha256File(victim);
    mkdirSync(join(d, 'home', 'acme'), { recursive: true });
    if (!link(t, outside, join(d, 'home', owner ? 'acme-link' : 'acme/demo'))) return;
    const folder = owner ? join(d, 'home', 'acme-link', 'demo') : join(d, 'home', 'acme', 'demo');
    assert.throws(() => store.load(folder), /Symlink/);
    assert.throws(() => store.reflow(folder), /Symlink/);
    assert.throws(() => store.reorder(folder, ['1']), /Symlink/);
    assert.throws(() => store.nextSeq(folder), /Symlink/);
    assert.throws(() => store.findings(folder), /Symlink/);
    assert.throws(() => store.write({ path: join(folder, 'phases', '002-new.md'), fm: item(2), body: '' }, folder), /Symlink/);
    assert.equal(sha256File(victim), before, 'the file outside the backlog is unchanged');
    assert.deepEqual(readdirSync(join(outside, owner ? 'demo/phases' : 'phases')), ['001-i1.md'], 'nothing was created outside');
  }
});

// Three items made with `backlog new` in shared mode; returns their slugs (the file stem = the front-matter `phase`) and file names.
function fixturePair(t) {
  const dir = scratch(t);
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(dir, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t: dir, home, cons, folder: join(home, 'acme', 'demo') };
}
function threeItems(f) {
  for (const n of ['one', 'two', 'three']) {
    const r = cli(['new', '--name', n, '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
  const files = readdirSync(join(f.folder, 'phases')).filter(x => x.endsWith('.md')).sort();
  assert.equal(files.length, 3);
  return { files, slugs: files.map(x => x.replace(/\.md$/, '')) };
}
function archivedOutside(t) {
  const f = fixturePair(t);
  const s = threeItems(f);
  mkdirSync(join(f.folder, 'archive', 'phases'), { recursive: true });
  renameSync(join(f.folder, 'phases', s.files[1]), join(f.folder, 'archive', 'phases', s.files[1]));
  return { f, s };
}

test('075: archive reflows the queue: archiving the last item is a no-op; archiving a middle one re-densifies and rewrites', t => {
  // no-op: archive the last item (003); the survivors (001 at P0, 002 at P1) are already dense, so no file is rewritten
  const a = fixturePair(t);
  threeItems(a);
  const sha = rel => sha256File(join(a.folder, rel));
  const before = ['phases/001-one.md', 'phases/002-two.md'].map(sha);
  const ra = cli(['archive', '3', '--force'], { cwd: a.cons, tmp: a.t });
  assert.equal(ra.status, 0, ra.stdout + ra.stderr);
  assert.equal(ra.stdout, '📦 003-three archived -> archive/phases/003-three.md\n   rescan: 0 (re)ingested, 0 missing\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
  assert.equal(ra.stderr, '');
  assert.deepEqual(['phases/001-one.md', 'phases/002-two.md'].map(sha), before, 'a no-op reflow rewrites no file');

  // re-densify: archive a middle item (002); 003 is pulled down from P2 to P1 and its file is rewritten
  const b = fixturePair(t);
  threeItems(b);
  const rb = cli(['archive', '2', '--force'], { cwd: b.cons, tmp: b.t });
  assert.equal(rb.status, 0, rb.stdout + rb.stderr);
  assert.equal(rb.stdout, '📦 002-two archived -> archive/phases/002-two.md\n   rescan: 0 (re)ingested, 0 missing\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
  assert.equal(rb.stderr, '');
  assert.match(readItem(b.folder, 'phases/003-three.md'), /^priority: 1$/m, '003 is re-densified from P2 to P1');
  assert.ok(!existsSync(join(b.folder, 'phases', '002-two.md')), '002 left phases/');
  assert.ok(existsSync(join(b.folder, 'archive', 'phases', '002-two.md')), '002 is in archive/');
});

test('075: replan: slugs and item numbers lead, the rest keeps its order, unknown idents are skipped', t => {
  const f = fixturePair(t);
  const s = threeItems(f);
  const { slugs } = s;
  // slug, then number 1 = the first item
  let r = cli(['update', '--replan', `${slugs[2]},1`], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, `📋 PLANNING EVENT — backlog re-prioritized (P0 = next):\n   P0  ${slugs[2]}\n   P1  ${slugs[0]}\n   P2  ${slugs[1]}\n`);
  assert.match(readItem(f.folder, `phases/${slugs[2]}.md`), /^priority: 0$/m);
  // unknown ident skipped, a repeated ident leads once
  r = cli(['update', '--replan', `999,${slugs[1]},${slugs[1]}`], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, `📋 PLANNING EVENT — backlog re-prioritized (P0 = next):\n   P0  ${slugs[1]}\n   P1  ${slugs[2]}\n   P2  ${slugs[0]}\n`);
  // zero-padded numbers resolve
  r = cli(['update', '--replan', '003'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, `📋 PLANNING EVENT — backlog re-prioritized (P0 = next):\n   P0  ${slugs[2]}\n   P1  ${slugs[1]}\n   P2  ${slugs[0]}\n`);
  assert.match(readItem(f.folder, `phases/${slugs[0]}.md`), /^priority: 2$/m);
});

test('review P2: reflow keeps the rank of a row whose file was moved to archive/ outside the CLI', t => {
  const x = archivedOutside(t);
  const { f, s } = x;
  const live = sha256File(join(f.folder, 'phases', s.files[2]));
  assert.deepEqual(store.reflow(f.folder), s.slugs.map((n, i) => [n, i]), 'the archived item still holds P1: the last item stays P2');
  assert.equal(sha256File(join(f.folder, 'phases', s.files[2])), live, 'no live file is rewritten');
});

test('075: reflow: a row whose file was moved to archive/ outside the CLI keeps its rank: the item after it stays P2 when the CLI archives the last item', t => {
  const f = fixturePair(t);
  const s = threeItems(f);
  const four = cli(['new', '--name', 'four', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t });
  assert.equal(four.status, 0, four.stdout + four.stderr);
  mkdirSync(join(f.folder, 'archive', 'phases'), { recursive: true });
  renameSync(join(f.folder, 'phases', s.files[1]), join(f.folder, 'archive', 'phases', s.files[1])); // 002-two leaves phases/ outside the CLI
  const one = sha256File(join(f.folder, 'phases', s.files[0]));
  const three = sha256File(join(f.folder, 'phases', s.files[2]));
  const r = cli(['archive', '4', '--force'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, '📦 004-four archived -> archive/phases/004-four.md\n   rescan: 0 (re)ingested, 1 missing\n   📋 planning event: backlog re-densified to 3 item(s) (P0..P2)\n');
  assert.match(readItem(f.folder, 'phases/001-one.md'), /^priority: 0$/m, 'the survivor keeps its rank');
  assert.match(readItem(f.folder, 'phases/003-three.md'), /^priority: 2$/m, 'the item after the missing row stays P2: the missing row held P1');
  assert.equal(sha256File(join(f.folder, 'phases', s.files[0])), one, 'no live file is rewritten');
  assert.equal(sha256File(join(f.folder, 'phases', s.files[2])), three, 'no live file is rewritten');
  assert.ok(!existsSync(join(f.folder, 'phases', '004-four.md')), '004 left phases/');
  assert.ok(existsSync(join(f.folder, 'archive', 'phases', s.files[1])), 'the outside-CLI move is left as it was');
  assert.ok(existsSync(join(f.folder, 'archive', 'phases', '004-four.md')), '004 is in archive/');
});

test('075: replan keeps the rank of a row whose file was moved to archive/ outside the CLI', t => {
  const x = archivedOutside(t);
  const { f, s } = x;
  const r = cli(['update', '--replan', s.slugs[2]], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, `📋 PLANNING EVENT — backlog re-prioritized (P0 = next):\n   P0  ${s.slugs[2]}\n   P1  ${s.slugs[0]}\n   P2  ${s.slugs[1]}\n`);
  assert.match(readItem(f.folder, `phases/${s.files[0]}`), /^priority: 1$/m);
});

test('075: nextSeq: an archived item keeps its number: after archiving 2, the next new takes 4', t => {
  const f = fixturePair(t);
  threeItems(f);
  const a = cli(['archive', '2', '--force'], { cwd: f.cons, tmp: f.t });
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(a.stdout, '📦 002-two archived -> archive/phases/002-two.md\n   rescan: 0 (re)ingested, 0 missing\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
  assert.equal(a.stderr, '');
  const n = cli(['new', '--name', 'Four', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 0, n.stdout + n.stderr);
  assert.equal(n.stdout, '✅ created phase phases/004-four.md (seq 4) — appended, now at P2\n   📋 planning event: backlog re-densified to 3 item(s) (P0..P2)\n   rescan: 3 phase(s) tracked, 1 (re)ingested\n');
  assert.equal(n.stderr, '');
  const git = (...args) => execFileSync('git', args, { cwd: f.home, encoding: 'utf8' }).trim();
  assert.ok(existsSync(join(f.folder, 'phases/004-four.md')), 'the created file exists');
  assert.match(git('show', '--name-only', '--format=', 'HEAD'), /phases\/004-four\.md/, 'the commit carries the created file');
  assert.equal(git('rev-parse', 'origin/main'), git('rev-parse', 'HEAD'), 'published');
});

test('075: findings: an item of another repository is foreign, an item without repository and branch is untagged', t => {
  const f = fixturePair(t);
  threeItems(f);
  writeFileSync(join(f.folder, 'phases/004-foreign.md'),
    '---\nphase: "004-foreign"\nseq: 4\nname: "Foreign"\nstatus: "pending"\nrepository: "acme/other"\nbranch: "main"\n---\n');
  writeFileSync(join(f.folder, 'phases/005-untagged.md'),
    '---\nphase: "005-untagged"\nseq: 5\nname: "Untagged"\nstatus: "pending"\n---\n');
  // the hand-written files reach the mirror when the next write command rescans
  cli(['update', '1', '--note', 'the mirror rescan'], { cwd: f.cons, tmp: f.t });
  const r = cli(['query'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout.replace(f.folder, '<folder>'),
    `⚠️  CRITICAL: phases/004-foreign.md says repository acme/other but is in the folder of acme/demo; it is out of the queue. Move it: backlog move 004-foreign --to-repository\n`
    + `⚠️  item 005-untagged records no repository or branch; it is out of the queue until its repository and branch are filled in\n`
    + `📋 acme/demo — branch main — <folder>\n`
    + `   objective: phase anchor (no document)\n`
    + `   phases (3) — work queue order, P0 = next:\n`
    + `   • [  1] 001-one                      pending      P  0  one\n`
    + `        ↳ s\n`
    + `   • [  2] 002-two                      pending      P  1  two\n`
    + `        ↳ s\n`
    + `   • [  3] 003-three                    pending      P  2  three\n`
    + `        ↳ s\n`);
});
