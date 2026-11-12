# Task 16: The open-first order per owner (B19a)


## 1. Goal & Scope

Goal: `index.reconcile` orders the entries of a user command per owner, so that a user reordering or a user item reaching a final word moves only user entries among the positions user entries hold, and `--show-all --priority <n>` places the item at position `n` of the whole branch list.

Out of scope (later tasks own): `backlog clean` and the index (Task 17); the session guard (Task 18); the retired priority-based seed order of `fromItems` (Task 30); deleting `src/shared/seam.js` and the old team code that still sets `seam.inScope` (Task 28); the flag `--show-all` itself on `update` (Task 13, consumed here).

Specification: Task 16 of `.agents/docs/plans/completed/2026-11-11-team-rules-engine-remaining-work.md`. Use-case rows: 2 after the re-assignments named in section 6, which are made (list them with `awk -F'\t' '$6=="Task 16"' .agents/docs/plans/2026-11-12-simplify-branch-completion/use-case-status.tsv`). `BDD-2.3-21` (a user priority change leaves team entries in place) is pinned by `update u3 --priority 0 leaves team entries in place` of `.agents/test/team-order.test.js` and by the unit test of `.agents/test/shared-index.test.js`; `BDD-2.3-22` (a team's `place` effect leaves user entries in place) is pinned by `a team close step moves only its team's entries`, which lives in `.agents/test/team-commands.test.js` (the file the row names); `BDD-2.3-23` (clean leaves the index entries of team items in place) is NOT delivered by this task: see section 6.

## 2. Architectural Decision Rules

Quoted word for word, with source.

- Plan, Task 16 "Decisions": "entries outside the scope keep their absolute positions; `order` lists the scope's open entries only (a user's `P0` is the first user entry). `--show-all --priority n`: scope = every entry; the item goes to position n of the branch list as it stands (clamped); the user partition is re-applied; team entries are not re-partitioned."
- Plan, Task 16 "Interfaces": "Consumes `reconcile(idx, items, { move, lead, exclude, renames, inScope, branches, open })` (with `open` the partition already acts among the scope's positions). Produces the user default: `inScope = item => !item.fm.team`, `open = item => !FINAL.includes(item.fm.status)`."
- Plan, Task 16 files: "Modify `src/shared/index.js` (`reconcile`: the default scope of a user command is items without a team, the default openness `FINAL` of `src/shared/item-definition.js`), `src/shared/store.js` (`reflow`, `reorder` take the scope and `showAll` instead of `seam.inScope`), the callers in `update.js`, `new.js`, `move.js`, `archive.js`".
- Design chapter 05 (`.agents/docs/plans/2026-11-09-team-rules-engine/design/05-numbering-and-index.md`) section 5: "open entries first ... \"Open\" is defined once, for the index and for a team's queue: an item is open when it is not archived and its status is not one of the closing values (for a team item, the `final` list of its team's `status` field, chapter 02 section 3; for an item without a team, `closed`, `done` and `archived`, decision D-33)."
- Same chapter, section 6: "**Reordering keeps the other side's places.** A user reordering (`backlog update <item> --priority <n>`, `backlog update --replan`) moves only user entries among the positions user entries hold; team entries keep their positions. A team's `place` effect moves only that team's entries among the positions they hold. This is today's `within` permutation of `src/shared/index.js`, applied with \"same owner\" as the scope. Ranks a user sees (`P0`, `P1`) are ranks in the user queue; ranks in a team's output are ranks in that team's queue." And: "**Merging** two clones' orders stays today's `mergeOrders` (`src/shared/index.js`), unchanged: it works on entries, whoever owns them." And: "**The user queue** of a branch is the index list of that branch without the entries whose item has a `team`. ... a reordering given `--show-all` moves the item among all entries of the branch."
- Owner rulings R13 (`00-owner-rulings.md`): "Owner ruling 2026-11-09: the existing index structure stays as it is; a summary is not required in the index."
- Owner rulings R3: "User commands (`backlog new`, `update`, `list`, ...) enforce nothing about flow, status words or team behaviour. The CLI ignores the team file unless a command runs under the `backlog team` hierarchy." (so `reconcile` for a user command never reads the team file and cannot know a team's final words).
- Specification of batch B19a, bullets: "In `reconcile` the stable partition (open entries before closed ones) is applied through `within`, that is, among the positions the scope holds, instead of across the whole branch list; `arrangeBranch` (...) does the same for the open entries of the scope. Entries outside the scope keep their absolute positions. The default scope of user commands is the items without a team (`!item.fm.team`), the default openness for them is the built-in definition's final list `closed`, `done`, `archived` (a constant next to the built-in definition, replacing the use of `status.js` here); a team command passes its team's entries as the scope and `open` built from the entry's `final` list." And: "`--show-all` with `--priority <n>`: the scope is every entry of the branch; the item is placed at position `n` of the list as it stands (clamped to the list), and then each owner's partition is applied: user entries by the user words, team entries are not re-partitioned (the user command does not know their final words)."
- Specification, disagreement 1 (accepted): "the partition is applied per owner, inside the positions that owner holds (B19a); a user reconcile never moves a team entry, a team command never moves an entry outside its scope; chapter 05 section 5 is corrected to say \"each owner's open entries come before that owner's closed entries\"". Reason given: "two commands that partition globally with different words would move the same entry back and forth, changing the index (and conflicting) on every write."
- Specification, "Decided in this draft": "B19: openness of a user item is the built-in definition's final list (`closed`, `done`, `archived`), placed next to the built-in definition; `status.js`'s fixed words are not used by the index any more."
- Specification, B19a "Must not": "read the team file; change `mergeOrders`; change the index's file format (ruling R13)." Plan Task 16 "Must not": "read the team file; change `mergeOrders`; change the index format."
- Specification, decision on Q4 (second decision text): "--priority n with --show-all is the position in the branch's list of the index."
- Recorded rulings, execution review record: "B17a: --replan and every reorder keep team entries in place (inScope) and add history entries only to items in scope; with tests." and, from Task 10's review: "Start checks ...: priority = position TRUE (adopted)" (a row's priority is its position among the entries the view sees) and "#4 showAll module state: no action (every command is its own process)".

- Design chapter 04 section 8 (`design/04-team-commands.md`), the `--show-all` table row for `--replan`: "`backlog update --replan`, `backlog done <item>` | team items are not touched | team items named are reordered or closed like any item." and the row for `update`: "`--priority` moves the item among all entries of its branch".

## 3. BDD Acceptance Criteria

The BDD plan (`.agents/docs/plans/2026-11-09-team-rules-engine/implementation/02-bdd-plan.md`, section 2.3) names two scenarios for this batch, quoted: "a user priority change leaves team entries in place | B19 | shared-index" and "a team's `place` effect leaves user entries in place | B19 | team-commands". No feature file is assigned to B19 (section 2.5 lists none), so the criteria are unit and integration Given/When/Then from the specification's cases ("Cases and scenarios" of B19a):

1. Given a branch list `u1 t1 u2 t2 u3` (items 1, 3, 5 without a team, items 2, 4 of a team, all pending), When `backlog update u3 --priority 0` runs, Then the list is `u3 t1 u1 t2 u2` (specification: "`update u3 --priority 0` gives `u3 t1 u1 t2 u2`").
2. Given a team item in a folder with user entries around it, When `backlog team update <item> close` runs on the parallel template (its rule `close` carries the effect `place` with the value `last`), Then no user entry changed its position ("a team's `place` effect leaves user entries in place").
3. Given user items `u1 (done) t1 u2`, When any user command reflows the index, Then the closed user item `u1` comes after the open user item `u2` and `t1` keeps its position (a user item closed moves behind the user's open items and no team entry moves; specification: "a user item closed moves behind the user's open items and no team entry moves").
4. Given a team item whose team's final word is `accepted` (user words call it open), When a team command reaches that word, Then it moves behind that team's open entries and no user entry moves ("a team item that reaches a final word of its team moves behind that team's open entries and no user entry moves"). This is already proven at function level in `shared-index.test.js` (test "reconcile with open: a word the fixed list does not know finishes a team item ..."); keep it green and add the command-level case through `team update`.
5. Given a folder holding user and team items, When a user command and then a team command run in turn twice, Then the second run changes nothing in `index.json` ("produce no change of the index on the second run (no flip)").
6. Given user items, When `backlog new` creates a user item, Then it is appended inside the user positions ("a new user item is appended inside the user positions").
7. Given `u1 t1 u2`, When `backlog update u2 --show-all --priority 0` runs, Then the list is `u2 u1 t1`; and with `--priority 1` the list is `u1 u2 t1`, so the user item sits before a team entry that it could not pass without the flag (specification: "`--show-all --priority 0` moves a user item before a team entry").
8. Given team entries between user entries, When `backlog update --replan u3` runs without the flag, Then team entries keep their positions ("`update --replan` leaves team entries in place"; this already passes after Task 10 and must keep passing).

## 4. Target Files & Existing Helpers

Verified at the head (`grep -n` shown in the execution log):

- `src/shared/index.js`: `showAll` line 17, `sees` line 18, `isOpen` line 27 (uses `isOpen as workflowOpen` of `status.js`), `within(list, inScope, arrange)` line 80, `reconcile` lines 96-128 (signature `reconcile(idx, items, { move, lead, exclude = [], renames = new Map(), inScope = () => true, branches: only, open, view = () => true } = {})`; `scoped` 107, `opened` 108, `arrangeBranch` 109-113, partition loop 114-115, move 116-124, lead 125, `order` 126), `rows` 211.
- `src/shared/item-definition.js:38`: `export const FINAL = ['closed', 'done', 'archived'];`
- `src/shared/store.js`: `const inScope = i => seam.inScope(i.fm) && index.sees(i)` line 378; `reflow(dir, move = {})` 383-389; `reorder(dir, idents)` 392-406 (its lookup list `open` line 394 uses `inScope(i)`); import of `seam` line 18.
- Callers of `store.reflow`/`reorder`: `src/shared/new.js:209`, `update.js:202` (`store.reorder`), `update.js:329` (`store.reflow(folder, moveTarget !== null ? { slug: row.slug, target: moveTarget, branches } : { branches })`), `move.js:93,105,146,147`, `archive.js:118`, `repair.js:42`, `sync.js:707` (`commitSettled`'s reflow). Team callers of `reconcile`: `src/team/apply.js:46` passes `{ open: openFn, inScope: scope }` and `:61` adds `move`: they stay unchanged and must keep passing.
- Old team code still sets `seam.inScope` (`src/team/team.js:184`); leave it (Task 28 deletes `seam.js`).
- Reuse: `within`, `FINAL`, `index.sees`, `reconcile`'s existing `inScope`, `open`, `move`, `lead` options.

Interfaces.
- Consumes (exist now): `index.showAll(on)`, `index.sees(item)`, `reconcile` as above, `store.reflow(dir, move)` returns `[[slug, rank]]`.
- Consumes from Task 13 (verify): the `--show-all` flag of `update` sets `index.showAll(true)` and `update.js` passes the priority move to `store.reflow`.
- Produces: `reconcile` defaults `inScope = i => !i.fm.team`, `open = i => !FINAL.includes(statusOf(i))` (the open-less branches and the `isOpen` constant of `index.js` become dead and are deleted; the `open` export of `src/shared/index.js` line 229 still uses `workflowOpen`); `store.reflow(dir, move)` and `store.reorder(dir, idents)` pass no `inScope` and, under `--show-all`, place as the quoted rule says; `reorder`'s lookup list uses `index.sees(i)`. No new export, no new option.

## 5. TDD Execution & Verification

Start checks (grep, report each): (a) at the head `showAll(command === 'team')` is set by `src/shared/router.js:33`; (b) after Task 13 the user flag also calls it; (c) `store.reorder` still names items through `inScope`.

Tests, written first and seen failing (`node --test <file>`):

`.agents/test/shared-index.test.js` (function level; helpers `view`, `entries`, `slugsOf` exist at lines 118-122):
- NEW `reconcile: a user item closed moves behind the user's open items and a team entry stays`: items `view(1,'', 'done'), view(2,'t','pending'), view(3,'','pending')`, after `reconcile(entries(1,2,3), items)` the closed user item 1 comes after the open user item 3 and the team entry (item 2) is at the position it held (the quoted "a user item closed moves behind the user's open items and no team entry moves"). Kills: the global partition (it moves the team entry). (source: "a user item closed moves behind the user's open items and no team entry moves")
- CHANGED (named in the commit body with the reason: the user default is now per owner): `reconcile without open: the callers of the user commands get the global open-first order they always had` becomes `... get the open-first order among the user's own positions`, its expectation becomes the quoted rule "a user item closed moves behind the user's open items and no team entry moves" (the team entry no longer moves) instead of the old global order. (source: "a user item closed moves behind the user's open items and no team entry moves")
- NEW `reconcile: the order lists the open user entries only` (the quoted "`order` lists the scope's open entries only (a user's `P0` is the first user entry)": on `u1 t1 u2` the ranks are 0 for `u1` and 1 for `u2`, and `t1` has none). (source: "`order` lists the scope's open entries only (a user's `P0` is the first user entry)")
- KEEP green unchanged: the two `reconcile with open` tests of `.agents/test/shared-index.test.js` at lines 124 and 132. (source: "No test is deleted, skipped or weakened except where its task names it.")

`.agents/test/team-order.test.js` (NEW, real commands; helpers `userCase` of `.agents/test/user-cases.js` for items, `world`/`putItem` of `.agents/test/team-fixture.js` for team commands):
- `update u3 --priority 0 leaves team entries in place`: items 1..5, team on 2 and 4, expected index slugs `u3 t1 u1 t2 u2` (read `index.json`). (source: "`update u3 --priority 0` gives `u3 t1 u1 t2 u2`")
- `a closed user item moves behind the user's open items; no team entry moves`. (source: "a user item closed moves behind the user's open items and no team entry moves")
- `a team close step moves only its team's entries` (in `.agents/test/team-commands.test.js`, the file the BDD row names; the other tests of this list are in `team-order.test.js`) (`backlog team update <item> close --team parallel --agent <holder>` on the parallel template: user entries keep absolute positions). (source: "a team's `place` effect leaves user entries in place")
- `a user command and a team command in turn change nothing on the second run` (byte comparison of `index.json`). (source: "produce no change of the index on the second run (no flip)")
- `a new user item is appended inside the user positions`. (source: "a new user item is appended inside the user positions")
- `--show-all --priority 0 moves a user item before a team entry` (needs Task 13's flag). (source: "`--show-all --priority 0` moves a user item before a team entry")
- `update --replan leaves team entries in place` (also in `user-visibility.test.js`, keep). (source: "`update --replan` leaves team entries in place")
Each test's mutation: revert the per-owner partition (global `openFirst`) and the test about `u3 t1 u1 t2 u2` or the close case must fail; make the `--show-all` placement count only open entries and the `--show-all --priority 0` test (the specification's case "`--show-all --priority 0` moves a user item before a team entry") fails.

Docs (AGENTS.md rule: a change of behaviour ships with its documentation in the same commit): `CHANGELOG.md` (`## Unreleased (2.0.0)`: "a user reordering and a user item reaching a closing word move only items without a team; `--show-all --priority <n>` is a position in the whole list of the branch"), `src/help.js` (the `update --priority` text and the `--show-all` line, as they stand after Task 13), `README.md` where it describes priority, `templates/skills/backlog/SKILL.md` and its `references/commands.md`, then `node .agents/scripts/sync-commands-md.mjs`. None may describe the old global order.

Commands that must pass (Node 24; `TMPDIR` a scratch folder):
- `npm run check` (exit 0)
- the private-details guard: `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<the private deny-list file> node --test .agents/test/no-private-details.test.js` (3 pass, 0 fail)
- the full suite under the suite lock: `flock <suite lock file> node --test .agents/test/*.test.js` (fail 0)
- `flock <suite lock file> env FEATURE_LOCATION=local node --test .agents/test/features.test.js` and the same with `FEATURE_LOCATION=remote` (fail 0; scenario count unchanged)

## 6. Must-not and Carry pointers

Must not (plan): "read the team file; change `mergeOrders`; change the index format." Also: write a history entry on an item outside the scope; read `seam.inScope` in `store.js`; change what a team command passes to `reconcile`.

Carry pointers addressed to this task (execution review record): "B17a: --replan and every reorder keep team entries in place (inScope) and add history entries only to items in scope; with tests" (Task 10 landed the test `update --replan leaves team entries in place`; keep it). From Task 10's post-merge review: "Not-checked item: sync.js renumber/repairConflicts could renumber an unpushed team item during a user command's publication race -> Task 21" (not this task). Global: "Every commit leaves the whole suite green"; "No test is deleted, skipped or weakened except where its task names it. A test whose expectation changes is named in the commit body with the reason." (the one changed test above is named); "No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id."

Use-case rows not delivered by this task's text: `BDD-2.3-23` ("clean leaves the index entries of team items in place | B19 | shared-move-archive") is delivered by Task 17 (its tests `clean keeps the entry of a team item in the index and its file` and `clean all-branches keeps the entries of team items`); the row's task column says Task 16, so the plan's maintainer re-assigns it to Task 17.
