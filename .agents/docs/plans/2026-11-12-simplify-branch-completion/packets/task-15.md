# Task 15 packet: The `--show-all` feature and documents (B18c)


## 1. Goal & Scope

Goal: one feature file shows a person listing without and with `--show-all` and archiving the item of a team that no longer exists, in both storage locations, and the public documents (the skill's "Working alone" section, the README, the changelog, the regenerated command reference) state the one rule that replaces "user commands refuse team items": a user command does not see an item of a team unless `--show-all` is given, and with it the command may change the item.

Out of scope: any change of `src/` behaviour (Tasks 10, 11, 13, 14); the "Team work" section of the skill (Task 9); the order per owner (Task 16); the final documentation pass and the merge of the breaking-change bullets (Task 32).

## 2. Architectural Decision Rules

- Spec B18c (batch specification B15-B21, section 5): "`features/show-all.feature` (a person lists without and with `--show-all`, archives the item of a team that no longer exists), steps in `features/steps/cli.js`, `README.md`, `CHANGELOG.md`, the skill's "Working alone" section (the sentence that user commands refuse team items is replaced by the `--show-all` rule), `COMMANDS.md` regenerated." and "Breaking changes for the installed CLI: a user command now acts on a team item only with `--show-all` (before it refused the item with the line that names `backlog team update`); `backlog update <item> --set` is new; `backlog done` on a team item writes the user word `closed` (validate reports it), the team's own word is `backlog update <item> --show-all --set status=<word>`."
- Design chapter 07 section 5 (`.agents/docs/plans/2026-11-09-team-rules-engine/design/07-skills.md`): "The "Working alone" section loses the sentence about user commands refusing team items (line 43 today) and gains the rule that user commands see team items only with `--show-all` (chapter 04 section 8)."
- Design chapter 04 section 8 (`design/04-team-commands.md`), table rows: "`backlog list [<word>]`, `backlog list branch <name>`, `backlog list branches`, `backlog next [all-branches]` | items without a team; counts without team items | every item, a team column in the listing, team items counted" and "`backlog fields`, `backlog setup`, `backlog upgrade` | no items | flag refused (exit 2)" and the sentence "`backlog fields` prints the built-in user item definition; a team's definition is `backlog team query rules`."
- Owner rulings R16 and R19 (`00-owner-rulings.md`): "User commands ignore team items by default and show them only when `--show-all` is given." and "A user command can set values on an item that has a team (a safety hatch for a team that no longer exists, for archiving, or for a change of owner outside the team's enforcement). It needs `--show-all`".
- Owner rule on personas (`AGENTS.md`): "Do not call the user commands "plain", "non-team" or "basic" commands, and do not call the team commands "advanced"." and "**The user** is a person using the CLI. The user commands ... enforce nothing: no flow, no status words, no limits."
- Plan Task 15: "**Files:** Create `features/show-all.feature` (a person lists without and with `--show-all`; archives the item of a team that no longer exists), steps in `features/steps/cli.js`; `README.md`, `CHANGELOG.md`, the skill's "Working alone" section (the `--show-all` rule replaces "user commands refuse team items"), `COMMANDS.md` regenerated." and "Steps: write the scenarios (FAIL), the steps, the docs; standard proof with the new scenario count; commit."
- Plan Global Constraints: "Documentation rule of `AGENTS.md`: every change of a command, option, output, refusal, rule or stored field ships in the same commit with `templates/skills/backlog/SKILL.md` (and `references/commands.md`), the help text (`src/help.js`, `src/team/help.js`), `COMMANDS.md` regenerated with `node .agents/scripts/sync-commands-md.mjs`, `README.md` where it describes the behaviour, and `CHANGELOG.md` (section `## Unreleased (2.0.0)`). None of them describes the old behaviour." "No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id." "Public repository: no tracked file and no commit message names a host or machine, a local path, a port or address, a model, a private repository, an internal agent or tool, a private process or a credential." "Every commit leaves the whole suite green".
- Carry pointers of the earlier reviews: Task 5 review: "#4 seedTeamItem numbers from the highest seq, not the file count (Tasks 9, 15 seed two items)"; Task 5 post-merge review: "a scenario that rewrites teams.json runs `backlog team validate --team <t>` (or commits the new teams_file_sha) before the next team command" (no scenario here rewrites the team file); Task 10 post-merge review: "#2 user WIP-limit refusal counts and names a team item: counting is owner ruling R3a; the name in the text -> Task 27 removes the limits (no change now)."
- Rulings recorded during the work (Task 10): "the feature step reads a team item through `backlog team query <item> --json` (the team reader, Task 7) — not `show --show-all` (Task 11 not yet built)": after Task 11 the step `item <n> has ...` may keep reading through the team query; do not change it unless a scenario needs `show --show-all`.

## 3. BDD Acceptance Criteria

Source: BDD plan `.agents/docs/plans/2026-11-09-team-rules-engine/implementation/02-bdd-plan.md` section 2.5, row: "a new features/show-all.feature | B18 | a person lists without and with `--show-all`, and archives the item of a team that no longer exists". Rule cases it rests on (`design/rule-cases.json`): R16-01 (`show 90 --show-all` exits 0 and answers item 90) and COD-06 (`backlog show 90` exits 1, text `no phase '90'`), and the spec's archive case ("`archive` of a team item closed with `accepted` refused without `--force`", from the B18b list).

Scenarios to write in `features/show-all.feature` (Given/When/Then; wording of outputs to be confirmed on the merged head as stated above):

```gherkin
Feature: Show all - a user command sees an item of a team only when it is asked to, and may then change it

  Background:
    Given a repository with a backlog
    And a team file from the template "parallel"

  Scenario: a person lists without and with --show-all
    Given a ready item "Tokens" for the team "parallel"
    And I act as a person
    And an item "Notes" exists
    When I run `backlog list`
    Then the command succeeds
    And the output contains "Notes"
    And the output does not contain "Tokens"
    When I run `backlog show 1`
    Then the command fails with exit code 1
    And the output contains "no phase '1'"
    When I run `backlog list --show-all`
    Then the command succeeds
    And the output contains "Tokens"
    And the output contains "(team parallel)"
    When I run `backlog show 1 --show-all`
    Then the command succeeds

  Scenario: a person archives the item of a team that no longer exists
    Given an item "Orphan" of a team "gone" that the team file does not name
    And I act as a person
    When I run `backlog archive 1`
    Then the command fails with exit code 1
    And the output contains "no phase '1'"
    When I run `backlog archive 1 --show-all`
    Then the command fails with exit code 1
    And the output contains "belongs to team gone"
    When I run `backlog archive 1 --show-all --force`
    Then the command succeeds
    And the output contains "archived"
    When I run `backlog list archive --show-all`
    Then the output contains "Orphan"
```

The Gherkin above is the packet's realisation of the quoted row (proposed text, not a quotation). The only wording fixed by a source is the quoted row, the quoted case texts (COD-06: `no phase '90'`; R16-01) and Task 14's archive refusal, which that packet states as its own wording because the spec leaves it open.

## 4. Target Files & Existing Helpers

Verified on the head:
- `features/steps/cli.js` (169 lines): reuse the existing steps: the team-file step (line 21), the ready-item step (line 24; it seeds with `w.seedTeamItem(entry, key, ...)` and adds the item to `w.teamItems`), the item-exists step (line 75; it creates an item without a team through `backlog new`), the act-as-a-person step (line 19), the run step, the command-succeeds, command-fails-with-exit-code, output-contains and output-does-not-contain steps (all exist on the head; grep each by its text). New step (one): `an item "<name>" of a team "<team>" that the team file does not name`: `const { seq, slug } = w.seedTeamItem(TEMPLATES.parallel.parallel, team, { name, fields: { status: 'ready' } })` (`TEMPLATES.parallel` is the whole team file keyed by team name; the entry that `seedTeamItem` needs, with its `item` definition, is `TEMPLATES.parallel.parallel`; found by running the step on the head) (`features/support/world.js` line 47: `seedTeamItem(entry, team, { name, fields })` writes the item as the team commands store it, with the team name given, and commits and pushes only its file) and `(w.teamItems ??= new Set()).add(String(seq)).add(slug)`. `TEMPLATES` comes from `.agents/test/team-fixture.js` (already imported at line 7). Note on the item number: in the second scenario the orphan is item 1 because it is the first item of the folder (the team file does not need an item); in the first scenario `Tokens` is seeded first (item 1) and `Notes` is created after (item 2).
- `features/support/world.js`, `features/support/gherkin.js`: unchanged. Scenario count on the head: run `FEATURE_LOCATION=local node --test .agents/test/features.test.js` before the change and note the total; the new feature adds 2 scenarios per location.
- Documents (grep the stale sentences first and list every hit in the commit body):
  - `templates/skills/backlog/SKILL.md` line 44 (head text): "Reviews, refinement and hand-offs are team steps: see Team work. A user command does not see an item that belongs to a team: `list`, `next`, `show`, `history` and the counts leave it out, the queue and the priorities count only the other items, and a command that names it answers as for an item that does not exist (`no phase '<item>'`). An item that lists a team item in `depends_on` reads as depending on a missing item. A team item is filed and changed by `backlog team` only; `clean` still refuses to remove a team item in its scope." Replace the last sentence with the rule: a team item is filed and changed by `backlog team` commands; a user command given `--show-all` shows it and may change it (`update`, `done`, `move`, `archive`, `import`, `clean`, `new --depends-on`, `new --split-from`), writing one history entry that names `--show-all` and the team, and `backlog update <item> --show-all --set <field>=<value>` writes a field of a team item; no rule of the team runs. `backlog fields`, `setup` and `upgrade` refuse the flag.
  - `README.md` line ~85 (the paragraph that begins "know nothing of teams: they work on items without a team ...") and any line that says user commands refuse a team item (`grep -n "refus\|team item\|belongs to a team" README.md`).
  - `CHANGELOG.md` `## Unreleased (2.0.0)`: one bullet (proposed wording, not a quotation), if Tasks 11, 13 and 14 did not already write the same sentence (grep `--show-all` in the file first; do not duplicate): a breaking-change bullet saying a user command acts on an item of a team only with `--show-all`, naming the commands and the history entry; and the `--set` bullet if Task 13 did not add it.
  - `src/help.js`, `COMMANDS.md`, `templates/skills/backlog/references/commands.md`: no hand edit; run `node .agents/scripts/sync-commands-md.mjs` and commit what it rewrites; if the help text of a command still says a team item is refused, fix the text in `src/help.js` and rerun the script.
- Guards that read these documents and must stay green: `.agents/test/skill-commands.test.js`, `.agents/test/team-spelling-docs.test.js`, `.agents/test/shared-help.test.js` (COMMANDS.md equals the skill reference), `.agents/test/commands-documented.test.js`, `.agents/test/no-private-details.test.js`.

Interfaces: Consumes the merged behaviour of Tasks 11, 13, 14 (commands and output lines); the step `a ready item ...` and the world's `seedTeamItem` as they exist. Produces: the new step above (no later task uses it) and the final wording of the "Working alone" rule that Task 32 keeps.

## 5. TDD Execution & Verification

1. Write `features/show-all.feature` (section 3) and the new step; run `FEATURE_LOCATION=local node --test .agents/test/features.test.js`. On the merged head the scenarios pass if Tasks 11, 13 and 14 are complete: they are written to FAIL first by running them against the head before the docs step with the new step removed (undefined step fails) and, as the real red proof, against a scratch copy where `src/shared/index.js` `sees` is made `() => true` (the first scenario then lists `Tokens` without the flag and fails on `does not contain "Tokens"`). Record both runs.
2. Mutations each scenario must kill (scratch copy, hard timeout): `sees` always true (first scenario); `archive` refusing a team item even with `--force` (second scenario, third command); `list --show-all` not passing the flag (first scenario, `(team parallel)`); the archive of the second scenario run without `--show-all` succeeding (the first refusal).
3. Write the documents of section 4 and run `node .agents/scripts/sync-commands-md.mjs`.
4. Commands that must pass (inside the repository root):
   - `npm run check` (exit 0)
   - `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<private deny-list file> node --test .agents/test/no-private-details.test.js` (3 pass, 0 fail)
   - `flock <machine-wide suite lock file> node --test .agents/test/*.test.js > <scratch>/full.log 2>&1; tail -12 <scratch>/full.log` (fail 0)
   - `flock <machine-wide suite lock file> env FEATURE_LOCATION=local node --test .agents/test/features.test.js` (fail 0)
   - `flock <machine-wide suite lock file> env FEATURE_LOCATION=remote node --test .agents/test/features.test.js` (fail 0)
   State the scenario count: the earlier total plus 2 per location.

## 6. Must-not and Carry pointers

Quoted: none (the plan lists no Must-not for Task 15). Added by this packet (not quoted): change any file of `src/` other than `src/help.js` text that the sync script reads (and only if it still describes the refusal); describe the old behaviour ("refuses a team item", "made by backlog team only") anywhere; call user commands "plain", "non-team" or "basic"; cite the plan, a chapter, a ruling id or a decision id; write a local path, host, model or private name; duplicate a changelog bullet that an earlier task wrote.

Carry pointers addressed to this task, quoted in section 2: "(Tasks 9, 15 seed two items)" (the first scenario seeds the team item first and creates the user item after, so the numbers are 1 and 2; the step numbers the seed from the highest item); the Task 5 pointer on rewriting the team file (not used here); the Task 10 note on limits naming a team item (Task 27 removes the limits; no change here).

Self-review (done on this packet): spec coverage - the feature (both listed behaviours), the steps, README, changelog, the skill's "Working alone" rule and the regenerated reference each have a line; no placeholder (the one hedge, output wording on the merged head, is a stated check with the meaning fixed); signatures: one new step, no function; counts stated as a before/after run.
