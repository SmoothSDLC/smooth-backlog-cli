# Smooth Backlog CLI

**Git-native backlog management for engineering teams and coding agents.** Keep requirements, acceptance criteria, work items, priorities, and delivery evidence close to the code they describe—without introducing a separate project-management service.

[Releases](https://github.com/SmoothSDLC/smooth-backlog-cli/releases) · [Command reference](COMMANDS.md) · [Changelog](CHANGELOG.md) · [License](LICENSE)

> **Release status:** The core CLI has a published [v1.0.1 release](https://github.com/SmoothSDLC/smooth-backlog-cli/releases/tag/v1.0.1). This development branch expands the same product with shared-repository, multi-agent coordination, and quality-gate workflows in [PR #3](https://github.com/SmoothSDLC/smooth-backlog-cli/pull/3). **Those additions are implemented on the branch but are not yet released or accepted for production use.**

## Why it exists

Software work is easier to review when the requirement, the implementation branch, and the evidence of completion can be inspected together. A backlog that lives with the repository is available to a developer at the terminal and to a coding agent using the same workflow.

Smooth Backlog CLI provides **structured, version-controllable work records** instead of relying on a chat transcript or an agent's unsupported claim that a task is finished. It manages work; it does **not** independently certify the quality of an implementation.

PR #3 extends that foundation with safeguards for autonomous engineering: independent review decisions, commit-pinned evidence, agent-session separation, and dependency handoffs. These controls enforce a process; they do not replace technical judgment or testing.

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

The core CLI is designed for **Node.js 24+**, npm, and Git. The released local-backlog mode supports Linux, macOS, and Windows. **PR #3's shared mode currently targets Linux; macOS and Windows are not in its current validation matrix.**

### Additional capabilities under development in PR #3

| Capability | What it adds |
| --- | --- |
| **Shared backlog repository** | Multiple code repositories can use one separate Git backlog repository, while preserving local mode. |
| **Controlled Git publication** | Shared writes commit and push before reporting success; failed publication rolls back the pending change. |
| **Concurrency safeguards** | Locks, per-agent change tracking, and stale-write refusals protect against overwriting unseen work. |
| **Atomic agent work** | Individual backlog items are refined, claimed, implemented, reviewed, and closed by identifiable sessions. |
| **Independent review gates** | Two review stages are linked to the item's work commit; new work invalidates earlier approvals. |
| **Dependency handoffs** | A producer's work cannot close with unresolved downstream handoff requirements. |
| **Execution visibility** | Changed-since-last-use queries and an optional run recorder support coordination and auditability. |

These features are documented and implemented on `team-cli-parity-1`, **not present in v1.0.1**. They remain subject to PR #3's final verification and owner review.

## Install

The package is `@smoothsdlc/smooth-backlog-cli`; the command is `backlog`. GitHub Packages requires authentication, including for public packages.

```sh
npm config set @smoothsdlc:registry https://npm.pkg.github.com
npm login --scope=@smoothsdlc --auth-type=legacy --registry=https://npm.pkg.github.com
npm install --global @smoothsdlc/smooth-backlog-cli --registry=https://npm.pkg.github.com
backlog --version
```

When npm requests a password during login, use a GitHub personal access token (classic) with `read:packages`. For a fixed version, use `@smoothsdlc/smooth-backlog-cli@1.0.1` in the install command.

### Pin a release or roll back

For repeatable agent-host and CI installations, pin the package version. Rollback uses the same command with an earlier published release:

```sh
npm install --global @smoothsdlc/smooth-backlog-cli@<version> --registry=https://npm.pkg.github.com
backlog --version
```

The development branch is **not** the version installed by this command; shared mode does not self-update.

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

## PR #3: Shared repositories and quality gates

These sections describe the **unreleased development branch**. They extend the released CLI's work records and agent integrations rather than replacing the local-mode workflow above.

### Shared Git backlog across projects

A consuming repository can opt into a separate shared backlog repository, which stores each project's items in its own folder. The original branch-local `.backlog/` mode remains available.

- `backlog --use-backlog-repo <path>` selects shared mode; `backlog --use-local-repo` returns to local mode.
- `backlog setup` configures the consuming repository and agent skills.
- The remote origin comes from `BACKLOG_ORIGIN_URL` or `backlog_origin_url` in `.smooth-backlog.json`, **never an embedded organization-specific default**.
- Shared writes use Git synchronization with a per-repository run lock, front-matter work records, and a SQLite index. A successful mutation must be committed and pushed; failed publication does not silently count as success.
- The CLI refuses writes when another session changed an item since the caller last read it (`STALE_ITEM`, exit 5).

The branch's shipped install helper, `install-backlog-cli.sh`, can set up a consuming repository against a compatible **future** release. Running the currently published v1.0.1 package does not expose the PR3 shared-mode functionality.

### Independent, evidence-backed work lifecycle

PR #3 treats **one backlog item** as the unit of assignment, execution, review, and closure. Its controls are designed for autonomous and collaborative execution:

1. **Refine:** Clarify and split the source work into independently executable, dependency-linked items; required refinement reviews must pass before claims.
2. **Claim:** A distinct execution session claims an eligible item. Session authors are recorded to prevent the same session from approving its own work.
3. **Implement:** Associate commits and acceptance evidence with the specific item instead of relying on an agent's end-of-session summary.
4. **Review:** Require an agent review followed by an independent external review against the item's pinned `work_commit`.
5. **Revalidate:** When new implementation work changes that item's commit, prior passes become stale and both review stages must run again.
6. **Handoff:** Record and obtain lead acceptance of required dependent-item handoffs before the producer item closes.
7. **Close:** `--close` and `--status done` enforce these gates. The owner may explicitly override with a **recorded decision and reason**.

Review identity rules distinguish an execution *session* from a reusable agent or hardware identity: a fresh session can continue work without being treated as the original author of an item. Gate failures report the missing action and refuse premature completion. See [the complete command reference](COMMANDS.md) for the exact role eligibility, refinement stages, and exception handling.

**A recorded approval is not proof of code quality by itself.** Acceptance still requires meaningful technical tests and review evidence.

### Coordinating concurrent agents

- **Per-agent change tracking:** `backlog query --changed --agent <name>` compares to that agent's own last-use commit reference and distinguishes items held by that agent from others' changes.
- **Git-backed consistency:** A write cannot succeed solely in local memory if required publication fails.
- **Commit-pinned reviews:** Unrelated branch commits do not invalidate an item's approval, but new work for that item does.
- **Dependency visibility:** Producer and consumer handoffs are tracked with explicit lead receipt.
- **Optional run reporting:** An external recorder hook can consume execution events.

See [COMMANDS.md](COMMANDS.md#shared-backlog-repository-mode) for full contracts, states, JSON formats and error codes. GitHub's [open PR #3](https://github.com/SmoothSDLC/smooth-backlog-cli/pull/3) is the source of truth for the pending release and its review status.


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

PR #3 also includes shared-mode parity tests that can compare its Node implementation with the existing Python backlog implementation:

```sh
SMOOTH_BACKLOG_SCRIPTS=<backlog-repo>/skill/backlog/scripts npm test
```

This requires a valid reference-script path, Python 3 and PyYAML. Without that path, oracle tests can skip, so a passing local suite does not by itself prove full parity. PR #3 currently runs GitHub Actions on Linux with Node 24 and 26; its CI workflow is manually triggered. Compare the tested commit SHA with the branch HEAD before claiming that the latest revision passed.

The [releases page](https://github.com/SmoothSDLC/smooth-backlog-cli/releases) distinguishes published versions from work in progress. **Do not treat unmerged PR behavior as a released capability.**

## License

[Apache License 2.0](LICENSE), © [SmoothSDLC Systems Inc.](https://SmoothSDLC.com)
