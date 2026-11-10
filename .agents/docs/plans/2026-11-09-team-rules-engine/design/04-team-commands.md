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
| `backlog team validate [--json]` | after editing `teams.json`, a lead checks it, for example `backlog team validate --team web` before committing (the whole file is validated, the findings of team `web` and of the file's shape are printed); `backlog team validate --show-all` prints every team's findings | the whole team file at its resolved location (chapter 01 section 1.1); the items of the named team (every team with `--show-all`) | the `teams_file_sha` key of `.backlog/config.json` when the SHA changed, and the per-user validation record (chapter 01 section 4) |
| `backlog team migrate [--dry-run] [--ask]` | the owner converts every item file of the repository's folder from markdown to JSON and checks the team's items against its item definition, for example `backlog team migrate --team web --dry-run`, then `backlog team migrate --team web`; `--show-all` checks every team's items; `--ask` repairs missing or invalid fields one at a time on a terminal (chapter 06) | every item file of the repository folder; the team file | every item file of the folder, its number counter, its index |

Removed: `backlog team define` and `backlog team workflow --file` (they wrote the team file, which the CLI never does), the per-step
flags of today's `backlog team update` (`--claim`, `--start-review`, ...; each is now a step name of a team), `--by` and `--lead`.

A word after `backlog team` that is none of `new`, `update`, `pop`, `query`, `validate`, `migrate` is refused with exit 2 naming the six
(as today, `src/team/cli.js:85`). Every team command takes the inputs of chapter 01 section 5 (`--team`, `--agent`, `--session`, `--repository`, `--branch`) and `--json`;
`--show-all` is accepted by `query`, `validate` and `migrate` only (chapter 01 section 5; question 5, provisional A).
`--help` of every command reads nothing and writes nothing, as the command matrix says of every `--help`: it documents the generic form
and points to `backlog team query steps --team <name>` for a team's steps and their arguments (review C M11). So a broken or missing team
file never makes help fail, and help never writes the SHA.

## 2. `backlog team new`

1. Resolve the team and the agent; read and check the team's entry (chapter 01 section 4).
2. The arguments are checked against the arguments of the step `new` (chapter 03 section 5; `--name` is always required: exit 2 without it).
3. A new item is built: the next number of the counter (chapter 05), the slug from the name, `team` = the command's team, `repository` and
   `branch` = the session's, every field at its definition default.
4. The rule table decides the step `new` on that item (`$item` is the new item). A refusal: exit 1, nothing written, the number is not
   consumed. An allowance: the effects apply (`related` changes the parent, for example), the item is placed at the end of the team's
   queue unless a `place` effect says otherwise.
5. Write, index, commit, push (section 6). Output: `✅ created <slug> (seq <n>) for team <team>, rule <id>`, then the `say` text if any.

The new item's body is empty; a `note` effect of the step `new` writes its first section (review D, behaviour 4).

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
  already tried in this command is not offered again; when the time budget of section 6 is used up it ends with exit 1. A synchronisation failure of pop is exit 1,
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
| `--show-all` on `new`, `update`, `pop` (or a one-team query form); `--show-all` with `--team` | chapter 01 section 5 (question 5) | 2 | R14-01 to R14-03, R14-07, R14-10 |
| `.backlog/config.json` exists but cannot be read | chapter 01 section 1.1; nothing is written, the file is never replaced | 2 | spike `teams-load.test.mjs` |
| `teams.json` unreadable, team without entry, the team's entry fails validation (schema, a condition with two keys, a rule naming an undeclared field) | chapter 01 section 4; nothing is written, not even the SHA or the record | 2, 1, 2 | INL-03; spike `teams-load.test.mjs` |
| a rule whose test or function has the wrong form (a file that skipped validation) | chapter 03 section 4; pop stops instead of answering idle | 2 | INL-07, INL-09 |
| a `team` effect that names another team | chapter 03 section 8 | 2 | INL-06 |
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

**What is staged.** A writing command stages and commits only the paths it owns: the item files it wrote under `phases/` and `archive/`,
`index.json` and `numbers.json` of its own repository folder (in a backlog inside the code repository, of `.backlog/<owner>/<name>`). It
never stages the team file, `.backlog/team-templates/`, `.backlog/config.json` or the folder root. Today's code stages the whole folder in
the backlog clone and the whole `.backlog` folder in a code repository (`src/shared/sync.js:408,446,490`), which would commit and push a
lead's unvalidated draft of the team file with the next agent's step (review D H2). The SHA and the migration record in
`.backlog/config.json` are committed by a person, as chapter 01 section 4 says; `backlog setup` keeps committing what it writes.

**Team commands: one outcome when another agent published first** (question 2 of `decisions.md`, applied provisionally as option A).
When the push is refused because upstream moved, the CLI looks at what upstream changed. If upstream changed no file of the command's own
repository folder (and not its team file), nothing the command read has changed (ruling R24: a command reads only its own folder, apart
from read-only references to single items of other folders), so today's `git pull --rebase --autostash` rebases its commit and it is
pushed as it is (spike test "upstream changed only another repository folder ..."). If upstream changed its folder, the CLI does not rebase
the step's commit. It drops only its own commit, which is HEAD (`git reset --keep HEAD~1`; today's `mine` of `src/shared/sync.js`), runs
today's pull with rebase, and runs the whole command again on the upstream files: it reads `teams.json` again, evaluates the step again,
allocates the number again (chapter 05 section 3) and writes again. A person's own unpushed commits and uncommitted changes are never
dropped (review C H3, review D H1; spike test "a team re-run drops only the command's own commit"). The push then publishes the branch as
today: in a backlog inside the code repository, the person's own unpushed commits go with the change, as they do today
(`src/shared/sync.js:412`, `:499`); in the backlog clone, likewise for a person's unpushed commit of another folder, since no command stops
because of another folder (R24). The command ends with the result of the last run: exit 0 when the table allows the step on the fresh
items, exit 1 with the deciding rule's refusal when it does not (another agent claimed the item, a limit filled up). Between two runs it
waits a random time below 50 ms x 2 to the power of the attempt (at most 3.2 s), so that writers that collided do not collide again in
step. It keeps trying for at most half of the clone lock's time budget (SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS, 120 s by default), so a command
waiting for the lock behind it still has time to run (review D M2), then ends with exit 3 (exit 1 for pop, section 4) and
`❌ backlog: <owner/name> kept changing while <step> ran; run it again`. Section 7 gives the measurement behind the wait.

- `git reset --keep HEAD~1` touches only the files of the command's own commit, all inside its folder. It refuses when a person has an
  uncommitted change to one of those files; the command then publishes nothing, keeps its commit and stops with exit 3,
  `❌ backlog: your uncommitted change to <path> blocks the re-run of <step>; commit or stash it and run the step again` (review D M3).
- With `push-backlog-updates: false` (a backlog inside the code repository, `src/shared/sync.js:60`) a team command commits and never
  pushes, so it never meets a refused push and never re-runs; two clones then hand out numbers that only the high-water mark at the next
  push separates (chapter 05 section 3; review D, behaviour 87).

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
- **The simple solution adopted**: the random growing wait between re-runs and half of the lock's time budget instead of a fixed three attempts
  (section 6). Nothing else is needed: the number counter cannot collide (chapter 05 section 3), the index is rebuilt by the re-run, and no
  flag changes. A redesign that would take the shared files out of the race (an index per team, numbers allocated by a server) changes R13
  or needs a service, and is out of scope.

## 8. The user commands beside the team commands

Context: owner rulings R3, R3a, R16, R19 and R19a fix what user commands do. They enforce nothing about flow, never read `teams.json`, and
ignore team items unless `--show-all` is given; then they show team items and may set values on them (a safety hatch: a team that no
longer exists, archiving, a change of owner outside the team's enforcement). A session that names a team cannot run them at all.

**The guard of team sessions (R19a).** When SMOOTH_BACKLOG_CLI_TEAM_NAME is set to a name, every user command stops before it reads
anything: exit 2, exactly `❌ backlog: teams are not allowed to use user commands`, with no instruction and no hint (case R19A-01). The
guard runs in `src/main.js` before `setup` and `upgrade` are dispatched there, so it covers them too (review D L7). `backlog --help`,
`backlog --version` and `backlog <command> --help` are not blocked: R19a says the owner did not ask to block `--help` or `--version`, and
the help of one command reads nothing (the command matrix). A variable set to the empty text names no team and does not block, the same
reading as the team lookup of chapter 01 section 5 (case R19A-03; review C L4). The `team` key of `.backlog/config.json` does not block (case
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
| `backlog show <item>`, `backlog history [<item>]`, `backlog changes` | a team item answers as missing; its events are not listed. The "held" section of `backlog changes` lists items by `claimed_by` of items without a team only, never by today's team keys `owner`, `reviewer` or `refiner` (R1; review D L4) | shown and listed with their team |
| `backlog update <item> ...` (every flag, `--claim`, `--release`, `--close`, `--status`, `--append`, `--priority`, `--seq`, and `--set <field>=<value>`) | a team item answers as missing | allowed on a team item, with the history entry above. `--set <field>=<value>` is accepted only on a team item: it writes a field of the team's definition the user flags do not name (the value is stored as JSON when it parses as JSON, else as text). `--priority` moves the item among all entries of its branch |
| `backlog update --replan`, `backlog done <item>` | team items are not touched | team items named are reordered or closed like any item. `backlog done` writes the user word `closed`, which a team's `status` may not allow: `backlog team validate` then reports the item, and a person who closes a team item writes the team's own word with `backlog update <item> --show-all --set status=<word>` instead (review C L7) |
| `backlog move <item> ...`, `backlog archive <item>`, `backlog archive done`, `backlog import ...`, `backlog clean ...` | team items are never selected | team items are moved (between branches of the folder, section 9), archived, imported and cleaned like any item. R3a lists moving, archiving, importing and cleaning among what a user command does not do to a team item; R16 and R19 lift that with the flag, so the flag allows all of them (review C L7) |
| `backlog new --depends-on <item>`, `backlog new --split-from <item>` | a team item answers as missing | a team item may be named; the new item has no team |
| `backlog fields`, `backlog setup`, `backlog upgrade` | no items | flag refused (exit 2) |

`backlog fields` prints the built-in user item definition; a team's definition is `backlog team query rules`.

**`backlog clean` beside team items** (review D M7). Clean deletes the items it selects (without `--show-all`, only items without a team)
and removes from `index.json` only the entries of the items it deleted; the entries of team items keep their places. Today it drops the
branch's whole index list, or every list with `all-branches` (`src/shared/clean.js:47`), which would remove team entries too. Clean then
runs setup again, as today (`src/shared/clean.js:53`); after R23 and R25 that setup run also copies the templates and prints the migration
advice, and it commits and pushes what it wrote, as `backlog setup` does.

## 9. The scope of a command: the actionable repository's folder (ruling R24)

Context: ruling R24 says nothing a command does may affect the entire backlog. The scope of every command is the actionable repository's
folder of the backlog (`<owner>/<name>`, and, where an item says so, its branch). No command reads, writes, converts, renumbers or stops
because of another repository's folder, except a read-only reference to a single item of another repository. This section audits every
command against the rule; `review-response.md` rounds 4 and 5 list each violation found with its fix.

| what | scope after this design |
|---|---|
| item files, `numbers.json`, `index.json` | one set per repository folder; a command writes only those of its own folder (chapter 05) |
| `backlog team migrate` | converts only its own folder, with its own repository's team file (chapter 06 section 2); records the run in its own repository's `.backlog/config.json` (chapter 06 section 2.0) |
| `backlog team validate` | the repository's team file and the items of its own folder (chapter 08 section 7) |
| the actionable repository | the working copy's repository, or the one the repository input names (question 1, provisional A); the command reads and writes that one folder and loads that repository's team file (chapter 01 section 1.1), never a second folder |
| `backlog team new`, `update`, `pop`, `query` | the team's items of the own folder (`$team.items`, chapter 03 section 5); a foreign dependency `owner/name#seq` is read for that one item only. An unresolved one (folder unreadable, still markdown, item absent) reads as a missing item; nothing coded stops because of it, and whether a step is refused is the team's rule: the parallel example's `claim-dependencies` treats it as not closed, so a claim waits (case R24-01; a rule can tell a missing item by its empty fields, chapter 03 section 4). A foreign reference is never checked on a write (case R24-02) |
| `backlog new --depends-on`, `backlog update --set-depends-on` | references inside the own folder are checked for existence and cycles as today; a foreign `owner/name#seq` is only checked to be well formed: today's existence check (`src/shared/new.js:154`, `src/shared/update.js:268`) and cycle walk through other folders (`src/shared/update.js:273`) are removed (review D M1) |
| the conflict guard before every read and write (`refuseConflicts`, `src/shared/sync.js:67-75`) | looks only at the own folder's paths (and `*.json` instead of `*.md`): a conflict in another folder of the clone no longer stops the command (review D M1) |
| the unpublished-commit guard (`refuseUnpublished`, `src/shared/sync.js:79-84`) | looks only at commits that touch the own folder: a person's unpublished commit in another folder no longer stops the command; it is published with the next push (question 2, section 6) |
| the journal (`recoverJournal`, `src/shared/store.js:199-215`) and the rollback of a failed publication (`undoCommit`, `src/shared/sync.js:421-441`) | the one stated exception: they may touch another folder's files, but only to put back the bytes the command itself recorded before it changed them, so the clone ends as it was |
| `backlog clean`, `backlog import`, `backlog archive`, `backlog update --show-all`, `backlog list --show-all` | the own folder only; `--show-all` adds the team items of the own folder, never other folders (chapter 04 section 8) |
| `backlog move` | between branches of the own folder only. Moving an item to another repository's folder is removed: it wrote a second folder and took a number from that folder's counter. A person who wants the work in another repository files a new item there (`backlog new` run in that repository) and archives this one |
| dependency checks at publication | references inside the own folder are checked for existence and cycles as today; a foreign reference is not followed: today's walk through other repositories' items for a cycle (`foreignCycle`, `src/shared/sync.js:352`) and the refusal of a publication whose foreign reference does not resolve (`src/shared/sync.js:319`) are removed |
| chunk work across repositories (today's `backlog.scope`, offers from other folders) | not offered: it reads other folders' items for work (coverage rows of chunk work now SKIP under R24) |
| the clone lock | one lock per clone, because a git clone has one index and one working tree: a command of one folder waits while a command of another folder writes. It delays, never changes another folder. A command that waits longer than the lock's time budget ends with exit 3, a stop caused by another folder's command; this is the accepted limit of one clone per user (review C L8), and the re-run budget of half the lock budget (section 6) keeps it rare |
| `git pull --rebase --autostash` of the backlog clone | brings every folder's upstream changes into the working tree; this is harmless because no command reads another folder's files (beyond single-item references) and the command's own commits touch only its folder, so they cannot conflict with another folder's changes. Staging names the command's own paths only (section 6: item files, `index.json`, `numbers.json`; never the team file, the templates or the configuration) |
| a re-run (section 6) | drops only the command's own commit (`git reset --keep HEAD~1`), never a person's commit or change in any folder |
| a conflict outside the folder | can only come from a commit or an uncommitted change the CLI did not make (a person's own work in the clone, rebased or put back by the autostash). The command then publishes nothing: it aborts the rebase, puts the autostash back, keeps its own commit local and stops with exit 3, `❌ backlog: <path> outside <owner>/<name> conflicts with upstream; this command changes only its own folder: resolve the conflict in the backlog clone and run it again` |
| the validated copy and the per-user record (chapter 01 section 4) | per team file, so per repository; no other repository's record is read or written |
| `.backlog/config.json` | the actionable repository's own file only (the SHA, the migration record) |
| the high-water mark of numbers (chapter 05 section 2) | reads the history of the own folder's paths only |
