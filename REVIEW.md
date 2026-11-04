# Review of pull request #3 — findings

An adversarial review of the whole repository at the tip of `team-cli-parity-1` (472 commits, 147 files, about
25,500 added lines since 2026-10-22), done before any change. Evidence classes: **CONFIRMED** (a command or test
run here reproduces it), **EVIDENCED-RISK** (read in the code, with the query or line that shows it), **UNVERIFIED**.
Severities: **BLOCKING** (breaks the one-mode rule, the public-repository rule, or basic use), **SIMPLIFY** (code
that can go or shrink without a user-facing change), **NOTE**.

Codebase-memory queries are written as `cbm: <tool> <arguments>`; they ran against the index built from this branch
tip (project `home-smooth-wt-local-simplify`, 2043 nodes, 9345 edges).

## What this repository does

`backlog` is a command-line tool that keeps a work queue (items with a number, a name, an objective, a priority and
a status) for one Git repository and branch, for people and coding agents. The pull request adds a second place for
the items to live (a clone of a separate backlog repository, shared by many repositories, synchronised with git) and a
team workflow (claim, refinement stages, review stages, hand-offs, work-in-progress limits). Assumed load: a handful
of people and agents on one machine, each running one command at a time, several of them within the same minute
against one backlog repository.

## 1. Inventory

### Commands and options (from `backlog --help`, every `<command> --help`, README.md, COMMANDS.md and the skill)

Two command sets exist at the same time. Which one runs is decided by a per-user file
(`$XDG_CONFIG_HOME/smooth-backlog-cli/mode.json`, `src/shared/store.js:48-57`), written by the global options
`--use-backlog-repo <path>` and `--use-local-repo` (`src/args.js:38-53`, `src/shared/router.js:21-39`) and by
`backlog setup` (`src/shared/setup.js:93`).

| Set | Commands | Code | Storage |
|---|---|---|---|
| released 1.x ("local mode") | `init [clean|backup]`, `list [new|open|done|archive|branch]`, `branch`, `new <name> [JSON] --description --ac ...`, `set`, `add`, `replace`, `remove`, `priority`, `<item> done`, `move <item> <branch>`, `import --branch`, `archive <item|done>`, `update [check|auto|off|disable]`, `--json --ask --branch --force --top --higher` | `src/args.js` (grammar), `src/commands.js`, `src/storage.js`, `src/schema.js`, `src/prompt.js`, `src/output.js`, `src/integrations.js`, `src/updates.js`, `src/context.js` | `<repo>/.backlog/{config,backlog_manifest,backlog_archive}.json` |
| this branch ("shared mode") | `new` (18 options), `update` (54 options), `query` (24), `next` (3), `pop` (8), `work` (6), `team pop` (2), `move` (4), `archive` (2), `setup` (1) | `src/shared/*.js` (router, store, db, sync, seen, safety, frontmatter, lifecycle, team, wip, handoff*, views, pop, teampop, work, new, update, query, move, archive, setup) | `<backlog-repo>/<owner>/<name>/{phases,archive}/*.md` + `backlog.db` |

Option lists per command are in `COMMANDS.md`; the help text and the parsers agree on them (checked for `query`:
every documented option is parsed and every parsed option is documented).

### Environment variables (cbm: `query_graph MATCH (e:EnvVar) RETURN e.name`, 38 rows)

User-facing: `BACKLOG_HOME`, `BACKLOG_ORIGIN_URL`, `BACKLOG_CLI_BRANCH`, `BACKLOG_LOCK_WAIT_MS`,
`BACKLOG_REVIEW_STALE_SECONDS`, `BACKLOG_HEADLESS` (refused, see 2.9), `TEAM_NAME`, `TEAM_LEAD`, `TEAM_REPOSITORY`,
`TEAM_BRANCH`, `TEAM_ROSTER`, `XDG_CONFIG_HOME`, two variables of a specific agent product for the caller's identity
(see 2.4), one variable naming a run-recorder module (see 2.4). Internal/test: `BACKLOG_RUN_LOCK_HELD`,
`BACKLOG_CLI_REPONAME`, `BACKLOG_CHILD_CALLS_FILE`, `BACKLOG_GUARD_FIXTURE`, `BACKLOG_PRIVATE_DENYLIST`,
`BACKLOG_TEST_SELF`, `BACKLOG_UPGRADE_FROM`, `BACKLOG_RELEASE_RESULT`, `RELEASE_*`, `GITHUB_*`, `GH_TOKEN`.

### Configuration files and keys

`<repo>/.smooth-backlog.json` (`backlog_repository`, `backlog_origin_url`; `src/shared/setup.js:11-25`),
`$XDG_CONFIG_HOME/smooth-backlog-cli/mode.json` (`mode`), `$XDG_CONFIG_HOME/<backlog-name>/home` (the clone path),
`<backlog-repo>/wip-limits.json` (`overall`, `repository`, `branch`, `team`, `agent`, `stale_hours`; `src/shared/wip.js:9-23`),
a roster JSON (`--roster`, `TEAM_ROSTER`), and the agent product's team folder `~/.qwen/teams/<team>/config.json`
plus `handoff/<agent>.json` markers the CLI writes there (`src/shared/team.js:261-330`).

### Records of the use cases

`.agents/docs/specs/*.md` (4 specs) and `.agents/docs/handoffs/*.md` describe the shared-mode work as a port of a
Python oracle, job by job; `COMMANDS.md` is generated from `src/help.js` (`.agents/scripts/sync-commands-md.mjs`);
the skill (`templates/skills/backlog/SKILL.md`) describes both modes. No record describes a workflow end to end
for a person or an agent outside a team; the two records that come closest are the test
`.agents/test/shared-team-flow.test.js` (24 team steps) and the README's "Get started" section (1.x commands only).
The 48 scenarios in `features/*.feature` are the first end-to-end records; `plain-use.feature` records the
workflows the branch refuses (2.3).

## 2. Findings

### 2.1 The mode split — BLOCKING, CONFIRMED

- `src/main.js:17-27`: the mode file decides the command set. cbm: `trace_path getMode inbound` → callers
  `src.main.run` (hop 1), `bin.backlog` (hop 2); `trace_path withStore inbound` → 4 callers (the 1.x path);
  `trace_path execute inbound` → 3 callers. Two disjoint code paths, two data models, two parsers (`src/args.js:5-34`
  for 1.x, one argparse-like parser per `src/shared/*.js` command), two storage layers (`src/storage.js:178-198` and
  `src/shared/store.js`).
- CONFIRMED by running both: in the backlog-repository location `backlog list` → exit 2, "list is not a shared-mode
  command (new, update, query, pop, work, team, next, move, archive)"; inside the repository `backlog new --name x
  --objective o --summary s --depends-on none` → exit 2, "Unknown option --objective"; `backlog query` → "Unknown
  command query"; `backlog update 1 --note x` → "Unknown option --note". The storage location changes which commands
  exist, their options and their output.
- The help names the split (`src/help.js`, "Shared backlog repository mode", "In shared mode backlog update changes
  an item; in local mode it updates the CLI"): the same command name means two different things.
- The BDD baseline (section 3) shows it: 38 of 48 scenarios pass in the backlog repository, 4 of 48 inside it.

### 2.2 Duplicate commands, options and code paths — SIMPLIFY (removals need approval, listed in section 4)

| Duplicate | Where | Recommendation |
|---|---|---|
| `backlog next` ≡ `backlog query --next` | `src/shared/router.js:15` maps `next` to `query.js --next` | keep both: `next` is a one-line alias, no code path |
| `backlog pop` ≡ `backlog query --pop --agent` ≡ `backlog query --next --agent` | `src/shared/query.js:177-181` delegates to `pop.js`; `pop.js:1-5` says its parser and findings repeat `query.js` | keep `pop`; drop `--pop`/`--next --agent` from `query` (same behaviour, documented twice) |
| `backlog work` runs `backlog pop --claim-now` as a child process, then `update` | `src/shared/work.js:50` | keep; one entry point would merge `work` into `pop --claim-now` (approval) |
| `--status done` vs `--close --summary` | `src/shared/update.js:277-294` repeats the close gate of `lifecycle.js:410-432` on a second path | one close path: `--status done` becomes `--close` without a summary, or is refused with the hint |
| 1.x `list/next/new/move/archive/update` vs this branch's commands of the same names with different arguments | `src/args.js:21` vs `src/shared/router.js:13-16` | one vocabulary (decision A, section 4) |
| `update <version>` (1.x self-update) vs `update <item>` | `src/main.js:37`, `src/updates.js` | the self-update is a separate command or gone (decision A) |

### 2.3 Process rules baked into the CLI that block plain use — BLOCKING, CONFIRMED

Run against the branch (features/plain-use.feature, 6 scenarios, all fail in both locations):

- `backlog new` refuses without `--depends-on` (`src/shared/new.js:90`): "--depends-on is required ... or
  --depends-on none". A dependency flag is required to say an item has no dependencies.
- For an item with no team, any `--claim`, `--request-review`, `--review`, `--waiting`, `--close` is refused:
  "incomplete item, missing review_refs, estimate_min, definition_of_done: in a team nobody claims, reviews or works
  it" (`src/shared/lifecycle.js:530-536`: `incomplete.length && (teamScope().repo || steps.length || refining)` — the
  `steps.length` term applies the team rule to every step on every item).
- `--status done` and `--close` are refused for every item until two named review stages passed on the current
  commit (`src/shared/lifecycle.js:286-307,421-426`, `src/shared/update.js:278-283`): "missing the ... review stage".
  A person working alone can never finish an item.
- `backlog pop --agent <name>` for a plain agent answers "chunk: no item fits you: do one small chunk (<= 10 min) of
  refinement or tests ..." (`src/shared/pop.js`), a team instruction, not a queue answer.
- `backlog next` prints a 25-line "NEXT-STEPS-MANDATE" (`src/shared/query.js:90-115`) that orders the reader to run a
  specific code-analysis tool and to end with a specific question tool — instructions for one agent product, printed
  to every user.

The documented team workflow itself (features/team.feature, 6 scenarios) passes: the rules work for teams; the
defect is that they apply to everyone.

### 2.4 Private names and private process in a public repository — BLOCKING, CONFIRMED

- `.agents/test/no-private-details.test.js` with the private deny list set fails at the branch tip on 5 tracked
  files: `.agents/docs/handoffs/2026-10-25-pr3-backlog-interaction-analysis-handoff.md:9`,
  `.agents/docs/handoffs/2026-10-25-pr3-test-first-implementation-handoff.md:5`,
  `.agents/docs/specs/2026-10-22-shared-backlog-mode.md:11`,
  `.agents/docs/specs/2026-10-26-atomic-item-execution-dependency-handoffs.md:50`,
  `.agents/docs/specs/2026-10-28-pr1-learnings.md:118`. CI runs the guard with a synthetic list only, so this never
  failed in CI.
- The CLI's rules name internal agents and one agent product (132 lines in `src/`, 27 in COMMANDS.md, 12 in the
  skill, 43 test files): the first review stage counts only a reviewer whose name starts with an internal agent's
  name or who is a team member (`src/shared/lifecycle.js:350-356,377`), the second stage only two named external
  agents (`src/shared/lifecycle.js:376`, `src/shared/team.js:20`); the default team lead is an internal agent's name
  (`src/shared/team.js:25`); the caller's identity is read from the agent product's environment variables
  (`src/shared/lifecycle.js:233-243`, `src/shared/seen.js:18`); team membership and hand-off markers are read from and
  written into that product's home folder (`src/shared/team.js:261-330`); `bin/backlog.js:9` spawns a Python module
  named by an environment variable with an internal agent's name in it, on every run of the CLI.
- Comments and help cite internal backlog item numbers (173 `item NNN` references in `src/`), owner decisions with
  dates (81 lines), a private Python oracle by file and line, and review rounds of named external agents.
- The shared-mode help names the backlog repository's file layout and folder (`src/shared/query.js:343`, "file:"
  lines of `next`); the owner's own rule for this product is that normal output never names the item files.

### 2.5 The committed database mirror and its conflict repair — SIMPLIFY, EVIDENCED-RISK

`<owner>/<name>/backlog.db` is a SQLite copy of the markdown items (`src/shared/db.js:116-171`: every write rescans
the files into it; `query` reads only it). It is tracked in git in the backlog repository, so two writers conflict on
a binary file. `src/shared/sync.js:217-292` (repairConflicts), `:159-215` (renumber), `src/shared/db.js:182-252`
(replayLocal, reconcileFolders) exist to merge it: set the local copy aside, take upstream's, replay the local rows
and events, rescan, amend, retry. About 320 lines serve a derived file. Risk: `db.js:205` replays columns of rows
present in both copies by inequality with the base; a column both sides changed takes the local value silently.
Correction after the implementation review: the mirror is not purely derived. The item history (`query --events`,
every `logEvent` of `update`, `move`, `archive`, the reviews and claims) lives only in the `event` table of
`backlog.db` (`src/shared/update.js:163,303-323`); the files hold no event log. An untracked cache rebuilt from the
files would lose the history. Recommendation: a later change that writes the events to a file beside the items
(one line per event) and then makes `backlog.db` an ignored cache; the conflict-repair code goes with it. Not done in
this pull request (decision D, section 4).

### 2.6 Dead code, unused options, speculative abstractions — SIMPLIFY

Per-export inventory (deterministic: every `export` of `src/**`, grep of its name in the other `src` files, `bin`,
`.agents/scripts` and `.agents/test`; 255 exports, 38 used by no other `src` file):

- Dead: `src/shared/store.js inQueue` (test-only), `src/shared/team.js memberJoinedMs` (nothing uses it).
- `--headless` and `BACKLOG_HEADLESS=1` exist only to be refused: `src/shared/query.js:179,252`, `src/shared/pop.js:343`,
  documented in `src/help.js:447-452` as "Not in this build". An option that only refuses is dead.
- `src/shared/router.js:41,60`: a module table with "not built yet" fallback for commands that are all built.
- `src/shared/update.js:34-50` `pyStr`: a reimplementation of Python's `repr()` for error messages, so that messages
  match a Python program byte for byte. `src/shared/query.js:45`: `json.dumps(ensure_ascii)` emulation. Parity with a
  retired program is not a requirement of this product.
- Two whitespace definitions of Python's `str.strip()` (`src/shared/update.js:30-32`, `src/shared/team.js:21-23`).
- `src/shared/handoff.js` (165), `handoff-commands.js` (101), `handoff-close.js` (24): a hand-off record with contract,
  verification, outputs, pickup, risks, digests, receipts, accept/reject (9 options of `update`), gating `close` of
  any item another item depends on. No scenario of a person or an agent needs it; only the team's dependency edges do.
- 36 exports used in their own file only (test seams); harmless but they widen the surface a reader has to assume
  is public.
- `src/shared/frontmatter.js` (252 lines): a YAML subset reader/writer. Node has no YAML in its standard library and
  the project has no dependencies, so it stays; it is tested.

### 2.7 Help, README, COMMANDS.md and the skill versus the code — NOTE/SIMPLIFY

- README.md "Command reference" (lines 136-150) lists only the 1.x commands; the branch's commands appear under
  "PR #3" headings as work "under development". COMMANDS.md documents both sets. The skill describes both modes with
  "its commands differ". All three must describe one command set (fixed in this pull request).
- `src/help.js` is 766 lines (COMMANDS.md 1128), of which the top help is 55 lines; `backlog update --help` is 240
  lines for 54 options. The help documents rules ("owner ...: only the claimer closes") rather than usage.

### 2.8 Tests — NOTE

- 63 test files, 15,855 lines, 916 tests (Node 24): green at the tip. 52 files test the shared mode, 9 the 1.x mode.
- Most tests pin exact refusal strings and internal wording (for example the Python `repr` quoting of values), so a
  change of a message fails tests that are not about behaviour. The BDD scenarios test behaviour through the CLI
  only; they are the regression set of the simplification.
- Missing before this review: any test that runs the same workflow in both storage locations (now
  `.agents/test/features.test.js`); any test of a person finishing an item alone.
- The package requires Node >= 24 (`package.json` engines) and uses `node:sqlite`; on Node 22 five process-cleanup
  tests fail. CI pins Node 24; the skill says "Requires Node.js 24+".

### 2.9 Other risks — NOTE, EVIDENCED-RISK

- CONFIRMED (fixed in Task 2): with the items inside the repository, the item folder was `.backlog/<owner>/<name>`
  from the origin URL, else `.backlog/local/<folder name>` — renaming the checkout folder or changing the origin
  orphaned every item (`.agents/test/storage-location.test.js`, "survive a renamed folder"). Inside the repository the
  id is now constant (`store.INSIDE_REPO_ID`).
- CONFIRMED (fixed): `.agents/test/shared-query.test.js` "a row path through a symlink ... is a ghost" passed at the
  tip only because `query --next` failed with the 1.x `{"ok":false}` JSON envelope, which parsed; the behaviour it
  describes never held (the symlink is refused by `store.load`). The test now asserts the refusal.
- NOTE: `query` (the queue view) lists finished and archived items after the open ones; `next`, `pop` and `work` skip
  them. `.agents/scripts/verify-published-package.mjs` filters the open ones.
- NOTE: the per-user file `~/.config/<name>/home` is still read as a storage setting but nothing writes it since the
  mode switches went; it is documented as a file the user may write.
- NOTE (decision D): inside the repository every change is a commit on the current branch (`backlog: <message>`, the
  backlog's paths only) pushed to origin under the same branch name; the repository's own commit hooks run on it, and
  a repository without a reachable origin refuses every write with exit 3 while keeping the commit. The items ride with
  the branch: `--all` shows what the checked-out branch carries. The backlog repository's clone is still pulled before
  every command; the repository itself is not (its branch workflow is the user's).

- `src/shared/store.js:117-127` and `src/storage.js:9-19`: symlink checks are check-then-write (marked as a shortcut
  for a single-user clone); fine at the assumed load.
- `src/shared/sync.js:20`: every pull and push targets `origin/main` of the backlog repository by name; the backlog
  repository's default branch is not configurable.
- `src/shared/store.js:23-45`: a missing clone is answered with a text that tells the reader to "ASK THE USER" — an
  instruction to an agent printed as the CLI's error.

## 3. BDD baseline (before any change)

`node --test .agents/test/features.test.js` at the branch tip, 48 scenarios × 2 locations:

| Area | Scenarios | Backlog repository | Inside the repository |
|---|---|---|---|
| items.feature | 9 | 9 pass | 0 pass |
| queue.feature | 10 | 10 pass | 0 pass |
| agents.feature | 10 | 10 pass | 0 pass |
| team.feature | 6 | 6 pass | 0 pass |
| storage.feature | 6 | 3 pass (`--help` per command, version, output names no files) | 3 pass (`--help` per command, version, unknown command) |
| plain-use.feature | 6 | 0 pass (2.3) | 0 pass |
| legacy.feature | 1 | 0 pass (1.x commands do not exist there) | 1 pass |
| **total** | **48** | **38 pass, 10 fail** | **4 pass, 44 fail** |

The 10 failures in the backlog repository are exactly: the 6 plain-use scenarios (2.3), the 3 storage scenarios that
assert one command set without a mode (2.1), and the legacy scenario (decision A).

## 4. Recommended removals of user-facing commands and options (awaiting approval)

Not changed by this pull request unless approved:

1. The 1.x command set (`init`, `list`, `set`, `add`, `replace`, `remove`, `priority`, `<item> done`, `import`,
   `branch`, `update <version>`, the JSON manifest) — decision A; `list` would stay as an alias of `query`.
2. `query --pop`, `query --next --agent`, `--headless`, `BACKLOG_HEADLESS` — exact duplicates or dead.
3. The team-process gates on items that have no team (`--depends-on` required at creation, refinement fields
   required before any step, two review stages before any close, chunk work for plain agents) — decision B.
4. The agent-product-specific names in flag values, environment variables, output and default values — decision C.
5. The committed `backlog.db` mirror and its conflict-repair code — decision D: recommended as a later change (the
   events must move to a file first, 2.5); not changed here.
6. The hand-off record options of `update` (`--handoff*`, `--accept-handoff`, `--reject-handoff`, `--checks`) as a
   separate concern from the team workflow — not recommended for removal now; recorded as the largest optional
   surface (290 lines, 9 options).
