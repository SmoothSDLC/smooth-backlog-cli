# Phase 7c-1 — Rule T: team behaviour lives only under `backlog team`

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** `git log --oneline -1` in the worktree shows `18eb5b9` or a later commit of this branch; the suite is green at HEAD.

> **DECISION THIS PHASE RESTS ON (answered, none open):** 20261107-AL = a (owner, 2026-11-07): approve the revised command
> design. Source documents: [2026-11-07-command-surface-proposal.md](../../analysis/2026-11-07-command-surface-proposal.md) (REVISION 2) and the owner rule in [2026-11-04-pr3-simplification-log.md](../2026-11-04-pr3-simplification-log.md)
> ("Owner rule of 2026-11-07"). Nothing in this phase waits for a decision; a step that seems to need one is
> executed as written and the doubt is reported at the end.


## AMENDMENT 2026-11-07 (after Task 1) — supersedes the Goals and tasks below wherever they differ

Owner answers: decision 20261107-AM = a (dependencies stay for every item) and the clarification "most FLAGS can be used by teams or
user commands, unless they are specific to behaviour that requires a team; dependencies do not require a team". The only thing that controls
what a team can or cannot do is the team rules and team definition in `teams.json`.

**Criterion C.** A flag or behaviour is TEAM-SPECIFIC if and only if it has no meaning without a team: its code path reads `teams.json`, a
team name, a team member / agent / lead, a stage, or a claim / review / hand-off / refinement. Everything else is GENERIC: it stays on the user-command
command AND is accepted by `backlog team update` / `backlog team new` (they share the parser; import it, never copy it). Apply C row by row to the
inventory; when a row is borderline, keep it GENERIC (nothing is removed on judgement) and list it in the report.

**Goals as amended**
- Goal 1 unchanged (team code in `src/team/`).
- Goal 2 narrowed: outside `src/team/` nothing reads `TEAM_NAME`, `TEAM_REPOSITORY`, `TEAM_BRANCH`, `TEAM_LEAD`, reads `teams.json`, or applies a claim /
  review / stage / refine / hand-off rule or a team- or agent-level work-in-progress limit. `BACKLOG_AGENT` STAYS (it is the identity of whoever acts,
  for every command; seen.js, storage.js). Dependencies stay shared.
- Goal 3 narrowed: no new refusals. The refusal that exists today (a stage-changing flag such as `--status` on an item with a team: "use backlog
  team update") stays as it is; GENERIC flags work on team items from either command.
- Goal 4 narrowed: user-command `new` loses only TEAM-SPECIFIC options (`--team`, `--review-refs`, a split of a team's item, whatever else C marks);
  `--depends-on`, `--estimate`, `--complexity`, `--layer` stay. User-command `update` loses only the 32 flags of `TEAM_VALUE` / `TEAM_BOOL` and the `moved:` notice,
  plus `--set-team`, `--set-review-refs`; the other setters follow C. User-command `query` loses the six team views and `--agents`.

**Resolutions of the Task 1 rows**
- N1 old-format reading: Option A (one translation, in `status.js`; stage vocabulary stays outside `src/team/`). Removed later with the migrate-or-fail upgrade step, not now.
- N2 dependencies: Option A. Code moves to `src/shared/dependencies.js`; `update --set-depends-on`, `next`, `move` and the write check keep behaving as today for every item.
- N3 work-in-progress limits: overall, repository and branch levels (from `wip-limits.json`) stay shared in `src/shared/wip-limits.js`; the team and agent levels (from
  `teams.json`) are team hooks.
- N4 `BACKLOG_AGENT`: stays shared. Task 4 does NOT remove it; it removes the four `TEAM_*` variables only.
- N5 `missingFields` / `missing` in `query --phase` and the definition-of-done parser of `new.js` that serves the team's incomplete-item rule: team. The `missing` field leaves user output.
  Report the exact user output lines that change.
- N6 the hand-off gate at a status close (`runCloseGate`, `handoffs: none`, `DEPENDENCY_HANDOFF: NONE`): team hook. A user-command close writes none of it. Report it as a user behaviour change.
- N7 `--set-team` and `--set-review-refs`: team. `--set-chunk`, `--set-estimate`, `--set-complexity`, `--set-layer`, `--severity`: apply C; borderline stays with the user commands.
- N8 hooks: approved. update.js and sync.js receive an object of team functions from `src/team/cli.js`; the user commands pass none.

**Task changes.** Task 3 follows the narrowed Goals 3-4. Task 4 removes the four `TEAM_*` variables and every `teams.json` read from files outside `src/team/` (team code receives
scope as an argument). Task 5's guard test checks those four names, `teams.json`, and imports of `src/team/` (not `BACKLOG_AGENT`). Task 6: the user-command help keeps the generic
flags; team flags move to the team help.

**Goal (Rule T):** team behaviour exists ONLY under the command group `backlog team`. After this phase:
1. Every source file that implements team behaviour lives in `src/team/` (a new folder).
2. No file outside `src/team/` — other than the one router line that maps the word `team` to it — imports from `src/team/`,
   reads `TEAM_NAME`, `TEAM_REPOSITORY`, `TEAM_BRANCH`, `TEAM_LEAD` or `BACKLOG_AGENT`, accepts a team flag, or applies a
   claim / review / stage / refine / work-in-progress-limit / team-lead / dependency rule.
3. A user command (everything that is not `backlog team …`) given an item that belongs to a team refuses with ONE line:
   `item <slug> belongs to team <T>: use backlog team update <slug> …` (exit 1, nothing written). "Belongs to a team" =
   the item's front matter has a `team` key with a value.
4. User-command `new` creates user items only (no `--team`, `--chunk`, `--review-refs`, `--depends-on`, `--estimate`,
   `--complexity`, `--layer`, no split-from-a-team-item behaviour). User-command `update` takes no team flag (the 32 flags of
   `TEAM_VALUE` / `TEAM_BOOL`) and no longer prints `moved:`; an unknown option is the ordinary unknown-option error.
   User-command `query` has no team view (`--claimable --reviewable --blocked --decisions --plan --wip`, `--agents`).
5. A test fails the build when any of 2 is violated again (Task 5).

Out of scope (later phases, do not start): renaming/removing commands and aliases, flags that become subcommands, per-level
help, branch scoping, config-only backlog source, documentation. If the code forces one of them, report it.

## What exists today (starting points, verify with `grep -n`; the line numbers drift)

- Team files in `src/shared/`: `team.js` (330), `team-cli.js` (181, the `backlog team` router), `team-pop.js` (200), `views.js` (132, team
  views), `wip.js` (102), `workflow.js` (237), `handoff.js` (166), `handoff-commands.js` (101), `handoff-close.js` (25), `pop.js`
  (366). `lifecycle.js` (573) holds the team steps (claim, release, review, close, refine, hand-off) AND the checks that user commands
  `update` also runs.
- `workflow.js` mixes two things: the STATUS vocabulary every command uses (`STATUSES`, `SIDE`, `isFinished`, `isOpen`,
  `isUnstarted`, `normalise`, `stageOfStatus`…) and the team's stage rules (`stageRules`, `canStep`, `next`, `stageSatisfied`,
  `passCount`, `statusOf`, `lift`, `validateWorkflow`, `loadWorkflow`). It is imported by 16 files, among them `store.js`,
  `sync.js`, `index.js`, `repair.js`, `sequence.js`.
- Leaks found by reading (confirm each with the grep given): `update.js` runs the team steps when a team flag is given (`grep -n "TEAM_VALUE\|TEAM_BOOL\|moved:" src/shared/update.js`);
  `new.js` imports `teamName, teamScope, outsideTeam…` and creates team items (`grep -n "team" src/shared/new.js`); `query.js` computes
  team views (`grep -n "TEAM_VIEWS\|teamView\|wipView" src/shared/query.js`); `archive.js`, `move.js`, `store.js` (queue order),
  `lifecycle.js` read `TEAM_REPOSITORY` / `TEAM_BRANCH` / `TEAM_NAME` (`grep -rn "TEAM_" src | grep -v help.js`).

## Handoff context (read fully before the first command)


- Work ON the the development machine machine in the git worktree `<worktree>`, branch `simplify/pr3-review`.
  Never touch `<main-clone>`. Never create another branch, never push, never open a PR.
- Node is `node` (v24). `npm test` = `node --test .agents/test/*.test.js`; `npm run check`.
- Full suite: `bash <logs>/run-tests.sh <label> node` →
  `<logs>/<label>.log` (~2.5 min; detached with `setsid nohup ... >/dev/null 2>&1 &`
  if your shell has a time limit; poll `grep -E "^ℹ (tests|pass|fail|skipped)|^exit=" <log>`; failures `grep "^✖" <log>`).
- One file: `node --test --test-reporter=tap .agents/test/<file> 2>&1 | grep -E "^(not ok|# pass|# fail)"`;
  reasons: `... 2>&1 | grep -E "^\s+error" -A6`.
- BDD: `FEATURE_LOCATION=local node --test .agents/test/features.test.js`, then `remote`; both green.
- Private guard before every commit:
  `BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js` → `pass 3`.
- Commit: `bash <logs>/commit.sh "<message>"` (author `<author>`,
  no trailers). The message says what changed for a user; never a machine, path, agent, model, item number or owner
  decision.
- PUBLIC REPOSITORY RULE: code, tests, docs and commit messages name no private repository, host, machine, path,
  port, internal agent or team name, model name, backlog item number or owner decision.
- codebase-memory: `codebase-memory-mcp cli --quiet index_repository '{"repo_path":"<worktree>"}'`
  before Task 1; before deleting or changing the signature of any exported function run
  `codebase-memory-mcp cli --quiet trace_path '{"project":"<project>","function_name":"<X>","direction":"inbound"}'`
  and ALSO `git grep -n "<X>" -- src .agents features` (tests and dynamic references); cite both in REVIEW-LOG.md.
- Skills to load at the start: `superpowers:executing-plans`, `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`, `ponytail:ponytail`; `ponytail:ponytail-review` before each commit;
  `superpowers:systematic-debugging` at the first unexpected failure. Each use = a row in `REVIEW-LOG.md`.
- Behaviours of this phase: this is a DELETION phase — the test that must fail first is a negative one ("the export
  no longer exists" / "the message no longer appears") where that is meaningful; otherwise the proof is the green
  suite after the deletion. Delete whole functions, never leave a stub. When a test exists only to exercise the
  deleted code (a staged database conflict, a replayed row, a ghost row), delete the test and list its title in the
  commit message. Never weaken a test that exercises behaviour through the CLI. Keep the file rollback in
  `undoOnThrow` and the journal: they protect the item files.
- LESSONS FROM THE PHASE 1 RUN (apply in every task): (1) line numbers in this document are from the commit it was
  written at and drift — locate code by the quoted text with `grep -n`, never by number; (2) a fixture or helper this
  document names (for example `build(false)`) must be confirmed first with `grep -n "^function <name>\|^const <name>" <file>`
  — if it is not there, use the file's shared helper and say so in the report; (3) the Files list of a task is a
  starting point, not the scope: after the change, the full suite is the authority — every failing test is in scope,
  and every file you change beyond the list goes into the report; (4) when a flag or path is removed, look for the
  modifier flags, help sentences and comments that only made sense with it (`grep -n -i "<word>" src/help.js src/shared/*.js`)
  and remove them too, naming each in the commit message; (5) never predict a test count — record the count the
  runner printed; (6) the codebase-memory `trace_path` call is mandatory where this document says so: when it answers
  "ambiguous", call it again with one `qualified_name` from its suggestions; paste the call and its answer into the
  REVIEW-LOG.md row; (7) run `commit.sh` alone in its own shell call (a compound command with a commit can hit the
  shell's time limit); after any timeout, check `git log --oneline -3` before repeating anything; (8) REVIEW-LOG.md
  gets one row per skill or tool use, and its text describes the work ("the duplicate-removal round"), never a plan
  document, phase number, machine, agent or model; (9) prose records under `.agents/docs` that mention a deleted file
  are history, not references — leave them.
- LESSONS FROM THE PHASE 2 RUN (apply in every task): (10) a change to an item's front matter is written with
  `store.write(item, folder, { frontMatterOnly: true })` so the body, BOM and line endings stay byte-identical (seven
  archive tests pin that); `store.write` takes an absolute `path`; (11) any new or changed front-matter key must be
  checked against the stale-read guard `RANK_ONLY` in `src/shared/seen.js` (keys that are not "content"): a key that
  grows without being a change of the item (history, counters) goes into that list, else another agent's write makes
  every earlier read stale (eleven team-flow tests failed on this before the fix); (12) when a code block to delete
  also does one thing that must stay (the `moved_in` event lived inside the database-copy block of `move.js`), keep
  that one thing as its own line and name it in the commit message; (13) timestamps have one-second resolution — a
  test never asserts an exact order of events from different items in the same second (compare a sorted set); (14) a
  test this document says must be RED may already be GREEN when an earlier task made the behaviour true — write it
  anyway, say so in the report, and do not invent a failure; (15) output lines that count database work
  (`rescan: … (re)ingested`) change when a file is written after a scan: they describe the database, not the backlog,
  and Phase 3 removes them — until then, update the expectation, never the code, to keep a count stable; (16) the
  code graph does not see callbacks (`.map(store.parseEvent)`): a `trace_path` answer of "0 callers" for a function
  passed by reference is wrong — add `git grep -n "<name>" src` to the row and cite both.
- LESSONS FROM THE PHASE 3 RUN (apply in every task): (17) `db.scan` opens its own transaction — never wrap it in
  `BEGIN`/`COMMIT` of your own; (18) start a detached run as `( setsid nohup <cmd> >/dev/null 2>&1 </dev/null & )` —
  the bare `&` form sometimes held the shell open until the time limit; never `pkill -f` from the tool (it kills your
  own shell); (19) a plan sentence "behaviour of every command is unchanged" is a claim to verify, not a fact: list
  every behaviour change you observe in the report even when the plan did not predict it; (20) when the stale-read
  guard or the publication guard has a trigger you remove (a database conflict), find what still has to trigger it
  (here: the same-rank file conflict sets `renumbered.mirror`, soon `renumbered.reranked`) and keep that path with a
  test; (21) tests that compare whole database dumps or row ids are tests of the old mirror — rewrite them to compare
  item files through the CLI, and list every deleted title in the commit message and the report; (22) a command's
  refusal text that mentions internal mechanics ("the rescan does not visit archive/") is a documentation defect: fix
  the text in the same commit when you touch that code, and pin the new text in the test that pinned the old one.
- RULE FROM THE OWNER (2026-11-05, binding; AMENDED 2026-11-07: the removals LISTED in this document are decided by the owner — decision 20261107-AL = a — and are carried out as written; every other removal still waits): the simplification never removes behaviour from the app
  on the agent's or the lead's own judgement. Code you believe is dead, duplicate or wrong is REPORTED with its evidence
  (what it does, where it came from — `git log -S'<text>' --oneline -- <file>` to find the commit and its message —
  and whether that commit records an owner decision); the owner decides. Trace the origin of any behaviour before you
  touch it; a behaviour the owner put there deliberately is kept even when a plan sentence says otherwise — report the
  conflict and stop that task.
- Stop and report (never guess) when a deletion would change user-facing output that `features/` does not cover.
  `<alert-tool> send --source pr3-simplification-review "<text>"`; answers via `<alert-tool> replies`.

- LESSONS FROM THE PHASE 5 RUN (apply in every task): (23) before reusing a helper the plan names (e.g. a lock path),
  read its current callers — the plan named the run lock for the sync lock, which would have self-deadlocked. (24)
  `git ls-remote --exit-code` exits 2 for an absent ref and 128 for an unreachable or missing remote. (25) A behaviour
  change the plan did not call for is reported as a candidate in the final report, NOT implemented (Phase 5: refusing
  every write in a repository without an origin was reverted by the lead). (26) In the user's repository HEAD may be
  the user's own commit: amend only the command's own commit. (27) Never rewrite a test's expectation to match a
  behaviour the plan did not call for. (28) A mandated skill counts as used only when loaded with the Skill tool.

## Global constraints

- Behaviour of `backlog team …` does not change: every team test and every team BDD scenario keeps its expectation, run
  through `backlog team …`. A test that drove a team step through user-command `update` / `new` / `query` is rewritten to the
  `backlog team` spelling (the same arguments the `moved:` notice printed); its expectation stays.
- User behaviour changes only as listed in Goal 3 and 4. Everything else about user commands is byte-identical.
- Move files with `git mv` (history), keep the code unchanged in the move task, change behaviour in later tasks, and keep each commit green.
- The status vocabulary (what `open`, `finished`, `new`, `done`… mean, and the order of statuses) is user behaviour: it
  stays outside `src/team/`, in `src/shared/status.js`. The stage rules are team: `src/team/workflow.js`.
- The environment variables `TEAM_NAME`, `TEAM_REPOSITORY`, `TEAM_BRANCH`, `TEAM_LEAD` and `BACKLOG_AGENT` are read ONLY inside
  `src/team/` and only by the `backlog team` commands. When a user code path used one to scope or order items
  (`store.js` queue order for a bound session, `archive.js` / `move.js` refusals of foreign repository or branch), that
  behaviour moves into the team command that needs it (it receives the scope as an argument) or is deleted if no
  `backlog team` command uses it — report which.
- No new dependency. The public-repository rule holds (no private names in code, tests, docs, commit messages).

## Review focus

1. After the phase `grep -rn "TEAM_\|BACKLOG_AGENT\|TEAM_LEAD" src | grep -v "^src/team/"` prints only `src/help.js` lines that Task 6 will rewrite. Nothing else.
2. `grep -rn "from '\./team\|from '\.\./team\|src/team" src | grep -v "^src/team/"` prints exactly the router line (and `main.js` if it imports the group).
3. The user-command `update` of a team item is refused with the line of Goal 3 and writes nothing (file bytes and git log unchanged).
4. `backlog team update …` on the same item still works.
5. A queue order of a user backlog is identical before and after (the `store.js` change).

---

### Task 1: inventory (no code change)

- [ ] Index with codebase-memory (see Handoff context). Write `docs/` is forbidden in the public repo for this: write the inventory to
      `<logs>/phase-7c-1-inventory.md` (outside the repo). For every exported function and constant
      of `team.js`, `workflow.js`, `lifecycle.js`, `wip.js`, `pop.js`, `views.js`, `handoff*.js`: one row: name | callers
      outside `src/shared/team*` (from `trace_path` AND `git grep`) | class: STATUS (user commands), TEAM, or SHARED-GENERIC (used by user commands and
      team, not about teams: for example `asList`, `strip`) | destination (`src/shared/status.js`, `src/team/…`, stays).
      For every line of the leak list in "What exists today", one row: file:line | what it does for a user command | action
      (delete / move to team / replace by the Goal 3 refusal).
- [ ] If any row is unclassifiable (the code does something that is both user-command and team and cannot be split without choosing a
      behaviour), do NOT guess: list it under "NEEDS OWNER", finish the other rows, and stop after Task 1 with a report.

### Task 2: the move (no behaviour change)

- [ ] `git mv` the TEAM files into `src/team/` (names without the `team-` prefix where it repeats: `team-cli.js` → `src/team/cli.js`,
      `team-pop.js` → `src/team/pop.js` — rename the existing `pop.js` to `src/team/queue.js` only if the names clash; say what you
      chose). Split `workflow.js`: `src/shared/status.js` (the STATUS rows of the inventory) and `src/team/workflow.js` (the stage
      rules). Split `lifecycle.js` by the inventory: what only a team step needs → `src/team/lifecycle.js`; what user-command `update`
      needs stays in `src/shared/lifecycle.js`. Fix every import, including `.agents/test/*.js` and `features/` step files.
      The workflow definition file name used by `loadWorkflow` is unchanged. `router.js` maps `team` to `./team/cli.js`.
- [ ] Full suite, BDD both locations, `npm run check`, guard: all green with unchanged expectations. Commit
      `bash <logs>/commit.sh "Team code moves into its own folder"`.

### Task 3: user-command `update`, `new`, `query` lose team behaviour

For each change, FIRST write the test that fails (engage), then the change, then confirm the old behaviour is gone (bite):
- [ ] `update`: remove `TEAM_VALUE` / `TEAM_BOOL` and the `moved:` notice. User-command `update --claim A` is the ordinary unknown-option
      error. `backlog team update` keeps all team flags (it parses them itself in `src/team/`; share the field-flag parser by
      importing it from `update.js`, not the other way round). A user-command `update` of an item with a `team` value → the Goal 3 line.
- [ ] `new`: remove the team options and every team branch (`intoRefining`, split of a team item, review-refs, depends-on,
      estimate, complexity, layer, `chunk`). `backlog team new` is NOT in this phase (it is a new subcommand): until then the
      team lead's way of creating a team item is NOT available through the CLI — report this loudly, and keep the code that
      creates a team item as an exported function of `src/team/` that Phase 7c-2 will wire to `backlog team new`. Do not delete it.
- [ ] `query`: remove the team view flags and `--agents`; `backlog team query` keeps them (it calls the view code in `src/team/`).
      A user-command `query` row of a team item shows the ordinary columns only.
- [ ] Each of `done`, `move`, `archive` on a team item: the Goal 3 line (`done` is an alias of `update --status done`).
- [ ] Full suite etc. Commit `bash <logs>/commit.sh "User commands refuse team items and take no team options"`.

### Task 4: the environment

- [ ] Remove every read of `TEAM_NAME`, `TEAM_REPOSITORY`, `TEAM_BRANCH`, `TEAM_LEAD`, `BACKLOG_AGENT` from files outside `src/team/` (inventory rows).
      Test: a user command run with these variables set behaves exactly as without them (one test per command family:
      `new`, `update`, `query`, `archive`, `move`, queue order). Commit `bash <logs>/commit.sh "User commands ignore the team environment"`.

### Task 5: the guard test

- [ ] `.agents/test/team-boundary.test.js`: (a) every `.js` file under `src` outside `src/team/`, `src/help.js` excluded for now, contains none of the five
      variable names; (b) none imports a path containing `/team/` except `src/shared/router.js` (the router line); (c) `src/team/` imports from
      outside only `src/shared/*` modules that the test lists by name (the shared helpers) — fails with a message naming file and line. Prove it
      bites: add a forbidden `process.env.TEAM_NAME` to a scratch copy of `new.js`, run the test, see it fail, remove it. Commit
      `bash <logs>/commit.sh "A test keeps team code out of the user commands"`.

### Task 6: help text and records

- [ ] `src/help.js`: every sentence about a team session, `TEAM_*`, `BACKLOG_AGENT`, team flags of `update` / `new` / `query` moves to the help
      of `backlog team` and its subcommands (create the help blocks `team`, `team pop`, `team update`, `team query`, `team define`,
      `team workflow` if absent, each with its own flags and exit codes). The user command help names none of them. `backlog update --help`
      ends with one line: `Team items: backlog team update --help.` Test: `shared-help` pins it. Then rerun the guard test with `src/help.js` included.
- [ ] REVIEW-LOG.md rows; commit. Report to the lead: commits, the inventory path, test counts as printed, every user behaviour you
      saw change that this document did not predict, every NEEDS OWNER row, and the exact set of spellings the team skills of the topology
      repository must change to (list: old spelling → `backlog team …` spelling) — do not edit the topology repository.
