# Reference implementation of the conversion rules of 06-migration-plan.md §4 (what backlog team migrate does to a schema 1 definition).
# Usage: convert_v1.py <template team.full.json> <schema 1 definition> [out.json]   -> prints the converted definition or the abort line.
# Today (174c76d) a registered schema 1 definition never governed a step (src/team/workflow.js:38,55 read the shipped TEAM; the step
# rules are code), so the behaviour a team on it has is the shipped template's: the conversion keeps that behaviour and only carries the
# names the old file may change (its workflow name, description, review stage names, texts of keys the template has).
import json,sys,copy
DROP=['version','team_entry_example','actors','skipped_stage_rule','pop','plain_commands_on_team_items','plain_commands_outside_teams','review_stages_order','team_entry_review_default','steps','refusals','statuses','finished','side_statuses','workflow','description']
class Abort(Exception): pass
def convert(tpl,old):
  out=copy.deepcopy(tpl)
  # rule 1: identity
  out['workflow']=old['workflow']; out['description']=old.get('description',tpl.get('description',''))
  # rule 2: the vocabulary must be the template's (the code enforced the shipped words whatever the file said)
  if old['statuses']!=tpl['statuses']: raise Abort(f"statuses differs from the template ({', '.join(old['statuses'])} / {', '.join(tpl['statuses'])}); convert this definition by hand")
  if [w for w in old['finished'] if w!='done']!=tpl['finished']: raise Abort(f"finished differs from the template ({', '.join(old['finished'])} / {', '.join(tpl['finished'])}); convert this definition by hand")
  oside={w:{'enter':v['enter'],'leave':v['leave']} for w,v in old.get('side_statuses',{}).items()}
  tside={w:{'enter':v['enter'],'leave':v['leave']} for w,v in tpl.get('side_statuses',{}).items()}
  if oside!=tside: raise Abort('side_statuses differs from the template (enter and leave steps); convert this definition by hand')
  # rule 3: review stages renamed by position; nothing else of the old steps is read
  old_order=old.get('review_stages_order',tpl['review']['stages_order']); t_order=tpl['review']['stages_order']
  if len(old_order)!=len(t_order): raise Abort(f"review_stages_order has {len(old_order)} stages, the template {len(t_order)}; convert this definition by hand")
  ren=dict(zip(t_order,old_order))
  out['review']['stages_order']=list(old_order)
  out['review']['stages']={ren[k]:v for k,v in tpl['review']['stages'].items()}
  for s in out['steps'].values():
    if 'stages' in s: s['stages']={ren[k]:v for k,v in s['stages'].items()}
  # rule 4: defaults.review from team_entry_review_default reduced to {stage, count}
  if 'team_entry_review_default' in old:
    out['defaults']['review']=[{'stage':r['stage'],'count':r['count']} for r in old['team_entry_review_default']]
  else:
    for r in out['defaults']['review']: r['stage']=ren[r['stage']]
  # rule 5: every other key is the template's; refusals overlaid only with old texts of keys the template has
  for k,v in old.get('refusals',{}).items():
    if k in out['refusals']: out['refusals'][k]=v
  dropped=sorted(k for k in old if k not in ('schema',) and k not in tpl or k in ('version','team_entry_example','actors','review_stages_order','team_entry_review_default'))
  ignored=sorted(k for k in old.get('refusals',{}) if k not in out['refusals'])
  return out,dropped,ignored
if __name__=='__main__':
  tpl=json.load(open(sys.argv[1])); old=json.load(open(sys.argv[2]))
  try: out,dropped,ignored=convert(tpl,old)
  except Abort as e: print(f'❌ backlog: {sys.argv[2]}: {e}'); sys.exit(2)
  text=json.dumps(out,indent=2,ensure_ascii=False)+'\n'
  if len(sys.argv)>3: open(sys.argv[3],'w').write(text)
  else: sys.stdout.write(text)
  sys.stderr.write(f'dropped keys: {", ".join(dropped) or "none"}; old refusal keys the template does not have: {", ".join(ignored) or "none"}\n')
