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
- Tests run locally first (Node 24): push only what passes locally. A test that passes locally and fails in CI is investigated first for why the environments differ, and that cause is fixed. Never patch the code until the difference is understood (owner decision, 2026-10-31).
- Information security of this public repository (owner decision, restated 2026-11-08). Never put any detail of a private environment into any tracked file or any commit message: no host or machine name, no local path (home folders, mounts), no port or address, no model name, no private repository name, no internal agent or tool name, no private process, no credential. That covers plans, specifications, handoffs and review logs under .agents/docs/ as much as code, tests and fixtures. Describe such things generically ("the consumer repository", "the team's topology repository", "a local model"); the private detail belongs in a backlog item of a private repository. The rule is enforced by .agents/test/no-private-details.test.js (it reads the private deny list named by BACKLOG_PRIVATE_DENYLIST, which is kept outside the repository; CI uses a synthetic list), by the pre-push hook that scans the pushed commits, and by review. Run the guard before every commit that adds or changes a document; a plan that fails it is fixed immediately, before anything is pushed.
- Run npm test and npm run check after code changes. Use npm pack --dry-run to
  verify that only public package files are shipped.
- Preserve GUID identity, branch isolation, transactional writes, and compatibility
  with existing backlog data when changing behavior.
- Read .agents/docs/specs/2026-10-16-smooth-backlog-cli-design.md for product decisions.

## The two personas (owner terms, 2026-11-08)

Write only these two terms in documentation, help, code comments, tests, plans and questions to the owner.

- **The user** is a person using the CLI. The user commands (`new`, `update`, `done`, `list`, `show`, `next`, `history`, `changes`, `fields`, `move`, `archive`, `import`, `clean`, `setup`, `upgrade`) enforce nothing: no flow, no status words, no limits. The CLI has default values, but a user may set any value; it is then the user's job to find the commands and flags that show the item. The CLI does not dictate behaviour to a user. A user who wants enforcement defines a custom team named `user` and uses the team commands.
- **The agents** are AI agents working in teams, through `backlog team ...`. Every behaviour a team enforces (status order, who may do what, claims, reviews, refinement, limits, dependencies, required fields, refusal texts) comes only from the team behaviour file (the team's entry in `teams.json` and its workflow definition). The CLI's code reads and applies that file; it does not hard-code a behaviour pattern. Enforcement that is in code and not in the file is a defect.
- Do not call the user commands "plain", "non-team" or "basic" commands, and do not call the team commands "advanced".

## Plans

Plans live in `.agents/docs/plans/`, one markdown file per plan named `YYYY-MM-DD-<name>.md` (the creation date first), in the format already used there: title, Goal, Spec link, Global Constraints, Tasks. A plan made of several documents has a folder with the same dated name next to its entry file. A finished plan moves to `.agents/docs/plans/completed/` at once; a finished plan never stays listed as active. A document counts as delivered only when it is pushed to this repository on the working branch and linked where the owner reads it.
