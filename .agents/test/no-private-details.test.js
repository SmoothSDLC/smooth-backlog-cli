import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repository root, two levels above this file (.agents/test/).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// With the variable unset (as in CI) the guard has no deny list to work from, so it skips; the reason
// says what the test is and what the variable must hold when it runs.
test('the tracked files name no private environment detail', { skip: process.env.BACKLOG_PRIVATE_DENYLIST ? false : 'guard skipped: BACKLOG_PRIVATE_DENYLIST is unset; on the owner workstation it names the deny list of private environment details, and with it set this test scans every tracked file for them' }, () => {
  const list = readFileSync(process.env.BACKLOG_PRIVATE_DENYLIST, 'utf8')
    .split('\n').map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  assert.ok(list.length > 0, 'the deny list is empty: every non-comment, non-empty line is a denied detail');
  const ls = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ls.status, 0, `git ls-files failed: ${ls.stderr}`);
  const hits = [];
  for (const file of ls.stdout.split('\n').filter(Boolean)) {
    const lines = readFileSync(join(ROOT, file), 'utf8').toLowerCase().split('\n');
    for (const entry of list) {
      const needle = entry.toLowerCase();
      // file and line only: the denied detail itself must not be printed into the failure message
      lines.forEach((line, i) => { if (line.includes(needle)) hits.push(`${file}:${i + 1}`); });
    }
  }
  assert.equal(hits.length, 0, `private environment detail in the tracked files:\n${hits.slice(0, 50).join('\n')}${hits.length > 50 ? `\n... and ${hits.length - 50} more` : ''}`);
});

test('the guard reports a hit by file and line, without the denied detail', { skip: process.env.BACKLOG_GUARD_FIXTURE ? 'inside the guard fixture' : false }, t => {
  const tmp = mkdtempSync(join(tmpdir(), 'guard-msg-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const guard = join(tmp, '.agents', 'test', 'no-private-details.test.js');
  mkdirSync(dirname(guard), { recursive: true });
  copyFileSync(fileURLToPath(import.meta.url), guard); // a copy runs inside the fixture, so the fixture is a real git repository with a tracked hit
  writeFileSync(join(tmp, 'tracked.md'), 'the line names the detail guard-hit-literal-x7q\n');
  const g = args => { const p = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' }); assert.equal(p.status, 0, p.stdout + p.stderr); };
  g(['init', '-q', '-b', 'main']);
  g(['add', '-A']);
  g(['-c', 'user.name=guard', '-c', 'user.email=guard@test.invalid', 'commit', '-qm', 'fixture']);
  const deny = join(tmp, 'deny.txt');
  writeFileSync(deny, 'guard-hit-literal-x7q\n');
  // a minimal environment: the runner's NODE_TEST_* variables make a nested test run skip its files
  const run = spawnSync(process.execPath, ['--test', '.agents/test/no-private-details.test.js'], {
    cwd: tmp, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, BACKLOG_GUARD_FIXTURE: '1', BACKLOG_PRIVATE_DENYLIST: deny },
  });
  const out = `${run.stdout}\n${run.stderr}`;
  assert.match(out, /tracked\.md:1/, 'the hit is reported by file and line:\n' + out);
  assert.doesNotMatch(out, /guard-hit-literal-x7q/, 'the denied detail itself is printed in the guard failure message:\n' + out);
});
