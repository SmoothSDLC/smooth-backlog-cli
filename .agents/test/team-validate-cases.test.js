// The validate cases of the case file run against the checks of the team file. Findings are compared by path, rule and problem for the errors only
// (a warning has no place in a case); the exit is 2 when there is an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { errors, validate } from '../../src/team/rules/validate.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { cases } = read('./fixtures/team-rules/rule-cases.json');
const FILES = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, read(`../../templates/teams/${n}.json`)]));

const RUN_COUNT = 40;
const all = cases.filter(c => c.command.run === 'validate');
const ran = all;

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
});
