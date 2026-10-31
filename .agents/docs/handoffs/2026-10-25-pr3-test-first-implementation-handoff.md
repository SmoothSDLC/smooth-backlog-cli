# PR #3 — test-first item lifecycle remediation (updated execution handoff)

**Updated:** 2026-10-26. **Status:** scoped work program, not proof of implementation. Applies to `SmoothSDLC/smooth-backlog-cli` PR #3 **existing branch `team-cli-parity-1`**, not `main`. Owner review is mandatory before merge (merging can publish a release).

**Priority authority:** [2026-10-26 atomic-item contract](../specs/2026-10-26-atomic-item-execution-dependency-handoffs.md), then backlog item 030 (legacy folder `SmoothSDLC/backlog-cli`), then [270-UC behavior matrix](../analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md), then this document. `SmoothSDLC/cody-coding-model` PR #29 `references/methods/refine-and-split.md` is the newer cross-repo method; coding-model PR #23 already merged. Old instructions to split into task sections of one item or to let a waiting claimer pick another implementation item are superseded.

## 0. Refresh and verify

Use authenticated private GitHub access or an isolated disposable checkout; confirm PR3 current HEAD, newest review threads and test status, and the source item 030 in `SmoothSDLC/smoothsdlc-backlog`. Read current `src/shared/{team,lifecycle,update,pop,sync,new}.js`, `src/args.js`, `COMMANDS.md`, existing .agents tests and the Python oracle `skill/backlog/scripts/`. Do not assume 2026-10-25 SHAs describe current HEAD. Record source-derived versus actually executed evidence.

No source modification should be accepted without a **deterministic red test** for the current defect and green proof on the patched head. Keep the whole formerly passing regression suite green. Run `npm test`, `npm run check`, and Python-oracle checks with `SMOOTH_BACKLOG_SCRIPTS` set; tests skipped without the oracle are not passes. Use Node CI and independent review. Do not run live destructive tests, access the owner's workstation credentials or mistake GitHub inspection for executable verification.

## 1. Team lead's initial refinement (a required work phase, not an optional prelude)

The lead accepts **source item 030** and inspects latest source, other open work items (notably existing backlog-cli 025 and 027), reviewers, files/tests and dependency edges. If <=45 min inclusive of review is not realistic, it **creates new named backlog items** through supported backlog commands. Each child: `--split-from 030`, explicit `--depends-on <id...|none>`, `work_class`, `review_classes`, `review_refs`, `estimate_min <=45`, file ownership, inputs/outputs, environment, precise red/green test evidence, review and rollback/DoD. Publish and re-query each item; maintain a parent -> actual child ID registry; never guess child numbers or regenerate existing children.

The source becomes a tracking/acceptance item **without duplicate implementation ownership**. Until a native nonclaimable parent state/derived finish policy is approved and tested, do not falsely mark it done or offer it to another implementing agent.

Suggested **separate item outcomes** (illustrative placeholders, NOT already-created numbered items):

| Work item | Target outcome | Depends on |
|---|---|---|
| P0-A | Tests and fix: claimer-only close, independent PASS, no unclaimed or reviewer close, `--status done` bypass refusal, reject mixed status/actions, remove 3-minute claim | none |
| P0-B | Tests and fix: one outstanding claim across active, waiting, requested/in-review and passed-awaiting-close; force cannot bypass | none (can run concurrently with P0-A if write ownership isolated) |
| P0-C | Tests and fix: post-rebase Git claim/dependency race, two-agent/same-name and two-clone races, graph/SQLite/remote preservation | P0-A/B only for changed shared invariants |
| P0-D | Handoff acceptance persistence and claim/dispatch gate contract for dependent items, with wrong/missing/revoked SHA and review tests; **coordinate** backlog Python + topology migration without embedding a scheduler in public CLI | P0-A and dependency graph correctness |
| P0-E | Complete regression, 270-UC coverage ledger, independent adversarial review, packaging/CI and cross-client compatibility | P0-A..D |
| T (different repo) | Qwen shutdown/release/new-session and dispatcher/wake gate on approved dependent handoff | P0-C/D; belongs to topology PR1, never implemented in public CLI |

If a candidate exceeds 45min (including independent review), refine it again into new item(s); never silently treat the table's labels as atomic backlog IDs. Schedule independent branches/files concurrently where feasible, serialize shared file writers.

## 2. Current known defects: must be reproducibly retested

- `src/shared/lifecycle.js` close path currently computes `by || fm.claimed_by`, accepts alternate closers, and its `closeNow` text advertises reviewer close after 3 minutes. Owner rule is original-claimer-only, or **authenticated + recorded >=20min reminder** lead exception. Until a trusted mechanism exists, exceptional close must fail closed.
- `src/shared/update.js` permits direct status done after review PASS without equivalent closer authorization. Status-only/mixed action paths must be unable to complete a team item without full close gate.
- `src/shared/team.js` claim refusal excludes items waiting/under review; `src/shared/lifecycle.js`, `src/shared/update.js` and `src/shared/sync.js` accept force/bypass. Capacity is **one outstanding claimed implementation item**, irrespective of wait/review state.
- Both Git and SQLite/mirror state must remain coherent under two independent clones, multiple agents on one shared checkout, stale preflight and interrupted publish; revalidate **after** integrating remote changes.
- `--by` / `--claim` strings do not authenticate an agent. Record the limitation explicitly; do not claim the identity/lead-override problem is solved with string comparison.

These are inspected/historical leads pending deterministic runtime repro, NOT current-pass evidence.

## 3. Cross-item dependency handoff (new mandatory acceptance barrier)

Before final review/closure, a **producer with dependents** commits `.agents/docs/dependency-handoffs/<item-id>-<slug>.md` in the implementation repo containing its exact output contract, implementation SHA, tests, runtime/data/config changes, recovery, assumptions, hazards, and consumer start requirements; link pinned evidence in the item. The lead checks the artifact against every dependent item and records explicit lead approval (SHA, path, timestamp, identity) durably. A new dependent **cannot be offered/claimed/dispatched** if any predecessor is not closed or its approval record is missing/stale/wrong-branch/wrong-SHA. A new member's session starts blank and learns the approved artifact from the authoritative backlog; it never reuses old model session data. This requires persisted validation, not a prompt-only promise.

Python backlog skill parity, review/schema migration and topology dispatcher/wake changes belong in their proper repositories and are explicit dependency gates. Do NOT insert a Qwen session-manager into public backlog CLI. Do not let the obsolete blanket "never create handoff documents" rule prohibit these **specific per-dependency verified artifacts**; the retired floating NEXT-BRANCH-HANDOFF pattern remains prohibited.

## 4. Test inventory, failure injection and commit discipline

The existing [matrix](../analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md) defines immutable UC-001..270, INV-01..16 and F-00..13; that is a **requirement census**, not 270 passing tests. Produce a one-to-one ledger `UC -> test ID/path -> baseline red/green/block -> current run/CI evidence -> fix SHA -> independent review`. Check exactly 270 unique IDs. Record explicit POLICY-BLOCKED rows for undecided lead identity/parent/handoff schema choices.

Execute with disposable bare local Git origins and clones A/B/C, raw shared worktree Git interference, deterministic barriers/kill and damaged data fixtures, not probabilistic `sleep` races. Capture intermediate remote trees, local Git stage/dirty state, Markdown identity/events, mirror SQLite rows and secrets-safe error output, both process results, and recovery proof. Test same/different item claims by same/different actor, waiting/under-review cap, outside reviewer, no-SHA or stale lead handoff acceptance, wrong repository identity, former backlog folder mapping, and interrupted close/shutdown ordering.

Keep original 50-UC coverage checkpoints (UC-001..050, 051..100, 101..150, 151..200, 201..250, 251..270) as **testing batches**, NOT work-item boundaries. Each executable item has independent scope and a fresh session. Test-only commits precede logic fixes; every accepted fix preserves earlier green tests. Never suppress failing tests, weaken assertions, remove validations or report skipped oracle as green.

## 5. Termination and multi-repo gates

When the claimed child has PASS and any required producer handoff approval: its **claimer** executes `--close`, returns `CLOSED <seq>`, makes no next tool call. The lead/dispatcher requests shutdown and verifies Qwen process/task cleanup, serialized roster removal, persistence, canonical-name release. Only then may a new same-name member session spawn with no prior context. Consumer item becomes eligible only when **all published dependency and approved handoff gates** are satisfied. Independent ready children may execute concurrently.

The Qwen release source patch in the topology repository, draft PR #1, is a separate runtime implementation, still subject to build/typecheck, vendored bundle regeneration, unit fixture proofs, 20 same-name respawns and controlled live rollback checks on the owner's workstation; no deployment or merge from this PR3 work.

Owner acceptance of **original item 030** occurs only after all created implementation children, downstream integration/deployment/verification items, independent peer and adversarial review gates, final test/cutover evidence and approved handoffs pass. The lead then completes any approved original-parent close semantics and ends the team session. `idle` is never team completion. **Do not merge PR3 or publish a release without owner review.**
