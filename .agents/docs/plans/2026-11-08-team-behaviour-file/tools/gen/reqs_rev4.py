# Revision 4 overlay: every change the three reviews (reviews/R1, R2, R3) caused in the requirement data, applied after reqs_a..h.
# Each change names its finding; 10-review-log.md lists the dispositions.
import re,base
from base import BG_TEAM
REQS=base.REQS
def get(i): return next(r for r in REQS if r['id']==i)
def upd(i,**k): get(i).update(k)
def acc(i,*a,replace=None):
  r=get(i)
  if replace is not None: r['accept']=list(a)
  else: r['accept']+=list(a)
def scen(i,t,g): get(i)['scen'].append((t,g))
def test(i,*t): get(i)['tests'].append(t)
def new(*a,**k): base.R(*a,**k); return REQS[-1]
import rev4_a, rev4_b, rev4_c, rev4_d  # noqa: E402  (split for size)
