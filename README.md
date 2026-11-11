# Smooth Backlog CLI

**Git-native backlog management for engineering teams and coding agents.** Keep work items, priorities, dependencies and delivery evidence next to the code they describe, without a separate project-management service.

[Releases](https://github.com/SmoothSDLC/smooth-backlog-cli/releases) · [Command reference](COMMANDS.md) · [Changelog](CHANGELOG.md) · [License](LICENSE)

## Why it exists

Software work is easier to review when the requirement, the implementation branch and the evidence of completion can be inspected together. A backlog that lives with the repository is available to a developer at the terminal and to a coding agent using the same workflow.

Smooth Backlog CLI keeps **structured, version-controllable work records**: every change to an item is recorded with who made it and when. It manages work; it does not certify the quality of an implementation.

## One backlog, one CLI

There is one backlog per repository and branch and one set of commands. Where the item files live is a setting of the repository, nothing more:

- **inside the repository** (the default): the repository's `.backlog` folder holds the configuration (`.backlog/config.json`) and the items; every change is committed on the current branch (the backlog's paths only) and pushed to origin;
- **in a backlog repository you choose**: `backlog setup` records its path in `.backlog/config.json` (environment variables `SMOOTH_BACKLOG_CLI_ORIGIN_URL` / `SMOOTH_BACKLOG_CLI_HOME` override the configuration); every command pulls it before it reads and pushes after it changes an item, so many repositories and many people share one backlog repository.

The configuration file must be readable: a `.backlog/config.json` that exists but is not a JSON object (a trailing comma, a half-written edit, an array) stops every command that reads the repository's configuration, `setup` included, with exit 2 and `❌ backlog: .backlog/config.json cannot be read (<reason>); fix it: no command runs and nothing is written while it cannot be read`; nothing writes over the file. A missing file is an empty configuration. `backlog upgrade`, `--help` and `--version` do not read it and still work.

The backlog is always a git repository and every change to it is committed and pushed before the command exits. Every command, option, output and help text is the same in both places.

## Install

The package is `@smoothsdlc/smooth-backlog-cli`; the command is `backlog`. GitHub Packages requires authentication, including for public packages.

```sh
npm config set @smoothsdlc:registry https://npm.pkg.github.com
npm login --scope=@smoothsdlc --auth-type=legacy --registry=https://npm.pkg.github.com
npm install --global @smoothsdlc/smooth-backlog-cli --registry=https://npm.pkg.github.com
backlog --version
```

When npm requests a password during login, use a GitHub personal access token (classic) with `read:packages`. For a fixed version, use `@smoothsdlc/smooth-backlog-cli@<version>` in the install command; rollback is the same command with an earlier release. Node.js 24 or newer is required.

## Get started

Inside a git repository:

```sh
backlog setup                                   # deploy the backlog skill to the agent folders present; record the backlog folder when one is configured
backlog new --name "Fix the login redirect" --objective "Users land on their page after login" --summary "login redirect"
backlog list                                    # the queue of this branch, P0 = next, then the finished items
backlog next                                    # the next item
backlog update 1 --status "in progress" --location src/login.js
backlog update 1 --append "## Findings\n- the redirect used the stale cookie"
backlog update 1 --status closed                # or: --close --summary "what was delivered"
backlog archive 1
```

Items are selected by their number (`1`) or slug (`001-fix-the-login-redirect`). A number is unique and never reused, like an issue number: a new item gets one above the highest number the repository's backlog ever used (read from its git history, every branch included, and from `numbers.json` beside `index.json`, which is committed with the item), so deleting, cleaning or archiving an item never frees its number. `backlog update <item> --seq <n>` is refused unless `n` is above that number. A shallow clone cannot prove a number unused, so `backlog new` refuses it (exit 2) until `git fetch --unshallow`. An item file whose name carries a number above one billion cannot be read and stops the commands of its folder until it is renamed or removed. A number that two items of the folder hold (a merge made outside the CLI can leave that, a live and an archived item included) is refused by every command given that number: exit 2, `❌ backlog: number <n> names two items, <slug a> and <slug b>; name the item by its slug`, nothing changed; by its slug either item can be shown, and one of the pair is given a new number with `backlog update <slug> --seq <n>`; other writes to the pair are refused until then. A number an item stores in `depends_on` that two items hold counts as an undone dependency. `--json` on `list`, `show`, `next` and `changes` prints machine-readable output for agents.

## Working with Git and coding agents

- **Branch isolation:** every item belongs to the branch that was checked out when it was created; `backlog list` shows the queue of the current branch, `backlog list all-branches` every branch the backlog carries (inside the repository the items are committed on their branch, so a branch sees the items it carries), `backlog move <item> --to-branch <name>` moves an item.
- **Many hands:** a named agent (`SMOOTH_BACKLOG_CLI_AGENT=<name>`, or `--claim <name>`) claims an item; another agent cannot take it; a write to an item that someone else changed since the agent last read it is refused (exit 5) until the agent reads it again (`backlog show <item> --agent <you>`).
- **Reviews:** a team step, taken with `backlog team update <item> <step> --team <team> --agent <you>`: the step is a word the team's rules name (for example the holder's hand-to-check and another member's check), the rules decide whether it is allowed, and the author never reviews its own work.
- **Teams:** the team rules — refinement before work, review rules before the close, work-in-progress limits — apply to items that belong to a team. Teams, their leads and members and their review rules are configuration in the backlog folder (`teams.json`): for example "an item of team A closes when one member of team A and one member of team B passed the current commit". Nothing about a particular team or agent is built into the CLI. See `backlog update --help` and `backlog team --help`.
- **Team commands under concurrency:** `backlog team new`, `update` and `pop` publish only their own commit, never a commit of yours that is not pushed yet. When another clone published first and changed what the command read, the command runs again on the new files (a refusal by the rules is then printed and nothing is published; `pop` does not offer an item an earlier round offered), and it stops with an error when the files keep changing. Publishing this way needs git 2.40 or later.
- **Skill for agents:** `backlog setup` deploys the built-in backlog skill (`templates/skills/backlog`) into every agent folder present in the repository (`.agents`, `.claude`, `.github`, `.qwen`), so coding agents learn the commands from the repository itself. It also copies the generic team templates (`templates/teams`: scrum, extreme-programming, parallel, single-agent, patterns) to `.backlog/team-templates`, replacing that folder on every setup and committing it with the configuration; copy one to the team file and edit it there, since no command reads a template.

## Statuses

An item carries one status word. `backlog archive` writes none: an archived item keeps the status it had and is archived by where it is stored (the `archive/` folder). An item outside a team has free text: `closed`, `done` and `archived` finish it (`archived` only for items archived by an earlier version), every
other word (`pending`, `in progress`, `blocked on vendor`) keeps it in the queue, and `backlog update <item> --status
<word>` sets it (the word is stored exactly as typed: write `in progress`, not `in_progress`). The items of a team follow one order,
`new`, `refining`, `refined`, `refinement review`, `ready`, `in progress`, `ready for review`, `reviewing`, `ready for
external review`, `external review`, `review complete`, `closed`, `archived`, plus the wait `awaiting decision` for an
owner question; the earlier team steps (`--refine-start`, `--claim`, `--request-review`, `--review`, `--close` and the others, now steps of `backlog team update <item> <step>`
that the team's rules define) move the item along it, and `--status` on such an item is refused. The order and the rules of each step are a
definition file the CLI ships (`templates/workflows/team.json`). Which review stages apply, and how many passes each
needs, comes from the team's entry in `teams.json` (`review`: a list of `{ "stage": "peer" | "external", "count": n }`;
without the key both stages apply, an empty list means no review); a team step for a team with no entry is refused. A
review verdict is `complete` or `reject` (`pass` and `changes` are accepted as the same words): a reject returns the
item to work, clears the recorded passes and keeps the finding in the item's review history. Items written by earlier
builds are read as the new words and are not rewritten; their old `stage` and `review_state` fields are dropped when
the item is next written.

## Commands for the user, commands for agents

The CLI has two personas. **The user** is a person using the CLI: the user commands enforce nothing, so a user may set any status or value, and it is the user's job to find the commands and flags that show an item whose value is not a default. A user who wants an enforced flow defines a custom team named `user` and uses the team commands. **The agents** are AI agents working in teams through `backlog team`: everything a team enforces comes from its team behaviour file, not from the CLI's code.

There are two kinds of commands: the user's and the agents'. The user commands (`new`, `update`, `done`, `list`, `show`, `next`, `history`, `changes`, `fields`, `move`, `archive`, `import`, `clean`, `setup`, `upgrade`)
know nothing of teams: they work on items without a team. `backlog update` refuses every change of an item that belongs to a team,
and `backlog new --split-from` refuses a team's item: those go through `backlog team`. So do the user commands that would change the
team state of an item (status, claim, review, refinement, dependencies, its place in the team's queue, its deletion): `done`, `update --replan`
naming it, `archive` of a team item that is not closed (also with `--force`), `import --higher` and `clean` refuse it with one line, exit 1,
and write nothing. `move`, `archive` of a closed team item and `archive done` only file or store an item and work on a team item
like on any other. A person's items take their owner from
`.backlog/config.json`, where `backlog setup` writes `user` (the git `user.name`, else the name the person is logged in
with) and an empty `team`; a second setup keeps what is there.

Everything that knows a team lives under `backlog team`: `pop` (the one next-action command, answering by the agent's role in
the team's entry), `new` (files an item of the team in stage refining, and splits a team's item), `update` (the team steps: claim, release, review, close, the refinement steps, hand-offs),
`query` (the read views and the views of the team) and `define` and `workflow`. Each takes `--team` and `--agent`; `SMOOTH_BACKLOG_CLI_TEAM_NAME` and
`SMOOTH_BACKLOG_CLI_AGENT` stand in for them, then the `team` and `user` of the configuration. A team without an entry is refused.

- **What the team entry controls:** a team is one entry of `teams.json` at the root of the backlog: its `lead`, its
  `members`, its `external_reviewers` and the review stages it asks for (`review`), plus the flow it uses and its
  limits. The roles, the order of `team pop`, the hand-off gates and the review stages all come from it and from the flow.
- **Where it lives:** `backlog team define --file <team.json>` checks a definition and adds it to `teams.json`, committed and
  pushed like any change; `backlog team workflow --file <flow.json>` does the same for a flow (`workflows.json`). The CLI ships
  the default flow `team`. A team that has open items is not replaced: register the new composition under another name.
- **The status order** of a team's items is the flow's (see Statuses). **The item template** is `backlog fields`, and
  `backlog new --help` carries the same table.

The team options are not options of the user commands: the team steps of `backlog update`, the team views of `backlog team query` and
`--team` and `--review-refs` of `backlog new` are refused as unrecognized arguments, and a team's item is refused by `backlog update`.
`backlog pop` and `backlog work` are gone: `backlog team pop` replaces both. It takes the first step the team's pop table offers the agent, as one published commit, and prints the item; `--lead`, `--scope`, `--all` and `--claim-now` no longer exist.

## Where the data lives

The items (markdown files with front matter) and the index (`index.json`, the order of the queue of each branch) in the folder of your repository's items are the data. Both are committed and pushed with every change, a change of the order changes the index and no item, and the CLI keeps no copy of them: no database, no cache (only the lock, the journal of a running change and the record of what each agent has read stay in the clone's state folder). When an item cannot be read after the latest update, every command names the item and the field that cannot be read: set the field again with `backlog update <item> --<field> <value>`, or bring back the item's previous version with `backlog update <item> --restore`.

## Data integrity

The same five rules hold wherever the items live:

- Every command, reads included, first updates the repository that holds the items from its origin.
- Every change is committed and pushed before the command exits (inside your repository the branch is pushed with it; `"push-backlog-updates": false` in `.backlog/config.json` turns that off).
- A push the origin rejects is retried after another update, up to three times.
- A write to an item that someone else changed since you last read it is rejected (exit 5) and prints the item as it is now.
- A claim of an item another agent holds is refused.

## Command reference

| Command | Purpose |
|---|---|
| `backlog new --name <text> [options]` | Add an item; `--status <word>` is stored exactly as typed; `--split-from <item>` makes a sibling with its context and sets `parent`; `--ask` asks on a terminal for the title, objective, summary and body you did not give (refused without a terminal, exit 2) |
| `backlog update <item> [options]` | Change fields, body, status, priority of an item without a team; claim, release, close |
| `backlog done <item>` | Finish an item that has no team |
| `backlog list [new\|open\|done\|archive\|branches\|critical\|all-branches]` | The full stack of this branch (open items in queue order, then the finished ones), one kind of item, the branches, the critical items, or every branch |
| `backlog show <item>[,<item>...]` | One item whole: its row, front matter and body; `--agent <name>` records that the agent has read it |
| `backlog next` / `backlog next all-branches` | The next item of this branch, whole / of every branch |
| `backlog history [<item>]` | The history of one item (who changed what, from and to), or the latest 50 entries of the backlog |
| `backlog changes` | Which items changed since your last use |
| `backlog fields` | The item template: every key and field, its type and default, who sets it, what it is for |
| `backlog team pop --team <team> --agent <name>` | What one agent of a team does next: the first step the team's pop table offers, taken for the agent, with the whole item |
| `backlog team new --team <team> --agent <name> --name <text> [--<argument> <value>]...` | Add an item of a team: the team's rules for the step `new` decide, and the number is taken only when they allow it; the arguments are the ones the rules read (`--estimate`, `--parent`, ...) |
| `backlog team update <item> <step> --team <team> --agent <name> [--<argument> <value>]...` | One step of the team's rules on an item: the rules decide, a refusal names the rule and writes nothing; the arguments are the ones the rules read (`--note`, ...) |
| `backlog team query --team <team> --agent <name> <view>` | `backlog team query check <item> <step>` (the rules' answer for a step, nothing taken), `backlog team query plan` (what `pop` would offer each person) and the team views (claimable, reviewable, blocked, decisions, wip) and the read options of the team rules (`--phase`, `--status`, `--events`, `--branch`, ...) |
| `backlog team validate [--team <team> \| --show-all] [--json]` | Check the team file in full and this repository's items and numbers against it; every finding says where, why and how to fix it (exit 2 on an error, warnings never) |
| `backlog team migrate --team <team>` | Reserved for converting the items to the team format; answers that it is not available yet |
| `backlog team define --file <team.json>` | Register a team in the backlog configuration |
| `backlog team workflow --file <flow.json>` | Register a flow definition; `--show <name>` prints one |
| `backlog move <item> --to-branch <name>` | Move an item to another branch (or `--to-repository`) |
| `backlog archive <item>` | Archive a finished item |
| `backlog archive done` | Archive every finished item of this branch |
| `backlog import --branch <source> [--higher]` | Move the open items of another branch here; `--higher` puts them first in the queue |
| `backlog clean [all-branches]` | Remove every item of this branch (or of every branch) after a typed yes |
| `backlog setup [--ask]` | Point the repository at its backlog folder and deploy the skill |
| `backlog upgrade [check\|auto\|off\|disable\|<version>]` | Update the backlog program itself; `backlog update` is the item command and never installs |

`backlog <command> --help` is the contract of each command; [COMMANDS.md](COMMANDS.md) holds the same text.

### The update notice

A command that a person runs at a terminal (standard error is a terminal) also checks the package registry for a newer release
when the user's configuration says one is due: the weekly check is on by default and automatic updates are off; a check is due about
once a week, about once a day with `backlog upgrade auto`, and an hour after a check that failed. The check runs beside the command and
adds at most 1.5 seconds when it is still running after the command; a check that takes longer is stopped and counts as failed. It
prints at most one warning on standard error (`backlog: Version 2.1.0 is available; run backlog upgrade.`, or the note that a failed
check is tried again in an hour), never changes the output or the exit code of the command, and installs nothing unless automatic
updates are on. Nothing runs when standard error is not a terminal (agents and scripts), for `--help`, `--version`, `upgrade` and
`setup`. `backlog upgrade disable` turns the weekly check off and `backlog upgrade off` turns automatic updates off; with both off
nothing is checked. The choices live in `smooth-backlog-cli/config.json` of the user's configuration folder, never in a repository.

## Development and verification

```sh
npm ci
npm test          # the unit tests and the BDD scenarios of features/*.feature, each run with the items inside the repository and in a backlog repository
npm run check
```

The BDD scenarios (`features/*.feature`, run by `.agents/test/features.test.js` with the Node test runner) record every user workflow of a person, an agent and a team; a scenario that behaves differently depending on where the items live is a defect. GitHub Actions runs the suite on Linux with Node 24; the workflow is triggered manually.

## License

[Apache License 2.0](LICENSE), © [SmoothSDLC Systems Inc.](https://SmoothSDLC.com)
