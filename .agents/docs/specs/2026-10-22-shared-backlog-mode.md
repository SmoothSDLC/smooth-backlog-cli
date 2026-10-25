# Contract — shared backlog repository mode (cli-parity run 1)

Branch `team-cli-parity-1`, start commit `d63d6c5` (item 002, line 13). Every job of this run
builds against this document. It is a convenience, never a source of truth: every row cites a
line the reviewer can open, and a row that contradicts its cited source is a defect.

**Citation convention.** `<script>.py:<line>` = the read-only Python reference
`~/git/smoothsdlc-backlog/skill/backlog/scripts/<script>.py` (the oracle for all shared-mode
behavior; the scripts at commit `ec5b254e`). `src/<path>:<line>` = this repository at the start
commit. `item <NNN>:<line>` = line `<line>` of `phases/<NNN>-*.md` in the SmoothSDLC/backlog-cli
backlog (item 002 = this job). The push line each job pastes into its item is tagged `<TAG> <sha>`
(item 002:41); a job that needs another module pulls that tag's line first.

## 1. Modes

Two modes, per user, exactly like the Python home record (item 002:46). Resolution order for the
home path: `BACKLOG_HOME` env var, else the home record, else `~/git/smoothsdlc-backlog`
(lib_db.py:49-55).

| Record | Location and content | Source |
|---|---|---|
| Python home record | `$XDG_CONFIG_HOME/smoothsdlc-backlog/home` (`~/.config` when `XDG_CONFIG_HOME` is unset); content = the clone path + one newline | lib_db.py:45; set_home.py:33-35 |
| CLI mode record | `$XDG_CONFIG_HOME/smooth-backlog-cli/mode.json` (same XDG convention, lib_db.py:45); content is exactly one JSON object: `{"mode":"shared"}` or `{"mode":"local"}` (shape fixed by this contract) | item 002:46 |

- `backlog --use-backlog-repo <path>` (global option, placed before the command name).
  1. Validate `<path>` exactly as `ensure_home`: exists (lib_db.py:77-80); top folder of a git
     repository (lib_db.py:92-94); origin `owner/name` equals `SmoothSDLC/smoothsdlc-backlog`,
     case-insensitive (lib_db.py:34, 95-97); branch `main` (lib_db.py:98-100); then
     `git -C <path> pull -q --rebase --autostash` (lib_db.py:101-109).
  2. Write the home record atomically (tmp file + rename) as set_home.py:33-35 does.
  3. Write `mode.json` = `{"mode":"shared"}`.
  4. Exit 0 on success; a failed check exits 2 with the `die()` message on stderr (lib_db.py:39-42).
- `backlog --use-local-repo`: writes only `mode.json` = `{"mode":"local"}`; the home record is
  left untouched.
- No `mode.json` → mode `local`. Local mode (the repo-local `.backlog/` JSON store) is unchanged
  and the 71 existing tests stay green (item 002:46).
- Shared mode writes nothing into the consuming repository: no `.backlog/`, no init, no skill
  refresh — today's local path runs `refreshIntegrations`, and shared mode skips it
  (item 002:46; src/main.js:4, 27).
- In shared mode the CLI resolves the consuming repository's folder
  `<home>/<owner>/<name>` (lib_db.py:142-144) where `<owner>/<name>` is the caller repository's
  origin (lib_db.py:58-64, 122-135); a repository without an origin is refused (lib_db.py:132-134).

## 2. Commands in shared mode

`<item>` is an item number (`seq`) or a slug; with a number, a live item wins over an archived
item of the same number (lib_db.py:587-595).
Every command first updates the backlog clone: `git pull -q --rebase --autostash`
(lib_db.py:101-109). Every change is committed and pushed before the command exits
(lib_db.py:348-381; the per-script commit tails: new_phase.py:187-192, update.py:327-332,
move.py:113-118, archive.py:112-117).
Refusals print `❌ …` to **stdout** and exit 1; `die()` messages go to **stderr** and exit 2
(lib_db.py:39-42). `<command> --help` prints the `src/help.js` text (job 18).
`--db` is a Python-internal flag and is not exposed in shared mode (new_phase.py:30; update.py:110; query.py:363).

| Command | Module (job, tag) | Python oracle | Flags | Refusals (exit 1, stdout) |
|---|---|---|---|---|
| `new` | src/shared/new.js (10, NEW) | new_phase.py | `--name --objective --summary --context --priority <rank> --severity normal\|critical --split-from <item> --body <text> --work-class a,b --review-classes a,b --review-refs <paths> --depends-on <items>\|none --estimate <minutes> --complexity --layer --force --dry-run` (new_phase.py:31-58) | missing `--name` :65-67; missing `--depends-on` :69-71; `--review-refs` not covering a review class :76-79; `--body` without a definition of done in team mode :81-85; a dependency not in the backlog :90-93; `--split-from` not found :98-101; target file exists without `--force` :115-118 |
| `update` | src/shared/update.js (11, UPDATE) + src/shared/lifecycle.js (15, TEAM) | update.py | `<item>` (omitted only for `--replan`, update.py:109) with SETTABLE values `--status --branch --commit --location --summary --priority --name --objective --seq --size_score` (update.py:23-24), `--append :113`, `--replan :114-115`, `--note :116`; team flags `--claim --force --release --request-review --start-review --review --by --comments --close --waiting --waiting-done --set-review-refs --set-work-class --set-review-classes --set-depends-on --set-estimate --set-complexity --set-layer` (update.py:117-140, semantics update.py:27-104) | no phase argument :165-168; item not found :171-174; `--branch` :184-187; clearing `--commit` :188-191; `--set-estimate` not > 0 :207-210; `--set-depends-on` item missing :215-219; uncovered review refs :225-230; more than one team step :236-239; a team step outside the team scope :241-245; an incomplete item worked by the team :247-255; a team step's own refusal :258-261; `--status done` without a passing review :267-272 |
| `query` | src/shared/query.js (12, QUERY) | query.py | read views: `--next --status --critical --phase <item> --events [item] --by-branch <branch> --all --branch <branch> --json` (query.py:364-372); team views `--claimable --reviewable --blocked --classes` (job 16, query.py:373-380) and `--pop --agent --review-classes --claim-now --roster --scope` (job 20, query.py:381-396) | `--phase <item>` not found :546-549 (exit 1); `--pop` without `--agent` :403-404 (exit 2); detached HEAD :416-417 (exit 2); `--claimable`/`--reviewable` without `--classes` :450-451 (exit 2) |
| `pop` | src/shared/pop.js (20, POP) | query.py `--pop` (query.py:170-263) | `--agent <name>` (required, :383), `--classes`, `--review-classes`, `--claim-now`, `--roster <file>`, `--scope branch\|repo\|all`, `--json` | `--pop` needs `--agent` :403-404 (exit 2); idle → exit 3 (query.py:73, 263) |
| `next` | src/shared/query.js (12, QUERY) | query.py `--next` (query.py:496-542) | owner view, no team flags | detached HEAD :416-417 (exit 2); empty queue → `{}` (JSON) or the ℹ️ line, exit 0 :508-512 |
| `move` | src/shared/move.js (17, MOVE) | move.py | `<item> --to-branch <name>`; `--all-open-of-branch <from> --to-branch <to>`; `<item> --to-repository [owner/name]`; `--note <text>` (move.py:69-73; exit-code doc move.py:10) | item not found :90-92 (1); same repository :101-103 (1); no phase and no `--all-open-of-branch` :87-88 (2); `--all-open-of-branch` without `--to-branch` :77-78 (2); neither target flag :110 (2) |
| `archive` | src/shared/archive.js (17, MOVE) | archive.py | `<item> --force --dry-run` (archive.py:54-57) | item not found :63-66 (1); status not `done` without `--force` :71-74 (1); file move failed :84-87 (1) |

Success lines mirror the Python stdout (e.g. `✅ created phase … (seq N) — …, now at P<RANK>`
new_phase.py:181; `✅ <slug> updated (…)` update.py:311; `📦 <slug> archived -> …`
archive.py:105; `✅ … now belongs to branch '…'` move.py:97).

## 3. Storage

- Layout (lib_db.py:142-156): repo folder `<home>/<owner>/<name>/` (`repo_root`, lib_db.py:142-144);
  items at `phases/NNN-<slug>.md` (`phases_dir`, lib_db.py:151-152); archived items at
  `archive/phases/NNN-<slug>.md` (archive.py:76-77); the mirror database at `backlog.db`
  (`db_path`, lib_db.py:155-156). `NNN` is the 3-digit `seq`; `<slug>` =
  `NNN-<slugify(name)>` (new_phase.py:19-20, 113); `seq` = 1 + the max of the seq values in
  `phases/` and `archive/` and of `MAX(seq)` in `backlog.db` (new_phase.py:23-25).
- Front matter, keys in exactly this written order (order preserved: `yaml.safe_dump(sort_keys=False)`,
  lib_db.py:182-184). Written by new_phase.py:122-138:
  `phase, seq, name, objective, summary, status, severity, priority, repository, branch, commit,
  location, created, updated`, then `work_class`, `review_classes`, `review_refs` only when
  non-empty (new_phase.py:129-134), `estimate_min`, `complexity`, `layer` only when given
  (new_phase.py:135-137), then always `depends_on, claimed_by, claimed_at,
  review_state, reviewer` (new_phase.py:138).
- `update.py` adds lifecycle keys over time: `review_requested_at` (update.py:52),
  `wait_on`/`wait_since` (update.py:90), `completed` (update.py:274-275), plus changes to
  `status`/`claimed_by`/`claimed_at`/`review_state` (update.py:40, 47, 52, 67, 83-84, 103).
- Records are appended to the item's body (claim line, review block, close block;
  update.py:262-266; the initial body template new_phase.py:139-148).
- The file is the source of truth; `backlog.db` is a mirror that the read commands query
  (lib_db.py:385-416). Every shared-mode write therefore re-ingests the stack
  (`scan_stack` lib_db.py:482-503; upsert by slug keyed on `sha256` lib_db.py:449-479) and
  commits files and DB together (lib_db.py:348-381).
- Data-integrity findings, same names as Python: a row whose file is gone is `ghost`, an item
  naming another repository than its folder is `foreign`, an item without repository or branch
  is `untagged` (lib_db.py:302-313).
- Priorities are dense ranks `0..M-1` over the folder's `pending`/`in_progress` items of all
  branches, `0` = next (lib_db.py:541-567); adding, moving or completing work re-densifies the
  backlog (new_phase.py:163-170; update.py:302-305; archive.py:96-103).

## 4. Output

Shared-mode `--json` prints exactly the Python reference's JSON — same keys, same nesting,
2-space indent — never wrapped in local mode's `{ok,data}` envelope (src/output.js:33).

| View | Python source | Node producer |
|---|---|---|
| pop action: `{action, item, seq, repository, branch, instruction, claimed, blocked[], held[]}` | query.py:250-257 | src/shared/pop.js (20) |
| `--claimable` / `--reviewable` / `--blocked`: array of `{…row, work_class, review_classes, depends_on, claimed_by, claimed_at, review_state, reviewer, waiting_on}` | query.py:474-479 | src/shared/views.js (16) |
| `--next`: one row dict; `{}` when the queue is empty | query.py:513-515, 508-512 | src/shared/query.js (12) |
| `--phase <item>`: one row dict | query.py:550 | src/shared/query.js (12) |
| `--status`: `{handoff, repository, branch, phases[], gone_branch_items[], findings{foreign, untagged, ghost}}` | query.py:594-597 | src/shared/query.js (12) |

Human-readable lines mirror the Python message strings and their streams (✅/➡️/📋 on stdout for
success, ❌ on stdout for refusals, ℹ️ on stderr for info and `die()` messages on stderr).
Pop precedence (query.py:170-263): `continue` → `review` (a request older than
`BACKLOG_REVIEW_FIRST_SECONDS`, default 300 s, query.py:190) → `claim` (refused while the agent
holds an active item, lib_db.py:673-680) → `chunk` → `idle` (exit 3, query.py:73, 263).

## 5. Exit codes

| Code | Meaning | Source |
|---|---|---|
| 0 | success; read views; `--dry-run` (nothing committed) | query.py:619; new_phase.py:150-153 |
| 1 | a refusal, message on stdout | new_phase.py:65-118; update.py:165-272; move.py:10 (doc line); archive.py:63-87 |
| 2 | `die()` to stderr: invalid argv, unknown class value, detached HEAD, home not a correct clone | lib_db.py:39-42, 634-640, 273-277, 77-100; query.py:403-404, 416-417, 450-451 |
| 3 | committed locally but not on origin/main (pull or push failed after retries); also pop's `idle` answer | lib_db.py:101-109, 369-381; query.py:73, 263 |
| 4 | home missing where someone can answer: the ASK-THE-USER question is printed, the agent/user decides | lib_db.py:46, 81-85; set_home.py:6 |

## 6. Modules and owners

One writer per file. Tags are the pushed lines each job pastes into its item.

| File | Owner (job, tag) | Exports — mirror source |
|---|---|---|
| `src/shared/safety.js` | job 3 (SAFETY) | `repoIdFromUrl(url)` → `owner/name` or `""` (lib_db.py:58-64); `validateHome(path)` → home path, refusing with the messages of lib_db.py:77-100; `slugify(text)` (new_phase.py:19-20); `itemSelector(text)` → `{number}` \| `{slug}` \| `null` (lib_db.py:587-595); `assertInside(root, path)`; `checkRefs(refs)`; `redact(text)` — strip `user:token@` from URLs in any git stderr; `git(args, cwd)` → `{stdout, stderr, code}` via execFile with an args array and `GIT_TERMINAL_PROMPT=0`, never a shell (pattern lib_db.py:188-193) |
| `src/shared/frontmatter.js` | job 4 (CODEC) | `parse(text)` → `{fm, body}` (lib_db.py:171-179; the YAML subset of job 004 — unknown constructs are a clear error, never a guess); `dump(fm, body)` → text (lib_db.py:182-184: keys in given order, strings as JSON double-quoted, ints plain, block lists, `[]` when empty) |
| `src/shared/store.js` | job 5 (STORE) | `resolveHome()` (lib_db.py:49-55; missing → exit 4 with lib_db.py:81-85; never clones); `getMode()` → `shared`\|`local` (mode.json; absent → `local`); `setMode(mode)`; `folder(home, repoId)` (lib_db.py:142-144); `repoId(cwd)` (lib_db.py:122-135, main working tree, no origin → refuse); `branch(cwd)` (lib_db.py:273-277, detached → refuse); `load(folder)` → items with `path, fm, body, sha` (lib_db.py:482-503); `nextSeq(folder)` (new_phase.py:23-25); `write(item)` atomic (lib_db.py:182-184; src/storage.js:18); `reflow(folder, {slug, target})` (lib_db.py:558-567); `reorder(folder, idents)` (lib_db.py:570-584); `inQueue(item, repo, branch)` (lib_db.py:296-299); `findings(folder)` (lib_db.py:302-313); `now()` (lib_db.py:159-160) |
| `src/args.js`, `src/main.js`, `src/shared/router.js` | job 6 (ROUTER) | args.js: the global options `--use-backlog-repo <path>` / `--use-local-repo` (section 1); in shared mode the local grammar is skipped and the argv after the command goes to the command module unparsed; main.js `run(argv)`: resolve the mode (`getMode`, `BACKLOG_HOME`), shared → `router.run(command, argv)`, local → today's path (src/main.js); shared mode skips init, withStore and refreshIntegrations (src/main.js:4, 27); router.js `run(command, argv)`: the command table of section 2, dynamic import per command; a command whose module is not built yet exits 2 with `not built yet: <command>`; `--help` prints the `src/help.js` text |
| `src/shared/sync.js` | job 8 (SYNC) | `pull(home)` — `git pull -q --rebase --autostash` under the local lock `<home>/.git/smooth-backlog-cli.lock`; on failure `rebase --abort` and exit 3 with the message of lib_db.py:101-109; `commit(home, folder, message)` — `git add -A -- <owner>/<name>`, commit `<owner>/<name>: <message>` when staged, up to 3 rounds of `pull --rebase --autostash` + `push`, `index.lock` retried 5 times, still not pushed → exit 3 (lib_db.py:348-381); after every rebase, an added file whose `seq` now collides is renumbered to `nextSeq` (`git mv` + `phase`/`seq` keys + body heading) and the command prints `renumbered NNN -> MMM`; a rebase that stops on a conflict of `backlog.db` (two writers changed the binary mirror) takes upstream's copy, finishes the file-level resolution and renumbering, and `db.commitSettled` then rescans the mirror from the files and commits it again (the mirror is derived, the Python oracle would refuse); all git stderr passes through `safety.redact` |
| `src/shared/db.js` | job 9 (DB) | `connect(folder)` — the schema of lib_db.py:385-405, migrations of lib_db.py:419-426; `ensureAnchor(db)` (lib_db.py:436-446); `ingest(db, item)` — upsert by slug with sha256 and `ingested`/`reingested` events (lib_db.py:449-479); `scan(db, folder)` (lib_db.py:482-503); `markArchived(db, slug, location)` (archive.py:89-90). Every shared write runs `scan` before `sync.commit`, so `backlog.db` is committed together with the files, as Python does |
| `src/shared/new.js` | job 10 (NEW) | `run(argv)` → exit code. Port of new_phase.py:28-184: flags :31-58, refusals :65-67, :69-71, :76-79, :81-85, :90-93, :98-101, :115-118, front matter :122-138, body :139-148, dry-run :150-153, reflow and planning event :163-170, critical banner :174-180, db scan, commit tail new_phase.py:187-192 (message: the script's basename plus the first two arguments) |
| `src/shared/update.js` | job 11 (UPDATE) | `run(argv)` → exit code. update.py:107-324 without `team_action`; the team flags are parsed here and passed to lifecycle.js with its signature below; until it exists they exit 2 `not built yet` |
| `src/shared/query.js` | job 12 (QUERY) | `run(argv)` → exit code. query.py:361-619 read views and the JSON of section 4; team flags go to views.js (16) and pop.js (20) per this contract, until they exist they exit 2; `--headless` exits 2 `not in this build` |
| `src/shared/team.js` | job 15 (TEAM) | `heldItems(folder, agent)` (lib_db.py:658-670); `claimRefusal(folder, agent)` (lib_db.py:673-680); `undoneDependencies(folder, fm)` (lib_db.py:648-655); `uncoveredReviewClasses(classes, refs)` (lib_db.py:683-686); `loadRoster(path)` (lib_db.py:689-697); `fallbackReview(fm, roster)` (lib_db.py:700-707); `describeDependency(dep)` (lib_db.py:745-749) |
| `src/shared/lifecycle.js` | job 15 (TEAM) | `claim(item, agent, {force})`, `release(item, agent)`, `requestReview(item, reviewer, note)`, `review(item, verdict, {by, comments})`, `waiting(item, by, what)`, `waitingDone(item, by)`, `closeItem(item, by, summary)` — one per `team_action` branch (update.py:27-104). Each returns `{event, text}` or throws `Rejected(message)` with the Python refusal text; the caller writes the front matter and appends the text to the body exactly as update.py:262-266; the close gate (review_classes requires `review_state: passed`) is update.py:97-99 |
| `src/shared/views.js` | job 16 (VIEWS) | `claimable(folder, classes)`, `reviewable(folder, classes, roster)`, `blocked(folder)` (query.py:449-494); `--scope branch\|repo\|all` (query.py:394-396) |
| `src/shared/move.js`, `src/shared/archive.js` | job 17 (MOVE) | `toBranch(folder, item, branch, note)` (move.py:22-29); `toRepository(folder, item, target)` (move.py:32-64); `archiveItem(folder, item, {force})` — git mv under `archive/` preserving history, status stamp (archive.py:22-37, 39-49, 76-94), rescan and reflow (archive.py:95-103) |
| `src/help.js` (help constant in `src/output.js`), `COMMANDS.md` | job 18 (HELP) | `HELP = { <command>: text }`; `--help` of any command prints its text (section 2); `COMMANDS.md` documents the shared-mode surface; the existing JSON convention of src/output.js:33 stays local-mode only |
| `src/shared/pop.js` | job 20 (POP) | `pop(folder, agent, {workClasses, reviewClasses, claimNow, roster, scope})` → the action object of section 4 (query.py:170-263; precedence and the 300 s review-first timer query.py:171-190; claim refusal lib_db.py:673-680); `idle` exits 3 (query.py:73, 263) |

Test files: one shared suite per job (`.agents/test/shared-<area>.test.js`, each job's Files
line). Tests use only local bare repos from `.agents/test/shared-fixtures.js` (job 1), with
`BACKLOG_HOME` and `XDG_CONFIG_HOME` inside the test's temp dir; never the real backlog
repository or `~/.config` (item 002:40).


## Publication decision (owner, 2026-10-25)

Every shared mutation commits and pushes before success. If publication fails after the existing retry/rebase loop, reset the local branch to origin/main and restore the starting working edits and staging; exit 3 with a loud not-published message. An existing unpublished stack is refused before reading or writing, with commit hashes/subjects and explicit publish/drop commands. No leading-pull squash or silent history rewrite is allowed. Conflict repair is limited to the one commit created by the active command. Both folders of a cross-repository move remain in that same commit. This supersedes failed-push retention and leading-pull recovery described above.

Before each push, shared sync revalidates the whole write set against the merged backlog after renumbering and mirror reconciliation, including incidental reflow writes and every folder of a cross-repository move. Existing sequence assignments must remain unique; changed items must resolve their dependencies, and removed or renumbered identities must have no dangling incoming references, including references added upstream during publication. Refusal exits 3 and rolls back the entire mutation. Publication conflict-marker preflight is inside the same rollback boundary, so a rejected body edit restores the starting Markdown, database and staging too.
