// Tests for src/shared/store.js — cli-parity job 5 (STORE: home, repository folder, items, numbers, priorities).
// Local bare repositories only (shared-fixtures.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKLOG_NAME, ORIGIN_URL, cli, consumer, env, sharedBacklog } from './shared-fixtures.js';
import { dump, parseItem as parse } from '../../src/shared/frontmatter.js';
import * as index from '../../src/shared/index.js';
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
// An item file as it is: store.write would drop the rank an earlier build kept in the item, and these tests place such items.
function putItem(folder, fm, rel = `phases/${fm.phase}.md`) {
  mkdirSync(dirname(join(folder, rel)), { recursive: true });
  writeFileSync(join(folder, rel), dump(fm, `Body ${fm.phase}.\n`));
}

// ---------------------------------------------------------------- resolveHome

test('resolveHome: BACKLOG_HOME > home record > the default ~/git/<name>; a configured but missing clone is tagged exit 4 naming backlog setup, never cloned', t => {
  const d = scratch(t);
  const homeA = join(d, 'homeA'); const homeB = join(d, 'homeB');
  mkdirSync(homeA); mkdirSync(homeB);
  mkdirSync(join(d, 'config', BACKLOG_NAME), { recursive: true });
  // item 091: the folder names derive from the setting; the test pins the setting explicitly
  withEnv(t, { HOME: join(d, 'home'), XDG_CONFIG_HOME: join(d, 'config'), BACKLOG_HOME: homeA, BACKLOG_ORIGIN_URL: ORIGIN_URL });
  assert.deepEqual(store.resolveHome(), { home: realpathSync(homeA), remote: true, ask: null });
  delete process.env.BACKLOG_HOME;
  writeFileSync(join(d, 'config', BACKLOG_NAME, 'home'), `${homeB}\n`);
  assert.deepEqual(store.resolveHome(), { home: realpathSync(homeB), remote: true, ask: null });
  rmSync(join(d, 'config', BACKLOG_NAME, 'home'));
  const dflt = join(d, 'home', 'git', BACKLOG_NAME);
  const missing = store.resolveHome();
  assert.equal(missing.home, dflt, 'the default location');
  assert.equal(missing.ask.code, 4);
  assert.equal(missing.ask.text,
    `the backlog repository acme/${BACKLOG_NAME} is configured but not cloned at ${dflt}: run 'backlog setup' in this repository `
    + "(it clones it beside the repository) or 'backlog setup --ask' (it asks for the path), then run this command again.", 'the answer is backlog setup');
  assert.equal(existsSync(dflt), false, 'never clones');
  mkdirSync(dflt, { recursive: true });
  assert.deepEqual(store.resolveHome(), { home: realpathSync(dflt), remote: true, ask: null });
});

// ---------------------------------------------------------------- folder / repoId / branch

test('folder(home, repoId): <home>/<owner>/<name>', () => {
  assert.equal(store.folder('/srv/home', 'acme/demo'), join('/srv/home', 'acme', 'demo'));
});

test('repoId: owner/name of the origin; a worktree maps to it; local/<folder> without an origin; refused outside git', t => {
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
  assert.equal(store.repoId(noOrigin), 'local/noorigin');
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
  const { priority, ...fm } = item(9, { phase: '009-new' }); // the rank an earlier build kept in the item is dropped by every write
  store.write({ path: abs, fm, body: 'New body.\n' });
  const parsed = parse(readFileSync(abs, 'utf8'));
  assert.deepEqual(parsed.fm, fm);
  assert.equal(parsed.body, 'New body.\n');
  assert.equal(statSync(abs).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dirname(abs)), ['009-new.md']);
  const orig = readFileSync(abs, 'utf8');
  store.write({ path: abs, fm: { ...parsed.fm, status: 'in_progress' }, body: parsed.body });
  assert.equal(readFileSync(abs, 'utf8'), orig.replace(/^status: .*$/m, 'status: "in_progress"'));
  putItem(dirname(dirname(abs)), item(8, { phase: '008-old' }));
  store.write({ path: join(dirname(abs), '008-old.md'), fm: parse(readFileSync(join(dirname(abs), '008-old.md'), 'utf8')).fm, body: 'x\n' });
  assert.equal(Object.hasOwn(parse(readFileSync(join(dirname(abs), '008-old.md'), 'utf8')).fm, 'priority'), false, 'a write drops the legacy rank');
});

test('addEvent appends an event line to the item file and keeps every other key', t => {
  const folder = scratch(t);
  putItem(folder, item(1, { phase: '001-a', name: 'a' }));
  const line = store.addEvent(folder, 'phases/001-a.md', { event: 'claimed', branch: 'main', note: 'by  ann\nnow' });
  const [it] = store.load(folder);
  assert.deepEqual(it.fm.events, [line]);
  assert.equal(it.fm.name, 'a');
  assert.match(line, /^\d{4}-\d\d-\d\dT[\d:]+Z claimed main - by ann now$/);
  assert.deepEqual(store.parseEvent(line), { ts: line.split(' ')[0], event: 'claimed', branch: 'main', commit_sha: '', note: 'by ann now' });
  store.addEvent(folder, 'phases/001-a.md', { event: 'review', commitSha: 'abcdef1234' });
  assert.equal(store.load(folder)[0].fm.events.length, 2);
  assert.deepEqual(store.parseEvent('2026-01-01T00:00:00Z x - -'), { ts: '2026-01-01T00:00:00Z', event: 'x', branch: '', commit_sha: '', note: '' });
});

// ---------------------------------------------------------------- nextSeq

test('nextSeq: 1 on an empty folder; 1 + max of the file seqs (phases and archive); stderr stays clean', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  assert.equal(store.nextSeq(folder), 1);
  putItem(folder, item(1));
  putItem(folder, item(2, { status: 'archived' }), 'archive/phases/002-i2.md');
  assert.equal(store.nextSeq(folder), 3, 'archive counts');
  const r = spawnSync(process.execPath, ['-e', 'const s = await import(process.argv[1]); process.stdout.write(String(s.nextSeq(process.argv[2])));', STORE, folder],
    { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '', 'nextSeq prints nothing to stderr');
  assert.equal(r.stdout, '3');
});

// ---------------------------------------------------------------- reflow / reorder

test('reflow: the target is clamped to 0..len(rest); no item is rewritten, the order is written to the index', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  for (const n of [1, 2, 3]) putItem(folder, item(n));
  const sha = rel => sha256File(join(folder, rel));
  const first = sha('phases/001-i1.md');
  assert.deepEqual(store.reflow(folder), [['001-i1', 0], ['002-i2', 1], ['003-i3', 2]]);
  assert.equal(sha('phases/001-i1.md'), first, 'a rank change rewrites no item');
  assert.deepEqual(index.read(folder).branches.main.map(e => e.slug), ['001-i1', '002-i2', '003-i3']);
  assert.deepEqual(store.reflow(folder, { slug: '001-i1', target: 99 }).map(x => x[0]), ['002-i2', '003-i3', '001-i1']);
  assert.deepEqual(store.reflow(folder, { slug: '003-i3', target: -3 }).map(x => x[0]), ['003-i3', '002-i2', '001-i1']);
  assert.deepEqual(index.read(folder).branches.main.map(e => e.slug), ['003-i3', '002-i2', '001-i1']);
});

test('reflow: only pending/in_progress items are ranked, each branch in its own order; done items follow the open ones, archived ones are not listed', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(1, { priority: 7 }));
  putItem(folder, item(2, { branch: 'dev', priority: 9 }));
  putItem(folder, item(3, { status: 'done', priority: 5 }));
  putItem(folder, item(4, { status: 'archived', priority: 5 }), 'archive/phases/004-i4.md');
  const doneSha = sha256File(join(folder, 'phases/003-i3.md'));
  assert.deepEqual(store.reflow(folder), [['001-i1', 0], ['002-i2', 0]]);
  assert.deepEqual(Object.fromEntries(Object.entries(index.read(folder).branches).map(([b, l]) => [b, l.map(e => e.slug)])), { dev: ['002-i2'], main: ['001-i1', '003-i3'] });
  assert.equal(sha256File(join(folder, 'phases/003-i3.md')), doneSha);
});

test('reflow and reorder write the index and no item: every item keeps its bytes, the order is in <folder>/index.json', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  for (const n of [1, 2, 3]) putItem(folder, item(n, { priority: undefined }));
  const shas = () => ['001-i1', '002-i2', '003-i3'].map(s => sha256File(join(folder, `phases/${s}.md`)));
  const before = shas();
  store.reflow(folder, { slug: '003-i3', target: 0 });
  assert.deepEqual(index.read(folder).branches.main.map(e => e.slug), ['003-i3', '001-i1', '002-i2']);
  store.reorder(folder, ['002-i2']);
  assert.deepEqual(index.read(folder).branches.main.map(e => e.slug), ['002-i2', '003-i3', '001-i1']);
  assert.deepEqual(shas(), before, 'no item was rewritten');
  assert.ok(readdirSync(folder).includes('index.json'));
});

test('undoOnThrow puts back only what the command wrote: a file that appears meanwhile (a pull) is not deleted', async t => {
  const dir = scratch(t);
  const folder = join(dir, 'o', 'n'); mkdirSync(join(folder, 'phases'), { recursive: true });
  const mine = join(folder, 'phases', '001-mine.md'); const pulled = join(folder, 'phases', '002-pulled.md'); const edited = join(folder, 'phases', '003-edited.md');
  writeFileSync(edited, '---\nphase: 003-edited\nseq: 3\n---\nold\n');
  await assert.rejects(store.undoOnThrow(folder, async () => {
    store.write({ path: mine, fm: { phase: '001-mine', seq: 1 }, body: 'x\n' }, folder);
    store.write({ path: edited, fm: { phase: '003-edited', seq: 3 }, body: 'new\n' }, folder);
    writeFileSync(pulled, 'pulled by someone else\n');
    throw new Error('boom');
  }), /boom/);
  assert.equal(existsSync(mine), false, 'the file it created is removed');
  assert.match(readFileSync(edited, 'utf8'), /old/, 'the file it changed is restored');
  assert.equal(readFileSync(pulled, 'utf8'), 'pulled by someone else\n', 'a file it did not write stays');
});

// ---------------------------------------------------------------- findings / now


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
  assert.deepEqual(Object.keys(fd), ['foreign', 'untagged']);
  assert.deepEqual(fd.foreign.map(i => i.fm.phase), ['002-i2']);
  assert.deepEqual(fd.untagged.map(i => i.fm.phase), ['003-i3', '005-i5']);
});

test('now(): second-precision UTC with a Z suffix', () => {
  const n = store.now();
  assert.match(n, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(Math.abs(Date.now() - new Date(n).getTime()) < 5000);
});

// ---------------------------------------------------------------- review fixes (review fixes 2026-10-23)

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

test('review P2: a legacy priority field written as a quoted number orders the folder at its first index; no item is rewritten', t => {
  const d = scratch(t);
  const folder = join(d, 'acme', 'demo');
  putItem(folder, item(1, { priority: '0' }));
  putItem(folder, item(2, { priority: ' 1 ' }));
  putItem(folder, item(3, { priority: '9' }));
  const sha = rel => sha256File(join(folder, rel));
  const [a, b, c] = ['phases/001-i1.md', 'phases/002-i2.md', 'phases/003-i3.md'].map(sha);
  assert.deepEqual(store.reflow(folder), [['001-i1', 0], ['002-i2', 1], ['003-i3', 2]]);
  assert.deepEqual([sha('phases/001-i1.md'), sha('phases/002-i2.md'), sha('phases/003-i3.md')], [a, b, c], 'the ranks are in the index; the legacy field stays where it is');
});

// ---------------------------------------------------------------- review fixes (review fixes 2026-10-23, second review)

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

// Three items made with `backlog new`; returns their slugs (the file stem = the front-matter `phase`) and file names.
function fixturePair(t) {
  const dir = scratch(t);
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
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
test('075: archive reflows the queue: archiving the last item is a no-op; archiving a middle one re-densifies the index and rewrites no other item', t => {
  // no-op: archive the last item (003); the survivors (001 at P0, 002 at P1) are already dense, so no file is rewritten
  const a = fixturePair(t);
  threeItems(a);
  const sha = rel => sha256File(join(a.folder, rel));
  const before = ['phases/001-one.md', 'phases/002-two.md'].map(sha);
  const ra = cli(['archive', '3', '--force'], { cwd: a.cons, tmp: a.t });
  assert.equal(ra.status, 0, ra.stdout + ra.stderr);
  assert.equal(ra.stdout, '📦 003-three archived\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
  assert.equal(ra.stderr, '');
  assert.deepEqual(['phases/001-one.md', 'phases/002-two.md'].map(sha), before, 'a no-op reflow rewrites no file');

  // re-densify: archive a middle item (002); 003 is pulled down from P2 to P1 in the index; its file is not rewritten
  const b = fixturePair(t);
  threeItems(b);
  const rb = cli(['archive', '2', '--force'], { cwd: b.cons, tmp: b.t });
  assert.equal(rb.status, 0, rb.stdout + rb.stderr);
  assert.equal(rb.stdout, '📦 002-two archived\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
  assert.equal(rb.stderr, '');
  assert.equal(index.rank(b.folder, 'main', '003-three'), 1, '003 is re-densified from P2 to P1');
  assert.ok(!existsSync(join(b.folder, 'phases', '002-two.md')), '002 left phases/');
  assert.ok(existsSync(join(b.folder, 'archive', 'phases', '002-two.md')), '002 is in archive/');
  const q = cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.t });
  assert.match(q.stdout, /📦 \[  2\] 002-two\s+archived\s+P  -\s/, 'an archived item has no rank: the view shows no number');
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
  assert.equal(index.rank(f.folder, 'main', slugs[2]), 0);
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
  assert.equal(index.rank(f.folder, 'main', slugs[0]), 2);
});

test('075: nextSeq: an archived item keeps its number: after archiving 2, the next new takes 4', t => {
  const f = fixturePair(t);
  threeItems(f);
  const a = cli(['archive', '2', '--force'], { cwd: f.cons, tmp: f.t });
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(a.stdout, '📦 002-two archived\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
  assert.equal(a.stderr, '');
  const n = cli(['new', '--name', 'Four', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 0, n.stdout + n.stderr);
  assert.equal(n.stdout, '✅ created phase 004-four (seq 4) — appended, now at P2\n   📋 planning event: backlog re-densified to 3 item(s) (P0..P2)\n');
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
  const r = cli(['list'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout.replace(f.folder, '<folder>'),
    `⚠️  CRITICAL: phases/004-foreign.md says repository acme/other but is in the folder of acme/demo; it is out of the queue. Move it: backlog move 004-foreign --to-repository\n`
    + `⚠️  item 005-untagged records no repository or branch; it is out of the queue until its repository and branch are filled in\n`
    + '📋 acme/demo — branch main\n'
    + `   objective: phase anchor (no document)\n`
    + `   phases (3) — work queue order, P0 = next:\n`
    + `   • [  1] 001-one                      pending      P  0  one\n`
    + `        ↳ s\n`
    + `   • [  2] 002-two                      pending      P  1  two\n`
    + `        ↳ s\n`
    + `   • [  3] 003-three                    pending      P  2  three\n`
    + `        ↳ s\n`);
});
