# Contract — shared backlog repository mode (cli-parity run 1)

Branch `team-cli-parity-1`, start commit `d63d6c5` (item 002, line 13). Every job of this run
builds against this document. It is a convenience, never a source of truth: every row cites a
line the reviewer can open, and a row that contradicts its cited source is a defect.

**Citation convention.** `<script>.py:<line>` = the read-only Python reference
`~/git/smoothsdlc-backlog/skill/backlog/scripts/<script>.py` (the oracle for all shared-mode
behavior). `src/<path>:<line>` = this repository at the start commit. `item <NNN>:<line>` =
line `<line>` of `phases/<NNN>-*.md` in the SmoothSDLC/backlog-cli backlog (item 002 = this job).
The push line each job pastes into its item is tagged `<TAG> <sha>` (item 002:40); a job that
needs another module pulls that tag's line first.

## 1. Modes

Two modes, per user, exactly like the Python home record (item 002:45). Resolution order for the
home path: `BACKLOG_HOME` env var, else the home record, else `~/git/smoothsdlc-backlog`
(lib_db.py:48-54).

| Record | Location and content | Source |
|---|---|---|
| Python home record | `$XDG_CONFIG_HOME/smoothsdlc-backlog/home` (`~/.config` when `XDG_CONFIG_HOME` is unset); content = the clone path + one newline | lib_db.py:44; set_home.py:33-35 |
| CLI mode record | `$XDG_CONFIG_HOME/smooth-backlog-cli/mode.json` (same XDG convention, lib_db.py:44); content is exactly one JSON object: `{"mode":"shared"}` or `{"mode":"local"}` (shape fixed by this contract) | item 002:45 |

- `backlog --use-backlog-repo <path>` (global option, placed before the command name).
  1. Validate `<path>` exactly as `ensure_home`: exists (lib_db.py:77-79); top folder of a git
     repository (lib_db.py:91-93); origin `owner/name` equals `SmoothSDLC/smoothsdlc-backlog`,
     case-insensitive (lib_db.py:33, 94-96); branch `main` (lib_db.py:97-100); then
     `git -C <path> pull -q --rebase --autostash` (lib_db.py:101-108).
  2. Write the home record atomically (tmp file + rename) as set_home.py:33-35 does.
  3. Write `mode.json` = `{"mode":"shared"}`.
  4. Exit 0 on success; a failed check exits 2 with the `die()` message on stderr (lib_db.py:38-42).
- `backlog --use-local-repo`: writes only `mode.json` = `{"mode":"local"}`; the home record is
  left untouched.
- No `mode.json` → mode `local`. Local mode (the repo-local `.backlog/` JSON store) is unchanged
  and the 71 existing tests stay green (item 002:45).
- Shared mode writes nothing into the consuming repository: no `.backlog/`, no init, no skill
  refresh — today's local path runs `refreshIntegrations`, and shared mode skips it
  (item 002:45; src/main.js:4, 27).
- In shared mode the CLI resolves the consuming repository's folder
  `<home>/<owner>/<name>` (lib_db.py:138-141) where `<owner>/<name>` is the caller repository's
  origin (lib_db.py:57-63, 121-132); a repository without an origin is refused (lib_db.py:126-129).

## 2. Commands in shared mode

`<item>` is an item number (`seq`) or a slug; with a number, a live item wins over an archived
item of the same number (lib_db.py:514-525).
Every command first updates the backlog clone: `git pull -q --rebase --autostash`
(lib_db.py:101-108). Every change is committed and pushed before the command exits
(lib_db.py:275-309; the per-script commit tails: new_phase.py:174-179, update.py:257-263,
move.py:113-119, archive.py:108-113).
Refusals print `❌ …` to **stdout** and exit 1; `die()` messages go to **stderr** and exit 2
(lib_db.py:38-42). `<command> --help` prints the `src/help.js` text (job 18).
`--db` is a Python-internal flag and is not exposed in shared mode (new_phase.py:30; update.py:91; query.py:277).

| Command | Module (job, tag) | Python oracle | Flags | Refusals (exit 1, stdout) |
|---|---|---|---|---|
| `new` | src/shared/new.js (10, NEW) | new_phase.py | `--name --objective --summary --context --priority <rank> --severity normal\|critical --split-from <item> --body <text> --work-class a,b --review-classes a,b --review-refs <paths> --depends-on <items>\|none --force --dry-run` (new_phase.py:31-54) | missing `--name` :61-63; missing `--depends-on` :65-67; `--review-refs` not covering a review class :72-75; a dependency not in the backlog :81-84; `--split-from` not found :88-92; target file exists without `--force` :106-109 |
| `update` | src/shared/update.js (11, UPDATE) + src/shared/lifecycle.js (15, TEAM) | update.py | `<item>` (omitted only for `--replan`, update.py:90) with SETTABLE values `--status --branch --commit --location --summary --priority --name --objective --seq --size_score` (update.py:22-23), `--append :94`, `--replan :95-96`, `--note :97`; team flags `--claim --force --release --request-review --review --by --comments --close --waiting --waiting-done --set-review-refs` (update.py:98-114, semantics update.py:26-85) | no phase argument :138-141; item not found :143-147; `--branch` :157-160; clearing `--commit` :161-164; uncovered review refs :174-178; more than one team step :184-187; a team step's own refusal :189-193; `--status done` without a passing review :199-204 |
| `query` | src/shared/query.js (12, QUERY) | query.py | read views: `--next --status --critical --phase <item> --events [item] --by-branch <branch> --all --branch <branch> --json` (query.py:277-305); team views `--claimable --reviewable --blocked --classes` (job 16) and `--pop --agent --review-classes --claim-now --roster --scope` (job 20; query.py:287-304) | `--phase <item>` not found :441-443 (exit 1); `--pop` without `--agent` :312 (exit 2); detached HEAD :320 (exit 2); `--claimable`/`--reviewable` without `--classes` :349 (exit 2) |
| `pop` | src/shared/pop.js (20, POP) | query.py `--pop` (query.py:171-252) | `--agent <name>` (required, :297), `--classes`, `--review-classes`, `--claim-now`, `--roster <file>`, `--scope branch\|repo\|all`, `--json` | `--pop` needs `--agent` :312 (exit 2); idle → exit 3 (query.py:73, 252) |
| `next` | src/shared/query.js (12, QUERY) | query.py `--next` (query.py:389-409) | owner view, no team flags | detached HEAD :320 (exit 2); empty queue → `{}` (JSON) or the ℹ️ line, exit 0 :403 |
| `move` | src/shared/move.js (17, MOVE) | move.py | `<item> --to-branch <name>`; `--all-open-of-branch <from> --to-branch <to>`; `<item> --to-repository [owner/name]`; `--note <text>` (move.py:67-73; exit-code doc move.py:10) | item not found :90-93 (1); same repository :101-103 (1); no phase and no `--all-open-of-branch` :88 (2); `--all-open-of-branch` without `--to-branch` :77-78 (2); neither target flag :110 (2) |
| `archive` | src/shared/archive.js (17, MOVE) | archive.py | `<item> --force --dry-run` (archive.py:54-57) | item not found :63-67 (1); status not `done` without `--force` :71-73 (1); file move failed :84-86 (1) |

Success lines mirror the Python stdout (e.g. `✅ created phase … (seq N) — …, now at P<RANK>`
new_phase.py:168-170; `✅ <slug> updated (…)` update.py:243; `📦 <slug> archived -> …`
archive.py:101; `✅ … now belongs to branch '…'` move.py:97).

## 3. Storage

- Layout (lib_db.py:138-151): repo folder `<home>/<owner>/<name>/`; items at
  `phases/NNN-<slug>.md` (:147); archived items at `archive/phases/NNN-<slug>.md` (archive.py:73-74);
  the mirror database at `backlog.db` (:151). `NNN` is the 3-digit `seq`; `<slug>` =
  `NNN-<slugify(name)>` (new_phase.py:19-20, 102-105); `seq` = 1 + the max of the seq values in
  `phases/` and `archive/` and of `MAX(seq)` in `backlog.db` (new_phase.py:23-25).
- Front matter, keys in exactly this written order (order preserved: `yaml.safe_dump(sort_keys=False)`,
  lib_db.py:178-181). Written by new_phase.py:113-126:
  `phase, seq, name, objective, summary, status, severity, priority, repository, branch, commit,
  location, created, updated`, then `work_class`, `review_classes`, `review_refs` only when
  non-empty (new_phase.py:120-124), then always `depends_on, claimed_by, claimed_at,
  review_state, reviewer` (new_phase.py:126).
- `update.py` adds lifecycle keys over time: `review_requested_at` (update.py:50),
  `wait_on`/`wait_since` (update.py:71-72), `completed` (update.py:206-207), plus changes to
  `status`/`claimed_by`/`claimed_at`/`review_state` (update.py:39, 45, 65, 84).
- Records are appended to the item's body (claim line, review block, close block;
  update.py:195; the initial body template new_phase.py:127-136).
- The file is the source of truth; `backlog.db` is a mirror that the read commands query
  (lib_db.py:312-439). Every shared-mode write therefore re-ingests the stack
  (`scan_stack` lib_db.py:409-439; upsert by slug keyed on `sha256` lib_db.py:376-406) and
  commits files and DB together (lib_db.py:275-309).
- Data-integrity findings, same names as Python: a row whose file is gone is `ghost`, an item
  naming another repository than its folder is `foreign`, an item without repository or branch
  is `untagged` (lib_db.py:229-244).
- Priorities are dense ranks `0..M-1` over the folder's `pending`/`in_progress` items of all
  branches, `0` = next (lib_db.py:442-511); adding, moving or completing work re-densifies the
  backlog (new_phase.py:150-156; update.py:233-243; archive.py:88-97).

## 4. Output

Shared-mode `--json` prints exactly the Python reference's JSON — same keys, same nesting,
2-space indent — never wrapped in local mode's `{ok,data}` envelope (src/output.js:33).

| View | Python source | Node producer |
|---|---|---|
| pop action: `{action, item, seq, repository, branch, instruction, claimed, blocked[], held[]}` | query.py:241-246 | src/shared/pop.js (20) |
| `--claimable` / `--reviewable` / `--blocked`: array of `{…row, work_class, review_classes, depends_on, claimed_by, claimed_at, review_state, reviewer, waiting_on}` | query.py:370-372 | src/shared/views.js (16) |
| `--next`: one row dict; `{}` when the queue is empty | query.py:408-409, 403 | src/shared/query.js (12) |
| `--phase <item>`: one row dict | query.py:444 | src/shared/query.js (12) |
| `--status`: `{handoff, repository, branch, phases[], gone_branch_items[], findings{foreign, untagged, ghost}}` | query.py:488-491 | src/shared/query.js (12) |

Human-readable lines mirror the Python message strings and their streams (✅/➡️/📋 on stdout for
success, ❌ on stdout for refusals, ℹ️ on stderr for info and `die()` messages on stderr).
Pop precedence (query.py:171-252): `continue` → `review` (a request older than
`BACKLOG_REVIEW_FIRST_SECONDS`, default 300 s, query.py:189) → `claim` (refused while the agent
holds an active item, lib_db.py:580-588) → `chunk` → `idle` (exit 3, query.py:73, 252).

## 5. Exit codes

| Code | Meaning | Source |
|---|---|---|
| 0 | success; read views; `--dry-run` (nothing committed) | query.py:513; new_phase.py:137-140 |
| 1 | a refusal, message on stdout | new_phase.py:61-109; update.py:138-204; move.py:10 (doc line); archive.py:63-86 |
| 2 | `die()` to stderr: invalid argv, unknown class value, detached HEAD, home not a correct clone | lib_db.py:38-42, 541-548, 200-204, 77-100; query.py:312, 320, 349 |
| 3 | committed locally but not on origin/main (pull or push failed after retries); also pop's `idle` answer | lib_db.py:101-110, 295-308; query.py:73, 252 |
| 4 | home missing where someone can answer: the ASK-THE-USER question is printed, the agent/user decides | lib_db.py:45, 79-84; set_home.py:6 |

## 6. Modules and owners

One writer per file. Tags are the pushed lines each job pastes into its item.

| File | Owner (job, tag) | Exports — mirror source |
|---|---|---|
| `src/shared/safety.js` | job 3 (SAFETY) | `repoIdFromUrl(url)` → `owner/name` or `""` (lib_db.py:57-63); `validateHome(path)` → home path, refusing with the messages of lib_db.py:77-100; `slugify(text)` (new_phase.py:19-20); `itemSelector(text)` → `{number}` \| `{slug}` \| `null` (lib_db.py:514-525); `assertInside(root, path)`; `checkRefs(refs)`; `redact(text)` — strip `user:token@` from URLs in any git stderr; `git(args, cwd)` → `{stdout, stderr, code}` via execFile with an args array and `GIT_TERMINAL_PROMPT=0`, never a shell (pattern lib_db.py:184-189) |
| `src/shared/frontmatter.js` | job 4 (CODEC) | `parse(text)` → `{fm, body}` (lib_db.py:164-171; the YAML subset of job 004 — unknown constructs are a clear error, never a guess); `dump(fm, body)` → text (lib_db.py:178-181: keys in given order, strings as JSON double-quoted, ints plain, block lists, `[]` when empty) |
| `src/shared/store.js` | job 5 (STORE) | `resolveHome()` (lib_db.py:48-54; missing → exit 4 with lib_db.py:79-84; never clones); `getMode()` → `shared`\|`local` (mode.json; absent → `local`); `setMode(mode)`; `folder(home, repoId)` (lib_db.py:138-141); `repoId(cwd)` (lib_db.py:113-131, main working tree, no origin → refuse); `branch(cwd)` (lib_db.py:196-204, detached → refuse); `load(folder)` → items with `path, fm, body, sha` (lib_db.py:409-439); `nextSeq(folder)` (new_phase.py:23-25); `write(item)` atomic (lib_db.py:178-181; src/storage.js:18); `reflow(folder, {slug, target})` (lib_db.py:468-495); `reorder(folder, idents)` (lib_db.py:497-511); `inQueue(item, repo, branch)` (lib_db.py:223-226); `findings(folder)` (lib_db.py:229-244); `now()` (lib_db.py:155-156) |
| `src/args.js`, `src/main.js`, `src/shared/router.js` | job 6 (ROUTER) | args.js: the global options `--use-backlog-repo <path>` / `--use-local-repo` (section 1); in shared mode the local grammar is skipped and the argv after the command goes to the command module unparsed; main.js `run(argv)`: resolve the mode (`getMode`, `BACKLOG_HOME`), shared → `router.run(command, argv)`, local → today's path (src/main.js); shared mode skips init, withStore and refreshIntegrations (src/main.js:4, 27); router.js `run(command, argv)`: the command table of section 2, dynamic import per command; a command whose module is not built yet exits 2 with `not built yet: <command>`; `--help` prints the `src/help.js` text |
| `src/shared/sync.js` | job 8 (SYNC) | `pull(home)` — `git pull -q --rebase --autostash` under the local lock `<home>/.git/smooth-backlog-cli.lock`; on failure `rebase --abort` and exit 3 with the message of lib_db.py:101-110; `commit(home, folder, message)` — `git add -A -- <owner>/<name>`, commit `<owner>/<name>: <message>` when staged, up to 3 rounds of `pull --rebase --autostash` + `push`, `index.lock` retried 5 times, still not pushed → exit 3 (lib_db.py:275-309); after every rebase, a file whose `seq` now collides is renumbered to `nextSeq` (`git mv` + `phase`/`seq` keys + body heading) and the command prints `renumbered NNN -> MMM`; all git stderr passes through `safety.redact` |
| `src/shared/db.js` | job 9 (DB) | `connect(folder)` — the schema of lib_db.py:312-333, migrations of lib_db.py:346-353; `ensureAnchor(db)` (lib_db.py:363-373); `ingest(db, item)` — upsert by slug with sha256 and `ingested`/`reingested` events (lib_db.py:376-406); `scan(db, folder)` (lib_db.py:409-439); `markArchived(db, slug, location)` (archive.py:83-87). Every shared write runs `scan` before `sync.commit`, so `backlog.db` is committed together with the files, as Python does |
| `src/shared/new.js` | job 10 (NEW) | `run(argv)` → exit code. Port of new_phase.py:29-179: flags :31-54, refusals :56-109, front matter :113-126, body :127-137, reflow :150-156, critical banner :162-167, db scan, `sync.commit` with message `new <first two args>` (:178) |
| `src/shared/update.js` | job 11 (UPDATE) | `run(argv)` → exit code. update.py:88-257 without `team_action`; the team flags are parsed here and passed to lifecycle.js with its signature below; until it exists they exit 2 `not built yet` |
| `src/shared/query.js` | job 12 (QUERY) | `run(argv)` → exit code. query.py:275-517 read views and the JSON of section 4; team flags go to views.js (16) and pop.js (20) per this contract, until they exist they exit 2; `--headless` exits 2 `not in this build` |
| `src/shared/team.js` | job 15 (TEAM) | `heldItems(folder, agent)` (lib_db.py:565-579); `claimRefusal(folder, agent)` (lib_db.py:580-588); `undoneDependencies(folder, fm)` (lib_db.py:555-563); `uncoveredReviewClasses(classes, refs)` (lib_db.py:590-593); `loadRoster(path)` (lib_db.py:596-604); `fallbackReview(fm, roster)` (lib_db.py:607-613); `describeDependency(dep)` (lib_db.py:617-621) |
| `src/shared/lifecycle.js` | job 15 (TEAM) | `claim(item, agent, {force})`, `release(item, agent)`, `requestReview(item, reviewer, note)`, `review(item, verdict, {by, comments})`, `waiting(item, by, what)`, `waitingDone(item, by)`, `closeItem(item, by, summary)` — one per `team_action` branch (update.py:26-85). Each returns `{event, text}` or throws `Rejected(message)` with the Python refusal text; the caller writes the front matter and appends the text to the body exactly as update.py:194-210; the close gate (review_classes requires `review_state: passed`) is update.py:76-85 |
| `src/shared/views.js` | job 16 (VIEWS) | `claimable(folder, classes)`, `reviewable(folder, classes, roster)`, `blocked(folder)` (query.py:349-388); `--scope branch\|repo\|all` (query.py:302-304) |
| `src/shared/move.js`, `src/shared/archive.js` | job 17 (MOVE) | `toBranch(folder, item, branch, note)` (move.py:22-29); `toRepository(folder, item, target)` (move.py:32-64); `archiveItem(folder, item, {force})` — git mv under `archive/` preserving history, status stamp (archive.py:22-36, 39-49, 73-87), rescan and reflow (archive.py:88-100) |
| `src/help.js` (help constant in `src/output.js`), `COMMANDS.md` | job 18 (HELP) | `HELP = { <command>: text }`; `--help` of any command prints its text (section 2); `COMMANDS.md` documents the shared-mode surface; the existing JSON convention of src/output.js:33 stays local-mode only |
| `src/shared/pop.js` | job 20 (POP) | `pop(folder, agent, {workClasses, reviewClasses, claimNow, roster, scope})` → the action object of section 4 (query.py:171-252; precedence and the 300 s review-first timer query.py:173-189; claim refusal lib_db.py:580-588); `idle` exits 3 (query.py:73, 252) |

Test files: one shared suite per job (`.agents/test/shared-<area>.test.js`, each job's Files
line). Tests use only local bare repos from `.agents/test/shared-fixtures.js` (job 1), with
`BACKLOG_HOME` and `XDG_CONFIG_HOME` inside the test's temp dir; never the real backlog
repository or `~/.config` (item 002:39).
