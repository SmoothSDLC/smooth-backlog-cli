# Behaviour specification of the CLI

Status: the product requirements and the behaviour of the CLI when the simplify branch is finished (2026-11-15). Section 9 holds every behaviour scenario (BDD) and section 10 every requirement with its reason; the team rules and redaction have their own specifications, [team-rules-spec.md](team-rules-spec.md) and [redaction-spec.md](redaction-spec.md). The implementation plan, [2026-11-15-definition-driven-cli-implementation.md](../2026-11-15-definition-driven-cli-implementation.md), points to the sections and scenarios each slice builds.

**This specification is incomplete until the four decisions of section 8 are taken.** Each is presented to the owner with its options; the sections they affect say so where they do.

## Contents

1. [The pattern](#1-the-pattern)
2. [Terms](#2-terms)
3. [Schemas](#3-schemas) (the team rules and redaction have their own specifications and schemas: [team-rules-spec.md](team-rules-spec.md) with [team-rules.schema.json](team-rules.schema.json), [redaction-spec.md](redaction-spec.md) with [redaction.schema.json](redaction.schema.json)): 3.1 the base item, 3.2 the item definition, 3.3 the team file and the rule set, 3.4 the configuration, 3.5 the index, 3.6 the example team file, 3.7 the packaged defaults
4. [Behaviour](#4-behaviour): 4.1 the backlog location, 4.2 numbers, slugs and priority, 4.3 the definition that applies, 4.4 history, 4.5 validation, 4.6 how a team command applies the rules, 4.7 inputs and environment variables, 4.8 output and exit codes, 4.9 redaction, 4.10 two writers, 4.11 setup, 4.12 upgrade, 4.13 storage and local state, 4.14 other behaviour
5. [Commands](#5-commands): 5.1 user commands, 5.2 team commands, 5.3 removed commands
6. [The owner's team file](#6-the-owners-team-file)
7. [Decisions the lead took from earlier decisions](#7-decisions-the-lead-took-from-earlier-decisions)
8. [Open decisions that block this specification](#8-open-decisions-that-block-this-specification)
9. [Behaviour scenarios](#9-behaviour-scenarios)
10. [Requirements and their reasons](#10-requirements-and-their-reasons)

## 1. The pattern

The CLI's code holds no workflow. Its user commands create, change, list, show and archive items, and move them between branches. Every item has the same base properties (3.1). Every other field of an item comes from an item definition (3.2), which is data. Every rule comes from a team's rule set (3.3), which is data, and is applied only by team commands. User commands apply no rule.

There are two sets of commands, never aliases of each other:

- **User commands** (`backlog <command>`) apply no rule. They act on items that have no team. With `--show-all` they also read, and change, items of a team, still applying no rule (D-7 and D-29).
- **Team commands** (`backlog team <command>`) are the same commands for the items of one team, with the team's rules applied, and print JSON unless `--human` is given (D-38 and D-39).

## 2. Terms

| Term | Meaning |
|---|---|
| Item | One unit of work, stored as one JSON file (3.1). |
| Base property | A property every item has, whatever its definition: the number, slug, title, description, team, repository, branch, times, writer, CLI version, status and history (3.1). |
| Field | A property an item definition declares (3.2). |
| Item definition | The list of fields an item has beyond the base properties, with their types, defaults and allowed values (3.2). |
| Team | A named group of people with its own item definition and rule set, held in the team file (3.3). |
| Change | What a team command would do to one item: the item before and the item after (team rules spec, 2). |
| Rule | A guard: when a condition holds for a change, another must hold too, or the change is refused with the rule's error text. Every rule of a team is evaluated on every change; no command names a rule and no rule sets a value (D-53 and D-58 to 59). |
| Rule set | A team's rules, queue and filters (3.3, [team-rules-spec.md](team-rules-spec.md)). |
| Priority | The place of an item in its branch's list in the index, written `p0`, `p1`, ... (4.2). |
| Index | The file that holds the priority order of each branch (3.5). |
| Backlog location | The git repository that holds the items: the current repository, or one outside it (4.1). |
| Configuration | `.backlog/config.json` at the root of the repository, committed in each branch (3.4). |

## 3. Schemas

Every schema is a JSON Schema of draft 2020-12 and is itself checked against the published specification by `backlog validate` (4.5).

### 3.1 The base item: [item.schema.json](item.schema.json)

An item is one flat JSON object (D-34). [item.example.json](item.example.json) fits the schema.

| Property | Required | Given by | Meaning |
|---|---|---|---|
| `seq` | yes | CLI | The item's number in its repository folder; never reused (4.2). |
| `slug` | yes | CLI | The number and the title in file-name form. |
| `title` | yes | person | Short title. |
| `description` | yes | person | What the item is about, in markdown. |
| `team` | no | person | The team that owns the item; absent when it has none (D-29). |
| `repository` | yes | CLI | `owner/name` of the repository the item belongs to. |
| `branch` | yes | CLI | The branch the item belongs to. |
| `created`, `updated` | yes | CLI | Times of creation and of the last change. |
| `updated_by` | yes | CLI | The agent of the command, else the user (4.7). |
| `cli_version` | yes | CLI | The version of the CLI that last wrote the item (D-48, 4.11). |
| `status` | yes | definition | Declared by every item definition; its values come from the definition. |
| `history` | yes | CLI | One entry per change: `at`, `by`, `session`, `command`, `changes` (each changed property with before and after), `note`. Its structure is fixed in the CLI (D-45). |
| any other | no | definition | A field of the definition that applies (4.3). |

### 3.2 The item definition: [item-definition.schema.json](item-definition.schema.json)

An item definition is a JSON object whose keys are field names. Each field has a `type` (text, number, boolean, time, person, item, items, list) and may have a `default`, its allowed `values`, the values that are `final` (the item is finished; status only) and a `description`. Every definition declares `status`. No field may take the name of a base property.

There are three places a definition comes from: the `item` of a team in the team file (the team item definition); the file named by `item_definition` in the configuration (the repository's user item definition); and the definition packaged with the CLI (3.7).

### 3.3 The team file and the rule set: [team-file.schema.json](team-file.schema.json)

The team file holds one entry per team, each with `people` (each person with a list of role words), `item` (the team item definition, 3.2) and `rules`. Its location is named in the configuration (`teams_file`; default `.backlog/teams.json`). The CLI only reads it (R5).

`rules` is the team's rule set. Its form is [team-rules.schema.json](team-rules.schema.json) and its meaning is [team-rules-spec.md](team-rules-spec.md): what triggers the rules, how a change is evaluated, the guard form of a rule (`when`, `require`, `error`), the evaluation context (`prev`, `next`, `caller`, `team`, ...), conditions in JsonLogic evaluated by json-logic-js, each kind of rule with examples (transition, field, lock, permission, relation, creation), how rules relate through fields, the queue and filters, error texts, and the validation of the rules. Each team may carry a `description` of its way of working in words (D-56).

### 3.4 The configuration: [config.schema.json](config.schema.json)

| Key | Meaning |
|---|---|
| `backlog_repository` | The folder that holds the items, relative to the repository; `.backlog` when they live inside it. |
| `backlog_origin_url` | The address `backlog setup` clones a separate backlog repository from. |
| `user` | The person of the user commands, written by `backlog setup` (git `user.name`, else the login name). |
| `team` | The team a team command acts for when neither flag nor variable names one. |
| `teams_file`, `teams_file_sha` | Where the team file is, and its SHA when last validated. |
| `item_definition` | The repository's user item definition; absent means the packaged one. |
| `archive_folder` | The folder an archived item moves to. |
| `repository_variable`, `branch_variable`, `team_variable`, `agent_variable`, `session_variable` | The names of the environment variables commands read in this repository and branch (D-31, 4.7). |
| `push-backlog-updates` | true by default: the commits the CLI makes are pushed; false keeps them local (D-76). |
| `redact_pii`, `redaction_rules` | Redaction of personal data on or off (default off) and the repository's own redaction rules ([redaction-spec.md](redaction-spec.md)). |
| `migrated_at`, `migrated_by_version` | When the items were converted and by which version. |

### 3.5 The index: [index.schema.json](index.schema.json)

Per branch, the list of the open items in priority order: number, slug, title and status. The place in the list is the priority; nothing else holds it.

### 3.6 The example team file: [teams.example.json](teams.example.json)

Shipped with the CLI in the public repository (D-35) and valid against 3.3. Three teams:

- `simple`: one agent; status todo, doing, done; an estimate and a result; six rules (people only, size on creation, the allowed moves of status, one item doing, done needs a result, archive only done); the queue takes the next todo item.
- `advanced`: a lead and three members; status new, ready, active, checking, closed; holder, checker, parent, dependencies; twelve rules, among them permission rules, a relation rule over the dependencies, a rule counting a member's active items, and a lock on the holder of an active item; the queue gives a member its checks first, then takes ready work for it (setting holder and status in one change).
- `lead-and-reviewers`: a lead, members, a reviewer and an outside reviewer; two reviews counted in a field the reviewer raises, hand-off by the holder, waiting for a decision of the lead; fourteen rules; the queue serves reviewers, members and the lead.

Each team's `description` says its way of working in words. The examples guide (plan, task 12) explains every rule, and shows for each the change it allows and the change it refuses with its text.

### 3.7 The packaged defaults

- [default-item-definition.json](default-item-definition.json): `status` with the values new, active and closed, closed final, new by default (D-25 and D-47).
- [default-team.json](default-team.json): one team with that definition and five rules: only people of the team act; `new`; `start` (new to active); `close` (active to closed); `archive` (closed only).

## 4. Behaviour

### 4.1 The backlog location

The backlog location is always a git repository: the current repository (`.backlog`), or a repository outside the current repository's folder named by the configuration (D-44). A command pulls the backlog before it acts, reading commands included. A command that changes the backlog commits only the files the CLI changed (items, the index, the number record), never other changed files of the repository, and pushes only the commits the CLI made, unless `push-backlog-updates` is false (D-76 and D-77). When the push is refused, only the command's own commit is taken back, a person's own commits and edits stay, and the command exits 3. A team command publishes its own commit alone and runs again when what it read changed upstream (Q12-2). No output names a file or folder of the backlog.

### 4.2 Numbers, slugs and priority

- An item's number is one above the highest number its repository folder ever held; it is never given again, also after archiving (R12).
- The slug is the number and the title in file-name form.
- A priority is written with the prefix `p`: `p0` is the first item of the branch (D-43). Priority and number are separate (R13).
- A new item is added at the bottom of its branch's priority order (D-42).
- Setting an item to `pN` puts it at place N; every item that was at N or below moves down by one.
- An item is named in a command by its number (`12`), its slug, or its priority (`p0`).
- A number that two items hold (after a merge outside the CLI) is refused when given; both slugs are named (Q12-3).

### 4.3 The definition that applies

For an item of a team: the team item definition. Otherwise: the user item definition named in the configuration, else the packaged one (D-20). `backlog new` gives every field its default. `backlog update <item> <property> <value>` accepts the base properties `title`, `description`, `status`, `priority` and every field of the definition that applies; the value must have the field's type. A user command does not hold a value to the field's `values` list (owner principle of 2026-11-08). A team command does, and the team's rules apply to the fields they name (D-38).

### 4.4 History

Every change adds one entry to the item's history (3.1), written by the CLI. A change of priority adds no entry: the index is its own file.

### 4.5 Validation

`backlog validate` checks with Ajv (D-62), in this order: each schema file against the published JSON Schema specification; the team file, every team in it at once, against `team-file.schema.json` and `team-rules.schema.json` with Ajv, and the rules by the checks of [team-rules-spec.md](team-rules-spec.md) section 11; the user item definition against `item-definition.schema.json`; every item against `item.schema.json` and the definition that applies (every required field set, every value of its type); every item of a team against its team's rules. Each problem is reported with where it is, why, and what would fix it (D-49, ruling R11). A team command validates the team file before it acts; any finding in any team stops every team command (Q12-4). The file's SHA is kept in the configuration and a valid result is reused for 24 hours (rulings R21, R22).

### 4.6 How a team command applies the rules

Every team command that would change an item builds the change (`prev` and `next`) and evaluates it: first the structure (schema and team item definition, checked with Ajv), then every rule (with json-logic-js). If every rule holds, the change is written with one history entry; otherwise nothing is written, exit 1, and every failing rule's text is returned. `--whatif` evaluates and writes nothing. The full specification is [team-rules-spec.md](team-rules-spec.md).

### 4.7 Inputs and environment variables

The repository and branch are detected from git when a command starts; when git names no branch, the flag or the variable gives it. The team, agent and session are given by the caller. Each of the five is read from the flag, then the environment variable whose name the configuration gives (D-31), then the configuration's own value where it has one (R15). Every variable name starts with `SMOOTH_BACKLOG_CLI_` (R20). A team command never reads the user's identity; user commands use the configured `user`. When the team variable is set, every user command fails with "teams are not allowed to use user commands" (R19a). A team command with no team by any of the three ways exits 2 and names all three.

### 4.8 Output and exit codes

User commands print text for people; `--json` prints JSON. Team commands print JSON; `--human` prints text for people (D-39).

| Exit | Meaning |
|---|---|
| 0 | Succeeded (reading commands and `--whatif` too). |
| 1 | Refused: one line says why; for a team command, the rule's text. |
| 2 | Wrong arguments or place; an item, the team file or the configuration cannot be read. |
| 3 | The backlog could not be synchronised, nothing stays changed; for `backlog team pop`, nothing to offer. |
| 4 | The backlog is not set up. |
| 5 | The item was changed by someone else since the caller read it; nothing written, the item as it is now is printed. |

### 4.9 Redaction

Redaction rules are evaluated on every change, for every command that changes an item; commands that only read evaluate none; their form, their sources (the packaged defaults and the repository's `redaction_rules`), the switch `redact_pii` and the order are specified in [redaction-spec.md](redaction-spec.md).

### 4.10 Two writers

A change to an item that someone else changed since the caller last read it is refused with exit 5. Whether two commands running at the same moment in one local copy of the backlog take turns is open: section 8, decision A.

### 4.11 Setup

`backlog setup`, run inside a repository:

1. finds or creates the backlog location and writes `.backlog/config.json` with its keys (3.4), including the five variable names;
2. when items exist, reads `cli_version` of each; if any is older than the running CLI, stops with exit 2 saying the backlog must first be upgraded with `backlog upgrade` (D-48);
3. installs or upgrades the backlog skill in every agent folder it finds: `.agents`, `.claude`, `.github`, `.qwen` (D-37);
4. copies the example team file and the packaged defaults into `.backlog` (R23);
5. commits what it wrote; a second run with nothing new adds no commit; it prints no folder path.

`--ask` asks on a terminal for what is not configured.

### 4.12 Upgrade

`backlog upgrade` installs the latest release of the CLI (`check`, `auto`, `off`, `disable` and `<version>` control the update notice and the version; answer AI of 2026-11-07), then converts every item of the repository's backlog to the running version and records `cli_version` (D-48). What it does with a value in a field the definition that applies does not declare is open: section 8, decision D. Whether `backlog team migrate` becomes part of it is open: section 8, decision C.

### 4.13 Storage and local state

- **Folder of a repository.** In a separate backlog repository, the items of a repository live in `<owner>/<name>/`; inside the repository, in `.backlog/`. A repository with no origin is named `local/<folder name>`.
- **Files.** Open items are `phases/<slug>.json`; archived items move under the `archive_folder` (default `archive`). `index.json` holds the priority order (3.5). `numbers.json` holds `{"last": <n>}`, the highest number handed out.
- **Next number.** One above the highest number the folder ever held: the item file names in the history of every branch of the backlog repository, every value `numbers.json` ever had, and the files and `numbers.json` present (R12).
- **Slug.** The number padded to three digits, a hyphen, and the title in lowercase with every run of other characters than letters and digits replaced by one hyphen, hyphens at the ends removed (`012-fix-the-login-page`); a title with no letter or digit gives `item`.
- **Local state.** In the `.git` folder of the backlog repository's local copy, or in `.backlog/.state` when the items live inside the repository (never committed): the lock and its wait (decision A of section 8), the recovery journal, the record of what each agent last read, and the per-user record of a valid team file (`smooth-backlog-cli/teams-validation/`).
- **Recovery journal.** Before a command writes several files, it writes their earlier content to the journal on disk. A command killed in the middle leaves the journal; the next command restores those files before it acts.
- **What an agent last read.** A command that shows an item to an agent records the item's `updated`, `updated_by` and the backlog commit in `smooth-backlog-cli-views/<agent>.json`; a later change by that agent is refused with exit 5 when the item changed since (4.10). An item the agent never read is written without the check.

### 4.14 Other behaviour

- **Printed lists.** `backlog list` prints one line per item: the priority (`p0`), the number, the slug and the status; `--json` prints the items. `backlog show` prints every property and the history, one entry per line.
- **`--ask` without a terminal** exits 2 and writes nothing.
- **Messages about the backlog location.** A message the CLI writes that names the address of the backlog repository leaves out the credential part of the address (between `://` and the last `@`). This is not a redaction rule; it applies to the CLI's own messages.
- **Unreadable item.** A command that meets an item it cannot read exits 2 naming the item and the property; the ways out are `backlog update <item> <property> <value>`, `backlog update <item> restore` (its previous version), and, for an unreadable number, `backlog update <slug> seq <n>` (D-72).
- **`archive done`** archives the items of the branch whose status is a `final` value of the definition that applies.
- **`backlog import <branch>`** and **`backlog branch import <branch>`** do the same thing (D-74): the open items of that branch come to the current branch, after its items, before them with `--higher`.
- **The update notice.** Its settings are in `smooth-backlog-cli/config.json` of the user's configuration folder (`$XDG_CONFIG_HOME`, else `~/.config`), never in a repository: `weekly` on by default, `auto` off. A command run at a terminal checks for a release beside its work when the last check is older than seven days (24 hours with `auto`, one hour after a failed check), waits for it at most 1.5 seconds after its own work, and only prints a warning on standard error.
- **Git.** Team commands need git 2.40 or later; an older git is refused with exit 2.

## 5. Commands

`--help` works on every command and subcommand. `*` marks what the branch does not have yet.

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
| `backlog import <branch>` | `--higher`, *`--whatif`, `--json` | | |
| *`backlog branch` | `--json` | `import <branch>` | `--higher`, *`--whatif`, `--json` |
| *`backlog validate` | `--json` | | |
| `backlog upgrade` | | `check`, `auto`, `off`, `disable`, `<version>` | |

### 5.2 Team commands (the team's rules apply; JSON unless `--human`)

Every team command takes `--team <name>`, `--agent <name>`, `--session <id>`, `--repository <owner/name>`, `--branch <name>` and *`--human`; the table lists the others.

| Command | Flags of the command | Subcommand or property | Flags of the subcommand or property |
|---|---|---|---|
| `backlog team new` | *`--title <text>`, *`--description <text>`, *`--<field> <value>` (each field of the team item definition), `--ask`, *`--whatif` | *`--file <item.json>` | *`--whatif` |
| *`backlog team list` | `--show-all`, *`--filter <name>` | `branch <name>` | `--show-all`, *`--filter <name>` |
| *`backlog team show <item>` | `--show-all` | | |
| *`backlog team update <item>` | *`--whatif` | `title <text>`, `description <text>`, `status <word>`, `priority p<N>`, `<field> <value>` (each field of the team item definition); every rule of the team is evaluated on the change | *`--whatif` |
| *`backlog team archive <item>` | *`--whatif` | `done` | *`--whatif` |
| *`backlog team import <branch>` | `--higher`, *`--whatif` | | |
| *`backlog team branch` | | `import <branch>` | `--higher`, *`--whatif` |
| `backlog team pop` | *`--whatif` | | |
| `backlog team query` | | `plan` (what the queue offers each person), `rules` (the rule set) | `--show-all` on `rules` |
| `backlog team validate` | `--show-all` | | |
| `backlog team migrate` (open: section 8, decision C) | *`--whatif`, `--ask`, `--show-all` | | |

### 5.3 Removed commands

`backlog next`, `changes`, `fields`, `done`, `move`, `init clean` (D-41); `backlog history` (D-15); `backlog team define` and `backlog team workflow` (R5); `backlog team update <item> <step>`, `backlog team query check`, `query steps`, `query filter` (replaced by `backlog team list --filter`) and every step word (D-53 and D-54); the flags `--dry-run`, `--body`, `--name`, `--append`, `--claim`, `--section` and its line flags, and every flag that sets one field (D-2, D-3, 9, 11 to 14).

## 6. The owner's team file

The owner's team file, with the actual rules and item definition of the owner's team, is kept in the owner's private repository (D-36). It is not in this public repository. It must pass `backlog validate`. It is a deliverable of this work (plan, task 9).

## 7. Decisions the lead took from earlier decisions

Each is recorded in section 10 with the earlier decision it follows from (D-64 to D-72, 74 and 75): the packaged definition declares `status` alone; user commands check types, not value lists; the key names; the team forms of every user command; the third example team written from the owner's actual team file; an item named by number, slug or `p0`; exit 4 when the backlog location is not a git repository; `backlog archive --show-all`; `backlog update <item> restore` and `seq <n>` for unreadable items; `push-backlog-updates` kept, true by default (D-76); `import` and `branch import` the same; `re2` for regular expressions.

## 8. Open decisions that block this specification

The lead cannot take these from the owner's earlier decisions. Each is presented to the owner with its options; until each is taken, the sections named stay incomplete.

| Decision | Sections it blocks |
|---|---|
| A. Whether two commands running at the same moment in one local copy of the backlog take turns (today a lock file and the variable `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS`) | 4.10, 4.13 |
| B. Whether the run recorder (the variable `SMOOTH_BACKLOG_CLI_RUN_HOOK`, which starts a program the user names on every command) stays | 4.7, 5 |
| C. Whether `backlog team migrate` goes into `backlog upgrade` | 4.12, 5.2 |
| D. What `backlog upgrade` and `backlog validate` do with a value in a field the definition that applies does not declare | 3.1, 4.5, 4.12 |

## 9. Behaviour scenarios

Each scenario is one behaviour: the situation, the command as typed, and what must be true after. Ids are stable; each slice of the implementation plan names the scenarios it makes pass. `*` marks a scenario the branch does not pass today. Every scenario runs in both storage places: the backlog inside the repository, and a separate backlog repository.

### User commands

#### `backlog` (5.1)
- *U-HELP-1. When `backlog` is run. Then the help is printed, exit 0, nothing changes.
- *U-HELP-2. When `backlog next`, `changes`, `fields`, `done`, `move`, `history` or `init clean` is run. Then exit 2: no such command (5.3).

#### `backlog setup` (4.11)
- U-SETUP-1. Given a repository with no `.backlog`. When `backlog setup` is run. Then `.backlog/config.json` exists and is committed, and no folder path is printed.
- *U-SETUP-2. Then the configuration holds `archive_folder`, the five variable keys (each naming a variable that starts with `SMOOTH_BACKLOG_CLI_`) and `redact_pii` false, and fits `config.schema.json`.
- *U-SETUP-3. Given the repository has `.claude` and `.github` folders. Then the skill is installed in `.claude/skills/backlog` and `.github/skills/backlog`, and in no folder that does not exist. Given an older skill there, it is replaced.
- *U-SETUP-4. Then `teams.example.json` and the packaged defaults are in `.backlog`.
- *U-SETUP-5. Given items exist and one has a `cli_version` older than the running CLI. When `backlog setup` is run. Then exit 2, the message says to run `backlog upgrade` first, no skill is installed and nothing changes.
- U-SETUP-6. When `backlog setup` is run a second time with nothing new. Then no commit is added.
- U-SETUP-7. Given a terminal. When `backlog setup --ask` is run. Then it asks for what is not configured.

#### `backlog new` (4.2, 4.3)
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

#### `backlog update <item> <property> <value>` (4.2, 4.3)
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
- *U-UPD-13. Given item 12 cannot be read: `backlog show 12` exits 2 naming the property; `backlog update 12 restore` brings back its previous version; `backlog update 012-fix-login seq 12` repairs an unreadable number.
- *U-UPD-12. `backlog update p0 title "X"` changes the item at priority 0; `backlog update 0 title "X"` is refused because no item has number 0.

#### `backlog list` and `backlog show <item>` (4.2, 4.8)
- U-LIST-1. `backlog list` prints the items of the current branch in priority order, without the items of teams.
- *U-LIST-2. Each row shows the priority as `p0`, `p1`, ...
- U-LIST-3. `backlog list --show-all` lists the items of teams too, each with its team.
- *U-LIST-4. `backlog list --json` prints flat items with `title` and `description`.
- U-LIST-5. `backlog list branch feature-x` lists that branch.
- U-LIST-6. With no item it says the backlog is empty and names no folder.
- U-SHOW-1. `backlog show 12` prints the whole item with its history; `backlog show p0` prints the item at priority 0.
- U-SHOW-2. Given item 20 belongs to a team: `backlog show 20` answers that there is no such item; with `--show-all` it is printed.
- U-SHOW-3. Given two items hold number 57: `backlog show 57` names both slugs.

#### `backlog archive` (5.1)
- *U-ARCH-1. `backlog archive 12` moves the item into `archive_folder`, keeps its status, takes it out of the index; its number is never given again.
- *U-ARCH-2. With `--whatif` it says what would be archived; nothing moves.
- *U-ARCH-3. Given item 20 belongs to a team: `backlog archive 20` exits 1 naming `backlog team archive`.
- *U-ARCH-5. `backlog archive 20 --show-all` archives an item of a team without rules.
- U-ARCH-4. `backlog archive done` archives every item of the branch whose status is a final value of its definition.

#### `backlog import` and `backlog branch` (5.1)
- U-IMP-1. `backlog import feature-x` brings the open items of branch `feature-x` to the current branch, after the current branch's items; with `--higher` before them.
- *U-BR-1. `backlog branch` lists the branches that have items.
- *U-BR-2. `backlog branch import feature-x` does what U-IMP-1 does.

#### `backlog validate` (4.5)
- *U-VAL-1. Given valid files. Then exit 0.
- *U-VAL-2. Given a schema file that is not valid JSON Schema 2020-12. Then it is reported.
- *U-VAL-3. Given a team file with two teams, one with a broken rule. Then the whole file is reported invalid, the problem named with its team, rule, reason and fix.
- *U-VAL-4. Given a user item definition that does not fit `item-definition.schema.json`. Then it is reported.
- *U-VAL-5. Given an item missing a required field of its definition, or an item of a team whose values a team rule forbids. Then each is reported with the item and the field.

#### `backlog upgrade` (4.12)
- U-UPG-1. `backlog upgrade`, `upgrade check`, `auto`, `off`, `disable` and `<version>` and the update notice behave as on the branch today.
- *U-UPG-2. Given items written by an older version. When `backlog upgrade` is run. Then every item is converted to the running version and has its `cli_version`.

#### Every command (4.1, 4.9)
- U-SYNC-1. The backlog is pulled before a command acts; a change is committed and pushed before it exits.
- U-SYNC-2. A refused push takes back only the command's own commit, exit 3; a person's commits stay.
- U-SYNC-3. No output names a file or folder of the backlog; credentials in addresses are redacted.
- *U-SYNC-4. Given the backlog location is not a git repository. When a command that changes the backlog is run. Then exit 4 naming `backlog setup`, nothing written.
- *U-RED-1. Given `redact_pii` true and the repository rules of `redaction.example.json`. When `backlog new --title "Ping build01.corp.example.com" --description "Customer CUST-123456 wrote to ann@example.org"` is run. Then the stored title is `Ping [internal host]`, the description `Customer CUST-****** wrote to [redacted e-mail]`, and the output names `title` and `description` as redacted.
- *U-RED-2. Given `redact_pii` false. Then the e-mail address is stored as given, and a GitHub token in a description is still replaced (a rule marked `always`).
- *U-RED-3. Every change is redacted: `backlog update 12 description "token ghp_..."` and `backlog team update 20 result "..."` store the redacted text, and the team rules see the redacted value.
- *U-RED-5. `backlog validate` reports a redaction rule whose `find` is not valid RE2 syntax, and a `properties` name no definition declares.
- *U-SYNC-5. Given another file of the repository is changed and not committed. When `backlog new ...` is run with the backlog inside the repository. Then the CLI's commit holds only `.backlog` files, and the other file stays changed and uncommitted.
- *U-SYNC-6. Given a person's own commit not yet pushed. When `backlog new ...` is run. Then only the CLI's commit is pushed; the person's commit stays local.
- *U-SYNC-7. Given `push-backlog-updates` false. Then the CLI commits and does not push.

### Team commands

#### Inputs and output (4.7, 4.8)
- T-IN-1. The team is the `--team` flag, else the variable, else the `team` key; a flag wins.
- *T-IN-2. Given `team_variable` is `SMOOTH_BACKLOG_CLI_WEB_TEAM`. Then that variable is read and `SMOOTH_BACKLOG_CLI_TEAM_NAME` is not; the same for the other four keys.
- *T-IN-3. Given two repositories whose configurations name different variables, both set in one environment. Then a command in each acts for its own team.
- T-IN-4. With no team by any way: exit 2 naming all three ways.
- T-IN-5. Given a team file with a finding in any team: every team command stops, nothing changes.
- *T-OUT-1. Every team command prints JSON; with `--human` it prints text for people; `--json` is not a flag of team commands.

#### Team forms of the user commands (D-38)
- *T-NEW-1. `backlog team new --team web --agent lead-1 --title "Parse the header" --description "..."`, a rule allowing it: the item has its team, the team definition's fields at their defaults, and what the rule set.
- T-NEW-2. A rule fails: exit 1 with the rule's error, no number used, nothing written.
- *T-LIST-1. `backlog team list --team web` lists the team's items of the branch in priority order; with `--show-all` every team's.
- *T-SHOW-1. `backlog team show 20 --team web` prints the item.
- *T-UPD-1. `backlog team update 20 estimate 30 --team web --agent member-1`, `estimate` a field of the team definition and no rule failing: the field is set and the history names the agent.
- *T-UPD-2. A rule fails: exit 1 with its error, nothing changes.
- *T-UPD-3. A value outside the field's `values` list: exit 1.
- *T-UPD-5. With `--whatif` the answer is given and nothing changes.
- *T-ARCH-1. `backlog team archive 20 --team web --agent lead-1` archives the item when a rule allows it; `backlog team archive done` archives every finished item the rules allow.
- *T-IMP-1. `backlog team import feature-x` and `backlog team branch import feature-x` move the team's open items of that branch here when the rules allow.

#### The rules engine ([team-rules-spec.md](team-rules-spec.md)); examples from the `advanced` team of `teams.example.json`
- *T-RULE-1. Every rule is evaluated on every change: `backlog team update 7 estimate 90` on a ready item fails rule `size` (at most 60) although the status does not change.
- *T-RULE-2. Transition: `backlog team update 7 status closed` on an `active` item fails rule `flow` with "status does not move from active to closed".
- *T-RULE-3. Several failures: a change that fails two requirements returns both messages, in JSON `{"refused": [...]}`, and with `--human` one line each.
- *T-RULE-4. Guard on the caller's own value: `backlog team update 3 status active --agent member-2` on a ready item whose holder is not member-2 fails rule `holder-is-caller`; after `backlog team update 3 holder member-2 --agent member-2`, the same status change passes.
- *T-RULE-5. Rules relate only through fields: no rule sets a value; the history entry of a change lists only the properties the caller changed.
- *T-RULE-6. Relation: an item with a dependency not closed fails rule `dependencies` with "item 3 waits for the items it depends on".
- *T-RULE-7. Permission: `backlog team update 7 status closed --agent member-1` when member-1 is not the checker fails rule `checker-closes`.
- *T-RULE-8. No rule is named by a caller: there is no command or flag that takes a rule id or a step.
- *T-RULE-9. Validation finds: a rule reading an undeclared field; a literal compared with a field that is not one of its `values`; an unknown operator; a rule whose `require` cannot hold under its own `when`; two rules on the same transition requiring one field to equal two different literals; an `error` reading an unknown path; `==` or `!=` (a warning). Each is reported with the team, the rule's id or place, the reason and the fix, and the whole team file is invalid.
- *T-RULE-10. With `--whatif` a change is evaluated and nothing written.
- *T-RULE-11. The rules of `teams.example.json` give, through json-logic-js with the extra operators, the results the examples guide states for each team (a test runs them).

#### `backlog team pop`, `query`, `validate`, `migrate`
- *T-POP-1. `backlog team pop --team web --agent member-1`: for the first queue entry of the member's roles that has a matching item, the first such item in priority order is offered; with `take`, the item is changed with those values and every rule applies; a refused item is skipped for the next.
- T-POP-2. Nothing allowed: idle, exit 3.
- *T-POP-3. With `--whatif` the offer is printed and nothing taken.
- *T-QRY-1. `backlog team list --filter waiting` lists the items the filter matches; `backlog team query plan` lists what the queue offers each person; `backlog team query rules` prints the rule set. `backlog team query check`, `query steps` and `query filter`: exit 2, no such command.
- T-VAL-1. `backlog team validate` exits 0 on a valid team file; on a broken rule it reports where, which rule, why and the fix.
- *T-VAL-2. The packaged default team and the three teams of `teams.example.json` pass `backlog team validate` and `backlog validate`.
- T-MIG-1. `backlog team migrate` converts markdown items to JSON items, reports every missing or invalid field, records the migration; `--ask` repairs one field at a time.
- *T-MIG-2. With `--whatif` it converts nothing.

### The whole code
- *G-ITEM-1. No item file has a `fields` object; every item fits `item.schema.json`.
- *G-CODE-1. No source file outside the packaged data names a status word, review, claim, holder, link between items, parent, limit or hand-off; a test reads the source and fails on any.
- *G-CODE-2. The five session inputs are read by the variable names the configuration gives; no other variable is read by a fixed name except those that find the backlog.
- *G-DOC-1. Every help points to the documents folder of the public repository; `README.md`, `COMMANDS.md`, the skill and `CHANGELOG.md` describe exactly the commands of the specification, and a test compares them with the help.
- *G-TOPO-1. The owner's team file in the owner's private repository passes `backlog validate` (D-36).

## 10. Requirements and their reasons

Every requirement the owner set that is in force, with the reason or the earlier requirement it follows from. `D-n` are the owner's decisions and the lead's decisions taken from them (the lead's are marked so), `R-n` the owner's rulings of 2026-11-09, `Q12-n` the owner's answers of 2026-11-09 round 12. A requirement no longer in force is in `.backlog/archived/`.

### Owner decisions of 2026-11-13 and 2026-11-14

- **D-1.** `backlog` with no command word prints the help. It no longer runs `backlog next`.
- **D-2.** The flag `--dry-run` is named `--whatif` on every command that has it.
- **D-3.** The description of an item is called description. The flag `--body` of `backlog new` goes and `--description` stays; the item file's key `body` becomes `description`.
- **D-4.** An alias is not kept: where two flags or two names mean the same, one goes.
- **D-5.** The item schema comes first. It is a valid JSON Schema ([item.schema.json](item.schema.json)) holding only the item's own properties, and the commands and flags are cut from it.
- **D-6.** An item has few required properties. `backlog new` takes exactly the required ones that a person must give; the CLI supplies the rest of the required ones. A property that is optional, or that is set after creation, is not an input of `backlog new`: it is set with `backlog update`.
- **D-7.** `--show-all` is the flag by which a user command reaches the items of teams. On a reading command (`backlog list`, `backlog show`) it includes them. On a user command that changes an item it is the explicit way for a user to change an item of a team, which is refused without it (D-29, ruling R19). It is not a flag of `backlog new`, which creates an item and reaches no existing one.
- **D-8.** A list of commands and flags shows each flag under the command form it is used with; only a flag usable everywhere stands at the top.
- **D-9.** The title of an item is called title: the flags `--title` of `backlog new`, `backlog update` and `backlog team new`, and the item file's key `title`; `--name` and the key `name` go.
- **D-10.** The required properties of an item are the title and the description, given by the person, and the number, the slug, the repository, the branch, the created and updated times, the writer, the status and the first history entry, supplied by the CLI.
- **D-11.** `backlog update` sets a property with a subcommand word, not a flag: `backlog update <item> <property> <value>` (for example `backlog update 12 title "Fix the login"`).
- **D-12.** The description is replaced whole. `--append` goes.
- **D-13.** There is no editing of single lines of the description: `--section`, `--set-lines`, `--add-line`, `--top`, `--remove-line` and `--move-line` go.
- **D-14.** Taking an item is setting a field, not a command of its own: `--claim` goes. Where the item definition that applies declares a field for who holds the item, it is set with `backlog update <item> <that field> <name>`.
- **D-15.** `backlog history` goes: the history is part of the item, returned with the item as JSON.
- **D-16.** The test for every command, subcommand and flag: it exists only when it solves a problem a backlog item has. What a person or an agent can get by reading the returned item and parsing it is not a command.
- **D-17.** The CLI and the team file are the authority on how the CLI behaves. A team's rule set in the team file defines the behaviour; skills and other documents that describe working with the CLI are written from it afterwards and read it, for the team of the repository or branch or for the default team. What a skill says is never evidence of how the CLI must behave.
- **D-18.** The built-in item has two properties a person gives, the title and the description, and what the CLI supplies. Every other field of an item comes from the item definition of the item's team in the team file, and the rules for those fields from that team's rule set. The fields change when the team's item definition changes.
- **D-19.** The property words of `backlog update` are therefore not a fixed list in the code: beyond title and description they are the fields the team file declares, read at run time, with their types and rules.
- **D-20.** An item with no team takes its fields from the repository's default item definition; where the repository has none, from the default item template packaged with the CLI. For now the item template for teams and the default template are the same.
- **D-21.** The CLI ships a default team item definition, a default team rule set and a comprehensive set of examples. The examples describe every kind of field and rule pattern and show how a pattern described in plain words becomes rules and an item definition. These documents and templates are in the public repository, and the help of the CLI directs the user to that folder of the public repository.
- **D-22.** `backlog archive` exists. An archived item is moved to the archive folder that the configuration file `.backlog/config.json` names for the repository the item came from.
- **D-23.** Every item has a priority. The priority is not a property of the item file: it is held only in the index file of the backlog folder, which lists, per item, the priority, the item's number, the title, the slug and the status. Making an item the first (priority 0) lowers the priority of the items behind it. The backlog folder behaves the same whether it is inside the repository or elsewhere.
- **D-24.** The item's number and its slug are default properties of every item.
- **D-25.** The default item definition has at least the status words new, active and closed.
- **D-26.** The team commands are the only commands that use a team's rule set. The user commands use no rule: on an item with no team nothing prevents a user from doing anything with them. The two sets are different commands with different logic, never aliases of each other.
- **D-27.** A committed file that describes behaviour that is no longer the target is moved, not deleted, to the folder `.backlog/archived/` of its repository, so that it cannot be read as current. `README.md` and `AGENTS.md` are updated instead of moved. Backlog items are reviewed later.
- **D-28.** The CLI's code holds no workflow. It creates an item, updates an item and lists items, and nothing more. Whether a field for dependencies exists, what upstream and downstream dependencies mean, how an item is split and how parents and children are marked, which item goes first, who holds an item, and every rule about who may write what and when: all of that is a field in an item definition and a rule in a team's rule set, never code. The default item definition and the default rule set that ship with the CLI carry such fields and an extensive set of rules for them as data, and anyone may remove or change them.
- **D-29.** A user command given without `--show-all` cannot change an item that belongs to a team: when the item's team is set, the team commands are the way, and their rules apply. A user who must change such an item in a way the team's rules would block gives `--show-all` on the user command; no rule is applied then (D-26). The team is therefore a base property of every item, beside the number, the title and the description (absent or empty when the item has no team).
- **D-30.** Anything that restricts or orders the work of several writers is a team rule in the team file and applies through the team commands only. The CLI enforces no such rule on its own.
- **D-31.** A command runs for one repository and one branch. Both are detected from git when the command starts, as in the first release (2026-10-15); the team, the agent and the session are given by the caller. Each of the five can also be given by an environment variable. Several agents use the CLI at the same time on different repositories and branches, so one fixed variable name for all of them would let one agent's value reach another agent's command. The `.backlog/config.json` of a repository, committed in each branch, therefore names the variables that commands in that repository and branch read, in five keys beside the existing ones (`teams_file`, `backlog_repository`, `team`): `repository_variable`, `branch_variable`, `team_variable`, `agent_variable`, `session_variable`. Each value is the name of a variable and starts with `SMOOTH_BACKLOG_CLI_` (ruling R20). `backlog setup` writes the five keys. The order stays: the flag, then the variable the configuration names, then the configuration's own value where it has one (ruling R15). The key names are the lead's, recorded for the owner to change.

- **D-32.** Review behaviour is a rule of a team: who reviews, how many rounds, the verdict words, when a review counts as stale and is offered again. Locking is a rule of a team: who may write an item and when, who holds it, how long, and when the hold lapses. None of it is code of the CLI, a status word in the code, or an environment variable of the CLI.
- **D-33.** Nothing leaves the scope because the lead read a rule that way. Every candidate removal of a behaviour, a flag, a command or an earlier decision is reported to the owner with its evidence, and stays in force until the owner decides (owner rule of 2026-11-05, restated 2026-11-08 and 2026-11-14).

### Owner decisions of 2026-11-15

- **D-34.** An item is one flat JSON object: the number, the title, the description and every field of the item definition sit side by side. There is no `fields` sub-object. (The sub-object existed only because the code kept the properties it supplies apart from the definition's fields; a definition may still not declare a field with the name of a base property.)
- **D-35.** The example team file shipped with the CLI holds several teams: a simple team, an advanced team, and a simplified version of the owner's lead-and-reviewers workflow. Each shows its item definition and its rules. The specification shows these examples. In the public repository the third team carries a generic name and no internal tool, agent or model name (owner rule on public repositories).
- **D-36.** The owner's own team file, with the actual rules and item definition of the owner's team, is a requirement of this work and is kept in the owner's private repository. It is not in this public repository.
- **D-37.** `backlog setup` installs or upgrades the backlog skill in every agent folder it detects in the repository (`.agents`, `.claude`, `.github`, `.qwen`), as the setup of the main branch does.
- **D-38.** Every user command that reads or changes items has a team form under `backlog team` that behaves the same way, with the team's rules applied: `backlog team new`, `list`, `show`, `update`, `archive`, `archive done`, `import`, `branch`, `branch import`. `backlog team update <item> <property> <value>` accepts the base properties and every field of the team's item definition, as `backlog update` does with the definition that applies to it; the team's rules apply to the fields or sets of fields they name.
- **D-39.** Team commands print JSON by default. `--human` prints a form for people, on every team command. Every team command has every flag that applies to it, `--whatif` included.
- **D-40.** The specification lists every command, including those waiting for a decision.
- **D-41.** Removed: `backlog next`, `backlog changes`, `backlog fields`, `backlog done`, `backlog move`, `backlog init clean`. Kept: `backlog import`, `backlog archive done`, `backlog branch`, `backlog branch import`.
- **D-42.** A new item is added at the bottom of the priority order of its branch.
- **D-43.** A priority is written with the prefix `p` (`p0`, `p1`, `p300`), so that a priority is never confused with an item number where either is referenced.
- **D-44.** The backlog location is always a git repository: the current repository, or a repository outside the current repository's folder. Every command that changes the backlog commits and pushes what it changed.
- **D-45.** The history is a required property of every item. Its structure is fixed in the CLI.
- **D-46.** `.backlog/config.json` has the key `redact_pii`, false by default, which turns on the redaction of personal and secret data in backlog items, and the redaction patterns of the repository (what to find and what to put in its place).
- **D-47.** The default status values of the CLI are those of D-25 (new, active, closed); `pending` is not one of them.
- **D-48.** Every item carries the version of the CLI that last wrote it, as a required property. `backlog setup` checks the items that exist; when any was written by an older version it stops with an error saying that the backlog must first be upgraded with `backlog upgrade`, before setup installs the new skill.
- **D-49.** `backlog validate` checks what people write by hand: the team file (every team in it, with its rules and its item definition, the whole file at once), the user item definition, and the schema files. The team file and the user item definition are checked against the schema files; the schema files are checked against the published JSON Schema specification. Every item is checked against the definition that applies to it (every required field set) and, for an item of a team, against the team's rules.
- **D-50.** In the specification the commands are shown as a table: each command with the flags of the command itself, then each subcommand or property with the flags that apply to it.
- **D-51.** The specification has a table of contents. A section called "Schemas" holds every schema; if user and team schemas are separated, the sections say so in their names.
- **D-52.** Every concept the specification refers to is described in it. Anything defined in a schema, or executed or enforced by the CLI, that the specification does not describe is listed in a table until it is described.

### Owner decisions of 2026-11-15, round 13

- **D-53.** The team rules are a rules engine, not a set of named actions. Every rule of a team is evaluated on every change a team command makes to an item. No command, agent or person names a rule or a step: there is no step word and no rule is referenced by the CLI or by the caller.
- **D-54.** A team changes an item only by changing its fields (`backlog team update <item> <property> <value>`, the properties being the base properties and the fields of the team item definition). The change of a field, for example the status from `new` to `reviewed`, is what makes the rules evaluate. A rule says, for example: for the status to change from A to B, field X must have this value, field Y that value and field Z one of these values, and conditions A, B and C must hold; otherwise the update is refused with this error text, which the caller sees.
- **D-55.** The rules of a team must not contradict each other. A rule needs no name; rules may be numbered. A number or id of a rule is used only by validation, to say which rule is invalid, malformed or contradicts another.
- **D-56.** The steps a team goes through are not part of the rule format and not known to the CLI. How the rules shape a team's way of working is described in words beside the rules, not prescribed by the structure of the rules.
- **D-57.** Before any plan is built, the rule specification is written and codified: how a rule is written in JSON, its keywords and data structures for each kind of rule, how a change of a field triggers one or several rules, how one rule affects another, how a dependency between two rules is declared, how the error text is given, the order and hierarchy of evaluation, and the validation of the rules. A JSON Schema of the rules goes with it. The specification, the item specification and the schemas follow it.

### Lead decisions of 2026-11-15, from a review the owner obtained and asked to integrate where it fits

The owner had his round-13 message reviewed by another AI and asked the lead to integrate what is correct and does not conflict with the established behaviour. The lead adopted these; each is reversible on the owner's word.

- **D-58.** A rule is a guard clause: optional `id` and `description`, an optional `when` (a condition; absent means every change), a `require` (a condition that must hold when `when` holds), and an `error` (the text the caller sees). Every rule is evaluated against the change; all failing rules' errors are returned together.
- **D-59.** No rule sets a value and no rule calls another. Rules depend on each other only through the fields of the item: one rule protects a field's value, another reads that value. There are no derivations and no named conditions. A value a team wants set (for example the holder) is set by the caller's change, and a rule requires it.
- **D-60.** Conditions are written in JsonLogic syntax, reading the change through `var` (`prev.status`, `next.status`, `caller.roles`, ...), with a small documented set of extra operators for what JsonLogic lacks.
- **D-61.** The key of the error text is `error`.

### Owner decision of 2026-11-15, on libraries

- **D-62.** Where a widely used and safe external library does the job, the CLI uses it instead of building its own; building it in the CLI is not allowed then. "Dependency-free" was never a rule that forbids runtime libraries. For this branch: Ajv (with ajv-formats) validates JSON against the schemas, and json-logic-js evaluates the conditions of the team rules; a regular-expression library that matches in linear time is chosen in plan task 9a.

### Owner decision of 2026-11-15, on approval

- **D-63.** There is no approval or review step for the owner. The owner works only through the chat; his go in the chat is the approval, and the documents never say "not approved". A document is incomplete when it depends on a decision the lead cannot take from the owner's earlier decisions; the lead then presents that decision in the same reply as the document, as a blocker of the document, and the document names where the open decisions are.

### Lead decisions of 2026-11-15, taken from the owner's earlier decisions

- **D-64.** The packaged default item definition declares `status` alone (new, active, closed; closed final; new by default): D-18, D-25 and 47.
- **D-65.** A user command checks that a property is declared and that its value has the field's type; it does not hold the value to the field's `values`: owner principle of 2026-11-08 (a user sets any status word on an item with no team).
- **D-66.** The key names `item_definition`, `archive_folder`, `repository_variable`, `branch_variable`, `team_variable`, `agent_variable`, `session_variable`, `redaction_patterns` (each pattern `find` and `replace`) and the history key `command`: the owner leaves names to the lead (owner instruction of 2026-11-07 on not asking what the lead can decide).
- **D-67.** Every user command that reads or changes items has its team form, `archive done`, `import`, `branch` and `branch import` included: D-38 ("most of the user commands") and the parity it asks for.
- **D-68.** The third example team of `teams.example.json` is written in plan task 12 as a simplified, generically named version of the owner's actual team file of D-36, so that it follows the owner's workflow without revealing it: D-35 and D-36 and the rule on public repositories.
- **D-69.** An item is named in a command by its number (`12`), its slug, or its priority (`p0`): D-43 (the prefix exists so that the two can be told apart where either is referenced).
- **D-70.** A command that would change the backlog where the backlog location is not a git repository refuses with exit 4 and names `backlog setup`: D-44 and the meaning of exit 4 (not set up).
- **D-71.** `backlog archive <item> --show-all` archives an item of a team without rules, as `backlog update` does: D-29.
- **D-72.** The two ways out of an unreadable item (decision F of 2026-11-04) stay: setting the field again (`backlog update <item> <property> <value>`), or `backlog update <item> restore` (the previous version); an item whose number cannot be read takes `backlog update <slug> seq <n>`. `restore` is a subcommand because it carries no data (owner rule of 2026-11-07 on flags and subcommands).
- **D-74.** `backlog import <branch>` and `backlog branch import <branch>` do the same thing: D-41 keeps both, and the first description of 2026-10-15 named the second.
- **D-75.** Regular expressions in rules are matched by the `re2` package (bindings to Google's RE2, which matches in linear time): D-62.

### Owner decisions of 2026-11-15, round 14 corrections

- **D-76.** `.backlog/config.json` keeps the key `push-backlog-updates`: true by default (every change is pushed); a user can set it to false. (An earlier lead decision to remove the key is archived.)
- **D-77.** A command commits only the files the CLI changed, never other changed files of the repository, and pushes only the commits the CLI made. Decision 44 is read with this.
- **D-78.** Redaction has its own specification. Redaction rules are evaluated on every change. A packaged default redaction definition and an example exist beside a JSON Schema of redaction rules, so that the plan can point to them.
- **D-79.** Every part of the plan points to the specification and the schema it implements, so that the plan can be split into parts that are implemented one at a time.
- **D-80.** The plan is sliced into parts that can each be given to one implementing session on its own. Each part says what must be done before it and what depends on it. The plan is written with the superpowers patterns: specification first, behaviour scenarios (BDD) and test-driven development (TDD) in every part, and sub-agent development (an implementer and reviewers per part).

### Owner decisions of 2026-11-15, after round 14

- **D-81.** Rules are evaluated only on changes. A command that only reads (`list`, `show`, `query`) evaluates no team rule and no redaction rule, because there is no change to evaluate.
- **D-82.** This specification is the one product requirements document: every requirement in force is here with its reason or as a constraint, and every behaviour scenario is here; no separate list of decisions is kept. Earlier plans and documents about behaviour that is not part of this specification and its implementation plan are in `.backlog/archived/`.
- **D-83.** The implementation plan is sliced so that one session of a smaller coding model can run a slice with the slice file alone: implementation in at most 30 minutes, review in at most 15 minutes in a new session that reads only the slice and the hand-off, the hand-off written into the slice's own backlog item, and an integration slice wherever slices must work together. Each slice says which skills to use: the code is written test first with the superpowers skills and refined with ponytail, and the review uses the superpowers review and a ponytail review against the slice's own scenarios and tests.

### Owner rulings of 2026-11-09 that remain in force

Reviewed one by one against the decisions above on 2026-11-14. Each keeps its number from the archived rulings file and is given in its current wording.

- R1, as narrowed by D-53 to D-59. For team behaviour the CLI is a rules engine: given a change of an item, the caller and the command, the team's rules decide whether the change is allowed. The code holds no team behaviour, no status word, no stage, no role.
- R2. Splitting, parents, children and dependencies are not actions of the CLI. They are rules over fields. Limits, queue order, review rounds, size caps and required notes are rules over fields in the same way. (Decision 28 says the same for all workflow.)
- R3. User commands enforce nothing about flow, status words or team behaviour. The CLI ignores the team file unless a command runs under `backlog team`. Who the user is comes from the operating system user.
- R3a, with R16 and R19. User commands leave items of a team out of what they list, show and change. `--show-all` is the one way in: with it a reading command includes them and a user command may set values on an item of a team (D-7 and D-29). A team that wants a field protected says so in its rules; the rules bind the team commands.
- R3b. Team commands never read the user identity. The agent comes from `--agent`, else the agent variable. The team comes from `--team`, else the team variable, else the `team` key of `.backlog/config.json`. When none is set the command stops and names every way to give the team.
- R4. Items are stored as JSON files. Every existing item, open and archived, is migrated from markdown to JSON; the CLI migrates or fails, with no second format and no alias.
- R5. The team file holds, per team, the people, the team's rule set and the team's item definition. The CLI only reads it; it never creates, rewrites or registers it.
- R6. A template is a starting copy. A team edits its own definition in the team file to fit its way of working.
- R7. The item definition is data only: field names, types, descriptions, defaults, allowed values. All dynamic behaviour is in the rule set.
- R8. The rule set is written so that an agent or a person understands it without reading the engine (with the team's description in words, D-56). The team skills use the same rule set directly (D-17).
- R11. `backlog team validate` checks the whole team file (the people, the item definition, every rule) and says, per problem, where it is, which rule, why, and what would fix it.
- R12. An item number is unique and never reused, at any size of backlog. A number identifies an item; it is not its priority.
- R13. Priority is separate from the number. The order of the queue is kept in a JSON index file in the backlog folder: per branch, the items in priority order with their number, slug, title and status (D-23).
- R14. Every team command needs a specific team. The one exception is `--show-all`, which makes a team command that accepts it act over every team.
- R15. A team command looks up each input in this order: the flag, the environment variable, the configuration file. A flag always wins, and a flag that differs from the variable is not refused.
- R17. `backlog team migrate` checks each item against the team's item definition and by default only reports every missing or invalid field; `--ask` repairs one field at a time on a terminal.
- R18. No backwards compatibility, anywhere. When a team command loads the team file and the file fails validation, the command changes nothing.
- R19a. When the team variable is set, every user command fails with a text that gives no instruction: teams are not allowed to use user commands.
- R20. Every environment variable the CLI owns is prefixed `SMOOTH_BACKLOG_CLI_`. No alias for an old name.
- R21. The team file is validated on load by the owner's procedure: validate, record the file's SHA and the valid teams with the date; within 24 hours a command proceeds on the record; `backlog team validate` always validates in full.
- R22. The team file is specific to a repository and a branch, like the backlog configuration. Its location is defined in the repository's `.backlog/config.json`, and the SHA of the file is kept there too. The design does not rely on a separate backlog repository existing.
- R23. The example team templates are available to the person who writes a team file: `backlog setup` puts them into the repository's `.backlog` folder. Only generic templates ship with the CLI; an owner's own team template stays in private. (Decision 21 adds the default definition, the default rule set, the examples guide and the help's link to the public repository.)
- R24. Nothing a command does may affect the entire backlog. The scope of every command is the repository's folder and, where an item says so, its branch.
- R25. `backlog setup` recommends the migration once the configuration defines a backlog folder, and the configuration records when the backlog was migrated and by which version.
- Carried forward on 2026-11-09 and in force: the team, the repository, the branch, the agent and the session are inputs of the team commands, each also an optional flag; archived items are subject to no rule; a review stage is never named after a team, and this public repository shows nothing of how the owner's internal factory behaves; commands are described with their scenario and full hierarchical command line.
- Lead decisions of 2026-11-09 the owner let stand: archived items are migrated to JSON too; rule expressions are data interpreted by the evaluator, and the CLI never executes code found in the team file.

### Owner answers of 2026-11-09, round 12, that remain in force

- **Q12-1**. The repository input of a team command defines the repository the command acts on, with that repository's team file and rules.
- **Q12-2**. A team command publishes only its own commit; a person's unpushed commits stay local.
- **Q12-3**. Merging branches with git is outside the scope of the CLI. The CLI renumbers nothing after such a merge; a command given a number that two items hold names both slugs and stops.
- **Q12-4**. Any finding in any entry of the team file stops every team command of every team of that file.
- **Q12-5**, as applied to the commands of D-38. The team commands that read over teams accept `--show-all` (`backlog team list`, `show`, `query rules`, `validate`, `migrate`); a team command that changes items acts for one team; given together with `--team`, `--team` decides.
- **Q12-6**. Only the repository's `.backlog/config.json` defines where the team file is: its `teams_file` key, else the repository's folder of a backlog repository named there, else `.backlog/teams.json`. The SHA of the team file is written into `.backlog/config.json`.
- **Q12-7**. Nothing is built to protect a migrated folder from older releases; every installation is upgraded before a folder is migrated.

### Owner decisions of 2026-11-04 to 2026-11-08 that remain in force

- 2026-11-04, decision D, data integrity in both storage locations: the backlog is always a git repository; a command pulls from the origin before it acts (reads included), commits and pushes after every change, retries a refused push, and refuses a write made on a stale view, showing the item's difference. Its last clause, that a claim of an item another agent holds is refused, is a team rule now (D-28 and D-32).
- 2026-11-04, decision F, with 2026-11-05: no database and no cache; the order is a committed text index per repository folder. An item that cannot be read is named with its field.
- 2026-11-04, decision D3 as amended 2026-11-08: plans stay in this repository under the plans folder; other working documents do not.
- 2026-11-04, decision D4: `backlog setup` names no folder path in its output.
- 2026-11-05: when nothing is configured, the CLI creates the repository's `.backlog` folder with `.backlog/config.json` and uses it.
- 2026-11-05: team awareness exists only under `backlog team`; the user command `backlog update` accepts no team flag; `backlog pop` and `backlog work` do not exist as user commands; team behaviour is defined only in the team's configuration.
- 2026-11-07: one behaviour per command; no backwards compatibility (upgrade and migrate, or fail); the backlog source comes only from the repository's `.backlog/config.json`; a command acts on the current branch by default, and wider behaviour is a subcommand, an option the user asks for, or a question on a terminal; every behaviour is explained in the help, the README and the supporting documents.
- 2026-11-07, flags and subcommands: unless the data must be supplied as part of the command, an option is a subcommand, not a flag. What a command needs is named in the help of its parent command and printed again when the command runs without input (D-11 applies it to `backlog update`).
- 2026-11-07, answer AO: the user command `backlog update` refuses a change to an item of a team (D-29 with its `--show-all` exception).
- 2026-11-07, answer AI: the update notice and `backlog upgrade` with `check`, `auto`, `off` and `disable` stay; the configuration entry gates the external call, which is asynchronous, times out quickly and only warns.
- 2026-11-07, answer AJ: team commands and user commands are different commands; code is shared only where sensible; no alias (D-4 and D-26).
- 2026-11-07, answer AP: `backlog new` and `backlog team new` are valid commands, and `--ask` is the interactive way.
- 2026-11-08, decision AR: the single-branch read exists as `backlog list branch <name>`.
- 2026-11-08, principle: the CLI hard-codes no behaviour pattern. A user sets any status word on an item with no team. Anything the CLI enforces for a team that does not come from the team file is an implementation failure.

### The owner's first description of the CLI (2026-10-15) and where each basic stands

The first description is in the history of this repository (the file `initial-prompt.md`, removed on 2026-10-16, and the design of 2026-10-16 in the archive). The simplified CLI returns to it and adds two things as data: the item definition and the team rule set.

- In force: the CLI works only inside a git repository; the branch and the repository name are detected from git at start and held in environment variables for the process and its children; when git names no branch, `--branch` or the variable gives it (D-31).
- In force: `--help`, `--json` and `--ask` (D-6, answer AP of 2026-11-07).
- In force: one property is set by a command of the form command, item, property, value (D-11; the command word is `update`, the first description said `set`).
- In force: priority is per branch; setting an item to priority N moves the items below it down by one; the default is the top (D-23).
- In force: `backlog archive <item>` (D-22); the configuration of the repository is `.backlog/config.json` at the root of the repository and records the schema version.
- In force: the update check and the automatic update, under the command word `upgrade` (answer AI of 2026-11-07).
- Replaced by later owner decisions: `backlog` alone listing the next item (D-1); one manifest file and one archive file holding all items (ruling R4: one JSON file per item, and ruling R13: the index); the fixed list of item fields (D-18).
- Evidence for an open point, not a decision: the fields of the first description (state with the words new, in-progress, done, archived; acceptance criteria; tasks; outcomes; evidence; references; an outside work item id) are the earliest list the owner gave for an item, and bear on which fields the packaged default definition declares.
- Evidence for an open point, not a decision: the design of 2026-10-16 required that changes made at the same moment are taken in turn with a lock and that a change of several files is journalled and recovered. Decision 32 makes who may write an item a team rule; whether the turn-taking of two processes in one local copy stays is with the owner.
- Open under D-33, not dropped: `backlog archive done`, `backlog branch` (list the branches that have items) and `backlog branch import <branch> --higher`.

### Not yet reviewed

Nothing dated decision or ruling of the owner in the archive is left unreviewed. The chapters of the 2026-11-09 design (the team file, the item definition and JSON item, the rule language, the team commands, numbering and index, migration, skills, validate) are design text, not rulings; they are read chapter by chapter when the task list is written, and what they state is carried or reported under D-33.
