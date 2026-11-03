# Changelog

## Unreleased

- Item 098: a team item is refined before anyone claims it. A team item without a stage (a team's work item, or one
  written before the stage field existed) and a split slice without one are unrefined (stage refining); an item
  without a team and without the split marker keeps no stage and is claimable. `--claim` refuses an unrefined item for
  every agent but the team lead's own claim of its team's work item (`backlog team pop`, to split it; never a split slice, which the lead is refused too), and the refusal
  names `--refine-start`; `--refine-start` accepts an unrefined team item that nobody holds; `backlog pop`, the dispatch
  plan (`query --plan`) and `query --claimable` offer an unrefined team item for its refinement, never for a claim. The
  help, the built-in skill and the README state the rule.
- `backlog query --changed [--agent <name>] [--json]` reports, for the calling agent, which items of the
  repository folder changed since the agent's own last use. The reference point is the commit of the
  agent's last write or its last `query --changed` (stored under a reserved key of the agent's views
  record, stated in every result, even an empty one), never a global timestamp, so a change made while
  the agent is idle still appears in the agent's next report; the agent's own reads (`query --phase`,
  `pop`) do not move it. The first use prints "no earlier use: reference set now" and sets the
  reference. The items the agent holds (its name in `claimed_by`, `reviewer` or `refiner`) are listed in
  a "held" section apart from the other changed items ("others"); a file moved inside the folder (an
  archive, a renumbering) is one "D" entry for its old name — a move that git reports as a rename is
  that entry, not a vanished item. When the comparison fails (the reference commit is no longer in the
  clone, for example after a history rewrite), the command reports the failure (exit 2) and keeps the
  agent's reference, so the change is not lost. The report is printed before the reference is written,
  so a failed output consumes no change (the same changes repeat in the next report); on a first use the
  report is empty and the write happens first, so the result states exactly what was stored. A failed
  write of the reference is stated in the result and keeps the previous reference: a failed first use
  prints "no earlier use: the reference could not be set" (with `--json` the reference is null), and a
  failed write after an earlier use says so in the text and, with `--json`, adds the line
  `{"reference_write": "failed"}` after the report (the exit is 0). The help and the command documentation
  name that `--changed` advances the agent's own last-use reference, and that the command otherwise never
  changes the backlog. The result also lists the agents that use the backlog (those with a reference point
  in this clone) and their last-use time (item 027).
- The shared backlog repository is a setting, not a built-in name: its clone URL is read from the environment
  variable `BACKLOG_ORIGIN_URL` first, then the `backlog_origin_url` key of `.smooth-backlog.json`; there is no
  built-in default. A shared-mode command that needs it refuses (exit 2, naming both the variable and the key)
  when it is in neither, and touches nothing; the origin check uses the configured value, and the default folder
  names (the clone beside the repository, the per-user record of `--use-backlog-repo`, `~/git/<name>`) derive from
  the configured repository name, a neutral name without the setting. A `backlog setup` write keeps the config
  file's other keys, so a URL that lives only in the key survives a setup; the setting refusal comes before the
  missing-clone question, so a command with no clone at the default path and the setting in neither source is
  refused by naming the setting, not the neutral path; the per-user record of `--use-backlog-repo` is the file
  `<name>/home` under the config folder - a record written before the setting existed keeps working when the
  setting names the same repository, with no migration. The origin check uses the configured value: a clone whose
  origin is a different repository, or has no origin, is refused, and the error names the configured value; a
  setup clone that cannot be made (the repository cannot be cloned or reached) is refused the same way (exit 3,
  nothing changed) (item 091).
- Two review stages are enforced before any close, with or without review documents: first a Cody review (for an
  item of a team, a registered member of that team - Qwen's team config.json, found under the name Qwen stores the
  team by, else a Cody name in a session of the item's team, or the team lead in a session of the item's team; for an item without a team, a Cody name - in a fresh session, never the author session that claimed the item - the claim's session name, never the
  team name - a fresh session of the same card, or of the team, may),
  then an external review by codex or claude on the same commit. A pass pins the item's work commit (work_commit) - the
  requester's HEAD at its review request (an external-stage request after the Cody pass keeps it) - so the reviewer's
  checkout and other items' commits on a shared branch move nothing; the item's own new work (a later commit whose
  subject starts with the item number) moves the work commit, so both stages run again; a changes verdict at either stage clears both
  stages and re-runs them. `--close` is refused until both stages passed for the current work commit, and the
  refusal names the missing stage; a passing Cody review asks for the external review, and a passing external
  review asks for the close. `--status done` is a close too: refused until both stages passed, with or without
  review documents. A changes verdict is recorded at either stage even after the work commit
  moved. A pass that counts for no stage (a reviewer outside both stages, or not a member of the item's team) asks
  for the Cody review first. A teamless split slice joins the team of the member who starts its refinement (or,
  refined earlier, who claims it); a legacy slice without a stage is offered for no claim before its refinement
  review (pop and query --claimable). The team folder of the hand-off markers is the one Qwen writes (its
  sanitized team name: Blue:Team is blue-team). A split item starts in stage refining,
  with or without a team field, and takes its refinement review (codex or claude) before it may be claimed; a
  slice written before the stage field existed is named by its body's split marker and takes the same gate; a
  teamless slice is dispatched to a member for refinement and to the team lead for its refinement review. The
  owner closes without a review on a written decision: `--close --by owner --reason "<the decision>"`, recorded
  as an owner decision, even for a team item still in its refinement stages (item 088).
- A new session of the same card continues the item its earlier session claimed: a `--claim` with a name sharing
  the `<item><card>` part before the colon (082ab:02 after 082ab:01) records the new session name on the item,
  with no takeover and no lead reassignment; the one-active-item, work-in-progress and hand-off-lock rules apply
  across the card's sessions, and the self-review block still holds for every earlier session name (a continuation
  of an item without `session_authors`, claimed before the list existed, keeps the earlier holder in the list);
  pop, work and the dispatch plan (`backlog query --plan`) offer the rework and the close to the new session, which
  claims the item first (a continuation claim) before those steps; the lead's completed-team review-and-close in
  pop starts with the same claim, and `backlog team pop` records the continuation claim itself when an earlier
  session of the lead's card holds the team's work item: a refused claim is no success - the command stops (exit 1,
  the reason on standard error) and the earlier session keeps holding; the final read requires the lead's own
  session still holding the item, on every path, so a hand-back or a reassignment to another session of the same
  card between the selection and the final read is no success either - the command stops (exit 1, the item changed
  before it could be shown) and the other session keeps holding (item 082).
- The self-review rule is per session: `--claim` and `--request-review` record the claiming or asking session name
  (a requester other than the claimer, the team lead, is recorded too) in a new front-matter list `session_authors`
  (kept on release, like `review_author`); the session that claimed the item or asked for the review is refused
  with "the same session cannot review its own work; a new session may", and a new session (a new name) may start
  or pass the review; a `--reassign` keeps the former holder in the list (and adds the new holder), so the block
  survives a hand-off; every claim, reassign, release and review request seeds the list from the item's current
  holder and review requester, so an item written before the list existed keeps the block of its earlier sessions;
  a reviewer whose name is a session name records the Cody stage of the two-stage review, as the old cody-* names
  did; items without session names keep the old agent-name rule (item 082).
- Agent and team names may contain a colon in addition to letters, digits, `.`, `_` and `-` (a card's session
  names and a team name carry colons): the name works in the front matter, the event log, the commit subject
  (which now carries the agent a `--claim`, `--release` or `--by` command names, wherever the option is placed),
  the hand-off marker file name and every `--claim`/`--release`/`--by` value (item 082).
- The optional run recorder hook of `bin/backlog.js` spawns a child process only when
  `CODY_SCRIPT_RUNS_MODULE` names a module, and no child process when the variable is unset;
  the help, the built-in skill and the README confine the claim to the hook (item 086). A
  proof test preloads a module that records every child process the CLI starts and shows the
  hook is the only one (local mode starts none, shared mode only git); the PATH-fake
  no-child-process test stays.
- The help and the output of `backlog new`, `backlog pop` and `backlog update` name the
  repository of the review documents neutrally as "the review-documents repository" instead of
  a private repository name (item 086).
- `backlog update` records dependency hand-offs and the team lead's receipts: the producer's claimer records
  `--handoff <dependent>` with `--handoff-commit`, `--handoff-contract` and `--handoff-verification` (and optional
  `--handoff-outputs`, `--handoff-pickup`, `--handoff-risks`); the team lead accepts it with `--accept-handoff
  <dependent> --checks "<text>" --by <lead>` only after the producer's review passed, or rejects it with
  `--reject-handoff <dependent> --reason "<text>" --by <lead>`; the accept and reject need the lead's `--by`
  (a member acts only as itself), and a re-recorded hand-off makes an earlier receipt stale (item 077).
- `backlog query --phase --json` names the team fields each item lacks (`missing`, item 061).
- `backlog query --status --json` rows carry `claimed_by` and `review_state` (item 060), so no caller reads item files.
- `backlog team pop --team <name>`: the team lead takes its team's next work item (an item of the team with no stage),
  claimed for it in the work order, with the whole item; continue while it holds one, idle (exit 3) when none is left.
- Breaking (Cody 2.0, no backward compatibility): the built-in backlog skill names only CLI commands; its Python
  snapshot helper and skill validator are removed (the integration tests check the skill), and the help no longer
  documents the Python scripts' `--db` flag.
- Shared mode team workflow (Cody 2.0): `backlog work --agent <you>` gives the one next action; refinement stages
  (refining, refinement-review, ready, review-hitl) with the lead's split, refinement review and owner decisions;
  only the team lead hands another agent's item or review on (`--reassign`, `--reassign-review`); a member's review
  request, changes verdict and close end its session, and the hand-off marker holds a member only while that
  hand-off is valid (anything malformed stops nobody and is named on stderr).
- Work-in-progress limits per level (`wip-limits.json` in the backlog repository), the lead's recorded
  `--wip-override`, and `backlog query --wip`; a re-rank no longer stamps `updated`.
- Dependencies on items of other repositories (`owner/name#seq`): they block claims and next work, are shown in
  the status, and the work to do first in the other repository is named; cross-repository cycles are refused.
- A stale-view refusal names every item the agent read whose content changed, with one read command; a rank-only
  change never makes a view stale.
- `backlog setup` (and `.smooth-backlog.json`) points a repository at the shared backlog repository; the skill
  carries `scripts/install-backlog-cli.sh`.
- The run lock names the agent holding the backlog and since when, appears whole or not at all, and a lock a
  crash left behind is taken over.
- `update --severity`, the template skill teaches every team step, and the parity review rule is written down.
- Known limit: a reference owner/name#seq from another repository is checked when an item is moved, but not when an
  item is renumbered (update --seq) or when two clones publish a move and such a reference at the same time.

- Shared mode revalidates every publication against the merged backlog, refusing sequence/slug collisions, dangling dependencies, dependency cycles, and claims whose dependencies or active-work limit changed concurrently. Split parent reads are guarded too. Rejected publication preflights restore starting files, databases, and staging.

- Shared mode rolls back unpublished changes after a failed push, preserving starting working edits and staging. Legacy unpublished commits are refused with explicit recovery commands; cross-repository moves publish both folders together.
- Shared mode keeps write views at their published slug and path after collision recovery, including cross-repository moves and incidental reflows, so later stale writes are refused.

- Add the shared backlog repository mode: `backlog --use-backlog-repo <path>` keeps every repository's items in
  one Git backlog repository (its clone URL is a setting since item 091), with `new`, `update`, `query`, `next`,
  `pop`, `move` and `archive` matching the Python backlog skill, including the team flags (claim, review, waiting,
  hand-back) and the team views; `--use-local-repo` switches back. See COMMANDS.md.
- Read and write item front matter compatibly with the Python skill's PyYAML files, keep the SQLite mirror in step,
  and commit and push each change before exiting, with collision renumbering and a run lock per repository.
- Refuse symlinked or escaping paths inside the backlog home and redact credentials in every diagnostic.
- Fix intermittent permission errors when concurrent commands acquire locks on Windows.
- Preserve existing backlog data and lock coordination after the project rename.
- Shared mode: every item write records `updated_by`; a write to an item that somebody else changed after the agent read it (or while the command pushes) is refused with exit code 5. No move, new, archive or sync renumbering replaces an item that holds the file name, and a release ends the holder's wait.
- Shared mode: completion and close validate every reflowed item against the agent's cached view and guard the whole write set during push; pulling never counts as reading an item.
- Refresh package documentation and repository references for npm registry installation.

## 1.0.1

- Correct GitHub Packages login instructions for npm 9 and later by using
  `--auth-type=legacy`.

## 1.0.0

- Create and manage branch-specific backlog items with permanent GUIDs and
  sortable active priorities.
- Track tasks, acceptance criteria, outcomes, references, and evidence through
  new, open, done, and archived states.
- Move individual items between branches or import another branch's work.
- Use interactive creation or JSON output for scripts and coding agents.
- Install repository-local integrations for Codex, Claude Code, GitHub Copilot,
  and Qwen Code.
- Check for releases and optionally install compatible automatic updates.

See [the latest release](https://github.com/SmoothSDLC/smooth-backlog-cli/releases/latest)
for release notes. [README.md](README.md) covers installation and
[COMMANDS.md](COMMANDS.md) describes the CLI.
