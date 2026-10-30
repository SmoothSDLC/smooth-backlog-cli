// Item 034 (spec section 10): work-in-progress limits overall (every repository of the backlog home), per repository,
// per branch, per team and per agent, checked by every step that starts work (a claim, a refinement start). The limits
// are <backlog home>/wip-limits.json; a level without a number has no limit (the default for every level):
//   {"overall": 40, "repository": 15 | {"default": 15, "owner/name": 20}, "branch": 8, "team": 3 | {"default": 3, "t1": 4},
//    "agent": 2 | {"default": 2, "cody": 1}, "stale_hours": 48}
// Only the owner edits the file. The team lead lifts the team and agent limits for one item with a recorded reason
// (backlog update <item> --wip-override "<reason>" --by <lead>). Work in progress: an item with status in_progress, or
// one a member is refining (stage refining, a refiner, no claimer).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { load } from './store.js';

const LEVELS = ['overall', 'repository', 'branch', 'team', 'agent'];
const warned = new Set();
const warn = text => { if (!warned.has(text)) { warned.add(text); process.stderr.write(`⚠️  backlog: ${text}\n`); } };
export const limitsFile = home => join(home, 'wip-limits.json');
export function limits(home) {
  let raw = {};
  try { raw = JSON.parse(readFileSync(limitsFile(home), 'utf8')) ?? {}; } catch (e) { // owner 2026-10-30: never hold work over it, but say so
    if (e.code !== 'ENOENT') warn(`${limitsFile(home)} cannot be read or is no JSON (${e.message}); no work-in-progress limit applies until it is fixed`);
    raw = {};
  }
  return raw && typeof raw === 'object' ? raw : {};
}
const num = v => (Number.isInteger(v) && v >= 0 ? v : null);
function limitOf(cfg, level, key) {
  const v = cfg[level];
  if (v && typeof v === 'object') return num(v[key] ?? v.default);
  return num(v);
}
const inProgress = fm => fm.status === 'in_progress' || (fm.stage === 'refining' && fm.refiner && !fm.claimed_by && (fm.status ?? 'pending') === 'pending');
const holderOf = fm => fm.claimed_by || fm.refiner || '';
// [{repository, slug, fm, path}] of every item in progress in the backlog home
export function progressItems(home) {
  const out = [];
  let owners = [];
  try { owners = readdirSync(home, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')); } catch { return out; }
  for (const o of owners) {
    let names = [];
    try { names = readdirSync(join(home, o.name), { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')); } catch { continue; }
    for (const n of names) {
      const folder = join(home, o.name, n.name);
      if (!existsSync(join(folder, 'phases'))) continue;
      let items = [];
      try { items = load(folder); } catch (e) { warn(`the items of ${o.name}/${n.name} cannot be read (${e.message}); they are not counted against the work-in-progress limits`); continue; }
      for (const i of items) if (i.path.startsWith('phases/') && inProgress(i.fm)) out.push({ repository: `${o.name}/${n.name}`, slug: i.fm.phase || i.path.slice(7, -3), fm: i.fm, path: i.path });
    }
  }
  return out;
}
// The scopes an item falls in, for the item an agent is about to start.
function scopes(repo, fm, agent) {
  return {
    overall: { key: 'all', of: x => true },
    repository: { key: repo, of: x => x.repository === repo },
    branch: { key: `${repo} ${fm.branch || ''}`, of: x => x.repository === repo && (x.fm.branch || '') === (fm.branch || '') },
    team: { key: fm.team || '', of: x => Boolean(fm.team) && x.fm.team === fm.team, skip: !fm.team },
    agent: { key: agent, of: x => holderOf(x.fm) === agent },
  };
}
// null when the agent may start the item, else why not (the limit, the count and the items holding it).
export function wipRefusal(folder, repo, fm, agent, slug, extra = []) { // extra: items a plan has already given out
  const home = dirname(dirname(resolve(folder)));
  const cfg = limits(home);
  if (LEVELS.every(l => cfg[l] === undefined)) return null;
  const now = [...progressItems(home), ...extra].filter(x => !(x.repository === repo && x.slug === slug)); // the item itself does not count
  const s = scopes(repo, fm, agent);
  for (const level of LEVELS) {
    if (s[level].skip) continue;
    if ((level === 'team' || level === 'agent') && String(fm.wip_override ?? '').trim()) continue; // the lead's recorded override
    const key = level === 'team' ? fm.team : level === 'agent' ? agent : level === 'repository' ? repo : undefined;
    const max = limitOf(cfg, level, key);
    if (max === null) continue;
    const held = now.filter(s[level].of);
    if (held.length >= max) {
      return `the ${level} work-in-progress limit${key && level !== 'overall' ? ` of ${level === 'branch' ? `${repo} branch ${fm.branch}` : key}` : ''} is ${max} and ${held.length} item(s) are in progress (${held.slice(0, 8).map(x => `${x.repository}#${x.fm.seq ?? x.slug}`).join(', ')}${held.length > 8 ? ', ...' : ''}); finish one first${level === 'team' || level === 'agent' ? ', or the team lead lifts the limit for this item: backlog update <item> --wip-override "<reason>" --by <lead>' : ''}`;
    }
  }
  return null;
}
// The read view (backlog query --wip): the counts against every limit and the stale in-progress items.
export function wipView(home, { now = Date.now() } = {}) {
  const cfg = limits(home);
  const items = progressItems(home);
  const staleMs = (num(cfg.stale_hours) ?? 48) * 3600 * 1000;
  const count = (f) => items.filter(f).length;
  const group = key => [...new Set(items.map(key).filter(Boolean))].sort();
  const rows = [
    { level: 'overall', key: 'all', count: items.length, limit: limitOf(cfg, 'overall') },
    ...group(x => x.repository).map(r => ({ level: 'repository', key: r, count: count(x => x.repository === r), limit: limitOf(cfg, 'repository', r) })),
    ...group(x => `${x.repository} ${x.fm.branch || ''}`).map(b => ({ level: 'branch', key: b, count: count(x => `${x.repository} ${x.fm.branch || ''}` === b), limit: limitOf(cfg, 'branch') })),
    ...group(x => x.fm.team).map(t => ({ level: 'team', key: t, count: count(x => x.fm.team === t), limit: limitOf(cfg, 'team', t) })),
    ...group(x => holderOf(x.fm)).map(a => ({ level: 'agent', key: a, count: count(x => holderOf(x.fm) === a), limit: limitOf(cfg, 'agent', a) })),
  ];
  const stale = items.filter(x => { const t = Date.parse(x.fm.updated || ''); return Number.isFinite(t) && now - t > staleMs; })
    .map(x => ({ item: `${x.repository}#${x.fm.seq}`, slug: x.slug, holder: holderOf(x.fm) || null, updated: x.fm.updated }));
  return { limits_file: limitsFile(home), stale_hours: staleMs / 3600000, counts: rows, stale };
}
