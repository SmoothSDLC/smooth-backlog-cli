# Team rules engine: risks, rollback and open items

Context: `00-priority-order.md` orders the work in 29 batches, `01-landing-strategy.md` keeps them off the installed CLI until one
cut-over, and `02-bdd-plan.md` maps every scenario. This file gives, per batch, what can go wrong and how the batch is undone; then the
points found while planning that the lead or the second review settles (with the lead's decision and its logic where one was needed); and
last the decisions that only the owner can take.

## 1. Risks and rollback per batch

Context: before the cut-over every batch lives only on the engine branch, which is never deployed (`01-landing-strategy.md` section 3), so
the rollback of any batch is `git revert <batch commit>` on the engine branch, pushed; no consumer ever saw it. The column "rollback" adds
only what that revert does not cover. After the cut-over the rollback is the one of `01-landing-strategy.md` section 5.

| batch | risk | how the plan meets it | rollback beyond the revert |
|---|---|---|---|
| B01 | a variable read in a place the inventory missed keeps its old name, so a session silently loses its team or agent | the new test greps src/ and bin/ for every unprefixed name; four names the ruling's inventory missed are already added | none |
| B02 | the resolution reads a relative `teams_file` against the wrong folder | cases R22-01 to R22-05 cover each branch of the order | none |
| B03 | reading the history of a large backlog on every allocation is slow | the scan is cached per clone (last scanned commit and maximum per folder, chapter 05 section 2); the test measures a folder with a long history | delete the cache files in the clone's state folder |
| B04 | a renumbering after a rebase misses a reference inside a body or a field | today's remapLocal already rewrites file name, number, slug, heading and references; the tests check each | none |
| B05 | a read path bypasses the new module and B06 then misses it | the batch proves no test changes; the B06 search for `.md` in src/ must find only the module and the migration | none |
| B06 | the largest batch: a test fixture or a step reads `.md` files; the old team code still reads items in memory | the in-memory shape of an item stays (envelope and fields merged), only the file text changes; a second agent reviews before the commit | none |
| B07 | the matcher accepts a construct it then runs wrongly | the subset is closed and validate names the first unsupported construct (case VAL-20); the cases compare with expected matches | none |
| B08 | the port drifts from the spike, which every case was proven on | the cases are the oracle: all `new` and `update` cases must pass before the commit | none |
| B09 | pop offers a step that then fails, or offers one item twice | case INL-01; the pop cases of every template | none |
| B10 | a finding without the fix text, or a false shadowing error that blocks a valid file | cases VAL-01 to VAL-21 and the five templates validate clean | none |
| B11 | the 24-hour copy hides an edit, so a lead believes a change is live | stated behaviour of ruling R21; the lead's habit of chapter 01 section 4 (validate, commit the file with its SHA) makes a pull read it at once | delete the per-user record files of the team file |
| B12 | the router refuses a word a later batch needs, or the old routes break before their replacement | define and workflow keep their routes until B27; migrate answers "not yet available" until B22 | none |
| B13 | a refused `new` consumes a number | the number is taken only after the rule allows the step (chapter 04 section 2); a test checks the counter after a refusal | none |
| B14 | deleting about 3000 lines of old tests also deletes a behaviour that the templates do not cover | each deleted file is checked against coverage.tsv: every test row is BAKE-IN (a case), LAZY-LOAD, SKIP with a reason, or deferred; a second agent reviews the deletions | none |
| B15 | the re-run loops or starves one writer | the random growing wait and the time budget of chapter 04 section 6, measured in chapter 04 section 7; the five two-clone scenarios | none |
| B16 | `backlog team update --help` reads a broken team file and fails | help with an unreadable team file prints the generic form; a test covers it | none |
| B17 | a read path still shows a team item (a count, a dependency list, a history) | the test lists every reading command of chapter 04 section 8 with a team item present | none |
| B18 | a user change of a team item escapes the history note | the test checks the entry for every writing command | none |
| B19 | a reordering moves a team entry | the two scenarios of chapter 05 section 7 | none |
| B20 | an existing test or a script sets the team variable and then runs a user command | the B20 search over .agents/test; the consumers change at the cut-over (`01-landing-strategy.md` step 4) | none |
| B21 | removing the foreign walk lets a cycle through another folder pass | ruling R24 accepts it: no command reads another folder; validate reports an unresolved reference | none |
| B22 | a real folder holds a case the fixtures do not (an odd header, a duplicate number) | the rehearsal of `01-landing-strategy.md` step 1 runs the migration on a scratch copy of every folder before the window | in a scratch copy nothing to undo; on the real backlog, `git revert <migration commit>` restores the markdown files exactly |
| B23 | an item is unbound that should not be (a team name spelled differently) | the dry run lists every unbinding before anything is written | as B22 |
| B24 | `--ask` writes a partial answer set | the answers are written at the end in one commit, and the end of input writes nothing (chapter 06 section 2.2) | as B22 |
| B25 | setup removes a file a person put in .backlog/team-templates | stated in chapter 01 section 1.2 and in the message; templates are copied, never edited in place | none |
| B26 | setup refuses to run on a markdown backlog because of the B06 stop | B26 exempts setup explicitly (section 2, point 1) | none |
| B27 | a deleted module is still imported by a user command | a search for every import of each module before deletion; the full suite | none |
| B28 | a user command depended on a translated status word | the status words of user items are stored as typed (decision D-19); the tests of B06 already read stored words | none |
| B29 | a document still describes the old behaviour | .agents/test/commands-documented.test.js, .agents/test/skill-commands.test.js and .agents/test/team-spelling-docs.test.js; the AGENTS.md rule that a review returns CHANGES for it | none |

## 2. Points found while planning (for the lead and the second review, not for the owner)

1. **Setup on a markdown backlog.** Chapter 06 section 2 lists the commands that still run on a markdown backlog (`backlog team validate`,
   `backlog team migrate`, `backlog --help`, `backlog --version`, `backlog upgrade`) and omits `backlog setup`, while ruling R25 has setup
   recommend the migration on exactly such a backlog. Lead decision in this plan, with its logic: setup runs on a markdown backlog (B26),
   because it reads no item and R25 cannot be met otherwise; the chapter's list should gain setup when the design is next revised.
2. **Variables the R20 inventory missed.** The ruling lists ten variables; src/ and bin/ read four more the CLI owns: BACKLOG_RUN_HOOK
   (the program run after every command), BACKLOG_RUN_LOCK_HELD (the lock handed from a command to its child), BACKLOG_REVIEW_STALE_SECONDS
   and BACKLOG_TEST_SELF (both read only by today's team code). Lead decision in this plan, with its logic: B01 renames all four, because
   R20 says every variable the CLI owns is prefixed and allows no alias; the two read only by the old team code disappear in B14 and B27
   anyway. Consequence for the cut-over: the process that sets the run-hook variable must set SMOOTH_BACKLOG_CLI_RUN_HOOK
   (`01-landing-strategy.md` step 4).
3. **Exit after lost races.** The review response (finding B-H2) says a team command ends with exit 3 after three lost races; chapter 04
   section 6, revised later, says it keeps trying within the clone lock's time budget. The plan follows chapter 04 (B15).
4. **Backlog item 150's title** names a team_templates key; the design has no such key: setup copies to the fixed folder
   .backlog/team-templates/ (chapter 01 section 1.2). B25 implements the design; the item's title should be aligned with it.
5. **A team file is needed even where no item has a team.** Chapter 06 section 5 stops the migration when no team file exists at the
   resolved location, also for a folder whose items have no team; such a folder needs a file holding `{}`. The cut-over writes those files
   (`01-landing-strategy.md` step 4); the second review may prefer to let such a folder migrate without a file.
6. **The cases move into the test fixtures.** From B08 the tests read .agents/test/fixtures/team-rules/rule-cases.json and the templates
   in templates/teams/, not the plan folder (the plan moves to completed/ at the end). The design's copies stay as the record of the design;
   a later change of a case is made in the test copy, and a changed design chapter from review C or D is applied there by the batch that
   cites it.
7. **The proof commands on the engine branch.** The lead's run-tests.sh and bdd.sh change into the review worktree before they run, so for
   the engine branch the commands of `00-priority-order.md` section 1 are typed in the engine worktree; a log written by either script
   proves the working branch, not the engine.
8. **The guard command changes at B01.** From B01 on the CLI's guard test reads SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST; any instruction
   that names the old variable for the guard is updated with B01. The repository's pre-push hook is not part of the CLI and keeps working
   with its default file.

## 3. Decisions for the owner

### 2026-11-10 round 13, question 1: where the engine work is committed and pushed before the cut-over

The problem. The shared machine's `backlog` command is the HEAD of the review worktree: the lead's commit script commits there and its
deployment step installs that commit at once. Nine of the 29 batches change what the agents see (renamed variables, JSON item files, new
team command lines, hidden team items, removed commands), so a batch committed through the script would break every agent session the
moment it is committed, long before the migration and the new team files exist. The work must be pushed at the end of every turn, but the
repository's pre-push hook refuses an agent push that creates a branch on the remote: `git push origin team-rules-engine` from an agent ends
with "refs/heads/team-rules-engine does not exist on the remote; no task creates a branch".

The implementation pattern. The hazard is decided in two places outside the CLI: the deployment step exports the HEAD of the review
worktree, and the pre-push hook refuses a new remote branch. The CLI code is the same under every option; only the branch, the worktree and
the moment of deployment differ.

- **Option A: an engine branch created on the remote by the owner.** The owner pushes the branch `team-rules-engine` once (from the
  current HEAD of `simplify/pr3-review`), and every batch is committed in a separate worktree on that branch with plain git and pushed there
  at the end of its turn. The review worktree keeps `simplify/pr3-review`, which stays deployed and keeps receiving plans, reviews and urgent
  fixes; the engine branch merges it in at the start of each batch, and the cut-over merges the engine branch back in one step. The cost is
  one owner action and a merge per batch, and the pull request of Task 9 is still opened from `simplify/pr3-review`.
- **Option B: the batches go on the working branch, with the deployment pinned.** The deployment step is changed to install a fixed
  commit (the last one before the engine) instead of the HEAD, and the batches are committed on `simplify/pr3-review` like everything
  else. No branch is created and the history stays linear. It breaks the owner's rule that the latest commit of the active branch runs on the
  shared machine, a pin is easy to forget at the cut-over, and an urgent fix to the installed CLI would then need a second branch anyway.
- **Option C: a local engine branch, pushed only at the cut-over.** The batches are committed on a local branch that no push reaches
  until the cut-over, when the merged result is pushed with the working branch. No owner action and no change of the deployment are needed.
  It breaks the owner's rule that every turn ends with a push and that a file counts as delivered only when pushed; weeks of work would live
  on one disk, and no reviewer outside the machine could read a batch.

Recommendation: option A. It is the only option that keeps both owner rules (the active branch runs live; every turn is pushed), it
needs a single owner action, and the merge of the working branch into the engine branch is the routine that `01-landing-strategy.md`
already plans.

### 2026-11-10 round 13, question 2: which backlog folders are migrated in the cut-over window

The problem. The shared backlog repository holds the folders of several repositories. Under ruling R24 each folder is migrated on its
own, by `backlog team migrate --show-all` run in a checkout of that folder's repository, with a team file at the location chapter 01
section 1.1 resolves (the owner's team entry where items have a team, `{}` elsewhere). Until a folder is migrated, every command of the new
build run in that repository stops, for example `backlog list` in a repository whose folder is not migrated prints
"the items of <owner>/<name> are markdown files; run backlog team migrate once to convert every item to JSON" and exits 2. Some folders
belong to repositories in which no agent works now, and some of those repositories may not be checked out on the shared machine.

The implementation pattern. The migration is per folder and is recorded in each repository's .backlog/config.json (`migrated_at`,
`migrated_by_version`, ruling R25); `backlog setup` recommends it in any repository whose folder is not migrated. Nothing in the CLI
changes between the options; they differ in which folders the lead migrates in the window and which are left for later.

- **Option A: every folder in the window.** The lead migrates every folder of the shared backlog during the cut-over, checking out each
  repository that is not checked out yet. After the window no repository can surprise anyone with the markdown stop. The window grows by one
  migration per folder (the rehearsal measures it), and the lead must write a team file, at least `{}`, in every folder and commit the
  record in every repository, also in repositories nobody works in now.
- **Option B: only the folders in use; the others when next used.** In the window the lead migrates the CLI repo's own folder, every
  folder with team items and every folder of a repository an agent session works in; the rest stay markdown until someone next runs a
  command there, sees the stop text and runs the migration (setup's advice says the same). The window stays short and no idle repository is
  touched. A person returning to an idle repository meets one refused command and one migration, which the rehearsal has already proven to
  succeed for that folder.

Recommendation: option B. The rehearsal of `01-landing-strategy.md` step 1 runs the migration on a copy of every folder, so the later
migrations are known to work; the window stays as short as the agents' downtime allows; and ruling R24 makes each folder independent, so a
folder left in markdown affects only its own repository.
