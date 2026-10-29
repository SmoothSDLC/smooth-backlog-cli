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
  3  The local clone of the backlog repository could not be synchronised with its origin. Either the update before the
     command failed: then nothing was read or changed, and the command can be run again once the cause is fixed. Or the
     change was not published and was rolled back: fix the cause and retry the command. Existing unpublished commits
     are refused before any change; the message lists them and gives explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when. Read the item again, then repeat the command. An item this agent never read is written
     without the check (its first write).`;

const DB = `  --db DB
      Not in this build. The Python scripts use this flag for an internal database path; the shared mode always
      reads and writes the backlog database in the folder of this repository.`;

const HELP_FLAG = `  --help
      Print this text and exit. Nothing is read or changed.`;


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
  --chunk
      Chunk work: small pieces any member does between items (the front matter key chunk: true).
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
      Take the item for an agent (team session). The command refuses when another agent holds the item or when an item
      in its depends_on is not done; otherwise the item becomes in progress and claimed by that agent.
  --force
      Together with --claim: claim although the agent already holds active items.
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
  --release AGENT
      Give the item back, pending and unclaimed (team session).
  --request-review AGENT|any
      Ask an agent, or any agent, for a review; --note says what to review (team session).
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
${HELP_FLAG}

A call takes at most one team step (--claim, --release, --request-review, --start-review, --review, --close, --waiting, --waiting-done).
A session with TEAM_REPOSITORY (and TEAM_BRANCH) set works only on items of that repository and branch: every change to another item is refused, field edits and --append as much as team steps.
On success the command prints a line that starts with a check mark, the slug and the fields it set.

${EXIT}

Example:
  backlog update 18 --status in_progress --note "Started the help text"
`,

  query: `backlog query — read the backlog of this repository: the queue, one item, the history, or the critical items

Usage:
  backlog query [--status] [--all] [--branch <name>] [--json]
  backlog query --next | --critical | --phase <item> | --events [<item>] | --by-branch <name> [--json]
  backlog query --claimable | --reviewable | --blocked [--agent <name>] [--roster <file>] [--scope branch|repo|all] [--json]
  backlog query --pop --agent <name> [--lead <name>] [--roster <file>] [--scope branch|repo|all] [--claim-now] [--json]

Reads the backlog and never changes it, except that --pop with --claim-now claims an item. Without a view option it prints the full stack of the branch: the open
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
      Open, unclaimed items whose dependencies are all done, in priority order; another repository's items only as chunk
      work (chunk: true) (team session).
  --reviewable
      Items with a requested review that --agent may start or continue: any member but the author reviews (team session).
  --blocked
      Open items that wait for dependencies that are not done, with the status and holder of each dependency (team session).
  --pop
      The one next action of the agent named by --agent: continue, review, claim, refine, chunk or idle (exit code 3, with the
      blockers named) (team session).
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
${HELP_FLAG}

The options --plan, --agents and --headless are refused with exit code 2 in this build.

${EXIT}

With --pop, and with --next and --agent, the exit codes are those of backlog pop (see backlog pop --help): 0 the command
answered with an action, 3 the action is idle (3 is also used when the local clone could not be updated before the answer, or a --claim-now claim could not be pushed),
1 a --claim-now claim was refused or could not run, 2 the arguments or the place were wrong, 4 the backlog repository is
not set up.

Example:
  backlog query --status --branch main
`,

  next: `backlog next — show the next actionable item of this repository and branch

Usage:
  backlog next [--all] [--branch <name>] [--json]

Prints the open item with the lowest priority on the branch that is checked out here, with its objective, summary,
file and progress, followed by the instruction to hand the decision about the next step back to the user. It is
the same as backlog query --next and reads the backlog without changing it. When the queue is empty it says so
(with --json it prints {}). Critical items are announced in a banner first. With --agent <name> it is the pop of
that agent instead, see backlog pop --help. The other options of backlog query are described in backlog query --help.

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

With --pop, and with --next and --agent, the exit codes are those of backlog pop (see backlog pop --help): 0 the command
answered with an action, 3 the action is idle (3 is also used when the local clone could not be updated before the answer, or a --claim-now claim could not be pushed),
1 a --claim-now claim was refused or could not run, 2 the arguments or the place were wrong, 4 the backlog repository is
not set up.

Example:
  backlog next --json
`,

  pop: `backlog pop — ask what one agent does next: the one next action, first match wins

Usage:
  backlog pop --agent <name> [--lead <name>] [--roster <file>]
              [--scope branch|repo|all] [--all] [--branch <name>] [--claim-now] [--json]

Answers with exactly one action for the agent, the first that applies: continue (an item the agent holds and can work
on; when its review passed, close it), review (an item another agent asks to have reviewed, or a review the agent
started), claim (the open item with the lowest priority whose dependencies are done, that is no chunk item and that nobody
holds), refine (the team lead only: an incomplete item that lacks required fields), chunk (a small piece
of refinement work of at most ten minutes) or idle. An item the agent holds that waits for a verdict or for a run is not
continued, and the agent claims a new item only when every item it holds waits. A review request older than
BACKLOG_REVIEW_FIRST_SECONDS (300) is answered before the agent's own work. Incomplete items are never claimed or
reviewed. When nothing is left the action is idle, the blockers are named, and the command exits with 3 (see the exit codes below).

Without --json the first line is the action and the item, the second line says what to do, and one line per blocked item
follows. With --json the command prints one object with the keys action, item, seq, repository, branch, instruction,
claimed, blocked and held (and missing when the action is refine). backlog next --agent <name> and backlog query --pop
print the same.

${SHARED}

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
${HELP_FLAG}

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
wrong arguments (for example neither --to-branch nor --to-repository), 3 the update of the local clone failed before
the move (nothing was changed), or the move was not published and was rolled back.

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
