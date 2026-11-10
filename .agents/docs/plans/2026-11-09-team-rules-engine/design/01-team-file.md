# 01 — The team file

Context: a team is a group of agents that work one backlog together under rules they agree on. The CLI keeps those rules in one file,
`teams.json`, which belongs to the actionable repository (the code repository the agents work in) and to its branch, as that
repository's `.backlog/config.json` does (owner ruling R22): team behaviour may differ between repositories and between branches, and the
design does not rely on a separate backlog repository existing. This chapter fixes where the file is, what it holds, who reads it and what
the CLI does when it cannot use it. The item
definition inside it is chapter 02, the rule set chapter 03, and the checks of `backlog team validate` chapter 08.

## 1. Who writes it, who reads it

- **Written by** a person or an agent of the team, by hand or with its own tools, and committed and pushed with git like any other file of
  the repository that holds it. The CLI never creates, rewrites, registers or migrates it (owner ruling R5). No CLI command reads a
  template; `backlog setup` only copies the generic ones into the repository so that a person can start from one (section 1.2, R23). The
  CLI writes only the file's SHA, into `.backlog/config.json` (R22, section 4), or into the per-user record where section 1.1 says so.
- **Read by** the team commands only (through the validated copy of section 4 while the record is fresh): `backlog team new`, `backlog team update`, `backlog team query`, `backlog team pop` (each reads the
  entry of its own team), `backlog team validate` and `backlog team migrate` (read the whole file; chapter 06). No user command opens the
  file (owner ruling R3).
- **Files that are no longer read**: `workflows.json`, `wip-limits.json` and `backlog.scope`. Their behaviour is now rules of a team
  (limits: chapter 03 section 8, scope: pattern `scope-branch`). The CLI leaves such files where they are and never mentions them; the team
  deletes them when it has moved their content into its rule set. The CLI's own `templates/workflows/team.json` is deleted from the package
  at the cut-over, with its mentions in `COMMANDS.md` and the skill reference (review D M8): only the generic templates of section 1.2 ship.

### 1.1 Where the file is (owner ruling R22)

Context: the actionable repository is the repository whose folder of the backlog a team command acts on. It is the working copy's
repository, unless the repository input of section 5 names another one (question 1 of `decisions.md`, applied provisionally: the input
defines the actionable repository). The working copy's `.backlog/config.json` (committed in every branch, created by `backlog setup` or by
the first command) already names where the backlog folder is (key `backlog_repository`, a path relative to the repository, `.backlog`
meaning inside it). Two keys are added beside it.

A `.backlog/config.json` that exists but is not a JSON object (a trailing comma, a half-written edit) stops every command, user and team,
with exit 2 and `❌ backlog: .backlog/config.json cannot be read (<reason>); fix it: no command runs and nothing is written while it cannot
be read`; no command ever writes over it (review C M10). A missing file is an empty configuration.

| key of `.backlog/config.json` | value | written by |
|---|---|---|
| `teams_file` | the location of the team file: a path relative to the top of the actionable repository (like `backlog_repository`), or an absolute path | a person; the CLI never writes it |
| `teams_file_sha` | the SHA-256 of the team file as last validated (section 4) | the CLI, on the first load when none is recorded and after every valid validation of a changed file; a person commits it |

Below and in the other chapters, `teams.json` names the team file wherever this resolution puts it.

**Resolution order** (cases R22-01 to R22-08):

0. when the repository input names another repository than the working copy's (question 1, provisional A): that repository's folder in
   the backlog folder, `<backlog folder>/<owner>/<name>/teams.json`; the working copy's `teams_file` key describes the working copy's
   repository and does not apply (case R22-07);
1. the `teams_file` key, when present: the file can live anywhere it names;
2. else, when the backlog folder the CLI resolves lies outside the actionable repository, however the CLI found it (a configuration key
   `backlog_repository` or `backlog_origin_url`, SMOOTH_BACKLOG_CLI_HOME, SMOOTH_BACKLOG_CLI_ORIGIN_URL, or the per-user record that
   `backlog setup` writes; question 6, provisional A, case R22-08): the root of the repository's own folder in it,
   `<backlog folder>/<owner>/<name>/teams.json`, beside that folder's `index.json`, `numbers.json` and `phases/` (never the root of the
   whole backlog repository, which holds the folders of many repositories). "Outside" compares path segments: a folder named `..backlog`
   inside the repository is inside it (case R22-06);
3. else `.backlog/teams.json` in the actionable repository.

**Where the SHA is kept.** In the working copy's `.backlog/config.json` (R22) when that file exists and the working copy is the actionable
repository. Otherwise (no configuration in the working copy, or a repository input that names another repository) the SHA is the `sha` of
the per-user record of section 4: the CLI never creates `.backlog/config.json` only to hold the SHA, and never writes a key about another
repository into the working copy's configuration (questions 1 and 6; review D H4, H5).

**Path safety** (today's rules of `src/shared/store.js`, applied to one more file): a relative path is resolved against the top of the
actionable repository; the file itself must be a plain file, never a symbolic link (exit 2, `❌ backlog: <path> is a symbolic link; the
team file must be a plain file`); when the resolved path lies inside the actionable repository or the backlog folder, no folder between that
root and the file may be a symbolic link either (today's `assertNoSymlinks`; case of review C L2 in `teams-load.test.mjs`). The CLI only
reads it.

**Missing file.** Every team command, `backlog team validate` and `backlog team migrate` included, stops with exit 2 and takes no action
when no file is at the resolved location (the one exception: the migration of a folder in which no item has a team needs no team file,
chapter 06 section 5); the text names the resolved path and the three ways (case R22-05):
`❌ backlog: no team file at <resolved path>; name one with the "teams_file" key of .backlog/config.json, or put it at <backlog repository>/<owner>/<name>/teams.json when the backlog folder lies outside the repository, else at .backlog/teams.json`

**Branch specificity.** With the file inside the actionable repository (the default `.backlog/teams.json`, or a `teams_file` inside it),
every branch has its own copy and its own `teams_file_sha`, so a branch can try new rules without touching the others. A team command uses
the rules of the branch it runs in, also for an item of another branch (an item's `branch` is data; a team that wants each branch's items
handled only under that branch's rules writes the pattern rule `scope-branch`). With the default inside a separate backlog repository the
file is per repository, shared by all branches of the actionable repository, while each branch still records its own SHA; a team that
wants per-branch rules then names a file inside the actionable repository with `teams_file`. The item numbers and the index (chapter 05)
live in the backlog folder and are not branch-specific when the backlog folder is a separate repository: two branches with different rules
share one number sequence and one index file per repository folder. With the backlog inside the actionable repository, the item files, the
numbers and the index follow the branches as the team file does (chapter 05 section 2 states the limit at merges). The migration converts the
items of the repository folder of the repository it runs in, with that repository's team file (chapter 06 section 2).

**Public repositories.** A public repository must point `teams_file` at a private location: the default would publish the team's rules with
the code. The CLI adds no mechanism for this.

### 1.2 Templates (owner ruling R23)

Context: the team file is written by a person, so the example team files must be at hand where that person works. `backlog setup` (the
user command that writes `.backlog/config.json` and deploys the skill copy, `src/shared/setup.js`) also copies the generic team templates
into the repository, the way it deploys the skill copy (`src/shared/setup.js:124-134`).

- **What ships.** The CLI package holds them in its `templates/teams/` folder: `scrum.json`, `extreme-programming.json`, `parallel.json`,
  `single-agent.json` and `patterns.json`, the five example files of this design (`design/examples/`), each a complete, valid team file.
  Only generic templates ship; the owner's own team template stays in its own repository.
- **Where they land.** `.backlog/team-templates/` in the actionable repository, beside `.backlog/config.json`, whatever the location of
  the backlog folder. Setup commits them with the configuration and the skill copy (`backlog: setup`) and pushes, as today.
- **A second setup.** The skill copy's rule applies: the folder belongs to the CLI and is removed and copied again on every setup, after
  the same symbolic-link check (`safeTree`). An edited copy is replaced and a file a person added to the folder is removed. A person
  therefore never edits a template in place: they copy one to the team file (`.backlog/teams.json` by default, section 1.1) and edit it
  there; setup never touches the team file.
- **The message.** `✅ team templates copied to .backlog/team-templates: scrum, extreme-programming, parallel, single-agent, patterns; copy
  one to the team file and edit it there`.
- **Nothing reads them.** No command reads a template (R5): a team command reads only the team file of section 1.1.

Spike: `evaluator-spike/setup.mjs`, tests "setup copies the five generic templates ..." and "a second setup replaces an edited copy ...".

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

**Where each value lives.** The SHA of the validated file is kept in the actionable repository's `.backlog/config.json`, key
`teams_file_sha` (R22), or in the per-user record where section 1.1 says so. The record of the last valid validation (the valid teams and its time) and the validated copy of the file live in the
user's per-user state, the folder the CLI already uses for its per-user records (`$XDG_CONFIG_HOME`, else `~/.config`):
`smooth-backlog-cli/teams-validation/<key>.json` and `<key>.teams.json`, where `<key>` is the first 16 hexadecimal characters of the
SHA-256 of the team file's absolute path. They stay per user for two reasons: R21 says a command with a fresh record proceeds without
reading the file, which needs the validated copy somewhere, and a date that changes every day would otherwise be a change of the committed
configuration every day. The per-user record holds `sha` (of the copy), `valid_teams` (the names of the teams whose entries passed, as one
comma-separated text) and `validated_at` (ISO 8601 UTC). Every write is atomic (a temporary file renamed).

**The procedure** (every team command except `backlog team validate`):

1. Resolve the inputs (section 5).
2. Resolve the team file (section 1.1).
3. If `teams_file_sha` is recorded (section 1.1), the per-user record is between 0 and 24 hours old (a record dated in the future by a
   clock change is stale, review C L1), the record's `sha` and its
   copy's SHA both equal `teams_file_sha`, and the record names the command's team in `valid_teams` (for `--show-all`: every team of the
   copy), the command uses the copy and does not read the team file. A recorded SHA that differs from the record means the file changed
   (another branch checked out, a pull, an edit committed with its SHA): the copy is not used (lead decision c of R21).
4. Otherwise it reads the team file and validates the whole file (chapter 08 sections 3 to 6). It decides first whether the command
   proceeds (steps 5 to 7). Only a command that proceeds writes anything: the copy and the per-user record (the SHA of what it read, the
   valid teams, now), and `teams_file_sha` into `.backlog/config.json` when none is recorded or the recorded one differs. A refused command
   writes nothing at all, not even when another team of the file is valid (R18 and lead decision c of R21; review C H1, spike test "a
   refused team command writes nothing"). `backlog team validate` keeps its own rule (lead decision b): it refreshes the record and the
   SHA whenever at least one team is valid. The CLI prints nothing about the record or the SHA.
5. No file at the resolved location: the text of section 1.1. A file that is not JSON or not an object: exit 2, `❌ backlog: <path> cannot be
   read (<reason>); fix it and run backlog team validate --team <team>`. There is no silent empty default (finding F7 of the reference
   inventory, removed).
6. No entry for the team: exit 1, `❌ team <team> has no entry in <path> (teams: <names>)`.
7. The team's entry fails validation: exit 2, `❌ backlog: team <team> fails validation in <path>; run backlog team validate --team
   <team>`; for `--show-all`, any team failing: `❌ backlog: <path> fails validation for <teams>; run backlog team validate --show-all`.
   Nothing is written. A team whose entry passes runs even when another team's entry fails (question 4, provisional B: validity per team;
   the SHA still covers the whole file): the record of R21 lists the valid teams one by one, which only makes sense if validity is per team.
   The migration is the exception: it converts every item of every team, so every entry must pass (chapter 06 section 3).
8. The entry is used for the whole command. A command that runs again on the upstream files (chapter 04 section 6) loads again by the same
   procedure, so within the 24 hours it uses the same copy.

**Consequences (stated, not questions).**
- Within the 24 hours an edit of the team file that is not committed with its SHA is not read by later commands of that user; R21 says so.
  An edit committed together with its new `teams_file_sha` is read at once by every checkout that pulls it, because the recorded SHA then
  differs from the record (step 3).
- The committed configuration changes in the working tree when the CLI writes the SHA: on the first team command of a repository whose
  configuration records none, and whenever the team file changed without its SHA. The lead's habit that keeps every working tree clean:
  edit the team file, run `backlog team validate --team <team>` (it validates in full, refreshes the record and writes the new SHA, lead
  decision b of R21), commit both files together, push. Then every checkout finds the SHA it would write and writes nothing.
- An invalid edit stops each team command of that team with no action as soon as its checkout reads the file (R18); validating before the
  push (chapter 07) keeps it from reaching the agents.
- With the team file in a separate backlog repository and its SHA in the actionable repository (step 2 of section 1.1), the two
  repositories are pulled at different moments. A checkout whose backlog clone has not yet pulled the newer team file reads the older one,
  finds a SHA that differs from the committed one, validates in full and writes the older file's SHA into its working tree; after the next
  pull of the backlog clone it writes the newer one back. The value can flip in the working tree until both are pulled; nothing is lost and
  every command validates in full while they differ (review C L11). The lead's habit above (validate, then commit the SHA after the backlog
  file is pushed) keeps the committed value right.
- A checkout that cannot be written (a read-only working tree, a sandbox) or a state folder that cannot be written: the command proceeds,
  validating in full each time and writing nothing, silently.
- The optional environment variable for the record that lead decision a mentions is not designed: a command needs the file's content, not
  only a record, so a record without the copy cannot spare the read (`review-response.md`, round 2, finding R2-2).

Spike: `evaluator-spike/teams-load.mjs` and its 15 tests (resolution order, missing file, symbolic links, the SHA written on the first
load, a changed SHA forcing a validation, an invalid file changing nothing, validate writing the SHA, per-team validity, read-only
checkout; round 5: a refused command writing nothing, an unparsable configuration, a symbolic-link folder, a record dated in the future,
questions 1 and 6).

## 5. Inputs of a team command (coded CLI behaviour)

Context: owner rulings R3b, R14, R15 and R20 fix how a team command learns which team it acts for and who calls it; this is CLI behaviour,
the same for every team. Each input is looked up as 1 the flag, 2 the environment variable, 3 the configuration file (for the team only).
An explicit flag always wins, and a flag that differs from the variable is not refused (R15).

| input | flag | variable | configuration | when absent |
|---|---|---|---|---|
| team | `--team <name>` | SMOOTH_BACKLOG_CLI_TEAM_NAME | the `team` key of `.backlog/config.json` | the command stops (below), unless `--show-all` is given where it is accepted. An empty value counts as not given at each of the three places: `backlog setup` writes `"team": ""` into every configuration (case COD-16, review D L5) |
| agent | `--agent <name>` | SMOOTH_BACKLOG_CLI_AGENT | none | `new`, `update`, `pop` stop with exit 2 `❌ backlog: this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable`; `query`, `validate` and `migrate` (without `--ask`) work without a caller |
| session | `--session <id>` | SMOOTH_BACKLOG_CLI_SESSION | none | `$session.id` is empty |
| repository | `--repository <owner/name>` | SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY | none | the repository of the working copy. The value is the actionable repository (question 1, provisional A): the folder of the backlog the command acts on, its team file (section 1.1, step 0) and `$session.repository`. A value that is not `owner/name` stops the command: exit 2, `❌ backlog: SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY='<value>': expected owner/name` (today's check, `src/team/team.js:44`) |
| branch | `--branch <name>` | SMOOTH_BACKLOG_CLI_TEAM_BRANCH | none | the current branch of the working copy; `$session.branch`. On a detached HEAD with no branch given, `new`, `update` and `pop` stop: exit 2, `❌ backlog: HEAD is detached: check out a branch, or give --branch <name> (SMOOTH_BACKLOG_CLI_TEAM_BRANCH)` (today `src/team/pop.js:153`); `query` and `validate` work |

When no team is given by any of the three ways the command stops with exit 2 and exactly:
`❌ backlog: a team command needs a team: give --team <name>, or set the SMOOTH_BACKLOG_CLI_TEAM_NAME variable, or set the "team" key in .backlog/config.json`
(cases COD-01, R14-08; the `user` key of the configuration is never read by a team command, case COD-13). This holds for every team
command, `backlog team validate` and `backlog team migrate` included (R14). Team commands never read the operating system user or the
`user` key of the configuration (R3b); the writer recorded in an item (`updated_by`, history `by`) is the agent.

**`--show-all`** (R14; which commands take it is question 5, applied provisionally as option A) makes a command act over every team
instead of one. It is accepted by `backlog team query` (its list form, `query <item>` and `query rules`), `backlog team validate` and
`backlog team migrate`. It is refused by `backlog team new`, `backlog team update`
and `backlog team pop`, which each act on one item for one team: exit 2, `❌ backlog: --show-all acts over every team; backlog team <command>
acts for one team: give --team <name> instead` (cases R14-01 to R14-03). Given with `--team`: exit 2, `❌ backlog: --show-all acts over
every team: give it or --team <name>, not both` (case R14-07). Given while SMOOTH_BACKLOG_CLI_TEAM_NAME is set, the flag wins (R15) and the
variable is ignored (cases R14-04 to R14-06). The query forms that evaluate one team's rules (`query plan`, `query check`, `query filter`,
`query steps`) refuse it like `new` (case R14-10).

**Consequence of R15, stated once:** an agent input is a name, not a proof. A session whose SMOOTH_BACKLOG_CLI_AGENT names a member can
run `backlog team update 50 abandon --agent lead-1 --reason "not needed"` and every rule that tests `$caller.roles` sees the lead (case
R15-03). Role guards hold against mistakes, not against an agent that names someone else on purpose; the history records the name used.
The refusals of today (`src/team/pop.js:56,58`, `src/team/lifecycle.js:460`) are removed.

**Several teams on one machine** (scope note of the rulings): one process serves one team through its own SMOOTH_BACKLOG_CLI_TEAM_NAME, and a
process that must act for another team names it with `--team`, which wins (R15). No variable name changes. What several teams writing one
backlog repository at once cost is chapter 04 section 7.

The repository input selects the actionable repository: the one folder of the backlog the command reads and writes, the team file it
loads (section 1.1) and `$session.repository`; a team command never reads or writes a second repository's folder (R24). When it differs
from the working copy's repository, nothing of the working copy's `.backlog/config.json` applies except where the backlog folder is: the
team file is that repository's folder file, the SHA and the record are per user, and `migrated_at` is not written (question 1). The branch
input selects `$session.branch` and the branch new items get. Whether a session may act on an item of another branch is a rule of the team
(pattern `scope-branch`), not CLI behaviour.

**Every environment variable the CLI owns (R20).** Each is today's name with `SMOOTH_BACKLOG_CLI_` put in front, with no alias for the old
name (R18). The ruling's inventory listed ten; four more are read by `bin/` and `src/` today and are owned by the CLI, so they are
prefixed too (the last four rows):

| name after the cut-over | read today by | what it is |
|---|---|---|
| SMOOTH_BACKLOG_CLI_TEAM_NAME, _TEAM_REPOSITORY, _TEAM_BRANCH | team commands; the user-command guard of R19a | the team inputs of this section |
| SMOOTH_BACKLOG_CLI_TEAM_LEAD | `src/team/` | not read after the cut-over: the lead is a role in `people` |
| SMOOTH_BACKLOG_CLI_AGENT, _SESSION | every command | the agent and session inputs |
| SMOOTH_BACKLOG_CLI_HOME, _ORIGIN_URL | `src/shared/store.js`, `src/shared/setup.js` | where the backlog folder is, the clone address |
| SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS | `src/storage.js` | the clone lock's time budget |
| SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST | the tracked-files privacy test | the private word list of the test guard |
| SMOOTH_BACKLOG_CLI_RUN_HOOK | `bin/backlog.js:7,10`, `src/shared/help-parts.js:6` | a program the CLI runs after every command |
| SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD | `src/shared/store.js:95,101` | set by the CLI for a child process: the run lock is already held |
| SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS | `src/team/team.js:146-147` | today's review take-over wait; after the cut-over a team writes the wait as a number in its rule (function `age`), so the code that reads it goes with today's team code |
| SMOOTH_BACKLOG_CLI_TEST_SELF | `src/team/pop.js:20` | a test switch of today's pop; it goes with today's team code |

Standard system variables (HOME, USER, XDG_CONFIG_HOME, APPDATA, GIT_CONFIG_COUNT, npm_execpath) are not owned by the CLI and keep their
names.

## 6. Safety of a file anyone can push

Context: anyone who can push to the repository that holds the team file can change it, and every team command of every agent then reads it.

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
