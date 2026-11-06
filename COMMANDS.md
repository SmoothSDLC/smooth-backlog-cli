# Backlog command reference

One backlog per repository and branch, one set of commands. An item is its number (`1`) or its slug
(`001-fix-the-login-redirect`). Priorities are ranks: P0 is next, the queue runs without gaps and is renumbered when
work is added, moved or finished. Commands never switch, merge, stage or commit the repository's own content; a git
working tree is required and a dirty tree is valid.

## Where the items live

The backlog is always a git repository, and every change to it is committed and pushed before the command exits. Where the
items live is a setting of the repository that changes no command, option, output or help text:

- the repository's `.backlog` folder holds the configuration (`.backlog/config.json`, written by `backlog setup` or on
  first use; environment variables override it) and, by default, the items themselves: every change is committed on
  the repository's current branch, with the backlog's paths only, and pushed to origin under the same branch name (the
  `.state/` folder - lock, views, journal - is ignored by git). The items ride with the branch: `--all` shows the items
  the checked-out branch carries, and a merge carries them across;
- or the configuration names a backlog folder elsewhere (`backlog_repository`, a path relative to the repository;
  `BACKLOG_HOME` or the per-user file `~/.config/<name>/home` can name it too): a clone of a backlog repository shared
  by many repositories and people. Every command pulls it first and a command that changes an item commits and pushes
  the change before it exits. Its clone URL, for `backlog setup` to clone it, is the environment variable
  `BACKLOG_ORIGIN_URL` or the `backlog_origin_url` key of the configuration. Nothing but the configuration is written
  into the repository itself. (The root file `.smooth-backlog.json` of earlier builds is still read.)

**Two writers never overwrite each other.** Every write records who made it (`--by`, `--claim` or `--agent`, else
`BACKLOG_AGENT`, else `USER`) and when. A command that shows an item to an agent records what that agent saw; the
agent's next write to the item is refused with exit code 5 when somebody else changed it since, and the message says to
read it again (`backlog query --phase <item>`). The same refusal comes when another writer's change reaches the shared
repository while this command is pushing: the change is taken back, never merged. A change that cannot be published
is rolled back, and the command exits 3.

## Who and which team

`BACKLOG_AGENT` names the agent running a command; `BACKLOG_SESSION` its session. Items of a team follow the team
rules - refinement before work, the team's review rules before the close, work-in-progress limits (`wip-limits.json`
in the backlog folder). Teams, their leads and members and their review rules are configuration in the backlog folder
(`teams.json`); a team session is bound by `TEAM_NAME`, `TEAM_REPOSITORY` and `TEAM_BRANCH`. An item without a team is
not bound by them.

## Output and exit codes

`--json` prints the data itself. Refusals and failures print one `❌ backlog: ...` line. Exit codes: 0 success;
1 refused (the reason on standard output); 2 invalid input or a failure; 3 idle (`pop`, `work`, `team pop`: nothing to
do now) or a change that was not published; 4 the configured backlog repository is not cloned (run `backlog setup`);
5 stale view.

## Aliases

The command names of the first release still work; each runs the command set below. `backlog <alias> --help` prints the alias line and then the help of the command it runs.

- `init [name]` runs `backlog setup`
- `init clean [name]` runs `a typed yes, then every item of this repository's backlog is removed as one published change, then backlog setup`
- `list new` runs `backlog query --only new`
- `list open` runs `backlog query --only open`
- `list done` runs `backlog query --only done`
- `list archive` runs `backlog query --only archive`
- `list branch` runs `backlog query --branches`
- `branch` runs `backlog query --branches`
- `new <name> [--description D] [--state S] [--priority P]` runs `backlog new --name <name> --objective D --status S --priority P (--summary is the name unless given; state new = new, open = in progress, done = closed)`
- `set <item> name|description|state|summary|priority|branch|commit|location <value>` runs `backlog update <item> --name|--objective|--status|--summary|--priority|--branch|--commit|--location <value>`
- `priority <item> <position>` runs `backlog update <item> --priority <position>`
- `priority <item>` runs `backlog query --phase <item>`
- `done <item>` runs `backlog update <item> --status done`
- `<item> done` runs `backlog update <item> --status done`
- `move <item> <branch>` runs `backlog move <item> --to-branch <branch>`
- `<item> set|priority|move …` runs `the same command with the item first (backlog 3 done)`
- `<command> --ask | --headless (or BACKLOG_HEADLESS=1)` runs `the command without the switch: it is accepted and ignored (--ask still asks for the folder in setup and init)`
- `query --pop, next --agent` runs `nothing: it is refused with a pointer to backlog team pop --team <team> --agent <name> (--dry-run only answers)`

## Commands

The text of each command below is what `backlog <command> --help` prints. `backlog list` is `backlog query`.

### backlog new

```text
backlog new — add an item to the backlog of this repository, or split a sibling off an existing item

Usage:
  backlog new --name <text> --depends-on <items|none> [options]
  backlog new --split-from <item> --depends-on <items|none> [options]

Adds or splits an item. The item gets the next free item number, is added to the backlog of this repository in the
backlog repository, and the whole backlog is renumbered so that the priorities run from 0 without gaps. An item is
named by its number or by its slug, for example 018-help-text, and the output names it the same way.
The item belongs to the branch that is checked out in the repository you run the command in. When
TEAM_REPOSITORY (owner/name) and TEAM_BRANCH are set, a team session files the item under that repository and
branch instead, and then --body must hold a definition of done.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
BACKLOG_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --title TITLE, --name NAME
      The title of the item, in human-readable words. Required, unless --split-from is given. --name is the same option under its earlier word.
  --objective OBJECTIVE
      The objective of the item, in one line. A split item inherits the objective of its parent when this is omitted.
  --summary SUMMARY
      A semantic summary of what is in the item, several sentences. It is used to route new work to the right item, so say in it what
      the item is about. The option may be given several times (the sentences are joined, one per line) and may hold newlines.
  --context CONTEXT
      The context carried over from the original request. It is written into the item body.
  --priority PRIORITY
      The insertion rank, an integer. 0 makes the item the next thing to do. When it is omitted the item is
      appended to the end of the backlog. The backlog is renumbered to 0..N-1 around the item, because adding
      work is a planning event.
  --status STATUS
      The status the item starts in, as free text (done means closed); the default is pending. Not with --team: a team
      item starts in its own first status.
  --severity {normal,critical}
      The default is normal. Critical means a finding about repository corruption, data loss, the source of truth
      or security. It puts the item at priority 0 (unless --priority is given) and makes backlog query print it in
      a loud banner so that it is never buried.
  --split-from ITEM
      Create a sibling item that inherits the context of this item (a number or a slug). The command refuses when
      the item does not exist. In a team session the sibling starts in stage refining and takes its refinement review
      before it may be claimed; outside a team it is a plain item.
  --description DESCRIPTION, --body BODY
      The description of the item (--body is the same option under its earlier word): the initial body of the item, the hand-over content for whoever does it. When the body has no "Definition of
      done" heading or line with checkable lines, a placeholder checklist is added. With --review-refs, or in a team
      session, the body must hold a real definition of done.
  --review-refs REVIEW_REFS
      How the item is reviewed: comma-separated paths of review documents. A verdict cites one of them when the item
      has any. A team's item closes when the review rules of its team (teams.json in the backlog folder) are met.
  --depends-on DEPENDS_ON
      The item numbers or slugs that must be done first, comma-separated, or the word none (the default). owner/name#seq names
      an item of another repository's backlog in the same backlog repository. The command refuses when a named item is
      not in this backlog, or not in the backlog repository.
  --estimate MINUTES
      The estimated minutes of work, an integer (the front matter key estimate_min). Required for team work.
  --complexity {low,medium,high}
      The estimated complexity of the item.
  --layer {1,2,3,4,5,process}
      The layer of the item: 1 to 5, or the word process.
  --team NAME
      The team that owns the item (front matter team): the item starts in stage refining and is claimed
      only when its refinement review passed. --split-from inherits the source's team.
  --chunk
      Chunk work: small pieces any member does between items (the front matter key chunk: true).
  --force
      Write the item even when an item of that name already exists. Without it the command refuses.
  --dry-run
      Say which item would be created and change nothing: nothing is written and nothing is committed.
  --help
      Print this text and exit. Nothing is read or changed.

On success the command prints a line that starts "created phase" with the item's slug, the item number and the rank
the item now has, and a line about the renumbered backlog. A critical item is announced in a banner first.

The item template (backlog fields prints the same table):

key           shown as          meaning                                                                                                      set by                                                    required
phase         slug              The slug: the number and the title                                                                           the CLI                                                   always
seq           number            The item's number in this repository, never reused                                                           the CLI                                                   always
name          title             A short title of the item                                                                                    the creator (new --title)                                 always
objective     objective         The result the item delivers, one line                                                                       the creator (new --objective)                             always
summary       summary           Several sentences about what the item is for; it routes new work to the right item                           the creator (new --summary, may repeat or hold newlines)  always
body          description       The item's text below the front matter, with its definition of done                                          the creator (new --description), then every append        a team item needs a definition of done
status        status            Where the item is: a team's order, or a free word outside a team (closed, done and archived finish an item)  the CLI and update                                        always
severity      severity          normal or critical; a critical item jumps the queue                                                          the creator (new --severity)                              always
repository    repository        The repository the item belongs to                                                                           the CLI                                                   always
branch        branch            The branch the item belongs to                                                                               the CLI (update --branch moves it)                        always
commit        commit            The commit the work has reached                                                                              the CLI and update --commit                               always
location      location          Free text: where the work is                                                                                 update --location                                         no
created       created           When the item was created                                                                                    the CLI                                                   always
updated       last updated      When the item last changed                                                                                   the CLI                                                   always
updated_by    last updated by   Who changed it last: the agent named, else the user of .backlog/config.json                                  the CLI                                                   always
owner         owner             The user an item outside a team belongs to (the user of .backlog/config.json)                                the CLI (new)                                             no
team          team              The team that owns the item                                                                                  new --team, update --set-team                             for team work
claimed_by    holder            The agent that holds the item                                                                                team update --claim                                       no
claimed_at    held since        When the holder took it                                                                                      the CLI                                                   no
depends_on    depends on        The items that must be finished first                                                                        new --depends-on, update --set-depends-on                 always (none is a value)
review_refs   review documents  The documents that define a good result                                                                      new --review-refs, update --set-review-refs               for team work
estimate_min  estimate          Minutes of work, a whole number                                                                              new --estimate, update --set-estimate                     for team work
complexity    complexity        low, medium or high                                                                                          new --complexity, update --set-complexity                 for team work
layer         layer             1 to 5 or process                                                                                            new --layer, update --set-layer                           no
chunk         chunk             Small pieces of work any member does between items                                                           new --chunk, update --set-chunk                           no

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog new --name "Fix login" --objective "An expired cookie no longer blocks sign-in" --summary "Login cookie handling" --depends-on none
```

### backlog update

```text
backlog update — change the fields of one item, move it in the queue, or re-plan the whole backlog

Usage:
  backlog update <item> [options]
  backlog update --replan <item>,<item>,... [--note <text>]
  backlog update <item> --restore

Changes the item named by its number or slug. The item file is the source of truth: the command writes the file,
records an event in the history of the item. Setting --status to
closed completes the item (its completion time is set) and renumbers the rest of its branch's queue; so does --priority.
Both are planning events, so look at the order again afterwards. The order is kept in the index of the folder, so a
change of the order rewrites no other item. The item may be left out only together with --replan.
The two retired classification keys of older items have no effect. An item that still carries them shows them until the CLI next writes that item; every write drops them.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
BACKLOG_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --status STATUS
      The new status of an item outside a team: any word. The team's order is new, refining, refined, refinement review,
      ready, in progress, ready for review, reviewing, ready for external review, external review, review complete,
      closed, archived (hyphens and underscores stand for spaces: in_progress); any other word is free text and keeps the
      item open. closed (or done) finishes the item; archived is refused (backlog archive moves a finished item). An item
      of a team is refused here: its status moves by the team steps (backlog team update). Setting closed
      completes the item and is a close: for a team's item it is refused until the review rules of the team
      (teams.json) are met for the item's current work commit, and the refusal names the unmet rule. The owner closes
      without a review with --close --by owner.
      The hand-off rule of --close applies too: closed is refused until each dependent's hand-off is recorded and
      accepted; an item without dependents records handoffs: none; an item already closed is not checked again.
  --branch BRANCH
      Refused by design: the branch of an item is not changed here. Use backlog move --to-branch instead.
  --commit COMMIT
      Record the commit the work has reached. The value cannot be cleared; an empty value is refused.
  --location LOCATION
      Record where the work is, as free text.
  --summary SUMMARY
      Replace the semantic summary of the item.
  --priority PRIORITY
      Move the item to this rank, an integer. 0 makes it the next item. The rest of the queue of the item's branch is
      renumbered to 0..N-1 around it; no other item is rewritten.
  --name NAME
      Replace the name of the item.
  --objective OBJECTIVE
      Replace the objective of the item.
  --seq SEQ
      Set the item number to this integer.
  --size_score SIZE_SCORE
      Set the size score of the item, an integer.
  --restore
      Replace the item by its previous version: its content at the commit before the last one that changed it (the last
      committed content when the file has a local edit). An item with no earlier version is refused, and so is an earlier
      version that cannot be read either. A restored item records a restored event. This is the way out for an item
      that cannot be read, next to setting the unreadable field again (backlog update <item> --<field> <value>, for
      status, commit, location, summary, name, objective, seq or size_score). It takes no other option.
  --append APPEND
      Append this text to the body of the item.
  --replan REPLAN
      The new leading order of the backlog, as comma-separated item numbers or slugs. It is a pure planning event
      and renumbers the backlog to 0..M-1; the order itself is the record, no event is written. No item argument is
      given with it.
  --note NOTE
      The note for the event log. Without it the log records which fields were set.
  --claim AGENT
      Take the item for an agent (team session). The command refuses when another agent holds the item, when an item
      in its depends_on is not done, or when a split item (with or without a team) or a team's item is not in stage
      ready (its refinement review has not passed). A team item without a stage (a team's work item, or one written
      before the stage field existed) is unrefined, stage refining: only the team lead's own claim of its team's work
      item (backlog team pop, to split it; never a split slice) is accepted; for every other agent the refusal names --refine-start. An
      item without a team and without the split marker has no stage (solo work) and is claimable;
      otherwise the item becomes in progress and claimed by that agent. An agent or team name may contain letters,
      digits, a period, an underscore, a hyphen and a colon (a session counter after a colon, as in worker:3, names a session of that worker);
      the name works in the front matter, the event log, the commit subject and
      every --claim, --release and --by value. The claiming session joins the item's session_authors list; the
      sessions in that list, and the one who asked for the review, never review the item. A new session of the same
      card - a name sharing the <item><card> part before the colon - continues an item its earlier session claimed
      (a rework after a review, or the close): the claim records the new session name on the item, with no takeover
      and no lead reassignment.
  --force
      Together with --claim: claim although the agent already holds active items (never before stage ready).
  --waiting WHAT
      Record that the holder of the item (named with --by) waits for something asynchronous, for example a workflow run or a
      deployment. The wait is cleared by the next --note, --review, --close or --request-review of the item, or by
      --waiting-done (team session).
  --waiting-done
      Clear the wait of the item (team session).
  --set-review-refs PATHS
      Set the review_refs of the item (its definition of done), as comma-separated paths in the review-documents repository.
  --set-depends-on IDS
      Replace the depends_on of the item, as item numbers or slugs, owner/name#seq for an item of another repository, or
      the word none. The command refuses when a named item is not in this backlog, or not in the backlog repository. A
      not-done item of another repository blocks the claim like one of this backlog, and backlog team pop names it as
      the work to do first in its repository.
  --set-estimate MINUTES
      Replace the estimate_min of the item, the estimated minutes of work. It must be greater than 0.
  --set-complexity {low,medium,high}
      Replace the estimated complexity of the item.
  --set-layer {1,2,3,4,5,process}
      Replace the layer of the item: 1 to 5, or the word process.
  --set-chunk {yes,no}
      Mark the item as chunk work (small pieces any member does between items) or not.
  --wip-override REASON
      The team lead lifts the team and agent work-in-progress limits for this one item, with the reason recorded in
      the item (wip_override, wip_override_by, wip_override_at); --by <lead>. The overall, repository and branch limits
      stay: only the owner changes them, in wip-limits.json of the backlog repository.
  --severity {normal,critical}
      Change the item's severity (backlog new sets it, and starts a critical item at P0; backlog query --critical lists
      the critical items). The item does not move: change its place with --priority.
  --set-team NAME
      Set the team that owns the item; an empty NAME clears it. The team runner sets it on the work item it hands the team
      lead, and claims that item for the lead; items split from it inherit the team.
  --refine-start
      A team member starts refining the item (--by <agent>): only a team's item in stage refining, or without a stage (unrefined),
      that nobody claims or already refines. A split slice without a team joins the refining session's team (TEAM_NAME) here. The stages
      before any work are refining, refined, refinement-review and ready.
  --refine-done
      The refiner finished (--by <the refiner>, --note "<what you refined>"): stage refined. Refused while a team field or
      the definition of done is missing.
  --request-refinement-review
      The team lead sends a refined item to the refinement review (--by <lead>): stage refinement-review.
  --refinement-review {complete,reject}
      Record the refinement verdict, --by <reviewer> with --comments "<findings; thread or session id>": complete makes the
      item ready, reject sends it back to refining (pass and changes are accepted for complete and reject). The reviewer is a member of a team the refinement_review rule of
      the item's team names (teams.json); without such a rule, anyone.
  --request-decision QUESTION
      The item needs an owner decision (--by <agent>): stage review-hitl, the question is written in the item (what, why,
      how it came up, the options and a recommendation). Nobody claims it, or an item that depends on it, until the answer.
  --decision ANSWER
      The owner's answer to the item's question: written in the item as DECISION <date>: <answer>, and the item goes back
      to stage refining, where the lead re-refines it with the decision.
  --reassign AGENT
      The team lead only (--by <lead>, --reason "<why>"): take the item from the agent that holds it and give it to AGENT.
      The former holder stays in the item's session_authors list (the new holder joins), so the self-review block
      survives the hand-off. In a team session (TEAM_NAME set, BACKLOG_AGENT=<name>) a member acts only as itself: its
      claim, release, refinement, review and close of an item name itself, never another agent.
  --reassign-review AGENT
      The team lead only (--by <lead>, --reason "<why>"): hand the review of the item on to AGENT (not its author), for
      example a stale review; a member never takes over another agent's review.
  --reason REASON
      Why the lead reassigns or releases another agent's item or review (--reassign, --reassign-review, or
      --release AGENT --by <lead>), or rejects a hand-off (--reject-handoff).
  --release AGENT
      Give the item back, pending and unclaimed (team session). Only AGENT itself, or the team lead with --by <lead> and
      --reason, releases it. The release keeps the holder in session_authors (seeded for an item written before the
      list existed), so the holder's self-review block stands.
  --request-review AGENT|any
      Ask an agent, or any agent, for a review; --note says what to review (team session). The output ends with the
      instruction to end the session now, printed after the change is published: a review request, a reject verdict
      (--review reject) and a close each end the agent's session, so its next task starts in a fresh one (not for the
      team lead).
  --start-review
      Record that the agent named by --by starts the requested review (review_state in_review, reviewer and review_started are
      set). Other agents skip it unless the review was started more than 20 minutes ago (team session). The self-review rule
      is per session: the session that claimed the item or asked for the review (recorded in session_authors, kept on
      release like review_author) is refused with "the same session cannot review its own work; a new session may"; a new
      session, with a new name, may start the review (team session). Every claim, reassign, release and review request
      seeds the list from the item's current holder and review requester, so an item written before the list existed
      keeps the self-review block of its earlier sessions.
  --review {complete,reject}
      Record a review verdict (pass and changes are accepted for complete and reject); it needs --by and --comments. A complete is recorded against the item's work commit
      (work_commit) - the requester's HEAD at its review request (--request-review records it; a later request after a
      pass keeps it) - so the reviewer's checkout and other items' commits on the branch move nothing; the item's own
      new work (a later commit whose subject names the item as a producer at the start - the item number alone, or
      joined with another item's number by "and") moves the work commit, so the review runs again; a close or
      --status closed whose commit lookup fails is refused fail closed, and the refusal records the reason. A reject
      verdict clears every recorded pass, keeps the finding in the item's review history and sends the item back to work. A team's item closes when the review rules
      of its team (teams.json: each rule names a team and how many of its members must pass) are met for the current
      work commit; a reviewer never reviews in the author's session; an item without a team needs no rule.
  --handoff DEPENDENT
      The producer records its hand-off for DEPENDENT, one of the item's dependents; only the item's claimer does
      (--by <you> or the claim). It replaces any earlier hand-off for the same dependent, which makes an earlier
      receipt of the team lead stale. It needs --handoff-commit, --handoff-contract and --handoff-verification.
  --handoff-commit COMMIT
      The 40-hex commit id the hand-off is pinned to. Required with --handoff.
  --handoff-contract CONTRACT
      The contract of the hand-off, in text. Required with --handoff.
  --handoff-verification VERIFICATION
      How the hand-off is verified, in text. Required with --handoff.
  --handoff-outputs OUTPUTS
      The outputs of the work the hand-off carries. Optional with --handoff.
  --handoff-pickup PICKUP
      How the dependent picks the work up. Optional with --handoff.
  --handoff-risks RISKS
      The open risks of the hand-off. The default is NONE. Optional with --handoff.
  --accept-handoff DEPENDENT
      The team lead accepts the producer's hand-off for DEPENDENT. It needs --by <lead> and --checks
      "<what was checked>"; the producer's review must have passed. It records a receipt that pins the current
      hand-off record; a re-recorded hand-off makes it stale.
  --reject-handoff DEPENDENT
      The team lead rejects the producer's hand-off for DEPENDENT. It needs --by <lead> and --reason "<why>"; it
      records a receipt that pins the current hand-off record.
  --checks CHECKS
      The checks the team lead did before accepting a hand-off (--accept-handoff).
  --by AGENT
      The agent that reviews (--start-review, --review), refines (--refine-start, --refine-done), requests or records the
      refinement review, records the hand-off (--handoff) or accepts or rejects one (--accept-handoff,
      --reject-handoff), or closes (--close) the item (team session).
  --comments COMMENTS
      The review findings (--review); they must cite one of the review references of the item (team session).
  --close
      Complete the item; --summary says what was delivered. A team's item closes when the review rules of its team
      (teams.json) are met for the item's current work commit; the refusal names the unmet rule. Outside a team the
      person or agent running the command closes it. The owner closes without a review on a written decision
      (--by owner --reason "<the decision>"), recorded as an owner decision, even for a team item still in its
      refinement stages (team session). Only the claimer closes its item, else the team lead (--by <lead>);
      never the reviewer. An item that other items depend on closes only when each dependent's hand-off is recorded
      and accepted (--handoff, then the lead's --accept-handoff); the refusal lists every open dependent, the state
      of its hand-off and the next command. An item without dependents closes and records handoffs: none. An item
      already done is not checked again.
  --dry-run
      Say what would change and change nothing: no file is written and nothing is committed.
  --help
      Print this text and exit. Nothing is read or changed.

A call takes at most one team step (--claim, --release, --request-review, --start-review, --review, --close, --waiting,
--waiting-done, --handoff, --accept-handoff, --reject-handoff).
A session with TEAM_REPOSITORY (and TEAM_BRANCH) set works only on items of that repository and branch: every change to another item is refused, field edits and --append as much as team steps.
On success the command prints a line that starts with a check mark, the slug and the fields it set.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog update 18 --status in_progress --note "Started the help text"
```

### backlog query

```text
backlog query — read the backlog of this repository: the queue, one item, the history, or the critical items

Usage:
  backlog query [--status] [--all] [--branch <name>] [--json]
  backlog query --next | --critical | --phase <item> | --events [<item>] | --by-branch <name> [--json]
  backlog query --changed [--agent <name>] [--json]
  backlog query --only {new,open,done,archive} | --branches [--json]

Reads the backlog and never changes it, except that --changed advances
the agent's own last-use reference (its record of its own use, not an item). Without a view option it prints the full stack of the branch: the open
items in queue order (priority 0 is next), then the finished ones. Items that are not on the queue because they name
another repository or no branch are reported as findings above the queue.
With --json the command prints the data itself, without any wrapper.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
BACKLOG_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --next
      The next actionable item: the open item with the lowest priority on the branch. When the queue is empty the
      command says so (with --json it prints {}). Open items of a branch that no longer exists on the origin
      are in no queue.
  --status
      The full stack of the branch (this is the default view). Each row shows the item's status word (a team's order,
      or the free text of an item outside a team; closed, done and archived are finished, every other word is open). With --json each row also carries claimed_by and
      review_state, from the item's front matter ('' when unset).
  --critical
      Only the open items with severity critical.
  --phase PHASE
      One item, given by number or slug, or several as a comma-separated list (a JSON array). The command refuses when
      one does not exist. Each item is shown whole: its row, front_matter, body, and missing (the team fields it lacks:
      review_refs, depends_on, estimate_min, definition_of_done; [] when complete; null when the item's file is
      gone or holds no item: no front matter, or an empty one; a file that cannot be read or parsed fails the
      command, as every read does).
  --events [EVENTS]
      The history of the items, kept in the item files. With an item (number or slug) it prints the events of that
      item, newest first; without one it prints the latest 50 events of the backlog, archived items included.
  --by-branch BY_BRANCH
      The items recorded on this branch.
  --only {new,open,done,archive}
      The full stack filtered to one kind of item: new (not started), open (every item not finished), done (finished,
      not archived) or archive (archived). The listing is the same one, in queue order. Same as backlog list new,
      list open, list done, list archive.
  --branches
      One line per branch of this repository: the branch, its open items and its done items (with --json, a list of
      {branch, open, done}). Same as backlog branch and backlog list branch.
  --changed
      Which items of this repository changed since your last use: your own write or your own --changed is
      the reference (its commit and time, stated in every result, also when it is empty), never a global
      timestamp, so a change made while you are idle still appears in your next report; your own reads
      (query --phase, team pop) do not move it. The first --changed prints "no earlier use: reference set now"
      and sets the reference. The items you hold (your name in claimed_by, reviewer or refiner) are listed
      in a "held" section; every other changed item goes to "others"; a file moved inside the folder (an
      archive, a renumbering) is one "D" entry for its old name. When the comparison fails (your reference
      commit is no longer in the clone, for example after a history rewrite), the command reports the
      failure (exit 2) and keeps your reference, so the change is not lost. The report is printed before
      the reference is written, so a failed output consumes no change (the same changes repeat in the
      next report); on a first use the report is empty and the write happens first, so the result states
      exactly what was stored. When the write of your reference fails, the result says so and keeps the
      previous reference: a failed first use prints "no earlier use: the reference could not be set"
      (with --json the reference is null), and a failed write after an earlier use says so in the text
      and, with --json, prints the line {"reference_write": "failed"} after the report (the exit is 0).
      The result also lists the agents that use the backlog (those with a reference point in this clone)
      and their last-use time.
  --json
      Print machine-readable output.
  --all
      Show --next or --status for every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to show. The default is the branch that is checked out here; a detached HEAD needs
      this option or --all.
  --agent AGENT
      With --phase the agent has read that item (or each of a comma-separated list, printed as a JSON array): its next
      write of it is checked against that version. A change of an item's rank alone (another agent's move or reflow)
      never makes the agent's view stale; a change of its content does, and the refusal names every such item of the
      write in one backlog query --phase <a>,<b> command.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog query --status --branch main
```

### backlog next

```text
backlog next — show the next actionable item of this repository and branch

Usage:
  backlog next [--all] [--branch <name>] [--json]

Prints the open item with the best priority on the branch that is checked out here, whole: its objective, summary and
progress, then its front matter and its body. It skips nothing for team reasons (a team's hand-offs are a matter of
backlog team pop). It is the same as backlog query --next and reads the backlog without changing it. When the queue is empty it says so
(with --json it prints {}). Critical items are announced in a banner first. The other options of backlog query are described in backlog query --help.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
BACKLOG_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --all
      Show the next item over every branch, not only the current one.
  --branch BRANCH
      The branch whose queue to show. The default is the branch that is checked out here; a detached HEAD needs
      this option or --all.
  --json
      Print the item as machine-readable data.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog next --json
```

### backlog team

```text
backlog team — the commands that know a team: pop, update, query, define, workflow

Usage:
  backlog team pop --team <name> --agent <name> [--dry-run] [--json]
  backlog team update <item> --team <name> --agent <name> <step> [options]
  backlog team query --team <name> --agent <name> --claimable | --reviewable | --blocked | --decisions | --plan | --wip [--roster <file>] [--scope branch|repo|all] [--json]
  backlog team define --file <team.json> [--json]
  backlog team workflow --file <flow.json> [--json]
  backlog team workflow --show <name>

Only these commands read the team's entry in the backlog configuration (teams.json at the root of the backlog: the lead, the members,
the external reviewers and the review stages) and the flow it names. The plain commands know nothing of teams. --team and --agent
are required on pop and update; TEAM_NAME and BACKLOG_AGENT stand in for them, then the team and user of .backlog/config.json. A team
without an entry is refused: "team <team> is not configured in the backlog configuration".

backlog team pop is the one next-action command. It answers by the agent's role in the team's entry, with exactly one action, the
first that applies: continue (an item the agent holds and can work on; when its review passed, close it), review (an item another
agent asks to have reviewed, or a review the agent started), refine (a member: the refinement it has started, or the first-round
refinement of a team item that nobody refines; the team lead: an incomplete item that lacks required fields), claim (the open item
with the lowest priority whose dependencies are done and whose hand-offs are accepted, that is no chunk item, is ready when it is a
team's item, and that nobody holds), refinement-review (the team lead: refined items to send to the refinement review), reassign-review
(the team lead: a stale review of its team to hand on), stop (a member that handed its item off and waits for a fresh session: end the
turn), chunk (a small piece of refinement work of at most ten minutes) or idle. An item the agent holds that waits for a verdict or
for a run is not continued, and the agent claims a new item only when every item it holds waits. Another agent's review request
comes after the agent's own work, however old it is. Incomplete items are never claimed or reviewed. Only the team's items of this
repository are continued, reviewed or claimed. The lead never claims an execution item; while its team works the split items its
answer is idle with the instruction to end the turn without polling (a passed or changes-requested item of the lead's keeps its close or
rework), and when every item of its team is done it is told to have the work item reviewed and close it.

In addition the lead gets the team's work item: an item of this repository and branch whose team is the team and that has no stage
(backlog update <item> --set-team <name> gives an item to a team; the items split from it carry a stage and are the members' work).
A refined work item (its stage set, its refinement review passed) is an ordinary item any member may claim; team pop offers a work
item only while its stage is unset, and the lead still refines it and splits it only when it is too big for one member. When the lead
holds an open work item that has no other item of the team, the answer is continue with that item. When an earlier session of the
lead's card holds it, the command records the continuation claim first - the new session name as claimed_by and in session_authors -
and then answers continue; a refused continuation claim is no success: the earlier session keeps holding and the command stops (exit
1, the reason on standard error). The final read requires the lead's own session still holding the item: a hand-back or a reassignment
to another session of the same card between the selection and the final read is no success (exit 1, the item changed before it
could be shown). Otherwise, with nothing else to do, the command claims for the lead the team's first open, unclaimed work item in
the work order (priority, then seq) whose claim is accepted (its dependencies are done, no work-in-progress limit is passed), and the
answer is claim.

The step the answer offers is marked in one locked write: the claim, the start of a refinement or the start of a review. The output
is the action and the item, what was marked, the one instruction, one line per blocked item, the work items not taken with the
reason, and the whole item: its front matter and its body. With --json it prints one object: action, item, seq, team, repository,
branch, instruction, claimed, blocked, held, marked, skipped ({item, reason} of each work item not taken), front_matter and body.
With --dry-run the command only answers: it writes no claim and no mark (marked is null, claimed false) and does not take the
lead's work item; the exit codes are the same. A hook that looks before the agent acts uses it; the agent then takes the step itself.

backlog team query reads the backlog through the team's views; the plain query has none of them (backlog query --claimable and the others answer "use backlog team query"). The view is one of the options below; --agent is the agent that asks (given, it switches to the team rules: an incomplete item is not offered and the agent never reviews its own work). A team without an entry is refused.

backlog team update runs one team step on an item: --claim, --release, --waiting, --waiting-done, --request-review, --start-review,
--review, --close, --handoff, --accept-handoff, --reject-handoff, --reassign, --reassign-review, --refine-start, --refine-done,
--request-refinement-review, --refinement-review, --request-decision, --decision, --wip-override, with the options of those steps
(see backlog update --help). A bare --claim or --release takes the agent. The earlier spelling backlog update <item> --claim <agent>
(and the other steps) still works and prints "moved: use backlog team update ..." on standard error.

backlog team define registers one team from a JSON file { "name", "lead", "members": [..], "external_reviewers": [..], "workflow": "<flow,
default team>", "review": [{ "stage", "reviewers": "members"|"external_reviewers", "count" }] (default: the flow's), "wip": { "agent", "team" } }.
Every field is checked (the lead is not a member, the stages are stages of the flow, an external stage needs external reviewers) and each
problem is printed, one per line, exit 2, with nothing written. The entry is added to teams.json at the root of the backlog beside the
others, committed and pushed ("team <name> defined"); the same definition again changes nothing. A team that has open items is not replaced:
register the new composition under another name. backlog team workflow registers a flow the same way into workflows.json after the
checks of the flow (every open status can reach closed); --show prints a registered or the shipped flow.

Options:
  --team NAME
      The team (pop, update). In a team session (TEAM_NAME set) it must be that team.
  --agent AGENT
      The agent the command answers for (pop, update). In a team session (BACKLOG_AGENT set) it must be that agent.
  --json
      Print the answer as JSON.
  --claimable
      Open, unclaimed items whose dependencies are all done, in priority order (a team item before stage ready, or without a stage, is not claimable: it is refined first); another repository's items only as chunk
      work (chunk: true, with --scope all); with TEAM_NAME set, only that team's items of this repository .
  --reviewable
      Items with a requested review that --agent may start or continue: a session that did not claim the item and did
      not ask for the review (the sessions in session_authors) reviews; a new session of the same card may .
  --blocked
      Open items that wait for dependencies that are not done, with the status and holder of each dependency .
  --decisions
      The items that wait in stage review-hitl for an owner decision, each with its question, for the morning report; with
      --all every branch. Answer one with backlog update <item> --decision "<answer>".
  --wip
      The work in progress of the whole backlog repository against its limits (wip-limits.json at its top folder:
      overall, repository, branch, team, agent, each a number or {"default": n, "<key>": n} with the key owner/name, the
      owner/name:branch, the team or the agent, and stale_hours), and the items in progress without a change of their own
      for longer than stale_hours (default 48). A claim or a
      refinement start past a limit is refused, naming the limit and the items holding it.
  --plan
      The dispatch plan of the team for this branch: at most one action per member (respond, close, review, claim, and for
      the team lead refine or reassign-review), each item to one member, with the reason and a dispatch key; the members
      are the roster's (--roster, else TEAM_ROSTER). Entries come by action (respond and close, review, claim, refine), a
      claim to the member holding the fewest items, then in roster order (team session). Read-only.
  --lead LEAD
      pop and --plan: the team lead, who alone refines incomplete items outside the refinement stages and never claims an execution item. The default is the
      environment variable TEAM_LEAD, else the lead of the team in teams.json.
  --agents AGENTS
      With --plan: the team members present, comma-separated; the default is the whole roster.
  --roster ROSTER
      pop and --plan: the team roster as a JSON file {agent: {...}}, the team's members in order; the default is the
      file named by TEAM_ROSTER.
      Any session may review an item except the sessions recorded on it (session_authors: the claimer and the one who
      asked for the review, kept on release); a new session of the same card may review it. A member with "review_only":
      true never claims.
  --scope {branch,repo,all}
      pop and the views --claimable, --reviewable and --blocked: how far the agent looks: this branch (the default), every branch of this repository, or also the chunk items
      of every repository. The widest scope for chunk items is capped by the line refinement_scope: off|branch|repo|all
      in the file backlog.scope of the folder of this repository (default branch).
  --all
      pop only: look at every branch, not only the current one.
  --branch BRANCH
      pop only: the branch whose queue to use. The default is the branch that is checked out here. A team session bound by
      TEAM_BRANCH can only use that branch.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The answer names an item (continue, claim, review, refine, chunk, ...), the step was marked, define or workflow succeeded.
  1  A claim was refused or could not be run (its process failed or was interrupted): its output, or the failure, is shown.
     After an interruption the claim may already be saved, or even pushed: check the item before running team pop again.
     Also: a command it ran failed for another reason, a synchronisation failure included (the reason is printed), the item
     changed before it could be shown (run it again), or the team has no entry in the configuration.
  2  Invalid input: a missing --team or --agent, another team than TEAM_NAME, an agent other than BACKLOG_AGENT, no branch (a
     detached HEAD without TEAM_BRANCH), or a definition with problems.
  3  idle: nothing to do now (pop). The same code is used when the local clone of the backlog repository could not be updated from
     its origin before the answer.

Example:
  backlog team pop --team cli-1 --agent ann --json
```

### backlog fields

```text
backlog fields — show the item template: every field of an item and what it is for

Usage:
  backlog fields [--json]

Prints one line per field of an item, with five columns: the key the item file carries, the name the field is shown under, what it
means, who sets it, and when it is required. It reads nothing and changes nothing.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
BACKLOG_RUN_HOOK names an executable, and no child process when the variable is unset.

Options:
  --json
      Print the table as a list of objects, one per field.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog fields
```

### backlog move

```text
backlog move — move an item to another branch, or to another repository's folder, keeping its history

Usage:
  backlog move <item> --to-branch <name> [--note <text>]
  backlog move --all-open-of-branch <from> --to-branch <to> [--note <text>]
  backlog move <item> --to-repository [<owner/name>] [--note <text>]

Moves backlog items. With --to-branch the item now belongs to that branch of this repository. With
--all-open-of-branch every open item of one branch moves to another branch, for example after the branch was
merged. With --to-repository an item that names another repository goes to the folder of that repository in the
backlog repository; without a value it goes to the repository the item names, under a new item number there.
Every move is recorded as an event in the history of the item.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
BACKLOG_RUN_HOOK names an executable, and no child process when the variable is unset.

Argument:
  <item>
      The item to move, by number or slug. Required, except together with --all-open-of-branch.

Options:
  --to-branch TO_BRANCH
      The branch the item (or every open item of --all-open-of-branch) now belongs to.
  --all-open-of-branch ALL_OPEN_OF_BRANCH
      Move all open items of this branch of this repository. It needs --to-branch.
  --to-repository [TO_REPOSITORY]
      Move a foreign item to the folder of another repository, given as owner/name. The default is the repository
      the item names. The command refuses when that is the repository you are in.
  --note NOTE
      A note that is added to the event of a move to a branch.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes for this command: 0 moved and pushed, 1 refused (for example the item does not exist), 2 wrong place or
wrong arguments (for example neither --to-branch nor --to-repository), 3 the update of the local clone failed before
the move (nothing was changed), or the move was not published and was rolled back.

Example:
  backlog move 18 --to-branch team-cli-parity-1
```

### backlog archive

```text
backlog archive — archive a finished item: it leaves the work queue and is kept as archived

Usage:
  backlog archive <item> [--force] [--dry-run]

Archives an item given by number or slug: the item leaves the work queue, is kept as archived in the backlog
repository and its status becomes archived; the output names it by its slug. The command records an event and
renumbers the remaining backlog to 0..M-1, because archiving takes the item off the backlog. Archiving an item
that is already archived does nothing and says so. The command refuses when the item does not exist, or when its
status is not closed and --force was not given.

Run the command from inside the repository whose backlog you mean. When the backlog folder is a git repository, the
command first updates it (git pull --rebase --autostash) and a command that changes an item commits and pushes the
change before it exits; a folder inside the repository is committed with the repository by its user. The executable
reports each run to an optional run recorder hook: the hook spawns a child process only when the environment variable
BACKLOG_RUN_HOOK names an executable, and no child process when the variable is unset.

Argument:
  <item>
      The item to archive, by number or slug.

Options:
  --force
      Archive the item even if its status is not closed.
  --dry-run
      Say which item would be archived and change nothing: nothing is moved and nothing is committed.
  --help
      Print this text and exit. Nothing is read or changed.

Exit codes:
  0  The command succeeded. Read views and --dry-run also exit 0.
  1  The command refused: it printed a line that starts with a cross mark on standard output.
  2  The arguments or the place were wrong: the message is on standard error. An item of the backlog that cannot be read
     also exits 2: the message names the item and the field, and the two ways out (set the field again, or --restore).
  3  The repository that holds the items could not be synchronised with its origin. Either the update before a
     change failed: then nothing was changed, and the command can be run again once the cause is fixed (a command that
     only reads answers from the local copy instead, with the warning that the origin is offline and the local backlog
     may be behind). Or the change was not published and was rolled back: fix the cause and retry the command. Existing
     unpublished commits of a backlog repository clone are refused before any change; the message lists them and gives
     explicit publish or drop commands.
  4  The backlog repository is not set up; the printed question must be answered by the user.
  5  The item was changed by somebody else after this agent last read it (backlog query --phase <item> --agent <you>; a write
     records the agent's view of the item too), or while this command was pushing: nothing was written or pushed, and the message
     names who changed it and when, and is followed by the item as it is now (with --json, one object with the error and
     the item). Read the item again, then repeat the command. An item this agent never read is written without the
     check (its first write).

Example:
  backlog archive 12
```

### backlog setup

```text
backlog setup — choose where this repository's backlog lives and deploy the backlog skill

Usage:
  backlog setup [--ask]

Run inside the git repository to set up. The command:
  1. finds the backlog folder: BACKLOG_HOME when the variable is set; else the one the repository's configuration
     names; else, when a clone URL is set (the environment variable BACKLOG_ORIGIN_URL, then the backlog_origin_url
     key of the configuration),
     ../<name> beside the repository (<name> from the URL); else .backlog inside the repository. With --ask it asks for
     the path, showing that default;
  2. clones the backlog repository there with git when the path does not exist and a clone URL is set (a clone that
     cannot be made is refused: exit 3, nothing changed); creates the folder when no URL is set; leaves an existing
     folder exactly as it is;
  3. creates the repository's .backlog folder (the configuration lives there; inside it the items too, by default) and
     writes .backlog/config.json {"backlog_repository": "<path relative to the repository>"} (".backlog" for the
     folder inside it) when there is no configuration yet, with --ask, or when the environment names the location
     (BACKLOG_HOME, BACKLOG_ORIGIN_URL — the clone URL is recorded as backlog_origin_url, so later runs need no
     variable); otherwise keeps it. A write keeps the file's other keys;
  4. replaces the backlog skill in every agent folder present (.agents, .claude, .github, .qwen) with this release's;
  5. commits and pushes what it wrote (the configuration and the skill copies) on the current branch, and prints a
     summary of every action: the .backlog folder, the configuration, the skill copies, the commit. No path is printed.

Every command finds the backlog folder in this order: BACKLOG_HOME, the repository's configuration (.backlog/config.json,
backlog_repository: a path relative to the repository; .backlog means inside it; the root file .smooth-backlog.json of
earlier builds is still read), the per-user file <name>/home under the config folder ($XDG_CONFIG_HOME, else
~/.config; without the clone-URL setting, the only such file there), ~/git/<name> when a clone URL is set. When none of
them names one, the backlog is .backlog inside the repository, created with its configuration on first use. A
configured folder that is missing is refused (exit 4) naming backlog setup. setup commits and pushes what it wrote
(the configuration and the skill copies) on the current branch. Both locations are updated from their origin before every command and pushed after every change; nothing is written
into the repository being set up by that. Inside the repository, every change is committed on the current branch, with
the backlog's paths only, and the branch is pushed to origin under the same name, the user's own commits included; the
command then prints "<id> - <name> committed; all pending branch changes pushed". A branch the origin does not have yet
is created by the first push. A command that only reads and cannot reach the origin answers from the local copy with a
warning; a write is refused (exit 3).

Options:
  --ask
      Ask for the backlog repository path on standard input; an empty answer takes the default shown.
  --help
      Print this text and exit. Nothing is read or changed.
Exit codes: 0 done; 2 a usage error or a folder that is no clone of the backlog repository; 3 the clone failed.

Example:
  backlog setup
```
