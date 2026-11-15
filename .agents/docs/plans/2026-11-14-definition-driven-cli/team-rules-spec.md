# Team rules: specification of the rules engine

Status: written 2026-11-15 from the owner's decisions 53 to 57 ([decisions.md](decisions.md)); not yet approved by the owner. It is the specification of how a team's rules are written, read and applied. Its JSON Schema is [team-rules.schema.json](team-rules.schema.json); the team file ([team-file.schema.json](team-file.schema.json)) holds one rule set per team. Examples: [teams.example.json](teams.example.json).

## Contents

1. What the rules are for
2. What triggers the rules
3. The evaluation of a change
4. A rule
5. Conditions
6. Values a rule reads
7. Kinds of rule, with examples
8. How rules affect each other, and dependencies between rules
9. The queue (`backlog team pop`) and filters
10. Error texts
11. Validation of the rules
12. What the rules engine does not do
13. Research behind this design

## 1. What the rules are for

A team works on items by changing their fields with team commands. The rules say which changes are allowed and what else follows from a change. The CLI applies them; it knows nothing of the team's way of working. A team describes its way of working in words beside its rules (the `description` of the rule set and of each rule); the words explain, the rules decide (decision 56).

## 2. What triggers the rules

Every team command that would change an item makes a **change**: the item as it is (`before`) and the item as it would be (`after`). The commands and their changes:

| Command | `before` | `after` |
|---|---|---|
| `backlog team new` | nothing (`null`) | the new item: base properties, the definition's defaults, the given title and description |
| `backlog team update <item> <property> <value>` | the item | the item with that property set |
| `backlog team archive <item>` (and `archive done`, item by item) | the item | the item unchanged; `$command` is `archive` |
| `backlog team import` and `branch import` (item by item) | the item | the item with its new `branch` |
| `backlog team pop` when its queue entry takes the item | the item | the item with the values of `take` (9) |

Every rule of the team is evaluated against every change (decision 53). A rule that does not concern the change (its trigger, 4, does not match) holds by definition. Reading commands (`list`, `show`, `query`) make no change and trigger nothing. Changes of priority trigger nothing: priority is not a property of the item.

## 3. The evaluation of a change

1. **Structure.** `after` must fit the item schema and the team item definition: every required property set, every value of its field's type and, for a field with `values`, one of them. A failure is reported like a rule's (10).
2. **Derivations.** The rules that `set` values (7.4) are applied to `after`, in the order of their dependencies (8). A derivation can change a property that triggers another derivation. Derivation stops when no rule changes anything more. A property set twice to different values in one evaluation is a contradiction: the change is refused and the team file is reported as invalid.
3. **Requirements.** Every rule that `require`s something (7.1 to 7.3, 7.5) is evaluated against the final `before` and `after`. All of them are evaluated, not only until the first failure.
4. **Result.** If every requirement holds, the change is written as one change of the item, with one history entry naming the command, the caller, and every property that changed (the caller's and the derived ones). If any requirement fails, nothing is written, the command exits 1, and every failing rule's error text is returned (10).

There is no order of requirements and no hierarchy among them: every requirement must hold, so the order in which they are read cannot change the result. This is why a rule needs no name (decision 55). The only order is the order of derivations, which the engine computes (8).

`--whatif` runs all of this and writes nothing; it returns what would be written or the refusals.

## 4. A rule

A rule is a JSON object:

| Key | Required | Meaning |
|---|---|---|
| `id` | no | A number or a short text, used only by validation to say which rule a problem is in (decision 55). When absent, validation names the rule by its place in the list (`rules[4]`). |
| `description` | no | Words for people: what the rule protects. |
| `on` | no | The trigger: which changes the rule concerns. Absent: every change. |
| `when` | no | A condition (5) that must hold for the rule to concern the change. Absent: always. |
| `require` | one of the two | A condition that must hold for the change to be allowed. |
| `message` | with `require` | The error text when `require` fails (10). |
| `set` | one of the two | Properties and the values the change gives them (7.4). |

`on` has any of these keys; all that are given must match:

| Key of `on` | Matches when |
|---|---|
| `commands` | the command is one of the list: `new`, `update`, `archive`, `move` (import and branch import). |
| `changes` | at least one of the listed properties differs between `before` and `after`. |
| `from` | an object `{property: [values]}`: `before` has one of the values for each listed property. |
| `to` | an object `{property: [values]}`: `after` has one of the values for each listed property. |

A rule is a requirement (`require` and `message`) or a derivation (`set`), never both.

## 5. Conditions

A condition is a JSON object with one key, the operator, in the manner of JsonLogic (13). Operands are values (6).

| Operator | Form | True when |
|---|---|---|
| `all` | `{"all": [c1, c2, ...]}` | every condition is true |
| `any` | `{"any": [c1, c2, ...]}` | at least one is true |
| `not` | `{"not": c}` | the condition is false |
| `is` | `{"is": [a, b]}` | a and b are equal |
| `in` | `{"in": [a, list]}` | a is one of the list |
| `contains` | `{"contains": [list or text, a]}` | the list holds a, or the text contains a |
| `empty` | `{"empty": a}` | a is null, an empty text or an empty list |
| `>=`, `<=`, `>`, `<` | `{">=": [a, b]}` | numbers or times compare so |
| `regex` | `{"regex": [text, pattern]}` | the text matches the pattern (matched in linear time) |
| `every` | `{"every": {"items": list, "match": c}}` | c holds for every element (`$it`) of the list |
| `some` | `{"some": {"items": list, "match": c}}` | c holds for at least one element |
| `condition` | `{"condition": "name"}` | the named condition of the rule set holds (8) |

Values can also be computed:

| Function | Form | Gives |
|---|---|---|
| `count` | `{"count": {"items": list, "match": c}}` | how many elements satisfy c |
| `length` | `{"length": a}` | the length of a list or text |
| `plus` | `{"plus": [a, b, ...]}` | the sum |
| `age` | `{"age": time}` | seconds from the time to now |
| `roles_of` | `{"roles_of": person}` | the role words of a person of the team |
| `text` | `{"text": "... {value} ..."}` | a text with values put in (10) |

## 6. Values a rule reads

| Value | Meaning |
|---|---|
| `$before.<property>` | the property before the change (null for `new`) |
| `$after.<property>` | the property after the change, derivations applied |
| `$changes` | the list of properties the change alters |
| `$command` | `new`, `update`, `archive` or `move` |
| `$caller` | the agent of the command; `$caller.roles` its role words in the team |
| `$team.name`, `$team.people`, `$team.items` | the team, its people, and its open items of the branch |
| `$session` | the session given to the command (`$session.id`) |
| `$now` | the time of the command |
| `$it` | the element being tested inside `every`, `some`, `count`, in `queue` and in `filters`; inside a nested `every`, `some` or `count`, `$it` is the element of the innermost one |
| `$item(<number>)` | the item with that number; `$items(<list of numbers>)` the items of a list. Used for fields of type `item` and `items` (for example `{"every": {"items": {"$items": "$after.depends_on"}, "match": {"is": ["$it.status", "closed"]}}}`). |
| a literal | text, number, true, false, null, a list |

A property the item definition does not declare cannot be read; validation reports it (11).

## 7. Kinds of rule, with examples

All kinds share the form of 4; they differ in their trigger and what they require or set.

### 7.1 Transition rule: what must hold for a field to go from one value to another

"For the status to change from `active` to `review`, `result` must be filled, and `estimate` must be 60 or less."

```json
{"on": {"from": {"status": ["active"]}, "to": {"status": ["review"]}},
 "require": {"all": [{"not": {"empty": "$after.result"}}, {"<=": ["$after.estimate", 60]}]},
 "message": "an item goes to review with a result and an estimate of at most 60 minutes"}
```

A transition that no rule allows is still allowed: rules refuse, they do not list permitted moves. To allow only some moves of a field, a team writes a rule that refuses every other one:

```json
{"on": {"changes": ["status"]},
 "require": {"any": [
   {"all": [{"is": ["$before.status", "new"]}, {"is": ["$after.status", "active"]}]},
   {"all": [{"is": ["$before.status", "active"]}, {"is": ["$after.status", "closed"]}]}]},
 "message": "status moves only new to active to closed (from {$before.status} to {$after.status} is not one of them)"}
```

### 7.2 Field rule: what must always hold of an item of the team

"An item is at most 120 minutes of work."

```json
{"require": {"<=": ["$after.estimate", 120]}, "message": "an item is at most 120 minutes of work (got {$after.estimate}); split it"}
```

With no `on`, it concerns every change, so no change can leave an item breaking it.

### 7.3 Permission rule: who may make a change

"Only a lead may close an item; only a person of the team may change anything."

```json
{"require": {"not": {"empty": "$caller.roles"}}, "message": "{$caller} is not a person of team {$team.name}"}
{"on": {"to": {"status": ["closed"]}}, "require": {"in": ["lead", "$caller.roles"]}, "message": "only a lead closes an item"}
```

### 7.4 Derivation rule: what a change sets by itself

"When an item becomes active, the caller becomes its holder."

```json
{"on": {"to": {"status": ["active"]}}, "set": {"holder": "$caller"}}
```

A derivation can set a field from a value (6) or a function (5). It runs before every requirement (3), so requirements see its result.

### 7.5 Relation rule: a condition over other items

"An item becomes active only when every item it depends on is closed." "One active item per holder."

```json
{"on": {"to": {"status": ["active"]}},
 "require": {"every": {"items": {"$items": "$after.depends_on"}, "match": {"is": ["$it.status", "closed"]}}},
 "message": "item {$after.seq} waits for the items it depends on"}
{"on": {"to": {"status": ["active"]}},
 "require": {"<=": [{"count": {"items": "$team.items", "match": {"all": [{"is": ["$it.status", "active"]}, {"is": ["$it.holder", "$caller"]}]}}}, 1]},
 "message": "{$caller} already holds an active item"}
```

A count over `$team.items` sees the items as they are, the changed item as it would be.

### 7.6 Creation rule: what a new item needs

```json
{"on": {"commands": ["new"]}, "require": {"not": {"empty": "$after.estimate"}}, "message": "a new item needs an estimate: --estimate <minutes>"}
```

`backlog team new` takes the fields of the team item definition as `--<field> <value>` beside `--title` and `--description`.

## 8. How rules affect each other, and dependencies between rules

- **Requirements do not affect each other.** Each is true or false of the final change; their order does not matter (3).
- **A derivation affects the rules that read what it sets.** If rule A sets `holder` and rule B is triggered by a change of `holder` or reads `$after.holder`, B depends on A. The engine computes these dependencies from the rules (what each `set` writes, what each `on` and condition reads) and applies derivations in that order. A derivation that, through others, sets what triggers it is a cycle; validation refuses it (11).
- **A declared dependency between rules** is written as a named condition. The rule set may hold `conditions`, an object of named conditions; any rule uses one with `{"condition": "<name>"}`. Several rules then depend on the same definition, and changing it changes them all:

```json
"conditions": {"ready": {"all": [{"not": {"empty": "$after.estimate"}}, {"every": {"items": {"$items": "$after.depends_on"}, "match": {"is": ["$it.status", "closed"]}}}]}},
"rules": [{"on": {"to": {"status": ["active"]}}, "require": {"condition": "ready"}, "message": "item {$after.seq} is not ready"}]
```

A named condition may use another named condition; a cycle among them is refused by validation.

## 9. The queue (`backlog team pop`) and filters

`queue` is an ordered list of entries. Each entry has `roles` (the role words it is for; absent: everyone), `match` (a condition on `$it`, an open item of the team) and optionally `take` (properties and values, as in `set`). `backlog team pop` reads the entries in order; for the first entry whose `roles` include one of the caller's and that has an item matching, the item first in priority order is offered. With `take`, the command changes that item with those values as one change (2), so every rule applies; if a rule refuses, the next matching item is tried; with no item left the answer is idle, exit 3. Without `take`, pop only offers.

`filters` are named conditions on `$it`, read with `backlog team list --filter <name>`; each has a `description`.

## 10. Error texts

A requirement's `message` is the text the caller sees when it fails. Values are put in with `{...}`: `{$caller}`, `{$before.status}`, `{$after.estimate}`, `{$team.name}`. A value that cannot be read is put in as an empty text. A refusal lists every failing rule: in JSON (the default of team commands) `{"refused": [{"rule": "<id or place>", "message": "..."}]}`; with `--human`, one line per failing rule. The exit code is 1.

## 11. Validation of the rules

`backlog validate` and `backlog team validate` check, for every team of the team file at once (any finding makes the whole file invalid, round 12 question 4):

1. the file fits [team-file.schema.json](team-file.schema.json) and each rule set fits [team-rules.schema.json](team-rules.schema.json);
2. every property a rule reads, triggers on or sets is a base property or a field of the team item definition; every value in `from`, `to`, `set` or a comparison with a field that has `values` is one of them;
3. every operator, function and value is one of 5 and 6; every regular expression can be matched in linear time;
4. every named condition used exists, and named conditions do not use each other in a cycle;
5. derivations: no cycle (8); no two derivations that can be triggered by the same change set the same property to different literal values;
6. requirements: no requirement can never hold under its own trigger (for example `to` status closed and `require` status is not closed); no two requirements with the same trigger require the same property to equal two different literal values; no derivation with a trigger sets a property to a value a requirement with the same trigger refuses;
7. every `message` exists and every value it puts in can be read;
8. `queue` and `filters` read only declared properties; every role word in `roles` is held by a person of the team.

Each problem is reported with the team, the rule (`id`, else its place), the reason and what would fix it. Checks 5 and 6 find contradictions between literal values; a contradiction that depends on data (two conditions that can never both hold for any item) cannot always be found and is the team's responsibility.

## 12. What the rules engine does not do

- It runs no code from the team file; a rule is data (ruling of 2026-11-09).
- It knows no status word, role word or field name; all of them come from the team's definition and rules.
- It does not choose what a person or agent does next; `backlog team pop` only offers or takes what the queue names.
- It does not apply to user commands (decision 26), nor to a user command given `--show-all` on a team's item (decision 29).

## 13. Research behind this design

- json-rules-engine (CacheControl): a rule is conditions (`all`, `any`, nested), each a fact, an operator and a value, plus an event fired when they hold; rules have priorities. Taken: nested `all`/`any` conditions over named values. Not taken: events and priorities, because here every requirement must hold and only derivations have an order. https://unpkg.com/json-rules-engine@2.0.0/docs/rules.md
- JsonLogic: a rule is a JSON object whose single key is the operator and whose value is the operands, with `var` to read data and `all`/`some` over lists. Taken: the one-key operator form, and `every`/`some` with an element value. https://skie.github.io/docs/RuleFlow/JsonLogic-Operations-Reference.html
- python-statemachine: guards on a transition decide quietly; validators reject a transition with an error the caller sees, and the state stays unchanged. Taken: a requirement on a transition with a message, and nothing written when it fails. https://python-statemachine.readthedocs.io/en/latest/guards.html
- YouTrack state-machine rules: transitions of a field from value to value with guards, actions on enter and exit, and the fields a rule needs declared. Taken: `from`/`to` triggers on a field, derivations on entering a value, and the check that a rule's fields exist. https://www.jetbrains.com/help/youtrack/devportal/state-machine-per-issue-type.html.md
