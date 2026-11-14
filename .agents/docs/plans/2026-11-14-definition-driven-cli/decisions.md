# Decisions

The owner's decisions that are in force for this branch, each in its current wording. A decision that a later one replaced is not here: it is in [superseded-decisions.md](superseded-decisions.md). The numbers are the order in which the decisions were made on 2026-11-13 and 2026-11-14.

1. `backlog` with no command word prints the help. It no longer runs `backlog next`.
2. The flag `--dry-run` is named `--whatif` on every command that has it.
3. The description of an item is called description. The flag `--body` of `backlog new` goes and `--description` stays; the item file's key `body` becomes `description`.
4. An alias is not kept: where two flags or two names mean the same, one goes.
5. The item schema comes first. It is a valid JSON Schema ([item.schema.json](item.schema.json)) holding only the item's own properties, and the commands and flags are cut from it.
6. An item has few required properties. `backlog new` takes exactly the required ones that a person must give; the CLI supplies the rest of the required ones. A property that is optional, or that is set after creation, is not an input of `backlog new`: it is set with `backlog update`.
7. `--show-all` is a flag for reading and displaying items. Whether it may be used with a writing command is not decided; no work adds it to a writing command until the owner has ruled.
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
26. The team commands are the only commands that use a team's rule set. The user commands use no rule: nothing prevents a user from doing anything with them. The two sets are different commands with different logic, never aliases of each other.
27. A committed file that describes behaviour that is no longer the target is moved, not deleted, to the folder `.backlog/archived/` of its repository, so that it cannot be read as current. `README.md` and `AGENTS.md` are updated instead of moved. Backlog items are reviewed later.

## Not yet reviewed

The rulings and design decisions made before 2026-11-13 (the 25 owner rulings and the design decisions of 2026-11-09, and the decisions of the simplification of 2026-11-04) are in `.backlog/archived/`. Those that the decisions above replace are listed in [superseded-decisions.md](superseded-decisions.md). The others have not been checked one by one against the decisions above: until that review is done, none of them is in force by being in the archive, and none is dropped. The review moves each one either into this file or into the superseded file.
