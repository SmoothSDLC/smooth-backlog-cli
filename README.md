# smooth-backlog-cli

Keep a backlog of tasks, priorities, progress, and evidence alongside your code.
Each Git branch has its own work list, shared by people and coding agents through
version-controlled files in `.backlog/`.

Requires **Node.js 24+**, npm, and Git. Supports Linux and macOS. Windows is not supported or tested right now: CI does not run on Windows until Windows support for the shared backlog mode is done (backlog item 024).
The package is **`@smoothsdlc/smooth-backlog-cli`**; the command is **`backlog`**.

## Install

Configure GitHub Packages, authenticate, and install by package name:

```sh
npm config set @smoothsdlc:registry https://npm.pkg.github.com
npm login --scope=@smoothsdlc --auth-type=legacy --registry=https://npm.pkg.github.com
npm install --global @smoothsdlc/smooth-backlog-cli --registry=https://npm.pkg.github.com
backlog --version
```

GitHub Packages requires authentication even for public packages. When npm login
asks for a password, use a GitHub personal access token (classic) with
`read:packages`.

### Install a pinned release, and roll back

An installation that must not move on its own (an agent host, a team runner) pins the release it installs and rolls
back by installing the release before. In the shared backlog repository mode the CLI never updates itself (the
update notices and automatic installation are the local mode's).

```sh
npm install --global @smoothsdlc/smooth-backlog-cli@<version> --registry=https://npm.pkg.github.com
backlog --version                # the pinned release
# roll back: the same command with the previous release
npm install --global @smoothsdlc/smooth-backlog-cli@<previous version> --registry=https://npm.pkg.github.com
```

In a repository, `bash <skill folder>/scripts/install-backlog-cli.sh` (shipped with the backlog skill) installs the
CLI when it is missing or older than the registry's release and then runs `backlog setup`, which points the
repository at the shared backlog repository (`.smooth-backlog.json`) and deploys the skill; the shared backlog
repository's clone URL is a setting (the environment variable `BACKLOG_ORIGIN_URL` first, then the `backlog_origin_url`
key of `.smooth-backlog.json` — there is no built-in default, and a shared-mode command that needs it refuses,
naming both sources, when it is in neither; the origin check uses the configured value — a clone whose origin is a
different repository, or has no origin, is refused, and the error names the configured value, and a setup clone that
cannot be made (the repository cannot be cloned or reached) is refused the same way; a `backlog setup` write keeps
the key in the file); `--ask` asks for the path. The per-user record of `backlog --use-backlog-repo <path>` is the file `<name>/home` under the config
folder ($XDG_CONFIG_HOME, else `~/.config`, `<name>` the repository name from the setting); a record written
before the setting existed keeps working when the setting names the same repository, with no migration.

## Get started

Run these commands inside your Git working tree:

```sh
backlog init
backlog new "Fix login" --description "Expired cookies prevent sign-in" --ac "An expired cookie permits a fresh sign-in"
backlog 0 add tasks "Reproduce,Failing test captures the regression"
backlog list
backlog 0 done
backlog list done --json
```

Use `backlog new --ask` for interactive item creation. Run `backlog` with no
arguments to see the next active item.

## Working with your backlog

- **Priorities:** active items start at priority `0`. Numeric selectors refer to
  the item's current priority, which can change as work is reordered or completed.
  Each item also has a permanent GUID for durable references. List-entry positions
  inside tasks and other lists start at `1`.
- **States:** items are `new`, `open`, `done`, or `archived`. Completing an item
  removes its active priority; reopening completed work puts it at priority `0`.
  Done and archive lists show GUIDs and dates, with the newest events first.
- **Branches:** commands use the checked-out branch. Use `list --branch` to inspect
  another branch, `move` to transfer one item, or `import --branch` to merge its
  unarchived work into the current branch. New and moved items append by default.
- **Editing:** both `backlog set 0 name "Fix login"` and
  `backlog 0 set name "Fix login"` work. List `set` and `add` append entries;
  `replace` replaces a list, and `remove` deletes an entry. `--force` is available
  only for whole-list replacement with `set`.
- **Agents and Git:** initialization installs backlog skills into detected
  `.agents`, `.claude`, `.github`, and `.qwen` folders, plus `.backlog/skills`.
  Commit your backlog data and generated skills to share them. Preserve custom
  skill edits through Git because initialization and updates can replace them.
- **Run reporting:** the executable reports each run to an optional run recorder hook.

If the backlog already exists, `backlog init backup` preserves its data and
backs up existing files before replacing the generated skills. **`backlog init
clean` deletes the entire backlog, including every branch and contained backups.**

**Shared backlog repository:** `backlog --use-backlog-repo <path>` switches to a shared mode where the items of
every repository live in one Git backlog repository instead of each repository's `.backlog/` folder.
`backlog --use-local-repo` switches back. [COMMANDS.md](COMMANDS.md#shared-backlog-repository-mode)
describes the mode and its commands. Every shared change succeeds only after it is committed and pushed.
A failed publication rolls back the change and restores starting edits and staging. Existing unpublished commits
require an explicit publish or drop decision before another command can change the backlog.

In shared mode, a write to an item that somebody else changed after you last read it is refused with exit code 5 (read it again, then retry); every write records `updated_by`. See [COMMANDS.md](COMMANDS.md#shared-backlog-repository-mode).

An agent asks which items changed since its own last use with `backlog query --changed --agent <you>`: the reference
point is the commit of the agent's own last write or its own `query --changed` (stated in every result, even an
empty one), never a global timestamp, so a change made while the agent is idle still appears in the agent's next
report and the agent's own reads never move it. The items the agent holds (its name in `claimed_by`, `reviewer` or
`refiner`) are listed in a "held" section apart from the other changed items ("others"); a file moved inside the
folder (an archive, a renumbering) is one "D" entry for its old name. When the comparison fails (the reference commit
is no longer in the clone), the command reports the failure (exit 2) and keeps the agent's reference, so the change
is not lost. The report is printed before the reference is written, so a failed output consumes no change (the
same changes repeat in the next report); on a first use the report is empty and the write happens first, so the
result states exactly what was stored. A failed write of the reference is stated in the result and keeps the
previous reference: a failed first use prints "no earlier use: the reference could not be set" (with `--json`
the reference is null), and a failed write after an earlier use says so in the text and, with `--json`, adds
the line `{"reference_write": "failed"}` after the report (the exit is 0). The result names the agents that use
the backlog with their last-use time.

The self-review rule is per session, not per card: an agent name is a session name, so the session that claimed an
item or asked for its review (recorded in `session_authors`) may not review it, and a new session of the same card
may — it continues the item its earlier session claimed; a continuation of an item without the list (claimed before
it existed) keeps the earlier holder in it. A `--reassign` keeps the former holder in the list (and adds the new
holder), so the block survives a hand-off. Every claim, reassign, release and review request seeds the list from
the item's current holder and review requester, so an item written before the list existed keeps the block of its
earlier sessions.

Two review stages are enforced before any close, with or without review documents: first a Cody review (for an item of
a team, a registered member of that team — Qwen's team `config.json`, else a Cody name in a session of the item's
team; for an item without a team, a name starting with `cody` or a session name — in a fresh session, never the author session that claimed
the item), then an external review by `codex` or `claude` on the same commit. A pass pins the work commit at review
time — the working repository's `HEAD` — and a commit of new work after a pass moves the work commit, so both
stages run again; a changes verdict at either stage clears both. `--close` is refused until both stages passed for
the current work commit, and the refusal names the missing stage; a passing Cody review asks for the external
review, and a passing external review asks for the close. `--status done` is a close too: refused until both
stages passed, with or without review documents. A changes verdict is recorded at either stage even after the
work commit moved. A pass that counts for no stage asks for the Cody review first. A teamless split slice joins the
team of the member who starts its refinement (or, refined earlier, who claims it). Every split item starts in
stage refining, with or without a team field, and needs its refinement review (a `codex` or `claude` verdict)
before it may be claimed; a slice written before the stage field existed is named by its body's split marker and
takes the same gate. The owner closes without a review on a written decision — `--close --by owner --reason
"<the decision>"`, recorded as an owner decision — even for a team item still in its refinement stages.

## Command help

Run `backlog --help` for the available commands and options:

```text
backlog — branch-specific work for people and agents

Usage:
  backlog                              Next active item (priority 0)
  backlog init [repo-name]              Initialize once
  backlog init clean [repo-name]        Reset ALL backlog data/skills, including backups
  backlog init backup [repo-name]       Snapshot data/skills; replace skills only
  backlog list [new|open|done|archive] [--branch name]
  backlog list branch                  Branch names and item counts
  backlog new <name> [JSON] --description <text> --ac <text>
  backlog set <item> <property> <value>  Scalars replace; lists append
  backlog set <item> <list> <JSON-array> --force
  backlog add <item> <list> [entry] [--top]
  backlog replace <item> <list> <JSON-array>
  backlog remove <item> <list> <entry-number>
  backlog priority <item> [position]    Active priorities start at 0
  backlog priority <item> <list> <entry-number> <position>
  backlog <item> done                  Complete and close the priority gap
  backlog move <item> <destination-branch>
  backlog import --branch <source> [--higher]
  backlog archive <item|done>           Current branch only; no force option
  backlog update [check|auto|off|disable]

Item operations accept both orders: backlog set 0 name "Fix login"
and backlog 0 set name "Fix login". An item is its CURRENT active priority
or permanent GUID; done/archive rows show GUIDs. List-entry positions start at 1.
New/moved items append; reopening done work inserts at 0. States: new/open/done/archived.
Creation fields: --description, --ac, --state, --priority, --item-state-description,
--work_item_id, --tasks, --outcomes, --evidence, --references. Lists take JSON arrays.
Global options: --help, --version, --json, --ask. --ask requires a terminal.
Branch fallback: --branch or BACKLOG_CLI_BRANCH when Git cannot name a branch.
--force is valid ONLY for whole-list set replacement. Init clean affects every branch.
JSON emits {ok,data} or {ok,error}. Exit codes: 0 success, 2 invalid input, 1 failure.
```

See the [full command reference](COMMANDS.md) for field formats, examples,
branch transfers, JSON output, storage recovery, and update settings.

## Updates

Weekly update notices are enabled by default; automatic installation is disabled.
Settings apply to your user account:

```sh
backlog update check     # Check now and enable weekly notices
backlog update auto      # Enable daily automatic patch/minor updates
backlog update off       # Disable automatic installation
backlog update disable   # Disable weekly notices
backlog update           # Install the latest stable release, including a new major
```

Automatic updates require a writable npm global or user-prefix installation.
New major versions require an explicit `backlog update`. Failed automatic checks
leave backlog commands usable and become eligible to retry after one hour.
To stop all automatic update checks, run both `backlog update off` and
`backlog update disable`.

## License

[Apache License 2.0](LICENSE), by [SmoothSDLC Systems Inc](https://SmoothSDLC.com).
