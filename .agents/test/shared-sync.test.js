// Tests for src/shared/sync.js — cli-parity job 8 (SYNC: pull, commit and push of the shared backlog repository).
// Local bare repositories only (shared-fixtures.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { archivedRel, BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, env, GIT_IDENTITY, itemName, itemPath, itemRel, sharedBacklog, archivedPath, itemNames, slugOfName, changeItem, readItem, ENVELOPE } from './shared-fixtures.js';
import * as index from '../../src/shared/index.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';
import { guarded } from '../../src/shared/seen.js';
import { dumpItem } from '../../src/shared/item-file.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

// A fixture: the bare origin, two clones of it (home, home2) and the folder acme/demo in each.
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [k, v] of Object.entries(GIT_IDENTITY)) { const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; }); }
  const home = sharedBacklog(dir);
  const bare = join(dir, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  const home2 = join(dir, 'home2');
  git(dir, 'clone', '-q', bare, home2);
  return { dir, bare, home, home2, folder: join(home, 'acme', 'demo'), folder2: join(home2, 'acme', 'demo') };
}

const pad = n => String(n).padStart(3, '0');
function putItem(folder, seq, name, extra = {}) {
  const phase = `${pad(seq)}-${name}`;
  store.write({
    path: itemPath(folder, phase),
    fm: { ...ENVELOPE, phase, seq, name, status: 'pending', repository: 'acme/demo', branch: 'main', ...extra },
    body: `\n# Phase ${pad(seq)} — ${name}\n\n**Objective:** x\n`,
  });
  return phase;
}
const seqs = (bare, dir) => { // the phases on the bare's main: [{file, seq}]
  const clone = mkdtempSync(join(dir, 'verify-'));
  git(dir, 'clone', '-q', bare, clone);
  return itemNames(join(clone, 'acme', 'demo')).map(f => ({ file: f, seq: store.load(join(clone, 'acme', 'demo')).find(i => i.path === itemRel(slugOfName(f))).fm.seq }));
};
const captureStdout = async fn => {
  const write = process.stdout.write; let out = '';
  process.stdout.write = c => { out += c; return true; };
  try { return { result: await fn(), out }; } finally { process.stdout.write = write; }
};
const rejects3 = async (promise, pattern) => {
  const e = await promise.then(() => null, x => x);
  assert.ok(e, 'expected a failure');
  assert.equal(e.exitCode, 3);
  assert.match(e.message, pattern);
  return e;
};

test('pull: fetches what another clone pushed, and the lock file is gone afterwards', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha');
  await sync.commitSettled(f.home2, f.folder2, 'new --name alpha');
  await sync.pull(f.home);
  assert.ok(existsSync(itemPath(f.folder, '001-alpha')));
  assert.equal(existsSync(join(f.home, '.git', 'smooth-backlog-cli.lock')), false);
});

test('pull: an unmergeable legacy commit is refused before rebasing', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'mine');
  mkdirSync(f.folder2, { recursive: true });
  writeFileSync(join(f.folder, 'README'), 'a\n'); writeFileSync(join(f.folder2, 'README'), 'b\n');
  git(f.home2, 'add', '-A'); git(f.home2, 'commit', '-qm', 'b'); git(f.home2, 'push', '-q');
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'a'); // conflicts with b on acme/demo/README
  const e = await rejects3(sync.pull(f.home), /has unpublished commits:[\s\S]*a[\s\S]*Nothing was changed/);
  assert.ok(e.message.includes(f.home));
  assert.equal(existsSync(join(f.home, '.git', 'rebase-merge')) || existsSync(join(f.home, '.git', 'rebase-apply')), false);
  assert.equal(existsSync(join(f.home, '.git', 'smooth-backlog-cli.lock')), false);
});

test('commit: commits "<owner>/<name>: <message>" and pushes; nothing staged means no empty commit', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  assert.deepEqual(await sync.commitSettled(f.home, f.folder, 'new --name alpha'), []);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new --name alpha');
  const before = git(f.bare, 'rev-parse', 'main');
  await sync.commitSettled(f.home, f.folder, 'again');
  assert.equal(git(f.bare, 'rev-parse', 'main'), before);
});

test('commit: stages only the repository folder', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  writeFileSync(join(f.home, 'stray.txt'), 'x');
  await sync.commitSettled(f.home, f.folder, 'm');
  assert.equal(git(f.home, 'ls-files', '--others', '--exclude-standard'), 'stray.txt');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('stray.txt'), false);
});

test('two clones create at once: both items reach the bare with different numbers', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 1, 'beta');
  await Promise.all([sync.commitSettled(f.home, f.folder, 'new alpha'), sync.commitSettled(f.home2, f.folder2, 'new beta')]);
  const got = seqs(f.bare, f.dir);
  assert.equal(got.length, 2);
  assert.deepEqual(got.map(g => g.seq).sort(), [1, 2]);
});

// Two clones change the order of the same branch from one base: the later publication hits a conflict on the index. It keeps what the
// first one published and puts its own item where its writer put it; the result is one order, each item once.
test('two clones rank different items from one base: the later publication keeps both placements in one dense order', async t => {
  const f = fixture(t);
  for (const [n, name] of [[1, 'alpha'], [2, 'beta'], [3, 'gamma']]) putItem(f.folder, n, name);
  await sync.commitSettled(f.home, f.folder, 'three items');
  git(f.home2, 'pull', '-q', '--rebase');
  store.reflow(f.folder, { slug: '003-gamma', target: 0 }); // amy: gamma first
  await sync.commitSettled(f.home, f.folder, 'amy ranks gamma');
  store.reflow(f.folder2, { slug: '002-beta', target: 0 }); // bob, from the same base: beta first
  await sync.commitSettled(f.home2, f.folder2, 'bob ranks beta');
  git(f.home, 'pull', '-q', '--rebase');
  for (const folder of [f.folder, f.folder2]) {
    const rows = index.open(index.rows(folder).rows);
    assert.deepEqual(rows.map(r => [r.slug, r.priority]), [['002-beta', 0], ['003-gamma', 1], ['001-alpha', 2]], `${folder}: bob's beta is first, amy's gamma stays ahead of alpha, no duplicate`);
  }
  assert.equal(git(f.home2, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  assert.equal(git(f.home2, 'status', '--porcelain'), '');
});

test('renumber: the later pusher gets nextSeq in file name, phase, seq and heading, and says so', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 1, 'beta');
  const line = store.addEvent(f.folder2, itemRel('001-beta'), { event: 'claimed', note: 'before the renumbering' });
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  const { result, out } = await captureStdout(() => sync.commitSettled(f.home2, f.folder2, 'new beta'));
  assert.equal(out, 'renumbered 001 -> 002\n');
  assert.deepEqual(result, [[1, 2]]);
  const beta = store.load(f.folder2).find(i => i.fm.name === 'beta');
  assert.deepEqual(beta.fm.events[0], line, 'the history survives a renumbering');
  assert.equal(beta.fm.events[1].step, 'renumber');
  assert.match(beta.fm.events[1].note, /^renumbered 001 -> 002$/);
  assert.equal(beta.fm.events.length, 2);
  assert.deepEqual(Object.keys(beta.fm.events[1].changes).sort(), ['seq', 'slug'], 'only what the renumbering changed, not an addition');
  assert.equal(beta.path, itemRel('002-beta'));
  assert.equal(beta.fm.phase, '002-beta'); assert.equal(beta.fm.seq, 2);
  assert.match(beta.body, /^\n# Phase 002 — beta\n/);
  assert.equal(existsSync(itemPath(f.folder2, '001-beta')), false);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new beta'); // amended, same message
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '3'); // init, alpha, beta: no extra commit
  assert.deepEqual(seqs(f.bare, f.dir), [{ file: itemName('001-alpha'), seq: 1 }, { file: itemName('002-beta'), seq: 2 }]);
});

test('renumber: skips numbers already taken', async t => {
  const f = fixture(t);
  store.write({ path: archivedPath(f.folder, '001-old', 'phases'), fm: { ...ENVELOPE, phase: '001-old', seq: 1, name: 'old', status: 'archived' }, body: 'b\n' });
  store.write({ path: itemPath(f.folder, '002-two'), fm: { ...ENVELOPE, phase: '002-two', seq: 2, name: 'two', status: 'pending' }, body: 'b\n' });
  await sync.commitSettled(f.home, f.folder, 'seed');
  await sync.pull(f.home2);
  putItem(f.folder, 3, 'gamma'); await sync.commitSettled(f.home, f.folder, 'gamma'); // 3 is taken on the bare
  putItem(f.folder2, 3, 'delta'); // the clone picked 3 before it saw gamma
  const { out } = await captureStdout(() => sync.commitSettled(f.home2, f.folder2, 'delta'));
  assert.equal(out, 'renumbered 003 -> 004\n');
});

test('renumber: a stale creation that collides only with an ARCHIVED item is renumbered', async t => {
  const f = fixture(t);
  store.write({ path: archivedPath(f.folder, '001-old', 'phases'), fm: { ...ENVELOPE, phase: '001-old', seq: 1, name: 'old', status: 'archived' }, body: 'b\n' });
  await sync.commitSettled(f.home, f.folder, 'archive old'); // home2 was cloned before this
  putItem(f.folder2, 1, 'delta'); // the stale clone picked 1
  const { result, out } = await captureStdout(() => sync.commitSettled(f.home2, f.folder2, 'new delta'));
  assert.equal(out, 'renumbered 001 -> 002\n');
  assert.deepEqual(result, [[1, 2]]);
  const delta = store.load(f.folder2).find(i => i.fm.name === 'delta');
  assert.equal(delta.path, itemRel('002-delta'));
  assert.equal(delta.fm.phase, '002-delta'); assert.equal(delta.fm.seq, 2);
  assert.match(delta.body, /^\n# Phase 002 — delta\n/);
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main'), `acme/demo/${archivedRel('001-old', 'phases')}\nacme/demo/index.json\nacme/demo/${itemRel('002-delta')}`);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new delta');
});

test('a distinct number is left alone: no renumber, nothing printed', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 2, 'beta');
  await sync.commitSettled(f.home, f.folder, 'a');
  const { result, out } = await captureStdout(() => sync.commitSettled(f.home2, f.folder2, 'b'));
  assert.deepEqual(result, []); assert.equal(out, '');
});

test('a bare that refuses pushes: exit 3, no unpublished commit, starting edits retained and token URL redacted', async t => {
  const f = fixture(t);
  const hook = join(f.bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "read-only: see https://user:SECRETTOKEN@example.com/x.git" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  putItem(f.folder, 1, 'alpha');
  const e = await rejects3(sync.commitSettled(f.home, f.folder, 'new alpha'), /change was not published.*push failed: .*read-only.*rolled back/s);
  assert.equal(e.message.includes('SECRETTOKEN'), false);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), git(f.bare, 'rev-parse', 'main'));
  assert.ok(existsSync(itemPath(f.folder, '001-alpha')), 'the input working edit remains');
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '1');
});

test('an index.lock held for a moment is retried', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  const lock = join(f.home, '.git', 'index.lock');
  writeFileSync(lock, '');
  setTimeout(() => rmSync(lock, { force: true }), 700);
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new alpha');
});

test('a folder outside the home is refused before git runs', async t => {
  const f = fixture(t);
  await assert.rejects(sync.commitSettled(f.home, join(f.dir, 'elsewhere'), 'm'));
});

// --- review fixes (job 8)
const withFakeGit = (t, dir, failCommand, nth = 1) => { // `git <failCommand>` fails from its nth call on; everything else runs the real git
  if (process.platform === 'win32') return false;
  const bin = join(dir, 'fakebin'); mkdirSync(bin);
  const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nif [ "$1" = "${failCommand}" ]; then\n  n=$(cat "${dir}/count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${dir}/count"\n  if [ "$n" -ge ${nth} ]; then echo "boom" >&2; exit 1; fi\nfi\nexec "${real}" "$@"\n`);
  chmodSync(join(bin, 'git'), 0o755);
  const old = process.env.PATH; process.env.PATH = `${bin}:${old}`; t.after(() => { process.env.PATH = old; });
  return true;
};

test('commit: a folder with wildcard characters stages only itself, not the sibling folders it would match', async t => {
  const f = fixture(t);
  const star = join(f.home, 'acme', '*');
  putItem(star, 1, 'alpha');
  putItem(f.folder, 1, 'sibling'); // acme/demo: changed, but not this commit's folder
  await sync.commitSettled(f.home, star, 'm');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main'), `acme/*/index.json\nacme/*/${itemRel('001-alpha')}`);
  assert.equal(git(f.home, 'ls-files', '--others', '--exclude-standard'), `acme/demo/${itemRel('001-sibling')}`);
});

test('commit: a failing git add is an error (exit 3), not a silent push without the change', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  if (!withFakeGit(t, f.dir, 'add')) return t.skip('needs a POSIX shell');
  await rejects3(sync.commitSettled(f.home, f.folder, 'new alpha'), /could not stage acme\/demo in .*boom/s);
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '1');
});

test('renumber: a failing git mv, or a failing git add of the renamed file, is an error (exit 3)', async t => {
  for (const [command, nth, pattern] of [['mv', 1, /could not move .*boom/s], ['add', 2, /could not stage .*boom/s]]) {
    const path = process.env.PATH; t.after(() => { process.env.PATH = path; }); // one fake git per round
    process.env.PATH = path;
    const f = fixture(t);
    putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 1, 'beta');
    await sync.commitSettled(f.home, f.folder, 'new alpha');
    if (!withFakeGit(t, f.dir, command, nth)) return t.skip('needs a POSIX shell');
    await rejects3(sync.commitSettled(f.home2, f.folder2, 'new beta'), pattern);
    assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '2', command); // beta never reached the bare
    process.env.PATH = path;
  }
});

test('add/add: two clones create the same numbered file name with different bodies; both reach the bare, the later one renumbered', async t => {
  const f = fixture(t);
  const make = (folder, body) => store.write({ path: itemPath(folder, '001-alpha'), fm: { ...ENVELOPE, phase: '001-alpha', seq: 1, name: 'alpha', status: 'pending', repository: 'acme/demo', branch: 'main' }, body });
  make(f.folder, '\n# Phase 001 — alpha\n\nfirst body\n');
  make(f.folder2, '\n# Phase 001 — alpha\n\nsecond body\n');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  const { result, out } = await captureStdout(() => sync.commitSettled(f.home2, f.folder2, 'new alpha again'));
  assert.equal(out, 'renumbered 001 -> 002\n');
  assert.deepEqual(result, [[1, 2]]);
  const clone = mkdtempSync(join(f.dir, 'verify-')); git(f.dir, 'clone', '-q', f.bare, clone);
  const items = store.load(join(clone, 'acme', 'demo'));
  const renumbered = items[1].fm.events.at(-1);
  assert.equal(renumbered.step, 'renumber');
  assert.deepEqual(Object.keys(renumbered.changes).sort(), ['seq', 'slug'], 'the conflict path records the real before too');
  assert.deepEqual(items.map(i => [i.path, i.fm.seq, i.fm.phase]), [[itemRel('001-alpha'), 1, '001-alpha'], [itemRel('002-alpha'), 2, '002-alpha']]);
  assert.match(items[0].body, /first body/); assert.doesNotMatch(items[0].body, /second body/);
  assert.match(items[1].body, /^\n# Phase 002 — alpha\n\nsecond body\n/);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new alpha again');
  assert.equal(existsSync(join(f.home2, '.git', 'rebase-merge')) || existsSync(join(f.home2, '.git', 'rebase-apply')), false);
});

test('add/add: a conflict on anything else (a file the caller names, changed differently by two clones) still aborts the rebase and exits 3', async t => {
  const f = fixture(t);
  writeFileSync(join(f.home, 'notes.json'), '{"a":1}\n'); writeFileSync(join(f.home2, 'notes.json'), '{"b":2}\n');
  await sync.commit(f.home, join(f.home, 'notes.json'), 'a');
  await rejects3(sync.commit(f.home2, join(f.home2, 'notes.json'), 'b'), /change was not published[\s\S]*rolled back/);
  assert.equal(existsSync(join(f.home2, '.git', 'rebase-merge')) || existsSync(join(f.home2, '.git', 'rebase-apply')), false);
});

test('a conflict on anything else (one item changed by both clones) still aborts the rebase and exits 3', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'a');
  git(f.home2, 'pull', '-q');
  for (const [folder, word] of [[f.folder, 'ten'], [f.folder2, 'twenty']]) store.write({ path: itemPath(folder, '001-alpha'), fm: { ...store.load(folder)[0].fm }, body: `\n# Phase 001 — alpha\n\n${word}\n` });
  await sync.commitSettled(f.home, f.folder, 'a2');
  await rejects3(sync.commitSettled(f.home2, f.folder2, 'b2'), /change was not published[\s\S]*rolled back/);
  assert.equal(existsSync(join(f.home2, '.git', 'rebase-merge')) || existsSync(join(f.home2, '.git', 'rebase-apply')), false);
});

test('review: renumbering the current command remaps LOCAL references (number, slug, split-from), never upstream\'s', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha'); putItem(f.folder2, 4, 'eta', { depends_on: [1], parent: 1 }); // upstream: its own 1 is alpha
  await sync.commitSettled(f.home2, f.folder2, 'upstream');
  putItem(f.folder, 1, 'beta'); putItem(f.folder, 2, 'gamma', { depends_on: [1] });
  const delta = putItem(f.folder, 3, 'delta', { depends_on: ['001-beta'] });
  store.write({ path: itemPath(f.folder, delta), fm: { ...store.load(f.folder).find(i => i.fm.phase === delta).fm, parent: 1 }, body: '\n# Phase 003 — delta\n\n## Split from `001-beta`. Inherited context:\n' });
  await captureStdout(() => sync.commitSettled(f.home, f.folder, 'local'));
  const by = name => store.load(f.folder).find(i => i.fm.name === name);
  assert.equal(by('beta').fm.seq, 5);
  assert.deepEqual(by('gamma').fm.depends_on, [5]);
  assert.deepEqual(by('delta').fm.depends_on, ['005-beta']);
  assert.match(by('delta').body, /Split from `005-beta`/);
  assert.equal(by('delta').fm.parent, 5, 'the parent field follows the renumbered source');
  assert.equal(by('eta').fm.parent, 1, "upstream's parent keeps its number");
  assert.deepEqual(by('eta').fm.depends_on, [1], "upstream's reference to its own item 1 keeps its number");
  assert.equal(git(f.home, 'status', '--porcelain'), '');
});

test('review: the same remap on the add/add recovery of a push', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha', { summary: 'upstream' });
  await sync.commitSettled(f.home2, f.folder2, 'upstream');
  putItem(f.folder, 1, 'alpha', { summary: 'local' }); // the same file name: add/add
  putItem(f.folder, 2, 'gamma', { depends_on: [1] }); putItem(f.folder, 3, 'delta', { depends_on: ['001-alpha'] });
  const write = process.stdout.write; process.stdout.write = () => true;
  try { await sync.commitSettled(f.home, f.folder, 'local'); } finally { process.stdout.write = write; }
  const by = name => store.load(f.folder).find(i => i.fm.name === name);
  const moved = store.load(f.folder).find(i => i.fm.summary === 'local');
  assert.equal(moved.fm.seq, 4);
  assert.deepEqual(by('gamma').fm.depends_on, [4]);
  assert.deepEqual(by('delta').fm.depends_on, ['004-alpha']);
  assert.equal(by('alpha') ? 1 : 0, 1);
});

test('pull and commit refuse an outstanding local commit, even a repairable sequence collision', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha'); await sync.commitSettled(f.home2, f.folder2, 'new alpha');
  putItem(f.folder, 1, 'beta');
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'acme/demo: new beta');
  const before = git(f.home, 'rev-parse', 'HEAD');
  for (const run of [() => sync.pull(f.home), () => sync.commitSettled(f.home, f.folder, 'nothing more')]) {
    await rejects3(run(), /unpublished commits:[\s\S]*new beta/);
    assert.equal(git(f.home, 'rev-parse', 'HEAD'), before);
    assert.equal(git(f.home, 'status', '--porcelain'), '');
  }
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('beta'), false);
});

// Review fixes (second review).
test('add/add: several conflicting additions whose front matter differs are all repaired (markers in another file do not stop the numbering)', async t => {
  const f = fixture(t);
  const make = (folder, seq, name, objective) => store.write({ path: itemPath(folder, `${pad(seq)}-${name}`), fm: { ...ENVELOPE, phase: `${pad(seq)}-${name}`, seq, name, objective, status: 'pending', repository: 'acme/demo', branch: 'main' }, body: `\n# Phase ${pad(seq)} — ${name}\n` });
  for (const [folder, who] of [[f.folder, 'first'], [f.folder2, 'second']]) { make(folder, 1, 'alpha', `${who} alpha`); make(folder, 2, 'beta', `${who} beta`); }
  await sync.commitSettled(f.home, f.folder, 'new alpha and beta');
  const { out } = await captureStdout(() => sync.commitSettled(f.home2, f.folder2, 'new alpha and beta again'));
  assert.equal(out, 'renumbered 001 -> 003\nrenumbered 002 -> 004\n');
  const clone = mkdtempSync(join(f.dir, 'verify-')); git(f.dir, 'clone', '-q', f.bare, clone);
  assert.deepEqual(store.load(join(clone, 'acme', 'demo')).map(i => [i.path, i.fm.seq, i.fm.objective]), [
    [itemRel('001-alpha'), 1, 'first alpha'], [itemRel('002-beta'), 2, 'first beta'], [itemRel('003-alpha'), 3, 'second alpha'], [itemRel('004-beta'), 4, 'second beta']]);
});

test('pull: refusing an old commit preserves its unstaged working edit', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha'); await sync.commitSettled(f.home2, f.folder2, 'new alpha');
  putItem(f.folder, 1, 'beta');
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'acme/demo: new beta');
  const file = itemPath(f.folder, '001-beta');
  changeItem(file, { body: readItem(file).body + '\nworking edit, not yet committed\n' });
  const before = readFileSync(file, 'utf8'); const index = git(f.home, 'ls-files', '--stage');
  await rejects3(sync.pull(f.home), /unpublished commits/);
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(git(f.home, 'ls-files', '--stage'), index);
  assert.equal(git(f.home, 'stash', 'list'), '');
});

test('review P2: commit takes only the repository folder: a file staged elsewhere stays staged and off origin; deletions in the folder are committed', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  putItem(f.folder, 2, 'beta');
  await sync.commitSettled(f.home, f.folder, 'seed');
  writeFileSync(join(f.home, 'stray.txt'), 'x');
  git(f.home, 'add', 'stray.txt');
  store.note(itemPath(f.folder, '001-alpha')); rmSync(itemPath(f.folder, '001-alpha')); // the command records its removals
  putItem(f.folder, 3, 'gamma');
  await sync.commitSettled(f.home, f.folder, 'second');
  const onOrigin = git(f.bare, 'ls-tree', '-r', '--name-only', 'main').split('\n');
  assert.equal(onOrigin.includes('stray.txt'), false, 'the unrelated staged file was pushed');
  assert.equal(onOrigin.includes(`acme/demo/${itemRel('001-alpha')}`), false, 'the deletion was not committed');
  assert.equal(onOrigin.includes(`acme/demo/${itemRel('003-gamma')}`), true);
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), 'stray.txt', 'still staged locally');
  // only a deletion, nothing else, in the folder
  store.note(itemPath(f.folder, '002-beta')); rmSync(itemPath(f.folder, '002-beta'));
  await sync.commitSettled(f.home, f.folder, 'third');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('002-beta'), false);
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), 'stray.txt');
});

test('review P2: refusing a legacy stack preserves all commits and unrelated staging', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'anchor');
  await sync.commitSettled(f.home, f.folder, 'seed');
  await sync.pull(f.home2);
  for (const [seq, note] of [[2, 'local one'], [3, 'local two']]) {
    putItem(f.folder, seq, `local-${seq}`);
    store.addEvent(f.folder, itemRel(`${String(seq).padStart(3, '0')}-local-${seq}`), { event: 'note', note });
    git(f.home, 'add', 'acme/demo'); git(f.home, 'commit', '-qm', note);
  }
  putItem(f.folder2, 4, 'remote');
  store.addEvent(f.folder2, itemRel('004-remote'), { event: 'note', note: 'remote' });
  await sync.commitSettled(f.home2, f.folder2, 'remote');
  writeFileSync(join(f.home, 'stray.txt'), 'private staged work');
  git(f.home, 'add', 'stray.txt');
  const staged = git(f.home, 'ls-files', '--stage', '--', 'stray.txt');
  const head = git(f.home, 'rev-parse', 'HEAD');
  await rejects3(sync.pull(f.home), /unpublished commits:[\s\S]*local two[\s\S]*local one/);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '2');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('stray.txt'), false);
  assert.equal(git(f.home, 'ls-files', '--stage', '--', 'stray.txt'), staged);
  assert.equal(readFileSync(join(f.home, 'stray.txt'), 'utf8'), 'private staged work');
  assert.deepEqual(store.load(f.folder).flatMap(i => i.fm.events ?? []).filter(e => e.step === 'note').map(e => e.note).sort(), ['local one', 'local two']);
});

test('pull: incoming commits preserve unrelated staged and unstaged versions separately', async t => {
  const f = fixture(t);
  mkdirSync(join(f.home, 'other', 'repo'), { recursive: true });
  const note = join(f.home, 'other', 'repo', 'notes.txt');
  writeFileSync(note, 'published note\n');
  git(f.home, 'add', 'other/repo'); git(f.home, 'commit', '-qm', 'seed private edit target'); git(f.home, 'push', '-q');
  await sync.pull(f.home2);
  writeFileSync(note, 'staged note\n'); git(f.home, 'add', 'other/repo');
  writeFileSync(note, 'unstaged note\n');
  const entry = git(f.home, 'ls-files', '--stage', '--', 'other/repo/notes.txt');
  putItem(f.folder2, 1, 'remote'); await sync.commitSettled(f.home2, f.folder2, 'remote');
  await sync.pull(f.home);
  assert.equal(git(f.home, 'ls-files', '--stage', '--', 'other/repo/notes.txt'), entry);
  assert.equal(readFileSync(note, 'utf8'), 'unstaged note\n');
  assert.ok(existsSync(itemPath(f.folder, '001-remote')));
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
});

// --- overlapping writers, ordered by a gate in the bare's pre-receive hook: the first push to arrive waits until released
function gate(f) {
  const dir = join(f.dir, 'gate'); mkdirSync(dir);
  const hook = join(f.bare, 'hooks', 'pre-receive');
  writeFileSync(hook, `#!/bin/sh\nif mkdir ${JSON.stringify(join(dir, 'entered'))} 2>/dev/null; then\n  while [ ! -e ${JSON.stringify(join(dir, 'release'))} ]; do sleep 0.05; done\nfi\nexit 0\n`);
  chmodSync(hook, 0o755);
  return {
    async entered() { for (let i = 0; i < 400 && !existsSync(join(dir, 'entered')); i++) await sleep(25); assert.ok(existsSync(join(dir, 'entered')), 'a push reached the gate'); },
    release() { writeFileSync(join(dir, 'release'), ''); },
  };
}
// A publication check after a publish step: the clone tree is clean, no database is published, and the published phases match.
const assertPublish = (f, home, folder, files) => {
  assert.equal(git(home, 'status', '--porcelain', '--untracked-files=all'), '', 'the clone tree is clean after the publish');
  assert.ok(!git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('backlog.db'), 'no database is published');
  assert.deepEqual(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(x => x.includes('phases/')).sort(), files, 'the published phases');
};

// `backlog new` run as a separate process (a writer), on the given clone. stdout and stderr are kept separate.
const cliNew = (f, home, cons, name, extra = {}) => new Promise(done => {
  const bin = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js');
  mkdirSync(join(f.dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  const p = spawn(process.execPath, [bin, 'new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'],
    { cwd: cons, env: { ...process.env, ...env(f.dir), SMOOTH_BACKLOG_CLI_HOME: home, SMOOTH_BACKLOG_CLI_AGENT: name.toLowerCase(), ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; let err = '';
  p.stdout.on('data', c => { out += c; });
  p.stderr.on('data', c => { err += c; });
  p.on('close', status => done({ status, out, err }));
});

test('075: overlapping writers, the other writer first: a CLI commit held at its push while a second CLI creates and pushes 1 is renumbered to 2', async t => {
  const f = fixture(t);
  const cons = consumer(f.dir, 'acme', 'demo', 'main'); // home's consumer
  const cons2 = join(f.dir, 'cons2');
  git(f.dir, 'clone', '-q', join(f.dir, 'origins', 'acme', 'demo.git'), cons2); // home2's consumer
  const g = gate(f);
  const aP = cliNew(f, f.home2, cons2, 'Nodeitem'); // writer A in home2; its push will be held at the gate
  try {
    await g.entered(); // A's commit is made locally and is inside its first push
    const b = await cliNew(f, f.home, cons, 'Otheritem'); // writer B in home lands 001-otheritem, before the release
    g.release(); // A's push is released and renumbered to 002-nodeitem
    const a = await aP; // the held writer settles
    assert.equal(a.status, 0, a.out + a.err);
    assert.equal(a.out, 'renumbered 001 -> 002\n✅ created phase 002-nodeitem (seq 2) — appended, now at P0\n   📋 planning event: backlog re-densified to 1 item(s) (P0..P0)\n');
    assert.equal(a.err, '');
    assert.equal(b.status, 0, b.out + b.err);
    assert.equal(b.out, '✅ created phase 001-otheritem (seq 1) — appended, now at P0\n   📋 planning event: backlog re-densified to 1 item(s) (P0..P0)\n');
    assert.equal(b.err, '');
    assertPublish(f, f.home2, f.folder2, [`acme/demo/${itemRel('001-otheritem')}`, `acme/demo/${itemRel('002-nodeitem')}`]); // the last publisher's mirror equals the published database
    const ev = cli(['history', '2'], { cwd: cons2, tmp: f.dir, env: { SMOOTH_BACKLOG_CLI_HOME: f.home2 } });
    assert.match(ev.stdout, /renumbered.*001 -> 002/, ev.stdout + ev.stderr); // the history line of the renumbering is in the item
    assert.equal(git(f.home, 'status', '--porcelain', '--untracked-files=all'), '', "B's clone tree is clean too");
  } finally { g.release(); } // never leave the held push (and its hook) running
});

test('075: CLI steps publish a clean, in-sync state: after new, archive and an overlapping pair the tree is clean and the local mirror equals the published database', async t => {
  const f = fixture(t);
  const cons = consumer(f.dir, 'acme', 'demo', 'main');
  mkdirSync(join(f.dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = (args, exact) => { const r = cli(args, { cwd: cons, tmp: f.dir }); assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(r.stdout, exact); assert.equal(r.stderr, ''); };
  run(['new', '--name', 'Alpha', '--objective', 'o', '--summary', 's', '--depends-on', 'none'],
    '✅ created phase 001-alpha (seq 1) — appended, now at P0\n   📋 planning event: backlog re-densified to 1 item(s) (P0..P0)\n');
  assertPublish(f, f.home, f.folder, [`acme/demo/${itemRel('001-alpha')}`]);
  run(['new', '--name', 'Beta', '--objective', 'o', '--summary', 's', '--depends-on', 'none'],
    '✅ created phase 002-beta (seq 2) — appended, now at P1\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
  assertPublish(f, f.home, f.folder, [`acme/demo/${itemRel('001-alpha')}`, `acme/demo/${itemRel('002-beta')}`]);
  run(['archive', '2', '--force'],
    '📦 002-beta archived\n   📋 planning event: backlog re-densified to 1 item(s) (P0..P0)\n');
  assertPublish(f, f.home, f.folder, [`acme/demo/${archivedRel('002-beta', 'phases')}`, `acme/demo/${itemRel('001-alpha')}`]);
  // overlapping writers: two `new` in the same clone overlap on the run lock; both land and the state stays published
  const g = gate(f);
  const aP = cliNew(f, f.home, cons, 'Gamma'); // its push will be held at the gate
  try {
    await g.entered(); // its push is inside the gate (it holds the run lock)
    const bP = cliNew(f, f.home, cons, 'Delta', { SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS: '60000' }); // the second writer waits on the run lock
    g.release(); // the first publishes 003-gamma, then the second acquires the lock and publishes 004-delta
    const [a, b] = await Promise.all([aP, bP]);
    assert.equal(a.status, 0, a.out + a.err);
    assert.equal(a.out, '✅ created phase 003-gamma (seq 3) — appended, now at P1\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
    assert.equal(a.err, '');
    assert.equal(b.status, 0, b.out + b.err);
    assert.equal(b.out, '✅ created phase 004-delta (seq 4) — appended, now at P2\n   📋 planning event: backlog re-densified to 3 item(s) (P0..P2)\n');
    assert.equal(b.err, '');
    assertPublish(f, f.home, f.folder, [`acme/demo/${archivedRel('002-beta', 'phases')}`, `acme/demo/${itemRel('001-alpha')}`, `acme/demo/${itemRel('003-gamma')}`, `acme/demo/${itemRel('004-delta')}`]);
  } finally { g.release(); } // never leave the held push (and its hook) running
});

test('075: overlapping writers, the same clone: a commit held at its push keeps its number when the second CLI writer in the same clone publishes item 2 on top of it', async t => {
  const f = fixture(t);
  const cons = consumer(f.dir, 'acme', 'demo', 'main');
  const g = gate(f);
  const aP = cliNew(f, f.home, cons, 'Nodeitem'); // writer 1; its commit is made locally and its first push is held at the gate
  try {
    await g.entered(); // the push is inside the gate (writer 1 holds the run lock)
    const bP = cliNew(f, f.home, cons, 'Otheritem', { SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS: '60000' }); // writer 2 in the same clone waits on the run lock
    g.release(); // writer 1 publishes 001-nodeitem, then writer 2 acquires the lock and publishes 002-otheritem on top of the held commit
    const [a, b] = await Promise.all([aP, bP]);
    assert.equal(a.status, 0, a.out + a.err);
    assert.equal(a.out, '✅ created phase 001-nodeitem (seq 1) — appended, now at P0\n   📋 planning event: backlog re-densified to 1 item(s) (P0..P0)\n');
    assert.equal(a.err, '', 'the held writer settles without renumbering: its number is kept, no renumbered line');
    assert.equal(b.status, 0, b.out + b.err);
    assert.equal(b.out, '✅ created phase 002-otheritem (seq 2) — appended, now at P1\n   📋 planning event: backlog re-densified to 2 item(s) (P0..P1)\n');
    assert.equal(b.err, '');
    assertPublish(f, f.home, f.folder, [`acme/demo/${itemRel('001-nodeitem')}`, `acme/demo/${itemRel('002-otheritem')}`]); // the last publisher's mirror equals the published database
    assert.deepEqual(seqs(f.bare, f.dir), [{ file: itemName('001-nodeitem'), seq: 1 }, { file: itemName('002-otheritem'), seq: 2 }]); // the held commit kept 1; item 2 was published on top of it
  } finally { g.release(); } // never leave the held push (and its hook) running
});

test('two clones share the items through git alone: no database travels', t => {
  const f = fixture(t);
  const cons = consumer(f.dir, 'acme', 'demo', 'main');
  mkdirSync(join(f.dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = (args, home) => cli(args, { cwd: cons, tmp: f.dir, env: { SMOOTH_BACKLOG_CLI_HOME: home } });
  const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'];
  const names = r => JSON.parse(r.stdout).phases.map(p => p.name).sort();
  assert.equal(run(NEW('From A'), f.home).status, 0);
  const qb = run(['list', '--json'], f.home2);
  assert.equal(qb.status, 0, qb.stdout + qb.stderr);
  assert.deepEqual(names(qb), ['From A'], 'the second clone pulled and rebuilt its cache');
  assert.equal(run(NEW('From B'), f.home2).status, 0);
  const qa = run(['list', '--json'], f.home);
  assert.deepEqual(names(qa), ['From A', 'From B']);
  assert.ok(!git(f.home, 'ls-files').includes('.db'), 'no database is tracked');
  // a database left over from before is ignored and never deleted by the CLI
  const stale = join(f.folder, 'backlog.db');
  writeFileSync(stale, 'stale');
  assert.equal(run(['list'], f.home).status, 0);
  assert.equal(readFileSync(stale, 'utf8'), 'stale');
});

test('a command stages only its item files, index.json and numbers.json: a changed team file, a template and a stray file of the folder stay out of the commit', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  writeFileSync(join(f.folder, 'teams.json'), '{}\n'); mkdirSync(join(f.folder, 'team-templates'), { recursive: true }); writeFileSync(join(f.folder, 'team-templates', 'x.txt'), 'x\n');
  git(f.home, 'add', '-Af'); git(f.home, 'commit', '-q', '-m', 'the lead committed a team file'); git(f.home, 'push', '-q');
  writeFileSync(join(f.folder, 'teams.json'), '{"draft":true}\n'); writeFileSync(join(f.folder, 'team-templates', 'x.txt'), 'y\n'); writeFileSync(join(f.folder, 'stray.json'), '{}\n');
  putItem(f.folder, 2, 'beta');
  await sync.commitSettled(f.home, f.folder, 'new beta');
  const files = git(f.home, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean);
  assert.ok(files.includes(`acme/demo/${itemRel('002-beta')}`), files.join(','));
  assert.ok(files.every(x => /(phases\/.+|index\.json|numbers\.json)$/.test(x)), `only owned paths: ${files.join(',')}`);
  assert.equal(readFileSync(join(f.folder, 'teams.json'), 'utf8'), '{"draft":true}\n', 'the draft is untouched');
  assert.deepEqual(git(f.home, 'status', '--porcelain', '--untracked-files=all').split('\n').map(l => l.trim().split(' ').pop()).sort(), ['acme/demo/stray.json', 'acme/demo/team-templates/x.txt', 'acme/demo/teams.json']);
});

test('a later write of the same command keeps every entry of the document it writes, the other clone\'s included', t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  const path = itemPath(f.folder, '001-alpha');
  const foreign = { at: '2026-01-01T00:00:00Z', by: 'bob', session: '', step: 'update', changes: { summary: ['a', 'b'] }, note: 'the other clone' };
  guarded(() => {
    store.addEvent(f.folder, itemRel('001-alpha'), { event: 'update', note: 'mine' });
    const doc = store.load(f.folder)[0]; // the file as a rebase leaves it: the other clone's entry next to the command's own
    store.write({ path, fm: { ...doc.fm, events: [foreign, ...doc.fm.events], summary: 'remapped' }, body: doc.body });
  });
  const events = store.load(f.folder)[0].fm.events;
  assert.deepEqual(events.map(e => e.note), ['the other clone', 'mine', '']);
  assert.deepEqual(events[1].changes, {}, "the command's entry holds only the command's own changes");
  assert.deepEqual([events[2].step, Object.keys(events[2].changes)], ['renumber', ['summary']], 'the later writer has an entry of its own');
});

test('the command\'s own entry is replaced by its last equal one only: an earlier identical entry survives', t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  guarded(() => {
    store.addEvent(f.folder, itemRel('001-alpha'), { event: 'update', note: 'same' });
    const own = store.load(f.folder)[0].fm.events[0];
    const doc = store.load(f.folder)[0];
    store.write({ path: itemPath(f.folder, '001-alpha'), fm: { ...doc.fm, events: [{ ...own }, own] }, body: doc.body }); // an equal entry before it
    store.addEvent(f.folder, itemRel('001-alpha'), { event: 'planning_event', note: 'planning' });
  });
  assert.equal(store.load(f.folder)[0].fm.events.length, 2);
});

test('an earlier entry equal to the command\'s own is kept: the last equal one is the one replaced', t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  const path = itemPath(f.folder, '001-alpha');
  const other = { at: '2026-01-01T00:00:00Z', by: 'bob', session: '', step: 'update', changes: {}, note: 'X' };
  guarded(() => {
    const doc = store.load(f.folder)[0];
    store.write({ path, fm: { ...doc.fm, summary: 'changed' }, body: doc.body });
    store.addEvent(f.folder, itemRel('001-alpha'), { event: 'update' }); // the command's entry, no note yet
    const now = store.load(f.folder)[0];
    const own = now.fm.events.at(-1);
    writeFileSync(path, dumpItem({ ...now.fm, events: [...now.fm.events.slice(0, -1), { ...own }, other, own] }, now.body)); // an equal entry before the other clone's
    store.addEvent(f.folder, itemRel('001-alpha'), { event: 'planning_event', note: 'planning' });
  });
  assert.deepEqual(store.load(f.folder)[0].fm.events.map(e => e.note), ['', 'X', 'planning']);
});
