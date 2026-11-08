// Where the item files live is one resolution step: a backlog repository clone when one is configured, else a folder
// inside the repository. The commands above that step do not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GIT_IDENTITY, ORIGIN_URL, cli, consumer } from './shared-fixtures.js';

function world(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'backlog-location-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = consumer(tmp, 'acme', 'demo', 'main');
  // no BACKLOG_HOME, no BACKLOG_ORIGIN_URL: `backlog setup` records .backlog inside the repository as the storage location
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: join(tmp, 'config'), HOME: join(tmp, 'userhome'), BACKLOG_ORIGIN_URL: '', BACKLOG_HOME: '' };
  mkdirSync(env.HOME, { recursive: true });
  const run = (args, extra = {}) => cli(args, { cwd: extra.cwd ?? repo, env: { ...env, ...extra.env } });
  const setup = (cwd = repo) => { const r = run(['setup'], { cwd }); if (r.status !== 0) throw new Error(r.stdout + r.stderr); return r; };
  return { tmp, repo, env, run, setup };
}
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }).stdout.trim();

test('nothing configured: the backlog is .backlog inside the repository, created with its config on first use', t => {
  const { repo, run } = world(t);
  const r = run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(repo, '.backlog', 'config.json'), 'utf8')), { backlog_repository: '.backlog' }, 'the config lives in .backlog');
  assert.ok(existsSync(join(repo, '.backlog', 'local', 'repository', 'phases', '001-x.md')), 'the item file is inside the repository');
  assert.equal(readFileSync(join(repo, '.backlog', '.gitignore'), 'utf8').trim(), '.state/');
  const q = run(['show', '1', '--json']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).name, 'x');
  // the change is committed on the repository's branch, with the backlog's paths only (config included), and pushed
  assert.equal(git(repo, 'status', '--porcelain', '--untracked-files=all'), '', 'nothing left uncommitted');
  assert.ok(git(repo, 'ls-files').includes('.backlog/config.json'));
  assert.ok(!git(repo, 'ls-files').includes('.state/'), 'the lock, views and journal are not committed with the repository');
  assert.ok(!git(repo, 'ls-files').includes('.db'), 'no database is committed');
  assert.equal(git(repo, 'rev-list', '--count', 'origin/main..HEAD'), '0', 'pushed');
  assert.match(git(repo, 'log', '-1', '--format=%s'), /^backlog: /);
});

test('setup records the location in .backlog/config.json, deploys the skill, commits and pushes; it names no folder path', t => {
  const { repo, run, setup } = world(t);
  mkdirSync(join(repo, '.agents'));
  const s = setup();
  assert.doesNotMatch(s.stdout, new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'setup names no folder path');
  const written = JSON.parse(readFileSync(join(repo, '.backlog', 'config.json'), 'utf8')); // setup also records the user and an empty team
  assert.ok(typeof written.user === 'string' && written.user);
  assert.deepEqual({ ...written, user: undefined }, { backlog_repository: '.backlog', user: undefined, team: '' });
  assert.ok(existsSync(join(repo, '.agents', 'skills', 'backlog', 'SKILL.md')));
  assert.equal(git(repo, 'status', '--porcelain'), '', 'setup commits what it wrote');
  assert.equal(git(repo, 'rev-list', '--count', 'origin/main..HEAD'), '0', 'and pushes it');
  assert.match(git(repo, 'log', '-1', '--format=%s'), /^backlog: setup/);
  assert.equal(run(['list']).status, 0);
});

test('the root file .smooth-backlog.json of earlier builds is still read when .backlog has no config', t => {
  const { tmp, repo, run } = world(t);
  const clone = join(tmp, 'elsewhere'); mkdirSync(clone);
  spawnSync('git', ['init', '-q', '-b', 'main', clone]);
  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: clone, env: { ...process.env, ...GIT_IDENTITY } });
  spawnSync('git', ['init', '-q', '--bare', join(tmp, 'elsewhere.git')]);
  spawnSync('git', ['remote', 'add', 'origin', join(tmp, 'elsewhere.git')], { cwd: clone });
  spawnSync('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: clone });
  writeFileSync(join(repo, '.smooth-backlog.json'), JSON.stringify({ backlog_repository: relative(repo, clone) }));
  assert.equal(run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  assert.ok(existsSync(join(clone, 'acme', 'demo', 'phases', '001-x.md')), 'the items went to the configured folder');
  assert.ok(!existsSync(join(repo, '.backlog', 'local')), 'nothing inside the repository');
});

test('work staged elsewhere in the repository is left staged, not committed with the backlog', t => {
  const { repo, run, setup } = world(t); setup();
  writeFileSync(join(repo, 'other.txt'), 'mine\n');
  git(repo, 'add', 'other.txt');
  assert.equal(run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  assert.equal(git(repo, 'status', '--porcelain', '--', 'other.txt'), 'A  other.txt');
  assert.ok(!git(repo, 'show', '--stat', '--format=', 'HEAD').includes('other.txt'));
});

test('a read in a repository with no backlog creates no item folder', t => {
  const { repo, run, setup } = world(t); setup();
  const q = run(['list']);
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
  run(['setup'], { cwd: alone });
  // no origin: the change is committed but cannot be pushed - refused with exit 3, the commit kept (the first release's behaviour)
  const r = run(['new', '--name', 'x', '--objective', 'o', '--summary', 's'], { cwd: alone });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /was not published [^]*no origin remote[^]*committed on this branch/);
  assert.match(git(alone, 'log', '-1', '--format=%s'), /^backlog: /);
  const bare = join(tmp, 'alone.git');
  spawnSync('git', ['init', '-q', '--bare', bare]);
  spawnSync('git', ['remote', 'add', 'origin', bare], { cwd: alone });
  const moved = join(tmp, 'renamed');
  renameSync(alone, moved);
  spawnSync('git', ['remote', 'set-url', 'origin', bare], { cwd: moved }); // a changed origin
  const q = run(['show', '1', '--json'], { cwd: moved });
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).name, 'x');
  assert.deepEqual(JSON.parse(run(['list', '--json'], { cwd: moved }).stdout).phases.map(p => p.seq), [1]);
  const u = run(['update', '1', '--status', 'in_progress'], { cwd: moved });
  assert.equal(u.status, 0, u.stdout + u.stderr);
  assert.equal(git(moved, 'rev-list', '--count', 'origin/main..HEAD'), '0', 'pushed once the origin exists');
});

test('outside a git repository nothing is created and the error says so', t => {
  const { tmp, run } = world(t);
  const plain = join(tmp, 'plain');
  mkdirSync(plain);
  const r = run(['list'], { cwd: plain });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /inside a git repository/);
  assert.ok(!existsSync(join(plain, '.backlog')), 'nothing was created');
});

test('a configured backlog repository that is not cloned is an error naming backlog setup, not a silent fallback', t => {
  const { repo, run } = world(t);
  const r = run(['list'], { env: { BACKLOG_ORIGIN_URL: ORIGIN_URL } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /backlog setup/);
  assert.ok(!existsSync(join(repo, '.backlog')), 'nothing was created inside the repository');
});

test('the per-user record is found without the origin setting when it is the only one', t => {
  const { tmp, repo, run } = world(t);
  const clone = join(tmp, 'backlog-clone'); mkdirSync(clone);
  spawnSync('git', ['init', '-q', '-b', 'main', clone]);
  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: clone, env: { ...process.env, ...GIT_IDENTITY } });
  spawnSync('git', ['init', '-q', '--bare', join(tmp, 'backlog-origin.git')]);
  spawnSync('git', ['remote', 'add', 'origin', join(tmp, 'backlog-origin.git')], { cwd: clone });
  spawnSync('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: clone });
  mkdirSync(join(tmp, 'config', 'some-backlog'), { recursive: true });
  writeFileSync(join(tmp, 'config', 'some-backlog', 'home'), `${clone}\n`);
  const r = run(['list']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!existsSync(join(repo, '.backlog')), 'the record wins over any in-repository default');
  mkdirSync(join(tmp, 'config', 'other-backlog'), { recursive: true });
  writeFileSync(join(tmp, 'config', 'other-backlog', 'home'), `${clone}\n`);
  const two = run(['list']);
  assert.equal(two.status, 4, 'two records and no setting: the CLI does not guess');
  assert.match(two.stderr, /two backlog records|run backlog setup/);
});

// ---- inside the repository, every command updates from the origin first and publishes after, as a backlog repository clone does
function clone2(t, w) {
  const dir = join(w.tmp, 'other');
  spawnSync('git', ['clone', '-q', git(w.repo, 'remote', 'get-url', 'origin'), dir], { encoding: 'utf8' });
  return { dir, run: (args, extra = {}) => w.run(args, { cwd: dir, env: { BACKLOG_AGENT: 'other', ...extra.env } }) };
}

test('inside the repository every command pulls first: a change published from another clone is read without a manual pull', t => {
  const w = world(t); const o = clone2(t, w);
  assert.equal(w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  assert.equal(spawnSync('git', ['pull', '-q'], { cwd: o.dir }).status, 0);
  assert.equal(o.run(['update', '1', '--summary', 'from the other clone']).status, 0);
  const q = w.run(['show', '1', '--json']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).summary, 'from the other clone');
});

test("the user's own unpushed commit survives and is pushed with the backlog change", t => {
  const w = world(t);
  writeFileSync(join(w.repo, 'work.txt'), 'mine\n'); git(w.repo, 'add', 'work.txt'); git(w.repo, 'commit', '-q', '-m', 'my work');
  const r = w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(w.repo, 'log', '--format=%s', 'origin/main..HEAD'), '', 'everything is pushed');
  assert.ok(git(w.repo, 'log', '--format=%s', '-3').includes('my work'), 'the user commit is kept');
  assert.match(r.stdout, /committed; all pending branch changes pushed/);
});

test('a dirty tree survives the pull', t => {
  const w = world(t); const o = clone2(t, w);
  assert.equal(w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  spawnSync('git', ['pull', '-q'], { cwd: o.dir });
  assert.equal(o.run(['update', '1', '--note', 'elsewhere']).status, 0);
  writeFileSync(join(w.repo, 'draft.txt'), 'uncommitted\n'); git(w.repo, 'add', 'draft.txt'); writeFileSync(join(w.repo, 'draft.txt'), 'edited again\n');
  const q = w.run(['list']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(readFileSync(join(w.repo, 'draft.txt'), 'utf8'), 'edited again\n');
  assert.equal(git(w.repo, 'status', '--porcelain', '--', 'draft.txt'), 'AM draft.txt');
});

test('a rejected publication puts only the backlog back; a read with the origin down answers with a warning', t => {
  const w = world(t);
  assert.equal(w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  writeFileSync(join(w.repo, 'keep.txt'), 'keep\n'); git(w.repo, 'add', 'keep.txt'); git(w.repo, 'commit', '-q', '-m', 'keep');
  const head = git(w.repo, 'rev-parse', 'HEAD');
  git(w.repo, 'remote', 'set-url', 'origin', 'https://127.0.0.1:1/nowhere.git');
  const r = w.run(['update', '1', '--status', 'in_progress']);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.equal(git(w.repo, 'rev-parse', 'HEAD'), head, 'HEAD is where the user left it');
  assert.equal(git(w.repo, 'status', '--porcelain'), '', 'nothing of the rejected write is left');
  const q = w.run(['show', '1', '--json']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).status, 'pending', 'the answer comes from the local copy');
  assert.match(q.stderr, /origin offline, local backlog updates may be behind and need manual remediation later/);
});

test('a new branch gets its origin branch on the first push', t => {
  const w = world(t);
  git(w.repo, 'switch', '-q', '-c', 'feature');
  assert.equal(w.run(['list']).status, 0, 'no origin branch yet: nothing to pull, no failure');
  const r = w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(w.repo, 'rev-list', '--count', 'origin/feature..HEAD'), '0');
});

test('push-backlog-updates=false commits the change and pushes nothing', t => {
  const w = world(t); w.setup();
  const file = join(w.repo, '.backlog', 'config.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), 'push-backlog-updates': false }));
  const r = w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /committed; push is off \(push-backlog-updates=false\)/);
  assert.equal(git(w.repo, 'rev-list', '--count', 'origin/main..HEAD'), '1', 'committed, not pushed');
});
