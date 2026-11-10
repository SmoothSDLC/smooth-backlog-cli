# 08 — `backlog team validate`: feedback on the team file

Context: `teams.json` is written by a person or an agent, so checking it is a feedback loop (owner ruling R11): the answer must say, for
each problem, where it is, which rule, why it is a problem and what would fix it, and it must cover the whole file: the people, the item
definition and every rule. Every team command also runs the checks of its own team's entry before it evaluates anything (chapter 01
section 4), so a broken rule set is never used. This chapter lists every check and the form of the answer.

## 1. The command

- `backlog team validate --team <name>` — scenario: a lead edited `teams.json` to add a review step; before committing and pushing it runs
  `backlog team validate --team web` in its working copy of the repository that holds the team file (chapter 01 section 1.1). Like every team command it needs a specific team
  (`--team`, else SMOOTH_BACKLOG_CLI_TEAM_NAME, else the `team` key of `.backlog/config.json`; ruling R14). It always reads `teams.json` and
  validates the whole file in full (the shape of the file and every entry: lead decision b of R21), prints the findings of the file's shape
  and of the named team's entry and items, and exits 2 when any of those is an error.
- `backlog team validate --show-all` — the same, printing every team's findings (a scenario: the owner checks the whole file before the
  migration).
- `--json` — the same findings as a list, for a script or an agent.
- Every run refreshes the per-user validation record of chapter 01 section 4 (the SHA of what it read, the valid teams, now) when at least
  one team is valid, and writes the file's SHA into `.backlog/config.json` (key `teams_file_sha`) when it changed, so the lead commits the
  SHA with the edit (ruling R22); where chapter 01 section 1.1 keeps the SHA in the per-user record instead, only the record changes. It
  writes nothing else (ruling R5: the team file is only read). Validity is per team (question 4, provisional B): the exit code and the
  findings follow the named team's entry and the file's shape, and a run for one team never refuses because of another team's entry.
- No file at the resolved location: the text of chapter 01 section 1.1 (the resolved path and the three ways to define it), exit 2.
- On a backlog whose items are still markdown (before `backlog team migrate`), validate runs sections 3 to 6 on the file and prints
  `ℹ️  the items are markdown: run backlog team migrate, then validate checks them too`; sections 7 and 8 need JSON items (chapter 06
  section 1).

Exit 0 when there is no error (warnings may be printed), exit 2 when there is at least one error.

## 2. The form of a finding

One finding per problem, never only "invalid":

```
❌ teams.json: parallel.rules.table[11] (rule claim-dependencies): $item.depends_ons names no field of the item definition
   fix: add depends_ons to parallel.item or name one of status, estimate, holder, checker, parent, children, depends_on, handoff, rounds
⚠️  acme/app/phases/031-parse-the-header.json: field stage is not declared by the item definition of team parallel; rules cannot read it
   fix: declare it in parallel.item, or move its value with a step and remove it
✅ teams.json: 4 teams, 0 errors, 1 warning
```

With `--json`: `[{"severity": "error", "team": "parallel", "path": "rules.table[11]", "rule": "claim-dependencies", "problem": "...", "fix": "..."}]`.
`path` is the JSON path inside the team's entry (or the item file for an item finding); `rule` is the id of the rule or pop entry, or null for
people and item definition findings. The spike's `validate` returns these keys and implements every error check of sections 3 to 6
(cases VAL-01 to VAL-35; the five example files validate clean, cases VAL-EX-*); the warnings and the item checks of sections 7 and 8 are
left to the implementation.

**What ruling R18 asks of the validation, and where each part is.** Every required field: the keys of the file, an entry, `rules`, every
field definition, rule, pop entry and filter (sections 3 to 6 and the schema of chapter 03 section 14; `rules` must hold `table`, `pop`
and `filters`, each may be empty). The rules in their readable shape: one key per condition, known tests, functions and effects, closed
references, names, the routing-table order (section 6). The item definition (section 5). The coherence of the two: no rule, pop entry or
filter names a field, a value or a role the definition and the people lack (section 6). Every other check the CLI needs to use the file
safely: the `regex` subset and its size limits, no nested quantifier, reserved argument names (section 6). There is no tolerance path: an
entry in today's shape (`lead`, `members`, `review`) fails the schema like any other unknown key, and a failing entry is never used
(chapter 01 section 4).

## 3. File and team names

| check | severity | problem text (fix) |
|---|---|---|
| the file is valid JSON and an object | error | `teams.json is not JSON (<parser message, line and column>)` (correct the syntax at that place) |
| each key is a team name | error | `<key> is not a team name: lowercase letters, digits, - _ and :, starting with a letter or digit` (rename the team; case VAL-24) |
| each entry has exactly `people`, `item`, `rules`, and `rules` has exactly `table`, `pop`, `filters` | error | `<key> is not a key of a team entry (people, item, rules)` / `the entry has no <key>` |

## 4. People

| check | severity | problem text (fix) |
|---|---|---|
| `people` is an object with at least one person | error | `the team has no person` (add `"people": {"<name>": ["<role>"]}`) |
| each name is a plain name (no space, no comma, at most 64 characters) | error | `<name> is not a plain name` |
| each value is a non-empty list of distinct role words | error | `<name> has no role list` / `<name> has the role <r> twice` (case VAL-25) |
| a role that no rule reads | warning | `the role <r> is read by no rule, pop entry or filter` (remove it, or it is documentation) |

## 5. The item definition

| check | severity | problem text (fix) |
|---|---|---|
| a field name is not an envelope key | error | `<f> is a key every item has already` (choose another field name; case VAL-11) |
| `type` is known | error | `unknown type <t>` (use text, number, boolean, time, person, item, items or list) |
| `default` has the type and is among `values` | error | `the default <v> is not a <type>` / `the default <v> is not one of the values` (case VAL-26) |
| `values` is a non-empty list of distinct values of the type | error | `values must be a non-empty list of distinct <type> values` |
| `status` exists with `values` and `final`, and `final` is a non-empty subset of `values` | error | `the item definition has no status field with values` (case VAL-10) / `the status field has no final values` / `final value <v> is not a value of status` (case VAL-27) |
| `final` on another field | error | `final belongs only to the status field` (case VAL-27) |
| a field without `description` | warning | `<f> has no description; agents read the descriptions` |
| a field no rule, pop entry or filter reads | warning | `<f> is read by no rule` (data only is allowed; the warning says nothing reads it) |

## 6. Every rule, pop entry and filter

The schema of chapter 03 section 14 comes first: every key of every object is one of its list, else an error naming the closest valid key
(`wehn is not a key of a rule`, fix `did you mean when?`, case VAL-14). It runs on the entry, `rules`, every field, rule, pop entry,
filter, `do`, `related` entry, `note`, `place` and quantifier.

| check | severity | problem text (fix) |
|---|---|---|
| each rule has an `id`, unique in the team | error | `the rule has no id` / `the id <id> is used twice` |
| `step` is a word, a non-empty list of words or `"*"`; a step word is not a CLI flag name | error | `step must be a word, a list of words or "*"` (case VAL-32) / `help is a flag name of the CLI` (case VAL-35) |
| exactly one of `deny` and `do` | error | `a rule has exactly one outcome: deny or do` (case VAL-06) |
| a condition and a function have exactly one key | error | `a condition has exactly one key (found is, in)` (wrap several conditions in all; case VAL-13) |
| the key of a condition is a test of chapter 03 section 4, with the right form | error | `unknown test <k>` (with the closest test) / `<k> takes a list of two values` (case VAL-28: a malformed condition would otherwise make pop answer idle) / `not takes one condition` / `every takes items and match` |
| every function is known and well formed | error | `unknown function <k>` / `plus takes a list of values` (case VAL-29) / `count takes items and an optional match` |
| field, step and argument names are lowercase letters, digits, `-` and `_`, starting with a letter | error | `a.b is not a field name: ...` (case VAL-19) |
| `$item.<f>` and `$it.<f>` name a declared field or an envelope key | error | `$item.kids names no field of the item definition` (add it, or name one of ...; case VAL-02) |
| `$it` only inside `every`, `some`, `count` and a `related` entry | error | `$it.status is used outside every, some, count and related` (use $item; `$it` inside `related` is valid, case VAL-17) |
| no `every`, `some`, `count` inside another | error | `every inside another every, some or count` (split the rule; case VAL-08) |
| `$arg.<name>` is not a CLI flag name (team, agent, session, repository, branch, json, dry-run, help, version, show-all, ask) | error | `--help belongs to the CLI` (name the argument otherwise; cases VAL-19, VAL-22) |
| a reference is one of the closed list of chapter 03 section 5 | error | `$session.brnach is no reference` (use one of ...; case VAL-15) |
| a role literal compared with `$caller.roles` or `roles_of` is held by some person | error | `no person has the role boss` (give a person the role, or use one of ...; case VAL-03) |
| a literal compared with a field that has `values` is one of them | error | `doen is not a value of status (open, done)` (case VAL-04) |
| a `regex` pattern compiles on the linear matcher of chapter 03 section 4.1 | error | `not a pattern the CLI runs (<the first unsupported construct and where>)` (cases VAL-09, VAL-20, VAL-33: a reversed range `[z-a]`) / `the pattern is longer than 200 characters` / `the pattern is too large` |
| every effect is known; `set`, `add`, `remove` name declared fields; `add` and `remove` name list fields; the same inside every `related` entry | error | `<f> is no field of the item definition` (cases VAL-05, VAL-16) / `add needs a list field; <f> is <type>` |
| a literal written into a field has the type and is among its values | error | `shipped is not a value of status` (case VAL-12) / `field estimate: "abc" is not a number` (case VAL-34) |
| `team` effect is `"$team.name"` or `""`; `archive` and `delete` are `true` | error | `the team effect binds only to $team.name or unbinds with ""` (case VAL-23; a team never moves an item to another team) / `delete takes only true` (case VAL-31: `"delete": "no"` would otherwise delete) |
| a placeholder in a deny, say or note text is a valid reference | error | `{$item.kids} in the deny text: $item.kids names no field of the item definition` (case VAL-30) |
| shadowing (chapter 03 section 3): an earlier rule names every step of a later one and each of its clauses is a clause of the later rule, compared without regard to key order, an `in` covering an `is` of one of its values | error | `rule <b> can never decide: rule <a> above it matches every case it matches` (move b above a, or narrow a; cases VAL-01, VAL-18). Shadowing that only logic could prove (for example `>=` 3 above `>=` 5) is not found; the chapter 03 order rule still holds for it |
| a pop entry names a step some rule names | error | `no rule names the step claim` (case VAL-07) |
| an offered step whose allowing rules read an argument | warning | `pop cannot give --note to the step hand-to-check; the pop entry can only be refused` |
| a step that no rule can allow (only deny rules) | warning | `no rule allows the step <s>; it is always refused` |
| a filter has a `when` that is a valid condition | error | as for rules |

## 7. Items against their team (the repository's folder)

| check | severity | problem text (fix) |
|---|---|---|
| an item's `team` has no entry | error | `<path>: team <t> has no entry in teams.json` (add the entry back, or run backlog team migrate, which unbinds the items of teams without an entry with the record of chapter 06 section 4.1) |
| an open item's field value is not among the field's `values` (for example after a status word was removed from the definition) | error | `<path>: status "refining" is not a value of status of team <t>` (add the value back, or move the item with a step) |
| an item carries a field the definition does not declare | warning | `<path>: field <f> is not declared by the item definition of team <t>; rules cannot read it` |
| an `item` or `items` field names no item (a deleted or cleaned item), or a foreign `owner/name#seq` that does not resolve (its folder unreadable, still markdown, or without that item; ruling R24) | warning | `<path>: field depends_on names no item 99` (the item's other steps still work; a step that writes the field must drop the number) |
| two items of one folder hold one number (after a merge of code branches, chapter 05 section 2) | error | `<owner>/<name>: number <n> is held by <slug a> and <slug b>` (question 3, provisional A: when neither has a team, the next writing command renumbers the newer one; when either has a team, the folder's team commands stop until a person gives one of them a free number with `backlog update <slug> --show-all --seq <n>`) |
| an item's JSON `seq` differs from the number of its file name (a hand edit) | error | `<path>: seq <s> differs from the file name's number <n>` (restore the file; the mark reads file names only, review C section 5) |

## 8. Numbers

| check | severity | problem text (fix) |
|---|---|---|
| `numbers.json` of a folder is below the folder's high-water mark (a lowered or reverted counter) | warning | `<owner>/<name>/numbers.json says <last>, but number <mark> was used in commit <sha>` (the next allocation uses the mark anyway; set last to <mark> to make the file say so) |
| the clone is shallow | warning | `the clone is shallow: numbers are checked only against the history it holds` (git fetch --unshallow) |

Archived items are checked for none of the item checks of section 7 (no rule applies to them). These checks answer the earlier question of upgrading a
definition that items use (reference question Q-20): a team may change its definition at any time, and validate names every item the
change leaves with a value the definition no longer allows.
