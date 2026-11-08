# Phase 6 — The committed per-repository index: the authoritative order of the backlog, and a readable answer when an item cannot be read

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** Phase 5 is committed (`git log --oneline` shows "One sync path for both storage locations"). Otherwise stop
> and report.

> **DECISIONS THIS PHASE DEPENDS ON:** 20261105-F, G (the unreadable item), T = a, U = a (recorded), J = a (the index entry's `status` is the item's ONE status word; until Phase 6b lands that word is today's `status` field as stored — do not invent a translation here), S = b (owner, 2026-11-05: a per-repository
> text index in the backlog repository, in `.backlog` when the backlog is inside the repository), T and U (below) —
> read `<logs>/decisions/20261105.txt` before starting. Every task is written for the
> recommended option; where the owner chose another option, the decision table of [2026-11-04-pr3-simplification-log.md](../2026-11-04-pr3-simplification-log.md) says which, and you
> implement that one. A decision with no recorded answer stops the task that needs it.

**Goal (owner's decisions 20261105-F and S, binding):** the backlog's order (priority) is per repository and per
branch and lives in ONE committed, tracked text file per repository folder — the index — which every command uses to
find the next item, list the queue, rank an item, pop and plan, without reading every item file. The SQLite database
and the per-clone cache are gone. An item that cannot be read after the pull is named with its unreadable field and
offers two ways out (set the field, or `--restore` the previous version), never a path.

**Why (facts, measured 2026-11-05):** the priority is a front-matter field of every item today (244 live items of the
largest folder carry `priority:`), and every rank change rewrites every affected item file to keep the ranks dense
(`store.reflow`/`applyDense`) — the main reason two writers collide. The database only mirrored the files; reads used
it, writes re-read every file to refresh it. Reading the largest folder (321 items, 4 MB) takes 51 ms today; at the
owner's 50k-item scale a full read per command would take seconds, so the order must live in one small file.

**Architecture (target):** `<folder>/index.json` where `<folder>` = `<backlog location>/<owner>/<name>` (inside the
repository that is `<repo>/.backlog/local/repository/index.json`). Content, one JSON object: `{ "branches": {
"<branch>": [ { "seq": 3, "slug": "003-x", "name": "X", "status": "pending" }, … ] } }` — the ARRAY ORDER is the
priority (P0 first); every live (non-archived) item of the branch is listed exactly once; the file is written with one
entry per line so git merges concurrent changes to different lines. Item files no longer carry `priority:` (a legacy
key in an old item is ignored and dropped at the item's next write); `query --phase` reports the priority computed from
the index. `status` and `name` in the index are copies maintained by every write of the item (same commit) and verified
against the item file whenever that file is read; a mismatch is repaired from the file (the file is the truth for the
item, the index for the order). Archived items are not in the index (`--all`/`archive` listings read the archive
files). `store.load(folder)` still reads every item when a command needs every item (`--all`, `--events` without an
item, `move`'s validation); the queue views, `next`, `pop`, `work`, `team pop`, `new`, `update --priority/--replan`
read the index and only the item files they show or change.

**Tech stack:** Node 24 (`node`), ESM, `node:test`, git. `node:sqlite` is no longer used anywhere.

**Spec:** the owner's decisions above; `REVIEW.md` 2.5; this document.

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
- Stop and report (never guess) when a deletion would change user-facing output that `features/` does not cover.
  `<alert-tool> send --source pr3-simplification-review "<text>"`; answers via `<alert-tool> replies`.

- LESSONS FROM THE PHASE 5 RUN (apply in every task): (23) before reusing a helper the plan names (e.g. a lock path),
  read its current callers — the plan named the run lock for the sync lock, which would have self-deadlocked. (24)
  `git ls-remote --exit-code` exits 2 for an absent ref and 128 for an unreachable or missing remote. (25) A behaviour
  change the plan did not call for is reported as a candidate in the final report, NOT implemented (Phase 5: refusing
  every write in a repository without an origin was reverted by the lead). (26) In the user's repository HEAD may be
  the user's own commit: amend only the command's own commit. (27) Never rewrite a test's expectation to match a
  behaviour the plan did not call for. (28) A mandated skill counts as used only when loaded with the Skill tool.
## Global constraints (the owner's words, 2026-11-05, binding)

"Backlog priority is not universal, it is per repo and per branch. So there needs to be something committed and
tracked and authoritative for the priority and can also be used for other actions like pop and new and set the
priority, etc. [...] a per repo text index in the backlog repo (if the active repo is set for local, then the index
should live in the dot backlog folder) is the right path for now."

"The pattern must be to pull the latest from the repo and if that version is also corrupted then tell the user which
field can't be read properly and allow them to update the field or to restore to the previous commit."

- The index is written by the same publication (`sync.commit`) as the item change it belongs to: one commit, one
  push, same rollback. `reflow` and `reorder` (store.js) operate on the index array and write ONLY the index — no item
  file is rewritten for a rank change any more.
- Concurrency: two writers changing the index at once conflict on it in git. `repairConflicts` (sync.js) gains the
  index case: for an index conflict, take upstream's index, re-apply the local side's change (the item it inserted,
  moved, removed or re-stamped: known from the local commit's diff of the index) and continue the rebase; the same-rank
  path for item files is no longer needed (ranks are not in items) and goes with its flag. The stale guard stays as it
  is for item files; for the index, a concurrent change is merged, not refused (the order has no owner).
- Reads verify: when a command reads an item file it also compares `name`/`status` with the index entry; a mismatch
  is corrected in the index in the same command (and published if the command publishes; a read-only command prints
  nothing about it and keeps the corrected index in memory).
- Legacy folders without an index: the first command that needs the index builds it from the item files (their
  `priority` fields give the order, then `seq`), publishes it (`backlog: index`), and never reads `priority` again.
- Unreadable item (after the pull): every command that reads an item file catches the parse failure and refuses with
  exit 2: `❌ backlog: item <slug>: the field <key> cannot be read (<reason>). Fix it with backlog update <slug> --<key>
  <value>, or restore the item's previous version with backlog update <slug> --restore` (`<key>`/`<reason>` from the
  codec's error; an item with no readable header: "the item has no readable header", same two options). No path. With
  decision G = a, every command of the folder refuses while one item is unreadable; with G = b, the item is skipped
  with a warning.
- `backlog update <item> --<key> <value>` on an unreadable item replaces that one `^<key>:` line (or block) in the raw
  front-matter text with the encoded value and re-parses. `backlog update <item> --restore` (F = a) replaces the item
  file by its content at its previous commit (`git log -2 --format=%H -- <path>`, the older one; none → "the item has
  no earlier version"), records event `restored`, publishes. With F = b the same as `backlog restore <item>`.
- `features/index.feature` (both locations) records: the order survives a clone; a rank change rewrites no item;
  two checkouts ranking different items merge to one dense order; a legacy folder gets its index on first use;
  `features/repair.feature` records the unreadable-item pattern (see Task 4).
- No new dependency; nothing user-facing is removed; the `--json` shapes of `query`/`next`/`pop` keep their fields
  (`priority` is computed).

## Review focus

1. Every ordering the SQL produced (`ORDER BY priority ASC, seq ASC`, the team views' filters) must come out identical
   from the index: the queue and team scenarios pin it; run them after each translated file.
2. A rank change must rewrite exactly one file (the index): pinned by Task 2 step 1.
3. Two checkouts that re-rank different items from the same base must end with one dense order and both items where
   each writer put them relative to the rest: pinned by `features/index.feature`.
4. `move --to-branch` / `--to-repository` updates both indexes (source and destination) in the one publication: pinned
   by the existing move tests after Task 3.
5. The legacy build: a folder with items carrying `priority:` and no index must behave as before on first use: pinned
   by Task 2 step 1 (fixture made from a copy of a real folder's files with priorities).

---

### Task 1: the index module and the queue views

- [ ] **Step 1: failing unit tests** in a new `.agents/test/shared-index.test.js`: `index.read(folder)` returns `{branches:{}}`
      for a folder without one; `index.fromItems(folder)` builds the order from `priority` then `seq` and writes one entry
      per line; `index.rank(folder, branch, slug)` → position; `index.place(folder, branch, slug, position)` moves an
      entry; `index.remove`/`index.add`; `index.stamp(folder, branch, slug, {name, status})`; the file is byte-stable
      (same content → same bytes).
- [ ] **Step 2: implement `src/shared/index.js`** (pure JSON, one entry per line, atomic write through `store.write`'s
      helper or `atomicWrite`); then translate the read views in this order, each file's tests green before the next:
      `query.js` (queue, `next`, `--phase` priority, `--all` from files), `pop.js`, `views.js`, `team.js`, `work.js`,
      `teampop.js`. The SQL goes with each file (`git grep -n "prepare(\|con\.\|db\." src/shared/<file>`).
- [ ] **Step 3: full suite green; commit** `bash <logs>/commit.sh "The queue views read the repository's committed index"`.

### Task 2: writes keep the index; ranks leave the items

- [ ] **Step 1: failing tests**: `shared-update.test.js` — `update 2 --priority 0` changes the index and NO item file
      (compare every item file's bytes before/after); `shared-new.test.js` — `new` adds the entry at the end (or at
      `--priority`), item file has no `priority:` key; `shared-store.test.js` — `reflow`/`reorder` write the index only;
      a legacy fixture (items with `priority:`, no index) gets its index on the first write and its items lose the key
      when next written.
- [ ] **Step 2: implement** in `store.js` (`reflow`, `reorder`, `applyDense` → index), `new.js`, `update.js`
      (`--priority`, `--replan`, `--status` stamps the index entry), `archive.js` (remove from the index), `move.js`
      (remove from the source index, add to the destination's); the publication (`sync.commit`) stages the index with
      the folder (it is inside the folder: nothing to change) and `validatePublication` checks the index (every live
      item listed once, no stranger).
- [ ] **Step 3: full suite, BDD both → green; commit** `bash <logs>/commit.sh "The order of the backlog is the committed index; a rank change rewrites one file"`.

### Task 3: the database goes; the index merges

- [ ] **Step 1:** delete `src/shared/db.js`; `undoOnThrow` (file rollback) and `commitSettled` move to `store.js`/`sync.js`;
      `git grep -n "sqlite\|db\.js\|connect(" src` → nothing; tests rewritten against `store`/`index`/`sync`.
- [ ] **Step 2: failing test** in `shared-sync.test.js`: two clones from one base — A ranks item 1 to P0, B ranks item
      2 to P0 — both publish; the loser's rebase hits the index conflict, `repairConflicts` takes upstream's index and
      re-applies the local placement; final order in both clones is dense with both items placed and no duplicate;
      `features/index.feature` has the same scenario through the CLI (both locations). RED → implement → GREEN.
- [ ] **Step 3: commit** `bash <logs>/commit.sh "No database: the index is the data for the order, the items for everything else"`.

### Task 4: the unreadable item

- [ ] `features/repair.feature` as in the previous revision of this document (scenario "an unreadable field is named
      and can be set again" and, with F, "an unreadable item is restored to its previous version"); the damage step edits
      the item file and commits+pushes the damage in the repository that holds the items. RED → implement
      (`store.readable(folder)` helper used by every reading command; the raw-line repair in `update`; `--restore`) →
      GREEN; commits `"An item that cannot be read is named with its field and can be set again"` and
      `"update --restore brings back an item's previous version"`.

### Task 5: help, docs, records

- [ ] Help: `update --restore`; the storage paragraph: the order of each branch is kept in the repository's index,
      committed with the items; the exit-2 text names the unreadable-item case. README "Where the data lives" (the
      items and the index are the data; nothing else is stored; what to do when an item cannot be read). CHANGELOG
      bullet replaces the cache bullet. COMMANDS.md regenerated and copied to the skill references; SKILL.md one line.
- [ ] `git grep -n -i "sqlite\|database\|cache\|mirror\|rescan" src README.md COMMANDS.md templates CHANGELOG.md` →
      only the CHANGELOG's "removed" wording. Measure `query` on the largest real folder before and after (REVIEW-LOG row).
- [ ] REVIEW-LOG.md rows; REVIEW.md 2.5 final text. Full suite, BDD both, check, guard → green; commit
      `bash <logs>/commit.sh "Help and docs: the index and the items are the data"`.
- [ ] Report to the lead: commits, evidence, plan defects, the timings, every behaviour change.
