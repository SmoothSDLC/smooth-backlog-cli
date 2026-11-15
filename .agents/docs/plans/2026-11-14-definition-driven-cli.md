# Definition-driven CLI

Status: the one active description of what this branch builds (2026-11-14). It records the owner's decisions and the pattern that follows from them. Everything written before it about commands, flags, fields and plans was moved to `.backlog/archived/` and is not a specification of anything.

What the CLI does is in [behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md). This file is the plan: the remaining work, task by task. The commands and their use cases are in [use-cases.md](2026-11-14-definition-driven-cli/use-cases.md).

## Remaining work on this branch

This is the whole of the work left. Each task names the use cases of [use-cases.md](2026-11-14-definition-driven-cli/use-cases.md) it makes pass; a task is done when those use cases run as scenarios in both storage places, the full suite passes, and the files the [file audit](2026-11-14-definition-driven-cli/file-audit.tsv) gives to it are rewritten or moved to the archive. Nothing starts before the owner approves the specification and releases the work. Tasks run one at a time, in this order.

| # | Task | Use cases | Main files |
|---|---|---|---|
| 1 | The base item follows `item.schema.json`: the keys `name` and `body` become `title` and `description` in the item files, the index and the code; `backlog team migrate` writes the new keys | U-LIST-3, T-MIG-3 | `src/shared/item-json.js`, `src/shared/index.js`, `src/team/migrate-convert.js` |
| 2 | Which definition applies: the team's, else `item_definition` of the configuration, else the packaged `default-item-definition.json` (shipped under `templates/`); the fixed list of fields in the code goes | U-NEW-2, U-NEW-3 | `src/shared/item-definition.js`, `src/shared/setup.js` |
| 3 | `backlog new` takes `--title` and `--description`, or `--file <item.json>`, and `--ask` and `--whatif`; every field at its default; every other flag refused | U-NEW-1 to U-NEW-10, U-NEW-12 | `src/shared/new.js` |
| 4 | `backlog update <item> <property> <value>`: property words read from the definition, value checked against its type, `priority` moves the item in the index, `--show-all` changes a team's item without rules, `--whatif`; the field flags, line editing, `--append`, `--claim`, `--restore` as a flag of its own and `--replan` go (the repair of an unreadable item becomes `backlog update <item> <property> <value>`) | U-UPD-1 to U-UPD-11 | `src/shared/update.js`, `src/shared/plain-step.js` |
| 5 | `backlog archive <item>` moves the file into `archive_folder`, keeps its status, takes it out of the index, refuses a team's item, `--whatif` | U-ARCH-1 to U-ARCH-3 | `src/shared/archive.js` |
| 6 | The five variable keys of `.backlog/config.json`: `backlog setup` writes them; team commands and the user-command refusal read the variables they name; the configuration file is checked against `config.schema.json` | U-SETUP-1 to U-SETUP-4, T-IN-1 to T-IN-5, U-NEW-11 | `src/shared/setup.js`, `src/team/inputs.js`, `src/shared/store.js` |
| 7 | `--whatif` replaces `--dry-run` on every command; `backlog` alone prints the help; `backlog history` and `backlog team define` and `workflow` go | U-HELP-1, T-UPD-5, T-POP-3, T-MIG-2 | `src/main.js`, `src/help.js`, `src/team/cli.js`, `src/team/help.js` |
| 8 | The coded workflow leaves the code: `src/team/lifecycle.js`, `queue.js`, `team.js`, `workflow.js`, `wip.js`, `views.js`, `handoff.js`, `handoff-commands.js`, `src/shared/dependencies.js`, `wip-limits.js`, the status words of `status.js`, the variables `SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS` and `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD`, and `templates/workflows/team.json` (moved to the archive); a guard test fails on any workflow word in the code | G-CODE-1, G-CODE-2 | the files named |
| 9 | The packaged default team entry `default-team.json`, every template in `templates/teams/` valid against `team-file.schema.json` and `backlog team validate`, and the examples guide (a way of working described in words, then the definition and rules that express it); the help points to them | T-VAL-1 to T-VAL-3, T-NEW-1, T-NEW-2, T-UPD-1 to T-UPD-4, T-POP-1, T-POP-2, T-QRY-1, T-QRY-2 | `templates/`, a new `docs/` folder |
| 10 | `README.md`, `COMMANDS.md`, `CHANGELOG.md`, `AGENTS.md` and the skill rewritten from the new help; a test compares them with the help | G-DOC-1 | the files named |
| 11 | The scenarios: every use case is a scenario in `features/`; each earlier feature file and test is rewritten for its command or moved to the archive, as the file audit says | all | `features/`, `.agents/test/` |
| 12 | Proof and review: full suite with no failure and no skip, `npm run check`, the private guard, scenarios in both storage places; a branch-wide code review and a ponytail review; the gaps found are fixed | U-SYNC-1 to U-SYNC-3, U-LIST-1 to U-LIST-5, U-SHOW-1 to U-SHOW-3, U-UPG-1 | the whole branch |

Use cases that describe behaviour the branch has today (those without `*` in the use-case list) are kept by every task: a task that breaks one is not done.

Waiting for the owner, and changing tasks 4, 8 and 11 when decided: the eight open commands (`backlog fields`, `changes`, `next`, `done`, `clean`, `import`, `archive done`, `init clean`), which stay in the code as they are; the turn-taking of two processes in one local copy, which stays as it is; what happens to a value whose field the applicable definition does not declare; whether `backlog archive` takes `--show-all`; the variable `SMOOTH_BACKLOG_CLI_RUN_HOOK`. Some open commands use status words (`backlog done` stores closed), so the guard of task 8 exempts them until the owner decides.

## Decisions

The decisions in force are in [decisions.md](2026-11-14-definition-driven-cli/decisions.md), and only there. What they replaced is in [superseded-decisions.md](2026-11-14-definition-driven-cli/superseded-decisions.md).

## What on this branch still describes or implements the earlier behaviour

Every tracked file outside `.backlog/archived/` has one row and one state in [file-audit.tsv](2026-11-14-definition-driven-cli/file-audit.tsv): AUDIT-BLOCKED 5, CODE 79, KEEP 16, MOVE-WITH-CODE 1, NEW-BEHAVIOUR 15, REWRITE 10, TEST-OF-EARLIER 146, 272 in all. No file of this repository, on any branch, is an HTML page.

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
