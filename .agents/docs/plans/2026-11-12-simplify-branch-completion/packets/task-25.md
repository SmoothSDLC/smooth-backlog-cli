# Task 25 packet: The field report (B24a)

Head checked: `51c476d` of the working branch (no file of `src`, `bin` or `features` differs from `6d345ce`). This task starts after Tasks 23 and 24 are merged: `src/team/migrate.js`, its summary and `--json` object, and the documents the plan holds after unbinding exist then; re-grep them at the start.

## 1. Goal & Scope

Goal: after the conversion (or on a folder already in JSON) `backlog team migrate` lists, per item of the team (every team with `--show-all`), the missing, invalid and undeclared fields against the item definition, with the closing line, by the new `fieldReport(docs, entry)` of `src/team/migrate-report.js`; the report is the same on a dry run, in a run and in a later run, `--json` carries the same data, and the report never changes the exit code.

Out of scope: `--ask` and its prompts (Task 26; this task only creates the terminal-refusal text function that Task 26 imports, see section 4); unbinding (Task 24); changing any field (the report changes nothing); `itemFindings` of `src/team/rules/validate-items.js` (a different function, not replaced).

Use cases of this task: 7 rows at the start of the plan: `rule-cases` R17-01, `00-owner-rulings.md:R17`, `BDD-2.1-13`, `BDD-2.4-27`, `BDD-2.4-28`, `BDD-2.4-29`, `BDD-2.5-06`. List them with: `awk -F'\t' '$6=="Task 25"' .agents/docs/plans/2026-11-12-simplify-branch-completion/use-case-status.tsv`. The branch plan is `.agents/docs/plans/2026-11-12-simplify-branch-completion.md`; its Task 25 entry points to the task text in `.agents/docs/plans/completed/2026-11-11-team-rules-engine-remaining-work.md`. Three of the rows (`BDD-2.4-28`, `BDD-2.4-29`, `BDD-2.5-06`), half of `BDD-2.1-13` and the `--ask` half of `00-owner-rulings.md:R17` belong to Task 26, see section 6.

## 2. Architectural Decision Rules

**Owner rulings** (`.agents/docs/plans/2026-11-09-team-rules-engine/00-owner-rulings.md`)
- R17 (line 90): "`backlog team migrate` checks each item against the team's item definition and by default only REPORTS every missing or invalid field. It tells the user that the flag `--ask` gives interactive remediation, one field at a time, run by the CLI (on a terminal only, as `backlog new --ask` does today)."
- R1 (line 8): "The CLI code holds no team behaviour, no status word, no stage, no role." (the report translates nothing and invents no default.)
- Line 66: "Archived items are subject to no rule."
- R7 (line 32): "The item definition is data only: field names, types, descriptions, defaults, allowed values."

**Design chapter 06 section 2.1** (`.agents/docs/plans/2026-11-09-team-rules-engine/design/06-migration.md`, lines 90-106), quoted: "Context: converted items keep their fields as stored, so a team's items may lack fields its new definition declares, or hold values it does not allow. By default the migration only reports them; it changes no field. For each item of the team (every team with `--show-all`), one line per problem, in item order, then a closing line:"
```
item 1: field status: "pending" is not one of new, splitting, ready, in progress, checking, passed, closed
item 2: field estimate is missing (number)
item 2: field stage is not declared by the item definition
ℹ️  3 problems in 2 items of team parallel; backlog team migrate --team parallel --ask repairs them one field at a time on a terminal
```
"The checks are the type and allowed-value checks of chapter 02 section 3 for every declared field the item carries, \"missing\" for every declared field it lacks, and \"not declared\" for every field the definition does not name (case R17-01). Archived items are not checked (no rule applies to them). The report does not stop the migration and does not change the exit code."

**Design chapter 06 section 3 step 7** (line 146): "Print the field report (section 2.1); with `--ask`, run section 2.2."

**Specification** (b22-b29, B24a, decision blocks and audit), quoted
- B24a: "`fieldReport(items, team)` returns `[{ ref, missing: [...], invalid: [{ field, reason }], undeclared: [...] }]` by calling the step typing of B13a once per item, no new rule. Wired into `migrate.js` summary (about 25 lines) and `--json`."
- Tests: "missing, invalid and undeclared fields are listed per item", "an item with no findings is not listed", "the report is the same on a dry run", "the json report has the same data as the text".
- D-B24-1 = A: "reuse the step typing of B13a (`typed`), as the spike does". Audit 24a-1: "Name the new function `fieldReport` (as the text does) and say in one line that it is not `itemFindings` of validate-items.js, to stop a second validator by import."
- Audit 24a-2: "`fieldReport` calls the strict `fits` of validate-items.js (export it) for the type and `typed` only for the allowed values and persons; one finding per field" (a stored text `"30"` in a number field passes `typed`, which converts; `team validate` reports it with the strict `fits`).
- Audit 24a-3: "the input of `fieldReport` is the list of documents the plan holds (converted plus existing JSON read by `readDoc`), so that the report of a dry run, of a run and of a later run on the JSON folder is the same (test 'the report is the same on a dry run'); with `--show-all` each item is checked against its own team's entry; an item with no team, an unbound item and an archived item are not checked; the closing line `ℹ️  <n> problems in <k> items of team <t>; ...` is printed after the lines and is not one of the `findings` of the case".
- Audit 24a-4: "the kinds call `fieldReport` and the terminal check directly, as the spike does; the real command is proved by `team-migrate.test.js`; `RUN_COUNT` 228 to 230". `EXPECTED` "has no `findings` key and the assertions ... do not read it: add `findings` and compare as a list."
- Added decisions: "B24a uses readItems(folder, { tolerant: true }) of B13a for the field report" and "readItems(folder, { tolerant: true }) returns `bad` entries with kind 'unreadable', 'link' or 'number'; B24a's field report and B22b's failure list take all three." and "every finding and failure text names an item file as `<owner>/<name>/<path inside the folder>`, never an absolute path".

**Plan decisions of Task 25** (`.agents/docs/plans/completed/2026-11-11-team-rules-engine-remaining-work.md`): "the input is the documents the plan holds (converted plus existing JSON), so a dry run, a run and a later run report the same; with `--show-all` each item against its own team; items without a team, unbound and archived items are not checked; the closing line `ℹ️  <n> problems in <k> items of team <t>; ...` is not a finding. The harness kinds call `fieldReport` and the terminal check directly; the real command is proved in `team-migrate.test.js`." Interfaces: "Consumes `fits(type, v)` (exported here) for the types, `typed(entry, field, v, own)` of `src/team/rules/step.js` for allowed values and persons, `readItems(folder, { tolerant: true })` -> `{ items, bad }` (`bad` kinds `unreadable`, `link`, `number`). Produces `fieldReport(docs, entry) -> [{ ref, missing: [...], invalid: [{ field, reason }], undeclared: [...] }]` (not `itemFindings` of `validate-items.js`)."

**Rulings recorded during the work**: "every string value of a JSON answer is redacted before serializing, ids from the team file included (redact the value, never the serialized text)" (the `--json` report goes through `redactDeep` and `say(text, true)` of `src/team/json-out.js`). Global Constraints: "No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id."

## 3. BDD Acceptance Criteria

Rule case R17-01 (`design/rule-cases.json`), quoted: `{ "id": "R17-01", "rule_set": "parallel", "given": { "raw": true, "items": [ { "seq": 1, "fields": { "status": "pending", "estimate": 30, "holder": "", "checker": "", "parent": null, "children": [], "depends_on": [], "handoff": "", "rounds": 0 } }, { "seq": 2, "fields": { "status": "ready", "holder": "", "checker": "", "parent": null, "children": [], "depends_on": [], "handoff": "", "rounds": 0, "stage": "refined" } } ] }, "command": { "run": "migrate-check", "flags": { "team": "parallel" } }, "expect": { "exit": 0, "findings": [ "item 1: field status: \"pending\" is not one of new, splitting, ready, in progress, checking, passed, closed", "item 2: field estimate is missing (number)", "item 2: field stage is not declared by the item definition" ] } }`.

Scenario rows (`02-bdd-plan.md` section 2.4 and 2.1): "the field report lists a missing, an invalid and an undeclared field" (batch B24); section 2.1 R17: "R17 (the migration's field report) | 2 | migrate-check 1 (R17-01), migrate-ask 1 (R17-02) | B24 | team-rules-cases (R17-01), team-migrate (R17-02 on a terminal and without one) | unit, integration".

Unit-level Given/When/Then:
1. Given the R17-01 items and the `parallel` template entry, When `fieldReport(docs, entry)`, Then the report is `[{ ref: 'item 1', missing: [], invalid: [{ field: 'status', reason: '"pending" is not one of new, splitting, ready, in progress, checking, passed, closed' }], undeclared: [] }, { ref: 'item 2', missing: ['estimate'], invalid: [], undeclared: ['stage'] }]` and the printed lines are exactly the three `findings` above.
2. Given item 3 with no finding, Then it is absent from the report ("an item with no findings is not listed").
3. Given a number field holding the text `"30"`, Then it is invalid: `item 1: field estimate: "30" is not a number` (strict `fits`).
4. Given an archived item, an item with no team, and an item whose team has no entry, Then none is checked; given `--show-all` and two teams, each item is checked against its own team's entry and the closing line is printed once per team.
5. Given the real command on a markdown folder with those items, When `backlog team migrate --team parallel`, Then stdout ends with the three lines and `ℹ️  3 problems in 2 items of team parallel; backlog team migrate --team parallel --ask repairs them one field at a time on a terminal`, exit 0; the same on `--dry-run` (same lines); the same on a second run over the converted folder.
6. Given `--json`, Then stdout is one JSON object with the keys of Task 23 and Task 24 and `report`: the list of `{ team, ref, missing, invalid, undeclared }`, equal in data to the text.

## 4. Target Files & Existing Helpers

Create:
- `src/team/migrate-report.js`: `export function fieldReport(docs, entry, { repo } = {}) -> [{ ref, missing, invalid, undeclared }]` and `export const terminalRefusal = ({ team, terminal }) => string | null` (null on a terminal; otherwise `--ask needs a terminal (standard input and standard error); run backlog team migrate --team ${team} without --ask for the report`, the text of case R17-02; Task 26 imports it so the text lives once). `docs` are `{ seq, team, archived, fields }` (a converted document or an item read by `readItems`); `ref` is `item <seq>`. Per item the order is: invalid fields in the order of the item's fields, then missing in the definition's order, then undeclared in the item's order. Presence: a declared field is missing when its key is absent from `fields`; a present field whose value is `null` or `undefined` is not checked (as `itemFindings` skips `isNil`). A present value is invalid when `fits(def.type, value)` is false (reason `<JSON of the value> is not a <type>`) or when `typed(entry, field, value, repo)` throws a `Refusal` (reason: its message without the leading `field <name>: `). Missing lines are `item <seq>: field <name> is missing (<type>)`, undeclared `item <seq>: field <name> is not declared by the item definition`, invalid `item <seq>: field <name>: <reason>`.
- `.agents/test/team-migrate-report.test.js`.

Modify:
- `src/team/rules/validate-items.js:13`: `const fits` becomes `export const fits` (no other change; `itemFindings` at line 20 keeps using it).
- `src/team/migrate.js` (Task 23/24): after the plan and the dry-run summary or the run, collect the documents the plan holds (converted documents after unbinding, plus existing JSON items read with `readItems(folder, { tolerant: true })` from `src/team/item.js:39`, archived ones flagged by `path.startsWith('archive/')` and skipped), group by team, call `fieldReport` with the team's entry (`--team <t>`: only team `t`; `--show-all`: every team that has an entry), print the lines, then the closing line `ℹ️  <n> problems in <k> items of team <t>; backlog team migrate --team <t> --ask repairs them one field at a time on a terminal` when `n > 0`, add `report` to the `--json` object. A `bad` entry of `readItems` is a failure of the whole run listed with the others (Task 23's failure path).
- `.agents/test/team-rules-cases.test.js`: `RUN_KINDS` (line 15) gains `migrate-check` and `migrate-ask`; `EXPECTED` (line 16) gains `findings`; the runner calls `fieldReport` (kind `migrate-check`: items built by the existing `items(given, team, entry)`, `got = { exit: 0, findings }`) and `terminalRefusal` (kind `migrate-ask`: `got = { exit: 2, text }` when `terminal` is false) directly, and compares `findings` as a list (`assert.deepEqual`); `RUN_COUNT` (line 19) from 228 to 230.
- Docs: `src/team/help.js` (`'team migrate'`: the field report, its lines and closing line, that it changes nothing), `README.md`, `CHANGELOG.md`, `templates/skills/backlog/SKILL.md`, then `node .agents/scripts/sync-commands-md.mjs` (regenerates `COMMANDS.md` and `templates/skills/backlog/references/commands.md`).

Helpers to reuse: `typed(entry, field, v, own)` (`src/team/rules/step.js:35`, throws `Refusal` with `field <name>: <JSON> <why>`), `Refusal` (`src/team/rules/expression.js`), `readItems` (above), `readDoc` (`src/shared/item-json.js:38`), `redactDeep`, `say` (`src/team/json-out.js`). Interfaces. Consumes (from Tasks 23 and 24): the documents list of the plan, the entries of the loaded team file, the summary printer and `--json` object of `migrate.js`. Produces: `fieldReport`, `terminalRefusal` (Task 26 consumes both: it asks one question per problem of the same report, in the same order, and prints the refusal text through `terminalRefusal`), the `fits` export, `RUN_COUNT` 230.

## 5. TDD Execution & Verification

Step 0: grep every name of section 4 on the head (`grep -n "const fits" src/team/rules/validate-items.js`, `grep -n "RUN_KINDS\|EXPECTED\|RUN_COUNT" .agents/test/team-rules-cases.test.js`, `grep -n "export function typed" src/team/rules/step.js`, `grep -n "export function readItems" src/team/item.js`).

Step 1, failing tests (write all, see each FAIL), with the mutation each kills:
1. `team-rules-cases.test.js`: R17-01 through the harness (needs `findings` in `EXPECTED`, kind `migrate-check`); `RUN_COUNT` 230 with R17-02 (`migrate-ask`, exit 2 and the quoted text `--ask needs a terminal (standard input and standard error); run backlog team migrate --team parallel without --ask for the report`). Kills: a changed line text, a wrong order, a changed refusal text.
2. `team-migrate-report.test.js`: "missing, invalid and undeclared fields are listed per item" (case 1 above, the `{ ref, missing, invalid, undeclared }` shape). Kills: reporting only invalid.
3. "an item with no findings is not listed". Kills: listing every item.
4. "a value \"30\" in a number field is reported as invalid" (strict `fits`). Kills: using `typed` alone.
5. a test that checks: archived items, items without a team and items of a team with no entry are not checked. Kills: checking archived items.
6. a test that checks: with --show-all each item is checked against its own team. Kills: using one entry for all.
7. a test that checks: a null value is not checked and an absent declared field is missing. Kills: reporting a `null` value as invalid, or a missing key as present.
8. `team-migrate.test.js` (real commands): "the report is the same on a dry run" (case 5: lines equal across `--dry-run`, the run, the second run; exit 0 each); "the json report has the same data as the text" (case 6, with a credential-like string in a value redacted); a test that checks: the closing line counts problems and items per team; a test that checks: the report never changes the exit code and never writes a field (item bytes equal before and after for the report alone). Kills: a report computed from the markdown on one path and from JSON on another; a report that stops the run.
Steps 2-4: run to FAIL, implement, docs, standard proof. Commands that must pass (suite runs under the machine-wide suite lock):
```
npm run check                                                           # exit 0
SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<the private deny-list file> node --test .agents/test/no-private-details.test.js   # 3 pass, 0 fail
flock <the machine-wide suite lock file> node --test .agents/test/*.test.js        # fail 0
flock <the machine-wide suite lock file> env FEATURE_LOCATION=local  node --test .agents/test/features.test.js   # fail 0
flock <the machine-wide suite lock file> env FEATURE_LOCATION=remote node --test .agents/test/features.test.js   # fail 0
```
The scenario count is unchanged (this task adds no feature); state the measured number. Mutation proof for tests 1, 2, 4, 5, 8 in a scratch copy with a hard timeout.

Use-case table (same commit as the code): every row this task delivers (`rule-cases` R17-01 and `BDD-2.4-27`) moves to DONE with the test (file :: test name) that fails without the behaviour and the evidence column set to the word `this-commit`; a row it does not deliver stays PLANNED and is named in the report; a row a recorded decision replaced becomes SUPERSEDED with the decision cited. Then run `node .agents/docs/plans/2026-11-12-simplify-branch-completion/use-case-status.mjs counts`, commit the counts file, and `node --test .agents/test/use-case-status.test.js` must pass; update the State line of the task in the branch plan.

The tests described after the words "a test that checks" are proposed by this packet (they have no title in any source); each is pinned to the rule case R17-01 and the row `BDD-2.4-27` quoted in section 3 and to the design's section 2.1 rules quoted in section 2; they are not decision rules.

## 6. Must-not and Carry pointers

Must not (from the task text and the specification): invent a default for a missing field; write the team file; change any field of any item in the report; translate a word; replace or reuse `itemFindings`; check archived items; make the report change the exit code.

Use-case rows not delivered by this task text (the lead re-assigns them): `BDD-2.4-28` ("`--ask` on a terminal repairs one field and records it"), `BDD-2.4-29` ("`--ask` without a terminal is refused") and `BDD-2.5-06` ("a new features/migrate.feature | B24 | the owner previews with `--dry-run`, migrates, reads the field report; an older release refuses the migrated folder") are delivered by Task 26 (the prompts, the refusal on the real command, the feature); `BDD-2.1-13` (R17 with two cases, R17-01 and R17-02) is complete only when Task 26 has run R17-02 through the real command; this task runs R17-02 through the harness, so move `BDD-2.1-13` to DONE in Task 26. The row `00-owner-rulings.md:R17` names both the report and `--ask`: it stays PLANNED here and moves to DONE in Task 26. They stay PLANNED after this task. The clause "an older release refuses the migrated folder" of `BDD-2.5-06` contradicts the recorded decision "Nothing is built for older releases" (decisions.md, round 12 question 7); Task 26 should mark that clause SUPERSEDED with that decision.

Carry pointers: Task 26's packet consumes `terminalRefusal` and the report order; keep the closing line text byte-exact because the `--ask` prompt of Task 26 is described from the same report ("`--ask` ... takes the report's problems in order"). The closing line names `--ask` before Task 26 exists: the flag answers `unrecognized arguments: --ask` until then; this is the design's text and is kept (state it in the report). review record: "every string value of a JSON answer is redacted before serializing". Task 29's pointer: `src/team/migrate-convert.js` stays free of retired key names (`shared-no-classes.test.js`).
