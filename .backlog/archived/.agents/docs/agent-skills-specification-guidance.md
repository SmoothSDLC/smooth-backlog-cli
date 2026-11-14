# Agent Skills design guidance

The product skill lives in `templates/skills/backlog/`. Its source of truth is
this project's current command behavior, documented in root `COMMANDS.md`.
Development instructions are in `skills.instructions.md`; maintenance commands
are in `skill-authoring-for-codex.md`.

## Structure and metadata

Use the [Agent Skills specification](https://agentskills.io/specification) for
supported frontmatter fields, naming limits, compatibility, and metadata types.
Keep project-authored content under Apache-2.0. Keep the skill name aligned with
its directory, and describe concrete activation scenarios and exclusions.

Keep SKILL.md concise. Put detailed CLI syntax in the bundled command reference,
functional helpers and trigger fixtures in the skill's scripts directory, and
output evaluation cases in its evals directory. All referenced paths must exist
relative to the installed skill; repository-only files must not be dependencies.

## Behavior

Teach the agent what it needs to know to operate this backlog safely. Retain
GUIDs for durable references, resolve numeric selectors against current priority,
check the active branch, and validate the result after changing work. The CLI
owns schema validation, locking, journaling, update scheduling, and error output.
Skill instructions should use those interfaces rather than implement substitutes.

Keep deterministic tasks in the bundled helper. Declare its dependencies, preserve
stdout JSON and stderr diagnostics, handle subprocess failures, and avoid writes
when an operation is documented as read-only.

## Evaluation

Keep realistic positive and negative trigger examples, with no duplicate queries.
Maintain output cases with prompts, expected results, and concrete assertions.
The bundled validator checks fixture structure, not the quality of model answers;
review activation and output quality separately when changing instructions.

Run the validator and the tests in `.agents/test/`. The integration tests exercise
the installed skill helpers and the supported agent destinations. See
`skill-spec-claim-coverage.md` for what is automated and what still needs review.

Further guidance: [best practices](https://agentskills.io/skill-creation/best-practices),
[using scripts](https://agentskills.io/skill-creation/using-scripts), and
[evaluation](https://agentskills.io/skill-creation/evaluating-skills).
