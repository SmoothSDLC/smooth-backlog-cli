# 083 Closed items doc coverage - dependency hand-off for item 84

Item 083 is the PR3 closing gate: every user-visible behaviour of the 30
closed items (23 25 29 33 34 36 37 38 39 40 41 42 43 44 45 46 47 48 51 52 53
56 58 60 61 62 63 68 69 70) is described in SKILL.md, the help, COMMANDS.md,
README.md and CHANGELOG.md, checked by the coverage matrix
(.agents/docs/analysis/2026-10-31-closed-items-doc-coverage.md) and by
.agents/test/doc-examples.test.js, which discovers and runs every example of
those texts. The matrix, the documentation fixes and the examples test are
built by the child items 99-102 (serialised; all five documentation files are
shared); 083 enforces the closing standard recorded in its item (the
round-2 closing definition of done plus the round-3/4 additions).

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#83
DEPENDENT_ITEM: SmoothSDLC/smooth-backlog-cli#84
PRODUCER_AGENT: the refiner of item 83 (records the hand-off in item 083)
SOURCE_COMMIT: 1239fcc49a75fc0367c5bd83e16b65e09c9e3fe6; BRANCH: team-cli-parity-1
CONTRACT: at the closing commit the five texts (templates/skills/backlog/SKILL.md, the src/help.js help table, COMMANDS.md produced only through .agents/scripts/sync-commands-md.mjs, README.md, CHANGELOG.md) agree with the CLI on every user-visible behaviour of the 30 closed items: the coverage matrix has no MISSING or WRONG cell; .agents/test/doc-examples.test.js discovers and runs every example of SKILL.md, README.md and the help text as shown, in a temp fixture, including examples the slices 100-102 add; npm test on Node 24 at the closing commit is 0 failures and 0 skipped (only named owner exceptions, resolved before the close); a completed GitHub CI run with conclusion success whose head SHA is the closing commit (manual dispatch, run id and SHA cited); the topology deploy of the CLI and its skill succeeded and its smoke test passed (or the close summary records "no deploy needed" with the reason); the topology team-lead and team-member skill gaps found are handed to topology item 297 and named in the close summary.
OUTPUTS: the five documentation files, the coverage matrix, .agents/test/doc-examples.test.js (created by slice 99), this document.
VERIFICATION: at the record time (2026-11-03; the commit that carries this block is pinned in SOURCE_COMMIT above): children 99-102 are pending at stage refining; the matrix and doc-examples.test.js do not exist in the checkout yet (verified by find); the gate's checks run at the closing commit, after 99-102 are closed. The graph record for the documentation-consumer edges (src/help.js -> src/shared/router.js run, the router that serves <command> --help; src/shared/seen.js changedSince -> src/shared/query.js changedReport, the query --changed producer-to-consumer edge) and detect_changes against origin/main (134 changed files) is in item 083's round-6 record.
REVIEW: pending
PICKUP: 084 re-runs the closing gate at its own gate: the matrix is complete with no MISSING or WRONG cell, doc-examples.test.js passes, npm test on Node 24 at the closing commit is 0 failures and 0 skipped, the CI run succeeded at the closing SHA (run id and SHA cited), the deploy result is cited, the topology hand-off is named.
OPEN_RISKS: children 99-102 are open (stage refining) at the record time; the gate cannot pass until they close. The area-2 validator gap (the CLI's own skill does not ship a scripts/validate-skill.py, so the area-2 check "validate-skill.py passes" cannot yet run against templates/skills/backlog) is recorded as an accepted follow-up in item 083's round-6 record.
END_DEPENDENCY_HANDOFF
