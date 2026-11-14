# 09 — Resolution of the behaviour gaps (impact analysis 2026-11-08, audit 7c-2c, withdrawn decisions AS–AV)

Inputs read: `the owner decision log/impact/impact.tsv` (214 forms: PRESERVED 72, MOVED 95, NARROWED 17, REMOVED 30), its probes and
inventories, `the owner decision log/audit-7c-2c.md`, the withdrawn decision files 20261108-AS, AT, AU, AV (premises not reused; each is
re-derived below from the principle). The full row-by-row table is `gaps.tsv` (47 rows: every NARROWED and every REMOVED row of
`impact.tsv`, each exactly once, with its terminal state, resolution, requirement and phase).

## 1. Terminal states and totals

| state | meaning | rows |
|---|---|---|
| (a) FILE-RULE | a hard-coded flow or team rule; it belongs in the team behaviour file (key and REQ named); its removal from the user-command code is correct | 3 — S29b (`steps.set-status`, REQ-113), S82 (`session.block_after_end`, REQ-114), S92 (`completeness` / `missing` on `team query --phase`, REQ-505) |
| (b) USER-FEATURE | a user capability that is not enforcement; restored or defined in the user-command code without any flow rule | 15 — L09, L29 (decided by the owner ruling on the user flow, D-33), L12, S06, S87, S88 (`list branch <name>`, `next branch <name>`, REQ-920, decision AR); L13 (`list branches` columns, REQ-921); L43 (`import all`, REQ-922); L33 (`--add-line` JSON array, REQ-923); L52 (skill refresh, REQ-924); L55 (exit codes, REQ-925); L56 (detached HEAD, REQ-926); S101 (`list blocked`, REQ-927); L27 and L51 (already restored in 7c-2c, REQ-940) |
| (c) TEAM-COMMAND | a new team step to reach an established team pattern; asked as an owner question, requirements written now as CONDITIONAL | 0 impact rows; 3 from the re-derived 7c-2c decisions: Q-06 delete door (REQ-930), Q-07 team move (REQ-931), Q-08 abandon an unfinished item (REQ-932) |
| (d) ACCEPTED-LOSS | removed by an owner ruling that does not conflict with the principle (ruling cited per row in `gaps.tsv`) | 22 — S103 (no limits in the user flow, D-18), L04, L06, L14, L16, L18, L21–L26, L39, L61, S01, S02, S08, S94, S99, S100, S102, S112 |
| OWNER-QUESTION | not decidable from the repository or the principle | 7 — L32 (Q-09), L53 (Q-10), L54 (Q-11), L57, L58 (Q-12), L59 (Q-13), S95 (Q-14) |
| total | | 47 = 17 NARROWED + 30 REMOVED |

Owner-ruled losses judged against the principle: S29b (owner 20261105-J / AO) conflicts in form — the principle requires the file, not the
CLI, to decide whether a team item's word can be set directly — so it is FILE-RULE (the template still refuses, as AO wants). S99, S100,
S102, S112 (team views and pop only under `backlog team`) agree with the principle and stay ACCEPTED-LOSS. No other owner-ruled row touches
flow.

## 2. Re-tested facts (the impact report's caveat)

Re-tested on 174c76d in a throwaway clone (2026-11-08): `show 999999` exit 1 (`❌ no phase '999999'` on stdout); `list bogusword`
exit 2 (stderr); `update 999 --name x` exit 1; `new` without `--name` exit 1; `update 1 --status bogus` exit 0 and the word is stored;
`archive` of that item exit 1 (`is 'bogus', not 'closed'`); user `--claim bob` after `--claim alice` exit 1; on a detached HEAD
`list` and `new` exit 2 (`check out a branch`). So the report's "failures and invalid input both exit 2" is **not** confirmed: refusals
and not-found exit 1, syntax exits 2; the one real case of a failure exiting 2 is an uncaught program error (`main.js`:
`error.exitCode || 2`). REQ-925 fixes the contract and makes uncaught errors exit 1.

## 3. The user features (b), spelled by the owner rules

All follow "one behaviour per command; an option that is not required data is a subcommand; the current branch by default":

| impact | command | output | exit |
|---|---|---|---|
| L12, S87, S88 | `backlog list branch <name> [--json]` | as `list` on that branch | 0; unknown branch info line 0 |
| S06 | `backlog next branch <name> [--json]` | as `next` on that branch | 0 |
| L13 | `backlog list branches [--json]` | `branch open done archived total` | 0 |
| L43 | `backlog import all --branch <source>` | `✅ imported <n> item(s) of <source> into <branch>: <slugs>` | 0 / 1 on a failed step |
| L33 | `backlog update <item> --section "<H>" --add-line '<JSON array>' [--top]` | the usual update line | 0 |
| L52 | (every command) | `ℹ️  backlog: skill copies refreshed for <version>` on stderr, once per version | unchanged |
| L55 | (every command) | — | 0/1/2/3/5 table of REQ-925 |
| L56 | (every command on a detached HEAD except `list branch`/`next branch`) | `❌ backlog: HEAD is detached: check out a branch (git switch <branch>), or read one with backlog list branch <name>` | 2 |
| S101 | `backlog list blocked [--json]` | items with an unfinished dependency and their waits | 0 |
| L27, L51 | already in 7c-2c | — | — |

`list branch <name>` and `next branch <name>` are decision AR (answered a) and replace the planned 7c-2d.

## 4. The withdrawn decisions, re-derived

- **20261108-AS** (eleven impact decisions): every one of its rows is in `gaps.tsv` with a state above; none is reused as an option.
- **20261108-AT** (clean, replan, archive --force of team items): whether a user command may do this to a bound item is now a file rule —
  `user_commands.clean`, `user_commands.update-replan`, `user_commands.archive-unfinished` (REQ-901, state FILE-RULE; the template
  reproduces the 7c-2c refusals). The team doors that do not exist are owner questions: deletion Q-06, abandon Q-08. A team replan already
  exists (`backlog team update --replan`, `--priority`, audit 7c-2c), so no question.
- **20261108-AU** (user move of team items): `user_commands.move-branch` / `move-repository` (FILE-RULE, template allows, as today);
  whether the team needs its own move is Q-07.
- **20261108-AV** (notice timing): a user feature without flow; Q-15.
- **Team views** (queue, blocked, WIP for a team): they exist (`team query --claimable|--reviewable|--blocked|--decisions|--wip|--plan`)
  and become file-driven (REQ-805, REQ-605); no new command is needed.

## 5. Integration into the other documents

- Requirements: REQ-113, REQ-114 (FILE-RULE), REQ-505 (S92), REQ-920..REQ-927, REQ-940 (USER-FEATURE), REQ-930..REQ-932 (TEAM-COMMAND,
  CONDITIONAL on Q-06..Q-08), REQ-908, REQ-910 (decided: D-33, D-18), REQ-933..REQ-938 (CONDITIONAL on Q-09..Q-14), REQ-939 (Q-15) — `03-spec.md` §10.
- Scenarios: `features/user-gaps.feature`, `features/team-conditional.feature`, `features/user-flow.feature` and the S-113/S-114
  scenarios in `features/team-statuses.feature` (`04-bdd.md` §6).
- Tests: `user-gaps.test.js`, `user-flow.test.js`, `team-conditional.test.js` and the T-113/T-114 cases (`05-tdd-plan.md` §4).
- Phases: PH-13 (user features) and PH-14 (conditional team doors and user features, after the answers) in `06-migration-plan.md`.
- Traceability: `07-traceability.tsv` part B lists the 47 impact rows with their requirement and phase.
