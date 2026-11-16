# TASK-01: Runtime libraries and the schema files

| | |
|---|---|
| Kind | build |
| Depends on | nothing (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-02, TASK-05, TASK-07, TASK-08, TASK-13, TASK-26 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

## 3. Schemas

Every schema is a JSON Schema of draft 2020-12, checked against the published specification by `backlog validate` (4.5).

### 3.1 The base item: [item.schema.json](../2026-11-14-definition-driven-cli/item.schema.json)

An item is one flat JSON object; [item.example.json](../2026-11-14-definition-driven-cli/item.example.json) fits the schema.

| Property | Required | Given by | Meaning |
|---|---|---|---|
| `seq` | yes | CLI | The item's number in its repository folder; never reused (4.2). |
| `slug` | yes | CLI | The number and the title in file-name form (4.13). |
| `title` | yes | person | Short title. |
| `description` | yes | person | What the item is about, in markdown. |
| `team` | no | person | The team that owns the item; absent when it has none. |
| `repository` | yes | CLI | `owner/name` of the repository the item belongs to. |
| `branch` | yes | CLI | The branch the item belongs to. |
| `created`, `updated` | yes | CLI | Times of creation and of the last change. |
| `updated_by` | yes | CLI | The agent of the command, else the user (4.7). |
| `cli_version` | yes | CLI | The version of the CLI that last wrote the item (4.11). |
| `status` | yes | definition | Declared by every item definition; its values come from the definition. |
| `history` | yes | CLI | One entry per change: `at`, `by`, `session`, `command`, `changes` (each changed property with before and after), `note`. Its structure is fixed in the CLI. |
| any other | no | definition | A field of the definition that applies (4.3). |

### 3.2 The item definition: [item-definition.schema.json](../2026-11-14-definition-driven-cli/item-definition.schema.json)

An item definition is a JSON object whose keys are field names. Each field has a `type` (text, number, boolean, time, person, item, items, list, or `any` for a field with no type and no restricted values) and may have a `default`, its allowed `values`, the values that are `final` (the item is finished; status only) and a `description`. Every definition declares `status`. No field may take the name of a base property. A property that is neither a base property nor declared does not exist: an item holding one does not fit its definition.

A definition comes from one of three places: the `item` of a team in the team file (the team item definition); the file named by `item_definition` in the configuration (the repository's user item definition); the definition packaged with the CLI (3.7).

### 3.3 The team file and the rule set: [team-file.schema.json](../2026-11-14-definition-driven-cli/team-file.schema.json)

The team file holds one entry per team, each with `people` (each person with a list of role words), `item` (the team item definition, 3.2), `rules`, and a `description` of the team's way of working in words. Its location is named in the configuration (`teams_file`; default `.backlog/teams.json`). The CLI only reads it.

`rules` is the team's rule set: its form is [team-rules.schema.json](../2026-11-14-definition-driven-cli/team-rules.schema.json) and its meaning [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md).

### 3.4 The configuration: [config.schema.json](../2026-11-14-definition-driven-cli/config.schema.json)

| Key | Meaning |
|---|---|
| `backlog_repository` | The folder that holds the items, relative to the repository; `.backlog` when they live inside it. |
| `backlog_origin_url` | The address `backlog setup` clones a separate backlog repository from. |
| `user` | The person of the user commands, written by `backlog setup` (git `user.name`, else the login name). |
| `team` | The team a team command acts for when neither flag nor variable names one. |
| `teams_file`, `teams_file_sha` | Where the team file is, and its SHA when last validated. |
| `item_definition` | The repository's user item definition; absent means the packaged one. |
| `archive_folder` | The folder an archived item moves to; default `archive`. |
| `repository_variable`, `branch_variable`, `team_variable`, `agent_variable`, `session_variable` | The names of the environment variables commands read in this repository and branch (4.7). |
| `push-backlog-updates` | true by default: the commits the CLI makes are pushed; false keeps them local. |
| `redact_pii`, `redaction_rules` | Redaction of personal data on or off (default off) and the repository's own redaction rules ([redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md)). |
| `migrated_at`, `migrated_by_version` | When the items were converted to the current form and by which version. |

### 3.5 The index: [index.schema.json](../2026-11-14-definition-driven-cli/index.schema.json)

Per branch, the list of the open items in priority order: number, slug, title and status. The place in the list is the priority; nothing else holds it.

### 3.6 The example team file: [teams.example.json](../2026-11-14-definition-driven-cli/teams.example.json)

Shipped with the CLI, valid against 3.3. Three teams:

- `simple`: one agent; status todo, doing, done; an estimate and a result; six rules (people only, size on creation, the allowed moves of status, one item doing, done needs a result, archive only done); the queue takes the next todo item.
- `advanced`: a lead and three members; status new, ready, active, checking, closed; holder, checker, parent, dependencies; twelve rules, among them permission rules, a relation rule over the dependencies, a rule counting a member's active items, and a lock on the holder of an active item; the queue gives a member its checks first, then takes ready work for it (setting holder and status in one change).
- `lead-and-reviewers`: a lead, members, a reviewer and an outside reviewer; two reviews counted in a field the reviewer raises, hand-off by the holder, waiting for a decision of the lead; fourteen rules; the queue serves reviewers, members and the lead. It is a simplified, generically named form of the owner's team file (6).

Each team's `description` says its way of working in words. The examples guide `docs/team-rules-guide.md` explains every rule, with the change it allows and the change it refuses with its text.

### 3.7 The packaged defaults

- [default-item-definition.json](../2026-11-14-definition-driven-cli/default-item-definition.json): `status` alone, with the values new, active and closed; closed is final; new is the default.
- [default-team.json](../2026-11-14-definition-driven-cli/default-team.json): one team with that definition and three rules: only people of the team act; status moves new to active to closed; only a closed item is archived.
- [default-redaction.json](../2026-11-14-definition-driven-cli/default-redaction.json): the packaged redaction rules ([redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md)).

- **C-40.** Where a widely used and safe library does the job, the CLI uses it and does not build its own: Ajv with ajv-formats for JSON Schema, json-logic-js for rule conditions, re2 for regular expressions.

## Scenarios (BDD)

None of its own.

## Files

- package.json
- schemas/*.json (new: copies of the seven schemas of the specification folder)
- src/shared/schemas.js (new)
- .agents/test/schemas.test.js (new)

## Interfaces

- `validate(name, data) -> Problem[]` where name is one of `item`, `item-definition`, `index`, `team-file`, `team-rules`, `config`, `redaction` and `Problem = {path: string, message: string}`; uses Ajv 8 with ajv-formats, draft 2020-12, `allErrors: true`; `team-file` resolves its reference to `team-rules`.
- `checkSchema(schema) -> Problem[]`: the schema itself against JSON Schema draft 2020-12.

## Unit tests (TDD)

- `every schema is valid draft 2020-12`: `checkSchema` of each file in `schemas/` returns `[]`.
- `the item example fits`: `validate("item", <item.example.json>)` returns `[]`.
- `a missing title is named`: the example without `title` gives one problem whose path or message names `title`.
- `schemas equal the specification`: each file in `schemas/` is byte-equal to the file of the same name in the specification folder.

## Notes

Add to `dependencies` of package.json: `ajv` ^8, `ajv-formats` ^3, `json-logic-js` ^2, `re2` (current major). Run `npm install` and commit package-lock.json.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-01 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-01: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-01: Runtime libraries and the schema files` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-01 | status: DONE or BLOCKED | branch: task/TASK-01 | commit: <sha>
Files changed: <list>
Scenarios written and passing: <ids, or none>
Unit tests written and passing: <names>
npm test: <pass count> pass, <fail count> fail | check: pass | guard: pass
Self review findings fixed: <one line each, or none>
Open: <anything left, with the reason>
```

## Session 2: review (at most 15 minutes, a new session)

A new session reads only this file and the hand-off in the task's backlog item.

1. Load the skills: `requesting-code-review` (its reviewer checklist), `ponytail-review`, `verification-before-completion`.
2. `git switch task/TASK-01`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-01 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
