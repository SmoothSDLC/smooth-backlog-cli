# Definition-driven CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice by slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the definition-driven CLI of the simplify branch: user commands with no rules, team commands on a JsonLogic rules engine, item definitions and redaction as data, and no workflow in the code.

**Architecture:** Every item is a flat JSON object checked with Ajv against the base item schema and the item definition that applies. Every change of an item is built as `prev` and `next`, redacted by the redaction rules, then (for team commands) evaluated by every rule of the team with json-logic-js; only the files the CLI changed are committed, and only its commits are pushed. The code holds no status word, role or workflow: those live in the packaged defaults and the team file.

**Tech Stack:** Node.js 24 ES modules; `node:test`; the BDD runner in `features/` (`.agents/test/features.test.js`, both storage locations); runtime libraries `ajv` 8, `ajv-formats` 3, `json-logic-js` 2, `re2` (decisions 62 and 75).

**Spec:** [behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](2026-11-14-definition-driven-cli/redaction-spec.md), [use-cases.md](2026-11-14-definition-driven-cli/use-cases.md), the schemas and data files of the folder [2026-11-14-definition-driven-cli/](2026-11-14-definition-driven-cli/), and [decisions.md](2026-11-14-definition-driven-cli/decisions.md). Every slice reads all of them before it starts; each slice names the sections it implements.

## Global Constraints

- Node `>=24` (`package.json` engines); ES modules only.
- Runtime libraries: `ajv@^8`, `ajv-formats@^3`, `json-logic-js@^2`, `re2` (current major). No hand-built replacement for what they do (decision 62).
- The schemas of the specification folder are copied unchanged into `schemas/` of the package (slice S01) and loaded from there; the packaged data files (`default-item-definition.json`, `default-team.json`, `default-redaction.json`, `teams.example.json`) go into `templates/`.
- The CLI repo is public: no host, machine, local path, port, model, private repository, agent or tool name in any tracked file or commit message; the private-details guard runs before every commit.
- Commits by the CLI hold only the files the CLI changed and only its commits are pushed (decision 77); `push-backlog-updates` false keeps them local (decision 76).
- No status word, role word, review, claim, holder, dependency, parent, limit or hand-off in `src/` (decisions 28, 32, 53 to 59; guard test of S19).
- User commands print text and take `--json`; team commands print JSON and take `--human` (decision 39). Every command that changes items takes `--whatif` (decision 2).
- Every use case of a slice runs as a scenario in `features/` in both storage locations.
- Commits as Cody (`cody@users.noreply.github.com`), no trailers; never a remote branch other than `simplify/pr3-review`; nothing of this work goes to the pr3 branch.

## Review Focus

1. **One local copy, two commands at once.** Two commands in the same local copy of the backlog at the same moment must not lose a change or hand out one number twice. The test goes in S05 (blocked by decision A of section 8 of the behaviour spec).
2. **Redaction before rules.** A value the caller types that a redaction rule changes must reach the team rules and the history redacted, never the raw value. The test goes in S06 and S13.
3. **Old items printed redacted.** An item written before a redaction rule existed must be printed redacted, with its file left unchanged. The test goes in S06.
4. **Priority and number.** `p0` names a priority, `0` and `012` name numbers; `p`, `p-1` and `px` are refused with exit 2. The test goes in S08.
5. **Stable JSON of team commands.** Agents parse it, so a refusal is always `{"refused": [{"rule", "error"}]}` and a success always carries the item. The test goes in S13.

## How each slice is run (sub-agent development)

Each slice is one job that can be given to Cody on its own, after the slices it depends on are merged.

1. **Implementer** (one sub-agent, superpowers and ponytail skills, `/goal`): reads the specification files above and this slice; writes the slice's scenarios first (BDD), runs them and sees them fail; writes the unit tests named in the slice (TDD), runs them and sees them fail; implements the interfaces of the slice; runs the slice's tests, then `npm test`, `npm run check` and the private-details guard; runs its own code review and ponytail review and fixes what they find; commits on its own branch.
2. **Spec reviewer** (a fresh sub-agent): checks every use case and interface of the slice against the specification; fails the slice on a gap.
3. **Quality reviewer** (a fresh sub-agent): code review and ponytail review of the diff.
4. **Lead**: runs the full proof (suite, check, guard, scenarios in both locations), merges into `simplify/pr3-review`, runs a ponytail review after the merge, and updates the hand-off of backlog item 152.

The standard steps of a slice are therefore:

- [ ] Write the slice's scenarios in the named feature file.
- [ ] Run `node --test .agents/test/features.test.js`; expected: the new scenarios fail.
- [ ] Write the unit tests named in the slice.
- [ ] Run them; expected: they fail.
- [ ] Implement the interfaces of the slice.
- [ ] Run the slice's tests; expected: pass. Run `npm test` and `npm run check` and the private guard; expected: pass.
- [ ] Self review (code review, ponytail review), fix, rerun.
- [ ] Commit.

## Order and dependencies

| Slice | Name | Depends on | Blocked by an open decision |
|---|---|---|---|
| S01 | Libraries and schema loading | none | |
| S02 | The flat base item | S01 | |
| S03 | The item definition that applies | S01, S02 | |
| S04 | Configuration and inputs | S01 | |
| S05 | Commit and push only the CLI's own work | S04 | A |
| S06 | Redaction | S01, S04 | |
| S07 | `backlog new` | S02, S03, S06 | |
| S08 | `backlog update` | S02, S03, S06 | |
| S09 | `backlog list` and `show` | S02, S06 | |
| S10 | `backlog archive` and `archive done` | S02, S04 | |
| S11 | `backlog import`, `branch`, `branch import` | S02 | |
| S12 | The rules engine | S01 | |
| S13 | Team commands that change items | S07, S08, S10, S11, S12 | |
| S14 | Team commands that read items, and pop | S12, S13 | |
| S15 | `backlog validate` and `backlog team validate` | S03, S06, S12 | D |
| S16 | `backlog setup` | S02, S04, S06 | |
| S17 | `backlog upgrade` of the backlog | S02, S03 | C, D |
| S18 | Help, `--whatif`, removed commands | S07 to S14 | B |
| S19 | The coded workflow leaves the code | S13, S14, S17, S18 | |
| S20 | Example teams, defaults and the examples guide | S12, S15 | |
| S21 | The owner's team file in the topology repository | S20 | |
| S22 | Documentation | S18, S20 | |
| S23 | Old scenarios and tests | S19 | |
| S24 | Proof and branch-wide review | all | |

Slices with no dependency between them (for example S04, S06 and S12 after S01) may run one after another in any order; one slice runs at a time.

---

### S01: Libraries and schema loading

**Spec:** behaviour-spec 3; decision 62. **Use cases:** none of their own (every later slice uses it).

**Files:**
- Modify: `package.json` (dependencies).
- Create: `schemas/` (copies of `item.schema.json`, `item-definition.schema.json`, `index.schema.json`, `team-file.schema.json`, `team-rules.schema.json`, `config.schema.json`, `redaction.schema.json`).
- Create: `src/shared/schemas.js`.
- Test: `.agents/test/schemas.test.js`.

**Interfaces:**
- Produces: `validate(name: 'item'|'item-definition'|'index'|'team-file'|'team-rules'|'config'|'redaction', data: unknown): Problem[]`, where `Problem = {path: string, message: string}`; `checkSchema(schema: object): Problem[]` (the schema against JSON Schema draft 2020-12).

**Tests:**
- `every shipped schema is valid draft 2020-12`: `checkSchema` of each file returns `[]`.
- `item.example.json fits item`: `validate('item', example)` returns `[]`; with `title` removed it returns one problem whose path is `/title` or names `title`.
- `schemas/ equals the specification folder`: byte-equal copies (a test reads both).

### S02: The flat base item

**Spec:** behaviour-spec 3.1, 3.5, 4.4; decisions 34, 45, 48. **Use cases:** G-ITEM-1, U-LIST-4. **Feature file:** `features/items.feature` (rewritten).

**Files:**
- Modify: `src/shared/item-json.js`, `src/shared/item-file.js`, `src/shared/index.js`, `src/shared/store.js`.
- Test: `.agents/test/item-json.test.js`.

**Interfaces:**
- Consumes: `validate` (S01).
- Produces: `readItem(text: string): Item` and `writeItem(item: Item): string`, where `Item` is the flat object of `item.schema.json`; `historyEntry({at, by, session, command, changes, note}): object`. The index entry is `{seq, slug, title, status}`.

**Tests:**
- `an item file has no fields object`: `writeItem` of an item with `estimate: 3` writes `"estimate": 3` at top level.
- `cli_version and history are required`: `readItem` of a file without them throws with the property named.
- `history entries carry command`: an entry has `command`, never `step`.
- `index entries carry title`: never `name`.

### S03: The item definition that applies

**Spec:** behaviour-spec 3.2, 3.7, 4.3; decisions 18, 20, 64, 65. **Use cases:** U-NEW-2, U-NEW-3. **Feature file:** `features/definitions.feature`.

**Files:**
- Replace: `src/shared/item-definition.js` (the fixed field list goes).
- Create: `templates/default-item-definition.json` (copy of the specification file).
- Test: `.agents/test/item-definition.test.js`.

**Interfaces:**
- Consumes: `validate` (S01), `readItem` (S02).
- Produces: `definitionFor(item: {team?: string}, ctx: {config: object, teams: object|null, root: string}): Definition`; `defaultsOf(def: Definition): object`; `checkValue(def: Definition, property: string, value: string): {ok: true, value: unknown} | {ok: false, reason: string}` (type only, decision 65); `finalValues(def: Definition): string[]`.

**Tests:**
- `the packaged definition when nothing is configured`: status default `new`.
- `item_definition of the configuration`: a definition with status default `todo` and `estimate` gives both.
- `a team's item uses the team's definition`.
- `checkValue('estimate', 'soon')` on a number field: `ok: false`, reason names `number`.
- `checkValue('status', 'waiting')` on a field with values `[new, active, closed]`: `ok: true` (user commands do not enforce values).

### S04: Configuration and inputs

**Spec:** behaviour-spec 3.4, 4.1, 4.7; decisions 31, 44, 66, 70, 76; ruling R15, R19a, R20. **Use cases:** T-IN-1 to T-IN-5, U-NEW-9, U-SYNC-4. **Feature file:** `features/configuration.feature`.

**Files:**
- Modify: `src/shared/store.js`, `src/shared/setup.js`, `src/team/inputs.js`.
- Create: `src/shared/config.js`.
- Test: `.agents/test/config.test.js`.

**Interfaces:**
- Consumes: `validate` (S01).
- Produces: `readConfig(root: string): Config` (validated against `config.schema.json`; an invalid file throws exit 2 with the problem); `inputs(flags: object, env: object, config: Config): {repository, branch, team, agent, session}`, reading each variable by the name the configuration's `*_variable` key gives, in the order flag, variable, configuration (ruling R15); `refuseTeamVariable(env, config): void` (throws "teams are not allowed to use user commands" when the configured team variable is set); `requireGitLocation(root: string): void` (exit 4 naming `backlog setup` when the backlog location is not a git repository).

**Tests:**
- `team_variable names the variable`: with `team_variable` `SMOOTH_BACKLOG_CLI_WEB_TEAM`, that variable is read and `SMOOTH_BACKLOG_CLI_TEAM_NAME` is not.
- `two repositories, two variables`: two configurations naming different variables, both set, give each its own team.
- `no team anywhere`: exit 2 naming flag, variable and key.
- `push-backlog-updates defaults to true`.

### S05: Commit and push only the CLI's own work

**Spec:** behaviour-spec 4.1, 4.10, 4.13; decisions 44, 76, 77. **Use cases:** U-SYNC-1, U-SYNC-2, U-SYNC-5 to U-SYNC-7; Review Focus 1. **Feature file:** `features/storage.feature`.

**Blocked by decision A** (turn-taking in one local copy): the lock and its wait are kept or removed by that decision.

**Files:**
- Modify: `src/shared/sync.js`, `src/shared/team-publish.js`, `src/shared/store.js`.
- Test: `.agents/test/publish.test.js`.

**Interfaces:**
- Consumes: `readConfig` (S04).
- Produces: `publish(change: {root: string, paths: string[], message: string}, config: Config): {commit: string, pushed: boolean}`: stages exactly `paths`, commits, and pushes only that commit (`git push origin <commit>:refs/heads/<branch>`, as team commands do today, round 12 question 2) unless `push-backlog-updates` is false.

**Tests:**
- `another changed file stays uncommitted` (U-SYNC-5).
- `a person's unpushed commit stays local` (U-SYNC-6).
- `push-backlog-updates false commits without pushing` (U-SYNC-7).
- `two commands in one copy` (Review Focus 1): written per decision A.

### S06: Redaction

**Spec:** redaction-spec (all); behaviour-spec 4.9; decisions 46, 75, 78. **Use cases:** U-RED-1 to U-RED-4; Review Focus 2 and 3. **Feature file:** `features/redaction.feature`.

**Files:**
- Create: `src/shared/redaction.js`, `templates/default-redaction.json` (copy of the specification file).
- Modify: `src/shared/safety.js` (its URL credential redaction becomes the rule `url-credentials`), every output path (one function prints all output).
- Test: `.agents/test/redaction.test.js`.

**Interfaces:**
- Consumes: `validate` (S01), `readConfig` (S04), `re2`.
- Produces: `rulesInForce(config: Config): RedactionRule[]` (packaged then repository rules; `always` ones always, `when-enabled` ones when `redact_pii`); `redactItem(item: Item, rules: RedactionRule[]): {item: Item, redacted: string[]}`; `redactText(text: string, rules: RedactionRule[]): string`.

**Tests:**
- `example configuration` (U-RED-1): title becomes `Ping [internal host]`, description `Customer CUST-****** wrote to [redacted e-mail]`, `redacted` is `['title', 'description']`.
- `always rules run with redact_pii false` (U-RED-2): a `ghp_` token is replaced, an e-mail is not.
- `properties limits a rule`: the customer rule does not touch the title.
- `output of an old item` (U-RED-4).

### S07: `backlog new`

**Spec:** behaviour-spec 4.2, 4.3, 5.1; decisions 3, 6, 9, 10, 42. **Use cases:** U-NEW-1 to U-NEW-10. **Feature file:** `features/items.feature`.

**Files:** Modify `src/shared/new.js`. Test: `.agents/test/new.test.js`.

**Interfaces:**
- Consumes: `definitionFor`, `defaultsOf` (S03); `redactItem` (S06); `publish` (S05 when merged, else the current publication); `readItem`/`writeItem` (S02).
- Produces: `newItem({title, description, file?, whatif, ask}, ctx): {item: Item, priority: string}`; the item is last in its branch's index.

**Tests:** the use cases U-NEW-1 to U-NEW-10 as scenarios; unit test `a field flag is refused naming backlog update`.

### S08: `backlog update`

**Spec:** behaviour-spec 4.2, 4.3, 4.14, 5.1; decisions 11 to 14, 29, 43, 65, 69, 72. **Use cases:** U-UPD-1 to U-UPD-13, Review Focus 4. **Feature file:** `features/items.feature`.

**Files:** Modify `src/shared/update.js`, `src/shared/safety.js` (`itemSelector`). Remove `src/shared/plain-step.js`. Test: `.agents/test/update.test.js`.

**Interfaces:**
- Consumes: S02, S03, S06.
- Produces: `selectItem(text: string): {seq: number} | {slug: string} | {priority: number}` (`p0` a priority; digits a number; anything else a slug; `p`, `p-1`, `px` refused with exit 2); `updateItem(selector, property: string, value: string | null, {whatif, showAll}, ctx): {item: Item, changed: string[]}`; `restore` and `seq` as properties per decision 72.

**Tests:** U-UPD-1 to U-UPD-13 as scenarios; unit tests `selectItem` for `p0`, `0`, `012`, `p`, `p-1`, `px`; `priority p0 writes only index.json`.

### S09: `backlog list` and `backlog show`

**Spec:** behaviour-spec 4.2, 4.14, 5.1. **Use cases:** U-LIST-1 to U-LIST-6, U-SHOW-1 to U-SHOW-3. **Feature file:** `features/read-commands.feature` (rewritten).

**Files:** Modify `src/shared/read.js`, `src/shared/query.js`. Test: `.agents/test/read.test.js`.

**Interfaces:** Consumes S02, S06 (`redactText` for output). Produces `listLines(items, index): string[]` (`p0 [012] 012-fix-login active`).

**Tests:** the use cases as scenarios; unit test of one printed line.

### S10: `backlog archive` and `archive done`

**Spec:** behaviour-spec 4.13, 4.14, 5.1; decisions 22, 71. **Use cases:** U-ARCH-1 to U-ARCH-5. **Feature file:** `features/archive.feature`.

**Files:** Modify `src/shared/archive.js`. Test: `.agents/test/archive.test.js`.

**Interfaces:** Consumes S02, S03 (`finalValues`), S04 (`archive_folder`). Produces `archiveItem(selector, {whatif, showAll}, ctx)` and `archiveDone({whatif}, ctx): string[]`.

### S11: `backlog import`, `branch`, `branch import`

**Spec:** behaviour-spec 4.14, 5.1; decisions 41, 74. **Use cases:** U-IMP-1, U-BR-1, U-BR-2. **Feature file:** `features/branches.feature`.

**Files:** Modify `src/shared/move.js`. Test: `.agents/test/branches.test.js`.

**Interfaces:** Produces `importBranch(source: string, {higher, whatif}, ctx): number[]` (used by both commands) and `branchesWithItems(ctx): string[]`.

### S12: The rules engine

**Spec:** team-rules-spec (all); decisions 53 to 61, 75. **Use cases:** T-RULE-1 to T-RULE-11. **Feature file:** none (unit level; the commands of S13 and S14 carry the scenarios).

**Files:**
- Create: `src/team/engine.js`, `src/team/engine-validate.js`.
- Remove: `src/team/rules/expression.js`, `step.js`, `pop.js`, `safe-regex.js`, `validate-rules.js` (their tests move to the archive with them in S23).
- Test: `.agents/test/engine.test.js`, `.agents/test/engine-validate.test.js`, `.agents/test/teams-example.test.js`.

**Interfaces:**
- Consumes: `json-logic-js`, `re2`, `validate` (S01).
- Produces: `evaluateChange(change: {prev: Item|null, next: Item, command: 'new'|'update'|'archive'|'move', caller: string, session: string}, team: {name, people, items: Item[], rules: RuleSet, lookup: (n: number) => Item|null}, now: string): {ok: true} | {ok: false, refused: {rule: string, error: string}[]}`, with the extra operators `changed`, `item`, `roles_of`, `regex`, `age`, `outer` registered for the call; `queueOffer(team, caller): {entry: number, item: Item, take?: object} | null`; `filterItems(team, name): Item[]`; `validateRuleSet(team): Finding[]` (the checks of team-rules-spec section 11).

**Tests:**
- `teams-example`: for each team of `teams.example.json`, the allowed and refused changes the examples guide states (at least the five of the advanced team: a member taking a ready item passes; the wrong holder fails `holder-is-caller`; active to closed fails `flow` and `checker-closes`; estimate 90 fails `size`; an open dependency fails `dependencies`).
- `every rule is evaluated`: a change failing two rules returns both.
- `error texts put values in`: `{next.estimate}` becomes the number.
- `validateRuleSet` finds each case of T-RULE-9.

### S13: Team commands that change items

**Spec:** behaviour-spec 4.6, 4.8, 5.2; team-rules-spec 2, 3, 10; decisions 38, 39, 54, 67. **Use cases:** T-OUT-1, T-NEW-1, T-NEW-2, T-UPD-1 to T-UPD-5, T-ARCH-1, T-IMP-1; Review Focus 2 and 5. **Feature file:** `features/team.feature` (rewritten).

**Files:** Modify `src/team/cli.js`, `src/team/new.js`, `src/team/update.js`; create `src/team/change.js`. Test: `.agents/test/team-change.test.js`.

**Interfaces:**
- Consumes: `evaluateChange` (S12); `newItem` (S07), `updateItem` (S08), `archiveItem` (S10), `importBranch` (S11) for the change itself; `redactItem` (S06) before evaluation.
- Produces: `teamChange(command, args, ctx): {item: Item} | {refused: {rule, error}[]}`; printed as JSON, or text with `--human`.

**Tests:** the use cases as scenarios; `a redacted value reaches the rules redacted` (Review Focus 2); `refusal JSON shape` (Review Focus 5).

### S14: Team commands that read items, and pop

**Spec:** behaviour-spec 5.2; team-rules-spec 9. **Use cases:** T-LIST-1, T-SHOW-1, T-POP-1 to T-POP-3, T-QRY-1. **Feature file:** `features/team.feature`.

**Files:** Modify `src/team/pop.js`, `src/team/query.js`; create `src/team/list.js` (or extend). Test: `.agents/test/team-read.test.js`.

**Interfaces:** Consumes `queueOffer`, `filterItems` (S12), `teamChange` (S13 for `take`). Produces the commands of the table of behaviour-spec 5.2 for `list`, `show`, `pop`, `query plan`, `query rules`.

### S15: `backlog validate` and `backlog team validate`

**Spec:** behaviour-spec 4.5; team-rules-spec 11; redaction-spec 5; decision 49. **Use cases:** U-VAL-1 to U-VAL-5, U-RED-5, T-VAL-1, T-VAL-2. **Feature file:** `features/validate.feature`.

**Blocked by decision D** (what validate says of a value in an undeclared field).

**Files:** Create `src/shared/validate.js`; modify `src/team/validate-command.js`. Test: `.agents/test/validate.test.js`.

**Interfaces:** Consumes `checkSchema`, `validate` (S01), `definitionFor` (S03), `validateRuleSet` (S12), `rulesInForce` (S06). Produces `validateAll(ctx): Finding[]` where `Finding = {file, where, reason, fix, severity: 'error'|'warning'}`.

### S16: `backlog setup`

**Spec:** behaviour-spec 4.11; decisions 37, 48, 76. **Use cases:** U-SETUP-1 to U-SETUP-7. **Feature file:** `features/setup.feature`.

**Files:** Modify `src/shared/setup.js`, `src/integrations.js`. Test: `.agents/test/setup.test.js`.

**Interfaces:** Produces `setup({ask, whatif}, ctx)`: writes the configuration with every key of `config.schema.json` that has a default (the five variable keys, `archive_folder`, `push-backlog-updates` true, `redact_pii` false); installs the skill into each of `.agents`, `.claude`, `.github`, `.qwen` that exists; copies `teams.example.json` and the packaged defaults into `.backlog`; stops with exit 2 naming `backlog upgrade` when an item has an older `cli_version`.

### S17: `backlog upgrade` of the backlog

**Spec:** behaviour-spec 4.12; decision 48. **Use cases:** U-UPG-1, U-UPG-2, T-MIG-1, T-MIG-2. **Feature file:** `features/upgrade.feature`.

**Blocked by decisions C and D** (whether `backlog team migrate` joins it; what happens to undeclared values).

**Files:** Modify `src/upgrade.js`, `src/team/migrate*.js`. Test: `.agents/test/upgrade.test.js`.

### S18: Help, `--whatif`, removed commands

**Spec:** behaviour-spec 5; decisions 1, 2, 41. **Use cases:** U-HELP-1, U-HELP-2. **Feature file:** `features/commands.feature` (rewritten).

**Blocked by decision B** (the run recorder: its help paragraph and variable stay or go).

**Files:** Modify `src/main.js`, `src/help.js`, `src/team/help.js`, `src/team/cli.js`, `src/shared/help-parts.js`. Test: `.agents/test/help.test.js`: `every command of behaviour-spec 5.1 and 5.2 has a help`, `each removed command exits 2`, `--dry-run exits 2`.

### S19: The coded workflow leaves the code

**Spec:** behaviour-spec 1; decisions 28, 32, 53 to 59. **Use cases:** G-CODE-1, G-CODE-2.

**Files:** Remove `src/team/lifecycle.js`, `queue.js`, `team.js`, `workflow.js`, `wip.js`, `views.js`, `handoff.js`, `handoff-commands.js`, `src/shared/dependencies.js`, `wip-limits.js`, the status words of `src/shared/status.js`, `SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS`, `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD`; move `templates/workflows/team.json` to `.backlog/archived/`. Test: `.agents/test/no-workflow-in-code.test.js` (reads `src/` and fails on any status word, role word, review, claim, holder, dependency, parent, limit or hand-off identifier; and on any fixed variable name except those that find the backlog).

### S20: Example teams, defaults and the examples guide

**Spec:** behaviour-spec 3.6, 3.7; team-rules-spec 7; decisions 21, 35, 68. **Use cases:** T-VAL-2, T-RULE-11.

**Files:** Create `templates/teams.example.json`, `templates/default-team.json` (copies of the specification files), `docs/team-rules-guide.md` (each team's way of working in words, then each rule with the change it allows and the change it refuses). Move `templates/teams/*.json` to `.backlog/archived/`. Replace the third team of `teams.example.json` with the simplified, generic version of the owner's team file of S21 once S21 is done.

### S21: The owner's team file in the topology repository

**Spec:** behaviour-spec 6; decision 36. **Use cases:** G-TOPO-1. Done in the topology repository (private), never in the CLI repo: the actual rules and item definition of the Cody team, validated with `backlog validate`.

### S22: Documentation

**Spec:** behaviour-spec 5; decision 21. **Use cases:** G-DOC-1.

**Files:** Rewrite `README.md`, `COMMANDS.md`, `CHANGELOG.md`, `AGENTS.md`, `templates/skills/backlog/` from the new help; the help points to `docs/`. Test: `.agents/test/docs.test.js` compares the documents with the help.

### S23: Old scenarios and tests

**Spec:** the file audit of the plan. Every feature file and test that tests a removed behaviour moves to `.backlog/archived/` with a commit message naming the decision that removed it; every other one is rewritten by the slice that owns its command.

### S24: Proof and branch-wide review

Full suite with no failure and no skip, `npm run check`, the private guard, the scenarios in both locations; a branch-wide code review and a ponytail review; a gap analysis against use-cases.md (every use case has a passing scenario) and a gap-fix plan for what it finds.
