---
name: backlog
description: >
  Use this skill when planning, prioritizing, recording progress, or completing
  this repository's backlog work, even if the user asks what to work on next
  without naming the backlog. Manage branch-local tasks and evidence through
  smooth-backlog-cli. It does not manage unrelated project trackers or Git branch cleanup.
license: Apache-2.0
compatibility: Requires Node.js 24+, Git, and the backlog executable. Optional skill helpers require Python 3.8+.
metadata:
  team: SmoothSDLC
  version: "1.0.0"
  source: "https://github.com/SmoothSDLC/smooth-backlog-cli"
---

# Repository backlog

## Purpose

Keep repository backlog work consistent across people and coding agents. The
CLI owns validation, priority normalization, storage locking, and update checks.

## Prerequisites

Work inside the target Git working tree with an initialized `.backlog/` folder.
Run `backlog --help` for the installed command contract. Before unfamiliar operations, read references/commands.md for exact syntax.

## Workflow

- [ ] Inspect: run `backlog --json` to identify the next active item. To inspect
  all current work, run `backlog list --json`. For an independently validated
  read-only JSON snapshot, run `python scripts/snapshot.py` from this skill folder.
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
- `--force` is only a whole-list `set` replacement option. It is invalid for
  archiving and initialization. To edit another branch, work in that branch.
  List/import may select another branch; move explicitly transfers one item.
- `init clean` removes the ENTIRE backlog, including all branches and backups.
  Use `init backup` when retaining data and replacing skills. Commit init changes.
- Generated skill edits are replaced by init/update; preserve edits through Git.
  Updates run at CLI execution under user preferences, not through skill hooks.
- CLI environment variables reach child processes, not the invoking shell. If Git
  cannot determine a branch, provide --branch or set BACKLOG_CLI_BRANCH in the shell.

## Shared mode: team work

Set a repository up once with `backlog setup` (it clones the backlog repository beside the repository when it is
missing, writes `.smooth-backlog.json` to commit, and deploys this skill; `--ask` asks for the path). With the shared
backlog repository (`backlog --use-backlog-repo <path>`) the commands are `new`, `update`,
`query`, `next`, `pop`, `work`, `move` and `archive`; `backlog <command> --help` is the contract. A team member
sees and changes the backlog only through them.

- [ ] Next work: `backlog work --agent <you> --json` gives the one next action, marks the item as yours (claim,
  refinement start or review start) and prints the whole item. `backlog query --phase <item> --agent <you>`
  reads one item again before you change it. `backlog update <item> --claim <you>` takes an offered item yourself;
  `--release <you>` gives it back.
- [ ] Refine: `backlog update <item> --refine-start --by <you>`, set what is missing (`--set-review-refs` with
  the coding model's review documents, `--set-estimate`, `--set-depends-on`, `--append` a definition of done), then
  `--refine-done --by <you> --note "<what you refined>"`.
- [ ] Work and hand off: record each step with `--append`; blocked on something, `--waiting "<what>"`, then
  `--waiting-done`. Hand off with `--request-review any --note "<commits, evidence>"`. A review is `--start-review
  --by <you>`, then `--review pass|changes --by <you> --comments` citing one of the item's review_refs; the claimer
  closes with `--close --summary`.
- [ ] Your review request, a changes verdict you give and your close end your session: the output's last line says
  END THE SESSION NOW (and `backlog work` answers stop until a fresh session): reply with text only and make no
  further tool call.
- [ ] Team lead: split with `backlog new --split-from <item>` (the child starts in stage refining); send a refined
  item on with `--request-refinement-review --by <you>`, record the verdict with `--refinement-review
  pass|changes|limit --by codex|claude --comments`; ask the owner with `--request-decision "<question>" --by <you>`
  (`backlog query --decisions` lists them; the owner answers with `--decision "<answer>"`); `backlog query --plan` is
  the team's dispatch plan.

Work-in-progress limits (wip-limits.json in the backlog repository) refuse a claim or a refinement start past
them; `backlog query --wip` shows the counts. Only the team lead lifts a team or agent limit for one item
(`--wip-override "<reason>" --by <lead>`).

Act only as yourself: another agent's item or review is the team lead's to hand on (`--reassign <agent> --reason
"<why>"`, `--reassign-review <agent> --reason "<why>"`). A team's item is claimed only in stage ready; one waiting in review-hitl waits for the
owner's `--decision`.

## Skill validation

Run `python scripts/validate-skill.py` after modifying the skill package. It checks
structure and local references; when installed, skills-ref also checks metadata.
Trigger fixtures are in `scripts/eval_queries.json`; output cases are in
`evals/evals.json`. Model-based trigger/output evaluation requires an evaluation
harness and is separate from structural checks.
