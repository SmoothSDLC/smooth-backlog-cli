# 050 Migrate the legacy class fields - dependency hand-off for item 84

Item 050 is the class-removal tracking item of PR3. Its children carry the
implementation: item 096 strips the two legacy front-matter keys (work_class
and review_classes) from every item the CLI next writes (src/shared/store.js
write(), the new test .agents/test/shared-legacy-fields.test.js, the
stored-field sentence in the help text of src/help.js, and the documentation
per the AGENTS.md rule), and item 097 pins the repository-wide class-word
allow-list (.agents/test/shared-no-classes-repo.test.js) and the
real-backlog-clean guard (.agents/scripts/check-real-backlog-clean.mjs). The
five shared team test files were class-freed by item 048 (commit 995f6b5).
Item 050 owns no code files; it closes when both children are closed and the
lead runs the final no-new-failure acceptance at the closing commit (as of
2026-11-03 the lead's baseline-comparison close gate is a proposal pending
owner acceptance; the owner's 0-failures/0-skipped rule stands until then and
applies at this gate). The legacy field is the front-matter representation
only; the body field lines of store items are dated records, out of scope
(recorded in item 50, round 9). This document hands that state to the PR3
close gate (item 084), whose end-to-end validation re-verifies it.

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#50
DEPENDENT_ITEM: 84
PRODUCER_AGENT: the team lead (the refinement session of item 50)
SOURCE_COMMIT: the commit that carries this block; the item's hand-off record pins the 40-hex id ; BRANCH: team-cli-parity-1
CONTRACT: the CLI's write() drops the two legacy front-matter keys work_class and review_classes from every item it writes (child 096); the five shared team test files are class-free (048, 995f6b5); the repository-wide class-word allow-list test and the real-backlog-clean guard exist and pass (child 097); the help text (src/help.js) carries the stored-field migration sentence without naming the class keys, so 049's frozen git-grep over src stays green; the documentation per AGENTS.md (SKILL.md, the help, COMMANDS.md via the sync script, CHANGELOG.md) lands in the children's changes. At the record time 0 open items of the shared store carry the legacy front-matter keys (front-matter-anchored grep: 0 of 470 phase files; the plain word grep's hits are body text - e.g. a status-done item of another store whose field line reads 'work_class ... | review_classes ...' - dated records), so the migration is per-write behaviour: items written after the change lose the keys, and items still carrying them lose them on their next write.
OUTPUTS: no code files (050 is a tracking item and owns none); this document.
VERIFICATION: at the record time (clean tree, Node 24.22.0): front-matter-anchored grep over the shared store's phase files - 0 of 470 (sanity: the ^seq: anchor matches 470/470; the store archive run: 0); the plain word grep over the same glob - 111 files, all body text (26 in this repository's own store; 66 in the underscore forms only across the store); the children's test files are not on the branch yet (096 and 097 are in refinement; their DoDs name them); the branch baseline (npm test, Node 24) is 26 failing tests at the recorded baseline commit - 050's close uses the no-new-failure comparison against the baseline recorded at the close.
REVIEW: pending (item 50's refinement review of this record; the children's closures precede the close)
PICKUP: 084 re-verifies at the gate: the front-matter-anchored grep over the shared store's phase files (0 open items carry the keys); node --test .agents/test/shared-legacy-fields.test.js .agents/test/shared-no-classes-repo.test.js (the children's files, both passing); node .agents/scripts/check-real-backlog-clean.mjs around npm test (the real clone's status and HEAD unchanged); npm test on Node 24 with the no-new-failure comparison against the baseline recorded at 050's close, and the owner's 0-failures/0-skipped rule applied at this gate.
OPEN_RISKS: 096 and 097 are in refinement at the record time; their code and tests are not on the branch yet, so the gate's re-run catches their changes. The baseline-comparison close gate is a lead proposal pending owner acceptance; the owner's rule stands until then.
END_DEPENDENCY_HANDOFF
