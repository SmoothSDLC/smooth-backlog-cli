# INT-06: Integration: team commands on the rules engine

| | |
|---|---|
| Kind | integration |
| Depends on | TASK-33, TASK-34, TASK-35, TASK-36 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-45, TASK-47, PERM-13, PERM-14, PERM-15, PERM-16, PERM-17, PERM-18, PERM-19, PERM-20, PERM-21, PERM-22 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 194 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- TASK-33 (backlog item 190): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-34 (backlog item 191): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-35 (backlog item 192): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-36 (backlog item 193): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

### 5.2 Team commands (the team's rules apply; JSON unless `--human`)

Every team command takes `--team <name>`, `--agent <name>`, `--session <id>`, `--repository <owner/name>`, `--branch <name>` and *`--human`; the table lists the others.

| Command | Flags of the command | Subcommand or property | Flags of the subcommand or property |
|---|---|---|---|
| `backlog team new` | *`--title <text>`, *`--description <text>`, *`--<field> <value>` (each field of the team item definition), `--ask`, *`--whatif` | *`--file <item.json>` | *`--whatif` |
| *`backlog team list` | `--show-all`, *`--filter <name>` | `branch <name>` | `--show-all`, *`--filter <name>` |
| *`backlog team show <item>` | `--show-all` | | |
| *`backlog team update <item>` | *`--whatif` | `title <text>`, `description <text>`, `status <word>`, `priority p<N>`, `<field> <value>` (each field of the team item definition); every rule of the team is evaluated on the change | *`--whatif` |
| *`backlog team archive <item>` | *`--whatif` | `done` | *`--whatif` |
| *`backlog team import <branch>` | `--higher`, *`--repository <owner/name>`, *`--whatif` | | |
| *`backlog team branch` | | `import <branch>` | `--higher`, *`--whatif` |
| `backlog team pop` | *`--whatif` | | |
| `backlog team query` | | `plan` (what the queue offers each person), `rules` (the rule set) | `--show-all` on `rules` |
| `backlog team validate` | `--show-all` | | |

## Scenarios (BDD)

- *T-OUT-1. Every team command prints JSON; with `--human` it prints text for people; `--json` is not a flag of team commands.
- *T-UPD-1. `backlog team update 20 estimate 30 --team web --agent member-1`, `estimate` a field of the team definition and no rule failing: the field is set and the history names the agent.
- *T-POP-1. `backlog team pop --team web --agent member-1`: for the first queue entry of the member's roles that has a matching item, the first such item in priority order is offered; with `take`, the item is changed with those values and every rule applies; a refused item is skipped for the next.
- *T-RULE-5. Rules relate only through fields: no rule sets a value; the history entry of a change lists only the properties the caller changed.

## Files

- features/team.feature

## Interfaces

- No new interface.

## Checks

- every team scenario passes in both locations.
- `npm test` passes.

## Session 1: integrate (at most 30 minutes)

This task joins tasks that were built and reviewed on their own. Work only from this file.

1. Load the skills of "Skills", session 1, and do the reads of "Required reads".
2. `git fetch`, then `git worktree add .worktrees/INT-06 -b task/INT-06 origin/simplify/pr3-review` (the tasks of "Depends on" are merged there); work only inside `.worktrees/INT-06`.
3. Run every scenario and test of "Checks". For each failure, find where two tasks disagree (a name, a shape, an order) with `systematic-debugging`, and fix it at that seam only; never rewrite a task.
4. Write any scenario of "Scenarios" that no task wrote yet.
5. Run `npm test`, `npm run check` and the guard; then `requesting-code-review` and `ponytail` over the seams changed; commit `INT-06: Integration: team commands on the rules engine`.
6. Write the hand-off (the same form as a build task, with "Seams fixed" in place of "Unit tests").

## Session 2: review the integration (at most 15 minutes, a new session)

1. Load the skills of "Skills", session 2, and do the reads of "Required reads" (the hand-off of session 1 included).
2. In `.worktrees/INT-06`, run every check of "Checks"; review only the seam changes; write `REVIEW INT-06 | verdict: PASS or FAIL` with findings into the backlog item.
