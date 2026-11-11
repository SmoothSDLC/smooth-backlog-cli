// The checks of every rule of one team entry: its keys, id, step, outcome, condition, functions, references, texts and effects. Each check mirrors a refusal the
// evaluator makes at run time (a malformed condition, an unknown reference, a value that does not fit its field), so that a file that passes is never refused for its own shape.
// ctx = { team, entry, say, keys }: `entry` and `entry.rules` are objects, but `rules.table` may be of any type (validate.js has already reported a wrong type), so
// every read here is guarded. `say(path, rule, problem, fix, severity = 'error')` adds a finding of the team; `keys(object, kind, path, rule = null)` reports the keys
// of an object that its kind does not allow. Nothing here throws: a rule that cannot be walked (nested too deeply) is one finding.
import { ENVELOPE, FLAGS, FUNCTIONS, LIST, NAMES, PAIR, Refusal, TESTS, asList, num, stepMatches } from './expression.js';
import { compile } from './safe-regex.js';
import { stepWords } from '../steps.js';
import { stepArgs, typed } from './step.js';
import { TYPES, closest, isObj } from './validate.js';

const NAME = /^[a-z][a-z0-9_-]*$/;
const REFS = { ...NAMES, now: [''], team: ['name', 'items'] };
const has = (o, k) => Object.hasOwn(o, k);
// A literal is a value the evaluator reads as it is: no reference and no function.
// A message names at most ten of a long list, so that a file with a hundred thousand names does not make a hundred thousand long messages.
const NAMED = 10;
const names = list => [...list.slice(0, NAMED).map(v => (['string', 'number', 'boolean'].includes(typeof v) ? String(v) : '<a value>')), ...(list.length > NAMED ? [`and ${list.length - NAMED} more`] : [])].join(', ');
// Membership by the evaluator's `same` without a scan: a number matches a number or a decimal text, a text matches a text or a number.
const memberOf = values => {
  const text = new Set(); const number = new Set(); const decimal = new Set(); const other = new Set();
  for (const v of values) {
    if (typeof v === 'string') { text.add(v); const n = num(v); if (!Number.isNaN(n)) decimal.add(n); } else if (typeof v === 'number') number.add(v); else other.add(v);
  }
  return l => (typeof l === 'string' ? text.has(l) || number.has(num(l)) : typeof l === 'number' ? number.has(l) || decimal.has(l) : other.has(l));
};
// The value a literal stands for, or NONE when the evaluator has to compute it. A one-key text function is the text it holds, whatever it starts with.
const NONE = Symbol('none');
const fixed = x => {
  if (isObj(x)) return Object.keys(x).length === 1 && has(x, 'text') && (x.text === null || typeof x.text !== 'object') ? x.text : NONE;
  if (Array.isArray(x)) { const out = x.map(fixed); return out.includes(NONE) ? NONE : out; }
  return literal(x) ? x : NONE;
};
const literal = x => x === null || (typeof x === 'string' ? !x.startsWith('$') : ['number', 'boolean'].includes(typeof x)) || (Array.isArray(x) && x.every(literal));

export function checkRules({ team, entry, say, keys }) {
  const table = entry.rules.table;
  if (!Array.isArray(table)) return;
  const defs = isObj(entry.item) ? entry.item : null;
  const roles = isObj(entry.people) ? new Set(Object.values(entry.people).flatMap(r => (Array.isArray(r) ? r : []))) : null;
  const declared = f => defs !== null && has(defs, f);
  const cache = new Map();
  const once = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
  const fieldNames = () => once('fields', () => [...ENVELOPE, ...Object.keys(defs)]);
  const roleNames = () => once('roles', () => [...roles]);
  const peopleNames = () => once('people', () => Object.keys(entry.people));
  const members = f => once(`m:${f}`, () => memberOf(defs[f].values));
  // The definitions without their values: typed() would scan a long list for every literal, so the values are checked here by membership.
  const bare = () => once('bare', () => ({ ...entry, item: Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, isObj(d) ? { ...d, values: undefined } : d])) }));

  // The problems of one reference as [problem, fix] pairs. c = { rule, it: $it is valid here, nest: inside the match of a quantifier }.
  const refProblems = (node, c) => {
    const [root, ...rest] = node.slice(1).split('.'); const name = rest.join('.');
    if (root === 'item' || root === 'it') {
      const out = [];
      if (defs && !ENVELOPE.includes(name) && !declared(name)) out.push([`${node} names no field of the item definition`, `add ${name} to ${team}.item or name one of ${names(fieldNames())}`]);
      if (root === 'it' && !c.it) out.push([`${node} is used outside every, some, count and related`, 'use $item for the item of the step']);
      return out;
    }
    if (root === 'arg') return FLAGS.includes(name) ? [[`--${name} belongs to the CLI`, 'name the argument otherwise']] : NAME.test(name) ? [] : [[`${name} is not an argument name`, 'lowercase letters, digits, - and _, starting with a letter']];
    return has(REFS, root) && REFS[root].includes(name) ? [] : [[`${node} is no reference`, 'use one of $item.<field>, $it.<field>, $arg.<name>, $caller, $caller.roles, $session.id|repository|branch|commit, $team.name|items, $now']];
  };
  const refs = (node, path, c) => { for (const [problem, fix] of refProblems(node, c)) say(path, c.rule, problem, fix); };
  // A text that the evaluator fills: each {$reference} in it is a reference.
  const text = (t, path, c, where) => {
    if (typeof t !== 'string') return say(path, c.rule, `${where} must be a text`, `write "${where}": "<text>"`);
    for (const [, p] of t.matchAll(/\{(\$[^}]*)\}/g)) for (const [problem, fix] of refProblems(p, c)) say(path, c.rule, `{${p}} in the ${where} text: ${problem}`, fix);
    return undefined;
  };

  const quant = (k, x, at, c) => {
    if (!isObj(x) || !has(x, 'items') || (k !== 'count' && !has(x, 'match'))) return say(at, c.rule, `${k} takes items${k === 'count' ? ' and an optional match' : ' and match'}`, `write {"${k}": {"items": <items>, "match": <condition>}}`);
    if (c.nest) say(at, c.rule, `${k} inside another every, some or count`, 'a rule reads one hop of related items; split it into two rules');
    for (const q of Object.keys(x)) if (!['items', 'match'].includes(q)) say(`${at}.${q}`, c.rule, `${q} is not a key of ${k}`, `did you mean ${closest(q, ['items', 'match'])}? (items, match)`);
    val(x.items, `${at}.items`, c);
    if (has(x, 'match')) cond(x.match, `${at}.match`, { ...c, it: true, nest: true });
    return undefined;
  };

  function val(node, path, c) {
    if (typeof node === 'string') return node.startsWith('$') ? refs(node, path, c) : undefined;
    if (Array.isArray(node)) return node.forEach((x, i) => val(x, `${path}[${i}]`, c));
    if (!isObj(node)) return undefined;
    const ks = Object.keys(node);
    if (ks.length !== 1) return say(path, c.rule, `a function has exactly one key (found ${names(ks) || 'none'})`, 'write one function, for example {"plus": [<value>, <value>]}');
    const [k] = ks; const x = node[k]; const at = `${path}.${k}`;
    if (!FUNCTIONS.includes(k)) return say(at, c.rule, `unknown function ${k}`, `did you mean ${closest(k, FUNCTIONS)}? (${FUNCTIONS.join(', ')})`);
    if (k === 'text') return undefined;
    if (k === 'plus' && !Array.isArray(x)) return say(at, c.rule, 'plus takes a list of values', 'write {"plus": [<value>, <value>]}');
    return k === 'count' ? quant(k, x, at, c) : val(x, at, c);
  }

  function pattern(p, at, c) {
    if (typeof p === 'string' && /^\$[a-z]/.test(p)) return say(at, c.rule, `the pattern ${p.slice(0, 40)} is a reference; a pattern is a literal text`, 'write the pattern itself: the CLI never reads a pattern from an argument or a field');
    try { compile(p, true); } catch (err) { say(at, c.rule, `not a pattern the CLI runs (${err.message})`, 'use the subset of the pattern language: no back-reference, lookaround, flag, lazy quantifier or \\b, and no quantifier on a quantifier or on ^ or $'); }
    return undefined;
  }

  function cond(node, path, c) {
    if (!isObj(node)) return say(path, c.rule, 'a condition must be an object with exactly one key', 'write {"is": [<value>, <value>]}, or wrap several conditions in all');
    const ks = Object.keys(node);
    if (ks.length !== 1) return say(path, c.rule, `a condition has exactly one key (found ${names(ks) || 'none'})`, 'wrap several conditions in all');
    const [k] = ks; const x = node[k]; const at = `${path}.${k}`;
    if (!TESTS.includes(k)) return say(at, c.rule, `unknown test ${k}`, `did you mean ${closest(k, TESTS)}? (${TESTS.join(', ')})`);
    if (PAIR.includes(k) && !(Array.isArray(x) && x.length === 2)) return say(at, c.rule, `${k} takes a list of two values`, `write {"${k}": [<value>, <value>]}`);
    if (k === 'all' || k === 'any') return Array.isArray(x) ? x.forEach((y, i) => cond(y, `${at}[${i}]`, c)) : say(at, c.rule, `${k} takes a list of conditions`, `write {"${k}": [<condition>, ...]}`);
    if (k === 'not') return isObj(x) ? cond(x, at, c) : say(at, c.rule, 'not takes one condition', 'write {"not": <condition>}');
    if (k === 'every' || k === 'some') return quant(k, x, at, c);
    if (k === 'empty') return val(x, at, c);
    if (k === 'regex') { pattern(x[1], at, c); return val(x[0], `${at}[0]`, c); }
    if (k === 'in' && roles && typeof x[0] === 'string' && !x[0].startsWith('$') && !roles.has(x[0])
      && (x[1] === '$caller.roles' || (isObj(x[1]) && has(x[1], 'roles_of')))) say(at, c.rule, `no person has the role ${x[0]}`, `give a person the role or use one of ${names(roleNames())}`);
    const field = (k === 'is' || k === 'in') && typeof x[0] === 'string' ? /^\$(?:item|it)\.(.+)$/.exec(x[0])?.[1] : undefined;
    const values = field !== undefined && declared(field) && isObj(defs[field]) ? defs[field].values : undefined;
    if (Array.isArray(values)) {
      const known = members(field);
      for (const lit of asList(x[1]).filter(l => typeof l !== 'object' && literal(l))) if (!known(lit)) say(at, c.rule, `${lit} is not a value of ${field} (${names(values)})`, `use a value of ${field} or add ${lit} to its values`);
    }
    return val(x, at, c);
  }

  // A literal written into a field: typed() decides what the evaluator would, the values and the persons are checked by lookup.
  function literalEffect(kind, f, v, d, at, c) {
    const fix = Array.isArray(d.values) ? `use one of ${names(d.values)}` : `write a ${d.type} value`;
    if (d.type === 'person' && typeof v === 'string' && v !== '' && isObj(entry.people) && !has(entry.people, v)) return say(at, c.rule, `field ${f}: ${JSON.stringify(v)} is not a person of the team (${names(peopleNames())})`, `write a person of the team: ${names(peopleNames())}`);
    try {
      const out = typed(bare(), f, kind === 'set' ? v : asList(v), '');
      if (Array.isArray(d.values) && !asList(out).every(members(f))) say(at, c.rule, typeof v === 'string' ? `${v} is not a value of ${f}` : `field ${f}: ${JSON.stringify(v)} is not one of ${names(d.values)}`, fix);
    } catch (err) {
      if (err instanceof Refusal) say(at, c.rule, err.message, fix);
    } // anything else is a malformed definition, reported with the item definition
    return undefined;
  }

  // The type of a reference written into a field, when the file says it: a field of the item definition, $caller (a person) or $caller.roles (a list of texts).
  const refType = x => {
    if (x === '$caller') return { type: 'person', list: false };
    if (x === '$caller.roles') return { type: 'text', list: true };
    const m = /^\$(?:item|it)\.(.+)$/.exec(x);
    return m && declared(m[1]) && isObj(defs[m[1]]) && TYPES.includes(defs[m[1]].type) ? { type: defs[m[1]].type, list: LIST.includes(defs[m[1]].type), values: defs[m[1]].values, name: m[1] } : null;
  };
  // What the evaluator would refuse: a list into a field of one value, a type that never converts, a known value the field does not hold. A text may hold anything, so it is not judged.
  const NEVER = { number: ['boolean', 'person'], boolean: ['number', 'item', 'person', 'time'], item: ['boolean', 'person', 'time'], person: ['number', 'boolean', 'item', 'time'], items: ['boolean', 'person', 'time'] };
  function refEffect(kind, f, x, d, at, c) {
    const src = refType(x);
    if (!src || !TYPES.includes(d.type)) return;
    const own = LIST.includes(d.type); const say2 = (problem, fix) => say(at, c.rule, `field ${f}: ${x} ${problem}`, fix);
    if (src.list && !own) return say2(`is a list, and ${f} takes one ${d.type} value`, `write a field of one value, or use add on a list field`);
    if ((NEVER[d.type] ?? []).includes(src.type) && !(src.list && own)) return say2(`is ${src.type === 'item' ? 'an item' : `a ${src.type}`}, and ${f} takes a ${d.type}`, `write a value of type ${d.type}`);
    if (Array.isArray(d.values) && src.name && Array.isArray(src.values)) {
      const known = members(f); const missing = src.values.filter(v => !known(v));
      if (missing.length) say2(`can hold ${names(missing)}, which ${missing.length > 1 ? 'are' : 'is'} not among the values of ${f} (${names(d.values)})`, `give ${f} the values of ${src.name}, or write a literal`);
    }
    return undefined;
  }

  // set, add and remove of an effect list or of a related entry: the fields are declared, add and remove take list fields, a literal fits its field.
  function fieldEffects(spec, path, c) {
    for (const kind of ['set', 'add', 'remove']) {
      if (!has(spec, kind)) continue;
      if (!isObj(spec[kind])) { say(`${path}.${kind}`, c.rule, `${kind} must be an object of field values`, `write "${kind}": {"<field>": <value>}`); continue; }
      for (const [f, x] of Object.entries(spec[kind])) {
        const at = `${path}.${kind}.${f}`; const d = declared(f) ? defs[f] : undefined;
        if (defs && !declared(f)) say(at, c.rule, `${f} is no field of the item definition`, `add ${f} to ${team}.item`);
        else if (isObj(d) && kind !== 'set' && !LIST.includes(d.type)) say(at, c.rule, `${kind} needs a list field; ${f} is ${d.type}`, 'use set');
        else if (isObj(d) && fixed(x) !== NONE) literalEffect(kind, f, fixed(x), d, at, c);
        else if (isObj(d) && typeof x === 'string') refEffect(kind, f, x, d, at, c);
        val(x, at, c);
      }
    }
  }

  function effects(d, path, c) {
    keys(d, 'do', path, c.rule);
    fieldEffects(d, path, c);
    if (has(d, 'team') && !['$team.name', ''].includes(d.team)) say(`${path}.team`, c.rule, 'the team effect binds only to $team.name or unbinds with ""', 'a team never moves an item to another team');
    for (const k of ['archive', 'delete']) if (has(d, k) && d[k] !== true) say(`${path}.${k}`, c.rule, `${k} takes only true`, `leave ${k} out when the step must not ${k}`);
    if (has(d, 'branch')) {
      const b = d.branch;
      if (b === '' || (typeof b !== 'string' && !isObj(b))) say(`${path}.branch`, c.rule, 'the branch effect needs a branch name', 'write the name of the branch as a text or as a reference');
      else val(b, `${path}.branch`, c);
    }
    if (has(d, 'say')) text(d.say, `${path}.say`, c, 'say');
    if (has(d, 'note')) {
      const n = d.note; const at = `${path}.note`;
      if (!isObj(n) || typeof n.heading !== 'string' || !has(n, 'text')) say(at, c.rule, 'note must be an object with a heading text and a text', 'write "note": {"heading": "<heading>", "text": "<text>"}');
      if (isObj(n)) {
        keys(n, 'note', at, c.rule);
        // A text that does not start with $ is filled; any other value is computed and read as a text.
        if (has(n, 'text')) { if (typeof n.text === 'string' && !n.text.startsWith('$')) text(n.text, `${at}.text`, c, 'note'); else val(n.text, `${at}.text`, c); }
      }
    }
    if (has(d, 'related')) {
      const at = `${path}.related`;
      if (!Array.isArray(d.related)) say(at, c.rule, 'related must be a list of objects, each with items', 'write "related": [{"items": <items>, "set": {...}}]');
      else d.related.forEach((x, i) => {
        const a = `${at}[${i}]`;
        if (isObj(x)) keys(x, 'related', a, c.rule);
        if (!isObj(x) || !has(x, 'items')) return say(a, c.rule, 'a related entry must be an object with items', 'write {"items": <items>, "set": {...}}');
        val(x.items, `${a}.items`, c);
        return fieldEffects(x, a, { ...c, it: true });
      });
    }
    if (has(d, 'place')) {
      const p = d.place; const at = `${path}.place`;
      const bad = () => say(at, c.rule, 'place must be "first", "last", {"before": n} or {"after": n}', 'write "place": "first"');
      if (!isObj(p)) { if (p !== 'first' && p !== 'last') bad(); return; }
      keys(p, 'place', at, c.rule);
      const k = Object.keys(p);
      if (k.length !== 1) bad(); else if (['before', 'after'].includes(k[0])) val(p[k[0]], `${at}.${k[0]}`, c);
    }
  }

  const ids = new Set();
  table.forEach((r, n) => {
    const at = `rules.table[${n}]`;
    if (!isObj(r)) return say(at, null, 'a rule must be an object', 'write {"id": "<id>", "step": "<step>", "when": <condition>, "do": {...}}');
    const id = typeof r.id === 'string' && r.id ? r.id : null; const c = { rule: id, it: false, nest: false };
    try {
      keys(r, 'rule', at, id);
      if (!has(r, 'id') || r.id === '') say(at, id, 'the rule has no id', 'give every rule its own id');
      else if (typeof r.id !== 'string') say(`${at}.id`, null, 'the id must be a text', 'write "id": "<id>"');
      else if (ids.has(r.id)) say(at, id, `the id ${r.id} is used twice`, 'give every rule its own id');
      else ids.add(r.id);
      const words = typeof r.step === 'string' ? [r.step] : Array.isArray(r.step) && r.step.length && r.step.every(s => typeof s === 'string') ? r.step : null;
      if (!words) say(`${at}.step`, id, 'step must be a word, a list of words or "*"', 'name the step the rule decides');
      else for (const s of words) {
        if (s !== '*' && !NAME.test(s)) say(`${at}.step`, id, `${s} is not a step name`, 'lowercase letters, digits, - and _, starting with a letter');
        else if (FLAGS.includes(s)) say(`${at}.step`, id, `${s} is a flag name of the CLI`, 'name the step otherwise');
      }
      if (has(r, 'deny')) text(r.deny, `${at}.deny`, c, 'deny');
      if (has(r, 'deny') === has(r, 'do')) say(at, id, 'a rule has exactly one outcome: deny or do', 'keep one of deny and do');
      if (has(r, 'when')) cond(r.when, `${at}.when`, c);
      if (has(r, 'do')) { if (isObj(r.do)) effects(r.do, `${at}.do`, c); else say(`${at}.do`, id, 'do must be an object of effects', 'write "do": {"set": {...}}'); }
    } catch (err) {
      // A value nested so deeply that walking it overflows the stack: the evaluator could not run it either.
      say(at, id, `the rule cannot be checked (${err instanceof RangeError ? 'it is nested too deeply' : err.name})`, 'flatten the rule');
    }
    return undefined;
  });

  checkShadowing(table, say);
  checkPop(entry, say, keys, cond, table);
  checkFilters(entry, say, keys, cond);
  warn(entry, say);
}

// Shadowing: an earlier rule that names every step of a later one and whose every clause is a clause of the later one decides first in every case the later one
// matches. Clauses are the members of a top-level `all` or the one condition, compared without key order; an earlier `in` covers a later `is` of one of its values.
// What only logic could prove (>= 3 above >= 5) is not found.
const canonical = x => JSON.stringify(x, (_, v) => (isObj(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
const clauses = w => (!isObj(w) ? [] : Array.isArray(w.all) ? w.all : [w]);
// Each clause once, in the forms the comparison needs: its canonical text, and for `in` and `is` the compared value and the values.
const clauseInfo = c => ({ text: canonical(c), in: isObj(c) && Array.isArray(c.in) && Array.isArray(c.in[1]) ? { of: canonical(c.in[0]), values: new Set(c.in[1].map(canonical)) } : null,
  is: isObj(c) && Array.isArray(c.is) ? { of: canonical(c.is[0]), value: canonical(c.is[1]) } : null });
const covers = (p, q) => p.text === q.text || (p.in !== null && q.is !== null && p.in.of === q.is.of && p.in.values.has(q.is.value));

function checkShadowing(table, say) {
  // Per rule, once: its clauses, its step words as a set and whether it names every step.
  const infos = table.map(r => {
    try {
      if (!isObj(r) || (has(r, 'when') && !isObj(r.when))) return null;
      const words = new Set(stepWords(r));
      return words.size ? { clauses: clauses(r.when).map(clauseInfo), words, star: words.has('*') } : null;
    } catch { return null; }
  });
  for (let n = 0; n < table.length; n++) {
    const me = infos[n];
    if (!me) continue;
    for (let m = 0; m < n; m++) {
      const e = infos[m];
      // The cheap and selective test comes first: the clauses, then the steps.
      if (!e || !e.clauses.every(c => me.clauses.some(d => covers(c, d))) || !(e.star || [...me.words].every(w => e.words.has(w)))) continue;
      const r = table[n];
      say(`rules.table[${n}]`, typeof r.id === 'string' ? r.id : null, `rule ${r.id} can never decide: rule ${table[m].id} above it matches every case it matches`, `move ${r.id} above ${table[m].id}, or narrow ${table[m].id}`);
      break;
    }
  }
}

// A condition nested so deeply that walking it overflows the stack: the evaluator could not run it either.
const guarded = (path, rule, say, fn) => { try { fn(); } catch (err) { say(path, rule, `the condition cannot be checked (${err instanceof RangeError ? 'it is nested too deeply' : err.name})`, 'flatten the condition'); } };

// Pop entries: an id of its own, one existing step (not * and not new: a pop entry acts on an existing item) and an optional condition.
function checkPop(entry, say, keys, cond, table) {
  // Named means a rule writes the step word itself; a rule for every step (*) does not make a mistyped step exist.
  const named = new Set(table.flatMap(r => (isObj(r) ? stepWords(r) : [])));
  const pop = entry.rules.pop;
  if (!Array.isArray(pop)) return;
  const ids = new Set();
  pop.forEach((o, n) => {
    const at = `rules.pop[${n}]`;
    if (!isObj(o)) return say(at, null, 'a pop entry must be an object', 'write {"id": "<id>", "step": "<step>", "when": <condition>}');
    const id = typeof o.id === 'string' && o.id ? o.id : null;
    keys(o, 'pop', at, id);
    if (id === null) say(at, null, has(o, 'id') ? 'the id of a pop entry must be a text' : 'the pop entry has no id', 'give every pop entry its own id: the history prints it');
    else if (ids.has(id)) say(at, id, `the id ${id} is used twice among the pop entries`, 'give every pop entry its own id');
    else ids.add(id);
    const s = o.step;
    if (typeof s !== 'string' || !s) say(`${at}.step`, id, 'a pop entry names one step as a word', 'write "step": "<step>"');
    else if (s === '*' || s === 'new') say(`${at}.step`, id, `${s === '*' ? 'a pop entry names one step, not *' : 'new creates an item; a pop entry acts on an existing one'}`, 'name a step of rules.table');
    else if (!named.has(s)) say(at, id, `no rule names the step ${s}`, 'name a step of rules.table');
    guarded(`${at}.when`, id, say, () => has(o, 'when') && cond(o.when, `${at}.when`, { rule: id, it: false, nest: false }));
  });
}

// Filters: a field-style name and a condition that is required.
function checkFilters(entry, say, keys, cond) {
  const filters = entry.rules.filters;
  if (!isObj(filters)) return;
  for (const [name, f] of Object.entries(filters)) {
    const at = `rules.filters.${name}`;
    if (!NAME.test(name)) say(at, null, `${name} is not a filter name: lowercase letters, digits, - and _, starting with a letter`, 'rename the filter');
    if (!isObj(f)) { say(at, null, 'a filter must be an object with a when', 'write {"description": "...", "when": <condition>}'); continue; }
    keys(f, 'filter', at);
    if (!has(f, 'when')) say(at, null, 'the filter has no when', 'add "when": <condition>');
    else guarded(`${at}.when`, null, say, () => cond(f.when, `${at}.when`, { rule: null, it: false, nest: false }));
  }
}

// Warnings: a role or a field nothing reads, a step no rule allows, a step pop offers whose rules take an argument. They never refuse.
const everyString = (x, out = []) => { if (typeof x === 'string') out.push(x); else if (x && typeof x === 'object') Object.values(x).forEach(v => everyString(v, out)); return out; };

function warn(entry, say) {
  const { rules, people, item } = entry;
  const table = Array.isArray(rules.table) ? rules.table.filter(isObj) : [];
  const pops = Array.isArray(rules.pop) ? rules.pop.filter(isObj) : [];
  const filters = isObj(rules.filters) ? Object.values(rules.filters).filter(isObj) : [];
  try {
    const whens = [...table, ...pops, ...filters].map(r => r.when);
    const literals = new Set(everyString(whens));
    const read = new Set(['status']);
    for (const s of everyString([table, pops, filters])) for (const [, f] of s.matchAll(/\$(?:item|it)\.([a-z0-9_-]+)/g)) read.add(f);
    if (isObj(people)) {
      const seen = new Set();
      for (const [name, roles] of Object.entries(people)) for (const r of Array.isArray(roles) ? roles : []) if (typeof r === 'string' && !seen.has(r) && seen.add(r) && !literals.has(r)) say(`people.${name}`, null, `the role ${r} is read by no rule, pop entry or filter`, 'remove it, or keep it as documentation', 'warning');
    }
    if (isObj(item)) for (const f of Object.keys(item)) if (!read.has(f) && !ENVELOPE.includes(f)) say(`item.${f}`, null, `${f} is read by no rule`, 'data only is allowed; nothing reads it', 'warning');
    // Per step word: the first rule that names it; the words of the rules that allow, and whether one of them is for every step.
    const first = new Map(); const allowed = new Set(); let allowAll = false;
    rules.table.forEach((r, n) => {
      if (!isObj(r)) return;
      for (const w of stepWords(r)) { if (!first.has(w)) first.set(w, n); if (has(r, 'do')) { if (w === '*') allowAll = true; else allowed.add(w); } }
    });
    if (!allowAll) for (const [w, n] of first) if (w !== '*' && !allowed.has(w)) say(`rules.table[${n}]`, typeof rules.table[n].id === 'string' ? rules.table[n].id : null, `no rule allows the step ${w}; it is always refused`, 'add a rule with do, or remove the step', 'warning');
    offered(rules, table, say);
  } catch { /* nested too deeply: the rule check reports it */ }
}

// The arguments the rules of a step read. Pop passes none, so a step it offers fails for the whole team (exit 2) when an allowing rule writes an argument into a field, and
// a condition that reads an argument can only refuse. Each rule is walked once and each distinct pop step is merged once.
function offered(rules, table, say) {
  if (!Array.isArray(rules.pop)) return;
  const alone = r => ({ rules: { table: [{ ...r, step: '*' }] } });
  const writes = r => ({ step: '*', do: { set: r.do?.set, add: r.do?.add, remove: r.do?.remove, related: Array.isArray(r.do?.related) ? r.do.related.map(e => ({ set: e?.set, add: e?.add, remove: e?.remove })) : undefined } });
  const star = { all: new Set(), write: new Set() }; const byWord = new Map();
  for (const r of table) {
    if (!has(r, 'do') || !isObj(r.do)) continue;
    const all = stepArgs(alone(r), 'x'); const write = new Set(stepArgs(alone(writes(r)), 'x'));
    for (const w of stepWords(r)) {
      const t = w === '*' ? star : byWord.get(w) ?? byWord.set(w, { all: new Set(), write: new Set() }).get(w);
      all.forEach(a => t.all.add(a)); write.forEach(a => t.write.add(a));
    }
  }
  const merged = new Map();
  const of = w => merged.get(w) ?? merged.set(w, { all: new Set([...star.all, ...(byWord.get(w)?.all ?? [])]), write: new Set([...star.write, ...(byWord.get(w)?.write ?? [])]) }).get(w);
  rules.pop.forEach((o, n) => {
    if (!isObj(o) || typeof o.step !== 'string' || !o.step) return;
    const id = typeof o.id === 'string' ? o.id : null; const { all, write } = of(o.step);
    for (const a of all) {
      if (write.has(a)) say(`rules.pop[${n}]`, id, `pop cannot give --${a} to the step ${o.step}, and a rule writes it into a field: the step would stop the command with exit 2 for the whole team`, `give the field a value that needs no argument, or remove the step ${o.step} from pop`);
      else say(`rules.pop[${n}]`, id, `pop cannot give --${a} to the step ${o.step}; the pop entry can only be refused`, 'a pop entry offers a step that needs no argument', 'warning');
    }
  });
}
