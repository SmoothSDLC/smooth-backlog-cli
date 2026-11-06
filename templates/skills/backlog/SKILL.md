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
status (pending, in_progress, done, archived). The CLI is the only interface to the backlog: read and change it through
`backlog` commands, never through its files. `backlog --help` lists the commands; `backlog <command> --help` is the
contract of each (also in references/commands.md). Where the items live is a setting of the repository (inside it, or
in a backlog repository shared by many); it changes no command, and every change is committed and pushed by the CLI.

When the `backlog` command is missing, run `bash <this skill folder>/scripts/install-backlog-cli.sh` from inside the
repository: it installs or updates the CLI and runs `backlog setup`.

The first release's command names still work as aliases of these commands: `init`, `init clean`, `list open|done|new|archive|branch`, `branch`, `new <name> --description --state`, `set <item> <field> <value>`, `priority <item> [position]`, `done <item>` (also `<item> done`) and `move <item> <branch>`; `references/commands.md` lists what each runs.

## Working alone (a person or one agent)

- Read: `backlog query` (the queue), `backlog fields` (the item template: every field and what it is for), `backlog query --phase <item> --json` (one item, whole), `backlog next`.
- Create: `backlog new --name "<name>" --objective "<one line>" --summary "<what it is about>"`; `--priority 0` makes it
  next; `--depends-on <items>` when other items must finish first; `--split-from <item>` makes a sibling with its context.
- Change: `backlog update <item> --name|--objective|--summary|--status|--location|--priority <value>`, `--append "<text>"`
  adds body text, `--note "<text>"` records an event, `--set-depends-on <items|none>`; `--replan "<id,id,...>"` orders the queue.
- Claim and release (named agents): `backlog update <item> --claim <you>`, `--release <you>`; `backlog team pop --team <team> --agent <you>`
  says what to do next. Read an item (`query --phase <item>`) before you change it: a write after someone else changed
  the item since your read is refused (exit 5) until you read it again.
- Review (optional): `--request-review <agent|any> --note "<commits, evidence>"`, then the reviewer's `--start-review --by
  <reviewer>` and `--review pass|changes --by <reviewer> --comments "<findings>"`; the author never reviews its own work.
- An item that cannot be read: every command names it and the field; `backlog update <item> --<field> <value>` sets the field again, `backlog update <item> --restore` brings back its previous version.
- Finish: `backlog update <item> --status done` or `--close --summary "<what was delivered>"`; `backlog archive <item>`
  keeps a finished item out of the queue; `backlog move <item> --to-branch <name>` moves it to another branch.

## Team work

A team's items follow the team rules configured in `teams.json` of the backlog folder: each team's lead, members,
`review` rules (how many members of which team must pass the current work commit before the close) and
`refinement_review` rules. A team session is bound by TEAM_NAME, TEAM_REPOSITORY and TEAM_BRANCH; the caller is
BACKLOG_AGENT and acts only as itself.

- Lead: `backlog team pop --team <team> --agent <you>` takes the team's work item (and gives the lead its next action); split it only when it is too big for
  one member (`backlog new --split-from <item>`); `backlog team query --team <team> --plan` is the dispatch plan; `--request-refinement-review
  --by <you>` sends a refined item to its refinement review; `--request-decision "<question>" --by <you>` asks the owner
  (`backlog team query --team <team> --decisions`; the owner answers with `--decision "<answer>"`); `--reassign <agent> --reason "<why>"
  --by <you>` hands an item on and `--reassign-review <agent> --reason "<why>" --by <you>` a stale review;
  `--wip-override "<reason>" --by <you>` lifts a work-in-progress limit for one item; `--set-team <team>` gives an item
  to a team and `--set-chunk yes` makes it chunk work any member does between items. Act only as yourself: another
  agent's item or review is the lead's to hand on.
- Member: `backlog team pop --team <team> --agent <you> --json` gives the one next action and marks the item as yours. Refine an item in
  stage refining (`--refine-start --by <you>`, `--set-review-refs`, `--set-estimate`, `--set-complexity`,
  `--set-depends-on`, `--append` a definition of done, `--refine-done --by <you> --note "<what>"`); a refinement
  reviewer records `--refinement-review pass|changes --by <reviewer> --comments "<findings>"`; a ready item is claimed,
  worked (`--append`, `--waiting "<what>" --by <you>`, `--waiting-done`), reviewed and closed by its claimer. A member's
  review request, a changes verdict it gives and its close end its session (never the lead's): the output's last line
  says END THE SESSION NOW - reply with text only and make no further tool call.
- Hand-offs: a producer records `--handoff <dependent> --handoff-commit <sha> --handoff-contract "<text>"
  --handoff-verification "<text>" [--handoff-outputs ... --handoff-pickup ... --handoff-risks ...] --by <you>`; the lead `--accept-handoff <dependent> --checks "<what>" --by <lead>` or
  `--reject-handoff <dependent> --reason "<why>" --by <lead>`; a producer closes when each dependent's hand-off is accepted.
- Limits: `wip-limits.json` in the backlog folder; `backlog team query --team <team> --wip` shows the counts.

## Gotchas

- An item is its number (or slug); priorities are ranks that move when the queue changes.
- Every command that changes an item records who (BACKLOG_AGENT, else `--by`/`--claim`, else the user) and when.
- Exit codes: 0 success, 1 refused (the reason on standard output, ❌), 2 invalid input or a failure, 3 idle (team
  pop), 4 the configured backlog repository is not cloned (`backlog setup`), 5 stale view (read the item again).
