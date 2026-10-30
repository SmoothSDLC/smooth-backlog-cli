// Team metadata rules for the shared backlog (cli-parity job 15): port of lib_db.py:205-211, 528-621, 645-707, 745-749.
// Like the oracle, identity and status come from the rows of the mirror database (backlog.db); the item files give only
// the metadata the rows do not hold (claims, waits, reviews).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { BacklogError, input } from '../errors.js';
import { connect } from './db.js';
import { parse } from './frontmatter.js';
import { itemSelector } from './safety.js';

// An item's review documents (review_refs) say how it is reviewed; chunk work is chunk: true (owner 2026-10-28).
export const REVIEW_DIR = 'references/review/'; // lib_db.py REVIEW_DIR: the review documents of cody-coding-model
// lib_db.STAGES and the review-hitl stage of topology item 288; REFINEMENT_REVIEWERS record a refinement verdict.
export const STAGES = ['refining', 'refined', 'refinement-review', 'review-hitl', 'ready'];
export const REFINEMENT_REVIEWERS = ['codex', 'claude'];
// lib_db.is_ready: an item may be claimed when it has no stage (no team, or the team's work item, which the runner claims
// for the lead) or its refinement review passed. The items the lead splits off start in stage refining.
export const isReady = fm => [undefined, null, '', 'ready'].includes(fm.stage);
// lib_db.team_lead: --lead, else env TEAM_LEAD, else cody. Only the lead refines an incomplete item and requests the refinement review.
export const teamLead = name => strip(name || process.env.TEAM_LEAD || 'cody');
const DONE_STATES = ['done', 'archived'];
const ACTIONABLE = ['pending', 'in_progress'];

// Python str.strip()/rstrip() whitespace (not JS's: \x1c-\x1f and \x85 count, a BOM does not).
const WS = '\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
export const rstrip = s => s.replace(new RegExp(`[${WS}]+$`), '');
export const strip = s => rstrip(s).replace(new RegExp(`^[${WS}]+`), '');

// lib_db.py:627-631: a front-matter list as strings; missing, empty or 'none' is [].
export const asList = v => (v == null || (typeof v === 'string' && ['', 'none'].includes(strip(v).toLowerCase())) ? []
  : (Array.isArray(v) ? v : String(v).split(',')).map(x => strip(String(x))).filter(Boolean));

// lib_db.is_chunk: a chunk item, small pieces of work any member does between items (front matter chunk: true).
export const isChunk = fm => ['true', 'yes', '1'].includes(String(fm.chunk).toLowerCase());
// lib_db.needs_review: an item with review documents closes only after a passing review.
export const needsReview = fm => asList(fm.review_refs).length > 0;

// lib_db.team_name / in_team: the caller's team (env TEAM_NAME, set by the team runner); with it set, a member works only
// that team's items (owner 2026-10-28: the team that refined and split items owns them).
export const teamName = () => strip(process.env.TEAM_NAME || '');
export const inTeam = fm => !teamName() || fm.team === teamName();
// Beyond the oracle (item 037: another team's item is never offered): an item of another repository, offered only as chunk
// work, is held back when it names a team other than the caller's.
export const offeredTo = (fm, f, repo) => (f === repo ? inTeam(fm) : !fm.team || !teamName() || fm.team === teamName());

// lib_db.py:205-211: the (repository, branch) a team session is bound to by the environment; ('', '') outside a team.
export function teamScope() {
  const repo = strip(process.env.TEAM_REPOSITORY || '');
  input(!repo || /^[\w.-]+\/[\w.-]+$/.test(repo), `TEAM_REPOSITORY='${repo}': expected owner/name`);
  return { repo, branch: strip(process.env.TEAM_BRANCH || '') };
}

// lib_db.py:200-202: TEAM_BRANCH, else the caller's branch ('' when detached).
export const gitBranch = cwd => teamScope().branch
  || spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).stdout?.trim() || '';

// lib_db.py:263-270: why a team session may not act on this item; null if it may.
export function outsideTeam(fm) {
  const { repo, branch } = teamScope();
  if (!repo || ((fm.repository || '') === repo && (!branch || (fm.branch || '') === branch))) return null;
  return `this item belongs to repository ${fm.repository || '(none)'} branch ${fm.branch || '(none)'}, but this team session is bound to ${repo}${branch ? ` branch ${branch}` : ''} (TEAM_REPOSITORY/TEAM_BRANCH): a team works only on its own items; read other scopes with backlog query --scope, never claim or change them`;
}

// lib_db.py:587-595 phase_by_ident over the mirror rows: by number (a live row before an archived one) or by slug.
function byIdent(rows, ident) {
  const sel = itemSelector(ident);
  if (!sel) return null;
  const hits = rows.filter(r => (sel.number !== undefined ? Number(r.seq) === sel.number : r.slug === sel.slug));
  return hits.find(r => r.status !== 'archived') ?? hits[0] ?? null;
}

// lib_db.py:643 item_fm: the front matter of the row's file, {} when it is gone (or outside the folder); a parse or I/O error propagates. The rows give
// identity and status; the files only the metadata the rows do not hold.
function itemFm(folder, row) {
  let file;
  try { file = realpathSync(resolve(folder, String(row.path))); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } // only a missing file is {}
  return file.startsWith(realpathSync(folder) + sep) ? parse(readFileSync(file, 'utf8')).fm : {};
}

// All rows of the folder's backlog.db, in id order (connect writes nothing to an up-to-date db).
export function mirrorRows(folder) {
  const con = connect(folder);
  try { return con.prepare('SELECT * FROM phase ORDER BY id').all().map(r => ({ ...r })); } finally { con.close(); }
}

// lib_db.py:648-655: [{id as written, item: the row or null, fm}] for each depends_on entry that is not done or archived.
// rows = the mirror rows of folder (the default), or those of another repository's backlog read by the caller.
export function undoneDependencies(folder, fm, rows = mirrorRows(folder)) {
  return asList(fm.depends_on).map(id => ({ id, item: byIdent(rows, id) })).filter(d => !d.item || !DONE_STATES.includes(d.item.status))
    .map(d => ({ ...d, fm: d.item ? itemFm(folder, d.item) : {} }));
}

// lib_db.py:658-670: the open rows of the active handoff whose file says agent holds them, on every branch, by number.
// state: awaiting-review, waiting:<what>, active.
export function heldItems(folder, agent, { refining = false } = {}) {
  const con = connect(folder);
  let rows;
  try {
    const hid = con.prepare("SELECT id FROM handoff WHERE status='active' LIMIT 1").get()?.id ?? null;
    rows = con.prepare(`SELECT * FROM phase WHERE handoff_id=? AND status IN (${ACTIONABLE.map(() => '?')}) ORDER BY seq`).all(hid, ...ACTIONABLE).map(r => ({ ...r }));
  } finally { con.close(); }
  const refines = fm => refining && !fm.claimed_by && fm.refiner === agent && fm.stage === 'refining'; // a refinement in progress is active work too (item 039)
  return rows.map(r => ({ ...r, fm: itemFm(folder, r) })).filter(r => r.fm.claimed_by === agent || refines(r.fm))
    .map(r => ({ ...r, state: ['requested', 'in_review'].includes(r.fm.review_state) ? 'awaiting-review' : r.fm.wait_on ? `waiting:${r.fm.wait_on}` : 'active' }));
}

// lib_db.py:673-680: null when agent may claim, else why not.
export function claimRefusal(folder, agent) {
  const active = heldItems(folder, agent, { refining: true }).filter(h => h.state === 'active').map(h => h.slug);
  if (!active.length) return null;
  return `${agent} holds ${active.length} active item(s): ${active.join(', ')}; pull new work only when every item you hold waits (review requested, or backlog update <item> --waiting "<what>" --by ${agent}); --force overrides`;
}

// lib_db.load_roster: {agent: profile} from a team roster {agent: {...}} (the team's members, in order); {} without one.
export function loadRoster(path) {
  if (!path) return {};
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  try {
    const data = JSON.parse(readFileSync(path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path, 'utf8'));
    if (!plain(data)) throw new TypeError('the roster must be an object {agent: {...}}');
    return Object.fromEntries(Object.entries(data).map(([a, p]) => [a, plain(p) ? p : {}]));
  } catch (e) { throw new BacklogError('INVALID_INPUT', `roster ${path}: ${e.message}`); }
}

// Whether agent wrote the work under review: the current claimer, or whoever asked for the review (review_author survives a release).
// The one predicate behind every offer, dispatch and refusal of a review.
export const isReviewAuthor = (fm, agent) => (fm.claimed_by || '') === (agent || '') || (Boolean(agent) && fm.review_author === agent);

// lib_db.py:710-715: seconds since a front-matter time stamp; -1 when there is none.
export const age = ts => (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(String(ts)) ? (Date.now() - Date.parse(ts)) / 1000 : -1);

// lib_db.py:718-723: an in-progress review older than BACKLOG_REVIEW_STALE_SECONDS (1200) is offered again.
export const staleReview = fm => fm.review_state === 'in_review' && age(fm.review_started) > Number(process.env.BACKLOG_REVIEW_STALE_SECONDS ?? 1200);

// lib_db.py:726-729: agent may start or continue the review: requested, in review by agent itself, or stale.
// Beyond the oracle (item 033: only the team lead takes another agent's work): a stale review is handed on by the lead
// (backlog update <item> --reassign-review <agent> --by <lead> --reason), never taken over by another member.
export const reviewOpenTo = (fm, agent) => fm.review_state === 'requested' || (fm.review_state === 'in_review' && fm.reviewer === agent);

// lib_db.py:745-749
export function describeDependency({ id, item, fm }) {
  return item ? `${item.slug} (status ${item.status}, claimed by ${fm.claimed_by || 'nobody'})` : `${id} (no such item in this backlog)`;
}

// The hand-off lock (item 038; spec 2026-10-28-pr1-learnings.md section 7; PR1 lib_db.py:770-827). A member that hands its
// item to review or closes it gets ~/.qwen/teams/<team>/handoff/<agent>.json ({"at_ms", "seq"}), and is locked until Qwen
// registers a session of that agent (config.json members[].joinedAt) newer than the marker. The lead is not a member and
// gets none. The same files and format as PR1, so its dispatcher and wake loop keep working during the cut-over.
export const STOP_TEXT = 'your session is being replaced by a fresh one for your next task (you handed your item to review or '
  + 'closed it): end your turn now with a text-only reply and no other tool call';
const SAFE = /^(?!\.{1,2}$)[\w.-]+$/; // a team or agent name is one path segment, never . or ..
// a time stamp is a finite number or a string of digits; anything else (an array, an object, text) is no time stamp
const ms = v => { const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const teamsRoot = () => join(homedir(), '.qwen', 'teams');
export function teamDirs(name) {
  const t = strip(name || process.env.TEAM_NAME || '');
  if (t) return SAFE.test(t) ? [join(teamsRoot(), t)] : [];
  try { return readdirSync(teamsRoot(), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => join(teamsRoot(), e.name)).sort(); } catch { return []; }
}
// What config.json says of the agent: 'no-team' (no config.json: no Qwen team), 'unreadable', 'absent' (not registered),
// or {joined} (the time stamp of its registered session, null when it is invalid).
function member(tdir, agent) {
  let text;
  try { text = readFileSync(join(tdir, 'config.json'), 'utf8'); } catch (e) { return e.code === 'ENOENT' && !existsSync(tdir) ? 'no-team' : 'unreadable'; } // a team folder without its config.json fails closed
  let cfg;
  try { cfg = JSON.parse(text); } catch { return 'unreadable'; }
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.members)) return 'unreadable';
  const m = cfg.members.filter(x => x && typeof x === 'object' && x.name === agent);
  return m.length ? { joined: ms(m[0].joinedAt ?? 0) } : 'absent';
}
// joinedAt of the agent's registered session; null when it is not registered, its time stamp is invalid, or config.json
// cannot be read: no fresh session
export function memberJoinedMs(tdir, agent) { const m = member(tdir, agent); return typeof m === 'object' ? m.joined : null; }
// Returns null when written or when the agent is no registered member of a Qwen team (Claude or Codex working a team's
// item, or the lead), else why it was not written (as PR1, the command does not fail; update.js warns).
export function markHandoff(teamName, agent, seq) {
  if (!teamName || !SAFE.test(teamName) || !SAFE.test(agent || '')) return `no team folder for team ${teamName || '(none)'} and agent ${agent || '(none)'}`;
  if (agent === teamLead()) return null; // the lead is not a member
  const tdir = join(teamsRoot(), teamName);
  const m = member(tdir, agent);
  if (m === 'no-team' || m === 'absent') return null; // no registered member of a Qwen team (Claude, Codex): nothing to lock
  // a registered member (with a valid time stamp or not), or a config.json that cannot be read: lock (fail closed)
  try {
    mkdirSync(join(tdir, 'handoff'), { recursive: true });
    const tmp = join(tdir, 'handoff', `.${agent}.tmp`);
    writeFileSync(tmp, JSON.stringify({ at_ms: Date.now(), seq }));
    renameSync(tmp, join(tdir, 'handoff', `${agent}.json`));
    return null;
  } catch (e) { return e.message; }
}
// {tdir, marker} while the agent's hand-off waits for a fresh session, else null. An unreadable config.json or a missing
// name keeps it locked, and so does a malformed marker (beyond PR1, which skipped one that is no JSON).
export function pendingHandoff(agent, teamName) {
  if (!SAFE.test(agent || '')) return null;
  for (const tdir of teamDirs(teamName)) {
    let text;
    try { text = readFileSync(join(tdir, 'handoff', `${agent}.json`), 'utf8'); } catch (e) { if (e.code === 'ENOENT') continue; return { tdir, marker: {} }; } // a marker that cannot be read keeps the lock
    let mk;
    try { mk = JSON.parse(text); } catch { mk = {}; }
    if (!mk || typeof mk !== 'object' || Array.isArray(mk)) mk = {};
    const at = ms(mk.at_ms);
    const joined = memberJoinedMs(tdir, agent);
    // item 038's definition of done: a malformed marker or time stamp never releases the lock (stricter than PR1 and
    // spec section 7's time 0); the dispatcher sets such a marker aside
    if (at === null || !Number.isInteger(mk.seq) || joined === null || joined <= at) return { tdir, marker: mk };
  }
  return null;
}
// A marker whose hand-off was not published is set aside as <agent>.released (the dispatcher's name for a released one).
export function releaseHandoff(teamName, agent, text) {
  if (!SAFE.test(teamName || '') || !SAFE.test(agent || '')) return;
  const dir = join(teamsRoot(), teamName, 'handoff');
  try { // only the marker this change wrote: a later hand-off of the same agent, from another clone, keeps its lock
    if (readFileSync(join(dir, `${agent}.json`), 'utf8') === text) renameSync(join(dir, `${agent}.json`), join(dir, `${agent}.released`));
  } catch { /* none there */ }
}
export const handoffText = (teamName, agent) => { try { return readFileSync(join(teamsRoot(), teamName, 'handoff', `${agent}.json`), 'utf8'); } catch { return null; } };
export const restarting = agent => agent !== teamLead() && pendingHandoff(agent) !== null; // the lead is never locked
