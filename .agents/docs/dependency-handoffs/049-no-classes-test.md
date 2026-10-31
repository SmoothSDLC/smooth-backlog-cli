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
