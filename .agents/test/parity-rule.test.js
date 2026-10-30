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
    // a skip reason held in a variable or a { skip } option: any string that names the oracle's parts is ORACLE_SKIP's
    const named = [...text.matchAll(/['"`]([^'"`\n]*(?:SMOOTH_BACKLOG_SCRIPTS|PyYAML)[^'"`\n]*)['"`]/g)].map(m => m[1]).filter(r => /\b(needs|missing|not here|not configured)\b/i.test(r));
    if (f !== 'shared-fixtures.js') assert.deepEqual(named, [], `${f}: an oracle skip reason that is not ORACLE_SKIP`);
    // in a file that runs the oracle (py(...)), every skip or "not compared" note is ORACLE_SKIP's, or one of the known
    // reasons that have nothing to do with the oracle (no symlinks on this file system, a platform)
    if (!/\bpy\(/.test(text) || f === 'parity-rule.test.js') continue; // this file names the patterns it looks for
    // t.skip(...), ctx.skip(...), test.skip(...), it.skip(...), a diagnostic, or a { skip } option; a variable used as the
    // reason counts as ORACLE_SKIP's only when its definition is
    const reasons = [...text.matchAll(/\b(?:t|ctx|test|it|describe)\.(?:skip|todo|diagnostic)\(([^\n]*)|\bskip: ([^,}\n]+)/g)].map(m => (m[1] ?? m[2]).trim());
    const vars = new Set([...text.matchAll(/\bconst (\w+) = [^\n]*ORACLE_SKIP/g)].map(m => m[1]));
    const other = reasons.filter(r => !/ORACLE_SKIP|cannot create a symlink here|process\.platform/.test(r) && !vars.has(r));
    assert.deepEqual(other, [], `${f}: a skip or diagnostic in a parity file without the rule`);
  }
});
