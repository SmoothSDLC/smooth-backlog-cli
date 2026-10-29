import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './helpers.js';
// Stub recorder: appends its argv to $RECORD_OUT, like /opt/cody/bin/script_runs.py would record the run.
const STUB = "import os, sys\nopen(os.environ['RECORD_OUT'], 'a').write(' '.join(sys.argv[1:4]) + '\\n')\n";
async function waitFor(file) { for (let i = 0; i < 100 && !existsSync(file); i++) await new Promise(r => setTimeout(r, 50)); }
function setup(t) {
  const f = fixture(t); const d = mkdtempSync(join(tmpdir(), 'script-runs-')); t.after(() => rmSync(d, { recursive: true, force: true }));
  writeFileSync(join(d, 'stub.py'), STUB); const out = join(d, 'out.txt');
  return { f, out, stub: join(d, 'stub.py') };
}
for (const [label, args, rc] of [['success', ['--json', '--version'], '0'], ['failure', ['--json', 'no-such-command'], null]]) {
  test(`backlog.js records one run with its name and exit code (${label})`, async t => {
    const { f, out, stub } = setup(t);
    const p = f.raw(args, { env: { ...f.env, CODY_SCRIPT_RUNS_MODULE: stub, RECORD_OUT: out } });
    await waitFor(out);
    const lines = readFileSync(out, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1); assert.equal(lines[0], `record backlog.js ${p.status}`);
    if (rc !== null) assert.equal(p.status, 0); else assert.notEqual(p.status, 0);
  });
  test(`backlog.js behaves the same without the recorder (${label})`, t => {
    const { f, out } = setup(t);
    const p = f.raw(args, { env: { ...f.env, CODY_SCRIPT_RUNS_MODULE: '/nonexistent/script_runs.py', RECORD_OUT: out } });
    if (rc !== null) assert.equal(p.status, 0); else assert.notEqual(p.status, 0);
    assert.equal(p.signal, null); assert.equal(existsSync(out), false);
  });
}
