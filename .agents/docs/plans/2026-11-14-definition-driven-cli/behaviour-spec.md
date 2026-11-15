# Behaviour specification of the CLI

Status: the behaviour of the CLI when the simplify branch is finished. Written 2026-11-14, restructured 2026-11-15 from the owner's decisions ([decisions.md](decisions.md); what they replaced is in [superseded-decisions.md](superseded-decisions.md)). The team rules are specified in [team-rules-spec.md](team-rules-spec.md). Every command and use is a use case in [use-cases.md](use-cases.md); the work to reach this is [the plan](../2026-11-14-definition-driven-cli.md).

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
| Change | What a team command would do to one item: the item before and the item after (team rules spec, 2). |
| Rule | A guard: when a condition holds for a change, another must hold too, or the change is refused with the rule's error text. Every rule of a team is evaluated on every change; no command names a rule and no rule sets a value (decisions 53 and 58 to 59). |
| Rule set | A team's rules, queue and filters (3.3, [team-rules-spec.md](team-rules-spec.md)). |
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

`rules` is the team's rule set. Its form is [team-rules.schema.json](team-rules.schema.json) and its meaning is [team-rules-spec.md](team-rules-spec.md): what triggers the rules, how a change is evaluated, the guard form of a rule (`when`, `require`, `error`), the evaluation context (`prev`, `next`, `caller`, `team`, ...), conditions in JsonLogic evaluated by json-logic-js, each kind of rule with examples (transition, field, lock, permission, relation, creation), how rules relate through fields, the queue and filters, error texts, and the validation of the rules. Each team may carry a `description` of its way of working in words (decision 56).

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
| `repository_variable`, `branch_variable`, `team_variable`, `agent_variable`, `session_variable` | The names of the environment variables commands read in this repository and branch (decision 31, 4.7). |
| `push-backlog-updates` | true by default: the commits the CLI makes are pushed; false keeps them local (decision 76). |
| `redact_pii`, `redaction_rules` | Redaction of personal data on or off (default off) and the repository's own redaction rules ([redaction-spec.md](redaction-spec.md)). |
| `migrated_at`, `migrated_by_version` | When the items were converted and by which version. |

### 3.5 The index: [index.schema.json](index.schema.json)

Per branch, the list of the open items in priority order: number, slug, title and status. The place in the list is the priority; nothing else holds it.

### 3.6 The example team file: [teams.example.json](teams.example.json)

Shipped with the CLI in the public repository (decision 35) and valid against 3.3. Three teams:

- `simple`: one agent; status todo, doing, done; an estimate and a result; six rules (people only, size on creation, the allowed moves of status, one item doing, done needs a result, archive only done); the queue takes the next todo item.
- `advanced`: a lead and three members; status new, ready, active, checking, closed; holder, checker, parent, dependencies; twelve rules, among them permission rules, a relation rule over the dependencies, a rule counting a member's active items, and a lock on the holder of an active item; the queue gives a member its checks first, then takes ready work for it (setting holder and status in one change).
- `lead-and-reviewers`: a lead, members, a reviewer and an outside reviewer; two reviews counted in a field the reviewer raises, hand-off by the holder, waiting for a decision of the lead; fourteen rules; the queue serves reviewers, members and the lead.

Each team's `description` says its way of working in words. The examples guide (plan, task 12) explains every rule, and shows for each the change it allows and the change it refuses with its text.

### 3.7 The packaged defaults

- [default-item-definition.json](default-item-definition.json): `status` with the values new, active and closed, closed final, new by default (decisions 25 and 47).
- [default-team.json](default-team.json): one team with that definition and five rules: only people of the team act; `new`; `start` (new to active); `close` (active to closed); `archive` (closed only).

## 4. Behaviour

### 4.1 The backlog location

The backlog location is always a git repository: the current repository (`.backlog`), or a repository outside the current repository's folder named by the configuration (decision 44). A command pulls the backlog before it acts, reading commands included. A command that changes the backlog commits only the files the CLI changed (items, the index, the number record), never other changed files of the repository, and pushes only the commits the CLI made, unless `push-backlog-updates` is false (decisions 76 and 77). When the push is refused, only the command's own commit is taken back, a person's own commits and edits stay, and the command exits 3. A team command publishes its own commit alone and runs again when what it read changed upstream (round 12, question 2). No output names a file or folder of the backlog.

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

`backlog validate` checks with Ajv (decision 62), in this order: each schema file against the published JSON Schema specification; the team file, every team in it at once, against `team-file.schema.json` and `team-rules.schema.json` with Ajv, and the rules by the checks of [team-rules-spec.md](team-rules-spec.md) section 11; the user item definition against `item-definition.schema.json`; every item against `item.schema.json` and the definition that applies (every required field set, every value of its type); every item of a team against its team's rules. Each problem is reported with where it is, why, and what would fix it (decision 49, ruling R11). A team command validates the team file before it acts; any finding in any team stops every team command (round 12, question 4). The file's SHA is kept in the configuration and a valid result is reused for 24 hours (rulings R21, R22).

### 4.6 How a team command applies the rules

Every team command that would change an item builds the change (`prev` and `next`) and evaluates it: first the structure (schema and team item definition, checked with Ajv), then every rule (with json-logic-js). If every rule holds, the change is written with one history entry; otherwise nothing is written, exit 1, and every failing rule's text is returned. `--whatif` evaluates and writes nothing. The full specification is [team-rules-spec.md](team-rules-spec.md).

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

Redaction rules are evaluated on every change and on every output, for every command; their form, their sources (the packaged defaults and the repository's `redaction_rules`), the switch `redact_pii` and the order are specified in [redaction-spec.md](redaction-spec.md).

### 4.10 Two writers

A change to an item that someone else changed since the caller last read it is refused with exit 5. Whether two commands running at the same moment in one local copy of the backlog take turns is open: section 8, decision A.

### 4.11 Setup

`backlog setup`, run inside a repository:

1. finds or creates the backlog location and writes `.backlog/config.json` with its keys (3.4), including the five variable names;
2. when items exist, reads `cli_version` of each; if any is older than the running CLI, stops with exit 2 saying the backlog must first be upgraded with `backlog upgrade` (decision 48);
3. installs or upgrades the backlog skill in every agent folder it finds: `.agents`, `.claude`, `.github`, `.qwen` (decision 37);
4. copies the example team file and the packaged defaults into `.backlog` (ruling R23);
5. commits what it wrote; a second run with nothing new adds no commit; it prints no folder path.

`--ask` asks on a terminal for what is not configured.

### 4.12 Upgrade

`backlog upgrade` installs the latest release of the CLI (`check`, `auto`, `off`, `disable` and `<version>` control the update notice and the version; answer AI of 2026-11-07), then converts every item of the repository's backlog to the running version and records `cli_version` (decision 48). What it does with a value in a field the definition that applies does not declare is open: section 8, decision D. Whether `backlog team migrate` becomes part of it is open: section 8, decision C.

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

`backlog next`, `changes`, `fields`, `done`, `move`, `init clean` (decision 41); `backlog history` (decision 15); `backlog team define` and `backlog team workflow` (ruling R5); `backlog team update <item> <step>`, `backlog team query check`, `query steps`, `query filter` (replaced by `backlog team list --filter`) and every step word (decisions 53 and 54); the flags `--dry-run`, `--body`, `--name`, `--append`, `--claim`, `--section` and its line flags, and every flag that sets one field (decisions 2, 3, 9, 11 to 14).

## 6. The owner's team file

The owner's team file, with the actual rules and item definition of the Cody team, is written to the topology repository (decision 36). It is not in the public repository. It must pass `backlog validate`. It is a deliverable of this work (plan, task 9).

### 4.13 Storage and local state

- **Folder of a repository.** In a separate backlog repository, the items of a repository live in `<owner>/<name>/`; inside the repository, in `.backlog/`. A repository with no origin is named `local/<folder name>`.
- **Files.** Open items are `phases/<slug>.json`; archived items move under the `archive_folder` (default `archive`). `index.json` holds the priority order (3.5). `numbers.json` holds `{"last": <n>}`, the highest number handed out.
- **Next number.** One above the highest number the folder ever held: the item file names in the history of every branch of the backlog repository, every value `numbers.json` ever had, and the files and `numbers.json` present (ruling R12).
- **Slug.** The number padded to three digits, a hyphen, and the title in lowercase with every run of other characters than letters and digits replaced by one hyphen, hyphens at the ends removed (`012-fix-the-login-page`); a title with no letter or digit gives `item`.
- **Local state.** In the `.git` folder of the backlog repository's local copy, or in `.backlog/.state` when the items live inside the repository (never committed): the lock and its wait (decision A of section 8), the recovery journal, the record of what each agent last read, and the per-user record of a valid team file (`smooth-backlog-cli/teams-validation/`).
- **Recovery journal.** Before a command writes several files, it writes their earlier content to the journal on disk. A command killed in the middle leaves the journal; the next command restores those files before it acts.
- **What an agent last read.** A command that shows an item to an agent records the item's `updated`, `updated_by` and the backlog commit in `smooth-backlog-cli-views/<agent>.json`; a later change by that agent is refused with exit 5 when the item changed since (4.10). An item the agent never read is written without the check.

### 4.14 Other behaviour

- **Printed lists.** `backlog list` prints one line per item: the priority (`p0`), the number, the slug and the status; `--json` prints the items. `backlog show` prints every property and the history, one entry per line.
- **`--ask` without a terminal** exits 2 and writes nothing.
- **Unreadable item.** A command that meets an item it cannot read exits 2 naming the item and the property; the ways out are `backlog update <item> <property> <value>`, `backlog update <item> restore` (its previous version), and, for an unreadable number, `backlog update <slug> seq <n>` (decision 72).
- **`archive done`** archives the items of the branch whose status is a `final` value of the definition that applies.
- **`backlog import <branch>`** and **`backlog branch import <branch>`** do the same thing (decision 74): the open items of that branch come to the current branch, after its items, before them with `--higher`.
- **The update notice.** Its settings are in `smooth-backlog-cli/config.json` of the user's configuration folder (`$XDG_CONFIG_HOME`, else `~/.config`), never in a repository: `weekly` on by default, `auto` off. A command run at a terminal checks for a release beside its work when the last check is older than seven days (24 hours with `auto`, one hour after a failed check), waits for it at most 1.5 seconds after its own work, and only prints a warning on standard error.
- **Git.** Team commands need git 2.40 or later; an older git is refused with exit 2.

## 7. Decisions the lead took from earlier decisions

Each is recorded in [decisions.md](decisions.md) with the earlier decision it follows from (decisions 64 to 72, 74 and 75): the packaged definition declares `status` alone; user commands check types, not value lists; the key names; the team forms of every user command; the third example team written from the owner's actual team file; an item named by number, slug or `p0`; exit 4 when the backlog location is not a git repository; `backlog archive --show-all`; `backlog update <item> restore` and `seq <n>` for unreadable items; `push-backlog-updates` kept, true by default (decision 76); `import` and `branch import` the same; `re2` for regular expressions.

## 8. Open decisions that block this specification

The lead cannot take these from the owner's earlier decisions. Each is presented to the owner with its options; until each is taken, the sections named stay incomplete.

| Decision | Sections it blocks |
|---|---|
| A. Whether two commands running at the same moment in one local copy of the backlog take turns (today a lock file and the variable `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS`) | 4.10, 4.13 |
| B. Whether the run recorder (the variable `SMOOTH_BACKLOG_CLI_RUN_HOOK`, which starts a program the user names on every command) stays | 4.7, 5 |
| C. Whether `backlog team migrate` goes into `backlog upgrade` | 4.12, 5.2 |
| D. What `backlog upgrade` and `backlog validate` do with a value in a field the definition that applies does not declare | 3.1, 4.5, 4.12 |
