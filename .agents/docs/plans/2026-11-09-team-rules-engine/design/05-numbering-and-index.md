# 05 — Item numbers and the index

Context: every item of a repository folder (`<backlog>/<owner>/<name>/`) has a number, and the folder's `index.json` holds the priority
order of its open items. Owner ruling R12 makes a number unique and never reused, at any size of backlog: not after the item is archived,
deleted or cleaned. Ruling R13 keeps priority apart from the number, in the index, whose existing structure stays as it is. User items and
team items share one number sequence. This chapter defines how a number is handed out so that no path gives a published number again, and
which index entries form the user queue and which form a team's queue.

## 1. The gap today

`nextSeq` (`src/shared/store.js:299`) hands out 1 plus the highest number among the item files present. Deleting the newest item
(`backlog clean`, or a deleted file) hands its number out again. The renumbering after a concurrent creation (`src/shared/sync.js:203`,
`renumber`, which renames a local new file only when another file holds its number) and `backlog move` to another repository folder
(`src/shared/move.js:134`) use the same function, so they share the gap. A plain counter file does not close it either: two clones that
both raise it from 100 to 101 rebase without a conflict, and `git revert` of a creation lowers it again (both reproduced by review A).

## 2. The high-water mark

Context: a number is "used" once any commit the clone can see added an item file with that number, whatever happened to the file later.
Git keeps that fact even when the file, the counter or the commit's effect is undone, so the design reads it from the history.

**The high-water mark of a folder** is the highest of:

1. every number in the name of an item file ever added or renamed under `<owner>/<name>/phases/` or `<owner>/<name>/archive/` in the
   history of every ref the clone holds, merge commits included (`git log --all -m --diff-filter=AR --name-only -- <owner>/<name>`;
   without `-m` git shows no change of a merge commit, so an item a person created while resolving a merge would be missed, review C M2);
2. every value of `last` ever committed to `<owner>/<name>/numbers.json` in that history (also with `-m`);
3. the item files and `numbers.json` of the working tree (a number the command itself just wrote).

A number above 1 000 000 000 is never a real item number (R12 expects tens of thousands of items). A file name in the history with such a
number is ignored, and an item file in the working tree with such a number is an unreadable item: every command of the folder stops with
exit 2 naming it until it is renamed or removed (review C M3: past 2^53 two allocations would otherwise get the same number; spike test "a
file-name number above the bound ...").

**Allocation** (`backlog new`, `backlog team new`, a renumbering; `backlog move` now moves only between branches of one folder and keeps
the number, chapter 04 section 9): the high-water mark plus 1; the command
writes `numbers.json` as `{"last": <n>}` in the same change. `numbers.json` is a committed record of the last number so that a person sees
it and validate can compare it; it is never trusted alone.

**What this closes** (each is a test of `evaluator-spike/numbers.test.mjs`, run on real git repositories):

| path that reused a number | why it no longer does | spike test |
|---|---|---|
| the newest item is deleted, cleaned or archived | its creation stays in the history (clause 1) | "deleting the newest item does not give its number again" |
| `git revert` of the commit that created an item | the reverted commit stays in the history (clauses 1 and 2) | "a reverted creation and a lowered or deleted counter ..." |
| `numbers.json` lowered by hand, or deleted | clause 2 reads every value it ever had | same test |
| another clone published a number, then deleted the item, before this clone pushed its own item with that number | publication (section 3) compares with the upstream high-water mark, not with the files present | "another clone published and deleted the same number ..." (team command) and "the same race through a user command ..." |
| two clones create at once | publication renumbers the later one | "two clones create at once ..." |
| a number held only by a merge commit, then deleted | clause 1 reads merge commits (`-m`) | "a number that exists only in a merge commit ..." |

**Shallow clones.** A shallow clone holds part of the history, so it cannot prove a number unused. Every command that allocates a number
refuses in a shallow clone: exit 2, `❌ backlog: the backlog clone is shallow, so numbers cannot be proven unused: run git fetch --unshallow`
(spike test "a shallow clone refuses to hand out a number"). Reading commands work.

**Cost.** Clause 1 and 2 read the history once per clone and then only the commits added since: the implementation keeps the last scanned
commit and the maximum per folder in the clone's state folder (`.git` or `.state`, never committed). One scan is bounded by the number of
item creations, which is the size of the backlog, not of the code history.

**Limits, stated.** A history rewritten by a force push can remove commits and so lower the mark; the CLI never force-pushes, and the
backlog repository's main branch should refuse force pushes. For a backlog kept inside a code repository (`backlog_repository: .backlog`),
items follow code branches: two branches that never saw each other can both hand out the next number. Publication of a branch onto its
upstream is covered by section 3; a merge of two code branches made with git outside the CLI is not, and the first CLI command after such a
merge finds two items with one number. What then happens is question 3 of `decisions.md`, applied provisionally as option A: when both
items have no team, the next writing command renumbers the one whose creation commit is newer, as today's renumbering does for added files
(its file name, `seq`, slug, heading and the references of items without a team follow it); when either item has a team, nothing is
renumbered: `backlog team validate` reports the duplicate as an error and every team command of that folder stops with exit 2, `❌ backlog:
number <n> of <owner>/<name> is held by <slug a> and <slug b>; give one of them a free number (backlog update <slug> --show-all --seq <n>),
then run the command again`, until a person renumbers one of them. A team item is never renumbered by the CLI on its own, so no reference
inside a team-defined field ever points at the wrong item (review C M1).

## 3. Publication: the number must be above the upstream mark

Context: a number is handed out in a local clone and becomes final only when it is pushed. The rule that makes it unique is checked at the
moment of publication, on the upstream state.

- **Team commands** (`backlog team new`, `backlog team update`, `backlog team pop`) never rebase a local change of a folder upstream also
  changed: only the command's own commit is dropped (`git reset --keep HEAD~1`), today's pull brings upstream in, and the whole command
  runs again on the upstream files; when upstream changed only other folders, the commit is rebased as it is (chapter 04 section 6,
  question 2). Either way the number is above the upstream mark.
  A re-run allocates from the upstream high-water mark, so a team creation can never collide.
- **User commands** keep today's rebase. After the rebase, every item file the local unpublished commits added whose number is not above
  the upstream high-water mark (computed on the upstream ref only) is renumbered above it, whether or not a file holds the number now; the
  file name, `seq`, `slug`, the body heading and the references of the local items follow it (today's `remapLocal`,
  `src/shared/sync.js:183`, on `depends_on`, `parent` and the body). A rebase conflict on `numbers.json` is resolved by taking the larger
  `last`; today's `repairConflicts` (`src/shared/sync.js:253`) refuses any conflict outside item files and the index, so it gains this one
  case (a code change).
- Only items created by the command being published are renumbered. A team item is never renumbered (a team creation is re-run instead,
  and a duplicate after a merge stops the team commands, section 2), so no reference inside a team-defined field ever has to follow a
  renumbering.

## 4. Other commands and numbers

- **`backlog update <item> --seq <n>`** (the repair of an item's number: items without a team, and a team item with `--show-all`, R19):
  refused unless `n` is above the high-water mark; the item takes `n`. Today's refusal while another item's `depends_on` names the
  number (`src/shared/sync.js:361-366`) stays. A lower number could be one a deleted item held. Text:
  `❌ --seq <n> is not above the highest number ever used in <owner>/<name> (<mark>); numbers are never reused`.
- **Archive, `backlog clean`, the `delete` effect** remove or move files and never lower the mark.
- **Migration** (chapter 06) writes `numbers.json` for the repository folder it converts, with `last` = the folder's high-water mark from
  the whole history, deleted item files included (spike test "the migration seeds its own folder from the folder's history ..."; a folder whose items are all gone needs no record, because every allocation reads the history anyway); it refuses on a
  shallow clone and its dry run names the refs whose history it read.

## 5. The index (structure unchanged)

The index stays as it is (owner ruling 2026-11-09): `{"branches": {"<branch>": [{"seq", "slug", "name", "status"}, ...]}}`, one line per
entry, position in the list = priority, open entries first, every live (not archived) item of the branch listed once. `status` is the
item's stored `status` value. "Open" is defined once, for the index and for a team's queue: an item is open when it is not archived and its
status is not one of the closing values (for a team item, the `final` list of its team's `status` field, chapter 02 section 3; for an item
without a team, `closed`, `done` and `archived`, decision D-33). Today the index holds a computed word for team items; after the migration it
holds the stored value (chapter 06 section 4.6).

## 6. The user queue and a team's queue

Context: one list per branch holds team items and user items together, in one priority order. The index has no team key, so a command
learns an entry's owner from the item file it already loads.

- **The user queue** of a branch is the index list of that branch without the entries whose item has a `team`. `backlog list`,
  `backlog next` and every user command read this filtered list; with `--show-all` they read the whole list (ruling R16, chapter 04
  section 8), and a reordering given `--show-all` moves the item among all entries of the branch.
- **A team's queue** is the open entries of the session's repository folder whose item has that team, in list order, branch after branch in
  the order of the index's branch keys (one branch when the session names one, the usual case). `backlog team pop` and the filters walk it.
- **Reordering keeps the other side's places.** A user reordering (`backlog update <item> --priority <n>`, `backlog update --replan`) moves
  only user entries among the positions user entries hold; team entries keep their positions. A team's `place` effect moves only that team's
  entries among the positions they hold. This is today's `within` permutation of `src/shared/index.js`, applied with "same owner" as the
  scope. Ranks a user sees (`P0`, `P1`) are ranks in the user queue; ranks in a team's output are ranks in that team's queue.
- **`place` values**: `first` and `last` (of the team's open entries of the branch), `{"before": <item>}` and `{"after": <item>}` (an item of
  the team on the same branch; otherwise the effect is skipped and the history entry says so). A new item without `place` goes to the end
  of its team's queue; a new user item to the end of the user queue, or first when critical, as today.
- **Merging** two clones' orders stays today's `mergeOrders` (`src/shared/index.js`), unchanged: it works on entries, whoever owns them.

## 7. Proof and scenarios for the BDD plan

The spike proves sections 2 to 4 on real git (`node --test numbers.test.mjs`, 12 tests). The BDD plan (entry plan Task 3) adds, with the CLI
itself: "two clones create an item at once" (both paths), "another clone published and cleaned a number before this push", "git revert of a
creation", "a shallow clone refuses `backlog new`", "`--seq` below the mark is refused", "migrate seeds its folder from the folder's history",
"a duplicate number of two items without a team after a code-branch merge is renumbered", "a duplicate number that involves a team item
stops the folder's team commands until a person renumbers it", "a number created inside a merge commit is not handed out again", "an item
file named with a number above the bound stops the folder", "a user priority change leaves team entries in place", "a team's place effect
leaves user entries in place".
