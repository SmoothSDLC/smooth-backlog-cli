# Definition-driven CLI: implementation plan

> **For agentic workers:** each slice is one file in [2026-11-15-definition-driven-cli-implementation/](2026-11-15-definition-driven-cli-implementation/). A session works from that file alone. REQUIRED SUB-SKILLS by installed name: `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `ponytail`, `ponytail-review`, `systematic-debugging` (as each slice says).

**Goal:** build the CLI of the specification [2026-11-14-definition-driven-cli/behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md): user commands with no rules, team commands on a JsonLogic rules engine, item definitions and redaction as data, no workflow in the code.

**Architecture:** every item is a flat JSON object checked with Ajv against the base item schema and the item definition that applies; every change of an item is redacted and, for team commands, evaluated by every rule of the team with json-logic-js; the CLI commits only its files and pushes only its commits.

**Tech stack:** Node.js 24 ES modules, `node:test`, the scenario runner `.agents/test/features.test.js` (both storage locations), `ajv` 8, `ajv-formats` 3, `json-logic-js` 2, `re2`.

## How the slices are sized and run

- **One slice, one session, one file.** A slice copies the requirements, scenarios, files, interfaces and tests it needs, so a session with a smaller coding model reads nothing else. A slice changes at most three source files beside its tests and feature file.
- **Two sessions per slice.** Session 1 implements in at most 30 minutes, test first (scenarios, then unit tests, then code), refines with a code review and a ponytail pass, and writes a hand-off into the slice's backlog item. Session 2, a new session, reads the slice file and that hand-off only, and reviews in at most 15 minutes against the slice's scenarios, tests, interfaces, files and requirements, writing PASS or FAIL into the same item.
- **Integration slices** (`I01` to `I07`) follow groups of slices that must work together: they run the joined scenarios and tests, fix only the seams, and are reviewed the same way.
- **Order.** A slice starts only when every slice of "Depends on" is merged into `simplify/pr3-review`. A slice that waits for an owner decision starts only after the owner answers it and the slice is rewritten; the decision is named in the slice's backlog item.
- **Merging.** After a PASS, the lead merges the slice, runs the full proof (`npm test`, `npm run check`, the guard, scenarios in both locations), and runs a ponytail review of the merged result.

## Global constraints (every slice)

- Node `>=24`, ES modules. Runtime libraries are used where they do the job (Ajv, ajv-formats, json-logic-js, re2), never hand-built (C-40).
- This repository is public: no host, machine, local path, port, model, private repository, agent or tool name in any tracked file or commit message; the private-details guard runs before every commit.
- The code names no status word, role, review, claim, holder, dependency, parent, limit or hand-off (C-18, C-23).
- User commands print text and take `--json`; team commands print JSON and take `--human`; every command that changes items takes `--whatif`.
- Commits with the repository's agent identity, no trailers; slices commit on local branches `slice/<id>`; only the lead pushes `simplify/pr3-review`.

## Review focus (failures no single slice's own tests would show)

1. A redacted value must reach the team rules and the history redacted (S30).
2. Commands that only read evaluate no redaction rule and no team rule (S20, S33).
3. `p0` is a priority, `0` and `012` numbers; `p`, `p-1`, `px` are refused (S14).
4. Team command JSON keeps one shape for success and for refusal (S30).
5. Two commands in one local copy at the same moment (S11).

## Slices

| Slice | Title | Kind | Depends on | Waits for an owner decision |
|---|---|---|---|---|
| [S01](2026-11-15-definition-driven-cli-implementation/S01.md) | Runtime libraries and the schema files | build | - | - |
| [S02](2026-11-15-definition-driven-cli-implementation/S02.md) | The flat item file | build | S01 | - |
| [S03](2026-11-15-definition-driven-cli-implementation/S03.md) | Index entries carry the title | build | S02 | - |
| [S04](2026-11-15-definition-driven-cli-implementation/S04.md) | The store reads and writes flat items | build | S02, S03 | - |
| [I01](2026-11-15-definition-driven-cli-implementation/I01.md) | Integration: item file, index and store | integration | S02, S03, S04 | - |
| [S05](2026-11-15-definition-driven-cli-implementation/S05.md) | The item definition that applies | build | S01, S02 | - |
| [S06](2026-11-15-definition-driven-cli-implementation/S06.md) | Checking a value against its field | build | S05 | - |
| [S07](2026-11-15-definition-driven-cli-implementation/S07.md) | Reading the configuration | build | S01 | - |
| [S08](2026-11-15-definition-driven-cli-implementation/S08.md) | Inputs from flags, named variables and the configuration | build | S07 | - |
| [S09](2026-11-15-definition-driven-cli-implementation/S09.md) | The backlog location must be a git repository | build | S07 | - |
| [S10](2026-11-15-definition-driven-cli-implementation/S10.md) | Commit only the CLI's files, push only its commits | build | S07, S09 | - |
| [S11](2026-11-15-definition-driven-cli-implementation/S11.md) | Turn-taking of two commands in one local copy | build | S10 | yes |
| [I02](2026-11-15-definition-driven-cli-implementation/I02.md) | Integration: configuration, inputs, location and publication | integration | S07, S08, S09, S10 | - |
| [S12](2026-11-15-definition-driven-cli-implementation/S12.md) | Redaction rules in force and text redaction | build | S01, S07 | - |
| [S13](2026-11-15-definition-driven-cli-implementation/S13.md) | Redacting an item on every change | build | S12, S02 | - |
| [S14](2026-11-15-definition-driven-cli-implementation/S14.md) | Naming an item by number, slug or priority | build | S03 | - |
| [S15](2026-11-15-definition-driven-cli-implementation/S15.md) | backlog new with title and description | build | I01, S06, S13, I02 | - |
| [S16](2026-11-15-definition-driven-cli-implementation/S16.md) | backlog new from a file, with --whatif and --ask | build | S15 | - |
| [S17](2026-11-15-definition-driven-cli-implementation/S17.md) | backlog update: title, description, status and fields | build | S15, S14 | - |
| [S18](2026-11-15-definition-driven-cli-implementation/S18.md) | backlog update priority | build | S17 | - |
| [S19](2026-11-15-definition-driven-cli-implementation/S19.md) | backlog update on an item of a team, and repairs | build | S17 | - |
| [S20](2026-11-15-definition-driven-cli-implementation/S20.md) | backlog list and backlog show | build | S14, I01 | - |
| [I03](2026-11-15-definition-driven-cli-implementation/I03.md) | Integration: the user commands that create, change and read | integration | S15, S16, S17, S18, S19, S20 | - |
| [S21](2026-11-15-definition-driven-cli-implementation/S21.md) | backlog archive | build | S17 | - |
| [S22](2026-11-15-definition-driven-cli-implementation/S22.md) | backlog archive done | build | S21, S06 | - |
| [S23](2026-11-15-definition-driven-cli-implementation/S23.md) | backlog import, branch and branch import | build | S17 | - |
| [I04](2026-11-15-definition-driven-cli-implementation/I04.md) | Integration: every user command | integration | I03, S21, S22, S23 | - |
| [S24](2026-11-15-definition-driven-cli-implementation/S24.md) | Rules engine: evaluating a change | build | S01 | - |
| [S25](2026-11-15-definition-driven-cli-implementation/S25.md) | Rules engine: the extra operators | build | S24 | - |
| [S26](2026-11-15-definition-driven-cli-implementation/S26.md) | Rules engine: queue and filters | build | S25 | - |
| [S27](2026-11-15-definition-driven-cli-implementation/S27.md) | Rules validation: form, paths, literals, errors, roles | build | S25 | - |
| [S28](2026-11-15-definition-driven-cli-implementation/S28.md) | Rules validation: contradictions | build | S27 | - |
| [S29](2026-11-15-definition-driven-cli-implementation/S29.md) | The example teams give the stated results | build | S26, S28 | - |
| [I05](2026-11-15-definition-driven-cli-implementation/I05.md) | Integration: rules engine and example teams | integration | S24, S25, S26, S27, S28, S29 | - |
| [S30](2026-11-15-definition-driven-cli-implementation/S30.md) | A team change: build, redact, evaluate, print | build | I04, I05 | - |
| [S31](2026-11-15-definition-driven-cli-implementation/S31.md) | backlog team new and backlog team update | build | S30 | - |
| [S32](2026-11-15-definition-driven-cli-implementation/S32.md) | Team archive, archive done, import and branch import | build | S30 | - |
| [S33](2026-11-15-definition-driven-cli-implementation/S33.md) | Team list, show and filters | build | S30 | - |
| [S34](2026-11-15-definition-driven-cli-implementation/S34.md) | backlog team pop on the queue | build | S33 | - |
| [I06](2026-11-15-definition-driven-cli-implementation/I06.md) | Integration: team commands on the rules engine | integration | S31, S32, S33, S34 | - |
| [S35](2026-11-15-definition-driven-cli-implementation/S35.md) | backlog validate | build | S06, S13, S28 | - |
| [S36](2026-11-15-definition-driven-cli-implementation/S36.md) | Validate: values in fields the definition does not declare | build | S35 | yes |
| [S37](2026-11-15-definition-driven-cli-implementation/S37.md) | backlog team validate | build | S35 | - |
| [S38](2026-11-15-definition-driven-cli-implementation/S38.md) | backlog setup: configuration and skill | build | I02 | - |
| [S39](2026-11-15-definition-driven-cli-implementation/S39.md) | backlog setup: examples and the version check | build | S38, S29 | - |
| [S40](2026-11-15-definition-driven-cli-implementation/S40.md) | backlog upgrade of the backlog | build | S39 | yes |
| [S41](2026-11-15-definition-driven-cli-implementation/S41.md) | Help, the removed commands and --whatif | build | I04, I06 | - |
| [S42](2026-11-15-definition-driven-cli-implementation/S42.md) | The run recorder | build | S41 | yes |
| [S43](2026-11-15-definition-driven-cli-implementation/S43.md) | The coded team workflow leaves the code | build | I06 | - |
| [S44](2026-11-15-definition-driven-cli-implementation/S44.md) | The shared checks and variables of the coded workflow leave the code | build | S43 | - |
| [S45](2026-11-15-definition-driven-cli-implementation/S45.md) | Example teams in the package and the examples guide | build | S29, S37 | - |
| [S46](2026-11-15-definition-driven-cli-implementation/S46.md) | README, COMMANDS and the skill | build | S41, S45 | - |
| [S47](2026-11-15-definition-driven-cli-implementation/S47.md) | CHANGELOG and AGENTS | build | S46 | - |
| [S48](2026-11-15-definition-driven-cli-implementation/S48.md) | Old scenarios and tests to the archive | build | S43, S44, S46 | - |
| [I07](2026-11-15-definition-driven-cli-implementation/I07.md) | Integration: the whole branch | integration | S48, S47, S42, S40, S36, S11 | - |
