# 04 — The team commands on the evaluator, and the user commands beside them

Context: the CLI has two groups of commands (the page `01-command-behaviour-matrix.md`). User commands (`backlog new`, `backlog update`,
`backlog list`, ...) are typed by a person or an agent acting as one; they ignore teams. Team commands live under `backlog team` and are
the only commands that read `teams.json` and evaluate rules. This chapter fixes how each team command uses the evaluator of chapter 03,
the order of work every writing command follows, outputs and exit codes, and what the user commands do with team items.

## 1. The commands

| command line | scenario | reads | writes |
|---|---|---|---|
| `backlog team new --name "<title>" [--<arg> <value> ...]` | a member files an item of its team, for example `backlog team new --team web --agent lead-1 --name "Parse the header" --estimate 30 --parent 30` to add a child to item 30 | the team's entry; the items its rules name | the new item, the items its `related` effects change, the index, the number counter |
| `backlog team update <item> <step> [--<arg> <value> ...]` | an agent takes one step on one item, for example `backlog team update 42 hand-to-check --note "parser done; run the unit tests"` (the form follows the owner's command shape, section 3) | as above | the item and the items its effects change, the index |
| `backlog team pop [--dry-run] [--json]` | an agent asks for its next action and takes it, for example `backlog team pop --team web --agent member-1 --json` at the start of a session | as above | what the offered step writes (nothing with `--dry-run`) |
| `backlog team query` | the team's open items in queue order, for example `backlog team query --team web --json` when a script lists the team's work | the team's items | nothing |
| `backlog team query <item>` | one item whole: envelope, fields, body, history, for example `backlog team query 42 --team web` before working on item 42 | the item | nothing |
| `backlog team query plan` | the lead looks at what pop would offer each person now, for example `backlog team query plan --team web` | as pop | nothing |
| `backlog team query check <item> <step> [--<arg> <value> ...]` | an agent asks why a step would be refused, for example `backlog team query check 10 claim --agent member-1`; prints the deciding rule's id and outcome | as update | nothing |
| `backlog team query filter <name>` | a named filter of the team, for example `backlog team query filter waiting` | the team's items | nothing |
| `backlog team query rules` | an agent or person reads the team's entry exactly as stored (people, item definition, rule set), for example `backlog team query rules --team web --json` at the start of a session | the entry | nothing |
| `backlog team query steps` | each step of the team with the arguments it takes and the ids of its rules in table order, for example `backlog team query steps --team web` before typing a step | the entry | nothing |
| `backlog team validate [--json]` | after editing `teams.json`, a person or agent checks it, for example `backlog team validate` before committing | the whole file and every item's team and fields | nothing |
| `backlog team migrate [--dry-run]` | once per backlog, the owner converts every item file from markdown to JSON (chapter 06) | every item file; the team names of `teams.json` | every item file, the number counters |

Removed: `backlog team define` and `backlog team workflow --file` (they wrote the team file, which the CLI never does), the per-step
flags of today's `backlog team update` (`--claim`, `--start-review`, ...; each is now a step name of a team), `--by` and `--lead`.

A word after `backlog team` that is none of `new`, `update`, `pop`, `query`, `validate`, `migrate` is refused with exit 2 naming the six
(as today, `src/team/cli.js:85`). Every team command takes the inputs of chapter 01 section 5 (`--team`, `--agent`, `--session`, `--repository`, `--branch`) and `--json`.
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
   is `❌ no item <item>` (exit 1). A step name no rule names is `❌ backlog: team <team> has no step <step> (steps: <names>)` (exit 2).
   The step is the word after the item: `backlog team update <item> <step> --<arg> <value>` (the logic of this form is in
   `review-response.md`, finding B-M13: it follows the owner's command shape, where required data is a word and not an option).
2. The coded checks of section 5.
3. The rule table decides (chapter 03 section 3). Refusal: `❌ <text> (rule <id>)`, exit 1, nothing written. Allowance: the effects.
4. Write, index, commit, push (section 6). Output: `✅ <slug>: <step> (rule <id>)` and one line per changed field
   `   <field>: <before> -> <after>`, one line per related item changed, then the `say` text. With `--json`:
   `{"item": <seq>, "step": "<step>", "rule": "<id>", "changes": {...}, "related": {"<seq>": {...}}, "say": "<text>"}`.

## 4. `backlog team pop` and `backlog team query`

- **pop**: the pop table walk of chapter 03 section 9 (each candidate step is tried in full without writing); then the offered step runs as
  in section 3. When upstream moved before the push, pop runs again on the upstream files (section 6) and chooses again; an item it
  already tried in this command is not offered again; after three attempts it ends with exit 1. A synchronisation failure of pop is exit 1,
  never 3, because 3 means idle (today `src/team/pop.js:63-66`). Text output: the action line (`➡️  <step> <slug> (pop entry <id>, rule
  <id>)`), then the item's fields and body as `backlog team query <item>` prints them, so a member sees the whole item it took. Output with `--json`:
  `{"action": "<step>", "item": <seq>, "entry": "<pop entry id>", "rule": "<rule id>", "item_file": {<the whole item after the step>}}`;
  idle: `{"action": "idle"}` and exit 3. The key `action` and exit 3 are kept from today (consumer row CON-05).
- **query plan**: pop with `--dry-run` for each person of `people` in name order; an item offered to an earlier person is not offered
  to a later one in the same plan. Output per person: the pop entry id, the step and the item, or idle.
- **query check**: the evaluation of section 3 without writing: `allowed by rule <id>: <the changes>` or `refused by rule <id>: <text>`,
  exit 0 in both cases (the answer is the output); a coded refusal (archived, another team, an argument the step does not take) is printed the same way with
  `rule -`. This replaces today's `missing` key of `query --phase` (gap S92): it names exactly the rule that holds the item back.
- **query filter, rules, steps, `<item>`**: read only; `--json` prints the data (the items whole, the entry, the step list).

JSON payloads are raw, as today. Whether every `--json` answer gets an envelope is owner question Q-10, still open in
`reference/08-owner-questions.md`; the team commands follow its answer.

## 5. Coded checks of a team command (CLI behaviour, not rules)

| check | refusal | exit | case |
|---|---|---|---|
| no team from flag, variable or configuration | `❌ backlog: a team command needs a team: give --team <name>, or set the TEAM_NAME variable, or set the "team" key in .backlog/config.json` | 2 | COD-01, COD-13 |
| no agent (new, update, pop) | `❌ backlog: this team command needs the agent: give --agent <name>, or set the BACKLOG_AGENT variable` | 2 | COD-05 |
| `teams.json` unreadable, team without entry, entry invalid (schema, a condition with two keys) | chapter 01 section 4 | 2, 1, 2 | INL-03 |
| TEAM_REPOSITORY not `owner/name`; detached HEAD with no branch given (new, update, pop) | chapter 01 section 5 | 2 | |
| the clone is shallow (a command that hands out a number) | chapter 05 section 2 | 2 | spike `numbers.test.mjs` |
| argument the step does not take | `❌ backlog: the step <step> of team <team> takes no --<name> (it takes: <list or no argument>)` | 2 | COD-14, COD-15 |
| item archived | `❌ item <seq> is archived; archived items take no step` | 1 | PAR-45 |
| item of another team | `❌ item <seq> belongs to team <other>; team <team> acts only on its own items and on items without a team` | 1 | PAR-46 |
| item without a team, rule does not bind it | chapter 03 section 8 | 1 | PAR-47 |
| a written value of the wrong type or not allowed; a written reference to no item or to the item itself | chapter 02 section 3 | 2 | COD-11, COD-12, PAR-60, INL-04 |
| no rule matches | `❌ no rule of team <team> allows the step <step> on item <seq>` | 1 | PAR-18 |

## 6. The order of work of a writing command, and concurrency

Every command that writes takes the clone lock, pulls, loads the items, evaluates, writes the item files, the index and the counter
through the journal (a failure puts every file back), commits and pushes (reference inventory groups DI-LOCK, DI-SYNC).

**Team commands: one outcome when another agent published first.** When the push is refused because upstream moved, or the pull before it
brings changes to a file the step writes, the CLI does not rebase the step's commit. It drops the local commit, resets the clone to
upstream and runs the whole command again on the upstream files: it reads `teams.json` again, evaluates the step again, allocates the number
again (chapter 05 section 3) and writes again. The command ends with the result of the last run: exit 0 when the table allows the step on
the fresh items, exit 1 with the deciding rule's refusal when it does not (another agent claimed the item, a limit filled up). After three
runs that each lost the race, it ends with exit 3 (exit 1 for pop, section 4) and `❌ backlog: <owner/name> changed three times while
<step> ran; run it again`.

This is the only outcome. The stale-view guard of today (exit 5, `src/shared/seen.js`, `staleCheck` of `src/shared/sync.js`) does not run
for team commands: owner ruling R1 says the rule set decides whether a command is allowed, and a refusal because the caller had not read
the latest version of the item is a decision the rule set does not make. The re-run gives the rule set the latest version instead. User
commands keep the stale-view guard and today's rebase unchanged (the command matrix row "Concurrency: Unchanged").

The scenarios the BDD plan (entry plan Task 3) must cover with two clones: "two members claim one item at once: one succeeds, the other is
refused by the claim rule", "two children are added to one parent at once: the parent's children list holds both", "two claims that
together pass a team limit: the second is refused by the limit rule", "two creations at once: two numbers", "an item changed three times
during a step: exit 3".

Exit codes stay the contract of today (`src/errors.js`, reference gap L55): 0 success, 1 refused or not found, 2 invalid input or an
invalid team file, 3 idle (pop) or a synchronisation failure (other commands), 4 the backlog repository is not cloned, 5 a stale read
(user commands only); an uncaught program error exits 1.

## 7. The user commands beside the team commands

Context: owner rulings R3 and R3a fix that user commands enforce nothing about flow and see only items without a team.

| aspect | behaviour |
|---|---|
| team file | never read |
| identity | the user identity (BACKLOG_AGENT, else the configuration's `user`, else the git user name, else the login name), as today; the only commands that read it |
| which items | only items without a team. Every read of the repository folder filters out items whose `team` is set before anything else: `backlog list` does not list them, `backlog show 90` for a team item prints `❌ no phase '90'` exactly as for a number no item holds (case COD-06), `backlog next`, `history`, `changes`, `move`, `archive`, `import`, `clean` and `update --replan` never select, show, count or change them. Team items keep their places in the index while user commands reorder only user entries (chapter 05 section 6). What a user command answers when a reference crosses between an item without a team and a team item (`backlog new --depends-on 90` naming a team item, a user item split from a team item, `backlog move` of a user item a team item depends on) is decision 3 |
| rules | none: a status is stored as typed (decision D-19), claim and release refuse nobody (decision D-20), no limit and no dependency gate (decision D-18) |
| numbers | the shared counter (chapter 05): a user item and a team item never get the same number |
| item files | JSON, built-in user item definition (chapter 02 section 4) |

Today's refusal texts of user commands for team items (inventory groups BIND-*) disappear: a user command can no longer meet a team item.
`backlog fields` prints the built-in user item definition; a team's definition is `backlog team query rules`.
