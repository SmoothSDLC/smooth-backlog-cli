# Team rules engine: the BDD and test plan

Context: entry plan Task 3 asks for the scenarios and the test plan before the code. The design already holds the scenarios: the 262 cases
of design/rule-cases.json (each a given state, a command and the expected exit, rule, text and changes) and the named scenarios of
chapters 01, 04, 05 and 06 that need files and git. This file maps every one of them to the batch of `00-priority-order.md` that makes it
pass, the test file that holds it and its kind; lists the existing tests each batch breaks or rewrites; and defines the real-execution
checks of backlog item 153. The kinds: **unit** (a module called in the test process, no files), **integration** (the real `backlog`
command on temporary folders and git repositories), **BDD** (a Gherkin scenario of features/*.feature, run by .agents/test/features.test.js
in both storage locations).

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

### 2.1 The cases of rule-cases.json, by prefix (262 cases)

| prefix | cases | run kinds (count) | batch that makes them pass | test file | kind |
|---|---|---|---|---|---|
| PAR (the parallel-work example) | 66 | update 47, new 11, pop 6, filter 2 | B08 (new, update), B09 (pop, filter); replayed through the commands in B13 and B14 | team-rules-cases, team-commands | unit, integration |
| SCR (scrum) | 29 | update 23, new 1, pop 3, filter 2 | B08, B09; replay B13, B14 | as above | unit, integration |
| XP (extreme programming) | 20 | update 14, new 3, pop 1, filter 2 | B08, B09; replay B13, B14 | as above | unit, integration |
| SOL (single agent) | 12 | update 6, new 3, pop 2, filter 1 | B08, B09; replay B13, B14 | as above | unit, integration |
| PAT (the pattern catalogue) | 57 | update 50, new 2, pop 3, filter 2 | B08, B09; replay B13, B14 | as above | unit, integration |
| COD (coded CLI behaviour) | 15 | resolve 5 (COD-01 to COD-04, COD-13), new 4 (COD-05, COD-08, COD-09, COD-12), update 4 (COD-10, COD-11, COD-14, COD-15), user-show 2 (COD-06, COD-07) | resolve: B12; new and update: B08, replay B13, B14; user-show: B17 | team-rules-cases, team-commands, user-visibility | unit, integration |
| VAL (checks of the file) | 21 | validate | B10 | team-rules-cases; the command form in team-validate (B12) | unit, integration |
| VAL-EX (the five templates validate clean) | 5 | validate | B10 | team-rules-cases | unit |
| INL (inline team files: edge cases) | 5 | update 4 (INL-02 to INL-05), pop 1 (INL-01) | INL-05 (the pattern that hangs a backtracking engine): B07 for the matcher, B08 end to end; INL-02 to INL-04: B08; INL-01: B09 | team-safe-regex, team-rules-cases | unit |
| R14 (`--show-all` on team commands) | 9 | inputs | B12 | team-rules-cases; the refusals through the commands in team-validate | unit, integration |
| R15 (flag before variable) | 3 | inputs 2 (R15-01, R15-02), update 1 (R15-03) | B12; R15-03: B08, replay B14 | team-rules-cases, team-commands | unit, integration |
| R16 (user commands and team items) | 3 | user-show 1 (R16-01), user-ref 2 (R16-02, R16-03) | B17 | user-visibility | integration |
| R17 (the migration's field report) | 2 | migrate-check 1 (R17-01), migrate-ask 1 (R17-02) | B24 | team-rules-cases (R17-01), team-migrate (R17-02 on a terminal and without one) | unit, integration |
| R19 (user writes on team items) | 2 | user-set | B18 | user-visibility | integration |
| R19A (the team-session guard) | 2 | user-show | B20 | user-visibility | integration |
| R22 (where the team file is) | 5 | teams-file | B02 | team-rules-cases, team-file-location | unit |
| R24 (own folder) | 2 | update 1 (R24-01), new 1 (R24-02) | B08 in the evaluator; B21 through the commands with a real foreign folder | team-rules-cases, team-commands | unit, integration |
| R25 (setup's advice) | 4 | setup-advice | B26 | team-rules-cases; the real setup in shared-setup | unit, integration |
| total | 262 | | | | |

### 2.2 The scenarios of chapter 01 (the team file)

| scenario | batch | test file | kind |
|---|---|---|---|
| the location: the `teams_file` key wins, else the repository folder of a configured backlog repository, else .backlog/teams.json | B02 (resolution), B11 (on load) | team-file-location, team-load | unit, integration |
| a missing file stops the command with the resolved path and the three ways, and writes nothing | B11 | team-load | integration |
| a team file that is a symbolic link is refused | B11 | team-load | integration |
| the first load validates, writes the SHA into .backlog/config.json and the record; within 24 hours the copy is used | B11 | team-load | integration |
| a SHA in the configuration that differs from the record (another branch, a pull) makes the file read and validated again | B11 | team-load | integration |
| after 24 hours an invalid file stops the command; the SHA and the record are not updated | B11 | team-load | integration |
| `backlog team validate` always validates in full, refreshes the record and writes the SHA | B12 | team-validate | integration |
| the record lists the valid teams: a valid team proceeds, an invalid team takes no action | B11, through a command in B13 | team-load, team-commands | integration |
| a read-only checkout and an unwritable state folder: the command proceeds, validating in full each time, silently | B11 | team-load | integration |
| setup copies the five generic templates into .backlog/team-templates and says so | B25 | shared-setup | integration |
| a second setup replaces an edited copy and removes a file the person added there | B25 | shared-setup | integration |

### 2.3 The scenarios of chapter 04 section 6 (two clones, team commands) and chapter 05 section 7 (numbers and the index)

| scenario | batch | test file | kind |
|---|---|---|---|
| two members claim one item at once: one succeeds, the other is refused by the claim rule | B15 | team-concurrency | integration (two clones of one bare repository) |
| two children are added to one parent at once: the parent's children list holds both | B15 | team-concurrency | integration |
| two claims that together pass a team limit: the second is refused by the limit rule | B15 | team-concurrency | integration |
| two creations at once: two numbers | B15 | team-concurrency | integration |
| an item changed three times during a step past the time budget: exit 3 | B15 | team-concurrency | integration |
| upstream changed only another repository folder: the team command is not run again, its commit is rebased | B15 | team-concurrency | integration |
| two clones create an item at once, through `backlog new` | B04 | numbers | integration |
| two clones create an item at once, through `backlog team new` | B15 | team-concurrency | integration |
| another clone published and cleaned (deleted) a number before this push: a team command takes the next number | B15 | team-concurrency | integration |
| the same race through a user command: the number is renumbered above upstream | B04 | numbers | integration |
| deleting the newest item does not give its number again | B03 | numbers | integration |
| `git revert` of a creation, and a lowered or deleted numbers.json, do not give the number again | B03 | numbers | integration |
| a shallow clone refuses `backlog new` | B03 | numbers | integration |
| `backlog update <item> --seq <n>` below the mark is refused | B03 | numbers | integration |
| the migration seeds its folder from the folder's history | B22 | team-migrate | integration |
| a duplicate number after a code-branch merge is reported by validate and renumbered by the next writing command | B12 (report), B04 (renumbering) | team-validate, numbers | integration |
| a user priority change leaves team entries in place | B19 | shared-index | integration |
| a team's `place` effect leaves user entries in place | B19 | team-commands | integration |

### 2.4 The scenarios of chapter 06 section 7 (the migration)

All are integration tests in .agents/test/team-migrate.test.js, on fixture folders built from today's forms (the fixtures
.agents/test/fixtures/shared/item-*.md and items written by today's codec before B06, kept as files).

| scenario | batch |
|---|---|
| an open item of a team with an entry is converted | B22 |
| an item of a team without an entry is unbound with the record | B23 |
| an archived item of a team without an entry is unbound and otherwise unchanged | B23 |
| no team file at the resolved location stops the migration, naming the path and the three ways | B22 |
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
| a shallow clone stops the migration | B22 |
| the folder gets its counter from its whole history | B22 |
| a second run says nothing to migrate | B22 |
| a second run after a team entry is removed unbinds its items | B23 |
| a markdown item after the migration stops a command | B22 (the stop text itself is B06) |
| validate runs on a markdown backlog and checks the file only | B22 |
| an entry in today's shape stops the migration and nothing is written | B22 |
| migrate without a team or `--show-all` stops with the three-ways text | B22 |
| the field report lists a missing, an invalid and an undeclared field | B24 |
| `--ask` on a terminal repairs one field and records it | B24 |
| `--ask` without a terminal is refused | B24 |
| a repository with only the root configuration file of earlier builds stops with the move text | B28 (in storage-location) |
| a session with only the unprefixed variables gets the three-ways text | B01 (in env-prefix) |
| the index entries whose status copy changes are counted in the summary | B23 |
| setup on a markdown backlog recommends the migration (ruling R25) | B26 (in shared-setup) |

### 2.5 The BDD features

Context: features/*.feature describe the product in Gherkin and run in both storage locations; three of them describe today's team flow.

| feature file | batch | change |
|---|---|---|
| features/team.feature (7 scenarios), features/team-flow.feature (2), features/agents.feature (10) | B14 | rewritten on the parallel-work template: a lead splits an item and files children with `backlog team new --parent`, a member pops, claims, hands to check, another member checks, the holder closes; a refused step prints its rule id; the item at the end of the queue is idle (exit 3). The agent scenarios that are user behaviour (claim and release of an item without a team) move to features/plain-use.feature |
| features/team-define.feature (2) | B27 | deleted with `backlog team define` |
| features/storage.feature, features/items.feature, features/integrity.feature | B06 | the steps read JSON item files (features/steps/cli.js reads `.md` files and parses their header today) |
| a new features/team-rules.feature | B16 | a lead reads `backlog team query rules` and `backlog team query steps`, edits the team file, runs `backlog team validate` and sees a finding with its fix |
| a new features/show-all.feature | B18 | a person lists without and with `--show-all`, and archives the item of a team that no longer exists |
| a new features/migrate.feature | B24 | the owner previews with `--dry-run`, migrates, reads the field report |

## 3. The existing tests each batch breaks or rewrites

Context: .agents/test holds 75 test files with 1135 tests on 2026-11-10 at commit 0128400 (933 in 74 files run one by one with Node 24,
plus the 202 BDD runs of features.test.js, 101 scenarios in each of two locations; every one passes). The searches that sorted them, to be
run again by each batch's implementing agent because a file can mention a form without depending on it: the old variable names (B01); `.md`
item paths, front matter and the header codec (B06); nextSeq, `--seq` and renumber (B03, B04); command lines starting with `team` (B13 to
B16); the flags and commands the design removes on those lines (B14, B27). Totals: B14 deletes 20 files with 218 tests (their behaviour is
now rules of the templates, proven by the cases); B27 deletes 4 files with 80 tests (unit tests of removed modules); B28 deletes one file
with 6 tests; 6 files with 52 tests are not expected to change.

| test file | tests | batches that change it, and how |
|---|---|---|
| .agents/test/commands-documented.test.js | 3 | every batch that changes help: COMMANDS.md regenerated |
| .agents/test/features.test.js | 202 | B06 (steps read JSON files), B14 (team.feature, team-flow.feature, agents.feature rewritten on the parallel example), B17, B27 (team-define.feature deleted) |
| .agents/test/fields.test.js | 3 | B06: backlog fields prints the built-in definition |
| .agents/test/install-script.test.js | 3 | none expected |
| .agents/test/new-ask.test.js | 9 | B01 rename; B06 JSON file; B24 reuses its child process for migrate --ask |
| .agents/test/no-child-process-proof.test.js | 4 | B01 rename |
| .agents/test/no-private-details.test.js | 3 | B01 rename; B06 JSON file |
| .agents/test/package.test.js | 2 | B01 rename; B06 JSON file |
| .agents/test/plain-team-env.test.js | 7 | B01 rename; B20 rewrite: the team variable now stops every user command |
| .agents/test/plain-team-items.test.js | 12 | B17 rewrite: a user command does not see a team item (today it refuses one) |
| .agents/test/release-pr.test.js | 4 | none expected |
| .agents/test/release.test.js | 9 | B06 JSON file |
| .agents/test/removed-forms.test.js | 2 | B27 adds the removed command lines |
| .agents/test/router.test.js | 6 | B01 rename; B12 the six team words; B20 the session guard |
| .agents/test/script-runs.test.js | 6 | B01 rename |
| .agents/test/shared-audit.test.js | 16 | B03/B04 numbers; B06 JSON file; B13 to B16 team command lines rewritten |
| .agents/test/shared-changed.test.js | 13 | B01 rename; B03/B04 numbers; B06 JSON file |
| .agents/test/shared-checkout.test.js | 5 | B01 rename; B06 JSON file |
| .agents/test/shared-fixtures.test.js | 1 | B01 rename |
| .agents/test/shared-foreign-deps.test.js | 4 | B21 rewrite: foreign references are not followed and stop nothing |
| .agents/test/shared-frontmatter.test.js | 45 | kept: the markdown reader survives for the migration (B22); its dump tests go in B28 if dump has no caller left |
| .agents/test/shared-handoff-close.test.js | 9 | B27 delete (unit tests of a removed module) |
| .agents/test/shared-handoff-commands.test.js | 13 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-handoff-core.test.js | 21 | B27 delete (unit tests of a removed module) |
| .agents/test/shared-handoff-e2e.test.js | 22 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-handoff-gate.test.js | 8 | B27 delete (unit tests of a removed module) |
| .agents/test/shared-help.test.js | 21 | B12, B14, B16 help texts; B27 removed commands |
| .agents/test/shared-index.test.js | 9 | B03/B04 numbers; B06 JSON file |
| .agents/test/shared-item-keys.test.js | 5 | B01 rename; B06 JSON file |
| .agents/test/shared-legacy-fields.test.js | 6 | B28 delete: the old key spellings are read only by the migration (B22 keeps one test) |
| .agents/test/shared-list.test.js | 7 | none expected |
| .agents/test/shared-long-name.test.js | 1 | B01 rename; B06 JSON file |
| .agents/test/shared-move-archive.test.js | 43 | B06 file names; B03 numbers; B21: --to-repository tests removed |
| .agents/test/shared-new.test.js | 46 | B01 rename; B03/B04 numbers; B06 JSON file; B13 to B16 team command lines rewritten |
| .agents/test/shared-no-classes.test.js | 3 | B06 JSON file |
| .agents/test/shared-origin-setting.test.js | 10 | B01 rename; B28: the root configuration file |
| .agents/test/shared-query.test.js | 25 | B01 rename; B03/B04 numbers; B06 JSON file; B13 to B16 team command lines rewritten |
| .agents/test/shared-read-commands.test.js | 9 | none expected (its matches are user-command flags) |
| .agents/test/shared-repair.test.js | 7 | B06 JSON file |
| .agents/test/shared-routed-commands.test.js | 8 | none expected |
| .agents/test/shared-safety.test.js | 26 | B01 rename; B06 JSON file; B13 to B16 team command lines rewritten |
| .agents/test/shared-session-continue.test.js | 9 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-session-names.test.js | 2 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-session-review.test.js | 11 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-setup.test.js | 5 | B01 rename; B25 and B26 add tests; B28 root configuration file |
| .agents/test/shared-severity.test.js | 2 | B01 rename; B06 JSON file |
| .agents/test/shared-stale.test.js | 15 | B01 rename; B03/B04 numbers; B06 JSON file |
| .agents/test/shared-store.test.js | 23 | B01 rename; B03/B04 numbers; B06 JSON file |
| .agents/test/shared-symlinked-parent.test.js | 4 | B06 JSON file |
| .agents/test/shared-sync-db.test.js | 48 | B01 rename; B03/B04 numbers; B06 JSON file; B13 to B16 team command lines rewritten |
| .agents/test/shared-sync.test.js | 30 | B01 rename; B03/B04 numbers; B06 JSON file |
| .agents/test/shared-team-compat.test.js | 5 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-done.test.js | 2 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-flow.test.js | 26 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-lead-pop.test.js | 15 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-lifecycle.test.js | 10 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-plan.test.js | 10 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-pop.test.js | 19 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-scope.test.js | 9 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-stages.test.js | 15 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-status-order.test.js | 7 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-teams.test.js | 6 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-team-work.test.js | 20 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-twostage.test.js | 2 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-unrefined-claim.test.js | 6 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/shared-update.test.js | 43 | B01 rename; B03/B04 numbers; B06 JSON file; B13 to B16 team command lines rewritten |
| .agents/test/shared-wip.test.js | 9 | B14 delete (today's team command lines; the behaviour is now rules of the example files, proven by the cases); the file goes whole |
| .agents/test/skill-commands.test.js | 4 | B06 JSON file |
| .agents/test/storage-location.test.js | 15 | B01 rename; B28: the root configuration file stops with the move text |
| .agents/test/team-boundary.test.js | 16 | B17 rewrite (user side), B14 rewrite (team side) |
| .agents/test/team-cli.test.js | 15 | B12 router tests; B14 rewrite to the step form; B27 define and workflow lines |
| .agents/test/team-spelling-docs.test.js | 3 | B29 documentation words |
| .agents/test/update-notice.test.js | 8 | B01 rename; B13 to B16 team command lines rewritten |
| .agents/test/upgrade.test.js | 21 | none expected |
| .agents/test/workflow.test.js | 42 | B27 delete (unit tests of a removed module) |
| total | 1135 | |

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
