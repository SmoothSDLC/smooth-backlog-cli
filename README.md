# smooth-backlog-cli

Keep a backlog of tasks, priorities, progress, and evidence alongside your code.
Each Git branch has its own work list, shared by people and coding agents through
version-controlled files in `.backlog/`.

Requires **Node.js 24+**, npm, and Git. Supports Linux, macOS, and Windows.
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

If the backlog already exists, `backlog init backup` preserves its data and
backs up existing files before replacing the generated skills. **`backlog init
clean` deletes the entire backlog, including every branch and contained backups.**

**Shared backlog repository:** `backlog --use-backlog-repo <path>` switches to a shared mode where the items of
every repository live in one Git backlog repository instead of each repository's `.backlog/` folder; the commands
there match the Python backlog skill. `backlog --use-local-repo` switches back. [COMMANDS.md](COMMANDS.md#shared-backlog-repository-mode)
describes the mode and its commands.

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
