# PR #3 — analysis handoff (COMPLETED / historical reference)

**Updated:** 2026-10-26. **Not an executable work order.** This document originally commissioned an analysis-only session. That session finished its deliverable: [the 270-use-case interaction and adversarial behavior matrix](../analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md), committed on the existing PR #3 branch. Its historical source text remains available through this file's Git history. Do not repeat the analysis-only assignment or confuse its old SHA pins with current HEAD.

## Current authority and scope

1. **Owner contract:** [Atomic item execution and dependency handoffs](../specs/2026-10-26-atomic-item-execution-dependency-handoffs.md) (2026-10-26).
2. **Implementation execution plan:** [Updated PR #3 test-first implementation handoff](2026-10-25-pr3-test-first-implementation-handoff.md). This is planning/agent-orientation documentation only; actual item state, claimed executor, review and dependencies belong in the authoritative backlog.
3. **Authoritative source item:** `SmoothSDLC/smoothsdlc-backlog` `SmoothSDLC/backlog-cli/phases/030-pull-request-3-patch-item-placeholder-content-to-come-from-chatgpt.md`, using **legacy item repository identity `SmoothSDLC/backlog-cli`**, branch `team-cli-parity-1`. That file contains item-level PR3 source requirements; the old placeholder name/metadata must be normalized by a backed, authorized backlog mutation.
4. **Current coding methods:** `SmoothSDLC/cody-coding-model` PR #29 `references-review-v2` / `references/methods/refine-and-split.md`; PR #23 is already merged and does not substitute for PR #29.
5. **Qwen runtime:** the topology repository, draft PR #1 `fix/qwen-team-member-lifecycle-reuse` — untested runtime patch, not a completed deployment.

## Corrections to the 2026-10-25 instructions

- **One item = one execution/review/close/new-session unit.** The team lead refines an original work item and creates new, *separate* independently claimable backlog items if work must be split; create explicit `depends_on` edges and parent-to-child provenance. Do not treat test batches, 270 UC IDs, file sections or per-task internal state as equivalent to individual backlog items.
- **Self-organizing team:** the lead creates/publishes the DAG and exposes claimable items. Team members independently make an **atomic remote-published claim**. No lead-assigned claimant, read-only dispatch as reservation or implicit carryover from retired agent sessions.
- **Dependency handoff is mandatory:** the producer of an item that has a downstream consumer writes a committed dependency-handoff artifact in the implementation repository, links it in the backlog, and obtains lead verification/approval against the exact artifact/commit and downstream interface **before dependent dispatch**. This *artifact* is distinct from an old conversational session handoff (which remains prohibited).
- **Session reset:** close -> `CLOSED <seq>` -> no more member tool calls -> actual Qwen release/cleanup/persisted roster removal -> fresh identical canonical name, no previous context -> read current item/backlog/artifact. A reset failure is a dispatch blocker, never a reason to reuse an old session.
- **Owner approval remains mandatory:** no merge/publish/release (PR3 merge can publish), destructive tests against the live central backlog, a deployment to the owner's workstation, forced refs or writes to other repositories without their separately scoped authorization. Use isolated local clone/repo fixtures for adversarial tests.
- **Analysis evidence discipline:** existing matrix rows and previous Codex reports are specifications/leads, not passing executions. Explicitly track NOT-RUN, policy-blocked, SHA-pinned reproducible failures, and source-derived observations.

## Frozen analysis artifacts and acceptance references

- `../analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md` — 270 numbered UC requirements; 16 invariants; F-00..F-13 injection points; command, ordered-pair and cross-agent matrix; risk register.
- PR3 current `src/shared/` implementation and `.agents/test/` fixtures — re-inspect latest HEAD, do not treat 2026-10-25 line numbers or historical HEAD as immutable.
- Prior two-pass review inventory is retained in PR commits, issues/review threads and the matrix. Check unresolved Codex findings at execution time.

**Next action:** execute the separately refined, externally claimable backlog item(s) following the updated test-first implementation handoff. The matrix is complete as an *analysis document*, not as a test suite. A documentation handoff file must not become a second source of state.
