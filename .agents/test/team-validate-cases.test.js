// The validate cases of the case file run against the checks of the team file. Findings are compared by path, rule and problem for the errors only
// (a warning has no place in a case); the exit is 2 when there is an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { errors, validate } from '../../src/team/rules/validate.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { cases } = read('./fixtures/team-rules/rule-cases.json');
const FILES = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, read(`../../templates/teams/${n}.json`)]));

// 37 cases run here: the shape of the file, names, people, the item definition, every rule and the five templates. The others are left to the checks of the
// shadowing, the pop entries and the filters.
const RUN_COUNT = 37;
const LATER = ['VAL-01', 'VAL-07', 'VAL-18'];
const all = cases.filter(c => c.command.run === 'validate');
const ran = all.filter(c => !LATER.includes(c.id));

for (const c of ran) {
  test(`${c.id}: validate`, () => {
    const findings = validate(c.rule_set === 'inline' ? c.given.team_file : FILES[c.rule_set]);
    const errs = errors(findings);
    assert.equal(errs.length ? 2 : 0, c.expect.exit, JSON.stringify(errs));
    assert.deepEqual(errs.map(({ path, rule, problem }) => ({ path, rule, problem })), c.expect.findings);
    for (const f of findings) assert.ok(f.fix, `finding without a fix: ${JSON.stringify(f)}`);
  });
}

test('the harness runs every validate case it supports, none silently dropped', () => {
  console.log(`cases run: ${ran.length}`);
  assert.equal(ran.length, RUN_COUNT);
  assert.equal(all.length, RUN_COUNT + LATER.length);
  for (const id of LATER) assert.ok(all.some(c => c.id === id), `${id} is not a validate case`);
});
