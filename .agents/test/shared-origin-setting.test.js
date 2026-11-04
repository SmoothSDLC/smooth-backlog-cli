// Item 091: the shared backlog repository is a setting (the environment variable BACKLOG_ORIGIN_URL first, then the
// backlog_origin_url key of .smooth-backlog.json), with no built-in name. The item's required behaviours: the
// variable wins over the config key; the config key works alone; neither set puts the items inside the repository;
// a clone failure names the configured value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, consumer, env as fixtureEnv, sharedBacklog } from './shared-fixtures.js';

const KEY = 'https://example.com/acme/backlog-repo.git'; // the fixture clone's origin, as a clone URL
const OTHER = 'https://example.com/other/else.git';
const bin = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js');
// backlog setup --ask reads its answer from standard input (spawnSync's input)
const askSetup = (cwd, tmp, input, env = {}) => spawnSync(process.execPath, [bin, 'setup', '--ask'], {
  cwd, env: { ...process.env, QWEN_CODE_AGENT_ID: 'driver-ask', ...fixtureEnv(tmp), ...env }, input, encoding: 'utf8', timeout: 60000,
});

function fixture(t) {
  const d = mkdtempSync(join(tmpdir(), 'origin-setting-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const home = sharedBacklog(d); // clone at <d>/home, origin acme/backlog-repo
  const cons = consumer(d, 'acme', 'demo', 'main');
  // shared mode for the fixture's consumer (the mode file is per user, in the fixture's XDG_CONFIG_HOME)
  mkdirSync(join(d, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(d, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { d, home, cons };
}

test('the variable wins over the config key: with both set, the origin check uses the variable', t => {
  const f = fixture(t);
  writeFileSync(join(f.cons, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: OTHER }));
  // the fixture env carries BACKLOG_ORIGIN_URL = acme/backlog-repo (matches the clone's origin); the key says other/else
  const r = cli(['query', '--next'], { cwd: f.cons, tmp: f.d });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the config key works alone: with the variable unset, the key names the backlog repository', t => {
  const f = fixture(t);
  writeFileSync(join(f.cons, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: KEY }));
  const r = cli(['query', '--next'], { cwd: f.cons, tmp: f.d, env: { BACKLOG_ORIGIN_URL: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('neither set, no BACKLOG_HOME and no record: the items live inside the repository and the clone is not touched', t => {
  const f = fixture(t);
  const r = cli(['query', '--next'], { cwd: f.cons, tmp: f.d, env: { BACKLOG_ORIGIN_URL: '', BACKLOG_HOME: '', HOME: join(f.d, 'user') } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no backlog yet/);
  assert.equal(r.stderr, '');
  assert.ok(existsSync(join(f.cons, '.backlog', '.state')), 'the folder inside the repository');
});

test('neither set: backlog setup makes the folder inside the repository, deploys the skill, clones nothing and writes no config', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  mkdirSync(join(app, '.claude'));
  const r = cli(['setup'], { cwd: app, tmp: f.d, env: { BACKLOG_HOME: '', HOME: join(f.d, 'user'), BACKLOG_ORIGIN_URL: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(app, '.backlog')), 'the folder inside the repository');
  assert.ok(!existsSync(join(f.d, 'user')), 'no clone or parent folder was created');
  assert.ok(!existsSync(join(app, '.smooth-backlog.json')), 'no config was written for the default folder');
  assert.ok(existsSync(join(app, '.claude', 'skills', 'backlog', 'SKILL.md')), 'the skill copy was deployed');
});

test('setup keeps the config backlog_origin_url: a URL that lives only in the key survives the write, and the later shared command works', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  const origin = join(f.d, 'origins', 'acme', 'backlog-repo.git'); // cloneable locally, same acme/backlog-repo id
  writeFileSync(join(app, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: origin }));
  const r = cli(['setup'], { cwd: app, tmp: f.d, env: { BACKLOG_HOME: '', HOME: join(f.d, 'user'), BACKLOG_ORIGIN_URL: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cfg = JSON.parse(readFileSync(join(app, '.smooth-backlog.json'), 'utf8'));
  assert.equal(cfg.backlog_origin_url, origin, 'the setup write kept the origin setting');
  const n = cli(['new', '--name', 'first', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: app, tmp: f.d, env: { BACKLOG_HOME: '', BACKLOG_ORIGIN_URL: '' } });
  assert.equal(n.status, 0, n.stdout + n.stderr);
});

test('a second setup --ask keeps the config backlog_origin_url', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  const origin = join(f.d, 'origins', 'acme', 'backlog-repo.git');
  writeFileSync(join(app, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: origin }));
  const first = cli(['setup'], { cwd: app, tmp: f.d, env: { BACKLOG_HOME: '', HOME: join(f.d, 'user'), BACKLOG_ORIGIN_URL: '' } });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  // a second setup with --ask rewrites the config (the answer takes the clone beside the repository)
  const second = askSetup(app, f.d, 'backlog-repo\n', { BACKLOG_HOME: '', HOME: join(f.d, 'user'), BACKLOG_ORIGIN_URL: '' });
  assert.equal(second.status, 0, second.stdout + second.stderr);
  const cfg = JSON.parse(readFileSync(join(app, '.smooth-backlog.json'), 'utf8'));
  assert.equal(cfg.backlog_origin_url, origin, 'the --ask rewrite kept the origin setting');
  assert.equal(cfg.backlog_repository, 'backlog-repo');
});

test('the origin set and no clone anywhere: the missing-clone error names backlog setup and nothing is written inside the repository', t => {
  const f = fixture(t);
  const r = cli(['query', '--next'], { cwd: f.cons, tmp: f.d, env: { BACKLOG_HOME: '', HOME: join(f.d, 'user') } });
  assert.equal(r.status, 4, r.stdout + r.stderr);
  assert.match(r.stderr, /configured but not cloned/);
  assert.match(r.stderr, /backlog setup/);
  assert.ok(!existsSync(join(f.cons, '.backlog')), 'nothing inside the repository');
});

test('the repository cannot be cloned or reached: setup says so, naming the configured value, and touches nothing (exit 3)', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  mkdirSync(join(app, '.claude'));
  const modeFile = join(f.d, 'config', 'smooth-backlog-cli', 'mode.json');
  const modeBefore = readFileSync(modeFile, 'utf8');
  for (const url of [join(f.d, 'origins', 'acme', 'missing.git'), 'https://127.0.0.1:1/acme/backlog-repo']) {
    const r = cli(['setup'], { cwd: app, tmp: f.d, env: { BACKLOG_HOME: '', HOME: join(f.d, 'user'), BACKLOG_ORIGIN_URL: url } });
    assert.equal(r.status, 3, `${url}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /could not clone/);
    assert.match(r.stderr, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${url}: the error names the configured value`);
  }
  assert.equal(readFileSync(modeFile, 'utf8'), modeBefore, 'shared mode was not switched on');
  assert.ok(!existsSync(join(app, '.smooth-backlog.json')), 'no config was written');
  assert.ok(!existsSync(join(app, '.claude', 'skills')), 'no skill copy was deployed');
});
