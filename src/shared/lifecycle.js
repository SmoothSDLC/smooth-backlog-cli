// The team lifecycle of `backlog update` in shared mode (cli-parity job 15): claim, release, request-review, start-review,
// review, waiting, waiting-done and close. Port of update.py:26-96 (team_action) and the guards around it, update.py:181-246.
// Each action takes item = {fm, folder, repo}, changes item.fm and returns {event, text}, or throws Rejected(message) with
// the refusal text; step() runs the guards and one action, and update.js writes the front matter and appends the text.
import { hasDefinitionOfDone } from './new.js';
import { now } from './store.js';
import {
  asList, claimRefusal, describeDependency, gitBranch, outsideTeam, reviewOpenTo, strip, teamScope, uncoveredReviewClasses, undoneDependencies,
} from './team.js';

export class Rejected extends Error {}
const reject = message => { throw new Rejected(message); };
const NO_SELF_REVIEW = by => `${by} claimed this item and cannot review its own work; another agent reviews it`;
// lib_db.py:258-260
export const REFINE_HOW = 'update.py <item> --set-work-class <c,..> / --set-review-classes <c,..> / --set-review-refs references/review/<class>.md,.. / '
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

// lib_db.py:240-250: the required team fields an item lacks; [] = complete.
export function missingFields(fm, body) {
  const classes = asList(fm.review_classes); const refs = asList(fm.review_refs);
  return [['work_class', !asList(fm.work_class).length], ['review_classes', !classes.length],
    ['review_refs', !refs.length || uncoveredReviewClasses(classes, refs).length > 0],
    ['depends_on', fm.depends_on == null || fm.depends_on === ''], ['estimate_min', estimateMin(fm, body) === null],
    ['definition_of_done', !hasDefinitionOfDone(body)]].filter(([, bad]) => bad).map(([f]) => f);
}

export function claim({ fm, folder, repo }, agent, { force } = {}) {
  const who = fm.claimed_by || ''; const t = now();
  if (who && who !== agent) reject(`claimed by ${who} since ${fm.claimed_at}; message ${who} or pick another item`);
  const undone = undoneDependencies(folder, fm);
  if (undone.length) reject(`dependencies not done: ${undone.map(describeDependency).join('; ')}`);
  const refusal = who === agent ? null : claimRefusal(folder, agent);
  if (refusal && !force) reject(refusal);
  Object.assign(fm, { status: 'in_progress', claimed_by: agent, claimed_at: t });
  return { event: 'claimed', text: `Claimed by ${agent} at ${t} repository=${repo} branch=${gitBranch(process.cwd()) || '(detached)'} cwd=${process.cwd()}${refusal ? ` (--force past the claim rule: ${refusal.split(';')[0]})` : ''}` };
}

export function release({ fm }, agent) {
  const who = fm.claimed_by || '';
  if (who !== agent) reject(`claimed by ${who || 'nobody'}, not by ${agent}`);
  Object.assign(fm, { status: 'pending', claimed_by: '', claimed_at: '' });
  return { event: 'released', text: `Released by ${agent} at ${now()}` };
}

export function requestReview({ fm }, reviewer, note) {
  if (!strip(note || '')) reject('--request-review needs --note "<what to review: commits, deployed evidence>"');
  const t = now();
  Object.assign(fm, { review_state: 'requested', reviewer, review_requested_at: t, review_started: '' });
  return { event: 'review_requested', text: `## Review requested by ${fm.claimed_by || 'unknown'} at ${t} (reviewer: ${reviewer})\n\n${note}` };
}

export function startReview({ fm }, by) {
  if (!by) reject('--start-review needs --by <agent>');
  if (by === (fm.claimed_by || '')) reject(NO_SELF_REVIEW(by));
  const st = fm.review_state; const rv = fm.reviewer;
  if (!['requested', 'in_review'].includes(st)) reject(`no review is requested (review_state ${st || 'none'})`);
  if (!reviewOpenTo(fm, by)) reject(`in review by ${rv} since ${fm.review_started}; review another item`);
  const stale = st === 'in_review' && rv !== by ? `Review by ${rv} stale (started ${fm.review_started}). ` : '';
  const t = now();
  Object.assign(fm, { review_state: 'in_review', reviewer: by, review_started: t });
  return { event: 'review_started', text: `${stale}Review started by ${by} at ${t}` };
}

export function review({ fm }, verdict, { by, comments } = {}) {
  if (!by || !strip(comments || '')) reject('--review needs --by <agent> and --comments "<findings>"');
  if (by === (fm.claimed_by || '')) reject(NO_SELF_REVIEW(by));
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
  if (asList(fm.review_classes).length && fm.review_state !== 'passed') {
    reject(`review_state is ${fm.review_state || 'none'}; an item with review_classes closes only after a passing review (--request-review, then another agent's --review pass)`);
  }
  const closer = by || fm.claimed_by || '';
  if (!closer) reject('nobody claimed this item: pass --by <agent>');
  fm.status = 'done';
  return { event: 'closed', text: `## Closed by ${closer} at ${now()}\n\n${summary}` };
}

// update.py:181-241: the guards and the one team action of a call. ctx = {fm, slug, folder, repo, body, incomplete, given}:
// incomplete = missingFields before the call, given = the SETTABLE flags on the command line. Returns {refuse} (the text after
// the "❌ ") or {event, text} (event 'state_change' and no text when no action was asked).
const ACTIONS = ['claim', 'release', 'request-review', 'start-review', 'review', 'close', 'waiting', 'waiting-done'];
export function step(a, { fm, slug, folder, repo, incomplete, given }) {
  const actions = ACTIONS.filter(k => a[k]);
  if (actions.length > 1) return { refuse: `one team-work step at a time (got ${actions.map(k => `--${k}`).join(', ')})` };
  const note = a.note ?? '';
  if (actions.length || strip(note)) {
    const why = outsideTeam(fm);
    if (why) return { refuse: `${slug}: ${why}` };
  }
  const steps = actions.filter(k => k !== 'release');
  if (incomplete.length && (teamScope().repo || steps.length)) { // team mode: an incomplete item is only refined
    const work = [...steps.map(k => `--${k}`), ...(strip(note) ? ['--note'] : []), ...given.map(k => `--${k}`),
      ...(a.append && !a.append.includes('ESTIMATE:') && !hasDefinitionOfDone(a.append) ? ['--append'] : [])];
    if (work.length) return { refuse: `${slug}: incomplete item, missing ${incomplete.join(', ')}: in a team nobody claims, reviews or works it (${work.join(', ')} refused); the team lead refines it only: ${REFINE_HOW}` };
  }
  if (!actions.length) return { event: 'state_change' };
  const item = { fm, folder, repo };
  try {
    switch (actions[0]) {
      case 'claim': return claim(item, a.claim, { force: a.force });
      case 'release': return release(item, a.release);
      case 'request-review': return requestReview(item, a['request-review'], note);
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

// update.py:253-255: printed after a passing review.
export const closeNow = (fm, slug, by) => `   ➡️  CLOSE NOW: ${fm.claimed_by || 'the claimer'} closes it (update.py ${slug} --close --summary "<outcome>"); ${by} closes it (--close --by ${by} --summary ...) if the claimer has not within 3 min`;
