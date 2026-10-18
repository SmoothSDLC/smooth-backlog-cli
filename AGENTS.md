# smooth-backlog-cli

This is a dependency-free Node.js 24+ CLI, licensed under Apache-2.0.

- Public package documentation belongs in README.md, COMMANDS.md, and CHANGELOG.md.
- Development specifications and notes belong in .agents/docs/.
- Tests live in .agents/test/; release verification lives in
  .agents/scripts/verify-published-package.mjs. Keep GitHub workflows under
  .github/workflows/ so GitHub can execute them.
- Product agent integrations live in templates/skills/backlog/ and ship with the CLI.
- Only the main release workflow assigns release versions. Keep the private
  development placeholder in package.json and package-lock.json; never bump a
  release version in a pull request. Publishing derives its version from the tag.
- Run npm test and npm run check after code changes. Use npm pack --dry-run to
  verify that only public package files are shipped.
- Preserve GUID identity, branch isolation, transactional writes, and compatibility
  with existing backlog data when changing behavior.
- Read .agents/docs/specs/2026-10-16-smooth-backlog-cli-design.md for product decisions.
