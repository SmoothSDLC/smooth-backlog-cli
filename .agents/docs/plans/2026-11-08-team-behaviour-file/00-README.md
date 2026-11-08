# Team behaviour file — analysis and specification (2026-11-08, revision 4)

The owner principle of 2026-11-08: the user commands enforce nothing about flow, status words or team behaviour; every team rule comes
from the external team behaviour JSON; the CLI is a generic reader and enforcer that hard-codes no behaviour pattern (no fixed role,
step, field or verdict name, no fixed team-entry shape beyond the definition language) and is tested against supplied definitions.
The owner ruling on the user flow: the user may set any value; the CLI refuses nothing in the user flow and dictates no behaviour; a
user who wants enforcement defines a team named `user` and uses the team commands. Standing rulings: no aliases, no backward
compatibility (migrate or fail with a clear message), one behaviour per command, team behaviour only under `backlog team`, every
command documented. Code base: `simplify/pr3-review` at `174c76d`.

## Terms used in this set

- **The user** — a person using the CLI; **user commands** / **user flow** — every `backlog` command that is not `backlog team ...`
  (`backlog list`, `update`, `done`, `archive`, ...). **The agents** — AI agents working in teams; **team commands** (agent
  commands) — `backlog team ...`. Older names survive only inside names of existing code files of the CLI
  (`src/shared/plain-step.js`, `.agents/test/plain-team-items.test.js`, `.agents/test/plain-team-env.test.js`) and inside the old
  schema 1 key names `plain_commands_on_team_items` / `plain_commands_outside_teams`, which are cited as facts, in test titles of the CLI quoted verbatim in `tests.tsv`, and in the review logs
  under `reviews/` (kept as written by the reviewers).

## Location, naming and privacy

This set is relocated to the public CLI repository, branch `simplify/pr3-review`, as `.agents/docs/plans/2026-11-08-team-behaviour-file/`
with an entry file `.agents/docs/plans/2026-11-08-team-behaviour-file.md`; a finished plan moves to `.agents/docs/plans/completed/`.
The numeric prefixes 00–10 are chapters of this one set. Every cross-link inside the set is relative. **Because the repository is
public, no file of the set may contain a private name**: no host or machine name, no local path, no private repository name, no
environment detail; the set says "the consumer repository" or "the team's topology repository". The check is the CLI's guard
`.agents/test/no-private-details.test.js` run with `BACKLOG_PRIVATE_DENYLIST` set to the owner's private deny-list (gate 6 of
`10-review-log.md`).

## What is here (reading order)

1. `01-inventory.md` + `inventory.tsv` (1033 rows, one per rule, 1013 file:line sites) + `tests.tsv` (819 test titles, 383
   literal-asserting with a disposition each) + `consumers.tsv` (22 topology dependencies): where every rule lives today.
   `tools/run.sh` regenerates the two TSV files from the source byte for byte.
2. `02-current-file-formats.md`: today's `teams.json`, `workflows.json`, shipped `team.json`, `wip-limits.json`, `backlog.scope`.
3. `03-spec.md`: decisions D-01..D-33, files and discovery, the reference of every key (§4, machinery text keys §4.7a, semantic rules
   V-01..V-41 / E-01..E-11 §4.10), the catalogues, the enforcer, the user commands and the binding port (§7), the hard-code allow-list
   (§8), the behaviours R01..R29 the shipped template reproduces (§9), and the requirements REQ-001..REQ-941 (114).
   `schema/` holds the four JSON Schema files (absolute `$id`, standard 2020-12 validators work) and `schema/negative/` 26 invalid
   files with their expected message; `templates/` the shipped templates (full = today's team, minimal, team-entry example, workflows
   example).
4. `04-bdd.md` + `features/*.feature` (15 files, 248 scenario ids): the behaviour, tagged by requirement and scenario id.
5. `05-tdd-plan.md`: 204 tests written before the code, the harness change (§2.1), the placeholder table, the guard tests (§5), the
   dispositions of the 383 literal-asserting tests.
6. `06-migration-plan.md`: phases PH-0..PH-15 (26 phases with the splits), the CLI pin rule, the cutover window, consumer order, live
   calls per phase, the conversion rules of an old definition (§4).
7. `07-traceability.tsv`: part A — every inventory row → its one terminal state → REQ → scenarios → tests → phase; part B — every
   NARROWED/REMOVED impact row; part C — requirements that come only from owner questions.
8. `08-owner-questions.md`: what the rulings decide (part 1) and the 17 open questions in the owner's decision format (part 2).
9. `09-gap-resolution.md` + `gaps.tsv`: the 47 NARROWED/REMOVED rows of the impact analysis resolved.
10. `10-review-log.md`: the 101 findings of the three reviews (`reviews/`) with their dispositions and the quality gates.

## Tools (all paths relative to this folder)

- `tools/run.sh` (with `SRC` = `<CLI checkout>/src`, `TESTS` = `<CLI checkout>/.agents/test`): `scan.py`, `fmap.py`, `inv.py`
  (classification `rules.py`, `groups.py`), `tests.py` → `inventory.tsv`, `tests.tsv`.
- `tools/gen/`: `gen.py` (requirements of `03-spec.md` §10 and `features/` from `reqs_a..h.py` plus the revision overlay
  `reqs_rev4.py`/`rev4_*.py` and `valrows.py`), `gen01.py` (§2–§4 of 01), `gen04.py`, `gen05.py`, `gen06.py`, `gen07.py`. §1–§9 of
  `03-spec.md` are edited by hand.
- Quality gates: `tools/check_schemas.py` (python `jsonschema` and the reference interpreter `tools/validate_subset.py` on the templates
  and the negative examples), `tools/check_semantics.py` (V/E rules), `tools/convert_v1.py` (the conversion of an old definition),
  `tools/make_negatives.py` (writes `schema/negative/`), `tools/check_consistency.py` (ids and counts), `tools/gates.sh` (all of them).

## How reviewers work

Review against the principle and the rulings, not against today's behaviour. Write findings in a new file under `reviews/` as
numbered entries `R<n>-nnn | severity | location | finding | proposed fix`; the author answers each in `10-review-log.md` and changes
the documents in one commit per round.
