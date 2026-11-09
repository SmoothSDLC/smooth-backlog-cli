# 06 — The migration of every item from markdown to JSON

Context: owner ruling R4 stores items as JSON files and migrates every existing item, open and archived; the CLI migrates or fails, with
no second format and no alias. `backlog team migrate` converts item files only: it never touches `teams.json` (ruling R5). It runs once
per backlog, after the release that reads JSON and before any other command of that release can be used on the backlog. This chapter
fixes the order of the cut-over, the command, the data issues of real backlogs and the failures.

## 1. The order of the cut-over

Context: on a backlog that still holds markdown items, every command of the new release stops (section 2) except two, so the owner and
the team can prepare the switch without a half-migrated backlog.

1. **The team rewrites its entry** in `teams.json` in the new shape (people, item definition, rule set; chapter 01) in its working copy of
   the backlog repository, and checks it with `backlog team validate`. On a markdown backlog validate checks the file alone (chapter 08
   sections 3 to 6) and says that the items are checked after the migration.
2. **The owner previews** with `backlog team migrate --dry-run`. It lists, besides the conversion summary of section 2: every entry of
   `teams.json` that is not in the new shape, with the number of open items bound to it; every open bound item whose `status` value its
   team's new definition does not declare; every reference between an item without a team and a team item (decision 3); and the refs
   whose history seeds the number counters.
3. **The owner migrates** with `backlog team migrate`. Whether it refuses while an entry with open bound items is not in the new shape is
   decision 4; the recommended answer is that it refuses, so no team item is left unreachable.
4. **The team moves its values** with steps of its own rule set where its words changed (for example a lead-only step that sets `status`
   from an argument, pattern `set-status-lead`), using the list of step 2. The CLI translates no word (ruling R1).

## 2. The command

Scenario: the owner upgrades the CLI; any other command on the backlog stops with
`❌ backlog: the items of <owner>/<name> are markdown files; run backlog team migrate once to convert every item to JSON` (exit 2). Only
`backlog team validate`, `backlog team migrate`, `backlog --help`, `backlog --version` and `backlog upgrade` run on a markdown backlog.

- `backlog team migrate --dry-run` — prints, per repository folder: the open and archived items converted, the items unbound (section 4.1),
  the split items linked (section 4.3), the folders whose order is built from `priority` (section 4.4), the index entries whose status copy
  changes (section 4.6), the counter value of every folder (chapter 05 section 4) and every case that would stop the migration (section 5),
  then the lists of section 1 step 2. Writes nothing.
- `backlog team migrate` — converts, commits once (`backlog: migrate <n> items to JSON`) and pushes; prints the same summary with `✅`. On a
  backlog with no markdown item it applies only section 4.1 to JSON items whose team has no entry (so it can be run again after a team entry
  is removed) and otherwise prints `ℹ️  nothing to migrate` and exits 0.

Team and agent: the command acts on every repository folder and every item, team or not; whether it requires a team (ruling R3b reads as a
requirement of every team command) is decision 1. It reads no user identity; the commit is made by git's configured author and the items
keep their `updated` and `updated_by` values.

## 3. Order of work

1. Take the clone lock, pull. Refuse on a shallow clone (chapter 05 section 2) and say which refs' history it reads (every ref the clone
   holds; the owner fetches the branches it wants counted first).
2. Read `teams.json`. A missing or unreadable file, or one that is not a JSON object, stops the migration (section 5): the migration needs
   the team names to know which items to unbind, and it never treats an unreadable file as "no team". A team that is gone on purpose is
   removed from the file; an owner who wants every team item unbound writes `{}`.
3. For every `<owner>/<name>` folder: read every `.md` item file of `phases/` and of `archive/` (recursively) with today's front-matter
   reader (`src/shared/frontmatter.js`, which survives only here); a file of `phases/` without a front-matter block is not an item and is left
   alone, as today. Build the folder's order (section 4.4) before anything is dropped.
4. Build each JSON file with the mapping of chapter 02 section 5 and the rules of section 4.
5. Check the whole backlog before writing anything (section 5).
6. Write every JSON file, remove every converted `.md` file, write `numbers.json` of every folder that ever held an item (chapter 05 section 4,
   folders without items today included) and the index of every folder, all through the journal; commit once; push.

## 4. Data issues of real backlogs

### 4.1 Items bound to a team that has no entry

Carried-forward ruling (owner question Q-17, answered A with a record): the migration removes `team` from the item, keeps every other field
as stored, and appends to the body:

```
## Unbound by the migration (2026-11-12T09:00:00Z)

This item was bound to team <former team>, which has no entry in teams.json; backlog team migrate unbound it. The fields of that team are kept as they were.
```

The time is the time of the migration. The history gets an entry with `step` `migrate` and `changes` `{"team": ["<former team>", null]}`.
The item becomes an item without a team: user commands show it and can archive it. This applies to archived items as well: the ruling says
"an item bound to a team that no longer exists", without exception, and a record in the body is how a converted archived item stays
truthful about the change (section 4.2).

### 4.2 Archived items

Owner question Q-18 was answered B (no rule applies to archived items, which stay as stored), and the later ruling R4 converts every item,
archived ones included; R4 supersedes the "read-only" part of Q-18 B for the file format only. An archived item is therefore converted to
JSON with its keys and values unchanged, except the two changes every item gets: the reading of both spellings of today's header (chapter
02 section 5) and the unbinding of section 4.1. No rule is evaluated on it, before or after. Archived items are not in the index. Archived
team items carry today's team keys (`stage`, `review_state` and others) and keep them as fields. (The names the current codec stores,
`title`, `last_updated`, `last_updated_by`, `owner` with `owned_since`, occur in a few open items written by the newest builds, not in
archived ones; they are read wherever they occur.)

### 4.3 Split items without a team

Owner question Q-19, answered B: an item without a `team` whose body carries a line `Split from \`<slug>\`` stays an item without a team and
gets `fields.parent` = the number of the item that slug names (looked up in the same folder, open or archived). When the body carries two
such lines, the first wins and the summary lists the item. The parent is not changed: the migration knows no team field name for children.
When the slug names no item, `parent` stays null and the summary lists the item. When the parent is a team item, the reference crosses from
an item without a team to a team item, which decision 3 settles. A team that wants such an item binds it with a rule of its own (example
rule `adopt`, case PAR-48).

### 4.4 The order of a folder without an index

Today a folder that has never been ordered keeps its order in each item's `priority` key (`src/shared/index.js:54-58`, `fromItems`: open
items first, then `priority`, then the number). The migration builds the index of such a folder with that same function before `priority`
is dropped, so the queue order is kept. A folder that has an index keeps it.

### 4.5 Values the envelope requires

An absent `created` becomes null and an absent `updated_by` (and absent `last_updated_by`) becomes empty text; both are valid envelope values
(chapter 02 section 2.1). The body is copied unchanged after the reader's normalisation (a leading byte-order mark removed, CR and CR LF line
ends turned into LF).

### 4.6 Status copies in the index

Today the index entry of a team item carries a word computed from the item (`src/shared/status.js`), which may differ from the stored
`status`. The JSON index carries the stored value (chapter 05 section 5), so those copies change; the summary counts them, and `backlog list`
then shows the stored word.

### 4.7 Other cases

- Two files with the same number in one folder: the migration stops (section 5).
- A `depends_on` slug that names no item: kept as text and listed; `backlog team validate` reports it afterwards.
- A key whose name is an envelope key inside `fields` cannot occur: envelope keys are mapped first.

## 5. Failures (migrate or fail)

The migration writes nothing when any of these holds, and lists every case found, each with the file and the reason (exit 2):

| case | text |
|---|---|
| `teams.json` missing, unreadable or not an object | `teams.json cannot be read (<reason>); fix it, or write {} to unbind every team item on purpose` |
| the clone is shallow | chapter 05 section 2 |
| an item's header cannot be read | `<owner>/<name>/<path>: the header cannot be read (<reason>); restore it with git and run backlog team migrate again` |
| two items hold one number | `<owner>/<name>: number <n> is held by <slug a> and <slug b>; give one of them a free number in markdown and run again` |
| the JSON file name is taken | `<path>.json exists; remove it or rename it` |
| a symbolic link in a folder | today's path safety text |
| (decision 4, if answered A) an entry with open bound items is not in the new shape | `team <t> has <n> open items and its entry is not in the new shape; rewrite it and run backlog team validate first` |

After a successful migration every reader reads only `.json` items. A `.md` file with a front-matter block that appears in `phases/` or
`archive/` later (a branch merged from before the migration) stops every command with the text of section 2, and `backlog team migrate`
converts it.

## 6. Scenarios for the BDD plan

The migration acts on files and git, so the evaluator spike does not run it (the counter seeding is spike test 7 of `numbers.test.mjs`).
Scenarios for the BDD plan (entry plan Task 3), with fixtures built from the forms above: "an open item of a team with an entry", "an item of
a team without an entry is unbound with the record", "an archived item of a team without an entry is unbound and otherwise unchanged",
"a missing teams.json stops the migration and nothing is written", "an unreadable teams.json stops the migration", "a teamless split item
gets its parent number", "two split lines: the first wins", "a split item whose parent is gone", "a folder without an index keeps its
priority order", "absent created and updated_by", "an unreadable header stops the migration", "two items with one number stop the
migration", "a shallow clone stops the migration", "every folder that ever held an item gets its counter", "a second run says nothing to
migrate", "a second run after a team entry is removed unbinds its items", "a markdown item after the migration stops a command",
"validate runs on a markdown backlog and checks the file only".
