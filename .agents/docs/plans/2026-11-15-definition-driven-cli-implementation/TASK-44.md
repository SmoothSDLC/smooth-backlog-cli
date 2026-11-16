# TASK-44: Remove backlog team migrate

| | |
|---|---|
| Kind | build |
| Depends on | TASK-43 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-45, INT-07 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

### 5.3 Commands and flags to remove from the code

- Commands: `backlog next`, `changes`, `fields`, `done`, `move`, `history`, `init clean`; `backlog team define`, `backlog team workflow`, `backlog team migrate`, `backlog team query check`, `query steps`, `query filter`.
- The form `backlog team update <item> <step>` and every step word in the code.
- Flags: `--dry-run`, `--body`, `--name`, `--append`, `--claim`, `--section` with `--set-lines`, `--add-line`, `--remove-line`, `--move-line`, `--top`; `--restore` as a flag; every flag that sets one field (`--status`, `--objective`, `--summary`, `--severity`, `--depends-on`, `--estimate`, `--complexity`, `--layer`, `--chunk`, `--set-*`, `--replan`, `--release`, `--close`, `--by`, `--reason`).
- Each removed command or flag fails with a message saying it does not exist and naming `backlog --help`.
- The environment variables `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS` and `SMOOTH_BACKLOG_CLI_RUN_HOOK`.

## 7. Code to remove

- The coded team workflow: `src/team/lifecycle.js`, `queue.js`, `team.js`, `workflow.js`, `wip.js`, `views.js`, `handoff.js`, `handoff-commands.js`.
- The coded checks of user commands: `src/shared/dependencies.js`, `wip-limits.js`, `plain-step.js`, and the status words of `src/shared/status.js`.
- The rule evaluator built on steps: `src/team/rules/expression.js`, `step.js`, `pop.js`, `safe-regex.js`, `validate-rules.js`, replaced by Ajv, json-logic-js and re2 (9).
- The fixed field list of `src/shared/item-definition.js` and the `fields` object of `src/shared/item-json.js`.
- The variables `SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS` and `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD`.
- The lock of a local copy and its wait, the recovery journal, and the automatic re-run of a team command after a refused push (4.10).
- The run hook: the start of a program named by `SMOOTH_BACKLOG_CLI_RUN_HOOK` in `bin/backlog.js`, its help paragraph in every command's help, and its tests. The CLI starts no other program.
- The command `backlog team migrate` and its code; its conversion becomes part of `backlog upgrade` (4.12).
- `templates/workflows/team.json` and the team templates of `templates/teams/`, replaced by `templates/teams.example.json`.
- Every feature file and test of a removed behaviour.

## Scenarios (BDD)

None of its own.

## Files

- src/team/migrate.js, migrate-plan.js, migrate-convert.js (removed)
- src/team/cli.js

## Interfaces

- `backlog team migrate` fails with a message saying the command does not exist; its conversion lives in `src/shared/convert.js` (task "backlog upgrade: conversion per version").

## Unit tests (TDD)

- `npm test` passes with the migrate tests moved into the upgrade tests.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-44 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-44: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-44: Remove backlog team migrate` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-44 | status: DONE or BLOCKED | branch: task/TASK-44 | commit: <sha>
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
2. `git switch task/TASK-44`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-44 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
