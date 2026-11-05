# Changelog

## Unreleased (2.0.0)

One backlog, one CLI. Compared with 1.0.1:

- **Items are markdown files with front matter**, one per item, numbered and slugged (`001-fix-the-login-redirect`),
  with a history of events; the JSON manifest of 1.x is not read. A repository with a 1.x `.backlog/backlog_manifest.json`
  starts a new backlog; recreate the items you still need with `backlog new`.
- **The CLI keeps a private cache of the items per clone;** no database is stored in the backlog (older backlogs may still
  hold one; it is ignored). The cache is rebuilt from the item files at the start of every command, and a file deleted outside the CLI is simply an absent item.
- **The same data integrity in both storage locations.** Every command first updates the repository that holds the items from its origin (a read whose origin is unreachable answers with a warning, a write is refused), every change is pushed before the command exits, a rejected push is retried, and a write on a stale view is rejected and shows the item as it is now. Inside the repository the branch is pushed as it is, the user's own commits included; `"push-backlog-updates": false` in `.backlog/config.json` turns the push off.
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
  the team steps); `--replan` sets the order of the queue. Removed: `init` (now `setup`), `set`, `add`, `priority`,
  `import`, `init backup|clean`, the self-update commands (`update auto|check|disable|off`), `--ask`, `--description`,
  `--ac`; `--json` prints the data itself, not an `{"ok","data"}` envelope.
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
