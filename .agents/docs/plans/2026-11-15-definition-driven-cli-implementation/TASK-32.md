# TASK-32: A team change: build, redact, evaluate, print

| | |
|---|---|
| Kind | build |
| Depends on | INT-04, INT-05 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-33, TASK-34, TASK-35, FAIL-13, FAIL-14, FAIL-15, FAIL-16, FAIL-17, FAIL-18, FAIL-19, FAIL-20, FAIL-21, FAIL-22 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 189 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- INT-04 (backlog item 181): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- INT-05 (backlog item 188): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

### 4.6 How a team command applies the rules

Every team command that would change an item builds the change (`prev` and `next`), applies the redaction rules to `next`, checks `next` against the schema and the team item definition with Ajv, then evaluates every rule with json-logic-js. If every rule holds, the change is written with one history entry; otherwise nothing is written and the command fails with every failing rule's error, the property it concerns, and what to do (4.8). `--whatif` evaluates and writes nothing. Commands that only read evaluate no rule. The full specification is [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md).

### 4.8 Output and failure messages

User commands print text for people; `--json` prints JSON. Team commands print JSON; `--human` prints text for people. A command that succeeds says what it did; a reading command with nothing to show, and `backlog team pop` with nothing to take, succeed and say so.

A command that fails changes nothing and prints a failure message in three parts: **what happened**, **why**, and **what to do** to resolve it. Every command does this for every failure. In JSON the message is `{"failed": {"what": "...", "why": "...", "fix": "..."}}`. A refusal by team rules lists every failing rule: `{"refused": [{"rule": "<id or place>", "property": "<the property it concerns>", "error": "<the rule's error>"}], "fix": "..."}`; with `--human`, one line per failing rule followed by what to do. The process exits with zero on success and non-zero on failure; no behaviour depends on a particular non-zero value.

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

## 10. Error texts

`error` is the text the caller sees. Values may be put in with `{...}` and a path of 5: `{prev.status}`, `{next.estimate}`, `{caller.name}`; a path that cannot be read gives an empty text. A refusal returns every failing rule, with the property it concerns, and what to do: in JSON (the default of team commands) `{"refused": [{"rule": "<id or place>", "property": "<property>", "error": "..."}], "fix": "change the properties named and run the command again"}`; with `--human`, one line per failing rule followed by what to do. A rule's `error` says why the change is refused and, where it can, what would make it allowed.

- **C-25.** Team commands print JSON by default and text with `--human`.

## Scenarios (BDD)

- *T-OUT-1. Every team command prints JSON; with `--human` it prints text for people; `--json` is not a flag of team commands.
- *T-RULE-10. With `--whatif` a change is evaluated and nothing written.

## Files

- src/team/change.js (new)
- .agents/test/team-change.test.js

## Interfaces

- `teamChange(command, args, ctx) -> {item} | {refused}`: builds `next` with the user operation of the command, applies `redactItem` (TASK-14), then `evaluateChange` (TASK-26); prints JSON by default and text with `--human`; `--whatif` writes nothing; a refusal is `{"refused": [{"rule", "property", "error"}], "fix"}` and the process exits non-zero (C-46).

## Unit tests (TDD)

- `refusal JSON shape`.
- `redacted value reaches the rules`: a rule requiring the raw value fails.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills of "Skills", session 1, by their installed names, and do the reads of "Required reads".
2. After `git fetch`, create the task's own worktree and branch from the head of `simplify/pr3-review`: `git worktree add .worktrees/TASK-32 -b task/TASK-32 origin/simplify/pr3-review`, and work only inside `.worktrees/TASK-32` (other sessions share the main working copy; never switch its branch). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-32: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-32: A team change: build, redact, evaluate, print` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-32 | status: DONE or BLOCKED | branch: task/TASK-32 | commit: <sha>
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
2. Work in `.worktrees/TASK-32` (the implementer's worktree of branch `task/TASK-32`); run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-32 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
