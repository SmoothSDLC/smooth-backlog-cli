import importlib,json,re,collections,csv,sys
sys.path.insert(0,'.')
import base
for m in 'abcdefgh': importlib.import_module('reqs_'+m)
import valrows
import reqs_rev4  # revision 4: the changes of the three reviews (each change names its finding)
REQS=base.REQS
OUT=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'..','..')+'/'
def num(r): return r['id'].split('-')[1]
fix=lambda s: s.replace('item 1 body contains a definition of done','item 1 has a definition of done in its body')
# assign scenario and test ids
for r in REQS:
  n=num(r); r['sids']=[]; r['tids']=[]
  k=0
  for t,g in r['scen']:
    if g.startswith('See ') or g.startswith('No scenario') or g.startswith('Covered by'):
      r['sids'].append(None); continue
    k+=1; r['sids'].append(f"S-{n}-{k}")
  for i,_ in enumerate(r['tests'],1): r['tids'].append(f"T-{n}-{i}")
# validator outline ids (REQ-013)
r13=[r for r in REQS if r['id']=='REQ-013'][0]
r13['sids']=[f"S-013-{i}" for i in range(1,len(valrows.V)+len(valrows.E)+1)]
# ---- features
feats=collections.OrderedDict()
TITLES={'team-file':'Team files - registries, schema versions, discovery, validation and migration',
 'team-migrate':'Team migrate - a schema 1 backlog is converted once, or the command fails with the reason',
 'validator-keys':'Validator - every input of the team files is checked with an exact message',
 'team-statuses':'Team statuses and steps - the words, the steps and their effects come from the registered definition',
 'team-roles':'Team roles and identity - who may take a step comes from the definition and the team entry',
 'team-claims-handoffs':'Claims and hand-offs - conditions of the definition decide claims, releases, waits and hand-offs',
 'team-review':'Review - stages, passes and the close come from the definition and the entry',
 'team-refinement':'Refinement - refinement steps, decisions, edit rules and completeness come from the definition',
 'team-limits':'Limits - numbers in the team entry, counting rules in the definition',
 'team-creation-dependencies':'Creation and dependencies - team new, binding and dependency waits',
 'team-queue':'Queue - team pop, the plan and the views follow the definition',
 'user-guarantee':'User guarantee - user commands enforce nothing and meet a team item only through the definition',
 'user-flow':'User flow - the user commands refuse nothing; their default words are defaults only',
 'user-gaps':'User capabilities restored or defined after the impact analysis',
 'team-conditional':'Conditional team doors - active once the owner question is answered'}
for r in REQS:
  for (t,g),sid in zip(r['scen'],r['sids'] if r['id']!='REQ-013' else [None]*len(r['scen'])):
    if not sid: continue
    tags=f"@{r['id']} @{sid}"+(f" @conditional @{r['cond']}" if r['cond'] else '')
    body='\n'.join('    '+l.strip() if not l.startswith('  ') else '      '+l.strip() for l in fix(g).split('\n'))
    feats.setdefault(r['feature'],[]).append(f"  {tags}\n  Scenario: {t}\n{body}\n")
vk=[]
rows=[]; okrows=[]
for i,(rule,patch,exp) in enumerate(valrows.V,1): (okrows if exp.endswith(': valid') else rows).append(f"      | S-013-{i} | {rule} | {patch.replace('|','\\|')} | {exp.replace('|','\\|')} |")
vk.append("  @REQ-013 @REQ-012\n  Scenario Outline: <id> a behaviour definition with <rule> is refused with its exact message\n    Given a repository with a backlog\n    And a definition file \"def.json\" from the template \"team.full.json\" with `<patch>`\n    When I run `backlog team validate --file def.json`\n    Then the command fails with exit code 2\n    And the output contains \"<message>\"\n\n    Examples:\n      | id | rule | patch | message |\n"+'\n'.join(rows)+"\n")
rows=[]
o=len(valrows.V)
okE=[]
for i,(rule,js,exp) in enumerate(valrows.E,1): (okE if exp.endswith(': valid') else rows).append(f"      | S-013-{o+i} | {rule} | {js} | {exp} |")
vk.append("  @REQ-013 @REQ-010\n  Scenario Outline: <id> a team definition with <rule> is refused with its exact message\n    Given a repository with a backlog\n    And the backlog registers the workflow \"team\" from the template \"team.full.json\"\n    And the backlog registers the workflow \"minimal\" from the template \"minimal.json\"\n    And a file \"team.json\" outside the backlog contains `<json>`\n    When I run `backlog team validate --file team.json`\n    Then the command fails with exit code 2\n    And the output contains \"<message>\"\n\n    Examples:\n      | id | rule | json | message |\n"+'\n'.join(rows)+"\n")
# revision 4 (R2-005, R2-001, R2-004): rows that must be accepted are outlines of their own
vk.append("  @REQ-013 @REQ-012\n  Scenario Outline: <id> a behaviour definition with <rule> is accepted\n    Given a repository with a backlog\n    And a definition file \"def.json\" from the template \"team.full.json\" with `<patch>`\n    When I run `backlog team validate --file def.json`\n    Then the command succeeds\n    And the output contains \"<message>\"\n\n    Examples:\n      | id | rule | patch | message |\n"+'\n'.join(okrows)+"\n")
vk.append("  @REQ-013 @REQ-010\n  Scenario Outline: <id> a team definition with <rule> is accepted\n    Given a repository with a backlog\n    And the backlog registers the workflow \"team\" from the template \"team.full.json\"\n    And the backlog registers the workflow \"minimal\" from the template \"minimal.json\"\n    And a file \"team.json\" outside the backlog contains `<json>`\n    When I run `backlog team validate --file team.json`\n    Then the command succeeds\n    And the output contains \"<message>\"\n\n    Examples:\n      | id | rule | json | message |\n"+'\n'.join(okE)+"\n")
feats['validator-keys']=vk+feats.get('validator-keys',[])
import os
for f,sc in feats.items():
  open(OUT+f'features/{f}.feature','w').write(f"Feature: {TITLES[f]}\n  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).\n\n"+'\n'.join(sc))
# ---- REQ section
L=['','## 10. Requirements','']
theme={'0':'File identity, schema, discovery, validation, migration','1':'Statuses and steps','2':'Roles, identity and scope','3':'Claims and hand-offs','4':'Review','5':'Refinement, decisions, edit rules, completeness','6':'Limits','7':'Creation, binding, dependencies','8':'Queue, plan, views','9':'User-command code, binding, texts, guards, documentation, conditional and gap requirements'}
last=None
for r in REQS:
  t=num(r)[0]
  if t!=last: L+=[f"### 10.{t} {theme[t]}",'']; last=t
  sc=[s for s in r['sids'] if s] if r['id']!='REQ-013' else [f"S-013-1..S-013-{len(r13['sids'])}"]
  cov=[g for (tt,g) in r['scen'] if g.startswith('See ') or g.startswith('Covered by') or g.startswith('No scenario')]
  L+=[f"#### {r['id']} {r['title']}"+(f" — CONDITIONAL on {r['cond']}" if r['cond'] else ''),'',
      f"- **Statement.** {r['statement']}",f"- **Rationale.** {r['rationale']}",'- **Acceptance criteria.**']+[f"  {i}. {a}" for i,a in enumerate(r['accept'],1)]+[
      f"- **Replaces inventory groups.** {', '.join(r['groups']) if r['groups'] else 'none (gap requirement, see 09-gap-resolution.md)'}",
      f"- **Scenarios.** {', '.join(sc) if sc else 'none'}"+(f" ({'; '.join(cov)})" if cov else ''),
      f"- **Tests.** {', '.join(r['tids'])}",f"- **Phase.** {r['phase']}",'']
core=open(OUT+'03-spec.md').read().split('\n## 10. Requirements\n')[0]  # §1-§9 are edited by hand in 03-spec.md itself
open(OUT+'03-spec.md','w').write(core+'\n'.join(L))
json.dump([{k:r[k] for k in ('id','title','phase','groups','sids','tids','cond','feature')}|{'tests':r['tests']} for r in REQS],open('reqs.json','w'),indent=0)
print(len(REQS),'reqs', sum(len([s for s in r['sids'] if s]) for r in REQS),'scenario ids', sum(len(r['tids']) for r in REQS),'tests')
