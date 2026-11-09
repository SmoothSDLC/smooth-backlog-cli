// The `regex` test of the rule language: a linear-time matcher for a subset of regular expressions (spike). A pattern compiles to a
// small program run as a set of states over the text (Thompson / Pike), so the time is at most text length x program size: no
// backtracking, whatever the pattern. Not supported (a validate error): back-references, lookaround, flags, lazy quantifiers, \b.
const MAX_PATTERN = 200, MAX_PROGRAM = 5000, MAX_COUNT = 100, MAX_TEXT = 10000;

export function compile(src) {
  if (typeof src !== 'string') throw new Error('the pattern must be text');
  if (src.length > MAX_PATTERN) throw new Error(`the pattern is longer than ${MAX_PATTERN} characters`);
  let i = 0;
  const fail = m => { throw new Error(`${m} (at character ${i})`); };
  const peek = () => src[i];
  const CLS = { d: ch => ch >= '0' && ch <= '9', w: ch => /\w/.test(ch), s: ch => /\s/.test(ch) };
  const esc = () => {
    const c = src[i++];
    if (c === undefined) fail('the pattern ends with \\');
    if (CLS[c]) return CLS[c];
    if ('DWS'.includes(c)) { const f = CLS[c.toLowerCase()]; return ch => !f(ch); }
    if (c === 'n') return ch => ch === '\n';
    if (c === 't') return ch => ch === '\t';
    if (/[A-Za-z0-9]/.test(c)) fail(`the escape \\${c} is not supported`);
    return ch => ch === c;
  };
  const cls = () => {
    let neg = false; if (peek() === '^') { neg = true; i++; }
    const parts = [];
    while (peek() !== ']') {
      if (i >= src.length) fail('a [ class is not closed');
      const c = src[i++];
      if (c === '\\') parts.push(esc());
      else if (peek() === '-' && src[i + 1] !== undefined && src[i + 1] !== ']') { const hi = src[i + 1]; i += 2; parts.push(ch => ch >= c && ch <= hi); }
      else parts.push(ch => ch === c);
    }
    i++;
    return { t: 'chr', f: ch => parts.some(p => p(ch)) !== neg };
  };
  const atom = () => {
    const c = src[i++];
    if (c === '(') {
      if (src.startsWith('?:', i)) i += 2; else if (peek() === '?') fail('lookaround and flags are not supported');
      const n = alt(); if (src[i++] !== ')') fail('a ( group is not closed'); return n;
    }
    if (c === ')') fail('a ) has no (');
    if ('*+?'.includes(c)) fail('a quantifier has nothing to repeat');
    if (c === '^' || c === '$') return { t: c };
    if (c === '.') return { t: 'chr', f: ch => ch !== '\n' };
    if (c === '[') return cls();
    if (c === '\\') { if (peek() === 'b' || peek() === 'B' || /[1-9]/.test(peek() ?? '')) fail(`\\${peek()} is not supported`); return { t: 'chr', f: esc() }; }
    return { t: 'chr', f: ch => ch === c };
  };
  const rep = () => {
    let n = atom();
    for (;;) {
      const c = peek(); let m; let min; let max;
      if (c === '*') [min, max] = [0, Infinity]; else if (c === '+') [min, max] = [1, Infinity]; else if (c === '?') [min, max] = [0, 1];
      else if (c === '{' && (m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i)))) {
        min = Number(m[1]); max = m[2] ? (m[3] === '' ? Infinity : Number(m[3])) : min; i += m[0].length - 1;
        if (min > MAX_COUNT || (max !== Infinity && (max > MAX_COUNT || max < min))) fail(`a counted repetition is at most ${MAX_COUNT}`);
      } else return n;
      i++;
      if (peek() === '?') fail('a lazy quantifier is not supported');
      n = { t: 'rep', n, min, max };
    }
  };
  const cat = () => { const a = []; while (i < src.length && peek() !== '|' && peek() !== ')') a.push(rep()); return { t: 'cat', a }; };
  function alt() { const a = [cat()]; while (peek() === '|') { i++; a.push(cat()); } return a.length === 1 ? a[0] : { t: 'alt', a }; }
  const tree = alt();
  if (i < src.length) fail('a ) has no (');
  const prog = [];
  const emit = ins => { if (prog.push(ins) > MAX_PROGRAM) throw new Error('the pattern is too large (counted repetitions multiply)'); return prog.length - 1; };
  const gen = n => {
    if (n.t === 'chr' || n.t === '^' || n.t === '$') emit({ op: n.t, f: n.f });
    else if (n.t === 'cat') n.a.forEach(gen);
    else if (n.t === 'alt') {
      const jumps = [];
      n.a.forEach((x, k) => {
        if (k === n.a.length - 1) return gen(x);
        const s = emit({ op: 'split', x: prog.length + 1 }); gen(x); jumps.push(emit({ op: 'jmp' })); prog[s].y = prog.length;
      });
      for (const j of jumps) prog[j].x = prog.length;
    } else {
      for (let k = 0; k < n.min; k++) gen(n.n);
      if (n.max === Infinity) { const s = emit({ op: 'split', x: prog.length + 1 }); gen(n.n); emit({ op: 'jmp', x: s }); prog[s].y = prog.length; }
      else for (let k = n.min; k < n.max; k++) { const s = emit({ op: 'split', x: prog.length + 1 }); gen(n.n); prog[s].y = prog.length; }
    }
  };
  gen(tree); emit({ op: 'match' });
  return function test(input) {
    const text = String(input ?? '').slice(0, MAX_TEXT);
    const close = (list, seen, pc, pos) => {
      if (seen.has(pc)) return; seen.add(pc);
      const ins = prog[pc];
      if (ins.op === 'jmp') close(list, seen, ins.x, pos);
      else if (ins.op === 'split') { close(list, seen, ins.x, pos); close(list, seen, ins.y, pos); }
      else if (ins.op === '^') { if (pos === 0) close(list, seen, pc + 1, pos); }
      else if (ins.op === '$') { if (pos === text.length) close(list, seen, pc + 1, pos); }
      else list.push(pc);
    };
    let list = []; let seen = new Set();
    for (let pos = 0; ; pos++) {
      close(list, seen, 0, pos); // a match may start at every position
      if (list.some(pc => prog[pc].op === 'match')) return true;
      if (pos === text.length) return false;
      const next = []; const nseen = new Set();
      for (const pc of list) if (prog[pc].op === 'chr' && prog[pc].f(text[pos])) close(next, nseen, pc + 1, pos + 1);
      list = next; seen = nseen;
    }
  };
}
