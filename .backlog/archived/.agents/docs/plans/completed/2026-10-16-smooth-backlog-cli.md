# Backlog CLI Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, checking each result before continuing. Execution is authorized by the user's request to implement the full CLI and their completed product decisions.

**Goal:** Ship the complete local branch-aware backlog CLI, four agent integrations, and npm release/update support.
**Architecture:** A dependency-free Node ESM package separates parsing/output, context, transactional storage, item operations, generated integrations, and user-level updates. CLI commands validate before locking and atomically journal repository mutations.
**Tech Stack:** Node 24+, Git, npm, node:test, Python 3 for bundled skill helpers.
**Spec:** .agents/docs/specs/2026-10-16-smooth-backlog-cli-design.md

## Global Constraints

- Apache-2.0; SmoothSDLC Systems Inc; https://SmoothSDLC.com.
- Package @smoothsdlc/smooth-backlog-cli; executable backlog; GitHub Packages.
- Node 24+ on Linux, macOS, Windows; no Git mutations.
- State new/open/done/archived. Active priority 0-based; list-entry indexes 1-based.
- Numeric selectors address current active priority; GUIDs are permanent.
- Force is supported only for explicit whole-list set replacement.
- User-scoped updates; weekly notice default; auto daily; failure retry hourly.

## Review Focus

- Stale numeric selectors must resolve current priority, never an old integer identity.
- Interrupted archive writes must recover exactly once under concurrent processes.
- Symlinked generated paths must not write or delete outside repository storage.
- Failed updater installation must leave a working old package and stable bin entry.
- JSON commands must retain exactly one stdout envelope despite automatic update notices.

### Task 1: Storage, context, schema, and initialization

**Files:** package.json, bin/backlog.js, src/{errors,context,storage,schema,integrations}.js, templates/, .agents/test/{helpers,cli}.test.js.
**Interfaces:** context(cwd, flags) returns root/branch/name; withStore(context, callback) validates, serializes, journals and commits store; initialize(context, mode) creates/reset/backs up managed storage.
- [x] Write real temporary-Git tests for help, outside-Git errors, branch fallback, init, data preservation, clean/backup, locking, corrupt/symlink rejection.
- [x] Run `node --test .agents/test/cli.test.js`; expect missing behavior failures.
- [x] Implement minimal package, context, initialization and validated transaction boundary.
- [x] Run `npm test`; expect those behaviors pass, preserving pending tasks' failing tests separately.

### Task 2: Complete commands, lifecycle and interactive input

**Files:** src/{args,commands,output,prompt}.js, .agents/test/cli.test.js, .agents/test/interactive.test.js.
**Interfaces:** parse(argv) returns command/args/flags; execute(parsed, context, store) returns JSON-compatible result; run(argv) handles one stdout result and exit status.
- [x] Write tests for both command orders, priority/GUID selectors, append/replace/remove, one-based list ordering, completion/archive timestamps, branch scope, move/import, invalid flags and missing required input.
- [x] Run focused tests and confirm expected missing-behavior failures.
- [x] Implement command operations and TTY-only prompting; preserve no-op timestamps and reject force outside list set.
- [x] Run `npm test`; expect full item lifecycle and real concurrent subprocess scenarios pass.

### Task 3: User update scheduling and safe package replacement

**Files:** src/{updates,process}.js, .agents/test/updates.test.js.
**Interfaces:** scheduledCheck(options) never blocks backlog work on failure; updateCommand(mode) performs explicit action; update package operations accept a process runner for controlled registry fixtures.
- [x] Test weekly/daily/hourly scheduling, disabled checks, major notices, user config writes only on checks, global permission refusal, and rollback of package replacement.
- [x] Run `node --test .agents/test/updates.test.js`; expect missing-feature failures.
- [x] Implement user-scoped config locking and registry guidance, stable-version selection, staged dependency-free package replacement with rollback, install-scope detection only where needed, and integration refresh.
- [x] Run `npm test`; expect deterministic update and CLI tests pass without live registry access.

### Task 4: Agent skills, distribution, documentation and review

**Files:** templates/skills/backlog/**, src/integrations.js, README.md, COMMANDS.md, .github/workflows/{ci,publish}.yml, package-lock.json.
**Interfaces:** adapters expose detection/destination metadata; templates are installed unchanged into detected project-local vendor folders.
- [x] Test installed adapters' helper behavior and npm package installation in temporary Git repositories.
- [x] Add base skill plus real read-only JSON snapshot helper, self-validator, trigger examples and output evals. Verify vendor conventions against official docs.
- [x] Run project skill linter/auditor/self-validator and package install smoke test; expect zero failures.
- [x] Run full tests, npm pack dry run and diff whitespace check. Review complete change against all requirements; fix significant findings with regression tests.
- [x] Record results and limitations; leave implementation reviewable in this workspace. Do not publish or push without instruction.
