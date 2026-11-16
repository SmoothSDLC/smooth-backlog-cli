# TASK-12: Concurrency: the first push wins, the loser fails

| | |
|---|---|
| Kind | build |
| Depends on | TASK-11, TASK-08 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | INT-02, FAIL-01, FAIL-02, FAIL-03, FAIL-04, FAIL-05, FAIL-06, FAIL-07, FAIL-08, FAIL-09, FAIL-10, FAIL-11, FAIL-12, FAIL-13, FAIL-14, FAIL-15, FAIL-16, FAIL-17, FAIL-18, FAIL-19, FAIL-20, FAIL-21, FAIL-22 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 166 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- TASK-11 (backlog item 165): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-08 (backlog item 211): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

## Required reads (before any work, in this order)

1. `AGENTS.md` of the repository.
2. This task in its backlog item, with every line already in its Handoff section.
3. The hand-off of each task of "Depends on", in its backlog item.
4. The sections below; the specification text they need is copied into "Requirements". Open [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md) or the other specification files only for a section this task names.
5. Every file of "Files" that already exists.

## Skills (load by installed name)

- Session 1: `backlog`, `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
- Session 2: `backlog`, `requesting-code-review`, `ponytail-review`, `verification-before-completion`.

## Requirements (copied from the specification)

### 4.10 Two writers

Several agents may change the same backlog at the same time; the first to push wins. Every command that changes the backlog runs in this order:

1. pull the backlog;
2. compare each item it changes with this agent's record of when it last read the item (4.13); an item changed since by someone else stops the command;
3. write and commit only the CLI's files;
4. push the commit without force, so that git refuses it when the remote changed since the pull.

A command stopped at step 2 or refused at step 4 has lost: it reverts its files and its commit and fails with a message saying what changed, who changed it, and to read the item again and repeat the command. The CLI holds no lock, never waits for another command, and never repeats a command by itself.

- **C-48.** Concurrency is decided by git and the per-agent record of the last read: pull first, check the record, commit only the CLI's files, push without force; the first push wins and the loser reverts and fails; no lock, no wait, no automatic retry.

## Scenarios (BDD)

- *U-RACE-1. Two agents read item 12; agent A changes it; agent B's change of item 12 then fails with a message naming agent A and saying to read the item again; nothing of B's is written.
- *U-RACE-2. Two agents change different items at the same moment; the second push is refused by git; the second command reverts its files and commit and fails with a message saying the remote changed and to repeat the command.
- U-SYNC-2. A refused push takes back only the command's own files and commit; a person's commits stay; the command fails with a message saying the remote changed and to repeat the command.

## Files

- src/shared/store.js
- src/shared/team-publish.js
- features/storage.feature

## Interfaces

- Removes the lock of a local copy (`cloneLocked`, `lockWait`, `lockEnv`), the variables `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS` and `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD`, the recovery journal (`journalled`, `recoverJournal`), and the automatic re-run of a team command after a refused push. A command that changes the backlog runs: pull, the last-read check (exit by `fail` naming who changed the item), write and commit, push without force; a refused push takes back the command's files and commit and fails with a message saying the remote changed and to repeat the command.

## Unit tests (TDD)

- `loser by last read` (U-RACE-1).
- `loser by refused push` (U-RACE-2).
- `no lock file is created`: no file named like `*-run.lock` exists after a command.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills of "Skills", session 1, by their installed names, and do the reads of "Required reads".
2. After `git fetch`, create the task's own worktree and branch from the head of `simplify/pr3-review`: `git worktree add .worktrees/TASK-12 -b task/TASK-12 origin/simplify/pr3-review`, and work only inside `.worktrees/TASK-12` (other sessions share the main working copy; never switch its branch). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/storage.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-12: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-12: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-12: Concurrency: the first push wins, the loser fails` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-12 | status: DONE or BLOCKED | branch: task/TASK-12 | commit: <sha>
Files changed: <list>
Scenarios written and passing: <ids, or none>
Unit tests written and passing: <names>
npm test: <pass count> pass, <fail count> fail | check: pass | guard: pass
Self review findings fixed: <one line each, or none>
Open: <anything left, with the reason>
```

## Session 2: review (at most 15 minutes, a new session)

A new session reads only this file and the hand-off in the task's backlog item.

1. Load the skills of "Skills", session 2, and do the reads of "Required reads" (the hand-off of session 1 included).
2. Work in `.worktrees/TASK-12` (the implementer's worktree of branch `task/TASK-12`); run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-12 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
