# Definition-driven CLI

Status: the one active description of what this branch builds (2026-11-14). It records the owner's decisions and the pattern that follows from them. Everything written before it about commands, flags, fields and plans was moved to `.backlog/archived/` and is not a specification of anything.

What the CLI does is in [behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md). This file is the plan: the remaining work, task by task. The commands and their use cases are in [use-cases.md](2026-11-14-definition-driven-cli/use-cases.md).

## Remaining work on this branch

This is the whole of the work left. Each task names the use cases of [use-cases.md](2026-11-14-definition-driven-cli/use-cases.md) it makes pass and the section of [behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md) it builds. A task is done when its use cases run as scenarios in both storage places, the full suite passes, and the files the [file audit](2026-11-14-definition-driven-cli/file-audit.tsv) gives to it are rewritten or moved to the archive. Nothing is built before the owner approves the specification and releases the work. Tasks run one at a time, in this order.

| # | Task | Use cases | Spec | Main files |
|---|---|---|---|---|
| 0 | Complete the specification: describe every row of its section 8, apply the owner's answers to its section 7 and to the team rules specification | none | 7, 8 | `behaviour-spec.md`, `team-rules-spec.md`, `use-cases.md` |
| 1 | The flat base item: no `fields` object; `cli_version` and `history` required; the history key `command`; `name` and `body` become `title` and `description` in items, index and code | G-ITEM-1, U-LIST-4 | 3.1, 3.5, 4.4 | `src/shared/item-json.js`, `src/shared/index.js`, `src/team/migrate-convert.js` |
| 2 | The definition that applies: the team's, else `item_definition`, else the packaged one; the fixed field list in the code goes | U-NEW-2, U-NEW-3 | 3.2, 3.7, 4.3 | `src/shared/item-definition.js` |
| 3 | `backlog new`: `--title` and `--description`, or `--file`; `--ask`; `--whatif`; fields at their defaults; at the bottom of the priority; other flags refused | U-NEW-1 to U-NEW-10 | 4.2, 5.1 | `src/shared/new.js` |
| 4 | `backlog update <item> <property> <value>`; priorities written `pN`; an item named by number, slug or `pN`; `--show-all` on a team's item; `--whatif`; the old flags go; the repair of an unreadable item follows section 8 | U-UPD-1 to U-UPD-12, U-LIST-2, U-SHOW-1 | 4.2, 4.3, 5.1 | `src/shared/update.js`, `src/shared/plain-step.js`, `src/shared/read.js` |
| 5 | `backlog archive`, `archive done`, `import`, `branch`, `branch import` | U-ARCH-1 to U-ARCH-4, U-IMP-1, U-BR-1, U-BR-2 | 5.1 | `src/shared/archive.js`, `src/shared/move.js` |
| 6 | The configuration: the five variable keys, `archive_folder`, `item_definition`, `redact_pii` and `redaction_patterns`; the file checked against its schema; inputs read through the named variables; the backlog location must be a git repository; redaction | U-NEW-9, U-SYNC-4, U-RED-1, T-IN-1 to T-IN-5 | 3.4, 4.1, 4.7, 4.9 | `src/shared/store.js`, `src/team/inputs.js`, `src/shared/safety.js` |
| 7 | `backlog setup`: configuration, skill in every agent folder, example team file and defaults, version check; `backlog upgrade` converts the items | U-SETUP-1 to U-SETUP-7, U-UPG-1, U-UPG-2 | 4.11, 4.12 | `src/shared/setup.js`, `src/integrations.js`, `src/upgrade.js` |
| 8 | `backlog validate` and `backlog team validate`: schemas against JSON Schema, the whole team file, the user definition, every item against its definition and its team's rules | U-VAL-1 to U-VAL-5, T-VAL-1, T-VAL-2 | 4.5 | `src/team/validate-command.js`, `src/team/rules/validate*.js` |
| 9a | The rules engine of [team-rules-spec.md](2026-11-14-definition-driven-cli/team-rules-spec.md) on Ajv and json-logic-js (decision 62): the change (`prev`, `next`, context), every rule evaluated, all errors returned, the extra operators, queue and filters, validation of the rules; the choice of a linear-time regular-expression library; the evaluator, pattern matcher and schema checks built on this branch go | T-RULE-1 to T-RULE-11 | team rules spec | `src/team/rules/` |
| 9b | The team forms of the user commands on that engine; JSON by default and `--human`; `--whatif` on every team command; `backlog team update <item> <property> <value>`; `backlog team list --filter`; `query plan` and `query rules` | T-OUT-1, T-NEW-1, T-NEW-2, T-LIST-1, T-SHOW-1, T-UPD-1 to T-UPD-5, T-ARCH-1, T-IMP-1, T-POP-1 to T-POP-3, T-QRY-1, T-MIG-1, T-MIG-2 | 4.6, 4.8, 5.2 | `src/team/` |
| 10 | `backlog` alone prints the help; `--whatif` replaces `--dry-run`; the removed commands and flags go | U-HELP-1, U-HELP-2 | 5.3 | `src/main.js`, `src/help.js`, `src/team/cli.js` |
| 11 | The coded workflow leaves the code: `src/team/lifecycle.js`, `queue.js`, `team.js`, `workflow.js`, `wip.js`, `views.js`, `handoff.js`, `handoff-commands.js`, `src/shared/dependencies.js`, `wip-limits.js`, the status words of `status.js`, `SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS`, `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD`, `templates/workflows/team.json` (to the archive); a guard test | G-CODE-1, G-CODE-2 | 1 | the files named |
| 12 | `teams.example.json` with the three teams (written in the new rule form; the five old templates of `templates/teams/` are moved to the archive), the packaged defaults, the examples guide (each team's way of working in words, then its rules), every template valid; the owner's team file with the actual Cody rules and item definition written to the topology repository | T-VAL-2, G-TOPO-1 | 3.6, 3.7, 6 | `templates/`, a `docs/` folder; the topology repository |
| 13 | `README.md`, `COMMANDS.md`, `CHANGELOG.md`, `AGENTS.md` and the skill rewritten from the new help; a test compares them with the help | G-DOC-1 | 5 | the files named |
| 14 | The scenarios: every use case a scenario in `features/`; each earlier feature file and test rewritten or moved to the archive as the file audit says | all | all | `features/`, `.agents/test/` |
| 15 | Proof and review: full suite with no failure and no skip, `npm run check`, the private guard, both storage places; branch-wide code review and ponytail review; the gaps fixed | U-SYNC-1 to U-SYNC-3, U-LIST-1, U-LIST-3, U-LIST-5, U-LIST-6, U-SHOW-2, U-SHOW-3 | all | the whole branch |

Use cases without `*` describe behaviour the branch has today and every task keeps them.

Waiting for the owner (section 7 of the specification), now that the step question is decided (decisions 53 to 56): the approval of the team rules specification; the turn-taking of two processes in one local copy; what happens to a value whose field the definition that applies does not declare; whether `backlog archive` takes `--show-all`; the variable `SMOOTH_BACKLOG_CLI_RUN_HOOK`; whether `backlog team migrate` goes into `backlog upgrade`; and the other lead choices of section 7.

## Decisions

The decisions in force are in [decisions.md](2026-11-14-definition-driven-cli/decisions.md), and only there. What they replaced is in [superseded-decisions.md](2026-11-14-definition-driven-cli/superseded-decisions.md).

## What on this branch still describes or implements the earlier behaviour

Every tracked file outside `.backlog/archived/` has one row and one state in [file-audit.tsv](2026-11-14-definition-driven-cli/file-audit.tsv): CODE 79, KEEP 16, MOVE-WITH-CODE 1, NEW-BEHAVIOUR 19, REPLACE 5, REWRITE 10, TEST-OF-EARLIER 146, 276 in all. No file of this repository, on any branch, is an HTML page.

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
