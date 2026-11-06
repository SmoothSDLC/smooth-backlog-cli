// Front-matter codec for the shared backlog repository mode.
// Cited source: the pinned oracle at commit ec5b254e (contract v3 lines) —
// (_FM_RE + parse_front_matter), 182-184 (write_doc).
// parse reads exactly the YAML subset PyYAML's safe_dump writes to item files:
// a top-level block mapping of plain / single-quoted / double-quoted scalars
// (including folded continuation lines), block lists, flow [] and [a, b],
// ints, null/~, true/false. Anything outside the subset is a clear error,
// never a guess. dump writes that subset back, keys in the given order.

import { redact } from './safety.js';

// Diagnostics echo parts of the source: strip user:token@ credentials from every message.
const err = (msg) => new Error(redact(msg));

const FM_SPLIT = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/; // port of _FM_RE
const KEY_LINE = /^([^\s:#][^:]*):(?:[ \t]+(.*))?$/; // top-level 'key:' or 'key: value'
// YAML separation is space and tab only; JS trim/\s also take NBSP and other Unicode spaces, which are scalar content.
const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const IDENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// False for a text that does not start with a front-matter block (store.load skips such files in phases/: they are not items).
// [bom, rest]: the leading byte-order mark every reader of a front-matter file ignores, and the text after it. Text-level edits keep the mark.
export const splitBom = text => (String(text).startsWith('\uFEFF') ? ['\uFEFF', String(text).slice(1)] : ['', String(text)]);
export const hasFrontMatter = text => FM_SPLIT.test(splitBom(text ?? '')[1].replace(/\r\n?/g, '\n'));

export function parse(text) {
  const source = splitBom(text ?? '')[1].replace(/\r\n?/g, '\n'); // a BOM is not content: it hid the front matter // python's text mode reads CRLF and lone CR as \n (beyond strict parity: safe direction)
  const m = FM_SPLIT.exec(source);
  if (!m) return { fm: {}, body: source };
  return { fm: parseFm(m[1]), body: m[2] };
}

function parseFm(block) {
  const trimmed = block.trim();
  if (trimmed === '' || trimmed === '{}') return {};
  const lines = block.split('\n');
  const fm = {};
  let i = 0;
  let field; // the key being read: an error inside its value names it (error.field); an error before the key is known names none
  try {
    while (i < lines.length) {
      field = undefined;
      const line = lines[i];
      if (trim(line) === '') { i += 1; continue; }
      const m = KEY_LINE.exec(line);
      if (!m) throw err(`front matter line ${i + 1} is not a 'key: value' pair: ${line}`);
      const key = trim(m[1]);
      if (!IDENT.test(key)) throw err(`front matter key ${JSON.stringify(key)} is not a plain identifier`);
      field = key;
      const inline = trim(m[2] ?? '');
      if (inline === '') {
        const next = lines[i + 1];
        if (next !== undefined && /^- /.test(next)) {
          const items = [];
          let j = i + 1;
          while (j < lines.length && /^- /.test(lines[j])) {
            const end = continuation(lines, j + 1); // PyYAML wraps long items over indented lines
            const chunk = [trim(lines[j].slice(2)), ...lines.slice(j + 1, end).map(trim)];
            items.push(decodeValue(`a list item of '${key}'`, chunk, true));
            j = end;
          }
          fm[key] = items;
          i = j;
        } else if (next !== undefined && /^[ \t]/.test(next)) {
          throw err(`front matter key '${key}' has a nested block, which the front matter subset does not support`);
        } else {
          fm[key] = null;
          i += 1;
        }
      } else {
        const j = continuation(lines, i + 1);
        const chunk = [inline, ...lines.slice(i + 1, j).map(trim)];
        fm[key] = decodeValue(`the value of '${key}'`, chunk, false);
        i = j;
      }
    }
  } catch (e) { if (field !== undefined) e.field = field; throw e; }
  return fm;
}

// The end of the indented lines (and blank lines followed by indented ones) that continue the value on lines[from-1].
function continuation(lines, from) {
  let j = from;
  for (;;) {
    const l = lines[j];
    if (l === undefined) return j;
    if (trim(l) === '') {
      let k = j;
      while (k < lines.length && trim(lines[k]) === '') k += 1;
      if (k < lines.length && /^[ \t]/.test(lines[k])) j += 1;
      else return j;
    } else if (/^[ \t]/.test(l)) {
      j += 1;
    } else {
      return j;
    }
  }
}

// YAML line folding of a flow scalar: one break is a space, n breaks are n-1 newlines.
const foldBreaks = (s) => s.replace(/\n+/g, (b) => (b.length === 1 ? ' ' : '\n'.repeat(b.length - 1)));

function decodeValue(label, chunk, inList) {
  const head = chunk[0];
  if (head.startsWith('"') || head.startsWith("'")) return decodeQuoted(chunk, head[0], label);
  if (head.startsWith('[') && !inList) {
    if (chunk.length !== 1 || !head.endsWith(']')) throw err(`front matter ${label} is a flow list that wraps over a line, which the front matter subset does not support`);
    const inner = trim(head.slice(1, -1));
    if (inner === '') return [];
    return splitFlow(inner).map((part) => decodeScalar(trim(part), `an item of ${label}`));
  }
  const text = foldBreaks(chunk.join('\n'));
  if (text === '') throw err(`front matter ${label} is empty`);
  return decodePlain(text);
}

// Split a flow list body at the commas outside quotes (escapes respected).
function splitFlow(inner) {
  const parts = [];
  let start = 0;
  let quote = '';
  let first = true; // a quote opens a string only as the first character of an item
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    const atStart = first;
    if (c !== ' ' && c !== '\t') first = c === ',';
    if (quote === '"') {
      if (c === '\\') i += 1;
      else if (c === '"') quote = '';
    } else if (quote === "'") {
      if (c === "'" && inner[i + 1] === "'") i += 1;
      else if (c === "'") quote = '';
    } else if (atStart && (c === '"' || c === "'")) quote = c;
    else if (c === ',') { parts.push(inner.slice(start, i)); start = i + 1; }
  }
  parts.push(inner.slice(start));
  return parts;
}

// YAML double-quoted escapes (PyYAML ESCAPE_REPLACEMENTS) plus \xNN, \uNNNN, \UNNNNNNNN.
const DQUOTE_ESCAPES = {
  '0': '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\x0b', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: ' ', P: ' ',
};
const HEX_ESCAPES = { x: 2, u: 4, U: 8 };

function decodeQuoted(chunk, quote, label) {
  const raw = chunk.join('\n');
  let close = -1;
  for (let i = 1; i < raw.length; i += 1) {
    if (quote === '"' && raw[i] === '\\') { i += 1; continue; } // an escape pair never closes the string
    if (raw[i] !== quote) continue;
    if (quote === "'" && raw[i + 1] === "'") i += 1; // '' is one escaped quote: skip the pair
    else { close = i; break; }
  }
  if (close === -1) throw err(`front matter ${label} is not closed`);
  if (!/^[ \t]*$/.test(raw.slice(close + 1))) throw err(`front matter ${label} has text after the closing quote`);
  const content = raw.slice(1, close);
  if (quote === "'") return foldBreaks(content).replaceAll("''", "'");
  let out = '';
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    if (c === '\n') { // plain line break: fold
      let n = 1;
      while (content[i + n] === '\n') n += 1;
      out += n === 1 ? ' ' : '\n'.repeat(n - 1);
      i += n - 1;
      continue;
    }
    if (c !== '\\') { out += c; continue; }
    const nxt = content[i + 1];
    if (nxt === undefined) throw err(`front matter ${label} ends on a backslash`);
    if (nxt === '\n') { i += 1; continue; } // escaped line break: nothing
    if (nxt in DQUOTE_ESCAPES) { out += DQUOTE_ESCAPES[nxt]; i += 1; continue; }
    if (nxt in HEX_ESCAPES) {
      const hex = content.slice(i + 2, i + 2 + HEX_ESCAPES[nxt]);
      const code = parseInt(hex, 16);
      if (hex.length !== HEX_ESCAPES[nxt] || !/^[0-9a-fA-F]+$/.test(hex) || code > 0x10ffff) throw err(`front matter ${label} has a bad \\${nxt} escape`);
      out += String.fromCodePoint(code); i += 1 + HEX_ESCAPES[nxt]; continue;
    }
    throw err(`front matter ${label} has an unknown escape \\${nxt}`);
  }
  return out;
}

function decodePlain(s) {
  if (s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) throw err(`front matter integer ${s} is outside the safe range of ±${Number.MAX_SAFE_INTEGER}`);
    return n;
  }
  const bad = (what) => err(`front matter value ${JSON.stringify(s)} ${what}, which the front matter subset does not support`);
  if (s.startsWith('- ')) throw err(`front matter value ${JSON.stringify(s)} starts with a block-list marker`);
  if (/^[&!]/.test(s)) throw bad('uses an anchor or tag');
  if (s.startsWith('*')) throw bad('is an alias');
  if (s.startsWith('{')) throw bad('is a flow map');
  if (s.startsWith('[')) throw bad('is a flow list');
  if (/^[|>]/.test(s)) throw bad('is a block scalar');
  // YAML breaks lines at \n, \r, U+0085, U+2028 and U+2029 (PyYAML), so all of them separate like a space.
  if (/^#|[ \t\r\n\x85\u2028\u2029]#/.test(s)) throw bad('has a comment');
  if (/^[%@`,\]}]/.test(s) || /^\?([ \t\r\n\x85\u2028\u2029]|$)/.test(s)) throw bad('starts with a YAML indicator');
  if (/:([ \t\r\n\x85\u2028\u2029]|$)/.test(s)) throw bad('is a mapping');
  return s;
}

function decodeScalar(s, label) {
  if (s === '') throw err(`${label} is empty`);
  if (s[0] === '"' || s[0] === "'") return decodeQuoted([s], s[0], label);
  return decodePlain(s);
}

// write_doc: '---\n' + safe_dump(fm).strip + '\n---\n' + body.
export function dump(fm, body) {
  const lines = [];
  for (const [key, value] of Object.entries(fm)) {
    if (!IDENT.test(key)) throw err(`front matter key ${JSON.stringify(key)} is not a plain identifier`);
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`- ${encodeScalar(item)}`);
      }
    } else {
      lines.push(`${key}: ${encodeScalar(value)}`);
    }
  }
  const fmText = lines.length === 0 ? '{}' : lines.join('\n');
  return `---\n${fmText}\n---\n${String(body ?? '')}`;
}

// Replace the complete mapping through the codec, keeping the document's envelope and body bytes.
// A scalar can span several physical lines, so replacing a 'key:' line is never a safe YAML edit.
export function replaceFrontMatter(text, fm) {
  const [bom, source] = splitBom(text);
  const m = /^---(\r\n?|\n)[\s\S]*?(?:\r\n?|\n)---(\r\n?|\n|$)([\s\S]*)$/.exec(source);
  if (!m) throw err('cannot replace front matter: document has no front-matter block');
  const header = dump(fm, '').replace(/\n/g, m[1]);
  return bom + header.slice(0, -m[1].length) + m[2] + m[3];
}

function encodeScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    // Beyond 2^53 a JavaScript number is no longer the integer YAML would read back (1e21 dumps as 1e+21, a string).
    if (!Number.isSafeInteger(value)) throw err(`unsupported front matter value type: number ${value}`);
    return String(value);
  }
  // JSON escapes cover the C0 controls; YAML also forbids DEL and C1 (a literal U+0085/2028/2029 reads as a line break) and U+FFFE/FFFF.
  if (typeof value === 'string') return JSON.stringify(value).replace(/[\x7f-\x9f\u2028\u2029\ufffe\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  throw err(`unsupported front matter value type: ${typeof value}`);
}

// ---- the stored keys of an item
// The codec above is generic. An item file carries the owner's words: title, last_updated, last_updated_by, owner and owned_since. An
// earlier file carries name, updated, updated_by, claimed_by and claimed_at, read forever. In memory a loaded item keeps the earlier
// names (the code asks for them); parseItem and dumpItem are the two doors, so a file is always written with the new keys. The holder
// of an item is its owner while owned_since is set; an owner without owned_since is the user the item belongs to (outside a team).
const STORED = { name: 'title', updated: 'last_updated', updated_by: 'last_updated_by', claimed_at: 'owned_since' };
const LOADED = Object.fromEntries(Object.entries(STORED).map(([a, b]) => [b, a]));

// The front matter as the file holds it, from the loaded form (the new keys, each in the place of the earlier one).
export function storedFm(fm) {
  const out = {};
  for (const [k, v] of Object.entries(fm)) {
    if (k === 'claimed_by') out.owner = v || fm.owner || ''; // the holder; none: the user the item belongs to
    else if (k === 'claimed_at') out.owned_since = v || (fm.claimed_by ? fm.updated || fm.created || '1970-01-01T00:00:00Z' : v); // a holder is told apart by owned_since
    else if (k === 'owner') { if (!('claimed_by' in fm)) out.owner = v; }
    else if (k in STORED) { if (!(STORED[k] in fm)) out[STORED[k]] = v; }
    else out[k] = v;
  }
  if (fm.claimed_by && !('claimed_at' in fm)) out.owned_since = fm.updated || fm.created || '1970-01-01T00:00:00Z'; // the holder is told apart by owned_since
  return out;
}

// The front matter as the code reads it, from the stored form (an earlier file passes as it is; its new key, when it has both, wins).
export function loadedFm(fm) {
  const out = {};
  for (const [k, v] of Object.entries(fm)) {
    if (k === 'owner' && !('claimed_by' in fm)) { // the holder while owned_since is set, else the user the item belongs to
      out.claimed_by = fm.owned_since ? v : '';
      if (!fm.owned_since) out.owner = v;
    }
    else if (k in LOADED) out[LOADED[k]] = v;
    else if (k in STORED && STORED[k] in fm) continue;
    else out[k] = v;
  }
  return out;
}

export function parseItem(text) { const doc = parse(text); return { ...doc, fm: loadedFm(doc.fm) }; }
export const dumpItem = (fm, body) => dump(storedFm(fm), body);
export const replaceItemFrontMatter = (text, fm) => replaceFrontMatter(text, storedFm(fm));
