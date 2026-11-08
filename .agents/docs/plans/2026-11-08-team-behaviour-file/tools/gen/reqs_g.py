from base import *
F='user-guarantee'
B='Given a repository with a backlog\n  And the backlog registers the workflow "team" from the template "team.full.json"\n  And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"\n  And an item "Bound" exists\n  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`\n'
R('REQ-901','The binding port and user_commands','PH-9',['BIND-TEXTS','BIND-UPDATE','BIND-REPLAN','BIND-ARCHIVE','BIND-IMPORT','BIND-CLEAN','BIND-SPLIT','BIND-ENTRYOF','PC-SEAM'],
 'User commands ask `binding.check(operation, items)` (§7) and act on its answer; the operations and their mapping are §7; the texts are the bound team\'s `refusals`.',
 'Decision AO and 7c-2c refusals become file rules; the user-command code holds no team text.',
 ['Each of the 12 operations: allowed and refused case with a fixture definition.','Template reproduces R23 verbatim.'],
 [('user update of a bound item is refused by the file',B+'  And I take a snapshot of the backlog repository\nWhen I run `backlog update 1 --name x`\nThen the command fails with exit code 1\n  And the output contains "use backlog team update: a team item is changed only there"\n  And the backlog repository is unchanged since the snapshot'),
  ('a definition that allows user update','Given a repository with a backlog\n  And the backlog registers the workflow "team" from the template "team.full.json" with `user_commands.update = {"allow":true}`\n  And a team "t1" with lead "lead" and members "ann" using the workflow "team"\n  And an item "Bound" exists\n  And item 1 has the front-matter fields `{"team":"t1","status":"in progress"}`\nWhen I run `backlog update 1 --name x`\nThen the command succeeds'),
  ('move of a bound item is allowed by the template',B+'  And a branch "other" exists on the origin\nWhen I run `backlog move 1 --to-branch other`\nThen the command succeeds'),
  ('clean is refused while a bound item is in scope',B+'When I run `backlog clean` and answer "yes"\nThen the command fails with exit code 1\n  And the output contains "001-bound belongs to a team, and no command deletes a team item"')],
 [('engine-binding.test.js','each of the 12 operations allow/refuse','patched definitions','answers'),('engine-binding.test.js','list texts: 5 names then "and N more", belongs/belong','7 bound items','texts'),('engine-binding.test.js','no team file read when no item is bound','spy','0 reads'),('engine-conformance.test.js','plain-team-items tests over the template','plain-team-items, team-boundary','same results')],F)
R('REQ-902','The user-command code enforces nothing','PH-10',['ST-SOLO','PC-NEWKEYS','PC-SEAM','CFG-OWNER'],
 'No module under `src/shared/` (and no user command path) contains a status, stage, role, verdict or team word, compares a status with a word list other than the default words of the user commands (D-33), refuses or orders anything by a flow rule, or reads a team file except through the port. User `new` writes no team key.',
 'Owner principle.',
 ['Guard tests of `05-tdd-plan.md` §5 pass.','User new writes: phase, seq, name, objective, summary, status, severity, repository, branch, commit, location, created, updated, updated_by, depends_on, owner (+ chunk/estimate/complexity/layer when given).'],
 [('user new writes no team keys','Given a repository with a backlog\nWhen I run `backlog new --name "User" --objective o --summary s`\nThen item 1 has review_state ""\n  And item 1 has claimed_by ""\n  And item 1 body does not contain "Definition of done"'),
  ('user update accepts any status word','Given a repository with a backlog\n  And an item "User" exists\nWhen I run `backlog update 1 --status bogus`\nThen the command succeeds\n  And item 1 has status "bogus"')],
 [('user-guard.test.js','no flow or team word in src/shared (allow-list)','source scan','0 hits'),('user-guard.test.js','import graph: src/shared imports from src/engine only binding.js','graph','ok'),('shared-new.test.js','user new writes no team key','user new','keys')],F)
R('REQ-903','Refusal and instruction tables','PH-1',['BIND-TEXTS','HO-TEXTS','RF-HOWTEXT','STEP-GATE','ST-FILL'],
 'Every refusal and instruction text of the enforcer and the port comes from the definition\'s `refusals`/`instructions` (except the machinery texts of §8); placeholders per §4.7, filled by the machinery.',
 'Owner: all texts in the file.',
 ['Conformance: every text of `templates/team.full.json` is produced by at least one test (coverage list).'],
 [('a changed refusal text is printed','Given a repository with a backlog\n  And the backlog registers the workflow "team" from the template "team.full.json" with `refusals.claimed_by_other = "<item> is taken by <holder>"`\n  And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"\n  And the environment TEAM_NAME is "t1"\n  And an item "W" exists\n  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`\n  And I act as agent "bob"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim bob`\nThen the output contains "001-w is taken by ann"')],
 [('engine-steps.test.js','filler: every placeholder of §4.7 has a value rule','unit','values'),('engine-conformance.test.js','every template text is produced at least once','coverage','100%')],F)
R('REQ-904','The hard-code allow-list','PH-12',['DI-ERR','DI-CLI','DI-SYNTAX','DI-LOCK','DI-UPGRADE','DI-SETUP','DI-STORE','DI-SYNC','DI-SAFETY','DI-FM','DI-STALE','DI-REPAIR','DI-INDEX','DI-ITEMSCHEMA','DI-ARCHIVE','DI-IDENTITY-FIELD','DI-MACHINE','DI-FINDINGS','DI-INPUT-IDENTITY','DEAD'],
 'Only the items of §8 stay in code; dead code (F12) is deleted.',
 'Principle: generic machinery and data integrity only.',
 ['A review checklist of §8 is part of the final phase gate; the guard tests encode it.'],
 [('no scenario','See T-904-1')],
 [('user-guard.test.js','engine source contains no status/role/team word outside the allow-list','src/engine scan','0 hits'),('user-guard.test.js','dead exports removed','grep','none')],F)
R('REQ-905','Guard tests','PH-9',['PC-SEAM'],
 'The build fails when a flow literal or team word appears in `src/shared/` or `src/engine/` outside the allow-list, or when `src/shared/` imports `src/team/` or any `src/engine/` module but `binding.js` (`05-tdd-plan.md` §5).',
 'Keeps the principle from eroding.',
 ['Mutation check: adding `"in progress"` to a shared file fails the test.'],
 [('no scenario','See T-905-1')],
 [('user-guard.test.js','mutation: a planted word fails the guard','temp copy','fails'),('user-guard.test.js','allow-list file is the only exception list','-','exists')],F)
R('REQ-906','Documentation of every key','PH-12',['DI-HELP','DI-FIELDS'],
 'A reference page `docs/team-behaviour.md` (package), `backlog team validate --help`, `team workflow --help`, `team define --help`, COMMANDS.md, the skill reference and README name every key of the four schema files with its meaning; a test fails when a schema key is missing from the page.',
 'Owner: every command and input documented accurately.',
 ['The test enumerates schema keys (paths) and greps the page.'],
 [('no scenario','See T-906-1')],
 [('docs-keys.test.js','every schema key path is documented','schema/*.json vs docs/team-behaviour.md','none missing'),('commands-documented.test.js','validate and migrate are in COMMANDS.md','-','present')],F)
R('REQ-907','Conformance of the shipped template','PH-1',['ST-VOCAB','ST-CANSTEP','ST-NEXT'],
 'The conformance suite runs the migrated literal tests (05 §6) against the registered `team.json` template; every row of §9 has at least one passing test.',
 'Migration changes where a rule lives, not what the shipped team does.',
 ['Counts of 05 §6 reconcile: 383 CODE-LITERAL titles → each mapped.'],
 [('no scenario','See T-907-1')],
 [('engine-conformance.test.js','§9 rows R01..R23 each covered','map','23/23')],F)
F='user-flow'
R('REQ-908','User status convention','PH-10',['ST-NORMALISE','PC-LISTWORDS','PC-FINISHED','PC-DEFAULT','PC-ARCHIVE-CLOSED','PC-DONE','PC-SEVERITY'],
 'CONDITIONAL on Q-01. Option A (recommended): `.backlog/config.json` key `user` = `{"initial": "<word>", "finished": ["<word>", ...], "done": "<word>", "new": ["<word>", ...], "critical_priority": <n|null>, "reopen": "end"|"top"}` written by `backlog setup` from the documented defaults `{"initial":"pending","finished":["closed","done","archived"],"done":"closed","new":["pending","new"],"critical_priority":0,"reopen":"end"}`; a backlog without the key: user commands that need it fail with `❌ backlog: .backlog/config.json has no user default words; run backlog setup` (exit 2); `update --status` stores the word as typed. Option B: no convention: list words new/open/done, `archive done`, `next` ordering, `done`, archive without --force and critical priority are removed; status is free text. Option C: the convention is fixed code (`closed`, `done`, `archived`; default `pending`) documented as the user vocabulary.',
 'The principle forbids team vocabulary in the user-command code; the user commands still need to know which items are finished to list, archive and order them.',
 ['A: words from the config; no team file read. B: the listed commands answer "not a backlog command"/unknown word. C: words in one module `src/shared/user-defaults.js` allow-listed by the guard.'],
 [('A: finished words come from the configuration','Given a repository with a backlog\n  And the configuration key user is `{"initial":"todo","finished":["shipped","archived"],"done":"shipped","new":["todo"],"critical_priority":0,"reopen":"end"}`\n  And an item "P" exists\nWhen I run `backlog done 1`\nThen item 1 has status "shipped"\n  And the queue is empty')],
 [('user-flow.test.js','Q-01 option A: config words drive list/archive/done/next','config fixture','results'),('user-flow.test.js','Q-01 option A: missing key fails with the setup text','no key','exit 2')],F,cond='Q-01')
R('REQ-909','User claim, release and close','PH-10',['PC-STEP'],
 'CONDITIONAL on Q-02. Option A (recommended): user `--claim/--release/--close` stay as field writers that refuse nothing but syntax: claim sets owner fields and the status to the convention\'s `in progress`-like word only if Q-01 defines one (else leaves status), release clears them, close requires `--summary` (data) and sets the `done` word. Option B: remove the three flags from user `update` (unknown option, exit 2); claiming is team behaviour. Option C: keep today\'s rules (contradicts the principle; listed for completeness).',
 'User claim refuses another holder and finished items — flow rules in the user-command code.',
 ['A: `--claim bob` after `--claim alice` succeeds and records bob.','B: exit 2 unrecognized arguments.'],
 [('A: a user claim refuses nothing','Given a repository with a backlog\n  And an item "P" exists\n  And I run `backlog update 1 --claim alice`\nWhen I run `backlog update 1 --claim bob`\nThen the command succeeds\n  And item 1 has owner "bob"')],
 [('user-flow.test.js','Q-02 option A/B behaviour','user items','results')],F,cond='Q-02')
R('REQ-910','User limits and dependency gate','PH-6',['PC-WIP','PC-DEPGATE'],
 'CONDITIONAL on Q-03. Option A (recommended, principle): user claim, `update --status`, `move` and the publication recheck apply no limit and no dependency gate; `list wip` is not provided; limits exist only in team entries. Option B (decision AM): keep overall/repository/branch limits and the dependency gate for user items, read from a user file `<home>/wip-limits.json` documented as user configuration, and add `backlog list wip` (S103).',
 'AM kept them shared; the principle says user enforces nothing.',
 ['A: a user claim past wip-limits.json succeeds; B: refused with today\'s text.'],
 [('A: no limit applies to user items','Given a repository with a backlog\n  And the file "wip-limits.json" of the backlog home is `{"overall":0}`\n  And an item "P" exists\nWhen I run `backlog update 1 --status "in progress"`\nThen the command succeeds')],
 [('user-flow.test.js','Q-03 option A/B','wip fixture','results')],F,cond='Q-03')
R('REQ-911','Session inputs','PH-2',['ENV-INPUT'],
 'CONDITIONAL on Q-04. Option A (recommended): `TEAM_NAME`, `TEAM_REPOSITORY`, `TEAM_BRANCH`, `BACKLOG_AGENT`, `BACKLOG_SESSION` stay documented session inputs (identity and scope only; what is enforced comes from the file). Option B: flags only (`--team`, `--agent`, new `--session`, `--scope-repository`, `--scope-branch` on every team command); the variables are not read.',
 'The owner rule of 2026-11-07 forbids environment overrides of the configuration; these variables are inputs of the session, not configuration.',
 ['A: unchanged consumers. B: consumers pass flags; a set variable has no effect (test).'],
 [('A: the session scope comes from the environment','See S-207-1')],
 [('engine-roles.test.js','Q-04 option A/B input resolution','env/flags','inputs')],'team-roles',cond='Q-04')
R('REQ-912','Keys the old definition declared but nothing enforced','PH-5',['RF-STEPS','RF-DECISION'],
 'CONDITIONAL on Q-05. Option A (recommended): not carried into schema 2 (D-15); behaviour unchanged. Option B: schema 2 adds `steps.<s>.max_rounds` + `after_max_rounds` (a step name run automatically, refusal `max_rounds_reached`), side status `blocks: [steps]` and `blocks_dependents`, and the queue predicate `older_than {field, seconds}`; the template sets refinement-review max 3 → request-decision, external review max 3 → lead reviews, review offers older than 300 s first.',
 'F2: keys promised behaviour that never existed.',
 ['A: template has none of the keys. B: each key has scenarios (written when answered: S-912-B1..B4 in features/user-flow.feature).'],
 [('A: a fourth refinement rejection is accepted','Given a repository with a backlog\n  And the backlog registers the workflow "team" from the template "team.full.json"\n  And a team "t1" with lead "lead" and members "ann" using the workflow "team"\n  And the environment TEAM_NAME is "t1"\n  And an item "W" exists\n  And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann","refinement_reviews":["a reject x: 1","b reject x: 2","c reject x: 3"]}`\n  And I act as agent "rex"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --refinement-review reject --comments again`\nThen item 1 has status "refining"')],
 [('engine-steps.test.js','Q-05 option A: no max_rounds key accepted (V-schema)','patched','not a key')],F,cond='Q-05')
