# 097 Pin the class-free state repository-wide - dependency hand-off for item 50

Item 097 (slice B of item 050) delivers the two guards that pin the
class-free state of the shared repository:

- `.agents/test/shared-no-classes-repo.test.js` (new; 404 lines at the
  record time; 18 tests): a repository-wide test confines every occurrence
  of the two legacy front-matter key words (the 049 pattern) to an explicit
  allow-list - a table of {file: {exact trimmed line: max count}} covering
  the dated docs, the negative and compat tests and the codec fixtures.
  An added line, a same-count substitution, a duplicated permitted line and
  a line in a new file fail; a removed line passes (upper bound); unparsed
  git grep output is a violation (round-1 codex F1 rework); the guard's own
  path is the single pathspec exclusion, pinned by its own test.
- `.agents/scripts/check-real-backlog-clean.mjs` (new; 84 lines at the
  record time): resolves the shared store with the CLI own discovery
  (resolveHome in src/shared/store.js, read-only import at line 17, call at
  line 41; no path committed - the resolved folder is printed at run time),
  refuses a store that is not clean before (status check at line 47), runs
  the wrapped command exactly once with no retry (line 62; `--help` only
  counts before the `--` separator - line 30, round-1 codex F2 rework),
  compares status and HEAD after (line 65) and ends with one JSON line
  (line 37): {"store":"unchanged|changed|dirty-before|unreadable",
  "command_exit":<code or null>}; exit 0 only when the store is unchanged
  and the command exited 0 (line 38).
- `.agents/docs/development.md` (one paragraph): when and how to run the
  guard around the test suite.

No src file and no existing test file is edited (the item's DoD). Item 097
changes no CLI behaviour: no help, COMMANDS.md, README, SKILL.md or
CHANGELOG change.

DEPENDENCY_HANDOFF v1
SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#97
DEPENDENT_ITEM: 50
PRODUCER_AGENT: the claimer of item 097
SOURCE_COMMIT: the commit that carries this block; the item's hand-off record pins the 40-hex id ; BRANCH: team-cli-parity-1
CONTRACT: at the pinned commit, the repository-wide allow-list test (.agents/test/shared-no-classes-repo.test.js, 18 tests) confines every occurrence of the two legacy key words (the 049 pattern) to the table's files and line bounds; the guard script (.agents/scripts/check-real-backlog-clean.mjs) resolves the store through resolveHome (import line 17, call line 41), refuses a store that is not clean before (line 47), runs the wrapped command once (line 62; --help only before the separator, line 30), compares after (line 65) and reports the JSON line (line 37) with exit 0 only for an unchanged store and a successful command (line 38). The other child of item 50, item 096 (write() drops the two legacy keys, commit 30d6b64, lead-accepted hand-off), is already closed.
OUTPUTS: .agents/test/shared-no-classes-repo.test.js, .agents/scripts/check-real-backlog-clean.mjs, .agents/docs/development.md (the work commit's files, unchanged from it to the record commit), and this document.
VERIFICATION: at the pinned commit (Node 24, clean shell): node --test .agents/test/shared-no-classes-repo.test.js -> 18 pass, 0 fail, 0 skipped; npm run check -> exit 0; the 049-pattern git grep over the repository with the guard's own path excluded -> 76 lines in 19 files, the file list equal to the table keys; seeded guard runs on temporary git stores -> {"store":"unchanged","command_exit":0} with exit 0 for a clean store and a passing command, a changed store and exit 1 when status or HEAD moved, {"store":"dirty-before","command_exit":null} with the wrapped command not run on a dirty store. Both review stages re-ran this battery; the item record carries the full evidence.
PICKUP: item 50's close (the lead's final acceptance) re-runs at the closing commit: node --test .agents/test/shared-no-classes-repo.test.js (18 pass) and .agents/test/shared-legacy-fields.test.js (item 096, 6 pass); node .agents/scripts/check-real-backlog-clean.mjs -- npm test in a quiet period (no other session writing to the store), expecting {"store":"unchanged"} when the run leaves the store untouched; the no-new-failure comparison of npm test against the baseline recorded at item 50's close; any new file or line that legitimately carries the legacy key words (a new test, a dated doc, a fixture) must extend the table in the allow-list test - the repository-wide test enforces that.
OPEN_RISKS: the guard needs a quiet store; the live unchanged/exit-0 run around the full suite is the gate of items 094 and 084 per the round-6 lead ruling (the branch's base failures are owned by item 094). The allow-list table is an upper bound: it is extended, never bypassed, when new permitted lines appear.
END_DEPENDENCY_HANDOFF
