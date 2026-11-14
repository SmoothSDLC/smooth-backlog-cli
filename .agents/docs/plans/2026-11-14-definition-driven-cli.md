# Definition-driven CLI

Status: the one active description of what this branch builds (2026-11-14). It records the owner's decisions and the pattern that follows from them. Everything written before it about commands, flags, fields and plans was moved to `.backlog/archived/` and is not a specification of anything.

## The pattern

The CLI knows one base item. A person gives its title and its description; the CLI supplies its number, slug, repository, branch, times, writer, status and history. The priority of an item is its place in the index file of the backlog folder and is stored nowhere else.

Every other field of an item is data read from an item definition:

1. the item has a team: the item definition of that team in the team file;
2. the item has no team: the repository's default item definition named in `.backlog/config.json`;
3. otherwise: the default item definition packaged with the CLI.

There are two separate sets of commands, and neither is an alias of the other:

- **User commands** apply no rule. A person or an agent may do anything to an item with them. The fields they can set are the base properties and the fields of the item definition that applies.
- **Team commands** (`backlog team ...`) are the only commands that use a team's rule set. The rule set in the team file decides who may take which step on which item and what the step changes.

The CLI ships a default team item definition, a default team rule set, and examples that show every kind of field and rule and how a way of working described in plain words becomes an item definition and rules. They are in this public repository, and the help points to them. Skills and other documents that describe working with the CLI read the team file; they never define the CLI's behaviour.

## Schemas

- [item.schema.json](2026-11-14-definition-driven-cli/item.schema.json): the base item, a JSON Schema; [item.example.json](2026-11-14-definition-driven-cli/item.example.json) fits it.
- [index.schema.json](2026-11-14-definition-driven-cli/index.schema.json): the index file that holds the priority order.

## Commands

`*` marks what does not exist on the branch yet. `--help` is usable everywhere.

User commands (no rules):

- `backlog`: *prints the help.
- `backlog setup`: choose where the backlog lives.
  - `--ask`: ask for the backlog repository path.
- `backlog new --title <text> --description <text>`: add an item at the end of the queue.
  - `--ask`: ask on a terminal for the two when not given.
  - *`--whatif`: say what would be created and change nothing.
- *`backlog new --file <item.json>`: add an item from a JSON file that fits the schema.
  - *`--whatif`: say what would be created and change nothing.
- *`backlog update <item> <property> <value>`: set one property. The property words are `title`, `description`, `status`, `priority`, and the fields of the item definition that applies; they are read at run time.
  - *`--whatif`: say what would change and change nothing.
- `backlog list`: the items of this branch in priority order.
  - `--json`: the whole items as JSON.
  - `--show-all`: also list the items of teams.
- `backlog show <item>`: one item whole, with its history.
  - `--json`: accepted; the output is JSON either way.
  - `--show-all`: also show an item of a team.
- `backlog archive <item>`: move the item to the archive folder named in `.backlog/config.json` and take it out of the index.
  - *`--whatif`: say what would be archived and change nothing.

Team commands (the team's rule set decides):

- `backlog team pop`: take the first step the team's pop table offers the agent.
- *`backlog team new --title <text>`: file an item through the team's "new" rule.
- `backlog team update <item> <step>`: take one step of the team's rules; the step's arguments are defined by the rules.
- `backlog team query` and its forms (`<item>`, `filter <name>`, `check <item> <step>`, `plan`, `rules`, `steps`): read the team's items and what its rules answer.
- `backlog team validate`: check the team file and the items against it.
- `backlog team migrate`: convert markdown items to JSON items.

Each team command takes the session inputs it had before (`--team`, `--agent`, `--session`, `--repository`, `--branch`, `--json` as each form allows) and `--whatif` in place of `--dry-run`.

Not decided, and therefore not in the list: `backlog next`, `changes`, `fields`, `done`, `move`, `import`, `archive done`, `clean`, `upgrade`; whether `--show-all` may be used with a writing command.

## Core behaviour of the CLI, independent of any team or item definition

Checked on the branch head by running the commands in a scratch repository (2026-11-14). All of it is present on the branch; the last column says what the owner decisions change.

| Behaviour | On the branch today | Change |
|---|---|---|
| Item number | one counter per repository folder (`numbers.json`); a number is never reused | none |
| Slug | the number and the title in file-name form; how an item is addressed | none |
| Priority | the place of the item in its branch's list in `index.json` of the repository folder; not stored in the item file; priority 0 is next | none |
| Setting priority 0 | the item goes first and every item behind it moves down by one | none |
| The index file | per branch, a list of entries with number, slug, name and status | the key `name` becomes `title` |
| Archive | `backlog archive <item>` moves the file to the folder `archive/phases` beside the open items and takes it out of the index; the folder is fixed in code | the folder is named in `.backlog/config.json` (decision 22) |
| Where the backlog lives | `.backlog` inside the repository, or a separate backlog repository named by `backlog_repository` in `.backlog/config.json`; the same commands either way | none |
| Synchronisation | the backlog is pulled before every command; a change is committed and pushed before the command exits; a change that cannot be published is taken back (exit 3) | none |
| Two writers | a write is refused (exit 5) when someone else changed the item since this agent read it | none |
| One writer per clone | a lock in the clone | none |
| History | every change adds an entry to the item | `backlog history` goes; the entries stay in the item |
| Repository and branch | an item belongs to one repository and one branch; each branch has its own queue | none |
| Output | `--json` prints the data; one line for a refusal; exit codes 0 to 5 | none |
| Secrets | credentials in addresses are redacted in every output | none |
| Configuration | `.backlog/config.json`, overridden by environment variables with the prefix `SMOOTH_BACKLOG_CLI_` | new keys: the archive folder, the default item definition |
| Starting status | `pending`; the finished words are closed, done and archived | the default definition has at least new, active and closed (decision 25) |
| Setup and upgrade | `backlog setup` chooses the location and installs the skill; `backlog upgrade` and the update notice | the owner's ruling on `backlog upgrade` is open |

Behaviour that today hangs on a hard-coded field and therefore needs a home under the new model: dependencies between items (`depends_on`: existence and cycle checks, a blocked item is not offered as next), the parent of a split item, a critical item going first, and who holds an item.

## Decisions

The decisions in force are in [decisions.md](2026-11-14-definition-driven-cli/decisions.md), and only there. What they replaced is in [superseded-decisions.md](2026-11-14-definition-driven-cli/superseded-decisions.md).

## What the branch has, and what changes

Already there and kept: the team file with people, item definition and rule set; its loader, validation and rule engine; the team commands; items as JSON files; the index, the counter, the archive move, synchronisation and the stale-write check (see the table above).

To build:

1. The code reads the base item from the schema; the keys `name` and `body` become `title` and `description`; existing item files are converted.
2. The packaged default item definition and default rule set; the key in `.backlog/config.json` for the repository's default item definition; the key for the archive folder.
3. `backlog new` with its two inputs and the JSON file input.
4. `backlog update <item> <property> <value>` with property words read from the definition; the fixed field flags, the line-editing flags, `--append` and `--claim` go.
5. Help that lists the fields of the definition that applies and points to the documents in this repository.
6. The examples and the guide from a described way of working to an item definition and rules.
7. `--whatif` everywhere; `backlog` alone prints the help; `--title` on `backlog team new`; `backlog history` removed.
8. `README.md`, `COMMANDS.md`, the skill and `CHANGELOG.md` rewritten from the new help; the tests of the changed commands rewritten.

Open, for the owner: the review of the rulings and design decisions made before 2026-11-13 against the decisions in force; which fields the packaged default definition declares; what happens to values that existing items hold in fields the applicable definition does not declare; the commands listed above as not decided; where the behaviours that hang on fixed fields today go (dependencies between items, the parent of a split item, a critical item going first, who holds an item).

## Work in flight

Merged and kept: the Task 6 follow-ups and Tasks 9, 11, 12 and 23 of the archived plan of 2026-11-12. Built and not merged: `backlog update` and `backlog done` with `--show-all` (branch kept, on hold). No other task of the archived plan runs; the task list is written anew from this document.
