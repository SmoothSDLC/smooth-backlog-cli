# R3 — Migration, TDD order and consumer feasibility (review log)

Reviewer R3, 2026-11-08. Scope: `05-tdd-plan.md`, `06-migration-plan.md`, `07-traceability.tsv`, `consumers.tsv`, `tests.tsv`, read
against the CLI at `174c76d` (detached worktree, removed after the review), the topology repository on `pr2/topology-after-pr1`
(`a4ab4c11`) and the live backlog repository (read only). No code and no spec file was changed.

## How the findings were checked

- **The §4 conversion was applied by hand** (a script that follows `06-migration-plan.md` §4 rule by rule) to the topology copy
  `<agent-skills>/team-lead/references/backlog-workflow.json` and to today's shipped `templates/workflows/team.json` (the fixture
  `workflows-v1.json` of 05 §2), and the results were run through `tools/validate_subset.py` against `schema/team-behaviour.schema.json`
  plus a role check (V-09).
- **The REQ-011 migration was applied by hand** to the live `teams.json` and to every item file of the live backlog repository
  (counting words, legacy keys, split markers, bound items whose team has no entry, items in `archive/`).
- **The test harness was probed**: a copy of the worktree (outside the repository) with two logging lines in
  `.agents/test/shared-fixtures.js` ran the full suite (1135 tests, 266 s; the 10 failures of the copy come from the missing `.git`
  and are unrelated). The log counts every harness-routed `team update` on an item without a team and every `--status` it sends.
- **40 literal-asserting tests** from `tests.tsv` (every ninth CODE-LITERAL row) were read against the replacement rule of 05 §6.
- **Consumers**: the topology repository was searched for every backlog call, every read of item fields and every environment
  variable the CLI reads; the deploy scripts were read; the installed CLI package was compared with `174c76d`.

Severity: **BLOCKER** = the phase plan cannot be executed as written (a test cannot go green, the live team breaks, or data is lost);
**MAJOR** = a gap that makes a phase red or a behaviour change unproven; **MINOR** = wording, cost or completeness.

---

## R3-001 — The §4 conversion fails on both schema-1 definitions, and where it validates it changes the behaviour

- **Location.** `06-migration-plan.md` §4 rules 1–5; REQ-011 (2); T-011-6; D-12; CON-13.
- **What is wrong.** Applying the rules literally to the topology `backlog-workflow.json` and to today's shipped `team.json` gives
  the same result for both:
  1. **Validation fails, so `backlog team migrate --file` aborts and T-011-6 can never pass.** `defaults.review[0].reviewers` and
     `defaults.review[1].reviewers` are `not a key of this object` (rule 4 copies `team_entry_review_default` verbatim, whose entries
     carry `reviewers`), and `steps.decision.by` names the role `owner-of-the-backlog`, which the template's `roles` does not define
     (V-09). The migration of a live backlog whose `workflows.json` holds a schema-1 copy of either file aborts the same way.
  2. **Rule 3 copies `from`, `to`, `by` and `not_by` from the old file, but those keys never governed today's behaviour.** At
     `174c76d` a registered workflow is only read by `team define` validation (`src/team/team.js:207,229`); every step is checked
     against the shipped definition plus code (`src/team/workflow.js:38,55` use `TEAM.steps`, `lifecycle.js:81-94` holds the lead and
     stage rules). The old step keys are documentation that disagrees with the code, so copying them over the template changes the
     shipped behaviour: `claim` gets `by:["member"], not_by:["lead"]` and loses the lead's work-item claim of R07; `release` gets
     `from:["in progress"]` and `to:"ready"` next to the template's `to_rules` (slice → ready, work item → new, review words kept: R08);
     `refine-start` gets `by:["member"], not_by:["lead"]` instead of the template's first-round condition; `refinement-review` gets
     `by:["external"]` instead of the entry's `refinement_review` teams (R04); `start-review.not_by` and the review stages lose
     their template legs.
  3. **Role-name collision.** In the old file `owner` means "the item's owner field (the claimer)"; in the template `owner` is
     `{"literal":"owner"}` (the backlog owner). Copying `by:["owner","lead"]` into `release`, `waiting`, `waiting-done`, `handoff`,
     `request-review` and `close` silently hands those steps to a person literally named `owner` and takes them from the holder.
  4. **Rule 5 omits `identity` and `scope`.** The converted definition then gets the defaults (`same_worker_pattern` absent,
     `caller_acts_only_as_itself:false`, `bind_session:false`, `session_team_only:false`, `foreign_items:none`), so session
     continuation (082), the caller check (R17) and the session scope (R18) stop for every team on the converted workflow.
  5. Rule 3 is silent on template steps the old file lacks (`set-team`) and on `steps.<s>.stages.<st>.*` beyond `from`/`to` of
     `start-review`; rule 5's refusal overlay adds `handoff_missing`, a key no step references.
- **Severity.** BLOCKER.
- **Exact change.** Replace §4 rules 2, 3 and 5 by: "(2) `statuses`, `finished` and `side_statuses` (enter, leave) must equal the
  template's; any difference aborts with `❌ backlog: <file>: <key> differs from the template (<old> / <template>); convert this
  definition by hand`. (3) Steps are not read from the old file: the converted definition is the template with every review stage
  renamed by position (`review.stages_order`, the keys of `review.stages`, the keys of every `steps.<s>.stages`, every
  `defaults.review[i].stage`). (5) Every other key, `identity` and `scope` included, is the template's; `refusals` = the template's,
  overlaid only with old texts whose key exists in the template." Change rule 4 to "`defaults.review` = `team_entry_review_default`
  reduced to `{stage, count}`". Add test T-011-9: "the converted example-team equals the template after renaming `peer` to `local`
  (deep equality)", and keep T-011-6 on the topology copy.

## R3-002 — The shared test harness contradicts D-06, D-07 and schema 2; "same assertions" (05 §6) is not achievable as written

- **Location.** `05-tdd-plan.md` §2, §6, §7; `06-migration-plan.md` PH-1, PH-9, PH-11; REQ-907.
- **What is wrong.** Most of the 383 literal tests run through `.agents/test/shared-fixtures.js`, which 05 never mentions:
  - `sharedBacklog` (line 71) writes `teams.json` as `{t1:{review:[]}, t2:…, t3:…, t9:…}`: no `workflow`, no `lead`, no `members`.
    Schema 2 requires all three (`members` with at least one entry).
  - `neutralTeam` (lines 137-143) creates an empty entry `{}` for any team a test names, and `cli()` (lines 144-176) routes a team
    step on an item **without a team** to `backlog team update <item> --team neutral`. The probe counted **173 such step calls**
    (not bindings) in 10 files: `shared-handoff-e2e` 95, `shared-update` 15, `shared-team-work` 14, `shared-sync-db` 14,
    `shared-handoff-commands` 12, `features.test.js` 10, `shared-team-stages` 5, `shared-audit` 4, `shared-team-lead-pop` 3,
    `shared-foreign-deps` 1. Under D-06/REQ-112 every one of them is refused with `not_team_item`.
  - `intoTeam` (lines 196-201) binds with `--set-team <t> --status ready` and then writes `stage: ready` into the file. Under the
    template `set-team` sets `initial` (D-07) and `--status` prints `status_flag` (the template defines no `set-status`, REQ-113);
    the written `stage` key is old data after PH-11. The probe counted **56 `--status` calls on unbound items** through `team
    update` (44 in `shared-team-pop`).
  - 26 test files set `TEAM_LEAD` (70 occurrences) to name the lead; see R3-016.
  - 24 test files write old front matter (`stage:`, `review_state:`, `status: pending|in_progress`) directly (65 lines).
  So the re-pointed tests cannot "pass unchanged" under `useTemplate()`; the seeding of every test must change, and some
  assertions cannot be reproduced at all (R3-019).
- **Severity.** BLOCKER.
- **Exact change.** Add to 05 a §2.1 "Harness on schema 2" and a phase PH-0b before PH-1: (a) `sharedBacklog` writes a schema-2
  `teams.json` (`t1`, `t2`, `t3`, `t9` with `workflow:"team"`, `lead:"lead"`, `members:["ann","bob"]`, `review:[]`) and registers
  the template through the bridge reader of R3-005; (b) `neutralTeam` and the unbound routing of `cli()` are deleted: a test of an
  item without a team runs the plain command, a test of team behaviour binds the item first; (c) `intoTeam(slug, opts, team,
  status)` becomes `seed(slug, {team, status, fields})`, which writes the item file directly in schema-2 words and commits it
  (state seeding is allowed in conformance tests; the steps under test still run through the CLI); (d) every `TEAM_LEAD` becomes
  the entry's `lead`. List the affected files with these counts in 05 §6 and state, per theme, which assertions change.

## R3-003 — Every topology deploy reinstalls the pinned CLI and downgrades the live CLI

- **Location.** `06-migration-plan.md` "Where the code lands", PH-2, PH-8, PH-11, PH-12; "Consumer order".
- **What is wrong.** `<deploy-tooling>/deploy.sh:86` runs `<deploy-tooling>/install_backlog_cli.sh $(cat <deploy-tooling>/backlog-cli.pin)`, which
  reinstalls the npm package and rewrites `<bin>/backlog`. The pin today is `simplify/pr3-review 967c2fe`, six commits behind
  `174c76d`; the installed package under `<install folder>` is byte-identical to
  `174c76d` (commit.sh installed it). Every topology deploy the plan requires (PH-2 step 1, PH-8, PH-11 step 2, PH-12) therefore
  rolls the live CLI back to `967c2fe` (losing, among others, `e58490c`, the plain refusals of decision AO) unless the pin is moved.
  `install_backlog_cli.sh` also refuses a pin that is not on `origin/<branch>`, so the CLI commit must be pushed first.
- **Severity.** BLOCKER.
- **Exact change.** Add to "Where the code lands": "Every topology commit sets `<deploy-tooling>/backlog-cli.pin` to the CLI commit that is
  live at that moment (the head of `simplify/pr3-review`, pushed); in an additive-then-removal pair the pin names the additive CLI
  commit. A topology deploy without that pin change is not allowed while this plan runs." Repeat it in the order lines of PH-2,
  PH-8, PH-11 and PH-12.

## R3-004 — T-101-3 (PH-1) expects `src/shared/status.js` removed, but it is deleted in PH-10 and its remnants in PH-11

- **Location.** `05-tdd-plan.md` §4 plain-guard table (T-101-3, phase PH-1); `06` PH-1 "src/shared/status.js (team part moved
  out)", PH-10 "src/shared/status.js deleted", PH-11 "src/shared/status.js remnants"; `07-traceability.tsv` (status.js rows: 8 in
  PH-1, 5 in PH-4, 2 in PH-10, 24 in PH-11).
- **What is wrong.** At `174c76d` 18 source files import `status.js` (`query, repair, move, new, update, store, sequence,
  dependencies, index, plain-step` in `src/shared`; `queue, handoff, team, views, update, pop, lifecycle, workflow` in `src/team`), and
  it holds `lift`/`lifted` (the on-read translation `store.js:289` and `query.js:292` rely on) that the bridges need until PH-11. T-101-3
  is written first in PH-1 and cannot go green before PH-11 step 3, so PH-1 cannot close.
- **Severity.** BLOCKER.
- **Exact change.** Move T-101-3 to PH-11 step 3 ("after the removal commit `src/shared/status.js` does not exist"). In PH-1 add
  T-101-4: "`src/shared/status.js` exports only the bridge functions listed in `src/engine/bridge.js`'s header (statusOf, lift,
  lifted, derivedKeys, dropsLegacy) and no status word other than those of the bridge."

## R3-005 — PH-0/PH-1 file shapes contradict each other; no reader for schema-2 registries exists before PH-11

- **Location.** `06` PH-0 scope ("accept schema 2 input in addition to today's (old input still accepted until PH-11)") versus T-009-1
  (PH-0: "workflow --file registers schema 2 only; v1 refused with migrate text"); PH-1 ("registered definition when the backlog has a
  schema 2 workflows.json"); 05 §7 ("registers templates/team-behaviour/team.json as workflow team in a throwaway home"); REQ-001
  (writer shapes, PH-11); "Bridges".
- **What is wrong.** (1) T-009-1 and the PH-0 scope say opposite things, and today's `workflow.test.js` and `team-cli.test.js`
  register schema-1 definitions, so one of them is red at PH-0. (2) Before PH-11 nothing writes `{schema, workflows}`: `team
  workflow --file` writes the flat map (`src/team/cli.js:181-186`). A schema-2 definition stored in that flat map breaks today's
  reader: `validateTeam` reads `flow.review_stages_order.includes` (`src/team/team.js:213`) and throws a TypeError for a team that
  names it. A schema-2 `teams.json` is read by `teamsConfig()` (`team.js:96-106`) as two teams named `schema` and `teams`. (3) The
  "bridge" functions are named but not specified: how a schema-1 entry without `lead`/`members` (fixtures), with the earlier
  `review:[{team,count}]` form or with `wip` becomes a schema-2 entry in memory is not written anywhere.
- **Severity.** BLOCKER.
- **Exact change.** Add `src/engine/files.js` to PH-1 (not PH-11) as a **dual reader**: a registry with a `schema` key is read as
  schema 2; one without is mapped in memory by `bridge.entriesFromV1` / `bridge.definitionFromV1` (the R3-001 conversion and the
  R3-011 entry rules) with a test each; PH-11 step 3 deletes the schema-1 branch (T-002-1/2 then fail closed). Move T-009-1,
  T-010-1..3 and "team define/workflow accept schema 2 input" to PH-1 together with the dual reader, and state in PH-0 that it adds
  only `team validate [--file]` (no write path).

## R3-006 — The live team cannot be moved to `example-team` after the migration

- **Location.** `06` PH-11 step 2; CON-13 ("teams.json entries name workflow example-team"); REQ-011 (1) ("gains workflow (team when
  absent)"); REQ-015.
- **What is wrong.** The live `teams.json` entry `t-live` has no `workflow` key, so the migration gives it `team` (the
  template). Changing it to `example-team` afterwards needs `team define`, which refuses a changed entry of a team with open items
  (`src/team/cli.js:147-148`: "team <t> has <n> open items; register the new composition under another name"); the live team has
  about 50 open items. The same lock (`cli.js:184-185`) refuses any later re-registration of `team` or `example-team` while their teams
  have open items, so a template fix found in PH-12..PH-14 (for example a Q-06 step) can never reach the live team.
- **Severity.** MAJOR.
- **Exact change.** See decision D-R3-1 at the end; whichever option is chosen, write it into REQ-011 (1) and CON-13, and add to
  REQ-015 how a definition used by teams with open items is upgraded (today: never).

## R3-007 — The item migration (REQ-011 (3)) drops the side effects of `lift()` that today's readers depend on

- **Location.** REQ-011 (3); T-011-4, T-011-5; `05` §6 T-LEGACY.
- **What is wrong.** REQ-011 (3) keeps only the word `statusOf` gives and removes `stage`/`review_state`. Today `lift()`
  (`src/shared/status.js:110-123`) also: (a) adds `refiner: ""` to a legacy slice that has `stage` but no `refiner` — the `refiner`
  key is what marks a slice from then on, and the template's queue and steps test exactly that key (`field_absent: refiner` = the
  lead's work item, `field_exists: refiner` = a slice; release `to_rules`); (b) writes a synthetic `review_history` line `… peer
  reject …: changes requested before the history was kept` for an `in_progress` item with `review_state: changes-requested` and no
  history, which the template's `last_review_rejected` predicate reads. In the live backlog 5 item files carry `changes-requested`
  and none has a `review_history` (one open bound item of `t-live`); after the migration the rework offer (`respond`,
  continue-rejected) disappears for them. (c) A teamless split slice that the migration binds (5 open slices in the live backlog
  whose parent is bound to `t-live`) gets no `refiner` key either, so the template treats it as the lead's work item. (d) The
  parent of a slice is found "by body marker", but 34 of the 84 live markers `Split from \`<x>\`` do not resolve by `phase` key in the
  same repository folder; the resolution rule and the no-parent case are not defined.
- **Severity.** MAJOR.
- **Exact change.** Extend REQ-011 (3): "(3a) an item with `stage` and no `refiner` key gets `refiner: ""`; (3b) an item whose
  `review_state` is `changes-requested` and that has no `review_history` gets the line `<reviewed_at> <first stage of its entry>
  reject <reviewer> <work_commit>: changes requested before the history was kept`; (3c) a split slice that the migration binds also
  gets `refiner: ""`; (3d) the parent of a slice is the item whose file name (without `.md`) or `phase` equals the last
  `Split from \`<x>\`` of the body, in `phases/` or `archive/phases/` of the same repository folder; no match: the slice stays
  unbound and is listed under `not bound (parent not found)`." Add these four cases to T-011-4/T-011-5 and to `team-migrate.feature`.

## R3-008 — Items in `archive/` are neither migrated nor allowed to stay old

- **Location.** REQ-011 (3) ("every item of the home"); D-10 ("every command that meets old data fails with the migrate message");
  `03-spec.md` §8 ("read-only archived items").
- **What is wrong.** The live backlog holds 24 bound item files with old keys under `archive/phases/` (teams `team-a`,
  `t-old`, `t-live`, `team-b, team-c`), two of them with an open word (`in_progress`, `pending`) inside `archive/`. If the
  migration skips them, D-10 makes `show`, `history`, `list` of archived items and `import` fail for ever; if it rewrites them, it
  breaks the read-only rule of §8 without saying so.
- **Severity.** MAJOR.
- **Exact change.** See decision D-R3-3; write the chosen rule into REQ-011 (3) and §8, and add a T-011 case "an archived bound item
  with old keys".

## R3-009 — Items bound to a team that has no entry: migration result and port behaviour undefined

- **Location.** REQ-011 (3); REQ-006; §7 binding port; D-08.
- **What is wrong.** The live backlog has 20 item files bound to teams that have no entry in `teams.json`: `team-a` 4,
  `t-old` 4, `team-b` 4, `team-c` 4, `team-d` 2, `team-e` 1,
  `team-f` 1; seven of them sit in `phases/` with status `done`. (1) The migration computes
  `statusOf(fm, null)` for them, but afterwards they have no definition, so "a finished word of its definition" (§7
  `archive-finished`/`archive-unfinished`) is undefined and `archive done` (owner) and the scheduled job's `archive --force`
  (`tools/team/<scheduled job-lib>:147`) have no defined answer. (2) The port text for "files valid, but the item's team has no entry" is
  missing (REQ-006 covers only missing or invalid files). (3) They cannot be unbound through the CLI: `team update --set-team ""`
  needs the team to be configured (fixed text `team <team> is not configured`), and plain `update` refuses a bound item.
- **Severity.** MAJOR.
- **Exact change.** See decision D-R3-2; add the chosen rule to REQ-011 (3), a port rule to §7 with its exact text, and a T-011
  case plus a port test.

## R3-010 — The "old item" detection and its error text are not specified

- **Location.** D-10; REQ-002; REQ-011.
- **What is wrong.** REQ-002 defines the migrate message for **files** only. D-10 says every command that meets **old data** (items)
  fails with the migrate message, but neither the predicate (which item counts as old) nor the text, the stream, the exit code, nor
  whether reads also fail is written. The plain words `pending`, `in_progress`, `done` are legal on unbound items (REQ-011 AC 2), so
  the predicate must depend on binding.
- **Severity.** MAJOR.
- **Exact change.** Add to REQ-002: "An item is old when it carries a `stage` or `review_state` key, or when it is bound and its
  status is `pending`, `in_progress` or `done`. Every command that loads such an item (reads included) stops with `❌ backlog:
  <owner>/<repo>/<path> carries schema 1 team fields; run backlog team migrate` on standard error, exit 2, nothing written." Add
  T-002-4 and S-002-3.

## R3-011 — Old keys of `teams.json`, `wip-limits.json` and `backlog.scope` without a defined destination

- **Location.** REQ-011 (1); `06` §4; `schema/teams.schema.json`.
- **What is wrong.** Tried on the live `teams.json`: it maps cleanly (add `"workflow":"team"`; no `wip`; no `wip-limits.json`; no
  `backlog.scope` in the live home; the result validates against `teams.schema.json`). But the old format admits inputs the rules do
  not cover, each of which makes the result invalid (abort) or silently changes behaviour:
  | old input (where today's code accepts it) | schema 2 | destination in the spec |
  |---|---|---|
  | `review: [{team, count}]` without `stage` (earlier form, `status.js:45-52` takes the stage by position) | `stage` required | none |
  | `review` entry whose stage is not in the order (ignored, `status.js:50`) | E-04 | none (abort) |
  | `review` with a stage twice (first wins, `status.js:51`) | E-05 | none (abort) |
  | entry without `lead` (hand-written; `teamLead()` falls back to `TEAM_LEAD`) | `lead` required | none |
  | entry with no or empty `members` ("a team that lists no members lets anyone pass", `status.js:59`) | `members` ≥ 1 | none |
  | unknown keys in an entry (ignored) | `additionalProperties:false` | none |
  | team name outside `^[a-z0-9][a-z0-9:_-]{0,63}$` | propertyNames | none |
  | `wip-limits.json` `team` as a map `{"default":3,"t1":4}` (`src/team/wip.js:3`) | entry `limits.team` is an integer | "copied" (impossible) |
  | `wip-limits.json` `agent` as a map keyed by agent | entry `limits.member` map | "agent → member" (map keys unstated) |
  | `wip-limits.json` `stale_hours` (default 48, `wip.js:29`) | `views.wip.stale_hours` in the **definition** | none |
  | `backlog.scope` per repository folder (`views.js:25-32`) | entry `chunk_scope` | "for the teams that read them" (no folder → team relation exists) |
- **Severity.** MAJOR.
- **Exact change.** Add to REQ-011 (1) one rule per row: the earlier `review` form takes `stage` = the definition's
  `stages_order[i]`; unknown stages and duplicates are dropped and listed; an entry without `lead` or with empty `members`, an unknown
  key or a bad name aborts with `❌ backlog: teams.json: teams.<t>: <problem>; fix the entry with backlog team define before
  migrating`; a `team`/`agent` map becomes, per entry, the value for that team (else `default`); `stale_hours` other than 48 aborts
  with `❌ backlog: wip-limits.json: stale_hours <n> differs from the workflow's views.wip.stale_hours 48; register a workflow with
  that value first`; `backlog.scope` of folder `<owner>/<repo>` applies to every team that has an open bound item in that folder,
  conflicts abort with `❌ backlog: backlog.scope: team <t> reads <a> in <folder1> and <b> in <folder2>`.

## R3-012 — Consumers missing from `consumers.tsv`

- **Location.** `consumers.tsv`; `06` consumer order.
- **What is wrong.** These live readers depend on what the plan changes and are not listed:
  1. `<monitoring-tools>/backlog_view.py:15,27,113` reads `review_state` from item front matter (the migration removes it).
  2. `<monitoring-tools>/dashboard.py:167-175` reads `review_state` and the words `done`, `in_progress` (backlog.db rows and
     front matter).
  3. `<monitoring-tools>/idle_gap.py:70` reads `review_state == 'in_review'`.
  4. `tools/team/<scheduled job-lib>:31` `DONE = ('done','archived')` and `:141` (same class as CON-07; the scheduled job's end items are bound,
     e.g. live items 054 and 147, and show `closed`).
  5. `<agent-skills>/team-lead/SKILL.md:28` makes the lead run `backlog team define --file` with a schema-1 input
     (`{"name","lead","members","external_reviewers","review":[]}`) at every team start; it breaks at PH-11 step 3, but CON-14 is PH-12.
  6. `tools/team/test_team_names.py:60` and `<eval-tooling>/test_prepare_pr1_bootstrap.py:48` assert `TEAM_LEAD` strings in
     `<run-script>`/`launch.sh`; the PH-2 topology commit that drops `TEAM_LEAD` (CON-10) turns them red.
- **Severity.** MAJOR.
- **Exact change.** Add CON-15..CON-20 with these file:line references; phase: 1–4 "before the live migration (PH-11 step 2)"; 5
  "PH-11 step 2 (schema-2 define input, possible from PH-1 per R3-005)"; 6 "PH-2 step 1, same commit".

## R3-013 — CON-02, CON-07, CON-12 are scheduled after the change that breaks them

- **Location.** `06` PH-10 ("src/shared/status.js deleted"), PH-11 steps 2–3; CON-02, CON-07, CON-12.
- **What is wrong.** `list --json` rows carry `review_state` from the lifted front matter (`src/shared/query.js:292-293`). Deleting
  `status.js` in PH-10 removes `lift`, so `review_state` becomes `""` in every row from PH-10 on, and `<runner-script>:151-158` stops
  seeing items in review until PH-11 step 2. Independently, the live migration (PH-11 step 2) rewrites the item files, so the readers
  of R3-012 items 1–3 and CON-12 break at that data change, not at the step-3 CLI commit. Reading the status words already works at
  `174c76d` (the lifted rows carry `ready for review`, `reviewing`, `external review`), so these consumer changes do not depend on any
  CLI phase.
- **Severity.** MAJOR.
- **Exact change.** Move CON-02, CON-07, CON-12 and the new CON-15..CON-18 to one topology commit **before PH-1** (deployed with the
  pin of R3-003), and keep `lift` until PH-11 step 3 (with R3-004).

## R3-014 — `commands-documented.test.js` turns red at PH-0 and at PH-11

- **Location.** `06` PH-0 (adds `team validate`), PH-11 (adds `team migrate`), PH-12 (documents both); T-906-2.
- **What is wrong.** `.agents/test/commands-documented.test.js:20-44` builds its list from `SUBS` (`src/team/cli.js:19`) and requires
  a `### backlog team <sub>` section in `COMMANDS.md` **and** in `templates/skills/backlog/references/commands.md`, an entry in
  `teamHelp`, and the name in `teamHelp.team`. Adding a subcommand without those sections fails TST-001, TST-002 and TST-003 in the
  same commit, so PH-0 and PH-11 are not green.
- **Severity.** MAJOR.
- **Exact change.** PH-0 files: add `COMMANDS.md` and `templates/skills/backlog/references/commands.md` (`### backlog team
  validate`, generated with `.agents/scripts/sync-commands-md.mjs`); PH-11 step 1 the same for `team migrate`. PH-12 keeps
  `docs/team-behaviour.md` and the skill/CHANGELOG work; T-906-2 moves to PH-0/PH-11.

## R3-015 — Behaviours of today's team flow that the template or the enforcer cannot express (REQ-907 does not prove them)

- **Location.** `03-spec.md` §9, REQ-907, T-907-1; `templates/team.full.json` `queue`; §6 (pop paragraph).
- **What is wrong.** Read against `src/team/queue.js`, `pop.js`, `lifecycle.js`, `status.js`:
  1. **Teamless split slices are team work today.** A slice without `team` is offered for refinement and refinement review to the
     session's team (`queue.js:101,185`, `lifecycle.js:65`) and joins the team on claim or refine (`lifecycle.js:73,126`). The template
     lists only bound items of the command team, and D-06 refuses `team update` on them. (The live backlog has 35 teamless slices in `phases/`
     whose parent is unbound.)
  2. **The lead's work-item claim loop.** `pop.js:173-180` walks every open unclaimed work item in priority order, tries the claim,
     records each refusal in `skipped` ("not taken <item>: <reason>") and stops at the first success. The template has one `claim`
     offer with a `mark`; §6 retries a refused mark 3 times on the same answer. The `skipped` list (a D-16 JSON key) has no source.
  3. **When the lead continues its work item.** Today `children(held)` (`pop.js:148-149`) ignores other unclaimed, complete,
     dependency-free work items of the team; the template uses `when_team: no_other_open_items`.
  4. **The lead's busy rule.** `queue.js:118-125` excludes items that wait on the lead's own items or on another repository, and
     keeps the lead's passed and changes-requested items (`away` set); the template's `busy_when:
     team_has_open_items_not_held_by_actor` has neither exclusion.
  5. **An entry without members lets anyone pass the peer stage** (`status.js:59`); schema 2 forbids such an entry, and the test
     fixtures rely on it (R3-002).
  6. **`--claim-now` on an unbound item uses plain `update --claim`** (`queue.js:171`); plain claim is Q-02.
  7. **Today's registered workflows are never enforced** (R3-001 point 2), so the "registered template" leg of the conformance suite
     proves nothing about a backlog's own registered definition, and the conversion of D-12 changes live behaviour unproven.
- **Severity.** MAJOR.
- **Exact change.** Add §9 rows R24 (teamless slices: owner question or ACCEPTED-LOSS with migration binding them, R3-007), R25
  (work-item claim loop: add an offer key `try_each: true` with `skipped_reason` from the mark's refusal), R26 (work-item continue:
  a predicate `team_has_other_items_except_free_work_items`), R27 (busy exclusions: predicate parameters `exclude_waiting_on_actor`,
  `exclude_foreign_waits`), R28 (empty members: ACCEPTED-LOSS, documented), R29 (`--claim-now` on unbound items: follows Q-02); give
  each a conformance test; T-907-1 then counts 29 rows.

## R3-016 — PH-2 cannot leave the suite green: the tests name the lead through `TEAM_LEAD`

- **Location.** `06` PH-2 files; T-206-1, T-206-2, T-206-3.
- **What is wrong.** 26 test files set `TEAM_LEAD` (70 occurrences, e.g. `shared-team-lead-pop` 10, `shared-team-stages` 10,
  `shared-team-pop` 7), and the fixture entries have no `lead` (R3-002). When the CLI stops reading `TEAM_LEAD`, nobody is lead in
  those tests. TST-630 asserts the `--lead` text "(lead; TEAM_LEAD)" and must be replaced by T-206-2. The PH-2 file list names no
  test file.
- **Severity.** MAJOR.
- **Exact change.** Split PH-2: PH-2a (tests only, CLI unchanged, green): the 26 files and the harness name the lead in the entry; PH-2b
  the topology commit (CON-01, CON-06, CON-10, the topology tests of R3-012 item 6, the pin); PH-2c the CLI ignores `TEAM_LEAD`,
  removes `--lead`, replaces TST-630 by T-206-2. List the 26 files in PH-2a.

## R3-017 — Plain conventions are also asserted by the published-package check, which PH-10 does not list

- **Location.** `06` PH-10 files; `.agents/scripts/verify-published-package.mjs`; `.agents/test/package.test.js`.
- **What is wrong.** `verifyInstalled` (run inside the suite by `package.test.js:26-29` and by `.github/workflows/publish.yml`) asserts plain
  conventions that Q-01/Q-02 may change: `update 1 --status done` gives `closed` (lines 67-68), the open-queue filter
  `['closed','done','archived']` (line 45), and `archive 1` of an unfinished plain item fails with exit 1 (line 66). Under Q-01
  option A or B the suite is red at PH-10.
- **Severity.** MAJOR.
- **Exact change.** Add `.agents/scripts/verify-published-package.mjs` to PH-10 files, with "its plain status assertions follow the
  Q-01/Q-02 answer"; add `package.test.js` T-014-2 to PH-0 as written.

## R3-018 — Phases too large to review in one commit, and the proposed split

- **Location.** `06` PH-1, PH-3, PH-8, PH-9, PH-11.
- **What is wrong.** Estimated size per phase (source files touched with their size at `174c76d`; new tests from 05; re-pointed
  literal tests by theme from `tests.tsv`; scenarios run in two locations):
  | phase | source files (lines) | new tests | re-pointed literal tests | scenarios ×2 | verdict |
  |---|---|---|---|---|---|
  | PH-0 | 4 new + cli.js 191, help.js 555, gherkin.js 50, steps 141 | 22 + 3 runner | 0 | ~62 (outline rows) | ok, plus R3-014 docs |
  | PH-1 | engine/catalogue/fill new; lifecycle.js 571, workflow.js 114, status.js 139 | 23 | T-STEPS 31 + T-STATUS 28, run twice | 19 | **too large** |
  | PH-2 | roles.js, session.js new; team.js 252, pop.js 201, queue.js 367 + 26 test files | 13 | T-ROLES 6, T-SCOPE 9 | 9 | split (R3-016) |
  | PH-3 | conditions.js new; update.js 107, handoff.js 166, handoff-commands.js 101, handoff-close, plain-step.js | 11 | T-CLAIM 16 + T-HANDOFF 71 (95 harness calls on unbound items in e2e alone) | 13 | **too large** |
  | PH-4 | review.js new; lifecycle.js, team.js | 18 | T-REVIEW 20 | 14 | ok |
  | PH-5 | edits.js, completeness.js new; team/new.js, shared/new.js 225 | 11 | T-REFINE 25 | 12 | ok |
  | PH-6 | limits.js new; wip.js, wip-limits.js 71, move.js 168, update.js 352, plain-step.js | 8 | T-WIP 9 | 7 | ok |
  | PH-7 | conditions.js, dependencies.js 93, plain-step.js | 2 | T-DEPS 7 | 1 | merge into PH-6 |
  | PH-8 | engine/queue.js new; queue.js 367 and views.js 134 deleted, pop.js 201 rewritten; <keeper-script> | 9 | T-QUEUE 64 | 6 | **too large** |
  | PH-9 | binding.js new; update, done, archive, sequence, clean, new; team-items.js, seam.js deleted | 10 | T-BINDING 48 + the 173 unbound calls (D-06) | 8 | **too large** |
  | PH-10 | 12 plain files + setup | 6 | T-PLAINCONV 11 | 4 | ok, plus R3-017 |
  | PH-11 | files.js, migrate.js new; workflow.js, status.js deleted; 5 topology files; live data | 22 | T-LEGACY 11 + T-FILE 27 | 12 | **too large** |
- **Severity.** MAJOR.
- **Exact change.** Replace the five phases by: **PH-1a** `fill.js`, `catalogue.js`, `engine.evaluate()` on synthetic definitions,
  not wired (T-101..T-110, T-903-1); **PH-1b** harness and conformance scaffolding on today's code (R3-002, T-907-1 map, dual reader of
  R3-005); **PH-1c** lifecycle delegates the non-review, non-hand-off steps. **PH-3a** conditions + claim, release, waiting, reassign
  (T-301..T-306); **PH-3b** hand-off, accept, reject, close gate (T-307..T-309, T-HANDOFF). **PH-8a** views; **PH-8b** plan; **PH-8c**
  member pop; **PH-8d** lead pop and work item (R3-015 2–4). **PH-9a** the port for the plain commands (behaviour-identical,
  `plain-team-items` as conformance); **PH-9b** D-06 in `team update` (after the harness of PH-1b); **PH-9c** guard tests on.
  **PH-11a** `team migrate` (additive, dry run tested on a copy of the live backlog); **PH-11b** topology (CON-13/14, R3-012 item 5,
  pin); **PH-11c** the owner runs the migration; **PH-11d** removal of bridges, legacy and old input. Merge PH-7 into PH-6.

## R3-019 — Literal-test migration: results for 40 sampled tests

- **Location.** `05-tdd-plan.md` §6 ("After: the same 383 titles still exist … none deleted"); `tests.tsv`.
- **What is wrong.** Of 40 sampled CODE-LITERAL rows (every ninth): **16** re-point unchanged; **12** are feasible only after the
  harness change of R3-002 (seeding or binding, assertions kept); **4** need a rewrite because the function under test loses its
  refusals (assertions keepable through the CLI); **3** lose or change an assertion; **1** is deleted by design; **4** are not team
  literals at all (misclassified), which inflates the 383. Per test:
  | test | theme | replacement feasible? |
  |---|---|---|
  | TST-029 plain-team-env:28 | T-BINDING | yes, unchanged (plain new) |
  | TST-038 plain-team-items:75 | T-BINDING | **assertion changes**: `team update --replan <team>,<plain>` names an unbound item, refused by D-06 |
  | TST-047 plain-team-items:141 | T-BINDING | yes, unchanged |
  | TST-148 handoff-close:85 | T-HANDOFF | yes if `closeGate` stays machinery (06 PH-3 does not say) |
  | TST-157 handoff-commands:142 | T-HANDOFF | rewrite: `recordHandoff` loses its refusals to the template; the three texts are keepable via the CLI |
  | TST-166 handoff-core:32 | T-HANDOFF | misclassified (digest machinery, §8); unchanged |
  | TST-175 handoff-core:138 | T-HANDOFF | misclassified (edge state machinery); unchanged |
  | TST-184 handoff-core:247 | T-HANDOFF | misclassified (openEdges machinery); unchanged |
  | TST-193 handoff-e2e:164 | T-HANDOFF | after harness: bind first (unbound claim via `team update` is refused) |
  | TST-202 handoff-e2e:323 | T-HANDOFF | **assertion lost**: `--status done` on the producer is `status_flag` under the template; the gate text appears only via `--close` |
  | TST-211 handoff-gate:143 | T-HANDOFF | yes (`legacy` edge state stays) |
  | TST-246 legacy-fields:43 | T-LEGACY | **assertion lost**: it tests removal of `work_class`/`review_classes` on write (storage), which the migration word table does not cover; misthemed |
  | TST-264 move-archive:143 | T-CLAIM | misclassified plain path check; unchanged |
  | TST-280 move-archive:362 | T-STATUS | yes, unchanged (storage) |
  | TST-294 move-archive:545 | T-STATUS | yes, unchanged |
  | TST-309 new:168 | T-CLAIM | yes as completeness `section` cases (13 inputs, placeholders `TBD`, bare `TODO`) |
  | TST-328 new:446 | T-STATUS | yes, unchanged |
  | TST-352 query:423 | T-STATUS | yes, unchanged |
  | TST-421 session-continue:115 | T-CLAIM | after harness (members via `teamMembers` into a schema-2 entry) |
  | TST-430 session-review:76 | T-REVIEW | after harness |
  | TST-445 severity:39 | T-BINDING | yes (edit rule / other_team) |
  | TST-558 lead-pop:38 | T-QUEUE | after harness; depends on R3-015 items 2–3 |
  | TST-567 lead-pop:172 | T-QUEUE | yes (`missing` from completeness names) |
  | TST-576 lifecycle:154 | T-STEPS | after harness (lead from entry, not `TEAM_LEAD`) |
  | TST-585 plan:66 | T-QUEUE | after harness (bind) |
  | TST-594 pop:116 | T-QUEUE | after harness (lead from entry); exact text from `lead_busy` |
  | TST-603 pop:353 | T-QUEUE | yes (machinery) |
  | TST-612 scope:50 | T-SCOPE | after harness: `backlog.scope` → entry `chunk_scope` from PH-11 |
  | TST-621 stages:51 | T-REFINE | after harness |
  | TST-630 stages:275 | T-REFINE | **deleted by design**: `--lead` removed (T-206-2) |
  | TST-639 status-order:90 | T-STATUS | yes |
  | TST-648 teams:128 | T-ROLES | **at risk**: `update 3 --set-team t3` re-binds an item of t2 under `session_team_only` (`other_team`) |
  | TST-657 work:229 | T-STEPS | yes |
  | TST-666 work:369 | T-STEPS | after harness |
  | TST-675 unrefined-claim:79 | T-REFINE | yes |
  | TST-693 update:285 | T-BINDING | rewrite: the plain command answers `/team session is bound/` from `TEAM_REPOSITORY`, an environment read the plain guard forbids (05 §5.4); becomes `plain_update` text |
  | TST-705 update:482 | T-BINDING | yes (`status_flag` text identical) |
  | TST-719 wip:89 | T-WIP | rewrite: `f.limits({repository:5, stale_hours:1})` — `stale_hours` has no entry destination (R3-011) |
  | TST-747 boundary:62 | T-BINDING | yes, unchanged |
  | TST-756 boundary:196 | T-BINDING | yes (`plain_split`) |
- **Severity.** MAJOR.
- **Exact change.** In 05 §6 replace "none deleted, same assertions" by a per-test column in `tests.tsv` (`unchanged | harness |
  rewrite | changed | deleted | misclassified`) with the reason for every non-`unchanged` row, and recount the 383 (machinery tests of
  `handoff-core` and plain storage tests leave the CODE-LITERAL class).

## R3-020 — §4 rule 1 does not say what happens to `workflow` and `version`

- **Location.** `06` §4 rule 1.
- **What is wrong.** "`version`, `description` kept as `description`" can be read as keeping `version` (the schema has
  `additionalProperties:false`, so it would fail) or dropping it; the required key `workflow` is not mentioned.
- **Severity.** MINOR.
- **Exact change.** "`workflow` kept; `description` kept; `version` dropped."

## R3-021 — Suite time: the double conformance run and the new BDD scenarios

- **Location.** `06` PH-1 ("every team literal test runs twice"); 04 §1 (both locations); gate.
- **What is wrong.** The suite took 266 s for 1135 tests in the probe. Running ~383 CLI-spawning tests twice (bridge and registered
  template — the same JSON) and adding 188 scenario ids (S-013 alone 48 outline rows) in two locations roughly adds 60–100 % to the gate
  time, and the second leg proves only the file loader.
- **Severity.** MINOR.
- **Exact change.** Run the conformance tests once against the registered template; one test proves that the bridge and the registered
  file give the same definition object. State the expected gate time in 06.

## R3-022 — CON-04 says "flags unchanged", but the team runner already names a flag the CLI does not have

- **Location.** `consumers.tsv` CON-04; `<agent-skills>/team-lead/scripts/<runner-script>:189`.
- **What is wrong.** The team runner's text tells the lead to run `--claim <agent> --ignore-dependency-lock "<reason>"`; no file under
  `src/` of `174c76d` knows `--ignore-dependency-lock`, and the step catalogue (§4.6) has no such step.
- **Severity.** MINOR.
- **Exact change.** CON-04: "already broken at 174c76d (`--ignore-dependency-lock` does not exist); remove the clause from the
  team runner text in the first topology commit".

## R3-023 — The migration tests must never resolve the live home

- **Location.** 05 §2 (`homeWith`), T-011-*; gate.
- **What is wrong.** `team migrate` rewrites every item of the resolved home; a test that forgets `BACKLOG_HOME` resolves the live
  backlog through `resolveHome()` (per-user record, `~/git/<name>`). The repository already has `.agents/scripts/check-real-backlog-clean.mjs`
  for exactly this.
- **Severity.** MINOR.
- **Exact change.** 05 §2: "every `team migrate` test sets `BACKLOG_HOME` to a throwaway home"; gate of PH-11a–d: "run the suite under
  `node .agents/scripts/check-real-backlog-clean.mjs`".

## R3-024 — Missing texts and states in REQ-011

- **Location.** REQ-011.
- **What is wrong.** No text is given for the `backlog.scope` conflict, for a slice whose parent is not found, or for a partially
  migrated home (for example `teams.json` schema 2 and `workflows.json` schema 1, or items still old); "idempotent" (AC 1) is only
  defined for a fully migrated home. `--file` with `--dry-run` and the output of `--file` are not defined.
- **Severity.** MINOR.
- **Exact change.** Add: each file and each item is migrated when it is old and left alone when it is schema 2 (so a partial home
  completes); the texts of R3-011 and R3-007 (3d); `--file <path> --dry-run` prints the converted JSON on standard output and writes
  nothing; `--file <path>` prints `✅ <path>: converted to backlog-team-behaviour/2`.

## R3-025 — The BDD runner change has two unstated couplings

- **Location.** 04 §2; `.agents/test/features.test.js`; S-011-*.
- **What is wrong.** (1) A conditional scenario "reported as skipped" needs `features.test.js` to call `t.skip(reason)` — today it
  registers every scenario as a plain test (`features.test.js:14-19`); the runner change alone cannot skip. (2) The migration and
  registry scenarios run in the `local` location too, where the home is the consumer repository's `.backlog` folder: the "one commit
  `team migrate: schema 2`" lands on the consumer's current branch, which REQ-011 does not say.
- **Severity.** MINOR.
- **Exact change.** 04 §2.3: "`features.test.js` passes `{ skip: reason }` for a conditional scenario whose answer is not selected";
  REQ-011: "in the in-repository location the commit is made on the current branch of the repository".

## R3-026 — Additive-then-removal: the live calls per phase (summary of the walk)

- **Location.** `06` PH-0..PH-14.
- **What is wrong / found.** Walking the phases against the live consumers with the fixes above applied: PH-0 none; PH-1 none (the
  template equals today's shipped rules for the live team, whose entry has no `workflow`); PH-2 none live (the live entry's lead `lead-a`
  equals the `TEAM_LEAD` the team runner sets, `<runner-script>:348`; `<wake-hook>:87` passes `--agent`, not `--lead`), but the topology
  tests of R3-012 item 6; PH-3/PH-4 none beyond R3-022; PH-6 (Q-03 A) only the stale text `SKILL.md:38`; PH-8 none (CON-11
  `<keeper-script>:135` is already broken); PH-9 none live (the probe's 173 unbound calls are tests); PH-10 `<runner-script>:151-158` unless
  R3-013 is applied; PH-11 step 2 the readers of R3-012 items 1–4 and CON-12, PH-11 step 3 `SKILL.md:28` (R3-012 item 5). Without R3-003
  every topology deploy in the list downgrades the CLI.
- **Severity.** MINOR (the walk; the individual breaks are R3-003, R3-012, R3-013).
- **Exact change.** Add this table as "Live calls per phase" to `06`, one row per phase, each with the consumer file:line.

---

## Counts

- BLOCKER: 5 (R3-001 … R3-005)
- MAJOR: 14 (R3-006 … R3-019)
- MINOR: 7 (R3-020 … R3-026)

## Decisions the author (or the owner) must take

**D-R3-1 — Which workflow the live team runs after the migration (R3-006).** The live entry `t-live` has no `workflow` key, so
REQ-011 gives it `team` (the template), while CON-13 says the entries name `example-team`. After the migration `team define` refuses to
change the entry while the team has open items (about 50), so the choice must be made inside the migration commit or not at all.
*Option A — stay on `team`:* the migration writes `"workflow":"team"`, `example-team` is converted and registered only as the definition
for teams defined later, and CON-13's "entries name example-team" is deleted. This keeps the conformance-proven behaviour for the live
team and needs no new option; the stage keeps the name `peer`.
*Option B — move to `example-team` during the migration:* `backlog team migrate` gains `--workflow <team>=<name>`, which sets the entry's
workflow in the same commit (the only path that may change a team in use); the converted definition must then equal the template after
renaming the stage (R3-001), and the review history of open items keeps lines with `peer`. This honours D-12 for the running team but
adds an option and a stage rename to the live data.

**D-R3-2 — Items bound to teams without an entry (R3-009).** Twenty live item files are bound to seven teams that have no entry
(seven in `phases/` with `done`), and after the migration no definition gives their words a meaning. The CLI offers no way to unbind
them, because `team update` needs the team configured and plain `update` refuses bound items.
*Option A — the migration unbinds them:* it removes `team`, sets the plain word (`done` stays `done`, any other word as Q-01 decides)
and lists each item under `unbound (team <t> has no entry)`. Data stays readable and archivable by plain commands; the history of
which run team did the work is kept only in the item's body and git history.
*Option B — the migration aborts:* it lists the teams and their items with `❌ backlog: <n> items are bound to teams without an entry:
<team> (<k>: <slugs>); define each team (backlog team define) and run backlog team migrate again`. Nothing is lost, but the owner must
define seven dead teams (each needs a lead and members) before the migration can run.

**D-R3-3 — Archived items with old keys (R3-008).** Twenty-four bound files under `archive/phases/` carry `stage`/`review_state`, two
with an open word inside `archive/`. §8 calls archived items read-only, while D-10 makes every command that meets old data fail.
*Option A — migrate them too:* REQ-011 (3) covers `archive/` and §8 states that `team migrate` is the one writer allowed to rewrite an
archived item (front matter only, body untouched). Every reader keeps working; the read-only rule gets one documented exception.
*Option B — leave them and exempt them from D-10:* old keys on an archived item are ignored by every reader (no translation, no
failure) and `show` prints them as stored. The read-only rule stays absolute, but archived team items then show old words for ever and
the old-item predicate of R3-010 must exclude `archive/`.
