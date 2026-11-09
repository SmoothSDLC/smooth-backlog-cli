# Writes the allow / deny examples of every control of a behaviour definition (team.full.examples.md): for each status rule,
# role, step, argument, condition, verdict, edit rule, queue offer, plan pass, view, user-command operation and the containers,
# a one-line description, an ALLOW example, a DENY example and the refusal text the enforcer prints (placeholders filled with
# sample values). The schema forbids description keys inside a definition (additionalProperties false), so the examples live
# next to it. Part B shows the format features the definition does not use, each as a fragment that is merged into a copy of
# the definition and checked with the schema interpreter and the semantic rules before it is printed.
# Usage: examples.py <definition.json> [<team entry: define input or teams.json> [<team name>]] [--features] [--by-key=<k>,..] > examples.md
# --by-key prints those text keys by name instead of their text (the text stays in the definition).
import copy, json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import check_semantics as CS

BY_KEY = set(next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--by-key=')), []))
args = [a for a in sys.argv[1:] if not a.startswith('--')]; FEATURES = '--features' in sys.argv
D = json.load(open(args[0])); WF = D['workflow']
ENTRY, TEAM = {}, 't1'
if len(args) > 1:
    e = json.load(open(args[1]))
    if 'teams' in e: TEAM = args[2] if len(args) > 2 else next(iter(e['teams'])); ENTRY = e['teams'][TEAM]
    else: TEAM, ENTRY = e['name'], e
TEXTS = {**D.get('refusals', {}), **D.get('instructions', {})}
ROLES = D['roles']; STEPS = D['steps']; WORDS = D['statuses'] + list(D.get('side_statuses', {}))
MEM = (ENTRY.get('lists', {}).get('members') or []) + ['member-1', 'member-2', 'member-3']
HOLD, REV = (MEM[1], MEM[2]) if len(MEM) > 5 else ('member-2', 'member-3')
OUT = []
def w(s=''): OUT.append(s)

def agent(role, seen=()):
    src = ROLES.get(role, {})
    if 'entry_person' in src: return ENTRY.get('people', {}).get(src['entry_person'], f"{src['entry_person']}-1")
    if 'entry_list' in src:
        names = ENTRY.get('lists', {}).get(src['entry_list'])
        return names[0] if names else f"{src['entry_list'].rstrip('s')}-1"
    if 'entry_rule_teams' in src: return 'rule-reviewer-1'
    if 'item_field' in src or 'item_fields' in src: return REV if src.get('item_field') == 'reviewer' else HOLD
    if 'union' in src: return agent(src['union'][0], seen + (role,))
    if 'literal' in src: return src['literal']
    return MEM[0]
OUTSIDER = 'outsider-1'
SAMPLE = {'item': '12-add-login', 'slug': '12-add-login', 'seq': '12', 'team': TEAM, 'item_team': TEAM, 'session_team': TEAM,
          'workflow': WF, 'holder': HOLD, 'holder_or_nobody': HOLD, 'holder_or_author': HOLD, 'claimed_at': '2026-01-05T10:00:00Z',
          'refiner': HOLD, 'refiner_or_nobody': HOLD, 'refine_started': '2026-01-05T09:00:00Z', 'reviewer': REV,
          'reviewer_if_active': REV, 'review_started': '2026-01-05T11:00:00Z', 'reviewed_at': '2026-01-05T11:30:00Z',
          'lead': agent('lead') if 'lead' in ROLES else 'lead-1', 'list': '12-add-login, 14-add-logout', 'belong': 'belong', 'n': '1',
          'missing': 'estimate_min', 'how': 'backlog team update <item> --team <team> --agent <agent> --set-estimate <minutes>',
          'review_refs': 'review/code.md', 'stage': (D.get('review', {}).get('stages_order') or ['stage'])[0], 'verdict': 'complete',
          'VERDICT': 'COMPLETE', 'records_verdict': 'COMPLETE', 'need': '1', 'have': '0', 'reviewers_text': 'a member of team ' + TEAM,
          'reason_text': 'fatal: bad revision', 'level': 'member', 'of': '', 'limit': '1', 'count': '1', 'held': 'owner/name#9', 'hint': '',
          'limit_text': 'the member work-in-progress limit is 1', 'dependents': '14', 'dependent': '14', 'edges': '14 unaccepted',
          'state': 'unaccepted', 'command': 'backlog team update 12 --team ' + TEAM + ' --agent <lead> --accept-handoff 14 --checks "<checks>"',
          'repository': 'owner/name', 'branch': 'main', 'bound': 'owner/name:main', 'cwd': '/work', 'forced': '', 'teams': 'reviewers',
          'argument': 'note', 'id': '9', 'where': '', 'note': '<note>', 'summary': '<summary>', 'reason': '<reason>', 'comments': '<comments>',
          'comments_line': '<comments>', 'now': '2026-01-05T12:00:00Z', 'today': '2026-01-05', 'work_commit': '1a2b3c4', 'first': '9',
          'repositories': 'owner/other', 'seqs': '12, 14', 'review_refusal': 'review rule not met', 'idle_reason': 'no claimable item',
          'claim_refusal': '', 'actor_or_none': OUTSIDER, 'actor_or_nobody': OUTSIDER, 'sha': '5d6e7f8', 'role': 'lead', 'flags': '--set-estimate',
          'caller': MEM[0], 'value': MEM[0]}

def fill(key, **kw):
    if key in BY_KEY: return f'(text {key} of the definition)'
    t = TEXTS.get(key, f'<text {key} missing>')
    for k, v in D.get('texts', {}).get('conditional', {}).items(): kw.setdefault(k, '')
    vals = {**SAMPLE, **kw}
    return re.sub(r'<([A-Za-z_]+)>', lambda m: str(vals[m.group(1)]) if m.group(1) in vals else m.group(0), t)

def roles_text(rs): return ' or '.join(rs)
def P(p):
    """A predicate or condition test in words."""
    if not isinstance(p, dict) or not p: return str(p)
    k = [x for x in p if x not in ('refusal', 'when', 'unless', 'force', 'order', 'exact')]
    if not k: return 'always'
    k, v = k[0], p[k[0]]; ex = ' (exact name)' if p.get('exact') else ''
    m = {'all': lambda: 'all of (' + '; '.join(P(x) for x in v) + ')', 'any': lambda: 'any of (' + '; '.join(P(x) for x in v) + ')',
         'all_of': lambda: 'all of (' + '; '.join(P(x) for x in v) + ')', 'any_of': lambda: 'any of (' + '; '.join(P(x) for x in v) + ')',
         'not': lambda: 'not (' + P(v) + ')', 'status_in': lambda: 'the status is ' + ' or '.join(v), 'status_not_in': lambda: 'the status is not ' + ' or '.join(v),
         'finished': lambda: 'the status is a finished word', 'field_empty': lambda: f'field {v} is empty', 'field_present': lambda: f'field {v} is set',
         'field_exists': lambda: f'field {v} exists', 'field_absent': lambda: f'field {v} does not exist', 'field_true': lambda: f'field {v} is true',
         'field_is_actor': lambda: f'field {v} names the actor{ex}', 'field_empty_or_actor': lambda: f'field {v} is empty or names the actor{ex}',
         'field_equals_flag_value': lambda: f'field {v} equals the flag value', 'actor_has_role': lambda: f'the actor holds role {v}',
         'actor_lacks_role': lambda: f'the actor lacks role {v}', 'flag_value_lacks_role': lambda: f'the agent named by the flag value lacks role {v}',
         'actor_equals_flag_value': lambda: 'the actor is the flag value', 'flag_value_empty': lambda: 'the flag value is empty', 'unbound': lambda: 'the item has no team',
         'argument_present': lambda: f'--{v} is given', 'dependencies_finished': lambda: 'every dependency is finished' + (f" with a hand-off edge in state {', '.join(v['handoff_states'])}" if v.get('handoff_states') else ''),
         'waits_on_other_repository': lambda: 'a dependency in another repository is unfinished', 'waits_on_actor_items': lambda: 'a dependency is held by the actor',
         'complete': lambda: 'every completeness rule passes', 'incomplete': lambda: 'a completeness rule fails', 'within_limits': lambda: 'the item fits the ' + ', '.join(v) + ' limits',
         'within_limits_for_role': lambda: f"the item fits the {', '.join(v['levels'])} limits of the {v['role']}", 'within_limits_of_target_team': lambda: 'the item fits the ' + ', '.join(v) + ' limits of the target team',
         'matches_limits_active_item': lambda: 'the item counts as active work', 'actor_active_items_at_most': lambda: f'the actor holds at most {v} other active item(s)',
         'stale': lambda: f"field {v['field']} is older than review.stale_after_seconds", 'last_review_rejected': lambda: f"the last entry of {v['history_field']} is {v['verdict']}",
         'review_rules_met': lambda: f"the review rules of step {v['step']} are met", 'team_count': lambda: f"at most {v['at_most']} team item(s) match ({P(v['select'])})",
         'review_passes_met': lambda: f"every review stage of the entry has its passes on the current {v['commit_field']}", 'no_later_own_work': lambda: f"no own commit after {v['commit_field']} names the item",
         'dependents_handoffs_accepted': lambda: 'every dependent has an accepted hand-off', 'dependent_exists': lambda: 'the flag value names a dependent',
         'handoff_record_exists': lambda: 'a hand-off record for that dependent exists', 'handoff_record_has_commit': lambda: 'that hand-off record has a commit',
         'not_caller_session_of': lambda: f'the caller session is not the session in {v}', 'flag_value_is_configured_team': lambda: 'the flag value names a configured team'}
    return m[k]() if k in m else f'{k}: {json.dumps(v)}'

def cmd(step, actor, extra='', verdict=None):
    s = STEPS.get(step, {}); val = {'agent': ' member-1', 'item': ' 14', 'team': ' ' + TEAM, 'text': ' "<text>"', 'word': ' ' + D['statuses'][0],
                                    'verdict': ' ' + (verdict or next(iter(s.get('verdicts', {'complete': 0})))), 'none': ''}[s.get('value', 'none')]
    req = ''.join(f' --{a} "<{a}>"' for a, x in s.get('arguments', {}).items() if x.get('required') and a != 'value')
    return f'`backlog team update 12 --team {TEAM} --agent {actor} --{step}{val}{req}{extra}`'

def first_from(s, leg=None):
    f = (leg or s).get('from') or ['*']
    return D['statuses'][0] if f == ['*'] else f[0]

def step(name, s):
    w(f'### Step `{name}`'); w()
    legs = s.get('stages') or {None: s}
    for st_, leg in legs.items():
        by = leg.get('by') or s.get('by'); a = agent(by[0]); fr = leg.get('from') or s.get('from') or ['*']
        to = leg.get('to') or s.get('to') or ('by verdict' if s.get('verdicts') else 'by its to rules')
        where = f' (stage {st_})' if st_ else ''
        w(f"- **What{where}:** `--{name}` runs from {', '.join(fr)} and moves the item to {to}; run by {roles_text(by)}"
          + (f"; never by {roles_text(s['not_by'])}" if s.get('not_by') else '') + f"; value: {s.get('value', 'none')}; actor: {s.get('actor', 'by')}.")
        w(f"- **Allow:** item in status {first_from(s, leg)}, {cmd(name, a)} → the step runs" + (f", status {to}" if not s.get('verdicts') else '') + '.')
        if fr != ['*']:
            other = next((x for x in WORDS if x not in fr), None)
            if other: w(f"- **Deny (status):** item in status {other}, {cmd(name, a)} → `❌ {fill(s.get('from_refusal', 'wrong_status'), status=other, step=name, actor=a, **{'from': ', '.join(fr)})}`")
        if 'anyone' not in by:
            w(f"- **Deny (actor):** {cmd(name, OUTSIDER)} → `❌ {fill(s.get('by_refusal', 'wrong_actor'), step=name, who=roles_text(by), actor=OUTSIDER)}`")
    if s.get('not_by'):
        a = agent(s['not_by'][0])
        w(f"- **Deny (not_by {', '.join(s['not_by'])}):** {cmd(name, a)} → `❌ {fill(s.get('not_by_refusal', 'wrong_actor'), step=name, who=roles_text(s.get('by', [])), actor=a)}`")
    for arg, x in s.get('arguments', {}).items():
        if x.get('required'): w(f"- **Argument `--{arg}` required:** without it → `❌ {fill(x.get('refusal', 'missing_argument'), step=name, argument=arg)}`")
        if x.get('cites_field'): w(f"- **`--{arg}` cites {x['cites_field']}:** allow `--{arg} \"... review/code.md ...\"`; deny `--{arg} \"looks fine\"` → `❌ {fill(x['cites_refusal'], step=name)}`")
    for kind in ('requires', 'recheck_at_publication'):
        for i, c in enumerate(s.get(kind, [])):
            cond = [f"applies when {P(c['when'])}" for _ in [1] if 'when' in c] + [f"skipped when {P(c['unless'])}" for _ in [1] if 'unless' in c] + (['--force skips it'] if c.get('force') else [])
            who = next((x['actor_has_role'] for _, x in CS.walk(c.get('when', {})) if isinstance(x, dict) and 'actor_has_role' in x), s.get('by', ['anyone'])[0])
            stt = (c['status_not_in'][0] if 'status_not_in' in c else next((x for x in WORDS if x not in c['status_in']), '') if 'status_in' in c else first_from(s))
            txt = fill(c['refusal'], step=name, actor=agent(who), status=stt) if 'refusal' in c else '(machinery text of section 4.7a)'
            pub = ' at publication (the publication rolls back, exit 3)' if kind != 'requires' else ''
            w(f"- **{kind}[{i}]:** passes when {P(c)}" + (f" ({'; '.join(cond)})" if cond else '') + f". Allow: it holds → the step goes on. Deny{pub}: it fails → `❌ {txt}`")
    for h in s.get('from_refusal_hints', []): w(f"- **Hint:** when {P(h['when'])} the status refusal ends with `{fill(h['hint'])}`")
    if s.get('skip_from_when'): w(f"- **From check skipped** when {P(s['skip_from_when'])}.")
    for v in s.get('variants', []): w(f"- **Variant:** when {P(v['when'])} it uses " + ', '.join(f'{k} {v[k]}' for k in ('from', 'to', 'by') if k in v) + '.')
    for vd, x in s.get('verdicts', {}).items():
        words = [k for k, t in s.get('verdict_words', {}).items() if t == vd]
        w(f"- **Verdict `{vd}`**" + (f" (also {', '.join(words)})" if words else '') + f": {cmd(name, agent(s.get('by', ['anyone'])[0]), verdict=vd)} → status {x['to']}"
          + (f"; clears {', '.join(x['clears'])}" if x.get('clears') else '') + '.')
    if s.get('verdicts'): w(f"- **Deny (verdict):** `--{name} maybe` → invalid input (exit 2): `argument --{name}: invalid choice: 'maybe' (choose from {', '.join(repr(k) for k in list(s['verdicts']) + list(s.get('verdict_words', {})))})`")
    if s.get('exclusive'): w(f"- **Exclusive:** allow `--{name}` alone; deny `--{name} ... --set-estimate 5` → `❌ {fill('edit_exclusive', step=name)}`")
    if s.get('combinable'): w(f"- **Combinable:** may run with one other step in the same call (it runs first); deny with two other steps → `❌ {fill('one_step', flags='--' + name + ', --claim, --release')}`")
    if s.get('binds'): w(f"- **Binds:** runs on an item without a team; any other step on such an item → `❌ {fill('not_team_item')}`")
    es = s.get('ends_session') or next((x['ends_session'] for x in s.get('verdicts', {}).values() if x.get('ends_session')), None)
    if es: w(f"- **Ends the session** of the actor (except {', '.join(es.get('except_roles', [])) or 'nobody'}): last line `{fill_text(D.get('session', {}).get('end_text', ''), agent='member-1')}`; for {', '.join(es.get('except_roles', []))} no line.")
    if s.get('effect'): w(f"- **Effect:** {s['effect']['kind']} stored in field {s['effect']['records_field']} (record format fixed by the machinery).")
    if s.get('records') or s.get('records_rules'): w(f"- **Records** a body entry headed `{(s.get('records') or s['records_rules'][-1]['records']).splitlines()[0]}`.")
    w()

def fill_text(t, **kw):
    vals = {**SAMPLE, **kw}; return re.sub(r'<([A-Za-z_]+)>', lambda m: str(vals.get(m.group(1), m.group(0))), t)

def body():
    w(f'## Part A — every control of workflow `{WF}`'); w()
    w('Sample names: item 12 (`12-add-login`), team `' + TEAM + '`, ' + ', '.join(f'{r} `{agent(r)}`' for r in ROLES) + f', an agent outside every role `{OUTSIDER}`. A refusal is `❌ <text>` on standard output, exit 1, nothing written.'); w()
    w('### Statuses'); w()
    w(f"- **What:** the vocabulary is {', '.join(D['statuses'])}; a new item starts {D['initial']}; finished words: {', '.join(D['finished'])}.")
    w(f"- **Allow:** `backlog team new --team {TEAM} --name \"Add login\"` → the item starts in status {D['initial']}.")
    w(f"- **Deny:** `backlog team new --team {TEAM} --name \"Add login\" --status ready` → `❌ {fill('create_status_flag')}`")
    for f, k in D.get('undefined_step_refusals', {}).items(): w(f"- **Deny:** `backlog team update 12 --team {TEAM} --agent member-1 --{f} ready` → `❌ {fill(k)}`")
    w(f"- **Deny (undefined step):** `backlog team update 12 --team {TEAM} --agent member-1 --deploy` → `❌ {fill('step_not_defined', step='deploy')}`")
    for wd, x in D.get('side_statuses', {}).items():
        w(f"- **Side status `{wd}`:** entered by `--{x['enter']}`, left by `--{x['leave']}` back to {x['returns_to']}; every step whose from list lacks it is refused while the item is in it.")
    w()
    w('### Roles'); w()
    for r, src in ROLES.items(): w(f"- `{r}`: {json.dumps(src)} — allow: `{agent(r)}` holds it; deny: `{OUTSIDER}` does not" + (' (every agent holds it)' if 'anyone' in src else '') + '.')
    w()
    for k, title in (('identity', 'Identity'), ('scope', 'Scope')):
        if D.get(k):
            w(f'### {title}'); w()
            for kk, v in D[k].items(): w(f'- `{k}.{kk}` = `{json.dumps(v)}`')
            if k == 'identity' and isinstance(D[k].get('caller_acts_only_as_itself'), dict):
                w(f"- Allow: the caller `member-1` runs `--claim member-1`; the lead runs a step as another agent. Deny: caller `member-1` runs `--claim member-2` → `❌ {fill('caller_not_actor', caller='member-1', actor='member-2', step='claim')}`")
            if k == 'scope' and D[k].get('bind_session'): w(f"- Allow: an item of the bound repository and branch. Deny: an item elsewhere → `❌ {fill('outside_scope')}`")
            if k == 'scope' and D[k].get('session_team_only'): w(f"- Deny: an item of another team → `❌ {fill('other_team', item_team='t2')}`")
            w()
    if D.get('entry_constraints'):
        w('### Entry constraints'); w()
        for c in D['entry_constraints']: w(f'- `{json.dumps(c)}`: allow an entry that meets it; deny one that breaks it at `team define` (E-02/E-03/E-11 text).')
        w()
    if D.get('completeness'):
        w('### Completeness'); w()
        gate = next(((n, c['refusal']) for n, x in STEPS.items() for c in x.get('requires', []) if c.get('complete') is True and 'refusal' in c), None)
        for c in D['completeness']:
            what = f"`{c['name']}` ({c['test']}{' of field ' + c['field'] if c.get('field') else ''}{' of section ' + repr(c['section']) if c.get('section') else ''})"
            w(f"- {what}: allow an item where it passes" + (f"; deny `--{gate[0]}` while it fails → `❌ {fill(gate[1], missing=c['name'], step=gate[0])}`" if gate else '; it only feeds the complete and incomplete predicates') + '.')
        w()
    if D.get('create'):
        w('### Creation'); w()
        for k, v in D['create'].items(): w(f'- `create.{k}` = `{json.dumps(v)}` (applied by `backlog team new`).')
        w()
    if D.get('review'):
        rv = D['review']; w('### Review stages'); w()
        w(f"- **What:** stages in order {', '.join(rv['stages_order'])}; after the last one the item is {rv['after_last_stage']}; the entry `review` list chooses the stages and counts (default {json.dumps(D.get('defaults', {}).get('review', []))}).")
        for s, x in rv['stages'].items(): w(f"- Stage `{s}`: ready word {x['ready']}, active word {x['active']}, reviewers {x['reviewers']}, default count {x['default_count']}.")
        if 'reject_clears' in rv: w(f"- Verdict {rv['reject_clears']['verdict']} empties {rv['reject_clears']['field']} (every pass is lost).")
        if 'stale_after_seconds' in rv: w(f"- A review older than {rv['stale_after_seconds']} s is stale: allow the lead to hand it on; deny the hand-on of a fresh review.")
        w(f"- Deny (close before the passes): `❌ {fill('review_rule_not_met')}`"); w()
    if D.get('limits'):
        L = D['limits']; w('### Limits and active work'); w()
        w(f"- **What:** levels {', '.join(L['levels'])} counted over the {L['count_scope']}; active work is ({P(L['active_item'])}); numbers come from the entry `limits`."
          + (f" Field {L['override']['field']} lifts {', '.join(L['override']['lifts'])}." if L.get('override') else ''))
        w(f"- Allow: the member holds no active item → claim runs. Deny: the member limit 1 is full → `❌ {fill('limit')}`")
        if D.get('active_work'): w(f"- Active work of an actor: any of ({'; '.join(P(x) for x in D['active_work']['any'])}) except ({P(D['active_work'].get('except', {}))}). Deny: `❌ {fill('active_items') if 'active_items' in TEXTS else ''}`")
        w()
    if D.get('waiting'):
        x = D['waiting']; w('### Waiting'); w()
        w(f"- Field {x['field']} marks a wait; cleared by {', '.join(x['cleared_by_steps'])}" + (' or a note by the holder' if x.get('cleared_by_note') else '') + f"; record `{x.get('record', '')}`. Allow: the holder sets it and pulls new work. Deny: another agent → refusal of the waiting step."); w()
    for name, s in STEPS.items(): step(name, s)
    if D.get('on_finish'): w(f"### On finish"); w(); w(f"- When a step makes the status finished: sets {json.dumps(D['on_finish'].get('sets', {}))}, prints `{fill(D['on_finish']['instruction']) if D['on_finish'].get('instruction') else ''}`."); w()
    if D.get('edit_rules'):
        w('### Edit rules'); w()
        for i, r in enumerate(D['edit_rules']):
            w(f"- **edit_rules[{i}]:** when {P(r['when'])}, a request with {', '.join(r['request_has'])}" + (f" (unless it also has {', '.join(r['unless_request_has'])})" if r.get('unless_request_has') else '')
              + f" is refused. Allow: {', '.join(r.get('allow', [])) or 'a request without those parts'}. Deny → `❌ {fill(r['refusal'], status=(r['when'].get('status_in') or [D['statuses'][1]])[0])}`")
        w()
    if D.get('queue'):
        Q = D['queue']; w('### Queue (`backlog team pop`)'); w()
        for role, x in Q.get('roles', {}).items():
            for i, o in enumerate(x['offers']):
                cond = (f" when the actor matches ({P(o['when_actor'])})" if o.get('when_actor') else '') + (f" when the team matches ({P(o['when_team'])})" if o.get('when_team') else '')
                w(f"- **{role} offer {i} `{o['action']}`**{cond}: the first item (priority, then seq) where {P(o['select'])}" + (f"; runs `--{o['mark']}` first" if o.get('mark') else '')
                  + f". Allow (offered): `{fill(o['instruction'], agent=agent(role))}`. Deny (not offered): no item matches → the next offer, last `{fill(x['idle_instruction'], agent=agent(role))}` (exit 3).")
            if x.get('busy_when'): w(f"- **{role} busy:** when {P(x['busy_when'])} → `{fill(x['busy_instruction'])}`")
        for i, p in enumerate(Q.get('plan', {}).get('passes', [])):
            w(f"- **plan pass {i} `{p['action']}`:** items where {P(p['select'])}, assigned by {json.dumps(p['assign'])}; reason `{p['reason']}`. Allow: a free agent gets it. Deny: an agent that already has an entry or is excluded gets none.")
        if Q.get('plan', {}).get('skip_items'): w(f"- **plan skip:** never planned when {P(Q['plan']['skip_items'])}.")
        w()
    if D.get('views'):
        w('### Views (`backlog team query --<view>`)'); w()
        for v, x in D['views'].items():
            w(f"- `--{v}`: " + (f"lists items where {P(x['select'])}" if x.get('select') else 'counts per limit level') + f"; columns {', '.join(x['fields'])}. Allow: a matching item is listed. Deny: a non-matching item is not listed; an undefined view → `❌ backlog: view {v}x is not defined by workflow {WF}` (exit 2).")
        w()
    if D.get('user_commands'):
        w('### User commands on items of this team'); w()
        for op, x in D['user_commands'].items():
            w(f"- `{op}`: " + ('allowed' if x['allow'] else f"refused → `❌ {fill(x['refusal'], list='12-add-login', belong='belongs')}`"))
        w()
    if D.get('session'):
        w('### Session'); w()
        w(f"- End line after a step that ends the session: `{fill_text(D['session'].get('end_text', ''), agent='member-1')}`")
        if D['session'].get('block_after_end'): w(f"- An ended session is recorded in {D['session']['block_after_end']['field']}; allow a fresh session; deny the ended one → `❌ {fill('session_ended', agent='member-1')}`")
        w()

FRAGMENTS = [
    ('Ended sessions are refused later (`session.block_after_end`)', lambda d: (d['session'].__setitem__('block_after_end', {'field': 'ended_sessions'}),
      d['refusals'].__setitem__('session_ended', '<item>: the session of <agent> ended after its hand-off; a fresh session takes the next step')),
     'Allow: a fresh session of `member-1` claims item 14. Deny: the session that requested the review of item 12 runs `--claim` again → `❌ 12-add-login: the session of member-1 ended after its hand-off; a fresh session takes the next step`'),
    ('A status chosen by the flag value (`value: word`, `to: flag_value`)', lambda d: d['steps'].__setitem__('move-to', {'value': 'word', 'actor': 'by', 'from': ['*'], 'to': 'flag_value', 'by': ['lead'],
      'by_refusal': 'move_not_lead', 'arguments': {'reason': {'required': True, 'refusal': 'move_no_reason'}}}) or d['refusals'].update({'move_not_lead': '<item>: only the team lead (<lead>) moves an item to a chosen status, not <actor>', 'move_no_reason': '<item>: --move-to needs --reason "<why>"'}),
     'Allow: `backlog team update 12 --team t1 --agent lead-1 --move-to ready --reason "<why>"` → status ready. Deny: `--agent member-1` → `❌ 12-add-login: only the team lead (lead-1) moves an item to a chosen status, not member-1`; `--move-to later` → invalid input (exit 2): later is no status word.'),
    ('Back to the previous status (`to: previous`)', lambda d: d['steps']['decision'].__setitem__('to', 'previous'),
     'Allow: an item that entered the side status from refining returns to its `returns_to` word on `--decision "<answer>"`. Deny: `--decision` on an item not in the side status → the step\'s from refusal.'),
    ('Every review stage named generically, four in all (two refinement review steps and two work review stages)', None,
     'See the fragment below: the peer refinement review and the external refinement review are steps with verdicts; the peer work review and the external work review are `review.stages`. Allow: a member who did not refine the item passes the peer refinement review → ready for external refinement review. Deny: the refiner tries → `❌ 12-add-login: member-2 refined it: a member who did not refine it reviews the refinement`. The uniform form with the same keys for all four stages is format gap G-001 (13-format-gaps.md).'),
    ('Hand-off edge states (`handoff_states`)', lambda d: d['steps']['claim']['requires'][3]['dependencies_finished'].__setitem__('handoff_states', ['accepted']),
     'Allow: a dependency whose hand-off edge is accepted. Deny: an edge that is unrecorded, unaccepted, stale, rejected or missing → `❌ 12-add-login: dependencies not done: 9 done, hand-off unaccepted: ...` (the dep_handoff_* texts).'),
    ('Queue scope wider than the branch (`queue.scope_default`)', lambda d: d['queue'].__setitem__('scope_default', 'repo'),
     'Allow: `backlog team pop` offers an item of another branch of the same repository. Deny: an item of another repository is still not offered unless `scope.foreign_items` holds.'),
    ('A queue rank for normal severity (`create.priority_by_severity.normal`)', lambda d: d['create']['priority_by_severity'].__setitem__('normal', 5),
     'Allow: a new normal item gets rank 5 when no --priority is given. Deny: none (a rank never refuses); `--priority` wins.'),
    ('An explicit condition order (`order: after_from`)', lambda d: d['steps']['claim']['requires'][2].__setitem__('order', 'after_from'),
     'Allow and deny as without it: after_from is the default place (section 6 step 11 (g)).'),
    ('Value sources not used above (`head`, `today`, `argument:<a>`)', lambda d: d['steps']['close'].setdefault('sets', {}).update({'closed_head': 'head', 'closed_on': 'today', 'close_summary': 'argument:summary'}),
     'Allow: the close writes the HEAD commit, the date and the summary into those fields. Deny: none (value sources never refuse).'),
]

def four_stages(d):
    d['statuses'] = [x for x in d['statuses'] if x not in ('refined', 'refinement review')]
    i = d['statuses'].index('ready')
    d['statuses'][i:i] = ['ready for peer refinement review', 'peer refinement review', 'ready for external refinement review', 'external refinement review']
    S = d['steps']; S['refine-done']['to'] = 'ready for peer refinement review'
    S['request-refinement-review']['from'] = ['ready for external refinement review']; S['request-refinement-review']['to'] = 'external refinement review'
    S['refinement-review']['from'] = ['external refinement review']
    d['roles']['peer-refinement-reviewer'] = {'item_field': 'peer_refinement_reviewer'}
    S['start-peer-refinement-review'] = {'value': 'none', 'actor': 'by', 'from': ['ready for peer refinement review'], 'to': 'peer refinement review', 'by': ['member'], 'not_by': ['refiner'],
                                         'not_by_refusal': 'prr_refiner', 'sets': {'peer_refinement_reviewer': 'actor'}}
    S['peer-refinement-review'] = {'value': 'verdict', 'actor': 'by', 'from': ['peer refinement review'], 'by': ['peer-refinement-reviewer'], 'not_by': ['refiner'], 'not_by_refusal': 'prr_refiner',
                                   'arguments': {'comments': {'required': True}, 'note': {'required': True}},
                                   'verdicts': {'complete': {'to': 'ready for external refinement review'}, 'reject': {'to': 'refining'}}}
    d['refusals']['prr_refiner'] = '<item>: <actor> refined it: a member who did not refine it reviews the refinement'
    for r in d['edit_rules']:
        for k in ('when',):
            for x in CS.walk(r[k]):
                if isinstance(x[1], dict) and 'status_in' in x[1]: x[1]['status_in'] = [{'refined': 'ready for peer refinement review', 'refinement review': 'external refinement review'}.get(s, s) for s in x[1]['status_in']]
    for _, x in CS.walk(d):
        if isinstance(x, dict) and isinstance(x.get('status_in'), list): x['status_in'] = [{'refined': 'ready for peer refinement review', 'refinement review': 'external refinement review'}.get(s, s) for s in x['status_in']]
        if isinstance(x, dict) and isinstance(x.get('from'), list): x['from'] = [{'refined': 'ready for peer refinement review', 'refinement review': 'external refinement review'}.get(s, s) for s in x['from']]
    S['request-decision']['from'] = ['new', 'refining', 'ready for peer refinement review', 'peer refinement review', 'ready for external refinement review', 'external refinement review']
    S['handoff']['from'] = [x for x in d['statuses'] if x != 'archived'] + list(d.get('side_statuses', {}))
FRAGMENTS[3] = (FRAGMENTS[3][0], four_stages, FRAGMENTS[3][2])

def check(d):
    errs = CS.definition(d)
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f: json.dump(d, f)
    r = subprocess.run([sys.executable, os.path.join(HERE, 'validate_subset.py'), os.path.join(HERE, '..', 'schema', 'team-behaviour.schema.json'), f.name], capture_output=True, text=True)
    os.unlink(f.name); return errs + ([] if r.returncode == 0 else [r.stdout.strip()])

def features():
    w('## Part B — format features the definition above does not use'); w()
    w('Each fragment is merged into a copy of the definition and checked with the schema interpreter (`validate_subset.py`) and the semantic rules (`check_semantics.py`) when this file is generated; the result is shown after the fragment.'); w()
    bad = 0
    for title, f, text in FRAGMENTS:
        d = copy.deepcopy(D); f(d); errs = check(d); bad += len(errs)
        diff = {k: d['steps'][k] for k in d['steps'] if k not in D['steps']}
        diff.update({k: {kk: vv for kk, vv in d['steps'][k].items() if vv != D['steps'][k].get(kk) and kk in ('to', 'value', 'sets', 'requires', 'from')}
                     for k in D['steps'] if k in d['steps'] and d['steps'][k] != D['steps'][k] and (k not in diff)})
        if f is four_stages: diff = {k: v for k, v in diff.items() if k in ('start-peer-refinement-review', 'peer-refinement-review', 'refine-done', 'request-refinement-review', 'refinement-review')}
        top = {k: d[k] for k in ('statuses', 'session', 'create') if d.get(k) != D.get(k)}
        if d['roles'] != D['roles']: top['roles'] = {k: v for k, v in d['roles'].items() if k not in D['roles']}
        if d['queue'].get('scope_default') != D['queue'].get('scope_default'): top['queue'] = {'scope_default': d['queue']['scope_default']}
        w(f'### {title}'); w(); w(text); w()
        w('```json'); w(json.dumps({**top, **({'steps': diff} if diff else {})}, indent=1, ensure_ascii=False)); w('```')
        if f is four_stages: w('Every other `from` and `status_in` list maps refined to ready for peer refinement review and refinement review to external refinement review.')
        w(); w(f"Check: {'valid (schema and semantic rules)' if not errs else 'INVALID: ' + '; '.join(errs)}"); w()
    return bad

w(f'# Allow and deny examples of workflow `{WF}`'); w()
w(f"Generated by `python3 tools/examples.py {' '.join(sys.argv[1:])}` (run from the plan folder); do not edit by hand. Every control of the definition has a description, an allow example and a deny example with the exact refusal text (placeholders filled with sample values)."); w()
body()
bad = features() if FEATURES else 0
sys.stdout.write('\n'.join(OUT) + '\n'); sys.exit(1 if bad else 0)
