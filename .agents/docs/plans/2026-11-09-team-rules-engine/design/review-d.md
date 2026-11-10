# Review D (second round): implementability against the real code, tests and data

Context: this is the second independent review of the rules-engine design in this folder (chapters 01 to 08, `rule-cases.json`, the
spike). Reviews A and B (first round) and `review-response.md` are not repeated. This review checks the design against the code of the
branch at commit 0128400 (`src/`, `bin/`, `templates/`, `package.json`), the test suite under `.agents/test`, a real backlog repository
(read only; only counts and generic key names appear here) and the way every commit of the working branch becomes the live `backlog`
binary of the owner's machine. Every claim cites a file and line of this commit or a command that was run.

Baseline: `node --test .agents/test/*.test.js` at 0128400 runs 1135 tests (819 `test(...)` declarations; loops expand them): 1127 pass,
3 fail, 5 cancelled, all eight unrelated to the design (three `upgrade.test.js` cases refuse the machine's Node version; five cleanup cases
of `shared-sync-db.test.js:746-813` end with a pending promise). The implementation plan should start from this baseline.

Severity: High = the design as written loses data, publishes something private, or cannot be implemented without a design change.
Medium = a gap or contradiction an implementer must decide. Low = a missing sentence or case.

## 1. Findings, ranked

| id | sev | finding | evidence | suggested fix |
|---|---|---|---|---|
| D-H1 | High | The re-run of a team command (`git reset --keep` to upstream, chapter 04 section 6, chapter 05 section 3) drops the person's own unpushed commits when the backlog lives inside the code repository. In that mode the upstream is the code branch, the person's code commits sit between upstream and HEAD and are pushed with every backlog change today; `refuseUnpublished` runs only in clone mode. The spike does the same (`reset --keep @{u}`). | `src/shared/sync.js:53-62` (in-repo target: `origin/<branch>`), `:412` ("the user's own repository has its own unpushed commits: they are pushed with the change"), `:135` and `:412` (refusal only when `t.clone`); `evaluator-spike/numbers.mjs` `publishByRerun` | Never reset to upstream. Drop only the command's own commit (`git reset --keep HEAD~1`, the command's commit is HEAD, `mine` in `sync.commit`), then today's `pull --rebase --autostash`, then run again. This also fixes D-M3. |
| D-H2 | High | The CLI commits the team file, its templates and its SHA itself. Every default location of the team file lies inside the paths the CLI stages with `git add -A`: clone mode stages the whole repository folder, which holds the step-2 default `<owner>/<name>/teams.json`; in-repo mode stages the whole `.backlog` folder, which holds `.backlog/teams.json`, `.backlog/config.json` (with `teams_file_sha`, `migrated_at`) and `.backlog/team-templates/`. A lead's uncommitted, possibly invalid draft is committed and pushed by the next agent's `backlog team update`, contrary to R5 (the CLI never writes the file), to the validate-before-push loop of chapter 07 section 3, and to "a person commits it" (chapter 01 section 4). | `src/shared/sync.js:408` (`lits`: the folders, or the whole `.backlog` folder), `:446` and `:490` (`add -A -- ...lits`) | Stage named paths only: `phases/`, `archive/`, `index.json`, `numbers.json` of the folder (in-repo: of `.backlog/<owner>/<name>`), never the folder root. State it in chapter 04 section 9, which today says only "never git add -A of the clone". |
| D-H3 | High | A release older than the cut-over treats a migrated folder as empty and corrupts it. It reads only `*.md` (`store.load`), so `backlog new` hands out number 1 again, and the index reconcile drops every entry whose `.md` file is gone (the whole queue order), then publication passes. Older releases keep running: the npm self-update refuses a release whose `backlogSchemaVersion` differs, so installs on other machines stay old, and a rollback of the live deployment to a pre-cut-over commit is the same case. | `src/shared/store.js:285` (`.md` only), `:299-301` (`nextSeq`), `:325-331` and `src/shared/index.js` reconcile (gone entries dropped), `src/upgrade.js:140` (schema mismatch blocks the update) | The migration writes a tripwire that every older release already refuses: a `phases/000-migrated-to-json.md` whose front matter cannot be parsed makes every older command of the folder stop with exit 2 (`src/shared/store.js:257-266`); the new release ignores that one name. Bump `backlogSchemaVersion` to 2 at the cut-over. Add the BDD scenario "a pre-cut-over release on a migrated folder refuses". |
| D-H4 | High | The default location of the team file can publish a team's rules. Step 2 of the resolution (chapter 01 section 1.1) fires only for the `backlog_repository`/`backlog_origin_url` keys or SMOOTH_BACKLOG_CLI_HOME. A backlog found through the origin-URL variable or the per-user record (both supported, `store.js:35-44`) leaves the team file at step 3, `.backlog/teams.json` inside the code repository. On the owner's machine this is the normal case: the consuming repositories checked (4) have no `.backlog/config.json`, and the backlog is found through the session variable and the per-user record. One of them is this public repository, whose development loop commits with `git add -A`. The first team command would also create `.backlog/config.json` there to hold the SHA. | `src/shared/store.js:32-44`; chapter 01 section 1.1 step 2; the working tree of this repository has no `.backlog/` and `.gitignore` does not exclude it | Step 2 fires whenever the resolved backlog folder lies outside the actionable repository, however it was resolved. Do not create `.backlog/config.json` only to hold the SHA: when the repository has no configuration, keep the SHA in the per-user record (state it). |
| D-H5 | High | "The actionable repository" is undefined when `--repository` or SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY names another repository than the working directory's. Today the session repository decides the folder (`seam.scope().repo`), and the owner's team runner sets the variable to another repository than its working directory when it hands a work item to a team. The design resolves the team file, `teams_file_sha` and `migrated_at` from the working directory's configuration (R22, R25) but writes items, `numbers.json` and the index of the session repository's folder, whose own step-2 team file it never reads. R24's scope rule cannot be applied without this definition. | `src/shared/update.js:147`, `src/shared/archive.js:44`, `src/shared/query.js:151` (`seam.scope().repo \|\| store.repoId(cwd)`); chapter 01 section 5 (repository input) | Define it once: the actionable repository is the session repository (flag, then variable, then the working copy's origin); the folder, the step-2 team file and the per-user record follow it; `.backlog/config.json` keys are read from the working copy only when its origin is that repository, otherwise refuse with exit 2. |
| D-M1 | Medium | The R24 audit (chapter 04 section 9) misses paths that stop or write because of another folder: `refuseConflicts` runs `ls-files -u` and greps `*.md` over the whole clone before every read and write, and `refuseUnpublished` refuses when any folder has an unpublished commit (both exit 3 for every command of every folder); `backlog new --depends-on` and `backlog update --set-depends-on` refuse a foreign reference that does not resolve and walk other folders for a cycle; `recoverJournal` rolls back another folder's half-done change; in clone mode `undoCommit` restores the whole clone's working tree (`backlogDir` is the clone root because the prefix is empty). The coverage rows attribute the foreign checks of `new.js:154` and `update.js:268-274` to "referential integrity by type", which chapter 02 section 3 now forbids for foreign references. | `src/shared/sync.js:67-75`, `:79-84`, `:421-441`; `src/shared/new.js:154`; `src/shared/update.js:268`, `:273`; `src/shared/store.js:199-215`; `coverage.tsv` rows `src/shared/new.js:154`, `src/shared/update.js:268` to `:274` | Scope both guards to the folder's pathspec; remove the foreign existence and cycle checks of `new` and `update` (only "well formed", as chapter 02 section 3 says for team fields; chapter 02 section 4 "checked for existence and cycles" must say "inside the own folder"); state the journal and `undoCommit` as the one exception (they restore bytes the command itself recorded). |
| D-M2 | Medium | The re-run budget equals the waiting budget. A team command re-runs while it holds the clone lock (both locks: `sync.commit` and `cloneLocked`) for up to SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS, and every waiter behind it waits at most the same 120 s, so under the contention chapter 04 section 7 measures a waiter fails exactly when the holder uses its budget. | `src/shared/sync.js:411` (`locked(...)` around the publication), `src/shared/store.js:103-107` (waiter budget 120 s) | Cap the re-run loop well below the waiting budget (for example a quarter of it), or release and retake the lock between runs (each run pulls anyway). |
| D-M3 | Medium | `git reset --keep` does not "keep any local change of the clone outside the folder" (chapter 04 sections 6 and 9): it aborts ("not uptodate") when a locally changed file also differs between HEAD and upstream, for example another folder's file that upstream changed. The design defines no outcome for that abort. | `git help reset` (`--keep`); chapter 04 section 9 row "re-run" | The fix of D-H1 (reset only the command's own commit, which touches only the folder's paths; then `pull --rebase --autostash`) removes the case. |
| D-M4 | Medium | The R25 version comparison is inert. `package.json` says `0.0.0-development`, the live binary prints it (`backlog --version`), and the spike's `older()` reads it as 0.0.0, so every build "migrated by this version" and a later format change is never advised. | `package.json` `version`; `evaluator-spike/setup.mjs` `parts`/`older` | Record and compare `migrated_schema_version` = `backlogSchemaVersion` of `package.json` (already the compatibility number of `src/upgrade.js:140`); keep `migrated_by_version` as information only. |
| D-M5 | Medium | `backlog setup` is not in the list of commands that run on a markdown backlog (chapter 06 section 2: validate, migrate, help, version, upgrade), yet R25 requires setup to recommend the migration on exactly that backlog; `backlog clean` runs setup again. | chapter 06 section 2; `src/shared/clean.js:53` | Add `backlog setup` (it reads no item). |
| D-M6 | Medium | The migration requires a team file even in a folder with no team item. In the real backlog 5 of the 8 repository folders have no item with a `team` key and none has a team file at the step-2 location; each would need a hand-written `{}` before its only possible command (`migrate`) can run, while every other command of the folder stays stopped. | data section 3 below; chapter 06 section 5, first row | A folder whose items carry no `team` key migrates without a team file. |
| D-M7 | Medium | `backlog clean` is not designed beside team items: without `--show-all` it would still drop the whole branch list of the index (team entries included) and with `--all-branches` every list, against chapter 05 section 6 ("keeps the other side's places"); and it runs setup, which after R23 copies the templates again and commits and pushes into the code repository. | `src/shared/clean.js:47` (`delete idx.branches[branch]`, `idx.branches = {}`), `:53` | Clean removes only the entries of the items it deleted; state that clean's setup run includes the templates and the migration advice. |
| D-M8 | Medium | The shipped workflow template stays in the package. `templates/workflows/team.json` (the lifecycle words, review stages and team-entry example the old engine enforces) is in `npm pack` (the `files` list ships `templates/`) and in the live deployment's export; chapter 01 says only that it is "no longer read". R23 ships only generic templates. | `package.json` `files`; `npm pack --dry-run` lists `templates/workflows/team.json`; chapter 01 section 1 | Delete `templates/workflows/` in the cut-over and its mentions in `COMMANDS.md` and the skill reference. |
| D-M9 | Medium | Coverage rows that are wrongly attributed (the chapters say otherwise or nothing): `new.js:192` (the owner of a user item) is SKIP "D-17" though chapter 02 section 4 carries it; `new.js:197` (the Definition-of-done placeholder added to a new item's body) is SKIP by R3, which is about fields, and no chapter drops or keeps it; `new.js:179` (`--force` replaces an item with the same file name) and `clean.js:14,27,30` are "the arguments of a team step"; `sync.js:72,81,125` (conflict, unpublished-commit and offline guards) are "a team step is evaluated again". | `coverage.tsv` rows with those refs | Re-attribute; record `--force` as dropped (with never-reused numbers a new file name is always free) and the placeholder as kept or dropped. |
| D-M10 | Medium | The cut-over cannot land without breaking the agents that run on the live binary. The owner's team runner and the installed lead skill (both outside this repository) run `backlog team workflow --file` and `backlog team define --file` at the start of every team run, use per-step flags (`--claim`, `--start-review`, `--accept-handoff`, `--waiting`, ...), export the unprefixed team variable and run a user command (`backlog update ... --set-team`) inside a team session, and pass the unprefixed private-denylist variable to agents. | the runner script and the lead skill of the owner's factory (paths in the hand-back message, not here: this repository is public) | The staged landing of section 5; deploy each breaking stage only when no team run is active, together with the matching runner and skill change. |
| D-L1 | Low | Fields user commands write today are absent from the built-in user definition (chapter 02 section 4): `size_score` (settable and repairable), `review_refs` (in 410 real items), `review_state` and `reviewer` (written by every `backlog new`, in 469 and 471 real items). They migrate as undeclared fields of user items; how user commands show them, and what the `review_state` column of `backlog list --json` holds, is not stated. | `src/shared/update.js:24`, `src/shared/store.js:253`, `src/shared/new.js:190`, `src/help.js:333` | Declare `size_score`; state that undeclared fields of a user item are shown by `show` and kept by writes; drop `review_state` from `list --json` or say what it holds. |
| D-L2 | Low | `backlog update --branch` writes the envelope `branch`; chapter 02 section 2.1 lists the writers of `branch` without it. | `src/help.js:192`, `src/shared/update.js:24` | Add it (items without a team; with `--show-all` on team items). |
| D-L3 | Low | `backlog archive` writes the status `archived` today; chapter 02 section 1 (D-26) says no status word marks an archived item, while chapter 02 section 4 and chapter 05 section 5 keep `archived` as a closing word. | `src/help.js:571` | Say whether user `archive` still writes it. |
| D-L4 | Low | `backlog changes` sorts items into "held" by the keys `owner`, `reviewer` and `refiner` (team vocabulary in a user command, R1), which matters with `--show-all`. | `src/help.js:415` | Held = `claimed_by` of user items only. |
| D-L5 | Low | `backlog setup` writes `"team": ""` into every configuration; the R3b lookup must treat an empty `team` key as not set (otherwise `--team ''` errors look like a missing entry). | `src/shared/setup.js:113,119` | State it; add a case. |
| D-L6 | Low | A `.json` file name is 2 bytes longer than the `.md` one and `slugify` has no length cap; the real backlog's longest item file name is 226 bytes, so the migration is safe today, but its failure table lacks ENAMETOOLONG. | `src/shared/safety.js:62`; `shared-long-name.test.js` (250-byte names) | Add the case to chapter 06 section 5. |
| D-L7 | Low | The R19a guard must sit in `src/main.js`: `setup` and `upgrade` are dispatched there before the router. | `src/main.js:31-35` | State where the guard runs. |

## 2. Behaviours of the current code (item 1)

Context: 98 behaviours chosen from the code and the help texts (not from `coverage.tsv`), each looked up in the chapters and then in
`coverage.tsv`. Verdicts: **C** carried by a named chapter; **K** a user-command behaviour the design keeps by not touching it (format
neutral, the matrix row "unchanged"); **D** a recorded drop; **M** missed (the design changes the ground under it and says nothing); **W**
wrongly attributed in `coverage.tsv` or contradicted by a chapter.

| # | behaviour | code | verdict, where |
|---|---|---|---|
| 1 | `new` needs `--name` unless `--split-from` | new.js:145 | C ch04 §2 (team), K (user) |
| 2 | `new --force` replaces an item with the same file name | new.js:179 | **W** (coverage: team-step arguments) |
| 3 | `new` adds a Definition-of-done placeholder to the body | new.js:197 | **W** (SKIP by R3, a body behaviour) |
| 4 | body heading `# Phase NNN — name` | new.js:192 | C ch05 §3 (renumbering); **M** for `team new` (no body template stated) |
| 5 | `--context` becomes a body section | new.js:193 | K |
| 6 | `--split-from` inherits objective, summary, context | new.js:172 | K; parent link C ch02 §4 |
| 7 | `--priority` insertion rank | help.js:115 | C ch05 §6 |
| 8 | critical item first and in a banner | help.js:121 | C ch05 §6 |
| 9 | status free text, `done` stored as `closed` | status.js normalise | C ch02 §4 (D-19, D-33) |
| 10 | `new --ask` | new.js:106 | K (ch06 §2.2 reuses it) |
| 11 | `new --dry-run` | help.js:145 | K |
| 12 | `commit` = HEAD at creation | new.js:183 | C ch02 §4 |
| 13 | `owner` = configuration user | new.js:191 | C ch02 §4; **W** coverage (SKIP D-17) |
| 14 | `new` writes `review_state`/`reviewer` on user items | new.js:190 | **M** (D-L1) |
| 15 | `--depends-on` foreign item must exist (reads another folder) | new.js:154 | **W** (D-M1) |
| 16 | `--summary` repeatable | help.js:110 | K |
| 17 | `--estimate` stored as `estimate_min` | help.js:135 | C ch02 §4 |
| 18 | `--chunk` | help.js:141 | C ch02 §4 |
| 19 | 250-byte file names work | test 047 | **M** (D-L6) |
| 20 | `--title` alias | help.js:106 | K |
| 21 | `--description`/`--body` alias | help.js:128 | K |
| 22 | `update --section` | help.js:219 | K (body text) |
| 23 | `--set-lines`, `--add-line --top`, `--remove-line`, `--move-line` | help.js:223-232 | K (body text) |
| 24 | `update --restore` | help.js:211 | C ch02 §2.4 |
| 25 | `update --seq` and its incoming-reference refusal | sync.js:361 | C ch05 §4 |
| 26 | `update --size_score` | help.js:209 | **M** (D-L1) |
| 27 | `update --branch` | help.js:192 | **M** (D-L2) |
| 28 | `update --replan` | help.js:235 | C ch05 §6 |
| 29 | `--note` | help.js:239 | C ch02 §2.3 |
| 30 | `--claim` refuses another holder | help.js:241 | D (D-20) |
| 31 | `--claim` refused while a dependency is open | plain-step.js:13 | D (D-18) |
| 32 | `--claim` refused by a work-in-progress limit | plain-step.js:8 | D (D-18) |
| 33 | `--release` back to pending | help.js:245 | K (field writes kept, D-20) |
| 34 | `--close` needs `--summary` | help.js:248 | D (D-20) |
| 35 | `--close --by owner --reason` | plain-step.js:51 | D (D-20) |
| 36 | `--close` of an unheld item needs `--by` | plain-step.js:53 | D (D-20) |
| 37 | `--set-depends-on` cycle walk through other folders | update.js:273 | **W** (D-M1) |
| 38 | `--set-estimate`, `--set-complexity`, `--set-layer`, `--set-chunk` | help.js:260-266 | C ch02 §4 |
| 39 | `update --severity` | help.js:268 | C ch02 §4 |
| 40 | `update --dry-run` | help.js:271 | K |
| 41 | unreadable item refusal names the field | store.js:257 | C ch02 §2.4 |
| 42 | `phases/` file without front matter left alone | store.js:244 | C ch06 §3 |
| 43 | symbolic-link refusal | store.js:144 | C ch01 §1.1 |
| 44 | journal of a killed command | store.js:199 | C ch04 §6; R24 exception **M** (D-M1) |
| 45 | stale-view refusal, exit 5 | seen.js | C ch04 §6 |
| 46 | `show --agent` records the read | help.js:378 | K |
| 47 | `show` of a comma list | help.js:370 | K |
| 48 | `history` without item: latest 50 | help.js:395 | C ch04 §8 |
| 49 | `history` refuses `--json` | help.js:395 | K |
| 50 | `changes` reference per agent | help.js:410 | K, ch04 §8 |
| 51 | `changes` held section by team keys | help.js:415 | **M** (D-L4) |
| 52 | `list` findings (foreign, untagged items) | store.js:373 | K |
| 53 | items of a branch gone from the origin listed apart | help.js:330 | K |
| 54 | `list --json` rows carry `review_state` | help.js:333 | **M** (D-L1) |
| 55 | `list new` | help.js:340 | K |
| 56 | `list branches` | help.js:346 | C ch04 §8 |
| 57 | `list critical` | help.js:348 | K |
| 58 | `list all-branches` | help.js:351 | C ch04 §8 |
| 59 | `next` prints the item whole | help.js:300 | K |
| 60 | `next --json` prints `{}` when empty | help.js:304 | K |
| 61 | `next all-branches` | help.js:440 | C ch04 §8 |
| 62 | `done` = `update --status done` | done.js:10 | C ch02 §4 |
| 63 | `clean` asks for a typed yes | clean.js:36 | K |
| 64 | `clean` runs setup again | clean.js:53 | **M** (D-M7) |
| 65 | `clean all-branches` | help.js:485 | C ch04 §8 |
| 66 | `clean` drops the branch's whole index list | clean.js:47 | **M** (D-M7) |
| 67 | `import --branch`, not the current branch | help.js:500 | C ch04 §8 |
| 68 | `import --higher` | help.js:502 | K |
| 69 | `import` refuses `--json` | import.js:9 | K |
| 70 | `archive done` | help.js:515 | C ch04 §8 |
| 71 | `archive` of an open item needs `--force` | help.js:575 | K |
| 72 | `archive` writes status `archived` | help.js:571 | **M** (D-L3) |
| 73 | archiving an archived item says so | help.js:573 | K |
| 74 | `move --to-branch` refuses a branch the origin lacks | move.js:61 | K |
| 75 | `move --all-open-of-branch` | help.js:614 | C ch04 §9 |
| 76 | an archived item cannot be moved | move.js:96 | C ch04 §5 (team), K (user) |
| 77 | `move` checks work-in-progress limits | move.js:76 | D (D-18) |
| 78 | `fields` table and `--json` | help.js:533 | C ch04 §8 |
| 79 | `setup --ask` | setup.js:92 | K |
| 80 | `setup` clones the backlog when a URL is set | setup.js:104 | K |
| 81 | `setup` writes `user` and `team: ""` | setup.js:118-119 | **M** (D-L5) |
| 82 | `setup` commits and pushes what it wrote | setup.js:133-141 | C ch01 §1.2 |
| 83 | per-user record names the backlog | store.js:38 | K; **M** for the team-file resolution (D-H4) |
| 84 | first use creates `.backlog` and its configuration | store.js:45-50 | K |
| 85 | two per-user records and no setting: exit 4 | store.js:42 | K |
| 86 | in-repo publication pushes the person's own commits | sync.js:412 | **M** (D-H1) |
| 87 | `push-backlog-updates: false` | sync.js:60 | **M** for team commands (no push, so the re-run of ch04 §6 never happens; say so) |
| 88 | no origin remote: commit kept, exit 3 | sync.js:495 | K |
| 89 | offline read answers from the local copy | sync.js:124 | K |
| 90 | refusal on unpublished commits anywhere in the clone | sync.js:79 | **M** (D-M1) |
| 91 | conflict refusal over every `*.md` of the clone | sync.js:67 | **M** (D-M1; also `*.md` must become `*.json`) |
| 92 | `index.lock` retried 5 times | sync.js:35 | K |
| 93 | update notice at a terminal | upgrade.js | K |
| 94 | run hook variable | bin/backlog.js:10 | C review-response R2-4 |
| 95 | commit subject `<owner/name>: <message>` | sync.js:409 | K |
| 96 | "committed; all pending branch changes pushed" | sync.js:537 | K |
| 97 | literal pathspecs for folder names | sync.js:44 | K |
| 98 | `merge.directoryRenames=false` | sync.js:37 | K |

Totals over the 98 rows: C 34, K 42, D 7, **M 17, W 5** (rows 4, 13, 44 and 83 count in two columns). Missed or wrongly attributed: rows 2, 3, 4 (team new), 13, 14, 15,
19, 26, 27, 37, 44 (R24 exception), 51, 54, 64, 66, 72, 81, 83 (resolution), 86, 87, 90, 91; each is a finding of section 1.

## 3. Migration against the real backlog (item 3)

Context: the real backlog repository was read with today's reader (`parseItem`, `src/shared/frontmatter.js`) and git, without writing.
Folders are numbered; folder 9 is a test folder at the backlog root.

| folder | open | archived | index.json | items with `team` | bound to a team without entry (open / archived) | split items without team | their parent is a team item | foreign deps | `priority` key | no `updated_by` | high-water mark / highest number present |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | no | 0 | 0 / 0 | 0 | 0 | 0 | 1 | 1 | 1 / 1 |
| 2 | 50 | 103 | yes | 1 | 1 / 0 | 9 | 0 | 0 | 153 | 109 | 153 / 153 |
| 3 | 3 | 3 | no | 0 | 0 / 0 | 0 | 0 | 0 | 6 | 3 | 6 / 6 |
| 4 | 246 | 77 | yes | 17 | 3 / 13 | 43 | 0 | 8 | 321 | 278 | 325 / 325 |
| 5 | 53 | 169 | no | 0 | 0 / 0 | 20 | 0 | 0 | 222 | 221 | 222 / 222 |
| 6 | 3 | 0 | no | 0 | 0 / 0 | 0 | 0 | 0 | 3 | 2 | 3 / 3 |
| 7 | 135 | 19 | yes | 71 | 3 / 0 | 12 | 12 | 3 | 145 | 26 | 154 / 154 |
| 8 | 12 | 2 | no | 0 | 0 / 0 | 0 | 0 | 0 | 14 | 3 | 250 / 14 |
| 9 | 13 | 0 | no | 0 | 0 / 0 | 0 | 0 | 0 | 13 | 13 | 22 / 14 |

Facts: 889 items (516 open, 373 archived), 56 distinct front-matter keys after loading (the most frequent: `phase`, `seq`, `name`,
`objective`, `summary`, `status`, `repository`, `branch`, `updated`, `severity`, `commit`, `location`, `created`, `priority`), 0 unreadable
headers, 0 bare files, 0 duplicate numbers, 0 file names whose number differs from `seq`, 0 byte-order marks or CR LF line ends, 9 items
in the newest spelling of the header (`title`, `last_updated`, ...), 11 items with `events`, 3 items without `created`, 1 item with two
`Split from` lines. The only team file is one at the root of the backlog repository, with one entry in today's shape; no folder has a team
file at the step-2 location, no folder has `numbers.json`. Team items are bound to up to 9 distinct team names (counted per folder), so 20 items (7 open, 13 archived)
are bound to a team without an entry and would be unbound with the record.

Verdicts:
- **Per-folder conversion holds**: no folder has a duplicate number or an unreadable header, so no folder hits a failure row of chapter 06
  section 5 except the team-file row (D-M6: folders 1, 3, 5, 6, 8 have no team item). Foreign references (11 in folders 4 and 7) are
  `owner/name#seq` texts, which chapter 06 keeps as unresolved references; nothing stops.
- **Folders without an index** (1, 3, 5, 6, 8, 9) all carry `priority` on every item, so the `fromItems` order of chapter 06 section 4.4 is
  available.
- **Per-folder counter seeding holds and matters**: in folders 8 and 9 the history holds a higher number than any file present (an item
  added and later deleted), so seeding from the files would reuse it; seeding from the history (chapter 05 section 4) gives 250 and 22.
  The scan (`git log --all --diff-filter=AR --name-only -- <folder>`) took 0.07 to 0.22 s per folder on a history of 21 753 commits, so
  the cache of chapter 05 section 2 is an optimisation, not a need. `--all` there includes `refs/stash` and a second branch: harmless
  (it can only raise the mark), and the dry run must name them.
- **Status copies**: all three folders with an index hold team items; the copies of chapter 06 section 4.6 change for them.
- **Split items whose parent is a team item** (12, all in folder 7) become references that user commands read as missing (R16); the dry
  run lists them, as chapter 06 section 1 says.

## 4. Test blast radius (item 2)

Context: 82 entries under `.agents/test`, of them 75 test files with 819 `test(...)` declarations (1135 tests at run time). Each
declaration was classified by the text of its own block (regular expressions over the block; the scripts are not committed): team
behaviour, a removed command or flag or file, markdown item format, an unprefixed variable only, or none of these. Whole files whose
subject is team behaviour or that import the team code are counted as one group. Counts are of declarations.

| group | files | tests | what happens | examples |
|---|---|---|---|---|
| Team behaviour moves into rules | 31 | 301 | delete; the behaviour is re-proven by `rule-cases.json` and the BDD scenarios of entry plan Task 3 (use the deleted tests as a coverage checklist) | `shared-team-*` 12 files 119; `shared-handoff-*` 5 files 70; `team-boundary` 16, `team-cli` 15 (15 `define`, 16 `workflow` uses), `workflow` 12, `shared-wip` 9, `shared-session-*` 3 files 22, `shared-unrefined-claim` 6, `shared-foreign-deps` 4, `skill-commands` 4, `team-spelling-docs` 3, `shared-twostage` 2; `plain-team-env` 7 (user commands ignore the team variable: inverted by R19a), `plain-team-items` 12 (user commands refuse team items: inverted by R3a/R16/R19) |
| Help and command documentation | 2 | 21 | rewrite with the new help texts | `shared-help` 18, `commands-documented` 3 |
| Removed command, flag or file in user-command files | 9 | 37 | delete | `move --to-repository` 26 uses in `shared-move-archive` (15 tests), 9 in `shared-sync-db` (9), 3 in `shared-stale` (2); `.smooth-backlog.json` 7 uses in `shared-origin-setting` (5), plus `shared-setup` 1, `storage-location` 1, `shared-audit` 2, `shared-safety` 1, `shared-store` 1 |
| Markdown item format | 32 | 223 | rewrite fixtures and assertions to JSON; 19 of them also touch team items | `shared-frontmatter` 32 (keep as tests of the migration's reader), `shared-update` 22, `shared-new` 21, `shared-sync` 17, `shared-store` 16, `shared-sync-db` 16, `shared-move-archive` 15, `shared-query` 14, `shared-audit` 13, `shared-stale` 9; `shared-item-keys` 3 and `shared-legacy-fields` 3 test behaviour the design removes (stored spellings, retired keys dropped on write): delete or turn into migration tests |
| Unprefixed variable only | 16 | 32 | rename mechanically | `no-child-process-proof` 4, `shared-origin-setting` 4, `script-runs` 3, `shared-checkout` 3, `shared-sync-db` 3 |
| None of the above | 35 | 205 | keep (upper bound) | `upgrade` 21, `shared-safety` 20, `shared-update` 17, `shared-sync` 12, `shared-new` 10, `shared-move-archive` 10, `storage-location` 10 |
| Total | 75 distinct (a file can sit in several groups) | 819 | | |

Two fixture files carry most of the change: `shared-fixtures.js` sets the unprefixed home and origin-URL variables for nearly every test
(`env()`, lines 92-100) and its `cli()` wrapper routes user commands on team items through `backlog team update --set-team` and the team
variable (lines 112-171); `shared-concurrency.js` writes markdown items. Rewriting both first turns most of the "unprefixed variable" and
part of the "keep" group into passing tests with no per-test change. The identity refusals that R15 removes are asserted in 10 places of
5 team files (inside the first group).

## 5. Staged landing on the live binary (item 4)

Context: every commit of the working branch is exported (`git archive` of `bin`, `src`, `templates`, ...) as the machine's `backlog`, used
at once by every agent session on the machine; other machines run installed releases that the self-update will not move across a
`backlogSchemaVersion` change. A stage is **breaking** when an agent or script that works with the previous commit fails with the next.

| stage | content | breaking? | precondition and check |
|---|---|---|---|
| 1 | evaluator, schema, `backlog team validate` reading only the new team file at its R22 location (after D-H4), `templates/teams/` shipped | no: today's engine reads the root `teams.json`, validate reads another path, no existing command changes | the owner and the teams write and validate their new-shape team files while the old engine keeps running |
| 2 | never-reused numbers in today's markdown code: high-water mark, `numbers.json`, publication above the upstream mark, shallow-clone refusal, `--seq` above the mark | no: numbers only rise; older releases ignore `numbers.json` (they read only `phases/` and `archive/`) | the backlog clones on the machine are not shallow (checked: not shallow) |
| 3 | R24 scope fixes in today's code (D-M1): own-folder conflict and unpublished guards, staging of named paths (D-H2), no foreign existence or cycle walk on write or publication; removal of `move --to-repository` | no for agents (refusals only disappear); `--to-repository` callers break (none found in the owner's scripts) | — |
| 4 | `backlog setup` copies the templates (R23) | no; setup and clean commit five more files | — |
| 5 | prefixed variables (R20) | **yes**: the runner and the installed skills export and read the old names; the origin-URL variable of the machine's session environment becomes unread (the single per-user record still resolves the backlog, `store.js:39`, so commands keep working), the agent identity falls back to the configured user, and the private-denylist guard of agents' test runs reads nothing | change the runner, the skills and the session environment in the same window; no team run active |
| 6 | the cut-over, one commit: JSON items, `backlog team migrate` with the tripwire (D-H3), the markdown stop, team commands on the evaluator, removal of `team define`, `team workflow --file` and every per-step flag, R15 identity, R3a/R16/R19/R19a user semantics, the root-configuration refusal, `backlogSchemaVersion` 2, the R25 record and advice, `templates/workflows/` deleted | **yes**, and it cannot be split further without an alias (R18): JSON reading without the migration stops every folder; the evaluator without migrated items has nothing to act on; the lead skill's start-up (`define`, `workflow --file`) and every per-step flag fail at once | every team file validates (stage 1), the dry run of each folder is reviewed, the runner and skills for the new commands are ready, no team run is active; after the deploy, run `backlog team migrate` in a checkout of each repository at once, then `backlog setup`. Rolling back to a pre-cut-over commit after a migration is the D-H3 case; the tripwire makes it refuse instead of corrupting |

Stages 1 to 4 can land in any order and are each safe on the live binary; stages 5 and 6 can land together or 5 before 6, never 6 alone
before the runner and skills change.

## 6. R24 audit of the real code (item 5)

Every path of today's code that reads, writes or stops because of something outside the own repository folder, and whether chapter 04
section 9 names it:

| path | what it does | in the design's list? |
|---|---|---|
| `sync.js:22,137` pull with rebase and autostash of the whole clone | moves every folder | yes (harmless) |
| `sync.js:67-75` `refuseConflicts` | stops every command on a conflict anywhere in the clone; greps `*.md` | **no** (D-M1) |
| `sync.js:79-84` `refuseUnpublished` | stops every command on an unpublished commit of any folder | **no** (D-M1) |
| `sync.js:90-101`, `:421-441` snapshot and `undoCommit` | reads and restores the whole clone's working tree in clone mode | **no** (D-M1, state as exception) |
| `sync.js:319`, `:352` publication: foreign existence and foreign cycle | reads other folders, refuses | yes (removed) |
| `sync.js:463-464` stale views over every folder of a publication | only multi-folder publications (cross-repository move) | yes (with `move`) |
| `new.js:154`, `update.js:268` foreign existence on write | reads another folder, refuses | **no**; coverage says BAKE-IN (D-M1) |
| `update.js:273` foreign cycle walk on write | reads other folders' items, refuses | **no** (D-M1) |
| `move.js:108-150` `--to-repository`; `move.js:154-167` `foreignDependents` (loads every folder of the backlog) | writes a second folder; one unreadable item anywhere stops the move | yes (removed) |
| `wip-limits.js:13`, `:30-40` limits file at the backlog root, in-progress count over every folder | used by user `--claim`, `update`, `move` | recorded in coverage (overall limit not expressible), not in section 9 |
| `store.js:199-215` `recoverJournal` | restores another folder's half-done change | **no** (state as exception) |
| `store.js:94-108`, `sync.js:28` the clone locks | serialise every folder | yes |
| `query.js:312` foreign item read for the list | read-only, one item | allowed |
| `src/team/handoff.js:85-97`, `team.js:241`, `views.js:25` | walks every folder (hand-off digest, `define` check, chunk scope) | yes (team code removed) |
| `update.js:147`, `archive.js:44`, `query.js:151` session repository instead of the working copy's | acts on another repository's folder by variable | **no** (D-H5) |

## 7. Setup, templates and the package (item 6)

- Copying: `src/shared/setup.js:124-131` checks every target with `safeTree` before any change and then removes and copies; the templates
  folder needs the same check in the first loop (lines 79-85), and `.backlog/team-templates` must be added to `wrote` (line 134) so the
  commit includes it. The spike (`setup.mjs`) skips the check.
- Shipping: `npm pack --dry-run` lists 62 files; `templates/` is shipped whole by the `files` list, so `templates/teams/*.json` ships with no
  change to `package.json`, and so does `templates/workflows/team.json` unless deleted (D-M8). The live deployment exports `templates`
  too. The tracked-files privacy test (`no-private-details.test.js`) scans the templates once they are tracked.
- Migration record: written into `.backlog/config.json` of the working copy (D-H5 for which one); in-repo mode commits it with the next
  backlog change (D-H2); the version comparison is inert (D-M4); setup on a markdown backlog is not allowed by chapter 06 (D-M5).

## 8. Concurrency and git (item 7)

- `git reset --keep`: drops the person's commits in in-repo mode (D-H1) and aborts on local changes that upstream also touched (D-M3).
- Publication: the in-repo mode pushes the person's whole branch (`sync.js:499`); "rebase as is when upstream changed only other folders"
  holds in clone mode, where today's `pull --rebase` already does it. The check "upstream changed its team file" can only see a team file
  inside the backlog clone; a team file in the code repository changes through the code repository, which the CLI never pulls in clone
  mode, so the 24-hour copy decides there (consistent with R21, worth one sentence).
- Lock: two lock files per clone (`smooth-backlog-cli.lock` around the publication, `smooth-backlog-cli-run.lock` around the command),
  both held during a re-run; budget conflict D-M2. The lock record names the agent from `--by`, `--agent`, the agent variable or `USER`
  (`src/storage.js:30`); with R20 that variable name changes too.
- `push-backlog-updates: false` (in-repo mode, `sync.js:60`): a team command never pushes, so it never meets a refused push and never
  re-runs; two clones then hand out numbers that only the high-water mark at the next push separates (behaviour 87).
