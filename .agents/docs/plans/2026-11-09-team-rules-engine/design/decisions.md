# Decisions for the owner (team rules engine design)

Context: the design chapters 01 to 08 follow the binding rulings of `00-owner-rulings.md`. Two points are not decided by those rulings
and change what agents type or what the owner can run; they are listed here, numbered from 1. Everything else in the design is either a
ruling, a consequence of one, or a choice of the design recorded with its logic in its chapter.

## 1. Do `backlog team validate` and `backlog team migrate` need a team?

**Scenario.** A lead has edited `teams.json` in its working copy of the backlog repository, in a repository whose `.backlog/config.json`
has no `team` key, with no TEAM_NAME set. It runs `backlog team validate`. Later the owner, after upgrading the CLI, runs
`backlog team migrate` from the same place to convert every item to JSON.

**The problem.** Owner ruling R3b says that a team command with no team from `--team`, TEAM_NAME or the `team` key of
`.backlog/config.json` stops with an error naming the three ways, and both commands live under `backlog team`. Ruling R11 says
`backlog team validate` covers the whole file (the people, the item definition and every rule of every team), and ruling R4 says every
item migrates, items of every team and items without a team. Read literally, the lead's validate and the owner's migrate both stop with
the three-ways error although neither needs a team to do its job, and a team given to `migrate` would change nothing it does.

**Proposed implementation pattern.** In `src/team/cli.js` the dispatch resolves the team and the agent only for `backlog team new`,
`backlog team update`, `backlog team query` and `backlog team pop`; `validate` and `migrate` are dispatched before that resolution. The
three-ways error text stays exactly as ruled for the four commands. No file or field changes; the difference is which commands call the
resolution.

**Option A — validate and migrate take no team.** `backlog team validate` checks the whole file and every item; a team given by
`--team`, TEAM_NAME or the configuration narrows the report to that team's entry and items, so a lead sees only its own findings when it
wants. `backlog team migrate` converts everything and refuses `--team` with `❌ backlog: migrate converts every item; it takes no --team`
(exit 2), so nobody believes it converted only one team.

**Option B — every team command requires a team, as R3b reads.** `backlog team validate` without a team stops with the three-ways error;
with one it checks the file's shape, that team's entry and that team's items, and the other teams are checked only when their own leads
run it. `backlog team migrate` also requires a team and then converts every item anyway, so the team is a required input that changes
nothing, which the help must explain.

**Recommendation: A**, because it is the only reading under which R3b, R11 and R4 all hold: the three-ways error keeps guarding every
command that acts for a team, and the two commands that act on the whole file and the whole backlog do so without a meaningless input.

## 2. The command line of a team step

**Scenario.** A member of the parallel-work example team finished the parser of item 42 and hands it to the check with a note for the
checker. Today that is a fixed flag of the CLI (`backlog team update 42 --request-review any --note "..."`). With steps defined by each
team, the member types one of:

- A: `backlog team update 42 hand-to-check --note "parser done; run the unit tests"`
- B: `backlog team update 42 --step hand-to-check --note "parser done; run the unit tests"`
- C: `backlog team update 42 --step hand-to-check --arg note="parser done; run the unit tests"`

**The problem.** The CLI can no longer have one flag per step, because the steps are words a team writes in its rule set (owner ruling
R1); the step name and its arguments must reach the evaluator through one generic form. The form is typed in every skill, script and help
text of every team, so changing it later breaks all of them at once, and no ruling fixes it.

**Proposed implementation pattern.** `src/team/cli.js` reads the step name and passes it with the arguments to the evaluator. The step's
accepted arguments are the `$arg.<name>` references of the rules that name the step (chapter 03 section 5, function `stepArgs` of the
spike): no declaration in `teams.json`, and an argument the step does not take is refused with exit 2 naming the accepted ones (cases
COD-14, COD-15). A step name no rule names is refused with `❌ backlog: team <team> has no step <step> (steps: <names>)` (exit 2).
`backlog team update --help` lists the team's steps and arguments when a team is resolved. The names `team`, `agent`, `session`,
`repository`, `branch`, `json` and `dry-run` stay CLI flags and cannot be argument names (chapter 08).

**Option A — the step is a word after the item.** `backlog team update <item> <step> --<arg> <value>` reads like a sentence, and it is
the shape the owner already set for the CLI in reference/09-gap-resolution.md section 3 ("an option that is not required data is a
subcommand"). The parser must take the second positional word as the step, so a step name that looks like a number or a flag is refused by
validate.

**Option B — a `--step` flag, arguments as flags.** `backlog team update <item> --step <step> --<arg> <value>` keeps every word after the
item a flag, which scripts that build command lines from lists of flags handle easily. It is one flag longer on every line, and the step is
required data spelled as an option, against the owner's shape of commands.

**Option C — `--step` and `--arg name=value`.** The parser is fixed and knows no team's argument names at all, since every argument
arrives as `--arg name=value`. Every line is longer, quoting a value with `=` or spaces is error-prone for agents, and the help cannot show
a step's arguments as ordinary flags.

**Recommendation: A**, because it follows the owner's existing rule for the shape of commands, gives the shortest line in every skill, and
needs nothing beyond the argument derivation that all three options share.
