# Task 17: `backlog clean` removes only the entries of the items it deleted (B19b)


## 1. Goal & Scope

Goal: `backlog clean` and `backlog clean all-branches` delete from `index.json` exactly the entries of the items they deleted (matched by slug), and no other entry.

Out of scope: which items `clean` selects with or without `--show-all`, and the removal of the team-item refusal `CLEAN_TEAM` (Task 14 owns both); the order of the index (Task 16); the templates copy itself (done by `setup`, B25).

Specification: Task 17 of `.agents/docs/plans/completed/2026-11-11-team-rules-engine-remaining-work.md`. Use-case rows: 4 after the re-assignments named in section 6, which are made (list them with `awk -F'\t' '$6=="Task 17"' .agents/docs/plans/2026-11-12-simplify-branch-completion/use-case-status.tsv`). Delivered here, with the tests of section 5: `review-d.md section 1:D-M7` and `review-d.md section 2:D2-66` (clean removes only the index entries of the items it deleted; tests 1 to 4), `review-d.md section 2:D2-64` (clean runs setup again, with the templates and the advice; test 5). Six rows are NOT delivered by this task's text (`inventory.tsv:INV-054`, `inventory.tsv:INV-055`, `inventory.tsv:INV-056` in the `coverage` source, and `INV-054`, `INV-055`, `INV-056` in the `inventory.tsv` source): see section 6.

## 2. Architectural Decision Rules

- Plan, Task 17: "Modify `src/shared/clean.js` (the `delete idx.branches[branch]` and `idx.branches = {}` become removals of the deleted items' entries by slug)". Test: "a branch with two user items and one team item: after `clean` the index lists the team item once and no user item, the team item's file remains; `clean all-branches` the same; with `--show-all` the team item and its entry go too; another branch's entries are untouched; after `clean`, `git status` is clean and `.backlog/team-templates` exists."
- Design chapter 04 section 8 (`.agents/docs/plans/2026-11-09-team-rules-engine/design/04-team-commands.md`): "**`backlog clean` beside team items** (review D M7). Clean deletes the items it selects (without `--show-all`, only items without a team) and removes from `index.json` only the entries of the items it deleted; the entries of team items keep their places. Today it drops the branch's whole index list, or every list with `all-branches` (`src/shared/clean.js:47`), which would remove team entries too. Clean then runs setup again, as today (`src/shared/clean.js:53`); after R23 and R25 that setup run also copies the templates and prints the migration advice, and it commits and pushes what it wrote, as `backlog setup` does."
- Same chapter, the `--show-all` table row: "`backlog move <item> ...`, `backlog archive <item>`, `backlog archive done`, `backlog import ...`, `backlog clean ...` | team items are never selected | team items are moved ..., archived, imported and cleaned like any item."
- Design chapter 05 section 4: "**Archive, `backlog clean`, the `delete` effect** remove or move files and never lower the mark." (clean must not touch `numbers.json`).
- Owner rulings R3a: "a team item is not listed, shown, counted, queued, moved, archived, imported, cleaned or changed by a user command". R13: "Owner ruling 2026-11-09: the existing index structure stays as it is".
- Owner rulings R24: "Nothing a command does may affect the entire backlog. The scope of every command is the actionable repository's folder (and, where an item says so, its branch)."
- Specification of batch B19b: "The removal deletes the entries of the items it deleted from `index.json` (matched by slug) and no other entry: today `delete idx.branches[branch]` (and `idx.branches = {}` for `all-branches`) drops the whole list, team entries included. Without `--show-all` only items without a team are selected (B17's view); the refusal of team items (`CLEAN_TEAM`) goes with B18b." "Must not: touch the entries of another branch with `clean` of one branch." Audit item B19b-2: "`idx.branches = {}` and `delete idx.branches[branch]` (clean.js:48) would also remove team branches; scope them."
- Specification, "Breaking changes for the installed CLI": "`backlog clean` no longer refuses a folder with team items (it leaves them)." and the specification's note that clean's setup run already includes the templates: "B19b only adds a regression test for it."
- Recorded ruling (execution review record, Task 10 review): "#2 user WIP-limit refusal counts and names a team item: counting is owner ruling R3a; the name in the text -> Task 27 removes the limits" (not this task).

## 3. BDD Acceptance Criteria

BDD plan section 2.3, quoted: "clean leaves the index entries of team items in place | B19 | shared-move-archive". No feature file is assigned; unit and integration Given/When/Then from the specification's cases:

1. Given branch `main` holds user items 1 and 3 and team item 2, and the index lists all three, When `backlog clean` runs and the answer is `yes`, Then `index.json` lists the team item once and no user item, and the team item's file still exists ("after `clean`, the index lists the team item once and the user items not at all; the item files of the team remain").
2. Given the same folder, When `backlog clean all-branches` runs with `yes`, Then the same result. (source: "`clean all-branches` the same")
3. Given the same folder, When `backlog clean --show-all` runs with `yes`, Then the team item's file and its index entry are gone too. (source: "with `--show-all` the team item and its entry go too")
4. Given branch `release` also holds entries, When `backlog clean` runs for `main`, Then every entry of `release` is unchanged ("Must not: touch the entries of another branch").
5. Given the run succeeded, Then `git status --porcelain` of the backlog clone is empty, the advice line of `migrateAdvice(cfg)` (`src/shared/setup.js` line 97; it is returned only when the configuration names a backlog folder, so the test sets `backlog_repository` first) is on standard output after the `setup.run` call that `clean` makes, and `.backlog/team-templates` is present in the consumer checkout ("after `clean` a `git status` is clean and `.backlog/team-templates` is present (setup's work, B25)").
6. Given a clean that removes all user items of a branch whose list then holds only team entries, Then `numbers.json` is byte-identical (the mark never lowers). (source: "remove or move files and never lower the mark")

## 4. Target Files & Existing Helpers

Verified at the head:
- `src/shared/clean.js` (59 lines): import `CLEAN_TEAM` line 12; `clean(args, name)` line 25; `owned` line 35 and `refuse` line 36 and the early refusal line 37 (all three are Task 14's to replace); the confirmation line 38; inside `store.cloneLocked`: `sync.pull(home)` 40, the team re-check 42, `items = store.load(folder).filter(i => every || String(i.fm.branch || '') === branch)` 43, the `undoOnThrow` block 45-50 whose lines 47-49 are `const idx = index.read(folder); if (every) idx.branches = {}; else delete idx.branches[branch]; index.write(folder, idx);`, `sync.commitSettled(home, folder, name)` 51, `setup.run([])` 55.
- Helpers to reuse: `index.read(folder)`, `index.write(folder, idx)` (`src/shared/index.js:33`, `:51`; `index.text` already drops a branch whose list is empty), the slug of an item `i.fm.phase || itemSlug(i.path)` (`itemSlug` of `src/shared/item-file.js`; `index.js` keeps its own `slugOf`), `store.note`, `store.undoOnThrow(folder, fn)` (`src/shared/store.js:412`).
- Existing clean tests: `.agents/test/shared-routed-commands.test.js:69-90` (`clean` with `no`, `yes`, `all-branches`), `.agents/test/plain-team-items.test.js:135-141` (team refusal; Task 14 rewrites), `.agents/test/numbers.test.js:215`, `features/commands.feature` lines 96-102 (clean scenarios). `.agents/test/shared-move-archive.test.js` holds no `clean` command test at the head (its only match of the word is "the tree is clean" at line 206); the plan's phrase "clean tests" of that file is therefore satisfied by adding the new cases to `clean-index.test.js` only.

Interfaces.
- Consumes (from Task 14): `clean` selects items through the view (items without a team; with `--show-all` also team items) and no longer refuses a folder with team items; `--show-all` is parsed by `clean`.
- Consumes (exists now): `index.read`, `index.write`.
- Produces: the index of a folder after `clean` keeps every entry whose slug is not a deleted item's slug. No new export.

## 5. TDD Execution & Verification

Start check: confirm `grep -n -E 'CLEAN_TEAM|show-all' src/shared/clean.js` shows Task 14's state (no `CLEAN_TEAM`, flag parsed). If the refusal is still there the task stops (a dependency is missing).

Failing tests first, `.agents/test/clean-index.test.js` (new; helper `userCase` of `.agents/test/user-cases.js`, which writes items as stored and commits and pushes; run `clean` with `input: 'yes\n'`):
- `clean keeps the entry of a team item in the index and its file` (criterion 1; assert `index.json` entries by slug, the team file exists). Mutation killed: restoring `delete idx.branches[branch]` (the team entry disappears).
- `clean all-branches keeps the entries of team items` (criterion 2; two branches). Mutation: restoring `idx.branches = {}`.
- `clean --show-all removes the team item and its entry` (criterion 3).
- `clean of one branch leaves the other branches' entries` (criterion 4). Mutation: removing by branch key instead of slug.
- `after clean the backlog clone is clean and the templates are there` (criterion 5).
- `clean leaves numbers.json untouched` (criterion 6).

Docs (same commit): `CHANGELOG.md` (`## Unreleased (2.0.0)`: "`backlog clean` removes from the index only the entries of the items it deleted; the entries of team items keep their places"), `src/help.js` text of `clean`, `README.md` where it describes clean, `templates/skills/backlog/SKILL.md` and `references/commands.md`, `node .agents/scripts/sync-commands-md.mjs`.

Commands that must pass: `npm run check` (exit 0); `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<the private deny-list file> node --test .agents/test/no-private-details.test.js` (3 pass); `flock <suite lock file> node --test .agents/test/*.test.js` (fail 0); `flock <suite lock file> env FEATURE_LOCATION=local node --test .agents/test/features.test.js` and `FEATURE_LOCATION=remote` (fail 0, scenario count unchanged).

## 6. Must-not and Carry pointers

Must not (specification): touch the entries of another branch with `clean` of one branch; (plan Global) change `numbers.json`; delete a team item without `--show-all`; add `clean` code that reads the team file; cite the plan or a decision id in a comment or test title.

Carry pointers: Task 14 and this task both edit `src/shared/clean.js` (specification: "B19b ... both edit `clean.js`, so the batches are merged in order or rebased"): Task 17 starts from the head that contains Task 14. The execution review record's Task 10 note on `clean` is the Task 27 item above. Global: "No test is deleted, skipped or weakened except where its task names it."

Use-case rows not delivered by this task's text: `INV-054`, `INV-055` and `INV-056` (twice each; `src/shared/clean.js` lines 14, 27 and 30: the `die` helper, the refusal `unrecognized arguments: ... (usage: clean [all-branches])`, and the storage-location refusal `die(ask.text, ask.code)`; design disposition "machinery: command syntax of the user command clean (chapter 04)"). This task does not change `clean`'s argument syntax, and Task 14 edits it (`--show-all` is accepted by `clean`), so Task 14 should carry the six rows. If the plan's maintainer keeps them on Task 17, three tests in `.agents/test/clean-index.test.js` pin them: `clean extra` exits 2 with `❌ backlog: unrecognized arguments: extra (usage: clean [all-branches])`; an answer other than `yes` exits 2 with `not confirmed (type yes); nothing changed`; a configuration whose clone is missing exits with the `ask` text of `store.resolveHome`.
