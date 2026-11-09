# Reference: facts and gap lists from the earlier team behaviour analysis

Context: the 2026-11-08 analysis proposed a large fixed vocabulary of named rule pieces. The owner replaced that design with a small
rules evaluator (see ../00-owner-rulings.md). The design is not input to the new work. The FACTS it collected are, and they are
the coverage checklist: no behaviour or gap listed here may be lost without a recorded reason.

| File | What it holds | How the new design uses it |
|---|---|---|
| 01-inventory.md, inventory.tsv | Every place in the CLI code where a team or flow behaviour is decided (about a thousand rows), each with a terminal state | Every row ends as: a rule in the rule set, a field of the item definition, or an explicit drop with the reason |
| 02-current-file-formats.md | The files the CLI reads and writes today (items, team entries, flow definitions, limits, scope) | Source for the migration to JSON items and to the team file |
| 08-owner-questions.md | Open behaviour questions (delete a team item, move, abandon a step, JSON output shape, selectors) | Each is answered by a rule, a field or a command, or asked as a decision |
| 09-gap-resolution.md, gaps.tsv | Gaps found when the user commands were compared with the team commands | Each gap ends as a rule, a field, a command or a drop |
| 13-format-gaps.md | 17 behaviours of a real team that the earlier vocabulary could not state | Each is to be written as an ordinary rule over fields; a gap that cannot be written is a language gap |
| consumers.tsv | The scripts and skills that call the CLI and what they read | Source for the update of the skills |
| tests.tsv | Each existing test that proves a team behaviour | Source for the conformance scenarios of the new evaluator |

Words and keys of the earlier vocabulary (for example the names of its conditions and predicates) are not to be reused.
