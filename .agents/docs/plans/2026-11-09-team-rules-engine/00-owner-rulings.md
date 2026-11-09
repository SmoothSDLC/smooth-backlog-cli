# Owner rulings for the team rules engine (2026-11-09)

Binding input. This file is the only inheritance from the earlier team-behaviour analysis: everything else of that analysis was
removed from the tree on 2026-11-09 because it was built on a design the owner replaced (a large fixed vocabulary of named rule
pieces, a separate workflow registry, commands that wrote the team file). It stays readable in git history at commit a507443 and must
not be used as input to the new design.

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
  each branch, the items in priority order with their number, slug and summary (and title). The index is data, committed with the items.
- Facts of the branch today (checked 2026-11-09): the index exists (`index.json`, per branch an ordered list of number, slug, title,
  status; position in the list is the priority). It has no summary. A new number is 1 plus the highest number among the items present, so
  deleting the newest item (for example `backlog clean`) would hand its number out again: R12 is not guaranteed today. The design must
  close both gaps; team items and user items share the one number sequence.

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
- The lifecycle of a card of the owner's team, its four review stages, the stage hand-off note and deploy not being a stage: see the owner rulings
  file in the backlog repo.
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
