# Team rules engine, remaining work: Implementation Plan

**Goal:** finish the team rules engine on the working branch: fix the merged publication and numbering code, put `pop`, `query check`, `query plan` and every `query` form on the engine, remove the old team commands and their tests, publish team commands safely under concurrency, make the user commands ignore team items unless `--show-all`, migrate markdown items with `backlog team migrate`, delete the old team code and the retired translations, and close the plan with one documentation pass.

**Architecture:** every team command is `resolveInputs`, the session, the clone lock, `pullFolder`, then one `attempt()` (`loadTeams` with the SHA deferred, `contextOf`, the pure evaluator in `src/team/rules/`, `apply`) handed to `publishTeam`, which commits and publishes only the command's own commit and runs `attempt()` again when upstream changed what it read. User commands read through `store.load` and the index; after Task 10 they see team items only with `--show-all`. The migration reads markdown with the reader of `src/shared/item-file.js`, converts with `convertItem`/`planFolder` (merged) and publishes through `publishTeam`.

**Tech Stack:** Node.js 24 (ES modules, `node:test`, no runtime dependencies), git (2.40 or later: `merge-tree --write-tree`), the BDD runner in `features/` (`.agents/test/features.test.js`, locations `local` and `remote`).

**Spec:** [2026-11-09-team-rules-engine/design/](2026-11-09-team-rules-engine/design/) (chapters 01 to 08) and [design/rule-cases.json](2026-11-09-team-rules-engine/design/rule-cases.json), with [00-owner-rulings.md](2026-11-09-team-rules-engine/00-owner-rulings.md). The batch texts are in [implementation/00-priority-order.md](2026-11-09-team-rules-engine/implementation/00-priority-order.md) section 3; the scenarios in [implementation/02-bdd-plan.md](2026-11-09-team-rules-engine/implementation/02-bdd-plan.md); the coverage checklist is [design/coverage.tsv](2026-11-09-team-rules-engine/design/coverage.tsv). This plan continues [2026-11-09-team-rules-engine.md](2026-11-09-team-rules-engine.md) (batches B01 to B12, B13a to B13d, B14a, B15a, B15b, B15s, B22a, B22b, B25 and B26 are done) and states the decisions taken since then as plain statements inside each task.

## Global Constraints

- Node 24: `engines.node` is `>=24`; every command of this plan runs under Node 24 (`node --version` prints `v24.`).
- Environment variables are prefixed `SMOOTH_BACKLOG_CLI_` (`_TEAM_NAME`, `_AGENT`, `_SESSION`, `_TEAM_REPOSITORY`, `_TEAM_BRANCH`, `_HOME`, `_LOCK_WAIT_MS`, `_PRIVATE_DENYLIST`); no unprefixed name is read, and no file outside `src/team/` names a team variable (`.agents/test/team-boundary.test.js`).
- Public repository: no tracked file and no commit message names a host or machine, a local path, a port or address, a model, a private repository, an internal agent or tool, a private process or a credential. The private-details guard runs before every commit. The pull request text is written outside the repository.
- Every commit leaves the whole suite green: the standard proof below passes at each task's own commit. Importers and guard tests that a task breaks are repaired in that task, never in a later one.
- No test is deleted, skipped or weakened except where its task names it. A test whose expectation changes is named in the commit body with the reason.
- Coverage rule: every test a task removes is classified against `design/coverage.tsv` in that task. The commit body lists one line per removed test: `<file>: <test title> -> <coverage id> <BAKE-IN | LAZY-LOAD | SKIP | DEFERRED-WITH-EXPLICIT-BLOCKER> (<surviving test that covers it, or the reason>)`. A removed test that matches no row is not removed until a row or a surviving test covers it. A removed test whose subject is a user command is rewritten onto the user commands (items written with `writeStored` of `.agents/test/shared-fixtures.js`), not removed.
- Documentation rule of `AGENTS.md`: every change of a command, option, output, refusal, rule or stored field ships in the same commit with `templates/skills/backlog/SKILL.md` (and `references/commands.md`), the help text (`src/help.js`, `src/team/help.js`), `COMMANDS.md` regenerated with `node .agents/scripts/sync-commands-md.mjs`, `README.md` where it describes the behaviour, and `CHANGELOG.md` (section `## Unreleased (2.0.0)`). None of them describes the old behaviour.
- No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id.
- Scratch runs of the CLI outside the test suite set `SMOOTH_BACKLOG_CLI_HOME` to a temporary folder and run in a scratch git repository with no remote of the person's.
- The CLI never writes the team file; a user command never reads it; a number is never handed out twice; a refused team command writes nothing in either repository (the provisional exception of open decision 2 below).
- Every task starts by re-reading every file:line it names with `grep` on the current head; a name that moved is followed, a behaviour that differs from the task's text stops the task.

## Questions re-validated at the end (kept provisional; nothing in this plan decides them, and none is raised before Task 33 unless it blocks a task)

1. The target branch of the pull request. Task 32 writes the text without naming a target; Task 33 does not open the pull request.
2. `.backlog/.gitignore` created on the way in: `resolveHome` of `src/shared/store.js` creates it for every command before anything else runs, so a refused team command leaves that one untracked file, against "a refused team command takes no action at all" and design chapter 01 section 4 step 6. Provisional state, kept by every task: the file is created as today and the tests assert the exact leftover status line. The options the owner chooses between: keep it and state the exception in the design (the backlog folder's own ignore file is scaffolding, not an action); create it only when a command proceeds (changes `resolveHome` and every user command; two tests change); remove it in the team undo when this run created it (team commands only).

## The standard proof

Run in the repository root after each task (all must pass before the commit):

```bash
npm run check                                                                                  # exit 0
SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<the private deny-list file> node --test .agents/test/no-private-details.test.js   # 3 pass, 0 fail
npm test                                                                                       # 0 fail
FEATURE_LOCATION=local node --test .agents/test/features.test.js                                # 0 fail
FEATURE_LOCATION=remote node --test .agents/test/features.test.js                               # 0 fail
```

The feature suite counts 87 behaviour scenarios per location at the start; a task that adds or removes scenarios states the new count.

## Review Focus

1. Branch names that contain a slash (`feature/a-b`) and team items on several branches of one folder: `pop`, `query plan` and the `query` list read the session's branch only, in index order, and never offer an item of another branch (tests: Task 2 step 1, Task 7 step 1).
2. A team command run from a subdirectory of the working copy (`src/` of the consumer checkout) behaves exactly as from its top: same repository, branch, team file and item (tests: Task 2 step 1, Task 3 step 1).
3. `--help` of every team word run outside any git repository, with no backlog and no configuration, prints the help, exits 0 and creates nothing (no `.backlog/`, no clone) (test: Task 8 step 1).
4. A team item edited by hand (fields named `events` and `phase`, fields in an order unlike the definition, an undeclared field) passes through `backlog team query <item>` and through `--show-all` user writes with every byte outside the changed keys, `updated`, `updated_by` and the new history entry kept (tests: Task 7 step 1, Task 13 step 1).
5. An item named as `7`, `007` or by its slug reaches the same item in `team update`, `query check` and `query <item>`; a number held by a live and an archived item is refused with the `index.find` text naming both (tests: Task 3 step 1, Task 7 step 1).

---
### Task 1: Publication, numbering and parser fixes on the merged code

Context: a review of the merged code found that a publication locked out of its lock leaves the command's files behind, that a person's uncommitted edit of another item is published with a command's commit (design chapter 04 section 6: the command stages only the item files it wrote; nothing of a person is published without their action), and that the next-number rule, the flag parser and the history-line text each exist twice.

**Files:**
- Modify: `src/shared/team-publish.js` (`publishTeam`: the lock call, `commitOwn`), `src/shared/sync.js` (`commit`: the lock call; `ownedPaths`; `restoreOwn`; `ownCommit`; `keptParts`)
- Modify: `src/shared/store.js` (`mark`, `nextSeqFor`, the two inline readers of the item on disk in `writeItem`, the renumber entry)
- Modify: `src/team/item.js` (delete `nextSeqOf`), `src/team/new.js` (the number), `src/team/args.js` (`parseArgs` option), `src/team/validate-command.js` (`readInputs`)
- Modify: `src/team/migrate-convert.js` (delete the `write` parameter and `lineOf`), `src/shared/item-file.js` (`eventText`), `src/shared/query.js` (`historyLine`)
- Test: `.agents/test/team-publish.test.js`, `.agents/test/shared-sync-undo.test.js`, `.agents/test/shared-stale.test.js`, `.agents/test/team-new.test.js`, `.agents/test/team-validate.test.js`, `.agents/test/team-args.test.js`, `.agents/test/team-migrate-convert.test.js`, `.agents/test/item-history.test.js`

**Interfaces:**
- Consumes: `locked(path, callback, { wait, takeOver })` of `src/storage.js` (default wait 10000 ms), `store.lockWait()`, `takeStart(home)` (the start snapshot `{ files: Map(path -> { bytes, mode, link }), index, staged }`), `restoreOwn(home, t, names, files, committed, saved, guard)`, `historyEntry(e, where)` of `src/shared/item-json.js`.
- Produces: `ownedPaths(home, t, names, files, saved)`; `ownCommit(home, subject, committed, rev = 'HEAD')`; `store.mark(dir, items = load(dir))`; `store.nextSeqFor(dir, tail, floor = 0, items = load(dir))` (items in the `{ path, fm: { phase, seq } }` shape, which `viewOf` of `src/team/item.js` produces); `parseArgs(argv, accepts = [], { steps = true } = {})`; `eventText(e)` the one history-entry-to-line function. `nextSeqOf` no longer exists.

- [ ] **Step 1: Write the failing tests**

`team-publish.test.js`, inside the existing two-mode loop:
```js
test(`${mode}: a person's uncommitted edit of another item stays uncommitted and unpublished`, async t => {
  // before the command's pull: the person edits phases/001-alpha.json; the command then writes 002-beta
  // after publishTeam: git show --name-only HEAD lists no 001-alpha.json; origin's 001-alpha.json has the committed bytes;
  // the working file has the person's bytes; git status --porcelain lists 001-alpha.json as modified
});
test(`${mode}: the lock held past the wait: LOCKED exit 1, the command's item, index.json and numbers.json are taken back`, async t => {
  // a child process takes lockFile(home) and sleeps; SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS=1000
  // assert rejects e => e.code === 'LOCKED' && e.exitCode === 1; existsSync(002-beta.json) === false;
  // index.json and numbers.json equal HEAD; git status --porcelain of the folder is empty
});
```
`shared-sync-undo.test.js`, both storage modes: the same two tests through the user path (`backlog new --name y` with a person's uncommitted edit of another item; `backlog new` with the lock held by a child).
`shared-stale.test.js`: `store.nextSeqFor(folder, itemName('-x'), 0, view)` returns 3 when `view` holds an item whose phase is `002-x` and whose file is `002-y.json` (the store's rule: the name built from the slug is taken); the same folder without the argument gives the same answer.
`team-new.test.js`: `team new --name x` with an item whose slug `002-x` lies in `002-y.json` creates item 3.
`team-args.test.js`: `parseArgs(['--bogus'], [], { steps: false })` throws `unrecognized arguments: --bogus`; `parseArgs(['--bogus', 'v'], [], { steps: false })` the same.
`team-validate.test.js`: `backlog team validate word --team good` exits 2 with `unrecognized arguments: word`; the existing test "unknown arguments are refused with exit 2 ..." stays unchanged.
`team-migrate-convert.test.js`: the four assertions that pass `write: faulty(...)` call `checkKept(fm, body, readDoc(faultyJson), slugs)` directly with the same expectations.
`item-history.test.js`: `eventText({ at: 'T', step: '', note: '' })` is `'T'` (no trailing space); `eventText({ at: 'T', step: 's', note: 'n' })` is `'T s n'`.

- [ ] **Step 2: Run them and see them fail**

Run: `node --test .agents/test/team-publish.test.js .agents/test/shared-sync-undo.test.js .agents/test/shared-stale.test.js .agents/test/team-new.test.js .agents/test/team-args.test.js .agents/test/team-validate.test.js .agents/test/item-history.test.js`
Expected: the new tests fail (the person's edit is in HEAD; the item survives the lock failure; `steps` is unknown; the trailing space).

- [ ] **Step 3: Implement**

- `publishTeam` and `commit`: take the start snapshot (`takeStart(home)`, else `snapshot(home)` as `commit` does) before `locked`; call `locked(lockFile(home), fn, { wait: store.lockWait(), takeOver: true })`; when `locked` throws `LOCKED`, run `restoreOwn(home, t, names, files, new Set(), saved, true)` and rethrow. The run lock (`cloneLocked`) is still held, so the restore is safe.
- `ownedPaths(home, t, names, files, saved)`: a path present in `saved.files` whose current bytes equal `saved.files.get(path).bytes` is left out; a path the command changed again is owned. With no snapshot (`saved` undefined) every changed path is owned, as today. Every caller passes its snapshot (`commitOwn`, `commit`, `restoreOwn`).
- `nextSeqFor(dir, tail, floor, items)` and `mark(dir, items)` read `items` instead of `load(dir)` when given. `src/team/new.js` calls `nextSeqFor(folder, tail, floor, view)`; `nextSeqOf` and its import go.
- `parseArgs` with `{ steps: false }`: a `--name` that is not reserved throws `unrecognized arguments: --<name>` at once. `readInputs(command, argv, booleans)` becomes `parseArgs(argv, [...VALUE, 'json', 'show-all', ...booleans], { steps: false })` followed by: a positional word is `unrecognized arguments: <word>`.
- `convertItem` loses `write`; it calls `writeDoc` directly.
- `eventText` takes the rule of `lineOf` (`at`, then the step when the step or the note is non-empty, then the note); `migrate-convert.js` and `historyLine` of `src/shared/query.js` use it.
- `ownCommit(home, subject, committed, rev)`; `keptParts` calls it per candidate commit instead of repeating the check.
- `writeItem` of `store.js`: one `onDisk(path)` helper replaces the two inline readers; the renumber entry is built with `historyEntry`.

- [ ] **Step 4: Verify**

Run the tests of step 2 (all pass), then the standard proof.

**Must not:** change what a command publishes when no person's edit is present; change any exit code other than the new lock path; change `team-concurrency.test.js` expectations; change the text of an existing refusal.

- [ ] **Step 5: Commit** `git commit -m "Publication takes the run lock's wait and takes back its own files when locked out; a person's uncommitted edit of another item is never published; one next-number rule, one flag parser, one history line"`

---

### Task 2: `backlog team pop` on the engine (B14b)

**Files:**
- Rewrite: `src/team/pop.js`; Create: `src/team/show.js`
- Modify: `src/team/cli.js` (the `pop` route; drop the import of `parse` from `./pop.js`), `src/team/queue.js` (`--claim-now` and its child-process claim removed), `src/team/team.js` (`teamStep` text), `src/team/views.js` and `src/team/wip.js` (comments and texts that name the old step flags), `src/team/help.js` (`team pop`), `src/team/pull.js` (read option)
- Docs: `src/help.js` (team lines), `COMMANDS.md`, `templates/skills/backlog/SKILL.md`, `references/commands.md`, `README.md`, `CHANGELOG.md`
- Test: `.agents/test/team-commands.test.js` (`pop` replay), Create `.agents/test/team-pop.test.js`, Modify `.agents/test/env-prefix.test.js`; remove the old pop tests of `.agents/test/shared-team-pop.test.js` and `.agents/test/shared-team-lead-pop.test.js`

**Interfaces:**
- Consumes: `pop(ctx)` -> `{ action, item, entry, rule, result } | { action: 'idle' }` and `queue(ctx)` of `src/team/rules/pop.js`; `contextOf(...)` -> `{ ctx, order, view, own }`; `build(args)` and `apply(args)` of `src/team/apply.js`; `publishTeam(...)` -> `{ published, result } | { refusal }`; `pullFolder`, `watched`, `sessionOf`, `parseArgs`, `resolveInputs`, `loadTeams`, `toFile(item, entry)`, `readDoc`, `redact` of `src/shared/safety.js`.
- Produces: `showItem(item, entry, { json })` in `src/team/show.js` -> text, or the item document (the object `readDoc(toFile(item, entry))` returns) with `json`; `pullFolder(home, folder, { read = false } = {})` (passes `read` to `sync.pull`).

Decisions: pop takes `--dry-run`, `--json` and the inputs (`parseArgs(argv, [...VALUE, 'json', 'dry-run'])`); the agent is required (`resolveInputs({ command: 'pop' })`). Order of work as `src/team/update.js`: inputs, `sessionOf`, `cloneLocked`, `pullFolder`, `attempt()` = `loadTeams({ deferSha: true })`, `contextOf({ ..., branch: session.branch })`, `pop({ ...ctx, skip: new Set() })`; idle returns `{ idle: true }`; an offer is applied with the `result` already evaluated (`apply` with `step: action`, `seq: item`; no second evaluation, one commit, message `team <step> <slug>`). `publishTeam(..., { step, attempt, watch, persist: () => persistSha(), exit: 1 })`. On a re-run `attempt` chooses again with an empty skip (Task 6 adds the skip). `--dry-run`: no lock for writing, `pullFolder(home, folder, { read: true })`, `build(...)` instead of `apply`, nothing written, no `publishTeam`. Exit codes: 3 only for idle; a `BacklogError` with `code === 'SYNC_FAILED'` and exit code 3 thrown by `pullFolder` becomes exit 1 (an exit code 2 of the pull stays 2); `publishTeam` already applies `exit` to every publication failure; a malformed rule (`Refusal` exit 2, INL-09 evaluator-level) stays 2. Output: `➡️  <step> <slug> (pop entry <id>, rule <id>)` then `showItem`; idle text `ℹ️  idle: nothing for <agent> in team <team>`; `--json`: `{"action","item","entry","rule","item_file"}` with `item_file` the document after the step (also with `--dry-run`), idle `{"action":"idle"}`. `showItem` text: `[<seq>] <slug>  <name>`, a line `team <t>  repository <r>  branch <b>`, one `<field>: <value>` line per field in the definition's order then the undeclared ones alphabetically, the body, and `history:` with one `eventText`-style line per entry plus `by` and `changes`; every line passes through `redact`, and JSON is redacted before serialization.

- [ ] **Step 1: Write the failing tests**

`team-commands.test.js`: `RUN_KINDS` gains `'pop'`; the replay of the 15 `pop` cases whose team file validates (PAR-49, PAR-50, PAR-51, PAR-52, PAR-53, PAR-56, SCR-24, SCR-25, SCR-28, XP-17, SOL-09, SOL-10, PAT-42, PAT-43, PAT-44; INL-01 and INL-09 stay in `EVALUATOR_ONLY`) compares `action`, `item`, `entry`, `rule` and the written item; `given.order` (PAR-53, SOL-09) is written as `index.json`; test "the harness runs every pop case it can, none silently dropped: 15 pop cases through the command".
`team-pop.test.js`:
```js
test('--dry-run writes nothing and prints what pop prints', ...);         // git status --porcelain of both repositories unchanged; stdout equal to a real pop's
test('idle exits 3 and prints only {"action":"idle"}', ...);
test('a refused push exits 1, never 3, and prints no idle answer', ...);   // a pre-receive hook of the bare remote refuses
test('a failed pull exits 1', ...);
test('the item claimed by pop is held by the agent after it (the step is applied once, one commit)', ...);
test('a credential in a field is redacted in the text and the JSON, and the JSON stays valid after a non-ASCII character', ...);
test('an item number held by a live and an archived item: pop offers neither twice and query/pop name the refusal of index.find', ...);
test('pop on branch feature/a-b offers only that branch\'s items, in index order', ...);
test('pop from a subdirectory of the consumer checkout acts as from its top', ...);
test('--lead, --scope, --all and --claim-now are unrecognized arguments (exit 2)', ...);
```
The claim test replaces the two tests of `shared-team-pop.test.js` that would pass on a pop that never claims; the redaction test re-covers the pop redaction tests removed with B14a; the double-number test re-covers the removed `item-number-twice.test.js` case seen through pop; the branch and subdirectory tests pin Review Focus 1 and 2. Test titles and comments do not name these sources.
`env-prefix.test.js`: `'BACKLOG_TEST_SELF'` leaves `OLD`; the old-name tests run `backlog team pop` on a fixture from `world()` of `team-fixture.js` and assert the texts of `resolveInputs`: `a team command needs a team: give --team <name>, ...` and `this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable`; with the prefixed names the answer is idle, exit 3, `/idle: nothing for a1/`.

- [ ] **Step 2: Run and see them fail**

Run: `node --test .agents/test/team-pop.test.js .agents/test/team-commands.test.js .agents/test/env-prefix.test.js` — Expected: FAIL (old pop answers; `show.js` missing).

- [ ] **Step 3: Implement** `run(argv)` in `src/team/pop.js` and `showItem` in `src/team/show.js` as decided above. Remove from `pop.js` the child processes (`self`, `engine`, `workItem`, `SMOOTH_BACKLOG_CLI_TEST_SELF`), `--lead`, `--scope`, `--all`. Remove `claim-now` from `BOOL` of `queue.js` and its `spawnSync` claim (the old `query` views stay routed until Task 7). Route `pop` in `cli.js` to `(await import('./pop.js')).run(argv.slice(1))` before `installSeam()`. Correct the texts naming the old flags in `team.js` (`teamStep`), `views.js` (`decisionsView` comment) and `wip.js` (header comment).

- [ ] **Step 4: Remove the old pop tests and classify them**

Remove every test of `shared-team-pop.test.js` and `shared-team-lead-pop.test.js` that runs the old pop (delete a file left empty). Classify each against `design/coverage.tsv` in the commit body. Run `grep -rn "claim-now\|TEST_SELF\|--lead\|team', 'pop'" .agents/test src features` and repair or remove what is left (user-command subjects rewritten, not removed).

- [ ] **Step 5: Docs**: `team pop` help (generic form, the exit codes 0, 1, 2, 3, the JSON keys), the `team` help line, `COMMANDS.md` regenerated, skill, `README.md`, `CHANGELOG.md` (breaking: `--lead`, `--scope`, `--all` gone; JSON keys `marked`, `skipped`, `instruction`, `front_matter`, `body` replaced by `entry`, `rule`, `item_file`; exit 3 only for idle).

- [ ] **Step 6: Verify** the standard proof. Feature count unchanged (87).

**Must not:** re-run on upstream with a skip (Task 6); print `marked`, `skipped`, `instruction`; write on `--dry-run`; call `installSeam()` on the new route; read the configuration's `user` key.

- [ ] **Step 7: Commit** `git commit -m "Team pop runs the pop table of the team's rules: ..."` (the body carries the coverage lines).

---

### Task 3: `backlog team query check` and `backlog team query plan` (B14c)

**Files:**
- Modify: `src/team/query.js` (a router: `check` and `plan` go to new code, every other word to the old hooks until Task 7), `src/team/cli.js` (the `query` route resolves `formOf` first)
- Create: `src/team/check.js`, `src/team/plan.js`
- Modify: `src/team/help.js` (`team query`), docs (as Task 2)
- Test: Create `.agents/test/team-check.test.js`, `.agents/test/team-plan.test.js`; Modify `.agents/test/team-commands.test.js`, `.agents/test/team-spelling-docs.test.js`, `.agents/test/skill-commands.test.js`

**Interfaces:**
- Consumes: `formOf(argv)`, `resolveInputs({ command: 'query check' | 'query plan' })` (`--show-all` refused: not in `SHOW_ALL`), `step(ctx)`, `stepNames(entry)`, `stepArgs(entry, name)`, `pop(ctx)`, `contextOf`, `index.find(list, ident)`, `pullFolder(home, folder, { read: true })`, `loadTeams` (default: the load writes the SHA, the copy and the record as `validate` does).
- Produces: `run(argv)` in `check.js` and `plan.js`; the `query` router in `src/team/query.js`: `export async function run(argv)` dispatching on the first word.

Decisions: `check <item> <step> [--arg value]...` evaluates as `team update` without writing; no clone lock for writing. Answers, exit 0: `allowed by rule <id>: <field>: <before> -> <after>; ...` and `refused by rule <id>: <text>`; coded refusals print `rule -`: the item is archived, the item belongs to another team, and an argument the step does not take (checked with `stepArgs` before `step`: `refused by rule -: step <s> takes no --<x>`). A step word no rule names, a wrong value and a malformed rule stay exit 2 as in `team update`. No agent: the caller is empty and the answer is the rules' verdict for an empty caller. `--json`: `{ "allowed": bool, "rule": id | null, "changes": {...}, "related": {...}, "text": "..." }`. `plan`: for each person of `entry.people` in name order, `pop` with that caller and a growing `skip` (the item offered to an earlier person is skipped for a later one); text `<person>: <step> [<seq>] <slug> (pop entry <id>, rule <id>)` or `<person>: idle`; `--json` `[{ "person", "action", "item", "entry", "rule" }]` with `null` for idle; exit 0.

- [ ] **Step 1: Failing tests**

`team-commands.test.js`: every refused `update` case that runs through the command, run as `query check`, prints `refused by rule <the case's rule id>` and exits 0; every allowed one prints `allowed by rule <id>`.
`team-check.test.js`: `check` writes nothing (`git status --porcelain` of the clone empty); an archived item prints `refused by rule -`; `--x` not taken prints `refused by rule -: step claim takes no --x`, exit 0; an unknown step exits 2 with the `team update` text; `--show-all` exits 2 with the `resolveInputs` text; `check 7 claim`, `check 007 claim` and `check <slug> claim` print the same (Review Focus 5); from a subdirectory of the checkout the same (Review Focus 2); no agent gives the verdict for an empty caller; `--json` keys as decided.
`team-plan.test.js`: the parallel template with three open items and people `lead-1, member-1, member-2, member-3` gives four lines in name order, no item twice; `--json` shape; an empty queue prints every person idle, exit 0; nothing written.

- [ ] **Step 2: Run, see them fail.** `node --test .agents/test/team-check.test.js .agents/test/team-plan.test.js .agents/test/team-commands.test.js`

- [ ] **Step 3: Implement** as decided. `src/team/query.js` keeps exporting `hooks` (the old views, still routed for every other word) so `team-spelling-docs.test.js` stays as it is until Task 7; `skill-commands.test.js` names `backlog team query check` and `backlog team query plan` instead of `--plan`.

- [ ] **Step 4: Docs** (`team query` help names `check` and `plan`; COMMANDS.md; skill; README; CHANGELOG). **Step 5: Verify** the standard proof.

**Must not:** write anything; take the clone lock for writing; accept `--show-all`; evaluate a step twice.

- [ ] **Step 6: Commit.**

---

### Task 4: Removal of the old command-level team tests and the `cli()` routing (B14d)

**Files:**
- Remove: the old command tests left of `shared-handoff-commands`, `shared-session-names`, `shared-team-compat`, `shared-team-done`, `shared-team-lifecycle`, `shared-team-plan`, `shared-team-scope`, `shared-team-teams`, `shared-team-work`, `shared-unrefined-claim`, `shared-wip` (`.agents/test/<name>.test.js`; whole files when nothing else is left)
- Modify: `.agents/test/shared-fixtures.js` (remove `teamSpelling`, `infoOf`, `neutralTeam`, `teamNew`, `intoTeam`, `teamMembers`, `createdSlug`, `TEAM_BOOL`, `TEAM_VALUE` once no importer is left; `sharedBacklog` stops writing the old-shape `teams.json`), `.agents/test/team-cli.test.js` (tests of the old `update`, `pop`, `query` views), `.agents/test/team-boundary.test.js` (team side), and the team parts of `shared-update`, `shared-new`, `shared-query`, `shared-sync-db`, `shared-audit`, `shared-help`, `fields`, `item-definition`, `item-markdown-stop`, `shared-item-keys`, `shared-legacy-fields`, `numbers`, `team-file-location`, `new-ask` `.test.js`
- Keep: `shared-handoff-core`, `shared-handoff-close`, `workflow` (Task 27), `plain-team-items` (Task 12), `plain-team-env` (Task 19), `shared-foreign-deps` (Task 22), `features/team-define.feature` (Task 28)

**Interfaces:** Consumes the helpers of `.agents/test/team-fixture.js` (`world`, `inside`, `putItem`, `TEMPLATES`) and `writeStored`. Produces no source change.

- [ ] **Step 1:** `grep -rlnE "teamNew|intoTeam|teamMembers|createdSlug|TEAM_BOOL|TEAM_VALUE|teamSpelling|neutralTeam|team: true|--set-team" .agents/test features` on the current head; list every file with its classification (removed, rewritten onto user commands, unaffected).
- [ ] **Step 2:** Remove or rewrite, file by file; run `node --test <file>` after each.
- [ ] **Step 3:** Classify every removed test in the commit body (coverage rule). A test whose behaviour no row covers stays and is reported.
- [ ] **Step 4: Verify** the standard proof; `grep -rn "teamNew\|intoTeam" .agents/test` prints nothing.

**Must not:** add code to `src/`; change a surviving test's expectation; remove a test of a module that stays until Task 27.

- [ ] **Step 5: Commit.**

---

### Task 5: The team BDD features (B14e)

**Files:**
- Create: `features/team.feature`, `features/team-flow.feature` (the parallel template)
- Modify: `features/agents.feature` (team scenarios out; user claim and release of an item without a team move to `features/plain-use.feature`), `features/steps/cli.js` (steps `a team file from the template "parallel"`, `I act as agent "<name>"`; the steps `a team "x" with lead ...`, `team "x" reviews in the stages ...`, `team "x" has the external reviewers ...`, `team "x" refinements are reviewed by ...` go), `features/support/world.js` (`configureTeam` goes; the world writes the team file at the consumer's `.backlog/teams.json` and items through `toFile`)

**Interfaces:** Consumes `TEMPLATES` of the shipped `templates/teams/parallel.json`. Produces the steps `a team file from the template "<name>"` and `I act as agent "<name>"`, which Tasks 9 and 15 reuse.

- [ ] **Step 1: Write the scenarios** (they fail: no steps): a lead files a parent and children with `backlog team new --parent`; a member pops and claims; hands to check; another member checks; the holder closes; a refused step prints its rule id; the end of the queue is idle with exit 3.
- [ ] **Step 2:** `FEATURE_LOCATION=local node --test .agents/test/features.test.js` — FAIL (undefined steps).
- [ ] **Step 3:** Implement the steps and the world.
- [ ] **Step 4: Verify** the standard proof; state the new scenario count per location in the commit body.

**Must not:** keep a step that writes the old team shape; touch `features/team-define.feature`.

- [ ] **Step 5: Commit.**

---

### Task 6: Concurrency scenarios through the real commands and the pop skip (B15c)

**Files:**
- Modify: `src/team/pop.js` (the skip), `README.md` (one paragraph: a team command publishes only its own commit, runs again when upstream changed what it read; git 2.40 or later), `CHANGELOG.md`
- Test: `.agents/test/team-concurrency.test.js`

**Interfaces:** Consumes `publishTeam` (`exit` applies to every publication failure; `r.result ?? first`; `persist` called only by `publishTeam`). Produces: pop's `attempt` keeps a `Set` of the item numbers offered by earlier rounds of this command and passes it as `ctx.skip`.

- [ ] **Step 1: Failing tests** (two clones and a bare remote, the real commands): two clones run `backlog team update <item> claim` at once: one exit 0, the other exit 1 with the rule's refusal; two `backlog team new --parent <p>`: the parent's children list holds both; two claims that pass a limit together: the second refused; two `backlog team new`: two different numbers; a remote hook that moves upstream on every push with `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS=2000`: exit 3 for `update`, exit 1 for `pop`, `kept changing` in the text, nothing published; pop whose first push meets an upstream change of another item of the folder runs again and offers the second item of the queue, not the first; a person's commit made on top of the command's commit during `backlog team update` is never taken back by the undo (the own-commit rule: subject and committed paths).
- [ ] **Step 2:** `node --test .agents/test/team-concurrency.test.js` — the skip test fails.
- [ ] **Step 3:** Implement the skip. **Step 4:** docs. **Step 5: Verify** the standard proof; the replays of Tasks 2 and earlier pass unchanged.

**Must not:** change `publishTeam`; change user-command stale-view behaviour (`shared-stale.test.js`, `shared-sync*.test.js` unchanged).

- [ ] **Step 6: Commit.**

---
### Task 7: `backlog team query`, `query <item>`, `query filter <name>` (B16a)

**Files:**
- Modify: `src/team/query.js` (the router's list, item and `filter` forms), `src/team/cli.js` (the route), `src/team/help.js` (`team query` names every form)
- Create: `src/team/list.js` (the list printer shared by the list form and `filter`)
- Test: Create `.agents/test/team-query.test.js`; Modify `.agents/test/team-commands.test.js` (`filter` replay), `.agents/test/team-spelling-docs.test.js`
- Docs: as Task 2

**Interfaces:**
- Consumes: `formOf`, `resolveInputs` (`query`, `query <item>` accept `--show-all`; `query filter` refuses it), `pullFolder(home, folder, { read: true })`, `loadTeams` (default), `contextOf` (all branches when no branch was given: `branch: inputs.branch || undefined`), `queue(ctx)`, `filter(ctx, name)`, `showItem`, `index.find`.
- Produces: `printList(items, { json, all })` in `src/team/list.js`.

Decisions: list form: the team's open items in queue order of the session's branch when `--branch` (or `SMOOTH_BACKLOG_CLI_TEAM_BRANCH`) is given, else every branch in the index's key order; with `--show-all` and no team, each team of the file in file order, each by its own `final`. Text `P<rank> [<seq>] <slug>  <status>  <name>`, plus `  (team <t>)` with `--show-all`; empty: `ℹ️  no open item for team <t>`. `--json`: the array of item documents (`showItem(..., { json: true })`). `query <item>`: number or slug over every live and archived item (`index.find`); with a team, an item of another team is exit 1 `❌ item <n> belongs to team <other>`, an item without a team exit 1 `❌ item <n> belongs to no team`; with `--show-all` and no team, any item; none: exit 1 `❌ no item <item>`. `filter <name>`: `filter(ctx, name)` printed as the list; an unknown name exits 1 with the evaluator's text. Nothing is written but what `loadTeams` writes. The old views (`--claimable`, `--reviewable`, `--blocked`, `--decisions`, `--wip`, `--lead`, `--scope`, `--agents`) stop being routed: `src/team/query.js` drops `hooks`; `team-spelling-docs.test.js` takes the retired query flags as a literal list in the test (they are the words documents must not show).

- [ ] **Step 1: Failing tests**: the 9 `filter` cases (PAR-54, PAR-55, SCR-26, SCR-27, XP-18, XP-19, SOL-11, PAT-45, PAT-46) through `backlog team query filter`; R14-04 to R14-07 and R14-10 through the commands (`query --show-all` with the team variable set; `query --team web --show-all` lists web only; `query filter x --show-all` exits 2); the list with two branches including `feature/a-b`, with and without `--branch` (Review Focus 1); `--show-all` over two teams; `query <item> --json` deep-equals `item_file` of `pop --dry-run --json` for the same item; `query 7`, `query 007` and `query <slug>` print the same, and a number held live and archived exits 2 with the `index.find` text (Review Focus 5); a hand-edited item with fields `events` and `phase` and an undeclared field prints every field (Review Focus 4); `git status --porcelain` of the clone is empty after each form.
- [ ] **Step 2:** run, see FAIL. **Step 3:** implement. **Step 4:** docs (CHANGELOG: the old views are gone; `query --json` prints item documents). **Step 5: Verify** the standard proof.

**Must not:** write an item, the index or the counter; accept `--show-all` on `filter`; print declared and undeclared fields differently.

- [ ] **Step 6: Commit.**

---

### Task 8: `query rules`, `query steps`, the final router (B16b)

**Files:** Modify `src/team/query.js`, `src/team/help.js`; Test `.agents/test/team-query.test.js`; docs.

**Interfaces:** Consumes `stepNames(entry)`, `stepWords(rule)`, `stepArgs(entry, name)` of `src/team/steps.js` (no new file). Produces the final router: the first word `check`, `plan`, `filter`, `rules`, `steps` selects its form; no word is the list; any other word is an item.

Decisions: `query rules` prints `JSON.stringify(entry, null, 2)` in text and `--json` alike; with `--show-all` and no team, the whole file's entries keyed by team. `query steps`: one line per step of `stepNames(entry)`: `<step>  takes: --a, --b  rules: id1, id2` (a `*` rule is listed under every step); `--json` `[{ "step", "args", "rules" }]`; `--show-all` refused.

- [ ] **Step 1: Failing tests**: for each of the five shipped templates, `JSON.parse(query rules --json)` deep-equals the entry; `query steps` lists every step of `stepNames` with `stepArgs` and each matching rule id once; `query steps --show-all` exits 2; for every team word (`new`, `update`, `pop`, `query`, `query check`, `query steps`, `validate`, `migrate`) `--help` exits 0 and prints the help with a broken team file, with a missing team file, with a broken `.backlog/config.json`, and outside any git repository with `SMOOTH_BACKLOG_CLI_HOME` pointing at an empty folder, which stays empty (Review Focus 3).
- [ ] **Step 2:** run, FAIL. **Step 3:** implement. **Step 4:** docs. **Step 5: Verify** the standard proof.

**Must not:** read a template; print the SHA or the record.

- [ ] **Step 6: Commit.**

---

### Task 9: The skill's team section, the documentation guards, the rules feature (B16c)

**Files:** Modify `templates/skills/backlog/SKILL.md` (the "Team work" section: the six words, `query rules`, `query steps`, `query check`; the rules are never restated), `templates/skills/backlog/references/commands.md` and `COMMANDS.md` (regenerated), `.agents/test/skill-commands.test.js` and `.agents/test/team-spelling-docs.test.js` (the new team command list); Create `features/team-rules.feature` with steps in `features/steps/cli.js`.

- [ ] **Step 1: Failing tests**: `skill-commands.test.js` requires the skill to contain `backlog team query rules --team <team>`, `backlog team query steps --team <team>`, `backlog team query check <item> <step>`, `backlog team validate --team <team>` and none of `--plan`, `--decisions`, `--wip`; the feature: a lead reads `query rules` and `query steps`, edits the team file, runs `backlog team validate` and sees a finding with its fix, in both locations.
- [ ] **Step 2:** run, FAIL. **Step 3:** write the docs and steps. **Step 4: Verify** the standard proof; state the scenario count.

**Must not:** restate a team rule in the skill.

- [ ] **Step 5: Commit.**

---

### Task 10: User reads do not see team items (B17a)

**Files:** Modify `src/shared/index.js` (`showAll(on)`, `sees(item)`, `rows`), `src/shared/dependencies.js` (`visibleForeign`), `src/shared/store.js` (`reflow`, `reorder` keep team entries in place), `src/shared/update.js` (`--seq` checks and `--replan` read the view); Create `.agents/test/user-visibility.test.js`, `.agents/test/user-cases.js` (builds a folder from a rule case's items and runs the real CLI; reused by Tasks 11, 13, 18).

**Interfaces:**
- Consumes: `foreignRaw(folder, id)` of `src/team/item.js` is not importable from shared code (boundary guard), so `visibleForeign` reads through `foreignItem(folder, id, typed)` and returns null for an item with a team unless `sees` it.
- Produces: `index.showAll(on: boolean)`, `index.sees(item) -> boolean` (`on || !item.fm.team`), `dependencies.visibleForeign(folder, id, typed)`. Every user command sets `showAll` once at its start.

Decisions: `rows` returns only the rows the view sees; a row's priority is its position among the entries of its branch the view sees; without the flag a row is byte-identical to today's. `byIdent`, `undoneDependencies` and the display of `next` and `list` work over the filtered rows, so a reference to a team item reads as a missing item. No claim is gated on it: user commands apply no dependency gate (Task 13 removes the gate), so the reference is proved through `new --depends-on` and the display. `--replan` and every reorder keep team entries in place (`inScope` = item without a team) and add history entries only to items in scope. `store.load` is not filtered. Start checks (verify on the head, adopt, report each): a replan moves a team entry today; a replan's history entry reaches team items; the priority after a reflow is the position in the branch list.

- [ ] **Step 1: Failing tests**: COD-06 (`backlog show 90` exit 1, `no phase '90'`), COD-07; R16-02 (`backlog new --depends-on 90 --name t` exit 1 `--depends-on: no item '90' in this backlog`); `next` and `list` show a dependency on a team item as missing; priority ranks of user items ignore team entries; `list --json` has no `team` key; `update u3 --replan` leaves team entries in place and writes no history entry on a team item; a foreign dependency on a team item reads as missing.
- [ ] **Step 2:** run, FAIL. **Step 3:** implement. **Step 4: Verify** the standard proof.

**Must not:** filter inside `store.load`; change `index.json`'s format; read the team file.

- [ ] **Step 5: Commit.**

---

### Task 11: `--show-all` on the reading commands and on `new` (B17b)

**Files:** Modify `src/shared/read.js` (`take` accepts `show-all` for `list`, `next`, `show`, `history`, `changes`), `src/shared/query.js` (`BOOL` gains `show-all`; a team column and `team` in rows with the flag; `next` ignores team entries without it), `src/shared/seen.js` (`changedSince`: team items left out unless the flag; `held` is `!fm.team && fm.claimed_by === agent`), `src/shared/new.js` (the flag; `--depends-on` names a team item only with it; `--split-from` of a team item refused until Task 14), `src/help.js`, docs; Test `.agents/test/user-visibility.test.js`.

- [ ] **Step 1: Failing tests**: R16-01 (`show 90 --show-all` shows the item with its team), R16-03 (`new --depends-on 90 --show-all` creates the item with `depends_on` 90); `list`, `list branches`, `next`, `show`, `history`, `changes` with and without the flag; `history` of a team item without it is `no phase`; `changes` lists no team item and no held entry by `reviewer` or `refiner`; `fields --show-all` exits 2.
- [ ] **Step 2–5:** FAIL, implement, docs (CHANGELOG breaking: these commands no longer show team items), standard proof.

**Must not:** add the flag to a writing command other than `new`; change exit codes.

- [ ] **Step 6: Commit.**

---

### Task 12: Tests that turn from "refuses" to "does not see" (B17c)

**Files:** `.agents/test/plain-team-items.test.js` (every "refuses a team item" becomes "does not see it"; tests of commands Task 13 and Task 14 change are marked with those tasks' test names, none deleted), `.agents/test/team-boundary.test.js` (user side), `.agents/test/shared-query.test.js`, `.agents/test/shared-severity.test.js` (only where they create team items).

- [ ] **Step 1:** rewrite; **Step 2:** `node --test` each file; **Step 3:** the standard proof. **Must not:** skip a test. **Step 4: Commit.**

---

### Task 13: `backlog update` and `backlog done` on a team item with `--show-all` (B18a)

**Files:** Modify `src/shared/update.js` (the flag; `--set <field>=<value>`; the `OF_A_TEAM` and `REPLAN_TEAM` refusals go), `src/shared/done.js` (passes `{ step: 'done' }` to `update.run`), `src/shared/plain-step.js` (for every item: claim, release and close refuse nobody, there is no work-in-progress limit and no dependency gate, here and in the publication re-check `claimOf`; the field writes with the default words stay), `src/shared/store.js` (`teamWrite(folder, path, { step, before })` appends the history entry through `historyEntry`; a team item is read with `readDoc` and written with `writeDoc` keeping the stored field order), docs; Create `.agents/test/user-show-all-update.test.js`; Modify `.agents/test/user-visibility.test.js`, `.agents/test/plain-team-items.test.js`.

**Interfaces:** Consumes `readDoc`, `writeDoc(doc, { order })` with `order` = the item's field keys as stored, `historyEntry`, `store.addEvent(folder, path, { event, note, before })` (the note is first-wins within one command: pass `--show-all on an item of team <t>` as the first note, combined with `--note` text when given). Produces `store.teamWrite`.

Decisions: a team item without the flag answers `no phase '<item>' (create it with backlog new)` (R19-01). With it the item changes like any item, no rule runs, the stale-view guard still applies. `--set <field>=<value>` (repeatable) is refused on an item without a team (exit 1, `❌ --set is for items of a team; the options of backlog update name the fields of an item without one`); its key may not be an envelope key (exit 2 naming the key and the option that sets it); the value is JSON when it parses, else text; an undeclared field is written. One history entry per command per team item: `{ at, by, session, step: 'update' | 'done', changes, note: '--show-all on an item of team <t>' }`; the `claimed` and `planning_event` events are not written for a team item. `--branch` stays refused (use `backlog move --to-branch --show-all`). `--priority n --show-all` is the position in the branch's list of the index. Start checks: `lift` of `status.js` returns a team item untouched and `store.write` keeps every key of a team item (verify with a test, do not change).

- [ ] **Step 1: Failing tests**: R19-01, R19-02; one test per option with and without the flag (`--claim`, `--release`, `--close`, `--status`, `--append`, `--priority`, `--seq`, `--set`, `done`); a team item with status `done`, fields `priority`, `stage`, `owner`, `events` and `phase`, its fields in an order unlike any definition, changed by `--append --show-all`, keeps every byte except `updated`, `updated_by`, the body and the new history entry (Review Focus 4); two `--set` in one call give one history entry; `--set` on an item without a team, on `slug`, with `tags=["a","b"]` and with plain text; `backlog update x --claim bob` on an item another agent holds records `bob` (no refusal), a claim over a limit and a claim of an item with an unfinished dependency are not refused. The tests and the scenario of `features/agents.feature` that assert those refusals ("another agent cannot take a claimed item") change in this task, each named in the commit body with its coverage row (claim, release and close refusals, the limit and the dependency gate are deleted behaviour of the user commands).
- [ ] **Step 2–5:** FAIL, implement, docs (CHANGELOG: `--set` new; user commands act on a team item only with `--show-all`), standard proof.

**Must not:** read the team file; check a value against a definition; write a status word not given.

- [ ] **Step 6: Commit.**

---

### Task 14: `move`, `archive`, `archive done`, `import`, `clean`, `new --split-from` on team items (B18b)

**Files:** Modify `src/shared/move.js`, `src/shared/archive.js`, `src/shared/sequence.js` (`import` and `archive done` pass `--show-all` and read `list all-branches --json --show-all`), `src/shared/import.js`, `src/shared/clean.js`, `src/shared/new.js` (`--split-from` of a team item with `--show-all`: the parent's `split` event becomes the history entry; the refusal `a split of a team's item is made by backlog team new` goes); Delete `src/shared/team-items.js` (no importer left); `src/help.js`, docs; Test `.agents/test/plain-team-items.test.js` (rewrite finished), Create `.agents/test/user-show-all-writes.test.js`.

Decisions: team items move, archive, import and clean only with the flag; one history entry per changed team item (note `--show-all on an item of team <t>`, step = the command word). `archive` of a team item: `--force` archives it whatever its status; without `--force` an unfinished team item is refused with a text naming the item's team and saying its team's rules do not run. `archive done` selects team items only with the flag. `import --higher --show-all` places team items first with `update --priority 0 --show-all`. `clean` without the flag deletes only items without a team; with it team items too (no history entry; the file is gone).

- [ ] **Step 1: Failing tests**: one per command with and without the flag; `import --higher` with a team item; `archive` of a team item closed with `accepted`: refused without `--force`, archived with it; the scenario "a person archives the item of a team that no longer exists".
- [ ] **Step 2–5:** FAIL, implement, docs, standard proof.

**Must not:** change `archive`'s refusal for an unfinished item without a team; delete a team item without the flag.

- [ ] **Step 6: Commit.**

---

### Task 15: The `--show-all` feature and documents (B18c)

**Files:** Create `features/show-all.feature` (a person lists without and with `--show-all`; archives the item of a team that no longer exists), steps in `features/steps/cli.js`; `README.md`, `CHANGELOG.md`, the skill's "Working alone" section (the `--show-all` rule replaces "user commands refuse team items"), `COMMANDS.md` regenerated.

- [ ] Steps: write the scenarios (FAIL), the steps, the docs; standard proof with the new scenario count; commit.

---

### Task 16: The open-first order per owner (B19a)

**Files:** Modify `src/shared/index.js` (`reconcile`: the default scope of a user command is items without a team, the default openness `FINAL` of `src/shared/item-definition.js`), `src/shared/store.js` (`reflow`, `reorder` take the scope and `showAll` instead of `seam.inScope`), the callers in `update.js`, `new.js`, `move.js`, `archive.js`; Test `.agents/test/shared-index.test.js`, Create `.agents/test/team-order.test.js`.

**Interfaces:** Consumes `reconcile(idx, items, { move, lead, exclude, renames, inScope, branches, open })` (with `open` the partition already acts among the scope's positions). Produces the user default: `inScope = item => !item.fm.team`, `open = item => !FINAL.includes(item.fm.status)`.

Decisions: entries outside the scope keep their absolute positions; `order` lists the scope's open entries only (a user's `P0` is the first user entry). `--show-all --priority n`: scope = every entry; the item goes to position n of the branch list as it stands (clamped); the user partition is re-applied; team entries are not re-partitioned.

- [ ] **Step 1: Failing tests**: branch list `u1 t1 u2 t2 u3`, `update u3 --priority 0` gives `u3 t1 u1 t2 u2`; a team `place` effect leaves user entries in place (through `team update`); a closed user item moves behind the user's open items and no team entry moves; a team item reaching its final word moves behind its team's open entries only; a user command and a team command in turn change nothing on the second run; a new user item is appended inside the user positions; `--show-all --priority 0` moves a user item before a team entry; `--replan` leaves team entries in place.
- [ ] **Step 2–4:** FAIL, implement, standard proof.

**Must not:** read the team file; change `mergeOrders`; change the index format.

- [ ] **Step 5: Commit.**

---

### Task 17: `backlog clean` removes only the entries of the items it deleted (B19b)

**Files:** Modify `src/shared/clean.js` (the `delete idx.branches[branch]` and `idx.branches = {}` become removals of the deleted items' entries by slug); Test `.agents/test/shared-move-archive.test.js` (clean tests), Create `.agents/test/clean-index.test.js`.

- [ ] **Step 1: Failing tests**: a branch with two user items and one team item: after `clean` the index lists the team item once and no user item, the team item's file remains; `clean all-branches` the same; with `--show-all` the team item and its entry go too; another branch's entries are untouched; after `clean`, `git status` is clean and `.backlog/team-templates` exists.
- [ ] **Step 2–4:** FAIL, implement, standard proof. **Step 5: Commit.**

---

### Task 18: The team-session guard (B20a)

**Files:** Create `src/team/session-guard.js`; Modify `src/shared/router.js` (export `guardTeamSession(argv)`; `run` calls it after its own `--help` block and before `assertConfigReadable`), `src/main.js` (calls it in the `upgrade` branch after that branch's `--help` check and in the `setup` branch when `--help` is absent); docs (README, CHANGELOG, the skill's team section, and the general `team` help of `src/team/help.js`, whose sentence that the user commands ignore the team environment becomes the stop); Create `.agents/test/team-session-guard.test.js`.

Decisions: with `SMOOTH_BACKLOG_CLI_TEAM_NAME` set to a non-empty value every user command, `setup` and `upgrade` included, stops before reading anything with exactly `❌ backlog: teams are not allowed to use user commands` (exit 2, standard error, no hint); an empty value and the configuration's `team` key do not block; `backlog --help`, `--version`, `backlog` alone, `backlog <command> --help` and `backlog team ...` are not blocked; an unknown word is left to the router's own refusal. The command word is found as `src/main.js` finds it (a leading `--json` belongs to the command; no word means `next`).

- [ ] **Step 1: Failing tests**: R19A-01 (`backlog show 91` with the variable), R19A-02, R19A-03; one test per user command word with the variable (exit 2, the exact text, the folder byte-identical before and after); the help and version forms exit 0; `backlog team validate --team x` is not blocked.
- [ ] **Step 2–5:** FAIL, implement, docs, standard proof. **Step 6: Commit.**

**Must not:** read the configuration, the team file or the backlog folder; block `backlog team`; name the variable outside `src/team/`.

---

### Task 19: The tests that set the team variable (B20b)

**Files:** `.agents/test/plain-team-env.test.js` (rewritten: user commands stop under the variable), `.agents/test/env-prefix.test.js`, `.agents/test/shared-query.test.js`, `.agents/test/shared-severity.test.js`, `.agents/test/shared-fixtures.js` (`env()` removes `SMOOTH_BACKLOG_CLI_TEAM_NAME` for user-command runs; tests that want it pass it), and every other file `grep -rln SMOOTH_BACKLOG_CLI_TEAM_NAME .agents/test features` finds.

- [ ] Steps: grep; rewrite; each changed expectation named in the commit body; standard proof; commit.

---

### Task 20: `backlog move` between branches only (B21a)

**Files:** Modify `src/shared/move.js` (`--to-repository` and its block, `foreignDependents` and their imports go; usage `give --to-branch`), `src/shared/query.js` (`findingLines`: an item whose repository is not the folder's is out of the queue; file it in its repository with `backlog new` and archive it here), `src/help.js`, `COMMANDS.md`, the skill reference; Test `.agents/test/removed-forms.test.js` (`move x --to-repository a/b`: exit 2, `unrecognized arguments: --to-repository`), the `move --to-repository` tests removed and classified, `.agents/test/shared-query.test.js` (`STATUS_FINDINGS` expectation follows the new text in this task).

- [ ] **Step 1:** `grep -rn "to-repository" src .agents/test features` on the head (today: 12 test files); list each declaration to remove. **Step 2:** failing test in `removed-forms.test.js`. **Step 3:** implement and remove. **Step 4:** standard proof. **Step 5: Commit** with the coverage lines.

**Must not:** remove a test that does not use the removed form; change `--to-branch`.

---

### Task 21: The guards look at the own folder (B21b)

**Files:** Modify `src/shared/sync.js` (`refuseConflicts(home, t, folder)` and `refuseUnpublished(home, t, folder)` look at the folder's paths; `pull(home, { read, folder })`), `src/team/pull.js` (`pullFolder` passes `folder`), `src/shared/team-publish.js` (its two `refuseConflicts` calls pass the folder), every caller of `sync.pull` in `src/shared/` (`new.js`, `update.js`, `archive.js` through `withBacklog`, `clean.js`, `query.js`, `index.js` `ensure`); Tests `.agents/test/shared-sync.test.js`, `shared-sync-db.test.js`, `shared-stale.test.js`, `team-concurrency.test.js`.

Decisions: unmerged entries and conflict markers count only under the folder (and `*.json` as today); unpublished commits count only when they touch the folder (`git log <ref>..HEAD -- <folder>`). A rebase that stops on a conflict outside the folder aborts, keeps the command's commit local and exits 3 with `❌ backlog: <path> outside <owner>/<name> conflicts with upstream; this command changes only its own folder: resolve the conflict in the backlog clone and run it again`.

- [ ] **Step 1: Failing tests**: a conflict in another folder and an unpublished commit in another folder no longer stop `new`, `update`, `archive`, `list`; a conflict inside the folder still stops with today's text; the outside-conflict text; a person's unpushed commit of another folder in the backlog clone stays local after a team command; `git commit --only` over the folder's paths succeeds while another folder has unmerged entries.
- [ ] **Step 2–4:** FAIL, implement, standard proof. **Step 5: Commit.**

**Must not:** weaken the check of the folder's own paths; change the journal or the undo.

---

### Task 22: Foreign references are only checked for their form (B21c)

**Files:** Modify `src/shared/new.js` (`--depends-on`), `src/shared/update.js` (`--set-depends-on`; the `foreignCycle` call goes), `src/shared/sync.js` (`validatePublication`: a well-formed foreign entry resolves; `leaves`, `others` and the `foreignCycle` call go), `src/shared/dependencies.js` (`foreignCycle` deleted; `foreignItem` returns null for an unreadable foreign file instead of throwing), docs; Test `.agents/test/shared-foreign-deps.test.js` (old declarations replaced), the cases R24-01 and R24-02.

Start checks (verify, adopt when the code confirms, report each): `undoneDependencies` and `byIdent` treat a team item as missing; a cross-folder dependency cycle is no longer walked; both `resolves` and `leaves` of `validatePublication` are covered; the refusal text for a malformed foreign form.

- [ ] **Step 1: Failing tests**: `backlog new --depends-on acme/lib#99 --name t` is accepted with no such item (R24-01 user side); `backlog update <item> --set-depends-on acme/lib#7` likewise (R24-02 user side); `acme/lib#x` and `acme#7` are refused; a publication whose foreign reference does not resolve is not refused; an unreadable foreign item file shows as `(no such item in the backlog repository)` in `next` and `list` and never throws.
- [ ] **Step 2–4:** FAIL, implement, standard proof. **Step 5: Commit** (coverage lines for the replaced declarations).

**Must not:** remove the existence and cycle checks inside the own folder; remove `foreignItem` or `isForeign`.

---
### Task 23: The command `backlog team migrate` (B22c)

**Files:**
- Create: `src/team/migrate.js`
- Modify: `src/team/cli.js` (the `migrate` route replaces `pending(...)`), `src/team/validate-command.js` (`pending` deleted; `readInputs` kept), `src/team/teams-load.js` (`writeSha` generalised to an exported `writeConfigKeys(top, patch)`; `loadTeams` unchanged), `src/shared/sync.js` (`ownedPaths`: the deletion of a markdown item file tracked in HEAD of the own folder is owned)
- Docs: `src/team/help.js` (`team migrate`), `src/help.js` (the usage line), `COMMANDS.md`, `README.md`, `CHANGELOG.md`, `templates/skills/backlog/SKILL.md`, `references/commands.md`
- Test: Create `.agents/test/team-migrate.test.js`; Modify `.agents/test/team-validate.test.js` (the router test), `.agents/test/team-cli.test.js` (the `migrate` assertion), `.agents/test/shared-help.test.js`

**Interfaces:**
- Consumes: `readFolder(dir)` -> `{ dir, label, items, jsonCount, failures, hasTeamItem }` and `planFolder(read, { teams, repo })` -> `{ converted, jsonCount, failures, unresolved, counter, refs }` of `src/team/migrate-plan.js`; `readInputs(command, argv, booleans)`; `resolveInputs` (`migrate` in `SHOW_ALL`); `loadTeams({ full: true, deferSha: true })` -> `{ file, findings, persistSha }` (throws `TEAMS_FILE` with `missingText` for a missing file; returns `file: null` and one finding for a file that is not JSON or not an object); `pullFolder`, `watched`, `publishTeam`, `numbers.seed`, `numbers.record`, `store.writeText`, `store.note`, `store.undoOnThrow`, `index.reconcile(..., { open })`, `viewOf`, `openOf(file)` of `src/team/apply.js`.
- Produces: `writeConfigKeys(top, patch)`; `run(argv)` of `src/team/migrate.js`.

Order of work (decisions): `readInputs('migrate', argv, ['dry-run'])` (`--ask` refused as `unrecognized arguments: --ask` until Task 26); `cloneLocked`; `floor = numbers.seed(folder)` before the pull; `pullFolder`; `git status --porcelain -z -uall -- <folder>`: an uncommitted change of an item, `index.json` or `numbers.json` path stops with exit 2 `❌ backlog: <path> has an uncommitted change; commit or stash it, then run backlog team migrate again` (an untracked `.md` without a header block, an untracked non-item file, `.backlog/config.json` and the team file never stop it); `readFolder`; the team file is always loaded: a missing file is tolerated only when `hasTeamItem` is false (`ℹ️  no team file at <shown path>; no item of <owner>/<name> has a team`), a file that exists is validated in full and its findings stop the run with the texts of design chapter 06 section 5 built from the findings (`team <t> fails validation in <path>; rewrite it and run backlog team validate --team <t> first` once per team with an error; `<path> cannot be read (<reason>); fix it, or write {} to unbind every team item on purpose` for a finding with no team and for the loader's unreadable text); `--team <t>` with no entry is exit 1 as `validate`; `planFolder`; any failure prints every case, exit 2, nothing written (with `--json`: `{ "failures": [...] }` on standard output). `counter = max(floor, numbers.seed(folder), every item number of the folder)`. `--dry-run`: the summary of chapter 06 section 2 (converted open and archived counts, counter, refs, unresolved references, index entries that leave and items appended), no write in either repository, no `persistSha`, no record keys; the per-user copy and record outside both repositories are refreshed by `loadTeams`. Run: inside `store.undoOnThrow(folder, ...)` write each `.json` with `store.writeText`, `store.note` and remove each `.md` (an archived item keeps its sub-path), `numbers.record(folder, counter)`, the index with `index.reconcile(current or { branches: {} }, views, { open: openOf(file) })` over `viewOf` of the converted items (an item without a team: open = not in `FINAL`); publish one commit with message `migrate <n> items to JSON` through `publishTeam` with `attempt` = everything after the pull again, `watch` from `watched`, and one `persist` that calls `persistSha()` and `writeConfigKeys(top, { migrated_at, migrated_by_version })`. `migrated_at` is written when the run converted at least one file or the configuration has none; `migrated_by_version` (the version of `package.json`, read with `new URL('../../package.json', import.meta.url)`) always; neither for a dry run, a failed run or a repository input naming another repository. Output `✅ converted <n> items (<k> archived) to JSON in <owner>/<name>` plus the summary; a second run says `ℹ️  nothing to convert in <owner>/<name>`, still validates and refreshes the SHA and the record. The owned markdown pattern is `^(phases/[^/]+|archive/.+)\.md$` and only for a row that is a deletion of a file tracked in HEAD of the own folder; an untracked `.md` is never staged.

- [ ] **Step 1: Failing tests** (`team-migrate.test.js`, the two-clone layout): a folder with no team item migrates without a team file; no team file with a team item stops naming the path and the three ways; an unreadable team file stops; an entry in today's shape stops and nothing is written (`git status` and a byte comparison of the folder); migrate with no team and no `--show-all` exits 2 with the COD-01 text (R14-08); a second run says nothing to convert and keeps `migrated_at`; `migrated_at` records the run; a repository input naming another repository converts that folder and writes no record keys (R22-07); `--dry-run` writes nothing in either repository; a refused push undoes the conversion, every `.md` is back, and an uncommitted `.backlog/config.json` and team-file edit stay; two clones: a markdown item merged by the other clone during the run is converted on the re-run; the commit holds only the `.json` files, the removed `.md` files, `index.json` and `numbers.json`; an untracked `phases/x.md` is left unstaged by the migration and by a user publication; an uncommitted edit of `phases/001-a.md`, of `phases/002-b.json` and of `index.json` each stop the run, an untracked README does not; `--ask` exits 2 `unrecognized arguments: --ask`; the counter is above a number the history held before the pull flattened a merge. `team-validate.test.js` and `team-cli.test.js`: the router assertion "not available yet" becomes "migrate --team good on a markdown folder converts it".
- [ ] **Step 2:** run, FAIL. **Step 3:** implement. **Step 4:** docs (the help no longer says "not available yet" or "bind them to a team"). **Step 5: Verify** the standard proof.

**Must not:** write the team file; read a template; touch another folder; stage `.backlog/config.json`; call `store.write` or `store.load` before the conversion is done; translate a word.

- [ ] **Step 6: Commit.**

---

### Task 24: The migration's data cases (B23)

**Files:** Modify `src/team/migrate-plan.js`, `src/team/migrate-convert.js` (the unbinding helper), `src/team/migrate.js` (summary lines); Test `.agents/test/team-migrate-plan.test.js`, `.agents/test/team-migrate.test.js`.

Decisions: unbinding runs over every item of the folder (converted markdown and JSON read with `readDoc`), always in a conversion run and, in a run that converts nothing, only with `--show-all` (then the changed items are written and published and the run says `ℹ️  unbound <n> items`). An item whose `team` has no entry in the team file loses the `team` key (the file has no `team` key, never `null`), gets one history entry `{ at, by: '', session: '', step: 'migrate', changes: { team: [<former>, null] }, note: 'unbound: team <former> is not in the team file' }` and a body section `## Unbound by the migration (<time>)` with `This item was bound to team <former>, which has no entry in the team file <shown path>; backlog team migrate unbound it. The fields of that team are kept as they were.`; one timestamp per run; `updated` and `updated_by` kept; archived items too. An unbound or teamless item is written with the built-in field order, a team item with its definition's order (`toFile(item, entry)` or `writeDoc(doc, { order })`). Split slices: only an item without a team gets `fields.parent`, from the first `Split from` marker whose slug resolves; an existing `parent` is never overwritten; two markers, an absent slug and a team-item parent are listed in the summary; the marker text is never rewritten. A folder with no `index.json` is ordered before `priority` is dropped by a copy of the order of `index.fromItems` inside `migrate-plan.js` (open first, then `priority` with 50 for absent or non-numbers, then number); a folder with an index keeps it (`reconcile`). The summary counts `<n> index entries change their status copy`.

- [ ] **Step 1: Failing tests** (design chapter 06 section 7): an item of a team missing from the team file is unbound and records it (history and body); the unbinding keeps `updated`; one timestamp per run; an archived item of a missing team is unbound and otherwise unchanged; a second run after a team entry is removed unbinds its items only with `--show-all`; split slices keep their marker and get `parent`, a team item does not; a marker naming an absent slug is listed; items 1, 2, 3 with priority 2, 0, 1 and a closed item with priority 0 are ordered 2, 3, 1, then the closed one; an existing index is kept; the status-copy count.
- [ ] **Step 2–4:** FAIL, implement, standard proof. **Step 5: Commit.**

**Must not:** translate a word; drop `stage` or `review_state`; write `team: null`.

---

### Task 25: The field report (B24a)

**Files:** Create `src/team/migrate-report.js`; Modify `src/team/migrate.js` (summary and `--json`), `src/team/rules/validate-items.js` (export `fits`), `.agents/test/team-rules-cases.test.js` (kinds `migrate-check`, `migrate-ask`; `EXPECTED` gains `findings`; `RUN_COUNT` 228 to 230); Create `.agents/test/team-migrate-report.test.js`.

**Interfaces:** Consumes `fits(type, v)` (exported here) for the types, `typed(entry, field, v, own)` of `src/team/rules/step.js` for allowed values and persons, `readItems(folder, { tolerant: true })` -> `{ items, bad }` (`bad` kinds `unreadable`, `link`, `number`). Produces `fieldReport(docs, entry) -> [{ ref, missing: [...], invalid: [{ field, reason }], undeclared: [...] }]` (not `itemFindings` of `validate-items.js`).

Decisions: the input is the documents the plan holds (converted plus existing JSON), so a dry run, a run and a later run report the same; with `--show-all` each item against its own team; items without a team, unbound and archived items are not checked; the closing line `ℹ️  <n> problems in <k> items of team <t>; ...` is not a finding. The harness kinds call `fieldReport` and the terminal check directly; the real command is proved in `team-migrate.test.js`.

- [ ] **Step 1: Failing tests**: R17-01 through the harness; missing, invalid and undeclared fields listed per item; an item with no findings not listed; the same report on a dry run; `--json` carries the same data; a value `"30"` in a number field is reported as invalid (strict `fits`).
- [ ] **Step 2–4:** FAIL, implement, standard proof (RUN_COUNT 230). **Step 5: Commit.**

---

### Task 26: `migrate --ask` (B24b)

**Files:** Create `src/team/migrate-ask.js` (`run(argv, { io })` with the `io` seam of `src/shared/new.js`'s `terminal`); Modify `src/team/migrate.js`, `src/team/cli.js` (`readInputs('migrate', argv, ['dry-run', 'ask'])`), `src/team/inputs.js` (`resolveInputs` requires the agent for `migrate` when `ask` is given); Create `.agents/test/team-migrate-ask-child.js`; Test `.agents/test/team-migrate.test.js`, the harness case R17-02; Create `features/migrate.feature` (conversion, report, the refusal without a terminal; both locations); docs.

Decisions: not on a terminal: the R17-02 text, exit 2, before the agent check, the lock and the pull. `--ask --dry-run` exit 2 `--ask changes items; it cannot be combined with --dry-run`; `--show-all --ask` exit 2 `--ask repairs the items of one team: give --team <name>`. One item and one field at a time on standard error; an empty answer leaves the field; a wrong answer repeats the question with the reason; an undeclared field asks `remove it? (yes/no)`; the end of the input before the last question writes nothing (`no answer; nothing was changed`). The answers are written at the end in one commit through `publishTeam`, each item with one history entry (`step: 'migrate --ask'`, `by` the agent); after a conversion in the same call that is a second commit, and the output says so once.

- [ ] **Step 1: Failing tests**: R17-02; the child script drives the prompts (an answer, an empty answer, a wrong answer repeated, `yes` removing an undeclared field, end of input writing nothing); the agent check; the two combination refusals; the feature.
- [ ] **Step 2–5:** FAIL, implement, docs, standard proof (state the scenario count). **Step 6: Commit.**

**Must not:** invent a default; write the team file; ask when not on a terminal.

---

### Task 27: Removal of the old team commands (B27a)

**Files:** Delete `src/team/lifecycle.js`, `src/team/queue.js`, `src/team/views.js`, `src/team/handoff-commands.js`, `src/team/handoff-close.js` and the tests that only cover them (`shared-handoff-core`, `shared-handoff-close`, `shared-handoff-commands` if left, `workflow.test.js` only in Task 28); Modify `.agents/test/team-boundary.test.js` (`SHARED` list), `.agents/test/removed-forms.test.js`.

- [ ] **Step 1:** for each module, `grep -rnE "from '[^']*/<module>\.js'|import\('[^']*/<module>\.js'\)" src bin .agents features`; the importers expected to remain are `src/team/cli.js` (`team.js`, `workflow.js`), which Task 28 removes. Any other importer stops the task.
- [ ] **Step 2:** delete leaf first; `node --check` each changed file; classify the removed tests.
- [ ] **Step 3: Verify** the standard proof; `grep` shows no dangling import. **Step 4: Commit.**

---

### Task 28: Removal of the old definition code (B27b)

**Files:** Delete `src/team/team.js`, `src/team/handoff.js`, `src/team/wip.js`, `src/team/workflow.js`, `src/shared/wip-limits.js`, `src/shared/seam.js`; Modify `src/team/cli.js` (imports, the `define` and `workflow` routes, `installSeam`, the `workflows.json` publish), `src/shared/move.js`, `src/shared/plain-step.js`, `src/shared/update.js` (the work-in-progress refusals go, they do not move), the `team?.` hooks of `src/shared/new.js`, `update.js`, `query.js` with `TEAM_QUESTIONS`, `seam.scope()` call sites (`archive.js`, `query.js`, `new.js`, `update.js`, `store.js`, `status.js`), `src/team/help.js`, `src/help.js`, `COMMANDS.md` and `references/commands.md` (the `### backlog team define` and `### backlog team workflow` headings and prose removed by hand: the sync script never deletes a heading), `README.md`, `CHANGELOG.md`; Tests `team-cli.test.js`, `shared-help.test.js` (`TEAM` list), `workflow.test.js` (deleted), `new-ask.test.js` (team case), `features/team-define.feature` and its step (deleted), `.agents/test/team-boundary.test.js` (`SHARED` loses `shared/wip-limits.js`, `shared/seam.js`), `.agents/test/removed-forms.test.js`.

Decisions: `backlog team define` and `backlog team workflow` answer exit 2 `backlog team define is gone: the team file is edited in git and checked with backlog team validate` (and the same sentence for `workflow`). The user work-in-progress limit (`wip-limits.json`) is no longer read; its documentation goes and CHANGELOG lists it as breaking.

- [ ] Steps: importer grep; the two removed-forms tests first (FAIL); delete and repair; docs; standard proof (state the scenario count); commit with coverage lines.

---

### Task 29: The shipped workflow template, the vocabulary and the translation (B27c)

**Files:** Delete `templates/workflows/team.json`; Modify `src/shared/status.js` (keeps `isArchived`, `isFinished`, `isOpen` reading `FINAL`, or they move to `src/shared/item-definition.js` and the file goes when no importer is left), `src/shared/store.js` (`lifted` in `load`, `RETIRED_KEYS`, `LEGACY_KEYS`, `dropsLegacy`, `derivedKeys`, the seam condition of `write`, and any assembly of retired key names from parts), `src/shared/update.js`, `src/shared/dependencies.js`, `src/shared/query.js` (the `lifted` and `normalise` call sites), `src/shared/plain-step.js` (`stageOfStatus` and the `review complete` word), the template's mentions in `COMMANDS.md` and the skill reference; Tests `shared-legacy-fields.test.js`, `shared-item-keys.test.js`, `shared-new.test.js` (the drop assertions), `shared-no-classes.test.js` (its allowance of `src/team/migrate-convert.js` re-checked).

- [ ] Steps: grep `lifted\|statusOf(\|dropsLegacy\|derivedKeys\|normalise\|stageOfStatus\|team.json` in `src`; a test "an item written by `backlog update` keeps `stage`, `review_state` and every other key" (FAIL only if something still drops); delete; standard proof; commit.

---

### Task 30: The retired orders and hooks (B28a)

**Files:** Modify `src/shared/index.js` (`fromItems`, `seed`, `rows` lose the order from `priority`: number order), `src/shared/dependencies.js` (`undoneDependencies` loses `edge`; `finishedByStep` goes), `src/shared/frontmatter.js` (`dump`, `dumpItem`, `replaceFrontMatter`, `replaceItemFrontMatter` deleted when no importer is left; `storedFm`, `loadedFm` move into `src/shared/item-file.js` if the codec still needs them); Tests `shared-index.test.js` (the two priority tests rewritten to number order), `shared-markdown-writer.test.js` (deleted with the writer).

Decisions: a retired key of an item is kept; nothing reports it for an item without a team (the field report of Task 25 covers team items). `seen.js`'s `RANK_ONLY` keeps `priority` (the rank flag of `update`).

- [ ] Steps: importer grep; the number-order tests first; delete; standard proof; commit with coverage lines.

---

### Task 31: The old root configuration file stops every command (B28b)

**Files:** Modify `src/shared/setup.js` (`readConfig` no longer falls back to `LEGACY_CONFIG`; `assertConfigReadable` stops with the text below), comments in `setup.js`, `store.js`, `teams-load.js`; `src/help.js`, `COMMANDS.md`, the skill reference; Tests `team-load.test.js`, `team-file-location.test.js`, `storage-location.test.js`, `shared-origin-setting.test.js`, `shared-setup.test.js` (rewritten to `.backlog/config.json`), `.agents/test/removed-forms.test.js` (one test per stop text).

Decision: a repository with `.smooth-backlog.json` and no `.backlog/config.json` stops every command, `setup` included, with exit 2 `❌ backlog: the backlog configuration is the old root file .smooth-backlog.json; move it to .backlog/config.json`.

- [ ] Steps: the stop test first (FAIL); implement; rewrite the five tests; docs; standard proof; commit.

---

### Task 32: The final documentation pass (B29)

**Files:** `src/help.js`, `src/team/help.js`, `COMMANDS.md` (regenerated), `templates/skills/backlog/SKILL.md`, `references/commands.md`, `README.md`, `CHANGELOG.md` (the one `## Unreleased (2.0.0)` section; the bullets merged into the list of breaking changes; no bullet cites a batch), `.agents/docs/plans/2026-11-09-team-rules-engine.md` and its folder and this plan moved to `.agents/docs/plans/completed/`, `.agents/docs/plans/README.md` (index row), `.agents/docs/plans/2026-11-04-pr3-simplification-log.md` (its relative link to the plan).

Decisions: the help, COMMANDS.md and skill text of `new --status` say that `archived` is refused (`backlog archive` moves an item to the archive folder). The pull request text is written outside the repository and is not committed.

- [ ] **Step 1:** read every help text against `COMMANDS.md` and the skill; regenerate.
- [ ] **Step 2:** move the plans; `grep -rn "2026-11-09-team-rules-engine\|2026-11-11-team-rules-engine-remaining-work" .agents/docs AGENTS.md README.md` shows only valid relative links.
- [ ] **Step 3: Verify** the standard proof (`commands-documented.test.js`, `shared-help.test.js`, `shared-no-classes.test.js` among it). **Step 4: Commit.**

---

### Task 33: Final verification

- [ ] **Step 1:** `node --version` prints `v24.`; `npm run check` exits 0.
- [ ] **Step 2:** `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<the private deny-list file> node --test .agents/test/no-private-details.test.js` — 3 pass.
- [ ] **Step 3:** `npm test` — 0 fail.
- [ ] **Step 4:** `FEATURE_LOCATION=local node --test .agents/test/features.test.js` and `FEATURE_LOCATION=remote node --test .agents/test/features.test.js` — 0 fail each, the scenario count of the last task in both.
- [ ] **Step 5:** `grep -rn "teamNew\|installSeam\|wip-limits\|templates/workflows\|--to-repository\|claim-now" src .agents/test features` prints nothing outside `removed-forms.test.js`.
- [ ] **Step 6:** Refresh the recorded decisions and the full scope first (`00-owner-rulings.md`, `design/decisions.md`, this plan and the work items of the branch), then re-validate each question of the section above against them and against the code as it now is; a question a recorded decision settles, or that the finished code no longer raises, is closed with its reason. Only the questions still open are presented, all at once, each with the problem, the options and the implementation pattern of each.
