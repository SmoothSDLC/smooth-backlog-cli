// The item adapter of the team commands: the text of an item file to the item the rules read (and back), the items of a folder read raw, one item of
// another repository's folder, and the context a step is evaluated in. Nothing here writes, pulls or decides; the evaluator item is
// { seq, slug, name, team, repository, branch, created, updated, updated_by, archived, body, fields, history } and its fields are the file's, verbatim:
// no earlier word is translated, no holder mapped, no key dropped.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { FOREIGN, SAFE } from '../shared/dependencies.js';
import * as index from '../shared/index.js';
import { readDoc, writeDoc } from '../shared/item-json.js';
import { MAX_SEQ, numberOf } from '../shared/numbers.js';
import { assertFolder, assertNoSymlinks, isItemName, itemFileName, itemFiles, markdownError, unreadableItem } from '../shared/store.js';
import { get } from './rules/expression.js';

// path: the item file relative to its repository folder; an item under archive/ is archived (no word says so). An item without a team has the empty team.
export function fromFile(text, { path = '' } = {}) {
  const d = readDoc(text);
  return {
    seq: d.seq, slug: d.slug, name: d.name, team: d.team ?? '', repository: d.repository, branch: d.branch,
    created: d.created, updated: d.updated, updated_by: d.updated_by, archived: path.startsWith('archive/'), body: d.body, fields: d.fields, history: d.history,
  };
}

// The text of an item file, byte-stable: fields in the order of the team's item definition (entry.item, required), the undeclared ones after, alphabetically.
// A time stamp the item lacks is refused by the codec: whoever writes an item sets updated and updated_by.
export function toFile(item, entry) {
  if (entry === null || typeof entry !== 'object' || entry.item === null || typeof entry.item !== 'object') throw new TypeError('toFile needs the team entry: the order of the fields is the definition\'s');
  return writeDoc({ ...item, created: item.created ?? null, updated_by: item.updated_by ?? '', history: item.history ?? [] }, { order: Object.keys(entry.item) });
}

// The item as the index code reads it ({ path, fm }): what an entry of index.json copies, nothing else.
export const viewOf = (item, path) => ({
  path: path ?? `${item.archived ? 'archive/' : ''}phases/${itemFileName(item.slug)}`,
  fm: { phase: item.slug, seq: item.seq, name: item.name, ...(item.fields.status !== undefined ? { status: item.fields.status } : {}), branch: item.branch, ...(item.team ? { team: item.team } : {}) },
});

// Every item file of a folder, live and archived, read raw: [{ path, item }] with the path relative to the folder. The stops are the store's (a link, a
// number above the bound, a folder of markdown items, an unreadable item: exit 2 naming the item). tolerant: nothing stops the read; { bad } lists the
// unreadable files, links and too-big numbers ({ path, kind: 'unreadable' | 'link' | 'number', error, reason }) and markdown is true for a folder of markdown items. seqs: every number a file name carries, and the live items' own.
export function readItems(folder, { tolerant = false } = {}) {
  const dir = resolve(folder);
  const { files, skipped, markdown } = itemFiles(dir, { tolerant });
  const out = { items: [], bad: skipped.map(x => ({ path: x.path, kind: x.kind, error: x.error, reason: x.error.message })), seqs: new Set(), markdown };
  if (markdown) { if (!tolerant) throw markdownError(dir); return out; }
  for (const path of files) {
    const n = numberOf(basename(path));
    if (n !== null) out.seqs.add(n);
    let item;
    try { item = fromFile(readFileSync(join(dir, path), 'utf8'), { path }); } catch (e) {
      const error = unreadableItem(path, e);
      if (!tolerant) throw error;
      out.bad.push({ path, kind: 'unreadable', error, reason: e.message });
      continue;
    }
    if (path.startsWith('phases/')) out.seqs.add(item.seq);
    out.items.push({ path, item });
  }
  return out;
}

// The one item `owner/name#seq` names in another repository's folder of the same backlog, read raw, with its repository set to that folder; null for
// anything that cannot be told (no folder, no such item, two files with one number, a markdown file, a link, an unreadable file). It reads no other file
// of that folder and never stops because of what the folder holds.
export function foreignRaw(folder, id) {
  const m = FOREIGN.exec(String(id ?? '').trim());
  if (!m || !SAFE.test(m[1]) || !SAFE.test(m[2])) return null;
  const other = join(dirname(dirname(resolve(folder))), m[1], m[2]);
  try {
    assertFolder(other);
    if (!existsSync(other)) return null;
    const hits = [];
    const walk = (rel, deep) => {
      assertNoSymlinks(other, join(other, rel));
      let entries; try { entries = readdirSync(join(other, rel), { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
      for (const e of entries) {
        if (e.isDirectory() && deep) walk(`${rel}/${e.name}`, deep);
        else if (e.isFile() && isItemName(e.name) && numberOf(e.name) === Number(m[3])) hits.push(`${rel}/${e.name}`);
      }
    };
    walk('phases', false);
    walk('archive', true);
    if (hits.length !== 1) return null;
    const item = fromFile(readFileSync(join(other, hits[0]), 'utf8'), { path: hits[0] });
    return item.seq === Number(m[3]) && item.seq <= MAX_SEQ ? { ...item, repository: `${m[1]}/${m[2]}` } : null; // a file that calls itself another number is not the item asked for
  } catch { return null; }
}

// The foreign references (owner/name#seq) the step can reach: in the item and items fields of the team's items, and in the arguments.
function references(entry, team, items, args) {
  const refs = new Set();
  const scan = v => { if (Array.isArray(v)) v.forEach(scan); else if (typeof v === 'string') v.split(',').map(s => s.trim()).filter(s => FOREIGN.test(s)).forEach(s => refs.add(s)); };
  for (const [name, def] of Object.entries(entry.item ?? {})) if (['item', 'items'].includes(def?.type)) for (const i of items) if (i.team === team) scan(i.fields[name]);
  Object.values(args ?? {}).forEach(scan);
  return [...refs];
}

// The team's queue as item numbers: the open items of the team in the session's repository (not archived, status not in the definition's final list), in the
// order of index.json branch by branch (the one branch named, else every branch in the index's key order); an open item the index does not list comes after
// the listed ones of its branch, by number. Nothing is written.
function queueOrder(folder, entry, team, items, view, session, branch) {
  const final = entry.item?.status?.final ?? [];
  const mine = items.filter(i => i.team === team && i.repository === session.repository && !i.archived && !final.includes(get(i, 'status', entry))).sort((a, b) => a.seq - b.seq);
  const idx = index.current(folder, view);
  const keys = branch !== undefined ? [branch] : [...new Set([...Object.keys(idx.branches), ...mine.map(i => i.branch)])];
  const order = []; const placed = new Set();
  for (const key of keys) {
    for (const e of idx.branches[key] ?? []) {
      // shortcut: one find per index entry is quadratic (9000 items take under a second); index mine by slug and branch when a team holds tens of thousands
      const i = mine.find(x => x.slug === e.slug && x.branch === key);
      if (i && !placed.has(i.seq)) { placed.add(i.seq); order.push(i.seq); }
    }
    for (const i of mine) if (i.branch === key && !placed.has(i.seq)) { placed.add(i.seq); order.push(i.seq); }
  }
  return order;
}

// The context a step is evaluated in, the queue order of the team and the folder's own items: { ctx, order, view, own }. The items are the folder's (live and archived) and the foreign
// ones the step can reach, each read once; branch limits the queue to one branch (absent: every branch).
export function contextOf({ folder, entry, team, caller, args, session, now, branch }) {
  const own = readItems(folder).items;
  const items = own.map(r => r.item);
  const foreign = references(entry, team, items, args).filter(id => !id.startsWith(`${session.repository}#`)).map(id => foreignRaw(folder, id)).filter(Boolean);
  const view = own.map(r => viewOf(r.item, r.path));
  const order = queueOrder(folder, entry, team, items, view, session, branch);
  return { ctx: { entry, team, caller, items: [...items, ...foreign], args, session, now, order }, order, view, own: items };
}
