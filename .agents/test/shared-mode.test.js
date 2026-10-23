// Tests for the mode options and the shared-mode command router - cli-parity job 6 (ROUTER).
// Cited source: contract section 1 (modes), section 2 (command table), section 5 (exit codes);
// the Python oracle lib_db.py:77-109 (ensure_home) and set_home.py:33-35 (home record).
// Local bare repositories only (shared-fixtures.js), BACKLOG_HOME and XDG_CONFIG_HOME inside the
// test's temp dir. Parity tests run the oracle and skip without SMOOTH_BACKLOG_SCRIPTS or PyYAML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cli, consumer, env, py, sharedBacklog } from './shared-fixtures.js';
import { fixture } from './helpers.js';

const SRC = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src'));
const unbuilt = name => !existsSync(join(SRC, 'shared', name));

function pair(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'mode-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  return { tmp, home: sharedBacklog(tmp), cons: consumer(tmp, 'acme', 'demo', 'main') };
}
const recordFile = tmp => join(tmp, 'config', 'smoothsdlc-backlog', 'home');
const modeFile = tmp => join(tmp, 'config', 'smooth-backlog-cli', 'mode.json');
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const setShared = tmp => { mkdirSync(dirname(modeFile(tmp)), { recursive: true }); writeFileSync(modeFile(tmp), '{"mode":"shared"}'); };
const status = cwd => spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).stdout;

// Runs src/shared/router.js in a child process with an injected command table (no real module needed).
function inproc(f, source, extraEnv = {}) {
  const file = join(f.tmp, 'drive.mjs');
  writeFileSync(file, `import * as router from ${JSON.stringify(pathToFileURL(join(SRC, 'shared', 'router.js')).href)};\n${source}`);
  const p = spawnSync(process.execPath, [file], { cwd: f.cons, encoding: 'utf8', env: { ...process.env, ...env(f.tmp), ...extraEnv } });
  return { status: p.status, stdout: p.stdout, stderr: p.stderr };
}

test('--use-backlog-repo writes the home record and mode.json (same record as set_home.py) and exits 0', t => {
  const f = pair(t);
  const r = cli(['--use-backlog-repo', f.home], { cwd: f.cons, tmp: f.tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(recordFile(f.tmp)), `${f.home}\n`);
  assert.equal(read(modeFile(f.tmp)), '{"mode":"shared"}');
  const o = py('set_home.py', [f.home], { cwd: f.cons, tmp: f.tmp, env: { XDG_CONFIG_HOME: join(f.tmp, 'oracle-config') } });
  if (!o) return t.diagnostic('oracle not configured: record parity not compared');
  assert.equal(o.status, 0, o.stderr);
  assert.equal(read(recordFile(f.tmp)), read(join(f.tmp, 'oracle-config', 'smoothsdlc-backlog', 'home')));
});

test('--use-backlog-repo also takes --use-backlog-repo=<path>', t => {
  const f = pair(t);
  assert.equal(cli([`--use-backlog-repo=${f.home}`], { cwd: f.cons, tmp: f.tmp }).status, 0);
  assert.equal(read(modeFile(f.tmp)), '{"mode":"shared"}');
});

test('--use-backlog-repo refuses a clone with another origin: exit 2, die message on stderr, no record written', t => {
  const f = pair(t);
  const other = consumer(f.tmp, 'Other', 'else', 'main');
  const r = cli(['--use-backlog-repo', other], { cwd: f.cons, tmp: f.tmp });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^❌ backlog: .* has origin 'Other\/else'; expected SmoothSDLC\/smoothsdlc-backlog\n$/);
  assert.equal(read(recordFile(f.tmp)), null);
  assert.equal(read(modeFile(f.tmp)), null);
});

test('--use-backlog-repo refuses a missing path (exit 2) and a clone that cannot pull (exit 3), writing nothing', t => {
  const f = pair(t);
  const missing = cli(['--use-backlog-repo', join(f.tmp, 'nope')], { cwd: f.cons, tmp: f.tmp });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /does not exist/);
  spawnSync('git', ['remote', 'set-url', 'origin', join(f.tmp, 'gone', 'SmoothSDLC', 'smoothsdlc-backlog.git')], { cwd: f.home });
  const pull = cli(['--use-backlog-repo', f.home], { cwd: f.cons, tmp: f.tmp });
  assert.equal(pull.status, 3);
  assert.match(pull.stderr, /could not update .* from origin\/main/);
  assert.equal(read(recordFile(f.tmp)), null);
  assert.equal(read(modeFile(f.tmp)), null);
});

test('mode options need a value, exclude each other and stand alone: exit 2', t => {
  const f = pair(t);
  for (const argv of [['--use-backlog-repo'], ['--use-backlog-repo', f.home, '--use-local-repo'], ['--use-local-repo', 'next'], ['--use-backlog-repo', f.home, 'next']]) {
    const r = cli(argv, { cwd: f.cons, tmp: f.tmp });
    assert.equal(r.status, 2, argv.join(' '));
    assert.match(r.stderr, /^INVALID_INPUT: /);
  }
  assert.equal(read(modeFile(f.tmp)), null);
});

test('--use-local-repo switches back, leaves the home record untouched, and the local commands work', t => {
  const f = fixture(t);
  const home = sharedBacklog(f.dir);
  const e = { ...f.env, BACKLOG_HOME: home };
  const shared = f.raw(['--use-backlog-repo', home], { env: e });
  assert.equal(shared.status, 0, shared.stderr);
  const record = join(f.dir, 'config', 'smoothsdlc-backlog', 'home');
  const before = readFileSync(record, 'utf8');
  const refused = f.raw(['list'], { env: e }); // local grammar is skipped in shared mode
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /not a shared-mode command/);
  assert.equal(existsSync(join(f.root, '.backlog')), false);
  const local = f.raw(['--use-local-repo'], { env: e });
  assert.equal(local.status, 0, local.stderr);
  assert.equal(readFileSync(join(f.dir, 'config', 'smooth-backlog-cli', 'mode.json'), 'utf8'), '{"mode":"local"}');
  assert.equal(readFileSync(record, 'utf8'), before);
  assert.equal(f.raw(['--json', 'init'], { env: e }).status, 0);
  const p = f.raw(['--json', 'new', 'Back to local', '--description', 'd', '--ac', 'a'], { env: e });
  assert.equal(p.status, 0, p.stderr);
  assert.equal(JSON.parse(p.stdout).ok, true);
  assert.equal(f.raw(['--json', 'next'], { env: e }).status, 0);
  assert.equal(existsSync(join(f.root, '.backlog')), true);
});

test('BACKLOG_HOME does not switch the mode: with no mode.json the local commands run', t => {
  const f = fixture(t);
  const p = f.raw(['--json', 'init'], { env: { ...f.env, BACKLOG_HOME: sharedBacklog(f.dir) } });
  assert.equal(p.status, 0, p.stderr);
  assert.equal(existsSync(join(f.root, '.backlog')), true);
});

test('a shared command leaves the consuming repository clean and writes nothing into it', t => {
  const f = pair(t);
  assert.equal(cli(['--use-backlog-repo', f.home], { cwd: f.cons, tmp: f.tmp }).status, 0);
  assert.equal(status(f.cons), '');
  const r = cli(['next'], { cwd: f.cons, tmp: f.tmp });
  assert.ok([0, 2, 3].includes(r.status), r.stderr); // 2 while the query module is not built
  assert.equal(status(f.cons), '');
  assert.equal(existsSync(join(f.cons, '.backlog')), false);
  const fake = inproc(f, `process.exitCode = await router.run('fake', ['x'], { table: { fake: [${JSON.stringify(pathToFileURL(join(f.tmp, 'fake.mjs')).href)}] } });`,
    { BACKLOG_HOME: f.home });
  assert.equal(fake.status, 2); // module file absent here: refused, repository still clean
  assert.equal(status(f.cons), '');
});

test('the real ~/.config home record and mode record are unchanged', t => {
  const real = ['smoothsdlc-backlog/home', 'smooth-backlog-cli/mode.json'].map(p => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), p));
  const snap = () => real.map(p => (existsSync(p) ? [readFileSync(p, 'utf8'), statSync(p).mtimeMs] : null));
  const before = snap();
  const f = pair(t);
  cli(['--use-backlog-repo', f.home], { cwd: f.cons, tmp: f.tmp });
  cli(['--use-local-repo'], { cwd: f.cons, tmp: f.tmp });
  cli(['next'], { cwd: f.cons, tmp: f.tmp });
  assert.deepEqual(snap(), before);
});

test('the router: seven shared commands; argv after the command reaches the module unparsed; its exit code is returned', t => {
  const f = pair(t);
  writeFileSync(join(f.tmp, 'fake.mjs'), 'export const run = async argv => { console.log(JSON.stringify(argv)); return 7; };\n');
  const spec = JSON.stringify(pathToFileURL(join(f.tmp, 'fake.mjs')).href);
  const r = inproc(f, `
    console.log(Object.keys(router.TABLE).sort().join(','));
    process.exitCode = await router.run('fake', ['--name', 'A b', '--weird=x', '--', '-z'], { table: { fake: [${spec}], dash: [${spec}, '--next'] } });`,
  { BACKLOG_HOME: f.home });
  assert.equal(r.status, 7, r.stderr);
  const [names, argv] = r.stdout.trim().split('\n');
  assert.equal(names, 'archive,move,new,next,pop,query,update');
  assert.deepEqual(JSON.parse(argv), ['--name', 'A b', '--weird=x', '--', '-z']);
  const lead = inproc(f, `process.exitCode = await router.run('dash', ['--json'], { table: { dash: [${spec}, '--next'] } });`, { BACKLOG_HOME: f.home });
  assert.deepEqual(JSON.parse(lead.stdout.trim()), ['--next', '--json']);
});

test('a command whose module is not built yet exits 2 with "not built yet: <command>"', t => {
  const f = pair(t);
  setShared(f.tmp);
  const r = inproc(f, `process.exitCode = await router.run('ghost', [], { table: { ghost: ['./no-such-module.js'] } });`, { BACKLOG_HOME: f.home });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, '❌ backlog: not built yet: ghost\n');
  if (unbuilt('archive.js')) { // the real table, until job 17 lands
    const c = cli(['archive', '1'], { cwd: f.cons, tmp: f.tmp });
    assert.equal(c.status, 2);
    assert.equal(c.stderr, '❌ backlog: not built yet: archive\n');
  }
});

test('an unknown or local-only command is refused in shared mode (exit 2)', t => {
  const f = pair(t);
  setShared(f.tmp);
  for (const c of ['list', 'init', 'constructor', 'nope']) {
    const r = cli([c], { cwd: f.cons, tmp: f.tmp });
    assert.equal(r.status, 2, c);
    assert.match(r.stderr, new RegExp(`^❌ backlog: ${c} is not a shared-mode command`));
  }
});

test('<command> --help prints the help text and needs no backlog home', t => {
  const f = pair(t);
  const r = inproc(f, `process.exitCode = await router.run('fake', ['--help'], { table: { fake: ['./never.js'] }, help: { fake: 'FAKE HELP' } });`, { BACKLOG_HOME: join(f.tmp, 'nope') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'FAKE HELP\n');
});

test('a missing home: BACKLOG_HOME set -> exit 2 with the oracle message; default or recorded home -> exit 4 with the ASK text', t => {
  const f = pair(t);
  setShared(f.tmp);
  const nope = join(f.tmp, 'nope');
  const cases = [
    ['BACKLOG_HOME set but missing', { BACKLOG_HOME: nope }, 2, /^❌ backlog: BACKLOG_HOME=.*nope does not exist; expected a clone of SmoothSDLC\/smoothsdlc-backlog on main \(unset BACKLOG_HOME to use ~\/git\/smoothsdlc-backlog\)\n$/],
    ['default home missing', { BACKLOG_HOME: '', HOME: join(f.tmp, 'h') }, 4, /^❌ backlog: the backlog repository is not at .*smoothsdlc-backlog\. ASK THE USER: where is the local clone of SmoothSDLC\/smoothsdlc-backlog, or should it be cloned to .* Then run 'python3 .*set_home\.py <path>'/],
  ];
  for (const [label, e, code, pattern] of cases) {
    const extra = { BACKLOG_HEADLESS: '', ...e };
    const r = cli(['next'], { cwd: f.cons, tmp: f.tmp, env: extra });
    assert.equal(r.status, code, `${label}: ${r.stderr}`);
    assert.match(r.stderr, pattern, label);
    const o = py('query.py', ['--status'], { cwd: f.cons, tmp: f.tmp, env: extra });
    if (!o) { t.diagnostic(`${label}: oracle not configured, parity not compared`); continue; }
    assert.equal(o.status, code, `${label} oracle`);
    assert.equal(r.stderr, o.stderr, `${label}: same message as the oracle`);
  }
  // the home record points at a missing folder: that is the "not the default" ask case too (lib_db.py:81-85)
  mkdirSync(dirname(recordFile(f.tmp)), { recursive: true });
  writeFileSync(recordFile(f.tmp), `${nope}\n`);
  const rec = cli(['next'], { cwd: f.cons, tmp: f.tmp, env: { BACKLOG_HOME: '' } });
  assert.equal(rec.status, 4);
  assert.match(rec.stderr, /ASK THE USER/);
});

test('a home that is not a correct clone (another origin) is refused with exit 2 before the command runs', t => {
  const f = pair(t);
  setShared(f.tmp);
  const other = consumer(f.tmp, 'Other', 'else', 'main');
  const r = cli(['next'], { cwd: f.cons, tmp: f.tmp, env: { BACKLOG_HOME: other } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /has origin 'Other\/else'; expected SmoothSDLC\/smoothsdlc-backlog/);
});
