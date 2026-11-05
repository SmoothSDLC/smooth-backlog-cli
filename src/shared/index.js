// The order of the backlog: one committed text file per repository folder, <folder>/index.json. The array order of each branch IS the
// priority (P0 first); every live (non-archived) item of the branch is listed once as { seq, slug, name, status }, one entry per line so
// git merges changes to different lines. The item files hold everything else: name and status here are copies that every read checks
// against the item (the file is the truth for the item, the index for the order). Open (pending, in_progress) items come first.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { BacklogError, operation } from '../errors.js';
import { hasFrontMatter } from './frontmatter.js';
import { itemSelector } from './safety.js';
import * as store from './store.js';
import * as sync from './sync.js';

export const ACTIONABLE = ['pending', 'in_progress'];
export const file = folder => join(folder, 'index.json');
export const exists = folder => existsSync(file(folder));

const slugOf = i => i.fm.phase || basename(i.path, '.md');
const statusOf = i => (Object.hasOwn(i.fm, 'status') ? i.fm.status : 'pending');
const branchOf = i => String(i.fm.branch || '');
const live = items => items.filter(i => i.path.startsWith('phases/'));
const isOpen = e => ACTIONABLE.includes(e.status);
const entryOf = i => ({ seq: i.fm.seq ?? 0, slug: slugOf(i), name: i.fm.name ?? '', status: statusOf(i) });
const bySeq = (a, b) => Number(a.fm.seq ?? 0) - Number(b.fm.seq ?? 0);

// ---- the file

export function read(folder) {
  let raw;
  try { raw = readFileSync(file(folder), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return { branches: {} }; throw e; }
  let idx;
  try { idx = JSON.parse(raw); } catch (e) { throw new BacklogError('STORAGE_ERROR', `the backlog index cannot be read (${e.message}); restore it from the repository history`, 1); }
  operation(idx?.branches && typeof idx.branches === 'object' && Object.values(idx.branches).every(l => Array.isArray(l) && l.every(e => e && typeof e.slug === 'string')),
    'the backlog index cannot be read (no list of items per branch); restore it from the repository history');
  return idx;
}

// One entry per line, branches sorted: the same order gives the same bytes.
export function text(idx) {
  const keys = Object.keys(idx.branches).filter(k => idx.branches[k].length).sort();
  const lines = keys.map(k => `    ${JSON.stringify(k)}: [\n${idx.branches[k].map(e => `      ${JSON.stringify({ seq: e.seq, slug: e.slug, name: e.name, status: e.status })}`).join(',\n')}\n    ]`);
  return `{\n  "branches": {\n${lines.join(',\n')}\n  }\n}\n`.replace('"branches": {\n\n  }', '"branches": {}');
}

// Writes the index when its text changed (through the journal, so a failed command puts it back). Resolves to true when it wrote.
export function write(folder, idx) {
  const next = text(idx);
  if (exists(folder) && readFileSync(file(folder), 'utf8') === next) return false;
  store.writeText(file(folder), next, folder);
  return true;
}

// ---- building and repairing

// A folder without an index: the order its items carry in their priority field (open items first), then their number.
export function fromItems(items) {
  const priority = i => { const n = Number(i.fm.priority ?? 50); return Number.isFinite(n) ? n : 50; };
  const by = {};
  const sorted = live(items).sort((a, b) => ACTIONABLE.includes(statusOf(b)) - ACTIONABLE.includes(statusOf(a)) || priority(a) - priority(b) || bySeq(a, b));
  for (const i of sorted) (by[branchOf(i)] ??= []).push(entryOf(i));
  return { branches: by };
}

export const current = (folder, items) => (exists(folder) ? read(folder) : fromItems(items));

// A folder with items and no index gets its index before the first item is written: a write drops the rank an item kept, which the
// order is built from.
export function seed(folder) {
  const items = exists(folder) ? [] : store.load(folder);
  if (live(items).length) write(folder, fromItems(items));
}

// The permutation of the entries `inScope` says a session may order: the others keep their places.
function within(list, inScope, arrange) {
  const at = list.flatMap((e, k) => (inScope(e) ? [k] : []));
  const mine = arrange(at.map(k => list[k]));
  const out = [...list];
  at.forEach((k, n) => { out[k] = mine[n]; });
  return out;
}

// The index made right against the item files; pure. Items without an entry are appended (by number), entries without an item (or on
// another branch than their item's) leave, name and status are taken from the file, and the open entries come first. Then, in this order:
// renames (old slug -> new slug, a renumbering), move { slug, target } (the item to that rank among the open ones, clamped),
// lead [slugs] (these first). exclude [slugs] leave the index. inScope(item) limits which entries a move or a lead may shift.
// Resolves { idx, order } where order = [[slug, rank]] of the open entries of the branches named by `branches` (default: all).
export function reconcile(idx, items, { move, lead, exclude = [], renames = new Map(), inScope = () => true, branches: only } = {}) {
  const bySlug = new Map(live(items).filter(i => !exclude.includes(slugOf(i))).map(i => [slugOf(i), i]));
  const out = {}; const placed = new Set();
  for (const [key, list] of Object.entries(idx.branches)) {
    for (const e of list) {
      const slug = renames.get(e.slug) ?? e.slug; const item = bySlug.get(slug);
      if (!item || placed.has(slug) || branchOf(item) !== key) continue;
      placed.add(slug); (out[key] ??= []).push(entryOf(item));
    }
  }
  for (const i of [...bySlug.values()].sort(bySeq)) if (!placed.has(slugOf(i))) (out[branchOf(i)] ??= []).push(entryOf(i));
  const scoped = e => inScope(bySlug.get(e.slug));
  const arrangeBranch = (key, arrange) => {
    const act = out[key].filter(isOpen);
    out[key] = [...within(act, scoped, arrange), ...out[key].filter(e => !isOpen(e))];
  };
  for (const key of Object.keys(out)) out[key] = [...out[key].filter(isOpen), ...out[key].filter(e => !isOpen(e))];
  const mover = move && move.slug != null && move.target != null ? bySlug.get(move.slug) : null;
  if (mover && out[branchOf(mover)]) {
    arrangeBranch(branchOf(mover), mine => {
      const moving = mine.filter(e => e.slug === move.slug);
      const rest = mine.filter(e => e.slug !== move.slug);
      const t = Math.max(0, Math.min(Math.trunc(Number(move.target)), rest.length));
      return [...rest.slice(0, t), ...moving, ...rest.slice(t)];
    });
  }
  if (lead?.length) for (const key of Object.keys(out)) arrangeBranch(key, mine => [...lead.flatMap(s => mine.filter(e => e.slug === s)), ...mine.filter(e => !lead.includes(e.slug))]);
  const order = (only ?? Object.keys(out)).flatMap(k => (out[k] ?? []).filter(isOpen).map((e, r) => [e.slug, r]));
  return { idx: { branches: out }, order };
}

// After a renumbering ([old, new] pairs of this folder, as sync.commit reports them) the entry of the renumbered item, whose file is gone under
// its old name, follows the file: Map(old slug -> new slug), so the item keeps its place in the order.
export function renamesFor(folder, pairs) {
  const here = pairs.filter(p => p.folder === undefined || p.folder === resolve(folder));
  const renames = new Map();
  if (!here.length) return renames;
  const items = live(store.load(folder));
  const entries = Object.values(read(folder).branches).flat();
  for (const [old, next] of here) {
    const to = items.find(i => Number(i.fm.seq) === next);
    const from = entries.find(e => Number(e.seq) === old && !items.some(i => slugOf(i) === e.slug));
    if (to && from) renames.set(from.slug, slugOf(to));
  }
  return renames;
}

// A read that finds a folder without an index builds it from the items and publishes it (the subject "index"); one that cannot publish it
// (an origin that cannot be reached) goes on with the order in memory.
export async function ensure(home, folder) {
  const items = exists(folder) ? [] : store.load(folder);
  if (!live(items).length) return;
  write(folder, fromItems(items));
  try { await sync.commitSettled(home, folder, 'index'); } catch (e) { if (!(e instanceof BacklogError)) throw e; }
}

// ---- the folder-level operations (each reads the index, changes it, and writes it)

function edit(folder, change) {
  const idx = current(folder, store.load(folder));
  change(idx.branches);
  write(folder, idx);
}
export const rank = (folder, branch, slug) => (read(folder).branches[branch] ?? []).findIndex(e => e.slug === slug);
export const remove = (folder, branch, slug) => edit(folder, b => { if (b[branch]) b[branch] = b[branch].filter(e => e.slug !== slug); });
export const add = (folder, branch, entry, position = Infinity) => edit(folder, b => {
  const l = (b[branch] ??= []).filter(e => e.slug !== entry.slug);
  l.splice(Math.min(position, l.length), 0, entry);
  b[branch] = l;
});
export const place = (folder, branch, slug, position) => edit(folder, b => {
  const e = b[branch]?.find(x => x.slug === slug);
  if (!e) return;
  b[branch] = b[branch].filter(x => x !== e);
  b[branch].splice(Math.min(position, b[branch].length), 0, e);
});
export const stamp = (folder, branch, slug, fields) => edit(folder, b => { const e = b[branch]?.find(x => x.slug === slug); if (e) Object.assign(e, fields); });

// ---- the rows the views read

const INT = /^\s*[+-]?\d+\s*$/;
const num = v => (typeof v === 'string' && INT.test(v) ? Number(v) : v);
const txt = v => (typeof v === 'number' ? String(v) : v);
export const HANDOFF = Object.freeze({ id: 1, slug: 'BACKLOG', title: 'Backlog', objective: 'phase anchor (no document)', path: '', sha: '', status: 'active', source_context: '' });

// The items of a folder as rows (every item, archived ones too, in file order) with the priority of the live ones computed from the
// index (the position in the branch; null for an archived item). { handoff, rows, items }.
export function rows(folder, items = store.load(folder)) {
  const { idx } = reconcile(current(folder, items), items);
  const position = new Map(Object.values(idx.branches).flatMap(l => l.map((e, n) => [e.slug, n])));
  const at = store.now();
  const list = items.filter(i => i.path.startsWith('phases/') || hasFrontMatter(readFileSync(join(folder, i.path), 'utf8'))).map((i, n) => {
    const fm = i.fm; const v = (k, d) => (k in fm ? fm[k] : d);
    return {
      id: n + 1, handoff_id: 1, slug: slugOf(i), seq: num(v('seq', 0)), name: txt(v('name', '')), objective: txt(v('objective', '')), summary: txt(v('summary', '')),
      status: v('status', 'pending'), severity: fm.severity || 'normal', priority: i.path.startsWith('phases/') ? position.get(slugOf(i)) ?? null : null, path: i.path, sha: i.sha256,
      branch: fm.branch || '', commit_sha: fm.commit || '', location: fm.location || '', repository: fm.repository || '', size_score: num(v('size_score', 0)),
      created_at: v('created', at), updated_at: v('updated', at), completed_at: v('completed', null),
    };
  });
  return { handoff: { ...HANDOFF, created_at: at, updated_at: at }, rows: list, items };
}

// The open rows in the order of the queue: priority, then number.
export const open = list => list.filter(r => ACTIONABLE.includes(r.status)).sort((a, b) => a.priority - b.priority || a.seq - b.seq);

// By number (a live item before an archived one) or by slug; undefined when there is none.
export function find(list, ident) {
  const sel = itemSelector(ident);
  if (!sel) return undefined;
  const hits = list.filter(r => (sel.number !== undefined ? Number(r.seq) === sel.number : r.slug === sel.slug));
  return sel.number !== undefined ? hits.find(r => r.status !== 'archived') ?? hits[0] : hits[0];
}
