# 06 — Migration plan

**Where the code lands.** Every CLI phase is committed on branch `simplify/pr3-review` of the CLI repository (the CLI worktree); every topology consumer change on `pr2/topology-after-pr1` of the team's topology repository, deployed with its `deploy.sh` from the deployed base (diff the deployed commit, not the branch tip); this plan set lives in the CLI repository under `.agents/docs/plans/` (00-README). Each CLI commit goes live through `commit.sh`; a phase that removes something a deployed consumer uses is split: the consumer change first (additive), the CLI removal second.

**The CLI pin (D-28, R3-003).** `<deploy-tooling>/deploy.sh` reinstalls the CLI named by `<deploy-tooling>/backlog-cli.pin`, and `install_backlog_cli.sh` refuses a pin that is not on `origin/<branch>`. Therefore every topology commit of this plan (PH-2b, PH-3c, PH-10d, PH-13) sets the pin to the CLI commit live at that moment: (1) push the CLI commit, (2) write its hash into the pin in the topology commit, (3) deploy; in an additive-then-removal pair the pin names the additive CLI commit. A topology deploy without that pin change is not allowed while this plan runs.

**Gate of every commit**: the full suite (`node --test .agents/test/*.test.js`), `npm run check`, the BDD run in both locations, the private-details guard (`no-private-details.test.js` with the private deny-list), and from PH-4b on the conformance suite (once). Gates run under `setsid nohup`. Probes only in throwaway clones. Expected gate time: about 30 % above today's 266 s.

**Order.** PH-0 → PH-1 → PH-2a → PH-2b → (maintenance window: stop the team, PH-3a, PH-3b, PH-3c, start the team) → PH-4a … PH-13 in sequence; PH-14 may run after PH-0 at any point; PH-15 after the answers. No bridge and no dual reader exists (D-27): before PH-3a only schema 1 is read, after it only schema 2. The owner questions block only PH-3b (Q-16..Q-19), PH-5 (Q-04 = A assumed; B adds flags additive-then-removal) and PH-15.

## PH-0 — Schema, validator, templates, validate command, runner support, command docs (additive)

- **Scope.** Add `src/engine/schema.js` (subset interpreter), `src/engine/validate.js` (V/E rules of 03 §4.10), `templates/team-behaviour/` (team.json, minimal.json, teams.example.json, workflows.example.json, schema/*.json), `backlog team validate [--file]` (no write path; `team define`/`team workflow` keep their schema 1 input until PH-3a); Gherkin runner: tags, outlines, conditional scenarios with `t.skip(reason)` in `features.test.js`, template token (R3-025); `COMMANDS.md` and `templates/skills/backlog/references/commands.md` gain `### backlog team validate` (generated with `.agents/scripts/sync-commands-md.mjs`) so `commands-documented.test.js` stays green (R3-014); `package.test.js` T-014-2.
- **Requirements.** REQ-004, REQ-007, REQ-008, REQ-012, REQ-013, REQ-014
- **Tests first.** T-004-1, T-004-2, T-007-1, T-007-2, T-007-3, T-007-4, T-008-1, T-008-2, T-008-3, T-012-1, T-012-2, T-012-3, T-012-4, T-013-1, T-013-2, T-014-1, T-014-2
- **Scenarios.** S-004-1, S-007-1, S-007-2, S-007-3, S-008-1, S-008-2, S-013-1..63, S-014-1, S-014-2
- **Files.** src/engine/schema.js, src/engine/validate.js, src/team/cli.js (validate subcommand), src/team/help.js, templates/team-behaviour/*, features/support/gherkin.js, features/steps/cli.js, COMMANDS.md, templates/skills/backlog/references/commands.md, .agents/test/engine-schema|engine-validate|team-validate-cli|features|package tests
- **Risk.** Low: nothing at run time reads the new files.
- **Rollback.** Revert the commit; no data written.

## PH-1 — backlog team migrate (additive, throwaway homes only)

- **Scope.** `src/engine/migrate.js` with the conversion rules of §4 and REQ-011 (files, entries, items, `--file`, `--dry-run`); `team migrate` subcommand with its COMMANDS.md and skill sections (R3-014); every test sets `BACKLOG_HOME` to a throwaway home and the gate runs under `.agents/scripts/check-real-backlog-clean.mjs` (R3-023). A dry run against a copy of the running backlog (in a throwaway clone) is reviewed by the owner before PH-3b.
- **Requirements.** REQ-011, REQ-016 (C Q-16), REQ-017 (C Q-17), REQ-018 (C Q-18), REQ-019 (C Q-19)
- **Tests first.** T-011-1, T-011-2, T-011-3, T-011-4, T-011-5, T-011-6, T-011-7, T-011-8, T-011-9, T-011-10, T-011-11, T-011-12, T-011-13, T-011-14, T-016-1, T-017-1, T-018-1, T-019-1
- **Scenarios.** S-011-1, S-011-2, S-011-3, S-011-4, S-011-5, S-011-6, S-016-1, S-017-1, S-018-1, S-019-1
- **Files.** src/engine/migrate.js, src/engine/files.js (writer side), src/team/cli.js, COMMANDS.md, templates/skills/backlog/references/commands.md, .agents/test/team-migrate.test.js, fixtures example-team-v1.json, teams-v1.json, legacy-items/*
- **Risk.** Low: nothing runs it on a live home; the guard script fails the gate if a test touches the running backlog.
- **Rollback.** Revert.

## PH-2a — Tests on schema 2 words and entry leads (CLI unchanged)

- **Scope.** The shared harness change of 05 §2.1 (a)–(d): no routing of team steps to items without a team, `seed()` instead of `intoTeam()`, the lead named in the entry instead of `TEAM_LEAD` (26 files), schema 2 words instead of old front matter (24 files). The suite stays green on today's code because `teamLead()` falls back to the entry lead and the readers accept the words of the order (R3-002, R3-016).
- **Requirements.** none
- **Tests first.** per answered question
- **Scenarios.** none
- **Files.** .agents/test/shared-fixtures.js and the files listed in 05 §2.1; no file under src/
- **Risk.** Low: tests only.
- **Rollback.** Revert.

## PH-2b — Topology readers off the derived fields and TEAM_LEAD (consumer commit before the cutover)

- **Scope.** One topology commit on pr2/topology-after-pr1, deployed with the pin of D-28: CON-01, CON-02, CON-06, CON-07, CON-10, CON-12, CON-15, CON-17, CON-18, CON-20..CON-22 (read status words, never `review_state`; finished words from the definition; no `TEAM_LEAD`; the `--ignore-dependency-lock` clause removed from the dispatcher text; the topology tests that assert `TEAM_LEAD` strings changed in the same commit). Reading status words already works at 174c76d, so this commit depends on no CLI phase (R3-012, R3-013, R3-022).
- **Requirements.** none
- **Tests first.** per answered question
- **Scenarios.** none
- **Files.** topology repository: dispatcher.py, wake_hook.py, run-team.sh, status-dashboard.py, nightly_lib.py, monitoring/*.py, team-member tests, <deploy-tooling>/backlog-cli.pin
- **Risk.** Medium: the live team readers change; each reader keeps working on today's CLI output.
- **Rollback.** Revert the topology commit (pin moves back with it).

## PH-3a — Cutover CLI commit: schema 2 only (registries, entries, items)

- **Scope.** `src/engine/files.js` is the only reader of `teams.json`/`workflows.json` (schema 2 only; schema 1 fails with the migrate message, REQ-002); the existing team code reads entries and the definition through it (generic entry: `people`, `lists`, `rules`); the old-item predicate of REQ-002 replaces `lift()`/`statusOf()` (deleted with `LEGACY_KEYS` and the codec's earlier keys); `team define`/`team workflow --file` take schema 2 input only; the harness writes schema 2 registries (05 §2.1). T-101-3 is not in this phase (R3-004). Deployed only inside the maintenance window of PH-3b (the team is stopped first).
- **Requirements.** REQ-001, REQ-002, REQ-003, REQ-005, REQ-006, REQ-009, REQ-010, REQ-209
- **Tests first.** T-001-1, T-001-2, T-001-3, T-002-1, T-002-2, T-002-3, T-002-4, T-003-1, T-003-2, T-003-3, T-005-1, T-005-2, T-006-1, T-006-2, T-006-3, T-006-4, T-009-1, T-009-2, T-010-1, T-010-2, T-010-3, T-010-4, T-209-1
- **Scenarios.** S-001-1, S-001-2, S-002-1, S-002-2, S-002-3, S-003-1, S-005-1, S-005-2, S-006-1, S-006-2, S-006-3, S-009-1, S-009-2, S-010-1, S-010-2, S-010-3, S-209-1
- **Files.** src/engine/files.js, src/team/team.js, src/team/workflow.js, src/team/cli.js, src/shared/status.js (lift, statusOf, derive deleted), src/shared/frontmatter.js, src/shared/store.js, src/shared/query.js, .agents/test/shared-fixtures.js
- **Risk.** High: every team command reads new files; the window keeps the team stopped until PH-3b and PH-3c are done.
- **Rollback.** Revert the CLI commit and the migration commit together (git revert in both repositories).

## PH-3b — The owner migrates the running backlog (data commit)

- **Scope.** In the same window, after PH-3a is live: the owner runs `backlog team migrate --dry-run`, compares it with the reviewed dry run of PH-1, then runs `backlog team migrate` once (Q-16..Q-19 decide the options). This is the only data change of the plan.
- **Requirements.** none
- **Tests first.** per answered question
- **Scenarios.** none
- **Files.** the backlog repository (data only)
- **Risk.** High: the live data changes; the migration validates before it commits and writes nothing on a problem.
- **Rollback.** `git revert` of the migration commit in the backlog repository, together with PH-3a.

## PH-3c — Topology after the migration

- **Scope.** CON-13 (register the converted definition per Q-16), CON-14 and CON-19 (`team define --file` input of the team-lead skill in schema 2), pin to the PH-3a commit (D-28); then the team is started again.
- **Requirements.** none
- **Tests first.** per answered question
- **Scenarios.** none
- **Files.** topology repository: references/backlog-workflow.json, team-lead SKILL.md, team-member SKILL.md, <deploy-tooling>/backlog-cli.pin
- **Risk.** Medium.
- **Rollback.** Revert the topology commit.

## PH-4a — Engine core, not wired

- **Scope.** `src/engine/fill.js`, `src/engine/catalogue.js`, `engine.evaluate()` on synthetic definitions (T-101..T-110, T-903-1); nothing calls it yet.
- **Requirements.** none
- **Tests first.** per answered question
- **Scenarios.** none
- **Files.** src/engine/*, .agents/test/engine-steps
- **Risk.** Low.
- **Rollback.** Revert.

## PH-4b — Lifecycle delegates statuses, steps, from/to, writes, records, arguments, texts

- **Scope.** `src/team/lifecycle.js` delegates the non-review, non-hand-off steps to the engine using the registered definition; the conformance suite starts and runs once (R3-021); T-101-3: `src/shared/status.js` exports no status word.
- **Requirements.** REQ-101, REQ-103, REQ-104, REQ-105, REQ-106, REQ-107, REQ-108, REQ-109, REQ-110, REQ-113, REQ-903, REQ-907
- **Tests first.** T-101-1, T-101-2, T-101-3, T-103-1, T-103-2, T-104-1, T-104-2, T-105-1, T-105-2, T-106-1, T-106-2, T-106-3, T-107-1, T-107-2, T-108-1, T-108-2, T-109-1, T-109-2, T-110-1, T-113-1, T-903-1, T-903-2, T-907-1
- **Scenarios.** S-101-1, S-101-2, S-101-3, S-103-1, S-103-2, S-104-1, S-104-2, S-104-3, S-105-1, S-105-2, S-105-3, S-106-1, S-106-2, S-107-1, S-107-2, S-108-1, S-108-2, S-109-1, S-110-1, S-110-2, S-110-3, S-113-1, S-113-2, S-903-1, S-903-2
- **Files.** src/engine/*, src/team/lifecycle.js, src/team/workflow.js, .agents/test/engine-conformance
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-5 — Roles, identity, scope; TEAM_LEAD and --lead removed

- **Scope.** Roles from sources, actor modes, caller check, same worker, session scope from the definition; the CLI stops reading `TEAM_LEAD` and removes `--lead`; TST-630 is replaced by T-206-2 (the topology part was PH-2b).
- **Requirements.** REQ-201, REQ-202, REQ-203, REQ-204, REQ-205, REQ-206, REQ-207, REQ-911 (C Q-04)
- **Tests first.** T-201-1, T-201-2, T-201-3, T-202-1, T-203-1, T-204-1, T-205-1, T-206-1, T-206-2, T-206-3, T-207-1, T-207-2, T-911-1
- **Scenarios.** S-201-1, S-201-2, S-202-1, S-202-2, S-203-1, S-204-1, S-205-1, S-205-2, S-206-1, S-206-2, S-207-1, S-207-2
- **Files.** src/engine/roles.js, src/engine/session.js, src/team/team.js, src/team/pop.js, src/team/queue.js
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-6a — Conditions: claim, release, waiting, reassign

- **Scope.** Conditions catalogue, recheck at publication (T-301..T-306).
- **Requirements.** REQ-301, REQ-302, REQ-303, REQ-304, REQ-305, REQ-306
- **Tests first.** T-301-1, T-301-2, T-302-1, T-303-1, T-304-1, T-305-1, T-306-1
- **Scenarios.** S-301-1, S-301-2, S-302-1, S-303-1, S-303-2, S-303-3, S-304-1, S-304-2, S-304-3, S-305-1
- **Files.** src/engine/conditions.js, src/team/update.js, src/team/lifecycle.js
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-6b — Hand-offs, accept, reject, the close gate

- **Scope.** Hand-off steps with `effect`, `dependents_handoffs_accepted`; `team/handoff-commands.js` keeps only the record machinery (T-307..T-309).
- **Requirements.** REQ-307, REQ-308, REQ-309
- **Tests first.** T-307-1, T-307-2, T-308-1, T-309-1
- **Scenarios.** S-307-1, S-308-1, S-309-1, S-309-2
- **Files.** src/engine/conditions.js, src/team/handoff*.js
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-7 — Review stages, passes, request/start/review, close, stale, notices, session end

- **Scope.** Review section, entry rules, `review_passes_met`/`no_later_own_work` with their fields, stale time from the file (`BACKLOG_REVIEW_STALE_SECONDS` no longer read), `ends_session`, `notice_rules`, `block_after_end`.
- **Requirements.** REQ-111, REQ-114, REQ-401, REQ-402, REQ-403, REQ-404, REQ-405, REQ-406, REQ-407, REQ-408
- **Tests first.** T-111-1, T-111-2, T-114-1, T-114-2, T-401-1, T-401-2, T-402-1, T-402-2, T-403-1, T-403-2, T-404-1, T-404-2, T-405-1, T-405-2, T-406-1, T-407-1, T-407-2, T-408-1
- **Scenarios.** S-111-1, S-111-2, S-114-1, S-401-1, S-401-2, S-402-1, S-403-1, S-404-1, S-404-2, S-404-3, S-405-1, S-406-1, S-407-1, S-408-1, S-408-2
- **Files.** src/engine/review.js, src/team/lifecycle.js (review functions deleted), src/team/team.js
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-8 — Refinement, decisions, edit rules, completeness, team new

- **Scope.** Refinement steps, side status, edit rules, completeness, `create` for team new (the definition-of-done placeholder moves from `backlog new` to `create.missing_section`).
- **Requirements.** REQ-102, REQ-501, REQ-502, REQ-503, REQ-504, REQ-505, REQ-702, REQ-912 (C Q-05)
- **Tests first.** T-102-1, T-102-2, T-501-1, T-502-1, T-503-1, T-504-1, T-504-2, T-505-1, T-702-1, T-702-2, T-912-1
- **Scenarios.** S-102-1, S-501-1, S-501-2, S-502-1, S-503-1, S-504-1, S-504-2, S-504-3, S-504-4, S-504-5, S-504-6, S-504-7, S-504-8, S-504-9, S-504-10, S-505-1, S-505-2, S-702-1, S-702-2, S-702-3, S-702-4, S-912-1
- **Files.** src/engine/edits.js, src/engine/completeness.js, src/team/new.js
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-9 — Limits and dependency gate from the definition; none in the user flow (D-18)

- **Scope.** Entry `limits`, `active_item`, holder, override, wip view, `dependencies_finished`; the user commands stop checking limits and dependencies.
- **Requirements.** REQ-601, REQ-602, REQ-603, REQ-604, REQ-605, REQ-701, REQ-910
- **Tests first.** T-601-1, T-601-2, T-602-1, T-602-2, T-603-1, T-604-1, T-605-1, T-701-1, T-701-2, T-910-1
- **Scenarios.** S-601-1, S-601-2, S-602-1, S-602-2, S-604-1, S-604-2, S-605-1, S-605-2, S-701-1, S-910-1
- **Files.** src/engine/limits.js, src/engine/conditions.js, src/team/wip.js (deleted), src/shared/wip-limits.js (deleted), src/shared/move.js, src/shared/update.js, src/shared/plain-step.js, src/shared/dependencies.js
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-10a — Views from the definition

- **Scope.** `team query --<view>` from `views` with `fields`.
- **Requirements.** REQ-208, REQ-801, REQ-805
- **Tests first.** T-208-1, T-801-1, T-805-1
- **Scenarios.** S-208-1, S-208-2, S-805-1, S-805-2
- **Files.** src/engine/queue.js, src/team/views.js (deleted), src/team/query.js
- **Risk.** Low.
- **Rollback.** Revert.

## PH-10b — The plan and the re-order scope

- **Scope.** `team query --plan` from `queue.plan`; `queue.reorder_scope` (REQ-807).
- **Requirements.** REQ-804, REQ-807
- **Tests first.** T-804-1, T-804-2, T-807-1
- **Scenarios.** S-804-1, S-807-1, S-807-2
- **Files.** src/engine/queue.js, src/team/queue.js (plan part deleted)
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-10c — Member pop

- **Scope.** Member offers, marks through the enforcer, `holder_field`, no `--claim-now`, no instruction-text tests, no `BACKLOG_TEST_SELF` (R1-025, R1-026, R1-028).
- **Requirements.** REQ-802, REQ-806
- **Tests first.** T-802-1, T-802-2, T-806-1
- **Scenarios.** S-802-1, S-802-2, S-802-3, S-806-1
- **Files.** src/engine/queue.js, src/team/pop.js, src/team/queue.js (deleted)
- **Risk.** High: the pop order is intricate; the conformance tests of T-QUEUE gate it.
- **Rollback.** Revert.

## PH-10d — Lead pop and the work item

- **Scope.** Lead offers, `try_each`, `when_team`, `busy_when` (R3-015 items 2–4, §9 R25–R27); team-keeper fixed to call `team query --decisions` (CON-11).
- **Requirements.** REQ-803
- **Tests first.** T-803-1
- **Scenarios.** S-803-1
- **Files.** src/engine/queue.js, src/team/pop.js; topology: tools/team/team-keeper
- **Risk.** High.
- **Rollback.** Revert.

## PH-11a — The binding port for the user commands

- **Scope.** `src/engine/binding.js` (`check`, `finished`); `src/shared/team-items.js` deleted (its five texts are template refusals); `update`, `done`, `archive`, `sequence` (import), `clean`, `new --split-from` ask the port; behaviour identical (decision AO tests as conformance).
- **Requirements.** REQ-901
- **Tests first.** T-901-1, T-901-2, T-901-3, T-901-4
- **Scenarios.** S-901-1, S-901-2, S-901-3, S-901-4
- **Files.** src/engine/binding.js, src/shared/{update,done,archive,sequence,clean,new}.js, src/shared/team-items.js (deleted)
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-11b — team update acts only on bound items (D-06)

- **Scope.** `team update` on an item outside a team only binds (D-06, D-07, D-08); possible because the harness of PH-2a binds first.
- **Requirements.** REQ-112, REQ-703
- **Tests first.** T-112-1, T-112-2, T-112-3, T-703-1
- **Scenarios.** S-112-1, S-112-2, S-112-3, S-703-1, S-703-2
- **Files.** src/team/update.js, src/engine/*
- **Risk.** Low.
- **Rollback.** Revert.

## PH-11c — Team commands own their path (D-17); guards on

- **Scope.** `backlog team update|new|query|pop` move to `src/engine/commands/`; the user-command modules lose the `team` parameter; `seam.js` and its consumers deleted; guard tests 1–7 of 05 §5 switched on.
- **Requirements.** REQ-905, REQ-941
- **Tests first.** T-905-1, T-905-2, T-905-3, T-941-1
- **Scenarios.** none
- **Files.** src/engine/commands/*, src/shared/{update,new,query,router,archive,status,store,wip-limits,seam}.js, src/team/{update,new,query}.js (deleted), .agents/test/user-guard.test.js
- **Risk.** Medium.
- **Rollback.** Revert.

## PH-12 — The user-command code without team vocabulary

- **Scope.** `src/shared/status.js` deleted (its removal test is in REQ-902, R3-004); `src/shared/defaults.js` holds the default words (D-33); typed words stored as typed, archive refuses nothing, holding flags refuse nobody (D-19, D-20); `backlog new` writes no team key; `list --json` rows without derived fields (REQ-928); `.agents/scripts/verify-published-package.mjs` assertions follow D-19/D-20 (R3-017).
- **Requirements.** REQ-902, REQ-908, REQ-909, REQ-928
- **Tests first.** T-902-1, T-902-2, T-902-3, T-902-4, T-902-5, T-908-1, T-909-1, T-928-1
- **Scenarios.** S-902-1, S-902-2, S-908-1, S-908-2, S-908-3, S-908-4, S-909-1, S-909-2, S-928-1
- **Files.** src/shared/{status,defaults,index,store,query,read,archive,move,new,update,plain-step,done,sequence,seen,fields}.js, .agents/scripts/verify-published-package.mjs
- **Risk.** Medium: visible change for the nightly (archive) and the readers of list --json (done in PH-2b).
- **Rollback.** Revert.

## PH-13 — Documentation and help from the schema; 7c-3 resumes

- **Scope.** `docs/team-behaviour.md` (every key of 03 §4, generated sections checked by T-906-1), help, COMMANDS.md, README, CHANGELOG (D-09 texts, `--lead` removed, TEAM_LEAD and BACKLOG_REVIEW_STALE_SECONDS not read, `wip-limits.json` and `backlog.scope` retired, user-flow changes), the skill copies, the topology skills (CON-14).
- **Requirements.** REQ-904, REQ-906
- **Tests first.** T-904-1, T-904-2, T-906-1, T-906-2
- **Scenarios.** none
- **Files.** docs/team-behaviour.md, src/help.js, src/team/help.js, COMMANDS.md, README.md, CHANGELOG.md, templates/skills/backlog/*
- **Risk.** Low.
- **Rollback.** Revert.

## PH-14 — User features from the gap resolution (decision AR and the USER-FEATURE rows)

- **Scope.** `list branch <name>`, `next branch <name>`, `list branches` columns, `import all`, `--add-line` array, skill refresh, exit-code contract, detached HEAD text, `list blocked`.
- **Requirements.** REQ-920, REQ-921, REQ-922, REQ-923, REQ-924, REQ-925, REQ-926, REQ-927
- **Tests first.** T-920-1, T-920-2, T-920-3, T-921-1, T-922-1, T-923-1, T-924-1, T-925-1, T-925-2, T-926-1, T-927-1
- **Scenarios.** S-920-1, S-920-2, S-921-1, S-922-1, S-923-1, S-924-1, S-925-1, S-925-2, S-926-1, S-927-1
- **Files.** src/shared/{read,query,sequence,import,update,setup}.js, src/main.js, src/help.js, COMMANDS.md
- **Risk.** Low.
- **Rollback.** Revert.

## PH-15 — Conditional requirements once answered

- **Scope.** For each answered question: switch its scenarios on in `features/answers.json`, make its tests required, implement.
- **Requirements.** REQ-930 (C Q-06), REQ-931 (C Q-07), REQ-932 (C Q-08), REQ-933 (C Q-09), REQ-934 (C Q-10), REQ-935 (C Q-11), REQ-936 (C Q-12), REQ-937 (C Q-13), REQ-938 (C Q-14), REQ-939 (C Q-15), REQ-020 (C Q-20)
- **Tests first.** T-930-1, T-931-1, T-932-1, T-933-1, T-934-1, T-935-1, T-936-1, T-937-1, T-938-1, T-939-1, T-020-1
- **Scenarios.** S-930-1, S-932-1, S-933-1, S-934-1, S-935-1, S-936-1, S-937-1, S-938-1, S-020-1
- **Files.** depends on the answers
- **Risk.** Per question.
- **Rollback.** Revert per question.

## How the 7c-2c refusals and the other user-command sites become file-driven

- `src/shared/team-items.js` (OF_A_TEAM, REPLAN_TEAM, ARCHIVE_OPEN_TEAM, IMPORT_HIGHER_TEAM, CLEAN_TEAM): the five texts are the template refusals `user_update`, `user_replan`, `user_archive_unfinished`, `user_import_higher`, `user_clean`; the five call sites call `binding.check(op, items)` (PH-11a). The split refusal of `new.js` becomes `user_split` (PH-11a).
- `src/shared/status.js`: `lift`/`statusOf`/`derive` deleted at the cutover (PH-3a); the remaining helpers deleted in PH-12; `seam.js` deleted in PH-11c (D-17).
- `src/shared/plain-step.js`, `wip-limits.js`, the WIP checks of `update.js`/`move.js`, the dependency gate: refusals deleted (D-18, D-20) in PH-9 and PH-12; the field writes stay with the default words (D-33).
- `src/shared/new.js` team keys and definition-of-done placeholder: to `create` (PH-8), removed from `backlog new` (PH-12).
- Every USER-CODE-ENFORCES-FLOW row of `inventory.tsv` has its phase in `07-traceability.tsv`.

## Consumer order (R3-012, R3-013, R1-029)

| phase | consumers | why then |
|---|---|---|
| PH-2b (before the cutover) | CON-01, CON-02, CON-06, CON-07, CON-10, CON-12, CON-15, CON-17, CON-18, CON-20, CON-21, CON-22 | they read derived fields, old words or TEAM_LEAD; reading status words works at 174c76d, and the migration (PH-3b) rewrites the item files they read |
| PH-3c (after the migration) | CON-13, CON-14, CON-19 | they register or define in schema 2, which only the cutover CLI accepts |
| PH-7 | CON-09, CON-16 | the review notices and the session end move to the definition |
| PH-10c | CON-03, CON-05 | pop actions keep their names in the template |
| PH-10d | CON-11 | team-keeper calls the decisions view |
| PH-12 | CON-08 | the nightly archive keeps working: archive refuses nothing |
| PH-13 | CON-14 (skill texts) | documentation |

## Live calls per phase (R3-026)

| phase | live calls that break without the consumer change | covered by |
|---|---|---|
| PH-0, PH-1, PH-2a | none | — |
| PH-2b | none (the topology change is additive; the pin keeps the live CLI) | D-28 |
| PH-3a–PH-3c | every team command during the window (the team is stopped); after it: dispatcher.py:151-158, monitoring readers, nightly_lib.py:31,141, team-lead SKILL.md:28 | PH-2b, PH-3c |
| PH-4a–PH-9 | none (the template equals the shipped rules; the live entry's lead equals the lead the dispatcher used) | conformance suite |
| PH-10a–PH-10d | team-keeper:135 (already broken at 174c76d) | CON-11 in PH-10d |
| PH-11a–PH-11c | none live (the 173 routed calls were tests, fixed in PH-2a) | PH-2a |
| PH-12 | the nightly's `archive --force` keeps working (archive refuses nothing) | D-19 |

## How 7c-3 and 7c-4 fit

- **7c-3 (per-level help, flags to subcommands)** resumes after PH-13 on the new surface.
- **7c-4 (branch scoping, configuration-only source)** resumes after PH-3a; it depends on Q-04 (session variables) and Q-12 (environment fallbacks of the user commands).

## The documentation set and its test

`docs/team-behaviour.md` (new, packaged), `backlog team --help` and the help of `validate`, `migrate`, `workflow`, `define`, `update`, `pop`, `query`; `COMMANDS.md`; `README.md`; `CHANGELOG.md`; the skill copy `templates/skills/backlog/SKILL.md` and `references/commands.md`. Tests: `docs-keys.test.js` (T-906-1) fails when a key path of `schema/*.json` is missing from `docs/team-behaviour.md`; `commands-documented.test.js` gains `team validate` (PH-0) and `team migrate` (PH-1) in the phase that adds them (R3-014), and `list branch`, `next branch`, `list blocked`, `import all` in PH-14.

## §4 Conversion rules of a schema 1 definition (used by `backlog team migrate`; reference implementation `tools/convert_v1.py`)

Today a registered schema 1 definition governs no step: `team define` only validates against it, and every step is checked against the shipped definition plus code (src/team/workflow.js:38,55; lifecycle.js:81-94). The conversion therefore keeps the behaviour the code gave every team, which is the template (D-29, R3-001):

1. `schema` = `backlog-team-behaviour/2`; `workflow` kept; `description` kept; `version` dropped (R3-020); `team_entry_example`, `actors`, `skipped_stage_rule`, `pop` (prose), `plain_commands_on_team_items`, `plain_commands_outside_teams` dropped (listed in the output).
2. `statuses`, `finished` (without `done`) and the `enter`/`leave` steps of `side_statuses` must equal the template's; a difference aborts with `❌ backlog: <file>: <key> differs from the template (<old> / <template>); convert this definition by hand` (`returns_to: "previous"`, `blocks`, `blocks_dependents` are the template's, Q-05).
3. Steps are not read from the old file: the converted definition is the template with every review stage renamed by position (`review.stages_order`, the keys of `review.stages`, the keys of every `steps.<s>.stages`, every `defaults.review[i].stage`); a different number of stages aborts. The old role word `owner` (the claimer) corresponds to the template role `holder`; the template role `owner` is the literal backlog owner, as in today's code (lifecycle.js:391).
4. `defaults.review` = `team_entry_review_default` reduced to `{stage, count}`.
5. Every other key, `identity` and `scope` included, is the template's; `refusals` = the template's, overlaid only with old texts whose key exists in the template (the old `handoff_missing` is listed as ignored).
6. The result is validated (schema and V-rules); any problem aborts.

Executed on the two schema 1 files that exist (quality gate 4 of 10-review-log.md): the topology copy (`example-team`) converts to the template with `peer` renamed `local` (deep equality) and the shipped `templates/workflows/team.json` of 174c76d converts to the template with its description; both validate with python `jsonschema` and `tools/check_semantics.py`.
