# Proposal: one small command tree (2026-11-07) — for the owner's go

Basis: the owner's instruction of 2026-11-07. Earlier decisions are SUGGESTIONS, not limits. The CLI must be usable by a human who has never seen it:
few commands, subcommands in the style of `az`, one behaviour per command, current branch by default, ALL team behaviour under `backlog team`, no
hidden behaviour, and every level prints its own help when the data it needs is missing.

## 1. Facts found in the branch (scratch backlog, 2026-11-07)
- `backlog` with no argument runs `next` (a hidden default). `backlog update 2` with nothing to change still writes, commits and pushes (prints "updated (body only)"; whether it also commits and pushes is unchecked).
- A command with missing data prints one error line, not the help of its level (`new`, `team`, `team pop`, `move`, `move 2`, `archive`, `query --phase`).
- Team behaviour outside `backlog team`: user-command `new` takes --team, --chunk, --review-refs, --depends-on, --estimate, --complexity, --layer; user-command `update`
  takes 32 team flags and prints `moved:` for a team step; user-command `query` has the team views (--claimable, --reviewable, --blocked, --decisions, --plan, --wip);
  12 files under src/ read TEAM_NAME / TEAM_REPOSITORY / TEAM_BRANCH (help, archive, lifecycle, move, new, pop, query, store, team-cli, team-pop, team, views) (the help says "a team session is bound by" them).
- Commands that reach other branches by default: `update <item>`, `archive <item>`, `query --phase <item>`.
- Two names for one command: `query` and `list`.
- Alias machinery: aliases.js 130 lines, sequence.js 66, upgrade.js 211 (the restored self-update), aliases.test.js 113, aliases.feature 175 = 695 lines.

## 2. The 27 alias rows (aliases.js lines 5-31): reason it existed, value to a human, disposition
Reasons are from the phase-7 plan (kept the first-release spellings working). None of them is needed by a new user.
| # | form | value | disposition |
|---|---|---|---|
| 1 | init [name] | none: `setup` is the documented name | REMOVE |
| 2 | init clean [all-branches] | needed; the name hides it | KEEP as `backlog clean [all-branches]` (typed yes) |
| 3-6 | list new / open / done / archive | real use | KEEP as `backlog list [new\|open\|done\|archive]` (list subcommands, not aliases) |
| 7 | list branch | real use | KEEP as `backlog list branches` |
| 8 | branch | duplicate of 7 | REMOVE |
| 9 | new <name> --description --state --priority | old argument shape | REMOVE (new takes --name, --description, --status) |
| 10 | set <item> <field> <value> | old edit verb | REMOVE (`update <item> --field`) |
| 11 | priority <item> <position> | duplicate of update --priority | REMOVE |
| 12 | priority <item> (show) | duplicate of show | REMOVE |
| 13 | done <item> | humans finish items often | KEEP as a real command `backlog done <item>` |
| 14 | <item> done | item-first word order, hidden syntax | REMOVE |
| 15 | move <item> <branch> | positional form of --to-branch | REMOVE |
| 16 | set <item> ac\|tasks\|outcomes\|... | list fields | REMOVE alias; the section editor (`update --section`) stays only if the owner wants it |
| 17-19 | add / replace / remove <item> <list> | list edits | REMOVE |
| 20 | priority <item> <list> <n> <position> | list move | REMOVE |
| 21 | new ... --ac --tasks --outcomes ... | list fields at creation | REMOVE (use --body) |
| 22 | import --branch <source> | pulls open items of another branch; explicit cross-branch by nature | KEEP as a command |
| 23 | archive done | archive all finished | KEEP as `backlog archive done` |
| 24 | update, update check\|auto\|off\|disable\|<version> | program self-update under the wrong name | REMOVE the spelling; KEEP `backlog upgrade` |
| 25 | <item> set\|priority\|move ... | item-first word order | REMOVE |
| 26 | --ask / --headless / BACKLOG_HEADLESS | 1.x switches, ignored | REMOVE (unknown option error) |
| 27 | query --pop, next --agent | refusals pointing to team pop | REMOVE (unknown option error) |
Result: 0 aliases. Real commands that survive under their own names: clean, list <status>, list branches, done, import, archive done, upgrade.
Not yet analysed (will be in the Phase 7c plan, not decided here): `query` vs `list` (two names), the flags --all, --branch, --by-branch, --scope on query.

## 3. Target tree (current branch by default; wider = a subcommand)
```
backlog                          help of the top level (no hidden "next")
backlog next                     the next item of this branch      | backlog next all-branches
backlog list [open|new|done|archive|branches]                      | backlog list all-branches
backlog show <item>              one item (replaces query --phase)
backlog new --name <text> ...    a user item (no team fields)
backlog update <item> ...        change fields/body/status/priority of an item of THIS branch; nothing to change = help + exit 2
backlog done <item>              finish an item
backlog move <item> --to-branch <b> | --to-repository <r>
backlog archive <item> | archive done
backlog import --branch <source> [--higher]
backlog clean [all-branches]     remove the items of this branch (typed yes)
backlog setup [all-branches?]    wire this checkout to its backlog and deploy the skill   (all-branches only if the owner wants it built)
backlog fields                   the item template
backlog upgrade [check|auto|off|disable|<version>]
backlog team  pop | new | update | query | define | workflow        <- ALL team behaviour; user commands know no TEAM_* variable
backlog <command> --help         and every level prints its help when its data is missing
```
Items of another branch are refused with one line: "item 7 belongs to branch feature; check it out, or `backlog move 7 --to-branch <this>`".
Backlog source: only `.backlog/config.json` (no BACKLOG_HOME / BACKLOG_ORIGIN_URL override, no root `.smooth-backlog.json`, no per-user record).
No backwards compatibility: old stored keys and old config files are migrated by `backlog upgrade` or the command fails with the migrate instruction.

## 4. Cost
Touches the live team: its skills call `backlog query --status --json --branch X`, `backlog update <item> --append`, `backlog new`, `backlog team ...`.
Those spellings change (`list`, `show`, `team new`, no --branch) and the topology skills, dispatcher and nightly are updated and redeployed in the same phase.

---
# REVISION 2 (2026-11-07, after the owner's rebuke) — supersedes sections 3-4 where they differ
## Rule T: team behaviour never leaks into a user command
Found in the branch: user-command `update` still performs team steps (update.js:146-149: the earlier spelling "still works" and only prints `moved:`); user-command `new` creates team
items (--team, --chunk, --review-refs, --depends-on, --estimate, --complexity, --layer); lifecycle.js applies team rules to user updates; TEAM_NAME / TEAM_REPOSITORY /
TEAM_BRANCH change user commands in archive, move, new, query, store (queue order), lifecycle; user-command `query` still computes team views (refused unless called from team).
Rule: every file that implements team behaviour lives in `src/team/` (team, team-cli, team-pop, views, wip, workflow, handoff*, pop); no file outside it reads TEAM_*,
BACKLOG_AGENT or TEAM_LEAD, applies claim/review/stage/refine/WIP/lead/dependency rules, or accepts a team flag. A user command on a team item (an item with a team) is
refused with one line naming `backlog team update`. A test enforces it (import graph + a grep for the variable names).
## Behaviour <-> command matrix (every command, what it does, scope, what it prints without data)
| command | behaviour (one) | scope | missing data |
| backlog | prints the top-level help | - | - |
| setup [all-branches] | wire this checkout to its backlog, deploy the skill | this checkout (all-branches: only if setup has a per-branch effect - TO VERIFY) | help of setup |
| list [new|open|done|archive|branches] | table of items | this branch; `list all-branches` | list without a word = open |
| show <item> | one item, all fields | item of this branch | help of show |
| next | the best open item | this branch; `next all-branches` | - |
| new --name ... | create one user item, status new | this branch | help of new |
| update <item> --field/--body/--append/--status/--priority | change one user item | item of this branch; a team item or another branch's item is refused | no change named = help of update, exit 2 |
| done <item> | finish one user item | this branch | help of done |
| move <item> --to-branch B / --to-repository R | move one item | explicit by nature | help of move |
| archive <item> / archive done | archive one / all finished | this branch | help of archive |
| import --branch S [--higher] | copy open items of another branch here | explicit by nature | help of import |
| clean [all-branches] | remove items (typed yes) | this branch; all-branches | - |
| fields | print the item template | - | - |
| upgrade [check|auto|off|disable|<version>] | update the program | - | prints status |
| team pop|new|update|query|define|workflow | ALL team behaviour (claim, review, stages, WIP, views, nightly) | repo + branch of the team | team prints the list of subcommands; each subcommand its own help |
No aliases. No --branch/--all/--by-branch/--scope on user commands. No environment override of the backlog source (only .backlog/config.json).
