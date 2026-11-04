// Item 086: the proof that the optional run recorder hook is the only child process the CLI starts.
// A test-only module (no-child-process-preload.cjs) is preloaded into the CLI child through
// NODE_OPTIONS=--require: it wraps the child_process functions spawn, spawnSync, exec, execFile,
// execSync and fork and records every call, so no executable - a name on the PATH, an absolute
// path or a detached child - can escape the assertion. With CODY_SCRIPT_RUNS_MODULE unset, no
// call executes the recorder: local mode starts no child process, shared mode starts only its
// git calls. With the variable set, a positive control proves the preload catches the one
// recorder call (python3 <module> record backlog.js). The PATH-fake tests of
// script-runs.test.js are kept; this proof adds the any-executable and any-absolute-path
// coverage the fakes cannot see (lead ruling 2026-10-31 after codex round 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './helpers.js';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const PRELOAD = join(dirname(fileURLToPath(import.meta.url)), 'no-child-process-preload.cjs');
// Stub recorder: appends its argv to $RECORD_OUT, like a run recorder would record the run.
const STUB = "import os, sys\nopen(os.environ['RECORD_OUT'], 'a').write(' '.join(sys.argv[1:4]) + '\\n')\n";
// the stub creates the file before it writes the line: wait for the whole line, not the file (a CI run read it empty)
const written = file => existsSync(file) && readFileSync(file, 'utf8').endsWith('\n');
async function waitFor(file) { for (let i = 0; i < 100 && !written(file); i++) await new Promise(r => setTimeout(r, 50)); }
// The calls the preload recorded: one JSON object per child process the CLI started.
const calls = file => (existsSync(file) ? readFileSync(file, 'utf8') : '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
// A shared-mode fixture: the shared backlog clone, a consumer repository, shared mode on.
function sharedFixture(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(dir, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { dir, home, cons };
}

test('no child process: local mode, CODY_SCRIPT_RUNS_MODULE unset - the CLI starts none', t => {
  const f = fixture(t);
  const log = join(f.dir, 'calls.jsonl');
  const env = { ...f.env, NODE_OPTIONS: `--require ${PRELOAD}`, BACKLOG_CHILD_CALLS_FILE: log };
  delete env.CODY_SCRIPT_RUNS_MODULE;
  const p = f.raw(['--json', '--version'], { env });
  assert.equal(p.status, 0, p.stderr || p.stdout);
  assert.deepEqual(calls(log), [], `child processes the CLI started although the recorder variable is unset: ${JSON.stringify(calls(log))}`);
});

test('no child process: local mode, the recorder variable set - the preload catches the one recorder call', async t => {
  const f = fixture(t);
  const stub = join(f.dir, 'stub.py');
  const out = join(f.dir, 'record-out.txt');
  const log = join(f.dir, 'calls.jsonl');
  writeFileSync(stub, STUB);
  const env = { ...f.env, NODE_OPTIONS: `--require ${PRELOAD}`, BACKLOG_CHILD_CALLS_FILE: log, CODY_SCRIPT_RUNS_MODULE: stub, RECORD_OUT: out };
  const p = f.raw(['--json', '--version'], { env });
  assert.equal(p.status, 0, p.stderr || p.stdout);
  const rec = calls(log);
  assert.equal(rec.length, 1, `expected the one recorder call, the CLI started: ${JSON.stringify(rec)}`);
  assert.equal(rec[0].fn, 'spawn');
  assert.equal(rec[0].command, 'python3');
  assert.deepEqual(rec[0].args.slice(0, 3), [stub, 'record', 'backlog.js'], 'the recorder call names the module and the record command');
  await waitFor(out);
  assert.equal(readFileSync(out, 'utf8').trim(), 'record backlog.js 0', 'the recorded child actually ran the recorder');
});

test('no child process: shared mode, CODY_SCRIPT_RUNS_MODULE unset - the only child processes are git', t => {
  const f = sharedFixture(t, 'proof-shared-unset-');
  const log = join(f.dir, 'calls.jsonl');
  const r = cli(['new', '--name', 'Proof item', '--summary', 's', '--depends-on', 'none'], {
    cwd: f.cons,
    tmp: f.dir,
    env: { NODE_OPTIONS: `--require ${PRELOAD}`, BACKLOG_CHILD_CALLS_FILE: log },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const rec = calls(log);
  assert.ok(rec.length > 0, 'the shared command started its git calls; none were recorded: check the preload is effective');
  assert.deepEqual(rec, rec.filter(c => c.command === 'git'), `a child process other than a git call was started although the recorder variable is unset: ${JSON.stringify(rec)}`);
});

test('no child process: shared mode, the recorder variable set - the recorder is the one non-git call', async t => {
  const f = sharedFixture(t, 'proof-shared-set-');
  const stub = join(f.dir, 'stub.py');
  const out = join(f.dir, 'record-out.txt');
  const log = join(f.dir, 'calls.jsonl');
  writeFileSync(stub, STUB);
  const r = cli(['new', '--name', 'Proof item', '--summary', 's', '--depends-on', 'none'], {
    cwd: f.cons,
    tmp: f.dir,
    env: { NODE_OPTIONS: `--require ${PRELOAD}`, BACKLOG_CHILD_CALLS_FILE: log, CODY_SCRIPT_RUNS_MODULE: stub, RECORD_OUT: out },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const rec = calls(log);
  const recorder = rec.filter(c => c.command === 'python3');
  assert.equal(recorder.length, 1, `expected the one recorder call; the CLI started: ${JSON.stringify(rec)}`);
  assert.deepEqual(recorder[0].args.slice(0, 3), [stub, 'record', 'backlog.js']);
  assert.deepEqual(rec.filter(c => c.command !== 'python3'), rec.filter(c => c.command === 'git'), `a child process other than the recorder or a git call was started: ${JSON.stringify(rec)}`);
  await waitFor(out);
  assert.equal(readFileSync(out, 'utf8').trim(), 'record backlog.js 0', 'the recorded child actually ran the recorder');
});
