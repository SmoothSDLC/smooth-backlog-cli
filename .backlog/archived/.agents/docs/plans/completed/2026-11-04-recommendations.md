# PR #3 simplification — pre-implementation recommendations set

Written as a private document; moved into this repository on 2026-11-08 with the private details (machines, paths,
agent names) replaced by generic wording. State as of commit `2fd37fb` on `simplify/pr3-review` (worktree
`<worktree>`, based on `origin/team-cli-parity-1` = `fe40b5a`).

## 1. Where the branch stands (repo-grounded)

| Measure | Branch tip `fe40b5a` | `simplify/pr3-review` @ `2fd37fb` |
|---|---|---|
| Node suite | 916 tests, 916 pass | 899 tests, 899 pass, 0 fail, 0 skipped |
| BDD scenarios (both storage locations) | 48 × 2: remote 38 pass, local 4 pass | 50 × 2: 100/100 |
| `npm run check` | pass | pass |
| Private deny-list guard (private list) | 5 files hit | 0 hits |
| `src/` + `bin/` | — | −1657 / +735 lines (36 files) |
| Whole diff vs tip | — | 123 files, +4355 −6030 (features, REVIEW*, plan included) |
| Old mode names in src/tests/docs | many | 0 (`git grep -i "shared mode\|local mode\|use-backlog-repo\|use-local-repo\|mode.json" -- src bin .agents/test features README.md COMMANDS.md templates` → only the negative assertions) |

Done on the branch (commits 3a119fe … 2fd37fb): BDD runner and 50 scenarios; REVIEW.md; [2026-11-04-simplification-plan.md](../2026-11-04-simplification-plan.md);
one storage-resolution step (`store.resolveHome`); team rules only for team work; teams, leads, members and review
rules as configuration (`teams.json`); no agent/model/product name in the CLI; private-name scrub; one command set
(1.x modules deleted, `list` = `query`); the backlog is always a git repository and every change is committed and
pushed in both locations (`sync.commitInRepository`); README, COMMANDS.md, help, skill and CHANGELOG describe one
set; Phase 4 private backlog review (56 items: KEEP 11, MERGE 24, DROP 21; notes written, summary committed in the
private backlog repository).

## 2. Remaining changes, each with evidence and a recommendation

R1. **Exact duplicates still in the command surface** — `backlog query --pop --agent <a>` and `backlog next --agent <a>`
are `backlog pop --agent <a>` (query.js:149-153 routes both into pop.js with the same argv); `--headless` and
`BACKLOG_HEADLESS=1` are refused with "not in this build" (query.js:151,224; pop.js:332) — dead options in the help.
Allowed by the review prompt without approval (exact duplicate / dead). Recommendation: remove; `--plan` stays
(the lead's plan view, not a duplicate). → Phase 1.

R2. **Success/info output still names a backlog folder path** — pop.js:343 and query.js:172-176 print
``no folder ${folder}`` when a repository has no items yet. Owner rule: the structure is never shown except in a
failure. Recommendation: say "no backlog yet" and add the absolute-path check to the BDD scenario "the output never
names the item files or their folder". → Phase 1.

R3. **The committed SQLite mirror (`<owner>/<name>/backlog.db`) is the largest source of complexity and the only
binary that two writers conflict on.** Evidence: sync.js repairConflicts (229-298) + renumber.mirror + localDbs
(~120 lines), db.js replayLocal + reconcileFolders (205-294, ~90 lines), shared-sync-db.test.js (940 lines, 35 tests)
exist only to merge it. The mirror is not derivable from the files today because the item history (`query --events`)
lives only in its `event` table (16 `logEvent` writers; readers: query.js:264-274, move.js:153, db.js replayLocal).
Recommendation (two phases): (a) record each item's events in the item file's front matter (`events:` list of
strings) and read `query --events` from the files; (b) make the database a per-clone cache under the state folder,
rebuilt from the files on every connect, untracked in the backlog repository, and delete the conflict-repair code.
User-visible change: planning events that belong to no item (a `--replan`) are no longer listed by
`query --events` with no item. Needs the owner's decision (D2) because the private backlog repository's content
changes (the tracked `backlog.db` files are removed). → Phases 2–4.

R4. **Tests that pin repository wording instead of behaviour** — `.agents/test/shared-no-classes-repo.test.js`
(403 lines) holds an allow-list of every line in the repository that contains the words "class/classes" and breaks on
any edit of those lines (it broke twice during this review). `shared-no-classes.test.js` already pins the behaviour
(help, COMMANDS.md, README, templates, src name no class option). Recommendation: delete the repo-wide allow-list test;
keep the behaviour test. Not a user-facing change. → Phase 1.

R5. **`.agents/docs/` (13 entries: analysis, handoffs, specs, plans, releases) is internal process record in a public
repository** — it names jobs, items, owner decisions, agents and private workflow (the deny-list guard passes only
because the private hosts/paths were scrubbed). Recommendation: remove the folder from the public repository (the
history stays in git; the private backlog repository holds the process). Needs the owner's decision (D3). → Phase 5.

R6. **Documentation finalisation** — COMMANDS.md top sections, README and the skill now describe one set; still to do:
the "after" BDD table and the final counts in REVIEW.md section 3; REVIEW-LOG.md entries for Phases 1–6; the
pull-request text (summary, before/after counts, baseline vs final, recommended removals awaiting approval, test and
CI results, "a backlog review was done privately"). → Phases 5–6.

R7. **Final verification** — re-index codebase-memory after the push and prove with `search_graph`/`search_code` that
no mode split remains; whole-diff `ponytail-review`; `requesting-code-review` round; push; one PR into
`team-cli-parity-1`. → Phase 6.

R8. **Not recommended for change now (recorded only):** the hand-off record options of `update` (`--handoff*`,
`--accept-handoff`, `--reject-handoff`, `--checks`; 290 lines, 9 options) — a team feature with scenarios; the
per-user storage file `~/.config/<name>/home` (read, never written by the CLI; documented); the repository's own
commit hooks run on in-repository backlog commits (documented in REVIEW.md 2.9); detached-HEAD push wording.

## 3. Decisions — all given by the owner on 2026-11-04 (see [2026-11-04-pr3-simplification-log.md](../2026-11-04-pr3-simplification-log.md) "The owner's decisions")

A: every 1.x command stays as an alias. D (restated): pull before every action, push after every change, retry, stale
rejection with the item's diff — both locations. E: the live machine runs the branch HEAD at all times (done). F: no
database, no cache; unreadable item → field named, set it or `--restore`. D3: `.agents/docs` removed (amended 2026-11-08: except `.agents/docs/plans/`). D4: `setup`
names no path. Nothing is open.

## 4. Phase map

See README.md for the live table (Phases 1-4 done; 5 sync parity; 6 no database; 7/7b aliases; 8 documentation;
9 final verification and the one PR). Every phase ends with: suite 0 fail 0 skipped, BDD both locations green,
`npm run check`, private guard green, REVIEW-LOG.md rows added, and the committed HEAD live on the machine.
