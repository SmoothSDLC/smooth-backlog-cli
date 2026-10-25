# New Chat / Agent Handoff — PR #3 Backlog CLI: Comprehensive Use-Case, Interaction, and Adversarial Behavior Analysis

**Role:** Act as an independent principal engineer, distributed-systems analyst, test architect, and adversarial reviewer. You are taking over **ANALYSIS ONLY** of the open `SmoothSDLC/smooth-backlog-cli` **PR #3**. Do real source inspection and repository-level work rather than writing generic recommendations. Produce and **commit a comprehensive executable-use-case / interaction / failure matrix document directly to the PR's EXISTING HEAD BRANCH**. Do **not** implement the fixes yet. A separate follow-up session will turn your analysis into an architectural remediation proposal and implementation plan.

## 0. Immutable objectives and authority

- **Primary goal:** Enumerate the entire backlog CLI/skill behavior surface, all user/agent use cases, all cross-command and cross-agent interactions, and every meaningful race, failure, partial-commit, stale-state, misrouting, and recovery scenario—especially on **BigFan's single shared live host**. Turn these into falsifiable, traceable matrix rows and deterministic test designs. Find missing edge cases *before* Codex finds another one per review round.
- **Secondary design-analysis goal, NOT implementation this turn:** Generalize the public backlog CLI for outside organizations. Identify how a private/configurable backlog root can be discovered/installed locally and in cloud agents, with **all SmoothSDLC-specific constants and paths migrated out of public CLI code into configuration**. Document a config-generation/synchronization concept; code changes belong to the next phase.
- **Strict deliverable:** Commit one authoritative analysis document to PR #3 branch `team-cli-parity-1` in `SmoothSDLC/smooth-backlog-cli`, proposed path `.agents/docs/analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md` (create containing directory if missing). It MUST contain real source paths/line numbers and SHA-pinned evidence, comprehensive command coverage, behavior contracts, state/invariant models, an exhaustive numbered test matrix, a gap register, and priority-ranked risk inventory. Write any supporting machine-readable matrix as a second file only if it materially enables generating/executing tests; keep the Markdown comprehensive and self-contained.
- **Do not** merge PR #3, publish an npm package/release, push to `main`, modify production BigFan services, rewrite history, perform real destructive tests against the authoritative backlog, or silently change other private repositories. PR #3 merge currently triggers a release: explicitly preserve owner review.
- **Avoid solution lock-in:** During this pass identify *what must hold* and *which existing implementation paths violate it*. Record candidate solution avenues only as questions/constraints; **do not implement or prematurely prescribe a large structural fix**. The next prompt will request the remediation design.
- **No session handoff between coding agents:** The durable work boundary is the backlog item, plus committed repo artifacts. Fresh sessions should independently query authoritative backlog state; no assumed prior-chat memory. Different Qwen sessions for one logical agent must not inherit state or continue tasks in an expired session. Document this as a use-case/invariant, without converting the analysis into the Qwen runtime patch effort.
- **Evidence discipline:** Distinguish `PROVEN (reproduced)`, `SOURCE-DERIVED`, `REPORTED (with link)`, `HYPOTHESIS`, and `NOT CHECKED`. Existing Codex findings are adversarial leads, not proof that the current HEAD still has the bug. Never mark something tested if only read, or working if merely documented.

## 1. Repositories, exact branches, and acquisition protocol

At handoff creation (October 25, 2026):

| Purpose | Repository | Ref / role |
|---|---|---|
| **WRITE TARGET** | `SmoothSDLC/smooth-backlog-cli` | Existing PR #3 `team-cli-parity-1`; observed SHA `240cdb89d8934cf1739b1d598376f64a1a6b6095`; **refresh SHA on arrival** |
| Backlog of record / Python oracle | `SmoothSDLC/smoothsdlc-backlog` | `main`; inspect `skill/backlog/SKILL.md`, `skill/backlog/scripts/`, `skill/backlog/tests/`, `SmoothSDLC/backlog-cli/phases/` |
| Live-server topology / team orchestration | `SmoothSDLC/cody-topology-bigfan-linux` | `main` for current deployed-intent skills/dispatcher; read-only; also inspect draft PR #1 branch `fix/qwen-team-member-lifecycle-reuse` as **proposed**, not deployed |
| New authoritative engineering methods | `SmoothSDLC/cody-coding-model` | PR #29 `references-review-v2` while open; read-only; inspect environment-impact, refinement, adversarial-review, and deployed-evidence contracts |

The backlog folder retains the historical `SmoothSDLC/backlog-cli` identity despite the GitHub repository being renamed `SmoothSDLC/smooth-backlog-cli`. **Investigate this rename/mapping explicitly**; never assume current origin-derived `<owner>/<repo>` is automatically equivalent to the historical folder, and never create a duplicate backlog namespace.

1. Discover available GitHub/shell/computer tools and installed backlog skill. Use the tools you actually have; do not claim BigFan shell or cloud browser access without verifying it. Prefer authenticated private GitHub tooling for these private repositories. If a shell is available, clone all four into a NEW isolated workspace (not a live BigFan shared worktree); switch the CLI clone to its existing `team-cli-parity-1` branch and record `git rev-parse HEAD`, upstream tracking, and clean status. The backlog clone remains on `main` and is read-only for this analysis unless an existing work-item update is authorized under its skill.
2. Inspect **latest** PR #3 metadata, changed files, all review discussion and unresolved P0/P1/P2 comments **at the moment of work**. It has been updated repeatedly and is not frozen to `240cdb89`. Include a baseline table with observed HEAD for every repo and UTC timestamp.
3. Inspect the backlog's PR-related phases `001–021` under `SmoothSDLC/backlog-cli/phases/`, especially phase `002` (mode contract), phase `008` (Git synchronization), phases `009–020` (database, updates, team lifecycle/pop), and `021` (PR delivery). Read any more recent item or review record that supersedes them. Use the **installed authoritative backlog skill** to query/update any backlog item, never raw SQLite or phase-file writes; no new backlog items merely to split this analysis without owner permission.
4. Read PR #3's `.agents/docs/specs/2026-10-22-shared-backlog-mode.md`, current `COMMANDS.md`, `README.md`, `src/args.js`, `src/main.js`, `src/context.js`, `src/shared/*.js`, tests, GitHub workflow, and any installed agent skills. Enumerate BOTH the legacy local `.backlog/` CLI and the newer shared Git-backed mode. Compare actual `--help` and parsing behavior with docs and Python oracle. Treat discrepancies as findings.
5. Inspect `cody-topology-bigfan-linux` actual `team-lead`/`team-member` skill text, `wake_hook.py`, `dispatcher.py`, team roster, installed backlog skill copy, upgrade/deployment contracts, and related testing scripts. Distinguish the working renamed-member pattern on `main` from draft Qwen lifecycle PR #1. Inspect coding-model PR #29 **as the newer authoritative process**; adapt old references only by noting conflicts—do not let older guides override newer contracts.
6. Confirm write permissions and branch HEAD before committing. Use a normal additive commit on PR #3; **never force push**. If someone else pushes concurrently, fetch, reread overlaps, reconcile, and commit on the latest head without discarding anyone's work. Work on an isolated checkout/branch corresponding to the existing PR, not `main`.
7. Use existing docs/tests as *leads*, not an exhaustive specification. Map behavior from real code and its consumers. No internet-based assumptions about this private stack.

For an authenticated shell, representative Git acquisition (adapt URL scheme/auth to available tooling):

```bash
mkdir -p /tmp/pr3-backlog-analysis && cd /tmp/pr3-backlog-analysis
git clone git@github.com:SmoothSDLC/smooth-backlog-cli.git
git -C smooth-backlog-cli switch team-cli-parity-1
git clone git@github.com:SmoothSDLC/smoothsdlc-backlog.git
git clone git@github.com:SmoothSDLC/cody-topology-bigfan-linux.git
git clone git@github.com:SmoothSDLC/cody-coding-model.git
git -C cody-coding-model switch references-review-v2
```

Do not blindly run this if copies already exist or another agent is using the destination. No actual production secrets need to be collected or printed.

## 2. Deliverable design — not a high-level essay

Organize the committed Markdown document into independently checkable **analysis sections**, with ID-stable tables and exact verification commands. Each row should identify *expected behavior vs. actual current code*, including explicit unknowns. Minimum contents:

1. **Evidence baseline:** repository/branch/SHA, authoritative skill version, PR status/comments, source map, host assumptions vs verified runtime, classification key.
2. **Command census:** **EVERY** CLI command, alias, invocation form, subcommand, global option and relevant flags; both local/shared mode and Python oracle equivalents. For each: read/write scope; prerequisites, affected files/DB/Git/index/config; state transitions; who may execute; return/exit codes; tests; side effects; idempotency; concurrency hazards; rollback. Distinguish command-front vs item-front syntax and unsupported shared-mode commands.
3. **Actor + topology model:** solo human, solo agent, 1-agent team (lead alone), 2-agent team (lead+member), 2 independent agent teams on the SAME repo, >2 agents including independent reviewer, cloud Codex/Claude, and LOCAL+CLOUD simultaneously using the same remote backlog. Include stale/retired member sessions and logical agent identity vs specific session identity.
4. **Lifecycle state machines:** item creation/refinement/readiness -> claim -> work -> wait -> request review -> start review -> pass/reject -> fix -> close -> archive/reopen; release/hand-back; dependents; split into <=45-minute task sections; lead authority and review ownership. Separate *local in-memory*, *filesystem*, *SQLite mirror*, *Git index/commits*, *remote origin*, *per-agent seen-cache*, *team session* states.
5. **Interactions matrix:** commands × commands and actors × actors; causal sequence; expected allowed/disallowed transitions, conflict edges, safety invariants, needed locks, version checks, publication-time revalidation, compensating operations.
6. **Storage and consistency:** phase Markdown + archive + SQLite mirror + events + priority/reflow + SHA/slug/seq/branch/repository mapping; identity collision; read/write skew; stale-view semantics; exact transactional rollback boundary; crash durability and restart recovery.
7. **BigFan LOCAL behavior:** one real shared Ubuntu host, multiple agents/sessions, shared backlog clone, working tree, file paths, services, git index, model-related jobs; NO generic sandbox isolation. Explicit mutation/side-effect boundary, concurrent writer protections, inability of per-process locks to protect independent clones/processes, and effects from git/autostash/rebase. *Test these in synthetic temporary clone fixtures, NEVER on the live backlog.*
8. **Cloud + hybrid onboarding:** fresh ephemeral Codex/Claude agents, private repo access, installing public CLI, cloning private backlog, secrets/auth permissions, per-workspace config discovery, agent skill installation, correct repository mapping, read-only vs contributor permissions, remote publication and contention with BigFan agents.
9. **Portable configuration/replication analysis:** `.backlog/config.json`, private org distribution, public package neutrality, migration of hardcoded app/skill paths; bootstrap and schema; checks for stale/missing/malicious config; audit and per-repo drift. **This is the configuration-use-case inventory, NOT implementation.**
10. **Adversarial test catalog:** scenario IDs, deterministic actor schedule/barriers, fault injection, prerequisites, expected return codes+invariants, expected filesystem/DB/Git/origin snapshots, actual test path or gap; runnable proposed regression name; observed current HEAD status.
11. **Coverage map:** existing `.agents/test/shared-*.test.js` suites, Python oracle tests, CI environments; each matrix ID -> existing test or MISSING; identify where tests assert only a happy path/string instead of enforcing transitions at the transaction boundary.
12. **Risk ledger + next-phase inputs:** ranked proven defects, unverified hypotheses, nonstandard BigFan use cases, public CLI portability dependencies, and precise *questions the subsequent fix/design PR must answer*; no code changes.

### Mandatory row schema

Use compact, queryable Markdown tables (or machine-readable CSV/JSON companion generated from the same definitions). Every nontrivial row has:

`UC_ID | Environment | Actor(s) | Commands + args | Starting states | Event schedule / fault | Permitted transition + invariant | Expected files/DB/commits/origin | Current behavior (SHA:file:line) | Existing test | Proposed deterministic test | Evidence grade | Severity / dependency`.

An **interaction matrix** must be more than a command list. Show ordered pairs (`A -> B`, `A || B`, retries, swapped orders), include both **same backlog item and different items**, and distinguish same repository folder vs cross-folder operations. Make concurrent outcomes falsifiable rather than calling them “race possible.”

### Required invariants (assess / refine from source)

- No lost committed item/edit/event, silent overwrite, extra/missing item, duplicate sequence/slug or broken provenance.
- One action does not silently adopt another actor's unseen edits as “already read.” Reflows/moves preserve stale-view semantics and reviewer attribution.
- A success response implies **all** designated authoritative remote changes and mirror invariants are durably true; a rejected mutation leaves no partial user mutation; recoverable intermediate states are never published as success.
- Dependency graph stays acyclic with all required reachable references after ANY concurrent publication/rebase/move. Check against merged remote state, not merely the initial snapshot.
- Every claim/review/close has valid identity, authorization, correct ownership, and consistent state. A reviewer never closes merely because claimer is busy; team lead fallback only after the documented reminder/20-minute gate. A retired/fresh session cannot accidentally continue or claim in the old incarnation.
- Writes are scoped to the configured backlog repository/project folder; never stage or publish unrelated files or different users' work in a shared checkout.
- Concurrent distinct clients (including clone A / clone B) eventually serialize valid changes, or one fails cleanly with actionable stale/conflict status; never report two successes for an invalid outcome.
- Offline/failed authentication/timeout/kill leaves an explicit durable, resumable and auditable state—not silent partial work or credential leakage.
- Public CLI defaults and shipped files reveal no SmoothSDLC private repository identity, internal host path, or assumption; private ecosystem policy comes from explicit per-repo configuration, not code constants.

## 3. Scenario seed catalog — expand, verify, and give every case an ID

The following are **leads**, not a limit. Some are previous Codex reports and may already be fixed on today's PR HEAD. Independently recheck and label their status. Require all cross-products that materially affect integrity.

### A. Identity, setup, configuration, discovery

- `init`, `init backup`, `init clean`, mode switch and help in both modes; dirty/missing repository; detached HEAD; no origin, renamed origin, forked origin, remote URL with embedded credential; branch mismatch; missing home, symlinked home or ancestor, nested repo, directory traversal.
- Repo identity renamed on GitHub while backlog folder still uses old name (`SmoothSDLC/backlog-cli` vs `SmoothSDLC/smooth-backlog-cli`); bootstrap and migration without duplicating history.
- Fresh user selects backlog location: **local `.backlog/` / dedicated external Git repo / arbitrary local filesystem path**; switch modes with active work; config missing/invalid/unreadable; contradictory CLI/env/repo/user settings; same user operating two separate organizations.
- Public GitHub Packages npm dependency needs auth even for publicly visible package; Node >=24, Linux/macOS, Windows explicitly unsupported at this time; token-less hosted agent, scoped read-only vs write token, failed refresh, no interactive login, package installation blocked.
- Cloud Codex or Claude checks out repo in shallow/detached/ephemeral environment; installs CLI and skill; finds `.backlog/config.json`; finds/clones private backlog via configured remote; sets identity and authentication without leaking tokens; acts, commits, pushes and survives container deletion.
- Config synchronization workflow: source config lives in `smoothsdlc-backlog/.backlog/config.json`; private consuming repos receive checked-in copy from central GitHub Actions job; repo additions/removals/renames, permissions, forks, race with local modifications, branch protection, partial fleet success, retried workflow, tampered config, stale copy, bootstrap cycle when repo-config needed to clone the private backlog. Audit drift and private/public boundary.
- Hardcoded `SmoothSDLC/smoothsdlc-backlog`, `~/git/smoothsdlc-backlog`, XDG `smoothsdlc-backlog/home`, `BACKLOG_HOME`, source/installed skill paths and `SMOOTH_BACKLOG_SCRIPTS` in `src/shared/store.js`, `safety.js`, `router.js`, Python `lib_db.py`, `set_home.py`, skill docs, generated integrations. Classify each as product-generic, legacy compatibility, or private config—not necessarily all replaced identically.

### B. Command/lifecycle consistency

- Every `new` flag: required fields/DoD/review refs, duplicates and race-created names, priority/critical insertion reflow, split-from, `--force` replacement, `--dry-run` zero-side-effects, invalid/missing dependency.
- Every `update` flag: field/text/append/branch/commit/status/priority/seq/replan, claim/release/hand-back, wait/wait-done, review request/start/pass/reject, close, re-open, set work/review classes and refs, set dependencies/estimate/complexity/layer. Mixed flags and partial command failure.
- `query` views and `next`/`pop`: team scope, reviewable/claimable/blocked, actor classes, `--claim-now`, no agent, no roster, orphaned review, stale review, held-but-waiting item, aged wait, idle exit, misleading action output, `--scope branch|repo|all`.
- `move` within branch vs cross repository, move to existing dest, dependency of moved item and *incoming* dependents, two items with same slug/seq, archived target, moving active/claimed/reviewed item, reflow of both repositories, interrupted split commit.
- `archive` done vs active forced, archive/reopen, moving latest-ID record, lifecycle events retained, frontmatter quoted/multiline `status`, missing/filename-derived `phase`, BOM/Unicode/newlines, duplicate or malformed frontmatter. DB->Markdown->archive round trips.
- Parent item vs <=45min internal task sections; dependency ownership, one-writer file boundaries and iteration/handoff evidence. Compare backlog CLI representation with team's actual skill orchestration rather than silently inventing separate backlog records.

### C. Team, sessions, reviewers, cloud/local cooperation

- Solo agent/self-review prohibition; lead+member reciprocal review; one lead with no active member; two independent team leads on same backlog item/repo; third independent reviewer; Codex cloud reviewer with no BigFan live access.
- Two agents pop/claim same item at same time across different *processes/clones*, same repo and branch. One reviewer and one author edit same item simultaneously. One author pushes new commit after approval; SHA pinning and stale approval; a claim is released then immediately reclaimed; duplicate review verdicts/retries.
- Member has an active wait then releases/hand-backs; second member `pop --claim-now` must not receive stale waiting work. Review requested -> start -> member dies -> resume/transfer/reject; no review authority escalation.
- Teammate closes item then `pop`s/claims new work in the **old session** before shutdown; reset dispatch occurs after close and may race claim. Lead prematurely spawns another teammate; stale message routes to newer teammate and original misses review verdict; logical agent identity vs session evidence. No reliance on session-to-session handoff.
- Multiple agents share BigFan checkout and its `.git/index`, working tree and `BACKLOG_HOME`; two commands in same process vs two processes vs separate Git clones; local OS file locks vs remote Git conflicts; `git checkout`/rebase on one shared worktree while another has dirty edits; unrelated staged files present during backlog transaction.
- Lead/dispatcher pop/query interleaving with mutation; priority reflow changes “next”; duplicate task creation by concurrent refiners; one agent reviewing stale generated task split; interruptible long-running cloud deployment and `--waiting`/resume; reviewer has only source/evidence while authorized deployer owns live calls.

### D. Concurrency, publication, crash recovery (systematically pairwise)

- Two writers concurrently `new`, `update`, `move`, `archive`, `--replan`, `--set-depends-on`, `--set-seq`, `--close`, `--claim`, re-open; same/different folder; swapped execution orders; same/different agent view caches.
- Check before `pull`, after `pull`, after filesystem mutate, DB transaction, before `git add`, during commit, after commit but before push, during rejected push/rebase/autostash, after first recovery push, after success print. Inject SIGKILL/network failure/permissions/disk-full at each stage; restarting process must reconcile without lost rows.
- Concurrent `update A --set-depends-on B` vs `update B --set-depends-on A` **after rebase**. New Codex P2 at PR #3 HEAD `240cdb89`: both succeeded and published a dependency cycle, requiring post-merge graph validation.
- Concurrent `update --seq` vs upstream create that allocates same sequence; moved-item path/slug changes on conflict; destination filename collision with metadata seq divergence; duplicate sequence visible in numeric selectors.
- Concurrent cross-repo `move` vs new upstream item depending on the moved source; invalid dangling dependency; other repo's changes lost when squashing an unpushed stack touching multiple folders.
- Repository mirror `backlog.db` conflict; remote receives intermediate Markdown/SQLite mismatch; archive row not restored because scanner indexes only live phases; event identity lost when SQLite row ID is reused; `phase_id: null` or orphaned events.
- Priority reflow (`new --severity critical`, `close`, `replan`, `move`, `archive`) stamps another user's unseen item and mistakenly refreshes `seen` hash; stale write subsequently permitted. Per-agent cache filename collisions from different names or Unicode canonicalization.
- `pop --claim-now` selects item with retained `wait_on` after release. Team scope bypass on an update that edits only item body or metadata; valid/invalid ownership after failed/rejected update.
- Conflict-marker preflight exception thrown after mutating Markdown+DB, outside rollback boundary; a failed command leaves dirty state. Rebase/autostash conflict, untracked/ignored/staged unrelated files, explicit `git add` scope, indexes locked by other processes, stale lock TTL/PID reuse.
- File path/symlink/hardlink traversal, repository origin altered, malicious YAML/frontmatter containing control characters, attacker-supplied Git error text or credentials; ensure safe path resolution and redacted diagnostics.

## 4. Required testing analysis method

For each scenario, derive invariants from actual code and recorded owner authority. Design **deterministic multi-process tests** using local temporary Git bare origins and 2–3 clones, OS barriers/hooks or controlled mock `git` subprocesses (not random sleeps). Capture synchronized snapshots at each boundary: Markdown phase, archive, SQLite DB rows/foreign keys/events, `git status --porcelain=v1`, `git ls-files --stage`, local HEAD, remote ref/tree, per-agent view cache. Assert both agents' exit codes **and** the durable remote state. Where expected behavior is ambiguous, mark `DESIGN_DECISION_REQUIRED` rather than inventing it.

Cross-check reference Python `skill/backlog/scripts` behavior and its tests. **Python parity is necessary, not sufficient**: bugs or SmoothSDLC-specific policies in the Python oracle may be exactly what a generalized public CLI must NOT perpetuate. Classify (A) required portable semantics, (B) ecosystem-specific policy, (C) legacy compatibility, (D) discovered source defect. Distinguish local-mode `.backlog` JSON behavior from shared-mode Git/SQLite.

Identify exact tests already present and their quality: `.agents/test/shared-{audit,concurrency,db,fixtures,frontmatter,help,interop,mode,move-archive,new,pop,query,safety,stale,store,sync,team-compat,team-done,team-lifecycle,team-pop,team-scope,update}*.test.js` and non-shared/local suites; `npm test`, `npm run check`, oracle run via `SMOOTH_BACKLOG_SCRIPTS=<backlog>/skill/backlog/scripts npm test`; any CI Node/macOS/Linux matrix limitations. Do not assert green without running and recording commit/platform/skip counts. Test fixture should set temporary HOME, XDG_CONFIG_HOME, BACKLOG_HOME, Git config, remotes and credential-safe logs; NEVER mutate actual private backlog.

**Review pressure test:** Treat Codex PR #3's full historical finding thread as a taxonomy of *missing interaction dimensions*; group by invariant broken rather than creating one unrelated patch idea per comment. Pay particular attention to most recent publication-time dependency cycle finding, and re-evaluate at today's HEAD. An apparently fixed case must be accompanied by the exact regression test demonstrating behavior across the original race, not just a check for a function name or a successful one-writer happy path.

## 5. Work decomposition, evidence gates and commit behavior

Split the **analysis** into fresh-session-sized, independently reviewable internal work units, each target **<=45 minutes**. Start by writing the analysis outline + unit backlog **inside the output document** (not new authoritative backlog items). Suggested DAG:

- **A0 (<=35m):** latest PR/backlog/repos/skills checkout + SHA baseline + classify identities and scope, document current unknowns.
- **A1 (<=45m):** complete command/options/call-chain census; source->state/side effects matrix; split by command family if oversized.
- **A2 (<=45m):** team/agent lifecycle, claim/review/close, dispatcher and 1-/2-team interaction graph.
- **A3 (<=45m):** Git transaction, SQLite/event, view cache, priority/reflow, failure/recovery graph.
- **A4 (<=45m):** LOCAL BigFan shared-host hazards and cloud/hybrid comparison, with behavioral gates.
- **A5 (<=45m):** public CLI config, `.backlog/config.json` private sync/bootstrap/portability discovery (analysis only).
- **A6 (repeat <=45m units as needed):** cross-product scenario enumeration, Codex P0–P2 taxonomy, current tests vs gap mapping; real deterministic reproductions only if safe and available.
- **A7 (<=45m):** independent adversarial audit for uncovered commands, missing actors, unmodeled intermediate writes, unsupported assumptions; consolidate / prioritize.
- **A8 (<=30m):** verify document self-sufficiency + consistent row IDs, commit/push onto existing PR3 branch; report commit + count of commands, scenarios, matrix interactions, proven defects, hypotheses and uncovered tests.

Dependencies: A0 before any; A1–A5 may run independently after A0 *if* distinct writers/agents actually exist; A6 integrates them; A7 follows A6; A8 follows A7. If multiple agents work, one file writer only; partition content into nonconflicting sections/temporary scratch docs and integrate deterministically. Use method from coding-model PR #29 to recursively trace dependencies and sweeten each unit with concrete paths/skills/memory/codebase queries/commands/tests/DoD. Do not get caught in recursive planning; begin filling the matrix immediately.

**Stop criteria** are based on coverage, not pages: inventory all commands and public options; identify every mutable state surface and every publication path; at least one normal, hostile, stale, crash, and two-writer scenario for each mutating command; cover BigFan shared worktree, separate clones, CLOUD-only, and LOCAL+CLOUD; mark *all* remaining holes explicitly. Do not claim exhaustive if substantial state/command surfaces remain unexplored.

**Final completion condition:** Existing PR #3 branch contains the committed, comprehensive analysis document at a verified GitHub SHA. Answer with PR link, commit, document path, counts, top 3–5 substantive findings, and explicit analysis limitations. **No implementation fixes in this session.** The next session will use this document as the authoritative input to propose the structural remediation strategy, tests and staged PR #3 work.