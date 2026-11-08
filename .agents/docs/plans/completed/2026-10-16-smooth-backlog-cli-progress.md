# Execution ledger — 2026-10-16-smooth-backlog-cli

Spec: [../../specs/2026-10-16-smooth-backlog-cli-design.md](../../specs/2026-10-16-smooth-backlog-cli-design.md)
Plan: [2026-10-16-smooth-backlog-cli.md](2026-10-16-smooth-backlog-cli.md)

- Tasks 1–2: core tests RED→GREEN; 19/19 pass (npm test before updater tests).
- Task 3: updater tests RED→GREEN; 28/28 total pass.
- Task 4: agent-helper tests added and failed as expected before helper creation.
- Context: supplied cloud checkout, implementation branch; implementation stays in supplied workspace. No main-branch modification or extra worktree is necessary.
- Ruling: newest event first for done/archive, with event timestamps and GUID tie-breaker — matches newest-first history views; users can inspect timestamps for order.
- Ruling: init clean does not require a named branch — reset applies to the entire backlog, as explicitly clarified by the user.
- Ruling: user-prefix/global npm installs can use staged package replacement; repository dependency installs receive npm instructions to preserve their package/lockfile ownership.
- No unresolved product questions remain. Force is ONLY a list-set replacement option.

- Task 4: npm artifact installed offline and successfully initialized a temporary repository. Real terminal creation and cancellation passed on Linux.
- Skill linter: zero errors; exhaustive auditor: 94 rules, 81 PASS, 13 explained NA, zero FAIL/REVIEW/unaccounted.
- Ruling: a confirmed abandoned process lock requires explicit removal after verification, then journal replay recovers automatically. Never auto-unlink a lock from a stale PID observation; that can delete a new owner's lock. Cost: one manual recovery step after process termination.
- Lock-race regression failed before fix and passed after fix.

## Independent review and fixes

The required independent reviewer found four Important updater issues and no minors:
1. Interrupted directory replacement could make the npm executable target absent.
2. A stale updater could downgrade a concurrently upgraded installation.
3. Custom npm --prefix installs were incorrectly rejected.
4. Node and storage/bootstrap compatibility were not enforced before activation.

All four were fixed in one review pass with regression tests. A stable bootstrap
now atomically selects a complete immutable runtime. SIGKILL at the activation
boundary leaves the executable callable. Active metadata is re-read under the
package lock before deciding to install. Custom-prefix bins/shims identify their
actual installation. Staging enforces npm engines and validates Node floors plus
schema/protocol release markers before activation. Full-package upgrade tests
exercise the real new CLI and refresh its integrations while retaining item GUIDs.

An additional regression fixes detached import: --branch chooses the source while
BACKLOG_CLI_BRANCH provides a destination when Git has no named branch.

- Real nonwritable-directory test confirms refusal without privilege elevation.
- Automatic-check failure test confirms stderr notices, one JSON stdout object,
  and unchanged history during the retry cooldown.
- Concurrency verification: 10 successful rounds, 120 parallel writes.
- No deferred minor findings. No remaining product decisions.
- Verification limits: native macOS/Windows CI and authenticated publication were
  not run in this Linux workspace; workflow definitions cover the platform matrix.
- Execution stays in the user's supplied branch/workspace, without merge, push or publication.

## Final verification

- `npm test`: 48 passed, 0 failed, 0 skipped on Linux, including real package upgrade,
  interrupted activation, real TTY creation/cancellation, nonwritable install refusal,
  offline package install, GUID lifecycle and concurrent journal/lock behavior.
- `npm run check`: passed.
- `npm pack --dry-run --json`: @smoothsdlc/smooth-backlog-cli 1.0.0, 24 files,
  112746 unpacked bytes, no product dependencies.
- Generated skill linter: zero errors. Auditor: 94/94 accounted, zero failures,
  reviews or unaccounted rules. Reference validator and self-validator passed.
- `git diff --check`: passed.
- All implementation plan tasks complete. Work remains in branch work in the
  supplied checkout, without commits, pushes, merges or publication.

## Delivery follow-through (2026-10-17)

The previous completion claim covered local implementation only; delivery was
unfinished. The user requires commit/push, a working publishing workflow, and
verification of the actual registry package. A release-verification script now
installs from GitHub Packages with a fresh cache and expected tarball integrity,
then exercises only the installed CLI in an isolated Git repository. The same
consumer checks run against local tarballs in the unit suite. The publishing
workflow requires reusable multi-platform CI, publishes the packed artifact,
and then verifies the registry artifact on Linux/macOS/Windows and Node 24/26.
GitHub repository access has been confirmed; delivery is in progress.

Remote CI found a macOS /var versus /private/var alias mismatch in custom-prefix
recognition. A physical-parent-alias regression reproduced the failure on Linux;
comparing physical paths on both sides fixed it. Published-package verification
also checks actual feed lookups and auto-enable eligibility for the fresh custom
prefix, then turns update preferences off in its isolated test configuration.

Release 1.0.0 completed successfully in run 38990025987: all six fresh-registry
consumer jobs passed with 29 command checks and four generated agents each.
The recorded artifact integrity is stored in .agents/docs/releases/1.0.0-verification.json.
A final authentication review found npm 9+ requires --auth-type=legacy for the
GitHub Packages login command. A failing regression verified the omitted flag;
release 1.0.1 corrects the guidance and adds real feed-based 1.0.0-to-current
self-update verification, including GUID preservation and integration refresh.

## Completed delivery (2026-10-17)

This section supersedes the earlier local-only completion and verification limits.
Implementation and release changes were committed and pushed to both work and main.
Annotated v1.0.0 and v1.0.1 tags are pushed; both packages were published by the
repository's GitHub Actions workflow. Version 1.0.1 source is bcb6484a17de9eecc7f8e5ab51a133cb55f8ecdf.

- Local suite: 51 tests passed; syntax and diff checks passed.
- Source CI run 38990582188 passed all six Linux/macOS/Windows and Node 24/26
  combinations plus generated-skill validation.
- Release run 38990685530 passed all 14 jobs: reusable CI, package publication,
  and six consumer verification jobs using the actual GitHub Packages artifact.
- Each consumer job passed 29 command checks on a fresh 1.0.1 installation and
  31 checks upgrading a feed-installed 1.0.0 through backlog update auto.
  GUID identity survived the upgrade and generated integration version refreshed.
- Downloaded package integrity matched the exact published tarball in every job.
- Full machine-readable evidence: .agents/docs/releases/1.0.1-verification.json.

No product decisions or delivery blockers remain. The final evidence-only commit
does not change the tagged package contents.

## Actual published artifact tested in the local agent workspace

The user explicitly required local execution of the published artifact. A direct
npm registry install was blocked by this workspace's registry authentication.
Workflow 38991111061 instead fetched the already-published 1.0.1 tarball from
GitHub Packages, checked its registry integrity, and attached it to the public
GitHub release. The agent downloaded that public asset and verified its SHA-512
against the original release record before installing it with a fresh npm cache.

The entire 51-test suite ran against the installed package's code and templates
on Linux / Node 24.19.0: 51 passed, zero failures, zero skips. Only test harness
files came from a fresh public clone of v1.0.1. The installed executable also
passed 27 consumer command checks; syntax, pack dry-run, skill linter, auditor,
and self-validator passed. All 24 original installed files retained their hashes.
Evidence and complete test output are in .agents/docs/releases/1.0.1-local-*. That historical download path was used for verification without rebuilding the
package. Supported installation now uses the npm registry reference; the former
public-tarball export workflow has been removed.
