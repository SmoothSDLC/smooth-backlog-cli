// Help text: USAGE is what `backlog --help` prints; HELP[command] is what `backlog <command> --help` prints
// (src/shared/router.js) and what COMMANDS.md repeats. The text is written in plain, complete sentences so that the
// skill instructions can be rewritten around it.
// Layout the tests rely on: a flag is a line " --flag ARG" followed by description lines indented by six spaces.

const SHARED = `Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
BACKLOG_RUN_HOOK names an executable, and no child process when the variable is unset.`;

export const USAGE = `backlog — the backlog of this repository and branch, for people and coding agents

Usage:
  backlog [--json]                                 The next item (backlog next)
  backlog new --name <text> [options]              Add an item; --split-from <item> makes a sibling with its context
  backlog update <item> [options]                  Change an item: fields, body, status, priority; claim, release, review, close; team steps
  backlog update --replan "<id,id,...>"            Set the order of the queue
  backlog query [options] [--json]                 The queue; --phase <item> one item; --events, --by-branch, --all; the team views
  backlog list [options] [--json]                  The same as backlog query
  backlog next [--all] [--branch <name>] [--json]  The next item of this repository and branch
  backlog pop --agent <name> [options]             What one agent does next
  backlog work --agent <name> [options]            A team member's next work, marked as theirs, with the whole item
  backlog team pop --team <team> --agent <lead>    The team lead takes its team's work item
  backlog move <item> --to-branch <name>           Move an item to another branch (or --to-repository)
  backlog archive <item> [--force] [--dry-run]     Archive a finished item
  backlog setup [--ask]                            Point this repository at its backlog folder and deploy the backlog skill
  backlog <command> --help                         Every option of the command, what it does, and an example
  backlog --version

An item is its number (1) or its slug (001-fix-the-login-redirect). Priorities are ranks: P0 is next, the queue runs
without gaps and is renumbered when work is added, moved or finished.

The backlog is always a git repository, and every change to it is committed and pushed before the command exits. Where
the items live is configuration and changes no command: the repository's .backlog folder holds the configuration
(.backlog/config.json, written by backlog setup or on first use) and, by default, the items themselves (committed on
the current branch and pushed to origin); the configuration can name a clone of a backlog repository shared by many
repositories and people instead (BACKLOG_ORIGIN_URL names it; BACKLOG_HOME may point at the clone). Environment
variables override the configuration.

Who: BACKLOG_AGENT names the agent running the command (--by, --claim and --agent name one explicitly); every change
records who made it and when. A write to an item that someone else changed since this agent last read it is refused
(exit 5) until the agent reads it again (backlog query --phase <item>).

Teams: items of a team follow the team rules - refinement before work, the team's review rules before the close,
work-in-progress limits (wip-limits.json). Teams, their leads and members and their review rules are configuration in
the backlog folder (teams.json); a team session is bound by TEAM_NAME, TEAM_REPOSITORY and TEAM_BRANCH. An item
without a team is not bound by them.

Exit codes: 0 success; 1 refused (the reason on standard output, ❌ ...); 2 invalid input or a failure; 3 idle (pop,
work, team pop: nothing to do now); 4 the configured backlog repository is not cloned (run backlog setup); 5 stale view.
`;

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

Adds or splits an item. The item gets the next free item number, is added to the backlog of this repository in the
backlog repository, and the whole backlog is renumbered so that the priorities run from 0 without gaps. An item is
named by its number or by its slug, for example 018-help-text, and the output names it the same way.
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
      the item does not exist. In a team session the sibling starts in stage refining and takes its refinement review
      before it may be claimed; outside a team it is a plain item.
  --body BODY
      The initial body of the item, the hand-over content for whoever does it. When the body has no "Definition of
      done" heading or line with checkable lines, a placeholder checklist is added. With --review-refs, or in a team
      session, the body must hold a real definition of done.
  --review-refs REVIEW_REFS
      How the item is reviewed: comma-separated paths of review documents. A verdict cites one of them when the item
      has any. A team's item closes when the review rules of its team (teams.json in the backlog folder) are met.
  --depends-on DEPENDS_ON
      The item numbers or slugs that must be done first, comma-separated, or the word none (the default). owner/name#seq names
      an item of another repository's backlog in the same backlog repository. The command refuses when a named item is
      not in this backlog, or not in the backlog repository.
  --estimate MINUTES
      The estimated minutes of work, an integer (the front matter key estimate_min). Required for team work.
  --complexity {low,medium,high}
      The estimated complexity of the item.
  --layer {1,2,3,4,5,process}
      The layer of the item: 1 to 5, or the word process.
  --team NAME
      The team that owns the item (front matter team): the item starts in stage refining and is claimed
      only when its refinement review passed. --split-from inherits the source's team.
  --chunk
      Chunk work: small pieces any member does between items (the front matter key chunk: true).
  --force
      Write the item even when an item of that name already exists. Without it the command refuses.
  --dry-run
      Say which item would be created and change nothing: nothing is written and nothing is committed.
${HELP_FLAG}

On success the command prints a line that starts "created phase" with the item's slug, the item number and the rank
the item now has, and a line about the renumbered backlog. A critical item is announced in a banner first.

${EXIT}

Example:
  backlog new --name "Fix login" --objective "An expired cookie no longer blocks sign-in" --summary "Login cookie handling" --depends-on none
`,

  update: `backlog update — change the fields of one item, move it in the queue, or re-plan the whole backlog

Usage:
  backlog update <item> [options]
  backlog update --replan <item>,<item>,... [--note <text>]

Changes the item named by its number or slug. The item file is the source of truth: the command writes the file,
records an event in the history of the item. Setting --status to
done completes the item (its completion time is set) and renumbers the rest of the backlog; so does --priority.
Both are planning events, so look at the order again afterwards. The item may be left out only together with
--replan.
The two retired classification keys of older items have no effect. An item that still carries them shows them until the CLI next writes that item; every write drops them.

${SHARED}

Options:
  --status STATUS
      The new status of the item. Open items are pending or in_progress, a finished item is done. Setting done
      completes the item and is a close: for a team's item it is refused until the review rules of the team
      (teams.json) are met for the item's current work commit, and the refusal names the unmet rule. The owner closes
      without a review with --close --by owner.
      The hand-off rule of --close applies too: done is refused until each dependent's hand-off is recorded and
      accepted; an item without dependents records handoffs: none; an item already done is not checked again.
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
      and renumbers the backlog to 0..M-1; the order itself is the record, no event is written. No item argument is
      given with it.
  --note NOTE
      The note for the event log. Without it the log records which fields were set.
  --claim AGENT
      Take the item for an agent (team session). The command refuses when another agent holds the item, when an item
      in its depends_on is not done, or when a split item (with or without a team) or a team's item is not in stage
      ready (its refinement review has not passed). A team item without a stage (a team's work item, or one written
      before the stage field existed) is unrefined, stage refining: only the team lead's own claim of its team's work
      item (backlog team pop, to split it; never a split slice) is accepted; for every other agent the refusal names --refine-start. An
      item without a team and without the split marker has no stage (solo work) and is claimable;
      otherwise the item becomes in progress and claimed by that agent. An agent or team name may contain letters,
      digits, a period, an underscore, a hyphen and a colon (a session counter after a colon, as in worker:3, names a session of that worker);
      the name works in the front matter, the event log, the commit subject and
      every --claim, --release and --by value. The claiming session joins the item's session_authors list; the
      sessions in that list, and the one who asked for the review, never review the item. A new session of the same
      card - a name sharing the <item><card> part before the colon - continues an item its earlier session claimed
      (a rework after a review, or the close): the claim records the new session name on the item, with no takeover
      and no lead reassignment.
  --force
      Together with --claim: claim although the agent already holds active items (never before stage ready).
  --waiting WHAT
      Record that the holder of the item (named with --by) waits for something asynchronous, for example a workflow run or a
      deployment. The wait is cleared by the next --note, --review, --close or --request-review of the item, or by
      --waiting-done (team session).
  --waiting-done
      Clear the wait of the item (team session).
  --set-review-refs PATHS
      Set the review_refs of the item (its definition of done), as comma-separated paths in the review-documents repository.
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
      A team member starts refining the item (--by <agent>): only a team's item in stage refining, or without a stage (unrefined),
      that nobody claims or already refines. A split slice without a team joins the refining session's team (TEAM_NAME) here. The stages
      before any work are refining, refined, refinement-review and ready.
  --refine-done
      The refiner finished (--by <the refiner>, --note "<what you refined>"): stage refined. Refused while a team field or
      the definition of done is missing.
  --request-refinement-review
      The team lead sends a refined item to the refinement review (--by <lead>): stage refinement-review.
  --refinement-review {pass,changes}
      Record the refinement verdict, --by <reviewer> with --comments "<findings; thread or session id>": pass makes the
      item ready, changes sends it back to refining. The reviewer is a member of a team the refinement_review rule of
      the item's team names (teams.json); without such a rule, anyone.
  --request-decision QUESTION
      The item needs an owner decision (--by <agent>): stage review-hitl, the question is written in the item (what, why,
      how it came up, the options and a recommendation). Nobody claims it, or an item that depends on it, until the answer.
  --decision ANSWER
      The owner's answer to the item's question: written in the item as DECISION <date>: <answer>, and the item goes back
      to stage refining, where the lead re-refines it with the decision.
  --reassign AGENT
      The team lead only (--by <lead>, --reason "<why>"): take the item from the agent that holds it and give it to AGENT.
      The former holder stays in the item's session_authors list (the new holder joins), so the self-review block
      survives the hand-off. In a team session (TEAM_NAME set, BACKLOG_AGENT=<name>) a member acts only as itself: its
      claim, release, refinement, review and close of an item name itself, never another agent.
  --reassign-review AGENT
      The team lead only (--by <lead>, --reason "<why>"): hand the review of the item on to AGENT (not its author), for
      example a stale review; a member never takes over another agent's review.
  --reason REASON
      Why the lead reassigns or releases another agent's item or review (--reassign, --reassign-review, or
      --release AGENT --by <lead>), or rejects a hand-off (--reject-handoff).
  --release AGENT
      Give the item back, pending and unclaimed (team session). Only AGENT itself, or the team lead with --by <lead> and
      --reason, releases it. The release keeps the holder in session_authors (seeded for an item written before the
      list existed), so the holder's self-review block stands.
  --request-review AGENT|any
      Ask an agent, or any agent, for a review; --note says what to review (team session). The output ends with the
      instruction to end the session now, printed after the change is published: a review request, a changes verdict
      (--review changes) and a close each end the agent's session, so its next task starts in a fresh one (not for the
      team lead).
  --start-review
      Record that the agent named by --by starts the requested review (review_state in_review, reviewer and review_started are
      set). Other agents skip it unless the review was started more than 20 minutes ago (team session). The self-review rule
      is per session: the session that claimed the item or asked for the review (recorded in session_authors, kept on
      release like review_author) is refused with "the same session cannot review its own work; a new session may"; a new
      session, with a new name, may start the review (team session). Every claim, reassign, release and review request
      seeds the list from the item's current holder and review requester, so an item written before the list existed
      keeps the self-review block of its earlier sessions.
  --review {pass,changes}
      Record a review verdict; it needs --by and --comments. A pass is recorded against the item's work commit
      (work_commit) - the requester's HEAD at its review request (--request-review records it; a later request after a
      pass keeps it) - so the reviewer's checkout and other items' commits on the branch move nothing; the item's own
      new work (a later commit whose subject names the item as a producer at the start - the item number alone, or
      joined with another item's number by "and") moves the work commit, so the review runs again; a close or
      --status done whose commit lookup fails is refused fail closed, and the refusal records the reason. A changes
      verdict clears every recorded pass and sends the item back to work. A team's item closes when the review rules
      of its team (teams.json: each rule names a team and how many of its members must pass) are met for the current
      work commit; a reviewer never reviews in the author's session; an item without a team needs no rule.
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
      Complete the item; --summary says what was delivered. A team's item closes when the review rules of its team
      (teams.json) are met for the item's current work commit; the refusal names the unmet rule. Outside a team the
      person or agent running the command closes it. The owner closes without a review on a written decision
      (--by owner --reason "<the decision>"), recorded as an owner decision, even for a team item still in its
      refinement stages (team session). Only the claimer closes its item, else the team lead (--by <lead>);
      never the reviewer. An item that other items depend on closes only when each dependent's hand-off is recorded
      and accepted (--handoff, then the lead's --accept-handoff); the refusal lists every open dependent, the state
      of its hand-off and the next command. An item without dependents closes and records handoffs: none. An item
      already done is not checked again.
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
  backlog query --changed [--agent <name>] [--json]

Reads the backlog and never changes it, except that --changed advances
the agent's own last-use reference (its record of its own use, not an item). Without a view option it prints the full stack of the branch: the open
items in queue order (priority 0 is next), then the finished ones. Items that are not on the queue because they name
another repository or no branch are reported as findings above the queue.
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
      The history of the items, kept in the item files. With an item (number or slug) it prints the events of that
      item, newest first; without one it prints the latest 50 events of the backlog, archived items included.
  --by-branch BY_BRANCH
      The items recorded on this branch.
  --changed
      Which items of this repository changed since your last use: your own write or your own --changed is
      the reference (its commit and time, stated in every result, also when it is empty), never a global
      timestamp, so a change made while you are idle still appears in your next report; your own reads
      (query --phase, pop) do not move it. The first --changed prints "no earlier use: reference set now"
      and sets the reference. The items you hold (your name in claimed_by, reviewer or refiner) are listed
      in a "held" section; every other changed item goes to "others"; a file moved inside the folder (an
      archive, a renumbering) is one "D" entry for its old name. When the comparison fails (your reference
      commit is no longer in the clone, for example after a history rewrite), the command reports the
      failure (exit 2) and keeps your reference, so the change is not lost. The report is printed before
      the reference is written, so a failed output consumes no change (the same changes repeat in the
      next report); on a first use the report is empty and the write happens first, so the result states
      exactly what was stored. When the write of your reference fails, the result says so and keeps the
      previous reference: a failed first use prints "no earlier use: the reference could not be set"
      (with --json the reference is null), and a failed write after an earlier use says so in the text
      and, with --json, prints the line {"reference_write": "failed"} after the report (the exit is 0).
      The result also lists the agents that use the backlog (those with a reference point in this clone)
      and their last-use time.
  --json
      Print machine-readable output.
  --all
      Show --next or --status for every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to show. The default is the branch that is checked out here; a detached HEAD needs
      this option or --all.
  --claimable
      Open, unclaimed items whose dependencies are all done, in priority order (a team item before stage ready, or without a stage, is not claimable: it is refined first); another repository's items only as chunk
      work (chunk: true, with --scope all); with TEAM_NAME set, only that team's items of this repository (team session).
  --reviewable
      Items with a requested review that --agent may start or continue: a session that did not claim the item and did
      not ask for the review (the sessions in session_authors) reviews; a new session of the same card may (team session).
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
  --agent AGENT
      The agent that asks. With --claimable or --reviewable it also switches to team rules: an incomplete item is not offered
      and the agent never reviews its own work.
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
      With --plan: the team lead, who alone refines incomplete items outside the refinement stages and never claims an execution item. The default
      is the environment variable TEAM_LEAD, else the lead of the session's team in teams.json (team session).
  --agents AGENTS
      With --plan: the team members present, comma-separated; the default is the whole roster (team session).
  --roster ROSTER
      With --plan: the team roster as a JSON file {agent: {...}}, the team's members in order; the default is the
      file named by TEAM_ROSTER.
      Any session may review an item except the sessions recorded on it (session_authors: the claimer and the one who
      asked for the review, kept on release); a new session of the same card may review it. A member with "review_only":
      true never claims (team session).
  --scope {branch,repo,all}
      With --claimable, --reviewable and --blocked, how far the view looks: this branch (the default), every branch of this repository, or also the chunk items
      of every repository. The widest scope for chunk items is capped by the line refinement_scope: off|branch|repo|all
      in the file backlog.scope of the folder of this repository (default branch).
${HELP_FLAG}

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
(with --json it prints {}). Critical items are announced in a banner first. The other options of backlog query are described in backlog query --help.

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

  pop: `backlog pop — ask what one agent does next: the one next action, first match wins

Usage:
  backlog pop --agent <name> [--lead <name>] [--roster <file>]
              [--scope branch|repo|all] [--all] [--branch <name>] [--claim-now] [--json]

Answers with exactly one action for the agent, the first that applies: continue (an item the agent holds and can work
on; when its review passed, close it), review (an item another agent asks to have reviewed, or a review the agent
started), refine (a member: the refinement it has started, or the first-round refinement of a team item in stage
refining that nobody refines; the team lead: an incomplete item that lacks required fields), claim (the open item with the
lowest priority whose dependencies are done, that is no chunk item, is in stage ready when it is a split item
(with or without a team) or a team's item (a team item without a stage is unrefined: its refinement is offered, never a claim), and that nobody holds), refinement-review (the team lead: refined items to send to the
refinement review), reassign-review (the team
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
claimed, blocked and held (and missing when the action is refine).

${SHARED}

Options:
  --agent AGENT
      The agent that asks. Required.
  --lead LEAD
      The team lead, who alone refines incomplete items outside the refinement stages and never claims an execution item. The default is the environment
      variable TEAM_LEAD, else the lead of the session's team in teams.json.
  --roster ROSTER
      The team roster as a JSON file {agent: {...}}, the team's members in order; the default is the
      file named by TEAM_ROSTER.
      Any session may review an item except the sessions recorded on it (session_authors: the claimer and the one who
      asked for the review, kept on release); a new session of the same card may review it. A member with "review_only":
      true never claims.
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
  backlog pop --agent ada --json
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
      The team lead. The default is the environment variable TEAM_LEAD, else the lead of the session's team in teams.json.
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
  backlog work --agent ada --json
`,

  team: `backlog team pop — the team lead takes its team's next work item, with the whole item

Usage:
  backlog team pop --team <name> [--agent <lead>] [--json]

A work item of a team is an item of this repository and branch (in a team session the ones it is bound to,
TEAM_REPOSITORY and TEAM_BRANCH, as for every command) whose front matter team is the team's name and that has
no stage (backlog update <item> --set-team <name> gives an item to a team; the items split from it carry a stage and are
the members' work). A refined work item (its stage set, its refinement review passed) is an ordinary item any member
may claim; team pop offers a work item only while its stage is unset, and the lead still refines it and splits it
only when it is too big for one member. When the lead holds an open work item of the team, the answer is continue with that item. When an
earlier session of the lead's card holds it, the command records the continuation claim first - the new session name as
claimed_by and in session_authors - and then answers continue. A refused continuation claim is no success: the earlier
session keeps holding, and the command stops (exit 1, the reason on standard error). The final read requires the lead's
own session still holding the item, on every path: a hand-back or a reassignment to another session of the same card
between the selection and the final read is no success - the command stops (exit 1, the item changed before it could be
shown) and the other session keeps holding. Otherwise the command claims for
the lead the team's
first open, unclaimed work item in the work order (priority, then seq) whose claim backlog update --claim accepts (its
dependencies are done, no work-in-progress limit is passed), and the answer is claim. The output is the action, the one instruction (refine the item, split it only when it is too big for one member), the items not taken
with the reason, and the whole item: its front matter and its body. When there is no work item to take, the action is
idle and the command exits with 3. Only the team lead runs it.

Options:
  --team NAME
      Required: the team whose work item to take. In a team session (TEAM_NAME set) it must be that team.
  --agent AGENT
      The team lead. The default is the environment variable TEAM_LEAD, else the lead of the session's team in teams.json; any other agent is refused.
  --json
      Print one object: action, item, team, repository, branch, instruction, skipped ({item, reason} of each item not
      taken), front_matter and body.
${HELP_FLAG}

Exit codes:
  0  continue or claim: the lead holds the item.
  1  The continuation claim was refused (the earlier session keeps holding), a command it ran failed for another reason
     than a refused claim, a synchronisation failure included (the reason is printed), or the item changed before it
     could be shown (a hand-back or a reassignment to another session of the same card included): run it again.
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

  archive: `backlog archive — archive a finished item: it leaves the work queue and is kept as archived

Usage:
  backlog archive <item> [--force] [--dry-run]

Archives an item given by number or slug: the item leaves the work queue, is kept as archived in the backlog
repository and its status becomes archived; the output names it by its slug. The command records an event and
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
      Say which item would be archived and change nothing: nothing is moved and nothing is committed.
${HELP_FLAG}

${EXIT}

Example:
  backlog archive 12
`,
  setup: `backlog setup — choose where this repository's backlog lives and deploy the backlog skill

Usage:
  backlog setup [--ask]

Run inside the git repository to set up. The command:
  1. finds the backlog folder: the one the repository's configuration names; else, when a clone URL is set (the
     environment variable BACKLOG_ORIGIN_URL, then the backlog_origin_url key of the configuration),
     ../<name> beside the repository (<name> from the URL); else .backlog inside the repository. With --ask it asks for
     the path, showing that default;
  2. clones the backlog repository there with git when the path does not exist and a clone URL is set (a clone that
     cannot be made is refused: exit 3, nothing changed); creates the folder when no URL is set; leaves an existing
     folder exactly as it is;
  3. writes .backlog/config.json {"backlog_repository": "<path relative to the repository>"} (".backlog" for the
     folder inside it) when there is no configuration yet, or with --ask; otherwise keeps it. A write keeps the file's
     other keys. The file is committed and pushed with the skill copies, so every clone of the repository finds the
     backlog folder, also after the repository and the folder move together;
  4. replaces the backlog skill in every agent folder present (.agents, .claude, .github, .qwen) with this release's.

Every command finds the backlog folder in this order: BACKLOG_HOME, the repository's configuration (.backlog/config.json,
backlog_repository: a path relative to the repository; .backlog means inside it; the root file .smooth-backlog.json of
earlier builds is still read), the per-user file <name>/home under the config folder ($XDG_CONFIG_HOME, else
~/.config; without the clone-URL setting, the only such file there), ~/git/<name> when a clone URL is set. When none of
them names one, the backlog is .backlog inside the repository, created with its configuration on first use. A
configured folder that is missing is refused (exit 4) naming backlog setup. setup commits and pushes what it wrote
(the configuration and the skill copies) on the current branch. A backlog repository is pulled before every command and pushed after every change; nothing is written
into the repository being set up. Inside the repository, every change is committed on the current branch, with the
backlog's paths only, and pushed to origin under the same branch name.

Options:
  --ask
      Ask for the backlog repository path on standard input; an empty answer takes the default shown.
${HELP_FLAG}
Exit codes: 0 done; 2 a usage error or a folder that is no clone of the backlog repository; 3 the clone failed.

Example:
  backlog setup
`,
};
