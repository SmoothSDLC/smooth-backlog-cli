# Changelog

## Unreleased (2.0.0)

One backlog, one CLI. Compared with 1.0.1:

- **A number that two items hold is refused.** A command given a number that two items of the folder hold (a live and an archived item included; only a merge made outside the CLI can leave that) stops with exit 2 and changes nothing: `❌ backlog: number <n> names two items, <slug a> and <slug b>; name the item by its slug`. By its slug either item can be shown, and one of the pair is given a new number with `backlog update <slug> --seq <n>`; other writes to the pair are refused until then (publication stops with exit 3: the number must stay unique). Commands on other items are not affected, a number an item stores in `depends_on` that two items hold counts as an undone dependency, and the CLI never renumbers such a pair. A live item no longer wins over an archived one of the same number.
- **An item number is never handed out twice.** A new item (`backlog new`, `backlog team new`, and the renumbering of `backlog move --to-repository`) takes one above the highest number its repository folder ever held: the highest item file name ever added or renamed in the history the clone holds (every ref, merge commits included), the highest `last` ever committed to the folder's new `numbers.json` (`{"last": <n>}`, beside `index.json`, written with every handed-out number and committed with the item), and the item files and `numbers.json` present. Deleting the newest item, `backlog clean`, archiving, a reverted creation and a lowered or deleted `numbers.json` no longer give a number again; only the repository's own folder is read. `backlog update <item> --seq <n>` is refused unless `n` is above that number (`--seq <n> is not above the highest number ever used in <owner>/<name> (<mark>); numbers are never reused`). A shallow clone refuses to hand out a number: exit 2, `the backlog clone is shallow, so numbers cannot be proven unused: run git fetch --unshallow`. An item file named with a number above one billion is an unreadable item: every command of the folder stops with exit 2 until it is renamed or removed. A rebase conflict on `numbers.json` after two clones create at once (both changed it, both added it, or one deleted it and the other changed it) keeps the larger value. `backlog update <item> --seq <n>` with `n` above one billion is refused (`--seq <n> is above the highest number the CLI can use (1000000000)`), and a stored `seq` above that bound never raises the mark; once a folder holds exactly 1000000000, `backlog new` stops with exit 2 (`the folder has no number left`). A history that cannot be read stops with exit 2, like the other refusals of the number scan. The mark is also taken before the command's own `git pull --rebase`, so a number held only by an unpushed merge commit is not given out again.
- **A number published and deleted by another clone is not taken again, and a command commits only what it wrote.** After the rebase, an item the command is publishing whose number is not above the highest number the upstream branch ever held is renumbered above it (file name, `seq`, slug, heading and the references of the local items follow), even when no file upstream holds that number any more. A command that writes items stages and commits every changed item file of its repository folder (not only the ones it wrote), `index.json` and `numbers.json`: a team file, a template or any other file lying in the folder, or an edit of `.backlog/config.json`, is no longer carried along by the next `backlog new` or `backlog update`, and a file you staged yourself stays staged as it was. One exception, the first use of a backlog inside the repository: the untracked `.backlog/config.json` and `.backlog/.gitignore` are committed with the first item only when their content is exactly what the CLI wrote itself (`{"backlog_repository": ".backlog"}` and `.state/`); a hand-written file of either name is never committed. An item that only moves (`backlog archive`, `backlog move`, `backlog update --seq`) no longer needs the upstream mark, so it still publishes from a shallow clone.
- **A configuration file that cannot be read stops every command that reads it.** A `.backlog/config.json` that exists but is not a JSON object (a trailing comma, a half-written edit, an array) stops every command that reads the repository's configuration, `setup` included, with exit 2 and `❌ backlog: .backlog/config.json cannot be read (<reason>); fix it: no command runs and nothing is written while it cannot be read`; nothing writes over the file. A missing file is an empty configuration. `backlog upgrade`, `--help` and `--version` do not read it and still work. A `.backlog/config.json` that cannot be read is no longer treated as empty, and the root file `.smooth-backlog.json` of earlier builds no longer stands in for it. When `backlog setup` rewrites the file it keeps every other key with its value.
- **Breaking: every environment variable the CLI owns carries the prefix `SMOOTH_BACKLOG_CLI_`, and the old names are not read.**
  There is no alias, no fallback and no deprecation period: a session that still sets an old name is simply not seen. The
  fourteen renames: `TEAM_NAME`, `TEAM_REPOSITORY`, `TEAM_BRANCH`, `TEAM_LEAD` become `SMOOTH_BACKLOG_CLI_TEAM_NAME`,
  `SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY`, `SMOOTH_BACKLOG_CLI_TEAM_BRANCH`, `SMOOTH_BACKLOG_CLI_TEAM_LEAD`; `BACKLOG_AGENT`,
  `BACKLOG_SESSION`, `BACKLOG_HOME`, `BACKLOG_ORIGIN_URL`, `BACKLOG_LOCK_WAIT_MS`, `BACKLOG_PRIVATE_DENYLIST`, `BACKLOG_RUN_HOOK`,
  `BACKLOG_RUN_LOCK_HELD`, `BACKLOG_REVIEW_STALE_SECONDS`, `BACKLOG_TEST_SELF` become `SMOOTH_BACKLOG_CLI_AGENT`,
  `SMOOTH_BACKLOG_CLI_SESSION`, `SMOOTH_BACKLOG_CLI_HOME`, `SMOOTH_BACKLOG_CLI_ORIGIN_URL`, `SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS`,
  `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST`, `SMOOTH_BACKLOG_CLI_RUN_HOOK`, `SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD`,
  `SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS`, `SMOOTH_BACKLOG_CLI_TEST_SELF`. Standard system variables keep their names.
- **Items are markdown files with front matter**, one per item, numbered and slugged (`001-fix-the-login-redirect`),
  with a history of events; the JSON manifest of 1.x is not read. A repository with a 1.x `.backlog/backlog_manifest.json`
  starts a new backlog; recreate the items you still need with `backlog new`.
- **No command name of 1.x is kept as an alias, and nothing is kept for backwards compatibility.** One command does one
  thing; a wider scope is a word of the command (`list all-branches`, `next all-branches`, `clean all-branches`). The 1.x
  behaviours that were worth keeping are commands of their own with their own help: `done <item>`, `clean`,
  `import --branch <source> [--higher]`, `archive done`, `list new|open|done|archive|branches`, and the CLI's own update,
  `backlog upgrade [check|auto|off|disable|<version>]`. `backlog update` is the item command only: called with nothing it
  prints its own help (exit 2) and installs nothing. The list fields of 1.x (`ac`, `tasks`, `outcomes`, `evidence`,
  `references`) are sections of the item body: `backlog update <item> --section "<Heading>"` with `--set-lines`,
  `--add-line` (`--top`), `--remove-line <n>` or `--move-line <n>:<position>` edits one section and leaves every other
  byte alone. `init`, `init clean`, `branch`, `set`, `priority`, `add`, `replace`, `remove`, the item-first word order
  (`3 done`), `move <item> <branch>`, `new <name> --description --state`, `new --ac --tasks ...`, `--headless` and
  `BACKLOG_HEADLESS` are gone: each answers "not a backlog command" or names the unknown option, and writes nothing.
  `init backup` is gone.
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
  `--status` on a team item is refused by `backlog update` (it names `backlog team update`) and by `backlog team update` (it names the steps that move the status). Outside a team the status is free text
  (`closed`, `done` and `archived` finish an item). Which review stages apply comes from the team's entry in
  `teams.json`; a team step for a team without an entry is refused. A review verdict is `complete` or `reject`
  (`pass` and `changes` stay accepted); a reject keeps the finding in the item's review history. Items written by
  earlier builds are read as the new words and drop `stage` and `review_state` when next written.
- **Two kinds of commands.** The user commands know nothing of teams. Everything that knows a team is under `backlog team`:
  `pop` (the one next-action command by the agent's role in the team's entry; it marks the claim, the start of a refinement
  or of a review in one locked write and prints the whole item, and replaces `backlog pop` and `backlog work`),
  `new` (files an item of a team), `update <item> --team <t> --agent <a> <step>` (the team steps; `backlog update`
  refuses every change of an item that belongs to a team and names `backlog team update`), `query` (the claimable,
  reviewable, blocked, decisions, plan and wip views, and the read options of the reader), `define` and `workflow`. `--team` and `--agent` come from the flags, then
  `SMOOTH_BACKLOG_CLI_TEAM_NAME` and `SMOOTH_BACKLOG_CLI_AGENT`, then the `team` and `user` of `.backlog/config.json`. `backlog next` prints the open item
  with the best priority whole (front matter and body) and skips nothing for team reasons.
- **The user commands refuse an item with a team when they would change its team state.** `done` (through `update`), `update --replan`
  naming a team item, `archive` of a team item that is not closed (`--force` does not change that), `import --higher` when the source has
  a team item (refused before anything is moved) and `clean` when a team item lies in its scope, archived ones included (refused before
  the question): one line on standard output, exit 1, nothing written; the line names `backlog team update` or says that no command
  deletes a team item. `move`, `archive` of a closed team item and `archive done` only file or store an item and keep working.
- **`backlog new --ask` and `backlog team new --ask` ask for the fields you did not give.** On a terminal (standard input and standard
  error) the command asks for the title, the objective, the summary and the body (a team item also for its review documents), one
  question after the other on standard error; an empty answer leaves a field out, lines typed ahead are kept for their question, and
  the result on standard output is the one of the same call without `--ask`. Without a terminal the command is refused (exit 2, one line)
  and creates nothing. Every other command rejects `--ask` as an unrecognized argument, except `backlog setup --ask`.
- **The update notice runs after the commands of a person at a terminal.** The weekly check of `backlog upgrade` (on by default;
  daily with `backlog upgrade auto`; an hour after a failed check; `backlog upgrade disable` and `off` turn it off) was implemented
  and not called by any command; now every command except `--help`, `--version`, `upgrade` and `setup` starts it beside the command when
  standard error is a terminal, waits for it at most 1.5 seconds after the command, and prints its warning on standard error. It never
  changes the output or the exit code, a check that fails or runs out of time is a warning at most, and nothing runs for agents and
  scripts (standard error is not a terminal). Documented in `backlog --help`, `backlog upgrade --help`, COMMANDS.md, the skill and the README.
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
- **The history of an item is part of the item** (`backlog history [<item>]`); a replan records no event of its own.
- **Where the items live is configuration, not a mode.** The backlog is always a git repository and every change to it
  is committed and pushed before the command exits. The repository's `.backlog` folder holds the configuration
  (`.backlog/config.json`, written by `backlog setup` or on first use; the root file `.smooth-backlog.json` of earlier
  builds is still read) and, by default, the items (committed on the current branch, the backlog's paths only, pushed
  to origin); the configuration can name a clone of a backlog repository shared by many repositories and people
  instead (`SMOOTH_BACKLOG_CLI_ORIGIN_URL` names it). Environment variables override the configuration. Every command, option,
  output and help text is the same in both places. The 1.x mode switches are gone. `setup` reports what it did without
  naming any folder path.
- **The command set:** `setup`, `new`, `update`, `done`, `move`, `archive` (`archive done`), `import`, `clean`, `list`,
  `show`, `next`, `history`, `changes`, `fields`, `upgrade`, and under `backlog team` `pop`, `new`, `update`, `query`,
  `define` and `workflow`. `backlog update` changes an item that has no team (fields, body, status, priority, claim,
  release, close); `--replan` sets the order of the queue. The read command `query` of the earlier builds is gone from the
  user commands: `list` (the full stack of this branch, or `new|open|done|archive|branches|critical|all-branches`), `show
  <item>[,<item>...]` (with `--agent`), `next` (`next all-branches`), `history [<item>]` and `changes [--agent]` each
  do one thing; `--branch`, `--by-branch` and `--all` of the user's read commands are gone with it, and the read options of
  the reader (`--phase`, `--status`, `--events`, `--branch`, ...) are options of `backlog team query` only. `--json` prints the data itself, not an `{"ok","data"}` envelope.
- **Many writers.** Every write records who made it (`SMOOTH_BACKLOG_CLI_AGENT`, `--by`, `--claim`, `--agent`) and when. A
  write to an item that someone else changed since this agent last read it is refused (exit 5) until the agent reads
  it again. A named agent claims an item; a review is requested and recorded on the item.
- **Teams are configuration.** Teams, their leads and members and their review rules (how many reviewers from which
  teams) live in `teams.json` in the backlog folder; work-in-progress limits in `wip-limits.json`. The team rules -
  refinement before work, the review rules before the close, the limits - bind the items of a team only; an item
  without a team is not bound by them, and nothing about a team or an agent is built into the CLI.
- **For agents:** `backlog setup` deploys the built-in backlog skill into every agent folder present; `SMOOTH_BACKLOG_CLI_RUN_HOOK`
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
