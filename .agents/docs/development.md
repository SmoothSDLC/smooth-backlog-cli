# Package development

Use Node.js 24+, npm, Git, and Python 3.8+ for the bundled skill helper tests.
No development framework or code-indexing service is required.

From the repository root:

```sh
npm ci --ignore-scripts
npm test
npm run check
npm pack --dry-run
```

The CLI sources are under `src/`, its executable is `bin/backlog.js`, and its
public integration templates are under `templates/`. Tests are in `.agents/test/`;
the release verifier is `.agents/scripts/verify-published-package.mjs`. Development-only documents
are kept in `.agents/docs/`; public usage documentation stays at the root.

GitHub Actions validates the supported operating systems and Node.js versions
before publishing tagged releases. The first-party release verifier downloads
published packages and exercises the installed CLI independently of source code.

CI runs on branch pushes except `master`, and on pull requests except those targeting
`master`. Tag pushes do not start a separate standalone CI run. A main push starts
the release-tag workflow. Both tag creation and publication require the exact
commit to belong to a merged pull request targeting `main` whose latest PR CI
passed for its final head commit. Direct main pushes, unmerged PRs, and missing,
pending, or failed PR CI cannot pass these gates.

Each release workflow uses `queue: single` with cancellation of the active run
disabled: one active run and at most one pending run. Newer pushes replace a
pending run. A larger queue is intentionally not enabled.

Release versions are assigned only by the workflow after merge to main. The
source package uses a private development placeholder, never a future release
number. The main workflow reads published stable versions and existing tags,
assigns the next patch version, and pushes an annotated tag at that main commit.
Reruns reuse the existing tag at the commit instead of assigning another version.
Documentation-only changes are skipped when the public runtime is unchanged
since the latest published release tag.

The publish workflow runs on version-tag pushes or workflow dispatch at a version
tag. A branch dispatch cannot publish. Tags pushed with GITHUB_TOKEN do not trigger
another workflow automatically, so the main workflow explicitly dispatches the
publish workflow at the tag using its actions-write permission. No extra token is
required. Publishing reads the static version from the tag, reruns CI, stamps the
package and lockfile only in its checkout, and publishes that exact tarball.
Registry installations and upgrades from the previous published version are then
verified across all supported OS/Node combinations. A tag identifies the assigned
release; the publish workflow result records whether publication and verification
succeeded. Reruns never overwrite npm versions or move existing tags. Registry
authentication or network failures stop publication instead of indicating absence.
