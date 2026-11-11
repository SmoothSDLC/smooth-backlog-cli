// The help of backlog team and its subcommands: teamHelp['team'], ['team pop'], ['team new'], ['team update'], ['team query'], ['team define'], ['team workflow'], ['team validate'], ['team migrate'].
// Only this file and the team code name the team environment and configuration; src/shared/router.js prints the entry of the subcommand named.
import { SHARED, HELP_FLAG } from '../shared/help-parts.js';

export const teamHelp = {
  'team': `backlog team — the commands that know a team: pop, new, update, query, validate, migrate, define, workflow

Usage:
  backlog team pop --team <name> --agent <name> [--dry-run] [--json]
  backlog team new --team <name> --agent <name> --name <text> [--<argument> <value>]... [--json]
  backlog team update <item> <step> --team <name> --agent <name> [--<argument> <value>]... [--json]
  backlog team query --team <name> --agent <name> --claimable | --reviewable | --blocked | --decisions | --plan | --wip [--scope branch|repo|all] [--json]
  backlog team validate [--team <name> | --show-all] [--json]
  backlog team migrate --team <name>
  backlog team define --file <team.json> [--json]
  backlog team workflow --file <flow.json> [--json]
  backlog team workflow --show <name>

Only these commands read the team file (teams.json: the "teams_file" key of .backlog/config.json, else .backlog/teams.json; backlog team validate says more) and the team's entry in it. The user commands know nothing of teams: they ignore the team environment and the team entries. --team and --agent
are required on pop, new and update; SMOOTH_BACKLOG_CLI_TEAM_NAME and SMOOTH_BACKLOG_CLI_AGENT stand in for them, and the "team" key of .backlog/config.json stands in for the team after the variable (new and update
never read the "user" key of that file: the agent is the flag or the variable). A team without an entry in the team file is refused.

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
  1  The step was refused or could not be run: the reason is printed. Also: a synchronisation failure, or the team has no entry in the configuration.
  2  Invalid input: a missing --team or --agent, another team than SMOOTH_BACKLOG_CLI_TEAM_NAME, an agent other than SMOOTH_BACKLOG_CLI_AGENT, no branch (a
     detached HEAD without SMOOTH_BACKLOG_CLI_TEAM_BRANCH), or a definition with problems.
  3  idle: nothing to do now (pop; only the idle answer exits 3, a failure of pop is exit 1).
  5  The item was changed by somebody else after this agent last read it (backlog team query --phase <item> --agent <you>).

Example:
  backlog team pop --team cli-1 --agent ann --json
`,

  'team pop': `backlog team pop — what one agent of a team does next: the first step the team's pop table offers, taken for the agent

Usage:
  backlog team pop [--team <name>] [--agent <name>] [--session <id>] [--repository <owner/name>] [--branch <name>] [--dry-run] [--json]

Looks at the open items of the team on the session's branch, in the order of the branch's list, and offers the agent the first step of the team's pop table (the list "rules.pop" of the
team file) whose condition holds and which the team's rules allow on the first item it applies to. The step is taken at once, as the command's own commit "team <step> <slug>" (the same
rules and the same writing as backlog team update), published, and then the whole item is printed after the step. When the table offers nothing, the answer is idle. A step the rules refuse
on an item is tried on the next item; a pop table or a rule that is malformed is an error (exit 2), never an idle answer.

Scenario: the agent member-1 of the team parallel has nothing in hand and asks for work in the working copy of the repository whose backlog holds it: backlog team pop --team parallel
--agent member-1. The table offers claim on the first ready item (the entry member-claims, the rule that allows the claim); the item is claimed for member-1, the commit is published, and
the command prints the line "➡️  claim 003-parser (pop entry member-claims, rule claim)" followed by the item. A hook that only looks before the agent acts runs the same command with --dry-run.

Output: the line "➡️  <step> <item> (pop entry <id>, rule <id>)", then the item: "[<seq>] <slug>  <name>", the line "team <team>  repository <repository>  branch <branch>", one line "<field>: <value>"
per field (the team's item definition first, in its order, then the undeclared ones alphabetically), the body, and "history:" with one line per entry (time, step, note, by, changes). Nothing
leaves the command that contains a credential: every line is redacted. Idle prints "ℹ️  idle: nothing for <agent> in team <team>".

--json prints {"action", "item", "entry", "rule", "item_file"}: the step taken, the item's number, the pop entry and the rule that allowed it, and "item_file", the item's document after
the step (seq, slug, name, team, repository, branch, created, updated, updated_by, fields, body, history). Idle prints {"action":"idle"}. --dry-run does the same without writing anything,
in either repository: it prints what the real command would take (the item as it would be after the step), and the origin that cannot be reached is a warning.

${SHARED}

Options:
  --team NAME
      The team whose pop table decides (else SMOOTH_BACKLOG_CLI_TEAM_NAME, else the "team" key of .backlog/config.json).
  --agent AGENT
      The agent the command answers for: the caller the rules see and the writer recorded in the item (else SMOOTH_BACKLOG_CLI_AGENT; the "user" key of the configuration is not read).
  --session ID
      The session id the rules see as $session.id (else SMOOTH_BACKLOG_CLI_SESSION).
  --repository OWNER/NAME
      The repository whose folder of the backlog and team file the command uses (else SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY; else the working copy's).
  --branch NAME
      The branch whose queue to use (else SMOOTH_BACKLOG_CLI_TEAM_BRANCH; else the working copy's current branch; a detached HEAD needs one of them). Items of other branches are never offered.
  --dry-run
      Only answer: nothing is written, committed or published.
  --json
      Print the answer as JSON.
${HELP_FLAG}

Exit codes:
  0  A step was offered and taken (or, with --dry-run, would be taken); the item is printed.
  1  The step could not be published (the push was refused, the branch kept changing) or the backlog could not be updated from its origin: the reason is printed and nothing is left behind.
  2  Invalid input: a missing team or agent, an argument the command does not take, no branch (a detached HEAD), an invalid team file,
     or a pop table or rule that is malformed.
  3  idle: nothing to do now. Only the idle answer exits 3.

Example:
  backlog team pop --team cli-1 --agent ann --json
`,

  'team new': `backlog team new — file an item of a team: the step "new" of the team's rules on a fresh item

Usage:
  backlog team new --name <text> [--team <name>] [--agent <name>] [--<argument> <value>]... [--json]

Adds an item that belongs to the team to the backlog folder of this repository (or of the repository named by --repository), on the branch of the
working copy (or --branch). The team's rules decide whether the step "new" is allowed: a rule of the team's table that names the step "new" decides on the fresh
item (it has every field of the item definition at its default) and may refuse it, set fields, change a related item (a parent's list of children, for
example), place the item in the queue and write a first note. A refusal prints its text, exits 1 and writes nothing: the item number is not taken, so
the next item still gets it. An allowance is committed and published as the command's own commit, "team new <slug>"; the printed line comes after that.

The item gets the number one above the highest number the repository's backlog ever held. Its slug is the number and the name. The arguments
the step takes are the names its rules read as $arg.<name> (--estimate and --parent, for example); --name is always one of them and is required. Any other
--<argument> <value> is refused with the list of what the step takes (exit 2). A value may hold spaces or be a negative number. The caller is the agent
(--agent, else SMOOTH_BACKLOG_CLI_AGENT; it is a name, not a proof); the team is --team, else SMOOTH_BACKLOG_CLI_TEAM_NAME, else the "team" key of
.backlog/config.json. The team's steps are the words its rules name in the team file (rules.table). The team file must be valid as a whole
(backlog team validate); the "user" key of the configuration is never read.

Scenario: the agent member-1 of the team parallel files a job of 45 minutes. It runs backlog team new --team parallel --agent member-1 --name "Parser" --estimate 45 in the
working copy of the repository whose backlog holds the work; the team's rule new-needs-estimate would have refused it without --estimate.

${SHARED}

Options:
  --name TEXT
      The title of the item. Required (exit 2 without it).
  --<argument> VALUE
      An argument of the step "new" as the team's rules define it. The value is the next word, or follows an equals sign (--estimate=45).
  --team NAME
      The team the item belongs to.
  --agent AGENT
      The agent that files the item: the caller the rules see and the writer recorded in the item and its history.
  --session ID
      The session id the rules see as $session.id (else SMOOTH_BACKLOG_CLI_SESSION).
  --repository OWNER/NAME
      The repository whose folder of the backlog and team file the command uses (else SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY; else the working copy's).
  --branch NAME
      The branch the item is filed on (else SMOOTH_BACKLOG_CLI_TEAM_BRANCH; else the working copy's current branch; a detached HEAD needs one of them).
  --json
      Print {"item", "slug", "rule", "changes", "related", "say"} instead of the line. "changes" holds { field: [before, after] } of the item,
      "related" the same per related item (by number), "say" the text of the rule that allowed the step, or an empty text.
${HELP_FLAG}

On success the command prints "created <slug> (seq <number>) for team <team>, rule <id>" with a check mark in front, then the text the rule says, if any.

Exit codes:
  0  The item was filed and published.
  1  The team's rules refused the step (the reason and the rule id are printed on standard output), or the team has no entry in the team file.
  2  Invalid input: no team, no agent, no --name, an argument the step does not take, an unknown option (--ask, --dry-run and --show-all are refused), a value
     that does not fit its field, a detached HEAD with no branch given, or a team file that is missing, unreadable or invalid.
  3  The repository that holds the items could not be synchronised with its origin: nothing was changed, or the change was not
     published and was rolled back (an item of another agent published first: the step runs again on the new files, and fails with this code only when it keeps changing).

Example:
  backlog team new --team parallel --agent member-1 --name "Parser" --estimate 45
`,

  'team update': `backlog team update — take one step of the team's rules on an item: claim, release, review, close, ...

Usage:
  backlog team update <item> <step> [--team <name>] [--agent <name>] [--<argument> <value>]... [--json]

Runs the step <step> on the item <item> (its number or its slug; an archived item is found too and refused). The team's rules decide: the first rule of the team's table that
names the step and whose condition holds decides, and a step no rule allows is refused. A refusal prints its reason with the id of the rule that gave it, exits 1 and writes
nothing. An allowance applies the rule's effects (fields of the item, related items such as a parent's list of children, the place in the queue, a note in the item's body, the team,
the branch, archiving or deleting the item), commits and publishes only the command's own commit, "team <step> <slug>", and then prints the change.

The step is the second word, never an option: a word that no rule of the team names is refused with the list of the team's steps (exit 2).
The arguments of a step are the names its rules read as $arg.<name>; --<argument> <value> gives one (the value is the next word, or follows an equals sign, may hold spaces or be
negative; a repeated argument takes the last value). An argument the step does not take is refused with the list of what it takes (exit 2). The caller is the agent (--agent, else
SMOOTH_BACKLOG_CLI_AGENT; it is a name, not a proof); the team is --team, else SMOOTH_BACKLOG_CLI_TEAM_NAME, else the "team" key of .backlog/config.json. The team file must be valid as a
whole (backlog team validate). An item of another team, an item that is archived and an item that has no team and that the rule does not bind to the team are refused. Nothing checks
that the item was read first: the step is decided on the items as they are now, and when another clone published first the step runs again on the new files.

Scenario: the agent member-1 of the team parallel starts work on item 12 and, when it is done, hands it to a second member to check. It runs
backlog team update 12 claim --team parallel --agent member-1 in the working copy of the repository whose backlog holds the work, and later backlog team update 12 hand-to-check
--team parallel --agent member-1 --note "tests pass"; the team's rule claim-dependencies would have refused the first while an item that 12 depends on is open.

${SHARED}

Options:
  --team NAME
      The team whose rules decide.
  --agent AGENT
      The agent that takes the step: the caller the rules see and the writer recorded in the item and its history.
  --session ID
      The session id the rules see as $session.id (else SMOOTH_BACKLOG_CLI_SESSION).
  --repository OWNER/NAME
      The repository whose folder of the backlog and team file the command uses (else SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY; else the working copy's).
  --branch NAME
      The branch the step acts on, as the rules see $session.branch (else SMOOTH_BACKLOG_CLI_TEAM_BRANCH; else the working copy's current branch; a detached HEAD needs one of them).
  --<argument> VALUE
      An argument of the step as the team's rules define it.
  --json
      Print {"item", "step", "rule", "changes", "related", "say"} instead of the lines. "changes" holds { field: [before, after] } of the item, "related" the same per related item
      (by number), "say" the text of the rule that allowed the step, or an empty text.
${HELP_FLAG}

On success the command prints "<slug>: <step> (rule <id>)" with a check mark in front, then one line "   <field>: <before> -> <after>" per change of the item in the order of the item
definition (an empty text is shown as "", a list as JSON), one line "   item <number>: <field>: <before> -> <after>" per related item changed, then the text the rule says, if any.

Exit codes:
  0  The step was taken and published.
  1  The team's rules refused the step (the reason and the rule id are printed on standard output), there is no such item, or the team has no entry in the team file.
  2  Invalid input: no team, no agent, no item or no step word, a step no rule names, an argument the step does not take, an unknown option (--ask, --dry-run and --show-all are refused),
     a value that does not fit its field, a number that two items hold, a detached HEAD with no branch given, or a team file that is missing, unreadable or invalid.
  3  The repository that holds the items could not be synchronised with its origin: nothing was changed, or the change was not
     published and was rolled back (an item of another agent published first: the step runs again on the new files, and fails with this code only when it keeps changing).

Example:
  backlog team update 12 claim --team parallel --agent member-1
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
      item, newest first; without one it prints the latest 50 events of the backlog, archived items included. Each line is the time, the step, who made
      the entry, the keys that changed (key: before -> after) and the note.
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
      --all every branch. Answer one with the step of the team's rules that takes the answer: backlog team update <item> <step> --team <team> --agent <you> [--<argument> <value>]....
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

  'team validate': `backlog team validate — check the team file and the items of this repository against it

Usage:
  backlog team validate [--team <name> | --show-all] [--repository <owner/name>] [--json]

backlog team validate reads the team file in full and checks it: the shape of the file, the people, the item definition and every rule,
pop entry and filter. It then checks the items of this repository's folder of the backlog against their team (an item whose team has no
entry, a field value the definition does not allow, a field it does not declare, a reference to an item that does not exist, a number
that differs from the file name) and the folder's numbers.json against the history. Every finding says where it is, which rule, why it is
a problem and what would fix it. A lead runs it after editing the team file, before committing it.

Scenario: a lead added a review step to the team web in teams.json and runs backlog team validate --team web in the working copy of
the repository that holds the team file. The command prints the findings of the file's shape and of the entry of web and its items.
When another team's entry has an error it says so in one line, because no team command runs until the whole file is valid.

The file is found as the team commands find it: the "teams_file" key of .backlog/config.json, else <backlog repository>/<owner>/<name>/teams.json
when the "backlog_repository" key names a folder outside the repository, else .backlog/teams.json. A team is given as --team, else
SMOOTH_BACKLOG_CLI_TEAM_NAME, else the "team" key of .backlog/config.json. With --team and --show-all together --team decides.
Like every read of the backlog it first updates the backlog repository (when that cannot be done it warns and answers from the local copy); it publishes nothing. It writes the SHA of the file into .backlog/config.json
(key teams_file_sha, so that the lead commits it with the edit) when the whole file is valid, and the per-user validation record; for
another repository named by --repository (or SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY) only the record. A backlog whose items are still
markdown is checked on the file only, and the command says to run backlog team migrate first.

Options:
  --team NAME
      Print the findings of the file's shape and of this team's entry and items.
  --show-all
      Print the findings of every team (the whole file).
  --repository OWNER/NAME
      Validate the team file of another repository of the backlog repository (only the record is written).
  --json
      Print the findings as a JSON list of {severity, team, path, rule, problem, fix} and nothing else.
${HELP_FLAG}

Exit codes:
  0  No error; warnings may be printed.
  1  The named team has no entry in the file.
  2  The file has at least one error (the whole file counts, not only the named team), is not JSON, is missing, or the input is invalid.

Example:
  backlog team validate --team web
`,

  'team migrate': `backlog team migrate — convert the items of a backlog to the team format (not available yet)

Usage:
  backlog team migrate --team <name> [--ask]

backlog team migrate will convert the markdown items of this repository's folder to JSON items and bind them to a team. It reads its
inputs as the other team commands do (a missing team is exit 2) and then answers that it is not available yet.

Options:
  --team NAME
      The team the items are bound to.
  --ask
      Reserved for the conversion.
${HELP_FLAG}

Exit codes: 2 the inputs are invalid, or the command is not available yet.

Example:
  backlog team migrate --team web
`,

};