# 04 — BDD specification

The scenarios are in `features/*.feature` (15 files). Every scenario carries two tags: `@REQ-nnn` (the requirement of `03-spec.md`) and `@S-nnn-k` (its id); conditional scenarios also carry `@conditional @Q-nn`. The validator inputs are two Scenario Outlines in `features/validator-keys.feature` whose Examples rows are the ids `S-013-1..S-013-<n>` (n in §6) (one row per structural message form, per semantic rule V-01..V-30 and per entry rule E-01..E-08).

## 1. Style

The files follow the repository style (`features/*.feature`, runner `features/support/gherkin.js`, steps `features/steps/cli.js`): every check goes through the CLI (`backlog show --json`, `backlog list --json`), a scenario is a user sequence of commands, and each scenario sets up what it needs (no Background, so that a scenario can be read alone). Both locations run them (local `.backlog` and a backlog repository), as `features.test.js` does today.

## 2. Changes to the runner (`features/support/gherkin.js`), test-first in PH-0

1. **Tags**: a line of `@word` tokens before `Scenario:`/`Scenario Outline:` is attached to the next scenario (today: an unreadable line).
2. **Scenario Outline + Examples**: the outline is expanded once per Examples row, `<column>` replaced in every step; the scenario name gets the row's `id` column.
3. **Conditional scenarios**: a scenario tagged `@conditional @Q-nn` runs only when `features/answers.json` maps `Q-nn` to the option the scenario is written for (the scenario name starts with `A:`, `B:` or `C:`); otherwise it is reported as skipped with its reason. `answers.json` starts empty and is filled when the owner answers.
4. **Template token**: inside `I run \`...\``, `<template:name>` is replaced by the absolute path of `templates/team-behaviour/<name>` of the checkout.

Tests for the runner: `.agents/test/features.test.js` gains three cases (tags kept, outline expanded with ids, conditional skipped/run by answers.json).

## 3. Steps reused unchanged

`a repository with a backlog`; `the environment <VAR> is "<value>"`; `I act as agent "<name>"`; `I run \`...\``; `I run \`...\` and answer "<text>"`; `an item "<name>" exists`; `I have read item <n>`; `the team configuration is a committed file`; `I define the team from the JSON \`...\``; `a branch "<b>" exists on the origin`; `the command succeeds`; `the command fails with exit code <n>`; `the output contains "<text>"`; `the output does not contain "<text>"`; `the JSON output has <n> item(s)`; `item <n> has <field> "<value>"`; `item <n> body contains "<text>"`; `item <n> does not exist`; `the queue is empty`.

## 4. Steps changed

- `a team "<t>" with lead "<l>" and members "<m>"` (old form, used by `team.feature`, `team-flow.feature`): from PH-3a it writes the schema 2 entry `{"workflow": "team", "people": {"lead": ...}, "lists": {"members": [...]}}` and, when `workflows.json` has no `team`, first registers `templates/team-behaviour/team.json` through `backlog team workflow --file` (so the existing features keep running after the switch).
- `team "<t>" work needs <n> pass(es) by "<x>"...`, `team "<t>" reviews in the stages "..."`, `team "<t>" has the external reviewers "..."`, `team "<t>" refinements are reviewed by "..."`: write the schema 2 entry keys (`review` with `team`, `review`, `external_reviewers`, `refinement_review`).

## 5. New steps (exact text; implement in `features/steps/cli.js`)

| step | does |
|---|---|
| `the backlog registers the workflow "<w>" from the template "<file>"` | runs `backlog team workflow --file` on a copy of `templates/team-behaviour/<file>` whose `workflow` is set to `<w>`; asserts exit 0 |
| `the backlog registers the workflow "<w>" from the template "<file>" with \`<patch>\`` | as above after applying the patch: `path = json` pairs separated by ` ; `, `path` dotted (array index as a number, a key with spaces written as is), value `<delete>` removes the key |
| `a team "<t>" with lead "<l>" and members "<m>" using the workflow "<w>"` | adds the schema 2 entry `{workflow, people: {lead}, lists: {members}}` to `teams.json` in the home (committed and pushed in the backlog-repository location) |
| `team "<t>" has the entry key <key> set to \`<json>\`` | sets that key of the entry (committed) |
| `the file "<name>" of the backlog home is \`<text>\`` | writes the raw text (may be invalid JSON) and commits it |
| `the file "<name>" of the backlog home has the JSON value "<v>" at "<path>"` | reads the file from the home after a pull; the dotted path's value (strings compared as text, numbers as numbers) equals `<v>` |
| `item <n> has the front-matter fields \`<json>\`` | test setup: merges the fields into the item file's front matter in the repository that holds the items, commits and pushes (as the existing "damaged status" step does) |
| `item <n> has a definition of done in its body` | appends `## Definition of done\n- [ ] it works` to the body the same way |
| `I take a snapshot of the backlog repository` / `the backlog repository is unchanged since the snapshot` | records every file and the HEAD and origin refs of the repository that holds the items / compares them |
| `a definition file "<path>" from the template "<file>" with \`<patch>\`` | writes the patched template to `<path>` in the test's temporary folder (outside the backlog); an empty patch copies it |
| `a file "<path>" outside the backlog contains \`<json>\`` | writes the text to `<path>` in the temporary folder |
| `HEAD is detached` | `git checkout --detach` in the consumer repository |
| `the configuration key <key> is \`<json>\`` | sets the key in `.backlog/config.json` of the consumer repository and commits it |
| `item <n> has no recorded events` | removes the item's history section from its file (setup) |
| `item <n> body does not contain "<text>"` | negation of the existing body step |
| `team "<t>" has the entry list <k> set to \`<json>\`` | sets `lists.<k>` of the entry (committed); revision 4, generic entry (D-21) |
| `team "<t>" has the entry rule <k> set to \`<json>\`` | sets `rules.<k>` of the entry (committed) |
| `item <n> has <field> containing "<text>"` | the field (a list or text) contains the text |
| `the item "<x>" of repository "<owner>/<repo>" is bound to team "<t>" with the front-matter fields \`<json>\`` | creates the item in that repository folder of the home with `team` and the fields (setup) |
| `a file "<path>" outside the backlog is the fixture "<name>"` | copies `.agents/test/fixtures/team-behaviour/<name>` to `<path>` |
| `the backlog registers the workflow "<w>" from the template "<file>" with \`<patch>\`` | (exists above) also used with `minimal.json` |

## 6. Coverage: requirement → scenarios

| REQ | title | scenarios | covered without a scenario |
|---|---|---|---|
| REQ-001 | Registry files and their shape | S-001-1, S-001-2 |  |
| REQ-002 | Schema identity and version check | S-002-1, S-002-2, S-002-3 |  |
| REQ-003 | Discovery: only the backlog home, no shipped fallback | S-003-1 |  |
| REQ-004 | Validate once per process, then cache | S-004-1 |  |
| REQ-005 | Missing files and unknown teams | S-005-1, S-005-2 |  |
| REQ-006 | Invalid files fail closed | S-006-1, S-006-2, S-006-3 |  |
| REQ-007 | backlog team validate | S-007-1, S-007-2, S-007-3 |  |
| REQ-008 | backlog team validate --file | S-008-1, S-008-2 |  |
| REQ-009 | Registration of a behaviour definition | S-009-1, S-009-2 |  |
| REQ-010 | team define validates against the referenced workflow | S-010-1, S-010-2, S-010-3 |  |
| REQ-011 | backlog team migrate | S-011-1, S-011-2, S-011-3, S-011-4, S-011-5, S-011-6 |  |
| REQ-012 | JSON Schema subset interpreter | — | tests T-012-1, T-012-2, T-012-3, T-012-4 |
| REQ-013 | Semantic validation rules | S-013-1..S-013-63 |  |
| REQ-014 | Shipped templates | S-014-1, S-014-2 |  |
| REQ-015 | Redefinition of a team or workflow in use | S-015-1 |  |
| REQ-101 | Status vocabulary, initial and finished words | S-101-1, S-101-2, S-101-3 |  |
| REQ-102 | Side statuses | S-102-1 |  |
| REQ-103 | Step catalogue and undefined steps | S-103-1, S-103-2 |  |
| REQ-104 | From check | S-104-1, S-104-2, S-104-3 |  |
| REQ-105 | To resolution | S-105-1, S-105-2, S-105-3 |  |
| REQ-106 | Writes: sets, clears, appends, value sources | S-106-1, S-106-2 |  |
| REQ-107 | Body records | S-107-1, S-107-2 |  |
| REQ-108 | Arguments | S-108-1, S-108-2 |  |
| REQ-109 | Evaluation order and refusal contract | S-109-1 |  |
| REQ-110 | One step per call; combinable and exclusive steps | S-110-1, S-110-2, S-110-3 |  |
| REQ-111 | Session end and notices | S-111-1, S-111-2 |  |
| REQ-112 | team update on an unbound item | S-112-1, S-112-2, S-112-3 |  |
| REQ-113 | A set-status step (S29b) | S-113-1, S-113-2 |  |
| REQ-114 | Blocking a session after it ended (S82) | S-114-1 |  |
| REQ-201 | Roles from sources | S-201-1, S-201-2 |  |
| REQ-202 | by and not_by | S-202-1, S-202-2 |  |
| REQ-203 | The actor of a step | S-203-1 |  |
| REQ-204 | A caller acts only as itself | S-204-1 |  |
| REQ-205 | Same worker (session continuation) | S-205-1, S-205-2 |  |
| REQ-206 | The lead comes only from the team entry | S-206-1, S-206-2 |  |
| REQ-207 | Session scope and session team | S-207-1, S-207-2 |  |
| REQ-208 | Items of another repository | S-208-1, S-208-2 |  |
| REQ-209 | Team entry names | S-209-1 |  |
| REQ-301 | Conditions: shape, when, unless, force, order | S-301-1, S-301-2 |  |
| REQ-302 | Field conditions | S-302-1 |  |
| REQ-303 | The claim step of the template | S-303-1, S-303-2, S-303-3 |  |
| REQ-304 | Release, waiting, waiting-done, reassign | S-304-1, S-304-2, S-304-3 |  |
| REQ-305 | Waiting cleared by the next step | S-305-1 |  |
| REQ-306 | Recheck at publication | — | tests T-306-1 |
| REQ-307 | Hand-off record step | S-307-1 |  |
| REQ-308 | Accept and reject a hand-off | S-308-1 |  |
| REQ-309 | The close gate | S-309-1, S-309-2 |  |
| REQ-401 | Review stages | S-401-1, S-401-2 |  |
| REQ-402 | Entry review rules and defaults | S-402-1 |  |
| REQ-403 | Request review | S-403-1 |  |
| REQ-404 | Start review, verdicts, passes, history | S-404-1, S-404-2, S-404-3 |  |
| REQ-405 | Review rules at the close | S-405-1 |  |
| REQ-406 | Author session and citation | S-406-1 |  |
| REQ-407 | Stale reviews and reassign-review | S-407-1 |  |
| REQ-408 | The close step | S-408-1, S-408-2 |  |
| REQ-501 | Refinement steps | S-501-1, S-501-2 |  |
| REQ-502 | Refinement reviewers from the entry | S-502-1 |  |
| REQ-503 | Owner decisions | S-503-1 |  |
| REQ-504 | Edit rules | S-504-1, S-504-2, S-504-3, S-504-4, S-504-5, S-504-6, S-504-7, S-504-8, S-504-9, S-504-10 |  |
| REQ-505 | Completeness | S-505-1, S-505-2 |  |
| REQ-601 | Limit numbers in the team entry | S-601-1, S-601-2 |  |
| REQ-602 | What counts and whose it is | S-602-1, S-602-2 |  |
| REQ-603 | within_limits evaluation and text | — | tests T-603-1 |
| REQ-604 | The override | S-604-1, S-604-2 |  |
| REQ-605 | The wip view | S-605-1, S-605-2 |  |
| REQ-701 | Dependencies finished | S-701-1 |  |
| REQ-702 | Creation (team new) | S-702-1, S-702-2, S-702-3, S-702-4 |  |
| REQ-703 | Binding an item (set-team) | S-703-1, S-703-2 |  |
| REQ-704 | Dependency integrity stays generic | S-704-1 |  |
| REQ-801 | Predicate evaluator | — | tests T-801-1 |
| REQ-802 | team pop from queue.roles | S-802-1, S-802-2, S-802-3 |  |
| REQ-803 | The lead's work item | S-803-1 |  |
| REQ-804 | team query --plan from queue.plan | S-804-1 |  |
| REQ-805 | Team views | S-805-1, S-805-2 |  |
| REQ-806 | Chunk scope in the entry | S-806-1 |  |
| REQ-901 | The binding port and user_commands | S-901-1, S-901-2, S-901-3, S-901-4 |  |
| REQ-902 | The user-command code enforces nothing | S-902-1, S-902-2 |  |
| REQ-903 | Refusal and instruction tables | S-903-1, S-903-2 |  |
| REQ-904 | The hard-code allow-list | — | tests T-904-1, T-904-2 |
| REQ-905 | Guard tests | — | tests T-905-1, T-905-2, T-905-3 |
| REQ-906 | Documentation of every key | — | tests T-906-1, T-906-2 |
| REQ-907 | Conformance of the shipped template | — | tests T-907-1 |
| REQ-908 | Default words of the user commands | S-908-1, S-908-2, S-908-3, S-908-4 |  |
| REQ-909 | Holding flags of the user commands refuse nobody | S-909-1, S-909-2 |  |
| REQ-910 | No limits and no dependency gate outside a team | S-910-1 |  |
| REQ-911 | Session inputs (CONDITIONAL Q-04) | — | tests T-911-1 |
| REQ-912 | Keys the old definition declared but nothing enforced (CONDITIONAL Q-05) | S-912-1 |  |
| REQ-920 | Read one chosen branch (decision AR) | S-920-1, S-920-2 |  |
| REQ-921 | list branches columns | S-921-1 |  |
| REQ-922 | Import every unarchived item | S-922-1 |  |
| REQ-923 | Several section lines in one call | S-923-1 |  |
| REQ-924 | Skill copies refreshed after a version change | S-924-1 |  |
| REQ-925 | Exit-code contract | S-925-1, S-925-2 |  |
| REQ-926 | Detached HEAD | S-926-1 |  |
| REQ-927 | Items waiting on dependencies | S-927-1 |  |
| REQ-940 | Interactive creation and the update notice stay | S-940-1 |  |
| REQ-930 | A lead-only deletion door for team items (CONDITIONAL Q-06) | S-930-1 |  |
| REQ-931 | Moving team items (CONDITIONAL Q-07) | — | tests T-931-1 |
| REQ-932 | Abandoning an unfinished team item (CONDITIONAL Q-08) | S-932-1 |  |
| REQ-933 | Interactive value of update (CONDITIONAL Q-09) | S-933-1 |  |
| REQ-934 | JSON envelope (CONDITIONAL Q-10) | S-934-1 |  |
| REQ-935 | JSON error object (CONDITIONAL Q-11) | S-935-1 |  |
| REQ-936 | User environment fallbacks (CONDITIONAL Q-12) | S-936-1 |  |
| REQ-937 | Selecting an item by its queue position (CONDITIONAL Q-13) | S-937-1 |  |
| REQ-938 | History of items written before the event move (CONDITIONAL Q-14) | S-938-1 |  |
| REQ-939 | Update notice timing (CONDITIONAL Q-15) | — | tests T-939-1 |
| REQ-016 | Which workflow the running team uses after the migration (CONDITIONAL Q-16) | S-016-1 |  |
| REQ-017 | Items bound to teams that have no entry (CONDITIONAL Q-17) | S-017-1 |  |
| REQ-018 | Archived items with schema 1 fields (CONDITIONAL Q-18) | S-018-1 |  |
| REQ-019 | Split slices without a team (CONDITIONAL Q-19) | S-019-1 |  |
| REQ-020 | Upgrading a definition used by teams with open items (CONDITIONAL Q-20) | S-020-1 |  |
| REQ-807 | Which items a team re-orders | S-807-1, S-807-2 |  |
| REQ-928 | Rows of list --json outside a team | S-928-1 |  |
| REQ-941 | Team commands own their path | — | tests T-941-1 |

Totals: 248 scenario ids (185 scenarios and 63 outline rows) for 114 requirements; 17 requirements are conditional on owner questions; requirements without a scenario are proved by unit tests only (named in the last column).

## 7. The user-command guarantee as behaviour

`features/user-guarantee.feature` proves from the outside what the guard tests prove in the source: user `update --status` stores any word (S-902-2), user `new` writes no team key and no definition-of-done placeholder (S-902-1), a user command meets a bound item only through the file (S-901-1..4), and invalid team files never affect unbound items (S-005-2, S-006-2 for the bound case).

## 8. Upgrade (migrate-or-fail) as behaviour

`features/team-migrate.feature` (S-011-1..3) and the schema-1 scenarios of `team-file.feature` (S-002-1, S-002-2) prove that an old backlog fails with the migrate message and that `backlog team migrate` converts it once, idempotently, without touching unbound items.
