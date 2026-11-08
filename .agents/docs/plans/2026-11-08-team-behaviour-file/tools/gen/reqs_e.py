from base import *
W=BG_TEAM+'\n  And the environment TEAM_NAME is "t1"\n  And an item "Work" exists\n'
FULL='"refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5'
F='team-review'
R('REQ-401','Review stages','PH-4',['ST-VOCAB','ST-NEXT'],
 '`review.stages_order`, `review.stages.<st>` (ready, active, reviewers, default_count) and `review.after_last_stage` define the stages; the entry\'s `review` list selects which apply (a stage not listed is skipped).',
 'Today READY, STAGE_OF and next() are code over the shipped file.',
 ['A team with `review: []` goes from request-review straight to review complete; with only external, to ready for external review.'],
 [('a team without review stages',W+'  And team "t1" has the entry key review set to `[]`\n  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann",'+FULL+'}`\n  And item 1 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --request-review any --note c`\nThen item 1 has status "review complete"'),
  ('a team with only the external stage',W+'  And team "t1" has the entry key review set to `[{"stage":"external","count":1}]`\n  And team "t1" has the entry key external_reviewers set to `["xia"]`\n  And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann",'+FULL+'}`\n  And item 1 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --request-review any --note c`\nThen item 1 has status "ready for external review"')],
 [('engine-review.test.js','stage selection and skipping','entry variants','words'),('engine-validate.test.js','V-13, V-18','patched','texts')],F)
R('REQ-402','Entry review rules and defaults','PH-4',['ST-STAGERULES','ST-ELIGIBLE'],
 'An entry rule `{stage, count, team?}` needs `count` distinct eligible passes on the current work commit; eligible = the stage\'s `reviewers` role, or the members and lead of `team` when given. `team define` writes `defaults.review` into an entry without `review`.',
 'Today stageRules/eligible are code (and the `{team,count}` positional form).',
 ['Two passes by members of another team close the item (team.feature scenario re-pointed).'],
 [('a rule naming another team counts only its members',W+'  And a team "reviewers" with lead "rex" and members "ria" using the workflow "team"\n  And team "t1" has the entry key review set to `[{"stage":"peer","count":1,"team":"reviewers"}]`\n  And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","work_commit":"abc",'+FULL+'}`\n  And item 1 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --review complete --comments "d.md ok"`\nThen item 1 has status "ready for review"')],
 [('engine-review.test.js','count, team rule, distinct reviewers, work commit','fixtures','passes'),('team-validate-cli.test.js','define writes defaults.review','-','entry')],F)
R('REQ-403','Request review','PH-4',['RV-REQUEST'],
 'Template `request-review` reproduces R11.',
 'Code function today.',
 ['Work commit set from HEAD unless covered; unclaimed item needs no holder.'],
 [('a review request while reviewed is refused',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"reviewing","claimed_by":"ann","reviewer":"bob","review_started":"2026-11-08T10:00:00Z",'+FULL+'}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --request-review any --note c`\nThen the command fails with exit code 1\n  And the output contains "bob is reviewing it since 2026-11-08T10:00:00Z: wait for the verdict"')],
 [('engine-conformance.test.js','request-review tests over the template','shared-team-stages, shared-twostage','same results'),('engine-steps.test.js','head_unless_covered','git fixture','work_commit')],F)
R('REQ-404','Start review, verdicts, passes, history','PH-4',['RV-START','RV-REVIEW','RV-VERDICTS','RV-HISTORY','ST-ELIGIBLE'],
 'Template `start-review` and `review` reproduce R12: verdict words, pass records `<reviewer> <work_commit>`, reject clears passes and returns to in progress, history line.',
 'Code today.',
 ['A reject at each stage returns to in progress with the finding (team-flow.feature re-pointed).'],
 [('a reject sends the item back to work',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","work_commit":"abc",'+FULL+'}`\n  And item 1 has a definition of done in its body\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --review changes --comments "d.md: fix it"`\nThen item 1 has status "in progress"\n  And item 1 has reviews ""'),
  ('an unknown verdict is invalid input',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob",'+FULL+'}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --review maybe --comments x`\nThen the command fails with exit code 2\n  And the output contains "invalid choice: \'maybe\'"')],
 [('engine-conformance.test.js','review tests over the template','shared-session-review, shared-team-flow','same results'),('engine-review.test.js','verdict_words, reject_clears_passes','patched','fields')],F)
R('REQ-405','Review rules at the close','PH-4',['RV-RULES'],
 'Conditions `review_passes_met` and `no_later_own_work` with the fixed text keys of §5.1.',
 'Code today (reviewRefusal, laterOwnWork, leadingItemIds).',
 ['Texts verbatim; a failed git lookup fails closed.'],
 [('a close before the passes',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","work_commit":"abc",'+FULL+'}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --close --summary done`\nThen the command fails with exit code 1\n  And the output contains "review rule not met - 1 pass(es) by members of the team on the current work commit needed, 0 recorded"')],
 [('engine-review.test.js','review_passes_met texts per rule kind','fixtures','texts'),('engine-review.test.js','no_later_own_work with subject pattern, lookup failure','git fixture','texts')],F)
R('REQ-406','Author session and citation','PH-4',['RV-REVIEW','RO-AUTHOR'],
 'Condition `not_caller_session_of: author_session` and argument `cites_field: review_refs`.',
 'Code today.',
 ['Review in the author session refused with today\'s text.'],
 [('a review in the author session',W+'  And the environment BACKLOG_SESSION is "s9"\n  And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","author_session":"s9",'+FULL+'}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --review complete --comments "d.md ok"`\nThen the command fails with exit code 1\n  And the output contains "ann reviews in the author session"')],
 [('engine-review.test.js','not_caller_session_of','env fixtures','pass/fail')],F)
R('REQ-407','Stale reviews and reassign-review','PH-4',['RV-REASSIGN','RV-STALE','ENV-STALE'],
 '`review.stale_after_seconds` (not the environment) decides staleness; template `reassign-review` reproduces R14.',
 'F5: env override.',
 ['BACKLOG_REVIEW_STALE_SECONDS is ignored.'],
 [('the stale time comes from the file','Given a repository with a backlog\n  And the backlog registers the workflow "team" from the template "team.full.json" with `review.stale_after_seconds = 1`\n  And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"\n  And the environment TEAM_NAME is "t1"\n  And the environment BACKLOG_REVIEW_STALE_SECONDS is "999999"\n  And an item "Work" exists\n  And item 1 has the front-matter fields `{"team":"t1","status":"reviewing","claimed_by":"bob","reviewer":"ann","review_started":"2020-01-01T00:00:00Z",'+FULL+'}`\n  And item 1 has a definition of done in its body\nWhen I run `backlog team pop --team t1 --agent lead --dry-run --json`\nThen the output contains "reassign-review"')],
 [('engine-review.test.js','stale predicate uses the file','env set','ignored'),('engine-conformance.test.js','reassign-review tests','shared-team-lead-pop','same results')],F)
R('REQ-408','The close step','PH-4',['RV-CLOSE'],
 'Template `close` reproduces R13 (holder/lead/owner, summary, owner reason, gate first, review rules unless owner).',
 'Code today.',
 ['Owner close with a reason on an incomplete item passes (edit rules allow it).'],
 [('the owner closes on a decision',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","handoffs":"none",'+FULL+'}`\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --close --by owner --reason "owner says so" --summary "dropped"`\nThen the command succeeds\n  And item 1 body contains "owner decision: owner says so"'),
  ('a member who does not hold the item cannot close it',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","handoffs":"none",'+FULL+'}`\n  And I act as agent "bob"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --close --summary x`\nThen the command fails with exit code 1\n  And the output contains "only the claimer (ann) closes it, else the team lead (lead); not bob"')],
 [('engine-conformance.test.js','close tests over the template','shared-team-lifecycle, shared-team-done','same results')],F)
F='team-refinement'
R('REQ-501','Refinement steps','PH-5',['RF-STEPS','RV-VERDICTS'],
 'Template `refine-start`, `refine-done`, `request-refinement-review`, `refinement-review` reproduce R02–R04 (the verdict `limit` acts as reject, F8).',
 'Code today.',
 ['team.feature refinement scenario re-pointed passes.'],
 [('the lead does not refine in the first round',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"new","refiner":""}`\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --refine-start`\nThen the command fails with exit code 1\n  And the output contains "a member, not the team lead, refines in the first round"'),
  ('refine-done needs a complete item',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"refining","refiner":"ann"}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --refine-done --note done`\nThen the command fails with exit code 1\n  And the output contains "still missing review_refs, depends_on, estimate_min, definition_of_done"')],
 [('engine-conformance.test.js','refinement tests over the template','shared-team-stages, shared-unrefined-claim','same results')],F)
R('REQ-502','Refinement reviewers from the entry','PH-5',['RF-STEPS'],
 'Role `refinement-reviewer` = members and lead of the teams in the entry\'s `refinement_review`, anyone when empty.',
 'F4: the key could not be defined.',
 ['See REQ-201 scenario.'],
 [('anyone reviews a refinement when the entry has no rule',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann"}`\n  And I act as agent "zed"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --refinement-review complete --comments ok --by zed`\nThen item 1 has status "ready"')],
 [('engine-roles.test.js','refinement-reviewer with and without rules','entry fixtures','roles')],F)
R('REQ-503','Owner decisions','PH-5',['RF-DECISION'],
 'Template `request-decision` and `decision` reproduce R06; `decision` uses `sets_rules` with `within_limits_for_role` for the lead.',
 'Code today.',
 ['Past a limit the answer is recorded and no refiner set, with the limit text.'],
 [('a question is needed',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"refining","refiner":"ann"}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --request-decision ""`\nThen the command fails with exit code 1')],
 [('engine-conformance.test.js','decision tests over the template','team.feature decision scenario, shared-team-stages','same results')],F)
R('REQ-504','Edit rules','PH-5',['RF-EDITS'],
 '`edit_rules` are evaluated per §4.7 with the selectors of §5.5; the template reproduces R05 and R16.',
 'Five code guards in lifecycle step().',
 ['Each template rule has one refusing and one passing scenario.'],
 [('frozen during the refinement review',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann"}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --name changed`\nThen the command fails with exit code 1\n  And the output contains "the item stays as the reviewer reads it"'),
  ('an incomplete item is refined only by the lead',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready"}`\n  And I act as agent "ann"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --note hello`\nThen the command fails with exit code 1\n  And the output contains "only the team lead (lead) refines it, not ann"')],
 [('engine-steps.test.js','edit rule selectors and qualifiers','synthetic rules','match table'),('engine-conformance.test.js','incomplete-item tests over the template','shared-team-work, shared-team-stages','same results')],F)
R('REQ-505','Completeness','PH-5',['RF-COMPLETE','CR-DOD'],
 'Completeness rules (§5.6) decide `complete`/`incomplete` and the `missing` list; `team query --phase --json` shows `missing` (S92); user `show --json` never does.',
 'Code today (missingFields, hasDefinitionOfDone).',
 ['The 14 definition-of-done cases of today pass over the template rule.'],
 [('team query shows the missing fields',W+'  And item 1 has the front-matter fields `{"team":"t1","status":"ready"}`\nWhen I run `backlog team query --team t1 --agent ann --phase 001-work`\nThen the output contains "\\"missing\\""'),
  ('user show has no missing key','Given a repository with a backlog\n  And an item "User" exists\nWhen I run `backlog show 1 --json`\nThen the output does not contain "\\"missing\\""')],
 [('engine-conditions.test.js','completeness tests: non_empty, present, positive_integer+body_pattern, section','14 DoD cases of shared-new','same results')],F)
