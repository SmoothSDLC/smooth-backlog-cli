# Smooth Backlog CLI

**Git-native backlog management for engineering teams and coding agents.** Keep work items, priorities, dependencies and delivery evidence next to the code they describe, without a separate project-management service.

[Releases](https://github.com/SmoothSDLC/smooth-backlog-cli/releases) · [Command reference](COMMANDS.md) · [Changelog](CHANGELOG.md) · [License](LICENSE)

## Why it exists

Software work is easier to review when the requirement, the implementation branch and the evidence of completion can be inspected together. A backlog that lives with the repository is available to a developer at the terminal and to a coding agent using the same workflow.

Smooth Backlog CLI keeps **structured, version-controllable work records**: every change to an item is recorded with who made it and when. It manages work; it does not certify the quality of an implementation.

## One backlog, one CLI

There is one backlog per repository and branch and one set of commands. Where the item files live is a setting of the repository, nothing more:

- **inside the repository** (the default): the repository's `.backlog` folder holds the configuration (`.backlog/config.json`) and the items; every change is committed on the current branch (the backlog's paths only) and pushed to origin;
- **in a backlog repository you choose**: `backlog setup` records its path in `.backlog/config.json` (environment variables `BACKLOG_ORIGIN_URL` / `BACKLOG_HOME` override the configuration); every command pulls it before it reads and pushes after it changes an item, so many repositories and many people share one backlog repository.

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
backlog query                                   # the queue, P0 = next
backlog next                                    # the next item
backlog update 1 --status "in progress" --location src/login.js
backlog update 1 --append "## Findings\n- the redirect used the stale cookie"
backlog update 1 --status closed                # or: --close --summary "what was delivered"
backlog archive 1
```

Items are selected by their number (`1`) or slug (`001-fix-the-login-redirect`). `backlog --json` on `query` and `next` prints machine-readable output for agents.

## Working with Git and coding agents

- **Branch isolation:** every item belongs to the branch that was checked out when it was created; `backlog query` shows the queue of the current branch, `--all` every branch the backlog carries (inside the repository the items are committed on their branch, so a branch sees the items it carries), `backlog move <item> --to-branch <name>` moves an item.
- **Many hands:** a named agent (`BACKLOG_AGENT=<name>`, or `--claim <name>`) claims an item; another agent cannot take it; a write to an item that someone else changed since the agent last read it is refused (exit 5) until the agent reads it again (`backlog query --phase <item>`).
- **Reviews:** the holder asks for a review (`--request-review <agent|any> --note "<commits, evidence>"`); another agent records the verdict (`--review complete|reject --by <reviewer> --comments "<findings>"`); the author never reviews its own work.
- **Teams:** the team rules — refinement before work, review rules before the close, work-in-progress limits — apply to items that belong to a team. Teams, their leads and members and their review rules are configuration in the backlog folder (`teams.json`): for example "an item of team A closes when one member of team A and one member of team B passed the current commit". Nothing about a particular team or agent is built into the CLI. See `backlog update --help` and `backlog team --help`.
- **Skill for agents:** `backlog setup` deploys the built-in backlog skill (`templates/skills/backlog`) into every agent folder present in the repository (`.agents`, `.claude`, `.github`, `.qwen`), so coding agents learn the commands from the repository itself.

## Statuses

An item carries one status word. An item outside a team has free text: `closed`, `done` and `archived` finish it, every
other word (`pending`, `in progress`, `blocked on vendor`) keeps it in the queue, and `backlog update <item> --status
<word>` sets it (hyphens and underscores stand for spaces: `in_progress`). The items of a team follow one order,
`new`, `refining`, `refined`, `refinement review`, `ready`, `in progress`, `ready for review`, `reviewing`, `ready for
external review`, `external review`, `review complete`, `closed`, `archived`, plus the wait `awaiting decision` for an
owner question; the team steps (`--refine-start`, `--claim`, `--request-review`, `--review`, `--close` and the others)
move the item along it, and `--status` on such an item is refused. The order and the rules of each step are a
definition file the CLI ships (`templates/workflows/team.json`). Which review stages apply, and how many passes each
needs, comes from the team's entry in `teams.json` (`review`: a list of `{ "stage": "peer" | "external", "count": n }`;
without the key both stages apply, an empty list means no review); a team step for a team with no entry is refused. A
review verdict is `complete` or `reject` (`pass` and `changes` are accepted as the same words): a reject returns the
item to work, clears the recorded passes and keeps the finding in the item's review history. Items written by earlier
builds are read as the new words and are not rewritten; their old `stage` and `review_state` fields are dropped when
the item is next written.

## Commands for people, commands for teams

There are two kinds of commands. The plain ones (`new`, `update`, `query`, `next`, `fields`, `move`, `archive`, `setup`)
know nothing of teams: they work on items, whoever the items belong to. A person's items take their owner from
`.backlog/config.json`, where `backlog setup` writes `user` (the git `user.name`, else the name the person is logged in
with) and an empty `team`; a second setup keeps what is there.

Everything that knows a team lives under `backlog team`: `pop` (the one next-action command, answering by the agent's role in
the team's entry), `update` (the team steps: claim, release, review, close, the refinement steps, hand-offs),
`query` (the views of the team) and `define` and `workflow`. Each takes `--team` and `--agent`; `TEAM_NAME` and
`BACKLOG_AGENT` stand in for them, then the `team` and `user` of the configuration. A team without an entry is refused.

- **What the team entry controls:** a team is one entry of `teams.json` at the root of the backlog: its `lead`, its
  `members`, its `external_reviewers` and the review stages it asks for (`review`), plus the flow it uses and its
  limits. The roles, the order of `team pop`, the hand-off gates and the review stages all come from it and from the flow.
- **Where it lives:** `backlog team define --file <team.json>` checks a definition and adds it to `teams.json`, committed and
  pushed like any change; `backlog team workflow --file <flow.json>` does the same for a flow (`workflows.json`). The CLI ships
  the default flow `team`. A team that has open items is not replaced: register the new composition under another name.
- **The status order** of a team's items is the flow's (see Statuses). **The item template** is `backlog fields`, and
  `backlog new --help` carries the same table.

The earlier spellings of the team steps on `backlog update` (for example `--claim`) still work and print
`moved: use backlog team update ...` on standard error. `backlog pop` and `backlog work` are gone: `backlog team pop` replaces both.

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
| `backlog new --name <text> [options]` | Add an item; `--split-from <item>` makes a sibling with its context |
| `backlog update <item> [options]` | Change fields, body, status, priority; claim, release, review, close; the team steps |
| `backlog query [options]` | The queue, one item (`--phase`), events, other branches |
| `backlog list` | The queue (the same as `query`) |
| `backlog next` | The next item of this branch, whole |
| `backlog fields` | The item template: every field, what it is for, who sets it |
| `backlog team pop --team <team> --agent <name>` | What one agent of a team does next, marked as theirs, with the whole item |
| `backlog team update <item> --team <team> --agent <name> <step>` | One team step: claim, release, review, close, ... |
| `backlog team query --team <team> --agent <name> <view>` | The team views: claimable, reviewable, blocked, decisions, plan, wip |
| `backlog team define --file <team.json>` | Register a team in the backlog configuration |
| `backlog team workflow --file <flow.json>` | Register a flow definition; `--show <name>` prints one |
| `backlog move <item> --to-branch <name>` | Move an item to another branch (or `--to-repository`) |
| `backlog archive <item>` | Archive a finished item |
| `backlog setup [--ask]` | Point the repository at its backlog folder and deploy the skill |

`backlog <command> --help` is the contract of each command; [COMMANDS.md](COMMANDS.md) holds the same text.

### Aliases

The command names of the first release still work; each runs the command set above (`backlog <alias> --help` prints the alias line and then the help of the command it runs):

- `init [name]` runs `backlog setup`
- `init clean [name]` runs `a typed yes, then every item of this repository's backlog is removed as one published change, then backlog setup`
- `list new` runs `backlog query --only new`
- `list open` runs `backlog query --only open`
- `list done` runs `backlog query --only done`
- `list archive` runs `backlog query --only archive`
- `list branch` runs `backlog query --branches`
- `branch` runs `backlog query --branches`
- `new <name> [--description D] [--state S] [--priority P]` runs `backlog new --name <name> --objective D --status S --priority P (--summary is the name unless given; state new = new, open = in progress, done = closed)`
- `set <item> name|description|state|summary|priority|branch|commit|location <value>` runs `backlog update <item> --name|--objective|--status|--summary|--priority|--branch|--commit|--location <value>`
- `priority <item> <position>` runs `backlog update <item> --priority <position>`
- `priority <item>` runs `backlog query --phase <item>`
- `done <item>` runs `backlog update <item> --status done`
- `<item> done` runs `backlog update <item> --status done`
- `move <item> <branch>` runs `backlog move <item> --to-branch <branch>`
- `set <item> ac|tasks|outcomes|evidence|references|item-state-description|work_item_id <value> [--force]` runs `backlog update <item> --section <Heading> --set-lines <value> (the list is the section of that name in the item body)`
- `add <item> <list> <entry> [--top]` runs `backlog update <item> --section <Heading> --add-line <entry> [--top]`
- `replace <item> <list> <JSON-array>` runs `backlog update <item> --section <Heading> --set-lines <JSON-array>`
- `remove <item> <list> <n>` runs `backlog update <item> --section <Heading> --remove-line <n>`
- `priority <item> <list> <n> <position>` runs `backlog update <item> --section <Heading> --move-line <n>:<position>`
- `new … --ac A --tasks J --outcomes J --evidence J --references J --item-state-description T --work_item_id W` runs `the same new with --body holding one section per given list (--ac is the section Definition of done; a JSON array becomes one line per entry)`
- `<item> set|priority|move …` runs `the same command with the item first (backlog 3 done)`
- `<command> --ask | --headless (or BACKLOG_HEADLESS=1)` runs `the command without the switch: it is accepted and ignored (--ask still asks for the folder in setup and init)`
- `query --pop, next --agent` runs `nothing: it is refused with a pointer to backlog team pop --team <team> --agent <name> (--dry-run only answers)`


## Development and verification

```sh
npm ci
npm test          # the unit tests and the BDD scenarios of features/*.feature, each run with the items inside the repository and in a backlog repository
npm run check
```

The BDD scenarios (`features/*.feature`, run by `.agents/test/features.test.js` with the Node test runner) record every user workflow of a person, an agent and a team; a scenario that behaves differently depending on where the items live is a defect. GitHub Actions runs the suite on Linux with Node 24; the workflow is triggered manually.

## License

[Apache License 2.0](LICENSE), © [SmoothSDLC Systems Inc.](https://SmoothSDLC.com)
