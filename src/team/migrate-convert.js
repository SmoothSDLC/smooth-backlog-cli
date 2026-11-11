// The conversion of one markdown item to the JSON item (design chapter 02 section 5, chapter 06 sections 4 and 5). Pure: it reads a text and returns the document and
// the text of its file; it touches no disk, no store and no team file. The caller (the plan of a folder) lists every item that throws.
import { BacklogError } from '../errors.js';
import { eventText, hasFrontMatter, parseMarkdownItem, parseMarkdownRaw, splitBom } from '../shared/item-file.js';
import { readDoc, writeDoc } from '../shared/item-json.js';
import { MAX_SEQ, numberOf } from '../shared/numbers.js';
import { asList } from '../shared/text.js';

// Header keys the migration drops (the order is the index now).
const DROPPED = ['priority', 'work_class', 'review_classes'];
// The two spellings of one key as [loaded name, stored name]: the reader loads the stored one under the earlier name and ignores the earlier one when both exist.
const SPELLINGS = [['name', 'title'], ['updated', 'last_updated'], ['updated_by', 'last_updated_by'], ['claimed_at', 'owned_since']];
const ENVELOPE = ['seq', 'phase', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by'];
const MAPPED = new Set([...ENVELOPE, ...DROPPED, 'events', 'depends_on', 'claimed_by', 'claimed_at', 'owner']);

const fail = (reason, field) => Object.assign(new BacklogError('HEADER_UNREADABLE', `the header cannot be read (${reason})`, 2), field ? { field } : {});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const empty = v => v === undefined || v === null || v === '';
const look = (slugs, s) => (slugs instanceof Map ? slugs.get(s) : slugs && Object.hasOwn(slugs, s) ? slugs[s] : undefined);

// A history line "<at> <step> <note>" split at its first two spaces: the note is the rest, unchanged (branch, commit and text together).
function entryOf(line) {
  const i = line.indexOf(' ');
  const at = i < 0 ? line : line.slice(0, i), rest = i < 0 ? '' : line.slice(i + 1), j = rest.indexOf(' ');
  return { at, by: '', session: '', step: j < 0 ? rest : rest.slice(0, j), changes: {}, note: j < 0 ? '' : rest.slice(j + 1) };
}
// the line is what the entry gives back, or that plus a tail of spaces: the separator with no note after it is no content
const tailless = (l, back) => l.startsWith(back) && /^ *$/.test(l.slice(back.length));

// The first top-level key the header block writes twice (the reader keeps the last value, which would lose the first).
function duplicateKey(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(splitBom(text)[1].replace(/\r\n?/g, '\n'));
  const seen = new Set();
  for (const line of (m?.[1] ?? '').split('\n')) {
    const k = /^([^\s:#][^:]*):(?:[ \t]|$)/.exec(line)?.[1].trim();
    if (k === undefined) continue;
    if (seen.has(k)) return k;
    seen.add(k);
  }
  return null;
}

// convertItem(text, { folderRepo, slugs, order, fileName }) -> { slug, seq, doc, json, item, fm, body, warnings }
//   folderRepo: the repository of the folder (an item without a repository takes it); slugs: Map (or object) slug -> number of every item of the folder, live and archived;
//   order: the field order of the item's team definition, for writeDoc; fileName: the item's file name (with or without its extension), which seq and phase must match.
//   doc is the document of chapter 02 (later parts change it and write it again); item is readDoc(json); fm and body are the markdown header in the loaded names and the
//   body as read (the order of a folder without an index is read from fm.priority before it is dropped). warnings lists the depends_on entries that name no item.
export function convertItem(text, { folderRepo = '', slugs, order = [], fileName } = {}) {
  if (!hasFrontMatter(text)) throw fail('there is no front-matter block');
  let loaded, raw;
  try { loaded = parseMarkdownItem(text); raw = parseMarkdownRaw(text).fm; } catch (e) { throw fail(String(e.message).replace(/^front matter /, ''), e.field); }
  const { fm, body } = loaded;
  const dup = duplicateKey(text);
  if (dup !== null) throw fail(`${dup} is written twice`, dup);
  for (const [a, b] of SPELLINGS) if (a in raw && b in raw && !same(raw[a], raw[b])) throw fail(`${a} and ${b} hold different values`, a);
  if ('slug' in fm) throw fail('slug is a key of the file, not of the header', 'slug');
  const str = (k, v, dflt) => { if (v === undefined || v === null) return dflt; if (typeof v !== 'string') throw fail(`${k} is not text`, k); return v; };

  const seq = fm.seq;
  if (!Number.isSafeInteger(seq)) throw fail('seq is missing or not a whole number', 'seq');
  if (seq < 1 || seq > MAX_SEQ) throw fail(`seq ${seq} is outside the numbers the CLI can use (1 to ${MAX_SEQ})`, 'seq');
  if (empty(fm.name)) throw fail('name is missing', 'name');
  const name = str('name', fm.name);
  const base = fileName === undefined ? undefined : String(fileName).replace(/\.(md|json)$/, '');
  if (base !== undefined) {
    const n = numberOf(`${base}.md`);
    if (n !== null && n !== seq) throw fail(`seq ${seq} differs from the file name's number ${n}`, 'seq');
    if (fm.phase !== undefined && fm.phase !== base) throw fail(`phase ${fm.phase} differs from the file name`, 'phase');
  }
  const slug = fm.phase ?? base;
  if (typeof slug !== 'string' || slug === '') throw fail('phase is missing or not text', 'phase');
  const team = str('team', fm.team, '');
  const doc = {
    seq, slug, name, ...(team ? { team } : {}),
    repository: str('repository', fm.repository, folderRepo), branch: str('branch', fm.branch, ''), created: str('created', fm.created, null),
    updated: str('updated', fm.updated, ''), updated_by: str('updated_by', fm.updated_by, ''), fields: {}, body, history: [],
  };

  // the fields: every other key, unchanged
  for (const [k, v] of Object.entries(fm)) if (!MAPPED.has(k)) doc.fields[k] = v;
  if ('completed_at' in doc.fields && !('completed' in doc.fields)) { doc.fields.completed = doc.fields.completed_at; delete doc.fields.completed_at; }

  // the holder: claimed_by and claimed_at fill owner and owned_since only when those are empty; two different names are a failure, nothing is dropped
  const { claimed_by: by, claimed_at: since, owner } = fm;
  if (!empty(owner) && !empty(by) && owner !== by) throw fail('owner and claimed_by both hold a name', 'owner');
  if (owner !== undefined || by !== undefined) doc.fields.owner = !empty(owner) ? owner : !empty(by) ? by : (owner !== undefined ? owner : by); // a null or empty holder stays as written
  if (since !== undefined) doc.fields.owned_since = since;

  // depends_on: numbers stay numbers, a slug of the folder is that item's number, owner/name#seq and any other entry stay text (the other entries are listed)
  const warnings = [];
  if ('depends_on' in fm) {
    doc.fields.depends_on = asList(fm.depends_on).map(e => {
      if (/^\d+$/.test(e) && Number.isSafeInteger(Number(e))) return Number(e);
      if (look(slugs, e) !== undefined) return look(slugs, e);
      if (!/^[^/\s#]+\/[^/\s#]+#\d+$/.test(e)) warnings.push(`depends_on ${e} names no item of the folder`);
      return e;
    });
  }

  // the history: one entry per line
  if (fm.events !== undefined && fm.events !== null) {
    if (!Array.isArray(fm.events)) throw fail('events is not a list', 'events');
    if (fm.events.some(l => typeof l !== 'string')) throw fail('events holds an entry that is not text', 'events');
    doc.history = fm.events.map(entryOf);
  }

  let json, item;
  try { json = writeDoc(doc, { order }); item = readDoc(json); } catch (e) { throw fail(String(e.message).replace(/^item file:? /, ''), e.field); }

  checkKept(fm, body, item, slugs);
  return { slug, seq, doc, json, item, fm, body, warnings };
}

// The check: the JSON item (item, read back from the text) holds every key and value of the markdown header (fm) and no key the header did not give; a null value is an
// absent one and takes its default. The first difference is the failure "<key> would change".
export function checkKept(fm, body, item, slugs) {
  const lost = k => { throw fail(`${k} would change`, k); };
  const explained = new Set([...Object.keys(fm).filter(k => !MAPPED.has(k)), ...(fm.owner !== undefined || fm.claimed_by !== undefined ? ['owner'] : []),
    ...('claimed_at' in fm ? ['owned_since'] : []), ...('depends_on' in fm ? ['depends_on'] : []), ...('completed_at' in fm && !('completed' in fm) ? ['completed'] : [])]);
  for (const k of Object.keys(item.fields)) if (!explained.has(k)) lost(k);
  for (const [k, v] of Object.entries(fm)) {
    if (DROPPED.includes(k)) continue;
    if (k === 'phase') { if (item.slug !== v) lost(k); } else if (k === 'team') { if ((item.team ?? '') !== (v ?? '')) lost(k); } else if (k === 'events') {
      if (item.history.length !== (v ?? []).length || !(v ?? []).every((l, i) => tailless(l, eventText(item.history[i])))) lost(k);
    } else if (ENVELOPE.includes(k)) { if (v !== null && item[k] !== v) lost(k); } else if (k === 'depends_on') {
      const back = item.fields.depends_on, was = asList(v);
      if (!Array.isArray(back) || back.length !== was.length || was.some((e, i) => !(typeof back[i] === 'number' ? Number(e) === back[i] || look(slugs, e) === back[i] : back[i] === e))) lost(k);
    } else if (k === 'claimed_by' || k === 'owner') { if ((!empty(v) || (empty(fm.owner) && empty(fm.claimed_by) && v === (fm.owner !== undefined ? fm.owner : fm.claimed_by))) && item.fields.owner !== v) lost(k); } else if (k === 'claimed_at') { if (!same(item.fields.owned_since, v)) lost(k); } else if (k === 'completed_at' && !('completed' in fm)) {
      if (!same(item.fields.completed, v)) lost(k);
    } else if (!same(item.fields[k], v)) lost(k);
  }
  if (item.body !== body) lost('body');
}
