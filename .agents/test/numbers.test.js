// Tests of src/shared/numbers.js and of the commands that hand out numbers: an item number is never handed out twice (owner ruling R12).
// Real temporary git repositories only (the same shape the sync tests use).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, createdSlug, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { itemFileName } from '../../src/shared/item-file.js';
import { highWater, MAX_SEQ, numberOf, record, seed } from '../../src/shared/numbers.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout;
};
const F = 'acme/demo';
const pad = n => String(n).padStart(3, '0');

// ---- the library, on a plain repository

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'numbers-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', 'main', '.');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
  return dir;
}
const commit = (cwd, message) => { git(cwd, 'add', '-A'); git(cwd, 'commit', '-q', '-m', message); };
// What a creation writes: the next file and numbers.json.
function allocate(cwd, folder, name) {
  const n = highWater(join(cwd, folder)) + 1;
  mkdirSync(join(cwd, folder, 'phases'), { recursive: true });
  writeFileSync(join(cwd, folder, 'phases', `${pad(n)}-${name}.md`), `---\nseq: ${n}\n---\n`);
  writeFileSync(join(cwd, folder, 'numbers.json'), `${JSON.stringify({ last: n })}\n`);
  return n;
}

test('deleting the newest item does not give its number again', t => {
  const a = repo(t);
  allocate(a, F, 'one'); allocate(a, F, 'two'); commit(a, 'two items');
  git(a, 'rm', '-q', `${F}/phases/002-two.md`); commit(a, 'clean');
  git(a, 'rm', '-q', `${F}/numbers.json`); commit(a, 'no counter');
  assert.equal(allocate(a, F, 'three'), 3);
});

test('a reverted creation and a lowered or deleted counter do not give the number again', t => {
  const a = repo(t);
  allocate(a, F, 'one'); commit(a, 'one');
  allocate(a, F, 'two'); commit(a, 'two');
  git(a, 'revert', '--no-edit', 'HEAD');
  assert.equal(highWater(join(a, F)), 2, 'the reverted commit stays in the history');
  writeFileSync(join(a, F, 'numbers.json'), '{"last": 0}\n'); commit(a, 'lowered by hand');
  unlinkSync(join(a, F, 'numbers.json')); commit(a, 'deleted');
  assert.equal(allocate(a, F, 'three'), 3);
});

test('a number that exists only in a merge commit is never handed out again', t => {
  const a = repo(t);
  allocate(a, F, 'one'); commit(a, 'one');
  git(a, 'checkout', '-q', '-b', 'side'); writeFileSync(join(a, 'side.txt'), 'x'); commit(a, 'side');
  git(a, 'checkout', '-q', 'main'); writeFileSync(join(a, 'main.txt'), 'y'); commit(a, 'main');
  git(a, 'merge', '-q', '--no-ff', '--no-commit', 'side');
  writeFileSync(join(a, F, 'phases', '005-merged.md'), '---\nseq: 5\n---\n'); git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'merge with a new item');
  git(a, 'rm', '-q', `${F}/phases/005-merged.md`); commit(a, 'clean 5');
  assert.equal(highWater(join(a, F)), 5);
  assert.equal(allocate(a, F, 'next'), 6);
});

test('a number held only by another branch is part of the mark', t => {
  const a = repo(t);
  allocate(a, F, 'one'); commit(a, 'one');
  git(a, 'checkout', '-q', '-b', 'side'); allocate(a, F, 'two'); commit(a, 'two on the side');
  git(a, 'checkout', '-q', 'main');
  assert.equal(highWater(join(a, F)), 2);
});

test('a file-name number above the bound is an unreadable item, and never part of the mark once removed', t => {
  const a = repo(t);
  allocate(a, F, 'one'); commit(a, 'one');
  const odd = join(a, F, 'phases', '9007199254740993-odd.md');
  writeFileSync(odd, '---\nseq: 1\n---\n'); commit(a, 'planted');
  assert.throws(() => highWater(join(a, F)), e => e.exitCode === 2 && /9007199254740993-odd\.md/.test(e.message) && /above 1000000000/.test(e.message));
  assert.throws(() => store.load(join(a, F)), e => e.exitCode === 2 && /above 1000000000/.test(e.message), 'every command that reads the folder stops');
  git(a, 'rm', '-q', `${F}/phases/9007199254740993-odd.md`); commit(a, 'removed');
  assert.equal(highWater(join(a, F)), 1, 'ignored in the history');
  assert.equal(MAX_SEQ, 1e9);
  writeFileSync(join(a, F, 'phases', `${MAX_SEQ}-edge.md`), '---\nseq: 1\n---\n'); // exactly the bound is allowed
  assert.equal(highWater(join(a, F)), MAX_SEQ);
});

test('the item file pattern is built from the item extension and also accepts .md, the extension of older history', t => {
  const a = repo(t);
  mkdirSync(join(a, F, 'phases'), { recursive: true });
  writeFileSync(join(a, F, 'phases', itemFileName('007-x')), '{}\n');
  writeFileSync(join(a, F, 'phases', '008-y.md'), '{}\n'); commit(a, 'items');
  git(a, 'rm', '-q', '-r', `${F}/phases`); commit(a, 'gone');
  assert.equal(highWater(join(a, F)), 8);
  assert.equal(numberOf(itemFileName('012-z')), 12);
  assert.equal(numberOf('013-z.md'), 13);
  assert.equal(numberOf('014-z.txt'), null);
});

test('a shallow clone refuses to hand out a number, with exit 2; a full clone does not', t => {
  const a = repo(t);
  allocate(a, F, 'one'); commit(a, 'one'); allocate(a, F, 'two'); commit(a, 'two');
  const dir = mkdtempSync(join(tmpdir(), 'numbers-shallow-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, 'clone', '-q', '--depth', '1', `file://${a}`, 's');
  assert.throws(() => highWater(join(dir, 's', F)), e => e.exitCode === 2 && e.message === 'the backlog clone is shallow, so numbers cannot be proven unused: run git fetch --unshallow');
  git(join(dir, 's'), 'fetch', '-q', '--unshallow');
  assert.equal(highWater(join(dir, 's', F)), 2);
});

test("the seed of a folder comes from the folder's whole history, deleted files included, and reads no other folder", t => {
  const a = repo(t);
  allocate(a, 'acme/old', 'gone'); allocate(a, 'acme/old', 'gone2'); commit(a, 'items of another folder');
  allocate(a, F, 'x'); allocate(a, F, 'x2'); allocate(a, F, 'x3'); commit(a, 'items');
  git(a, 'rm', '-q', '-r', 'acme/old'); git(a, 'rm', '-q', `${F}/phases/003-x3.md`); commit(a, 'delete');
  unlinkSync(join(a, F, 'numbers.json')); commit(a, 'no counter yet');
  assert.equal(seed(join(a, F)), 3);
  assert.equal(seed(join(a, 'acme/old')), 2);
  assert.equal(seed(join(a, 'acme/never')), 0, 'a folder the history never held');
});

test('a failing git command inside the history scan stops with exit 2 and the same text', t => {
  const a = repo(t);
  allocate(a, F, 'one'); commit(a, 'one');
  writeFileSync(join(a, '.git', 'refs', 'heads', 'broken'), `${'1'.repeat(40)}\n`); // a ref to an object the repository does not have: git log --all fails
  assert.throws(() => highWater(join(a, F)), e => e.exitCode === 2 && /cannot read the history of the backlog folder \(git log failed\); no number was handed out/.test(e.message));
});

test('an unreadable numbers.json in the working tree stops, it is not trusted or ignored', t => {
  const a = repo(t);
  allocate(a, F, 'one'); commit(a, 'one');
  writeFileSync(join(a, F, 'numbers.json'), 'not json');
  assert.throws(() => highWater(join(a, F)), e => e.exitCode === 2 && /numbers\.json cannot be read/.test(e.message));
});

// ---- the commands

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'numbers-cmd-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [k, v] of Object.entries(GIT_IDENTITY)) { const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; }); }
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { dir, home, cons, folder: join(home, 'acme', 'demo'), bare: join(dir, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`) };
}
const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'];
const make = (f, name) => { const r = cli(NEW(name), { cwd: f.cons, tmp: f.dir }); assert.equal(r.status, 0, r.stdout + r.stderr); return createdSlug(r.stdout); };
const lastOf = folder => JSON.parse(readFileSync(join(folder, 'numbers.json'), 'utf8')).last;

test('backlog new writes numbers.json, and it is in the same commit as the new item (a separate backlog clone)', t => {
  const f = fixture(t);
  assert.equal(make(f, 'alpha'), '001-alpha');
  assert.equal(lastOf(f.folder), 1);
  const files = git(f.home, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n');
  assert.ok(files.includes('acme/demo/phases/001-alpha.md') && files.includes('acme/demo/numbers.json') && files.includes('acme/demo/index.json'), files.join(','));
  assert.equal(make(f, 'beta'), '002-beta');
  assert.equal(lastOf(f.folder), 2);
  assert.ok(git(f.home, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes('acme/demo/numbers.json'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD').trim(), '0', 'pushed');
});

test('backlog new in a backlog inside the repository: numbers.json is in the same commit as the item', t => {
  const tmp = mkdtempSync(join(tmpdir(), 'numbers-inside-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const cwd = consumer(tmp, 'acme', 'demo', 'main');
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: join(tmp, 'config'), HOME: join(tmp, 'userhome'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '', SMOOTH_BACKLOG_CLI_HOME: '' };
  mkdirSync(env.HOME, { recursive: true });
  const run = args => { const r = cli(args, { cwd, env }); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
  run(NEW('alpha'));
  const files = git(cwd, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n');
  assert.ok(files.includes('.backlog/local/repository/phases/001-alpha.md') && files.includes('.backlog/local/repository/numbers.json'), files.join(','));
  const dir = join(cwd, '.backlog', 'local', 'repository');
  git(cwd, 'rm', '-q', '.backlog/local/repository/phases/001-alpha.md'); git(cwd, 'commit', '-q', '-m', 'the newest item is deleted');
  assert.equal(createdSlug(run(NEW('beta')).stdout), '002-beta', 'the deleted number is not handed out again');
  assert.equal(lastOf(dir), 2);
  assert.ok(git(cwd, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes('.backlog/local/repository/numbers.json'));
});

test('backlog new in a backlog inside the repository: a number held only by an unpushed merge commit is not handed out again', t => {
  const tmp = mkdtempSync(join(tmpdir(), 'numbers-merge-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const cwd = consumer(tmp, 'acme', 'demo', 'main');
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: join(tmp, 'config'), HOME: join(tmp, 'userhome'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '', SMOOTH_BACKLOG_CLI_HOME: '' };
  mkdirSync(env.HOME, { recursive: true });
  const run = args => { const r = cli(args, { cwd, env }); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
  run(NEW('alpha')); // 001, pushed
  const dir = join(cwd, '.backlog', 'local', 'repository');
  git(cwd, 'checkout', '-q', '-b', 'side'); writeFileSync(join(cwd, 'side.txt'), 'x'); commit(cwd, 'side');
  git(cwd, 'checkout', '-q', 'main'); writeFileSync(join(cwd, 'main.txt'), 'y'); commit(cwd, 'main');
  git(cwd, 'merge', '-q', '--no-ff', '--no-commit', 'side');
  mkdirSync(join(dir, 'phases'), { recursive: true });
  writeFileSync(join(dir, 'phases', '005-x.md'), '---\nseq: 5\n---\n'); commit(cwd, 'merge with a new item');
  git(cwd, 'rm', '-q', '.backlog/local/repository/phases/005-x.md'); commit(cwd, 'the item is deleted');
  // the origin moves on, so the pull of the command really rebases (and flattens the unpushed merge)
  const other = join(tmp, 'other'); git(tmp, 'clone', '-q', git(cwd, 'remote', 'get-url', 'origin').trim(), other);
  writeFileSync(join(other, 'upstream.txt'), 'z'); commit(other, 'upstream'); git(other, 'push', '-q');
  assert.equal(createdSlug(run(NEW('beta')).stdout), '006-beta');
  assert.equal(lastOf(dir), 6);
});

test('backlog new after the newest item was deleted and committed, or after backlog clean, gets a new number', t => {
  const f = fixture(t);
  make(f, 'alpha'); make(f, 'beta');
  git(f.home, 'rm', '-q', 'acme/demo/phases/002-beta.md'); git(f.home, 'commit', '-q', '-m', 'delete the newest item'); git(f.home, 'push', '-q');
  assert.equal(make(f, 'gamma'), '003-gamma');
  const clean = cli(['clean'], { cwd: f.cons, tmp: f.dir, input: 'yes\n' });
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.equal(store.load(f.folder).length, 0);
  assert.equal(make(f, 'delta'), '004-delta');
  assert.equal(lastOf(f.folder), 4);
});

test('deleting numbers.json and lowering it by hand do not give a number again', t => {
  const f = fixture(t);
  make(f, 'alpha'); make(f, 'beta');
  writeFileSync(join(f.folder, 'numbers.json'), '{"last": 0}\n');
  git(f.home, 'rm', '-q', 'acme/demo/phases/002-beta.md'); git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'by hand'); git(f.home, 'push', '-q');
  assert.equal(make(f, 'gamma'), '003-gamma');
  unlinkSync(join(f.folder, 'numbers.json'));
  git(f.home, 'rm', '-q', 'acme/demo/phases/003-gamma.md'); git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'by hand again'); git(f.home, 'push', '-q');
  assert.equal(make(f, 'delta'), '004-delta');
});

test('backlog new in a shallow clone is refused with exit 2 and changes nothing', t => {
  const f = fixture(t);
  make(f, 'alpha');
  const shallow = join(f.dir, 'shallow-home');
  git(f.dir, 'clone', '-q', '--depth', '1', `file://${f.bare}`, shallow);
  const r = cli(NEW('beta'), { cwd: f.cons, tmp: f.dir, env: { SMOOTH_BACKLOG_CLI_HOME: shallow } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /❌ backlog: the backlog clone is shallow, so numbers cannot be proven unused: run git fetch --unshallow/);
  assert.equal(git(shallow, 'status', '--porcelain'), '');
  assert.equal(cli(['list'], { cwd: f.cons, tmp: f.dir, env: { SMOOTH_BACKLOG_CLI_HOME: shallow } }).status, 0, 'reading still works');
});

test('update --seq: a number at or below the mark is refused, one above it works and numbers.json follows', t => {
  const f = fixture(t);
  make(f, 'alpha'); make(f, 'beta');
  git(f.home, 'rm', '-q', 'acme/demo/phases/002-beta.md'); git(f.home, 'commit', '-q', '-m', 'delete the newest item'); git(f.home, 'push', '-q');
  for (const n of [1, 2]) {
    const r = cli(['update', '001-alpha', '--seq', String(n)], { cwd: f.cons, tmp: f.dir, plain: true });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    if (n === 2) assert.match(r.stdout, /❌ --seq 2 is not above the highest number ever used in acme\/demo \(2\); numbers are never reused/, 'the deleted number is below the mark');
  }
  assert.equal(store.load(f.folder)[0].fm.seq, 1);
  const ok = cli(['update', '001-alpha', '--seq', '9'], { cwd: f.cons, tmp: f.dir, plain: true });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(store.load(f.folder)[0].fm.seq, 9);
  assert.equal(lastOf(f.folder), 9);
  assert.ok(git(f.home, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes('acme/demo/numbers.json'), 'in the same commit');
  assert.equal(make(f, 'gamma'), '010-gamma');
});

test('update --seq above the bound is refused and writes nothing; exactly the bound is accepted and then backlog new says no number is left', t => {
  const f = fixture(t);
  make(f, 'alpha');
  const r = cli(['update', '001-alpha', '--seq', '2000000000'], { cwd: f.cons, tmp: f.dir, plain: true });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /❌ --seq 2000000000 is above the highest number the CLI can use \(1000000000\)/);
  assert.equal(store.load(f.folder)[0].fm.seq, 1);
  assert.equal(lastOf(f.folder), 1);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.equal(make(f, 'beta'), '002-beta', 'the folder still takes new items');
  const ok = cli(['update', '001-alpha', '--seq', String(MAX_SEQ)], { cwd: f.cons, tmp: f.dir, plain: true });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(lastOf(f.folder), MAX_SEQ);
  const none = cli(NEW('gamma'), { cwd: f.cons, tmp: f.dir });
  assert.equal(none.status, 2, none.stdout + none.stderr);
  assert.match(none.stderr, /no number left/);
  assert.equal(cli(['list'], { cwd: f.cons, tmp: f.dir }).status, 0, 'the folder stays readable');
});

test('a stored seq above the bound never raises the mark', t => {
  const a = repo(t);
  mkdirSync(join(a, F, 'phases'), { recursive: true });
  writeFileSync(join(a, F, 'phases', '001-x.md'), `---\nphase: 001-x\nseq: 2000000000\n---\n`); commit(a, 'a stored seq above the bound');
  assert.equal(store.mark(join(a, F)), 1);
  assert.equal(store.nextSeq(join(a, F)), 2);
});

test('a second repository folder in the same backlog does not influence the first one', t => {
  const f = fixture(t);
  const other = consumer(f.dir, 'acme', 'other', 'main');
  make(f, 'alpha');
  for (const n of ['one', 'two', 'three']) assert.equal(cli(NEW(n), { cwd: other, tmp: f.dir }).status, 0);
  assert.equal(lastOf(join(f.home, 'acme', 'other')), 3);
  assert.equal(make(f, 'beta'), '002-beta');
  assert.equal(lastOf(f.folder), 2);
  const first = cli(NEW('four'), { cwd: other, tmp: f.dir });
  assert.match(first.stdout, /004-four/);
});

test('backlog move to another repository takes the next number of the target and records it there', t => {
  const f = fixture(t);
  const other = consumer(f.dir, 'acme', 'other', 'main');
  make(f, 'alpha'); make(f, 'beta');
  assert.equal(cli(NEW('theirs'), { cwd: other, tmp: f.dir }).status, 0);
  const moved = cli(['move', '002-beta', '--to-repository', 'acme/other'], { cwd: f.cons, tmp: f.dir });
  assert.equal(moved.status, 0, moved.stdout + moved.stderr);
  const target = join(f.home, 'acme', 'other');
  assert.ok(existsSync(join(target, 'phases', '002-beta.md')));
  assert.equal(lastOf(target), 2);
  assert.equal(lastOf(f.folder), 2, 'the source keeps its mark');
  assert.equal(make(f, 'gamma'), '003-gamma', 'the number the moved item left is not handed out again');
});

test('a creation that fails after the number was allocated and numbers.json written leaves numbers.json as it was', { skip: process.getuid?.() === 0 && 'root can write into an unwritable folder' }, t => {
  const f = fixture(t);
  make(f, 'alpha');
  const before = readFileSync(join(f.folder, 'numbers.json'), 'utf8');
  const phases = join(f.folder, 'phases');
  chmodSync(phases, 0o555); // the item file cannot be written: the failure comes after recordNumber
  t.after(() => { try { chmodSync(phases, 0o755); } catch { /* removed already */ } });
  const r = cli(NEW('beta'), { cwd: f.cons, tmp: f.dir });
  chmodSync(phases, 0o755);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /EACCES|permission denied/i, 'the failure is the write of the item');
  assert.equal(readFileSync(join(f.folder, 'numbers.json'), 'utf8'), before);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.equal(make(f, 'gamma'), '002-gamma', 'the number was not used up');
});

// A creation as the commands make it (item, numbers.json), published through the same commit path, so two clones can create at once.
async function create(home, folder, name, { dropRecord = false } = {}) {
  const n = store.nextSeq(folder);
  const phase = `${pad(n)}-${name}`;
  record(folder, n);
  store.write({ path: join(folder, 'phases', `${phase}.md`), fm: { phase, seq: n, name, status: 'pending', repository: 'acme/demo', branch: 'main' }, body: `\n# Phase ${pad(n)} — ${name}\n\n**Objective:** x\n` }, folder);
  if (dropRecord) unlinkSync(join(folder, 'numbers.json')); // the creation deletes the record
  return sync.commitSettled(home, folder, `new ${name}`);
}

for (const [title, firsts] of [['with the same counter', ['alpha']], ['with different counters', ['alpha', 'gamma']]]) {
  test(`two clones create at once ${title}: the later one is renumbered above and numbers.json holds the larger value`, async t => {
    const f = fixture(t);
    const home2 = join(f.dir, 'home2');
    git(f.dir, 'clone', '-q', f.bare, home2);
    const folder2 = join(home2, 'acme', 'demo');
    for (const name of firsts) await create(f.home, f.folder, name);
    await create(home2, folder2, 'beta'); // this clone has not seen the others' commits
    git(f.home, 'pull', '-q');
    const names = store.load(f.folder).map(i => i.fm.phase).sort();
    assert.equal(new Set(names.map(n => n.slice(0, 3))).size, names.length, `unique numbers: ${names}`);
    assert.equal(names.length, firsts.length + 1);
    assert.equal(lastOf(f.folder), firsts.length + 1);
    assert.equal(store.nextSeq(f.folder), firsts.length + 2);
  });
}

// numbers.json deleted by one clone and changed by the other: the publication goes through and the file holds the larger value
for (const [title, deletesUpstream] of [['upstream deleted it, this clone changed it', true], ['upstream changed it, this clone deleted it', false]]) {
  test(`a modify/delete conflict on numbers.json (${title}) resolves to the larger value`, async t => {
    const f = fixture(t);
    await create(f.home, f.folder, 'alpha'); // 001, published
    const home2 = join(f.dir, 'home2');
    git(f.dir, 'clone', '-q', f.bare, home2);
    const folder2 = join(home2, 'acme', 'demo');
    if (deletesUpstream) { git(f.home, 'rm', '-q', 'acme/demo/numbers.json'); git(f.home, 'commit', '-q', '-m', 'the record is deleted'); git(f.home, 'push', '-q'); await create(home2, folder2, 'gamma'); } // this clone: 002, last 2
    else { await create(f.home, f.folder, 'beta'); await create(home2, folder2, 'gamma', { dropRecord: true }); } // upstream: 002, last 2; this clone creates and deletes the record
    git(f.home, 'pull', '-q', '--rebase');
    git(home2, 'pull', '-q', '--rebase');
    const names = store.load(f.folder).map(i => i.fm.phase).sort();
    assert.equal(new Set(names.map(n => n.slice(0, 3))).size, names.length, `unique numbers: ${names}`);
    assert.ok(existsSync(join(f.folder, 'numbers.json')));
    assert.equal(lastOf(f.folder), Math.max(...names.map(n => Number(n.slice(0, 3)))), 'the larger value');
    assert.equal(git(f.home, 'status', '--porcelain'), '');
  });
}
