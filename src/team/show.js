// The whole item `backlog team pop` prints after a step: as text, or as the item document. Every text passes through redact, and the document is redacted before it is serialized.
import { eventText } from '../shared/item-file.js';
import { readDoc } from '../shared/item-json.js';
import { redact } from '../shared/safety.js';
import { toFile } from './item.js';

const clean = v => (typeof v === 'string' ? redact(v) : Array.isArray(v) ? v.map(clean) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v);
const value = v => (typeof v === 'string' ? (v === '' ? '""' : v) : JSON.stringify(v ?? null));

// item: the evaluator item after the step; entry: the team's entry (the order of the fields is its item definition's).
export function showItem(item, entry, { json = false } = {}) {
  const doc = readDoc(toFile(item, entry));
  if (json) return clean(doc);
  const order = Object.keys(entry.item);
  const declared = order.filter(f => Object.hasOwn(doc.fields, f));
  const rest = Object.keys(doc.fields).filter(f => !order.includes(f)).sort();
  return [
    `[${doc.seq}] ${doc.slug}  ${doc.name}`,
    `team ${doc.team ?? ''}  repository ${doc.repository}  branch ${doc.branch}`,
    ...[...declared, ...rest].map(f => `${f}: ${value(doc.fields[f])}`),
    ...(doc.body.trim() ? ['', doc.body.trimEnd()] : []),
    '',
    'history:',
    ...doc.history.map(e => `  ${eventText(e)}  by ${e.by}  changes ${JSON.stringify(e.changes)}`),
  ].map(redact).join('\n');
}
