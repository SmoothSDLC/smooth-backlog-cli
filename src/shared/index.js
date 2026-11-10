// The order of the backlog: one committed text file per repository folder, <folder>/index.json. The array order of each branch IS the
// priority (P0 first); every live (non-archived) item of the branch is listed once as { seq, slug, name, status }, one entry per line so
// git merges changes to different lines. The item files hold everything else: name and status here are copies that every read checks
// against the item (the file is the truth for the item, the index for the order). Open (not finished) items come first.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BacklogError, operation } from '../errors.js';
import { hasFrontMatter, itemSlug, readItemText } from './item-file.js';
import { itemSelector } from './safety.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { isOpen as workflowOpen } from './status.js';

export const file = folder => join(folder, 'index.json');
export const exists = folder => existsSync(file(folder));

const slugOf = i => i.fm.phase || itemSlug(i.path);
const statusOf = i => (Object.hasOwn(i.fm, 'status') ? i.fm.status : 'pending');
const branchOf = i => String(i.fm.branch || '');
const live = items => items.filter(i => i.path.startsWith('phases/'));
const isOpen = e => workflowOpen(e.status);
const entryOf = i => ({ seq: i.fm.seq ?? 0, slug: slugOf(i), name: i.fm.name ?? '', status: statusOf(i) });
const bySeq = (a, b) => Number(a.fm.seq ?? 0) - Number(b.fm.seq ?? 0);

// ---- the file

export function read(folder) {
  let raw;
  try { raw = readFileSync(file(folder), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return { branches: {} }; throw e; }
  let idx;
  try { idx = JSON.parse(raw); } catch (e) { throw new BacklogError('STORAGE_ERROR', `the backlog index cannot be read (${e.message}); restore it from the repository history`, 1); }
  operation(idx?.branches && typeof idx.branches === 'object' && !Array.isArray(idx.branches) && Object.values(idx.branches).every(l => Array.isArray(l) && l.every(e => e && typeof e.slug === 'string')),
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
  const sorted = live(items).sort((a, b) => workflowOpen(statusOf(b)) - workflowOpen(statusOf(a)) || priority(a) - priority(b) || bySeq(a, b));
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

// The entries of `local` that kept their relative order from `base` (the longest such run; of equal runs the one that leaves the earliest
// entries out, so a single item moved to the front is the one that moved). shortcut: quadratic in the entries of one branch; fine for a
// few thousand, a conflict on the index is rare.
function kept(local, base) {
  const at = new Map(base.map((e, n) => [e.slug, n]));
  const run = local.flatMap(e => (at.has(e.slug) ? [{ slug: e.slug, n: at.get(e.slug) }] : []));
  const len = run.map(() => 1); const next = run.map(() => -1);
  for (let a = run.length - 1; a >= 0; a--) for (let b = a + 1; b < run.length; b++) if (run[b].n > run[a].n && len[b] + 1 > len[a]) { len[a] = len[b] + 1; next[a] = b; }
  let start = -1;
  run.forEach((_, a) => { if (start < 0 || len[a] >= len[start]) start = a; });
  const out = new Set();
  for (let a = start; a >= 0; a = next[a]) out.add(run[a].slug);
  return out;
}

// Three-way merge of the orders of two clones that changed the index from one base (git cannot merge lines that moved): upstream's order
// stands, and what the local side did to it is done again: the entries it removed leave, the entries it added or moved are placed after
// the entry that precedes them locally (at the front when none does; at the end when they are last), the entries whose name or status it
// changed take its values.
// renames: Map(old slug -> new slug) of local items renumbered on the way.
export function mergeOrders(base, up, local, renames = new Map()) {
  const out = {};
  for (const key of new Set([...Object.keys(base.branches), ...Object.keys(up.branches), ...Object.keys(local.branches)])) {
    const b = base.branches[key] ?? []; const mine = (local.branches[key] ?? []).map(e => (renames.has(e.slug) ? { ...e, slug: renames.get(e.slug) } : e));
    const baseOf = new Map(b.map(e => [e.slug, e]));
    let list = [...(up.branches[key] ?? [])];
    for (const e of b) if (!mine.some(m => m.slug === e.slug) && !renames.has(e.slug)) list = list.filter(x => x.slug !== e.slug);
    const stay = kept(mine, b);
    mine.forEach((e, n) => {
      if (stay.has(e.slug)) {
        const was = baseOf.get(e.slug);
        if (was && JSON.stringify(was) !== JSON.stringify(e)) list = list.map(x => (x.slug === e.slug ? { ...e } : x));
        return;
      }
      list = list.filter(x => x.slug !== e.slug);
      const before = mine.slice(0, n).reverse().find(p => list.some(x => x.slug === p.slug));
      list.splice(n === mine.length - 1 ? list.length : before ? list.findIndex(x => x.slug === before.slug) + 1 : 0, 0, { ...e });
    });
    if (list.length) out[key] = list;
  }
  return { branches: out };
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

// The rank of a live item in its branch (-1 when not listed).
export const rank = (folder, branch, slug) => (read(folder).branches[branch] ?? []).findIndex(e => e.slug === slug);

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
  const list = items.filter(i => i.path.startsWith('phases/') || hasFrontMatter(readItemText(join(folder, i.path)))).map((i, n) => {
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
export const open = list => list.filter(r => workflowOpen(r.status)).sort((a, b) => a.priority - b.priority || a.seq - b.seq);

// By number (a live item before an archived one) or by slug; undefined when there is none.
export function find(list, ident) {
  const sel = itemSelector(ident);
  if (!sel) return undefined;
  const hits = list.filter(r => (sel.number !== undefined ? Number(r.seq) === sel.number : r.slug === sel.slug));
  return sel.number !== undefined ? hits.find(r => r.status !== 'archived') ?? hits[0] : hits[0];
}
