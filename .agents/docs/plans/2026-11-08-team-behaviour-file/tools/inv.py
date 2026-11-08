import re,collections,groups,rules
G=groups.G; R=rules.R
rows=[l.rstrip('\n').split('\t') for l in open('cand2.tsv',encoding='utf8')]
out=[];miss=[];seen=set()
for f,ln,fn,h,s in rows:
  ln=int(ln); rs=R.get(f)
  if not rs: miss.append(f); continue
  g=None
  for st,gid in rs:
    if st<=ln: g=gid
  if g is None: g=rs[0][1]
  if 'SEAM' in h.split('+') and f.startswith('shared/'): g='PC-HOOKS'  # R1-001: an injected hook or seam in a user module
  g=rules.OVR.get((f,ln),g); seen.add((f,ln))
  for gg in rules.MULTI.get((f,ln),[g]): out.append((f,ln,h,s,gg))
assert not miss, set(miss)
assert not (set(rules.OVR)|set(rules.MULTI))-seen, sorted((set(rules.OVR)|set(rules.MULTI))-seen)
def text(s):
  m=re.search(r"(?:reject|refuse|no|die|refused)\(\s*(`[^`]*`|'[^']*'|\"[^\"]*\")",s) or re.search(r"refuse:\s*(`[^`]*`|'[^']*')",s) or re.search(r"(?:BacklogError\('[A-Z_]+',\s*|input\([^,]*,\s*|operation\([^,]*,\s*)(`[^`]*`|'[^']*')",s)
  return m.group(1)[1:-1][:220].replace('\t',' ') if m else ''
hdr=['id','site','group','trigger','origin','user_code_enforces_flow','commands','rule','refusal_text','terminal','key_or_reason','reqs','phase']
L=['\t'.join(hdr)]
cnt=collections.Counter(); term=collections.Counter(); pl=[]
for i,(f,ln,h,s,g) in enumerate(out,1):
  o,p,c,rule,t,k,reqs,ph=G[g]
  flag='USER-CODE-ENFORCES-FLOW' if p=='Y' and f.startswith('shared/') else ''
  rid=f"INV-{i:03d}"
  L.append('\t'.join([rid,(f if f.startswith('bin/') else f"src/{f}")+f":{ln}",g,h,o,flag,c,rule,text(s),t,k,','.join(reqs),ph]))
  cnt[o]+=1; term[t]+=1
  if flag: pl.append((rid,f,ln,g))
open('inventory.tsv','w').write('\n'.join(L)+'\n')
print(len(out),dict(cnt),dict(term),len(pl))
# R1-004 rule: a row in the user-command code that reads, writes or compares a status word, a role field or a team scope is never DATA-INTEGRITY
bad=[(f,ln,g) for f,ln,h,s,g in out if f.startswith('shared/') and G[g][0]=='DATA-INTEGRITY' and set(h.split('+'))&{'FIELD','STATUSFN','SEAM'} and not re.search(r'fm\.(chunk|severity)\b',s)]  # chunk and severity are user data fields, not roles
assert not bad, bad
gc=collections.Counter(r[4] for r in out); print(len(gc),'groups used'); print(sorted(set(G)-set(gc)))
pg=collections.Counter(r[3] for r in pl); print(pg)
