# TASK-37: backlog validate

| | |
|---|---|
| Kind | build |
| Depends on | TASK-06, TASK-14, TASK-30 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-38, TASK-39, TASK-43 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

### 4.5 Validation

`backlog validate` checks with Ajv, in this order: each schema file against the published JSON Schema specification; the team file, every team in it at once, against `team-file.schema.json` and `team-rules.schema.json`, and the rules by the checks of [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md) section 11; the user item definition against `item-definition.schema.json`; the repository's redaction rules ([redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md) section 5); every item against `item.schema.json` and the definition that applies (every required field set, every value of its type); every item of a team against its team's rules. Each problem is reported with where it is, why, and what would fix it. A team command validates the team file before it acts; any finding in any team stops every team command. The file's SHA is kept in the configuration and a valid result is reused for 24 hours.

## 5. Validation

`backlog validate` checks that `redaction_rules` fits the schema, that every `find` is valid RE2 syntax, and that every name in `properties` is a base property or a field of some item definition of the repository. A finding is reported with the rule (`id` or place), the reason and the fix.

- **C-17.** `backlog validate` checks what people write by hand: the schema files against the published JSON Schema specification, the whole team file at once, the user item definition, the redaction rules, and every item against its definition and, for a team's item, its team's rules.

## Scenarios (BDD)

- *U-VAL-1. Given valid files. Then it says every check passed.
- *U-VAL-2. Given a schema file that is not valid JSON Schema 2020-12. Then it is reported.
- *U-VAL-3. Given a team file with two teams, one with a broken rule. Then the whole file is reported invalid, the problem named with its team, rule, reason and fix.
- *U-VAL-4. Given a user item definition that does not fit `item-definition.schema.json`. Then it is reported.
- *U-RED-4. `backlog validate` reports a redaction rule whose `find` is not valid RE2 syntax, and a `properties` name no definition declares.

## Files

- src/shared/validate.js (new)
- features/validate.feature

## Interfaces

- `validateAll(ctx) -> Finding[]` in the order of 4.5.

## Unit tests (TDD)

- every listed scenario as a scenario.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-37 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/validate.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-37: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-37: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-37: backlog validate` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-37 | status: DONE or BLOCKED | branch: task/TASK-37 | commit: <sha>
Files changed: <list>
Scenarios written and passing: <ids, or none>
Unit tests written and passing: <names>
npm test: <pass count> pass, <fail count> fail | check: pass | guard: pass
Self review findings fixed: <one line each, or none>
Open: <anything left, with the reason>
```

## Session 2: review (at most 15 minutes, a new session)

A new session reads only this file and the hand-off in the task's backlog item.

1. Load the skills: `requesting-code-review` (its reviewer checklist), `ponytail-review`, `verification-before-completion`.
2. `git switch task/TASK-37`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-37 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
