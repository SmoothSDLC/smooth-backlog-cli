# Task 12 packet: Tests that turn from "refuses" to "does not see" (B17c)


## 1. Goal & Scope

Goal: no test file about user commands still describes, titles or asserts "refuses a team item" where the behaviour is now "does not see it" (`❌ no phase '<item>'`, exit 1, nothing written), the tests whose command Task 13 or Task 14 changes are marked with those tasks' names and none is deleted or skipped.

Out of scope: any change of `src/`; the new `--show-all` behaviour and its tests (Tasks 11, 13, 14); the claim, release and close refusals (Task 13 deletes them with their tests); the `clean` refusal test and the `archive` refusal of an open team item (Task 14); `plain-team-env.test.js` (Task 19).

## 2. Architectural Decision Rules

- Owner ruling R3a (`.agents/docs/plans/2026-11-09-team-rules-engine/00-owner-rulings.md`): "User commands read and change only items that have no team. They ignore team items completely: a team item is not listed, shown, counted, queued, moved, archived, imported, cleaned or changed by a user command, and a number that names one answers as if no such item existed. Team items are reached only through `backlog team` commands." (R19 and R16 lift the part about changing and showing, with `--show-all`: Tasks 11, 13, 14.)
- Owner ruling R16 (same file): "User commands ignore team items by default and show them only when `--show-all` is given. This replaces decision 3 (references between user items and team items): by default a reference to a team item reads as missing; with the flag it is seen."
- Design chapter 04 section 8 (`design/04-team-commands.md`), row "which items, by default": "only items without a team. Every read filters out items whose `team` is set before anything else, and a number that names a team item answers exactly as a number no item holds (`backlog show 90` prints `❌ no phase '90'`, case COD-06)."
- Command matrix (`01-command-behaviour-matrix.md`): "Only items without a team. Items with a team are ignored completely: not listed, shown, counted, queued, moved, archived, imported, cleaned or changed, and a number that names one answers as if no such item existed".
- Spec B17c (batch specification B15-B21, section 4): "Files: `.agents/test/plain-team-items.test.js` (rewritten: every "refuses a team item" becomes "does not see it", and the tests of the commands B18 changes are marked by their B18 test names and left for B18a and B18b to finish; none is deleted in B17), `.agents/test/team-boundary.test.js` (the user side; the team side is B14d's), `.agents/test/shared-query.test.js` and `.agents/test/shared-severity.test.js` only where they create team items. Must not: skip a test."
- Plan Task 12: "**Files:** `.agents/test/plain-team-items.test.js` (every "refuses a team item" becomes "does not see it"; tests of commands Task 13 and Task 14 change are marked with those tasks' test names, none deleted), `.agents/test/team-boundary.test.js` (user side), `.agents/test/shared-query.test.js`, `.agents/test/shared-severity.test.js` (only where they create team items)." and "**Must not:** skip a test."
- Plan Global Constraints: "No test is deleted, skipped or weakened except where its task names it. A test whose expectation changes is named in the commit body with the reason." and "No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id." and "Every commit leaves the whole suite green".
- review record (Task 10 review, carry): "Tasks 9/12/13 keep createdSlug/TEAM_VALUE/TEAM_BOOL while importers remain." (Task 4 review.) And (Task 10 post-merge review, #3): "dead code sequence.js:48-55 import --higher team check, IMPORT_HIGHER_TEAM, REPLAN_TEAM -> Task 13/14 delete after checking Task 14's text."
- Repository rule (`AGENTS.md`): write only "user commands" and "team commands"; "Public repository ... no host or machine name, no local path ... no model name ... no internal agent or tool name".

## 3. BDD Acceptance Criteria

No feature scenario: this task has no scenario of its own (BDD plan section 2.5 lists none for B17c; the invariant it protects is rule case COD-06). Unit-level Given/When/Then, from the rule case (`design/rule-cases.json`, `COD-06`): input `{"given": {"items": [{"seq": 90, "team": "parallel", "fields": {"status": "ready"}}]}, "command": {"run": "user-show", "item": 90}}`, expected `{"exit": 1, "text": "no phase '90'"}`.

- Given a folder with an item of a team, When any user command that names it runs without `--show-all` (`update` with each field flag, `--replan`, `done`, `archive`, `move`, `import`), Then exit 1, stdout is one line starting `❌ no phase '<item>'` (for `move`: `no item '<item>' in the backlog of <repo>`; for `new --split-from`: `--split-from: no phase '<item>'`), standard error is empty and the whole folder, the consumer repository and the origin are byte-identical (`state()` of `plain-team-items.test.js`).
- Given an item of a team and another team's item, When `backlog update <item> --severity critical --by <agent>` runs under a bound team session (the test of `shared-severity.test.js` titled `046`), Then exit 1 and stdout is `❌ no phase '1' (create it with backlog new)` (today the test asserts only `status === 1`).

## 4. Target Files & Existing Helpers

Start by running these searches on the head and listing every hit in the commit body (a hit that is already correct is named "checked, correct"):

```
grep -n "refus" .agents/test/plain-team-items.test.js .agents/test/team-boundary.test.js .agents/test/shared-update.test.js .agents/test/shared-severity.test.js .agents/test/shared-query.test.js .agents/test/shared-team-done.test.js
grep -n "team: 't\|team: \"t" .agents/test/shared-update.test.js .agents/test/shared-severity.test.js .agents/test/shared-query.test.js .agents/test/shared-team-done.test.js
```

Known residue on the head (each verified by reading the file):
- `.agents/test/plain-team-items.test.js` (143 lines): header comment lines 1-4 say a plain command "refuses such an item" and cite "decision AO, phase 7c-2c": rewrite it to say that a user command does not see an item that belongs to a team and that the tests of the commands the later `--show-all` tasks change are marked, with no decision id. Test `clean engages on a team item in its scope ... refused before the question` (line 129) and `clean bites only on the scope` (line 139) assert the `clean` refusal: Task 14 rewrites them; leave both tests unchanged and add the comment line `// the expectation of this test changes when clean learns --show-all` above each. Tests `archive bites only on an open team item ...` (line 98) keep their title (it tests an item without a team).
- `.agents/test/team-boundary.test.js` (212 lines): comment line 95 "one door: a team's item is changed by `backlog team update` only (a plain update refuses every change of it)" is stale: rewrite to "a user command does not see a team item". Header line 1 is correct. Tests at lines 107, 120, 133, 141 are already inverted (check, correct).
- `.agents/test/shared-update.test.js`: the comment at line 487 "An item that belongs to a team is changed by its team's steps only: the plain update refuses every change of it, with one line, and writes nothing." is stale; the test at line 492 (`review P1: update of an item of a team ... does not see it and writes nothing`) is correct. Search the rest of the file for other titles that say "refuses" about a team item.
- `.agents/test/shared-severity.test.js` (51 lines): test `046: --severity is a field edit: refused on another team's item like any other` (line 39) asserts only `assert.equal(r.status, 1)` (line 50). Retitle `046: --severity does not see an item of a team` and assert `r.stdout === "❌ no phase '1' (create it with backlog new)\n"` and `r.stderr === ''`. Its fixture uses `SMOOTH_BACKLOG_CLI_TEAM_LEAD` and `SMOOTH_BACKLOG_CLI_TEAM_NAME` for a user command: leave the environment as is (Task 19 changes the variable handling).
- `.agents/test/shared-query.test.js` (557 lines): `grep -n team` finds no hit on the head; confirm and leave unchanged unless the search above finds a refusal assertion.
- Helpers to reuse, not to write: `changeStored(home, path, { team: 't1', status: 'new', refiner: '' }, 'team item')`, `itemPath`, `readItem`, `writeItem`, `createdSlug`, `cli`, `consumer`, `sharedBacklog` of `.agents/test/shared-fixtures.js`; `userCase(dirs, items)` of `.agents/test/user-cases.js` -> `{ run(args, env?, stdin?), folder, slugOf(seq) }` with items `{ seq, team?, repo?, fields? }`.

Interfaces: Consumes the merged view (`index.showAll(on)`, `index.sees(item)` of `src/shared/index.js`; the router sets `showAll(command === 'team')` per command, `src/shared/router.js` line 33). Produces nothing for later tasks except the corrected comments and the stronger assertion of test `046`.

## 5. TDD Execution & Verification

This task changes tests only, so its failing-first step is a mutation proof instead of a red test:
1. Make the stronger assertion of test `046` first and run `node --test .agents/test/shared-severity.test.js`: it passes on the head (the behaviour already holds). Then run the mutation: in a scratch copy of the repository, make `update.js` answer a team item with `OF_A_TEAM` again (the line `if (fm.team && !team) return refuse(OF_A_TEAM)` of `src/shared/update.js`, together with a `showAll(true)` at the start of `update`): the test must fail on the stdout comparison. Delete the scratch copy.
2. Edit the comments and titles listed above; run `node --test .agents/test/plain-team-items.test.js .agents/test/team-boundary.test.js .agents/test/shared-update.test.js .agents/test/shared-severity.test.js .agents/test/shared-query.test.js .agents/test/shared-team-done.test.js` (0 fail; the same number of tests as before: count them with `--test-reporter=spec` before and after, none deleted or skipped).
3. Docs: none to change (no behaviour changed); do not run the sync script.
4. Commands that must pass (inside the repository root):
   - `npm run check` (exit 0)
   - `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<private deny-list file> node --test .agents/test/no-private-details.test.js` (3 pass, 0 fail)
   - `flock <machine-wide suite lock file> node --test .agents/test/*.test.js > <scratch>/full.log 2>&1; tail -12 <scratch>/full.log` (fail 0)
   - `flock <machine-wide suite lock file> env FEATURE_LOCATION=local node --test .agents/test/features.test.js` (fail 0)
   - `flock <machine-wide suite lock file> env FEATURE_LOCATION=remote node --test .agents/test/features.test.js` (fail 0)
5. The commit body names each test whose title or expectation changed with the reason (the 046 expectation; the retitle) and says "no test removed".

## 6. Must-not and Carry pointers

Quoted (plan, Task 12): "**Must not:** skip a test." Added by this packet (not quoted): delete or weaken a test; change `src/`; rewrite the clean, archive-of-an-open-team-item or claim/release/close tests (Tasks 13 and 14 own them); cite a plan, chapter, ruling id or decision id in a comment or title (the word "decision AO" of the current header goes).

Carry pointers addressed to this task, quoted: "Tasks 9/12/13 keep createdSlug/TEAM_VALUE/TEAM_BOOL while importers remain." (do not delete those exports of `shared-fixtures.js`); "Task 7 shared-query drop/rewrite list in task-4-review.md (iii)" (done by Task 7; confirm no old team-query option assertion is left in `shared-query.test.js`: `grep -n "claimable\|reviewable\|--scope" .agents/test/shared-query.test.js` finds nothing).

Self-review (done on this packet): spec coverage - the three named files and the severity test covered, `shared-query.test.js` checked by search; no placeholder (the one hedged phrase of the clean test was replaced by a fixed comment line); no signature is introduced.
