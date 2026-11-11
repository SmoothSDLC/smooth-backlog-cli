// Dependencies between items (depends_on): an entry names an item of this backlog by number or slug, or of another repository's backlog
// in the same clone as owner/name#seq. Every item may have them; no team is involved.
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import * as index from './index.js';
import { itemSlug, readItemFile } from './item-file.js';
import { itemSelector } from './safety.js';
import { isArchived, isFinished, lifted } from './status.js';
import { load } from './store.js';
import { asList } from './text.js';

// phase_by_ident over the rows, for the edges an item stores: by number or by slug. A number two rows hold is resolved to neither: it answers a row that
// names the ambiguity (status 'ambiguous', so the edge counts as undone and blocks), never a throw (only a number typed on the command line is refused).
export function byIdent(rows, ident) {
  const sel = itemSelector(ident);
  if (!sel) return null;
  const hits = rows.filter(r => (sel.number !== undefined ? Number(r.seq) === sel.number : r.slug === sel.slug));
  if (sel.number !== undefined && hits.length > 1) return { seq: null, slug: `number ${sel.number} (names two items: ${hits[0].slug} and ${hits[1].slug})`, status: 'ambiguous', path: '' };
  return hits[0] ?? null;
}

// item_fm: the front matter of the row's file, {} when it is gone (or outside the folder); a parse or I/O error propagates. The rows give
// identity and status; the files only the metadata the rows do not hold.
export function itemFm(folder, row) {
  let file;
  try { file = realpathSync(resolve(folder, String(row.path))); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } // only a missing file is {}
  return file.startsWith(realpathSync(folder) + sep) ? lifted(readItemFile(file)).fm : {};
}

// All rows of the folder's items (index.rows), in file order.
export const folderRows = folder => index.rows(folder).rows;

// owner/name#seq names an item of another repository's backlog in the same backlog repository clone.
export const SAFE = /^(?!\.{1,2}$)[\w.:-]+$/; // an owner or repository name is one path segment, never. or..
export const FOREIGN = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
export const isForeign = id => FOREIGN.test(String(id ?? '').trim());
// {repository, seq, slug, status, fm} of a foreign reference; null when that repository has no backlog folder or no such
// item; undefined when id is no foreign reference. folder: this repository's folder of the backlog repository.
export function foreignItem(folder, id, typed = false) { // typed: given on the command line; a stored edge that names a number two items hold answers status 'ambiguous'
  const m = FOREIGN.exec(String(id ?? '').trim());
  if (!m) return undefined;
  if (!SAFE.test(m[1]) || !SAFE.test(m[2])) return null;
  const other = join(dirname(dirname(resolve(folder))), m[1], m[2]);
  if (!existsSync(other)) return null;
  let items;
  try { items = load(other); } catch (e) { if (e.markdown) return null; throw e; } // a folder of markdown items reads as no such item
  const hits = items.filter(i => Number(i.fm.seq) === Number(m[3]));
  const named = hits.map(i => ({ ...i, slug: i.fm.phase || itemSlug(i.path) }));
  if (!typed && named.length > 1) return { repository: `${m[1]}/${m[2]}`, seq: null, slug: `number ${m[3]} (names two items: ${named[0].slug} and ${named[1].slug})`, status: 'ambiguous', fm: {} };
  const it = index.pick(named, Number(m[3]));
  return it ? { repository: `${m[1]}/${m[2]}`, seq: Number(m[3]), slug: it.fm.phase || itemSlug(it.path), status: isArchived(it) ? 'archived' : it.fm.status ?? 'pending', fm: it.fm, path: it.path } : null;
}
// foreignItem as a user command sees it: an item of another repository that belongs to a team reads as no item, unless the view sees it.
export function visibleForeign(folder, id, typed = false) {
  const f = foreignItem(folder, id, typed);
  return f && !index.sees(f) ? null : f;
}
// does following deps (of the item seq of repo `repoId`, in folder) through other repositories' items lead back
// to it? Returns the reference that closes the cycle, or null. Local entries are read in the folder they are written in.
// cache: repository -> its items, shared by the calls of one check (a publication checks every changed item)
const loaded = dir => { try { return load(dir); } catch (e) { if (e.markdown) return []; throw e; } }; // a folder of markdown items holds no item that can be read
export function foreignCycle(folder, repoId, seq, deps, cache = new Map()) {
  const home = dirname(dirname(resolve(folder)));
  const self = `${repoId}#${Number(seq)}`;
  const items = repo => { if (!cache.has(repo)) { const dir = join(home, ...repo.split('/')); cache.set(repo, existsSync(dir) ? loaded(dir) : []); } return cache.get(repo); };
  const nodeOf = (repo, d) => {
    const s = String(d ?? '').trim();
    const m = FOREIGN.exec(s);
    if (m) return `${m[1]}/${m[2]}#${Number(m[3])}`;
    const it = /^\d+$/.test(s) ? items(repo).find(i => Number(i.fm.seq) === Number(s)) : items(repo).find(i => (i.fm.phase || itemSlug(i.path)) === s);
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
// [{id as written, item: the row or null, fm}] for each depends_on entry that is not done or archived.
// rows = the rows of folder (the default), or those of another repository's backlog read by the caller. A foreign
// entry is read from that repository's folder; its item carries the repository. `edge(producerFm, dependentId)` is the caller's
// extra condition on a done producer (a hand-off its team has not accepted): it answers the reason text, or null; the entry then
// carries it in handoff and counts as unfinished. The dependent is named as the producer's repository names it: its seq for a
// same-repository producer, <dependent repository>#<seq> for a producer of another repository.
export function undoneDependencies(folder, fm, rows = folderRows(folder), edge = () => null) {
  return asList(fm.depends_on).map(id => {
    const f = visibleForeign(folder, id);
    if (f !== undefined) {
      const dependentId = f && f.repository === (fm.repository || undefined) ? String(fm.seq) : `${fm.repository}#${fm.seq}`;
      const handoff = f && finishedByStep(f) ? edge(f.fm, dependentId) : null;
      return { id, item: f && { slug: f.slug, seq: f.seq, status: f.status, repository: f.repository }, fm: f ? f.fm : {}, foreign: true, ...(handoff ? { handoff } : {}) };
    }
    const item = byIdent(rows, id);
    const producer = item ? itemFm(folder, item) : {};
    const handoff = item && finishedByStep(item) ? edge({ ...producer, status: item.status }, String(fm.seq)) : null;
    return { id, item, fm: producer, ...(handoff ? { handoff } : {}) };
  }).filter(d => !d.item || !isFinished(d.item.status) || d.handoff);
}

// A finished producer owes a hand-off record unless it is archived: an item archived by path (also forced) owes none.
const finishedByStep = x => isFinished(x.status) && !isArchived(x);
