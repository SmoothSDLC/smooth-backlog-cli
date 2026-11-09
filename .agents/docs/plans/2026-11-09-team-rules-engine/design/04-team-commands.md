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
| `backlog team query [--show-all]` | the team's open items in queue order, for example `backlog team query --team web --json` when a script lists the team's work; with `--show-all` the open items of every team | the team's items | nothing |
| `backlog team query <item>` | one item whole: envelope, fields, body, history, for example `backlog team query 42 --team web` before working on item 42 | the item | nothing |
| `backlog team query plan` | the lead looks at what pop would offer each person now, for example `backlog team query plan --team web` | as pop | nothing |
| `backlog team query check <item> <step> [--<arg> <value> ...]` | an agent asks why a step would be refused, for example `backlog team query check 10 claim --agent member-1`; prints the deciding rule's id and outcome | as update | nothing |
| `backlog team query filter <name>` | a named filter of the team, for example `backlog team query filter waiting` | the team's items | nothing |
| `backlog team query rules` | an agent or person reads the team's entry exactly as stored (people, item definition, rule set), for example `backlog team query rules --team web --json` at the start of a session | the entry | nothing |
| `backlog team query steps` | each step of the team with the arguments it takes and the ids of its rules in table order, for example `backlog team query steps --team web` before typing a step | the entry | nothing |
| `backlog team validate [--json]` | after editing `teams.json`, a lead checks it, for example `backlog team validate --team web` before committing (the whole file is validated, the findings of team `web` and of the file's shape are printed); `backlog team validate --show-all` prints every team's findings | the whole file; the items of the named team (every team with `--show-all`) | nothing in the backlog; the per-user validation record (chapter 01 section 4) |
| `backlog team migrate [--dry-run] [--ask]` | the owner converts every item file from markdown to JSON and checks the team's items against its item definition, for example `backlog team migrate --team web --dry-run`, then `backlog team migrate --team web`; `--show-all` checks every team's items; `--ask` repairs missing or invalid fields one at a time on a terminal (chapter 06) | every item file; `teams.json` | every item file, the number counters, the index |

Removed: `backlog team define` and `backlog team workflow --file` (they wrote the team file, which the CLI never does), the per-step
flags of today's `backlog team update` (`--claim`, `--start-review`, ...; each is now a step name of a team), `--by` and `--lead`.

A word after `backlog team` that is none of `new`, `update`, `pop`, `query`, `validate`, `migrate` is refused with exit 2 naming the six
(as today, `src/team/cli.js:85`). Every team command takes the inputs of chapter 01 section 5 (`--team`, `--agent`, `--session`, `--repository`, `--branch`) and `--json`;
`--show-all` is accepted by `query`, `validate` and `migrate` only (chapter 01 section 5).
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
| no team from flag, variable or configuration | `❌ backlog: a team command needs a team: give --team <name>, or set the SMOOTH_BACKLOG_CLI_TEAM_NAME variable, or set the "team" key in .backlog/config.json` | 2 | COD-01, COD-13 |
| no agent (new, update, pop) | `❌ backlog: this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable` | 2 | COD-05 |
| `--show-all` on `new`, `update`, `pop` (or a one-team query form); `--show-all` with `--team` | chapter 01 section 5 | 2 | R14-01 to R14-03, R14-07 |
| `teams.json` unreadable, team without entry, the team's entry fails validation (schema, a condition with two keys, a rule naming an undeclared field) | chapter 01 section 4; nothing is written | 2, 1, 2 | INL-03; spike `teams-load.test.mjs` |
| SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY not `owner/name`; detached HEAD with no branch given (new, update, pop) | chapter 01 section 5 | 2 | |
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
the fresh items, exit 1 with the deciding rule's refusal when it does not (another agent claimed the item, a limit filled up). Between two
runs it waits a random time below 50 ms x 2 to the power of the attempt (at most 3.2 s), so that writers that collided do not collide again
in step; it keeps trying as long as the time budget the clone lock already has allows (SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS, 120 s by default),
then ends with exit 3 (exit 1 for pop, section 4) and `❌ backlog: <owner/name> kept changing while <step> ran; run it again`. Section 7
gives the measurement behind the wait.

This is the only outcome. The stale-view guard of today (exit 5, `src/shared/seen.js`, `staleCheck` of `src/shared/sync.js`) does not run
for team commands: owner ruling R1 says the rule set decides whether a command is allowed, and a refusal because the caller had not read
the latest version of the item is a decision the rule set does not make. The re-run gives the rule set the latest version instead. User
commands keep the stale-view guard and today's rebase unchanged (the command matrix row "Concurrency: Unchanged").

The scenarios the BDD plan (entry plan Task 3) must cover with two clones: "two members claim one item at once: one succeeds, the other is
refused by the claim rule", "two children are added to one parent at once: the parent's children list holds both", "two claims that
together pass a team limit: the second is refused by the limit rule", "two creations at once: two numbers", "an item changed three times
during a step past the time budget: exit 3".

Exit codes stay the contract of today (`src/errors.js`, reference gap L55): 0 success, 1 refused or not found, 2 invalid input or an
invalid team file, 3 idle (pop) or a synchronisation failure (other commands), 4 the backlog repository is not cloned, 5 a stale read
(user commands only); an uncaught program error exits 1.

## 7. Several teams writing one backlog repository at once

Context: the scope note of the rulings asks what several teams writing one backlog repository at the same time cost, without any change of
flags. Every write of every team touches the same few shared files of a repository folder: `numbers.json` on every creation, `index.json`
on every step that changes a status or a place, and the item files.

- **On one machine** the agents of all teams share the user's one clone of the backlog (the per-user record that `backlog setup` writes names
  one folder per backlog), so the clone lock serialises their writes: no write loses a race; a write waits for the one before it.
- **Across machines** (or clones) every pair of overlapping writes to one folder collides on `numbers.json` or `index.json` (two creations
  always do; two status changes do whenever they touch the same branch list of the index), and the later push is refused. The loser runs
  the whole step again on upstream (section 6), so nothing is lost and numbers stay unique; the cost is one more pull and evaluation per
  lost race.
- **Measured** with `evaluator-spike/contention.mjs` (each team its own clone, each write a creation that also changes the index, local
  bare repository, every result with 60 distinct numbers for 60 items): 3 teams writing back to back with no pause and no wait lost 60
  races for 60 writes and one write needed 41 attempts (one writer starved); the same with the random wait of section 6 lost 10 races, at
  most 6 attempts; 3 teams with a pause of 0.1 to 0.3 s between writes lost 22 races with the wait (at most 5 attempts) and 27 without it
  (at most 3); 9 teams with that pause lost 116 races for 90 writes (at most 10 attempts). A local push takes milliseconds; over a network
  the window of a write (pull, evaluate, push: seconds) is wider, so the share of lost races grows with (writes per second of all teams) x
  (seconds per write). Agents that think minutes between writes keep that product well below one.
- **The simple solution adopted**: the random growing wait between re-runs and the lock's time budget instead of a fixed three attempts
  (section 6). Nothing else is needed: the number counter cannot collide (chapter 05 section 3), the index is rebuilt by the re-run, and no
  flag changes. A redesign that would take the shared files out of the race (an index per team, numbers allocated by a server) changes R13
  or needs a service, and is out of scope.

## 8. The user commands beside the team commands

Context: owner rulings R3, R3a, R16, R19 and R19a fix what user commands do. They enforce nothing about flow, never read `teams.json`, and
ignore team items unless `--show-all` is given; then they show team items and may set values on them (a safety hatch: a team that no
longer exists, archiving, a change of owner outside the team's enforcement). A session that names a team cannot run them at all.

**The guard of team sessions (R19a).** When SMOOTH_BACKLOG_CLI_TEAM_NAME is set, every user command stops before it reads anything: exit 2,
exactly `❌ backlog: teams are not allowed to use user commands`, with no instruction and no hint (case R19A-01). `backlog --help`,
`backlog --version` and `backlog <command> --help` are not blocked. The `team` key of `.backlog/config.json` does not block (case
R19A-02): it is a default for team commands, not a sign of a team session. The guard catches an agent that uses the wrong command by
mistake; it does not stop an agent that unsets the variable on purpose.

| aspect | behaviour |
|---|---|
| team file | never read |
| identity | the user identity (SMOOTH_BACKLOG_CLI_AGENT, else the configuration's `user`, else the git user name, else the login name), as today; the only commands that read it |
| which items, by default | only items without a team. Every read filters out items whose `team` is set before anything else, and a number that names a team item answers exactly as a number no item holds (`backlog show 90` prints `❌ no phase '90'`, case COD-06). A reference to a team item (a `depends_on` entry, a `parent`) reads as a missing item: `backlog show 7` lists it as `90 (no such item)`, and `backlog new --depends-on 90` is refused as for a number no item holds (case R16-02) |
| with `--show-all` | team items are seen like any item (cases R16-01, R16-03): read commands list and show them with their team; write commands may change them. Every change of a team item writes a history entry with the user's name, the user command as `step`, and the note `--show-all on an item of team <t>` (case R19-02). No rule of the team runs, and the values written are not checked against the team's item definition (the user command does not read `teams.json`); `backlog team validate` reports any value the definition does not allow |
| rules | none: a status is stored as typed (decision D-19), claim and release refuse nobody (decision D-20), no limit and no dependency gate (decision D-18) |
| numbers | the shared counter (chapter 05): a user item and a team item never get the same number |
| item files | JSON, built-in user item definition (chapter 02 section 4) |

**`--show-all` command by command.** The commands of the user group of the command matrix that select or list items take the flag; the
others refuse it as an unknown option (exit 2).

| command line | without `--show-all` | with `--show-all` |
|---|---|---|
| `backlog list [<word>]`, `backlog list branch <name>`, `backlog list branches`, `backlog next [all-branches]` | items without a team; counts without team items | every item, a team column in the listing, team items counted |
| `backlog show <item>`, `backlog history [<item>]`, `backlog changes` | a team item answers as missing; its events are not listed | shown and listed with their team |
| `backlog update <item> ...` (every flag, `--claim`, `--release`, `--close`, `--status`, `--append`, `--priority`, `--seq`, and `--set <field>=<value>`) | a team item answers as missing | allowed on a team item, with the history entry above. `--set <field>=<value>` is accepted only on a team item: it writes a field of the team's definition the user flags do not name (the value is stored as JSON when it parses as JSON, else as text). `--priority` moves the item among all entries of its branch |
| `backlog update --replan`, `backlog done <item>` | team items are not touched | team items named are reordered or closed like any item |
| `backlog move <item> ...`, `backlog archive <item>`, `backlog archive done`, `backlog import ...`, `backlog clean ...` | team items are never selected | team items are moved, archived, imported and cleaned like any item; a moved item gets a new number in its new folder as any item does |
| `backlog new --depends-on <item>`, `backlog new --split-from <item>` | a team item answers as missing | a team item may be named; the new item has no team |
| `backlog fields`, `backlog setup`, `backlog upgrade` | no items | flag refused (exit 2) |

`backlog fields` prints the built-in user item definition; a team's definition is `backlog team query rules`.
