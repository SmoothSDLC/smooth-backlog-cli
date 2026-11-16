# INT-02: Integration: configuration, inputs, location and publication

| | |
|---|---|
| Kind | integration |
| Depends on | TASK-07, TASK-09, TASK-10, TASK-11, TASK-12 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-16, TASK-40 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 167 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- TASK-07 (backlog item 162): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-09 (backlog item 163): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-10 (backlog item 164): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-11 (backlog item 165): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-12 (backlog item 166): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

### 4.1 The backlog location

The backlog location is always a git repository: the current repository (`.backlog`), or a repository outside the current repository's folder named by the configuration. A command that would change the backlog where the location is not a git repository fails with a message saying the backlog is not set up and naming `backlog setup`. A command pulls the backlog before it acts, reading commands included. A command that changes the backlog commits only the files the CLI changed (items, the index, the number record), never other changed files of the repository, and pushes only the commits the CLI made, unless `push-backlog-updates` is false. A command either completes or reverts its change: when anything fails before its push succeeds, the command takes back its own files and its own commit, a person's own commits and edits stay, and it fails with a message (4.8). No output names a file or folder of the backlog.

### 4.7 Inputs and environment variables

The repository and branch are detected from git when a command starts; when git names no branch, the flag or the variable gives it. The team, agent and session are given by the caller. Each of the five is read from the flag, then the environment variable whose name the configuration gives, then the configuration's own value where it has one; a flag always wins. Every variable name starts with `SMOOTH_BACKLOG_CLI_`. A team command never reads the user's identity; user commands use the configured `user`. When the team variable is set, every user command fails with "teams are not allowed to use user commands". A team command with no team by any of the three ways fails with a message naming all three.

## Scenarios (BDD)

- U-SYNC-1. The backlog is pulled before a command acts; a change is committed and pushed before it exits.
- U-SYNC-2. A refused push takes back only the command's own files and commit; a person's commits stay; the command fails with a message saying the remote changed and to repeat the command.
- *U-SYNC-4. Given the backlog location is not a git repository. When a command that changes the backlog is run. Then it fails with a message naming `backlog setup`; nothing is written.
- *U-SYNC-5. Given another file of the repository is changed and not committed. When `backlog new ...` is run with the backlog inside the repository. Then the CLI's commit holds only `.backlog` files, and the other file stays changed and uncommitted.
- *U-SYNC-6. Given a person's own commit not yet pushed. When `backlog new ...` is run. Then only the CLI's commit is pushed; the person's commit stays local.
- *U-SYNC-7. Given `push-backlog-updates` false. Then the CLI commits and does not push.
- T-IN-1. The team is the `--team` flag, else the variable, else the `team` key; a flag wins.
- *T-IN-2. Given `team_variable` is `SMOOTH_BACKLOG_CLI_WEB_TEAM`. Then that variable is read and `SMOOTH_BACKLOG_CLI_TEAM_NAME` is not; the same for the other four keys.
- *T-IN-3. Given two repositories whose configurations name different variables, both set in one environment. Then a command in each acts for its own team.
- T-IN-4. With no team by any way: it fails with a message naming the flag, the variable and the configuration key.

## Files

- features/storage.feature
- features/configuration.feature

## Interfaces

- No new interface.

## Checks

- every listed scenario passes in both locations (`node --test .agents/test/features.test.js`).
- `npm test` passes.

## Session 1: integrate (at most 30 minutes)

This task joins tasks that were built and reviewed on their own. Work only from this file.

1. Load the skills of "Skills", session 1, and do the reads of "Required reads".
2. `git fetch`, then `git worktree add .worktrees/INT-02 -b task/INT-02 origin/simplify/pr3-review` (the tasks of "Depends on" are merged there); work only inside `.worktrees/INT-02`.
3. Run every scenario and test of "Checks". For each failure, find where two tasks disagree (a name, a shape, an order) with `systematic-debugging`, and fix it at that seam only; never rewrite a task.
4. Write any scenario of "Scenarios" that no task wrote yet.
5. Run `npm test`, `npm run check` and the guard; then `requesting-code-review` and `ponytail` over the seams changed; commit `INT-02: Integration: configuration, inputs, location and publication`.
6. Write the hand-off (the same form as a build task, with "Seams fixed" in place of "Unit tests").

## Session 2: review the integration (at most 15 minutes, a new session)

1. Load the skills of "Skills", session 2, and do the reads of "Required reads" (the hand-off of session 1 included).
2. In `.worktrees/INT-02`, run every check of "Checks"; review only the seam changes; write `REVIEW INT-02 | verdict: PASS or FAIL` with findings into the backlog item.
