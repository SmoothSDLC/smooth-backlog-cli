# Decisions

The owner's decisions that are in force for this branch, each in its current wording. A decision that a later one replaced is not here: it is in [superseded-decisions.md](superseded-decisions.md). The numbers are the order in which the decisions were made on 2026-11-13 and 2026-11-14.

1. `backlog` with no command word prints the help. It no longer runs `backlog next`.
2. The flag `--dry-run` is named `--whatif` on every command that has it.
3. The description of an item is called description. The flag `--body` of `backlog new` goes and `--description` stays; the item file's key `body` becomes `description`.
4. An alias is not kept: where two flags or two names mean the same, one goes.
5. The item schema comes first. It is a valid JSON Schema ([item.schema.json](item.schema.json)) holding only the item's own properties, and the commands and flags are cut from it.
6. An item has few required properties. `backlog new` takes exactly the required ones that a person must give; the CLI supplies the rest of the required ones. A property that is optional, or that is set after creation, is not an input of `backlog new`: it is set with `backlog update`.
7. `--show-all` is a flag for reading and displaying items. It is not used with a writing command (decision 29).
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
29. A user command cannot change an item that belongs to a team: when the item's team is set, the team commands must be used. The team is therefore a base property of every item, beside the number, the title and the description (absent or empty when the item has no team).
30. Anything that restricts or orders the work of several writers is a team rule in the team file and applies through the team commands only. The CLI enforces no such rule on its own.
31. The inputs that say where and for whom a command runs (the repository, the branch, the team, the agent, the session) come from environment variables as well as flags. Several agents use the CLI at the same time, so the variables are specific to a repository and a branch, and the name of the variable to read is kept in `.backlog/config.json`.

## Owner rulings of 2026-11-09 that remain in force

Reviewed one by one against the decisions above on 2026-11-14. Each keeps its number from the archived rulings file and is given in its current wording.

- R1. For team behaviour the CLI is a rules evaluator: given an item, the command, the caller and the arguments, the team's rule set decides whether the command is allowed, what the new status is and which fields change. The code holds no team behaviour, no status word, no stage, no role.
- R2. Splitting, parents, children and dependencies are not actions of the CLI. They are rules over fields. Limits, queue order, review rounds, size caps and required notes are rules over fields in the same way. (Decision 28 says the same for all workflow.)
- R3. User commands enforce nothing about flow, status words or team behaviour. The CLI ignores the team file unless a command runs under `backlog team`. Who the user is comes from the operating system user.
- R3a, with R16. User commands change only items that have no team; items of a team are changed only through `backlog team` commands (decision 29). User commands leave items of a team out of what they list and show unless `--show-all` is given, which is for reading only (decision 7).
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

## Not yet reviewed

The design decisions of 2026-11-09 (the file `design/decisions.md` in the archive, with the owner's answers of round 12) and the decisions of the simplification of 2026-11-04 have not been checked one by one against the decisions above. Until that review is done none of them is in force by being in the archive, and none is dropped. The review moves each one either into this file or into the superseded file.
