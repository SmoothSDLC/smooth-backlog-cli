# TASK-11: Commit only the CLI's files, push only its commits

| | |
|---|---|
| Kind | build |
| Depends on | TASK-07, TASK-10 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-12, INT-02 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

### 4.1 The backlog location

The backlog location is always a git repository: the current repository (`.backlog`), or a repository outside the current repository's folder named by the configuration. A command that would change the backlog where the location is not a git repository fails with a message saying the backlog is not set up and naming `backlog setup`. A command pulls the backlog before it acts, reading commands included. A command that changes the backlog commits only the files the CLI changed (items, the index, the number record), never other changed files of the repository, and pushes only the commits the CLI made, unless `push-backlog-updates` is false. A command either completes or reverts its change: when anything fails before its push succeeds, the command takes back its own files and its own commit, a person's own commits and edits stay, and it fails with a message (4.8). No output names a file or folder of the backlog.

- **C-30.** The backlog location is always a git repository; every change is committed, and pushed unless `push-backlog-updates` is false.

- **C-31.** A command commits only the files the CLI changed and pushes only the commits the CLI made; a person's own commits and edits are never published, amended or dropped by the CLI.

## Scenarios (BDD)

- U-SYNC-1. The backlog is pulled before a command acts; a change is committed and pushed before it exits.
- U-SYNC-2. A refused push takes back only the command's own files and commit; a person's commits stay; the command fails with a message saying the remote changed and to repeat the command.
- *U-SYNC-5. Given another file of the repository is changed and not committed. When `backlog new ...` is run with the backlog inside the repository. Then the CLI's commit holds only `.backlog` files, and the other file stays changed and uncommitted.
- *U-SYNC-6. Given a person's own commit not yet pushed. When `backlog new ...` is run. Then only the CLI's commit is pushed; the person's commit stays local.
- *U-SYNC-7. Given `push-backlog-updates` false. Then the CLI commits and does not push.

## Files

- src/shared/sync.js
- src/shared/team-publish.js
- .agents/test/publish.test.js

## Interfaces

- `publish({root, paths, message}, config) -> {commit, pushed}`: stages exactly `paths`, commits, and pushes only that commit (`git push origin <commit>:refs/heads/<branch>`) unless `push-backlog-updates` is false. User commands and team commands both use it.

## Unit tests (TDD)

- `other files stay`: an uncommitted change to `README.md` stays uncommitted after `backlog new ...`.
- `person's commit stays local`: a person's unpushed commit is not on the remote after `backlog new ...`.
- `push off`: with `push-backlog-updates: false` the commit exists locally and the remote is unchanged.

## Notes

Push with a plain `git push` of the CLI's commit, never forced; on any failure before the push succeeds, take back the files and the commit and fail with a message (C-46, C-47).

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-11 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/storage.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-11: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-11: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-11: Commit only the CLI's files, push only its commits` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-11 | status: DONE or BLOCKED | branch: task/TASK-11 | commit: <sha>
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
2. `git switch task/TASK-11`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-11 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
