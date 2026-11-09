# Decisions for the owner (team rules engine design)

Context: the design chapters 01 to 08 follow the binding rulings of `00-owner-rulings.md`. Four points are not decided by those rulings
and change what agents, users or the owner get; they are listed here, numbered from 1. Points the two design reviews raised that the
rulings do decide (the command line of a step, what happens when two agents write one item at once, whether archived items of a removed
team are unbound) are recorded with their logic in `review-response.md`, not here.

## 1. Do `backlog team validate` and `backlog team migrate` need a team?

**Scenario.** A lead has edited `teams.json` in its working copy of the backlog repository, in a repository whose `.backlog/config.json`
has no `team` key, with no TEAM_NAME set. It runs `backlog team validate`. Later the owner, after upgrading the CLI, runs
`backlog team migrate` from the same place to convert every item to JSON.

**The problem.** Owner ruling R3b says that a team command with no team from `--team`, TEAM_NAME or the `team` key of
`.backlog/config.json` stops with an error naming the three ways, and both commands live under `backlog team`. Ruling R11 says
`backlog team validate` covers the whole file (the people, the item definition and every rule of every team), and ruling R4 says every
item migrates, items of every team and items without a team. Read literally, the lead's validate and the owner's migrate both stop with
the three-ways error although neither needs a team to do its job, and a team given to the migration would change nothing it does.

**Proposed implementation pattern.** In `src/team/cli.js` the dispatch resolves the team and the agent only for `backlog team new`,
`backlog team update`, `backlog team query` and `backlog team pop`; `validate` and `migrate` are dispatched before that resolution. The
three-ways error text stays exactly as ruled for the four commands. No file or field changes; the difference is which commands call the
resolution.

**Option A — validate and migrate take no team.** `backlog team validate` checks the whole file and every item; a team given by `--team`,
TEAM_NAME or the configuration narrows the report to that team's entry and items, so a lead sees only its own findings when it wants.
`backlog team migrate` converts everything and refuses `--team` with `❌ backlog: migrate converts every item; it takes no --team` (exit 2),
so nobody believes it converted only one team.

**Option B — every team command requires a team, as R3b reads.** `backlog team validate` without a team stops with the three-ways error;
with one it checks the file's shape, that team's entry and that team's items, and the other teams are checked only when their own leads run
it. `backlog team migrate` also requires a team and then converts every item anyway, so the team is a required input that changes nothing,
which the help must explain.

**Option C — the migration becomes a top-level command, `backlog migrate`.** It would sit beside `backlog upgrade` and need no team, and a
person who never uses teams would not be told to run a `backlog team` command. But the command matrix puts every top-level command except
help in the user group, and ruling R3a forbids a user command to change a team item, which the migration must do for every team item; the
option therefore needs a third command group that the rulings do not have, and validate would still face the R3b question.

**Recommendation: A**, because it is the only reading under which R3b, R11, R4 and R3a all hold: the three-ways error keeps guarding every
command that acts for a team, and the two commands that act on the whole file and the whole backlog do so without a meaningless input.

## 2. A team command whose `--agent` or `--team` differs from the session's variable

**Scenario.** A member's session runs with BACKLOG_AGENT=member-1 and TEAM_NAME=web. The member types
`backlog team update 42 abandon --agent lead-1 --reason "not needed"`, or `backlog team pop --team other --agent member-1`. Today both are
refused: `you are member-1 (BACKLOG_AGENT): team pop answers only for yourself` and `a member acts only as itself, not as lead-1`
(`src/team/pop.js:56,58`, `src/team/lifecycle.js:460`).

**The problem.** Ruling R3b fixes the order of the inputs (the flag first, then the variable) but not whether a flag that disagrees with
the variable is refused. Without a refusal, any session can act as any person of the team, the lead included, so every rule guarded by
`$caller.roles` (lead-only abandon, lead-only verdict past a round cap) can be passed by typing another name. With a refusal, a script or a
person who sets the variable for one purpose and the flag for another is stopped, and the flag no longer simply wins as R3b's order says.

**Proposed implementation pattern.** In `src/team/cli.js`, after the inputs are resolved and before the team file is read: when
BACKLOG_AGENT is set and `--agent` names someone else, or TEAM_NAME is set and `--team` names another team, the command stops with exit 2.
The texts: `❌ backlog: you are <BACKLOG_AGENT> (BACKLOG_AGENT); a team command acts only as its own agent, not as <--agent>` and
`❌ backlog: this session is team <TEAM_NAME> (TEAM_NAME), not <--team>`. No field of `teams.json` carries it, because it guards the input
before any team is known; a rule cannot express it, because a rule sees only the resolved agent.

**Option A — refuse a disagreement (today's behaviour, coded).** An agent cannot act as another person by a typo or on purpose while its
session names it; the lead's powers stay the lead's. A flag that repeats the variable is still accepted, and a session with no variable
set may name any agent with the flag, as today.

**Option B — the flag wins, no check.** R3b's order is applied literally and the CLI holds no identity policy. Any session can act as any
person by naming it; the team relies on the honesty of its agents and on the history, which records the name used.

**Recommendation: A**, because the rule set's role guards are only as strong as the identity they read, and today's refusal is the one
thing that makes a session's identity binding.

## 3. References between items without a team and team items

**Scenario.** A user item 7 depends on team item 90 (its `depends_on` holds 90), and another user item was split from team item 91 (its
`parent` will be 91 after the migration). A user runs `backlog show 7`, then `backlog new --name "follow-up" --depends-on 90`. A team rule
`claim-dependencies` of a team item reads the status of a user item it depends on. Real backlogs hold such references in both directions.

**The problem.** Ruling R3a says a user command answers a number that names a team item "as if no such item existed", and the reference
check of an `item` or `items` field says a written number must name an existing item. Both cannot hold for a reference that crosses:
either `backlog new --depends-on 90` is refused with "no item 90" (and an existing user item's dependency on 90 reads as a missing item, so
the user sees a dependency that never finishes), or user commands reveal that item 90 exists. The same choice decides whether
`backlog move` or `backlog update --seq` of a user item may refuse because a team item depends on it, which today's code does.

**Proposed implementation pattern.** One function of the user-command reader, the reference resolver (`src/shared/dependencies.js`), takes
the decision for every user command; team commands read user items as they read any item (chapter 03 section 5), because no ruling hides
user items from team commands. The migration lists every crossing reference in its dry run (chapter 06 section 1).

**Option A — references see every item; nothing else does.** A user command checks and shows a reference to a team item as a number with
its finished or open state only (`depends on 90 (a team item, open)`), never its name, fields or body, and refuses to move or renumber a user
item a team item depends on, naming only the number. Dependencies keep working across the boundary, at the cost of revealing that a team
item with that number exists and whether it is finished.

**Option B — strict invisibility.** A user command treats a number that names a team item as missing everywhere: a new reference to it is
refused, an existing one shows as `90 (no such item)` and never finishes, and a user item a team item depends on can be moved or cleaned
freely, leaving the team item's reference dangling (validate reports it). The owner cuts the existing crossing references, which the
migration's dry run lists, before or after the migration.

**Recommendation: A**, because a dependency that can never finish defeats the purpose of recording it, and the state "open or finished"
of a number reveals nothing of a team's work beyond what the shared number sequence already shows.

## 4. Migrating while a team's entry is still in the old shape

**Scenario.** `teams.json` holds one entry in today's shape (`lead`, `members`, `external_reviewers`, `review`) with dozens of open items
bound to it. The owner runs `backlog team migrate` before the team has rewritten its entry in the new shape (people, item definition, rule
set).

**The problem.** The migration needs only the team names, so it can convert those items; but afterwards every team command of that team
stops on the invalid entry, and ruling R3a hides the items from every user command, so the open items are reachable by no command until the
entry is rewritten. Refusing instead keeps the whole backlog, user items included, on the old release until one team has done its work.

**Proposed implementation pattern.** In the migration's check before writing (chapter 06 section 5): for every entry of `teams.json` with at
least one open bound item, run the entry checks of chapter 08 sections 3 to 6; the answer to this decision says whether a failing entry
is a failure of the migration (nothing written) or a line of the summary. The dry run lists such entries in either case (chapter 06 section 1).

**Option A — refuse.** `❌ backlog: team <t> has <n> open items and its entry is not in the new shape; rewrite it and run backlog team
validate first` (exit 2), nothing written. No team item is ever left unreachable, and the order of the cut-over (rewrite, validate, migrate)
is enforced; the cost is that the backlog waits for every team with open items.

**Option B — migrate and report.** The migration converts everything and lists each such team with its open items as unreachable until
its entry validates. User items move to the new release at once; the team's work stops until its lead rewrites the entry, which `backlog
team validate` then checks against the converted items.

**Recommendation: A**, because migrate-or-fail (ruling R4) is the owner's stated preference for this cut-over, and a team's entry can be
written and validated on the markdown backlog before the migration (chapter 06 section 1), so the wait is short.
