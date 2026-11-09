# 01 — The team file

Context: a team is a group of agents that work one backlog together under rules they agree on. The CLI keeps those rules in one file,
`teams.json`, at the root of the backlog folder (the folder that holds the `<owner>/<name>` repository folders, `index.json` of each
folder and the item files). This chapter fixes what the file holds, who reads it and what the CLI does when it cannot use it. The item
definition inside it is chapter 02, the rule set chapter 03, and the checks of `backlog team validate` chapter 08.

## 1. Who writes it, who reads it

- **Written by** a person or an agent of the team, by hand or with its own tools, and committed and pushed with git like any other file
  of the backlog repository. The CLI never creates, rewrites, registers or migrates it (owner ruling R5). No CLI command takes a template.
- **Read by** the team commands only (through the validated copy of section 4 while the record is fresh): `backlog team new`, `backlog team update`, `backlog team query`, `backlog team pop` (each reads the
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
- Whether an agent that is not in `people` may act is a rule of the team, not CLI behaviour: no ruling restricts it, and a team may want
  an observer or a shared tool. Every example rule set starts with the rule
  `{"id": "members-only", "step": "*", "when": {"empty": "$caller.roles"}, "deny": "{$caller} is not a person of team {$team.name}"}`
  (case COD-10), so a typo in an agent name is refused by the team's own first rule.
- A person field of an item (type `person`, chapter 02) only takes a name of `people` or the empty value.

## 4. How a team command loads the file (validation on load, owner ruling R21)

Context: owner ruling R18 says that a team command whose load of `teams.json` fails validation takes no action at all: it changes no item,
no file and nothing in the backlog. Ruling R21 fixes how often the file is validated: once, then again only when the record of the last
valid validation is missing or older than 24 hours. This section designs that procedure; chapter 08 lists the checks themselves.

**The record.** It lives in the CLI's per-user configuration folder, the folder that already holds the per-user record of where a
backlog is cloned (`$XDG_CONFIG_HOME`, else `~/.config`): `smooth-backlog-cli/teams-validation/<key>.json`, where `<key>` is the first 16
hexadecimal characters of the SHA-256 of the backlog folder's absolute path, so two backlogs (or two clones of one) never share a record.
It holds three values: `sha` (the SHA-256 of `teams.json` as validated), `valid_teams` (the names of the teams whose entries passed, as one
comma-separated text) and `validated_at` (ISO 8601 UTC). Beside it, `<key>.teams.json` is the validated copy of the file. Both are
written atomically (a temporary file renamed). This is outside every repository, so no repository's working tree changes (see
`review-response.md`, round 2, finding R2-1, for why the SHA is not written into `.backlog/config.json`).

**The procedure** (every team command except `backlog team validate`):

1. Resolve the inputs (section 5).
2. If the record exists, is less than 24 hours old, its copy's SHA equals the recorded `sha`, and it names the command's team in
   `valid_teams` (for `--show-all`: it names every team of the copy), the command uses the copy and does not read `teams.json`.
3. Otherwise it reads `teams.json` and validates the whole file (chapter 08 sections 3 to 6). When at least one team is valid, it writes
   the copy and the record (the SHA of what it read, the valid teams, now); when none is, the record and the copy stay as they were (lead
   decision c of R21: the record changes only after a valid validation). The CLI prints nothing about the record.
4. A file that is missing, not JSON or not an object: exit 2, `❌ backlog: teams.json cannot be read (<reason>); fix it and run backlog
   team validate --team <team>`. There is no silent empty default (finding F7 of the reference inventory, removed).
5. No entry for the team: exit 1, `❌ team <team> has no entry in teams.json (teams: <names>)`.
6. The team's entry fails validation: exit 2, `❌ backlog: team <team> fails validation in teams.json; run backlog team validate --team
   <team>`; for `--show-all`, any team failing: `❌ backlog: teams.json fails validation for <teams>; run backlog team validate --show-all`.
   Nothing is written. A team whose entry passes runs even when another team's entry fails: the record of R21 lists the valid teams one by
   one, which only makes sense if validity is per team. The migration is the exception: it converts every item of every team, so every
   entry must pass (chapter 06 section 3).
7. The entry is used for the whole command. A command that runs again on the upstream files (chapter 04 section 6) loads again by the same
   procedure, so within the 24 hours it uses the same copy.

**Consequence (stated by the ruling, not a question):** within the 24 hours an edit of `teams.json` is not read by later commands of that
user on that machine; a lead who changes the rules runs `backlog team validate`, which always validates in full and refreshes the record
(lead decision b of R21), and the agents of other machines see the change when their own record expires or after their own validate. Two
machines may therefore evaluate two versions of the rules for up to 24 hours. An invalid edit pushed by a lead stops each machine's team
commands when that machine's record expires, possibly hours after the push; this is why chapter 07 makes the lead validate before pushing.

When the configuration folder cannot be written (a read-only home in a sandbox), every command validates in full, silently. The optional
environment variable for the record that lead decision a mentions is not designed: a command needs the file's content, not only its SHA,
so a record without the copy cannot spare the read (`review-response.md`, round 2, finding R2-2). Spike: `evaluator-spike/teams-load.mjs`
and its six tests.

## 5. Inputs of a team command (coded CLI behaviour)

Context: owner rulings R3b, R14, R15 and R20 fix how a team command learns which team it acts for and who calls it; this is CLI behaviour,
the same for every team. Each input is looked up as 1 the flag, 2 the environment variable, 3 the configuration file (for the team only).
An explicit flag always wins, and a flag that differs from the variable is not refused (R15).

| input | flag | variable | configuration | when absent |
|---|---|---|---|---|
| team | `--team <name>` | SMOOTH_BACKLOG_CLI_TEAM_NAME | the `team` key of `.backlog/config.json` | the command stops (below), unless `--show-all` is given where it is accepted |
| agent | `--agent <name>` | SMOOTH_BACKLOG_CLI_AGENT | none | `new`, `update`, `pop` stop with exit 2 `❌ backlog: this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable`; `query`, `validate` and `migrate` (without `--ask`) work without a caller |
| session | `--session <id>` | SMOOTH_BACKLOG_CLI_SESSION | none | `$session.id` is empty |
| repository | `--repository <owner/name>` | SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY | none | the repository of the working copy; `$session.repository`. A value that is not `owner/name` stops the command: exit 2, `❌ backlog: SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY='<value>': expected owner/name` (today's check, `src/team/team.js:44`) |
| branch | `--branch <name>` | SMOOTH_BACKLOG_CLI_TEAM_BRANCH | none | the current branch of the working copy; `$session.branch`. On a detached HEAD with no branch given, `new`, `update` and `pop` stop: exit 2, `❌ backlog: HEAD is detached: check out a branch, or give --branch <name> (SMOOTH_BACKLOG_CLI_TEAM_BRANCH)` (today `src/team/pop.js:153`); `query` and `validate` work |

When no team is given by any of the three ways the command stops with exit 2 and exactly:
`❌ backlog: a team command needs a team: give --team <name>, or set the SMOOTH_BACKLOG_CLI_TEAM_NAME variable, or set the "team" key in .backlog/config.json`
(cases COD-01, R14-08; the `user` key of the configuration is never read by a team command, case COD-13). This holds for every team
command, `backlog team validate` and `backlog team migrate` included (R14). Team commands never read the operating system user or the
`user` key of the configuration (R3b); the writer recorded in an item (`updated_by`, history `by`) is the agent.

**`--show-all`** (R14) makes a command act over every team instead of one. It is accepted by `backlog team query` (its list form, `query
<item>` and `query rules`), `backlog team validate` and `backlog team migrate`. It is refused by `backlog team new`, `backlog team update`
and `backlog team pop`, which each act on one item for one team: exit 2, `❌ backlog: --show-all acts over every team; backlog team <command>
acts for one team: give --team <name> instead` (cases R14-01 to R14-03). Given with `--team`: exit 2, `❌ backlog: --show-all acts over
every team: give it or --team <name>, not both` (case R14-07). Given while SMOOTH_BACKLOG_CLI_TEAM_NAME is set, the flag wins (R15) and the
variable is ignored (cases R14-04 to R14-06). The query forms that evaluate one team's rules (`query plan`, `query check`, `query filter`,
`query steps`) refuse it like `new`.

**Consequence of R15, stated once:** an agent input is a name, not a proof. A session whose SMOOTH_BACKLOG_CLI_AGENT names a member can
run `backlog team update 50 abandon --agent lead-1 --reason "not needed"` and every rule that tests `$caller.roles` sees the lead (case
R15-03). Role guards hold against mistakes, not against an agent that names someone else on purpose; the history records the name used.
The refusals of today (`src/team/pop.js:56,58`, `src/team/lifecycle.js:460`) are removed.

**Several teams on one machine** (scope note of the rulings): one process serves one team through its own SMOOTH_BACKLOG_CLI_TEAM_NAME, and a
process that must act for another team names it with `--team`, which wins (R15). No variable name changes. What several teams writing one
backlog repository at once cost is chapter 04 section 7.

The repository and the branch only select which repository folder new items go to and what `$session.repository` and `$session.branch`
are. Whether a session may act on an item of another branch is a rule of the team (pattern `scope-branch`), not CLI behaviour.

## 6. Safety of a file anyone can push

Context: anyone who can push to the backlog repository can change `teams.json`, and every team command of every agent then reads it.

- The file is data. Rule expressions are interpreted by the evaluator of chapter 03; nothing in the file is executed, imported or
  passed to a shell (lead decision recorded in 00-owner-rulings.md).
- Evaluation is bounded: a condition reads at most one hop of related items (no `every`, `some` or `count` inside another), there are no
  loops and no recursion, and a step changes at most the item and the items its `related` effects name.
- The one construct whose cost depends on a pattern is the `regex` test. It runs on a linear-time matcher built into the CLI (chapter 03
  section 4.1), never on JavaScript's backtracking engine: the time is at most the text length times the size of the compiled pattern,
  whatever the pattern. A pattern is at most 200 characters and compiles to at most 5000 instructions, a counted repetition is at most 100,
  and the tested text is cut at 10 000 characters; constructs outside the subset (back-references, lookaround, flags, lazy quantifiers) are
  a validate error. The pattern `^(a+)+$` that makes a backtracking engine run for hours on 40 characters runs in milliseconds on 5000
  (case INL-05).
- Cost that grows with the backlog: a `count` over `$team.items` is evaluated for every item pop tries, so pop is quadratic in the team's
  open items in the worst case. With hundreds of open items per team this stays well under a second; the implementation measures it on
  the BDD fixtures and caches a count within one command if it is not.
- A team command writes only items of its own team and items without a team that a rule binds to it (chapter 03 section 8). Every key of
  the entry is checked against the schema (chapter 03 section 14), so a misspelled key cannot silently turn a guarded rule into an
  unguarded one.
