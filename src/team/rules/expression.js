// The expression layer of the team rules language (conditions, values and references, texts): reading an item, the closed list of references, the
// functions, the ten tests, items and the foreign form, placeholders. Pure: it reads `ctx` and nothing else (no file, no store, no table, no effect).
// An item is { seq, slug, name, team, repository, branch, archived, body, fields }; ctx = { entry, team, caller, items, args, session, now, item, it }.
import { BacklogError } from '../../errors.js';
import { compile } from './safe-regex.js';

const ENVELOPE = ['seq', 'slug', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by', 'archived', 'body'];
export const LIST = ['items', 'list'];
const NAMES = { caller: ['', 'roles'], session: ['id', 'repository', 'branch', 'commit'] };
const PAIR = ['is', 'in', '>=', '<=', 'regex', 'contains'];
export const FOREIGN = /^([\w.-]+\/[\w.-]+)#(\d+)$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

// exit 1 is a refusal of a step; exit 2 is a rule file that is wrong (it skipped validation). `rule` is the id of the rule that refused, when known.
export class Refusal extends BacklogError {
  constructor(text, exit = 1, rule = null) { super(exit === 2 ? 'RULE_INVALID' : 'RULE_REFUSED', text, exit); this.rule = rule; }
}

export const asList = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
// Only a decimal literal is a number: " ", "0x3C" and "1e3" are not.
export const num = v => (typeof v === 'number' ? v : typeof v === 'string' && DECIMAL.test(v.trim()) ? Number(v) : NaN);
export const defaultOf = d => (d.default !== undefined ? d.default : LIST.includes(d.type) ? [] : d.type === 'item' ? null : d.type === 'number' ? 0 : d.type === 'boolean' ? false : '');
// A field the item lacks reads as its definition's default.
export const get = (item, name, entry) => (item == null ? undefined : ENVELOPE.includes(name) ? item[name]
  : item.fields && name in item.fields ? item.fields[name] : item.missing || !entry?.item[name] ? undefined : defaultOf(entry.item[name]));
// Equality across an argument (text) and a typed value ("2" equals 2); lists are compared entry by entry.
export const same = (a, b) => (Array.isArray(a) || Array.isArray(b) ? Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]))
  : typeof a === 'number' && typeof b === 'string' ? a === num(b) : typeof b === 'number' && typeof a === 'string' ? b === num(a) : a === b);
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
export const one = (o, kind) => {
  if (!isObj(o)) throw new Refusal(`a ${kind} must be an object with exactly one key`, 2);
  const k = Object.keys(o); if (k.length !== 1) throw new Refusal(`a ${kind} has exactly one key (found ${k.join(', ') || 'none'})`, 2);
  return [k[0], o[k[0]]];
};

function ref(path, ctx) {
  const [root, ...rest] = path.slice(1).split('.');
  const name = rest.join('.');
  if (root === 'item') return get(ctx.item, name, ctx.entry);
  if (root === 'it') return get(ctx.it, name, ctx.entry);
  if (root === 'arg') return ctx.args?.[name] ?? '';
  if (root === 'caller' && NAMES.caller.includes(name)) return name === 'roles' ? ctx.entry.people[ctx.caller] ?? [] : ctx.caller;
  if (root === 'session' && NAMES.session.includes(name)) return ctx.session?.[name] ?? '';
  if (root === 'now' && name === '') return ctx.now;
  if (root === 'team' && name === 'name') return ctx.team;
  // The repository is the folder acted on (the repository input), which may differ from the checkout's.
  if (root === 'team' && name === 'items') return ctx.items.filter(i => i.team === ctx.team && !i.archived && i.repository === ctx.session?.repository).map(i => i.seq);
  throw new Refusal(`unknown reference ${path}`, 2);
}

// every, some and count look at related items one level deep; a match inside a match is refused (the cost bound of a file anyone can push).
const inMatch = (op, a, ctx) => {
  if (!isObj(a) || !('items' in a) || (op !== 'count' && !('match' in a))) throw new Refusal(op === 'count' ? 'count takes an object with items (match optional)' : `${op} takes an object with items and match`, 2);
  if (ctx.quant) throw new Refusal('every, some and count cannot be nested', 2); return related(a.items, ctx).map(it => ({ ...ctx, it, quant: true })); };

export function value(v, ctx) {
  if (typeof v === 'string') return v.startsWith('$') ? ref(v, ctx) : v;
  if (Array.isArray(v)) return v.map(x => value(x, ctx));
  if (!v || typeof v !== 'object') return v;
  const [op, a] = one(v, 'function');
  if (op === 'text') return a;
  if (op === 'count') return inMatch('count', a, ctx).filter(c => test(a.match ?? { all: [] }, c)).length;
  if (op === 'length') return asList(value(a, ctx)).length;
  if (op === 'plus') { if (!Array.isArray(a)) throw new Refusal('plus takes a list of values', 2); return value(a, ctx).reduce((s, x) => s + (num(x) || 0), 0); }
  if (op === 'age') { const t = Date.parse(value(a, ctx)); return Number.isNaN(t) ? null : (Date.parse(ctx.now) - t) / 1000; }
  if (op === 'roles_of') return ctx.entry.people[value(a, ctx)] ?? [];
  throw new Refusal(`unknown function ${op}`, 2);
}

// The items a value names: numbers of the step's repository folder, or owner/name#seq of another folder (read only). A missing item reads
// as an item with no fields.
export const find = (ctx, s) => {
  const f = FOREIGN.exec(String(s));
  const [repo, seq] = f ? [f[1], Number(f[2])] : [ctx.session?.repository, num(s)];
  return ctx.items.find(i => i.seq === seq && i.repository === repo) ?? { seq, repository: repo, missing: true, fields: {} };
};
export const related = (expr, ctx) => asList(value(expr, ctx)).map(s => find(ctx, s));

// Compiled patterns are kept by their text; a pattern the matcher refuses is a wrong rule file (exit 2).
const patterns = new Map();
// For tests only: how many compiled patterns are held.
export const patternCacheSize = () => patterns.size;
const regex = src => {
  if (!patterns.has(src)) {
    try { patterns.set(src, compile(src)); } catch (e) { throw new Refusal(`regex: ${e.message}`, 2); }
  }
  return patterns.get(src);
};

export function test(c, ctx) {
  const [op, a] = one(c, 'condition');
  if (PAIR.includes(op) && !(Array.isArray(a) && a.length === 2)) throw new Refusal(`${op} takes a list of two values`, 2);
  const v = x => value(x, ctx);
  switch (op) {
    case 'all': if (!Array.isArray(a)) throw new Refusal('all takes a list of conditions', 2); return a.every(x => test(x, ctx));
    case 'any': if (!Array.isArray(a)) throw new Refusal('any takes a list of conditions', 2); return a.some(x => test(x, ctx));
    case 'not': if (!isObj(a)) throw new Refusal('not takes one condition', 2); return !test(a, ctx);
    case 'is': return same(v(a[0]), v(a[1]));
    case 'in': return asList(v(a[1])).some(x => same(x, v(a[0])));
    case 'empty': { const x = v(a); return x == null || (typeof x === 'string' && !x.trim()) || (Array.isArray(x) && !x.length); }
    case '>=': return num(v(a[0])) >= num(v(a[1]));
    case '<=': return num(v(a[0])) <= num(v(a[1]));
    case 'regex': return regex(a[1])(v(a[0]));
    case 'contains': { const text = String(v(a[0]) ?? ''); return asList(v(a[1])).some(x => String(x) && text.includes(String(x))); }
    case 'every': return inMatch('every', a, ctx).every(x => test(a.match, x));
    case 'some': return inMatch('some', a, ctx).some(x => test(a.match, x));
    default: throw new Refusal(`unknown test ${op}`, 2);
  }
}

// A text may carry placeholders {$reference}; a list is joined with ", ".
export const fill = (text, ctx) => text.replace(/\{(\$[a-z0-9_.-]+)\}/g, (_, p) => { const x = value(p, ctx); return Array.isArray(x) ? x.join(', ') : String(x ?? ''); });
export const stepMatches = (s, step) => asList(s).includes('*') || asList(s).includes(step);
