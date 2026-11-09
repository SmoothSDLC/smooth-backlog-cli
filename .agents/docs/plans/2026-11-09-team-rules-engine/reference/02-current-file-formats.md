# 02 — The team files as they are today (174c76d)

Four files carry team or flow data today. None has a JSON Schema, a template besides the shipped workflow, a validation command or a
help page of its own; `backlog team define --help` and `backlog team workflow --help` describe the inputs in prose.

## 1. `<backlog home>/teams.json` — the team entries

**Shape**: one JSON object; each key is a team name, each value an entry. No version key.

| key | type | written by `team define` | read by | validated today |
|---|---|---|---|---|
| (team name) | object key, pattern `^[a-z0-9][a-z0-9:_-]*$` (define only) | yes | every team command | define only |
| `lead` | non-empty string | yes | `teamLead()` (after `--lead` and `TEAM_LEAD`), close, release, reassign, refinement and hand-off steps, pop, plan | define: non-empty, not a member |
| `members` | list of distinct trimmed non-empty strings, at least 1 | yes | membership, peer-stage eligibility, plan roster | define |
| `review_only` | list of member names | only when non-empty | pop and plan: never offered a claim | define: each is a member |
| `external_reviewers` | list of names | always (default `[]`) | external-stage eligibility, `canStep` external actor check | define: list of names |
| `workflow` | string | only when given | `team define` (stage names), `team workflow` (in-use check); **not** the enforcement (F1) | define: string and resolvable |
| `review` | list of `{stage, count}`; earlier form `{team, count}` takes its stage by position | always (default = the workflow's `team_entry_review_default` as `{stage,count}`) | `stageRules`, `passCount`, close, pop, plan | define: stage of the flow, `reviewers` members/external_reviewers (input only, not stored), count ≥ 1, no stage twice, external stage needs external reviewers |
| `wip` | `{agent, team}` whole numbers ≥ 1 | only when given | **nothing** (F3) | define |
| `refinement_review` | list of `{team, count}` | **never** (define rejects the key, F4) | refinement-review eligibility | none |

**Real example** (the live backlog repository, read only):

```json
{ "t-live": { "lead": "lead-a", "members": ["member-a", "member-b", "member-c", "member-d", "member-e"], "external_reviewers": ["reviewer-a", "reviewer-b"], "review": [] } }
```

**How it is read**: `teamsConfig()` (`src/team/team.js`) parses `<home>/teams.json` once per process after `setTeamsHome(home)`
(called by `src/team/cli.js` for every `backlog team` command). A missing file is `{}`; an unreadable or non-JSON file prints one
warning on standard error and is `{}` (F7); an array or a non-object is `{}`. No check runs on read: a hand-edited entry with a wrong
type is used as it is (`asList` turns strings into lists).

**Malformed today**: `team define` refuses the definition with one `❌ backlog: <problem>` line per problem on standard error (or
`{"ok":false,"errors":[...]}` with `--json`), exit 2, nothing written. A team named on a command with no entry: `❌ team <team> is not
configured in the backlog configuration` on standard output, exit 1.

## 2. `<backlog home>/workflows.json` — registered workflows

**Shape**: one JSON object; key = workflow name, value = a definition of the same shape as the shipped one (section 3). Written only by
`backlog team workflow --file <path>` (validated, committed, pushed); `--show <name>` prints the registered or else the shipped one.
The live backlog has no `workflows.json`.

**How it is read**: `loadWorkflow(name, home)` (`src/team/workflow.js`): the registered entry, else
`templates/workflows/<name>.json` of the CLI, else `workflow <name> is not defined (backlog team workflow --file <json> registers one)`
(exit 2). An unreadable registry is ignored without a word. The result is cached per process. The enforcement never calls it (F1).

**Validated today** (`validateWorkflow`, on registration only): statuses a non-empty list of distinct words ending with `closed`,
`archived`; each `finished` word a status or `done`; every step (and stage leg) has `from` (statuses or `["*"]`), `to` (a status, `same`,
`previous`, or verdicts that lead to statuses) and `by`; each side status's `enter` and `leave` name steps; `review_stages_order` lists
exactly the stages the review steps use; from every open status some chain of steps reaches `closed`; `refusals` has
`team_not_configured`, `wrong_status`, `wrong_actor`, `missing_argument`, `handoff_missing`. The workflow name must match
`^[\w.-]+$`. A workflow used by teams with open items cannot be re-registered under the same name.

## 3. `templates/workflows/team.json` — the shipped definition (`"workflow": "team"`, `"version": 1`)

Top-level keys and what reads them (0 = no code reads it, F2):

| key | type | read by code |
|---|---|---|
| `workflow`, `version`, `description` | string, integer, string | `workflow` by registration; others 0 |
| `team_entry_example` | object | 0 |
| `statuses` | 13 words: new, refining, refined, refinement review, ready, in progress, ready for review, reviewing, ready for external review, external review, review complete, closed, archived | `src/shared/status.js` (every command) |
| `side_statuses` | `{"awaiting decision": {enter, leave, returns_to, blocks, blocks_dependents}}` | the word only (vocabulary); `blocks*` 0 |
| `finished` | `["closed","archived"]` (+ `done` added in code) | `isFinished` (every command) |
| `actors` | role descriptions | 0 |
| `steps` | 21 steps (refine-start … wip-override), each `from`, `to`, `by`, `not_by`, `sets`, `clears`, `requires`, verdicts, stages | `from` and `to` of each step, verdict targets, `start-review.stages.<s>.from` (ready words), `by` of the external stage only |
| `review_stages_order` | `["peer","external"]` | stage order |
| `skipped_stage_rule` | text | 0 (the rule is code: `next()`) |
| `team_entry_review_default` | `[{stage:peer,reviewers:members,count:1},{stage:external,reviewers:external_reviewers,count:1}]` | entry default |
| `pop` | lead and member action lists (prose `when`) | 0 (the order is code: `src/team/queue.js`) |
| `plain_commands_on_team_items`, `plain_commands_outside_teams` | prose | 0 |
| `refusals` | 5 texts with `<placeholders>` | `team_not_configured`, `wrong_status`, `wrong_actor` |

Real example: the file itself (134 lines) at `templates/workflows/team.json` of 174c76d; the example team's own copy is
`<agent-skills>/team-lead/references/backlog-workflow.json` (topology), workflow `example-team`, stage `local` instead of `external`.

**How it is read**: `src/shared/status.js` reads it with `readFileSync` + `JSON.parse` at module load — a malformed shipped file makes
every command fail at start with the parse error (exit 2 from `main.js`). `src/team/workflow.js` puts it in the cache as `team`.

## 4. `<backlog home>/wip-limits.json` — limit numbers

**Shape**: `{"overall": n, "repository": n | {"default": n, "<owner/name>": n}, "branch": n | {"default": n, "<owner/name>:<branch>": n},
"team": n | {"default": n, "<team>": n}, "agent": n | {"default": n, "<agent>": n}, "stale_hours": n}`; a level without a whole number ≥ 0 has no
limit. Written by hand ("only the owner edits the file"). Read by `limits()` (`src/shared/wip-limits.js`) on every claim and start, user
and team. Missing: no limit. Unreadable: one warning, no limit (F7). No validation.

## 5. `<repository folder>/backlog.scope` — chunk scope

One line `refinement_scope: off|branch|repo|all` (default `branch`), read by `refinementCap()` (`src/team/views.js`) for pop and the team
views. A symbolic link is refused (exit 1); another value: `<path>: refinement_scope '<v>'; use one of off, branch, repo, all` (exit 2).

## 6. What exists and what does not

- JSON Schema: none. Validator: `validateTeam`, `validateWorkflow` (hand-written, run only by `define` and `workflow --file`).
- Templates: the shipped workflow only; no team-entry template, no minimal workflow.
- Help: `backlog team define --help`, `backlog team workflow --help` (prose); no reference page per key; README and COMMANDS.md describe
  the commands, not the keys.
