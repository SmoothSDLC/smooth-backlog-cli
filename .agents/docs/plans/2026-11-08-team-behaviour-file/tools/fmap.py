import re,os,csv,sys
import os
ROOT=os.environ['SRC']
def funcs(rel):
  out=[]
  for i,l in enumerate(open(os.path.join(os.path.dirname(ROOT.rstrip('/')),rel) if rel.startswith('bin/') else os.path.join(ROOT,rel),encoding='utf8'),1):
    m=re.match(r"^(?:export )?(?:async )?function\s+(\w+)|^(?:export )?const\s+(\w+)\s*=|^\s{2}(\w+)\s*(?:\(|:\s*(?:\(|async|\w+\s*=>))|^(?:export )?let\s+(\w+)",l)
    if m and l[0]!=' ' or (m and m.group(3)): out.append((i,next(g for g in m.groups() if g)))
  return out
rows=[l.rstrip('\n').split('\t') for l in open('cand.tsv',encoding='utf8')]
rows=[r for r in rows if not r[3].startswith('import ')]
cache={}
res=[]
for f,ln,h,s in rows:
  fs=cache.setdefault(f,funcs(f)); ln=int(ln)
  fn=[n for i,n in fs if i<=ln]
  res.append((f,ln,fn[-1] if fn else '-',h,s))
with open('cand2.tsv','w') as o:
  for r in res: o.write('\t'.join(map(str,r))+'\n')
from collections import Counter
c=Counter((r[0],r[2]) for r in res)
for (f,fn),n in sorted(c.items()): print(f"{f}\t{fn}\t{n}")
print(len(res))
