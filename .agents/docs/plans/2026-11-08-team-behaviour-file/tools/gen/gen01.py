# Regenerates §2 (counts), §3 (groups) and §4 (USER-CODE-ENFORCES-FLOW sites) of 01-inventory.md from inventory.tsv and tools/groups.py
# (revision 4: the hand-written counts drifted from the regenerated inventory, R1-002).
import csv,os,sys,collections,re
B=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')
sys.path.insert(0,os.path.join(B,'tools')); import groups
inv=list(csv.DictReader(open(os.path.join(B,'inventory.tsv')),delimiter='\t'))
o=collections.Counter(r['origin'] for r in inv); t=collections.Counter(r['terminal'] for r in inv)
fl=[r for r in inv if r['user_code_enforces_flow']]; fg=collections.Counter(r['group'] for r in fl)
sites=len({r['site'] for r in inv})
S2=['## 2. Counts (they reconcile)','','| | rows |','|---|---|',f'| discovered sites (file:line) | {sites} |',f'| rows (one per rule; {len(inv)-sites} lines carry two to four rules) | **{len(inv)}** |']
S2+=[f'| {k} | {o[k]} |' for k in ('CODE','DATA-INTEGRITY','SHIPPED-DATA','CONFIG')]+[f'| sum of origins | {sum(o.values())} |',f'| rows flagged USER-CODE-ENFORCES-FLOW | {len(fl)} ({len(fg)} groups) |','','| terminal state | rows |','|---|---|']
for k in ('MOVED-TO-FILE','STAYS','DELETED','OWNER-QUESTION'):
  c=collections.Counter(r['origin'] for r in inv if r['terminal']==k); S2.append(f"| {k} | {t[k]} ({', '.join(f'{a} {b}' for a,b in c.most_common())}) |")
S2+=[f'| total | {len(inv)} |','','Before revision 4 the scanner found 843 rows (it missed field reads, status-helper calls, hooks and `bin/`, and gave a line with two rules one row; R1-002).','']
gc=collections.Counter(r['group'] for r in inv)
S3=['## 3. Groups (one rule each; every row of `inventory.tsv` belongs to exactly one)','','| group | origin | rows | user-command flag | terminal | key / reason | REQ |','|---|---|---|---|---|---|---|']
for g,v in groups.G.items():
  if gc[g]: S3.append(f"| {g} | {v[0]} | {gc[g]} | {fg[g]} | {v[4]} | {v[5]} | {', '.join(v[6])} |")
S3.append('')
S4=[f'## 4. USER-CODE-ENFORCES-FLOW sites ({len(fl)} rows in {len(fg)} groups)','','Each group is one rule; the sites are the rows of `inventory.tsv` with the flag. Rows of `src/shared/status.js` are flagged because every user command loads that module and through it the shipped team vocabulary.','']
for g in sorted(fg):
  v=groups.G[g]; S4.append(f"- **{g}** ({fg[g]} rows; {v[4]} {v[5]}): {v[3]}. Sites: "+', '.join(f"`{r['site'][4:] if r['site'].startswith('src/') else r['site']}`" for r in fl if r['group']==g))
S4.append('')
p=os.path.join(B,'01-inventory.md'); s=open(p).read()
i=s.index('## 2. Counts'); j=s.index('## 5. Findings')
s=s[:i]+'\n'.join(S2+S3+S4)+'\n'+s[j:]
open(p,'w').write(s); print(len(inv),dict(t))
