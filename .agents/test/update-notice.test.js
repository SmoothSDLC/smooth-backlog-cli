// The update notice (decision AI): after a command a person runs at a terminal, the scheduled check of the user's configuration runs beside it,
// its warning goes to standard error, and it never changes the output or the exit code of the command. Every registry answer is a stub or a fake
// npm program on the PATH, every configuration lives in a temp folder: these tests never reach the real registry or the user's configuration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bin } from './helpers.js';
import { cli, consumer, env, sharedBacklog } from './shared-fixtures.js';
import { startNotice, updater } from '../../src/upgrade.js';

const fixture = t => { const dir = mkdtempSync(join(tmpdir(), 'notice-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return { dir, config: join(dir, 'user.json') }; };
// a registry that has a newer release; calls records every npm call
function registry(calls) {
  return async args => {
    calls.push(args);
    if (args[0] === 'config') return 'https://npm.pkg.github.com';
    if (args[0] === 'view') return '["1.0.0","1.1.0"]';
    throw new Error(`Unexpected npm ${args}`);
  };
}
const notice = (f, runner, extra = {}) => argv => startNotice(argv, { terminal: true, make: options => updater({ ...options, configPath: f.config, runner, version: '1.0.0', ...extra.updater }), ...extra });

test('a command at a terminal runs the scheduled check beside it and prints the warning on standard error afterwards', async t => {
  const f = fixture(t); const calls = []; const written = [];
  const finish = notice(f, registry(calls), { write: x => written.push(x) })(['list']);
  assert.deepEqual(written, [], 'nothing is printed before the command is done');
  await finish();
  assert.deepEqual(written, ['backlog: Version 1.1.0 is available; run backlog upgrade.\n']);
  assert.equal(JSON.parse(readFileSync(f.config, 'utf8')).last_check_status, 'ok');
  const again = calls.length;
  await notice(f, registry(calls), { write: x => written.push(x) })(['list'])();
  assert.equal(calls.length, again, 'a second command in the same week asks the registry nothing');
  assert.equal(written.length, 1);
});
test('without a terminal nothing runs: no registry call, no configuration written, nothing printed', async t => {
  const f = fixture(t); const calls = []; const written = [];
  await startNotice(['list'], { terminal: false, make: options => updater({ ...options, configPath: f.config, runner: registry(calls) }), write: x => written.push(x) })();
  assert.deepEqual([calls, written, existsSync(f.config)], [[], [], false]);
});
test('--help, --version, upgrade, setup and the bare command never start a check', async t => {
  const f = fixture(t); const calls = []; const written = [];
  for (const argv of [[], ['--help'], ['help'], ['-h'], ['--version'], ['version'], ['upgrade', 'check'], ['setup', '--ask'], ['list', '--help'], ['team', 'new', '--help']]) await notice(f, registry(calls), { write: x => written.push(x) })(argv)();
  assert.deepEqual([calls, written, existsSync(f.config)], [[], [], false]);
});
test('the weekly check turned off (backlog upgrade disable) and a check that is not due ask nothing', async t => {
  const f = fixture(t); const calls = [];
  writeFileSync(f.config, JSON.stringify({ schema_version: 1, weekly: false, auto: false }));
  await notice(f, registry(calls))(['list'])();
  assert.deepEqual(calls, []);
});
test('a registry that does not answer adds at most the time limit, writes one warning at most, and never throws', async t => {
  const f = fixture(t); const written = [];
  const finish = notice(f, () => new Promise(() => {}), { limit: 60, write: x => written.push(x) })(['list']);
  const from = Date.now(); await finish();
  assert.ok(Date.now() - from < 1000, `waited ${Date.now() - from} ms`);
  assert.ok(written.length <= 1);
});
test('a failed check is a warning, not an error: the next command waits an hour', async t => {
  const f = fixture(t); const written = []; let calls = 0;
  const down = async () => { calls++; throw new Error('offline'); };
  await notice(f, down, { write: x => written.push(x) })(['list'])();
  assert.match(written.join(''), /^backlog: Automatic update check failed: offline\. Backlog work can continue; retry is eligible in one hour\.\n$/);
  assert.equal(JSON.parse(readFileSync(f.config, 'utf8')).last_check_status, 'failed');
  const before = calls; await notice(f, down, { write: x => written.push(x) })(['list'])();
  assert.equal(calls, before);
});

// The wiring in src/main.js, on a real terminal (util-linux script) with a fake npm on the PATH: the check runs once, its warning is on the terminal,
// the exit code is the command's, and a run with standard error piped (an agent, a script) checks nothing and prints nothing.
test('backlog at a terminal checks once and warns; with standard error piped it checks nothing', t => {
  if (process.platform !== 'linux') return t.skip('needs the script command of util-linux');
  const dir = mkdtempSync(join(tmpdir(), 'notice-wiring-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = sharedBacklog(dir); consumer(dir, 'acme', 'demo', 'main'); void home;
  const cons = join(dir, 'consumer', 'demo');
  const fakes = join(dir, 'fake'); mkdirSync(fakes);
  const calls = join(dir, 'npm-calls');
  writeFileSync(join(fakes, 'npm'), '#!/bin/sh\necho "$@" >> "$NPM_CALLS"\ncase "$1" in config) echo https://npm.pkg.github.com;; view) echo \'["0.0.0","9.9.9"]\';; esac\n');
  chmodSync(join(fakes, 'npm'), 0o755);
  const environment = { ...process.env, ...env(dir), SMOOTH_BACKLOG_CLI_AGENT: 'driver-notice', NPM_CALLS: calls, PATH: `${fakes}:${process.env.PATH}` };
  const config = join(dir, 'config', 'smooth-backlog-cli', 'config.json');
  const piped = cli(['list'], { cwd: cons, tmp: dir, env: { NPM_CALLS: calls, PATH: environment.PATH } });
  assert.equal(piped.status, 0, piped.stdout + piped.stderr);
  assert.deepEqual([existsSync(calls), existsSync(config), piped.stderr], [false, false, ''], 'standard error is not a terminal: no check');
  const terminal = () => spawnSync('script', ['-qec', `'${process.execPath}' '${bin}' list`, '/dev/null'], { cwd: cons, env: environment, encoding: 'utf8', input: '' });
  const first = terminal();
  if (!first.stdout?.includes('queue') && first.status !== 0) return t.skip('no pseudo-terminal here');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.match(first.stdout, /backlog: Automatic update check failed: Installed version 0\.0\.0-development is not a stable semantic version/);
  assert.match(readFileSync(calls, 'utf8'), /^config get @smoothsdlc:registry\n/);
  assert.equal(JSON.parse(readFileSync(config, 'utf8')).last_check_status, 'failed');
  const asked = readFileSync(calls, 'utf8');
  const second = terminal();
  assert.equal(second.status, 0);
  assert.doesNotMatch(second.stdout, /update check/);
  assert.equal(readFileSync(calls, 'utf8'), asked, 'the retry is an hour away');
});
test('a registry that takes five seconds delays the command by the time limit at most, then warns once', t => {
  if (process.platform !== 'linux') return t.skip('needs the script command of util-linux');
  const dir = mkdtempSync(join(tmpdir(), 'notice-slow-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  sharedBacklog(dir); const cons = consumer(dir, 'acme', 'demo', 'main');
  const fakes = join(dir, 'fake'); mkdirSync(fakes);
  writeFileSync(join(fakes, 'npm'), '#!/bin/sh\nexec sleep 5\n');
  chmodSync(join(fakes, 'npm'), 0o755);
  const from = Date.now();
  const r = spawnSync('script', ['-qec', `'${process.execPath}' '${bin}' list`, '/dev/null'], { cwd: cons, env: { ...process.env, ...env(dir), SMOOTH_BACKLOG_CLI_AGENT: 'driver-notice', PATH: `${fakes}:${process.env.PATH}` }, encoding: 'utf8', input: '' });
  const took = Date.now() - from;
  if (r.status !== 0 && !r.stdout) return t.skip('no pseudo-terminal here');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(took < 4500, `the command took ${took} ms`);
  assert.match(r.stdout, /backlog: Automatic update check failed: npm config failed/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'config', 'smooth-backlog-cli', 'config.json'), 'utf8')).last_check_status, 'failed');
});
