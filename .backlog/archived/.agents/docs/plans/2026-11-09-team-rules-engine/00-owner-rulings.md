# Owner rulings for the team rules engine (2026-11-09)

Binding input. This file is the only inheritance from the earlier team-behaviour analysis: everything else of that analysis was
removed from the tree on 2026-11-09 because it was built on a design the owner replaced (a large fixed vocabulary of named rule
pieces, a separate workflow registry, commands that wrote the team file). It must not be used as input to the new design.

## What the CLI is
- R1. For team behaviour the CLI is a rules evaluator: given an item (a JSON file), the command, the caller and the arguments, the
  team's rule set decides whether the command is allowed, what the new status is and which fields change. The CLI code holds no team
  behaviour, no status word, no stage, no role.
- R2. Splitting, parents, children and dependencies are not actions of the CLI. They are rules over fields: an item definition has a
  parent field holding the parent item's id; a rule makes the step that creates a child also update the parent's child or dependency
  field; a rule says an item cannot be worked on or closed unless its children and dependencies are closed. Limits, queue order, review
  rounds, size caps and required notes are rules over fields in the same way.
- R3. User commands (`backlog new`, `update`, `list`, ...) enforce nothing about flow, status words or team behaviour. The CLI ignores
  the team file unless a command runs under the `backlog team` hierarchy. Who the user is comes from the operating system user.
- R3a (owner, 2026-11-09). User commands read and change only items that have no team. They ignore team items completely: a team
  item is not listed, shown, counted, queued, moved, archived, imported, cleaned or changed by a user command, and a number that names
  one answers as if no such item existed. Team items are reached only through `backlog team` commands.
- R3b. Team commands never read the user identity (the operating system user or the configuration's user). The agent comes from
  `--agent`, else BACKLOG_AGENT. The team comes from `--team`, else the TEAM_NAME variable, else the `team` key of
  `.backlog/config.json` (owner, 2026-11-09). When none of the three is set the command stops with an error that names all three ways
  to define the team. This is coded CLI behaviour, not a rule of a team.

## Data
- R4. Items are stored as JSON files. Every existing item (open and archived) migrates from markdown with a header to JSON; the CLI
  migrates or fails, with no second format and no alias. The body holds the fields; a field definition decides what a field is.
- R5. The team file (`teams.json` of the backlog folder) holds, per team: the people, the team's rule set and the team's item
  definition. The CLI only reads it. It never creates, rewrites, registers or migrates it, and it never reads a template.
- R6. A template is a starting copy. The workflow template of the owner's team becomes the default item definition and the default rule set of that
  team. A team, through its agents, edits its own definition in the team file to fit its workflow.
- R7. The item definition is data only: field names, types, descriptions, defaults, allowed values. All dynamic behaviour is in the
  rule set.
- R8. The rule set is written with a coherent structure and field naming so that an agent or a human understands it without reading
  the evaluator. The team lead and team member skills use the same rule set directly.

## Numbers, priority and the index (owner, 2026-11-09; standing requirement, restated)
- R12. An item number is unique and never reused, as with an issue number on GitHub: not after the item is archived, deleted or
  cleaned, and not at any size of backlog (tens of thousands of items are normal). A number identifies an item; it is not its priority.
- R13. Priority is separate from the number. The order of the queue is kept in a JSON index file in the backlog folder that holds, for
  each branch, the items in priority order with their number, slug and title. The index is data, committed with the items. Owner ruling 2026-11-09: the existing index structure stays as it is; a summary is not required in the index.
- Facts of the branch today (checked 2026-11-09): the index exists (`index.json`, per branch an ordered list of number, slug, title,
  status; position in the list is the priority). That structure is accepted as is. A new number is 1 plus the highest number among the items present, so
  deleting the newest item (for example `backlog clean`) would hand its number out again: R12 is not guaranteed today. The design must
  close the gap in number reuse (a persistent never-reused counter); team items and user items share the one number sequence.

## Rules and their checking (owner, 2026-11-09)
- R9. The earlier analysis is a guide and a coverage checklist, not a source to copy one to one: it was not written to produce rules.
  Each rule is independently verified against the code and the skills and created on its own, with test cases that prove the rule is
  structured correctly.
- R10. The hierarchy of the rules is part of the rule set, in the manner of the rules of a network routing table: an ordered table
  with a defined precedence. The design defines the precedence (order, specificity, default).
- R11. A command checks the team file: `backlog team validate`. The team file is written by a person or an agent, so the check is a
  feedback loop. It gives useful feedback per rule (where the problem is, which rule, why, what would fix it), not only valid or not
  valid, and it covers the whole file: the people, the item definition and every rule.

## New item and update, in one sentence each
- A new item for team X: read the team file, find X, create the item from X's item definition and the creation rules.
- An update of an item of team X: read X's rule set and the item, and refuse the update unless it conforms to the rules.

## Carried forward from earlier rounds (still binding)
- The lifecycle of a card of the owner's team is recorded in the owner rulings file of the backlog repository; it is not repeated in this
  public repository.
- Team session inputs: TEAM_NAME, TEAM_REPOSITORY, TEAM_BRANCH, BACKLOG_AGENT, BACKLOG_SESSION stay inputs of the team commands, and
  every input is also an optional flag on every team command (order: flag, variable, configuration key).
- Archived items are subject to no rule. Split items are linked to their parent but not bound to its team. An item bound to a team that
  no longer exists is unbound by the migration and gets a timestamped record in its body naming the former team.
- A review stage is never named after a team. The public repo shows nothing of how the owner's internal factory behaves.
- Commands are described with their scenario and full hierarchical command line.

## Decisions taken by the lead agent with their logic (reversible on the owner's word)
- Archived items migrate to JSON too: two formats would need two readers, and the owner's rule is migrate or fail.
- Rule expressions are data interpreted by a small evaluator inside the CLI; the CLI never executes code found in the team file. A
  code-in-the-team-file design would let anyone who can push to the backlog repo run code in every user's CLI.

## Round 5 (owner, 2026-11-09, answers to the design's decisions 1 to 3)
- R14. R3b holds for every team command, `backlog team validate` and `backlog team migrate` included: a team command needs a specific team.
  The one exception is the flag `--show-all`, which makes the command act over every team. Which team commands accept the flag is part of
  the design (the interpretation is pending the owner's confirmation).
- R15. Order of lookup for a team command's inputs: 1 the flag, 2 the environment variable, 3 the configuration file. An explicit flag
  always wins and a flag that differs from the variable is not refused. The coded refusals of today (`src/team/pop.js:56,58`,
  `src/team/lifecycle.js:460`) are removed, and the design's caller checks follow the resolved agent only.
- R16. User commands ignore team items by default and show them only when `--show-all` is given. This replaces decision 3 (references
  between user items and team items): by default a reference to a team item reads as missing; with the flag it is seen. The owner recalls an
  earlier decision that the flag belongs on every similar command; no record of it was found (`git log -S"show-all"` over the CLI repo,
  `src/`, the plans and the reference files: no hit; today only `--all` exists, on `query`/`list all-branches`, meaning every branch). The
  design must derive the similar commands from the command matrix. Whether the flag also lets a user command change a team item is pending.

## Round 6 (owner, 2026-11-09, answers to the questions on migration validation and `--show-all`)
- R17. `backlog team migrate` checks each item against the team's item definition and by default only REPORTS every missing or invalid
  field. It tells the user that the flag `--ask` gives interactive remediation, one field at a time, run by the CLI (on a terminal only,
  as `backlog new --ask` does today).
- R18. No backwards compatibility, anywhere. When a team command loads `teams.json` and the file fails validation, the command takes no
  action: it changes no item, no file and nothing in the backlog. This holds for `backlog team migrate` too: a team whose entry is not in
  the new shape stops the migration (the former option A of decision 4). Validation of the team file covers every required field, the
  rules in their readable shape, the item definition, and the coherence of the two (a rule never names a field the definition lacks), plus
  every other check the CLI needs to use the file safely. The owner proposes a SHA of `teams.json` recorded in the backlog configuration:
  validation runs once, and each later load only compares the SHA. Where the SHA is stored, who writes it, and whether it is per file or per
  team entry are design points to bring back as decisions (facts: `.backlog/config.json` is committed in each consuming repository, while
  `teams.json` is in the backlog repository and shared; ruling R5 says `backlog team validate` is read-only).
- R19. A user command can set values on an item that has a team (a safety hatch for a team that no longer exists, for archiving, or for a
  change of owner outside the team's enforcement). It needs `--show-all` (the reading is pending confirmation). This replaces the part of
  R3a that forbids user commands to change a team item, and answers question 3 of round 5 with "show and change".
- R19a. When the TEAM_NAME variable is set, every user command fails (guard against an agent using the wrong command by accident or trying
  to get around the team commands). The text is a blanket failure with no instruction for the agent: teams are not allowed to use user
  commands. The owner did not ask to block `--help` or `--version`; the failure text only gives no instruction. Reading: top-level help and version are not blocked (pending confirmation for the help of a single user command).

## Round 7 (owner, 2026-11-09)
- R20. Every environment variable the CLI owns is prefixed `SMOOTH_BACKLOG_CLI_`, because generic names such as TEAM_NAME are used by other
  applications. No alias for the old names (no backwards compatibility, R18). Inventory of `src/` (2026-11-09): TEAM_NAME, TEAM_REPOSITORY,
  TEAM_BRANCH, TEAM_LEAD, BACKLOG_AGENT, BACKLOG_SESSION, BACKLOG_HOME, BACKLOG_ORIGIN_URL, BACKLOG_LOCK_WAIT_MS; the test guard reads
  BACKLOG_PRIVATE_DENYLIST. New names: SMOOTH_BACKLOG_CLI_TEAM_NAME, _TEAM_REPOSITORY, _TEAM_BRANCH, _TEAM_LEAD, _AGENT, _SESSION, _HOME,
  _ORIGIN_URL, _LOCK_WAIT_MS, _PRIVATE_DENYLIST. Standard system variables (HOME, USER, XDG_CONFIG_HOME, GIT_CONFIG_COUNT, npm_execpath)
  are not owned by the CLI and keep their names. Every earlier ruling and design text that names TEAM_NAME, BACKLOG_AGENT and the others
  reads as the prefixed name from now on.

## Scope note (owner, 2026-11-09): several teams running at once
- The owner can run several teams at once. Solving it is not required. If the design agent finds a simple solution it enters the
  scope; any solution that needs a redesign of flags is out of scope. The lead's reading: one process serves one team through its own
  SMOOTH_BACKLOG_CLI_TEAM_NAME, and a process that must name another team uses `--team` (R15, flag first), so no change of variable names is
  needed. The design agent checks this, and reports what several teams writing one backlog repository at once cost (the number counter,
  the index, lost pushes, chapter 04 section 6), without changing any flag.

## Round 8 (owner, 2026-11-09): the validation procedure and `--show-all`
- R19 is confirmed as written: a user command given `--show-all` may set values on an item that has a team. Nothing is pending on it.
- R21. Validation of `teams.json` on load follows the owner's procedure, written in the owner's words of the earlier answer: the first time a
  team command runs and no record of a recent valid validation exists, it reads `teams.json` from disk, validates it, records the SHA of the
  file in the backlog configuration when none is recorded (or compares the file's SHA with the recorded one when there is), and records the
  validation (the valid teams as a comma separated list and the date of the last validation). While that record exists and is less than
  24 hours old, a command proceeds without reading the file; after that, or with no record, the file is read and validated again. The CLI
  stays silent about the cache. Decisions taken by the lead agent with their logic (reversible): (a) a program cannot set an environment
  variable in its parent shell, so the record is kept where a later command can read it, a local state file outside every repository, and the
  record may also be supplied by an environment variable with the R20 prefix; (b) `backlog team validate` always validates in full and
  refreshes the record; (c) a SHA that differs from the recorded one means the file changed: the file is validated in full again, and the SHA
  and the record are updated only when it is valid. Consequence the design must state, not a question: within the 24 hours an edit to
  `teams.json` is not read by later commands.
- Question numbers: from now on every question carries its round and the date (for example "2026-11-09 round 9, question 1") so that no
  number repeats across rounds.

## Round 10 (owner, 2026-11-09): where `teams.json` lives
- R22. `teams.json` is repo-specific and branch-specific, like the backlog configuration: team behaviour may differ between repositories and
  between branches, and the design must not rely on a separate backlog repository existing. The location is defined in the repository's
  `.backlog/config.json` (the actionable repository, committed in every branch), and the SHA of the file (R21) is kept there too. Default
  when the configuration does not define a location: `.backlog/teams.json` in the actionable repository; but when the configuration
  defines a backlog repository folder, the default is the root of that repository's folder in the backlog repository
  (`<backlog repository>/<owner>/<name>/teams.json`). The file can also live anywhere else the configuration names. This replaces the earlier
  design's single `teams.json` at the root of the whole backlog repository, and supersedes the lead decision that placed the SHA in the
  per-user configuration folder. The CLI still only reads `teams.json` (R5); it writes the SHA into `.backlog/config.json`.
- Lead's reading, for the design to apply: the explicit location key wins; else a configured backlog repository folder; else
  `.backlog/teams.json`. A repository that is public must point the configuration at a private location, because the default would publish
  the team's rules (the information-security rule of the CLI repo); the design states this once and adds no mechanism for it.

## Round 11 (owner, 2026-11-09): templates at setup, no effect on the entire backlog, migrate at setup
- R23. `teams.json` is written by a person, so the example team templates must be available to that person: `backlog setup` puts them into the
  repository's `.backlog` folder (the way it already deploys the skill copy, `src/shared/setup.js:124-134`). Only generic templates ship with
  the CLI (the examples of the design: scrum, extreme programming, parallel work, single agent, and the catalogue of rule shapes); the
  owner's team template stays in the backlog repository. The CLI still never reads a template (R5): it only copies them.
- R24. Nothing a command does may affect the entire backlog. The scope of every command is the actionable repository's folder (and, where an
  item says so, its branch). No command reads, writes, converts, renumbers or stops because of another repository's folder, except a
  read-only reference to a single item of another repository. The design must audit every command and every chapter against this rule
  (the numbers, the index, migrate, validate, clean, move, import, the commit and push of the backlog repository).
- R25. `backlog setup` recommends running the migration as soon as the configuration defines a backlog folder, and the configuration records
  when the backlog was migrated and the version of the CLI that last ran the migration.
