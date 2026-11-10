# Team rules engine: risks, rollback and open items

Context: `00-priority-order.md` orders the work in 29 batches, `01-landing-strategy.md` keeps them off the installed CLI until one
cut-over, and `02-bdd-plan.md` maps every scenario. This file gives, per batch, what can go wrong and how the batch is undone (section 1);
the points found while planning, for the lead (section 2); which batches change if the owner answers a design question of
`../design/decisions.md` with another option than the provisional one (section 3); and, last, the two owner choices of the implementation
plan itself (section 4), planned provisionally with their recommendations. The design's own choices are in `../design/decisions.md` only
and are not repeated here.

## 1. Risks and rollback per batch

Context: before the cut-over every batch lives only on the engine branch, which is never installed (`01-landing-strategy.md` section 3), so
the rollback of any batch is `git revert <batch commit>` on the engine branch, pushed; no consumer ever saw it. The column "rollback" adds
only what that revert does not cover. After the cut-over the rollback is the one of `01-landing-strategy.md` section 5.

| batch | risk | how the plan meets it | rollback beyond the revert |
|---|---|---|---|
| B01 | a variable read in a place the list missed keeps its old name, so a session silently loses its team or agent | the new test greps src/ and bin/ for every unprefixed name of the fourteen; the shared fixture is changed first, so a missed test variable fails loudly | none |
| B02 | the resolution reads a relative `teams_file` against the wrong folder; the new stop on an unreadable configuration hits a configuration a person is editing | cases R22-01 to R22-08 cover each step of the order; the stop text says what to fix and the file is never written over | none |
| B03 | reading the history of a large backlog on every allocation is slow | review D measured 0.07 to 0.22 seconds per folder on a history of over twenty thousand commits; the per-clone cache of chapter 05 section 2 is kept as an optimisation | delete the cache files in the clone's state folder |
| B04 | a renumbering after a rebase misses a reference; the narrower staging leaves out a file a command did write | today's remapLocal already rewrites file name, number, slug, heading and references; the staging test lists every file each writing command writes | none |
| B05 | a read path bypasses the new module and B06 then misses it | the batch proves no test changes; the B06 search for `.md` in src/ must find only the module, the stop-file name and the migration | none |
| B06 | the largest batch: a test fixture or a step reads `.md` files; the old team code still reads items in memory | the in-memory shape of an item stays (envelope and fields merged), only the file text changes; the helper shared-concurrency.js is changed first; a second agent reviews before the commit | none |
| B07 | the matcher accepts a construct it then runs wrongly | the subset is closed and validate names the first unsupported construct (cases VAL-20, VAL-33); the cases compare with expected matches | none |
| B08 | the port drifts from the spike, which every case was proven on | the cases are the oracle: all 180 `new` and `update` cases must pass before the commit | none |
| B09 | pop offers a step that then fails, offers one item twice, or answers idle on a broken rule | cases INL-01 and INL-09; the pop cases of every template | none |
| B10 | a finding without the fix text, or a false shadowing error that blocks a valid file | cases VAL-01 to VAL-35 and the five templates validate clean; the warnings, which the spike leaves out, get one test each | none |
| B11 | the 24-hour copy hides an edit, so a lead believes a change is live; the SHA lands in the wrong place for another repository | stated behaviour of ruling R21 and the lead's habit of chapter 01 section 4; the scenarios of questions 1 and 6 of round 12 | delete the per-user record files of the team file |
| B12 | the router refuses a word a later batch needs, or the old routes break before their replacement | define and workflow keep their routes until B27; migrate answers that it is not yet available until B22 | none |
| B13 | a refused `new` consumes a number; a duplicate stops a folder that has none | the number is taken only after the rule allows the step (chapter 04 section 2); the duplicate test uses two real items | none |
| B14 | deleting about 3000 lines of old tests also deletes a behaviour that the templates do not cover | each deleted file is checked against coverage.tsv: every test row is BAKE-IN (a case), LAZY-LOAD, SKIP with a reason, or deferred; a second agent reviews the deletions | none |
| B15 | the re-run loops, starves one writer, or drops a person's work | only the command's own commit is dropped; the wait grows at random and stops at half of the lock budget (chapter 04 sections 6 and 7); the two-clone scenarios include a person's unpushed commit and uncommitted change | none |
| B16 | help reads a broken team file and fails | help reads nothing (chapter 04 section 1); a test runs `backlog team update --help` with a broken team file | none |
| B17 | a read path still shows a team item (a count, a dependency list, a history, the held section of changes) | the test lists every reading command of chapter 04 section 8 with a team item present | none |
| B18 | a user change of a team item escapes the history note | the test checks the entry for every writing command | none |
| B19 | a reordering or a clean moves or drops a team entry | the three scenarios of `02-bdd-plan.md` section 2.3 | none |
| B20 | an existing test or a script sets the team variable and then runs a user command | the B20 search over .agents/test; the consumers change at the cut-over (`01-landing-strategy.md` step 4) | none |
| B21 | removing the foreign walk lets a cycle through another folder pass; the narrower guards miss a conflict that matters | ruling R24 accepts it: no command reads another folder; validate reports an unresolved reference; the guards still cover every path of the own folder | none |
| B22 | a real folder holds a case the fixtures do not; the stop file is read by the new release as an item | the rehearsal of `01-landing-strategy.md` step 1 runs the migration on a scratch copy of every folder; B06 already ignores that one file name and a test proves it | in a scratch copy nothing to undo; on the real backlog, `git revert <migration commit>` restores the markdown files exactly and removes the stop file |
| B23 | an item is unbound that should not be (a team name spelled differently) | the dry run lists every unbinding before anything is written | as B22 |
| B24 | `--ask` writes a partial answer set | the answers are written at the end in one commit, and the end of input writes nothing (chapter 06 section 2.2) | as B22 |
| B25 | setup removes a file a person put in .backlog/team-templates | stated in chapter 01 section 1.2 and in the message; templates are copied, never edited in place | none |
| B26 | setup refuses to run on a markdown backlog because of the B06 stop | chapter 06 section 2 lists setup among the commands that run on a markdown backlog; a test runs setup on a markdown fixture | none |
| B27 | a deleted module is still imported by a user command | a search for every import of each module before deletion; the full suite | none |
| B28 | a user command depended on a translated status word | the status words of user items are stored as typed (decision D-19); the tests of B06 already read stored words | none |
| B29 | a document still describes the old behaviour | .agents/test/commands-documented.test.js, .agents/test/skill-commands.test.js and .agents/test/team-spelling-docs.test.js; the AGENTS.md rule that a review returns CHANGES for it | none |

## 2. Points found while planning (for the lead)

1. **Setup on a markdown backlog: settled by the design.** Chapter 06 section 2 now lists `backlog setup` among the commands that run on a
   markdown backlog, because it reads no item and ruling R25 makes it recommend the migration there; B26 implements it.
2. **The four variables the ruling's list missed: settled by the design.** Chapter 01 section 5 lists all fourteen variables the CLI owns,
   with RUN_HOOK, RUN_LOCK_HELD, REVIEW_STALE_SECONDS and TEST_SELF prefixed; B01 renames them. At the cut-over any program set as the run
   hook is named in SMOOTH_BACKLOG_CLI_RUN_HOOK (`01-landing-strategy.md` step 4).
3. **Pop after lost races: the design contradicts itself.** Chapter 04 section 4 says pop "after three attempts ... ends with exit 1",
   while section 6 says every team command keeps trying for at most half of the clone lock's time budget and then ends with exit 3, "exit 1
   for pop". The plan follows section 6 for every team command, pop included (B15); section 4's sentence should be aligned when the design
   is next revised.
4. **Backlog item 150's title** names a team_templates key; the design has no such key: setup copies to the fixed folder
   .backlog/team-templates/ (chapter 01 section 1.2). B25 implements the design; the item's title should be aligned with it.
5. **A folder without team items migrates without a team file: settled by the design.** Chapter 06 sections 3 and 5 let such a folder
   migrate with no file at the resolved location; the cut-over writes no placeholder file (`01-landing-strategy.md` step 4).
6. **The cases move into the test fixtures.** From B08 the tests read .agents/test/fixtures/team-rules/rule-cases.json and the templates
   in templates/teams/, not the plan folder (the plan moves to completed/ at the end). The design's copies stay as the record of the design;
   a later change of a case is made in the test copy by the batch that implements it.
7. **The proof commands on the engine branch.** The lead's own test scripts change into the working branch's checkout before they run, so
   for the engine branch the commands of `00-priority-order.md` section 1 are typed in the engine worktree; a log written by those scripts
   proves the working branch, not the engine.
8. **The guard command changes at B01.** From B01 on the CLI's guard test reads SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST; every instruction
   that names the old variable for the guard is updated with B01. The repository's pre-push hook is not part of the CLI and keeps its own
   setting.
9. **Review D's count of the tests: checked, with one correction.** The totals (75 files, 819 declarations, 1135 tests at run time) and
   the team-behaviour, help and removed-form groups hold exactly; 4 declarations review D gave to the root configuration file use
   `backlog move --to-repository`; the markdown-item and variable groups depend on where the edge of "depends on the format" is drawn, and
   the plan takes review D's larger markdown figure as the upper bound (`02-bdd-plan.md` section 3). Six files review D marks for deletion
   are rewritten instead, because their subject stays (the same section).

## 3. If the owner chooses another option, these batches change

Context: `../design/decisions.md` holds seven owner questions, labelled "2026-11-09 round 12, question 1" to "question 7", each applied
provisionally to the design with the lead's recommendation. The batches below implement the provisional option and cite the label. If the
owner answers a question with another option, the design files that question lists change first, and then these batches, before the
cut-over; no batch outside the list changes. The two owner choices of this plan (section 4) are included at the end.

| question | provisional option | batches that implement it | batches that change under another option, and how |
|---|---|---|---|
| 2026-11-09 round 12, question 1: what the repository input of a team command means | A: the input defines the repository acted on | B02, B11, B12, B21, B22 | option B (remove the input): B12 drops the `--repository` flag and the variable SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY (B01's list loses it), B02 drops step 0 of the resolution, B11 drops the per-user SHA for another repository, B21 and B22 drop the other-repository case; the cut-over changes every consumer that sets the variable |
| 2026-11-09 round 12, question 2: what a team command publishes when another agent published first | A: drop only the command's own commit, then pull and push as today | B15 | option B (publish only the command's own commit): B15 gains its own publication code for team commands and its two-clone tests change; user commands (B04) are not touched |
| 2026-11-09 round 12, question 3: a duplicate item number after two code branches are merged | A: renumber only items without a team | B04, B12, B13 | option B (renumber the newer item either way): B04 also renumbers team items and rewrites every `item` and `items` field of the team's definition, so it needs the definition and moves after B11; B12 and B13 drop the stop. Option C (never renumber; stop every command): B04 drops the renumbering, B12 reports every duplicate as an error, B13's stop moves into the load of every command (B06) |
| 2026-11-09 round 12, question 4: when one team's entry in the team file is broken | B: validity per team | B11, B12 | option A (the whole file): B11 refuses every team when any entry fails, B12's exit code follows the whole file; their tests of per-team validity change |
| 2026-11-09 round 12, question 5: which team commands take `--show-all` | A: query, validate and migrate; refused elsewhere and with `--team` | B12, B16, B22 | option B (`--team` wins): B12 drops the refusal of the combination (case R14-07 and its text); B16 and B22 unchanged |
| 2026-11-09 round 12, question 6: where the team file is when the repository has no backlog configuration | A: a backlog found any way counts as defined | B02, B11 | option B (only an explicit key counts): B02's step 2 reads the key only, B11 creates .backlog/config.json to hold the SHA; B04's staging is unchanged (the configuration is never staged by a writing command) |
| 2026-11-09 round 12, question 7: protecting a migrated folder from older releases | A: the stop file and schema version 2 | B06, B22 | option B (nothing): B06 drops the ignored file name, B22 writes no stop file and keeps the schema number; `01-landing-strategy.md` fact 8 and the rollback after step 7 lose their protection |
| 2026-11-10 round 13, question 1 (section 4): where the engine work is committed before the cut-over | A: an engine branch created by the owner | none (the landing only) | option B: no batch changes; `01-landing-strategy.md` sections 3 to 5 change. Option C: the order of `00-priority-order.md` changes (section 4 below) |
| 2026-11-10 round 13, question 2 (section 4): which folders migrate in the cut-over window | B: only the folders in use | none (the landing only) | option A: no batch changes; `01-landing-strategy.md` step 5 migrates every folder |

## 4. Owner choices of the implementation plan

Context: two points of the plan itself, not of the design, change what the owner's agents see and are the owner's to choose. Both are
planned provisionally with the recommendation, so the plan is complete as it stands; each lists what changes under another option. Neither
repeats a question of `../design/decisions.md`.

### 2026-11-10 round 13, question 1: where the engine work is committed and pushed before the cut-over

Scenario: an implementing agent finishes batch B01 (every environment variable renamed) and must commit and push it at the end of its turn.
On the shared machine the `backlog` command is installed from the latest commit of the working branch `simplify/pr3-review`, and an agent
session there runs `backlog team pop --team web --agent member-1` a minute later.

The problem. The installed CLI is the HEAD of the working branch's checkout: the lead's commit procedure commits there and installs that
commit at once. Nine of the 29 batches change what the agents see (renamed variables, JSON item files, new team command lines, hidden team
items, removed commands), so B01 committed on the working branch would leave that session without its team and agent the moment it is
committed, long before the migration and the new team files exist. The work must be pushed at the end of every turn, but the repository's
pre-push hook refuses an agent push that creates a branch on the remote, so `git push origin team-rules-engine` from an agent is refused.

The implementation pattern. The hazard is decided in two places outside the CLI: the installation step installs the HEAD of the working
branch's checkout, and the pre-push hook refuses a new remote branch. The CLI code is the same under every option; only the branch, the
worktree, the order of the batches and the moment of installation differ.

- **Option A: an engine branch created on the remote by the owner.** The owner pushes the branch `team-rules-engine` once (from the
  current HEAD of `simplify/pr3-review`), and every batch is committed in a separate worktree on that branch with plain git and pushed there
  at the end of its turn. The working branch stays installed and keeps receiving plans, reviews and urgent fixes; the engine branch merges
  it in at the start of each batch, and the cut-over merges the engine branch back in one step. The cost is one owner action and a merge
  per batch; nothing of the engine reaches the agents before the cut-over, including the fix of number reuse.
- **Option B: the batches go on the working branch, with the installation pinned.** The installation step is changed to install a fixed
  commit (the last one before the engine) instead of the HEAD, and the batches are committed on `simplify/pr3-review` like everything
  else. No branch is created and the history stays linear. It breaks the owner's rule that the latest commit of the active branch runs on
  the shared machine, a pin is easy to forget at the cut-over, and an urgent fix to the installed CLI would then need a second branch anyway.
- **Option C: the non-breaking batches are installed as they land; only the breaking ones wait on an engine branch.** This is review D's
  staged landing (review D section 5): the number counter and publication (B03, B04), the seam (B05), the evaluator modules and the checks
  (B07 to B11), `backlog team validate` (B12), the own-folder fixes without the removal of `move --to-repository` (part of B21) and the
  setup templates (B25) are committed on the working branch and installed at once; the rest waits for one cut-over. The agents gain the
  fix of number reuse and the validation of the new team files weeks earlier, and the final cut-over is smaller. The order of the batches
  changes (those batches move before B01 and are written with today's variable names, then renamed by B01), B21 splits in two, and each
  installed batch must be proven harmless to today's team commands, which also run on that build.

Recommendation: option A, applied provisionally. It is the only option that keeps both owner rules (the active branch runs live; every
turn is pushed) without proving each batch harmless to the running agents, and it needs a single owner action.

What changes under another option: option B changes `01-landing-strategy.md` sections 3 to 5 (the pinned installation and its removal at
the cut-over) and no batch. Option C changes the order and the dependencies of `00-priority-order.md` (the batches named above move to the
front; B21 splits into a non-breaking and a breaking part), the breaking count of `01-landing-strategy.md` section 2 (unchanged: the same
nine), and adds a check per installed batch that today's team commands still pass.

### 2026-11-10 round 13, question 2: which backlog folders are migrated in the cut-over window

Scenario: the cut-over has installed the engine build. In a checkout of a repository whose folder of the shared backlog is not migrated, a
person runs `backlog list`; the command stops with exit 2 and "the items of <owner>/<name> are markdown files; run backlog team migrate
once to convert every item to JSON".

The problem. The shared backlog repository holds the folders of several repositories. Under ruling R24 each folder is migrated on its own,
by `backlog team migrate --show-all` run in a checkout of that folder's repository (a folder without team items needs no team file).
Until a folder is migrated, every command of the new build run for that repository stops as above. Some folders belong to repositories in
which no agent works now, and some of those repositories may not be checked out on the shared machine.

The implementation pattern. The migration is per folder and is recorded in each repository's .backlog/config.json (`migrated_at`,
`migrated_by_version`, ruling R25); `backlog setup` recommends it in any repository whose folder is not migrated. Nothing in the CLI changes
between the options; they differ in which folders the lead migrates in the window and which are left for later.

- **Option A: every folder in the window.** The lead migrates every folder of the shared backlog during the cut-over, checking out each
  repository that is not checked out yet. After the window no repository can surprise anyone with the markdown stop. The window grows by
  one migration per folder (the rehearsal measures it), and the lead commits the record in every repository, also in repositories nobody
  works in now.
- **Option B: only the folders in use; the others when next used.** In the window the lead migrates the CLI repo's own folder, every
  folder with team items and every folder of a repository an agent session works in; the rest stay markdown until someone next runs a
  command there, sees the stop text and runs the migration (setup's report says the same). The window stays short and no idle repository
  is touched. A person returning to an idle repository meets one refused command and one migration, which the rehearsal has already proven
  to succeed for that folder.

Recommendation: option B, applied provisionally. The rehearsal of `01-landing-strategy.md` step 1 runs the migration on a copy of every
folder, so the later migrations are known to work; the window stays as short as the agents' downtime allows; and ruling R24 makes each
folder independent, so a folder left in markdown affects only its own repository.

What changes under another option: option A changes `01-landing-strategy.md` step 5 (every folder, with the checkouts it needs) and the
length of the window; no batch changes.
