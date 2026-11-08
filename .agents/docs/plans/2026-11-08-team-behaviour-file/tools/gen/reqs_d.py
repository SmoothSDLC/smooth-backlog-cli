from base import *
F='team-claims-handoffs'
W=BG_TEAM+'\n  And the environment TEAM_NAME is "t1"\n  And an item "Work" exists\n'
READY='{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}'
R('REQ-301','Conditions: shape, when, unless, force, order','PH-3',['STEP-ACTIVE'],
 'A condition has one test key and the attributes of §5.1; `when`/`unless` filter it, `force: bypasses` skips it under `--force`, `order` places it (§6).',
 'Generic machinery for every rule that today is an if-statement.',
 ['`--force` passes the active-item rule and never a limit (template).'],
 [('--force passes the one-active-item rule',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`\n  And an item "Next" exists\n  And item 2 has the front-matter fields `'+READY+'`\n  And item 2 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 2\nWhen I run `backlog team update 2 --team t1 --claim ann --force`\nThen the command succeeds'),
  ('without --force the active item blocks',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`\n  And an item "Next" exists\n  And item 2 has the front-matter fields `'+READY+'`\n  And item 2 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 2\nWhen I run `backlog team update 2 --team t1 --claim ann`\nThen the command fails with exit code 1\n  And the output contains "ann holds 1 active item(s): 001-work"')],
 [('engine-conditions.test.js','when/unless/force/order/exact on a synthetic condition','unit','pass/skip'),('engine-validate.test.js','V-24 exactly one test key; missing refusal','patched','texts')],F)
R('REQ-302','Field conditions','PH-3',['STEP-CLAIM','STEP-RELEASE'],
 'Field tests of §5.2 used as conditions (`field_empty`, `field_present`, `field_exists`, `field_absent`, `field_is_actor`, `field_empty_or_actor`, `field_equals_flag_value`).',
 'Holder, refiner and reviewer rules are field tests.',
 ['Each test has a pass and a fail case.'],
 [('a claim of an item held by another',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","claimed_at":"2026-11-08T10:00:00Z","refiner":""}`\n  And I act as agent "bob"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim bob`\nThen the command fails with exit code 1\n  And the output contains "claimed by ann since 2026-11-08T10:00:00Z; message ann or pick another item"')],
 [('engine-conditions.test.js','field tests pass/fail','unit','booleans')],F)
R('REQ-303','The claim step of the template','PH-3',['STEP-CLAIM','STEP-ACTIVE'],
 'The template\'s `steps.claim` reproduces R07 (order and texts of today).',
 'Conformance of the most used step.',
 ['The 12 claim tests of today pass as conformance tests.'],
 [('the lead claims the team work item',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"new","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`\n  And item 1 has a definition of done in its body\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim lead`\nThen the command succeeds\n  And item 1 has status "in progress"'),
  ('the lead never claims a slice',W+'  And item 1 has the front-matter fields `'+READY+'`\n  And item 1 has a definition of done in its body\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim lead`\nThen the command fails with exit code 1\n  And the output contains "the team lead (lead) never claims an item of its team\'s split"'),
  ('a finished item is not claimed',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"closed","refiner":""}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --claim ann`\nThen the command fails with exit code 1\n  And the output contains "status is closed; a finished item cannot be claimed"')],
 [('engine-conformance.test.js','claim: today\'s claim tests over the template','shared-team-lifecycle, shared-unrefined-claim, shared-session-continue','same results')],F)
R('REQ-304','Release, waiting, waiting-done, reassign','PH-3',['STEP-RELEASE','STEP-WAIT','STEP-REASSIGN'],
 'The template steps reproduce R08, R09 and R14 (reassign).',
 'Each was a code function.',
 ['Texts verbatim; reassign text without TEAM_LEAD (D-09).'],
 [('waiting by someone else',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --waiting ci --by bob`\nThen the command fails with exit code 1\n  And the output contains "--waiting needs --by <the agent holding it> (claimed by ann)"'),
  ('reassign by the lead',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --reassign bob --reason "ann away"`\nThen the command succeeds\n  And item 1 has claimed_by "bob"')],
 [('engine-conformance.test.js','release/waiting/reassign tests over the template','shared-team-work, shared-team-lifecycle','same results')],F)
R('REQ-305','Waiting cleared by the next step','PH-3',['STEP-WAIT'],
 'A set wait field is cleared, with `waiting.record` appended, after a step in `waiting.cleared_by_steps` or a note (`cleared_by_note`).',
 'Today code in team/update.js `after`.',
 ['Note on a waiting item clears it (today\'s test).'],
 [('a note ends the wait',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":"","wait_on":"ci"}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --note "ci green"`\nThen item 1 has wait_on ""\n  And item 1 body contains "WAIT DONE"')],
 [('engine-steps.test.js','cleared_by_steps and cleared_by_note','fixtures','field and record')],F)
R('REQ-306','Recheck at publication','PH-3',['STEP-RECHECK','DI-PUBLISH-HOOK'],
 'Conditions in `recheck_at_publication` are evaluated against the merged files during publication; a failure rolls back (exit 3, the publication text naming the refusal).',
 'A claim depends on other files that may change concurrently.',
 ['Two racing claims past a limit: the second is rolled back (existing concurrency test, re-pointed).'],
 [('a concurrent start past a limit is rolled back','Covered by the existing race test of shared-update.test.js (re-pointed to the template)')],
 [('engine-conformance.test.js','publication recheck: dependencies, limit, active item','race fixture','rollback text')],F)
R('REQ-307','Hand-off record step','PH-3',['HO-RECORD','DI-HANDOFF-FORMAT'],
 'A step with `effect: handoff_record` builds the record (format DATA-INTEGRITY) after its conditions and arguments pass; the template reproduces R10 (record).',
 'Who records, when and with which arguments is team behaviour; the record format is not.',
 ['Contract/verification required by the file; commit format by the machinery (40-hex text unchanged).'],
 [('a hand-off by someone other than the claimer',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`\n  And an item "Dep" exists\n  And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","depends_on":[1]}`\n  And I act as agent "bob"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --handoff 2 --handoff-commit 0123456789012345678901234567890123456789 --handoff-contract c --handoff-verification v --by bob`\nThen the command fails with exit code 1\n  And the output contains "a hand-off is recorded by the claimer: the item is claimed by ann, not by bob"')],
 [('engine-conformance.test.js','hand-off command tests over the template','shared-handoff-commands, shared-handoff-e2e','same results'),('engine-validate.test.js','V-27 effect only on hand-off steps','patched','text')],F)
R('REQ-308','Accept and reject a hand-off','PH-3',['HO-RECEIPT'],
 'Template `accept-handoff`/`reject-handoff` reproduce R10 (receipts), with the text change `status <status>` (D-09).',
 'Lead-only receipt is a team rule.',
 ['A member accepting is refused with today\'s text.'],
 [('a member cannot accept a hand-off',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","refiner":""}`\n  And I act as agent "bob"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --accept-handoff 2 --checks ok --by bob`\nThen the command fails with exit code 1\n  And the output contains "a hand-off is accepted by the team lead (lead), not by bob"')],
 [('engine-conformance.test.js','accept/reject tests over the template','shared-handoff-commands','same results')],F)
R('REQ-309','The close gate','PH-3',['HO-GATE','HO-EDGE','HO-TEXTS','DI-HANDOFF-GRAPH'],
 'Condition `dependents_handoffs_accepted` refuses the close while a dependent edge is open (`close_gate` with every edge and its next command, `close_gate_missing_hint` when one is missing) and records `handoffs: none` plus `close_gate_none_record` when there is no dependent.',
 'Today handoff-close.js and runCloseGate are code.',
 ['Texts verbatim; the NONE record line.'],
 [('close refused while a dependent edge is open',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","refiner":""}`\n  And an item "Dep" exists\n  And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","depends_on":[1]}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --close --summary done`\nThen the command fails with exit code 1\n  And the output contains "close refused for 001-work: 2 edge missing"'),
  ('a close without dependents records NONE',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","refiner":""}`\n  And team "t1" has the entry key review set to `[]`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --close --summary done`\nThen the command succeeds\n  And item 1 body contains "DEPENDENCY_HANDOFF: NONE"')],
 [('engine-conformance.test.js','close gate tests over the template','shared-handoff-gate, shared-handoff-close','same results')],F)
