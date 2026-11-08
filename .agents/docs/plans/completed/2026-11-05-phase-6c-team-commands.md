# Phase 6c — the `backlog team` hierarchy, the configuration's user and team, the item template

> **For the executing agent (a sub-agent):** REQUIRED SUB-SKILL `superpowers:executing-plans`. Steps use
> checkbox syntax. Work task by task, commit per task, suite green at every commit. Read the whole document first.

> **DECISIONS THIS PHASE DEPENDS ON:** 20261105-J = a, V = a, W (recorded); 20261105-X (team and flow definitions registered
> through the CLI: Task 2) and 20261105-K = a (the item's fields: Task 5) — read
> `<logs>/decisions/20261105.txt` — X and K are DECIDED (2026-11-05): nothing waits. The owner's rule: NO behaviour is removed on your judgement.
> The removals in this phase (`backlog pop`, `backlog work` as separate commands; team flags on the user-command `update`)
> are the OWNER's decisions of 2026-11-05, recorded in that file as RULE lines — do exactly those, nothing more.

**Goal:** the CLI has two kinds of commands. `backlog <command>` knows nothing of teams. `backlog team pop|update|query
--team <name> --agent <name>` is the only place a team exists: it reads the team's configuration entry and enforces the
workflow of Phase 6b. Items without a team get their owner and team from `.backlog/config.json`, written by `setup` from the
git user. Users can see the item template.

**Spec:** the workflow definition `templates/workflows/team.json` (Phase 6b) — its `pop`, `user_commands_on_team_items`,
`user_commands_outside_teams` and `refusals` sections are this phase's requirements; the owner's RULE lines in the
decisions file.

**Architecture:** `src/shared/team-cli.js` is the `team` command: it parses `--team`/`--agent` (defaults: the
environment variables `TEAM_NAME`/`BACKLOG_AGENT` as overrides, else the configuration's `team`/`user`), loads the
entry, and dispatches `pop`, `update <item> <one step>`, `query <view>` to the existing implementations with the entry
in hand. `update.js` loses its team flags (they move, unchanged in behaviour, behind `team update`). `pop.js` and
`work.js` merge into the one role-based `team pop`. `teampop.js` (the lead's work-item claim) becomes the `claim <W>`
branch of the lead's pop order. `query.js` loses `--claimable/--reviewable/--blocked/--plan/--wip/--decisions` to
`team query`. `setup.js` writes `user` and `team`. `new.js` records `owner` for an item without a team.

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

- Behaviours of this phase: a MOVE phase — behaviour moves from one command to another without changing. The proof of
  each move is the SAME test, re-pointed at the new command, plus a new negative test on the old place (the user-command
  `update --claim` is refused with the pointer). Never drop a guard while moving a step (hand-offs, claimer-only close,
  author never reviews, stale review, wip, session rules, the stale-view rejection).
- The machine's live teams run with today's commands until their skills are rewritten (a private item, not yours). To
  keep them running between your commits: the old spellings are accepted for the rest of this branch with a one-line
  notice on stderr `moved: use backlog team update <item> --team <t> --agent <a> --claim` — accepted, not refused —
  EXCEPT where the owner's rule says refused (the user-command `update --status` on a team item, Phase 6b). Record this
  compatibility as a candidate removal in your report; the owner decides when it goes.

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


- FACTS FROM THE PHASE 6b RUN (the status order is live): `src/shared/workflow.js` ships `loadWorkflow`, `STATUSES`, `SIDE`,
  `stageList`, `validateWorkflow`, `statusOf(fm, entry)`, `canStep(step, fm, actor, entry, stage)`, `next(...)`,
  `isFinished`, `isOpen`, `normalise`; the shipped definition is `templates/workflows/team.json` (stages `peer` and
  `external`; `request-review.from` lists in progress, ready for review, ready for external review, review complete).
  A team entry in `teams.json` at the backlog root is `{ lead, members: [..], external_reviewers: [..], review: [{ stage,
  count }] }`; `review: []` means no review stage is enforced; an entry that lists no members lets anyone pass the peer
  stage (a Phase 6b leftover: `validateTeam` of this phase requires at least one member, and says so). A team step on an
  item whose team has no entry is refused ("team <t> is not configured ..."). The test fixture `sharedBacklog`
  (`.agents/test/shared-fixtures.js`) writes a git-EXCLUDED `teams.json` with `review: []` entries for t1, t2, t3, t9 —
  your `team define` commits `teams.json` into the backlog repository, so that fixture must change to register its
  teams through the command (or commit the file) in Task 2, else the excluded file and the committed one fight; every
  team fixture depends on it, so run the whole suite after that change. Old items translate on read (`statusOf`); the
  first write drops `stage` and `review_state` (`store.write`, `LEGACY_KEYS`); `new` still writes `review_state: none`
  for an item outside a team (status `pending`, a free word until the user-command words are decided in a later phase).
  Code deviations from the definition, recorded for the owner, NOT yours to change: a release of a team item that was
  never refined (no `refiner` key) returns it to `new`; verdict synonyms are normalised in the parser.
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
- LESSONS FROM THE PHASE 5 RUN (apply in every task): (23) before reusing a helper the plan names, read its current
  callers. (24) `git ls-remote --exit-code`: 2 = absent ref, 128 = unreachable or missing remote. (25) A behaviour
  change the plan did not call for is reported as a candidate, not implemented. (26) Amend only the command's own
  commit. (27) Never rewrite a test's expectation to match a behaviour the plan did not call for. (28) A mandated skill
  counts as used only when loaded with the Skill tool.

## Global constraints (the owner's words, binding)

- Only `backlog team …` is aware of teams: configuration entry, roles, workflow order, pop order, wip limits,
  hand-off gates, review stages. No user command reads the team configuration. `backlog next` prints the open item
  with the best priority, whole (front matter and body), and skips nothing for team reasons (its hand-off skip moves
  to `team pop`).
- `backlog pop` and `backlog work` do not exist as commands; `backlog team pop --team <t> --agent <a>` is the one
  next-action command, answering by the agent's role in the entry (lead order / member order of the workflow file) and
  marking the step it offers (claim, refine-start, start-review) in one locked write. `--json` keeps the keys of
  today's `work --json` (action, item, seq, repository, branch, instruction, claimed, blocked, held, marked,
  front_matter, body).
- `--team` and `--agent` are required on every `team` command; `TEAM_NAME`/`BACKLOG_AGENT` may stand in (environment
  variables override, never default); the configuration's `team`/`user` are the defaults when neither is given. A
  team not in the configuration → the refusal of the workflow file.
- `.backlog/config.json` gains `user` (git `user.name`, else the logged-in user name) and `team` (empty string) at
  `setup`; a second setup keeps existing values. A `new` without a team records `owner: <user>` (K = a), and
  `last_updated_by` is the user when no agent name is given.
- Team definitions and flow definitions enter the CLI only through `backlog team define` / `backlog team workflow`
  with validated JSON; hand-editing `teams.json` is not a documented path (it keeps working as an ordinary file).
- Public repository rule as always; no roster file (`--roster`, `TEAM_ROSTER`) remains: the entry's `members` is the
  roster. Removing the roster file is the owner's "one configuration for teams" rule — cite it in the report.

## Review focus (tests added to the owning task)

1. The lead's `team pop` on a team whose work item is `new` and has no children → `claim <W>`, item printed whole;
   a member's `team pop` on the same state → `idle` exit 3 (Task 3).
2. `backlog update 3 --claim x` → accepted with the `moved:` notice (compat), identical result to the team command;
   `backlog update 3 --status closed` on a team item → refused (6b) (Task 1).
3. `team query --team t --claimable` without the entry → the not-configured refusal (Task 4).
4. `setup` in a repository whose git has no `user.name` → `user` is the login name; with `user.name` set → that
   name (Task 2).
5. `backlog next` prints the body; an item whose producer hand-off is not accepted is still printed by `next` and is
   skipped by `team pop` (Task 3).

---

### Task 1: `backlog team update` — the team steps move; the user-command `update` points at it

**Files:**
- Create: `src/shared/team-cli.js`, `.agents/test/team-cli.test.js`
- Modify: `src/shared/router.js` (`team: ['./team-cli.js']`), `src/shared/update.js` (the `ACTIONS` list, `ACTS_AS`,
  `REFINEMENT_STEPS` and the step dispatch move to `team-cli.js`; `update` keeps the field edits, `--priority`,
  `--replan`, `--note`, `--append`, `--set-*`, `--restore`, `--section …`), `src/help.js`
- Test: every existing test that runs `update <item> --claim|--release|--request-review|--start-review|--review|--close|
  --waiting|--handoff|--accept-handoff|--reject-handoff|--reassign|--reassign-review|--refine-start|--refine-done|
  --request-refinement-review|--refinement-review|--request-decision|--decision|--wip-override` — list them with
  `git grep -ln -- "--claim\|--request-review\|--review \|--close\|--refine-start" .agents/test features` and re-point
  each at `team update <item> --team <t> --agent <a> <step>` (the `--by` value becomes `--agent`; keep `--by` accepted
  as a synonym).

- [ ] **Step 1: failing tests** in `team-cli.test.js`: `team update 1 --team t --agent a --claim` on a fixture with a
      configured team claims (status in progress, owner a); without `--team` and without defaults → exit 2 naming
      `--team`; `update 1 --claim a` → exit 0, stderr has `moved: use backlog team update`; `team update 1 --team t
      --agent a --status closed` → exit 2 (a team step is one of the ACTIONS, `--status` is not).
- [ ] **Step 2: RED → implement** `team-cli.js`: `run(argv)` → sub-command dispatch; `resolveTeam(a)` (flag, env,
      config), `resolveAgent(a)`; `update` delegates to the step functions of `lifecycle.js` with `{ entry }` passed
      in (Phase 6b's `canStep`/`next` take the entry). Move the step dispatch code from `update.js` (cut, not copy;
      `trace_path` every function you move). Compat shim in `update.js`: when a team flag is present, print the
      `moved:` line and call `team-cli.update` with the agent from `--by`/`--claim`/`BACKLOG_AGENT` and the team from
      the item's `team` field.
- [ ] **Step 3: re-point the tests**, GREEN, suite, commit "Team steps run under backlog team update".

### Task 2: the configuration — `user`, `team`; `backlog team define` and `backlog team workflow` (decision X)

The owner's design: team definitions ORIGINATE in the team lead's skill (a lead composes a team from the machine's
cards for each run), so the CLI receives them as JSON through two commands and keeps them in the backlog repository,
committed and pushed like every change. `teams.json` at the backlog root stays the store of team entries (one object,
keyed by team name); `workflows.json` beside it stores registered flow definitions (keyed by name); the CLI ships the
default flow `team` (Phase 6b). Validation is the point of the commands: a definition with a missing or wrong field is
refused naming the field; a flow that could trap items is refused (Phase 6b `validateWorkflow`).

**Files:**
- Modify: `src/shared/setup.js` (write `user`, `team`), `src/shared/team.js` (`teamsConfig` reads `teams.json` at the
  backlog root as today; `+ defineTeam(home, def)`, `+ validateTeam(def, flow) → string[]`), `src/shared/team-cli.js`
  (`define`, `workflow` sub-commands), `src/shared/workflow.js` (`+ registerWorkflow(home, def)`), `src/shared/new.js`
  (owner default), `src/shared/seen.js` (`actor()` falls back to the configuration's `user`), `src/help.js`
- Test: `.agents/test/shared-setup.test.js`, `.agents/test/shared-team.test.js`, `.agents/test/team-cli.test.js`,
  `features/team-define.feature` (both locations: a definition registered in one checkout is seen by another after its pull)

**Interfaces:**
- `backlog team define --file <path.json> [--json]`: the file is ONE team `{ "name", "lead", "members": [..],
  "external_reviewers": [..], "workflow": "<name>" (default "team"), "review": [{ "stage", "reviewers":
  "members"|"external_reviewers", "count" }] (default: the flow's `team_entry_review_default`), "wip": { "agent", "team" }
  (optional) }`. `validateTeam`: every key above with its type; `members` has at least one name; `name` matches `^[a-z0-9][a-z0-9:_-]*$`; `lead` not in
  `members`; `members` non-empty and distinct; every `review[].stage` is a stage of the named flow; the flow exists
  (registered or shipped). Valid → the entry is written into `teams.json` (replacing an entry of the same name only
  when that team has no open items in this backlog — else refused: `team <name> has <n> open items; register the new
  composition under another name`), committed and pushed through `sync.commit` (message `team <name> defined`); a
  byte-identical definition is a no-op (exit 0, `team <name> unchanged`). Output: `✅ team <name> defined: lead <l>,
  <n> members, flow <w>`.
- `backlog team workflow --file <path.json> [--json]`: the file is one flow definition in the shipped file's shape;
  `validateWorkflow` (6b) must return `[]`; written into `workflows.json` under its `workflow` name; replacing a flow
  that a team with open items uses is refused the same way; identical → no-op. `backlog team workflow --show <name>`
  prints the registered or shipped definition (users can see the flow).
- Refusals print every validation error, one per line, exit 2; nothing is written.

- [ ] **Step 1: failing tests:** `setup` writes `user` from `git config user.name` (fixture sets it) and `team: ""`;
      with no `user.name` → `os.userInfo().username`; a second `setup` keeps a hand-edited `team: "t"`; `new` without a
      team records the owner = user. `team define` with a valid file → `teams.json` gains the entry, a commit exists on
      the backlog, the other checkout sees it after a pull (BDD, both locations); a file missing `lead` → exit 2 naming
      `lead`; a stage not in the flow → exit 2 naming the stage; redefining a team with an open item → refused with the
      count; identical file → unchanged. `team workflow` with the shipped file renamed `team-2` → registered;
      `--show team-2` prints it; a flow with no path to `closed` → exit 2 with the graph message.
- [ ] **Step 2: RED → implement; GREEN; commit** "setup records the user and default team; teams and flows are defined
      through the CLI from JSON".

### Task 3: `backlog team pop` — one next-action command by role; `pop` and `work` fold into it; `next` prints the item

**Files:**
- Modify: `src/shared/team-cli.js` (`pop`), `src/shared/pop.js` (becomes the engine called by `team-cli.pop` — the
  lead order and the member order exactly as the workflow file's `pop` section; the `teampop.js` claim-for-lead
  becomes the lead order's `claim` action; `work.js`'s "mark the step" becomes the engine's default; delete
  `work.js` and `teampop.js` after `trace_path` + `git grep` of every export), `src/shared/router.js` (remove `pop`,
  `work`; `team` → `team-cli.js`), `src/shared/query.js` (`--next` prints front matter and body; remove the hand-off
  skip; `--agent` with `--next` no longer errors — it is simply not an option), `src/help.js`
- Test: `.agents/test/shared-pop.test.js`, `shared-work.test.js`, `shared-teampop.test.js` → re-pointed at
  `team pop --team t --agent a [--json]`; `.agents/test/shared-query.test.js` (`next` body); `features/*.feature`
  steps that run `pop`/`work`/`team pop --team`.

- [ ] **Step 1: failing tests** (review-focus 1 and 5 above, plus: `backlog pop --agent a` → the unknown-command
      error listing the commands; `team pop --team t --agent <lead>` after members closed every slice → `close <W>`
      offered to the lead; a member whose item is `ready for review` → `idle` for that item (a review request ends
      its work) and the next member's pop → `review <I>` marked `reviewing`).
- [ ] **Step 2: RED → implement**; no compat line for the old `pop`/`work` spellings (the owner removed those
      commands). Every commit goes live on this machine at once, and the machine's team skills still spell the old
      commands: do this task LAST in your session and put the exact new spellings in your report, so the lead rewrites
      the two skills immediately after.
- [ ] **Step 3: GREEN; both BDD locations; commit** "One next-action command: backlog team pop; backlog next prints the whole item".

### Task 4: `backlog team query` — the team views move

**Files:**
- Modify: `src/shared/team-cli.js` (`query`), `src/shared/query.js` (remove `--claimable --reviewable --blocked
  --decisions --plan --wip` from the user command; the implementations move to a `teamViews(entry, a)` export the
  team command calls), `src/help.js`
- Test: `.agents/test/shared-query.test.js` → the team views re-pointed; `backlog query --claimable` → exit 2 `use
  backlog team query`.

- [ ] Steps as Task 1 (failing test → move → re-point → green → commit "Team views run under backlog team query").

### Task 5: the item template users can see (decision K = a: rename; read old, write new only)

**Files:**
- Create: `src/shared/fields.js` (the template table: key, shown name, meaning, who sets it, when required),
  `.agents/test/fields.test.js`
- Modify: `src/shared/router.js` (`fields: ['./fields.js']`), `src/shared/new.js` (`--help` prints the template;
  K = a: `--title`/`--summary`/`--description` accepted, `--name`/`--objective`/`--body` kept as synonyms; stored keys
  renamed per K = a with the old keys read forever in `store.load`), `src/shared/views.js` (shown names), `src/help.js`

- [ ] Stored keys renamed: `title` (was `name`), `summary` (several sentences; `new --summary` may contain newlines
      or be given several times), the body is the description (no new key; `backlog query <item>` labels it
      "description"), `owner`/`owned_at` (were `claimed_by`/`claimed_at`), `last_updated`/`last_updated_by` (were
      `updated`/`updated_by`); `objective` stays; `phase` stays the slug key. `store.load` maps old → new on read; EVERY
      write emits the new keys only (same pattern as Phase 6b Task 2 Step 4: an item once written carries no old key).
      The index entry (Phase 6) stores `title`. The `--json` output emits the new keys only; the old `--name`/`--objective`
      flags of `new`/`update` stay accepted as synonyms of `--title`/`--objective`.
- [ ] Failing tests: `backlog fields` prints one line per field with the four columns; `backlog new --help` contains the
      same table; an old item (`name`, `claimed_by`) reads with `title`/`owner`; `query --json` emits the new keys.
- [ ] RED → implement → GREEN → commit "The item template is visible: backlog fields".

### Task 6: help, README, docs, skill — the two kinds of commands

- [ ] README: a section "Commands for people, commands for teams" — the user set, the `team` set, what the team entry
      controls, where it lives (X), the status order (6b), the template (K). COMMANDS.md and the skill copy regenerated.
      CHANGELOG Unreleased; REVIEW.md; REVIEW-LOG rows. Full suite, BDD both, check, guard → green; commit "Docs: the
      two kinds of commands".

## Report (your final message; under 60 lines)

Commits; suite before/after; BDD both locations; guard; each task done/stopped (decision waits named); files touched
outside the Files lists and why; the exact new command spellings the machine's team skills must switch to; candidate
removals (the compat shim); open questions.
