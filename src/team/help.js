// The help of backlog team and its subcommands: teamHelp['team'], ['team pop'], ['team new'], ['team update'], ['team query'], ['team define'], ['team workflow'].
// Only this file and the team code name the team environment and configuration; src/shared/router.js prints the entry of the subcommand named.
import { SHARED, HELP_FLAG } from '../shared/help-parts.js';

export const teamHelp = {
  'team': `backlog team — the commands that know a team: pop, new, update, query, define, workflow

Usage:
  backlog team pop --team <name> --agent <name> [--dry-run] [--json]
  backlog team new --team <name> --agent <name> --name <text> [options]
  backlog team update <item> --team <name> --agent <name> <step> [options]
  backlog team query --team <name> --agent <name> --claimable | --reviewable | --blocked | --decisions | --plan | --wip [--scope branch|repo|all] [--json]
  backlog team define --file <team.json> [--json]
  backlog team workflow --file <flow.json> [--json]
  backlog team workflow --show <name>

Only these commands read the team's entry in the backlog configuration (teams.json at the root of the backlog: the lead, the members,
the external reviewers and the review stages) and the flow it names. The user commands know nothing of teams: they ignore the team environment and the team entries. --team and --agent
are required on pop, new and update; SMOOTH_BACKLOG_CLI_TEAM_NAME and SMOOTH_BACKLOG_CLI_AGENT stand in for them, then the team and user of .backlog/config.json. A team
without an entry is refused: "team <team> is not configured in the backlog configuration".

Teams, their leads and members and their review rules are configuration in the backlog folder (teams.json); work-in-progress
limits are in wip-limits.json. A team session is bound by SMOOTH_BACKLOG_CLI_TEAM_NAME, SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY and SMOOTH_BACKLOG_CLI_TEAM_BRANCH (set by the team runner) and
acts as SMOOTH_BACKLOG_CLI_AGENT: it works only on items of its team, repository and branch, and a member acts only as itself.

backlog team <command> --help prints the options of one command.

${SHARED}

Options:
  --team NAME
      The team (pop, new, update). In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set) it must be that team.
  --agent AGENT
      The agent the command answers for (pop, new, update). In a team session (SMOOTH_BACKLOG_CLI_AGENT set) it must be that agent.
  --json
      Print the answer as JSON.
${HELP_FLAG}

Exit codes:
  0  The command succeeded: the answer names an item, the step was taken, define or workflow succeeded.
  1  The step was refused or could not be run: the reason is printed. Also: a synchronisation failure, the item changed before it
     could be shown (run it again), or the team has no entry in the configuration.
  2  Invalid input: a missing --team or --agent, another team than SMOOTH_BACKLOG_CLI_TEAM_NAME, an agent other than SMOOTH_BACKLOG_CLI_AGENT, no branch (a
     detached HEAD without SMOOTH_BACKLOG_CLI_TEAM_BRANCH), or a definition with problems.
  3  idle: nothing to do now (pop). The same code is used when the local clone of the backlog repository could not be updated from
     its origin before the answer.
  5  The item was changed by somebody else after this agent last read it (backlog team query --phase <item> --agent <you>).

Example:
  backlog team pop --team cli-1 --agent ann --json
`,

  'team pop': `backlog team pop — what one agent of a team does next, marked as theirs, with the whole item

Usage:
  backlog team pop --team <name> --agent <name> [--dry-run] [--json] [--lead <name>] [--scope branch|repo|all] [--all] [--branch <name>]

backlog team pop is the one next-action command. It answers by the agent's role in the team's entry, with exactly one action, the
first that applies: continue (an item the agent holds and can work on; when its review passed, close it), review (an item another
agent asks to have reviewed, or a review the agent started), refine (a member: the refinement it has started, or the first-round
refinement of a team item that nobody refines; the team lead: an incomplete item that lacks required fields), claim (the open item
with the lowest priority whose dependencies are done and whose hand-offs are accepted, that is no chunk item, is ready when it is a
team's item, and that nobody holds), refinement-review (the team lead: refined items to send to the refinement review), reassign-review
(the team lead: a stale review of its team to hand on), stop (a member that handed its item off and waits for a fresh session: end the
turn), chunk (a small piece of refinement work of at most ten minutes) or idle. An item the agent holds that waits for a verdict or
for a run is not continued, and the agent claims a new item only when every item it holds waits. Another agent's review request
comes after the agent's own work, however old it is. Incomplete items are never claimed or reviewed. Only the team's items of this
repository are continued, reviewed or claimed. The lead never claims an execution item; while its team works the split items its
answer is idle with the instruction to end the turn without polling (a passed or changes-requested item of the lead's keeps its close or
rework), and when every item of its team is done it is told to have the work item reviewed and close it.

In addition the lead gets the team's work item: an item of this repository and branch whose team is the team and that has no stage
(backlog team update <item> --team <name> --agent <you> --set-team <name> gives an item to a team, and backlog team new files a new one; the items split from it carry a stage and are the members' work).
A refined work item (its stage set, its refinement review passed) is an ordinary item any member may claim; team pop offers a work
item only while its stage is unset, and the lead still refines it and splits it only when it is too big for one member. When the lead
holds an open work item that has no other item of the team, the answer is continue with that item. When an earlier session of the
lead's card holds it, the command records the continuation claim first - the new session name as the owner and in session_authors -
and then answers continue; a refused continuation claim is no success: the earlier session keeps holding and the command stops (exit
1, the reason on standard error). The final read requires the lead's own session still holding the item: a hand-back or a reassignment
to another session of the same card between the selection and the final read is no success (exit 1, the item changed before it
could be shown). Otherwise, with nothing else to do, the command claims for the lead the team's first open, unclaimed work item in
the work order (priority, then seq) whose claim is accepted (its dependencies are done, no work-in-progress limit is passed), and the
answer is claim.

The step the answer offers is marked in one locked write: the claim, the start of a refinement or the start of a review. The output
is the action and the item, what was marked, the one instruction, one line per blocked item, the work items not taken with the
reason, and the whole item: its front matter and its body. With --json it prints one object: action, item, seq, team, repository,
branch, instruction, claimed, blocked, held, marked, skipped ({item, reason} of each work item not taken), front_matter and body.
With --dry-run the command only answers: it writes no claim and no mark (marked is null, claimed false) and does not take the
lead's work item; the exit codes are the same. A hook that looks before the agent acts uses it; the agent then takes the step itself.

${SHARED}

Options:
  --team NAME
      The team (pop, update). In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set) it must be that team.
  --agent AGENT
      The agent the command answers for (pop, update). In a team session (SMOOTH_BACKLOG_CLI_AGENT set) it must be that agent.
  --json
      Print the answer as JSON.
  --dry-run
      Only answer: write no claim and no mark (marked is null, claimed false) and do not take the lead's work item.
  --lead LEAD
      pop and --plan: the team lead, who alone refines incomplete items outside the refinement stages and never claims an execution item. The default is the
      environment variable SMOOTH_BACKLOG_CLI_TEAM_LEAD, else the lead of the team in teams.json.
  --scope {branch,repo,all}
      pop and the views --claimable, --reviewable and --blocked: how far the agent looks: this branch (the default), every branch of this repository, or also the chunk items
      of every repository. The widest scope for chunk items is capped by the line refinement_scope: off|branch|repo|all
      in the file backlog.scope of the folder of this repository (default branch).
  --all
      pop only: look at every branch, not only the current one.
  --branch BRANCH
      pop only: the branch whose queue to use. The default is the branch that is checked out here. A team session bound by
      SMOOTH_BACKLOG_CLI_TEAM_BRANCH can only use that branch.
${HELP_FLAG}

Exit codes:
  0  The answer names an item (continue, claim, review, refine, chunk, ...) and the step was marked.
  1  A claim was refused or could not be run (its process failed or was interrupted): its output, or the failure, is shown.
     After an interruption the claim may already be saved, or even pushed: check the item before running team pop again.
     Also: a command it ran failed for another reason, a synchronisation failure included (the reason is printed), the item
     changed before it could be shown (run it again), or the team has no entry in the configuration.
  2  Invalid input: a missing --team or --agent, another team than SMOOTH_BACKLOG_CLI_TEAM_NAME, an agent other than SMOOTH_BACKLOG_CLI_AGENT, no branch (a
     detached HEAD without SMOOTH_BACKLOG_CLI_TEAM_BRANCH).
  3  idle: nothing to do now. The same code is used when the local clone of the backlog repository could not be updated from
     its origin before the answer.

Example:
  backlog team pop --team cli-1 --agent ann --json
`,

  'team new': `backlog team new — file an item of a team: it starts in stage refining, where a member writes it

Usage:
  backlog team new --team <name> --agent <name> --name <text> [options]
  backlog team new --team <name> --agent <name> --split-from <item> [options]

Adds an item that belongs to the team, to the backlog of this repository and branch (a session bound by SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY and
SMOOTH_BACKLOG_CLI_TEAM_BRANCH files it under that repository and branch). The item gets the next free item number, the team, the status new and the
stage refining; a member refines it, and the team's review of the refinement passes before anyone claims it. A split of a team's
item (--split-from) is made here too: backlog new used outside a team refuses it. Every option of backlog new works here (backlog new --help
has the item template); this command adds --review-refs. The agent is the writer of the item, as for every team command.

${SHARED}

Options:
  --team NAME
      The team the item belongs to. In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set) it must be that team. A team without an entry in the
      backlog configuration is refused.
  --agent AGENT
      The agent that files the item. In a team session (SMOOTH_BACKLOG_CLI_AGENT set) it must be that agent.
  --title TITLE, --name NAME
      The title of the item. Required, unless --split-from is given.
  --objective OBJECTIVE
      The objective of the item, in one line. A split item inherits the objective of its parent when this is omitted.
  --summary SUMMARY
      A semantic summary of what is in the item, several sentences. The option may be given several times.
  --context CONTEXT
      The context carried over from the original request. It is written into the item body.
  --description DESCRIPTION, --body BODY
      The initial body of the item. When it has no "Definition of done" heading or line with checkable lines, a placeholder
      checklist is added; the refinement replaces it.
  --review-refs REFS
      The documents that define a good result, comma-separated paths (references/review/code.md). A path that is absolute or
      leaves the repository is refused. The refinement may set them later (backlog team update --set-review-refs).
  --estimate MINUTES
      The estimated minutes of work, an integer.
  --complexity {low,medium,high}
      The estimated complexity of the item.
  --layer {1,2,3,4,5,process}
      The layer of the item: 1 to 5, or the word process.
  --chunk
      Chunk work: small pieces done between items.
  --depends-on DEPENDS_ON
      The item numbers or slugs that must be done first, comma-separated, or the word none (the default).
  --priority PRIORITY
      The insertion rank, an integer. 0 makes the item the next thing to do; omitted, the item is appended.
  --severity {normal,critical}
      The default is normal. Critical puts the item at priority 0 (unless --priority is given) and is announced in a banner.
  --split-from ITEM
      Create a sibling item that inherits the context of this item (a number or a slug). The command refuses when the item
      does not exist or lies outside the repository and branch of a bound session.
  --force
      Write the item even when an item of that name already exists.
  --dry-run
      Say which item would be created and change nothing.
  --ask
      Ask for the fields you did not give, on a terminal: the title, the objective, the summary, the body (it ends with an empty
      line) and the review documents (--review-refs), one question after the other. The questions go to standard error, an empty
      answer leaves a field out, and what the command prints on standard output is what it prints without --ask. Without a terminal
      (standard input and standard error) the command refuses, exit 2, and creates nothing. A field given as an option is not asked.
  --status STATUS
      Refused: a team item starts in its own first status.
${HELP_FLAG}

On success the command prints a line that starts "created phase" with the item's slug, the item number and the rank the item now has.

Exit codes:
  0  The item was created (or, with --dry-run, would be).
  1  The command refused: the reason is printed on standard output. Also: the split source does not exist or is outside the
     session's scope, a dependency is not in the backlog, --status was given, or the team has no entry in the configuration.
  2  Invalid input: a missing --team or --agent, another team than SMOOTH_BACKLOG_CLI_TEAM_NAME, an agent other than SMOOTH_BACKLOG_CLI_AGENT, an unknown
     option, or a review document path that is absolute or leaves the repository.
  3  The repository that holds the items could not be synchronised with its origin: nothing was changed, or the change was not
     published and was rolled back.
  5  The split source was changed by somebody else after this agent last read it (backlog team query --phase <item> --agent <you>).

Example:
  backlog team new --team cli-1 --agent lead --name "Parser work" --objective "The parser reads the sample" --summary "Parser" --review-refs references/review/code.md --estimate 90
`,

  'team update': `backlog team update — take one team step on an item: claim, release, review, close, hand-off and the refinement steps

Usage:
  backlog team update <item> --team <name> --agent <name> <step> [options]

Runs one team step on an item: --claim, --release, --waiting, --waiting-done, --request-review, --start-review, --review, --close,
--handoff, --accept-handoff, --reject-handoff, --reassign, --reassign-review, --refine-start, --refine-done,
--request-refinement-review, --refinement-review, --request-decision, --decision, --wip-override, with the options of those steps.
The field options of backlog update (--append, --note, --set-estimate, --set-depends-on, ...; backlog update --help) work here too and are
checked against the team rules. A user command refuses every change of a team's item, field edits included: this command is the one way to change one. A call takes at most one team step (--claim, --release, --request-review, --start-review, --review,
--close, --waiting, --waiting-done, --handoff, --accept-handoff, --reject-handoff). A team item is claimed only when its
refinement review passed (stage ready); an item that lacks required fields is only refined; the team's review rules are met before
the close. A team's item closes when the review rules of its team (teams.json) are met for the item's current work commit.
A session with SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY (and SMOOTH_BACKLOG_CLI_TEAM_BRANCH) set works only on items of that repository and branch: every change to another item is
refused, field edits and --append as much as team steps. In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set, SMOOTH_BACKLOG_CLI_AGENT=<name>) a member acts only as
itself: its claim, release, refinement, review and close of an item name itself, never another agent.

${SHARED}

Options:
  --team NAME
      The team the step is for. In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set) it must be that team.
  --agent AGENT
      The agent that takes the step. In a team session (SMOOTH_BACKLOG_CLI_AGENT set) it must be that agent. A bare --claim or --release
      takes the agent.
  --claim AGENT
      Take the item for an agent . The command refuses when another agent holds the item, when an item
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
      --waiting-done .
  --waiting-done
      Clear the wait of the item .
  --set-review-refs PATHS
      Set the review_refs of the item (its definition of done), as comma-separated paths in the review-documents repository.
  --wip-override REASON
      The team lead lifts the team and agent work-in-progress limits for this one item, with the reason recorded in
      the item (wip_override, wip_override_by, wip_override_at); --by <lead>. The overall, repository and branch limits
      stay: only the owner changes them, in wip-limits.json of the backlog repository.
  --set-team NAME
      Set the team that owns the item; an empty NAME clears it. The team runner sets it on the work item it hands the team
      lead, and claims that item for the lead; items split from it inherit the team.
  --refine-start
      A team member starts refining the item (--by <agent>): only a team's item in stage refining, or without a stage (unrefined),
      that nobody claims or already refines. A split slice without a team joins the refining session's team (SMOOTH_BACKLOG_CLI_TEAM_NAME) here. The stages
      before any work are refining, refined, refinement-review and ready.
  --refine-done
      The refiner finished (--by <the refiner>, --note "<what you refined>"): stage refined. Refused while a team field or
      the definition of done is missing.
  --request-refinement-review
      The team lead sends a refined item to the refinement review (--by <lead>): stage refinement-review.
  --refinement-review {complete,reject}
      Record the refinement verdict, --by <reviewer> with --comments "<findings; thread or session id>": complete makes the
      item ready, reject sends it back to refining (pass and changes are accepted for complete and reject). The reviewer is a member of a team the refinement_review rule of
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
      survives the hand-off. In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set, SMOOTH_BACKLOG_CLI_AGENT=<name>) a member acts only as itself: its
      claim, release, refinement, review and close of an item name itself, never another agent.
  --reassign-review AGENT
      The team lead only (--by <lead>, --reason "<why>"): hand the review of the item on to AGENT (not its author), for
      example a stale review; a member never takes over another agent's review.
  --reason REASON
      Why the lead reassigns or releases another agent's item or review (--reassign, --reassign-review, or
      --release AGENT --by <lead>), or rejects a hand-off (--reject-handoff).
  --release AGENT
      Give the item back, pending and unclaimed . Only AGENT itself, or the team lead with --by <lead> and
      --reason, releases it. The release keeps the holder in session_authors (seeded for an item written before the
      list existed), so the holder's self-review block stands.
  --request-review AGENT|any
      Ask an agent, or any agent, for a review; --note says what to review . The output ends with the
      instruction to end the session now, printed after the change is published: a review request, a reject verdict
      (--review reject) and a close each end the agent's session, so its next task starts in a fresh one (not for the
      team lead).
  --start-review
      Record that the agent named by --by starts the requested review (review_state in_review, reviewer and review_started are
      set). Other agents skip it unless the review was started more than 20 minutes ago . The self-review rule
      is per session: the session that claimed the item or asked for the review (recorded in session_authors, kept on
      release like review_author) is refused with "the same session cannot review its own work; a new session may"; a new
      session, with a new name, may start the review . Every claim, reassign, release and review request
      seeds the list from the item's current holder and review requester, so an item written before the list existed
      keeps the self-review block of its earlier sessions.
  --review {complete,reject}
      Record a review verdict (pass and changes are accepted for complete and reject); it needs --by and --comments. A complete is recorded against the item's work commit
      (work_commit) - the requester's HEAD at its review request (--request-review records it; a later request after a
      pass keeps it) - so the reviewer's checkout and other items' commits on the branch move nothing; the item's own
      new work (a later commit whose subject names the item as a producer at the start - the item number alone, or
      joined with another item's number by "and") moves the work commit, so the review runs again; a close or
      --status closed whose commit lookup fails is refused fail closed, and the refusal records the reason. A reject
      verdict clears every recorded pass, keeps the finding in the item's review history and sends the item back to work. A team's item closes when the review rules
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
      --reject-handoff), or closes (--close) the item .
  --comments COMMENTS
      The review findings (--review); they must cite one of the review references of the item .
  --close
      Complete the item; --summary says what was delivered. A team's item closes when the review rules of its team
      (teams.json) are met for the item's current work commit; the refusal names the unmet rule. Outside a team the
      person or agent running the command closes it. The owner closes without a review on a written decision
      (--by owner --reason "<the decision>"), recorded as an owner decision, even for a team item still in its
      refinement stages . Only the claimer closes its item, else the team lead (--by <lead>);
      never the reviewer. An item that other items depend on closes only when each dependent's hand-off is recorded
      and accepted (--handoff, then the lead's --accept-handoff); the refusal lists every open dependent, the state
      of its hand-off and the next command. An item without dependents closes and records handoffs: none. An item
      already done is not checked again.
  --status STATUS
      Refused: the status of a team item moves by the steps above (claim, request-review, start-review, review, close), never by a
      value. The refusal names those steps and writes nothing.
  --dry-run
      Say what would change and change nothing: no file is written and nothing is committed.
${HELP_FLAG}

Exit codes: 0 the step was taken (--dry-run: it would be); 1 refused (the reason on standard output, ❌ ...); 2 invalid input; 3 the
update of the backlog repository failed before the change, or the change was not published and was rolled back; 5 the item was changed
by somebody else after this agent last read it (backlog team query --phase <item> --agent <you>).

Example:
  backlog team update 18 --team cli-1 --agent ann --claim
`,

  'team query': `backlog team query — read the backlog through the team's views

Usage:
  backlog team query --team <name> --agent <name> --claimable | --reviewable | --blocked | --decisions | --plan | --wip [--scope branch|repo|all] [--json]
  backlog team query --team <name> [--agent <name>] --next | --status | --critical | --branches [--all] [--branch <name>] [--json]
  backlog team query --team <name> [--agent <name>] --phase <item>[,<item>...] | --events [<item>] | --by-branch <name> | --only {new,open,done,archive} [--json]
  backlog team query --team <name> [--agent <name>] --changed [--json]

Reads the backlog and changes nothing, except that --changed advances the agent's own last-use reference (its record of its own use, not an
item). The view is one of the options below; --agent is the agent that asks (given, it switches to the team rules: an incomplete item is not
offered and the agent never reviews its own work). Without a view option it prints the full stack of the branch, as backlog list does.
Each item shown also carries what the team rules say about it: missing (the team fields it lacks: review_refs, depends_on, estimate_min,
definition_of_done; [] when complete; null when the item's file is gone or holds no item), the stage and the review state. A team without
an entry is refused. The user's read commands (backlog list, show, next, history, changes) have none of the team views.

${SHARED}

Options:
  --team NAME
      The team (pop, update). In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set) it must be that team.
  --agent AGENT
      The agent the command answers for (pop, update). In a team session (SMOOTH_BACKLOG_CLI_AGENT set) it must be that agent. With
      --phase the agent has read that item (or each of a comma-separated list, printed as a JSON array): its next write of it
      is checked against that version. A change of an item's rank alone never makes the agent's view stale; a change of its
      content does, and the refusal names every such item of the write in one backlog team query --phase <a>,<b> command.
  --json
      Print the answer as JSON.
  --next
      The next actionable item: the open item with the lowest priority on the branch. When the queue is empty the
      command says so (with --json it prints {}). Open items of a branch that no longer exists on the origin
      are in no queue.
  --status
      The full stack of the branch (this is the default view). Each row shows the item's status word (free text; closed,
      done and archived are finished, every other word is open). With --json each row also carries claimed_by, from the item's front matter
      ('' when unset).
  --critical
      Only the open items with severity critical.
  --phase PHASE
      One item, given by number or slug, or several as a comma-separated list (a JSON array). The command refuses when
      one does not exist. Each item is shown whole: its row, front_matter and body (a file that cannot be read or parsed fails the
      command, as every read does).
  --events [EVENTS]
      The history of the items, kept in the item files. With an item (number or slug) it prints the events of that
      item, newest first; without one it prints the latest 50 events of the backlog, archived items included.
  --by-branch BY_BRANCH
      The items recorded on this branch.
  --only {new,open,done,archive}
      The full stack filtered to one kind of item: new (not started), open (every item not finished), done (finished,
      not archived) or archive (archived). The listing is the same one, in queue order. Same as backlog list new, list open,
      list done and list archive.
  --branches
      One line per branch of this repository: the branch, its open items and its done items (with --json, a list of
      {branch, open, done}). Same as backlog list branches.
  --changed
      Which items of this repository changed since your last use: your own write or your own --changed is
      the reference (its commit and time, stated in every result, also when it is empty), never a global
      timestamp, so a change made while you are idle still appears in your next report; your own reads
      (--phase) do not move it. The first --changed prints "no earlier use: reference set now"
      and sets the reference. The items you hold (your name as owner, reviewer or refiner) are listed
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
  --all
      Show --next or --status for every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to show. The default is the branch that is checked out here; a detached HEAD needs
      this option or --all.
  --claimable
      Open, unclaimed items whose dependencies are all done, in priority order (a team item before stage ready, or without a stage, is not claimable: it is refined first); another repository's items only as chunk
      work (chunk: true, with --scope all); with SMOOTH_BACKLOG_CLI_TEAM_NAME set, only that team's items of this repository .
  --reviewable
      Items with a requested review that --agent may start or continue: a session that did not claim the item and did
      not ask for the review (the sessions in session_authors) reviews; a new session of the same card may .
  --blocked
      Open items that wait for dependencies that are not done, with the status and holder of each dependency .
  --decisions
      The items that wait in stage review-hitl for an owner decision, each with its question, for the morning report; with
      --all every branch. Answer one with backlog team update <item> --team <team> --agent <you> --decision "<answer>".
  --wip
      The work in progress of the whole backlog repository against its limits (wip-limits.json at its top folder:
      overall, repository, branch, team, agent, each a number or {"default": n, "<key>": n} with the key owner/name, the
      owner/name:branch, the team or the agent, and stale_hours), and the items in progress without a change of their own
      for longer than stale_hours (default 48). A claim or a
      refinement start past a limit is refused, naming the limit and the items holding it.
  --plan
      The dispatch plan of the team for this branch: at most one action per member (respond, close, review, claim, and for
      the team lead refine or reassign-review), each item to one member, with the reason and a dispatch key; the members
      are the members of the team's entry in teams.json. Entries come by action (respond and close, review, claim, refine), a
      claim to the member holding the fewest items, then in the order of the entry (team session). Any session may review
      an item except the sessions recorded on it (session_authors: the claimer and the one who asked for the review, kept
      on release); a new session of the same card may review it. A member the entry lists in review_only never claims.
      Read-only.
  --lead LEAD
      pop and --plan: the team lead, who alone refines incomplete items outside the refinement stages and never claims an execution item. The default is the
      environment variable SMOOTH_BACKLOG_CLI_TEAM_LEAD, else the lead of the team in teams.json.
  --agents AGENTS
      With --plan: the team members present, comma-separated; the default is all the members of the team's entry.
  --scope {branch,repo,all}
      pop and the views --claimable, --reviewable and --blocked: how far the agent looks: this branch (the default), every branch of this repository, or also the chunk items
      of every repository. The widest scope for chunk items is capped by the line refinement_scope: off|branch|repo|all
      in the file backlog.scope of the folder of this repository (default branch).
${HELP_FLAG}

Exit codes: 0 success; 1 refused (for example a team without an entry); 2 invalid input; 3 the update of the backlog repository failed.

Example:
  backlog team query --team cli-1 --agent ann --claimable --json
`,

  'team define': `backlog team define — register a team in the backlog configuration

Usage:
  backlog team define --file <team.json> [--json]

backlog team define registers one team from a JSON file { "name", "lead", "members": [..], "review_only": [..] (members who review and never claim), "external_reviewers": [..], "workflow": "<flow,
default team>", "review": [{ "stage", "reviewers": "members"|"external_reviewers", "count" }] (default: the flow's), "wip": { "agent", "team" } }.
Every field is checked (the lead is not a member, the stages are stages of the flow, an external stage needs external reviewers) and each
problem is printed, one per line, exit 2, with nothing written. The entry is added to teams.json at the root of the backlog beside the
others, committed and pushed ("team <name> defined"); the same definition again changes nothing. A team that has open items is not replaced:
register the new composition under another name.

${SHARED}

Options:
  --file FILE
      The JSON file of the team definition.
  --json
      Print the answer as JSON.
${HELP_FLAG}

Exit codes: 0 the team was defined (or the same definition again: nothing changed); 2 invalid input or a definition with problems
(each printed, nothing written); 3 the update of the backlog repository failed or the change was not published.

Example:
  backlog team define --file team.json
`,

  'team workflow': `backlog team workflow — register a flow definition, or show one

Usage:
  backlog team workflow --file <flow.json> [--json]
  backlog team workflow --show <name>

backlog team workflow registers a flow the same way a team is registered, into workflows.json after the checks of the flow (every
open status can reach closed); --show prints a registered or the shipped flow.

${SHARED}

Options:
  --file FILE
      The JSON file of the flow definition.
  --show NAME
      Print one registered flow, or the shipped one.
  --json
      Print the answer as JSON.
${HELP_FLAG}

Exit codes: 0 the flow was registered or shown; 2 invalid input or a flow with problems (each printed, nothing written); 3 the update
of the backlog repository failed or the change was not published.

Example:
  backlog team workflow --show default
`,

};
