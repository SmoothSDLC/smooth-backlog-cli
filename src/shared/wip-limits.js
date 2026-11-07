// Work-in-progress limits over the whole backlog, per repository and per branch (the team and agent levels are src/team/wip.js).
// The limits are <backlog home>/wip-limits.json; a level without a number has no limit (the default for every level):
// {"overall": 40, "repository": 15 | {"default": 15, "owner/name": 20}, "branch": 8 | {"default": 8, "owner/name:branch": 2}, ...}
// Only the owner edits the file. Work in progress: an item with the status "in progress".
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { seam } from './seam.js';
import { load } from './store.js';

const LEVELS = ['overall', 'repository', 'branch'];
const warned = new Set();
export const warn = text => { if (!warned.has(text)) { warned.add(text); process.stderr.write(`⚠️  backlog: ${text}\n`); } };
export const limitsFile = home => join(home, 'wip-limits.json');
export function limits(home) {
  let raw = {};
  try { raw = JSON.parse(readFileSync(limitsFile(home), 'utf8')) ?? {}; } catch (e) { // never hold work over it, but say so
    if (e.code !== 'ENOENT') warn(`${limitsFile(home)} cannot be read or is no JSON (${e.message}); no work-in-progress limit applies until it is fixed`);
    raw = {};
  }
  return raw && typeof raw === 'object' ? raw : {};
}
export const num = v => (Number.isInteger(v) && v >= 0 ? v : null);
export function limitOf(cfg, level, key) {
  const v = cfg[level];
  if (v && typeof v === 'object') return num(v[key] ?? v.default);
  return num(v);
}
export const inProgress = fm => fm.status === 'in progress' || seam.alsoActive(fm);
// [{repository, slug, fm, path}] of every item in progress in the backlog home
export function progressItems(home) {
  const out = [];
  let owners = [];
  try { owners = readdirSync(home, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')); } catch (e) { warn(`${home} cannot be read (${e.message}); no work in progress is counted`); return out; }
  for (const o of owners) {
    let names = [];
    try { names = readdirSync(join(home, o.name), { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')); } catch (e) { warn(`${join(home, o.name)} cannot be read (${e.message}); its items are not counted against the work-in-progress limits`); continue; }
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
// null when the item may start, else why not (the limit, the count and the items holding it).
// extra: items a plan has already given out; self: the item being started where it is now (a move counts it once);
// more: further levels the caller checks after these, [{ level, key, of(item), skip, hint }] (the team's levels).
export function wipRefusal(folder, repo, fm, slug, extra = [], self = { repository: repo, slug }, more = []) {
  const home = dirname(dirname(resolve(folder)));
  const cfg = limits(home);
  if ([...LEVELS, ...more.map(m => m.level)].every(l => cfg[l] === undefined)) return null;
  const now = [...progressItems(home), ...extra].filter(x => !(x.repository === self.repository && x.slug === self.slug)); // the item itself does not count
  const levels = [
    { level: 'overall', key: undefined, of: () => true },
    { level: 'repository', key: repo, of: x => x.repository === repo },
    { level: 'branch', key: `${repo}:${fm.branch || ''}`, of: x => x.repository === repo && (x.fm.branch || '') === (fm.branch || '') },
    ...more,
  ];
  for (const { level, key, of, skip, hint = '' } of levels) {
    if (skip) continue;
    const max = limitOf(cfg, level, key);
    if (max === null) continue;
    const held = now.filter(of);
    if (held.length >= max) {
      return `the ${level} work-in-progress limit${key && level !== 'overall' ? ` of ${level === 'branch' ? `${repo} branch ${fm.branch}` : key}` : ''} is ${max} and ${held.length} item(s) are in progress (${held.slice(0, 8).map(x => `${x.repository}#${x.fm.seq ?? x.slug}`).join(', ')}${held.length > 8 ? ', ...' : ''}); finish one first${hint}`;
    }
  }
  return null;
}
