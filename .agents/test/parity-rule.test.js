// Item 023 (owner decision 9b): the review rule for a local parity run on BigFan is in the repository's development
// document, and every parity test that skips for want of the oracle names that rule in its skip reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORACLE_SKIP } from './shared-fixtures.js';

const dir = fileURLToPath(new URL('.', import.meta.url));

test('023: the parity rule is written down, and every oracle skip names it', () => {
  const doc = readFileSync(fileURLToPath(new URL('../docs/development.md', import.meta.url)), 'utf8');
  assert.match(doc, /needs a local parity run on\s+BigFan/);
  assert.match(ORACLE_SKIP, /Review rule \(item 023\): an item that changes the storage or the backlog format needs a local parity run on BigFan/);
  for (const f of readdirSync(dir).filter(n => n.endsWith('.test.js'))) {
    const text = readFileSync(join(dir, f), 'utf8');
    const literal = [...text.matchAll(/\.skip\(\s*['"`]([^'"`]*)['"`]/g)].map(m => m[1]).filter(r => /oracle/i.test(r) && !r.includes('${ORACLE_SKIP}'));
    assert.deepEqual(literal, [], `${f}: an oracle skip without the rule`);
  }
});
