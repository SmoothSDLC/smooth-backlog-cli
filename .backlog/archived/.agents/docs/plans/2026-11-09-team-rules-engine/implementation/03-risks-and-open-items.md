# Team rules engine: risks, rollback and open items

Context: `00-priority-order.md` orders the work in 29 batches, `01-landing-strategy.md` keeps them off the installed CLI until one
cut-over, and `02-bdd-plan.md` maps every scenario. This file gives, per batch, what can go wrong and how the batch is undone (section 1);
the points found while planning, for the lead (section 2); which batches carry each answer to the design questions of
`../design/decisions.md` (section 3); and, last, the two choices of the implementation plan itself (section 4). The design's own answers
are in `../design/decisions.md` only and are not repeated here.

## 1. Risks and rollback per batch

Context: before the cut-over no batch is installed (`01-landing-strategy.md` section 3), so
the rollback of any batch is `git revert <batch commit>` on the working branch, pushed; no consumer ever saw it. The column "rollback" adds
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
| B13 | a refused `new` consumes a number | the number is taken only after the rule allows the step (chapter 04 section 2) | none |
| B14 | deleting about 3000 lines of old tests also deletes a behaviour that the templates do not cover | each deleted file is checked against coverage.tsv: every test row is BAKE-IN (a case), LAZY-LOAD, SKIP with a reason, or deferred; a second agent reviews the deletions | none |
| B15 | the re-run loops, starves one writer, drops a person's work or publishes it; the rebase of the local branch after the push fails | only the command's own commit is dropped and only that commit is pushed, built on the upstream branch without touching the working tree; a conflict publishes nothing and stops with exit 3; the wait grows at random and stops at half of the lock budget (chapter 04 sections 6 and 7); the two-clone scenarios include a person's unpushed commit and uncommitted change | none |
| B16 | help reads a broken team file and fails | help reads nothing (chapter 04 section 1); a test runs `backlog team update --help` with a broken team file | none |
| B17 | a read path still shows a team item (a count, a dependency list, a history, the held section of changes) | the test lists every reading command of chapter 04 section 8 with a team item present | none |
| B18 | a user change of a team item escapes the history note | the test checks the entry for every writing command | none |
| B19 | a reordering or a clean moves or drops a team entry | the three scenarios of `02-bdd-plan.md` section 2.3 | none |
| B20 | an existing test or a script sets the team variable and then runs a user command | the B20 search over .agents/test; the consumers change at the cut-over (`01-landing-strategy.md` step 4) | none |
| B21 | removing the foreign walk lets a cycle through another folder pass; the narrower guards miss a conflict that matters | ruling R24 accepts it: no command reads another folder; validate reports an unresolved reference; the guards still cover every path of the own folder | none |
| B22 | a real folder holds a case the fixtures do not; an older release is run on a migrated folder | the rehearsal of `01-landing-strategy.md` step 1 runs the migration on a scratch copy of every folder; every installation is upgraded before a folder is migrated (`01-landing-strategy.md` fact 8), since nothing is built for older releases | in a scratch copy nothing to undo; on the real backlog, `git revert <migration commit>` restores the markdown files exactly |
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
3. **Pop after lost races: settled in the design.** Chapter 04 section 4 said pop "after three attempts ... ends with exit 1", while
   section 6 says every team command keeps trying for at most half of the clone lock's time budget and then ends with exit 3, "exit 1
   for pop". Section 4 now names the time budget of section 6; the plan follows section 6 for every team command, pop included (B15).
4. **Backlog item 150 is not part of batch B25.** It is the owner's order of 2026-11-08: a template-location key in the configuration of
   every repository and branch, read by skills and people to find the owner's team template. The CLI never reads a template (R5), so the
   design has no such key and B25 (setup copies the generic templates, R23) is a different matter. The item stands as written and is
   listed with the work outside this repository (`00-priority-order.md` section 4, X1b).
5. **A folder without team items migrates without a team file: settled by the design.** Chapter 06 sections 3 and 5 let such a folder
   migrate with no file at the resolved location; the cut-over writes no placeholder file (`01-landing-strategy.md` step 4).
6. **The cases move into the test fixtures.** From B08 the tests read .agents/test/fixtures/team-rules/rule-cases.json and the templates
   in templates/teams/, not the plan folder (the plan moves to completed/ at the end). The design's copies stay as the record of the design;
   a later change of a case is made in the test copy by the batch that implements it.
7. **The proof commands in a batch's worktree.** The lead's own test scripts change into the working branch's checkout before they run, so
   for a batch the commands of `00-priority-order.md` section 1 are typed in that batch's worktree; a log written by those scripts
   proves the working branch's checkout, not the batch's worktree.
8. **The guard command changes at B01.** From B01 on the CLI's guard test reads SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST; every instruction
   that names the old variable for the guard is updated with B01. The repository's pre-push hook is not part of the CLI and keeps its own
   setting.
9. **Review D's count of the tests: checked, with one correction.** The totals (75 files, 819 declarations, 1135 tests at run time) and
   the team-behaviour, help and removed-form groups hold exactly; 4 declarations review D gave to the root configuration file use
   `backlog move --to-repository`; the markdown-item and variable groups depend on where the edge of "depends on the format" is drawn, and
   the plan takes review D's larger markdown figure as the upper bound (`02-bdd-plan.md` section 3). Six files review D marks for deletion
   are rewritten instead, because their subject stays (the same section).

## 3. The answers to the design questions and the batches that carry them

Context: `../design/decisions.md` holds the seven questions labelled "2026-11-09 round 12, question 1" to "question 7". All are closed
(2026-11-09); the table names the answer and the batches that implement it. An answer that the owner later changes is changed in the
design first and then in exactly these batches.

| question | answer | batches that implement it |
|---|---|---|
| question 1: what the repository input of a team command means | A (owner): the input defines the repository acted on | B02, B11, B12, B21, B22 |
| question 2: what a team command publishes when another agent published first | B (owner): only the command's own commit; a person's unpushed commits stay local | B15 (its own publication code for team commands; user commands, B04, are not touched) |
| question 3: a duplicate item number after two code branches are merged | outside the CLI's scope (owner): nothing is renumbered and no folder stops; a number that names two items is refused | B06 (the refusal in the item lookup); B04, B12 and B13 carry nothing for it |
| question 4: when one team's entry in the team file is broken | A (owner; R18): the whole file must be valid | B11, B12 |
| question 5: which team commands take `--show-all` | B (owner): query, validate and migrate; refused elsewhere; `--team` decides when both are given | B12, B16, B22 |
| question 6: where the team file is when the repository has no backlog configuration | ruling R22 as written: only the configuration defines it; the SHA goes into .backlog/config.json | B02, B11 |
| question 7: protecting a migrated folder from older releases | nothing is built (R18 and the rule of 2026-11-07, as read by the lead) | none; B06 and B22 carry no marker and no schema number |

## 4. Owner choices of the implementation plan

Context: two points of the plan itself, not of the design. Both are closed.

### 2026-11-10 round 13, question 1: where the engine work is committed and pushed before the cut-over

Answer (owner, 2026-11-09): every batch is committed on the working branch and pushed after every commit; the deployment and the live
testing happen after the implementation is complete, all the tests pass and the reviews are done. The lead orchestrates agents that
implement, test, validate and review, several at once, in worktrees that are merged back into the working branch and removed. The plan
that follows from it is `01-landing-strategy.md` section 3 and `00-priority-order.md` section 2.1. The options considered before the
answer (a separate branch on the remote, a pinned installation, a staged installation) are not taken.

### 2026-11-10 round 13, question 2: which backlog folders are migrated in the cut-over window

Taken by the lead as procedural (owner instruction of 2026-11-06), following rulings R24 and R25: option B below.

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

Taken by the lead: option B. The rehearsal of `01-landing-strategy.md` step 1 runs the migration on a copy of every
folder, so the later migrations are known to work; the window stays as short as the agents' downtime allows; and ruling R24 makes each
folder independent, so a folder left in markdown affects only its own repository.

What changes under another option: option A changes `01-landing-strategy.md` step 5 (every folder, with the checkouts it needs) and the
length of the window; no batch changes.
