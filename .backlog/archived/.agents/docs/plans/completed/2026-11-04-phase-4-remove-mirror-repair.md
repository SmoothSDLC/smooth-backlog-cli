# Phase 4 — Delete what only the committed database needed

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** Phase 3 is committed (`git log --oneline -12` in the worktree shows "The database is a local cache of the
> item files"). Otherwise stop and report.

**Goal:** the code, tests and messages that existed only because `backlog.db` was committed and merged are gone:
database conflict repair and replay, the database rows' rollback, "ghost" rows, database-side renumber bookkeeping,
the event table. Behaviour of every command is unchanged; the suite is smaller and green.

**Architecture:** since Phase 3 the database is rebuilt from the item files at every `connect`, so (1) two clones
never conflict on it (`sync.repairConflicts` database branch, `renumbered.localDbs`, `renumbered.mirror`,
`db.replayLocal`, `db.reconcileFolders`' replay path, `foldIn`'s database staging); (2) a row never outlives its
file — no ghost (`query.js present/findings.ghost`, `pop.js` ghost filter, `scan`'s `file_missing` and the
`renumbered` in-place rename); (3) a failed command needs no database rollback (`db.undoOnThrow` row snapshot —
the FILE rollback it performs stays); (4) events are in the files (Phase 2): the `event` table and `logEvent`'s SQL
insert go, `logEvent` becomes "append to the item file".

**Tech stack:** Node 24 (`node`), ESM, `node:test`, `node:sqlite`, git.

**Spec:** `REVIEW.md` 2.5; [the recommendations](2026-11-04-recommendations.md) (R3). Expected removal: ~210 lines of `src/shared/`,
~900 lines of tests.

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
  before Task 1 and again after Task 2 (the deletions); before deleting any exported function run
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
- Stop and report (never guess) when a deletion would change user-facing output that `features/` does not cover.
  `<alert-tool> send --source pr3-simplification-review "<text>"`; answers via `<alert-tool> replies`.

## Global constraints

- One backlog, one CLI: identical behaviour in both storage locations (BDD proves it).
- Decided in the Phase 3 review (not open): an item file under `archive/` that cannot be parsed makes the command
  fail with the file named (the cache rebuild reads the archive, as `nextSeq` always did) — "fail explicitly instead
  of resetting data"; do not add a skip. If the failure text does not name the file and say to fix or remove it, fix
  the text (lesson 22).
- `query --json` keeps the `findings` object with keys `foreign`, `untagged` (and `bare` when present); the key
  `ghost` is removed from the object and from the human lines. (`features/` has no scenario on findings; this is the
  one output change of the phase and it is listed here.)
- Renumbering of items after a pull (`sync.renumber`/`renumberFiles`, `remapLocal`, `sameButRank` for add/add item
  files) STAYS: two clones can still create the same number; only the database parts of it go.
- No new dependency, no new file under `src/`.

## Review focus

1. A pull that hits an add/add conflict of two item files with the same number must still be repaired by
   renumbering (that is `repairConflicts` minus its database branch). Pinned by the existing renumber tests in
   `shared-sync.test.js`; run them first and keep them green.
2. A failed `update` (for example a stale-view refusal) must still put the item file back. Pinned by the existing
   `shared-stale.test.js` and `shared-update.test.js` rollback tests.
3. `query` on a folder whose file was deleted outside the CLI must simply not list that item (no ghost message, no
   crash). Pinned by Task 3 step 1.
4. `move --to-repository` after the `event` table is gone: `query --events` in the destination lists the moved
   item's history (from its file). Pinned by the Phase 2 move test; keep it green.
5. The journal recovery (`store.recoverJournal`) still runs at start-up and still restores files; nothing of it
   referenced the database after Phase 3 (check `git grep -n "backlog.db\|\.db'" src`).

---

### Task 1: the event table and `logEvent`'s SQL go

**Files:**
- Modify: `src/shared/db.js` (`SCHEMA`: delete the `event` table; `logEvent`: delete the INSERT, keep the file
  write; `ingest`: delete the `UPDATE event SET phase_id=NULL` line and the `ingested`/`reingested` `logEvent` calls;
  `scan`: delete the `file_missing` loop and the `renumbered` in-place rename loop with its `renumbered` parameter —
  then fix the callers that pass it: `git grep -n "scan(" src`). The `renumbered` history line that loop wrote must
  not be lost: in `src/shared/sync.js renumberFiles`, right after `store.write({ path: join(folder, target), ...retagged(mine, next) })`,
  add `store.addEvent(folder, target, { event: 'renumbered', branch: mine.fm.branch || '', note: `${pad(old)} -> ${pad(next)}` })`
  and assert in the existing renumber test of `shared-sync.test.js` that `query --events <new number>` lists `renumbered`), `src/shared/db.js markArchived` (keep the UPDATE,
  the `logEvent('archived', …)` now writes the file — verify `query --events <n>` still shows `archived`).
- Test: `.agents/test/shared-db.test.js` (delete tests of the event table, `file_missing`, `renumbered` rows; keep
  `ingest`/`scan` behaviour tests), `shared-query.test.js` (delete the tests that insert event rows directly).

- [ ] **Step 1: negative test** in shared-db.test.js:
```js
test('the database holds items only: no event table, logEvent writes the item file', () => {
  const con = db.connect(folder);
  try {
    assert.equal(con.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='event'").get(), undefined);
    const id = con.prepare("SELECT id FROM phase WHERE slug='001-a'").get().id;
    db.logEvent(con, 'claimed', { phaseId: id, note: 'x' });
  } finally { con.close(); }
  assert.ok(store.load(folder).find(i => i.fm.phase === '001-a').fm.events.some(l => / claimed /.test(l)));
});
```
- [ ] **Step 2: RED → implement → GREEN for the file; full suite; fix/delete tests per the Behaviours rule.**
- [ ] **Step 3: BDD both, check, guard, ponytail-review; commit**
      `bash <logs>/commit.sh "The database keeps items only; the history is in the items

The event table and the scan's bookkeeping rows are gone: every event is in its item's file since the history moved
there. Removed tests: <titles>."`

### Task 2: the conflict repair and replay of the database

**Files:**
- Modify: `src/shared/sync.js` — in `repairConflicts` delete `dbPaths`, the `if (dbPaths.includes(path)) …` line and
  the whole `for (const dbPath of dbPaths) …` block (the database conflict). KEEP the same-rank path
  (`if (same.has(path)) { checkout --ours; add; renumbered.mirror = true; continue; }`): two writers that re-ranked the
  same item file merge by taking upstream's copy, and the flag makes `commit` run `reconcile` (reflow + stale guard)
  so the merged queue is dense again — rename the flag `renumbered.mirror` → `renumbered.reranked` everywhere
  (`git grep -n "\.mirror" src`), and in `commit` keep
  `if (reconcile && (renumbered.length > settled || renumbered.reranked)) { const fresh = renumbered.slice(settled); settled = renumbered.length; renumbered.reranked = false; await reconcile(fresh); … }`
  with the `localDbs` handling removed (read the loop first; keep `foldIn` for the amend). Test first, in
  `shared-stale.test.js`: read the fixture of the deleted test "reconciliation refuses a stale cached view" with
  `git show 262d786:.agents/test/shared-stale.test.js` (it makes two clones write from the same base and forces the
  second push into the rebase path); rebuild that shape WITHOUT the database conflict — clone A publishes
  `update 1 --priority 0`, clone B, still at the base, publishes `update 2 --priority 0` (the same-rank conflict on the
  reflowed files is repaired by taking upstream's copy) — and assert that after both writes `query --json` of either
  clone shows priorities `[0, 1]` with no duplicate and that a stale cached view of clone B is still refused (exit 5).
  Update the comment block above `repairConflicts`.
  `src/shared/db.js` — delete `replayLocal`, `SCAN_EVENTS`, `NOT_REPLAYED`; `reconcileFolders(list, pairs)` becomes:
  for each folder `reflow(folder)` then `scan(connect(folder), folder, …)` as today without the `localDbs` branch;
  `commitSettled` unchanged in signature.
- Test: `.agents/test/shared-sync-db.test.js` — read every test title; keep only those that exercise behaviour the
  CLI still has (two clones creating the same number → renumbered; a renumbered item's dependents follow); delete
  the rest (database conflicts, replayed rows, `localDbs`, mirror staging). If fewer than 3 tests remain, move them
  into `shared-sync.test.js` and delete the file. `.agents/test/shared-concurrency.js`: delete if nothing imports it
  (`git grep -n "shared-concurrency" .agents`).

- [ ] **Step 1: trace** `replayLocal`, `reconcileFolders`, `commitSettled`, `repairConflicts` (trace_path + git grep); record.
- [ ] **Step 2: run `shared-sync.test.js` → green before touching anything (your safety net).**
- [ ] **Step 3: implement the deletions; `node --check` every edited file; run `shared-sync.test.js`,
      `shared-sync-db.test.js` (or its replacement), `shared-stale.test.js`, `shared-move-archive.test.js` → green;
      full suite → green.**
- [ ] **Step 4: BDD both, check, guard, ponytail-review; commit**
      `bash <logs>/commit.sh "No database to merge: the conflict repair keeps only the item renumbering

Two clones can still number an item alike and the pull still renumbers the later one and its dependents; the
replay of database rows and events, the staging of a database and the merge of two database copies are gone.
Removed tests: <titles>."`

### Task 3: ghosts and the database rollback

**Files:**
- Modify: `src/shared/query.js` (`present`, `findings.ghost`, the ghost line in `findingLines`, `present(...)` use at
  :305-306 → read the file directly), `src/shared/pop.js:55` (the ghost part of its filter), `src/shared/db.js
  undoOnThrow` (delete `rowsOf`, `tables` and the row restore; keep `beginJournal`/`journalled`/file restore/`note`
  hand-over — rename nothing), `src/shared/team.js` (`mirrorRows` — check with trace_path what reads it; keep if the
  team views use it).
- Test: `.agents/test/shared-query.test.js` (delete the three "review P2 ... ghost" tests and
  "a row path that leaves the folder"; add the test below), `shared-move-archive.test.js` ("075: archive with a
  ghost row" → delete), `shared-update.test.js`/`shared-stale.test.js` (tests that assert database rows after a
  rollback → assert the file instead, or delete if they only asserted rows).

- [ ] **Step 1: failing test** (shared-query.test.js, the file's shared fixture `fx()` or a fresh `build(true)` — confirm which exists):
```js
test('an item file deleted outside the CLI is simply absent: no ghost, no crash', () => {
  const f = fx(); // the file's shared fixture; if it is cached across tests, use build(true) for a fresh one
  rmSync(join(f.folder, 'phases', '002-beta.md'));
  const r = cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(r.stdout);
  assert.ok(!v.phases.some(p => p.slug === '002-beta'));
  assert.equal(v.findings.ghost, undefined);
  assert.doesNotMatch(cli(['query'], { cwd: f.cons, tmp: f.t }).stdout, /database row/);
});
```
- [ ] **Step 2: RED (the `ghost` key exists) → implement → GREEN; full suite → fix/delete per the rule.**
- [ ] **Step 3: BDD both, check, guard, ponytail-review; commit**
      `bash <logs>/commit.sh "A missing item file is a missing item

The item files are the only data, so no command can meet a database row without a file: the ghost findings and the
database rollback are gone; a failed command still puts its files back. Removed tests: <titles>."`

### Task 4: records and measurement

- [ ] `git diff --shortstat fe40b5a HEAD -- src bin` and `wc -l src/shared/sync.js src/shared/db.js` → into
      REVIEW.md 2.5 ("Done in Phases 2-4: … lines") and [2026-11-04-simplification-plan.md](../2026-11-04-simplification-plan.md) Task 6 (mark done).
- [ ] Help/COMMANDS.md: `grep -n -i "ghost\|database row\|mirror" src/help.js README.md templates/skills/backlog/SKILL.md`
      → remove every mention; regenerate COMMANDS.md; copy to the skill references; `shared-help.test.js` green.
- [ ] CHANGELOG.md: add to the cache bullet "… and a file deleted outside the CLI is simply an absent item."
- [ ] REVIEW-LOG.md rows (every trace_path query, every deleted test title in one row).
- [ ] Full suite, BDD both, check, guard → green; `git status --short` empty;
      `bash <logs>/commit.sh "REVIEW-LOG: the mirror-removal round"`.
- [ ] Report: `<alert-tool> send --source pr3-simplification-review "Phase 4 done at <commit>: tests <n>/<n>, BDD 100/100, check ok, guard ok. src/bin vs tip: <shortstat>. Removed: database conflict repair/replay, ghosts, database rollback, event table."`
