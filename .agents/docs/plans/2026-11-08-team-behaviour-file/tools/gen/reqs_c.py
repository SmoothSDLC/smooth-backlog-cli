from base import *
F='team-roles'
W=BG_TEAM+'\n  And the environment TEAM_NAME is "t1"\n  And an item "Work" exists\n'
R('REQ-201','Roles from sources','PH-2',['RO-MEMBERS','RO-AUTHOR'],
 'Every role used in a definition is defined in `roles` by one source of §5.4; the enforcer resolves an actor\'s roles from the item, the team entry and the entries of other teams named by rules.',
 'Today membership, lead, external reviewers and authorship are code over `teams.json`.',
 ['Each source kind has a test; `union` cycles are refused (V-10).'],
 [('a role from another team decides the refinement reviewer',W+'  And a team "reviewers" with lead "rex" and members "ria" using the workflow "team"\n  And team "t1" has the entry key refinement_review set to `[{"team":"reviewers","count":1}]`\n  And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann"}`\n  And I act as agent "bob"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --refinement-review complete --comments ok`\nThen the command fails with exit code 1\n  And the output contains "is reviewed by a member of reviewers"')],
 [('engine-roles.test.js','each role source resolves','entry fixtures','role sets'),('engine-roles.test.js','entry_rule_teams with when_empty anyone','no rules','anyone'),('engine-validate.test.js','V-09, V-10','patched','texts')],F)
R('REQ-202','by and not_by','PH-2',['ST-CANSTEP'],
 'The actor must hold a role of `by` (else `by_refusal`/`wrong_actor` with `<who>`), and none of `not_by` (else `not_by_refusal`/`wrong_actor`).',
 'Today only the external stage checks its actor; the rest is scattered code.',
 ['External stage review by a member refused; self review refused with today\'s text.'],
 [('an external stage review by a member',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready for external review","claimed_by":"bob","review_author":"bob","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`\n  And team "t1" has the entry key external_reviewers set to `["xia"]`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --start-review`\nThen the command fails with exit code 1\n  And the output contains "start-review on 001-work is for external, not ann"'),
  ('the author cannot review',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","refiner":""}`\n  And I act as agent "bob"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --start-review`\nThen the command fails with exit code 1\n  And the output contains "bob: the same session cannot review its own work"')],
 [('engine-roles.test.js','by/not_by with refusal keys and wrong_actor default','fixtures','texts')],F)
R('REQ-203','The actor of a step','PH-2',['RO-ACTSAS'],
 'The actor is resolved by the step\'s `actor` (§4.6).',
 'Today the ACTS_AS map is code.',
 ['Release by the lead for another holder uses the explicit --by; claim uses the flag value.'],
 [('the lead releases a member\'s item with a reason',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --release ann --by lead --reason "ann is away"`\nThen the command succeeds\n  And item 1 body contains "Released by lead for ann"')],
 [('engine-roles.test.js','each actor mode','fixtures','actor')],F)
R('REQ-204','A caller acts only as itself','PH-2',['RO-CALLER'],
 'With `identity.caller_acts_only_as_itself`, a known caller (Q-04) without an excepted role may not act as another agent: `caller_not_actor`. Applies to `team update` and `team pop` (`pop_caller`).',
 'Today a code rule tied to TEAM_NAME being set.',
 ['A member naming another agent is refused; the lead is not.'],
 [('a member acts only as itself',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`\n  And item 1 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim bob`\nThen the command fails with exit code 1\n  And the output contains "you are ann (BACKLOG_AGENT): a member acts only as itself, not as bob"')],
 [('engine-roles.test.js','caller check with except_roles; false disables it','fixtures','texts')],F)
R('REQ-205','Same worker (session continuation)','PH-2',['RO-SAMEWORKER'],
 '`identity.same_worker_pattern` makes two names the same worker when both match and their first groups are equal; actor comparisons use it unless `exact: true`.',
 'Today `sameWorker` is a code regex.',
 ['`member-a:2` continues an item held by `member-a:1`; without the key it is refused.'],
 [('a new session of the same worker continues its item',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann:1","refiner":""}`\n  And team "t1" has the entry key members set to `["ann:1","ann:2","bob"]`\n  And I act as agent "ann:2"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim ann:2`\nThen the command succeeds')],
 [('engine-roles.test.js','same worker with and without the key; exact','fixtures','allow/refuse')],F)
R('REQ-206','The lead comes only from the team entry','PH-2',['ENV-LEAD'],
 'Role sources are the only way to name the lead; `TEAM_LEAD` is not read and `--lead` is removed from `team pop` and `team query --plan` (an unknown option, exit 2). Texts no longer name TEAM_LEAD (D-09).',
 'F6: the environment and a flag overrode the file.',
 ['TEAM_LEAD set to a member changes nothing.','`team pop --lead x` exit 2 unrecognized arguments.'],
 [('TEAM_LEAD is not read',W+'  And the environment TEAM_LEAD is "ann"\n  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"bob","refiner":""}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --reassign ann --reason r`\nThen the command fails with exit code 1\n  And the output contains "only the lead (lead) gives one agent\'s item to another"'),
  ('--lead is no option of team pop',BG_TEAM+'\nWhen I run `backlog team pop --team t1 --agent ann --lead ann`\nThen the command fails with exit code 2\n  And the output contains "unrecognized arguments: --lead"')],
 [('engine-roles.test.js','TEAM_LEAD ignored','env','entry lead'),('team-cli.test.js','--lead removed from pop and query --plan','argv','exit 2'),('user-guard.test.js','no TEAM_LEAD read in src','grep','none')],F)
R('REQ-207','Session scope and session team','PH-2',['SC-SCOPE','SC-INTEAM','SC-BRANCHBOUND'],
 'With `scope.bind_session`, a session bound to a repository (and branch) (Q-04 inputs) refuses items outside (`outside_scope`) for every write, `team new --split-from`, `update --replan` in a bound session, and `team pop --branch` other than the bound one (`session_branch`). With `scope.session_team_only` an item of another team is refused (`other_team`).',
 'Today these are code rules tied to environment variables.',
 ['Template reproduces today\'s texts.','Definition with `bind_session: false` ignores the session scope.'],
 [('an item of another branch is outside the session',W+'  And the environment TEAM_REPOSITORY is "this repository"\n  And the environment TEAM_BRANCH is "other"\n  And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","branch":"main"}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim ann`\nThen the command fails with exit code 1\n  And the output contains "but this team session is bound to"')],
 [('engine-roles.test.js','bind_session on/off','fixtures','texts'),('engine-roles.test.js','session_branch for pop','fixture','text')],F)
R('REQ-208','Items of another repository','PH-8',['SC-INTEAM','Q-ROWS'],
 '`scope.foreign_items: chunk_only` offers another repository\'s items only when chunk work; `none` never.',
 'Today `offeredTo` is code.',
 ['Template: a chunk item of another repository is offered with scope all; a user one is not.'],
 [('another repository offers only chunk work','See features/team-queue.feature S-806-1 (same setup)')],
 [('engine-queue.test.js','foreign_items chunk_only/none','two folders','offers')],F)
R('REQ-209','Team entry names','PH-0',['RO-MEMBERS','DEF-TEAM'],
 'Entry keys `lead`, `members`, `review_only`, `external_reviewers` are validated by the schema and E-02/E-03; they feed the role sources only.',
 'Names belong to the entry, rules to the definition.',
 ['E-02, E-03 texts.'],
 [('the lead cannot be a member','Given a repository with a backlog\n  And the backlog registers the workflow "team" from the template "team.full.json"\n  And the file "teams.json" of the backlog home is `{"schema":"backlog-teams/2","teams":{"t1":{"workflow":"team","lead":"ann","members":["ann"]}}}`\nWhen I run `backlog team validate`\nThen the command fails with exit code 2\n  And the output contains "teams.t1.lead: the lead is not one of the members"')],
 [('engine-validate.test.js','E-02, E-03','patched','texts')],F)
