// Team metadata rules for the shared backlog (cli-parity job 15): port of lib_db.py:205-211, 528-621, 645-707, 745-749.
// Like the oracle, identity and status come from the rows of the mirror database (backlog.db); the item files give only
// the metadata the rows do not hold (claims, waits, reviews).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { BacklogError, input } from '../errors.js';
import { connect } from './db.js';
import { edgeState, satisfied } from './handoff.js';
import { parse } from './frontmatter.js';
import { itemSelector } from './safety.js';
import { load } from './store.js';

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

// Item 042: owner/name#seq names an item of another repository's backlog in the same backlog repository clone.
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
// Item 042: does following deps (of the item seq of repo `repoId`, in folder) through other repositories' items lead back
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
// Item 059: the edge state of a done producer that does not satisfy the edge; null while it is satisfied
// (accepted or legacy). The row decides the producer is done - the files give only the metadata the rows do not
// hold - so the row's status stands in for a producer file that is gone (a done producer without a handoffs key
// is legacy, whatever the files say).
const edgeRefusal = (producerFm, dependentId) => {
  const state = edgeState(producerFm, dependentId);
  return satisfied(state) ? null : state;
};

// lib_db.py:648-655: [{id as written, item: the row or null, fm}] for each depends_on entry that is not done or archived.
// rows = the mirror rows of folder (the default), or those of another repository's backlog read by the caller. A foreign
// entry (item 042) is read from that repository's folder; its item carries the repository. Item 059: a done producer
// whose hand-off the lead has not accepted is an unfinished dependency too - the entry carries the edge state in
// handoff (missing, unaccepted, stale or rejected); a satisfied edge (accepted, legacy) is no entry. The dependent
// is named as the producer's repository names it: its seq for a same-repository producer,
// <dependent repository>#<seq> for a producer of another repository.
export function undoneDependencies(folder, fm, rows = mirrorRows(folder)) {
  return asList(fm.depends_on).map(id => {
    const f = foreignItem(folder, id);
    if (f !== undefined) {
      const dependentId = f && f.repository === (fm.repository || undefined) ? String(fm.seq) : `${fm.repository}#${fm.seq}`;
      const handoff = f && f.status === 'done' ? edgeRefusal(f.fm, dependentId) : null;
      return { id, item: f && { slug: f.slug, seq: f.seq, status: f.status, repository: f.repository }, fm: f ? f.fm : {}, foreign: true, ...(handoff ? { handoff } : {}) };
    }
    const item = byIdent(rows, id);
    const producer = item ? itemFm(folder, item) : {};
    const handoff = item && item.status === 'done' ? edgeRefusal({ ...producer, status: item.status }, String(fm.seq)) : null;
    return { id, item, fm: producer, ...(handoff ? { handoff } : {}) };
  }).filter(d => !d.item || !DONE_STATES.includes(d.item.status) || d.handoff);
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

// Item 059: what the team still owes before the dependent may be offered or claimed, per unsatisfied edge state.
const HANDOFF_NEEDS = {
  missing: 'the producer has not recorded a hand-off for this item; it records one and the team lead accepts it',
  unaccepted: 'the team lead has not accepted the producer\'s hand-off',
  stale: 'the producer re-recorded its hand-off after the last acceptance; the team lead must accept it again',
  rejected: 'the team lead rejected the producer\'s hand-off; a new hand-off and acceptance are needed',
};

// lib_db.py:745-749; item 059: a done producer with an unsatisfied edge is described by its edge state and
// what is needed, not by its claim.
export function describeDependency({ id, item, fm, foreign, handoff }) {
  const state = handoff ? `done, hand-off ${handoff}: ${HANDOFF_NEEDS[handoff]}`
    : item ? `status ${item.status}, claimed by ${fm.claimed_by || 'nobody'}` : null;
  if (foreign && item) return `${item.repository}#${item.seq} ${item.slug} of repository ${item.repository} (${state})`;
  return item ? `${item.slug} (${state})` : `${id} (no such item in ${isForeign(id) ? 'the backlog repository' : 'this backlog'})`;
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
// What config.json says of the agent: 'none' (no config.json, or one that cannot be read or has no members list),
// 'absent' (not registered), or {joined} (the time stamp of its registered session, null when it is invalid).
function member(tdir, agent) {
  let cfg;
  try { cfg = JSON.parse(readFileSync(join(tdir, 'config.json'), 'utf8')); } catch { return 'none'; }
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.members)) return 'none';
  const m = cfg.members.filter(x => x && typeof x === 'object' && x.name === agent);
  return m.length ? { joined: ms(m[0].joinedAt) } : 'absent';
}
export function memberJoinedMs(tdir, agent) { const m = member(tdir, agent); return typeof m === 'object' ? m.joined : null; }
const warned = new Set();
const warn = text => { if (!warned.has(text)) { warned.add(text); process.stderr.write(`⚠️  backlog: ${text}\n`); } };
// Owner 2026-10-30: nothing locks a member but a valid hand-off. The marker is written only for a registered member of
// a Qwen team whose session time stamp is valid; else no marker (Claude, Codex, the lead, a team the CLI cannot read).
// Returns {text} (the marker written, null when none is needed) or {why} (why it cannot be written: the CLI then refuses
// the hand-off).
export function markHandoff(teamName, agent, seq) {
  if (!teamName || !SAFE.test(teamName) || !SAFE.test(agent || '')) return { text: null }; // no team folder: nothing to mark
  if (agent === teamLead()) return { text: null }; // the lead is not a member
  const tdir = join(teamsRoot(), teamName);
  const m = member(tdir, agent);
  if (m === 'none' && existsSync(tdir)) warn(`${join(tdir, 'config.json')} cannot be read or names no members; no hand-off marker for ${agent}`);
  if (typeof m === 'object' && m.joined === null) warn(`the session time stamp (joinedAt) of ${agent} in ${join(tdir, 'config.json')} is no number; no hand-off marker`);
  if (typeof m !== 'object' || m.joined === null) return { text: null }; // no registered session to replace: no marker
  if (!Number.isInteger(seq)) return { why: `the item number ${seq} is no whole number` };
  const tmp = join(tdir, 'handoff', `.${agent}.${randomUUID()}.tmp`); // one per writer: two clones never share a temp file
  try {
    mkdirSync(join(tdir, 'handoff'), { recursive: true });
    const text = JSON.stringify({ at_ms: Date.now(), seq });
    writeFileSync(tmp, text);
    renameSync(tmp, join(tdir, 'handoff', `${agent}.json`));
    return { text };
  } catch (e) { rmSync(tmp, { force: true }); return { why: e.message }; }
}
// {tdir, marker} while the agent's valid hand-off waits for a fresh session, else null. Owner 2026-10-30: only a valid
// marker ({at_ms, seq}) of a registered member with a valid session time stamp not newer than the marker stops it; a
// marker that cannot be read or is malformed, an unreadable config.json and a missing name stop nobody (a warning names
// the file, which the CLI never writes malformed).
export function pendingHandoff(agent, teamName) {
  if (!SAFE.test(agent || '')) return null;
  for (const tdir of teamDirs(teamName)) {
    const file = join(tdir, 'handoff', `${agent}.json`);
    let mk;
    try { mk = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') warn(`${file} cannot be read or is no JSON; it stops nobody`); continue; }
    const at = mk && typeof mk === 'object' && !Array.isArray(mk) ? ms(mk.at_ms) : null;
    if (at === null || !Number.isInteger(mk.seq)) { warn(`${file} is no hand-off marker ({"at_ms", "seq"}); it stops nobody`); continue; }
    const m = member(tdir, agent);
    const cfg = join(tdir, 'config.json');
    if (m === 'none') { warn(`${cfg} cannot be read or names no members; the hand-off marker ${file} stops nobody`); continue; }
    if (m === 'absent') { warn(`${agent} is not registered in ${cfg}; its hand-off marker stops nobody`); continue; }
    if (m.joined === null) { warn(`the session time stamp (joinedAt) of ${agent} in ${cfg} is no number; its hand-off marker stops nobody`); continue; }
    if (m.joined <= at) return { tdir, marker: mk };
  }
  return null;
}
// A marker whose hand-off was not published is set aside as <agent>.released (the dispatcher's name for a released one).
export function releaseHandoff(teamName, agent, text) {
  if (!SAFE.test(teamName || '') || !SAFE.test(agent || '')) return;
  const dir = join(teamsRoot(), teamName, 'handoff');
  const file = join(dir, `${agent}.json`);
  const grab = join(dir, `.${agent}.${process.pid}.release`);
  try { renameSync(file, grab); } catch (e) { // none there, or one this change cannot set aside: say so, it would stop the member
    if (e.code !== 'ENOENT') warn(`${file} of a hand-off that was not published cannot be set aside (${e.message}); remove it, or ${agent} is stopped until a fresh session registers`);
    return;
  }
  // the marker is ours alone now: set it aside if it is the one this change wrote, else put it back (a later hand-off
  // from another clone, unless an even newer one took the name meanwhile)
  let mine = false;
  try { mine = readFileSync(grab, 'utf8') === text; } catch { /* unreadable: not ours */ }
  if (mine) {
    try { renameSync(grab, join(dir, `${agent}.released`)); } catch { rmSync(grab, { force: true, recursive: true }); } // never left in place: an unpublished hand-off holds nobody
  } else {
    try { linkSync(grab, file); } catch (e) { // EEXIST: a newer marker is there; anything else: say whose hand-off is lost
      if (e.code !== 'EEXIST') warn(`the hand-off marker of ${agent} (another clone's) could not be put back at ${file} (${e.message}): ${agent} is not stopped by it`);
    }
    rmSync(grab, { force: true, recursive: true });
  }
}
export const restarting = (agent, lead = teamLead()) => agent !== lead && pendingHandoff(agent) !== null; // the lead is never locked
