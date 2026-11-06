// Tests for the command router: one command set, wherever the item files live.
// Local bare repositories only (shared-fixtures.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cli, consumer, env, sharedBacklog } from './shared-fixtures.js';

const SRC = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src'));

function pair(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'router-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  return { tmp, home: realpathSync(sharedBacklog(tmp)), cons: consumer(tmp, 'acme', 'demo', 'main') };
}
const status = cwd => spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).stdout;

// Runs src/shared/router.js in a child process with an injected command table (no real module needed).
function inproc(f, source, extraEnv = {}) {
  const file = join(f.tmp, 'drive.mjs');
  writeFileSync(file, `import * as router from ${JSON.stringify(pathToFileURL(join(SRC, 'shared', 'router.js')).href)};\n${source}`);
  const p = spawnSync(process.execPath, [file], { cwd: f.cons, encoding: 'utf8', env: { ...process.env, ...env(f.tmp), ...extraEnv } });
  return { status: p.status, stdout: p.stdout, stderr: p.stderr };
}

test('a leading --json is a global flag: the command after it is still found, no arguments means next', t => {
  const f = pair(t);
  const r = cli(['--json', 'query'], { cwd: f.cons, tmp: f.tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(typeof JSON.parse(r.stdout), 'object');
  const bare = cli(['--json'], { cwd: f.cons, tmp: f.tmp });
  assert.equal(bare.status, 0, bare.stderr);
  assert.equal(typeof JSON.parse(bare.stdout), 'object'); // next: the empty queue, as JSON
  assert.equal(cli([], { cwd: f.cons, tmp: f.tmp }).status, 0);
});

test('a command leaves the consuming repository clean and writes nothing into it', t => {
  const f = pair(t);
  const r = cli(['next'], { cwd: f.cons, tmp: f.tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(status(f.cons), '');
  assert.equal(existsSync(join(f.cons, '.backlog')), false);
});

test('the router: nine commands; argv after the command reaches the module unparsed; its exit code is returned', t => {
  const f = pair(t);
  writeFileSync(join(f.tmp, 'fake.mjs'), 'export const run = async argv => { console.log(JSON.stringify(argv)); return 7; };\n');
  const spec = JSON.stringify(pathToFileURL(join(f.tmp, 'fake.mjs')).href);
  const r = inproc(f, `
    console.log(Object.keys(router.TABLE).sort().join(','));
    process.exitCode = await router.run('fake', ['--name', 'A b', '--weird=x', '--', '-z'], { table: { fake: [${spec}], dash: [${spec}, '--next'] } });`);
  assert.equal(r.status, 7, r.stderr);
  const [names, argv] = r.stdout.trim().split('\n');
  assert.equal(names, 'archive,fields,list,move,new,next,query,team,update');
  assert.deepEqual(JSON.parse(argv), ['--name', 'A b', '--weird=x', '--', '-z']);
  const lead = inproc(f, `process.exitCode = await router.run('dash', ['--json'], { table: { dash: [${spec}, '--next'] } });`);
  assert.deepEqual(JSON.parse(lead.stdout.trim()), ['--next', '--json']);
});

test('an unknown command is refused (exit 2) naming the commands', t => {
  const f = pair(t);
  for (const c of ['init', 'constructor', 'nope', 'pop', 'work']) { // pop and work are team commands now: backlog team pop; init backup is no command
    const r = cli(c === 'init' ? [c, 'backup'] : [c], { cwd: f.cons, tmp: f.tmp });
    assert.equal(r.status, 2, c);
    assert.match(r.stderr, new RegExp(`^❌ backlog: ${c} is not a backlog command \\(new, update, query, list, team, next, fields, move, archive, setup\\)`));
  }
});

test('<command> --help prints the help text and needs no backlog folder; list prints the query help', t => {
  const f = pair(t);
  const r = inproc(f, `process.exitCode = await router.run('fake', ['--help'], { table: { fake: ['./never.js'] }, help: { fake: 'FAKE HELP' } });`, { BACKLOG_HOME: join(f.tmp, 'nope') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'FAKE HELP\n');
  const list = cli(['list', '--help'], { cwd: f.cons, tmp: f.tmp, env: { BACKLOG_HOME: join(f.tmp, 'nope') } });
  assert.equal(list.status, 0, list.stderr);
  assert.equal(list.stdout, cli(['query', '--help'], { cwd: f.cons, tmp: f.tmp }).stdout);
});

test('a configured backlog folder that is missing -> exit 4 naming backlog setup', t => {
  const f = pair(t);
  const nope = join(f.tmp, 'nope');
  const cases = [
    ['BACKLOG_HOME set but missing', { BACKLOG_HOME: nope }, /^❌ backlog: the backlog repository acme\/backlog-repo is configured but not cloned at .*nope: run 'backlog setup'/],
    ['default folder missing', { BACKLOG_HOME: '', HOME: join(f.tmp, 'h') }, /^❌ backlog: the backlog repository acme\/backlog-repo is configured but not cloned at .*backlog-repo: run 'backlog setup' in this repository/],
  ];
  for (const [label, e, pattern] of cases) {
    const r = cli(['next'], { cwd: f.cons, tmp: f.tmp, env: e });
    assert.equal(r.status, 4, `${label}: ${r.stderr}`);
    assert.match(r.stderr, pattern, label);
  }
  // the per-user record points at a missing folder: the same answer
  const record = join(f.tmp, 'config', 'backlog-repo', 'home');
  mkdirSync(dirname(record), { recursive: true });
  writeFileSync(record, `${nope}\n`);
  const rec = cli(['next'], { cwd: f.cons, tmp: f.tmp, env: { BACKLOG_HOME: '' } });
  assert.equal(rec.status, 4);
  assert.match(rec.stderr, /configured but not cloned/);
});
