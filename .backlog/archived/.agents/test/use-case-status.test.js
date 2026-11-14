// The use-case status table of the branch plan stays reconciled: every use case of every source has one row and one status,
// and the committed counts match the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'plans', '2026-11-12-simplify-branch-completion', 'use-case-status.mjs');

test('the use-case status table holds every use case once, with one status, and its counts reconcile', () => {
  const r = spawnSync(process.execPath, [script, 'check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
