import { table as fieldsTable } from './shared/fields.js';
import { SHARED, EXIT, HELP_FLAG } from './shared/help-parts.js';
// Help text: USAGE is what `backlog --help` prints; HELP[command] is what `backlog <command> --help` prints
// (src/shared/router.js) and what COMMANDS.md repeats. The text is written in plain, complete sentences so that the
// skill instructions can be rewritten around it.
// Layout the tests rely on: a flag is a line " --flag ARG" followed by description lines indented by six spaces.


export const USAGE = `backlog — the backlog of this repository and branch, for people and coding agents

Usage:
  backlog                                          This help (backlog --json: the next item)
  backlog new --name <text> [options]              Add an item; --split-from <item> makes a sibling with its context; --ask asks on a terminal for the fields not given
  backlog update <item> [options]                  Change an item that has no team: fields, body, status, priority; claim, release, close
  backlog update --replan "<id,id,...>"            Set the order of the queue
  backlog list [new|open|done|archive|branches|critical|all-branches] [--json]   The items of this branch (the full stack by default), one kind of item, the branches, the critical items, or every branch
  backlog show <item>[,<item>...] [--agent <name>] [--json]   One item whole: its row, front matter and body
  backlog history [<item>]                         The events of one item, or the latest 50 of the backlog
  backlog changes [--agent <name>] [--json]        Which items changed since your last use
  backlog next [--json]                            The next item of this branch
  backlog next all-branches [--json]               The next item over every branch of this repository
  backlog done <item>                              Finish an item that has no team (backlog update <item> --status done)
  backlog team pop --team <team> --agent <name>    What one agent of a team does next, marked as theirs (--dry-run: only answered), with the whole item
  backlog team new --team <team> --agent <name> --name <text> [options]   Add an item of a team (it starts in stage refining); --review-refs, --split-from, --ask
  backlog team query --team <team> --agent <name> <view>   The team views: --claimable, --reviewable, --blocked, --decisions, --plan, --wip
  backlog team update <item> --team <team> --agent <name> <step>   One team step: claim, release, request-review, review, close, ...
  backlog team define --file <team.json>           Register a team (lead, members, reviewers, review stages) in the backlog configuration
  backlog team workflow --file <flow.json>         Register a flow definition; --show <name> prints one
  backlog move <item> --to-branch <name>           Move an item to another branch (or --to-repository)
  backlog archive <item> [--force] [--dry-run]     Archive a finished item
  backlog archive done                             Archive every finished item of this branch
  backlog import --branch <source> [--higher]      Move the open items of another branch here; --higher puts them first in the queue
  backlog clean [all-branches]                     Remove every item of this branch (or of every branch) after a typed yes
  backlog fields [--json]                          The item template: every field, what it is for, who sets it
  backlog setup [--ask]                            Point this repository at its backlog folder and deploy the backlog skill
  backlog upgrade [check|auto|off|disable|<version>]  Update the backlog program itself
  backlog <command> --help                         Every option of the command, what it does, and an example
  backlog --version

An item is its number (1) or its slug (001-fix-the-login-redirect). Priorities are ranks: P0 is next. Each branch has its
own queue, which runs without gaps and is renumbered when work is added, moved or finished.

An item that belongs to a team is changed by backlog team update only. A user command that would change its team state (status,
claim, review, refinement, dependencies, its place in the team's queue, its deletion) refuses it: update (every change), done,
update --replan naming it, archive of one that is not closed (also with --force), import --higher and clean. A refusal is one line on
standard output, exit 1, and nothing is written. move, archive of a closed team item and archive done only file or store an item and work
on a team item like on any other.

The backlog is always a git repository. Wherever the items live, every command first updates the repository that holds
them from its origin (reads included), every change is committed and pushed before the command exits, a push the
origin rejects is retried after another update (three times), and a write to an item that someone else changed since
this agent last read it is rejected (exit 5) and shows the item as it is now. Where the items live is configuration and
changes no command: the repository's .backlog folder holds the configuration
(.backlog/config.json, written by backlog setup or on first use) and, by default, the items themselves (committed on
the current branch and pushed to origin together with the rest of the branch: the user's own commits go with the
change; use a backlog repository if the branch must not be pushed yet; "push-backlog-updates": false in the
configuration turns every push off); the configuration can name a clone of a backlog repository shared by many
repositories and people instead (SMOOTH_BACKLOG_CLI_ORIGIN_URL names it; SMOOTH_BACKLOG_CLI_HOME may point at the clone). Environment
variables override the configuration.

The items and the index are the data, and the CLI keeps no copy of them: the order of the queue of each branch is kept in
the index, one file (index.json) in the folder of the repository's items, committed and pushed with them, so a change of
the order changes that file and no item. Only the lock, the journal of a running change and the record of what each agent
has read stay in the clone's state folder. When an item file cannot be read after the update, every command of that backlog
refuses (exit 2) and names the item and the field that cannot be read; backlog update <item> --<field> <value> sets the
field again, and backlog update <item> --restore brings back the item's previous version.

Who: SMOOTH_BACKLOG_CLI_AGENT names the agent running the command (--by, --claim and --agent name one explicitly); every change
records who made it and when. A write to an item that someone else changed since this agent last read it is refused
(exit 5) until the agent reads it again (backlog show <item> --agent <you>).

Teams: the commands that know a team (pop, new, update, query, define, workflow) are under backlog team; backlog team --help describes
them. The commands above know nothing of teams.

Update notice: when a person runs a command at a terminal (standard error is a terminal), the command also checks the package
registry for a newer release, about once a week (about once a day after backlog upgrade auto; an hour after a check that failed). The
check runs beside the command and adds at most 1.5 seconds when it is still running after the command; it prints at most one warning
on standard error ("backlog: Version 2.1.0 is available; run backlog upgrade."), never changes the output or the exit code, and a check
that fails is a warning too. Nothing runs when standard error is not a terminal (agents and scripts), for --help, --version, upgrade
and setup. It installs nothing unless automatic updates are on. backlog upgrade disable turns the weekly check off, backlog upgrade
off turns automatic updates off; with both off nothing is checked (backlog upgrade check turns the weekly check on again).
backlog upgrade --help has the rest.

Exit codes: 0 success; 1 refused (the reason on standard output, ❌ ...); 2 invalid input or a failure; 3 idle (team pop:
nothing to do now); 4 the configured backlog repository is not cloned (run backlog setup); 5 stale view.
`;




export const HELP = {
  new: `backlog new — add an item to the backlog of this repository, or split a sibling off an existing item

Usage:
  backlog new --name <text> --depends-on <items|none> [options]
  backlog new --split-from <item> --depends-on <items|none> [options]

Adds or splits an item. The item gets the next item number: one above the highest number the repository's backlog ever used (its
history, every branch, and a number record committed with the item), so a number of a deleted, cleaned or archived item is never
handed out again. A shallow clone refuses (exit 2): run git fetch --unshallow. The item is added to the backlog of this repository in the
backlog repository, and the whole backlog is renumbered so that the priorities run from 0 without gaps. An item is
named by its number or by its slug, for example 018-help-text, and the output names it the same way.
The item belongs to the branch that is checked out in the repository you run the command in.

${SHARED}

Options:
  --title TITLE, --name NAME
      The title of the item, in human-readable words. Required, unless --split-from is given. --name is the same option under its earlier word.
  --objective OBJECTIVE
      The objective of the item, in one line. A split item inherits the objective of its parent when this is omitted.
  --summary SUMMARY
      A semantic summary of what is in the item, several sentences. It is used to route new work to the right item, so say in it what
      the item is about. The option may be given several times (the sentences are joined, one per line) and may hold newlines.
  --context CONTEXT
      The context carried over from the original request. It is written into the item body.
  --priority PRIORITY
      The insertion rank, an integer. 0 makes the item the next thing to do. When it is omitted the item is
      appended to the end of the backlog. The backlog is renumbered to 0..N-1 around the item, because adding
      work is a planning event.
  --status STATUS
      The status the item starts in, as free text (done means closed); the default is pending.
  --severity {normal,critical}
      The default is normal. Critical means a finding about repository corruption, data loss, the source of truth
      or security. It puts the item at priority 0 (unless --priority is given) and makes backlog list and backlog next print it in
      a loud banner so that it is never buried.
  --split-from ITEM
      Create a sibling item that inherits the context of this item (a number or a slug). The command refuses when
      the item does not exist.
  --description DESCRIPTION, --body BODY
      The description of the item (--body is the same option under its earlier word): the initial body of the item, the hand-over content for whoever does it. When the body has no "Definition of
      done" heading or line with checkable lines, a placeholder checklist is added.
  --depends-on DEPENDS_ON
      The item numbers or slugs that must be done first, comma-separated, or the word none (the default). owner/name#seq names
      an item of another repository's backlog in the same backlog repository. The command refuses when a named item is
      not in this backlog, or not in the backlog repository.
  --estimate MINUTES
      The estimated minutes of work, an integer (the front matter key estimate_min).
  --complexity {low,medium,high}
      The estimated complexity of the item.
  --layer {1,2,3,4,5,process}
      The layer of the item: 1 to 5, or the word process.
  --chunk
      Chunk work: small pieces done between items (the front matter key chunk: true).
  --force
      Write the item even when an item of that name already exists. Without it the command refuses.
  --dry-run
      Say which item would be created and change nothing: nothing is written and nothing is committed.
  --ask
      Ask for the fields you did not give, on a terminal: the title, the objective, the summary and the body, one question after the
      other (the body ends with an empty line). The questions go to standard error, an empty answer leaves a field out, and what the
      command prints on standard output is what it prints without --ask. Without a terminal (standard input and standard error) the
      command refuses, exit 2, and creates nothing. Every other option still applies, and a field given as an option is not asked.
${HELP_FLAG}

On success the command prints a line that starts "created phase" with the item's slug, the item number and the rank
the item now has, and a line about the renumbered backlog. A critical item is announced in a banner first.

The item template (backlog fields prints the same table):

${fieldsTable()}

${EXIT}

Example:
  backlog new --name "Fix login" --objective "An expired cookie no longer blocks sign-in" --summary "Login cookie handling" --depends-on none

A team's items are filed by backlog team new, and a split of a team's item is refused here.
Team items: backlog team new --help.
`,

  update: `backlog update — change the fields of one item, move it in the queue, or re-plan the whole backlog

Usage:
  backlog update <item> [options]
  backlog update --replan <item>,<item>,... [--note <text>]
  backlog update <item> --restore

Changes the item named by its number or slug. The item file is the source of truth: the command writes the file,
records an event in the history of the item. Setting --status to
closed completes the item (its completion time is set) and renumbers the rest of its branch's queue; so does --priority.
Both are planning events, so look at the order again afterwards. The order is kept in the index of the folder, so a
change of the order rewrites no other item. The item may be left out only together with --replan. Called with nothing at all, the command prints this help and exits 2; it never
installs a program version (backlog upgrade is the program's own update).
The two retired classification keys of older items have no effect. An item that still carries them shows them until the CLI next writes that item; every write drops them.

${SHARED}

Options:
  --status STATUS
      The new status, any word (hyphens and underscores stand for spaces: in_progress). closed (or done) finishes the item
      and completes it; archived is refused (backlog archive moves a finished item); any other word is free text and keeps
      the item open.
  --branch BRANCH
      Refused by design: the branch of an item is not changed here. Use backlog move --to-branch instead.
  --commit COMMIT
      Record the commit the work has reached. The value cannot be cleared; an empty value is refused.
  --location LOCATION
      Record where the work is, as free text.
  --summary SUMMARY
      Replace the semantic summary of the item. With --close it also says what was delivered.
  --priority PRIORITY
      Move the item to this rank, an integer. 0 makes it the next item. The rest of the queue of the item's branch is
      renumbered to 0..N-1 around it; no other item is rewritten.
  --name NAME
      Replace the name of the item.
  --objective OBJECTIVE
      Replace the objective of the item.
  --seq SEQ
      Set the item number to this integer. Refused unless it is above the highest number ever used in the repository's backlog (numbers
      are never reused) and at most 1000000000, the highest number the CLI can use; the item then takes it and the number record follows.
  --size_score SIZE_SCORE
      Set the size score of the item, an integer.
  --restore
      Replace the item by its previous version: its content at the commit before the last one that changed it (the last
      committed content when the file has a local edit). An item with no earlier version is refused, and so is an earlier
      version that cannot be read either. A restored item records a restored event. This is the way out for an item
      that cannot be read, next to setting a wrongly typed key of a file that is valid JSON again (backlog update <item> --<key> <value>,
      for name or seq). It takes no other option.
  --append APPEND
      Append this text to the body of the item.
  --section HEADING
      Edit one list of the body: the lines of the block under the heading "## <HEADING>" (the block is created at the end
      of the body when it is missing). It takes exactly one of the four options below, which change the block's "- "
      lines; the rest of the body and the front matter stay byte for byte as they were.
  --set-lines TEXT
      With --section: the block becomes these lines: a JSON array gives one "- <entry>" line per element, any other text
      is written as given.
  --add-line ENTRY
      With --section: add the line "- <ENTRY>" at the end of the block (with --top at its start). ENTRY is one line.
  --top
      With --add-line: add at the start of the block.
  --remove-line N
      With --section: remove the Nth "- " line of the block (counted from 1).
  --move-line N:POSITION
      With --section: move the Nth "- " line of the block to POSITION among the "- " lines (both from 1; a position past
      the end puts the line last).
  --replan REPLAN
      The new leading order of the backlog, as comma-separated item numbers or slugs. It is a pure planning event
      and renumbers the backlog to 0..M-1; the order itself is the record, no event is written. No item argument is
      given with it.
  --note NOTE
      The note for the event log. Without it the log records which fields were set.
  --claim AGENT
      Take the item for AGENT. The command refuses when another agent holds the item, when an item in its
      depends_on is not done, or when a work-in-progress limit is reached; otherwise the item becomes in progress and
      claimed by that agent. An agent name may contain letters, digits, a period, an underscore, a hyphen and a colon.
  --release AGENT
      Give the item back, pending and unclaimed. Only the agent that holds it releases it. An item that is in a review
      keeps its status word. A wait recorded on the item is cleared.
  --close
      Complete the item; --summary says what was delivered and is required. The agent that holds the item closes it; an item
      nobody holds is closed by the agent named with --by. The owner closes on a written decision: --by owner --reason
      "<the decision>".
  --reason REASON
      With --close --by owner: the owner's decision, written into the closing entry.
  --by AGENT
      The agent that closes the item (--close). The default is the agent named by SMOOTH_BACKLOG_CLI_AGENT.
  --set-depends-on IDS
      Replace the depends_on of the item, as item numbers or slugs, owner/name#seq for an item of another repository, or
      the word none. The command refuses when a named item is not in this backlog, or not in the backlog repository. A
      not-done item of another repository blocks the claim like one of this backlog.
  --set-estimate MINUTES
      Replace the estimate_min of the item, the estimated minutes of work. It must be greater than 0.
  --set-complexity {low,medium,high}
      Replace the estimated complexity of the item.
  --set-layer {1,2,3,4,5,process}
      Replace the layer of the item: 1 to 5, or the word process.
  --set-chunk {yes,no}
      Mark the item as chunk work (small pieces done between items) or not.
  --severity {normal,critical}
      Change the item's severity (backlog new sets it, and starts a critical item at P0; backlog list critical lists
      the critical items). The item does not move: change its place with --priority.
  --dry-run
      Say what would change and change nothing: no file is written and nothing is committed.
${HELP_FLAG}

On success the command prints a line that starts with a check mark, the slug and the fields it set.

${EXIT}

Example:
  backlog update 18 --status in_progress --note "Started the help text"

An item that belongs to a team is changed by backlog team update only: this command refuses every change of it, field edits included,
and a --replan that names it (backlog team update --replan places it).
Team items: backlog team update --help.
`,

  next: `backlog next — show the next actionable item of this branch

Usage:
  backlog next [--json]
  backlog next all-branches [--json]

Prints the open item with the best priority on the branch that is checked out here, whole: its objective, summary and
progress, then its front matter and its body. It reads the backlog without changing it. When the queue is empty it says so
(with --json it prints {}). Critical items are announced in a banner first.
backlog next all-branches shows the next item over every branch of this repository (backlog next all-branches --help).

${SHARED}

Options:
  --json
      Print the item as machine-readable data.
${HELP_FLAG}

${EXIT}

Example:
  backlog next --json
`,

  list: `backlog list — the items of this branch: the open ones in queue order, then the finished ones; or one kind of item, the branches, the critical items, or every branch

Usage:
  backlog list [--json]
  backlog list new [--json]
  backlog list open [--json]
  backlog list done [--json]
  backlog list archive [--json]
  backlog list branches [--json]
  backlog list critical [--json]
  backlog list all-branches [--json]

Reads the backlog and never changes it. Without a word it prints the full stack of the branch that is checked out here: the open items in
queue order (priority 0 is next), then the finished ones. Each row shows the item's number, slug, status word (free text; closed, done and
archived are finished, every other word is open), priority and name, then its summary and every dependency on an item of another repository.
Items that are not on the queue because they name another repository or no branch are reported as findings above the queue. Open items of a
branch that no longer exists on the origin wait for a decision and are listed after the queue. With --json the command prints the data itself,
without any wrapper; each row also carries claimed_by and review_state, from the item's front matter.

${SHARED}

Words (at most one):
  new
      The full stack filtered to the items not started yet.
  open
      Every item that is not finished: the queue.
  done
      The finished items that are not archived.
  archive
      The archived items.
  branches
      One line per branch of this repository: the branch, its open items and its done items (with --json, a list of {branch, open, done}).
  critical
      Only the open items with severity critical, in a banner (with --json, the list of those items). When there is none it says so.
  all-branches
      The full stack of every branch of this repository, not only the one checked out here. Each row ends with the branch of its item,
      for example (branch main); with --json every item carries its branch.

Options:
  --json
      Print machine-readable output.
${HELP_FLAG}

${EXIT}

Example:
  backlog list open
`,

  show: `backlog show — print one item whole: its row, front matter and body

Usage:
  backlog show <item>[,<item>...] [--agent <name>] [--json]

Prints the item given by number or slug as JSON: the row of the item (number, slug, name, status, priority, branch, commit and the other columns),
its front_matter and its body. Several items given as a comma-separated list are printed as a JSON array, one object each, in the order given. The
command refuses (exit 1) when one of them does not exist, and then prints none of them. A file that cannot be read or parsed fails the command, as every
read does. The command never changes an item. The agent that shows an item has read it: its next write of that item is refused (exit 5) when somebody
else changed the item since, and the refusal says to show it again. The agent is --agent, else SMOOTH_BACKLOG_CLI_AGENT.

${SHARED}

Argument:
  <item>
      The item to show, by number or slug; several items, comma-separated.

Options:
  --agent AGENT
      The agent that has now read the item. Its next write of the item is checked against the version shown.
  --json
      Accepted for the sake of the other read commands; the output is JSON with or without it.
${HELP_FLAG}

${EXIT}

Example:
  backlog show 12
`,

  history: `backlog history — print the events of one item, or the latest 50 of the backlog

Usage:
  backlog history [<item>]

Prints the history that is kept in the item files, newest first, one line per event: the time, the event, the branch, the commit and the note.
With an item (number or slug) it prints the events of that item. Without one it prints the latest 50 events of the backlog, archived items
included. The command refuses (exit 1) when the item does not exist. It prints text only: --json is refused (exit 2). It never changes an item.

${SHARED}

Argument:
  <item>
      The item whose events to print, by number or slug. Optional.

Options:
${HELP_FLAG}

${EXIT}

Example:
  backlog history 12
`,

  changes: `backlog changes — which items of this repository changed since your last use

Usage:
  backlog changes [--agent <name>] [--json]

Prints which items changed since the last use of the calling agent. The reference is the agent's own last write or its own last
backlog changes, never a global timestamp, so a change made while the agent is idle still appears in its next report. Its commit and time are
stated in every result, also when it is empty. The items the agent holds (its name as owner, reviewer or refiner) are listed in a held
section, every other changed item under others; a file moved inside the folder (an archive, a renumbering) is one D entry for its old name.
The first use prints "no earlier use: reference set now" and sets the reference. The result also lists the agents that use the backlog and
their last-use time. Reading an item with backlog show does not move the reference.
It never changes an item; its one write is the agent's own reference. The report is printed before the reference is written, so a failed
output consumes no change. When the write of the reference fails, the result says so (with --json it prints {"reference_write": "failed"} after
the report), the exit is 0 and the previous reference is kept. When the comparison fails (the reference commit is no longer in the clone, for
example after a history rewrite) the command reports the failure (exit 2) and keeps the reference, so no change is lost.

${SHARED}

Options:
  --agent AGENT
      The agent whose last use is the reference. The default is SMOOTH_BACKLOG_CLI_AGENT, else the user.
  --json
      Print machine-readable output.
${HELP_FLAG}

${EXIT}

Example:
  backlog changes --agent ada
`,

  'next all-branches': `backlog next all-branches — show the next actionable item over every branch of this repository

Usage:
  backlog next all-branches [--json]

Prints the open item with the best priority over all branches of this repository, whole: its objective, summary and progress, then its
front matter and its body, the same as backlog next does for the branch checked out here. When there is no open item it says so (with --json
it prints {}). Critical items are announced in a banner first. It reads the backlog without changing it.

${SHARED}

Options:
  --json
      Print the item as machine-readable data.
${HELP_FLAG}

${EXIT}

Example:
  backlog next all-branches --json
`,

  done: `backlog done — finish one item that has no team

Usage:
  backlog done <item>

Finishes the item given by number or slug. It runs backlog update <item> --status done: the status becomes closed, the completion time is set,
the rest of the queue of the branch is renumbered, and the change records who made it and when. Every other argument after the item is passed on
to backlog update (see backlog update --help), so its refusals and its output are those of update: an item that does not exist, an item
that has a team (it is closed with backlog team update) and an item that someone else changed since this agent last read it (exit 5) are refused.

${SHARED}

Argument:
  <item>
      The item to finish, by number or slug. Required.

Options:
${HELP_FLAG}

${EXIT}

Example:
  backlog done 12
`,

  clean: `backlog clean — remove every item of this branch, or of every branch, after a typed yes

Usage:
  backlog clean [all-branches]

Asks "Type yes to continue" on standard error and reads the answer from standard input. Any other answer, or none, changes nothing and
exits 2. After a yes it removes every item file of the branch checked out here, archived items included, as one published change, and
the order of the other branches stays as it was. The removed items stay in the history of the backlog repository, and their numbers are never handed out again. Then it runs backlog
setup again (the configuration and the copies of the skill). It prints how many items were removed. With the word all-branches it removes the
items of every branch of this repository instead. When nothing is there to remove it says "0 items removed". No command deletes an item that
belongs to a team: when one lies in the scope (archived ones included), the command refuses before it asks (exit 1, nothing removed) and
names the items.

${SHARED}

Word:
  all-branches
      Remove the items of every branch of this repository, not only the one checked out here.

Options:
${HELP_FLAG}

${EXIT}

Example:
  backlog clean
`,

  import: `backlog import — move the open items of another branch to this branch

Usage:
  backlog import --branch <source> [--higher]

For every open item of the branch <source>, oldest first, it runs backlog move <item> --to-branch <the branch checked out here>. The items keep
their content and their history; finished and archived items stay where they are. With --higher the imported items then lead the queue, in
their original order (each gets priority 0, newest first). The queue of the branch is renumbered without gaps. The first step that fails stops
the sequence, and the output says what was done before it. When the source has no open item the command says so and exits 0; when no item
carries the branch name it says so too (check the name). The source cannot be the branch checked out here (exit 2). The command prints text
only: --json is refused (exit 2). An open item of a team is moved like any other and keeps its team and its state; with --higher it would
take a place in the queue, which a team item takes only from backlog team update --priority, so --higher refuses the whole import when the
source has one (exit 1, nothing moved).

${SHARED}

Options:
  --branch SOURCE
      The branch whose open items to bring here. Required.
  --higher
      Put the imported items first in the queue, in their original order. Without it they follow the items already queued.
${HELP_FLAG}

${EXIT}

Example:
  backlog import --branch feature --higher
`,

  'archive done': `backlog archive done — archive every finished item of this branch

Usage:
  backlog archive done

For every finished item (status closed or done, not archived yet) of the branch checked out here, oldest first, it runs backlog archive <item>: the
item leaves the work queue, is kept as archived, and the queue is renumbered. Open items stay. It prints which items it archived. When there is
no finished item it says so and exits 0. The first archive that fails stops the sequence, and the output says what was archived before it. A
closed item of a team is archived like any other. The command takes no other argument and prints text only: --json is refused (exit 2).

${SHARED}

Options:
${HELP_FLAG}

${EXIT}

Example:
  backlog archive done
`,

  fields: `backlog fields — show the item template: every field of an item and what it is for

Usage:
  backlog fields [--json]

Prints one line per field of an item, with five columns: the key the item file carries, the name the field is shown under, what it
means, who sets it, and when it is required. It reads nothing and changes nothing.

${SHARED}

Options:
  --json
      Print the table as a list of objects, one per field.
${HELP_FLAG}

${EXIT}

Example:
  backlog fields
`,

  move: `backlog move — move an item to another branch, or to another repository's folder, keeping its history

Usage:
  backlog move <item> --to-branch <name> [--note <text>]
  backlog move --all-open-of-branch <from> --to-branch <to> [--note <text>]
  backlog move <item> --to-repository [<owner/name>] [--note <text>]

Moves backlog items. With --to-branch the item now belongs to that branch of this repository. With
--all-open-of-branch every open item of one branch moves to another branch, for example after the branch was
merged. With --to-repository an item that names another repository goes to the folder of that repository in the
backlog repository; without a value it goes to the repository the item names, under a new item number there (one above the highest number the target ever used).
Every move is recorded as an event in the history of the item. An item that belongs to a team is moved like any other: the move files it
(its branch or repository, its place at the end of the queue there) and changes nothing of its team state (status, claim, review).

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
status is not closed and --force was not given. A closed item of a team is archived like any other; a team item that is not closed is
refused, with --force too (exit 1, nothing written): it leaves the queue by its team steps (backlog team update --close).

${SHARED}

Argument:
  <item>
      The item to archive, by number or slug. The word done archives every finished item of the branch (backlog archive done --help).

Options:
  --force
      Archive the item even if its status is not closed (not a team item that is not closed).
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
  1. finds the backlog folder: SMOOTH_BACKLOG_CLI_HOME when the variable is set; else the one the repository's configuration
     names; else, when a clone URL is set (the environment variable SMOOTH_BACKLOG_CLI_ORIGIN_URL, then the backlog_origin_url
     key of the configuration),
     ../<name> beside the repository (<name> from the URL); else .backlog inside the repository. With --ask it asks for
     the path, showing that default;
  2. clones the backlog repository there with git when the path does not exist and a clone URL is set (a clone that
     cannot be made is refused: exit 3, nothing changed); creates the folder when no URL is set; leaves an existing
     folder exactly as it is;
  3. creates the repository's .backlog folder (the configuration lives there; inside it the items too, by default) and
     writes .backlog/config.json {"backlog_repository": "<path relative to the repository>"} (".backlog" for the
     folder inside it) when there is no configuration yet, with --ask, or when the environment names the location
     (SMOOTH_BACKLOG_CLI_HOME, SMOOTH_BACKLOG_CLI_ORIGIN_URL — the clone URL is recorded as backlog_origin_url, so later runs need no
     variable); otherwise keeps it. A write keeps the file's other keys;
  4. replaces the backlog skill in every agent folder present (.agents, .claude, .github, .qwen) with this release's;
  5. commits and pushes what it wrote (the configuration and the skill copies) on the current branch, and prints a
     summary of every action: the .backlog folder, the configuration, the skill copies, the commit. No path is printed.

Every command finds the backlog folder in this order: SMOOTH_BACKLOG_CLI_HOME, the repository's configuration (.backlog/config.json,
backlog_repository: a path relative to the repository; .backlog means inside it; the root file .smooth-backlog.json of
earlier builds is still read), the per-user file <name>/home under the config folder ($XDG_CONFIG_HOME, else
~/.config; without the clone-URL setting, the only such file there), ~/git/<name> when a clone URL is set. When none of
them names one, the backlog is .backlog inside the repository, created with its configuration on first use. A
configured folder that is missing is refused (exit 4) naming backlog setup. A .backlog/config.json that exists but is not a JSON
object (a trailing comma, a half-written edit) stops every command that reads the repository's configuration, setup included, with exit 2 and writes nothing; a missing file is an
empty configuration; backlog upgrade, --help and --version do not read it and still work. setup commits and pushes what it wrote
(the configuration and the skill copies) on the current branch. Both locations are updated from their origin before every command and pushed after every change; nothing is written
into the repository being set up by that. Inside the repository, every change is committed on the current branch, with
the backlog's paths only, and the branch is pushed to origin under the same name, the user's own commits included; the
command then prints "<id> - <name> committed; all pending branch changes pushed". A branch the origin does not have yet
is created by the first push. A command that only reads and cannot reach the origin answers from the local copy with a
warning; a write is refused (exit 3).

Options:
  --ask
      Ask for the backlog repository path on standard input; an empty answer takes the default shown.
${HELP_FLAG}
Exit codes: 0 done; 2 a usage error or a folder that is no clone of the backlog repository; 3 the clone failed.

Example:
  backlog setup
`,
  upgrade: `backlog upgrade — update the backlog program itself from the package registry

Usage:
  backlog upgrade                Install the latest stable release when it is newer than this one
  backlog upgrade check          Look for a newer release and say which; install nothing
  backlog upgrade auto           Turn automatic updates on (patch and minor releases within this major version) and check now
  backlog upgrade off            Turn automatic updates off
  backlog upgrade disable        Turn the weekly check for a newer release off
  backlog upgrade <version>      Install exactly this release (for example 1.2.3) when it is newer than this one

backlog update is the item command; it never installs a program version, and called with nothing it prints its own help.

The program is replaced as a whole and only after the new one passed its own checks; a failed update leaves the installed
program as it was. Only installs made with npm (global or into a user prefix) are updated; the command never asks for
more privileges. The package registry must be configured for the @smoothsdlc scope (npm config set
@smoothsdlc:registry https://npm.pkg.github.com, then npm login --scope=@smoothsdlc --auth-type=legacy
--registry=https://npm.pkg.github.com with read:packages access); a missing setup is answered with these instructions.
The choices (weekly check, automatic updates, last check) are kept in a file of the user's configuration folder
(smooth-backlog-cli/config.json under $XDG_CONFIG_HOME, else ~/.config), never in a repository. It needs no backlog.

The update notice: any other backlog command that a person runs at a terminal (standard error is a terminal) also looks for a newer
release when the configuration says one is due. Defaults: the weekly check is on and automatic updates are off. A check is due about
once a week; with automatic updates on, about once a day; an hour after a check that failed. It runs beside the command and adds at most
1.5 seconds when it is still running after the command (a check that takes longer is stopped and counts as failed). It prints at most
one warning on standard error: "backlog: Version <x> is available; run backlog upgrade." (or the note that a new major release needs
backlog upgrade), or "backlog: Automatic update check failed: <reason>. Backlog work can continue; retry is eligible in one hour.". It never
changes the output or the exit code of the command, and nothing runs when standard error is not a terminal (agents and scripts), for --help,
--version, upgrade and setup. With automatic updates on, a compatible patch or minor release is installed by the check. backlog upgrade
disable turns the weekly check off and backlog upgrade off turns automatic updates off; with both off nothing is checked and no notice
appears (backlog upgrade check turns the weekly check on again).

Options:
  --json
      Print the result as JSON.
${HELP_FLAG}
Exit codes: 0 done; 1 the registry or npm could not be used, the install is not one the command can replace, or nothing may be written there; 2 a usage error.

Example:
  backlog upgrade check
`,
};
