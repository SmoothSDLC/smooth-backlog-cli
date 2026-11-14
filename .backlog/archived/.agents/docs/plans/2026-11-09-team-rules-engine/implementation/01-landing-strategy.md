# Team rules engine: how the work lands without breaking the installed CLI

Context: the owner's agents use the CLI all day on a shared machine, and that installed CLI is built from the working branch of this
repository (`simplify/pr3-review`) at every commit the lead makes. The engine work of `00-priority-order.md` changes the item format,
renames every environment variable, removes commands and changes who a team command acts as. This file states the facts of the deployment
(checked on 2026-11-10), what each breaking batch would break, the landing proposal, the cut-over steps with who does what, and the
rollback. It is planned with the answers recorded for the two choices of the implementation plan, "2026-11-10 round 13,
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
8. Nothing is built for a release older than the cut-over (rulings R18 and the owner rule of 2026-11-07; design question "2026-11-09
   round 12, question 7"): no marker in a migrated folder, no change of the schema number. An older release on a migrated folder sees no
   item and would hand out number 1 again, so every installation that writes to a folder is upgraded before that folder is migrated
   (step 3 of the cut-over installs the engine build on the shared machine; an installation on another machine is upgraded by its user
   before it is used on a migrated folder).
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

## 3. The landing (owner, 2026-11-09)

Context: the owner decided the landing on 2026-11-09 (round 13, question 1), in these words: "You push after every commit, that's the
requirement, but the deployment and live testing ... will happen after the implementation is complete and all the tests pass and the
reviews have been done." The hazard of section 2 came from one fact, that every commit of the working branch was installed at once. That
installation is what stops; the branch does not change.

1. **The working branch takes every batch.** Every batch is committed on `simplify/pr3-review` and pushed after every commit. No other
   branch is created on the remote.
2. **Nothing is installed until the end.** From batch B01 on, a commit is made with plain git and the installation step of the lead's
   commit procedure is not run. The installed CLI stays the last build before B01 until the cut-over of section 4, which happens only
   when every batch B01 to B29 is done, every test passes and the reviews are done.
3. **Agents work in local worktrees.** The lead orchestrates and does not implement. Each batch is implemented by an agent in a worktree
   of its own on a local branch (`00-priority-order.md` section 2.1 gives the lanes that can run at once). When the batch's proof passes
   and its review is done, the lead rebases the local branch onto the working branch, runs the proof again on the result, merges it
   fast-forward, pushes, and removes the worktree and the local branch. A local branch is never pushed; no worktree outlives its batch.
4. **A fix to the installed CLI during the implementation** is made on the commit that is installed, in a worktree of its own, installed
   by hand by the lead, and merged into the working branch like a batch. None is expected.
5. **One cut-over** installs the finished build, migrates the folders in use and updates every consumer in one window (section 4).

## 4. The cut-over

Context: the cut-over is the one moment the installed CLI changes from the markdown build to the engine build. It starts only when every
batch B01 to B29 is merged and green on the working branch, the reviews are done, and the owner's team file (backlog item 149) and skills (item 151) are ready in the new
shape. The roles: **the owner** opens and closes the window; **the lead** runs the steps; **a reviewing agent** checks each step's output
against this list; the implementing agents are idle during the window.

| step | who | what |
|---|---|---|
| 1. Rehearsal (the day before) | the lead | Make a scratch copy of the shared backlog repository (`git clone --mirror <backlog repository URL> <scratch>/backlog.git`, then `git clone <scratch>/backlog.git <scratch>/backlog`), so that pushes go to the scratch copy. In a checkout of each repository whose folder is in the backlog, with SMOOTH_BACKLOG_CLI_HOME set to the scratch clone, run `node <working branch checkout>/bin/backlog.js team migrate --show-all --dry-run`, then `node <working branch checkout>/bin/backlog.js team migrate --show-all`. Every folder must convert, also the folders left for later by round 13, question 2; every stop of chapter 06 section 5 is fixed in the real backlog in markdown before the window. Run the smoke checks of step 6 against the scratch copy. |
| 2. Open the window | the owner | Stop every agent session that uses the installed CLI, and the scheduled runs that call it, so that no command runs between the installation and the migration. |
| 3. Install | the lead | In the working branch's checkout, at the pushed head: run the installation step of the commit procedure alone, and check that it reports that commit. |
| 4. Team files and consumers | the lead | Write each team's entry at its resolved location (the owner's team entry of item 149; a folder without team items needs no file), validate each with `backlog team validate --team <team>`, commit the file with its `teams_file_sha`. Apply the consumer changes of reference/consumers.tsv (item 151): the prefixed variable names, `backlog team query --json` instead of `backlog list --json` for team items, the removed commands, the run-hook variable of any program set as the run hook. |
| 5. Migrate | the lead | Per repository folder, in that repository's checkout: `backlog team migrate --show-all --dry-run`, then `backlog team migrate --show-all`, then commit .backlog/config.json (the migration record and the SHA). First the CLI repo's own folder, then the folders with team items, then the folders of repositories an agent session works in; the other folders are migrated when next used (rulings R24 and R25: the migration is per folder and `backlog setup` recommends it in a repository whose folder is not migrated; round 13, question 2). |
| 6. Smoke checks | the lead, checked by the reviewing agent | In the CLI repo's checkout: `backlog --version`, `backlog list`, `backlog team validate --show-all`, `backlog team query --team <team>`, `backlog team pop --team <team> --agent <member> --dry-run --json`, and one `backlog new --name "cut-over check"` followed by `backlog archive <its number> --force`. Each must succeed with the expected output. |
| 7. Close the window | the owner | Restart the agent sessions. The first real session of the owner's team is watched until its first pop and its first step succeed. |

## 5. Rollback

Context: the cut-over changes three things that can be undone separately: the installed build (the working branch), the item files (one
migration commit per folder in the backlog repository) and the consumers (their own repositories). Nothing is ever force-pushed.

- **Before step 7 (no agent has written a JSON item).** Install the last build before B01 again (the installation step run on that commit); revert each folder's migration commit in the backlog repository (`git revert <migration commit>`), which restores
  the markdown files exactly and removes numbers.json with them, and push; revert the consumer commits in their
  repositories. The installed CLI and the data are then as before the window.
- **After step 7.** Agents have written JSON items; reverting a migration commit would then conflict or drop their writes. The rollback
  becomes a fix forward on the working branch, and a folder whose items are wrong is repaired by its team with its own steps or by the
  owner with user commands and `--show-all`. An older build must not be installed again after this point: it would see a migrated folder as empty
  (fact 8). This is why the window closes only after the smoke checks.
- **Per batch, before the cut-over.** A batch that turns out wrong is reverted on the working branch with `git revert <batch commit>`,
  pushed; it was never installed, so no consumer saw it.
