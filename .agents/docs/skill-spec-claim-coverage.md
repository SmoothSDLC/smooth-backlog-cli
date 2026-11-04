# Product skill validation coverage

The repository validates its product skill with the tests under `.agents/test/`. It does not depend on a vendored
linter, auditor, or agent development framework.

| Check | Current validation |
| --- | --- |
| Frontmatter block and matching directory name | `integrations.test.js` (product skill test) |
| SKILL.md below 500 lines | `integrations.test.js` (product skill test) |
| Referenced skill resources exist | `integrations.test.js` (product skill test) |
| No Python script, oracle, item file or storage file named in the skill | `integrations.test.js` (item 058) |
| At least 10 positive and 8 negative trigger fixtures, with unique queries | `integrations.test.js` (product skill test) |
| Output fixtures contain prompts, expected outputs, and assertions | `integrations.test.js` (product skill test) |
| All four installed agent integrations | `.agents/test/integrations.test.js` |
| Public documentation and integration resources are included in the npm artifact | `.agents/test/package.test.js` |
| Development-only files are excluded from the npm artifact | `.agents/test/package.test.js` |

The built-in frontmatter checks do not replace a complete YAML/specification
parser. Fixture checks validate structure; they do not measure model activation
or response quality. Review instruction quality and real trigger behavior when
changing the product skill.

Run the documented commands in `skill-authoring-for-codex.md` from the repository
root. The installed skill's resource paths resolve relative to its own directory.
