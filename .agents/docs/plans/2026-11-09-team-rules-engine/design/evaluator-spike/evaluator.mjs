// Throwaway spike of the team rules evaluator (design chapter 03). Plain Node, no dependency. It proves the size of the idea; it is not
// the implementation: no files, no git (numbers.mjs is the git part of numbers), no index. An item is { seq, slug, name, team, repository,
// branch, archived, body, fields: {...} }; a team entry is { people, item, rules: { table, pop, filters } } as in chapter 01.
import { compile } from './safe-regex.mjs';

const ENVELOPE = ['seq', 'slug', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by', 'archived', 'body'];
const TYPES = ['text', 'number', 'boolean', 'time', 'person', 'item', 'items', 'list'];
const LIST = ['items', 'list'];
const TESTS = ['all', 'any', 'not', 'is', 'in', 'empty', '>=', '<=', 'regex', 'contains', 'every', 'some'];
const FUNCTIONS = ['count', 'length', 'plus', 'age', 'roles_of', 'text'];
const QUANT = ['every', 'some', 'count'];
// The schema of a team entry: every object kind with its allowed keys (validate refuses any other key, naming the closest one).
const KEYS = {
  entry: ['people', 'item', 'rules'], rules: ['table', 'pop', 'filters'], field: ['type', 'description', 'default', 'values', 'final'],
  rule: ['id', 'step', 'when', 'deny', 'do'], pop: ['id', 'step', 'when'], filter: ['description', 'when'],
  do: ['set', 'add', 'remove', 'note', 'related', 'place', 'archive', 'delete', 'branch', 'team', 'say'],
  related: ['items', 'set', 'add', 'remove'], note: ['heading', 'text'], place: ['before', 'after'],
};
const LABEL = { entry: 'a team entry', rules: 'rules', field: 'a field definition', rule: 'a rule', pop: 'a pop entry', filter: 'a filter', do: 'an effect list', related: 'a related entry', note: 'a note', place: 'a place' };
const NAMES = { caller: ['', 'roles'], session: ['id', 'repository', 'branch', 'commit'], team: ['name', 'items'], now: [''] };
const RESERVED_ARGS = ['team', 'agent', 'session', 'repository', 'branch', 'json', 'dry-run', 'help', 'version'];
const NAME = /^[a-z][a-z0-9_-]*$/;
const FOREIGN = /^([\w.-]+\/[\w.-]+)#(\d+)$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
export class Refusal extends Error { constructor(text, exit = 1, rule = null) { super(text); this.exit = exit; this.rule = rule; } }

const asList = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
// Only a decimal literal is a number: " ", "0x3C" and "1e3" are not.
const num = v => (typeof v === 'number' ? v : typeof v === 'string' && DECIMAL.test(v.trim()) ? Number(v) : NaN);
const defaultOf = d => (d.default !== undefined ? d.default : LIST.includes(d.type) ? [] : d.type === 'item' ? null : d.type === 'number' ? 0 : d.type === 'boolean' ? false : '');
// A field the item lacks reads as its definition's default (decision D-32).
const get = (item, name, entry) => (item == null ? undefined : ENVELOPE.includes(name) ? item[name]
  : item.fields && name in item.fields ? item.fields[name] : item.missing || !entry?.item[name] ? undefined : defaultOf(entry.item[name]));
// Equality across an argument (text) and a typed value: "2" equals 2 when "2" is a decimal literal.
const same = (a, b) => (Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b)
  : typeof a === 'number' && typeof b === 'string' ? a === num(b) : typeof b === 'number' && typeof a === 'string' ? b === num(a) : a === b);
const one = (o, kind) => { const k = Object.keys(o); if (k.length !== 1) throw new Refusal(`a ${kind} has exactly one key (found ${k.join(', ') || 'none'})`, 2); return [k[0], o[k[0]]]; };

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
  if (root === 'team' && name === 'items') return ctx.items.filter(i => i.team === ctx.team && !i.archived && i.repository === ctx.session.repository).map(i => i.seq);
  throw new Refusal(`unknown reference ${path}`, 2);
}

export function value(v, ctx) {
  if (typeof v === 'string') return v.startsWith('$') ? ref(v, ctx) : v;
  if (Array.isArray(v)) return v.map(x => value(x, ctx));
  if (!v || typeof v !== 'object') return v;
  const [op, a] = one(v, 'function');
  if (op === 'text') return a;
  if (op === 'count') return related(a.items, ctx).filter(it => test(a.match ?? { all: [] }, { ...ctx, it })).length;
  if (op === 'length') return asList(value(a, ctx)).length;
  if (op === 'plus') return value(a, ctx).reduce((s, x) => s + (num(x) || 0), 0);
  if (op === 'age') { const t = Date.parse(value(a, ctx)); return Number.isNaN(t) ? null : (Date.parse(ctx.now) - t) / 1000; }
  if (op === 'roles_of') return ctx.entry.people[value(a, ctx)] ?? [];
  throw new Refusal(`unknown function ${op}`, 2);
}

// The items a value names: numbers of the step's repository folder, or owner/name#seq of another folder (read only). A missing item reads
// as an item with no fields.
const find = (ctx, s) => {
  const f = FOREIGN.exec(String(s));
  const [repo, seq] = f ? [f[1], Number(f[2])] : [ctx.session.repository, num(s)];
  return ctx.items.find(i => i.seq === seq && i.repository === repo) ?? { seq, repository: repo, missing: true, fields: {} };
};
const related = (expr, ctx) => asList(value(expr, ctx)).map(s => find(ctx, s));

export function test(c, ctx) {
  const [op, a] = one(c, 'condition');
  const v = x => value(x, ctx);
  switch (op) {
    case 'all': return a.every(x => test(x, ctx));
    case 'any': return a.some(x => test(x, ctx));
    case 'not': return !test(a, ctx);
    case 'is': return same(v(a[0]), v(a[1]));
    case 'in': return asList(v(a[1])).some(x => same(x, v(a[0])));
    case 'empty': { const x = v(a); return x == null || (typeof x === 'string' && !x.trim()) || (Array.isArray(x) && !x.length); }
    case '>=': return num(v(a[0])) >= num(v(a[1]));
    case '<=': return num(v(a[0])) <= num(v(a[1]));
    case 'regex': return compile(a[1])(v(a[0]));
    case 'contains': { const text = String(v(a[0]) ?? ''); return asList(v(a[1])).some(x => String(x) && text.includes(String(x))); }
    case 'every': return related(a.items, ctx).every(it => test(a.match, { ...ctx, it }));
    case 'some': return related(a.items, ctx).some(it => test(a.match, { ...ctx, it }));
    default: throw new Refusal(`unknown test ${op}`, 2);
  }
}

const fill = (text, ctx) => text.replace(/\{(\$[a-z0-9_.-]+)\}/g, (_, p) => { const x = value(p, ctx); return Array.isArray(x) ? x.join(', ') : String(x ?? ''); });
const stepMatches = (s, step) => asList(s).includes('*') || asList(s).includes(step);

// The routing table: the first rule whose step and condition match decides; no match is the coded default refusal.
export function decide(ctx) {
  for (const r of ctx.entry.rules.table) {
    if (!stepMatches(r.step, ctx.step) || (r.when && !test(r.when, ctx))) continue;
    return 'deny' in r ? { allowed: false, rule: r.id, text: fill(r.deny, ctx) } : { allowed: true, rule: r.id, do: r.do ?? {} };
  }
  return { allowed: false, rule: null, text: `no rule of team ${ctx.team} allows the step ${ctx.step} on item ${ctx.item.seq}` };
}

// A value written into a field takes the field's type (machinery, not a rule): a wrong value is invalid input (exit 2).
function typed(entry, field, v) {
  const def = entry.item[field];
  const bad = why => { throw new Refusal(`field ${field}: ${JSON.stringify(v)} ${why}`, 2); };
  let out;
  if (def.type === 'number') { out = num(v); if (Number.isNaN(out)) bad('is not a number'); }
  else if (def.type === 'boolean') { if (![true, false, 'true', 'false'].includes(v)) bad('is not true or false'); out = v === true || v === 'true'; }
  else if (def.type === 'item') { out = v === '' || v == null ? null : num(v); if (Number.isNaN(out)) bad('is not an item number'); }
  else if (LIST.includes(def.type)) {
    out = (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : asList(v)).map(x => (def.type === 'items' && !FOREIGN.test(String(x)) ? num(x) : String(x)));
    if (out.some(x => Number.isNaN(x))) bad('is not a list of item numbers');
  } else out = v == null ? '' : String(v);
  if (def.type === 'person' && out && !(out in entry.people)) bad(`is not a person of the team (${Object.keys(entry.people).join(', ')})`);
  if (def.values && !asList(out).every(x => def.values.some(y => same(x, y)))) bad(`is not one of ${def.values.join(', ')}`);
  return out;
}

// Every value of an effect is computed on the items as they were before the step; then the changes are made on copies.
const changes = (spec, ctx, it) => ['set', 'add', 'remove'].flatMap(kind => Object.entries(spec[kind] ?? {}).map(([f, x]) => [kind, f, value(x, { ...ctx, it })]));
function change(entry, item, list) {
  const next = { ...item, fields: { ...item.fields } };
  for (const [kind, f, v] of list) {
    if (kind === 'set') { next.fields[f] = typed(entry, f, v); continue; }
    const cur = asList(get(item, f, entry)); const vs = typed(entry, f, asList(v));
    next.fields[f] = kind === 'add' ? [...cur, ...vs.filter(x => !cur.some(y => same(x, y)))] : cur.filter(x => !vs.some(y => same(x, y)));
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

// One team step on one item: the coded checks, the table, the effects, the checks of the result. Returns the changed items; throws.
export function step(ctx) {
  const { item, entry } = ctx;
  const takes = stepArgs(entry, ctx.step);
  for (const k of Object.keys(ctx.args ?? {})) if (!takes.includes(k)) throw new Refusal(`the step ${ctx.step} of team ${ctx.team} takes no --${k} (it takes: ${takes.map(a => `--${a}`).join(', ') || 'no argument'})`, 2);
  if (item.archived) throw new Refusal(`item ${item.seq} is archived; archived items take no step`);
  if (item.team && item.team !== ctx.team) throw new Refusal(`item ${item.seq} belongs to team ${item.team}; team ${ctx.team} acts only on its own items and on items without a team`);
  const d = decide(ctx);
  if (!d.allowed) throw new Refusal(`${d.text}${d.rule ? ` (rule ${d.rule})` : ''}`, 1, d.rule);
  if (!item.team && (d.do.team === undefined || value(d.do.team, ctx) !== ctx.team)) throw new Refusal(`item ${item.seq} belongs to no team; only a rule that binds it to team ${ctx.team} may change it (rule ${d.rule} does not)`, 1, d.rule);
  const own = changes(d.do, ctx, item);
  const others = (d.do.related ?? []).flatMap(r => related(r.items, ctx).map(it => [it, changes(r, ctx, it)]));
  const next = change(entry, !item.team ? { ...item, fields: { ...Object.fromEntries(Object.entries(entry.item).map(([f, def]) => [f, defaultOf(def)])), ...item.fields } } : item, own);
  if (d.do.team !== undefined) next.team = value(d.do.team, ctx);
  if (d.do.branch !== undefined) next.branch = String(value(d.do.branch, ctx));
  if (d.do.archive) next.archived = true;
  if (d.do.note) { const x = d.do.note.text; next.notes = [...(item.notes ?? []), { heading: d.do.note.heading, text: typeof x === 'string' && !x.startsWith('$') ? fill(x, ctx) : String(value(x, ctx) ?? ''), by: ctx.caller }]; }
  const out = new Map([[item.seq, next]]);
  const written = new Map([[item.seq, own.map(([, f]) => f)]]);
  for (const [it, list] of others) {
    if (it.missing) throw new Refusal(`item ${it.seq} does not exist (rule ${d.rule})`, 1, d.rule);
    if (it.team !== ctx.team || it.archived || it.repository !== ctx.session.repository) throw new Refusal(`item ${it.seq} is not an open item of team ${ctx.team} in ${ctx.session.repository}; rule ${d.rule} cannot change it`, 1, d.rule);
    out.set(it.seq, change(entry, out.get(it.seq) ?? it, list));
    written.set(it.seq, [...(written.get(it.seq) ?? []), ...list.map(([, f]) => f)]);
  }
  // reference checks (machinery) on the item and items fields this step wrote: each names an existing item, never the item itself
  for (const [seq, fields] of written) for (const f of new Set(fields)) {
    if (!['item', 'items'].includes(entry.item[f].type)) continue;
    for (const s of asList(out.get(seq).fields[f])) {
      if (s === seq) throw new Refusal(`field ${f} of item ${seq}: an item cannot name itself`, 2);
      if (find(ctx, s).missing) throw new Refusal(`field ${f} of item ${seq}: no item ${s}`, 2);
    }
  }
  const p = d.do.place;
  return { rule: d.rule, items: out, delete: Boolean(d.do.delete), say: d.do.say ? fill(d.do.say, ctx) : null,
    place: p && typeof p === 'object' ? Object.fromEntries(Object.entries(p).map(([k, x]) => [k, value(x, ctx)])) : p ?? null };
}

// backlog team new: a fresh item from the item definition, the next number (chapter 05: numbers.mjs on git), then the step "new".
export function create(ctx, state) {
  let seq = state.last ?? 0;
  for (const i of ctx.items) if (i.repository === ctx.session.repository && i.seq > seq) seq = i.seq;
  seq += 1;
  const item = { seq, slug: `${String(seq).padStart(3, '0')}-${String(ctx.args.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: ctx.args.name, team: ctx.team,
    repository: ctx.session.repository, branch: ctx.session.branch, archived: false, body: '', fields: Object.fromEntries(Object.entries(ctx.entry.item).map(([f, d]) => [f, defaultOf(d)])) };
  const r = step({ ...ctx, step: 'new', item, items: [...ctx.items, item] });
  state.last = seq;
  return r;
}

// The team's queue: open items of the team in the session's folder (not archived, status not final), in index order.
const queue = ctx => ctx.order.map(s => ctx.items.find(i => i.seq === s && i.repository === ctx.session.repository))
  .filter(i => i && i.team === ctx.team && !i.archived && !(ctx.entry.item.status.final ?? []).includes(get(i, 'status', ctx.entry)));

// backlog team pop: the first pop entry, in order, whose step would succeed (the whole step, dry) on an item of the queue.
export function pop(ctx) {
  for (const entry of ctx.entry.rules.pop ?? []) for (const item of queue(ctx)) {
    const c = { ...ctx, item, step: entry.step, args: {} };
    if (entry.when && !test(entry.when, c)) continue;
    try { step(c); } catch (e) { if (e instanceof Refusal) continue; throw e; }
    return { action: entry.step, item: item.seq, entry: entry.id };
  }
  return { action: 'idle' };
}

export const filter = (ctx, name) => queue({ ...ctx, order: ctx.items.map(i => i.seq) }).filter(i => test(ctx.entry.rules.filters[name].when, { ...ctx, item: i })).map(i => i.seq);

// ---- coded CLI behaviour: the inputs of a team command (R3b, R14, R15, R20), and the user commands (R3a, R16, R19, R19a)
const V = name => `SMOOTH_BACKLOG_CLI_${name}`;
export const SHOW_ALL = ['query', 'validate', 'migrate']; // the team commands that may act over every team; new, update and pop act on one item for one team
export function resolveInputs({ command, flags = {}, env = {}, config = {} }) {
  const agent = flags.agent || env[V('AGENT')] || ''; // the flag first, then the variable; a flag that differs from the variable wins (R15)
  if (flags['show-all']) {
    if (!SHOW_ALL.includes(command)) throw new Refusal(`--show-all acts over every team; backlog team ${command} acts for one team: give --team <name> instead`, 2);
    if (flags.team) throw new Refusal('--show-all acts over every team: give it or --team <name>, not both', 2);
    return { team: null, all: true, agent };
  }
  const team = flags.team || env[V('TEAM_NAME')] || config.team;
  if (!team) throw new Refusal('a team command needs a team: give --team <name>, or set the SMOOTH_BACKLOG_CLI_TEAM_NAME variable, or set the "team" key in .backlog/config.json', 2);
  if (!agent && ['new', 'update', 'pop'].includes(command)) throw new Refusal('this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable', 2);
  return { team, all: false, agent };
}
export const resolveTeam = ({ flags = {}, env = {}, config = {} }) => resolveInputs({ command: 'query', flags, env, config }).team;
export const resolveAgent = ({ flags = {}, env = {} }) => {
  const agent = flags.agent || env[V('AGENT')];
  if (!agent) throw new Refusal('this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable', 2);
  return agent;
};
// R19a: a session that names a team cannot run a user command at all (help and version are not user commands).
export function userGuard(env = {}) { if (env[V('TEAM_NAME')]) throw new Refusal('teams are not allowed to use user commands', 2); }
// R3a with R16: a team item is invisible to a user command unless --show-all is given; then it is shown like any item.
export function userShow(items, n, { showAll = false, env = {} } = {}) {
  userGuard(env);
  const item = items.find(i => i.seq === Number(n) && (showAll || !i.team));
  if (!item) throw new Refusal(`no phase '${n}'`);
  return item;
}
// R19: with --show-all a user command may set values on a team item (no rule applies; the history names the user).
// shortcut: the value is stored as JSON when it parses as JSON (a number, true, a list), else as text; the user command never reads teams.json.
export function userSet(items, n, { field, value, user, showAll = false, env = {}, now }) {
  const item = userShow(items, n, { showAll, env });
  let v; try { v = JSON.parse(value); } catch { v = value; }
  const before = item.fields[field];
  return { ...item, fields: { ...item.fields, [field]: v }, history: [...(item.history ?? []), { at: now, by: user, step: 'update', changes: { [field]: [before ?? null, v] }, note: item.team ? `--show-all on an item of team ${item.team}` : '' }] };
}
// R16: a reference to a team item reads as missing for a user command, unless --show-all is given.
export const userReference = (items, n, { showAll = false } = {}) => { const t = items.find(i => i.seq === Number(n)); return t && (showAll || !t.team) ? { seq: t.seq, status: t.fields.status } : { seq: Number(n), missing: true }; };

// R17: every missing, invalid or undeclared field of a team's items, one line each (backlog team migrate reports them).
export function itemFindings(entry, items) {
  const out = [];
  for (const it of items) {
    for (const [f, def] of Object.entries(entry.item)) {
      if (!(f in it.fields)) { out.push(`item ${it.seq}: field ${f} is missing (${def.type}${def.values ? `: ${def.values.join(', ')}` : ''})`); continue; }
      try { typed(entry, f, it.fields[f]); } catch (e) { out.push(`item ${it.seq}: ${e.message}`); }
    }
    for (const f of Object.keys(it.fields)) if (!(f in entry.item)) out.push(`item ${it.seq}: field ${f} is not declared by the item definition`);
  }
  return out;
}
export function migrateAsk({ isTerminal, team }) {
  if (!isTerminal) throw new Refusal(`--ask needs a terminal (standard input and standard error); run backlog team migrate --team ${team} without --ask for the report`, 2);
  return true;
}

// ---- backlog team validate (the checks the cases exercise; chapter 08 lists all of them)
const distance = (a, b) => { const d = [...Array(b.length + 1).keys()]; for (const x of a) { let prev = d[0]++; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (x === b[j - 1] ? 0 : 1)); prev = t; } } return d[b.length]; };
const closest = (k, allowed) => allowed.reduce((best, a) => (distance(k, a) < distance(k, best) ? a : best));
const canonical = x => JSON.stringify(x, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));

export function validate(file) {
  const out = [];
  const say = (team, path, rule, problem, fix) => out.push({ team, path, rule, problem, fix });
  for (const [team, e] of Object.entries(file)) {
    const keys = (obj, kind, path, rule = null) => { if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const k of Object.keys(obj)) if (!KEYS[kind].includes(k)) say(team, `${path}.${k}`.replace(/^\./, ''), rule, `${k} is not a key of ${LABEL[kind]}`, `did you mean ${closest(k, KEYS[kind])}? (${KEYS[kind].join(', ')})`); };
    keys(e, 'entry', ''); keys(e.rules, 'rules', 'rules');
    for (const k of KEYS.entry) if (!e?.[k]) say(team, k, null, `the entry has no ${k}`, `add ${k} (chapter 01 section 2)`);
    if (e?.rules) for (const k of KEYS.rules) if (!e.rules[k]) say(team, `rules.${k}`, null, `rules has no ${k}`, `add "${k}": ${k === 'filters' ? '{}' : '[]'}`);
    const roles = new Set(Object.values(e.people ?? {}).flat());
    if (!e.people || !Object.keys(e.people).length) say(team, 'people', null, 'the team has no person', 'add "people": {"<name>": ["<role>"]}');
    for (const [f, d] of Object.entries(e.item ?? {})) {
      keys(d, 'field', `item.${f}`);
      if (ENVELOPE.includes(f)) say(team, `item.${f}`, null, `${f} is a key every item has already`, 'choose another field name');
      else if (!NAME.test(f)) say(team, `item.${f}`, null, `${f} is not a field name: lowercase letters, digits, - and _, starting with a letter`, 'rename the field');
      if (!TYPES.includes(d.type)) say(team, `item.${f}.type`, null, `unknown type ${d.type}`, `use ${TYPES.join(', ')}`);
    }
    if (!e.item?.status?.values) say(team, 'item.status', null, 'the item definition has no status field with values', 'add "status": {"type": "text", "values": [...], "final": [...]}');
    const table = e.rules?.table ?? [];
    // a node of a condition or a value; ctx: where $it is valid, and the rule
    const walk = (node, path, rule, it, kind) => {
      if (typeof node === 'string') {
        if (!node.startsWith('$')) return;
        const [root, ...rest] = node.slice(1).split('.'); const name = rest.join('.');
        if (['item', 'it'].includes(root)) {
          if (!ENVELOPE.includes(name) && !(name in (e.item ?? {}))) say(team, path, rule, `${node} names no field of the item definition`, `add ${name} to ${team}.item or name one of ${Object.keys(e.item ?? {}).join(', ')}`);
          if (root === 'it' && !it) say(team, path, rule, `${node} is used outside every, some, count and related`, 'use $item for the item of the step');
        } else if (root === 'arg') { if (RESERVED_ARGS.includes(name)) say(team, path, rule, `--${name} belongs to the CLI`, 'name the argument otherwise'); else if (!NAME.test(name)) say(team, path, rule, `${name} is not an argument name`, 'lowercase letters, digits, - and _'); }
        else if (!(root in NAMES) || !NAMES[root].includes(name)) say(team, path, rule, `${node} is no reference`, `use one of $item.<field>, $it.<field>, $arg.<name>, $caller, $caller.roles, $session.id|repository|branch|commit, $team.name|items, $now`);
        return;
      }
      if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${path}[${i}]`, rule, it, kind));
      if (!node || typeof node !== 'object') return;
      const ks = Object.keys(node);
      if (ks.length !== 1) return say(team, path, rule, `a ${kind} has exactly one key (found ${ks.join(', ') || 'none'})`, 'wrap several conditions in all');
      const [k] = ks; const x = node[k]; const at = `${path}.${k}`;
      const allowed = kind === 'condition' ? TESTS : FUNCTIONS;
      if (!allowed.includes(k)) return say(team, at, rule, `unknown ${kind === 'condition' ? 'test' : 'function'} ${k}`, `did you mean ${closest(k, allowed)}?`);
      if (QUANT.includes(k)) {
        if (it) say(team, at, rule, `${k} inside another every, some or count`, 'a rule reads one hop of related items; split it into two rules');
        for (const q of Object.keys(x ?? {})) if (!['items', 'match'].includes(q)) say(team, `${at}.${q}`, rule, `${q} is not a key of ${k}`, 'use items and match');
        walk(x?.items, `${at}.items`, rule, it, 'value'); if (x?.match) walk(x.match, `${at}.match`, rule, true, 'condition');
        return;
      }
      if (k === 'regex') { try { compile(x[1]); } catch (err) { say(team, at, rule, `not a pattern the CLI runs (${err.message})`, 'use the subset of chapter 03 section 4'); } return walk(x[0], `${at}[0]`, rule, it, 'value'); }
      if (k === 'in' && x[1] === '$caller.roles' && typeof x[0] === 'string' && !x[0].startsWith('$') && !roles.has(x[0])) say(team, at, rule, `no person has the role ${x[0]}`, `give a person the role or use one of ${[...roles].join(', ')}`);
      if (['is', 'in'].includes(k)) {
        const field = typeof x[0] === 'string' && /^\$(item|it)\./.test(x[0]) ? x[0].split('.')[1] : null; const vals = e.item?.[field]?.values;
        if (vals) for (const lit of asList(x[1]).filter(l => typeof l === 'string' && !l.startsWith('$'))) if (!vals.includes(lit)) say(team, at, rule, `${lit} is not a value of ${field} (${vals.join(', ')})`, `use a value of ${field} or add ${lit} to its values`);
      }
      const sub = ['all', 'any', 'not'].includes(k) ? 'condition' : 'value';
      if (k === 'text') return;
      walk(x, at, rule, it, sub);
    };
    const effects = (spec, path, rule, it) => {
      for (const kind of ['set', 'add', 'remove']) for (const [f, x] of Object.entries(spec?.[kind] ?? {})) {
        if (!(f in (e.item ?? {}))) say(team, `${path}.${kind}.${f}`, rule, `${f} is no field of the item definition`, `add ${f} to ${team}.item`);
        else if (kind !== 'set' && !LIST.includes(e.item[f].type)) say(team, `${path}.${kind}.${f}`, rule, `${kind} needs a list field; ${f} is ${e.item[f].type}`, 'use set');
        else if (typeof x === 'string' && !x.startsWith('$') && e.item[f].values && !e.item[f].values.includes(x)) say(team, `${path}.${kind}.${f}`, rule, `${x} is not a value of ${f}`, `use one of ${e.item[f].values.join(', ')}`);
        walk(x, `${path}.${kind}.${f}`, rule, it, 'value');
      }
    };
    const ids = new Set();
    table.forEach((r, n) => {
      const at = `rules.table[${n}]`;
      keys(r, 'rule', at, r.id ?? null);
      if (!r.id || ids.has(r.id)) say(team, at, r.id ?? null, r.id ? `the id ${r.id} is used twice` : 'the rule has no id', 'give every rule its own id');
      ids.add(r.id);
      for (const s of asList(r.step)) if (s !== '*' && !NAME.test(s)) say(team, `${at}.step`, r.id, `${s} is not a step name`, 'lowercase letters, digits, - and _, starting with a letter');
      if (('deny' in r) === ('do' in r)) say(team, at, r.id, 'a rule has exactly one outcome: deny or do', 'keep one of deny and do');
      if (r.when) walk(r.when, `${at}.when`, r.id, false, 'condition');
      if (r.do) {
        keys(r.do, 'do', `${at}.do`, r.id); effects(r.do, `${at}.do`, r.id, false);
        if (r.do.note) { keys(r.do.note, 'note', `${at}.do.note`, r.id); walk(r.do.note.text, `${at}.do.note.text`, r.id, false, 'value'); }
        (r.do.related ?? []).forEach((x, i) => { keys(x, 'related', `${at}.do.related[${i}]`, r.id); walk(x.items, `${at}.do.related[${i}].items`, r.id, false, 'value'); effects(x, `${at}.do.related[${i}]`, r.id, true); });
      }
      // routing-table shadowing: an earlier rule that matches every step and every case this rule matches hides it. Clauses are compared
      // without regard to key order, and an earlier `in` covers a later `is` on the same value.
      const clauses = x => (!x ? [] : x.all ? x.all : [x]);
      const covers = (p, q) => canonical(p) === canonical(q) || (p.in && q.is && canonical(p.in[0]) === canonical(q.is[0]) && Array.isArray(p.in[1]) && p.in[1].some(v => canonical(v) === canonical(q.is[1])));
      const earlier = table.slice(0, n).find(p => asList(r.step).every(s => stepMatches(p.step, s)) && clauses(p.when).every(c => clauses(r.when).some(d => covers(c, d))));
      if (earlier) say(team, at, r.id, `rule ${r.id} can never decide: rule ${earlier.id} above it matches every case it matches`, `move ${r.id} above ${earlier.id}, or narrow ${earlier.id}`);
    });
    const named = new Set(table.flatMap(r => asList(r.step)));
    (e.rules?.pop ?? []).forEach((o, n) => {
      keys(o, 'pop', `rules.pop[${n}]`, o.id ?? null);
      if (!named.has(o.step)) say(team, `rules.pop[${n}]`, o.id ?? null, `no rule names the step ${o.step}`, 'name a step of rules.table');
      if (o.when) walk(o.when, `rules.pop[${n}].when`, o.id ?? null, false, 'condition');
    });
    for (const [name, v] of Object.entries(e.rules?.filters ?? {})) { keys(v, 'filter', `rules.filters.${name}`); walk(v.when, `rules.filters.${name}.when`, null, false, 'condition'); }
  }
  return out;
}
