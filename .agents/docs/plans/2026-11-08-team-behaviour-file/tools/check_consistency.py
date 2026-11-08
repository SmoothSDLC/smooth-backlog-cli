# Quality gate 2 (revision 4): ids and counts across 03 §10 (tools/gen/reqs.json), features/, 04, 05, 06, 07, inventory.tsv,
# gaps.tsv, consumers.tsv and tests.tsv. Prints every problem; exit 1 when there is one.
import csv,json,os,re,glob,collections,sys
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
P=[];ok=lambda c,m: c or P.append(m)
R=json.load(open(os.path.join(D,'tools','gen','reqs.json'))); RID={r['id'] for r in R}
ok(len(RID)==len(R),'duplicate REQ ids')
sids=[s for r in R for s in r['sids'] if s]; tids=[t for r in R for t in r['tids']]
ok(len(sids)==len(set(sids)),'duplicate scenario ids'); ok(len(tids)==len(set(tids)),'duplicate test ids')
spec=open(os.path.join(D,'03-spec.md')).read()
for r in R:
  ok(r['tids'],f"{r['id']} has no test")
  ok(any(r['sids']) or r['id'] in re.findall(r'#### (REQ-\d+)',spec),f"{r['id']} missing in 03")
  if not any(r['sids']): ok(re.search(re.escape(r['id'])+r'.*?- \*\*Scenarios\.\*\* none \((No scenario|Covered by|See )',spec,re.S),f"{r['id']} has no scenario and no stated reason")
# features
tags=collections.Counter(); out=collections.Counter()
for f in glob.glob(os.path.join(D,'features','*.feature')):
  t=open(f).read()
  for m in re.finditer(r'@(S-\d{3}-\d+)',t): tags[m.group(1)]+=1
  for m in re.finditer(r'\| (S-013-\d+) \|',t): out[m.group(1)]+=1
fs=set(tags)|set(out)
ok(fs==set(sids),f'feature ids differ from 03: only in features {sorted(fs-set(sids))[:5]}, only in 03 {sorted(set(sids)-fs)[:5]}')
ok(all(v==1 for v in tags.values()) and all(v==1 for v in out.values()),'a scenario id appears twice in features')
for f in glob.glob(os.path.join(D,'features','*.feature')):
  for m in re.finditer(r'@(REQ-\d{3})',open(f).read()): ok(m.group(1) in RID,f'dangling {m.group(1)} in {os.path.basename(f)}')
# 05, 06
t05=open(os.path.join(D,'05-tdd-plan.md')).read(); t06=open(os.path.join(D,'06-migration-plan.md')).read()
for t in tids: ok(f'| {t} |' in t05,f'{t} missing in 05')
phases=set(re.findall(r'^## (PH-[0-9a-z]+) ',t06,re.M))
for r in R: ok(r['phase'] in phases|{'-'},f"{r['id']} phase {r['phase']} not in 06")
for t in set(re.findall(r'\bT-\d{3}-\d+\b',t05+t06)): ok(t in tids,f'dangling {t}')
for s in set(re.findall(r'\bS-\d{3}-\d+\b',t06+open(os.path.join(D,'04-bdd.md')).read())): ok(s in sids,f'dangling {s}')
# inventory and 07
inv=list(csv.DictReader(open(os.path.join(D,'inventory.tsv')),delimiter='\t'))
TERM={'STAYS','MOVED-TO-FILE','DELETED','OWNER-QUESTION'}
for r in inv:
  ok(r['terminal'] in TERM,f"{r['id']} terminal {r['terminal']}")
  for q in r['reqs'].split(','): ok(not q or q in RID,f"{r['id']} dangling {q}")
  ok(r['phase'] in phases|{'-'},f"{r['id']} phase {r['phase']}")
  if r['terminal']!='STAYS': ok(r['phase']!='-' ,f"{r['id']} {r['terminal']} without phase")
ok(len({r['id'] for r in inv})==len(inv),'duplicate inventory ids')
tr=list(csv.DictReader(open(os.path.join(D,'07-traceability.tsv')),delimiter='\t'))
A=[r for r in tr if r['part']=='A']; B=[r for r in tr if r['part']=='B']
ok([r['id'] for r in A]==[r['id'] for r in inv],'07 part A differs from inventory')
gaps=list(csv.DictReader(open(os.path.join(D,'gaps.tsv')),delimiter='\t'))
ok(len(B)==len(gaps),'07 part B differs from gaps.tsv')
for g in gaps:
  for q in g['requirement'].split(','): ok(q=='-' or q in RID,f"{g['impact_id']} dangling {q}")
  ok(g['phase'] in phases|{'-'},f"{g['impact_id']} phase {g['phase']}")
for c in csv.DictReader(open(os.path.join(D,'consumers.tsv')),delimiter='\t'):
  for p in c['phase'].split(', '): ok(p in phases,f"{c['id']} phase {p}")
tests=list(csv.DictReader(open(os.path.join(D,'tests.tsv')),delimiter='\t'))
lit=[t for t in tests if t['class']=='CODE-LITERAL']
ok(all(t['disposition'] in {'unchanged','harness','rewrite','changed','deleted','misclassified'} for t in lit),'literal test without disposition')
ok(all(t['reason'] for t in lit if t['disposition']!='unchanged'),'non-unchanged disposition without reason')
q08=open(os.path.join(D,'08-owner-questions.md')).read()
for q in {r['cond'] for r in R if r['cond']}: ok(f'## {q} ' in q08 or f'({q})' in q08,f'{q} used by a REQ but not in 08')
print(f"REQ {len(R)}, scenario ids {len(sids)}, tests {len(tids)}, phases {len(phases)}, inventory {len(inv)} ({dict(collections.Counter(r['terminal'] for r in inv))}), 07 A/B/C {len(A)}/{len(B)}/{len(tr)-len(A)-len(B)}, literal tests {len(lit)}")
print('\n'.join(P) or 'CONSISTENCY GATE PASS'); sys.exit(1 if P else 0)
