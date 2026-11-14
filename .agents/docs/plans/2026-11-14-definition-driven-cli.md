# Definition-driven CLI

Status: the one active description of what this branch builds (2026-11-14). It records the owner's decisions and the pattern that follows from them. Everything written before it about commands, flags, fields and plans was moved to `.backlog/archived/` and is not a specification of anything.

What the CLI does is in [behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md). This file is the plan: what the branch has, what changes, what is open.

## What on this branch still describes or implements the earlier behaviour

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

## Decisions

The decisions in force are in [decisions.md](2026-11-14-definition-driven-cli/decisions.md), and only there. What they replaced is in [superseded-decisions.md](2026-11-14-definition-driven-cli/superseded-decisions.md).

## What the branch has, and what changes

Already there and kept: the team file with people, item definition and rule set; its loader, validation and rule engine; the team commands; items as JSON files; the index, the counter, the archive move, synchronisation and the stale-write check (see the table above).

To build:

1. The code reads the base item from the schema; the keys `name` and `body` become `title` and `description`; existing item files are converted.
2. The packaged default item definition and default rule set; the key in `.backlog/config.json` for the repository's default item definition; the key for the archive folder.
3. `backlog new` with its two inputs and the JSON file input.
4. `backlog update <item> <property> <value>` with property words read from the definition; the fixed field flags, the line-editing flags, `--append` and `--claim` go.
5. Help that lists the fields of the definition that applies and points to the documents in this repository.
6. The examples and the guide from a described way of working to an item definition and rules.
7. `--whatif` everywhere; `backlog` alone prints the help; `--title` on `backlog team new`; `backlog history` removed.
8. `README.md`, `COMMANDS.md`, the skill and `CHANGELOG.md` rewritten from the new help; the tests of the changed commands rewritten.

Open, for the owner: whether `backlog archive` takes `--show-all` like `backlog update`; `backlog changes`, `backlog next` and `backlog init clean`, which earlier rulings kept and decision 16 puts in question; which fields the packaged default definition declares; what happens to values that existing items hold in fields the applicable definition does not declare; the commands listed above as not decided.

## Behaviour still in the code that decision 32 moves to team rules

A count of words in `src`, not a classified inventory (the classified one of 2026-11-08 is in the archive): review, 364 lines in 18 files; claim, 233 lines in 25 files; stale, 70 lines in 15 files; dependencies, parents, splitting and "critical", 292 lines; limits on work in progress, two files. The modules `src/team/lifecycle.js`, `queue.js`, `team.js`, `workflow.js`, `wip.js`, `views.js`, `handoff.js` and `handoff-commands.js` hold a coded review and claim workflow beside the rule evaluator, and `src/shared/dependencies.js`, `wip-limits.js` and `plain-step.js` apply coded checks in user commands.

Environment variables the code reads that no ruling lists: `SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS` (when a review is stale: a team rule, decision 32); `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD` (exists only so that a coded claim step can run `update` as a child: goes with that step); `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS` (how long a command waits for another process using the same local copy of the backlog; reported to the owner under decision 33); `SMOOTH_BACKLOG_CLI_RUN_HOOK` (reports every run to an outside program; solves no problem of an item; reported to the owner under decision 33).

## Work in flight

Merged and kept: the Task 6 follow-ups and Tasks 9, 11, 12 and 23 of the archived plan of 2026-11-12. Built and not merged: `backlog update` and `backlog done` with `--show-all` (branch kept, on hold; it implements ruling R19 and decision 29). No other task of the archived plan runs; the task list is written anew from this document.
