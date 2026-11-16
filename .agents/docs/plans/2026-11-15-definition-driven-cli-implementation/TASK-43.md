# TASK-43: backlog upgrade: conversion per version

| | |
|---|---|
| Kind | build |
| Depends on | TASK-42, TASK-37 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-44 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

### 4.12 Upgrade

`backlog upgrade` installs the latest release of the CLI (`check`, `auto`, `off`, `disable` and `<version>` control the update notice and the version), then brings every item of the repository's backlog to the running version:

1. it reads each item's `cli_version` (an item with none, or a markdown item, is of the oldest version);
2. it runs the conversion written for that version: markdown items become JSON items, older JSON items get the current base properties and form;
3. it sets `cli_version` and validates the converted item as `backlog validate` does;
4. an item with no conversion for its version, or that does not fit its definition after conversion, is left unchanged; the command fails with a message listing those items, saying they must be updated by hand, and naming the schema files of the current version that state the required properties and their form: `item.schema.json` and the item definition that applies.

`--whatif` reports what would be converted and changes nothing.

- **C-50.** Every command but `backlog`, `--help` and `backlog upgrade` fails while any item is of an older version; `backlog upgrade` converts per version and names the schema files when an item must be updated by hand.

## Scenarios (BDD)

- U-UPG-1. `backlog upgrade`, `upgrade check`, `auto`, `off`, `disable` and `<version>` and the update notice behave as 4.12 and 4.14 say.
- *U-UPG-2. Given markdown items and JSON items of an older version. When `backlog upgrade` is run. Then every item is converted, has the running `cli_version`, and passes the checks of `backlog validate`.
- *U-UPG-3. Given an item of a version with no conversion. When `backlog upgrade` is run. Then that item is unchanged and the command fails with a message listing it, saying it must be updated by hand, and naming `item.schema.json` and the item definition that applies.
- *U-UPG-4. With `--whatif` it reports what would be converted and changes nothing.

## Files

- src/upgrade.js
- src/shared/convert.js (new)
- features/upgrade.feature

## Interfaces

- `convertItem(text, fromVersion) -> Item | null`: one conversion per version (markdown to JSON included); null when none exists. `backlog upgrade` converts, sets `cli_version`, validates, and fails listing the items it could not convert with `item.schema.json` and the item definition that applies; `--whatif` changes nothing.

## Unit tests (TDD)

- every listed scenario as a scenario.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-43 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/upgrade.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-43: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-43: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-43: backlog upgrade: conversion per version` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-43 | status: DONE or BLOCKED | branch: task/TASK-43 | commit: <sha>
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
2. `git switch task/TASK-43`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-43 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
