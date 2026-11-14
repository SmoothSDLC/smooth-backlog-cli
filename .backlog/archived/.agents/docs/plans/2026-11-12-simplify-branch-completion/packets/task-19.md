# Task 19: The tests that set the team variable (B20b)


## 1. Goal & Scope

Goal: no test runs a user command with `SMOOTH_BACKLOG_CLI_TEAM_NAME` set unless it asserts the guard's stop; `plain-team-env.test.js` proves that user commands stop under the variable and still ignore the other team variables without it; the fixture helper clears the variable for user-command runs.

Out of scope: the guard code (Task 18); tests that run `backlog team ...` with the variable (they stay); the `move --to-repository` test of the same file (Task 20 deletes it).

Specification: Task 19 of `.agents/docs/plans/completed/2026-11-11-team-rules-engine-remaining-work.md`. Use-case rows: 1 after the re-assignments named in section 6, which are made (list them with `awk -F'\t' '$6=="Task 19"' .agents/docs/plans/2026-11-12-simplify-branch-completion/use-case-status.tsv`; the command prints nothing). The behaviour this task changes is pinned by row `BDD-3-15`, which the table assigns to Task 18: see section 6.

## 2. Architectural Decision Rules

- Plan, Task 19: "`.agents/test/plain-team-env.test.js` (rewritten: user commands stop under the variable), `.agents/test/env-prefix.test.js`, `.agents/test/shared-query.test.js`, `.agents/test/shared-severity.test.js`, `.agents/test/shared-fixtures.js` (`env()` removes `SMOOTH_BACKLOG_CLI_TEAM_NAME` for user-command runs; tests that want it pass it), and every other file `grep -rln SMOOTH_BACKLOG_CLI_TEAM_NAME .agents/test features` finds. Steps: grep; rewrite; each changed expectation named in the commit body; standard proof; commit."
- BDD plan, section 3 table row: ".agents/test/plain-team-env.test.js | 7 | 7 | team behaviour 7 | B20 rewrite: the team variable now stops every user command (today user commands ignore it)".
- Command text of the batch (`.agents/docs/plans/2026-11-09-team-rules-engine/implementation/00-priority-order.md`, B20): "Proof: ... .agents/test/plain-team-env.test.js rewritten (today it proves that user commands ignore the team variable). Unrelated-file risk: low, but every existing test that sets the team variable and then runs a user command must unset it."
- Specification B20b: "`.agents/test/plain-team-env.test.js` (rewritten: today it proves that user commands ignore the variable; it now proves they stop), `.agents/test/env-prefix.test.js`, `.agents/test/shared-query.test.js`, `.agents/test/shared-severity.test.js`, `.agents/test/shared-fixtures.js` (the helper `env()` removes the variable for user-command runs by default and the few tests that want it pass it), and any other file a search for `SMOOTH_BACKLOG_CLI_TEAM_NAME` finds that survives B14. Each changed expectation is named in the report." Breaking change: "a session that sets the team variable can no longer run any user command, `backlog setup` and `backlog upgrade` included; its agent uses `backlog team ...` only."
- Owner rulings R19a: "When the TEAM_NAME variable is set, every user command fails ... The text is a blanket failure with no instruction for the agent: teams are not allowed to use user commands." R19A-03 (rule cases): an empty variable "names no team, so it does not block".
- Plan Global Constraints: "No test is deleted, skipped or weakened except where its task names it. A test whose expectation changes is named in the commit body with the reason." and "no file outside `src/team/` names a team variable (`.agents/test/team-boundary.test.js`)" (the boundary test's own `NAMES` regex, line 154, and its mutation at line 188 name the variable on purpose: leave them).

## 3. BDD Acceptance Criteria

No feature scenario. Unit and integration Given/When/Then, from the rewritten test file's subject (the seven old tests: `new`, `update`, `query`/list, `archive`, `move`, order, unreadable team configuration):
1. Given `SMOOTH_BACKLOG_CLI_TEAM_NAME=t1` with the other team variables set (`SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY=acme/other`, `SMOOTH_BACKLOG_CLI_TEAM_BRANCH=nowhere`, `SMOOTH_BACKLOG_CLI_TEAM_LEAD=lead`), When `new`, `update`, `list`, `archive`, `move --to-branch` and the priority update run, Then each exits 2 with `❌ backlog: teams are not allowed to use user commands` and writes nothing. (source: "When the TEAM_NAME variable is set, every user command fails")
2. Given the same variables WITHOUT `SMOOTH_BACKLOG_CLI_TEAM_NAME`, When the same commands run, Then each behaves as the old tests asserted (item filed under this repository and branch, an item outside the bound repository and branch edited, listed, archived, ordered; an unreadable team file is never read by a user command, and `backlog team query --team t1` reports `.backlog/teams.json cannot be read`). (source: "every existing test that sets the team variable and then runs a user command must unset it")
3. Given `.agents/test/shared-severity.test.js` line 49 (`update 1 --severity critical` with `SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1'`, expecting exit 1 for another team's item), When the variable is removed, Then the test keeps its meaning through the item of another team being unseen (exit 1) without the variable, or asserts the guard (exit 2) with it; name the changed expectation in the commit body (source: "Each changed expectation is named in the report." and "every existing test that sets the team variable and then runs a user command must unset it").

## 4. Target Files & Existing Helpers

Verified at the head (`grep -rln SMOOTH_BACKLOG_CLI_TEAM_NAME .agents/test features src`): test files `shared-severity.test.js`, `team-update.test.js`, `team-cli.test.js`, `team-validate.test.js`, `team-query.test.js`, `team-boundary.test.js`, `env-prefix.test.js`, `team-new.test.js`, `team-validate-folder.test.js`, `plain-team-env.test.js`, and the fixture `.agents/test/fixtures/team-rules/rule-cases.json` (R19A-01 itself); no file of `features/`. `shared-query.test.js` does not name the variable at the head: check it again at the start and edit it only if it runs a user command with the variable. Source files naming it: `src/team/*` only.
- `.agents/test/shared-fixtures.js`: `env(tmp)` lines 97-106 returns `{ ...GIT_IDENTITY, SMOOTH_BACKLOG_CLI_HOME, XDG_CONFIG_HOME, SMOOTH_BACKLOG_CLI_ORIGIN_URL }`; `cli(args, opts)` lines 110-120 spawns with `env: { ...process.env, SMOOTH_BACKLOG_CLI_AGENT: ..., ...(opts.tmp ? env(opts.tmp) : {}), ...opts.env }` (so a developer's inherited variable leaks today).
- Precedent to reuse: `.agents/test/team-fixture.js` lines 18-19: `const TEAM_VARIABLES = ['TEAM_NAME', 'TEAM_REPOSITORY', 'TEAM_BRANCH', 'AGENT', 'SESSION'].map(n => `SMOOTH_BACKLOG_CLI_${n}`); const quiet = Object.fromEntries(TEAM_VARIABLES.map(k => [k, '']));` — an empty value is the "removed" form (an empty value does not block and names no team).
- `.agents/test/plain-team-env.test.js`: header comment lines 1-3, `BOUND` line 13, `fixture()` 15-22, `plain`, `ok`, `rows` helpers 23-27, the seven tests lines 29-83 (`move ... --to-repository` at 58-62 is deleted by Task 20; here rewrite it to `move --to-branch`).

Interfaces.
- Consumes (Task 18): the guard's exact text and its exit code 2.
- Produces: `env(tmp)` adds `SMOOTH_BACKLOG_CLI_TEAM_NAME: ''` (first in the object, so `opts.env` still overrides it); a test that wants the variable passes it in `opts.env`.

## 5. TDD Execution & Verification

Start: run `grep -rln SMOOTH_BACKLOG_CLI_TEAM_NAME .agents/test features` and list each file with its classification (runs only team commands: unchanged; runs a user command with the variable: rewritten).

Failing tests first (they fail because the fixture still leaks and the old tests expect success):
- `plain-team-env.test.js`: NEW `every user command stops under the variable and writes nothing` (criterion 1; compare the folder before and after); the other six tests keep their names with `BOUND` reduced to the three variables that are not `..._TEAM_NAME` (criterion 2); the `move` test uses `--to-branch`. Mutation: removing the guard call makes the first test fail; making `env()` leak makes none fail, so also add `shared-fixtures.test.js`'s existing test or a new assertion `env('<tmp>').SMOOTH_BACKLOG_CLI_TEAM_NAME === ''`.
- `shared-fixtures.js` `env()` change, then `shared-severity.test.js:49` and `env-prefix.test.js` (its team `pop` runs are team commands: unchanged) adapted as criterion 3 says.

Docs: none (no behaviour change; Task 18 documented the guard).

Commands that must pass: `npm run check` (exit 0); `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<the private deny-list file> node --test .agents/test/no-private-details.test.js` (3 pass); `flock <suite lock file> node --test .agents/test/*.test.js` (fail 0); `flock <suite lock file> env FEATURE_LOCATION=local node --test .agents/test/features.test.js` and `FEATURE_LOCATION=remote` (fail 0). Each changed expectation named in the commit body.

## 6. Must-not and Carry pointers

Must not: delete or skip a test; remove the variable from a test that runs a team command; edit `team-boundary.test.js`'s name list; add code to `src/`.

Carry pointers: the execution review record's Task 4 note on shared fixtures: "createdSlug/TEAM_* kept (importers remain)" (do not touch `createdSlug`/`TEAM_VALUE`; Tasks 9, 12, 13 keep them). review record, Task 10: the feature step that reads a team item uses `backlog team query <item> --json` (unchanged). Global: "No test is deleted, skipped or weakened except where its task names it" (this task names `plain-team-env.test.js` and the `shared-severity.test.js` line).

Use-case rows not delivered by this task's text: none are assigned to it. `BDD-3-15` (".agents/test/plain-team-env.test.js | 7 | 7 | team behaviour 7 | B20 rewrite: the team variable now stops every user command (today user commands ignore it)"), assigned to Task 18, is delivered by this task's rewrite of `plain-team-env.test.js` (test `every user command stops under the variable and writes nothing`); the plan's maintainer re-assigns the row to Task 19, and the implementer of this task moves it to DONE with that test.
