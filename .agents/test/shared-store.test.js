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
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
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
  assert.deepEqual(store.resolveHome(), { home: homeA, ask: null });
  delete process.env.BACKLOG_HOME;
  writeFileSync(join(d, 'config', 'smoothsdlc-backlog', 'home'), `${homeB}\n`);
  assert.deepEqual(store.resolveHome(), { home: homeB, ask: null });
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
  assert.deepEqual(store.resolveHome(), { home: dflt, ask: null });
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

test('reflow (oracle): a no-op keeps Python priorities and rewrites no file; a move re-densifies and Python reads it back', t => {
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
