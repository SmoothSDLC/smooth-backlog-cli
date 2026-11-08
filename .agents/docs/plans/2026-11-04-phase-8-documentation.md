# Phase 8 — Every document describes the one CLI; the review records are complete

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** Phases 1-7b are committed (`git log --oneline` shows "Help and docs: the section editor, import, archive done, upgrade").
> Decisions recorded by the lead on 2026-11-04: `.agents/docs` IS removed except `.agents/docs/plans/` (Task 3 runs; amended by the owner on 2026-11-08: the plans stay, AGENTS.md says where plans live); `backlog setup` output HIDES
> the folder path (Task 3b runs). The gate files `decisions/D3.txt` = `yes` and `decisions/D4.txt` = `hide` exist.

**Goal:** README.md, COMMANDS.md, `backlog --help` and every `<command> --help`, the built-in skill (SKILL.md, its
references, its evals and trigger queries), CHANGELOG.md agree with the code and describe one backlog, one CLI,
one storage setting; REVIEW.md carries the "after" results; REVIEW-LOG.md is complete; `.agents/docs` is removed
except `.agents/docs/plans/` (owner, 2026-11-08).

**Architecture:** `src/help.js` is the single source of command help (`HELP.<command>`, `USAGE` for `backlog --help`);
`.agents/scripts/sync-commands-md.mjs` writes the help blocks into COMMANDS.md under `### backlog <command>`
headings; `templates/skills/backlog/references/commands.md` is a copy of COMMANDS.md;
`templates/skills/backlog/SKILL.md` is deployed by `backlog setup` into `.agents/.claude/.github/.qwen` skill folders;
`templates/skills/backlog/scripts/eval_queries.json` (trigger queries) and `evals/evals.json` (worked examples) are
checked by `.agents/test/skill-commands.test.js` for shape only — their content must be checked by reading.
`.agents/test/shared-help.test.js` pins that help, COMMANDS.md and `--help` match verbatim.

**Tech stack:** Node 24 (`node`), ESM, `node:test`, git. No new dependency.

**Spec:** `REVIEW.md` 2.7 and section 3; [2026-11-04-simplification-plan.md](2026-11-04-simplification-plan.md) Task 7; [the recommendations](completed/2026-11-04-recommendations.md) (R5, R6).
The README and COMMANDS.md must also carry the two new sections Phases 5 and 6 introduced: "Data integrity" (pull
before every command, push after every change, the retry, the stale rejection with the item's diff — in both
storage locations), "Where the data lives" (the item files are the only data; what to do when one cannot be read)
and "Command aliases" (every 1.x command name and what it runs).

## Handoff context (read fully before the first command)

- Work ON the the development machine machine in the git worktree `<worktree>`, branch `simplify/pr3-review`.
  Never touch `<main-clone>`. Never create another branch, never push, never open a PR.
- Node is `node` (v24). `npm test` = `node --test .agents/test/*.test.js`; `npm run check`.
- Full suite: `bash <logs>/run-tests.sh <label> node` →
  `<logs>/<label>.log` (~2.5 min; detached with `setsid nohup ... >/dev/null 2>&1 &`
  if your shell has a time limit; poll `grep -E "^ℹ (tests|pass|fail|skipped)|^exit=" <log>`).
- One file: `node --test --test-reporter=tap .agents/test/<file> 2>&1 | grep -E "^(not ok|# pass|# fail)"`.
- BDD: `FEATURE_LOCATION=local node --test .agents/test/features.test.js`, then `remote`.
- Private guard before every commit:
  `BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js` → `pass 3`.
- Commit: `bash <logs>/commit.sh "<message>"` (author `<author>`,
  no trailers). The message says what changed for a user; never a machine, path, agent, model, item number or owner
  decision.
- PUBLIC REPOSITORY RULE (this phase is mostly prose, so it matters most here): nothing you write into the
  repository names a private repository, host, machine, path, port, internal agent or team name, model name,
  backlog item number, job number or owner decision. Agent-product names (`Claude Code`, `Codex`, `GitHub Copilot`,
  `Qwen Code`) are allowed ONLY as the names of the agent folders `setup` deploys into. Example agent names in help
  and docs are neutral (`ada`, `ann`, `bob`, `lead`).
- Skills to load at the start: `superpowers:executing-plans`, `superpowers:verification-before-completion`,
  `ponytail:ponytail`; `ponytail:ponytail-review` before each commit (it reviews prose for accuracy against the
  code too); `superpowers:systematic-debugging` at the first unexpected failure. Each use = a row in `REVIEW-LOG.md`.
- Behaviours: every statement in a document is checked against the code or a command you ran in the worktree
  (`node bin/backlog.js <command> --help` inside a scratch git repository with
  `BACKLOG_ORIGIN_URL= BACKLOG_HOME= XDG_CONFIG_HOME=$(mktemp -d)`); a statement you cannot verify is removed, not
  kept; shorter beats longer; never describe a feature the code does not have; never invent a command.
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
- RULE FROM THE OWNER (2026-11-05, binding in every task): the simplification never removes behaviour from the app
  on the agent's or the lead's own judgement. Code you believe is dead, duplicate or wrong is REPORTED with its evidence
  (what it does, where it came from — `git log -S'<text>' --oneline -- <file>` to find the commit and its message —
  and whether that commit records an owner decision); the owner decides. Trace the origin of any behaviour before you
  touch it; a behaviour the owner put there deliberately is kept even when a plan sentence says otherwise — report the
  conflict and stop that task.
- Stop and report (never guess) if a document and the code disagree in a way that needs a behaviour change (that is
  a code task for another phase, not a prose fix). `<alert-tool> send --source pr3-simplification-review "<text>"`.

- LESSONS FROM THE PHASE 5 RUN (apply in every task): (23) before reusing a helper the plan names (e.g. a lock path),
  read its current callers — the plan named the run lock for the sync lock, which would have self-deadlocked. (24)
  `git ls-remote --exit-code` exits 2 for an absent ref and 128 for an unreachable or missing remote. (25) A behaviour
  change the plan did not call for is reported as a candidate in the final report, NOT implemented (Phase 5: refusing
  every write in a repository without an origin was reverted by the lead). (26) In the user's repository HEAD may be
  the user's own commit: amend only the command's own commit. (27) Never rewrite a test's expectation to match a
  behaviour the plan did not call for. (28) A mandated skill counts as used only when loaded with the Skill tool.
## Global constraints

- `git grep -n -i -E "shared mode|local mode|--use-backlog-repo|--use-local-repo|mode\.json|backlog init\b|init backup|init clean|--description|--ac\b|\{\"ok\"" -- README.md COMMANDS.md CHANGELOG.md templates src`
  must print only the negative assertions in tests (if any) and the CHANGELOG lines that say these were removed.
- `shared-help.test.js`, `skill-commands.test.js`, `shared-no-classes.test.js`, `no-private-details.test.js` green
  after every task.
- REVIEW.md, [2026-11-04-simplification-plan.md](2026-11-04-simplification-plan.md) and REVIEW-LOG.md are on the branch and public: same rule.

## Review focus

1. The skill's worked examples (`evals/evals.json`) still mention `init backup`/`init clean` — a user following them
   would run commands that do not exist. Task 2 rewrites them to `setup`.
2. README "Get started" block must run as written in an empty repository with an origin: Task 1 step 2 runs it.
3. `backlog --help` (USAGE) and the README command table must list the same commands with the same one-line purposes.
4. CHANGELOG "Unreleased (2.0.0)" must list every removal of the branch (commands, options, mode switches, the
   database if Phases 2-4 ran) — a reader upgrading from 1.0.1 must not be surprised.
5. If `.agents/docs` is removed except its plans (D3 as amended 2026-11-08), nothing else must reference the removed parts:
   `git grep -n "\.agents/docs" -- . ':!REVIEW*' ':!.agents/docs/plans' ':!AGENTS.md'` shows only references to `.agents/docs/plans/`.

---

### Task 1: README.md and COMMANDS.md against the code

README must carry (owner 2026-11-05) a section "Commands for people, commands for teams": the user command set, the `backlog team` set, that only the team set knows teams, what a team's configuration entry controls and where it lives, the status order and the free-text rule outside teams, the two verdicts, the item template (`backlog fields`). Phase 6c writes a first version; this task verifies every sentence against the code.

- [ ] **Step 1: read** README.md and COMMANDS.md top to bottom (COMMANDS.md top sections only; the command blocks are
      generated). For every command, option, environment variable, file name and exit code named, verify it in
      `src/help.js`/`src/shared/*.js` (`git grep -n "<thing>" src`). Make a list of mismatches first (in your scratch,
      not in the repo), then fix them in one pass.
- [ ] **Step 2: run the README "Get started" block** in a scratch repository (`git init -q -b main t && cd t && git commit -q --allow-empty -m x && git init -q --bare ../o.git && git remote add origin ../o.git && git push -q -u origin main`,
      then each line with `BACKLOG_ORIGIN_URL= BACKLOG_HOME= XDG_CONFIG_HOME=$(mktemp -d) node <worktree>/bin/backlog.js ...`).
      Every line exits 0 (or 1/3 where the README says it refuses). Fix the README where it does not.
- [ ] **Step 3: `backlog --help` vs README table** — same commands, same order as the USAGE text; fix the README.
- [ ] **Step 4: COMMANDS.md top sections** ("Where the items live", "Who and which team", "Output and exit codes")
      against `src/help.js` USAGE and `store.resolveHome`/`sync.commitInRepository`: same facts, shorter words.
      Regenerate the blocks (`node .agents/scripts/sync-commands-md.mjs`), copy to
      `templates/skills/backlog/references/commands.md`.
- [ ] **Step 5: tests green (`shared-help`, `skill-commands`, `shared-no-classes`, guard); ponytail-review; commit**
      `bash <logs>/commit.sh "README and COMMANDS.md say exactly what the CLI does"`

### Task 2: the built-in skill

**Files:** `templates/skills/backlog/SKILL.md`, `templates/skills/backlog/evals/evals.json`,
`templates/skills/backlog/scripts/eval_queries.json`, `templates/skills/backlog/scripts/install-backlog-cli.sh`.

- [ ] **Step 1:** `grep -n -i "init\|--description\|--ac\b\|set \|add \|priority \|import\|branch \|update auto\|python\|\.py" templates/skills/backlog/evals/evals.json templates/skills/backlog/scripts/eval_queries.json`
      → rewrite every hit to the one command set (`setup`, `new --name/--objective/--summary`, `update <item> --status|--priority|--append|--note`,
      `query`, `next`, `archive`, `move`). `evals.json` keeps its shape (`evals[]` with `prompt`, `expected_output`,
      `assertions`); `eval_queries.json` keeps ≥ 10 `should_trigger: true` and ≥ 8 `false`, unique queries
      (`skill-commands.test.js` checks this).
- [ ] **Step 2:** SKILL.md: every command it teaches exists (`git grep -n "backlog [a-z]" templates/skills/backlog/SKILL.md`
      → each verb is in `router.TABLE` or `setup`); every `update` team flag of `TEAM_VALUE`/`TEAM_BOOL`
      (`src/shared/update.js`) is mentioned (the test pins it); the description block is unchanged (pinned).
      `install-backlog-cli.sh`: read it; it must install the package and run `backlog setup` (no `init`).
- [ ] **Step 3: `skill-commands.test.js` green; `backlog setup` in the scratch repository with an `.agents` folder
      deploys the skill (`ls .agents/skills/backlog`); ponytail-review; commit**
      `bash <logs>/commit.sh "The built-in skill teaches the one command set"`

### Task 3 (decision taken: remove, amended 2026-11-08: the plans stay): remove the internal process records from the public repository

- [ ] `git grep -n "\.agents/docs" -- . ':!REVIEW.md' ':!.agents/docs/plans' ':!REVIEW-LOG.md'` → fix every
      reference that does not point into `.agents/docs/plans/` (README, tests, scripts) so nothing points there; if `.agents/test/release*.test.js` or
      `.agents/scripts/*` read a file under `.agents/docs` (for example `release-contract.md`), STOP and report which —
      that file may have to stay.
- [ ] Remove everything under `.agents/docs` except `.agents/docs/plans/`: `git ls-files .agents/docs | grep -v '^\.agents/docs/plans/' | xargs git rm -q`
      (keep also the files the report above kept); `.agents/docs/plans/` and AGENTS.md's Plans section stay; full suite, guard → green.
- [ ] REVIEW.md 2.4: one line "the internal process records were removed from the public repository; the plans stay in `.agents/docs/plans/`".
- [ ] `bash <logs>/commit.sh "Remove internal process records from the public repository

The analysis notes, hand-off notes and specs under .agents/docs were working papers of the branch, not
documentation of the CLI; README.md, COMMANDS.md and the skill are the documentation. The plans stay in
.agents/docs/plans/."`
      If D3 is `no`: write one line in REVIEW.md section 4 "`.agents/docs` kept (owner's decision)"; no commit of its own.

### Task 3b (decision taken: hide): `backlog setup` output without the folder path

- [ ] Test first: in `.agents/test/shared-setup.test.js` add to the first setup test
      `assert.ok(!r.stdout.includes(home), 'setup names no folder path')` where `home` is the clone path the fixture
      knows; RED. Then in `src/shared/setup.js` replace the three `say(` texts that interpolate `${home}` with
      `✅ backlog repository cloned`, `✅ backlog folder created`, `ℹ️  backlog folder kept`; GREEN; `shared-setup.test.js`
      and the BDD both green; commit `bash <logs>/commit.sh "setup reports what it did without naming the folder"`.
      If D4 is `keep` or absent: nothing to do; one line in REVIEW.md section 4.

### Task 4: CHANGELOG, REVIEW.md "after", REVIEW-LOG

- [ ] CHANGELOG.md "Unreleased (2.0.0)": compare with `git log --oneline fe40b5a..HEAD` and make sure every removal
      and every user-visible change of the branch has a bullet (duplicates removed in Phase 1; history in the items
      and the cache if Phases 2-4 ran; the commit-and-push rule; the one command set; teams as configuration). Keep
      it a changelog: what a user sees, not how.
- [ ] REVIEW.md section 3: add the table "After" with the final BDD counts (run both locations and read the numbers
      from the log), the suite counts, `npm run check`, the private guard, and `git diff --shortstat fe40b5a HEAD`
      and `-- src bin`. Section 4: every item marked done / recommended / kept with the decision.
- [ ] [2026-11-04-simplification-plan.md](2026-11-04-simplification-plan.md): each task marked done with its commit; the "Order" line final.
- [ ] REVIEW-LOG.md: rows for this phase; check the table has one row per mandated skill at least once:
      `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`,
      `verification-before-completion`, `requesting-code-review`, `receiving-code-review`, `ponytail-audit`,
      `ponytail-review`, `ponytail`, `index_repository`, `search_graph`/`trace_path` (the last two rows come in
      Phase 6: leave a note "Phase 6" where a row is still missing).
- [ ] Full suite, BDD both, check, guard → green; `git status --short` empty;
      `bash <logs>/commit.sh "Changelog, review results and review log brought up to date"`.
- [ ] Report: `<alert-tool> send --source pr3-simplification-review "Phase 5 done at <commit>: docs verified against the code (<n> fixes), skill evals on the one command set, .agents/docs <removed|kept>, CHANGELOG complete, REVIEW.md after-table written. Tests <n>/<n>, BDD 100/100."`
