# Changelog

## Unreleased (2.0.0)

One backlog, one CLI. Compared with 1.0.1:

- **Items are markdown files with front matter**, one per item, numbered and slugged (`001-fix-the-login-redirect`),
  with a history of events; the JSON manifest of 1.x is not read. A repository with a 1.x `.backlog/backlog_manifest.json`
  starts a new backlog; recreate the items you still need with `backlog new`.
- **Every command name of 1.x still works**, as an alias of the one command set (`backlog --help` and COMMANDS.md list them
  all). The list fields of 1.x (`ac`, `tasks`, `outcomes`, `evidence`, `references`) are sections of the item body:
  `backlog update <item> --section "<Heading>"` with `--set-lines`, `--add-line` (`--top`), `--remove-line <n>` or
  `--move-line <n>:<position>` edits one section and leaves every other byte alone, and `add`, `replace`, `remove` and
  `priority <item> <list> <n> <position>` run it. `import --branch <source> [--higher]` brings the open items of another
  branch here, `archive done` archives every finished item, and the CLI's own update is `backlog upgrade`
  (`backlog update`, `update check|auto|off|disable` and `update <version>` run it; `update <item> …` stays the item
  command). `init backup` is gone.
- **The order of the queue is a committed index.** Each repository folder holds one text file, `index.json`, that lists
  the items of every branch in order (P0 first), one entry per line. A change of the order changes that file and no
  item; two clones that changed it from one base are merged (each keeps its placement); the items no longer carry a
  priority (the priority of an item written by an earlier build is ignored and dropped when the item is next written).
  The items and the index are the data: no copy of them is kept per clone and no database is used (older backlogs may still
  hold a `backlog.db`; it is ignored), and a file deleted outside the CLI is simply an absent item.
- **An item that cannot be read is named.** When an item file cannot be read after the latest update, every command of
  that backlog exits 2 and names the item and the field; `backlog update <item> --<field> <value>` sets the field again
  and `backlog update <item> --restore` brings back the item's previous version.
- **The same data integrity in both storage locations.** Every command first updates the repository that holds the items from its origin (a read whose origin is unreachable answers with a warning, a write is refused), every change is pushed before the command exits, a rejected push is retried, and a write on a stale view is rejected and shows the item as it is now. Inside the repository the branch is pushed as it is, the user's own commits included; `"push-backlog-updates": false` in `.backlog/config.json` turns the push off.
- **One status word per item.** A team's items follow one ordered list (`new` ... `review complete`, `closed`, `archived`,
  and `awaiting decision` for an owner question) defined by a file the CLI ships; the team steps move the item along it and
  `update --status` on a team item is refused (`use backlog team update`). Outside a team the status is free text
  (`closed`, `done` and `archived` finish an item). Which review stages apply comes from the team's entry in
  `teams.json`; a team step for a team without an entry is refused. A review verdict is `complete` or `reject`
  (`pass` and `changes` stay accepted); a reject keeps the finding in the item's review history. Items written by
  earlier builds are read as the new words and drop `stage` and `review_state` when next written.
- **Two kinds of commands.** The plain commands know nothing of teams. Everything that knows a team is under `backlog team`:
  `pop` (the one next-action command by the agent's role in the team's entry; it marks the claim, the start of a refinement
  or of a review in one locked write and prints the whole item, and replaces `backlog pop` and `backlog work`),
  `update <item> --team <t> --agent <a> <step>` (the team steps; on `backlog update` the earlier spelling still works and
  prints `moved: use backlog team update ...`), `query` (the claimable, reviewable, blocked, decisions, plan and wip
  views; the plain `query` points at it), `define` and `workflow`. `--team` and `--agent` come from the flags, then
  `TEAM_NAME` and `BACKLOG_AGENT`, then the `team` and `user` of `.backlog/config.json`. `backlog next` prints the open item
  with the best priority whole (front matter and body) and skips nothing for team reasons.
- **The configuration has a user and a team.** `backlog setup` writes `user` (the git `user.name`, else the login name) and
  an empty `team`; an item outside a team records its `owner`, and the writer with no agent named is the user.
- **The item keys carry the owner's words.** An item file stores `title`, `last_updated`, `last_updated_by`, `owner` and `owned_since`
  (the owner is the agent working on the item, else the user it belongs to; `owned_since` is set while an agent holds it). A file
  with the earlier keys (`name`, `updated`, `updated_by`, `claimed_by`, `claimed_at`) is read as before and rewritten with the
  new keys at its next write. `backlog fields` lists them.
- **The team entry is the roster.** A team definition takes an optional `review_only` list (members who review and never claim);
  `--roster` and `TEAM_ROSTER` are gone. The engine's instructions name `backlog team update <item> --team <team> --agent <name>`.
- **Teams and flows are defined from JSON.** `backlog team define --file <team.json>` checks the definition (lead, members,
  reviewers, stages of the flow) and adds the entry to `teams.json` beside the others, committed and pushed;
  `backlog team workflow --file <flow.json>` registers a flow in `workflows.json`. A team with open items is not replaced.
- **The item template is visible.** `backlog fields` prints every field, the name it is shown under, what it means, who sets it
  and when it is required; `backlog new --help` carries the table, `new` takes `--title` and `--description` for `--name`
  and `--body`, and `--summary` may repeat.
- **The history of an item is part of the item** (`backlog query --events`); a replan records no event of its own.
- **Where the items live is configuration, not a mode.** The backlog is always a git repository and every change to it
  is committed and pushed before the command exits. The repository's `.backlog` folder holds the configuration
  (`.backlog/config.json`, written by `backlog setup` or on first use; the root file `.smooth-backlog.json` of earlier
  builds is still read) and, by default, the items (committed on the current branch, the backlog's paths only, pushed
  to origin); the configuration can name a clone of a backlog repository shared by many repositories and people
  instead (`BACKLOG_ORIGIN_URL` names it). Environment variables override the configuration. Every command, option,
  output and help text is the same in both places. The 1.x mode switches are gone. `setup` reports what it did without
  naming any folder path.
- **The command set:** `new`, `update`, `query` (`list` is the same), `next`, `pop`, `work`, `team pop`, `move`,
  `archive`, `setup`. `backlog update` changes an item (fields, body, status, priority, claim, release, review, close,
  the team steps); `--replan` sets the order of the queue. Every first-release command name still works as an alias (see Aliases in COMMANDS.md); `--json` prints the data itself, not an `{"ok","data"}` envelope.
- **Many writers.** Every write records who made it (`BACKLOG_AGENT`, `--by`, `--claim`, `--agent`) and when. A
  write to an item that someone else changed since this agent last read it is refused (exit 5) until the agent reads
  it again. A named agent claims an item; a review is requested and recorded on the item.
- **Teams are configuration.** Teams, their leads and members and their review rules (how many reviewers from which
  teams) live in `teams.json` in the backlog folder; work-in-progress limits in `wip-limits.json`. The team rules -
  refinement before work, the review rules before the close, the limits - bind the items of a team only; an item
  without a team is not bound by them, and nothing about a team or an agent is built into the CLI.
- **For agents:** `backlog setup` deploys the built-in backlog skill into every agent folder present; `BACKLOG_RUN_HOOK`
  names an executable that records each run.

## 1.0.1

- Correct GitHub Packages login instructions for npm 9 and later by using
  `--auth-type=legacy`.

## 1.0.0

- Create and manage branch-specific backlog items with permanent GUIDs and
  sortable active priorities.
- Track tasks, acceptance criteria, outcomes, references, and evidence through
  new, open, done, and archived states.
- Move individual items between branches or import another branch's work.
- Use interactive creation or JSON output for scripts and coding agents.
- Install repository-local integrations for Codex, Claude Code, GitHub Copilot,
  and Qwen Code.
- Check for releases and optionally install compatible automatic updates.

See [the latest release](https://github.com/SmoothSDLC/smooth-backlog-cli/releases/latest)
for release notes. [README.md](README.md) covers installation and
[COMMANDS.md](COMMANDS.md) describes the CLI.
