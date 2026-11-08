# Reference interpreter of the JSON Schema subset of REQ-012 (used to check the templates against the schema files).
import json,re,sys
def check(v,s,root,path,out,store):
  if '$ref' in s:
    r=s['$ref']; s=store[r] if r in store else eval_ptr(root,r); return check(v,s,root if r not in store else store[r],path,out,store)
  t=s.get('type')
  types={'object':dict,'array':list,'string':str,'boolean':bool,'null':type(None)}
  if t=='integer':
    if not (isinstance(v,int) and not isinstance(v,bool)): out.append(f"{path}: must be a whole number"); return
  elif t and not isinstance(v,types[t]) or (t in('object',) and isinstance(v,bool)): out.append(f"{path}: must be {t}"); return
  if 'const' in s and v!=s['const']: out.append(f"{path}: must be {json.dumps(s['const'])}")
  if 'enum' in s and v not in s['enum']: out.append(f"{path}: must be one of {', '.join(map(str,s['enum']))}")
  if 'anyOf' in s:
    if all(_errs(v,x,root,path,store) for x in s['anyOf']): out.append(f"{path}: matches none of the allowed forms")
  if isinstance(v,str):
    if 'pattern' in s and not re.search(s['pattern'],v): out.append(f"{path}: must match {s['pattern']}")
    if len(v)<s.get('minLength',0): out.append(f"{path}: must not be empty")
  if isinstance(v,int) and not isinstance(v,bool) and 'minimum' in s and v<s['minimum']: out.append(f"{path}: must be at least {s['minimum']}")
  if isinstance(v,list):
    if len(v)<s.get('minItems',0): out.append(f"{path}: must have at least {s['minItems']} entries")
    if 'maxItems' in s and len(v)>s['maxItems']: out.append(f"{path}: must have at most {s['maxItems']} entries")
    if s.get('uniqueItems') and len({json.dumps(x,sort_keys=True) for x in v})!=len(v): out.append(f"{path}: entries must be distinct")
    if 'items' in s:
      for i,x in enumerate(v): check(x,s['items'],root,f"{path}[{i}]",out,store)
  if isinstance(v,dict):
    for k in s.get('required',[]):
      if k not in v: out.append(f"{path}: missing key {k}")
    if len(v)<s.get('minProperties',0): out.append(f"{path}: must have at least {s['minProperties']} keys")
    if 'maxProperties' in s and len(v)>s['maxProperties']: out.append(f"{path}: must have at most {s['maxProperties']} keys")
    props=s.get('properties',{})
    for k,x in v.items():
      p=f"{path}.{k}" if path else k
      if 'propertyNames' in s: check(k,s['propertyNames'],root,p+" (name)",out,store)
      if k in props: check(x,props[k],root,p,out,store)
      elif s.get('additionalProperties') is False: out.append(f"{p}: not a key of this object")
      elif isinstance(s.get('additionalProperties'),dict): check(x,s['additionalProperties'],root,p,out,store)
def _errs(v,s,root,path,store): o=[]; check(v,s,root,path,o,store); return o
def eval_ptr(root,r):
  x=root
  for part in r.lstrip('#/').split('/'): x=x[part]
  return x
if __name__=='__main__':
  schema=json.load(open(sys.argv[1])); store={}
  for extra in sys.argv[3:]: e=json.load(open(extra)); store[e['$id']]=e
  errs=[e[2:] if e.startswith(': ') else e for e in _errs(json.load(open(sys.argv[2])),schema,schema,'',store)]  # R2-030: at the root the '<path>: ' part is omitted
  print('\n'.join(errs) or 'valid'); sys.exit(1 if errs else 0)
