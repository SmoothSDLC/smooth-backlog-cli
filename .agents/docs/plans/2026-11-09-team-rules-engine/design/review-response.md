# Response to design reviews A and B

Context: two independent reviews of this design (`review-a.md`, correctness and ruling conformance; `review-b.md`, completeness against
the code and data, and implementability) found 12 High, 23 Medium and 18 Low findings. This file gives every finding one verdict: **fixed**
(where), **rejected** (with the evidence), or **owner choice** (the decision in `decisions.md` that settles it). Finding ids are the
reviews' own: A-H1 is High finding 1 of review A. Paths are relative to this `design/` folder.

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
| R2-1 | R21 records the SHA of `teams.json` "in the backlog configuration". The repository's backlog configuration is `.backlog/config.json`, which the CLI creates in the consuming repository (`src/shared/store.js:50`) and which is committed there (the fact stated in R18). Writing the SHA there makes a working-tree change in every consuming repository on the first team command and again whenever `teams.json` changes; agents commit it by accident, two branches or two repositories record different values and conflict, and a repository with no team work would carry a value about a shared file it does not own | the SHA lives in the per-user part of the backlog configuration, the folder the CLI already uses for the per-user record of where a backlog is cloned (`$XDG_CONFIG_HOME`, `src/shared/store.js:22-36`), together with the record of lead decision a (which places it outside every repository). It is still "the backlog configuration", of the user and not of a repository, and nothing in any repository changes | chapter 01 section 4 |
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

## Spike size after the revision

After round 2: `evaluator-spike/evaluator.mjs` 366 lines, `safe-regex.mjs` 108, `numbers.mjs` 72, `teams-load.mjs` 46, `contention.mjs`
(a measurement, not a test) 48; tests: `evaluator.test.mjs` (every case of `rule-cases.json` plus the coverage check of examples),
`numbers.test.mjs` (7 git scenarios), `teams-load.test.mjs` (6 scenarios of R21).
