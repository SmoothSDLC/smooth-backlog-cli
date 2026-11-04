# 049 No-classes negative test - dependency hand-off for item 50

The negative test of item 049 (the class options pinned out of the CLI help and the
public files) is the contract for item 050's repository-wide test (impact area 3,
tests only): .agents/test/shared-no-classes.test.js asserts (1) no work or review class
option in any help text - every HELP value of src/help.js plus the top-level help
constant of src/output.js, the complete set of help texts (the help regex also detects
--classes) - (2) no class option in COMMANDS.md, and (3) git grep -i -E
'work[_ -]?class|review[_ -]?class' over src, COMMANDS.md, README.md, templates and
CHANGELOG.md finds no match. Item 050 adds its repository-wide test (class wording may
remain only in test files that assert the fields are absent and dated records under
.agents/docs, fixtures included) in its own new test file and does not edit 049's file
(lead scope note, refinement 2026-10-31); this document is one of the dated records
that grep allows.

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#49
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#50
PRODUCER_AGENT: the claimer of item 49
SOURCE_COMMIT: 89cbd9bf269831dbd814f2c77c32a6af99126d6f ; BRANCH: team-cli-parity-1
CONTRACT: the negative test is the contract (impact area 3, tests only). .agents/test/shared-no-classes.test.js (committed in the SOURCE_COMMIT) asserts the three things above; its help regex detects --classes, its git grep does not. 050's repository-wide test (its DoD line, superseding 049's amendment of 2026-10-29) may find class wording only in test files that assert the fields are absent and dated records under .agents/docs - 049's test file is such a test file, and this document is such a record. 050 edits the five shared team test files and migrates the legacy class fields out of the open items; none of those files is touched by 049 (049 adds only its own test file, the one SKILL.md line and this document), so 050 works on free files.
OUTPUTS: .agents/test/shared-no-classes.test.js (the three negative tests, committed alone in the SOURCE_COMMIT), the one SKILL.md line in the Shared mode section (the CLI has no class options (work or review), no --classes, no class profiles; the test pins that) and this document (both in the commit after the SOURCE_COMMIT, named in the item's CHUNK record)
VERIFICATION: on Node 24 (the agent shell's BACKLOG_HEADLESS unset): the item's own test file (node --test .agents/test/shared-no-classes.test.js) 3 pass 0 fail 0 skipped; the full suite (npm test, the shared checkout at 41645bd127c942743cab11c92b866ca9afb12ed8 with this item's SKILL.md line and this document uncommitted in the tree): tests 798, pass 711, fail 86, skipped 1 - the 86 failures are in other items' test files (shared-foreign-deps, shared-long-name, shared-team-flow, shared-stale, shared-handoff-commands, shared-handoff-gate, shared-handoff-e2e, shared-query, shared-session-review, shared-sync-db, shared-team-lifecycle and the other slice's untracked .agents/test/shared-twostage.test.js), which run on the other slice's uncommitted changes (src/shared/lifecycle.js, new.js and update.js modified); the two spot-checked files pass on the clean tree at 41645bd (shared-handoff-gate 8 pass 0 fail, shared-query 23 pass 0 fail); the 1 skip is item 86's guard test (no-private-details.test.js), which self-skips while BACKLOG_PRIVATE_DENYLIST is unset; npm run check exits 0. The fail-before check (049's own): a temporary work_class word in the update help line made the help test and the git grep test fail (recorded in the item's CHUNK 2026-10-31T23:08Z); the word was restored, not committed.
REVIEW: pending
PICKUP: 050 adds its repository-wide negative test in its own new test file (it does not edit .agents/test/shared-no-classes.test.js or its regexes); 049's test stays the pin for the help, COMMANDS.md and the public files. When 050 class-frees the five shared team test files and migrates the legacy class fields out of the open items, 049's git grep scope (src, COMMANDS.md, README.md, templates, CHANGELOG.md) is unchanged.
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

Re-record 2026-11-01 (the rework round after the lead ruling on neutral names, no exception):
the hand-off is re-recorded on the rework commit - the commit that carries this block; the
item's hand-off record pins its 40-hex id. The contract and the pickup are unchanged, and
the rework removes nothing from item 049's files: the guard scan (the guard test's own
algorithm, the deny list set) reports 0 deny-list hits in .agents/test/shared-no-classes.test.js,
the SKILL.md class-options line and this document, so the neutral-name finding needed no
change in this item's files.

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#49
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#50
PRODUCER_AGENT: the claimer of item 49
SOURCE_COMMIT: the rework commit - the commit that carries this block (the item's hand-off record pins the 40-hex id); the contract's test is committed in 89cbd9bf269831dbd814f2c77c32a6af99126d6f and is unchanged by this round ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by this round: the negative test is the contract (impact area 3, tests only). .agents/test/shared-no-classes.test.js (committed in 89cbd9bf269831dbd814f2c77c32a6af99126d6f) asserts the three things above; its help regex detects --classes, its git grep does not. 050's repository-wide test (its DoD line, superseding 049's amendment of 2026-10-29) may find class wording only in test files that assert the fields are absent and dated records under .agents/docs - 049's test file is such a test file, and this document (this re-record included) is such a dated record. 050 edits the five shared team test files and migrates the legacy class fields out of the open items; none of those files is touched by 049 in this round either.
OUTPUTS: unchanged by this round: .agents/test/shared-no-classes.test.js (the three negative tests, committed in 89cbd9b), the one SKILL.md line in the Shared mode section (committed in 9ca97d8), this document (the original record committed in 9971eaa; this re-record in the rework commit).
VERIFICATION: rework round, on Node 24, with BACKLOG_HEADLESS unset and BACKLOG_PRIVATE_DENYLIST set (the lead ruling 2026-11-01: the guard test .agents/test/no-private-details.test.js now runs in every full suite and fails on a hit; a skip means the variable is unset) - the guard scan (the guard test's own algorithm) reports 0 deny-list hits in item 049's files, so this item's rework removes nothing; the item's own test file (node --test .agents/test/shared-no-classes.test.js) 3 pass 0 fail 0 skipped; the full suite (npm test, a clean detached worktree at bb2cb9b, the tip at the run's time; the rework commit adds only this document, which the guard scan reports hit-free, so the run stands for the rework commit's tree): tests 822, pass 794, fail 28, skipped 0 - the 28 failures all live in other items' files (item 86's guard test, failing on the other items' 66 hits at bb2cb9b, all in items 82's and 88's files; and the in-flight pinned tests shared-checkout, shared-handoff-commands, shared-handoff-e2e, shared-handoff-gate, shared-long-name, shared-stale, shared-sync-db, shared-team-compat, shared-team-done, shared-team-handoff and shared-team-lifecycle), none in item 049's files, and the 0 skipped says the guard ran; npm run check exits 0.
REVIEW: the single-stage pass (codex, 2026-10-31) no longer counts for the close under item 088's two-stage rule: the rework round re-requests the review on the rework commit (a Cody pass, then the external pass, both pinned to the work commit); no close until both stages pass on the rework commit.
PICKUP: unchanged by this round: 050 adds its repository-wide negative test in its own new test file (it does not edit .agents/test/shared-no-classes.test.js or its regexes); 049's test stays the pin for the help, COMMANDS.md and the public files. When 050 class-frees the five shared team test files and migrates the legacy class fields out of the open items, 049's git grep scope (src, COMMANDS.md, README.md, templates, CHANGELOG.md) is unchanged.
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF
