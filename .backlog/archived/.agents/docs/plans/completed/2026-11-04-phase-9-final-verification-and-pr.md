# Phase 9 — Final verification, push, the one pull request

> **For agentic workers:** REQUIRED SUB-SKILL: load `superpowers:executing-plans` and follow this document task by
> task. Steps use checkbox (`- [ ]`) syntax. One session; stop at the end and report.
>
> **GATE:** Phase 8 is committed. This is the only phase that pushes and the only one that opens a pull request.
> The owner authorised exactly one branch (`simplify/pr3-review`) and exactly one pull request (into
> `team-cli-parity-1`, never into `main`). If a pull request from this branch already exists (`gh pr list --head
> simplify/pr3-review`), update it; never open a second one.

> **DECISIONS THIS PHASE DEPENDS ON (all recorded, none open):** 20261105-R = a (the lead shows the PR title and body in chat and opens the PR only on the owner's go) — closed on the recommendations under the
> owner's instruction of 2026-11-06 (the decision table of [2026-11-04-pr3-simplification-log.md](../2026-11-04-pr3-simplification-log.md)). Nothing in this phase waits for a decision; a step that seems to
> need one is executed as written and the doubt is reported at the end.

**Goal:** the branch is proven done by the review prompt's definition — every BDD scenario passes in both storage
locations; the full suite has 0 failures and 0 skipped; `npm run check` passes; no mode split remains (proved by a
codebase-memory query and a text search); the diff removes more lines than it adds — then pushed, and one pull
request carries the summary, the counts, baseline vs final, the recommended removals awaiting approval, the test and
CI results and the sentence that a backlog review was done privately.

**Architecture:** the worktree `<worktree>` is a git worktree of
`<main-clone>` (remote `origin` = the public GitHub repository); `gh` is installed and logged
in on this machine. CI runs on push (`.github/workflows`, read them to know which checks to wait for). The private
deny-list guard runs in CI with a synthetic list; the real list is only on this machine.

**Tech stack:** git, `gh`, Node 24 (`node`), codebase-memory-mcp CLI.

**Spec:** the review prompt's "Deliverables" and "Done means" (quoted in Global constraints); `REVIEW.md`;
[the recommendations](2026-11-04-recommendations.md) (R7).

## Handoff context (read fully before the first command)

- Work ON the the development machine machine in the git worktree `<worktree>`, branch `simplify/pr3-review`.
  Never touch `<main-clone>`'s own checkout. Never create another branch.
- Node is `node` (v24). Full suite:
  `bash <logs>/run-tests.sh <label> node` → log at
  `<logs>/<label>.log` (detached + poll if your shell has a time limit).
- BDD: `FEATURE_LOCATION=local node --test .agents/test/features.test.js`, then `remote`.
- Private guard: `BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js` → `pass 3`.
- Commit: `bash <logs>/commit.sh "<message>"` (author `<author>`,
  no trailers).
- PUBLIC RULE, strongest here: the pull-request title and body are public. They name no machine, path, agent, team,
  model, backlog item number, owner decision or private repository. The private backlog review is mentioned in ONE
  sentence: "A review of the backlog items behind this branch was done privately." Nothing of its content.
- codebase-memory: `codebase-memory-mcp cli --quiet index_repository '{"repo_path":"<worktree>"}'`
  AFTER the push (Task 4) and again after any later push;
  `codebase-memory-mcp cli --quiet search_code '{"project":"<project>","query":"<text>"}'` and
  `codebase-memory-mcp cli --quiet search_graph '{"project":"<project>","query":"<name>"}'`
  for the proofs in Task 2 (if the CLI's argument names differ, run `codebase-memory-mcp cli --help` and adapt;
  record the exact call).
- Skills to load at the start: `superpowers:executing-plans`, `superpowers:verification-before-completion`,
  `superpowers:requesting-code-review`, `superpowers:receiving-code-review`, `ponytail:ponytail-review`;
  `superpowers:systematic-debugging` at the first unexpected failure. Each use = a row in `REVIEW-LOG.md`.
- Behaviours: evidence before every claim — a number in the PR body is copied from a command's output you ran in
  this session, never remembered; if a check is red, fix the cause (small commit) and re-run everything, do not
  explain it away; if the base branch moved, STOP (Task 1).
- LESSONS FROM THE PHASE 1 RUN (apply in every task): (1) line numbers in this document are from the commit it was
  written at and drift — locate code by the quoted text with `grep -n`, never by number; (2) a fixture or helper this
  document names (for example `build(false)`) must be confirmed first with `grep -n "^function <name>\|^const <name>" <file>`
  — if it is not there, use the file's shared helper and say so in the report; (3) the Files list of a task is a
  starting point, not the scope: after the change, the full suite is the authority — every failing test is in scope,
  and every file you change beyond the list goes into the report; (4) when a flag or path is removed, look for the
  modifier flags, help sentences and comments that only made sense with it (`grep -n -i "<word>" src/help.js src/shared/*.js`)
  and remove them too, naming each in the commit message; (5) never predict a test count — record the count the
  runner printed; (6) the codebase-memory `trace_path` call is mandatory where this document says so: when it answers
  "ambiguous", call it again with one `qualified_name` from its suggestions; paste the call and its answer into the
  REVIEW-LOG.md row; (7) run `commit.sh` alone in its own shell call (a compound command with a commit can hit the
  shell's time limit); after any timeout, check `git log --oneline -3` before repeating anything; (8) REVIEW-LOG.md
  gets one row per skill or tool use, and its text describes the work ("the duplicate-removal round"), never a plan
  document, phase number, machine, agent or model; (9) prose records under `.agents/docs` that mention a deleted file
  are history, not references — leave them.
- LESSONS FROM THE PHASE 2 RUN (apply in every task): (10) a change to an item's front matter is written with
  `store.write(item, folder, { frontMatterOnly: true })` so the body, BOM and line endings stay byte-identical (seven
  archive tests pin that); `store.write` takes an absolute `path`; (11) any new or changed front-matter key must be
  checked against the stale-read guard `RANK_ONLY` in `src/shared/seen.js` (keys that are not "content"): a key that
  grows without being a change of the item (history, counters) goes into that list, else another agent's write makes
  every earlier read stale (eleven team-flow tests failed on this before the fix); (12) when a code block to delete
  also does one thing that must stay (the `moved_in` event lived inside the database-copy block of `move.js`), keep
  that one thing as its own line and name it in the commit message; (13) timestamps have one-second resolution — a
  test never asserts an exact order of events from different items in the same second (compare a sorted set); (14) a
  test this document says must be RED may already be GREEN when an earlier task made the behaviour true — write it
  anyway, say so in the report, and do not invent a failure; (15) output lines that count database work
  (`rescan: … (re)ingested`) change when a file is written after a scan: they describe the database, not the backlog,
  and Phase 3 removes them — until then, update the expectation, never the code, to keep a count stable; (16) the
  code graph does not see callbacks (`.map(store.parseEvent)`): a `trace_path` answer of "0 callers" for a function
  passed by reference is wrong — add `git grep -n "<name>" src` to the row and cite both.
- LESSONS FROM THE PHASE 3 RUN (apply in every task): (17) `db.scan` opens its own transaction — never wrap it in
  `BEGIN`/`COMMIT` of your own; (18) start a detached run as `( setsid nohup <cmd> >/dev/null 2>&1 </dev/null & )` —
  the bare `&` form sometimes held the shell open until the time limit; never `pkill -f` from the tool (it kills your
  own shell); (19) a plan sentence "behaviour of every command is unchanged" is a claim to verify, not a fact: list
  every behaviour change you observe in the report even when the plan did not predict it; (20) when the stale-read
  guard or the publication guard has a trigger you remove (a database conflict), find what still has to trigger it
  (here: the same-rank file conflict sets `renumbered.mirror`, soon `renumbered.reranked`) and keep that path with a
  test; (21) tests that compare whole database dumps or row ids are tests of the old mirror — rewrite them to compare
  item files through the CLI, and list every deleted title in the commit message and the report; (22) a command's
  refusal text that mentions internal mechanics ("the rescan does not visit archive/") is a documentation defect: fix
  the text in the same commit when you touch that code, and pin the new text in the test that pinned the old one.
- RULE FROM THE OWNER (2026-11-05, binding in every task): the simplification never removes behaviour from the app
  on the agent's or the lead's own judgement. Code you believe is dead, duplicate or wrong is REPORTED with its evidence
  (what it does, where it came from — `git log -S'<text>' --oneline -- <file>` to find the commit and its message —
  and whether that commit records an owner decision); the owner decides. Trace the origin of any behaviour before you
  touch it; a behaviour the owner put there deliberately is kept even when a plan sentence says otherwise — report the
  conflict and stop that task.
- Report/ask: `<alert-tool> send --source pr3-simplification-review "<text>"`; answers via
  `<alert-tool> replies`.

- LESSONS FROM THE PHASE 5 RUN (apply in every task): (23) before reusing a helper the plan names (e.g. a lock path),
  read its current callers — the plan named the run lock for the sync lock, which would have self-deadlocked. (24)
  `git ls-remote --exit-code` exits 2 for an absent ref and 128 for an unreachable or missing remote. (25) A behaviour
  change the plan did not call for is reported as a candidate in the final report, NOT implemented (Phase 5: refusing
  every write in a repository without an origin was reverted by the lead). (26) In the user's repository HEAD may be
  the user's own commit: amend only the command's own commit. (27) Never rewrite a test's expectation to match a
  behaviour the plan did not call for. (28) A mandated skill counts as used only when loaded with the Skill tool.
## Global constraints (the review prompt's "Done means", verbatim intent)

- every BDD scenario passes in both storage locations (`features/integrity.feature` and `features/aliases.feature` included);
- the full suite passes with 0 failures and 0 skipped;
- `npm run check` passes;
- no mode split remains (prove it with a codebase-memory query and a search for the old mode names);
- the diff against the branch tip removes more lines than it adds, unless the report explains why;
- the pull request carries: a summary; the before/after line and file counts; the BDD baseline versus final results;
  the list of recommended command or option removals awaiting approval; the test and CI results.

## Review focus

1. The base branch may have moved since `fe40b5a`: a PR against a moved base shows other people's work as ours or
   conflicts. Task 1 checks and stops if so.
2. CI may run on a different Node or without the private list: read the workflow files before claiming CI green,
   and wait for the real checks (`gh pr checks --watch`).
3. The PR body's numbers must come from this session's commands (Task 3 collects them into a file first).
4. The whole-diff review may find a real defect: fix it with a test in a small commit BEFORE the push, and re-run
   the full verification; never push a known defect "to fix later".
5. `requesting-code-review` normally dispatches a fresh reviewer; if this harness cannot, perform the review
   checklist of that skill yourself against `git diff fe40b5a HEAD` and write in REVIEW-LOG.md that it was a
   self-review for lack of a second agent.

---

### Task 1: the base branch

- [ ] `cd <worktree> && git fetch -q origin && git rev-parse --short origin/team-cli-parity-1`.
      If it prints `fe40b5a`: continue. If not: STOP, report
      `the owner-alert tool send ... "Phase 6: team-cli-parity-1 moved from fe40b5a to <sha> (<n> commits). Rebase simplify/pr3-review onto it, or open the PR against fe40b5a as is? Answer rebase or as-is."`
      and wait for the answer (`the owner-alert tool replies`). On `rebase`: `git rebase origin/team-cli-parity-1`, resolve
      nothing silently — a conflict means STOP and report the files; then run Task 2 fully again.

### Task 2: the proofs

- [ ] **Full suite** → log; copy the four `ℹ` lines (tests/pass/fail/skipped) into
      `<logs>/final-evidence.txt` with the commit hash (`git rev-parse --short HEAD`).
- [ ] **BDD both locations** → `# pass`/`# fail` lines of each into the evidence file (expected 50/50 and 50/50, or
      the current scenario count: `grep -c "Scenario:" features/*.feature`).
- [ ] **`npm run check`** → exit code into the evidence file. **Private guard** → `pass 3` into the evidence file.
- [ ] **Text search for the old mode names** (into the evidence file, must be empty apart from negative test
      assertions and CHANGELOG "removed" lines):
      `git grep -n -i -E "shared mode|local mode|shared-mode|local-mode|use-backlog-repo|use-local-repo|mode\.json|getMode|setMode|switchMode|modeOptions|sharedCommand" -- . ':!REVIEW.md' ':!.agents/docs/plans' ':!REVIEW-LOG.md' ':!CHANGELOG.md'`
- [ ] **codebase-memory proof** (after Task 4's push, re-run here first for the pre-push snapshot): index, then
      `search_graph` for `getMode`, `setMode`, `switchMode`, `sharedCommand`, `withStore`, `execute` → each "no
      results"; `search_code` for `"shared mode"` and `"local mode"` → no hits in `src/`. Paste the calls and the
      answers into REVIEW-LOG.md as one row and into the evidence file.
- [ ] **Counts**: `git diff --shortstat fe40b5a HEAD`, `git diff --shortstat fe40b5a HEAD -- src bin`,
      `git diff --stat fe40b5a HEAD | tail -1`, `git ls-files | wc -l` vs `git ls-tree -r fe40b5a --name-only | wc -l`,
      `wc -l src/*.js src/shared/*.js | tail -1` at HEAD and `git show fe40b5a:src/... | wc -l` summed
      (`for f in $(git ls-tree -r fe40b5a --name-only -- src bin); do git show fe40b5a:$f | wc -l; done | paste -sd+ | bc`)
      → evidence file. If the whole diff adds more than it removes, the explanation is: the added lines are the BDD
      runner and scenarios, REVIEW.md, [2026-11-04-simplification-plan.md](../2026-11-04-simplification-plan.md) and REVIEW-LOG.md; `src/` + `bin/` remove more than
      they add (give the numbers).
- [ ] **Baseline vs final**: the baseline table is REVIEW.md section 3 (remote 38/48, local 4/48 at `fe40b5a`); the
      final numbers come from this task.

### Task 3: whole-diff review and the review round

- [ ] Load `ponytail:ponytail-review`; review `git diff fe40b5a HEAD -- src bin templates README.md COMMANDS.md`
      (read the connected code, not only the diff). Every "Must fix" gets a failing test and a fix in its own commit;
      "Should fix" items that are small (< 10 lines) are fixed the same way; the rest are written into REVIEW.md
      section 4 as recommendations. Re-run Task 2 fully if any commit was made.
- [ ] Load `superpowers:requesting-code-review`: dispatch the reviewer with the diff range `fe40b5a..HEAD` and the
      acceptance list of Global constraints; then load `superpowers:receiving-code-review` and handle every finding
      the way that skill says (verify before accepting; a wrong finding is answered with evidence, not applied).
      Without a second agent: self-review per Review focus 5. REVIEW-LOG.md rows for both.
- [ ] REVIEW.md section 3 "After" and section 4 final; REVIEW-LOG.md complete (every mandated skill has a row).
      `bash <logs>/commit.sh "Final verification results in the review records"`.

### Task 4: push and index

- [ ] `git push -u origin simplify/pr3-review` (first push) — then re-index codebase-memory (Handoff context) and add
      the REVIEW-LOG.md row "index_repository after the push: <nodes>, <edges>"; commit that row and push again
      (`git push`); re-index once more (the prompt says after EVERY push; the second index is the final state).
- [ ] Read `.github/workflows/*.yml` to learn the check names; `gh run list --branch simplify/pr3-review --limit 3`.

### Task 5: the pull request

- [ ] Write the body to `<logs>/pr-body.md` with exactly these sections, filling every
      number from `final-evidence.txt` and REVIEW.md:

```markdown
## Summary
One backlog, one CLI. Where the item files live (inside the repository, or in a backlog repository many
repositories share) is a storage setting: every command, option, output and help text is the same in both places,
and every change is committed and pushed. The 1.x command set and the mode switches are gone (`list` stays as the
queue view); the team rules apply only through `backlog team` commands and come from the team's configuration entry (decision X names the file); no agent, model or
product name is built into the CLI; <history-in-the-items and the per-clone cache, if Phases 2-4 ran>.

## Before / after
| | tip (`fe40b5a`) | this branch (`<sha>`) |
|---|---|---|
| files tracked | <n> | <n> |
| `src/` + `bin/` lines | <n> | <n> |
| whole diff | — | <files> files, +<add> −<del> (src/bin: +<add> −<del>) |
<one sentence if the whole diff adds more than it removes: the additions are the scenarios and the review records>

## BDD scenarios (both storage locations)
| | backlog repository | inside the repository |
|---|---|---|
| baseline at the tip | 38 / 48 | 4 / 48 |
| final | <n> / <n> | <n> / <n> |

## Recommended removals awaiting approval
<the list from REVIEW.md section 4 that is still "recommended", one line each; "none" if empty>

## Tests and CI
- `node --test`: <tests> tests, <pass> pass, 0 fail, 0 skipped (Node 24)
- `npm run check`: pass
- CI: <check names and status from `gh pr checks`>

A review of the backlog items behind this branch was done privately.

The findings are in `REVIEW.md`, the plan in `.agents/docs/plans/2026-11-04-simplification-plan.md`, the skill and tool log in `REVIEW-LOG.md`.
```

- [ ] `grep -n -i -f <private-denylist> <logs>/pr-body.md` and `grep -n -i -E "owner decision|item [0-9]|decision [A-D]" <logs>/pr-body.md`
      → must print nothing (the agent-folder names are not in the body). Fix before continuing.
- [ ] `cd <worktree> && gh pr create --base team-cli-parity-1 --head simplify/pr3-review --title "One backlog, one CLI: the storage location is a setting" --body-file <logs>/pr-body.md`
      (or `gh pr edit <number> --body-file ...` if one exists). Record the URL.
- [ ] `gh pr checks <number> --watch` until every check finishes. Red check → read the log (`gh run view <id> --log-failed`),
      fix with a test in a small commit, push, re-index, re-run `gh pr checks --watch`, then `gh pr edit --body-file`
      with the updated numbers. Never leave a red check unexplained.
- [ ] Final verification (load `superpowers:verification-before-completion`): every line of Global constraints has
      its evidence in `final-evidence.txt`; the PR body numbers equal that evidence; `git status --short` empty;
      local HEAD == `origin/simplify/pr3-review`.
- [ ] Report: `<alert-tool> send --source pr3-simplification-review "Phase 6 done: PR <url> into team-cli-parity-1 at <sha>. Tests <n>/<n>, BDD <n>/<n> both locations, check ok, CI <status>. Whole diff <+a −d>, src/bin <+a −d>. Recommended removals awaiting approval: <n>."`
