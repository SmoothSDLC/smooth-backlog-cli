// An item that cannot be read: `backlog update <item> --<key> <value>` sets the wrongly typed key of a valid JSON file again,
// `backlog update <item> --restore` brings back the item's previous version (the only way out for a file that is not JSON).
// Every other command of the folder refuses (store.load).
import { join } from 'node:path';
import { say, refuse } from './archive.js';
import { dumpItem, parseItem, readItemText } from './item-file.js';
import { git, itemSelector } from './safety.js';
import * as store from './store.js';
import { normalise } from './status.js';

const INTEGERS = ['seq', 'size_score'];
const ENVELOPE_KEYS = ['seq', 'name', 'repository', 'branch', 'created', 'updated', 'updated_by', 'team'];

// text of a valid JSON item with the key set to value (an envelope key at the top, any other key under "fields"); the text is
// written in the form of the codec when that can read it, else as plain JSON (the caller checks the folder again).
export function setField(text, key, value) {
  const doc = JSON.parse(text);
  if (ENVELOPE_KEYS.includes(key)) doc[key] = value;
  else { if (doc.fields === null || typeof doc.fields !== 'object' || Array.isArray(doc.fields)) doc.fields = {}; doc.fields[key] = value; }
  try { const { fm, body } = parseItem(JSON.stringify(doc)); return dumpItem(fm, body); } catch { return `${JSON.stringify(doc, null, 2)}\n`; }
}

// bad: the refusal store.unreadable gave. Resolves the exit code of a finished command (restore), or undefined once the fields are set again
// (the update then goes on as for any item); throws bad when the command names neither another way out nor the item.
export async function repairUnreadable(a, folder, bad) {
  const { slug, path } = bad.unreadable;
  const sel = a.phase !== undefined ? itemSelector(a.phase) : null;
  const named = sel && (sel.slug === slug || (sel.number !== undefined && sel.number === Number(/^\d+/.exec(slug)?.[0])));
  const fields = bad.unreadable.key === undefined ? [] : store.REPAIRABLE.filter(k => a[k] !== undefined); // a file that is not JSON offers only --restore
  if (!named || a['dry-run'] || !(a.restore || fields.length)) throw bad;
  const abs = join(folder, path);
  if (a.restore) {
    if (fields.length) return refuse('--restore takes no other option');
    const log = (await git(['log', '-2', '--format=%H', '--', path], folder)).stdout.split('\n').filter(Boolean);
    const dirty = (await git(['status', '--porcelain', '--', path], folder)).stdout.trim() !== ''; // a local edit: the version to bring back is the last committed one
    const from = log[dirty ? 0 : 1];
    if (!from) return refuse('the item has no earlier version');
    const old = (await git(['show', `${from}:./${path}`], folder)).stdout;
    try { parseItem(old); } catch { return refuse(`the earlier version of ${slug} cannot be read either`); }
    store.writeText(abs, old, folder);
    store.addEvent(folder, path, { event: 'restored', note: `restored ${slug} to its version of ${from.slice(0, 7)}` });
    store.reflow(folder);
    a.guard = []; a.claims = []; a.wrote = { slug, path };
    say(`✅ ${slug} restored to its previous version`);
    return 0;
  }
  let text = readItemText(abs);
  if (bad.unreadable.key === 'seq') a.seqRepaired = true;
  for (const key of fields) {
    const value = INTEGERS.includes(key) ? (/^\s*[+-]?\d+\s*$/.test(a[key]) ? Number(a[key]) : null) : a[key];
    if (value === null) return refuse(`--${key} ${a[key]}: a whole number is needed`);
    if (key === 'status' && !normalise(value)) return refuse('--status needs a word');
    text = setField(text, key, key === 'status' ? normalise(value) : value);
  }
  store.writeText(abs, text, folder);
  const still = store.unreadable(folder);
  if (still) throw still; // another field cannot be read: nothing is changed, name them all in one command
  return undefined;
}
