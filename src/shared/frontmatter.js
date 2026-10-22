// Front-matter codec for the shared backlog repository mode (cli-parity job 4).
// Cited source: the pinned oracle at commit ec5b254e (contract v3 lines) —
// lib_db.py:171-179 (_FM_RE + parse_front_matter), 182-184 (write_doc).
// parse reads exactly the YAML subset PyYAML's safe_dump writes to item files:
// a top-level block mapping of plain / single-quoted / double-quoted scalars
// (including folded continuation lines), block lists, flow [] and [a, b],
// ints, null/~, true/false. Anything outside the subset is a clear error,
// never a guess. dump writes that subset back, keys in the given order.

const FM_SPLIT = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/; // port of _FM_RE (lib_db.py:171-179)
const KEY_LINE = /^([^\s:#][^:]*):(?:[ \t]+(.*))?$/; // top-level 'key:' or 'key: value'
const IDENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function parse(text) {
  const source = String(text ?? '');
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
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i += 1; continue; }
    const m = KEY_LINE.exec(line);
    if (!m) throw new Error(`front matter line ${i + 1} is not a 'key: value' pair: ${line}`);
    const key = m[1].trim();
    if (!IDENT.test(key)) throw new Error(`front matter key ${JSON.stringify(key)} is not a plain identifier`);
    const inline = (m[2] ?? '').trimStart();
    if (inline === '') {
      const next = lines[i + 1];
      if (next !== undefined && /^- /.test(next)) {
        const items = [];
        let j = i + 1;
        while (j < lines.length && /^- /.test(lines[j])) {
          const raw = lines[j].slice(2).trim();
          items.push(decodeScalar(raw, `a list item of '${key}'`));
          j += 1;
        }
        fm[key] = items;
        i = j;
      } else if (next !== undefined && /^[ \t]/.test(next)) {
        throw new Error(`front matter key '${key}' has a nested block, which the shared-mode subset does not support`);
      } else {
        fm[key] = null;
        i += 1;
      }
    } else {
      let j = i + 1;
      for (;;) {
        const l = lines[j];
        if (l === undefined) break;
        if (l.trim() === '') {
          let k = j;
          while (k < lines.length && lines[k].trim() === '') k += 1;
          if (k < lines.length && /^[ \t]/.test(lines[k])) j += 1;
          else break;
        } else if (/^[ \t]/.test(l)) {
          j += 1;
        } else {
          break;
        }
      }
      const chunk = [inline, ...lines.slice(i + 1, j).map((l) => l.trim())];
      fm[key] = decodeValue(key, chunk);
      i = j;
    }
  }
  return fm;
}

function decodeValue(key, chunk) {
  const head = chunk[0];
  if (head.startsWith('"') || head.startsWith("'")) return decodeQuoted(chunk, head[0], `the value of '${key}'`);
  if (head.startsWith('[')) {
    if (chunk.length !== 1 || !head.endsWith(']')) throw new Error(`front matter key '${key}' has a flow list that wraps over a line, which the shared-mode subset does not support`);
    const inner = head.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((part) => decodeScalar(part.trim(), `an item of '${key}'`));
  }
  if (head.startsWith('{')) throw new Error(`front matter key '${key}' has a flow map, which the shared-mode subset does not support`);
  return decodePlain(chunk.filter((p) => p !== '').join(' '));
}

const DQUOTE_ESCAPES = { '"': '"', '\\': '\\', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

function decodeQuoted(chunk, quote, label) {
  let raw = chunk.join('\n');
  let close = -1;
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i] !== quote) continue;
    if (quote === '"') {
      let run = 0;
      for (let k = i - 1; k >= 0 && raw[k] === '\\'; k -= 1) run += 1;
      if (run % 2 === 0) { close = i; break; }
    } else {
      if (i + 1 < raw.length && raw[i + 1] === "'") i += 1; // '' is one escaped quote: skip the pair
      else { close = i; break; }
    }
  }
  if (close === -1) throw new Error(`front matter ${label} is not closed`);
  if (!/^[ \t]*$/.test(raw.slice(close + 1))) throw new Error(`front matter ${label} has text after the closing quote`);
  let content = raw.slice(1, close);
  if (content.endsWith('\n')) content = content.slice(0, -1);
  if (quote === "'") {
    let out = '';
    for (let i = 0; i < content.length; i += 1) {
      if (content[i] === '\n') { out += ' '; continue; }
      if (content[i] === "'") {
        if (i + 1 < content.length && content[i + 1] === "'") { out += "'"; i += 1; }
        else out += "'";
      } else out += content[i];
    }
    return out;
  }
  let out = '';
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    if (c === '\\') {
      const nxt = content[i + 1];
      if (nxt === '\n') { i += 1; continue; } // escaped line break: nothing
      if (nxt === ' ') { out += ' '; i += 1; continue; } // escaped space: a single space
      if (nxt === undefined) throw new Error(`front matter ${label} ends on a backslash`);
      if (nxt in DQUOTE_ESCAPES) { out += DQUOTE_ESCAPES[nxt]; i += 1; continue; }
      if (nxt === 'u') {
        const hex = content.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error(`front matter ${label} has a bad \\u escape`);
        out += String.fromCharCode(parseInt(hex, 16)); i += 5; continue;
      }
      throw new Error(`front matter ${label} has an unknown escape \\${nxt}`);
    }
    if (c === '\n') { out += ' '; continue; } // plain line break: fold
    out += c;
  }
  return out;
}

function decodePlain(s) {
  if (s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (s.startsWith('- ')) throw new Error(`front matter value ${JSON.stringify(s)} starts with a block-list marker`);
  if (/^[&!]/.test(s)) throw new Error(`front matter value ${JSON.stringify(s)} uses an anchor or tag, which the shared-mode subset does not support`);
  if (s.startsWith('*')) throw new Error(`front matter value ${JSON.stringify(s)} is an alias, which the shared-mode subset does not support`);
  return s;
}

function decodeScalar(s, label) {
  if (s === '') throw new Error(`${label} is empty`);
  if (s[0] === '"' || s[0] === "'") return decodeQuoted([s], s[0], label);
  if (s[0] === '[') throw new Error(`${label} uses a flow list, which the shared-mode subset does not support`);
  return decodePlain(s);
}

// write_doc (lib_db.py:182-184): '---\n' + safe_dump(fm).strip() + '\n---\n' + body.
export function dump(fm, body) {
  const lines = [];
  for (const [key, value] of Object.entries(fm)) {
    if (!IDENT.test(key)) throw new Error(`front matter key ${JSON.stringify(key)} is not a plain identifier`);
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

function encodeScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error(`unsupported front matter value type: number ${value}`);
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  throw new Error(`unsupported front matter value type: ${typeof value}`);
}
