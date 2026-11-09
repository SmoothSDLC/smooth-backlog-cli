# 08 — Owner questions and the decisions taken instead

The CLI has two personas. **The user** is a person who manages items with the ordinary commands (`backlog new`, `backlog list`,
`backlog update`, `backlog done`, `backlog archive`, `backlog move`, ...): the *user commands*, the *user flow*. **The agents** are AI
agents that work in teams with `backlog team ...`: the *team commands* (agent commands). The owner's rulings: the user flow enforces
nothing (a user may set any value; the CLI refuses nothing and dictates no behaviour); every team behaviour comes from the team's
behaviour file; a user who wants enforcement defines a team named `user` and uses the team commands.

Part 1 lists what the rulings already decide (no answer needed). Part 2 asks only what neither the rulings nor the repository decide,
one question per section, in the order: commands concerned, scenario with today's input and output, what happens today and where the
behaviour comes from, why it is a question, options, recommendation. An identifier after a sentence (for example "label Q-04") is only a
cross-reference into the specification.

## Part 1 — Decided by the owner's rulings (former questions; recorded as decisions)

### `backlog list new|open|done`, `backlog done`, `backlog archive`, `backlog update --status`: values are free, defaults stay defaults

A user runs, on a fresh backlog, these commands (real output of the CLI at 174c76d, trimmed):

```text
$ backlog update 3 --status shipped
$ backlog done 1
$ backlog list
   • [  2] 002-write-docs               pending      P  0  Write docs
   • [  3] 003-ship-it                  shipped      P  1  Ship it
   ✅ [  1] 001-fix-login                closed       P  2  Fix login
$ backlog list new      -> 002-write-docs (pending)
$ backlog list open     -> 002-write-docs (pending), 003-ship-it (shipped)
$ backlog list done     -> 001-fix-login (closed)
$ backlog archive 3
❌ 003-ship-it is 'shipped', not 'closed' — finish it or pass --force
```

Decision (owner ruling on the user flow; labels D-19, D-33): the user commands keep their built-in default words as defaults only:
a new item is `pending`; `list new` shows `pending` and `new`; `closed`, `done` and `archived` are the finished words that `list done`
and `archive done` use; `backlog done <n>` writes `closed`. Any other value is accepted and stored exactly as typed (`--status Done`
stays `Done`; today it is rewritten to `closed`). An item with another word appears in `backlog list` (the whole stack), in
`backlog list open` and in `backlog show <n>`, never in `list new` or `list done`; in the example `003-ship-it` keeps appearing in
`list` and `list open`. `backlog archive 3` archives the item without `--force` and without changing its status (today: the refusal
above). The default words live in one module of the CLI and are documented in `backlog --help` and COMMANDS.md. Nothing is left to
ask: the ruling says where the defaults come from (built in) and what happens to other values (accepted, shown by `list` and `show`).

### `backlog update <n> --claim/--release/--close`: write the fields, refuse nobody

A lone user runs (real output at 174c76d):

```text
$ backlog update 2 --claim alice
$ backlog update 2 --claim bob
❌ 002-write-docs: claimed by alice since 2026-11-08T22:29:24Z; message alice or pick another item
$ backlog update 2 --close
❌ 002-write-docs: --close needs --summary "<what was delivered>"
```

Decision (owner ruling on the user flow; label D-20): the three flags stay and refuse nobody. `--claim bob` records `bob` as the
holder (and the default word `in progress`) even when `alice` held the item; `--release` clears the holder (default word `pending`);
`--close` writes the default word `closed`, and the summary as a body record when one is given. No name such as `owner` is special.
A team that wants "only the holder closes" puts that rule in its behaviour file and uses `backlog team update`.

### Work-in-progress limits and the dependency gate in the user flow: none

Today `backlog update 4 --claim bob` is refused when `wip-limits.json` says the branch already has its number of items in progress, and
when item 4 depends on an unfinished item. Decision (owner ruling and principle; label D-18): the user commands apply no limit and no
dependency gate. Dependencies stay data: they are stored, checked for existence and cycles, and shown (`backlog next`, `backlog list
blocked`). Limit numbers move into the team entries (`teams.json`), where only the team commands read them; `wip-limits.json` is
migrated and retired.

### Further decisions taken by the analyst under the principle (each cited in `03-spec.md` §2)

- Team commands own their code path; the user commands carry no team hook (D-17).
- The team entry is generic: names in `people`, `lists`, `rules`, composition rules in the behaviour file (D-21).
- No role, field, step or verdict name is fixed in the CLI; the shipped template names them (D-22 to D-25).
- `backlog archive` writes no status; an archived item is recognised by its folder (D-26).
- One cutover instead of a run-time bridge between old and new files (D-27); every topology commit moves the CLI pin (D-28).
- An old behaviour file converts to the shipped template plus its own names (D-29); every item is migrated once (D-30).
- Exit codes 0, 1, 2, 3, 4, 5 with the configuration-command exception (D-31); an absent entry key is a read-time default (D-32).

## Part 2 — Questions

## Q-04 — `backlog team update|pop|new|query`: do the session variables stay inputs?

**ANSWERED: option A, and every input also as a flag on every team command (see 11-owner-answers.md).**

**Scenario.** The team's run script starts an agent session with `TEAM_NAME=t1 TEAM_REPOSITORY=owner/app TEAM_BRANCH=main
BACKLOG_AGENT=ann BACKLOG_SESSION=s-17` in its environment. The agent then runs `backlog team pop` without `--team` or `--agent`, and
today the CLI answers for team `t1` and agent `ann`, offering only items of `owner/app` on `main`; `backlog team update 7 --claim bob`
by that session is refused because a member may act only as itself.

**Today.** The CLI reads the five variables in code; what they trigger (the member-acts-as-itself rule, the session's repository and
branch) moves into the behaviour file with this plan. After the flags, the CLI also falls back to the keys `team` and `user` of
`.backlog/config.json`.

**Why a question.** The owner ruled that the backlog location comes only from the configuration, and listed environment overrides as a
gap. These variables do not choose the backlog; they say who and where the session is. Neither ruling decides whether the team commands
may take identity from the environment.

**Option A — keep them as documented session inputs.** The five variables stay inputs of the team commands (flag first, then variable,
then the configuration key), and the help documents each one. The run script, the dispatcher, the wake hook and the nightly keep
working unchanged; the cost is an input that is invisible on the command line.

**Option B — flags only.** Every team command takes `--team`, `--agent`, `--session`, `--scope-repository` and `--scope-branch`, and the
variables and the configuration fallback are not read. Every input is visible on the command line, at the cost of changing the
dispatcher, the wake hook, the nightly and the run script (in one additive-then-removal pair) and longer command lines in every skill.

**Recommendation: A**, because the behaviour already moves into the file and the variables only name the session (label REQ-911).

## Q-05 — Team behaviour files: implement or drop the keys that were declared but never enforced?

**ANSWERED: the rules belong in the team template (location set in the backlog configuration); the CLI enforces generic keys only (see 11-owner-answers.md).**

**Scenario.** The shipped definition and the team's copy declare that a refinement review rejected three times goes to an owner
decision (`max_rounds: 3`, `after_max_rounds`), that an item awaiting a decision blocks its dependents (`blocks_dependents`) and that
old reviews are offered first. A lead rejects a refinement a fourth time with `backlog team update 5 --refinement-review reject
--comments "..."`: today the item simply goes back to `refining` again; nothing asks the owner.

**Today.** Declared in the file, enforced nowhere in the code.

**Why a question.** The new format holds only rules the CLI enforces. Dropping the keys keeps behaviour as it is; implementing them
changes what running teams experience. The principle says where rules live, not which rules a team wants.

**Option A — drop them.** The new format has no such keys; the migration lists them as dropped; running teams see no change. A team
that later wants the behaviour asks for it as a new item.

**Option B — implement them.** The format gains `max_rounds`/`after_max_rounds` per step, `blocks_dependents` per side status and an
"older than" queue test, and the template sets the declared values. A fourth rejection then sends the item to the owner, an item awaiting
a decision blocks its dependents, and teams get what the file promised; this is a visible change for the running team.

**Recommendation: A**, and B as a separate item if wanted (label REQ-912).

## Q-06 — `backlog team update --delete` or `backlog clean`: how is a team item deleted?

**Scenario.** A lead created item 12 twice by mistake. Today `backlog clean` refuses while a team item is in its scope (`use backlog
team update: ... belongs to a team`), and no team command deletes an item; the lead can only close or archive the duplicate.

**Today.** Code (the refusal); no delete door exists.

**Why a question.** Under the principle the team's file decides whether `backlog clean` may touch its items, but a deletion of one item
with a reason needs a team step that does not exist; whether teams should be able to delete at all is a choice.

**Option A — a `delete` step in the template.** `backlog team update 12 --delete "duplicate of 11"` (lead only) removes the item in one
published change with the reason in the commit message, and is refused while another item depends on it. Mistakes are removed through
the team's own command; the history keeps the commit.

**Option B — no deletion.** A mistaken team item is closed (or abandoned, Q-08) and archived. The audit trail stays complete and nothing
is built; duplicates stay visible in the archive.

**Option C — allow `backlog clean` on team items.** The template sets its user-command entry for `clean` to allowed. No new step, but a
user command can then wipe a team's work.

**Recommendation: A** (label REQ-930).

## Q-07 — `backlog move` of a team item: user command or team step?

**Scenario.** A lead runs `backlog move 9 --to-branch release` for an item of team t1 that a member is working on. Today the move
succeeds; the member's session, bound to `main`, no longer sees the item.

**Today.** Code: moves of team items are allowed.

**Why a question.** The file can allow or refuse the user command `move` for team items; whether a team also needs a recorded move step
is a choice the principle does not make.

**Option A — the template allows `backlog move`.** Moving stays housekeeping with no team rule; the session scope follows the item.
Nothing changes for the consumers.

**Option B — refuse `backlog move` for team items and add a `move` step.** `backlog team update 9 --move release` (lead only) changes
the branch and records who moved it; a move to another repository is refused. Moves of team work become team decisions, at the cost of
one more step and a changed habit.

**Recommendation: A** (label REQ-931).

## Q-08 — `backlog team update --abandon`: how does a lead stop an unfinished team item?

**Scenario.** A lead decides that item 14 (status `refining`) will not be done. Today `backlog archive 14 --force` is refused for a team
item, and the only way is the owner's close: `backlog team update 14 --close --by owner --reason "..." --summary "..."`, which needs the
owner's name as the actor.

**Today.** Code (the refusal) and the owner-close variant of the close step in the file.

**Why a question.** Whether a lead may end work without the owner is a team policy, not a principle matter.

**Option A — an `abandon` step in the template.** `backlog team update 14 --abandon "superseded by 15"` (lead only) moves any unfinished
item to the template's finished word with a record and skips the review rules (the hand-off check stays); the item can then be archived.
A lead stops work without acting as the owner.

**Option B — no step.** The owner's close stays the only way, so every abandonment is an owner decision. Nothing to build.

**Recommendation: A** (label REQ-932).

## Q-09 — `backlog update <n> --ask`: should the user be asked for fields interactively?

**Scenario.** A user at a terminal wants to change the objective of item 3 without remembering flags. The first release offered
`backlog set 3 objective --ask`; today `backlog update 3 --ask` answers `unrecognized arguments: --ask` (exit 2), while `backlog new
--ask` asks name, objective and summary.

**Today.** Absent; the owner restored `--ask` only on `new` and `team new`.

**Why a question.** It is an input convenience of a user command, not enforcement, and no ruling covers `update`.

**Option A — add `--ask` to `backlog update`.** It asks on a terminal for name, objective, summary and a note (an empty answer keeps
the field) and is refused without a terminal. A user editing by hand is guided as in the first release.

**Option B — not provided.** `--ask` stays on the two creation commands; `update` takes flags only. One fewer interactive path.

**Recommendation: B**, because the owner named only the creation commands (label REQ-933).

## Q-10 — Every `--json` output: wrapped in an envelope or raw?

**Scenario.** A script runs `backlog list --json`. Today it receives the raw array of rows; the first release returned
`{"ok": true, "data": [...]}`. The dispatcher, the wake hook and the nightly parse the raw form.

**Today.** Raw payloads (the envelope was removed although an earlier owner answer said "keep all").

**Why a question.** The two earlier states conflict, and changing back breaks every JSON consumer at once (no aliases are allowed).

**Option A — the envelope everywhere.** Every `--json` answer becomes `{"ok":true,"data":<payload>}` and every consumer changes in the
same deploy. Uniform for new scripts, disruptive for the existing ones.

**Option B — raw payloads, documented per command.** Each command's JSON shape is documented in COMMANDS.md and tested. No consumer
changes.

**Recommendation: B** (label REQ-934).

## Q-11 — Failures under `--json`: a JSON error object or a text line?

**Scenario.** A script runs `backlog show 99 --json` for an item that does not exist. Today it gets a text line `❌ ...` and exit 1,
and must parse text; only the CLI's bootstrap already prints `{"ok":false,"error":{"code":"RUNTIME_ERROR","message":"..."}}` for an
internal failure.

**Today.** Text lines in code, except the bootstrap's runtime error.

**Why a question.** One command should behave one way; today two error shapes exist under `--json`.

**Option A — a JSON error object for every failure under `--json`.** `{"ok":false,"error":{"code":"NOT_FOUND","message":"..."}}` on
standard output with the same exit code (codes INVALID_INPUT, REFUSED, NOT_FOUND, STORAGE_ERROR, SYNC_FAILED, STALE, TEAM_CONFIG,
RUNTIME_ERROR); without `--json` nothing changes. Scripts get a stable contract and stop matching texts.

**Option B — text only.** The bootstrap's object is removed as well, so failures are text everywhere. Nothing new to build.

**Recommendation: A**, because it is additive and already half there (label REQ-935).

## Q-12 — Every command: may environment variables redirect the backlog or the branch?

**Scenario.** A user sets `BACKLOG_HOME=/some/other/clone` and runs `backlog list`: today the CLI reads that folder instead of the one
the repository's configuration names (also `BACKLOG_ORIGIN_URL` for the clone URL). The first release also read `BACKLOG_CLI_BRANCH`
as the branch on a detached HEAD; that variable is not read today.

**Today.** Code: `BACKLOG_HOME` and `BACKLOG_ORIGIN_URL` are read; `BACKLOG_CLI_BRANCH`/`BACKLOG_CLI_REPONAME` are not.

**Why a question.** The owner ruled that the backlog location comes only from the configuration, yet two overrides remain in code
(tests use them), and the two first-release variables were never ruled on.

**Option A — configuration only.** None of the four variables is read; tests set the location through the configuration file. No
hidden input changes a command's target; the test helpers change.

**Option B — keep them documented.** `BACKLOG_HOME` and `BACKLOG_ORIGIN_URL` stay documented overrides and `BACKLOG_CLI_BRANCH` names
the branch on a detached HEAD again. Scripts of the first release work, at the cost of inputs the configuration does not show.

**Recommendation: A**, following the configuration-only ruling (label REQ-936).

## Q-13 — Item selectors: may a user name "the item at rank 0" instead of its number?

**Scenario.** A user wants to update the next item without looking up its number. In the first release `backlog set 0 ...` acted on
the item at rank 0; today `backlog update 0 ...` means the item numbered 0 (`❌ item 0 not found`).

**Today.** Absent.

**Why a question.** A convenience of the user commands; no ruling covers it.

**Option A — a `P<n>` selector.** Wherever an item is named, `P0`, `P1`, ... name the item at that rank of the current branch's
queue (`backlog update P0 --note "started"`); numbers stay numbers. One small addition to the selector.

**Option B — not provided.** `backlog next` shows the number to use. No new selector to document.

**Recommendation: A** (label REQ-937).

## Q-14 — `backlog history <n>` of an old item: migrate the old events or explain the gap?

**Scenario.** A user runs `backlog history 4` for an item created before events moved from `backlog.db` into the item files. Today
the command prints nothing at all, although the events exist in the repository history.

**Today.** Silent empty output (code).

**Why a question.** Either the old events are carried over once, or the user is told why the history is empty; both are reasonable.

**Option A — migrate once.** `backlog setup`, when it finds `backlog.db`, copies each item's events into its file and removes the
database in one commit. Old history becomes readable; one more migration to build and test.

**Option B — say so.** `backlog history 4` with no recorded event prints `ℹ️  no events recorded before <date>; older events are in
the repository history`. No migration.

**Recommendation: B** (label REQ-938).

## Q-15 — The update notice after a command at a terminal: how long to wait, when to warn?

**Scenario.** A user runs `backlog list` at a terminal. After the output the CLI waits up to 1.5 seconds for the scheduled release check
and prints a warning on standard error for every failed check, including a timeout on a slow registry and every run from a development
checkout. The check itself repeats after 1 hour following a failure, 24 hours with automatic updates, otherwise 7 days.

**Today.** Code.

**Why a question.** A user-facing comfort feature; an earlier decision on it was withdrawn and nothing re-decided it.

**Option A — wait up to 3 seconds and warn only for real errors.** A timeout or a development checkout stays silent; a registry or
network error is warned; the re-check intervals stay. Fewer false warnings, at most 1.5 seconds more wait.

**Option B — today's behaviour.** 1.5 seconds and a warning for every failure. The check is visible every time it fails.

**Recommendation: A** (label REQ-939).

## Q-16 — `backlog team migrate`: which behaviour file does the running team use afterwards?

**Scenario.** The running team's entry in `teams.json` names no workflow; the team's topology repository keeps its own copy of the
definition under the name `example-team` (identical to the shipped one except that the first review stage is called `local` instead of
`peer`). The owner runs `backlog team migrate` once.

**Today.** Code uses the shipped definition for every team; the copy was never enforced.

**Why a question.** After the migration `backlog team define` refuses to change a team with open items (about 50), so the choice must
be made inside the migration or not at all.

**Option A — the template (`team`).** The migration writes `"workflow": "team"`; the converted `example-team` is registered for teams
defined later; the running team keeps the stage name `peer`. Behaviour stays exactly what the conformance tests prove, with no new
option.

**Option B — the team's own copy.** `backlog team migrate --workflow t1=example-team` sets the entry's workflow in the migration commit;
review records of open items keep lines that say `peer`. The team runs on its named definition, at the cost of a new option and a stage
rename in live data.

**Recommendation: A** (label REQ-016).

## Q-17 — `backlog team migrate`: what happens to items bound to teams that no longer exist?

**ANSWERED: option A, plus a timestamped record in the item body (see 11-owner-answers.md).**

**Scenario.** Twenty item files of the running backlog name seven teams that have no entry in `teams.json` (old proof runs and earlier
teams); seven of them are in `phases/` with status `done`. Today `backlog team update 31 --set-team ""` answers `team <t> is not
configured`, and `backlog update 31` answers that the item belongs to a team, so nothing can unbind them.

**Today.** Code; after the migration no definition gives their words a meaning.

**Why a question.** Either the migration unbinds them or the owner first recreates the seven teams.

**Option A — unbind.** The migration removes `team` from such items, keeps their status as stored and lists each under `unbound (team
<t> has no entry)`. They become user items that every user command can show and archive; which team did the work stays in the body
and the history.

**Option B — abort.** `❌ backlog: 20 items are bound to teams without an entry: ...; define each team and run backlog team migrate
again`. Nothing is lost, but seven dead teams must be defined (each with a lead and members) first.

**Recommendation: A** (label REQ-017).

## Q-18 — `backlog team migrate`: may it rewrite archived items?

**ANSWERED: option B, no rule applies to archived items (see 11-owner-answers.md).**

**Scenario.** Twenty-four archived team items still carry the old fields `stage` and `review_state`. Archived items are read-only, and
after the migration every command that meets old fields stops with "run backlog team migrate".

**Today.** Code translates old fields on every read; that translation is deleted by this plan.

**Why a question.** The read-only rule and migrate-or-fail collide for these files.

**Option A — migrate them.** The migration rewrites their front matter (the body untouched), and the specification names the migration
as the one writer allowed to change an archived item. Every reader keeps working.

**Option B — leave them.** Archived items are shown as stored and exempt from the old-field check. The read-only rule stays absolute;
archived team items show old words for ever.

**Recommendation: A** (label REQ-018).

## Q-19 — Split items without a team: team work or user items?

**ANSWERED: option B, linked to the parent, not bound to its team (see 11-owner-answers.md).**

**Scenario.** A lead split a team item with an earlier build and the slices were created without a team. Today `backlog team pop`
offers such a slice to the session's team and the slice joins the team when a member claims it; 35 such slices sit in `phases/`.

**Today.** Code (the queue and the claim join the slice to the team).

**Why a question.** In the new design team commands act only on items bound to a team, so these slices either get bound or become user
items.

**Option A — bind them.** The migration binds every teamless slice whose parent is bound to the parent's team, and `backlog team new
--split-from` always binds a slice. The team keeps working them as today.

**Option B — user items.** They stay outside the team; a lead binds one with `--set-team` when the team should work it. The team's
queue no longer shows them until bound.

**Recommendation: A** (label REQ-019).

## Q-20 — `backlog team workflow --file`: may a definition in use be upgraded?

**Scenario.** After the migration the owner fixes a text in the template and runs `backlog team workflow --file team.json`. Today the
answer is `❌ backlog: workflow team is used by teams with 50 open items; register the new flow under another name`, and the running
team can only move to the new name once it has no open item.

**Today.** Code (the refusal).

**Why a question.** Without an upgrade path a fix found later can never reach a running team.

**Option A — compatible upgrades.** The registration is accepted when every status word that open items carry, and every review stage
they are in, still exists in the new definition; otherwise the refusal names the missing words. Fixes reach running teams.

**Option B — never.** Today's refusal stays; a new definition is registered under a new name and teams move when idle.

**Recommendation: A** (label REQ-020).
