// Help text of the shared-backlog-repository mode (cli-parity job 18): HELP[command] is what `backlog <command> --help`
// prints (src/shared/router.js) and what COMMANDS.md repeats. The flag lists follow the argparse help of new_phase.py,
// update.py, query.py, move.py and archive.py. The text is written in plain, complete sentences so that the skill
// instructions can be rewritten around it. A flag the build refuses carries the sentence "Not in this build."
// Layout the tests rely on: a flag is a line "  --flag ARG" followed by description lines indented by six spaces.

const SHARED = `In shared backlog repository mode the command first updates the local clone of the backlog repository
(git pull --rebase --autostash). A command that changes an item commits and pushes the change before it exits.
Run the command from inside the repository whose backlog you mean; its folder in the backlog repository is found
from the origin of that repository.`;

const EXIT = `Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error.
  3  The change was committed locally but could not be pushed to the origin of the backlog repository.
  4  The backlog repository is not set up; the printed question must be answered by the user.`;

const DB = `  --db DB
      Not in this build. The Python scripts use this flag for an internal database path; the shared mode always
      reads and writes the backlog database in the folder of this repository.`;

const HELP_FLAG = `  --help
      Print this text and exit. Nothing is read or changed.`;

const CLASSES = 'app-code, ui, api, tests, iac, network, identity, security, data, delivery, verify, docs, contract, chunk, skills';

export const HELP = {
  new: `backlog new — add an item to the backlog of this repository, or split a sibling off an existing item

Usage:
  backlog new --name <text> --depends-on <items|none> [options]
  backlog new --split-from <item> --depends-on <items|none> [options]

Adds or splits an item. The item gets the next free item number, is written as a file in the folder of this
repository in the backlog repository, and the whole backlog is renumbered so that the priorities run from 0 without
gaps. An item is named by its number or by its slug (the file name without .md, for example 018-help-text).
The item belongs to the branch that is checked out in the repository you run the command in. When
TEAM_REPOSITORY (owner/name) and TEAM_BRANCH are set, a team session files the item under that repository and
branch instead, and then --body must hold a definition of done.

${SHARED}

Options:
${DB}
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
      done" heading or line with checkable lines, a placeholder checklist is added. With --review-classes the body
      must hold a real definition of done.
  --work-class WORK_CLASS
      What doing the item requires, as comma-separated classes from: ${CLASSES}.
  --review-classes REVIEW_CLASSES
      The expertise the review needs, as comma-separated classes from the work classes above plus code. When it is
      omitted the item closes without a review.
  --review-refs REVIEW_REFS
      Required together with --review-classes: the review documents and the definition of done, as
      comma-separated paths in the cody-coding-model repository. Every review class needs one path whose file
      name starts with the class (references/review/<class>.md or <class>.example.md). The command refuses when
      a class is not covered.
  --depends-on DEPENDS_ON
      Required: the item numbers or slugs that must be done first, comma-separated, or the word none. The command
      refuses when a named item is not in this backlog.
  --estimate MINUTES
      The estimated minutes of work, an integer. Required for team work.
  --complexity {low,medium,high}
      The estimated complexity of the item.
  --layer {1,2,3,4,5,process}
      The layer of the item: 1 to 5, or the word process.
  --force
      Write the item file even when a file of that name already exists. Without it the command refuses.
  --dry-run
      Say which file would be created and change nothing: no file is written and nothing is committed.
${HELP_FLAG}

On success the command prints a line that starts "created phase" with the file, the item number and the rank the
item now has, and a line about the renumbered backlog. A critical item is announced in a banner first.

${EXIT}

Example:
  backlog new --name "Fix login" --objective "An expired cookie no longer blocks sign-in" --summary "Login cookie handling" --depends-on none
`,

  update: `backlog update — change the fields of one item, move it in the queue, or re-plan the whole backlog

Usage:
  backlog update <item> [options]
  backlog update --replan <item>,<item>,... [--note <text>]

Changes the item named by its number or slug. The item file is the source of truth: the command writes the file,
records an event in the history of the item and refreshes the backlog database from the file. Setting --status to
done completes the item (its completion time is set) and renumbers the rest of the backlog; so does --priority.
Both are planning events, so look at the order again afterwards. The item may be left out only together with
--replan. Do not confuse this command with the local mode command that updates the CLI itself.

${SHARED}

Options:
${DB}
  --status STATUS
      The new status of the item. Open items are pending or in_progress, a finished item is done. Setting done
      completes the item; the command refuses when the item has review classes and no passing review.
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
      Not in this build. Take the item for an agent (team session).
  --force
      Not in this build. Together with --claim: claim although the agent already holds active items.
  --waiting WHAT
      Not in this build. Record that the holder of the item waits for something asynchronous (team session).
  --waiting-done
      Not in this build. Clear the wait of the item (team session).
  --set-review-refs PATHS
      Not in this build. Set the review references of the item (team session).
  --set-work-class CLASSES
      Replace the work classes of the item, as comma-separated classes from: ${CLASSES}.
  --set-review-classes CLASSES
      Replace the review classes of the item, as comma-separated classes from the work classes above plus code.
  --set-depends-on IDS
      Replace the dependencies of the item, as item numbers or slugs, or the word none. The command refuses when a
      named item is not in this backlog.
  --set-estimate MINUTES
      Replace the estimated minutes of work. It must be greater than 0.
  --set-complexity {low,medium,high}
      Replace the estimated complexity of the item.
  --set-layer {1,2,3,4,5,process}
      Replace the layer of the item: 1 to 5, or the word process.
  --release AGENT
      Not in this build. Give the item back, pending and unclaimed (team session).
  --request-review AGENT|any
      Not in this build. Ask an agent, or any agent, for a review (team session).
  --start-review
      Not in this build. Record that the reviewer starts the requested review (team session).
  --review {pass,changes}
      Not in this build. Record a review verdict (team session).
  --by AGENT
      Not in this build. The agent that reviews or closes the item (team session).
  --comments COMMENTS
      Not in this build. The findings of a review (team session).
  --close
      Not in this build. Complete the item after a passing review (team session).
  --dry-run
      Say what would change and change nothing: no file is written and nothing is committed.
${HELP_FLAG}

The team flags above, and a session with TEAM_REPOSITORY set, are refused with exit code 2 in this build.
On success the command prints a line that starts with a check mark, the slug and the fields it set.

${EXIT}

Example:
  backlog update 18 --status in_progress --note "Started the help text"
`,

  query: `backlog query — read the backlog of this repository: the queue, one item, the history, or the critical items

Usage:
  backlog query [--status] [--all] [--branch <name>] [--json]
  backlog query --next | --critical | --phase <item> | --events [<item>] | --by-branch <name> [--json]

Reads the backlog and never changes it. Without a view option it prints the full stack of the branch: the open
items in queue order (priority 0 is next), then the finished ones. Items that are not on the queue because their file
is gone, or because they name another repository or no branch, are reported as findings above the queue.
With --json the command prints the data itself, without any wrapper.

${SHARED}

Options:
${DB}
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
      Not in this build. Open, unclaimed items whose dependencies are done (team session).
  --reviewable
      Not in this build. Items with a requested review (team session).
  --blocked
      Not in this build. Open items that wait for dependencies that are not done (team session).
  --classes CLASSES
      Not in this build. The classes an agent covers (team session).
  --pop
      Not in this build. The one next action of an agent (team session).
  --agent AGENT
      Not in this build. The agent that asks for its next action (team session).
  --plan
      Not in this build. The dispatch plan of the team for this branch (team session).
  --lead LEAD
      Not in this build. The team lead (team session).
  --agents AGENTS
      Not in this build. The team members present (team session).
  --review-classes REVIEW_CLASSES
      Not in this build. The review classes an agent covers (team session).
  --claim-now
      Not in this build. Claim the item when the next action is to claim (team session).
  --roster ROSTER
      Not in this build. The team roster (team session).
  --scope {branch,repo,all}
      Not in this build. How far the team views look: this branch, this repository, or every repository.
  --headless
      Not in this build. Record the next-step decision without asking a question. BACKLOG_HEADLESS=1 is refused
      the same way by the human-readable --next view.
${HELP_FLAG}

The team options above are refused with exit code 2 in this build.

${EXIT}

Example:
  backlog query --status --branch main
`,

  next: `backlog next — show the next actionable item of this repository and branch

Usage:
  backlog next [--all] [--branch <name>] [--json]

Prints the open item with the lowest priority on the branch that is checked out here, with its objective, summary,
file and progress, followed by the instruction to hand the decision about the next step back to the user. It is
the same as backlog query --next and reads the backlog without changing it. When the queue is empty it says so
(with --json it prints {}). Critical items are announced in a banner first. The other options of backlog query
are described in backlog query --help; the team options are not in this build.

${SHARED}

Options:
  --all
      Show the next item over every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to show. The default is the branch that is checked out here; a detached HEAD needs
      this option or --all.
  --json
      Print the item as machine-readable data.
${HELP_FLAG}

${EXIT}

Example:
  backlog next --json
`,

  move: `backlog move — move an item to another branch, or to another repository's folder, keeping its history

Usage:
  backlog move <item> --to-branch <name> [--note <text>]
  backlog move --all-open-of-branch <from> --to-branch <to> [--note <text>]
  backlog move <item> --to-repository [<owner/name>] [--note <text>]

Moves backlog items. With --to-branch the item now belongs to that branch of this repository. With
--all-open-of-branch every open item of one branch moves to another branch, for example after the branch was
merged. With --to-repository an item that names another repository goes to the folder of that repository in the
backlog repository; without a value it goes to the repository the item names, under a new item number there.
Every move is recorded as an event in the history of the item.

${SHARED}

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
${HELP_FLAG}

Exit codes for this command: 0 moved and pushed, 1 refused (for example the item does not exist), 2 wrong place or
wrong arguments (for example neither --to-branch nor --to-repository), 3 moved locally but not pushed.

Example:
  backlog move 18 --to-branch team-cli-parity-1
`,

  archive: `backlog archive — archive a finished item by moving its file under archive/

Usage:
  backlog archive <item> [--force] [--dry-run]

Archives an item given by number or slug. The item file moves to the same path under the archive folder of this
repository's folder in the backlog repository and its status becomes archived. The command records an event and
renumbers the remaining backlog to 0..M-1, because archiving takes the item off the backlog. Archiving an item
that is already archived does nothing and says so. The command refuses when the item does not exist, or when its
status is not done and --force was not given.

${SHARED}

Argument:
  <item>
      The item to archive, by number or slug.

Options:
${DB}
  --force
      Archive the item even if its status is not done.
  --dry-run
      Say which move would happen and change nothing: no file is moved and nothing is committed.
${HELP_FLAG}

${EXIT}

Example:
  backlog archive 12
`,
};
