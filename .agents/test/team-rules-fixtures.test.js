import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const NAMES = ['scrum', 'extreme-programming', 'parallel', 'single-agent', 'patterns'];
const files = Object.fromEntries(NAMES.map(n => [n, read(`../../templates/teams/${n}.json`)]));
const { cases } = read('./fixtures/team-rules/rule-cases.json');

test('the five example team files parse and name at least one team with rules', () => {
  for (const n of NAMES) { const teams = Object.values(files[n]); assert.ok(teams.length > 0, n); for (const t of teams) assert.ok(t.rules?.table?.length, n); }
});

test('the cases file has 288 cases with the run kinds of the plan', () => {
  assert.equal(cases.length, 288);
  const kinds = {}; for (const c of cases) kinds[c.command.run] = (kinds[c.command.run] ?? 0) + 1;
  assert.deepEqual(kinds, { update: 155, new: 25, pop: 17, filter: 9, resolve: 6, 'user-show': 6, validate: 40, inputs: 12, 'user-ref': 2, 'user-set': 2, 'migrate-check': 1, 'migrate-ask': 1, 'teams-file': 8, 'setup-advice': 4 });
  assert.equal(new Set(cases.map(c => c.id)).size, 288);
});

test('every case names a rule set that exists', () => {
  for (const c of cases) assert.ok(c.rule_set == null || c.rule_set === 'inline' || NAMES.includes(c.rule_set), `${c.id}: ${c.rule_set}`);
  for (const c of cases.filter(x => x.rule_set === 'inline')) assert.ok(c.given.team_file || c.command.run !== 'update', c.id);
});
