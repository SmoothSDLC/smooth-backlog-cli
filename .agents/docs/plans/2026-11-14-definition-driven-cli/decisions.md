# Decisions

The owner's decisions that are in force for this branch, each in its current wording. A decision that a later one replaced is not here: it is in [superseded-decisions.md](superseded-decisions.md). The numbers are the order in which the decisions were made on 2026-11-13 and 2026-11-14.

1. `backlog` with no command word prints the help. It no longer runs `backlog next`.
2. The flag `--dry-run` is named `--whatif` on every command that has it.
3. The description of an item is called description. The flag `--body` of `backlog new` goes and `--description` stays; the item file's key `body` becomes `description`.
4. An alias is not kept: where two flags or two names mean the same, one goes.
5. The item schema comes first. It is a valid JSON Schema ([item.schema.json](item.schema.json)) holding only the item's own properties, and the commands and flags are cut from it.
6. An item has few required properties. `backlog new` takes exactly the required ones that a person must give; the CLI supplies the rest of the required ones. A property that is optional, or that is set after creation, is not an input of `backlog new`: it is set with `backlog update`.
7. `--show-all` is the flag by which a user command reaches the items of teams. On a reading command (`backlog list`, `backlog show`) it includes them. On a user command that changes an item it is the explicit way for a user to change an item of a team, which is refused without it (decision 29, ruling R19). It is not a flag of `backlog new`, which creates an item and reaches no existing one.
8. A list of commands and flags shows each flag under the command form it is used with; only a flag usable everywhere stands at the top.
9. The title of an item is called title: the flags `--title` of `backlog new`, `backlog update` and `backlog team new`, and the item file's key `title`; `--name` and the key `name` go.
10. The required properties of an item are the title and the description, given by the person, and the number, the slug, the repository, the branch, the created and updated times, the writer, the status and the first history entry, supplied by the CLI.
11. `backlog update` sets a property with a subcommand word, not a flag: `backlog update <item> <property> <value>` (for example `backlog update 12 title "Fix the login"`).
12. The description is replaced whole. `--append` goes.
13. There is no editing of single lines of the description: `--section`, `--set-lines`, `--add-line`, `--top`, `--remove-line` and `--move-line` go.
14. Taking an item is setting a field, not a command of its own: `--claim` goes. Where the item definition that applies declares a field for who holds the item, it is set with `backlog update <item> <that field> <name>`.
15. `backlog history` goes: the history is part of the item, returned with the item as JSON.
16. The test for every command, subcommand and flag: it exists only when it solves a problem a backlog item has. What a person or an agent can get by reading the returned item and parsing it is not a command.
17. The CLI and the team file are the authority on how the CLI behaves. A team's rule set in the team file defines the behaviour; skills and other documents that describe working with the CLI are written from it afterwards and read it, for the team of the repository or branch or for the default team. What a skill says is never evidence of how the CLI must behave.
18. The built-in item has two properties a person gives, the title and the description, and what the CLI supplies. Every other field of an item comes from the item definition of the item's team in the team file, and the rules for those fields from that team's rule set. The fields change when the team's item definition changes.
19. The property words of `backlog update` are therefore not a fixed list in the code: beyond title and description they are the fields the team file declares, read at run time, with their types and rules.
20. An item with no team takes its fields from the repository's default item definition; where the repository has none, from the default item template packaged with the CLI. For now the item template for teams and the default template are the same.
21. The CLI ships a default team item definition, a default team rule set and a comprehensive set of examples. The examples describe every kind of field and rule pattern and show how a pattern described in plain words becomes rules and an item definition. These documents and templates are in the public repository, and the help of the CLI directs the user to that folder of the public repository.
22. `backlog archive` exists. An archived item is moved to the archive folder that the configuration file `.backlog/config.json` names for the repository the item came from.
23. Every item has a priority. The priority is not a property of the item file: it is held only in the index file of the backlog folder, which lists, per item, the priority, the item's number, the title, the slug and the status. Making an item the first (priority 0) lowers the priority of the items behind it. The backlog folder behaves the same whether it is inside the repository or elsewhere.
24. The item's number and its slug are default properties of every item.
25. The default item definition has at least the status words new, active and closed.
26. The team commands are the only commands that use a team's rule set. The user commands use no rule: on an item with no team nothing prevents a user from doing anything with them. The two sets are different commands with different logic, never aliases of each other.
27. A committed file that describes behaviour that is no longer the target is moved, not deleted, to the folder `.backlog/archived/` of its repository, so that it cannot be read as current. `README.md` and `AGENTS.md` are updated instead of moved. Backlog items are reviewed later.
28. The CLI's code holds no workflow. It creates an item, updates an item and lists items, and nothing more. Whether a field for dependencies exists, what upstream and downstream dependencies mean, how an item is split and how parents and children are marked, which item goes first, who holds an item, and every rule about who may write what and when: all of that is a field in an item definition and a rule in a team's rule set, never code. The default item definition and the default rule set that ship with the CLI carry such fields and an extensive set of rules for them as data, and anyone may remove or change them.
29. A user command given without `--show-all` cannot change an item that belongs to a team: when the item's team is set, the team commands are the way, and their rules apply. A user who must change such an item in a way the team's rules would block gives `--show-all` on the user command; no rule is applied then (decision 26). The team is therefore a base property of every item, beside the number, the title and the description (absent or empty when the item has no team).
30. Anything that restricts or orders the work of several writers is a team rule in the team file and applies through the team commands only. The CLI enforces no such rule on its own.
31. A command runs for one repository and one branch. Both are detected from git when the command starts, as in the first release (2026-10-15); the team, the agent and the session are given by the caller. Each of the five can also be given by an environment variable. Several agents use the CLI at the same time on different repositories and branches, so one fixed variable name for all of them would let one agent's value reach another agent's command. The `.backlog/config.json` of a repository, committed in each branch, therefore names the variables that commands in that repository and branch read, in five keys beside the existing ones (`teams_file`, `backlog_repository`, `team`): `repository_variable`, `branch_variable`, `team_variable`, `agent_variable`, `session_variable`. Each value is the name of a variable and starts with `SMOOTH_BACKLOG_CLI_` (ruling R20). `backlog setup` writes the five keys. The order stays: the flag, then the variable the configuration names, then the configuration's own value where it has one (ruling R15). The key names are the lead's, recorded for the owner to change.

32. Review behaviour is a rule of a team: who reviews, how many rounds, the verdict words, when a review counts as stale and is offered again. Locking is a rule of a team: who may write an item and when, who holds it, how long, and when the hold lapses. None of it is code of the CLI, a status word in the code, or an environment variable of the CLI.
33. Nothing leaves the scope because the lead read a rule that way. Every candidate removal of a behaviour, a flag, a command or an earlier decision is reported to the owner with its evidence, and stays in force until the owner decides (owner rule of 2026-11-05, restated 2026-11-08 and 2026-11-14).

## Owner rulings of 2026-11-09 that remain in force

Reviewed one by one against the decisions above on 2026-11-14. Each keeps its number from the archived rulings file and is given in its current wording.

- R1. For team behaviour the CLI is a rules evaluator: given an item, the command, the caller and the arguments, the team's rule set decides whether the command is allowed, what the new status is and which fields change. The code holds no team behaviour, no status word, no stage, no role.
- R2. Splitting, parents, children and dependencies are not actions of the CLI. They are rules over fields. Limits, queue order, review rounds, size caps and required notes are rules over fields in the same way. (Decision 28 says the same for all workflow.)
- R3. User commands enforce nothing about flow, status words or team behaviour. The CLI ignores the team file unless a command runs under `backlog team`. Who the user is comes from the operating system user.
- R3a, with R16 and R19. User commands leave items of a team out of what they list, show and change. `--show-all` is the one way in: with it a reading command includes them and a user command may set values on an item of a team (decisions 7 and 29). A team that wants a field protected says so in its rules; the rules bind the team commands.
- R3b. Team commands never read the user identity. The agent comes from `--agent`, else the agent variable. The team comes from `--team`, else the team variable, else the `team` key of `.backlog/config.json`. When none is set the command stops and names every way to give the team.
- R4. Items are stored as JSON files. Every existing item, open and archived, is migrated from markdown to JSON; the CLI migrates or fails, with no second format and no alias.
- R5. The team file holds, per team, the people, the team's rule set and the team's item definition. The CLI only reads it; it never creates, rewrites or registers it.
- R6. A template is a starting copy. A team edits its own definition in the team file to fit its way of working.
- R7. The item definition is data only: field names, types, descriptions, defaults, allowed values. All dynamic behaviour is in the rule set.
- R8. The rule set is written so that an agent or a person understands it without reading the evaluator. The team skills use the same rule set directly (decision 17).
- R10. The order of the rules is part of the rule set, in the manner of a routing table: an ordered table with a defined precedence.
- R11. `backlog team validate` checks the whole team file (the people, the item definition, every rule) and says, per problem, where it is, which rule, why, and what would fix it.
- R12. An item number is unique and never reused, at any size of backlog. A number identifies an item; it is not its priority.
- R13. Priority is separate from the number. The order of the queue is kept in a JSON index file in the backlog folder: per branch, the items in priority order with their number, slug, title and status (decision 23).
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

## Owner answers of 2026-11-09, round 12, that remain in force

- Question 1. The repository input of a team command defines the repository the command acts on, with that repository's team file and rules.
- Question 2. A team command publishes only its own commit; a person's unpushed commits stay local.
- Question 3. Merging branches with git is outside the scope of the CLI. The CLI renumbers nothing after such a merge; a command given a number that two items hold names both slugs and stops.
- Question 4. Any finding in any entry of the team file stops every team command of every team of that file.
- Question 5. Among the team commands, `backlog team query` (its list form, `query <item>`, `query rules`), `backlog team validate` and `backlog team migrate` accept `--show-all`; given together with `--team`, `--team` decides.
- Question 6. Only the repository's `.backlog/config.json` defines where the team file is: its `teams_file` key, else the repository's folder of a backlog repository named there, else `.backlog/teams.json`. The SHA of the team file is written into `.backlog/config.json`.
- Question 7. Nothing is built to protect a migrated folder from older releases; every installation is upgraded before a folder is migrated.

## Owner decisions of 2026-11-04 to 2026-11-08 that remain in force

- 2026-11-04, decision D, data integrity in both storage locations: the backlog is always a git repository; a command pulls from the origin before it acts (reads included), commits and pushes after every change, retries a refused push, and refuses a write made on a stale view, showing the item's difference. Its last clause, that a claim of an item another agent holds is refused, is a team rule now (decisions 28 and 32).
- 2026-11-04, decision F, with 2026-11-05: no database and no cache; the order is a committed text index per repository folder. An item that cannot be read is named with its field.
- 2026-11-04, decision D3 as amended 2026-11-08: plans stay in this repository under the plans folder; other working documents do not.
- 2026-11-04, decision D4: `backlog setup` names no folder path in its output.
- 2026-11-05: when nothing is configured, the CLI creates the repository's `.backlog` folder with `.backlog/config.json` and uses it.
- 2026-11-05: team awareness exists only under `backlog team`; the user command `backlog update` accepts no team flag; `backlog pop` and `backlog work` do not exist as user commands; team behaviour is defined only in the team's configuration.
- 2026-11-07: one behaviour per command; no backwards compatibility (upgrade and migrate, or fail); the backlog source comes only from the repository's `.backlog/config.json`; a command acts on the current branch by default, and wider behaviour is a subcommand, an option the user asks for, or a question on a terminal; every behaviour is explained in the help, the README and the supporting documents.
- 2026-11-07, flags and subcommands: unless the data must be supplied as part of the command, an option is a subcommand, not a flag. What a command needs is named in the help of its parent command and printed again when the command runs without input (decision 11 applies it to `backlog update`).
- 2026-11-07, answer AO: the user command `backlog update` refuses a change to an item of a team (decision 29 with its `--show-all` exception).
- 2026-11-07, answer AI: the update notice and `backlog upgrade` with `check`, `auto`, `off` and `disable` stay; the configuration entry gates the external call, which is asynchronous, times out quickly and only warns.
- 2026-11-07, answer AJ: team commands and user commands are different commands; code is shared only where sensible; no alias (decisions 4 and 26).
- 2026-11-07, answer AP: `backlog new` and `backlog team new` are valid commands, and `--ask` is the interactive way.
- 2026-11-08, decision AR: the single-branch read exists as `backlog list branch <name>`.
- 2026-11-08, principle: the CLI hard-codes no behaviour pattern. A user sets any status word on an item with no team. Anything the CLI enforces for a team that does not come from the team file is an implementation failure.

## The owner's first description of the CLI (2026-10-15) and where each basic stands

The first description is in the history of this repository (the file `initial-prompt.md`, removed on 2026-10-16, and the design of 2026-10-16 in the archive). The simplified CLI returns to it and adds two things as data: the item definition and the team rule set.

- In force: the CLI works only inside a git repository; the branch and the repository name are detected from git at start and held in environment variables for the process and its children; when git names no branch, `--branch` or the variable gives it (decision 31).
- In force: `--help`, `--json` and `--ask` (decision 6, answer AP of 2026-11-07).
- In force: one property is set by a command of the form command, item, property, value (decision 11; the command word is `update`, the first description said `set`).
- In force: priority is per branch; setting an item to priority N moves the items below it down by one; the default is the top (decision 23).
- In force: `backlog archive <item>` (decision 22); the configuration of the repository is `.backlog/config.json` at the root of the repository and records the schema version.
- In force: the update check and the automatic update, under the command word `upgrade` (answer AI of 2026-11-07).
- Replaced by later owner decisions: `backlog` alone listing the next item (decision 1); one manifest file and one archive file holding all items (ruling R4: one JSON file per item, and ruling R13: the index); the fixed list of item fields (decision 18).
- Evidence for an open point, not a decision: the fields of the first description (state with the words new, in-progress, done, archived; acceptance criteria; tasks; outcomes; evidence; references; an outside work item id) are the earliest list the owner gave for an item, and bear on which fields the packaged default definition declares.
- Evidence for an open point, not a decision: the design of 2026-10-16 required that changes made at the same moment are taken in turn with a lock and that a change of several files is journalled and recovered. Decision 32 makes who may write an item a team rule; whether the turn-taking of two processes in one local copy stays is with the owner.
- Open under decision 33, not dropped: `backlog archive done`, `backlog branch` (list the branches that have items) and `backlog branch import <branch> --higher`.

## Not yet reviewed

Nothing dated decision or ruling of the owner in the archive is left unreviewed. The chapters of the 2026-11-09 design (the team file, the item definition and JSON item, the rule language, the team commands, numbering and index, migration, skills, validate) are design text, not rulings; they are read chapter by chapter when the task list is written, and what they state is carried or reported under decision 33.
