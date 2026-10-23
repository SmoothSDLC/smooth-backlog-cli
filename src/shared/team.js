// Team metadata rules for the shared backlog (cli-parity job 15): port of lib_db.py:205-211, 528-621, 645-707, 745-749.
// The oracle reads the mirror database; these read the item files of the repository folder, which the database mirrors.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, posix } from 'node:path';
import { BacklogError, input } from '../errors.js';
import { itemSelector } from './safety.js';
import { load } from './store.js';

// lib_db.py:601-606 (skills: owner 2026-10-22)
export const WORK_CLASSES = ['app-code', 'ui', 'api', 'tests', 'iac', 'network', 'identity', 'security', 'data', 'delivery', 'verify', 'docs', 'contract', 'chunk', 'skills'];
export const REVIEW_CLASSES = [...WORK_CLASSES, 'code'];
const DONE_STATES = ['done', 'archived'];
const ACTIONABLE = ['pending', 'in_progress'];

// Python str.strip()/rstrip() whitespace (not JS's: \x1c-\x1f and \x85 count, a BOM does not).
const WS = '\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
export const rstrip = s => s.replace(new RegExp(`[${WS}]+$`), '');
export const strip = s => rstrip(s).replace(new RegExp(`^[${WS}]+`), '');

// lib_db.py:627-631: a front-matter list as strings; missing, empty or 'none' is [].
export const asList = v => (v == null || (typeof v === 'string' && ['', 'none'].includes(strip(v).toLowerCase())) ? []
  : (Array.isArray(v) ? v : String(v).split(',')).map(x => strip(String(x))).filter(Boolean));

// lib_db.py:634-640: a value outside the vocabulary dies (exit 2).
export function parseClasses(text, allowed, flag) {
  const vals = asList(text); const bad = vals.filter(v => !allowed.includes(v));
  input(!bad.length, `${flag}: unknown class ${bad.join(', ')}; the vocabulary is: ${allowed.join(', ')}`);
  return vals;
}

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
  return `this item belongs to repository ${fm.repository || '(none)'} branch ${fm.branch || '(none)'}, but this team session is bound to ${repo}${branch ? ` branch ${branch}` : ''} (TEAM_REPOSITORY/TEAM_BRANCH): a team works only on its own items; read other scopes with query.py --scope, never claim or change them`;
}

// The items of the folder as the mirror rows: slug, status (an archive/ item is 'archived'), the file's front matter.
const rows = folder => load(folder).map(i => ({
  slug: i.fm.phase || basename(i.path, '.md'), path: i.path, fm: i.fm,
  status: i.path.startsWith('archive/') ? 'archived' : (Object.hasOwn(i.fm, 'status') ? i.fm.status : 'pending'),
}));

// lib_db.py:587-595: by number (a live item before an archived one) or by slug.
function byIdent(all, ident) {
  const sel = itemSelector(ident);
  if (!sel) return null;
  const hits = all.filter(r => (sel.number !== undefined ? Number(r.fm.seq) === sel.number : r.slug === sel.slug));
  return hits.find(r => r.status !== 'archived') ?? hits[0] ?? null;
}

// lib_db.py:648-655: [{id as written, item or null, fm}] for each depends_on entry that is not done or archived.
export function undoneDependencies(folder, fm) {
  const all = rows(folder);
  return asList(fm.depends_on).map(id => ({ id, item: byIdent(all, id) })).filter(d => !d.item || !DONE_STATES.includes(d.item.status))
    .map(d => ({ ...d, fm: d.item?.fm ?? {} }));
}

// lib_db.py:658-670: the open items agent holds, on every branch, by number. state: awaiting-review, waiting:<what>, active.
export function heldItems(folder, agent) {
  return rows(folder).filter(r => r.path.startsWith('phases/') && ACTIONABLE.includes(r.status) && r.fm.claimed_by === agent)
    .sort((a, b) => (a.fm.seq ?? 0) - (b.fm.seq ?? 0))
    .map(r => ({ ...r, state: ['requested', 'in_review'].includes(r.fm.review_state) ? 'awaiting-review' : r.fm.wait_on ? `waiting:${r.fm.wait_on}` : 'active' }));
}

// lib_db.py:673-680: null when agent may claim, else why not.
export function claimRefusal(folder, agent) {
  const active = heldItems(folder, agent).filter(h => h.state === 'active').map(h => h.slug);
  if (!active.length) return null;
  return `${agent} holds ${active.length} active item(s): ${active.join(', ')}; pull new work only when every item you hold waits (review requested, or update.py <item> --waiting "<what>" --by ${agent}); --force overrides`;
}

// lib_db.py:683-686: a ref covers class c when its file name starts with 'c.'.
export const uncoveredReviewClasses = (classes, refs) => classes.filter(c => !refs.some(r => posix.basename(r).startsWith(`${c}.`)));

// lib_db.py:689-697: {agent: [work classes, review classes]} from a roster file; {} without one.
export function loadRoster(path) {
  if (!path) return {};
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  try {
    const data = JSON.parse(readFileSync(path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path, 'utf8'));
    if (!plain(data)) throw new TypeError('the roster must be an object {agent: {work_classes, review_classes}}');
    return Object.fromEntries(Object.entries(data).map(([a, p]) => {
      if (!plain(p)) throw new TypeError(`${a}: expected {work_classes, review_classes}`);
      return [a, [asList(p.work_classes), asList(p.review_classes)]];
    }));
  } catch (e) { throw new BacklogError('INVALID_INPUT', `roster ${path}: ${e.message}`); }
}

// lib_db.py:700-707: the item's review classes when no roster member but its claimer holds one of them; [] otherwise.
export function fallbackReview(fm, roster) {
  const classes = asList(fm.review_classes);
  if (!Object.keys(roster).length || !classes.length) return [];
  const others = new Set(Object.entries(roster).filter(([a]) => a !== fm.claimed_by).flatMap(([, [, r]]) => r));
  return classes.some(c => others.has(c)) ? [] : classes;
}

// lib_db.py:710-715: seconds since a front-matter time stamp; -1 when there is none.
export const age = ts => (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(String(ts)) ? (Date.now() - Date.parse(ts)) / 1000 : -1);

// lib_db.py:718-723: an in-progress review older than BACKLOG_REVIEW_STALE_SECONDS (1200) is offered again.
export const staleReview = fm => fm.review_state === 'in_review' && age(fm.review_started) > Number(process.env.BACKLOG_REVIEW_STALE_SECONDS ?? 1200);

// lib_db.py:726-729: agent may start or continue the review: requested, in review by agent itself, or stale.
export const reviewOpenTo = (fm, agent) => fm.review_state === 'requested' || (fm.review_state === 'in_review' && (fm.reviewer === agent || staleReview(fm)));

// lib_db.py:745-749
export function describeDependency({ id, item, fm }) {
  return item ? `${item.slug} (status ${item.status}, claimed by ${fm.claimed_by || 'nobody'})` : `${id} (no such item in this backlog)`;
}
