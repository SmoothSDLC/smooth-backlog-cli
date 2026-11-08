# Quality gate 1 (revision 4): the four schemas are valid 2020-12 schemas with absolute $id; every template validates with python
# jsonschema (standard validator, references resolved through a registry) and with the reference interpreter tools/validate_subset.py;
# every negative example fails in both, and the reference interpreter prints exactly the expected message.
import json,os,subprocess,sys,csv
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
S={n:json.load(open(os.path.join(D,'schema',n+'.schema.json'))) for n in ('team-behaviour','teams','team-definition','workflows')}
reg=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in S.values()])
ok=True
for n,s in S.items():
  Draft202012Validator.check_schema(s); assert s['$id'].startswith('urn:backlog:'), n
def std(n,doc): return [f"{'.'.join(map(str,e.absolute_path))}: {e.message}" for e in Draft202012Validator(S[n],registry=reg).iter_errors(doc)]
def ref(n,path):
  extra=[os.path.join(D,'schema',x+'.schema.json') for x in S if x!=n]
  r=subprocess.run([sys.executable,os.path.join(D,'tools','validate_subset.py'),os.path.join(D,'schema',n+'.schema.json'),path,*extra],capture_output=True,text=True)
  return r.returncode,r.stdout.strip()
VALID=[('team-behaviour','templates/team.full.json'),('team-behaviour','templates/minimal.json'),('teams','templates/teams.example.json'),('workflows','templates/workflows.example.json')]
for e in json.load(open(os.path.join(D,'templates','teams.example.json')))['teams'].items(): pass
for n,f in VALID:
  e=std(n,json.load(open(os.path.join(D,f)))); rc,out=ref(n,os.path.join(D,f))
  print(f"VALID   {f:38} jsonschema errors={len(e)}  subset={'valid' if rc==0 else out}")
  ok&= not e and rc==0
for row in csv.DictReader(open(os.path.join(D,'schema','negative','expected.tsv')),delimiter='\t'):
  p=os.path.join(D,'schema','negative',row['file']); e=std(row['schema'],json.load(open(p))); rc,out=ref(row['schema'],p)
  hit=row['expected'] in out.split('\n')
  print(f"INVALID {row['file']:38} jsonschema errors={len(e)}  subset exit={rc} expected message {'found' if hit else 'MISSING: '+out}")
  ok&= bool(e) and rc==1 and hit
print('SCHEMA GATE', 'PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)
