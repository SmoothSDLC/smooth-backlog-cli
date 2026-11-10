# Team rules engine: the CLI evaluates a team's rule set over JSON items

**Goal:** all team behaviour is a rule set in the team file; the CLI only evaluates it over JSON items. Nothing about flow, status words
or roles remains in CLI code.

**Spec:** [2026-11-09-team-rules-engine/00-owner-rulings.md](2026-11-09-team-rules-engine/00-owner-rulings.md) (binding rulings R1 to R25).
The command-by-command behaviour page is [2026-11-09-team-rules-engine/01-command-behaviour-matrix.md](2026-11-09-team-rules-engine/01-command-behaviour-matrix.md); the facts and gap lists of the earlier analysis are the coverage checklist in [2026-11-09-team-rules-engine/reference/](2026-11-09-team-rules-engine/reference/README.md). The design is
[2026-11-09-team-rules-engine/design/](2026-11-09-team-rules-engine/design/) (chapters 01 to 08, the rule cases, the five example team files, the evaluator spike, the coverage file,
the four reviews A to D and the response to them). The seven points the reviews raised are closed; the answers are in
[design/decisions.md](2026-11-09-team-rules-engine/design/decisions.md) and the design follows them.
The implementation plan is [2026-11-09-team-rules-engine/implementation/00-priority-order.md](2026-11-09-team-rules-engine/implementation/00-priority-order.md) (29 batches in order), with
[the landing strategy](2026-11-09-team-rules-engine/implementation/01-landing-strategy.md), [the BDD and test plan](2026-11-09-team-rules-engine/implementation/02-bdd-plan.md) and
[the risks and open items](2026-11-09-team-rules-engine/implementation/03-risks-and-open-items.md), which also lists the batches that carry each answer.

**Global Constraints:** public repo (nothing of the owner's internal factory); no alias, no backward compatibility (migrate or fail);
one behaviour per command; every command and subcommand documented; every commit leaves the guards green; the CLI never writes the
team file; user commands enforce nothing. Every batch is committed on the working branch and pushed after every
commit; nothing is installed until the implementation is complete, all tests pass and the reviews are done (owner, 2026-11-09; landing
strategy section 3). The lead orchestrates; agents implement, test and review in worktrees that are merged back and removed (priority
order section 2.1). Each batch cites its design chapters by number and re-reads
them at its start.

## Tasks
- [x] Task 1: Design chapters 01 to 08, the rule cases, the example team files and the evaluator spike ([2026-11-09-team-rules-engine/design/](2026-11-09-team-rules-engine/design/)).
- [x] Task 2: Review of the design by independent agents; fixes. Reviews A to D are answered and applied
  ([review-response.md](2026-11-09-team-rules-engine/design/review-response.md)), and the seven questions of round 12 are closed
  ([design/decisions.md](2026-11-09-team-rules-engine/design/decisions.md)).
- [x] Task 3: BDD scenarios and the test plan, written before the code ([02-bdd-plan.md](2026-11-09-team-rules-engine/implementation/02-bdd-plan.md)).
- [ ] Task 4: Foundations (backlog item 152; [00-priority-order.md](2026-11-09-team-rules-engine/implementation/00-priority-order.md) phase 1).
  - [x] B01 the environment prefix (R20, R18; chapter 01 section 5, chapter 06 section 6)
  - [x] B02 the configuration keys and the team-file location (R22, R25; chapter 01 section 1.1, chapter 06 section 2.0; round 12, questions 1 and 6)
  - [x] B03 the number high-water mark (R12; chapter 05 sections 1, 2 and 4)
  - [x] B04 publication and staging (R12, R5; chapter 05 sections 2 and 3, chapter 04 section 6)
  - [x] B05 the item-file seam (preparation of R4; chapter 02 section 2.4)
  - [ ] B06 item files are JSON (R4, R7; chapter 02 sections 1 to 5, chapter 06 sections 2 and 6, chapter 05 section 2; round 12, question 3)
- [ ] Task 5: The evaluator and validation (item 152; phase 2).
  - [x] B07 the linear pattern matcher (chapter 03 section 4.1, chapter 01 section 6)
  - [x] B08 the evaluator (R1, R2, R7, R8, R10; chapter 03 sections 1 to 8 and 12, chapter 02 section 3, chapter 01 section 6)
  - [x] B09 the pop table and the filters (R2, R10; chapter 03 sections 9 and 10, chapter 04 section 4)
  - [x] B10 the checks of the team file (R11, R18; chapter 08 sections 2 to 6, chapter 03 sections 3, 4 and 14)
  - [x] B11 validation on load (R18, R21, R22; chapter 01 sections 1.1 and 4; round 12, questions 1, 4 and 6)
- [ ] Task 6: The team commands on the evaluator (item 152; phase 3).
  - [x] B12 the team router, the inputs, `backlog team validate` (R3b, R11, R14, R15, R18, R21; chapter 01 section 5, chapter 04 sections 1 and 5, chapter 08; round 12, questions 1, 4 and 5)
  - [ ] B13 `backlog team new` (R1, R2, R5, R12; chapter 04 section 2, chapter 05)
  - [ ] B14 the step commands: `backlog team update`, `query check`, `pop`, `query plan` (R1, R2, R10, R15; chapter 04 sections 3 to 5, chapter 07 section 6)
  - [ ] B15 running again on the upstream files (R1, R12, R24; chapter 04 sections 6 and 7, chapter 05 section 3; round 12, question 2)
  - [ ] B16 the read-only query forms (R8, R14; chapter 04 sections 1 and 4, chapter 07 sections 1 and 5; round 12, question 5)
- [ ] Task 7: The user commands beside the teams (item 152; phase 4).
  - [ ] B17 user reads ignore team items, `--show-all` (R3, R3a, R16; chapter 04 section 8, chapter 05 section 6)
  - [ ] B18 user writes on team items with `--show-all` (R19; chapter 04 section 8, chapter 02 sections 2.1 and 2.3)
  - [ ] B19 queue ownership in a reordering, and `backlog clean` (R13; chapter 05 section 6, chapter 04 section 8)
  - [ ] B20 the team-session guard (R19a; chapter 04 section 8)
  - [ ] B21 the own-folder scope (R24; chapter 04 section 9, chapter 05 section 1, chapter 02 section 4; round 12, question 1)
- [ ] Task 8: Items migrate from markdown to JSON (item 152; phase 5).
  - [ ] B22 the migration command `backlog team migrate` (R4, R5, R12, R14, R18, R24, R25; chapter 06 sections 1 to 3, 4.5, 4.7, 5 and 6; round 12, questions 1, 5 and 7)
  - [ ] B23 the migration's data cases (R4; chapter 06 sections 4.1 to 4.4 and 4.6)
  - [ ] B24 the field report and `--ask` (R17; chapter 06 sections 2.1 and 2.2)
- [ ] Task 9: Setup (item 152; phase 6).
  - [x] B25 setup copies the team templates (R5, R23; chapter 01 section 1.2)
  - [ ] B26 setup on a markdown backlog, and the migration report (R25; chapter 06 sections 2 and 2.0)
- [ ] Task 10: Removals (item 152; phase 7).
  - [ ] B27 the old team code, commands, readers and shipped workflow go (R1, R5; chapter 01 section 1, chapter 04 section 1)
  - [ ] B28 the compatibility paths go (R18; chapter 06 section 6)
- [ ] Task 11: The owner's team: template (item 148), the template-location key in every repository's configuration (item 150), finalized entry and rule set (item 149), the lead and member skills read it and the
  consumers change (item 151); in the backlog repo and the owner's repositories, never here (chapter 07).
- [ ] Task 12: The cut-over: the finished build is installed, the folders are migrated, the consumers are updated
  ([01-landing-strategy.md](2026-11-09-team-rules-engine/implementation/01-landing-strategy.md) section 4; the folders in use are migrated in the window, the others when next used, rulings R24 and R25).
- [ ] Task 13: Full-scope execution against the owner's team rule set and the dummy teams (scrum, extreme programming, parallel work,
  single-agent team, the pattern catalogue, several teams at once) (item 153; [02-bdd-plan.md](2026-11-09-team-rules-engine/implementation/02-bdd-plan.md) section 4).
- [ ] Task 14: Gap review of the PR3 branch backlog and of the main backlog (superseded items to archive); the coverage rows deferred with an
  explicit blocker are filed or closed (item 154; [00-priority-order.md](2026-11-09-team-rules-engine/implementation/00-priority-order.md) section 5).
- [ ] Task 15: B29, the final documentation pass and verification, the plan moved to completed, the one pull request (title and body shown
  in chat first).
