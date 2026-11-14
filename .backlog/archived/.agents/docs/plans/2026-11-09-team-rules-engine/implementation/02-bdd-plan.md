# Team rules engine: the BDD and test plan

Context: entry plan Task 3 asks for the scenarios and the test plan before the code. The design holds the scenarios: the 288 cases of
design/rule-cases.json (each a given state, a command and the expected exit, rule, text and changes) and the named scenarios of chapters
01, 04, 05 and 06 that need files and git. This file maps every one of them to the batch of `00-priority-order.md` that makes it pass, the
test file that holds it and its kind; checks review D's count of the existing tests and maps each group to its batch; and defines the
real-execution checks of backlog item 153. The kinds: **unit** (a module called in the test process, no files), **integration** (the real
`backlog` command on temporary folders and git repositories), **BDD** (a Gherkin scenario of features/*.feature, run by
.agents/test/features.test.js in both storage locations).

## 1. Where the tests live

- .agents/test/team-rules-cases.test.js (new in B08): reads .agents/test/fixtures/team-rules/rule-cases.json and the shipped templates
  templates/teams/*.json, and runs every case whose run kind is in its allow-list through the module that serves that kind. The allow-list
  grows with each batch (B02 teams-file, B08 new and update, B09 pop and filter, B10 validate, B12 resolve and inputs, B24 migrate-check,
  B26 setup-advice); at B26 it holds every module kind, so a case that is not run is a failure of the plan. It also keeps the spike's check
  that every rule, pop entry and filter of every template has a case and a verification entry.
- .agents/test/team-commands.test.js (new in B13): replays the `new`, `update` and `pop` cases through the real commands on a temporary
  backlog (one fixture backlog per template, the case's items written as JSON files), comparing the exit code, the rule id in the output and
  the changed fields. The cases are the specification; this file proves the wiring.
- .agents/test/user-visibility.test.js (new in B17): the run kinds that are command behaviour (user-show, user-ref, user-set, the session
  guard) through the real user commands.
- One integration test file per foundation or command batch, named in section 2.

## 2. Every scenario, its batch, its test file and its kind

### 2.1 The cases of rule-cases.json, by prefix (288 cases)

| prefix | cases | run kinds (count) | batch that makes them pass | test file | kind |
|---|---|---|---|---|---|
| PAR (the parallel-work example) | 66 | update 47, new 11, pop 6, filter 2 | B08 (new, update), B09 (pop, filter); replayed through the commands in B13 and B14 | team-rules-cases, team-commands | unit, integration |
| SCR (scrum) | 29 | update 23, new 1, pop 3, filter 2 | B08, B09; replay B13, B14 | as above | unit, integration |
| XP (extreme programming) | 20 | update 14, new 3, pop 1, filter 2 | B08, B09; replay B13, B14 | as above | unit, integration |
| SOL (single agent) | 12 | update 6, new 3, pop 2, filter 1 | B08, B09; replay B13, B14 | as above | unit, integration |
| PAT (the pattern catalogue) | 57 | update 50, new 2, pop 3, filter 2 | B08, B09; replay B13, B14 | as above | unit, integration |
| COD (coded CLI behaviour) | 16 | resolve 6 (COD-01 to COD-04, COD-13, COD-16), new 4 (COD-05, COD-08, COD-09, COD-12), update 4 (COD-10, COD-11, COD-14, COD-15), user-show 2 (COD-06, COD-07) | resolve: B12; new and update: B08, replay B13, B14; user-show: B17 | team-rules-cases, team-commands, user-visibility | unit, integration |
| VAL (checks of the file) | 35 | validate | B10 (VAL-20 and VAL-33 also prove B07's subset) | team-rules-cases; the command form in team-validate (B12) | unit, integration |
| VAL-EX (the five templates validate clean) | 5 | validate | B10 | team-rules-cases | unit |
| INL (inline team files: edge cases) | 11 | update 9 (INL-02 to INL-08, INL-10, INL-11), pop 2 (INL-01, INL-09) | INL-05 (the pattern that hangs a backtracking engine): B07 for the matcher, B08 end to end; the other update cases (malformed forms, the team and archive effects, the foreign form of an own reference): B08; INL-01 and INL-09 (pop stops on a broken rule): B09 | team-safe-regex, team-rules-cases | unit |
| R14 (`--show-all` on team commands; design question "2026-11-09 round 12, question 5") | 10 | inputs | B12 | team-rules-cases; the refusals through the commands in team-validate | unit, integration |
| R15 (flag before variable) | 3 | inputs 2 (R15-01, R15-02), update 1 (R15-03) | B12; R15-03: B08, replay B14 | team-rules-cases, team-commands | unit, integration |
| R16 (user commands and team items) | 3 | user-show 1 (R16-01), user-ref 2 (R16-02, R16-03) | B17 | user-visibility | integration |
| R17 (the migration's field report) | 2 | migrate-check 1 (R17-01), migrate-ask 1 (R17-02) | B24 | team-rules-cases (R17-01), team-migrate (R17-02 on a terminal and without one) | unit, integration |
| R19 (user writes on team items) | 2 | user-set | B18 | user-visibility | integration |
| R19A (the team-session guard) | 3 | user-show | B20 | user-visibility | integration |
| R22 (where the team file is; R22-07 is question 1, R22-08 is question 6 of round 12) | 8 | teams-file | B02 | team-rules-cases, team-file-location | unit |
| R24 (own folder) | 2 | update 1 (R24-01), new 1 (R24-02) | B08 in the evaluator; B21 through the commands with a real foreign folder | team-rules-cases, team-commands | unit, integration |
| R25 (setup's report) | 4 | setup-advice | B26 | team-rules-cases; the real setup in shared-setup | unit, integration |
| total | 288 | new and update 180, pop and filter 26, validate 40, the rest 42 | | | |

### 2.2 The scenarios of chapter 01 (the team file and setup)

The fifteen scenarios of the spike's teams-load.test.mjs become integration tests in .agents/test/team-load.test.js (B11), except where a
command is named; the four of setup.test.mjs go to .agents/test/shared-setup.test.js.

| scenario | batch | test file |
|---|---|---|
| the location: the `teams_file` key wins, else the repository folder of a backlog outside the repository, else .backlog/teams.json | B02 (resolution), B11 (on load) | team-file-location, team-load |
| a missing file stops the command with the resolved path and the three ways, and writes nothing | B11 | team-load |
| a team file that is a symbolic link is refused | B11 | team-load |
| a `teams_file` reached through a symbolic-link folder inside the repository is refused | B11 | team-load |
| the first load validates, writes the SHA into .backlog/config.json and the record; within 24 hours the copy is used | B11 | team-load |
| a SHA in the configuration that differs from the record (another branch, a pull) makes the file read and validated again | B11 | team-load |
| after 24 hours an invalid file stops the command; the SHA and the record are not updated | B11 | team-load |
| a record dated in the future (clock change) is stale: the file is read again | B11 | team-load |
| a refused team command writes nothing: no SHA, no record, no copy, even when another team of the file is valid | B11, through a command in B13 | team-load, team-commands |
| `backlog team validate` always validates in full, refreshes the record and writes the SHA | B12 | team-validate |
| the whole file must be valid: one broken entry stops every team of the file (question 4 of round 12) | B11, through a command in B13 | team-load, team-commands |
| a read-only checkout and an unwritable state folder: the command proceeds, validating in full each time, silently | B11 | team-load |
| an unparsable .backlog/config.json stops every command and is never overwritten | B02 (user commands), B11 (team commands) | team-file-location, team-load |
| a repository input that names another repository: that repository's team file; the SHA goes to the per-user record (question 1 of round 12) | B11 | team-load |
| without a configuration the team file is .backlog/teams.json and the SHA goes into a new .backlog/config.json (question 6 of round 12) | B11 | team-load |
| setup copies the five generic templates into .backlog/team-templates and says so | B25 | shared-setup |
| a second setup replaces an edited copy and removes a file the person added there | B25 | shared-setup |
| setup reports the migration until the folder is migrated, then states when (no version comparison) | B26 | shared-setup |
| `migrated_at` records when the folder was migrated: a later run that converts nothing keeps it | B22 | team-migrate |

### 2.3 The scenarios of chapter 04 section 6 (two clones, team commands) and chapter 05 section 7 (numbers and the index)

All are integration tests on two clones of one bare repository unless the row says otherwise.

| scenario | batch | test file |
|---|---|---|
| two members claim one item at once: one succeeds, the other is refused by the claim rule | B15 | team-concurrency |
| two children are added to one parent at once: the parent's children list holds both | B15 | team-concurrency |
| two claims that together pass a team limit: the second is refused by the limit rule | B15 | team-concurrency |
| two creations at once: two numbers | B15 | team-concurrency |
| an item changed during a step past half of the time budget: exit 3 | B15 | team-concurrency |
| a team re-run drops only the command's own commit and publishes only that; a person's unpushed commit stays local and an uncommitted change is kept (question 2 of round 12) | B15 | team-concurrency |
| a person's uncommitted change to a file of the command's commit blocks the reset: exit 3 with the text | B15 | team-concurrency |
| upstream changed only another repository folder: the team command is not run again, and only its own commit is published | B15 | team-concurrency |
| two clones create an item at once, through `backlog new` | B04 | numbers |
| another clone published and cleaned (deleted) a number before this push: a team command takes the next number | B15 | team-concurrency |
| the same race through a user command: the number is renumbered above upstream | B04 | numbers |
| deleting the newest item does not give its number again | B03 | numbers |
| `git revert` of a creation, and a lowered or deleted numbers.json, do not give the number again | B03 | numbers |
| a number that exists only in a merge commit is never handed out again | B03 | numbers |
| an item file named with a number above the bound stops the folder, and the number is never part of the mark | B03 | numbers |
| a shallow clone refuses `backlog new` | B03 | numbers |
| `backlog update <item> --seq <n>` below the mark is refused | B03 | numbers |
| the migration seeds its folder from the folder's history | B22 | team-migrate |
| after a code-branch merge that left two items with one number, a command given that number stops and names both slugs; nothing is renumbered (question 3 of round 12) | B06 | item-json |
| a lead's uncommitted team file in the folder is not committed by the next writing command (staging of owned paths) | B04 | shared-sync |
| a user priority change leaves team entries in place | B19 | shared-index |
| a team's `place` effect leaves user entries in place | B19 | team-commands |
| clean leaves the index entries of team items in place | B19 | shared-move-archive |

### 2.4 The scenarios of chapter 06 section 7 (the migration)

All are integration tests in .agents/test/team-migrate.test.js, on fixture folders built from today's forms (the fixtures
.agents/test/fixtures/shared/item-*.md and items written by today's codec before B06, kept as files).

| scenario | batch |
|---|---|
| an open item of a team with an entry is converted | B22 |
| an item of a team without an entry is unbound with the record | B23 |
| an archived item of a team without an entry is unbound and otherwise unchanged | B23 |
| no team file at the resolved location, with a team item in the folder, stops the migration, naming the path and the three ways | B22 |
| a folder with no team item migrates without a team file | B22 |
| an unreadable team file stops the migration | B22 |
| the migration converts only the folder of its repository | B22 |
| a foreign dependency on a folder still in markdown reads as unresolved and stops nothing | B22 |
| a teamless split item gets its parent number | B23 |
| two split lines: the first wins | B23 |
| a split item whose parent is gone keeps an empty parent and is listed | B23 |
| a folder without an index keeps its priority order | B23 |
| absent created and updated_by become null and empty text | B22 |
| an unreadable header stops the migration | B22 |
| two items with one number stop the migration | B22 |
| a JSON file name that would be too long stops the migration | B22 |
| a shallow clone stops the migration | B22 |
| the folder gets its counter from its whole history | B22 |
| a second run says nothing to migrate | B22 |
| a second run that converts nothing keeps `migrated_at` | B22 |
| a second run after a team entry is removed unbinds its items | B23 |
| a markdown item after the migration stops a command | B22 (the stop text itself is B06) |
| validate runs on a markdown backlog and checks the file only | B22 |
| setup runs on a markdown backlog and recommends the migration | B26 (in shared-setup) |
| an entry in today's shape stops the migration and nothing is written | B22 |
| migrate without a team or `--show-all` stops with the three-ways text | B22 |
| the field report lists a missing, an invalid and an undeclared field | B24 |
| `--ask` on a terminal repairs one field and records it | B24 |
| `--ask` without a terminal is refused | B24 |
| a repository with only the root configuration file of earlier builds stops with the move text | B28 (in storage-location) |
| a session with only the unprefixed variables gets the three-ways text | B01 (in env-prefix) |
| the index entries whose status copy changes are counted in the summary | B23 |

### 2.5 The BDD features

Context: features/*.feature describe the product in Gherkin and run in both storage locations; three of them describe today's team flow.

| feature file | batch | change |
|---|---|---|
| features/team.feature (7 scenarios), features/team-flow.feature (2), features/agents.feature (10) | B14 | rewritten on the parallel-work template: a lead splits an item and files children with `backlog team new --parent`, a member pops, claims, hands to check, another member checks, the holder closes; a refused step prints its rule id; the item at the end of the queue is idle (exit 3). The agent scenarios that are user behaviour (claim and release of an item without a team) move to features/plain-use.feature |
| features/team-define.feature (2) | B27 | deleted with `backlog team define` |
| features/storage.feature, features/items.feature, features/integrity.feature | B06 | the steps read JSON item files (features/steps/cli.js reads `.md` files and parses their header today) |
| a new features/team-rules.feature | B16 | a lead reads `backlog team query rules` and `backlog team query steps`, edits the team file, runs `backlog team validate` and sees a finding with its fix |
| a new features/show-all.feature | B18 | a person lists without and with `--show-all`, and archives the item of a team that no longer exists |
| a new features/migrate.feature | B24 | the owner previews with `--dry-run`, migrates, reads the field report; an older release refuses the migrated folder |

## 3. The existing tests each batch breaks or rewrites

Context: review D (section 4) classified the 819 test declarations of the 75 test files of .agents/test (1135 tests at run time, because
loops expand them) into six groups and named two shared helper files that carry most of the change. This plan checked each figure on
commit 0128400 by searching each declaration's own block, and maps each group to its batch.

**The two helper files first.** .agents/test/shared-fixtures.js sets the unprefixed home and origin-URL variables for nearly every test
(its `env()`, lines 89 to 100) and routes user command lines that carry team flags to `backlog team update --set-team` (its `cli()` and
the helpers before it, lines 105 to 181, with teamNew, intoTeam and teamMembers after it); .agents/test/shared-concurrency.js writes markdown items. Checked: both hold. B01 rewrites `env()` first, so most
variable changes need no change in the tests themselves; B06 rewrites shared-concurrency.js first; B14 removes the routing of `cli()`
together with the team tests that use it.

| group | review D: files, declarations | checked in this plan | batch and action |
|---|---|---|---|
| team behaviour moves into rules | 31, 301 | the same 31 files and 301 declarations | B14 deletes the command-level files (their behaviour is now rules of the templates, proven by the cases); B27 deletes the unit tests of removed modules (shared-handoff-core, shared-handoff-gate, shared-handoff-close, workflow). Six files of the group are rewritten instead of deleted, against review D's "delete": plain-team-items (B17) and plain-team-env (B20) because their rulings invert their assertions; team-boundary (B17, user side) and team-cli (B12, B14) because part of their subject stays; skill-commands and team-spelling-docs (B16) because they guard the documentation, which still needs a guard; shared-foreign-deps is replaced by R24 tests in B21 |
| help and command documentation | 2, 21 | the same | rewritten with each help change (B12, B14, B16, B27, B29) |
| removed command, flag or file in user-command files | 9, 37 | the same 9 files and 37 declarations, with one correction: the 4 declarations review D gave to the root configuration file in shared-audit (2), shared-safety (1) and shared-store (1) use `backlog move --to-repository`. So: moving to another repository, 6 files and 30 declarations (shared-move-archive 15, shared-sync-db 9, shared-stale 2, shared-audit 2, shared-safety 1, shared-store 1); the root configuration file, 3 files and 7 declarations (shared-origin-setting 5, shared-setup 1, storage-location 1) | B21 deletes the move tests; B28 rewrites the root-configuration tests to the move text |
| markdown item format | 32, 223 (19 of the files also touch team items) | not reproduced exactly: the figure depends on what counts as a dependency on the format. A narrower search (item paths under phases/ or archive/, file names of the form NNN-slug.md, the header codec) finds 23 files and 134 declarations. The three last groups together are 460 declarations in both counts, so the two counts differ only in where the edge is drawn | B06 rewrites them to JSON and plans with review D's 223 as the upper bound. Of the 33 declarations of shared-frontmatter, review D counts 32 as tests of today's markdown reader: they stay as tests of the migration's reader (B22); shared-item-keys and shared-legacy-fields test stored spellings and retired keys and are deleted or turned into migration tests (B28) |
| unprefixed variable only | 16, 32 | 23 files and 47 declarations with the narrower markdown search (the same edge as above) | B01 renames them |
| none of the above | 35, 205 (an upper bound) | 35 files and 279 declarations with the narrower search | kept |

The table below gives every test file with its declarations, its tests at run time (Node 24, run file by file on 2026-11-10, all
passing), the groups of its declarations by the search of this plan, and the batch that changes it.

| test file | declarations | tests at run time | group (declarations) | batch and action |
|---|---|---|---|---|
| .agents/test/commands-documented.test.js | 3 | 3 | help 3 | rewritten with each help change; COMMANDS.md regenerated |
| .agents/test/features.test.js | 1 | 202 | unaffected 1 | the runner is unchanged; the feature files change (section 2.5) |
| .agents/test/fields.test.js | 3 | 3 | unaffected 2; markdown item 1 | B06 rewrite to JSON |
| .agents/test/install-script.test.js | 3 | 3 | unaffected 3 | kept |
| .agents/test/new-ask.test.js | 9 | 9 | unaffected 8; variable only 1 | B01 rename |
| .agents/test/no-child-process-proof.test.js | 4 | 4 | variable only 4 | B01 rename |
| .agents/test/no-private-details.test.js | 3 | 3 | variable only 3 | B01 rename |
| .agents/test/package.test.js | 2 | 2 | variable only 1; unaffected 1 | B01 rename |
| .agents/test/plain-team-env.test.js | 7 | 7 | team behaviour 7 | B20 rewrite: the team variable now stops every user command (today user commands ignore it) |
| .agents/test/plain-team-items.test.js | 12 | 12 | team behaviour 12 | B17 rewrite: a user command does not see a team item (today it refuses one) |
| .agents/test/release-pr.test.js | 4 | 4 | unaffected 4 | kept |
| .agents/test/release.test.js | 9 | 9 | unaffected 9 | kept |
| .agents/test/removed-forms.test.js | 2 | 2 | unaffected 2 | kept |
| .agents/test/router.test.js | 6 | 6 | unaffected 4; variable only 2 | B01 rename |
| .agents/test/script-runs.test.js | 3 | 6 | variable only 3 | B01 rename |
| .agents/test/shared-audit.test.js | 16 | 16 | removed (move to another repository) 2; markdown item 10; unaffected 4 | B06 rewrite to JSON; B21 delete the move tests |
| .agents/test/shared-changed.test.js | 13 | 13 | unaffected 9; markdown item 3; variable only 1 | B01 rename; B06 rewrite to JSON |
| .agents/test/shared-checkout.test.js | 5 | 5 | variable only 3; unaffected 1; markdown item 1 | B01 rename; B06 rewrite to JSON |
| .agents/test/shared-fixtures.test.js | 1 | 1 | variable only 1 | B01 rename |
| .agents/test/shared-foreign-deps.test.js | 4 | 4 | team behaviour 4 | B21 deleted and replaced by the R24 tests (foreign references are not followed and stop nothing) |
| .agents/test/shared-frontmatter.test.js | 33 | 45 | unaffected 29; markdown item 4 | kept as tests of the migration's markdown reader (B22) |
| .agents/test/shared-handoff-close.test.js | 9 | 9 | team behaviour 9 | B27 deleted with the module it tests |
| .agents/test/shared-handoff-commands.test.js | 13 | 13 | team behaviour 13 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-handoff-core.test.js | 21 | 21 | team behaviour 21 | B27 deleted with the module it tests |
| .agents/test/shared-handoff-e2e.test.js | 22 | 22 | team behaviour 22 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-handoff-gate.test.js | 5 | 8 | team behaviour 5 | B27 deleted with the module it tests |
| .agents/test/shared-help.test.js | 18 | 21 | help 18 | rewritten with each help change (B12, B14, B16, B27, B29) |
| .agents/test/shared-index.test.js | 9 | 9 | unaffected 7; markdown item 2 | B06 rewrite to JSON |
| .agents/test/shared-item-keys.test.js | 5 | 5 | unaffected 2; markdown item 2; variable only 1 | B01 rename; B06 rewrite to JSON; B28: the tests of stored spellings and retired keys deleted or turned into migration tests |
| .agents/test/shared-legacy-fields.test.js | 6 | 6 | unaffected 4; markdown item 2 | B06 rewrite to JSON; B28: the tests of stored spellings and retired keys deleted or turned into migration tests |
| .agents/test/shared-list.test.js | 7 | 7 | unaffected 7 | kept |
| .agents/test/shared-long-name.test.js | 1 | 1 | variable only 1 | B01 rename |
| .agents/test/shared-move-archive.test.js | 40 | 43 | markdown item 15; unaffected 10; removed (move to another repository) 15 | B06 rewrite to JSON; B21 delete the move tests |
| .agents/test/shared-new.test.js | 31 | 46 | unaffected 21; markdown item 8; variable only 2 | B01 rename; B06 rewrite to JSON |
| .agents/test/shared-no-classes.test.js | 3 | 3 | unaffected 3 | kept |
| .agents/test/shared-origin-setting.test.js | 10 | 10 | removed (root configuration file) 5; variable only 5 | B01 rename; B28 rewrite to the move text |
| .agents/test/shared-query.test.js | 23 | 25 | markdown item 6; unaffected 15; variable only 2 | B01 rename; B06 rewrite to JSON |
| .agents/test/shared-read-commands.test.js | 9 | 9 | markdown item 1; unaffected 8 | B06 rewrite to JSON |
| .agents/test/shared-repair.test.js | 7 | 7 | unaffected 4; markdown item 3 | B06 rewrite to JSON |
| .agents/test/shared-routed-commands.test.js | 8 | 8 | unaffected 8 | kept |
| .agents/test/shared-safety.test.js | 26 | 26 | unaffected 23; variable only 1; markdown item 1; removed (move to another repository) 1 | B01 rename; B06 rewrite to JSON; B21 delete the move tests |
| .agents/test/shared-session-continue.test.js | 9 | 9 | team behaviour 9 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-session-names.test.js | 2 | 2 | team behaviour 2 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-session-review.test.js | 11 | 11 | team behaviour 11 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-setup.test.js | 5 | 5 | markdown item 2; unaffected 2; removed (root configuration file) 1 | B06 rewrite to JSON; B28 rewrite to the move text |
| .agents/test/shared-severity.test.js | 2 | 2 | markdown item 1; variable only 1 | B01 rename; B06 rewrite to JSON |
| .agents/test/shared-stale.test.js | 15 | 15 | markdown item 9; unaffected 2; variable only 2; removed (move to another repository) 2 | B01 rename; B06 rewrite to JSON; B21 delete the move tests |
| .agents/test/shared-store.test.js | 23 | 23 | variable only 1; unaffected 5; markdown item 16; removed (move to another repository) 1 | B01 rename; B06 rewrite to JSON; B21 delete the move tests |
| .agents/test/shared-symlinked-parent.test.js | 4 | 4 | markdown item 1; unaffected 3 | B06 rewrite to JSON |
| .agents/test/shared-sync-db.test.js | 32 | 48 | markdown item 10; removed (move to another repository) 9; unaffected 8; variable only 5 | B01 rename; B06 rewrite to JSON; B21 delete the move tests |
| .agents/test/shared-sync.test.js | 30 | 30 | markdown item 15; unaffected 14; variable only 1 | B01 rename; B06 rewrite to JSON |
| .agents/test/shared-team-compat.test.js | 5 | 5 | team behaviour 5 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-done.test.js | 2 | 2 | team behaviour 2 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-flow.test.js | 1 | 26 | team behaviour 1 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-lead-pop.test.js | 15 | 15 | team behaviour 15 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-lifecycle.test.js | 10 | 10 | team behaviour 10 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-plan.test.js | 10 | 10 | team behaviour 10 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-pop.test.js | 19 | 19 | team behaviour 19 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-scope.test.js | 9 | 9 | team behaviour 9 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-stages.test.js | 15 | 15 | team behaviour 15 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-status-order.test.js | 7 | 7 | team behaviour 7 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-teams.test.js | 6 | 6 | team behaviour 6 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-team-work.test.js | 20 | 20 | team behaviour 20 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-twostage.test.js | 2 | 2 | team behaviour 2 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-unrefined-claim.test.js | 6 | 6 | team behaviour 6 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/shared-update.test.js | 40 | 43 | markdown item 20; unaffected 18; variable only 2 | B01 rename; B06 rewrite to JSON |
| .agents/test/shared-wip.test.js | 9 | 9 | team behaviour 9 | B14 deleted whole: today's team command lines; the behaviour is now rules of the templates, proven by the cases |
| .agents/test/skill-commands.test.js | 4 | 4 | team behaviour 4 | B16 rewritten to the new team command list (a documentation guard; it imports today's team flags) |
| .agents/test/storage-location.test.js | 15 | 15 | markdown item 1; unaffected 11; removed (root configuration file) 1; variable only 2 | B01 rename; B06 rewrite to JSON; B28 rewrite to the move text |
| .agents/test/team-boundary.test.js | 16 | 16 | team behaviour 16 | B17 rewrite of the user side; the team side deleted in B14 |
| .agents/test/team-cli.test.js | 15 | 15 | team behaviour 15 | B12 router tests rewritten; B14 the step form; B27 the define and workflow lines deleted |
| .agents/test/team-spelling-docs.test.js | 3 | 3 | team behaviour 3 | B16 rewritten to the new team command list (a documentation guard) |
| .agents/test/update-notice.test.js | 8 | 8 | unaffected 6; variable only 2 | B01 rename |
| .agents/test/upgrade.test.js | 21 | 21 | unaffected 21 | kept |
| .agents/test/workflow.test.js | 12 | 42 | team behaviour 12 | B27 deleted with the module it tests |
| total | 819 | 1135 | | |

## 4. The real-execution checks of backlog item 153

Context: backlog item 153 runs the engine for real after the cut-over (or on the engine build before it, against a scratch copy):
real agents or a driving script, real git clones of a scratch backlog repository, real pushes, several sessions at once. The cases of
section 2 prove each rule alone; item 153 proves that whole teams can work a backlog from the first item to the last. Each dummy team below
uses the template of the same name from templates/teams/, copied to the team file of a scratch repository. The owner's team rule set has
its own scenario list in the backlog repo; this public file names only the generic templates.

Every team, first: `backlog team validate --team <team>` reports no error; `backlog team query rules --team <team> --json` returns the
entry as stored; a session without the agent variable is refused by `backlog team update`; a session with the team variable set is refused
by `backlog list`.

**Scrum (template scrum, team scrum).**
1. The product owner files five items with `backlog team new --team scrum --agent <product owner> --name "<title>"`; each starts in
   backlog.
2. The product owner refines two of them; a developer's `backlog team pop --json` offers only refined items, in queue order.
3. Two developers pop at the same moment from two clones; each gets a different item.
4. A developer requests a review; another developer takes it and reviews it; the author cannot take its own review (refused with the rule
   id).
5. A review that asks for changes returns the item to work; a passing review closes it as done.
6. The filters board and needs-review list the expected items at each point; `backlog team query plan` shows each person's next action.
7. The scrum master escalates a stuck item; the done items are archived by the archive step.

**Extreme programming (template extreme-programming, team xp).**
1. The customer files stories; a programmer writes the test first; pairing is refused before a test is written.
2. Two programmers pair on one story; integration is refused while the story is not paired.
3. The customer accepts an integrated story; acceptance by a programmer is refused.
4. The filters to-pair and to-accept follow each step.

**Parallel work (template parallel, team parallel).**
1. The lead files a large item, starts a split and files three children with `backlog team new --parent <item>`; the parent's children
   list holds all three, also when two children are filed from two clones at once.
2. Members pop: the lead is offered the split, members are offered the children; a member cannot claim the parent while a child is open.
3. A member hands a child to check with a note; another member starts the check and is refused while the note is empty; the check passes;
   the holder closes the child.
4. Limits: a member at its limit is refused a further claim by the limit rule; the lead lifts the limit for one item.
5. Dependencies: an item that depends on an open item cannot be claimed; it can once the dependency closes.
6. The lead abandons an item with a reason; a released item returns to the queue; an item without a team is adopted by the team's step.
7. When every child is closed the parent closes; the closed items are archived; the archived items take no step.

**Single agent (template single-agent, team solo).**
1. One worker files ten items, pops, starts, finishes, pops again until `backlog team pop` exits 3 (idle).
2. The filter doing lists the one item in progress; a second start while one item is in progress is refused.

**Patterns (template patterns): the catalogue run as one team.**
1. Every pattern of chapter 03 section 11 is exercised once through the commands: branch scope, linked follow-up items, edit rules per
   status, the lead setting a status, an ended session, dependency hand-offs with acceptance and rejection, two limits and the lift,
   reassignment, waiting and resuming, decisions that hold dependents, a required definition of done, review documents named in comments,
   the close on the reviewed commit, the length cap, deletion, the branch move, the release to users, the review stages with passes and
   a fallback reviewer, and the older reviews first.

**Several teams at once, on one scratch backlog.**
1. Three teams (scrum, parallel and single agent) work at once from three clones for an hour of steps with short pauses; every number is
   unique, no item loses a write, every lost race ends as a re-run, and no command waits past the clone lock's time budget.
2. A user works the same folder with user commands at the same time; the user sees no team item without `--show-all`, and the user's
   reordering leaves the team items in place.

**The migration, on a copy of a real folder.**
1. A scratch copy of a folder with items of a team, archived items, split items and items of a removed team migrates with the dry run
   first; every item converts; the field report lists the expected problems; `--ask` repairs one; the team then works the folder with its
   template.
