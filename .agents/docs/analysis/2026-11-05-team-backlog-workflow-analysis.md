---
title: The team's backlog CLI workflow - the exact commands, in order, for every use case of an agent team
applies-to: the team lead and every team member (any card, any agent); the single authoritative sequence of smooth-backlog-cli commands a team runs. the team-lead and team-member skills point here and do not repeat it.
sources: owner 2026-11-05 (team awareness only under `backlog team`; one status flow; team behaviours only from the configuration; verdict is reject or complete); the team's card-lifecycle reference (stages); the team's team-workflow reference; the team's refine-and-split reference section 3; the team's item-dependency-handoff reference
status: TARGET - this is the workflow the backlog CLI implements in the simplification of PR #3 (its "item template and status flow" phase). Until that phase is live on this host, the commands of the CURRENT CLI are listed under "Today" in each step; the skills switch to the target commands in the same change that lands them.
---

# 0. The rules this document rests on

1. Two kinds of commands. `backlog <command>` is for people and for any agent working alone: it knows nothing of
   teams. `backlog team <command> --team <name> --agent <name>` is the only place the CLI knows a team exists: it reads
   that team's entry in the backlog configuration and refuses what the entry forbids. Nothing outside `backlog team`
   enforces, offers or checks a team rule.
2. The team configuration is the only source of team behaviour: who the lead is, who the members are, which review
   stages an item must pass and how many passes each needs, and the work-in-progress limits. A `backlog team` command
   for a team that has no entry is refused with the message "team <name> is not configured"; it never passes silently.
3. One status per item (the words of decision J). The team steps move an item along the order and refuse any other
   move; `backlog update --status` is refused on an item that has a team ("use backlog team update") and free outside
   a team (decision V: closed, done and archived mean finished; any other word means open).
4. A review verdict is `complete` or `reject`, nothing else (decision W). A rejection returns the item to the step
   before that review with the findings in the item's review history. A finding outside the item's scope is a new item
   (`backlog new --split-from <item>`) and a decision request to the lead; that is a rule of the skills, not of the CLI.
5. Every step is recorded on the item by the command that performs it (actor, time, commit, note). Nothing is written
   to a backlog file or read from one by hand.

# 1. The status order

| Status | Meaning | Entered by |
|---|---|---|
| new | created, not refined; a team item is not claimable here | `backlog new`, `backlog new --split-from` |
| refining | a member holds its refinement | `team update --refine-start` |
| refined | refinement finished, waiting for the lead to send it to the refinement review | `team update --refine-done` |
| refinement review | the refinement reviewer (external reviewer 1; reviewer 2 past reviewer 1's limit) is reviewing it | `team update --request-refinement-review` |
| ready | the refinement review passed; any member may claim it | `team update --refinement-review complete` |
| in progress | claimed, being implemented (also after a rejected implementation review) | `team update --claim`; `team update --review reject` |
| ready for review | the author asked for the review and ended its session | `team update --request-review` |
| reviewing | a member who is not the author is reviewing it (the peer review) | `team update --start-review` |
| ready for external review | the peer review passed; waiting for the lead to start the external review | `team update --review complete` (first stage) |
| external review | an external reviewer is reviewing it | `team update --start-review --agent <reviewer>` |
| review complete | every review stage the team requires passed on the current commit; waiting for the claimer's close | `team update --review complete` (last stage) |
| awaiting decision | waits for an owner decision; nobody claims it or an item that depends on it | `team update --request-decision`; back to its previous status on `--decision` |
| closed | closed by its claimer (the lead as fallback) with a summary; hand-offs accepted | `team update --close` |
| archived | moved out of the queue for good | `backlog archive` |

Which review stages exist and how many passes each needs is the team's configuration (`review: [{stage: peer, team:
<team>, count: 1}, {stage: external, team: external, count: 1}]`); a team with no review stage configured goes from
`ready for review` to `review complete` when the one review passes; a team with none at all goes from `in progress`
to `review complete` on `--request-review`. The order itself is the CLI's; the configuration says which stages apply.

An item without a team: `new` → (any word) → `closed` → `archived`; the person sets the word with `backlog update --status`.

# 2. The configuration

`.backlog/config.json` of the repository (written by `backlog setup`): `backlog_repository`, `push-backlog-updates`,
`user` (git `user.name`, else the logged-in user), `team` (the default team of items created here; empty for none).
`user` is the owner recorded on items created without a team; `team` is the team recorded on `backlog new` without
`--team`. Environment variables override both for one command; they are never the default.

Teams: the `teams` object of the backlog repository's configuration (today `teams.json` at the backlog root): per team
`lead`, `members`, `review` (the stages above), `refinement_review` (reviewer names allowed to record it), `wip`
(limits). A team session passes `--team` and `--agent` on every `backlog team` command; `TEAM_NAME` and
`BACKLOG_AGENT` may stand in for them in a session that sets them.

# 3. Use cases, in the order a run goes through them

Every command below runs from the team's working directory on the team's branch. `<T>` is the team, `<L>` the lead,
`<M>` a member, `<I>` an item (number or slug).

## 3.1 The lead starts a session
1. `backlog team pop --team <T> --agent <L> --json` - the lead's next action, first match: `continue` (the work item
   it holds), `refinement-review <I>` (a refined item to send on), `external-review <I>` (an item ready for external
   review), `reassign-review <I>` (a stale review), `claim <W>` (the team's next unrefined work item, claimed for the lead
   and printed whole), `idle` (exit 3: end the turn without polling).
   Today: `backlog team pop --team <T>` claims the work item; `backlog pop --agent <L>` gives the other actions.
2. On `claim <W>`: refine and split it per the team's card-lifecycle reference stages 1 (family review F1-F4 first).
   For each slice: `backlog new --split-from <W> --name "<title>" --summary "<sentences>" --objective "<why>" --depends-on
   "<ids|none>" --review-refs <paths> --estimate <min> --layer <l> --body "<definition of done, SKILLS, REFERENCES, TOOLS>"`
   (user command: it writes fields; the slice inherits the team and starts `new`). Record the family map on `<W>`
   with `backlog update <W> --append "<map>"`.
3. Order the slices: `backlog update <I> --priority <rank>` in dependency order directly before `<W>`.
   Today: same.

## 3.2 A member refines a slice
1. `backlog team pop --team <T> --agent <M> --json` → `refine <I>` (the first `new` slice nobody refines, or the one
   `<M>` already refines). The command marks it: status `refining`, refiner `<M>`.
   Today: `backlog work --agent <M>` marks `--refine-start`.
2. Complete the team fields: `backlog update <I> --set-review-refs ... --set-depends-on ... --set-estimate ...
   --set-complexity ... --set-layer ...` and the definition of done (`--append`). User-command field edits.
3. `backlog team update <I> --team <T> --agent <M> --refine-done --note "<STAGE_HANDOFF v1>"` → `refined`.
   Today: `backlog update <I> --refine-done --by <M> --note`.
4. Reply `REFINED <I>` and end the turn (no other tool call).

## 3.3 The lead runs the refinement review
1. `backlog team pop` → `refinement-review <I>`.
2. `backlog team update <I> --team <T> --agent <L> --request-refinement-review` → `refinement review`.
3. Ask external reviewer 1 (reviewer 2 past reviewer 1's limit) for the verdict per the team's review-convergence reference (whole family, F5).
4. `backlog team update <I> --team <T> --agent <reviewer> --refinement-review complete|reject --comments "<findings; thread>"`
   → `ready` on complete; `refining` on reject (the refiner's pop offers it again with the findings).
   Today: `--refinement-review pass|changes --by <reviewer>`.
5. Third rejection: `<alert-tool> send ...`, then `backlog team update <I> --request-decision "<question>"`
   → `awaiting decision`.

## 3.4 A member claims and implements
1. `backlog team pop --team <T> --agent <M> --json` → `claim <I>` (the first `ready` slice in priority order whose
   dependencies are closed and whose producers' hand-offs are accepted, within the work-in-progress limits). The
   command claims it: status `in progress`, owner `<M>`, and prints the whole item. A refused claim means no work.
   Today: `backlog work --agent <M>` (or `backlog pop --agent <M> --claim-now`, or `backlog update <I> --claim <M>`).
2. Implement per the team's card-lifecycle reference stage 3. Record steps: `backlog update <I> --append "<CHUNK/plan/evidence>"`.
3. Waiting for a run: `backlog team update <I> --team <T> --agent <M> --waiting "<run id, what>"`; the next team step
   ends the wait.
4. If `<I>` has dependents: write the dependency hand-off artifact, commit it, then for each dependent
   `backlog team update <I> --team <T> --agent <M> --handoff <D> --handoff-commit <sha> --handoff-contract "<text>"
   --handoff-verification "<text>"`.
5. `backlog team update <I> --team <T> --agent <M> --request-review --note "<STAGE_HANDOFF v1: commits, how to check>"`
   → `ready for review`. Reply `REVIEW-REQUESTED <I>`, end the turn.
   Today: `backlog update <I> --request-review any --note`.

## 3.5 Another member runs the peer review
1. `backlog team pop --team <T> --agent <R> --json` → `review <I>` (a `ready for review` item `<R>` did not author;
   a review request older than 5 minutes comes before `<R>`'s own next work). The command marks it: `reviewing`,
   reviewer `<R>`.
   Today: `backlog work` marks `--start-review`.
2. Review per the item's review_refs, the team's adversarial-review reference and the team's review-convergence reference (re-index codebase-memory-mcp on
   the pushed commit first).
3. `backlog team update <I> --team <T> --agent <R> --review complete|reject --comments "<findings with evidence class;
   a review_refs path>"` → `ready for external review` on complete; `in progress` on reject (the author's pop offers
   the rework). Reply `REVIEWED <I>`, end the turn.
   Today: `--review pass|changes --by <R>`.

## 3.6 The lead runs the external review
1. `backlog team pop` → `external-review <I>`.
2. `backlog team update <I> --team <T> --agent <reviewer> --start-review` → `external review`.
3. Ask external reviewer 1 (reviewer 2 past the limit) for the verdict against review_refs and the team's card-lifecycle reference R3/R4.
4. `backlog team update <I> --team <T> --agent <reviewer> --review complete|reject --comments "<findings; thread>"` →
   `review complete` on complete; `in progress` on reject. At most three rounds, then the lead reviews.
   Today: `--start-review --by <reviewer>`, `--review pass|changes --by <reviewer>`.

## 3.7 The lead accepts the hand-offs
For each dependent `<D>` of a producer in `review complete`: read the artifact against `<D>`'s inputs, then
`backlog team update <I> --team <T> --agent <L> --accept-handoff <D> --checks "<text>"` or `--reject-handoff <D>
--reason "<text>"`. A dependent is offered by nobody's pop until every edge is accepted.

## 3.8 The claimer closes
1. The claimer's `backlog team pop` → `close <I>` (its item in `review complete`).
2. `backlog team update <I> --team <T> --agent <M> --close --summary "<outcome, evidence>"` → `closed`. Refused when
   the status is not `review complete` or a hand-off is not accepted; the refusal names the missing step and its command.
   Reply `CLOSED <I>`, end the turn.
3. Lead fallback: `backlog update <I> --note "CLOSE_REMINDER actor=<L> at=<UTC>"`; after 20 minutes, `backlog team
   update <I> --team <T> --agent <L> --close --summary "<why the lead closes>"`.

## 3.9 Decisions for the owner
`backlog team update <I> --team <T> --agent <X> --request-decision "<problem in two sentences; options with two
sentences each; recommendation>"` → `awaiting decision`; the lead batches them to the owner (the owner-alert tool, one per
message). The answer: `backlog team update <I> --team <T> --agent <L> --decision "<answer>"` → the status it had before.
`backlog team query --team <T> --decisions` lists the open ones.

## 3.10 Taking work from an agent
`backlog team update <I> --team <T> --agent <L> --reassign <M2> --reason "<why>"` (an item), `--reassign-review <R2>
--reason` (a stale review), `--release` by the holder itself. Lead only, reason recorded.

## 3.11 The lead ends the run
1. `backlog team query --team <T> --status --json`: every slice `closed`, no open review, no unaccepted hand-off, no
   `awaiting decision`.
2. `backlog team update <W> --team <T> --agent <L> --close --summary "<the work item's outcome>"`.
3. End the team session. `idle` from pop is never proof of completion.

## 3.12 Reads during a run (no team logic)
`backlog query --status`, `backlog query <I>`, `backlog next` (the open item with the best priority, printed whole:
header and body), `backlog query --blocked`. Team views: `backlog team query --team <T> --claimable | --reviewable |
--plan | --wip | --decisions`.

# 4. What the CURRENT CLI does differently (the incoherences this exercise exposed)

1. Team steps are flags of the user-command `backlog update` (`--claim`, `--review`, `--close`, ...); team-aware reads are
   flags of the user-command `backlog query` (`--claimable`, `--reviewable`, `--plan`, `--decisions`, `--wip`); `backlog next`
   skips items by hand-off state. Target: all of it under `backlog team`.
2. Three next-action commands: `backlog pop` (answers, writes only with `--claim-now`), `backlog work` (answers and
   marks), `backlog team pop` (the lead's work item only). Target: one `backlog team pop` that answers by the agent's
   role in the configuration and marks the step; no `backlog pop`.
3. Three state fields (status / stage / review state) with no words for new, ready for external review and review
   complete; the peer review and the external review are the same command with different `--by` names. Target: the
   one status order of section 1.
4. Review enforcement depends on review rules in `teams.json`; the shared backlog on this host has no `teams.json`, so
   a team item closes today without any review although the skills say the CLI refuses it. Target: a team without a
   configuration entry is refused at the first team step; the stage order is the CLI's, the stages that apply are the
   configuration's.
5. Team identity comes from environment variables by default (`TEAM_NAME`, `TEAM_LEAD`, `TEAM_ROSTER`, `BACKLOG_AGENT`,
   `TEAM_REPOSITORY`, `TEAM_BRANCH`) and from a separate roster file (`team.json`, `--roster`); `.backlog/config.json`
   holds no user and no team. Target: `--team`/`--agent` on the command, defaults from the configuration, environment
   variables as overrides only; one configuration for teams, no roster file.
6. `backlog new --split-from` makes the slice `refining` by itself and a team item without a stage is treated as
   refining (team awareness inside a user command and an implicit state). Target: a new item is `new`; the team field
   alone says a team owns it.
7. `backlog update --status done` runs the team close gate (team awareness in a user-command edit). Target: refused on a team
   item, free outside a team.
8. `backlog next` prints the header of the item (number, slug, status, objective, summary, progress), not its text.
   Target: the whole item.
9. The verdict words are `pass|changes`; the skills say "review rejected". Target: `complete|reject`.
10. The skills say "pop returns stop", "the CLI refuses any close without the external review" and "the lead never
    claims" while the lead claims the work item through team pop; the skills are rewritten to sections 1-3 when the CLI
    lands (an item in this repository, after the CLI phase).
