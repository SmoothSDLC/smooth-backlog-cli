# Team rules engine: how the work lands without breaking the installed CLI

Context: the owner's agents use the CLI all day on a shared machine, and that installed CLI is built from the working branch of this
repository (`simplify/pr3-review`) at every commit the lead makes. The engine work of `00-priority-order.md` changes the item format,
renames every environment variable, removes commands and changes who a team command acts as. This file states the facts of the deployment
(checked on 2026-11-10), what each breaking batch would break, the landing proposal, the cut-over steps with who does what, and the
rollback. It is planned with the provisional answers of the two owner choices of the implementation plan, "2026-11-10 round 13,
question 1" (where the engine work is committed) and "question 2" (which folders migrate in the window), written in full at the end of
`03-risks-and-open-items.md`.

## 1. Facts of the deployment (checked 2026-11-10)

1. The `backlog` command on the shared machine is a small wrapper that starts the CLI from one installed package folder.
2. The lead commits through its own commit procedure, kept outside the repository. It commits in the checkout of the working branch and
   then installs the committed HEAD of that checkout (`git archive` of bin, src, templates, package.json and the public documents) in
   place of the installed package folder. The owner's rule behind it: the shared machine runs the latest commit of the active branch at all
   times.
3. Nothing else installs the CLI on that machine: no scheduled job does. A commit made with plain git in another worktree is not
   installed. What is installed is whatever HEAD the working branch's checkout has when the procedure runs, whatever branch that is.
4. `backlog --version` prints the development placeholder `0.0.0-development` for every build, so it cannot tell builds apart; only the
   commit the procedure reports names the build.
5. The repository's pre-push hook refuses a push that creates a branch on the remote and a push whose commits contain an entry of the
   private deny list. The hook is not part of the CLI and reads its own setting; after batch B01 the CLI's guard test reads
   SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST.
6. The shared backlog clone is a full clone, not shallow, so the refusal of batch B03 on a shallow clone does not touch it.
7. The shared backlog repository holds the folders of several repositories. Under ruling R24 each folder is migrated on its own, from a
   checkout of its own repository (or with the repository input naming it, design question "2026-11-09 round 12, question 1"), and each
   stops every command of the new build until it is migrated (chapter 06 section 2). A folder in which no item has a team migrates without a
   team file (chapter 06 section 3). Today's team file sits at the root of the backlog repository in today's shape; after the cut-over
   nothing reads it (ruling R22): a team's entry must be at the location chapter 01 section 1.1 resolves for each repository folder that has
   team items.
8. Installations on other machines update themselves with the package manager and refuse a release whose `backlogSchemaVersion` differs;
   batch B22 sets it to 2 (design question "2026-11-09 round 12, question 7"), so they stay on the older release until updated by hand, and
   the stop file the migration writes makes that older release refuse a migrated folder instead of reusing numbers.
9. The lead's own test scripts change into the working branch's checkout before they run, so they test the working branch only.

## 2. What would break, batch by batch

Context: nine of the 29 batches change what an existing consumer sees (the "breaking" column of `00-priority-order.md`). Committed through
the lead's commit procedure, each would reach every agent at once.

| batch | what breaks for a consumer of the installed CLI |
|---|---|
| B01 | every session that sets an unprefixed variable (TEAM_NAME, BACKLOG_AGENT, BACKLOG_SESSION, TEAM_REPOSITORY, TEAM_BRANCH, TEAM_LEAD, BACKLOG_HOME, BACKLOG_ORIGIN_URL, BACKLOG_LOCK_WAIT_MS, BACKLOG_RUN_HOOK) is no longer seen: no team, no agent, the default backlog location, no run hook (consumer rows CON-01, CON-05, CON-06, CON-10, CON-22 of reference/consumers.tsv, and any program set as the run hook) |
| B06 | every command stops on every folder still holding markdown items, until that folder is migrated, and the migration command arrives only with B22 |
| B13, B14 | today's team command lines (`backlog team update <item> --claim`, `--start-review`, `--review complete`, `--handoff`, `--by`, `--lead`, ...) are refused; a team command needs the team file in the new shape at its new location; the agent comes only from the flag or the variable, never from the configuration's user (CON-03, CON-04, CON-09, CON-10, CON-14) |
| B17 | `backlog list --json` and every user read no longer show team items (CON-02, CON-12, CON-15, CON-17, CON-18, CON-20, CON-21) |
| B20 | a session that sets the team variable can no longer run any user command, `backlog setup` included |
| B21 | `backlog move <item> --to-repository <owner/name>` is gone |
| B27 | `backlog team define` and `backlog team workflow --file` are gone (CON-11, CON-13, CON-19) |
| B28 | a repository that still has only the root configuration file of earlier builds stops every command |

No breaking batch can be gated off: a gate would keep the old behaviour readable beside the new one, which ruling R18 (no backwards
compatibility) and ruling R20 (no alias for the old variable names) forbid, and the format cut-over of B06 cannot be half on.

## 3. The landing proposal (provisional answer A of round 13, question 1)

Context: the hazard comes from one fact: the installed CLI is the HEAD of the working branch's checkout. Work committed elsewhere is not
installed. The proposal uses that fact instead of changing the installation.

1. **An engine branch, in its own worktree, never installed.** The batches are committed on a branch `team-rules-engine` of this
   repository, in a worktree of its own, with plain `git commit` and the session's attribution lines, never through the lead's commit
   procedure. The engine branch is never checked out in the working branch's checkout before the cut-over. The proofs of
   `00-priority-order.md` section 1 are typed in the engine worktree.
2. **The branch on the remote is created by the owner.** The pre-push hook refuses an agent push that creates a branch (fact 5), and the
   owner's rule is that every turn ends with a push, so the owner creates `team-rules-engine` on the remote once. After that every batch is
   pushed there at the end of its turn.
3. **The working branch keeps its role.** Plan documents, review logs and urgent fixes to the installed CLI keep going to the working
   branch and stay installed. The engine branch takes them in with `git merge simplify/pr3-review` (never a rebase of pushed commits, never
   a force push) at the start of each batch.
4. **One controlled cut-over** brings the engine branch into the working branch, installs it, migrates the folders in use and updates
   every consumer in one window (section 4). Until then the installed CLI is unchanged.

The other options of round 13, question 1 (the deployment pinned to a commit while the batches go on the working branch; the non-breaking
batches installed as they land and only the breaking ones held back) and what each would change are in `03-risks-and-open-items.md`
section 4.

## 4. The cut-over

Context: the cut-over is the one moment the installed CLI changes from the markdown build to the engine build. It starts only when every
batch B01 to B29 is green on the engine branch and the owner's team file (backlog item 149) and skills (item 151) are ready in the new
shape. The roles: **the owner** opens and closes the window; **the lead** runs the steps; **a reviewing agent** checks each step's output
against this list; the implementing agents are idle during the window.

| step | who | what |
|---|---|---|
| 1. Rehearsal (the day before) | the lead | Make a scratch copy of the shared backlog repository (`git clone --mirror <backlog repository URL> <scratch>/backlog.git`, then `git clone <scratch>/backlog.git <scratch>/backlog`), so that pushes go to the scratch copy. In a checkout of each repository whose folder is in the backlog, with SMOOTH_BACKLOG_CLI_HOME set to the scratch clone, run `node <engine checkout>/bin/backlog.js team migrate --show-all --dry-run`, then `node <engine checkout>/bin/backlog.js team migrate --show-all`. Every folder must convert, also the folders left for later by round 13, question 2; every stop of chapter 06 section 5 is fixed in the real backlog in markdown before the window. Run the smoke checks of step 6 against the scratch copy. |
| 2. Open the window | the owner | Stop every agent session that uses the installed CLI, and the scheduled runs that call it, so that no command runs between the installation and the migration. |
| 3. Install | the lead | In the working branch's checkout: `git merge --ff-only team-rules-engine` (or `git merge team-rules-engine` when the working branch moved since the last merge), then run the installation step of the commit procedure alone, and check that it reports the merged commit. Push the working branch. |
| 4. Team files and consumers | the lead | Write each team's entry at its resolved location (the owner's team entry of item 149; a folder without team items needs no file), validate each with `backlog team validate --team <team>`, commit the file with its `teams_file_sha`. Apply the consumer changes of reference/consumers.tsv (item 151): the prefixed variable names, `backlog team query --json` instead of `backlog list --json` for team items, the removed commands, the run-hook variable of any program set as the run hook. |
| 5. Migrate | the lead | Per repository folder, in that repository's checkout: `backlog team migrate --show-all --dry-run`, then `backlog team migrate --show-all`, then commit .backlog/config.json (the migration record and the SHA). First the CLI repo's own folder, then the folders with team items, then the folders of repositories an agent session works in; the other folders are migrated when next used (provisional answer B of round 13, question 2). |
| 6. Smoke checks | the lead, checked by the reviewing agent | In the CLI repo's checkout: `backlog --version`, `backlog list`, `backlog team validate --show-all`, `backlog team query --team <team>`, `backlog team pop --team <team> --agent <member> --dry-run --json`, and one `backlog new --name "cut-over check"` followed by `backlog archive <its number> --force`. Each must succeed with the expected output. |
| 7. Close the window | the owner | Restart the agent sessions. The first real session of the owner's team is watched until its first pop and its first step succeed. |

## 5. Rollback

Context: the cut-over changes three things that can be undone separately: the installed build (the working branch), the item files (one
migration commit per folder in the backlog repository) and the consumers (their own repositories). Nothing is ever force-pushed.

- **Before step 7 (no agent has written a JSON item).** Revert the merge on the working branch (`git revert -m 1 <merge commit>`), push, run
  the installation step; revert each folder's migration commit in the backlog repository (`git revert <migration commit>`), which restores
  the markdown files exactly and removes the stop file and numbers.json with them, and push; revert the consumer commits in their
  repositories. The installed CLI and the data are then as before the window.
- **After step 7.** Agents have written JSON items; reverting a migration commit would then conflict or drop their writes. The rollback
  becomes a fix forward on the working branch, and a folder whose items are wrong is repaired by its team with its own steps or by the
  owner with user commands and `--show-all`. An older build installed by mistake meanwhile stops on the stop file of every migrated folder
  instead of handing out numbers again (fact 8). This is why the window closes only after the smoke checks.
- **Per batch, before the cut-over.** A batch that turns out wrong is reverted on the engine branch with `git revert <batch commit>`; it
  was never installed, so no consumer saw it.
