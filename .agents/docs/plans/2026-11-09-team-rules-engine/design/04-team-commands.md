# 04 — The team commands on the evaluator, and the user commands beside them

Context: the CLI has two groups of commands (the page `01-command-behaviour-matrix.md`). User commands (`backlog new`, `backlog update`,
`backlog list`, ...) are typed by a person or an agent acting as one; they ignore teams. Team commands live under `backlog team` and are
the only commands that read `teams.json` and evaluate rules. This chapter fixes how each team command uses the evaluator of chapter 03,
the order of work every writing command follows, outputs and exit codes, and what the user commands do with team items.

## 1. The commands

| command line | scenario | reads | writes |
|---|---|---|---|
| `backlog team new --name "<title>" [--<arg> <value> ...]` | a member files an item of its team, for example `backlog team new --team web --agent lead-1 --name "Parse the header" --estimate 30 --parent 30` to add a child to item 30 | the team's entry; the items its rules name | the new item, the items its `related` effects change, the index, the number counter |
| `backlog team update <item> <step> [--<arg> <value> ...]` | an agent takes one step on one item, for example `backlog team update 42 hand-to-check --note "parser done; run the unit tests"` (the form is decision 2) | as above | the item and the items its effects change, the index |
| `backlog team pop [--dry-run] [--json]` | an agent asks for its next action and takes it, for example `backlog team pop --team web --agent member-1 --json` at the start of a session | as above | what the offered step writes (nothing with `--dry-run`) |
| `backlog team query` | the team's open items in queue order | the team's items | nothing |
| `backlog team query <item>` | one item whole: envelope, fields, body, history | the item | nothing |
| `backlog team query plan` | the lead looks at what pop would offer each person now, for example `backlog team query plan --team web` | as pop | nothing |
| `backlog team query check <item> <step> [--<arg> <value> ...]` | an agent asks why a step would be refused, for example `backlog team query check 10 claim --agent member-1`; prints the deciding rule's id and outcome | as update | nothing |
| `backlog team query filter <name>` | a named filter of the team, for example `backlog team query filter waiting` | the team's items | nothing |
| `backlog team query rules` | an agent or person reads the team's entry exactly as stored (people, item definition, rule set) | the entry | nothing |
| `backlog team query steps` | each step of the team with the arguments it takes and the ids of its rules in table order | the entry | nothing |
| `backlog team validate [--json]` | after editing `teams.json`, a person or agent checks it, for example `backlog team validate` before committing | the whole file and every item's team and fields | nothing |
| `backlog team migrate [--dry-run]` | once per backlog, the owner converts every item file from markdown to JSON (chapter 06) | every item file; the team names of `teams.json` | every item file, the number counters |

Removed: `backlog team define` and `backlog team workflow --file` (they wrote the team file, which the CLI never does), the per-step
flags of today's `backlog team update` (`--claim`, `--start-review`, ...; each is now a step name of a team), `--by` and `--lead`.

Every team command takes the inputs of chapter 01 section 5 (`--team`, `--agent`, `--session`, `--repository`, `--branch`) and `--json`.
`--help` of each command documents the generic form; when a team is resolved and `teams.json` is readable, `backlog team update --help`
also lists that team's steps and their arguments (the same text as `backlog team query steps`).

## 2. `backlog team new`

1. Resolve the team and the agent; read and check the team's entry (chapter 01 section 4).
2. The arguments are checked against the arguments of the step `new` (chapter 03 section 5; `--name` is always required: exit 2 without it).
3. A new item is built: the next number of the counter (chapter 05), the slug from the name, `team` = the command's team, `repository` and
   `branch` = the session's, every field at its definition default.
4. The rule table decides the step `new` on that item (`$item` is the new item). A refusal: exit 1, nothing written, the number is not
   consumed. An allowance: the effects apply (`related` changes the parent, for example), the item is placed at the end of the team's
   queue unless a `place` effect says otherwise.
5. Write, index, commit, push (section 6). Output: `✅ created <slug> (seq <n>) for team <team>, rule <id>`, then the `say` text if any.

## 3. `backlog team update <item> <step>`

1. Resolve, read and check the entry. Find the item by number or slug in the session's repository folder; an item that does not exist
   is `❌ no item <item>` (exit 1).
2. The coded checks of section 5.
3. The rule table decides (chapter 03 section 3). Refusal: `❌ <text> (rule <id>)`, exit 1, nothing written. Allowance: the effects.
4. Write, index, commit, push (section 6). Output: `✅ <slug>: <step> (rule <id>)` and one line per changed field
   `   <field>: <before> -> <after>`, one line per related item changed, then the `say` text. With `--json`:
   `{"item": <seq>, "step": "<step>", "rule": "<id>", "changes": {...}, "related": {"<seq>": {...}}, "say": "<text>"}`.

## 4. `backlog team pop` and `backlog team query`

- **pop**: the pop table walk of chapter 03 section 9; then the offered step runs as in section 3, so a refusal that appears between
  the choice and the write (another agent took the item) makes pop choose again, at most three times, then exit 1. Output with `--json`:
  `{"action": "<step>", "item": <seq>, "entry": "<pop entry id>", "rule": "<rule id>", "item_file": {<the whole item after the step>}}`;
  idle: `{"action": "idle"}` and exit 3. The key `action` and exit 3 are kept from today (consumer row CON-05).
- **query plan**: pop with `--dry-run` for each person of `people` in name order; an item offered to an earlier person is not offered
  to a later one in the same plan. Output per person: the pop entry id, the step and the item, or idle.
- **query check**: the evaluation of section 3 without writing: `allowed by rule <id>: <the changes>` or `refused by rule <id>: <text>`,
  exit 0 in both cases (the answer is the output); a coded refusal (archived, another team, not a person) is printed the same way with
  `rule -`. This replaces today's `missing` key of `query --phase` (gap S92): it names exactly the rule that holds the item back.
- **query filter, rules, steps, `<item>`**: read only; `--json` prints the data (the items whole, the entry, the step list).

JSON payloads are raw, as today. Whether every `--json` answer gets an envelope is owner question Q-10, still open in
`reference/08-owner-questions.md`; the team commands follow its answer.

## 5. Coded checks of a team command (CLI behaviour, not rules)

| check | refusal | exit | case |
|---|---|---|---|
| no team from flag, variable or configuration | `❌ backlog: a team command needs a team: give --team <name>, or set the TEAM_NAME variable, or set the "team" key in .backlog/config.json` | 2 | COD-01, COD-13 |
| no agent (new, update, pop) | `❌ backlog: this team command needs the agent: give --agent <name>, or set the BACKLOG_AGENT variable` | 2 | COD-05 |
| `teams.json` unreadable, team without entry, entry invalid | chapter 01 section 4 | 2, 1, 2 | |
| agent not in `people` | `❌ <agent> is not a person of team <team> (<names>)` | 1 | COD-10 |
| argument the step does not take | `❌ backlog: the step <step> of team <team> takes no --<name> (it takes: <list or no argument>)` | 2 | COD-14, COD-15 |
| item archived | `❌ item <seq> is archived; archived items take no step` | 1 | PAR-45 |
| item of another team | `❌ item <seq> belongs to team <other>; team <team> acts only on its own items and on items without a team` | 1 | PAR-46 |
| item without a team, rule does not bind it | chapter 03 section 8 | 1 | PAR-47 |
| a written value of the wrong type or not allowed; a reference to no item | chapter 02 section 3 | 2 | COD-11, COD-12 |
| no rule matches | `❌ no rule of team <team> allows the step <step> on item <seq>` | 1 | PAR-18 |

## 6. The order of work of a writing command, and concurrency

Every command that writes follows today's order, unchanged where it is machinery (reference inventory groups DI-LOCK, DI-SYNC,
DI-STALE): take the clone lock; pull; load the items of the repository folder (for `$team.items`, the open items of the team in every
folder); evaluate; write the item files, the index and the counter through the journal (a failure puts every file back); commit; push.

**Evaluation again after a rebase.** When the push needs a rebase because another clone published meanwhile, the CLI evaluates the same
step again on the rebased items (with the rebased `teams.json`). If the table still allows it with the same rule, the rebased change is
pushed; if it now refuses (another agent claimed the item, a limit filled up), the local commit is dropped and the command ends with the
refusal (exit 1). This one generic re-evaluation replaces today's claim-only publication recheck (inventory groups STEP-RECHECK,
DI-PUBLISH-HOOK). A number two clones allocated at once is repaired as today (chapter 05 section 2).

Exit codes stay the contract of today (`src/errors.js`, reference gap L55): 0 success, 1 refused or not found, 2 invalid input or an
invalid team file, 3 idle (pop) or a synchronisation failure, 4 the backlog repository is not cloned, 5 a stale read; an uncaught program
error exits 1.

## 7. The user commands beside the team commands

Context: owner rulings R3 and R3a fix that user commands enforce nothing about flow and see only items without a team.

| aspect | behaviour |
|---|---|
| team file | never read |
| identity | the user identity (BACKLOG_AGENT, else the configuration's `user`, else the git user name, else the login name), as today; the only commands that read it |
| which items | only items without a team. Every read of the repository folder filters out items whose `team` is set before anything else: `backlog list` does not list them, `backlog show 90` for a team item prints `❌ no phase '90'` exactly as for a number no item holds (case COD-06), `backlog next`, `move`, `archive`, `import`, `clean` and `update --replan` never select, count or change them. Team items keep their places in the index while user commands reorder only user entries (chapter 05) |
| rules | none: a status is stored as typed (decision D-19), claim and release refuse nobody (decision D-20), no limit and no dependency gate (decision D-18) |
| numbers | the shared counter (chapter 05): a user item and a team item never get the same number |
| item files | JSON, built-in user item definition (chapter 02 section 4) |

Today's refusal texts of user commands for team items (inventory groups BIND-*) disappear: a user command can no longer meet a team item.
`backlog fields` prints the built-in user item definition; a team's definition is `backlog team query rules`.
