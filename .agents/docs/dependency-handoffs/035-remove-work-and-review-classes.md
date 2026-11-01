# 035 Remove work and review classes - dependency hand-off for item 84

Item 035 is the close-out of the class-removal split of PR3. Its code is item 048
(995f6b5, fae5660: the work and review classes out of the CLI code of src/shared,
chunk: true marks chunk work) and item 049 (89cbd9b, 9971eaa, e498d34: the class
options out of the help and COMMANDS.md, the built-in skill line, and the negative
test .agents/test/shared-no-classes.test.js); its tests and migration are item 050
(class-free the five shared team test files, migrate the legacy class fields out of
the open items, keep npm test clean on the shared repository); item 074 removes the
Python script names from the CLI commit subjects and the source comments. Item 035
owns no files: after 049, 050 and 074 are done it runs the section-3 checks on a
clean tree and closes, citing the four items' commits. This document hands that
state to the PR3 close gate (item 084), whose documentation coherence check and
end-to-end scenario test re-verify it.

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#35
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#84
PRODUCER_AGENT: the claimer of item 35 (records the hand-off in the item)
SOURCE_COMMIT: the commit that carries this block; the item's hand-off record pins the 40-hex id; the class-removal code is committed in 995f6b5 (048), fae5660 (048 review fixes), 89cbd9b (049 negative test), 9971eaa (049 skill line and hand-off document) and e498d34 (049 rework) ; BRANCH: team-cli-parity-1
CONTRACT: no part of the CLI reads, writes, accepts, documents or suggests work_class, review_classes, --classes, --review-classes or class profiles; an item carrying old class fields behaves exactly like one without them; chunk work is chunk: true. On the branch: 048 (995f6b5, fae5660) removed the classes from src/shared (team.js, update.js, new.js); 049 (89cbd9b, 9971eaa, e498d34) removed the class options from the help, COMMANDS.md and the built-in skill and committed the negative test .agents/test/shared-no-classes.test.js, which pins the class options out of every help text, COMMANDS.md and the public files (src, README.md, templates, CHANGELOG.md); 050 (not done at the record time) class-frees the five shared team test files and migrates the legacy class fields out of the open items; 074 (not done at the record time) removes the Python script names from the commit subjects and the source comments.
OUTPUTS: no code files (035 is a close-out and owns none); this document.
VERIFICATION: at the record time (clean tree at c6bdb53, Node 24, BACKLOG_HEADLESS unset): the class git grep over src, COMMANDS.md, README.md, templates and CHANGELOG.md prints nothing; node --test .agents/test/shared-team-compat.test.js .agents/test/shared-no-classes.test.js is 9 pass 0 fail 0 skipped, including 'an item with old work_class and review_classes fields behaves exactly like one without them (owner 2026-10-28)'; grep -rnE '\.py\b' src still hits the commit subjects (update.js line 118, move.js line 47, archive.js line 104) and the source comments - 074's remaining work; the full suite (npm test) is 837 tests, 810 pass, 27 fail, 0 skipped: the 23 failures named in the item 082 commit at this tree (ten reflow, eight 059.4 hand-off gate, three shared-update, one 088 two-stage, one 047 long-name) plus four queue-view tests that failed only under the concurrent shared-store runs of the in-flight items 049 and 082 (the 042 across-repositories test in shared-foreign-deps, the 075 --next plan test and '`backlog next` is --next' in shared-query, test_no_new_flags_unchanged in shared-team-pop); none of the failures is in a file item 035 owns (it owns none). 035's close, after 049, 050 and 074 are done, re-runs all four section-3 checks on a clean tree and records them in its close summary with the four items' commits; item 084's gate re-verifies the same state.
REVIEW: pending
PICKUP: 084 re-runs the section-3 checks at the gate: the class git grep (prints nothing), node --test .agents/test/shared-team-compat.test.js .agents/test/shared-no-classes.test.js, grep -rnE '\.py\b' src (prints nothing once 074 is done), npm test on Node 24 (0 failures, 0 skipped). The documentation coherence check then asserts the class options against the help, COMMANDS.md, SKILL.md and README, and the end-to-end scenario test exercises the workflow with no class option anywhere.
OPEN_RISKS: at the record time 049 is in_progress (its review passed; its hand-off to 050 is recorded with the document 049-no-classes-test.md), 050 is pending (depends on 049) and 074 is pending (its dependency 062 done); the close-time re-run happens only after all three are done, and the gate's re-run catches any change they make to the checked files.
END_DEPENDENCY_HANDOFF
