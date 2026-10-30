# PR1 learnings: the acceptance contract for the backlog CLI (PR3) (2026-10-28)

PR1 of SmoothSDLC/cody-topology-bigfan-linux (merged 2026-10-28) proved that qwen-code can stop a team member and start
it again under the same name, and built the team workflow into the Python backlog scripts of that repository's
`cody/skills/backlog/scripts` (update.py, query.py, lib_db.py, new_phase.py), the team-lead dispatcher
(`cody/skills/team-lead/scripts/dispatcher.py`) and the team-member wake loop (`cody/skills/team-member/scripts/wake_hook.py`).
The owner's target (2026-10-28) is that the CLI becomes the only interface to the backlog: team members see the backlog
only through it, and the repositories carry no backlog scripts or item files. Every rule below is therefore a requirement
on this CLI. Each names the owner decision behind it and where PR1 implements it today, so the CLI can be built and tested
against the same behaviour. The workflow document is `docs/team-workflow.md` of the topology repository; the decisions
are in its `docs/owner/DECISIONS.md` ("Decided 2026-10-28" and earlier).

## 1. No work classes and no review classes
- Owner 2026-10-28, said three times: work classes and review classes are dead. They are never added, suggested, kept
  or revived in any form. The CLI must not read, write, accept, document or suggest `work_class`, `review_classes`,
  `--classes`, `--review-classes`, class profiles in a roster, or class-based claim or review rules.
- Older items may still carry those front-matter fields: they are ignored, never read.
- Chunk work is `chunk: true` (PR1: `lib_db.is_chunk`). A review is needed when the item has `review_refs`
  (`lib_db.needs_review`).
- Today this repository still implements classes (src/shared/team.js, update.js, new.js, help.js, COMMANDS.md and the
  shared-team-*.test.js files): that is the first thing to remove.

## 2. Review documents, and who reviews
- Every team item names its review documents in `review_refs`: `references/review/<type>.md` of SmoothSDLC/cody-coding-model
  (code, contract, delivery, docs, iac, tests, ...). Creation in team mode is refused without one (PR1: new_phase.py).
- Any team member but the author (the claimer) reviews any item. Start-review and review are refused for the claimer
  (PR1: update.py `--start-review`, `--review`).
- A review's comments must cite at least one of the item's `review_refs` (PR1: update.py `--review`).
- An item with `review_refs` finishes only through close after a passing review, never through a plain status change
  (PR1: update.py, "reviewed items finish through --close only").

## 3. Teams
- A team is a name plus any subset of the agents (one to four). Several teams can work on one branch.
- The runner passes `TEAM_NAME` and `TEAM_WORK_ITEM`, writes the team on the work item (`--set-team`) and claims it for
  the lead.
- Every item the lead splits off inherits the team (`--split-from`, or `--team`); the team that refined and split items
  owns them. With `TEAM_NAME` set, a member is offered only its own team's items.

## 4. Stages before any work
`refining` → `refined` → `refinement-review` → `ready` (PR1: lib_db stages; update.py `--refine-start/--refine-done/
--request-refinement-review/--refinement-review`).
- An item split off by the lead starts in `refining`, and is claimed only in `ready`.
- A member, not the lead, refines in the first round: team fields and a checkable definition of done.
- The lead sends the item to the refinement review. Codex reviews through the codex-agent MCP; Claude reviews through the
  claude-agent MCP only when Codex reports its 5-hour limit. The lead records the verdict with `pass|changes --by
  codex|claude --comments`.
- On pass the item is `ready`; on changes it goes back to `refining`, with the findings.
- An item that needs an owner decision waits in stage `review-hitl`. The nightly morning report lists the decision; after the
  owner's answer the item goes back to `refining`, where the lead re-refines it with the decision (topology item 288, owner
  2026-10-28; CLI item 036).
- An item whose body has only the definition-of-done placeholder is incomplete. In team mode nobody claims, reviews or
  works it; the lead only refines it (owner 2026-10-22).

## 5. The pick-up order (one next-work action)
The member's next action, in this fixed order (PR1: query.py `--pop`):
1. its current task: a review in progress, an active item, a refinement in progress;
2. reviewed work: close a passed item, rework a changes-requested one;
3. another member's review request (never its own item);
4. the first-round refinement of a team item in stage `refining` that nobody refines;
5. the next `ready`, unblocked item of its team, in priority order;
6. a chunk, else idle.

Target (item 033): ONE command, for example `backlog team member next`. It applies this order, claims the item for the
agent, and prints the whole item with its one instruction.

## 6. One active item at a time
An agent pulls new work only while every item it holds waits: review requested, or `--waiting "<what>"`. Holding more
than one active item, it may only review or do chunk work (owner 2026-10-22; PR1: `lib_db.claim_refusal`).

## 7. Every task in a fresh session (the hand-off lock)
Owner 2026-10-25/28: every task starts in a fresh session, and a member that hands its item to review releases its session.
PR1 implements this with a hand-off marker:
- A review request or a close by the item's claimer writes `<team>/handoff/<agent>.json` (`{"at_ms", "seq"}`, under
  `~/.qwen/teams/<team>/`). Two exceptions: no marker while the claimer still holds another active item; never one for the
  lead, who is not a member.
- Until Qwen registers a session of that agent whose `joinedAt` is newer than the marker, the agent's next-work answers
  `stop`, and claim, refine-start and start-review are refused. Owner 2026-10-30: nothing else ever holds a member. Only
  a valid marker (`{"at_ms", "seq"}`) of a registered member with a valid session time stamp stops it; a missing name,
  an unreadable config.json, an unreadable or malformed marker and an invalid time stamp stop nobody (the CLI warns).
  The CLI never writes a malformed marker, and a marker it cannot write refuses the hand-off, so the agent retries.
- The dispatcher resets from the markers (they survive its restarts), tells the lead again every 10 minutes, and sends
  cody-alert after 20 minutes without a fresh session. It renames a released marker to `<agent>.released`, and only if it
  is still the marker it read.
- Target (item 033): the command that moves an item from implementing to review, from review to changes-requested, or to
  done ends its output with the instruction to end the session now (a text-only reply, no other tool call).

## 8. The lead
- The lead never claims an item. Only the lead may take an item from one agent and give it to another (item 033 refuses
  it to members).
- While its team works, the lead waits by ending its turn with a text-only reply, never by polling with a tool call.
  Proof runs 01 and 02 ended in qwen-code loop detection when it polled.
- The lead's next-work holds back only its busy "continue" on the work item, and only for team items it does not itself
  block. A passed or changes-requested item of the lead's keeps its close or rework action.
- The lead closes the work item when every child is done.

## 9. Who closes
Only the claiming agent closes its item; if it still has not closed, the team lead closes it when available (owner
2026-10-25). The monitoring service never closes items and never judges a definition of done.

## 10. Work-in-progress limits (item 034)
Limits overall, per repository, per branch, per team and per agent, checked by every command that starts work. A read
command lists the counts and the in-progress items without a recorded step for 48 hours.

## 11. The backlog as a black box
Team members know the backlog only through this CLI. The skills name only CLI commands: no backlog path, file, repository,
git command or script (owner 2026-10-28; item 033). This CLI's `templates/skills/backlog` becomes the one source of the
backlog skill. The topology installs it to `~/.qwen/skills/backlog` and to the backlog repository's `skill/backlog`, which
Claude and Codex link to.

## 12. Run reporting and monitoring
Every run of the CLI reports its name, exit code and times to the topology's script-run recorder
(`$CODY_SCRIPT_RUNS_MODULE`, default `/opt/cody/bin/script_runs.py`; Prometheus `cody_script_runs_total`). The recorder
never blocks or fails the run, including a recorder that raises or exits at import. `bin/backlog.js` does this since
d0dc5f1; its tests set `CODY_SCRIPT_RUNS_FILE=/dev/null`, so test runs write no records.

## 13. Repository identity and dependencies across repositories
The backlog folder is keyed by the origin's owner/name. This repository was renamed from SmoothSDLC/backlog-cli to
SmoothSDLC/smooth-backlog-cli, and its folder was moved to SmoothSDLC/smooth-backlog-cli on 2026-10-28, keeping its history. Items depend on items of other repositories
(owner/name#seq in depends_on, CLI item 042); a not-done foreign dependency blocks claim and next-work like a local one.

## 14. Tests
- The backlog tests run the way agents run, against the real shared backlog repository (owner 2026-10-11), and remove
  every item they create.
- Tests are written first and travel with the code.
- No check may ever block Cody from running because installed skills changed (owner 2026-10-27).
