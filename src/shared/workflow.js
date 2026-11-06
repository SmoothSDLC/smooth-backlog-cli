// The status order of a team's items and the rules of the steps that move an item along it. The definition is a JSON file the
// CLI ships (templates/workflows/<name>.json) or a backlog registers (<backlog root>/workflows.json); this module answers the questions
// the rest of the code asks of it: which word an item carries (statusOf), whether a step may run (canStep), which word it leads to (next)
// and whether a word is finished (isFinished).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BacklogError } from '../errors.js';
import { asList, isTeamMember } from './team.js';

const SHIPPED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'workflows');
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

const TEAM = loadWorkflow('team');
export const STATUSES = TEAM.statuses;
export const SIDE = TEAM.side_statuses;
const WORDS = new Set([...STATUSES, ...Object.keys(SIDE)]);
const FINISHED = new Set([...TEAM.finished, 'done']);
const ORDER = TEAM.review_stages_order;
const READY = Object.fromEntries(ORDER.map(s => [s, TEAM.steps['start-review'].stages[s].from[0]]));
const STAGE_OF = Object.fromEntries(ORDER.flatMap(s => TEAM.steps['start-review'].stages[s].from.map(w => [w, s])));

// closed, done and archived are finished; every other word (a free-text word outside a team included) is open.
export const isFinished = word => FINISHED.has(word);
export const isOpen = word => !FINISHED.has(word);
// The review stage a status belongs to ('peer' or 'external'), undefined for any other status.
export const stageOfStatus = word => STAGE_OF[word];

// A word as typed (hyphens, underscores, any case) in the stored form; a word outside the order is returned trimmed as typed. done is closed.
export function normalise(word) {
  const typed = String(word ?? '').trim();
  const key = typed.toLowerCase().replace(/[-_\s]+/g, ' ');
  if (key === 'done') return 'closed';
  return WORDS.has(key) ? key : typed;
}

// An item outside a team is reviewed once, by anyone.
export const SOLO = Object.freeze({ review: [{ stage: 'peer', count: 1, anyone: true }] });
// The review rules of a team's entry as [{stage, count, team?}] in stage order. An entry without a review list reviews in every stage
// of the definition; a list names the stages that apply (an empty list: none); no entry, no rule. A rule written as { team, count }
// (earlier form) takes its stage by its place in the list.
export function stageRules(entry) {
  if (entry == null) return [];
  const list = Array.isArray(entry.review) ? entry.review : TEAM.team_entry_review_default;
  const rules = list.map((r, n) => (r && typeof r === 'object' ? { ...r, stage: r.stage ?? (r.team ? ORDER[n] : undefined) } : null))
    .filter(r => r && ORDER.includes(r.stage));
  return ORDER.flatMap(s => rules.filter(r => r.stage === s).slice(0, 1));
}
// The stages that apply to a team's entry, in the definition's order.
export const stageList = entry => stageRules(entry).map(r => r.stage);
const need = rule => (Number(rule.count) > 0 ? Number(rule.count) : 1);

// May this reviewer pass the stage? Anyone for a solo item; the rule's team when it names one; else the entry's members (and lead) for the
// peer stage and its external reviewers for the external one.
const eligible = (rule, entry, by) => (rule.anyone ? Boolean(by) : rule.team ? isTeamMember(rule.team, by)
  : rule.stage === 'peer' ? [...asList(entry?.members), entry?.lead].includes(by) : asList(entry?.external_reviewers).includes(by));

// The distinct eligible reviewers whose pass is recorded on the item's work commit (reviews: "<reviewer> <commit>").
export function passCount(fm, entry, rule) {
  const head = fm.work_commit;
  return new Set(asList(fm.reviews).map(x => String(x).split(/\s+/)).filter(([by, commit]) => (!head || commit === head) && eligible(rule, entry, by)).map(([by]) => by)).size;
}
const satisfied = (fm, entry, rule) => passCount(fm, entry, rule) >= need(rule);

// ---- the word of an item

// The word an item carries. An item that already carries a word of the order is returned unchanged; an item an earlier build wrote
// (status pending|in_progress|done with stage and review_state) is translated; any other word is free text and stays as written.
export function statusOf(fm, entry) {
  const s = fm.status ?? 'pending';
  if (WORDS.has(s)) return s;
  if (s === 'done') return 'closed';
  const { stage, review_state: rs } = fm;
  if (stage === 'review-hitl') return 'awaiting decision';
  if (s === 'in_progress') {
    if (rs === 'requested') return 'ready for review';
    if (rs === 'in_review') return asList(entry?.external_reviewers).includes(fm.reviewer) && !asList(entry?.members).includes(fm.reviewer) ? 'external review' : 'reviewing';
    if (rs === 'passed') return stageRules(entry).every(r => satisfied(fm, entry, r)) ? 'review complete' : 'ready for external review';
    return 'in progress';
  }
  if (s === 'pending') {
    if (stage === 'refining') return fm.refiner ? 'refining' : 'new';
    if (stage === 'refined') return 'refined';
    if (stage === 'refinement-review') return 'refinement review';
    if (stage === 'ready') return 'ready';
    if (!stage && fm.team) return 'new';
  }
  return s;
}

// The two fields the readers of the pop and the views ask (stage, review_state) as a function of the word: they are never stored.
export function legacyFields(fm) {
  const word = fm.status;
  const last = asList(fm.review_history).at(-1) ?? '';
  const stage = { new: Object.hasOwn(fm, 'refiner') ? 'refining' : undefined, refining: 'refining', refined: 'refined', 'refinement review': 'refinement-review', ready: 'ready', 'awaiting decision': 'review-hitl' }[word];
  const review_state = { 'ready for review': 'requested', 'ready for external review': 'requested', reviewing: 'in_review', 'external review': 'in_review', 'review complete': 'passed' }[word]
    ?? (word === 'in progress' && / reject /.test(last) ? 'changes-requested' : 'none');
  return { stage, review_state };
}

// Reads an item written by this or an earlier build: status becomes its word, and stage and review_state are set for the readers that
// still ask for them. An earlier item that asked for changes keeps that as a line of its review history (the author's next pop offers
// the rework from it). Returns the item.
export function lift(doc, entry) {
  const fm = doc.fm;
  fm.status = statusOf(fm, entry);
  if (!WORDS.has(fm.status)) return doc;
  if (fm.review_state === 'changes-requested' && fm.status === 'in progress' && !asList(fm.review_history).length) {
    fm.review_history = [`${fm.reviewed_at ?? ''} peer reject ${fm.reviewer ?? ''} ${fm.work_commit ?? ''}: changes requested before the history was kept`];
  }
  const { stage, review_state } = legacyFields(fm);
  if (stage === undefined) delete fm.stage; else fm.stage = stage;
  fm.review_state = review_state;
  return doc;
}
// The two fields are never written once the item carries a word of the order.
export const dropsLegacy = fm => WORDS.has(fm.status);

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
  const from = leg?.from ?? [];
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
