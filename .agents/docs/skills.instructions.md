# Product skill authoring standards

These instructions apply to the project-owned skill in
`templates/skills/backlog/`. Its resources ship with the public npm package and
are installed into consumers' repositories by `backlog init`.

- Keep `name: backlog` aligned with the skill directory name.
- Use `license: Apache-2.0` and describe actual runtime prerequisites.
- Describe when to use the skill, including relevant cases that do not mention
  the backlog explicitly. Keep the description within the Agent Skills limits.
- Keep SKILL.md under 500 lines. Put command details in the bundled
  `references/commands.md`, and keep its content aligned with root `COMMANDS.md`.
- The skill names only CLI commands: no Python script, item file or backlog path
  (item 058; the integration tests check it).
- Verify every referenced bundled resource exists. Maintain trigger examples and
  output evaluation cases alongside the skill.
- Keep development documents and tests in `.agents/`, outside the package allowlist.

Run the product validator from the repository root:

```sh
node --test .agents/test/integrations.test.js
```

It checks the bundle structure, the referenced resources, the evaluation fixtures, and
that the skill names no Python script, item file or backlog storage file (item 058).
Run `npm test`, `npm run check`, and `npm pack --dry-run` before publishing.
See `skill-spec-claim-coverage.md` for the current automated coverage and
`agent-skills-specification-guidance.md` for design guidance.
