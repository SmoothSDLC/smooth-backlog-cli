// Stale-view guard (backlog-cli item 025). Every item write stamps `updated_by` next to `updated`. A command that shows an item to an agent, and
// every explicit write after it succeeds, records what that agent saw (updated, updated_by, the backlog commit) in <clone>/.git/smooth-backlog-cli-views/<agent>.json;
// a write to an item the agent has seen first compares the file with that record and refuses (exit 5) when someone else changed it since.
// An item the agent never saw is written without a check (its first write). Items without updated_by (older files) read as written by nobody.
import { spawnSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { BacklogError } from '../errors.js';
import { parse } from './frontmatter.js';

export const STALE_EXIT = 5;
let current; // the --by/--agent of the running command
export const setActor = name => { if (name) current = String(name); };
// a Qwen teammate's id is name@team; the agent is the name, as --by and --agent name it (item 051: one agent, one view)
const qwen = () => { const id = (process.env.QWEN_CODE_AGENT_ID || '').trim(); return /^[^@\s]+@\S+$/.test(id) ? id.split('@')[0] : id; };
export const actor = () => current || qwen() || process.env.USER || 'unknown';
// Hash the exact name: replacement aliases distinct agents. Old lossy names are deliberately not read.
const viewsFile = (home, agent) => join(home, '.git', 'smooth-backlog-cli-views', `${createHash('sha256').update(agent).digest('hex')}.json`);
const homeOf = folder => dirname(dirname(folder)); // <home>/<owner>/<name>
const operation = new AsyncLocalStorage();

// One scope follows the clone lock through pulls, all repository folders and
// publication retries. Ranking callers cannot forget to pass a guard callback.
export const guarded = fn => operation.getStore() ? fn() : operation.run({ guard: [], created: new Set(), incidental: new Map() }, fn);
export const created = (folder, path) => operation.getStore()?.created.add(join(folder, path));
export function publicationGuard(given = []) {
  const guard = operation.getStore()?.guard ?? [];
  for (const g of given) if (!guard.some(x => x.path === g.path)) guard.push(g);
  return guard; // shared by reference: reconciliation can enlarge it before another push
}

function read(home, agent) { try { return JSON.parse(readFileSync(viewsFile(home, agent), 'utf8')); } catch { return {}; } }

// views: [{slug, path}] (path from the repository folder) of repo, as the agent now sees them. Never fails the command: the cache is a safety net.
// The file's hash is part of the view: `updated` has a resolution of one second, so two changes in one second differ only in content.
// item 053: content is the hash without the fields a reflow rewrites (priority, updated, updated_by): a rank-only change
// by another agent's planning move is no change of the item for this agent's next write
const RANK_ONLY = ['priority', 'updated', 'updated_by'];
const contentOf = doc => { const fm = { ...doc.fm }; for (const k of RANK_ONLY) delete fm[k]; return createHash('sha256').update(JSON.stringify([Object.keys(fm).sort().map(k => [k, fm[k]]), doc.body])).digest('hex'); };
const fileView = (folder, path) => { const text = readFileSync(join(folder, path), 'utf8'); const doc = parse(text); return { fm: doc.fm, sha: createHash('sha256').update(text).digest('hex'), content: contentOf(doc) }; };

export function record(folder, repo, agent, views) {
  const home = homeOf(folder);
  try {
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: home, encoding: 'utf8' }).stdout.trim();
    const all = read(home, agent);
    for (const v of views) { // a view may name another repository folder (a cross-repository move leaves the item there)
      const key = `${v.repo ?? repo}/${v.slug}`;
      if (v.before !== undefined && all[`${v.repo ?? repo}/${v.beforeSlug ?? v.slug}`]?.sha !== v.before) continue;
      const { fm, sha, content } = fileView(v.folder ?? folder, v.path);
      all[key] = { updated: fm.updated ?? null, updated_by: fm.updated_by ?? null, sha, content, commit, path: v.path, folder: v.folder ?? folder };
    }
    const file = viewsFile(home, agent);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 1), { mode: 0o600 });
    renameSync(tmp, file);
  } catch { /* unwritable .git or an unreadable item: the next write is simply unchecked */ }
}

// Only successful publication refreshes incidental views, and only with proof
// that their pre-write bytes were the bytes this agent had already read.
export function recordWrites(folder, repo, agent, views, pairs = []) {
  const incidental = [...(operation.getStore()?.incidental.values() ?? [])].filter(v => v.agent === agent);
  const published = remapViews(folder, views, pairs);
  if (incidental.length || views.length) record(folder, repo, agent, [...remapViews(folder, incidental, pairs), ...published]);
  return published;
}

// Creation's slug/path adjustment also applies to moves, updates and incidental
// reflows. Numbers belong to one folder; follow successive publication retries.
function remapViews(folder, views, pairs) {
  return views.map(view => {
    let v = { ...view };
    for (const [old, next] of pairs.filter(p => p.folder === undefined || p.folder === resolve(v.folder ?? folder))) {
      if (Number(v.slug.match(/^\d+/)?.[0]) !== old) continue;
      const slug = String(next).padStart(3, '0') + v.slug.replace(/^\d+/, '');
      v = { ...v, slug, path: v.path.replace(/[^/\\]+$/, `${slug}.md`),
        ...(v.before !== undefined ? { beforeSlug: v.beforeSlug ?? v.slug } : {}) };
    }
    return v;
  });
}

// A command showed the item (a mirror row) to `agent`.
export const view = (agent, folder, repo, row) => record(folder, repo, agent || actor(), [{ slug: row.slug, path: row.path }]);

// item 053: the refusal names every item of this folder the agent has read whose content changed since, in one command
export function staleError(slug, by, at, was, others = []) {
  const all = [slug, ...others.filter(o => o !== slug)];
  const also = all.length > 1 ? `; ${all.length - 1} other item(s) you read changed too (${all.slice(1).join(', ')})` : '';
  return new BacklogError('STALE_ITEM', `item ${slug} was changed by ${by || 'someone'} at ${at ?? 'an unknown time (it was moved or removed)'} after you last read it (${was})${also}; read ${all.length > 1 ? 'them' : 'it'} again (backlog query --phase ${all.join(',')} --agent <you>) and retry`, STALE_EXIT);
}
// The items of folder the agent has read whose content changed since (or that are gone), by slug.
export function staleViews(folder, repo, agent) {
  const out = [];
  for (const [key, v] of Object.entries(read(homeOf(folder), agent))) {
    if (!key.startsWith(`${repo}/`) || (v.folder && resolve(v.folder) !== resolve(folder))) continue;
    if (operation.getStore()?.guard.some(g => g.path === `${repo}/${v.path}`)) continue; // already checked in this command (and maybe written by it)
    try { const { sha, content } = fileView(folder, v.path); if (sha !== v.sha && !(v.content && v.content === content)) out.push(key.slice(repo.length + 1)); } catch { /* gone: a write to it fails on its own */ }
  }
  return out;
}

// path: the item file as it is now (after the leading pull).
export function check(folder, repo, agent, slug, path) {
  const seen = read(homeOf(folder), agent)[`${repo}/${slug}`];
  const { fm, sha, content } = fileView(folder, path);
  if (seen && seen.sha !== sha && !(seen.content && seen.content === content)) throw staleError(slug, fm.updated_by, fm.updated, `${seen.updated}${seen.updated_by ? ` by ${seen.updated_by}` : ''}`, staleViews(folder, repo, agent));
  const guard = operation.getStore()?.guard;
  if (guard && !guard.some(g => g.path === `${repo}/${path}`)) {
    // A retry may first encounter this item after rebasing. Protect the upstream
    // version just read, rather than treating that already-merged change as a race.
    const base = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], { cwd: homeOf(folder), encoding: 'utf8' }).stdout.trim();
    guard.push({ path: `${repo}/${path}`, slug, base, was: `${fm.updated}${fm.updated_by ? ` by ${fm.updated_by}` : ''}` });
  }
  return seen?.sha;
}

// The mandatory gate for the whole ranking write set, before any file changes.
// Primary items were checked before their explicit write; new files have no
// upstream version to protect. All other writes enter the publication guard.
export function guardReflow(folder, items) {
  const repo = `${basename(dirname(folder))}/${basename(folder)}`;
  const agent = actor(); const ctx = operation.getStore();
  const stale = []; // item 053: every item of the write set the agent must read again, in one refusal
  for (const i of items) {
    const path = `${repo}/${i.path}`;
    if (ctx?.created.has(join(folder, i.path)) || ctx?.guard.some(g => g.path === path)) continue;
    const slug = i.fm.phase || basename(i.path, '.md');
    let before;
    try { before = check(folder, repo, agent, slug, i.path); } catch (e) { if (e.code !== 'STALE_ITEM') throw e; stale.push({ slug, e }); continue; }
    if (before && ctx) ctx.incidental.set(path, { folder, repo, slug, path: i.path, agent, before });
  }
  if (stale.length) throw stale[0].e; // its message names every item of the folder the agent read that changed since
}
