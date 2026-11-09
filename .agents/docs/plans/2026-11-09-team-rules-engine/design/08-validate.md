# 08 — `backlog team validate`: feedback on the team file

Context: `teams.json` is written by a person or an agent, so checking it is a feedback loop (owner ruling R11): the answer must say, for
each problem, where it is, which rule, why it is a problem and what would fix it, and it must cover the whole file: the people, the item
definition and every rule. Every team command also runs the checks of its own team's entry before it evaluates anything (chapter 01
section 4), so a broken rule set is never used. This chapter lists every check and the form of the answer.

## 1. The command

- `backlog team validate` — scenario: a lead edited `teams.json` to add a review step; before committing it runs the command in its working
  copy of the backlog repository. It checks every team of the file and every item of the backlog against its team.
- `backlog team validate --json` — the same findings as a list, for a script or an agent.
- Whether `--team <name>` (or TEAM_NAME, or the configuration's `team`) narrows it to one team, or is required, is decision 1.

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
people and item definition findings. The spike's `validate` returns exactly these keys (cases VAL-01 to VAL-12; the five example files
validate clean, cases VAL-EX-*).

## 3. File and team names

| check | severity | problem text (fix) |
|---|---|---|
| the file is valid JSON and an object | error | `teams.json is not JSON (<parser message, line and column>)` (correct the syntax at that place) |
| each key is a team name | error | `<key> is not a team name: lowercase letters, digits, - _ and :, starting with a letter or digit` (rename the team) |
| each entry has exactly `people`, `item`, `rules` | error | `<key> is not a key of a team entry (people, item, rules)` / `the entry has no <key>` |

## 4. People

| check | severity | problem text (fix) |
|---|---|---|
| `people` is an object with at least one person | error | `the team has no person` (add `"people": {"<name>": ["<role>"]}`) |
| each name is a plain name (no space, no comma, at most 64 characters) | error | `<name> is not a plain name` |
| each value is a non-empty list of distinct role words | error | `<name> has no role` / `<name> has the role <r> twice` |
| a role that no rule reads | warning | `the role <r> is read by no rule, pop entry or filter` (remove it, or it is documentation) |

## 5. The item definition

| check | severity | problem text (fix) |
|---|---|---|
| a field name is not an envelope key | error | `<f> is a key every item has already` (choose another field name; case VAL-11) |
| `type` is known | error | `unknown type <t>` (use text, number, boolean, time, person, item, items or list) |
| `default` has the type and is among `values` | error | `the default <v> is not a <type>` / `the default <v> is not one of the values` |
| `values` is a non-empty list of distinct values of the type | error | `values must be a non-empty list of distinct <type> values` |
| `status` exists with `values` and `final`, and `final` is a subset of `values` | error | `the item definition has no status field with values` (case VAL-10) / `final value <v> is not a value of status` |
| `final` on another field | error | `final belongs only to the status field` |
| a field without `description` | warning | `<f> has no description; agents read the descriptions` |
| a field no rule, pop entry or filter reads | warning | `<f> is read by no rule` (data only is allowed; the warning says nothing reads it) |

## 6. Every rule, pop entry and filter

| check | severity | problem text (fix) |
|---|---|---|
| each rule has an `id`, unique in the team | error | `the rule has no id` / `the id <id> is used twice` |
| `step` is a word, a list of words or `"*"`; a step word is not a CLI flag name | error | `step must be a word, a list of words or "*"` |
| exactly one of `deny` and `do` | error | `a rule has exactly one outcome: deny or do` (case VAL-06) |
| every key of a condition is a test of chapter 03 section 4, with the right form | error | `unknown test <k>` / `<k> takes a list of two values` |
| every function is known and well formed | error | `unknown function <k>` |
| `$item.<f>` and `$it.<f>` name a declared field or an envelope key | error | `$item.kids names no field of the item definition` (add it, or name one of ...; case VAL-02) |
| `$it` only inside `every`, `some`, `count` | error | `$it.status is used outside every, some or count` (use $item) |
| no `every`, `some`, `count` inside another | error | `every inside another every, some or count` (split the rule; case VAL-08) |
| `$arg.<name>` is not a CLI flag name (team, agent, session, repository, branch, json, dry-run) | error | `--team belongs to the CLI; name the argument otherwise` |
| an unknown reference root | error | `$foo.x is no reference (item, it, arg, caller, session, team, now)` |
| a role literal compared with `$caller.roles` or `roles_of` is held by some person | error | `no person has the role boss` (give a person the role, or use one of ...; case VAL-03) |
| a literal compared with a field that has `values` is one of them | error | `doen is not a value of status (open, done)` (case VAL-04) |
| `regex` pattern is a valid regular expression of at most 200 characters | error | `not a regular expression (<message>)` (case VAL-09) / `the pattern is longer than 200 characters` |
| every effect is known; `set`, `add`, `remove` name declared fields; `add` and `remove` name list fields | error | `<f> is no field of the item definition` (case VAL-05) / `add needs a list field; <f> is <type>` |
| a literal written into a field has the type and is among its values | error | `shipped is not a value of status` (case VAL-12) |
| `team` effect is `"$team.name"` or `""`; `archive` and `delete` are `true` | error | `the team effect binds only to $team.name or unbinds with ""` |
| a placeholder in a text is a valid reference | error | `{$item.kids} in the deny text names no field` |
| shadowing (chapter 03 section 3) | error | `rule <b> can never decide: rule <a> above it matches every case it matches` (move b above a, or narrow a; case VAL-01) |
| a pop entry names a step some rule names | error | `no rule names the step claim` (case VAL-07) |
| an offered step whose allowing rules read an argument | warning | `pop cannot give --note to the step hand-to-check; the pop entry can only be refused` |
| a step that no rule can allow (only deny rules) | warning | `no rule allows the step <s>; it is always refused` |
| a filter has a `when` that is a valid condition | error | as for rules |

## 7. Items against their team (the whole backlog)

| check | severity | problem text (fix) |
|---|---|---|
| an item's `team` has no entry | error | `<path>: team <t> has no entry in teams.json` (add the entry, or unbind the item with a rule of another team) |
| an open item's field value is not among the field's `values` (for example after a status word was removed from the definition) | error | `<path>: status "refining" is not a value of status of team <t>` (add the value back, or move the item with a step) |
| an item carries a field the definition does not declare | warning | `<path>: field <f> is not declared by the item definition of team <t>; rules cannot read it` |
| an `item` or `items` field names no item | error | `<path>: field depends_on names no item 99` |

Archived items are checked for none of these (no rule applies to them). These checks answer the earlier question of upgrading a
definition that items use (reference question Q-20): a team may change its definition at any time, and validate names every item the
change leaves with a value the definition no longer allows.
