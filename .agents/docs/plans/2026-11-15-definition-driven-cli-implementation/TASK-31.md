# TASK-31: The example teams give the stated results

| | |
|---|---|
| Kind | build |
| Depends on | TASK-28, TASK-30 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | INT-05, TASK-41, TASK-49 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 187 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- TASK-28 (backlog item 184): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-30 (backlog item 186): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

## Required reads (before any work, in this order)

1. `AGENTS.md` of the repository.
2. This task in its backlog item, with every line already in its Handoff section.
3. The hand-off of each task of "Depends on", in its backlog item.
4. The sections below; the specification text they need is copied into "Requirements". Open [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md) or the other specification files only for a section this task names.
5. Every file of "Files" that already exists.

## Skills (load by installed name)

- Session 1: `backlog`, `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
- Session 2: `backlog`, `requesting-code-review`, `ponytail-review`, `verification-before-completion`.

## Requirements (copied from the specification)

### 3.6 The example team file: [teams.example.json](../2026-11-14-definition-driven-cli/teams.example.json)

Shipped with the CLI, valid against 3.3. Three teams:

- `simple`: one agent; status todo, doing, done; an estimate and a result; six rules (people only, size on creation, the allowed moves of status, one item doing, done needs a result, archive only done); the queue takes the next todo item.
- `advanced`: a lead and three members; status new, ready, active, checking, closed; holder, checker, parent, dependencies; twelve rules, among them permission rules, a relation rule over the dependencies, a rule counting a member's active items, and a lock on the holder of an active item; the queue gives a member its checks first, then takes ready work for it (setting holder and status in one change).
- `lead-and-reviewers`: a lead, members, a reviewer and an outside reviewer; two reviews counted in a field the reviewer raises, hand-off by the holder, waiting for a decision of the lead; fourteen rules; the queue serves reviewers, members and the lead. It is a simplified, generically named form of the owner's team file (6).

Each team's `description` says its way of working in words. The examples guide `docs/team-rules-guide.md` explains every rule, with the change it allows and the change it refuses with its text.

## 7. Kinds of rule, with examples

All rules have the form of 4; the kinds differ only in what `when` and `require` read.

### 7.1 Transition: what must hold for a field to go from one value to another

"From `new` to `reviewed`, `holder` must be set, `acceptance` must not be empty and `estimate` must be 60 or less."

```json
{"when": {"and": [{"===": [{"var": "prev.status"}, "new"]}, {"===": [{"var": "next.status"}, "reviewed"]}]},
 "require": {"and": [{"!!": {"var": "next.holder"}}, {"!!": {"var": "next.acceptance"}}, {"<=": [{"var": "next.estimate"}, 60]}]},
 "error": "from new to reviewed: holder set, acceptance written, estimate at most 60"}
```

Rules refuse; they do not list permitted moves. To allow only some moves, one rule refuses every other:

```json
{"when": {"changed": "status"},
 "require": {"in": [{"cat": [{"var": "prev.status"}, ">", {"var": "next.status"}]}, ["new>active", "active>closed"]]},
 "error": "status moves new to active to closed only"}
```

### 7.2 Field: what must always hold

```json
{"require": {"<=": [{"var": "next.estimate"}, 120]}, "error": "an item is at most 120 minutes of work; split it"}
```

### 7.3 Lock: a field that may no longer change

```json
{"when": {"and": [{"in": [{"var": "prev.status"}, ["active", "closed"]]}, {"changed": "acceptance"}]},
 "require": false, "error": "acceptance is locked once an item is active; split the item instead"}
```

### 7.4 Permission: who may make a change

```json
{"require": {"!!": {"var": "caller.roles"}}, "error": "the caller is not a person of the team"}
{"when": {"===": [{"var": "next.status"}, "closed"]}, "require": {"in": ["lead", {"var": "caller.roles"}]}, "error": "only a lead closes an item"}
```

### 7.5 Relation: a condition over other items

"An item becomes active only when every item it depends on is closed." "A member holds one active item."

```json
{"when": {"and": [{"changed": "status"}, {"===": [{"var": "next.status"}, "active"]}]},
 "require": {"all": [{"map": [{"var": "next.depends_on"}, {"item": {"var": ""}}]}, {"===": [{"var": "status"}, "closed"]}]},
 "error": "the items this one depends on are not all closed"}
{"when": {"===": [{"var": "next.status"}, "active"]},
 "require": {"<=": [{"length": {"filter": [{"var": "team.items"}, {"and": [{"===": [{"var": "status"}, "active"]}, {"===": [{"var": "holder"}, {"outer": "next.holder"}]}]}]}}, 1]},
 "error": "the holder already holds an active item"}
```

### 7.6 Creation: what a new item needs

```json
{"when": {"===": [{"var": "command"}, "new"]}, "require": {">": [{"var": "next.estimate"}, 0]}, "error": "a new item needs --estimate <minutes>"}
```

`backlog team new` takes the fields of the team item definition as `--<field> <value>` beside `--title` and `--description`.

## Scenarios (BDD)

- *T-RULE-2. Transition: `backlog team update 7 status closed` on an `active` item fails rule `flow` with "status does not move from active to closed".
- *T-RULE-4. Guard on the caller's own value: `backlog team update 3 status active --agent member-2` on a ready item whose holder is not member-2 fails rule `holder-is-caller`; after `backlog team update 3 holder member-2 --agent member-2`, the same status change passes.
- *T-RULE-5. Rules relate only through fields: no rule sets a value; the history entry of a change lists only the properties the caller changed.
- *T-RULE-6. Relation: an item with a dependency not closed fails rule `dependencies` with "item 3 waits for the items it depends on".
- *T-RULE-7. Permission: `backlog team update 7 status closed --agent member-1` when member-1 is not the checker fails rule `checker-closes`.
- *T-RULE-11. The rules of `teams.example.json` give, through json-logic-js with the extra operators, the results the examples guide states for each team (a test runs them).

## Files

- templates/teams.example.json (new, a copy of the specification file)
- templates/default-team.json (new, a copy)
- .agents/test/teams-example.test.js (new)

## Interfaces

- No new interface; uses `evaluateChange` and `validateRuleSet`.

## Unit tests (TDD)

- `validates`: every team of both files has no error finding.
- `advanced team`: a member taking a ready item passes; the wrong holder fails `holder-is-caller`; active to closed fails `flow` and `checker-closes`; estimate 90 fails `size`; an open dependency fails `dependencies`.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills of "Skills", session 1, by their installed names, and do the reads of "Required reads".
2. After `git fetch`, create the task's own worktree and branch from the head of `simplify/pr3-review`: `git worktree add .worktrees/TASK-31 -b task/TASK-31 origin/simplify/pr3-review`, and work only inside `.worktrees/TASK-31` (other sessions share the main working copy; never switch its branch). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-31: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-31: The example teams give the stated results` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-31 | status: DONE or BLOCKED | branch: task/TASK-31 | commit: <sha>
Files changed: <list>
Scenarios written and passing: <ids, or none>
Unit tests written and passing: <names>
npm test: <pass count> pass, <fail count> fail | check: pass | guard: pass
Self review findings fixed: <one line each, or none>
Open: <anything left, with the reason>
```

## Session 2: review (at most 15 minutes, a new session)

A new session reads only this file and the hand-off in the task's backlog item.

1. Load the skills of "Skills", session 2, and do the reads of "Required reads" (the hand-off of session 1 included).
2. Work in `.worktrees/TASK-31` (the implementer's worktree of branch `task/TASK-31`); run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-31 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
