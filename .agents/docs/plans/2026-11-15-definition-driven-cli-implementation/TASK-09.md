# TASK-09: Inputs from flags, named variables and the configuration

| | |
|---|---|
| Kind | build |
| Depends on | TASK-07 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | INT-02 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 163 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- TASK-07 (backlog item 162): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

### 4.7 Inputs and environment variables

The repository and branch are detected from git when a command starts; when git names no branch, the flag or the variable gives it. The team, agent and session are given by the caller. Each of the five is read from the flag, then the environment variable whose name the configuration gives, then the configuration's own value where it has one; a flag always wins. Every variable name starts with `SMOOTH_BACKLOG_CLI_`. A team command never reads the user's identity; user commands use the configured `user`. When the team variable is set, every user command fails with "teams are not allowed to use user commands". A team command with no team by any of the three ways fails with a message naming all three.

- **C-36.** Several agents use the CLI at once on different repositories and branches, so `.backlog/config.json`, committed in each branch, names the environment variables a command there reads for the repository, branch, team, agent and session.

- **C-37.** Inputs are read from the flag, then the named variable, then the configuration; a flag always wins.

- **C-27.** When the team variable is set, every user command fails: teams do not use user commands.

- **C-38.** Every environment variable the CLI owns starts with `SMOOTH_BACKLOG_CLI_`.

## Scenarios (BDD)

- T-IN-1. The team is the `--team` flag, else the variable, else the `team` key; a flag wins.
- *T-IN-2. Given `team_variable` is `SMOOTH_BACKLOG_CLI_WEB_TEAM`. Then that variable is read and `SMOOTH_BACKLOG_CLI_TEAM_NAME` is not; the same for the other four keys.
- *T-IN-3. Given two repositories whose configurations name different variables, both set in one environment. Then a command in each acts for its own team.
- T-IN-4. With no team by any way: it fails with a message naming the flag, the variable and the configuration key.
- *U-NEW-9. Given the variable the configuration names for the team is set. When any user command is run. Then it fails with "teams are not allowed to use user commands", nothing changes.

## Files

- src/team/inputs.js
- .agents/test/inputs.test.js

## Interfaces

- `inputs(flags, env, config) -> {repository, branch, team, agent, session}`: each from the flag, else the environment variable whose name the configuration key `<input>_variable` gives, else the configuration value (`team` only); repository and branch fall back to git detection by the caller.
- `refuseTeamVariable(env, config)`: fails with the message "teams are not allowed to use user commands" when the variable named by `team_variable` is set and not empty.

## Unit tests (TDD)

- `named variable`: with `team_variable: "SMOOTH_BACKLOG_CLI_WEB_TEAM"` and both that variable (`web`) and `SMOOTH_BACKLOG_CLI_TEAM_NAME` (`ops`) set, the team is `web`.
- `flag wins`: `--team api` gives `api` whatever the variables.
- `no team`: no flag, no variable, no key: fails with a message naming the flag, the variable and the key.
- `two repositories`: two configurations naming different variables give each its own team.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills of "Skills", session 1, by their installed names, and do the reads of "Required reads".
2. After `git fetch`, create the task's own worktree and branch from the head of `simplify/pr3-review`: `git worktree add .worktrees/TASK-09 -b task/TASK-09 origin/simplify/pr3-review`, and work only inside `.worktrees/TASK-09` (other sessions share the main working copy; never switch its branch). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/configuration.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-09: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-09: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-09: Inputs from flags, named variables and the configuration` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-09 | status: DONE or BLOCKED | branch: task/TASK-09 | commit: <sha>
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
2. Work in `.worktrees/TASK-09` (the implementer's worktree of branch `task/TASK-09`); run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-09 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
