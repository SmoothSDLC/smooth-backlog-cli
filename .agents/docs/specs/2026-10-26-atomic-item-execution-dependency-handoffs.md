# Atomic backlog item execution and dependency handoff contract (owner, 2026-10-26)

**State:** required target contract; NOT evidence that any runtime, CLI, Python skill or deployment to the owner's workstation currently enforces it. Scope: backlog CLI PR #3, coding-model refinement/review methods, topology Qwen team-lifecycle PR #1, and authoritative backlog skill. Owner approval required before PR #3 merge/release and before a deployment to the owner's workstation.

## 1. Atomic units and authority

1. A **backlog item**, identified by canonical repository/branch/seq or stable slug, is the minimum separately executable, claimable, reviewable and closable implementation unit. A task section within one item is not an independent agent execution or lifecycle unit.
2. Team lead accepts one original item, inspects implementation surface/dependencies, refines it, and if too large to complete independently within <=45 minutes *including review*, creates **new separately named backlog items** with `--split-from` provenance, required work/review metadata and actual `depends_on` edges. If the *same team* will do the work, it owns this refinement and publishes the created item DAG before dispatch. Do not assume hypothetical child IDs (e.g. 240–243) already exist.
3. The source item is a tracking/acceptance parent if split, **not simultaneously an independently claimed duplicate implementation item**. Record actual child identifiers, evidence, expected integration/verification gates and completion criteria on the parent. Native nonclaimable-parent behavior is a separate design/test requirement; do not invent a state.
4. Eligible teammates independently claim ready items through an atomic **published** `backlog pop --agent ... --claim-now --json` or `backlog update <id> --claim <agent>`. A lead suggestion, read-only `query --plan`, dispatcher message, or a locally unpushed Git modification is never an assignment.
5. At most one unfinished *claimed implementation item* per agent across `in_progress`, waiting for external work, requested/in-review, passed-awaiting-close. Independent peer review is not another implementation claim. `--force` must not bypass this. Claims and dependencies must be revalidated after concurrent remote integration.
6. Independent peer review must PASS on identified evidence/commit; only the authorized original/current claimer closes the item. A reviewer cannot close. **Untrusted `--by` is not authentication.** Exceptional lead close is disabled until authenticated role plus recorded reminder and >=20-minute interval, fresh state check and audit reason are tested. `--status done` cannot bypass lifecycle checks.
7. Successful close triggers `CLOSED <seq>`; the member must perform no subsequent tool calls or claim. Coordinator requests shutdown, waits for **actual Qwen termination, task cleanup, roster/name release and persisted removal**, and only then spawns the same canonical member name in a **new session with empty prior context**. Failure to prove release blocks respawn and future assignment.

## 2. Mandatory dependency handoff artifact

For **every completed item consumed by one or more dependent items**, its claimer authors an explicit **dependency-handoff document** before requesting final review/closure. This is **not** a session-to-session conversational handoff and does not grant access to previous transcript, prompt, tool history or model memory. It is durable, independently readable source-of-truth evidence.

Location: committed in the appropriate implementation repository at `.agents/docs/dependency-handoffs/<producer-seq>-<slug>.md` (or a project-standard reviewed equivalent), and **linked by immutable commit SHA** in the producer's backlog item and each consumer's input section. Avoid the backlog repository's retired floating NEXT-BRANCH-HANDOFF pattern; these artifacts exist only for explicit item dependency edges.

Each artifact MUST include: producer repo/branch/item and commit SHA; exact consuming item(s) or declared output interface for later consumers; delivered files/symbols/interfaces/schema/config and changed behavior; relevant decisions and contracts; test/review evidence (commands, result, CI ID); deployment/config/data or environment mutations and how to validate/recover; known defects/risks/remaining assumptions; required prerequisites and concrete next-item start checks; no secrets or unverifiable claims.

**Review/dispatch barrier:** the lead independently reads the committed artifact and applicable work evidence; validates that every relevant dependent item's inputs are satisfied; records **handoff approval** with lead identity, UTC timestamp, artifact path and immutable SHA in the producer and consumer item record. An independent peer PASS does not substitute for this lead acceptance. An item may be `done` yet its downstream work remains blocked until that approval. The dispatcher/lead MUST fail closed if artifact is missing, uncommitted, stale after producer amendments, unapproved, refers to wrong branch/SHA, conflicts with consumer contract, or if published backlog dependency state is stale. A producer without dependents needs no dependency artifact.

This gate must be enforced by authoritative orchestration and/or CLI-owned persisted metadata, **not merely by text instructions**. Any schema change needs Python and Node parity, safe migration/read compatibility, concurrency and recovery tests. Do not use filesystem existence alone as authorization.

## 3. Execution scheduling / review / lifecycle ordering

```text
Original source item -> lead verifies/refines -> lead creates+publishes child DAG
    -> ready child: fresh teammate session -> published claim -> execute
    -> review + corrections -> dependency artifact (if consumers)
    -> lead approves dependency handoff -> claimer closes -> CLOSED
    -> request_shutdown -> termination/task cleanup/roster persist verified
    -> spawn fresh teammate with canonical name -> new eligible claim
Dependent item is eligible only if every predecessor is done AND its required
handoff exists, has pinned evidence, is lead-approved and matches the consumer.
Independent siblings may execute concurrently; shared-file writers serialize.
Last dependent/integration/verification item done + all review/approval gates ->
lead final acceptance of original tracking item -> end lead/team session.
```

An agent may **review other items** while eligible within its existing claimed work session without acquiring another implementation claim. There is no separate per-task backlog-state machine and no CLI scheduling engine.

## 4. Repo responsibilities and cutover

| Repository / ref | Responsibility |
|---|---|
| `smooth-backlog-cli` PR3, `team-cli-parity-1` | New/update/split/depends-on, claim/close/review invariant and merged-remote checks; portable public CLI with organization-specific configuration; deterministic isolation, race and rejection tests; no session spawning |
| `smoothsdlc-backlog` authoritative Python skill | Same item, claim and closure contracts at least until full CLI cutover; procedure for dependency artifacts, no direct Markdown/SQLite edits; preserve historical `SmoothSDLC/backlog-cli` folder mapping |
| `cody-coding-model` active refinement methods | Refine source -> create distinct child items -> reviewed dependency outputs, independent review and final lead gate |
| the topology repository, draft Qwen PR1 | Team lead/member skills, dispatcher/wake, Qwen same-name release patch, dependency approval dispatch barrier, proof suite + deployed upgrade/rollback gate |

CLI/skill inconsistencies are **known unresolved** at baseline 2026-10-26: `src/shared/lifecycle.js` accepts arbitrary closer and emits 3-minute fallback text; `src/shared/update.js` accepts direct status done; `src/shared/team.js`/sync claim limit excludes waits/reviews and permits force. Topology draft PR1 has unrun Qwen source/bundle tests and is **not deployed**. No validation here constitutes passing executable tests.

## 5. Minimum falsifiable gates before cutover

- Item and child lineage: no duplicate children on retried refinement; valid dependency DAG, parent not double-executed; independent ready children can race safely.
- Review/closure: no unclaimed/nonclaimer/reviewer close, no direct done bypass, one outstanding claim including waiting/review; enforce after Git rebase/concurrent writes; CLI/Python compatible.
- Handoff: missing, wrong-SHA, unreviewed, changed-after-review, wrong consumer/branch, failed publication, cycle and incomplete parent refuse dependent dispatch/claim; approval persistence is auditable.
- Runtime: 20 consecutive same-name terminate/release/respawn cycles without stale task/roster/inbox/context; close with dependent handoff; shutdown or release failure blocks replacement; no stale dispatch to an expired incarnation.
- Integration: disposable owner-workstation-like shared checkout, independent cloud clones, lost-push-reply, crash/restart, conflicting concurrent producers, disconnected network and retained unrelated staged files. Run Qwen source tests, bundle build/typecheck, Node/Python tests and controlled owner-workstation proof **before deployment**. Never merge PR3 automatically; merge may publish npm release.

## 6. Pending design decisions (fail closed until accepted)

- How to authenticate agent/lead identity for claimer-only close and lead override; user-supplied `--by` alone is insufficient.
- Persisted dependency-handoff approval schema (front matter / append-only event), invalidation when producer SHA changes, and Python skill migration.
- How to represent a nonclaimable tracking parent and derive its acceptance from its descendants without falsely completing an executable item.
