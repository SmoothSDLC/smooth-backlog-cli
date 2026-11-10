# Backlog command reference

One backlog per repository and branch, one set of commands. An item is its number (`1`) or its slug
(`001-fix-the-login-redirect`). Priorities are ranks: P0 is next, the queue runs without gaps and is renumbered when
work is added, moved or finished. Commands never switch, merge, stage or commit the repository's own content; a git
working tree is required and a dirty tree is valid.

## Where the items live

The backlog is always a git repository, and every change to it is committed and pushed before the command exits. Where the
items live is a setting of the repository that changes no command, option, output or help text:

- the repository's `.backlog` folder holds the configuration (`.backlog/config.json`, written by `backlog setup` or on
  first use; environment variables override it) and, by default, the items themselves: every change is committed on
  the repository's current branch, with the backlog's paths only, and pushed to origin under the same branch name (the
  `.state/` folder - lock, views, journal - is ignored by git). The items ride with the branch: `backlog list all-branches` shows the items
  the checked-out branch carries, and a merge carries them across;
- or the configuration names a backlog folder elsewhere (`backlog_repository`, a path relative to the repository;
  `SMOOTH_BACKLOG_CLI_HOME` or the per-user file `~/.config/<name>/home` can name it too): a clone of a backlog repository shared
  by many repositories and people. Every command pulls it first and a command that changes an item commits and pushes
  the change before it exits. Its clone URL, for `backlog setup` to clone it, is the environment variable
  `SMOOTH_BACKLOG_CLI_ORIGIN_URL` or the `backlog_origin_url` key of the configuration. Nothing but the configuration is written
  into the repository itself. (The root file `.smooth-backlog.json` of earlier builds is still read.)

**Two writers never overwrite each other.** Every write records who made it (`--by`, `--claim` or `--agent`, else
`SMOOTH_BACKLOG_CLI_AGENT`, else `USER`) and when. A command that shows an item to an agent records what that agent saw; the
agent's next write to the item is refused with exit code 5 when somebody else changed it since, and the message says to
read it again (`backlog show <item> --agent <you>`). The same refusal comes when another writer's change reaches the shared
repository while this command is pushing: the change is taken back, never merged. A change that cannot be published
is rolled back, and the command exits 3.

## Who and which team

`SMOOTH_BACKLOG_CLI_AGENT` names the agent running a command; `SMOOTH_BACKLOG_CLI_SESSION` its session. Items of a team follow the team
rules - refinement before work, the team's review rules before the close, work-in-progress limits (`wip-limits.json`
in the backlog folder). Teams, their leads and members and their review rules are configuration in the backlog folder
(`teams.json`); a team session is bound by `SMOOTH_BACKLOG_CLI_TEAM_NAME`, `SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY` and `SMOOTH_BACKLOG_CLI_TEAM_BRANCH`. An item without a team is
not bound by them. An item of a team is filed by `backlog team new` and changed by `backlog team update` only;
`backlog update` refuses every change of it, and so do the other user commands that would change its team state (status, claim,
review, refinement, dependencies, its place in the team's queue, its deletion): `done`, `update --replan` naming it, `archive` of a
team item that is not closed (also with `--force`), `import --higher` and `clean`. A refusal is one line on standard output, exit 1,
and nothing is written. `move`, `archive` of a closed team item and `archive done` only file or store an item and work on a team item
like on any other.

## Output and exit codes

`--json` prints the data itself. Refusals and failures print one `❌ backlog: ...` line. Exit codes: 0 success;
1 refused (the reason on standard output); 2 invalid input or a failure; 3 idle (`team pop`: nothing to
do now) or a change that was not published; 4 the configured backlog repository is not cloned (run `backlog setup`);
5 stale view.

## The update notice

A command that a person runs at a terminal (standard error is a terminal) also checks the package registry for a newer release when the
user's configuration says one is due. The weekly check is on by default and automatic updates are off; a check is due about once a week,
about once a day with `backlog upgrade auto`, and an hour after a check that failed. The check runs beside the command and adds at most
1.5 seconds when it is still running after the command (a check that takes longer is stopped and counts as failed). It prints at most one
warning on standard error: `backlog: Version <x> is available; run backlog upgrade.`, the note that a new major release needs
`backlog upgrade`, or `backlog: Automatic update check failed: <reason>. Backlog work can continue; retry is eligible in one hour.`. It
never changes the output or the exit code of the command, and it installs nothing unless automatic updates are on. Nothing runs when
standard error is not a terminal (agents and scripts), for `--help`, `--version`, `upgrade` and `setup`. `backlog upgrade disable` turns
the weekly check off and `backlog upgrade off` turns automatic updates off; with both off nothing is checked. The choices are kept in
`smooth-backlog-cli/config.json` of the user's configuration folder (`$XDG_CONFIG_HOME`, else `~/.config`), never in a repository.

## Commands

The text of each command below is what `backlog <command> --help` prints. The commands that know nothing of teams come first,
the commands of `backlog team` follow. A word of a command that has a text of its own (`next all-branches`, `archive done`) has
its own entry; the other words (`list new|open|done|archive|branches|critical|all-branches`, `upgrade check|auto|off|disable|<version>`)
are described in the entry of their command. Nothing else is a command: an earlier spelling such as `backlog query` answers
"not a backlog command", or names the option it does not know.

### backlog setup

```text
backlog setup — choose where this repository's backlog lives and deploy the backlog skill

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
  5. replaces .backlog/team-templates with this release's generic team templates (scrum, extreme-programming, parallel,
     single-agent, patterns), so that a person can copy one to the team file and edit it there; no command reads a
     template, and an edited copy or a file added to that folder is lost at the next setup. A symbolic link anywhere on the
     way to a skill copy or to the folder is refused (exit 2, naming the path relative to the repository, nothing changed);
  6. commits and pushes what it wrote (the configuration, the team templates and the skill copies) on the current branch,
     and prints a summary of every action: the .backlog folder, the configuration, the team templates, the skill copies,
     the commit. No path is printed.

Every command finds the backlog folder in this order: SMOOTH_BACKLOG_CLI_HOME, the repository's configuration (.backlog/config.json,
backlog_repository: a path relative to the repository; .backlog means inside it; the root file .smooth-backlog.json of
earlier builds is still read), the per-user file <name>/home under the config folder ($XDG_CONFIG_HOME, else
~/.config; without the clone-URL setting, the only such file there), ~/git/<name> when a clone URL is set. When none of
them names one, the backlog is .backlog inside the repository, created with its configuration on first use. A
configured folder that is missing is refused (exit 4) naming backlog setup. A .backlog/config.json that exists but is not a JSON
object (a trailing comma, a half-written edit) stops every command that reads the repository's configuration, setup included, with exit 2 and writes nothing; a missing file is an
empty configuration; backlog upgrade, --help and --version do not read it and still work. setup commits and pushes what it wrote
(the configuration, the team templates and the skill copies) on the current branch. Both locations are updated from their origin before every command and pushed after every change; nothing is written
into the repository being set up by that. Inside the repository, every change is committed on the current branch, with
the backlog's paths only, and the branch is pushed to origin under the same name, the user's own commits included; the
command then prints "<id> - <name> committed; all pending branch changes pushed". A branch the origin does not have yet
is created by the first push. A command that only reads and cannot reach the origin answers from the local copy with a
warning; a write is refused (exit 3).

Options:
  --ask
      Ask for the backlog repository path on standard input; an empty answer takes the default shown.
  --help
      Print this text and exit. Nothing is read or changed.
Exit codes: 0 done; 2 a usage error or a folder that is no clone of the backlog repository; 3 the clone failed.

Example:
  backlog setup
```

### backlog new

```text
backlog new — add an item to the backlog of this repository, or split a sibling off an existing item

Usage:
  backlog new --name <text> --depends-on <items|none> [options]
  backlog new --split-from <item> --depends-on <items|none> [options]

Adds or splits an item. The item gets the next item number: one above the highest number the repository's backlog ever used (its
history, every branch, and a number record committed with the item), so a number of a deleted, cleaned or archived item is never
handed out again. A shallow clone refuses (exit 2): run git fetch --unshallow. The item is added to the backlog of this repository in the
backlog repository, and the whole backlog is renumbered so that the priorities run from 0 without gaps. An item is
named by its number or by its slug, for example 018-help-text, and the output names it the same way.
The item belongs to the branch that is checked out in the repository you run the command in.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

On success the command prints a line that starts "created phase" with the item's slug, the item number and the rank
the item now has, and a line about the renumbered backlog. A critical item is announced in a banner first.

The item template (backlog fields prints the same table):

key           type                    default                                              set by                                                                                             meaning
seq           number                  the next free number                                 the CLI                                                                                            The item's number in this repository, never reused
slug          text                    the number and the title                             the CLI                                                                                            The name an item is addressed by in every command
name          text                    none, always given                                   backlog new --title, backlog update --name                                                         A short title of the item
repository    text                    the repository of the folder                         the CLI                                                                                            The repository the item belongs to
branch        text                    the branch of the caller                             the CLI, backlog move                                                                              The branch the item belongs to
created       time                    the time of creation                                 the CLI                                                                                            When the item was created
updated       time                    the time of the last change                          the CLI                                                                                            When the item last changed
updated_by    text                    the agent named, else the user of the configuration  the CLI                                                                                            Who changed the item last
status        text                    pending                                              backlog new --status, backlog update --status, backlog update --claim and --release, backlog done  Where the item is, a free word stored as typed; closed, done and archived finish an item
objective     text                    the title                                            backlog new --objective, backlog update --objective                                                The result the item delivers, one line
summary       text                    empty                                                backlog new --summary, backlog update --summary                                                    Several sentences about what the item is for; it routes new work to the right item
location      text                    empty                                                backlog update --location                                                                          Free text: where the work is
commit        text                    the commit of HEAD at creation                       the CLI, backlog update --commit                                                                   The commit the work has reached
severity      text: normal, critical  normal                                               backlog new --severity, backlog update --severity                                                  A critical item is placed first
owner         text                    the user of the configuration                        the CLI, backlog update --claim and --release                                                      The agent working on the item; outside a team, the user the item belongs to
owned_since   time                    empty                                                the CLI                                                                                            When the agent took the item; empty while nobody holds it
depends_on    items                   empty list                                           backlog new --depends-on, backlog update --set-depends-on                                          The items that must be finished first
parent        item                    none                                                 backlog new --split-from (written from the split-link batch on; not written yet)                   The item this one was split from
estimate_min  number                  empty                                                backlog new --estimate, backlog update --set-estimate                                              Minutes of work, a whole number
complexity    text                    empty                                                backlog new --complexity, backlog update --set-complexity                                          low, medium or high
layer         text                    empty                                                backlog new --layer, backlog update --set-layer                                                    1 to 5 or process
chunk         boolean                 empty                                                backlog new --chunk, backlog update --set-chunk                                                    Small pieces of work any member does between items
size_score    number                  empty                                                backlog update --size_score                                                                        A whole number that sizes the item
completed     time                    empty                                                backlog done, backlog update --close                                                               When the item was closed

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog new --name "Fix login" --objective "An expired cookie no longer blocks sign-in" --summary "Login cookie handling" --depends-on none

A team's items are filed by backlog team new, and a split of a team's item is refused here.
Team items: backlog team new --help.
```

### backlog update

```text
backlog update — change the fields of one item, move it in the queue, or re-plan the whole backlog

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

On success the command prints a line that starts with a check mark, the slug and the fields it set.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog update 18 --status in_progress --note "Started the help text"

An item that belongs to a team is changed by backlog team update only: this command refuses every change of it, field edits included,
and a --replan that names it (backlog team update --replan places it).
Team items: backlog team update --help.
```

### backlog done

```text
backlog done — finish one item that has no team

Usage:
  backlog done <item>

Finishes the item given by number or slug. It runs backlog update <item> --status done: the status becomes closed, the completion time is set,
the rest of the queue of the branch is renumbered, and the change records who made it and when. Every other argument after the item is passed on
to backlog update (see backlog update --help), so its refusals and its output are those of update: an item that does not exist, an item
that has a team (it is closed with backlog team update) and an item that someone else changed since this agent last read it (exit 5) are refused.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Argument:
  <item>
      The item to finish, by number or slug. Required.

Options:
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog done 12
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
backlog repository; without a value it goes to the repository the item names, under a new item number there (one above the highest number the target ever used).
Every move is recorded as an event in the history of the item. An item that belongs to a team is moved like any other: the move files it
(its branch or repository, its place at the end of the queue there) and changes nothing of its team state (status, claim, review).

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
backlog archive — archive a finished item: it leaves the work queue and is kept as archived

Usage:
  backlog archive <item> [--force] [--dry-run]

Archives an item given by number or slug: the item leaves the work queue, is kept as archived in the backlog
repository and its status becomes archived; the output names it by its slug. The command records an event and
renumbers the remaining backlog to 0..M-1, because archiving takes the item off the backlog. Archiving an item
that is already archived does nothing and says so. The command refuses when the item does not exist, or when its
status is not closed and --force was not given. A closed item of a team is archived like any other; a team item that is not closed is
refused, with --force too (exit 1, nothing written): it leaves the queue by its team steps (backlog team update --close).

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Argument:
  <item>
      The item to archive, by number or slug. The word done archives every finished item of the branch (backlog archive done --help).

Options:
  --force
      Archive the item even if its status is not closed (not a team item that is not closed).
  --dry-run
      Say which item would be archived and change nothing: nothing is moved and nothing is committed.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog archive 12
```

### backlog archive done

```text
backlog archive done — archive every finished item of this branch

Usage:
  backlog archive done

For every finished item (status closed or done, not archived yet) of the branch checked out here, oldest first, it runs backlog archive <item>: the
item leaves the work queue, is kept as archived, and the queue is renumbered. Open items stay. It prints which items it archived. When there is
no finished item it says so and exits 0. The first archive that fails stops the sequence, and the output says what was archived before it. A
closed item of a team is archived like any other. The command takes no other argument and prints text only: --json is refused (exit 2).

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog archive done
```

### backlog import

```text
backlog import — move the open items of another branch to this branch

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --branch SOURCE
      The branch whose open items to bring here. Required.
  --higher
      Put the imported items first in the queue, in their original order. Without it they follow the items already queued.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog import --branch feature --higher
```

### backlog clean

```text
backlog clean — remove every item of this branch, or of every branch, after a typed yes

Usage:
  backlog clean [all-branches]

Asks "Type yes to continue" on standard error and reads the answer from standard input. Any other answer, or none, changes nothing and
exits 2. After a yes it removes every item file of the branch checked out here, archived items included, as one published change, and
the order of the other branches stays as it was. The removed items stay in the history of the backlog repository, and their numbers are never handed out again. Then it runs backlog
setup again (the configuration and the copies of the skill). It prints how many items were removed. With the word all-branches it removes the
items of every branch of this repository instead. When nothing is there to remove it says "0 items removed". No command deletes an item that
belongs to a team: when one lies in the scope (archived ones included), the command refuses before it asks (exit 1, nothing removed) and
names the items.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Word:
  all-branches
      Remove the items of every branch of this repository, not only the one checked out here.

Options:
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog clean
```

### backlog list

```text
backlog list — the items of this branch: the open ones in queue order, then the finished ones; or one kind of item, the branches, the critical items, or every branch

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog list open
```

### backlog show

```text
backlog show — print one item whole: its row, front matter and body

Usage:
  backlog show <item>[,<item>...] [--agent <name>] [--json]

Prints the item given by number or slug as JSON: the row of the item (number, slug, name, status, priority, branch, commit and the other columns),
its front_matter and its body. Several items given as a comma-separated list are printed as a JSON array, one object each, in the order given. The
command refuses (exit 1) when one of them does not exist, and then prints none of them. A file that cannot be read or parsed fails the command, as every
read does. The command never changes an item. The agent that shows an item has read it: its next write of that item is refused (exit 5) when somebody
else changed the item since, and the refusal says to show it again. The agent is --agent, else SMOOTH_BACKLOG_CLI_AGENT.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Argument:
  <item>
      The item to show, by number or slug; several items, comma-separated.

Options:
  --agent AGENT
      The agent that has now read the item. Its next write of the item is checked against the version shown.
  --json
      Accepted for the sake of the other read commands; the output is JSON with or without it.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog show 12
```

### backlog next

```text
backlog next — show the next actionable item of this branch

Usage:
  backlog next [--json]
  backlog next all-branches [--json]

Prints the open item with the best priority on the branch that is checked out here, whole: its objective, summary and
progress, then its front matter and its body. It reads the backlog without changing it. When the queue is empty it says so
(with --json it prints {}). Critical items are announced in a banner first.
backlog next all-branches shows the next item over every branch of this repository (backlog next all-branches --help).

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --json
      Print the item as machine-readable data.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog next --json
```

### backlog next all-branches

```text
backlog next all-branches — show the next actionable item over every branch of this repository

Usage:
  backlog next all-branches [--json]

Prints the open item with the best priority over all branches of this repository, whole: its objective, summary and progress, then its
front matter and its body, the same as backlog next does for the branch checked out here. When there is no open item it says so (with --json
it prints {}). Critical items are announced in a banner first. It reads the backlog without changing it.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --json
      Print the item as machine-readable data.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog next all-branches --json
```

### backlog history

```text
backlog history — print the events of one item, or the latest 50 of the backlog

Usage:
  backlog history [<item>]

Prints the history that is kept in the item files, newest first, one line per event: the time, the event, the branch, the commit and the note.
With an item (number or slug) it prints the events of that item. Without one it prints the latest 50 events of the backlog, archived items
included. The command refuses (exit 1) when the item does not exist. It prints text only: --json is refused (exit 2). It never changes an item.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Argument:
  <item>
      The item whose events to print, by number or slug. Optional.

Options:
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog history 12
```

### backlog changes

```text
backlog changes — which items of this repository changed since your last use

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --agent AGENT
      The agent whose last use is the reference. The default is SMOOTH_BACKLOG_CLI_AGENT, else the user.
  --json
      Print machine-readable output.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog changes --agent ada
```

### backlog fields

```text
backlog fields — show the item template: every field of an item and what it is for

Usage:
  backlog fields [--json]

Prints the built-in definition of an item without a team, one line per key, with five columns: the key the item file carries, its
type (with the words a text field is meant to hold), its default, who sets it, and what it means. The keys every item file carries
(seq, slug, name, repository, branch, created, updated, updated_by) come first, then the fields; the item file also holds the containers
fields, body and history, which are not rows of this table. It reads nothing and changes nothing.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --json
      Print the table as a list of objects, one per key, with the five column names as keys.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog show <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog fields
```

### backlog upgrade

```text
backlog upgrade — update the backlog program itself from the package registry

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
  --help
      Print this text and exit. Nothing is read or changed.
Exit codes: 0 done; 1 the registry or npm could not be used, the install is not one the command can replace, or nothing may be written there; 2 a usage error.

Example:
  backlog upgrade check
```

### backlog team

```text
backlog team — the commands that know a team: pop, new, update, query, define, workflow

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --team NAME
      The team (pop, new, update). In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set) it must be that team.
  --agent AGENT
      The agent the command answers for (pop, new, update). In a team session (SMOOTH_BACKLOG_CLI_AGENT set) it must be that agent.
  --json
      Print the answer as JSON.
  --help
      Print this text and exit. Nothing is read or changed.

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
```

### backlog team pop

```text
backlog team pop — what one agent of a team does next, marked as theirs, with the whole item

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

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
```

### backlog team new

```text
backlog team new — file an item of a team: it starts in stage refining, where a member writes it

Usage:
  backlog team new --team <name> --agent <name> --name <text> [options]
  backlog team new --team <name> --agent <name> --split-from <item> [options]

Adds an item that belongs to the team, to the backlog of this repository and branch (a session bound by SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY and
SMOOTH_BACKLOG_CLI_TEAM_BRANCH files it under that repository and branch). The item gets the next item number (one above the highest number the repository's backlog ever used, so the number of a deleted, cleaned or archived item is never handed out again), the team, the status new and the
stage refining; a member refines it, and the team's review of the refinement passes before anyone claims it. A split of a team's
item (--split-from) is made here too: backlog new used outside a team refuses it. Every option of backlog new works here (backlog new --help
has the item template); this command adds --review-refs. The agent is the writer of the item, as for every team command.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

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
```

### backlog team update

```text
backlog team update — take one team step on an item: claim, release, review, close, hand-off and the refinement steps

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes: 0 the step was taken (--dry-run: it would be); 1 refused (the reason on standard output, ❌ ...); 2 invalid input; 3 the
update of the backlog repository failed before the change, or the change was not published and was rolled back; 5 the item was changed
by somebody else after this agent last read it (backlog team query --phase <item> --agent <you>).

Example:
  backlog team update 18 --team cli-1 --agent ann --claim
```

### backlog team query

```text
backlog team query — read the backlog through the team's views

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes: 0 success; 1 refused (for example a team without an entry); 2 invalid input; 3 the update of the backlog repository failed.

Example:
  backlog team query --team cli-1 --agent ann --claimable --json
```

### backlog team define

```text
backlog team define — register a team in the backlog configuration

Usage:
  backlog team define --file <team.json> [--json]

backlog team define registers one team from a JSON file { "name", "lead", "members": [..], "review_only": [..] (members who review and never claim), "external_reviewers": [..], "workflow": "<flow,
default team>", "review": [{ "stage", "reviewers": "members"|"external_reviewers", "count" }] (default: the flow's), "wip": { "agent", "team" } }.
Every field is checked (the lead is not a member, the stages are stages of the flow, an external stage needs external reviewers) and each
problem is printed, one per line, exit 2, with nothing written. The entry is added to teams.json at the root of the backlog beside the
others, committed and pushed ("team <name> defined"); the same definition again changes nothing. A team that has open items is not replaced:
register the new composition under another name.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --file FILE
      The JSON file of the team definition.
  --json
      Print the answer as JSON.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes: 0 the team was defined (or the same definition again: nothing changed); 2 invalid input or a definition with problems
(each printed, nothing written); 3 the update of the backlog repository failed or the change was not published.

Example:
  backlog team define --file team.json
```

### backlog team workflow

```text
backlog team workflow — register a flow definition, or show one

Usage:
  backlog team workflow --file <flow.json> [--json]
  backlog team workflow --show <name>

backlog team workflow registers a flow the same way a team is registered, into workflows.json after the checks of the flow (every
open status can reach closed); --show prints a registered or the shipped flow.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --file FILE
      The JSON file of the flow definition.
  --show NAME
      Print one registered flow, or the shipped one.
  --json
      Print the answer as JSON.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes: 0 the flow was registered or shown; 2 invalid input or a flow with problems (each printed, nothing written); 3 the update
of the backlog repository failed or the change was not published.

Example:
  backlog team workflow --show default
```
