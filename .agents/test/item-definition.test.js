// The built-in definition of an item without a team: one order shared by the item file codec, the defaults, and the output of backlog fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENVELOPE, FIELDS, BUILT_IN_ORDER } from '../../src/shared/item-definition.js';
import { toItemJson } from '../../src/shared/item-json.js';
import { cli } from './shared-fixtures.js';

test('the item file writes the fields in the order of the definition', () => {
  const fm = { phase: '001-a', seq: 1, name: 'a', repository: 'r', branch: 'b', updated: 'u', zz_extra: 1 };
  for (const k of [...BUILT_IN_ORDER].reverse()) fm[k] = 1;
  const keys = [...toItemJson(fm, '').matchAll(/^ {4}"([^"]+)":/gm)].map(m => m[1]);
  assert.deepEqual(keys, [...BUILT_IN_ORDER, 'zz_extra']);
});

test('the definition holds the holder as owner and owned_since, no separate creator, and the defaults', () => {
  assert.deepEqual(BUILT_IN_ORDER.filter(k => /own|claim/.test(k)), ['owner', 'owned_since']);
  const row = k => FIELDS.find(f => f[0] === k);
  assert.equal(row('status')[3], 'pending');
  assert.deepEqual(row('severity').slice(2, 4), [['normal', 'critical'], 'normal']);
  assert.deepEqual(ENVELOPE.map(e => e[0]), ['seq', 'slug', 'name', 'repository', 'branch', 'created', 'updated', 'updated_by']);
});

test('backlog fields and --json print the definition', () => {
  const rows = [...ENVELOPE, ...FIELDS].map(f => f[0]);
  assert.deepEqual(cli(['fields'], {}).stdout.trimEnd().split('\n').slice(1).map(l => l.split(' ')[0]), rows);
  const json = JSON.parse(cli(['fields', '--json'], {}).stdout);
  assert.deepEqual(json.map(x => x.key), rows);
  assert.equal(json.find(x => x.key === 'severity').type, 'text: normal, critical');
});
