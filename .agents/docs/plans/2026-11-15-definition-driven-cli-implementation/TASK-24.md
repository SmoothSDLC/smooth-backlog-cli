# TASK-24: backlog import, branch and branch import

| | |
|---|---|
| Kind | build |
| Depends on | TASK-18 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-25, INT-04 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

### 4.14 Other behaviour

- **Printed lists.** `backlog list` prints one line per item: the priority (`p0`), the number, the slug and the status; `--json` prints the items. `backlog show` prints every property and the history, one entry per line.
- **`--ask` without a terminal** fails with a message saying there is no terminal and naming the flags to give instead.
- **Messages about the backlog location.** A message the CLI writes that names the address of the backlog repository leaves out the credential part of the address (between `://` and the last `@`).
- **Unreadable item.** A command that meets an item it cannot read fails with a message naming the item and the property; the ways out are `backlog update <item> <property> <value>`, `backlog update <item> restore` (its previous committed version), and, for an unreadable number, `backlog update <slug> seq <n>`.
- **`archive done`** archives the items of the branch whose status is a `final` value of the definition that applies.
- **`backlog import <branch>`** and **`backlog branch import <branch>`** do the same thing: the open items of that branch come to the current branch, after its items, before them with `--higher`. With `--repository <owner/name>`, `backlog import <branch>` takes the open items of that branch of the other repository's backlog: each gets a new number here, keeps its title, description and fields, and gets a history entry naming where it came from; each is validated against the definition that applies here, and an item that does not fit is not imported and is named in the failure message with its properties to fix.
- **The update notice.** Its settings are in `smooth-backlog-cli/config.json` of the user's configuration folder (`$XDG_CONFIG_HOME`, else `~/.config`), never in a repository: `weekly` on by default, `auto` off. A command run at a terminal checks for a release beside its work when the last check is older than seven days (24 hours with `auto`, one hour after a failed check), waits for it at most 1.5 seconds after its own work, and only prints a warning on standard error.
- **Git.** Team commands need git 2.40 or later; with an older git they fail with a message naming the version found and the version needed.

- **C-16.** The kept commands beyond create, update, list, show and archive are `backlog archive done`, `backlog import`, `backlog branch` and `backlog branch import`; `import` and `branch import` do the same thing.

## Scenarios (BDD)

- U-IMP-1. `backlog import feature-x` brings the open items of branch `feature-x` to the current branch, after the current branch's items; with `--higher` before them.
- *U-BR-1. `backlog branch` lists the branches that have items.
- *U-BR-2. `backlog branch import feature-x` does what U-IMP-1 does.

## Files

- src/shared/move.js
- features/branches.feature
- .agents/test/branches.test.js

## Interfaces

- `importBranch(source, {higher, whatif}, ctx) -> number[]` used by both `backlog import <branch>` and `backlog branch import <branch>`; `branchesWithItems(ctx) -> string[]` for `backlog branch`.

## Unit tests (TDD)

- every listed scenario as a scenario.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-24 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/branches.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-24: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-24: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-24: backlog import, branch and branch import` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-24 | status: DONE or BLOCKED | branch: task/TASK-24 | commit: <sha>
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
2. `git switch task/TASK-24`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-24 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
