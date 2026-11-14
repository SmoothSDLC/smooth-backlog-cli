# Phase 7 — Every 1.x command name works: the aliases (part A: the direct ones)

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** Phase 6 is committed (`git log --oneline` shows "The item files are the only data: no database"). Otherwise
> stop and report.

> **DECISIONS THIS PHASE DEPENDS ON (all recorded, none open):** 20261105-H = a, I = remove (`init backup` is NOT a
> command: the unknown-command error), J = a, V = a, K = a with Z = a (owner = the agent working on the item; team field
> names the team), L = a, M = a, N = a, P = a, Y = b (see the alias table), X (team definitions through `team define`).
> The decision table of [2026-11-04-pr3-simplification-log.md](../2026-11-04-pr3-simplification-log.md) is the record. Nothing in this phase waits for a decision; a plan step that seems to need one
> is executed as written and the doubt is reported at the end.

**Goal (owner's decision 1, 2026-11-04, binding):** "keep all the commands and if there are any duplicate
functionalities make them aliases, and make sure that the help text and README and everything else is updated to
reflect all of these changes." Every command name and argument form of the 1.x CLI is accepted again and runs the
equivalent of the one command set; the help, COMMANDS.md, README and the skill list every alias and what it runs.
This part covers the aliases that translate to ONE existing command; part B (phase-7b) covers the ones that need a
body-section editor, the multi-item ones (`import`, `archive done`) and the self-update.

**Architecture:** `src/main.js` routes `argv[0]` to `setup` or to `src/shared/router.js` (`TABLE`: new, update,
query, list → query, pop, work, team, next, move, archive). The 1.x grammar (from the branch tip `fe40b5a`,
`src/args.js` and the help constant of `src/output.js` — read them with `git show fe40b5a:src/args.js` and
`git show fe40b5a:src/output.js`) was: `init [name] | init clean|backup [name]`, `list [new|open|done|archive|branch]
[--branch name]`, `new <name> [JSON] --description --ac --state --priority --item-state-description --work_item_id
--tasks --outcomes --evidence --references`, `set <item> <property> <value> [--force]`, `add <item> <list> <entry>
[--top]`, `replace <item> <list> <JSON-array>`, `remove <item> <list> <n>`, `priority <item> [position]`,
`priority <item> <list> <n> <position>`, `done <item>` and `<item> done` (item-first order for every item command),
`move <item> <branch>`, `import --branch <source> [--higher]`, `archive <item|done>`, `branch`,
`update [check|auto|off|disable|<version>]` (self-update), global `--json --ask --help --version --branch`.
The new CLI's item fields: front matter `name, objective, summary, status (pending|in_progress|done|archived),
priority, branch, commit, location, seq, size_score, severity, team, …` and a markdown body with `## …` sections
(`new --body`, `update --append`).

**Tech stack:** Node 24 (`node`), ESM, `node:test`, git. No new dependency.

**Spec:** the owner's decision above; this document's alias table (Global constraints).


## FACTS FROM THE PHASE 6c RUN (read before planning the tasks below)

- The command set is `new, update, query, list, team, next, fields, move, archive, setup`; `backlog team` has
  `pop|update|query|define|workflow` (`src/shared/team-cli.js`, `team-pop.js`); `pop.js` is the engine behind `team pop`
  and `team query --plan`; `work.js`/`teampop.js` are gone. `team.teamName()` is `TEAM_NAME` else the `--team` of the
  running team command (`setSessionTeam`). User-command `update` still accepts the team flags and prints
  `moved: use backlog team update <item> --team <t> --agent <a> --<flag>` on stderr (the shim); the test fixture `cli()`
  strips that line unless `opts.notices`.
- CARRIED FROM 6c (do here, each its own task, in this order): (1) the engine instruction texts (pop.js, lifecycle.js,
  team.js, views.js: every string that says `backlog update <item> --<step> --by <agent>` or `--claim <agent>`) name the
  team spelling `backlog team update <item> --team <team> --agent <agent> --<step>`; `team-pop.js` lines 89-90 replace
  the same texts; tests that pin them (`shared-team-plan.test.js` and others) follow. (2) the roster file: `--roster`,
  `TEAM_ROSTER` and `loadRoster` leave `pop.js`/`team.js`/`query.js`; the entry's `members` is the roster (a topology item
  is done: the skills pass no roster). The roster's one behaviour, a `review_only` profile (such a member never claims and
  is never planned a claim, pop.js lines ~76 and ~302), is KEPT: the team definition gains an optional `review_only`
  list (names within members; `validateTeam`, `teamEntry` store it; `team define` accepts it) and the two places read the
  entry instead of the roster; a test per place. `team pop --dry-run` (live since the lead's fix after 6c: answers only,
  nothing claimed or marked) stays. (3) the stored-key rename of decision K = a: title (was name), summary, description (was body), last updated
  (was updated), last updated by (was updated_by), owner (was claimed_by; decision Z = a: the owner is the agent
  working on the item, the one field for the holder and for the configured user an item outside a team belongs to;
  the team field names the team; no agent/actor field) — old keys read forever, writes emit only new keys, `fields.js`
  table follows (the row shown as "holder" becomes owner). (4) the `moved:` shim is
  removed only when the owner says so (candidate, not a task).
- Decision Y (first-release `query --pop` / `next --agent`) is decided before this phase starts; its answer sets the
  alias rows for those two spellings.

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
## Global constraints — the alias table (binding; part A rows are implemented here, part B rows in phase-7b)

One translation layer, `src/shared/aliases.js`, exporting `translate(argv) → { command, argv } | null` (pure: no I/O)
and `ALIASES` (the table below as data, used by the help). `src/main.js` calls `translate` before the router; a
`null` result means "not an alias, route as today". Item-first order (`backlog 3 done`, `backlog 3 set name x`) is
part of `translate`: when `argv[0]` is an item (digits or `NNN-slug`) and `argv[1]` is an alias verb, swap them.
The 1.x global `--ask` is accepted and ignored everywhere (it meant "confirm interactively"); `--json` passes through.

| 1.x form | runs | part |
|---|---|---|
| `init [name]` | `setup` (the items are kept; the skill copies are refreshed) | A |
| `init backup [name]` | REMOVED by the owner (20261105-I): not a command; the unknown-command error lists the commands | A |
| `init clean [name]` | a KEPT command with its first-release meaning (owner 20261105-H = a with a confirmation): it asks on standard input `This will destroy all configuration and current backlog items for <repository> / <branch>. Type yes to continue:` and proceeds only on `yes` (anything else, or no terminal: refused, nothing changed); then every item of this repository's backlog is removed (archive included), the configuration rewritten, the skill copies refreshed, as one published change `backlog: init clean`; it prints how many items it removed. The items stay in git history. | A |
| `list` | `query` | A (exists) |
| `list new` / `list open` / `list done` / `list archive` | `query` with the listing filtered to status `pending` and never started / `pending`+`in_progress` / `done` / `archived` — a new `query` option `--only <new\|open\|done\|archive>` does the filter | A |
| `list branch`, `branch` | `query --all --json` summarised as `branch  open  done` counts, one line per branch — a new `query --branches` view | A |
| `list --branch X` | `query --branch X` | A |
| `new <name> [--description D] [--state S] [--priority P]` | `new --name <name> --objective D [--status S'] [--priority P]` where S' maps new→pending, open→in_progress, done→done; `--summary` is required by `new` today: the alias passes `--summary <name>` when none is given | A |
| `new … --ac A --item-state-description T --work_item_id W --tasks/--outcomes/--evidence/--references J` | the same `new` plus `--body` holding one `## <Field>` section per given field (`## Definition of done` for `--ac`; a JSON array becomes `- ` lines) | B |
| `set <item> name\|description\|state\|priority\|summary\|branch\|commit\|location <value>` | `update <item> --name\|--objective\|--status (mapped)\|--priority\|--summary\|--branch\|--commit\|--location <value>` | A |
| `set <item> ac\|tasks\|outcomes\|evidence\|references <value> [--force]` | `update <item> --section "<Field>" --set-lines <value>` (part B's section editor; `--force` accepted and ignored) | B |
| `add <item> <list> <entry> [--top]` | `update <item> --section "<List>" --add-line <entry> [--top]` | B |
| `replace <item> <list> <JSON-array>` | `update <item> --section "<List>" --set-lines <JSON-array>` | B |
| `remove <item> <list> <n>` | `update <item> --section "<List>" --remove-line <n>` | B |
| `priority <item> <position>` | `update <item> --priority <position>` | A |
| `priority <item>` | `query --phase <item>` (the item, its priority included) | A |
| `priority <item> <list> <n> <position>` | `update <item> --section "<List>" --move-line <n>:<position>` | B |
| `done <item>`, `<item> done` | `update <item> --status done` | A |
| `move <item> <branch>` | `move <item> --to-branch <branch>` | A |
| `import --branch <source> [--higher]` | for every open item of `<source>` (oldest first): `move <item> --to-branch <current>`, then with `--higher` `update <item> --priority 0` in reverse order | B |
| `archive done` | `archive <item>` for every item of the current branch with status done, oldest first | B |
| `update`, `update check\|auto\|off\|disable\|<version>` | the CLI self-update, restored as `backlog upgrade [check\|auto\|off\|disable\|<version>]` (the item command `update <item> …` keeps the name `update`; `backlog update` with no item and one of those words, or no argument at all, runs `upgrade`) | B |
| `query --pop --agent <a> [--claim-now] [--lead] [--roster] [--scope]` | DECIDED 20261105-Y = b (lead, under the owner's 2026-11-06 instruction to take the recommendations): refused, exit 2, `--pop is a team command: use backlog team pop --team <team> --agent <name> (--dry-run only answers)` — a user command never reads the team configuration | A |
| `next --agent <a>` | DECIDED 20261105-Y = b: refused, exit 2, the same pointer as `query --pop` (6c's accept-and-ignore goes) | A |
| `--headless`, `BACKLOG_HEADLESS=1` | accepted and ignored on every command (the first release documented them as "record the next step without asking"; no command asks anything now) | A |
| `help`, `version`, `--help`, `--version` | as today | A (exists) |

Section names for the body editor: `ac` → `## Definition of done`; `tasks` → `## Tasks`; `outcomes` → `## Outcomes`;
`evidence` → `## Evidence`; `references` → `## References`; `item-state-description` → `## State`; `work_item_id` →
`## Work item`.

## Review focus

1. `backlog update` today means the item command; the alias layer must never turn `update 3 --status done` into the
   self-update (part B) — part A only has to leave `update` alone. Pinned by the existing update tests.
0. NOTHING IS REMOVED in this phase or the following ones without the owner's written decision: an alias adds a way
   in; a behaviour you believe is dead is reported, never deleted.
2. `list open` and friends must filter the SAME listing `query` prints (dense priorities, the branch's items), not a
   second code path. Pinned by Task 2 step 1.
3. Item-first order must not swallow a numeric first argument of a command that takes none (`backlog 3` alone is not
   a command: refuse as today). Pinned by Task 1 step 1.
4. `init` on a repository that already has a backlog must change nothing but the skill copies. Pinned by Task 1.
5. Every alias's `--help` prints the alias line ("`<1.x form>` runs `<command>`") followed by the target command's
   help. Pinned by Task 3.

---

### Task 1: `translate` — the pure table, with its unit test and the item-first order

**Files:**
- Create: `src/shared/aliases.js` (`translate`, `ALIASES`, `statusOf1x`)
- Modify: `src/main.js` (call `translate(argv)` before the setup/router dispatch; `init …` → `setup`; `init clean` →
  the refusal)
- Test: `.agents/test/aliases.test.js` (new; unit tests of `translate` — pure, no fixture needed), `features/aliases.feature`
  (new; CLI scenarios, Task 2)

The first review round removed `query --pop`, `next --agent`, `--headless` and `BACKLOG_HEADLESS` as exact duplicates
or dead options; the owner's decision 20261104-A ("keep all the commands") restores them here as aliases. Nothing is
removed in this phase, and nothing user-facing is removed in any later phase without the owner's written decision.

- [ ] **Step 1: failing unit tests** (`.agents/test/aliases.test.js`):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../../src/shared/aliases.js';
const t = (inp, out) => assert.deepEqual(translate(inp), out, inp.join(' '));
test('the direct aliases translate to one command', () => {
  t(['init'], { command: 'setup', argv: [] });
  t(['init', 'backup', 'demo'], { command: 'setup', argv: [] });
  t(['list', 'open'], { command: 'query', argv: ['--only', 'open'] });
  t(['list', 'done', '--branch', 'feature'], { command: 'query', argv: ['--only', 'done', '--branch', 'feature'] });
  t(['list', 'branch'], { command: 'query', argv: ['--branches'] });
  t(['branch'], { command: 'query', argv: ['--branches'] });
  t(['new', 'Fix login', '--description', 'users land right', '--state', 'open', '--priority', '0'], { command: 'new', argv: ['--name', 'Fix login', '--objective', 'users land right', '--summary', 'Fix login', '--status', 'in_progress', '--priority', '0'] });
  t(['set', '3', 'name', 'Better name'], { command: 'update', argv: ['3', '--name', 'Better name'] });
  t(['set', '3', 'description', 'why'], { command: 'update', argv: ['3', '--objective', 'why'] });
  t(['set', '3', 'state', 'done'], { command: 'update', argv: ['3', '--status', 'done'] });
  t(['priority', '3', '0'], { command: 'update', argv: ['3', '--priority', '0'] });
  t(['priority', '3'], { command: 'query', argv: ['--phase', '3'] });
  t(['done', '3'], { command: 'update', argv: ['3', '--status', 'done'] });
  t(['3', 'done'], { command: 'update', argv: ['3', '--status', 'done'] });
  t(['003-fix-login', 'set', 'name', 'x'], { command: 'update', argv: ['003-fix-login', '--name', 'x'] });
  t(['move', '3', 'release'], { command: 'move', argv: ['3', '--to-branch', 'release'] });
  t(['--json', 'list', 'open'], { command: 'query', argv: ['--json', '--only', 'open'] });
  t(['list', 'open', '--ask'], { command: 'query', argv: ['--only', 'open'] }); // --ask is accepted and dropped
  t(['query', '--pop', '--agent', 'ada', '--claim-now'], { command: 'pop', argv: ['--agent', 'ada', '--claim-now'] });
  t(['next', '--agent', 'ada'], { command: 'pop', argv: ['--agent', 'ada'] });
  t(['query', '--headless', '--status'], { command: 'query', argv: ['--status'] }); // --headless is accepted and dropped
  t(['init', 'clean'], { command: 'init-clean', argv: [] });
});
test('what is not an alias is left to the router', () => {
  for (const argv of [['query'], ['update', '3', '--status', 'done'], ['new', '--name', 'x'], ['pop', '--agent', 'a'], ['3'], ['frobnicate']]) assert.equal(translate(argv), null, argv.join(' '));
});
test('BACKLOG_HEADLESS is accepted and has no effect', () => {
  // run through the CLI in the shared fixture of shared-query.test.js instead: `BACKLOG_HEADLESS=1 backlog query` exits 0
  // and prints the queue; put that assertion there, not here (translate sees argv only).
  assert.equal(translate(['query']), null);
});
```
- [ ] **Step 2: RED (module missing) → implement `translate` as a table-driven function; `main.js`: `const alias = translate(argv); if (alias) { argv = [alias.command, ...alias.argv] }` then the existing dispatch, with `init-clean` dispatched to a new `src/shared/clean.js` (pull, remove every item file of the folder — phases and archive —, write the configuration, refresh the skill copies, record the event on nothing (no item is left), commit and push `backlog: init clean` through `sync.commit`, print `✅ <n> items removed; the backlog of this repository is empty`); `BACKLOG_HEADLESS` is ignored by never reading it. → GREEN.**
- [ ] **Step 3: `query --only` and `query --branches`** — in `src/shared/query.js`: `--only <new|open|done|archive>` filters
      the rows of the default listing (`new` = status pending and no `claimed_by`/no in-progress history — decide: pending
      and never `in_progress`: use `status === 'pending'`; `open` = pending or in_progress; `done`; `archive` = archived);
      `--branches` prints one line per branch of `--all`: `<branch>  open <n>  done <n>` (json: `[{branch, open, done}]`).
      Test first in `.agents/test/shared-query.test.js` (fixture `build(true)`: four items, 003 in progress, 004 done):
      `query --only done --json` → seqs `[4]`; `query --only open --json` → `[1, 2, 3]`; `--branches --json` → one entry
      for `main` with `open: 3, done: 1`. RED → GREEN.
- [ ] **Step 4: full suite, BDD both, check, guard; ponytail-review; commit**
      `bash <logs>/commit.sh "The 1.x command names are back as aliases of the one command set

init, init backup, init clean, list new|open|done|archive|branch, branch, new <name> --description --state, set,
priority, done (and the item-first order), move <item> <branch>, query --pop, next --agent, --headless and the global
--ask run the equivalent command or are accepted as before. query gains --only and --branches for the list filters."`

### Task 2: the scenarios — `features/aliases.feature`

- [ ] Write (both locations run it) and make GREEN — any RED here is a defect of Task 1, fix there:
```gherkin
Feature: Aliases - every command name of the first release still works and runs the one command set
  Background:
    Given a repository with a backlog

  Scenario: init sets the repository up and keeps the items
    Given an item "Kept" exists
    When I run `backlog init`
    Then the command succeeds
    And the queue is 1

  Scenario: a 1.x new creates an item
    When I run `backlog new "Fix the login" --description "users land on their page" --state open`
    Then the command succeeds
    And item 1 has name "Fix the login"
    And item 1 has objective "users land on their page"
    And item 1 has status "in_progress"

  Scenario: set, priority and done change the item
    Given an item "One" exists
    And an item "Two" exists
    When I run `backlog set 2 name "Two renamed"`
    Then item 2 has name "Two renamed"
    When I run `backlog priority 2 0`
    Then the queue is 2, 1
    When I run `backlog 2 done`
    Then item 2 has status "done"

  Scenario: list filters the queue
    Given an item "Open one" exists
    And an item "Done one" exists
    And I run `backlog done 2`
    When I run `backlog list done`
    Then the command succeeds
    And the output contains "002-done-one"
    And the output does not contain "001-open-one"
    When I run `backlog list open`
    Then the output contains "001-open-one"
    And the output does not contain "002-done-one"

  Scenario: branch lists the branches with counts
    Given an item "On main" exists
    When I run `backlog branch`
    Then the command succeeds
    And the output contains "main"

  Scenario: move with a positional branch
    Given an item "Mover" exists
    And a branch "release" exists on the origin
    When I run `backlog move 1 release`
    Then the command succeeds
    And the queue is empty

  Scenario: init clean empties this repository's backlog as one published change
    Given an item "Gone" exists
    And an item "Gone too" exists
    When I run `backlog init clean`
    Then the command succeeds
    And the output contains "2 items removed"
    And the queue is empty
    And the backlog repository has no uncommitted or unpushed change
```
- [ ] Full suite, BDD both, check, guard; commit
      `bash <logs>/commit.sh "Scenarios for the command aliases"`

### Task 3: help, COMMANDS.md, README, skill

- [ ] `src/help.js`: `USAGE` gets a section "Aliases (the command names of the first release)" generated from `ALIASES`
      (one line each: `backlog <1.x form>` → `runs <command …>`); `<alias> --help` prints that alias's line and then the
      target command's help (router `HELP_OF` or `main.js`); the `query` help documents `--only` and `--branches`.
      `.agents/test/shared-help.test.js`: every row of `ALIASES` appears in `USAGE`; `backlog done --help` output starts
      with the alias line and contains the `update` help. Regenerate COMMANDS.md (and add an "## Aliases" section
      before "## Commands" with the same table), copy to the skill references; README "Command reference" gets the
      alias table; SKILL.md one paragraph: "the first release's command names still work: …". CHANGELOG bullet
      replaces the "Removed: init, set, …" sentence with "every first-release command name still works as an alias
      (see Aliases)".
- [ ] `shared-help.test.js`, `skill-commands.test.js`, `shared-no-classes.test.js`, guard → green; full suite, BDD both;
      commit `bash <logs>/commit.sh "Help, COMMANDS.md, README and the skill list every alias"`.
- [ ] REVIEW-LOG.md rows; REVIEW.md section 4: the 1.x commands are aliases now (decision 1 fulfilled; part B lists what
      is still to come). Commit `bash <logs>/commit.sh "REVIEW-LOG: the alias round"`.
- [ ] Report to the lead: commits, evidence, plan defects, any 1.x form you found in the old help that the table misses.

### Task 4: the engine's words — every instruction names the team spelling

- [ ] `.agents/test/shared-team-plan.test.js` and the other tests that pin instruction texts: change the pinned texts to the
      team spelling first (RED), e.g. `start the review: backlog team update <item> --team t1 --agent ann --start-review; then`.
- [ ] `src/shared/pop.js`, `lifecycle.js`, `team.js`, `views.js`: every string that tells an agent to run
      `backlog update <item> --<step> --by <agent>` or `--claim <agent>` now says
      `backlog team update <item> --team <team> --agent <agent> --<step>` (the team is `team.teamName()`, the agent the one
      the text addresses; a placeholder `<you>`/`<lead>` stays a placeholder). Notes that are not team steps (`--append`,
      `--note`, `--summary` on a user item) keep the user-command spelling. `src/shared/team-pop.js` lines ~89-90 replace the
      new texts. `grep -n "backlog update" src/shared/*.js` afterwards shows only user-item spellings.
- [ ] GREEN; full suite, BDD both, check, guard; commit `bash <logs>/commit.sh "Every instruction the engine gives names the team spelling of the step"`.

### Task 5: the roster file leaves; `review_only` lives in the team entry

- [ ] `src/shared/team.js` `validateTeam`/`teamEntry`: optional `review_only` (a list of names, each one of `members`;
      `review_only: must be a list of member names`); stored in the entry. Test in `team-cli.test.js` (define with it,
      define with a stranger's name refused).
- [ ] `src/shared/pop.js` ~line 76 (`noClaim`) and ~302 (`canClaim` in the plan): read `teamsConfig()[team.teamName()]?.review_only`
      instead of the roster; tests `shared-team-pop.test.js` ("a roster member with review_only never claims") and
      `shared-team-plan.test.js` move the profile into the fixture's `teams.json` entry (RED → GREEN).
- [ ] Remove `--roster`/`TEAM_ROSTER`/`loadRoster` from `pop.js`, `query.js`, `team.js`, `team-pop.js` (`VALUE` lists),
      help, COMMANDS.md, README, SKILL.md; a passed `--roster` is `unrecognized arguments` (exit 2) like any unknown flag;
      the tests that passed it drop it. Full suite, BDD both, check, guard; commit
      `bash <logs>/commit.sh "The team entry is the roster: review_only is part of the team definition, and the roster file is gone"`.

### Task 6: the stored keys of decision K = a (with Z = a)

- [ ] `src/shared/store.js`: a `RENAMED_KEYS` table `{ name: 'title', body: null, updated: 'last_updated', updated_by: 'last_updated_by', claimed_by: 'owner' }`
      (the body is the free text, not a key: `description` is the word `new --description` and `fields` show for it).
      READ: `store.load`/the front-matter parser translate an old key to the new one when the new one is absent (an item
      carrying both keeps the new one). WRITE: `store.write` emits only the new keys. The index (`index.js` entries
      `{seq, slug, name, status}`): `name` stays the index's own word (the index is not an item file; its key is unchanged).
      `summary` keeps its key. `new.js` writes `owner` for the holder at a claim and for the configured user outside a team
      (the one field, decision Z = a); `claimed_at` becomes `owned_since`; `release` clears `owner`.
- [ ] Every `src` read of `fm.name`, `fm.updated`, `fm.updated_by`, `fm.claimed_by`, `fm.claimed_at` goes through the new
      key (grep: ~77 uses of claimed_by); every test and scenario that reads or writes an item file follows (29 files);
      `fields.js` rows: `title`, `last_updated`, `last_updated_by`, `owner`, `owned_since` with the shown words unchanged.
      Translation test (`shared-store.test.js`): an item written with the old keys reads as the new ones; its first write
      carries only the new keys; the shared backlog fixture items (old keys) keep working in every existing test.
- [ ] Full suite, BDD both, check, guard; commit `bash <logs>/commit.sh "The item fields carry the owner's words: title, last updated, last updated by, owner and owned since; old keys read forever"`.
      REVIEW-LOG rows for Tasks 4-6; report.
