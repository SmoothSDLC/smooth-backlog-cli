# Use cases of the commands

Each use case is one scenario: the situation, the command as typed, and what must be true after. The ids are stable; a task of the plan names the ids it delivers. `*` marks a use case the branch does not pass today (the command, flag or behaviour does not exist yet); the others describe behaviour the branch has and must keep. All run in both storage places (the backlog inside the repository, and a separate backlog repository).

## User commands

### `backlog`
- *U-HELP-1. Given any repository. When `backlog` is run. Then the help is printed, exit 0, nothing changes.

### `backlog setup`
- U-SETUP-1. Given a repository with no `.backlog`. When `backlog setup` is run. Then `.backlog/config.json` exists, the team templates are in `.backlog/team-templates`, both are committed, and no folder path is printed.
- *U-SETUP-2. Then the configuration also holds `archive_folder` and the five variable keys, each naming a variable that starts with `SMOOTH_BACKLOG_CLI_`.
- U-SETUP-3. When `backlog setup` is run a second time. Then no commit is added.
- U-SETUP-4. Given a terminal. When `backlog setup --ask` is run. Then it asks where the backlog lives.

### `backlog new`
- *U-NEW-1. Given a repository with a backlog. When `backlog new --title "Fix login" --description "Users cannot log in"` is run. Then one item exists with the next number, a slug, the repository, the branch, the created and updated times, the writer, the title, the description, every field of the applicable definition at its default, and a first history entry; it is last in the index of its branch.
- *U-NEW-2. Given no `item_definition` in the configuration. Then the new item's status is `new` (the packaged definition).
- *U-NEW-3. Given `item_definition` names a file whose status default is `todo` and that declares `estimate`. Then the new item's status is `todo` and it has `estimate` at its default.
- *U-NEW-4. When `backlog new --title "A"` is run without a terminal. Then exit 2, the message names `--description`, nothing is written.
- U-NEW-5. Given a terminal. When `backlog new --ask` is run. Then it asks for the title and the description.
- *U-NEW-6. When `backlog new --title "A" --description "B" --whatif` is run. Then it says what would be created, exit 0, nothing is written.
- *U-NEW-7. Given a file `item.json` that fits the item schema. When `backlog new --file item.json` is run. Then the item is created from it with a number the CLI gives.
- *U-NEW-8. Given a file that does not fit the schema. Then exit 2, the message names the key, nothing is written.
- *U-NEW-9. When `backlog new --title "A" --description "B" --estimate 30` is run (any flag that sets a field). Then exit 2, the message names `backlog update`, nothing is written.
- *U-NEW-10. When `backlog new --title "A" --description "B" --show-all` is run. Then exit 2: the flag is not one of `backlog new`.
- *U-NEW-11. Given the variable the configuration names for the team is set. When any user command is run. Then it fails with "teams are not allowed to use user commands" and changes nothing.
- U-NEW-12. Two items created one after the other get different numbers, and an archived item's number is never given again.

### `backlog update <item> <property> <value>`
- *U-UPD-1. When `backlog update 12 title "Fix the login page"` is run. Then the title is changed, `updated` and the writer are set, and the history has an entry with the change.
- *U-UPD-2. When `backlog update 12 description "..."` is run. Then the description is replaced.
- *U-UPD-3. When `backlog update 12 status waiting` is run on an item with no team. Then the status is stored as typed, whatever the `values` of the definition.
- *U-UPD-4. When `backlog update 12 priority 0` is run. Then item 12 is first in the index of its branch, every item that was before it has moved down by one, and no item file changed.
- *U-UPD-5. Given the applicable definition declares `estimate` as a number. When `backlog update 12 estimate 30` is run. Then the field is set. When `backlog update 12 estimate soon` is run. Then exit 2 naming the type.
- *U-UPD-6. When `backlog update 12 colour red` is run and no definition declares `colour`. Then exit 2, the message lists the property words that exist for this item.
- *U-UPD-7. Given item 20 belongs to team `web`. When `backlog update 20 status closed` is run. Then exit 1, one line names `backlog team update`, nothing changes.
- *U-UPD-8. When `backlog update 20 status closed --show-all` is run. Then the status is changed, no rule of the team was applied, and the history entry names the user.
- *U-UPD-9. When `backlog update 12 title "X" --whatif` is run. Then it says what would change, nothing is written.
- U-UPD-10. Given someone else changed item 12 since the caller read it. Then exit 5 and the item as it is now.
- *U-UPD-11. When `backlog update 12 --status closed`, `--claim x`, `--append "..."` or `--section ...` is run. Then exit 2: no such option.

### `backlog list`
- U-LIST-1. When `backlog list` is run. Then the items of the current branch are printed in the order of the index, without the items of teams.
- U-LIST-2. When `backlog list --show-all` is run. Then the items of teams are listed too, each with its team.
- U-LIST-3. When `backlog list --json` is run. Then the items are printed as JSON, with the keys `title` and `description`.
- U-LIST-4. When `backlog list branch feature-x` is run. Then the items of that branch are listed.
- U-LIST-5. Given no item. Then it says the backlog is empty and names no folder.

### `backlog show <item>`
- U-SHOW-1. When `backlog show 12` is run. Then the whole item is printed with its history.
- U-SHOW-2. Given item 20 belongs to a team. When `backlog show 20` is run. Then the answer is that there is no such item. With `--show-all` it is printed.
- U-SHOW-3. Given two items hold number 57. When `backlog show 57` is run. Then both slugs are named and nothing else happens.

### `backlog archive <item>`
- *U-ARCH-1. When `backlog archive 12` is run. Then the item file is in the folder `archive_folder` names, the item is out of the index, its number is never given again, and the item keeps its status.
- *U-ARCH-2. When `backlog archive 12 --whatif` is run. Then it says what would be archived, nothing moves.
- *U-ARCH-3. Given item 20 belongs to a team. When `backlog archive 20` is run. Then exit 1 naming `backlog team update`.

### Synchronisation, every command
- U-SYNC-1. The backlog is pulled before a command acts and a change is committed and pushed before it exits.
- U-SYNC-2. Given the push is refused. Then only the command's own commit is taken back, exit 3, and a person's commits stay.
- U-SYNC-3. No output names a file or a folder of the backlog; credentials in addresses are redacted.

### `backlog upgrade`
- U-UPG-1. `backlog upgrade`, `upgrade check`, `auto`, `off` and `disable` and the update notice behave as on the branch today.

## Team commands

### Where a team command gets its inputs
- T-IN-1. The team is the `--team` flag, else the variable, else the `team` key of the configuration; a flag wins over the variable.
- *T-IN-2. Given `team_variable` in the configuration is `SMOOTH_BACKLOG_CLI_WEB_TEAM`. Then that variable is read, and `SMOOTH_BACKLOG_CLI_TEAM_NAME` is not. The same holds for the repository, branch, agent and session keys.
- *T-IN-3. Given two repositories whose configurations name different variables, and both variables set in one environment. Then a command in each repository acts for its own team.
- T-IN-4. Given no team by any of the three ways. Then exit 2, and the message names all three.
- T-IN-5. Given a team file with a finding in any entry. Then every team command stops and changes nothing.

### `backlog team new`
- *T-NEW-1. When `backlog team new --team web --agent lead-1 --title "Parse the header"` is run and the rules allow the step `new`. Then the item exists with its team, the fields of the team's definition at their defaults, and what the rule's effects set.
- T-NEW-2. Given a rule denies. Then exit 1 with the rule's text, no number is used, nothing is written.

### `backlog team update <item> <step>`
- T-UPD-1. When `backlog team update 20 start --team web --agent member-1` is run and a rule allows it. Then the effects are applied and the history entry names the step and the agent.
- T-UPD-2. Given a rule denies. Then exit 1 with the rule's text, nothing changes.
- T-UPD-3. When the step word is not one of the rules. Then exit 2, and the step words are listed.
- T-UPD-4. A step's arguments are given as `--<name> <value>` and reach the rules as `$arg.<name>`.
- *T-UPD-5. With `--whatif` the answer is given and nothing changes.

### `backlog team pop`
- T-POP-1. When `backlog team pop --team web --agent member-1` is run. Then the first step the pop table offers the agent is taken and the item is printed.
- T-POP-2. Given nothing is offered. Then the answer is idle, exit 3.
- *T-POP-3. With `--whatif` the offer is printed and nothing is taken.

### `backlog team query`
- T-QRY-1. `backlog team query` lists the team's items; `query <item>` shows one; `query filter <name>` applies a named filter; `query check <item> <step>` says allowed or refused without taking the step; `query plan` lists what pop would offer; `query rules` and `query steps` print the rule set and the step words.
- T-QRY-2. `--show-all` reads over every team on the list, one item and rules forms; given with `--team`, `--team` decides.

### `backlog team validate`
- T-VAL-1. Given a valid team file. Then exit 0.
- T-VAL-2. Given a broken rule. Then each problem is reported with where it is, which rule, why, and what would fix it.
- *T-VAL-3. The packaged default team entry and every shipped template pass `backlog team validate` and fit the team file schema.

### `backlog team migrate`
- T-MIG-1. It converts the markdown items of the repository's folder to JSON items, reports every missing or invalid field, and records the migration in the configuration; `--ask` repairs one field at a time on a terminal.
- *T-MIG-2. With `--whatif` it reports and converts nothing.
- *T-MIG-3. A converted item has the keys `title` and `description`.

## The code holds no workflow
- *G-CODE-1. No source file outside the packaged data names a status word, a review, a claim, a holder, a link between items, a parent, a limit on work in progress or a hand-off. A test reads the source and fails on any of them.
- *G-CODE-2. The only environment variables the code reads by a fixed name are those that find the backlog; the five session inputs are read by the names the configuration gives.
- *G-DOC-1. The help of every command points to the documents folder of the public repository; `README.md`, `COMMANDS.md`, the skill and `CHANGELOG.md` describe exactly the commands of the specification, and a test compares them with the help.
