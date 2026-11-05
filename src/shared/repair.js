// An item that cannot be read: `backlog update <item> --<field> <value>` sets the broken field again in the raw text of the item. Every
// other command of the folder refuses (store.load).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { say, refuse } from './archive.js';
import { dump, parse, splitBom } from './frontmatter.js';
import { itemSelector } from './safety.js';
import * as store from './store.js';

const INTEGERS = ['seq', 'size_score'];

// text with the top-level `key:` line of its front matter (and the lines that continue it) replaced by `key: value`, or added.
export function setField(text, key, value) {
  const [bom, source] = splitBom(text);
  const m = /^---(\r\n?|\n)([\s\S]*?)((?:\r\n?|\n)---(?:\r\n?|\n|$))/.exec(source);
  if (!m) throw new Error('the item has no front matter block');
  const [, nl, header, close] = m;
  const lines = header.split(/\r\n?|\n/);
  const line = dump({ [key]: value }, '').split('\n')[1];
  const at = lines.findIndex(l => l.startsWith(`${key}:`));
  if (at < 0) lines.push(line);
  else {
    let end = at + 1;
    while (end < lines.length && !/^[A-Za-z0-9][A-Za-z0-9_-]*:/.test(lines[end])) end += 1; // the value runs to the next key
    lines.splice(at, end - at, line);
  }
  return bom + source.slice(0, 3) + nl + lines.join(nl) + close + source.slice(m[0].length);
}

// bad: the refusal store.unreadable gave. Resolves undefined once the fields are set again (the update then goes on as for any item);
// throws bad when the command names no field to set or another item.
export async function repairUnreadable(a, folder, bad) {
  const { slug, path } = bad.unreadable;
  const sel = a.phase !== undefined ? itemSelector(a.phase) : null;
  const named = sel && (sel.slug === slug || (sel.number !== undefined && sel.number === Number(/^\d+/.exec(slug)?.[0])));
  const fields = store.REPAIRABLE.filter(k => a[k] !== undefined);
  if (!named || a['dry-run'] || !fields.length) throw bad;
  const abs = join(folder, path);
  let text = readFileSync(abs, 'utf8');
  for (const key of fields) {
    const value = INTEGERS.includes(key) ? (/^\s*[+-]?\d+\s*$/.test(a[key]) ? Number(a[key]) : null) : a[key];
    if (value === null) return refuse(`--${key} ${a[key]}: a whole number is needed`);
    if (key === 'status' && !['pending', 'in_progress', 'done'].includes(value)) return refuse(`--status '${value}': use pending, in_progress or done`);
    text = setField(text, key, value);
  }
  store.writeText(abs, text, folder);
  const still = store.unreadable(folder);
  if (still) throw still; // another field cannot be read: nothing is changed, name them all in one command
  return undefined;
}
