# Phase 2 — The item history lives in the item file

> **STATUS: EXECUTED** on 2026-11-04 — commits `d89dd85`, `bce6cb4`, `b3e9895`, `262d786` on `simplify/pr3-review`;
> suite 888/888, BDD 100/100, check and guard green. Deviations accepted in review: `moved_in` kept as an item event;
> `events` added to the stale-read guard's non-content keys; `addEvent` writes front matter only. Do not run again.

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** start only when `<logs>/decisions/D2.txt` exists and its first line is
> `yes` (the owner's decision D2: the database becomes a cache). If it does not exist, report
> `<alert-tool> send --source pr3-simplification-review "Phase 2 waits for decision D2 (events to the item files, database as cache): answer yes or no"`
> and stop.

**Goal:** every event of an item (`claimed`, `review`, `planning_event`, `archived`, `moved_branch`, `moved_out`,
`split`, `renumbered`, and the notes of `update`) is recorded in the item's file, in the front-matter list `events`,
and `backlog query --events [item]` reads the files, so the SQLite database holds nothing the files do not.

**Architecture:** items are markdown files with YAML-like front matter (`src/shared/frontmatter.js` parses and
dumps a fixed subset: unquoted, single- and double-quoted scalars, block and flow lists of scalars). `src/shared/store.js`
reads (`load(folder)` → `[{path, fm, body, sha256}]`) and writes (`write({path, fm, body}, folder)`, after `note(path)`
has recorded the prior content for rollback) item files. `src/shared/db.js` mirrors the files into
`<folder>/backlog.db` (`scan`, `ingest`) and writes events with `logEvent(db, event, {handoffId, phaseId, branch,
commitSha, note})` — 16 call sites (archive.js:144, db.js:155/160/182/196/209, move.js:86/175, new.js:180/185,
update.js:163/303/315/318/323). Readers of events: query.js:264-277 (`--events`), move.js:153+171 (copies the events
to the destination database), db.js replayLocal (Phase 4 deletes it).

**Tech stack:** Node 24 (`node`), ESM, `node:test`, `node:sqlite`, git.

**Spec:** `REVIEW.md` 2.5 (as corrected) and [2026-11-04-simplification-plan.md](../2026-11-04-simplification-plan.md) Task 6; [the recommendations](2026-11-04-recommendations.md) (R3).

## Handoff context (read fully before the first command)

- Work ON the the development machine machine in the git worktree `<worktree>`, branch `simplify/pr3-review`
  (HEAD = the Phase 1 result). Never touch `<main-clone>`. Never create another branch,
  never push in this phase, never open a PR.
- Node is `node` (v24). `npm test` = `node --test .agents/test/*.test.js`; `npm run check`.
- Full suite: `bash <logs>/run-tests.sh <label> node` writes
  `<logs>/<label>.log` (~2.5 min). With a shell time limit start it detached
  (`setsid nohup bash ... >/dev/null 2>&1 &`) and poll
  `grep -E "^ℹ (tests|pass|fail|skipped)|^exit=" <logs>/<label>.log`. Green =
  `fail 0`, `skipped 0`, `exit=0`. Failures: `grep "^✖" <log>`.
- One file: `node --test --test-reporter=tap .agents/test/<file> 2>&1 | grep -E "^(not ok|# pass|# fail)"`;
  a failure's reason: `... 2>&1 | grep -E "^\s+error" -A6`.
- BDD: `FEATURE_LOCATION=local node --test .agents/test/features.test.js`, then `remote`; both green.
- Private guard before every commit:
  `BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js` → `pass 3`.
- Commit: `bash <logs>/commit.sh "<message>"` (author `<author>`,
  no trailers). The message says what changed for a user; never a machine, path, agent, model, item number or owner
  decision.
- PUBLIC REPOSITORY RULE: code, tests, docs and commit messages name no private repository, host, machine, path,
  port, internal agent or team name, model name, backlog item number or owner decision.
- codebase-memory: `codebase-memory-mcp cli --quiet index_repository '{"repo_path":"<worktree>"}'`
  before Task 1; for every "nothing else reads/calls X" claim:
  `codebase-memory-mcp cli --quiet trace_path '{"project":"<project>","function_name":"<X>","direction":"inbound"}'`;
  cite the query in REVIEW-LOG.md.
- Skills to load at the start: `superpowers:executing-plans`, `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`, `ponytail:ponytail`; `ponytail:ponytail-review` before each commit;
  `superpowers:systematic-debugging` at the first unexpected failure. Each use = a row in `REVIEW-LOG.md`.
- Behaviours: failing test first, watched failing for the expected reason; the smallest change that passes; grep
  every caller before changing a signature; tests assert behaviour through the CLI (`query --events`, `--json`),
  never the database; keep the structure the code has; a shortcut with a known limit gets a one-line
  `// shortcut: <limit>, <when to upgrade>` comment.
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
- Stop and report (never guess) when a change would alter user-facing behaviour this document and `features/` do
  not cover. Report/ask with `<alert-tool> send --source pr3-simplification-review "<text>"`; read with
  `<alert-tool> replies`.

## Global constraints

- One backlog, one CLI: identical behaviour in both storage locations (BDD proves it).
- The output format of `backlog query --events` is unchanged:
  ``  <ts>  <event padded to 14>  branch=<branch> commit=<7 chars> <note>`` per line, newest first, 50 lines at most
  without an item.
- Front-matter event line format (exact): `"<ts> <event> <branch|-> <commit|-> <note>"` — five space-separated
  fields, the fifth free text with every run of whitespace collapsed to one space; `ts` = `store.now()`
  (`2026-11-04T13:00:00Z`); `-` stands for an empty branch or commit. Decode with
  `/^(\S+) (\S+) (\S+) (\S+)(?: (.*))?$/`.
- Events dropped on purpose (decision D2): the scan's own bookkeeping events `ingested`, `reingested`,
  `file_missing` (db.js:155/160/196) and the itemless `planning_event` of `--replan` (update.js:163). The itemless
  `planning_event` of `backlog new` (new.js:185) is recorded on the new item instead.
- No new dependency, no new file under `src/` (the helpers go into `src/shared/store.js` and `db.js`).

## Review focus

1. An event written after the command's own `store.write` of the same file must not lose the command's change:
   the helper re-reads the file from disk, appends, writes. Pinned by Task 1 step 1 (the note and a field change
   both present after `update 1 --status in_progress --note x`).
2. `move --to-repository`: the events must arrive with the item (they are in the file now) and the destination
   must not duplicate them. Pinned by Task 3.
3. `archive`: the `archived` event is in the archived file (`query --events <n>` still answers for an archived item).
   Pinned by Task 2 step 1 (second assertion).
4. The renumbering of a file during a pull (`sync.renumber`) keeps the `events` list (it rewrites the front matter
   through `retagged`/`store.write`, which keeps unknown keys). Pinned by the existing `shared-sync.test.js`
   renumber tests + the new assertion in Task 2 step 4.
5. A legacy item with no `events` key reads as an empty history (no crash, no undefined). Pinned by Task 2 step 1
   (an item created before the change, simulated by deleting the key in a fixture).

---

### Task 1: write events into the item file (dual write with the database)

**Files:**
- Modify: `src/shared/store.js` (add `addEvent`), `src/shared/db.js` (`connect` tags the handle with its folder;
  `logEvent` also writes to the file when it knows the item)
- Test: `.agents/test/shared-store.test.js` (unit test of `addEvent`), `features/queue.feature` (scenario)

**Interfaces:**
- Produces in `store.js`:
  ```js
  // Appends one event line to the item file's front-matter list `events` (created when absent). The file is re-read
  // first (a command may have written it a moment ago) and noted for rollback. Returns the line written.
  export function addEvent(folder, path, { event, branch = '', commitSha = '', note = '' })
  export const eventLine = ({ ts, event, branch, commitSha, note }) => [ts, event, branch || '-', (commitSha || '-'), String(note ?? '').replace(/\s+/g, ' ').trim()].filter((x, i) => i < 4 || x).join(' ')
  export function parseEvent(line) // → { ts, event, branch, commit_sha, note } with '-' decoded to ''
  ```
  `path` is the folder-relative path as in `store.load` (`phases/001-x.md` or `archive/.../001-x.md`).
- Produces in `db.js`: `connect(folder)` sets `db.folder = folder` on the returned handle (an ordinary property);
  `logEvent(db, event, opts)` keeps its signature and, when `opts.phaseId` is set and `db.folder` is set, looks up
  `SELECT path FROM phase WHERE id=?` and calls `store.addEvent(db.folder, row.path, {event, branch, commitSha, note})`
  — but NOT for `event` in `['ingested', 'reingested', 'file_missing']`.

- [ ] **Step 1: failing tests**

In `.agents/test/shared-store.test.js` (confirm its helpers first: `grep -n "^function\|^const .* = " .agents/test/shared-store.test.js | head`; use the scratch-folder helper it has; create one item file with
`store.write({ path, fm: { phase: '001-a', seq: 1, name: 'a', status: 'pending' }, body: 'x\n' }, folder)`):

```js
test('addEvent appends an event line to the item file and keeps every other key', () => {
  // ...fixture: folder with phases/001-a.md as above...
  const line = store.addEvent(folder, 'phases/001-a.md', { event: 'claimed', branch: 'main', note: 'by  ann\nnow' });
  const [item] = store.load(folder);
  assert.deepEqual(item.fm.events, [line]);
  assert.equal(item.fm.name, 'a');
  assert.match(line, /^\d{4}-\d\d-\d\dT[\d:]+Z claimed main - by ann now$/);
  assert.deepEqual(store.parseEvent(line), { ts: line.split(' ')[0], event: 'claimed', branch: 'main', commit_sha: '', note: 'by ann now' });
  store.addEvent(folder, 'phases/001-a.md', { event: 'review', commitSha: 'abcdef1234' });
  assert.equal(store.load(folder)[0].fm.events.length, 2);
  assert.deepEqual(store.parseEvent('2026-01-01T00:00:00Z x - -'), { ts: '2026-01-01T00:00:00Z', event: 'x', branch: '', commit_sha: '', note: '' });
});
```

Add to `features/queue.feature`, replacing the scenario "the events of an item are kept":

```gherkin
  Scenario: the events of an item are kept with the item
    When I run `backlog update 1 --status in_progress --note "started"`
    Then the command succeeds
    And item 1 has status "in_progress"
    When I run `backlog query --events 1`
    Then the command succeeds
    And the output contains "started"
    And the output contains "branch="
    When I run `backlog query --phase 1 --json`
    Then the JSON field front_matter.events has 1 or more entries
```

Add the step to `features/steps/cli.js`:

```js
step(/^the JSON field (\S+) has (\d+) or more entries$/, (w, dotted, n) => {
  const v = dotted.split('.').reduce((o, k) => (o ?? {})[k], JSON.parse(w.last.stdout));
  assert.ok(Array.isArray(v) && v.length >= Number(n), `${dotted}: ${JSON.stringify(v)}`);
});
```

- [ ] **Step 2: run → RED** (`store.addEvent is not a function`; the scenario fails on `front_matter.events`).

- [ ] **Step 3: implement `addEvent`, `eventLine`, `parseEvent` in store.js** — read the file with `readFileSync`,
      `parse` it (frontmatter.js), `fm.events = [...asList(fm.events), line]` (`asList` from team.js, or
      `Array.isArray(x) ? x : x == null ? [] : [x]` inline), `note(abs)` then `write({ path, fm, body }, folder)`.
      Then db.js: tag the handle in `connect` (`db.folder = folder;` both branches) and extend `logEvent` as in
      Interfaces. Keep the SQL insert (the database still records events in this phase).

- [ ] **Step 4: run the store test and the BDD in both locations → GREEN. Full suite → expect failures only where a
      test counted events or compared a whole front matter; fix those tests to tolerate/assert the `events` key, never
      by removing the behaviour.**

- [ ] **Step 5: ponytail-review of the diff; commit**
      `bash <logs>/commit.sh "Every event of an item is recorded in the item itself

The history of an item (claims, reviews, notes, planning events, archive, moves) is kept in the item's front matter
as well as in the database, so the item carries its history wherever it is read."`

### Task 2: `query --events` reads the files

**Files:**
- Modify: `src/shared/query.js:262-277`
- Test: `.agents/test/shared-query.test.js`

**Interfaces:**
- Consumes: `store.load(folder)` (every item, archive included, `{path, fm}`), `store.parseEvent`, the existing
  `itemSelector`, `sha7`, `say`, `repr`.
- Produces: unchanged output lines; the source is `fm.events` of the files. Without an item: every item's events,
  sorted by `ts` descending (stable), first 50. With an item: that item's events, newest first; an unknown item →
  `❌ no phase '<x>'`, exit 1 (as today).

- [ ] **Step 1: failing test** (in shared-query.test.js, `fx()` fixture (the file's shared, cached fixture — confirm with `grep -n "^const fx\|^function fx\|^function build" .agents/test/shared-query.test.js`): items 001-alpha … 004-delta exist,
      003 is in progress, 004 done):

```js
test('query --events reads the item history from the items, newest first, archived items included', () => {
  const f = fx(); // the file's shared fixture; if it is cached across tests, use build(true) for a fresh one
  cli(['update', '1', '--note', 'first note'], { cwd: f.cons, tmp: f.t });
  cli(['update', '1', '--note', 'second note'], { cwd: f.cons, tmp: f.t });
  const one = cli(['query', '--events', '1'], { cwd: f.cons, tmp: f.t });
  assert.equal(one.status, 0, one.stderr);
  const lines = one.stdout.trim().split('\n');
  assert.ok(lines[0].includes('second note') && lines.some(l => l.includes('first note')), one.stdout);
  assert.match(lines[0], /^ {2}\d{4}-\d\d-\d\dT\S+ {2}\S.{13} branch=\S* commit=\S* /);
  cli(['update', '4', '--status', 'done'], { cwd: f.cons, tmp: f.t });
  assert.equal(cli(['archive', '4'], { cwd: f.cons, tmp: f.t }).status, 0);
  const arch = cli(['query', '--events', '4'], { cwd: f.cons, tmp: f.t });
  assert.equal(arch.status, 0, arch.stderr);
  assert.match(arch.stdout, /archived/);
  const all = cli(['query', '--events'], { cwd: f.cons, tmp: f.t });
  assert.ok(all.stdout.includes('second note') && all.stdout.includes('archived'), all.stdout);
  // the database is not the source: an event that exists only in a file is listed
  const file = join(f.folder, 'phases', '002-beta.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^---\n/, '---\nevents:\n- "2020-01-01T00:00:00Z note - - only in the file"\n'));
  assert.match(cli(['query', '--events', '2'], { cwd: f.cons, tmp: f.t }).stdout, /only in the file/);
  assert.equal(cli(['query', '--events', '99'], { cwd: f.cons, tmp: f.t }).status, 1);
});
```

- [ ] **Step 2: run → RED** (the file-only event is not listed).
- [ ] **Step 3: implement** — in the `a.events !== undefined` block build `rows` from
      `store.load(folder).flatMap(i => asList(i.fm.events).map(l => ({ slug: i.fm.phase, ...store.parseEvent(l) })))`;
      for one item keep the existing row lookup to find `p.path`, then filter `rows` to `i.path === p.path`
      (or by slug); sort by `ts` descending, `.slice(0, 50)` for `*`; print with the existing `say` line.
- [ ] **Step 4: run the test file → GREEN; the `shared-sync.test.js` renumber tests still pass (events survive a
      renumber); full suite → green.**
- [ ] **Step 5: ponytail-review; commit**
      `bash <logs>/commit.sh "query --events answers from the items' own history"`

### Task 3: `move` no longer copies events; the itemless events

**Files:**
- Modify: `src/shared/move.js:153` and `:171` (delete the SELECT of events and the loop that re-inserts them with the
  `[from <repo> <slug>]` prefix — the file carries `fm.events` now); `src/shared/new.js:185` (record the planning
  event on the new item: pass `phaseId` of the row just ingested); `src/shared/update.js:163` (delete the itemless
  replan event — the database insert too).
- Test: `.agents/test/shared-move-archive.test.js` (the test that asserts `[from ... ]` events at the destination —
  find it with `grep -n "from " .agents/test/shared-move-archive.test.js`) and `shared-new.test.js`/`shared-update.test.js`
  tests that counted `planning_event` rows (`grep -n "planning_event" .agents/test/*.js`).

- [ ] **Step 1: change the tests first** — the move test asserts that after `move <n> --to-repository <other>`,
      `query --events <new number>` run in the destination repository lists the item's earlier events (same notes,
      without a `[from ...]` prefix) and that no event appears twice. A replan test that counted the itemless
      planning event now asserts `query --events` (no item) does not list `replan` (document this in the test
      title: "a replan leaves no event; the order itself is the record").
- [ ] **Step 2: run → RED. Step 3: implement the three edits. Step 4: run → GREEN; full suite + BDD both → green.**
- [ ] **Step 5: ponytail-review; commit**
      `bash <logs>/commit.sh "A moved item brings its own history; a replan leaves the order as its record"`

### Task 4: help, docs and records

- [ ] In `src/help.js` (`HELP.query`, the `--events` option text) say the history is kept with the item and that a
      replan records no event; regenerate COMMANDS.md (`node .agents/scripts/sync-commands-md.mjs`),
      `cp COMMANDS.md templates/skills/backlog/references/commands.md`; run `shared-help.test.js`, `skill-commands.test.js`.
- [ ] CHANGELOG.md "Unreleased (2.0.0)": one bullet — "The history of an item is part of the item (`backlog query
      --events`); a replan records no event of its own."
- [ ] REVIEW-LOG.md rows; REVIEW.md 2.5: add "Events are in the item files since <commit>; the database is now
      derived (Phase 3 makes it a cache)."
- [ ] Full suite, BDD both locations, `npm run check`, private guard → green; `git status --short` empty.
- [ ] `bash <logs>/commit.sh "REVIEW-LOG: the item-history round"`
- [ ] Report: `<alert-tool> send --source pr3-simplification-review "Phase 2 done at <commit>: tests <n>/<n>, BDD 100/100, check ok, guard ok. Item history lives in the item files; query --events reads them; move copies no events; replan records none."`
