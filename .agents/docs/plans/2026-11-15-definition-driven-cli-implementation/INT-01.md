# INT-01: Integration: item file, index and store

| | |
|---|---|
| Kind | integration |
| Depends on | TASK-02, TASK-03, TASK-04 (each merged into `simplify/pr3-review` before this starts) |
| Needed by | TASK-16, TASK-21 |
| Time box | implementation at most 30 minutes; review at most 15 minutes |
| Specification | [behaviour-spec.md](../2026-11-14-definition-driven-cli/behaviour-spec.md), [team-rules-spec.md](../2026-11-14-definition-driven-cli/team-rules-spec.md), [redaction-spec.md](../2026-11-14-definition-driven-cli/redaction-spec.md); the parts this task needs are copied below |

## Requirements (copied from the specification)

### 3.1 The base item: [item.schema.json](../2026-11-14-definition-driven-cli/item.schema.json)

An item is one flat JSON object; [item.example.json](../2026-11-14-definition-driven-cli/item.example.json) fits the schema.

| Property | Required | Given by | Meaning |
|---|---|---|---|
| `seq` | yes | CLI | The item's number in its repository folder; never reused (4.2). |
| `slug` | yes | CLI | The number and the title in file-name form (4.13). |
| `title` | yes | person | Short title. |
| `description` | yes | person | What the item is about, in markdown. |
| `team` | no | person | The team that owns the item; absent when it has none. |
| `repository` | yes | CLI | `owner/name` of the repository the item belongs to. |
| `branch` | yes | CLI | The branch the item belongs to. |
| `created`, `updated` | yes | CLI | Times of creation and of the last change. |
| `updated_by` | yes | CLI | The agent of the command, else the user (4.7). |
| `cli_version` | yes | CLI | The version of the CLI that last wrote the item (4.11). |
| `status` | yes | definition | Declared by every item definition; its values come from the definition. |
| `history` | yes | CLI | One entry per change: `at`, `by`, `session`, `command`, `changes` (each changed property with before and after), `note`. Its structure is fixed in the CLI. |
| any other | no | definition | A field of the definition that applies (4.3). |

### 3.5 The index: [index.schema.json](../2026-11-14-definition-driven-cli/index.schema.json)

Per branch, the list of the open items in priority order: number, slug, title and status. The place in the list is the priority; nothing else holds it.

### 4.13 Storage and local state

- **Folder of a repository.** In a separate backlog repository, the items of a repository live in `<owner>/<name>/`; inside the repository, in `.backlog/`. A repository with no origin is named `local/<folder name>`.
- **Files.** Open items are `phases/<slug>.json`; archived items are under the `archive_folder`. `index.json` holds the priority order (3.5). `numbers.json` holds `{"last": <n>}`, the highest number handed out.
- **Next number.** One above the highest number the folder ever held: the item file names in the history of every branch of the backlog repository, every value `numbers.json` ever had, and the files and `numbers.json` present.
- **Slug.** The number padded to three digits, a hyphen, and the title in lowercase with every run of other characters than letters and digits replaced by one hyphen, hyphens at the ends removed (`012-fix-the-login-page`); a title with no letter or digit gives `item`.
- **Local state.** In the `.git` folder of the backlog repository's local copy, or in `.backlog/.state` when the items live inside the repository (never committed): the record of what each agent last read, and the per-user record of a valid team file (`smooth-backlog-cli/teams-validation/`).
- **What an agent last read.** A command that shows an item to an agent records the item's `updated`, `updated_by` and the backlog commit in `smooth-backlog-cli-views/<agent>.json`; a change by that agent is stopped when the item changed since (4.10). An item the agent never read is written without the check.

## Scenarios (BDD)

- *G-ITEM-1. No item file has a `fields` object; every item fits `item.schema.json`.

## Files

- .agents/test/integration-item-store.test.js

## Interfaces

- No new interface. Checks that TASK-02, TASK-03 and TASK-04 work together.

## Checks

- `round trip`: an item written by the store, read back, listed in the index with its title, and changed again keeps every property and gains one history entry per change.
- `full suite`: `npm test` passes with no new failure compared with the head before TASK-02.

## Session 1: integrate (at most 30 minutes)

This task joins tasks that were built and reviewed on their own. Work only from this file.

1. Load the skills: `verification-before-completion`, `systematic-debugging`, `requesting-code-review`, `ponytail`.
2. `git fetch` and `git switch -c task/INT-01 origin/simplify/pr3-review` (the tasks of "Depends on" are merged there).
3. Run every scenario and test of "Checks". For each failure, find where two tasks disagree (a name, a shape, an order) with `systematic-debugging`, and fix it at that seam only; never rewrite a task.
4. Write any scenario of "Scenarios" that no task wrote yet.
5. Run `npm test`, `npm run check` and the guard; then `requesting-code-review` and `ponytail` over the seams changed; commit `INT-01: Integration: item file, index and store`.
6. Write the hand-off (the same form as a build task, with "Seams fixed" in place of "Unit tests").

## Session 2: review the integration (at most 15 minutes, a new session)

1. Load `requesting-code-review`, `ponytail-review`, `verification-before-completion`.
2. Run every check of "Checks"; review only the seam changes; write `REVIEW INT-01 | verdict: PASS or FAIL` with findings into the backlog item.
