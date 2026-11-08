# Reference implementation of the semantic rules of 03-spec.md §4.10 (V-nn for definitions, E-nn for team entries) used by the
# quality gates: templates, converted schema 1 definitions (tools/convert_v1.py) and the entries the scenarios create.
# Usage: check_semantics.py def <definition.json>... | teams <teams.json> <workflows.json>
import json,re,sys
TOKENS={'same','previous','initial','first_review_stage','next_review_stage_if_satisfied','active_review_stage','flag_value'}
FILLED=set('''item slug seq status step from who actor caller agent value team item_team session_team workflow holder holder_or_nobody holder_or_author
claimed_at refiner refiner_or_nobody refine_started reviewer reviewer_if_active review_started reviewed_at lead list belong n missing how review_refs
stage verdict VERDICT records_verdict need have reviewers_text reason_text level of limit count held hint limit_text dependents dependent edges state
command flags repository branch bound cwd forced teams argument id where note summary reason comments comments_line now today work_commit first
repositories seqs review_refusal idle_reason claim_refusal actor_or_none actor_or_nobody sha role'''.split())
LITERAL=set('you why what text outcome time result minutes answer member findings'.split())
def walk(x,path=''):
  yield path,x
  if isinstance(x,dict):
    for k,v in x.items(): yield from walk(v,f'{path}.{k}' if path else k)
  elif isinstance(x,list):
    for i,v in enumerate(x): yield from walk(v,f'{path}[{i}]')
def definition(d):
  out=[]; st=set(d['statuses']); side=set(d.get('side_statuses',{})); words=st|side; steps=d['steps']; roles=d['roles']
  texts={**d.get('refusals',{}),**d.get('instructions',{})}
  if d['initial'] not in st: out.append(f"initial: {d['initial']} is not one of statuses")                                   # V-01
  for w in d['finished']:
    if w not in st: out.append(f"finished: {w} is not one of statuses")                                                       # V-02
  for w,v in d.get('side_statuses',{}).items():
    if w in st: out.append(f'side_statuses: {w} is also one of statuses')                                                     # V-04
    if v['returns_to'] not in st: out.append(f"side_statuses.{w}.returns_to: {v['returns_to']} is not one of statuses")       # V-05
    for k in ('enter','leave'):
      if v[k] not in steps: out.append(f'side_statuses.{w}.{k}: {v[k]} is not defined in steps')                               # V-06
  def word(p,w,tok=True):
    if w not in words and not (tok and w in TOKENS): out.append(f'{p}: {w} is no status of this workflow')                    # V-07
  stages=d.get('review',{}).get('stages_order',[])
  for s,v in steps.items():
    for f in v.get('from',[]):
      if f!='*': word(f'steps.{s}.from',f,False)
    if '*' in v.get('from',[]) and len(v['from'])>1: out.append(f'steps.{s}.from: "*" must be the only entry')               # V-08
    if 'to' in v: word(f'steps.{s}.to',v['to'])
    if v.get('to')=='flag_value' and v.get('value')!='word': out.append(f'steps.{s}.to: flag_value needs value word')          # V-34
    for r in v.get('to_rules',[]): word(f'steps.{s}.to_rules',r['to'])
    if v.get('to_rules') and 'when' in v['to_rules'][-1]: out.append(f'steps.{s}.to_rules: the last rule needs no when')
    for k,x in v.get('verdicts',{}).items(): word(f'steps.{s}.verdicts.{k}.to',x['to'])
    for st_,leg in v.get('stages',{}).items():
      if st_ not in stages: out.append(f'steps.{s}.stages.{st_}: stage is not in review.stages_order')                         # V-13
      for f in leg['from']: word(f'steps.{s}.stages.{st_}.from',f,False)
    if not any(k in v for k in ('to','to_rules','verdicts','stages')): out.append(f'steps.{s}: needs to, to_rules, verdicts or stages')  # V-14
    for w,vv in v.get('verdict_words',{}).items():
      if vv not in v.get('verdicts',{}): out.append(f'steps.{s}.verdict_words.{w}: {vv} is not a verdict of the step')         # V-15
    if v.get('value')=='verdict' and not v.get('verdicts'): out.append(f'steps.{s}.value: verdict needs verdicts')             # V-35
    if 'binds' in v and v['binds'] and not any(k in v for k in ('to','to_rules')): out.append(f'steps.{s}: a binding step needs to or to_rules')  # V-27
  RREF=set()
  for p,x in walk(d):
    if not isinstance(x,dict): continue
    for k in ('by','not_by','except_roles','role_order'):
      if isinstance(x.get(k),list): RREF|={(f'{p}.{k}',r) for r in x[k]}
    for k in ('actor_has_role','actor_lacks_role','flag_value_lacks_role','reviewers','role','exclude_role'):
      if isinstance(x.get(k),str) and (k!='role' or p.endswith('assign') or p.endswith('within_limits_for_role')): RREF.add((f'{p}.{k}',x[k]))
    if isinstance(x.get('union'),list): RREF|={(f'{p}.union',r) for r in x['union']}
  for k in d.get('queue',{}).get('roles',{}): RREF.add(('queue.roles',k))
  for p,r in sorted(RREF):
    if r not in roles: out.append(f'{p}: role {r} is not defined in roles')                                                    # V-09
  for r,v in roles.items():
    if len([k for k in v if k!='when_empty'])!=1: out.append(f'roles.{r}: a role has exactly one source')                     # V-10
    if 'when_empty' in v and 'entry_rule_teams' not in v: out.append(f'roles.{r}.when_empty: needs entry_rule_teams')          # V-36
  TREF=set()
  for p,x in walk(d):
    if isinstance(x,dict):
      for k in ('by_refusal','not_by_refusal','from_refusal','hint','refusal','cites_refusal','instruction','otherwise_instruction','busy_instruction','idle_instruction','marked_instruction','skipped_instruction','text'):
        if isinstance(x.get(k),str) and not p.startswith(('refusals','instructions')): TREF.add((f'{p}.{k}',x[k]))
  for s,k in d.get('undefined_step_refusals',{}).items():
    TREF.add((f'undefined_step_refusals.{s}',k))
    if s in steps: out.append(f'undefined_step_refusals.{s}: {s} is defined in steps')                                        # V-37
  for p,k in sorted(TREF):
    if k not in texts: out.append(f'{p}: text {k} is not in refusals or instructions')                                         # V-11
  for k in set(d.get('refusals',{}))&set(d.get('instructions',{})): out.append(f'instructions.{k}: also a key of refusals')    # V-32
  SREF=set()
  for p,x in walk(d):
    if isinstance(x,dict):
      if isinstance(x.get('mark'),str): SREF.add((f'{p}.mark',x['mark']))
      if isinstance(x.get('review_rules_met'),dict): SREF.add((f'{p}.review_rules_met.step',x['review_rules_met']['step']))
  for i,s in enumerate(d.get('waiting',{}).get('cleared_by_steps',[])): SREF.add((f'waiting.cleared_by_steps[{i}]',s))
  for p,s in sorted(SREF):
    if s not in steps: out.append(f'{p}: {s} is not defined in steps')                                                         # V-20/V-21
  for op,v in d['user_commands'].items():
    if v['allow'] is False and 'refusal' not in v: out.append(f'user_commands.{op}: allow false needs refusal')               # V-22
  q=d.get('queue',{})
  if len(q.get('roles',{}))>1 and 'role_order' not in q: out.append('queue: role_order is required when queue.roles has more than one key')  # V-33
  for r in q.get('role_order',[]):
    if r not in q.get('roles',{}): out.append(f'queue.role_order: {r} is not a key of queue.roles')
  for v,x in d.get('views',{}).items():
    if x.get('counts_limits') and 'limits' not in d: out.append(f'views.{v}: limits: missing (needed by views.{v}.counts_limits)')
    if not x.get('counts_limits') and 'select' not in x: out.append(f'views.{v}: missing key select')
  rev=d.get('review')
  uses=lambda key: any(isinstance(x,dict) and key in x for _,x in walk(d))
  if rev:
    if set(rev['stages'])!=set(rev['stages_order']): out.append('review.stages: keys must equal review.stages_order')       # V-38
    for s,x in rev['stages'].items():
      for k in ('ready','active'):
        if x[k] not in st: out.append(f'review.stages.{s}.{k}: {x[k]} is no status of this workflow')                        # V-18
    if rev['after_last_stage'] not in st: out.append(f"review.after_last_stage: {rev['after_last_stage']} is no status of this workflow")
    for i,r in enumerate(d.get('defaults',{}).get('review',[])):
      if r['stage'] not in rev['stages_order']: out.append(f"defaults.review[{i}].stage: {r['stage']} is not in review.stages_order")  # V-19
  elif uses('stages') or uses('review_passes_met') or uses('stale'): out.append('review: missing (needed by a review stage or predicate)')
  if uses('stale') and not (rev or {}).get('stale_after_seconds'): out.append('stale needs review.stale_after_seconds')         # V-30
  if (uses('within_limits') or uses('within_limits_for_role') or uses('within_limits_of_target_team')) and 'limits' not in d: out.append('limits: missing (needed by within_limits)')
  if uses('actor_active_items_at_most') and 'active_work' not in d: out.append('actor_active_items_at_most needs active_work')    # V-23
  if uses('complete') or uses('incomplete'):
    if not d.get('completeness'): out.append('complete needs completeness rules')                                               # V-25
  lim=d.get('limits')
  if lim and 'override' in lim:
    for l in lim['override']['lifts']:
      if l not in lim['levels']: out.append(f'limits.override.lifts: {l} is not in limits.levels')
  for c in d.get('completeness',[]):
    if c['test']!='section' and 'field' not in c: out.append(f"completeness: test {c['test']} needs field")                    # V-26
    if c['test']=='section' and 'section' not in c: out.append('completeness: test section needs section')
  # V-31: machinery text keys required by the features the definition uses
  need={'wrong_status','wrong_actor','missing_argument','step_not_defined','one_step','empty_flag_value','not_team_item','other_team','create_status_flag'}
  ident=d.get('identity',{}); sc=d.get('scope',{})
  if isinstance(ident.get('caller_acts_only_as_itself'),dict): need|={'caller_not_actor','pop_caller'}
  if any(v.get('exclusive') for v in steps.values()): need.add('edit_exclusive')
  if sc.get('bind_session'): need|={'outside_scope','session_branch'}
  if sc.get('session_team_only'): need.add('pop_session_team')
  if d.get('session',{}).get('block_after_end'): need.add('session_ended')
  conds=[x for s in steps.values() for c in s.get('requires',[])+s.get('recheck_at_publication',[]) for _,x in walk(c) if isinstance(x,dict)]
  ck=lambda k: any(k in x for x in conds)
  if lim and 'override' in lim and ck('within_limits'): need.add('limit_hint')
  if ck('dependents_handoffs_accepted'): need|={'close_gate_edge','close_gate_none_record','close_gate_missing_hint'}
  if ck('review_passes_met'): need|={'review_rule_not_met','reviewers_rule_team','reviewers_members','reviewers_role'}
  if ck('no_later_own_work'): need|={'review_no_work_commit','review_lookup_failed','review_later_work'}
  if ck('dependencies_finished'):
    need|={'dep_status','dep_foreign','dep_missing'}
    if any(isinstance(x.get('dependencies_finished'),dict) and x['dependencies_finished'].get('handoff_states') for x in conds): need|={'dep_handoff_missing','dep_handoff_unaccepted','dep_handoff_stale','dep_handoff_rejected'}
  for k in sorted(need-set(d.get('refusals',{}))): out.append(f'refusals: missing key {k} (required by {"the definition" if k in ("wrong_status","wrong_actor","missing_argument","step_not_defined","one_step","empty_flag_value","not_team_item","other_team","create_status_flag") else "the features it uses"})')  # V-31
  cond=set(d.get('texts',{}).get('conditional',{}))
  for k,v in texts.items():
    for ph in re.findall(r'<([a-z][a-z0-9_]*)>',v):
      if ph not in FILLED|LITERAL|cond: out.append(f'{k}: placeholder <{ph}> is unknown')                                       # V-12
  return out
def entries(teams,wfs):
  out=[]; T=teams['teams']
  for t,e in T.items():
    w=wfs['workflows'].get(e['workflow'])
    if not w: out.append(f"teams.{t}.workflow: {e['workflow']} is not registered in workflows.json"); continue                 # E-01
    people=e.get('people',{}); lists=e.get('lists',{}); rules=e.get('rules',{})
    val=lambda k: [people[k]] if k in people else lists.get(k,[])
    for r,src in w['roles'].items():
      if 'entry_person' in src and src['entry_person'] not in people: out.append(f"teams.{t}.people: workflow {e['workflow']} needs entry key {src['entry_person']}")  # E-09
    for c in w.get('entry_constraints',[]):
      if 'disjoint' in c:
        a,b=c['disjoint'][0],c['disjoint'][1]; both=set(val(a))&set(val(b))
        if both: out.append(f"teams.{t}: {a} and {b} must not share a name ({sorted(both)[0]})")                                 # E-02
      if 'non_empty' in c and not val(c['non_empty']): out.append(f"teams.{t}.lists.{c['non_empty']}: must not be empty (workflow {e['workflow']})")  # E-11
      if 'subset' in c:
        a,b=c['subset']
        for n in val(a):
          if n not in val(b): out.append(f"teams.{t}.lists.{a}: {n} is not in {b}")                                              # E-03
    order=w.get('review',{}).get('stages_order',[])
    for i,r in enumerate(e.get('review',[])):
      if r['stage'] not in order: out.append(f"teams.{t}.review[{i}].stage: {r['stage']} is no stage of workflow {e['workflow']} ({', '.join(order)})")  # E-04
      if 'team' in r and r['team'] not in T: out.append(f"teams.{t}.review[{i}].team: {r['team']} is not configured")           # E-06
      elif 'team' not in r and r['stage'] in w.get('review',{}).get('stages',{}):
        role=w['review']['stages'][r['stage']]['reviewers']; src=w['roles'].get(role,{})
        names=val(src['entry_list']) if 'entry_list' in src else val(src['entry_person']) if 'entry_person' in src else ['?']
        if 'union' in src: names=[n for u in src['union'] for n in (val(w['roles'][u].get('entry_list') or w['roles'][u].get('entry_person')))]
        if not names: out.append(f"teams.{t}.review[{i}]: no reviewer can pass stage {r['stage']} ({role} is empty)")             # E-07 (explicit lists only)
    if len({r['stage'] for r in e.get('review',[])})!=len(e.get('review',[])): out.append(f'teams.{t}.review: a stage is listed twice')  # E-05
    for k,lst in rules.items():
      for i,r in enumerate(lst):
        if r['team'] not in T: out.append(f"teams.{t}.rules.{k}[{i}].team: {r['team']} is not configured")                     # E-08
    for l in e.get('limits',{}):
      if l not in w.get('limits',{}).get('levels',[]): out.append(f"teams.{t}.limits.{l}: level {l} is not in the limits.levels of workflow {e['workflow']}")  # E-10
  return out
if __name__=='__main__':
  if sys.argv[1]=='def':
    bad=0
    for f in sys.argv[2:]:
      o=definition(json.load(open(f))); bad+=len(o); print(f, 'valid' if not o else '\n  '+'\n  '.join(o))
    sys.exit(1 if bad else 0)
  o=entries(json.load(open(sys.argv[2])),json.load(open(sys.argv[3]))); print('\n'.join(o) or 'valid'); sys.exit(1 if o else 0)
