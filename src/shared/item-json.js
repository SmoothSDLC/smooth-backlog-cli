// The JSON item codec (design chapter 02, sections 2.1 to 2.5 and 4). Two pure functions between the JSON text of an item file and the
// in-memory item the code holds today: a header object (name, updated, updated_by, claimed_by, ...; the slug under 'phase'; the history
// under 'events' as lines 'time event branch commit note') and a body text. Nothing maps a retired or an old key: the codec writes what
// the header object holds (the migration, chapter 06, maps). Switched on nowhere yet.
import { redact } from './safety.js';

// An unreadable item: the message and error.field name the key, as an unreadable front-matter header does.
const bad = (key, what) => Object.assign(new Error(redact(`item file: ${key} ${what}`)), { field: key });

// The header keys that are not fields: the envelope (with the slug under 'phase') and the history.
const ENVELOPE = ['seq', 'phase', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by'];
const NOT_FIELDS = new Set([...ENVELOPE, 'events']);
// The keys a 'fields' object may not hold: every key of the file proper (the header's 'phase' is the slug, so it is not among them).
const FILE_KEYS = new Set(['seq', 'slug', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by', 'events']);
// The built-in definition of items without a team, in the order of chapter 02 section 4.
const BUILT_IN = ['status', 'objective', 'summary', 'location', 'commit', 'severity', 'claimed_by', 'claimed_at', 'owner', 'depends_on', 'parent', 'estimate_min', 'complexity', 'layer', 'chunk', 'size_score', 'completed'];
const HISTORY_KEYS = ['at', 'by', 'session', 'step', 'changes', 'note'];

// A whole file that cannot be read: no key is named, as for an unreadable front-matter header.
const unreadable = what => new Error(redact(`item file ${what}`));
const json = v => JSON.stringify(v === undefined ? null : v);

// One event line 'time event branch commit note' as a history entry: the note is everything after the event, unchanged.
function entryOf(line) {
  if (typeof line !== 'string') throw bad('events', 'holds an entry that is not text');
  const i = line.indexOf(' ');
  const j = i < 0 ? -1 : line.indexOf(' ', i + 1);
  return { at: i < 0 ? line : line.slice(0, i), by: '', session: '', step: i < 0 ? '' : j < 0 ? line.slice(i + 1) : line.slice(i + 1, j), changes: {}, note: j < 0 ? '' : line.slice(j + 1) };
}
// The line back: at + ' ' + step + ' ' + note (a trailing empty part is not written).
const lineOf = e => { const p = [e.at, e.step, e.note]; while (p.length > 1 && p[p.length - 1] === '') p.pop(); return p.join(' '); };

export function toItemJson(fm, body) {
  const h = fm ?? {};
  if (h.events !== undefined && !Array.isArray(h.events)) throw bad('events', 'is not a list');
  // The writer never emits a file the reader refuses: the same required keys and types (seq, slug, name, repository, branch, updated: required).
  if ('slug' in h) throw bad('slug', 'is a key of the file, not of the header (the slug is under phase)');
  if (Object.hasOwn(h, '__proto__')) throw bad('__proto__', 'is not a key an item may hold');
  if (!Number.isSafeInteger(h.seq)) throw bad('seq', 'is missing or not a whole number');
  for (const [k, v] of [['slug', h.phase], ['name', h.name], ['repository', h.repository], ['branch', h.branch], ['updated', h.updated]]) if (typeof v !== 'string') throw bad(k, 'is missing or not text');
  if (h.created != null && typeof h.created !== 'string') throw bad('created', 'is not text or null');
  if (h.updated_by != null && typeof h.updated_by !== 'string') throw bad('updated_by', 'is not text');
  if (h.team != null && typeof h.team !== 'string') throw bad('team', 'is not text');
  const fields = Object.keys(h).filter(k => !NOT_FIELDS.has(k));
  fields.sort((a, b) => (BUILT_IN.includes(a) ? BUILT_IN.indexOf(a) : BUILT_IN.length) - (BUILT_IN.includes(b) ? BUILT_IN.indexOf(b) : BUILT_IN.length) || (a < b ? -1 : a > b ? 1 : 0));
  const lines = [
    ['seq', h.seq], ['slug', h.phase], ['name', h.name],
    ...(h.team ? [['team', h.team]] : []),
    ['repository', h.repository], ['branch', h.branch], ['created', h.created], ['updated', h.updated], ['updated_by', h.updated_by ?? ''],
  ].map(([k, v]) => `  "${k}": ${json(v)}`);
  lines.push(`  "fields": ${fields.length ? `{\n${fields.map(k => `    ${json(k)}: ${json(h[k])}`).join(',\n')}\n  }` : '{}'}`);
  lines.push(`  "body": ${json(String(body ?? ''))}`);
  const history = (h.events ?? []).map(l => { const e = entryOf(l); return `    { ${HISTORY_KEYS.map(k => `"${k}": ${json(e[k])}`).join(', ')} }`; });
  lines.push(`  "history": ${history.length ? `[\n${history.join(',\n')}\n  ]` : '[]'}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

export function fromItemJson(text) {
  let doc;
  try { doc = JSON.parse(String(text ?? '')); } catch (e) { throw unreadable(`is not valid JSON (${e.message})`); }
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
  const events = doc.history.map((e, i) => {
    if (!isObj(e)) throw bad(`history[${i}]`, 'is not an object');
    for (const k of HISTORY_KEYS) if ((k === 'changes' ? !isObj(e[k]) : typeof e[k] !== 'string')) throw bad(`history[${i}].${k}`, `is missing or not ${k === 'changes' ? 'an object' : 'text'}`);
    return lineOf(e);
  });
  // A null envelope value (an empty updated_by) is an absent key, so that reading what was written gives back the header object that was given.
  // The envelope keys come first (in the order of the header of earlier items), then the fields, then the history.
  const fm = {};
  const put = (k, v) => { if (v !== undefined && v !== null && !(v === '' && k === 'updated_by')) fm[k] = v; };
  put('phase', slug); put('seq', seq); put('name', name); put('team', doc.team); put('repository', repository); put('branch', branch);
  put('created', created); put('updated', updated); put('updated_by', updatedBy);
  for (const [k, v] of Object.entries(doc.fields)) if (!Object.hasOwn(fm, k)) fm[k] = v; // a field called phase cannot replace the slug
  if (events.length) fm.events = events;
  return { fm, body: doc.body };
}
