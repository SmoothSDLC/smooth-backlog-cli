# Team rules engine: the CLI evaluates a team's rule set over JSON items

**Goal:** all team behaviour is a rule set in the team file; the CLI only evaluates it over JSON items. Nothing about flow, status words
or roles remains in CLI code.

**Spec:** [2026-11-09-team-rules-engine/00-owner-rulings.md](2026-11-09-team-rules-engine/00-owner-rulings.md) (binding rulings).
The command-by-command behaviour page is [2026-11-09-team-rules-engine/01-command-behaviour-matrix.md](2026-11-09-team-rules-engine/01-command-behaviour-matrix.md); the facts and gap lists of the earlier analysis are the coverage checklist in [2026-11-09-team-rules-engine/reference/](2026-11-09-team-rules-engine/reference/README.md). The design chapters are written next, from these rulings and from the raw facts of the CLI source and of the team skills, not from
the replaced analysis.

**Global Constraints:** public repo (nothing of the owner's internal factory); no alias, no backward compatibility (migrate or fail);
one behaviour per command; every command and subcommand documented; every commit leaves the guards green; the CLI never writes the
team file; user commands enforce nothing.

## Tasks
- [ ] Task 1: Design chapter: the team file, the item definition, the rule language (statements, expressions, effects on a related
  item), with a worked example and a measure of how small the evaluator is (a prototype run against the conformance tests).
- [ ] Task 2: Review of the design by independent agents; fixes.
- [ ] Task 3: BDD scenarios and the test plan, written before the code.
- [ ] Task 4: Items migrate from markdown to JSON (CLI migrate command for items only, tests first).
- [ ] Task 5: The evaluator and the `backlog team` commands on it; the old team code removed.
- [ ] Task 6: The owner's team: template, item definition, rule set in the backlog repo; the team lead and member skills read it.
- [ ] Task 7: Full-scope execution against the owner's team rule set and several dummy teams (scrum, extreme programming, parallel work,
  single-agent team, others).
- [ ] Task 8: Gap review of the PR3 branch backlog and of the main backlog (superseded items to archive).
- [ ] Task 9: Documentation, final verification, the one pull request (title and body shown in chat first).
