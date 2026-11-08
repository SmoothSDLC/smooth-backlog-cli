# PR #3 simplification — decision log and ledger

This file is the decision log and ledger of the whole PR #3 simplification effort: the phase table, every owner decision and rule, and the outcome and lessons of each phase. It was kept in the shared backlog repository while the work ran and moved here on 2026-11-08 with the private details replaced by generic wording.

Documents in this folder, in execution order. One session per phase (a sub-agent, per the owner's rule on
sub-agents); each phase document is self-contained (context, skills to load, tasks, commands, expected outputs, report).
Every commit on the branch goes live as the machine's `backlog` at once (`commit.sh` runs a deploy script: an exact
export of HEAD into the installed package folder) — the owner's rule: the live machine runs the latest commit of the
active branch at all times.

| Order | Document | State |
|---|---|---|
| 0 | [2026-11-04-recommendations.md](completed/2026-11-04-recommendations.md) — the review, analysis and recommendations behind the phases | reference |
| 1 | [2026-11-04-phase-1-duplicates-and-output.md](completed/2026-11-04-phase-1-duplicates-and-output.md) | done 2026-11-04 |
| 2 | [2026-11-04-phase-2-events-in-item-files.md](completed/2026-11-04-phase-2-events-in-item-files.md) | done 2026-11-04 |
| 3 | [2026-11-04-phase-3-database-as-cache.md](completed/2026-11-04-phase-3-database-as-cache.md) | done 2026-11-04 (superseded by Phase 6: the cache goes too) |
| 4 | [2026-11-04-phase-4-remove-mirror-repair.md](completed/2026-11-04-phase-4-remove-mirror-repair.md) | done 2026-11-04 |
| 5 | [2026-11-04-phase-5-sync-parity.md](completed/2026-11-04-phase-5-sync-parity.md) — pull before every command, push after every change, retry, stale rejection showing the item, in both locations | done 2026-11-05 |
| 6 | [2026-11-05-phase-6-committed-index.md](completed/2026-11-05-phase-6-committed-index.md) — the committed per-repository index is the authoritative order (per branch); no SQLite, no cache; unreadable item → field named, fix or `--restore` | done 2026-11-05 |
| 6b | [2026-11-05-phase-6b-status-order.md](completed/2026-11-05-phase-6b-status-order.md) — one status word per item (J = a), the workflow definition the CLI ships, verdicts complete/reject, old items translated on read | done 2026-11-05 |
| 6c | [2026-11-05-phase-6c-team-commands.md](completed/2026-11-05-phase-6c-team-commands.md) — the `backlog team pop/update/query` hierarchy (only place that knows teams), `pop`/`work` folded in, config `user`/`team`, team entries' location (X), the item template (K) | done 2026-11-05 |
| 7 | [2026-11-04-phase-7-command-aliases.md](completed/2026-11-04-phase-7-command-aliases.md) — every 1.x command name works (direct aliases) | after 6 |
| 7b | [2026-11-04-phase-7b-command-aliases-b.md](completed/2026-11-04-phase-7b-command-aliases-b.md) — body-section editor, `import`, `archive done`, `upgrade` | after 7 |
| 7c-1 | [2026-11-07-phase-7c-1-team-boundary.md](completed/2026-11-07-phase-7c-1-team-boundary.md) — team code in `src/team/`, user commands know no team | code done 2026-11-07 (outcome not yet written) |
| 7c-2a | [2026-11-07-phase-7c-2a-team-new-and-team-items.md](completed/2026-11-07-phase-7c-2a-team-new-and-team-items.md) — `team new`, one door for a team's items | done 2026-11-07 |
| 7c-2b | [2026-11-07-phase-7c-2b-read-commands-and-no-aliases.md](completed/2026-11-07-phase-7c-2b-read-commands-and-no-aliases.md) — list/show/history/changes/next, real commands for the kept behaviours, no aliases (two stages) | Stage A done and reviewed 2026-11-08 (967c2fe, pushed); consumers next, then Stage B |
| 8 | [2026-11-04-phase-8-documentation.md](2026-11-04-phase-8-documentation.md) — every document against the code; `.agents/docs` removed except `.agents/docs/plans/`; `setup` names no path | after 7b |
| 9 | [2026-11-04-phase-9-final-verification-and-pr.md](2026-11-04-phase-9-final-verification-and-pr.md) — proofs, push, the one PR into `team-cli-parity-1` | last; the only push |

## The owner's decisions (2026-11-04) — recorded, no longer open

> **OWNER, 2026-11-07: every decision recorded below is a SUGGESTION to consider, not a limit.** The objective of this branch is a small, consistent, human-readable CLI (see the owner rule of 2026-11-07 and [2026-11-07-command-surface-proposal.md](../analysis/2026-11-07-command-surface-proposal.md)). Where a recorded decision conflicts with that objective, the objective wins and the decision is revised.


- **20261104-A — commands:** every 1.x command name stays and works; duplicate functionality becomes an alias of the
  one command set; help, README, COMMANDS.md and the skill are updated for all of it (Phases 7, 7b). Replaces the
  earlier option b.
- **20261104-D (restated) — data integrity, both storage locations:** pull from the origin before every backlog
  action (reads included), push after every change, retry on a rejected push, reject a write made on a stale view and
  show the item's diff; a claim of an item another agent holds is refused (Phase 5). The earlier statement "the
  backlog is always a git repository and every change is committed and pushed" stands.
- **20261104-E — the live machine runs the latest commit of the active branch at all times:** done — the machine's `backlog` launcher
  now runs the export of the branch HEAD, refreshed by every `commit.sh`; the private backlog repository's 17 tracked
  `backlog.db` files were untracked (its commit "Remove the derived databases"). There is no release step: the work is
  live from the development branch; other work on this CLI is paused until this review is complete.
- **20261104-F — no cache, no rebuild:** the SQLite database goes entirely; an item that cannot be read is named with
  its field, with two ways out: set the field, or `--restore` the previous version (Phase 6). No path is ever shown.
  Refined 2026-11-05 (20261105-S): the order needs an index — a committed per-repository text index, not a database.
- **D3 — `.agents/docs` is removed** from the public repository (Phase 8). `decisions/D3.txt` = `yes`. Amended by the
  owner on 2026-11-08: `.agents/docs/plans/` stays (see the last section).
- **D4 — `setup` names no folder path** in its output; its help says where the configuration and the items live in
  general terms (Phase 8 verifies; the change itself landed in commit `3d0e2d3`). `decisions/D4.txt` = `hide`.
- **20261105 — the default storage location is intentional (owner):** when nothing is configured, the CLI creates the
  repository's `.backlog` folder with its configuration and uses it; the configuration lives in `.backlog/config.json`
  (environment variables override it; the root file `.smooth-backlog.json` of earlier builds is still read). The lead
  had removed that default in `3d0e2d3` without an owner decision; restored the same day. Standing rule from the owner:
  the simplification never removes behaviour on the agent's or the lead's judgement — every candidate removal is
  reported with its evidence and the owner decides. Phase 7 restores `query --pop`, `next --agent`, `--headless` and
  `BACKLOG_HEADLESS` (removed in Phase 1 as duplicates/dead) as aliases, and keeps `init clean`/`init backup` as
  commands.

## Open decisions put to the owner on 2026-11-05 (the remaining phases depend on them)

> **OWNER, 2026-11-07: every decision recorded below is a SUGGESTION to consider, not a limit.** The objective of this branch is a small, consistent, human-readable CLI (see the owner rule of 2026-11-07 and [2026-11-07-command-surface-proposal.md](../analysis/2026-11-07-command-surface-proposal.md)). Where a recorded decision conflicts with that objective, the objective wins and the decision is revised.


Recorded answers go to `<logs>/decisions/20261105.txt`, one line per decision (`A a`,
`B b`, …). A phase reads that file before the task that depends on a decision; a missing answer stops the task and
the agent reports which decision is missing. The lead's recommendation is marked.

| Id | Phase | Question (short form; the chat carries the full description) | Options |
|---|---|---|---|
| 20261105-A | 3 (done) | the `rescan:` output lines of `new` and `archive`, removed in Phase 3 | DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): a - keep removed |
| 20261105-B | 5 | inside the repository, the backlog change is pushed with the current branch — including the user's own unpushed commits | DECIDED a: push the branch as it is; the help says so clearly; after a change the CLI prints `<id - slug> committed; all pending branch changes pushed`; a configuration setting `push-backlog-updates` (default true) lets the user turn the push off |
| 20261105-C | 5 | a dirty working tree when a command pulls the repository | DECIDED a: autostash and restore |
| 20261105-D | 5 | the current branch has no counterpart on the origin yet | DECIDED a: skip the pull, the first push creates the branch |
| 20261105-E | 5 | a read whose pull fails (origin unreachable) | DECIDED b: answer from the local copy with the warning "origin offline: local backlog updates may be behind and need manual remediation later" |
| 20261105-S | 6 | the index of the backlog items | DECIDED by the owner 2026-11-05: b — a per-repository text index, committed in the backlog repository (in `.backlog` when the backlog is inside the repository), authoritative for the order per branch, used by next/pop/new/priority |
| 20261105-T | 6 | the `priority` field of the item files | DECIDED a: only the index holds the order |
| 20261105-U | 6 | what one index entry holds | DECIDED a: number, slug, name, status |
| 20261105-F | 6 | how the user restores an unreadable item's previous version | DECIDED a: `backlog update <item> --restore` |
| 20261105-G | 6 | one unreadable item in the backlog | DECIDED a: every command of that backlog refuses until the item is fixed |
| 20261105-H | 7 | `init clean` | DECIDED a, with a confirmation prompt: "this will destroy all configuration and current backlog items for <repository> / <branch>" |
| 20261105-I | 7 | `init backup` | DECIDED remove: not a command any more |
| 20261105-J | 6b | one status order | DECIDED a: new → refining → refined → refinement review → ready → in progress → ready for review → reviewing → ready for external review → external review → review complete → closed → archived, side word awaiting decision; enforced only by `backlog team` from the team's configuration entry; the definition is `backlog-workflow.json` in the team-lead skill folder (topology 7094f801), copied into the CLI as `templates/workflows/team.json` |
| 20261105-V | 6b | status outside a team | DECIDED a: free text; closed/done/archived mean finished |
| 20261105-W | 6b | review verdicts | DECIDED: `complete` or `reject` only; out-of-scope findings become new items by the skills' rule, not a CLI feature |
| 20261105-X | 6b/6c | team and flow definitions | DECIDED: `teams.json` at the backlog root stays; definitions originate in the team-lead skill and enter through `backlog team define --file <json>` and `backlog team workflow --file <json>` (validated; committed and pushed); the CLI ships the default flow `team` |
| 20261105-Y | 7 | the first release's `query --pop` / `next --agent` now that `backlog pop` does not exist | DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): b - refused with a pointer to backlog team pop |
| 20261105-Z | 7 | the field "owner": the holder or whom the item belongs to | DECIDED by the owner 2026-11-06: a — owner is the agent working on the item (claimed_by renamed owner, old key read forever); the team field names the team; the lead acts for the team; outside a team the owner is the configured user; no separate agent/actor field |
| 20261105-K | 6c | the item's fields and a visible template | DECIDED a (read old keys, write new keys only) — was: a) rename stored keys to the owner's vocabulary (title, summary multi-sentence, description = body, owner, last updated), old keys read forever, `backlog fields` + `new --help` print the template (rec.) · b) keep keys, present the vocabulary · c) a plus a strike list |
| 20261105-L | 7 | `--state` and `set … state` values (first release: new, open, done) | DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): a - new to new, open to in progress, done to closed |
| 20261105-M | 7 | `set <item> description <text>` | DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): a - sets objective |
| 20261105-N | 7/7b | the first release's list fields (`ac tasks outcomes evidence references item-state-description work_item_id`) | DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): a - body sections |
| 20261105-O | 7b | `update` collides with the first release's self-update (`update check/auto/off/disable/<version>`) | DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): a - backlog upgrade is the self-update; update with no item or one of those words runs it |
| 20261105-P | 7 | `--headless` and `BACKLOG_HEADLESS=1` (documented in the first release as "record the next step without asking"; no command asks anything now) | DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): a - accepted and ignored |
| 20261105-Q | 7b | names of the body-section options of `update` | a) `--section <heading> --set-lines|--add-line [--top]|--remove-line <n>| DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): a - the names as recommended |
| 20261105-R | 9 | the pull request | DECIDED 2026-11-06 (lead, under the owner's instruction of 2026-11-06 to take the recommendations and finish): a - the lead shows the PR title and body in chat and opens it on the owner's go (the binding rule) |

## How the owner's decisions reach the agents

The owner answers in chat or in the owner-alert tool. Whoever receives the answer writes it, one word on the first line, into
`<logs>/decisions/D2.txt` (`yes`|`no`: the database becomes a per-clone cache and the
item history moves into the item files) and `<logs>/decisions/D3.txt` (`yes`|`no`:
`.agents/docs` is removed from the public repository; amended 2026-11-08: except `.agents/docs/plans/`). A phase whose gate file is missing stops and asks.

Decision A (the 1.x removal list) is already applied in commit `2fd37fb`; if the owner names a command to keep, that
is a small extra task for the Phase 1 session: restore the command through the router (`src/shared/router.js
TABLE`) with a test in `.agents/test/router.test.js`, never by restoring a deleted 1.x module.

## Phase 1 outcome and lessons (2026-11-04)

Phase 1 ran (a sub-agent): four commits, suite 883/883, BDD 100/100, no code defect found in review. The plan
document had nine kinds of defect (wrong fixture name, incomplete Files list, drifted line numbers, a predicted test
count, a dictated refusal text that was wrong, missed modifier flags and help sentences, skipped `trace_path`, a
grouped REVIEW-LOG row, a commit inside a compound command that hit the shell time limit). Every phase document now
carries a "LESSONS FROM THE PHASE 1 RUN" block in its Handoff context; the executing agent applies it in every task.

## Phase 2 outcome and lessons (2026-11-04)

Phase 2 ran (a sub-agent): four commits, suite 888/888, BDD 100/100; review verdict ship. Accepted deviations:
`moved_in` stays as an item event (the plan's deletion block had carried it); `events` is a non-content key for the
stale-read guard (`seen.js RANK_ONLY`); `addEvent` writes the front matter only. New lessons (10)-(16) are in the
Handoff context of Phases 3-6. Follow-ups placed: Phase 3 Task 1b removes the `rescan:` output lines (they describe
the database); Phase 4 writes the `renumbered` history line from `renumberFiles` when the scan loop goes.

## Phase 3 outcome and lessons (2026-11-04)

Phase 3 ran (a sub-agent): four commits, suite 860/860, BDD 100/100; whole diff −866/+229, src −105/+48. Task 4
(untracking the 17 `backlog.db` files of the private backlog repository) waits for the release install, as its
precondition says. Review decisions: (A) an unreadable `archive/` item fails the command — kept, "fail explicitly";
(B) the same-rank file conflict still triggers `reconcile` through `renumbered.mirror` — Phase 4 must keep that path
(its text was corrected; the flag becomes `reranked`). Lessons (17)-(22) are in Phases 4-6.

## Owner rules of 2026-11-05 (binding for Phases 6b-9)

- Team awareness exists ONLY under `backlog team <pop|update|query> --team <t> --agent <a>`; the user-command `backlog update`
  accepts no team flag; `backlog pop` and `backlog work` do not exist as commands; team behaviours are defined
  exclusively in the configuration (the team's entry + the workflow definition); items without a team take owner and team
  from `.backlog/config.json`, written by `setup` from the git user (else the logged-in user).
- The team-lead skill folder (private topology repository) holds the authoritative workflow definition
  `references/backlog-workflow.json`; the CLI ships the same definition with generic names.
- A reviewer's verdict is complete or reject; proposing out-of-scope work is a skills pattern (new item + decision
  request), not a CLI command.
- One decision per chat message while a complex decision is open; every decision also goes to the owner-alert tool.

## Owner instruction of 2026-11-06 (binding for the rest of the review)

Everything put to the owner is a decision in the decision format; nothing else is presented. Procedural matters the lead
was asked to analyse are decided by the lead (the recommendation stands): decisions A, L, M, N, O, P, Q, R and Y above
were closed this way. The stop hook never claims work: `backlog team pop --dry-run` (CLI) answers only, and the
team-member hook uses it; `team pop` without it claims when the agent itself runs it on its turn (the workflow the skills
intend). Finish the implementation (Phases 7, 7b, 8, 9) without further questions unless a rule blocks.

## Owner rule of 2026-11-07 (binding; supersedes any recorded decision that conflicts with it)

One behaviour per command, no split between releases, NO backwards compatibility (upgrade/migrate or fail). The backlog source comes ONLY from the
repository's backlog config (.backlog/config.json). A command acts on the CURRENT BRANCH by default; wider behaviour is a subcommand (preferred;
e.g. `backlog init clean all-branches`) or an option the user asks for, or an interactive question. Every behaviour is explained in `backlog --help`,
the README and the supporting docs, for humans and agents. Decision 20261106-AG is answered by it (applied in 18eb5b9). The deterministic inventory
of the branch against the rule is [2026-11-06-consistency-inventory.md](../analysis/2026-11-06-consistency-inventory.md) : update/archive/query --phase act on items of any branch;
environment variables override the configuration; three of five location sources are not the repository configuration; 27 alias rows and an old
config file and old stored keys are read. Decision 20261106-AJ (do the aliases stay) is put first; AH (nightly review_only) and AI (weekly update
check) are drafted and wait, because AJ changes what `update`/`upgrade` are.


> **Owner rule of 2026-11-07 (flags vs subcommands, binding):** unless the data MUST be supplied as part of the command, an option is a subcommand, not a flag. Dependencies of a command (what it needs, what it reads) are named in the help of its PARENT command and printed again when the command runs without input. Decision 20261107-AL = a (the revised command design, [2026-11-07-command-surface-proposal.md](../analysis/2026-11-07-command-surface-proposal.md) REVISION 2) is approved. Refactor phases: 7c-1 Rule T (team boundary), 7c-2 command tree and aliases, 7c-3 per-level help and flags to subcommands, 7c-4 branch scoping and config-only source, 7c-5 topology skills and redeploy, then Phases 8 and 9.


> **Owner answer of 2026-11-07 (decision 20261107-AM = a, binding):** item dependencies (`depends_on`, also across repositories) stay a feature of every item and every command. Principle: most commands are usable by teams and non-teams alike; the ONLY thing that controls what a team can or cannot do is the team rules and team definition in `teams.json`. This narrows Rule T: what moves under `backlog team` is behaviour that exists only for teams (claim, review, stages, pop, define, workflow); generic features (dependencies, work-in-progress limits of overall/repository/branch level, status vocabulary) stay shared. Open: how a command learns that an item/session belongs to a team (decision 20261107-AN).

## Phase 7b outcome and lessons (2026-11-06)

Phase 7b ran in one agent session, one commit per task: `b4123dc` (`update --section` with `--set-lines`, `--add-line`/`--top`,
`--remove-line`, `--move-line` and the list aliases), `778e090` (`import`, `archive done` as command sequences, `sequence.js`),
`a271cdb` (`backlog upgrade` restored from `fe40b5a:src/updates.js`, `update`/`update check|auto|off|disable|<version>` route to it),
`4604228` (CHANGELOG, REVIEW.md). Lead review (ponytail-review through the Skill tool, REVIEW-LOG 163-164): own suite 1028/1028, then the
lead fixed two defects (an unknown source branch of `import` answered like an empty one; `--json` with `import`/`archive done`
fell through to a wrong error). Not changed, recorded: both sequences have no rollback (a failing step stops them and the output names
what was done); bare `backlog update` is now the self-update, which installs (an unquoted empty variable in a script
`backlog update $ITEM` would install the latest version); after an upgrade the generated skill copies are not refreshed
(`refreshIntegrations` no longer exists: run `backlog setup`); the sub-agent wrote tests after code in Tasks 2-3. Open decisions
queued behind 20261106-AG: AH (nightly review_only), AI (the weekly update check is restored but nothing runs it).
Lessons: 41. The plan's conditional ("only if it was in bin/backlog.js") hid that the first release had the call in main.js: a
conditional restore must name the behaviour to preserve, not the file. 42. A sub-agent's report of "nothing removed" is checked by
running the commands against an unknown name, an empty source and a flag the alias does not know (lesson 36 again).

## Phase 7 outcome and lessons (2026-11-06)

Phase 7 ran in one agent session, one commit per task: `49c3124` (aliases, `query --only/--branches`, scenarios), `0e12b97`
(help, COMMANDS.md, README, skill), `90e6eee` (engine texts name `backlog team update`), `f019509` (roster file gone,
`review_only` in the team entry), `2f5b73b` (stored keys title, last_updated, last_updated_by, owner, owned_since; old keys
read forever). Suite 991/991, BDD 77 per location, check and guard clean at `2f5b73b`.
Lead review (ponytail-review through the Skill tool, REVIEW-LOG 154-155): three small defects fixed by the lead -- a word
that names an Object property (`constructor`) crashed `set`/`new --state` with a TypeError; `priority <item> --json` read
`--json` as the position; `--branches` counted in a ordinary object. FOUND IN THE RUNNING SYSTEM (not in the CLI; NOT yet fixed):
(a) the topology repository's nightly team script `end_finish` reads `front_matter.claimed_by`, which the JSON of `query --phase` no
longer carries (it shows `owner`): the release is skipped and the end item is archived with its claim held (rows of
`query --status` keep `claimed_by`, so the dispatcher is fine; FIXED in the topology repository, proof
bites on the old code, NOT deployed -- goes live with the next redeploy); (b) the team status page script reads a
`backlog.db` and the header key `claimed_by` of the item files; no `backlog.db` exists in the live backlog (only in stray and
sub-clone copies), so the dashboard looks stale already -- UNVERIFIED, not touched; (c) the nightly refinement
marks its members `review_only` in a roster file (`$TEAM_ROSTER`, the nightly team script) -- the CLI reads no
roster any more, so nobody is kept from a claim during the night: needs a decision (the nightly must register its own
team entry with `review_only`, or another way). Candidate for the owner: `init clean` asks for `<repository> / <branch>` but
removes the items of every branch of the repository and the numbering starts again at 1.
Lessons: 38. A key rename must be checked in the JSON that consumers read (front_matter) as well as in the files: the rows
kept the old key and the front matter did not, so the dispatcher passed and the nightly broke. 39. Removing a configuration
channel (the roster) needs a grep of the running system for the variable and flag (`TEAM_ROSTER`, `--roster`) in the same
commit (lesson 34 again). 40. A lookup table filled from user words needs `Object.hasOwn` or a Map.

## Phase 6c outcome and lessons (2026-11-05)

Phase 6c ran in one agent session: commits `034ffaa` (team steps under `backlog team update`, shim with a `moved:`
notice on the user-command spelling), `db4e8cb` (setup `user`/`team`, `team define`, `team workflow`, `owner` on user
items), `215e6cb` (team views under `team query`), `06dafad` (`backlog fields`, `new --title/--description`, `--summary`
repeatable), `8b87612` (docs), `fb1380c` (`team pop`; `pop`/`work` removed); suite 949/949, BDD 66 per location, check
and guard clean. Lead review found one defect: `--team` did not scope the engine (`team pop --team X --agent A` without
`TEAM_NAME` offered and claimed items of no team or of another team as team X; the lead's own live check claimed and
released an item of the running team's backlog). Fix `db5c142`: `teamName()` is `TEAM_NAME` else the command's
`--team`; 59 tests the agent had re-pointed to `team pop` encoded the gap and were repaired by a second agent (items put
into the team they ask as; a member with nothing gets `chunk`, the lead stays `idle`; team commands name their agent
without a session agent). Suite 950/950. NOT DONE from the plan, carried to Phase 7: the stored-key rename of K = a
(blocked on decision Z: "owner" vs "holder"); removal of the roster file (`--roster`, `TEAM_ROSTER`; the live skills
still pass it); ~30 engine instruction texts still name `backlog update <item> --<step> --by <agent>` (they work through
the shim, so the shim cannot go before them). Deviations recorded, not acted on: `team query` takes no agent (the plan
said required); the `sharedBacklog` fixture does not commit `teams.json`; `define` refuses to redefine a team with open
items (per plan), so the running team's hand-written entry cannot be changed by the CLI until its items close.
LIVE: `backlog pop`, `backlog work` and `query --pop` are gone from the live CLI while the team-lead and team-member
skills still call them; no team session was running; a topology item (the skills) is the next action.
Lesson (36): a sub-agent that re-points many tests to a new command can make the tests agree with a gap in the code; the
lead review must run the new command against an item outside its intended scope. Lesson (37): a verification call that
writes (team pop claims) must never be run against the live backlog; use the read-only views.

## Phase 6b outcome and lessons (2026-11-05)

Phase 6b ran in two agent sessions (the first was cut off by a container restart after Task 1, `4a73790`; the second
continued from the half-done tree): commits `255e657` (Tasks 2-4) and `bfeed46` (tests, scenarios, docs); suite
931/931, BDD 64 scenarios per location, check and guard clean. Lead review `910ab02`: the gate for a repeated review
request read a faked status; the shipped definition (and both private copies) now list the four words it starts from.
LIVE MIGRATION the plan missed: the shared backlog had no `teams.json`, so from `255e657` every team step of the running
team was refused ("not configured"); the lead registered the team by hand at the backlog root (lead,
members, external reviewers, `review: []` = today's effective rule, no review enforced). `backlog team define` (6c) and
the team-lead skill (topology item) replace that file. Candidates for the owner (NOT acted on): a release of a team item
that was never refined returns it to `new` (the definition says `ready`); an entry without members lets anyone pass the
peer stage (6c's `validateTeam` closes it); verdict synonyms are normalised in the parser so the usage text names two
words; `stage`/`review-hitl` wording survives in a few messages; `new` writes `review_state: none` for items without a team
(goes with decision L). Lesson (34): a phase that makes a configuration mandatory must register the running system's
configuration in the same commit, or the live machine breaks between commits. Lesson (35): a sub-agent cut off mid-task
leaves a coherent tree only if it commits per task — the relaunch prompt must say what is committed and what is not.

## Phase 6 outcome and lessons (2026-11-05)

Phase 6 ran (a sub-agent): six commits (`81deec5`..`3a1423d`), suite 874/874 (23 tests of the removed incidental
ranking guard and the database tests deleted; `features/index.feature` and `features/repair.feature` added, 62 scenarios
per location), check clean, guard clean. `db.js` gone; `index.json` per repository folder is the order, per branch;
the live shared backlog got its index at the first read (`SmoothSDLC/smooth-backlog-cli: index`). Lead review
(commit after `3a1423d`): four unused index exports removed, `Pnull` for an archived row in `query` fixed (`P  -`),
array-shaped index refused with a test. Candidates for the owner (NOT acted on): a rank change still stamps the moved
item (`updated`, `planning_event`) — the plan's literal wording said no item file; `kept`/`mergeOrders` quadratic per
branch (marked shortcut); views still read every item file (the order comes from the index; the large-backlog goal
needs a later phase). Lessons (29)-(33) are in Phases 6b and 6c.

## Phase 5 outcome and lessons (2026-11-05)

Phase 5 ran (a sub-agent): two commits (`5b380c2`, `50d4785`), suite 884/884, BDD 55 scenarios per location,
check clean, guard clean. Lead review (`a6306f8`) reverted one unplanned behaviour change (a repository without an
origin had been made to refuse every write; the first release committed and reported exit 3 — restored and pinned) and
fixed one risk (renumbering could amend a user's own unpushed commit). Plan defects: `store.lockPath` named for the sync
lock is the run lock (self-deadlock) — the agent used a separate file; `git ls-remote` exit codes. Lessons (23)-(28)
are in Phases 6-9.

## Phase 4 outcome and lessons (2026-11-04)

Phase 4 ran (a sub-agent): four commits (`6b6b102`, `0efb892`, `f857fef`, `8fbcc15`), suite 863/863, BDD 100/100;
src/bin against the tip now −2025/+885. Review verdict ship. Facts learned: the publication guard refuses (exit 5) any
concurrent change of every item a command writes, rank-only changes included — the same-rank repair path is kept and
pinned by two settled-commit tests but no CLI sequence reaches it; conflicts on a still-tracked `backlog.db` are no
longer repaired (the private repository untracked them the same day). Lead fix after the phase: `3d0e2d3` (no silent
storage default; `setup` records and commits the location; the per-user record is found without the setting).

## Fixed facts every phase relies on

- Worktree `<worktree>`, branch `simplify/pr3-review`, base `origin/team-cli-parity-1` = `fe40b5a`.
- `commit.sh` commits AND deploys HEAD live (a deploy script → the installed package folder,
  run by the machine's `backlog` launcher); the live `backlog` is therefore always the branch's last commit.
- Node `node` (v24); helpers in `<logs>/` (`run-tests.sh`, `commit.sh`).
- Commit author `<author>`, no trailers.
- The public-repository rule (no private names anywhere in the repository, commits or PR) and the deny-list guard
  with the private list `<private-denylist>`.
- The review prompt's mandated skills: superpowers `brainstorming`, `writing-plans` (both used for this plan set),
  `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `requesting-code-review`,
  `receiving-code-review`; ponytail `ponytail-audit` (done), `ponytail-review`, `ponytail`; codebase-memory-mcp
  `index_repository`, `search_graph`, `trace_path`. Every use is a row in `REVIEW-LOG.md` on the branch.

## Owner answers 2026-11-07 (continued)
- AO = a: user-command `update` refuses every change to an item that belongs to a team; `backlog team update` is the only door (phase-7c-2a).
- Owner instruction: do not ask what the owner already ruled (user commands cannot be used with teams, so `team new` is required); do not ask about doc/help coherence with the implementation (decide, record the reason). Commit and push before the end of every turn (the pre-push content check by hand still runs).
- AI answered (owner 2026-11-07): the update notice and `upgrade check/auto/off/disable` stay expected behaviour, documented in every help; the config entry gates the external call, which runs asynchronously, times out quickly and only warns. Cadence verified: weekly notice by default, 24 h only with `auto`, 1 h retry after a failure, user-scoped settings (see [2026-11-07-alias-analysis.md](../analysis/2026-11-07-alias-analysis.md)). Work item for 7c-2b.
- AH answered (owner 2026-11-07): the nightly refinement session is outside the CLI; not a CLI blocker; consumer issues are backlogged in the repository where they occur, not here.
- AJ answered in principle (owner 2026-11-07): team commands and user commands are different commands; team behaviour stays under `backlog team`, code is shared only where sensible; each command and subcommand is documented accurately. Analysis: [2026-11-07-alias-analysis.md](../analysis/2026-11-07-alias-analysis.md) (0 aliases; 9 kept as commands, `upgrade`, section editor). 20261107-AP answered below.
- AP answered (owner 2026-11-07): `backlog new` and `backlog team new` are valid commands, and `--ask` is the interactive way: on a terminal the command prompts for the fields not supplied (team: for the team item's fields too). Work item for 7c-2b. Lead decisions, owner may overrule: without a terminal `--ask` is refused (exit 2, as in the first release); `--ask` is not restored on `update` (the owner named only `new` and `team new`); `--ask` stays an option although it is not data, by this owner answer; any other command still rejects `--ask` except `setup`.
- Lead decisions taken, owner may overrule: `setup` acts on the current branch only (its effects are committed on that branch; no `setup all-branches`, nothing to apply to other branches); the first-release `query` is replaced by `list`, `show <item>`, `history [item]`, `changes`, `next`; plan for it comes in phase 7c-2b.

## Phase 7c-2a result (2026-11-07)
Commits 0e2c5f2 (team new), 91f48d4 (one door), 98852ca (helps and docs), 81ad2c8 (itemFields) on simplify/pr3-review, pushed. Lead rerun: full suite 1055/1055, check 0, guard 3; ponytail-review done by the lead (no must-fix).
Carried into 7c-2b: (1) `team update --status` on a team item prints the user-update refusal text ("use backlog team update ..."), which is wrong text when the user is already in team update (src/shared/update.js OF_A_TEAM, line ~222); give the team path its own line. (2) Lead decision, owner may overrule: user-command `move` and `archive` stay available for team items — they are housekeeping (location, finished-item storage) and apply no team rule; the 7c-2b audit lists every other user command that writes a team item.

## Phase 7c-2b Stage A result (2026-11-08)
Commits 0421a58 (`list`), 507ebc1 (`show`, `history`, `changes`, `next all-branches`, bare `backlog` prints the help), d837889 (`done`, `clean`, `import`, `archive done` as routed commands with their own help), 967c2fe (review log), on simplify/pr3-review, pushed after the pre-push content check by hand. Strictly additive: `query`, every option of `next`, the alias rows and `init clean` unchanged. Lead rerun: full suite 1113/1113, check, guard 3; ponytail-review by the lead (no must-fix); `list --json` equals `query --status --json` except the time of the read, on the 115-item live backlog; read-only live checks pass. Inventory (outside the repository, `<logs>/inventory-7c-2b.txt`): 54 forms reconcile, MOVED 25, KEPT 12, REMOVED 17.
Behaviour changes the plan did not predict: bare `backlog` prints the help (`backlog --json` alone still runs `next`); `list all-branches` text rows end with `(branch X)`; `done` takes no `--json` (update refuses it); `history` is text only; `done --help`, `list --help`, `list open --help` print the command's own help; `done` with no item is "done needs an item" (exit 2).
Carried into the consumer step and Stage B: (1) the nightly reads `query --status --json --branch <b>`; `list` has no `--branch`: first read how the nightly's helper chooses the branch (checkout or flag) before choosing `list --json` from a checkout of that branch or `list all-branches --json` filtered by each row's branch. (2) `sequence.js` (import) still reads another branch through `query --branch`; when `query` goes it reads through the shared reader directly (no public spelling needed). (3) `import` moves an item that has a team and `done` on a team item is refused only because `update` refuses it; the explicit refusals are 7c-2c. (4) Alias docs still describe `list open` as running `query`; the detached-HEAD message still names `--branch`/`--all`; `import.js` repeats the alias parser and `own()` in `router.js` is a hand list: all deleted in Stage B. (5) Lead probe mistake recorded: a `head` pipe in front of a command kills it mid-write and leaves a stale-read refusal (exit 5) on the next call; scratch probes must not truncate with a pipe.

## Consumer migration to list and show, and the deploy block (2026-11-08)
Done in the team's topology repository (pushed): the dispatcher, the member wake hook, the nightly refinement, the team keeper and status, the backlog-alignment skill (both copies), the two team skills and the proof prompt call `list`/`show` instead of `query`; the nightly's list call drops `--branch` (checked in a real nightly scratch checkout: same 78 rows as `query --status --json --branch`). Tests first (red: 4 failures plus the dispatcher timeout on the old calls), then green: 68/68, and the migrated functions run against the real CLI read-only. The pin moves to CLI 967c2fe5df495ac830bec5fdd72ff2c5b7b7add5.
NOT DEPLOYED. Facts: (1) the live system ran a topology commit that existed only on a backup branch (the topology branch was rebased on 11-07; 87 files differ from the rebased twin), and the topology branch tip carried 233 commits that were never deployed; deploying the tip would ship all of it. So the deploy commit is the deployed commit + the nightly `claimed_by` fix (the handoff's finding 7a) + the consumer migration (tagged; 17 files differ from what is live, 68/68 in its own worktree). (2) The deploy REFUSED before installing anything: the live settings file of the local agent had been edited on 2026-11-07 and equalled neither the deployed nor the new source; the deploy tool's rule is that a deploy never loses live configuration and the edit must be committed first. Decision 20261108-AQ is open. (3) Stage B (removing `query`, the aliases) waits for a deploy: the deployed hook, dispatcher and nightly still call `query`, and every CLI commit is live at once.
Other findings: team-keeper and team-status ask `query --decisions --all` (a team view, refused since 7c-1): the open-decisions metric and the status line "owner decisions open" fail now (added to a topology item; not fixed, it needs a team and agent). The review script's `update --note` still works: 0 of 27 open items of the nightly project carry a team. The nightly's scratch checkouts hold only `.git`; the CLI finds the backlog through a per-user record, so the rule that the source comes only from `.backlog/config.json` (7c-4) breaks the nightly unless 7c-5 gives each scratch checkout a configuration. Not migrated: the docs of another private repository and the other topology worktrees still say `backlog query`.
Lessons: 43. The base of a deploy is the deployed commit, not the branch tip: check `git diff <deployed> <tip>` over deployable paths first. 44. A deploy can refuse for live configuration that is no part of the change; read the refusal before anything else is tried. 45. Search the whole repository for a spelling before migrating: the first narrow grep missed four consumers (team-keeper, team-status, the alignment skill, a live-backlog test) and a prompt string.


## Consumer deploy result (2026-11-08)

- Decision 20261108-AQ answered **a**: the live settings file of the local agent is committed in the team's topology repository. 11 values differ from the old file (the model endpoint, the model name, a tool path, the temperature and the names on the 4 cards). No credential in the file.
- Deploy commit = the live base + the nightly fix + the consumer migration (consumers use `list`/`show`) + the settings commit, recorded by a tag. The team-lead skill conflict resolved by keeping the deployed text and changing only the spelling.
- Tests on the deploy tree: 76/76 (64 consumer tests plus skill-rules, team-keeper and team-guard).
- The deploy script: destinations OK, CLI 967c2fe5 installed, smoke PASS, KNOWN-GOOD.
- Live checks from the CLI repo: `team query --plan` exit 0, `team pop --dry-run` exit 3 (idle).
- The deployed commit is not on the history of the topology branch (it is a cherry-pick set on the live base); the tag is the record.
- Stage B of 7c-2b (remove `query` and the aliases) is now unblocked: no deployed consumer calls `query`.

## Phase 7c-2b Stage B result (2026-11-08)

- Commits d5ef024 (aliases removed), fb5fa08 (`query` removed from the user-command tree), bc6cc44 (own `team update --status` refusal; every command documented test). Lead re-ran the full suite on bc6cc44: 1106/1106. The agent's gate: BDD 101 per location, `npm run check` and the private-details guard green.
- Verified live: `backlog query` and `backlog query --status` exit 2 "not a backlog command"; bare `backlog update` prints the help of `update`, exit 2. `team query` keeps the reader options (`--phase`, `--status`, `--events`, `--branch`, `--all`).
- New tests: `removed-forms.test.js` (27 removed forms: generic answer, exit code, nothing written) and `commands-documented.test.js` (router table, team subcommands and list words must each be in COMMANDS.md).
- Carried to 7c-3: `backlog --json` and `backlog --bogus` still fall through to `next` (undocumented; global flags such as `--use-backlog-repo` share the parser). 7c-3 decides and documents it. The words of `archive done` and `next all-branches` are listed by hand in the docs test and should come from code.
- Lesson 46: a gate run under bare `nohup` is killed when the machine tool call ends; run it under `setsid nohup`.

## Decision 20261108-AR (owner 2026-11-08): restore the single-branch read
The first-release `query --branch`, `query --by-branch` and `next --branch` were dropped by the lead's reading of the flag rule (inventory Q10, Q11, N3); the owner had not ruled to remove them. AR = a: add `list branch <name>` and `next branch <name>` (read-only). Work item 7c-2d, after 7c-2c: shared reader mapping in `src/shared/read.js`, help, COMMANDS.md, skill reference, README/CHANGELOG, engage and bite tests, the docs test. Lesson 47: a removal that follows only from the lead's reading of a rule is an owner question; list lost capabilities in the proposal, not only the new vocabulary.

## Impact analysis of the whole command surface (2026-11-08)
Triggered by the owner after the `query` loss (AR). Independent read-only run over v1.0.2 (A), fe40b5abda (B, PR base) and bc6cc44 (C): 214 forms, PRESERVED 72, MOVED 95, NARROWED 17, REMOVED 30; 21 losses with no owner ruling (LEAD 14, NONE 7), 26 owner-ruled losses. Files in `<logs>/impact/` (impact.tsv, inventories, probes). Corrections: the earlier inventory row A12 (`priority <item>` = show) was wrong, in v1.0.2 it moved the item to P0; the report's exit-code claim is not confirmed (`show 999999` exits 1, `list bogusword` exits 2). Decision file 20261108-AS. A lead probe wrote `status: bogus` to the owner's action item in the live backlog (user-command `update` accepts any status word); repaired in the shared backlog repository. Lesson 48: never probe a write against a live item; use a throwaway clone.

## Phase 7c-2c result (2026-11-08)
Commits e58490c (team-item refusals), b6a2852 (`--ask` on `new` and `team new`), 174c76d (update notice wired). Lead re-ran the full suite on 174c76d: 1135/1135; agent gate: BDD 101 per location, check and guard green. Audit table: `<logs>/audit-7c-2c.md`.
- Refused for an item with a team: `done`, `update --replan` naming it, `archive` of an unfinished one (also `--force`), `import --higher` with a team item in the source, `clean` with a team item in scope (no team door for deletion). Kept: `move`, `archive` of a closed team item, `archive done`, `import` without `--higher`.
- `--ask`: title, objective, summary, body (+ review documents on a team item); refused without a terminal (exit 2); other commands still reject it.
- Update notice: started beside the command when stderr is a terminal, waits at most 1500 ms, warnings only on stderr, never changes output or exit code.
- Open for the owner: decisions AT (clean/replan/archive-force on team items), AU (move on team items), AV (notice timeout and dev-checkout warning). See decision file 20261108-AT..AV.

## Owner principle 2026-11-08 (binding): the CLI hard-codes no behaviour pattern
- User commands enforce nothing about flow, status words or team behaviour. The user manages user items freely (user-command `update --status <any word>` accepting any word is correct, not a bug).
- Every enforced behaviour of a team comes exclusively from the team-defined behaviour set in the external JSON (teams.json entry + workflow definition). Anything the CLI enforces that does not originate there is an implementation failure: it moves into a documented, templated schema the file can express, and the CLI becomes a generic reader/enforcer. Tests exercise the enforcer against a supplied definition, not against literals.
- Consequences recorded by the lead: decisions 20261108-AS (eleven impact-analysis decisions), AT, AU, AV are WITHDRAWN (their options assumed hard-coded rules). The lead's 2026-11-08 "user-command update accepts any status = bug" finding is retracted. 7c-2c refusals (e58490c), the status words in `src/shared/status.js`, the user-command tree dependency/WIP code and the stage/role literals in `src/team/` are to be re-judged against the principle by the enforcement inventory (`<logs>/enforcement/`), before any further command work. 7c-2d, 7c-3 and 7c-4 are on hold.
- Lesson 49: a rule enforced in code is a rule the owner cannot change; ask first where a rule lives (file or code) before presenting any option about it.

## Team behaviour file: analysis and spec delivered (2026-11-08)
An agent, folder [2026-11-08-team-behaviour-file/](2026-11-08-team-behaviour-file/) (00-README .. 09-gap-resolution, 15 features, 4 JSON Schemas, 3 templates, inventory/tests/consumers/gaps TSVs). Lead check: 843 sites = CODE 448 + DATA-INTEGRITY 352 + SHIPPED-DATA 31 + CONFIG 12; terminal states MOVED-TO-FILE 397, STAYS 353, DELETED 39, OWNER-QUESTION 54; 47 gap rows resolved once (FILE-RULE 3, USER-FEATURE 13, ACCEPTED-LOSS 21, OWNER-QUESTION 10); traceability has no empty terminal. 106 REQs, 188 scenario ids, 184 planned tests, phases PH-0..PH-14. Findings: registered workflows are validated but never enforced (canStep uses the shipped TEAM constant); the team entry `wip` is never read; 105 user-command tree rows enforce flow; the exit-code claim of the impact report is wrong (show 999999 exits 1, list bogusword exits 2). Owner questions Q-01..Q-15 in [08-owner-questions.md](2026-11-08-team-behaviour-file/08-owner-questions.md) (AM conflicts with the principle: Q-01, Q-03). Independent reviews R1..R3 requested; results in [reviews/](2026-11-08-team-behaviour-file/reviews/).

## Plans relocated into this repository; Phase 8 keeps the plans (owner instruction, 2026-11-08)
- The plans, analyses and the handoff of this effort moved from the shared backlog repository into this repository with date-first names, the private details replaced by generic wording: finished plans in [completed/](completed/), active plans (Phase 8, Phase 9, this log, [2026-11-04-simplification-plan.md](2026-11-04-simplification-plan.md), formerly the root file `SIMPLIFICATION-PLAN.md`) in this folder, analyses in [../analysis/](../analysis/), the handoff in [../handoffs/](../handoffs/). [README.md](README.md) indexes every plan.
- Owner instruction: the Phase 8 clean-up removes `.agents/docs` EXCEPT `.agents/docs/plans/`. Plans stay in the repository; AGENTS.md (section Plans) says where plans live. [2026-11-04-phase-8-documentation.md](2026-11-04-phase-8-documentation.md) Task 3 is amended accordingly (decision D3 above is narrowed, not reversed).
