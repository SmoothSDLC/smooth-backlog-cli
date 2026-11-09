# 06 — The migration of every item from markdown to JSON

Context: owner ruling R4 stores items as JSON files and migrates every existing item, open and archived; the CLI migrates or fails, with
no second format and no alias. `backlog team migrate` converts item files only: it never touches `teams.json` (ruling R5). It runs once
per backlog, after the release that reads JSON and before any other command of that release can be used on the backlog. This chapter
fixes the order of the cut-over, the command, the data issues of real backlogs and the failures.

## 1. The order of the cut-over

Context: on a backlog that still holds markdown items, every command of the new release stops (section 2) except `backlog team validate`
and `backlog team migrate`, so the owner and the teams can prepare the switch without a half-migrated backlog. Ruling R18 allows no
backwards compatibility: a team entry still in today's shape is not read, it stops the migration.

1. **Each team rewrites its entry** in `teams.json` in the new shape (people, item definition, rule set; chapter 01) in its working copy of
   the backlog repository, and checks it with `backlog team validate --team <name>`. On a markdown backlog validate checks the file alone
   (chapter 08 sections 3 to 6) and says that the items are checked after the migration.
2. **The owner previews** with `backlog team migrate --show-all --dry-run`. It lists the conversion summary of section 2, every entry of
   `teams.json` that fails validation, every reference between an item without a team and a team item (hidden from user commands unless
   `--show-all` is given, ruling R16), the refs whose history seeds the number counters, and the field report of section 2.1 for every team.
3. **The owner migrates** with `backlog team migrate --show-all` (or `--team <name>`, section 2). Every entry of `teams.json` must pass
   validation, or the migration takes no action (R18).
4. **Each team repairs its items**: the report of section 2.1 lists every missing or invalid field; the team fixes them with
   `backlog team migrate --team <name> --ask` on a terminal, or with steps of its own rule set (for example a lead-only step that sets
   `status` from an argument, pattern `set-status-lead`). The CLI translates no word (ruling R1).

## 2. The command

Scenario: the owner upgrades the CLI; any other command on the backlog stops with
`❌ backlog: the items of <owner>/<name> are markdown files; run backlog team migrate once to convert every item to JSON` (exit 2). Only
`backlog team validate`, `backlog team migrate`, `backlog --help`, `backlog --version` and `backlog upgrade` run on a markdown backlog.

Like every team command, the migration needs a specific team or `--show-all` (rulings R3b, R14). The two forms differ only in which team's
items are checked against an item definition: **the conversion is always the whole backlog**, because ruling R4 allows no second format,
so a backlog half in markdown and half in JSON can never exist. `--team web` converts every item and reports the fields of team `web`'s items;
`--show-all` converts every item and reports every team's items. On a backlog already in JSON, the command converts nothing and only checks
and reports (and unbinds items of teams without an entry, section 4.1, with `--show-all` only).

- `backlog team migrate --team <name> --dry-run` (or `--show-all --dry-run`) — prints, per repository folder: the open and archived items
  converted, the items unbound (section 4.1), the split items linked (section 4.3), the folders whose order is built from `priority`
  (section 4.4), the index entries whose status copy changes (section 4.6), the counter value of every folder (chapter 05 section 4), every
  case that would stop the migration (section 5), the lists of section 1 step 2, and the field report (section 2.1). Writes nothing.
- `backlog team migrate --team <name>` (or `--show-all`) — converts, commits once (`backlog: migrate <n> items to JSON`) and pushes; prints
  the same summary with `✅`, then the field report.
- `backlog team migrate --team <name> --ask` — after the conversion (or on a JSON backlog), asks for each missing or invalid field of the
  team's items, one field at a time (section 2.2).

It reads no user identity. The commit is made by git's configured author; converted items keep their `updated` and `updated_by` values,
and a field set by `--ask` is recorded with the resolved agent (`--agent`, else SMOOTH_BACKLOG_CLI_AGENT; `--ask` needs one, exit 2 as
`backlog team update` does without it).

### 2.1 The field report (ruling R17)

Context: converted items keep their fields as stored, so a team's items may lack fields its new definition declares, or hold values it does
not allow. By default the migration only reports them; it changes no field.

For each item of the team (every team with `--show-all`), one line per problem, in item order, then a closing line:

```
item 1: field status: "pending" is not one of new, splitting, ready, in progress, checking, passed, closed
item 2: field estimate is missing (number)
item 2: field stage is not declared by the item definition
ℹ️  3 problems in 2 items of team parallel; backlog team migrate --team parallel --ask repairs them one field at a time on a terminal
```

The checks are the type and allowed-value checks of chapter 02 section 3 for every declared field the item carries, "missing" for every
declared field it lacks, and "not declared" for every field the definition does not name (case R17-01). Archived items are not checked (no
rule applies to them). The report does not stop the migration and does not change the exit code.

### 2.2 `--ask`: one field at a time, on a terminal

On a terminal, `--ask` takes the report's problems in order and asks on standard error, for example
`item 2, field estimate (number, Minutes of work, review included): `. The answer is checked like a written value (chapter 02 section 3); a
wrong answer repeats the question with the reason; an empty answer leaves the field as it is; for an undeclared field the question is
`item 2, field stage is not declared: remove it? (yes/no) `. The answers are written at the end in one commit, each item with a history entry
(`step` `migrate --ask`, `by` the agent); the end of the input before the last question writes nothing (`no answer; nothing was changed`),
as `backlog new --ask` does today. Without a terminal (standard input and standard error), `--ask` is refused before anything else, with the
text pattern of `backlog new --ask` (`src/shared/new.js:106`): exit 2,
`❌ backlog: --ask needs a terminal (standard input and standard error); run backlog team migrate --team <name> without --ask for the report`
(case R17-02).

## 3. Order of work

1. Take the clone lock, pull. Refuse on a shallow clone (chapter 05 section 2) and say which refs' history it reads (every ref the clone
   holds; the owner fetches the branches it wants counted first).
2. Load `teams.json` and validate the whole file in full (chapter 08 sections 3 to 6; the per-user record of chapter 01 section 4 is not
   used: the migration always validates, as `backlog team validate` does). A missing or unreadable file, or any entry that fails, stops
   the migration with no action (R18, section 5). The migration needs the team names to know which items to unbind, and an owner who wants
   every team item unbound writes `{}`.
3. For every `<owner>/<name>` folder: read every `.md` item file of `phases/` and of `archive/` (recursively) with today's front-matter
   reader (`src/shared/frontmatter.js`, which survives only here, as the reader of the cut-over and not as a second format); a file of
   `phases/` without a front-matter block is not an item and is left alone, as today. Build the folder's order (section 4.4) before anything
   is dropped.
4. Build each JSON file with the mapping of chapter 02 section 5 and the rules of section 4.
5. Check the whole backlog before writing anything (section 5).
6. Write every JSON file, remove every converted `.md` file, write `numbers.json` of every folder that ever held an item (chapter 05 section 4,
   folders without items today included) and the index of every folder, all through the journal; commit once; push.
7. Print the field report (section 2.1); with `--ask`, run section 2.2.

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
an item without a team to a team item: the parent is kept, and user commands see it only with `--show-all` (ruling R16). A team that wants such an item binds it with a rule of its own (example
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

The migration takes no action (no item, no file, nothing in the backlog) when any of these holds, and lists every case found, each with the file and the reason (exit 2):

| case | text |
|---|---|
| `teams.json` missing, unreadable or not an object | `teams.json cannot be read (<reason>); fix it, or write {} to unbind every team item on purpose` |
| the clone is shallow | chapter 05 section 2 |
| an item's header cannot be read | `<owner>/<name>/<path>: the header cannot be read (<reason>); restore it with git and run backlog team migrate again` |
| two items hold one number | `<owner>/<name>: number <n> is held by <slug a> and <slug b>; give one of them a free number in markdown and run again` |
| the JSON file name is taken | `<path>.json exists; remove it or rename it` |
| a symbolic link in a folder | today's path safety text |
| an entry of `teams.json` fails validation (for example one still in today's shape) | `team <t> fails validation in teams.json; rewrite it and run backlog team validate --team <t> first` (R18) |

After a successful migration every reader reads only `.json` items. A `.md` file with a front-matter block that appears in `phases/` or
`archive/` later (a branch merged from before the migration) stops every command with the text of section 2, and `backlog team migrate`
converts it.

## 6. No compatibility path after the cut-over (ruling R18)

Context: ruling R18 allows no backwards compatibility anywhere. The migration is the one moment old data is read; after it, every old form
fails with a text that names the way forward, and nothing reads it. The tolerance paths of today's code and what replaces each:

| today | after the cut-over |
|---|---|
| the markdown reader with both spellings of the header (`src/shared/frontmatter.js:259-298`) | used only inside `backlog team migrate`; any other command meeting a `.md` item stops (section 5) |
| the translation of old status words, `stage` and `review_state` on every read (`src/shared/status.js:71-136`) | removed; the values stay fields as stored and the team moves them with its own steps (section 1) |
| the write that drops retired keys (`src/shared/store.js:217-224`) | removed; the migration drops them once |
| the order built from `priority` when a folder has no index (`src/shared/index.js:54-58`) | used only inside the migration (section 4.4) |
| the root configuration file `.smooth-backlog.json` of earlier builds, still read (`src/shared/setup.js:16,24`) | not read: a repository that has it and no `.backlog/config.json` stops every command with exit 2, `❌ backlog: the backlog configuration is the old root file .smooth-backlog.json; move it to .backlog/config.json` |
| a done producer without hand-off records satisfies a dependency edge (`src/team/handoff.js:53-57`) | no coded edge at all; a team that wants that reading writes it as a rule (entry plan Task 6) |
| the environment variables without the prefix (TEAM_NAME, BACKLOG_AGENT, ...) | not read (ruling R20, no alias): a session that still sets only the old names has no team and no agent, and the command says so with the three-ways text |
| a team entry in today's shape (`lead`, `members`, `review`) | fails validation; its team commands and the migration take no action |

## 7. Scenarios for the BDD plan

The migration acts on files and git, so the evaluator spike does not run it (the counter seeding is spike test 7 of `numbers.test.mjs`).
Scenarios for the BDD plan (entry plan Task 3), with fixtures built from the forms above: "an open item of a team with an entry", "an item of
a team without an entry is unbound with the record", "an archived item of a team without an entry is unbound and otherwise unchanged",
"a missing teams.json stops the migration and nothing is written", "an unreadable teams.json stops the migration", "a teamless split item
gets its parent number", "two split lines: the first wins", "a split item whose parent is gone", "a folder without an index keeps its
priority order", "absent created and updated_by", "an unreadable header stops the migration", "two items with one number stop the
migration", "a shallow clone stops the migration", "every folder that ever held an item gets its counter", "a second run says nothing to
migrate", "a second run after a team entry is removed unbinds its items", "a markdown item after the migration stops a command",
"validate runs on a markdown backlog and checks the file only", "an entry in today's shape stops the migration and nothing is written",
"migrate without a team or --show-all stops with the three-ways text", "the field report lists a missing, an invalid and an undeclared
field", "--ask on a terminal repairs one field and records it", "--ask without a terminal is refused", "a repository with only .smooth-backlog.json stops with the move text", "a session with only the
unprefixed variables gets the three-ways text".
