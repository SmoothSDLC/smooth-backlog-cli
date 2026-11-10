// Item 091: the shared backlog repository is a setting (the environment variable SMOOTH_BACKLOG_CLI_ORIGIN_URL first, then the
// backlog_origin_url key of .smooth-backlog.json), with no built-in name. The item's required behaviours: the
// variable wins over the config key; the config key works alone; neither set means setup records the folder inside the repository;
// a clone failure names the configured value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, consumer, env as fixtureEnv, sharedBacklog } from './shared-fixtures.js';

const KEY = 'https://example.com/acme/backlog-repo.git'; // the fixture clone's origin, as a clone URL
const OTHER = 'https://example.com/other/else.git';
const bin = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js');
// backlog setup --ask reads its answer from standard input (spawnSync's input)
const askSetup = (cwd, tmp, input, env = {}) => spawnSync(process.execPath, [bin, 'setup', '--ask'], {
  cwd, env: { ...process.env, SMOOTH_BACKLOG_CLI_AGENT: 'driver-ask', ...fixtureEnv(tmp), ...env }, input, encoding: 'utf8', timeout: 60000,
});

function fixture(t) {
  const d = mkdtempSync(join(tmpdir(), 'origin-setting-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const home = sharedBacklog(d); // clone at <d>/home, origin acme/backlog-repo
  const cons = consumer(d, 'acme', 'demo', 'main');
  mkdirSync(join(d, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { d, home, cons };
}

test('the variable wins over the config key: with both set, the origin check uses the variable', t => {
  const f = fixture(t);
  writeFileSync(join(f.cons, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: OTHER }));
  // the fixture env carries SMOOTH_BACKLOG_CLI_ORIGIN_URL = acme/backlog-repo (matches the clone's origin); the key says other/else
  const r = cli(['next'], { cwd: f.cons, tmp: f.d });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the config key works alone: with the variable unset, the key names the backlog repository', t => {
  const f = fixture(t);
  writeFileSync(join(f.cons, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: KEY }));
  const r = cli(['next'], { cwd: f.cons, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('neither set, no SMOOTH_BACKLOG_CLI_HOME and no record: the backlog is .backlog inside the repository, created with its config; the clone is not touched', t => {
  const f = fixture(t);
  const r = cli(['next'], { cwd: f.cons, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_ORIGIN_URL: '', SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user') } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no backlog yet|no actionable item/);
  assert.deepEqual(JSON.parse(readFileSync(join(f.cons, '.backlog', 'config.json'), 'utf8')), { backlog_repository: '.backlog' });
  assert.ok(!existsSync(join(f.cons, '.backlog', 'acme')), 'a read creates no item folder');
});

test('neither set: backlog setup records .backlog inside the repository in .backlog/config.json, deploys the skill, clones nothing, commits and pushes its own change', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  mkdirSync(join(app, '.claude'));
  const r = cli(['setup'], { cwd: app, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!existsSync(join(f.d, 'user')), 'no clone or parent folder was created');
  const written = JSON.parse(readFileSync(join(app, '.backlog', 'config.json'), 'utf8')); // setup also records the user and an empty team
  assert.ok(typeof written.user === 'string' && written.user);
  assert.deepEqual({ ...written, user: undefined }, { backlog_repository: '.backlog', user: undefined, team: '' });
  assert.ok(existsSync(join(app, '.claude', 'skills', 'backlog', 'SKILL.md')), 'the skill copy was deployed');
  assert.doesNotMatch(r.stdout, /\/tmp\//, 'setup names no folder path');
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: app, encoding: 'utf8' }).stdout, '', 'the config and the skill copy are committed');
  const q = cli(['list'], { cwd: app, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' } });
  assert.equal(q.status, 0, q.stdout + q.stderr);
});

test('setup keeps the config backlog_origin_url: a URL that lives only in the key survives the write, and the later shared command works', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  const origin = join(f.d, 'origins', 'acme', 'backlog-repo.git'); // cloneable locally, same acme/backlog-repo id
  writeFileSync(join(app, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: origin }));
  const r = cli(['setup'], { cwd: app, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cfg = JSON.parse(readFileSync(join(app, '.smooth-backlog.json'), 'utf8'));
  assert.equal(cfg.backlog_origin_url, origin, 'the setup write kept the origin setting');
  const n = cli(['new', '--name', 'first', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: app, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_HOME: '', SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' } });
  assert.equal(n.status, 0, n.stdout + n.stderr);
});

test('a second setup --ask keeps the config backlog_origin_url', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  const origin = join(f.d, 'origins', 'acme', 'backlog-repo.git');
  writeFileSync(join(app, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: origin }));
  const first = cli(['setup'], { cwd: app, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' } });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  // a second setup with --ask rewrites the config (the answer takes the clone beside the repository)
  const second = askSetup(app, f.d, 'backlog-repo\n', { SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' });
  assert.equal(second.status, 0, second.stdout + second.stderr);
  const cfg = JSON.parse(readFileSync(join(app, '.backlog', 'config.json'), 'utf8'));
  assert.equal(cfg.backlog_origin_url, origin, 'the --ask rewrite kept the origin setting');
  assert.equal(cfg.backlog_repository, 'backlog-repo');
});

test('the origin set and no clone anywhere: the missing-clone error names backlog setup and nothing is written inside the repository', t => {
  const f = fixture(t);
  const r = cli(['next'], { cwd: f.cons, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user') } });
  assert.equal(r.status, 4, r.stdout + r.stderr);
  assert.match(r.stderr, /configured but not cloned/);
  assert.match(r.stderr, /backlog setup/);
  assert.ok(!existsSync(join(f.cons, '.backlog')), 'nothing inside the repository');
});

test('the repository cannot be cloned or reached: setup says so, naming the configured value, and touches nothing (exit 3)', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  mkdirSync(join(app, '.claude'));
  for (const url of [join(f.d, 'origins', 'acme', 'missing.git'), 'https://127.0.0.1:1/acme/backlog-repo']) {
    const r = cli(['setup'], { cwd: app, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: url } });
    assert.equal(r.status, 3, `${url}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /could not clone/);
    assert.match(r.stderr, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${url}: the error names the configured value`);
  }
  assert.ok(!existsSync(join(app, '.smooth-backlog.json')), 'no config was written');
  assert.ok(!existsSync(join(app, '.claude', 'skills')), 'no skill copy was deployed');
});

test('setup records the environment it ran with: the clone URL and the clone path go into .backlog/config.json, so later runs need no variables', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  const r = cli(['setup'], { cwd: app, tmp: f.d, env: { HOME: join(f.d, 'user') } }); // SMOOTH_BACKLOG_CLI_HOME and SMOOTH_BACKLOG_CLI_ORIGIN_URL come from the fixture env
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cfg = JSON.parse(readFileSync(join(app, '.backlog', 'config.json'), 'utf8'));
  assert.equal(cfg.backlog_origin_url, fixtureEnv(f.d).SMOOTH_BACKLOG_CLI_ORIGIN_URL, 'the clone URL from the environment is recorded');
  assert.equal(realpathSync(join(app, cfg.backlog_repository)), realpathSync(fixtureEnv(f.d).SMOOTH_BACKLOG_CLI_HOME), 'the configured clone is the one SMOOTH_BACKLOG_CLI_HOME named');
  const later = cli(['list'], { cwd: app, tmp: f.d, env: { HOME: join(f.d, 'user'), SMOOTH_BACKLOG_CLI_HOME: '', SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' } });
  assert.equal(later.status, 0, later.stdout + later.stderr); // the config alone finds the clone
  // the summary names every action, never a path
  for (const line of ['.backlog folder created', 'configuration written: backlog repository', 'committed and pushed']) assert.ok(r.stdout.includes(line), `${line}\n${r.stdout}`);
  assert.doesNotMatch(r.stdout, /\/tmp\//);
});

test('setup inside the repository prints its summary: the folder, the configuration, the skill, the commit', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  mkdirSync(join(app, '.agents'));
  const r = cli(['setup'], { cwd: app, tmp: f.d, env: { SMOOTH_BACKLOG_CLI_HOME: '', HOME: join(f.d, 'user'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const line of ['.backlog folder created', 'configuration written: backlog inside this repository', 'skill deployed to .agents', 'committed and pushed']) assert.ok(r.stdout.includes(line), `${line}\n${r.stdout}`);
});
