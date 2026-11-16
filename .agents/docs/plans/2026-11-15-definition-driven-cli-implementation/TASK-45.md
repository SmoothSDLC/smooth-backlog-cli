# TASK-45: Help, the removed commands and --whatif

| | |
|---|---|
| Kind | build |
| Depends on | INT-04, INT-06, TASK-44 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-46, TASK-50, FAIL-01, PERM-01, PERM-02, PERM-03, PERM-04, PERM-05, PERM-06, PERM-07, PERM-08, PERM-09, PERM-10, PERM-11, PERM-12, PERM-13, PERM-14, PERM-15, PERM-16, PERM-17, PERM-18, PERM-19, PERM-20, PERM-21, PERM-22 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 201 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- INT-04 (backlog item 181): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- INT-06 (backlog item 194): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-44 (backlog item 214): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

## 5. Commands

`--help` works on every command and subcommand. `*` marks what needs new code.

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

### 5.2 Team commands (the team's rules apply; JSON unless `--human`)

Every team command takes `--team <name>`, `--agent <name>`, `--session <id>`, `--repository <owner/name>`, `--branch <name>` and *`--human`; the table lists the others.

| Command | Flags of the command | Subcommand or property | Flags of the subcommand or property |
|---|---|---|---|
| `backlog team new` | *`--title <text>`, *`--description <text>`, *`--<field> <value>` (each field of the team item definition), `--ask`, *`--whatif` | *`--file <item.json>` | *`--whatif` |
| *`backlog team list` | `--show-all`, *`--filter <name>` | `branch <name>` | `--show-all`, *`--filter <name>` |
| *`backlog team show <item>` | `--show-all` | | |
| *`backlog team update <item>` | *`--whatif` | `title <text>`, `description <text>`, `status <word>`, `priority p<N>`, `<field> <value>` (each field of the team item definition); every rule of the team is evaluated on the change | *`--whatif` |
| *`backlog team archive <item>` | *`--whatif` | `done` | *`--whatif` |
| *`backlog team import <branch>` | `--higher`, *`--repository <owner/name>`, *`--whatif` | | |
| *`backlog team branch` | | `import <branch>` | `--higher`, *`--whatif` |
| `backlog team pop` | *`--whatif` | | |
| `backlog team query` | | `plan` (what the queue offers each person), `rules` (the rule set) | `--show-all` on `rules` |
| `backlog team validate` | `--show-all` | | |

### 5.3 Commands and flags to remove from the code

- Commands: `backlog next`, `changes`, `fields`, `done`, `move`, `history`, `init clean`; `backlog team define`, `backlog team workflow`, `backlog team migrate`, `backlog team query check`, `query steps`, `query filter`.
- The form `backlog team update <item> <step>` and every step word in the code.
- Flags: `--dry-run`, `--body`, `--name`, `--append`, `--claim`, `--section` with `--set-lines`, `--add-line`, `--remove-line`, `--move-line`, `--top`; `--restore` as a flag; every flag that sets one field (`--status`, `--objective`, `--summary`, `--severity`, `--depends-on`, `--estimate`, `--complexity`, `--layer`, `--chunk`, `--set-*`, `--replan`, `--release`, `--close`, `--by`, `--reason`).
- Each removed command or flag fails with a message saying it does not exist and naming `backlog --help`.
- The environment variables `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS` and `SMOOTH_BACKLOG_CLI_RUN_HOOK`.

- **C-8.** `backlog` alone prints the help.

- **C-9.** Every command that changes items takes `--whatif`, which evaluates the change and writes nothing.

- **C-16.** The kept commands beyond create, update, list, show and archive are `backlog archive done`, `backlog import`, `backlog branch` and `backlog branch import`; `import` and `branch import` do the same thing.

## Scenarios (BDD)

- *U-HELP-1. When `backlog` is run. Then the help is printed and nothing changes.
- *U-HELP-2. When `backlog next`, `changes`, `fields`, `done`, `move`, `history`, `init clean` or `backlog team migrate` is run. Then it fails with a message saying the command does not exist and naming `backlog --help`.

## Files

- src/main.js
- src/help.js
- src/team/help.js

## Interfaces

- `backlog` alone prints the help; every command of 5.1 and 5.2 has its help; each removed command and `--dry-run` fails with a message (C-46)

## Unit tests (TDD)

- every listed scenario as a scenario.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills of "Skills", session 1, by their installed names, and do the reads of "Required reads".
2. After `git fetch`, create the task's own worktree and branch from the head of `simplify/pr3-review`: `git worktree add .worktrees/TASK-45 -b task/TASK-45 origin/simplify/pr3-review`, and work only inside `.worktrees/TASK-45` (other sessions share the main working copy; never switch its branch). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/commands.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-45: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-45: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-45: Help, the removed commands and --whatif` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-45 | status: DONE or BLOCKED | branch: task/TASK-45 | commit: <sha>
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
2. Work in `.worktrees/TASK-45` (the implementer's worktree of branch `task/TASK-45`); run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-45 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
