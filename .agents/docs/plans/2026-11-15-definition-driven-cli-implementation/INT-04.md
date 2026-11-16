# INT-04: Integration: every user command

| | |
|---|---|
| Kind | integration |
| Depends on | INT-03, TASK-22, TASK-23, TASK-24 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-32, TASK-45, PERM-01, PERM-02, PERM-03, PERM-04, PERM-05, PERM-06, PERM-07, PERM-08, PERM-09, PERM-10, PERM-11, PERM-12 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 181 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- INT-03 (backlog item 177): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-22 (backlog item 178): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-23 (backlog item 179): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-24 (backlog item 180): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

### 5.1 User commands (no rules)

| Command | Flags of the command | Subcommand or property | Flags of the subcommand or property |
|---|---|---|---|
| `backlog` | | *(none): prints the help | |
| `backlog setup` | `--ask`, *`--whatif` | | |
| `backlog new` | *`--title <text>`, *`--description <text>`, `--ask`, *`--whatif`, `--json` | *`--file <item.json>` (an item that fits 3.1) | *`--whatif`, `--json` |
| *`backlog update <item>` | *`--whatif`, `--json`, `--show-all` | `title <text>`, `description <text>`, `status <word>`, `priority p<N>`, `<field> <value>` (each field of the definition that applies), `restore` (the previous version of an unreadable item), `seq <n>` (only for an item whose number cannot be read) | the flags of the command |
| `backlog list` | `--json`, `--show-all` | `branch <name>` | `--json`, `--show-all` |
| `backlog show <item>` | `--json`, `--show-all` | | |
| `backlog archive <item>` | *`--whatif`, `--json`, *`--show-all` | | |
| `backlog archive done` | *`--whatif`, `--json` | | |
| `backlog import <branch>` | `--higher`, *`--repository <owner/name>`, *`--whatif`, `--json` | | |
| *`backlog branch` | `--json` | `import <branch>` | `--higher`, *`--whatif`, `--json` |
| *`backlog validate` | `--json` | | |
| `backlog upgrade` | *`--whatif` | `check`, `auto`, `off`, `disable`, `<version>` | |

## Scenarios (BDD)

None of its own.

## Files

- features/

## Interfaces

- No new interface.

## Checks

- every user-command scenario of section 9 that TASK-16 to TASK-24 deliver passes in both locations.
- `npm test` passes.

## Session 1: integrate (at most 30 minutes)

This task joins tasks that were built and reviewed on their own. Work only from this file.

1. Load the skills of "Skills", session 1, and do the reads of "Required reads".
2. `git fetch`, then `git worktree add .worktrees/INT-04 -b task/INT-04 origin/simplify/pr3-review` (the tasks of "Depends on" are merged there); work only inside `.worktrees/INT-04`.
3. Run every scenario and test of "Checks". For each failure, find where two tasks disagree (a name, a shape, an order) with `systematic-debugging`, and fix it at that seam only; never rewrite a task.
4. Write any scenario of "Scenarios" that no task wrote yet.
5. Run `npm test`, `npm run check` and the guard; then `requesting-code-review` and `ponytail` over the seams changed; commit `INT-04: Integration: every user command`.
6. Write the hand-off (the same form as a build task, with "Seams fixed" in place of "Unit tests").

## Session 2: review the integration (at most 15 minutes, a new session)

1. Load the skills of "Skills", session 2, and do the reads of "Required reads" (the hand-off of session 1 included).
2. In `.worktrees/INT-04`, run every check of "Checks"; review only the seam changes; write `REVIEW INT-04 | verdict: PASS or FAIL` with findings into the backlog item.
