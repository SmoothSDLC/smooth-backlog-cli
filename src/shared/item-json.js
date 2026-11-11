// The JSON item codec (design chapter 02, sections 2.1 to 2.5 and 4). readDoc and writeDoc are the one validation and the one layout of the file: the
// document { seq, slug, ..., fields, body, history }. fromItemJson and toItemJson are thin users of them, between the JSON text of an item file and the
// in-memory item the user commands hold: a header object (name, updated, updated_by, claimed_by, ...; the slug under 'phase'; the history
// under 'events' as entries { at, by, session, step, changes, note }) and a body text. Nothing maps a retired or an old key: the codec writes what
// the header object holds (the migration, chapter 06, maps). Switched on nowhere yet.
import { redact } from './safety.js';
import { BUILT_IN_ORDER } from './item-definition.js';

// An unreadable item: the message and error.field name the key, as an unreadable front-matter header does.
const bad = (key, what) => Object.assign(new Error(redact(`item file: ${key} ${what}`)), { field: key });

// The header keys that are not fields: the envelope (with the slug under 'phase') and the history.
const ENVELOPE = ['seq', 'phase', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by'];
const NOT_FIELDS = new Set([...ENVELOPE, 'events']);
// The keys a 'fields' object may not hold: the envelope keys of the file. A field may be called phase or events: only the flattened header of
// fromItemJson reads those two as the slug and the history, so it refuses events itself.
const FILE_KEYS = new Set(['seq', 'slug', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by']);
// The fields of the built-in definition of items without a team, in its order.
const BUILT_IN = BUILT_IN_ORDER;
const HISTORY_KEYS = ['at', 'by', 'session', 'step', 'changes', 'note'];

// A whole file that cannot be read: no key is named, as for an unreadable front-matter header.
const unreadable = what => new Error(redact(`item file ${what}`));
const json = v => JSON.stringify(v === undefined ? null : v);

// One history entry as the file holds it: the one builder of an entry, for the reader, the writer and every command that records a change.
// An entry written before the entries carried by, session and changes lacks them: they read as empty.
export function historyEntry(e, where = 'history entry') {
  if (e === null || typeof e !== 'object' || Array.isArray(e)) throw bad(where, 'is not an object');
  for (const k of ['at', 'step', 'note']) if (typeof e[k] !== 'string') throw bad(`${where}.${k}`, 'is missing or not text');
  for (const k of ['by', 'session']) if (e[k] !== undefined && typeof e[k] !== 'string') throw bad(`${where}.${k}`, 'is not text');
  if (e.changes !== undefined && (e.changes === null || typeof e.changes !== 'object' || Array.isArray(e.changes))) throw bad(`${where}.changes`, 'is not an object');
  return { at: e.at, by: e.by ?? '', session: e.session ?? '', step: e.step, changes: e.changes ?? {}, note: e.note };
}

// The document of an item file: { seq, slug, name, team?, repository, branch, created, updated, updated_by, fields, body, history }. The fields are
// verbatim and the history is the list of entries; nothing is mapped. fromItemJson and toItemJson are the users that flatten it into a header.
export function readDoc(text) { // an editor may add a byte-order mark: it is not content
  let doc;
  try { doc = JSON.parse(String(text ?? '').replace(/^﻿/, '')); } catch (e) { throw unreadable(`is not valid JSON (${e.message})`); }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw unreadable('is not a JSON object');
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (k, nullable = false) => {
    const v = doc[k];
    if (typeof v !== 'string' && !(nullable && v === null)) throw bad(k, `is missing or not ${nullable ? 'text or null' : 'text'}`);
    return v;
  };
  const seq = doc.seq;
  if (!Number.isSafeInteger(seq)) throw bad('seq', 'is missing or not a whole number');
  // Only created may be null; only updated_by may be empty.
  const slug = str('slug'), name = str('name'), repository = str('repository'), branch = str('branch'), created = str('created', true), updated = str('updated');
  const updatedBy = str('updated_by');
  if ('team' in doc && typeof doc.team !== 'string') throw bad('team', 'is not text');
  if (!isObj(doc.fields)) throw bad('fields', 'is missing or not an object');
  if (typeof doc.body !== 'string') throw bad('body', 'is missing or not text');
  if (!Array.isArray(doc.history)) throw bad('history', 'is missing or not a list');
  for (const k of Object.keys(doc.fields)) {
    if (FILE_KEYS.has(k)) throw bad(`fields.${k}`, 'names a key of the file');
    if (k === '__proto__') throw bad('fields.__proto__', 'is not a key an item may hold');
  }
  const history = doc.history.map((e, i) => historyEntry(e, `history[${i}]`));
  return { seq, slug, name, ...('team' in doc ? { team: doc.team } : {}), repository, branch, created, updated, updated_by: updatedBy, fields: { ...doc.fields }, body: doc.body, history };
}

// The text of a document: the keys of chapter 02 section 2.4 in order, the fields as `order` names them and then the others alphabetically, one history
// entry per line. It refuses what readDoc refuses, so the writer never emits a file the reader will not read. An empty or absent team is no key.
export function writeDoc(doc, { order = [] } = {}) {
  const d = doc ?? {};
  if (!Number.isSafeInteger(d.seq)) throw bad('seq', 'is missing or not a whole number');
  for (const [k, v] of [['slug', d.slug], ['name', d.name], ['repository', d.repository], ['branch', d.branch], ['updated', d.updated]]) if (typeof v !== 'string') throw bad(k, 'is missing or not text');
  if (d.created != null && typeof d.created !== 'string') throw bad('created', 'is not text or null');
  if (d.updated_by != null && typeof d.updated_by !== 'string') throw bad('updated_by', 'is not text');
  if (d.team != null && typeof d.team !== 'string') throw bad('team', 'is not text');
  if (d.fields === null || typeof d.fields !== 'object' || Array.isArray(d.fields)) throw bad('fields', 'is missing or not an object');
  if (Object.hasOwn(d.fields, '__proto__')) throw bad('__proto__', 'is not a key an item may hold');
  for (const k of Object.keys(d.fields)) if (FILE_KEYS.has(k)) throw bad(`fields.${k}`, 'names a key of the file');
  if (d.history !== undefined && !Array.isArray(d.history)) throw bad('history', 'is not a list');
  const rank = k => (order.includes(k) ? order.indexOf(k) : order.length);
  const fields = Object.keys(d.fields).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const lines = [
    ['seq', d.seq], ['slug', d.slug], ['name', d.name],
    ...(d.team ? [['team', d.team]] : []),
    ['repository', d.repository], ['branch', d.branch], ['created', d.created], ['updated', d.updated], ['updated_by', d.updated_by ?? ''],
  ].map(([k, v]) => `  "${k}": ${json(v)}`);
  lines.push(`  "fields": ${fields.length ? `{\n${fields.map(k => `    ${json(k)}: ${json(d.fields[k])}`).join(',\n')}\n  }` : '{}'}`);
  lines.push(`  "body": ${json(String(d.body ?? ''))}`);
  const history = (d.history ?? []).map((l, i) => { const e = historyEntry(l, `history[${i}]`); return `    { ${HISTORY_KEYS.map(k => `"${k}": ${json(e[k])}`).join(', ')} }`; });
  lines.push(`  "history": ${history.length ? `[\n${history.join(',\n')}\n  ]` : '[]'}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

// The header object the user commands hold (the slug under 'phase', the history under 'events') written as a document, in the order of the built-in definition.
export function toItemJson(fm, body) {
  const h = fm ?? {};
  if (h.events !== undefined && !Array.isArray(h.events)) throw bad('events', 'is not a list');
  if ('slug' in h) throw bad('slug', 'is a key of the file, not of the header (the slug is under phase)');
  if (Object.hasOwn(h, '__proto__')) throw bad('__proto__', 'is not a key an item may hold');
  const fields = Object.fromEntries(Object.keys(h).filter(k => !NOT_FIELDS.has(k)).map(k => [k, h[k]]));
  const history = (h.events ?? []).map((l, i) => historyEntry(l, `events[${i}]`));
  return writeDoc({ seq: h.seq, slug: h.phase, name: h.name, team: h.team, repository: h.repository, branch: h.branch, created: h.created, updated: h.updated, updated_by: h.updated_by, fields, body, history }, { order: BUILT_IN });
}

export function fromItemJson(text) {
  const doc = readDoc(text);
  if (Object.hasOwn(doc.fields, 'events')) throw bad('fields.events', 'names a key of the file'); // the header holds the history under events
  // A null envelope value (an empty updated_by) is an absent key, so that reading what was written gives back the header object that was given.
  // The envelope keys come first (in the order of the header of earlier items), then the fields, then the history.
  const fm = {};
  const put = (k, v) => { if (v !== undefined && v !== null && !(v === '' && k === 'updated_by')) fm[k] = v; };
  put('phase', doc.slug); put('seq', doc.seq); put('name', doc.name); put('team', doc.team); put('repository', doc.repository); put('branch', doc.branch);
  put('created', doc.created); put('updated', doc.updated); put('updated_by', doc.updated_by);
  for (const [k, v] of Object.entries(doc.fields)) if (!Object.hasOwn(fm, k)) fm[k] = v; // a field called phase cannot replace the slug
  if (doc.history.length) fm.events = doc.history;
  return { fm, body: doc.body };
}
