# Owner answers, 2026-11-08 (round 1)

Binding. Each answer lists what it decides, the consequence for the spec, and what is still to be propagated into `03-spec.md`,
`04-bdd.md`, `05-tdd-plan.md` and `06-migration-plan.md` in ONE refinement pass after the last open question (Q-16, Q-20) is answered.

## Q-04 — session variables: option A, plus flags for every input
- Decision: `TEAM_NAME`, `TEAM_REPOSITORY`, `TEAM_BRANCH`, `BACKLOG_AGENT`, `BACKLOG_SESSION` stay inputs of the team commands.
- Added by the owner: every team command accepts every one of these inputs, all or any subset, as an optional flag
  (`--team`, `--agent`, `--session`, `--scope-repository`, `--scope-branch`). Order of use: flag, then variable, then the
  `.backlog/config.json` keys `team` and `user`.
- Spec consequence: REQ-911 becomes "variables AND flags on every team command"; the help of every team command lists all five flags.
  Test consequence: one test per command that each flag alone, each variable alone and flag-over-variable give the same session.

## Q-05 — keys declared but never enforced: the rules belong in the team's template
- Decision (owner): these rules are team rules. They are written in the team template of the team (for the Cody team, the Cody team
  template files kept in that team's backlog repository), not decided by the CLI. A new team lead creates a team from that template and
  gets the expected default rules.
- Reading applied (logic): the CLI enforces whatever the team behaviour file defines and nothing else. So the format keeps
  `max_rounds`/`after_max_rounds`, `blocks_dependents` and the "older than" queue test as generic, enforceable keys; the CLI contains
  no value for any of them; the Cody template sets the values the team declared. This replaces D-15 (keys dropped) and makes
  Q-05 option B the design, with the values supplied only by the template.
- New requirement, template location: the location of team templates is a key of `.backlog/config.json` (name proposed:
  `team_templates`, a folder; relative to the backlog folder). The CLI package ships only a generic example team, not a team's
  rules. `backlog team define --template <name>` creates a team from a template found there (people and lists from the command line,
  behaviour from the template). This replaces D-01's "templates are never read at run time" and REQ-003: templates are read when a
  team is defined, never when an item changes.

## Q-17 — items bound to teams without an entry: option A, with a record
- Decision: `backlog team migrate` removes the team from each such item and keeps the status as stored.
- Added by the owner: the item body gets a record naming the former team, stating that the team no longer exists, with a timestamp,
  for example `## Team removed at 2026-11-08T14:02:11Z: the item was bound to team old-proof, which no longer exists.` The migration
  report lists each item.

## Q-18 — archived items: no rules apply, the migration does not touch them
- Decision (owner): archived files are read by nothing except a listing; no rule applies to them, rules apply only to unarchived team
  items. This is option B: archived items are left as stored and exempt from the old-key check, and the migration does not rewrite them.
- Spec consequence: REQ-011 and `team migrate` step (3) cover unarchived items only; the read path of `backlog list archive` shows
  stored values and enforces nothing.

## Q-19 — split items without a team: option B
- Decision: a split item is linked to its parent but is not bound to the parent's team; whether a team works it is a separate act
  (`backlog team update <n> --set-team <team>` by the lead).
- Spec consequence: the migration leaves the 35 teamless slices unbound; `backlog team new --split-from` creates an unbound,
  parent-linked item; REQ for the queue: an unbound item never appears in a team queue.

## Still open
- Q-16 and Q-20 (reworded in chat, answers pending).
- Q-06..Q-15 stay conditional.
