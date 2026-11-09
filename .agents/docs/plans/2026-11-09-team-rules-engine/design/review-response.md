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
| B-L3 | TEAM_REPOSITORY format and detached HEAD not stated | fixed | chapter 01 section 5, chapter 04 section 5 |
| B-L4 | `--team` differing from TEAM_NAME | owner choice | part of decision 2 |
| B-L5 | pop text output not specified | fixed | chapter 04 section 4 |
| B-L6 | `backlog history` of a team item | fixed | chapter 02 section 2.3 |
| B-L7 | "byte for byte" body | fixed | chapter 02 section 5, chapter 06 section 4.5 |
| B-L8 | the spike's size is not an implementation estimate | fixed | chapter 03 section 13 |
| B-L9 | decisions should not lean on case labels | fixed | `decisions.md` rewritten without them |

## Spike size after the revision

`evaluator-spike/evaluator.mjs` 322 lines, `safe-regex.mjs` 108, `numbers.mjs` 72; tests: `evaluator.test.mjs` 60 lines (every case of
`rule-cases.json` plus the coverage check of examples), `numbers.test.mjs` 89 lines (7 git scenarios).
