# Task 18: The team-session guard (B20a)


## 1. Goal & Scope

Goal: with `SMOOTH_BACKLOG_CLI_TEAM_NAME` set to a non-empty value, every user command, `setup` and `upgrade` included, stops before it reads anything with exactly `❌ backlog: teams are not allowed to use user commands` (exit 2, standard error, no hint).

Out of scope: the tests that set the team variable and run user commands (Task 19); any change to `backlog team ...`; reading the configuration's `team` key (it never blocks).

Specification: Task 18 of `.agents/docs/plans/completed/2026-11-11-team-rules-engine-remaining-work.md`. Use-case rows: 7 after the re-assignments named in section 6, which are made (list them with `awk -F'\t' '$6=="Task 18"' .agents/docs/plans/2026-11-12-simplify-branch-completion/use-case-status.tsv`). Delivered here: `R19A-01`, `R19A-02`, `R19A-03` (rule cases; pinned by tests titled with the case id in `.agents/test/user-visibility.test.js`, the file the BDD row names), `00-owner-rulings.md:R19a`, `review-c.md section 2:C-L4`, `review-d.md section 1:D-L7` (the guard runs before `setup` and `upgrade`) and `BDD-2.1-15`. `BDD-3-15` (the `plain-team-env.test.js` rewrite) is NOT delivered by this task: see section 6.

## 2. Architectural Decision Rules

- Owner rulings R19a (`.agents/docs/plans/2026-11-09-team-rules-engine/00-owner-rulings.md`): "When the TEAM_NAME variable is set, every user command fails (guard against an agent using the wrong command by accident or trying to get around the team commands). The text is a blanket failure with no instruction for the agent: teams are not allowed to use user commands. The owner did not ask to block `--help` or `--version`; the failure text only gives no instruction. Reading: top-level help and version are not blocked (pending confirmation for the help of a single user command)." R20: "Every environment variable the CLI owns is prefixed `SMOOTH_BACKLOG_CLI_`". R3b: "Team commands never read the user identity".
- Design chapter 04 section 8 (`design/04-team-commands.md`): "**The guard of team sessions (R19a).** When SMOOTH_BACKLOG_CLI_TEAM_NAME is set to a name, every user command stops before it reads anything: exit 2, exactly `❌ backlog: teams are not allowed to use user commands`, with no instruction and no hint (case R19A-01). The guard runs in `src/main.js` before `setup` and `upgrade` are dispatched there, so it covers them too (review D L7). `backlog --help`, `backlog --version` and `backlog <command> --help` are not blocked: R19a says the owner did not ask to block `--help` or `--version`, and the help of one command reads nothing (the command matrix). A variable set to the empty text names no team and does not block, the same reading as the team lookup of chapter 01 section 5 (case R19A-03; review C L4). The `team` key of `.backlog/config.json` does not block (case R19A-02): it is a default for team commands, not a sign of a team session. The guard catches an agent that uses the wrong command by mistake; it does not stop an agent that unsets the variable on purpose."
- Command matrix (`01-command-behaviour-matrix.md`): "`backlog --help`, `backlog --version`, `backlog <command> --help`: read nothing, write nothing."
- Plan, Task 18 "Decisions": "with `SMOOTH_BACKLOG_CLI_TEAM_NAME` set to a non-empty value every user command, `setup` and `upgrade` included, stops before reading anything with exactly `❌ backlog: teams are not allowed to use user commands` (exit 2, standard error, no hint); an empty value and the configuration's `team` key do not block; `backlog --help`, `--version`, `backlog` alone, `backlog <command> --help` and `backlog team ...` are not blocked; an unknown word is left to the router's own refusal. The command word is found as `src/main.js` finds it (a leading `--json` belongs to the command; no word means `next`)."
- Plan, Task 18 files: "Create `src/team/session-guard.js`; Modify `src/shared/router.js` (export `guardTeamSession(argv)`; `run` calls it after its own `--help` block and before `assertConfigReadable`), `src/main.js` (calls it in the `upgrade` branch after that branch's `--help` check and in the `setup` branch when `--help` is absent); docs (README, CHANGELOG, the skill's team section, and the general `team` help of `src/team/help.js`, whose sentence that the user commands ignore the team environment becomes the stop)".
- Specification B20a: "The guard blocks the words of the router's table except `team`, plus `setup` and `upgrade`; a command line with `--help` for which the command prints a help text is not blocked (the help block comes first in each place); an unknown word is left to the router's own refusal (exit 2, the \"is not a backlog command\" text). No file outside `src/team/` names the variable, so `.agents/test/team-boundary.test.js` stays as it is." Disagreement 7 (accepted): "the guard lives in `src/team/session-guard.js`, is exported through `router.js` as `guardTeamSession`, and `main.js` imports the router; the boundary test needs no change". Disagreement 6: "B20 depends on B14".
- Specification "Must not": "read the configuration, the team file or the backlog folder; print a hint; block `backlog team`." Plan: "name the variable outside `src/team/`."
- Global Constraints (plan): "no file outside `src/team/` names a team variable (`.agents/test/team-boundary.test.js`)". Boundary test fact: the test forbids any file outside `src/team/` from naming the team variables and any import of team code except from `src/shared/router.js`.

## 3. BDD Acceptance Criteria

Rule cases of `design/rule-cases.json` (quoted: input, expected exit and text):
- R19A-01: given item 91 without a team (status `pending`), command `{"run": "user-show", "item": 91, "env": {"SMOOTH_BACKLOG_CLI_TEAM_NAME": "web"}}`, expect `{"exit": 2, "text": "teams are not allowed to use user commands"}`.
- R19A-02: same item, command `{"run": "user-show", "item": 91, "config": {"team": "web"}}`, expect `{"exit": 0, "item": 91}`.
- R19A-03 (note: "review C L4: an empty variable names no team, so it does not block (the same reading as the team lookup)"): command with `"env": {"SMOOTH_BACKLOG_CLI_TEAM_NAME": ""}`, expect `{"exit": 0, "item": 91}`.

BDD plan section 2.1: "R19A (the team-session guard) | 3 | user-show | B20 | user-visibility | integration" (the cases run through `user-visibility.test.js`; the plan of this task adds `team-session-guard.test.js`).

Given/When/Then from the specification's cases:
1. Given the variable is non-empty, When each user command word (`new`, `update`, `list`, `next`, `fields`, `move`, `archive`, `show`, `history`, `changes`, `done`, `clean`, `import`) and `setup` and `upgrade` runs, Then exit 2, standard error holds exactly `❌ backlog: teams are not allowed to use user commands`, standard output is empty, and the backlog folder and the consumer checkout are byte-identical before and after. (source: "every user command stops before it reads anything: exit 2, exactly `❌ backlog: teams are not allowed to use user commands`")
2. Given the variable is set, When `backlog --help`, `backlog --version`, `backlog` (no word), `backlog list --help`, `backlog setup --help` or `backlog upgrade --help` runs, Then exit 0 and the help or version prints. (source: "`backlog --help`, `backlog --version` and `backlog <command> --help` are not blocked")
3. Given the variable is set, When `backlog team validate --team x` runs, Then it is not blocked (its own answer, never the guard's text). (source: "`backlog team ...` is not a user command.")
4. Given the variable is set and the word is unknown (`backlog frobnicate`), Then the router's own refusal `❌ backlog: frobnicate is not a backlog command (...)`, exit 2. (source: "an unknown word is left to the router's own refusal")
5. Given a leading `--json` (`backlog --json show 91`), Then the word `show` is found as `main.js` finds it and the guard blocks. (source: "a leading `--json` belongs to the command")

## 4. Target Files & Existing Helpers

Verified at the head:
- `src/main.js` (31 lines): the word is found at lines 18-22 (`let at = 0; while (argv[at] === '--json') at++; const named = argv[at] !== undefined && !argv[at].startsWith('-'); const command = named ? argv[at] : 'next';`); the `upgrade` branch lines 13-16 (its `--help` check at line 14); the `setup` branch line 17 (no `--help` check there: `setup --help` is handled inside `src/shared/setup.js`; the guard must not block `setup --help`, so the `setup` branch calls the guard only when `--help` is absent); the router call line 22.
- `src/shared/router.js` (36 lines): `TABLE` lines 10-14; `run(command, argv, { table = TABLE, help } = {})` line 21; the unknown-word refusal line 22; the `--help` block lines 23-29 (its text printed only when found); `assertConfigReadable()` line 30; `showAll(command === 'team')` line 33.
- `src/team/inputs.js:39` shows how the team name is read and that an empty value counts as unset (`given(flags.team, env.SMOOTH_BACKLOG_CLI_TEAM_NAME, config.team)`); `src/team/` files may name the variable.
- Existing help sentence to replace: `src/team/help.js:19` ("The user commands know nothing of teams: they ignore the team environment and the team entries."), mirrored in `COMMANDS.md:1129` and `templates/skills/backlog/references/commands.md:1129` (regenerated by `node .agents/scripts/sync-commands-md.mjs`).

Interfaces.
- Consumes: `process.env`, `TABLE` of the router.
- Produces: `src/team/session-guard.js`: `export function guard(argv, env = process.env) -> null | { code: 2, text }` (the text is the one line above); `src/shared/router.js`: `export async function guardTeamSession(argv)` returning the exit code (2) after printing to standard error, or `undefined`; `run` calls it after its own `--help` block and before `assertConfigReadable()`; `main.js` calls it in the `upgrade` branch after the `--help` check and in the `setup` branch when `--help` is absent. The guard decides the word from `argv` the way `main.js` does and blocks a word that is in `TABLE` except `team`, or is `setup` or `upgrade`.

## 5. TDD Execution & Verification

Failing tests first: the three rule cases go into `.agents/test/user-visibility.test.js` as tests titled `R19A-01: ...`, `R19A-02: ...`, `R19A-03: ...` (the file the BDD row names); the others go into `.agents/test/team-session-guard.test.js` (new; `cli` and `consumer`/`sharedBacklog` of `.agents/test/shared-fixtures.js`, folder compared before and after as `removed-forms.test.js` does with a hash of the tree):
- `R19A-01: show with the team variable stops: exit 2 and exactly the line`.
- `R19A-02: the team key of the configuration does not block` and `R19A-03: an empty variable does not block`.
- `every user command word stops with the variable set and changes nothing` (loop over the words of criterion 1, including `setup` and `upgrade`; assert stdout empty, folder identical).
- `help, version and a bare backlog are not blocked` (criterion 2).
- `backlog team validate --team x is not blocked` and `an unknown word keeps the router's refusal`; `a leading --json belongs to the command`.
Mutations killed: calling the guard before the `--help` block (help tests fail); calling it after `assertConfigReadable` (a test with an unreadable `.backlog/config.json` and the variable set must still answer the guard's text, exit 2, before the configuration refusal); blocking `team`; treating an empty value as set; hint text appended.

Docs (same commit): `README.md`, `CHANGELOG.md` (`## Unreleased (2.0.0)`: "a session that sets the team variable can no longer run any user command, `backlog setup` and `backlog upgrade` included; its agent uses `backlog team ...` only"), the skill's team section (`templates/skills/backlog/SKILL.md`) and `references/commands.md`, the `team` help sentence in `src/team/help.js`, `src/help.js` where it says user commands ignore the team environment, then `node .agents/scripts/sync-commands-md.mjs`.

Commands that must pass: `npm run check` (exit 0); the private-details guard `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<the private deny-list file> node --test .agents/test/no-private-details.test.js` (3 pass); `flock <suite lock file> node --test .agents/test/*.test.js` (fail 0) — expect the tests that set the team variable and run user commands (`plain-team-env.test.js`, `shared-severity.test.js` line 49) to fail until Task 19; so repair them here minimally (add the variable only to team calls or remove it) and let Task 19 finish the rewrite, because "Every commit leaves the whole suite green ... Importers and guard tests that a task breaks are repaired in that task, never in a later one." `flock <suite lock file> env FEATURE_LOCATION=local node --test .agents/test/features.test.js` and `FEATURE_LOCATION=remote` (fail 0).

## 6. Must-not and Carry pointers

Must not (plan): "read the configuration, the team file or the backlog folder; block `backlog team`; name the variable outside `src/team/`." Also: print a hint; block `--help`, `--version` or a bare `backlog`.

Carry pointers: the execution review record's carry for Task 2 (the dropped session-variable refusals of `pop`): "the flag wins and a mismatch is not refused" (unrelated to the guard; the guard never runs for `backlog team`). The review record ruling "the audit items filed under B20a/B20b concern dependencies and are start checks of Task 22" means no audit item changes this task. Global: "No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id."

Use-case rows not delivered by this task's text: `BDD-3-15` (".agents/test/plain-team-env.test.js | 7 | 7 | team behaviour 7 | B20 rewrite: the team variable now stops every user command (today user commands ignore it)") is the rewrite that Task 19 performs; the row's task column says Task 18, so the plan's maintainer re-assigns it to Task 19.
