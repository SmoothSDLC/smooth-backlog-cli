// The team lifecycle of `backlog update`: claim, release, request-review, start-review,
// review, waiting, waiting-done and close. a port of the earlier scripts(team_action) and the guards around it.
// Each action takes item = {fm, folder, repo, body}, changes item.fm and returns {event, text}, or throws Rejected(message)
// with the refusal text; step runs the guards and one action, and update.js writes the front matter and appends the text.
import { spawnSync } from 'node:child_process';
import { hasDefinitionOfDone } from '../shared/new.js';
import { actor } from '../shared/seen.js';
import { wipRefusal } from './wip.js';
import { canStep, next, stageSatisfied } from './workflow.js';
import { isFinished, need, passCount, stageOfStatus, stageRules } from '../shared/status.js';
import { now } from '../shared/store.js';
import { acceptHandoff, recordHandoff, rejectHandoff } from './handoff-commands.js';
import { openEdges } from './handoff.js';
import { closeGate } from './handoff-close.js';
import { entryOf, offeredTo, teamName, isTeamMember, refinementReviewRules, claimRefusal, describeDependency, gitBranch, heldBy, isReady, isReviewAuthor, outsideTeam, reviewOpenTo, staleReview, teamLead, teamScope, undoneDependencies } from './team.js';
import { asList, strip } from '../shared/text.js';

export class Rejected extends Error {}
const reject = (message, whole = false) => { throw Object.assign(new Rejected(message), { whole }); }; // whole: the text already names the item
// The workflow's gate of a step: the team needs its entry and the item a status the step starts from. The refusal is the whole message.
const gate = (step, fm, who, stage, hint = '') => { const c = canStep(step, fm, who, entryOf(fm), stage); if (c.refuse) reject(c.refuse + hint, true); };
const oneLine = text => String(text ?? '').replace(/\s+/g, ' ').trim();
// The item's record of a review: "<ts> <stage> <verdict> <by> <commit>: <comments>".
const historyLine = (fm, t, stage, verdict, by, commit, comments) => [...asList(fm.review_history), `${t} ${stage} ${verdict} ${by} ${commit}: ${oneLine(comments)}`];
// The rule is per session (the agent name is the session name); a new session of the same worker is a new name.
const NO_SELF_REVIEW = by => `${by}: the same session cannot review its own work; a new session may`;
// The item's list of every session name that claimed it or asked for its review; append, no duplicates.
const withSession = (list, name) => (name ? [...asList(list).filter(n => n !== name), name] : asList(list));
// every write that changes or clears the holder, or records a review request, keeps the item's earlier
// authors: it seeds the list from the current holder and the review requester (an item written before the list
// existed has no list yet) and adds the session this write names, so the self-review block of each earlier
// session survives the transition.
const seededAuthors = (fm, name) => withSession(withSession(withSession(fm.session_authors, fm.claimed_by), fm.review_author), name);
export const refineHow = () => 'set the review documents, the dependencies, the estimate and complexity (and the layer), and a checkable definition of done in the body';

// the first line of a text as a splitlines would give it.
export const headline = text => text.replace(/^[# ]+/, '').split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)[0];

// estimate_min: front matter estimate_min, else an 'ESTIMATE: <n> min' body line; null when there is none.
function estimateMin(fm, body) {
  const v = fm.estimate_min;
  const n = typeof v === 'number' ? Math.trunc(v) : typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v) ? Number(v) : 0;
  if (n > 0) return n;
  const m = /\bESTIMATE:\s*(\d+)/.exec(body || '');
  return m ? Number(m[1]) : null;
}

// The required team fields an item lacks; [] = complete. review_refs names at least one review document, depends_on is
// written (may be none), an estimate, a definition of done.
export function missingFields(fm, body) {
  const refs = asList(fm.review_refs);
  return [['review_refs', !refs.length],
    ['depends_on', fm.depends_on == null || fm.depends_on === ''], ['estimate_min', estimateMin(fm, body) === null],
    ['definition_of_done', !hasDefinitionOfDone(body)]].filter(([, bad]) => bad).map(([f]) => f);
}

// the marker new.js writes into a split slice's body (## Split from `<parent-slug>`. Inherited context:);
// a slice created before the stage field existed has no stage, and the marker names it.
export const isSplitSlice = body => /Split from `[^`]+`/.test(String(body ?? ''));
// The owner: nothing is implemented before it is refined. A team item without a stage (a team's work
// item, or one written before the stage field existed) and a split slice without one are unrefined: refining. Only an item
// without a team and without the split marker has no stage (solo work), which counts as ready.
export const stageOf = (fm, body) => fm.stage || (fm.team || (isSplitSlice(body) && teamName()) ? 'refining' : undefined);

export function claim({ fm, folder, repo, body = '' }, agent, { force } = {}) {
  const who = fm.claimed_by || ''; const t = now();
  if (isFinished(fm.status)) reject(`status is ${fm.status}; a finished item cannot be claimed`); //
  // a split slice with no team is claimed by the team that refined it - the dispatch offers the slice's refinement to the
  // team's members, and the claim joins the slice to the claiming session's team, so the slice belongs to that team from on.
  // A plain teamless item (no split marker) stays outside the session's team.
  if (teamName() && !fm.team && fm.repository === repo && isSplitSlice(body)) fm.team = teamName();
  // the design: the lead never claims a split item; the team runner claims the team's work item (no stage) for it
  // a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME) claims only what pop offers it: an item of its own team in its repository (any
  // item without another team elsewhere). Checked inside the locked write, so team pop's scope is the claim's precondition.
  if (teamName() && !offeredTo(fm, fm.repository, repo)) {
    reject(fm.team ? `the item belongs to team ${fm.team}, not to this session's team ${teamName()}`
      : `the item belongs to no team; this session's team ${teamName()} claims only its own team's items here`);
  }
  if (agent === teamLead() && fm.team && fm.stage) reject(`the team lead (${agent}) never claims an item of its team's split; a member claims it`);
  // the team lead's claim of its team's work item (backlog team pop, to split it) is the one claim from the status new
  const leadsWork = agent === teamLead() && fm.team && !fm.stage && !isSplitSlice(body);
  if (!leadsWork) {
    gate('claim', fm, agent, undefined, fm.status === 'awaiting decision' ? `; nobody claims it, --force included until the decision is recorded`
      : ['new', 'refining'].includes(fm.status) && !fm.refiner ? `; refine it first (nobody has started its refinement)` : '');
  }
  // beyond the earlier scripts, --force does not pass the stages.
  // a split slice is in stage refining with or without a team field, so the gate covers it too; a slice
  // created before the stage field existed has no stage, and the body's split marker names it as refining.
  // the team lead's own claim of its team's work item (backlog team pop, to split it) is the one claim of an unrefined item; a split slice is never it
  const stage = leadsWork ? undefined : stageOf(fm, body);
  if (!isReady({ stage })) reject(`team ${fm.team || 'none'} item in stage ${stage || 'none'}${fm.stage ? '' : ' (not refined yet)'}: it is claimed only when its refinement review passed (stage ready)`
    + (stage === 'refining' && !fm.refiner ? `; refine it first (nobody has started its refinement)` : ''));
  // a new session of the same card continues the item (no takeover, no lead reassignment): the
  // holder check and the "already holding" checks treat the earlier session's item as the agent's own
  const cont = heldBy(who, agent);
  if (who && who !== agent && !cont) reject(`claimed by ${who} since ${fm.claimed_at}; message ${who} or pick another item`);
  const undone = undoneDependencies(folder, fm);
  if (undone.length) reject(`dependencies not done: ${undone.map(describeDependency).join('; ')}`);
  const refusal = cont ? null : claimRefusal(folder, agent);
  if (refusal && !force) reject(refusal);
  const wip = cont && fm.status === 'in progress' ? null : wipRefusal(folder, repo, fm, agent, fm.phase); // --force never passes a limit; a reclaim of a pending item is a start
  if (wip) reject(wip);
  // the claiming session joins the list; the write seeds it from the current holder and the review
  // requester, so an item without session_authors (written before the list existed) keeps the self-review block
  // of its earlier authors when the new session takes over claimed_by (a continuation keeps the earlier holder).
  // the claim's session becomes the author session - an agent review by that same session is refused (the
  // same card reviews only in a fresh session).
  Object.assign(fm, { status: next('claim', fm, entryOf(fm)), claimed_by: agent, claimed_at: t, session_authors: seededAuthors(fm, agent), author_session: callerSession() });
  return { event: 'claimed', text: `Claimed by ${agent} at ${t} repository=${repo} branch=${gitBranch(process.cwd()) || '(detached)'} cwd=${process.cwd()}${refusal ? ` (--force past the claim rule: ${refusal.split(';')[0]})` : ''}` };
}

// The stages before any work: refining -> refined -> refinement-review -> ready, and review-hitl
// for an owner decision. A member refines first, the lead requests the refinement review, and a configured
// refinement reviewer records the verdict.
const inStage = fm => `team ${fm.team || 'none'}, stage ${fm.stage || 'none'}`;
export function refineStart({ fm, folder, repo, body = '' }, by, { force } = {}) {
  if (!by) reject('--refine-start needs --by <agent>');
  // a split slice is in stage refining with or without a team field - both refine through the same stages;
  // a slice created before the stage field existed has no stage, and the body's split marker names it as refining.
  const stage = stageOf(fm, body) || 'none';
  if (stage !== 'refining') reject(`only an item of a team in stage refining is refined (team ${fm.team || 'none'}, stage ${stage})`);
  // a teamless split slice joins the refining session's team here, so the team's pop and plan offer it after
  // its refinement review (the claim-time join below covers a slice refined before this rule)
  if (teamName() && !fm.team && fm.repository === repo) fm.team = teamName();
  if (fm.claimed_by) reject(`claimed by ${fm.claimed_by}: the work item itself is refined and split by the team lead, not refined here`);
  if (fm.refiner && fm.refiner !== by) reject(`${fm.refiner} is refining it since ${fm.refine_started}; refine another item`);
  if (by === teamLead() && fm.refiner !== by) reject(`a member, not the team lead, refines in the first round (spec section 4); the lead re-refines only an item an owner decision returned to it`);
  const busy = fm.refiner === by || by === teamLead() ? null : claimRefusal(folder, by); // the design: a refinement is new work too
  if (busy && !force) reject(busy);
  const wip = fm.refiner === by ? null : wipRefusal(folder, repo, fm, by, fm.phase);
  if (wip) reject(wip);
  gate('refine-start', fm, by);
  const t = now();
  Object.assign(fm, { status: next('refine-start', fm, entryOf(fm)), refiner: by, refine_started: t });
  return { event: 'refine_started', text: `Refinement started by ${by} at ${t}` };
}

export function refineDone({ fm }, by, note) {
  if (!by || fm.refiner !== by || fm.stage !== 'refining') reject(`--refine-done --by <the refiner>: refiner is ${fm.refiner || 'nobody'}, stage ${fm.stage || 'none'}`);
  gate('refine-done', fm, by);
  if (!strip(note || '')) reject('--refine-done needs --note "<what you refined>"');
  const t = now();
  Object.assign(fm, { status: next('refine-done', fm, entryOf(fm)), refined_at: t });
  return { event: 'refined', text: `## Refined by ${by} at ${t}\n\n${note}` };
}

export function requestRefinementReview({ fm }, by) {
  if (!by || by !== teamLead()) reject(`--request-refinement-review --by <the team lead>: the lead (${teamLead() || 'none configured'}; SMOOTH_BACKLOG_CLI_TEAM_LEAD) sends a refined item to the refinement review (got ${by || 'none'})`);
  if (fm.stage !== 'refined') reject(`only a refined item goes to the refinement review (stage ${fm.stage || 'none'})`);
  gate('request-refinement-review', fm, by);
  const t = now();
  Object.assign(fm, { status: next('request-refinement-review', fm, entryOf(fm)), refinement_review_requested_at: t });
  return { event: 'refinement_review_requested', text: `Refinement review requested by ${by} at ${t}` };
}

// The refinement reviewers of a team's item: the members of the teams its refinement_review rules name (teams.json); with no
// rule, anyone but the author.
export function refinementReview({ fm }, verdict, { by, comments } = {}) {
  if (!by) reject('--refinement-review needs --by <reviewer>');
  const rules = refinementReviewRules(fm.team);
  if (rules.length && !rules.some(r => isTeamMember(r.team, by))) reject(`--refinement-review --by ${by}: the refinement of team ${fm.team} is reviewed by a member of ${rules.map(r => r.team).join(' or ')} (teams.json)`);
  if (fm.stage !== 'refinement-review') reject(`no refinement review is requested (stage ${fm.stage || 'none'})`);
  if (!strip(comments || '')) reject('--refinement-review needs --comments "<the reviewer\'s findings, and its thread or session id>"');
  gate('refinement-review', fm, by);
  const t = now();
  const passed = verdict === 'complete';
  Object.assign(fm, { status: next('refinement-review', fm, entryOf(fm), passed ? 'complete' : 'reject'), refiner: passed ? fm.refiner || '' : '', refinement_reviewed_by: by, refinement_reviewed_at: t,
    ...(passed ? {} : { refinement_reviews: [...asList(fm.refinement_reviews), `${t} reject ${by}: ${oneLine(comments)}`] }) });
  return { event: 'refinement_reviewed', text: `## Refinement review by ${by}: ${passed ? 'COMPLETE: ready' : 'REJECT: back to refining'} (${t})\n\n${comments}` };
}

// Beyond the earlier scripts: an item whose refinement needs an owner decision waits in stage
// review-hitl, with the question; the owner's answer sends it back to refining, where the lead re-refines it.
const BEFORE_READY = ['refining', 'refined', 'refinement-review'];
export function requestDecision({ fm }, by, question) {
  if (!by) reject('--request-decision needs --by <agent>');
  if (!fm.team || !BEFORE_READY.includes(fm.stage)) reject(`only a team item before ready waits for an owner decision (${inStage(fm)})`);
  if (!strip(question || '')) reject('--request-decision needs the question: what, why, how it came up, the options and a recommendation');
  gate('request-decision', fm, by);
  const t = now();
  Object.assign(fm, { status: next('request-decision', fm, entryOf(fm)), decision_from: fm.status, decision_requested_by: by, decision_requested_at: t, decision_question: question, refiner: '' }); // the question in the front matter: --decisions lists it whole
  return { event: 'decision_requested', text: `## Owner decision needed (asked by ${by} at ${t})\n\n${question}` };
}

export function decision({ fm, folder, repo }, answer) {
  if (fm.stage !== 'review-hitl') reject(`no owner decision is pending (stage ${fm.stage || 'none'})`);
  if (!strip(answer || '')) reject('--decision needs the owner\'s answer');
  const t = now();
  // the design: the lead re-refines it with the decision; past a work-in-progress limit  the answer is recorded
  // all the same and the item waits in refining for whoever may start it (the owner's answer is never refused)
  const full = folder ? wipRefusal(folder, repo, { ...fm, stage: 'refining', refiner: '' }, teamLead(), fm.phase) : null;
  gate('decision', fm, teamLead());
  delete fm.decision_from; // the lead re-refines it, whatever the status was before the question
  Object.assign(fm, { status: 'refining', refiner: full ? '' : teamLead(), refine_started: full ? '' : t, decided_at: t, decision_question: '' });
  return { event: 'decided', text: `DECISION ${t.slice(0, 10)}: ${answer}${full ? `\n(no refiner yet: ${full})` : ''}` };
}

export function release({ fm }, agent, { by, reason } = {}) {
  const who = fm.claimed_by || '';
  if (isFinished(fm.status)) reject(`status is ${fm.status}; a finished item cannot be released into the queue`);
  if (who !== agent) reject(`claimed by ${who || 'nobody'}, not by ${agent}`);
  // an item in a review keeps its review word when its holder lets go (the lead closes a reviewed item nobody holds)
  const inReview = Boolean(stageOfStatus(fm.status)) || fm.status === 'review complete';
  gate('release', inReview ? { ...fm, status: 'in progress' } : fm, by || agent);
  // a team's work item (it has no refiner: it is split, not refined) goes back as it was claimed, unrefined
  // only the team lead gives back another agent's item, and says why
  if (by && by !== agent && (by !== teamLead() || !strip(reason || ''))) reject(`${by} cannot release ${agent}'s item: only the team lead (${teamLead()}) does, with --reason "<why>"`);
  // the release clears claimed_by but keeps the holder in session_authors (seeded for an item written
  // before the list existed), so the holder's self-review block stands after the release.
  Object.assign(fm, { status: inReview ? fm.status : fm.team ? (Object.hasOwn(fm, 'refiner') ? next('release', fm, entryOf(fm)) : 'new') : 'pending', claimed_by: '', claimed_at: '', session_authors: seededAuthors(fm, ''), ...(fm.wait_on ? { wait_on: '' } : {}) }); // beyond parity: a wait belongs to the holder; left behind it hides the item from pop's continue AND offers it as a claim
  return { event: 'released', text: by && by !== agent ? `Released by ${by} for ${agent} at ${now()}: ${reason}` : `Released by ${agent} at ${now()}` };
}

// the team lead takes an item from one agent and gives it to another, with the reason.
export function reassign({ fm }, agent, { by, reason } = {}) {
  if (!by || by !== teamLead()) reject(`--reassign --by <the team lead>: only the lead (${teamLead()}; SMOOTH_BACKLOG_CLI_TEAM_LEAD) gives one agent's item to another (got ${by || 'none'})`);
  if (!strip(reason || '')) reject('--reassign needs --reason "<why>"');
  if (isFinished(fm.status)) reject(`status is ${fm.status}; a finished item is not reassigned`);
  const from = fm.claimed_by || '';
  if (!from) reject(`nobody holds the item: the agent claims it`);
  if (from === agent) reject(`${agent} holds it already`);
  const t = now();
  // a reassignment is a hand-off of the work: the former holder and the review requester stay in
  // session_authors (the write seeds it for an item written before the list existed), and the new holder joins,
  // so the self-review block survives the hand-off.
  Object.assign(fm, { claimed_by: agent, claimed_at: t, session_authors: seededAuthors(fm, agent), ...(fm.wait_on ? { wait_on: '' } : {}) });
  return { event: 'reassigned', text: `## Reassigned by ${by} from ${from} to ${agent} at ${t}\n\n${reason}` };
}

// the team lead hands a review on from its reviewer (a stale one, say) to another agent, with the reason.
export function reassignReview({ fm }, agent, { by, reason } = {}) {
  if (!by || by !== teamLead()) reject(`--reassign-review --by <the team lead>: only the lead (${teamLead()}; SMOOTH_BACKLOG_CLI_TEAM_LEAD) hands a review on (got ${by || 'none'})`);
  if (!strip(reason || '')) reject('--reassign-review needs --reason "<why>"');
  if (!['requested', 'in_review'].includes(fm.review_state)) reject(`no review is requested (review_state ${fm.review_state || 'none'})`);
  if (isReviewAuthor(fm, agent)) reject(NO_SELF_REVIEW(agent));
  const from = fm.review_state === 'in_review' ? fm.reviewer || '' : '';
  const t = now();
  Object.assign(fm, { status: stageOfStatus(fm.status) === 'external' ? 'external review' : 'reviewing', reviewer: agent, review_started: t });
  return { event: 'review_reassigned', text: `## Review reassigned by ${by} from ${from || 'nobody'} to ${agent} at ${t}\n\n${reason}` };
}

// In a team session (SMOOTH_BACKLOG_CLI_TEAM_NAME set) the caller is SMOOTH_BACKLOG_CLI_AGENT and acts only as itself. Outside a team session the caller
// is not known and the named agent is taken as given.
export const caller = () => (teamName() ? strip(process.env.SMOOTH_BACKLOG_CLI_AGENT || '') : '');

// The session of the caller: SMOOTH_BACKLOG_CLI_SESSION, else the agent name (SMOOTH_BACKLOG_CLI_AGENT); '' when nothing names it.
export const callerSession = () => strip(process.env.SMOOTH_BACKLOG_CLI_SESSION || process.env.SMOOTH_BACKLOG_CLI_AGENT || '');

// The item's work commit at the time of the check: the working repository's HEAD. A commit of new work after a pass moves
// HEAD, so passes recorded for the older commit no longer count and the review runs again; the item's commit field records
// the repository state at creation (backlog new) and --commit advances that record.
export const workCommit = cwd => (spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: cwd ?? process.cwd(), encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).stdout ?? '').trim() || '';
// The item identifiers a commit subject names at the start - the repository's commit convention: the producing item number,
// or numbers joined with "and" (a commit of two items names both), then the description; the "(of <parent>)" after the
// last number names the parent, not a producer. A commit of another item that shares the item's number prefix, or only
// mentions the number later in the subject, is not the item's work.
export const leadingItemIds = subject => {
  const s = String(subject ?? '').trim();
  const first = /^(\d+)/.exec(s);
  if (!first) return [];
  const ids = [Number(first[1])];
  let rest = s.slice(first[1].length);
  for (;;) {
    const joined = /^\s+and\s+(\d+)/.exec(rest);
    if (!joined) break;
    ids.push(Number(joined[1]));
    rest = rest.slice(joined[1].length);
  }
  return ids;
};
// The item's own commits after its work commit in this checkout: new work of the item made after its review request, which
// the passes do not cover. { reason } names a failed lookup (the check fails closed and the refusal records the reason).
const laterOwnWork = (fm, cwd) => {
  const seq = Number(String(fm.seq ?? fm.phase ?? '').match(/^0*(\d+)/)?.[1]);
  const head = workCommit(cwd);
  if (!fm.work_commit || !seq || !head || head === fm.work_commit) return { later: false, reason: '' };
  const p = spawnSync('git', ['log', '--format=%s', `${fm.work_commit}..${head}`], { cwd: cwd ?? process.cwd(), encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (p.status !== 0) return { later: false, reason: String(p.stderr ?? '').trim().split('\n')[0] || `git log exited ${p.status}` };
  return { later: (p.stdout ?? '').split('\n').some(line => leadingItemIds(line).includes(seq)), reason: '' };
};
// The passes recorded on the item: "<reviewer> <commit>" entries of fm.reviews; a changes verdict clears them.
const passes = fm => asList(fm.reviews).map(x => { const [by, commit] = String(x).split(/\s+/); return { by, commit }; });
// The review rules of the item's team (teams.json): each rule needs <count> distinct passes by members (or the lead) of
// <team> on the item's current work commit. '' when every rule is met, or when the item has no team or its team no rule;
// else the refusal naming the first unmet rule. New work of the item after its review request fails the check.
export const reviewRefusal = (fm, cwd) => {
  const entry = fm.team ? entryOf(fm) : null;
  const rules = stageRules(entry);
  if (!rules.length) return '';
  const head = fm.work_commit || workCommit(cwd);
  if (!head) return `team ${fm.team}: the review rules need a work commit; request the review from the repository (--request-review)`;
  const look = laterOwnWork(fm, cwd);
  if (look.reason) return `team ${fm.team}: the commit lookup failed (${look.reason}); fail closed: request the review again`;
  if (look.later) return `team ${fm.team}: the item has new work after its last review request; request the review again`;
  for (const r of rules) {
    const have = passCount({ ...fm, work_commit: head }, entry, r);
    if (have < need(r)) return `team ${fm.team}: review rule not met - ${need(r)} pass(es) by ${r.team ? `members of team ${r.team}` : r.stage === 'peer' ? 'members of the team' : 'its external reviewers'} on the current work commit needed, ${have} recorded (teams.json)`;
  }
  return '';
};

export function requestReview({ fm }, reviewer, note, by = '') {
  if (!strip(note || '')) reject('--request-review needs --note "<what to review: commits, deployed evidence>"');
  if (fm.review_state === 'in_review') reject(`${fm.reviewer} is reviewing it since ${fm.review_started}: wait for the verdict; the team lead hands a stale review on (--reassign-review)`);
  // an unclaimed team item (its review asked for with --by) is held by nobody: its status is no obstacle. Asked for again after a pass or
  // a request (naming the next reviewer) it is the same step, from the words the definition lists; an item waiting for its external review keeps that word
  gate('request-review', fm.claimed_by ? fm : { ...fm, status: 'in progress' }, by || fm.claimed_by);
  // the one who asks never reviews it and ends its session, so an unclaimed team item names it
  if (fm.team && !fm.claimed_by && !by) reject('--request-review of an unclaimed team item needs --by <agent>, the one who asks');
  if (fm.claimed_by && by && by !== fm.claimed_by && by !== teamLead()) reject(`${fm.claimed_by} holds it: only the holder, or the team lead, asks for its review (not ${by})`);
  const t = now();
  // review_author outlives a release: the one who asked for the review never reviews it, whatever claimed_by says later;
  // the asking session joins session_authors, the list that keeps the block for every earlier session -
  // the requester is recorded, even when it is not the claimer (a team lead asking for a claimed item); the write
  // also seeds the list from the current holder and the earlier review requester, so an item written before the
  // list existed keeps the holder's block when a later release clears claimed_by
  const asked = by || fm.claimed_by || fm.review_author || '';
  // the commit under review is the requester's HEAD (the work just pushed): it becomes the item's work commit, which the
  // passes pin and the close compares; a request after a pass keeps the work commit (another item's commit pulled in moves
  // nothing); the item's own new work after its review request moves it, and the review runs again.
  const head = workCommit();
  if (head && (!passes(fm).some(p => p.commit === fm.work_commit) || laterOwnWork(fm).later)) fm.work_commit = head;
  Object.assign(fm, { status: fm.status === 'ready for external review' ? fm.status : next('request-review', fm, entryOf(fm)), reviewer, review_requested_at: t, review_started: '', review_author: asked, session_authors: seededAuthors(fm, asked) });
  return { event: 'review_requested', text: `## Review requested by ${by || fm.claimed_by || 'unknown'} at ${t} (reviewer: ${reviewer})\n\n${note}` };
}

export function startReview({ fm }, by) {
  if (!by) reject('--start-review needs --by <agent>');
  if (isReviewAuthor(fm, by)) reject(NO_SELF_REVIEW(by));
  const st = fm.review_state; const rv = fm.reviewer;
  if (!['requested', 'in_review'].includes(st)) reject(`no review is requested (review_state ${st || 'none'})`);
  if (!reviewOpenTo(fm, by)) {
    reject(`in review by ${rv} since ${fm.review_started}; review another item${staleReview(fm) ? ` (the review is stale: the team lead hands it on)` : ''}`);
  }
  const stage = stageOfStatus(fm.status) ?? 'peer';
  gate('start-review', fm, by, stage);
  const t = now();
  Object.assign(fm, { status: next('start-review', fm, entryOf(fm), null, stage), reviewer: by, review_started: t });
  return { event: 'review_started', text: `Review started by ${by} at ${t}` };
}

export function review({ fm }, verdict, { by, comments } = {}) {
  const reject_ = verdict === 'reject';
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
  // a reviewer never reviews in the author's own session
  if (fm.author_session) {
    const session = callerSession();
    if (session && session === fm.author_session) reject(`${by} reviews in the author session: a review runs in a fresh session`);
  }
  const stage = stageOfStatus(fm.status) ?? 'peer';
  gate('review', fm, by, stage);
  const t = now();
  // a complete verdict is recorded against the item's work commit (set by the review request to the requester's HEAD); the review rules
  // count the passes on the current work commit. A reject sends the item back to work and clears every pass of both stages; the finding
  // stays in the review history.
  const head = fm.work_commit || workCommit();
  fm.reviews = reject_ ? [] : [...asList(fm.reviews), `${by} ${head}`];
  Object.assign(fm, {
    status: next('review', fm, entryOf(fm), verdict, stage, { satisfied: stageSatisfied(fm, entryOf(fm), stage) }), reviewer: by, review_started: '', reviewed_at: t,
    review_history: historyLine(fm, t, stage, verdict, by, head, comments),
  });
  return { event: 'reviewed', text: `## Review by ${by}: ${reject_ ? 'REJECT' : 'COMPLETE'} (${t})\n\n${comments}` };
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

export function closeItem({ fm }, by, summary, reason) {
  if (!strip(summary || '')) reject('--close needs --summary "<what was delivered>"');
  const owner = by === 'owner';
  // the owner closes on a written decision, recorded as such; no review required
  if (owner && !strip(reason || '')) reject(`--close --by owner needs --reason "<the owner's decision>"`);
  const closer = by || fm.claimed_by || (fm.team ? '' : actor()); // outside a team the person running the command closes it
  if (!closer) reject('nobody claimed this item: pass --by <agent>');
  // only the claimer closes its item, else the team lead; the owner closes on a decision
  if (fm.claimed_by && closer !== fm.claimed_by && closer !== teamLead() && closer !== 'owner') reject(`only the claimer (${fm.claimed_by}) closes it, else the team lead (${teamLead()}); not ${closer}`);
  if (!fm.claimed_by && fm.team && closer !== teamLead() && closer !== 'owner') reject(`nobody holds this item of team ${fm.team}: the team lead (${teamLead()}) closes it; not ${closer}`); // a team's item (beyond the earlier scripts)
  // the review rules of the item's team must be met for the current work commit (none for an item without a team or rules)
  if (!owner) {
    const refusal = reviewRefusal(fm);
    if (refusal) reject(refusal);
    gate('close', fm, closer);
  }
  fm.status = next('close', fm, entryOf(fm));
  return { event: 'closed', text: owner
    ? `## Closed by owner at ${now()} (owner decision: ${strip(reason)})\n\n${summary}`
    : `## Closed by ${closer} at ${now()}\n\n${summary}` };
}

// the guards and the one team action of a call. ctx = {fm, slug, folder, repo, body, incomplete, given}:
// incomplete = missingFields before the call, given = the SETTABLE flags on the command line. Returns {refuse} (the text after
// the "❌ ") or {event, text} (event 'state_change' and no text when no action was asked).
const REFINEMENT_STEPS = ['refine-start', 'refine-done', 'request-refinement-review', 'refinement-review', 'request-decision', 'decision'];
// the agent each step acts as
const ACTS_AS = { claim: a => a.claim, release: a => a.by || a.release, reassign: a => a.by, 'reassign-review': a => a.by, 'request-review': (a, fm) => a.by || fm.claimed_by,
  close: (a, fm) => a.by || fm.claimed_by, 'waiting-done': (a, fm) => a.by || fm.claimed_by,
  'handoff': (a, fm) => a.by || fm.claimed_by, // the record acts as the claimer
  'accept-handoff': a => a.by, 'reject-handoff': a => a.by }; // the accept and reject act as --by, the team lead, and need it
const ACTIONS = ['reassign', 'reassign-review', 'refine-start', 'refine-done', 'request-refinement-review', 'refinement-review', 'request-decision', 'decision',
  'claim', 'release', 'request-review', 'start-review', 'review', 'close', 'waiting', 'waiting-done', 'handoff', 'accept-handoff', 'reject-handoff'];
// The hand-off steps are pure: they return {refuse} (the refusal
// text) or {fm: {<keys to set, in the stored form>}, text, event}; this applies the front matter keys and
// refuses as the other steps do.
const handoffStep = (slug, item, r) => {
  if (r.refuse) return { refuse: `${slug}: ${r.refuse}` };
  Object.assign(item.fm, r.fm);
  return { event: r.event, text: r.text };
};
// the close gate (059.3) as the CLI teaches its own rules. The gate runs on the
// pre-transition front matter: update.js already set status to done before the gate runs, and a done producer
// without a handoffs key is legacy - a satisfied mark - although the edge was missing before the close attempt.
// An item that is already done is not re-checked (a producer closed before the rule has no handoffs key). The
// refusal lists every open dependent edge, its state and the next command; a missing hand-off says the hand-off
// is required and where the hand-off command's help is.
export function runCloseGate({ fm, statusBefore, folder, repo, slug }) {
  if (statusBefore === 'closed') return {};
  const gateFm = { ...fm, status: statusBefore };
  const gate = closeGate({ fm: gateFm, folder, repo, slug });
  if (!gate.refuse) return gate;
  const missing = openEdges(folder, repo, gateFm).some(e => e.state === 'missing');
  if (missing) gate.refuse += ' A hand-off is required: run `backlog update --help` for details.';
  return gate;
}
export function step(a, { fm, body, path, slug, folder, repo, incomplete, given, before = fm, statusBefore = fm.status }) {
  // the hand-off flags are detected by presence, not truthiness -
  // parse accepts an empty value (update.js), so without this --handoff '' / --accept-handoff '' / --reject-handoff ''
  // select no action and fall through to a successful state change; now they select the action and are refused below.
  const actions = ACTIONS.filter(k => (k === 'handoff' || k === 'accept-handoff' || k === 'reject-handoff') ? a[k] !== undefined : a[k]);
  if (actions.length > 1) return { refuse: `one team-work step at a time (got ${actions.map(k => `--${k}`).join(', ')})` };
  if (actions.length && a[actions[0]] === '') return { refuse: `${slug}: --${actions[0]} needs the dependent (an empty value records nothing)` };
  const me = caller();
  if (actions.length && (actions[0] === 'accept-handoff' || actions[0] === 'reject-handoff') && !a.by) {
    // the receipt is the team lead's - the lead's --by is required, with no fallback to the
    // claimer (a member without --by would otherwise act as the claimer when the lead holds the item).
    return { refuse: `${slug}: --${actions[0]} needs --by <the team lead>` };
  }
  if (me && actions.length && me !== teamLead()) {
    const as = (ACTS_AS[actions[0]] ?? (x => x.by))(a, fm);
    if (as && as !== me) return { refuse: `${slug}: you are ${me} (SMOOTH_BACKLOG_CLI_AGENT): a member acts only as itself, not as ${as}; only the team lead (${teamLead()}) takes or gives another agent's work` };
  }
  const note = a.note ?? '';
  // Beyond the earlier scripts: a field, --set-* or body edit is a change too.
  if (actions.length || strip(note) || given.length || a.append || a.section || Object.keys(a).some(k => k.startsWith('set-'))) {
    const why = outsideTeam(fm);
    if (why) return { refuse: `${slug}: ${why}` };
  }
  // a refinement verdict is about the item as the reviewer saw it: nothing changes in the same call
  if (a['refinement-review'] && (a.append || a.section || given.length || Object.keys(a).some(k => k.startsWith('set-')))) {
    return { refuse: `${slug}: --refinement-review records the verdict alone; change the item first and have it reviewed again` };
  }
  // and while the refinement review runs, the item stays as the reviewer reads it
  if (before.stage === 'refinement-review' && !actions.length && (a.append || a.section || given.length || Object.keys(a).some(k => k.startsWith('set-')))) {
    return { refuse: `${slug}: in stage refinement-review the item stays as the reviewer reads it; a changes verdict returns it to refining` };
  }
  const steps = actions.filter(k => k !== 'release');
  // the owner's written-decision close (--close --by owner) is no refinement step and no team work: it runs
  // before any stage (a team item in its refinement stages included) and past the incomplete-item refusal.
  const ownerClose = actions.length === 1 && actions[0] === 'close' && a.by === 'owner';
  if (a['refine-done'] && missingFields(fm, body).length) { // a refined item is complete
    return { refuse: `${slug}: still missing ${missingFields(fm, body).join(', ')}: complete it before the refinement is marked done (${refineHow()})` };
  }
  // Being refined (or waiting for its decision), an incomplete item takes its refinement steps, notes, its text fields
  // and appended team fields or definition of done, and nothing else. Beyond the earlier scripts ( lets every step
  // through; a review): a status change, another step or appended text that is no definition of done is
  // refused, so nothing but a refinement completes it.
  const refining = before.team && ['refining', 'review-hitl'].includes(before.stage); // as the item was before this call: --set-team '' does not lift the rule
  // Beyond the earlier scripts: a team's item before stage ready takes only its refinement steps, complete
  // or not: no work, review, close or status change until its refinement review passed.
  if (before.team && before.stage && before.stage !== 'ready') {
    const work = [...steps.filter(k => !REFINEMENT_STEPS.includes(k) && k !== 'claim' && !(k === 'close' && ownerClose)).map(k => `--${k}`), ...given.filter(k => k === 'status').map(k => `--${k}`)]; // a claim has its own gate (claim)
    if (work.length) return { refuse: `${slug}: team ${before.team} item in stage ${before.stage}: before stage ready only its refinement steps run (${work.join(', ')} refused)` };
  }
  // outside the refinement stages only the lead refines an incomplete item of its team (a member known by SMOOTH_BACKLOG_CLI_AGENT
  // changes nothing on it)
  const who = me || a.by; // the team-session caller, else the agent named by --by
  // the DAG is the lead's (refine-and-split: the lead links the split items), so --set-depends-on is no refinement edit
  const edits = strip(note) || given.length || a.append || a.section || Object.keys(a).some(k => k.startsWith('set-') && k !== 'set-depends-on');
  // the design: a member, not the lead, refines in the first round; the lead edits a refining item only as its refiner
  if (who === teamLead() && before.team && before.stage === 'refining' && fm.refiner !== who && edits) { // with a step or without
    return { refuse: `${slug}: a member, not the team lead, refines in the first round (spec section 4); the lead edits an item in stage refining only as its refiner` };
  }
  if (incomplete.length && (before.team || teamScope().repo) && !refining && who && who !== teamLead() && !ownerClose && (actions.length || strip(note) || given.length || a.append || a.section || Object.keys(a).some(k => k.startsWith('set-')))) {
    return { refuse: `${slug}: incomplete item, missing ${incomplete.join(', ')}: only the team lead (${teamLead()}) refines it, not ${who}` };
  }
  // The team rules hold for team work only: an item of a team, or a session bound to a team (SMOOTH_BACKLOG_CLI_TEAM_NAME, SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY). An item
  // without a team, worked outside a team session, is claimed, reviewed, worked and closed without them.
  const teamwork = Boolean(before.team || fm.team || teamScope().repo || teamName());
  if (incomplete.length && teamwork && (teamScope().repo || steps.length || refining)) { // team work: an incomplete item is only refined
    const work = [...steps.filter(k => !(refining && REFINEMENT_STEPS.includes(k)) && !(k === 'close' && ownerClose)).map(k => `--${k}`), ...(strip(note) && !refining ? ['--note'] : []),
      // the owner's close of an incomplete item carries its --summary (the decision needs no refinement)
      ...given.filter(k => !(refining && ['name', 'objective', 'summary'].includes(k)) && !(ownerClose && k === 'summary')).map(k => `--${k}`),
      ...(a.append && !/^(?:[ \t]*ESTIMATE:[^\n]*(?:\n|$))+$/.test(a.append.trim()) && !hasDefinitionOfDone(a.append) ? ['--append'] : []),
      ...(a.section !== undefined && strip(a.section) !== 'Definition of done' ? ['--section'] : [])]; // only ESTIMATE lines and the definition of done pass as such
    if (work.length) return { refuse: `${slug}: incomplete item, missing ${incomplete.join(', ')}: in a team nobody claims, reviews or works it (${work.join(', ')} refused); the team lead refines it only: ${refineHow(slug, teamLead())}` };
  }
  if (!actions.length) return { event: 'state_change' };
  const item = { fm, folder, repo, body, path };
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
      // the hand-off steps. The record is made by the claimer (--by, else the claimer); the accept and
      // reject act as --by, the team lead, which the step requires (refused above, review r1). The functions are pure
      // (059.2), handoffStep applies their front matter.
      case 'handoff': return handoffStep(slug, item, recordHandoff(item, { dependent: a.handoff, commit: a['handoff-commit'], contract: a['handoff-contract'], verification: a['handoff-verification'],
        outputs: a['handoff-outputs'], pickup: a['handoff-pickup'], risks: a['handoff-risks'], by: a.by || fm.claimed_by }));
      case 'accept-handoff': return handoffStep(slug, item, acceptHandoff(item, { dependent: a['accept-handoff'], checks: a.checks, by: a.by, lead: teamLead() }));
      case 'reject-handoff': return handoffStep(slug, item, rejectHandoff(item, { dependent: a['reject-handoff'], reason: a.reason, by: a.by, lead: teamLead() }));
      // --close --by owner --reason "<the decision>" closes on a written decision, recorded as such.
      // the close gate (059.3) - a producer with an open dependent edge cannot close; the refusal
      // lists each open edge, its state and the next command. With no dependents the gate records handoffs: none
      // and the NONE line as part of the closed event.
      default: {
        const gate = runCloseGate({ fm, statusBefore, folder, repo, slug });
        if (gate.refuse) return { refuse: gate.refuse };
        const closed = closeItem(item, a.by, a.summary, a.reason);
        if (gate.fm) Object.assign(item.fm, gate.fm);
        return { event: closed.event, text: gate.text ? `${closed.text}\n\n${gate.text}` : closed.text };
      }
    }
  } catch (e) {
    if (e instanceof Rejected) return { refuse: e.whole ? e.message : `${slug}: ${e.message}` };
    throw e;
  }
}

// the last line of the command that hands an item to review, asks for changes or closes it.
export const shutdown = agent => `🛑 ${agent}: END THE SESSION NOW. Reply with text only and make no further tool call; your next task starts in a fresh session.`;

// Printed after a passing review: the next step towards the close. The claimer closes, else the team lead, never the reviewer.
export const closeNow = (fm, slug) => {
  const refusal = reviewRefusal(fm);
  if (refusal) return `   ➡️  NEXT: ${refusal}`;
  return !fm.claimed_by
    ? `   ➡️  CLOSE NOW: nobody holds it: the team lead closes it`
    : `   ➡️  CLOSE NOW: ${fm.claimed_by} closes it; if the claimer has not, the team lead closes it when available`;
};
