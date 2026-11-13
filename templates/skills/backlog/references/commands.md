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
A user command does not see an item that belongs to a team: `list`, `next`, `show`, `history` and the counts leave it out, the queue and the priorities count only the other items, and a command that names it answers as for an item that does not exist (`no phase '<item>'`). An item that lists a team item in `depends_on` reads as depending on a missing item. `clean` still refuses to remove a team item in its scope.

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
     the commit. No absolute path is printed.
     Once the configuration defines a backlog folder (after every setup), setup also prints one line: that the backlog has not been
     migrated to JSON items and to run backlog team migrate, or when and by which version it was last migrated (the migrated_at and
     migrated_by_version keys of the configuration). It reads no item and never migrates.

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
      The status the item starts in, any word, stored exactly as typed (closed, done and archived are the finished words; every other word is open); the default is pending.
  --severity {normal,critical}
      The default is normal. Critical means a finding about repository corruption, data loss, the source of truth
      or security. It puts the item at priority 0 (unless --priority is given) and makes backlog list and backlog next print it in
      a loud banner so that it is never buried.
  --split-from ITEM
      Create a sibling item that inherits the context of this item (a number or a slug). The new item's parent field holds the
      number of that item, and its body names it and carries its text. The command refuses when the item does not exist.
  --description DESCRIPTION, --body BODY
      The description of the item (--body is the same option under its earlier word): the initial body of the item, the hand-over content for whoever does it. When the body has no "Definition of
      done" heading or line with checkable lines, a placeholder checklist is added.
  --depends-on DEPENDS_ON
      The item numbers or slugs that must be done first, comma-separated, or the word none (the default). owner/name#seq names
      an item of another repository's backlog in the same backlog repository. The command refuses when a named item is
      not in this backlog, or not in the backlog repository. An item that belongs to a team reads as not in this backlog, unless
      --show-all is given.
  --estimate MINUTES
      The estimated minutes of work, an integer (the front matter key estimate_min).
  --complexity {low,medium,high}
      The estimated complexity of the item.
  --layer {1,2,3,4,5,process}
      The layer of the item: 1 to 5, or the word process.
  --chunk
      Chunk work: small pieces done between items (the front matter key chunk: true).
  --dry-run
      Say which item would be created and change nothing: nothing is written and nothing is committed.
  --ask
      Ask for the fields you did not give, on a terminal: the title, the objective, the summary and the body, one question after the
      other (the body ends with an empty line). The questions go to standard error, an empty answer leaves a field out, and what the
      command prints on standard output is what it prints without --ask. Without a terminal (standard input and standard error) the
      command refuses, exit 2, and creates nothing. Every other option still applies, and a field given as an option is not asked.
  --show-all
      Let --depends-on name an item that belongs to a team. The new item has no team and no other item is changed. --split-from of a
      team item stays refused.
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
status        text                    pending                                              backlog new --status, backlog update --status, backlog update --claim and --release, backlog done  Where the item is, a free word stored exactly as typed; the finished words are closed, done and archived
objective     text                    the title                                            backlog new --objective, backlog update --objective                                                The result the item delivers, one line
summary       text                    empty                                                backlog new --summary, backlog update --summary                                                    Several sentences about what the item is for; it routes new work to the right item
location      text                    empty                                                backlog update --location                                                                          Free text: where the work is
commit        text                    the commit of HEAD at creation                       the CLI, backlog update --commit                                                                   The commit the work has reached
severity      text: normal, critical  normal                                               backlog new --severity, backlog update --severity                                                  A critical item is placed first
owner         text                    the user of the configuration                        the CLI, backlog update --claim and --release                                                      The agent working on the item; outside a team, the user the item belongs to
owned_since   time                    empty                                                the CLI                                                                                            When the agent took the item; empty while nobody holds it
depends_on    items                   empty list                                           backlog new --depends-on, backlog update --set-depends-on                                          The items that must be finished first
parent        item                    none                                                 backlog new --split-from                                                                           The item this one was split from
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

A team's items are filed by backlog team new, and a team's item is not seen here, so it cannot be split (--split-from: no phase '<item>').
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
      The new status, any word, stored exactly as typed (in_progress stays in_progress, and is an ordinary open word: only the exact word "in progress" counts as started). closed finishes the item and completes
      it; done is a finished word too and sets the completion time as well; archived is refused (backlog archive
      moves a finished item); any other word is free text and keeps the item open.
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
      version that cannot be read either. A restored item records a restore entry. This is the way out for an item
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
  backlog update 18 --status "in progress" --note "Started the help text"

An item that belongs to a team is not seen by this command (no phase '<item>'); a --replan that names one leaves the team entries
of the queue where they are.
Team items: backlog team update --help.
```

### backlog done

```text
backlog done — finish one item that has no team

Usage:
  backlog done <item>

Finishes the item given by number or slug. It runs backlog update <item> --status closed: the status becomes closed, the completion time is set,
the rest of the queue of the branch is renumbered, and the change records who made it and when. Every other argument after the item is passed on
to backlog update (see backlog update --help), so its refusals and its output are those of update: an item that does not exist (an item that has a team is not seen: no phase '<item>') and an item that someone else changed since this agent last read it (exit 5) are refused.

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
Every move is recorded as an event in the history of the item. An item that belongs to a team is not seen by the move (no item '<item>' in the backlog).

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
repository and keeps the status it had: an item is archived by where it is stored, no status word says so (an item archived by an earlier
version, which holds the status archived, reads the same). The output names it by its slug. The command records an event and
renumbers the remaining backlog to 0..M-1, because archiving takes the item off the backlog. Archiving an item
that is already archived does nothing and says so. The command refuses when the item does not exist, or when its
status is not finished (closed or done) and --force was not given. An item that belongs to a team is not seen by the archive (no phase '<item>').

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
      Archive the item even if its status is not finished (closed or done).
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
team item is not seen by it. The command takes no other argument and prints text only: --json is refused (exit 2).

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
only: --json is refused (exit 2). An item of a team is not seen by the import: it stays on its branch.

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
  backlog list [--json] [--show-all]
  backlog list new [--json] [--show-all]
  backlog list open [--json] [--show-all]
  backlog list done [--json] [--show-all]
  backlog list archive [--json] [--show-all]
  backlog list branches [--json] [--show-all]
  backlog list critical [--json] [--show-all]
  backlog list all-branches [--json] [--show-all]

Reads the backlog and never changes it. Without a word it prints the full stack of the branch that is checked out here: the open items in
queue order (priority 0 is next), then the finished ones. Each row shows the item's number, slug, status word (free text; closed, done and
archived are finished, every other word is open), priority and name, then its summary and every dependency on an item of another repository.
Items that are not on the queue because they name another repository or no branch are reported as findings above the queue. Open items of a
branch that no longer exists on the origin wait for a decision and are listed after the queue. With --json the command prints the data itself,
without any wrapper; each row also carries claimed_by and review_state, as stored in the item's file (empty when the item holds none).

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
  --show-all
      Also see the items that belong to a team (listed with their team). Without it they are left out, as if they did not exist.
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
  backlog show <item>[,<item>...] [--agent <name>] [--json] [--show-all]

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
  --show-all
      Also see the items that belong to a team (listed with their team). Without it they are left out, as if they did not exist.
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
  backlog next [--json] [--show-all]
  backlog next all-branches [--json] [--show-all]

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
  --show-all
      Also see the items that belong to a team (listed with their team). Without it they are left out, as if they did not exist.
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
  backlog next all-branches [--json] [--show-all]

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
  --show-all
      Also see the items that belong to a team (listed with their team). Without it they are left out, as if they did not exist.
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
  backlog history [<item>] [--show-all]

Prints the history that is kept in the item files, newest first, one line per entry. Every command that changes an item adds one entry to it: the time, the step (the command that wrote the entry: new, update, done, archive, move, restore, renumber; a team command keeps its own step word), who made it, the keys that changed
as key: before -> after (a key that did not exist reads null; updated, updated_by and the history itself are not listed) and the note (--note, else the planning sentence of the command). An entry of an item made before
entries carried a writer and the changes prints as it did: the time, the event, the branch, the commit and the note.
With an item (number or slug) it prints the events of that item. Without one it prints the latest 50 events of the backlog, archived items
included. The command refuses (exit 1) when the item does not exist. It prints text only: --json is refused (exit 2). It never changes an item.
With --show-all the entries of an item that belongs to a team are listed too, each line ending with (team <name>).

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

Argument:
  <item>
      The item whose events to print, by number or slug. Optional.

Options:
  --show-all
      Also see the items that belong to a team (listed with their team). Without it they are left out, as if they did not exist.
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
  backlog changes [--agent <name>] [--json] [--show-all]

Prints which items changed since the last use of the calling agent. The reference is the agent's own last write or its own last
backlog changes, never a global timestamp, so a change made while the agent is idle still appears in its next report. Its commit and time are
stated in every result, also when it is empty. The items without a team that the agent holds (its name in claimed_by) are listed in a held
section, every other changed item under others; a file moved inside the folder (an archive, a renumbering) is one D entry for its old name.
A removed item whose earlier version cannot be read from the clone is listed only with --show-all, because it may belong to a team.
With --show-all the line of an item that belongs to a team ends with (team <name>), and its --json entry carries team.
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
  --show-all
      Also see the items that belong to a team (listed with their team). Without it they are left out, as if they did not exist.
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
backlog team — the commands that know a team: pop, new, update, query, validate, migrate, define, workflow

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
  1  The step was refused or could not be run: the reason is printed. Also: a synchronisation failure, or the team has no entry in the configuration.
  2  Invalid input: a missing --team or --agent, another team than SMOOTH_BACKLOG_CLI_TEAM_NAME, an agent other than SMOOTH_BACKLOG_CLI_AGENT, no branch (a
     detached HEAD without SMOOTH_BACKLOG_CLI_TEAM_BRANCH), or a definition with problems.
  3  idle: nothing to do now (pop; only the idle answer exits 3, a failure of pop is exit 1).
  5  The item was changed by somebody else after this agent last read it (read it again: backlog team query <item> --team <name>).

Example:
  backlog team pop --team cli-1 --agent ann --json
```

### backlog team pop

```text
backlog team pop — what one agent of a team does next: the first step the team's pop table offers, taken for the agent

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  A step was offered and taken (or, with --dry-run, would be taken); the item is printed.
  1  The step could not be published (the push was refused, the branch kept changing) or the backlog could not be updated from its origin: the reason is printed and nothing is left behind.
  2  Invalid input: a missing team or agent, an argument the command does not take, no branch (a detached HEAD), an invalid team file,
     or a pop table or rule that is malformed. An older git than 2.40 is refused too: "team commands need git 2.40 or later (found <version>)"; nothing the command wrote is left behind.
  3  idle: nothing to do now. Only the idle answer exits 3.

Example:
  backlog team pop --team cli-1 --agent ann --json
```

### backlog team new

```text
backlog team new — file an item of a team: the step "new" of the team's rules on a fresh item

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

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
```

### backlog team update

```text
backlog team update — take one step of the team's rules on an item: claim, release, review, close, ...

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

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
```

### backlog team query

```text
backlog team query — read the team's items and the answers of its rules

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

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
SMOOTH_BACKLOG_CLI_RUN_HOOK names an executable, and no child process when the variable is unset.

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
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes: 0 success; 1 refused (for example a team without an entry, an item of another team, an unknown filter); 2 invalid input; 3 the update of the backlog repository failed.

Example:
  backlog team query filter waiting --team parallel --json
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

### backlog team validate

```text
backlog team validate — check the team file and the items of this repository against it

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
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  No error; warnings may be printed.
  1  The named team has no entry in the file.
  2  The file has at least one error (the whole file counts, not only the named team), is not JSON, is missing, or the input is invalid.

Example:
  backlog team validate --team web
```

### backlog team migrate

```text
backlog team migrate — convert the markdown items of this repository's folder to JSON items

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
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  Converted, or nothing to convert.
  1  The named team has no entry in the team file.
  2  The run stopped (every case is listed) or the input is invalid; nothing was written. An older git than 2.40 is refused too:
     "team commands need git 2.40 or later (found <version>)"; nothing the command wrote is left behind.
  3  The change could not be published: it was rolled back, or (no origin remote) it stays committed on the branch.

Example:
  backlog team migrate --show-all --dry-run
```
