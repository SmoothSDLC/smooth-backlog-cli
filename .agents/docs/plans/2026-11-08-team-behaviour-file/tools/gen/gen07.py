# Writes 07-traceability.tsv: part A = every inventory row (inventory.tsv) with the scenarios and tests of its requirements,
# part B = every NARROWED/REMOVED impact row (gaps.tsv), part C = requirements that come only from owner questions.
import csv,json,os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')+'/'
R={r['id']:r for r in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'reqs.json')))}
def st(reqs):
  ids=[x for x in reqs.split(',') if x in R]
  sc=[s for i in ids for s in R[i]['sids'] if s]; te=[t for i in ids for t in R[i]['tids']]
  if 'REQ-013' in ids: sc=[s for s in sc if not s.startswith('S-013-')]+[f"S-013-1..S-013-{len(R['REQ-013']['sids'])}"]
  return ','.join(sc) or '-', ','.join(te) or '-'
L=['part\tid\tsite_or_form\tgroup\torigin\tuser_code_enforces_flow\tterminal\tkey_or_reason\treqs\tscenarios\ttests\tphase']
for r in csv.DictReader(open(OUT+'inventory.tsv'),delimiter='\t'):
  s,t=st(r['reqs']); L.append('\t'.join(['A',r['id'],r['site'],r['group'],r['origin'],r['user_code_enforces_flow'],r['terminal'],r['key_or_reason'],r['reqs'] or '-',s,t,r['phase']]))
for g in csv.DictReader(open(OUT+'gaps.tsv'),delimiter='\t'):
  s,t=st(g['requirement']); L.append('\t'.join(['B',g['impact_id'],g['old_form'],'-','-','',g['terminal'],g['resolution'],g['requirement'],s if g['requirement']!='-' else '-',t if g['requirement']!='-' else '-',g['phase']]))
for i,r in R.items():
  if r['cond']:
    s,t=st(i); L.append('\t'.join(['C',i,r['title'],'-','-','','OWNER-QUESTION',r['cond'],i,s,t,r['phase']]))
open(OUT+'07-traceability.tsv','w').write('\n'.join(L)+'\n'); print(len(L)-1,'rows')
