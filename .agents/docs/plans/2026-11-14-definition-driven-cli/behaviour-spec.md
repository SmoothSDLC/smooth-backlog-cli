# Behaviour specification of the CLI

Status: the target behaviour of the CLI when the simplify branch is finished. Written 2026-11-14, restructured 2026-11-15 from the owner's decisions ([decisions.md](decisions.md); what they replaced is in [superseded-decisions.md](superseded-decisions.md)). Not yet approved by the owner. Every command and use is a use case in [use-cases.md](use-cases.md); the work to reach this is [the plan](../2026-11-14-definition-driven-cli.md). Section 8 lists everything the schemas define or the code does that this document does not yet describe; until that table is empty, this specification is incomplete.

## Contents

1. [The pattern](#1-the-pattern)
2. [Terms](#2-terms)
3. [Schemas](#3-schemas): 3.1 the base item, 3.2 the item definition, 3.3 the team file and the rule set, 3.4 the configuration, 3.5 the index, 3.6 the example team file, 3.7 the packaged defaults
4. [Behaviour](#4-behaviour): 4.1 the backlog location, 4.2 numbers, slugs and priority, 4.3 the definition that applies, 4.4 history, 4.5 validation, 4.6 how a team command applies the rules, 4.7 inputs and environment variables, 4.8 output and exit codes, 4.9 redaction, 4.10 two writers, 4.11 setup, 4.12 upgrade
5. [Commands](#5-commands): 5.1 user commands, 5.2 team commands, 5.3 removed commands
6. [The owner's team file](#6-the-owners-team-file)
7. [Choices the lead made, for the owner to confirm](#7-choices-the-lead-made-for-the-owner-to-confirm)
8. [What the schemas or the code define and this document does not yet describe](#8-what-the-schemas-or-the-code-define-and-this-document-does-not-yet-describe)

## 1. The pattern

The CLI's code holds no workflow. Its user commands create, change, list, show and archive items, and move them between branches. Every item has the same base properties (3.1). Every other field of an item comes from an item definition (3.2), which is data. Every rule comes from a team's rule set (3.3), which is data, and is applied only by team commands. User commands apply no rule.

There are two sets of commands, never aliases of each other:

- **User commands** (`backlog <command>`) apply no rule. They act on items that have no team. With `--show-all` they also read, and change, items of a team, still applying no rule (decisions 7 and 29).
- **Team commands** (`backlog team <command>`) are the same commands for the items of one team, with the team's rules applied, and print JSON unless `--human` is given (decisions 38 and 39).

## 2. Terms

| Term | Meaning |
|---|---|
| Item | One unit of work, stored as one JSON file (3.1). |
| Base property | A property every item has, whatever its definition: the number, slug, title, description, team, repository, branch, times, writer, CLI version, status and history (3.1). |
| Field | A property an item definition declares (3.2). |
| Item definition | The list of fields an item has beyond the base properties, with their types, defaults and allowed values (3.2). |
| Team | A named group of people with its own item definition and rule set, held in the team file (3.3). |
| Rule set | The ordered table of rules, the pop table and the filters of a team (3.3, 4.6). |
| Step | The word a rule of the table names, and the second word of `backlog team update <item> <step>` on the branch today. It is waiting for the owner's decision (section 7, choice 1); until decided, the code keeps it. |
| Priority | The place of an item in its branch's list in the index, written `p0`, `p1`, ... (4.2). |
| Index | The file that holds the priority order of each branch (3.5). |
| Backlog location | The git repository that holds the items: the current repository, or one outside it (4.1). |
| Configuration | `.backlog/config.json` at the root of the repository, committed in each branch (3.4). |

## 3. Schemas

Every schema is a JSON Schema of draft 2020-12 and is itself checked against the published specification by `backlog validate` (4.5).

### 3.1 The base item: [item.schema.json](item.schema.json)

An item is one flat JSON object (decision 34). [item.example.json](item.example.json) fits the schema.

| Property | Required | Given by | Meaning |
|---|---|---|---|
| `seq` | yes | CLI | The item's number in its repository folder; never reused (4.2). |
| `slug` | yes | CLI | The number and the title in file-name form. |
| `title` | yes | person | Short title. |
| `description` | yes | person | What the item is about, in markdown. |
| `team` | no | person | The team that owns the item; absent when it has none (decision 29). |
| `repository` | yes | CLI | `owner/name` of the repository the item belongs to. |
| `branch` | yes | CLI | The branch the item belongs to. |
| `created`, `updated` | yes | CLI | Times of creation and of the last change. |
| `updated_by` | yes | CLI | The agent of the command, else the user (4.7). |
| `cli_version` | yes | CLI | The version of the CLI that last wrote the item (decision 48, 4.11). |
| `status` | yes | definition | Declared by every item definition; its values come from the definition. |
| `history` | yes | CLI | One entry per change: `at`, `by`, `session`, `command`, `changes` (each changed property with before and after), `note`. Its structure is fixed in the CLI (decision 45). |
| any other | no | definition | A field of the definition that applies (4.3). |

### 3.2 The item definition: [item-definition.schema.json](item-definition.schema.json)

An item definition is a JSON object whose keys are field names. Each field has a `type` (text, number, boolean, time, person, item, items, list) and may have a `default`, its allowed `values`, the values that are `final` (the item is finished; status only) and a `description`. Every definition declares `status`. No field may take the name of a base property.

There are three places a definition comes from: the `item` of a team in the team file (the team item definition); the file named by `item_definition` in the configuration (the repository's user item definition); and the definition packaged with the CLI (3.7).

### 3.3 The team file and the rule set: [team-file.schema.json](team-file.schema.json)

The team file holds one entry per team, each with `people` (each person with a list of role words), `item` (the team item definition, 3.2) and `rules`. Its location is named in the configuration (`teams_file`; default `.backlog/teams.json`). The CLI only reads it (ruling R5).

`rules` holds:

- `table`: the ordered list of rules. A rule has an `id`, a `step` (see 2), an optional condition `when`, and either `deny` (the text of a refusal) or `do` (the effects).
- `pop`: the ordered list of what `backlog team pop` tries for the caller.
- `filters`: named conditions over the team's items.

How a team command applies them is 4.6.

### 3.4 The configuration: [config.schema.json](config.schema.json)

| Key | Meaning |
|---|---|
| `backlog_repository` | The folder that holds the items, relative to the repository; `.backlog` when they live inside it. |
| `backlog_origin_url` | The address `backlog setup` clones a separate backlog repository from. |
| `push-backlog-updates` | On the branch today, false stops the push. It conflicts with decision 44 (section 8). |
| `user` | The person of the user commands, written by `backlog setup` (git `user.name`, else the login name). |
| `team` | The team a team command acts for when neither flag nor variable names one. |
| `teams_file`, `teams_file_sha` | Where the team file is, and its SHA when last validated. |
| `item_definition` | The repository's user item definition; absent means the packaged one. |
| `archive_folder` | The folder an archived item moves to. |
| `repository_variable`, `branch_variable`, `team_variable`, `agent_variable`, `session_variable` | The names of the environment variables commands read in this repository and branch (decision 31, 4.7). |
| `redact_pii`, `redaction_patterns` | Redaction on or off (default off) and the patterns of this repository (decision 46, 4.9). |
| `migrated_at`, `migrated_by_version` | When the items were converted and by which version. |

### 3.5 The index: [index.schema.json](index.schema.json)

Per branch, the list of the open items in priority order: number, slug, title and status. The place in the list is the priority; nothing else holds it.

### 3.6 The example team file: [teams.example.json](teams.example.json)

Shipped with the CLI in the public repository (decision 35) and valid against 3.3. Three teams:

- `simple`: one agent; status todo, doing, done; an estimate and a result. Rules: only people of the team act; a new item needs an estimate of at most 120 minutes; one item in progress at a time; finishing needs a result; a done item can be archived. Pop offers the next item to start.
- `advanced`: a lead and three members; an item can be split into children, depend on other items, be held by a member and checked by another. Rules cap an item at 60 minutes, let the lead split, let a member claim only an item whose children and dependencies are closed, and require a check by someone other than the holder.
- `lead-and-reviewers`: a lead, members and two outside reviewers; review requests, two review stages, hand-off between members, waiting on a decision, limits a lead can lift. It shows every behaviour the rule format supports, each with the allowed case and the refused case (owner answers of 2026-11-08, round 2).

Each team's item definition and rules are in the file; the examples guide (plan, task 9) walks through each rule in words.

### 3.7 The packaged defaults

- [default-item-definition.json](default-item-definition.json): `status` with the values new, active and closed, closed final, new by default (decisions 25 and 47).
- [default-team.json](default-team.json): one team with that definition and five rules: only people of the team act; `new`; `start` (new to active); `close` (active to closed); `archive` (closed only).

## 4. Behaviour

### 4.1 The backlog location

The backlog location is always a git repository: the current repository (`.backlog`), or a repository outside the current repository's folder named by the configuration (decision 44). A command pulls the backlog before it acts, reading commands included. A command that changes the backlog commits only the files it wrote (items, the index, the number record) and pushes before it exits. When the push is refused, only the command's own commit is taken back, a person's own commits and edits stay, and the command exits 3. A team command publishes its own commit alone and runs again when what it read changed upstream (round 12, question 2). No output names a file or folder of the backlog.

### 4.2 Numbers, slugs and priority

- An item's number is one above the highest number its repository folder ever held; it is never given again, also after archiving (ruling R12).
- The slug is the number and the title in file-name form.
- A priority is written with the prefix `p`: `p0` is the first item of the branch (decision 43). Priority and number are separate (ruling R13).
- A new item is added at the bottom of its branch's priority order (decision 42).
- Setting an item to `pN` puts it at place N; every item that was at N or below moves down by one.
- An item is named in a command by its number (`12`), its slug, or its priority (`p0`).
- A number that two items hold (after a merge outside the CLI) is refused when given; both slugs are named (round 12, question 3).

### 4.3 The definition that applies

For an item of a team: the team item definition. Otherwise: the user item definition named in the configuration, else the packaged one (decision 20). `backlog new` gives every field its default. `backlog update <item> <property> <value>` accepts the base properties `title`, `description`, `status`, `priority` and every field of the definition that applies; the value must have the field's type. A user command does not hold a value to the field's `values` list (owner principle of 2026-11-08). A team command does, and the team's rules apply to the fields they name (decision 38).

### 4.4 History

Every change adds one entry to the item's history (3.1), written by the CLI. A change of priority adds no entry: the index is its own file.

### 4.5 Validation

`backlog validate` checks, in this order: each schema file against the published JSON Schema specification; the team file, every team in it at once, against `team-file.schema.json`, and each rule against what the rule evaluator accepts; the user item definition against `item-definition.schema.json`; every item against `item.schema.json` and the definition that applies (every required field set, every value of its type); every item of a team against its team's rules. Each problem is reported with where it is, why, and what would fix it (decision 49, ruling R11). A team command validates the team file before it acts; any finding in any team stops every team command (round 12, question 4). The file's SHA is kept in the configuration and a valid result is reused for 24 hours (rulings R21, R22).

### 4.6 How a team command applies the rules

For a command on an item, the rules of the table are read in order; the first whose `step` matches and whose `when` holds decides. `deny` refuses with its text, exit 1. `do` applies its effects. If no rule decides, the command is refused.

- Conditions: `all`, `any`, `not`, `is`, `in`, `empty`, `>=`, `<=`, `regex`, `contains`, `every`, `some`.
- Functions: `count`, `length`, `plus`, `age`, `roles_of`, `text`.
- Values a rule reads: `$item` (the item), `$arg` (the arguments of the command, `--<name> <value>`), `$caller` (the agent and its roles), `$team` (its name and items), `$session`, and `$it` inside `every`, `some` and `count`.
- Effects: `set`, `add`, `remove` (fields), `note` (history), `related`, `place` (priority), `archive`, `delete`, `branch`, `team`, `say` (a line to the caller).
- `backlog team pop` walks the pop table and takes the first entry whose step the rules allow for the caller on an item; nothing allowed is the answer idle, exit 3.
- A filter is read with `backlog team query filter <name>`.

### 4.7 Inputs and environment variables

The repository and branch are detected from git when a command starts; when git names no branch, the flag or the variable gives it. The team, agent and session are given by the caller. Each of the five is read from the flag, then the environment variable whose name the configuration gives (decision 31), then the configuration's own value where it has one (ruling R15). Every variable name starts with `SMOOTH_BACKLOG_CLI_` (ruling R20). A team command never reads the user's identity; user commands use the configured `user`. When the team variable is set, every user command fails with "teams are not allowed to use user commands" (ruling R19a). A team command with no team by any of the three ways exits 2 and names all three.

### 4.8 Output and exit codes

User commands print text for people; `--json` prints JSON. Team commands print JSON; `--human` prints text for people (decision 39).

| Exit | Meaning |
|---|---|
| 0 | Succeeded (reading commands and `--whatif` too). |
| 1 | Refused: one line says why; for a team command, the rule's text. |
| 2 | Wrong arguments or place; an item, the team file or the configuration cannot be read. |
| 3 | The backlog could not be synchronised, nothing stays changed; for `backlog team pop`, nothing to offer. |
| 4 | The backlog is not set up. |
| 5 | The item was changed by someone else since the caller read it; nothing written, the item as it is now is printed. |

### 4.9 Redaction

When `redact_pii` is true, each pattern of `redaction_patterns` is applied to the text of an item before it is written, and to every output (decision 46). Credentials in addresses are always redacted in output.

### 4.10 Two writers

A change to an item that someone else changed since the caller last read it is refused with exit 5. Whether two commands running at the same moment in one local copy of the backlog take turns is waiting for the owner (section 7, choice 6).

### 4.11 Setup

`backlog setup`, run inside a repository:

1. finds or creates the backlog location and writes `.backlog/config.json` with its keys (3.4), including the five variable names;
2. when items exist, reads `cli_version` of each; if any is older than the running CLI, stops with exit 2 saying the backlog must first be upgraded with `backlog upgrade` (decision 48);
3. installs or upgrades the backlog skill in every agent folder it finds: `.agents`, `.claude`, `.github`, `.qwen` (decision 37);
4. copies the example team file and the packaged defaults into `.backlog` (ruling R23);
5. commits what it wrote; a second run with nothing new adds no commit; it prints no folder path.

`--ask` asks on a terminal for what is not configured.

### 4.12 Upgrade

`backlog upgrade` installs the latest release of the CLI (`check`, `auto`, `off`, `disable` and `<version>` control the update notice and the version; answer AI of 2026-11-07), then converts every item of the repository's backlog to the running version and records `cli_version` (decision 48).

## 5. Commands

`--help` works on every command and subcommand. `*` marks what the branch does not have yet.

### 5.1 User commands (no rules)

| Command | Flags of the command | Subcommand or property | Flags of the subcommand or property |
|---|---|---|---|
| `backlog` | | *(none): prints the help | |
| `backlog setup` | `--ask`, *`--whatif` | | |
| `backlog new` | *`--title <text>`, *`--description <text>`, `--ask`, *`--whatif`, `--json` | *`--file <item.json>` (an item that fits 3.1) | *`--whatif`, `--json` |
| *`backlog update <item>` | *`--whatif`, `--json`, `--show-all` | `title <text>`, `description <text>`, `status <word>`, `priority p<N>`, `<field> <value>` (each field of the definition that applies) | the flags of the command |
| `backlog list` | `--json`, `--show-all` | `branch <name>` | `--json`, `--show-all` |
| `backlog show <item>` | `--json`, `--show-all` | | |
| `backlog archive <item>` | *`--whatif`, `--json` | | |
| `backlog archive done` | *`--whatif`, `--json` | | |
| `backlog import <branch>` | `--higher`, *`--whatif`, `--json` | | |
| *`backlog branch` | `--json` | `import <branch>` | `--higher`, *`--whatif`, `--json` |
| *`backlog validate` | `--json` | | |
| `backlog upgrade` | | `check`, `auto`, `off`, `disable`, `<version>` | |

### 5.2 Team commands (the team's rules apply; JSON unless `--human`)

Every team command takes `--team <name>`, `--agent <name>`, `--session <id>`, `--repository <owner/name>`, `--branch <name>` and *`--human`; the table lists the others.

| Command | Flags of the command | Subcommand or property | Flags of the subcommand or property |
|---|---|---|---|
| `backlog team new` | *`--title <text>`, *`--description <text>`, `--ask`, *`--whatif`, `--<argument> <value>` of the rules | *`--file <item.json>` | *`--whatif` |
| *`backlog team list` | `--show-all` | `branch <name>` | `--show-all` |
| *`backlog team show <item>` | `--show-all` | | |
| `backlog team update <item>` | *`--whatif` | *`title`, *`description`, *`status`, *`priority p<N>`, *`<field> <value>` (each field of the team item definition); `<step>` with `--<argument> <value>` (the form of today, waiting for choice 1) | *`--whatif` |
| *`backlog team archive <item>` | *`--whatif` | `done` | *`--whatif` |
| *`backlog team import <branch>` | `--higher`, *`--whatif` | | |
| *`backlog team branch` | | `import <branch>` | `--higher`, *`--whatif` |
| `backlog team pop` | *`--whatif` | | |
| `backlog team query` | | `filter <name>`, `check <item> <step>`, `plan`, `rules`, `steps` | `--show-all` on `rules` |
| `backlog team validate` | `--show-all` | | |
| `backlog team migrate` | *`--whatif`, `--ask`, `--show-all` | | |

### 5.3 Removed commands

`backlog next`, `changes`, `fields`, `done`, `move`, `init clean` (decision 41); `backlog history` (decision 15); `backlog team define` and `backlog team workflow` (ruling R5); the flags `--dry-run`, `--body`, `--name`, `--append`, `--claim`, `--section` and its line flags, and every flag that sets one field (decisions 2, 3, 9, 11 to 14).

## 6. The owner's team file

The owner's team file, with the actual rules and item definition of the Cody team, is written to the topology repository (decision 36). It is not in the public repository. It must pass `backlog validate`. It is a deliverable of this work (plan, task 9).

## 7. Choices the lead made, for the owner to confirm

1. **Step.** On the branch today a rule is chosen by a `step` word, and a team update is `backlog team update <item> <step>`. The owner never approved the concept: it entered through the lead's record of the owner's answers of 2026-11-08 (round 3) and the design of 2026-11-09. Decision 38 asks for `backlog team update <item> <property> <value>`. Whether rules are chosen by command and property instead of a step is the owner's decision; until then the code keeps steps.
2. The packaged default item definition declares `status` only (new, active, closed).
3. A user command checks the type of a value, not its `values` list.
4. The keys `item_definition`, `archive_folder`, the five variable keys, `redaction_patterns` (with `find` and `replace`), and the history key `command` (on the branch today it is called `step`).
5. `backlog upgrade` both updates the CLI and converts the items; `backlog team migrate` stays until the owner decides it goes into `backlog upgrade`.
6. The turn-taking of two processes in one local copy stays as it is until the owner decides.
7. The team forms of `archive done`, `import`, `branch` and `branch import`: the owner named `list`, `show` and `archive` among "most of the user commands"; the lead added these four.
10. A command that would change the backlog where the backlog location is not a git repository refuses with exit 4 and names `backlog setup`.
8. The third example team is built from the shipped template with every behaviour (`patterns`), renamed `lead-and-reviewers`; the owner checks that it is the simplified form of his workflow.
9. An item is named by number, slug or priority (`p0`).

## 8. What the schemas or the code define and this document does not yet describe

| What | Where it is defined | What is missing from this document |
|---|---|---|
| The folder layout of the backlog (where item files, the index and the number record live) | code (`src/shared/store.js`, `src/shared/item-file.js`) | the layout and the file names |
| The number record (`numbers.json`) | code (`src/shared/numbers.js`) | its content and when it is written |
| The recovery journal of a change of several files | code (`src/shared/store.js`) | what is journalled and how a killed command is finished |
| The lock of the local copy and its wait | code (`src/shared/store.js`) | waiting for choice 6 |
| Where a caller's last read of an item is recorded (for exit 5) | code (`src/shared/seen.js`) | the record and its place |
| The per-user state folder and the 24-hour record of a valid team file | code (`src/team/teams-load.js`) | the folder and the record |
| `push-backlog-updates` | configuration on the branch today | conflicts with decision 44; to remove or to justify |
| The slug: characters kept, length | code (`src/shared/sequence.js`) | the rule |
| What `backlog list` and `backlog show` print for people | code (`src/shared/read.js`, `src/shared/query.js`) | the columns and the form |
| `backlog import` and `backlog branch import` | code (`src/shared/move.js`) | they do the same thing on the branch today; how they differ, if they do |
| `archive done`: which items count as done | code | the final values of the definition that applies |
| An item that cannot be read: exit 2 naming the field, and the repair | code (`src/shared/repair.js`) | the command that repairs it, now that `--restore` and the field flags go |
| `--ask` without a terminal | code | exit 2, nothing written |
| The effects `related`, `place`, `branch`, `team`, `delete`, `say` | rule evaluator (`src/team/rules/step.js`) | what each does |
| The functions `count`, `length`, `plus`, `age`, `roles_of`, `text` and each condition | rule evaluator (`src/team/rules/expression.js`) | what each does |
| `$session` and `$caller` | rule evaluator | their keys |
| The pop table's skip set and queue order | rule evaluator (`src/team/rules/pop.js`) | the order items are tried in |
| The update notice: weekly check, wait at most 1.5 s, warning only | code (`src/upgrade.js`) | the schedule and where its settings live |
| The run recorder hook, `SMOOTH_BACKLOG_CLI_RUN_HOOK` | code | waiting for the owner |
| Git 2.40 or newer for team commands | code | the requirement |
| The redaction of credentials in addresses | code (`src/shared/safety.js`) | the patterns |
| The repository name from git (origin `owner/name`) | code | what happens with no origin |
| The validation of a team file: every check `backlog team validate` makes | code (`src/team/rules/validate*.js`) | the list of checks |
