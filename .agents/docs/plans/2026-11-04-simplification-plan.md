# Simplification plan

> For agentic workers: implement task by task with superpowers:executing-plans; every code change starts with a
> failing test (superpowers:test-driven-development), is reviewed with ponytail-review, and leaves `npm test`,
> `npm run check` and every BDD scenario green before the commit.

**Goal:** one backlog, one CLI: the same commands, options, output and help wherever the item files live.

**Architecture:** the branch's command set (`src/shared/*.js`) is the CLI. Where the items live is one resolution
step (`src/shared/store.js resolveHome()`): a backlog repository clone when one is configured, else a folder inside
the repository. Everything above that step is unchanged; the git synchronisation (`src/shared/sync.js`) is a no-op
for the folder inside the repository. The 1.x code path, the mode file and the mode options are deleted.

**Tech stack:** Node >= 24, no dependencies, `node --test`, `node:sqlite`.

**Spec:** REVIEW.md (findings and the BDD baseline), features/*.feature (the behaviour that must hold).

## Global constraints

- Public repository: no private repositories, hosts, machines, paths, ports, agent or team names, model names,
  backlog item numbers or owner decisions in code, tests, docs or commit messages. Commit author `<author>`, no trailers.
- No new test framework or dependency.
- A user-facing command or option is removed only with the owner's approval (decisions A-D in REVIEW.md section 4);
  tasks that need an approval say so and wait.
- Deletion over addition. Every task ends with `npm test` green (0 fail, 0 skipped), `npm run check` green and the
  BDD scenarios of both locations green, except where a task's note says which scenarios still wait for a decision.

## Review focus

Inputs no scenario exercises yet, most likely to bite first; each gets its test in the task that owns the code:

1. A repository with no `origin` remote, items inside the repository: the repository id must still be stable
   (Task 1: `local/<folder-name>`).
2. A repository that has both an old `.backlog/backlog_manifest.json` and the new `.backlog/<owner>/<name>` folder
   (Task 2: the old manifest is reported once, never read).
3. A backlog repository configured (origin URL set) but not cloned: the error names `backlog setup`, never falls
   back to the folder inside the repository silently (Task 1).
4. The lock, views and journal files of the folder inside the repository must not be committed with it
   (Task 1: `.backlog/.gitignore`).
5. A read command (`query`) in a repository that has no backlog yet must not create item folders (Task 1: only the
   state folder and its ignore file are created).

---

### Task 1: the storage location behind one resolution step (no decision needed)

**Files:** Modify `src/shared/store.js` (resolveHome, lockPath, journalFile, beginJournal, repoId), `src/shared/seen.js`
(viewsFile), `src/shared/sync.js` (pull, commit: no-op without a clone), `src/shared/router.js` (run: no origin → the
folder inside the repository), `src/shared/setup.js` (ORIGIN_REFUSAL only for setup's clone step). Test:
`.agents/test/storage-location.test.js`.

**Interfaces:** `resolveHome() → { home, remote: boolean, ask: null | {code, text} }`; `stateDir(home) → path`
(`<home>/.git` for a clone, `<home>/.state` otherwise); `repoId(cwd)` returns `local/<basename>` when there is no
origin. Removed lines: the `~/git/<name>` default-then-ask path of resolveHome (the ask stays only for a configured
but missing clone).

- [ ] Test (RED): with no `BACKLOG_ORIGIN_URL`, no `.smooth-backlog.json` and no `BACKLOG_HOME`, `backlog new ... `
  from a consumer repository creates `<repo>/.backlog/acme/demo/phases/001-x.md`, `.backlog/.gitignore` holds
  `.state/`, `query --phase 1 --json` reads it back, `git -C <repo> status --porcelain` lists `.backlog/` but no
  `.state` file; a repository without `origin` gets repository `local/<folder>`; with the origin URL set and no clone,
  `backlog query` exits 2 with "backlog setup" in the message.
- [ ] Run: `node --test .agents/test/storage-location.test.js` → FAIL (ORIGIN refusal).
- [ ] Implement resolveHome/stateDir/repoId; pull and commit return early when `!existsSync(join(home, '.git'))`.
- [ ] Run the new test, `npm test`, `node --test .agents/test/features.test.js`: the remote scenarios stay at 38/48;
  the local scenarios cannot pass yet (the mode file still selects the 1.x parser) — noted, not green.
- [ ] Commit.

**Risk:** low; every remote path is unchanged. **Removes:** ~15 lines (the default-path probing), adds ~25.

### Task 2: one command set, no mode (needs decision A)

**Files:** Modify `src/main.js` (dispatch: every command through `src/shared/router.js`), `src/args.js` (delete
`modeOptions`, `sharedCommand`, the 1.x grammar), `src/shared/router.js` (TABLE gains `list: ['./query.js']`; delete
`switchMode`), `src/shared/store.js` (delete getMode/setMode), `src/shared/setup.js` (delete setMode call),
`src/help.js` (one command list, no mode section). Delete `src/commands.js`, `src/storage.js` (move `locked`,
`atomicWrite`, `asChild`, `acquireMarker`, `releaseMarker` into `src/shared/store.js` or a `src/lock.js`),
`src/schema.js`, `src/prompt.js`, `src/output.js`, `src/integrations.js` (keep `adapters`, `templateRoot`, `safeTree`
for setup), `src/updates.js`, `src/process.js`, `src/context.js`, and the 1.x tests (`cli`, `storage`, `updates`,
`interactive`, `skill-commands`, `integrations`, `shared-mode` parts about the mode switch). A repository holding
`.backlog/backlog_manifest.json` gets one line on stderr: "the 1.x JSON backlog is not read by this version; recreate
its items with backlog new".

- [ ] Test (RED): features/storage.feature "the help lists one command set, with no mode", "list is the queue", "an
  unknown command is refused without naming a mode" in both locations; every local scenario of items/queue/agents/team.
- [ ] Implement; delete; regenerate COMMANDS.md (`node .agents/scripts/sync-commands-md.mjs`).
- [ ] Run everything; commit.

**Risk:** medium: the deletion is large; the BDD scenarios and the shared tests cover the kept paths. **Removes:**
~1,000 source lines, ~800 test lines, 9 test files.

### Task 3: public-repository scrub (no decision needed for these items)

**Files:** the 5 documents the deny-list guard names (REVIEW.md 2.4): remove the private details. `bin/backlog.js:9`:
delete the run-recorder hook (it names an internal agent and spawns a process on every run). `src/shared/query.js:90-115`:
delete the mandate text and its `say`. Output: `query`'s header and `next`'s "file:" line no longer print the folder
or file path (the product's own rule). Comments: internal item numbers and owner-decision citations in `src/` are
rewritten as neutral rationale or deleted. Test: `.agents/test/no-private-details.test.js` with the private list set
(run on the owner's machine), the synthetic list in CI; `.agents/test/package.test.js` for the hook removal.

- [ ] Run the guard with the private list → FAIL on 5 files; fix; → PASS.
- [ ] Tests pinning the mandate text and the file line: change to the new output (behaviour test: the item is named).
- [ ] Commit.

**Risk:** low. **Removes:** ~60 lines.

### Task 4: team rules apply to team items only (needs decision B)

**Files:** `src/shared/lifecycle.js` step(): the incomplete-item refusal and the stage refusals apply when
`before.team || teamScope().repo || teamName()`; closeItem/`--status done`: the review stages apply to team items;
`src/shared/new.js:90`: `--depends-on` optional (absent = none); `src/shared/pop.js`: an agent with no team with no fitting
item is `idle`, not `chunk`. Test: features/plain-use.feature (6 scenarios) and the team scenarios unchanged.

### Task 5: no internal names in rules, flags, variables or output (needs decision C)

**Files:** `src/shared/lifecycle.js` (stages: team review / external review; `BACKLOG_EXTERNAL_REVIEWERS`),
`src/shared/team.js` (`TEAM_LEAD` without default; `BACKLOG_TEAM_DIR`), `src/shared/seen.js` and `lifecycle.js`
(`BACKLOG_AGENT`), `src/help.js`, the skill, COMMANDS.md, the tests that use the names. Test: features/agents.feature
and team.feature rewritten with neutral names; the deny list extended with the agent names on the owner's machine.

### Task 6: the database mirror as a local cache (decision D: not in this pull request)

The plan above assumed the mirror is derived from the files. It is not: the item history (`query --events`) lives
only in its `event` table (REVIEW.md 2.5). Making it an ignored cache needs the events written to a file beside the
items first (one line per event), then `db.connect` rebuilds the mirror from items and events when the file is absent
or older, and `src/shared/sync.js` repairConflicts/renumber-mirror/localDbs and `src/shared/db.js` replayLocal go.
Recommended as a later change; the backlog repository's content (an untracked `backlog.db`) changes with it.

Done (ea1ed36, then 6b6b102, 0efb892, f857fef): the events are in the item files, `db.connect` rebuilds a per-clone cache from the items at every command, under the clone's state folder, and the database conflict repair, the replay, the ghost findings and the database rollback are removed.

### Task 7: documentation describes one mode

**Files:** README.md (command reference = the one set; "where the items live" section), COMMANDS.md (regenerated),
`templates/skills/backlog/SKILL.md` and `references/commands.md` (one workflow), `src/help.js`.

- [ ] Grep guard: `grep -riE "shared mode|local mode|use-local-repo|use-backlog-repo" README.md COMMANDS.md
  templates src` → no hits; added to features/storage.feature as the help scenario.

### Task 8: final verification

- [ ] `npm test` (0 fail, 0 skipped), `npm run check`, `node --test .agents/test/features.test.js` (96/96),
  codebase-memory re-index and `search_code` for the mode names → 0 hits; the diff against the branch tip removes
  more lines than it adds; REVIEW-LOG.md complete; ponytail-review of the whole diff; requesting-code-review.

## Decisions received (2026-11-04)

- A: option b — the branch's command set is the CLI; 1.x names stay only as exact aliases (`list` = `query`); the owner
  reviews the keep/remove list before the 1.x code is deleted (Task 2 waits for that go). The storage setting is a folder
  path: a git repository there is synchronised, any other folder is used as it is; the clone's origin and branch are not
  validated per command; nothing of a remote backlog is ever written into the repository.
- B: the team rules apply only to team work (an item with a team, or a session bound to a team); a single user who
  uses no team command uses the whole CLI unrestrained. Done (Task 4).
- C: no agent, model or product name in the CLI: teams, members, leads and review rules are configuration of the
  backlog folder (`teams.json`); the review rule of a team is "N members of team X and M members of team Y pass the
  current work commit". Done in src (Task 5); the tests follow.
- D (2026-11-04): the backlog is always a git repository, and the CLI commits and pushes every change to it - the
  repository itself when the items live inside it (its current branch, the backlog's paths only, pushed to origin under
  the same branch name; nothing pulled, the repository's own branch workflow does that), or the backlog repository's
  clone (pulled before every command, pushed after every change). The storage location is a folder path and nothing
  more; the structure of the backlog is never shown except in a failure. Done in Task 2 (`sync.commitInRepository`,
  features/storage.feature "every change is committed and pushed"). The mirror itself stays as it is (Task 6).

## Order

1 → 3 → 4 → 5 → 7 → 2 (prepared and green; committed on the owner's go) · 8. Task 6 is a later change.
Phase 1 (duplicates, output, allow-list test): done.
