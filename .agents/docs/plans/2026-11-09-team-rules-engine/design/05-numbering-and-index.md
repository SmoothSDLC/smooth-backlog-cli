# 05 — Item numbers and the index

Context: every item of a repository folder (`<backlog>/<owner>/<name>/`) has a number, and the folder's `index.json` holds the priority
order of its open items. Owner ruling R12 makes a number unique and never reused, at any size of backlog; ruling R13 keeps priority
apart from the number, in the index, whose existing structure stays as it is. User items and team items share one number sequence. This
chapter closes the reuse gap of today and fixes which index entries form the user queue and which form a team's queue.

## 1. The gap today

`nextSeq` (`src/shared/store.js:299`) hands out 1 plus the highest number among the item files present (open and archived). Deleting the
newest item (`backlog clean`, or a deleted file) hands its number out again. Renumbering on a concurrent creation
(`src/shared/sync.js:203` and `:253`) and `backlog move` to another repository folder (`src/shared/move.js:134`) also use `nextSeqFor`,
so they share the gap.

## 2. The number counter

- **File.** `<owner>/<name>/numbers.json` beside `index.json`: `{"last": 883}` — the highest number ever handed out in that folder. It is
  data, committed with the items, written through the journal like the index. It is a separate file because the index structure stays as
  it is (R13).
- **Allocation** (`backlog new`, `backlog team new`, `backlog move` into the folder, the renumbering of sync): the new number is
  `1 + max(last, highest number of the items present)`; `last` becomes that number in the same change. Taking the maximum with the
  items present means a counter that lags (a file restored from history, a hand-written item) can never hand out a number that is held.
- **Never lowered.** Archive, `backlog clean`, the `delete` effect and a deleted file do not touch `last`, so their numbers are never
  handed out again (case COD-08: with `last` at 100 and the highest present item at 12, the next item is 101).
- **Two clones at once.** Two clones that create an item each from the same `last` both write `last + 1`. The rebase of the second push
  stops on `numbers.json` (and on the item, as today). The repair (today's `repairConflicts`, `src/shared/sync.js:253`) takes the larger
  of the two `last` values, renumbers the local item exactly as today when its number is now held (its file, slug, references and body
  heading follow it), and writes `last` = the highest number after the renumbering. The counter only grows, and a number published once
  is never given to another item.
- **`backlog update <item> --seq <n>`** (the repair of an item's number, items without a team): refused unless `n` is above `last`; the
  item takes `n` and `last` becomes `n`. The old number is then retired. A lower number could be one that a deleted item held, and the
  counter cannot tell, so it is refused: `❌ --seq <n> is not above the last number handed out (<last>); numbers are never reused`.
- **Scale.** Allocation reads one small file and the item numbers the command already loaded; nothing grows with the history.
- **Seeding** (chapter 06): `backlog team migrate` writes `last` = the highest number among the item files of the folder and the item
  file names in the folder's git history (`git log --all --diff-filter=D --name-only -- <owner>/<name>/phases <owner>/<name>/archive`), so
  numbers deleted before the migration are not reused either. A folder without `numbers.json` after the migration (a new repository) starts
  at `last` = 0.

## 3. The index (structure unchanged)

The index stays as it is (owner ruling 2026-11-09): `{"branches": {"<branch>": [{"seq", "slug", "name", "status"}, ...]}}`, one line per
entry, position in the list = priority, open entries first, every live (not archived) item of the branch listed once. For a team item,
`status` is its `status` field (every team definition declares one, chapter 02 section 3) and "open" means a value not in the field's
`final` list; for an item without a team, the finished words are `closed`, `done` and `archived` as today (decision D-33).

## 4. The user queue and a team's queue

Context: one list per branch holds team items and user items together, in one priority order. The index has no team key, so a command
learns an entry's owner from the item file it already loads.

- **The user queue** of a branch is the index list of that branch with every entry whose item has a `team` taken out. `backlog list`,
  `backlog next` and every user command read this filtered list.
- **A team's queue** is the index lists of the session's repository folder with only the entries whose item has that team; for `pop`
  and `query` the open ones, in list order, branch after branch in the order of the index's branch keys (one branch when the session names
  one, which is the usual case).
- **Reordering keeps the other side's places.** A user reordering (`backlog update <item> --priority <n>`, `backlog update --replan`) moves
  only user entries among the positions user entries hold; team entries keep their positions. A team's `place` effect moves only that
  team's entries among the positions they hold. This is today's `within` permutation of `src/shared/index.js` (used for the session scope),
  applied with "same owner" as the scope. Rank numbers a user sees (`P0`, `P1`) are ranks in the user queue; ranks in a team's output are
  ranks in that team's queue.
- **`place` values**: `first` and `last` (of the team's open entries of the branch), `{"before": <item>}` and `{"after": <item>}` (an item of
  the team on the same branch; otherwise the effect is ignored and the history entry says so). A new item without `place` goes to the end
  of its team's queue; a new user item goes to the end of the user queue, or first when critical, as today.
- **Merging** two clones' orders stays today's `mergeOrders` (`src/shared/index.js`), unchanged: it works on entries, whoever owns them.

## 5. Cases

The counter is proven by cases COD-08 (the counter wins over the items present) and COD-09 (the items present win over a lagging
counter). The visibility of team items to user commands is cases COD-06 and COD-07. The concurrent repair, the seeding from git history
and the filtered reorderings involve git and files and are left to the BDD plan (entry plan Task 3) as named scenarios: "two clones create
an item at once", "migrate seeds the counter from deleted files", "a user priority change leaves team entries in place", "a team's place
effect leaves user entries in place".
