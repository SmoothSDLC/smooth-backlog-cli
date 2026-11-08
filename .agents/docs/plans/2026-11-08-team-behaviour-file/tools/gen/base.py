REQS=[]
def R(id,title,phase,groups,statement,rationale,accept,scen,tests,feature,cond=None):
    REQS.append(dict(id=id,title=title,phase=phase,groups=groups,statement=statement,rationale=rationale,accept=accept,scen=scen,tests=tests,feature=feature,cond=cond))
BG_TEAM='Given a repository with a backlog\n  And the backlog registers the workflow "team" from the template "team.full.json"\n  And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"'
