# TASK-16: backlog new with title and description

| | |
|---|---|
| Kind | build |
| Depends on | INT-01, TASK-06, TASK-14, INT-02 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-17, TASK-18, INT-03, FAIL-03 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Backlog item

This task is backlog item 171 of this repository's backlog, branch `simplify/pr3-review`. This file is copied unchanged into that item; both sessions record their hand-off and verdict in its Handoff section.

## Depends on

- INT-01 (backlog item 159): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-06 (backlog item 161): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- TASK-14 (backlog item 169): merged into `simplify/pr3-review`; read its hand-off in its backlog item.
- INT-02 (backlog item 167): merged into `simplify/pr3-review`; read its hand-off in its backlog item.

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

### 4.2 Numbers, slugs and priority

- An item's number is one above the highest number its repository folder ever held; it is never given again, also after archiving.
- A priority is written with the prefix `p`: `p0` is the first item of the branch. Priority and number are separate.
- A new item is added at the bottom of its branch's priority order.
- Setting an item to `pN` puts it at place N; every item that was at N or below moves down by one.
- An item is named in a command by its number (`12`), its slug, or its priority (`p0`).
- A number that two items hold (after a merge outside the CLI) is refused when given; both slugs are named. The CLI does not renumber items after a merge.

### 4.3 The definition that applies

For an item of a team: the team item definition. Otherwise: the user item definition named in the configuration, else the packaged one. `backlog new` gives every field its default. `backlog update <item> <property> <value>` accepts the base properties `title`, `description`, `status`, `priority` and every field of the definition that applies; the value must have the field's type. A user command does not hold a value to the field's `values` list: a user may set any status word on an item with no team. A team command does, and the team's rules apply to the change.

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

- **C-5.** `backlog new` takes only what a person must give (title and description) or a whole item as a JSON file; every other property is set with `backlog update`, so that creating an item never needs to know the definition.

- **C-14.** A new item goes to the bottom of its branch's priority order; a priority is written `p<N>` so that it is never confused with an item number; an item is named by number, slug or priority.

## Scenarios (BDD)

- *U-NEW-1. When `backlog new --title "Fix login" --description "Users cannot log in"` is run. Then one flat item exists with the next number, slug, repository, branch, times, writer, `cli_version`, title, description, every field of the applicable definition at its default and one history entry; it is last in the priority of its branch.
- *U-NEW-2. Given no `item_definition`. Then the new item's status is `new`.
- *U-NEW-3. Given `item_definition` names a definition whose status default is `todo` and that declares `estimate`. Then the item's status is `todo` and it has `estimate` at its default.
- *U-NEW-4. When `backlog new --title "A"` is run without a terminal. Then it fails with a message naming `--description`; nothing is written.
- *U-NEW-8. When `backlog new --title "A" --description "B" --estimate 30` or `--show-all` is run. Then it fails with a message naming `backlog update`; nothing is written.
- *U-NEW-9. Given the variable the configuration names for the team is set. When any user command is run. Then it fails with "teams are not allowed to use user commands", nothing changes.
- U-NEW-10. Two items created one after the other get different numbers; an archived item's number is never given again.

## Files

- src/shared/new.js
- features/items.feature
- .agents/test/new.test.js

## Interfaces

- `newItem({title, description}, ctx) -> {item, priority}`: base properties, the defaults of the definition that applies, redaction (TASK-14), the item last in its branch's index, one history entry with `command: "new"`, `publish` (TASK-11). Any flag that sets a field, and `--show-all`, fails with a message (C-46)

## Unit tests (TDD)

- `last in priority`: two new items: the second has priority `p1`.
- `a field flag is refused`: `--estimate 30` fails with a message naming `backlog update`.

## Session 1: implement (at most 30 minutes)

Work only from this file. Do not read the whole specification; everything this task needs is above.

1. Load the skills of "Skills", session 1, by their installed names, and do the reads of "Required reads".
2. After `git fetch`, create the task's own worktree and branch from the head of `simplify/pr3-review`: `git worktree add .worktrees/TASK-16 -b task/TASK-16 origin/simplify/pr3-review`, and work only inside `.worktrees/TASK-16` (other sessions share the main working copy; never switch its branch). Do not push.
3. **Scenarios first (BDD).** Write each scenario of "Scenarios" in `features/items.feature` as Gherkin (`Scenario:`, `Given`, `When I run`, `Then`), reusing the steps of `features/steps/cli.js` and adding a step there only when none fits. Run `node --test --test-name-pattern "<scenario name>" .agents/test/features.test.js`; each must fail. Commit: `git commit -m "TASK-16: failing scenarios"`.
4. **Unit tests (TDD).** Write each test of "Unit tests" in the named test file. Run `node --test <that file>`; every new test must fail for the reason the test states. Commit the failing tests: `git commit -m "TASK-16: failing tests"`.
5. **Code.** Write the smallest code that makes the tests and scenarios pass, in the files of "Files" only. An existing test that asserts the old behaviour this task replaces is updated in the same commit and named in the hand-off; no other file outside "Files" changes. Follow the interfaces exactly (names, parameters, return shapes). Use the libraries named; never hand-build what a library does.
6. **Run.** The task's test file, then `npm test`, then `npm run check`, then the private-details guard (`node --test .agents/test/no-private-details.test.js` with the deny-list variable the session is given). All pass.
7. **Self review.** Run `requesting-code-review` on your diff against "Requirements" and "Interfaces", then `ponytail` on the same diff: remove every line the tests do not need, every option nobody asked for, every comment that repeats the code. Rerun step 6.
8. **Commit** with the message `TASK-16: backlog new with title and description` and the repository's agent identity, no trailers.
9. **Hand-off.** Write the hand-off below into the Handoff section of this task's backlog item.

Stop rules: if 30 minutes pass, or a file outside "Files" must change, or a task this one depends on is not merged, stop, commit what passes, and write the hand-off with status `BLOCKED` and the reason. Never widen the task.

### Hand-off (copy into the task's backlog item, filled in)

```
TASK-16 | status: DONE or BLOCKED | branch: task/TASK-16 | commit: <sha>
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
2. Work in `.worktrees/TASK-16` (the implementer's worktree of branch `task/TASK-16`); run the task's test file, `npm test`, `npm run check` and the guard. Any failure: verdict FAIL.
3. Check, one by one, and write each result:
   - every scenario id of "Scenarios" exists in the named feature file and passes;
   - every test of "Unit tests" exists with that name, asserts what the line says, and passes;
   - every interface exists with the stated name, parameters and return shape;
   - `git diff --stat origin/simplify/pr3-review...` changes only the files of "Files";
   - every line of "Requirements" that the task touches holds in the code.
4. `ponytail-review` of the diff: anything the tests do not need is a finding.
5. Write the verdict into the Handoff section of the backlog item:

```
REVIEW TASK-16 | verdict: PASS or FAIL
Checks: scenarios <ok/fail>, tests <ok/fail>, interfaces <ok/fail>, files <ok/fail>, requirements <ok/fail>
Findings (FAIL only): <file:line - what is wrong - which requirement or test>
```

A FAIL goes back to session 1 with the findings as its only list. A PASS is merged by the lead.
