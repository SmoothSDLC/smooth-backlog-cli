import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repository root, two levels above this file (.agents/test/).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// The committed list of made-up entries the guard uses when the private list is not given (item 132).
const SYNTHETIC = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'denylist-synthetic.txt');

// The guard never skips (item 132): with SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST set (the owner workstation) it scans with that private
// list; with it unset (as in CI) it scans with the committed synthetic list and leaves that list file out of the scan.
test('the tracked files name no private environment detail', () => {
  const synthetic = !process.env.SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST;
  const used = synthetic ? 'the synthetic fixture list (SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST is unset)' : 'the private deny list (SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST)';
  const list = readFileSync(synthetic ? SYNTHETIC : process.env.SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST, 'utf8')
    .split('\n').map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  assert.ok(list.length > 0, 'the deny list is empty: every non-comment, non-empty line is a denied detail');
  const ls = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ls.status, 0, `git ls-files failed: ${ls.stderr}`);
  const hits = [];
  const skipFile = synthetic ? relative(ROOT, SYNTHETIC).split(sep).join('/') : null; // git ls-files names use /
  for (const file of ls.stdout.split('\n').filter(Boolean)) {
    if (file === skipFile) continue;
    const lines = readFileSync(join(ROOT, file), 'utf8').toLowerCase().split('\n');
    for (const entry of list) {
      const needle = entry.toLowerCase();
      // file and line only: the denied detail itself must not be printed into the failure message
      lines.forEach((line, i) => { if (line.includes(needle)) hits.push(`${file}:${i + 1}`); });
    }
  }
  assert.equal(hits.length, 0, `private environment detail in the tracked files (list: ${used}):\n${hits.slice(0, 50).join('\n')}${hits.length > 50 ? `\n... and ${hits.length - 50} more` : ''}`);
});

test('with SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST unset the guard scans with the synthetic list and leaves that list file out', { skip: process.env.BACKLOG_GUARD_FIXTURE ? 'inside the guard fixture' : false }, t => {
  const tmp = mkdtempSync(join(tmpdir(), 'guard-syn-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const guard = join(tmp, '.agents', 'test', 'no-private-details.test.js');
  mkdirSync(join(dirname(guard), 'fixtures'), { recursive: true });
  copyFileSync(fileURLToPath(import.meta.url), guard);
  copyFileSync(SYNTHETIC, join(dirname(guard), 'fixtures', 'denylist-synthetic.txt'));
  // the entry is read from the fixture at run time: a literal here would make this file a hit itself
  const entry = readFileSync(SYNTHETIC, 'utf8').split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
  writeFileSync(join(tmp, 'tracked.md'), `the line names ${entry}\n`);
  const g = args => { const p = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' }); assert.equal(p.status, 0, p.stdout + p.stderr); };
  g(['init', '-q', '-b', 'main']);
  g(['add', '-A']);
  g(['-c', 'user.name=guard', '-c', 'user.email=guard@test.invalid', 'commit', '-qm', 'fixture']);
  const run = spawnSync(process.execPath, ['--test', '.agents/test/no-private-details.test.js'], {
    cwd: tmp, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, BACKLOG_GUARD_FIXTURE: '1' },
  });
  const out = `${run.stdout}\n${run.stderr}`;
  assert.match(out, /tracked\.md:1/, 'the hit is reported by file and line:\n' + out);
  assert.match(out, /synthetic/, 'the failure names the list it used:\n' + out);
  assert.doesNotMatch(out, /denylist-synthetic\.txt:/, 'the synthetic list file itself is scanned:\n' + out);
  assert.doesNotMatch(out, new RegExp(entry), 'the denied detail itself is printed in the guard failure message:\n' + out);
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
    cwd: tmp, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, BACKLOG_GUARD_FIXTURE: '1', SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST: deny },
  });
  const out = `${run.stdout}\n${run.stderr}`;
  assert.match(out, /tracked\.md:1/, 'the hit is reported by file and line:\n' + out);
  assert.doesNotMatch(out, /guard-hit-literal-x7q/, 'the denied detail itself is printed in the guard failure message:\n' + out);
});
