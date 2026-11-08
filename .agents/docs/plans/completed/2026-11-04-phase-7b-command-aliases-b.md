# Phase 7b — The aliases that need more than a translation: the body-section editor, import, archive done, the self-update

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** Phase 7 (part A) is committed (`git log --oneline` shows "The 1.x command names are back as aliases").

> **DECISIONS THIS PHASE DEPENDS ON (all recorded, none open):** 20261105-N = a, O = a, Q = a — closed on the recommendations under the
> owner's instruction of 2026-11-06 (the decision table of [2026-11-04-pr3-simplification-log.md](../2026-11-04-pr3-simplification-log.md)). Nothing in this phase waits for a decision; a step that seems to
> need one is executed as written and the doubt is reported at the end.

**Goal:** the remaining rows of the alias table of [2026-11-04-phase-7-command-aliases.md](2026-11-04-phase-7-command-aliases.md) (part B): the list-valued 1.x fields
(`ac tasks outcomes evidence references`, `--item-state-description`, `--work_item_id`) as `## …` sections of the item
body with `add`, `replace`, `remove`, `priority <item> <list> <n> <position>` and `set <item> <list> …` editing them;
`import --branch <source> [--higher]`; `archive done`; the CLI self-update as `backlog upgrade` with the 1.x
`update check|auto|off|disable|<version>` forms routed to it.

**Architecture:** `src/shared/update.js` parses `update` flags (`VALUE`, `BOOL`, `TEAM_VALUE`, `TEAM_BOOL`), applies
field changes to the front matter and `--append` to the body, writes the file (`store.write`), records the event,
commits (`db.commitSettled`). The body is markdown; sections are `## Heading` blocks. `src/shared/aliases.js`
(part A) translates argv; part B adds `plan(argv)` for the multi-command aliases (`import`, `archive done`) that
`main.js` runs as a sequence of router calls, stopping at the first non-zero exit. The 1.x self-update lived in
`src/updates.js` at `fe40b5a` (`git show fe40b5a:src/updates.js`: config file under `$XDG_CONFIG_HOME/smooth-backlog-cli/`,
weekly/auto checks against the npm registry, `runNpm` from the deleted `src/process.js`).

**Tech stack:** Node 24, ESM, `node:test`, git, npm (for `upgrade` only; tests stub the registry call).

**Spec:** the alias table of [2026-11-04-phase-7-command-aliases.md](2026-11-04-phase-7-command-aliases.md); the owner's decision 1.

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
- RULE FROM THE OWNER (2026-11-05, binding in every task): the simplification never removes behaviour from the app
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

- The section editor is part of `update`: `--section "<Heading>"` names a `## <Heading>` block of the body (created at
  the end of the body when absent, with the heading); exactly one of `--set-lines <text|JSON array>` (the block's
  lines become `- <entry>` per array element, or the text as given), `--add-line <entry>` (appended as `- <entry>`;
  with `--top` first), `--remove-line <n>` (the nth `- ` line, 1-based), `--move-line <n>:<position>`. The rest of the
  body is untouched byte for byte. The write goes through the same path as `--append` (stale guard, event
  `set <section>`, commit and push).
- `import --branch <source> [--higher]`: `query --branch <source> --json` lists the open items (pending, in_progress)
  of `<source>`; each is moved with `move <item> --to-branch <current>` oldest first; with `--higher`, afterwards each
  moved item gets `update <item> --priority 0`, newest first, so the imported items lead the queue in their original
  order. Each step is one published command; a failure stops the sequence and the output says which items were moved.
- `archive done`: `query --json` of the current branch; every FINISHED item (status closed or done, Phase 6b `isFinished`) is archived oldest first.
- `upgrade [check|auto|off|disable|<version>]`: `src/upgrade.js` restored from `fe40b5a:src/updates.js` with `runNpm`
  inlined (as `.agents/scripts/verify-published-package.mjs` has it), its config file unchanged in location, its
  weekly check hook re-attached in `bin/backlog.js` only if it was there at `fe40b5a` (check `git show fe40b5a:bin/backlog.js`);
  the 1.x forms `update`, `update check|auto|off|disable`, `update <semver>` route to it in `translate`: `update` with
  no argument, or whose first argument is one of those words or matches `/^v?\d+\.\d+\.\d+/`, is the self-update;
  anything else is the item command.
- No new dependency. The public-repository rule holds for the restored file (it names the public registry only).

## Review focus

1. `update 3 --status done` vs `update 3.1.0`: the second is a version, the first an item — pinned by the translate test.
2. The section editor must never touch front matter or other sections (byte-identical outside the block). Pinned by
   Task 1 step 1.
3. `import` of a branch with no open items is a no-op that says so (exit 0). Pinned by Task 2.
4. `archive done` with nothing done says so (exit 0, no commit). Pinned by Task 2.
5. `upgrade` must never run during tests against the real registry: the restored tests from `fe40b5a:.agents/test/updates.test.js`
   stub `runNpm` — read them before restoring.

---

### Task 1: the section editor in `update`, and the part-B `translate` rows

- [ ] **Step 1: failing tests.** `.agents/test/shared-update.test.js` (its fixture builds items; read `seed()`/helpers):
```js
test('update --section edits one body section and nothing else', () => {
  const f = seed(); // item 1 with a body
  const before = readFileSync(f.file(1), 'utf8');
  ok(f, ['update', '1', '--section', 'Evidence', '--add-line', 'first proof']);
  ok(f, ['update', '1', '--section', 'Evidence', '--add-line', 'zeroth proof', '--top']);
  let body = JSON.parse(ok(f, ['query', '--phase', '1', '--json']).stdout).body;
  assert.match(body, /## Evidence\n\n- zeroth proof\n- first proof/);
  ok(f, ['update', '1', '--section', 'Evidence', '--remove-line', '1']);
  ok(f, ['update', '1', '--section', 'Tasks', '--set-lines', '["a", "b"]']);
  ok(f, ['update', '1', '--section', 'Tasks', '--move-line', '2:1']);
  body = JSON.parse(ok(f, ['query', '--phase', '1', '--json']).stdout).body;
  assert.match(body, /## Evidence\n\n- first proof/); assert.match(body, /## Tasks\n\n- b\n- a/);
  assert.equal(body.split('## Evidence')[0], parse(before).body.split('## Evidence')[0], 'the text before the edited sections is byte-identical');
  assert.equal(bad(f, ['update', '1', '--section', 'Tasks']).status, 2, 'a section needs one edit option');
});
```
      and in `.agents/test/aliases.test.js`:
```js
test('the part-B aliases translate to the section editor and the self-update', () => {
  t(['add', '3', 'evidence', 'proof', '--top'], { command: 'update', argv: ['3', '--section', 'Evidence', '--add-line', 'proof', '--top'] });
  t(['replace', '3', 'tasks', '["a","b"]'], { command: 'update', argv: ['3', '--section', 'Tasks', '--set-lines', '["a","b"]'] });
  t(['remove', '3', 'references', '2'], { command: 'update', argv: ['3', '--section', 'References', '--remove-line', '2'] });
  t(['priority', '3', 'tasks', '2', '1'], { command: 'update', argv: ['3', '--section', 'Tasks', '--move-line', '2:1'] });
  t(['set', '3', 'ac', '["it works"]', '--force'], { command: 'update', argv: ['3', '--section', 'Definition of done', '--set-lines', '["it works"]'] });
  t(['new', 'X', '--ac', 'it works', '--tasks', '["t1"]'], { command: 'new', argv: ['--name', 'X', '--summary', 'X', '--body', '## Definition of done\n\n- it works\n\n## Tasks\n\n- t1\n'] });
  t(['update'], { command: 'upgrade', argv: [] });
  t(['update', 'check'], { command: 'upgrade', argv: ['check'] });
  t(['update', '1.2.3'], { command: 'upgrade', argv: ['1.2.3'] });
  assert.equal(translate(['update', '3', '--status', 'done']), null);
});
```
- [ ] **Step 2: RED → implement (`update.js`: `VALUE` += `section`, `set-lines`, `add-line`, `remove-line`, `move-line`;
      `BOOL` += `top`; a `editSection(body, heading, op)` pure function with its own small unit test) → GREEN; full suite.**
- [ ] **Step 3: commit** `bash <logs>/commit.sh "update edits one body section; the list aliases use it"`

### Task 2: `import` and `archive done`

- [ ] `features/aliases.feature` gets two scenarios (both locations): "import brings a branch's open items here"
      (Given a branch "feature" exists on the origin; an item created on `feature` — use the world's `git switch`
      through the step `I commit a change to the repository`? no: add a step ``I run `(.+)` on branch "([^"]+)"`` that
      switches, runs, switches back; then `When I run \`backlog import --branch feature --higher\``, `Then the queue is …`)
      and "archive done archives every finished item" (two items done, one open; `archive done`; `the queue is 3`).
      RED → implement `plan(argv)` in aliases.js and the sequence runner in `main.js` → GREEN. Commit
      `bash <logs>/commit.sh "import and archive done run their item commands in sequence"`.

### Task 3: `upgrade`

- [ ] Restore `src/upgrade.js` from `git show fe40b5a:src/updates.js` (inline `runNpm`; keep the config location; drop
      what referenced the 1.x manifest/config.json), register `upgrade` in `main.js` (not in the router: it needs no
      backlog), restore and adapt `fe40b5a:.agents/test/updates.test.js` as `.agents/test/upgrade.test.js` (stubbed
      registry), restore the weekly check in `bin/backlog.js` only if `fe40b5a:bin/backlog.js` had it. `upgrade --help`
      text in `src/help.js` (from the 1.x help). RED → GREEN; full suite; commit
      `bash <logs>/commit.sh "backlog upgrade: the CLI self-update, also under its first-release names"`.

### Task 4: help, docs, records

- [ ] USAGE/COMMANDS.md alias section completed with the part-B rows; `update --help` documents the section editor;
      README alias table complete; SKILL.md paragraph complete; CHANGELOG. `shared-help`, `skill-commands`, guard,
      full suite, BDD both → green. Commit `bash <logs>/commit.sh "Help and docs: the section editor, import, archive done, upgrade"`.
- [ ] REVIEW-LOG.md rows; REVIEW.md section 4 updated. Commit `bash <logs>/commit.sh "REVIEW-LOG: the alias round, part B"`.
- [ ] Report to the lead: commits, evidence, plan defects, every 1.x form that could not be mapped exactly and what it does instead.
