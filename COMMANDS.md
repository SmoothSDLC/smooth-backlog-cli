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

Manifest and archive files are JSON arrays under `.backlog/`. Every item has GUID,
priority, name, branch, state, item-state-description, description, ac, tasks,
outcomes, evidence, references, work_item_id, item_created_at, item_updated_at,
item_completed_at, and item_archived_at. Tasks contain name/goal strings.

A repository-root `.smooth-backlog-cli.lock` serializes local processes. The CLI
also acquires the pre-rename lock first to coordinate with older installed
versions. A durable
`.backlog/.transaction.json` journal recovers interrupted multi-file writes.
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

## Shared backlog repository mode

In this mode the items of every repository live in one Git repository, the backlog repository
(`SmoothSDLC/smoothsdlc-backlog`), in a folder per consuming repository, instead of in each repository's own
`.backlog/` folder. Two global options, put before the command, choose the mode. The choice is kept per user.

**Two writers never overwrite each other.** Every item write sets `updated_by` (the `--by`/`--claim` agent of the command, else
`QWEN_CODE_AGENT_ID`, else `USER`) next to `updated`; older items without it read as written by nobody. A command that shows an
item to an agent (`backlog query --phase <item> --agent <you>`, `backlog pop --agent <you>`) records what that agent saw (`updated`,
`updated_by`, the backlog commit) in `.git/smooth-backlog-cli-views/<agent>.json` of the backlog clone, and so does every write after
it succeeds. The next write of that agent to the item first compares the item, after the update from origin, with that record: when
somebody else changed it since, the write is refused with exit code 5 and the message `item <item> was changed by <who> at <when>
after you last read it (<what you saw>); read it again (backlog query --phase <item>) and retry`. The same refusal comes when another
writer's change to the item reaches origin while this command is pushing; the command's change is then taken back (never merged,
never parked on a branch). Changes to different items rebase and push on their own. An item the agent never read is written without
the check (its first write). The same holds for `backlog move` and `backlog archive`. The leading pull never refreshes the agent's
cached view. Completing or closing an item also checks every other item whose priority the reflow rewrites, and guards that whole
write set against changes arriving during push.
A stale item refuses the entire write without publishing any of it.
Every shared change succeeds only after its commit is pushed. A push that still fails after retries rolls the local branch
back to origin/main and restores the starting working files and staging, including both folders of a cross-repository move.
Before every push, the CLI validates the entire write set against the merged backlog, including live/archive sequence and slug uniqueness, dependency existence and cycles, and incoming dependencies of moved or renumbered items. Claims recheck that dependencies are finished and the agent's other work permits another claim (`--force` still overrides only the active-work limit). The read guard also protects a split's parent. A rejected publication preflight restores the starting files, databases, and staging.
The CLI refuses existing unpublished commits before changing anything and lists their hashes, subjects, and explicit commands
to publish or drop them; it never silently rewrites a legacy stack.

```sh
backlog --use-backlog-repo <path>   # use the clone at <path>: shared mode
backlog --use-local-repo            # back to the repository's own .backlog folder: local mode
```

Either option may be followed by a command, which then runs in that mode. `--use-backlog-repo` checks that the
path is a clone of the backlog repository on its `main` branch and pulls it. In shared mode nothing is written into
the consuming repository. Only the commands below exist in this mode; each pulls the backlog repository first, and a
command that changes an item commits and pushes the change before it exits. An item is named by its number or its
slug. With `--json`, the shared-mode commands print the data itself and not the `{"ok","data"}` envelope of the local mode. The team flags of `update`, the team views of `query` and `pop` work; `--plan` and the other
flags that a list below marks "Not in this build" are refused. In shared mode `backlog update` changes an item, while in local mode
it updates the CLI itself. The text of each command below is what `backlog <command> --help` prints.

### backlog new

```text
backlog new — add an item to the backlog of this repository, or split a sibling off an existing item

Usage:
  backlog new --name <text> --depends-on <items|none> [options]
  backlog new --split-from <item> --depends-on <items|none> [options]

Adds or splits an item. The item gets the next free item number, is written as a file in the folder of this
repository in the backlog repository, and the whole backlog is renumbered so that the priorities run from 0 without
gaps. An item is named by its number or by its slug (the file name without .md, for example 018-help-text).
The item belongs to the branch that is checked out in the repository you run the command in. When
TEAM_REPOSITORY (owner/name) and TEAM_BRANCH are set, a team session files the item under that repository and
branch instead, and then --body must hold a definition of done.

In shared backlog repository mode the command first updates the local clone of the backlog repository
(git pull --rebase --autostash). A command that changes an item commits and pushes the change before it exits.
Run the command from inside the repository whose backlog you mean; its folder in the backlog repository is found
from the origin of that repository.

Options:
  --db DB
      Not in this build. The Python scripts use this flag for an internal database path; the shared mode always
      reads and writes the backlog database in the folder of this repository.
  --name NAME
      The name of the item, in human-readable words. Required, unless --split-from is given.
  --objective OBJECTIVE
      The objective of the item, in one line. A split item inherits the objective of its parent when this is omitted.
  --summary SUMMARY
      A semantic summary of what is in the item. It is used to route new work to the right item, so say in it what
      the item is about.
  --context CONTEXT
      The context carried over from the original request. It is written into the item body.
  --priority PRIORITY
      The insertion rank, an integer. 0 makes the item the next thing to do. When it is omitted the item is
      appended to the end of the backlog. The backlog is renumbered to 0..N-1 around the item, because adding
      work is a planning event.
  --severity {normal,critical}
      The default is normal. Critical means a finding about repository corruption, data loss, the source of truth
      or security. It puts the item at priority 0 (unless --priority is given) and makes backlog query print it in
      a loud banner so that it is never buried.
  --split-from ITEM
      Create a sibling item that inherits the context of this item (a number or a slug). The command refuses when
      the item does not exist.
  --body BODY
      The initial body of the item, the hand-over content for whoever does it. When the body has no "Definition of
      done" heading or line with checkable lines, a placeholder checklist is added. With --review-refs, or in a team
      session, the body must hold a real definition of done.
  --review-refs REVIEW_REFS
      How the item is reviewed: comma-separated paths of review documents in the cody-coding-model repository, at
      least one of them under references/review/ (references/review/<type>.md). An item with review documents
      closes only after a passing review; without them it closes without one.
  --depends-on DEPENDS_ON
      Required: the item numbers or slugs that must be done first, comma-separated, or the word none. The command
      refuses when a named item is not in this backlog.
  --estimate MINUTES
      The estimated minutes of work, an integer (the front matter key estimate_min). Required for team work.
  --complexity {low,medium,high}
      The estimated complexity of the item.
  --layer {1,2,3,4,5,process}
      The layer of the item: 1 to 5, or the word process.
  --team NAME
      The team that owns the item (front matter team): the item starts in stage refining. --split-from inherits the
      source's team.
  --chunk
      Chunk work: small pieces any member does between items (the front matter key chunk: true).
  --force
      Write the item file even when a file of that name already exists. Without it the command refuses.
  --dry-run
      Say which file would be created and change nothing: no file is written and nothing is committed.
  --help
      Print this text and exit. Nothing is read or changed.

On success the command prints a line that starts "created phase" with the file, the item number and the rank the
item now has, and a line about the renumbered backlog. A critical item is announced in a banner first.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error.
  3  The local clone of the backlog repository could not be synchronised with its origin. Either the update before the
     command failed: then nothing was read or changed, and the command can be run again once the cause is fixed. Or the
     change was not published and was rolled back: fix the cause and retry the command. Existing unpublished commits
     are refused before any change; the message lists them and gives explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when. Read the item again, then repeat the command. An item this agent never read is written
     without the check (its first write).

Example:
  backlog new --name "Fix login" --objective "An expired cookie no longer blocks sign-in" --summary "Login cookie handling" --depends-on none
```

### backlog update

```text
backlog update — change the fields of one item, move it in the queue, or re-plan the whole backlog

Usage:
  backlog update <item> [options]
  backlog update --replan <item>,<item>,... [--note <text>]

Changes the item named by its number or slug. The item file is the source of truth: the command writes the file,
records an event in the history of the item and refreshes the backlog database from the file. Setting --status to
done completes the item (its completion time is set) and renumbers the rest of the backlog; so does --priority.
Both are planning events, so look at the order again afterwards. The item may be left out only together with
--replan. Do not confuse this command with the local mode command that updates the CLI itself.

In shared backlog repository mode the command first updates the local clone of the backlog repository
(git pull --rebase --autostash). A command that changes an item commits and pushes the change before it exits.
Run the command from inside the repository whose backlog you mean; its folder in the backlog repository is found
from the origin of that repository.

Options:
  --db DB
      Not in this build. The Python scripts use this flag for an internal database path; the shared mode always
      reads and writes the backlog database in the folder of this repository.
  --status STATUS
      The new status of the item. Open items are pending or in_progress, a finished item is done. Setting done
      completes the item; the command refuses when the item has review documents (review_refs) and no passing review.
  --branch BRANCH
      Refused by design: the branch of an item is not changed here. Use backlog move --to-branch instead.
  --commit COMMIT
      Record the commit the work has reached. The value cannot be cleared; an empty value is refused.
  --location LOCATION
      Record where the work is, as free text.
  --summary SUMMARY
      Replace the semantic summary of the item.
  --priority PRIORITY
      Move the item to this rank, an integer. 0 makes it the next item. The rest of the backlog is renumbered to
      0..N-1 around it.
  --name NAME
      Replace the name of the item.
  --objective OBJECTIVE
      Replace the objective of the item.
  --seq SEQ
      Set the item number to this integer.
  --size_score SIZE_SCORE
      Set the size score of the item, an integer.
  --append APPEND
      Append this text to the body of the item.
  --replan REPLAN
      The new leading order of the backlog, as comma-separated item numbers or slugs. It is a pure planning event
      and renumbers the backlog to 0..M-1. No item argument is given with it.
  --note NOTE
      The note for the event log. Without it the log records which fields were set.
  --claim AGENT
      Take the item for an agent (team session). The command refuses when another agent holds the item, when an item
      in its depends_on is not done, or when a team's item is not in stage ready (its refinement review has not passed);
      otherwise the item becomes in progress and claimed by that agent.
  --force
      Together with --claim: claim although the agent already holds active items (never before stage ready).
  --waiting WHAT
      Record that the holder of the item (named with --by) waits for something asynchronous, for example a workflow run or a
      deployment. The wait is cleared by the next --note, --review, --close or --request-review of the item, or by
      --waiting-done (team session).
  --waiting-done
      Clear the wait of the item (team session).
  --set-review-refs PATHS
      Set the review_refs of the item (its definition of done), as comma-separated paths in the cody-coding-model repository.
      At least one of them is a review document under references/review/ (references/review/<type>.md) (team session).
  --set-depends-on IDS
      Replace the depends_on of the item, as item numbers or slugs, or the word none. The command refuses when a
      named item is not in this backlog.
  --set-estimate MINUTES
      Replace the estimate_min of the item, the estimated minutes of work. It must be greater than 0.
  --set-complexity {low,medium,high}
      Replace the estimated complexity of the item.
  --set-layer {1,2,3,4,5,process}
      Replace the layer of the item: 1 to 5, or the word process.
  --set-chunk {yes,no}
      Mark the item as chunk work (small pieces any member does between items) or not.
  --set-team NAME
      Set the team that owns the item; an empty NAME clears it. The team runner sets it on the work item it hands the team
      lead, and claims that item for the lead; items split from it inherit the team.
  --refine-start
      A team member starts refining the item (--by <agent>): only a team's item in stage refining that nobody claims or
      already refines. The stages before any work are refining, refined, refinement-review and ready.
  --refine-done
      The refiner finished (--by <the refiner>, --note "<what you refined>"): stage refined. Refused while a team field or
      the definition of done is missing.
  --request-refinement-review
      The team lead sends a refined item to the refinement review (--by <lead>): stage refinement-review.
  --refinement-review {pass,changes,limit}
      Record the refinement verdict, --by codex|claude with --comments "<findings; thread or session id>": pass makes the
      item ready, changes sends it back to refining. limit (--by codex) records Codex's answer that its 5-hour limit is
      exceeded; only then may Claude record a verdict for that round.
  --request-decision QUESTION
      The item needs an owner decision (--by <agent>): stage review-hitl, the question is written in the item (what, why,
      how it came up, the options and a recommendation). Nobody claims it, or an item that depends on it, until the answer.
  --decision ANSWER
      The owner's answer to the item's question: written in the item as DECISION <date>: <answer>, and the item goes back
      to stage refining, where the lead re-refines it with the decision.
  --reassign AGENT
      The team lead only (--by <lead>, --reason "<why>"): take the item from the agent that holds it and give it to AGENT.
      In a qwen-code team session (QWEN_CODE_AGENT_ID=<name>@<team>) a member acts only as itself: its claim, release,
      refinement, review and close of an item name itself, never another agent.
  --reason REASON
      Why the lead reassigns or releases another agent's item (with --reassign, or --release AGENT --by <lead>).
  --release AGENT
      Give the item back, pending and unclaimed (team session). Only AGENT itself, or the team lead with --by <lead> and
      --reason, releases it.
  --request-review AGENT|any
      Ask an agent, or any agent, for a review; --note says what to review (team session). The output ends with the
      instruction to end the session now: a review request, a changes verdict (--review changes) and a close each end the
      agent's session, so its next task starts in a fresh one (not for the team lead, nor while the agent holds another
      active item).
  --start-review
      Record that the agent named by --by starts the requested review (review_state in_review, reviewer and review_started are
      set). Other agents skip it unless the review was started more than 20 minutes ago (team session).
  --review {pass,changes}
      Record a review verdict; it needs --by and --comments (team session).
  --by AGENT
      The agent that reviews (--start-review, --review) or closes (--close) the item (team session).
  --comments COMMENTS
      The review findings (--review); they must cite one of the review references of the item (team session).
  --close
      Complete the item; --summary says what was delivered. It needs a passing review when the item has review documents (review_refs) (team session).
  --dry-run
      Say what would change and change nothing: no file is written and nothing is committed.
  --help
      Print this text and exit. Nothing is read or changed.

A call takes at most one team step (--claim, --release, --request-review, --start-review, --review, --close, --waiting, --waiting-done).
A session with TEAM_REPOSITORY (and TEAM_BRANCH) set works only on items of that repository and branch: every change to another item is refused, field edits and --append as much as team steps.
On success the command prints a line that starts with a check mark, the slug and the fields it set.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error.
  3  The local clone of the backlog repository could not be synchronised with its origin. Either the update before the
     command failed: then nothing was read or changed, and the command can be run again once the cause is fixed. Or the
     change was not published and was rolled back: fix the cause and retry the command. Existing unpublished commits
     are refused before any change; the message lists them and gives explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when. Read the item again, then repeat the command. An item this agent never read is written
     without the check (its first write).

Example:
  backlog update 18 --status in_progress --note "Started the help text"
```

### backlog query

```text
backlog query — read the backlog of this repository: the queue, one item, the history, or the critical items

Usage:
  backlog query [--status] [--all] [--branch <name>] [--json]
  backlog query --next | --critical | --phase <item> | --events [<item>] | --by-branch <name> [--json]
  backlog query --claimable | --reviewable | --blocked | --decisions [--agent <name>] [--roster <file>] [--scope branch|repo|all] [--json]
  backlog query --pop --agent <name> [--lead <name>] [--roster <file>] [--scope branch|repo|all] [--claim-now] [--json]

Reads the backlog and never changes it, except that --pop with --claim-now claims an item. Without a view option it prints the full stack of the branch: the open
items in queue order (priority 0 is next), then the finished ones. Items that are not on the queue because their file
is gone, or because they name another repository or no branch, are reported as findings above the queue.
With --json the command prints the data itself, without any wrapper.

In shared backlog repository mode the command first updates the local clone of the backlog repository
(git pull --rebase --autostash). A command that changes an item commits and pushes the change before it exits.
Run the command from inside the repository whose backlog you mean; its folder in the backlog repository is found
from the origin of that repository.

Options:
  --db DB
      Not in this build. The Python scripts use this flag for an internal database path; the shared mode always
      reads and writes the backlog database in the folder of this repository.
  --next
      The next actionable item: the open item with the lowest priority on the branch. When the queue is empty the
      command says so (with --json it prints {}). Open items of a branch that no longer exists on the origin
      are in no queue.
  --status
      The full stack of the branch (this is the default view).
  --critical
      Only the open items with severity critical.
  --phase PHASE
      One item, given by number or slug. The command refuses when it does not exist.
  --events [EVENTS]
      The event log. With an item (number or slug) it prints the events of that item, newest first; without one it
      prints the latest 50 events of the backlog.
  --by-branch BY_BRANCH
      The items recorded on this branch.
  --json
      Print machine-readable output.
  --all
      Show --next or --status for every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to show. The default is the branch that is checked out here; a detached HEAD needs
      this option or --all.
  --claimable
      Open, unclaimed items whose dependencies are all done, in priority order; another repository's items only as chunk
      work (chunk: true); with TEAM_NAME set, only that team's items of this repository (team session).
  --reviewable
      Items with a requested review that --agent may start or continue: any member but the author reviews (team session).
  --blocked
      Open items that wait for dependencies that are not done, with the status and holder of each dependency (team session).
  --decisions
      The items that wait in stage review-hitl for an owner decision, each with its question, for the morning report; with
      --all every branch. Answer one with backlog update <item> --decision "<answer>".
  --pop
      The one next action of the agent named by --agent: continue, review, refine, claim, refinement-review, chunk or idle
      (exit code 3, with the blockers named) (team session).
      It is the same as backlog pop; see backlog pop --help. With --next, --agent does the same.
  --agent AGENT
      The agent that asks. With --claimable or --reviewable it also switches to team rules: an incomplete item is not offered
      and the agent never reviews its own work. With --pop it is the agent whose next action is answered (team session).
  --plan
      Not in this build. The dispatch plan of the team for this branch: one action per member (respond, close, review or claim),
      each item to one member, with the reason; it needs --roster (team session).
  --lead LEAD
      With --pop or --plan: the team lead, who alone refines incomplete items and never claims an execution item. The default
      is the environment variable TEAM_LEAD, else cody (team session).
  --agents AGENTS
      Not in this build. With --plan: the team members present, comma-separated; the default is the whole roster (team session).
  --claim-now
      With --pop: claim the item when the next action is to claim (team session).
  --roster ROSTER
      The team roster as a JSON file {agent: {...}}, the team's members in order; the default is the file named by TEAM_ROSTER.
      Any member but the author may review an item; a member with "review_only": true never claims (team session).
  --scope {branch,repo,all}
      With --pop, --claimable, --reviewable and --blocked, how far the view looks: this branch (the default), every branch of this repository, or also the chunk items
      of every repository. The widest scope for chunk items is capped by the line refinement_scope: off|branch|repo|all
      in the file backlog.scope of the folder of this repository (default branch).
  --headless
      Not in this build. Record the next-step decision without asking a question. BACKLOG_HEADLESS=1 is refused
      the same way by the human-readable --next view.
  --help
      Print this text and exit. Nothing is read or changed.

The options --plan, --agents and --headless are refused with exit code 2 in this build.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error.
  3  The local clone of the backlog repository could not be synchronised with its origin. Either the update before the
     command failed: then nothing was read or changed, and the command can be run again once the cause is fixed. Or the
     change was not published and was rolled back: fix the cause and retry the command. Existing unpublished commits
     are refused before any change; the message lists them and gives explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when. Read the item again, then repeat the command. An item this agent never read is written
     without the check (its first write).

With --pop, and with --next and --agent, the exit codes are those of backlog pop (see backlog pop --help): 0 the command
answered with an action, 3 the action is idle (3 is also used when the local clone could not be updated before the answer, or a --claim-now claim could not be pushed),
1 a --claim-now claim was refused or could not run, 2 the arguments or the place were wrong, 4 the backlog repository is
not set up.

Example:
  backlog query --status --branch main
```

### backlog next

```text
backlog next — show the next actionable item of this repository and branch

Usage:
  backlog next [--all] [--branch <name>] [--json]

Prints the open item with the lowest priority on the branch that is checked out here, with its objective, summary,
file and progress, followed by the instruction to hand the decision about the next step back to the user. It is
the same as backlog query --next and reads the backlog without changing it. When the queue is empty it says so
(with --json it prints {}). Critical items are announced in a banner first. With --agent <name> it is the pop of
that agent instead, see backlog pop --help. The other options of backlog query are described in backlog query --help.

In shared backlog repository mode the command first updates the local clone of the backlog repository
(git pull --rebase --autostash). A command that changes an item commits and pushes the change before it exits.
Run the command from inside the repository whose backlog you mean; its folder in the backlog repository is found
from the origin of that repository.

Options:
  --all
      Show the next item over every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to show. The default is the branch that is checked out here; a detached HEAD needs
      this option or --all.
  --json
      Print the item as machine-readable data.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error.
  3  The local clone of the backlog repository could not be synchronised with its origin. Either the update before the
     command failed: then nothing was read or changed, and the command can be run again once the cause is fixed. Or the
     change was not published and was rolled back: fix the cause and retry the command. Existing unpublished commits
     are refused before any change; the message lists them and gives explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when. Read the item again, then repeat the command. An item this agent never read is written
     without the check (its first write).

With --pop, and with --next and --agent, the exit codes are those of backlog pop (see backlog pop --help): 0 the command
answered with an action, 3 the action is idle (3 is also used when the local clone could not be updated before the answer, or a --claim-now claim could not be pushed),
1 a --claim-now claim was refused or could not run, 2 the arguments or the place were wrong, 4 the backlog repository is
not set up.

Example:
  backlog next --json
```

### backlog pop

```text
backlog pop — ask what one agent does next: the one next action, first match wins

Usage:
  backlog pop --agent <name> [--lead <name>] [--roster <file>]
              [--scope branch|repo|all] [--all] [--branch <name>] [--claim-now] [--json]

Answers with exactly one action for the agent, the first that applies: continue (an item the agent holds and can work
on; when its review passed, close it), review (an item another agent asks to have reviewed, or a review the agent
started), refine (a member: the refinement it has started, or the first-round refinement of a team item in stage
refining that nobody refines; the team lead: an incomplete item that lacks required fields), claim (the open item with the
lowest priority whose dependencies are done, that is no chunk item, is in stage ready when it has a team, and that nobody
holds), refinement-review (the team lead: refined items to send to the refinement review), chunk (a small piece
of refinement work of at most ten minutes) or idle. An item the agent holds that waits for a verdict or for a run is not
continued, and the agent claims a new item only when every item it holds waits. A review request older than
BACKLOG_REVIEW_FIRST_SECONDS (300) is answered before the agent's own work. Incomplete items are never claimed or
reviewed. With TEAM_NAME set (the team runner sets it), only that team's items of this repository are continued, reviewed
or claimed. When nothing is left the action is idle, the blockers are named, and the command exits with 3 (see the exit codes below).

Without --json the first line is the action and the item, the second line says what to do, and one line per blocked item
follows. With --json the command prints one object with the keys action, item, seq, repository, branch, instruction,
claimed, blocked and held (and missing when the action is refine). backlog next --agent <name> and backlog query --pop
print the same.

In shared backlog repository mode the command first updates the local clone of the backlog repository
(git pull --rebase --autostash). A command that changes an item commits and pushes the change before it exits.
Run the command from inside the repository whose backlog you mean; its folder in the backlog repository is found
from the origin of that repository.

Options:
  --agent AGENT
      The agent that asks. Required.
  --lead LEAD
      The team lead, who alone refines incomplete items and never claims an execution item. The default is the environment
      variable TEAM_LEAD, else cody.
  --roster ROSTER
      The team roster as a JSON file {agent: {...}}, the team's members in order; the default is the file named by TEAM_ROSTER.
      Any member but the author may review an item; a member with "review_only": true never claims.
  --scope {branch,repo,all}
      How far the agent looks: this branch (the default), every branch of this repository, or also the chunk items
      of every repository. The widest scope for chunk items is capped by the line refinement_scope: off|branch|repo|all
      in the file backlog.scope of the folder of this repository (default branch).
  --all
      Look at every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to use. The default is the branch that is checked out here. A team session bound by
      TEAM_BRANCH can only use that branch.
  --claim-now
      When the action is claim, claim the item now (as backlog update <item> --claim <agent>). If that claim is refused,
      the refusal is printed and its exit code is returned.
  --json
      Print one machine-readable object.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command answered with an action.
  3  The action is idle: nothing is left for the agent. The same code is used when the local clone of the backlog
     repository could not be updated from its origin before the answer (nothing was read; the message is on standard error),
     and when a --claim-now claim was not published and was rolled back. Fix the cause and retry the command.
  1  A --claim-now claim was refused or could not be run (its process failed or was interrupted): its output, or the failure, is
     shown. After an interruption the claim may already be saved, or even pushed: check the item before running pop again.
  2  The arguments or the place were wrong: the message is on standard error.
  4  The backlog repository is not set up; the printed question must be answered by the user.

Example:
  backlog pop --agent archy --json
```

### backlog work

```text
backlog work — the one next-work command of a team member: the next action, marked as yours, with the whole item

Usage:
  backlog work --agent <you> [--lead <name>] [--roster <file>] [--scope branch|repo|all] [--all] [--branch <name>] [--json]

Applies the team workflow order of backlog pop (your current task, reviewed work, another member's review request, the
first-round refinement of a team item, the next ready item of your team, a chunk, else idle), marks the item as yours for
that step (a claim, a refinement start or a review start, each one locked write), and prints the action, the one
instruction and the whole item: its front matter and its body. A team member reads and writes the backlog only with
these commands. When the mark is refused because another agent took the item meanwhile, the refusal is printed: run
backlog work again.

Options:
  --agent AGENT
      Required: you, the agent asking.
  --lead LEAD
      The team lead. The default is the environment variable TEAM_LEAD, else cody.
  --roster ROSTER
      The team roster as a JSON file {agent: {...}}; the default is the file named by TEAM_ROSTER.
  --scope {branch,repo,all}
      How far the agent looks, as backlog pop --scope.
  --all
      Look at every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to use. The default is the branch that is checked out here.
  --json
      Print one object: the keys of backlog pop --json, marked (the step that marked the item, or null), front_matter and
      body.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command answered with an action, and the item is marked as yours where the step needs it.
  3  The action is idle: nothing is left for you (the blockers are named).
  1  The mark was refused (another agent took the item meanwhile) or could not be run: its output is shown.
  2  The arguments or the place were wrong: the message is on standard error.
  4  The backlog repository is not set up; the printed question must be answered by the user.

Example:
  backlog work --agent archy --json
```

### backlog move

```text
backlog move — move an item to another branch, or to another repository's folder, keeping its history

Usage:
  backlog move <item> --to-branch <name> [--note <text>]
  backlog move --all-open-of-branch <from> --to-branch <to> [--note <text>]
  backlog move <item> --to-repository [<owner/name>] [--note <text>]

Moves backlog items. With --to-branch the item now belongs to that branch of this repository. With
--all-open-of-branch every open item of one branch moves to another branch, for example after the branch was
merged. With --to-repository an item that names another repository goes to the folder of that repository in the
backlog repository; without a value it goes to the repository the item names, under a new item number there.
Every move is recorded as an event in the history of the item.

In shared backlog repository mode the command first updates the local clone of the backlog repository
(git pull --rebase --autostash). A command that changes an item commits and pushes the change before it exits.
Run the command from inside the repository whose backlog you mean; its folder in the backlog repository is found
from the origin of that repository.

Argument:
  <item>
      The item to move, by number or slug. Required, except together with --all-open-of-branch.

Options:
  --to-branch TO_BRANCH
      The branch the item (or every open item of --all-open-of-branch) now belongs to.
  --all-open-of-branch ALL_OPEN_OF_BRANCH
      Move all open items of this branch of this repository. It needs --to-branch.
  --to-repository [TO_REPOSITORY]
      Move a foreign item to the folder of another repository, given as owner/name. The default is the repository
      the item names. The command refuses when that is the repository you are in.
  --note NOTE
      A note that is added to the event of a move to a branch.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes for this command: 0 moved and pushed, 1 refused (for example the item does not exist), 2 wrong place or
wrong arguments (for example neither --to-branch nor --to-repository), 3 the update of the local clone failed before
the move (nothing was changed), or the move was not published and was rolled back.

Example:
  backlog move 18 --to-branch team-cli-parity-1
```

### backlog archive

```text
backlog archive — archive a finished item by moving its file under archive/

Usage:
  backlog archive <item> [--force] [--dry-run]

Archives an item given by number or slug. The item file moves to the same path under the archive folder of this
repository's folder in the backlog repository and its status becomes archived. The command records an event and
renumbers the remaining backlog to 0..M-1, because archiving takes the item off the backlog. Archiving an item
that is already archived does nothing and says so. The command refuses when the item does not exist, or when its
status is not done and --force was not given.

In shared backlog repository mode the command first updates the local clone of the backlog repository
(git pull --rebase --autostash). A command that changes an item commits and pushes the change before it exits.
Run the command from inside the repository whose backlog you mean; its folder in the backlog repository is found
from the origin of that repository.

Argument:
  <item>
      The item to archive, by number or slug.

Options:
  --db DB
      Not in this build. The Python scripts use this flag for an internal database path; the shared mode always
      reads and writes the backlog database in the folder of this repository.
  --force
      Archive the item even if its status is not done.
  --dry-run
      Say which move would happen and change nothing: no file is moved and nothing is committed.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error.
  3  The local clone of the backlog repository could not be synchronised with its origin. Either the update before the
     command failed: then nothing was read or changed, and the command can be run again once the cause is fixed. Or the
     change was not published and was rolled back: fix the cause and retry the command. Existing unpublished commits
     are refused before any change; the message lists them and gives explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when. Read the item again, then repeat the command. An item this agent never read is written
     without the check (its first write).

Example:
  backlog archive 12
```
