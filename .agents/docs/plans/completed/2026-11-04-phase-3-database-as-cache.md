# Phase 3 — The database is a per-clone cache, rebuilt from the item files

> **STATUS: EXECUTED** on 2026-11-04 — commits `ea1ed36`, `2de05ed`, `c42f385`, `e86ae22` on `simplify/pr3-review`;
> suite 860/860, BDD 100/100, check and guard green. Task 4 (untrack the databases in the private backlog repository)
> SKIPPED by its precondition: the installed CLI is still the old build; it waits for the release install. Review
> decisions: an unreadable archived item fails the command (kept); the same-rank conflict still triggers reconcile
> (Phase 4 keeps that path). Do not run again.

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** Phase 2 is committed (`git log --oneline -8` in the worktree shows "query --events answers from the
> items' own history") and `<logs>/decisions/D2.txt` starts with `yes`. Otherwise stop
> and report.

**Goal:** `backlog.db` is no longer a file of the backlog (not in the item folder, not committed, not pushed, never
in a merge): each clone keeps its own SQLite cache under its state folder and rebuilds it from the item files at the
start of every command. The item files are the only data.

**Architecture:** `src/shared/db.js` opens the database (`connect(folder, {readOnly})`), creates `SCHEMA`, and
`scan(db, folder, renumbered, {includeArchived})` ingests the files into the `phase` table (`ingest`). Commands open
it after `sync.pull` and read/write rows during the command (`query`, `pop`, `team.js` views, `update`, `new`,
`archive`, `move`). `store.stateDir(home)` is `<home>/.git` for a clone or `<repo>/.backlog/.state` inside the
repository (ignored by git) — the lock, the views and the journal already live there. `sync.js` stages
`<owner>/<name>/backlog.db` in two places after a renumber (sync.js:188-193, 204-209); `db.freshDb(folder)` returns a
`forget()` that removes a database a failed run created (callers: archive.js:64,75,78; move.js:154,179; new.js:108,190;
update.js:108,114); `store.withMirror` (store.js:242-253) reads `MAX(seq)` from the database for `nextSeq`.

**Tech stack:** Node 24 (`node`), ESM, `node:test`, `node:sqlite`, git.

**Spec:** `REVIEW.md` 2.5 and [2026-11-04-simplification-plan.md](../2026-11-04-simplification-plan.md) Task 6; [the recommendations](2026-11-04-recommendations.md) (R3).

## Handoff context (read fully before the first command)

- Work ON the the development machine machine in the git worktree `<worktree>`, branch `simplify/pr3-review`.
  Never touch `<main-clone>`. Never create another branch, never push, never open a PR.
- Node is `node` (v24). `npm test` = `node --test .agents/test/*.test.js`; `npm run check`.
- Full suite: `bash <logs>/run-tests.sh <label> node` →
  `<logs>/<label>.log` (~2.5 min; start detached with `setsid nohup ... >/dev/null 2>&1 &`
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
  before Task 1; `codebase-memory-mcp cli --quiet trace_path '{"project":"<project>","function_name":"<X>","direction":"inbound"}'`
  before every deletion of an export (`freshDb`, `withMirror`, `undoOnThrow` ...); cite the query in REVIEW-LOG.md.
- Skills to load at the start: `superpowers:executing-plans`, `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`, `ponytail:ponytail`; `ponytail:ponytail-review` before each commit;
  `superpowers:systematic-debugging` at the first unexpected failure. Each use = a row in `REVIEW-LOG.md`.
- Behaviours: failing test first; the smallest change; grep every caller before a deletion; tests assert behaviour
  through the CLI, never the database file; when a test exists only to pin the old mirror (a `backlog.db` in the
  folder, a committed database, a database conflict), delete that test and say so in the commit message rather than
  bending it; keep the structure the code has.
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
- Stop and report (never guess) when a change would alter user-facing behaviour this document and `features/` do
  not cover. `<alert-tool> send --source pr3-simplification-review "<text>"`; answers via
  `<alert-tool> replies`.

## Global constraints

- One backlog, one CLI: identical behaviour in both storage locations.
- The database path is `join(store.stateDir(home), 'cache', `${owner}--${name}.db`)` where
  `home = dirname(dirname(folder))` and `folder = <home>/<owner>/<name>`; the `cache` folder is created on demand.
  Nothing named `backlog.db` is created anywhere by the CLI after this phase; a stray tracked `backlog.db` in an
  item folder is ignored (never opened).
- The cache is rebuilt at every `connect`: `DELETE FROM event; DELETE FROM phase;` then
  `scan(db, folder, [], { includeArchived: true })` inside the same transaction as the schema creation. (shortcut:
  a full rebuild per command; fine up to a few thousand items — switch to a tree-hash stamp if a command gets slow.)
- Behaviour of every command is unchanged except: a "ghost" (a database row whose file is gone) can no longer
  exist, so the `findings.ghost` list of `query --json` is always empty (Phase 4 removes the code).
- No new dependency, no new file under `src/`.

## Review focus

1. Two clones of the same backlog repository write in turn: after the second clone's pull, its `query` shows the
   first clone's item and the first clone's `query` shows the second's after its pull — with no database in git.
   Pinned by Task 3 step 1 (two-clone test).
2. A dry run (`new --dry-run`, `update --dry-run`) must not create the cache folder or file; use an in-memory
   database (`:memory:`) rebuilt the same way. Pinned by Task 1 step 1 (second test).
3. `move --to-repository`: the destination folder's cache is rebuilt from its files when opened; the moved item is
   there after the move. Pinned by the existing move tests after Task 2.
4. An existing checkout that still holds a tracked `<owner>/<name>/backlog.db` from before: the CLI neither opens nor
   deletes it; `git status` stays clean after a command. Pinned by Task 3 step 1 (third assertion).
5. Inside the repository, `.backlog/.state/cache/*.db` is never committed (`.backlog/.gitignore` has `.state/`).
   Pinned by the existing storage-location test "nothing left uncommitted" + Task 1 step 1.

---

### Task 1: the cache location and the rebuild

**Files:**
- Modify: `src/shared/db.js` (`connect`, delete `freshDb`), `src/shared/store.js` (export `cacheFile(folder)`; delete
  `withMirror` and the database part of `nextSeq`/`nextSeqFor` — the files alone give `1 + max(seq)`), the four
  `forget` callers (`archive.js`, `move.js`, `new.js`, `update.js`: delete the `const forget = ...` lines and every
  `forget()` call), `src/shared/sync.js` lines 188-193 and 204-209 (delete the `if (mirror) { ... backlog.db }` blocks
  and the `mirror` parameter of `renumber`/`renumberFiles` if nothing else sets it — check with
  `git grep -n "renumber(" src`), `src/shared/store.js:157` (`persistNote(join(..., 'backlog.db'))`: delete) and
  `:186` (the `backlog.db` sidecar removal in `recoverJournal`: delete the line).
- Test: `.agents/test/shared-db.test.js`, `.agents/test/storage-location.test.js`

**Interfaces:**
- Produces: `store.cacheFile(folder)` → absolute path as in Global constraints. `db.connect(folder, { readOnly })`:
  `readOnly` → `:memory:` rebuilt from the files; otherwise the cache file, `mkdirSync(dirname, {recursive:true})`,
  `SCHEMA`, rebuild. The returned handle still has `db.folder = folder` (Phase 2).
- Consumes: `store.stateDir(home)`, `scan`.

- [ ] **Step 1: failing tests** (shared-db.test.js has a fixture that makes `<home>/<owner>/<name>` with items; reuse it):

```js
test('connect opens a per-clone cache under the state folder and rebuilds it from the files', () => {
  // fixture: home with acme/demo holding phases/001-a.md and phases/002-b.md
  const con = db.connect(folder);
  try { assert.deepEqual(con.prepare('SELECT seq FROM phase ORDER BY seq').all().map(r => r.seq), [1, 2]); } finally { con.close(); }
  assert.ok(existsSync(join(store.stateDir(home), 'cache', 'acme--demo.db')));
  assert.ok(!existsSync(join(folder, 'backlog.db')), 'nothing is written into the item folder');
  rmSync(join(folder, 'phases', '002-b.md'));
  const again = db.connect(folder);
  try { assert.deepEqual(again.prepare('SELECT seq FROM phase').all().map(r => r.seq), [1], 'a deleted file is gone from the cache: no ghost rows'); } finally { again.close(); }
});

test('a read-only connect rebuilds in memory and creates no cache file', () => {
  rmSync(join(store.stateDir(home), 'cache'), { recursive: true, force: true });
  const con = db.connect(folder, { readOnly: true });
  try { assert.equal(con.prepare('SELECT COUNT(*) AS n FROM phase').get().n, 1); } finally { con.close(); }
  assert.ok(!existsSync(join(store.stateDir(home), 'cache')));
});
```

In `storage-location.test.js` add to the first test, after the commit assertions:
`assert.ok(!git(repo, 'ls-files').includes('.db'), 'no database is committed');`.

- [ ] **Step 2: run → RED** (the cache path does not exist; `backlog.db` is in the folder).
- [ ] **Step 3: implement** (`cacheFile`, `connect`, the deletions listed under Files). `nextSeq`: compute from
      `store.load(folder)` seqs only (the archive included) — read the current function first; the contract line
      "1 + max(seq of phases/ and archive/, MAX(seq) of backlog.db)" becomes "1 + max(seq of phases/ and archive/)".
- [ ] **Step 4: run the two files → GREEN; full suite → list the failures (expected: tests that look for
      `<folder>/backlog.db`, that commit a database, or that stage a database conflict). Fix or delete per the
      Behaviours rule; keep a note of every deleted test title for the commit message.**
- [ ] **Step 5: BDD both locations → green; `npm run check`; private guard; ponytail-review; commit**
      `bash <logs>/commit.sh "The database is a local cache of the item files

Each clone rebuilds its own database from the item files at the start of every command, under its state folder;
nothing named backlog.db is created, committed or pushed any more, and a database can no longer disagree with the
files. Dry runs rebuild in memory. Tests that pinned a committed database are removed: <titles>."`

### Task 1b: the `rescan:` output lines go

`backlog new` prints `   rescan: <n> phase(s) tracked, <m> (re)ingested` (new.js, find with `git grep -n "rescan:" src`)
and `backlog archive` prints `   rescan: <m> (re)ingested, <k> missing` (archive.js). They describe the database, which
is now a cache rebuilt per command; the owner's rule is that the backlog's structure is never shown except in a
failure. Remove both lines (and the `summary` values they used, if nothing else reads them). Test first: in
`features/items.feature` scenario "create the first item" (or the storage scenario "the output never names the item
files or their folder") add `And the output does not contain "rescan"`; RED → GREEN; fix the unit tests that pinned
the line (`git grep -n "rescan" .agents/test`). Commit with Task 1 or alone:
`bash <logs>/commit.sh "new and archive report the item, not the database"`.

### Task 2: `move` and `archive` with the cache

**Files:**
- Modify: `src/shared/move.js` (the destination: `db.connect(tdir)` now rebuilds from the destination's files; the
  `undoOnThrow` of the destination still restores files — check it does not try to restore database rows of a file
  that no longer exists in the folder), `src/shared/archive.js` (`markArchived` keeps the row consistent within the
  command; nothing else changes).
- Test: run `.agents/test/shared-move-archive.test.js` — fix tests that assert a `backlog.db` path or a row surviving
  across commands (a row now lives as long as the command).

- [ ] **Step 1: run the file → list failures. Step 2: for each, decide: behaviour through the CLI (keep, fix the
      fixture) or mirror-only (delete, record the title). Step 3: GREEN; full suite green; commit**
      `bash <logs>/commit.sh "move and archive work on the rebuilt cache"`
      (skip the commit if Task 1 left nothing to change here; say so in REVIEW-LOG.md).

### Task 3: two clones, no database in git

**Files:**
- Test: new test in `.agents/test/shared-sync.test.js` (it has `sharedBacklog`, `consumer`, `cli` helpers and a way
  to make a second clone of the same bare origin — look at how `shared-concurrency.js`/existing two-writer tests do it).

- [ ] **Step 1: failing test**

```js
test('two clones share the items through git alone: no database travels', t => {
  // f: tmp with the bare origin, clone A (BACKLOG_HOME a) and consumer repo; clone B (BACKLOG_HOME b) of the same origin
  assert.equal(cli(['new', '--name', 'From A', '--objective', 'o', '--summary', 's'], { cwd: cons, tmp, env: { BACKLOG_HOME: a } }).status, 0);
  const qb = cli(['query', '--json'], { cwd: cons, tmp, env: { BACKLOG_HOME: b } });
  assert.deepEqual(JSON.parse(qb.stdout).phases.map(p => p.name), ['From A']); // b pulled, rebuilt its cache
  assert.equal(cli(['new', '--name', 'From B', '--objective', 'o', '--summary', 's'], { cwd: cons, tmp, env: { BACKLOG_HOME: b } }).status, 0);
  const qa = cli(['query', '--json'], { cwd: cons, tmp, env: { BACKLOG_HOME: a } });
  assert.deepEqual(JSON.parse(qa.stdout).phases.map(p => p.name).sort(), ['From A', 'From B']);
  const tracked = spawnSync('git', ['ls-files'], { cwd: a, encoding: 'utf8' }).stdout;
  assert.ok(!tracked.includes('.db'), tracked);
  // a database left over from before is ignored and never deleted by the CLI
  writeFileSync(join(a, 'acme', 'demo', 'backlog.db'), 'stale');
  assert.equal(cli(['query'], { cwd: cons, tmp, env: { BACKLOG_HOME: a } }).status, 0);
  assert.equal(readFileSync(join(a, 'acme', 'demo', 'backlog.db'), 'utf8'), 'stale');
});
```

- [ ] **Step 2: run → RED or GREEN** (if GREEN immediately, Task 1 covered it: keep the test as the pin and say so).
- [ ] **Step 3: full suite, BDD both, check, guard → green; commit**
      `bash <logs>/commit.sh "Two clones share items through git alone"`

### Task 4: the backlog repository's own tracked databases (data change, outside the public repository)

The private backlog repository at `<shared-backlog-clone>` still tracks 17 `<owner>/<name>/backlog.db`
files. They are now dead data for the new CLI — but the CLI installed on this machine today (`backlog --version`,
the 1.x/branch build) still stages `<name>/backlog.db` explicitly after every change, and git refuses to add an
ignored path, so untracking them while any agent still runs the old CLI breaks that agent's writes (exit 3).
Therefore: do this ONLY when `backlog --version` on this machine reports the version that contains Phases 1-3 (the
release of this branch), and only in that repository. (Transition fact for the report: while the old CLI and the new
one share one backlog repository, the old one reads the committed database, which the new one no longer refreshes —
so the old CLI shows stale items until it scans; the two must not share a backlog repository for long.) Until then SKIP this task, leave the files tracked (the new CLI
ignores them), and write in the report: "Task 4 (untrack the databases) waits for the release install."

- [ ] `cd <shared-backlog-clone> && git pull -q --rebase origin main && git ls-files | grep 'backlog.db$'` → list.
- [ ] `git rm -q --cached $(git ls-files | grep 'backlog.db$')`; append `**/backlog.db` to its `.gitignore`
      (create the file if absent); `git add .gitignore`;
      `git -c user.name=<author-name> -c user.email=<author-email> commit -q -m "Remove the derived databases; the CLI keeps its own cache"`;
      `git push -q origin main`.
- [ ] Verify with the INSTALLED CLI is not required (it is the old version); verify with the worktree's CLI instead:
      `cd <topology-clone> 2>/dev/null || cd <any repository that uses this backlog>` and run
      `node <worktree>/bin/backlog.js query --json | head -c 200` → exit 0.
      If no such repository is at hand, skip and say so in the report.

### Task 5: records

- [ ] CHANGELOG.md "Unreleased (2.0.0)": bullet "The CLI keeps a private cache of the items per clone; no database
      is stored in the backlog (older backlogs may still hold one; it is ignored)." Help: in `HELP.setup` or the
      `--help` storage paragraph nothing names the database — verify with `grep -n "backlog.db\|database" src/help.js`
      and remove any mention of a stored database; regenerate COMMANDS.md and the skill copy.
- [ ] REVIEW-LOG.md rows; REVIEW.md 2.5: "Done in Phase 3 (<commit>): cache under the state folder, rebuilt per
      command; Phase 4 removes the repair code." [2026-11-04-simplification-plan.md](../2026-11-04-simplification-plan.md) Task 6: mark the cache step done.
- [ ] Full suite, BDD both, check, guard → green; `git status --short` empty;
      `bash <logs>/commit.sh "REVIEW-LOG: the cache round"`.
- [ ] Report: `<alert-tool> send --source pr3-simplification-review "Phase 3 done at <commit>: tests <n>/<n>, BDD 100/100, check ok, guard ok. The database is a per-clone cache; the backlog repository no longer tracks backlog.db (<its commit>)."`
