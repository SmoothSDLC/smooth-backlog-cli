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
`backlog team new` evaluates. Every other step is run with `backlog team update <item> <step> --<arg> <value>`: the step is required
data, so it is a word, not an option, following the owner's shape of commands (`reference/09-gap-resolution.md` section 3: "an option that
is not required data is a subcommand"). A team defines a step simply by writing rules that name it.

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

A condition is a JSON object with exactly one key, the test. A condition with two keys (`{"is": [...], "in": [...]}`) or none is a
validate error, and the evaluator refuses it at run time too (exit 2, `a condition has exactly one key (found is, in)`, cases VAL-13,
INL-03): several conditions are written inside `all`. The same holds for a function object.

| test | form | holds when |
|---|---|---|
| `all` | `{"all": [c1, c2]}` | every condition holds (an empty list holds) |
| `any` | `{"any": [c1, c2]}` | at least one holds |
| `not` | `{"not": c}` | `c` does not hold |
| `is` | `{"is": [a, b]}` | the two values are equal. Lists are compared entry by entry. A text and a number are equal when the text is a decimal literal of that number, so an argument `--dep 2` equals the number 2 of an `items` field (case INL-02) |
| `in` | `{"in": [a, list]}` | `a` equals (as for `is`) a member of the list value (a literal list or a list field) |
| `empty` | `{"empty": a}` | `a` is null, a text of only spaces, or an empty list (0 and false are not empty; case PAR-57: `--estimate " "` is empty) |
| `>=`, `<=` | `{">=": [a, b]}` | both are numbers and `a` is at least (at most) `b`. A text is a number only when it is a decimal literal (`60`, `-5`, `60.9`; not `0x3C`, `1e3` or spaces); a value that is not a number makes the test false, so a cap is written as `{"not": {"<=": [a, 60]}}` to refuse a value that is not a number too (cases PAR-58, PAR-59) |
| `regex` | `{"regex": [a, "<pattern>"]}` | the text of `a` matches the pattern somewhere (section 4.1) |
| `contains` | `{"contains": [a, b]}` | the text of `a` contains the text `b`, or any entry of the list `b` (pattern `review-cites-document`: the comments name one of the review documents) |
| `every` | `{"every": {"items": <items>, "match": c}}` | `c` holds for every related item (true when there is none) |
| `some` | `{"some": {"items": <items>, "match": c}}` | `c` holds for at least one related item |

Inside `match`, `$it` is the related item and `$item` stays the item of the step, so a rule can compare the two
(`{"in": ["$it.seq", "$item.accepted_inputs"]}`, pattern `claim-inputs-accepted`). A related item that does not exist reads as an item
with no fields (so `{"is": ["$it.status", "splitting"]}` is false for it, case PAR-13). `every`, `some` and `count` cannot be nested.

### 4.1 The patterns of `regex`

A pattern is run by a matcher built into the CLI that simulates every possible match at once over the text (a Thompson automaton), so its
time is at most the text length times the size of the compiled pattern and nothing a team writes can make it backtrack
(`evaluator-spike/safe-regex.mjs`, about 110 lines; case INL-05 runs `^(a+)+$` on 5000 characters in milliseconds). The subset: literal
characters; `.`; classes `[a-z0-9_]` and `[^...]`; the escapes `\d \D \w \W \s \S \n \t` and an escaped punctuation character;
groups `( )` and `(?: )`; alternation `|`; the quantifiers `*`, `+`, `?`, `{m}`, `{m,}`, `{m,n}` with at most 100; the anchors `^` and `$`.
Back-references, lookaround, flags such as `(?i)`, lazy quantifiers and `\b` are not supported, and validate names the first such construct
(`not a pattern the CLI runs (lookaround and flags are not supported (at character 1))`, case VAL-20). A pattern is at most 200 characters
and 5000 compiled instructions; the tested text is cut at 10 000 characters.

## 5. Values and references

A value is a JSON literal (number, true, false, null, a list, or a text not starting with `$`) or a reference, a text starting with `$`.
A literal text that starts with `$` is written `{"text": "$5"}`.

| reference | value |
|---|---|
| `$item.<name>` | a field of the item of the step (its definition's default when the item lacks it, decision D-32; case PAR-66), or an envelope key (`seq`, `slug`, `name`, `team`, `repository`, `branch`, `created`, `updated`, `updated_by`, `archived`), or `body`, the item's text (read only; pattern `request-review-needs-done-when` looks for a definition-of-done section in it); for `backlog team new`, the new item |
| `$it.<name>` | the same for the related item inside `every`, `some` or `count`, and for each item of a `related` effect |
| `$arg.<name>` | the argument `--<name> <value>` of the command, as text (empty when not given) |
| `$caller` | the agent of the command |
| `$caller.roles` | the caller's roles from `people` |
| `$session.id`, `$session.repository`, `$session.branch`, `$session.commit` | BACKLOG_SESSION, TEAM_REPOSITORY, TEAM_BRANCH (or their flags; chapter 01 section 5), and the HEAD commit of the working copy |
| `$team.name` | the command's team |
| `$team.items` | the numbers of every live (not archived) item of the team in the session's repository folder, closing statuses included (a `count` that wants open items says so in its `match`). Numbers are per folder (chapter 05), so the set stays in one folder |
| `$now` | the time of the command, ISO 8601 UTC |

**The arguments of a step are its `$arg` references.** A step accepts exactly the `--<name>` flags that the rules naming it (or `"*"`)
read as `$arg.<name>`; any other flag is invalid input (exit 2) naming the accepted ones. No separate declaration is needed, and
`backlog team query steps` lists each step with its arguments (chapter 04). The names `team`, `agent`, `session`, `repository`, `branch`,
`json`, `dry-run`, `help` and `version` belong to the CLI and cannot be argument names (a validate error, case VAL-19).

The names after a root are a closed list: `$caller` and `$caller.roles`; `$session.id`, `.repository`, `.branch`, `.commit`; `$team.name`
and `.items`; `$now`. Any other name (`$session.brnach`) is a validate error, never an empty value (case VAL-15). Field, step and argument
names are lowercase letters, digits, `-` and `_`, starting with a letter (case VAL-19).

**Functions** (a value written as a one-key object):

| function | form | value |
|---|---|---|
| `count` | `{"count": {"items": <items>, "match": c}}` | how many related items satisfy `c` (`match` may be left out: all) |
| `length` | `{"length": v}` | the number of entries of a list |
| `plus` | `{"plus": [a, b, ...]}` | the sum (for a counter field: `{"plus": ["$item.rounds", 1]}`) |
| `age` | `{"age": v}` | seconds since the time `v`; null when `v` is empty, so `>=` on it does not hold |
| `roles_of` | `{"roles_of": v}` | the roles of the person named by `v` |

**Items** (the `items` of `every`, `some`, `count` and `related`): a value that gives item numbers: one number, a list field such as
`$item.children`, an argument such as `$arg.parent`, or `$team.items`. A number names an item of the step's repository folder; a text
`owner/name#seq` names an item of another folder of the backlog, which a condition reads (its status, its fields) but no effect may change
(cases PAR-64, PAR-65: a dependency in another repository folder holds the claim until it is closed).

## 6. Evaluation of one step, in order

1. Coded checks (machinery; chapter 04 section 5): the arguments are ones the step takes; the item exists for this command; it is not
   archived; it belongs to the command's team or to no team.
2. The table decides (section 3).
3. A `deny`: exit 1 with the text and ` (rule <id>)`; nothing is written.
4. A `do`: every value of every effect is computed on the items as they were **before** the step (so `set` of `status` and a condition on
   `$item.status` in the same rule never see each other's result); then the effects are applied to copies; then the coded checks of the
   result run (types and allowed values; the binding check of section 8; and, for each `item` or `items` field the step wrote, that every
   number names an existing item and never the item itself, cases PAR-60, COD-12); then the items are written in one change. Any failure
   there is exit 2 and nothing is written. Fields the step did not write are not checked, so an item whose dependency was deleted can still
   take its other steps (case PAR-61); the deleted number reads as a missing item and validate reports the dangling reference (chapter 08).

## 7. Texts

`deny`, `say` and literal `note` texts may contain placeholders `{<reference>}`, for example `{$item.seq}`, `{$caller}`, `{$arg.estimate}`; a list is
written with `, ` between entries. A refusal prints the text and ` (rule <id>)` so the reader can find the rule
(`❌ item 10 waits for its children (11, 12) to close (rule wait-for-children)`, case PAR-01).

## 8. Effects

| effect | form | does |
|---|---|---|
| `set` | `{"set": {"<field>": value}}` | writes each field (typed, chapter 02 section 3) |
| `add` | `{"add": {"<list field>": value}}` | appends each value not yet in the list |
| `remove` | `{"remove": {"<list field>": value}}` | removes each value from the list |
| `note` | `{"note": {"heading": "<text>", "text": value}}` | appends `## <heading> (<agent>, <time>)` and the text to the body; the text also goes into the history entry. A literal text may carry placeholders, so a record such as `Claimed by {$caller} on branch {$session.branch}` can be written (pattern `reject-input`) |
| `related` | `{"related": [{"items": <items>, "set": {...}, "add": {...}, "remove": {...}}]}` | changes other items in the same change; inside, `$it` is that item and `$item` the item of the step. Every related item must be a live item of the same team in the step's repository folder, else exit 1 naming it (validate checks the fields and values of a `related` entry like those of the item, case VAL-16, and accepts `$it` there, case VAL-17) |
| `place` | `"first"`, `"last"`, `{"before": <item>}`, `{"after": <item>}` | moves the item in the team's queue (chapter 05 section 6) |
| `say` | `"<text>"` | a line printed after the success line, for the agent (for example "end this session now"; reference format gap G-016) |
| `team` | `"$team.name"` or `""` | binds an item without a team to the command's team, or unbinds an item of the team (it becomes an item without a team) |
| `branch` | value | moves the item to another branch of the same repository folder (case PAT-56; a move to another repository folder is not offered: the item would need a new number there) |
| `archive` | `true` | moves the item to the archive folder; from then on no rule applies to it |
| `delete` | `true` | removes the item file; its number is never handed out again (chapter 05; case PAT-55). A team that writes no rule with `delete` cannot delete. Items that name the deleted number keep it; it reads as a missing item and validate reports it |

**The binding check** (coded): a team command may change an item without a team only through a rule whose `team` effect binds it to the
command's team (case PAR-48, example rule `adopt`); the unbinding effect `"team": ""` is case PAT-57. The capability comes from owner
question Q-19, answered B: split items without a team "stay outside the team; a lead binds one with --set-team when the team should work
it" (`reference/08-owner-questions.md`, option B of Q-19). The check keeps every other team step away from items without a team, which
mirrors R3a; any other allowed step on such an item is refused with
`❌ item <seq> belongs to no team; only a rule that binds it to team <team> may change it (rule <id> does not)` (case PAR-47). When an
item is bound, the fields its team declares and it lacks get their defaults.

**Split, parent, children, dependencies** are fields and effects, nothing else (owner ruling R2). The parallel-work example shows the
whole pattern: `backlog team new --parent 30 ...` matches rule `new-child`, which sets the new item's `parent`, adds the new item's number
to the parent's `children` with a `related` effect and places it before the parent (case PAR-07); rule `wait-for-children` refuses
`claim`, `close` and `abandon` while a child is open (cases PAR-01 to PAR-04, PAR-63); rule `claim-dependencies` refuses a claim and a
close while a dependency is open (cases PAR-05, PAR-06, PAR-62); an item cannot name itself as parent or dependency (coded, case PAR-60). Limits (`claim-limit-person`, `claim-limit-team`), queue order (the `pop` table), review rounds
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
chapter 05 section 6); the first item for which the entry's `when` holds (with `$item` = that item) **and** the whole step, run without
writing and with no argument, succeeds (the table allows it and every coded check of the result passes) is the answer. Pop then runs that
step on it exactly as `backlog team update <item> <step>` would (unless `--dry-run`). No answer: idle, exit 3. Because the offered step is
tried in full, every guard of the step (limits, roles, dependencies, a related item that is archived) also shapes what pop offers, and pop
never offers what the step would refuse (cases PAR-49 to PAR-53, SCR-24, SCR-25, SCR-28, SOL-09, SOL-10, PAT-42 to PAT-44; case INL-01:
an item whose step would fail on an archived parent is skipped). A step that needs an argument cannot be offered (validate warns).

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
| `record-handoff`, `accept-input-recorded`, `accept-input-reviewed`, `accept-input`, `reject-input`, `claim-inputs-accepted`, `close-dependents-accepted` | dependency hand-offs: the producer records one per dependent with a commit, the lead accepts it only after the producer's review passed and rejects it with a reason, the dependent waits for the acceptance, the producer closes after every acceptance, and a new record withdraws the acceptance | PAT-09, PAT-10, PAT-36 to PAT-41, PAT-51, PAT-52 |
| `limit-top-level`, `limit-split`, `lift-limit` | two limits counting different items, and the lead's override for one item | PAT-11 to PAT-14 |
| `reassign` | the lead hands an item to another member | PAT-15, PAT-16 |
| `wait`, `resume` | the holder waits on something outside the team | PAT-17, PAT-18 |
| `ask-decision`, `decide`, `blocked-by-decision` | a decision with a return status; dependents wait while it is open | PAT-19 to PAT-21 |
| `request-review-needs-done-when`, `request-review` | a required definition of done (a field, or a section of the body) before a stage; an instruction after the step | PAT-22, PAT-23, PAT-53 |
| `review-cites-document` | review comments must name one of the item's review documents | PAT-49, PAT-50 |
| `close-same-commit` | the passes count only for the commit the review saw: new work after the pass needs a new review | PAT-48 |
| `dependencies-cap` | a cap on a list (function `length`) | PAT-54 |
| `remove-duplicate`, `move-branch`, `release-to-users` | the effects `delete`, `branch` and `"team": ""` | PAT-55 to PAT-57 |
| `members-only` (first rule of every example) | only a person of the team acts | COD-10, SCR-29, XP-20, SOL-12, PAT-47 |
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
- **No reading of the history and of git**: what a rule needs is a field (a counter, a list of sessions, a note field). Today's close rule
  that looks for new commits whose subject starts with the item number after the review request is stated by commit equality instead
  (`close-same-commit`: the review records `$session.commit`, the close compares it); a stricter reading of git history is not offered.
- **No digest of a record**: today a hand-off receipt pins a hash of the record. Here the record is fields only a team step writes, and a new
  record withdraws the acceptance with a `related` remove; a hand edit of the JSON file is outside what the CLI guarantees, as for any field.
- **No people of another team**: today a refinement can be reviewed "by a member of team X". A team that wants this lists those persons in
  its own `people` with a role.
- **No items of another repository folder in the pop table**: today's chunk work offers small items of other folders (`backlog.scope`). The
  owner's team states in entry plan Task 6 whether it keeps chunk work; if it does, the pop table gains a `folders` key before the
  implementation (Task 5). Until then this is a deferred gap with that blocker, recorded in the coverage file.
- **No limit across teams and items without a team**: a team limits its own items; user items take no rule (decision D-18).

## 13. Size

The spike (`design/evaluator-spike/`) is three modules of plain Node with no dependency: `evaluator.mjs` (references, tests, functions, the
table walk, effects with typing and reference checks, `new`, `pop`, filters, the coded team and agent resolution, the user-command
visibility check, and the validate checks the cases exercise, the schema included), `safe-regex.mjs` (the linear matcher) and `numbers.mjs`
(the high-water mark on git). Its tests are every case of `design/rule-cases.json`, one check that every rule, pop entry and filter of every
example has a case and a verification entry, and the git scenarios of `numbers.test.mjs`. The line counts are in the review response file;
they measure the idea, not the implementation, which adds files, git publication, the journal, the index, the history and the remaining
validate checks of chapter 08. Many spike lines are long; the implementation will be several times its size.

## 14. The schema of a team entry

Context: a misspelled key must never weaken a rule silently (a rule whose `when` is spelled `wehn` would otherwise allow every case). Every
object of a team entry has a closed list of keys; validate refuses any other key and names the closest valid one (case VAL-14:
`wehn is not a key of a rule` / `did you mean when?`), and a team command refuses to evaluate an entry with such an error (chapter 01 section 4).

| object | keys |
|---|---|
| team entry | `people`, `item`, `rules` |
| `rules` | `table`, `pop`, `filters` |
| a field of `item` | `type`, `description`, `default`, `values`, `final` (`final` only on `status`) |
| a rule of `table` | `id`, `step`, `when`, `deny`, `do` (exactly one of `deny` and `do`) |
| an entry of `pop` | `id`, `step`, `when` |
| a filter | `description`, `when` |
| `do` | `set`, `add`, `remove`, `note`, `related`, `place`, `archive`, `delete`, `branch`, `team`, `say` |
| an entry of `related` | `items`, `set`, `add`, `remove` |
| `note` | `heading`, `text` |
| `place` (object form) | `before`, `after` |
| `every`, `some`, `count` | `items`, `match` |
| a condition, a function | exactly one key, a test of section 4 or a function of section 5 |
