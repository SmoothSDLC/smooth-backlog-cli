from base import *
W=BG_TEAM+'\n  And the environment TEAM_NAME is "t1"\n  And an item "Work" exists\n'
FULL='"refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5'
F='team-limits'
R('REQ-601','Limit numbers in the team entry','PH-6',['CFG-WIPFILE','WIP-LEVELS'],
 'The numbers per level come from the entry\'s `limits` (§4.8); a level without a number has no limit; `wip-limits.json` is not read (migrated, REQ-011).',
 'F3: the entry\'s `wip` was never read; the numbers belong to the team.',
 ['A team limit of 1 refuses the second start; no limits: no refusal.'],
 [('the team limit refuses a second start',W+'  And team "t1" has the entry key limits set to `{"team":1}`\n  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"bob",'+FULL+'}`\n  And an item "Second" exists\n  And item 2 has the front-matter fields `{"team":"t1","status":"ready",'+FULL+'}`\n  And item 2 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 2\nWhen I run `backlog team update 2 --team t1 --claim ann`\nThen the command fails with exit code 1\n  And the output contains "the team work-in-progress limit of t1 is 1 and 1 item(s) are in progress"'),
  ('wip-limits.json is not read',W+'  And the file "wip-limits.json" of the backlog home is `{"team":0}`\n  And item 1 has the front-matter fields `{"team":"t1","status":"ready",'+FULL+'}`\n  And item 1 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim ann`\nThen the command succeeds')],
 [('engine-limits.test.js','numbers per level, map with default and key','entry fixtures','limit'),('engine-limits.test.js','wip-limits.json ignored','file present','no effect')],F)
R('REQ-602','What counts and whose it is','PH-6',['WIP-ACTIVE'],
 '`limits.active_item` and `limits.holder` decide counting; `count_scope` home or team.',
 'Code today (inProgress, alsoActive, holderOf).',
 ['A refining item with a refiner counts against the member level.'],
 [('a refinement counts as work in progress',W+'  And team "t1" has the entry key limits set to `{"member":1}`\n  And item 1 has the front-matter fields `{"team":"t1","status":"refining","refiner":"ann"}`\n  And an item "Second" exists\n  And item 2 has the front-matter fields `{"team":"t1","status":"ready",'+FULL+'}`\n  And item 2 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 2\nWhen I run `backlog team update 2 --team t1 --claim ann --force`\nThen the command fails with exit code 1\n  And the output contains "the member work-in-progress limit of ann is 1"')],
 [('engine-limits.test.js','active_item and holder over a home with 3 folders','fixture home','counts'),('engine-limits.test.js','count_scope team excludes other teams and user items','fixture','counts')],F)
R('REQ-603','within_limits evaluation and text','PH-6',['WIP-LEVELS'],
 'Condition `within_limits` per §5.1; text `limit` with up to 8 holders.',
 'Code today.',
 ['Texts verbatim (level names: `member` replaces `agent`, D-09 list).'],
 [('the refusal lists the holders','See S-601-1')],
 [('engine-limits.test.js','text with 9 holders ends with ", ..."','fixture','text')],F)
R('REQ-604','The override','PH-6',['WIP-OVERRIDE'],
 '`limits.override` lifts the listed levels when the field is set; template `wip-override` (lead, reason, combinable) writes it.',
 'Code today (fieldsBefore).',
 ['The lead\'s override with a claim in one call passes the team limit.'],
 [('the lead lifts the team limit for one item',W+'  And team "t1" has the entry key limits set to `{"team":1}`\n  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"bob",'+FULL+'}`\n  And an item "Second" exists\n  And item 2 has the front-matter fields `{"team":"t1","status":"ready",'+FULL+'}`\n  And item 2 has a definition of done in its body\n  And I act as agent "lead"\n  And I have read item 2\n  And I run `backlog team update 2 --team t1 --wip-override "urgent fix"`\n  And I act as agent "ann"\n  And I have read item 2\nWhen I run `backlog team update 2 --team t1 --claim ann`\nThen the command succeeds'),
  ('a member cannot override',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready",'+FULL+'}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --wip-override x`\nThen the command fails with exit code 1\n  And the output contains "only the team lead (lead) lifts the team and agent work-in-progress limits"')],
 [('engine-limits.test.js','override lifts only listed levels','fixture','pass/fail')],F)
R('REQ-605','The wip view','PH-6',['WIP-VIEW'],
 '`team query --wip` counts per level from the entry numbers and lists items older than `views.wip.stale_hours`.',
 'Code today with stale_hours from wip-limits.json.',
 ['Output format unchanged except the limits file line names teams.json.'],
 [('the wip view shows the team level',W+'  And team "t1" has the entry key limits set to `{"team":4}`\nWhen I run `backlog team query --team t1 --wip`\nThen the command succeeds\n  And the output contains "team"')],
 [('engine-limits.test.js','wip view rows and stale list','fixture home','rows')],F)
F='team-creation-dependencies'
R('REQ-701','Dependencies finished','PH-7',['DEP-FINISHED','HO-EDGE'],
 'Predicate/condition `dependencies_finished` with `handoff_states` (§5.2): finished per the target\'s own definition; a target outside a team per the default words of the user commands (D-33).',
 'Code today with the shipped finished words.',
 ['A closed producer without an accepted hand-off blocks (template); with `handoff_states: null` it does not.'],
 [('an unaccepted hand-off blocks the claim',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"closed","refiner":"","handoffs":"none"}`\n  And an item "Dep" exists\n  And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[1],"estimate_min":5}`\n  And item 2 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 2\nWhen I run `backlog team update 2 --team t1 --claim ann`\nThen the command fails with exit code 1\n  And the output contains "dependencies not done: 001-work (done, hand-off missing"')],
 [('engine-conditions.test.js','dependencies_finished: states, null, foreign, unbound target','fixtures','pass/fail'),('engine-conformance.test.js','dependency tests','shared-foreign-deps, shared-handoff-gate','same results')],F)
R('REQ-702','Creation (team new)','PH-5',['CR-TEAMNEW','CR-DOD','PC-NEWKEYS','PC-SEVERITY'],
 '`team new` writes the user fields, `team` = the command team, `status` = `initial`, `create.sets`, appends `create.missing_section` when the body lacks the section, asks `create.ask` labels with `--ask`, places by `create.priority_by_severity`; `--status` refused (`create_status_flag`).',
 'Today split between team/new.js and user new (which writes team keys on every item).',
 ['Output and files equal today\'s team new (conformance).'],
 [('a team item starts with the initial word and the placeholder',BG_TEAM+'\n  And I act as agent "lead"\nWhen I run `backlog team new --team t1 --name "Child" --objective o --summary s`\nThen item 1 has status "new"\n  And item 1 has refiner ""\n  And item 1 body contains "## Definition of done"'),
  ('team new refuses --status',BG_TEAM+'\n  And I act as agent "lead"\nWhen I run `backlog team new --team t1 --name "Child" --status ready`\nThen the command fails with exit code 1\n  And the output contains "--status cannot be combined with --team"')],
 [('engine-conformance.test.js','team new tests','shared-new (team cases), new-ask','same results'),('engine-steps.test.js','create.priority_by_severity','fixture','rank')],F)
R('REQ-703','Binding an item (set-team)','PH-9',['WIP-SETTEAM','BIND-UNBOUND'],
 'Template `set-team` binds an unbound item (status → initial, D-07), refuses an unconfigured team (D-08), keeps a team on an item with a refiner key (unbinding refused), and admits active work only within the target team\'s limit.',
 'Code today; binding left the user word.',
 ['team.feature background (user new then --set-team) leaves status new.'],
 [('binding a user item sets the initial word',BG_TEAM+'\n  And an item "User" exists\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --set-team t1`\nThen item 1 has status "new"\n  And item 1 has team "t1"'),
  ('binding to an unknown team is refused',BG_TEAM+'\n  And an item "User" exists\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --set-team ghost`\nThen the command fails with exit code 1\n  And the output contains "team ghost is not configured"')],
 [('engine-binding.test.js','set-team bind/unbind/limit/unknown','fixtures','texts and fields')],F)
R('REQ-704','Dependency integrity stays generic','-',['DI-REF'],
 'Existence, cycle, seq-uniqueness and stranded-dependent checks of `new`, `update --set-depends-on`, `move` and the publication stay as they are, for every item (decision AM).',
 'DATA-INTEGRITY.',
 ['Existing tests unchanged.'],
 [('a dependency on an unknown item is refused','Given a repository with a backlog\n  And an item "A" exists\nWhen I run `backlog update 1 --set-depends-on 99`\nThen the command fails with exit code 1\n  And the output contains "no item \'99\' in this backlog"')],
 [('shared-update.test.js','dependency integrity (kept)','existing','unchanged')],F)
F='team-queue'
R('REQ-801','Predicate evaluator','PH-8',['Q-POP','Q-VIEWS'],
 'One evaluator implements §5.2 for conditions, offers, plan passes, views and limits.',
 'Today each reader has its own filters.',
 ['Every predicate key has a unit test.'],
 [('predicates are covered by unit tests','No scenario: see T-801-1')],
 [('engine-conditions.test.js','every predicate key true/false','unit','booleans')],F)
R('REQ-802','team pop from queue.roles','PH-8',['Q-POP','Q-REVIEWONLY','RF-HOWTEXT','DI-CONCURRENCY'],
 '`team pop` answers by §4.7 `queue.roles` (lead offers before member offers for the lead), marks by running the step, prints the action, instruction and item; idle exit 3 (D-16).',
 'queue.js holds the order in code.',
 ['The 34 pop tests of today pass over the template (conformance).'],
 [('a member is offered the ready item',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready",'+FULL+',"branch":"main"}`\n  And item 1 has a definition of done in its body\nWhen I run `backlog team pop --team t1 --agent ann --dry-run --json`\nThen the output contains "\\"action\\": \\"claim\\""'),
  ('nothing to do is idle with exit 3',BG_TEAM+'\nWhen I run `backlog team pop --team t1 --agent ann --dry-run`\nThen the command fails with exit code 3')],
 [('engine-conformance.test.js','pop tests over the template','shared-team-pop, shared-team-lead-pop','same results'),('engine-queue.test.js','offers order, preempts, when_actor, busy','synthetic queue','answers')],F)
R('REQ-803','The lead\'s work item','PH-8',['Q-LEADWORK'],
 'The template lead offers claim the team\'s work item (no refiner key, new, complete, dependencies finished) and continue it; a busy team makes the lead idle (`lead_busy`).',
 'pop.js workItem is code.',
 ['team.feature "the lead takes its team\'s work item" re-pointed.'],
 [('the lead takes the work item with team pop',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"new","review_refs":["d.md"],"depends_on":[],"estimate_min":5,"branch":"main"}`\n  And item 1 has a definition of done in its body\nWhen I run `backlog team pop --team t1 --agent lead`\nThen the command succeeds\n  And item 1 has claimed_by "lead"')],
 [('engine-conformance.test.js','lead pop tests','shared-team-lead-pop','same results')],F)
R('REQ-804','team query --plan from queue.plan','PH-8',['Q-PLAN','Q-REVIEWONLY'],
 'Plan passes in order with the assignment strategies of §4.7; the JSON keys stay (D-16); the dispatcher\'s action names come from the template.',
 'queue.js plan() is code.',
 ['The 10 plan tests pass over the template.'],
 [('the plan gives a claim to a free member',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready",'+FULL+',"branch":"main"}`\n  And item 1 has a definition of done in its body\nWhen I run `backlog team query --team t1 --agent lead --plan --json`\nThen the output contains "\\"action\\": \\"claim\\""')],
 [('engine-conformance.test.js','plan tests','shared-team-plan','same results'),('engine-queue.test.js','assignment strategies','synthetic','assignments')],F)
R('REQ-805','Team views','PH-8',['Q-VIEWS'],
 '`team query --claimable|--reviewable|--blocked|--decisions` list the command team\'s bound items in scope matching `views.<v>`; an undefined view: `view <v> is not defined by workflow <w>` exit 2.',
 'views.js is code.',
 ['Output formats unchanged.'],
 [('the decisions view',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"awaiting decision","decision_question":"which?","branch":"main"}`\nWhen I run `backlog team query --team t1 --decisions`\nThen the output contains "which?"')],
 [('engine-conformance.test.js','view tests','shared-team-scope, shared-query (team views)','same results')],F)
R('REQ-806','Chunk scope in the entry','PH-8',['CFG-SCOPEFILE','Q-ROWS'],
 'The entry\'s `chunk_scope` caps chunk offers and view scope; `backlog.scope` is not read (migrated).',
 'A per-folder file decided a team behaviour.',
 ['`chunk_scope: off` offers no chunk item.'],
 [('chunk scope off offers no chunk work',W+'  And team "t1" has the entry key chunk_scope set to `"off"`\n  And item 1 has the front-matter fields `{"team":"t1","status":"ready","chunk":true,'+FULL+',"branch":"main"}`\n  And item 1 has a definition of done in its body\nWhen I run `backlog team pop --team t1 --agent ann --dry-run --json`\nThen the output does not contain "\\"action\\": \\"chunk\\""')],
 [('engine-queue.test.js','chunk_scope caps','fixtures','offers')],F)
