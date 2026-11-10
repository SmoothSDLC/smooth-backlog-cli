# Team rules engine: how the work lands without breaking the installed CLI

Context: the owner's agents use the CLI all day on a shared machine, and that installed CLI is built from the working branch of this
repository (`simplify/pr3-review`) at every commit the lead makes. The engine work of `00-priority-order.md` changes the item format,
renames every environment variable, removes commands and changes who a team command acts as. This file states the facts of the deployment
(checked on 2026-11-10), what each breaking batch would break, the landing proposal, the cut-over steps with who does what, and the
rollback. The decision it needs from the owner is `03-risks-and-open-items.md`, round 13, question 1.

## 1. Facts of the deployment (checked 2026-11-10)

1. The `backlog` command on the shared machine is a small wrapper that starts the CLI from one installed package folder.
2. The lead commits with a commit script (commit.sh, kept outside the repository). It changes into the review worktree (the checkout of the
   working branch), stages every change there, commits under the fixed author of the agent team, and then runs its deployment step.
3. The deployment step (a second script beside it) exports the committed HEAD of the review worktree with `git archive` (bin, src,
   templates, package.json, README.md, COMMANDS.md, CHANGELOG.md, LICENSE, NOTICE) into a new folder, swaps it in place of the installed
   package folder, and prints the commit it installed. The rule written in that script: the shared machine runs the latest commit of the
   active branch at all times.
4. Nothing else deploys: the user's scheduled jobs and timers are empty. A commit made with plain git in another worktree is not deployed.
   What is deployed is whatever HEAD the review worktree has when the script runs, whatever branch that is.
5. `backlog --version` prints the development placeholder `0.0.0-development` for every build, so it cannot tell builds apart; only the
   deployment step's output names the commit.
6. The repository's pre-push hook refuses a push that creates a branch on the remote ("no task creates a branch") and a push whose commits
   contain an entry of the private deny list. It reads the deny-list path from BACKLOG_PRIVATE_DENYLIST, else from a file next to the git
   folder. The hook is not part of the CLI; after batch B01 the CLI's own guard test reads SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST, and the hook
   keeps working with its default file.
7. The shared backlog clone is a full clone, not shallow, so the refusal of batch B03 on a shallow clone does not touch it.
8. The shared backlog repository holds the folders of several repositories. Under ruling R24 each folder is migrated on its own, from a
   checkout of its own repository, and each stops every command of the new build until it is migrated (chapter 06 section 2). Today's team
   file sits at the root of the backlog repository in today's shape; after the cut-over nothing reads it (ruling R22): a team's entry must be
   at the location chapter 01 section 1.1 resolves for each repository folder that has team items.
9. The lead's test scripts run-tests.sh and bdd.sh change into the review worktree before they run, so they test the working branch only.

## 2. What would break, batch by batch

Context: nine of the 29 batches change what an existing consumer sees (the "breaking" column of `00-priority-order.md`). If they were
committed with the commit script, each would reach every agent at once.

| batch | what breaks for a consumer of the installed CLI |
|---|---|
| B01 | every session that sets TEAM_NAME, BACKLOG_AGENT, BACKLOG_SESSION, TEAM_REPOSITORY, TEAM_BRANCH, TEAM_LEAD, BACKLOG_HOME, BACKLOG_ORIGIN_URL, BACKLOG_LOCK_WAIT_MS or BACKLOG_RUN_HOOK is no longer seen: no team, no agent, the default backlog location, no run hook (reference/consumers.tsv rows CON-01, CON-05, CON-06, CON-10, CON-22, and the process that records command runs) |
| B06 | every command stops on every folder still holding markdown items, until that folder is migrated, and the migration command arrives only with B22 |
| B13, B14 | today's team command lines (`backlog team update <item> --claim`, `--start-review`, `--review complete`, `--handoff`, `--by`, `--lead`, ...) are refused; a team command needs the team file in the new shape at its new location; the agent comes only from the flag or the variable, never from the configuration's user (CON-03, CON-04, CON-09, CON-10, CON-14) |
| B17 | `backlog list --json` and every user read no longer show team items (CON-02, CON-12, CON-15, CON-17, CON-18, CON-20, CON-21) |
| B20 | a session that sets the team variable can no longer run any user command |
| B21 | `backlog move <item> --to-repository <owner/name>` is gone |
| B27 | `backlog team define` and `backlog team workflow --file` are gone (CON-11, CON-13, CON-19) |
| B28 | a repository that still has only the root configuration file of earlier builds stops every command |

No breaking batch can be gated off: a gate would keep the old behaviour readable beside the new one, which ruling R18 (no backwards
compatibility) and ruling R20 (no alias for the old variable names) forbid, and the format cut-over of B06 cannot be half on.

## 3. The landing proposal

Context: the hazard comes from one fact: the installed CLI is the HEAD of the review worktree. Work that is committed elsewhere is not
deployed. The proposal uses that fact instead of changing the deployment.

1. **An engine branch, in its own worktree, never deployed.** The batches are committed on a branch `team-rules-engine` of this
   repository, in a worktree of its own (for example a detached worktree turned into that branch), with plain `git commit` and the session's
   attribution lines, never with the commit script. Its HEAD is never checked out in the review worktree before the cut-over. The proofs of
   `00-priority-order.md` section 1 are typed in the engine worktree.
2. **The branch on the remote is created by the owner.** The pre-push hook refuses an agent push that creates a branch (fact 6), and the
   owner's rule is that every turn ends with a push, so the owner creates `team-rules-engine` on the remote once (round 13, question 1,
   option A). After that every batch is pushed there at the end of its turn.
3. **The working branch keeps its role.** Plan documents, review logs and urgent fixes to the installed CLI keep going to the working
   branch through the commit script and stay deployed. The engine branch takes them in with `git merge simplify/pr3-review` (never a rebase
   of pushed commits, never a force push) at the start of each batch.
4. **One controlled cut-over** brings the engine branch into the working branch, deploys it, migrates every folder and updates every
   consumer in one window (section 4). Until then the installed CLI is unchanged.

Rejected: committing the batches on the working branch with the deployment pinned to the last commit before the engine (it breaks the
owner's rule that the latest commit of the active branch runs, and a pinned deployment is easy to forget); keeping the engine branch only
on the local disk until the cut-over (it breaks the owner's rule that work is pushed at the end of every turn, and a disk loss loses the
work). Both are options of round 13, question 1.

## 4. The cut-over

Context: the cut-over is the one moment the installed CLI changes from the markdown build to the engine build. It starts only when every
batch B01 to B29 is green on the engine branch and the owner's team file (backlog item 149) and skills (item 151) are ready in the new
shape. The roles: **the owner** decides and opens and closes the window; **the lead** runs the steps; **a reviewing agent** checks each
step's output against this list; the implementing agents are idle during the window.

| step | who | what |
|---|---|---|
| 1. Rehearsal (the day before) | the lead | Make a scratch copy of the shared backlog repository (`git clone --mirror <backlog repository URL> <scratch>/backlog.git`, then `git clone <scratch>/backlog.git <scratch>/backlog`), so that pushes go to the scratch copy. In a checkout of each repository whose folder is in the backlog, with SMOOTH_BACKLOG_CLI_HOME set to the scratch clone, run `node <engine checkout>/bin/backlog.js team migrate --show-all --dry-run`, then `node <engine checkout>/bin/backlog.js team migrate --show-all`. Every folder must convert; every stop of chapter 06 section 5 (two items with one number, an unreadable header, a JSON name taken) is fixed in the real backlog in markdown before the window. Run the smoke checks of step 6 against the scratch copy. |
| 2. Open the window | the owner | Stop every agent session that uses the installed CLI, and the scheduled runs that call it, so that no command runs between the deployment and the migration. |
| 3. Deploy | the lead | In the review worktree: `git merge --ff-only team-rules-engine` (or `git merge team-rules-engine` when the working branch moved since the last merge), then run the deployment step alone, and check that its output names the merged commit. Push the working branch. |
| 4. Team files and consumers | the lead | Write each team's entry at its resolved location (the owner's team entry of item 149; `{}` for a repository folder that must migrate but has no team, since chapter 06 section 5 stops the migration when no team file exists), validate each with `backlog team validate --show-all`, commit the file with its `teams_file_sha`. Apply the consumer changes of reference/consumers.tsv (item 151): the prefixed variable names, `backlog team query --json` instead of `backlog list --json` for team items, the removed commands, the run-hook variable of the process that records command runs. |
| 5. Migrate | the lead | Per repository folder, in that repository's checkout: `backlog team migrate --show-all --dry-run`, then `backlog team migrate --show-all`, then commit .backlog/config.json (the migration record and the SHA). First the CLI repo's own folder, then the folders with team items, then the others (round 13, question 2 decides whether the others are migrated now or when next used). |
| 6. Smoke checks | the lead, checked by the reviewing agent | In the CLI repo's checkout: `backlog --version`, `backlog list`, `backlog team validate --show-all`, `backlog team query --team <team>`, `backlog team pop --team <team> --agent <member> --dry-run --json`, and one `backlog new --name "cut-over check"` followed by `backlog archive <its number>`. Each must succeed with the expected output. |
| 7. Close the window | the owner | Restart the agent sessions. The first real session of the owner's team is watched until its first pop and its first step succeed. |

## 5. Rollback

Context: the cut-over changes three things that can be undone separately: the installed build (the working branch), the item files (one
migration commit per folder in the backlog repository) and the consumers (their own repositories). Nothing is ever force-pushed.

- **Before step 7 (no agent has written a JSON item).** Revert the merge on the working branch (`git revert -m 1 <merge commit>`), push, run
  the deployment step; revert each folder's migration commit in the backlog repository (`git revert <migration commit>`), which restores the
  markdown files exactly, and push; revert the consumer commits in their repositories. The installed CLI and the data are then as before the
  window. numbers.json files left by the migration are reverted with it.
- **After step 7.** Agents have written JSON items; reverting a migration commit would then conflict or drop their writes. The rollback
  becomes a fix forward on the working branch (a batch through the commit script), and a folder whose items are wrong is repaired by its
  team with its own steps or by the owner with user commands and `--show-all`. This is why the window closes only after the smoke checks.
- **Per batch, before the cut-over.** A batch that turns out wrong is reverted on the engine branch with `git revert <batch commit>`; it
  was never deployed, so no consumer saw it.
