# Behaviour specification of the CLI

The product requirements and the behaviour of the CLI. Section 9 holds every behaviour scenario; section 10 every constraint on the implementation. The team rules and redaction have their own specifications, [team-rules-spec.md](team-rules-spec.md) and [redaction-spec.md](redaction-spec.md). The implementation plan, [2026-11-15-definition-driven-cli-implementation.md](../2026-11-15-definition-driven-cli-implementation.md), names the sections and scenarios each slice builds.

**This specification is incomplete until the four decisions of section 8 are taken.**

## Contents

1. [The pattern](#1-the-pattern)
2. [Terms](#2-terms)
3. [Schemas](#3-schemas): 3.1 the base item, 3.2 the item definition, 3.3 the team file and the rule set, 3.4 the configuration, 3.5 the index, 3.6 the example team file, 3.7 the packaged defaults (the team rules and redaction schemas are specified in [team-rules-spec.md](team-rules-spec.md) and [redaction-spec.md](redaction-spec.md))
4. [Behaviour](#4-behaviour): 4.1 the backlog location, 4.2 numbers, slugs and priority, 4.3 the definition that applies, 4.4 history, 4.5 validation, 4.6 how a team command applies the rules, 4.7 inputs and environment variables, 4.8 output and exit codes, 4.9 redaction, 4.10 two writers, 4.11 setup, 4.12 upgrade, 4.13 storage and local state, 4.14 other behaviour
5. [Commands](#5-commands): 5.1 user commands, 5.2 team commands, 5.3 commands and flags to remove from the code
6. [The owner's team file](#6-the-owners-team-file)
7. [Code to remove](#7-code-to-remove)
8. [Open decisions that block this specification](#8-open-decisions-that-block-this-specification)
9. [Behaviour scenarios](#9-behaviour-scenarios)
10. [Constraints](#10-constraints)

## 1. The pattern

The CLI's code holds no workflow. Its user commands create, change, list, show and archive items, and move them between branches. Every item has the same base properties (3.1). Every other field of an item comes from an item definition (3.2), which is data. Every rule comes from a team's rule set (3.3), which is data, and is applied only by team commands. User commands apply no rule.

There are two sets of commands, never aliases of each other:

- **User commands** (`backlog <command>`) apply no rule. They act on items that have no team. With `--show-all` they also read, and change, items of a team, still applying no rule.
- **Team commands** (`backlog team <command>`) are the same commands for the items of one team, with the team's rules applied, and print JSON unless `--human` is given.

## 2. Terms

| Term | Meaning |
|---|---|
| Item | One unit of work, stored as one JSON file (3.1). |
| Base property | A property every item has, whatever its definition: the number, slug, title, description, team, repository, branch, times, writer, CLI version, status and history (3.1). |
| Field | A property an item definition declares (3.2). |
| Item definition | The list of fields an item has beyond the base properties, with their types, defaults and allowed values (3.2). |
| Team | A named group of people with its own item definition and rule set, held in the team file (3.3). |
| Change | What a command would do to one item: the item before and the item after. |
| Rule | A guard: when a condition holds for a change, another must hold too, or the change is refused with the rule's error text. Every rule of a team is evaluated on every change a team command makes; no command names a rule and no rule sets a value. |
| Rule set | A team's rules, queue and filters (3.3). |
| Priority | The place of an item in its branch's list in the index, written `p0`, `p1`, ... (4.2). |
| Index | The file that holds the priority order of each branch (3.5). |
| Backlog location | The git repository that holds the items: the current repository, or one outside it (4.1). |
| Configuration | `.backlog/config.json` at the root of the repository, committed in each branch (3.4). |

## 3. Schemas

Every schema is a JSON Schema of draft 2020-12, checked against the published specification by `backlog validate` (4.5).

### 3.1 The base item: [item.schema.json](item.schema.json)

An item is one flat JSON object; [item.example.json](item.example.json) fits the schema.

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

### 3.2 The item definition: [item-definition.schema.json](item-definition.schema.json)

An item definition is a JSON object whose keys are field names. Each field has a `type` (text, number, boolean, time, person, item, items, list) and may have a `default`, its allowed `values`, the values that are `final` (the item is finished; status only) and a `description`. Every definition declares `status`. No field may take the name of a base property.

A definition comes from one of three places: the `item` of a team in the team file (the team item definition); the file named by `item_definition` in the configuration (the repository's user item definition); the definition packaged with the CLI (3.7).

### 3.3 The team file and the rule set: [team-file.schema.json](team-file.schema.json)

The team file holds one entry per team, each with `people` (each person with a list of role words), `item` (the team item definition, 3.2), `rules`, and a `description` of the team's way of working in words. Its location is named in the configuration (`teams_file`; default `.backlog/teams.json`). The CLI only reads it.

`rules` is the team's rule set: its form is [team-rules.schema.json](team-rules.schema.json) and its meaning [team-rules-spec.md](team-rules-spec.md).

### 3.4 The configuration: [config.schema.json](config.schema.json)

| Key | Meaning |
|---|---|
| `backlog_repository` | The folder that holds the items, relative to the repository; `.backlog` when they live inside it. |
| `backlog_origin_url` | The address `backlog setup` clones a separate backlog repository from. |
| `user` | The person of the user commands, written by `backlog setup` (git `user.name`, else the login name). |
| `team` | The team a team command acts for when neither flag nor variable names one. |
| `teams_file`, `teams_file_sha` | Where the team file is, and its SHA when last validated. |
| `item_definition` | The repository's user item definition; absent means the packaged one. |
| `archive_folder` | The folder an archived item moves to; default `archive`. |
| `repository_variable`, `branch_variable`, `team_variable`, `agent_variable`, `session_variable` | The names of the environment variables commands read in this repository and branch (4.7). |
| `push-backlog-updates` | true by default: the commits the CLI makes are pushed; false keeps them local. |
| `redact_pii`, `redaction_rules` | Redaction of personal data on or off (default off) and the repository's own redaction rules ([redaction-spec.md](redaction-spec.md)). |
| `migrated_at`, `migrated_by_version` | When the items were converted to the current form and by which version. |

### 3.5 The index: [index.schema.json](index.schema.json)

Per branch, the list of the open items in priority order: number, slug, title and status. The place in the list is the priority; nothing else holds it.

### 3.6 The example team file: [teams.example.json](teams.example.json)

Shipped with the CLI, valid against 3.3. Three teams:

- `simple`: one agent; status todo, doing, done; an estimate and a result; six rules (people only, size on creation, the allowed moves of status, one item doing, done needs a result, archive only done); the queue takes the next todo item.
- `advanced`: a lead and three members; status new, ready, active, checking, closed; holder, checker, parent, dependencies; twelve rules, among them permission rules, a relation rule over the dependencies, a rule counting a member's active items, and a lock on the holder of an active item; the queue gives a member its checks first, then takes ready work for it (setting holder and status in one change).
- `lead-and-reviewers`: a lead, members, a reviewer and an outside reviewer; two reviews counted in a field the reviewer raises, hand-off by the holder, waiting for a decision of the lead; fourteen rules; the queue serves reviewers, members and the lead. It is a simplified, generically named form of the owner's team file (6).

Each team's `description` says its way of working in words. The examples guide `docs/team-rules-guide.md` explains every rule, with the change it allows and the change it refuses with its text.

### 3.7 The packaged defaults

- [default-item-definition.json](default-item-definition.json): `status` alone, with the values new, active and closed; closed is final; new is the default.
- [default-team.json](default-team.json): one team with that definition and three rules: only people of the team act; status moves new to active to closed; only a closed item is archived.
- [default-redaction.json](default-redaction.json): the packaged redaction rules ([redaction-spec.md](redaction-spec.md)).

## 4. Behaviour

### 4.1 The backlog location

The backlog location is always a git repository: the current repository (`.backlog`), or a repository outside the current repository's folder named by the configuration. A command that would change the backlog where the location is not a git repository exits 4 and names `backlog setup`. A command pulls the backlog before it acts, reading commands included. A command that changes the backlog commits only the files the CLI changed (items, the index, the number record), never other changed files of the repository, and pushes only the commits the CLI made, unless `push-backlog-updates` is false. When the push is refused, only the command's own commit is taken back, a person's own commits and edits stay, and the command exits 3. A team command publishes its own commit alone and runs again when what it read changed upstream. No output names a file or folder of the backlog.

### 4.2 Numbers, slugs and priority

- An item's number is one above the highest number its repository folder ever held; it is never given again, also after archiving.
- A priority is written with the prefix `p`: `p0` is the first item of the branch. Priority and number are separate.
- A new item is added at the bottom of its branch's priority order.
- Setting an item to `pN` puts it at place N; every item that was at N or below moves down by one.
- An item is named in a command by its number (`12`), its slug, or its priority (`p0`).
- A number that two items hold (after a merge outside the CLI) is refused when given; both slugs are named. The CLI does not renumber items after a merge.

### 4.3 The definition that applies

For an item of a team: the team item definition. Otherwise: the user item definition named in the configuration, else the packaged one. `backlog new` gives every field its default. `backlog update <item> <property> <value>` accepts the base properties `title`, `description`, `status`, `priority` and every field of the definition that applies; the value must have the field's type. A user command does not hold a value to the field's `values` list: a user may set any status word on an item with no team. A team command does, and the team's rules apply to the change.

### 4.4 History

Every change adds one entry to the item's history (3.1), written by the CLI. A change of priority adds no entry: the index is its own file.

### 4.5 Validation

`backlog validate` checks with Ajv, in this order: each schema file against the published JSON Schema specification; the team file, every team in it at once, against `team-file.schema.json` and `team-rules.schema.json`, and the rules by the checks of [team-rules-spec.md](team-rules-spec.md) section 11; the user item definition against `item-definition.schema.json`; the repository's redaction rules ([redaction-spec.md](redaction-spec.md) section 5); every item against `item.schema.json` and the definition that applies (every required field set, every value of its type); every item of a team against its team's rules. Each problem is reported with where it is, why, and what would fix it. A team command validates the team file before it acts; any finding in any team stops every team command. The file's SHA is kept in the configuration and a valid result is reused for 24 hours.

### 4.6 How a team command applies the rules

Every team command that would change an item builds the change (`prev` and `next`), applies the redaction rules to `next`, checks `next` against the schema and the team item definition with Ajv, then evaluates every rule with json-logic-js. If every rule holds, the change is written with one history entry; otherwise nothing is written, exit 1, and every failing rule's error is returned. `--whatif` evaluates and writes nothing. Commands that only read evaluate no rule. The full specification is [team-rules-spec.md](team-rules-spec.md).

### 4.7 Inputs and environment variables

The repository and branch are detected from git when a command starts; when git names no branch, the flag or the variable gives it. The team, agent and session are given by the caller. Each of the five is read from the flag, then the environment variable whose name the configuration gives, then the configuration's own value where it has one; a flag always wins. Every variable name starts with `SMOOTH_BACKLOG_CLI_`. A team command never reads the user's identity; user commands use the configured `user`. When the team variable is set, every user command fails with "teams are not allowed to use user commands". A team command with no team by any of the three ways exits 2 and names all three.

### 4.8 Output and exit codes

User commands print text for people; `--json` prints JSON. Team commands print JSON; `--human` prints text for people.

| Exit | Meaning |
|---|---|
| 0 | Succeeded (reading commands and `--whatif` too). |
| 1 | Refused: one line says why; for a team command, every failing rule's error. |
| 2 | Wrong arguments or place; an item, the team file or the configuration cannot be read. |
| 3 | The backlog could not be synchronised, nothing stays changed; for `backlog team pop`, nothing to offer. |
| 4 | The backlog is not set up, or its location is not a git repository. |
| 5 | The item was changed by someone else since the caller read it; nothing written, the item as it is now is printed. |

### 4.9 Redaction

Redaction rules are evaluated on every change, for every command that changes an item; commands that only read evaluate none. Their form, sources, switch and order are specified in [redaction-spec.md](redaction-spec.md).

### 4.10 Two writers

A change to an item that someone else changed since the caller last read it is refused with exit 5. Whether two commands running at the same moment in one local copy of the backlog take turns is open: section 8, decision A.

### 4.11 Setup

`backlog setup`, run inside a repository:

1. finds or creates the backlog location and writes `.backlog/config.json` with its keys (3.4), the five variable names included;
2. when items exist, reads `cli_version` of each; if any is older than the running CLI, stops with exit 2 saying the backlog must first be upgraded with `backlog upgrade`;
3. installs or replaces the backlog skill in every agent folder it finds: `.agents`, `.claude`, `.github`, `.qwen`;
4. copies the example team file and the packaged defaults into `.backlog`;
5. commits what it wrote; a second run with nothing new adds no commit; it prints no folder path.

`--ask` asks on a terminal for what is not configured.

### 4.12 Upgrade

`backlog upgrade` installs the latest release of the CLI (`check`, `auto`, `off`, `disable` and `<version>` control the update notice and the version), then converts every item of the repository's backlog to the running version and records `cli_version`. What it does with a value in a field the definition that applies does not declare is open: section 8, decision D. Whether `backlog team migrate` becomes part of it is open: section 8, decision C.

### 4.13 Storage and local state

- **Folder of a repository.** In a separate backlog repository, the items of a repository live in `<owner>/<name>/`; inside the repository, in `.backlog/`. A repository with no origin is named `local/<folder name>`.
- **Files.** Open items are `phases/<slug>.json`; archived items are under the `archive_folder`. `index.json` holds the priority order (3.5). `numbers.json` holds `{"last": <n>}`, the highest number handed out.
- **Next number.** One above the highest number the folder ever held: the item file names in the history of every branch of the backlog repository, every value `numbers.json` ever had, and the files and `numbers.json` present.
- **Slug.** The number padded to three digits, a hyphen, and the title in lowercase with every run of other characters than letters and digits replaced by one hyphen, hyphens at the ends removed (`012-fix-the-login-page`); a title with no letter or digit gives `item`.
- **Local state.** In the `.git` folder of the backlog repository's local copy, or in `.backlog/.state` when the items live inside the repository (never committed): the recovery journal, the record of what each agent last read, the per-user record of a valid team file (`smooth-backlog-cli/teams-validation/`), and the lock of section 8, decision A.
- **Recovery journal.** Before a command writes several files, it writes their current content to the journal on disk. A command killed in the middle leaves the journal; the next command restores those files before it acts.
- **What an agent last read.** A command that shows an item to an agent records the item's `updated`, `updated_by` and the backlog commit in `smooth-backlog-cli-views/<agent>.json`; a change by that agent is refused with exit 5 when the item changed since (4.10). An item the agent never read is written without the check.

### 4.14 Other behaviour

- **Printed lists.** `backlog list` prints one line per item: the priority (`p0`), the number, the slug and the status; `--json` prints the items. `backlog show` prints every property and the history, one entry per line.
- **`--ask` without a terminal** exits 2 and writes nothing.
- **Messages about the backlog location.** A message the CLI writes that names the address of the backlog repository leaves out the credential part of the address (between `://` and the last `@`).
- **Unreadable item.** A command that meets an item it cannot read exits 2 naming the item and the property; the ways out are `backlog update <item> <property> <value>`, `backlog update <item> restore` (its previous committed version), and, for an unreadable number, `backlog update <slug> seq <n>`.
- **`archive done`** archives the items of the branch whose status is a `final` value of the definition that applies.
- **`backlog import <branch>`** and **`backlog branch import <branch>`** do the same thing: the open items of that branch come to the current branch, after its items, before them with `--higher`.
- **The update notice.** Its settings are in `smooth-backlog-cli/config.json` of the user's configuration folder (`$XDG_CONFIG_HOME`, else `~/.config`), never in a repository: `weekly` on by default, `auto` off. A command run at a terminal checks for a release beside its work when the last check is older than seven days (24 hours with `auto`, one hour after a failed check), waits for it at most 1.5 seconds after its own work, and only prints a warning on standard error.
- **Git.** Team commands need git 2.40 or later; an older git exits 2.

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
| `backlog team migrate` (section 8, decision C) | *`--whatif`, `--ask`, `--show-all` | | |

### 5.3 Commands and flags to remove from the code

- Commands: `backlog next`, `changes`, `fields`, `done`, `move`, `history`, `init clean`; `backlog team define`, `backlog team workflow`, `backlog team query check`, `query steps`, `query filter`.
- The form `backlog team update <item> <step>` and every step word in the code.
- Flags: `--dry-run`, `--body`, `--name`, `--append`, `--claim`, `--section` with `--set-lines`, `--add-line`, `--remove-line`, `--move-line`, `--top`; `--restore` as a flag; every flag that sets one field (`--status`, `--objective`, `--summary`, `--severity`, `--depends-on`, `--estimate`, `--complexity`, `--layer`, `--chunk`, `--set-*`, `--replan`, `--release`, `--close`, `--by`, `--reason`).
- Each removed command or flag exits 2 as unknown.

## 6. The owner's team file

The owner's team file, with the actual rules and item definition of the owner's team, is kept in the owner's private repository, not in this one. It passes `backlog validate`.

## 7. Code to remove

- The coded team workflow: `src/team/lifecycle.js`, `queue.js`, `team.js`, `workflow.js`, `wip.js`, `views.js`, `handoff.js`, `handoff-commands.js`.
- The coded checks of user commands: `src/shared/dependencies.js`, `wip-limits.js`, `plain-step.js`, and the status words of `src/shared/status.js`.
- The rule evaluator built on steps: `src/team/rules/expression.js`, `step.js`, `pop.js`, `safe-regex.js`, `validate-rules.js`, replaced by Ajv, json-logic-js and re2 (10).
- The fixed field list of `src/shared/item-definition.js` and the `fields` object of `src/shared/item-json.js`.
- The variables `SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS` and `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD`.
- `templates/workflows/team.json` and the team templates of `templates/teams/`, replaced by `templates/teams.example.json`.
- Every feature file and test of a removed behaviour.

## 8. Open decisions that block this specification

Each is presented to the owner with its options; until it is taken, the sections named are incomplete.

| Decision | Sections it blocks |
|---|---|
| A. Whether two commands running at the same moment in one local copy of the backlog take turns (a lock file and the variable `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS`) | 4.10, 4.13 |
| B. Whether the run recorder (the variable `SMOOTH_BACKLOG_CLI_RUN_HOOK`, which starts a program the user names on every command) stays | 4.7, 5 |
| C. Whether `backlog team migrate` goes into `backlog upgrade` | 4.12, 5.2 |
| D. What `backlog upgrade` and `backlog validate` do with a value in a field the definition that applies does not declare | 3.1, 4.5, 4.12 |

## 9. Behaviour scenarios

Each scenario is one behaviour: the situation, the command as typed, and what must be true after. Ids are stable; each slice of the implementation plan names the scenarios it makes pass. `*` marks a scenario that needs new code; the others describe behaviour the code has and keeps. Every scenario runs in both storage places: the backlog inside the repository, and a separate backlog repository.

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
- *U-UPD-12. Given item 12 cannot be read: `backlog show 12` exits 2 naming the property; `backlog update 12 restore` brings back its previous version; `backlog update 012-fix-login seq 12` repairs an unreadable number.
- *U-UPD-13. `backlog update p0 title "X"` changes the item at priority 0; `backlog update 0 title "X"` is refused because no item has number 0.

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
- *U-ARCH-4. `backlog archive 20 --show-all` archives an item of a team without rules.
- U-ARCH-5. `backlog archive done` archives every item of the branch whose status is a final value of its definition.

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
- U-UPG-1. `backlog upgrade`, `upgrade check`, `auto`, `off`, `disable` and `<version>` and the update notice behave as 4.12 and 4.14 say.
- *U-UPG-2. Given items written by an older version. When `backlog upgrade` is run. Then every item is converted to the running version and has its `cli_version`.

#### Every command (4.1, 4.9)
- U-SYNC-1. The backlog is pulled before a command acts; a change is committed and pushed before it exits.
- U-SYNC-2. A refused push takes back only the command's own commit, exit 3; a person's commits stay.
- U-SYNC-3. No output names a file or folder of the backlog; credentials in addresses are redacted.
- *U-SYNC-4. Given the backlog location is not a git repository. When a command that changes the backlog is run. Then exit 4 naming `backlog setup`, nothing written.
- *U-RED-1. Given `redact_pii` true and the repository rules of `redaction.example.json`. When `backlog new --title "Ping build01.corp.example.com" --description "Customer CUST-123456 wrote to ann@example.org"` is run. Then the stored title is `Ping [internal host]`, the description `Customer CUST-****** wrote to [redacted e-mail]`, and the output names `title` and `description` as redacted.
- *U-RED-2. Given `redact_pii` false. Then the e-mail address is stored as given, and a GitHub token in a description is still replaced (a rule marked `always`).
- *U-RED-3. Every change is redacted: `backlog update 12 description "token ghp_..."` and `backlog team update 20 result "..."` store the redacted text, and the team rules see the redacted value.
- *U-RED-4. `backlog validate` reports a redaction rule whose `find` is not valid RE2 syntax, and a `properties` name no definition declares.
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

#### Team forms of the user commands
- *T-NEW-1. `backlog team new --team web --agent lead-1 --title "Parse the header" --description "..."`, a rule allowing it: the item has its team, the team definition's fields at their defaults, and what the rule set.
- T-NEW-2. A rule fails: exit 1 with the rule's error, no number used, nothing written.
- *T-LIST-1. `backlog team list --team web` lists the team's items of the branch in priority order; with `--show-all` every team's.
- *T-SHOW-1. `backlog team show 20 --team web` prints the item.
- *T-UPD-1. `backlog team update 20 estimate 30 --team web --agent member-1`, `estimate` a field of the team definition and no rule failing: the field is set and the history names the agent.
- *T-UPD-2. A rule fails: exit 1 with its error, nothing changes.
- *T-UPD-3. A value outside the field's `values` list: exit 1.
- *T-UPD-4. With `--whatif` the answer is given and nothing changes.
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
- *T-QRY-1. `backlog team list --filter waiting` lists the items the filter matches; `backlog team query plan` lists what the queue offers each person; `backlog team query rules` prints the rule set. `backlog team query check`, `query steps` and `query filter`: exit 2 (5.3).
- T-VAL-1. `backlog team validate` exits 0 on a valid team file; on a broken rule it reports where, which rule, why and the fix.
- *T-VAL-2. The packaged default team and the three teams of `teams.example.json` pass `backlog team validate` and `backlog validate`.
- T-MIG-1. `backlog team migrate` converts markdown items to JSON items, reports every missing or invalid field, records the migration; `--ask` repairs one field at a time.
- *T-MIG-2. With `--whatif` it converts nothing.

### The whole code
- *G-ITEM-1. No item file has a `fields` object; every item fits `item.schema.json`.
- *G-CODE-1. No source file outside the packaged data names a status word, review, claim, holder, link between items, parent, limit or hand-off; a test reads the source and fails on any.
- *G-CODE-2. The five session inputs are read by the variable names the configuration gives; no other variable is read by a fixed name except those that find the backlog.
- *G-DOC-1. Every help points to the documents folder of the public repository; `README.md`, `COMMANDS.md`, the skill and `CHANGELOG.md` describe exactly the commands of the specification, and a test compares them with the help.
- *G-TOPO-1. The owner's team file in the owner's private repository passes `backlog validate` (6).


## 10. Constraints

Constraints on the implementation, each with its reason. Slices of the implementation plan cite them by id.

### Items and definitions

- **C-1.** The schema of the item is defined before any command and is a valid JSON Schema holding only the item's own properties. Every command reads and writes items through it.
- **C-2.** An item is one flat JSON object; definition fields sit beside the base properties. No field of a definition takes the name of a base property.
- **C-3.** The base properties are the only fields the code knows: number, slug, title, description, team, repository, branch, created, updated, updated_by, cli_version, status and history. Every other field comes from the item definition that applies, read at run time.
- **C-4.** `history` and `cli_version` are required in every item; the structure of a history entry is fixed in the code.
- **C-5.** `backlog new` takes only what a person must give (title and description) or a whole item as a JSON file; every other property is set with `backlog update`, so that creating an item never needs to know the definition.
- **C-6.** The packaged default definition declares `status` alone, with new, active and closed; every other field comes from a repository's or a team's definition.
- **C-7.** A user command checks that a property is declared and that its value has the field's type, and stores any value of the right type: a user may set any status word on an item with no team.

### Commands

- **C-8.** `backlog` alone prints the help.
- **C-9.** Every command that changes items takes `--whatif`, which evaluates the change and writes nothing.
- **C-10.** A command exists only when it solves a problem an item has; anything an agent can answer from an item's data is read with `backlog show` or `backlog list`.
- **C-11.** No alias: one name per command, flag and property.
- **C-12.** An option that carries no data is a subcommand, not a flag; the flags of a command are listed under the command form they belong to.
- **C-13.** `backlog update <item> <property> <value>` is the one way to change a property; its property words are read at run time from the definition that applies.
- **C-14.** A new item goes to the bottom of its branch's priority order; a priority is written `p<N>` so that it is never confused with an item number; an item is named by number, slug or priority.
- **C-15.** Priority is held only in the index file, per branch, and is not a property of the item; setting `pN` moves the items at N and below down by one.
- **C-16.** The kept commands beyond create, update, list, show and archive are `backlog archive done`, `backlog import`, `backlog branch` and `backlog branch import`; `import` and `branch import` do the same thing.
- **C-17.** `backlog validate` checks what people write by hand: the schema files against the published JSON Schema specification, the whole team file at once, the user item definition, the redaction rules, and every item against its definition and, for a team's item, its team's rules.

### Teams and rules

- **C-18.** The code holds no workflow: no status word, role, review, claim, holder, dependency, parent, split, limit, hand-off or lock on who may write. These are fields of item definitions and rules of rule sets, shipped as data in the defaults and examples.
- **C-19.** Only team commands apply a team's rules; user commands apply none, and the two sets of commands are separate commands with separate code paths.
- **C-20.** A user command does not change an item of a team unless `--show-all` is given; with it, it changes the item and applies no rule. Reading commands include items of teams only with `--show-all`.
- **C-21.** Every user command that reads or changes items has its team form under `backlog team`, behaving the same way with the team's rules applied.
- **C-22.** A team changes items only through their properties; every rule of the team is evaluated on every change; no command, agent or person names a rule; there is no step.
- **C-23.** A rule is a guard (`when`, `require`, `error`); no rule sets a value or calls another; rules relate only through fields; rules have no order because all must hold; a rule's id serves only validation.
- **C-24.** Rules are evaluated only on changes; a command that only reads evaluates none.
- **C-25.** Team commands print JSON by default and text with `--human`.
- **C-26.** A team command needs one team (flag, else the variable the configuration names, else the configuration's `team`); with `--show-all` the reading team commands act over every team, and `--team` wins over `--show-all`.
- **C-27.** When the team variable is set, every user command fails: teams do not use user commands.
- **C-28.** The CLI only reads the team file; the team file is specific to a repository and branch, named in the configuration with its SHA; any finding in any team of the file stops every team command.
- **C-29.** The team skills and other documents read the team file; they never define the CLI's behaviour.

### Storage and publication

- **C-30.** The backlog location is always a git repository; every change is committed, and pushed unless `push-backlog-updates` is false.
- **C-31.** A command commits only the files the CLI changed and pushes only the commits the CLI made; a person's own commits and edits are never published, amended or dropped by the CLI.
- **C-32.** Nothing a command does affects more than the repository's folder of the backlog and, where an item says so, its branch.
- **C-33.** An item number is never reused; the CLI does not renumber items after a merge made outside it.
- **C-34.** No backwards compatibility: an older backlog is upgraded with `backlog upgrade`, or the command fails.
- **C-35.** No output names a file or folder of the backlog.

### Configuration and inputs

- **C-36.** Several agents use the CLI at once on different repositories and branches, so `.backlog/config.json`, committed in each branch, names the environment variables a command there reads for the repository, branch, team, agent and session.
- **C-37.** Inputs are read from the flag, then the named variable, then the configuration; a flag always wins.
- **C-38.** Every environment variable the CLI owns starts with `SMOOTH_BACKLOG_CLI_`.

### Redaction

- **C-39.** Redaction rules are data: packaged defaults, the repository's own rules in the configuration, and the switch `redact_pii` (false by default); they are evaluated on every change, before the schema check and the team rules, so that no stored item, history entry or rule sees the unredacted value.

### Libraries, packaging and documents

- **C-40.** Where a widely used and safe library does the job, the CLI uses it and does not build its own: Ajv with ajv-formats for JSON Schema, json-logic-js for rule conditions, re2 for regular expressions.
- **C-41.** The CLI ships the default item definition, the default team, the default redaction rules, the example team file with three teams (simple, advanced, lead-and-reviewers) and a guide from a described way of working to its definition and rules; the help points to them.
- **C-42.** This repository is public: no host, machine, local path, port, model, private repository, agent or tool name in any file or commit message; the owner's own team file is kept in a private repository.
- **C-43.** `README.md`, `COMMANDS.md`, `CHANGELOG.md`, `AGENTS.md` and the skill describe exactly the commands of this specification, and a test compares them with the help.

### Implementation plan

- **C-44.** The implementation plan points every slice to the sections, scenarios and constraints it implements.
- **C-45.** A slice is run by one session of a smaller coding model with the slice file alone: implementation in at most 30 minutes, test first, refined by a code review and a ponytail pass; a review in at most 15 minutes in a new session that reads only the slice and the hand-off written into the slice's own backlog item; an integration slice wherever slices must work together.
