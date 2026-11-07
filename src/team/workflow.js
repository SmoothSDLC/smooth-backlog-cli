// The rules of the steps that move a team item along the status order, and the registry of flows a backlog adds to the shipped one.
// The status words themselves are src/shared/status.js; this module answers whether a step may run (canStep), which word it leads to (next)
// and whether a stage has its passes (stageSatisfied).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BacklogError } from '../errors.js';
import { ORDER, READY, SHIPPED, TEAM, satisfied, stageList, stageRules } from '../shared/status.js';
import { asList } from '../shared/text.js';


const cache = new Map();

// The definition called name: the backlog's own registered flows first, then the shipped one.
export function loadWorkflow(name = 'team', home) {
  const key = `${name}\0${home ?? ''}`;
  if (cache.has(key)) return cache.get(key);
  let def;
  const registered = home ? join(home, 'workflows.json') : null;
  if (registered && existsSync(registered)) {
    try { const all = JSON.parse(readFileSync(registered, 'utf8')); if (all && typeof all === 'object' && all[name]) def = all[name]; } catch { /* an unreadable registry registers nothing */ }
  }
  if (!def && /^[\w.-]+$/.test(name) && existsSync(join(SHIPPED, `${name}.json`))) def = JSON.parse(readFileSync(join(SHIPPED, `${name}.json`), 'utf8'));
  if (!def) throw new BacklogError('INVALID_INPUT', `workflow ${name} is not defined (backlog team workflow --file <json> registers one)`);
  cache.set(key, def);
  return def;
}

cache.set('team\0', TEAM); // the shipped flow is the one the status words come from

// ---- the steps

const fill = (text, vars) => text.replace(/<(\w+)>/g, (m, k) => (vars[k] ?? m));
const refusal = (key, vars) => fill(TEAM.refusals[key], vars);

// May the step run on the item? { ok: true } or { refuse: <text> }. A team item needs the team's entry; its status must be one the step
// starts from (an item outside a team has no order to keep); the external stage is run by the entry's external reviewers.
export function canStep(step, fm, actor, entry, stage) {
  const def = TEAM.steps[step];
  if (!def) return { ok: true };
  const item = fm.phase ?? '';
  if (fm.team && !entry) return { refuse: refusal('team_not_configured', { team: fm.team }) };
  if (!fm.team) return { ok: true };
  const leg = def.stages ? def.stages[stage] : def;
  // a review may be recorded straight from the stage's ready word (the review then starts and ends in one call)
  const from = step === 'review' ? [...(leg?.from ?? []), ...(TEAM.steps['start-review'].stages[stage]?.from ?? [])] : leg?.from ?? [];
  if (!from.includes('*') && !from.includes(fm.status)) return { refuse: refusal('wrong_status', { item, status: fm.status, step, from: from.join(' or ') }) };
  const external = asList(entry?.external_reviewers);
  if (stage === 'external' && external.length && !external.includes(actor)) return { refuse: refusal('wrong_actor', { step, item, who: 'an external reviewer', actor: actor || 'nobody' }) };
  return { ok: true };
}

// The word after a step. verdict: complete|reject for a review; stage: peer|external for start-review and review; satisfied: false when the
// stage still lacks passes (the item stays in the stage's ready word for the next reviewer).
export function next(step, fm, entry, verdict, stage, { satisfied: done = true } = {}) {
  const def = TEAM.steps[step];
  const list = stageList(entry);
  const after = s => { const n = list.find(x => ORDER.indexOf(x) > ORDER.indexOf(s)); return n ? READY[n] : 'review complete'; };
  if (step === 'request-review') return list.length ? READY[list[0]] : 'review complete';
  if (step === 'start-review') return def.stages[stage].to;
  if (step === 'review') {
    const v = def.stages[stage].verdicts[verdict];
    if (verdict === 'reject') return v.to;
    return done ? after(stage) : READY[stage];
  }
  if (step === 'refinement-review') return def.verdicts[verdict].to;
  return def.to === 'same' ? fm.status : def.to === 'previous' ? (fm.decision_from || 'refining') : def.to;
}
// Whether the stage has all the passes its rule needs (true when the entry has no rule for the stage).
export function stageSatisfied(fm, entry, stage) {
  const rule = stageRules(entry).find(r => r.stage === stage);
  return !rule || satisfied(fm, entry, rule);
}

// ---- the shape of a definition

// The problems of a definition, one text each; [] when it is valid.
export function validateWorkflow(def) {
  const out = [];
  const arr = v => Array.isArray(v);
  const statuses = arr(def?.statuses) ? def.statuses : [];
  if (!statuses.length || statuses.some(s => typeof s !== 'string' || !s) || new Set(statuses).size !== statuses.length) out.push('statuses must be a non-empty list of distinct words');
  else if (statuses.at(-2) !== 'closed' || statuses.at(-1) !== 'archived') out.push('statuses must end with closed, archived');
  const side = def?.side_statuses && typeof def.side_statuses === 'object' ? def.side_statuses : {};
  const known = new Set([...statuses, ...Object.keys(side)]);
  for (const f of arr(def?.finished) ? def.finished : [null]) if (!statuses.includes(f) && f !== 'done') out.push(`finished: ${f} is no status`);
  const steps = def?.steps && typeof def.steps === 'object' ? def.steps : {};
  const legs = [];
  const check = (name, leg, by) => {
    const from = leg?.from;
    if (!arr(from) || !from.length || (!(from.length === 1 && from[0] === '*') && from.some(w => !known.has(w)))) out.push(`step ${name}: from must list statuses or ["*"]`);
    const ends = leg?.verdicts && typeof leg.verdicts === 'object' ? Object.values(leg.verdicts).map(v => v?.to) : [leg?.to];
    if (!ends.length || ends.some(t => !(known.has(t) || t === 'same' || t === 'previous'))) out.push(`step ${name}: to must be a status, same, previous or verdicts that lead to statuses`);
    if (!arr(leg?.by ?? by) || !(leg?.by ?? by).length) out.push(`step ${name}: by must name who may run it`);
    legs.push({ from: arr(from) ? from : [], ends });
  };
  for (const [name, s] of Object.entries(steps)) {
    if (s?.stages && typeof s.stages === 'object') for (const [st, leg] of Object.entries(s.stages)) check(`${name}/${st}`, leg, s.by);
    else check(name, s);
  }
  for (const [w, s] of Object.entries(side)) for (const k of ['enter', 'leave']) if (!steps[s?.[k]]) out.push(`side status ${w}: ${k} must name a step`);
  const used = [...new Set([...Object.keys(steps.review?.stages ?? {}), ...Object.keys(steps['start-review']?.stages ?? {})])].sort();
  if (!arr(def?.review_stages_order) || JSON.stringify([...def.review_stages_order].sort()) !== JSON.stringify(used)) out.push('review_stages_order must list exactly the stages the review steps use');
  // from every open status some chain of steps reaches closed
  const open = [...statuses.filter(s => s !== 'closed' && s !== 'archived'), ...Object.keys(side)];
  const edges = new Map(open.map(s => [s, new Set()]));
  for (const { from, ends } of legs) for (const f of from.includes('*') ? open : from) for (const t of ends) for (const to of t === 'previous' ? statuses.filter(s => s !== 'closed' && s !== 'archived') : [t === 'same' ? f : t]) edges.get(f)?.add(to);
  for (const s of open) {
    const reached = new Set([s]); const todo = [s];
    while (todo.length) for (const t of edges.get(todo.pop()) ?? []) if (!reached.has(t)) { reached.add(t); todo.push(t); }
    if (!reached.has('closed')) out.push(`no chain of steps leads from ${s} to closed`);
  }
  for (const k of ['team_not_configured', 'wrong_status', 'wrong_actor', 'missing_argument', 'handoff_missing']) if (typeof def?.refusals?.[k] !== 'string') out.push(`refusals must have ${k}`);
  return out;
}
