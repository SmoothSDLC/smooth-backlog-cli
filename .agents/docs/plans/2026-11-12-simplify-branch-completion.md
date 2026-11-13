# Simplify branch completion: Implementation Plan

**Goal:** finish the whole working branch: the remaining tasks of the team rules engine, the definition of done of the simplification, its phases 8 and 9, the work that waits on them outside this repository, and a documentation set in which no analysis, use case or plan written before a later decision can mislead a reader.

**Architecture:** one task list for the whole branch and one status table with one row per use case of every source the branch was built from. A task is specified by its packet (goal and scope, the decision rules quoted, the acceptance criteria, the files and helpers, the failing tests first, what it must not do). The commit that delivers a use case moves its row of the status table to DONE with the test and the commit; a guard in the test suite keeps the table and its counts reconciled.

**Tech Stack:** Node.js 24 (ES modules, `node:test`, no runtime dependencies), git 2.40 or later, the BDD runner in `features/` (`.agents/test/features.test.js`, locations `local` and `remote`).

**Spec:** the design folder [2026-11-09-team-rules-engine/](2026-11-09-team-rules-engine/) (chapters 01 to 08, [00-owner-rulings.md](2026-11-09-team-rules-engine/00-owner-rulings.md), [design/decisions.md](2026-11-09-team-rules-engine/design/decisions.md), [design/rule-cases.json](2026-11-09-team-rules-engine/design/rule-cases.json), [01-command-behaviour-matrix.md](2026-11-09-team-rules-engine/01-command-behaviour-matrix.md), [implementation/02-bdd-plan.md](2026-11-09-team-rules-engine/implementation/02-bdd-plan.md)), the simplification plan [2026-11-04-simplification-plan.md](2026-11-04-simplification-plan.md) and its log [2026-11-04-pr3-simplification-log.md](2026-11-04-pr3-simplification-log.md).

**Supersedes, as the task list of the branch:** [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md) (its 33 tasks are Tasks 1 to 33 here, with the same numbers; its task texts stay the specification from which a packet is written), [completed/2026-11-04-phase-8-documentation.md](completed/2026-11-04-phase-8-documentation.md) (Task 39) and [completed/2026-11-04-phase-9-final-verification-and-pr.md](completed/2026-11-04-phase-9-final-verification-and-pr.md) (Task 40). The batch plan [2026-11-09-team-rules-engine.md](2026-11-09-team-rules-engine.md), the simplification plan and its log stay active until Task 40 closes them.

## Owner decisions of 2026-11-13 (binding; they come before every task below and are not yet built)

1. `backlog` with no command word prints the help. It no longer runs `backlog next`.
2. The flag `--dry-run` is named `--whatif` on every command that has it.
3. The description of an item is called description. The flag `--body` of `backlog new` goes and `--description` stays; the item file's key `body` becomes `description`.
4. An alias is not kept: where two flags or two names mean the same, one goes.
5. The item schema comes first. It is a valid JSON Schema ([item.schema.json](2026-11-12-simplify-branch-completion/item.schema.json)) holding only the item's own properties, and the commands and flags are cut from it.
6. An item has few required properties. `backlog new` takes exactly the required ones that a person must give; the CLI supplies the rest of the required ones. A property that is optional, or that is set after creation, is not an input of `backlog new`: it is set with `backlog update`.
7. `--show-all` is a flag for reading and displaying items. Its use on writing commands (owner rulings R16 and R19 of 2026-11-09, built for `backlog new` in Task 11 and planned for seven more commands) is under the owner's review; no further task adds it to a writing command until he has ruled.
8. A list of commands and flags shows each flag under the command form it is used with; only a flag usable everywhere stands at the top.

9. The title of an item is called title: the flags `--title` of `backlog new`, `backlog update` and `backlog team new`, and the item file's key `title`; `--name` and the key `name` go.
10. The required properties of an item are the title and the description, given by the person, and the number, the slug, the repository, the branch, the created and updated times, the writer, the status and the first history entry, supplied by the CLI.

The decisions applied to the schema: [item.schema.json](2026-11-12-simplify-branch-completion/item.schema.json). The commands and flags that follow from them: [command-structure.md](2026-11-12-simplify-branch-completion/command-structure.md).

## The item schema under review

[2026-11-12-simplify-branch-completion/item.schema.json](2026-11-12-simplify-branch-completion/item.schema.json) is the JSON Schema of one item file (2026-11-13), and [item.example.json](2026-11-12-simplify-branch-completion/item.example.json) is an item that fits it. The schema is under correction; the commands and flags of `backlog new` and `backlog update` are re-cut from the corrected schema before any further task changes them.

## The use-case status table

[2026-11-12-simplify-branch-completion/use-case-status.tsv](2026-11-12-simplify-branch-completion/use-case-status.tsv) holds one row per use case, extracted by [use-case-status.mjs](2026-11-12-simplify-branch-completion/use-case-status.mjs) (`init` built the first table; `check` is the guard, run by `.agents/test/use-case-status.test.js`; `counts` rewrites [source-counts.tsv](2026-11-12-simplify-branch-completion/source-counts.tsv)).

| Source (name in the table) | What one row is | Rows |
|---|---|---|
| `uc-matrix` | a table row of `.agents/docs/analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md` except its legend: 270 use cases `UC-001` to `UC-270`, 9 work units `A0` to `A8`, 6 state planes `S0` to `S5`, 16 invariants `INV-`, 18 configuration cases `C-`, 6 fault gates `F`, 12 risks `RISK-R`, 15 evidence gaps `GAP-`, and 27 rows without an id of their own (the command census and the coverage map), numbered `M<section>-<n>` | 379 |
| `rule-cases` | a case of `design/rule-cases.json` | 288 |
| `coverage` | a row of `design/coverage.tsv`, named `<its source>:<its id>` | 2114 |
| `bdd-plan` | a table row of `implementation/02-bdd-plan.md`, numbered `BDD-<section>-<n>` | 181 |
| `command-matrix` | a table row of `01-command-behaviour-matrix.md`, numbered `CBM-G<group>-<n>` | 12 |
| `features` | a scenario of `features/*.feature`, run in both storage locations | 106 |
| `inventory.tsv`, `tests.tsv`, `gaps.tsv`, `consumers.tsv` | a row of the reference table; it takes the state of the coverage row with its id | 1033, 819, 47, 22 |

Columns: `source`, `id`, `statement`, `decision` (the ruling or decision that governs the use case now; a use case changed or dropped by a later decision says so and cites it), `status`, `task` (the task of this plan that delivers it, or `merged`), `test` (file and test name that pin it), `evidence` (the commit).

A row of a source that states no behaviour of the CLI is not a use case and is not in the table: it is listed with its reason in [not-use-cases.tsv](2026-11-12-simplify-branch-completion/not-use-cases.tsv) (583 rows at the start, validated row by row in Task 51: the 574 rows the design marked as nothing to build, and the 9 work units of the 2026-10-25 analysis), so that every source row is still accounted for; the guard checks that each source row is either a use case or excluded, never both.

Status, exactly one per row: **DONE** (implemented, pinned by a test that fails without it, merged on the working branch), **PLANNED** (a named task of this plan delivers it), **SUPERSEDED** (a later decision replaced it; the decision is cited), **DEFERRED-WITH-EXPLICIT-BLOCKER** (the blocker named).

How the first table was classified (2026-11-12, on the head that held Tasks 1 to 8 and 10). Only mechanical evidence makes a row DONE: a feature scenario (the runner runs every scenario in both locations); a rule case with a passing test titled with its id; a coverage row whose design target names example rules or cases that are all pinned that way; a row of the test inventory whose test title still stands in its test file. A row the design marked as nothing to build is excluded with the design's reason; a row deferred on an open owner question stays deferred with that question as its blocker; a row deferred to work that this plan now contains is PLANNED under that task. Every other row is PLANNED: under the remaining task its design target names, or under the verification Tasks 36 to 38, which pin each row with a named test or retire it by a cited decision. No row was marked DONE on the strength of its batch having merged.

Counts at the start of this plan (use cases only; the column Rows above counts every source row, excluded ones included):

| source | DONE | PLANNED | SUPERSEDED | DEFERRED-WITH-EXPLICIT-BLOCKER | total |
|---|---|---|---|---|---|
| uc-matrix | 0 | 370 | 0 | 0 | 370 |
| rule-cases | 268 | 20 | 0 | 0 | 288 |
| coverage | 973 | 823 | 0 | 18 | 1814 |
| bdd-plan | 11 | 170 | 0 | 0 | 181 |
| command-matrix | 0 | 12 | 0 | 0 | 12 |
| features | 106 | 0 | 0 | 0 | 106 |
| inventory.tsv | 284 | 542 | 0 | 4 | 830 |
| tests.tsv | 657 | 113 | 0 | 0 | 770 |
| gaps.tsv | 2 | 16 | 0 | 7 | 25 |
| consumers.tsv | 0 | 22 | 0 | 0 | 22 |
| all | 2301 | 2088 | 0 | 29 | 4418 |

Keeping it current: a packet names the use cases it delivers as the rows whose task column is its task; the implementing commit moves those rows to DONE with the test and its own commit and runs `node .agents/docs/plans/2026-11-12-simplify-branch-completion/use-case-status.mjs counts`; the specification review fails when a row is wrong or missing; the counts are checked after every merge. The plan is finished when no row is PLANNED.

## Global Constraints

- Node 24: `engines.node` is `>=24`; every command of this plan runs under Node 24 (`node --version` prints `v24.`).
- Environment variables are prefixed `SMOOTH_BACKLOG_CLI_` (`_TEAM_NAME`, `_AGENT`, `_SESSION`, `_TEAM_REPOSITORY`, `_TEAM_BRANCH`, `_HOME`, `_LOCK_WAIT_MS`, `_PRIVATE_DENYLIST`); no unprefixed name is read, and no file outside `src/team/` names a team variable (`.agents/test/team-boundary.test.js`).
- Public repository: no tracked file and no commit message names a host or machine, a local path, a port or address, a model, a private repository, an internal agent or tool, a private process or a credential. The private-details guard runs before every commit. The pull request text is written outside the repository.
- Every commit leaves the whole suite green: the standard proof below passes at each task's own commit. Importers and guard tests that a task breaks are repaired in that task, never in a later one.
- No test is deleted, skipped or weakened except where its task names it. A test whose expectation changes is named in the commit body with the reason.
- Coverage rule: every test a task removes is classified against `design/coverage.tsv` in that task. The commit body lists one line per removed test: `<file>: <test title> -> <coverage id> <BAKE-IN | LAZY-LOAD | SKIP | DEFERRED-WITH-EXPLICIT-BLOCKER> (<surviving test that covers it, or the reason>)`. A removed test that matches no row is not removed until a row or a surviving test covers it. A removed test whose subject is a user command is rewritten onto the user commands (items written with `writeStored` of `.agents/test/shared-fixtures.js`), not removed.
- Documentation rule of `AGENTS.md`: every change of a command, option, output, refusal, rule or stored field ships in the same commit with `templates/skills/backlog/SKILL.md` (and `references/commands.md`), the help text (`src/help.js`, `src/team/help.js`), `COMMANDS.md` regenerated with `node .agents/scripts/sync-commands-md.mjs`, `README.md` where it describes the behaviour, and `CHANGELOG.md` (section `## Unreleased (2.0.0)`). None of them describes the old behaviour.
- No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id.
- Scratch runs of the CLI outside the test suite set `SMOOTH_BACKLOG_CLI_HOME` to a temporary folder and run in a scratch git repository with no remote of the person's.
- The CLI never writes the team file; a user command never reads it; a number is never handed out twice; a refused team command writes nothing in either repository (the provisional exception of open decision 2 below).
- Every task starts by re-reading every file:line it names with `grep` on the current head; a name that moved is followed, a behaviour that differs from the task's text stops the task.

## Questions re-validated at the end (kept provisional; nothing in this plan decides them, and none is raised before Task 49 unless it blocks a task)

1. The target branch of the pull request. Task 40 writes the text without naming a target; Task 50 opens the pull request after Task 49.
2. `.backlog/.gitignore` created on the way in: `resolveHome` of `src/shared/store.js` creates it for every command before anything else runs, so a refused team command leaves that one untracked file, against "a refused team command takes no action at all" and design chapter 01 section 4 step 6. Provisional state, kept by every task: the file is created as today and the tests assert the exact leftover status line. The options the owner chooses between: keep it and state the exception in the design (the backlog folder's own ignore file is scaffolding, not an action); create it only when a command proceeds (changes `resolveHome` and every user command; two tests change); remove it in the team undo when this run created it (team commands only).

## The standard proof

Run in the repository root after each task (all must pass before the commit):

```bash
npm run check                                                                                  # exit 0
SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<the private deny-list file> node --test .agents/test/no-private-details.test.js   # 3 pass, 0 fail
npm test                                                                                       # 0 fail
FEATURE_LOCATION=local node --test .agents/test/features.test.js                                # 0 fail
FEATURE_LOCATION=remote node --test .agents/test/features.test.js                               # 0 fail
```

The feature suite counts 106 scenarios per location at the start of this plan; a task that adds or removes scenarios states the new count.

## Review Focus

1. Branch names that contain a slash (`feature/a-b`) and team items on several branches of one folder: `pop`, `query plan` and the `query` list read the session's branch only, in index order, and never offer an item of another branch (tests: Task 2 step 1, Task 7 step 1).
2. A team command run from a subdirectory of the working copy (`src/` of the consumer checkout) behaves exactly as from its top: same repository, branch, team file and item (tests: Task 2 step 1, Task 3 step 1).
3. `--help` of every team word run outside any git repository, with no backlog and no configuration, prints the help, exits 0 and creates nothing (no `.backlog/`, no clone) (test: Task 8 step 1).
4. A team item edited by hand (fields named `events` and `phase`, fields in an order unlike the definition, an undeclared field) passes through `backlog team query <item>` and through `--show-all` user writes with every byte outside the changed keys, `updated`, `updated_by` and the new history entry kept (tests: Task 7 step 1, Task 13 step 1).
5. An item named as `7`, `007` or by its slug reaches the same item in `team update`, `query check` and `query <item>`; a number held by a live and an archived item is refused with the `index.find` text naming both (tests: Task 3 step 1, Task 7 step 1).

## Order of execution

Each task goes through its packet, a test-first build with a self-review, a specification review and a quality review that must both pass, the standard proof, a fast-forward merge and a review of the merged range. Tasks that share no file and do not depend on each other may be worked side by side, at most three at a time; merges stay one at a time. Order: the reviews of Tasks 6b and 11; Tasks 9 and 12 to 32; Task 52 (after Task 23, before Task 24); Tasks 36, 37, 38 and 51 (the row-level checks, and the validation of the excluded rows); Tasks 34 and 35 (the documents); Tasks 39 and 40; Task 41 and its gap-fix tasks; Task 42; Tasks 43, 44, 45, 46, 47 and 48; Task 49; Task 50. Tasks that touch the shared documents (help, `README.md`, `CHANGELOG.md`, `COMMANDS.md`) merge one after another.

---

## Tasks

### Task 1: Publication, numbering and parser fixes on the merged code

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 1
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 1` (0 at the start of this plan)

### Task 2: `backlog team pop` on the engine (B14b)

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 2
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 2` (0 at the start of this plan)

### Task 3: `backlog team query check` and `backlog team query plan` (B14c)

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 3
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 3` (0 at the start of this plan)

### Task 4: Removal of the old command-level team tests and the `cli()` routing (B14d)

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 4
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 4` (0 at the start of this plan)

### Task 5: The team BDD features (B14e)

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 5
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 5` (0 at the start of this plan)

### Task 6: Concurrency scenarios through the real commands and the pop skip (B15c)

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 6
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 6` (0 at the start of this plan)

### Task 6b: Follow-ups of Task 6 (the git version check in team publication, the idle clause of pop in help and README, two test margins)

- State: DONE, merged on the working branch (commits e80b014, 2aaa450, 86ed2e5)
- Specification: the review findings of Task 6, stated in the packet
- Packet: [packets/task-6b.md](2026-11-12-simplify-branch-completion/packets/task-6b.md)
- Use cases: the rows of the status table whose task column is `Task 6b` (0 at the start of this plan)

### Task 7: `backlog team query`, `query <item>`, `query filter <name>` (B16a)

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 7
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 7` (0 at the start of this plan)

### Task 8: `query rules`, `query steps`, the final router (B16b)

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 8
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 8` (0 at the start of this plan)

### Task 9: The skill's team section, the documentation guards, the rules feature (B16c)

- State: DONE, merged on the working branch
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 9
- Packet: [packets/task-9.md](2026-11-12-simplify-branch-completion/packets/task-9.md)
- Use cases: the rows of the status table whose task column is `Task 9` (3 at the start of this plan)

### Task 10: User reads do not see team items (B17a)

- State: DONE, merged on the working branch (its use-case rows carry the status DONE or wait for the row-level check of Tasks 36 to 38)
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 10
- Packet: not needed (merged)
- Use cases: the rows of the status table whose task column is `Task 10` (0 at the start of this plan)

### Task 11: `--show-all` on the reading commands and on `new` (B17b)

- State: DONE, merged on the working branch
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 11
- Packet: [packets/task-11.md](2026-11-12-simplify-branch-completion/packets/task-11.md)
- Use cases: the rows of the status table whose task column is `Task 11` (8 at the start of this plan)

### Task 12: Tests that turn from "refuses" to "does not see" (B17c)

- State: DONE, merged on the working branch
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 12
- Packet: [packets/task-12.md](2026-11-12-simplify-branch-completion/packets/task-12.md)
- Use cases: the rows of the status table whose task column is `Task 12` (0 at the start of this plan)

### Task 13: `backlog update` and `backlog done` on a team item with `--show-all` (B18a)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 13
- Packet: [packets/task-13.md](2026-11-12-simplify-branch-completion/packets/task-13.md)
- Use cases: the rows of the status table whose task column is `Task 13` (26 at the start of this plan)

### Task 14: `move`, `archive`, `archive done`, `import`, `clean`, `new --split-from` on team items (B18b)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 14
- Packet: [packets/task-14.md](2026-11-12-simplify-branch-completion/packets/task-14.md)
- Use cases: the rows of the status table whose task column is `Task 14` (0 at the start of this plan)

### Task 15: The `--show-all` feature and documents (B18c)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 15
- Packet: [packets/task-15.md](2026-11-12-simplify-branch-completion/packets/task-15.md)
- Use cases: the rows of the status table whose task column is `Task 15` (0 at the start of this plan)

### Task 16: The open-first order per owner (B19a)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 16
- Packet: [packets/task-16.md](2026-11-12-simplify-branch-completion/packets/task-16.md)
- Use cases: the rows of the status table whose task column is `Task 16` (3 at the start of this plan)

### Task 17: `backlog clean` removes only the entries of the items it deleted (B19b)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 17
- Packet: [packets/task-17.md](2026-11-12-simplify-branch-completion/packets/task-17.md)
- Use cases: the rows of the status table whose task column is `Task 17` (9 at the start of this plan)

### Task 18: The team-session guard (B20a)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 18
- Packet: [packets/task-18.md](2026-11-12-simplify-branch-completion/packets/task-18.md)
- Use cases: the rows of the status table whose task column is `Task 18` (8 at the start of this plan)

### Task 19: The tests that set the team variable (B20b)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 19
- Packet: [packets/task-19.md](2026-11-12-simplify-branch-completion/packets/task-19.md)
- Use cases: the rows of the status table whose task column is `Task 19` (0 at the start of this plan)

### Task 20: `backlog move` between branches only (B21a)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 20
- Packet: [packets/task-20.md](2026-11-12-simplify-branch-completion/packets/task-20.md)
- Use cases: the rows of the status table whose task column is `Task 20` (1 at the start of this plan)

### Task 21: The guards look at the own folder (B21b)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 21
- Packet: [packets/task-21.md](2026-11-12-simplify-branch-completion/packets/task-21.md)
- Use cases: the rows of the status table whose task column is `Task 21` (7 at the start of this plan)

### Task 22: Foreign references are only checked for their form (B21c)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 22
- Packet: [packets/task-22.md](2026-11-12-simplify-branch-completion/packets/task-22.md)
- Use cases: the rows of the status table whose task column is `Task 22` (1 at the start of this plan)

### Task 23: The command `backlog team migrate` (B22c)

- State: DONE, merged on the working branch
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 23
- Packet: [packets/task-23.md](2026-11-12-simplify-branch-completion/packets/task-23.md)
- Use cases: the rows of the status table whose task column is `Task 23` (58 at the start of this plan)

### Task 24: The migration's data cases (B23)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 24
- Packet: [packets/task-24.md](2026-11-12-simplify-branch-completion/packets/task-24.md)
- Use cases: the rows of the status table whose task column is `Task 24` (15 at the start of this plan)

### Task 25: The field report (B24a)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 25
- Packet: [packets/task-25.md](2026-11-12-simplify-branch-completion/packets/task-25.md)
- Use cases: the rows of the status table whose task column is `Task 25` (7 at the start of this plan)

### Task 26: `migrate --ask` (B24b)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 26
- Packet: [packets/task-26.md](2026-11-12-simplify-branch-completion/packets/task-26.md)
- Use cases: the rows of the status table whose task column is `Task 26` (1 at the start of this plan)

### Task 27: Removal of the old team commands (B27a)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 27
- Packet: [packets/task-27.md](2026-11-12-simplify-branch-completion/packets/task-27.md)
- Use cases: the rows of the status table whose task column is `Task 27` (5 at the start of this plan)

### Task 28: Removal of the old definition code (B27b)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 28
- Packet: [packets/task-28.md](2026-11-12-simplify-branch-completion/packets/task-28.md)
- Use cases: the rows of the status table whose task column is `Task 28` (0 at the start of this plan)

### Task 29: The shipped workflow template, the vocabulary and the translation (B27c)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 29
- Packet: [packets/task-29.md](2026-11-12-simplify-branch-completion/packets/task-29.md)
- Use cases: the rows of the status table whose task column is `Task 29` (1 at the start of this plan)

### Task 30: The retired orders and hooks (B28a)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 30
- Packet: [packets/task-30.md](2026-11-12-simplify-branch-completion/packets/task-30.md)
- Use cases: the rows of the status table whose task column is `Task 30` (1 at the start of this plan)

### Task 31: The old root configuration file stops every command (B28b)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 31
- Packet: [packets/task-31.md](2026-11-12-simplify-branch-completion/packets/task-31.md)
- Use cases: the rows of the status table whose task column is `Task 31` (0 at the start of this plan)

### Task 32: The final documentation pass (B29)

- State: PLANNED
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 32
- Packet: [packets/task-32.md](2026-11-12-simplify-branch-completion/packets/task-32.md)
- Use cases: the rows of the status table whose task column is `Task 32` (7 at the start of this plan)

### Task 33: Final verification

- State: absorbed by Task 40 (the final verification of the whole branch); nothing runs under this number
- Specification: [completed/2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md), Task 33
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 33` (0 at the start of this plan)

### Task 34: The document inventory: one row and one terminal state per tracked document

- State: PLANNED
- Specification: every tracked document under `.agents/docs`, `features/`, `templates/skills` and the root documents (`AGENTS.md`, `README.md`, `COMMANDS.md`, `CHANGELOG.md`, `REVIEW.md`, `REVIEW-LOG.md`) is listed by a committed script into `2026-11-12-simplify-branch-completion/document-inventory.tsv`; each row is read against the owner rulings, the design decisions and this plan and ends in exactly one state: UPDATE (the outdated statements listed), MOVE (to `completed/`), REMOVE (the last commit that held it recorded) or KEEP (with the evidence); the counts reconcile under the same guard
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 34` (0 at the start of this plan)

### Task 35: The document changes of the inventory

- State: PLANNED
- Specification: every UPDATE, MOVE and REMOVE row of Task 34 is carried out, in packets of one document group each; a document whose use cases are SUPERSEDED in the status table is updated or removed so that it cannot mislead a reader; `.agents/docs` keeps only the plans (owner instruction recorded in the simplification log)
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 35` (0 at the start of this plan)

### Task 36: The use cases of the 2026-10-25 analysis: each pinned by a test or retired by a decision

- State: PLANNED
- Specification: every row of the source `uc-matrix` is read against the simplification decisions and the owner rulings named in its decision column and ends DONE (the test that fails without the behaviour, named), SUPERSEDED (the decision cited) or DEFERRED-WITH-EXPLICIT-BLOCKER; a row that turns out to state no behaviour of the CLI moves to `not-use-cases.tsv` with the reason; a behaviour that still holds and has no test gets its test in this task
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 36` (370 at the start of this plan)

### Task 37: The coverage rows without row-level evidence: each pinned by a test

- State: PLANNED
- Specification: every row of the sources `coverage`, `rule-cases` and the four reference tables that the first classification could not pin mechanically is matched to the test that fails without it (named in the row) or gets that test; a row that a later ruling changed is SUPERSEDED with the ruling cited
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 37` (1368 at the start of this plan)

### Task 38: The rows of the BDD plan and of the command behaviour matrix: each pinned by a test

- State: PLANNED
- Specification: every row of the sources `bdd-plan` and `command-matrix` is matched to its test file and test name, or gets the test; the BDD plan and the matrix are corrected where a later ruling changed a row
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 38` (128 at the start of this plan)

### Task 39: Phase 8 of the simplification: every document describes the one CLI

- State: PLANNED
- Specification: [completed/2026-11-04-phase-8-documentation.md](completed/2026-11-04-phase-8-documentation.md), its tasks read against the rulings made since it was written; what Tasks 9, 15, 32 and 35 already delivered is not repeated
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 39` (0 at the start of this plan)

### Task 40: Phase 9 of the simplification: the final verification of the whole branch

- State: PLANNED
- Specification: [completed/2026-11-04-phase-9-final-verification-and-pr.md](completed/2026-11-04-phase-9-final-verification-and-pr.md) Tasks 1 to 4 and Task 33 of the engine plan: the standard proof, every BDD scenario in both storage locations, 0 failed and 0 skipped tests, no mode split, pull before every command and push after every change in both locations, stale writes rejected with the diff of the item, no database, setup names no path, the before and after counts, and the pull request text written without a target
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 40` (0 at the start of this plan)

### Task 41: The final branch-wide review and its gap-fix tasks

- State: PLANNED
- Specification: a code review and a quality audit of the whole branch, and a gap table over the command behaviour matrix, the BDD plan, the owner rulings, the design decisions and the rule cases; every finding becomes a task of this plan in packet form (Tasks 41a, 41b, ...) and runs like any other task; the review ends only when no row of the status table is PLANNED
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 41` (0 at the start of this plan)

### Task 42: The cut-over: installation and full regression

- State: PLANNED
- Specification: the landing strategy [2026-11-09-team-rules-engine/implementation/01-landing-strategy.md](2026-11-09-team-rules-engine/implementation/01-landing-strategy.md) section 4: one installation after every task, test and review, then the full suite, both BDD locations and the consumer tests; what breaks is fixed through a task of this plan
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 42` (0 at the start of this plan)

### Task 43: Backlog item 148: the team template of the owner's team

- State: PLANNED (outside this repository)
- Specification: the owner's template in the new shape (people, item, rules), valid under `backlog team validate`; it never enters this repository
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 43` (1 at the start of this plan)

### Task 44: Backlog item 150: the template-location key in the configuration of every repository and branch

- State: PLANNED (outside this repository)
- Specification: the key is read by people and skills, never by the CLI
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 44` (0 at the start of this plan)

### Task 45: Backlog item 149: the owner's team entry of the team file

- State: PLANNED (outside this repository)
- Specification: one finished entry at the resolved team file location, valid under `backlog team validate`
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 45` (0 at the start of this plan)

### Task 46: Backlog item 151: the team lead and member skills read the template and use the new CLI

- State: PLANNED (outside this repository)
- Specification: the design folder [2026-11-09-team-rules-engine/](2026-11-09-team-rules-engine/) chapter 07; the consumers listed in the coverage file
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 46` (40 at the start of this plan)

### Task 47: Backlog item 153: full-scope real execution of the CLI against the owner's team and example teams

- State: PLANNED
- Specification: [2026-11-09-team-rules-engine/implementation/02-bdd-plan.md](2026-11-09-team-rules-engine/implementation/02-bdd-plan.md) section 4
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 47` (0 at the start of this plan)

### Task 48: Backlog item 154: gap review of the earlier branch backlog and the main backlog against the simplification

- State: PLANNED (outside this repository)
- Specification: two lists per repository folder (owner ruling R24): items superseded by the simplification, and behaviour gaps; it files every coverage row still deferred as its own backlog item or closes it by a recorded owner rule; nothing is archived before the merge and the owner's approval
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 48` (20 at the start of this plan)

### Task 49: The open questions, re-validated and presented once

- State: PLANNED
- Specification: every candidate question is checked against the recorded decisions and the finished code; only those still open are presented, together
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 49` (0 at the start of this plan)

### Task 50: The pull request

- State: PLANNED
- Specification: opened after Task 49 with the text of Task 40; its target is the one decision held for the owner
- Packet: to be written and checked before the task starts
- Use cases: the rows of the status table whose task column is `Task 50` (0 at the start of this plan)

### Task 51: The excluded rows are validated: each states no behaviour of the CLI, or returns to the table

- State: PLANNED
- Specification: the 583 rows of [not-use-cases.tsv](2026-11-12-simplify-branch-completion/not-use-cases.tsv) were taken out of the status table on the strength of the design's disposition (574 rows) and of the first classification (9 rows), without a row-by-row check. Every row is read against its source, the code and the decision its reason cites. A row that states a behaviour the CLI has or must have returns to the status table with a status (DONE with its test, PLANNED under a task, SUPERSEDED with the decision, or deferred with its blocker); a row that states none stays excluded, its reason confirmed. The task ends with every excluded row marked as validated in a new column `validated` (the commit of the check).
- Packet: to be written and checked before the task starts
- Use cases: none at the start; the rows this task returns to the table

### Task 52: The shared git helpers work on folders of tens of thousands of items

- State: PLANNED
- Specification: the helpers that run git for every command read git's output into a buffer of one mebibyte and pass the command's own paths as arguments (`src/shared/store.js`, `src/shared/sync.js`, `src/shared/team-publish.js`). A folder of several thousand items therefore stops a command that lists the folder's history or status, and a migration of such a folder cannot publish or undo (measured while Task 23 was built: 4,000 long-named items stop the migration at the counter; with the buffer raised, publication fails and the undo cannot restore). The owner rulings call folders of tens of thousands of items normal. The recovery journal of a writing command is rewritten in full for every path the command notes, so the run time of a migration grows with the square of the folder size (measured on the merged Task 23: 1,000 items 1.4 s, 2,000 items 4.2 s, 3,000 items 8.8 s). The migration's check for uncommitted changes ignores the exit code of the status listing, so a listing that is cut off passes the check. Every helper reads git's output without a fixed ceiling, hands long path lists to git on standard input and checks git's exit code; the journal is saved once per batch of paths; the run time is measured at 10,000 and 30,000 items; a test builds a folder above each measured limit and runs the listing, a writing user command, a team step and the migration with its undo.
- Packet: to be written and checked before the task starts
- Use cases: none at the start; the rows of Tasks 36 to 38 that state a folder size
