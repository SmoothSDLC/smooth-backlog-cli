// Throwaway spike of the team rules evaluator (design chapter 03). Plain Node, no dependency. It proves the size of the idea;
// it is not the implementation: no files, no git, no index writes. An item is { seq, slug, name, team, repository, branch,
// archived, fields: {...} }; a team entry is { people, item, rules: { table, pop, filters } } as in design chapter 01.
const ENVELOPE = ['seq', 'slug', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by', 'archived'];
const LIST = ['items', 'list'];
const TESTS = ['all', 'any', 'not', 'is', 'in', 'empty', '>=', '<=', 'regex', 'every', 'some'];
const FUNCTIONS = ['count', 'length', 'plus', 'age', 'roles_of'];
const EFFECTS = ['set', 'add', 'remove', 'note', 'related', 'place', 'archive', 'delete', 'branch', 'team', 'say'];
export class Refusal extends Error { constructor(text, exit = 1, rule = null) { super(text); this.exit = exit; this.rule = rule; } }

const get = (item, name) => (item == null ? undefined : ENVELOPE.includes(name) ? item[name] : item.fields?.[name]);
const asList = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
const num = v => (v === '' || v == null || typeof v === 'boolean' ? NaN : Number(v));

function ref(path, ctx) {
  const [root, ...rest] = path.slice(1).split('.');
  const name = rest.join('.');
  if (root === 'item') return get(ctx.item, name);
  if (root === 'it') return get(ctx.it, name);
  if (root === 'arg') return ctx.args?.[name] ?? '';
  if (root === 'caller') return name === 'roles' ? ctx.entry.people[ctx.caller] ?? [] : ctx.caller;
  if (root === 'session') return ctx.session?.[name] ?? '';
  if (root === 'now') return ctx.now;
  if (root === 'team' && name === 'name') return ctx.team;
  if (root === 'team' && name === 'items') return ctx.items.filter(i => i.team === ctx.team && !i.archived).map(i => i.seq);
  throw new Refusal(`unknown reference ${path}`, 2);
}

export function value(v, ctx) {
  if (typeof v === 'string') return v.startsWith('$') ? ref(v, ctx) : v;
  if (Array.isArray(v)) return v.map(x => value(x, ctx));
  if (!v || typeof v !== 'object') return v;
  const [[op, a]] = Object.entries(v);
  if (op === 'text') return a;
  if (op === 'count') return related(a.items, ctx).filter(it => test(a.match ?? { all: [] }, { ...ctx, it })).length;
  if (op === 'length') return asList(value(a, ctx)).length;
  if (op === 'plus') return value(a, ctx).reduce((s, x) => s + (num(x) || 0), 0);
  if (op === 'age') { const t = Date.parse(value(a, ctx)); return Number.isNaN(t) ? null : (Date.parse(ctx.now) - t) / 1000; }
  if (op === 'roles_of') return ctx.entry.people[value(a, ctx)] ?? [];
  throw new Refusal(`unknown function ${op}`, 2);
}

// The items a list-valued expression names: a number, a list of numbers, or $team.items; a missing item is { seq, missing: true }.
const related = (expr, ctx) => asList(value(expr, ctx)).map(s => ctx.items.find(i => i.seq === num(s)) ?? { seq: num(s), missing: true, fields: {} });

export function test(c, ctx) {
  const [[op, a]] = Object.entries(c);
  const v = x => value(x, ctx);
  switch (op) {
    case 'all': return a.every(x => test(x, ctx));
    case 'any': return a.some(x => test(x, ctx));
    case 'not': return !test(a, ctx);
    case 'is': return JSON.stringify(v(a[0])) === JSON.stringify(v(a[1]));
    case 'in': return asList(v(a[1])).some(x => JSON.stringify(x) === JSON.stringify(v(a[0])));
    case 'empty': { const x = v(a); return x == null || x === '' || (Array.isArray(x) && !x.length); }
    case '>=': return num(v(a[0])) >= num(v(a[1]));
    case '<=': return num(v(a[0])) <= num(v(a[1]));
    case 'regex': return new RegExp(a[1]).test(String(v(a[0]) ?? ''));
    case 'every': return related(a.items, ctx).every(it => test(a.match, { ...ctx, it }));
    case 'some': return related(a.items, ctx).some(it => test(a.match, { ...ctx, it }));
    default: throw new Refusal(`unknown test ${op}`, 2);
  }
}

const fill = (text, ctx) => text.replace(/\{(\$[a-z_.]+)\}/g, (_, p) => { const x = value(p, ctx); return Array.isArray(x) ? x.join(', ') : String(x ?? ''); });
const stepMatches = (s, step) => asList(s).includes('*') || asList(s).includes(step);

// The routing table: the first rule whose step and condition match decides; no match is the coded default refusal.
export function decide(ctx) {
  const rules = ctx.entry.rules.table;
  for (let n = 0; n < rules.length; n++) {
    const r = rules[n];
    if (!stepMatches(r.step, ctx.step) || (r.when && !test(r.when, ctx))) continue;
    return 'deny' in r ? { allowed: false, rule: r.id, text: fill(r.deny, ctx) } : { allowed: true, rule: r.id, do: r.do ?? {} };
  }
  return { allowed: false, rule: null, text: `no rule of team ${ctx.team} allows the step ${ctx.step} on item ${ctx.item.seq}` };
}

// A value written into a field takes the field's type (machinery, not a rule): a wrong value is invalid input (exit 2).
function typed(entry, field, v) {
  const def = entry.item[field];
  const bad = why => { throw new Refusal(`field ${field}: ${JSON.stringify(v)} ${why}`, 2); };
  let out = v;
  if (def.type === 'number') { out = num(v); if (Number.isNaN(out)) bad('is not a number'); }
  else if (def.type === 'boolean') out = v === true || v === 'true';
  else if (def.type === 'item') out = v === '' || v == null ? null : num(v);
  else if (LIST.includes(def.type)) out = (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : asList(v)).map(x => (def.type === 'items' ? num(x) : String(x)));
  else out = v == null ? '' : String(v);
  if (def.type === 'person' && out && !(out in entry.people)) bad(`is not a person of the team (${Object.keys(entry.people).join(', ')})`);
  if (def.type === 'item' && Number.isNaN(out)) bad('is not an item number');
  if (def.type === 'items' && out.some(Number.isNaN)) bad('is not a list of item numbers');
  if (def.values && !asList(out).every(x => def.values.includes(x))) bad(`is not one of ${def.values.join(', ')}`);
  return out;
}

// Every value of an effect is computed on the item as it was before the step; then the changes are made on copies.
function changes(entry, spec, ctx, it) {
  const out = [];
  for (const kind of ['set', 'add', 'remove']) for (const [f, x] of Object.entries(spec[kind] ?? {})) out.push([kind, f, value(x, { ...ctx, it })]);
  return out;
}
function change(entry, item, list) {
  const next = { ...item, fields: { ...item.fields } };
  for (const [kind, f, v] of list) {
    if (kind === 'set') next.fields[f] = typed(entry, f, v);
    else {
      const cur = asList(next.fields[f]); const vs = typed(entry, f, asList(v));
      next.fields[f] = kind === 'add' ? [...cur, ...vs.filter(x => !cur.includes(x))] : cur.filter(x => !vs.includes(x));
    }
  }
  return next;
}

// The arguments a step takes are the $arg names its rules read (and --name for new): no declaration of its own.
export function stepArgs(entry, name) {
  const found = new Set(name === 'new' ? ['name'] : []);
  const walk = n => { if (typeof n === 'string') { const m = /^\$arg\.(.+)$/.exec(n); if (m) found.add(m[1]); } else if (n && typeof n === 'object') Object.values(n).forEach(walk); };
  entry.rules.table.filter(r => stepMatches(r.step, name)).forEach(walk);
  return [...found].sort();
}

// One team step on one item: the coded checks, the table, the effects. Returns the changed items; throws a Refusal.
export function step(ctx) {
  const { item, entry } = ctx;
  const takes = stepArgs(entry, ctx.step);
  for (const k of Object.keys(ctx.args ?? {})) if (!takes.includes(k)) throw new Refusal(`the step ${ctx.step} of team ${ctx.team} takes no --${k} (it takes: ${takes.map(a => `--${a}`).join(', ') || 'no argument'})`, 2);
  if (item.archived) throw new Refusal(`item ${item.seq} is archived; archived items take no step`);
  if (item.team && item.team !== ctx.team) throw new Refusal(`item ${item.seq} belongs to team ${item.team}; team ${ctx.team} acts only on its own items and on items without a team`);
  if (!(ctx.caller in entry.people)) throw new Refusal(`${ctx.caller} is not a person of team ${ctx.team} (${Object.keys(entry.people).join(', ')})`);
  const d = decide(ctx);
  if (!d.allowed) throw new Refusal(`${d.text}${d.rule ? ` (rule ${d.rule})` : ''}`, 1, d.rule);
  if (!item.team && (d.do.team === undefined || value(d.do.team, ctx) !== ctx.team)) throw new Refusal(`item ${item.seq} belongs to no team; only a rule that binds it to team ${ctx.team} may change it (rule ${d.rule} does not)`, 1, d.rule);
  const own = changes(entry, d.do, ctx, item);
  const others = (d.do.related ?? []).flatMap(r => related(r.items, ctx).map(it => [it, changes(entry, r, ctx, it)]));
  let next = change(entry, !item.team ? { ...item, fields: { ...defaults(entry), ...item.fields } } : item, own); // a bound item gets the fields it lacks
  if (d.do.team !== undefined) { next.team = value(d.do.team, ctx); if (![ctx.team, ''].includes(next.team)) throw new Refusal(`rule ${d.rule} may bind an item only to team ${ctx.team} or to no team`, 2, d.rule); }
  if (d.do.branch !== undefined) next.branch = value(d.do.branch, ctx);
  if (d.do.archive) next.archived = true;
  if (d.do.note) next.notes = [...(item.notes ?? []), { heading: d.do.note.heading, text: value(d.do.note.text, ctx), by: ctx.caller }];
  const out = new Map([[item.seq, next]]);
  for (const [it, list] of others) {
    if (it.missing) throw new Refusal(`item ${it.seq} does not exist (rule ${d.rule})`, 1, d.rule);
    if (it.team !== ctx.team || it.archived) throw new Refusal(`item ${it.seq} is not a live item of team ${ctx.team}; rule ${d.rule} cannot change it`, 1, d.rule);
    out.set(it.seq, change(entry, out.get(it.seq) ?? it, list));
  }
  for (const it of out.values()) for (const [f, def] of Object.entries(entry.item)) // referential integrity of item fields (machinery)
    for (const s of def.type === 'item' || def.type === 'items' ? asList(it.fields[f]) : []) if (!ctx.items.some(i => i.seq === s) && s !== it.seq) throw new Refusal(`field ${f} of item ${it.seq}: no item ${s}`, 2);
  const p = d.do.place;
  return { rule: d.rule, items: out, say: d.do.say ? fill(d.do.say, ctx) : null, place: p && typeof p === 'object' ? Object.fromEntries(Object.entries(p).map(([k, x]) => [k, value(x, ctx)])) : p ?? null, delete: Boolean(d.do.delete) };
}

const defaults = entry => Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, d.default ?? (LIST.includes(d.type) ? [] : d.type === 'item' ? null : '')]));

// backlog team new: a fresh item from the item definition, a number from the counter, then the table's step "new".
export function create(ctx, state) {
  const seq = Math.max(state.last ?? 0, ...ctx.items.map(i => i.seq)) + 1;
  const fields = defaults(ctx.entry);
  const item = { seq, slug: `${String(seq).padStart(3, '0')}-${String(ctx.args.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: ctx.args.name, team: ctx.team, repository: ctx.session?.repository ?? '', branch: ctx.session?.branch ?? '', archived: false, fields };
  const r = step({ ...ctx, step: 'new', item, items: [...ctx.items, item] });
  state.last = seq;
  return r;
}

// backlog team pop: the first entry of the pop table, in order, whose step the table allows on an item of the team queue.
export function pop(ctx) {
  if (!(ctx.caller in ctx.entry.people)) throw new Refusal(`${ctx.caller} is not a person of team ${ctx.team} (${Object.keys(ctx.entry.people).join(', ')})`);
  const queue = ctx.order.map(s => ctx.items.find(i => i.seq === s)).filter(i => i && i.team === ctx.team && !i.archived);
  for (const offer of ctx.entry.rules.pop ?? []) for (const item of queue) {
    const c = { ...ctx, item, step: offer.step, args: {} };
    if (offer.when && !test(offer.when, c)) continue;
    if (decide(c).allowed) return { action: offer.step, item: item.seq, entry: offer.id };
  }
  return { action: 'idle' };
}

export const filter = (ctx, name) => ctx.items.filter(i => i.team === ctx.team && !i.archived && test(ctx.entry.rules.filters[name].when, { ...ctx, item: i })).map(i => i.seq);

// Coded CLI behaviour: the team of a team command, and what a user command can see.
export function resolveTeam({ flags = {}, env = {}, config = {} }) {
  const team = flags.team || env.TEAM_NAME || config.team;
  if (!team) throw new Refusal('a team command needs a team: give --team <name>, or set the TEAM_NAME variable, or set the "team" key in .backlog/config.json', 2);
  return team;
}
export const resolveAgent = ({ flags = {}, env = {} }) => {
  const agent = flags.agent || env.BACKLOG_AGENT;
  if (!agent) throw new Refusal('this team command needs the agent: give --agent <name>, or set the BACKLOG_AGENT variable', 2);
  return agent;
};
export function userShow(items, n) {
  const item = items.find(i => i.seq === Number(n) && !i.team);
  if (!item) throw new Refusal(`no phase '${n}'`);
  return item;
}

// ---- backlog team validate (the checks the spike proves; chapter 08 lists all of them)
export function validate(file) {
  const out = [];
  const say = (team, path, rule, problem, fix) => out.push({ team, path, rule, problem, fix });
  for (const [team, e] of Object.entries(file)) {
    const roles = new Set(Object.values(e.people ?? {}).flat());
    if (!e.people || !Object.keys(e.people).length) say(team, 'people', null, 'the team has no person', 'add "people": {"<name>": ["<role>"]}');
    for (const [f, d] of Object.entries(e.item ?? {})) {
      if (ENVELOPE.includes(f)) say(team, `item.${f}`, null, `${f} is a key every item has already`, 'choose another field name');
      if (!['text', 'number', 'boolean', 'time', 'person', 'item', 'items', 'list'].includes(d.type)) say(team, `item.${f}.type`, null, `unknown type ${d.type}`, 'use text, number, boolean, time, person, item, items or list');
    }
    if (!e.item?.status?.values) say(team, 'item.status', null, 'the item definition has no status field with values', 'add "status": {"type": "text", "values": [...], "final": [...]}');
    const ids = new Set(); const steps = e.rules?.table ?? [];
    const walk = (node, path, rule, inQuantifier) => {
      if (typeof node === 'string' && node.startsWith('$')) {
        const [root, name] = node.slice(1).split('.');
        if (['item', 'it'].includes(root) && !ENVELOPE.includes(name) && !(name in (e.item ?? {}))) say(team, path, rule, `${node} names no field of the item definition`, `add ${name} to ${team}.item or name one of ${Object.keys(e.item ?? {}).join(', ')}`);
        if (root === 'it' && !inQuantifier) say(team, path, rule, `${node} is used outside every, some or count`, 'use $item for the item of the step');
      } else if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${path}[${i}]`, rule, inQuantifier));
      else if (node && typeof node === 'object') {
        for (const [k, x] of Object.entries(node)) {
          if (['every', 'some', 'count'].includes(k) && inQuantifier) say(team, `${path}.${k}`, rule, `${k} inside another every, some or count`, 'a rule reads one hop of related items; split it into two rules');
          if (k === 'regex') { try { new RegExp(x[1]); } catch (err) { say(team, `${path}.regex`, rule, `not a regular expression (${err.message})`, 'correct the pattern'); } }
          if (k === 'in' && x[1] === '$caller.roles' && typeof x[0] === 'string' && !roles.has(x[0])) say(team, `${path}.in`, rule, `no person has the role ${x[0]}`, `give a person the role or use one of ${[...roles].join(', ')}`);
          if (['is', 'in'].includes(k)) { const fieldRef = typeof x[0] === 'string' && /^\$(item|it)\./.test(x[0]) ? x[0].split('.')[1] : null; const allowed = e.item?.[fieldRef]?.values;
            if (allowed) for (const lit of asList(x[1]).filter(l => typeof l === 'string' && !l.startsWith('$'))) if (!allowed.includes(lit)) say(team, `${path}.${k}`, rule, `${lit} is not a value of ${fieldRef} (${allowed.join(', ')})`, `use a value of ${fieldRef} or add ${lit} to its values`); }
          walk(x, `${path}.${k}`, rule, inQuantifier || ['every', 'some', 'count'].includes(k));
        }
      }
    };
    steps.forEach((r, n) => {
      const at = `rules.table[${n}]`;
      if (!r.id || ids.has(r.id)) say(team, at, r.id ?? null, r.id ? `the id ${r.id} is used twice` : 'the rule has no id', 'give every rule its own id');
      ids.add(r.id);
      if (('deny' in r) === ('do' in r)) say(team, at, r.id, 'a rule has exactly one outcome: deny or do', 'keep one of deny and do');
      if (r.when) walk(r.when, `${at}.when`, r.id, false);
      for (const k of Object.keys(r.do ?? {})) if (!EFFECTS.includes(k)) say(team, `${at}.do.${k}`, r.id, `unknown effect ${k}`, `use one of ${EFFECTS.join(', ')}`);
      for (const kind of ['set', 'add', 'remove']) for (const [f, x] of Object.entries(r.do?.[kind] ?? {})) {
        if (!(f in (e.item ?? {}))) say(team, `${at}.do.${kind}.${f}`, r.id, `${f} is no field of the item definition`, `add ${f} to ${team}.item`);
        else if (kind !== 'set' && !LIST.includes(e.item[f].type)) say(team, `${at}.do.${kind}.${f}`, r.id, `${kind} needs a list field; ${f} is ${e.item[f].type}`, 'use set');
        else if (typeof x === 'string' && !x.startsWith('$') && e.item[f].values && !e.item[f].values.includes(x)) say(team, `${at}.do.${kind}.${f}`, r.id, `${x} is not a value of ${f}`, `use one of ${e.item[f].values.join(', ')}`);
        walk(x, `${at}.do.${kind}.${f}`, r.id, false);
      }
      // routing-table shadowing: an earlier rule that matches every step and every case this rule matches hides it
      const clauses = x => (!x ? [] : x.all ? x.all.map(c => JSON.stringify(c)) : [JSON.stringify(x)]);
      const earlier = steps.slice(0, n).find(p => asList(r.step).every(s => stepMatches(p.step, s)) && clauses(p.when).every(c => clauses(r.when).includes(c)));
      if (earlier) say(team, at, r.id, `rule ${r.id} can never decide: rule ${earlier.id} above it matches every case it matches`, `move ${r.id} above ${earlier.id}, or narrow ${earlier.id}`);
    });
    const named = new Set(steps.flatMap(r => asList(r.step)));
    (e.rules?.pop ?? []).forEach((o, n) => {
      if (!named.has(o.step)) say(team, `rules.pop[${n}]`, o.id ?? null, `no rule names the step ${o.step}`, 'name a step of rules.table');
      if (o.when) walk(o.when, `rules.pop[${n}].when`, o.id ?? null, false);
    });
    for (const [name, v] of Object.entries(e.rules?.filters ?? {})) walk(v.when, `rules.filters.${name}.when`, null, false);
  }
  return out;
}
export const SPIKE = { TESTS, FUNCTIONS, EFFECTS };
