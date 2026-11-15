# Team rules: specification of the rules engine

Status: written 2026-11-15 from the owner's decisions 53 to 57 and the lead's decisions 58 to 61 ([decisions.md](decisions.md)). It is complete: no decision it depends on is open. Its JSON Schema is [team-rules.schema.json](team-rules.schema.json); the team file ([team-file.schema.json](team-file.schema.json)) holds one rule set per team. Examples: [teams.example.json](teams.example.json), [default-team.json](default-team.json).

## Contents

1. What the rules are for
2. The change: what triggers the rules
3. The evaluation of a change
4. A rule
5. The evaluation context
6. Conditions
7. Kinds of rule, with examples
8. How rules relate to each other
9. The queue (`backlog team pop`) and filters
10. Error texts
11. Validation of the rules
12. What the rules engine does not do
13. Research behind this design

## 1. What the rules are for

A team works on items by changing their fields with team commands. The rules say which changes are allowed. The CLI applies them and knows nothing of the team's way of working: no status word, role, step or phase. A team describes its way of working in words in the `description` of its rule set and of each rule; the words explain, the rules decide (decision 56).

## 2. The change: what triggers the rules

Every team command that would change an item builds a **change**: the item as it is (`prev`) and the item as it would be (`next`). Every rule is evaluated against every change (decision 53).

| Command | `command` | `prev` | `next` |
|---|---|---|---|
| `backlog team new` | `new` | `null` | the new item: base properties, the definition's defaults, the given title, description and fields |
| `backlog team update <item> <property> <value>` | `update` | the item | the item with that property set |
| `backlog team archive <item>`, `archive done` (item by item) | `archive` | the item | the item, unchanged |
| `backlog team import`, `branch import` (item by item) | `move` | the item | the item with its new `branch` |
| `backlog team pop` with `take` (9) | `update` | the item | the item with the values of `take` |

Reading commands (`list`, `show`, `query`) make no change and trigger nothing. A change of priority triggers nothing: priority is not a property of the item.

## 3. The evaluation of a change

1. **Structure.** `next` must fit the item schema and the team item definition: every required property set, every value of its field's type, a value of a field with `values` one of them. Failures are returned like rule errors.
2. **Rules.** For every rule: if `when` is absent or true, `require` must be true; if it is false, the rule fails. Every rule is evaluated, also after a failure.
3. **Result.** No failure: `next` is written as one change of the item, with one history entry (command, caller, every changed property with before and after). Any failure: nothing is written, exit 1, every failing rule's error is returned (10).

Rules have no order and no hierarchy: each is true or false of the same change, and all must be true, so the order of reading cannot change the result (decisions 55 and 58). `--whatif` evaluates and writes nothing.

## 4. A rule

| Key | Required | Meaning |
|---|---|---|
| `id` | no | A number or short text, used only by validation to name the rule; when absent, validation names it by its place (`rules[4]`). |
| `description` | no | Words for people: what the rule protects. |
| `when` | no | A condition (6): the changes the rule concerns. Absent: every change. |
| `require` | yes | A condition that must hold for the change when `when` holds. |
| `error` | yes | The text returned when `require` fails (10). |

## 5. The evaluation context

A condition reads the change through `{"var": "<path>"}`:

| Path | Value |
|---|---|
| `prev.<property>` | the property before the change; `prev` is `null` for `new` |
| `next.<property>` | the property after the change |
| `command` | `new`, `update`, `archive` or `move` |
| `changed` | the list of properties whose value differs between `prev` and `next` (every property set, for `new`) |
| `caller.name`, `caller.roles` | the agent of the command and its role words in the team (an empty list for someone not of the team) |
| `team.name`, `team.people`, `team.items` | the team, its people (name to role words), and its open items of the branch, the changed item as it would be |
| `session.id` | the session given to the command |
| `now` | the time of the command |

A property is a base property or a field of the team item definition; any other path is reported by validation (11).

## 6. Conditions

A condition is JsonLogic: an object with one key, the operator, whose value is the list of operands; operands are literals, `var`, or other operations.

The conditions are evaluated with json-logic-js, the reference implementation of JsonLogic (decision 62). Every standard operator is accepted, with the semantics of that library: `var`, `missing`, `missing_some`, `if`, `==`, `===`, `!=`, `!==`, `!`, `!!`, `or`, `and`, `>`, `>=`, `<`, `<=` (also with three operands, between), `in` (in a list, or a text in a text), `cat`, `substr`, `+`, `-`, `*`, `/`, `%`, `min`, `max`, `map`, `filter`, `reduce`, `all`, `some`, `none`, `merge`. `==` and `!=` convert between types as JavaScript does; rules should use `===` and `!==`, and validation reports `==` and `!=` as a warning.

Extra operators, for what JsonLogic lacks, added to the library with its `add_operation` before each evaluation (so `changed`, `item` and `outer` can read the change being evaluated). The library evaluates the operands of an added operator before calling it, so an added operator cannot test each element of a list itself; counting uses the standard `filter` with `length`:

| Operator | Form | Gives |
|---|---|---|
| `changed` | `{"changed": "status"}` | true when the property's value differs between `prev` and `next`, lists and objects compared by content |
| `item` | `{"item": number}` | the open or archived item of the team with that number, or `null` |
| `length` | `{"length": list or text}` | the number of elements or characters; with `filter`, how many elements satisfy a condition: `{"length": {"filter": [list, condition]}}` |
| `roles_of` | `{"roles_of": person}` | the role words of a person of the team, or an empty list |
| `regex` | `{"regex": [text, pattern]}` | true when the text matches; patterns are matched in linear time by the `re2` package (decision 75) |
| `age` | `{"age": time}` | seconds from the time to `now` |
| `outer` | `{"outer": "next.holder"}` | inside `map`, `filter`, `reduce`, `all`, `some` or `none`, where `var` reads the element, reads a path of the whole context |

An empty list or `null` is false, anything else true, as in JsonLogic.

## 7. Kinds of rule, with examples

All rules have the form of 4; the kinds differ only in what `when` and `require` read.

### 7.1 Transition: what must hold for a field to go from one value to another

"From `new` to `reviewed`, `holder` must be set, `acceptance` must not be empty and `estimate` must be 60 or less."

```json
{"when": {"and": [{"===": [{"var": "prev.status"}, "new"]}, {"===": [{"var": "next.status"}, "reviewed"]}]},
 "require": {"and": [{"!!": {"var": "next.holder"}}, {"!!": {"var": "next.acceptance"}}, {"<=": [{"var": "next.estimate"}, 60]}]},
 "error": "from new to reviewed: holder set, acceptance written, estimate at most 60"}
```

Rules refuse; they do not list permitted moves. To allow only some moves, one rule refuses every other:

```json
{"when": {"changed": "status"},
 "require": {"in": [{"cat": [{"var": "prev.status"}, ">", {"var": "next.status"}]}, ["new>active", "active>closed"]]},
 "error": "status moves new to active to closed only"}
```

### 7.2 Field: what must always hold

```json
{"require": {"<=": [{"var": "next.estimate"}, 120]}, "error": "an item is at most 120 minutes of work; split it"}
```

### 7.3 Lock: a field that may no longer change

```json
{"when": {"and": [{"in": [{"var": "prev.status"}, ["active", "closed"]]}, {"changed": "acceptance"}]},
 "require": false, "error": "acceptance is locked once an item is active; split the item instead"}
```

### 7.4 Permission: who may make a change

```json
{"require": {"!!": {"var": "caller.roles"}}, "error": "the caller is not a person of the team"}
{"when": {"===": [{"var": "next.status"}, "closed"]}, "require": {"in": ["lead", {"var": "caller.roles"}]}, "error": "only a lead closes an item"}
```

### 7.5 Relation: a condition over other items

"An item becomes active only when every item it depends on is closed." "A member holds one active item."

```json
{"when": {"and": [{"changed": "status"}, {"===": [{"var": "next.status"}, "active"]}]},
 "require": {"all": [{"map": [{"var": "next.depends_on"}, {"item": {"var": ""}}]}, {"===": [{"var": "status"}, "closed"]}]},
 "error": "the items this one depends on are not all closed"}
{"when": {"===": [{"var": "next.status"}, "active"]},
 "require": {"<=": [{"length": {"filter": [{"var": "team.items"}, {"and": [{"===": [{"var": "status"}, "active"]}, {"===": [{"var": "holder"}, {"outer": "next.holder"}]}]}]}}, 1]},
 "error": "the holder already holds an active item"}
```

### 7.6 Creation: what a new item needs

```json
{"when": {"===": [{"var": "command"}, "new"]}, "require": {">": [{"var": "next.estimate"}, 0]}, "error": "a new item needs --estimate <minutes>"}
```

`backlog team new` takes the fields of the team item definition as `--<field> <value>` beside `--title` and `--description`.

## 8. How rules relate to each other

- A rule never sets a value and never names, calls or triggers another rule (decision 59).
- Rules depend on each other through the fields of the item. Rule A protects a field (`acceptance` must be written to leave `new`); rule B reads it (`acceptance` cannot change once `active`). Together they make the way of working, without either knowing the other.
- What a team wants to follow from a change is a field the caller sets in a change, and a rule that requires it. For example a member sets `holder` before setting `status` to `active`, and a rule requires `holder` to be the caller.
- There is no hierarchy: every rule must hold (3).

## 9. The queue (`backlog team pop`) and filters

`queue` is an ordered list of entries: `roles` (role words it is for; absent: everyone), `match` (a condition on an open item of the team, read with `var` as the item's properties and `outer` for the context) and optionally `take` (properties and values). `backlog team pop` takes the first entry whose `roles` include one of the caller's and has a matching item; the first such item in priority order is offered. With `take`, pop makes the change of those values (2) and every rule applies; a refused item is skipped for the next; nothing left: idle, exit 3. A value of `take` may be the literal `"$caller"`, the caller's name.

`filters` are named conditions on an item, each with a `description`, read with `backlog team list --filter <name>`.

## 10. Error texts

`error` is the text the caller sees. Values may be put in with `{...}` and a path of 5: `{prev.status}`, `{next.estimate}`, `{caller.name}`; a path that cannot be read gives an empty text. A refusal returns every failing rule: in JSON (the default of team commands) `{"refused": [{"rule": "<id or place>", "error": "..."}]}`; with `--human`, one line per failing rule. Exit 1.

## 11. Validation of the rules

`backlog validate` and `backlog team validate` check every team of the team file at once; any finding makes the whole file invalid (round 12, question 4):

1. the file fits [team-file.schema.json](team-file.schema.json) and each rule set fits [team-rules.schema.json](team-rules.schema.json);
2. every operator is one of 6; every regular expression can be matched in linear time;
3. every path a rule, queue entry or filter reads is one of 5 and names a declared property;
4. every literal compared with a field that has `values` is one of them;
5. every `error` exists and every path it puts in can be read;
6. contradictions between literals: a rule whose `require` cannot hold under its own `when` (for example `when` next.status is closed and `require` next.status is not closed); two rules whose `when` are the same transition of one field and whose `require` demand one field equal two different literals;
7. every role word in `roles` and in a literal compared with `caller.roles` is held by a person of the team.

Each finding names the team, the rule (`id` or place), the reason and a fix. Contradictions that depend on data cannot always be found; the team is responsible for them.

## 12. What the rules engine does not do

- It runs no code from the team file; a rule is data.
- It knows no status, role, field name, step or phase.
- It does not choose what anyone does next; `backlog team pop` offers or takes what the queue names.
- It does not apply to user commands (decision 26), nor to a user command given `--show-all` on a team's item (decision 29).

## 13. Research behind this design

- JsonLogic: rules as JSON trees with one operator per object, `var` reading the data, and `all`/`some`/`none`/`map`/`filter` over lists. Taken as the syntax (decision 60), evaluated by json-logic-js (decision 62). Known gaps, filled by the extra operators of 6: inside a list operation `var` reads only the element (hence `outer`); lists and objects compare by identity, not content (hence `changed`); no lookup of another item (hence `item`). https://skie.github.io/docs/RuleFlow/JsonLogic-Operations-Reference.html
- json-rules-engine: conditions with `all`/`any` over facts, events and priorities. Not taken: events and priorities, because every rule must hold. https://unpkg.com/json-rules-engine@2.0.0/docs/rules.md
- python-statemachine: validators reject a transition with an error the caller sees and leave the state unchanged. Taken: a refused change writes nothing and returns the errors. https://python-statemachine.readthedocs.io/en/latest/guards.html
- YouTrack state-machine rules: transitions of a field from value to value with guards. Taken: transition rules as conditions on `prev` and `next` of one field. https://www.jetbrains.com/help/youtrack/devportal/state-machine-per-issue-type.html.md
- The review the owner obtained on 2026-11-15: the dual-state context, the guard-clause rule with `when`, `require` and `error`, all errors returned together, dependencies through fields not rule-chaining, static linting of contradictions. Taken (decisions 58 to 61). Not taken: `backlog update 20 --set status=reviewed` (decision 11), an `owner` property mapping to the team (the base property is `team`), and its rule example that compares two lists with `!==` (identity, so it always differs; `changed` is used instead).
