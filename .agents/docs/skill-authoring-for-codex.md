# Maintaining the product agent integration

The public skill is under `templates/skills/backlog/`. Its instructions, the CLI install
script and the evaluation fixtures ship with the npm package and
are installed by `backlog init`. Keep them independent of development-only tools.

Use `license: Apache-2.0` for project-authored skills. Keep the skill description
specific, preserve working relative links, and use scripts for deterministic work.
The authoring standards and validation coverage in this directory describe the
current product integration and supported maintenance commands.

Validate from the repository root:

```sh
node --test .agents/test/integrations.test.js
npm test
npm run check
npm pack --dry-run
```

The skill names only CLI commands (no Python script, item file or backlog path; item 058).
The integration tests check the skill's structure and that pattern, and the copies in all
four supported agent destinations.
