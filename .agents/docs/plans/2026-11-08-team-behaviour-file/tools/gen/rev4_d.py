import re
from reqs_rev4 import get,upd,acc,scen,test,new,REQS
from base import BG_TEAM
def BG(patch): return BG_TEAM.replace('from the template "team.full.json"',f'from the template "team.full.json" with `{patch}`',1)
NEW1='\n  And I run `backlog team new --team t1 --agent lead --name a`'
# ---- R2-028: defaults and overrides of keys
K=[('REQ-802','queue.scope_default repo offers another branch\'s item',BG('queue.scope_default = "repo"')+'\n  And I run `backlog team new --team t1 --agent lead --name a --branch dev`\n  And item 1 has the front-matter fields `{"status":"ready","refiner":"","review_refs":"r.md","depends_on":"none","estimate_min":5}`\n  And item 1 has a definition of done in its body\nWhen I run `backlog team pop --team t1 --agent ann --dry-run --json`\nThen the command succeeds\n  And the output contains "001-a"'),
 ('REQ-208','without foreign_items another repository offers nothing',BG('scope.foreign_items = <delete>')+'\n  And the item "c" of repository "other/repo" is bound to team "t1" with the front-matter fields `{"status":"ready","chunk":true}`\nWhen I run `backlog team pop --team t1 --agent ann --scope all --dry-run`\nThen the command exits with code 3'),
 ('REQ-602','count_scope team ignores items of other teams',BG('limits.count_scope = "team"')+'\n  And team "t1" has the entry key limits set to `{"overall":1}`\n  And I run `backlog new --name x --status "in progress"`'+NEW1+'\n  And item 2 has the front-matter fields `{"status":"ready","refiner":"","review_refs":"r.md","depends_on":"none","estimate_min":5}`\n  And item 2 has a definition of done in its body\nWhen I run `backlog team update 2 --team t1 --agent ann --claim ann`\nThen the command succeeds'),
 ('REQ-404','without reject_clears a reject keeps the passes',BG('review.reject_clears = <delete> ; steps.review.verdicts.reject.clears = []')+NEW1+'\n  And item 1 has the front-matter fields `{"status":"reviewing","reviewer":"bob","reviews":["x c1"],"work_commit":"c1","review_refs":"r.md"}`\nWhen I run `backlog team update 1 --team t1 --agent bob --review changes --comments "see r.md"`\nThen the command succeeds\n  And item 1 has reviews "x c1"'),
 ('REQ-702','priority_by_severity puts a critical item first',BG_TEAM+'\n  And I run `backlog team new --team t1 --agent lead --name a`\nWhen I run `backlog team new --team t1 --agent lead --name b --severity critical`\nThen the command succeeds\n  And I run `backlog list --json`\n  And the output contains "\\"priority\\": 0"'),
 ('REQ-702','create.ask asks for the field it names',BG('create.ask = [{"field":"estimate_min","label":"Minutes"}]')+'\nWhen I run `backlog team new --team t1 --agent lead --name a --ask` and answer "7"\nThen the command succeeds\n  And item 1 has estimate_min "7"'),
 ('REQ-304','with cleared_by_note false a note keeps the wait',BG('waiting.cleared_by_note = false')+NEW1+'\n  And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann","wait_on":"x"}`\nWhen I run `backlog team update 1 --team t1 --agent ann --note n`\nThen the command succeeds\n  And item 1 has wait_on "x"'),
 ('REQ-205','without same_worker_pattern a numbered session is another worker',BG('identity.same_worker_pattern = <delete>')+NEW1+'\n  And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann:1"}`\nWhen I run `backlog team update 1 --team t1 --agent ann:2 --claim ann:2`\nThen the command fails with exit code 1\n  And the output contains "claimed by ann:1"'),
 ('REQ-107','records_rules picks the first matching record',BG('steps.waiting.records = <delete> ; steps.waiting.records_rules = [{"when":{"actor_has_role":"lead"},"records":"LEAD WAIT <value>"},{"records":"WAIT <value>"}]')+NEW1+'\n  And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann"}`\nWhen I run `backlog team update 1 --team t1 --agent ann --waiting x`\nThen the command succeeds\n  And item 1 body contains "WAIT x"'),
 ('REQ-106','sets_rules picks the first matching rule',BG('steps.waiting.sets_rules = [{"when":{"actor_has_role":"lead"},"sets":{"wait_on":"text:lead"}},{"sets":{"wait_on":"flag_value"}}]')+NEW1+'\n  And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann"}`\nWhen I run `backlog team update 1 --team t1 --agent ann --waiting x`\nThen the command succeeds\n  And item 1 has wait_on "x"'),
 ('REQ-112','a step without binds refuses an item outside a team',BG('steps.set-team.binds = false')+'\n  And I run `backlog new --name x`\nWhen I run `backlog team update 1 --team t1 --agent lead --set-team t1`\nThen the command fails with exit code 1\n  And the output contains "belongs to no team"'),
 ('REQ-110','a third step made combinable runs with another step',BG('steps.waiting-done.combinable = true')+NEW1+'\n  And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann","wait_on":"x"}`\nWhen I run `backlog team update 1 --team t1 --agent ann --waiting-done --note n`\nThen the command succeeds'),
 ('REQ-903','without texts.team_step the how-text prints only the flags',BG('texts.team_step = <delete>')+NEW1+'\nWhen I run `backlog team pop --team t1 --agent lead --dry-run`\nThen the command succeeds\n  And the output does not contain "backlog team update 001-a --team t1"')]
for rid,t,g in K: scen(rid,t,g)
# ---- 10.9
upd('REQ-901',statement='User commands ask `binding.check(operation, items)` (§7) and act on its answer, and readers ask `binding.finished(item)` (true, false, or null for an item outside a team, which then uses the default words of the user commands (D-33)) wherever they need "finished" (R1-006); the operations and their mapping are §7; the texts are the bound team\'s `refusals`; the port is the only call from that code into `src/engine/`.')
upd('REQ-902',statement='No module under `src/shared/` (the code of the user commands) contains a status, stage, role, verdict or team word, compares a status with a word list other than the default words of the user commands (D-33), refuses or orders anything by a flow rule, reads a team file except through the port, or takes a team hook (D-17). `backlog new` outside a team writes no team key and always writes `owner` from the configuration\'s user (R1-004). The changes report of `backlog list changes` counts an item as held when the agent is in its holder field `owner` with `owned_since` set; team roles are not consulted (R1-019). The field table of `backlog fields` documents each field as data only; team meanings are documented in `docs/team-behaviour.md` from the definition (R1-030).')
acc('REQ-902','`backlog list changes --agent ann --json` lists an item whose `reviewer` is `ann` (and `owner` is `bob`) under `others`, not under `held`.')
test('REQ-902','shared-changed.test.js','held is the holder field only','item with reviewer ann, owner bob','held = [], others = [item]')
upd('REQ-904',statement='Only the items of §8 stay in code; dead code (F12) is deleted. The guard test of REQ-905 (check 5) reads its allow-list from the §8 table, so the two cannot drift (R1-013).',
 accept=['`user-guard.test.js` check 5 parses the §8 table of `docs/team-behaviour.md` (generated from 03-spec §8) and fails when a literal of `src/engine/` is neither in it nor a key or token of the schema.'])
upd('REQ-905',statement='The build fails when (1) a flow literal or team word appears in `src/shared/` as a string literal or as a property name (`x.<word>`, `x[\'<word>\']`) outside the allow-list; (2) `src/shared/` imports `src/team/` or any `src/engine/` module but `binding.js`; (3) any function of `src/shared/` declares a parameter, destructured option or variable named `team`, `seam`, `hooks` or `callbacks`; (4) a module of `src/engine/` or `src/team/` imports a command module of `src/shared/` (only the storage primitives listed in 05 §5 may be imported) or assigns to a property of an object imported from `src/shared/` (callback installation); (5) a literal of `src/engine/` is not in the §8 allow-list (R1-001, R1-013).',
 accept=['Mutation checks: a copy of `update.js` with `team?.step(a)` added, a copy of an engine module importing `../shared/update.js`, a copy assigning `seam.x = f`, and a copy of `update.js` with `"in progress"` each make the guard fail with the check number.'])
for t in [('user-guard.test.js','hooks: a team parameter, an import of a command module, a property assignment on an imported object','three mutated copies','checks 3 and 4 fail naming file and line')]: test('REQ-905',*t)
upd('REQ-907',statement='The conformance suite runs the migrated literal tests (05 §6) once, against the registered `team.json` template (R3-021); every row of §9 (R01..R29) has at least one passing test.',
 accept=['Counts of 05 §6 reconcile: each CODE-LITERAL row of `tests.tsv` has one disposition (unchanged, harness, rewrite, changed, deleted, misclassified) and each kept row maps to a §9 row.'])
upd('REQ-908',statement='CONDITIONAL on Q-01 (display convention of the user commands). Decided already (D-19, not part of the question): `backlog archive` never refuses because of the status; `backlog update --status` and `backlog new --status` store the word exactly as typed; nothing rewrites a typed word. Option A (recommended): `.backlog/config.json` key `display` = `{"initial":"<word>","finished":["<word>",...],"new":["<word>",...],"done_word":"<word>"|null,"critical_priority":<n>|null}` written by `backlog setup` from the documented defaults `{"initial":"pending","finished":["closed","done","archived"],"new":["pending","new"],"done_word":"closed","critical_priority":0}`; `list new|open|done`, `archive done`, `next`, the open-first order and `done` read it; a backlog without it: those commands print `❌ backlog: .backlog/config.json has no display convention; run backlog setup` (exit 2). Option B: no convention: `list new|open|done`, `archive done` and `done` are removed (`❌ backlog: argument: invalid choice: \'done\' (choose from ...)`, exit 2), `next` orders by priority only, status is free text. Option C: the convention is fixed in one module `src/shared/display-words.js` (`finished` = closed, done, archived; default `pending`; `done` writes `closed`) and documented.',
 accept=['Decided part: `backlog update 1 --status Done` stores `Done`; `backlog archive 1` of an item with status `in progress` succeeds without `--force` (R1-003).',
 'A: with `"finished":["shipped"]` in the configuration, `backlog list done` lists an item with status `shipped`; no team file is read.','B: `backlog list done` exits 2 with the invalid-choice line.','C: `backlog list done` lists `closed`, `done`, `archived` items; the words appear only in `display-words.js` (guard allow-list).'])
upd('REQ-909',statement='CONDITIONAL on Q-02. Decided already (D-20): whichever option, these flags never refuse for a reason other than syntax and never write `status`. Option A (recommended): `backlog update <n> --claim <who>` writes `owner` = `<who>` and `owned_since` = now; `--release` clears `owned_since` (and sets `owner` back to the configuration user); `--close --summary <text>` appends the summary as a body record `## Closed by <who> at <now>` and changes no field; `--by` is recorded as the closer and no name is special (R1-027). Option B: the three flags are removed from `backlog update` (`❌ backlog: unrecognized arguments: --claim`, exit 2); holding an item is team behaviour.',
 accept=['A: `backlog update 1 --claim bob` after `--claim alice` exits 0 and `backlog show 1 --json` has `owner` `bob`; the status is unchanged.','B: `backlog update 1 --claim bob` exits 2 with `unrecognized arguments: --claim bob`.'])
upd('REQ-910',cond=None,title='No limits and no dependency gate outside a team',statement='Decided by the principle (D-18): `backlog update --claim`, `backlog update --status`, `backlog move` and the publication recheck apply no work-in-progress limit and no dependency gate; limits exist only in team entries (`limits`), and `wip-limits.json` is migrated into them (REQ-011) and retired.',
 accept=['With `wip-limits.json` `{"overall":1}` before the migration and one item `in progress`, `backlog update 2 --claim bob` of an item outside a team exits 0.','`backlog update 2 --claim bob` of an item depending on an open item exits 0.'])
get('REQ-910')['scen']=[('no limit applies to items outside a team','Given a repository with a backlog\n  And I run `backlog new --name a --status "in progress"`\n  And I run `backlog new --name b`\nWhen I run `backlog update 2 --status "in progress"`\nThen the command succeeds')]
get('REQ-910')['tests']=[('user-flow.test.js','no limit and no dependency gate outside a team','home with wip-limits.json overall 1 and a dependency on an open item','update --claim, --status in progress and move exit 0')]
upd('REQ-911',statement=get('REQ-911')['statement']+' Under both options the fallback after the flag (and, with A, the variable) is the key `team`/`user` of `.backlog/config.json`; option B also drops that fallback (R1-032).')
upd('REQ-921',statement=get('REQ-921')['statement'].replace('open/done by the user default words (REQ-908)','open/done by `binding.finished` (the definition for a bound item, the default words of the user commands (D-33) otherwise, R1-006)'))
upd('REQ-925',statement='Exit codes: 0 success (and idle answers that are not `team pop`); 1 refusal or failure of a valid request (refusal line on stdout; storage failures on stderr), including "not found" and a missing required value of a valid command (`new` without `--name`); 2 invalid input (unknown command, option or word, malformed value, invalid configuration) and the refusals of the configuration commands `team define`/`team workflow`, which print `❌ backlog: <text>` on stderr (R2-017) — `team workflow --show <unknown>` included (R2-018); 3 publication failure, and `team pop` idle; 4 the configured backlog repository is not cloned (`run backlog setup`, unchanged, R2-016); 5 stale view. Storage failures exit 1 (COMMANDS.md changes "2 invalid input or a failure" to "2 invalid input"). An uncaught program error exits 1 with `❌ backlog: internal error: <message>` (today 2: main.js `error.exitCode || 2`); the bootstrap\'s runtime error keeps exit 1. Documented in `backlog --help` and COMMANDS.md.',
 accept=['A table test runs one command per class 0, 1, 2, 3, 4, 5 and the configuration refusal, and checks stream and code.'])
upd('REQ-927',statement=get('REQ-927')['statement'].replace('(user default words for unbound targets, the target\'s definition for bound ones)','(`binding.finished`: the target\'s definition for a bound target, the default words of the user commands (D-33) otherwise, R1-006)'))
acc('REQ-932','A: the template defines `abandon` with `to` = a finished word of the definition (template `closed`) and `records` = the template text; a test reads the template, not a literal (R1-021).')
upd('REQ-935',statement=get('REQ-935')['statement']+' Today one path already prints the object: the bootstrap\'s runtime error `{"ok":false,"error":{"code":"RUNTIME_ERROR","message":...}}` (exit 1); option A reuses that shape, option B removes it (R1-024).')
upd('REQ-936',statement=get('REQ-936')['statement']+' The question also covers `BACKLOG_HOME` and `BACKLOG_ORIGIN_URL`, which override the configured backlog source today (R1-025): A does not read them either; B keeps them documented.')
upd('REQ-939',statement=get('REQ-939')['statement']+' The re-check intervals (1 hour after a failure, 24 hours with `auto`, 7 days otherwise) stay as they are under both options (R1-033).')
acc('REQ-934','B: for each command with `--json` (list in COMMANDS.md) a test parses the payload and checks its top-level type and keys against COMMANDS.md.',replace=True)
acc('REQ-940','The tests `new-ask.test.js` and `update-notice.test.js` (TST ids in 05 §6) pass unchanged at every phase gate.',replace=True)
new('REQ-928','Rows of list --json outside a team','PH-12',['ST-LEGACY'],
 '`backlog list --json` rows carry the index columns and the stored front-matter fields `owner` and `owned_since`; no derived field (`review_state`, `claimed_by`) is added (R1-016). The topology readers change first (consumer CON-02).',
 'D-09 deletes the derived fields; the user list may not print team words (REQ-902).',
 ['`backlog list --json` of an item in review has no key `review_state` and no key `claimed_by`.'],
 [('list --json has no derived fields','Given a repository with a backlog\n  And I run `backlog new --name a`\nWhen I run `backlog list --json`\nThen the command succeeds\n  And the output does not contain "review_state"')],
 [('shared-list.test.js','list --json rows have no derived fields','one item','keys = index columns + owner, owned_since')],'user-guarantee')
new('REQ-941','Team commands own their path','PH-11c',['PC-HOOKS','PC-SEAM'],
 '`backlog team update|new|query|pop` are implemented end to end in `src/engine/` (D-17). They call only the storage primitives (item codec, index, lock, publication, numbering, path safety) of the modules listed in 05 §5; `src/shared/update.js`, `new.js`, `query.js`, `archive.js`, `router.js`, `status.js`, `store.js` and `wip-limits.js` take no team parameter; `src/shared/seam.js` and every consumer of it are deleted (R1-001).',
 'The user modules hosted the whole team pipeline through injected hooks; the guard could not see them.',
 ['`grep -rn "seam" src/` finds nothing; the guard checks 3 and 4 of REQ-905 pass; every team test passes.'],
 [('No scenario','No scenario: a source-structure rule; proved by T-941-1 and the guard tests of REQ-905')],
 [('user-guard.test.js','no seam, no team parameter, engine imports only primitives','source tree','checks 3 and 4 pass; seam.js absent')],'user-guarantee')
# ---- final normalisation: field steps of the existing step set
for r in REQS:
  r['scen']=[(t,re.sub(r'item (\d+) has field "(\w+)" equal to "([^"]*)"',r'item \1 has \2 "\3"',re.sub(r'item (\d+) has field "(\w+)" containing "',r'item \1 has \2 containing "',g))) for t,g in r['scen']]
# ---- R2-022: every vague expected result replaced by an observable
import csv,os
_T=list(csv.DictReader(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','tests.tsv')),delimiter='\t'))
def conf(*files):
  ids=[t['id'] for t in _T if t['file:line'].split(':')[0].replace('.test.js','') in files]
  return f"the {len(ids)} tests {ids[0]}..{ids[-1]} of {', '.join(f+'.test.js' for f in files)} pass against the registered template with their assertions unchanged except the rows whose disposition in tests.tsv is harness, rewrite, changed or deleted" if ids else 'no test'
X={
'T-014-2':'`npm pack --dry-run --json` lists templates/team-behaviour/team.json, minimal.json, teams.example.json, workflows.example.json and the four schema files',
'T-102-2':'the three lines "def.json: side_statuses: ready is also one of statuses", "...returns_to: limbo is not one of statuses", "...enter: request-decision is not defined in steps"',
'T-103-1':'stdout "❌ finish is not a step of workflow minimal (team m)", exit 1',
'T-103-2':'stdout "❌ backlog team update takes no --status: the status of a team item moves by its steps", exit 1 (undefined_step_refusals.status)',
'T-104-2':'stdout = the filled refine_wrong_status text, not wrong_status',
'T-105-1':'seven (token, status before, status after) triples equal: same/in progress/in progress; previous/awaiting decision/refining; initial/-/new; first_review_stage/in progress/ready for review; next_review_stage_if_satisfied/reviewing/ready for external review; active_review_stage/ready for review/reviewing; flag_value/new/<value>',
'T-105-2':'release: reviewing→reviewing, slice in progress→ready, work item in progress→new; V-rule "the last rule needs no when"',
'T-106-1':'actor=ann, now matches ^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ$, today matches ^\\d{4}-\\d\\d-\\d\\d$, head = git rev-parse HEAD, flag_value=<v>, ""="", field:x=<old x>, role:lead=lead, text:<a>=filled, argument:note=<note>, head_unless_covered and now_if_empty per §5.3',
'T-106-3':'"def.json: steps.claim.sets.claimed_by: me is no value source" and "def.json: steps.claim.sets.status: the status is set by to"',
'T-107-1':'for each template step the body gains the filled records text after a blank line and the update line headline equals its first line without # marks',
'T-107-2':'"def.json: refusals.limit: placeholder <who_knows> is unknown"',
'T-108-1':'missing: filled refusal; blank "  ": same; cites_field review_refs ["r.md"] without r.md in --comments: review_cite_refs; empty list: passes',
'T-114-2':'with block_after_end {field: ended_sessions}: session s1 refused with filled session_ended after its review request; session s2 allowed; absent: no field written',
'T-201-3':'"def.json: steps.claim.by: role captain is not defined in roles" and "def.json: roles.a: union cycle through b"',
'T-202-1':'by: filled wrong_actor with <who> "member or lead"; not_by author: filled self_review; by_refusal key used when given',
'T-204-1':'member ann acting as bob: filled caller_not_actor; lead acting as bob: allowed; caller_acts_only_as_itself false: allowed',
'T-207-1':'bind_session true: item of branch dev refused with filled outside_scope; false: allowed',
'T-207-2':'team pop --branch dev in a session bound to main: filled session_branch, exit 1',
'T-208-1':'foreign_items {when: field_true chunk}: chunk item of the other folder offered, user item not; absent: neither offered (exit 3)',
'T-209-1':'"team.json: lead and members must not share a name (b)" and "team.json: lists.review_only: z is not in members"',
'T-301-2':'"...requires[0]: a condition has exactly one test key (found status_not_in, field_empty)" and "...requires[2]: a condition needs refusal"',
'T-302-1':'field_empty x on {} true / on {x:"a"} false; field_present the reverse; field_exists/field_absent on key presence; field_is_actor ann on {claimed_by:"ann:1"} true without exact, false with exact',
'T-303-1':conf('shared-team-lifecycle','shared-unrefined-claim','shared-session-continue'),
'T-304-1':conf('shared-team-work','shared-team-lifecycle'),
'T-307-1':conf('shared-handoff-commands','shared-handoff-e2e'),
'T-307-2':'"def.json: steps.set-team: a binding step needs to or to_rules" (V-27 reduced, D-25)',
'T-308-1':conf('shared-handoff-commands'),
'T-309-1':conf('shared-handoff-gate','shared-handoff-close'),
'T-401-1':'entry review [external] skips peer: request-review → ready for external review; [] → review complete; [peer, external] → ready for review',
'T-401-2':'"...stages.qa: stage is not in review.stages_order" and "def.json: review.stages.peer.ready: waiting is no status of this workflow"',
'T-403-1':conf('shared-team-stages','shared-twostage'),
'T-404-1':conf('shared-session-review','shared-team-flow'),
'T-405-1':'rule team gold: "<reviewers_text>" = "members of team gold"; stage reviewers union: "members of the team"; external: "its external reviewers"',
'T-405-2':'subject "12 and 13: fix" after the work commit of item 12: filled review_later_work; git failing: filled review_lookup_failed; no work commit: review_no_work_commit',
'T-406-1':'caller session equals author_session: refused with review_author_session; differs: allowed; empty caller session: allowed',
'T-407-2':conf('shared-team-lead-pop'),
'T-408-1':conf('shared-team-lifecycle','shared-team-done'),
'T-501-1':conf('shared-team-stages','shared-unrefined-claim'),
'T-502-1':'with rules.refinement_review [gold]: members and lead of gold hold refinement-reviewer, others not; without rules: anyone holds it (when_empty anyone)',
'T-503-1':conf('shared-team-stages'),
'T-504-2':conf('shared-team-work','shared-team-stages'),
'T-505-1':conf('shared-new')+'; the 14 definition-of-done inputs give the same complete/incomplete answer',
'T-602-1':'overall 3, repository o/a 2, branch o/a:main 1, team 2, member ann 1 for the fixture home of 3 folders with 3 active items',
'T-602-2':'count_scope team: overall 1 (only t1 items); home: overall 3',
'T-603-1':'the held list is 8 entries "<repository>#<seq>" joined by ", " followed by ", ..."',
'T-604-1':'with wip_override set: team and member levels skipped (claim allowed), overall level still refuses',
'T-605-1':'lines "team t1: 1 of 4", "member ann: 1 of 1", "limits: <home>/teams.json" and "stale: 001-a (updated 2000-01-01T00:00:00Z)"',
'T-701-1':'handoff_states [accepted, unrecorded]: unaccepted edge false, accepted true, producer without records field true (unrecorded); null: true; foreign closed target true; unbound target per the display convention',
'T-701-2':conf('shared-foreign-deps','shared-handoff-gate'),
'T-702-1':conf('new-ask'),
'T-801-1':'for every predicate key of §5.2 one fixture where it is true and one where it is false (table in the test file, 41 keys)',
'T-802-1':conf('shared-team-pop','shared-team-lead-pop'),
'T-802-2':'answers: first matching offer in file order; preempts replaces a review answer and a continue answer unless the item is review complete or rejected; when_actor false skips the offer; busy_when true gives busy_instruction',
'T-803-1':conf('shared-team-lead-pop'),
'T-804-1':conf('shared-team-plan'),
'T-805-1':conf('shared-team-scope'),
'T-806-1':'chunk_scope off: no chunk offer; branch: only the branch\'s chunk items; repo: the folder\'s; all: every folder\'s',
'T-901-1':'for each of the 12 operations: allow true → the command exits 0; allow false → stdout "❌ <filled refusal>", exit 1, nothing written',
'T-901-2':'7 bound items: "<list>" = 5 slugs joined by ", " then " and 2 more"; one item: "belongs"; two: "belong"',
'T-901-4':conf('plain-team-items','team-boundary'),
'T-902-2':'the import graph of src/shared has no edge to src/team and only binding.js into src/engine (test passes; a mutated import fails)',
'T-903-1':'for every filled placeholder of §4.7 a fixture value gives the expected text (table in the test file)',
'T-906-2':'COMMANDS.md and templates/skills/backlog/references/commands.md each contain "### backlog team validate" and "### backlog team migrate"',
'T-908-1':'A: list done lists the shipped item; B: list done exits 2 with the invalid-choice line; C: list done lists closed/done/archived items',
'T-909-1':'A: claim bob after alice exits 0 and owner = bob; B: exit 2 "unrecognized arguments: --claim bob"',
'T-920-2':'"next branch dev" prints the first open item of branch dev; an unknown name prints "ℹ️  branch nope has no items" and exits 0',
'T-920-3':'COMMANDS.md contains "### backlog list branch" and "### backlog next branch"',
'T-921-1':'columns branch, open, done, archived, total; the totals row equals the sums',
'T-927-1':'one row "002-b waits on 001-a (ready)"; an item depending on a finished item is not listed',
'T-930-1':'A: lead --delete removes the file in one commit; member refused with the filled delete refusal',
'T-931-1':'B: lead --move-to <branch> changes branch through the step; a member is refused',
'T-932-1':'A: lead --abandon "r" on a refining item gives status = the template abandon to word and the template record',
'T-933-1':'A: update 1 --ask asks each field on a terminal and writes the answers; without a terminal exit 2',
'T-934-1':'B: list --json top level is an array; show --json an object (as COMMANDS.md)',
'T-935-1':'A: each code INVALID_INPUT, REFUSED, NOT_FOUND, STORAGE_ERROR, SYNC_FAILED, STALE, TEAM_CONFIG once as {"ok":false,"error":{"code":..}} with its exit code',
'T-936-1':'A: BACKLOG_CLI_BRANCH, BACKLOG_HOME, BACKLOG_ORIGIN_URL set have no effect on the resolved home and branch',
'T-938-1':'A: history of an item written before the event move prints "(history before <date> not recorded)"',
'T-939-1':'A: a check that times out after 3000 ms prints nothing on stderr; a registry error prints the warning line',
}
for r in REQS:
  n=r['id'][4:]
  r['tests']=[(f,t,fx,X.get(f'T-{n}-{i}',ex)) for i,(f,t,fx,ex) in enumerate(r['tests'],1)]
# ---- R2-029 scenario fixes
def edit_scen(rid,title_part,fn):
  r=get(rid)
  r['scen']=[(t,fn(g)) if title_part in t else (t,g) for t,g in r['scen']]
edit_scen('REQ-503','a question is needed',lambda g: g+'\n  And the output contains "'+__import__('json').load(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'..','..','templates','team.full.json')))['refusals']['decision_no_question'].replace('<item>','001-work').split('<')[0].strip()+'"')
edit_scen('REQ-902','user new writes no team keys',lambda g: g.replace('Then item 1 has review_state ""\n  And item 1 has claimed_by ""','Then item 1 has team ""\n  And item 1 has refiner ""\n  And item 1 has claimed_by ""'))
r=get('REQ-008'); r['scen']=[(t,g) if 'the templates are valid' not in t else ('a team definition file validates','Given a repository with a backlog\n  And the backlog registers the workflow "team" from the template "team.full.json"\n  And a file "team.json" outside the backlog contains `{"schema":"backlog-team-definition/2","name":"gold","workflow":"team","people":{"lead":"ann"},"lists":{"members":["bob"]}}`\nWhen I run `backlog team validate --file team.json`\nThen the command succeeds') for t,g in r['scen']]
edit_scen('REQ-009','a valid definition is registered',lambda g: g.replace('"workflow minimal registered"','"✅ workflow minimal registered"'))
edit_scen('REQ-011','migrate --file converts the topology definition',lambda g: g.replace('And a definition file "old.json" from the template "workflows-v1-example.json" with ``','And a file "old.json" outside the backlog is the fixture "example-team-v1.json"'))
for r in REQS: r['scen']=[(t,g.replace('Then the command exits with code 3','Then the command fails with exit code 3')) for t,g in r['scen']]
# ---- owner ruling of 2026-11-08 on the user flow (no enforcement): Q-01, Q-02 decided (D-19, D-20, D-33)
upd('REQ-908',cond=None,title='Default words of the user commands',statement='Decided by the owner ruling on the user flow (D-19, D-33): the user commands keep built-in default words, used as defaults only, in one module `src/shared/defaults.js` documented in `backlog --help` and COMMANDS.md: new item `pending`; `list new` = `pending`, `new`; finished = `closed`, `done`, `archived`; `list open` = every item whose status is not a finished default word (an unknown word such as `shipped` counts as open); `list done` = the finished default words; `backlog done <n>` writes `closed`; `archive done` archives the items with a finished default word; `next` and the open-first order use the same split. Any other value is accepted and stored exactly as typed (`update --status`, `new --status`; nothing rewrites a word); `backlog archive <n>` archives any item without refusal; an item with another word is shown by `backlog list` (the whole stack), `backlog list open` and `backlog show <n>`, never by `list new` or `list done`. A bound item is judged by its definition through `binding.finished` (R1-006).',
 accept=['After `backlog update 3 --status shipped`, `backlog list` and `backlog list open` show item 3 with `shipped`; `backlog list new` and `backlog list done` do not.','`backlog update 1 --status Done` stores `Done` (not `closed`); `backlog list done` does not show it (the default words are lower case).','`backlog archive 3` of the `shipped` item exits 0 and moves it to `archive/` without `--force`; its status stays `shipped`.','`backlog done 1` stores `closed`; `backlog list done` shows item 1.'])
get('REQ-908')['scen']=[('a word outside the defaults is listed in the whole stack and in open','Given a repository with a backlog\n  And I run `backlog new --name a`\n  And I run `backlog update 1 --status shipped`\nWhen I run `backlog list open`\nThen the command succeeds\n  And the output contains "shipped"'),
 ('a word outside the defaults is not in list done','Given a repository with a backlog\n  And I run `backlog new --name a`\n  And I run `backlog update 1 --status shipped`\nWhen I run `backlog list done`\nThen the command succeeds\n  And the output does not contain "001-a"'),
 ('archive never refuses because of the status','Given a repository with a backlog\n  And I run `backlog new --name a`\n  And I run `backlog update 1 --status shipped`\nWhen I run `backlog archive 1`\nThen the command succeeds'),
 ('a typed word is stored as typed','Given a repository with a backlog\n  And I run `backlog new --name a`\nWhen I run `backlog update 1 --status Done`\nThen the command succeeds\n  And item 1 has status "Done"')]
get('REQ-908')['tests']=[('user-flow.test.js','default words: list new/open/done, done, archive done, next with an unknown word','items pending, closed, shipped, Done','list open = pending, shipped, Done; list done = closed; archive of shipped exits 0; Done stored as typed')]
upd('REQ-909',cond=None,title='Holding flags of the user commands refuse nobody',statement='Decided by the owner ruling on the user flow (D-20): `backlog update <n> --claim <who>` writes `owner` = `<who>`, `owned_since` = now and the default word `in progress`; `--release` clears `owned_since`, sets `owner` back to the configuration user and writes the default word `pending`; `--close [--summary <text>]` writes the default word `closed` and appends the summary, if given, as the body record `## Closed by <who> at <now>`. None of them refuses for any reason other than syntax (no "claimed by", no "needs --summary", no "only the claimer"); `--by` is recorded as the closer and no name is special (R1-027).',
 accept=['`backlog update 2 --claim bob` after `--claim alice` exits 0 and `backlog show 2 --json` has `owner` `bob` (today: `❌ 002-write-docs: claimed by alice since <time>; message alice or pick another item`).','`backlog update 2 --close` without `--summary` exits 0 and the status is `closed` (today: `❌ 002-write-docs: --close needs --summary "<what was delivered>"`).'])
get('REQ-909')['scen']=[('a claim of a held item takes it over','Given a repository with a backlog\n  And I run `backlog new --name a`\n  And I run `backlog update 1 --claim alice`\nWhen I run `backlog update 1 --claim bob`\nThen the command succeeds\n  And item 1 has owner "bob"'),
 ('a close needs no summary','Given a repository with a backlog\n  And I run `backlog new --name a`\nWhen I run `backlog update 1 --close`\nThen the command succeeds\n  And item 1 has status "closed"')]
get('REQ-909')['tests']=[('user-flow.test.js','claim, release, close refuse nobody','one item','claim over a holder exits 0 owner bob; close without summary exits 0 status closed; release exits 0 owner = configuration user')]
test('REQ-101','user-guard.test.js','after PH-4b src/shared/status.js exports no status word of the template (R3-004)','source of src/shared/status.js','no string literal of status.js is a status, side status or stage of templates/team-behaviour/team.json')
_r=get('REQ-101'); _old=_r['tests'][2]; _r['tests'][2]=_r['tests'].pop()  # R3-004: the PH-4b check replaces T-101-3; the removal test moves to the phase that deletes the file
test('REQ-902',_old[0],_old[1]+' (moved from REQ-101 to the phase that deletes the file, R3-004)',_old[2],_old[3])
# ---- R2-020 / R2-038 remaining criteria
upd('REQ-306',statement=get('REQ-306')['statement']+' The refusal texts are the template keys `recheck_dependencies`, `recheck_limit`, `recheck_active_items` (filled); the line that wraps them is the publication failure line of today (src/shared/sync.js), unchanged (R2-038).')
acc('REQ-801','T-801-1 evaluates every predicate key of §5.2 on one fixture where it holds and one where it does not, through the single evaluator used by conditions, offers, plan passes, views and limits (one import site, checked by the test).',replace=True)
acc('REQ-911','A: with `TEAM_NAME=t1 BACKLOG_AGENT=ann` set and no flags, `backlog team pop --dry-run --json` answers for team t1 and agent ann; with `--team t2` the flag wins. B: the same command without flags exits 2 with `❌ backlog: team pop needs --team`.',replace=True)
