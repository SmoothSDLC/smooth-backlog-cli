# Smooth Backlog CLI

**Git-native backlog management for engineering teams and coding agents.** Keep requirements, acceptance criteria, work items, priorities, and delivery evidence close to the code they describe—without introducing a separate project-management service.

[Releases](https://github.com/SmoothSDLC/smooth-backlog-cli/releases) · [Command reference](COMMANDS.md) · [Changelog](CHANGELOG.md) · [License](LICENSE)

> **Release status:** The core CLI has a published [v1.0.1 release](https://github.com/SmoothSDLC/smooth-backlog-cli/releases/tag/v1.0.1). Advanced shared-repository, multi-agent coordination, and review-gate work is in [PR #3](https://github.com/SmoothSDLC/smooth-backlog-cli/pull/3) and is **not part of v1.0.1**.

## Why it exists

Software work is easier to review when the requirement, the implementation branch, and the evidence of completion can be inspected together. A backlog that lives with the repository is available to a developer at the terminal and to a coding agent using the same workflow.

Smooth Backlog CLI provides **structured, version-controllable work records** instead of relying on a chat transcript or an agent's unsupported claim that a task is finished. It manages work; it does **not** independently certify the quality of an implementation.

## What the released CLI does

| Capability | What it gives you |
| --- | --- |
| **Branch-aware work** | Each Git branch has an independent backlog; inspect, move, or import items across branches. |
| **Durable identity** | A permanent GUID identifies an item even when its active priority changes. |
| **Defined outcomes** | Track descriptions, acceptance criteria, tasks, outcomes, evidence, and references. |
| **Priorities and lifecycle** | Manage `new`, `open`, `done`, and `archived` items from the terminal. |
| **Automation-friendly output** | Machine-readable JSON and a non-interactive CLI for scripts and agents. |
| **Agent integrations** | Backlog skills can be installed for supported coding-agent directory conventions. |
| **Git-native storage** | Work stays in version-controlled files under `.backlog/`; you choose when to commit it. |

The core CLI is designed for **Node.js 24+**, npm, and Git. The released local-backlog mode supports Linux, macOS, and Windows.

## Install

The package is `@smoothsdlc/smooth-backlog-cli`; the command is `backlog`. GitHub Packages requires authentication, including for public packages.

```sh
npm config set @smoothsdlc:registry https://npm.pkg.github.com
npm login --scope=@smoothsdlc --auth-type=legacy --registry=https://npm.pkg.github.com
npm install --global @smoothsdlc/smooth-backlog-cli --registry=https://npm.pkg.github.com
backlog --version
```

When npm requests a password during login, use a GitHub personal access token (classic) with `read:packages`. For a fixed version, use `@smoothsdlc/smooth-backlog-cli@1.0.1` in the install command.

## Get started

In a Git working tree:

```sh
backlog init
backlog new "Fix login" --description "Expired cookies prevent sign-in" --ac "An expired cookie permits a fresh sign-in"
backlog 0 add tasks "Reproduce,Failing test captures the regression"
backlog list
backlog 0 done
backlog list done --json
```

Run `backlog` with no arguments to see the next active item, or `backlog new --ask` for interactive creation. Active priorities start at **0** and can change as the list is reordered; use item GUIDs for durable references.

## Working with Git and coding agents

- **Branch isolation:** `backlog list --branch feature` inspects another branch's work; `backlog move` and `backlog import` move or bring work across branch backlogs.
- **Human- and agent-readable records:** Acceptance criteria and supporting evidence remain attached to the item rather than buried in a separate conversation.
- **Agent-ready setup:** `backlog init` installs skills into detected `.agents`, `.claude`, `.github`, and `.qwen` folders, as well as `.backlog/skills`.
- **Your Git workflow stays yours:** The released local mode does not automatically commit, push, merge, or switch branches. Commit backlog data and skill files when you want to share them.

**Data safety:** `backlog init backup` retains a backup before refreshing generated skills. **`backlog init clean` destroys the entire backlog, including all branches and any backups inside it.** Do not use `clean` as a routine upgrade command.

## Command reference

```text
backlog                         Show the next active item
backlog list                    List active items on this branch
backlog new ...                 Create an item with acceptance criteria
backlog set ...                 Update item fields
backlog <item> done             Complete an item
backlog move ...                Move an item between branches
backlog list done --json        Read completed items as JSON
backlog --help                  Show complete CLI usage
```

See [COMMANDS.md](COMMANDS.md) for the exact syntax, field formats, exit codes, storage behavior, and recovery procedures. The CLI's built-in `--help` is the authoritative reference for the installed version.

## Development and verification

Source changes are evaluated using Node's built-in test runner and syntax checks:

```sh
npm ci
npm test
npm run check
npm pack --dry-run
```

The [releases page](https://github.com/SmoothSDLC/smooth-backlog-cli/releases) distinguishes published versions from work in progress. **Do not treat unmerged PR behavior as a released capability.**

## License

[Apache License 2.0](LICENSE), © [SmoothSDLC Systems Inc.](https://SmoothSDLC.com)
