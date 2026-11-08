# Phase 6b — one status order, the workflow definition, two verdicts

> **For the executing agent (a sub-agent):** REQUIRED SUB-SKILL `superpowers:executing-plans`. Steps use
> checkbox syntax. Work task by task, commit per task, suite green at every commit. Read the whole document first.

> **DECISIONS THIS PHASE DEPENDS ON:** 20261105-J = a, V = a, W (verdict complete|reject only), X (registered flows: see Task 1 Step 3) — all recorded in
> `<logs>/decisions/20261105.txt`. Nothing in this phase waits for an open decision. The
> owner's rule: NO behaviour is removed on your judgement; a candidate removal is reported in your final report with
> evidence and left in place. A disagreement between this document and the code stops that task: report file:line.

**Goal:** every backlog item carries ONE status word from one ordered list; the team steps move an item along that
order under the rules of a workflow definition file (JSON) the CLI ships and a team's configuration entry selects; a
review verdict is `complete` or `reject`; items written before this phase are read correctly without rewriting them.

**Spec:** the workflow definition — the file `backlog-workflow.json` the owner approved (decision J = a). Its private
copy is `the team-lead skill's copy in the team's topology repository`
(read it whole; it is the authority on words, steps, who may run them, verdict routing, pop order, refusals). It is
copied into the public repository in Task 1 with the renames listed there (the public copy must carry no internal
names).

**Architecture:** `src/shared/workflow.js` loads the definition and answers four questions for the rest of the code:
`statusOf(fm, team)` (the one word, translating pre-phase items), `canStep(step, fm, actor, team)` ({ok} or
{refuse}), `next(step, verdict, fm, team)` (the status after a step) and `isFinished(status)`. `lifecycle.js` keeps its
guards (claimer-only close, hand-offs, author never reviews, stale review, wip) and stops deciding words itself: every
transition asks `workflow`. The three state fields collapse to `status`; `stage` and `review_state` are read for
translation only and dropped on the first write of an item. The per-branch index (Phase 6) stores the one word.

**Tech stack:** Node 24, no new dependency; node:test; the BDD runner in both storage locations.

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

- Behaviours of this phase: a TRANSLATION phase — old items (three fields) must read as the new one word with no
  rewrite; the first write of such an item drops the old fields. Every new word, step rule and verdict is pinned by a
  test that fails before the change. The live `backlog` on this machine is the branch HEAD after every commit, and the
  machine's teams run today with `--review pass|changes` and `--refinement-review pass|changes`: those two words stay
  accepted as synonyms (pass → complete, changes → reject) and the canonical word is what the CLI prints; the skills
  switch to the new words later (a private-repository item, not yours).
- Words with spaces ("ready for review") are stored exactly so; on the command line they may be given with spaces,
  hyphens or underscores (`ready-for-review`, `in_progress`) and are normalised to the stored form.

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


- FACTS FROM THE PHASE 6 RUN (the committed index is live; `db.js`, the mirror and `guardReflow` are gone):
  `src/shared/index.js` holds the order: `<folder>/index.json` = `{ branches: { <branch>: [{ seq, slug, name, status }] } }`,
  array position = priority, open entries first; `index.ACTIONABLE = ['pending', 'in_progress']` and `isOpen` decide
  "open" there, `query.js` and `team.js` each have their own `ACTIONABLE` copy and `query.js` a `CLOSED = ['done','archived']`,
  `move.js` imports `ACTIONABLE` from index.js, `store.reorder` uses `index.ACTIONABLE`. THIS PHASE replaces every one of
  those with `workflow.isFinished(word)` (open = not finished; a free-text word outside a team is open) — one definition,
  in `workflow.js`, imported everywhere; the index entry's `status` is the stored word; `index.fromItems` (a folder
  without an index) sorts open-first with the same predicate. Views read `index.rows(folder)` → `{ rows, items }` and
  `index.open(rows)`; `store.write` drops `RETIRED_KEYS` on every write — add `stage` and `review_state` to THAT list
  when the item carries a new-list word (Task 2 Step 4), do not write a second dropper. Reads publish a missing index
  once (`index.ensure`, commit subject "index"); a corrupt `index.json` is refused with exit 1. Every command of a
  folder refuses with exit 2 while one item is unreadable (`repair.js`); `update <item> --<field> <value>` and
  `update <item> --restore` are the repairs. `priority` in an item file is ignored and dropped at its next write.
- LESSONS FROM THE PHASE 6 RUN (apply in every task): (29) when the plan says a write touches "no item file", check
  what the command stamps on the item it names (`updated`, `planning_event`): keep that stamp unless the plan names it
  as removed, and say so in the report — the agent did this right. (30) A new module's exported functions that no
  command calls are dead on arrival: before the final commit `git grep -n "<name>(" src` for every export and delete
  the ones only their own unit test uses (the lead removed four). (31) A value that can be `null` in a view row
  (an archived item has no rank) is printed through every text formatter: grep the formatters for the field and pin
  the text with a test (`Pnull` reached the live view). (32) A shape check on a JSON file must refuse an array where
  an object is expected (`typeof [] === 'object'`); test the three unreadable shapes (not JSON, wrong type, entry
  without the key). (33) The timing table in the report is evidence, not a claim: name the folder size and the run
  count, as the agent did.
- LESSONS FROM THE PHASE 5 RUN (apply in every task): (23) before reusing a helper the plan names (e.g. a lock path),
  read its current callers — the plan named the run lock for the sync lock, which would have self-deadlocked; use a
  separate file and say so. (24) `git ls-remote --exit-code` exits 2 for an absent ref and 128 for an unreachable or
  missing remote: never treat every non-zero exit the same way. (25) A behaviour change the plan did not call for is
  reported in the final report as a candidate, NOT implemented — the Phase 5 agent made a repository without an
  origin refuse every write, and the lead reverted it; the first release committed and reported exit 3, so that stands.
  (26) In the user's repository HEAD may be the user's own commit: amend only the command's own commit. (27) Never
  rewrite a test's expectation to match a behaviour the plan did not call for. (28) A mandated skill counts as used
  only when loaded with the Skill tool; "applied by reading" is not a REVIEW-LOG row.

## Global constraints (the owner's words, binding)

- One status word per item; the ordered list and the side word are exactly the `statuses` and `side_statuses` of the
  workflow file. No other word on a team item, ever. Outside a team the word is free text; `closed`, `done` and
  `archived` mean finished, every other word means open (V = a).
- Only `backlog team …` commands enforce the order (the hierarchy itself is Phase 6c; in THIS phase the enforcement
  lives where the team steps live today, `update.js`/`lifecycle.js`, and Phase 6c moves it). The user-command
  `update --status <word>` on an item that has a team is refused with `use backlog team update` from this phase on.
- A verdict is `complete` or `reject`; `pass` and `changes` are accepted synonyms. A reject returns the item to the
  step before that review and keeps the findings in the item's review history; it clears the recorded passes of that
  review stage.
- Which review stages apply and how many passes each needs comes from the team's configuration entry (`review` list;
  default = the file's `team_entry_review_default`): a stage absent from the entry is skipped (the file's
  `skipped_stage_rule`). A team step for a team with no configuration entry is refused with
  `team <name> is not configured in the backlog configuration` — it never passes silently (today it does).
- Nothing user-facing is removed; every existing flag of `update` keeps working through the translation.
- Public repository: the workflow file copied into the repository carries no internal names (Task 1 renames).

## Review focus (tests added to the owning task)

1. An item from before this phase in every combination the translation table names reads as the right word
   (Task 2 table test, 14 rows).
2. `--review reject` on the external stage returns the item to `in progress` and clears both stages' passes; the
   author's next pop offers rework (Task 4).
3. A team with no configuration entry: the first team step is refused with the exact message (Task 3).
4. A team entry listing only the `peer` stage: `--review complete` by a member moves the item straight to
   `review complete` (Task 3).
5. `update --status "blocked on vendor"` on an item without a team is accepted and the item stays in the queue;
   `update --status closed` leaves the queue (Task 2).

---

### Task 1: the workflow file and its loader

**Files:**
- Create: `templates/workflows/team.json` (the definition), `src/shared/workflow.js`, `.agents/test/workflow.test.js`
- Modify: `package.json` `files` (if the templates folder is listed explicitly — check)

**Interfaces:**
- Produces: `loadWorkflow(name = 'team') → definition` (the parsed JSON; cached); `STATUSES` (the ordered array);
  `SIDE` (`{ 'awaiting decision': {...} }`); `isFinished(word) → boolean` (closed, done, archived); `normalise(word)
  → word` (hyphen/underscore/case → stored form; unknown words returned trimmed as typed); `stageList(teamEntry) →
  ['peer','external']` (the stages the entry lists, in the file's `review_stages_order`; default from
  `team_entry_review_default`).

- [ ] **Step 1: copy the definition.** `cp` the private file to `templates/workflows/team.json`, then apply these
      renames inside it with `sed -i` and verify with `grep -c`: the private workflow name → `"team"`; the private peer-stage key and every
      reference to it → `"peer"`; in `team_entry_example` the lead's session name → `lead-1`, the three members' →
      `member-1`/`member-2`/`member-3`, the two external reviewers' → `reviewer-1`/`reviewer-2`; in `description` remove the
      sentence fragment naming any team. Then run the private guard: it must pass. Record the renames in REVIEW-LOG.
- [ ] **Step 2: failing tests** in `workflow.test.js`:
  ```js
  test('the ordered statuses are the file's', () => assert.deepEqual(STATUSES, ['new','refining','refined','refinement review','ready','in progress','ready for review','reviewing','ready for external review','external review','review complete','closed','archived']));
  test('finished words', () => { for (const w of ['closed','done','archived']) assert.ok(isFinished(w)); assert.ok(!isFinished('blocked on vendor')); });
  test('normalise', () => { assert.equal(normalise('ready-for-review'), 'ready for review'); assert.equal(normalise('In_Progress'), 'in progress'); assert.equal(normalise(' custom word '), 'custom word'); });
  test('stage list follows the team entry', () => { assert.deepEqual(stageList({ review: [{ stage: 'peer' }] }), ['peer']); assert.deepEqual(stageList({}), ['peer', 'external']); });
  ```
- [ ] **Step 3: RED → implement** `workflow.js` (read the JSON once with `readFileSync` relative to `import.meta.url`;
      export the four functions and the two constants). `loadWorkflow(name, home)` looks first in the backlog's own
      registered flows — `<backlog root>/workflows.json`, an object `{ "<name>": <definition> }` written by
      `backlog team workflow` (Phase 6c) — and falls back to the shipped `templates/workflows/<name>.json`; an unknown
      name → `BacklogError` exit 2 `workflow <name> is not defined (backlog team workflow --file <json> registers one)`.
- [ ] **Step 3b: `validateWorkflow(def) → string[]`** (empty = valid), one test per rule, each with a broken copy of
      the shipped file: `statuses` is a non-empty array of distinct strings and ends with `closed`, `archived`;
      `finished` ⊆ statuses ∪ {done}; every step has `from` (array of statuses or `["*"]`), `to` (a status, `same`,
      `previous`, or a `verdicts` map whose every `to` is a status) and `by` (non-empty); every `side_statuses` entry
      has `enter`/`leave` naming steps; `review_stages_order` lists exactly the stage keys used in `steps.review.stages`
      and `steps.start-review.stages`; from every non-finished status some chain of steps reaches `closed` (graph
      walk over `from`→`to`, verdict `complete` branches included) — the rule that keeps a team from registering a
      flow that traps items; `refusals` has the five keys. The shipped file validates to `[]`.
- [ ] **Step 4: GREEN.** **Step 5: commit** "The status order and the team workflow definition ship with the CLI".

### Task 2: one word per item — `statusOf`, the translation of old items, free text outside a team

**Files:**
- Modify: `src/shared/workflow.js` (+ `statusOf`), `src/shared/store.js` (where front matter is loaded: `load`
  returns `fm.status` translated — find the one place with `git grep -n "status" src/shared/store.js`), `src/shared/update.js`
  (the `--status` validation, line ~193 today: `['pending','in_progress','done']` → see below), `src/shared/query.js`,
  `src/shared/views.js`, `src/shared/pop.js`, `src/shared/team.js`, `src/shared/index.js` (Phase 6: the entry's
  `status`), `src/help.js`
- Test: `.agents/test/workflow.test.js` (translation table), `.agents/test/shared-update.test.js` (free text / refusal)

**Interfaces:**
- Produces: `statusOf(fm, teamEntry|null) → word`. Translation table (old fields → word), applied ONLY when the item
  has no word of the new list already (an item written by this build is never re-translated):

  | status | stage | review_state | word |
  |---|---|---|---|
  | archived | * | * | archived |
  | done | * | * | closed |
  | pending (team item) | none | * | new |
  | pending | refining | * | refining (new when `refiner` is empty) |
  | pending | refined | * | refined |
  | pending | refinement-review | * | refinement review |
  | pending | ready | * | ready |
  | * | review-hitl | * | awaiting decision (the previous word is recorded in `decision_from`, see Task 4) |
  | in_progress | * | none / '' | in progress |
  | in_progress | * | requested | ready for review |
  | in_progress | * | in_review | reviewing when `reviewer` is in the team's members; external review when in its external_reviewers |
  | in_progress | * | changes-requested | in progress |
  | in_progress | * | passed | review complete when every stage of `stageList(team)` has its passes in `reviews`; else ready for external review |
  | pending (no team) | — | — | the word as stored (free text) |

- [ ] **Step 1: table test** — one `test` per row above, each building the minimal `fm` and asserting the word; plus
      "an item already carrying a new-list word is returned unchanged".
- [ ] **Step 2: RED → implement `statusOf`.** Then wire it: `store.load` sets `fm.status = statusOf(fm, team)` for
      every item read (and keeps the original fields in memory for the write path); the index entry (Phase 6) is
      stamped with the word; `query`/`views`/`pop` print the word. `team.isReady(fm)` becomes `statusOf(...) ===
      'ready'` (trace its callers first).
- [ ] **Step 3: `update --status`.** Replace the fixed list check: on an item WITH a team → refuse exit 2
      `use backlog team update: a team item's status moves by its team steps`; WITHOUT a team → accept any word
      (normalised); the queue membership uses `isFinished`. Test: `--status "blocked on vendor"` keeps the item in
      `query --status`; `--status closed` removes it; `--status done` is also finished (alias of closed in reading).
      Replace the three `ACTIONABLE` constants, `CLOSED` and `index.isOpen` with `isFinished` (see FACTS FROM THE PHASE 6 RUN);
      `git grep -n "ACTIONABLE\|CLOSED" src` must return nothing but `workflow.js` afterwards.
- [ ] **Step 4: first write drops the old fields.** Where an item is written back (the one writer in `store.js` —
      `git grep -n "writeFileSync" src/shared/store.js`), delete `stage` and `review_state` from the front matter when
      `status` is a new-list word. Test: read an old-style fixture, `update --note x`, re-read: no `stage`, no
      `review_state`, the word kept.
- [ ] **Step 5: help.** `help.js`: the status paragraph of `update` and `query` lists the words and the free-text rule.
      **Step 6: suite green, commit** "One status word per item; items from earlier builds read as the new words".

### Task 3: the team steps follow the order; the team entry decides the stages

**Files:**
- Modify: `src/shared/lifecycle.js` (every function that sets `stage` or `review_state`: `refineStart`, `refineDone`,
  `requestRefinementReview`, `refinementReview`, `requestDecision`, `decision`, `claim`, `release`, `requestReview`,
  `startReview`, `review`, `closeItem` — list them with `git grep -n "stage\|review_state" src/shared/lifecycle.js`),
  `src/shared/team.js` (`teamsConfig` → `entryOf(team)`; `reviewRules` → `stageList` + counts), `src/shared/workflow.js`
  (+ `canStep`, `next`)
- Test: `.agents/test/shared-team.test.js`, `.agents/test/workflow.test.js`

**Interfaces:**
- Produces: `canStep(step, fm, actor, entry, stage?) → {ok:true} | {refuse:<text from the file's refusals, filled>}`
  (checks the file's `from`, `by`/`not_by`, and that `entry` exists); `next(step, fm, entry, verdict?, stage?) →
  word` (the file's `to`, with `skipped_stage_rule` applied).

- [ ] **Step 1: failing tests.** (a) no entry for the item's team → `--refine-start` refused with the exact
      `team_not_configured` text; (b) `--claim` on `refined` refused with the `wrong_status` text naming `ready`;
      (c) a member's `--refine-start` → `refining`; `--refine-done` → `refined`; the lead's
      `--request-refinement-review` → `refinement review`; `--refinement-review complete` → `ready`; `reject` →
      `refining` with the finding kept in `refinement_reviews`; (d) entry with only `peer`: `--review complete` →
      `review complete`; (e) `--request-review` on an entry with NO review stages → `review complete` directly.
- [ ] **Step 2: RED → implement** `canStep`/`next` from the JSON, and make each lifecycle function: `const c =
      canStep(...); if (c.refuse) reject(c.refuse); fm.status = next(...)`; delete the `stage`/`review_state`
      assignments (keep every other guard — hand-offs, claimer-only close, author never reviews, stale review, wip,
      session rules). `stageOf` and `isReady` become one-line wrappers over `statusOf` or go — trace callers first.
- [ ] **Step 3: GREEN; suite; commit** "Team steps follow the one status order; the team's entry names its review stages".

### Task 4: two verdicts, the review history, the decision wait

**Files:**
- Modify: `src/shared/lifecycle.js` (`review`, `refinementReview`, `requestDecision`, `decision`), `src/shared/update.js`
  (the flag values of `--review`/`--refinement-review`), `src/help.js`
- Test: `.agents/test/shared-team.test.js`, `features/team-flow.feature` (new; both locations)

- [ ] **Step 1: failing tests.** `--review pass` is accepted and recorded as `complete` (the printed line says
      `complete`); `--review changes` → `reject`; `--review approve` → exit 2 naming the two words. A reject at the
      external stage → `in progress`, `reviews` emptied, the finding appended to `review_history` as
      `"<ts> <stage> reject <by> <commit>: <comments>"`; a complete → `review_history` line `complete` and `reviews`
      gains `<by> <commit>`. `--request-decision "<q>"` from `refining` → `awaiting decision` with `decision_from:
      refining`; `--decision "<a>"` → `refining`, `decision_from` removed. A claim of an item in `awaiting decision` is
      refused with the file's text.
- [ ] **Step 2: RED → implement.** **Step 3: BDD** `features/team-flow.feature`: one scenario walking a two-member
      team entry through new → … → closed with the exact commands of the file's steps, and one with a reject at each
      review stage; both locations green. **Step 4: commit** "A review verdict is complete or reject; the decision wait
      is a status".

### Task 5: records

- [ ] COMMANDS.md and `templates/skills/backlog/references/commands.md` regenerated; README "Statuses" section (the
      list, the free-text rule, the two verdicts, where the team's stages come from); CHANGELOG Unreleased; REVIEW.md;
      REVIEW-LOG rows (one per skill use and per `trace_path`). Full suite, BDD both, check, guard → green; commit
      "Docs: the status order and verdicts".

## Report (your final message; under 60 lines)

Commits (hash, one line each); suite before/after; BDD counts both locations; guard; each task done/stopped with
evidence; files touched outside the Files lists and why; candidate removals found (never done); open questions.
