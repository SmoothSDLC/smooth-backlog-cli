// The status order of a team's items and the rules of the steps that move an item along it. The definition is a JSON file the
// CLI ships (templates/workflows/<name>.json) or a backlog registers (<backlog root>/workflows.json); this module answers the questions
// the rest of the code asks of it: which word an item carries (statusOf), whether a step may run (canStep), which word it leads to (next)
// and whether a word is finished (isFinished).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seam } from './seam.js';
import { asList } from './text.js';

export const SHIPPED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'workflows');
// The definition the CLI ships: its words are the status vocabulary of every item.
export const TEAM = JSON.parse(readFileSync(join(SHIPPED, 'team.json'), 'utf8'));

export const STATUSES = TEAM.statuses;
export const SIDE = TEAM.side_statuses;
const WORDS = new Set([...STATUSES, ...Object.keys(SIDE)]);
const FINISHED = new Set([...TEAM.finished, 'done']);
export const ORDER = TEAM.review_stages_order;
export const READY = Object.fromEntries(ORDER.map(s => [s, TEAM.steps['start-review'].stages[s].from[0]]));
const STAGE_OF = Object.fromEntries(ORDER.flatMap(s => TEAM.steps['start-review'].stages[s].from.map(w => [w, s])));

// closed, done and archived are finished; every other word (a free-text word outside a team included) is open.
export const isFinished = word => FINISHED.has(word);
export const isOpen = word => word != null && !FINISHED.has(word); // an explicit null status is neither open nor finished
const STARTED = new Set(STATUSES.slice(STATUSES.indexOf('in progress'))); // in progress and every word after it
// Open and not yet started: what a claim or a plan may take (a refinement or review word is held back by the stage the readers derive).
export const isUnstarted = word => isOpen(word) && !STARTED.has(word);
// The review stage a status belongs to ('peer' or 'external'), undefined for any other status.
export const stageOfStatus = word => STAGE_OF[word];

// An item is archived when its file lies under archive/; the path alone says so, whatever status word the file stores.
export const isArchived = x => String(x?.path ?? '').startsWith('archive/');

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
export const need = rule => (Number(rule.count) > 0 ? Number(rule.count) : 1);

// May this reviewer pass the stage? Anyone for a solo item; the rule's team when it names one; else the entry's members (and lead) for the
// peer stage and its external reviewers for the external one.
const eligible = (rule, entry, by) => (rule.anyone ? Boolean(by) : rule.team ? (seam.isMember ?? (() => false))(rule.team, by)
  : rule.stage === 'peer' ? (asList(entry?.members).length ? [...asList(entry.members), entry.lead].includes(by) : Boolean(by)) // a team that lists no members lets anyone pass
    : asList(entry?.external_reviewers).includes(by));

// The distinct eligible reviewers whose pass is recorded on the item's work commit (reviews: "<reviewer> <commit>").
export function passCount(fm, entry, rule) {
  const head = fm.work_commit;
  return new Set(asList(fm.reviews).map(x => String(x).split(/\s+/)).filter(([by, commit]) => (!head || commit === head) && eligible(rule, entry, by)).map(([by]) => by)).size;
}
export const satisfied = (fm, entry, rule) => passCount(fm, entry, rule) >= need(rule);

// ---- the word of an item

// The word an item carries. An item that already carries a word of the order is returned unchanged; an item an earlier build wrote
// (status pending|in_progress|done with stage and review_state) is translated; any other word is free text and stays as written.
// An item without a team is never translated (see lift): its status is read exactly as stored.
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
function legacyFields(fm) {
  const word = fm.status;
  const last = asList(fm.review_history).at(-1) ?? '';
  const sliced = Object.hasOwn(fm, 'refiner'); // a slice carries a refiner (empty until someone refines it); a team's work item never does
  const stage = { new: sliced ? 'refining' : undefined, refining: 'refining', refined: 'refined', 'refinement review': 'refinement-review', ready: 'ready', 'awaiting decision': 'review-hitl' }[word]
    ?? (sliced && !FINISHED.has(word) ? 'ready' : undefined);
  const review_state = { 'ready for review': 'requested', 'ready for external review': 'requested', reviewing: 'in_review', 'external review': 'in_review', 'review complete': 'passed', closed: asList(fm.reviews).length ? 'passed' : 'none' }[word]
    ?? (word === 'in progress' && / reject /.test(last) ? 'changes-requested' : 'none');
  return { stage, review_state };
}

// Reads an item written by this or an earlier build: status becomes its word, and stage and review_state are set for the readers that
// still ask for them. An earlier item that asked for changes keeps that as a line of its review history (the author's next pop offers
// the rework from it). Returns the item.
export function lift(doc, entry) {
  const fm = doc.fm;
  if (!seam.entry) return doc; // every command but the old `backlog team` code reads an item as stored, a team's too: no word is translated and no field is derived (a team's words and fields are its own)
  if (fm.status == null) return doc; // no status (or an explicit null): nothing to translate, the readers' own default applies
  if (fm.stage && !Object.hasOwn(fm, 'refiner')) fm.refiner = ''; // an earlier slice: the refiner key is what marks it from here on
  fm.status = statusOf(fm, entry);
  if (!WORDS.has(fm.status)) return doc;
  if (fm.review_state === 'changes-requested' && fm.status === 'in progress' && !asList(fm.review_history).length) {
    fm.review_history = [`${fm.reviewed_at ?? ''} peer reject ${fm.reviewer ?? ''} ${fm.work_commit ?? ''}: changes requested before the history was kept`];
  }
  derive(fm);
  return doc;
}
// The two fields follow the word.
const ADDED = new WeakMap(); // the keys derive put on an item that did not carry them: they are never written back
export const derivedKeys = fm => ADDED.get(fm) ?? new Set();
function derive(fm) {
  const { stage, review_state } = legacyFields(fm);
  const added = ADDED.get(fm) ?? ADDED.set(fm, new Set()).get(fm);
  for (const [k, v] of [['stage', stage], ['review_state', review_state]]) {
    if (v === undefined) { delete fm[k]; continue; }
    if (!Object.hasOwn(fm, k)) added.add(k);
    fm[k] = v;
  }
  return fm;
}
// The two fields are never written once the item carries a word of the order.
export const dropsLegacy = fm => WORDS.has(fm.status);

// An item read from its file as the word it carries, with the entry of its team (the solo rule outside `backlog team`).
export const lifted = doc => lift(doc, seam.entry ? seam.entry(doc.fm) : SOLO);
