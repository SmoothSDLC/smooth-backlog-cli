// Applies the result of a step to the folder: the items it changed (each with one history entry), the moved or deleted file, the number of a new item, the index.
// It evaluates nothing, reads no team file, takes no lock, pulls and publishes nothing: the command does, and a throw here puts every path it wrote back.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BacklogError } from '../errors.js';
import * as index from '../shared/index.js';
import { FINAL } from '../shared/item-definition.js';
import { historyEntry } from '../shared/item-json.js';
import { record } from '../shared/numbers.js';
import { assertNoSymlinks, itemFileName, note, undoOnThrow, writeText } from '../shared/store.js';
import { readItems, toFile, viewOf } from './item.js';

// Open, as the index asks it of the view of an item: a team that has an entry in the file finishes an item by that entry's final words, anything else by the built-in ones.
export const openOf = file => view => {
  const entry = view.fm.team ? file?.[view.fm.team] : undefined;
  const final = entry ? entry.item?.status?.final ?? [] : FINAL;
  return !final.includes(Object.hasOwn(view.fm, 'status') ? view.fm.status : 'pending');
};

const section = (body, n) => `${body.replace(/\s+$/, '')}${body.trim() ? '\n\n' : ''}## ${n.heading} (${n.by}, ${n.at})\n\n${n.text}\n`;
const baseOf = path => path.slice(path.lastIndexOf('/') + 1);

// The pure part: from the step's result to the texts to write, the paths, the index and what to print. view: the views of the folder's items (contextOf's);
// seq: the item the step ran on; number: the number taken from the counter when the item is new; file: the whole team file (other teams' final words).
export function build({ folder, file, team, entry, result, view, seq = number, number, caller, session, now, step }) {
  const live = n => view.find(v => v.fm.seq === n && v.path.startsWith('phases/'));
  const openFn = openOf({ ...file, [team]: entry });
  const scope = v => v.fm.team === team;
  const gone = result.delete ? seq : null;
  const written = [...result.items].filter(([n]) => n !== gone && (n === seq || Object.keys(result.changes.get(n) ?? {}).length)).map(([, it]) => it);
  const skipped = [];
  const items = written.map(it => {
    const own = it.seq === seq;
    const isNew = number !== undefined && it.seq === number;
    const from = isNew ? null : live(it.seq)?.path ?? null;
    const path = from ?? `phases/${itemFileName(it.slug)}`;
    const to = it.archived ? `archive/${path}` : path;
    const notes = own ? result.notes.map(n => ({ ...n, at: now })) : [];
    const body = notes.reduce(section, it.body ?? '');
    const text = notes.map(n => n.text).join('\n');
    return { it, from, path: to, notes, body, text };
  });
  const views = [...view.filter(v => !items.some(x => x.from === v.path) && !(gone !== null && v.fm.seq === gone && v.path.startsWith('phases/'))),
    ...items.map(x => viewOf(x.it, x.path))];
  const mover = items.find(x => x.it.seq === seq && !x.it.archived);
  const options = { open: openFn, inScope: scope };
  const idx0 = index.current(folder, views);
  let move;
  if (result.place && mover) {
    const slug = mover.it.slug;
    const others = (index.reconcile(idx0, views, options).idx.branches[mover.it.branch] ?? []).filter(e => e.slug !== slug && views.some(v => v.fm.phase === e.slug && scope(v) && openFn(v)));
    const p = result.place;
    const key = typeof p === 'object' ? Object.keys(p)[0] : null;
    const n = key ? Number(p[key]) : null;
    const at = key ? others.findIndex(e => views.find(v => v.fm.phase === e.slug)?.fm.seq === n) : -1;
    if (p === 'first') move = { slug, target: 0 };
    else if (p === 'last') move = { slug, target: others.length };
    else if (at >= 0) move = { slug, target: key === 'before' ? at : at + 1 };
    else skipped.push(`place skipped: item ${p[key]} is not an open item of team ${team} on branch ${mover.it.branch}`);
  }
  const { idx } = index.reconcile(idx0, views, { ...options, move });
  const out = items.map(x => {
    const mine = x.it.seq === seq;
    const entryOf = historyEntry({ at: now, by: caller, session: session?.id ?? '', step, changes: result.changes.get(x.it.seq) ?? {}, note: [x.text, ...(mine ? skipped : [])].filter(Boolean).join('\n') });
    const doc = { ...x.it, created: x.it.created ?? now, updated: now, updated_by: caller, body: x.body, history: [...(x.it.history ?? []), entryOf] };
    return { seq: x.it.seq, slug: x.it.slug, from: x.from, path: x.path, doc, text: toFile(doc, entry), changes: entryOf.changes, note: entryOf.note };
  });
  return { rule: result.rule, items: out, deleted: gone === null ? null : live(gone)?.path ?? null, idx, say: result.say, place: result.place ? { asked: result.place, skipped: skipped[0] ?? null } : null, number: number ?? null };
}

// Writes what build says, journalled, then the number and the index. Resolves to build's answer.
export async function apply(args) {
  const { folder } = args;
  return undoOnThrow(folder, () => {
    // a folder with items and no index keeps the order its items carried, read raw (never through the user reader, which refuses a field named events)
    if (!index.exists(folder)) index.seed(folder, readItems(folder).items.map(({ path, item }) => { const v = viewOf(item, path); return item.team ? v : { ...v, fm: { ...v.fm, ...(item.fields.priority !== undefined ? { priority: item.fields.priority } : {}) } }; }));
    const b = build(args);
    const touch = rel => { const p = join(folder, rel); assertNoSymlinks(folder, p); return p; };
    for (const x of b.items) {
      const dst = touch(x.path);
      mkdirSync(dirname(dst), { recursive: true });
      if (x.from !== null && x.from !== x.path) {
        const src = touch(x.from);
        if (existsSync(dst)) throw new BacklogError('STORAGE_ERROR', `an archived item named ${baseOf(x.path)} already exists; archiving it again would replace that item`, 2);
        note(src); note(dst);
        renameSync(src, dst);
      }
      writeText(dst, x.text, folder);
    }
    if (b.deleted !== null) { const p = touch(b.deleted); note(p); rmSync(p); }
    if (b.number !== null) record(folder, b.number);
    index.write(folder, b.idx);
    return b;
  });
}
