# Definition-driven CLI: implementation plan

> **For agentic workers:** each task is one file in [2026-11-15-definition-driven-cli-implementation/](2026-11-15-definition-driven-cli-implementation/). A session works from that file alone. REQUIRED SUB-SKILLS by installed name: `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `ponytail`, `ponytail-review`, `systematic-debugging` (as each task says).

**Goal:** build the CLI of the specification [2026-11-14-definition-driven-cli/behaviour-spec.md](2026-11-14-definition-driven-cli/behaviour-spec.md): user commands with no rules, team commands on a JsonLogic rules engine, item definitions and redaction as data, no workflow in the code.

**Architecture:** every item is a flat JSON object checked with Ajv against the base item schema and the item definition that applies; every change of an item is redacted and, for team commands, evaluated by every rule of the team with json-logic-js; the CLI commits only its files and pushes only its commits.

**Tech stack:** Node.js 24 ES modules, `node:test`, the scenario runner `.agents/test/features.test.js` (both storage locations), `ajv` 8, `ajv-formats` 3, `json-logic-js` 2, `re2`.

## How the tasks are sized and run

- **One task, one session, one file.** A task copies the requirements, scenarios, files, interfaces and tests it needs, so a session with a smaller coding model reads nothing else. A task changes at most three source files beside its tests and feature file.
- **Two sessions per task.** Session 1 implements in at most 30 minutes, test first (scenarios, then unit tests, then code), refines with a code review and a ponytail pass, and writes a hand-off into the task's backlog item. Session 2, a new session, reads the task file and that hand-off only, and reviews in at most 15 minutes against the task's scenarios, tests, interfaces, files and requirements, writing PASS or FAIL into the same item.
- **Integration tasks** (`INT-01` to `INT-08`) follow groups of tasks that must work together: they run the joined scenarios and tests, fix only the seams, and are reviewed the same way.
- **Failure-message tasks** (`FAIL-01` to `FAIL-22`, one per command, C-51) make every failure of section 4.16 of that command print what happened, why and what to do; `INT-08` checks every failure of every command together.
- **Permutation tasks** (`PERM-01` to `PERM-22`, one per command, C-52) run every combination of the command's subcommands and flags in both storage locations, each with its expected result.
- **Backlog items.** Every task is one backlog item, and its task file is copied unchanged into that item. The item that holds this plan depends on every task item and closes last.
- **Order.** A task starts only when every task of "Depends on" is merged into `simplify/pr3-review`. 
- **Merging.** After a PASS, the lead merges the task, runs the full proof (`npm test`, `npm run check`, the guard, scenarios in both locations), and runs a ponytail review of the merged result.

## What every task file has (checked when the files are generated)

1. The backlog item that holds it, and the statement that the file is copied unchanged into that item.
2. "Depends on": every task that must be merged first, with its backlog item, and the instruction to read its hand-off.
3. "Required reads": `AGENTS.md`, the task's own backlog item with its hand-offs, the hand-offs of its dependencies, the specification only for the sections it names, and its existing files.
4. "Skills": the skills of session 1 and of session 2 by installed name.
5. "Requirements" copied from the specification, "Scenarios", "Files", "Interfaces" and the unit tests or checks.
6. Session 1 (implement or integrate, at most 30 minutes) with its stop rules and the hand-off to write into the backlog item.
7. Session 2 (review, at most 15 minutes, a new session) with the verdict to write into the backlog item.

## Order (waves: every task of a wave can run once the waves before it are merged)

1. TASK-01
2. TASK-02, TASK-07, TASK-08, TASK-26
3. TASK-03, TASK-05, TASK-09, TASK-10, TASK-13, TASK-27
4. TASK-04, TASK-06, TASK-11, TASK-14, TASK-15, TASK-28, TASK-29
5. INT-01, TASK-12, TASK-30, TASK-42
6. INT-02, TASK-21, TASK-31, TASK-37
7. FAIL-05, FAIL-06, INT-05, TASK-16, TASK-38, TASK-39, TASK-40, TASK-43
8. FAIL-11, FAIL-12, TASK-17, TASK-18, TASK-41, TASK-44, TASK-49
9. FAIL-02, FAIL-03, TASK-19, TASK-20, TASK-22, TASK-24
10. FAIL-04, FAIL-07, FAIL-10, INT-03, TASK-23, TASK-25
11. FAIL-08, FAIL-09, INT-04
12. TASK-32
13. FAIL-22, TASK-33, TASK-34, TASK-35
14. FAIL-13, FAIL-14, FAIL-15, FAIL-16, FAIL-17, FAIL-18, FAIL-19, FAIL-21, TASK-36
15. FAIL-20, INT-06
16. TASK-45, TASK-47
17. FAIL-01, PERM-02, PERM-03, PERM-04, PERM-05, PERM-06, PERM-07, PERM-08, PERM-09, PERM-10, PERM-11, PERM-12, PERM-13, PERM-14, PERM-15, PERM-16, PERM-17, PERM-18, PERM-19, PERM-20, PERM-21, PERM-22, TASK-46, TASK-48, TASK-50
18. INT-08, PERM-01, TASK-51, TASK-52
19. INT-07

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

| Task | Backlog item | Title | Kind | Depends on |
|---|---|---|---|---|
| [TASK-01](2026-11-15-definition-driven-cli-implementation/TASK-01.md) | 155 | Runtime libraries and the schema files | build | - |
| [TASK-02](2026-11-15-definition-driven-cli-implementation/TASK-02.md) | 156 | The flat item file | build | TASK-01 |
| [TASK-03](2026-11-15-definition-driven-cli-implementation/TASK-03.md) | 157 | Index entries carry the title | build | TASK-02 |
| [TASK-04](2026-11-15-definition-driven-cli-implementation/TASK-04.md) | 158 | The store reads and writes flat items | build | TASK-02, TASK-03 |
| [INT-01](2026-11-15-definition-driven-cli-implementation/INT-01.md) | 159 | Integration: item file, index and store | integration | TASK-02, TASK-03, TASK-04 |
| [TASK-05](2026-11-15-definition-driven-cli-implementation/TASK-05.md) | 160 | The item definition that applies | build | TASK-01, TASK-02 |
| [TASK-06](2026-11-15-definition-driven-cli-implementation/TASK-06.md) | 161 | Checking a value against its field | build | TASK-05 |
| [TASK-07](2026-11-15-definition-driven-cli-implementation/TASK-07.md) | 162 | Reading the configuration | build | TASK-01 |
| [TASK-08](2026-11-15-definition-driven-cli-implementation/TASK-08.md) | 211 | Failure messages | build | TASK-01 |
| [TASK-09](2026-11-15-definition-driven-cli-implementation/TASK-09.md) | 163 | Inputs from flags, named variables and the configuration | build | TASK-07 |
| [TASK-10](2026-11-15-definition-driven-cli-implementation/TASK-10.md) | 164 | The backlog location must be a git repository | build | TASK-07 |
| [TASK-11](2026-11-15-definition-driven-cli-implementation/TASK-11.md) | 165 | Commit only the CLI's files, push only its commits | build | TASK-07, TASK-10 |
| [TASK-12](2026-11-15-definition-driven-cli-implementation/TASK-12.md) | 166 | Concurrency: the first push wins, the loser fails | build | TASK-11, TASK-08 |
| [INT-02](2026-11-15-definition-driven-cli-implementation/INT-02.md) | 167 | Integration: configuration, inputs, location and publication | integration | TASK-07, TASK-09, TASK-10, TASK-11, TASK-12 |
| [TASK-13](2026-11-15-definition-driven-cli-implementation/TASK-13.md) | 168 | Redaction rules in force and text redaction | build | TASK-01, TASK-07 |
| [TASK-14](2026-11-15-definition-driven-cli-implementation/TASK-14.md) | 169 | Redacting an item on every change | build | TASK-13, TASK-02 |
| [TASK-15](2026-11-15-definition-driven-cli-implementation/TASK-15.md) | 170 | Naming an item by number, slug or priority | build | TASK-03 |
| [TASK-16](2026-11-15-definition-driven-cli-implementation/TASK-16.md) | 171 | backlog new with title and description | build | INT-01, TASK-06, TASK-14, INT-02 |
| [TASK-17](2026-11-15-definition-driven-cli-implementation/TASK-17.md) | 172 | backlog new from a file, with --whatif and --ask | build | TASK-16 |
| [TASK-18](2026-11-15-definition-driven-cli-implementation/TASK-18.md) | 173 | backlog update: title, description, status and fields | build | TASK-16, TASK-15 |
| [TASK-19](2026-11-15-definition-driven-cli-implementation/TASK-19.md) | 174 | backlog update priority | build | TASK-18 |
| [TASK-20](2026-11-15-definition-driven-cli-implementation/TASK-20.md) | 175 | backlog update on an item of a team, and repairs | build | TASK-18 |
| [TASK-21](2026-11-15-definition-driven-cli-implementation/TASK-21.md) | 176 | backlog list and backlog show | build | TASK-15, INT-01 |
| [INT-03](2026-11-15-definition-driven-cli-implementation/INT-03.md) | 177 | Integration: the user commands that create, change and read | integration | TASK-16, TASK-17, TASK-18, TASK-19, TASK-20, TASK-21 |
| [TASK-22](2026-11-15-definition-driven-cli-implementation/TASK-22.md) | 178 | backlog archive | build | TASK-18 |
| [TASK-23](2026-11-15-definition-driven-cli-implementation/TASK-23.md) | 179 | backlog archive done | build | TASK-22, TASK-06 |
| [TASK-24](2026-11-15-definition-driven-cli-implementation/TASK-24.md) | 180 | backlog import, branch and branch import | build | TASK-18 |
| [TASK-25](2026-11-15-definition-driven-cli-implementation/TASK-25.md) | 212 | backlog import from another repository | build | TASK-24, TASK-05 |
| [INT-04](2026-11-15-definition-driven-cli-implementation/INT-04.md) | 181 | Integration: every user command | integration | INT-03, TASK-22, TASK-23, TASK-24 |
| [TASK-26](2026-11-15-definition-driven-cli-implementation/TASK-26.md) | 182 | Rules engine: evaluating a change | build | TASK-01 |
| [TASK-27](2026-11-15-definition-driven-cli-implementation/TASK-27.md) | 183 | Rules engine: the extra operators | build | TASK-26 |
| [TASK-28](2026-11-15-definition-driven-cli-implementation/TASK-28.md) | 184 | Rules engine: queue and filters | build | TASK-27 |
| [TASK-29](2026-11-15-definition-driven-cli-implementation/TASK-29.md) | 185 | Rules validation: form, paths, literals, errors, roles | build | TASK-27 |
| [TASK-30](2026-11-15-definition-driven-cli-implementation/TASK-30.md) | 186 | Rules validation: contradictions | build | TASK-29 |
| [TASK-31](2026-11-15-definition-driven-cli-implementation/TASK-31.md) | 187 | The example teams give the stated results | build | TASK-28, TASK-30 |
| [INT-05](2026-11-15-definition-driven-cli-implementation/INT-05.md) | 188 | Integration: rules engine and example teams | integration | TASK-26, TASK-27, TASK-28, TASK-29, TASK-30, TASK-31 |
| [TASK-32](2026-11-15-definition-driven-cli-implementation/TASK-32.md) | 189 | A team change: build, redact, evaluate, print | build | INT-04, INT-05 |
| [TASK-33](2026-11-15-definition-driven-cli-implementation/TASK-33.md) | 190 | backlog team new and backlog team update | build | TASK-32 |
| [TASK-34](2026-11-15-definition-driven-cli-implementation/TASK-34.md) | 191 | Team archive, archive done, import and branch import | build | TASK-32 |
| [TASK-35](2026-11-15-definition-driven-cli-implementation/TASK-35.md) | 192 | Team list, show and filters | build | TASK-32 |
| [TASK-36](2026-11-15-definition-driven-cli-implementation/TASK-36.md) | 193 | backlog team pop on the queue | build | TASK-35 |
| [INT-06](2026-11-15-definition-driven-cli-implementation/INT-06.md) | 194 | Integration: team commands on the rules engine | integration | TASK-33, TASK-34, TASK-35, TASK-36 |
| [TASK-37](2026-11-15-definition-driven-cli-implementation/TASK-37.md) | 195 | backlog validate | build | TASK-06, TASK-14, TASK-30 |
| [TASK-38](2026-11-15-definition-driven-cli-implementation/TASK-38.md) | 196 | Validate: a property no definition declares | build | TASK-37 |
| [TASK-39](2026-11-15-definition-driven-cli-implementation/TASK-39.md) | 197 | backlog team validate | build | TASK-37 |
| [TASK-40](2026-11-15-definition-driven-cli-implementation/TASK-40.md) | 198 | backlog setup: configuration and skill | build | INT-02 |
| [TASK-41](2026-11-15-definition-driven-cli-implementation/TASK-41.md) | 199 | backlog setup: examples and the version check | build | TASK-40, TASK-31 |
| [TASK-42](2026-11-15-definition-driven-cli-implementation/TASK-42.md) | 213 | The version check on every command | build | TASK-04, TASK-08 |
| [TASK-43](2026-11-15-definition-driven-cli-implementation/TASK-43.md) | 200 | backlog upgrade: conversion per version | build | TASK-42, TASK-37 |
| [TASK-44](2026-11-15-definition-driven-cli-implementation/TASK-44.md) | 214 | Remove backlog team migrate | build | TASK-43 |
| [TASK-45](2026-11-15-definition-driven-cli-implementation/TASK-45.md) | 201 | Help, the removed commands and --whatif | build | INT-04, INT-06, TASK-44 |
| [TASK-46](2026-11-15-definition-driven-cli-implementation/TASK-46.md) | 202 | Remove the run hook | build | TASK-45 |
| [TASK-47](2026-11-15-definition-driven-cli-implementation/TASK-47.md) | 203 | The coded team workflow leaves the code | build | INT-06 |
| [TASK-48](2026-11-15-definition-driven-cli-implementation/TASK-48.md) | 204 | The shared checks and variables of the coded workflow leave the code | build | TASK-47 |
| [TASK-49](2026-11-15-definition-driven-cli-implementation/TASK-49.md) | 205 | Example teams in the package and the examples guide | build | TASK-31, TASK-39 |
| [TASK-50](2026-11-15-definition-driven-cli-implementation/TASK-50.md) | 206 | README, COMMANDS and the skill | build | TASK-45, TASK-49 |
| [TASK-51](2026-11-15-definition-driven-cli-implementation/TASK-51.md) | 207 | CHANGELOG and AGENTS | build | TASK-50 |
| [TASK-52](2026-11-15-definition-driven-cli-implementation/TASK-52.md) | 208 | Old scenarios and tests to the archive | build | TASK-47, TASK-48, TASK-50 |
| [FAIL-01](2026-11-15-definition-driven-cli-implementation/FAIL-01.md) | 215 | Failure messages of `backlog` and `--help` | build | TASK-45, TASK-08, TASK-12, TASK-42 |
| [FAIL-02](2026-11-15-definition-driven-cli-implementation/FAIL-02.md) | 216 | Failure messages of `backlog setup` | build | TASK-40, TASK-41, TASK-08, TASK-12, TASK-42 |
| [FAIL-03](2026-11-15-definition-driven-cli-implementation/FAIL-03.md) | 217 | Failure messages of `backlog new` | build | TASK-16, TASK-17, TASK-08, TASK-12, TASK-42 |
| [FAIL-04](2026-11-15-definition-driven-cli-implementation/FAIL-04.md) | 218 | Failure messages of `backlog update <item>` | build | TASK-18, TASK-19, TASK-20, TASK-08, TASK-12, TASK-42 |
| [FAIL-05](2026-11-15-definition-driven-cli-implementation/FAIL-05.md) | 219 | Failure messages of `backlog list` | build | TASK-21, TASK-08, TASK-12, TASK-42 |
| [FAIL-06](2026-11-15-definition-driven-cli-implementation/FAIL-06.md) | 220 | Failure messages of `backlog show <item>` | build | TASK-21, TASK-08, TASK-12, TASK-42 |
| [FAIL-07](2026-11-15-definition-driven-cli-implementation/FAIL-07.md) | 221 | Failure messages of `backlog archive <item>` | build | TASK-22, TASK-08, TASK-12, TASK-42 |
| [FAIL-08](2026-11-15-definition-driven-cli-implementation/FAIL-08.md) | 222 | Failure messages of `backlog archive done` | build | TASK-23, TASK-08, TASK-12, TASK-42 |
| [FAIL-09](2026-11-15-definition-driven-cli-implementation/FAIL-09.md) | 223 | Failure messages of `backlog import <branch>` | build | TASK-24, TASK-25, TASK-08, TASK-12, TASK-42 |
| [FAIL-10](2026-11-15-definition-driven-cli-implementation/FAIL-10.md) | 224 | Failure messages of `backlog branch` and `backlog branch import <branch>` | build | TASK-24, TASK-08, TASK-12, TASK-42 |
| [FAIL-11](2026-11-15-definition-driven-cli-implementation/FAIL-11.md) | 225 | Failure messages of `backlog validate` | build | TASK-37, TASK-38, TASK-08, TASK-12, TASK-42 |
| [FAIL-12](2026-11-15-definition-driven-cli-implementation/FAIL-12.md) | 226 | Failure messages of `backlog upgrade` | build | TASK-43, TASK-42, TASK-08, TASK-12, TASK-42 |
| [FAIL-13](2026-11-15-definition-driven-cli-implementation/FAIL-13.md) | 227 | Failure messages of `backlog team new` | build | TASK-33, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-14](2026-11-15-definition-driven-cli-implementation/FAIL-14.md) | 228 | Failure messages of `backlog team list` | build | TASK-35, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-15](2026-11-15-definition-driven-cli-implementation/FAIL-15.md) | 229 | Failure messages of `backlog team show <item>` | build | TASK-35, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-16](2026-11-15-definition-driven-cli-implementation/FAIL-16.md) | 230 | Failure messages of `backlog team update <item>` | build | TASK-33, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-17](2026-11-15-definition-driven-cli-implementation/FAIL-17.md) | 231 | Failure messages of `backlog team archive <item>` and `backlog team archive done` | build | TASK-34, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-18](2026-11-15-definition-driven-cli-implementation/FAIL-18.md) | 232 | Failure messages of `backlog team import <branch>` | build | TASK-34, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-19](2026-11-15-definition-driven-cli-implementation/FAIL-19.md) | 233 | Failure messages of `backlog team branch` and `backlog team branch import <branch>` | build | TASK-34, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-20](2026-11-15-definition-driven-cli-implementation/FAIL-20.md) | 234 | Failure messages of `backlog team pop` | build | TASK-36, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-21](2026-11-15-definition-driven-cli-implementation/FAIL-21.md) | 235 | Failure messages of `backlog team query` | build | TASK-35, TASK-08, TASK-12, TASK-42, TASK-32 |
| [FAIL-22](2026-11-15-definition-driven-cli-implementation/FAIL-22.md) | 236 | Failure messages of `backlog team validate` | build | TASK-39, TASK-08, TASK-12, TASK-42, TASK-32 |
| [PERM-01](2026-11-15-definition-driven-cli-implementation/PERM-01.md) | 237 | Permutation tests of `backlog` and `--help` | integration | FAIL-01, TASK-45, INT-04 |
| [PERM-02](2026-11-15-definition-driven-cli-implementation/PERM-02.md) | 238 | Permutation tests of `backlog setup` | integration | FAIL-02, TASK-45, INT-04 |
| [PERM-03](2026-11-15-definition-driven-cli-implementation/PERM-03.md) | 239 | Permutation tests of `backlog new` | integration | FAIL-03, TASK-45, INT-04 |
| [PERM-04](2026-11-15-definition-driven-cli-implementation/PERM-04.md) | 240 | Permutation tests of `backlog update <item>` | integration | FAIL-04, TASK-45, INT-04 |
| [PERM-05](2026-11-15-definition-driven-cli-implementation/PERM-05.md) | 241 | Permutation tests of `backlog list` | integration | FAIL-05, TASK-45, INT-04 |
| [PERM-06](2026-11-15-definition-driven-cli-implementation/PERM-06.md) | 242 | Permutation tests of `backlog show <item>` | integration | FAIL-06, TASK-45, INT-04 |
| [PERM-07](2026-11-15-definition-driven-cli-implementation/PERM-07.md) | 243 | Permutation tests of `backlog archive <item>` | integration | FAIL-07, TASK-45, INT-04 |
| [PERM-08](2026-11-15-definition-driven-cli-implementation/PERM-08.md) | 244 | Permutation tests of `backlog archive done` | integration | FAIL-08, TASK-45, INT-04 |
| [PERM-09](2026-11-15-definition-driven-cli-implementation/PERM-09.md) | 245 | Permutation tests of `backlog import <branch>` | integration | FAIL-09, TASK-45, INT-04 |
| [PERM-10](2026-11-15-definition-driven-cli-implementation/PERM-10.md) | 246 | Permutation tests of `backlog branch` and `backlog branch import <branch>` | integration | FAIL-10, TASK-45, INT-04 |
| [PERM-11](2026-11-15-definition-driven-cli-implementation/PERM-11.md) | 247 | Permutation tests of `backlog validate` | integration | FAIL-11, TASK-45, INT-04 |
| [PERM-12](2026-11-15-definition-driven-cli-implementation/PERM-12.md) | 248 | Permutation tests of `backlog upgrade` | integration | FAIL-12, TASK-45, INT-04 |
| [PERM-13](2026-11-15-definition-driven-cli-implementation/PERM-13.md) | 249 | Permutation tests of `backlog team new` | integration | FAIL-13, TASK-45, INT-06 |
| [PERM-14](2026-11-15-definition-driven-cli-implementation/PERM-14.md) | 250 | Permutation tests of `backlog team list` | integration | FAIL-14, TASK-45, INT-06 |
| [PERM-15](2026-11-15-definition-driven-cli-implementation/PERM-15.md) | 251 | Permutation tests of `backlog team show <item>` | integration | FAIL-15, TASK-45, INT-06 |
| [PERM-16](2026-11-15-definition-driven-cli-implementation/PERM-16.md) | 252 | Permutation tests of `backlog team update <item>` | integration | FAIL-16, TASK-45, INT-06 |
| [PERM-17](2026-11-15-definition-driven-cli-implementation/PERM-17.md) | 253 | Permutation tests of `backlog team archive <item>` and `backlog team archive done` | integration | FAIL-17, TASK-45, INT-06 |
| [PERM-18](2026-11-15-definition-driven-cli-implementation/PERM-18.md) | 254 | Permutation tests of `backlog team import <branch>` | integration | FAIL-18, TASK-45, INT-06 |
| [PERM-19](2026-11-15-definition-driven-cli-implementation/PERM-19.md) | 255 | Permutation tests of `backlog team branch` and `backlog team branch import <branch>` | integration | FAIL-19, TASK-45, INT-06 |
| [PERM-20](2026-11-15-definition-driven-cli-implementation/PERM-20.md) | 256 | Permutation tests of `backlog team pop` | integration | FAIL-20, TASK-45, INT-06 |
| [PERM-21](2026-11-15-definition-driven-cli-implementation/PERM-21.md) | 257 | Permutation tests of `backlog team query` | integration | FAIL-21, TASK-45, INT-06 |
| [PERM-22](2026-11-15-definition-driven-cli-implementation/PERM-22.md) | 258 | Permutation tests of `backlog team validate` | integration | FAIL-22, TASK-45, INT-06 |
| [INT-08](2026-11-15-definition-driven-cli-implementation/INT-08.md) | 259 | Integration: every failure of every command | integration | FAIL-01, FAIL-02, FAIL-03, FAIL-04, FAIL-05, FAIL-06, FAIL-07, FAIL-08, FAIL-09, FAIL-10, FAIL-11, FAIL-12, FAIL-13, FAIL-14, FAIL-15, FAIL-16, FAIL-17, FAIL-18, FAIL-19, FAIL-20, FAIL-21, FAIL-22 |
| [INT-07](2026-11-15-definition-driven-cli-implementation/INT-07.md) | 209 | Integration: the whole branch | integration | TASK-52, TASK-51, TASK-46, TASK-44, TASK-38, TASK-25, TASK-42, INT-08, PERM-01, PERM-02, PERM-03, PERM-04, PERM-05, PERM-06, PERM-07, PERM-08, PERM-09, PERM-10, PERM-11, PERM-12, PERM-13, PERM-14, PERM-15, PERM-16, PERM-17, PERM-18, PERM-19, PERM-20, PERM-21, PERM-22 |
