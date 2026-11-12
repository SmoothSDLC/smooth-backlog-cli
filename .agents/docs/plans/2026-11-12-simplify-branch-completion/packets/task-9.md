# Task 9 packet: The skill's team section, the documentation guards, the rules feature (B16c)


## 1. Goal & Scope

Goal: the built-in skill teaches the team commands that now exist (`backlog team query rules`, `query steps`, `query check`, `validate`) without restating any team rule, the two documentation guards check that list, and one new feature scenario shows a lead reading the rules and the steps, editing the team file, running `backlog team validate` and seeing a finding with its fix, in both storage locations.

Out of scope: the "Working alone" sentence about user commands and team items (Tasks 10, 11 and 15 own it; Task 15 replaces it with the `--show-all` rule); any change of `src/` code; the `migrate` command itself (Task 23; the skill names the word only); `backlog team define` and `workflow` text in COMMANDS.md (Task 28 deletes the headings).

## 2. Architectural Decision Rules

Quoted word for word, with source.

- Spec B16c (batch specification B15-B21, section 3, "B16c. The skill, the guards, the feature"): "Files: `templates/skills/backlog/SKILL.md` ("Team work" rewritten as chapter 07 section 5 says; the "Working alone" sentence about user commands refusing team items goes in B17), `templates/skills/backlog/references/commands.md` and `COMMANDS.md` (regenerated), `.agents/test/skill-commands.test.js` and `.agents/test/team-spelling-docs.test.js` (rewritten to the new team command list; see disagreement 5 on who repairs their imports), new `features/team-rules.feature` with steps in `features/steps/cli.js`."
- Same section: "Feature: a lead reads `backlog team query rules` and `backlog team query steps`, edits the team file, runs `backlog team validate` and sees a finding with its fix; both storage locations." and "Must not: restate a team rule in the skill (chapter 07 section 4)."
- Design chapter 07 (`.agents/docs/plans/2026-11-09-team-rules-engine/design/07-skills.md`) section 4, "What a skill must not do": "Restate a rule ("the holder closes", "at most three in progress"): the rule is in the file; a restated copy drifts." and "Name a status, stage or role word in instructions as if the CLI knew it: the words are the team's and come from `backlog team query rules`."
- Design chapter 07 section 5: "The "Team work" section of `templates/skills/backlog/SKILL.md` (lines 49 to 79 today) is replaced by a generic text: a team is defined in `teams.json`; the commands of chapter 04 section 1 with their scenarios; the session loop of section 2; how to read a refusal; and a pointer to the example rule sets (shipped as documentation, never read by the CLI). The lines that describe today's per-step flags, `wip-limits.json`, `team define` and `team workflow` are removed."
- Design chapter 07 section 4: "Run a user command (`backlog list`, `backlog update`, ...) in a team session: with SMOOTH_BACKLOG_CLI_TEAM_NAME set every user command stops with `❌ backlog: teams are not allowed to use user commands` (ruling R19a). Every read and write goes through `backlog team`."
- Plan Task 9 (`.agents/docs/plans/2026-11-11-team-rules-engine-remaining-work.md`, section "Task 9"): "`skill-commands.test.js` requires the skill to contain `backlog team query rules --team <team>`, `backlog team query steps --team <team>`, `backlog team query check <item> <step>`, `backlog team validate --team <team>` and none of `--plan`, `--decisions`, `--wip`; the feature: a lead reads `query rules` and `query steps`, edits the team file, runs `backlog team validate` and sees a finding with its fix, in both locations." and "**Must not:** restate a team rule in the skill."
- Carry pointers of the earlier reviews (Task 5 post-merge review): "Carry pointer Task 9: a scenario that rewrites teams.json runs `backlog team validate --team <t>` (or commits the new teams_file_sha) before the next team command." and (Task 5b review): "Carry pointer Task 9: writeTeamFile always commits; an uncommitted lead edit of the team file needs its own step."
- Rulings recorded during the work (Task 5 post-merge review, #3): "a rewritten teams.json is ignored by the next team command while the record is fresh) is the design — chapter 01 section 4 step 3".
- Owner ruling R19a (`00-owner-rulings.md`): "When the TEAM_NAME variable is set, every user command fails (guard against an agent using the wrong command by accident or trying to get around the team commands). The text is a blanket failure with no instruction for the agent: teams are not allowed to use user commands."
- Owner ruling R8 (`00-owner-rulings.md`): "The rule set is written with a coherent structure and field naming so that an agent or a human understands it without reading the evaluator. The team lead and team member skills use the same rule set directly."
- Plan Global Constraints: "Documentation rule of `AGENTS.md`: every change of a command, option, output, refusal, rule or stored field ships in the same commit with `templates/skills/backlog/SKILL.md` (and `references/commands.md`), the help text (`src/help.js`, `src/team/help.js`), `COMMANDS.md` regenerated with `node .agents/scripts/sync-commands-md.mjs`, `README.md` where it describes the behaviour, and `CHANGELOG.md` (section `## Unreleased (2.0.0)`). None of them describes the old behaviour." and "No comment, test title or output text cites this plan, a design chapter, a ruling id or a decision id." and "Public repository: no tracked file and no commit message names a host or machine, a local path, a port or address, a model, a private repository, an internal agent or tool, a private process or a credential."
- Repository rule (`AGENTS.md`): "Do not call the user commands "plain", "non-team" or "basic" commands, and do not call the team commands "advanced"." (write "user commands" and "team commands" only).

## 3. BDD Acceptance Criteria

Source: BDD plan `.agents/docs/plans/2026-11-09-team-rules-engine/implementation/02-bdd-plan.md` section 2.5, row: "a new features/team-rules.feature | B16 | a lead reads `backlog team query rules` and `backlog team query steps`, edits the team file, runs `backlog team validate` and sees a finding with its fix".

The Gherkin below is this packet's realisation of the quoted row (proposed text, not a quotation; it was run on the head, see the evidence in the report). The scenario to write in `features/team-rules.feature` (observed on the head with the shipped parallel template; both locations):

```gherkin
Feature: Team rules - a lead reads what the rules say, edits the team file and is told what is wrong with the edit

  Background:
    Given a repository with a backlog
    And a team file from the template "parallel"
    And I act as agent "lead-1"

  Scenario: a lead reads the rules and the steps, breaks the team file and validate says where and how to fix it
    When I run `backlog team query rules --team parallel`
    Then the command succeeds
    And the output contains "\"people\""
    When I run `backlog team query steps --team parallel`
    Then the command succeeds
    And the output contains "claim  takes:"
    When I remove the field "holder" from the item definition of the team "parallel" in the team file
    And I run `backlog team validate --team parallel`
    Then the command fails with exit code 2
    And the output contains "holder is no field of the item definition"
    And the output contains "fix: add holder to parallel.item"
```

Observed output on the head after that edit (exit 2): `❌ .backlog/teams.json: parallel.rules.table[16].do.set.holder (rule claim): holder is no field of the item definition` then `   fix: add holder to parallel.item`. `query steps` prints one line per step as `<step>  takes: --a, --b  rules: id1, id2` (observed: `abandon  takes: --reason  rules: members-only, wait-for-children, abandon`). A second scenario is not required.

Unit-level Given/When/Then for the guards:
- Given the skill file, When `skill-commands.test.js` reads it, Then it contains `backlog team query rules --team <team>`, `backlog team query steps --team <team>`, `backlog team query check <item> <step>`, `backlog team validate --team <team>` and matches none of `/--(?:plan|decisions|wip)\b/`.
- Given the document list of `team-spelling-docs.test.js`, When it reads each line, Then no line shows `query` with a flag of the retired views, and `backlog team query steps` and `backlog team query rules` lines are accepted.

## 4. Target Files & Existing Helpers

Verified on the head:
- `templates/skills/backlog/SKILL.md` (82 lines): "## Team work" is lines 50-73. Line 66 holds `backlog team query plan`, `query check <item> <step>` and `query filter <name>`; line 71 `backlog team query --team <team>` and `query <item>`; line 72 `- Limits: \`wip-limits.json\` in the backlog folder.` (stale: delete it); line 73 `backlog team validate --team <team>`. There is no `query rules` and no `query steps` yet (grep `query rules\|query steps` finds nothing in the file). Line 52 says `teams.json` of the backlog folder; the team file location is the `teams_file` key of `.backlog/config.json`, else `.backlog/teams.json` (help text of `backlog team`, `src/team/help.js` lines 5-25): say so in one clause.
- `templates/skills/backlog/references/commands.md` (1583 lines) and `COMMANDS.md` are one text: `node .agents/scripts/sync-commands-md.mjs` rewrites the help blocks of `COMMANDS.md` from `src/help.js` and `src/team/help.js` and copies the file to the skill reference. `src/team/help.js` already documents `query rules`, `query steps` (lines 226-227): this task changes help text only where it is wrong; run the script and commit what it changes.
- `.agents/test/skill-commands.test.js` (52 lines): test `040: every team command is in the skill ...` (line 14) lists the required command strings (line 15); add the four strings and the `--plan|--decisions|--wip` absence. Its header comment (line 1) says "Every team command ... is in SKILL.md".
- `.agents/test/team-spelling-docs.test.js` (52 lines): `REMOVED.query` (line 14) lists retired view words; `DOCS` (line 10) is `COMMANDS.md`, `README.md` and every `.md`/`.json` under `templates`. Keep it passing with the new text; add one assertion that `query rules` and `query steps` lines are not reported (the spelling regex has `(?<!team )` before the command word).
- `features/steps/cli.js` (169 lines): reuse `a team file from the template "<name>"` (line 24), `I act as agent "<name>"` (line 19), `I run \`...\``, `the command succeeds`, `the command fails with exit code <n>`, `the output contains "<text>"`. Create one step: `I remove the field "<field>" from the item definition of the team "<team>" in the team file` which reads `join(w.repo, '.backlog', 'teams.json')`, deletes `[team].item[field]` and calls `w.writeTeamFile(parsed)` (`features/support/world.js` line 40: it writes the file and always commits and pushes it, the same in both locations). A new step must be registered with `step(regex, fn)` of `../support/gherkin.js` as the others are.
- `features/support/world.js`, `.agents/test/team-fixture.js` (`TEMPLATES`): unchanged.

Interfaces: Consumes the merged commands `backlog team query rules [--team <name> | --show-all]` and `backlog team query steps --team <name> [--json]` (Task 8), `backlog team query check <item> <step>` (Task 3), `backlog team validate [--team <name> | --show-all] [--json]`. Produces: the text of the skill's "Team work" section and one feature file for Tasks 15 and 32 (docs pass) to leave alone.

## 5. TDD Execution & Verification

Export `PATH` to a Node 24 and set a temporary `TMPDIR`; `node --version` prints `v24.`.

1. Write the tests first (all fail on the head):
   - `.agents/test/skill-commands.test.js`: extend the list of required strings at line 15 with `'backlog team query rules --team <team>'`, `'backlog team query steps --team <team>'`, `'backlog team query check <item> <step>'`, `'backlog team validate --team <team>'`, and add `assert.doesNotMatch(skill, /--(?:plan|decisions|wip)\b/)`. Fails today: the first two strings are absent.
   - `features/team-rules.feature` with the scenario of section 3 and the new step. Fails today: the step is undefined (the feature reports the missing step).
2. Run: `node --test .agents/test/skill-commands.test.js` (FAIL), `FEATURE_LOCATION=local node --test .agents/test/features.test.js` (FAIL on the new scenario only).
3. Write the skill text: replace the lines of the "Team work" section so it contains the commands `backlog team new`, `update`, `pop`, `query` (list, `<item>`, `filter`, `check`, `plan`, `rules`, `steps`), `validate`, and the word `migrate` once (`backlog team migrate --team <team>` converts markdown items; nothing more is said before Task 23). Delete the `Limits` line. Add: before a step, read the team's own words with `backlog team query steps --team <team>` and the rules with `backlog team query rules --team <team>`; after editing the team file run `backlog team validate --team <team>`. Do not write a status, stage or role word of any team, do not state what a rule decides.
4. Run `node .agents/scripts/sync-commands-md.mjs`; commit the regenerated `COMMANDS.md` and `templates/skills/backlog/references/commands.md` (equal text; `shared-help.test.js` checks it). Add one `CHANGELOG.md` bullet only if no existing bullet of `## Unreleased (2.0.0)` already says the skill teaches `query rules` and `query steps` (grep first); `README.md` only where it names the skill's team commands.
5. Mutations each test must kill: delete the `query rules` line from the skill, the first test fails; re-add `--plan` text to the skill, the absence assertion fails; make the new step not call `writeTeamFile` (edit without commit), the scenario fails in the `remote` location on the finding text or the exit code.
6. Commands that must pass (inside the repository root):
   - `npm run check` (exit 0)
   - `SMOOTH_BACKLOG_CLI_PRIVATE_DENYLIST=<private deny-list file> node --test .agents/test/no-private-details.test.js` (3 pass, 0 fail)
   - `flock <machine-wide suite lock file> node --test .agents/test/*.test.js > <scratch>/full.log 2>&1; tail -12 <scratch>/full.log` (fail 0)
   - `flock <machine-wide suite lock file> env FEATURE_LOCATION=local node --test .agents/test/features.test.js` (fail 0)
   - `flock <machine-wide suite lock file> env FEATURE_LOCATION=remote node --test .agents/test/features.test.js` (fail 0)
   State the scenario count: it is the head's count plus 1 per location (run the local feature suite once before the change and note its total).

## 6. Must-not and Carry pointers

Quoted (plan, Task 9): "**Must not:** restate a team rule in the skill." Added by this packet (not quoted): change any file of `src/`; touch the "Working alone" section; name a team's status or role word; write a local path, host or private name anywhere.

Carry pointers addressed to this task (quoted above): the scenario that rewrites `teams.json` runs `backlog team validate --team <t>` before any later team command (here validate is the last command, so nothing follows it); `writeTeamFile` always commits, so the step commits the edit itself, as `writeTeamFile` does. review record (Task 8 review): "#3 (docs: rules output is redacted) and #5 (team-spelling-docs allows 'query steps') in the docs commit after Task 10": the guard already allows `query steps` (verify with a test line, do not re-edit); the "rules output is redacted" sentence is in the help text of `team query` when `src/team/help.js` says so (grep `redact` there; add one clause to the help and the skill's `query rules` line only if absent).

Self-review (done on this packet): spec coverage - skill, both guards, feature and both generated files named; no placeholder; signatures: the only new code is one step `I remove the field "<field>" from the item definition of the team "<team>" in the team file`; no later packet consumes it.
