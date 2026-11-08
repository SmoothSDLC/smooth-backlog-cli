# 10 — Review log (revision 4)

Answers to the three reviews in `reviews/` (R1: 33 findings, R2: 42, R3: 26; total 101). Every finding was checked against the CLI at `174c76d` (a detached throwaway worktree, removed afterwards), the topology branch and the templates before its disposition. Dispositions: ACCEPTED 79, ACCEPTED-MODIFIED 19, OWNER-QUESTION 3 (REJECTED 0). Two owner messages received during the revision were applied as binding rulings: the persona terms (the user / user commands, the agents / team commands), the public location and privacy rule, the owner's decision format for questions, and the ruling that the user flow enforces nothing (which decided former Q-01, Q-02 and Q-03).

| finding | severity | disposition | change made (file and section) or evidence |
|---|---|---|---|
| R1-001 | BLOCKER | ACCEPTED | D-17 (03 §2); §7 "Where the team path lives"; REQ-941 (new); REQ-905 checks 3–4 detect hook parameters, imports of command modules and property assignments on imported objects (callbacks), with mutation tests T-905-1/2; group PC-HOOKS (46 rows); 06 PH-11c; 05 §5. Verified: src/shared/update.js:57,76,136,199,226,255,278,280,287,336,338, new.js:104,124,146,187, query.js:28,142,146,154,186, seam.js, team/team.js:181-184. |
| R1-002 | BLOCKER | ACCEPTED | tools/scan.py triggers FIELD, STATUSFN, SEAM, ENVANY, TEXTTEST, ROLELIT, TEAMTEXT, LIMITNUM, ERRSHAPE; bin/ scanned; one row per rule (rules.MULTI); inventory.tsv 843 → 1033 rows (1013 sites); 01 §1–§4 regenerated (tools/gen/gen01.py); F9 corrected (01 §5). |
| R1-003 | BLOCKER | ACCEPTED-MODIFIED | Recorded as decisions citing the principle and the later owner ruling on the user flow: D-18 (no limit, no dependency gate), D-19 (word stored as typed, archive never refuses), D-20 (holding flags refuse nobody), D-33 (default words are defaults only). Differs: the owner ruling also decided the remaining parts of former Q-01/Q-02, so REQ-908/909/910 are unconditional and Q-01..Q-03 are removed (08 part 1). |
| R1-004 | MAJOR | ACCEPTED-MODIFIED | rules.OVR/MULTI reclassify the 35 rows (archive.js:45,81,114; dependencies.js:45; new.js:192; query.js:36,145; seen.js:156; sequence.js:47; store.js:220; update.js:222,256,297; cli.js:155,183; handoff.js:102,137; lifecycle.js:450,541,542; pop.js:20,25,60,62,109; queue.js:24,338,348; team/update.js:48; views.js:19; plain-step.js:19; handoff-commands.js:43); tools/inv.py asserts the R1-004 rule. Differs: cli.js:148,185 and team.js:245 keep DI-DEFINE-INUSE as the review proposed, with REQ-015 now defining "open" by the item's definition. |
| R1-005 | MAJOR | ACCEPTED | D-26; V-03 withdrawn (§4.1, §4.10, valrows); REQ-101; groups PC-ARCHIVE-WORD (archive.js:114, store.js:377). No archive stamp key added (not asked). |
| R1-006 | MAJOR | ACCEPTED | Option (a): binding.finished(item) in §7, REQ-901, REQ-921, REQ-927, §5.2 dependencies_finished. |
| R1-007 | MAJOR | ACCEPTED | queue.reorder_scope (§4.7, schema, template command_team); REQ-807 (new, two scenarios); group Q-REORDER (store.js:320, team.js:184). |
| R1-008 | MAJOR | ACCEPTED | queue.role_order (V-33) and assign {pick, role, exclude_role, within_limits} (schema, template, §4.7, REQ-802, REQ-804 with a captain/crew criterion). |
| R1-009 | MAJOR | ACCEPTED | D-21 generic entry people/lists/rules (teams and team-definition schemas, §4.8, templates); role sources entry_person/entry_list/entry_rule_teams; entry_constraints non_empty/disjoint/subset replace E-02/E-03 code; E-09, E-11; scenario texts converted. |
| R1-010 | MAJOR | ACCEPTED | D-23: parameters on review_passes_met, no_later_own_work, head_unless_covered (object value source), last_review_rejected, review.reject_clears, dependents_handoffs_accepted, effect.records_field, session.block_after_end.field, scope.foreign_items.when; on_finish.sets with now_if_empty (§5, §6 step 14, schema, template). |
| R1-011 | MAJOR | ACCEPTED | D-24: notice_rules, create.ask {field,label}, matches_rule=, reviewers_* refusal keys, when_team predicate team_count (§4.7, §5, schema, template). |
| R1-012 | MAJOR | ACCEPTED-MODIFIED | D-25 replaces D-03: no step-name restriction (V-27 reduced), combinable order = file order, and beyond the review step names and flags come from the file (steps.<s>.value, undefined_step_refusals), because the principle also forbids fixed step names. |
| R1-013 | MAJOR | ACCEPTED | 05 §5 guard 1 scans property names; guard 5 reads its allow-list from §8 (REQ-904/905); hook checks 3–4. |
| R1-014 | MAJOR | ACCEPTED | texts.list_cap, limits.held_shown (schema, template, §4.5, §4.7, §7); §8 rows for the binding marker, bootstrap error, operator inputs, idle exits. |
| R1-015 | MAJOR | ACCEPTED-MODIFIED | D-30 and REQ-011 (3): every item migrated to the stored keys; codec earlier keys deleted (ST-CODEC-LEGACY); LEGACY_KEYS in ST-LEGACY. Differs: the edge state is renamed `unrecorded` with a permanent meaning rather than migrating records into producers. |
| R1-016 | MAJOR | ACCEPTED | REQ-928 (new) list --json rows without derived fields, CON-02 in PH-2b; views.<v>.fields; REQ-805; Q-VIEWFIELDS. |
| R1-017 | MAJOR | ACCEPTED | D-27: no bridge; 06 order PH-1 migrate (additive), PH-3a cutover, PH-3b owner migration, PH-3c topology; bridge.js removed from the plan. |
| R1-018 | MAJOR | ACCEPTED | REQ-011 (3) removes stage/review_state from every item; REQ-703. |
| R1-019 | MAJOR | ACCEPTED | REQ-902 held = holder field; group PC-HELD (seen.js:156,159, query.js:101,120,123,125); test T-902-n. |
| R1-020 | MINOR | ACCEPTED | flag_value token in §4.6 to and §6 step 13, V-34, steps.<s>.value word; REQ-113. |
| R1-021 | MINOR | ACCEPTED | REQ-932 criterion reads the template. |
| R1-022 | MINOR | ACCEPTED | REQ-207 says team update --replan. |
| R1-023 | MINOR | ACCEPTED-MODIFIED | Answered by D-33: a target outside a team is finished when its status is a finished default word (§5.2, REQ-701) — no Q-01 branch remains. |
| R1-024 | MINOR | ACCEPTED | Q-11 rewritten; REQ-935; bin/backlog.js:26-28 rows (DI-ERR) via trigger ERRSHAPE. |
| R1-025 | MINOR | ACCEPTED-MODIFIED | Rows added or reclassified: ENV-OPS (BACKLOG_RUN_HOOK bin/backlog.js:10, BACKLOG_LOCK_WAIT_MS store.js:107, XDG/APPDATA store.js:23, upgrade.js:39) listed in §8; ENV-TESTSEAM DELETED (pop.js:20); ENV-SOURCE → Q-12 (store.js:35, setup.js:51,89,90). Differs: store.js:35 and setup.js:51,89 were already rows (DI-STORE/DI-SETUP), only misclassified. |
| R1-026 | MINOR | ACCEPTED | REQ-802 (no --claim-now, no command outside a team); group Q-CLAIMNOW (pop.js:71, queue.js:23,168,171); §9 R29. |
| R1-027 | MINOR | ACCEPTED-MODIFIED | D-20/REQ-909: --by recorded, no name special; plain-step.js:50,52 in PC-STEP (DELETED refusals). Differs: decided by the owner ruling instead of an option list. |
| R1-028 | MINOR | ACCEPTED | REQ-802 criterion 2 (texts changed, results equal); group Q-MARKTEXT (pop.js:84,85). |
| R1-029 | MINOR | ACCEPTED | consumers.tsv CON-15 (test_review_refs.py:34), CON-16 (dispatcher hand-off marker); 06 consumer order. |
| R1-030 | MINOR | ACCEPTED | REQ-902 field table data only; group PC-FIELDDOCS (fields.js:20-28). |
| R1-031 | MINOR | ACCEPTED | §4.5 rows waiting.cleared_by_note and waiting.record. |
| R1-032 | MINOR | ACCEPTED | §3 input row for .backlog/config.json team/user; REQ-911; Q-04 scenario. |
| R1-033 | MINOR | ACCEPTED | upgrade.js:46,205 rows (LIMITNUM, DI-UPGRADE); REQ-939; Q-15. |
| R2-001 | BLOCKER | ACCEPTED | D-32; §4.8 review default = read-time defaults.review, E-07 only on explicit lists; REQ-010 statement and criterion 3; scenario "a team without external reviewers is defined"; proved by tools/check_semantics.py: entries gold, t1, t9 valid, explicit external list without reviewers gives E-07 (gate 3). |
| R2-002 | BLOCKER | ACCEPTED-MODIFIED | §4.7a declares 30 machinery keys with required-when and placeholders (schema refusals.properties with descriptions; V-31; minimal.json gains create_status_flag; team_not_configured deleted). Differs: 14 of the 36 are no longer implicit but named in the file (notice_rules ×4, continue_passed_rules_pending and lead_close_work_item_review as offers, handoff_accept_needs_by as a condition, completion_ender via on_finish, claimed via marked_instruction, claim_first/dod/refs_note/stale_hint via texts.conditional, status_flag via undefined_step_refusals). |
| R2-003 | MAJOR | ACCEPTED | E-02 text "<a> and <b> must not share a name (<name>)" (§4.10, D-09, S-209-1, S-013 E rows). |
| R2-004 | MAJOR | ACCEPTED | workflows.schema propertyNames = workflow pattern; §4.9; validator row "registry key with colon"; negative wf-03. |
| R2-005 | MAJOR | ACCEPTED | condition minProperties removed; V-40; valrows rows for both forms. |
| R2-006 | MAJOR | ACCEPTED | D-32; §4.8 sentence and default cells. |
| R2-007 | MAJOR | ACCEPTED | §4.6 to flag_value, §6 step 13, REQ-113 exit-2 text, criterion and scenario. |
| R2-008 | MAJOR | ACCEPTED-MODIFIED | Rows for waiting keys, records_verdict, unless_request_has, offers sub-keys, preempts grammar {action, unless}, plan strategies, view absent, --plan without queue.plan (§4.6, §4.7). Differs: waiting.since_field deleted; argument order reduced to first; condition after_gate removed (template close.summary uses first). |
| R2-009 | MAJOR | ACCEPTED | step-level notice deleted; verdict notice → notice_rules (schema, template, §4.6). |
| R2-010 | MAJOR | ACCEPTED | queue.role_order (see R1-008). |
| R2-011 | MAJOR | ACCEPTED | V-23 forms, V-38 (review/session missing, stages keys), limits.override.lifts check, E-10; tools/check_semantics.py implements them. |
| R2-012 | MAJOR | ACCEPTED | $defs.predicate holds only §5.2 keys; condition-only tests in $defs.condition; V-39; §5.2 table with contexts. |
| R2-013 | MAJOR | ACCEPTED | absolute $id urn:backlog:*:2 and $ref; workflows.example.json generated with both definitions inlined and valid (gate 1). |
| R2-014 | MAJOR | ACCEPTED-MODIFIED | Interplay columns in §4.7/§4.8, container-key paragraph, entry rows per key, REQ-906 test enumerates rows. Differs: array item fields that are fully described in their parent row (completeness[], defaults.review[], limits.holder[]) did not get separate rows. |
| R2-015 | MAJOR | ACCEPTED-MODIFIED | §4.7 splits filled placeholders and literal tokens, duplicate removed, V-12 rule. Differs: the value table stays in 05 §3 and is declared part of the specification instead of being moved. |
| R2-016 | MAJOR | ACCEPTED | D-31; REQ-925 with code 4 and the storage-failure note; §8. |
| R2-017 | MAJOR | ACCEPTED | First option: REQ-925 exception, REQ-015 stderr exit 2. |
| R2-018 | MINOR | ACCEPTED | REQ-925 lists team workflow --show <unknown> as invalid input; REQ-009. |
| R2-019 | MAJOR | ACCEPTED | Second option: REQ-014 criterion 1 (validate --file for the two definitions, unit test for teams.example and workflows.example); REQ-008 note. |
| R2-020 | MAJOR | ACCEPTED | Concrete Given/When/Then criteria for REQ-001, 006, 009, 014, 015, 101, 104, 105, 108, 201, 207, 302, 303, 304, 309, 402, 404, 405, 501, 504, 505, 603, 605, 704, 801, 802, 803, 804, 805, 904, 908, 911, 934, 940. |
| R2-021 | MAJOR | ACCEPTED | S-504-3..S-504-10 (rev4_c), one refusing and one passing scenario per template edit rule. |
| R2-022 | MAJOR | ACCEPTED | All 79 expected results replaced (rev4_d table X); a check confirms none of the vague words remains. |
| R2-023 | MAJOR | ACCEPTED | S-101-2 patches the dependency condition into minimal; a second scenario shows the refusal text. |
| R2-024 | MINOR | ACCEPTED | REQ-805 and §4.7 views: invalid input on stderr exit 2; scenario added. |
| R2-025 | MAJOR | ACCEPTED | S-605-1 checks "team t1: 0 of 4"; S-605-2 lists a stale item. |
| R2-026 | MINOR | ACCEPTED | §4.1 returns_to = a word of statuses. |
| R2-027 | MAJOR | ACCEPTED | §4.10 table V-01..V-41, E-01..E-11 with triggers and texts; valrows renumbered (V-29 structural, V-31..V-40, E-09..E-11, accepted rows in separate outlines). |
| R2-028 | MAJOR | ACCEPTED-MODIFIED | 13 key scenarios added (rev4_d list K) plus REQ-207, REQ-605, REQ-701, REQ-805 ones. Differs: waiting.since_field deleted (no scenario needed); no "key" column was added to 04 §6. |
| R2-029 | MINOR | ACCEPTED | S-012-1 dropped (covered by T-012-1..4); S-503-1 checks the text; S-505-1 uses --json; S-902-1 checks team/refiner/claimed_by; S-008-2 replaced by a passing team-definition file; S-208-1 added; S-009-1 text defined by REQ-009. |
| R2-030 | MINOR | ACCEPTED | §4.9 message forms; tools/validate_subset.py omits the root path part. |
| R2-031 | MINOR | ACCEPTED-MODIFIED | stale_after_seconds cell fixed; queue.scope_default invalid example given. Differs: views.wip.stale_hours and review_only rows were restructured (views generic, review_only now an entry list) so their old examples no longer exist. |
| R2-032 | MINOR | ACCEPTED | V-36 when_empty; V-24 second form. |
| R2-033 | MINOR | ACCEPTED | §4.3 priority_by_severity semantics. |
| R2-034 | MINOR | ACCEPTED | §4.6 value argument, records_rules first match, sets_rules records precedence. |
| R2-035 | MINOR | ACCEPTED | texts.team_step/refine_how defined; "closed-like" replaced; REQ-909 rewritten; V-23 named. |
| R2-036 | MINOR | ACCEPTED | review[].team and rules.*[].team use the team-name pattern (schemas). |
| R2-037 | MINOR | ACCEPTED | §4.8 limits key format, match rule, empty map message. |
| R2-038 | MINOR | ACCEPTED-MODIFIED | REQ-009 texts (registered, unchanged, --json), REQ-008 <code>; REQ-306 names its template keys. Differs: the wrapping publication line of REQ-306 is referenced as today's sync text, not re-quoted (not re-read in this revision). |
| R2-039 | MINOR | ACCEPTED | D-09 lists agent → member (limit, wip_override_lead); REQ-603. |
| R2-040 | MINOR | ACCEPTED | team_not_configured removed from minimal.json. |
| R2-041 | MINOR | ACCEPTED | §6 steps 1 and 9 generic (value kinds, file order). |
| R2-042 | MINOR | ACCEPTED | §4.6 verdicts: <verdicts> quoting rule. |
| R3-001 | BLOCKER | ACCEPTED | 06 §4 rules rewritten (D-29, owner semantics, identity and scope); tools/convert_v1.py; executed on the topology copy and the shipped team.json of 174c76d: both validate (jsonschema 0 errors, check_semantics valid, validate_subset valid); example copy = template with peer→local (deep equality), shipped = template with its description (gate 4); T-011-9. |
| R3-002 | BLOCKER | ACCEPTED | 05 §2.1 harness change in PH-2a (routing removed, seed(), leads in entries, schema 2 words) and PH-3a (schema 2 registries); tests.tsv dispositions (harness 296, unchanged 57, misclassified 22, changed 4, rewrite 3, deleted 1). |
| R3-003 | BLOCKER | ACCEPTED | D-28; 06 "The CLI pin" paragraph with the order push → pin → deploy, in PH-2b, PH-3c, PH-10d, PH-13. |
| R3-004 | BLOCKER | ACCEPTED-MODIFIED | The status.js removal test moves to REQ-902 (PH-12); T-101-3 is now "status.js exports no status word" (PH-4b). Differs: no bridge functions are specified because the cutover removes the need (D-27). |
| R3-005 | BLOCKER | ACCEPTED-MODIFIED | Need removed instead of a dual reader: PH-0 has no write path; PH-3a switches every reader to schema 2 in one commit inside the maintenance window with PH-3b (D-27); T-009-1 and T-010-* move with REQ-009/010 to PH-3a. |
| R3-006 | MAJOR | OWNER-QUESTION | Q-16 (which workflow after the migration, REQ-016) and Q-20 (upgrading a definition in use, REQ-020); REQ-015 refers to Q-20. |
| R3-007 | MAJOR | ACCEPTED | REQ-011 (3a)–(3d), scenarios and tests. |
| R3-008 | MAJOR | OWNER-QUESTION | Q-18 (REQ-018); §8 names the migration as the one possible writer under option A. |
| R3-009 | MAJOR | OWNER-QUESTION | Q-17 (REQ-017) for the migration; the port text for a bound item whose team has no entry is decided (referential integrity) in REQ-006 with scenario and test. |
| R3-010 | MAJOR | ACCEPTED | REQ-002 old-item predicate and text; T-002-4, S-002-3. |
| R3-011 | MAJOR | ACCEPTED | REQ-011 (1) one rule per old form with abort texts. |
| R3-012 | MAJOR | ACCEPTED | consumers.tsv CON-17..CON-22 (with R1-029: CON-15..CON-22); 06 consumer order. |
| R3-013 | MAJOR | ACCEPTED-MODIFIED | CON-02, CON-07, CON-12, CON-15, CON-17, CON-18, CON-20..CON-22 in PH-2b before the cutover. Differs: lift() is deleted at the cutover (PH-3a) rather than kept until a later phase, because no bridge exists. |
| R3-014 | MAJOR | ACCEPTED | PH-0 and PH-1 carry the COMMANDS.md and skill sections of team validate / team migrate; T-906-2. |
| R3-015 | MAJOR | ACCEPTED-MODIFIED | §9 R24 (→ Q-19), R25 (try_each, skipped_instruction), R26 (when_team team_count, extra offer), R27 (busy_when with waits_on_actor_items / waits_on_other_repository), R28 (accepted loss, non_empty constraint), R29 (removed); item 7 answered by D-29. Differs: the template encodings are schema- and rule-checked only; their behavioural equality is proven when the conformance tests run (PH-10c/10d). |
| R3-016 | MAJOR | ACCEPTED | PH-2a (tests), PH-2b (topology), PH-5 (CLI ignores TEAM_LEAD, TST-630 → T-206-2). |
| R3-017 | MAJOR | ACCEPTED | PH-12 files include verify-published-package.mjs; T-014-2 in PH-0. |
| R3-018 | MAJOR | ACCEPTED-MODIFIED | Phases split: PH-3a/b/c, PH-4a/b, PH-6a/b, PH-10a–d, PH-11a–c; PH-7 merged into PH-9. Differs: migrate moves to PH-1 and the cutover to PH-3 (no PH-1b dual reader), following D-27. |
| R3-019 | MAJOR | ACCEPTED | tests.tsv columns disposition and reason for all 383 literal tests (tools/tests.py, rules from the sources and the sampled rows); 05 §6 recount. |
| R3-020 | MINOR | ACCEPTED | 06 §4 rule 1: workflow kept, description kept, version dropped. |
| R3-021 | MINOR | ACCEPTED | Conformance runs once (REQ-907, 05 §7, 06 gate); expected gate time stated. |
| R3-022 | MINOR | ACCEPTED | CON-04 marked already broken; clause removed in PH-2b. |
| R3-023 | MINOR | ACCEPTED | REQ-011, 05 §2.1, PH-1 gate under check-real-backlog-clean.mjs. |
| R3-024 | MINOR | ACCEPTED | REQ-011 (4) partial homes, --file outputs, abort texts. |
| R3-025 | MINOR | ACCEPTED | 04/06 PH-0 t.skip(reason); REQ-011 commit on the current branch in the in-repository location. |
| R3-026 | MINOR | ACCEPTED | 06 "Live calls per phase" table. |

## Counts before and after

| | before (rev 3) | after (rev 4) |
|---|---|---|
| inventory rows (sites) | 843 (843) | 1033 (1013) |
| ORIGIN CODE / DATA-INTEGRITY / SHIPPED-DATA / CONFIG | 448 / 352 / 31 / 12 | 629 / 341 / 48 / 15 |
| terminal MOVED-TO-FILE / STAYS / DELETED / OWNER-QUESTION | 397 / 353 / 39 / 54 | 468 / 372 / 169 / 24 |
| rows flagged USER-CODE-ENFORCES-FLOW | 105 | 206 |
| requirements (conditional) | 106 (17) | 114 (17) |
| scenario ids (outline rows) | 188 (48) | 248 (63) |
| planned tests | 184 | 204 |
| phases | 15 | 26 |
| owner questions | 15 | 17 (Q-04..Q-20) |
| consumers | 14 | 22 |
| decisions | D-01..D-16 | D-01..D-33 |

## Quality gates (run with `tools/gates.sh`, CLI checkout at 174c76d)

1. **Schemas** (`tools/check_schemas.py`): the four schemas pass the 2020-12 metaschema with absolute `$id`; `team.full.json`,
   `minimal.json`, `teams.example.json`, `workflows.example.json` validate with python `jsonschema` 4.19.2 (registry by `$id`, 0 errors)
   and with `tools/validate_subset.py`; the 26 negative examples of `schema/negative/` are invalid in both and the reference interpreter
   prints the expected message of `expected.tsv` for each — `SCHEMA GATE PASS`.
2. **Consistency** (`tools/check_consistency.py`): no dangling or duplicate REQ, scenario or test id; every REQ has a test and a scenario
   or a stated reason (REQ-012, REQ-904, REQ-905, REQ-907, REQ-941 and the others listed in 04 §6); features equal 03; every inventory row
   has one terminal state and a phase that exists in 06; 07 part A = inventory (1033), part B = gaps (47), part C = 17; every literal test
   has a disposition and a reason; every conditional REQ has its question in 08 — `CONSISTENCY GATE PASS`.
3. **Semantics** (`tools/check_semantics.py`): both definitions and the example registries pass V-01..V-41 / E-01..E-11; the entries of
   S-001-1, S-010-1 (define without review) and the background team pass; an explicit external stage without reviewers gives E-07; a lead
   listed as member gives E-02 (R2-001 proved).
4. **Conversion** (`tools/convert_v1.py`): the topology copy of `example-team` and the shipped `templates/workflows/team.json` of 174c76d
   convert, validate (jsonschema, subset, semantics) and equal the template (peer→local / own description).
5. **Inventory regeneration**: `tools/run.sh` twice → `inventory.tsv` and `tests.tsv` byte-identical.
6. **Privacy**: the folder copied into a throwaway CLI worktree and scanned by `.agents/test/no-private-details.test.js` with the
   private deny-list: pass 3, fail 0; the copy was removed.

## Decisions (03 §2)

D-17 team commands own their path · D-18 no limit and no dependency gate in the user flow · D-19 a status word is data (stored as typed,
archive never refuses) · D-20 holding flags refuse nobody · D-21 generic team entry · D-22 no role name in the engine · D-23 no field
name in the engine · D-24 no single-purpose token · D-25 step names and flags from the file (replaces D-03) · D-26 no reserved status
word · D-27 one cutover, no bridge · D-28 every topology commit moves the CLI pin · D-29 an old definition converts to the template ·
D-30 every item migrated once · D-31 exit codes 0–5 · D-32 absent entry keys are read-time defaults · D-33 default words of the user
commands are defaults only.

## Not verified in this revision

- The behavioural equality of the template encodings of §9 R24–R29 with 174c76d (needs the conformance tests of PH-10c/10d).
- The scenario texts were checked for ids, tags and step names, not executed (the runner changes are PH-0 work).
- The wrapping publication line of REQ-306 is cited, not re-read.
