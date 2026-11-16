# TASK-08: Failure messages

| | |
|---|---|
| Kind | build |
| Depends on | TASK-01 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-12, TASK-42 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

### 4.8 Output and failure messages

User commands print text for people; `--json` prints JSON. Team commands print JSON; `--human` prints text for people. A command that succeeds says what it did; a reading command with nothing to show, and `backlog team pop` with nothing to take, succeed and say so.

A command that fails changes nothing and prints a failure message in three parts: **what happened**, **why**, and **what to do** to resolve it. Every command does this for every failure. In JSON the message is `{"failed": {"what": "...", "why": "...", "fix": "..."}}`. A refusal by team rules lists every failing rule: `{"refused": [{"rule": "<id or place>", "property": "<the property it concerns>", "error": "<the rule's error>"}], "fix": "..."}`; with `--human`, one line per failing rule followed by what to do. The process exits with zero on success and non-zero on failure; no behaviour depends on a particular non-zero value.

- **C-46.** Every failure prints what happened, why, and what to do; no behaviour depends on a particular exit code, and the rules engine's refusals carry each failing rule's error and the property it concerns.

- **C-47.** A command completes or reverts its change; there is no partial result.

## Scenarios (BDD)

None of its own.

## Files

- src/errors.js
- src/shared/output.js (new)
- .agents/test/failure.test.js

## Interfaces

- `fail({what, why, fix}) -> never`: throws a `BacklogError` carrying the three parts; the entry point prints them as three lines for people, or `{"failed": {"what", "why", "fix"}}` with `--json` (user commands) or by default (team commands), and exits non-zero.
- `refuse(refused: [{rule, property, error}], fix) -> never`: the same for a refusal by team rules.

## Unit tests (TDD)

- `three parts in text`: a failure prints the what, why and fix lines.
- `three parts in JSON`: with `--json` the output parses to `{failed: {what, why, fix}}`.
- `non-zero exit`: the process exit status is not 0.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills by their installed names: `test-driven-development`, `verification-before-completion`, `systematic-debugging` (only when a test fails for a reason you do not understand), `requesting-code-review`, `ponytail`.
2. Create a local branch from the head of `simplify/pr3-review`: `git switch -c task/TASK-08 origin/simplify/pr3-review` (after `git fetch`). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-08: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-08: Failure messages` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-08 | status: DONE or BLOCKED | branch: task/TASK-08 | commit: <sha>
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
2. `git switch task/TASK-08`; run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-08 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
