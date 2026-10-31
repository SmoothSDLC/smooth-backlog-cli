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
PRODUCER_AGENT: the claimer of item 75
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
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: 3ceecff75d68e3c5ef9f289b0f42a63c48c9590e ; BRANCH: team-cli-parity-1
CONTRACT: .agents/test/shared-fixtures.js exports createdSlug(stdout) - the slug a `new` output names, accepting both "created phase phases/<slug>.md" and "created phase <slug>". The 075 tests read every created slug through it (shared-new.test.js is the only file that reads the slug from a new output). When the path leaves the line, edit only the createdSlug regex in shared-fixtures.js; the tests that read the slug stay. The exact-output assertions that contain the full "created phase phases/<slug>.md" line (for example in shared-new.test.js and shared-move-archive.test.js) are the current contract: 57 updates those expected strings when the path leaves the line, after 75 has closed and the files are free.
OUTPUTS: .agents/test/shared-fixtures.js (createdSlug), .agents/test/shared-new.test.js (slug read through createdSlug)
VERIFICATION: same run as the 74 block above (per-file runs and the full suite at 3ceecff / 25d7554, 0 failures)
REVIEW: pending
PICKUP: 57's slices A and B read output in the shared-new, shared-move-archive, shared-query, shared-team-pop and shared-team-work tests; the 075 tests in those files assert the line with the path - 57 edits the expected strings when the path leaves the line; createdSlug stays the one place that tolerates both forms
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#74
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: cf637c5 ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by the codex round 1 review round (2026-10-31): every commit-subject assertion in .agents/test/shared-move-archive.test.js and .agents/test/shared-new.test.js still goes through the one per-file SUBJECT constant (SUBJECT['archive 5'], SUBJECT['move 2 --to-branch'], SUBJECT['move --all-open-of-branch main'], SUBJECT['move 7 --to-repository'], and SUBJECT.newName(name), SUBJECT.newDependsNone(), SUBJECT.newSplitFrom(phase)); when the subjects stop naming the python scripts, edit only those SUBJECT values. The review round touched only exact-output assertions in shared-new, shared-store, shared-sync and shared-team-scope (one commit per file: 25e5695, 305e748, 145364c, cf637c5); shared-move-archive.test.js is unchanged in this round.
OUTPUTS: same as the 3ceecff block above (the eight 075 test files plus createdSlug in shared-fixtures.js); this round's commits: 25e5695 (shared-new), 305e748 (shared-store), 145364c (shared-sync), cf637c5 (shared-team-scope)
VERIFICATION: at cf637c5 on Node 24 (the card shell's BACKLOG_HEADLESS unset): the four files together (node --test): tests 104, pass 104, fail 0, skipped 0; the full suite (npm test, the shared checkout with item 076's work on top): tests 756, pass 756, fail 0, skipped 0; npm run check exits 0; a mutation check broke one source per new or changed 075 test (each mutation made its test fail, the source was restored before the commit)
REVIEW: pending
PICKUP: slice 74 edits the subject lines in shared-update.test.js, shared-move-archive.test.js and shared-sync-db.test.js; in shared-move-archive.test.js only the SUBJECT values change (one line per subject); the SUBJECT constant in shared-new.test.js is left unless a new subject changes; nothing in this round's four commits changes how the subjects are read
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#57
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: cf637c5 ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by the codex round 1 review round (2026-10-31): createdSlug in .agents/test/shared-fixtures.js stays the one place that tolerates both "created phase phases/<slug>.md" and "created phase <slug>"; the exact-output assertions that contain the full "created phase phases/<slug>.md" line (in shared-new.test.js, shared-move-archive.test.js and the new shared-sync.test.js publication tests) are the current contract - 57 edits those expected strings when the path leaves the line, after 75 has closed and the files are free. The review round (25e5695, 305e748, 145364c, cf637c5) changed only assertions in the four files; createdSlug and shared-fixtures.js are unchanged in this round.
OUTPUTS: .agents/test/shared-fixtures.js (createdSlug, unchanged this round), .agents/test/shared-new.test.js and .agents/test/shared-sync.test.js (the created-phase lines they assert)
VERIFICATION: same run as the 74 block above (the four files 104/0/0, the full suite 756/0/0 at cf637c5)
REVIEW: pending
PICKUP: 57's slices A and B read output in the shared-new, shared-move-archive, shared-query, shared-team-pop and shared-team-work tests; the 075 tests in shared-new.test.js and shared-sync.test.js now assert the created-phase line word for word (a successful new prints it to stdout and nothing to stderr) - 57 edits those expected strings when the path leaves the line; createdSlug stays the one place that tolerates both forms
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#74
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: c6ba3fc ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by the codex round 2 review round (2026-10-31): every commit-subject assertion in .agents/test/shared-move-archive.test.js and .agents/test/shared-new.test.js still goes through the one per-file SUBJECT constant; the round 2 changes are exact-output and stderr assertions only, and no commit-subject assertion was added to any other file (the new shared-store commit check asserts the commit's file list, not its subject). The 075 tests now also assert an empty stderr for successful runs and, for the JSON views, the whole output word for word (timestamps and hashes normalized).
OUTPUTS: the round 2 commits (one per changed test file, in order): f5ac773 (shared-move-archive), 22eb746 (shared-new), ec4215e (shared-team-lifecycle), 064e97d (shared-query), c3b1b92 (shared-sync), 364d337 (shared-team-scope), 9be9c7d (shared-store), c6ba3fc (shared-team-stages)
VERIFICATION: at c6ba3fc on Node 24 (the card shell's BACKLOG_HEADLESS unset): the eight 075 test files (node --test): tests 197, pass 197, fail 0, skipped 0; the full suite (npm test, the shared checkout with item 076's uncommitted work on top): tests 762, pass 760, fail 1, skipped 1 - the failure is the settleScenarioGroups ReferenceError in .agents/test/shared-sync-db.test.js, which item 076 owns and has uncommitted changes in; npm run check exits 0; a mutation check broke one source per new or changed 075 assertion (each mutation made its test fail, every source was restored before the commit)
REVIEW: pending
PICKUP: slice 74 edits the subject lines in shared-update.test.js, shared-move-archive.test.js and shared-sync-db.test.js; in shared-move-archive.test.js only the SUBJECT values change (one line per subject); the SUBJECT constant in shared-new.test.js is left unless a new subject changes; nothing in this round's commits changes how the subjects are read
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#57
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: c6ba3fc ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by the codex round 2 review round (2026-10-31): createdSlug in .agents/test/shared-fixtures.js stays the one place that tolerates both "created phase phases/<slug>.md" and "created phase <slug>"; createdSlug and shared-fixtures.js are unchanged in this round. The exact-output assertions that contain the full "created phase phases/<slug>.md" line (in shared-new.test.js, shared-move-archive.test.js and the shared-sync.test.js publication tests, which this round now assert every step word for word, stdout and empty stderr) are the current contract - 57 edits those expected strings when the path leaves the line, after 75 has closed and the files are free.
OUTPUTS: .agents/test/shared-fixtures.js (createdSlug, unchanged this round); the round 2 commits (f5ac773, 22eb746, ec4215e, 064e97d, c3b1b92, 364d337, 9be9c7d, c6ba3fc) changed only assertions in the eight test files
VERIFICATION: same run as the 74 block above (the eight 075 files 197/0/0 at c6ba3fc; the full suite 762/760/1/1, the failure in item 076's uncommitted file)
REVIEW: pending
PICKUP: 57's slices A and B read output in the shared-new, shared-move-archive, shared-query, shared-team-pop and shared-team-work tests; the 075 tests in shared-new.test.js and shared-sync.test.js assert the created-phase line word for word (a successful new prints it to stdout and nothing to stderr) - 57 edits those expected strings when the path leaves the line; createdSlug stays the one place that tolerates both forms
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#74
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: 47bf7af ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by the codex round 3 review round (2026-10-31): every commit-subject assertion in .agents/test/shared-move-archive.test.js and .agents/test/shared-new.test.js still goes through the one per-file SUBJECT constant; no commit-subject assertion was added or changed in this round. The round 3 changes are CLI-only exact-output and stderr assertions: the shared-store reorder and findings tests now drive the CLI (backlog update --replan, backlog query) and assert the planning-event output and the findings banner word for word; the shared-team-plan journey test asserts every plan query word for word (the JSON in the CLI's own dumps format, timestamps normalized, the definition-of-done hint captured from the CLI's own first output because branch work may reword that phrase); the shared-team-stages test normalizes the reviewer model names of the refinement-review text from the CLI's own output (MODEL_A, MODEL_B) so the file names no model; the created slugs in shared-team-stages and shared-team-lifecycle go through createdSlug; every successful step asserts empty stderr.
OUTPUTS: the round 3 commits (one per changed test file): 46383e3 (shared-store), 5681f86 (shared-team-plan), aaa14d8 (shared-team-stages), 47bf7af (shared-team-lifecycle); the shared-team-pop exact-output test of this round landed in 357e362 (item 86's commit pinned the same output text)
VERIFICATION: at 47bf7af on Node 24 (the card shell's BACKLOG_HEADLESS unset): the ten files that carry 075 tests (node --test): tests 226, pass 226, fail 0, skipped 0; the full suite (npm test, the shared checkout with other items' uncommitted work on top - the 059.* hand-off docs, the hand-off close/commands/core tests, shared-sync-db, shared-fixtures): tests 768, pass 767, fail 0, skipped 1 - the skip is item 86's guard test (no-private-details.test.js), which self-skips while BACKLOG_PRIVATE_DENYLIST is unset; npm run check exits 0; a mutation check broke one source per new or changed 075 test (each mutation made its test fail, every source was restored before the commit)
REVIEW: pending
PICKUP: slice 74 edits the subject lines in shared-update.test.js, shared-move-archive.test.js and shared-sync-db.test.js; in shared-move-archive.test.js only the SUBJECT values change (one line per subject), the assertions route through them and stay; the SUBJECT constant in shared-new.test.js is left unless a new subject changes; nothing in this round's commits changes how the subjects are read
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#57
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: 47bf7af ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by the codex round 3 review round (2026-10-31): createdSlug in .agents/test/shared-fixtures.js stays the one place that tolerates both "created phase phases/<slug>.md" and "created phase <slug>"; the round 3 change moved the remaining created-slug reads in shared-team-stages.test.js and shared-team-lifecycle.test.js through createdSlug, so item 057's output change keeps touching one line per read. The exact-output assertions that contain the full "created phase phases/<slug>.md" line are unchanged and remain the current contract - 57 edits those expected strings when the path leaves the line, after 75 has closed and the files are free.
OUTPUTS: .agents/test/shared-fixtures.js (createdSlug, unchanged this round); the round 3 commits (46383e3, 5681f86, aaa14d8, 47bf7af) changed only assertions in the test files; the shared-team-pop exact-output test landed in 357e362 (item 86's commit)
VERIFICATION: same run as the 74 block above (the ten 075 files 226/0/0 at 47bf7af; the full suite 768/767/0 fail/1 skip - the skip is item 86's guard test, which self-skips while BACKLOG_PRIVATE_DENYLIST is unset)
REVIEW: pending
PICKUP: 57's slices A and B read output in the shared-new, shared-move-archive, shared-query, shared-team-pop and shared-team-work tests; the 075 tests in those files assert the line with the path - 57 edits the expected strings when the path leaves the line; createdSlug stays the one place that tolerates both forms
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#74
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: fbd268e ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by the round 4 review round (2026-10-31): every commit-subject assertion in .agents/test/shared-move-archive.test.js and .agents/test/shared-new.test.js still goes through the one per-file SUBJECT constant; no commit-subject assertion was added or changed in this round. The round 4 changes are exact-output assertions and a new CLI-only test: the shared-team-plan journey test pins the definition-of-done hint word for word instead of capturing it from the CLI output; the shared-team-stages test pins the refinement reviewer names from the test's own setup values (the reviewer agent names the CLI accepts, in the capital display form) instead of extracting them from the output and masking them with placeholders; the shared-store reflow case (a row whose file was moved to archive/ outside the CLI) is now checked through the archive command with its exact streams and changed files; the shared-sync 'this writer first' overlap is the overlapping-publication race again (the second writer's push held at the gate is rejected when the first writer publishes, and the second writer settles renumbered onto the first commit and publishes item 2 on top of it).
OUTPUTS: the round 4 commits (one per changed test file, in order): 895622e (shared-team-plan), fe6846b (shared-team-stages), 7243c0b (shared-store), fbd268e (shared-sync)
VERIFICATION: at fbd268e on Node 24 (the agent shell's BACKLOG_HEADLESS unset): the four changed files (node --test): tests 81, pass 81, fail 0, skipped 0; the full suite (npm test, the shared checkout with other items' uncommitted work on top): tests 771, pass 770, fail 0, skipped 1 - the skip is item 86's guard test (no-private-details.test.js), which self-skips while BACKLOG_PRIVATE_DENYLIST is unset; npm run check exits 0; a mutation check broke one source per new or changed 075 test (the plan hint in pop.js, the refinement request text in lifecycle.js, the reflow planning-event line in archive.js, the renumbered line in sync.js; each mutation made its test fail, every source was restored before the commit)
REVIEW: pending
PICKUP: same as the 47bf7af block: slice 74 edits the subject lines in shared-update.test.js, shared-move-archive.test.js and shared-sync-db.test.js; in shared-move-archive.test.js only the SUBJECT values change (one line per subject), the assertions route through them and stay; nothing in this round's commits changes how the subjects are read
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#75
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#57
PRODUCER_AGENT: the claimer of item 75
SOURCE_COMMIT: fbd268e ; BRANCH: team-cli-parity-1
CONTRACT: unchanged by the round 4 review round (2026-10-31): createdSlug in .agents/test/shared-fixtures.js stays the one place that tolerates both "created phase phases/<slug>.md" and "created phase <slug>"; shared-fixtures.js is unchanged in this round. The exact-output assertions that contain the full "created phase phases/<slug>.md" line are unchanged and remain the current contract - 57 edits those expected strings when the path leaves the line, after 75 has closed and the files are free.
OUTPUTS: .agents/test/shared-fixtures.js (createdSlug, unchanged this round); the round 4 commits (895622e, fe6846b, 7243c0b, fbd268e) changed only assertions in the four test files
VERIFICATION: same run as the 74 block above (the four changed files 81/0/0 at fbd268e; the full suite 771/770/0 fail/1 skip - the skip is item 86's guard test, which self-skips while BACKLOG_PRIVATE_DENYLIST is unset)
REVIEW: pending
PICKUP: same as the 47bf7af block: 57's slices A and B read output in the shared-new, shared-move-archive, shared-query, shared-team-pop and shared-team-work tests; the 075 tests in those files assert the line with the path - 57 edits the expected strings when the path leaves the line; createdSlug stays the one place that tolerates both forms
OPEN_RISKS: NONE
END_DEPENDENCY_HANDOFF
