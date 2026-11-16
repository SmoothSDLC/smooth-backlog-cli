# INT-08: Integration: every failure of every command

| | |
|---|---|
| Kind | integration |
| Depends on | FAIL-01, FAIL-02, FAIL-03, FAIL-04, FAIL-05, FAIL-06, FAIL-07, FAIL-08, FAIL-09, FAIL-10, FAIL-11, FAIL-12, FAIL-13, FAIL-14, FAIL-15, FAIL-16, FAIL-17, FAIL-18, FAIL-19, FAIL-20, FAIL-21, FAIL-22 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | INT-07 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 259 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- FAIL-01 (backlog item 215): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-02 (backlog item 216): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-03 (backlog item 217): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-04 (backlog item 218): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-05 (backlog item 219): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-06 (backlog item 220): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-07 (backlog item 221): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-08 (backlog item 222): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-09 (backlog item 223): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-10 (backlog item 224): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-11 (backlog item 225): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-12 (backlog item 226): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-13 (backlog item 227): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-14 (backlog item 228): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-15 (backlog item 229): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-16 (backlog item 230): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-17 (backlog item 231): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-18 (backlog item 232): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-19 (backlog item 233): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-20 (backlog item 234): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-21 (backlog item 235): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- FAIL-22 (backlog item 236): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

- **C-51.** Each command has a task that makes every failure of 4.16 for that command print its three parts, and one integration task checks every failure of every command in text and in JSON.

## Scenarios (BDD)

None of its own.

## Files

- .agents/test/integration-failures.test.js (new)

## Interfaces

- No new interface.

## Checks

- for every row of 4.16 and every command it applies to, the failure prints its three parts in text and in JSON and changes nothing.
- `npm test` passes.

## Session 1: integrate (at most 30 minutes)

This task joins tasks that were built and reviewed on their own. Work only from this file.

1. Load the skills of "Skills", session 1, and do the reads of "Required reads".
2. `git fetch`, then `git worktree add .worktrees/INT-08 -b task/INT-08 origin/simplify/pr3-review` (the tasks of "Depends on" are merged there); work only inside `.worktrees/INT-08`.
3. Run every scenario and test of "Checks". For each failure, find where two tasks disagree (a name, a shape, an order) with `systematic-debugging`, and fix it at that seam only; never rewrite a task.
4. Write any scenario of "Scenarios" that no task wrote yet.
5. Run `npm test`, `npm run check` and the guard; then `requesting-code-review` and `ponytail` over the seams changed; commit `INT-08: Integration: every failure of every command`.
6. Write the hand-off (the same form as a build task, with "Seams fixed" in place of "Unit tests").

## Session 2: review the integration (at most 15 minutes, a new session)

1. Load the skills of "Skills", session 2, and do the reads of "Required reads" (the hand-off of session 1 included).
2. In `.worktrees/INT-08`, run every check of "Checks"; review only the seam changes; write `REVIEW INT-08 | verdict: PASS or FAIL` with findings into the backlog item.
