# Alias analysis (decision 20261106-AJ), 2026-11-07

Basis: the owner rules of 2026-11-07 (no backwards compatibility; one behaviour per command; wider behaviour is a subcommand; every
command and subcommand documented accurately in help, README and COMMANDS.md) and the owner statement of the same day: team commands and
user commands are different commands with different requirements (the team path forces the read of teams.json and its enforcement);
they share code only where that makes sense. Test applied to each of the 27 rows of src/shared/aliases.js at HEAD 81ad2c8:
(a) behaviour with no other spelling? (b) team behaviour on a user command? (c) used by a running consumer? (d) did it ever work in a released build?

## Evidence
- Consumers: grep of the topology repository (skills, tools, hooks, launcher; not .md) finds none of the old spellings. The only hit is
  the agent launcher, which exports BACKLOG_HEADLESS=1 without a terminal; the CLI never reads that variable.
- `--headless` / BACKLOG_HEADLESS: absent in the first release (21cc020), refused with exit 2 in the base build (fe40b5a: "not in this build").
  It never worked in any build, so dropping it removes no working behaviour.
- `--ask`: in the first release `backlog new --ask` and `backlog set <item> <field> --ask` prompted on a terminal for each missing field and
  refused without a terminal (21cc020 src/prompt.js). At HEAD `--ask` is accepted and silently dropped everywhere except `setup`. That IS a
  removed released behaviour -> decision 20261107-AP, answered: restore for `new` and `team new`.
- User-command housekeeping commands carry no team check: src/shared/move.js, archive.js, sequence.js (import, archive done) and clean.js contain no team
  test; test "a user-command replan ... reorders a team item like any other" asserts it for replan. They can therefore move, archive, import,
  delete or reorder an item that has a team while skipping teams.json rules.

## The 27 rows (result: 0 aliases; every kept behaviour is a command with its own help)
| rows | first-release form | verdict |
|---|---|---|
| 2 | init clean [all-branches] | KEEP the behaviour as command `clean` (current branch; `clean all-branches`; typed yes) |
| 3-6 | list new / open / done / archive | KEEP as `list [new\|open\|done\|archive]` (subcommands of list, not aliases) |
| 7 | list branch | KEEP as `list branches` |
| 13 | done <item> | KEEP as command `done`; acts on items WITHOUT a team; a team item is closed with `team update <item> close` |
| 22 | import --branch <source> [--higher] | KEEP as command (explicit cross-branch by nature); items with a team are not imported |
| 23 | archive done | KEEP as `archive done`; finished items WITHOUT a team |
| 24 | update, update check/auto/off/disable/<version> | spelling REMOVED (bare `update` installs a new program version); behaviour KEPT whole as `upgrade` (decision 20261107-AI) |
| 16-20 | set/add/replace/remove/priority on list fields | spellings REMOVED; behaviour KEPT as the section editor of `update` (spelling decided in 7c-3, flags->subcommands) |
| 1 | init [name] | REMOVE (`setup` is the documented name) |
| 8 | branch | REMOVE (duplicate of `list branches`) |
| 9, 21 | new <name> --description --state ..., new --ac --tasks ... | REMOVE (old argument shape; `new --name ... --body`) |
| 10, 11, 12 | set, priority <item> <pos>, priority <item> | REMOVE (`update <item> --field`, `update --priority`, `show`) |
| 14, 25 | <item> done, <item> set/priority/move | REMOVE (item-first word order) |
| 15 | move <item> <branch> | REMOVE (positional form of `--to-branch`) |
| 26 | --ask / --headless / BACKLOG_HEADLESS | `--headless` REMOVE (never worked); `setup --ask` KEEP; `new --ask` RESTORED for `new` and `team new` (decision 20261107-AP = a, prompts for the missing fields on a terminal); `set --ask` not restored |
| 27 | query --pop, next --agent | REMOVE: team behaviour lives only under `backlog team pop`; user-command query/next reject team options like any unknown option |
Count: 9 rows kept as real commands, 1 renamed (`upgrade`), 5 kept as the section editor, 12 removed outright (9 + 1 + 5 + 12 = 27).
Decisions L and M (state words, `set description`) become moot with row 9/10 removed.

## Team rules the rows must obey (lead decisions under the owner's statement of 2026-11-07; owner may overrule)
1. Every user command that writes an item refuses an item that has a team, with one line naming the team command (as `update` already does).
   Applies to: done, move, archive, archive done (skips and names them), import (skips and names them), clean (refuses while the branch holds team
   items), replan (refuses a queue that holds one). Supersedes the 7c-2a note that `move`/`archive` stay open to the user commands.
2. Where the team rules need the operation (closing, archiving a closed team item, moving a team item), it is a subcommand of `backlog team`,
   implemented there; shared code only where it makes sense. The 7c-2b audit lists each user write command and its team counterpart or its refusal.
3. Help, README, COMMANDS.md and the skill describe user and team commands separately and accurately; every command and subcommand has an entry.

## Update notices (decision 20261107-AI, owner: the old constraints stay expected behaviour and are fully documented)
Verified in 21cc020 (README, src/updates.js) and HEAD (src/upgrade.js):
- Weekly notices default ON (`weekly: true`), automatic installs default OFF (`auto: false`). Interval 7 days; 24 hours when `auto` is on (the
  README calls this "daily compatible updates"); 1 hour after a failed check. `update check|auto|off|disable|<version>` set them. Settings are
  USER-scoped (user config file), not `.backlog/config.json`.
- Owner expectation was "once a day": that is true only with `auto` on. Decided (lead, owner may overrule): keep the released cadence.
- First release awaited the check after every command except init/update, 20 s npm timeout, warning only on failure. Owner requirement (new hardening,
  not a restore): the external call runs only when the configuration entry allows it, runs asynchronously, times out quickly, and a failure prints a
  warning only and never fails or delays the command.
- At HEAD `scheduled()` exists in src/upgrade.js and nothing calls it. Work item for 7c-2b: call it after each command (not `upgrade`, not setup),
  non-blocking, short timeout; document in `backlog --help`, `upgrade --help`, README, COMMANDS.md, skill: defaults, cadence, every switch, where
  the setting lives, how to disable.
