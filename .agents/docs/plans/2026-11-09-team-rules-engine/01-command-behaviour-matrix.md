# Which command triggers which behaviour

Context: the CLI has two groups of commands. User commands are typed by a person (or an agent acting as one). Team commands are run by
the agents of a team and live under `backlog team`. Only team commands read the team file and only team commands enforce rules. This
page fixes, command by command, what each group reads, which identity it uses, what it enforces and what it writes. "Today" is read
from the help text and the code of the branch. "Target" is the owner's rulings (00-owner-rulings.md). "To confirm" marks a point on
which the rulings do not yet decide.

## Group 1: user commands (no team, no rules)
Commands: `backlog new`, `backlog update`, `backlog update --replan`, `backlog done`, `backlog list`, `backlog show`, `backlog history`,
`backlog changes`, `backlog next`, `backlog move`, `backlog archive`, `backlog import`, `backlog clean`, `backlog fields`,
`backlog setup`, `backlog upgrade`.

| Aspect | Today | Target |
|---|---|---|
| Reads the team file | Yes for items that carry a team: archive, clean, list and show, sequence, status and update import team code | Never |
| Who is calling | The agent named by BACKLOG_AGENT, else the configuration's user (git user name, else the login name) | Same: this is the only place the user identity is read |
| Enforces flow, status words or roles | Refuses every change of an item that has a team; knows the default status words | Nothing. Free-for-all: a status is stored as typed |
| Writes | Items, the index, the configuration (`setup`) | Items (JSON), the index, the configuration (`setup`) |
| Concurrency | A write to an item that someone else changed since this caller last read it is refused (exit 5) | Unchanged |

To confirm: today a user command refuses to change an item that has a team. The rulings say user commands enforce nothing and the
CLI ignores the team file outside `backlog team`. Reading the item's own team field is not reading the team file, but refusing
because of it is still a behaviour in the CLI. Target proposed here: no refusal.

## Group 2: team commands (read the team file, enforce the rule set)
Commands: `backlog team new`, `backlog team update`, `backlog team query`, `backlog team pop`, and the read-only `backlog team validate`.
Removed (they write the team file, which the CLI never does): `backlog team define`, `backlog team workflow --file`.

| Aspect | Today | Target |
|---|---|---|
| Reads the team file | Entry in `teams.json` plus a flow definition from `workflows.json` or the shipped one | Entry, rule set and item definition, all in `teams.json` |
| Who is calling | `--agent`, else BACKLOG_AGENT, else the configuration's user | `--agent`, else BACKLOG_AGENT. Never the configuration's user |
| Which team | `--team`, else TEAM_NAME, else the configuration's team | `--team`, else TEAM_NAME (the configuration's team key: to confirm) |
| Session scope | TEAM_REPOSITORY and TEAM_BRANCH, with flags to be added | Inputs of the rules; flag, then variable |
| Enforces | The shipped flow in code, plus the registered flow only for its vocabulary | The team's rule set, nothing else |
| Writes | Items; registry files | Items only |

To confirm: whether the configuration's `team` key stays as a default for `--team`.

## Commands that behave the same for both groups
`backlog --help`, `backlog --version`, `backlog <command> --help`: read nothing, write nothing.
