# Behaviours introduced or refined on this branch, read from its history

Scope (owner, 2026-11-14): only what this branch introduced or refined, the 335 commits from its start on 2026-11-04 to 2026-11-14, read in date order from the commit record. The earlier branch is not analysed: its behaviour was the complexity this branch replaces with the rule set and the item definition.

Each behaviour gets one state:

- IN FORCE: part of the simplified CLI; the decision that carries it is named.
- TEAM RULE: it was built as code; under the pattern it is a rule of a team, written in the team's rule set and shipped as data in the default rule set.
- ITEM DEFINITION: it was built as a fixed field or word; under the pattern it is a field or value of an item definition.
- QUESTION: it conflicts with the pattern and the lead cannot say how it fits the definition or the rule set; put to the owner.
- ARCHIVED BEHAVIOUR: discovered in the history, not part of the simplified CLI; documented here and nowhere else. The decision or later commit that ended it is named.
- OPEN COMMAND: a command an earlier owner decision kept and that the simplified scope neither lists nor removes (decision 33).

## 2026-11-04 to 2026-11-08 (95 commits)

| Behaviour | Commits | State |
|---|---|---|
| The items live in one configured place: the backlog folder named by the configuration, else inside the repository; the setting is a folder path and nothing more | 08486f9, 020ecbb, 7543354 | IN FORCE (decisions of 2026-11-04 D and 2026-11-05) |
| The backlog is always a git repository; one synchronisation path for both places: pull before a command, commit and push after a change | 2fd37fb, 5b380c2, 50d4785, c42f385 | IN FORCE (2026-11-04 D) |
| A repository without an origin keeps its backlog commits; a renumbering never amends a person's commits | a6306f8 | IN FORCE (ruling R12) |
| No output names an item file or a folder; an empty backlog is reported without naming its folder | 83dafa7, 425b435, 2de05ed | IN FORCE (2026-11-04 D4) |
| Every event of an item is recorded in the item itself; a moved item brings its history | d89dd85, bce6cb4, b3e9895 | IN FORCE (base item: history) |
| No database: the committed index is the order, the item files are everything else; a change of rank rewrites one file | ea1ed36 to 0efb892, 81deec5, 665b62d, 3eacd28, 1bd02c4 | IN FORCE (2026-11-04 F, ruling R13) |
| An item that cannot be read is named with its field; `backlog update <item> --restore` brings back its previous version | 3ddd469, 40a4a49 | IN FORCE (2026-11-04 F); the command form is set in the specification |
| `backlog setup` records what it ran with, reports every action, and records the user and the default team in the configuration | 99b22b2, db4e8cb | IN FORCE (ruling R3b for the `team` key) |
| Team commands exist only under `backlog team`; `backlog pop` and `backlog work` are gone; `--team` scopes a team command | 034ffaa, 215e6cb, fb1380c, db5c142, fc6ac0f | IN FORCE (owner rules of 2026-11-05) |
| `backlog team pop --dry-run` answers and changes nothing | d679b4f | IN FORCE, as `--whatif` (decision 2) |
| User commands take no team option and ignore the team file | cf146b9, ff5ade0 | IN FORCE (ruling R3); ruling R19a adds the refusal when the team variable is set |
| A user command refuses a change of an item that has a team and names `backlog team update` | 91f48d4, e58490c | IN FORCE (decision 29, with `--show-all`) |
| `backlog team new` files an item of a team | 0e2c5f2 | IN FORCE; its starting stage, its review documents and the split of an item are TEAM RULE |
| `backlog list` and `backlog show` as commands of their own; each command has its own help; a test requires every command to be documented | 0421a58, 507ebc1, bc6cc44, 98852ca | IN FORCE (2026-11-07 rule) |
| `--ask` on `backlog new` and `backlog team new` | b6a2852 | IN FORCE (answer AP); it asks for the title and the description, and for the fields of the definition that applies |
| `backlog upgrade` and the update notice | a271cdb, 174c76d | IN FORCE (answer AI) |
| The two personas, the user and the agents; user commands are not called "plain" | a2b5474 | IN FORCE |
| The earlier command names as aliases, added and then removed | 49c3124, 0e12b97, d5ef024 | ARCHIVED BEHAVIOUR (2026-11-07 rule: no alias) |
| Team rules apply to team work only; teams, members and review rules come from configuration; the team entry is the roster | 137a0f5, b39f19e, f019509 | IN FORCE as a principle (ruling R5); the review rules themselves are TEAM RULE |
| A status order and a team workflow definition shipped with the CLI; one status word per item; team steps follow the status order; review verdicts | 4a73790, 255e657, bfeed46, 910ab02 | TEAM RULE and ITEM DEFINITION: the status words are values of the status field of a definition, the order and the verdicts are rules; the shipped workflow file is replaced by the default rule set |
| The team views claimable, reviewable, blocked, decisions, plan and work in progress | 215e6cb | TEAM RULE: named filters of the rule set, read with `backlog team query filter <name>` |
| Teams and flows defined through the CLI (`backlog team define`, `backlog team workflow`) | db4e8cb | ARCHIVED BEHAVIOUR (ruling R5: the CLI only reads the team file) |
| An item outside a team records its owner; the fields owner and owned since | db4e8cb, 2f5b73b | ITEM DEFINITION: the holder is a field a definition declares (decision 14) |
| Field names in the owner's words (title, last updated, last updated by); old keys read forever | 2f5b73b | IN FORCE for the names (decision 9); "read forever" is ARCHIVED BEHAVIOUR (no backwards compatibility) |
| `backlog fields` prints every field of an item with its meaning | 06dafad | OPEN COMMAND; it fits the pattern as a reader of the item definition that applies |
| Editing one section of the body by lines (`--section` with `--set-lines`, `--add-line`, `--remove-line`, `--move-line`) | b4123dc | ARCHIVED BEHAVIOUR (decision 13) |
| `backlog history` | 507ebc1 | ARCHIVED BEHAVIOUR (decision 15); the entries stay in the item |
| `backlog changes`, `backlog next` and `backlog next all-branches` | 507ebc1 | OPEN COMMAND |
| `backlog done`, `backlog clean`, `backlog import` (with `--higher`), `backlog archive done`, `backlog init clean` and `init clean all-branches` | 778e090, d837889, 18eb5b9 | OPEN COMMAND; `backlog done` needs a finished word, which is a value of the status field of a definition |
| `backlog list` with the words new, open, done, archive, branches, critical and all-branches | 0421a58 | IN FORCE for the list; the words that name a status or "critical" are ITEM DEFINITION |
| The storage location is never a default | 3d0e2d3 | ARCHIVED BEHAVIOUR (reverted the next day by the owner, 7543354) |

## 2026-11-09 and 2026-11-10 (129 commits)

The 30 commits of 2026-11-09 before the first code commit are documents: the owner rulings R1 to R25, the design of the rules engine, four reviews and the owner's answers of round 12. Each ruling and answer is placed in [decisions.md](decisions.md) or [superseded-decisions.md](superseded-decisions.md); they are not repeated here. The code commits:

| Behaviour | Commits | State |
|---|---|---|
| Every environment variable the CLI owns carries the prefix `SMOOTH_BACKLOG_CLI_`, with no alias | ba77e09 | IN FORCE (ruling R20); decision 31 adds that the configuration names the variables |
| The configuration keeps the team-file keys; a configuration that cannot be read stops every command and names no path; the team file's place is resolved from the configuration | 40ab27f, 16c9aae | IN FORCE (ruling R22, round 12 question 6) |
| Every read and write of an item file goes through one module | 05733de, 6cd4b7f, e3ac8bc | IN FORCE (no behaviour of its own) |
| Items are JSON files with required base keys checked at write and read; a folder of markdown items stops with exit 2 | 206bfea, de9c4e9, 9253c21 to 889335b | IN FORCE (rulings R4 and R18, decision 5); the stored keys owner and owned since are ITEM DEFINITION |
| An item number is never handed out twice: one above the highest number the folder ever held | 3838e5f, 150f104, 32b5175 | IN FORCE (ruling R12) |
| `--seq` gives an item a number, also to repair an item whose number cannot be read | 150f104, 7c2f7f0, 889335b | IN FORCE as the repair of 2026-11-04 F; the command form is set in the specification |
| A command publishes only the item files, the index and the number record it wrote; a failed publication or pull is undone on the command's own paths and a person's own edits come back | e541205, 977223a, b38791b, a5e62d4, 6f41ae4, 33c7234 | IN FORCE (2026-11-04 D) |
| A team command publishes its own commit alone and runs again when the upstream changed what it read | 9b0e293, 5895948 | IN FORCE (round 12 question 2) |
| "One exported lock wait": a command waits for another process that uses the same local copy | 9b0e293 | QUESTION (already with the owner: whether two processes in one local copy take turns; decision 32 makes who may write an item a team rule) |
| The rule language: the pattern matcher that runs in linear time, values, conditions, functions and texts | 6f09ed3, bb312a8, dce466f, 151fb1c | IN FORCE (rulings R1 and R8) |
| The step evaluator: the ordered table walk, the argument list, typed set, add and remove, the effects note, related, place, say, team, branch, archive and delete, and the step "new" | d430128, 1e2dc4c, e200248, 5c4ba57 | IN FORCE (rulings R1 and R10) |
| The pop table walk with queue order and skip set; the named filters | 8188bd6, 3b6b3cb | IN FORCE (the rule set's pop table and filters) |
| The checks of the team file (shape, team names, people, item definition, every rule, effect, reference and pattern, a rule no item can reach) and `backlog team validate` with the item and number checks | 543aea6, e74b422, 7db12df, 5f7e029, 8cd0486, 9695740, 1b5219c, f6560b2, 7c39343, 1abaaa9 | IN FORCE (ruling R11) |
| The team file is validated before a team command acts; its SHA in `.backlog/config.json`; the per-user record | 3d827b8, 741660a | IN FORCE (rulings R21 and R22) |
| One resolution of team, agent, session, repository and branch; the `--show-all` and `--team` rules for team commands | 54b306b to ac25a03 | IN FORCE (ruling R15, round 12 question 5, decision 31) |
| `backlog setup` copies the generic team templates into `.backlog/team-templates` and commits them with the configuration; it recommends the migration | fd05ac8, 90d2ac7, da0ed42, 7197785 | IN FORCE (rulings R23 and R25) |
| A number that two items hold is refused when a command is given it; either item is named by its slug | f19afcf | IN FORCE (round 12 question 3) |
| A stored link between items that names such a number counts as undone; a dependency that was archived by force counts as finished | 5ceeca4, 30d98cf | TEAM RULE and ITEM DEFINITION (decision 28: a link between items is a field, what it blocks is a rule) |
| The definition of items without a team is data, and `backlog fields` prints it | 5e80257, 35bb46b | IN FORCE as the mechanism (decision 20); its fixed list of fields is ITEM DEFINITION: replaced by the packaged default definition (decision 18) |
| Archive writes no status word; an item is archived by where its file is | 846854e | IN FORCE (decision 22) |
| The hand-off refusal and its exemptions | 30d98cf, 6c0c21c, cd42595 | TEAM RULE (a hand-off between holders is workflow) |
| `backlog new` writes the fixed fields and the parent; `backlog done` stores the word closed; a finished word stamps a completion time; `backlog new` loses `--force` | da49625, ba5106b, 9c4f894 | ITEM DEFINITION: the parent and the completion time are fields, and the finished words are the values a definition marks as final; `backlog done` is an OPEN COMMAND |
| A status of an item without a team is stored as typed | da49625, 9c4f894 | IN FORCE (owner principle of 2026-11-08) |
| The history of an item is full entries (when, who, session, step, changes, note) written with every change; a move in the order adds no entry, because the index is its own file | 866a788 to 1a512dc | IN FORCE (the base item's history) |
| `backlog history` prints the entries | 866a788, 8a821f7 | ARCHIVED BEHAVIOUR (decision 15) |

## 2026-11-11 to 2026-11-14 (111 commits)

The 28 commits that start with "Plans:" or "Docs:" are documents: the plan of 2026-11-12 (archived), the owner decisions of 2026-11-13 and 2026-11-14 (in [decisions.md](decisions.md)) and the files of this folder. The code and test commits:

| Behaviour | Commits | State |
|---|---|---|
| A refused push takes back only the command's own commit; a person's commit on top of it is never amended, dropped or published with it; a person's edit of a path the upstream changed is laid over it or kept in a named stash; a path is the command's own only when the command wrote it in this run | 9189567, f0e8f3b to 34f7eee, 752aa09 | IN FORCE (2026-11-04 D, round 12 question 2) |
| Every failure of a team publication exits with one code, and `backlog team pop` reads it as "nothing to do now"; a git older than 2.40 is refused | c89ecdc, 83483bb, e80b014, 86ed2e5 | IN FORCE |
| Publication waits for the lock of the local copy and takes back its files when locked out | 7256e5b | QUESTION (the same one as above: turn-taking of two processes in one local copy) |
| A team item is read and written as stored, every key of it, so a converted item keeps its stage and review state | 3a8a18d, 0f04973, 2e030df | IN FORCE for "as stored"; stage and review state are ITEM DEFINITION fields of a team |
| The earlier team commands install their own reading of the earlier words; the work-in-progress reading of a refinement | 3a8a18d, f1e4d48, 5df67f6 | ARCHIVED BEHAVIOUR: a bridge for the coded team workflow, which decisions 28 and 32 remove |
| The finished words are one list of the item definition; the index orders only the entries of its scope | 54d97a6 | ITEM DEFINITION (the values a definition marks as final) |
| A team step is applied as one result: the items with their history, archive and delete, the number, the order in the index | f23a071, c600917 | IN FORCE |
| One parser for the arguments of a step: the reserved flags by name, every other `--name` a value of the step | 1074902 | IN FORCE |
| `backlog team new` runs the step "new" of the team's rules; `backlog team update <item> <step> [--<argument> <value>]` runs one step; `backlog team pop` takes the first step the pop table offers; every instruction names the step as a word | a736ce5, d762557, c77c0fc, ef1f9e2 | IN FORCE (ruling R1) |
| `backlog team query`: list, one item, a filter, check, plan, rules and steps; the earlier views are gone | 4cdde9b, ba7af60, dcb2edb, ea0ac7b, 3462a8f | IN FORCE |
| Every value of a JSON answer is redacted before it is serialized | 4712138 to ac9572d | IN FORCE |
| The migration: one markdown item becomes one JSON item with the rules for the holder, the links to other items and the history; the plan of a folder with its stops; `backlog team migrate` and its record | b0191d4 to 5bf19f5, 846bb4b to 336db5e | IN FORCE (rulings R4, R17 and R25); where the holder and the links go is ITEM DEFINITION, and what happens to a value whose field the definition does not declare is a QUESTION (already with the owner) |
| User commands do not see items of a team; the reading commands see them with `--show-all` | ce68d33, 99e1d19, 947c300, 36a8042 | IN FORCE (ruling R3a with R16, decision 7) |
| `backlog new --show-all`, to name an item of a team in a new item | 947c300 | ARCHIVED BEHAVIOUR (decision 7: not a flag of `backlog new`) |
| `backlog history` and `backlog changes` name the team of an item with `--show-all`; what "held" means in `backlog changes` | 1cf9371, eeab766, ddd2615 | `backlog history`: ARCHIVED BEHAVIOUR (decision 15); `backlog changes`: OPEN COMMAND, and "held" is an ITEM DEFINITION field |
| The skill teaches the team commands and no team's rules; it is compared with the command reference by a test | 041220f, 8a1bd63, 33bce1e | IN FORCE (decision 17) |
| The behaviour scenarios of teams run on a shipped template and take their fields from the team file the scenario wrote | cd26816 to fddd3ce, b7df11f, 7a16f4e | IN FORCE as the way to test team behaviour |

## Result

All 335 commits were read by their record (the subject line of each); the code of each commit was not read. Nothing found on this branch conflicts with the pattern in a way that has no place: every coded workflow found (status order, verdicts, review, hand-off, holder, links between items, parent, completion time, views) becomes a field of an item definition or a rule of a rule set.

Two points are QUESTION, both already recorded for the owner: whether two processes in one local copy take turns, and what happens to a value whose field the applicable definition does not declare.

ARCHIVED BEHAVIOUR, documented here only: the aliases of earlier command names; `backlog team define` and `backlog team workflow`; editing a section by lines; `backlog history`; `backlog new --show-all`; old keys read forever; the bridge for the coded team workflow; a storage location that is never a default.

OPEN COMMAND, kept by an earlier owner decision and neither specified nor removed: `backlog fields`, `backlog changes`, `backlog next`, `backlog done`, `backlog clean`, `backlog import`, `backlog archive done`, `backlog init clean`.
