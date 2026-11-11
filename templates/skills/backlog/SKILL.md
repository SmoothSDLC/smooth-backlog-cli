---
name: backlog
description: >
  Use this skill when planning, prioritizing, recording progress, or completing
  this repository's backlog work, even if the user asks what to work on next
  without naming the backlog. Manage branch-local tasks and evidence through
  smooth-backlog-cli. It does not manage unrelated project trackers or Git branch cleanup.
license: Apache-2.0
compatibility: Requires Node.js 24+, Git, and the backlog executable.
metadata:
  team: SmoothSDLC
  version: "2.0.0"
  source: "https://github.com/SmoothSDLC/smooth-backlog-cli"
---

# Repository backlog

The backlog of this repository and branch: items with a number, a name, an objective, a rank in the queue of its branch (P0 is next) and a
status (a free word stored as typed; closed, done and archived are the finished words, every other word is open). The CLI is the only interface to the backlog: read and change it through
`backlog` commands, never through its files. `backlog --help` lists the commands; `backlog <command> --help` is the
contract of each (also in references/commands.md). Where the items live is a setting of the repository (inside it, or
in a backlog repository shared by many); it changes no command, and every change is committed and pushed by the CLI.

When the `backlog` command is missing, run `bash <this skill folder>/scripts/install-backlog-cli.sh` from inside the
repository: it installs or updates the CLI and runs `backlog setup`. The CLI updates itself with `backlog upgrade`
(`check`, `auto`, `off`, `disable` or a version); `backlog update` is the item command and never installs anything.
Setup also copies the generic team templates to `.backlog/team-templates` (replaced on every setup; nothing reads them): a person copies one to the team file and edits it there, so an agent never edits a template in place.
A person at a terminal may see one warning line on standard error (`backlog: Version <x> is available; run backlog upgrade.`) about once a
week: it is the update notice, not an error, and it never appears when standard error is not a terminal or changes a command's output or
exit code; `backlog upgrade disable` turns the weekly check off, `backlog upgrade off` turns automatic updates off.

## Working alone (a person or one agent)

- Read: `backlog list` (the queue and the finished items of this branch; `backlog list open|new|done|archive|branches|critical|all-branches` one kind, the branches, the critical items or every branch), `backlog fields` (the item template: every key and field, its type and default, who sets it, what it is for), `backlog history [<item>]` (what changed in an item, by whom and when: one entry per command), `backlog show <item>` (one item, whole; `--agent <you>` records that you have read it), `backlog history [<item>]` (its events, or the latest 50), `backlog changes` (what changed since your last use), `backlog next` (`backlog next all-branches` over every branch).
- Create: `backlog new --name "<name>" --objective "<one line>" --summary "<what it is about>"`; `--priority 0` makes it
  next; `--depends-on <items>` when other items must finish first; `--split-from <item>` makes a sibling with its context.
  `backlog new --ask` asks a person on a terminal for the title, objective, summary and body they did
  not give; an agent without a terminal gives the fields as options (`--ask` is refused there, exit 2).
- Change: `backlog update <item> --name|--objective|--summary|--status|--location|--priority <value>`, `--append "<text>"`
  adds body text, `--note "<text>"` records an event, `--set-depends-on <items|none>`; `--replan "<id,id,...>"` orders the queue.
- Claim and release (named agents; an item without a team): `backlog update <item> --claim <you>`, `--release <you>`; `backlog team pop --team <team> --agent <you>`
  takes the next step the team's pop table offers you. Read an item (`backlog show <item> --agent <you>`) before you change it: a write after someone else changed
  the item since your read is refused (exit 5) until you read it again.
- Reviews, refinement and hand-offs are team steps: see Team work. `backlog update` refuses every change of an item that belongs to a team, and so do `done`, `update --replan` naming it, `archive` of a team item that is not closed, `import --higher` and `clean` (one line, exit 1, nothing written); `move`, `archive` of a closed team item and `archive done` work on it like on any other.
- An item that cannot be read: every command names it and the field; `backlog update <item> --<field> <value>` sets the field again, `backlog update <item> --restore` brings back its previous version.
- Finish: `backlog done <item>` (the same as `backlog update <item> --status closed`) or `backlog update <item> --close --summary "<what was delivered>"`; `backlog archive <item>`
  keeps a finished item out of the queue (it keeps the item's status: an item is archived by where it is stored, no status word says so; `backlog archive done` archives every finished item of the branch); `backlog move <item> --to-branch <name>` moves it to another branch;
  `backlog import --branch <source> [--higher]` brings the open items of another branch here; `backlog clean [all-branches]` removes every item of the branch (or of every branch) after a typed yes.

## Team work

A team's items follow the team rules configured in `teams.json` of the backlog folder: each team's lead, members,
`review` rules (how many members of which team must pass the current work commit before the close) and
`refinement_review` rules. A team session is bound by SMOOTH_BACKLOG_CLI_TEAM_NAME, SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY and SMOOTH_BACKLOG_CLI_TEAM_BRANCH; the caller is
SMOOTH_BACKLOG_CLI_AGENT and acts only as itself. Every command here is a `backlog team` command and takes `--team <team> --agent <you>` (SMOOTH_BACKLOG_CLI_TEAM_NAME and
SMOOTH_BACKLOG_CLI_AGENT stand in).

- File an item of the team: `backlog team new --team <team> --agent <you> --name "<name>" [--<argument> <value>]...`; the team's rules for the step new decide
  whether it is allowed and which arguments they take (`--estimate <minutes>`, `--parent <item>`, ...); a refusal prints its reason (exit 1) and writes nothing.
  `backlog team new --help` says what is printed.
- Take a step on an item: `backlog team update <item> <step> --team <team> --agent <you> [--<argument> <value>]...`. The step is a word the team's rules name (claim, release,
  hand-to-check, review, close, ... as the team's file defines them) and the arguments are the names its rules read (`--note "<text>"`, `--verdict pass`, ...); a word no rule names is refused with the
  list of the team's steps. The rules decide: a refusal prints its reason and the id of the rule (exit 1) and writes nothing; a step no rule names, or an argument the step does not take, is refused
  with the list of what the team has (exit 2). A step is published as the command's own commit, so another agent's step on the same item never overwrites yours: when it was first, yours runs
  again on the new files. Act only as yourself: the agent is the caller, and another agent's item is the lead's to hand on by the team's own steps.
- Lead: `backlog team pop --team <team> --agent <you>` takes the step the team's pop table offers the lead (a lead's entry of the table, for the team's work item, for example); `backlog team query plan --team <team>` is the dispatch plan (what `pop` would offer each person; nothing is taken) and `backlog team query check <item> <step> --team <team>` the rules' answer for a step on an item without taking it and `backlog team query filter <name> --team <team>` the items a filter of the team's rules selects (the team file names them); split an
  item only when it is too big for one member (`backlog team new --team <team> --agent <you> --name "<name>" --parent <item>` adds a child when the team's rules take `--parent`).
- Member: `backlog team pop --team <team> --agent <you> --json` takes the one next step of the team's pop table for you, publishes it as one commit and prints `{"action", "item", "entry", "rule", "item_file"}`
  (idle: `{"action":"idle"}`, exit 3, and only idle exits 3; a push or pull that fails exits 1); `--dry-run` answers without writing. Carry the work on with `backlog team update <item> <step>`, as the team's
  rules for that step say.
- Read: `backlog team query --team <team>` lists the team's open items in queue order (`--branch <name>` for one branch, `--show-all` for every team), and `backlog team query <item> --team <team>` prints one item whole (`--json` prints the item document).
- Limits: `wip-limits.json` in the backlog folder.
- Check the team file: after editing the team's rules, run `backlog team validate --team <team>` (`--show-all` for every team, `--json` for a list). It checks the file and this repository's items against it and prints each problem with a fix; exit 2 means an error, and no team command runs until the whole file is valid.

## Gotchas

- An item is its number (or slug); priorities are ranks that move when the queue changes. A number is unique and never reused: a new item gets one above the highest number the repository's backlog ever used, so deleting, cleaning or archiving items never frees one, and `backlog update <item> --seq <n>` is refused unless `n` is above that mark. `numbers.json` in the repository's folder records the last number and is committed with the item. A shallow clone cannot prove a number unused: `backlog new` refuses it (exit 2, `git fetch --unshallow`). If a merge made outside the CLI left two items with one number (a live and an archived one too), a command given that number stops with exit 2 and changes nothing (`number <n> names two items, <slug a> and <slug b>; name the item by its slug`): by its slug either item can be shown, and `backlog update <slug> --seq <n>` gives one of them a new number; other writes to the pair are refused until then. A number stored in `depends_on` that two items hold counts as an undone dependency.
- Every command that changes an item records who (SMOOTH_BACKLOG_CLI_AGENT, else `--by`/`--claim`, else the user) and when.
- Exit codes: 0 success, 1 refused (the reason on standard output, ❌), 2 invalid input or a failure, 3 idle (team
  pop), 4 the configured backlog repository is not cloned (`backlog setup`), 5 stale view (read the item again).
  Exit 2 also stops every command that reads the repository's configuration (not `backlog upgrade`, `--help`, `--version`) when `.backlog/config.json` exists but is not a JSON object (a trailing comma, a half-written
  edit): fix the file by hand; nothing runs and nothing is written until it can be read.
