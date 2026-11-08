# 05 — TDD plan

Every module below gets its failing tests **before** its code, in the phase order of `06-migration-plan.md`; a phase is done when its new tests are green together with the whole suite, `npm run check`, the BDD run (both locations) and the private-details guard. Test ids `T-nnn-k` belong to requirement `REQ-nnn` (`03-spec.md` §10).

## 1. Red-green order

1. Write the phase's tests (this file, filtered by phase) and its scenarios (`features/`, filtered by the phase's REQs); run them: they fail for the stated reason (not a syntax error).
2. Implement the smallest change in `src/engine/` (new folder) or the touched module until they pass.
3. Re-point the literal tests of the phase (§6) to the registered template; each follows its disposition in `tests.tsv` (unchanged, harness, rewrite, changed, deleted, misclassified; R3-019).
4. Run the full gate; commit (each commit goes live through commit.sh, so a phase that affects a consumer is split additive-then-removal, see 06).

## 2. How tests supply definitions

- Fixture folder `.agents/test/fixtures/team-behaviour/`: `team.json` is **not** copied: the helper `template(name)` reads `templates/team-behaviour/<name>` of the checkout, so the conformance suite always tests what is shipped. Static fixtures: `teams-v1.json` (flat map with `wip`), `workflows-v1.json` (today's shipped file as schema 1), `example-team-v1.json` (copy of the topology definition with private names replaced by generic ones), `wip-limits.json`, `backlog.scope` pairs, `legacy-items/*.md` (the 14 word cases of `statusOf`), `invalid/*.json` (the 40-entry corpus of REQ-012).
- Helper `defWith(base, patch)` applies a patch object `{ "dotted.path": value | DELETE }` to a deep copy; `homeWith({ teams, workflows, items })` builds a throwaway backlog home (bare origin, clone) with those files committed; `entry(overrides)` builds a team entry.
- Unit tests of the engine call `evaluate({ definition, entry, entries, item, request, actor, caller, session, home })` directly with in-memory objects; command tests run the CLI in a `fixture(t)` repository as today.

### 2.1 The shared harness on schema 2 (R3-002, phase PH-2a and PH-3a)

Most literal tests run through `.agents/test/shared-fixtures.js`. Its change is part of the plan, in two steps:

- **PH-2a (CLI unchanged, suite green on 174c76d code):** (a) `neutralTeam` and the routing of `cli()` that sends a team step on an item without a team to `backlog team update <item> --team neutral` are deleted: a test of an item outside a team runs the ordinary command, a test of team behaviour binds the item first (173 routed step calls in 10 files: shared-handoff-e2e 95, shared-update 15, shared-team-work 14, shared-sync-db 14, shared-handoff-commands 12, features 10, shared-team-stages 5, shared-audit 4, shared-team-lead-pop 3, shared-foreign-deps 1); (b) `intoTeam(slug, opts, team, status)` becomes `seed(slug, {team, status, fields})`, which writes the item file directly in schema 2 words and commits it (state seeding is allowed; the steps under test still run through the CLI); the 56 `--status` calls on items without a team go; (c) every `TEAM_LEAD` (70 occurrences in 26 files) becomes the entry's lead (`teamLead()` at 174c76d prefers `TEAM_LEAD` but falls back to the entry lead, so removing the variable and writing the lead into the entry keeps the suite green); (d) the 65 lines in 24 files that write old front matter (`stage:`, `review_state:`, `status: pending|in_progress`) write schema 2 words.
- **PH-3a (the cutover commit):** `sharedBacklog` writes `teams.json` as `{"schema":"backlog-teams/2","teams":{t1,t2,t3,t9}}`, each `{"workflow":"team","people":{"lead":"lead"},"lists":{"members":["ann","bob"]},"review":[]}`, and registers `templates/team-behaviour/team.json` as `team` in `workflows.json`; `wip-limits.json` fixtures become entry `limits`.
- Every `team migrate` test sets `BACKLOG_HOME` to a throwaway home; the gate of PH-1 and PH-3b runs under `.agents/scripts/check-real-backlog-clean.mjs` (R3-023).

Dispositions of the 383 literal-asserting tests (column `disposition` of `tests.tsv`, computed by `tools/tests.py` from the test sources): changed 4, deleted 1, harness 296, misclassified 22, rewrite 3, unchanged 57.

## 3. Placeholder values (the filler table, tested by T-903-1)

| placeholder | value |
|---|---|
| `<item>`, `<slug>` | the item slug | 
| `<seq>` | the item number |
| `<status>` | the item status before the step |
| `<step>` | the step name |
| `<from>` | the effective from-words joined by ` or ` |
| `<who>` | the `by` role names joined by ` or ` |
| `<actor>`, `<agent>` | the actor (`<agent>` in instructions: the agent the answer is for) |
| `<caller>` | the caller (Q-04) |
| `<value>` | the step's flag value |
| `<team>` | the command team |
| `<item_team>` | the item's team |
| `<session_team>` | the session team (Q-04) |
| `<workflow>` | the definition name |
| `<holder>`, `<holder_or_nobody>`, `<holder_or_author>` | `claimed_by`; with `nobody` / `its author` when empty |
| `<claimed_at>`, `<refine_started>`, `<review_started>`, `<reviewed_at>` | the field values (`None` when absent, as today) |
| `<refiner>`, `<refiner_or_nobody>`, `<reviewer>`, `<reviewer_if_active>` | the field values; `nobody` when empty; reviewer only when the status is an active review word |
| `<lead>` | the entry lead |
| `<list>` | the condition's list (items, slugs, dependencies) joined by `; ` (dependencies) or `, ` (items) |
| `<belong>` | `belongs` for one name, `belong` for more |
| `<n>`, `<count>`, `<limit>`, `<need>`, `<have>` | numbers of the condition |
| `<missing>` | failing completeness names joined by `, ` |
| `<how>` | `texts.refine_how` filled |
| `<review_refs>` | the list joined by `, ` |
| `<stage>`, `<verdict>`, `<VERDICT>`, `<records_verdict>` | the stage; the verdict; upper case; the verdict's `records_verdict` |
| `<reviewers_text>`, `<reason_text>` | §5.1 |
| `<level>`, `<of>`, `<held>`, `<hint>`, `<limit_text>` | §5.1 (`<of>` = ` of <key>` for repository/branch/team/member levels, `<repository> branch <branch>` for branch) |
| `<dependents>`, `<dependent>`, `<edges>`, `<state>`, `<command>` | §5.1 close gate |
| `<flags>` | offending request parts as flags (`--claim`, `--note`) joined by `, ` |
| `<repository>`, `<branch>`, `<bound>`, `<cwd>` | the item's repository and branch; the session scope; the working directory |
| `<forced>` | ` (--force past the claim rule: <first sentence of the bypassed refusal>)` when `--force` bypassed a condition, else empty |
| `<teams>` | rule team names joined by ` or ` |
| `<argument>` | the missing argument name |
| `<id>`, `<where>` | a dependency id; `this backlog` or `the backlog repository` |
| `<note>`, `<summary>`, `<reason>`, `<comments>`, `<comments_line>` | arguments; `<comments_line>` with whitespace runs collapsed to one space |
| `<now>`, `<today>` | value sources |
| `<work_commit>` | the work commit after the step (HEAD when none) |
| `<first>`, `<repositories>` | foreign waits `<repository>#<seq> (<slug>, status <status>)` joined by `, `; `repository <r>` joined by ` and ` |
| `<seqs>` | item numbers joined by `, ` |
| `<claim_first>`, `<dod>`, `<refs_note>`, `<stale_hint>` | the instruction or refusal of that name filled, or empty when its condition does not hold |
| `<review_refusal>` | the text of the failing review condition |
| `<idle_reason>`, `<claim_refusal>` | `message the agents holding the blockers below, or the coordinator` / `tell the coordinator`; ` (<active_items text>)` or empty |
| `<actor_or_none>`, `<actor_or_nobody>` | the actor or `none` / `nobody` |

Every other `<...>` in a text is printed literally (instructions to the reader).

## 4. Tests per module (written before the code)

### `.agents/test/engine-files.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-0 | T-004-1 | REQ-004 | parses each registry once per process | spy on readFileSync | 1 read each |
| PH-0 | T-004-2 | REQ-004 | cache is dropped after a registry write | define then read | second read sees the new entry |
| PH-3a | T-001-1 | REQ-001 | writes teams.json as {schema, teams} | define input gold | file equals the expected JSON |
| PH-3a | T-001-2 | REQ-001 | writes workflows.json as {schema, workflows} | team.full.json | file equals the expected JSON |
| PH-3a | T-001-3 | REQ-001 | rejects an unknown top-level key | teams.json with extra key | error "teams.json: extra: not a key of this object" |
| PH-3a | T-002-1 | REQ-002 | detects schema 1 teams.json (flat map) | teams-v1.json | throws exit 2 with the migrate text |
| PH-3a | T-002-2 | REQ-002 | detects schema 1 workflow (version 1) | workflows-v1.json | throws exit 2 with the migrate text |
| PH-3a | T-002-3 | REQ-002 | accepts schema 2 | teams.example.json | no error |
| PH-3a | T-002-4 | REQ-002 | old item predicate: stage, review_state, earlier codec keys, bound pending/in_progress/done | seven item files | each read exits 2 with "<path> carries schema 1 fields (<key>); run backlog team migrate"; an unbound done item reads |
| PH-3a | T-003-1 | REQ-003 | never reads templates at run time | package without templates/team-behaviour | results equal |
| PH-3a | T-003-3 | REQ-003 | E-01 unregistered workflow | teams.example.json without workflows | error text E-01 |
| PH-3a | T-005-1 | REQ-005 | missing teams.json: team not configured (exit 1) | empty home | stdout text, exit 1 |
| PH-3a | T-005-2 | REQ-005 | missing workflows.json with entries: E-01 | teams only | exit 2 |
| PH-3a | T-006-1 | REQ-006 | non-JSON registry: exit 2, first problem printed | broken file | text and code |

### `.agents/test/team-validate-cli.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-0 | T-007-1 | REQ-007 | valid configuration: exit 0 and the counts | teams.example.json + both templates | stdout line |
| PH-0 | T-007-2 | REQ-007 | every problem one line, sorted | fixture with 3 errors | 3 lines, exit 2 |
| PH-0 | T-007-3 | REQ-007 | --json shape | valid and invalid | JSON shape |
| PH-0 | T-007-4 | REQ-007 | --help names files, exit codes, example | - | help text |
| PH-0 | T-008-1 | REQ-008 | --file selects the schema by its schema key | both kinds | valid |
| PH-0 | T-008-2 | REQ-008 | --file with unknown schema | {"schema":"x"} | exit 2 text |
| PH-0 | T-008-3 | REQ-008 | --file unreadable | missing path | exit 2 text |
| PH-3a | T-009-1 | REQ-009 | workflow --file registers schema 2 only | v1 and v2 files | v1 refused with migrate text |
| PH-3a | T-009-2 | REQ-009 | workflow --show unregistered | - | exit 2 text |
| PH-3a | T-010-1 | REQ-010 | define fills review from defaults.review | gold without review | entry review = defaults |
| PH-3a | T-010-2 | REQ-010 | define accepts refinement_review, limits, chunk_scope | gold full | entry has the keys |
| PH-3a | T-010-3 | REQ-010 | define E-rules | E-02..E-08 fixtures | each text |
| PH-7 | T-402-2 | REQ-402 | define writes defaults.review | - | entry |

### `.agents/test/engine-schema.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-0 | T-012-1 | REQ-012 | each keyword: one passing and one failing case with the exact message | keyword table | messages of §4 |
| PH-0 | T-012-2 | REQ-012 | schema files use no other keyword | schema/*.json | no unknown keyword |
| PH-0 | T-012-3 | REQ-012 | same problems as the reference interpreter | corpus of 40 invalid definitions | equal lists |
| PH-0 | T-012-4 | REQ-012 | python jsonschema and the JS interpreter agree on templates and schema/negative/*.json | tools/check_schemas.py | every template valid in both; every negative file invalid in both with the message of schema/negative/expected.tsv |

### `.agents/test/engine-validate.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-0 | T-013-1 | REQ-013 | V-01..V-30 each: fixture triggers exactly that text | team.full.json patched | one problem |
| PH-0 | T-013-2 | REQ-013 | E-01..E-08 each | teams.example.json patched | one problem |
| PH-3a | T-209-1 | REQ-209 | E-02, E-03 | patched | "team.json: lead and members must not share a name (b)" and "team.json: lists.review_only: z is not in members" |
| PH-4b | T-106-3 | REQ-106 | V-28 and sets.status refused | patched | "def.json: steps.claim.sets.claimed_by: me is no value source" and "def.json: steps.claim.sets.status: the status is set by to" |
| PH-4b | T-107-2 | REQ-107 | V-12 unknown placeholder | patched | "def.json: refusals.limit: placeholder <who_knows> is unknown" |
| PH-5 | T-201-3 | REQ-201 | V-09, V-10 | patched | "def.json: steps.claim.by: role captain is not defined in roles" and "def.json: roles.a: union cycle through b" |
| PH-6a | T-301-2 | REQ-301 | V-24 exactly one test key; missing refusal | patched | "...requires[0]: a condition has exactly one test key (found status_not_in, field_empty)" and "...requires[2]: a condition needs refusal" |
| PH-6b | T-307-2 | REQ-307 | V-27 effect only on hand-off steps | patched | "def.json: steps.set-team: a binding step needs to or to_rules" (V-27 reduced, D-25) |
| PH-7 | T-401-2 | REQ-401 | V-13, V-18 | patched | "...stages.qa: stage is not in review.stages_order" and "def.json: review.stages.peer.ready: waiting is no status of this workflow" |
| PH-8 | T-102-2 | REQ-102 | V-04..V-06 | patched | the three lines "def.json: side_statuses: ready is also one of statuses", "...returns_to: limbo is not one of statuses", "...enter: request-decision is not defined in steps" |

### `.agents/test/engine-conformance.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-0 | T-014-1 | REQ-014 | templates validate | templates/* | valid |
| PH-4b | T-903-2 | REQ-903 | every template text is produced at least once | coverage | 100% |
| PH-4b | T-907-1 | REQ-907 | §9 rows R01..R23 each covered | map | 23/23 |
| PH-6a | T-303-1 | REQ-303 | claim: today's claim tests over the template | shared-team-lifecycle, shared-unrefined-claim, shared-session-continue | the 25 tests TST-417..TST-676 of shared-team-lifecycle.test.js, shared-unrefined-claim.test.js, shared-session-continue.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-6a | T-304-1 | REQ-304 | release/waiting/reassign tests over the template | shared-team-work, shared-team-lifecycle | the 30 tests TST-573..TST-668 of shared-team-work.test.js, shared-team-lifecycle.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-6a | T-306-1 | REQ-306 | publication recheck: dependencies, limit, active item | race fixture | rollback text |
| PH-6b | T-307-1 | REQ-307 | hand-off command tests over the template | shared-handoff-commands, shared-handoff-e2e | the 35 tests TST-153..TST-208 of shared-handoff-commands.test.js, shared-handoff-e2e.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-6b | T-308-1 | REQ-308 | accept/reject tests over the template | shared-handoff-commands | the 13 tests TST-153..TST-165 of shared-handoff-commands.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-6b | T-309-1 | REQ-309 | close gate tests over the template | shared-handoff-gate, shared-handoff-close | the 14 tests TST-144..TST-213 of shared-handoff-gate.test.js, shared-handoff-close.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-7 | T-403-1 | REQ-403 | request-review tests over the template | shared-team-stages, shared-twostage | the 17 tests TST-621..TST-670 of shared-team-stages.test.js, shared-twostage.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-7 | T-404-1 | REQ-404 | review tests over the template | shared-session-review, shared-team-flow | the 12 tests TST-428..TST-557 of shared-session-review.test.js, shared-team-flow.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-7 | T-407-2 | REQ-407 | reassign-review tests | shared-team-lead-pop | the 15 tests TST-558..TST-572 of shared-team-lead-pop.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-7 | T-408-1 | REQ-408 | close tests over the template | shared-team-lifecycle, shared-team-done | the 12 tests TST-555..TST-582 of shared-team-lifecycle.test.js, shared-team-done.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-8 | T-501-1 | REQ-501 | refinement tests over the template | shared-team-stages, shared-unrefined-claim | the 21 tests TST-621..TST-676 of shared-team-stages.test.js, shared-unrefined-claim.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-8 | T-503-1 | REQ-503 | decision tests over the template | team.feature decision scenario, shared-team-stages | the 15 tests TST-621..TST-635 of shared-team-stages.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-8 | T-504-2 | REQ-504 | incomplete-item tests over the template | shared-team-work, shared-team-stages | the 35 tests TST-621..TST-668 of shared-team-work.test.js, shared-team-stages.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-8 | T-702-1 | REQ-702 | team new tests | shared-new (team cases), new-ask | the 9 tests TST-011..TST-019 of new-ask.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-9 | T-701-2 | REQ-701 | dependency tests | shared-foreign-deps, shared-handoff-gate | the 9 tests TST-107..TST-213 of shared-foreign-deps.test.js, shared-handoff-gate.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-10a | T-805-1 | REQ-805 | view tests | shared-team-scope, shared-query (team views) | the 9 tests TST-612..TST-620 of shared-team-scope.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-10b | T-804-1 | REQ-804 | plan tests | shared-team-plan | the 10 tests TST-583..TST-592 of shared-team-plan.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-10c | T-802-1 | REQ-802 | pop tests over the template | shared-team-pop, shared-team-lead-pop | the 34 tests TST-558..TST-611 of shared-team-pop.test.js, shared-team-lead-pop.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-10d | T-803-1 | REQ-803 | lead pop tests | shared-team-lead-pop | the 15 tests TST-558..TST-572 of shared-team-lead-pop.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |
| PH-11a | T-901-4 | REQ-901 | plain-team-items tests over the template | plain-team-items, team-boundary | the 28 tests TST-036..TST-760 of plain-team-items.test.js, team-boundary.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted |

### `.agents/test/package.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-0 | T-014-2 | REQ-014 | package files include templates/team-behaviour | npm pack list | `npm pack --dry-run --json` lists templates/team-behaviour/team.json, minimal.json, teams.example.json, workflows.example.json and the four schema files |

### `.agents/test/team-migrate.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-1 | T-011-1 | REQ-011 | teams.json flat → schema 2 with workflow team | teams-v1.json | expected file |
| PH-1 | T-011-2 | REQ-011 | wip-limits.json → entry limits, file deleted | wip fixture | limits copied, agent→member |
| PH-1 | T-011-3 | REQ-011 | backlog.scope → chunk_scope; conflict aborts | two folders | abort text |
| PH-1 | T-011-4 | REQ-011 | item words translated like statusOf (table of 14 cases) | legacy items | each word |
| PH-1 | T-011-5 | REQ-011 | teamless split slice gets the parent team | slice fixture | team set |
| PH-1 | T-011-6 | REQ-011 | --file converts the example-team definition | backlog-workflow.json copy | valid schema 2 |
| PH-1 | T-011-7 | REQ-011 | --dry-run writes nothing | v1 home | no change |
| PH-1 | T-011-8 | REQ-011 | invalid result aborts, nothing written | entry with bad lead | exit 2 |
| PH-1 | T-011-9 | REQ-011 | legacy slice gets refiner "" (3a); changes-requested gets the history line (3b) | home with two legacy items | front matter equals the expected objects |
| PH-1 | T-011-10 | REQ-011 | slice parent resolution (3d): file name, phase, archive/phases, not found | four slices | three bound to the parent's team, one listed under "not bound (parent not found)" |
| PH-1 | T-011-11 | REQ-011 | teams.json old forms: {team,count} review, unknown stage, duplicate, no lead, empty members, unknown key, bad name | seven entries | entries as in REQ-011 (1) or the abort line "teams.json: teams.<t>: <problem>; fix the entry ..." |
| PH-1 | T-011-12 | REQ-011 | wip-limits.json maps (team, agent), stale_hours other than 48, backlog.scope conflict | three homes | limits per entry; the two abort lines of REQ-011 (1) |
| PH-1 | T-011-13 | REQ-011 | example-team converted equals the template with peer renamed local (T-011-9) | topology copy at a4ab4c11 | deep equality |
| PH-1 | T-011-14 | REQ-011 | partly migrated home completes; --file --dry-run prints JSON and writes nothing | home with teams.json schema 2 and workflows.json schema 1 | one commit; file unchanged in dry run |
| PH-1 | T-016-1 | REQ-016 (CONDITIONAL Q-16) | Q-16 option A / B | schema 1 home | teams.t1.workflow = team (A) / example-team with the converted definition registered (B) |
| PH-1 | T-017-1 | REQ-017 (CONDITIONAL Q-17) | Q-17 option A / B | home with an item of team ghost | team removed and listed (A) / exit 2 with the listing text (B) |
| PH-1 | T-018-1 | REQ-018 (CONDITIONAL Q-18) | Q-18 option A / B | home with an archived item with stage | front matter rewritten (A) / unchanged and readable (B) |
| PH-1 | T-019-1 | REQ-019 (CONDITIONAL Q-19) | Q-19 option A / B | home with a teamless slice of a bound parent | bound with refiner "" (A) / unchanged (B) |

### `.agents/test/user-guard.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-3a | T-003-2 | REQ-003 | no run-time import of templates/team-behaviour | source scan | no match outside tests and migrate |
| PH-4b | T-101-3 | REQ-101 | after PH-4b src/shared/status.js exports no status word of the template (R3-004) | source of src/shared/status.js | no string literal of status.js is a status, side status or stage of templates/team-behaviour/team.json |
| PH-5 | T-206-3 | REQ-206 | no TEAM_LEAD read in src | grep | none |
| PH-11c | T-905-1 | REQ-905 | mutation: a planted word fails the guard | temp copy | fails |
| PH-11c | T-905-2 | REQ-905 | allow-list file is the only exception list | - | exists |
| PH-11c | T-905-3 | REQ-905 | hooks: a team parameter, an import of a command module, a property assignment on an imported object | three mutated copies | checks 3 and 4 fail naming file and line |
| PH-11c | T-941-1 | REQ-941 | no seam, no team parameter, engine imports only primitives | source tree | checks 3 and 4 pass; seam.js absent |
| PH-12 | T-902-1 | REQ-902 | no flow or team word in src/shared (allow-list) | source scan | 0 hits |
| PH-12 | T-902-2 | REQ-902 | import graph: src/shared imports from src/engine only binding.js | graph | the import graph of src/shared has no edge to src/team and only binding.js into src/engine (test passes; a mutated import fails) |
| PH-12 | T-902-5 | REQ-902 | src/shared/status.js removed (moved from REQ-101 to the phase that deletes the file, R3-004) | tree | absent |
| PH-13 | T-904-1 | REQ-904 | engine source contains no status/role/team word outside the allow-list | src/engine scan | 0 hits |
| PH-13 | T-904-2 | REQ-904 | dead exports removed | grep | none |

### `.agents/test/engine-binding.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-3a | T-006-2 | REQ-006 | port fails closed on invalid files for bound items | broken file + bound item | exit 2, no write |
| PH-3a | T-006-3 | REQ-006 | port ignores invalid files for unbound items | broken file + user items | allow |
| PH-3a | T-006-4 | REQ-006 | a bound item whose team has no entry | home without the entry ghost | exit 2, stderr "<path> is bound to team ghost, which has no entry in <home>/teams.json" |
| PH-11a | T-901-1 | REQ-901 | each of the 12 operations allow/refuse | patched definitions | for each of the 12 operations: allow true → the command exits 0; allow false → stdout "❌ <filled refusal>", exit 1, nothing written |
| PH-11a | T-901-2 | REQ-901 | list texts: 5 names then "and N more", belongs/belong | 7 bound items | 7 bound items: "<list>" = 5 slugs joined by ", " then " and 2 more"; one item: "belongs"; two: "belong" |
| PH-11a | T-901-3 | REQ-901 | no team file read when no item is bound | spy | 0 reads |
| PH-11b | T-112-1 | REQ-112 | unbound: only set-team | fixtures | refusal text |
| PH-11b | T-112-2 | REQ-112 | other team with session_team_only | fixtures | other_team |
| PH-11b | T-112-3 | REQ-112 | other team without session_team_only uses the item team definition | patched | allowed |
| PH-11b | T-703-1 | REQ-703 | set-team bind/unbind/limit/unknown | fixtures | texts and fields |

### `.agents/test/team-define-cli.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-3a | T-010-4 | REQ-010 | absent review is not written and reads as defaults.review | define t9 without review | teams.json has no teams.t9.review; team validate exit 0; stage rules of t9 = peer 1, external 1 |
| PH-15 | T-020-1 | REQ-020 (CONDITIONAL Q-20) | Q-20 option A / B | team with an open item | compatible definition registered, incompatible refused naming the words (A) / refused (B) |

### `.agents/test/engine-steps.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-4b | T-101-1 | REQ-101 | statuses/initial/finished read from the definition | minimal.json | words used |
| PH-4b | T-101-2 | REQ-101 | archived reserved: only archive writes it | set-status to archived | refused |
| PH-4b | T-103-1 | REQ-103 | undefined step → step_not_defined | minimal.json | stdout "❌ finish is not a step of workflow minimal (team m)", exit 1 |
| PH-4b | T-103-2 | REQ-103 | --status without set-status → status_flag | team.full.json | stdout "❌ backlog team update takes no --status: the status of a team item moves by its steps", exit 1 (undefined_step_refusals.status) |
| PH-4b | T-104-1 | REQ-104 | from, *, variants, skip_from_when, hints | fixtures | allow/refuse texts |
| PH-4b | T-104-2 | REQ-104 | from_refusal overrides wrong_status | refine-start | stdout = the filled refine_wrong_status text, not wrong_status |
| PH-4b | T-105-1 | REQ-105 | tokens same, previous, initial, first_review_stage, next_review_stage_if_satisfied, active_review_stage | fixtures | seven (token, status before, status after) triples equal: same/in progress/in progress; previous/awaiting decision/refining; initial/-/new; first_review_stage/in progress/ready for review; next_review_stage_if_satisfied/reviewing/ready for external review; active_review_stage/ready for review/reviewing; flag_value/new/<value> |
| PH-4b | T-105-2 | REQ-105 | to_rules first match; last rule without when | release | release: reviewing→reviewing, slice in progress→ready, work item in progress→new; V-rule "the last rule needs no when" |
| PH-4b | T-106-1 | REQ-106 | each value source | unit | actor=ann, now matches ^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$, today matches ^\d{4}-\d\d-\d\d$, head = git rev-parse HEAD, flag_value=<v>, ""="", field:x=<old x>, role:lead=lead, text:<a>=filled, argument:note=<note>, head_unless_covered and now_if_empty per §5.3 |
| PH-4b | T-106-2 | REQ-106 | appends moves an existing entry to the end | session_authors | order |
| PH-4b | T-107-1 | REQ-107 | records filled and headline | each template step | for each template step the body gains the filled records text after a blank line and the update line headline equals its first line without # marks |
| PH-4b | T-108-1 | REQ-108 | required, blank, cites_field (empty list passes) | fixtures | missing: filled refusal; blank "  ": same; cites_field review_refs ["r.md"] without r.md in --comments: review_cite_refs; empty list: passes |
| PH-4b | T-108-2 | REQ-108 | argument order first/after_gate/default | close | order of refusals |
| PH-4b | T-109-1 | REQ-109 | order a..g of §6 (one case per adjacent pair) | synthetic definition | first text wins |
| PH-4b | T-109-2 | REQ-109 | refusal writes nothing | fixture clone | tree equal |
| PH-4b | T-110-1 | REQ-110 | one_step, combinable first, exclusive | fixtures | texts/order |
| PH-4b | T-113-1 | REQ-113 | set-status with to flag_value; unknown word refused | patched | status / wrong word text |
| PH-4b | T-903-1 | REQ-903 | filler: every placeholder of §4.7 has a value rule | unit | for every filled placeholder of §4.7 a fixture value gives the expected text (table in the test file) |
| PH-6a | T-305-1 | REQ-305 | cleared_by_steps and cleared_by_note | fixtures | field and record |
| PH-7 | T-111-1 | REQ-111 | ends_session with except_roles | fixtures | line present/absent |
| PH-7 | T-111-2 | REQ-111 | close_now_or_next notice variants | fixtures | 4 texts |
| PH-7 | T-114-1 | REQ-114 | block_after_end false writes nothing | template | no ended_sessions |
| PH-7 | T-114-2 | REQ-114 | block_after_end true refuses the ended session only | patched | with block_after_end {field: ended_sessions}: session s1 refused with filled session_ended after its review request; session s2 allowed; absent: no field written |
| PH-7 | T-403-2 | REQ-403 | head_unless_covered | git fixture | work_commit |
| PH-8 | T-102-1 | REQ-102 | to previous resolves to returns_to | patched decision.to=previous | refining |
| PH-8 | T-504-1 | REQ-504 | edit rule selectors and qualifiers | synthetic rules | match table |
| PH-8 | T-702-2 | REQ-702 | create.priority_by_severity | fixture | rank |
| PH-8 | T-912-1 | REQ-912 (CONDITIONAL Q-05) | Q-05 option A: no max_rounds key accepted (V-schema) | patched | not a key |

### `.agents/test/engine-roles.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-5 | T-201-1 | REQ-201 | each role source resolves | entry fixtures | role sets |
| PH-5 | T-201-2 | REQ-201 | entry_rule_teams with when_empty anyone | no rules | anyone |
| PH-5 | T-202-1 | REQ-202 | by/not_by with refusal keys and wrong_actor default | fixtures | by: filled wrong_actor with <who> "member or lead"; not_by author: filled self_review; by_refusal key used when given |
| PH-5 | T-203-1 | REQ-203 | each actor mode | fixtures | actor |
| PH-5 | T-204-1 | REQ-204 | caller check with except_roles; false disables it | fixtures | member ann acting as bob: filled caller_not_actor; lead acting as bob: allowed; caller_acts_only_as_itself false: allowed |
| PH-5 | T-205-1 | REQ-205 | same worker with and without the key; exact | fixtures | allow/refuse |
| PH-5 | T-206-1 | REQ-206 | TEAM_LEAD ignored | env | entry lead |
| PH-5 | T-207-1 | REQ-207 | bind_session on/off | fixtures | bind_session true: item of branch dev refused with filled outside_scope; false: allowed |
| PH-5 | T-207-2 | REQ-207 | session_branch for pop | fixture | team pop --branch dev in a session bound to main: filled session_branch, exit 1 |
| PH-5 | T-911-1 | REQ-911 (CONDITIONAL Q-04) | Q-04 option A/B input resolution | env/flags | inputs |
| PH-8 | T-502-1 | REQ-502 | refinement-reviewer with and without rules | entry fixtures | with rules.refinement_review [gold]: members and lead of gold hold refinement-reviewer, others not; without rules: anyone holds it (when_empty anyone) |

### `.agents/test/team-cli.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-5 | T-206-2 | REQ-206 | --lead removed from pop and query --plan | argv | exit 2 |
| - | T-015-1 | REQ-015 | define refuses a team in use (kept) | existing | unchanged |

### `.agents/test/engine-conditions.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-6a | T-301-1 | REQ-301 | when/unless/force/order/exact on a synthetic condition | unit | pass/skip |
| PH-6a | T-302-1 | REQ-302 | field tests pass/fail | unit | field_empty x on {} true / on {x:"a"} false; field_present the reverse; field_exists/field_absent on key presence; field_is_actor ann on {claimed_by:"ann:1"} true without exact, false with exact |
| PH-8 | T-505-1 | REQ-505 | completeness tests: non_empty, present, positive_integer+body_pattern, section | 14 DoD cases of shared-new | the 31 tests TST-300..TST-330 of shared-new.test.js pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted; the 14 definition-of-done inputs give the same complete/incomplete answer |
| PH-9 | T-701-1 | REQ-701 | dependencies_finished: states, null, foreign, unbound target | fixtures | handoff_states [accepted, unrecorded]: unaccepted edge false, accepted true, producer without records field true (unrecorded); null: true; foreign closed target true; unbound target per the display convention |
| PH-10a | T-801-1 | REQ-801 | every predicate key true/false | unit | for every predicate key of §5.2 one fixture where it is true and one where it is false (table in the test file, 41 keys) |

### `.agents/test/engine-review.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-7 | T-401-1 | REQ-401 | stage selection and skipping | entry variants | entry review [external] skips peer: request-review → ready for external review; [] → review complete; [peer, external] → ready for review |
| PH-7 | T-402-1 | REQ-402 | count, team rule, distinct reviewers, work commit | fixtures | passes |
| PH-7 | T-404-2 | REQ-404 | verdict_words, reject_clears_passes | patched | fields |
| PH-7 | T-405-1 | REQ-405 | review_passes_met texts per rule kind | fixtures | rule team gold: "<reviewers_text>" = "members of team gold"; stage reviewers union: "members of the team"; external: "its external reviewers" |
| PH-7 | T-405-2 | REQ-405 | no_later_own_work with subject pattern, lookup failure | git fixture | subject "12 and 13: fix" after the work commit of item 12: filled review_later_work; git failing: filled review_lookup_failed; no work commit: review_no_work_commit |
| PH-7 | T-406-1 | REQ-406 | not_caller_session_of | env fixtures | caller session equals author_session: refused with review_author_session; differs: allowed; empty caller session: allowed |
| PH-7 | T-407-1 | REQ-407 | stale predicate uses the file | env set | ignored |

### `.agents/test/engine-limits.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-9 | T-601-1 | REQ-601 | numbers per level, map with default and key | entry fixtures | limit |
| PH-9 | T-601-2 | REQ-601 | wip-limits.json ignored | file present | no effect |
| PH-9 | T-602-1 | REQ-602 | active_item and holder over a home with 3 folders | fixture home | overall 3, repository o/a 2, branch o/a:main 1, team 2, member ann 1 for the fixture home of 3 folders with 3 active items |
| PH-9 | T-602-2 | REQ-602 | count_scope team excludes other teams and user items | fixture | count_scope team: overall 1 (only t1 items); home: overall 3 |
| PH-9 | T-603-1 | REQ-603 | text with 9 holders ends with ", ..." | fixture | the held list is 8 entries "<repository>#<seq>" joined by ", " followed by ", ..." |
| PH-9 | T-604-1 | REQ-604 | override lifts only listed levels | fixture | with wip_override set: team and member levels skipped (claim allowed), overall level still refuses |
| PH-9 | T-605-1 | REQ-605 | wip view rows and stale list | fixture home | lines "team t1: 1 of 4", "member ann: 1 of 1", "limits: <home>/teams.json" and "stale: 001-a (updated 2000-01-01T00:00:00Z)" |

### `.agents/test/user-flow.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-9 | T-910-1 | REQ-910 | no limit and no dependency gate outside a team | home with wip-limits.json overall 1 and a dependency on an open item | update --claim, --status in progress and move exit 0 |
| PH-12 | T-908-1 | REQ-908 | default words: list new/open/done, done, archive done, next with an unknown word | items pending, closed, shipped, Done | list open = pending, shipped, Done; list done = closed; archive of shipped exits 0; Done stored as typed |
| PH-12 | T-909-1 | REQ-909 | claim, release, close refuse nobody | one item | claim over a holder exits 0 owner bob; close without summary exits 0 status closed; release exits 0 owner = configuration user |
| PH-15 | T-933-1 | REQ-933 (CONDITIONAL Q-09) | Q-09 | fixture | A: update 1 --ask asks each field on a terminal and writes the answers; without a terminal exit 2 |
| PH-15 | T-934-1 | REQ-934 (CONDITIONAL Q-10) | Q-10 | fixture | B: list --json top level is an array; show --json an object (as COMMANDS.md) |
| PH-15 | T-935-1 | REQ-935 (CONDITIONAL Q-11) | Q-11 | fixtures | A: each code INVALID_INPUT, REFUSED, NOT_FOUND, STORAGE_ERROR, SYNC_FAILED, STALE, TEAM_CONFIG once as {"ok":false,"error":{"code":..}} with its exit code |
| PH-15 | T-936-1 | REQ-936 (CONDITIONAL Q-12) | Q-12 | env | A: BACKLOG_CLI_BRANCH, BACKLOG_HOME, BACKLOG_ORIGIN_URL set have no effect on the resolved home and branch |
| PH-15 | T-937-1 | REQ-937 (CONDITIONAL Q-13) | Q-13 selector | fixture | item |
| PH-15 | T-938-1 | REQ-938 (CONDITIONAL Q-14) | Q-14 | fixture | A: history of an item written before the event move prints "(history before <date> not recorded)" |

### `.agents/test/engine-queue.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-10a | T-208-1 | REQ-208 | foreign_items chunk_only/none | two folders | foreign_items {when: field_true chunk}: chunk item of the other folder offered, user item not; absent: neither offered (exit 3) |
| PH-10b | T-804-2 | REQ-804 | assignment strategies | synthetic | assignments |
| PH-10b | T-807-1 | REQ-807 | reorder_scope command_team vs all | home with items of t1, t2 and outside a team | index order: only t1 items move (command_team); every item re-densified (all) |
| PH-10c | T-802-2 | REQ-802 | offers order, preempts, when_actor, busy | synthetic queue | answers: first matching offer in file order; preempts replaces a review answer and a continue answer unless the item is review complete or rejected; when_actor false skips the offer; busy_when true gives busy_instruction |
| PH-10c | T-806-1 | REQ-806 | chunk_scope caps | fixtures | chunk_scope off: no chunk offer; branch: only the branch's chunk items; repo: the folder's; all: every folder's |

### `.agents/test/shared-new.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-12 | T-902-3 | REQ-902 | user new writes no team key | user new | keys |

### `.agents/test/shared-changed.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-12 | T-902-4 | REQ-902 | held is the holder field only | item with reviewer ann, owner bob | held = [], others = [item] |

### `.agents/test/shared-list.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-12 | T-928-1 | REQ-928 | list --json rows have no derived fields | one item | keys = index columns + owner, owned_since |

### `.agents/test/docs-keys.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-13 | T-906-1 | REQ-906 | every schema key path is documented | schema/*.json vs docs/team-behaviour.md | none missing |

### `.agents/test/commands-documented.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-13 | T-906-2 | REQ-906 | validate and migrate are in COMMANDS.md | - | COMMANDS.md and templates/skills/backlog/references/commands.md each contain "### backlog team validate" and "### backlog team migrate" |
| PH-14 | T-920-3 | REQ-920 | list branch and next branch documented | - | COMMANDS.md contains "### backlog list branch" and "### backlog next branch" |

### `.agents/test/user-gaps.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-14 | T-920-1 | REQ-920 | list branch <name> equals list on that branch | two branches | equal |
| PH-14 | T-920-2 | REQ-920 | next branch <name>; unknown name info line | fixtures | "next branch dev" prints the first open item of branch dev; an unknown name prints "ℹ️  branch nope has no items" and exits 0 |
| PH-14 | T-921-1 | REQ-921 | list branches columns and totals | fixture | columns branch, open, done, archived, total; the totals row equals the sums |
| PH-14 | T-922-1 | REQ-922 | import all moves open and finished, not archived | fixture | moved list |
| PH-14 | T-924-1 | REQ-924 | refresh on version change only; failure warns | fixtures | stderr and files |
| PH-14 | T-926-1 | REQ-926 | detached: reads via branch subcommands, others refused | fixture | codes/text |
| PH-14 | T-927-1 | REQ-927 | list blocked | fixture | one row "002-b waits on 001-a (ready)"; an item depending on a finished item is not listed |

### `.agents/test/shared-update.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-14 | T-923-1 | REQ-923 | add-line JSON array, --top order | fixture | body |
| - | T-704-1 | REQ-704 | dependency integrity (kept) | existing | unchanged |

### `.agents/test/router.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-14 | T-925-1 | REQ-925 | exit-code table (one case per class) | fixtures | codes |
| PH-14 | T-925-2 | REQ-925 | uncaught error exits 1 with internal error | thrown TypeError | 1 |

### `.agents/test/team-conditional.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-15 | T-930-1 | REQ-930 (CONDITIONAL Q-06) | Q-06 delete step | fixtures | A: lead --delete removes the file in one commit; member refused with the filled delete refusal |
| PH-15 | T-931-1 | REQ-931 (CONDITIONAL Q-07) | Q-07 option B move step | fixtures | B: lead --move-to <branch> changes branch through the step; a member is refused |
| PH-15 | T-932-1 | REQ-932 (CONDITIONAL Q-08) | Q-08 abandon step | fixtures | A: lead --abandon "r" on a refining item gives status = the template abandon to word and the template record |

### `.agents/test/update-notice.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| PH-15 | T-939-1 | REQ-939 (CONDITIONAL Q-15) | Q-15 timeout and warnings | stubbed registry | A: a check that times out after 3000 ms prints nothing on stderr; a registry error prints the warning line |
| - | T-940-2 | REQ-940 | existing 8 tests | - | green |

### `.agents/test/new-ask.test.js`

| phase | id | REQ | title | fixture | expected |
|---|---|---|---|---|---|
| - | T-940-1 | REQ-940 | existing 9 tests | - | green |

Runner tests (PH-0, `.agents/test/features.test.js`): T-RUN-1 tags attach to the next scenario; T-RUN-2 an outline expands one scenario per row named by its id; T-RUN-3 a conditional scenario runs only when `features/answers.json` selects its option.

## 5. Guard tests (`.agents/test/user-guard.test.js`)

1. **No flow word in the code of the user commands.** Every string literal and every property name in `x.<word>` or `x['<word>']` of `src/shared/**/*.js`, `src/help.js` and `src/main.js` is checked against the word list = every status, side status, stage, verdict, role and field name of `templates/team-behaviour/team.json` plus `team`, `lead`, `member`, `reviewer`, `refiner`; allow-list: the binding marker `team` in the port calls and the field names `owner`/`owned_since` of the codec (R1-013).
2. **Import graph.** No file under `src/shared/` imports from `src/team/`; from `src/engine/` only `binding.js`.
3. **No hook parameter.** No function of `src/shared/` declares a parameter, destructured option or variable named `team`, `seam`, `hooks` or `callbacks`, and no file imports `seam.js` (R1-001).
4. **Primitives only.** A module of `src/engine/` or `src/team/` imports from `src/shared/` only the primitives `frontmatter.js`, `index.js`, `store.js`, `sync.js`, `safety.js`, `text.js`, `args.js` (plus `src/storage.js`, `src/errors.js`), and never assigns to a property of an imported object (callback installation) (R1-001).
5. **No vocabulary in the engine.** Every string literal of `src/engine/` is a schema key or token, or is in the allow-list read from the §8 table (R1-013).
6. **No team file read outside the engine.** No `src/shared/` file contains `teams.json`, `workflows.json`, `wip-limits.json` or `backlog.scope`; `TEAM_LEAD`, `BACKLOG_REVIEW_STALE_SECONDS`, `BACKLOG_TEST_SELF` appear nowhere in `src/`.
7. **Mutation checks** (T-905-1, T-905-2): copies of `update.js` with `"in progress"` and with `team?.step(a)`, a copy of an engine module importing `../shared/update.js`, and a copy assigning `seam.x = f` each make the guard fail with the number of the check.

## 6. Migration of the existing literal-asserting tests

Before: 383 CODE-LITERAL titles (of 819) in 37 files (`tests.tsv`). No test is deleted without a replacement. Rule per theme:

| theme | titles | old files | becomes |
|---|---|---|---|
| T-BINDING | 48 | plain-team-env.test.js, plain-team-items.test.js, shared-help.test.js, shared-list.test.js, shared-new.test.js, shared-query.test.js, shared-severity.test.js, shared-team-done.test.js, shared-update.test.js, team-boundary.test.js | definition-driven binding tests (`engine-binding.test.js`) for allow/refuse per operation + the old files re-pointed to the template as conformance (texts verbatim); dispositions: changed 1, harness 29, rewrite 1, unchanged 17 |
| T-CLAIM | 16 | shared-move-archive.test.js, shared-new.test.js, shared-session-continue.test.js, shared-session-names.test.js, shared-update.test.js | conformance over the template after the harness change of §2.1; assertions per disposition; dispositions: harness 15, misclassified 1 |
| T-DEPS | 7 | shared-foreign-deps.test.js, shared-move-archive.test.js, shared-new.test.js | conformance; plus `engine-conditions.test.js` dependency predicate cases; dispositions: harness 5, unchanged 2 |
| T-FILE | 27 | team-cli.test.js, workflow.test.js | `team-cli.test.js`/`workflow.test.js` cases rewritten for schema 2 (`team-validate-cli.test.js`); the shipped-file shape tests become template validity tests; dispositions: harness 27 |
| T-HANDOFF | 71 | shared-handoff-close.test.js, shared-handoff-commands.test.js, shared-handoff-core.test.js, shared-handoff-e2e.test.js, shared-handoff-gate.test.js, shared-query.test.js | conformance; record-format tests stay as DATA-INTEGRITY unit tests; dispositions: changed 1, harness 39, misclassified 21, rewrite 1, unchanged 9 |
| T-LEGACY | 11 | shared-legacy-fields.test.js, shared-team-compat.test.js | replaced by `team-migrate.test.js` word-table cases (same 14 cases as input/expected of the migration); readers no longer translate; dispositions: changed 1, harness 5, unchanged 5 |
| T-QUEUE | 64 | shared-help.test.js, shared-move-archive.test.js, shared-new.test.js, shared-query.test.js, shared-team-lead-pop.test.js, shared-team-plan.test.js, shared-team-pop.test.js, shared-update.test.js | conformance (pop, plan); user `next`/`list` ordering cases follow Q-01; dispositions: harness 60, unchanged 4 |
| T-REFINE | 25 | shared-move-archive.test.js, shared-new.test.js, shared-team-stages.test.js, shared-unrefined-claim.test.js, shared-update.test.js | conformance; DoD detection cases become completeness rule cases; dispositions: deleted 1, harness 23, unchanged 1 |
| T-REVIEW | 20 | shared-new.test.js, shared-session-review.test.js, shared-twostage.test.js, shared-update.test.js | conformance; dispositions: harness 20 |
| T-ROLES | 6 | shared-team-teams.test.js | conformance + `engine-roles.test.js`; dispositions: changed 1, harness 5 |
| T-SCOPE | 9 | shared-team-scope.test.js | conformance + `engine-roles.test.js` scope cases; dispositions: harness 9 |
| T-STATUS | 28 | shared-move-archive.test.js, shared-new.test.js, shared-query.test.js, shared-team-status-order.test.js, shared-update.test.js | conformance for team words; user status cases follow Q-01; dispositions: harness 14, unchanged 14 |
| T-STEPS | 31 | shared-team-flow.test.js, shared-team-lifecycle.test.js, shared-team-work.test.js | conformance; dispositions: harness 31 |
| T-USERCONV | 11 | shared-move-archive.test.js, shared-new.test.js, shared-query.test.js, shared-update.test.js | CONDITIONAL on Q-01: kept as they are for option C, rewritten to read the configuration for option A, replaced by "unknown word" tests for option B; dispositions: harness 6, unchanged 5 |
| T-WIP | 9 | shared-wip.test.js | conformance for team levels; the levels outside a team are rewritten to assert no limit (D-18); dispositions: harness 8, rewrite 1 |

After: 360 literal tests stay team literals (re-pointed per disposition), 22 leave the class (machinery or storage, unchanged), 1 is deleted with its replacement named; plus 204 new tests T-nnn-k (§4) and 3 runner tests. The conformance file `engine-conformance.test.js` holds the cross-reference (old title → template rows R01–R29 of `03-spec.md` §9) and fails when a row has no test.

## 7. Conformance suite

`engine-conformance.test.js` registers `templates/team-behaviour/team.json` as workflow `team` in a throwaway home and runs (a) the re-pointed literal tests through a shared setup, (b) one test per §9 row, (c) the text-coverage check (every refusal and instruction key of the template produced by at least one test). It runs once (not twice: no bridge, R3-021) and is part of `npm test` and of every phase gate from PH-4b on; the expected added gate time is about 30 % of the 266 s of today's suite (the 188+56 scenario ids run in two locations).

## 8. Counts

- New tests: 204 (T-ids) + 3 runner tests; new scenarios: 248 ids (`04-bdd.md`).
- Literal tests: 383; dispositions changed 4, deleted 1, harness 296, misclassified 22, rewrite 3, unchanged 57.
- Conditional tests (become active when answered): 17.
