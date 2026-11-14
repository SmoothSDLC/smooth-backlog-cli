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
| User commands may change an item of a team when `--show-all` is given (owner ruling R19 of 2026-11-09) and `backlog new --depends-on` may name a team item with it (ruling R16 as built) | 2026-11-09 | not replaced yet: under the owner's review (decision 7) |
| The skills of a team as a source of what the CLI must do | practice | decision 17: the CLI and the team file are the authority |
| The plan of 2026-11-12 with its 52 tasks and its use-case status table | 2026-11-12 | the re-analysis of 2026-11-14 ([../2026-11-14-definition-driven-cli.md](../2026-11-14-definition-driven-cli.md)) |
