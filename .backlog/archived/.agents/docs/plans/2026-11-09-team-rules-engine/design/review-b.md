# Review B — completeness against the real code and data, and implementability

Context: this is an independent review of the team rules engine design in this folder (chapters 01 to 08, `decisions.md`,
`examples/`, `rule-cases.json`, `coverage.tsv`, `evaluator-spike/`), made on a detached worktree of commit 74da886. The binding inputs
are `../00-owner-rulings.md` (R1 to R13), `../01-command-behaviour-matrix.md` and `../reference/`. The angle is: does the design carry
every behaviour of today's code, does the markdown-to-JSON mapping hold on the real backlog, can it be built as written, and are the
owner decisions the right ones. Every finding cites a file and line; counts over the backlog repository are read-only counts (no item
content, team name, agent name or folder name is copied here).

Method, so the findings can be re-run:
- Code: read `src/team/*.js` (all 15 files) and the user-command paths in `src/shared/*.js` (update, plain-step, new, done, move,
  archive, clean, import/sequence, query/read, index, store, sync, seen, wip-limits, dependencies, team-items). 74 behaviours were
  sampled from the code directly (section 3), then looked up in the chapter text and the example rule sets; `coverage.tsv` was consulted
  only afterwards, to see whether a miss was recorded.
- Data: every `.md` file under `phases/` and `archive/` of the backlog repository at its HEAD (08d170f), parsed with the CLI's own
  reader `src/shared/frontmatter.js` (the reader the migration keeps), plus `index.json` of each folder and `git log` of deleted item
  files.
- Spike: `node --test evaluator.test.mjs` on Node 22.22.1: 192 tests, 192 pass.

Severity: **High** = a behaviour, data or contract is lost or undefined in a way that changes what agents or users get, or the design
cannot be tested as written. **Medium** = wrong or incomplete statement with a contained effect. **Low** = wording, precision, or a
small gap.

Counts: 6 High, 14 Medium, 9 Low.

---

## 1. Findings, ranked

### High

**H1. Any session can act as any person, the lead included: the impersonation guard is dropped without a record.**
- Today: a team session whose BACKLOG_AGENT is set is refused when it names another agent:
  `src/team/pop.js:58` (`you are <me> (BACKLOG_AGENT): team pop answers only for yourself`), `src/team/lifecycle.js:460`
  (`a member acts only as itself, not as <as>`), `src/team/update.js:299` (same for `--wip-override`).
- Design: `01-team-file.md:84` resolves the agent as `--agent`, else BACKLOG_AGENT; the only coded check is "the agent is a key of
  `people`" (`01-team-file.md:59-60`, `04-team-commands.md:76`). A member whose session sets BACKLOG_AGENT=member-1 can run
  `backlog team update 42 abandon --agent lead-1 --reason x` and every `$caller.roles` guard of the rule set (lead-only split, lead-only
  archive, lead-only verdict past the round cap) is bypassed. `coverage.tsv` marks INV-738, INV-739 and INV-780 BAKE-IN to
  "the caller is the one agent input; no acting-as flag", a target that does not carry the check.
- Fix: a coded check in chapter 01 section 5: when BACKLOG_AGENT is set and `--agent` names someone else, exit 2
  `❌ backlog: you are <BACKLOG_AGENT> (BACKLOG_AGENT); a team command acts only as its own agent, not as <--agent>`; add a COD case. R3b
  fixes the order of the inputs, not whether a mismatch is refused, so this is a genuine owner choice if the designer prefers to drop it
  (listed in section 6 as missing decision 1).

**H2. Two agents writing the same item at once have no defined outcome, and the JSON layout guarantees the conflict.**
- `04-team-commands.md:86-94` keeps today's machinery "unchanged" including DI-STALE (the stale-view guard, exit 5), and adds "evaluate
  the same step again on the rebased items; refused → exit 1". The coverage rows for `src/shared/seen.js:15-126` confirm the stale
  guard stays for team commands. Today, a concurrent edit of the same item is never rebased: `src/shared/sync.js:262` refuses it
  ("a real edit of one item by both clones cannot be merged") and `staleCheck` (`src/shared/sync.js:452-462`) turns it into exit 5
  before any re-check. So for "member-1 and member-2 claim item 42 at once", the design allows two different expected results for
  member-2 (exit 5 from the stale guard, or exit 1 from the re-evaluation), and pop's "choose again, at most three times"
  (`04-team-commands.md:55-56`) is defined only for a refusal, not for exit 5.
- `02-item-definition-and-json-item.md:85-87` claims the fixed key order lets "git merge changes to different fields". It cannot:
  every write changes `updated` and `updated_by` (adjacent lines) and appends one history line after the same last line (and adds a
  comma to the line before), so any two writes to one item always conflict. The same holds for a parent changed by two `new-child`
  steps (`related` effect) and for `numbers.json`.
- No rule case and no named BDD scenario covers a concurrent write to one item (`05-numbering-and-index.md:63-67` lists four
  scenarios, none of them this).
- Fix: specify the sequence as "on any conflict in a file the step writes: drop the local commit, reset to upstream, re-run the whole
  evaluation on the fresh files; exit 1 if the table now refuses, else write and push", state whether the stale guard (exit 5) still
  runs first for team commands, correct the merge claim of 2.4, and add BDD scenarios: two claims of one item, two children added to one
  parent, two claims that together exceed a team limit, two creations at once.

**H3. The migration loses the queue order of every folder without `index.json`.**
- `02-item-definition-and-json-item.md:169` and `06-migration.md:40` drop `priority` because "the index, seeded before by today's code,
  already holds the order". In the real backlog, 6 of the 9 folders that hold items have no `index.json`; their 85 open items carry
  their order only in `priority` (today `src/shared/index.js:54-58` orders such a folder by that field). Step 6 of
  `06-migration.md:34-35` "rewrites the index with the same order" — there is none to rewrite.
- Fix: step 4 of the migration builds the index of a folder without one from `priority` with today's `src/shared/index.js` logic,
  before the key is dropped; add the BDD scenario "a folder without an index keeps its priority order".

**H4. Items without a team lose their holder: the claim field is renamed without a mapping.**
- Today `backlog update <item> --claim <agent>` writes `claimed_by` and `claimed_at` (`src/shared/plain-step.js:39`; `backlog new`
  seeds them, `src/shared/new.js:191`). The built-in user definition of `02-item-definition-and-json-item.md:144` writes `owner` and
  `owned_since` instead, and the mapping (`:172`) copies `claimed_by` unchanged into `fields` as an undeclared field. Real backlog:
  177 items without a team have a non-empty `claimed_by` (141 of them open); 1 has `owner`. After the migration `backlog list` and
  `backlog show` would report 141 open items as held by nobody. (`src/shared/fields.js:21` already documents `owner` for the claim,
  a doc/code mismatch today; the design followed the doc, not the code.)
- Fix: for items without a team, map `claimed_by` → `fields.owner` and `claimed_at` → `fields.owned_since` when the target is empty, or
  keep the code's names in the built-in definition; say which in chapter 02 section 4.

**H5. The cut-over of the one existing team is undefined: 60 open team items become reachable by no command.**
- The real `teams.json` holds one entry in today's shape (`lead`, `members`, `external_reviewers`, `review`), with 69 bound items
  (60 open). The migration reads only team names (`06-migration.md:27-28`), so those items stay bound. Afterwards every team command
  checks the entry against chapter 08 and stops with exit 2 (`01-team-file.md:70-72`), and R3a hides the items from every user command.
  `backlog team validate` cannot be run before the migration because "the next command of any kind" stops with the migrate text
  (`06-migration.md:10-11`), so the owner cannot prepare and check the new entry first.
- The new entry must also give a meaning to today's states: the 60 open items carry 9 distinct combinations of `status`, `stage`,
  `review_state` (for example status `pending` with stage `refined`), and dependency edges whose acceptance lives in `handoffs` /
  `handoff_receipts` lists of JSON-encoded strings; with the `claim-inputs-accepted` pattern every such dependency blocks until a lead
  re-accepts it, because today's "legacy" edge (a done producer without a `handoffs` key satisfies the edge, `src/team/team.js:64-71`)
  has no counterpart.
- Fix: a cut-over section in chapter 06: `backlog team validate` checks the file alone (sections 3 to 6 of chapter 08) on a markdown
  backlog; `backlog team migrate --dry-run` lists every entry not in the new shape and every open bound item whose status value the
  new definition does not declare; the order is "write and validate the new entry, migrate, run the team's own `set-status-lead` steps
  for the combinations listed by the dry run". Whether migrate refuses while an entry with open items fails validation is a genuine
  owner choice (section 6, missing decision 4).

**H6. Coverage rows claim behaviours are carried by rules that do not carry them (lost without a recorded reason).**
The reference README makes every inventory row end as a rule, a field, a command or a recorded drop. These rows are marked BAKE-IN or
LAZY-LOAD to a target that does not hold the behaviour; several cannot be written in the language at all:

| today (file:line) | behaviour | coverage target | why it is not carried |
|---|---|---|---|
| `src/team/lifecycle.js:280-299` | passes count only on the item's current work commit; new commits whose subject starts with the item number after the review request fail the close, a failed git lookup fails closed | `patterns/close-passes`, `patterns/review-own-session` (INV-676..682) | `close-passes` counts a number; no rule reads git history, `$session.commit` is HEAD only |
| `src/team/lifecycle.js:350` | review comments must cite one of the item's review documents | `parallel/check-*`, `scrum/review-*` (INV-704) | no test "text contains any entry of a list" (regex takes a literal pattern) |
| `src/team/handoff-commands.js:82-97` | the lead rejects a hand-off with a reason | `patterns/accept-input*` | no reject step exists in `examples/patterns.json` |
| `src/team/handoff-commands.js:62,64` | a hand-off is accepted only after the producer's review passed and only with a commit on record | `patterns/accept-input*` | `accept-input` checks the role and the record only |
| `src/team/handoff.js:17-20,70-71` | the receipt pins a sha256 digest of the record; a changed or broken record is stale | none (not in `reference/inventory.tsv`) | no hash in the language; not recorded anywhere |
| `src/team/lifecycle.js:42-56` | estimate from a body line `ESTIMATE: <n>`, definition of done from a body heading | `parallel/new-needs-estimate` (INV-588..591) | rules cannot read the body; real data: 144 bodies carry `ESTIMATE:`, 841 a definition-of-done heading; the migration extracts neither |
| `src/team/pop.js:63-66` | a failed synchronisation in pop is exit 1, never idle | "publication; evaluated again" (INV-784) | chapter 04 makes exit 3 both idle and sync failure (M1) |
| `src/team/pop.js:153` | pop on a detached HEAD: exit 2, check out a branch or set TEAM_BRANCH | `parallel/lead-splits` (INV-798) | unrelated target; chapter 01 does not say what a detached HEAD gives |
| `src/team/queue.js:215-221`, `src/team/views.js:25-44` | chunk work: items of other repository folders offered by `backlog.scope` (off/branch/repo/all), and an item-less "do one small chunk" action | "the pop table", `patterns/scope-branch` (INV-858, INV-982) | a pop entry needs an item of the session's folder; `scope-branch` is the TEAM_BRANCH binding, not the chunk scope |

Fix: for each row either add the missing language piece (for example a `contains_any` test, foreign item references) or turn the row
into SKIP with the reason, and regenerate `coverage-counts.tsv`. I did not audit all 1986 rows; these were found by sampling, so a
systematic pass over the LAZY-LOAD and "example:" targets is worth doing.

### Medium

**M1. `backlog team pop` exit 3 would mean both idle and failure.** `04-team-commands.md:96-97` lists exit 3 as "idle (pop) or a
synchronisation failure"; chapter 07 tells skills that exit 3 is idle (`07-skills.md:131`), and consumer row CON-05 relies on it.
Today pop maps every failure to exit 1 on purpose (`src/team/pop.js:63-66`). Fix: pop returns exit 1 for a synchronisation failure.

**M2. `$team.items` spans folders but numbers do not.** `03-rule-language.md:94` defines `$team.items` over every repository folder;
numbers are per folder (`05-numbering-and-index.md:13`), and `every`/`some`/`count`/`related` resolve an item by its number alone
(spike `evaluator-spike/evaluator.mjs:44`). Two folders' item 12 are indistinguishable; the team queue meanwhile is the session's folder
only (`05-numbering-and-index.md:53-55`). Real data has no team spanning folders today, so the fix is cheap: define `$team.items` as the
session's folder (or qualify references as `owner/name#seq`).

**M3. Foreign dependencies read as missing items.** The `items` type accepts `owner/name#seq` (`02-item-definition-and-json-item.md:126`),
but the language resolves only numbers (`03-rule-language.md:112-113`); the spike gives `NaN`, a missing item, which "reads as an item with
no fields" (`:77-78`), so `parallel/claim-dependencies` refuses such a claim for ever. Today the foreign item's status is checked
(`src/team/update.js:268-270`). Real data: 11 foreign `depends_on` entries. Fix: resolve foreign references in the evaluator (read-only),
plus a case.

**M4. References between user items and team items are undefined under R3a.** Real data: 7 open items without a team depend on a team
item, 12 items without a team (5 open) were split from a team item and would get a team item as `fields.parent`
(`06-migration.md:71-73`), and 16 team items depend on items without a team. The `item`/`items` type checks "the item exists"
(`02-item-definition-and-json-item.md:125-126`) while R3a says a team item's number "answers as if no such item existed". Either every
write of those user items fails with `no item <n>` (exit 2), or user commands see team items after all. Today `backlog move`
(`src/shared/move.js:125-128,153-163`) and `backlog update --seq` (`src/shared/update.js:248`) refuse when another item depends on the
one they renumber, and `backlog clean` refused whenever team items existed (`src/shared/clean.js:35-42`); with team items invisible these
either reveal team items in their refusal or leave team items pointing at a number that no longer exists. Owner choice (section 6,
missing decision 3).

**M5. `backlog done` would write `closed`; today it writes `done`.** `02-item-definition-and-json-item.md:141` versus
`src/shared/done.js:10` (`--status done`). D-33 keeps the default words; 227 open items without a team carry `done`. Fix: `done`.

**M6. Missing envelope values are not mapped.** 656 files have neither `updated_by` nor `last_updated_by`; 3 have no `created`.
`02-item-definition-and-json-item.md:89-90` makes an envelope key of the wrong type an unreadable item (exit 2 for the whole folder).
Fix: say that an absent envelope value becomes `""` (text) or `null` (time) and that both are valid.

**M7. The migration rewrites 13 archived items although archived items keep "keys and values unchanged".** `06-migration.md:57-59`
unbinds open and archived items alike (appends a body record, removes `team`); `06-migration.md:64-66` keeps archived keys and values
unchanged, and Q-18 B kept archived items read-only. Of the 20 files bound to a team without an entry, 13 are archived. Fix: say which
applies to those 13 (owner word, since Q-17 A and Q-18 B collide here).

**M8. Two data claims of chapter 06 are wrong.** "378 archived files" (`06-migration.md:67`): the backlog holds 373 (no archived file
was added or removed since 2026-11-08, so it is not drift). "Archived files with old keys" (`06-migration.md:61-66`): the older keys
`title`, `last_updated`, `last_updated_by`, `completed_at` occur in 2, 2, 2 and 1 files, all open, none archived; archived files differ
only by carrying `stage` and `review_state` (19 with `stage`). The mapping of those keys is right; the section's premise is not.

**M9. Counter seeding of folders with no items left.** `05-numbering-and-index.md:33-37` seeds `numbers.json` "when migrate writes it"
and starts a folder without one at 0. 9 folders have no item file but deleted item files in history (highest deleted number up to 900);
one folder with items has 14 as its highest present number and 250 as its highest deleted one. Fix: migrate writes `numbers.json` for
every folder that has an item file in its git history, not only for folders it converts.

**M10. Index status words change for most entries.** Today the index `status` is a computed workflow word, not the stored status: in the
largest indexed folder 121 of 128 entries differ (stored `done` → index `closed`, stored `pending` → `refined`, `ready`, ...). The design
writes the stored value (`05-numbering-and-index.md:41-44`) and admits "only the status copies may change" (`06-migration.md:35`). Not
wrong, but the migration summary should count it and chapter 06 should say that `backlog list` will show `done` where it showed `closed`.

**M11. Renumbering must remap references in team-defined fields.** `05-numbering-and-index.md:28-30` says the renumbered item's
"references ... follow it". For a team item the referencing fields are whatever the team declared as `item`/`items` (`children`,
`accepted_inputs`, `handoff_to`, ...), in other items, possibly items the committing agent's rule did not touch. Today's `remapLocal`
(`src/shared/sync.js:183`) knows `depends_on` and the body only. Fix: state that the remap walks every `item`/`items` field by the
owning team's definition, with a scenario.

**M12. `delete`, `clean` and `archive` leave references that later block writes.** After the `delete` effect or `backlog clean`, items
that name the removed number fail the "item exists" check of their next write (exit 2), and only a rule that rewrites the field can fix a
team item. Fix: define that a removed number reads as a missing item and passes the reference check, or refuse `delete` while referenced.

**M13. Decision 2 is probably a consequence, not a choice.** `decisions.md:57-61` cites the owner's standing command shape
("one behaviour per command; an option that is not required data is a subcommand", `reference/09-gap-resolution.md:35`) as the reason for
option A. If that rule binds the CLI (the owner wrote it), the step-as-word form follows from it and should be recorded as a design choice
with its logic, not asked again (owner preference: consequences of an already-set pattern are not decisions).

**M14. Decision 1 leaves out an option.** `decisions.md:5-37` offers "validate and migrate take no team" or "every team command needs a
team". A third option removes the conflict for migrate instead of bending R3b: a one-shot top-level `backlog migrate` beside
`backlog upgrade`, which belongs to neither group (the matrix already has such a group). It also fixes the oddity that a user who never
uses teams is told to run a `backlog team` command (`06-migration.md:11`). Placing it under `backlog team` follows from R3a (a user command
may not change a team item); the decision should say so, since that is why option C is not obvious.

### Low

- **L1.** One item without a team has two `Split from` lines naming different items; `06-migration.md:71` speaks of "the line". Say the
  first wins and the summary lists the item. (Two further bodies mention "Split from" in prose without a backticked slug and are rightly
  ignored.)
- **L2.** The `note` effect's text is one value (`03-rule-language.md:139`); texts cannot be composed, so today's claim record
  `Claimed by <a> at <t> repository=<r> branch=<b> cwd=<d>` (`src/team/lifecycle.js:111`) cannot be reproduced. Placeholders as in
  `deny` texts would close it.
- **L3.** TEAM_REPOSITORY's format check (`src/team/team.js:44`, exit 2 for a value not `owner/name`) and the meaning of a detached HEAD for
  `--branch`'s default are not stated in `01-team-file.md:86-87`.
- **L4.** `src/team/pop.js:56` refuses a `--team` that differs from TEAM_NAME; the design takes the flag silently. Record it as a drop.
- **L5.** pop's text output (today the item's header and body after the action, `src/team/pop.js:117-128`) is not specified; only `--json` is.
- **L6.** `02-item-definition-and-json-item.md:80` says `backlog history <item>` prints a team item's history; under R3a it must answer
  "no item" for a team item (the general sentence of `04-team-commands.md:108` covers it; this line contradicts it).
- **L7.** "The body is copied byte for byte" (`06-migration.md:39`) holds for this backlog (no BOM, no CR line ends in any of the 882 files),
  but the kept reader normalises both (`src/shared/frontmatter.js:28`); say "byte for byte after the reader's BOM and line-end normalisation".
- **L8.** `03-rule-language.md:229` gives the spike as 252 lines; 12 of them are over 200 characters (up to 298). Fine as a spike, but
  not a size estimate for the implementation (files, git, journal, index, counter, history, migration and the ~40 validate checks are
  outside it).
- **L9.** `decisions.md` explains option behaviour with case labels (COD-14, COD-15) next to the text; acceptable as labels, but the owner
  reads only the text, so keep every such sentence self-contained.

---

## 2. Implementability

- **The evaluator** can be written to chapter 03 as specified: the spike implements references, tests, functions, the first-match table
  with deny default, effects with typing, `new`, `pop`, filters and the exercised validate checks; 192 of 192 tests pass. The routing
  table precedence and the shadowing check are well defined and testable.
- **Rules that need state the item or the team file does not carry** (each is either a language gap or must be recorded as a drop):
  1. git history after the review request (H6, row 1);
  2. the item body (estimate and definition of done, H6; the language has no `$item.body`);
  3. items of another repository folder (M2, M3; chunk scope in H6);
  4. a digest of a record (H6);
  5. another team's people (today's refinement review "by a member of team X", `src/team/lifecycle.js:163`; expressible only by copying
     those persons into this team's `people`, which the design should say).
- **Concurrency**: not testable as written (H2). The counter conflict is defined (`05-numbering-and-index.md:24-30`) but needs today's
  `repairConflicts` (`src/shared/sync.js:253-300`) to accept a `numbers.json` conflict, which it refuses now (any non-item, non-index
  conflict returns false); say so in chapter 05 as a code change.
- **Validate before migration** (H5) and **identity** (H1) are the two machinery pieces I would add before implementation starts.

---

## 3. Sampled behaviours of today's code (74), and where the design carries them

Verdict: **C** carried (rule, field, command or coded check); **P** carried as a pattern or expressible with the language as shown;
**D** dropped with a recorded reason; **M** missed (not carried, no recorded reason); **X** coverage names a target that does not carry it.

| # | today | behaviour | verdict | where |
|---|---|---|---|---|
| 1 | src/team/cli.js:41 | no team: refusal | C | ch01 s5, COD-01 |
| 2 | src/team/cli.js:40,42 | agent falls back to the configuration's `user` | D | R3b, ch01 s5 |
| 3 | src/team/cli.js:85 | unknown team subcommand: exit 2 listing the subcommands | M (low) | not restated for the new set |
| 4 | src/team/cli.js:57,97 | team without entry: refusal, exit 1 | C | ch01 s4.3 |
| 5 | src/team/cli.js:138-157 | define: validate, refuse a change while the team has open items | D | R5; replaced by ch08 s7 |
| 6 | src/team/cli.js:176 | `team workflow --show <name>` | D | replaced by `query rules` |
| 7 | src/team/cli.js:46-54 | bare `--claim`/`--release` takes the agent | D | steps replace flags (ch04 s1) |
| 8 | src/team/cli.js:75 | `--by` defaults to the agent | D | ch04 s1 |
| 9 | src/team/team.js:21 | TEAM_LEAD overrides the lead | D | INV-781 recorded |
| 10 | src/team/team.js:44 | TEAM_REPOSITORY must be owner/name | M (low) | L3 |
| 11 | src/team/team.js:49-50 | branch: TEAM_BRANCH else git branch, detached gives none | M (low) | L3 |
| 12 | src/team/team.js:55-56 | a session bound to repository and branch refuses other items | C / P | folder: ch04 s3.1; branch: `scope-branch` |
| 13 | src/team/team.js:101 | unreadable teams.json read as empty with a warning | C (changed) | ch01 s4.2, exit 2 |
| 14 | src/team/team.js:113 | review-only members are never offered a claim | P | role in a pop `when` |
| 15 | src/team/team.js:129 | the claimer, the review author and every earlier session never review | P | `review-own-session` |
| 16 | src/team/team.js:134-141 | `worker:N` sessions continue each other's items | D | recorded (BACKLOG_SESSION) |
| 17 | src/team/team.js:147 | BACKLOG_REVIEW_STALE_SECONDS | D | literal in the rule, recorded |
| 18 | src/team/team.js:152 | a stale review is handed on by the lead, not taken by a member | P | `take-over-stale-review` |
| 19 | src/team/team.js:64-71 | a done producer without hand-off records satisfies the edge (legacy) | M | H5 |
| 20 | src/team/handoff.js:17-20,70-71 | digest pinning of hand-off records | M | H6 |
| 21 | src/team/team.js:192-225 | team definition validation | C | ch08 |
| 22 | src/team/lifecycle.js:69 | a finished item is not claimed | C | `claim-not-ready` |
| 23 | src/team/lifecycle.js:78 | item of another team | C | ch04 s5, PAR-46 |
| 24 | src/team/lifecycle.js:81 | the lead never claims | C | `claim-lead` |
| 25 | src/team/lifecycle.js:93 | claimed only when refined (stage ready) | C | `claim-not-ready` |
| 26 | src/team/lifecycle.js:98 | claimed by another: refusal | C | status guard |
| 27 | src/team/lifecycle.js:100 | dependencies not done, local and foreign | C local / M foreign | M3 |
| 28 | src/team/lifecycle.js:102 | one active item per agent, `--force` overrides | P | `claim-limit-person`, `lift-limit` |
| 29 | src/team/lifecycle.js:104 | work-in-progress limit at claim | P | `claim-limit-team` |
| 30 | src/team/lifecycle.js:111 | claim record with repository, branch, cwd | M (low) | L2 |
| 31 | src/team/lifecycle.js:119-137 | refine-start: a member first, refiner busy, limit | P | status-based rules |
| 32 | src/team/lifecycle.js:143 | refine-done needs a note | P | note-guard shape |
| 33 | src/team/lifecycle.js:150 | only the lead requests the refinement review | P | role guard |
| 34 | src/team/lifecycle.js:163 | refinement reviewed by a member of another team | P (partial) | section 2, item 5 |
| 35 | src/team/lifecycle.js:179-184 | decision asked only before ready, with a question | P | `ask-decision` |
| 36 | src/team/lifecycle.js:188-197 | the owner's decision returns the item, never refused | P | `decide` |
| 37 | src/team/lifecycle.js:203 | release only by the holder | C | `release-who` |
| 38 | src/team/lifecycle.js:209 | the lead releases another's item only with a reason | P (reason not required in example) | `release-who` |
| 39 | src/team/lifecycle.js:218-229 | reassign by the lead with a reason | P | `reassign` |
| 40 | src/team/lifecycle.js:234-241 | reassign a review to a named agent, not the author | P (partial) | `take-over-stale-review` clears only |
| 41 | src/team/lifecycle.js:280-299 | passes on the current work commit; later own work fails closed | X | H6 |
| 42 | src/team/lifecycle.js:305 | review request needs a note | C | `hand-to-check-note` |
| 43 | src/team/lifecycle.js:306 | a review in progress blocks a new request | C | status guard |
| 44 | src/team/lifecycle.js:311-312 | only the holder or the lead asks for review | C | `hand-to-check-holder` |
| 45 | src/team/lifecycle.js:331,347 | no self-review | C | `check-not-own` |
| 46 | src/team/lifecycle.js:350 | comments cite a review document | X | H6 |
| 47 | src/team/lifecycle.js:359 | no review in the author's session | C | `review-own-session` |
| 48 | src/team/lifecycle.js:366 | a reject clears every pass of both stages | P | `review-reject` sets passes 0 |
| 49 | src/team/lifecycle.js:378 | waiting only by the holder | P | `wait` |
| 50 | src/team/update.js:330-333 | the holder's next step ends its wait automatically | P (not shown) | add `wait_on: ""` to those steps |
| 51 | src/team/lifecycle.js:390 | close needs a summary | P (not shown) | parallel `close` takes none |
| 52 | src/team/lifecycle.js:393 | owner close needs a reason | P | role-based rule |
| 53 | src/team/lifecycle.js:397-398 | the claimer closes, else the lead | C | `close-holder` |
| 54 | src/team/lifecycle.js:450 | one step per command | C | ch04 s1 |
| 55 | src/team/lifecycle.js:460 | a member acts only as itself | X | H1 |
| 56 | src/team/lifecycle.js:492,515 | before ready only refinement steps; incomplete items not worked | P | status guards |
| 57 | src/team/lifecycle.js:564 | END THE SESSION NOW line after hand-off, reject, close (not the lead) | P | `say` |
| 58 | src/team/lifecycle.js:567 | NEXT / CLOSE NOW after a passing review | P | `say` |
| 59 | src/team/handoff-close.js:21 | close refused while a dependent edge is open, with the next command per edge | P | `close-dependents-accepted` |
| 60 | src/team/handoff-commands.js:62,64 | accept only after the producer's review passed, with a commit | X | H6 |
| 61 | src/team/handoff-commands.js:82-97 | the lead rejects a hand-off | X | H6 |
| 62 | src/team/pop.js:56 | `--team` differing from TEAM_NAME refused | M (low) | L4 |
| 63 | src/team/pop.js:58 | `--agent` differing from BACKLOG_AGENT refused | X | H1 |
| 64 | src/team/pop.js:63-66 | sync failure exit 1, never idle | X | M1 |
| 65 | src/team/pop.js:89,112,194 | item taken meanwhile: pop chooses again, 3 attempts | C | ch04 s4 |
| 66 | src/team/pop.js:153 | detached HEAD refused | X | H6, L3 |
| 67 | src/team/queue.js:215-221 | chunk work and the item-less chunk action | X | H6 |
| 68 | src/team/update.js:297-304 | the lead lifts a limit for an item with a reason | P | `lift-limit` |
| 69 | src/team/update.js:306-313 | an item in a stage keeps a team; joining a team in progress within its limit | P | `adopt` plus guards |
| 70 | src/team/update.js:267-280 | claim re-checked against the merged files | C | ch04 s6 |
| 71 | src/shared/plain-step.js:39 | user claim writes `claimed_by`, `claimed_at`, `in progress` | X | H4 |
| 72 | src/shared/done.js:10 | `backlog done` writes `done` | M | M5 |
| 73 | src/shared/index.js:54-58 | a folder without an index is ordered by `priority` | M | H3 |
| 74 | src/shared/move.js:125-163, update.js:248, clean.js:35-42 | move, renumber and clean refuse when another item depends on the item | M | M4 |

Totals by first verdict: C 21, P 25, D 8, M 10, X 10 (row 12 is also P, row 27 is also M). Missed or mis-attributed: rows 3, 10, 11, 19, 20, 27 (foreign), 30,
41, 46, 55, 60, 61, 62, 63, 64, 66, 67, 71, 72, 73, 74.

---

## 4. Migration verification (chapter 06 and chapter 02 section 5) against the backlog repository

| claim or check | design | measured | result |
|---|---|---|---|
| item files under `phases/` and `archive/` | 882 | 882 (all `.md`) | holds |
| readable by today's reader | all | 882 of 882, 0 errors, 0 files without a header | holds |
| distinct header keys | 60 | 60 | holds |
| archived files | 378 | 373 (unchanged since 2026-11-08) | wrong (M8) |
| files bound to a team without an entry | 20 files, 7 teams | 20 files, 7 teams (7 open, 13 archived) | holds; the 13 archived conflict with s4.2 (M7) |
| files bound to the team with an entry | — | 69 (60 open) | not addressed (H5) |
| archived files with `title`/`last_updated`/`last_updated_by`/`completed_at` | the premise of s4.2 | 0 archived; 2/2/2/1 open | premise wrong (M8); mapping right |
| `title` without `name` | mapped | 2, never both | holds |
| `updated` and `last_updated` both | newer wins | 0 both | holds |
| `completed_at` and `completed` both | — | 0 both | holds |
| absent `created` | — | 3 | unmapped (M6) |
| absent `updated_by` and `last_updated_by` | — | 656 | unmapped (M6) |
| `phase` equals the file name; `seq` equals its number; `repository` equals the folder | — | 0 mismatches each | holds |
| two files with one number in a folder | stops the migration | 0 | holds |
| `depends_on` element kinds | numbers, slugs, foreign, `none` | 488 numbers, 11 foreign, 0 slugs, 0 `none`, 0 dangling | holds; foreign refs not evaluable (M3) |
| `events` lines | `<time> <event> <branch> <commit> <note>` | 4 files, format confirmed | holds |
| `handoffs`, `handoff_receipts` | copied | 16 and 14 files; lists of JSON-encoded strings | preserved as `list`; meaning lost (H5) |
| multi-line values | YAML meaning kept | 19 `summary` values with newlines; 0 list entries | holds |
| BOM / CR line ends | body byte for byte | 0 / 0; 879 files with non-ASCII UTF-8 | holds on this data (L7) |
| `priority` dropped, order in the index | index seeded | 6 of 9 folders with items have no index (85 open items) | order lost (H3) |
| index covers every open item | — | 3 indexed folders: 424 of 424 open items, 0 extra, 0 branch mismatch | holds |
| index status equals stored status | "only the status copies may change" | 307 of 424 entries differ | changes (M10) |
| teamless items with `claimed_by` | copied as undeclared | 177 (141 open); `owner` on 1 | holder lost (H4) |
| teamless split items (`Split from` + slug) | parent number | 84 (40 open); 0 dangling slugs; 1 with two lines; 12 whose parent is a team item | holds except L1 and M4 |
| user/team cross-references | — | 7 user→team dependencies, 16 team→user, 12 user splits of team items | undefined (M4) |
| deleted numbers above the highest present | counter seeding | 1 folder with items (14 present, 250 deleted); 9 empty folders with deleted numbers | seeding needed, empty folders unspecified (M9) |
| definition of done / estimate in the body | — | 841 / 144 bodies | not extracted (H6) |
| symbolic links in item folders | stop | 0 | holds |

Keys present in the data, all of which the mapping routes (envelope, named field, drop, or copied as is): `author_session`, `branch`,
`chunk`, `claimed_at`, `claimed_by`, two `*_pass_commit` keys, `commit`, `completed`, `completed_at`, `complexity`, `created`,
`decided_at`, `decision_question`, `decision_requested_at`, `decision_requested_by`, `depends_on`, `estimate_min`, `events`,
`handoff_receipts`, `handoffs`, `last_updated`, `last_updated_by`, `layer`, `location`, `name`, `objective`, `owned_since`, `owner`,
`phase`, `priority`, `refine_started`, `refined_at`, `refinement_codex_limit`, `refinement_review_requested_at`,
`refinement_reviewed_at`, `refinement_reviewed_by`, `refiner`, `repository`, `review_author`, `review_refs`, `review_requested_at`,
`review_started`, `review_state`, `reviewed_at`, `reviewer`, `seq`, `session_authors`, `severity`, `stage`, `status`, `summary`, `team`,
`title`, `updated`, `updated_by`, `wait_on`, `wait_since`, `work_branch`, `work_commit`. No key is lost; the losses are of meaning
(H3, H4, H5) and of envelope values (M6). `work_class` and `review_classes` named in the mapping do not occur.

---

## 5. User commands and team items (R3a), command by command

| command / path | today with a team item | design | verdict |
|---|---|---|---|
| `backlog list` (all words, `--json`, `list branches` counts) | lists them | filtered first (`04-team-commands.md:108`, ch05 s4) | covered |
| `backlog next` | may pick one | filtered (ch05 s4) | covered |
| `backlog show <n>` | shows it | `❌ no phase '<n>'` (COD-06) | covered |
| `backlog update <n> ...` | refused (`src/shared/update.js:218`) | answers as no item (general rule) | covered |
| `backlog update --replan` / `--priority` | refused (`update.js:193-195`) | user entries reordered among user positions (ch05 s4) | covered |
| `backlog update <n> --seq` | refused when dependents exist (`update.js:248`) | counter rule only | gap with team dependents (M4) |
| `backlog done` | refused via update | via update; but writes `closed` | M5 |
| `backlog new --depends-on <team item>` / `--split-from <team item>` | split refused (`src/shared/new.js:170`) | "no item" by the general rule (not written out) | covered, say it |
| `backlog move` (branch / folder) | moves team items; refuses with dependents (`move.js:125-163`) | never selects them; counter on folder moves | gap with team dependents (M4) |
| `backlog archive` | refused for open team items (`archive.js:99`) | never selects them | covered |
| `backlog import [--higher]` | `--higher` refused (`sequence.js:50-54`) | never selects them | covered |
| `backlog clean [all-branches]` | refused if any team item (`clean.js:35-42`) | removes only user items | covered; dangling refs (M4, M12) |
| `backlog history [<n>]` | events of every item (`src/shared/query.js:262-265`) | general filter; but ch02 s2.3 says it prints a team item's history | L6 |
| `backlog changes` | seen-view changes of every item | general filter (not named) | covered by the general sentence, name it |
| numbering | `nextSeq` over files present | one shared counter per folder (ch05 s2) | covered |
| index | one list per branch | user queue = entries without a team; places kept (ch05 s4) | covered |

---

## 6. `decisions.md`

- **Decision 1 (do validate and migrate need a team)** is a genuine owner choice: R3b, read literally, stops every `backlog team`
  command without a team, while R11 and R4 make validate and migrate whole-file and whole-backlog operations. The implementation
  pattern (dispatch order in `src/team/cli.js`) is correct and complete for options A and B. Missing: option C (a top-level
  `backlog migrate`, M14) and the reason migrate sits under `backlog team` at all (R3a).
- **Decision 2 (command line of a step)** cites an owner rule that already fixes the shape (M13); unless the designer shows that rule does
  not bind here, it should become a recorded design choice. The pattern (argument derivation from `$arg` references, refusal texts) is
  complete and matches `03-rule-language.md:97-100` and the spike's `stepArgs`.
- **Genuine owner choices missing from the file** (each needs the problem, the options and the implementation pattern in the file's
  format):
  1. Whether a team command refuses `--agent` when BACKLOG_AGENT names someone else (H1). R3b fixes only the order of the inputs.
  2. What a team command gives when another agent changed the same item meanwhile: the stale-read refusal (exit 5, today) or a
     re-evaluation (exit 0 or 1, the design) (H2). The matrix fixes this only for user commands.
  3. References between user items and team items under R3a (M4): (a) reference checks and dependency refusals see every item (integrity
     wins over invisibility), or (b) strict invisibility, with the migration listing the 7 + 12 + 16 crossing references for the owner to
     cut.
  4. Whether `backlog team migrate` refuses while an entry with open bound items is not in the new shape (H5), or migrates and leaves
     those items unreachable until the entry is rewritten.
  5. Q-17 A against Q-18 B for the 13 archived files bound to teams without an entry (M7).

## 7. The three contradictions the designer reported

1. **R3b against R11 and R4 for validate and migrate**: confirmed (`00-owner-rulings.md:21-24` against `:27-28` and `:54-56`). Turning it
   into decision 1 is right; the option set is incomplete (M14).
2. **The reference index promises item formats that are missing**: confirmed. `reference/README.md:8` describes
   `02-current-file-formats.md` as "items, team entries, flow definitions, limits, scope"; its six sections (`reference/02-current-file-formats.md:6-92`)
   cover only team files. Deriving the mapping from the code and the real data was the right reconciliation; the result has the errors
   of H3, H4, M6 and M8.
3. **Q-18 against R4**: confirmed (Q-18 B "the read-only rule stays absolute", `reference/08-owner-questions.md:363-366`, against R4
   "every existing item (open and archived) migrates"). The reconciliation (convert the format, keep keys and values, evaluate no rule) is
   right: R4 is the newer ruling and the lead's recorded decision converts archived items too. It should say explicitly that R4
   supersedes the "read-only absolute" part of Q-18 B for the format only, and it is broken by the design's own unbinding of 13 archived
   files (M7).

What I did not check: every row of `coverage.tsv` (1986 rows; I sampled), the `tests.tsv` and `consumers.tsv` rows, the scrum,
extreme-programming and single-agent examples rule by rule, chapter 07 against the real skills, and whether every validate check of
chapter 08 is implementable as worded (only the spike's subset was run).
