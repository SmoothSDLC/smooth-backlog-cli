// Team rules of the backlog: teams, their members and leads and their review rules come from the backlog configuration
// (<home>/teams.json); identity and status come from the rows of the items (index.rows); the item files give the
// metadata the rows do not hold (claims, waits, reviews).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { input } from '../errors.js';
import { edgeState, satisfied } from './handoff.js';
import { folderRows, isForeign, itemFm, undoneDependencies as undoneDeps } from '../shared/dependencies.js';
import { load } from '../shared/store.js';
import { seam } from '../shared/seam.js';
import { SOLO, isOpen as isOpenWord, isFinished } from '../shared/status.js';
import { asList, rstrip, strip } from '../shared/text.js';
import { loadWorkflow } from './workflow.js';

// An item's review documents (review_refs) say how it is reviewed; chunk work is chunk: true.
// The refinement stages of a team's item; an item may be claimed when it has no stage (no team, or the team's work item,
// which the runner claims for the lead) or its refinement review passed. The items the lead splits off start in stage refining.
export const isReady = fm => [undefined, null, '', 'ready'].includes(fm.stage);
// The team lead: SMOOTH_BACKLOG_CLI_TEAM_LEAD, else the lead of the session's team in the backlog configuration (teams.json); no built-in name.
export const teamLead = name => strip(name || process.env.SMOOTH_BACKLOG_CLI_TEAM_LEAD || teamsConfig()[teamName()]?.lead || '');


// lib_db.is_chunk: a chunk item, small pieces of work any member does between items (front matter chunk: true).
export const isChunk = fm => ['true', 'yes', '1'].includes(String(fm.chunk).toLowerCase());
// lib_db.needs_review: an item with review documents closes only after a passing review.
export const needsReview = fm => asList(fm.review_refs).length > 0;

// lib_db.team_name / in_team: the caller's team: SMOOTH_BACKLOG_CLI_TEAM_NAME (set by the team runner, an override), else the --team of the running
// `backlog team` command; with a team named, the session works only that team's items.
let sessionTeam = '';
export const setSessionTeam = name => { sessionTeam = strip(name || ''); };
export const teamName = () => strip(process.env.SMOOTH_BACKLOG_CLI_TEAM_NAME || '') || sessionTeam;
// One team step as the engine tells an agent to run it: backlog team update <item> --team <team> --agent <agent> <flags>.
export const teamStep = (item, agent, flags, team = teamName()) => `backlog team update ${item} --team ${team || '<team>'} --agent ${agent} ${flags}`;
export const inTeam = fm => !teamName() || fm.team === teamName();
// Beyond the earlier scripts: an item of another repository, offered only as chunk
// work, is held back when it names a team other than the caller's.
export const offeredTo = (fm, f, repo) => (f === repo ? inTeam(fm) : !fm.team || !teamName() || fm.team === teamName());

// the (repository, branch) a team session is bound to by the environment; ('', '') outside a team.
export function teamScope() {
  const repo = strip(process.env.SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY || '');
  input(!repo || /^[\w.-]+\/[\w.-]+$/.test(repo), `SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY='${repo}': expected owner/name`);
  return { repo, branch: strip(process.env.SMOOTH_BACKLOG_CLI_TEAM_BRANCH || '') };
}

// SMOOTH_BACKLOG_CLI_TEAM_BRANCH, else the caller's branch ('' when detached).
export const gitBranch = cwd => teamScope().branch
  || spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).stdout?.trim() || '';

// why a team session may not act on this item; null if it may.
export function outsideTeam(fm) {
  const { repo, branch } = teamScope();
  if (!repo || ((fm.repository || '') === repo && (!branch || (fm.branch || '') === branch))) return null;
  return `this item belongs to repository ${fm.repository || '(none)'} branch ${fm.branch || '(none)'}, but this team session is bound to ${repo}${branch ? ` branch ${branch}` : ''} (SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY/SMOOTH_BACKLOG_CLI_TEAM_BRANCH): a team works only on its own items; read other scopes with backlog team query --scope, never claim or change them`;
}
// The refusal of a command that selects an existing item outside the session's scope, as an item or row: "<slug>: <why>", or null.
export const teamRefusal = item => {
  const why = outsideTeam({ repository: item.repository, branch: item.branch });
  return why ? `${item.slug ?? item.phase}: ${why}` : null;
};

// the edge state of a done producer that does not satisfy the edge; null while it is satisfied
// (accepted or legacy). The row decides the producer is done - the files give only the metadata the rows do not
// hold - so the row's status stands in for a producer file that is gone (a done producer without a handoffs key
// is legacy, whatever the files say).
const edgeRefusal = (producerFm, dependentId) => {
  const state = edgeState(producerFm, dependentId);
  return satisfied(state) ? null : state;
};


// the open rows of the active handoff whose file says agent holds them, on every branch, by number.
// state: awaiting-review, waiting:<what>, active.
export function heldItems(folder, agent, { refining = false } = {}) {
  const rows = folderRows(folder).filter(r => !isFinished(r.status)).sort((x, y) => x.seq - y.seq);
  const refines = fm => refining && !fm.claimed_by && fm.refiner === agent && fm.stage === 'refining'; // a refinement in progress is active work too
  // heldBy also matches an earlier session of the same card - the continuation is the agent's own work
  return rows.map(r => ({ ...r, fm: itemFm(folder, r) })).filter(r => heldBy(r.fm.claimed_by, agent) || refines(r.fm))
    .map(r => ({ ...r, state: ['requested', 'in_review'].includes(r.fm.review_state) ? 'awaiting-review' : r.fm.wait_on ? `waiting:${r.fm.wait_on}` : 'active' }));
}

// null when agent may claim, else why not.
export function claimRefusal(folder, agent) {
  const active = heldItems(folder, agent, { refining: true }).filter(h => h.state === 'active').map(h => h.slug);
  if (!active.length) return null;
  return `${agent} holds ${active.length} active item(s): ${active.join(', ')}; pull new work only when every item you hold waits (review requested, or ${teamStep('<item>', agent, '--waiting "<what>"')}); --force overrides`;
}

// The backlog configuration <home>/teams.json: { "<team>": { "lead": "<agent>", "members": ["<agent>",...],
// "review": [{ "team": "<team>", "count": <n> },...], "refinement_review": [{ "team": "<team>", "count": <n> }] } }.
// A team's work closes when each review rule is met: <count> distinct reviewers who are members (or the lead) of <team> passed
// the current work commit. Without a configured rule, no review is required. An unreadable file is reported once and read as empty.
let teamsCache;
export function teamsConfig() {
  if (teamsCache !== undefined) return teamsCache;
  const dir = teamsHome();
  let raw = {};
  if (dir) {
    try { raw = JSON.parse(readFileSync(join(dir, 'teams.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') warn(`${join(dir, 'teams.json')} cannot be read or is no JSON (${e.message}); no team configuration applies`); }
  }
  teamsCache = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return teamsCache;
}
export const forgetTeamsConfig = () => { teamsCache = undefined; };
// the backlog folder of this process: resolved once by store.resolveHome and remembered here (store imports this file)
let teamsHomeValue = null;
export const setTeamsHome = home => { teamsHomeValue = home; teamsCache = undefined; };
const teamsHome = () => teamsHomeValue;
export const teamMembers = team => asList(teamsConfig()[team]?.members);
// the members the team's entry lists as reviewing only: such a member is never offered a claim
export const reviewOnly = team => asList(teamsConfig()[team]?.review_only);
export const isTeamMember = (team, agent) => Boolean(agent) && (teamMembers(team).includes(agent) || teamsConfig()[team]?.lead === agent);
// 'member', 'absent' (the team is configured and the agent is not in it) or 'unknown' (no configuration for the team)
export function teamMembership(name, agent) {
  const team = teamsConfig()[strip(name || '')];
  if (!team) return 'unknown';
  return isTeamMember(name, agent) ? 'member' : 'absent';
}
export const refinementReviewRules = team => (Array.isArray(teamsConfig()[team]?.refinement_review) ? teamsConfig()[team].refinement_review : []).filter(r => r && typeof r === 'object' && r.team);
const warned = new Set();
const warn = text => { if (!warned.has(text)) { warned.add(text); process.stderr.write(`⚠️  backlog: ${text}\n`); } };

// Whether agent wrote the work under review: the current claimer, whoever asked for the review (review_author
// survives a release), or a session that claimed or asked before a continuation took over claimed_by
// (session_authors, the self-review rule is per session, and the block still applies to every earlier
// session name of the item). The one predicate behind every offer, dispatch and refusal of a review.
export const isReviewAuthor = (fm, agent) => (fm.claimed_by || '') === (agent || '')
  || (Boolean(agent) && (fm.review_author === agent || asList(fm.session_authors).includes(agent)));

// An agent name may end in :<number>, a session counter (worker:3); two such names are sessions of the same worker when the
// part before the colon is the same. A new session of a worker continues the item its earlier session claimed.
const SESSION_NAME = /^(.+):\d+$/;
export const sameWorker = (a, b) => {
  const ma = String(a ?? '').match(SESSION_NAME);
  const mb = String(b ?? '').match(SESSION_NAME);
  return Boolean(ma && mb && ma[1] === mb[1]);
};
// Work held by the agent's own name, or by an earlier session of the same worker. Every "is this item mine" check goes through here.
export const heldBy = (holder, agent) => (holder === agent) || sameWorker(holder, agent);

// seconds since a front-matter time stamp; -1 when there is none.
export const age = ts => (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(String(ts)) ? (Date.now() - Date.parse(ts)) / 1000 : -1);

// an in-progress review older than SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS (1200) is offered again.
export const staleReview = fm => fm.review_state === 'in_review' && age(fm.review_started) > Number(process.env.SMOOTH_BACKLOG_CLI_REVIEW_STALE_SECONDS ?? 1200);

// agent may start or continue the review: requested, in review by agent itself, or stale.
// Beyond the earlier scripts: a stale review is handed on by the lead
// (backlog team update <item> --team <team> --agent <lead> --reassign-review <agent> --reason), never taken over by another member.
export const reviewOpenTo = (fm, agent) => fm.review_state === 'requested' || (fm.review_state === 'in_review' && fm.reviewer === agent);

// what the team still owes before the dependent may be offered or claimed, per unsatisfied edge state.
// stale names both ways an edge goes stale: the receipt pins a record that is no longer the current one (the
// producer re-recorded after the last receipt, an acceptance or a rejection), or the current record's digest does
// not match its own fields (a broken record that pins nothing).
const HANDOFF_NEEDS = {
  missing: 'the producer has not recorded a hand-off for this item; it records one and the team lead accepts it',
  unaccepted: 'the team lead has not accepted the producer\'s hand-off',
  stale: 'the last receipt does not match the current hand-off record: the producer re-recorded it after the last receipt (an acceptance or a rejection), or the record\'s digest does not match its own fields; the producer records a clean hand-off when the record is broken, and the team lead must accept the current record',
  rejected: 'the team lead rejected the producer\'s hand-off; the team lead must accept the current record (or the producer records a new one and the lead accepts that)',
};

// a done producer with an unsatisfied edge is described by its edge state and
// what is needed, not by its claim.
export function describeDependency({ id, item, fm, foreign, handoff }) {
  const state = handoff ? `done, hand-off ${handoff}: ${HANDOFF_NEEDS[handoff]}`
    : item ? `status ${item.status}, claimed by ${fm.claimed_by || 'nobody'}` : null;
  if (foreign && item) return `${item.repository}#${item.seq} ${item.slug} of repository ${item.repository} (${state})`;
  return item ? `${item.slug} (${state})` : `${id} (no such item in ${isForeign(id) ? 'the backlog repository' : 'this backlog'})`;
}

export const STOP_TEXT = 'your session is being replaced by a fresh one for your next task (you handed your item to review or '
  + 'closed it): end your turn now with a text-only reply and no other tool call';

// The team entry that governs an item (its team's entry in the configuration; the solo rule for an item outside a team) and an item
// read from its file as the word it carries (status) with the two fields the pop still asks (stage, review_state).
export const entryOf = fm => (fm.team ? teamsConfig()[strip(String(fm.team))] : SOLO);
// The old `backlog team` commands read items with the team's entry, and call this first. No other route installs it: a command that does not
// call it (the user commands, `team validate`, the new team commands) reads and writes an item of a team as stored.
export function installSeam() {
  seam.entry = entryOf;
  seam.isMember = isTeamMember;
  seam.scope = teamScope;
  seam.inScope = fm => !outsideTeam(fm);
  seam.alsoActive = fm => fm.status === 'refining' && Boolean(fm.refiner) && !fm.claimed_by; // a refinement under way counts as work in progress
}

// ---- team definitions (backlog team define)

const TEAM_KEYS = ['name', 'lead', 'members', 'review_only', 'external_reviewers', 'workflow', 'review', 'wip'];
const NAME = /^[a-z0-9][a-z0-9:_-]*$/;
const names = v => Array.isArray(v) && v.every(x => typeof x === 'string' && x.trim() === x && x);
// The problems of a team definition (the JSON file of backlog team define), one text each; [] when it is valid.
export function validateTeam(def, home) {
  if (!def || typeof def !== 'object' || Array.isArray(def)) return ['the definition must be a JSON object'];
  const out = [];
  for (const k of Object.keys(def)) if (!TEAM_KEYS.includes(k)) out.push(`${k}: not a field of a team definition (${TEAM_KEYS.join(', ')})`);
  if (typeof def.name !== 'string' || !NAME.test(def.name)) out.push('name: must be text of lowercase letters, digits, - _ and :, starting with a letter or digit');
  if (typeof def.lead !== 'string' || !def.lead.trim()) out.push('lead: must be the name of the lead');
  if (!names(def.members) || !def.members.length) out.push('members: must be a non-empty list of names');
  else {
    if (new Set(def.members).size !== def.members.length) out.push('members: names must be distinct');
    if (def.members.includes(def.lead)) out.push('lead: the lead is not one of the members');
  }
  if (def.review_only !== undefined && !(names(def.review_only) && def.review_only.every(n => Array.isArray(def.members) && def.members.includes(n)))) out.push('review_only: must be a list of member names');
  if (def.external_reviewers !== undefined && !names(def.external_reviewers)) out.push('external_reviewers: must be a list of names');
  if (def.workflow !== undefined && typeof def.workflow !== 'string') out.push('workflow: must be the name of a flow');
  let flow = null;
  try { flow = loadWorkflow(def.workflow ?? 'team', home); } catch (e) { out.push(`workflow: ${e.message}`); }
  if (def.review !== undefined) {
    if (!Array.isArray(def.review)) out.push('review: must be a list of { stage, reviewers, count }');
    else def.review.forEach((r, i) => {
      const at = `review[${i}]`;
      if (!r || typeof r !== 'object' || Array.isArray(r)) return out.push(`${at}: must be { stage, reviewers, count }`);
      if (flow && !flow.review_stages_order.includes(r.stage)) out.push(`${at}.stage: ${JSON.stringify(r.stage)} is no stage of the flow (${flow.review_stages_order.join(', ')})`);
      if (!['members', 'external_reviewers'].includes(r.reviewers)) out.push(`${at}.reviewers: must be members or external_reviewers`);
      else if (r.reviewers === 'external_reviewers' && !(Array.isArray(def.external_reviewers) && def.external_reviewers.length)) out.push(`${at}.reviewers: external_reviewers is empty, so the stage could never be passed`);
      if (!Number.isInteger(r.count) || r.count < 1) out.push(`${at}.count: must be a whole number of at least 1`);
    });
    if (Array.isArray(def.review) && new Set(def.review.map(r => r?.stage)).size !== def.review.length) out.push('review: a stage is listed twice');
  }
  if (def.wip !== undefined) {
    const w = def.wip;
    if (!w || typeof w !== 'object' || Array.isArray(w) || Object.keys(w).some(k => !['agent', 'team'].includes(k)) || Object.values(w).some(n => !Number.isInteger(n) || n < 1)) out.push('wip: must be { agent, team } of whole numbers of at least 1');
  }
  return out;
}

// The entry teams.json keeps for a definition: the shape the engine reads ({ lead, members, external_reviewers, review }), plus the flow and limits when given.
export function teamEntry(def, home) {
  const flow = loadWorkflow(def.workflow ?? 'team', home);
  const entry = { lead: def.lead, members: def.members, external_reviewers: def.external_reviewers ?? [],
    review: (def.review ?? flow.team_entry_review_default).map(r => ({ stage: r.stage, count: r.count })) };
  if (def.review_only?.length) entry.review_only = def.review_only;
  if (def.workflow) entry.workflow = def.workflow;
  if (def.wip) entry.wip = def.wip;
  return entry;
}

// How many open items of every repository folder of the backlog carry this team (test: a word that is not finished).
export function openItemsOf(home, name) {
  let n = 0;
  for (const owner of readdirSync(home, { withFileTypes: true })) {
    if (!owner.isDirectory() || owner.name.startsWith('.')) continue;
    for (const repo of readdirSync(join(home, owner.name), { withFileTypes: true })) {
      const dir = join(home, owner.name, repo.name);
      if (repo.isDirectory() && existsSync(join(dir, 'phases'))) n += load(dir).filter(i => i.path.startsWith('phases/') && strip(String(i.fm.team ?? '')) === name && isOpenWord(i.fm.status ?? 'pending')).length;
    }
  }
  return n;
}

// The undone dependencies with the hand-off rule of the team: a done producer whose hand-off the lead has not accepted is unfinished too.
export const undoneDependencies = (folder, fm, rows) => undoneDeps(folder, fm, rows, edgeRefusal);
