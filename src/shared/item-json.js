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
// The built-in definition of items without a team, in the order of chapter 02 section 4.
const BUILT_IN = ['status', 'objective', 'summary', 'location', 'commit', 'severity', 'claimed_by', 'claimed_at', 'owner', 'depends_on', 'parent', 'estimate_min', 'complexity', 'layer', 'chunk', 'size_score', 'completed'];
const HISTORY_KEYS = ['at', 'by', 'session', 'step', 'changes', 'note'];

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
  try { doc = JSON.parse(String(text ?? '')); } catch (e) { throw bad('file', `is not valid JSON (${e.message})`); }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw bad('file', 'is not a JSON object');
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (k, nullable = true) => {
    const v = doc[k];
    if (typeof v !== 'string' && !(nullable && v === null)) throw bad(k, `is missing or not ${nullable ? 'text or null' : 'text'}`);
    return v;
  };
  const seq = doc.seq;
  if (!(seq === null || Number.isSafeInteger(seq))) throw bad('seq', 'is missing or not a whole number or null');
  const slug = str('slug'), name = str('name'), repository = str('repository'), branch = str('branch'), created = str('created'), updated = str('updated');
  const updatedBy = str('updated_by');
  if ('team' in doc && typeof doc.team !== 'string') throw bad('team', 'is not text');
  if (!isObj(doc.fields)) throw bad('fields', 'is missing or not an object');
  if (typeof doc.body !== 'string') throw bad('body', 'is missing or not text');
  if (!Array.isArray(doc.history)) throw bad('history', 'is missing or not a list');
  for (const k of Object.keys(doc.fields)) if (NOT_FIELDS.has(k)) throw bad(`fields.${k}`, 'names a key of the envelope');
  const events = doc.history.map((e, i) => {
    if (!isObj(e)) throw bad(`history[${i}]`, 'is not an object');
    for (const k of HISTORY_KEYS) if (typeof e[k] !== (k === 'changes' ? 'object' : 'string') || e[k] === null) throw bad(`history[${i}].${k}`, `is missing or not ${k === 'changes' ? 'an object' : 'text'}`);
    return lineOf(e);
  });
  // A null envelope value (an empty updated_by) is an absent key, so that reading what was written gives back the header object that was given.
  const fm = {};
  const put = (k, v) => { if (v !== undefined && v !== null && !(v === '' && k === 'updated_by')) fm[k] = v; };
  put('seq', seq); put('phase', slug); put('name', name); put('team', doc.team); put('repository', repository); put('branch', branch);
  put('created', created); put('updated', updated); put('updated_by', updatedBy);
  Object.assign(fm, doc.fields);
  if (events.length) fm.events = events;
  return { fm, body: doc.body };
}
