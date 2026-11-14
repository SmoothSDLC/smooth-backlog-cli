### Task 11: `--show-all` on the reading commands and on `new` (B17b)

**Files:** Modify `src/shared/read.js` (`take` accepts `show-all` for `list`, `next`, `show`, `history`, `changes`), `src/shared/query.js` (`BOOL` gains `show-all`; a team column and `team` in rows with the flag; `next` ignores team entries without it), `src/shared/seen.js` (`changedSince`: team items left out unless the flag; `held` is `!fm.team && fm.claimed_by === agent`), `src/shared/new.js` (the flag; `--depends-on` names a team item only with it; `--split-from` of a team item refused until Task 14), `src/help.js`, docs; Test `.agents/test/user-visibility.test.js`.

Added after Task 10's review: one test runs user writes (`backlog archive done`, `backlog move --to-branch`, `backlog done`) on a folder with team items between user items and asserts every team item file and index entry is byte-identical afterwards.

- [ ] **Step 1: Failing tests**: R16-01 (`show 90 --show-all` shows the item with its team), R16-03 (`new --depends-on 90 --show-all` creates the item with `depends_on` 90); `list`, `list branches`, `next`, `show`, `history`, `changes` with and without the flag; `history` of a team item without it is `no phase`; `changes` lists no team item and no held entry by `reviewer` or `refiner`; `fields --show-all` exits 2.
- [ ] **Step 2–5:** FAIL, implement, docs (CHANGELOG breaking: these commands no longer show team items), standard proof.

**Must not:** add the flag to a writing command other than `new`; change exit codes.

- [ ] **Step 6: Commit.**

---

## Lead additions
- Task 7's quality review recorded dead team-hook machinery in src/shared/query.js (no caller since the old views were unrouted): delete it in this task, since you edit query.js; coverage line in the commit body.
- user-cases.js (Task 10): userCase(dirs, items) -> { run(args, env?, stdin?), folder, slugOf(seq) }; items are { seq, team?, repo?, fields? }. The view is set once per command by src/shared/router.js (showAll(command === 'team')); --show-all sets it on for the reading commands and new.

## Global Constraints

- Node 24: `engines.node` is `>=24`; every command of this plan runs under Node 24 (`node --version` prints `v24.`).
- Environment variables are prefixed `SMOOTH_BACKLOG_CLI_` (`_TEAM_NAME`, `_AGENT`, `_SESSION`, `_TEAM_REPOSITORY`, `_TEAM_BRANCH`, `_HOME`, `_LOCK_WAIT_MS`, `_PRIVATE_DENYLIST`); no unprefixed name is read, and no file outside `src/team/` names a team variable (`.agents/test/team-boundary.test.js`).
- Public repository: no tracked file and no commit message names a host or machine, a local path, a port or address, a model, a private repository, an internal agent or tool, a private process or a credential. The private-details guard runs before every commit. The pull request text is written outside the repository.
- Every commit leaves the whole suite green: the standard proof below passes at each task's own commit. Importers and guard tests that a task breaks are repaired in that task, never in a later one.
- No test is deleted, skipped or weakened except where its task names it. A test whose expectation changes is named in the commit body with the reason.
- Coverage rule: every test a task removes is classified against `design/coverage.tsv` in that task. The commit body lists one line per removed test: `<file>: <test title> -> <coverage id> <BAKE-IN | LAZY-LOAD | SKIP | DEFERRED-WITH-EXPLICIT-BLOCKER> (<surviving test that covers it, or the reason>)`. A removed test that matches no row is not removed until a row or a surviving test covers it. A removed test whose subject is a user command is rewritten onto the user commands (items written with `writeStored` of `.agents/test/shared-fixtures.js`), not removed.
- Documentation rule of `AGENTS.md`: every change of a command, option, output, refusal, rule or stored field ships in the same commit with `templates/skills/backlog/SKILL.md` (and `references/commands.md`), the help text (`src/help.js`, `src/team/help.js`), `COMMANDS.md` regenerated with `node .agents/scripts/sync-commands-md.mjs`, `README.md` where it describes the behaviour, and `CHANGELOG.md` (section `## Unreleased (2.0.0)`). None of them describes the old behaviour.
- No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id.
- Scratch runs of the CLI outside the test suite set `SMOOTH_BACKLOG_CLI_HOME` to a temporary folder and run in a scratch git repository with no remote of the person's.
- The CLI never writes the team file; a user command never reads it; a number is never handed out twice; a refused team command writes nothing in either repository (the provisional exception of open decision 2 below).
- Every task starts by re-reading every file:line it names with `grep` on the current head; a name that moved is followed, a behaviour that differs from the task's text stops the task.


## Review Focus

1. Branch names that contain a slash (`feature/a-b`) and team items on several branches of one folder: `pop`, `query plan` and the `query` list read the session's branch only, in index order, and never offer an item of another branch (tests: Task 2 step 1, Task 7 step 1).
2. A team command run from a subdirectory of the working copy (`src/` of the consumer checkout) behaves exactly as from its top: same repository, branch, team file and item (tests: Task 2 step 1, Task 3 step 1).
3. `--help` of every team word run outside any git repository, with no backlog and no configuration, prints the help, exits 0 and creates nothing (no `.backlog/`, no clone) (test: Task 8 step 1).
4. A team item edited by hand (fields named `events` and `phase`, fields in an order unlike the definition, an undeclared field) passes through `backlog team query <item>` and through `--show-all` user writes with every byte outside the changed keys, `updated`, `updated_by` and the new history entry kept (tests: Task 7 step 1, Task 13 step 1).
5. An item named as `7`, `007` or by its slug reaches the same item in `team update`, `query check` and `query <item>`; a number held by a live and an archived item is refused with the `index.find` text naming both (tests: Task 3 step 1, Task 7 step 1).


## Lead note (process change)
(unreviewed; do not apply blindly). Docs order: the Task 6 follow-up fix (help, README, CHANGELOG, COMMANDS.md) merges before
you; before your docs step run `git fetch origin` and rebase onto the head of origin/simplify/pr3-review once it has moved past
6d345ce; if it has not, do the docs on 6d345ce and the lead rebases.
