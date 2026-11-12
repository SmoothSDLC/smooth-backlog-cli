# Fix task 6b: four small follow-ups of Task 6 (findings of the quality review after its merge)
1. src/shared/team-publish.js: publishTeam checks once, at its start, that git is 2.40 or later (it needs `merge-tree --write-tree`); an older git refuses with exit 2 and `❌ backlog: team commands need git 2.40 or later (found <version>)`, nothing written. Test it by putting a fake `git` first on PATH in a scratch dir that prints an older version for `git --version` and delegates everything else to the real git.
2. src/team/help.js (the pop sentence) and README (the Task 6 paragraph): one clause saying a rerun can end `backlog team pop` idle (exit 3) while a ready item still exists, because an item already offered in this run is not offered again.
3. .agents/test/team-concurrency.test.js: the "kept changing" pop test seeds 20 ready items instead of 8 (margin against the drained-queue exit 3).
4. The same file: `bump` writes a counter, not `Date.now() % 100000`.
Docs last: regenerate COMMANDS.md and the skill references with the sync script; add a CHANGELOG line for (1).
