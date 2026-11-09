# 01 — The team file

Context: a team is a group of agents that work one backlog together under rules they agree on. The CLI keeps those rules in one file,
`teams.json`, at the root of the backlog folder (the folder that holds the `<owner>/<name>` repository folders, `index.json` of each
folder and the item files). This chapter fixes what the file holds, who reads it and what the CLI does when it cannot use it. The item
definition inside it is chapter 02, the rule set chapter 03, and the checks of `backlog team validate` chapter 08.

## 1. Who writes it, who reads it

- **Written by** a person or an agent of the team, by hand or with its own tools, and committed and pushed with git like any other file
  of the backlog repository. The CLI never creates, rewrites, registers or migrates it (owner ruling R5). No CLI command takes a template.
- **Read by** the team commands only: `backlog team new`, `backlog team update`, `backlog team query`, `backlog team pop` (each reads the
  entry of its own team) and `backlog team validate` (reads the whole file). `backlog team migrate` reads only the team names (chapter
  06). No user command opens the file (owner ruling R3).
- **Files that are no longer read**: `workflows.json`, `wip-limits.json`, `backlog.scope` and the CLI's shipped `templates/workflows/team.json`.
  Their behaviour is now rules of a team (limits: chapter 03 section 8, scope: pattern `scope-branch`). The CLI leaves such files where
  they are and never mentions them; the team deletes them when it has moved their content into its rule set.

## 2. Shape

The file is one JSON object. Each key is a team name, each value is the entry of that team. A team name is lowercase letters, digits,
`-`, `_` and `:`, starting with a letter or a digit (the pattern of today's `team define`, kept). An entry has exactly three keys:

| key | holds | chapter |
|---|---|---|
| `people` | every person (agent or human) who acts in the team, each with the roles it has | this chapter, section 3 |
| `item` | the item definition: the fields of the team's items, data only | 02 |
| `rules` | the rule set: the rule table (`table`), the pop table (`pop`) and the named filters (`filters`) | 03 |

A minimal entry (the complete one-person example is `design/examples/single-agent.json`):

```json
{
  "solo": {
    "people": { "agent-1": ["worker"] },
    "item": { "status": { "type": "text", "default": "todo", "values": ["todo", "doing", "done"], "final": ["done"] } },
    "rules": {
      "table": [ { "id": "start", "step": "start", "when": { "is": ["$item.status", "todo"] }, "do": { "set": { "status": "doing" } } } ],
      "pop": [ { "id": "next-item", "step": "start" } ],
      "filters": {}
    }
  }
}
```

The five example rule sets in `design/examples/` (scrum, extreme programming, parallel work, a single agent, and the pattern catalogue
of chapter 03 section 11) are complete entries; each validates clean and every rule of each is exercised by the cases of
`design/rule-cases.json`.

## 3. People and roles

Context: a rule often depends on who runs the command ("only the lead splits", "the holder closes"). The CLI knows the caller only as
the agent name of the command (section 5); `people` turns that name into roles a rule can test.

- `people` maps a person's name to a list of role words: `{"lead-1": ["lead"], "member-1": ["member", "checker"]}`. A person may have
  several roles; a role may be held by several persons. Role words are the team's own words: the CLI attaches no meaning to any of them.
- A rule reads the caller's roles as `$caller.roles` and the roles of a person named in an argument as `{"roles_of": "$arg.to"}`
  (chapter 03 section 5).
- **Coded check** (machinery, not a rule): the agent of a team command must be a key of `people`; otherwise the command stops with
  exit 1 and `❌ <agent> is not a person of team <team> (<names of people>)`. A typo in an agent name therefore never acts.
- A person field of an item (type `person`, chapter 02) only takes a name of `people` or the empty value.

## 4. How a team command reads the file

1. The command resolves its team (section 5) and reads `teams.json` once.
2. A missing file, a file that is not JSON, or a value that is not an object: exit 2,
   `❌ backlog: teams.json cannot be read (<reason>); fix it and run backlog team validate`. There is no silent empty default (today's
   behaviour of reading such a file as empty is finding F7 of the reference inventory, removed).
3. No entry for the team: exit 1, `❌ team <team> has no entry in teams.json (teams: <names>)`.
4. The team's entry is checked with every check of chapter 08 that concerns that entry. Any error: exit 2,
   `❌ backlog: team <team> has <n> problem(s) in teams.json; run backlog team validate --team <team>`. A broken rule set is never
   evaluated. Problems in other teams' entries do not stop this team (only `backlog team validate` reports them).
5. The entry is used for the whole command; the file is not read again. A step that is evaluated a second time after a rebase
   (chapter 04 section 6) reads the file again from the rebased tree, so a rule change published meanwhile applies.

## 5. Inputs of a team command (coded CLI behaviour)

Context: owner ruling R3b fixes how a team command learns which team it acts for and who calls it; this is CLI behaviour, the same for
every team. Each input is a flag on every team command, then an environment variable, then (for the team only) a configuration key.

| input | flag | variable | configuration | when absent |
|---|---|---|---|---|
| team | `--team <name>` | TEAM_NAME | the `team` key of `.backlog/config.json` | the command stops (below) |
| agent | `--agent <name>` | BACKLOG_AGENT | none | `new`, `update`, `pop` stop with exit 2 `❌ backlog: this team command needs the agent: give --agent <name>, or set the BACKLOG_AGENT variable`; `query` answers without a caller (a `check` or a `plan` for one person needs it) |
| session | `--session <id>` | BACKLOG_SESSION | none | `$session.id` is empty |
| repository | `--repository <owner/name>` | TEAM_REPOSITORY | none | the repository of the working copy; `$session.repository` |
| branch | `--branch <name>` | TEAM_BRANCH | none | the current branch of the working copy; `$session.branch` |

When no team is given by any of the three ways the command stops with exit 2 and exactly:
`❌ backlog: a team command needs a team: give --team <name>, or set the TEAM_NAME variable, or set the "team" key in .backlog/config.json`
(case COD-01; the `user` key of the configuration is never read by a team command, case COD-13). Team commands never read the
operating system user or the `user` key of the configuration (R3b); the writer recorded in an item (`updated_by`, history `by`) is the
agent. Whether `backlog team validate` and `backlog team migrate` also need a team is decision 1 of `decisions.md`.

The repository and the branch only select which repository folder new items go to and what `$session.repository` and `$session.branch`
are. Whether a session may act on an item of another branch is a rule of the team (pattern `scope-branch`), not CLI behaviour.

## 6. Safety of a file anyone can push

Context: anyone who can push to the backlog repository can change `teams.json`, and every team command of every agent then reads it.

- The file is data. Rule expressions are interpreted by the evaluator of chapter 03; nothing in the file is executed, imported or
  passed to a shell (lead decision recorded in 00-owner-rulings.md).
- Evaluation is bounded: a condition reads at most one hop of related items (no `every`, `some` or `count` inside another), there are no
  loops and no recursion, and a step changes at most the item and the items its `related` effects name.
- The one construct with a cost that depends on its input is the regular expression of `regex`. A pattern is at most 200 characters
  and the tested text at most 10 000 characters; a longer pattern is a validate error, a longer text is cut before the test. The risk
  that remains is a slow command, never code execution.
- A team command writes only items of its own team and items without a team that a rule binds to it (chapter 03 section 8).
