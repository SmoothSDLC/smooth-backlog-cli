# Backlog CLI product specification

Status: implementation specification incorporating the user's initial answers and
follow-up choices 1b and 2a, completion/archive ordering, and force restrictions.

## Purpose and precedence

Provide a local, Git-aware npm CLI for people and coding agents to maintain
branch-specific backlog items in version-controlled repository files. The
executable is `backlog`. The producer is SmoothSDLC Systems Inc,
https://SmoothSDLC.com, and the license is Apache-2.0.

This specification consolidates the initial requirements and the user's
subsequent answers, which take precedence over provisional clarification text.
Explicit decisions below are distinguished from implementation interpretations and open
questions. This specification replaces the earlier proposal once those remaining
questions have been answered; subsequent user corrections remain authoritative.

No tracker synchronization, dashboard, automatic task execution, Git staging,
committing, checkout, merge, pull, push, or branch creation is part of the CLI.

## Agreed decisions

| Original decision | User direction |
| --- | --- |
| 1 | Default lists show active work only. |
| 2 | Accept command-first and item-first forms as equivalent aliases. |
| 3 | Both set and add append to lists. Include replace and remove operations. |
| 4 | Provide a priority command. List additions default to the bottom; set with force is exceptional. |
| 5 | Human-facing list-entry indexes start at 1. |
| 6–7 | Writes ordinarily concern the current branch. List and import may inspect another branch. Force does not authorize cross-branch writes or archiving. |
| 8 | Done and archived items have no priority. Add an item-first done alias. |
| 9 | Reopening restores priority 0 and shifts active items down. Later bottom-by-default direction governs other insertions. |
| 10 | Creation accepts JSON or named flags, without positional CSV creation fields. |
| 11 | Require name, description, and acceptance criteria; use typed defaults elsewhere. |
| 12 | Interactive mode also prompts for editable state and priority. |
| 13 | JSON responses use an ok/data or ok/error envelope. |
| 14 | Priority numbers are reusable; persistent item identity, if needed, uses a GUID. Numeric selectors address active priority positions; GUIDs address permanent identity. |
| 15 | Init force is invalid. Existing storage requires init clean or init backup. Remind users to commit after initialization actions. |
| 16 | Users manage their edits through Git; do not implement generated-file edit/conflict preservation. |
| 17–18 | Missing branch detection uses an explicit branch or BACKLOG_CLI_BRANCH. Git checkout state does not otherwise block use. |
| 19 | Archived items remain read-only; no unarchive command. |
| 20 | Import transfers all unarchived source items, including done. Move transfers one item. Set cannot edit branch. |
| 21 | Stored branch names survive Git rename/deletion. Add list branch with item counts. |
| 22 | GitHub Packages; package basename smooth-backlog-cli. |
| 23 | Source repository is SmoothSDLC/smooth-backlog-cli. |
| 24 | Node 24+; Linux, macOS, and Windows. |
| 25 | Codex, Claude Code, GitHub Copilot, and Qwen Code. |
| 26, 29 | Updates refresh package and installed backlog integrations. Detect installation and permissions when auto is enabled or an update requires it; never elevate privileges. |
| 27 | Preferences are user-scoped. |
| 28 | Default weekly notification checks; auto-enabled checks every 24 hours; failures retry after one hour; execution-time scheduling. |
| 30 | Auto applies compatible stable patch/minor releases. Major versions produce notices; explicit update installs latest stable. |

The state names are `new`, `open`, `done`, and `archived`; `open` replaces every
earlier use of `in-progress`.

## Repository and branch context

Discover the Git working-tree root from any nested directory. Store project data
at that root. Worktrees use their checked-out files; submodules have their own
root. Dirty, unborn, and detached checkouts do not themselves block commands.
Ordinary repository commands still require a Git working-tree root; a branch
override alone does not identify where project files belong.

Run `git branch --show-current`. Use the detected branch when available. When
it is unavailable, use an explicit `--branch`, then inherited
`BACKLOG_CLI_BRANCH`. If none is available, fail with instructions showing both
ways to provide a branch. Set BACKLOG_CLI_BRANCH inside the CLI process and its
children to the selected context. A child process cannot set its parent shell's
environment; document how users can set an override in their shell.

Set BACKLOG_CLI_REPONAME for the CLI process and its children. Interpretation:
use an explicit/configured display name, origin basename, then root directory
basename. Local origin/HEAD may supply a default branch, but its absence does
not block initialization or require network access.

When Git has a named branch, `list --branch <source>` reads another branch's
stored items and `import --branch <source>` transfers from that branch to the
current branch. Neither command checks out or merges Git branches. Fallback
branch selection when Git cannot name a branch is distinct from selecting an
alternate branch while already on a named branch.

Force never authorizes cross-branch mutation and is not an archive option. Move is an expressly
requested transfer operation: it selects one item on the current branch and a
destination branch. Ordinary set never changes branch.

## Identity, state, and ordering

Each item has an immutable generated GUID. Priority is a mutable branch-local
scheduling position, never permanent identity. Numeric command selectors identify current-branch active priority positions.
GUID selectors identify the same item permanently, including done/archive rows. Do not retain an integer ID allocator or next-ID counter.

New and open items are active and share a contiguous priority sequence starting
at 0, as in the original priority contract. The accepted one-based convention
applies to entries inside tasks/outcomes/evidence/references. Done and archived
items have null priority. Completing or archiving an active item closes its gap.

Interpretation of the user's later, more specific bottom-by-default instruction:
newly created items and items moved into a branch enter at the bottom unless
an explicit priority is supplied. Appended task and string-list entries go last.
Changing done to open places the item at priority 0 and shifts other active
items down. Setting an unchanged state does not reorder anything.

Priority changes insert at the requested position, shifting other entries while
preserving their relative order. Reject negative, fractional, and out-of-range
positions. List-entry moves use existing one-based positions. Active views sort
by priority. Done views sort by item_completed_at and archive views by
item_archived_at, newest first, with GUID as a deterministic tie-breaker.
Both show GUIDs. Stored arrays sort by creation time, newest first. This replaces descending
integer-ID sorting, which is incompatible with random GUID identity.

Update timestamps only for changed records, including renumbered priorities.
Reads and true no-ops do not rewrite data or timestamps.

## Schema and input

| Field | Contract |
| --- | --- |
| id | Generated immutable GUID string, unique across live/archive files. |
| priority | Nonnegative integer for active work; null for done/archive. |
| name | Required nonempty text. |
| branch | Selected branch at creation; changed through move/import only. |
| state | new/open/done/archived; creation defaults to new. |
| item-state-description | Optional text, default underscore. |
| description | Required nonempty text. |
| ac | Required nonempty acceptance-criteria text. |
| tasks | Ordered objects with name and goal text; missing components become underscore. |
| outcomes, evidence, references | Ordered string arrays, initially empty. |
| work_item_id | Optional external reference text, default underscore. |
| item_created_at, item_updated_at | Generated UTC ISO 8601 timestamps. |
| item_completed_at | Timestamp on transition into done; null until completion or after reopening. |
| item_archived_at | Timestamp on archive; otherwise null. |

Creation takes an item name plus either one JSON object or named property flags.
Reject conflicting duplicate inputs, unknown fields, generated-field assignment,
branch assignment, and creation in archived state. Positional CSV creation is
removed. Task additions may still use a JSON object or the original quoted CSV
name,goal pair; commas in ordinary string entries remain literal.

`--ask` prompts for omitted text, lists, state, and priority. Explicit values win.
Each list has an explicit finish/skip action. Required fields cannot be silently
omitted. Interpretation: Enter may intentionally accept underscore as a
documented text placeholder, while typed defaults remain typed. Never prompt for
GUID, branch, or generated dates. Prompts go to stderr and require a terminal;
cancellation changes nothing. Prompt before acquiring the mutation lock.

## Command contract and proposed spelling

Both command-first and item-first spellings are accepted for item operations.
`<item>` means current-branch active priority number or permanent GUID.
`list archive` aliases `list archived`; each lists archived records with GUIDs.

| Command | Behavior |
| --- | --- |
| backlog | Return next active item at priority 0; empty is a successful null result. |
| backlog init [repo-name] | Initialize only when .backlog does not exist. |
| backlog init clean [repo-name] | Remove/recreate .backlog and replace installed backlog skills. |
| backlog init backup [repo-name] | Back up existing content, preserve live data/config, and replace backlog skills only. |
| backlog list [state] [--branch source] | List new/open by default, or the requested state. |
| backlog list branch | List stored branch names with active/done/archived and total counts. |
| backlog branch | Alias for list branch, retaining the original command. |
| backlog new <name> [JSON or named flags] | Create required planning text and typed/default fields. |
| backlog set <item> <property> <value> | Replace a scalar; append to a list. |
| backlog add <item> <list> <entry> [--top] | Append an entry by default, optionally prepend. |
| backlog replace <item> <list> <JSON-array> | Replace a whole list. |
| backlog set <item> <list> <JSON-array> --force | Interpretation: explicit list-replacement alias. Force is invalid on unrelated set operations. |
| backlog remove <item> <list> <entry-number> | Remove one list entry by its one-based position, then close the gap. |
| backlog priority <item> <position> | Reorder the branch's active backlog; omitted position means 0. |
| backlog priority <item> <list> <entry-number> <position> | Reorder an entry using one-based list positions. |
| backlog set <item> priority [position] | Compatibility alias for the priority command. |
| backlog <item> done | Requested alias for setting state to done. |
| backlog move <item> <destination-branch> | Transfer one current-branch item; append if active, retain done state otherwise. |
| backlog import --branch <source> [--higher] | Transfer all unarchived source items to the current branch and merge queues. |
| backlog branch import <source> [--higher] | Compatibility alias for import. |
| backlog archive <item> | Transfer one current-branch item to the archive and set archived state. |
| backlog archive done | Archive current-branch done items only. |

Import preserves GUIDs, states, creation times, and source-relative order. Target
active work precedes imported active work unless --higher reverses the groups.
Done stays done; archives remain assigned to their existing branches. Import
into the same branch fails; empty sources are successful no-ops. Stored names
are not silently changed when Git branches are renamed or deleted.

Global help, JSON, and ask flags may appear before or after the command.
Reject unknown commands, flags, properties, extra arguments, invalid types, and
invalid selectors before changing files. Human lists use tables and one row per
list entry without multiplying independent lists into combinations. JSON stdout
is exactly one object: {"ok":true,"data":...} or
{"ok":false,"error":{"code":"...","message":"..."}}. Prompts, notices, and
diagnostics never contaminate JSON stdout. Exit 0 means success/no-op, 2 invalid
usage/input, and 1 operational failure. Help does not require initialized storage.

## Initialization and project storage

Create .backlog/README.md, config.json, agent.instructions.md,
backlog_manifest.json, backlog_archive.json, skills/backlog/SKILL.md, and
skills/agent-types/ containing an adapter manifest plus per-agent instructions.
Both data files start as JSON arrays. Config records ownership, schema version,
display name, optional detected default branch, and generated adapter metadata.
User update policy and update-check history are not stored here.

Ordinary init fails whenever .backlog exists and explains init clean and init
backup. `init --force` is invalid. Clean deliberately removes existing data,
including contained backups, and recreates the managed tree. Do not follow a
symlink outside the repository while doing so.

Interpretation for backup: snapshot current .backlog content, excluding existing
backup directories, plus installed backlog-specific vendor skills into
.backlog/backup-yyyyMMddHHmm/. Add a numeric suffix when the minute's destination
already exists. Preserve existing snapshots and live data/config; replace only
the base skills and backlog-specific installed vendor skill directories. Use
local time for the user-requested backup folder naming; data dates remain UTC.
Report the exact backup path. Initialization actions remind users to commit
changes; the CLI itself does not stage or commit.

Generated backlog skills are replaceable output. Users preserve edits through
Git. Do not implement hash-based edit detection, user-edit merge logic, or
automatic preservation of modified generated copies. Limit replacement to
backlog-specific destination directories; leave unrelated agent skills alone.

All normal mutations validate live and archive schemas and GUID uniqueness.
Malformed JSON, merge conflicts, unsupported schemas, permissions failures, or
unsafe symlink destinations fail clearly without resetting storage. Serialize
concurrent mutations with a lock. Journal multi-file updates and recover
interrupted writes without losing or duplicating items. Read-only operations do
not silently migrate storage. Backups and transient lock/journal metadata must
not cause recursive backup growth or exposure of user-level credentials.

## Agent integrations

Support Codex, Claude Code, GitHub Copilot, and Qwen Code. Verify each vendor's
repository skill convention before implementation; proposed detection and
destination pairs are:

| Agent | Detect | Destination |
| --- | --- | --- |
| Codex | .agents/ | .agents/skills/backlog/SKILL.md |
| Claude Code | .claude/ | .claude/skills/backlog/SKILL.md |
| GitHub Copilot | .github/ | .github/skills/backlog/SKILL.md |
| Qwen Code | .qwen/ | .qwen/skills/backlog/SKILL.md |

The adapter manifest is authoritative and includes detection paths, destinations,
adapter instructions, and capabilities. Install only into detected repository
vendor folders. No detected vendor still succeeds with the base skill.
Do not modify user-home agent instructions, install hooks/plugins, or change
unrelated instruction files. Product skills follow the repository's skill
authoring guidance and use Apache-2.0; imported development skills remain MIT.
All automatic update scheduling belongs to CLI execution, not skill activation.

## Distribution and user-level updates

Interpretation of the selected package basename plus GitHub organization:
`@smoothsdlc/smooth-backlog-cli`, executable `backlog`, source
https://github.com/SmoothSDLC/smooth-backlog-cli. GitHub Packages requires a scope; do
not publish an unscoped package there. Include a GitHub Packages publishing
workflow and exact scope-registry setup instructions. Never automatically edit
npm registry/auth configuration or include credentials in generated files.

Support Node 24+ on Linux, macOS, and Windows. Use built-in Node facilities
where sufficient. Include platform CI and npm package-content verification.
Package-name ownership, actual publication, authenticated update behavior, and
platform execution must be reported according to what was actually verified.

Preferences and update-check history live in a user configuration file, not the
repository. Implementation interpretation: use the platform's conventional
per-user config directory for smooth-backlog-cli and document its exact path.
Do not touch unrelated configuration. Auto-update is off initially; weekly
notification checks are on initially. Check scheduling runs when the CLI runs,
not via a background service or agent hooks. Help does not need a network check.

| Command | Behavior |
| --- | --- |
| backlog update | Explicitly install latest stable, including a newer major, then refresh installed backlog skills. |
| backlog update check | Immediate check and enable weekly notices. |
| backlog update auto | Validate manageable install and permissions, enable automatic compatible updates, and check immediately. |
| backlog update off | Interpretation: turn off automatic installation, retaining the separate weekly-notice preference. |
| backlog update disable | Turn off weekly notification checks; the explicitly enabled auto-update policy is independent. |

When auto is enabled, check at most once every 24 hours. Otherwise, check weekly
unless weekly notices are disabled. A failed check is eligible to retry in one
hour. Persist last-attempt time, status, known installed/available versions, and
successful-check time only when a check occurs; ordinary invocations within the
window do not rewrite update history. Preferences are written when changed.
Serialize user-config writes across CLI processes. Use bounded network timeouts.
Failed automatic operations warn and permit the requested backlog work.
Explicit update failures return nonzero.

Automatically apply only compatible stable patch/minor releases within the
installed major; never downgrade or install prereleases implicitly. If a new
major exists, show a notice explaining that `backlog update` installs it and
auto-update does not. Check compatibility before applying data migrations.
Preserve usable installation/data on failed updates and print actionable recovery
instructions if npm cannot complete an installation transaction.

Detect user-local versus global installation and write permission when enabling
auto or actually updating. Allow writable global installations that need no
elevation. Refuse auto-enable when elevated permissions would be required and
show the exact manual update command. Do not request elevation or silently
change installation scope. Scheduled notification-only checks need not inspect
installation scope. Refresh generated skills in the repository being used;
other repositories refresh when subsequently used with the new package version.

## Implementation approach proposed for review

Use an ESM Node package with a thin executable and focused modules for command
parsing/output, Git context, schema/input, item operations, transactional storage,
agent generation, and user-level updates. Prefer Node standard-library APIs and
the existing git/npm executables over product dependencies where sufficient.
Never execute item reference text or interpolate user input into shell commands.

Verify behavior with Node's built-in test runner and isolated temporary Git
repositories. Test branch restrictions and overrides, both ordering systems,
GUID selection, list append/replace/remove, state changes, move/import/archive,
init clean/backup, corrupt files, interrupted writes, concurrent writers,
interactive cancellation, JSON stdout, update scheduling and permission refusal.
Use a controlled registry/npm fixture for deterministic updater tests, package
smoke tests for installation, and repository skill validators for generated
product skills. Real publishing requires configured publisher credentials.

## Final resolved follow-ups

1. Both command orders are accepted, including the done shortcut.
2. Numeric priorities are reusable selectors; GUIDs are persistent identities.
   Done/archive lists include GUIDs and sort by their event timestamps, newest first.
3. Init clean resets the entire repository backlog regardless of branch. Force
   is not universal; only whole-list assignment through set accepts --force.
   Archive and all other commands reject --force unless expressly specified.

## Reviewed updater implementation

Keep the npm executable and baseline package available throughout updates. Copy
a complete release into an immutable installed runtime directory; validate Node
engine requirements, backlog schema/protocol markers and executable behavior
before atomically selecting it. A killed updater leaves the old or new complete
runtime callable. Retain older runtimes for in-flight processes. Re-read active
metadata under the package lock to prevent stale-process downgrades. Recognize
writable custom npm --prefix installs through their actual bin link/shim, even
when npm's configured default prefix differs. Abandoned process locks require
verified explicit removal before automatic journal replay; do not unlink a lock
based on a stale PID observation.
