# Response to design reviews A and B

Context: two independent reviews of this design (`review-a.md`, correctness and ruling conformance; `review-b.md`, completeness against
the code and data, and implementability) found 12 High, 23 Medium and 18 Low findings. This file gives every finding one verdict: **fixed**
(where), **rejected** (with the evidence), or **owner choice** (the decision in `decisions.md` that settles it). Finding ids are the
reviews' own: A-H1 is High finding 1 of review A. Paths are relative to this `design/` folder.

Rounds 1 to 4 are the record of their time; where a later round or a ruling changed an answer, the later one holds. In particular: the
"decisions 2 to 4" that round 1 cites were answered by the owner's rulings R14 to R21, and the DEFERRED rows they blocked are resolved
(`coverage.tsv`); R2-5 ("the whole backlog") was replaced by R3-4 (the repository folder), and R3-4's stop on a foreign folder still in
markdown was replaced by R4-1 (an unresolved reference). The owner questions open now are the seven of `decisions.md`, round 5 below.

Totals: 12 High: 11 fixed (one of them with an owner choice for its last part, decision 4), 1 owner choice (decision 2). 23 Medium:
20 fixed, 2 rejected with evidence, 1 owner choice (decision 3). 18 Low: 17 fixed (one in part, with the remaining limit stated),
1 owner choice (decision 2).

## High

| id | finding | verdict | where |
|---|---|---|---|
| A-H1 | a condition with two keys is accepted; the second key is ignored | fixed | chapter 03 section 4 (exactly one key, validate error and run-time refusal); chapter 08 section 6; spike `one()`; cases VAL-13, INL-03 |
| A-H2 | an unknown key of a rule is accepted (`wehn`) | fixed | chapter 03 section 14 (the schema of every object, closest key named); chapter 08 section 6; spike `KEYS`; case VAL-14 |
| A-H3 | R12: a published number can be handed out again (clean rebase after the other clone deleted it, `git revert`, shallow clone) | fixed | chapter 05 rewritten: the high-water mark is read from the history (every item file ever added, every counter value ever committed), publication requires a number above the upstream mark, team commands re-run on upstream, user commands renumber after the rebase, a shallow clone refuses to allocate, the migration seeds every folder; `evaluator-spike/numbers.mjs` and 7 git tests in `numbers.test.mjs` reproduce and close each path; chapter 08 section 8 |
| A-H4 | the migration unbinds every team item when `teams.json` is missing or unreadable | fixed | chapter 06 sections 3 and 5: a failure, nothing written; `{}` unbinds on purpose |
| A-H5 | the public repository names the internal team and describes internal scripts; real-backlog statistics in the chapters | fixed | entry plan and reference files scrubbed by the lead (3190a7c); the counts of a real backlog are removed from chapters 02 and 06 |
| A-H6 | a `regex` can hang every agent's command | fixed | `regex` runs on a linear-time matcher with a checked subset: chapter 03 section 4.1, chapter 01 section 6, chapter 08 section 6; `evaluator-spike/safe-regex.mjs`; cases INL-05 (`^(a+)+$` on 5000 characters in milliseconds), VAL-20 |
| B-H1 | any session can act as any person, the lead included: today's refusal of a differing `--agent` is dropped | owner choice | decision 2 (recommended: keep the refusal); coverage rows of group RO-CALLER and review-B rows 55, 62, 63 are DEFERRED-WITH-EXPLICIT-BLOCKER on it |
| B-H2 | two agents writing one item at once have no defined outcome; the claim that key order lets git merge fields is false | fixed | chapter 04 section 6: one outcome (reset to upstream and run the whole command again; exit 0 or the rule's refusal; exit 3 after three lost races), the stale-view guard does not run for team commands (ruling R1: the rule set decides); chapter 02 section 2.4 corrected; BDD scenarios listed |
| B-H3 | the migration loses the order of folders without `index.json` | fixed | chapter 06 section 4.4: the index is built from `priority` with today's `fromItems` before the key is dropped; chapter 02 section 5 |
| B-H4 | items without a team lose their holder (`claimed_by` renamed) | fixed | chapter 02 section 4 keeps the code's names `claimed_by`, `claimed_at`; section 5: the migration reads with today's `parseItem`, which already turns both spellings of the header into those names |
| B-H5 | the cut-over of the one existing team is undefined; validate cannot run before the migration | fixed, with an owner choice | chapter 06 section 1 (the order: rewrite the entry, validate on the markdown backlog, dry run lists entries in the old shape and undeclared status values, migrate, move values with the team's own steps); chapter 08 section 1 (validate on a markdown backlog); whether the migration refuses while an entry is in the old shape is decision 4. The "legacy" hand-off edge is for the owner's team rule set (coverage row review-B 19, DEFERRED on entry plan Task 6) |
| B-H6 | coverage rows claim behaviours that the named targets do not carry | fixed | each re-stated: pass per work commit → pattern `close-same-commit` (commit equality, stated as weaker than today in chapter 03 section 12); review comments cite a document → test `contains` and pattern `review-cites-document`; the lead rejects a hand-off → pattern `reject-input`; accept only after the review passed and with a commit → pattern `accept-input-reviewed`; hand-off digest → SKIP with the reason; estimate and definition of done from the body → reference `$item.body` and pattern `request-review-needs-done-when`; pop on a synchronisation failure → exit 1; pop on a detached HEAD → coded check; chunk work across repository folders → DEFERRED on entry plan Task 6. The coverage script gained a source, the 21 sampled rows of review B section 3 with verdict M or X, and per-row overrides of the inventory |

## Medium

| id | finding | verdict | where |
|---|---|---|---|
| A-M1 | pop can offer a step that then fails, and offers it again | fixed | chapter 03 section 9 (pop tries the whole step without writing); chapter 04 section 4 (an item tried once is not offered again in that command); spike `pop`; case INL-01 |
| A-M2 | an argument (text) never equals a number field | fixed | chapter 03 section 4 (`is` and `in` read a decimal text as the number); spike `same`; case INL-02 |
| A-M3 | number parsing accepts spaces, `0x3C`, `-500`, `60.9` past a cap | fixed | a number is a decimal literal; `empty` trims; caps are written `not <=` (chapter 03 section 4, chapter 02 section 3, examples parallel and single-agent); cases PAR-57 to PAR-59 |
| A-M4 | the coded check "the agent must be in people" is not in a ruling | fixed | removed from the CLI; every example starts with the rule `members-only` (chapter 01 section 3; cases COD-10, SCR-29, XP-20, SOL-12, PAT-47, PAR-56) |
| A-M5 | team commands may change items without a team through a binding rule | rejected, with evidence | owner question Q-19, answered B, says of teamless split items "a lead binds one with --set-team when the team should work it" (`../reference/08-owner-questions.md`, option B of Q-19); the binding check is the narrowest form of that: no team step touches an item without a team except one that binds it. Cited in chapter 03 section 8 |
| A-M6 | an item of a removed team is stranded; validate's fix text is impossible | fixed | `backlog team migrate` run again unbinds items of teams without an entry (chapter 06 section 2); chapter 08 section 7 fix text |
| A-M7 | chapter 08 forbids `$it` in `related`; `related` effects unchecked | fixed | chapter 08 section 6, chapter 03 section 8; spike validate; cases VAL-16, VAL-17 |
| A-M8 | deleting an item makes every item that names it unwritable | fixed | references are checked only in the fields a step writes; a deleted number reads as missing and validate warns (chapter 02 section 3, chapter 03 section 6, chapter 08 section 7); case PAR-61 |
| A-M9 | self-references accepted | fixed | coded: an `item`/`items` field cannot name its own item (chapter 02 section 3); case PAR-60 |
| B-M1 | pop exit 3 would mean both idle and failure | fixed | chapter 04 section 4 and 6, chapter 07 sections 2 and 6 |
| B-M2 | `$team.items` spans folders, numbers do not | fixed | `$team.items` is the session's repository folder (chapter 03 section 5); spike |
| B-M3 | foreign dependencies read as missing | fixed | `owner/name#seq` is resolved read-only (chapter 03 section 5); spike `find`; cases PAR-64, PAR-65 |
| B-M4 | references between user items and team items undefined under R3a | owner choice | decision 3; the migration lists the crossing references (chapter 06 section 1) |
| B-M5 | `backlog done` writes `closed`, today `done` | rejected, with evidence | decision D-33 says "`backlog done <n>` writes `closed`" (`../reference/08-owner-questions.md` part 1); today `src/shared/done.js:10` passes `--status done`, which `normalise` stores as `closed` (reference finding F9); the open items that carry `done` were written by earlier builds. Stated in chapter 02 section 4 |
| B-M6 | absent `created` and `updated_by` values | fixed | chapter 02 sections 2.1 and 5; chapter 06 section 4.5 |
| B-M7 | 13 archived items are both unbound and promised unchanged | fixed (not an owner choice) | the carried-forward ruling says "an item bound to a team that no longer exists is unbound by the migration", with no exception, and R4 supersedes Q-18 B's "read-only" for the format; chapter 06 sections 4.1 and 4.2 now say both changes apply to archived items |
| B-M8 | wrong count of archived files; false premise about old keys in archived files | fixed | the counts are removed; chapter 06 section 4.2 says where those key names occur (a few open items written by the newest builds) |
| B-M9 | counter seeding of folders with no items left | fixed | chapter 05 section 4, chapter 06 section 3; spike test 7 |
| B-M10 | index status copies change for most entries | fixed | chapter 06 section 4.6, chapter 05 section 5; the dry run counts them |
| B-M11 | renumbering must remap references in team-defined fields | fixed (made unnecessary) | team creations are never renumbered: a team command re-runs and allocates on upstream (chapter 05 section 3); user renumbering remaps the user fields `depends_on`, `parent` and the body |
| B-M12 | `delete`, `clean`, archive leave references that block writes | fixed | as A-M8 |
| B-M13 | decision 2 (the command line of a step) is a consequence of the owner's command shape | fixed | removed from `decisions.md`; recorded as a design choice in chapter 03 section 1 and chapter 04 section 3 with its logic: the step is required data, and the owner's rule (`../reference/09-gap-resolution.md` section 3) makes required data a word, not an option |
| B-M14 | decision 1 lacks the option of a top-level `backlog migrate` | fixed | decision 1 option C, with the reason it conflicts with R3a |

## Low

| id | finding | verdict | where |
|---|---|---|---|
| A-L1 | `final` is behaviour in the item definition; "open" defined twice | fixed | `final` is defined as a property of the allowed values used only for "open" (chapter 02 section 3); "open" defined once (chapter 05 section 5); `$team.items` includes closed items, the queue does not |
| A-L2 | shadowing only syntactic | fixed in part | key-order-insensitive comparison and `in` covering `is` (spike, case VAL-18); the remaining limit is stated in chapter 08 section 6 |
| A-L3 | names under a valid root are not checked | fixed | closed list (chapter 03 section 5); case VAL-15 |
| A-L4 | no syntax for field, step, argument names; `help`, `version` | fixed | chapter 03 section 5, chapter 08 section 6; case VAL-19 |
| A-L5 | a boolean typo stores false | fixed | chapter 02 section 3; case INL-04 |
| A-L6 | the spike reads a missing field as undefined | fixed | spike `get` applies D-32; case PAR-66 (an item without the field) |
| A-L7 | `delete`, `branch`, `"team": ""`, `length` without a case | fixed | patterns `remove-duplicate`, `move-branch`, `release-to-users`, `dependencies-cap`; cases PAT-54 to PAT-57 |
| A-L8 | coverage names `backlog team query definition` | fixed | coverage script (now `query rules`) |
| A-L9 | `create` overflows on 200 000 items; pop cost | fixed | spike uses a loop; the pop cost is stated in chapter 01 section 6 |
| B-L1 | two `Split from` lines | fixed | the first wins (chapter 02 section 5, chapter 06 section 4.3) |
| B-L2 | note text cannot be composed | fixed | placeholders in a literal note text (chapter 03 section 8); pattern `reject-input` |
| B-L3 | SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY format and detached HEAD not stated | fixed | chapter 01 section 5, chapter 04 section 5 |
| B-L4 | `--team` differing from SMOOTH_BACKLOG_CLI_TEAM_NAME | owner choice | part of decision 2 |
| B-L5 | pop text output not specified | fixed | chapter 04 section 4 |
| B-L6 | `backlog history` of a team item | fixed | chapter 02 section 2.3 |
| B-L7 | "byte for byte" body | fixed | chapter 02 section 5, chapter 06 section 4.5 |
| B-L8 | the spike's size is not an implementation estimate | fixed | chapter 03 section 13 |
| B-L9 | decisions should not lean on case labels | fixed | `decisions.md` rewritten without them |

## Round 2: the owner's rulings R14 to R21 applied, and the problems found

Context: after the reviews the owner answered every open decision (rulings R14 to R21 and a scope note in `../00-owner-rulings.md`). The
design applies them; `decisions.md` holds no open question. Applying them found the problems below, each with evidence, the fix chosen and
its logic. None needs an owner decision; R2-1 and R2-2 deviate from the literal words of R21 and are listed first so the owner sees them.

| id | problem, with evidence | fix and logic | where |
|---|---|---|---|
| R2-1 (superseded in round 3 by ruling R22: the SHA is in `.backlog/config.json`) | R21 records the SHA of `teams.json` "in the backlog configuration". The repository's backlog configuration is `.backlog/config.json`, which the CLI creates in the consuming repository (`src/shared/store.js:50`) and which is committed there (the fact stated in R18). Writing the SHA there makes a working-tree change in every consuming repository on the first team command and again whenever `teams.json` changes; agents commit it by accident, two branches or two repositories record different values and conflict, and a repository with no team work would carry a value about a shared file it does not own | the SHA lives in the per-user part of the backlog configuration, the folder the CLI already uses for the per-user record of where a backlog is cloned (`$XDG_CONFIG_HOME`, `src/shared/store.js:22-36`), together with the record of lead decision a (which places it outside every repository). It is still "the backlog configuration", of the user and not of a repository, and nothing in any repository changes | chapter 01 section 4 |
| R2-2 | R21 says a command with a fresh record "proceeds without reading the file", but a team command needs the rules in the file to evaluate anything, and lead decision a lets the record come from an environment variable, which cannot carry the file | the validation stores the validated copy beside the record, and a fresh record makes the command use that copy; this is exactly the stated consequence ("within the 24 hours an edit to teams.json is not read"). The environment-variable record is not designed: without the copy a command would have to read the file anyway, so it would save nothing; a home that cannot be written makes every command validate in full, silently | chapter 01 section 4; spike `teams-load.mjs`, 6 tests |
| R2-3 | R18 speaks of "the file" failing validation; R21's record lists "the valid teams" one by one | validity is per team: a command of a valid team runs while another team's entry is broken, and validate reports the broken one. The migration converts every team's items, so it needs every entry valid (R18 names it explicitly) | chapter 01 section 4, chapter 06 section 3 |
| R2-4 | the R20 inventory misses two variables the CLI owns: BACKLOG_RUN_HOOK (`bin/backlog.js:10`) and BACKLOG_RUN_LOCK_HELD, which the CLI sets for its own child (`src/shared/store.js:95,101`); BACKLOG_TEST_SELF (`src/team/pop.js:20`) and BACKLOG_REVIEW_STALE_SECONDS (`src/team/team.js:147`) are CLI-owned too | the first two become SMOOTH_BACKLOG_CLI_RUN_HOOK and SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD under the same ruling; the other two disappear with the design (the test seam is deleted, inventory group ENV-TESTSEAM; the stale time is a number in a rule). The guard test's BACKLOG_PRIVATE_DENYLIST becomes SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST when the code changes (this revision still ran the guard with today's name) | chapter 01 section 5; coverage row R20 |
| R2-5 | R14 makes `backlog team migrate` need one team, but R4 forbids a backlog half in markdown and half in JSON | the conversion is always the whole backlog; the team (or `--show-all`) selects whose items the field report of R17 checks | chapter 06 section 2 |
| R2-6 | R19a names the variable; the configuration's `team` key is also a team input | the key does not block user commands: it is a default for team commands written in a committed file, not a sign that the session is a team's, and blocking on it would stop a person's own commands in that repository | chapter 04 section 8; case R19A-02 |
| R2-7 | R19 lets a user command set values on a team item, but user commands never read `teams.json` (R3), so they cannot type-check a team field, and no user flag names a team-defined field | `backlog update <item> --show-all --set <field>=<value>` writes any field of a team item (JSON when the value parses as JSON, else text); nothing is checked against the team's definition, the history names the user, and `backlog team validate` reports what the definition does not allow. The flag is accepted only on a team item, where no other flag can reach the team's fields | chapter 04 section 8; case R19-02 |
| R2-8 | R18: compatibility paths of today's code that the design had not named: the root file `.smooth-backlog.json` is "still read" (`src/shared/setup.js:16,24`), and the legacy hand-off edge (`src/team/handoff.js:53-57`) | every path is listed with what replaces it; the root file now stops the command with a move instruction, the legacy edge is a rule a team may write | chapter 06 section 6 |
| R2-9 | the 24-hour record means two machines may evaluate two versions of the rules for up to a day, and an invalid edit stops each machine's team commands when its own record expires, far from the push that caused it | stated as consequences; the lead's skill validates before every push (lead decision b refreshes the record at once on the lead's machine) | chapter 01 section 4, chapter 07 section 3 |
| R2-10 | scope note: several teams at once. Measured with `evaluator-spike/contention.mjs`: 3 teams writing back to back lost 60 races for 60 writes and one write needed 41 attempts, so the "three attempts then exit 3" of the first revision would fail writes under load | the re-run now waits a random growing time (below 50 ms x 2 to the power of the attempt) and keeps trying within the lock's time budget (SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS): with the wait the same load lost 10 races, at most 6 attempts. One machine needs nothing: its agents share one clone and the clone lock serialises them. The lead's reading of the scope note holds: one process per team through its own variable, `--team` for another team, no variable renamed | chapter 04 sections 6 and 7 |
| R2-11 | R15 removes the identity refusal; the design's coded "agent must be in people" check was already removed in round 1 | role guards read the resolved agent only; the consequence (any session can name the lead) is stated once; the `members-only` rule of every example now guards against a mistyped name only | chapter 01 sections 3 and 5; case R15-03 |

## Round 3: ruling R22 (where the team file lives, and its SHA in the configuration)

Context: ruling R22 makes the team file belong to the actionable repository and its branch: its location comes from that repository's
`.backlog/config.json` (key `teams_file`, else `<backlog repository>/<owner>/<name>/teams.json` in the repository's own folder of a configured
backlog repository, beside its `index.json` and `phases/`, never the root of the whole backlog repository, else `.backlog/teams.json`), and
the SHA of R21 is kept in the same configuration (key `teams_file_sha`). Chapters 01, 04, 05, 06, 07 and 08, the cases (R22-01 to R22-05)
and the spike (`teams-load.mjs`, nine tests) apply it. The problems found, with the fix chosen and its logic; none needs an owner decision.

| id | problem, with evidence | fix and logic | where |
|---|---|---|---|
| R3-1 | two branches with different team files merge: `teams_file_sha` is one line of `.backlog/config.json`, so the merge conflicts on it, or merges cleanly to a value that matches neither side when the team file merged from both | the SHA is a check value, never an authority: a recorded SHA that differs from the record only forces a full validation (lead decision c), and a valid file gets its SHA rewritten. A conflict on that line can be resolved with either side; the next team command (or `backlog team validate`) writes the right value, which the lead commits | chapter 01 section 4 step 3 and 4; spike test "a SHA in the configuration that differs from the record ..." |
| R3-2 | a read-only checkout (a CI job, a sandbox) cannot take the SHA write, and a clean-working-tree check in CI would fail on it | the write is skipped silently and the command proceeds, validating in full each time; a SHA committed together with every change of the team file means the CLI never needs to write in CI | chapter 01 section 4; spike test "a read-only checkout ..." |
| R3-3 | with the default inside a separate backlog repository, the team file is one per repository while each branch of the actionable repository records its own SHA: when the backlog repository's file changes, the first team command in each branch's checkout writes the new SHA, a working-tree change in the actionable repository for a file that lives elsewhere | stated as the consequence of R22 (the SHA is kept in the actionable repository's configuration); the lead commits the new SHA in the branches it keeps, and a team that wants quiet branches names a file inside the actionable repository with `teams_file` | chapter 01 sections 1.1 and 4 |
| R3-4 | round 2 made the migration convert the whole backlog; with a team file per repository, the items of other repositories' folders are bound to teams of team files this repository cannot read | the migration converts the repository folder of the repository it runs in (`<owner>/<name>`, every item of it), with that repository's team file; each repository runs it once; a command that reads an item of a folder still in markdown (a foreign dependency) stops with a text naming the repository to migrate. R4 still holds per folder: no folder is half markdown | chapter 06 sections 2 and 3; chapter 05 section 4 |
| R3-5 | R22 moves the SHA into the configuration; R21's record also has the valid teams and the date, and "proceeds without reading the file" needs the validated copy | the record and the copy stay in the per-user state: a date that changes every day in the committed configuration would be a daily working-tree change, and the copy is a file, not a value | chapter 01 section 4 |
| R3-6 | `teams_file` may name any path, so a committed configuration can point the CLI at any readable file on the machine | the CLI only reads it and refuses a file that is a symbolic link; the trust boundary is the repository's own committed content, the same as its code. A public repository points `teams_file` at a private location (stated once, no mechanism) | chapter 01 section 1.1 |
| R3-7 | branch-specific rules meet branch-independent numbers and index: with a separate backlog repository the item numbers and the index are one per repository folder for all branches | stated: the shared counter and index are unaffected by the rules a branch uses; a team command on an item of another branch uses the rules of the branch it runs in, and the pattern `scope-branch` keeps a session to its branch's items | chapter 01 section 1.1 |

## Round 4: rulings R23 (templates at setup), R24 (nothing affects the entire backlog), R25 (the migration at setup)

Context: R23 makes `backlog setup` copy the generic team templates (chapter 01 section 1.2); R25 makes the migration record itself in
`.backlog/config.json` and `backlog setup` recommend it (chapter 06 section 2.0); R24 limits every command to the actionable repository's
folder. The audit of every command and chapter against R24 is chapter 04 section 9; the violations it found, each with its evidence and fix:

| id | violation of R24, with evidence | fix |
|---|---|---|
| R4-1 | round 3: a foreign dependency on a folder still in markdown stopped the command (chapter 06 section 2) | the reference reads as unresolved (a missing item) and validate reports it; nothing stops (case R24-01) |
| R4-2 | a write of an `items` field refused a foreign `owner/name#seq` that did not exist in that folder (chapter 02 section 3, "as today") | a foreign reference is only checked to be well formed; existence is never checked on a write (case R24-02); validate reports it as unresolved |
| R4-3 | today's publication walks other repositories' items for a dependency cycle (`foreignCycle`, `src/shared/sync.js:352`) and refuses a publication whose foreign reference does not resolve (`src/shared/sync.js:319`) | both removed; cycles and existence are checked inside the own folder only |
| R4-4 | `backlog move --to-repository` writes a second folder and takes a number from its counter (`src/shared/move.js:108,134`) | `backlog move` moves between branches of the own folder only; the cross-repository form is removed (file a new item in the other repository, archive this one) |
| R4-5 | chunk work offers items of other folders (`backlog.scope`, `src/team/views.js:25-44`), kept as a deferred gap in rounds 1 to 3 | not offered; the coverage rows move from DEFERRED to SKIP under R24 |
| R4-6 | the re-run of a team command reset the whole clone to upstream (`git reset --hard`), which would discard a person's uncommitted change in another folder of the clone, and re-ran the command when only another folder had changed | `git reset --keep` (other paths keep their local changes), and no re-run when upstream changed nothing of the own folder or its team file: the commit is rebased as it is (spike test "upstream changed only another repository folder ...") |
| R4-7 | a pull with rebase moves the whole clone, and a conflict outside the folder had no defined outcome | the command stages only its own folder's paths, so its commits cannot conflict outside it; a conflict outside the folder (only possible from a commit the CLI did not make) stops the command with nothing published and a text naming the path (chapter 04 section 9) |
| R4-8 | `backlog team validate` checked "every item of the backlog" (chapter 08 section 7 heading) and round 2/3 migration texts seeded "every folder" | validate checks the own folder's items; the migration seeds only its own folder's counter |
| R4-9 | the clone lock covers the whole clone | kept and stated: a git clone has one index and one working tree, so writes of different folders must take turns; the lock delays, never changes another folder |

Templates (R23): five files ship in the CLI package's `templates/teams/` and land in `.backlog/team-templates/`; the skill copy's rule (remove
and copy again on every setup) is reused, so an edited copy is replaced and a person copies a template to the team file before editing it;
nothing reads them. Migration record (R25): `migrated_at` and `migrated_by_version`, written by the migration after each successful run;
setup prints one of three lines; no other command uses them. No question is open.

## Spike size after the revision

After round 2: `evaluator-spike/evaluator.mjs` 366 lines, `safe-regex.mjs` 108, `numbers.mjs` 72, `teams-load.mjs` 68 (after round 3), `contention.mjs`
(a measurement, not a test) 48; tests: `evaluator.test.mjs` (every case of `rule-cases.json` plus the coverage check of examples),
`numbers.test.mjs` (7 git scenarios), `teams-load.test.mjs` (9 scenarios of R21 and R22 after round 3); round 4 adds `setup.mjs` (templates and migration advice) with
`setup.test.mjs` (3 tests) and one test of `numbers.test.mjs` (a commit rebased when upstream changed only another folder).

## Round 5: reviews C and D, judged against the code and the rulings

Context: review C (`review-c.md`, correctness and ruling conformance, 27 findings) and review D (`review-d.md`, implementability against
the code, 22 findings and a sample of 98 behaviours) reviewed the round-4 design. Each finding was checked against `src/` and the rulings
R1 to R25 before it was answered. Verdicts: **fixed** (where), **rejected** (with the evidence), **owner choice** (the question of
`decisions.md` that settles it; each is applied provisionally, so the design is complete either way). Review C's 23 adversarial tests
became permanent spike tests where the finding holds (all 23: cases VAL-22 to VAL-33, INL-06 to INL-11, R19A-03, R22-06, and tests in
`teams-load.test.mjs` and `numbers.test.mjs`; ADV-23 documents the provisional answer of question 2).

Totals: review C 27 findings: 22 fixed, 5 owner choices (H2: question 1; H3: question 2; M1: question 3; M5: questions 4 and 5, with
one part rejected; L6: question 6).
Review D 22 findings: 17 fixed, 4 owner choices (questions 1, 2, 6, 7), 1 rejected. Review D section 2, 22 missed or wrongly attributed
behaviours: 20 fixed, 2 owner choices (questions 2, 6).

### Review C

| id | verdict | where |
|---|---|---|
| C-H1 | fixed: a refused team command now writes nothing (no SHA, no record, no copy); the refusal is decided before any write | chapter 01 section 4 step 4; `teams-load.mjs` `loadTeams`; test "a refused team command writes nothing" |
| C-H2 | owner choice, question 1 (provisional A: the input defines the actionable repository; its own team file; SHA per user) | chapter 01 sections 1.1 (step 0) and 5; chapter 04 section 9; `teams-load.mjs` `teamsFile`; case R22-07 |
| C-H3 | owner choice, question 2; the data loss is fixed by provisional A (`git reset --keep HEAD~1` drops only the command's own commit; verified: today's in-repository mode pushes the person's commits with every change, `src/shared/sync.js:53-62`, `:412`, `:499`) | chapter 04 sections 6 and 9; chapter 05 section 3; `numbers.mjs` `publishByRerun`; two tests |
| C-H4 | fixed: `backlog setup` runs on a markdown backlog | chapter 06 section 2 |
| C-H5 | fixed in the plan folder by the lead (commit 5ee67f4: `consumers.tsv` ids only, the inventory's consumer section and the rulings generic, no pointer to the removed analysis); files outside the plan folder are outside this design and listed in the hand-back | `../reference/`, `../00-owner-rulings.md` |
| C-M1 | owner choice, question 3 (provisional A: only items without a team are renumbered; a duplicate with a team item stops that folder's team commands) | chapter 05 sections 2, 3, 4; chapter 08 section 7 |
| C-M2 | fixed: the history scan reads merge commits (`-m`) | chapter 05 section 2; `numbers.mjs`; test "a number that exists only in a merge commit" |
| C-M3 | fixed: a file-name number above 10^9 is an unreadable item and never part of the mark | chapter 05 section 2; `numbers.mjs` `MAX_SEQ`; test "a file-name number above the bound" |
| C-M4 | fixed: the text now says an unresolved foreign reference reads as a missing item and the team's rule decides; a rule tells it by its empty fields | chapter 03 section 4; chapter 04 section 9 |
| C-M5 | owner choice for two parts (per-team validity: question 4; which commands take `--show-all`: question 5); rejected for the third: the help of one user command is not blocked, because R19a says "The owner did not ask to block `--help` or `--version`" and the command matrix says every `--help` reads nothing | `decisions.md`; chapter 04 section 8 |
| C-M6 | fixed: the spike's validate implements every error check of chapter 08 sections 3 to 6 (the 11 of the review and two more: a literal of the wrong type, a step named like a CLI flag); the team effect and true-only `archive`/`delete` are also checked at run time; pop stops on a broken rule instead of answering idle | `evaluator.mjs` `validate`, `step`, `pop`, `test`, `value`; chapters 03 sections 4, 8, 9 and 08 sections 4 to 6; cases VAL-22 to VAL-35, INL-06 to INL-09 |
| C-M7 | fixed: `show-all` and `ask` are reserved argument names | chapter 03 section 5; chapter 08 section 6; case VAL-22 |
| C-M8 | fixed: a reference to the own folder in the foreign form is the local number and gets every check | chapter 02 section 3; `evaluator.mjs` `typed`; cases INL-10, INL-11 |
| C-M9 | fixed: `migrated_at` changes only when the run converted a file (or on the first run over a folder that had nothing to convert) | chapter 06 section 2.0; `setup.mjs` `recordMigration`; test "migrated_at records when the folder was migrated" |
| C-M10 | fixed: an unparsable `.backlog/config.json` stops every command with exit 2 and is never overwritten | chapter 01 section 1.1; chapter 04 section 5; `teams-load.mjs` `readConfig`; test "an unparsable .backlog/config.json" |
| C-M11 | fixed: `--help` reads nothing and writes nothing; it points to `backlog team query steps` | chapter 04 section 1; chapter 02 section 3 |
| C-L1 | fixed: a record outside 0 to 24 hours old is stale | chapter 01 section 4 step 3; `teams-load.mjs`; test "a record dated in the future" |
| C-L2 | fixed: the spike refuses a symbolic-link folder between the root and the team file | `teams-load.mjs` `assertPlain`; test "a teams_file reached through a symbolic-link folder" |
| C-L3 | fixed: "outside the repository" compares path segments | chapter 01 section 1.1; `teams-load.mjs` `below`; case R22-06 |
| C-L4 | fixed: the reading is stated (set to a name; an empty value names no team, as in the team lookup) | chapter 04 section 8; case R19A-03 |
| C-L5 | fixed: `"step": []` and a reversed class range are validate errors | chapter 08 section 6; `evaluator.mjs`, `safe-regex.mjs`; cases VAL-32, VAL-33 |
| C-L6 | owner choice, question 6 (the review's narrower reading is option B; provisional A follows the backlog the CLI resolves) | chapter 01 section 1.1; case R22-08 |
| C-L7 | fixed: the reading is stated (R3a lists moving, archiving, importing and cleaning; R16 and R19 lift it with the flag; `done` writes `closed`, which validate reports on a team item, and `--set status=<word>` is the way to write the team's word) | chapter 04 section 8 |
| C-L8 | fixed: the lock time-out is stated as the accepted limit, and re-runs use at most half of the lock budget | chapter 04 sections 6 and 9 |
| C-L9 | fixed: `setup.mjs` cites section 2.0; chapter 03 section 13 counts five modules; chapter 06 says the migration validates and refreshes the SHA as validate does; the superseded answers of rounds 1 to 3 are marked at the top of this file | as listed |
| C-L10 | fixed: `coverage.tsv` has a row for every ruling (R1 to R25, R3a, R3b, R19a), the scope note, the five carried bullets and the two lead decisions | `coverage/make-coverage.mjs` |
| C-L11 | fixed: the flip of the SHA while two repositories are pulled at different moments is stated | chapter 01 section 4 |

### Review D

| id | verdict | where |
|---|---|---|
| D-H1 | owner choice, question 2; the loss of the person's commits is fixed by provisional A (verified at `src/shared/sync.js:53-62`, `:412`, `:499`) | chapter 04 section 6; `numbers.mjs`; test "a team re-run drops only the command's own commit" |
| D-H2 | fixed: a writing command stages only its item files, `index.json` and `numbers.json`, never the team file, the templates or the configuration (today's `add -A` of the folder, `src/shared/sync.js:408,446,490`) | chapter 04 sections 6 and 9 |
| D-H3 | owner choice, question 7 (verified: an older release reads only `*.md`, `src/shared/store.js:285`, hands out `nextSeq` from the files, `:299`, and the self-update refuses another schema, `src/upgrade.js:140`; a header today's parser rejects stops every command of the folder, checked with today's `parse`) | chapter 06 sections 3, 5, 6, 7 |
| D-H4 | owner choice, question 6 (provisional A; the SHA goes to the per-user record when the repository has no configuration, so none is created) | chapter 01 section 1.1; case R22-08; test "question 6, provisional A" |
| D-H5 | owner choice, question 1 | chapter 01 sections 1.1 and 5; chapter 04 section 9 |
| D-M1 | fixed: the conflict and unpublished-commit guards look only at the own folder; the foreign existence and cycle checks of `backlog new` and `backlog update` are removed; the journal and the rollback are the stated exception | chapter 04 section 9; chapter 02 section 4; coverage rows INV-161, INV-403, INV-404, INV-475, INV-478 |
| D-M2 | fixed: re-runs use at most half of the lock budget | chapter 04 sections 6 and 7 |
| D-M3 | fixed by the re-run of question 2 (only the own commit, whose files are all in the folder); a refused reset stops with exit 3 and a text | chapter 04 section 6 |
| D-M4 | fixed: the "migrated by an older version" advice is dropped (every build reports `0.0.0-development`, and R25 did not ask for it) | chapter 06 section 2.0; `setup.mjs`; case R25-02 |
| D-M5 | fixed (as C-H4) | chapter 06 section 2 |
| D-M6 | fixed: a folder in which no item has a team migrates without a team file | chapter 06 sections 3 and 5; chapter 01 section 1.1 |
| D-M7 | fixed: clean removes only the index entries of the items it deleted; its setup run includes the templates and the advice | chapter 04 section 8 |
| D-M8 | fixed: `templates/workflows/` is deleted from the package at the cut-over, with its mentions | chapter 01 section 1 |
| D-M9 | fixed: the rows named are re-attributed | coverage rows INV-054 to INV-056, INV-161, INV-169, INV-177, INV-178, INV-403, INV-404, INV-406, INV-475, INV-478; group CR-DOD |
| D-M10 | rejected as a design defect: the CLI design does not change; landing in stages with the matching changes of the scripts and skills outside this repository is the landing plan (`../implementation/01-landing-strategy.md`) | none |
| D-L1 | fixed: `size_score` declared; undeclared fields of user items shown and kept; `backlog new` no longer writes `review_state` and `reviewer`; `list --json` keeps the `review_state` column with the stored value | chapter 02 section 4 |
| D-L2 | fixed: `backlog update --branch` listed as a writer of `branch` | chapter 02 section 2.1 |
| D-L3 | fixed: user `backlog archive` writes no status word | chapter 02 section 4 |
| D-L4 | fixed: the held section of `backlog changes` reads `claimed_by` of items without a team only | chapter 04 section 8 |
| D-L5 | fixed: an empty `team` key counts as not set | chapter 01 section 5; case COD-16 |
| D-L6 | fixed: a JSON file name that would be too long is a failure row of the migration | chapter 06 section 5 |
| D-L7 | fixed: the R19a guard runs in `src/main.js` before `setup` and `upgrade` | chapter 04 section 8 |

### Review D section 2: the 17 missed and 5 wrongly attributed behaviours

| row | behaviour | verdict | where |
|---|---|---|---|
| 2 (W) | `new --force` replaces an item with the same file name | fixed: removed (a new file name is always free) | chapter 02 section 4; coverage INV-169 |
| 3 (W) | the definition-of-done placeholder of a new user item | fixed: kept as body text | chapter 02 section 4; coverage INV-178, CR-DOD |
| 4 (M) | the body of a new team item | fixed: empty; a `note` effect writes it | chapter 04 section 2 |
| 13 (W) | `owner` of a user item | fixed: attributed to the user definition | coverage INV-177 |
| 14 (M) | `new` writes `review_state` and `reviewer` | fixed: no longer written | chapter 02 section 4 |
| 15 (W) | `--depends-on` reads another folder | fixed: removed (R24) | chapter 04 section 9; coverage INV-161 |
| 19 (M) | 250-byte file names | fixed: failure row | chapter 06 section 5 |
| 26 (M) | `update --size_score` | fixed: field declared | chapter 02 section 4 |
| 27 (M) | `update --branch` | fixed: writer listed | chapter 02 section 2.1 |
| 37 (W) | `--set-depends-on` cycle walk through other folders | fixed: removed (R24) | chapter 04 section 9; coverage INV-478 |
| 44 (M) | the journal may touch another folder | fixed: stated exception | chapter 04 section 9 |
| 51 (M) | `changes` held section by team keys | fixed: `claimed_by` only | chapter 04 section 8 |
| 54 (M) | `list --json` `review_state` column | fixed: kept, stored value | chapter 02 section 4 |
| 64 (M) | `clean` runs setup again | fixed: stated with templates and advice | chapter 04 section 8 |
| 66 (M) | `clean` drops the whole index list | fixed: only its own entries | chapter 04 section 8 |
| 72 (M) | `archive` writes status `archived` | fixed: no status word | chapter 02 section 4 |
| 81 (M) | setup writes `"team": ""` | fixed: empty is not set | chapter 01 section 5; case COD-16 |
| 83 (M) | the per-user record and the team file location | owner choice, question 6 | chapter 01 section 1.1 |
| 86 (M) | in-repository publication pushes the person's commits | owner choice, question 2 | chapter 04 section 6 |
| 87 (M) | `push-backlog-updates: false` | fixed: no push, no re-run, stated | chapter 04 section 6 |
| 90 (M) | refusal on unpublished commits anywhere in the clone | fixed: own folder only | chapter 04 section 9 |
| 91 (M) | conflict refusal over every `*.md` of the clone | fixed: own folder, `*.json` | chapter 04 section 9 |

Variables (R20): the four names the ruling's inventory missed were each found in the code before they were added, prefixed, to the list of
every CLI-owned variable (chapter 01 section 5): SMOOTH_BACKLOG_CLI_RUN_HOOK (`bin/backlog.js:7,10`, `src/shared/help-parts.js:6`),
SMOOTH_BACKLOG_CLI_RUN_LOCK_HELD (`src/shared/store.js:95,101`), SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS (`src/team/team.js:146-147`),
SMOOTH_BACKLOG_CLI_TEST_SELF (`src/team/pop.js:20`).

Spike after round 5: 26 more cases in `rule-cases.json` (288 in all), `numbers.test.mjs` 12 tests (4 more), `teams-load.test.mjs` 15
(6 more), `setup.test.mjs` 4 (1 more); `node --test` in `evaluator-spike/` runs 320 tests, all passing. Lines: `evaluator.mjs` 408,
`safe-regex.mjs` 108, `numbers.mjs` 80, `teams-load.mjs` 94, `setup.mjs` 31.
