# TASK-30: Rules validation: contradictions

| | |
|---|---|
| Kind | build |
| Depends on | TASK-29 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-31, INT-05, TASK-37 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

## 11. Validation of the rules

`backlog validate` and `backlog team validate` check every team of the team file at once; any finding makes the whole file invalid:

1. the file fits [team-file.schema.json](../2026-11-14-definition-driven-cli/team-file.schema.json) and each rule set fits [team-rules.schema.json](../2026-11-14-definition-driven-cli/team-rules.schema.json);
2. every operator is one of 6; every regular expression can be matched in linear time;
3. every path a rule, queue entry or filter reads is one of 5 and names a declared property;
4. every literal compared with a field that has `values` is one of them;
5. every `error` exists and every path it puts in can be read;
6. contradictions between literals: a rule whose `require` cannot hold under its own `when` (for example `when` next.status is closed and `require` next.status is not closed); two rules whose `when` are the same transition of one field and whose `require` demand one field equal two different literals;
7. every role word in `roles` and in a literal compared with `caller.roles` is held by a person of the team.

Each finding names the team, the rule (`id` or place), the reason and a fix. Contradictions that depend on data cannot always be found; the team is responsible for them.

## Scenarios (BDD)

- *T-RULE-9. Validation finds: a rule reading an undeclared field; a literal compared with a field that is not one of its `values`; an unknown operator; a rule whose `require` cannot hold under its own `when`; two rules on the same transition requiring one field to equal two different literals; an `error` reading an unknown path; `==` or `!=` (a warning). Each is reported with the team, the rule's id or place, the reason and the fix, and the whole team file is invalid.

## Files

- src/team/engine-validate.js
- .agents/test/engine-validate.test.js

## Interfaces

- Check 6 of section 11 in `validateRuleSet`.

## Unit tests (TDD)

- `require cannot hold under its when`.
- `two rules, same transition, different literals`.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-30 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-30: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-30: Rules validation: contradictions` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-30 | status: DONE or BLOCKED | branch: task/TASK-30 | commit: <sha>
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
2. `git switch task/TASK-30`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-30 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
