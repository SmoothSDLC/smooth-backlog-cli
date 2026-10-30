# Backlog command reference

Backlog stores work in the Git working tree's `.backlog/` folder. Every item
belongs to a stored branch. Commands never switch, merge, stage, or commit Git
content. A Git working tree is required; a dirty tree is valid.

## Identity and priorities

Each record has a permanent GUID `id`. A numeric item selector means its CURRENT
active priority on the working branch, starting at 0. Completing priority 0
closes the gap; the next item becomes 0. Retain GUIDs in scripts, saved links,
and agent plans. Done and archived records have no priority: use their GUIDs.

The separate entry numbers inside tasks/outcomes/evidence/references start at 1.
`new` and `open` are active states; other states are `done` and `archived`.
New and moved items append by default. Reopening done work inserts at priority 0.

## Initialization

```sh
backlog init
backlog init "Display name"
backlog init backup
backlog init clean
```

Plain init fails if `.backlog/` exists. `init backup` snapshots existing backlog
content and installed backlog skills into `.backlog/backup-yyyyMMddHHmm/`, retaining
live data/config and existing backups, then replaces backlog skills. Existing
backups are excluded from the new snapshot; minute collisions get numeric suffixes.
It requires valid existing backlog data, or initializes normally if none exists.

`init clean` removes and recreates the ENTIRE `.backlog/` folder, including every
branch's data and all contained backups, and replaces installed backlog skills.
This operation has no branch scope. `init --force` is invalid. Init actions remind
you to commit; the CLI does not commit anything. Preserve custom skill edits in
Git because init and package updates replace generated backlog skill copies.

## Reading work

```sh
backlog                         # next active item, or an empty result
backlog list                    # current branch, new/open only
backlog list new
backlog list open
backlog list done               # newest completion first, with GUIDs and dates
backlog list archive            # newest archive first, with GUIDs and dates
backlog list archived           # alias for archive
backlog list --branch feature
backlog list branch             # stored branch names and state counts
backlog branch                  # alias for list branch
```

Done uses `item_completed_at`; archive uses `item_archived_at`. Archiving retains
an existing completion date. Directly archiving active work leaves completion
null. Reopening clears completion until the item is completed again. Timestamp
ties use GUID order. Data arrays are stored newest-created first.

## Creating and editing

```sh
backlog new "Fix login" --description "Expired cookies prevent sign-in" --ac "An expired cookie permits a fresh sign-in"
backlog new "Fix login" '{"description":"Expired cookies prevent sign-in","ac":"Fresh sign-in works","tasks":[{"name":"Reproduce","goal":"A failing test captures the cookie bug"}]}'
backlog new --ask
backlog set 0 name "Fix stale login cookie"
backlog 0 set state open
backlog 0 done
backlog set <guid> state open
```

Both command-first and item-first forms work for set/add/replace/remove/priority/
done/move/archive. GUID placeholders above must be replaced with actual GUIDs.
`backlog set <guid> state done` and `backlog <guid> done` are equivalent.

Creation requires name, description, and `ac` (acceptance criteria). Other text
defaults to `_`; lists default to `[]`; state defaults to `new`; active priority
defaults to the bottom. Named flags include `--state`, `--priority`,
`--item-state-description`, `--work_item_id`, `--tasks`, `--outcomes`, `--evidence`,
and `--references`. List flags take JSON arrays. Creation uses JSON or named
flags, without positional CSV fields. JSON cannot assign GUID, branch, or dates.
Creation cannot directly create an archived item. Done creation accepts null
priority in JSON; active priority must be a nonnegative integer.

`--ask` prompts for omitted free text, list entries, state and priority. Explicit
inputs win. Enter accepts the displayed default; `_` is an intentional placeholder
for missing planning text in interactive mode. Each list offers add/finish.
Generated GUID, branch, and dates are never prompted. A terminal is required,
and cancellation writes nothing. `--ask --json` sends prompts to stderr.

## Lists and ordering

```sh
backlog add 0 tasks "Reproduce,Failing test captures the bug"
backlog 0 set tasks '{"name":"Fix","goal":"Regression passes"}'
backlog add 0 evidence "npm test passes" --top
backlog set 0 outcomes '["A","B"]'       # append both entries
backlog replace 0 outcomes '["Only"]'     # replace the whole list
backlog set 0 outcomes '["Only"]' --force # explicit replacement alias
backlog remove 0 tasks 1                  # remove the first task
backlog priority 2 0                     # move current priority 2 to priority 0
backlog 0 priority tasks 2 1              # second task becomes first
backlog set 2 priority                   # compatibility alias: priority 0
```

`set` replaces scalar fields but appends to list fields. `add` appends by default;
`--top` prepends. Tasks accept JSON objects/arrays or one quoted CSV `name,goal`
record, with CSV quotes for embedded commas. Missing task components become `_`.
String entries retain commas literally. Whole-list replacement requires JSON.
`remove` deletes one existing one-based entry, not the backlog item itself.

**`--force` is supported only for whole-list `set` replacement.** Archive, init,
move, priority, and all other commands reject it. It never overrides branch scope.
`set` cannot change GUID, branch, or generated dates. Only archive sets archived
state. Archived records are read-only; no unarchive or item-delete command exists.

## Branch transfers and archiving

```sh
backlog move 0 feature
backlog import --branch feature
backlog branch import feature --higher
backlog archive 0
backlog archive <guid>
backlog archive done
```

Ordinary writes require the item's assigned branch to be the current branch,
even with GUID selection. Switch branches to work on another backlog. `move`
transfers exactly one current-branch item to a destination branch. Active work
appends there; done work remains done. `import` transfers all unarchived source
items into the current branch, preserving identities, states and relative order.
Target active items precede source items unless `--higher` reverses the groups.
It merges backlog queues, not Git branches. Archives remain on their stored branch.

`archive done` only archives current-branch completed items. Explicit archive
can archive active or done work. An already archived GUID is a no-op; unknown IDs
fail. There is no archive force option or cross-branch bulk archive.

If Git cannot identify a named branch (including detached HEAD), supply
`--branch <name>` or set `BACKLOG_CLI_BRANCH` in the calling shell. A detected
named Git branch governs ordinary writes. List/import can select another source
branch; move names its destination positionally. In detached HEAD, import uses
BACKLOG_CLI_BRANCH for its destination and --branch for its source. The CLI sets BACKLOG_CLI_BRANCH
and BACKLOG_CLI_REPONAME for its own process and children; it cannot modify the
parent shell. Local default-branch detection may be unknown without blocking use.

## Updates

```sh
backlog update check     # immediate check and enable weekly notices
backlog update auto      # enable automatic compatible patch/minor updates
backlog update off       # disable automatic installs, preserve notice preference
backlog update disable   # disable weekly notices, preserve auto preference
backlog update          # manually install latest stable, including a newer major
```

Weekly notices are enabled by default; automatic installation is disabled.
Checks run during successful CLI execution, not in a background service or skill
hook. Auto checks are at most once per 24 hours; notification-only checks weekly.
Failed checks retry after one hour. Last-check time/status and known installed/
available versions are written only when a check occurs; skipped checks do not
rewrite history. Commands changing preferences write those preferences.

Automatic checks warn on stderr and let backlog work continue when offline or
unauthenticated. Major releases produce a notice and require explicit update.
Prereleases and downgrades are never implicit. Help/version never check updates.

Preferences/history are user-scoped at `smooth-backlog-cli/config.json` beneath:
Linux `$XDG_CONFIG_HOME` or `~/.config`; macOS `$XDG_CONFIG_HOME` or
`~/Library/Application Support`; Windows `%APPDATA%`. Do not commit this file.

Writable npm global/user-prefix installations support staged replacement, an
executable smoke check, and rollback on failed activation. The npm executable
remains in place: complete runtimes are retained under the package installation
and selected through an atomic pointer, so interruption leaves a callable old or
new runtime. Previously installed runtimes are retained for running processes;
a normal npm reinstall replaces the managed installation. Enabling auto checks
installation ownership and write access (including a custom npm --prefix); it refuses installations needing
elevation. It never requests elevation. Repository-local dependency installs and
linked/source checkouts receive exact npm instructions instead so their lockfiles
and source remain under their normal tooling. Notification checks do not need to
inspect installation scope. Updates refresh installed backlog skills in the
current repository; other repositories refresh on their next successful CLI use.

GitHub Packages needs the scoped registry configured:

```sh
npm config set @smoothsdlc:registry https://npm.pkg.github.com
npm login --scope=@smoothsdlc --auth-type=legacy --registry=https://npm.pkg.github.com
```

Use an account/token with package-read access. Public GitHub source does not
imply anonymous package access. The CLI never writes registry settings or tokens.

## Storage and output

The CLI owns the backlog's storage: read and change items only through its commands, never
its files. Every item has GUID, priority, name, branch, state, item-state-description,
description, ac, tasks, outcomes, evidence, references, work_item_id, item_created_at,
item_updated_at, item_completed_at, and item_archived_at. Tasks contain name/goal strings.
The CLI serializes local processes with a lock and recovers interrupted multi-file writes.
Corrupt JSON, duplicate GUIDs, merge conflicts, unsupported schemas, invalid
priorities and symlinked destinations fail explicitly instead of resetting data.
Resolve cross-clone merge conflicts manually; local locking is not distributed
conflict resolution. If an owner process crashed and left its lock, the CLI
identifies that process and gives the lock path. Verify no backlog process is
using the storage, remove that abandoned lock, and rerun to replay the journal.
The CLI never unlinks a lock based on a possibly stale owner observation. Do not commit transient locks/journals during a running
transaction. Normal completed commands remove them.

Human list output uses tables with separate continuation rows for list entries.
`--json` writes exactly one stdout envelope: `{"ok":true,"data":...}` or
`{"ok":false,"error":{"code":"...","message":"..."}}`. Diagnostics, update
notices and prompts use stderr. Exit codes: 0 success/no-op, 2 invalid usage/input,
1 operational failure. Global --json/--ask/--help may appear before or after a command.
