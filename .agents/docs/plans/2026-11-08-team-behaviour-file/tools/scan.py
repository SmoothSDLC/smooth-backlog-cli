import re,os,sys,json
import os
ROOT=os.environ['SRC']
VOCAB=["new","refining","refined","refinement review","ready","in progress","ready for review","reviewing","ready for external review","external review","review complete","closed","archived","pending","done","awaiting decision","refinement-review","review-hitl","peer","external","requested","in_review","passed","changes-requested","in_progress","complete","reject","limit"]
vq='|'.join(re.escape(v) for v in sorted(VOCAB,key=len,reverse=True))
PATS=[
 ('THROW', r"throw new (BacklogError|Error)|\binput\(|\boperation\("),
 ('REFUSE', r"\breject\(|\brefuse\(|refuse:|\bdie\(|\bno\(|`❌|'❌|\"❌|refused\("),
 ('WORD', r"['\"`](%s)['\"`]" % vq),
 ('ROLE', r"teamLead\(|\.lead\b|external_reviewers|review_only|reviewOnly\(|isTeamMember|teamMembers\(|refiner\b|isReviewAuthor|heldBy\(|sameWorker"),
 ('WIP', r"wipRefusal|limitOf|inProgress|alsoActive|claimRefusal|staleReview|wip_override|stale_hours|LEVELS"),
 ('DEP', r"undoneDependencies|dependencyCycle|foreignCycle|openEdges|closeGate|edgeState|dependentsOf"),
 ('REQ', r"missingFields|hasDefinitionOfDone|estimateMin|isSplitSlice|DOD_PLACEHOLDER"),
 ('ENV', r"process\.env\.(TEAM_|BACKLOG_)"),
 ('TEAMFIELD', r"fm\.team\b|\.fm\.team\b|before\.team|a\.team\b|f\.team\b"),
 ('ENGINE', r"stageRules|stageList|team_entry_review_default|\bfill\(|historyLine|seededAuthors|workCommit\(|gitBranch\(|headline\(|teamsConfig\(|severity === 'critical'|forgetTeamsConfig|setTeamsHome|cannot be read or is no JSON|const teamwork|spawnSync\(.git.|split\(.\\n.\)\[0\]"),
 ('CONST', r"^\s*(export )?const [A-Z][A-Z0-9_]+\s*="),
 # R1-002: field reads by identifier, status-helper calls, injected team hooks and callback seams, every environment read
 ('FIELD', r"\bfm\.(claimed_by|claimed_at|reviewer|refiner|review_state|stage|work_commit|reviews|review_history|handoffs|completed|severity|wait_on|owned_since|chunk|owner)\b|\bowned_since\b|'claimed_by'"),
 ('STATUSFN', r"\b(isOpen|isFinished|isUnstarted|normalise|workflowOpen|stageOfStatus|lifted|lift|statusOf|isOpenWord)\("),
 ('SEAM', r"\bteam\?\.|\bteam \?|\bif \(team\)|\bseam\.|\bteam\.(begin|step|after|claims|fieldsBefore|fieldsAfter|missing|options|notice|ender|mark|reviewRefs|outside|refuseOutside|startRefusal|view|early|afterPull|choices|bool|value|verdict)\b|\bteam\[|\{ team = null"),
 ('ENVANY', r"process\.env\.[A-Za-z_]+|process\.env\["),
 ('TEXTTEST', r"\.startsWith\('[a-z][a-z ]{8,}'\)|claim-now|spawnSync\(process\.execPath"),
 ('ROLELIT', r"=== 'owner'|\|\| actor\(\)|\.held\b|held:"),
 ('TEAMTEXT', r"backlog team |any member|for team work|team update --"),
 ('LIMITNUM', r"\b(1500|120000)\b|\* hour\b"),
 ('ERRSHAPE', r"RUNTIME_ERROR|ok: false"),
]
SKIP={'help.js'}  # documentation texts: listed separately
rows=[]
BIN=os.path.join(os.path.dirname(ROOT.rstrip('/')),'bin')  # R1-002: the bootstrap outside src/ is scanned too
WALK=list(os.walk(ROOT))+[(BIN,[],sorted(os.listdir(BIN)))]
for dp,dn,fn in WALK:
  for f in sorted(fn):
    if not f.endswith('.js'): continue
    p=os.path.join(dp,f); rel=os.path.relpath(p,ROOT) if dp!=BIN else 'bin/'+f
    if f in SKIP: continue
    for i,line in enumerate(open(p,encoding='utf8'),1):
      s=line.strip()
      if s.startswith('//') or s.startswith('*'): continue
      code=re.sub(r"\s//\s.*$","",line)
      hits=[k for k,r in PATS if re.search(r,code)]
      if hits: rows.append((rel,i,'+'.join(hits),s[:400]))
for r in rows: print('\t'.join(map(str,r)))
