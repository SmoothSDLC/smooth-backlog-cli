# 06 — The migration of every item from markdown to JSON

Context: owner ruling R4 stores items as JSON files and migrates every existing item, open and archived; the CLI migrates or fails, with
no second format and no alias. `backlog team migrate` converts item files only: it never touches `teams.json` (ruling R5). It runs once
per backlog, after the release that reads JSON and before any other command of that release can be used on the backlog. This chapter
fixes the command, its order of work, the data issues of real backlogs and the failures.

## 1. The command

Scenario: the owner upgrades the CLI; the next command of any kind on the backlog stops with
`❌ backlog: the items of <owner>/<name> are markdown files; run backlog team migrate once to convert every item to JSON` (exit 2). The
owner runs, from any repository that uses the backlog:

- `backlog team migrate --dry-run` — prints what would change, per repository folder: the number of open and archived items converted, the
  items unbound (section 4.1) and the split items linked (section 4.3), the counter value (chapter 05), and every item that would stop the
  migration (section 5). Writes nothing.
- `backlog team migrate` — converts, commits once (`backlog: migrate <n> items to JSON`) and pushes. Prints the same summary with `✅`.
  On a backlog with no markdown item it prints `ℹ️  nothing to migrate` and exits 0.

Team and agent: the command acts on every repository folder of the backlog and on every item, team or not; whether it requires a team
(owner ruling R3b reads as a requirement of every team command) is decision 1 of `decisions.md`. It reads no user identity; the commit is
made by git's configured author and the items keep their `updated` and `updated_by` values.

## 2. Order of work

1. Take the clone lock, pull (as every writing command).
2. Read `teams.json` for its team names only. A missing or unreadable file means "no team has an entry" (every bound item is then
   unbound, section 4.1), and the summary says so in its first line so the owner can stop and fix the file first.
3. For every `<owner>/<name>` folder: read every `.md` item file of `phases/` and of `archive/` (recursively) with today's front-matter
   reader (`src/shared/frontmatter.js`, which survives only here); a file of `phases/` without a front-matter block is not an item and is
   left alone, as today.
4. Build each JSON file with the mapping of chapter 02 section 5 and the rules of section 4.
5. Check the whole folder before writing anything (section 5).
6. Write every JSON file, remove every converted `.md` file, write `numbers.json` (chapter 05 section 2), rewrite the index with the same
   order (only the `status` copies may change, section 4.2), all through the journal; commit once; push.

## 3. What is converted, and how

Every key follows chapter 02 section 5. In particular: the body is copied byte for byte; `events` become history entries; the retired
keys `priority`, `work_class` and `review_classes` are dropped (the index, seeded before by today's code, already holds the order);
`depends_on` slugs become numbers; every key the CLI has no name for (the team keys of today's code) is copied into `fields` under its own
name with its value unchanged. No status word is translated: the CLI holds none (ruling R1).

## 4. Data issues of real backlogs

### 4.1 Items bound to a team that has no entry

Owner question Q-17, answered A with a record: the migration removes `team` from the item, keeps every other field as stored, and appends
to the body:

```
## Unbound by the migration (2026-11-12T09:00:00Z)

This item was bound to team <former team>, which has no entry in teams.json; backlog team migrate unbound it. The fields of that team are kept as they were.
```

The time is the time of the migration. The history gets an entry with `step` `migrate` and `changes` `{"team": ["<former team>", null]}`.
The item becomes an item without a team: user commands show it and can archive it. This applies to open and archived items alike. (A read
of a real backlog found 20 such files naming 7 teams.)

### 4.2 Archived files with old keys

Owner question Q-18 was answered B (no rule applies to archived items), and owner ruling R4 converts every item, archived ones included.
Both hold: an archived item is converted to JSON with its keys and values unchanged (older `title`, `last_updated`, `last_updated_by` and
`completed_at` are mapped as chapter 02 section 5 says; `stage`, `review_state` and every other team key stay fields as stored, so an
archived team item keeps its old words for ever), and no rule is evaluated on it, before or after. Archived items are not in the index,
so nothing else changes. (A read of a real backlog found 378 archived files.)

### 4.3 Split items without a team

Owner question Q-19, answered B: an item without a `team` whose body carries the line `Split from \`<slug>\`` stays an item without a team
and gets `fields.parent` = the number of the item that slug names (looked up in the same folder, open or archived). The parent is not
changed: the migration knows no team field name for children. When the slug names no item, `parent` stays null and the summary lists the
item (`split from <slug>, which no longer exists`). A team that wants such an item binds it with a rule of its own (example rule `adopt`,
case PAR-48).

### 4.4 Other cases

- Two files with the same number in one folder (possible today after `update --seq` races): the migration stops (section 5).
- A `depends_on` slug that names no item: kept as text and listed; `backlog team validate` and the reference check of the next write of
  that item report it.
- A key whose name is a key of the envelope inside `fields` cannot occur: envelope keys are mapped first.

## 5. Failures (migrate or fail)

The migration writes nothing when any of these holds, and lists every case found, each with the file and the reason (exit 2):

| case | text |
|---|---|
| an item's header cannot be read | `<owner>/<name>/<path>: the header cannot be read (<reason>); restore it with git and run backlog team migrate again` |
| two items hold one number | `<owner>/<name>: number <n> is held by <slug a> and <slug b>; give one of them a free number in markdown and run again` |
| the JSON file name is taken (a `.json` file of the same name exists) | `<path>.json exists; remove it or rename it` |
| a symbolic link in a folder | today's path safety text |

After a successful migration every reader of an item reads only `.json` files. A `.md` file with a front-matter block that appears in
`phases/` or `archive/` later (a branch merged from before the migration) stops every command with the text of section 1, and
`backlog team migrate` converts it.

## 6. Cases for the BDD plan

The migration acts on files and git, so the spike does not run it; these scenarios go to the BDD plan (entry plan Task 3) with fixtures
copied from the forms above: "an open item of a team with an entry", "an item of a team without an entry is unbound with the record",
"an archived item with old keys keeps them", "a teamless split item gets its parent number", "a split item whose parent is gone",
"an unreadable header stops the migration and nothing is written", "two items with one number stop the migration", "the counter is
seeded from a file deleted in the history", "a second run says nothing to migrate", "a markdown item after the migration stops a command".
