# Definition-driven CLI: scope of work (re-analysis of 2026-11-14)

Status: analysis for the owner's review. It replaces the task list of [2026-11-12-simplify-branch-completion.md](2026-11-12-simplify-branch-completion.md) once confirmed; that plan's section "Owner decisions of 2026-11-13" (decisions 1 to 20) is the input and stays binding.

## The target in one paragraph

The CLI knows one base item: a title and a description given by a person, and the number, slug, repository, branch, times, writer, status and history it supplies itself. Every other field, and every rule about who may change what and when, is data: the item definition and the rule set of the item's team in the team file; for an item with no team, the repository's default item definition named in `.backlog/config.json`, else the default item template packaged with the CLI. The commands are few: `backlog new`, `backlog update <item> <property> <value>`, `backlog list` and `backlog show`, plus the team commands that run a team's rules. The property words of `backlog update` and the help that lists them are read from the definition that applies. A command exists only when it solves a problem an item has; what can be parsed from the returned item is not a command.

## What the branch already has that fits

- The team file with a team's people, item definition and rule set; its loader, its validation (`backlog team validate`) and the evaluator that runs the rules.
- The team commands `backlog team pop`, `new`, `update`, `query`, `validate` and `migrate`, whose step arguments already come from the rule set at run time.
- Item files as JSON, one module that reads and writes them, numbers that are never reused, publication that never overwrites another writer.
- The configuration file `.backlog/config.json` with the location of the team file.
- Five example team files shipped as templates. There is no single default team definition and no document that teaches how to turn a described way of working into rules (decision 21).

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

## What does not fit and changes

1. **The base schema becomes the source.** [item.schema.json](2026-11-12-simplify-branch-completion/item.schema.json) is written; the code still has its own table of 16 built-in fields and writes the keys `name` and `body`. Work: the code reads the base from one schema; the keys become `title` and `description`; existing item files are converted.
2. **The default item template and the repository's default item definition do not exist.** Work: one packaged default template in the same form as a team's item definition; a key in `.backlog/config.json` naming the repository's or branch's default item definition; the lookup order team, repository default, packaged default.
3. **`backlog new` takes every field as a flag.** Work: `--title`, `--description`, `--file <item.json>`, `--ask`, `--whatif`; the 15 other flags go.
4. **`backlog update` has about 30 fixed flags.** Work: `backlog update <item> <property> <value>`, where the property words are title, description and the fields of the definition that applies; the value is checked against the field's type and allowed values; for an item of a team the rule set decides whether the caller may set it. The line-editing flags, `--append`, `--claim` and the fixed field flags go.
5. **The help is fixed text.** Work: the help of `backlog update` and `backlog new --file` lists the fields of the definition that applies where the command runs.
6. **Names.** `--dry-run` becomes `--whatif` on every command; `backlog` alone prints the help; `backlog team new --name` becomes `--title`.
7. **Commands that fail the test of decision 16.** `backlog history` goes. Awaiting the owner's ruling: `backlog next`, `changes`, `fields`, `done`, `move`, `import`, `archive`, `archive done`, `clean`, `upgrade`, and of `backlog update` the forms `--replan`, `--restore`, `--close`, `--release`.
8. **`--show-all` on writing commands** (decision 7, under review): built for `backlog new`, built and unmerged for `backlog update` and `backlog done`, planned for five more commands.
9. **Documents and the skill** describe the fixed flags; they are regenerated from the new help.
10. **Tests.** The suite (2,431 tests, 107 scenarios) pins the fixed flags and fields; the tests of the changed commands are rewritten against definitions.

## Design points this analysis cannot settle from the decisions

- For an item of a team, how `backlog update <item> <property> <value>` relates to `backlog team update <item> <step>`: one command that asks the rule set, or two.
- Which fields the packaged default template declares (decision 20 says it equals the team template for now; the branch ships five different example team files and no single team template).
- What happens to the values existing items hold in fields that the applicable definition does not declare.

## What happens to the work in flight

- Merged and kept: the Task 6 follow-ups and Tasks 9, 11, 12 and 23 of the 2026-11-12 plan.
- Built, not merged, on hold: Task 13 (`backlog update` and `backlog done` with `--show-all`).
- The remaining tasks of the 2026-11-12 plan are re-cut from this scope after the owner's review; none runs before that.
