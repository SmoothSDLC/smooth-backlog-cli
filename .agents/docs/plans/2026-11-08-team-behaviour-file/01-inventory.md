# 01 — Enforcement inventory of smooth-backlog-cli at 174c76d

Source: branch `simplify/pr3-review`, commit `174c76d` (suite 1135/1135), read in a detached worktree. Every number below is produced by
`tools/run.sh` (set `SRC` to `<checkout>/src` and `TESTS` to `<checkout>/.agents/test`); running it on the same commit reproduces
`inventory.tsv` and `tests.tsv` byte for byte (checked before commit).

## 1. Method

1. **Discovery (deterministic).** `tools/scan.py` reads every `.js` file under `src/` except the two help-text files (`src/help.js`,
   `src/team/help.js`, which only print text; they are documentation sites handled by REQ-906) and keeps every non-comment line that
   matches at least one trigger: `THROW` (BacklogError, Error, `input()`, `operation()`), `REFUSE` (`reject(`, `refuse(`, `refuse:`, `die(`,
   `no(`, a printed `❌`), `WORD` (a quoted status, stage, review-state or verdict word of the shipped vocabulary), `ROLE` (lead, members,
   external reviewers, review_only, refiner, author, same-worker), `WIP` (limit logic), `DEP` (dependency and hand-off edge logic), `REQ`
   (required fields, definition of done), `ENV` (`process.env.TEAM_*` / `BACKLOG_*`), `TEAMFIELD` (a check of an item's `team` field),
   `ENGINE` (stage rules, template filling, review history, git HEAD reads, team-file reading) and `CONST` (an upper-case constant).
   Revision 4 (R1-002) adds `FIELD` (a field read by identifier: `fm.claimed_by`, `fm.reviewer`, `fm.refiner`, `fm.work_commit`,
   `fm.reviews`, `fm.handoffs`, `fm.completed`, `owned_since`, ...), `STATUSFN` (calls of `isOpen`, `isFinished`, `isUnstarted`,
   `normalise`, `workflowOpen`, `lift`, `lifted`, `statusOf`), `SEAM` (an injected team hook `team?.x`, `team ? … :`, `if (team)`,
   `team.<hook>`, `seam.x`), `ENVANY` (every `process.env` read), `TEXTTEST` (an instruction text tested with `startsWith`, the internal
   flag `--claim-now`), `ROLELIT` (`=== 'owner'`, `|| actor()`, held lists), `TEAMTEXT` (team vocabulary in user-command texts),
   `LIMITNUM` (fixed waits and intervals) and `ERRSHAPE` (the JSON error object), and scans `bin/` too. Import lines are dropped.
   One row per rule: a line that carries several rules gets one row per rule (`rules.MULTI`).
2. **Classification.** `tools/rules.py` maps line ranges of each file to a group (`tools/groups.py`); a row takes the group of the last
   range that starts at or before its line. Each group carries the rule in one sentence, the commands affected, the ORIGIN, the
   user-command flag, the terminal state, the file key or the reason, the requirements and the migration phase. The refusal text column is
   the literal text found on the line. Point classifications (`rules.OVR`) win over ranges; a `SEAM` row in `src/shared/` is
   PC-HOOKS. A row in `src/shared/` that reads, writes or compares a status word, a role field or a team scope is never DATA-INTEGRITY,
   whatever its trigger (R1-004); `tools/inv.py` asserts it.
3. **Origins.** CONFIG = read at run time from a team entry, a registered workflow or another backlog file (`teams.json`,
   `wip-limits.json`, `backlog.scope`, `.backlog/config.json`). SHIPPED-DATA = read from the CLI's own `templates/workflows/team.json`;
   a backlog can override it only for the steps' from-words of a registered workflow — and not even that today, see finding F1.
   CODE = a rule written in JavaScript (the gap). DATA-INTEGRITY = not a flow rule: command syntax, file format and schema of an item,
   locking, stale-read, path safety, publication, referential integrity of numbers and dependencies, the archive folder, and the generic
   machinery the principle allows (identity input of the stale guard, step catalogue and dispatch, template filler).
4. **User-command flag.** `USER-CODE-ENFORCES-FLOW` marks a row in `src/shared/` whose group enforces, defaults or special-cases a
   status word, a flow step or a team rule (column `user_code_enforces_flow`).
5. **Terminal state** (also in `07-traceability.tsv`): MOVED-TO-FILE (key named), STAYS (reason), DELETED (reason), OWNER-QUESTION (id in
   `08-owner-questions.md`).

## 2. Counts (they reconcile)

| | rows |
|---|---|
| discovered sites (file:line) | 1016 |
| rows (one per rule; 17 lines carry two to four rules) | **1033** |
| CODE | 629 |
| DATA-INTEGRITY | 341 |
| SHIPPED-DATA | 48 |
| CONFIG | 15 |
| sum of origins | 1033 |
| rows flagged USER-CODE-ENFORCES-FLOW | 206 (33 groups) |

| terminal state | rows |
|---|---|
| MOVED-TO-FILE | 468 (CODE 433, SHIPPED-DATA 24, CONFIG 11) |
| STAYS | 372 (DATA-INTEGRITY 341, SHIPPED-DATA 22, CODE 9) |
| DELETED | 169 (CODE 167, SHIPPED-DATA 2) |
| OWNER-QUESTION | 24 (CODE 20, CONFIG 4) |
| total | 1033 |

Before revision 4 the scanner found 843 rows (it missed field reads, status-helper calls, hooks and `bin/`, and gave a line with two rules one row; R1-002).

## 3. Groups (one rule each; every row of `inventory.tsv` belongs to exactly one)

| group | origin | rows | user-command flag | terminal | key / reason | REQ |
|---|---|---|---|---|---|---|
| DI-ERR | DATA-INTEGRITY | 5 | 0 | STAYS | machinery: exit-code contract (2 input, 1 refusal/storage, 3 sync, 4 not cloned, 5 stale) | REQ-904 |
| DI-CLI | DATA-INTEGRITY | 10 | 0 | STAYS | machinery: command syntax | REQ-904 |
| DI-SYNTAX | DATA-INTEGRITY | 109 | 0 | STAYS | machinery: command syntax | REQ-904 |
| DI-LOCK | DATA-INTEGRITY | 12 | 0 | STAYS | concurrency: one writer per clone | REQ-904 |
| DI-UPGRADE | DATA-INTEGRITY | 25 | 0 | STAYS | package integrity, not a flow rule | REQ-904 |
| DI-SETUP | DATA-INTEGRITY | 17 | 0 | STAYS | storage location (7c-4 owns its rules) | REQ-904 |
| DI-STORE | DATA-INTEGRITY | 11 | 0 | STAYS | storage integrity | REQ-904 |
| DI-SYNC | DATA-INTEGRITY | 22 | 0 | STAYS | publication integrity | REQ-904 |
| DI-SAFETY | DATA-INTEGRITY | 12 | 0 | STAYS | path safety and secrecy | REQ-904 |
| DI-FM | DATA-INTEGRITY | 7 | 0 | STAYS | file format | REQ-904 |
| DI-STALE | DATA-INTEGRITY | 13 | 0 | STAYS | stale-read protection | REQ-904 |
| DI-REPAIR | DATA-INTEGRITY | 6 | 0 | STAYS | storage integrity | REQ-904 |
| DI-INDEX | DATA-INTEGRITY | 5 | 0 | STAYS | index integrity | REQ-904 |
| DI-HELP | DATA-INTEGRITY | 3 | 0 | STAYS | documentation machinery (REQ-906 checks the texts) | REQ-906 |
| DI-FIELDS | DATA-INTEGRITY | 4 | 0 | STAYS | item file schema documentation; team rows regenerated by REQ-906 | REQ-906 |
| DI-ITEMSCHEMA | DATA-INTEGRITY | 9 | 0 | STAYS | item file schema shared by both trees, no state change | REQ-904 |
| DI-REF | DATA-INTEGRITY | 18 | 0 | STAYS | referential integrity (decision AM keeps dependencies a generic feature) | REQ-704 |
| DI-ARCHIVE | DATA-INTEGRITY | 8 | 0 | STAYS | storage: the archive folder is read-only (D-26: no status word is written) | REQ-101, REQ-904 |
| DI-IDENTITY-FIELD | DATA-INTEGRITY | 2 | 0 | STAYS | item identity | REQ-904 |
| DI-PUBLISH-HOOK | DATA-INTEGRITY | 2 | 0 | STAYS | machinery: calls REQ-306 conditions | REQ-306 |
| DI-GIT | DATA-INTEGRITY | 2 | 0 | STAYS | machinery: value source head | REQ-106 |
| DI-HANDOFF-FORMAT | DATA-INTEGRITY | 5 | 0 | STAYS | record format integrity (digest pins a record) | REQ-307 |
| DI-HANDOFF-GRAPH | DATA-INTEGRITY | 2 | 0 | STAYS | graph reading machinery | REQ-309 |
| DI-DEFINE-IO | DATA-INTEGRITY | 9 | 0 | STAYS | file IO and publication | REQ-009, REQ-010 |
| DI-DEFINE-INUSE | DATA-INTEGRITY | 3 | 0 | STAYS | in-flight items keep the definition they started with | REQ-015 |
| DI-MACHINE | DATA-INTEGRITY | 10 | 0 | STAYS | generic evaluating machinery | REQ-103, REQ-904 |
| DI-CONCURRENCY | DATA-INTEGRITY | 2 | 0 | STAYS | concurrency | REQ-802 |
| DI-FINDINGS | DATA-INTEGRITY | 2 | 0 | STAYS | index findings | REQ-904 |
| DI-INPUT-IDENTITY | DATA-INTEGRITY | 1 | 0 | STAYS | machinery: actor identity input of the stale guard | REQ-904 |
| CFG-TEAMS | CONFIG | 3 | 0 | MOVED-TO-FILE | teams.json schema 2 (REQ-001) | REQ-001, REQ-005 |
| CFG-TEAMS-SILENT | CODE | 1 | 0 | DELETED | no silent default: an unreadable file fails (REQ-006) | REQ-006 |
| CFG-WORKFLOW-LOAD | CODE | 1 | 0 | MOVED-TO-FILE | discovery: workflows.json only, no shipped fallback (REQ-003) | REQ-003, REQ-005, REQ-006 |
| SHIP-TEAMCACHE | SHIPPED-DATA | 2 | 2 | DELETED | the shipped template is never read at run time (REQ-014) | REQ-014, REQ-003 |
| CFG-SCOPEFILE | CONFIG | 1 | 0 | MOVED-TO-FILE | team entry chunk_scope (migrated from backlog.scope) | REQ-806, REQ-011 |
| CFG-WIPFILE | CONFIG | 2 | 2 | MOVED-TO-FILE | team entry limits (migrated from wip-limits.json; the file is retired) | REQ-601, REQ-011 |
| ST-VOCAB | SHIPPED-DATA | 8 | 8 | MOVED-TO-FILE | statuses, finished, review.stages (registered definition) | REQ-101, REQ-401 |
| ST-FINISHED | SHIPPED-DATA | 1 | 1 | MOVED-TO-FILE | finished; queue predicates status_in | REQ-101, REQ-801 |
| ST-SOLO | CODE | 1 | 1 | DELETED | user items have no review; a team item uses its entry | REQ-902 |
| ST-STAGERULES | CODE | 4 | 0 | MOVED-TO-FILE | team entry review + defaults.review | REQ-402 |
| ST-ELIGIBLE | CODE | 5 | 0 | MOVED-TO-FILE | review.stages.<s>.reviewers (role) + entry review[].team | REQ-402, REQ-404 |
| ST-LEGACY | CODE | 33 | 32 | DELETED | no backwards compatibility: backlog team migrate rewrites them (REQ-011) | REQ-011, REQ-002 |
| ST-NORMALISE | CODE | 6 | 6 | DELETED | D-19: update --status and new --status store the word exactly as typed | REQ-908 |
| ST-CANSTEP | SHIPPED-DATA | 5 | 0 | MOVED-TO-FILE | steps.<step>.from, steps.<step>.by (registered definition) | REQ-104, REQ-202, REQ-907 |
| ST-NEXT | SHIPPED-DATA | 7 | 0 | MOVED-TO-FILE | steps.<step>.to / to_rules / verdicts; review.after_last_stage | REQ-105, REQ-401 |
| ST-VALIDATE | CODE | 5 | 0 | MOVED-TO-FILE | JSON Schema + semantic rules (REQ-012, REQ-013) | REQ-012, REQ-013, REQ-004, REQ-007, REQ-008 |
| ST-FILL | DATA-INTEGRITY | 1 | 0 | STAYS | machinery: template filler | REQ-903 |
| BIND-TEXTS | CODE | 5 | 5 | MOVED-TO-FILE | refusals.<key> of the bound team's definition | REQ-901, REQ-903 |
| BIND-UPDATE | CODE | 1 | 1 | MOVED-TO-FILE | user_commands.update | REQ-901 |
| BIND-REPLAN | CODE | 2 | 2 | MOVED-TO-FILE | user_commands.update-replan | REQ-901 |
| BIND-ARCHIVE | CODE | 1 | 1 | MOVED-TO-FILE | user_commands.archive-unfinished | REQ-901 |
| BIND-IMPORT | CODE | 1 | 1 | MOVED-TO-FILE | user_commands.import-higher | REQ-901 |
| BIND-CLEAN | CODE | 4 | 4 | MOVED-TO-FILE | user_commands.clean | REQ-901 |
| BIND-SPLIT | CODE | 1 | 1 | MOVED-TO-FILE | user_commands.new-split-from | REQ-901 |
| BIND-NOSTATUS | CODE | 2 | 0 | MOVED-TO-FILE | no status step in steps; refusals.step_not_defined | REQ-103 |
| BIND-ENTRYOF | CODE | 2 | 0 | MOVED-TO-FILE | binding: item field team -> teams.json entry -> workflow | REQ-901 |
| BIND-UNBOUND | CODE | 1 | 0 | MOVED-TO-FILE | steps.set-team only; refusals.not_team_item | REQ-112, REQ-703 |
| BIND-CLOSESTATUS | CODE | 2 | 0 | DELETED | team update acts only on bound items or binds by set-team (REQ-112) | REQ-112 |
| PC-LISTWORDS | SHIPPED-DATA | 2 | 2 | STAYS | D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js | REQ-908 |
| PC-FINISHED | SHIPPED-DATA | 20 | 20 | STAYS | D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js | REQ-908 |
| PC-DEFAULT | CODE | 6 | 6 | STAYS | D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js | REQ-908 |
| PC-ARCHIVE-CLOSED | CODE | 1 | 1 | DELETED | D-19: user archive never refuses because of the status | REQ-908 |
| PC-DONE | CODE | 1 | 1 | STAYS | D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js | REQ-908 |
| PC-SEVERITY | CODE | 2 | 2 | STAYS | D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js | REQ-908, REQ-702 |
| PC-NEWKEYS | CODE | 1 | 1 | MOVED-TO-FILE | create.sets and create.missing_section (team new only; user new writes none) | REQ-702, REQ-902 |
| PC-STEP | CODE | 22 | 22 | DELETED | D-20: the refusals are deleted (owner ruling on the user flow); the field writes stay with the default words | REQ-909 |
| PC-WIP | CODE | 7 | 7 | DELETED | D-18: user commands apply no work-in-progress limit (the principle) | REQ-910 |
| PC-DEPGATE | CODE | 3 | 3 | DELETED | D-18: user commands apply no dependency gate (the principle) | REQ-910 |
| PC-SEAM | CODE | 1 | 1 | DELETED | the user-command code has no seam to team rules; the binding port replaces it (REQ-901) | REQ-901, REQ-902, REQ-905 |
| ENV-INPUT | CODE | 18 | 0 | OWNER-QUESTION | Q-04 | REQ-911 |
| ENV-LEAD | CODE | 4 | 0 | MOVED-TO-FILE | roles.lead = {entry: lead}; TEAM_LEAD and --lead removed | REQ-206 |
| ENV-STALE | CODE | 1 | 0 | MOVED-TO-FILE | review.stale_after_seconds (env removed) | REQ-407 |
| RO-MEMBERS | CONFIG | 3 | 0 | MOVED-TO-FILE | roles (entry / entry_list sources) | REQ-201, REQ-209 |
| RO-AUTHOR | CODE | 1 | 0 | MOVED-TO-FILE | roles.author = item_fields [claimed_by, review_author, session_authors] | REQ-201, REQ-406 |
| RO-SAMEWORKER | CODE | 3 | 0 | MOVED-TO-FILE | identity.same_worker_pattern | REQ-205 |
| RO-CALLER | CODE | 3 | 0 | MOVED-TO-FILE | identity.caller_acts_only_as_itself | REQ-204 |
| RO-ACTSAS | CODE | 3 | 0 | MOVED-TO-FILE | steps.<step>.actor | REQ-203 |
| SC-SCOPE | CODE | 5 | 0 | MOVED-TO-FILE | scope.bind_session + refusals.outside_scope | REQ-207 |
| SC-INTEAM | CODE | 2 | 0 | MOVED-TO-FILE | scope.session_team_only, scope.foreign_items | REQ-207, REQ-208 |
| SC-BRANCHBOUND | CODE | 1 | 0 | MOVED-TO-FILE | scope.bind_session | REQ-207 |
| STEP-GATE | SHIPPED-DATA | 1 | 0 | MOVED-TO-FILE | steps.<step>.from + refusals hints | REQ-104, REQ-903, REQ-107, REQ-108, REQ-109, REQ-110 |
| STEP-CLAIM | CODE | 19 | 0 | MOVED-TO-FILE | steps.claim | REQ-303, REQ-302 |
| STEP-RELEASE | CODE | 7 | 0 | MOVED-TO-FILE | steps.release | REQ-304 |
| STEP-REASSIGN | CODE | 7 | 0 | MOVED-TO-FILE | steps.reassign | REQ-304 |
| STEP-WAIT | CODE | 6 | 0 | MOVED-TO-FILE | steps.waiting, steps.waiting-done, waiting.cleared_by | REQ-304, REQ-305 |
| STEP-RECHECK | CODE | 5 | 0 | MOVED-TO-FILE | steps.claim.recheck_at_publication | REQ-306 |
| STEP-ACTIVE | CODE | 5 | 0 | MOVED-TO-FILE | condition actor_active_items_at_most + queue.active_item | REQ-301, REQ-303 |
| HO-RECORD | CODE | 13 | 0 | MOVED-TO-FILE | steps.handoff | REQ-307 |
| HO-RECEIPT | CODE | 17 | 0 | MOVED-TO-FILE | steps.accept-handoff, steps.reject-handoff | REQ-308 |
| HO-EDGE | CODE | 4 | 0 | MOVED-TO-FILE | condition dependencies_finished.handoff_states | REQ-701, REQ-309 |
| HO-GATE | CODE | 11 | 0 | MOVED-TO-FILE | condition dependents_handoffs_accepted + refusals | REQ-309 |
| HO-TEXTS | CODE | 2 | 0 | MOVED-TO-FILE | refusals.handoff_* | REQ-903 |
| RV-REQUEST | CODE | 10 | 0 | MOVED-TO-FILE | steps.request-review | REQ-403 |
| RV-START | CODE | 6 | 0 | MOVED-TO-FILE | steps.start-review | REQ-404 |
| RV-REVIEW | CODE | 13 | 0 | MOVED-TO-FILE | steps.review | REQ-404, REQ-406 |
| RV-RULES | CODE | 12 | 0 | MOVED-TO-FILE | conditions review_passes_met, no_later_own_work | REQ-405 |
| RV-REASSIGN | CODE | 6 | 0 | MOVED-TO-FILE | steps.reassign-review | REQ-407 |
| RV-STALE | CODE | 1 | 0 | MOVED-TO-FILE | review.stale_after_seconds + queue offers | REQ-407 |
| RV-CLOSE | CODE | 9 | 0 | MOVED-TO-FILE | steps.close | REQ-408 |
| RV-HISTORY | CODE | 2 | 0 | MOVED-TO-FILE | steps.<step>.appends | REQ-106 |
| RV-NOTICE | CODE | 6 | 0 | MOVED-TO-FILE | steps.<step>.notice, steps.<step>.ends_session, session.end_text | REQ-111 |
| RV-VERDICTS | CODE | 2 | 0 | MOVED-TO-FILE | steps.<step>.verdicts, steps.<step>.verdict_words | REQ-404, REQ-501 |
| RF-STEPS | CODE | 24 | 0 | MOVED-TO-FILE | steps.refine-start, refine-done, request-refinement-review, refinement-review | REQ-501, REQ-502 |
| RF-DECISION | CODE | 11 | 0 | MOVED-TO-FILE | steps.request-decision, steps.decision, side_statuses | REQ-503, REQ-102 |
| RF-EDITS | CODE | 16 | 0 | MOVED-TO-FILE | edit_rules | REQ-504 |
| RF-COMPLETE | CODE | 8 | 0 | MOVED-TO-FILE | completeness | REQ-505 |
| RF-LEGACYSTAGE | CODE | 4 | 0 | DELETED | status words replace stage; backlog team migrate rewrites old items | REQ-011 |
| RF-JOIN | CODE | 2 | 0 | OWNER-QUESTION | Q-19 (teamless split slices: bind them or treat them as user items) | REQ-011, REQ-703 |
| RF-HOWTEXT | CODE | 3 | 0 | MOVED-TO-FILE | instruction templates (queue offers, refusals hints) | REQ-802, REQ-903 |
| WIP-LEVELS | CODE | 9 | 5 | MOVED-TO-FILE | limits + team entry limits + within_limits | REQ-601, REQ-603 |
| WIP-ACTIVE | CODE | 3 | 1 | MOVED-TO-FILE | limits.active_item, limits.holder | REQ-602 |
| WIP-OVERRIDE | CODE | 3 | 0 | MOVED-TO-FILE | steps.wip-override, limits.override | REQ-604 |
| WIP-VIEW | CODE | 8 | 0 | MOVED-TO-FILE | views.wip | REQ-605 |
| WIP-SETTEAM | CODE | 4 | 0 | MOVED-TO-FILE | steps.set-team | REQ-703 |
| WIP-START | CODE | 1 | 0 | DELETED | team update on unbound items only binds (REQ-112) | REQ-112 |
| DEP-FINISHED | CODE | 4 | 4 | MOVED-TO-FILE | condition dependencies_finished | REQ-701 |
| CR-TEAMNEW | CODE | 5 | 0 | MOVED-TO-FILE | create | REQ-702 |
| CR-DOD | CODE | 4 | 4 | MOVED-TO-FILE | completeness[].section, create.missing_section | REQ-505, REQ-702 |
| Q-POP | CODE | 39 | 0 | MOVED-TO-FILE | queue.roles.<role>.offers | REQ-802 |
| Q-LEADWORK | CODE | 16 | 0 | MOVED-TO-FILE | queue.roles.lead.offers (work item predicate) | REQ-803 |
| Q-PLAN | CODE | 21 | 0 | MOVED-TO-FILE | queue.plan.passes | REQ-804 |
| Q-VIEWS | CODE | 10 | 0 | MOVED-TO-FILE | views.<view> | REQ-805 |
| Q-ROWS | CODE | 4 | 0 | MOVED-TO-FILE | queue scope + entry.chunk_scope | REQ-806, REQ-208 |
| Q-REVIEWONLY | CONFIG | 2 | 0 | MOVED-TO-FILE | queue offer predicates over roles | REQ-802, REQ-804 |
| DEF-TEAM | CODE | 9 | 0 | MOVED-TO-FILE | JSON Schema of the team entry + semantic rules | REQ-010, REQ-209 |
| DEF-ENTRY | CODE | 3 | 0 | MOVED-TO-FILE | teams.json schema 2 entry | REQ-001, REQ-010 |
| DEF-NOTCONF | SHIPPED-DATA | 2 | 0 | MOVED-TO-FILE | refusals.team_not_configured is fixed text of the machinery (no file exists to hold it) | REQ-005 |
| DEF-WFREG | CODE | 2 | 0 | MOVED-TO-FILE | REQ-009 (schema 2 validation) | REQ-009 |
| DEAD | CODE | 3 | 0 | DELETED | dead code | REQ-904 |
| PC-HOOKS | CODE | 50 | 46 | DELETED | D-17: team commands own their path in src/engine/; user modules take no team parameter; seam.js and every consumer deleted | REQ-941, REQ-905 |
| Q-REORDER | CODE | 2 | 0 | MOVED-TO-FILE | queue.reorder_scope | REQ-807 |
| PC-HELD | CODE | 6 | 6 | DELETED | REQ-902: held = the agent is in the holder field user --claim writes; team roles are not consulted | REQ-902 |
| PC-FIELDDOCS | CODE | 5 | 5 | DELETED | REQ-902: the user field table documents data only; team meanings are documented in docs/team-behaviour.md | REQ-902, REQ-906 |
| PC-ARCHIVE-WORD | CODE | 2 | 2 | DELETED | D-26: archive moves the file and does not change status; an archived item is recognised by its path | REQ-101, REQ-908 |
| ST-CODEC-LEGACY | CODE | 8 | 0 | DELETED | D-30: every item is migrated once to the stored keys; a file with an earlier key fails with the migrate message | REQ-011, REQ-002 |
| DEF-DEFAULTWF | CODE | 2 | 0 | DELETED | D-01/REQ-010: workflow is required in every entry | REQ-010 |
| HO-DEFAULTS | CODE | 2 | 0 | DELETED | the status default is the definition initial (D-07); the review field of a record is a required argument (§8 record format) | REQ-307 |
| STEP-ONESTEP | CODE | 1 | 0 | MOVED-TO-FILE | refusals.one_step and steps.<s>.combinable | REQ-110 |
| Q-HOLDERFIELD | CODE | 1 | 0 | MOVED-TO-FILE | queue offer holder_field | REQ-802 |
| Q-VIEWFIELDS | CODE | 1 | 0 | MOVED-TO-FILE | views.<v>.fields | REQ-805 |
| Q-CLAIMNOW | CODE | 4 | 0 | DELETED | REQ-802: a mark runs only a team step of the definition through the enforcer; team pop never runs a user command | REQ-802 |
| Q-MARKTEXT | CODE | 2 | 0 | DELETED | REQ-802: decided only by the offer key mark | REQ-802 |
| ENV-OPS | DATA-INTEGRITY | 4 | 0 | STAYS | §8: documented operator inputs, not a flow rule | REQ-904 |
| ENV-SOURCE | CONFIG | 4 | 0 | OWNER-QUESTION | Q-12 (user environment fallbacks; ruling AG) | REQ-936 |
| ENV-TESTSEAM | CODE | 1 | 0 | DELETED | the test harness injects the binary; production code reads no test variable | REQ-905 |

## 4. USER-CODE-ENFORCES-FLOW sites (206 rows in 33 groups)

Each group is one rule; the sites are the rows of `inventory.tsv` with the flag. Rows of `src/shared/status.js` are flagged because every user command loads that module and through it the shipped team vocabulary.

- **BIND-ARCHIVE** (1 rows; MOVED-TO-FILE user_commands.archive-unfinished): archive of a team item that is not closed is refused, --force included. Sites: `shared/archive.js:99`
- **BIND-CLEAN** (4 rows; MOVED-TO-FILE user_commands.clean): clean with a team item in scope is refused before the question and again after the pull. Sites: `shared/clean.js:35`, `shared/clean.js:36`, `shared/clean.js:37`, `shared/clean.js:54`
- **BIND-IMPORT** (1 rows; MOVED-TO-FILE user_commands.import-higher): import --higher with a team item in the source is refused before anything moves. Sites: `shared/sequence.js:54`
- **BIND-REPLAN** (2 rows; MOVED-TO-FILE user_commands.update-replan): user update --replan naming a team item is refused. Sites: `shared/update.js:194`, `shared/update.js:195`
- **BIND-SPLIT** (1 rows; MOVED-TO-FILE user_commands.new-split-from): a split of a team item by user new is refused (team new makes it). Sites: `shared/new.js:170`
- **BIND-TEXTS** (5 rows; MOVED-TO-FILE refusals.<key> of the bound team's definition): the texts user commands print for a team item. Sites: `shared/team-items.js:4`, `shared/team-items.js:7`, `shared/team-items.js:8`, `shared/team-items.js:9`, `shared/team-items.js:10`
- **BIND-UPDATE** (1 rows; MOVED-TO-FILE user_commands.update): user update refuses every change of an item with a team (decision AO). Sites: `shared/update.js:218`
- **CFG-WIPFILE** (2 rows; MOVED-TO-FILE team entry limits (migrated from wip-limits.json; the file is retired)): <home>/wip-limits.json gives the limit numbers per level; unreadable is warned and no limit applies. Sites: `shared/wip-limits.js:10`, `shared/wip-limits.js:17`
- **CR-DOD** (4 rows; MOVED-TO-FILE completeness[].section, create.missing_section): definition-of-done detection, its placeholder and the event lines that do not count. Sites: `shared/new.js:18`, `shared/new.js:66`, `shared/new.js:67`, `shared/new.js:68`
- **DEP-FINISHED** (4 rows; MOVED-TO-FILE condition dependencies_finished): a dependency is undone while its target is not finished (or its hand-off edge is open). Sites: `shared/dependencies.js:80`, `shared/dependencies.js:85`, `shared/dependencies.js:90`, `shared/dependencies.js:92`
- **PC-ARCHIVE-CLOSED** (1 rows; DELETED D-19: user archive never refuses because of the status): user archive of an item that is not closed needs --force. Sites: `shared/archive.js:100`
- **PC-ARCHIVE-WORD** (2 rows; DELETED D-26: archive moves the file and does not change status; an archived item is recognised by its path): user archive writes the status word archived into every item it moves. Sites: `shared/archive.js:114`, `shared/store.js:377`
- **PC-DEFAULT** (6 rows; STAYS D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js): an item without a status reads as pending; user new writes pending. Sites: `shared/dependencies.js:45`, `shared/index.js:18`, `shared/index.js:22`, `shared/index.js:205`, `shared/new.js:183`, `shared/store.js:314`
- **PC-DEPGATE** (3 rows; DELETED D-18: user commands apply no dependency gate (the principle)): user claim is refused while a dependency is not finished (checked again at publication). Sites: `shared/plain-step.js:13`, `shared/plain-step.js:19`, `shared/plain-step.js:36`
- **PC-DONE** (1 rows; STAYS D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js): done runs update --status done (stored as closed). Sites: `shared/done.js:10`
- **PC-FIELDDOCS** (5 rows; DELETED REQ-902: the user field table documents data only; team meanings are documented in docs/team-behaviour.md): the user field table describes team meanings (team update, any member, team work). Sites: `shared/fields.js:20`, `shared/fields.js:21`, `shared/fields.js:22`, `shared/fields.js:24`, `shared/fields.js:28`
- **PC-FINISHED** (20 rows; STAYS D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js): user commands treat closed/done/archived as finished and everything else as open (queue membership, display marks, archive done, import, re-densify on completion). Sites: `shared/archive.js:81`, `shared/index.js:21`, `shared/index.js:58`, `shared/index.js:100`, `shared/index.js:102`, `shared/index.js:214`, `shared/move.js:90`, `shared/query.js:191`, `shared/query.js:193`, `shared/query.js:209`, `shared/query.js:277`, `shared/query.js:280`, `shared/query.js:304`, `shared/query.js:305`, `shared/sequence.js:31`, `shared/sequence.js:45`, `shared/sequence.js:47`, `shared/store.js:336`, `shared/update.js:297`, `shared/update.js:298`
- **PC-HELD** (6 rows; DELETED REQ-902: held = the agent is in the holder field user --claim writes; team roles are not consulted): the changes report counts an item as held when the agent is in claimed_by, reviewer or refiner (team role fields). Sites: `shared/query.js:101`, `shared/query.js:120`, `shared/query.js:123`, `shared/query.js:125`, `shared/seen.js:156`, `shared/seen.js:159`
- **PC-HOOKS** (46 rows; DELETED D-17: team commands own their path in src/engine/; user modules take no team parameter; seam.js and every consumer deleted): the team pipeline runs inside the user modules through an injected team hook object or a callback seam installed by backlog team. Sites: `shared/archive.js:45`, `shared/new.js:104`, `shared/new.js:109`, `shared/new.js:124`, `shared/new.js:128`, `shared/new.js:142`, `shared/new.js:146`, `shared/new.js:162`, `shared/new.js:170`, `shared/new.js:183`, `shared/new.js:187`, `shared/new.js:189`, `shared/new.js:192`, `shared/query.js:28`, `shared/query.js:36`, `shared/query.js:142`, `shared/query.js:145`, `shared/query.js:146`, `shared/query.js:151`, `shared/query.js:154`, `shared/query.js:163`, `shared/query.js:186`, `shared/query.js:236`, `shared/query.js:247`, `shared/router.js:25`, `shared/status.js:48`, `shared/status.js:58`, `shared/status.js:139`, `shared/store.js:320`, `shared/update.js:57`, `shared/update.js:76`, `shared/update.js:136`, `shared/update.js:147`, `shared/update.js:199`, `shared/update.js:222`, `shared/update.js:226`, `shared/update.js:228`, `shared/update.js:241`, `shared/update.js:255`, `shared/update.js:256`, `shared/update.js:278`, `shared/update.js:280`, `shared/update.js:287`, `shared/update.js:336`, `shared/update.js:338`, `shared/wip-limits.js:28`
- **PC-LISTWORDS** (2 rows; STAYS D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js): list words filter by status: new = pending or new, open = not finished, done = finished and not archived. Sites: `shared/query.js:23`, `shared/read.js:7`
- **PC-NEWKEYS** (1 rows; MOVED-TO-FILE create.sets and create.missing_section (team new only; user new writes none)): user new writes team keys on every item: claimed_by, claimed_at, review_state none, reviewer; and a Definition of done placeholder when the body has none. Sites: `shared/new.js:197`
- **PC-SEAM** (1 rows; DELETED the user-command code has no seam to team rules; the binding port replaces it (REQ-901)): outside backlog team only the status in progress counts as work in progress; no scope; solo entry. Sites: `shared/seam.js:8`
- **PC-SEVERITY** (2 rows; STAYS D-33: built-in default words of the user commands, defaults only, refuse nothing (owner ruling on the user flow); one module src/shared/defaults.js): a critical item defaults to priority 0 and prints the critical banner. Sites: `shared/new.js:144`, `shared/new.js:218`
- **PC-STEP** (22 rows; DELETED D-20: the refusals are deleted (owner ruling on the user flow); the field writes stay with the default words): user claim/release/close: refuse a finished item, another holder, a close without summary or by a non-claimer; write in progress, pending, closed. Sites: `shared/plain-step.js:10`, `shared/plain-step.js:23`, `shared/plain-step.js:30`, `shared/plain-step.js:31`, `shared/plain-step.js:33`, `shared/plain-step.js:34`, `shared/plain-step.js:39`, `shared/plain-step.js:43`, `shared/plain-step.js:44`, `shared/plain-step.js:45`, `shared/plain-step.js:46`, `shared/plain-step.js:49`, `shared/plain-step.js:50`, `shared/plain-step.js:51`, `shared/plain-step.js:52`, `shared/plain-step.js:53`, `shared/plain-step.js:54`, `shared/plain-step.js:55`, `shared/plain-step.js:56`, `shared/update.js:222`, `shared/update.js:279`, `shared/update.js:280`
- **PC-WIP** (7 rows; DELETED D-18: user commands apply no work-in-progress limit (the principle)): user claim, start by status and move are refused past a work-in-progress limit (wip-limits.json levels overall, repository, branch). Sites: `shared/move.js:75`, `shared/move.js:132`, `shared/plain-step.js:37`, `shared/plain-step.js:38`, `shared/update.js:240`, `shared/update.js:241`, `shared/update.js:242`
- **SHIP-TEAMCACHE** (2 rows; DELETED the shipped template is never read at run time (REQ-014)): the shipped team.json is loaded at module load and is the vocabulary of every item; a backlog cannot override it for the status words. Sites: `shared/status.js:11`, `shared/status.js:13`
- **ST-FINISHED** (1 rows; MOVED-TO-FILE finished; queue predicates status_in): a word is finished when it is in finished of the shipped file or is done; started = in progress and every later word. Sites: `shared/status.js:26`
- **ST-LEGACY** (32 rows; DELETED no backwards compatibility: backlog team migrate rewrites them (REQ-011)): items of an earlier build (pending|in_progress|done with stage and review_state) are translated to the new words on read, and stage/review_state are derived for readers. Sites: `shared/dependencies.js:25`, `shared/query.js:292`, `shared/status.js:73`, `shared/status.js:74`, `shared/status.js:76`, `shared/status.js:78`, `shared/status.js:79`, `shared/status.js:80`, `shared/status.js:81`, `shared/status.js:82`, `shared/status.js:83`, `shared/status.js:85`, `shared/status.js:86`, `shared/status.js:87`, `shared/status.js:88`, `shared/status.js:89`, `shared/status.js:90`, `shared/status.js:98`, `shared/status.js:99`, `shared/status.js:100`, `shared/status.js:101`, `shared/status.js:102`, `shared/status.js:103`, `shared/status.js:110`, `shared/status.js:113`, `shared/status.js:114`, `shared/status.js:116`, `shared/status.js:117`, `shared/status.js:123`, `shared/store.js:220`, `shared/store.js:289`, `shared/update.js:217`
- **ST-NORMALISE** (6 rows; DELETED D-19: update --status and new --status store the word exactly as typed): a typed status word is canonicalised to the shipped vocabulary; done becomes closed. Sites: `shared/new.js:183`, `shared/repair.js:59`, `shared/repair.js:60`, `shared/status.js:33`, `shared/status.js:36`, `shared/update.js:229`
- **ST-SOLO** (1 rows; DELETED user items have no review; a team item uses its entry): an item outside a team is reviewed once by anyone (SOLO rule). Sites: `shared/status.js:41`
- **ST-VOCAB** (8 rows; MOVED-TO-FILE statuses, finished, review.stages (registered definition)): status words, finished words, review stages and ready words are taken from the shipped team.json. Sites: `shared/status.js:15`, `shared/status.js:16`, `shared/status.js:17`, `shared/status.js:18`, `shared/status.js:19`, `shared/status.js:20`, `shared/status.js:21`, `shared/status.js:28`
- **WIP-ACTIVE** (1 rows; MOVED-TO-FILE limits.active_item, limits.holder): in progress counts, and a refining item with a refiner and no claimer; the holder is the claimer else the refiner. Sites: `shared/wip-limits.js:28`
- **WIP-LEVELS** (5 rows; MOVED-TO-FILE limits + team entry limits + within_limits): levels overall, repository, branch (+team, agent) counted over the backlog home; refusal text lists up to 8 holders. Sites: `shared/wip-limits.js:23`, `shared/wip-limits.js:42`, `shared/wip-limits.js:50`, `shared/wip-limits.js:53`, `shared/wip-limits.js:63`

## 5. Findings the inventory exposes (facts, verified in the code at 174c76d)

- **F1. Registered workflows are validated and stored but never enforced.** `canStep`, `next` and the refusal texts in
  `src/team/workflow.js` read `TEAM`, the shipped `templates/workflows/team.json` loaded at module load; the workflow a team entry names
  is used only by `team define` (stage names, default review list) and `team workflow --show`. A backlog cannot change any enforced rule
  today, not even the from-words.
- **F2. Most keys of the shipped definition are not read by any code**: `actors`, every `requires`, `not_by`, `sets`, `clears`,
  `requires_reason_when`, `max_rounds`, `after_max_rounds`, `blocks`, `blocks_dependents`, `stale_after_seconds`, `on_reject`,
  `on_complete`, `instruction`, `skipped_stage_rule`, `pop`, `plain_commands_on_team_items`, `plain_commands_outside_teams`,
  `team_entry_example`, `version`, `description` (0 code references each, outside the help files). They describe behaviour that is
  enforced, if at all, by code. `by` is read only for the external review stage (external reviewers).
- **F3. The team entry's `wip` is validated by `team define` and written into `teams.json`, but no limit reads it**; the limits come only
  from `<home>/wip-limits.json`.
- **F4. `refinement_review` is read from a team entry (`refinementReviewRules`) but `team define` rejects the key** (`TEAM_KEYS` lacks
  it): it can only be set by editing `teams.json` by hand.
- **F5. The review stale time is `BACKLOG_REVIEW_STALE_SECONDS` (default 1200)**, an environment variable; the file's
  `stale_after_seconds: 1200` is not read.
- **F6. `TEAM_LEAD` (environment) and `--lead` override the entry's lead** (`teamLead`), and the dispatcher sets `TEAM_LEAD`.
- **F7. An unreadable `teams.json`, `workflows.json` or `wip-limits.json` is read as empty** (a warning for two of them, nothing for the
  registry): no team, no workflow, no limit — a silent default.
- **F8. The verdict `limit` of `--refinement-review` is accepted and acts as `reject`** (it is no verdict of the shipped definition).
- **F9. User `update --status` stores a word outside the shipped vocabulary as typed, and canonicalises the words of the shipped
  vocabulary** (`normalise`, `src/shared/update.js:229`: `--status done` stores `closed`, `--status In-Progress` stores `in progress`;
  corrected in revision 4, R1-002). D-19 makes every word stored as typed.
- **F10. User `new` writes team keys on every item** (`claimed_by`, `claimed_at`, `review_state: none`, `reviewer`) and appends a
  `## Definition of done` placeholder when the body has none; user `update --claim/--release/--close` writes `in progress`, `pending`,
  `closed` and refuses another holder (re-tested: `--claim bob` after `--claim alice` exit 1 "claimed by alice").
- **F11. User claim, user `--status "in progress"` and user `move` are refused past a work-in-progress limit** and user claim while a
  dependency is unfinished (rechecked at publication) — flow enforcement in the user-command code, kept by decision 20261107-AM (see the
  inconsistency in `08-owner-questions.md`, Q-03).
- **F12. Dead code**: `needsReview`, `teamMembership`, `STOP_TEXT` in `src/team/team.js` have no caller.
- **F13. `team update` on an item without a team runs the user edits and, in a team session, team guards** (incomplete-item rule, and the
  hand-off close gate for `--status closed`); there is no single rule for which door an unbound item has (REQ-112 decides).
- **F14. the example team's authoritative definition** (`<agent-skills>/team-lead/references/backlog-workflow.json` in the topology repository,
  workflow `example-team`, stages `peer` and `local`) differs from the shipped one and is not what the CLI enforces (F1).

## 6. Tests that assert CODE-origin behaviour with literals

`tests.tsv` lists every test title of `.agents/test/*.test.js` (819 titles in 75 files; parametrised titles count once, which is why the
suite reports 1135 runs). Class `CODE-LITERAL` = the test drives a flow, status, role, limit, dependency-gate or user-on-team rule and
asserts it with literal words, names or texts; theme by file (team test files) or by keywords of the title (mixed files, after removing
the code-review labels `review P1:`/`review P2:`). 383 titles are CODE-LITERAL, 436 are other (storage, sync, syntax, help, release). Revision 4 (R3-019) adds the columns `disposition`
(unchanged, harness, rewrite, changed, deleted, misclassified) and `reason` for every literal test; the counts are in 05 §2.1.

| theme | tests | files (tests) |
|---|---|---|
| T-BINDING | 48 | plain-team-env.test.js (7), plain-team-items.test.js (12), shared-help.test.js (3), shared-list.test.js (1), shared-new.test.js (2), shared-query.test.js (1), shared-severity.test.js (1), shared-team-done.test.js (2), shared-update.test.js (3), team-boundary.test.js (16) |
| T-CLAIM | 16 | shared-move-archive.test.js (1), shared-new.test.js (2), shared-session-continue.test.js (9), shared-session-names.test.js (2), shared-update.test.js (2) |
| T-DEPS | 7 | shared-foreign-deps.test.js (4), shared-move-archive.test.js (2), shared-new.test.js (1) |
| T-FILE | 27 | team-cli.test.js (15), workflow.test.js (12) |
| T-HANDOFF | 71 | shared-handoff-close.test.js (9), shared-handoff-commands.test.js (13), shared-handoff-core.test.js (21), shared-handoff-e2e.test.js (22), shared-handoff-gate.test.js (5), shared-query.test.js (1) |
| T-LEGACY | 11 | shared-legacy-fields.test.js (6), shared-team-compat.test.js (5) |
| T-USERCONV | 11 | shared-move-archive.test.js (5), shared-new.test.js (1), shared-query.test.js (2), shared-update.test.js (3) |
| T-QUEUE | 64 | shared-help.test.js (3), shared-move-archive.test.js (1), shared-new.test.js (4), shared-query.test.js (4), shared-team-lead-pop.test.js (15), shared-team-plan.test.js (10), shared-team-pop.test.js (19), shared-update.test.js (8) |
| T-REFINE | 25 | shared-move-archive.test.js (1), shared-new.test.js (1), shared-team-stages.test.js (15), shared-unrefined-claim.test.js (6), shared-update.test.js (2) |
| T-REVIEW | 20 | shared-new.test.js (5), shared-session-review.test.js (11), shared-twostage.test.js (2), shared-update.test.js (2) |
| T-ROLES | 6 | shared-team-teams.test.js (6) |
| T-SCOPE | 9 | shared-team-scope.test.js (9) |
| T-STATUS | 28 | shared-move-archive.test.js (14), shared-new.test.js (1), shared-query.test.js (3), shared-team-status-order.test.js (7), shared-update.test.js (3) |
| T-STEPS | 31 | shared-team-flow.test.js (1), shared-team-lifecycle.test.js (10), shared-team-work.test.js (20) |
| T-WIP | 9 | shared-wip.test.js (9) |

The feature files hold 101 scenarios; the ones that assert CODE-origin team behaviour are all 7 of `team.feature`, both of
`team-flow.feature`, 9 of the 10 of `agents.feature` (user claim, release, review, waiting: Q-02), the 6 of `user-use.feature`
(user default wordss: Q-01, Q-02) and, in `queue.feature`, `finishing an item closes the gap` and `a critical item goes to the top`
(Q-01). `team-define.feature` (2) asserts the definition reader. The migration of these tests is in `05-tdd-plan.md` §6.

## 7. Consumers that depend on a CODE rule

`consumers.tsv` (22 rows; CON-15..CON-22 added in revision 4, R1-029, R3-012) lists every call or text in the topology repository (`<agent-skills>/team-lead`, `<agent-skills>/team-member`,
`tools/team`, `eval/team`) that depends on a CODE rule, with the change and the phase. Two calls are already broken at 174c76d
(CON-10: `backlog update --set-team` and `backlog pop` in `<eval-tooling>/run-team.sh`; CON-11: `--decisions` through the user reader in
`tools/team/team-keeper`).
