# Writes schema/negative/*.json: one invalid file per row, derived from a valid template by a patch, and expected.tsv with the
# exact message of the reference interpreter (tools/validate_subset.py). tools/check_schemas.py validates them with python jsonschema too.
import json,copy,os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
T=lambda n: json.load(open(os.path.join(D,'templates',n)))
DEL=object()
def patch(doc,changes):
  doc=copy.deepcopy(doc)
  for path,val in changes:
    keys=path.split('.'); x=doc
    for k in keys[:-1]: x=x[int(k)] if isinstance(x,list) else x[k]
    k=keys[-1]
    if val is DEL: del x[k]
    elif isinstance(x,list): x[int(k)]=val
    else: x[k]=val
  return doc
ROWS=[
 # (file, schema, base, changes, expected message)
 ('tb-01-schema-version','team-behaviour','team.full.json',[('schema','backlog-team-behaviour/1')],'schema: must be "backlog-team-behaviour/2"'),
 ('tb-02-missing-statuses','team-behaviour','minimal.json',[('statuses',DEL)],'missing key statuses'),
 ('tb-03-duplicate-status','team-behaviour','minimal.json',[('statuses',['ready','ready','closed'])],'statuses: entries must be distinct'),
 ('tb-04-unknown-key','team-behaviour','minimal.json',[('colour','red')],'colour: not a key of this object'),
 ('tb-05-step-name','team-behaviour','minimal.json',[('steps',{'Claim':{'value':'agent','from':['ready'],'to':'in progress','by':['member']}})],'steps.Claim (name): must match ^[a-z][a-z0-9-]{0,39}$'),
 ('tb-06-value-kind','team-behaviour','minimal.json',[('steps.claim.value','person')],'steps.claim.value: must be one of none, text, agent, item, team, word, verdict'),
 ('tb-07-entry-key','team-behaviour','minimal.json',[('roles.lead',{'entry_person':'Lead'})],'roles.lead.entry_person: must match ^[a-z][a-z0-9_]{0,39}$'),
 ('tb-08-assign','team-behaviour','team.full.json',[('queue.plan.passes.0.assign',{'pick':'lead'})],'queue.plan.passes[0].assign.pick: must be one of holder, role, first_idle, least_loaded'),
 ('tb-09-view-fields','team-behaviour','team.full.json',[('views.claimable.fields',[])],'views.claimable.fields: must have at least 1 entries'),
 ('tb-10-entry-constraint-two-keys','team-behaviour','team.full.json',[('entry_constraints.0',{'disjoint':['lead','members'],'subset':['review_only','members']})],'entry_constraints[0]: must have at most 1 keys'),
 ('tb-11-argument-order','team-behaviour','team.full.json',[('steps.close.arguments.summary.order','after_gate')],'steps.close.arguments.summary.order: must be one of first'),
 ('tb-12-edge-state','team-behaviour','team.full.json',[('views.blocked.select',{'not':{'dependencies_finished':{'handoff_states':['legacy']}}})],'views.blocked.select.not.dependencies_finished.handoff_states: matches none of the allowed forms'),
 ('tm-01-flat-map','teams','teams.example.json',[('schema',DEL)],'missing key schema'),
 ('tm-02-no-people','teams','teams.example.json',[('teams.reviewers.people',DEL)],'teams.reviewers: missing key people'),
 ('tm-03-team-name','teams','teams.example.json',[('teams.T1',{'workflow':'team','people':{'lead':'a'}})],'teams.T1 (name): must match ^[a-z0-9][a-z0-9:_-]{0,63}$'),
 ('tm-04-old-lead-key','teams','teams.example.json',[('teams.reviewers.lead','rex')],'teams.reviewers.lead: not a key of this object'),
 ('tm-05-review-count','teams','teams.example.json',[('teams.t1.review.0.count',0)],'teams.t1.review[0].count: must be at least 1'),
 ('tm-06-limit-level','teams','teams.example.json',[('teams.t1.limits.agent',1)],'teams.t1.limits.agent: not a key of this object'),
 ('td-01-schema','team-definition',None,[],'schema: must be "backlog-team-definition/2"'),
 ('td-02-name','team-definition',None,[('name','Gold')],'name: must match ^[a-z0-9][a-z0-9:_-]{0,63}$'),
 ('td-03-empty-people','team-definition',None,[('people',{})],'people: must have at least 1 keys'),
 ('td-04-blank-name','team-definition',None,[('lists.members',['bob',' cy'])],'lists.members[1]: must match ^\\S(.*\\S)?$'),
 ('wf-01-schema','workflows',None,[('schema','backlog-workflows/1')],'schema: must be "backlog-workflows/2"'),
 ('wf-02-string-definition','workflows',None,[('workflows.team','<the content of team.full.json>')],'workflows.team: must be object'),
 ('wf-03-key-pattern','workflows',None,[('workflows.Team',None)],'workflows.Team (name): must match ^[a-z0-9][a-z0-9._:-]{0,63}$'),
 ('wf-04-inner-error','workflows',None,[('workflows.minimal.initial',5)],'workflows.minimal.initial: must be string'),
]
DEF={'schema':'backlog-team-definition/2','name':'gold','workflow':'team','people':{'lead':'ann'},'lists':{'members':['bob','cy']}}
os.makedirs(os.path.join(D,'schema','negative'),exist_ok=True)
lines=['file\tschema\texpected']
for f,sch,base,ch,exp in ROWS:
  if sch=='team-definition': doc=patch(dict(DEF,schema='backlog-team-definition/9') if f=='td-01-schema' else DEF,ch)
  elif sch=='workflows':
    doc={'schema':'backlog-workflows/2','workflows':{'minimal':T('minimal.json')}}
    if f=='wf-03-key-pattern': doc['workflows']['Team']=T('minimal.json'); ch=[]
    doc=patch(doc,ch)
  else: doc=patch(T(base),ch)
  json.dump(doc,open(os.path.join(D,'schema','negative',f+'.json'),'w'),indent=1,ensure_ascii=False)
  lines.append(f'{f}.json\t{sch}\t{exp}')
open(os.path.join(D,'schema','negative','expected.tsv'),'w').write('\n'.join(lines)+'\n')
print(len(ROWS),'negative examples')
