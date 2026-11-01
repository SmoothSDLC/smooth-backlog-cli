// Item 091: the shared backlog repository is a setting (the environment variable BACKLOG_ORIGIN_URL first, then the
// backlog_origin_url key of .smooth-backlog.json), with no built-in name. The item's four required behaviours:
// the variable wins over the config key; the config key works alone; neither set refuses, naming both, touching
// nothing; the origin check uses the configured value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const KEY = 'https://example.com/acme/backlog-repo.git'; // the fixture clone's origin, as a clone URL
const OTHER = 'https://example.com/other/else.git';

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

test('the config key works alone: with the variable unset, the origin check uses the key', t => {
  const f = fixture(t);
  writeFileSync(join(f.cons, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: KEY }));
  const r = cli(['query', '--next'], { cwd: f.cons, tmp: f.d, env: { BACKLOG_ORIGIN_URL: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  writeFileSync(join(f.cons, '.smooth-backlog.json'), JSON.stringify({ backlog_origin_url: OTHER }));
  const r2 = cli(['query', '--next'], { cwd: f.cons, tmp: f.d, env: { BACKLOG_ORIGIN_URL: '' } });
  assert.equal(r2.status, 2, r2.stdout + r2.stderr);
  assert.match(r2.stderr, /has origin 'acme\/backlog-repo'; expected other\/else/);
});

test('neither set: a shared-mode command refuses, naming both the variable and the config key, and touches nothing', t => {
  const f = fixture(t);
  const r = cli(['query', '--next'], { cwd: f.cons, tmp: f.d, env: { BACKLOG_ORIGIN_URL: '' } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /the shared backlog repository is not set/);
  assert.match(r.stderr, /BACKLOG_ORIGIN_URL/);
  assert.match(r.stderr, /backlog_origin_url/);
  assert.match(r.stderr, /\.smooth-backlog\.json/);
  assert.equal(r.stdout, '', 'no queue is printed');
});

test('neither set: backlog setup refuses before it touches anything (no clone, no parent folder, no config, no mode change, no skill copy)', t => {
  const f = fixture(t);
  const app = consumer(f.d, 'acme', 'app', 'main');
  mkdirSync(join(app, '.claude'));
  const modeFile = join(f.d, 'config', 'smooth-backlog-cli', 'mode.json');
  const modeBefore = readFileSync(modeFile, 'utf8');
  const r = cli(['setup'], { cwd: app, tmp: f.d, env: { BACKLOG_HOME: '', HOME: join(f.d, 'user'), BACKLOG_ORIGIN_URL: '' } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /the shared backlog repository is not set/);
  assert.match(r.stderr, /BACKLOG_ORIGIN_URL/);
  assert.match(r.stderr, /backlog_origin_url/);
  assert.ok(!existsSync(join(f.d, 'user')), 'no clone or parent folder was created');
  assert.ok(!existsSync(join(app, '.smooth-backlog.json')), 'no config was written');
  assert.equal(readFileSync(modeFile, 'utf8'), modeBefore, 'shared mode was not switched on');
  assert.ok(!existsSync(join(app, '.claude', 'skills')), 'no skill copy was deployed');
});

test('the origin check uses the configured value: a configured value different from the clone is refused, naming both', t => {
  const f = fixture(t);
  const r = cli(['query', '--next'], { cwd: f.cons, tmp: f.d, env: { BACKLOG_ORIGIN_URL: OTHER } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /has origin 'acme\/backlog-repo'; expected other\/else/);
});
