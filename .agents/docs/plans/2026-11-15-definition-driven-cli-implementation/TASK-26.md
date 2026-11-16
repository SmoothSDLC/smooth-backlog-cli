# TASK-26: Rules engine: evaluating a change

| | |
|---|---|
| Kind | build |
| Depends on | TASK-01 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-27, INT-05 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

## 2. The change: what triggers the rules

Every team command that would change an item builds a **change**: the item as it is (`prev`) and the item as it would be (`next`). Every rule is evaluated against every change.

| Command | `command` | `prev` | `next` |
|---|---|---|---|
| `backlog team new` | `new` | `null` | the new item: base properties, the definition's defaults, the given title, description and fields |
| `backlog team update <item> <property> <value>` | `update` | the item | the item with that property set |
| `backlog team archive <item>`, `archive done` (item by item) | `archive` | the item | the item, unchanged |
| `backlog team import`, `branch import` (item by item) | `move` | the item | the item with its new `branch` |
| `backlog team pop` with `take` (9) | `update` | the item | the item with the values of `take` |

Reading commands (`list`, `show`, `query`) make no change and trigger nothing. A change of priority triggers nothing: priority is not a property of the item.

## 3. The evaluation of a change

1. **Structure.** `next` must fit the item schema and the team item definition: every required property set, every value of its field's type, a value of a field with `values` one of them. Failures are returned like rule errors.
2. **Rules.** For every rule: if `when` is absent or true, `require` must be true; if it is false, the rule fails. Every rule is evaluated, also after a failure.
3. **Result.** No failure: `next` is written as one change of the item, with one history entry (command, caller, every changed property with before and after). Any failure: nothing is written and the command fails with every failing rule's error (10).

Rules have no order and no hierarchy: each is true or false of the same change, and all must be true, so the order of reading cannot change the result. `--whatif` evaluates and writes nothing.

## 4. A rule

| Key | Required | Meaning |
|---|---|---|
| `id` | no | A number or short text, used only by validation to name the rule; when absent, validation names it by its place (`rules[4]`). |
| `description` | no | Words for people: what the rule protects. |
| `when` | no | A condition (6): the changes the rule concerns. Absent: every change. |
| `require` | yes | A condition that must hold for the change when `when` holds. |
| `error` | yes | The text returned when `require` fails (10). |

## 5. The evaluation context

A condition reads the change through `{"var": "<path>"}`:

| Path | Value |
|---|---|
| `prev.<property>` | the property before the change; `prev` is `null` for `new` |
| `next.<property>` | the property after the change |
| `command` | `new`, `update`, `archive` or `move` |
| `changed` | the list of properties whose value differs between `prev` and `next` (every property set, for `new`) |
| `caller.name`, `caller.roles` | the agent of the command and its role words in the team (an empty list for someone not of the team) |
| `team.name`, `team.people`, `team.items` | the team, its people (name to role words), and its open items of the branch, the changed item as it would be |
| `session.id` | the session given to the command |
| `now` | the time of the command |

A property is a base property or a field of the team item definition; any other path is reported by validation (11).

## 10. Error texts

`error` is the text the caller sees. Values may be put in with `{...}` and a path of 5: `{prev.status}`, `{next.estimate}`, `{caller.name}`; a path that cannot be read gives an empty text. A refusal returns every failing rule, with the property it concerns, and what to do: in JSON (the default of team commands) `{"refused": [{"rule": "<id or place>", "property": "<property>", "error": "..."}], "fix": "change the properties named and run the command again"}`; with `--human`, one line per failing rule followed by what to do. A rule's `error` says why the change is refused and, where it can, what would make it allowed.

## Scenarios (BDD)

- *T-RULE-1. Every rule is evaluated on every change: `backlog team update 7 estimate 90` on a ready item fails rule `size` (at most 60) although the status does not change.
- *T-RULE-3. Several failures: a change that fails two requirements returns both messages, in JSON `{"refused": [...]}`, and with `--human` one line each.

## Files

- src/team/engine.js (new)
- .agents/test/engine.test.js

## Interfaces

- `evaluateChange({prev, next, command, caller, session}, team, now) -> {ok: true} | {ok: false, refused: [{rule, error}]}` with json-logic-js: builds the context of section 5, evaluates every rule (`when` absent or truthy, then `require`), collects every failure, fills `{path}` in `error`. `team = {name, people, items, rules, lookup}`.

## Unit tests (TDD)

- `all failures`: a change failing two rules returns both, in rule order.
- `error text`: `{next.estimate}` becomes the number.
- `when absent`: a rule with no `when` is evaluated on every change.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-26 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-26: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-26: Rules engine: evaluating a change` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-26 | status: DONE or BLOCKED | branch: task/TASK-26 | commit: <sha>
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
2. `git switch task/TASK-26`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-26 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
