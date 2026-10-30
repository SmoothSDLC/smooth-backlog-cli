// The team lifecycle of `backlog update` in shared mode (cli-parity job 15): claim, release, request-review, start-review,
// review, waiting, waiting-done and close. Port of update.py:26-96 (team_action) and the guards around it, update.py:181-246.
// Each action takes item = {fm, folder, repo}, changes item.fm and returns {event, text}, or throws Rejected(message) with
// the refusal text; step() runs the guards and one action, and update.js writes the front matter and appends the text.
import { hasDefinitionOfDone } from './new.js';
import { wipRefusal } from './wip.js';
import { now } from './store.js';
import {
  teamName,
  REFINEMENT_REVIEWERS, REVIEW_DIR, asList, claimRefusal, describeDependency, gitBranch, isReady, isReviewAuthor, needsReview, outsideTeam, reviewOpenTo, strip,
  STOP_TEXT, restarting, staleReview, teamLead, teamScope, undoneDependencies,
} from './team.js';

export class Rejected extends Error {}
const reject = message => { throw new Rejected(message); };
const NO_SELF_REVIEW = by => `${by} claimed this item and cannot review its own work; another agent reviews it`;
// lib_db.py:258-260
export const REFINE_HOW = 'backlog update <item> --set-review-refs references/review/<type>.md,.. / '
  + '--set-depends-on <ids|none> / --set-estimate <minutes> --set-complexity low|medium|high [--set-layer 1-5|process] / '
  + "--append '## Definition of done\\n- [ ] <checkable line>'";

// update.py:239: the first line of a text as a splitlines() would give it.
export const headline = text => text.replace(/^[# ]+/, '').split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)[0];

// lib_db.py:229-253 estimate_min: front matter estimate_min, else an 'ESTIMATE: <n> min' body line; null when there is none.
function estimateMin(fm, body) {
  const v = fm.estimate_min;
  const n = typeof v === 'number' ? Math.trunc(v) : typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v) ? Number(v) : 0;
  if (n > 0) return n;
  const m = /\bESTIMATE:\s*(\d+)/.exec(body || '');
  return m ? Number(m[1]) : null;
}

// lib_db.missing_fields: the required team fields an item lacks; [] = complete. review_refs names at least one review
// document (references/review/<type>.md), depends_on is written (may be none), an estimate, a definition of done.
export function missingFields(fm, body) {
  const refs = asList(fm.review_refs);
  return [['review_refs', !refs.some(r => r.startsWith(REVIEW_DIR))],
    ['depends_on', fm.depends_on == null || fm.depends_on === ''], ['estimate_min', estimateMin(fm, body) === null],
    ['definition_of_done', !hasDefinitionOfDone(body)]].filter(([, bad]) => bad).map(([f]) => f);
}

export function claim({ fm, folder, repo }, agent, { force } = {}) {
  const who = fm.claimed_by || ''; const t = now();
  if (['done', 'archived'].includes(fm.status)) reject(`status is ${fm.status}; a finished item cannot be claimed`); // update.py:32-33
  // spec section 8 (item 039): the lead never claims a split item; the team runner claims the team's work item (no stage) for it
  // item 056: a team session (TEAM_NAME) claims no other team's item (pop offers only its own; team pop relies on it)
  if (teamName() && fm.team && strip(fm.team) !== teamName()) reject(`the item belongs to team ${fm.team}, not to this session's team ${teamName()} (TEAM_NAME)`);
  if (agent === teamLead() && fm.team && fm.stage) reject(`the team lead (${agent}) never claims an item of its team's split; a member claims it`);
  if (fm.stage === 'review-hitl') reject('the item waits in stage review-hitl for an owner decision; nobody claims it, --force included (backlog update <item> --decision "<answer>" first)');
  // update.py:75-77; beyond the oracle (spec section 4, Codex review of item 036), --force does not pass the stages
  if (!isReady(fm)) reject(`team ${fm.team || ''} item in stage ${fm.stage || 'none'}: it is claimed only when its refinement review passed (stage ready)`);
  if (who && who !== agent) reject(`claimed by ${who} since ${fm.claimed_at}; message ${who} or pick another item`);
  const undone = undoneDependencies(folder, fm);
  if (undone.length) reject(`dependencies not done: ${undone.map(describeDependency).join('; ')}`);
  const refusal = who === agent ? null : claimRefusal(folder, agent);
  if (refusal && !force) reject(refusal);
  const wip = who === agent && fm.status === 'in_progress' ? null : wipRefusal(folder, repo, fm, agent, fm.phase); // item 034: --force never passes a limit; a reclaim of a pending item is a start
  if (wip) reject(wip);
  Object.assign(fm, { status: 'in_progress', claimed_by: agent, claimed_at: t });
  return { event: 'claimed', text: `Claimed by ${agent} at ${t} repository=${repo} branch=${gitBranch(process.cwd()) || '(detached)'} cwd=${process.cwd()}${refusal ? ` (--force past the claim rule: ${refusal.split(';')[0]})` : ''}` };
}

// The stages before any work (item 036; update.py:36-71): refining -> refined -> refinement-review -> ready, and review-hitl
// for an owner decision (topology item 288). A member refines first, the lead requests the refinement review, and Codex
// records the verdict; Claude only after Codex's 5-hour limit is recorded for the round.
const inStage = fm => `team ${fm.team || 'none'}, stage ${fm.stage || 'none'}`;
export function refineStart({ fm, folder, repo }, by, { force } = {}) {
  if (!by) reject('--refine-start needs --by <agent>');
  if (!fm.team || fm.stage !== 'refining') reject(`only an item of a team in stage refining is refined (${inStage(fm)})`);
  if (fm.claimed_by) reject(`claimed by ${fm.claimed_by}: the work item itself is refined and split by the team lead, not refined here`);
  if (fm.refiner && fm.refiner !== by) reject(`${fm.refiner} is refining it since ${fm.refine_started}; refine another item`);
  if (by === teamLead() && fm.refiner !== by) reject(`a member, not the team lead, refines in the first round (spec section 4); the lead re-refines only an item an owner decision returned to it`);
  const busy = fm.refiner === by || by === teamLead() ? null : claimRefusal(folder, by); // spec section 6: a refinement is new work too
  if (busy && !force) reject(busy);
  const wip = fm.refiner === by ? null : wipRefusal(folder, repo, fm, by, fm.phase); // item 034
  if (wip) reject(wip);
  const t = now();
  Object.assign(fm, { refiner: by, refine_started: t });
  return { event: 'refine_started', text: `Refinement started by ${by} at ${t}` };
}

export function refineDone({ fm }, by, note) {
  if (!by || fm.refiner !== by || fm.stage !== 'refining') reject(`--refine-done --by <the refiner>: refiner is ${fm.refiner || 'nobody'}, stage ${fm.stage || 'none'}`);
  if (!strip(note || '')) reject('--refine-done needs --note "<what you refined>"');
  const t = now();
  Object.assign(fm, { stage: 'refined', refined_at: t });
  return { event: 'refined', text: `## Refined by ${by} at ${t}\n\n${note}` };
}

export function requestRefinementReview({ fm }, by) {
  if (!by || by !== teamLead()) reject(`--request-refinement-review --by <the team lead>: the lead (${teamLead()}; TEAM_LEAD) sends a refined item to the refinement review (got ${by || 'none'})`);
  if (fm.stage !== 'refined') reject(`only a refined item goes to the refinement review (stage ${fm.stage || 'none'})`);
  const t = now();
  Object.assign(fm, { stage: 'refinement-review', refinement_review_requested_at: t, refinement_codex_limit: '' });
  return { event: 'refinement_review_requested', text: `Refinement review requested by ${by} at ${t} (Codex first; Claude only when Codex's 5-hour limit is exceeded)` };
}

export function refinementReview({ fm }, verdict, { by, comments } = {}) {
  if (!REFINEMENT_REVIEWERS.includes(by)) reject(`--refinement-review --by codex|claude: the refinement is reviewed by Codex or Claude (got ${by || 'none'})`);
  if (fm.stage !== 'refinement-review') reject(`no refinement review is requested (stage ${fm.stage || 'none'})`);
  if (!strip(comments || '')) reject('--refinement-review needs --comments "<the reviewer\'s findings, and its thread or session id>"');
  const t = now();
  if (verdict === 'limit') { // beyond the oracle (item 036): Codex's 5-hour limit is recorded before Claude may review
    if (by !== 'codex') reject('--refinement-review limit --by codex: only Codex reports its own 5-hour limit');
    fm.refinement_codex_limit = t;
    return { event: 'refinement_codex_limit', text: `## Refinement review: Codex 5-hour limit (${t})\n\n${comments}` };
  }
  if (by === 'claude' && !fm.refinement_codex_limit) {
    reject('--refinement-review --by claude: Claude reviews a refinement only when Codex reports its 5-hour limit; record it first (--refinement-review limit --by codex --comments "<Codex\'s answer>")');
  }
  const passed = verdict === 'pass';
  Object.assign(fm, { stage: passed ? 'ready' : 'refining', refiner: passed ? fm.refiner || '' : '', refinement_reviewed_by: by, refinement_reviewed_at: t });
  return { event: 'refinement_reviewed', text: `## Refinement review by ${by}: ${passed ? 'PASS: ready' : 'CHANGES: back to refining'} (${t})\n\n${comments}` };
}

// Beyond the oracle (topology item 288, owner 2026-10-28): an item whose refinement needs an owner decision waits in stage
// review-hitl, with the question; the owner's answer sends it back to refining, where the lead re-refines it.
const BEFORE_READY = ['refining', 'refined', 'refinement-review'];
export function requestDecision({ fm }, by, question) {
  if (!by) reject('--request-decision needs --by <agent>');
  if (!fm.team || !BEFORE_READY.includes(fm.stage)) reject(`only a team item before ready waits for an owner decision (${inStage(fm)})`);
  if (!strip(question || '')) reject('--request-decision needs the question: what, why, how it came up, the options and a recommendation');
  const t = now();
  Object.assign(fm, { stage: 'review-hitl', decision_requested_by: by, decision_requested_at: t, decision_question: question, refiner: '' }); // the question in the front matter: --decisions lists it whole
  return { event: 'decision_requested', text: `## Owner decision needed (asked by ${by} at ${t})\n\n${question}` };
}

export function decision({ fm, folder, repo }, answer) {
  if (fm.stage !== 'review-hitl') reject(`no owner decision is pending (stage ${fm.stage || 'none'})`);
  if (!strip(answer || '')) reject('--decision needs the owner\'s answer');
  const t = now();
  // spec section 4: the lead re-refines it with the decision; past a work-in-progress limit (034) the answer is recorded
  // all the same and the item waits in refining for whoever may start it (the owner's answer is never refused)
  const full = folder ? wipRefusal(folder, repo, { ...fm, stage: 'refining', refiner: '' }, teamLead(), fm.phase) : null;
  Object.assign(fm, { stage: 'refining', refiner: full ? '' : teamLead(), refine_started: full ? '' : t, decided_at: t, decision_question: '' });
  return { event: 'decided', text: `DECISION ${t.slice(0, 10)}: ${answer}${full ? `\n(no refiner yet: ${full})` : ''}` };
}

export function release({ fm }, agent, { by, reason } = {}) {
  const who = fm.claimed_by || '';
  if (['done', 'archived'].includes(fm.status)) reject(`status is ${fm.status}; a finished item cannot be released into the queue`);
  if (who !== agent) reject(`claimed by ${who || 'nobody'}, not by ${agent}`);
  // item 033 (spec section 8): only the team lead gives back another agent's item, and says why
  if (by && by !== agent && (by !== teamLead() || !strip(reason || ''))) reject(`${by} cannot release ${agent}'s item: only the team lead (${teamLead()}) does, with --reason "<why>"`);
  Object.assign(fm, { status: 'pending', claimed_by: '', claimed_at: '', ...(fm.wait_on ? { wait_on: '' } : {}) }); // beyond update.py parity: a wait belongs to the holder; left behind it hides the item from pop's continue AND offers it as a claim
  return { event: 'released', text: by && by !== agent ? `Released by ${by} for ${agent} at ${now()}: ${reason}` : `Released by ${agent} at ${now()}` };
}

// item 033 (spec section 8): the team lead takes an item from one agent and gives it to another, with the reason.
export function reassign({ fm }, agent, { by, reason } = {}) {
  if (!by || by !== teamLead()) reject(`--reassign --by <the team lead>: only the lead (${teamLead()}; TEAM_LEAD) gives one agent's item to another (got ${by || 'none'})`);
  if (!strip(reason || '')) reject('--reassign needs --reason "<why>"');
  if (['done', 'archived'].includes(fm.status)) reject(`status is ${fm.status}; a finished item is not reassigned`);
  const from = fm.claimed_by || '';
  if (!from) reject('nobody holds the item: the agent claims it (backlog update <item> --claim <agent>)');
  if (from === agent) reject(`${agent} holds it already`);
  const t = now();
  Object.assign(fm, { claimed_by: agent, claimed_at: t, ...(fm.wait_on ? { wait_on: '' } : {}) });
  return { event: 'reassigned', text: `## Reassigned by ${by} from ${from} to ${agent} at ${t}\n\n${reason}` };
}

// item 033: the team lead hands a review on from its reviewer (a stale one, say) to another agent, with the reason.
export function reassignReview({ fm }, agent, { by, reason } = {}) {
  if (!by || by !== teamLead()) reject(`--reassign-review --by <the team lead>: only the lead (${teamLead()}; TEAM_LEAD) hands a review on (got ${by || 'none'})`);
  if (!strip(reason || '')) reject('--reassign-review needs --reason "<why>"');
  if (!['requested', 'in_review'].includes(fm.review_state)) reject(`no review is requested (review_state ${fm.review_state || 'none'})`);
  if (isReviewAuthor(fm, agent)) reject(NO_SELF_REVIEW(agent));
  const from = fm.review_state === 'in_review' ? fm.reviewer || '' : '';
  const t = now();
  Object.assign(fm, { review_state: 'in_review', reviewer: agent, review_started: t });
  return { event: 'review_reassigned', text: `## Review reassigned by ${by} from ${from || 'nobody'} to ${agent} at ${t}\n\n${reason}` };
}

// item 033: in a qwen-code team session the shell runs with QWEN_CODE_AGENT_ID=<name>@<team>; that agent acts only as
// itself. Outside a team session (no such id) the caller is not known and the named agent is taken as given.
export const caller = () => { const id = strip(process.env.QWEN_CODE_AGENT_ID || ''); return /^[^@\s]+@\S+$/.test(id) ? id.split('@')[0] : ''; };

export function requestReview({ fm }, reviewer, note, by = '') {
  if (!strip(note || '')) reject('--request-review needs --note "<what to review: commits, deployed evidence>"');
  if (fm.review_state === 'in_review') reject(`${fm.reviewer} is reviewing it since ${fm.review_started}: wait for the verdict; the team lead hands a stale review on (--reassign-review)`);
  // item 033: the one who asks never reviews it and ends its session, so an unclaimed team item names it
  if (fm.team && !fm.claimed_by && !by) reject('--request-review of an unclaimed team item needs --by <agent>, the one who asks');
  if (fm.claimed_by && by && by !== fm.claimed_by && by !== teamLead()) reject(`${fm.claimed_by} holds it: only the holder, or the team lead, asks for its review (not ${by})`);
  const t = now();
  // review_author outlives a release: the one who asked for the review never reviews it, whatever claimed_by says later
  Object.assign(fm, { review_state: 'requested', reviewer, review_requested_at: t, review_started: '', review_author: fm.claimed_by || by || fm.review_author || '' });
  return { event: 'review_requested', text: `## Review requested by ${fm.claimed_by || 'unknown'} at ${t} (reviewer: ${reviewer})\n\n${note}` };
}

export function startReview({ fm }, by) {
  if (!by) reject('--start-review needs --by <agent>');
  if (isReviewAuthor(fm, by)) reject(NO_SELF_REVIEW(by));
  const st = fm.review_state; const rv = fm.reviewer;
  if (!['requested', 'in_review'].includes(st)) reject(`no review is requested (review_state ${st || 'none'})`);
  if (!reviewOpenTo(fm, by)) {
    reject(`in review by ${rv} since ${fm.review_started}; review another item${staleReview(fm) ? ` (the review is stale: the team lead hands it on with backlog update <item> --reassign-review <agent> --by ${teamLead()} --reason "<why>")` : ''}`);
  }
  const t = now();
  Object.assign(fm, { review_state: 'in_review', reviewer: by, review_started: t });
  return { event: 'review_started', text: `Review started by ${by} at ${t}` };
}

export function review({ fm }, verdict, { by, comments } = {}) {
  if (!by || !strip(comments || '')) reject('--review needs --by <agent> and --comments "<findings>"');
  if (isReviewAuthor(fm, by)) reject(NO_SELF_REVIEW(by));
  const refs = asList(fm.review_refs);
  if (refs.length && !refs.some(p => comments.includes(p))) {
    reject(`--comments must cite at least one of the item's review_refs (${refs.join(', ')}): they are its definition of done and the review document`);
  }
  if (fm.review_state === 'in_review' && !reviewOpenTo(fm, by)) reject(`in review by ${fm.reviewer} since ${fm.review_started}; review another item`);
  if (!['requested', 'in_review'].includes(fm.review_state)) {
    reject(`no review is requested (review_state ${fm.review_state || 'none'}); the agent working on it runs --request-review first`);
  }
  const t = now();
  Object.assign(fm, { review_state: verdict === 'pass' ? 'passed' : 'changes-requested', reviewer: by, review_started: '', reviewed_at: t });
  return { event: 'reviewed', text: `## Review by ${by}: ${verdict === 'pass' ? 'PASS' : 'CHANGES REQUESTED'} (${t})\n\n${comments}` };
}

export function waiting({ fm }, by, what) {
  const who = fm.claimed_by || '';
  if (!by || by !== who) reject(`--waiting needs --by <the agent holding it> (claimed by ${who || 'nobody'})`);
  const t = now();
  Object.assign(fm, { wait_on: what, wait_since: t });
  return { event: 'waiting', text: `WAITING ${t} ${by}: ${what}` };
}

export function waitingDone({ fm }, by) {
  fm.wait_on = '';
  return { event: 'wait_done', text: `WAIT DONE ${now()} ${by || fm.claimed_by || ''}` };
}

export function closeItem({ fm }, by, summary) {
  if (!strip(summary || '')) reject('--close needs --summary "<what was delivered>"');
  if (needsReview(fm) && fm.review_state !== 'passed') {
    reject(`review_state is ${fm.review_state || 'none'}; an item with review_refs closes only after a passing review (--request-review, then another agent's --review pass)`);
  }
  const closer = by || fm.claimed_by || '';
  if (!closer) reject('nobody claimed this item: pass --by <agent>');
  // item 039 (spec section 9, owner 2026-10-25): only the claimer closes its item, else the team lead
  if (fm.claimed_by && closer !== fm.claimed_by && closer !== teamLead()) reject(`only the claimer (${fm.claimed_by}) closes it, else the team lead (${teamLead()}); not ${closer}`);
  if (!fm.claimed_by && fm.team && closer !== teamLead()) reject(`nobody holds this item of team ${fm.team}: the team lead (${teamLead()}) closes it; not ${closer}`); // a team's item (beyond the oracle)
  fm.status = 'done';
  return { event: 'closed', text: `## Closed by ${closer} at ${now()}\n\n${summary}` };
}

// update.py:181-241: the guards and the one team action of a call. ctx = {fm, slug, folder, repo, body, incomplete, given}:
// incomplete = missingFields before the call, given = the SETTABLE flags on the command line. Returns {refuse} (the text after
// the "❌ ") or {event, text} (event 'state_change' and no text when no action was asked).
const REFINEMENT_STEPS = ['refine-start', 'refine-done', 'request-refinement-review', 'refinement-review', 'request-decision', 'decision'];
// the agent each step acts as (item 033: a member acts only as itself)
const ACTS_AS = { claim: a => a.claim, release: a => a.by || a.release, reassign: a => a.by, 'reassign-review': a => a.by, 'request-review': (a, fm) => a.by || fm.claimed_by,
  close: (a, fm) => a.by || fm.claimed_by, 'waiting-done': (a, fm) => a.by || fm.claimed_by };
const ACTIONS = ['reassign', 'reassign-review', 'refine-start', 'refine-done', 'request-refinement-review', 'refinement-review', 'request-decision', 'decision',
  'claim', 'release', 'request-review', 'start-review', 'review', 'close', 'waiting', 'waiting-done'];
export function step(a, { fm, body, slug, folder, repo, incomplete, given, before = fm }) {
  const actions = ACTIONS.filter(k => a[k]);
  if (actions.length > 1) return { refuse: `one team-work step at a time (got ${actions.map(k => `--${k}`).join(', ')})` };
  // item 038: a member waiting for its restart takes no new work (update.py:32-35)
  for (const [flag, agent] of [['--refine-start', a['refine-start'] && a.by], ['--claim', a.claim], ['--start-review', a['start-review'] && a.by]]) {
    if (agent && restarting(agent)) return { refuse: `${slug}: ${flag} refused: ${agent} is waiting for its restart; ${STOP_TEXT}` };
  }
  const me = caller();
  if (me && actions.length && me !== teamLead()) {
    const as = (ACTS_AS[actions[0]] ?? (x => x.by))(a, fm);
    if (as && as !== me) return { refuse: `${slug}: you are ${me} (QWEN_CODE_AGENT_ID): a member acts only as itself, not as ${as}; only the team lead (${teamLead()}) takes or gives another agent's work (backlog update <item> --reassign <agent> --by <lead> --reason "<why>")` };
  }
  const note = a.note ?? '';
  // Beyond the oracle (update.py:241 guards only steps and notes): a field, --set-* or body edit is a change too.
  if (actions.length || strip(note) || given.length || a.append || Object.keys(a).some(k => k.startsWith('set-'))) {
    const why = outsideTeam(fm);
    if (why) return { refuse: `${slug}: ${why}` };
  }
  // a refinement verdict is about the item as the reviewer saw it: nothing changes in the same call (Codex review of item 036)
  if (a['refinement-review'] && (a.append || given.length || Object.keys(a).some(k => k.startsWith('set-')))) {
    return { refuse: `${slug}: --refinement-review records the verdict alone; change the item first and have it reviewed again` };
  }
  // and while the refinement review runs, the item stays as the reviewer reads it
  if (before.stage === 'refinement-review' && !actions.length && (a.append || given.length || Object.keys(a).some(k => k.startsWith('set-')))) {
    return { refuse: `${slug}: in stage refinement-review the item stays as the reviewer reads it; a changes verdict returns it to refining` };
  }
  const steps = actions.filter(k => k !== 'release');
  if (a['refine-done'] && missingFields(fm, body).length) { // a refined item is complete (owner 2026-10-28; update.py:303-307)
    return { refuse: `${slug}: still missing ${missingFields(fm, body).join(', ')}: complete it before --refine-done (${REFINE_HOW})` };
  }
  // Being refined (or waiting for its decision), an incomplete item takes its refinement steps, notes, its text fields
  // and appended team fields or definition of done, and nothing else. Beyond the oracle (update.py:309 lets every step
  // through; Codex review of item 036): a status change, another step or appended text that is no definition of done is
  // refused, so nothing but a refinement completes it.
  const refining = before.team && ['refining', 'review-hitl'].includes(before.stage); // as the item was before this call: --set-team '' does not lift the rule
  // Beyond the oracle (Codex review of item 036): a team's item before stage ready takes only its refinement steps, complete
  // or not: no work, review, close or status change until its refinement review passed.
  if (before.team && before.stage && before.stage !== 'ready') {
    const work = [...steps.filter(k => !REFINEMENT_STEPS.includes(k) && k !== 'claim').map(k => `--${k}`), ...given.filter(k => k === 'status').map(k => `--${k}`)]; // a claim has its own gate (claim())
    if (work.length) return { refuse: `${slug}: team ${before.team} item in stage ${before.stage}: before stage ready only its refinement steps run (${work.join(', ')} refused)` };
  }
  // spec section 4: outside the refinement stages only the lead refines an incomplete item of its team (a member known by
  // QWEN_CODE_AGENT_ID changes nothing on it)
  const who = me || a.by; // the Qwen caller, else the agent named by --by
  // the DAG is the lead's (refine-and-split: the lead links the split items), so --set-depends-on is no refinement edit
  const edits = strip(note) || given.length || a.append || Object.keys(a).some(k => k.startsWith('set-') && k !== 'set-depends-on');
  // spec section 4: a member, not the lead, refines in the first round; the lead edits a refining item only as its refiner
  if (who === teamLead() && before.team && before.stage === 'refining' && fm.refiner !== who && edits) { // with a step or without
    return { refuse: `${slug}: a member, not the team lead, refines in the first round (spec section 4); the lead edits an item in stage refining only as its refiner` };
  }
  if (incomplete.length && (before.team || teamScope().repo) && !refining && who && who !== teamLead() && (actions.length || strip(note) || given.length || a.append || Object.keys(a).some(k => k.startsWith('set-')))) {
    return { refuse: `${slug}: incomplete item, missing ${incomplete.join(', ')}: only the team lead (${teamLead()}) refines it, not ${who}` };
  }
  if (incomplete.length && (teamScope().repo || steps.length || refining)) { // team mode: an incomplete item is only refined
    const work = [...steps.filter(k => !(refining && REFINEMENT_STEPS.includes(k))).map(k => `--${k}`), ...(strip(note) && !refining ? ['--note'] : []),
      ...given.filter(k => !(refining && ['name', 'objective', 'summary'].includes(k))).map(k => `--${k}`),
      ...(a.append && !/^(?:[ \t]*ESTIMATE:[^\n]*(?:\n|$))+$/.test(a.append.trim()) && !hasDefinitionOfDone(a.append) ? ['--append'] : [])]; // only ESTIMATE lines pass as such
    if (work.length) return { refuse: `${slug}: incomplete item, missing ${incomplete.join(', ')}: in a team nobody claims, reviews or works it (${work.join(', ')} refused); the team lead refines it only: ${REFINE_HOW}` };
  }
  if (!actions.length) return { event: 'state_change' };
  const item = { fm, folder, repo };
  try {
    switch (actions[0]) {
      case 'refine-start': return refineStart(item, a.by, { force: a.force });
      case 'refine-done': return refineDone(item, a.by, note);
      case 'request-refinement-review': return requestRefinementReview(item, a.by);
      case 'refinement-review': return refinementReview(item, a['refinement-review'], { by: a.by, comments: a.comments });
      case 'request-decision': return requestDecision(item, a.by, a['request-decision']);
      case 'decision': return decision(item, a.decision);
      case 'claim': return claim(item, a.claim, { force: a.force });
      case 'release': return release(item, a.release, { by: a.by || caller() || undefined, reason: a.reason });
      case 'reassign': return reassign(item, a.reassign, { by: a.by, reason: a.reason });
      case 'reassign-review': return reassignReview(item, a['reassign-review'], { by: a.by, reason: a.reason });
      case 'request-review': return requestReview(item, a['request-review'], note, a.by || caller());
      case 'start-review': return startReview(item, a.by);
      case 'review': return review(item, a.review, { by: a.by, comments: a.comments });
      case 'waiting': return waiting(item, a.by, a.waiting);
      case 'waiting-done': return waitingDone(item, a.by);
      default: return closeItem(item, a.by, a.summary);
    }
  } catch (e) {
    if (e instanceof Rejected) return { refuse: `${slug}: ${e.message}` };
    throw e;
  }
}

// item 033 (spec section 7): the last line of the command that hands an item to review, asks for changes or closes it.
export const shutdown = agent => `🛑 ${agent}: END THE SESSION NOW. Reply with text only and make no further tool call; your next task starts in a fresh session.`;

// update.py:253-255: printed after a passing review.
// update.py:379-382: the claimer closes, else the team lead (owner 2026-10-25), never the reviewer (item 039)
export const closeNow = (fm, slug) => (!fm.claimed_by ? `   ➡️  CLOSE NOW: nobody holds it: the team lead closes it (backlog update ${slug} --close --by <lead> --summary "<outcome>")` : `   ➡️  CLOSE NOW: ${fm.claimed_by} closes it (backlog update ${slug} --close --summary "<outcome>"); if the claimer has not, the team lead closes it when available (--close --by <lead> --summary ...); owner 2026-10-25: only the claimer closes, else the lead`);
