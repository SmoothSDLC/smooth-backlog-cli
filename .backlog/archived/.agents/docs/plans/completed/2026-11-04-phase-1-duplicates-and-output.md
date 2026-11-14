# Phase 1 — Exact duplicates out, no folder path in output, wording-pinning test out

> **STATUS: EXECUTED** on 2026-11-04 — commits `631538b`, `425b435`, `10bcb47`, `c268ae8` (+ `9af4dd5` review record) on
> `simplify/pr3-review`; suite 883/883, BDD 100/100, check and guard green. Kept for the record; the defects the run
> found in this document are folded into the "LESSONS FROM THE PHASE 1 RUN" block of every phase document. Do not run again.

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.

**Goal:** `backlog pop` is the one agent-pop command (the `query --pop`, `next --agent`, `--headless` and
`BACKLOG_HEADLESS` duplicates and dead options are gone); no success or info output names a backlog folder path;
the repository-wide class-word allow-list test is gone.

**Architecture:** `src/shared/query.js` parses `backlog query`/`next` flags and routes `--pop`/`--plan`/`--next --agent`
into `src/shared/pop.js`; `src/help.js` holds the help text of every command (`HELP.<command>`), and
`.agents/scripts/sync-commands-md.mjs` copies those texts into COMMANDS.md, which is copied into
`templates/skills/backlog/references/commands.md`. Tests are Node's test runner under `.agents/test/`; BDD scenarios
in `features/*.feature` run through `.agents/test/features.test.js` in both storage locations.

**Tech stack:** Node 24 (`node`), ESM, `node:test`, git. No new dependency.

**Spec:** `REVIEW.md` sections 2.2 and 2.9 and [2026-11-04-simplification-plan.md](../2026-11-04-simplification-plan.md) in the worktree; this document's
recommendations R1, R2, R4 in [the recommendations](2026-11-04-recommendations.md).

## Handoff context (read fully before the first command)

- Work ON the the development machine machine in the git worktree `<worktree>`, branch `simplify/pr3-review`
  (HEAD `2fd37fb` or later). Never touch `<main-clone>` (other agents' uncommitted work).
  Never create another branch, never push in this phase, never open a PR.
- Node is `node` (v24). `npm test` = `node --test .agents/test/*.test.js`; `npm run check`.
- Full suite: `bash <logs>/run-tests.sh <label> node` writes
  `<logs>/<label>.log` (takes ~2.5 min). If your shell has a time limit, start it with
  `setsid nohup bash <logs>/run-tests.sh <label> node >/dev/null 2>&1 &`
  and poll `grep -E "^ℹ (tests|pass|fail|skipped)|^exit=" <logs>/<label>.log`.
  Green means `fail 0`, `skipped 0`, `exit=0`. Failures: `grep "^✖" <log>`.
- One file: `node --test --test-reporter=tap .agents/test/<file> 2>&1 | grep -E "^(not ok|# pass|# fail)"`;
  the reason of a failure: `... 2>&1 | grep -E "^\s+error" -A6`.
- BDD only: `FEATURE_LOCATION=local node --test .agents/test/features.test.js` and the same with
  `remote`; both must pass (50 each).
- Private guard, before every commit:
  `BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js`
  → `pass 3`.
- Commit with `bash <logs>/commit.sh "<message>"` (author `<author>`, no trailers, stages everything). The message says what changed for a user; it
  never names a machine, a path, an agent, a model, a backlog item number or an owner decision.
- PUBLIC REPOSITORY RULE: code, tests, docs and commit messages name no private repository, host, machine, local
  path, port, internal agent or team name, model name, backlog item number or owner decision. This document is
  private: copy code from it, never its prose.
- codebase-memory: before Task 1 run
  `codebase-memory-mcp cli --quiet index_repository '{"repo_path":"<worktree>"}'`; for every
  claim "nothing else calls X" run
  `codebase-memory-mcp cli --quiet trace_path '{"project":"<project>","function_name":"<X>","direction":"inbound"}'`
  and cite the query in the REVIEW-LOG.md row. (If the MCP tools `index_repository`/`trace_path` are available in
  your session, use them with the same arguments.)
- Skills to load with the Skill tool at the start of the session: `superpowers:executing-plans`,
  `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail:ponytail`; load
  `ponytail:ponytail-review` before each commit and `superpowers:systematic-debugging` at the first unexpected
  failure. Every use gets a row in `REVIEW-LOG.md` (`| # | skill/tool | step | produced |`, continue the numbering).
- Behaviours in every task: write the failing test first and watch it fail for the expected reason; the smallest
  change that makes it pass; grep every caller before deleting or renaming; tests assert behaviour through the CLI
  (exit code, output, `--json` fields), never a file layout or internal wording; keep the structure the code has.
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
- Stop and report (do not guess) when a change would alter user-facing behaviour that no scenario in `features/`
  and no row in this document covers. Report with
  `<alert-tool> send --source pr3-simplification-review "<text>"`; read answers with
  `<alert-tool> replies`.

## Global constraints

- One backlog, one CLI: a change must behave the same in both storage locations (the BDD run proves it).
- Removing a user-facing option is allowed in this phase only for the four named duplicates/dead options.
- Diff direction: this phase removes more lines than it adds.
- No new dependency, no new test framework, no new file under `src/` unless a task says so.

## Review focus

1. `backlog query --plan ...` (the lead's plan view) must keep working after `--pop` goes: it routes through
   pop.js too. Pinned by Task 1 step 1 (test `query --plan` still answers).
2. `backlog pop --agent <a>` must be untouched: same exit codes 0/1/2/3, same output. Pinned by the existing
   `.agents/test/shared-team-pop.test.js` after its `query --pop` calls are rewritten to `pop`.
3. The `--help` of `query` and `pop` must stop mentioning `--pop`, `--headless` and `BACKLOG_HEADLESS`, and
   COMMANDS.md and the skill copy must match verbatim (pinned by `shared-help.test.js`).
4. A repository with no items yet: `pop`/`query` must still say "no backlog yet" without a path. Pinned by Task 2.
5. The class-word behaviour test (`shared-no-classes.test.js`) stays and passes after the allow-list test is deleted.

---

### Task 1: remove `query --pop`, `query --next --agent`, `--headless`, `BACKLOG_HEADLESS`

**Files:**
- Modify: `src/shared/query.js` (BOOL at :20, routing at :149-153, :224), `src/shared/pop.js` (:1, :21, :327-334),
  `src/help.js` (query help :360-520, pop help :540-560 — every mention of `--pop`, `--headless`, `BACKLOG_HEADLESS`,
  "next --agent")
- Modify tests: `.agents/test/shared-help.test.js` (REFUSED.query → `[]`; add the negative assertion),
  `.agents/test/shared-query.test.js`, `shared-team-pop.test.js`, `shared-team-scope.test.js`,
  `shared-team-teams.test.js`, `shared-audit.test.js`, `shared-team-compat.test.js`, `shared-team-stages.test.js`
  (every `query --pop ...` becomes `pop ...`; every `next --agent` becomes `pop --agent`; `--headless` cases become
  "unknown flag" cases)
- Regenerate: `COMMANDS.md` (`node .agents/scripts/sync-commands-md.mjs`), then
  `cp COMMANDS.md templates/skills/backlog/references/commands.md`; check `templates/skills/backlog/SKILL.md` with
  `grep -n -- "--pop\|--headless\|next --agent" templates/skills/backlog/SKILL.md` (must be empty)

**Interfaces:**
- Consumes: `parse(argv)` of query.js and pop.js (hand-written flag parsers; BOOL/VALUE arrays name the accepted flags;
  an unknown flag throws `unrecognized arguments: <flag>` → exit 2).
- Produces: `backlog query --pop` → exit 2 `❌ backlog: unrecognized arguments: --pop`; `backlog query --next --agent x`
  → exit 2 `unrecognized arguments: --agent` is NOT acceptable if `--agent` is still a `query` flag for the team
  views (`--claimable --agent`): then `next --agent` must simply be the user-command `next` (ignore nothing: `--agent` with
  `--next` is refused with `❌ backlog: --agent goes with --claimable, --reviewable, --blocked or --plan`). Check which
  flags still take `--agent` in query.js before deciding; write the refusal text once in query.js.

- [ ] **Step 1: write the failing tests**

In `.agents/test/shared-help.test.js` change `REFUSED` to `{ update: [], query: [], new: [], move: [], archive: [], pop: [] }`
and add:

```js
test('query and pop help: one pop command, no headless option', () => {
  for (const command of ['query', 'next', 'pop']) assert.doesNotMatch(HELP[command], /--pop\b|--headless|BACKLOG_HEADLESS|next --agent/, command);
});
```

In `.agents/test/shared-query.test.js` add (use the file's existing `fx()` fixture (the file's shared, cached fixture — confirm with `grep -n "^const fx\|^function fx\|^function build" .agents/test/shared-query.test.js`) and `cli` helper):

```js
test('query --pop and --headless are not options; query --plan still answers', () => {
  const f = fx(); // the file's shared fixture; if it is cached across tests, use build(true) for a fresh one
  for (const args of [['query', '--pop', '--agent', 'x'], ['query', '--headless'], ['pop', '--headless', '--agent', 'x']]) {
    const r = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /unrecognized arguments: --(pop|headless)/);
  }
  const plan = cli(['query', '--plan', '--json'], { cwd: f.cons, tmp: f.t, env: { TEAM_NAME: '', BACKLOG_AGENT: 'lead' } });
  assert.ok([0, 3].includes(plan.status), plan.stdout + plan.stderr); // the plan view answers or is idle, it is not an unknown flag
});
```

- [ ] **Step 2: run them, expect RED**

`node --test --test-reporter=tap .agents/test/shared-help.test.js .agents/test/shared-query.test.js 2>&1 | grep -E "^(not ok|# pass|# fail)"`
Expected: the two new tests `not ok` (the help still mentions `--pop`; `query --pop --agent x` exits 0/3 today).

- [ ] **Step 3: implement in query.js and pop.js**

query.js: remove `'pop'` and `'headless'` from `BOOL`; delete the lines `if (a.next && a.agent) a.pop = true;`,
`if (a.pop && !a.agent) ...`, `if (a.headless) ...`; change `if (a.pop || a.plan) return (await import('./pop.js')).run(argv);`
to `if (a.plan) return ...`; delete the `BACKLOG_HEADLESS` line (:224). pop.js: remove `'headless'` from its BOOL,
delete the two `die` lines about `--headless` and `--critical cannot be combined with --pop`; rewrite the comment at
:1 and :327 ("argv is that of `backlog pop` or of `backlog query --plan`"). If `--agent` was a `query` flag only
for `--pop`/`--next`, remove it from query's VALUE flags too; if the team views still use it, keep it and refuse
`--next --agent` with one `die` (see Interfaces).

- [ ] **Step 4: run the two files, expect GREEN; then the whole suite to find every test that used the duplicates**

Start the full suite (see Handoff context). Expected failures: the tests listed under Files. For each, rewrite
`['query', '--pop', ...]` → `['pop', ...]` and `['next', '--agent', x]` → `['pop', '--agent', x]`; a test that asserted
the `--headless` refusal now asserts `unrecognized arguments: --headless`. Do not weaken any other assertion.

- [ ] **Step 5: help texts and COMMANDS.md**

Edit `src/help.js`: in `HELP.query` remove the `--pop` usage line, the `--pop` and `--headless` option blocks, the
sentence "The option --headless is refused ...", and rewrite every "With --pop ..." sentence so it speaks of `--plan`
only or is deleted; in the exit-code paragraph replace "With --pop, and with --next and --agent, the exit codes are
those of backlog pop" with nothing (the paragraph then describes query/next only). In `HELP.pop` delete the sentence
naming `backlog next --agent <name> and backlog query --pop`. Then:
`node .agents/scripts/sync-commands-md.mjs && cp COMMANDS.md templates/skills/backlog/references/commands.md`.
Run `shared-help.test.js` and `skill-commands.test.js` → all pass.

- [ ] **Step 6: full suite + BDD both locations + check + private guard → all green**

- [ ] **Step 7: ponytail-review of `git diff`, fix what it finds, then commit**

`bash <logs>/commit.sh "One agent-pop command: backlog pop

backlog query --pop and backlog next --agent were backlog pop under other names, and --headless with
BACKLOG_HEADLESS=1 were refused options; all four are gone from the commands, the help, COMMANDS.md and the skill.
backlog query --plan is unchanged."`

### Task 2: no folder path in success or info output

**Files:**
- Modify: `src/shared/pop.js:343` and `src/shared/query.js:172-176` (the ``no folder ${folder}`` messages); any other
  `say(` whose text interpolates `${folder}` or `${home}` — list them with
  `git grep -n 'say(.*\${\(folder\|home\|top\)}' src/shared` (a `die(` naming the path on a failure is allowed and stays).
- Modify: `features/storage.feature` scenario "the output never names the item files or their folder";
  `features/steps/cli.js` (new step); `features/support/world.js` already has `home()`.

**Interfaces:**
- Produces: the message `ℹ️  <repository id> has no backlog yet` (and `{}` with `--json`), exit 0, in both commands.

- [ ] **Step 1: write the failing scenario**

Add to the scenario in `features/storage.feature`, before its first `Given`: nothing; change the scenario to:

```gherkin
  Scenario: the output never names the item files or their folder
    When I run `backlog query`
    Then the command succeeds
    And the output does not contain the backlog folder path
    When I run `backlog pop --agent ada`
    Then the output does not contain the backlog folder path
    Given an item "Hidden file" exists
    When I run `backlog query`
    Then the command succeeds
    And the output does not contain "phases/"
    And the output does not contain ".md"
    And the output does not contain the backlog folder path
    When I run `backlog next`
    Then the command succeeds
    And the output does not contain "phases/"
    And the output does not contain ".md"
```

Add the step to `features/steps/cli.js`:

```js
step(/^the output does not contain the backlog folder path$/, w => assert.ok(!output(w.last).includes(w.home()), `the backlog folder path is in the output:\n${output(w.last)}`));
```

- [ ] **Step 2: run `FEATURE_LOCATION=local ... features.test.js` and `remote` → the scenario is RED in both**
      (the empty-backlog `query`/`pop` print the folder).

- [ ] **Step 3: implement** — replace the two messages with `ℹ️  ${repo} has no backlog yet` (keep the `--json` → `{}`
      branch and exit code as they are). Re-run the BDD in both locations → GREEN.

- [ ] **Step 4: full suite + check + private guard → green; ponytail-review; commit**

`bash <logs>/commit.sh "An empty backlog is reported without naming its folder"`

### Task 3: delete the repository-wide class-word allow-list test

**Files:**
- Delete: `.agents/test/shared-no-classes-repo.test.js`
- Keep: `.agents/test/shared-no-classes.test.js` (the behaviour test: help, COMMANDS.md, README, templates, src)

- [ ] **Step 1: prove nothing else imports it** — `git grep -n "shared-no-classes-repo" -- . ':!REVIEW*' ':!.agents/docs/plans/2026-11-04-simplification-plan.md'`
      → only the file itself. Run `shared-no-classes.test.js` → pass 3.
- [ ] **Step 2: `git rm -q .agents/test/shared-no-classes-repo.test.js`; full suite → green (test count drops by 3).**
- [ ] **Step 3: commit** — `bash <logs>/commit.sh "Test the class-option rule through the CLI surface only

The repository-wide allow-list of every line containing the word class pinned wording, not behaviour, and broke on
unrelated edits; the behaviour test (help, COMMANDS.md, README, templates, src name no class option) stays."`

### Task 4: records

- [ ] Append rows to `REVIEW-LOG.md` (skills used, the trace_path queries, what each task produced) and in
      `REVIEW.md` section 4 mark items 2 and the folder-path note as done (one line each). In
      [2026-11-04-simplification-plan.md](../2026-11-04-simplification-plan.md) add a line under "Order": "Phase 1 (duplicates, output, allow-list test): done".
- [ ] `bash <logs>/commit.sh "REVIEW-LOG: the duplicate-removal round"`
- [ ] Final verification (load `superpowers:verification-before-completion`): full suite log shows `fail 0`,
      `skipped 0`; BDD 50/50 in both locations; `npm run check` exit 0; private guard pass 3; `git status --short`
      empty. Only then report:
      `<alert-tool> send --source pr3-simplification-review "Phase 1 done at <commit>: tests <n>/<n>, BDD 100/100, check ok, guard ok. Removed: query --pop, next --agent, --headless, BACKLOG_HEADLESS, the class allow-list test; empty-backlog output names no folder."`
