# TASK-40: backlog setup: configuration and skill

| | |
|---|---|
| Kind | build |
| Depends on | INT-02 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-41 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

### 4.11 Setup

`backlog setup`, run inside a repository:

1. finds or creates the backlog location and writes `.backlog/config.json` with its keys (3.4), the five variable names included;
2. when items exist, applies the version check of 4.15 before anything else;
3. installs or replaces the backlog skill in every agent folder it finds: `.agents`, `.claude`, `.github`, `.qwen`;
4. copies the example team file and the packaged defaults into `.backlog`;
5. commits what it wrote; a second run with nothing new adds no commit; it prints no folder path.

`--ask` asks on a terminal for what is not configured.

## Scenarios (BDD)

- U-SETUP-1. Given a repository with no `.backlog`. When `backlog setup` is run. Then `.backlog/config.json` exists and is committed, and no folder path is printed.
- *U-SETUP-2. Then the configuration holds `archive_folder`, the five variable keys (each naming a variable that starts with `SMOOTH_BACKLOG_CLI_`) and `redact_pii` false, and fits `config.schema.json`.
- *U-SETUP-3. Given the repository has `.claude` and `.github` folders. Then the skill is installed in `.claude/skills/backlog` and `.github/skills/backlog`, and in no folder that does not exist. Given an older skill there, it is replaced.
- U-SETUP-6. When `backlog setup` is run a second time with nothing new. Then no commit is added.
- U-SETUP-7. Given a terminal. When `backlog setup --ask` is run. Then it asks for what is not configured.

## Files

- src/shared/setup.js
- src/integrations.js
- features/setup.feature

## Interfaces

- Writes every key of `config.schema.json` that has a default; installs or replaces the skill in each of `.agents`, `.claude`, `.github`, `.qwen` that exists.

## Unit tests (TDD)

- every listed scenario as a scenario.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-40 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/setup.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-40: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-40: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-40: backlog setup: configuration and skill` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-40 | status: DONE or BLOCKED | branch: task/TASK-40 | commit: <sha>
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
2. `git switch task/TASK-40`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-40 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
