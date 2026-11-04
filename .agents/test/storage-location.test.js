// Where the item files live is one resolution step: a backlog repository clone when one is configured, else a folder
// inside the repository. The commands above that step do not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GIT_IDENTITY, ORIGIN_URL, cli, consumer } from './shared-fixtures.js';

function world(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'backlog-location-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = consumer(tmp, 'acme', 'demo', 'main');
  // no BACKLOG_HOME, no BACKLOG_ORIGIN_URL, no .smooth-backlog.json: the items live inside the repository
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: join(tmp, 'config'), HOME: join(tmp, 'userhome'), BACKLOG_ORIGIN_URL: '', BACKLOG_HOME: '' };
  mkdirSync(env.HOME, { recursive: true });
  const run = (args, extra = {}) => cli(args, { cwd: extra.cwd ?? repo, env: { ...env, ...extra.env } });
  return { tmp, repo, env, run };
}
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }).stdout.trim();

test('without a configured backlog repository the items live in <repo>/.backlog, whatever the origin', t => {
  const { repo, run } = world(t);
  const r = run(['new', '--name', 'x', '--objective', 'o', '--summary', 's', '--depends-on', 'none']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(repo, '.backlog', 'local', 'repository', 'phases', '001-x.md')), 'the item file is inside the repository');
  assert.equal(readFileSync(join(repo, '.backlog', '.gitignore'), 'utf8').trim(), '.state/');
  const q = run(['query', '--phase', '1', '--json']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).name, 'x');
  // the change is committed on the repository's branch, with the backlog's paths only, and pushed
  assert.equal(git(repo, 'status', '--porcelain', '--untracked-files=all'), '', 'nothing left uncommitted');
  assert.ok(git(repo, 'ls-files').includes('.backlog/local/repository/phases/001-x.md'));
  assert.ok(!git(repo, 'ls-files').includes('.state/'), 'the lock, views and journal are not committed with the repository');
  assert.equal(git(repo, 'rev-list', '--count', 'origin/main..HEAD'), '0', 'pushed');
  assert.match(git(repo, 'log', '-1', '--format=%s'), /^backlog: /);
});

test('work staged elsewhere in the repository is left staged, not committed with the backlog', t => {
  const { repo, run } = world(t);
  writeFileSync(join(repo, 'other.txt'), 'mine\n');
  git(repo, 'add', 'other.txt');
  assert.equal(run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  assert.equal(git(repo, 'status', '--porcelain', '--', 'other.txt'), 'A  other.txt');
  assert.ok(!git(repo, 'show', '--stat', '--format=', 'HEAD').includes('other.txt'));
});

test('a read in a repository with no backlog creates no item folder', t => {
  const { repo, run } = world(t);
  const q = run(['query']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.match(q.stdout, /no backlog yet/);
  assert.ok(!existsSync(join(repo, '.backlog', 'acme')), 'no item folder');
});

test('inside the repository the items survive a renamed folder and a changed origin', t => {
  const { tmp, run } = world(t);
  const alone = join(tmp, 'alone');
  mkdirSync(alone);
  spawnSync('git', ['init', '-q', '-b', 'main', alone]);
  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: alone, env: { ...process.env, ...GIT_IDENTITY } });
  // no origin: the change is committed but cannot be pushed - refused with exit 3, the commit kept
  const r = run(['new', '--name', 'x', '--objective', 'o', '--summary', 's'], { cwd: alone });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /was not published [^]*it is committed on this branch/);
  assert.match(git(alone, 'log', '-1', '--format=%s'), /^backlog: /);
  const bare = join(tmp, 'alone.git');
  spawnSync('git', ['init', '-q', '--bare', bare]);
  spawnSync('git', ['remote', 'add', 'origin', bare], { cwd: alone });
  const moved = join(tmp, 'renamed');
  renameSync(alone, moved);
  spawnSync('git', ['remote', 'set-url', 'origin', bare], { cwd: moved }); // a changed origin
  const q = run(['query', '--phase', '1', '--json'], { cwd: moved });
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).name, 'x');
  assert.deepEqual(JSON.parse(run(['query', '--json'], { cwd: moved }).stdout).phases.map(p => p.seq), [1]);
  const u = run(['update', '1', '--status', 'in_progress'], { cwd: moved });
  assert.equal(u.status, 0, u.stdout + u.stderr);
  assert.equal(git(moved, 'rev-list', '--count', 'origin/main..HEAD'), '0', 'pushed once the origin exists');
});

test('outside a git repository nothing is created and the error says so', t => {
  const { tmp, run } = world(t);
  const plain = join(tmp, 'plain');
  mkdirSync(plain);
  const r = run(['query'], { cwd: plain });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /inside a git repository/);
  assert.ok(!existsSync(join(plain, '.backlog')), 'nothing was created');
});

test('a configured backlog repository that is not cloned is an error naming backlog setup, not a silent fallback', t => {
  const { repo, run } = world(t);
  const r = run(['query'], { env: { BACKLOG_ORIGIN_URL: ORIGIN_URL } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /backlog setup/);
  assert.ok(!existsSync(join(repo, '.backlog')), 'nothing was created inside the repository');
});
