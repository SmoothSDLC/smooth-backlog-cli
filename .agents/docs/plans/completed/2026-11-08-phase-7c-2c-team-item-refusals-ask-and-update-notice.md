# Phase 7c-2c: user commands and team items, `--ask`, and the update notice

Owner rulings behind it: AO = a (user-command `update` refuses every change to a team item; `backlog team update` is the only door); AP (owner 2026-11-07: `backlog new` and
`backlog team new` are valid, `--ask` is the interactive way to be prompted for the remaining fields); AI (owner 2026-11-06: the update notice and the upgrade check stay
expected behaviour, run about once a day, the config entry decides whether the external call runs, async, quick timeout, warning only, fully documented in the help files).

Worktree `<worktree>`, branch `simplify/pr3-review`, HEAD `bc6cc44` (suite 1106/1106, BDD 101 per location). Commit only through
`<logs>/commit.sh "<msg>"` (every commit becomes the machine's live `backlog`). Every commit leaves the full suite, `npm run check`, BDD
(local + remote) and the no-private-details guard green. Do not push. Public repository: no private names, hosts or paths in code, tests, docs or commit messages.

## Facts (2026-11-08)
- `src/upgrade.js` already has `due(config, now)` and `scheduled()` (weekly default on, auto default off, 24 h interval with `auto`, 1 h retry after a failed check,
  warnings through a `notice` callback to stderr). Nothing in `src/main.js` calls `scheduled()`: the notice is implemented and unwired.
- User-command `update` refuses a team item (`OF_A_TEAM`, src/shared/update.js); `done` runs `update --status done`, so it is refused there too.
- Recorded lead decision (owner may overrule): user-command `move` and `archive` stay available for team items (housekeeping: location and finished-item storage, no team rule).
- `--ask`: lead decision AP: without a terminal it is refused (exit 2); not restored on `update`; any other command still rejects it except `setup`.

## Tasks (in order, one commit each)
1. **Audit, then refusals.** For each of `done`, `move`, `archive`, `archive done`, `import`, `clean`, `replan` (user-command tree): write a table to
   `<logs>/audit-7c-2c.md` (outside the repo) with what the command does today to an item that has a team (probe it in a throwaway clone,
   never in a live backlog) and whether it changes the item's team state (status, stage, claim, review, refinement, dependency, team queue position, deletion).
   Rule: a user command refuses an item with a team iff it would change that team state; housekeeping that applies no team rule stays (move, archive, per the lead
   decision above; `archive done` archives finished items: keep unless the audit shows it breaks a team rule). Refusal is one line, exit 1, nothing written, naming
   `backlog team update` or stating that no team door exists for the operation. One constant per text. Tests: one engage test (team item refused, nothing written) and one
   bite test (user item unaffected) per refused command. Help and COMMANDS.md say which commands refuse team items.
2. **`--ask`** for `new` and `team new`: on a terminal, prompt for each field not supplied on the command line (title/name, body, and for team: the team item's fields);
   without a terminal exit 2 with one line; prompts go to stderr, the item path/slug result to stdout as today. Testable without a real terminal (inject the reader). Help,
   COMMANDS.md, skill reference. Other commands keep rejecting `--ask`.
3. **Update notice wired.** After every command except `--help`, `--version`, `upgrade` and `setup`, and only when stderr is a terminal (lead decision: the notice is for
   the user; agents and scripts parsing output see nothing), call `scheduled()` without delaying the command: run it with a short timeout (<= 1500 ms added at most, only
   when a check is due; no added latency otherwise), never change the exit code or stdout, warnings only on stderr, a failed check never fails the command. Config gate
   stays in the user config (`weekly`, `auto`); tests use an isolated `XDG_CONFIG_HOME` and a fake registry, never the network. Document in `backlog --help`, `upgrade --help`,
   COMMANDS.md, skill reference, README, CHANGELOG: when it runs, how to turn it off (`backlog upgrade disable`), the defaults, what it prints.
4. **Gate and report.**

## Gate (each commit)
`setsid nohup <logs>/run-tests.sh <label> node` (detached; bare nohup is killed when the tool call ends; ~3 min;
log in simplify-logs), `npm run check`, BDD with `FEATURE_LOCATION=local` and `remote` (`<logs>/bdd.sh`), guard
`BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js`. The docs test (`commands-documented.test.js`)
must stay green: every new word is documented.

## Stop only for
A behaviour with no ruling that changes what a person can do (say what, give evidence). Not for naming or doc coherence: decide, record the reason in the report.

## Report (max 60 lines)
Commit hashes, exact full-suite and BDD counts, the audit table summary (command: refused / kept, reason), behaviour changes not predicted here, tests deleted or changed
(titles), decisions taken with reasons.
