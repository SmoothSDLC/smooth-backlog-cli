# Commands and flags after the owner decisions of 2026-11-13

Each flag stands under the command form it is used with. `*` marks what does not exist on the branch head yet. `--help` is the only flag usable everywhere.

## Top level

- `backlog`: *prints the help (today it runs `backlog next`).
  - `--help`: print the general help.
  - `--version`: print the installed version.

## User commands

- `backlog setup`: choose where this repository's backlog lives and install the backlog skill.
  - `--ask`: ask for the backlog repository path on standard input.

- `backlog new --title <text> --description <text>`: add an item with its two required inputs; the CLI supplies the number, slug, repository, branch, times, writer, starting status and first history entry. The item is appended at the end of the queue.
  - `--title`: the title of the item (required).
  - `--description`: what the item is about (required).
  - `--ask`: ask on a terminal for the title and the description when they are not given.
  - *`--whatif`: say what would be created and change nothing.

- *`backlog new --file <item.json>`: add an item from a JSON file that fits the item schema; the CLI still supplies the number, slug, repository, branch, times and writer.
  - *`--file`: the JSON file of the item (required).
  - *`--whatif`: say what would be created and change nothing.

- `backlog update <item>`: set or change any property of one item after its creation.
  - *`--title`: replace the title.
  - *`--description`: replace the description.
  - `--append`: append text to the description.
  - `--section <heading>`: edit the list under one heading of the description, with exactly one of:
    - `--set-lines`: replace the block's lines.
    - `--add-line`: add a line at the end.
      - `--top`: add it at the start instead.
    - `--remove-line`: remove the Nth line.
    - `--move-line`: move the Nth line to a position.
  - `--status`: the new status word.
  - `--objective`: the result the item delivers, in one line.
  - `--summary`: what the item is for, in several sentences.
  - `--severity`: `normal` or `critical`; critical puts the item first.
  - `--priority`: move the item to this rank; 0 makes it next.
  - `--set-depends-on`: the items that must be finished first, or the word `none`.
  - *`--parent`: the item this one was split from.
  - `--set-estimate`: estimated minutes of work.
  - `--set-complexity`: `low`, `medium` or `high`.
  - `--set-layer`: 1 to 5, or the word `process`.
  - `--set-chunk`: `yes` or `no`: small work done between items.
  - `--size_score`: a whole number that sizes the item.
  - `--commit`: the commit the work has reached.
  - `--location`: where the work is, as free text.
  - `--seq`: set the item number, only above the highest ever used.
  - `--claim <agent>`: take the item for an agent.
  - `--release <agent>`: give the item back, pending and unclaimed.
  - `--close`: complete the item.
    - `--reason`: a reason written into the closing record.
    - `--by`: the agent that closes the item.
  - `--note`: a note for the history entry.
  - *`--whatif`: say what would change and change nothing.

- `backlog update --replan <item>,<item>,...`: set the new leading order of the backlog.
  - `--note`: a note for the history entry.

- `backlog update <item> --restore`: replace the item by its previous committed version. No other flag.

- `backlog done <item>`: finish one item. No flag.

- `backlog move <item> --to-branch <name>`: move one item to another branch, keeping its history.
  - `--note`: a note added to the move's history entry.

- `backlog move --all-open-of-branch <from> --to-branch <to>`: move every open item of one branch.
  - `--note`: a note added to each move's history entry.

- `backlog archive <item>`: archive a finished item.
  - `--force`: archive even when the status is not finished.
  - *`--whatif`: say what would be archived and change nothing.

- `backlog archive done`: archive every finished item of this branch. No flag.

- `backlog import --branch <source>`: move the open items of another branch to this branch.
  - `--higher`: put the imported items first in the queue.

- `backlog clean`: remove every item of this branch, after a typed yes. No flag.

- `backlog clean all-branches`: remove every item of every branch, after a typed yes. No flag.

- `backlog list`: the items of this branch.
  - `--json`: machine-readable output.
  - `--show-all`: also list team items, with their team.

- `backlog list new`, `backlog list open`, `backlog list done`, `backlog list archive`, `backlog list critical`, `backlog list branches`, `backlog list all-branches`: one kind of item, the branches that carry items, or the items of every branch.
  - `--json`: machine-readable output.
  - `--show-all`: also include team items.

- `backlog show <item>[,<item>...]`: print one or more items whole.
  - `--agent`: record that this agent has read the item, for the stale-write check.
  - `--json`: accepted; the output is JSON either way.
  - `--show-all`: also show a team item.

- `backlog next`: the next actionable item of this branch.
  - `--json`: machine-readable output.
  - `--show-all`: also consider team items.

- `backlog next all-branches`: the next actionable item over every branch.
  - `--json`: machine-readable output.
  - `--show-all`: also consider team items.

- `backlog history`: the latest 50 events of the backlog.
  - `--show-all`: also include team items, naming their team.

- `backlog history <item>`: the events of one item.
  - `--show-all`: also allow a team item.

- `backlog changes`: which items changed since your last use.
  - `--agent`: the agent whose last use is the reference.
  - `--json`: machine-readable output.
  - `--show-all`: also include team items, naming their team.

- `backlog fields`: every property of an item and what it is for, from the item schema.
  - `--json`: print the table as a list of objects.

- `backlog upgrade`: install the latest stable release when it is newer.
  - `--json`: print the result as JSON.
- `backlog upgrade check`: say whether a newer release exists; install nothing.
  - `--json`: print the result as JSON.
- `backlog upgrade auto`: turn automatic updates on and check now.
- `backlog upgrade off`: turn automatic updates off.
- `backlog upgrade disable`: turn the weekly check for a newer release off.
- `backlog upgrade <version>`: install exactly that release when it is newer.
  - `--json`: print the result as JSON.

## Team commands

- `backlog team pop`: what one agent does next; the first step the team's pop table offers is taken for the agent.
  - `--team`: the team whose pop table decides.
  - `--agent`: the agent the command answers for.
  - `--session`: the session id the rules see.
  - `--repository`: the repository whose backlog folder and team file are used.
  - `--branch`: the branch whose queue is used.
  - *`--whatif`: only answer; nothing is written or published.
  - `--json`: print the answer as JSON.

- *`backlog team new --title <text>`: file an item of a team through the team's "new" rule (today the flag is `--name`).
  - *`--title`: the title of the item (required).
  - `--<argument> <value>`: an argument of the step, as the team's rules define it.
  - `--team`: the team the item belongs to.
  - `--agent`: the agent that files the item.
  - `--session`: the session id the rules see.
  - `--repository`: the repository whose backlog folder and team file are used.
  - `--branch`: the branch the item is filed on.
  - `--json`: print the answer as JSON.

- `backlog team update <item> <step>`: take one step of the team's rules on an item.
  - `--<argument> <value>`: an argument of the step, as the team's rules define it.
  - `--team`: the team whose rules decide.
  - `--agent`: the agent that takes the step.
  - `--session`: the session id the rules see.
  - `--repository`: the repository whose backlog folder and team file are used.
  - `--branch`: the branch the step acts on.
  - `--json`: print the answer as JSON.

- `backlog team query`: list the team's items.
  - `--team`: the team whose items are listed.
  - `--show-all`: list the items of every team instead.
  - `--branch`: show one branch's queue; without it, every branch.
  - `--repository`: the repository whose backlog folder and team file are used.
  - `--json`: print the answer as JSON.

- `backlog team query <item>`: print one team item whole.
  - `--team`: the team the item belongs to.
  - `--show-all`: look in every team instead.
  - `--repository`: the repository whose backlog folder and team file are used.
  - `--json`: print the answer as JSON.

- `backlog team query filter <name>`: the items one of the team's named filters selects.
  - `--team`: the team whose filter is used.
  - `--agent`: the caller the filter's conditions see.
  - `--branch`: show one branch; without it, every branch.
  - `--repository`: the repository whose backlog folder and team file are used.
  - `--json`: print the answer as JSON.

- `backlog team query check <item> <step>`: say whether a step would be allowed and which rule decides; changes nothing.
  - `--<argument> <value>`: an argument of the step.
  - `--team`: the team whose rules decide.
  - `--agent`: the caller the rules see.
  - `--session`: the session id the rules see.
  - `--repository`: the repository whose backlog folder and team file are used.
  - `--json`: print the answer as JSON.

- `backlog team query plan`: what pop would offer, without taking it.
  - `--team`: the team whose pop table is read.
  - `--agent`: the caller the rules see.
  - `--repository`: the repository whose backlog folder and team file are used.
  - `--json`: print the answer as JSON.

- `backlog team query rules`: print the team's rule set.
  - `--team`: the team whose rules are printed.
  - `--show-all`: print the rules of every team instead.

- `backlog team query steps`: print the team's steps and their arguments.
  - `--team`: the team whose steps are printed.
  - `--json`: print the answer as JSON.

- `backlog team validate`: check the team file and the repository's items against it.
  - `--team`: print the findings for this team.
  - `--show-all`: print the findings of every team.
  - `--repository`: validate the team file of another repository of the backlog repository.
  - `--json`: print the findings as a JSON list.

- `backlog team migrate`: convert the markdown items of this repository's folder to JSON items.
  - `--team`: the team the command runs for.
  - `--show-all`: run for every team of the team file.
  - `--repository`: convert the folder of another repository of the backlog repository.
  - *`--whatif`: print what would be converted and change nothing.
  - `--json`: print the summary as JSON.
  - *`--ask`: repair missing or invalid fields of one team's items, one question at a time on a terminal. Needs `--team`; cannot be combined with `--show-all` or `--whatif`.
    - *`--agent`: the agent recorded as the writer of the repairs (required with `--ask`).

## Removed

- `--dry-run` on every command: replaced by `--whatif`.
- `backlog new`: `--name`, `--body`, `--objective`, `--summary`, `--context`, `--priority`, `--status`, `--severity`, `--split-from`, `--depends-on`, `--estimate`, `--complexity`, `--layer`, `--chunk`, `--show-all`.
- `backlog update <item> --name`: replaced by `--title`. `backlog update <item> --branch`: it was only ever refused.
- `backlog team new --name`: replaced by `--title`.
- `backlog move <item> --to-repository`, `backlog team define`, `backlog team workflow`: removed by the plan before these decisions.

## Under the owner's review (decision 7): `--show-all` on writing commands

Not in the structure above until the owner rules: `--show-all` on `backlog update`, `backlog update --replan`, `backlog done`, `backlog move`, `backlog archive`, `backlog archive done`, `backlog import` and `backlog clean`, and `backlog update <item> --set <field>=<value>` (which works only with it). `backlog update` and `backlog done` with the flag are built on an unmerged branch.
