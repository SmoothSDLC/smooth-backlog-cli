# INT-05: Integration: rules engine and example teams

| | |
|---|---|
| Kind | integration |
| Depends on | TASK-26, TASK-27, TASK-28, TASK-29, TASK-30, TASK-31 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-32 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 188 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- TASK-26 (backlog item 182): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-27 (backlog item 183): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-28 (backlog item 184): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-29 (backlog item 185): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-30 (backlog item 186): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-31 (backlog item 187): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

## 3. The evaluation of a change

1. **Structure.** `next` must fit the item schema and the team item definition: every required property set, every value of its field's type, a value of a field with `values` one of them. Failures are returned like rule errors.
2. **Rules.** For every rule: if `when` is absent or true, `require` must be true; if it is false, the rule fails. Every rule is evaluated, also after a failure.
3. **Result.** No failure: `next` is written as one change of the item, with one history entry (command, caller, every changed property with before and after). Any failure: nothing is written and the command fails with every failing rule's error (10).

Rules have no order and no hierarchy: each is true or false of the same change, and all must be true, so the order of reading cannot change the result. `--whatif` evaluates and writes nothing.

## Scenarios (BDD)

- *T-RULE-1. Every rule is evaluated on every change: `backlog team update 7 estimate 90` on a ready item fails rule `size` (at most 60) although the status does not change.
- *T-RULE-3. Several failures: a change that fails two requirements returns both messages, in JSON `{"refused": [...]}`, and with `--human` one line each.
- *T-RULE-9. Validation finds: a rule reading an undeclared field; a literal compared with a field that is not one of its `values`; an unknown operator; a rule whose `require` cannot hold under its own `when`; two rules on the same transition requiring one field to equal two different literals; an `error` reading an unknown path; `==` or `!=` (a warning). Each is reported with the team, the rule's id or place, the reason and the fix, and the whole team file is invalid.
- *T-RULE-11. The rules of `teams.example.json` give, through json-logic-js with the extra operators, the results the examples guide states for each team (a test runs them).

## Files

- .agents/test/

## Interfaces

- No new interface.

## Checks

- `npm test` passes; the engine imports nothing from src/team/rules/.

## Session 1: integrate (at most 30 minutes)

This task joins tasks that were built and reviewed on their own. Work only from this file.

1. Load the skills of "Skills", session 1, and do the reads of "Required reads".
2. `git fetch`, then `git worktree add .worktrees/INT-05 -b task/INT-05 origin/simplify/pr3-review` (the tasks of "Depends on" are merged there); work only inside `.worktrees/INT-05`.
3. Run every scenario and test of "Checks". For each failure, find where two tasks disagree (a name, a shape, an order) with `systematic-debugging`, and fix it at that seam only; never rewrite a task.
4. Write any scenario of "Scenarios" that no task wrote yet.
5. Run `npm test`, `npm run check` and the guard; then `requesting-code-review` and `ponytail` over the seams changed; commit `INT-05: Integration: rules engine and example teams`.
6. Write the hand-off (the same form as a build task, with "Seams fixed" in place of "Unit tests").

## Session 2: review the integration (at most 15 minutes, a new session)

1. Load the skills of "Skills", session 2, and do the reads of "Required reads" (the hand-off of session 1 included).
2. In `.worktrees/INT-05`, run every check of "Checks"; review only the seam changes; write `REVIEW INT-05 | verdict: PASS or FAIL` with findings into the backlog item.
