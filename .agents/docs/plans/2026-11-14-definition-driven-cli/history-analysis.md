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
