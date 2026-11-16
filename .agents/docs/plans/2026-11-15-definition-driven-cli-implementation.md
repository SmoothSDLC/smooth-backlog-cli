# Definition-driven CLI: implementation plan

> **For agentic workers:** each task is one file in [2026-11-15-definition-driven-cli-implementation/](2026-11-15-definition-driven-cli-implementation/). A session works from that file alone. REQUIRED SUB-SKILLS by installed name: `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `ponytail`, `ponytail-review`, `systematic-debugging` (as each task says).

**Goal:** build the CLI of the specification [2026-11-14-definition-driven-cli/behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md): user commands with no rules, team commands on a JsonLogic rules engine, item definitions and redaction as data, no workflow in the code.

**Architecture:** every item is a flat JSON object checked with Ajv against the base item schema and the item definition that applies; every change of an item is redacted and, for team commands, evaluated by every rule of the team with json-logic-js; the CLI commits only its files and pushes only its commits.

**Tech stack:** Node.js 24 ES modules, `node:test`, the scenario runner `.agents/test/features.test.js` (both storage locations), `ajv` 8, `ajv-formats` 3, `json-logic-js` 2, `re2`.

## How the tasks are sized and run

- **One task, one session, one file.** A task copies the requirements, scenarios, files, interfaces and tests it needs, so a session with a smaller coding model reads nothing else. A task changes at most three source files beside its tests and feature file.
- **Two sessions per task.** Session 1 implements in at most 30 minutes, test first (scenarios, then unit tests, then code), refines with a code review and a ponytail pass, and writes a hand-off into the task's backlog item. Session 2, a new session, reads the task file and that hand-off only, and reviews in at most 15 minutes against the task's scenarios, tests, interfaces, files and requirements, writing PASS or FAIL into the same item.
- **Integration tasks** (`INT-01` to `INT-07`) follow groups of tasks that must work together: they run the joined scenarios and tests, fix only the seams, and are reviewed the same way.
- **Order.** A task starts only when every task of "Depends on" is merged into `simplify/pr3-review`. 
- **Merging.** After a PASS, the lead merges the task, runs the full proof (`npm test`, `npm run check`, the guard, scenarios in both locations), and runs a ponytail review of the merged result.

## Global constraints (every task)

- Node `>=24`, ES modules. Runtime libraries are used where they do the job (Ajv, ajv-formats, json-logic-js, re2), never hand-built (C-40).
- This repository is public: no host, machine, local path, port, model, private repository, agent or tool name in any tracked file or commit message; the private-details guard runs before every commit.
- The code names no status word, role, review, claim, holder, dependency, parent, limit or hand-off (C-18, C-23).
- User commands print text and take `--json`; team commands print JSON and take `--human`; every command that changes items takes `--whatif`.
- Commits with the repository's agent identity, no trailers; tasks commit on local branches `task/<id>`; only the lead pushes `simplify/pr3-review`.

## Review focus (failures no single task's own tests would show)

1. A redacted value must reach the team rules and the history redacted (TASK-32).
2. Commands that only read evaluate no redaction rule and no team rule (TASK-21, TASK-35).
3. `p0` is a priority, `0` and `012` numbers; `p`, `p-1`, `px` are refused (TASK-15).
4. Team command JSON keeps one shape for success and for refusal (TASK-32).
5. Two agents changing the backlog at the same moment: the first push wins, the loser reverts and fails (TASK-12).
6. Every failure prints what happened, why and what to do (TASK-08).

## Tasks

| Task | Title | Kind | Depends on |
|---|---|---|---|
| [TASK-01](2026-11-15-definition-driven-cli-implementation/TASK-01.md) | Runtime libraries and the schema files | build | - |
| [TASK-02](2026-11-15-definition-driven-cli-implementation/TASK-02.md) | The flat item file | build | TASK-01 |
| [TASK-03](2026-11-15-definition-driven-cli-implementation/TASK-03.md) | Index entries carry the title | build | TASK-02 |
| [TASK-04](2026-11-15-definition-driven-cli-implementation/TASK-04.md) | The store reads and writes flat items | build | TASK-02, TASK-03 |
| [INT-01](2026-11-15-definition-driven-cli-implementation/INT-01.md) | Integration: item file, index and store | integration | TASK-02, TASK-03, TASK-04 |
| [TASK-05](2026-11-15-definition-driven-cli-implementation/TASK-05.md) | The item definition that applies | build | TASK-01, TASK-02 |
| [TASK-06](2026-11-15-definition-driven-cli-implementation/TASK-06.md) | Checking a value against its field | build | TASK-05 |
| [TASK-07](2026-11-15-definition-driven-cli-implementation/TASK-07.md) | Reading the configuration | build | TASK-01 |
| [TASK-08](2026-11-15-definition-driven-cli-implementation/TASK-08.md) | Failure messages | build | TASK-01 |
| [TASK-09](2026-11-15-definition-driven-cli-implementation/TASK-09.md) | Inputs from flags, named variables and the configuration | build | TASK-07 |
| [TASK-10](2026-11-15-definition-driven-cli-implementation/TASK-10.md) | The backlog location must be a git repository | build | TASK-07 |
| [TASK-11](2026-11-15-definition-driven-cli-implementation/TASK-11.md) | Commit only the CLI's files, push only its commits | build | TASK-07, TASK-10 |
| [TASK-12](2026-11-15-definition-driven-cli-implementation/TASK-12.md) | Concurrency: the first push wins, the loser fails | build | TASK-11, TASK-08 |
| [INT-02](2026-11-15-definition-driven-cli-implementation/INT-02.md) | Integration: configuration, inputs, location and publication | integration | TASK-07, TASK-09, TASK-10, TASK-11, TASK-12 |
| [TASK-13](2026-11-15-definition-driven-cli-implementation/TASK-13.md) | Redaction rules in force and text redaction | build | TASK-01, TASK-07 |
| [TASK-14](2026-11-15-definition-driven-cli-implementation/TASK-14.md) | Redacting an item on every change | build | TASK-13, TASK-02 |
| [TASK-15](2026-11-15-definition-driven-cli-implementation/TASK-15.md) | Naming an item by number, slug or priority | build | TASK-03 |
| [TASK-16](2026-11-15-definition-driven-cli-implementation/TASK-16.md) | backlog new with title and description | build | INT-01, TASK-06, TASK-14, INT-02 |
| [TASK-17](2026-11-15-definition-driven-cli-implementation/TASK-17.md) | backlog new from a file, with --whatif and --ask | build | TASK-16 |
| [TASK-18](2026-11-15-definition-driven-cli-implementation/TASK-18.md) | backlog update: title, description, status and fields | build | TASK-16, TASK-15 |
| [TASK-19](2026-11-15-definition-driven-cli-implementation/TASK-19.md) | backlog update priority | build | TASK-18 |
| [TASK-20](2026-11-15-definition-driven-cli-implementation/TASK-20.md) | backlog update on an item of a team, and repairs | build | TASK-18 |
| [TASK-21](2026-11-15-definition-driven-cli-implementation/TASK-21.md) | backlog list and backlog show | build | TASK-15, INT-01 |
| [INT-03](2026-11-15-definition-driven-cli-implementation/INT-03.md) | Integration: the user commands that create, change and read | integration | TASK-16, TASK-17, TASK-18, TASK-19, TASK-20, TASK-21 |
| [TASK-22](2026-11-15-definition-driven-cli-implementation/TASK-22.md) | backlog archive | build | TASK-18 |
| [TASK-23](2026-11-15-definition-driven-cli-implementation/TASK-23.md) | backlog archive done | build | TASK-22, TASK-06 |
| [TASK-24](2026-11-15-definition-driven-cli-implementation/TASK-24.md) | backlog import, branch and branch import | build | TASK-18 |
| [TASK-25](2026-11-15-definition-driven-cli-implementation/TASK-25.md) | backlog import from another repository | build | TASK-24, TASK-05 |
| [INT-04](2026-11-15-definition-driven-cli-implementation/INT-04.md) | Integration: every user command | integration | INT-03, TASK-22, TASK-23, TASK-24 |
| [TASK-26](2026-11-15-definition-driven-cli-implementation/TASK-26.md) | Rules engine: evaluating a change | build | TASK-01 |
| [TASK-27](2026-11-15-definition-driven-cli-implementation/TASK-27.md) | Rules engine: the extra operators | build | TASK-26 |
| [TASK-28](2026-11-15-definition-driven-cli-implementation/TASK-28.md) | Rules engine: queue and filters | build | TASK-27 |
| [TASK-29](2026-11-15-definition-driven-cli-implementation/TASK-29.md) | Rules validation: form, paths, literals, errors, roles | build | TASK-27 |
| [TASK-30](2026-11-15-definition-driven-cli-implementation/TASK-30.md) | Rules validation: contradictions | build | TASK-29 |
| [TASK-31](2026-11-15-definition-driven-cli-implementation/TASK-31.md) | The example teams give the stated results | build | TASK-28, TASK-30 |
| [INT-05](2026-11-15-definition-driven-cli-implementation/INT-05.md) | Integration: rules engine and example teams | integration | TASK-26, TASK-27, TASK-28, TASK-29, TASK-30, TASK-31 |
| [TASK-32](2026-11-15-definition-driven-cli-implementation/TASK-32.md) | A team change: build, redact, evaluate, print | build | INT-04, INT-05 |
| [TASK-33](2026-11-15-definition-driven-cli-implementation/TASK-33.md) | backlog team new and backlog team update | build | TASK-32 |
| [TASK-34](2026-11-15-definition-driven-cli-implementation/TASK-34.md) | Team archive, archive done, import and branch import | build | TASK-32 |
| [TASK-35](2026-11-15-definition-driven-cli-implementation/TASK-35.md) | Team list, show and filters | build | TASK-32 |
| [TASK-36](2026-11-15-definition-driven-cli-implementation/TASK-36.md) | backlog team pop on the queue | build | TASK-35 |
| [INT-06](2026-11-15-definition-driven-cli-implementation/INT-06.md) | Integration: team commands on the rules engine | integration | TASK-33, TASK-34, TASK-35, TASK-36 |
| [TASK-37](2026-11-15-definition-driven-cli-implementation/TASK-37.md) | backlog validate | build | TASK-06, TASK-14, TASK-30 |
| [TASK-38](2026-11-15-definition-driven-cli-implementation/TASK-38.md) | Validate: a property no definition declares | build | TASK-37 |
| [TASK-39](2026-11-15-definition-driven-cli-implementation/TASK-39.md) | backlog team validate | build | TASK-37 |
| [TASK-40](2026-11-15-definition-driven-cli-implementation/TASK-40.md) | backlog setup: configuration and skill | build | INT-02 |
| [TASK-41](2026-11-15-definition-driven-cli-implementation/TASK-41.md) | backlog setup: examples and the version check | build | TASK-40, TASK-31 |
| [TASK-42](2026-11-15-definition-driven-cli-implementation/TASK-42.md) | The version check on every command | build | TASK-04, TASK-08 |
| [TASK-43](2026-11-15-definition-driven-cli-implementation/TASK-43.md) | backlog upgrade: conversion per version | build | TASK-42, TASK-37 |
| [TASK-44](2026-11-15-definition-driven-cli-implementation/TASK-44.md) | Remove backlog team migrate | build | TASK-43 |
| [TASK-45](2026-11-15-definition-driven-cli-implementation/TASK-45.md) | Help, the removed commands and --whatif | build | INT-04, INT-06, TASK-44 |
| [TASK-46](2026-11-15-definition-driven-cli-implementation/TASK-46.md) | Remove the run hook | build | TASK-45 |
| [TASK-47](2026-11-15-definition-driven-cli-implementation/TASK-47.md) | The coded team workflow leaves the code | build | INT-06 |
| [TASK-48](2026-11-15-definition-driven-cli-implementation/TASK-48.md) | The shared checks and variables of the coded workflow leave the code | build | TASK-47 |
| [TASK-49](2026-11-15-definition-driven-cli-implementation/TASK-49.md) | Example teams in the package and the examples guide | build | TASK-31, TASK-39 |
| [TASK-50](2026-11-15-definition-driven-cli-implementation/TASK-50.md) | README, COMMANDS and the skill | build | TASK-45, TASK-49 |
| [TASK-51](2026-11-15-definition-driven-cli-implementation/TASK-51.md) | CHANGELOG and AGENTS | build | TASK-50 |
| [TASK-52](2026-11-15-definition-driven-cli-implementation/TASK-52.md) | Old scenarios and tests to the archive | build | TASK-47, TASK-48, TASK-50 |
| [INT-07](2026-11-15-definition-driven-cli-implementation/INT-07.md) | Integration: the whole branch | integration | TASK-52, TASK-51, TASK-46, TASK-44, TASK-38, TASK-25, TASK-42 |
