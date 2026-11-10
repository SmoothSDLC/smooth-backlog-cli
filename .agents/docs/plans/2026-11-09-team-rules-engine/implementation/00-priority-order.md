# Team rules engine: the prioritized implementation plan

Context: the design of the team rules engine is final (design chapters 01 to 08 of `../design/`, the owner rulings R1 to R25 of
`../00-owner-rulings.md`, the command page `../01-command-behaviour-matrix.md`), unless the second independent review (review C and
review D, still running) changes a chapter. This file turns the design into an ordered list of small batches. Each batch is one commit
that leaves every guard green, carries its own tests and its own documentation (the documentation rule of AGENTS.md: the built-in skill,
the help text, COMMANDS.md regenerated, README.md and CHANGELOG.md, in the same change), and cites the design chapters it implements by
number. When review C or D changes a chapter, the batches that cite it re-read the chapter at their start; no batch copies design text.
Where the batches are developed and how they reach the installed CLI is `01-landing-strategy.md`; the tests are `02-bdd-plan.md`; the
risks and the decisions for the owner are `03-risks-and-open-items.md`.

## 1. How every batch is proven

Context: four checks prove a batch. They exist today and are run from the checkout that holds the batch (the engine worktree of
`01-landing-strategy.md`), never from another checkout.

| check | command | what it does |
|---|---|---|
| syntax | `npm run check` | runs `node --check bin/backlog.js`: the syntax of the entry file only, nothing else |
| private details | `BACKLOG_PRIVATE_DENYLIST=<path of the private deny list> node --test .agents/test/no-private-details.test.js` until batch B01, then `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<path of the private deny list> node --test .agents/test/no-private-details.test.js` | scans every tracked file for an entry of the private deny list kept outside the repository; a new file is scanned only once it is tracked, so it is first marked with `git add -N <file>` |
| full suite | `npm test` | runs `node --test .agents/test/*.test.js`: every unit and integration test and the BDD scenarios in both storage locations (1135 tests on the last full run on record, 2026-11-08; the commits since then change only plan documents and the review log) |
| BDD alone | `FEATURE_LOCATION=local node --test .agents/test/features.test.js`, then `FEATURE_LOCATION=remote node --test .agents/test/features.test.js` | runs the scenarios of `features/*.feature` with the backlog inside the repository (local) and in a separate clone (remote); 101 scenarios per location today |

The lead's two scripts run the last two checks: run-tests.sh runs the full-suite command and writes a log with its start, its end and
the exit code; bdd.sh runs the BDD command once per location into two logs. Both scripts change into the review worktree before they run,
so they prove the working branch only; for a batch in the engine worktree the commands above are typed in that worktree. Two more checks
apply when a batch touches what they cover: `node .agents/scripts/sync-commands-md.mjs` after any change of the help text (the test
.agents/test/commands-documented.test.js fails when COMMANDS.md is out of date), and `npm pack --dry-run` after any change of the shipped
files (B08 and B25 add templates/teams/).

"The standard proof" below means: the four checks above, all green, run after the batch's own new tests were written first and seen to
fail.

## 2. The order and why

Context: the owner's order for this work is foundations, then the evaluator and validation on load, then the team commands, then the
user-command changes, then the migration, the setup templates and the removals. Within that order a batch comes after everything it
calls (dependency) and, between two independent batches, the one whose failure would cost more comes first, so that it fails early
(risk). The phases:

1. **Foundations (B01 to B06).** Everything else reads the prefixed variables, the configuration keys, the number counter and the JSON
   item file, so they come first. The variable rename (B01) is first because every later test is written with the new names and would
   otherwise be written twice. The number counter (B03, B04) comes before the JSON switch because it works on file names alone and is
   safest proven on today's format. The JSON switch (B06) is the largest and riskiest batch, so it is prepared by a refactor (B05) that
   moves every item read and write behind one module without changing behaviour, which leaves B06 a change of that module plus the tests
   that read item files directly.
2. **Evaluator and validation (B07 to B11).** Pure modules with no command wired: they can fail without touching any user. The linear
   pattern matcher (B07) is first because the evaluator and the checks call it; the checks of the file (B10) come after the evaluator
   (B08, B09) because the shadowing check reuses the evaluator's condition reader; validation on load (B11) needs the checks.
3. **Team commands (B12 to B16).** The router and the inputs first (B12, with `backlog team validate`, the one read-only command), then
   creation (B13), then the step commands (B14, which also replaces today's team commands that call each other), then the concurrency
   re-run (B15, which needs a writing command to exercise it), then the read-only query forms (B16).
4. **User-command changes (B17 to B21).** They need the team items to exist in the new form (B13), so they follow the team commands.
   Reads first (B17), then writes (B18), the queue ownership (B19), the session guard (B20) and the own-folder scope (B21).
5. **Migration (B22 to B24).** The migration needs the JSON writer (B06), the counter (B03), the file checks (B10) and the team inputs
   (B12); it comes after the user commands so that its tests can run the converted folder through every command.
6. **Setup (B25, B26).** Setup copies the templates (they ship from B08 on) and recommends the migration (B22 writes the record it reads).
7. **Removals (B27 to B29).** The old team code is unreachable after B14 and B16; removing it last keeps every earlier batch small and
   lets each earlier batch keep the old unit tests of modules it does not touch.

Batches outside this repository (the owner's team file, the skills, the full-scope execution, the gap review) are listed in section 4;
the cut-over that brings the batches to the installed CLI is `01-landing-strategy.md`.

## 3. The batches

Every batch below belongs to backlog item 152 (the CLI implementation) of the backlog repo unless another item is named. "Breaking" marks a
batch after which the installed CLI would behave differently for an existing consumer; `01-landing-strategy.md` counts them.

### Summary

| id | goal | breaking | depends on | size (lines) | backlog item |
|---|---|---|---|---|---|
| B01 | every variable the CLI owns carries the prefix SMOOTH_BACKLOG_CLI_ | yes | none | 350 | 152 |
| B02 | the configuration keys of the team file, its SHA and the migration record; the team-file location | no | B01 | 150 | 152 |
| B03 | a number is allocated above the high-water mark of the folder's history | no (a shallow clone now refuses to allocate) | B01 | 250 | 152 |
| B04 | a user command's new item is renumbered above the upstream mark at publication | no | B03 | 200 | 152 |
| B05 | every item read and write goes through one item-file module (refactor, no behaviour change) | no | B01 | 150 | 152 |
| B06 | item files are JSON; a markdown item stops every command | yes | B05 | 700 | 152 |
| B07 | the linear-time pattern matcher | no | none | 250 | 152 |
| B08 | the evaluator: rule table, conditions, values, effects, the step `new` | no | B06, B07 | 800 | 152 |
| B09 | the pop table and the named filters | no | B08 | 250 | 152 |
| B10 | the checks of the team file (people, item definition, every rule, schema) | no | B08 | 450 | 152 |
| B11 | validation on load with the SHA and the per-user record | no | B02, B10 | 300 | 152 |
| B12 | the team router, the inputs of a team command, `backlog team validate` | no (a new command; today's team commands keep their routes) | B11 | 400 | 152 |
| B13 | `backlog team new` on the evaluator | yes | B12, B09 | 300 | 152 |
| B14 | `backlog team update`, `backlog team query check`, `backlog team pop`, `backlog team query plan` | yes | B13 | 600 added, about 3000 test lines removed | 152 |
| B15 | a team command runs again on the upstream files when another agent published first | no (new behaviour of new commands) | B14, B04 | 300 | 152 |
| B16 | the read-only team query forms and the step list in the help | no | B14 | 300 | 152 |
| B17 | user read commands ignore team items; `--show-all` shows them | yes | B13 | 350 | 152 |
| B18 | user write commands on team items with `--show-all`, `--set`, the history note | no (adds a way; B17 already hides team items) | B17 | 250 | 152 |
| B19 | a reordering keeps the other owner's positions in the index | no | B17 | 150 | 152 |
| B20 | a session that names a team cannot run user commands | yes | B17 | 80 | 152 |
| B21 | every command acts on its own repository folder only | yes (`backlog move` to another repository is removed) | B06, B14 | 300 (mostly removals) | 152 |
| B22 | `backlog team migrate`: the conversion of one folder, its failures, its dry run, its record | no (a new command) | B06, B10, B12, B03 | 600 | 152 |
| B23 | the migration's data cases: unbinding, split parents, priority order, status copies | no | B22 | 300 | 152 |
| B24 | the migration's field report and `--ask` | no | B22 | 300 | 152 |
| B25 | `backlog setup` copies the team templates | no | B08 | 150 plus the five template files | 150, 152 |
| B26 | `backlog setup` recommends the migration, and runs on a markdown backlog | no | B22 | 100 | 152 |
| B27 | the old team commands, modules, readers and the shipped workflow are removed | yes | B14, B16, B22 | about 4000 removed | 152 |
| B28 | the compatibility paths are removed | yes | B27, B22 | about 300 removed | 152 |
| B29 | the final documentation pass, the plan moved to completed, the pull request text | no | all | 200 | 152 |

### Phase 1: foundations

**B01. The environment prefix.**
- Goal: every environment variable the CLI owns is read under its SMOOTH_BACKLOG_CLI_ name and the old name is not read (no alias).
- Rulings and chapters: R20, R18; chapter 01 section 5, chapter 06 section 6 (the row on unprefixed variables).
- Target files: the 17 files of src/ and bin/ that name one of the variables (among them src/team/team.js, src/team/cli.js,
  src/team/pop.js, src/team/lifecycle.js, src/shared/seen.js, src/shared/setup.js, src/shared/store.js, src/storage.js, bin/backlog.js and
  the help texts src/help.js and src/team/help.js); the 58 test, helper and feature files that name one (`02-bdd-plan.md` section 3);
  COMMANDS.md, README.md, CHANGELOG.md, templates/skills/backlog/SKILL.md.
- The names: the ten of R20, plus four more the R20 inventory missed, found by reading `process.env` in src/ and bin/: BACKLOG_RUN_HOOK
  (the program run after every command, bin/backlog.js), BACKLOG_RUN_LOCK_HELD (the lock a parent command hands to its child,
  src/shared/store.js), BACKLOG_REVIEW_STALE_SECONDS and BACKLOG_TEST_SELF (both read only by today's team code, removed in B14 and B27).
  R20 says every variable the CLI owns is prefixed, so the four are renamed too (lead decision, recorded in `03-risks-and-open-items.md`).
- Layer and role: configuration layer; implementing agent, a second agent reviews.
- Proof: the standard proof, run with the new guard variable; a new test .agents/test/env-prefix.test.js that sets only an old name
  (for example TEAM_NAME=web and BACKLOG_AGENT=a1) and expects the three-ways text of chapter 01 section 5 from `backlog team query`, and a
  grep check in the same test that no file of src/ or bin/ reads an unprefixed name of the list.
- Unrelated-file risk: high in count (58 test files change), low in meaning (a mechanical rename); a parallel change of any of those
  test files conflicts.
- Depends on: nothing.

**B02. The configuration keys and the team-file location.**
- Goal: the configuration reader knows `teams_file`, `teams_file_sha`, `migrated_at` and `migrated_by_version`; a pure function resolves the
  team file (the explicit key, else the repository's folder in a separate backlog repository, else .backlog/teams.json) with today's path
  safety and the missing-file text. Nothing calls it yet.
- Rulings and chapters: R22, R25 (the two record keys, read only here); chapter 01 section 1.1, chapter 06 section 2.0.
- Target files: src/shared/setup.js (readConfig), a new src/team/teams-file.js; tests .agents/test/team-file-location.test.js.
- Layer and role: configuration layer; implementing agent.
- Proof: the standard proof; the cases R22-01 to R22-05 of rule-cases.json pass through the new function.
- Unrelated-file risk: low (one reader function changes).
- Depends on: B01.

**B03. The number high-water mark.**
- Goal: a new number is the highest number ever used in the folder's history plus one; numbers.json records it; a shallow clone refuses to
  allocate; `backlog update <item> --seq <n>` is refused unless n is above the mark.
- Rulings and chapters: R12; chapter 05 sections 1, 2 and 4.
- Target files: a new src/shared/numbers.js (the port of the spike's numbers.mjs), src/shared/store.js (nextSeq and nextSeqFor read the
  mark), src/shared/new.js, src/shared/update.js (`--seq`), src/shared/move.js (its renumbering); tests .agents/test/numbers.test.js.
- Layer and role: storage layer; implementing agent.
- Proof: the standard proof; the five git scenarios of chapter 05 section 2 ported from the spike (delete the newest, revert a creation,
  a lowered or deleted counter, shallow clone refused, `--seq` below the mark refused) on real temporary git repositories.
- Unrelated-file risk: medium; tests that expect a deleted number to be handed out again (search for nextSeq, `--seq` and renumber in
  .agents/test) change their expectation.
- Depends on: B01.

**B04. Publication above the upstream mark (user commands).**
- Goal: after a user command's rebase, every item the local commits added whose number is not above the upstream high-water mark is
  renumbered above it, with its references; a rebase conflict on numbers.json takes the larger value.
- Rulings and chapters: R12; chapter 05 section 3 (the user-command paragraph).
- Target files: src/shared/sync.js (remapLocal, repairConflicts); tests added to .agents/test/numbers.test.js.
- Layer and role: synchronisation layer; implementing agent.
- Proof: the standard proof; the scenarios "two clones create at once" and "another clone published and cleaned the same number before
  this push" through `backlog new`.
- Unrelated-file risk: medium; src/shared/sync.js is the most shared module (538 lines) and every concurrency test passes through it.
- Depends on: B03.

**B05. The item-file seam.**
- Goal: every read and write of an item file goes through one module (load, write, the event record), so that B06 changes one module.
  No behaviour changes: no test changes except imports.
- Rulings and chapters: preparation of R4; chapter 02 section 2.4.
- Target files: a new src/shared/item-file.js; callers that read item files directly today: src/shared/store.js, src/shared/new.js,
  src/shared/update.js, src/shared/archive.js, src/shared/move.js, src/shared/repair.js, src/shared/dependencies.js, src/shared/query.js,
  src/shared/seen.js, src/shared/sync.js, src/shared/index.js, src/team/handoff.js, src/team/pop.js.
- Layer and role: storage layer; implementing agent.
- Proof: the standard proof with no test expectation changed (the proof of a pure refactor).
- Unrelated-file risk: medium (thirteen modules, each with a one-line change of import or call).
- Depends on: B01.

**B06. Item files are JSON.**
- Goal: items are written and read as JSON files (the envelope, the fields, the body, the history, the fixed key order and text form);
  today's events become history entries; the built-in definition of items without a team (claimed_by and claimed_at kept, parent,
  `backlog done` writes closed); `backlog fields` prints that definition; a markdown item with a header stops every command except
  `backlog --help`, `backlog --version` and `backlog upgrade` with the migrate text. The markdown reader stays in the code for the migration
  only (B22).
- Rulings and chapters: R4, R7; chapter 02 sections 1 to 4 and 2.4, chapter 06 section 2 (the stop text), chapter 06 section 6 (the first
  row).
- Target files: src/shared/item-file.js, src/shared/fields.js, src/shared/store.js (the retired-key write stays until B28), the BDD
  steps features/steps/cli.js (it reads `.md` files today), the fixtures .agents/test/fixtures/shared/; tests that read or write item
  files directly (search for `.md`, front matter and parseItem in .agents/test).
- Layer and role: storage layer; implementing agent, reviewed by a second agent before commit (the largest batch).
- Proof: the standard proof; a new test .agents/test/item-json.test.js: the byte-exact text form (same item, same bytes), the unreadable
  item text, the markdown stop text, the history entry of a user write; the BDD of both locations unchanged in meaning.
- Unrelated-file risk: high; the old team code still reads the in-memory item and keeps working through the seam (the in-memory shape of an
  item stays: envelope and fields merged as today), but any test that writes a `.md` fixture by hand changes.
- Depends on: B05.

### Phase 2: evaluator and validation (pure modules, nothing wired)

**B07. The linear pattern matcher.**
- Goal: the `regex` test runs on a Thompson automaton with the subset, the size limits and the text cut of chapter 03 section 4.1.
- Rulings and chapters: chapter 03 section 4.1, chapter 01 section 6.
- Target files: a new src/team/rules/safe-regex.js (port of the spike's safe-regex.mjs); tests .agents/test/team-safe-regex.test.js.
- Layer and role: evaluator layer; implementing agent.
- Proof: the standard proof; case INL-05 (a pattern that makes a backtracking engine run for hours ends in milliseconds on 5000
  characters), the unsupported constructs of case VAL-20.
- Unrelated-file risk: none (new files).
- Depends on: nothing.

**B08. The evaluator.**
- Goal: the rule table walk with its precedence (first match decides, deny by default), conditions with exactly one key, values and the
  closed list of references, the functions, the effects (`set`, `add`, `remove`, `note`, `related`, `place`, `archive`, `delete`,
  `branch`, `team`, `say`) with the type and reference checks of the fields, the argument list of a step, and the step `new`.
- Rulings and chapters: R1, R2, R7, R8, R10; chapter 03 sections 1 to 8 and 12, chapter 02 section 3 (types), chapter 01 section 6.
- Target files: a new src/team/rules/evaluator.js (port of the spike's evaluator.mjs, without its validate part); the five example team
  files move to their shipped place templates/teams/ (scrum.json, extreme-programming.json, parallel.json, single-agent.json,
  patterns.json; chapter 01 section 1.2) and rule-cases.json to .agents/test/fixtures/team-rules/rule-cases.json, so that the tests do not
  read the plan folder; a new data-driven test .agents/test/team-rules-cases.test.js with an allow-list of the `run` kinds this batch
  supports (`new`, `update`).
- Layer and role: evaluator layer; implementing agent, reviewed by a second agent.
- Proof: the standard proof and `npm pack --dry-run` (templates/teams/ now ships); every case of rule-cases.json whose run kind is `new` or
  `update` passes (the cases of prefixes PAR, SCR, XP, SOL, PAT, COD, INL, R15, R24 of those kinds; the list is in `02-bdd-plan.md`).
- Unrelated-file risk: low; .agents/test/package.test.js may name the shipped folders and then changes.
- Depends on: B06 (the item shape), B07.

**B09. The pop table and the filters.**
- Goal: pop tries each candidate step in full without writing, in the order of the team's queue, an item tried once is not offered again;
  the named filters.
- Rulings and chapters: R2 (queue order as rules), R10; chapter 03 sections 9 and 10, chapter 04 section 4 (pop and plan logic, without
  the command).
- Target files: src/team/rules/evaluator.js; the run kinds `pop` and `filter` join the allow-list of the case test.
- Layer and role: evaluator layer; implementing agent.
- Proof: the standard proof; every `pop` and `filter` case of rule-cases.json passes (25 cases).
- Unrelated-file risk: none.
- Depends on: B08.

**B10. The checks of the team file.**
- Goal: every check of chapter 08 sections 3 to 6 and the schema of chapter 03 section 14, each finding with the path, the rule id, the
  problem and the fix.
- Rulings and chapters: R11, R18 (what the validation covers); chapter 08 sections 2 to 6, chapter 03 sections 3 (shadowing) and 14.
- Target files: a new src/team/rules/validate.js; the run kind `validate` joins the allow-list of the case test.
- Layer and role: validation layer; implementing agent.
- Proof: the standard proof; cases VAL-01 to VAL-21 and the five VAL-EX cases (the five shipped templates validate clean).
- Unrelated-file risk: none.
- Depends on: B08.

**B11. Validation on load.**
- Goal: the load procedure of chapter 01 section 4: the SHA in .backlog/config.json, the per-user record and validated copy, the 24-hour
  window, per-team validity, the read-only checkout, nothing written when no team is valid.
- Rulings and chapters: R18, R21, R22 (the SHA's place); chapter 01 section 4.
- Target files: a new src/team/teams-load.js (port of the spike's teams-load.mjs on B02 and B10); tests .agents/test/team-load.test.js.
- Layer and role: validation layer; implementing agent.
- Proof: the standard proof; the nine scenarios of the spike's teams-load.test.mjs on real temporary folders.
- Unrelated-file risk: low (reads the per-user configuration folder the CLI already uses).
- Depends on: B02, B10.

### Phase 3: team commands

**B12. The team router, the inputs and `backlog team validate`.**
- Goal: `backlog team` knows the six words of chapter 04 section 1 (new, update, pop, query, validate, migrate; today's define and
  workflow keep their routes until B27, and migrate answers "not yet available" until B22); every team command resolves its team (flag, then
  SMOOTH_BACKLOG_CLI_TEAM_NAME, then the `team` key), its agent (flag, then SMOOTH_BACKLOG_CLI_AGENT; never the configuration's user), its
  session, repository and branch; `--show-all` where it is accepted; the coded checks of chapter 04 section 5 that need no step; the first
  command on the engine, `backlog team validate` (read only apart from the SHA and the record), with item checks (chapter 08 sections 7, 8)
  on JSON items. Today's commands `new`, `update`, `pop` and `query` stay routed to the old code until B13, B14 and B16 replace them.
- Rulings and chapters: R3b, R11, R14, R15, R18, R21; chapter 01 section 5, chapter 04 sections 1 and 5, chapter 08 sections 1, 2, 7, 8.
- Target files: src/team/cli.js, a new src/team/inputs.js, a new src/team/validate-command.js, src/team/help.js, src/help.js; docs.
- Layer and role: team command layer; implementing agent.
- Proof: the standard proof; cases COD-01 to COD-04, COD-13, R14-01 to R14-09, R15-01, R15-02 (run kinds `resolve` and `inputs`); a new
  integration test .agents/test/team-validate.test.js: `backlog team validate --team web` on a temporary repository prints the findings,
  exits 2 on an error, writes the SHA once.
- Unrelated-file risk: medium; .agents/test/team-cli.test.js and .agents/test/router.test.js test the router today.
- Depends on: B11.

**B13. `backlog team new`.**
- Goal: the step `new` evaluated on the new item; the number from the counter only when the step is allowed; the item placed at the end
  of the team's queue unless a `place` effect says otherwise; written through the journal, committed and pushed.
- Rulings and chapters: R1, R2, R5, R12, the sentence "a new item for team X" of the rulings; chapter 04 section 2, chapter 05 section 6.
- Target files: src/team/new.js (rewritten), src/team/cli.js; the old tests of `backlog team new` in .agents/test/team-cli.test.js and the
  team test files that create items through it.
- Layer and role: team command layer; implementing agent.
- Proof: the standard proof; a new integration test .agents/test/team-commands.test.js replays every `new` case of rule-cases.json through
  the real command on a temporary backlog (exit code, refusal text, rule id, the created file).
- Unrelated-file risk: medium (old team tests that create items through `backlog team new` with today's flags change or go).
- Depends on: B12, B09.

**B14. The step commands.**
- Goal: `backlog team update <item> <step> --<arg> <value>`, `backlog team query check`, `backlog team pop` (with `--dry-run` and `--json`,
  exit 3 only when idle), `backlog team query plan`; the per-step flags of today, `--by` and `--lead` are gone; the refusals of a flag that
  differs from the variable are removed. Today's pop, which starts the CLI again for each step it takes, is replaced, so its test seam
  goes with it. The old modules become unreachable and stay until B27; the old command-level team tests that run today's flags are
  deleted here (their behaviour is now rules in the example files, proven by the cases).
- Rulings and chapters: R1, R2, R10, R15; chapter 04 sections 3, 4 and 5, chapter 07 section 6 (the pop contract kept for consumers).
- Target files: src/team/update.js and src/team/pop.js (rewritten), src/team/query.js, src/team/cli.js, src/team/help.js; docs; deleted
  test files listed in `02-bdd-plan.md` section 3.
- Layer and role: team command layer; implementing agent, reviewed by a second agent.
- Proof: the standard proof; .agents/test/team-commands.test.js replays every `update` and `pop` case through the real commands, and the
  `check` form of a refused case prints the same rule id; the BDD features team.feature, team-flow.feature and agents.feature are
  rewritten on the parallel example (`02-bdd-plan.md` section 2.5).
- Unrelated-file risk: high in deletions; nothing outside src/team/ changes behaviour.
- Depends on: B13.

**B15. Running again on the upstream files.**
- Goal: when the push of a team command is refused, a change only outside its folder is rebased as it is; a change of its folder drops the
  local commit and runs the whole command again on the upstream files, with the random growing wait and the clone lock's time budget; the
  stale-view guard does not run for team commands.
- Rulings and chapters: R1, R12, R24; chapter 04 sections 6 and 7, chapter 05 section 3 (team commands).
- Target files: src/shared/sync.js (a new entry for team commands), src/team/update.js, src/team/new.js, src/team/pop.js.
- Layer and role: synchronisation layer; implementing agent.
- Proof: the standard proof; the five two-clone scenarios of chapter 04 section 6 in a new .agents/test/team-concurrency.test.js.
- Unrelated-file risk: medium (src/shared/sync.js again; user commands must keep their stale-view behaviour, proven by
  .agents/test/shared-stale.test.js unchanged).
- Depends on: B14, B04.

**B16. The read-only query forms.**
- Goal: `backlog team query` (the team's open items in queue order, `--show-all` for every team), `backlog team query <item>`,
  `backlog team query filter <name>`, `backlog team query rules`, `backlog team query steps`, and the team's steps in
  `backlog team update --help` when a team is resolved.
- Rulings and chapters: R8, R14; chapter 04 sections 1 and 4, chapter 07 section 1.
- Target files: src/team/query.js, src/team/help.js; docs, with the "Team work" section of templates/skills/backlog/SKILL.md rewritten as
  chapter 07 section 5 says.
- Layer and role: team command layer; implementing agent.
- Proof: the standard proof; integration tests in .agents/test/team-commands.test.js for each form with `--json`.
- Unrelated-file risk: low.
- Depends on: B14.

### Phase 4: user-command changes

**B17. User reads ignore team items.**
- Goal: every read of a user command filters out team items first; a number that names a team item answers as a number no item holds; a
  reference to a team item reads as missing; `--show-all` on the reading commands of chapter 04 section 8 shows them with their team; the
  user queue is the index without team entries.
- Rulings and chapters: R3, R3a, R16; chapter 04 section 8, chapter 05 section 6.
- Target files: src/shared/read.js, src/shared/query.js, src/shared/index.js, src/shared/dependencies.js, src/shared/new.js
  (`--depends-on`, `--split-from`), src/help.js; docs.
- Layer and role: user command layer; implementing agent.
- Proof: the standard proof; cases COD-06, COD-07, R16-01 to R16-03; the existing tests .agents/test/plain-team-items.test.js and
  .agents/test/team-boundary.test.js are rewritten from "refuses a team item" to "does not see a team item".
- Unrelated-file risk: medium (every read path).
- Depends on: B13.

**B18. User writes on team items.**
- Goal: the writing user commands of chapter 04 section 8 act on a team item only with `--show-all`, each change writing a history entry
  with the note `--show-all on an item of team <t>`; `backlog update <item> --set <field>=<value>` only on a team item.
- Rulings and chapters: R19; chapter 04 section 8, chapter 02 section 2.3.
- Target files: src/shared/update.js, src/shared/done.js, src/shared/move.js, src/shared/archive.js, src/shared/import.js,
  src/shared/clean.js; docs.
- Layer and role: user command layer; implementing agent.
- Proof: the standard proof; cases R19-01, R19-02; one integration test per writing command with and without the flag.
- Unrelated-file risk: medium.
- Depends on: B17.

**B19. Queue ownership in a reordering.**
- Goal: a user reordering moves only user entries among the positions user entries hold; a team's `place` moves only that team's entries;
  `--show-all` with `--priority` moves among all entries of the branch.
- Rulings and chapters: R13; chapter 05 section 6.
- Target files: src/shared/index.js (the `within` permutation with "same owner" as scope), src/shared/sequence.js.
- Layer and role: index layer; implementing agent.
- Proof: the standard proof; the scenarios "a user priority change leaves team entries in place" and "a team's place effect leaves user
  entries in place".
- Unrelated-file risk: low.
- Depends on: B17.

**B20. The team-session guard.**
- Goal: with SMOOTH_BACKLOG_CLI_TEAM_NAME set, every user command stops before it reads anything with exactly
  `❌ backlog: teams are not allowed to use user commands` (exit 2); help and version are not blocked; the `team` key does not block.
- Rulings and chapters: R19a; chapter 04 section 8.
- Target files: src/shared/router.js, src/main.js (setup and upgrade are user commands too); docs.
- Layer and role: user command layer; implementing agent.
- Proof: the standard proof; cases R19A-01, R19A-02; a test that `backlog --help`, `backlog --version` and `backlog list --help` still run.
- Unrelated-file risk: low, but every existing test that sets the team variable and then runs a user command must unset it (search the
  test files for the team variable).
- Depends on: B17.

**B21. The own-folder scope.**
- Goal: `backlog move` moves only between branches of the own folder; the cycle walk through other repositories' items and the refusal of a
  publication whose foreign reference does not resolve are removed; staging names the folder's paths only; a conflict outside the folder
  stops with the text of chapter 04 section 9.
- Rulings and chapters: R24; chapter 04 section 9, chapter 05 section 1 (move).
- Target files: src/shared/move.js, src/shared/sync.js (foreignCycle, the foreign-resolve refusal, staging); docs.
- Layer and role: synchronisation layer; implementing agent.
- Proof: the standard proof; cases R24-01 and R24-02 through the real commands; .agents/test/shared-foreign-deps.test.js and the
  `--to-repository` tests of .agents/test/shared-move-archive.test.js are rewritten to the new scope.
- Unrelated-file risk: medium (src/shared/sync.js a third time; kept apart from B15 so that each is reviewable).
- Depends on: B06, B14.

### Phase 5: migration

**B22. The migration command.**
- Goal: `backlog team migrate` (with `--team <name>` or `--show-all`, and `--dry-run`) converts every markdown item of its own repository
  folder, open and archived, with the mapping of chapter 02 section 5; validates the whole team file first; stops with no action on every
  failure of chapter 06 section 5; seeds numbers.json from the folder's history; commits once and pushes; writes `migrated_at` and
  `migrated_by_version`; `backlog team validate` on a markdown backlog checks the file only.
- Rulings and chapters: R4, R5, R12, R14, R18, R24, R25; chapter 06 sections 1 to 3, 4.5, 4.7, 5 and 6, chapter 02 section 5, chapter 05
  section 4, chapter 08 section 1.
- Target files: a new src/team/migrate.js (it is the only caller of src/shared/frontmatter.js after this batch), src/team/cli.js; docs.
- Layer and role: migration layer; implementing agent, reviewed by a second agent.
- Proof: the standard proof; the migration scenarios of `02-bdd-plan.md` section 2.4 that this batch covers, in a new
  .agents/test/team-migrate.test.js, on fixtures built from the forms of today (the existing .agents/test/fixtures/shared/item-*.md files).
- Unrelated-file risk: low (new files).
- Depends on: B06, B10, B12, B03.

**B23. The migration's data cases.**
- Goal: items of a team without an entry are unbound with the timestamped record (archived ones too); teamless split items get their
  parent; a folder without an index keeps its priority order; the index carries the stored status.
- Rulings and chapters: R4 and the carried-forward rulings on unbinding and split items; chapter 06 sections 4.1 to 4.4 and 4.6.
- Target files: src/team/migrate.js.
- Layer and role: migration layer; implementing agent.
- Proof: the standard proof; the matching scenarios of `02-bdd-plan.md` section 2.4.
- Unrelated-file risk: none.
- Depends on: B22.

**B24. The field report and `--ask`.**
- Goal: the report of missing, invalid and undeclared fields of a team's items, and the one-field-at-a-time repair on a terminal.
- Rulings and chapters: R17; chapter 06 sections 2.1 and 2.2.
- Target files: src/team/migrate.js; a test child like .agents/test/new-ask-child.js for the terminal questions.
- Layer and role: migration layer; implementing agent.
- Proof: the standard proof; cases R17-01, R17-02; "--ask on a terminal repairs one field and records it".
- Unrelated-file risk: none.
- Depends on: B22.

### Phase 6: setup

**B25. Setup copies the team templates.**
- Goal: `backlog setup` copies templates/teams/ to .backlog/team-templates/ with the symbolic-link check, replaces the folder on every
  setup, prints the message of chapter 01 section 1.2; nothing reads a template.
- Rulings and chapters: R5, R23; chapter 01 section 1.2. Backlog item 150 (the team templates at setup) and 152.
- Target files: src/shared/setup.js; docs.
- Layer and role: setup layer; implementing agent.
- Proof: the standard proof and `npm pack --dry-run`; the spike's two setup tests ported to .agents/test/shared-setup.test.js.
- Unrelated-file risk: low.
- Depends on: B08 (the templates are in templates/teams/).

**B26. Setup recommends the migration.**
- Goal: the three advice lines of chapter 06 section 2.0 after every setup that defines a backlog folder; setup runs on a markdown
  backlog (it reads no item; chapter 06 section 2 omits it from the list of commands that run on a markdown backlog, which contradicts R25
  and is reported in `03-risks-and-open-items.md`).
- Rulings and chapters: R25; chapter 06 section 2.0.
- Target files: src/shared/setup.js; docs.
- Layer and role: setup layer; implementing agent.
- Proof: the standard proof; cases R25-01 to R25-04; setup on a markdown fixture prints the advice.
- Unrelated-file risk: none.
- Depends on: B22.

### Phase 7: removals

**B27. The old team code goes.**
- Goal: `backlog team define` and `backlog team workflow --file` removed; the readers of workflows.json, wip-limits.json, backlog.scope and
  of a team file at the root of the backlog repository removed; the shipped templates/workflows/team.json removed; every module of the
  old team code no longer reachable since B14 and B16 deleted with its unit tests.
- Rulings and chapters: R1, R5; chapter 01 section 1 (files no longer read), chapter 04 section 1 (removed commands).
- Target files: src/team/lifecycle.js, src/team/handoff.js, src/team/handoff-commands.js, src/team/handoff-close.js, src/team/queue.js,
  src/team/views.js, src/team/wip.js, src/team/workflow.js, src/team/team.js, src/shared/wip-limits.js, src/shared/team-items.js,
  src/shared/plain-step.js (team parts), templates/workflows/; the unit tests of those modules; docs.
- Layer and role: team command layer; implementing agent, reviewed by a second agent (a removal must remove nothing still called: a
  search of every import of each deleted module comes first).
- Proof: the standard proof and `npm pack --dry-run`; .agents/test/removed-forms.test.js gains the removed command lines.
- Unrelated-file risk: low in meaning, large in size.
- Depends on: B14, B16, B22.

**B28. The compatibility paths go.**
- Goal: every row of chapter 06 section 6: the translation of old status words, stage and review_state; the write that drops retired
  keys; the order built from priority outside the migration; the root configuration file of earlier builds stops every command with the
  move text; the coded hand-off edge.
- Rulings and chapters: R18; chapter 06 section 6.
- Target files: src/shared/status.js, src/shared/store.js, src/shared/index.js, src/shared/setup.js; tests
  .agents/test/shared-legacy-fields.test.js, .agents/test/storage-location.test.js, .agents/test/shared-origin-setting.test.js,
  .agents/test/shared-setup.test.js (the root configuration file).
- Layer and role: storage layer; implementing agent.
- Proof: the standard proof; scenarios "a repository with only the root configuration file stops with the move text" and "a session with
  only the unprefixed variables gets the three-ways text".
- Unrelated-file risk: medium (status words are read by user commands too).
- Depends on: B27, B22.

**B29. The final documentation pass.**
- Goal: every document of the AGENTS.md documentation rule describes only the new behaviour; the commands page COMMANDS.md regenerated;
  CHANGELOG.md has one entry for the engine; the plan folder and entry plan move to .agents/docs/plans/completed/; the pull request title
  and body are shown to the owner in chat first (entry plan Task 9).
- Rulings and chapters: all; the AGENTS.md rules on documentation and plans.
- Target files: README.md, COMMANDS.md, CHANGELOG.md, src/help.js, src/team/help.js, templates/skills/backlog/SKILL.md, the plan files.
- Layer and role: documentation; the lead.
- Proof: the standard proof; .agents/test/commands-documented.test.js, .agents/test/skill-commands.test.js and
  .agents/test/team-spelling-docs.test.js green.
- Unrelated-file risk: low.
- Depends on: every batch above.

## 4. Work outside this repository, in order

Context: the engine is useful only with the owner's team file and skills; these are built in the backlog repo and in the owner's own
repositories, never here (the information-security rule). They are listed so that the order is complete; their content is not described.

| order | what | where | backlog item | can start after | needed before |
|---|---|---|---|---|---|
| X1 | the owner's team template | the backlog repo | 148 | B10 (validate can check it, run from the engine checkout) | X2 |
| X2 | the owner's team entry, finalized, in the new shape, at the location chapter 01 section 1.1 resolves for each repository folder that has team items; it includes the dependency rule for items migrated without hand-off records (coverage row B3-19) | the backlog repo | 149 | X1, B16 | the cut-over |
| X3 | the lead and member skills read the rule set through the commands of chapter 07 section 1; the consumers of reference/consumers.tsv change | the owner's repositories | 151 | B16, B17 | the cut-over |
| cut-over | the engine reaches the installed CLI and every folder is migrated | `01-landing-strategy.md` | 152 | B29, X2, X3 | X4 |
| X4 | full-scope execution: the owner's rule set and the dummy teams on the installed CLI | the backlog repo and a scratch repository | 153 | the cut-over | X5 |
| X5 | gap review of the working branch's backlog and of the main backlog; the deferred rows below are filed or closed | the backlog repo | 154 | X4 | the pull request |

## 5. The rows of the coverage file deferred with an explicit blocker

Context: design/coverage.tsv gives every behaviour of today's code, every test, every consumer and every gap a terminal state; 49 of its
2021 rows are DEFERRED-WITH-EXPLICIT-BLOCKER (design/coverage-counts.tsv). None is unblocked by a batch of this plan alone; each needs an
owner answer or a later backlog item. What unblocks each:

| rows | blocker | unblocked by |
|---|---|---|
| INV-312, INV-316, INV-317, INV-380 (the backlog folder and the clone URL taken from environment variables) | owner question Q-12 (may environment variables redirect the backlog or the branch for every command) | B01 renames the two variables these rows read (SMOOTH_BACKLOG_CLI_HOME, SMOOTH_BACKLOG_CLI_ORIGIN_URL) without changing what they do; the question stays with the owner and item 154 files it |
| CON-01 to CON-04, CON-06, CON-07, CON-09 to CON-22 (20 consumer rows) | entry plan Task 6: the owner's rule set and skills change these consumers | X2 (item 149) and X3 (item 151); the CLI side they need is ready after B16 (query rules, steps, plan, filters) and B17 (user lists without team items); applied at the cut-over (`01-landing-strategy.md` step 4) |
| B3-19 (a closed producer with no hand-off record satisfied a dependency) | the owner's rule set writes it as a rule | X2 (item 149) |
| L12, L13, L33, L43, L52, L56, S06, S87, S88, S101 (user-command features outside the engine) | entry plan Task 8 files each as its own item | X5 (item 154) |
| L32, L53, L54, L57, L58, L59, S95 and Q-09 to Q-15 (14 rows) | owner questions Q-09 to Q-15 of reference/08-owner-questions.md, all about user commands | the owner's answers, filed by X5 (item 154); until Q-10 is answered the team commands of B12 to B16 print raw JSON (chapter 04 section 4) |
