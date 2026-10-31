import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
      lines.forEach((line, i) => { if (line.includes(needle)) hits.push(`${file}:${i + 1}: ${entry}`); });
    }
  }
  assert.equal(hits.length, 0, `private environment detail in the tracked files:\n${hits.slice(0, 50).join('\n')}${hits.length > 50 ? `\n... and ${hits.length - 50} more` : ''}`);
});
