# 03 — The rule language

Context: owner ruling R1 makes the CLI a rules evaluator for team behaviour: given an item, the command, the caller and the arguments,
the team's rule set decides whether the command is allowed, what the new values are and which other items change. The rule set is the
`rules` key of the team's entry in `teams.json` (chapter 01). It must be readable by an agent or a person without reading the evaluator
(owner ruling R8), and its precedence is an ordered table in the manner of a network routing table (owner ruling R10). This chapter
defines the language completely; the evaluator spike in `design/evaluator-spike/` implements it in about 250 lines and runs every case of
`design/rule-cases.json` against it.

## 1. The three tables

| key of `rules` | what it is | read by |
|---|---|---|
| `table` | the rule table: an ordered list of rules, each matching a step name and deciding it (refuse, or allow with effects) | `backlog team new`, `backlog team update`, `backlog team pop` (to test a pop entry), `backlog team query check` |
| `pop` | the pop table: an ordered list of entries, each naming a step `backlog team pop` may run for the caller | `backlog team pop`, `backlog team query plan` |
| `filters` | named filters over the team's items | `backlog team query filter <name>` |

A **step** is a word the team chooses (`claim`, `hand-to-check`, `refine`); the CLI knows one step name only, `new`, which is the step
`backlog team new` evaluates. Every other step is run with `backlog team update <item> <step>` (the form is decision 2 of
`decisions.md`). A team defines a step simply by writing rules that name it.

## 2. A rule of the rule table

```json
{ "id": "claim-not-ready", "step": "claim", "when": { "not": { "is": ["$item.status", "ready"] } },
  "deny": "only a ready item is claimed (item {$item.seq} is {$item.status})" }
{ "id": "claim", "step": "claim", "do": { "set": { "status": "in progress", "holder": "$caller" } } }
```

| key | required | meaning |
|---|---|---|
| `id` | yes, unique in the team | the rule's name; every refusal and every history entry names it |
| `step` | yes | a step name, a list of step names, or `"*"` for every step |
| `when` | no | a condition (section 4); a rule without `when` matches every case of its step |
| `deny` | one of the two | the refusal text, with placeholders (section 7) |
| `do` | one of the two | the effects (section 8); `{}` allows the step and changes nothing |

## 3. Precedence: the routing table

Context: several rules usually match one command (a limit, a role check and the allowing rule all name `claim`). A routing table answers
"which route decides" by an ordered table with a default route; this table does the same.

1. **Order.** For a command, the evaluator walks `table` from the top. A rule matches when its `step` names the command's step (or is
   `"*"`) and its `when` holds. **The first matching rule decides**: a `deny` refuses the command with its text, a `do` allows it with
   its effects. No later rule is read. (Cases PAR-23 and PAR-01: the lead's claim of an item that waits for its children is refused by
   `wait-for-children`, the first rule that matches, not by `claim-lead` further down.)
2. **Specificity.** Specific rules go above general ones, as a more specific route goes above a broader one. The table states this by
   its order, and `backlog team validate` enforces it: a rule that can never decide because an earlier rule matches every case it matches
   is an error (`rule only-open can never decide: rule take above it matches every case it matches`, case VAL-01). The test is exact for
   the forms a reader can see at a glance: the earlier rule names every step the later one names, and the earlier `when` is absent or its
   clauses (the members of a top-level `all`, or the one condition) are all clauses of the later `when`.
3. **Default.** When no rule matches, the step is refused: exit 1,
   `❌ no rule of team <team> allows the step <step> on item <seq>` (cases PAR-18, PAR-40). Deny is the default route; a team that wants
   another text writes its own last rule `{ "id": "default", "step": "*", "deny": "..." }`.

Reading a table therefore takes no knowledge of the evaluator: read the rules of a step from the top; the first whose condition holds
is what happens. Refusals usually come first (guards), the allowing rules after them, the default last.

## 4. Conditions

A condition is a JSON object with one key, the test:

| test | form | holds when |
|---|---|---|
| `all` | `{"all": [c1, c2]}` | every condition holds (an empty list holds) |
| `any` | `{"any": [c1, c2]}` | at least one holds |
| `not` | `{"not": c}` | `c` does not hold |
| `is` | `{"is": [a, b]}` | the two values are equal (lists and numbers compared as values) |
| `in` | `{"in": [a, list]}` | `a` is a member of the list value (a literal list or a list field) |
| `empty` | `{"empty": a}` | `a` is null, empty text or an empty list (0 and false are not empty) |
| `>=`, `<=` | `{">=": [a, b]}` | both are numbers (an argument text is read as a number) and `a` is at least (at most) `b`; a value that is not a number never holds |
| `regex` | `{"regex": [a, "<regular expression>"]}` | the text of `a` matches the pattern (chapter 01 section 6 for its limits) |
| `every` | `{"every": {"items": <items>, "match": c}}` | `c` holds for every related item (true when there is none) |
| `some` | `{"some": {"items": <items>, "match": c}}` | `c` holds for at least one related item |

Inside `match`, `$it` is the related item and `$item` stays the item of the step, so a rule can compare the two
(`{"in": ["$it.seq", "$item.accepted_inputs"]}`, pattern `claim-inputs-accepted`). A related item that does not exist reads as an item
with no fields (so `{"is": ["$it.status", "splitting"]}` is false for it, case PAR-13). `every`, `some` and `count` cannot be nested.

## 5. Values and references

A value is a JSON literal (number, true, false, null, a list, or a text not starting with `$`) or a reference, a text starting with `$`.
A literal text that starts with `$` is written `{"text": "$5"}`.

| reference | value |
|---|---|
| `$item.<name>` | a field of the item of the step, or an envelope key (`seq`, `slug`, `name`, `team`, `repository`, `branch`, `created`, `updated`, `updated_by`, `archived`); for `backlog team new`, the new item |
| `$it.<name>` | the same for the related item inside `every`, `some` or `count` |
| `$arg.<name>` | the argument `--<name> <value>` of the command, as text (empty when not given) |
| `$caller` | the agent of the command |
| `$caller.roles` | the caller's roles from `people` |
| `$session.id`, `$session.repository`, `$session.branch`, `$session.commit` | BACKLOG_SESSION, TEAM_REPOSITORY, TEAM_BRANCH (or their flags; chapter 01 section 5), and the HEAD commit of the working copy |
| `$team.name` | the command's team |
| `$team.items` | the numbers of every open item of the team (not archived), in every repository folder of the backlog |
| `$now` | the time of the command, ISO 8601 UTC |

**The arguments of a step are its `$arg` references.** A step accepts exactly the `--<name>` flags that the rules naming it (or `"*"`)
read as `$arg.<name>`; any other flag is invalid input (exit 2) naming the accepted ones. No separate declaration is needed, and
`backlog team query steps` lists each step with its arguments (chapter 04). The names `team`, `agent`, `session`, `repository`, `branch`,
`json` and `dry-run` belong to the CLI and cannot be argument names (a validate error).

**Functions** (a value written as a one-key object):

| function | form | value |
|---|---|---|
| `count` | `{"count": {"items": <items>, "match": c}}` | how many related items satisfy `c` (`match` may be left out: all) |
| `length` | `{"length": v}` | the number of entries of a list |
| `plus` | `{"plus": [a, b, ...]}` | the sum (for a counter field: `{"plus": ["$item.rounds", 1]}`) |
| `age` | `{"age": v}` | seconds since the time `v`; null when `v` is empty, so `>=` on it does not hold |
| `roles_of` | `{"roles_of": v}` | the roles of the person named by `v` |

**Items** (the `items` of `every`, `some`, `count` and `related`): a value that gives item numbers: one number, a list field such as
`$item.children`, an argument such as `$arg.parent`, or `$team.items`.

## 6. Evaluation of one step, in order

1. Coded checks (machinery; chapter 04 section 5): the item exists for this command; it is not archived; it belongs to the command's team
   or to no team; the agent is a person of the team.
2. The table decides (section 3).
3. A `deny`: exit 1 with the text and ` (rule <id>)`; nothing is written.
4. A `do`: every value of every effect is computed on the items as they were **before** the step (so `set` of `status` and a condition on
   `$item.status` in the same rule never see each other's result); then the effects are applied to copies; then the coded checks of the
   result run (types and allowed values, item references, the binding check of section 8); then the items are written in one change.
   Any failure there is exit 2 and nothing is written.

## 7. Texts

`deny` and `say` texts may contain placeholders `{<reference>}`, for example `{$item.seq}`, `{$caller}`, `{$arg.estimate}`; a list is
written with `, ` between entries. A refusal prints the text and ` (rule <id>)` so the reader can find the rule
(`❌ item 10 waits for its children (11, 12) to close (rule wait-for-children)`, case PAR-01).

## 8. Effects

| effect | form | does |
|---|---|---|
| `set` | `{"set": {"<field>": value}}` | writes each field (typed, chapter 02 section 3) |
| `add` | `{"add": {"<list field>": value}}` | appends each value not yet in the list |
| `remove` | `{"remove": {"<list field>": value}}` | removes each value from the list |
| `note` | `{"note": {"heading": "<text>", "text": value}}` | appends `## <heading> (<agent>, <time>)` and the text to the body; the text also goes into the history entry |
| `related` | `{"related": [{"items": <items>, "set": {...}, "add": {...}, "remove": {...}}]}` | changes other items in the same change; inside, `$it` is that item and `$item` the item of the step. Every related item must be an open item of the same team, else exit 1 naming it |
| `place` | `"first"`, `"last"`, `{"before": <item>}`, `{"after": <item>}` | moves the item in the team's queue (chapter 05 section 4) |
| `say` | `"<text>"` | a line printed after the success line, for the agent (for example "end this session now"; reference format gap G-016) |
| `team` | `"$team.name"` or `""` | binds an item without a team to the command's team, or unbinds an item of the team (it becomes an item without a team) |
| `branch` | value | moves the item to another branch of the same repository folder (a move to another repository folder is not offered: the item would need a new number there) |
| `archive` | `true` | moves the item to the archive folder; from then on no rule applies to it |
| `delete` | `true` | removes the item file; its number is never handed out again (chapter 05). A team that writes no rule with `delete` cannot delete |

**The binding check** (coded): a team command may change an item without a team only through a rule whose `team` effect binds it to the
command's team (case PAR-48, example rule `adopt`); any other allowed step on such an item is refused with
`❌ item <seq> belongs to no team; only a rule that binds it to team <team> may change it (rule <id> does not)` (case PAR-47). When an
item is bound, the fields its team declares and it lacks get their defaults.

**Split, parent, children, dependencies** are fields and effects, nothing else (owner ruling R2). The parallel-work example shows the
whole pattern: `backlog team new --parent 30 ...` matches rule `new-child`, which sets the new item's `parent`, adds the new item's number
to the parent's `children` with a `related` effect and places it before the parent (case PAR-07); rule `wait-for-children` refuses
`claim` and `close` while a child is open (cases PAR-01 to PAR-04); rule `claim-dependencies` refuses a claim while a dependency is open
(cases PAR-05, PAR-06). Limits (`claim-limit-person`, `claim-limit-team`), queue order (the `pop` table), review rounds
(`check-round-cap`), size caps (`new-size-cap`) and required notes (`hand-to-check-note`) are rules over fields in the same way.

## 9. The pop table

Context: `backlog team pop` answers "what should I do next" and does it. Today the order of its answer is code (`src/team/queue.js`);
here it is the team's `pop` table.

```json
"pop": [
  { "id": "lead-splits", "step": "split-start", "when": { "in": ["lead", "$caller.roles"] } },
  { "id": "member-checks", "step": "start-check" },
  { "id": "member-claims", "step": "claim" }
]
```

`backlog team pop` walks the pop table from the top; for each entry it walks the team's queue (the team's open items in index order,
chapter 05); the first item for which the entry's `when` holds (with `$item` = that item) **and** the rule table allows the entry's step
with no argument is the answer. Pop then runs that step on it exactly as `backlog team update <item> <step>` would (unless `--dry-run`).
No answer: idle, exit 3. Because the offered step is tested through the same rule table, every guard of the step (limits, roles,
dependencies) also shapes what pop offers, and pop never offers what the step would refuse (cases PAR-49 to PAR-53, SCR-24, SCR-25,
SCR-28, SOL-09, SOL-10, PAT-42 to PAT-44). A step that needs an argument cannot be offered (validate warns).

## 10. Filters

`"filters": {"waiting": {"description": "...", "when": c}}`: `backlog team query filter waiting` lists the team's open items for which `c`
holds, in queue order (cases PAR-54, PAR-55, SCR-26, SCR-27, XP-18, XP-19, SOL-11, PAT-45, PAT-46). Today's fixed views (claimable,
reviewable, blocked, decisions, work in progress) become filters a team writes.

## 11. Pattern catalogue

Context: a team writes only the rules it wants. The behaviours of today's team code that no example team needs are written once, as
tested patterns, in `design/examples/patterns.json` (team `patterns`); the coverage file names them for every inventory row whose state is
LAZY-LOAD. Each pattern is an ordinary rule a team copies and adapts.

| pattern rule(s) | states | cases |
|---|---|---|
| `scope-branch` | a session works only on items of its branch (today TEAM_REPOSITORY and TEAM_BRANCH bind a session in code) | PAT-01 |
| `new-linked` | a step that files a follow-up item which holds a gate item (format gap G-011) | PAT-02 |
| `edit`, `edit-only-before-ready` | which field may change in which status | PAT-04, PAT-05 |
| `set-status-lead` | a status set directly, by the lead only | PAT-06, PAT-07 |
| `ended-session` | a session that ended takes no new item | PAT-08 |
| `record-handoff`, `accept-input-recorded`, `accept-input`, `claim-inputs-accepted`, `close-dependents-accepted` | dependency hand-offs: the producer records one per dependent, the lead accepts it, the dependent waits for the acceptance, the producer closes after every acceptance, and a new record withdraws the acceptance | PAT-09, PAT-10, PAT-36 to PAT-41 |
| `limit-top-level`, `limit-split`, `lift-limit` | two limits counting different items, and the lead's override for one item | PAT-11 to PAT-14 |
| `reassign` | the lead hands an item to another member | PAT-15, PAT-16 |
| `wait`, `resume` | the holder waits on something outside the team | PAT-17, PAT-18 |
| `ask-decision`, `decide`, `blocked-by-decision` | a decision with a return status; dependents wait while it is open | PAT-19 to PAT-21 |
| `request-review-needs-done-when`, `request-review` | a required field before a stage; an instruction after the step | PAT-22, PAT-23 |
| `review-own-session`, `start-review-peer`, `start-review-outside`, `review-who`, `review-reject`, `review-pass-peer`, `review-pass-outside`, `close-passes` | review stages as statuses with the same rule shape for every stage, a count of passed stages before the close, and no review by a session that worked on the item | PAT-24 to PAT-26, PAT-32 to PAT-35, PAT-39 |
| `start-review-fallback`, `unavailable` | a second reviewer only after the first said it cannot review | PAT-27 to PAT-29 |
| `take-over-stale-review` | a stale review is handed on after a wait set in the rule | PAT-30, PAT-31 |
| pop entries `old-reviews-first`, `own-work`, `reviews` | older requests first, by two pop entries | PAT-42 to PAT-44 |

Generic stage behaviour: a stage is a status value; the step that ends a stage writes the hand-off note into a field and the body
(`hand-to-check`), the first step of the next stage refuses while that field is empty (`start-check-handoff`), and the step after it
empties the field. Hand-off and deploy are not stages and need no status: a hand-off is a note, a deployment is its own item when a team
wants one.

## 12. What the language does not do, and why

- **No code and no loops** (lead decision: the CLI never executes code from the team file); a rule reads one hop of related items.
- **No timers.** The CLI decides when a command runs (owner ruling R1); a reminder after a wait is a script beside the team. A time can be
  tested when a command runs (`age`).
- **No rule on user commands or on archived items** (owner rulings R3, R3a; archived items are subject to no rule).
- **No writes to another team's items**, and no write to the envelope except the four effects of section 8.
- **No reading of the history**: what a rule needs is a field (a counter, a list of sessions, a note field).
- **No limit across teams and items without a team**: a team limits its own items; user items take no rule (decision D-18).

## 13. Size

The spike (`design/evaluator-spike/evaluator.mjs`) holds the references, the tests, the functions, the table walk, the effects with
typing and reference checks, `new`, `pop`, filters, the coded team and agent resolution, the user-command visibility check and the
validate checks of chapter 08 that the cases exercise, in 252 lines of plain Node with no dependency (the test runner is 59 more). Its
192 tests are the 191 cases of `design/rule-cases.json` plus one check that every rule, pop entry and filter of every example has a case and a
verification entry. Not in the spike, and left to the implementation: files, git, the index, the counter, the history, the regex length
caps, and the validate checks no case exercises.
