// Tests for src/shared/sync.js — cli-parity job 8 (SYNC: pull, commit and push of the shared
// backlog repository). Oracle: lib_db.py:101-110 (pull), 275-309 (commit), the pinned ec5b254e.
// Tests use only local bare repos from shared-fixtures.js (job 1), with BACKLOG_HOME and
// XDG_CONFIG_HOME inside the test's temp dir — never the real backlog repository or ~/.config.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';

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
  const bare = join(dir, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git');
  const home2 = join(dir, 'home2');
  git(dir, 'clone', '-q', bare, home2);
  return { dir, bare, home, home2, folder: join(home, 'acme', 'demo'), folder2: join(home2, 'acme', 'demo') };
}

const pad = n => String(n).padStart(3, '0');
function putItem(folder, seq, name, extra = {}) {
  const phase = `${pad(seq)}-${name}`;
  store.write({
    path: join(folder, 'phases', `${phase}.md`),
    fm: { phase, seq, name, status: 'pending', repository: 'acme/demo', branch: 'main', ...extra },
    body: `\n# Phase ${pad(seq)} — ${name}\n\n**Objective:** x\n`,
  });
  return phase;
}
const seqs = (bare, dir) => { // the phases on the bare's main: [{file, seq}]
  const clone = mkdtempSync(join(dir, 'verify-'));
  git(dir, 'clone', '-q', bare, clone);
  return readdirSync(join(clone, 'acme', 'demo', 'phases')).sort().map(f => ({ file: f, seq: store.load(join(clone, 'acme', 'demo')).find(i => i.path === `phases/${f}`).fm.seq }));
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
  await sync.commit(f.home2, f.folder2, 'new_phase.py --name alpha');
  await sync.pull(f.home);
  assert.ok(existsSync(join(f.folder, 'phases', '001-alpha.md')));
  assert.equal(existsSync(join(f.home, '.git', 'smooth-backlog-cli.lock')), false);
});

test('pull: a failing pull aborts the rebase and exits 3 with the lib_db.py message', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'mine');
  mkdirSync(f.folder2, { recursive: true });
  writeFileSync(join(f.folder, 'README'), 'a\n'); writeFileSync(join(f.folder2, 'README'), 'b\n');
  git(f.home2, 'add', '-A'); git(f.home2, 'commit', '-qm', 'b'); git(f.home2, 'push', '-q');
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'a'); // conflicts with b on acme/demo/README
  const e = await rejects3(sync.pull(f.home), /^could not update .* from origin\/main \(.*\); nothing was read or changed, because the local copy may be stale\. Fix the cause, then run the command again$/s);
  assert.ok(e.message.includes(f.home));
  assert.equal(existsSync(join(f.home, '.git', 'rebase-merge')) || existsSync(join(f.home, '.git', 'rebase-apply')), false);
  assert.equal(existsSync(join(f.home, '.git', 'smooth-backlog-cli.lock')), false);
});

test('commit: commits "<owner>/<name>: <message>" and pushes; nothing staged means no empty commit', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  assert.deepEqual(await sync.commit(f.home, f.folder, 'new_phase.py --name alpha'), []);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new_phase.py --name alpha');
  const before = git(f.bare, 'rev-parse', 'main');
  await sync.commit(f.home, f.folder, 'again');
  assert.equal(git(f.bare, 'rev-parse', 'main'), before);
});

test('commit: stages only the repository folder', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  writeFileSync(join(f.home, 'stray.txt'), 'x');
  await sync.commit(f.home, f.folder, 'm');
  assert.equal(git(f.home, 'ls-files', '--others', '--exclude-standard'), 'stray.txt');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('stray.txt'), false);
});

test('two clones create at once: both items reach the bare with different numbers', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 1, 'beta');
  await Promise.all([sync.commit(f.home, f.folder, 'new alpha'), sync.commit(f.home2, f.folder2, 'new beta')]);
  const got = seqs(f.bare, f.dir);
  assert.equal(got.length, 2);
  assert.deepEqual(got.map(g => g.seq).sort(), [1, 2]);
});

test('renumber: the later pusher gets nextSeq in file name, phase, seq and heading, and says so', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 1, 'beta');
  await sync.commit(f.home, f.folder, 'new alpha');
  const { result, out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'new beta'));
  assert.equal(out, 'renumbered 001 -> 002\n');
  assert.deepEqual(result, [[1, 2]]);
  const beta = store.load(f.folder2).find(i => i.fm.name === 'beta');
  assert.equal(beta.path, 'phases/002-beta.md');
  assert.equal(beta.fm.phase, '002-beta'); assert.equal(beta.fm.seq, 2);
  assert.match(beta.body, /^\n# Phase 002 — beta\n/);
  assert.equal(existsSync(join(f.folder2, 'phases', '001-beta.md')), false);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new beta'); // amended, same message
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '3'); // init, alpha, beta: no extra commit
  assert.deepEqual(seqs(f.bare, f.dir), [{ file: '001-alpha.md', seq: 1 }, { file: '002-beta.md', seq: 2 }]);
});

test('renumber: collides with an archived item too, and skips numbers already taken', async t => {
  const f = fixture(t);
  store.write({ path: join(f.folder, 'archive', 'phases', '001-old.md'), fm: { phase: '001-old', seq: 1, name: 'old', status: 'archived' }, body: 'b\n' });
  store.write({ path: join(f.folder, 'phases', '002-two.md'), fm: { phase: '002-two', seq: 2, name: 'two', status: 'pending' }, body: 'b\n' });
  await sync.commit(f.home, f.folder, 'seed');
  await sync.pull(f.home2);
  putItem(f.folder, 3, 'gamma'); await sync.commit(f.home, f.folder, 'gamma'); // 3 is taken on the bare
  putItem(f.folder2, 3, 'delta'); // the clone picked 3 before it saw gamma
  const { out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'delta'));
  assert.equal(out, 'renumbered 003 -> 004\n');
});

test('a distinct number is left alone: no renumber, nothing printed', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 2, 'beta');
  await sync.commit(f.home, f.folder, 'a');
  const { result, out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'b'));
  assert.deepEqual(result, []); assert.equal(out, '');
});

test('Node and Python new_phase.py at once end with distinct numbers', async t => {
  const f = fixture(t);
  const cons = consumer(f.dir, 'acme', 'demo', 'main');
  const args = ['--name', 'Pyitem', '--objective', 'o', '--summary', 's', '--depends-on', 'none'];
  putItem(f.folder2, 1, 'nodeitem'); // Node picked 1 from a stale clone ...
  const r = py('new_phase.py', args, { cwd: cons, tmp: f.dir }); // ... while Python created and pushed 1
  if (!r) { t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing'); return; }
  assert.equal(r.status, 0, r.stdout + r.stderr);
  await sync.commit(f.home2, f.folder2, 'new nodeitem');
  assert.deepEqual(seqs(f.bare, f.dir), [{ file: '001-pyitem.md', seq: 1 }, { file: '002-nodeitem.md', seq: 2 }]);
});

test('a bare that refuses pushes: exit 3 with the committed-but-not-pushed message; the change stays committed; a token URL is never printed', async t => {
  const f = fixture(t);
  const hook = join(f.bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "read-only: see https://user:SECRETTOKEN@example.com/x.git" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  putItem(f.folder, 1, 'alpha');
  const e = await rejects3(sync.commit(f.home, f.folder, 'new alpha'), /^the change is committed in .* but NOT on origin\/main \(push failed: .*read-only.*\)\. It is not recorded until it is pushed: fix the cause and run 'git -C .* pull --rebase && git -C .* push'$/s);
  assert.equal(e.message.includes('SECRETTOKEN'), false);
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), 'acme/demo: new alpha');
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '1');
});

test('an index.lock held for a moment is retried', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  const lock = join(f.home, '.git', 'index.lock');
  writeFileSync(lock, '');
  setTimeout(() => rmSync(lock, { force: true }), 700);
  await sync.commit(f.home, f.folder, 'new alpha');
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new alpha');
});

test('a folder outside the home is refused before git runs', async t => {
  const f = fixture(t);
  await assert.rejects(sync.commit(f.home, join(f.dir, 'elsewhere'), 'm'));
});
