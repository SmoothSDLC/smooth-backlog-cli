import { redact } from '../shared/safety.js';

// JSON is printed as serialized: each string value is redacted before, never the serialized text (the redaction of text spans JSON punctuation).
export const redactDeep = v => (typeof v === 'string' ? redact(v) : Array.isArray(v) ? v.map(redactDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)])) : v);
export const say = (text, json) => process.stdout.write(`${json ? text : redact(text)}\n`);
