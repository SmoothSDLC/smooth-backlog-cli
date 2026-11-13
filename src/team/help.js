// The help of backlog team and its subcommands: teamHelp['team'], ['team pop'], ['team new'], ['team update'], ['team query'], ['team define'], ['team workflow'], ['team validate'], ['team migrate'].
// Only this file and the team code name the team environment and configuration; src/shared/router.js prints the entry of the subcommand named.
import { SHARED, HELP_FLAG } from '../shared/help-parts.js';

export const teamHelp = {
  'team': `backlog team — the commands that know a team: pop, new, update, query, validate, migrate, define, workflow

Usage:
  backlog team pop --team <name> --agent <name> [--dry-run] [--json]
  backlog team new --team <name> --agent <name> --name <text> [--<argument> <value>]... [--json]
  backlog team update <item> <step> --team <name> --agent <name> [--<argument> <value>]... [--json]
  backlog team query [<item> | filter <name> | check <item> <step> | plan | rules | steps] [--team <name> | --show-all] [--json]
  backlog team validate [--team <name> | --show-all] [--json]
  backlog team migrate [--team <name> | --show-all] [--dry-run] [--json]
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
  5  The item was changed by somebody else after this agent last read it (read it again: backlog team query <item> --team <name>).

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
When another clone published first and changed what pop read, pop runs again on the new files and does not offer an item an earlier round of the same command offered. A rerun can therefore end pop idle (exit 3) while a ready item still exists, because the item was already offered in this run.

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
     or a pop table or rule that is malformed. An older git than 2.40 is refused too: "team commands need git 2.40 or later (found <version>)"; nothing the command wrote is left behind.
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
     that does not fit its field, a detached HEAD with no branch given, or a team file that is missing, unreadable or invalid. An older git than 2.40 is refused too: "team commands need git 2.40 or later (found <version>)"; nothing the command wrote is left behind.
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
     a value that does not fit its field, a number that two items hold, a detached HEAD with no branch given, or a team file that is missing, unreadable or invalid. An older git than 2.40 is refused too: "team commands need git 2.40 or later (found <version>)"; nothing the command wrote is left behind.
  3  The repository that holds the items could not be synchronised with its origin: nothing was changed, or the change was not
     published and was rolled back (an item of another agent published first: the step runs again on the new files, and fails with this code only when it keeps changing).

Example:
  backlog team update 12 claim --team parallel --agent member-1
`,

  'team query': `backlog team query — read the team's items and the answers of its rules

Usage:
  backlog team query [--team <name> | --show-all] [--branch <name>] [--json]
  backlog team query <item> [--team <name> | --show-all] [--json]
  backlog team query filter <name> --team <name> [--branch <name>] [--json]
  backlog team query check <item> <step> --team <name> [--agent <name>] [--<argument> <value>]... [--json]
  backlog team query plan --team <name> [--json]
  backlog team query rules [--team <name> | --show-all]
  backlog team query steps --team <name> [--json]

Every form reads the backlog and the team file and changes nothing in the backlog (the team file's validated copy, its record and its SHA are written, as by every team command); nothing is published.

backlog team query lists the open items of the team: those whose status is not in the "final" list of the item definition and that are not archived, in queue order. With --branch (or
SMOOTH_BACKLOG_CLI_TEAM_BRANCH) the queue is that branch's, in the order of the branch's list; without one it is every branch, in the order of the keys of the backlog's index. One line each:
"P<rank> [<number>] <slug>  <status>  <name>", the rank counted in the queue shown from 0. A queue without an item prints "ℹ️  no open item for team <name>" (with --show-all and no open item in any team: "ℹ️  no open item for any team"). --show-all lists the open items of each
team of the team file, in the file's order, each by its own final statuses, and appends "  (team <name>)" to every line. --json prints the array of the item documents (as backlog team pop's
"item_file"), in the same order.
Scenario: the lead of the team parallel looks at what is open on the branch feature/a-b: backlog team query --team parallel --branch feature/a-b

backlog team query <item> prints one item whole, by number or slug (007 and 7 are the same item), live or archived: "[<number>] <slug>  <name>", the line "team <team>  repository <repository>  branch <branch>",
one line "<field>: <value>" per field (the item definition's first, in its order, then the undeclared ones alphabetically, all in one form), the body, and "history:" with one line per entry. With
--team the item must be of that team: another team's item is "❌ item <number> belongs to team <other>" and an item of no team "❌ item <number> belongs to no team", both exit 1; with --show-all
and no --team any item is shown. No such item is "❌ no item <item>", exit 1; a number two items hold (a live and an archived one) is exit 2, naming both: name the item by its slug. --json prints the item document.
Scenario: before taking over item 12 the agent reads it: backlog team query 12 --team parallel

backlog team query filter <name> prints the items a filter of the team's rules ("rules.filters" of the team file) selects, as the list does, with their ranks in the whole queue; --json prints the item documents.
An unknown filter is "❌ team <name> has no filter <filter> (filters: ...)", exit 1. --show-all is refused (exit 2).
Scenario: the lead lists the items that wait on others: backlog team query filter waiting --team parallel

backlog team query check <item> <step> is the rules' answer for a step on an item, without taking the step: it prints "allowed by rule <id>: <field>: <before> -> <after>; ..."
(the item's changes in the order of the item definition, then "item <n> <field>: ..." for a related item) or "refused by rule <id>: <reason>", and exits 0 for both. A refusal that no
rule makes (the item is archived or belongs to another team, or the step takes no such --<argument>) says "refused by rule -". The item is named as for backlog team update; a step word
no rule names, a value that does not fit its field and a malformed rule are exit 2, and an unknown item is exit 1, as there. Without --agent the answer is the rules' verdict for an empty
caller. --json prints {"allowed", "rule", "changes", "related", "text"}; --show-all is refused.
Scenario: before claiming item 12, the agent member-1 of the team parallel asks: backlog team query check 12 claim --team parallel --agent member-1

backlog team query plan lists what backlog team pop would offer each person of the team, in name order, one line each: "<person>: <step> [<number>] <slug> (pop entry <id>, rule <id>)" or
"<person>: idle". The item offered to one person is not offered to the next. --json prints a list of {"person", "action", "item", "entry", "rule"}, with null for idle. The exit is 0; nothing is
written; --show-all is refused. Scenario: the lead of the team parallel plans the next hand-outs: backlog team query plan --team parallel

backlog team query rules prints the team's entry of the team file as stored: its people, its item definition and its rules, as JSON indented by two spaces; the text and --json forms print the same. Every string value is
printed with its credentials redacted (a URL's user and password, a user:token pair), so what is printed can differ from the file in such a value. With --show-all and no --team it prints the whole file's entries, keyed by team name. The item files are not read.
Scenario: the lead reads the rules before editing the team file: backlog team query rules --team parallel

backlog team query steps lists the steps the team's rules name (the words of every "step" of the rule table, and "new"), one line each, in name order: "<step>  takes: --<argument>, --<argument>  rules: <id>, <id>".
The arguments are those a rule of the step reads (backlog team update <item> <step> --<argument> <value> takes no other; "takes: no argument" when it reads none; backlog team new always takes --name); the rules are
the ids of every rule that decides the step, in table order, a rule for every step ("*") among them. --json prints a list of {"step", "args", "rules"}. --show-all is refused (exit 2). The item files are not read.
Scenario: an agent looks up the steps it can take before asking for one: backlog team query steps --team parallel

The user's read commands (backlog list, show, next, history, changes) have none of the team views.

${SHARED}

Options:
  --team NAME
      The team whose items are read (else SMOOTH_BACKLOG_CLI_TEAM_NAME, else the "team" key of .backlog/config.json).
  --show-all
      The list and <item> only: act over every team of the team file. With --team, --team decides.
  --agent AGENT
      The caller the rules see (check, plan, filter; else SMOOTH_BACKLOG_CLI_AGENT). No agent is needed to read.
  --session ID
      The session id the rules see as $session.id (else SMOOTH_BACKLOG_CLI_SESSION).
  --repository OWNER/NAME
      The repository whose folder of the backlog and team file the command uses (else SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY; else the working copy's).
  --branch NAME
      The branch whose queue is shown (else SMOOTH_BACKLOG_CLI_TEAM_BRANCH). Given none, the list and filter show every branch.
  --json
      Print the answer as JSON.
${HELP_FLAG}

Exit codes: 0 success; 1 refused (for example a team without an entry, an item of another team, an unknown filter); 2 invalid input; 3 the update of the backlog repository failed.

Example:
  backlog team query filter waiting --team parallel --json
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

  'team migrate': `backlog team migrate — convert the markdown items of this repository's folder to JSON items

Usage:
  backlog team migrate [--team <name> | --show-all] [--repository <owner/name>] [--dry-run] [--json]

backlog team migrate converts every markdown item of this repository's folder of the backlog, open and archived, to a JSON item, in one
commit (migrate <n> items to JSON) that it publishes. It always converts the whole folder of the one repository, with or without a
team on the items, and never another repository's folder. It writes the folder's numbers.json (the highest number the folder's
history ever held, so no number is handed out twice) and its index.json: the items the index already lists keep their order, the
others are appended in number order. Run it once per repository after upgrading: every other command stops on a folder of markdown items.

Scenario: after the upgrade a lead runs backlog team migrate --show-all --dry-run in the working copy of the repository, reads what
would be converted and every case that would stop the run, fixes those, then runs backlog team migrate --show-all.

The team file is found and named as the other team commands do (--team, else SMOOTH_BACKLOG_CLI_TEAM_NAME, else the "team" key of
.backlog/config.json; --show-all for every team; with both, --team decides) and is validated in full, as backlog team validate does. It
is only read: the command never writes it and reads no template. A folder in which no item has a team needs no team file. It reads
no user identity: the commit is made by git's configured author, and the items keep their updated and updated_by values.

The run stops with exit 2, lists every case and writes nothing when: the team file is missing while an item has a team, cannot be read
or has an error in any entry; an item, index.json or numbers.json of the folder has an uncommitted change (commit or stash it); a
header cannot be read; two items hold one number; a JSON file name is taken or would be too long; the backlog clone is shallow. When
the change cannot be published the folder is put back as it was (exit 3); in a repository with no origin remote the conversion stays committed
on the branch (exit 3: add the origin and push), and the next run writes the two keys below.

After a run that is not a dry run it writes two keys into .backlog/config.json of the working copy, for a person to commit:
migrated_at (when the folder became JSON; a later run that converts nothing keeps it) and migrated_by_version (the version of the CLI
of the latest run). With --repository naming another repository than the working copy's they are not written. A second run says
that there is nothing to convert; a markdown item that appears later (a branch merged from before the migration) is converted by
running the command again.

Options:
  --team NAME
      The team the command runs for; its entry must exist in the team file.
  --show-all
      Run for every team of the team file.
  --repository OWNER/NAME
      Convert the folder of another repository of the backlog repository, with that repository's team file.
  --dry-run
      Print what would be converted (the open and archived items, the counter, the index entries that leave and the items appended, the
      references that name no item) and every case that would stop the run. Writes nothing.
  --json
      Print the summary as one JSON object {dry_run, converted, archived, counter, refs, unresolved, index_leave, index_appended, failures};
      a run that stops prints {failures: [...]} and exits 2.
${HELP_FLAG}

Exit codes:
  0  Converted, or nothing to convert.
  1  The named team has no entry in the team file.
  2  The run stopped (every case is listed) or the input is invalid; nothing was written. An older git than 2.40 is refused too:
     "team commands need git 2.40 or later (found <version>)"; nothing the command wrote is left behind.
  3  The change could not be published: it was rolled back, or (no origin remote) it stays committed on the branch.

Example:
  backlog team migrate --show-all --dry-run
`,

};