---
name: backlog
description: >
  Use this skill when planning, prioritizing, recording progress, or completing
  this repository's backlog work, even if the user asks what to work on next
  without naming the backlog. Manage branch-local tasks and evidence through
  smooth-backlog-cli. It does not manage unrelated project trackers or Git branch cleanup.
license: Apache-2.0
compatibility: Requires Node.js 24+, Git, and the backlog executable.
metadata:
  team: SmoothSDLC
  version: "1.0.0"
  source: "https://github.com/SmoothSDLC/smooth-backlog-cli"
---

# Repository backlog

## Purpose

Keep repository backlog work consistent across people and coding agents. The
CLI owns validation, priority normalization, storage locking, and update checks. The CLI is the
only interface to the backlog: read and change it only through `backlog` commands, never its files.

## Prerequisites

Local mode: work inside the target Git working tree with an initialized `.backlog/` folder. Shared backlog repository
mode (every SmoothSDLC repository): see "Shared mode: team work" below; its commands differ.
When the `backlog` command is missing, run `bash <this skill folder>/scripts/install-backlog-cli.sh` from inside the
repository: it installs or updates the CLI, then runs `backlog setup` with its arguments (`--ask` asks for the path).
Run `backlog --help` for the installed command contract. Before unfamiliar operations, read references/commands.md for exact syntax.

## Workflow (local mode)

- [ ] Inspect: run `backlog --json` to identify the next active item. To inspect
  all current work, run `backlog list --json`.
- [ ] Plan: retain the selected item's GUID and describe the intended field or
  list changes. Check its branch, state, and task-entry numbers against current
  `backlog list --json` output before mutation.
- [ ] Execute: use the GUID for durable references. Use `set` for scalar fields;
  `add` or list `set` appends. Use `replace` for whole-list replacement and
  `remove` for a one-based list-entry number. Record verifiable outcomes and evidence.
- [ ] Validate: run `backlog list --json` and confirm the affected record and
  priorities. If validation fails, report the CLI error and resolve its cause
  before continuing. Finish with `backlog <guid> done` only after checking evidence.

## Example

Immediately after inspecting the current active queue, append a task and verify it:

```sh
backlog list --json
backlog 0 add tasks "Reproduce bug,Failing test captures the regression"
backlog list --json
```

Retain the returned GUID for subsequent commands if priorities may change.

## Gotchas

- A number selects its CURRENT active priority (starting at 0), not permanent
  identity. Reordering or completing work can make that number select another item.
- Entry numbers inside tasks/outcomes/evidence/references start at 1.
- States are new/open/done/archived. Done and archive rows have GUIDs and no priority.
  Reopening done work puts it first; ordinary new and moved work goes last.
- In local mode, `--force` is only a whole-list `set` replacement option. It is invalid for
  archiving and initialization. To edit another branch, work in that branch.
  List/import may select another branch; move explicitly transfers one item.
- `init clean` removes the ENTIRE backlog, including all branches and backups.
  Use `init backup` when retaining data and replacing skills. Commit init changes.
- Generated skill edits are replaced by init/update; preserve edits through Git.
  Updates run at CLI execution under user preferences, not through skill hooks.
- CLI environment variables reach child processes, not the invoking shell. If Git
  cannot determine a branch, provide --branch or set BACKLOG_CLI_BRANCH in the shell.
- Run reporting: the executable reports each run to an optional run recorder hook.

## Shared mode: team work

Set a repository up once with `backlog setup` (it clones the backlog repository beside the repository when it is
missing — the clone URL is a setting: the environment variable `BACKLOG_ORIGIN_URL` first, then the `backlog_origin_url`
key of `.smooth-backlog.json`, with no built-in default, and a command that needs it refuses, naming both sources, when
it is in neither; it refuses the same way a value that is not one of the accepted forms (https://host[:port]/owner/name,
also http, ssh://[user@]host[:port]/owner/name, user@host:owner/name, or an absolute local path ending in
/owner/name; owner and name are each one segment of letters, digits, dot, underscore or dash, neither '.' nor
'..', an optional trailing .git on the name), and the origin check refuses a clone with no origin — writes
`.smooth-backlog.json` to commit, keeping the file's other keys so
an origin URL that lives only in that key survives the write, and deploys this skill; `--ask` asks for the path). The per-user record of
`backlog --use-backlog-repo <path>` is the file `<name>/home` under the config folder ($XDG_CONFIG_HOME, else
`~/.config`; `<name>` the repository name from the setting, a neutral name without it): a record written before the
setting existed keeps working when the setting names the same repository, with no migration. With the shared backlog
repository (`backlog --use-backlog-repo <path>`) the commands are `new`, `update`,
`query`, `next`, `pop`, `work`, `move` and `archive`; `backlog <command> --help` is the contract. A team member
sees and changes the backlog only through them.

- [ ] Next work: `backlog work --agent <you> --json` gives the one next action; when it is a claim, a refinement or a
  review, it marks the item as yours (claim, refinement start or review start) and prints the whole item. `backlog query --phase <item> --agent <you>`
  reads one item again before you change it. `backlog update <item> --claim <you>` takes an offered item yourself;
  `--release <you>` gives it back.
- [ ] Refine: `backlog update <item> --refine-start --by <you>`, set what is missing (`--set-review-refs` with
  the review-documents repository's review documents, `--set-estimate`, `--set-depends-on`, `--append` a definition of done), then
  `--refine-done --by <you> --note "<what you refined>"`.
- [ ] Work and hand off: record each step with `--append`; blocked on something, `--waiting "<what>" --by <you>`,
  then `--waiting-done --by <you>`. Hand off with `--request-review any --note "<commits, evidence>"`. A review is `--start-review
  --by <you>`, then `--review pass|changes --by <you> --comments "<findings, citing one of the item's review_refs>"`.
  Two review stages are enforced before any close, with or without review documents: first a Cody review (a Cody
  agent - a name starting with cody, or a session name - in a fresh session, never the author session that
  claimed the item - the claim's session name, never the team name - so a fresh session of the same card, or of
  the team, may), then an external review by codex or claude on the same commit. A pass pins the item's current work commit; a pass on an older commit stops counting
  when the commit moves, and a changes verdict at either stage clears both stages. A passing Cody review asks for
  the external review; a passing external review asks for the close. The owner closes without a review on a written
  decision: `--close --by owner --reason "<the decision>"`, recorded as an owner decision.
  Otherwise the claimer closes with `--close --summary "<what was delivered>"`.
- [ ] Hand-off: the producer records its hand-off for each dependent before the dependent may be offered or claimed,
  and the team lead accepts or rejects it: the claimer runs `backlog update <item> --handoff <dependent>
  --handoff-commit <sha> --handoff-contract "<text>" --handoff-verification "<text>" [--handoff-outputs ...
  --handoff-pickup ... --handoff-risks ...] --by <you>`, and the lead answers `--accept-handoff <dependent>
  --checks "<what was checked>" --by <lead>` (only after the producer's review passed) or `--reject-handoff
  <dependent> --reason "<why>" --by <lead>`; a re-recorded hand-off makes an earlier receipt stale.
- [ ] A member's review request, a changes verdict it gives and its close end its session (never the lead's): the
  output's last line says END THE SESSION NOW: reply with text only and make no further tool call (when the CLI
  recorded a hand-off for a Qwen team member, `backlog work` also answers stop until its fresh session).
- [ ] Team lead: take your team's work item with `backlog team pop --team <team>` (claimed for you, shown whole; idle
  exits 3; a work item held by an earlier session of your card is continued, and the claim records your new session
  on the item first; a refused continuation claim stops the command, exit 1, the earlier session keeps holding; a
  claim that is handed back between the claim and the final read stops the command too, exit 1, the earlier session
  keeps holding), then
  split it with `backlog new --split-from <item> --depends-on <ids|none>` (a child of an item starts in stage refining, with or without a team, and takes its refinement review before it is claimed; a child of a team's item inherits the team); send a refined
  item on with `--request-refinement-review --by <you>`, record Codex's verdict with `--refinement-review
  pass|changes --by codex --comments "<findings; thread id>"`; only when Codex answers that its limit is exceeded, record that with
  `--refinement-review limit --by codex --comments "<Codex's answer>"`, then Claude's verdict with `--by claude
  --comments "<findings; session id>"`; ask the owner with `--request-decision "<question>" --by <you>`
  (`backlog query --decisions` lists them; the owner answers with `--decision "<answer>"`); `backlog query --plan` is
  the team's dispatch plan; re-rank with `--replan "<id,id,...>"` or `--priority <rank>`, `--set-team <team>`
  gives an item to a team, and `--set-chunk yes` makes it chunk work any member does between items.

Work-in-progress limits (wip-limits.json in the backlog repository) refuse a claim or a refinement start past
them; `backlog query --wip` shows the counts. Only the team lead lifts a team or agent limit for one item
(`--wip-override "<reason>" --by <lead>`).

Act only as yourself: another agent's item or review is the team lead's to hand on (`--reassign <agent> --reason
"<why>" --by <lead>`, `--reassign-review <agent> --reason "<why>" --by <lead>`). A split item (with or without a
team) is claimed only in stage ready; one waiting in review-hitl waits for the owner's `--decision`.

Session names: a card's sessions are named `<item, 3 digits><card id>:<increment, 2 digits>` (a colon inside the
name) and a team joins its card ids with colons. The colon is part of the name: it works in every command, in the
front matter, the event log, the commit subject (which carries the agent a `--claim`, `--release` or `--by`
command names) and the hand-off marker file name `~/.qwen/teams/<team>/handoff/<agent>.json`.
The self-review rule is per session: `--claim` and `--request-review` record the session name on the item
(`session_authors`, kept on release like `review_author`); the session that claimed or asked is refused with
"the same session cannot review its own work; a new session may", and a new session (a new name) reviews it.
A `--reassign` keeps the former holder in the list (and adds the new holder), so the block survives a hand-off.
A new session of the same card continues the item its earlier session claimed (a rework after a review, or
the close): a `--claim` with a name sharing the `<item><card>` part before the colon records the new session
name on the item, with no takeover and no lead reassignment; the self-review block still applies to every
earlier session name of the item (a continuation of an item without `session_authors`, claimed before the list
existed, keeps the earlier holder in the list). pop, work and the dispatch plan (`backlog query --plan`) offer
the rework and the close to the new session, which claims the item first (a continuation claim) before those
steps; the lead's completed-team review-and-close in pop starts with the same claim, and `backlog team pop`
records the continuation claim itself when an earlier session of the lead's card holds the team's work item: a
refused claim is no success - the command stops (exit 1, the reason on standard error) and the earlier session
keeps holding; a claim that is handed back between the claim and the final read is no success either - the
command stops (exit 1, the item changed before it could be shown) and the earlier session keeps holding.
A review requested by a session other than the claimer (the team lead) records that session in
`session_authors` too.

Class options: the CLI has no class options (work or review): no `--classes`, no class profiles. The removed
class fields stay out of the help texts, COMMANDS.md, README.md, templates and CHANGELOG.md; the negative test
.agents/test/shared-no-classes.test.js pins that (item 049).
