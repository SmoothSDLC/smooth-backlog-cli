# FAIL-04: Failure messages of `backlog update <item>`

| | |
|---|---|
| Kind | build |
| Depends on | TASK-18, TASK-19, TASK-20, TASK-08, TASK-12, TASK-42 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | PERM-04, INT-08 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 218 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- TASK-18 (backlog item 173): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-19 (backlog item 174): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-20 (backlog item 175): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-08 (backlog item 211): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-12 (backlog item 166): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-42 (backlog item 213): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

### 4.16 The failures of each command

Every failure below prints its three parts (4.8): **what** names the command, the item or property and the value concerned; **why** names the rule broken; **fix** names the command or change that resolves it. The command changes nothing (C-47).

**Failures of every command that reads the backlog** (all but `backlog` and `--help`):

| Failure | Why | What to do |
|---|---|---|
| The backlog location is not set up or is not a git repository | 4.1, 4.11 | run `backlog setup` |
| An item is of an older version | 4.15 | run `backlog upgrade` |
| An item cannot be read | 4.14 | `backlog update <item> <property> <value>`, `backlog update <item> restore`, or `backlog update <slug> seq <n>` |
| The configuration does not fit its schema | 3.4 | correct the named key of `.backlog/config.json` |
| A command, subcommand, flag or property that does not exist (removed ones included) | 5.3 | `backlog --help` |
| `--ask` without a terminal | 4.14 | the flags that give the values |

**Failures of every command that changes the backlog:** another agent changed the item since this agent read it (4.10; fix: read the item and repeat the command); the remote changed between the pull and the push (4.10; fix: repeat the command); a redaction rule is not valid (redaction-spec.md; fix: `backlog validate` and correct the named rule).

**Failures of every team command:** git older than 2.40 (4.14; names both versions); `--team` or `--agent` missing with no variable set (4.7; names the flag and the variable); the team is not in the team file, or the team file does not fit its schema (3.3; names the team or the place); a refusal by the team's rules lists every failing rule with its property and error (4.6, 4.8).

**Failures of one command:**

| Command | Failure | Why | What to do |
|---|---|---|---|
| `backlog setup` | not inside a git repository; the backlog repository cannot be reached | 4.11 | run it inside a repository; check `backlog_origin_url` |
| `backlog new`, `backlog team new` | no title; a property the definition does not declare; a value that does not fit its field type; `--file` that does not fit 3.1 | 3.1, 3.2, 4.3 | give the title; use a declared property; give a value of the field type; correct the named property of the file |
| `backlog update <item>`, `backlog team update <item>` | no such item; undeclared property; value of the wrong type; a priority other than `p<N>`; `restore` with no earlier version; `seq` on an item whose number can be read; a number already used | 4.2, 4.3, 4.14 | `backlog list`; the declared properties; the field type; `p0`, `p1`, ...; `backlog show <item>`; a free number |
| `backlog show <item>`, `backlog team show <item>` | no such item | 4.2 | `backlog list` |
| `backlog list branch <name>`, `backlog team list branch <name>` | no such branch | 5.1 | the branches of the repository |
| `backlog team list --filter <name>` | the team has no filter of that name | team-rules-spec.md | `backlog team query rules` |
| `backlog archive <item>`, `backlog team archive <item>` | no such item; the item is already archived | 4.13 | `backlog list` |
| `backlog import <branch>`, `backlog branch import <branch>` and their team forms | no such branch; with `--repository`, no such repository or it has no backlog; an imported item that does not fit the definition that applies here | 4.14 | the branch or repository name; correct the named item and property in the source |
| `backlog validate`, `backlog team validate` | any finding; each finding names the item, rule or place | 4.5 | correct each finding |
| `backlog upgrade` | the release cannot be reached; an unknown `<version>`; an item with no conversion or that does not fit after conversion | 4.12 | try again later; a released version; update the listed items by hand to `item.schema.json` and the item definition that applies |
| `backlog team pop` | the team has no queue | team-rules-spec.md | define the queue in the team file |
| `backlog team query` | a subcommand other than `plan` or `rules` | 5.2 | `backlog team query --help` |

### 4.8 Output and failure messages

User commands print text for people; `--json` prints JSON. Team commands print JSON; `--human` prints text for people. A command that succeeds says what it did; a reading command with nothing to show, and `backlog team pop` with nothing to take, succeed and say so.

A command that fails changes nothing and prints a failure message in three parts: **what happened**, **why**, and **what to do** to resolve it. Every command does this for every failure. In JSON the message is `{"failed": {"what": "...", "why": "...", "fix": "..."}}`. A refusal by team rules lists every failing rule: `{"refused": [{"rule": "<id or place>", "property": "<the property it concerns>", "error": "<the rule's error>"}], "fix": "..."}`; with `--human`, one line per failing rule followed by what to do. The process exits with zero on success and non-zero on failure; no behaviour depends on a particular non-zero value.

### 5.1 User commands (no rules)

| Command | Flags of the command | Subcommand or property | Flags of the subcommand or property |
|---|---|---|---|
| `backlog` | | *(none): prints the help | |
| `backlog setup` | `--ask`, *`--whatif` | | |
| `backlog new` | *`--title <text>`, *`--description <text>`, `--ask`, *`--whatif`, `--json` | *`--file <item.json>` (an item that fits 3.1) | *`--whatif`, `--json` |
| *`backlog update <item>` | *`--whatif`, `--json`, `--show-all` | `title <text>`, `description <text>`, `status <word>`, `priority p<N>`, `<field> <value>` (each field of the definition that applies), `restore` (the previous version of an unreadable item), `seq <n>` (only for an item whose number cannot be read) | the flags of the command |
| `backlog list` | `--json`, `--show-all` | `branch <name>` | `--json`, `--show-all` |
| `backlog show <item>` | `--json`, `--show-all` | | |
| `backlog archive <item>` | *`--whatif`, `--json`, *`--show-all` | | |
| `backlog archive done` | *`--whatif`, `--json` | | |
| `backlog import <branch>` | `--higher`, *`--repository <owner/name>`, *`--whatif`, `--json` | | |
| *`backlog branch` | `--json` | `import <branch>` | `--higher`, *`--whatif`, `--json` |
| *`backlog validate` | `--json` | | |
| `backlog upgrade` | *`--whatif` | `check`, `auto`, `off`, `disable`, `<version>` | |

- **C-46.** Every failure prints what happened, why, and what to do; no behaviour depends on a particular exit code, and the rules engine's refusals carry each failing rule's error and the property it concerns.

- **C-47.** A command completes or reverts its change; there is no partial result.

- **C-51.** Each command has a task that makes every failure of 4.16 for that command print its three parts, and one integration task checks every failure of every command in text and in JSON.

## Scenarios (BDD)

None of its own.

## Files

- src/shared/update.js
- src/shared/index.js
- src/shared/repair.js
- features/failures/update.feature (new)
- .agents/test/failures-update.test.js (new)

## Interfaces

- Consumes `fail({what, why, fix})` and `refuse(refused, fix)` of `src/errors.js` (TASK-08); produces no new interface.
- Every failure of 4.16 that applies to `backlog update <item>` (its own row, and the rows for every command that reads, every command that changes and every team command where they apply) goes through `fail` or `refuse` with the what, why and fix of that row.

## Unit tests (TDD)

- one test per failure of 4.16 that applies to `backlog update <item>`, named after the failure (for example `no such item`): it runs the command into that failure and asserts the what, the why and the fix text, in text output and as `{"failed": {"what","why","fix"}}` (`--json` for a user command, the default for a team command), a non-zero exit, and that nothing changed (no new commit, the item files unchanged).
- `features/failures/update.feature`: one scenario per failure, in both storage locations.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills of "Skills", session 1, by their installed names, and do the reads of "Required reads".
2. After `git fetch`, create the task's own worktree and branch from the head of `simplify/pr3-review`: `git worktree add .worktrees/FAIL-04 -b task/FAIL-04 origin/simplify/pr3-review`, and work only inside `.worktrees/FAIL-04` (other sessions share the main working copy; never switch its branch). Do not push.
3. **Scenarios first (BDD).** This task has no scenario of its own; go to step 4.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "FAIL-04: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `FAIL-04: Failure messages of `backlog update <item>`` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
FAIL-04 | status: DONE or BLOCKED | branch: task/FAIL-04 | commit: <sha>
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
2. Work in `.worktrees/FAIL-04` (the implementer's worktree of branch `task/FAIL-04`); run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW FAIL-04 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
