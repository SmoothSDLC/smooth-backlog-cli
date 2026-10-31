# 075 CLI-only tests - dependency hand-off for same-file items 74 and 57

The tests of item 075 (CLI-only checks for the behaviours item 062's deleted comparison
tests covered) are the contract (impact area 3, tests only): every commit-subject assertion
in the scoped test files goes through ONE per-file SUBJECT constant, and every slug a `new`
output names is read through `createdSlug` in shared-fixtures.js - so item 074's subject
change and item 057's output change each edit one line, not twenty. The eight test files
were committed one per file in the 075 review round (shared-team-lifecycle first, because
item 078 needs that file free), then the full suite ran green.

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#74
PRODUCER_AGENT: cody-card2
SOURCE_COMMIT: 3ceecff75d68e3c5ef9f289b0f42a63c48c9590e ; BRANCH: team-cli-parity-1
CONTRACT: the tests are the contract (impact area 3, tests only). Every commit-subject assertion in .agents/test/shared-move-archive.test.js and .agents/test/shared-new.test.js goes through the SUBJECT constant at the top of the file: SUBJECT['archive 5'], SUBJECT['move 2 --to-branch'], SUBJECT['move --all-open-of-branch main'], SUBJECT['move 7 --to-repository'] in shared-move-archive.test.js, and SUBJECT.newName(name), SUBJECT.newDependsNone(), SUBJECT.newSplitFrom(phase) in shared-new.test.js. When the subjects stop naming the python scripts, edit only those SUBJECT values; no assertion changes. No other file this item committed contains a commit-subject assertion.
OUTPUTS: .agents/test/shared-new.test.js, shared-move-archive.test.js, shared-store.test.js, shared-query.test.js, shared-sync.test.js, shared-team-lifecycle.test.js, shared-team-scope.test.js, shared-team-stages.test.js (each committed alone in the 075 review round: ec09c48, c4d8803, a16afda, 72b4a53, b857222, 47fc85c, a20bca3, 3ceecff), .agents/test/shared-fixtures.js (createdSlug; committed with shared-new.test.js in 47fc85c)
VERIFICATION: at 3ceecff on Node 24 (the card shell's BACKLOG_HEADLESS unset): per-file runs - shared-team-lifecycle 11 pass 0 fail, shared-team-scope 9, shared-team-stages 17, shared-store 25, shared-move-archive 42, shared-new 42, shared-sync 28, shared-query 23, all 0 fail; the full suite (the shared checkout at 25d7554, on top of item 076's own work): tests 756, pass 756, fail 0, skipped 0, exit 0
REVIEW: pending
PICKUP: slice 74 edits the subject lines in shared-update.test.js, shared-move-archive.test.js and shared-sync-db.test.js; in shared-move-archive.test.js only the SUBJECT values change (one line per subject), the assertions route through them and stay; the SUBJECT constant in shared-new.test.js is left unless a new subject changes
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#57
PRODUCER_AGENT: cody-card2
SOURCE_COMMIT: 3ceecff75d68e3c5ef9f289b0f42a63c48c9590e ; BRANCH: team-cli-parity-1
CONTRACT: .agents/test/shared-fixtures.js exports createdSlug(stdout) - the slug a `new` output names, accepting both "created phase phases/<slug>.md" and "created phase <slug>". The 075 tests read every created slug through it (shared-new.test.js is the only file that reads the slug from a new output). When the path leaves the line, edit only the createdSlug regex in shared-fixtures.js; the tests that read the slug stay. The exact-output assertions that contain the full "created phase phases/<slug>.md" line (for example in shared-new.test.js and shared-move-archive.test.js) are the current contract: 57 updates those expected strings when the path leaves the line, after 75 has closed and the files are free.
OUTPUTS: .agents/test/shared-fixtures.js (createdSlug), .agents/test/shared-new.test.js (slug read through createdSlug)
VERIFICATION: same run as the 74 block above (per-file runs and the full suite at 3ceecff / 25d7554, 0 failures)
REVIEW: pending
PICKUP: 57's slices A and B read output in the shared-new, shared-move-archive, shared-query, shared-team-pop and shared-team-work tests; the 075 tests in those files assert the line with the path - 57 edits the expected strings when the path leaves the line; createdSlug stays the one place that tolerates both forms
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF
