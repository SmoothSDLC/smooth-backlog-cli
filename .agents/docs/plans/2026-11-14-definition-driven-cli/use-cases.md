# Use cases of the commands

Each use case is one scenario: the situation, the command as typed, and what must be true after. Ids are stable; a task of the plan names the ids it delivers. `*` marks a use case the branch does not pass today. Every use case runs in both storage places: the backlog inside the repository, and a separate backlog repository. Section numbers refer to [behaviour-spec.md](behaviour-spec.md).

## User commands

### `backlog` (5.1)
- *U-HELP-1. When `backlog` is run. Then the help is printed, exit 0, nothing changes.
- *U-HELP-2. When `backlog next`, `changes`, `fields`, `done`, `move`, `history` or `init clean` is run. Then exit 2: no such command (5.3).

### `backlog setup` (4.11)
- U-SETUP-1. Given a repository with no `.backlog`. When `backlog setup` is run. Then `.backlog/config.json` exists and is committed, and no folder path is printed.
- *U-SETUP-2. Then the configuration holds `archive_folder`, the five variable keys (each naming a variable that starts with `SMOOTH_BACKLOG_CLI_`) and `redact_pii` false, and fits `config.schema.json`.
- *U-SETUP-3. Given the repository has `.claude` and `.github` folders. Then the skill is installed in `.claude/skills/backlog` and `.github/skills/backlog`, and in no folder that does not exist. Given an older skill there, it is replaced.
- *U-SETUP-4. Then `teams.example.json` and the packaged defaults are in `.backlog`.
- *U-SETUP-5. Given items exist and one has a `cli_version` older than the running CLI. When `backlog setup` is run. Then exit 2, the message says to run `backlog upgrade` first, no skill is installed and nothing changes.
- U-SETUP-6. When `backlog setup` is run a second time with nothing new. Then no commit is added.
- U-SETUP-7. Given a terminal. When `backlog setup --ask` is run. Then it asks for what is not configured.

### `backlog new` (4.2, 4.3)
- *U-NEW-1. When `backlog new --title "Fix login" --description "Users cannot log in"` is run. Then one flat item exists with the next number, slug, repository, branch, times, writer, `cli_version`, title, description, every field of the applicable definition at its default and one history entry; it is last in the priority of its branch.
- *U-NEW-2. Given no `item_definition`. Then the new item's status is `new`.
- *U-NEW-3. Given `item_definition` names a definition whose status default is `todo` and that declares `estimate`. Then the item's status is `todo` and it has `estimate` at its default.
- *U-NEW-4. When `backlog new --title "A"` is run without a terminal. Then exit 2 naming `--description`, nothing written.
- U-NEW-5. Given a terminal. When `backlog new --ask` is run. Then it asks for the title and the description.
- *U-NEW-6. With `--whatif`. Then it says what would be created, exit 0, nothing written.
- *U-NEW-7. When `backlog new --file item.json` is run with a file that fits the item schema. Then the item is created with a number the CLI gives. With a file that does not fit: exit 2 naming the key.
- *U-NEW-8. When `backlog new --title "A" --description "B" --estimate 30` or `--show-all` is run. Then exit 2, the message names `backlog update`, nothing written.
- *U-NEW-9. Given the variable the configuration names for the team is set. When any user command is run. Then it fails with "teams are not allowed to use user commands", nothing changes.
- U-NEW-10. Two items created one after the other get different numbers; an archived item's number is never given again.

### `backlog update <item> <property> <value>` (4.2, 4.3)
- *U-UPD-1. `backlog update 12 title "Fix the login page"` changes the title, sets `updated`, `updated_by` and `cli_version`, and adds a history entry with the change.
- *U-UPD-2. `backlog update 12 description "..."` replaces the description.
- *U-UPD-3. `backlog update 12 status waiting` on an item with no team stores the word as typed.
- *U-UPD-4. `backlog update 12 priority p0` puts item 12 first in its branch; every item that was before it moves down by one; no item file changes and no history entry is added.
- *U-UPD-5. Given the definition declares `estimate` as a number: `backlog update 12 estimate 30` sets it; `backlog update 12 estimate soon` exits 2 naming the type.
- *U-UPD-6. `backlog update 12 colour red` when no definition declares `colour`: exit 2 listing the property words of this item.
- *U-UPD-7. Given item 20 belongs to team `web`: `backlog update 20 status closed` exits 1 naming `backlog team update`; nothing changes.
- *U-UPD-8. `backlog update 20 status closed --show-all` changes it, applies no rule, and the history entry names the user.
- *U-UPD-9. With `--whatif` it says what would change; nothing written.
- U-UPD-10. Given someone else changed item 12 since the caller read it: exit 5 and the item as it is now.
- *U-UPD-11. `backlog update 12 --status closed`, `--claim x`, `--append "..."` or `--section ...`: exit 2, no such option.
- *U-UPD-12. `backlog update p0 title "X"` changes the item at priority 0; `backlog update 0 title "X"` is refused because no item has number 0.

### `backlog list` and `backlog show <item>` (4.2, 4.8)
- U-LIST-1. `backlog list` prints the items of the current branch in priority order, without the items of teams.
- *U-LIST-2. Each row shows the priority as `p0`, `p1`, ...
- U-LIST-3. `backlog list --show-all` lists the items of teams too, each with its team.
- *U-LIST-4. `backlog list --json` prints flat items with `title` and `description`.
- U-LIST-5. `backlog list branch feature-x` lists that branch.
- U-LIST-6. With no item it says the backlog is empty and names no folder.
- U-SHOW-1. `backlog show 12` prints the whole item with its history; `backlog show p0` prints the item at priority 0.
- U-SHOW-2. Given item 20 belongs to a team: `backlog show 20` answers that there is no such item; with `--show-all` it is printed.
- U-SHOW-3. Given two items hold number 57: `backlog show 57` names both slugs.

### `backlog archive` (5.1)
- *U-ARCH-1. `backlog archive 12` moves the item into `archive_folder`, keeps its status, takes it out of the index; its number is never given again.
- *U-ARCH-2. With `--whatif` it says what would be archived; nothing moves.
- *U-ARCH-3. Given item 20 belongs to a team: `backlog archive 20` exits 1 naming `backlog team archive`.
- U-ARCH-4. `backlog archive done` archives every item of the branch whose status is a final value of its definition.

### `backlog import` and `backlog branch` (5.1)
- U-IMP-1. `backlog import feature-x` brings the open items of branch `feature-x` to the current branch, after the current branch's items; with `--higher` before them.
- *U-BR-1. `backlog branch` lists the branches that have items.
- *U-BR-2. `backlog branch import feature-x` does what U-IMP-1 does.

### `backlog validate` (4.5)
- *U-VAL-1. Given valid files. Then exit 0.
- *U-VAL-2. Given a schema file that is not valid JSON Schema 2020-12. Then it is reported.
- *U-VAL-3. Given a team file with two teams, one with a broken rule. Then the whole file is reported invalid, the problem named with its team, rule, reason and fix.
- *U-VAL-4. Given a user item definition that does not fit `item-definition.schema.json`. Then it is reported.
- *U-VAL-5. Given an item missing a required field of its definition, or an item of a team whose values a team rule forbids. Then each is reported with the item and the field.

### `backlog upgrade` (4.12)
- U-UPG-1. `backlog upgrade`, `upgrade check`, `auto`, `off`, `disable` and `<version>` and the update notice behave as on the branch today.
- *U-UPG-2. Given items written by an older version. When `backlog upgrade` is run. Then every item is converted to the running version and has its `cli_version`.

### Every command (4.1, 4.9)
- U-SYNC-1. The backlog is pulled before a command acts; a change is committed and pushed before it exits.
- U-SYNC-2. A refused push takes back only the command's own commit, exit 3; a person's commits stay.
- U-SYNC-3. No output names a file or folder of the backlog; credentials in addresses are redacted.
- *U-SYNC-4. Given the backlog location is not a git repository. When a command that changes the backlog is run. Then exit 4 naming `backlog setup`, nothing written.
- *U-RED-1. Given `redact_pii` true and a pattern that replaces e-mail addresses. When an item is created whose description holds an address. Then the stored item and the output hold the replacement. Given `redact_pii` false, the address is stored as given.

## Team commands

### Inputs and output (4.7, 4.8)
- T-IN-1. The team is the `--team` flag, else the variable, else the `team` key; a flag wins.
- *T-IN-2. Given `team_variable` is `SMOOTH_BACKLOG_CLI_WEB_TEAM`. Then that variable is read and `SMOOTH_BACKLOG_CLI_TEAM_NAME` is not; the same for the other four keys.
- *T-IN-3. Given two repositories whose configurations name different variables, both set in one environment. Then a command in each acts for its own team.
- T-IN-4. With no team by any way: exit 2 naming all three ways.
- T-IN-5. Given a team file with a finding in any team: every team command stops, nothing changes.
- *T-OUT-1. Every team command prints JSON; with `--human` it prints text for people; `--json` is not a flag of team commands.

### Team forms of the user commands (decision 38)
- *T-NEW-1. `backlog team new --team web --agent lead-1 --title "Parse the header" --description "..."`, a rule allowing it: the item has its team, the team definition's fields at their defaults, and what the rule set.
- T-NEW-2. A rule denies: exit 1 with the rule's text, no number used, nothing written.
- *T-LIST-1. `backlog team list --team web` lists the team's items of the branch in priority order; with `--show-all` every team's.
- *T-SHOW-1. `backlog team show 20 --team web` prints the item.
- *T-UPD-1. `backlog team update 20 estimate 30 --team web --agent member-1`, `estimate` a field of the team definition and a rule allowing it: the field is set and the history names the agent.
- *T-UPD-2. A rule naming `estimate` denies: exit 1 with its text, nothing changes.
- *T-UPD-3. A value outside the field's `values` list: exit 1.
- T-UPD-4. On the branch today: `backlog team update 20 start --team web --agent member-1` takes the step `start` (kept until choice 1 of the specification is decided).
- *T-UPD-5. With `--whatif` the answer is given and nothing changes.
- *T-ARCH-1. `backlog team archive 20 --team web --agent lead-1` archives the item when a rule allows it; `backlog team archive done` archives every finished item the rules allow.
- *T-IMP-1. `backlog team import feature-x` and `backlog team branch import feature-x` move the team's open items of that branch here when the rules allow.

### `backlog team pop`, `query`, `validate`, `migrate`
- T-POP-1. `backlog team pop --team web --agent member-1` takes the first entry of the pop table the rules allow and prints the item.
- T-POP-2. Nothing allowed: idle, exit 3.
- *T-POP-3. With `--whatif` the offer is printed and nothing taken.
- T-QRY-1. `backlog team query filter <name>` applies a filter; `query check <item> <step>` says allowed or refused without acting; `query plan` lists what pop would offer each person; `query rules` and `query steps` print the rule set and its step words.
- T-VAL-1. `backlog team validate` exits 0 on a valid team file; on a broken rule it reports where, which rule, why and the fix.
- *T-VAL-2. The packaged default team and the three teams of `teams.example.json` pass `backlog team validate` and `backlog validate`.
- T-MIG-1. `backlog team migrate` converts markdown items to JSON items, reports every missing or invalid field, records the migration; `--ask` repairs one field at a time.
- *T-MIG-2. With `--whatif` it converts nothing.

## The whole code
- *G-ITEM-1. No item file has a `fields` object; every item fits `item.schema.json`.
- *G-CODE-1. No source file outside the packaged data names a status word, review, claim, holder, link between items, parent, limit or hand-off; a test reads the source and fails on any.
- *G-CODE-2. The five session inputs are read by the variable names the configuration gives; no other variable is read by a fixed name except those that find the backlog.
- *G-DOC-1. Every help points to the documents folder of the public repository; `README.md`, `COMMANDS.md`, the skill and `CHANGELOG.md` describe exactly the commands of the specification, and a test compares them with the help.
- *G-TOPO-1. The owner's team file in the topology repository passes `backlog validate` (decision 36).
