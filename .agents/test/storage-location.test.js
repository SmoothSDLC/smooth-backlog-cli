// Where the item files live is one resolution step: a backlog repository clone when one is configured, else a folder
// inside the repository. The commands above that step do not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GIT_IDENTITY, ORIGIN_URL, cli, consumer } from './shared-fixtures.js';

function world(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'backlog-location-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = consumer(tmp, 'acme', 'demo', 'main');
  const config = join(tmp, 'config', 'smooth-backlog-cli');
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, 'mode.json'), '{"mode":"shared"}'); // until the mode file is gone: the one command set
  // no BACKLOG_HOME, no BACKLOG_ORIGIN_URL, no .smooth-backlog.json: the items live inside the repository
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: join(tmp, 'config'), HOME: join(tmp, 'userhome'), BACKLOG_ORIGIN_URL: '' };
  mkdirSync(env.HOME, { recursive: true });
  const run = (args, extra = {}) => cli(args, { cwd: extra.cwd ?? repo, env: { ...env, ...extra.env } });
  return { tmp, repo, env, run };
}
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }).stdout.trim();

test('without a configured backlog repository the items live in <repo>/.backlog/<owner>/<name>', t => {
  const { repo, run } = world(t);
  const r = run(['new', '--name', 'x', '--objective', 'o', '--summary', 's', '--depends-on', 'none']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(repo, '.backlog', 'acme', 'demo', 'phases', '001-x.md')), 'the item file is inside the repository');
  assert.equal(readFileSync(join(repo, '.backlog', '.gitignore'), 'utf8').trim(), '.state/');
  const q = run(['query', '--phase', '1', '--json']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).name, 'x');
  const status = git(repo, 'status', '--porcelain', '--untracked-files=all');
  assert.ok(status.includes('.backlog/acme/demo/phases/001-x.md'), status);
  assert.ok(!status.includes('.state'), `the lock, views and journal are not committed with the repository:\n${status}`);
});

test('a read in a repository with no backlog creates no item folder', t => {
  const { repo, run } = world(t);
  const q = run(['query']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.match(q.stdout, /no backlog yet/);
  assert.ok(!existsSync(join(repo, '.backlog', 'acme')), 'no item folder');
});

test('a repository without an origin remote gets the repository id local/<folder name>', t => {
  const { tmp, run } = world(t);
  const alone = join(tmp, 'alone');
  mkdirSync(alone);
  spawnSync('git', ['init', '-q', '-b', 'main', alone]);
  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: alone, env: { ...process.env, ...GIT_IDENTITY } });
  const r = run(['new', '--name', 'x', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: alone });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const q = run(['query', '--phase', '1', '--json'], { cwd: alone });
  assert.equal(JSON.parse(q.stdout).repository, 'local/alone');
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
