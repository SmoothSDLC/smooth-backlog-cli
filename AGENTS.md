# smooth-backlog-cli

This is a dependency-free Node.js 24+ CLI, licensed under Apache-2.0.

- Public package documentation belongs in README.md, COMMANDS.md, and CHANGELOG.md.
- Development specifications and notes belong in .agents/docs/.
- Tests live in .agents/test/; release verification lives in
  .agents/scripts/verify-published-package.mjs. Keep GitHub workflows under
  .github/workflows/ so GitHub can execute them.
- Product agent integrations live in templates/skills/backlog/ and ship with the CLI.
- Every change to the CLI's behaviour ships with its documentation in the same change. That covers a command, an option, an output, a refusal, a rule or a stored field. The required documentation is:
  - the built-in skill, templates/skills/backlog/SKILL.md;
  - the help text, src/help.js;
  - COMMANDS.md, regenerated with `node .agents/scripts/sync-commands-md.mjs`;
  - README.md, wherever it describes the behaviour;
  - CHANGELOG.md.
  None of them may describe the old behaviour. A change without them is not done, and a review returns CHANGES for it (owner decision, 2026-10-31).
- Only the main release workflow assigns release versions. Keep the private
  development placeholder in package.json and package-lock.json; never bump a
  release version in a pull request. Publishing derives its version from the tag.
- Tests run locally first (on BigFan, Node 24, from /opt/cody/node/bin): push only what passes there. A test that passes locally and fails in CI is investigated first for why the environments differ, and that cause is fixed. Never patch the code until the difference is understood (owner decision, 2026-10-31).
- Run npm test and npm run check after code changes. Use npm pack --dry-run to
  verify that only public package files are shipped.
- Preserve GUID identity, branch isolation, transactional writes, and compatibility
  with existing backlog data when changing behavior.
- Read .agents/docs/specs/2026-10-16-smooth-backlog-cli-design.md for product decisions.
