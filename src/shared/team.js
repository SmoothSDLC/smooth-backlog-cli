// Team rules of the backlog: teams, their members and leads and their review rules come from the backlog configuration
// (<home>/teams.json); identity and status come from the rows of the items (index.rows); the item files give the
// metadata the rows do not hold (claims, waits, reviews).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { BacklogError, input } from '../errors.js';
import { edgeState, satisfied } from './handoff.js';
import * as index from './index.js';
import { parse } from './frontmatter.js';
import { itemSelector } from './safety.js';
import { load } from './store.js';
import { SOLO, isFinished, isOpen as isOpenWord, lift, loadWorkflow } from './workflow.js';

// An item's review documents (review_refs) say how it is reviewed; chunk work is chunk: true.
// The refinement stages of a team's item; an item may be claimed when it has no stage (no team, or the team's work item,
// which the runner claims for the lead) or its refinement review passed. The items the lead splits off start in stage refining.
export const isReady = fm => [undefined, null, '', 'ready'].includes(fm.stage);
// The team lead: TEAM_LEAD, else the lead of the session's team in the backlog configuration (teams.json); no built-in name.
export const teamLead = name => strip(name || process.env.TEAM_LEAD || teamsConfig()[teamName()]?.lead || '');

// Python str.strip/rstrip whitespace (not JS's: \x1c-\x1f and \x85 count, a BOM does not).
const WS = '\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
export const rstrip = s => s.replace(new RegExp(`[${WS}]+$`), '');
export const strip = s => rstrip(s).replace(new RegExp(`^[${WS}]+`), '');

// a front-matter list as strings; missing, empty or 'none' is [].
export const asList = v => (v == null || (typeof v === 'string' && ['', 'none'].includes(strip(v).toLowerCase())) ? []
  : (Array.isArray(v) ? v : String(v).split(',')).map(x => strip(String(x))).filter(Boolean));

// lib_db.is_chunk: a chunk item, small pieces of work any member does between items (front matter chunk: true).
export const isChunk = fm => ['true', 'yes', '1'].includes(String(fm.chunk).toLowerCase());
// lib_db.needs_review: an item with review documents closes only after a passing review.
export const needsReview = fm => asList(fm.review_refs).length > 0;

// lib_db.team_name / in_team: the caller's team (env TEAM_NAME, set by the team runner); with it set, a member works only
// that team's items.
export const teamName = () => strip(process.env.TEAM_NAME || '');
export const inTeam = fm => !teamName() || fm.team === teamName();
// Beyond the earlier scripts: an item of another repository, offered only as chunk
// work, is held back when it names a team other than the caller's.
export const offeredTo = (fm, f, repo) => (f === repo ? inTeam(fm) : !fm.team || !teamName() || fm.team === teamName());

// the (repository, branch) a team session is bound to by the environment; ('', '') outside a team.
export function teamScope() {
  const repo = strip(process.env.TEAM_REPOSITORY || '');
  input(!repo || /^[\w.-]+\/[\w.-]+$/.test(repo), `TEAM_REPOSITORY='${repo}': expected owner/name`);
  return { repo, branch: strip(process.env.TEAM_BRANCH || '') };
}

// TEAM_BRANCH, else the caller's branch ('' when detached).
export const gitBranch = cwd => teamScope().branch
  || spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).stdout?.trim() || '';

// why a team session may not act on this item; null if it may.
export function outsideTeam(fm) {
  const { repo, branch } = teamScope();
  if (!repo || ((fm.repository || '') === repo && (!branch || (fm.branch || '') === branch))) return null;
  return `this item belongs to repository ${fm.repository || '(none)'} branch ${fm.branch || '(none)'}, but this team session is bound to ${repo}${branch ? ` branch ${branch}` : ''} (TEAM_REPOSITORY/TEAM_BRANCH): a team works only on its own items; read other scopes with backlog query --scope, never claim or change them`;
}

// phase_by_ident over the rows: by number (a live row before an archived one) or by slug.
function byIdent(rows, ident) {
  const sel = itemSelector(ident);
  if (!sel) return null;
  const hits = rows.filter(r => (sel.number !== undefined ? Number(r.seq) === sel.number : r.slug === sel.slug));
  return hits.find(r => r.status !== 'archived') ?? hits[0] ?? null;
}

// item_fm: the front matter of the row's file, {} when it is gone (or outside the folder); a parse or I/O error propagates. The rows give
// identity and status; the files only the metadata the rows do not hold.
function itemFm(folder, row) {
  let file;
  try { file = realpathSync(resolve(folder, String(row.path))); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } // only a missing file is {}
  return file.startsWith(realpathSync(folder) + sep) ? lifted(parse(readFileSync(file, 'utf8'))).fm : {};
}

// All rows of the folder's items (index.rows), in file order.
export const folderRows = folder => index.rows(folder).rows;

// owner/name#seq names an item of another repository's backlog in the same backlog repository clone.
const SAFE = /^(?!\.{1,2}$)[\w.:-]+$/; // an owner or repository name is one path segment, never. or..
const FOREIGN = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
export const isForeign = id => FOREIGN.test(String(id ?? '').trim());
// {repository, seq, slug, status, fm} of a foreign reference; null when that repository has no backlog folder or no such
// item; undefined when id is no foreign reference. folder: this repository's folder of the backlog repository.
export function foreignItem(folder, id) {
  const m = FOREIGN.exec(String(id ?? '').trim());
  if (!m) return undefined;
  if (!SAFE.test(m[1]) || !SAFE.test(m[2])) return null;
  const other = join(dirname(dirname(resolve(folder))), m[1], m[2]);
  if (!existsSync(other)) return null;
  const hits = load(other).filter(i => Number(i.fm.seq) === Number(m[3]));
  const it = hits.find(i => i.fm.status !== 'archived') ?? hits[0];
  return it ? { repository: `${m[1]}/${m[2]}`, seq: Number(m[3]), slug: it.fm.phase || basename(it.path, '.md'), status: it.fm.status ?? 'pending', fm: it.fm } : null;
}
// does following deps (of the item seq of repo `repoId`, in folder) through other repositories' items lead back
// to it? Returns the reference that closes the cycle, or null. Local entries are read in the folder they are written in.
// cache: repository -> its items, shared by the calls of one check (a publication checks every changed item)
export function foreignCycle(folder, repoId, seq, deps, cache = new Map()) {
  const home = dirname(dirname(resolve(folder)));
  const self = `${repoId}#${Number(seq)}`;
  const items = repo => { if (!cache.has(repo)) { const dir = join(home, ...repo.split('/')); cache.set(repo, existsSync(dir) ? load(dir) : []); } return cache.get(repo); };
  const nodeOf = (repo, d) => {
    const s = String(d ?? '').trim();
    const m = FOREIGN.exec(s);
    if (m) return `${m[1]}/${m[2]}#${Number(m[3])}`;
    const it = /^\d+$/.test(s) ? items(repo).find(i => Number(i.fm.seq) === Number(s)) : items(repo).find(i => (i.fm.phase || basename(i.path, '.md')) === s);
    return it ? `${repo}#${Number(it.fm.seq)}` : null;
  };
  const seen = new Set();
  const stack = asList(deps).map(d => nodeOf(repoId, d)).filter(Boolean);
  while (stack.length) {
    const node = stack.pop();
    if (node === self) return self;
    if (seen.has(node)) continue;
    seen.add(node);
    const [repo, n] = [node.slice(0, node.lastIndexOf('#')), Number(node.slice(node.lastIndexOf('#') + 1))];
    const it = items(repo).find(i => Number(i.fm.seq) === n); // archived items too: their dependencies are still edges
    if (it) for (const d of asList(it.fm.depends_on)) { const next = nodeOf(repo, d); if (next) stack.push(next); }
  }
  return null;
}
// the edge state of a done producer that does not satisfy the edge; null while it is satisfied
// (accepted or legacy). The row decides the producer is done - the files give only the metadata the rows do not
// hold - so the row's status stands in for a producer file that is gone (a done producer without a handoffs key
// is legacy, whatever the files say).
const edgeRefusal = (producerFm, dependentId) => {
  const state = edgeState(producerFm, dependentId);
  return satisfied(state) ? null : state;
};

// [{id as written, item: the row or null, fm}] for each depends_on entry that is not done or archived.
// rows = the rows of folder (the default), or those of another repository's backlog read by the caller. A foreign
// entry is read from that repository's folder; its item carries the repository. a done producer
// whose hand-off the lead has not accepted is an unfinished dependency too - the entry carries the edge state in
// handoff (missing, unaccepted, stale or rejected); a satisfied edge (accepted, legacy) is no entry. The dependent
// is named as the producer's repository names it: its seq for a same-repository producer,
// <dependent repository>#<seq> for a producer of another repository.
export function undoneDependencies(folder, fm, rows = folderRows(folder)) {
  return asList(fm.depends_on).map(id => {
    const f = foreignItem(folder, id);
    if (f !== undefined) {
      const dependentId = f && f.repository === (fm.repository || undefined) ? String(fm.seq) : `${fm.repository}#${fm.seq}`;
      const handoff = f && f.status === 'closed' ? edgeRefusal(f.fm, dependentId) : null;
      return { id, item: f && { slug: f.slug, seq: f.seq, status: f.status, repository: f.repository }, fm: f ? f.fm : {}, foreign: true, ...(handoff ? { handoff } : {}) };
    }
    const item = byIdent(rows, id);
    const producer = item ? itemFm(folder, item) : {};
    const handoff = item && item.status === 'closed' ? edgeRefusal({ ...producer, status: item.status }, String(fm.seq)) : null;
    return { id, item, fm: producer, ...(handoff ? { handoff } : {}) };
  }).filter(d => !d.item || !isFinished(d.item.status) || d.handoff);
}

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
  return `${agent} holds ${active.length} active item(s): ${active.join(', ')}; pull new work only when every item you hold waits (review requested, or backlog update <item> --waiting "<what>" --by ${agent}); --force overrides`;
}

// lib_db.load_roster: {agent: profile} from a team roster {agent: {...}} (the team's members, in order); {} without one.
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

export function loadRoster(path) {
  if (!path) return {};
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  try {
    const data = JSON.parse(readFileSync(path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path, 'utf8'));
    if (!plain(data)) throw new TypeError('the roster must be an object {agent: {...}}');
    return Object.fromEntries(Object.entries(data).map(([a, p]) => [a, plain(p) ? p : {}]));
  } catch (e) { throw new BacklogError('INVALID_INPUT', `roster ${path}: ${e.message}`); }
}

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

// an in-progress review older than BACKLOG_REVIEW_STALE_SECONDS (1200) is offered again.
export const staleReview = fm => fm.review_state === 'in_review' && age(fm.review_started) > Number(process.env.BACKLOG_REVIEW_STALE_SECONDS ?? 1200);

// agent may start or continue the review: requested, in review by agent itself, or stale.
// Beyond the earlier scripts: a stale review is handed on by the lead
// (backlog update <item> --reassign-review <agent> --by <lead> --reason), never taken over by another member.
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
export const lifted = doc => lift(doc, entryOf(doc.fm));

// ---- team definitions (backlog team define)

const TEAM_KEYS = ['name', 'lead', 'members', 'external_reviewers', 'workflow', 'review', 'wip'];
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
