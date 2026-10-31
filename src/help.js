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
      Required: the item numbers or slugs that must be done first, comma-separated, or the word none. owner/name#seq names
      an item of another repository's backlog in the same backlog repository. The command refuses when a named item is
      not in this backlog, or not in the backlog repository.
  --estimate MINUTES
      The estimated minutes of work, an integer (the front matter key estimate_min). Required for team work.
  --complexity {low,medium,high}
      The estimated complexity of the item.
  --layer {1,2,3,4,5,process}
      The layer of the item: 1 to 5, or the word process.
  --team NAME
      The team that owns the item (front matter team; owner 2026-10-28): the item starts in stage refining and is claimed
      only when its refinement review passed. --split-from inherits the source's team.
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
      Replace the depends_on of the item, as item numbers or slugs, owner/name#seq for an item of another repository, or
      the word none. The command refuses when a named item is not in this backlog, or not in the backlog repository. A
      not-done item of another repository blocks the claim like one of this backlog, and pop and backlog work name it as
      the work to do first in its repository.
  --set-estimate MINUTES
      Replace the estimate_min of the item, the estimated minutes of work. It must be greater than 0.
  --set-complexity {low,medium,high}
      Replace the estimated complexity of the item.
  --set-layer {1,2,3,4,5,process}
      Replace the layer of the item: 1 to 5, or the word process.
  --set-chunk {yes,no}
      Mark the item as chunk work (small pieces any member does between items) or not.
  --wip-override REASON
      The team lead lifts the team and agent work-in-progress limits for this one item, with the reason recorded in
      the item (wip_override, wip_override_by, wip_override_at); --by <lead>. The overall, repository and branch limits
      stay: only the owner changes them, in wip-limits.json of the backlog repository.
  --severity {normal,critical}
      Change the item's severity (backlog new sets it, and starts a critical item at P0; backlog query --critical lists
      the critical items). The item does not move: change its place with --priority.
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
      The team lead sends a refined item to the refinement review (--by <lead>; Codex first, Claude only when Codex's
      5-hour limit is exceeded): stage refinement-review.
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
  --reassign-review AGENT
      The team lead only (--by <lead>, --reason "<why>"): hand the review of the item on to AGENT (not its author), for
      example a stale review; a member never takes over another agent's review.
  --reason REASON
      Why the lead reassigns or releases another agent's item or review (--reassign, --reassign-review, or
      --release AGENT --by <lead>), or rejects a hand-off (--reject-handoff).
  --release AGENT
      Give the item back, pending and unclaimed (team session). Only AGENT itself, or the team lead with --by <lead> and
      --reason, releases it.
  --request-review AGENT|any
      Ask an agent, or any agent, for a review; --note says what to review (team session). The output ends with the
      instruction to end the session now, printed after the change is published: a review request, a changes verdict
      (--review changes) and a close each end the agent's session, so its next task starts in a fresh one (not for the
      team lead). A review request or a close by a member of the item's team that holds no other active item also writes
      the hand-off marker ~/.qwen/teams/<team>/handoff/<agent>.json before the change: a marker that cannot be written
      refuses the change, and a change that is not published leaves no marker. Until Qwen registers a newer session of
      that agent, its backlog pop and backlog work answer stop, and its --claim, --refine-start and --start-review are
      refused.
  --start-review
      Record that the agent named by --by starts the requested review (review_state in_review, reviewer and review_started are
      set). Other agents skip it unless the review was started more than 20 minutes ago (team session).
  --review {pass,changes}
      Record a review verdict; it needs --by and --comments (team session).
  --handoff DEPENDENT
      The producer records its hand-off for DEPENDENT, one of the item's dependents; only the item's claimer does
      (--by <you> or the claim). It replaces any earlier hand-off for the same dependent, which makes an earlier
      receipt of the team lead stale. It needs --handoff-commit, --handoff-contract and --handoff-verification.
  --handoff-commit COMMIT
      The 40-hex commit id the hand-off is pinned to. Required with --handoff.
  --handoff-contract CONTRACT
      The contract of the hand-off, in text. Required with --handoff.
  --handoff-verification VERIFICATION
      How the hand-off is verified, in text. Required with --handoff.
  --handoff-outputs OUTPUTS
      The outputs of the work the hand-off carries. Optional with --handoff.
  --handoff-pickup PICKUP
      How the dependent picks the work up. Optional with --handoff.
  --handoff-risks RISKS
      The open risks of the hand-off. The default is NONE. Optional with --handoff.
  --accept-handoff DEPENDENT
      The team lead accepts the producer's hand-off for DEPENDENT. It needs --by <lead> and --checks
      "<what was checked>"; the producer's review must have passed. It records a receipt that pins the current
      hand-off record; a re-recorded hand-off makes it stale.
  --reject-handoff DEPENDENT
      The team lead rejects the producer's hand-off for DEPENDENT. It needs --by <lead> and --reason "<why>"; it
      records a receipt that pins the current hand-off record.
  --checks CHECKS
      The checks the team lead did before accepting a hand-off (--accept-handoff).
  --by AGENT
      The agent that reviews (--start-review, --review), refines (--refine-start, --refine-done), requests or records the
      refinement review, records the hand-off (--handoff) or accepts or rejects one (--accept-handoff,
      --reject-handoff), or closes (--close) the item (team session).
  --comments COMMENTS
      The review findings (--review); they must cite one of the review references of the item (team session).
  --close
      Complete the item; --summary says what was delivered. It needs a passing review when the item has review documents (review_refs) (team session).
      Only the claimer closes its item, else the team lead (--by <lead>); never the reviewer.
  --dry-run
      Say what would change and change nothing: no file is written and nothing is committed.
${HELP_FLAG}

A call takes at most one team step (--claim, --release, --request-review, --start-review, --review, --close, --waiting,
--waiting-done, --handoff, --accept-handoff, --reject-handoff).
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
  backlog query --claimable | --reviewable | --blocked | --decisions [--agent <name>] [--roster <file>] [--scope branch|repo|all] [--json]
  backlog query --pop --agent <name> [--lead <name>] [--roster <file>] [--scope branch|repo|all] [--claim-now] [--json]

Reads the backlog and never changes it, except that --pop with --claim-now claims an item. Without a view option it prints the full stack of the branch: the open
items in queue order (priority 0 is next), then the finished ones. Items that are not on the queue because their file
is gone, or because they name another repository or no branch, are reported as findings above the queue.
With --json the command prints the data itself, without any wrapper.

${SHARED}

Options:
  --next
      The next actionable item: the open item with the lowest priority on the branch. When the queue is empty the
      command says so (with --json it prints {}). Open items of a branch that no longer exists on the origin
      are in no queue.
  --status
      The full stack of the branch (this is the default view). With --json each row also carries claimed_by and
      review_state, from the item's front matter ('' when unset).
  --critical
      Only the open items with severity critical.
  --phase PHASE
      One item, given by number or slug, or several as a comma-separated list (a JSON array). The command refuses when
      one does not exist. Each item is shown whole: its row, front_matter, body, and missing (the team fields it lacks:
      review_refs, depends_on, estimate_min, definition_of_done; [] when complete; null when the item's file is
      gone or holds no item: no front matter, or an empty one; a file that cannot be read or parsed fails the
      command, as every read does).
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
      work (chunk: true, with --scope all); with TEAM_NAME set, only that team's items of this repository (team session).
  --reviewable
      Items with a requested review that --agent may start or continue: any member but the author reviews (team session).
  --blocked
      Open items that wait for dependencies that are not done, with the status and holder of each dependency (team session).
  --decisions
      The items that wait in stage review-hitl for an owner decision, each with its question, for the morning report; with
      --all every branch. Answer one with backlog update <item> --decision "<answer>".
  --wip
      The work in progress of the whole backlog repository against its limits (wip-limits.json at its top folder:
      overall, repository, branch, team, agent, each a number or {"default": n, "<key>": n} with the key owner/name, the
      owner/name:branch, the team or the agent, and stale_hours), and the items in progress without a change of their own
      for longer than stale_hours (default 48). A claim or a
      refinement start past a limit is refused, naming the limit and the items holding it.
  --pop
      The one next action of the agent named by --agent: continue, review, refine, claim, refinement-review, reassign-review,
      stop, chunk or idle
      (exit code 3, with the blockers named) (team session).
      It is the same as backlog pop; see backlog pop --help. With --next, --agent does the same.
  --agent AGENT
      The agent that asks. With --claimable or --reviewable it also switches to team rules: an incomplete item is not offered
      and the agent never reviews its own work. With --pop it is the agent whose next action is answered (team session).
      With --phase the agent has read that item (or each of a comma-separated list, printed as a JSON array): its next
      write of it is checked against that version. A change of an item's rank alone (another agent's move or reflow)
      never makes the agent's view stale; a change of its content does, and the refusal names every such item of the
      write in one backlog query --phase <a>,<b> command.
  --plan
      The dispatch plan of the team for this branch: at most one action per member (respond, close, review, claim, and for
      the team lead refine or reassign-review), each item to one member, with the reason and a dispatch key; the members
      are the roster's (--roster, else TEAM_ROSTER). Entries come by action (respond and close, review, claim, refine), a
      claim to the member holding the fewest items, then in roster order (team session). Read-only.
  --lead LEAD
      With --pop or --plan: the team lead, who alone refines incomplete items outside the refinement stages and never claims an execution item. The default
      is the environment variable TEAM_LEAD, else cody (team session).
  --agents AGENTS
      With --plan: the team members present, comma-separated; the default is the whole roster (team session).
  --claim-now
      With --pop: claim the item when the next action is to claim (team session).
  --roster ROSTER
      With --pop and --plan: the team roster as a JSON file {agent: {...}}, the team's members in order; the default is the
      file named by TEAM_ROSTER.
      Any member but the author may review an item; a member with "review_only": true never claims (team session).
  --scope {branch,repo,all}
      With --pop, --claimable, --reviewable and --blocked, how far the view looks: this branch (the default), every branch of this repository, or also the chunk items
      of every repository. The widest scope for chunk items is capped by the line refinement_scope: off|branch|repo|all
      in the file backlog.scope of the folder of this repository (default branch).
  --headless
      Not in this build. Record the next-step decision without asking a question. BACKLOG_HEADLESS=1 is refused
      the same way by the human-readable --next view.
${HELP_FLAG}

The option --headless is refused with exit code 2 in this build.

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
started), refine (a member: the refinement it has started, or the first-round refinement of a team item in stage
refining that nobody refines; the team lead: an incomplete item that lacks required fields), claim (the open item with the
lowest priority whose dependencies are done, that is no chunk item, is in stage ready when it has a team, and that nobody
holds), refinement-review (the team lead: refined items to send to the refinement review), reassign-review (the team
lead: a stale review of its team to hand on), stop (a member that handed its item off and waits for a fresh session: end
the turn), chunk (a small piece
of refinement work of at most ten minutes) or idle. An item the agent holds that waits for a verdict or for a run is not
continued, and the agent claims a new item only when every item it holds waits. Another agent's review request comes
after the agent's own work, however old it is. Incomplete items are never claimed or
reviewed. With TEAM_NAME set (the team runner sets it), only that team's items of this repository are continued, reviewed
or claimed. The team lead never claims; while its team works the split items, its work item is no busy continue and its
answer is idle with the instruction to end the turn without polling (a passed or changes-requested item of the lead's keeps
its close or rework), and when every item of its team is done it is told to have the work item reviewed and close it.
When nothing is left the action is idle, the blockers are named, and the command exits with 3 (see the exit codes below).

Without --json the first line is the action and the item, the second line says what to do, and one line per blocked item
follows. With --json the command prints one object with the keys action, item, seq, repository, branch, instruction,
claimed, blocked and held (and missing when the action is refine). backlog next --agent <name> and backlog query --pop
print the same.

${SHARED}

Options:
  --agent AGENT
      The agent that asks. Required.
  --lead LEAD
      The team lead, who alone refines incomplete items outside the refinement stages and never claims an execution item. The default is the environment
      variable TEAM_LEAD, else cody.
  --roster ROSTER
      With --pop and --plan: the team roster as a JSON file {agent: {...}}, the team's members in order; the default is the
      file named by TEAM_ROSTER.
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
  work: `backlog work — the one next-work command of a team member: the next action, marked as yours, with the whole item

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
${HELP_FLAG}

Exit codes:
  0  The command answered with an action, and the item is marked as yours where the step needs it.
  3  The action is idle: nothing is left for you (the blockers are named).
  1  The mark was refused (another agent took the item meanwhile) or could not be run: its output is shown.
  2  The arguments or the place were wrong: the message is on standard error.
  4  The backlog repository is not set up; the printed question must be answered by the user.

Example:
  backlog work --agent archy --json
`,

  team: `backlog team pop — the team lead takes its team's next work item, with the whole item

Usage:
  backlog team pop --team <name> [--agent <lead>] [--json]

A work item of a team is an item of this repository and branch (in a team session the ones it is bound to,
TEAM_REPOSITORY and TEAM_BRANCH, as for every command) whose front matter team is the team's name and that has
no stage (backlog update <item> --set-team <name> gives an item to a team; the items split from it carry a stage and are
the members' work). When the lead holds an open work item of the team, the answer is continue with that item. Otherwise
the command claims for the lead the team's first open, unclaimed work item in the work order (priority, then seq) whose
claim backlog update --claim accepts (its dependencies are done, no work-in-progress limit is passed), and the answer
is claim. The output is the action, the one instruction (refine and split the item with the team), the items not taken
with the reason, and the whole item: its front matter and its body. When there is no work item to take, the action is
idle and the command exits with 3. Only the team lead runs it.

Options:
  --team NAME
      Required: the team whose work item to take. In a team session (TEAM_NAME set) it must be that team.
  --agent AGENT
      The team lead. The default is the environment variable TEAM_LEAD, else cody; any other agent is refused.
  --json
      Print one object: action, item, team, repository, branch, instruction, skipped ({item, reason} of each item not
      taken), front_matter and body.
${HELP_FLAG}

Exit codes:
  0  continue or claim: the lead holds the item.
  1  A command it ran failed for another reason than a refused claim, a synchronisation failure included (the reason
     is printed), or the item changed before it could be shown: run it again.
  2  Invalid input: a missing --team, an agent other than the lead, another team than TEAM_NAME, or no branch (a
     detached HEAD without TEAM_BRANCH).
  3  idle: no work item of the team to take.

Example:
  backlog team pop --team cli-1 --json
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
  --force
      Archive the item even if its status is not done.
  --dry-run
      Say which move would happen and change nothing: no file is moved and nothing is committed.
${HELP_FLAG}

${EXIT}

Example:
  backlog archive 12
`,
  setup: `backlog setup — point this repository at the shared backlog repository and deploy the backlog skill into it

Usage:
  backlog setup [--ask]

Run inside the git repository to set up; works in local and shared mode. The command:
  1. finds the backlog repository path: the one in .smooth-backlog.json at the repository's top folder, else
     ../smoothsdlc-backlog (the clone beside the repository); with --ask it asks for the path, showing that default;
  2. clones the backlog repository there with git when the path does not exist (from BACKLOG_ORIGIN_URL, default
     https://github.com/SmoothSDLC/smoothsdlc-backlog.git); an existing clone is left as it is;
  3. writes .smooth-backlog.json {"backlog_repository": "<path relative to the repository>"} when there is none, or
     with --ask; otherwise keeps it. Commit it, so every clone of the repository finds the backlog repository, also
     after the repository and the clone move together;
  4. replaces the backlog skill in every agent folder present (.agents, .claude, .github, .qwen) with this release's;
  5. switches on shared mode.

Every shared-mode command finds the backlog repository in this order: BACKLOG_HOME, .smooth-backlog.json, the
per-user record of --use-backlog-repo, ~/git/smoothsdlc-backlog. When none is there the command names backlog setup.

Options:
  --ask
      Ask for the backlog repository path on standard input; an empty answer takes the default shown.
${HELP_FLAG}
Exit codes: 0 done; 2 a usage error or a folder that is no clone of the backlog repository; 3 the clone failed.

Example:
  backlog setup
`,
};
