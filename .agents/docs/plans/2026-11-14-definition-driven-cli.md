# Definition-driven CLI

Status: the one active description of what this branch builds (2026-11-14). It records the owner's decisions and the pattern that follows from them. Everything written before it about commands, flags, fields and plans was moved to `.backlog/archived/` and is not a specification of anything.

What the CLI does is in [behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md). This file is the plan: the remaining work, task by task. The commands and their use cases are in [use-cases.md](2026-11-14-definition-driven-cli/use-cases.md).

## Remaining work on this branch

The remaining work is the sliced implementation plan [2026-11-15-definition-driven-cli-implementation.md](2026-11-15-definition-driven-cli-implementation.md): 24 slices, each one job that can be given to Cody on its own, each naming the specification sections, use cases, files, interfaces and tests it implements and the slices it depends on. Nothing is built while a decision of section 8 of the specification is open for the slice that decision blocks (S05: A; S18: B; S17: C; S15 and S17: D); the owner's go in the chat starts the work (decision 63).

## Decisions

The decisions in force are in [decisions.md](2026-11-14-definition-driven-cli/decisions.md), and only there. What they replaced is in [superseded-decisions.md](2026-11-14-definition-driven-cli/superseded-decisions.md).

## What on this branch still describes or implements the earlier behaviour

Every tracked file outside `.backlog/archived/` has one row and one state in [file-audit.tsv](2026-11-14-definition-driven-cli/file-audit.tsv): CODE 79, KEEP 16, MOVE-WITH-CODE 1, NEW-BEHAVIOUR 24, REPLACE 5, REWRITE 10, TEST-OF-EARLIER 146, 281 in all. No file of this repository, on any branch, is an HTML page.

Counted on 2026-11-14 from the tracked files outside `.backlog/archived/`. Moved to the archive so far: the 147 earlier documents of `.agents/docs`, the two review files and one test. Not yet brought in line:

| What | Files | What happens to it |
|---|---|---|
| `README.md`, `COMMANDS.md`, `CHANGELOG.md` | 3 | rewritten from the specification (the owner: these are updated, not moved); today they describe the earlier commands, flags and variables |
| `AGENTS.md` | 1 | two lines point to the new documents; the rest is not yet checked against the specification |
| `templates/skills/backlog/` | 5 | the skill and its command reference describe the earlier commands; rewritten from the new help |
| `templates/teams/` and `templates/workflows/` | 6 | team templates and a workflow file written for the earlier rule set; each is checked against the specification, then kept, rewritten or moved to the archive |
| `features/` | 18 | the behaviour scenarios of the earlier commands; each is checked against the specification, then kept, rewritten or moved to the archive |
| `src/` | 79 | the code of the earlier behaviour; changed by the build points below |
| `.agents/test/` | 131 | the tests of the earlier behaviour; rewritten with the commands they test |

## Behaviour still in the code that decision 32 moves to team rules

A count of words in `src`, not a classified inventory (the classified one of 2026-11-08 is in the archive): review, 364 lines in 18 files; claim, 233 lines in 25 files; stale, 70 lines in 15 files; dependencies, parents, splitting and "critical", 292 lines; limits on work in progress, two files. The modules `src/team/lifecycle.js`, `queue.js`, `team.js`, `workflow.js`, `wip.js`, `views.js`, `handoff.js` and `handoff-commands.js` hold a coded review and claim workflow beside the rule evaluator, and `src/shared/dependencies.js`, `wip-limits.js` and `plain-step.js` apply coded checks in user commands.

Environment variables the code reads that no ruling lists: `SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS` (when a review is stale: a team rule, decision 32); `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD` (exists only so that a coded claim step can run `update` as a child: goes with that step); `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS` (how long a command waits for another process using the same local copy of the backlog; reported to the owner under decision 33); `SMOOTH_BACKLOG_CLI_RUN_HOOK` (reports every run to an outside program; solves no problem of an item; reported to the owner under decision 33).

## Work in flight

Merged and kept: the Task 6 follow-ups and Tasks 9, 11, 12 and 23 of the archived plan of 2026-11-12. Built and not merged: `backlog update` and `backlog done` with `--show-all` (branch kept, on hold; it implements ruling R19 and decision 29). No other task of the archived plan runs; the task list is written anew from this document.
