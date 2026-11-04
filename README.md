# Smooth Backlog CLI

**Git-native work management for engineering teams and coding agents.** Define what must be delivered, coordinate parallel work, keep acceptance criteria and evidence with the source, and make completion an auditable engineering decision.

[Latest published release](https://github.com/SmoothSDLC/smooth-backlog-cli/releases) · [Command reference](COMMANDS.md) · [Changelog](CHANGELOG.md) · [License](LICENSE)

> **Development branch — not yet released.** This README describes the functionality being developed and reviewed in [PR #3](https://github.com/SmoothSDLC/smooth-backlog-cli/pull/3) (\`team-cli-parity-1\`). The published [v1.0.1 release](https://github.com/SmoothSDLC/smooth-backlog-cli/releases/tag/v1.0.1) includes the core local, branch-aware backlog CLI, **not** the shared-repository coordination and review gates described below. Unmerged behavior should not be treated as release-ready.

## Why this exists

A conventional task list can tell you that work is marked “done.” It does not necessarily establish *which implementation was reviewed, who independently checked it, what evidence was supplied, or whether downstream work received a valid handoff*.

Smooth Backlog CLI makes these questions part of the engineering workflow. Its records remain in Git, available to humans, scripts, and coding agents. The developing shared-repository mode adds explicit ownership, concurrency controls, dependency handoffs, and review gates intended to make autonomous execution accountable.

This is **a workflow and evidence-control tool**, not an automatic guarantee that code is correct. A reviewer must still perform substantive verification.

## Capabilities and release status

| Capability | Published v1.0.1 | PR #3 development branch |
| --- | --- | --- |
| Branch-aware tasks, priorities, GUIDs, acceptance criteria, evidence, JSON | Yes | Yes |
| Coding-agent skill integration | Yes | Yes |
| Local \`.backlog/\` storage | Yes | Yes |
| Shared Git repository for multiple project backlogs | No | Implemented; under review |
| Git synchronization, stale-write detection and conflict safeguards | No | Implemented; under review |
| Agent sessions, team coordination, refinement and claim rules | No | Implemented; under review |
| Independent, commit-pinned review gates before closing items | No | Implemented; under review |
| Dependency-specific handoffs and lead acceptance | No | Implemented; under review |
| Per-agent changes since last use and traceable run reporting | No | Implemented; under review |

**Status matters:** PR #3 is open. Its substantial implementation and test suite do not make its features part of a published release. See the [pull request](https://github.com/SmoothSDLC/smooth-backlog-cli/pull/3) for development scope and validation history.

## Quick start: released local mode

Requires Node.js **24+**, npm and Git. The released local mode supports Linux, macOS and Windows; the developing shared mode currently targets **Linux**. Windows shared-mode support is not yet implemented or tested, and the current PR CI matrix is limited to Linux.

### Install the published package

GitHub Packages requires authentication even for a public package:

\`\`\`sh
npm config set @smoothsdlc:registry https://npm.pkg.github.com
npm login --scope=@smoothsdlc --auth-type=legacy --registry=https://npm.pkg.github.com
npm install --global @smoothsdlc/smooth-backlog-cli@1.0.1 --registry=https://npm.pkg.github.com
backlog --version
\`\`\`

When npm requests a password, use a classic GitHub personal access token with \`read:packages\`. The package is \`@smoothsdlc/smooth-backlog-cli\` and its executable is \`backlog\`.

### Create and manage work

From a Git working tree:

\`\`\`sh
backlog init
backlog new "Fix login" --description "Expired cookies prevent sign-in" --ac "An expired cookie permits a fresh sign-in"
backlog 0 add tasks "Reproduce,Failing test captures the regression"
backlog list
backlog 0 done
backlog list done --json
\`\`\`

Run \`backlog\` to see the next active item, \`backlog new --ask\` for interactive creation, and \`backlog --help\` for installed-version help.

In local mode, work lives under \`.backlog/\`. The CLI does **not** automatically commit, push, merge, or switch your Git branches. Commit backlog records alongside code when you want to share them.

### Release pinning and rollback

Pin an exact version on agent hosts and CI runners; install a prior published version to roll back:

\`\`\`sh
npm install --global @smoothsdlc/smooth-backlog-cli@<version> --registry=https://npm.pkg.github.com
backlog --version
\`\`\`

Use a real published version in place of \`<version>\`. In the developing shared mode, the CLI does not self-update.

## Architecture: shared-repository mode (PR #3)

PR #3 adds an optional way for multiple project repositories to keep their backlogs in **one separate Git repository**, with a folder per project. The original local mode remains available.

- \`backlog --use-backlog-repo <path>\` opts into the shared backlog; \`backlog --use-local-repo\` switches back.
- \`backlog setup\` configures a consuming repository and its agent skill integration.
- The shared repository's clone URL is **explicit configuration**: \`BACKLOG_ORIGIN_URL\` or the \`backlog_origin_url\` field in \`.smooth-backlog.json\`. There is no baked-in organization or server address.
- Shared writes synchronize through Git. Successful mutations are committed and pushed; publication failure restores the original working state rather than pretending the change was shared.
- The shared store uses front-matter work records, a SQLite mirror, concurrency locks, and stale-write protection. An agent is refused when it tries to update a record that someone else changed after its last read.

**Do not install the currently published package expecting these commands or gates to be available.** Their contract, edge cases, and error codes are documented in the developing [command reference](COMMANDS.md#shared-backlog-repository-mode).

## Quality-first work lifecycle (PR #3)

The advanced workflow treats an individually claimable backlog item—not an entire chat session or an internal task bullet—as the unit of assignment, implementation, review and completion.

1. **Refine the request.** An agent or lead resolves requirements and splits dependent work into independently executable items. Team items must meet their refinement-review gate before becoming claimable.
2. **Claim with a session identity.** An executor claims a single eligible item. Session authorship is recorded so the execution session cannot approve its own work.
3. **Implement and record evidence.** Changes, acceptance evidence and dependent-item handoffs remain attributable to the work item.
4. **Review the implementation.** The first review is a distinct agent review; the second is an independent external review. Both are tied to the relevant work commit rather than whichever unrelated commit happens to be the branch HEAD.
5. **Re-review if the work changes.** A change to that item's implementation invalidates its previous passes. The close command refuses missing or stale approvals.
6. **Accept dependencies before closure.** If another item depends on this one, the dependent handoff must be recorded and accepted by the lead before the producer can close.
7. **Close only with evidence.** Both \`--close\` and \`--status done\` observe the gates. An owner may record an explicit override with a written reason; it is not a silent bypass.

The workflow also protects against an agent reviewing the work from its *own* session while allowing a fresh, distinct session to continue a claim. Failed checks generate actionable refusals instead of reporting success. The full reviewer identity, state transition, handoff and exception contracts are in [COMMANDS.md](COMMANDS.md).

These are **PR3 implementation semantics, not claims of proven end-to-end production reliability**.

## Concurrent work and traceability (PR #3)

- **Independent branches and durable identity:** each item has a GUID and priority; branch scope is explicit.
- **Changed-since-last-use:** \`backlog query --changed --agent <name>\` compares against that agent's own last-use reference—not an arbitrary global timestamp—so other agents' changes are visible on return.
- **Stale-write protection:** conflicting edits refuse with a specific error rather than overwriting unseen changes.
- **Commit-pinned review:** unrelated commits do not invalidate approved work, but new work for that item does.
- **Handoff tracking:** producer/consumer dependencies require recorded handoffs and lead acceptance at closure.
- **Run reporting:** an optional recorder hook supports workflow telemetry.

Command syntax, schema details, structured JSON responses and failure modes belong in the [complete reference](COMMANDS.md). That document and the built-in CLI help describe the fine-grained contracts; this README explains the system.

## Coding-agent integration

Initialization installs backlog skills for detected agent directory conventions: \`.agents\`, \`.claude\`, \`.github\`, \`.qwen\`, and \`.backlog/skills\`. The same structured records can be read by people, automation and coding agents.

For the developing shared mode, the provided \`install-backlog-cli.sh\` helper can install the published CLI and run \`backlog setup\` for a configured shared repository. This setup path requires a **future compatible published release** before PR3's shared-mode commands can be used.

Keep customized skill changes in Git: initialization and package updates may replace generated skill copies.

## Safety and operational boundaries

- **Local mode:** Git data is version-controlled, but the CLI does not commit for you.
- **Shared mode:** successful changes require a committed and pushed Git state; conflicts and stale edits are refused.
- **Backups:** \`backlog init backup\` preserves existing backlog data before refreshing skills.
- **Destructive reset:** **\`backlog init clean\` deletes all backlog branches and any backups stored inside the backlog.** It is not a routine upgrade operation.
- **Compatibility:** the shared mode is currently tested on Linux only. Do not imply macOS or Windows shared-mode support from the released local CLI.
- **Scope:** a passing review workflow is evidence of a recorded decision, not by itself proof that a software product is correct or secure.

## Development and validation

The project is written in JavaScript for Node.js **24+** and uses Node's built-in test runner. To check out and exercise this *development branch*:

\`\`\`sh
npm ci
npm test
npm run check
npm pack --dry-run
\`\`\`

The shared-mode oracle tests can compare Node behavior with the existing Python backlog implementation when its script path is provided:

\`\`\`sh
SMOOTH_BACKLOG_SCRIPTS=<backlog-repo>/skill/backlog/scripts npm test
\`\`\`

That second command requires Python 3 and PyYAML, with a valid path to the reference scripts. Without the reference scripts, oracle tests can skip; a local pass is not evidence of full parity coverage.

PR #3's GitHub Actions workflow is manually triggered and currently runs Linux with Node 24 and 26. Inspect [workflow runs](https://github.com/SmoothSDLC/smooth-backlog-cli/actions) and verify the tested commit SHA before making claims about the latest branch HEAD.

## Documentation and releases

- [COMMANDS.md](COMMANDS.md) — complete command syntax, modes, error handling and schema details.
- [CHANGELOG.md](CHANGELOG.md) — changes and the unreleased feature record.
- [PR #3](https://github.com/SmoothSDLC/smooth-backlog-cli/pull/3) — outstanding development and review.
- [Published releases](https://github.com/SmoothSDLC/smooth-backlog-cli/releases) — capabilities available for installation.

## License

[Apache License 2.0](LICENSE), © [SmoothSDLC Systems Inc.](https://SmoothSDLC.com).
