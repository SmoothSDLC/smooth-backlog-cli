# INT-03: Integration: the user commands that create, change and read

| | |
|---|---|
| Kind | integration |
| Depends on | TASK-16, TASK-17, TASK-18, TASK-19, TASK-20, TASK-21 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | INT-04 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

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

## Scenarios (BDD)

- *U-NEW-1. When `backlog new --title "Fix login" --description "Users cannot log in"` is run. Then one flat item exists with the next number, slug, repository, branch, times, writer, `cli_version`, title, description, every field of the applicable definition at its default and one history entry; it is last in the priority of its branch.
- *U-UPD-1. `backlog update 12 title "Fix the login page"` changes the title, sets `updated`, `updated_by` and `cli_version`, and adds a history entry with the change.
- *U-UPD-4. `backlog update 12 priority p0` puts item 12 first in its branch; every item that was before it moves down by one; no item file changes and no history entry is added.
- U-LIST-1. `backlog list` prints the items of the current branch in priority order, without the items of teams.
- U-SHOW-1. `backlog show 12` prints the whole item with its history; `backlog show p0` prints the item at priority 0.
- *U-RED-1. Given `redact_pii` true and the repository rules of `redaction.example.json`. When `backlog new --title "Ping build01.corp.example.com" --description "Customer CUST-123456 wrote to ann@example.org"` is run. Then the stored title is `Ping [internal host]`, the description `Customer CUST-****** wrote to [redacted e-mail]`, and the output names `title` and `description` as redacted.
- *U-RED-2. Given `redact_pii` false. Then the e-mail address is stored as given, and a GitHub token in a description is still replaced (a rule marked `always`).
- *U-RED-3. Every change is redacted: `backlog update 12 description "token ghp_..."` and `backlog team update 20 result "..."` store the redacted text, and the team rules see the redacted value.
- *U-SYNC-5. Given another file of the repository is changed and not committed. When `backlog new ...` is run with the backlog inside the repository. Then the CLI's commit holds only `.backlog` files, and the other file stays changed and uncommitted.

## Files

- features/items.feature
- features/read-commands.feature

## Interfaces

- No new interface.

## Checks

- every scenario of `features/items.feature` and `features/read-commands.feature` passes in both locations.
- `npm test` passes.

## Session 1: integrate (at most 30 minutes)

This task joins tasks that were built and reviewed on their own. Work only from this file.

1. Load the skills: `verification-before-completion`, `systematic-debugging`, `requesting-code-review`, `ponytail`.
2. `git fetch` and `git switch -c task/INT-03 origin/simplify/pr3-review` (the tasks of "Depends on" are merged there).
3. Run every scenario and test of "Checks". For each failure, find where two tasks disagree (a name, a shape, an order) with `systematic-debugging`, and fix it at that seam only; never rewrite a task.
4. Write any scenario of "Scenarios" that no task wrote yet.
5. Run `npm test`, `npm run check` and the guard; then `requesting-code-review` and `ponytail` over the seams changed; commit `INT-03: Integration: the user commands that create, change and read`.
6. Write the hand-off (the same form as a build task, with "Seams fixed" in place of "Unit tests").

## Session 2: review the integration (at most 15 minutes, a new session)

1. Load `requesting-code-review`, `ponytail-review`, `verification-before-completion`.
2. Run every check of "Checks"; review only the seam changes; write `REVIEW INT-03 | verdict: PASS or FAIL` with findings into the backlog item.
