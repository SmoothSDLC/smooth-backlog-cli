# Handoff: PR #3 — exhaustive backlog behavior tests and staged remediation

**Created:** 2026-10-25 · **Authority:** owner request in current conversation · **Execution:** next autonomous engineering session · **State:** implementation handoff, not execution evidence.

## 0. Mission and nonnegotiable boundaries

Take over **SmoothSDLC/smooth-backlog-cli PR #3**, branch **`team-cli-parity-1`**. Start by reading **in full** the already committed analysis:

`SmoothSDLC/smooth-backlog-cli/.agents/docs/analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md`

The analysis contains **270 immutable UC IDs**, **16 invariants**, **14 fault gates F-00..F-13**, **18 configuration scenarios C-01..C-18**, a command census, 80 ordered command-pair cases, BigFan/agent-team/cloud actor models, a risk ledger, and evidence gaps. **Do not replace it with this document or presume its test scenarios passed.** This handoff is its executable test-first work program.

**Deliverable:** on PR #3's **existing branch**, add deterministic tests for all 270 source-defined UCs as far as implementable; add meaningful covering-array fault/interleaving cases; then fix the CLI **by failing-case/invariant class** until all accepted expectations pass. Produce a traceable `UC → test → evidence → defect → fix SHA → rerun` ledger, coverage/deferred decision report, config migration/portability tests, and an implementation record in the same PR. Preserve every formerly passing regression as work proceeds.

**No merge, `main` push, release/npm publish, unauthorized deployment, direct edits to the live BigFan host, live backlog/SQLite mutation, destructive cloud calls or bulk changes to other production repos.** Merge of PR3 can publish a release. Do not use BigFan's actual database, home, secrets, service containers or Git index as test fixtures. Other repositories are read-only behavioral references during this PR. If separate repo implementation is required (private config fan-out, Python skill, topology), specify dependent scoped follow-up changes and test contracts; do not silently change another repo.

Use owner-approved policy over any conflicting older reference. Existing evidence is only SOURCE-DERIVED or historically REPORTED unless freshly reproduced under controlled tests. Do not claim a test passes on a branch you did not actually execute. **If a required behavior is materially undecided, write a neutral characterization test, mark POLICY-BLOCKED, escalate the exact conflict, and continue with independent work.** Never interpret undocumented current behavior as policy.

## 1. Repository acquisition, pinning, authority

Use authenticated access. Work on a **fresh isolated worktree/clone in the executor's environment**; never modify the running BigFan service or a shared live checkout. Refresh all four repository HEADs at start, record full SHAs and any moving PR branch. The following are **inspection baselines, not permission to assume HEAD has not advanced**:

| Key | Repository / authoritative target | Verified 2026-10-25 ref SHA | Purpose |
|---|---|---|---|
| C | `SmoothSDLC/smooth-backlog-cli`, PR3 branch `team-cli-parity-1` | `198ec5a645fff5c912b93bfa96dafc744cadb728` | implementation and tests; committed analysis at this SHA |
| B | `SmoothSDLC/smoothsdlc-backlog`, `main` | `1f105874a3115d9b184a5172574cb2108576a349` | authoritative Python skill, DB and phase conventions; **read-only reference** |
| T | `SmoothSDLC/cody-topology-bigfan-linux`, `main` | `1118d59af2fdcfc86424821af7cbd07cc7873579` | real BigFan lead/member/dispatcher/wake protocol, host constraints; **read-only reference** |
| M | `SmoothSDLC/cody-coding-model`, PR29 branch `references-review-v2` | `9956064a5f1d5c0e315fba7b98fcd8a38e75cc0a` | governing environment/impact/review/fresh-task process; **read-only reference** |

Additional optional reference: T draft PR #1 `fix/qwen-team-member-lifecycle-reuse` is a **candidate** for canonical teammate-name cleanup, not presumed deployed; use T `main` for currently established runtime intent unless verified otherwise.

Example when shell and Git credentials are available (adjust remote transport to available secure auth; **do not echo tokens**):

```sh
# Run in a private disposable work root, never in a live BigFan checkout.
git clone <authenticated-remote-for-smooth-backlog-cli> smooth-backlog-cli
cd smooth-backlog-cli
git fetch origin main team-cli-parity-1
git switch team-cli-parity-1
git pull --ff-only origin team-cli-parity-1
git rev-parse HEAD
# Separately clone/inspect B, T, M at recorded/current SHAs; do not write to them.
```

Discover the **historical backlog namespace**: `SmoothSDLC/backlog-cli/phases/` inside B is the authoritative folder for CLI work created before the GitHub repo was renamed `smooth-backlog-cli`; do not create a second `SmoothSDLC/smooth-backlog-cli/` directory simply because the origin changed. Read B `skill/backlog/SKILL.md` and query actual installed/test-clone backlog state before new item operations. The existing analysis cites backlog phase 021 for no-merge rule and phases 024/025/027 for deferred work; re-check updated authoritative state. Use installed skill for any authorized backlog mutations; never hand-edit just Markdown and leave the committed SQLite mirror stale.

**Before any write**, read C `AGENTS.md`, the PR thread/recent Codex findings, `README.md`, `COMMANDS.md`, `package.json`, `src/main.js`, `src/args.js`, all `src/shared/*`, `.agents/test/shared-*`, B Python oracle (`skill/backlog/scripts/`), T skill/hook/dispatcher, M references on PR29. Also read B `set_home.py`, `lib_db.py`, `query.py`, `update.py`, `new_phase.py`, `move.py`, `archive.py`, `remove.py`, `handback.py`, `migrate_repo.py`. Record any unsupported or Python-only operations rather than invent parity.

Use Node >=24 for execution, Python 3.12 + PyYAML for oracle, Git CLI, SQLite; run Node24 and 26 on Linux and (CI) macOS when supported. Track exact versions, repo SHAs, optional/skipped tests, script versions and test commands. `npm test` **without** `SMOOTH_BACKLOG_SCRIPTS` may skip oracle tests; a skipped oracle cannot count as pass. Execute `npm run check`, source-format/lint checks if defined, `npm pack --dry-run` and public-package content audit. Windows remains separately deferred unless policy changed.

If shell is unavailable, use authenticated GitHub APIs to inspect and commit source and use CI for reproducible execution. Record any test not actually executed; do not describe it as verified.

## 2. Acceptance model: what a test actually proves

The 270 UCs in the committed matrix are **coverage requirements**, not 270 passing tests. For each UC implement a real test ID in `test(...)` and coverage manifest:

```json
{
  "id": "UC-239", "title": "phase-less source move / incoming dependency race",
  "kind": "two-clone", "test": ".agents/test/behavior/<suite>.test.js",
  "invariants": ["INV-02", "INV-03", "INV-08"],
  "faultGates": ["F-09", "F-10"], "actors": ["A", "B"],
  "policy": "APPROVED|POLICY-BLOCKED|N/A",
  "baseline": "FAIL|PASS|NOT-RUN", "current": "FAIL|PASS|SKIP|BLOCKED",
  "testCommit": "<SHA>", "fixCommit": "<SHA or null>",
  "evidence": "<local sanitized log path or CI run id>", "review": "<SHA/reviewer>"
}
```

Generate a deterministic machine-checkable coverage ledger, e.g. `.agents/docs/implementation/pr3-uc-coverage.json` plus a readable `.agents/docs/implementation/pr3-test-remediation-ledger.md`. Lint that **exactly** UC-001..UC-270 appear once, no missing/duplicate IDs, all mapping references exist, all tags are accepted, policy-blocked rows have a decision ID, and reported coverage uses actual test execution. `existing_test` in the original matrix is a *candidate*; run and assert exact behavior before crediting it. Use tags for normal/invalid/stale/crash/two-writer/opposite order/local+cloud/shared-index, and affected F/D/G/R/V/U state planes.

**Mandatory assertion bundle for shared mutators:** executable Node CLI subprocess, exit code + exact actionable stderr, F=Markdown live/archive content and identity, D=SQLite phase/handoff/event rows plus foreign keys, G=Git HEAD/index/stash/worktree and other staged files, R=**each** remote ref/commit's tree (not only final), V=per-agent view hash, U=config, plus secondary unrelated successful command proving no refused write later leaks. For concurrency collect **both** child exits, before/after snapshots and exact barrier order. For nonmutating commands test whether pull/seen-cache creates the allowed side effects. No unit-test mock assertion alone qualifies for the production transaction/invariant categories.

**Fault harness** must be deterministic: create real bare local Git origin plus at least two independent clones A/B (cloud-like C), controlled consuming repo(s), temp HOME/XDG/BACKLOG_HOME/TMPDIR, fake Git actor identities, per-team agent names, zero real credentials. Use explicit barriers (pipes/fs marker or controlled Git hooks) at F-00..F-13, not probabilistic delays; support SIGKILL, exception, Git write/lock failure, ENOSPC, permissions, remote reject, lost post-ref-update response, malformed DB/YAML, interrupted restart. Build on C `.agents/test/shared-fixtures.js`, `shared-concurrency.js`, `shared-sync.test.js` and `shared-interop.test.js`, but do not take `sleep(ms)` as deterministic synchronization. Inject through scoped test wrapper or local fixture Git hook, not prod instrumentation on BigFan. Assert no external path writes, no secrets in diagnostics, isolated cleanup after abort, and timeouts fail tests. Persist a normalized JSON state snapshot for any failing case.

**Matrix coverage axes:** all 16 invariants INV-01..16; command normal/invalid/stale/SIGKILL/competing clone same/different/opposite order/hybrid/shared worktree; local JSON 129..158; ordered pairs 159..238; targeted high-risk 239..270; 14 F gates for risk-bearing mutators; actor configurations solo human, solo agent, single-member/lead-only team, lead+member, two teams same repo, independent cloud, BigFan+cloud concurrently, third-party reviewer and two consuming repos. Use seeded, reproducible pairwise interaction schedules; **do not attempt 270 × 14 × 10 unchecked full Cartesian executions**. Explicitly enumerate which combinations were selected and why, plus untested combinations by fault gate/invariant.

**Oracle rule:** Python skill is a compatibility reference, not unquestionable safety authority. If Python and Node agree on a behavior that violates an owner-approved invariant, write a contract/policy decision case; do not copy the defect to Node merely for parity. Public CLI must support other organizations in explicit portable modes and must not depend on installed Qwen/BigFan/private repos by default.

## 3. Test-first order: coverage before remediation

1. **H0 baseline** (tests only): pin HEAD of C/B/T/M, reconcile moving PR changes, capture complete existing `npm test` / `npm run check` / Python oracle/Node24&26 results, reproduce each unresolved Codex P0..P2 with pinned prior SHA and current HEAD; label each FIXED-at-current, CONFIRMED-current, NOT-CHECKED, or POLICY-BLOCKED. Baseline known environment failure remains a failure until identified; do not silently skip or redefine it. Preserve the *originally passing* test IDs as a permanent gate.
2. **H1 test apparatus**: isolated local bare remote(s), Python+Node subprocess fixture, branch-scoped Git auth simulation, process barrier controller, fault injection, per-barrier snapshots, deterministic clock, source-phase-less/archived/rename fixtures, UC coverage ledger and invariant checker. First prove intentional-positive and intentional-negative controls of harness (e.g. deliberately introduce a lost staged file and show the assertion catches it). No functional changes in this stage.
3. **H2 regression specification (all 270, test-only)**: implement deterministic runnable tests for every UC as feasible. Reuse existing tests only if their assertion scope matches the UC. Cases that require undecided policy are `POLICY-BLOCKED` with a *neutral probe* and two expected alternatives, not expected-to-pass guesses. In each batch push **test-only commits** to PR3; clearly record red expected failures and failing snapshot. Do not fix logic until the initial comprehensive test inventory and coverage audit are committed (minor test-harness correctness fixes permitted). Ensure no new tests are silently skipped due to optional Python/CI deps.
4. **H3 remediation**: fix **root-cause groups**, not one anonymous patch per failing test. Start with system invariants affecting several commands (canonical identity, merged remote graph, publication boundaries, DB event provenance, actor view/lock isolation), then lifecycle/skills contracts, then portable config and cloud install. On each behavior defect: take first red test, add reduction/regression for failing evidence, implement minimal correct fix, run group tests, **run all previously green tests plus full existing suite**, rerun affected reverse-order/fault cases, record results and commit. If a fix changes expected semantics outside approved policy, STOP that affected workstream and escalate before updating tests.
5. **H4 closing validation**: all policy-resolved UC IDs passing on the **same final SHA** (not a collage of multiple SHAs), no missing/implicitly skipped tests; all historically failing Codex reproducers rerun; `npm test`, `npm run check`, package audit; CI Node24/26 Ubuntu/macOS; Python parity on isolated B skill; cross-org/cloud/host fixture tests. Independently review code + tests + snapshot evidence. Leave PR3 open for owner approval; never merge/publish automatically.

**Regression monotonicity:** After each test-only addition or implementation change: all tests known green at the preceding accepted SHA remain green, with no deletion, broad skip, weakened assertion or `--force` workaround. A red newly introduced test is expected during coverage generation but cannot be mislabeled baseline regression. Remediation batch only accepted when **all earlier accepted tests remain green** and intended batch cases pass. Revert/fix immediately if a previously accepted regression fails. Track intentional policy expectation changes by approval ID and review rather than editing tests opportunistically.

## 4. Commits grouped in coherent batches of no more than 50 UC IDs

Owner rule **“commit in batches of 50”** is interpreted operationally as **at most 50 distinct numbered UCs per coverage/remediation checkpoint**; do not hold 50 defects uncommitted, nor combine unrelated root-cause changes merely to hit a count. Each numbered range has a test-only checkpoint and a subsequent implementation checkpoint. For implementation, commit smaller cohesive changes as needed *within* the batch, without crossing its accepted rollback boundary. Record parent/commit IDs, rerun test counts and ability to restore a prior accepted batch. Do not reset or force-push a shared PR branch; when other agents update it, fetch/reconcile using safe fast-forward/rebase in an isolated worktree, rerun regression gate and re-pin.

| Batch | Immutable UC IDs (count) | Primary surfaces | Required checkpoint |
|---|---|---|---|
| B01 | UC-001..050 (50) | new/update/replan/claim/release/wait | test-only SHA then repaired invariant groups + full earlier green suite |
| B02 | UC-051..100 (50) | wait-done/review request/start/pass/close/move branch/move repo | test-only and repaired checkpoint; B01 green unchanged |
| B03 | UC-101..150 (50) | move repo/archive/pop/mode; local init/next/list/branch/new/set/add/replace/remove/priority/done | checkpoint; B01+B02 green |
| B04 | UC-151..200 (50) | local move/import/archive/update; paired new/update/dependency/move/replan/archive/claim | checkpoint; B01..B03 green |
| B05 | UC-201..250 (50) | paired claim/release/wait/review/close/pop/Node–Python; early targeted faults, cache, DB, dry-run/ENOSPC | checkpoint; B01..B04 green |
| B06 | UC-251..270 (20) | ambiguous pushes, team/session, reviewer identity, cloud onboarding, multi-tenant config, rename/replication | checkpoint; B01..B05 green; policy-blocked only with owner approval pending |

**Within each batch**, plan fresh-session work packets of **<=45min end-to-end incl review**: for 8-case SHARED command families, split normal/invalid/stale/kill (4) from two-clone/hybrid/shared-index (4). LOCAL use 2–4 UCs per packet, paired command interactions use one reversible ordered pair (2 UCs) or two pairs (4) per packet; targeted use 1–3 UCs depending on complexity. Never schedule >45min work just to fill a batch. If timeout/compaction occurs, fail task, refine smaller, preserve tests and evidence in the authoritative backlog. Do not create one backlog item per UC or one per packet without owner approval: task sections within an existing approved item are the default, and every fresh session reads the item/backlog. A team lead may parallelize disjoint test files but no two authors edit the same file or shared fixture simultaneously; integrate one writer at a time through PR branch commits.

**Batch gate semantics:** each of B01–B06 has: `TESTS-COMMITTED` (all UC IDs mapped/green/red/block with evidence), `REMEDIATED` (all owner-resolved cases green; no prior green failure; review PASS), `ACCEPTED` (reference SHA + reversible coherent delta). A high-risk B06 decision must not prevent B01–B05 tests. Keep source/DB migration and configuration fan-out changes separately reviewable even if several UC IDs share a batch.

## 5. Refined work breakdown (DAG, roles, estimates and artifacts)

**Work package constraints:** source-derived symbols, applicable skills and test names must be loaded fresh; one task one primary outcome, one file writer, <=45min inclusive of independent review. The following are **work-package templates**: subdivide at execution time if a test family is bigger than budget. Primary owner leads and independent reviewer are different agents; third adversarial reviewer follows M process. Tests and fixes are paired by invariant as appropriate but preserve phase-wide test-first baseline.

### Foundation: 8 small sequential/parallel tasks

| ID | Minutes max | Output / DoD (command or evidence) | Depends |
|---|---|---|---|
| H0.1 | 30 | 4-repo SHA inventory, PR3 comments+existing backlog policy/branch state, no live edits | none |
| H0.2 | 35 | Node24/26, PyYAML/oracle, `npm test`, `npm run check`, exact baseline summary+skip/failure list | H0.1 |
| H0.3 | 40 | historical Codex R01–R12 reproducer index and current-HEAD result; no unverified assertions | H0.1,H0.2 |
| H1.1 | 40 | disposable 2–3 clone origin with isolated env and remote capture (`shared-fixtures.js`) | H0.2 |
| H1.2 | 40 | schedule/barrier controller + child process/timeout/kill/exit recorder (real subprocess) | H1.1 |
| H1.3 | 40 | F/D/G/R/V/U snapshot+SQLite graph/event checker, safety negative control | H1.1 |
| H1.4 | 35 | configurable F-00..F-13 Git/crash/auth/disk fault seam, explicit no sleep | H1.2,H1.3 |
| H1.5 | 35 | coverage manifest validator + invariant/source/test mapping; all 270 IDs initially NOT-RUN | H1.3 |

### Coverage packets: schedule by UC ID, not by existing test-file count

**S01–S16, each <=2 packets of 4 UCs:** SHARED 16 surfaces: new 001–008; update field 009–016; replan 017–024; claim 025–032; release 033–040; waiting 041–048; waiting-done 049–056; request-review 057–064; start-review 065–072; review/pass 073–080; close 081–088; move branch 089–096; move repo 097–104; archive 105–112; pop-claim 113–120; mode 121–128. For each family test 4 deterministic single writer/fault cases and 4 competing/hybrid cases, assert snapshot bundle. Test-only first; implementation assigned to same affected invariant cluster after H2 is fully committed.

**L01–L08, each <=45m, 2–4 UCs:** LOCAL 129–158 grouped by native command semantics. Cover destructive `init clean`, no-verb/next, list/branch/new, set/add/replace/remove, priority/done, move/import/archive, local `update` version and local-vs-shared mode isolation. Verify public default local mode never probes SmoothSDLC private credentials/path and does not write external shared origin.

**P01–P20, each <=45m, 4 UCs = two swapped-order pairs:** P01 159–162, P02 163–166, ... P20 235–238. Two real isolated processes/clones, both scheduling orders, same and different item/folder, Python+Node specifically in final pairs; compare remote *intermediate* trees and mirror/event history. An analysis UC whose matrix text expects a different actor ordering takes precedence over this batching shorthand.

**X01–X08, each <=45m, 4 UCs except subdivide high-risk ones:** X01 239–242 canonical ID/cycle/view/YAML; X02 243–246 SQLite row reuse/replay/dry-run/move partial scan; X03 247–250 rollback/ENOSPC; X04 251–254 ambiguous publication/session gates/lead authority; X05 255–258 stale review/two-team duplicate/identity/external Git; X06 259–262 cloud bootstrap/auth/hybrid/pinned review; X07 263–266 multi-tenant/circular config/public neutrality/rename; X08 267–270 private fan-out/symlink/single-member/mode switch. Some X packets are multiple 30–45m tasks, not rigid four-case sessions.

**F01–Fnn (after test census):** parameterized fault-stage covering-array packets by *distinct root-cause cluster* (not arbitrary Cartesian expansion). At minimum each F-00..13 gate is executed on a representative mutator and one relevant ordered pair. Risky publish/rebase gates F06–F12 must cover `new`, `update`, `move`, `archive`, close/claim and one Python–Node operation where applicable. Record chosen combinations, excluded combinations and justification in report. Include restart tests that simulate an interrupted process with a separate process (not merely catching an exception in the same JS invocation).

### Remediation packets: ordered by system safety dependency

| ID | Max/packet | Code area and failed-case focus | Predecessors / gate |
|---|---|---|---|
| R1 | 45 | canonical item/seq/slug/archived/renamed-repo mapping across `store/db/sync/team/seen` (INV-02,03,12; R01) | all tests committed; relevant red tests |
| R2 | 45 | merged-remote graph validation and incoming dependencies; `update/move/new/archival` guards (INV-03,08; R08) | R1 and red UC-239/240/pairs |
| R3 | 45 | Git publication is single complete remote state, safe conflict replay, no partial mirror events (INV-01,05,06,08; R07) | R1/R2 source contracts, F6..F12 tests |
| R4 | 45 | journal, preflight, fsync/ENOSPC/kill rollback and ambiguous push handling (INV-05,06,11; R11) | R3, owner decision on F-11 retry |
| R5 | 45 | view cache identity/content, refresh boundaries and permission refusal policy (INV-04; R02) | R1, cache policy decision |
| R6 | 45 | same checkout/independent clone/foreign git lock scope; Python+Node interoperability, unrelated index isolation (INV-07,08; R05/R10) | R3 and actual race tests |
| R7 | 45 | authority and lifecycle: claimant, reviewer, stale review, forced action, lead reminder+20m; no retired-session claim; SHA-pinned verdict (INV-09,10; R04/R06) | owner actor/evidence decisions |
| R8 | 45 | cloud/public package neutral config, multi-tenant/bootstrap, historical aliases, config fanout contract; local-v1 compatibility (INV-13,15; R03/R12) | owner config/alias/permissions decisions |
| R9 | 45 | telemetry, redaction, help/command parity, dry-run, archive and misleading exit-code messages (INV-11,14,16) | affected tests and prior accepted fixes |
| R10 | 45 | full regression cross-product/CI gates, final coverage manifest and adversarial independent rereview | R1–R9 & all batches |

These R lines describe root-cause **workstreams**, not oversized single sessions. Break each workstream by module+failing invariant and separate test/fix/review/verification tasks, each <=45m. Never make broad structural rewrites without source trace, negative tests and rollback. Treat the existing B Python skill as an independent client of the data format: preserve compatibility or explicitly block the relevant transition until a coordinated migration is authorized.

**Cross-repo implementation dependencies:** If config fan-out needs B Actions or private T skill changes, write a scoped contract and independent test file in C; create/link the proper authorized backlog task only after owner approves repository mutation. Cloud fixture tests must work in disposable Git clones without accessing actual SmoothSDLC secrets or clones. No direct PR changes to B/T/M as part of this handoff unless separately authorized.

## 6. BigFan-specific runtime simulations — must execute as tests

- **Single live host, same checked-out repo / multiple processes:** two autonomous team members operate under distinct sessions but share the BigFan workspace, `.git/index`, ports, service state, and possibly the same checked-out branch; external Git command ignores Node CLI advisory lock. Simulate two CLIs and one raw Git process touching an unrelated staged/tracked/untracked file, branch movement, lock contention, worktree dirty, Git auto-stash, exception at each relevant F stage. Assert actor A cannot commit B's unrelated edits; remote backlog is valid; all existing index contents survive. Tests run in temp fake BigFan worktree, NOT BigFan host.
- **Two independent teams in same consuming repo:** overlapping backlog pop/claim, duplicate semantic item creation, claim work cap, wait, release, review of another team, stale reviewer and stalled lead. Both leads and two members; sessions addressed to correct incarnation; reviewer independence. Existing skill's post-close strict session boundary belongs to orchestration, but CLI `--by` may not authenticate the session. Characterize that gap; do not claim CLI can magically terminate Qwen.
- **One-team / lead-only:** solo lead no active member, `query.py --plan` Python-only, new Qwen member registered/retired, delayed messenger, restart dispatcher, replay item closure, stale dispatch; no auto claim from retired member after close. Preserve authoritative backlog item + explicit evidence as sole cross-session work state. No chat-summary handoff.
- **Cloud or hybrid:** truly independent Codex/Claude checkout, missing Qwen skill, new HOME/XDG, no SSH BigFan, detached/shallow Git origin, private backlog token with read-only or write permissions, concurrent local and cloud push, independent author and reviewer, deprovisioned cloud clone, unavailable upstream, credentials expiry. Cloud read-only review cannot attest live BigFan deployment; only authorized local runtime evidence pinned to deployment SHA counts.
- **Cloud policy bootstrap:** npm pack/install (no mandatory SmoothSDLC private repository); explicit repo/project bootstrap (nonsecret config can locate a private backlog URL; credentials supplied by runner), clone B to isolated workspace, load/install appropriate backlog skill/CLI with pinned version, `TEAM_REPOSITORY`/branch/actor identity, query/mutate with permission checks, record backlog evidence; re-create in a fresh ephemeral job using only committed config/backlog. Test distinct unrelated external organization with no `SmoothSDLC` values.
- **Backlog rename/alias:** consuming Git remote is now `SmoothSDLC/smooth-backlog-cli`; backlog's historical folder is `SmoothSDLC/backlog-cli`. Seed both conditions, prove explicit stable alias; no duplicate source, no dropped event/history, no cross-org path selection.
- **Multi-repository fan-out:** B central proposed `.backlog/config.json` publishes to private consuming repos via reviewed GitHub Actions (subject to owner authorization). Simulate new repo onboarding, simultaneous config change in consuming repo, branch protection, PR mode vs direct push, partial fleet push failure, changed alias, retries, rollback, stale config SHA and secrets absence. Do not write B workflow yet within PR3 unless separately approved.

## 7. Mandatory human escalation: policy branches not to invent

The analysis identifies real conflicting policy expectations. **Escalate decisions in the current chat before implementing behavior that depends on them.** Preserve independent progress. Record `DEC-xx`, owner response/date, affected UC IDs and old-vs-approved expectation; write/modify tests only after decision. Recommended candidates below are **proposals, NOT authority**:

| ID | Question requiring human policy | Proposed safe default if owner agrees | Cases blocked |
|---|---|---|---|
| DEC-01 | **Stale view when .git actor cache is unwritable/missing**: is a previous read required to enforce stale-write protection, or is last-read view merely advisory? | For an actor who explicitly read a version, **fail closed** (actionable cache error; no mutation) rather than silently waive stale check. First blind writes require explicit optimistic base or documented rule. | UC-241, variants 003/011/019, INV-04 |
| DEC-02 | **Identity and authority**: is `--by` trusted agent declaration, or must the CLI reject retired sessions, self-review, unauthorized lead closure and spoofed agents? | Treat `--by` as attribution, NOT authentication; enforce independent reviewer/claimer/20min lead fallback via verifiable actor/session controller capability or policy engine. Require explicit scope and avoid making public CLI dependent on Qwen. | UC-252..257,262, INV-09/10 |
| DEC-03 | **Portable config and mode precedence**: exact `.backlog/config.json` schema/placement; generic local vs local filesystem vs separate remote Git; precedence explicit flags/env/repo config/XDG and protection against cross-tenant overrides? | Explicit CLI > environment > repository-checked-in nonsecret config > user default; invalid explicit config stops rather than falling back. Namespace v1 local `.backlog/config.json` vs v2 shared config explicitly. Repo-local/tenant-scoped effective mode should override unsafe machine-global ambiguity. | C-01..04,C-06,C-13,C-18; UC-259,263–265,270 |
| DEC-04 | **Central B config distribution**: sync private repo `.backlog/config.json` via GitHub Actions push directly or PR with owner approval? Does consuming repo override central settings? | Central B is authoritative; versioned SHA, CI-generated PRs to each private consuming repo, no silent overwrite of local changes, alert on partial fan-out; local overrides only explicit allowlist. | C-07..10,C-16; UC-264,267 |
| DEC-05 | **Historical rename and item identity:** preserve `SmoothSDLC/backlog-cli` folder alias to new `smooth-backlog-cli`, and what identifies an item immutably (seq, slug, GUID)? | Stable alias for existing history; internal immutable id independent of mutable seq/filename; no automatic migration without validated reversible mapping. | C-05,C-09; UC-239,243,266, INV-02 |
| DEC-06 | **Uncertain remote push receipt (F-11)**: push may have succeeded but CLI returned failure. May it auto-retry `new`/move? | Inspect origin and an operation-id/expected tree before retry; if uncertain and cannot establish idempotency, report explicit ambiguous result and require reconciliation, never duplicate. | UC-251,F-11, INV-05/11 |
| DEC-07 | **Review evidence**: may remote cloud reviewer PASS code without BigFan runtime readback? Must review bind a source SHA and deployed SHA? | Code-only PASS tied to immutable source SHA; deployment acceptance separate and requires authorized BigFan runtime evidence. Changed SHA invalidates earlier code PASS for new diff. | UC-262, lifecycle review families, INV-09/16 |
| DEC-08 | **Archived state + public generic policy:** should an archived item be reopenable, and must public CLI require SmoothSDLC review_refs/work_class/team policies? | Archived immutable unless explicit restoration operation with event/history integrity; public defaults generic with optional explicit policy plugin, private B/T skills layer additional rules. | C-18; UC-129..158 and archive/move families |

Policy-blocked tests still need runnable **characterization fixtures**; they should not assert invented acceptance behavior. Do not silently use a blanket `skip` to inflate green count. Ask owner exact options in chat, with concrete consequence and which UCs are blocked; continue all other test work autonomously.

## 8. Acceptance proof and handoff back

Final implementation evidence (under `.agents/docs/implementation/` on PR3):

1. **Environment+SHAs:** head/base, B/T/M, Node/Python/Git, skill SHA, CI run IDs; no BigFan production runtime mutations.
2. **Coverage accounting:** UC001..270 exactly once; per-UC test file/name, variant barrier, status; 16 invariants all tested; selected F-00..13 and cross-product omissions; every known Codex P0-P2 reproducers traced to original review link, current run and fix SHA.
3. **Test batches B01..B06:** two-stage test-only then accepted-fix checkpoints, each ≤50 UCs, parent SHAs and complete regression totals after each; any red prior accepted test blocks progression. No test weakening or unapproved skip.
4. **Remote consistency:** snapshot of every publication checkpoint, file/YAML and DB/event agreement, no partial origin commits, verified scope/index/cache, no secret leak, no broken deps/seq, no stale overwrite; zero unintended partial write on error.
5. **Portability:** outside-org public install smoke; local-v1 untouched; explicit shared local-path/remote modes; cloud ephemeral read/write permission branches; rename alias and central config fan-out tests where owner-approved. Explain if private integration automation belongs in B or T rather than PR3.
6. **Independent review:** peer review + M adversarial review (confidence classes), repeat every historical reproducer, documentation and help validated, CI Linux/macOS Node24/26 required jobs green; `npm pack --dry-run` audited.
7. **Open decisions:** each DEC owner response/evidence and affected blocked UCs. If any remain, PR3 MUST stay open and marked incomplete, without claiming 270/270 acceptance.
8. **No merge:** PR link, final HEAD SHA, total green/red/skipped/policy-blocked IDs, new regressions fixed, 50-case checkpoint SHAs, known environmental blockers, follow-up cross-repo changes and proposed next steps.

**Completion contract:** Test code exists for every applicable UC, accepted behavior is proven with reproducible tests and all previously green tests still pass on same final PR SHA, each fixing commit is scoped and independently reviewable, BigFan destructive scenarios simulated solely in disposable fixtures, owner policy decisions not fabricated, PR3 remains UNMERGED pending explicit owner approval.

---

## Immediate execution prompt for next session

> Read this handoff and PR3's committed `.agents/docs/analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md` **in full**. Refresh all four repository HEADs and PR3 review state. Work only on PR3 branch `team-cli-parity-1`. Independently establish the actual CLI/Python/orchestration contracts; build deterministic real-process/bare-repo barrier harness; add and commit test-only coverage for UC-001..270 in batches of ≤50, marking unresolved policy scenarios explicitly. Only after test inventory is committed, remediate failing invariant classes incrementally, maintaining all prior passing tests at each checkpoint. Commit coherent reversible changes; produce coverage/evidence ledgers and keep PR3 open/unmerged. Escalate only true owner-policy conflicts with exact choices and case IDs; continue unblocked work autonomously. Never test destructive scenarios on live BigFan or shared production backlog; never deploy, merge, modify main or publish.