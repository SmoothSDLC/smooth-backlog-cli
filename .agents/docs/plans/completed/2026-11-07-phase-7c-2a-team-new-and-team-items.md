# Phase 7c-2a: `backlog team new`, and one door for a team's items

Owner rulings behind it (2026-11-07): team behaviour is only under `backlog team`; user commands cannot create or change a team item; decision 20261107-AO = a (user-command `update` refuses every change to a team item). Coherence of docs/help with the implementation is not a question for the owner: the agent makes them match and notes what it chose and why.

Worktree `<worktree>`, branch `simplify/pr3-review`, HEAD `ff5ade0`. Commit only through `<logs>/commit.sh "<msg>"`; every commit leaves the full suite, `npm run check`, BDD (local + remote) and the no-private-details guard green. Do not push. Do not touch other repositories. The public repo names no private repository, host, path, agent/team/model name, item number or owner decision.

## Why `team new` must exist
User-command `new` has no team options (7c-1). A team item needs `team`, `refiner`, `review_refs`, stage `refining`, filing under the team's repository and branch. Nothing else can create one, so a team lead has no way to file work. Not a question.

## Tasks (in order, one commit each)
1. **Wire `backlog team new`.** `src/team/cli.js`: add `new` to SUBS; `--team`/`--agent` come out through `split`/`resolve` like the other subcommands (the item's team is the resolved team; `--team` stays required); run `src/team/new.js` `run`. Router, `bin`, shell completion lists, `backlog team` listing include it. Remove the `team-new-child.js` test helper and make `teamNew` in the fixtures and the BDD world call the real command (`backlog team new ...`). `team new` accepts every user-command `new` option (shared parser) plus `--review-refs`; a split of a team's item (`--split-from`) is a team new. User-command `new --split-from <team item>` keeps its refusal, and its text names `backlog team new`.
2. **One door (AO = a).** User-command `update <item>` on an item with a team is refused for ANY change (exit 1, one line naming `backlog team update`), not only status steps. One constant/one place for that line (today the text exists twice: `src/shared/update.js` ~219 and `src/shared/plain-step.js` `ofATeam`; keep one). `backlog team update <item> --team T --agent A` accepts the same generic field flags as user-command update and applies the team checks (stage rules, incomplete-item guard) to them: verify with a test per field flag that a field edit of a team item through `team update` runs the guards and through user-command `update` is refused. User-command `--replan`/`--restore` keep their behaviour (they name no single item); say in the tests what a replan does to a team item's rank.
3. **Helps and docs match the implementation.** `backlog --help` line for `team new`; `backlog team --help` lists new; `backlog team new --help` (flags, exit codes, one example); user-command `new --help` and `update --help` end with the pointer to the team command; `backlog fields` text for team fields says "set by `backlog team new`". Update COMMANDS.md, README, the skill templates under `templates/` and the skill text so every team spelling in them is the `backlog team ...` spelling listed in the 7c-1 report (old spelling -> team spelling table in `<logs>/phase-7c-1-inventory.md`). A test greps the templates and COMMANDS.md for the removed plain spellings (`update ... --request-review`, `query --claimable`, `new --team`, ...) and fails on any.
4. **Two cleanups from the lead review.** `src/shared/query.js` `teamFields` -> `itemFields` (it adds `claimed_by`, `review_state`, which stay user fields by ruling); no behaviour change. Record in REVIEW-LOG the ponytail-review (Skill tool) before commit.
5. **Gate and report.**

## Gate (each commit)
`run-tests.sh <label> node` (detached, ~3 min), `npm run check`, BDD with `FEATURE_LOCATION=local` and `remote`, guard `BACKLOG_PRIVATE_DENYLIST=<private-denylist> node --test .agents/test/no-private-details.test.js`. `.agents/test/team-boundary.test.js` stays green and still bites.

## Stop only for
A behaviour with no ruling that changes what a person can do (say what, give evidence). Not for naming/doc coherence: decide, record in the report with the reason.

## Report (max 60 lines)
Commit hashes, exact full-suite counts, behaviour changes not predicted here, tests deleted or changed (titles), decisions taken with reasons.
