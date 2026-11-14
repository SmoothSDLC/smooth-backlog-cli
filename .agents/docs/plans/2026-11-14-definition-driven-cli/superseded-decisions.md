# Superseded decisions

Decisions that are no longer in force, with what replaced them. Nothing here describes the target.

| What was decided | When | Replaced by |
|---|---|---|
| "The baseline is new, update and list" (the last sentence of decision 16 as first worded) | 2026-11-13 | decision 22: `backlog archive` is a base command too |
| "`backlog update <item> owner <name>` replaces `--claim`" (decision 14 as first worded) | 2026-11-13 | decision 18: who holds an item is a field of the item definition, not a built-in property; decision 14 in its current wording |
| The built-in user item definition with sixteen fixed fields (status, objective, summary, location, commit, severity, owner, owned_since, depends_on, parent, estimate_min, complexity, layer, chunk, size_score, completed) | design of 2026-11-09 | decisions 18 and 20: only the base item is built in; other fields come from the item definition that applies |
| One flag per field on `backlog new` and `backlog update`, and the line-editing flags of the description | design of 2026-11-09 and earlier | decisions 6, 11, 12, 13 and 19 |
| The item file's keys `name` and `body`; the flags `--name` and `--body` | design of 2026-11-09 and earlier | decisions 3 and 9: `title` and `description` |
| The flag `--dry-run` | earlier | decision 2: `--whatif` |
| `backlog` with no command word runs `backlog next` | earlier | decision 1: it prints the help |
| `backlog history` as a command | earlier | decision 15 |
| "Nothing prevents a user from doing anything with the user commands" without limit (decision 26 as first worded) | 2026-11-14 | decision 29: except on an item of a team |
| Dependency checks, the split with its parent, a critical item going first and the holder of an item as behaviour of the code | design of 2026-11-09 and earlier | decision 28: fields and rules as data, never code |
| The skills of a team as a source of what the CLI must do | practice | decision 17: the CLI and the team file are the authority |
| The plan of 2026-11-12 with its 52 tasks and its use-case status table | 2026-11-12 | the re-analysis of 2026-11-14 ([../2026-11-14-definition-driven-cli.md](../2026-11-14-definition-driven-cli.md)) |
| R5 in part: "the CLI never reads a template" | 2026-11-09 | decisions 20 and 21: the CLI reads the default item definition packaged with it |
| R9: the earlier analysis is a guide and a coverage checklist | 2026-11-09 | decision 27: that analysis is archived and is not an input |
| R16 in part: "by default a reference to a team item reads as missing; with the flag it is seen" | 2026-11-09 | decision 28: references between items are fields and rules, not code |
| Scope note of 2026-11-09: several teams at once need no change of variable names | 2026-11-09 | decision 31: the variables are specific to a repository and a branch and their names are kept in `.backlog/config.json` |
| "Split items are linked to their parent but not bound to its team" as behaviour of the code | carried forward on 2026-11-09 | decision 28 |
| "`--show-all` is a flag for reading only and is not used with a writing command" (decision 7 as worded on 2026-11-14) and "a user command cannot change an item of a team" without exception (decision 29 as first worded) | 2026-11-14 | decisions 7 and 29 as they stand: the lead had dropped ruling R19 without the owner saying so |
| 2026-11-04, decision A: every earlier command name stays as an alias | 2026-11-04 | owner rule of 2026-11-07 and decision 4: no alias, no backwards compatibility |
| 2026-11-05: the earlier root configuration file is still read | 2026-11-05 | owner rule of 2026-11-07: no backwards compatibility |
| 2026-11-05: a workflow definition held with the team skills is the authority, and the CLI ships a copy | 2026-11-05 | decision 17: the CLI and the team file are the authority |
| 2026-11-05: items without a team take owner and team from the configuration written by `backlog setup` | 2026-11-05 | decisions 14, 18 and 29: the holder is a field of a definition, and an item without a team has no team |
| 2026-11-05: a reviewer's verdict is complete or reject | 2026-11-05 | decision 32: the verdict words are a team's rule |
| 2026-11-07, answer AM: item dependencies stay a feature of every item and every command | 2026-11-07 | decision 28 |
| Lead decision of 2026-11-07: the first query is replaced by `list`, `show`, `history`, `changes`, `next` | 2026-11-07 | decision 15 for `history`; `changes` and `next` are open for the owner |
