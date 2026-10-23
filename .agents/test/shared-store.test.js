// Tests for src/shared/store.js — cli-parity job 5 (STORE: home, repository folder,
// items, numbers, priorities). Cited source: the pinned oracle at ec5b254e (contract v3).
// Tests use only local bare repos from shared-fixtures.js (job 1), with BACKLOG_HOME and
// XDG_CONFIG_HOME inside the test's temp dir — never the real backlog repository or ~/.config.
// Parity tests run the Python oracle (py() of job 1) on the same fixture folder and skip
// when it is not configured (SMOOTH_BACKLOG_SCRIPTS) or PyYAML is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consumer, env, py, sharedBacklog } from './shared-fixtures.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';

const STORE = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'shared', 'store.js'));
const PY_ARGS = ['--name', 'Alpha', '--objective', 'o', '--summary', 's', '--depends-on', 'none'];

const tmp = () => mkdtempSync(join(tmpdir(), 'store-test-'));
const sha256File = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const readItem = (folder, rel) => readFileSync(join(folder, rel), 'utf8');

function scratch(t) {
  const dir = tmp();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A consumer repository (origin acme/demo) plus the shared backlog home it works on.
function fixturePair(t) {
  const dir = scratch(t);
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  return { t: dir, home, cons, folder: join(home, 'acme', 'demo') };
}

// Runs the oracle; skips the calling test when it is not configured.
function oracle(t, f, script, args) {
  const r = py(script, args, { cwd: f.cons, tmp: f.t });
  if (!r) { t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing'); return null; }
  assert.equal(r.status, 0, `${script} ${args.join(' ')} failed: ${r.stdout}${r.stderr}`);
  return r;
}

// Three Python-created items; returns their slugs (the file stem = the front-matter `phase`) and file names.
function threeItems(t, f) {
  for (let i = 0; i < 3; i++) if (!oracle(t, f, 'new_phase.py', PY_ARGS)) return null;
  const files = readdirSync(join(f.folder, 'phases')).filter(x => x.endsWith('.md')).sort();
  assert.equal(files.length, 3);
  return { files, slugs: files.map(x => x.replace(/\.md$/, '')) };
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
  withEnv(t, { HOME: join(d, 'home'), XDG_CONFIG_HOME: join(d, 'config'), BACKLOG_HOME: homeA, SMOOTH_BACKLOG_SCRIPTS: '/scripts' });
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
    + `or should it be cloned to ${dflt}? Then run 'python3 /scripts/set_home.py <path>' (existing clone) or `
    + `'python3 /scripts/set_home.py --clone [<path>]', and run this command again.`, 'lib_db.py:81-85');
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

test('nextSeq after Python-created items (oracle)', t => {
  const f = fixturePair(t);
  if (!oracle(t, f, 'new_phase.py', PY_ARGS)) return;
  oracle(t, f, 'new_phase.py', PY_ARGS);
  assert.equal(store.nextSeq(f.folder), 3);
  const created = oracle(t, f, 'new_phase.py', ['--name', 'Next', '--objective', 'o', '--summary', 's', '--depends-on', 'none']);
  assert.match(created.stdout, /\(seq 3\)/, 'Python itself used the number nextSeq predicted');
});

// ---------------------------------------------------------------- reflow / reorder

test('reflow (oracle): a no-op keeps Python priorities and rewrites no file; a move re-densifies and Python reads our files back (update.py --note only rescans)', t => {
  const f = fixturePair(t);
  const s = threeItems(t, f);
  if (!s) return;
  const { files, slugs } = s;
  const before = files.map(x => sha256File(join(f.folder, 'phases', x)));
  assert.deepEqual(store.reflow(f.folder), slugs.map((x, i) => [x, i]));
  assert.deepEqual(files.map(x => sha256File(join(f.folder, 'phases', x))), before, 'unchanged priorities are not rewritten');
  assert.deepEqual(store.reflow(f.folder, { slug: slugs[2], target: 0 }), [slugs[2], slugs[0], slugs[1]].map((x, i) => [x, i]));
  assert.match(readItem(f.folder, `phases/${files[0]}`), /^priority: 1$/m);
  assert.match(readItem(f.folder, `phases/${files[2]}`), /^priority: 0$/m);
  assert.match(readItem(f.folder, `phases/${files[0]}`), /^updated: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"$/m, 'a rewritten file gets updated=now');
  oracle(t, f, 'update.py', [files[0].slice(0, 3), '--note', 'rescan']);
  const q = oracle(t, f, 'query.py', ['--status', '--json']);
  const prio = Object.fromEntries(JSON.parse(q.stdout).phases.map(r => [r.slug, r.priority]));
  assert.deepEqual(prio, { [slugs[2]]: 0, [slugs[0]]: 1, [slugs[1]]: 2 }, 'Python reads the same priorities');
});

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

test('reorder (oracle): slugs and item numbers lead, the rest keeps its order, unknown idents are skipped', t => {
  const f = fixturePair(t);
  const s = threeItems(t, f);
  if (!s) return;
  const { slugs } = s;
  assert.deepEqual(store.reorder(f.folder, [slugs[2], '1']), [slugs[2], slugs[0], slugs[1]].map((x, i) => [x, i]), 'slug, then number 1 = the first item');
  assert.deepEqual(store.reorder(f.folder, ['999', slugs[1], slugs[1]]), [slugs[1], slugs[2], slugs[0]].map((x, i) => [x, i]));
  assert.deepEqual(store.reorder(f.folder, ['003']).map(x => x[0]), [slugs[2], slugs[1], slugs[0]], 'zero-padded numbers resolve');
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

test('findings (oracle): flags exactly what query.py --status reports', t => {
  const f = fixturePair(t);
  if (!oracle(t, f, 'new_phase.py', PY_ARGS)) return;
  writeFileSync(join(f.folder, 'phases/002-foreign.md'),
    '---\nphase: "002-foreign"\nseq: 2\nname: "Foreign"\nstatus: "pending"\nrepository: "acme/other"\nbranch: "main"\n---\n');
  writeFileSync(join(f.folder, 'phases/003-untagged.md'),
    '---\nphase: "003-untagged"\nseq: 3\nname: "Untagged"\nstatus: "pending"\n---\n');
  oracle(t, f, 'update.py', ['1', '--note', 'rescan']);
  const py_ = JSON.parse(oracle(t, f, 'query.py', ['--status', '--json']).stdout).findings;
  const fd = store.findings(f.folder);
  assert.deepEqual(fd.foreign.map(i => i.fm.phase), py_.foreign.map(r => r.slug));
  assert.deepEqual(fd.untagged.map(i => i.fm.phase), py_.untagged.map(r => r.slug));
  assert.deepEqual(fd.foreign.map(i => i.fm.phase), ['002-foreign']);
  assert.deepEqual(fd.untagged.map(i => i.fm.phase), ['003-untagged']);
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

test('review P2 (oracle): findings.ghost matches query.py --status for a deleted item file', t => {
  const f = fixturePair(t);
  const s = threeItems(t, f);
  if (!s) return;
  rmSync(join(f.folder, 'phases', s.files[1]));
  const py_ = JSON.parse(oracle(t, f, 'query.py', ['--status', '--json']).stdout).findings;
  assert.deepEqual(py_.ghost.map(r => r.slug), [s.slugs[1]], 'Python reports the gone file');
  assert.deepEqual(store.findings(f.folder).ghost.map(r => r.slug), [s.slugs[1]]);
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

// Two identical Python-built fixtures with scrambled priorities (ties, a done item, a pending item with a higher priority
// than its seq): one is changed by the oracle's own replan / move, the other by store.reorder / store.reflow.
function scrambled(t) {
  const f = fixturePair(t);
  for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']) {
    if (!oracle(t, f, 'new_phase.py', ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'])) return null;
  }
  const files = readdirSync(join(f.folder, 'phases')).filter(x => x.endsWith('.md')).sort();
  const edits = [['priority: 7', null], ['priority: 3', null], ['priority: 3', 'done'], ['priority: 9', null], ['priority: 3', null]];
  files.forEach((x, i) => {
    const p = join(f.folder, 'phases', x);
    let text = readFileSync(p, 'utf8').replace(/^priority: .*$/m, edits[i][0]);
    if (edits[i][1]) text = text.replace(/^status: .*$/m, `status: "${edits[i][1]}"`);
    writeFileSync(p, text);
  });
  if (!oracle(t, f, 'scan.py', [])) return null;
  return { f, files, slugs: files.map(x => x.replace(/\.md$/, '')) };
}
const prioritiesOf = (folder, files) => Object.fromEntries(files.map(x => [x, parse(readItem(folder, `phases/${x}`)).fm.priority]));

test('reorder and reflow (oracle): the same operations on identical fixtures give the same priorities in Node and Python', t => {
  const a = scrambled(t); // the oracle's fixture
  if (!a) return;
  const b = scrambled(t); // Node's fixture
  assert.deepEqual(prioritiesOf(b.f.folder, b.files), prioritiesOf(a.f.folder, a.files), 'identical starting point');
  const { slugs, files } = a;
  const start = prioritiesOf(a.f.folder, files);
  // replan: item number 5, then a slug, lead; the rest keeps (priority, seq) order; the done item is not ranked
  oracle(t, a.f, 'update.py', ['--replan', `5,${slugs[3]},999`]);
  store.reorder(b.f.folder, ['5', slugs[3], '999']);
  assert.deepEqual(prioritiesOf(b.f.folder, files), prioritiesOf(a.f.folder, files), 'reorder');
  assert.notDeepEqual(prioritiesOf(a.f.folder, files), start, 'the replan changed something');
  assert.equal(prioritiesOf(a.f.folder, files)[files[2]], 3, 'the done item keeps its priority');
  // move the first item to rank 2, then the last past the end
  oracle(t, a.f, 'update.py', [slugs[0], '--priority', '2']);
  store.reflow(b.f.folder, { slug: slugs[0], target: 2 });
  assert.deepEqual(prioritiesOf(b.f.folder, files), prioritiesOf(a.f.folder, files), 'reflow move to rank 2');
  oracle(t, a.f, 'update.py', [slugs[4], '--priority', '99']);
  store.reflow(b.f.folder, { slug: slugs[4], target: 99 });
  assert.deepEqual(prioritiesOf(b.f.folder, files), prioritiesOf(a.f.folder, files), 'reflow clamps the target');
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
