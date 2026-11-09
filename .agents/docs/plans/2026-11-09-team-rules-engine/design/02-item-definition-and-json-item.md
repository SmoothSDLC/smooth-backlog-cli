# 02 — The item definition and the JSON item file

Context: an item is one unit of work in a repository folder of the backlog (`<backlog>/<owner>/<name>/`). Today it is a markdown file
with a front-matter header; owner ruling R4 makes it a JSON file. This chapter fixes the file (its envelope, its fields, its body and
its history), the item definition a team writes in `teams.json` to say what its fields are (owner ruling R7: data only), the built-in
definition of items without a team, and the mapping of every front-matter key of today to the JSON file. The migration that applies the
mapping is chapter 06.

## 1. Where an item file lives

- An open item: `<owner>/<name>/phases/<seq>-<slug words>.json`, for example `acme/app/phases/042-add-the-login-form.json`. The number is
  padded to three digits as today; a longer number is written whole.
- An archived item: under `<owner>/<name>/archive/`, in the same sub-folders as today. An item is archived when its file is there; no
  status word says so (decision D-26). Archived items are subject to no rule (owner ruling): no team step acts on them (case PAR-45).

## 2. The file

```json
{
  "seq": 42,
  "slug": "042-add-the-login-form",
  "name": "Add the login form",
  "team": "parallel",
  "repository": "acme/app",
  "branch": "main",
  "created": "2026-11-09T10:00:00Z",
  "updated": "2026-11-09T11:20:00Z",
  "updated_by": "member-1",
  "fields": {
    "status": "in progress",
    "estimate": 40,
    "holder": "member-1",
    "parent": 30,
    "children": [],
    "depends_on": [41]
  },
  "body": "# Add the login form\n\n**Objective:** ...\n\n## Hand-off (member-1, 2026-11-09T11:20:00Z)\n\nparser done; run the unit tests\n",
  "history": [
    { "at": "2026-11-09T10:00:00Z", "by": "lead-1", "session": "s-3", "step": "new", "changes": { "status": [null, "ready"] }, "note": "" },
    { "at": "2026-11-09T11:00:00Z", "by": "member-1", "session": "s-7", "step": "claim", "changes": { "status": ["ready", "in progress"], "holder": ["", "member-1"] }, "note": "" }
  ]
}
```

### 2.1 The envelope (keys every item has; CLI machinery)

Context: some keys are not team behaviour but the identity, the place and the audit of an item; the CLI writes them for every item, team
or not. A team's item definition cannot declare a field with one of these names, and no rule can write them, except the four effects of
chapter 03 section 8 (`team`, `branch`, `archive`, `delete`).

| key | type | written by | meaning |
|---|---|---|---|
| `seq` | whole number | the CLI at creation (chapter 05) | the item's number in its repository folder, never reused |
| `slug` | text | the CLI | the number and the name in file-name form |
| `name` | text | `--name` of `backlog new` or `backlog team new`; `backlog update --name` | the title (the index copies it) |
| `team` | text, or absent | `backlog team new`; a rule's `team` effect; the migration | the team that owns the item; absent = an item without a team |
| `repository`, `branch` | text | the CLI (the session's repository and branch); a rule's `branch` effect; `backlog move` for items without a team | where the item belongs |
| `created`, `updated`, `updated_by` | time, time, text | every write | when, and by whom: the agent for team commands, the user identity for user commands (R3, R3b) |
| `fields` | object | chapter 2.2 | the item's values |
| `body` | text (markdown) | creation, the `note` effect, `backlog update --append` | the description and the appended records |
| `history` | list of entries | every write | the audit: one entry per command that changed the item |

Rules read the envelope with the same reference as fields (`$item.seq`, `$item.team`, `$item.branch`) and also the derived key
`archived` (true when the file is under `archive/`; not stored).

### 2.2 The fields

The values of the item, one key per field. For an item of a team, what a field is comes from the team's item definition (section 3);
for an item without a team, from the built-in user item definition (section 4). A field that the item does not carry reads as its
definition's default (decision D-32). A field the item carries but the definition does not declare (possible after the migration or
after a team edits its definition) stays in the file untouched, is invisible to rules (a rule naming it is a validate error) and is
listed by `backlog team validate` as a warning (chapter 08 section 7).

### 2.3 The body and the history

- The body is free markdown. The `note` effect of a step appends `## <heading> (<agent>, <time>)` and the text; `backlog update --append`
  appends for items without a team as today.
- The history replaces today's `events` front-matter lines. Each entry: `at` (time), `by` (agent or user), `session` (BACKLOG_SESSION or
  empty), `step` (the team step, or the user command such as `update` or `done`), `changes` (each changed field with its value before
  and after; envelope keys too), `note` (the text of a `note` effect or of `--note`). `backlog history <item>` and
  `backlog team query <item>` print it. Rules do not read the history: anything a rule needs is a field (owner ruling R2).

### 2.4 Text form

The file is written with two-space indentation, keys in a fixed order (the envelope order above; inside `fields` the order of the
definition, then undeclared fields in alphabetical order), one history entry per line, and a final newline, so that the same item
always gives the same bytes and git merges changes to different fields. A file that is not valid JSON, or whose envelope has a wrong type,
is an unreadable item: every command of the folder names it and the key (exit 2), and `backlog update <item> --restore` (items without a
team) or a team step that rewrites the field is the way out, as today for front matter.

## 3. The item definition of a team

Context: owner ruling R7 says the item definition is data only: field names, types, descriptions, defaults and allowed values; all
dynamic behaviour is in the rule set. The definition is the value of the `item` key of the team's entry.

```json
"item": {
  "status":   { "type": "text", "default": "new", "values": ["new", "ready", "in progress", "closed"], "final": ["closed"], "description": "Where the item is." },
  "holder":   { "type": "person", "default": "", "description": "The member working on the item." },
  "children": { "type": "items", "default": [], "description": "Items split from this one." }
}
```

| key of a field | required | meaning |
|---|---|---|
| `type` | yes | one of the types below |
| `description` | no (validate warns when absent) | what the field means; printed by `backlog team query rules` and by `backlog team new --help` when a team is resolved |
| `default` | no | the value of a new item and of an item that lacks the field; when absent: empty text, 0, false, null or an empty list by type |
| `values` | no | the allowed values; a write of another value is refused (exit 2) |
| `final` | only on `status` | the values that finish an item: the index puts such items after the open ones (chapter 05); nothing else |

**The status field.** Every team definition declares `status` with `values` and `final` (a validate error otherwise). The CLI needs
the name because the index entry of every item carries a status (owner ruling R13: the index structure stays as it is); the words are
the team's. The CLI holds no status word of a team (owner ruling R1).

**Types** (the conversion of an argument into the type and the reference checks are machinery):

| type | stored as | a written value | checked |
|---|---|---|---|
| `text` | string | as given | `values` when present |
| `number` | number | an argument is converted; `abc` is refused: `❌ backlog: field estimate: "abc" is not a number` (exit 2, case COD-11) | `values` |
| `boolean` | true or false | `true` is true, anything else false | |
| `time` | ISO 8601 UTC text | `$now`, or a text the rule gives | |
| `person` | string | a key of `people`, or empty | `❌ backlog: field holder: "x" is not a person of the team (<names>)` (exit 2) |
| `item` | number or null | an item number, or empty for null | the item exists in the repository folder (open or archived), else `❌ backlog: field parent of item 31: no item 99` (exit 2) |
| `items` | list of numbers or `owner/name#seq` texts | a comma-separated argument or a list | each item exists (case COD-12); a foreign `owner/name#seq` must exist in that folder as today |
| `list` | list of strings | a comma-separated argument or a list | `values` for each entry |

The reference check of `item` and `items` is today's referential integrity of dependencies (reference inventory group DI-REF), now applied
by type to every such field. A team decides which of its fields are dependencies, children or a parent; the CLI only checks that the
numbers name items.

## 4. The built-in definition of items without a team

Context: user commands keep working on items without a team with no rule and no team file (owner rulings R3, R3a). Their fields are the
ones `backlog fields` documents today, minus the team rows, as a definition built into the CLI. Values are free text unless a type says
otherwise (decision D-19: a status is stored exactly as typed); the default words stay defaults only (decision D-33).

| field | type | default | set by |
|---|---|---|---|
| `status` | text | `pending`; `closed`, `done` and `archived` count as finished for `backlog list done`, `backlog list open` and the index order | `backlog new --status`, `backlog update --status`, `backlog done` writes `closed` |
| `objective`, `summary`, `location`, `commit` | text | empty (the commit of HEAD at creation for `commit`) | `backlog new`, `backlog update` |
| `severity` | text, values `normal`, `critical` | `normal` | `backlog new --severity` (a critical item is placed first) |
| `owner`, `owned_since` | text, time | the user identity at creation; empty | `backlog new`; `backlog update --claim`, `--release` |
| `depends_on` | items | empty list | `backlog new --depends-on`, `backlog update --set-depends-on` |
| `parent` | item | null | `backlog new --split-from <item>` (new: the split link, owner ruling on split items) |
| `estimate_min`, `complexity`, `layer`, `chunk` | number, text, text, boolean | empty | the existing flags of `backlog new` and `backlog update` |
| `completed` | time | empty | `backlog done`, `backlog update --close` |

`backlog new` writes only these fields (no team keys, finding F10 removed). A user item's `depends_on` and `parent` are data: stored,
checked for existence and cycles, shown; never a gate (decision D-18).

## 5. Mapping of today's front matter to the JSON file

Context: the reference file `reference/02-current-file-formats.md` documents the team files of today, not the item header. The key list
below is therefore taken from the code (`src/shared/new.js` writes the header, `src/shared/fields.js` documents it, `src/team/lifecycle.js`
and `src/team/handoff*.js` add team keys) and from a read-only count over a real backlog of 882 item files (open and archived; every one
readable by today's codec): 60 distinct keys. The migration (chapter 06) applies the mapping; a key not listed here is copied into
`fields` under its own name.

| front-matter key | JSON | rule of the mapping |
|---|---|---|
| `phase` | `slug` | as is |
| `seq` | `seq` | as is |
| `name`; older `title` | `name` | `title` only when `name` is absent |
| `repository`, `branch`, `team` | envelope | `team` is dropped (with a record, chapter 06 section 4.1) when the team has no entry in `teams.json` |
| `created`; `updated` or older `last_updated`; `updated_by` or older `last_updated_by` | envelope | the newer key wins when both exist |
| `events` | `history` | each line `<time> <event> <branch> <commit> <note>` becomes an entry with `step` = the event, `by` empty, `changes` empty, `note` the rest |
| `priority`, `work_class`, `review_classes` | dropped | retired keys; the order is the index (seeded before the migration, chapter 05) |
| `depends_on` | `fields.depends_on` | numbers stay numbers; a slug becomes the number of that item; `owner/name#seq` stays text; `none` or empty is an empty list |
| `status`, `objective`, `summary`, `severity`, `commit`, `location`, `owner`, `owned_since`, `estimate_min`, `complexity`, `layer`, `chunk`, `completed` | `fields.<same name>` | as stored; older `completed_at` becomes `completed` when `completed` is absent |
| every other key (the claim, review, refinement, decision, wait, session-author and hand-off keys of today's team code, and two pass-commit keys whose names carry a team name) | `fields.<same name>` | name and value unchanged. The CLI holds no team vocabulary, so it cannot translate `stage` or `review_state` into a team's words: a team that wants other words declares its own fields and moves the values with a step of its own (for example a lead-only step that sets `status` from an argument, pattern `set-status-lead`) |
| the body below the header | `body` | unchanged, byte for byte |
| a body line `Split from \`<slug>\`` of an item without a `team` | `fields.parent` | the number of that slug (owner ruling on split items; chapter 06 section 4.3) |

List and string values keep their YAML meaning: a YAML list becomes a JSON list, an integer a number, `true`/`false` a boolean, `null`
or `~` null.
