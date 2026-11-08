# Phase 5 — Data integrity in both storage locations: pull before every command, push after every change, retry, reject stale writes and show the item's current content

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** Phase 4 is committed (`git log --oneline` shows "A missing item file is a missing item" or the Phase 4
> record commit). Otherwise stop and report.

> **DECISIONS THIS PHASE DEPENDS ON:** 20261105-B, C, D, E — read `<logs>/decisions/20261105.txt`
> before starting. Every task below is written for the recommended option; where the owner chose another option, the
> decision table of [2026-11-04-pr3-simplification-log.md](../2026-11-04-pr3-simplification-log.md) says which, and you implement that one instead. A decision with no recorded answer stops the
> task that needs it: report "waits for decision <id>" and continue with the tasks that do not depend on it.

**Goal:** the owner's data-integrity rule holds for EVERY interaction with the backlog in BOTH storage locations:
(1) every command — reads included — first updates the repository that holds the items from its origin; (2) every
change is committed and pushed before the command exits; (3) a push the origin rejects (someone pushed first) is
retried after another update, up to three times; (4) a write to an item that someone else changed since this
agent last read it is rejected (exit 5), the rejection prints the item's CURRENT content, and nothing of the write
is kept; (5) a claim of an item another agent already holds is refused, in both locations. Today (1)–(4) hold only
for the backlog-repository clone; the repository-local location commits and pushes but never pulls, never retries
and never checks against the origin. This phase makes the one sync code path serve both locations.

**Architecture:** `src/shared/sync.js` is the sync layer: `pull(home)` (fetch + `pull --rebase --autostash` of
`origin/main`, refusing unresolved conflicts and unpublished stacks) and `commit(home, folders, message, reconcile,
guard, claims)` (stage the folders, commit with `--only`, loop: fetch, stale check of the guarded items against
`origin/main`, pull --rebase, repair add/add renumbering, reconcile, validate the publication, push
`HEAD:refs/heads/main`; on failure roll the clone back to `origin/main`). Everything is hard-wired to the clone
layout: `origin/main`, folder names `<owner>/<name>` at the clone root, `lockFile = <home>/.git/...`,
`isClone(home)`; the repository-local case short-circuits to `commitInRepository` (commit + `push origin HEAD`,
no pull, no retry, no guard) and `pull` is a no-op without `.git` in the home. Commands call `store.cloneLocked(home,
…)` → `sync.pull(home)` → read/write → `db.commitSettled(...)` → `sync.commit`. The stale-read guard is
`src/shared/seen.js` (`publicationGuard`, `staleViews`, `staleError`); the per-agent views live in
`store.stateDir(home)`. `features/support/world.js` builds one consuming repository with a bare origin and, for the
remote location, one backlog clone.

**Tech stack:** Node 24 (`node`), ESM, `node:test`, git.

**Spec:** the owner's statement of 2026-11-04 (quoted in Global constraints); `REVIEW.md` 2.1/2.9; this document.

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

## Global constraints (the owner's words, 2026-11-04, binding)

"If you're only working on a local copy and you are not pulling from origin before every backlog action then that's
a fail. And if you're not pushing to origin after every backlog change then that's also a fail because that fails the
team behavior. [...] force a pull before every query, before every check of the status of the item, before every
write to the item, and a push after every change, and a retry scenario if there is a conflict [...] the one who loses
has to retry and then notice that the item they're trying to push has changed and then tell the user that the item
has changed and that their update is no longer on the latest version and the update is rejected and here's the new
content of the thing that you're trying to update."

- One sync code path. `sync.js` gets one descriptor `target(home)` and no `isClone` branch:
  - backlog clone (`<home>/.git` exists): `{ root: home, branch: 'main', ref: 'origin/main', prefix: '' }`;
  - repository-local (`home` = `<repo>/.backlog`): `root` = `git -C <home> rev-parse --show-toplevel`, `branch` =
    `git branch --show-current` (empty → refuse exit 2 "check out a branch: the backlog is committed on the current
    branch"), `ref` = `origin/<branch>`, `prefix` = `.backlog/`.
  Every `origin/main`, `'main'`, `refs/heads/main` in sync.js becomes `ref`/`branch`; every path built from a folder
  name gets `prefix` in front; `lockFile(home)` becomes `store.lockPath(home)` (the state folder). `commitInRepository`
  is deleted.
- Pull before every command, both locations: `fetch origin +refs/heads/<branch>:refs/remotes/origin/<branch>` then
  `pull --rebase --autostash origin <branch>`. A failed fetch or a rebase conflict → `rebase --abort` (and
  `stash pop` if the autostash is still parked: `git stash list` shows an `autostash` entry) → exit 3
  "could not update <root> from origin/<branch> (…); nothing was read or changed". A branch that does not exist on
  the origin yet (`git ls-remote --exit-code --heads origin <branch>` fails) is not pulled; the first push creates it.
- The repository-local differences, and ONLY these: (a) `refuseUnpublished` (the clone must have no unpushed commits)
  does not apply to the user's own repository — its unpushed commits are theirs and are pushed with the backlog
  change (document this consequence in the help: "the backlog change is pushed together with the branch; use a
  backlog repository if the branch must not be pushed yet"); (b) the rollback target after a failed publication is
  the commit BEFORE the backlog commit (record `git rev-parse HEAD` after the pull; roll back with
  `reset --soft <that sha>` when `HEAD`'s subject is this command's), never `origin/<branch>`; (c) the staged work of
  the user outside the backlog paths is left staged (the existing `restoreStaging` handles it through `own(path)`).
- Decided by the owner (20261105-B, C, D, E): (B) inside the repository the branch is pushed as it is; the help states
  it clearly; after every change the CLI prints `✅ <id> - <slug> committed; all pending branch changes pushed` (or
  `… committed; push is off (push-backlog-updates=false)`); a configuration setting `push-backlog-updates` in
  `.backlog/config.json` (default `true`) turns the push off — with it off, nothing is pushed by any command and the
  status line says so; (C) autostash; (D) a branch absent on the origin is not pulled, the first push creates it;
  (E) a read whose pull fails ANSWERS from the local copy and prints the warning `⚠️  origin offline: local backlog
  updates may be behind and need manual remediation later` on stderr (exit 0) — a WRITE whose pull fails is still
  refused (exit 3, nothing changed), because a write on a possibly stale view is exactly what the stale guard exists to
  prevent. Replace the matching unit-test expectations in Task 2 accordingly (the "rejected publication" test's last
  assertion becomes: the read exits 0 and prints the warning).
- Retry: the existing three-round loop (fetch, stale check, pull --rebase, repair, validate, push) runs in both
  locations; a push rejected three times → exit 3 with the rollback, as today.
- Stale rejection shows the item as it is now (the owner's words, 2026-11-04: "tell the user that the item has changed
  and that their update is no longer on the latest version and the update is rejected and here's the new content of
  the thing that you're trying to update"): `staleError` (seen.js) keeps its message and exit 5, and the command that
  catches it (`update`, `move`, `archive`, `pop --claim-now` through update) prints, after the ❌ line, the current item
  as `query --phase <item>` prints it in its human form (a `--- current <slug> ---` line, each front-matter field as
  `key: value`, a blank line, the body), read from the files after the pull; with `--json`, the error object gets
  `item: {...}` with the same front matter and body. The rejected write leaves nothing: files, index and HEAD as before
  the command. No file or folder path appears.
- Claims: `update <item> --claim <agent>` of an item held by another agent is refused (exit 1) in both locations;
  with two clones this is guaranteed by the pull before the write plus the stale guard (the holder's claim changed
  the item after the second agent read it).
- No new dependency; no new file under `src/`.

## Review focus

1. A user with unpushed commits of their own on the current branch: the backlog command must not refuse, must not
   squash or drop those commits, and after it the branch is pushed including them. Pinned by Task 2 step 1 (test
   "the user's own unpushed commit survives and is pushed with the backlog change").
2. A dirty working tree (uncommitted edits to source files) during the pull: `--autostash` parks and restores them;
   a conflict between the edits and upstream aborts cleanly with the edits restored. Pinned by Task 2 step 1 (test
   "a dirty tree survives the pull").
3. The rollback after a failed push in the repository must never touch the user's other commits or files. Pinned by
   Task 2 step 1 (test "a rejected publication puts only the backlog back").
4. The stale rejection must print the item as it is NOW (after the pull), not as the writer saw it, without any path.
   Pinned by `features/integrity.feature` scenario 3.
5. A branch with no origin counterpart yet: first `new` creates it on push; `query` before any push does not fail
   on the missing remote branch. Pinned by Task 2 step 1 (test "a new branch gets its origin branch on the first push").

---

### Task 1: the use-case record first — `features/integrity.feature` and the second clone in the world

**Files:**
- Create: `features/integrity.feature`
- Modify: `features/support/world.js` (`other()` — a second checkout of the same backlog: remote → a second clone of
  the backlog repository's bare origin as another `BACKLOG_HOME`, local → a second clone of the consuming
  repository's bare origin; `runOther(args, extra)` runs the CLI there with its own agent name), `features/steps/cli.js`
  (steps below)

**Interfaces:**
- `world.other()` → the path of the second checkout (created on first use, same `tmp`); `world.runOther(args, extra)`
  → like `run` but `cwd`/`BACKLOG_HOME` of the second checkout and `BACKLOG_AGENT` = `extra.env.BACKLOG_AGENT ?? 'other'`.

- [ ] **Step 1: write the feature file**

```gherkin
Feature: Integrity - every interaction updates from the origin first, publishes after, and rejects stale writes
  The backlog is a git repository. Before any command reads or writes, the repository holding the items is updated
  from its origin; after any change it is pushed; a push the origin rejects is retried; a write to an item that
  someone else changed since this agent last read it is rejected and the current content is shown. The same in
  both storage locations.

  Background:
    Given a repository with a backlog
    And an item "Shared" exists

  Scenario: a read sees a change published from another checkout without any manual step
    When another checkout runs `backlog update 1 --summary "changed elsewhere"`
    And I run `backlog query --phase 1 --json`
    Then the command succeeds
    And item 1 has summary "changed elsewhere"

  Scenario: a change is published before the command exits
    When I run `backlog update 1 --status in_progress`
    Then the command succeeds
    And the backlog repository has no uncommitted or unpushed change
    And another checkout sees item 1 with status "in_progress"

  Scenario: a write on a stale view is rejected and the current content is shown
    Given I act as agent "ann"
    And I have read item 1
    When another checkout runs `backlog update 1 --summary "newer summary" --by bob`
    And I run `backlog update 1 --status in_progress`
    Then the command fails with exit code 5
    And the output contains "was changed by"
    And the output contains "newer summary"
    And the output does not contain "phases/"
    And item 1 has status "pending"
    And item 1 has summary "newer summary"

  Scenario: an item claimed in another checkout cannot be claimed here
    When another checkout runs `backlog update 1 --claim bob`
    And I run `backlog update 1 --claim ann`
    Then the command fails with exit code 1
    And the output contains "bob"
    And item 1 has claimed_by "bob"

  Scenario: the loser of a push race retries and publishes
    Given the origin will receive another checkout's change just before my push
    When I run `backlog new --name "Racing" --objective "o" --summary "s"`
    Then the command succeeds
    And the backlog repository has no uncommitted or unpushed change
    And another checkout sees 2 items
```

- [ ] **Step 2: steps and world.** Steps: ``another checkout runs `(.+)` `` → `w.runOther(split(text).slice(1))` and
      assert exit 0; `another checkout sees item (\S+) with status "([^"]*)"` → `runOther(['query','--phase',item,'--json'])`
      and compare `status`; `another checkout sees (\d+) items` → `runOther(['query','--json'])` and count `phases`
      (open ones); `item (\S+) has claimed_by "([^"]*)"` (reuse the generic `item X has FIELD "V"` step if it already
      matches `claimed_by` — check the regex). The race step: install a pre-push hook in the FIRST checkout's git
      repository (`.git/hooks/pre-push`, executable) that, on its first run only (a marker file in `tmp`), runs the
      other checkout's `backlog update 1 --note "raced"` and exits 0 — the push then is rejected as non-fast-forward
      and the CLI's retry must publish. (For the remote location the hook goes into the backlog clone's `.git/hooks`;
      for the local one into the consuming repository's.) Write the hook with the absolute paths of `process.execPath`,
      `bin/backlog.js` and the other checkout.
- [ ] **Step 3: run both locations → expect RED in the local location for scenarios 1, 3 (no pull, no guard) and 5
      (no retry); remote may be GREEN except the "current content" line of scenario 3. Record exactly which are RED.**
- [ ] **Step 4: do not commit yet.** The full suite must be green at every commit and the runner has no "pending"
      mark, so the feature file and its steps are committed together with the code that makes them pass (Task 2's
      commit, or Task 3's for the "current content" line).

### Task 2: one sync path for both locations

**Files:**
- Modify: `src/shared/sync.js` (`target(home)`, `pull`, `commit`, every `origin/main` literal, `lockFile`, delete
  `commitInRepository` and `isClone`), `src/shared/store.js` (`lockPath` already exists — export it if it is not),
  `src/help.js` (USAGE paragraph and the storage paragraph of `setup`: pushed with the branch), `src/shared/seen.js`
  (`staleViews(..., ref)` takes the ref it compares with — it is called with `'origin/main'` today).
- Tests: `.agents/test/storage-location.test.js` (new tests, see step 1), `.agents/test/shared-sync.test.js` (the
  helper that builds a clone keeps working; add nothing unless a literal `origin/main` assertion breaks),
  `features/integrity.feature` (from Task 1).

**Interfaces:**
- `target(home)` → `{ root, branch, ref, prefix }` as in Global constraints; exported for tests.
- `pull(home)`: both locations, as in Global constraints.
- `commit(home, folders, message, reconcile, guard, claims)`: unchanged signature; `folders` are absolute item
  folders; names become `prefix + <owner>/<name>`.

- [ ] **Step 1: failing unit tests** in `storage-location.test.js` (the `world(t)` fixture there makes a consuming
      repository with a bare origin; add a helper `clone2(t, world)` that clones the same bare origin to `tmp/other`
      and runs the CLI there with `BACKLOG_AGENT: 'other'`):

```js
test('inside the repository every command pulls first: a change published from another clone is read without a manual pull', t => {
  const w = world(t); const o = clone2(t, w);
  assert.equal(w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  assert.equal(o.run(['update', '1', '--summary', 'from the other clone']).status, 0);
  const q = w.run(['query', '--phase', '1', '--json']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).summary, 'from the other clone');
});

test("the user's own unpushed commit survives and is pushed with the backlog change", t => {
  const w = world(t);
  writeFileSync(join(w.repo, 'work.txt'), 'mine\n'); git(w.repo, 'add', 'work.txt'); git(w.repo, 'commit', '-q', '-m', 'my work');
  assert.equal(w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  assert.equal(git(w.repo, 'log', '--format=%s', 'origin/main..HEAD'), '', 'everything is pushed');
  assert.ok(git(w.repo, 'log', '--format=%s', '-3').includes('my work'), 'the user commit is kept');
});

test('a dirty tree survives the pull', t => {
  const w = world(t); const o = clone2(t, w);
  assert.equal(w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  assert.equal(o.run(['update', '1', '--note', 'elsewhere']).status, 0);
  writeFileSync(join(w.repo, 'draft.txt'), 'uncommitted\n'); git(w.repo, 'add', 'draft.txt'); writeFileSync(join(w.repo, 'draft.txt'), 'edited again\n');
  assert.equal(w.run(['query']).status, 0);
  assert.equal(readFileSync(join(w.repo, 'draft.txt'), 'utf8'), 'edited again\n');
  assert.equal(git(w.repo, 'status', '--porcelain', '--', 'draft.txt'), 'AM draft.txt');
});

test('a rejected publication puts only the backlog back', t => {
  const w = world(t);
  assert.equal(w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  writeFileSync(join(w.repo, 'keep.txt'), 'keep\n'); git(w.repo, 'add', 'keep.txt'); git(w.repo, 'commit', '-q', '-m', 'keep');
  const head = git(w.repo, 'rev-parse', 'HEAD');
  git(w.repo, 'remote', 'set-url', 'origin', 'https://127.0.0.1:1/nowhere.git');
  const r = w.run(['update', '1', '--status', 'in_progress']);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.equal(git(w.repo, 'rev-parse', 'HEAD'), head, 'HEAD is where the user left it');
  assert.equal(git(w.repo, 'status', '--porcelain'), '', 'nothing of the rejected write is left');
  assert.equal(w.run(['query', '--phase', '1', '--json']).status, 3, 'a read whose update from the origin fails is refused too: nothing was read or changed');
});

test('a new branch gets its origin branch on the first push', t => {
  const w = world(t);
  git(w.repo, 'switch', '-q', '-c', 'feature');
  assert.equal(w.run(['query']).status, 0, 'no origin branch yet: nothing to pull, no failure');
  assert.equal(w.run(['new', '--name', 'x', '--objective', 'o', '--summary', 's']).status, 0);
  assert.equal(git(w.repo, 'rev-list', '--count', 'origin/feature..HEAD'), '0');
});
```
- [ ] **Step 2: run → RED (the local location does not pull; the rollback resets to the remote ref).**
- [ ] **Step 3: implement `target`, generalise `pull` and `commit`, delete `commitInRepository`/`isClone`; the clone
      tests (`shared-sync*.test.js`, `shared-stale.test.js`) must stay green — run them first after the change.**
- [ ] **Step 4: features/integrity.feature both locations → GREEN except the "current content" line (Task 3). Full
      suite green otherwise; `npm run check`; guard; ponytail-review; commit WITHOUT the feature file if any scenario
      is still RED (keep it for Task 3's commit), or with it if all five pass:**
      `bash <logs>/commit.sh "One sync path for both storage locations

Wherever the items live, every command first updates the repository that holds them from its origin, every change
is pushed before the command exits, a rejected push is retried after another update, and a stale write is refused.
Inside the repository the backlog change is committed on the current branch and pushed with it; the user's own
commits and working edits are kept."`

### Task 3: the rejection shows the current content

**Files:**
- Modify: `src/shared/seen.js` (`staleError` carries `e.items = [{repo, slug, path}]` — check what it carries today),
  `src/shared/update.js`, `move.js`, `archive.js`, `pop.js` (where `BacklogError` with `code === 'STALE_ITEM'` is
  caught and `die(e.message, e.exitCode)` is called: after the ❌ line print the current item(s) from the files; with
  `--json`, print `{ error: {code, message}, item: {...} }` instead of the ordinary line).
- Test: `features/integrity.feature` scenario 3 (from Task 1), `.agents/test/shared-stale.test.js` (one assertion
  added to an existing stale-refusal test: the stdout contains the upstream value and the `--- current` line).

- [ ] **Step 1: the scenario is RED on the "newer summary" line → implement → GREEN in both locations.**
- [ ] **Step 2: full suite, BDD both, check, guard, ponytail-review; commit (with the feature file if not yet committed):**
      `bash <logs>/commit.sh "A rejected stale write shows the item as it is now"`

### Task 4: help, docs, records

- [ ] `src/help.js`: the USAGE storage paragraph says: both locations update from the origin before every command and
      push after every change; inside the repository the change is pushed with the current branch (the user's own
      commits included); the `update` help's exit-5 text says the current item is printed. Regenerate COMMANDS.md and
      the skill copy; `shared-help.test.js`, `skill-commands.test.js` green.
- [ ] README.md: a short "Data integrity" section (the five rules of the Goal, one line each; same in both locations).
      CHANGELOG.md bullet.
- [ ] REVIEW-LOG.md rows; REVIEW.md 2.1/2.9: "the repository-local location now has the same sync as the clone (Phase
      …)" without naming the phase — say "since <commit subject>".
- [ ] Full suite, BDD both, check, guard → green; `git status --short` empty;
      `bash <logs>/commit.sh "Help and README state the data-integrity rules"`.
- [ ] Report (final report to the lead, not the owner-alert tool): commits, evidence, plan defects, every behaviour change.
