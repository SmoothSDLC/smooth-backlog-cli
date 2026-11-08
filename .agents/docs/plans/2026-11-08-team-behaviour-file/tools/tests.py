import re,glob,os
import os
D=os.environ['TESTS']
FILE_THEME={
 'shared-team-lifecycle':'T-STEPS','shared-team-stages':'T-REFINE','shared-unrefined-claim':'T-REFINE','shared-team-status-order':'T-STATUS',
 'shared-team-flow':'T-STEPS','shared-twostage':'T-REVIEW','shared-session-review':'T-REVIEW','shared-session-continue':'T-CLAIM','shared-session-names':'T-CLAIM',
 'shared-team-pop':'T-QUEUE','shared-team-lead-pop':'T-QUEUE','shared-team-plan':'T-QUEUE','shared-team-work':'T-STEPS','shared-team-scope':'T-SCOPE',
 'shared-team-teams':'T-ROLES','shared-team-compat':'T-LEGACY','shared-legacy-fields':'T-LEGACY','shared-team-done':'T-BINDING',
 'shared-handoff-close':'T-HANDOFF','shared-handoff-commands':'T-HANDOFF','shared-handoff-core':'T-HANDOFF','shared-handoff-e2e':'T-HANDOFF','shared-handoff-gate':'T-HANDOFF',
 'shared-wip':'T-WIP','plain-team-items':'T-BINDING','plain-team-env':'T-BINDING','team-boundary':'T-BINDING','workflow':'T-FILE','team-cli':'T-FILE',
 'shared-foreign-deps':'T-DEPS',
}
MIXED_KW=[('T-REFINE',r'definition of done|refin|incomplete|\bstage'),('T-USERCONV',r'archive .*(done|not-done|open item|force)|--status done|list new, open|open and the done|status takes any word|default stays pending|returns from done|completes'),('T-WIP',r'work-in-progress|wip|limit'),('T-HANDOFF',r'hand-?off'),('T-REVIEW',r'review|verdict|pass(es)?\b'),('T-REFINE',r'refin|stage|incomplete|definition of done'),
 ('T-CLAIM',r'\bclaim|releas|holder|\bowner\b'),('T-DEPS',r'depend'),('T-BINDING',r'\bteam\b'),('T-STATUS',r'status|closed|done|finished|open item|archiv'),('T-QUEUE',r'\bpop\b|plan|queue|next\b|priority|critical')]
DI_FILES={'shared-frontmatter','shared-sync','shared-sync-db','shared-store','shared-safety','storage-location','shared-stale','upgrade','release','release-pr','package','install-script','no-private-details','no-child-process-proof','shared-no-classes','shared-symlinked-parent','shared-checkout','shared-origin-setting','shared-setup','update-notice','script-runs','shared-long-name','shared-repair','shared-item-keys','shared-fixtures','shared-audit','features','router','removed-forms','commands-documented','skill-commands','team-spelling-docs','shared-help','fields','new-ask','shared-index','shared-changed','shared-read-commands','shared-routed-commands','shared-list'}
out=[]
for f in sorted(glob.glob(D+'/*.test.js')):
  b=os.path.basename(f)[:-8]; t=open(f,encoding='utf8').read()
  for m in re.finditer(r"^\s*(?:test|it)\(\s*(['\"`])(.*?)\1",t,re.M):
    title=m.group(2); line=t[:m.start()].count('\n')+1
    if b in FILE_THEME: th=FILE_THEME[b]; cls='CODE-LITERAL'
    elif b in DI_FILES:
      th='-'; cls='OTHER'
      for k,r in MIXED_KW:
        if b in ('shared-list','shared-index','shared-changed','shared-read-commands','shared-routed-commands','shared-help','fields') and re.search(r'\bteam\b|claim|review|wip|limit|depend|refin',title,re.I): th=k if re.search(r,title,re.I) else th
      if th!='-': cls='CODE-LITERAL'
    else:
      th='-'; cls='OTHER'
      tt=re.sub(r'^review P\d+( \([^)]*\))?:\s*','',title)
      for k,r in MIXED_KW:
        if re.search(r,tt,re.I): th=k; cls='CODE-LITERAL'; break
    out.append((b+'.test.js',line,th,cls,title))
# R3-019 (revision 4): the disposition of every literal-asserting test under the new harness and the template, with its reason
LEAD={b for b in os.listdir(D) if b.endswith('.test.js') and 'TEAM_LEAD' in open(os.path.join(D,b),encoding='utf8').read()}
OLDFM={b for b in os.listdir(D) if b.endswith('.test.js') and re.search(r'stage: |review_state: |status: (pending|in_progress)',open(os.path.join(D,b),encoding='utf8').read())}
UNBOUND={'shared-handoff-e2e.test.js','shared-update.test.js','shared-team-work.test.js','shared-sync-db.test.js','shared-handoff-commands.test.js','features.test.js','shared-team-stages.test.js','shared-audit.test.js','shared-team-lead-pop.test.js','shared-foreign-deps.test.js'}  # the probe of R3-002: team steps routed to items without a team
FIX={'shared-team-stages.test.js:275':('deleted','--lead is removed (REQ-206); replaced by T-206-2'),
 'plain-team-items.test.js:75':('changed','team update --replan names an item outside a team, refused by D-06'),
 'shared-handoff-e2e.test.js:323':('changed','--status done is status_flag under the template; the gate text appears only via --close'),
 'shared-legacy-fields.test.js:43':('changed','tests removal of work_class/review_classes on write (storage), not covered by the migration word table'),
 'shared-team-teams.test.js:128':('changed','set-team of an item of t2 under session_team_only is refused with other_team'),
 'shared-handoff-commands.test.js:142':('rewrite','recordHandoff loses its refusals to the template; the three texts are asserted through the CLI'),
 'shared-update.test.js:285':('rewrite','the session-bound text comes from the environment read the guard forbids; becomes the outside_update text'),
 'shared-wip.test.js:89':('rewrite','stale_hours moves to views.wip.stale_hours of the definition'),
 'shared-move-archive.test.js:143':('misclassified','a path check of the archive folder (storage)')}
def disp(a,l,c):
  if c!='CODE-LITERAL': return ('-','')
  k=f'{a}:{l}'
  if k in FIX: return FIX[k]
  if a=='shared-handoff-core.test.js': return ('misclassified','record format machinery (§8), not a team literal')
  why=[w for w,ok in (('names the lead through TEAM_LEAD',a in LEAD),('writes schema 1 front matter',a in OLDFM),('routes team steps to items without a team',a in UNBOUND)) if ok]
  return ('harness','the shared harness changes (05 §2.1): '+'; '.join(why)) if why else ('unchanged','')
open('tests.tsv','w').write('id\tfile:line\ttheme\tclass\tdisposition\treason\ttitle\n'+''.join(f"TST-{i+1:03d}\t{a}:{l}\t{th}\t{c}\t{d[0]}\t{d[1]}\t{ti}\n" for i,(a,l,th,c,ti) in enumerate(out) for d in [disp(a,l,c)]))
from collections import Counter
print(Counter((c) for *_,c,_ in [(0,0,0,o[3],0) for o in out]))
print(sorted(Counter(o[2] for o in out if o[3]=='CODE-LITERAL').items()))
for o in out:
  if o[0][:-8] not in FILE_THEME and o[3]=='CODE-LITERAL': print(o[0],o[2],o[4][:110])
