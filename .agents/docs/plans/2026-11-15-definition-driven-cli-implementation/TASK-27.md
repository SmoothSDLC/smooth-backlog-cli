# TASK-27: Rules engine: the extra operators

| | |
|---|---|
| Kind | build |
| Depends on | TASK-26 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-28, TASK-29, INT-05 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

## 6. Conditions

A condition is JsonLogic: an object with one key, the operator, whose value is the list of operands; operands are literals, `var`, or other operations.

The conditions are evaluated with json-logic-js, the reference implementation of JsonLogic. Every standard operator is accepted, with the semantics of that library: `var`, `missing`, `missing_some`, `if`, `==`, `===`, `!=`, `!==`, `!`, `!!`, `or`, `and`, `>`, `>=`, `<`, `<=` (also with three operands, between), `in` (in a list, or a text in a text), `cat`, `substr`, `+`, `-`, `*`, `/`, `%`, `min`, `max`, `map`, `filter`, `reduce`, `all`, `some`, `none`, `merge`. `==` and `!=` convert between types as JavaScript does; rules should use `===` and `!==`, and validation reports `==` and `!=` as a warning.

Extra operators, for what JsonLogic lacks, added to the library with its `add_operation` before each evaluation (so `changed`, `item` and `outer` can read the change being evaluated). The library evaluates the operands of an added operator before calling it, so an added operator cannot test each element of a list itself; counting uses the standard `filter` with `length`:

| Operator | Form | Gives |
|---|---|---|
| `changed` | `{"changed": "status"}` | true when the property's value differs between `prev` and `next`, lists and objects compared by content |
| `item` | `{"item": number}` | the open or archived item of the team with that number, or `null` |
| `length` | `{"length": list or text}` | the number of elements or characters; with `filter`, how many elements satisfy a condition: `{"length": {"filter": [list, condition]}}` |
| `roles_of` | `{"roles_of": person}` | the role words of a person of the team, or an empty list |
| `regex` | `{"regex": [text, pattern]}` | true when the text matches; patterns are matched in linear time by the `re2` package |
| `age` | `{"age": time}` | seconds from the time to `now` |
| `outer` | `{"outer": "next.holder"}` | inside `map`, `filter`, `reduce`, `all`, `some` or `none`, where `var` reads the element, reads a path of the whole context |

An empty list or `null` is false, anything else true, as in JsonLogic.

## Scenarios (BDD)

None of its own.

## Files

- src/team/engine.js
- .agents/test/engine.test.js

## Interfaces

- Registers `changed`, `item`, `roles_of`, `regex` (with `re2`), `age`, `outer` and `length` before each evaluation, reading the change being evaluated.

## Unit tests (TDD)

- `changed compares content`: two equal lists give false.
- `outer inside filter`: `{"outer": "caller.name"}` reads the caller inside `filter`.
- `length with filter`: counts the matching items.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-27 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-27: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-27: Rules engine: the extra operators` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-27 | status: DONE or BLOCKED | branch: task/TASK-27 | commit: <sha>
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
2. `git switch task/TASK-27`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-27 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
