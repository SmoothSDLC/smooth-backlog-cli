# TASK-13: Redaction rules in force and text redaction

| | |
|---|---|
| Kind | build |
| Depends on | TASK-01, TASK-07 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-14 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 168 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- TASK-01 (backlog item 155): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-07 (backlog item 162): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

## 2. Redaction rules

A redaction rule is a JSON object (schema `$defs/rule`):

| Key | Required | Meaning |
|---|---|---|
| `id` | no | Used only by validation to name the rule. |
| `description` | no | What the rule hides, in words. |
| `find` | yes | A regular expression in RE2 syntax, matched in linear time by the `re2` package. |
| `replace` | yes | The text put in place of each match; `$1`, `$2`, ... insert groups of the match. |
| `properties` | no | The item properties the rule applies to. Absent: every text property of the item and every text inside a list. |
| `applies` | no | `always`: applied even when `redact_pii` is false; `when-enabled` (the default): only when `redact_pii` is true. |

## 3. Where the rules come from

1. The packaged default rules, [default-redaction.json](../2026-11-14-definition-driven-cli/default-redaction.json): credentials in addresses, private keys, bearer tokens, GitHub tokens and AWS access keys (`always`), and e-mail addresses, international telephone numbers and IPv4 addresses (`when-enabled`).
2. The repository's own rules: the key `redaction_rules` of `.backlog/config.json`, in the same form.
3. The switch: the key `redact_pii` of `.backlog/config.json`, false by default.

The rules in force for a command are the packaged ones followed by the repository's, keeping those marked `always` and, when `redact_pii` is true, also those marked `when-enabled`.

- **C-40.** Where a widely used and safe library does the job, the CLI uses it and does not build its own: Ajv with ajv-formats for JSON Schema, json-logic-js for rule conditions, re2 for regular expressions.

## Scenarios (BDD)

None of its own.

## Files

- src/shared/redaction.js (new)
- templates/default-redaction.json (new, a copy of the specification file)
- .agents/test/redaction.test.js

## Interfaces

- `rulesInForce(config) -> RedactionRule[]`: the packaged rules, then `config.redaction_rules`; rules with `applies: "always"` always, the others only when `config.redact_pii` is true.
- `redactText(text, rules) -> string`: applies each rule in order with the `re2` package; `$1`, `$2` in `replace` insert groups.

## Unit tests (TDD)

- `always rule`: with `redact_pii` false, a `ghp_` token of 30 characters is replaced by `[redacted token]` and an e-mail address is kept.
- `enabled rules`: with `redact_pii` true the e-mail address becomes `[redacted e-mail]`.
- `groups`: `https://u:p@host/x` becomes `https://[redacted]@host/x`.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills of "Skills", session 1, by their installed names, and do the reads of "Required reads".
2. After `git fetch`, create the task's own worktree and branch from the head of `simplify/pr3-review`: `git worktree add .worktrees/TASK-13 -b task/TASK-13 origin/simplify/pr3-review`, and work only inside `.worktrees/TASK-13` (other sessions share the main working copy; never switch its branch). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-13: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-13: Redaction rules in force and text redaction` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-13 | status: DONE or BLOCKED | branch: task/TASK-13 | commit: <sha>
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
2. Work in `.worktrees/TASK-13` (the implementer's worktree of branch `task/TASK-13`); run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-13 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
