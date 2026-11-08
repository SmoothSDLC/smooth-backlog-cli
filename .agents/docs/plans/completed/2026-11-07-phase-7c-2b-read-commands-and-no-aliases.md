# Phase 7c-2b: the read commands, real commands for the kept behaviours, and no aliases

Owner rulings behind it (2026-11-07): revision 2 of [2026-11-07-command-surface-proposal.md](../../analysis/2026-11-07-command-surface-proposal.md) (decision 20261107-AL = a); no backwards
compatibility; one behaviour per command; current branch by default, wider behaviour is a subcommand (`all-branches`); team behaviour only under
`backlog team`; every command and subcommand documented accurately; the alias analysis ([2026-11-07-alias-analysis.md](../../analysis/2026-11-07-alias-analysis.md), 0 aliases, 9 rows kept as commands).

Worktree `<worktree>`, branch `simplify/pr3-review`, HEAD `81ad2c8` (suite 1055/1055). Commit only through
`<logs>/commit.sh "<msg>"`. Every commit leaves the full suite, `npm run check`, BDD (local + remote) and the
no-private-details guard green. Do not push. Public repository: no private names in code, tests, docs or commit messages.

## Why the plan has two stages (facts, 2026-11-07)
`commit.sh` makes every commit the machine's live `backlog`. The running system calls spellings this phase removes:
- dispatcher (the team dispatcher): `backlog query --status --json` (reads the FULL stack: finished items too);
- member wake hook (the team-member skill's wake hook): `query --phase <item> --json`, `query --status --json`;
- nightly (the nightly team script): `query --phase <ids> --json`, `query --status --json --branch <b>`;
- skills: the team-lead and team-member skills tell agents to run `backlog query --status`.
Removing `query` in a live commit breaks the dispatcher and the nightly at once (lesson 34). So: Stage A is additive (new commands beside the old
ones, nothing breaks), then the agent STOPS and the lead moves the consumers to the new spellings and redeploys; Stage B removes the old
spellings only after that. The lead launches Stage B with a new brief.

## Vocabulary (lead decisions, owner may overrule)
| today | becomes |
|---|---|
| `query`, `query --status` (full stack: open, then finished) | `list` (full stack, same rows, same `--json`) |
| `query --only new\|open\|done\|archive` | `list new\|open\|done\|archive` |
| `query --branches` | `list branches` |
| `query --critical` | `list critical` |
| `query --all`, `query --by-branch <b>`, `query --branch <b>` | `list all-branches` (every row carries its branch) |
| `query --phase <item>[,<item>...]` | `show <item>[,<item>...]` (reads exactly what `--phase` reads today; the other-branch refusal is 7c-4) |
| `query --events [<item>]` | `history [<item>]` |
| `query --changed [--agent <name>]` | `changes [--agent <name>]` |
| `next [--all] [--branch <b>]` | `next`, `next all-branches` |
| `backlog` with no argument = `next` | the top-level help (exit 0) |
Departure from the approved table: it says `list` with no word = open. The dispatcher's holder map needs finished items (`s not in DONE`), and
`query --status` already prints the full stack, so `list` keeps that; `list open` is one word away. Nothing is removed. Team views stay under
`backlog team query`; `src/team/query.js` calls the shared reader, so the user-command `query` command is split from that reader before it is deleted.

## Stage A: additive (one commit per task, old spellings keep working)
1. **Inventory to a file** (not committed): `<logs>/inventory-7c-2b.txt`, one row per old form (every `query` option, `next` option, the 27 alias
   rows) with its new form and the test or feature that covers it today. Count must reconcile: every row ends in MOVED, KEPT or REMOVED.
2. **`list`** (all rows of the vocabulary above) as a command of its own on a shared reader that `team query` also uses. Test first, and prove it
   bites: it fails on the old code. `list --json` output is byte-identical to `query --status --json` for the same backlog (test).
3. **`show`, `history`, `changes`, `next all-branches`**, each with its own `--help` (flags, exit codes, one example); `backlog` alone prints the help.
4. **Real commands for the kept behaviours**: `done <item>` (runs exactly what the alias runs), `clean [all-branches]` (the current `init clean`),
   `import --branch <source> [--higher]`, `archive done`. They are routed commands with their own help, not alias translations; items with a team are
   handled in 7c-2c, not here. Then run each against an item OUTSIDE its intended scope (an item of another branch, a finished item, an unknown
   name) and report what happened (lesson 36).
   **STOP after Task 4.** Report; the lead migrates the consumers and redeploys.

## Stage B: removal (only on the lead's new brief)
5. **`query` leaves the user-command tree**: out of the router table, help, COMMANDS.md, skill reference; `backlog query` answers "not a backlog command".
   `backlog team query` is unchanged (test: every team view still works).
6. **The aliases go**: `src/shared/aliases.js`, `translate`/`aliasOf`/`plan` in `src/main.js`, `HELP_OF`, the alias help rows, `aliases.test.js`;
   `features/aliases.feature` is rewritten as `features/commands.feature` for the real commands (keep every scenario that still describes a kept
   behaviour). Bare `backlog update` prints the help of `update` (exit 2) and never installs: `upgrade` is the only self-update.
   One table-driven test lists all 27 removed forms and asserts the generic answer (not a command / unknown option) and that nothing was written.
7. **Carried from 7c-2a**: `team update --status` on a team item must not print the user-update refusal text; give the team path its own line.
8. **Documents**: `backlog --help`, every command's help, `COMMANDS.md`, `templates/skills/backlog/references/commands.md`, README, CHANGELOG. A test
   enumerates the router table and every subcommand and fails when one has no entry in COMMANDS.md (each command and subcommand is represented).
9. **Gate and report.**

## Gate (each commit)
`run-tests.sh <label> node` (detached, ~3 min), `npm run check`, BDD with `FEATURE_LOCATION=local` and `remote`, guard
`BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js`.

## Not in this phase
Team-item refusals of done/move/archive/archive done/import/clean/replan, `--ask` for `new` and `team new`, the update notice (7c-2c); per-level help
and flags to subcommands (7c-3); branch scoping and config-only source (7c-4); topology skills, dispatcher, nightly and the pin (7c-5).

## Stop only for
A behaviour with no ruling that changes what a person can do (say what, give evidence). Not for naming or documentation coherence: decide, record
the reason in the report.

## Report (max 60 lines)
Commit hashes, exact full-suite counts, the inventory counts (MOVED/KEPT/REMOVED), behaviour changes not predicted here, tests deleted or changed
(titles), out-of-scope runs of Task 4 and their results, decisions taken with reasons.
