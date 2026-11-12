# Handoff — PR3 simplification review of smooth-backlog-cli (state at 2026-11-06, lead session ending)

Give this file to the agent that continues. Everything it needs is in the repositories named here; chat memory is not needed.

## 1. What this is
An independent adversarial review and simplification of the backlog CLI (public repository SmoothSDLC/smooth-backlog-cli), done
as ONE branch `simplify/pr3-review` (now on origin, 55+ commits ahead of its base `team-cli-parity-1` = fe40b5a) that ends in ONE
pull request into `team-cli-parity-1` (never main). The owner sees the PR title and body in chat first and says go; the agent
never opens it on its own. The work is organised in phase plan documents; Phases 1–6c and the lead's fixes are done and live;
Phase 7 is running in a sub-agent (see 4); Phases 7b, 8, 9 remain.

## 2. Where everything lives (all on the development machine)
- Worktree of the review branch: `<worktree>` (branch `simplify/pr3-review`). Never touch the main clone
  `<main-clone>` (it is the live team's working directory) except to read.
- Plans (private repository the shared backlog repository, pushed): `the plans folder of the shared backlog repository`:
  [2026-11-04-pr3-simplification-log.md](../plans/2026-11-04-pr3-simplification-log.md) (the log: phase table, the owner's decisions and rules, outcome+lessons per phase — READ FIRST), [2026-11-04-phase-7-command-aliases.md](../plans/completed/2026-11-04-phase-7-command-aliases.md),
  [2026-11-04-phase-7b-command-aliases-b.md](../plans/completed/2026-11-04-phase-7b-command-aliases-b.md), [2026-11-04-phase-8-documentation.md](../plans/completed/2026-11-04-phase-8-documentation.md), [2026-11-04-phase-9-final-verification-and-pr.md](../plans/completed/2026-11-04-phase-9-final-verification-and-pr.md), this file.
- Helpers: `<logs>/`: `commit.sh "<msg>"` (the ONLY way to commit: author <author>, no trailers, `git add -A`, then a deploy script makes HEAD the machine's live `backlog`),
  `run-tests.sh <label> node` (full suite to `<label>.log`), `decisions/*.txt` (every decision put to the owner).
- Review record in the branch: `REVIEW-LOG.md` (one row per review/skill use; last row 137), `REVIEW.md`.
- The owner's action item: a backlog item of the live backlog; append every status/decision:
  `cd <main-clone> && backlog update <item> --append "<text>"`.
- Owner alerts: `<alert-tool> send --source pr3-simplification-review "<text>"` (every decision also goes there).
- Topology (the team's topology repository, private): `<topology-clone>`; the team skills and the CLI pin `<deploy-tooling>/backlog-cli.pin` = `simplify/pr3-review 20d24b28` are
  deployed KNOWN-GOOD. Deploy = `( setsid nohup bash <deploy-tooling>/deploy.sh <commit> > /tmp/deploy.log 2>&1 </dev/null & )` after
  the model-activity check says NOT ACTIVE; it runs a smoke test (minutes). The deploy re-installs the CLI from
  the pin: after moving the branch forward, update the pin (branch + full sha; the commit must be on origin) and redeploy, or the
  live CLI falls back to the pinned commit.

## 3. Binding rules (from the owner; violations are not negotiable)
1. PUBLIC REPOSITORY: code, tests, docs, commit messages, PR text name no private repositories, hosts, machines, paths, ports,
   internal agent/team/model names, backlog item numbers, owner decisions or internal state. Guard: `cd <worktree> &&
   BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js`
   → pass 3. Before a push run the pre-push content check by hand (the pre-push hook of the main clone
   over `origin/team-cli-parity-1..HEAD`); push with `git push origin simplify/pr3-review` (the branch exists now, so the
   hook's branch-creation rule R1 no longer bites; never create another branch).
2. THE SIMPLIFICATION NEVER REMOVES BEHAVIOUR ON AN AGENT'S JUDGEMENT: a candidate removal is reported with evidence; the owner decides.
3. Everything for the owner is a DECISION in the decision format (id `<yyyymmdd>-<letters>`, numbering continues — last used
   20261106-AE; a self-contained problem description of ≥2 sentences not assuming knowledge of current behaviour; lettered options
   of ≥2 sentences each; one recommendation), one decision per chat response while one is open, also sent to the owner-alert tool and
   appended to that item. Procedural matters the lead was asked to analyse are decided by the lead on the recommendation (owner
   instruction 2026-11-06); nothing else is presented to the owner. Chat is control-plane only: ≤20 lines, ≤80 for status.
4. Skills are used through the Skill tool (ponytail-review before every lead review/commit; executing-plans for a phase) and
   recorded in REVIEW-LOG.md. Sub-agents (a sub-agent) execute one phase document each in the background; the lead reviews each
   result (diff, suite, guard, live read-only check), fixes defects via commit.sh, folds lessons into later plans and the log.
5. Every commit leaves green: full suite (`run-tests.sh`, ~3 min; the BDD scenarios of `features/*.feature` run inside it in both
   storage locations), `npm run check`, the guard. Live writing commands (`backlog team pop` without `--dry-run`, `team update`,
   `new`, `team define/workflow`) are NEVER run against the live backlog; verification uses `--dry-run` and `team query` views.
6. Commit author <author>, no trailers; only via commit.sh. Never amend, never rebase, never force-push.

## 4a. Where did the lead stop? (check the working folders against this document; the lead may vanish mid-step)
The lead updates this file after every milestone (section 7, newest line last) and pushes it, but it can stop at any moment.
Determine the true state from the repositories, never from the last line alone:
1. `git -C <worktree> log --oneline -12` and `git -C <worktree> status --short`:
   which Phase 7/7b/8/9 commits exist (the commit messages name their task), and whether uncommitted work sits in the tree.
   Uncommitted work = a sub-agent or the lead was cut off mid-task: run the test file of that task to see where it stopped,
   finish or revert that task (never leave the tree dirty; commit only green).
2. `tail -3 <logs>/*.log | grep -E "exit=|fail"`: the last suite runs and their results.
3. `git -C <shared-backlog-clone> log --oneline -5 -- docs/plans/pr3-simplification`: the last plan/README/handoff
   updates (the log's "Phase N outcome and lessons" section exists only when the lead's review of phase N is done).
4. `tail -5 <worktree>/REVIEW-LOG.md`: the last recorded review; `backlog query --phase <item> --json`
   (from `<main-clone>`) and read the end of its body: the last status the lead appended.
5. `cat <deploy-tooling>/backlog-cli.pin` and `git -C <worktree>
   ls-remote --heads origin simplify/pr3-review`: whether the pushed/pinned commit is behind the live HEAD (then push, pin, deploy).
Then continue at the first unfinished step of section 5.

## 4. State at handoff
- Live: CLI 20d24b2+ (every commit.sh commit goes live at once), topology at its known-good deploy. Suite 951/951 at 20d24b2.
- Running: Phase 7 sub-agent (Tasks 1–6 of [2026-11-04-phase-7-command-aliases.md](../plans/completed/2026-11-04-phase-7-command-aliases.md): the 1.x command aliases, `query --only/--branches`,
  `features/aliases.feature`, help/COMMANDS.md/README/skill; Task 4 the engine's instruction texts in the `backlog team update`
  spelling; Task 5 the roster file leaves and `review_only` moves into the team entry; Task 6 the stored-key rename of decision
  K = a with Z = a: title, last_updated, last_updated_by, owner (was claimed_by), owned_since; old keys read forever). If the agent
  is gone when you start: `git -C <worktree> log --oneline` shows which tasks landed (one commit per task);
  `git status` shows uncommitted work; continue from the first unfinished task (its tests tell you where it stopped).
- Decisions: all closed (log table). No decision is open for the owner.
- Deferred to Phase 7 and later, and listed in the plans: the `moved:` shim on user-command `backlog update` is removed only when the owner
  says so (candidate; present it as a decision at Phase 9); `team query` takes no agent (deviation recorded); the test fixture does
  not commit teams.json (recorded).

## 5. What remains, in order
1. Lead review of Phase 7 (as 6c: ponytail-review via the Skill tool; verify suite/check/guard; read the diff of every src file;
   run the new command against an item OUTSIDE its intended scope — lesson 36; live read-only check with `backlog team query --team
   <team> --agent <lead> --plan --json` and `backlog team pop --team <team> --agent <member> --dry-run --json` from
   `<main-clone>`); fix defects via commit.sh; REVIEW-LOG row; log "Phase 7 outcome and lessons";
   the owner's action item. After the key rename (Task 6) re-check the live team's items read correctly (`backlog query --all` shows every item,
   old keys translated) and that the topology skills/dispatcher read no renamed key directly (grep `claimed_by|updated_by` in
   the team skills' scripts and the team tooling; they read the CLI's JSON — update them and redeploy if they do).
2. Phase 7b ([2026-11-04-phase-7b-command-aliases-b.md](../plans/completed/2026-11-04-phase-7b-command-aliases-b.md)): body-section editor, `import`, `archive done`, `upgrade` (decisions N, O, Q = a).
   Launch a sub-agent with the same brief shape as Phase 7 (state, rules, commit.sh, report ≤60 lines); then lead review as above.
3. Phase 8 ([2026-11-04-phase-8-documentation.md](../plans/completed/2026-11-04-phase-8-documentation.md)): README, CHANGELOG, COMMANDS.md, skill, REVIEW.md complete and consistent; sub-agent + review.
4. Phase 9 ([2026-11-04-phase-9-final-verification-and-pr.md](../plans/completed/2026-11-04-phase-9-final-verification-and-pr.md)): final verification (suite, BDD both, check, guard, a fresh-clone install test,
   the whole-branch ponytail-audit by an agent that has not seen the work), then: push the branch (content check by hand first),
   move the topology pin to the final commit and redeploy (KNOWN-GOOD), write the PR title and body (public-repo rule), show them
   to the owner in chat, and WAIT for the go; the PR targets `team-cli-parity-1`.
5. After the merge (owner's act): the topology pin goes back to `team-cli-parity-1` at the merge commit; redeploy.

## 6. Lessons that cost time (do not repeat)
- Plan line numbers drift; anchor edits on text. A sub-agent cut off mid-task leaves a coherent tree only if it committed per task.
- A phase that makes a configuration mandatory must register the running system's configuration in the same commit (lesson 34).
- A sub-agent can re-point many tests so they agree with a gap in the code; run the new command against an out-of-scope item (36).
- A verification call that writes (team pop) must never be run against the live backlog (37).
- The topology deploy re-installs the CLI from its pin: keep the pin on the branch commit that is live, or the deploy downgrades it.
- Shell tool calls time out at ~58 s: run suites detached and poll.

## 7. Progress log (newest last; the lead appends a line at every milestone)
- 2026-11-06 08:45 EST: handoff written; Phase 7 sub-agent running from d679b4f; branch pushed (20d24b2), topology deploy KNOWN-GOOD.
- 2026-11-06 08:55 EST: Phase 7 Task 1 committed (49c3124, aliases; 982/982); agent on Tasks 2-3 (t3.log 984/984), tree dirty by design until its commit.
