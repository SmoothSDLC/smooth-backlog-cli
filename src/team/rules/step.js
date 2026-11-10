// One team step on one item: the coded checks, the walk of the table (the first rule whose step and condition match decides, no match
// refuses), the argument list of a step, the effects (typed writes of fields, related items, note, place, say, team, branch, archive, delete) and the reference checks of what was written. Pure: the
// result holds changed copies of items and the input is never changed. A refusal is exit 1; a wrong value or rule file is exit 2.
import { slugify } from '../../shared/safety.js';
import { FOREIGN, LIST, Refusal, asList, defaultOf, fill, find, get, num, related, same, stepMatches, test, value } from './expression.js';

// Every effect a rule may write; this evaluator runs all of them.
export const EFFECTS = ['set', 'add', 'remove', 'note', 'related', 'place', 'archive', 'delete', 'branch', 'team', 'say'];
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);

// The first matching rule decides; no match is the coded refusal. A matching rule that is malformed is a wrong rule file (exit 2).
export function decide(ctx) {
  for (const r of ctx.entry.rules.table) {
    if (!stepMatches(r.step, ctx.step) || (r.when && !test(r.when, ctx))) continue;
    if ('deny' in r === 'do' in r) throw new Refusal(`rule ${r.id}: a rule has exactly one of deny and do`, 2, r.id);
    if ('deny' in r) return { allowed: false, rule: r.id, text: fill(r.deny, ctx) };
    if (!isObj(r.do)) throw new Refusal(`rule ${r.id}: do must be an object`, 2, r.id);
    for (const k of Object.keys(r.do)) {
      if (!EFFECTS.includes(k)) throw new Refusal(`rule ${r.id}: ${k} is not an effect`, 2, r.id);
      const x = r.do[k]; const bad = why => { throw new Refusal(`rule ${r.id}: ${k} ${why}`, 2, r.id); };
      if (['set', 'add', 'remove'].includes(k) && !isObj(x)) bad('must be an object');
      if (k === 'note' && !(isObj(x) && typeof x.heading === 'string' && 'text' in x)) bad('must be an object with a heading text and a text');
      if (k === 'related' && !(Array.isArray(x) && x.every(e => isObj(e) && 'items' in e))) bad('must be a list of objects, each with items');
      if (k === 'related') for (const e of x) for (const key of Object.keys(e)) if (!['items', 'set', 'add', 'remove'].includes(key)) bad(`entry has the key ${key}, which is not items, set, add or remove`);
      if (k === 'say' && typeof x !== 'string') bad('must be a text');
      if (k === 'place' && !(x === 'first' || x === 'last' || (isObj(x) && Object.keys(x).length === 1 && ['before', 'after'].includes(Object.keys(x)[0])))) bad('must be "first", "last", {"before": n} or {"after": n}');
    }
    return { allowed: true, rule: r.id, do: r.do };
  }
  return { allowed: false, rule: null, text: `no rule of team ${ctx.team} allows the step ${ctx.step} on item ${ctx.item.seq}` };
}

// A value written into a field takes the field's type: a wrong value is invalid input (exit 2).
// own: the step's repository folder; a reference to it in the foreign form owner/name#n is the local number n (no escape from the checks).
export function typed(entry, field, v, own) {
  const def = entry.item[field];
  if (!def) throw new Refusal(`field ${field} is not a field of the item definition`, 2);
  const local = x => { const f = FOREIGN.exec(String(x)); return f && f[1] === own ? Number(f[2]) : x; };
  if (['item', 'items'].includes(def.type)) v = Array.isArray(v) ? v.map(local) : typeof v === 'string' && def.type === 'items' ? v.split(',').map(s => local(s.trim())).filter(x => x !== '') : local(v);
  const bad = why => { throw new Refusal(`field ${field}: ${JSON.stringify(v)} ${why}`, 2); };
  let out;
  if (def.type === 'number') { out = num(v); if (Number.isNaN(out)) bad('is not a number'); }
  else if (def.type === 'boolean') { if (![true, false, 'true', 'false'].includes(v)) bad('is not true or false'); out = v === true || v === 'true'; }
  else if (def.type === 'item') { out = v === '' || v == null ? null : num(v); if (Number.isNaN(out)) bad('is not an item number'); }
  else if (LIST.includes(def.type)) {
    out = (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : asList(v)).map(x => (def.type === 'items' && !FOREIGN.test(String(x)) ? num(x) : String(x)));
    if (out.some(x => Number.isNaN(x))) bad('is not a list of item numbers');
  } else if (Array.isArray(v)) bad('is a list, and this field takes one value');
  else out = v == null ? '' : String(v);
  if (def.type === 'person' && out && !Object.hasOwn(entry.people, out)) bad(`is not a person of the team (${Object.keys(entry.people).join(', ')})`);
  if (def.values && !asList(out).every(x => def.values.some(y => same(x, y)))) bad(`is not one of ${def.values.join(', ')}`);
  return out;
}

// Every value of an effect is computed on the items as they were before the step; then the changes are made on copies.
const changes = (spec, ctx, it) => ['set', 'add', 'remove'].flatMap(kind => Object.entries(spec[kind] ?? {}).map(([f, x]) => [kind, f, value(x, { ...ctx, it })]));
function change(entry, item, list, own) {
  const next = { ...item, fields: { ...item.fields } };
  for (const [kind, f, v] of list) {
    if (kind === 'set') { next.fields[f] = typed(entry, f, v, own); continue; }
    if (!LIST.includes(entry.item[f]?.type) && entry.item[f]) throw new Refusal(`field ${f} is not a list field`, 2);
    const cur = asList(get(item, f, entry)); const vs = typed(entry, f, asList(v), own);
    next.fields[f] = kind === 'add' ? [...cur, ...vs.filter(x => !cur.some(y => same(x, y)))] : cur.filter(x => !vs.some(y => same(x, y)));
  }
  return next;
}

// The arguments a step takes are the names its rules read as $arg.<name>, alone or inside a longer text as {$arg.<name>} (and --name for new).
export function stepArgs(entry, name) {
  const found = new Set(name === 'new' ? ['name'] : []);
  const walk = n => {
    if (typeof n === 'string') { const m = /^\$arg\.(.+)$/.exec(n); if (m) found.add(m[1]); for (const [, p] of n.matchAll(/\{\$arg\.([a-z0-9_.-]+)\}/g)) found.add(p); }
    else if (n && typeof n === 'object') Object.values(n).forEach(walk);
  };
  entry.rules.table.filter(r => stepMatches(r.step, name)).forEach(walk);
  return [...found].sort();
}

// Returns { rule, items: Map seq -> changed copy, changes: Map seq -> { field: [before, after] } }; throws a Refusal.
export function step(ctx) {
  const { item, entry } = ctx;
  const takes = stepArgs(entry, ctx.step);
  for (const k of Object.keys(ctx.args ?? {})) if (!takes.includes(k)) throw new Refusal(`the step ${ctx.step} of team ${ctx.team} takes no --${k} (it takes: ${takes.map(a => `--${a}`).join(', ') || 'no argument'})`, 2);
  if (!item) throw new Refusal('the item does not exist');
  if (item.archived) throw new Refusal(`item ${item.seq} is archived; archived items take no step`);
  if (item.team && item.team !== ctx.team) throw new Refusal(`item ${item.seq} belongs to team ${item.team}; team ${ctx.team} acts only on its own items and on items without a team`);
  const d = decide(ctx);
  if (!d.allowed) throw new Refusal(`${d.text}${d.rule ? ` (rule ${d.rule})` : ''}`, 1, d.rule);
  if (d.do.team !== undefined && ![ctx.team, ''].includes(value(d.do.team, ctx))) throw new Refusal(`rule ${d.rule}: the team effect binds only to team ${ctx.team} or unbinds with ""; it never moves an item to another team`, 2, d.rule);
  if (!item.team && (d.do.team === undefined || value(d.do.team, ctx) !== ctx.team)) throw new Refusal(`item ${item.seq} belongs to no team; only a rule that binds it to team ${ctx.team} may change it (rule ${d.rule} does not)`, 1, d.rule);
  const to = d.do.branch === undefined ? '' : value(d.do.branch, ctx);
  if (d.do.branch !== undefined && (typeof to !== 'string' || to === '')) throw new Refusal(`the branch to move to is empty (rule ${d.rule})`, 1, d.rule);
  const own = changes(d.do, ctx, item);
  const others = (d.do.related ?? []).flatMap(r => related(r.items, ctx).map(it => [it, changes(r, ctx, it)]));
  const next = change(entry, !item.team ? { ...item, fields: { ...Object.fromEntries(Object.entries(entry.item).map(([f, def]) => [f, defaultOf(def)])), ...item.fields } } : item, own, ctx.session.repository);
  if (d.do.team !== undefined) next.team = value(d.do.team, ctx);
  if (d.do.branch !== undefined) next.branch = to;
  if (d.do.archive === true) next.archived = true;
  const out = new Map([[item.seq, next]]);
  const written = new Map([[item.seq, own.map(([, f]) => f)]]);
  for (const [it, list] of others) {
    if (it.seq === item.seq) throw new Refusal(`an item cannot be related to itself (rule ${d.rule})`, 1, d.rule);
    if (it.missing) throw new Refusal(`item ${it.seq} does not exist (rule ${d.rule})`, 1, d.rule);
    if (it.team !== ctx.team || it.archived || it.repository !== ctx.session.repository) throw new Refusal(`item ${it.seq} is not an open item of team ${ctx.team} in ${ctx.session.repository}; rule ${d.rule} cannot change it`, 1, d.rule);
    out.set(it.seq, change(entry, out.get(it.seq) ?? it, list, ctx.session.repository));
    written.set(it.seq, [...(written.get(it.seq) ?? []), ...list.map(([, f]) => f)]);
  }
  // The item and items fields this step wrote each name an existing item, never the item itself.
  for (const [seq, fields] of written) for (const f of new Set(fields)) {
    if (!['item', 'items'].includes(entry.item[f].type)) continue;
    for (const s of asList(out.get(seq).fields[f])) {
      if (s === seq) throw new Refusal(`field ${f} of item ${seq}: an item cannot name itself`, 2);
      if (!FOREIGN.test(String(s)) && find(ctx, s).missing) throw new Refusal(`field ${f} of item ${seq}: no item ${s}`, 2); // another folder is never checked
    }
  }
  const was = seq => (seq === item.seq ? item : find(ctx, seq));
  const changed = new Map([...written].map(([seq, fields]) => [seq, Object.fromEntries([...new Set(fields)].map(f => [f, [get(was(seq), f, entry), out.get(seq).fields[f]]]).filter(([, [b, a]]) => !same(b, a)))]));
  for (const f of ['team', 'branch', 'archived']) if (next[f] !== item[f]) changed.get(item.seq)[f] = [item[f], next[f]];
  // What the step cannot do itself goes back as data: the notes, the placing, the text to say, the deletion.
  const x = d.do.note?.text; const p = d.do.place;
  return { rule: d.rule, items: out, changes: changed, delete: d.do.delete === true, say: d.do.say ? fill(d.do.say, ctx) : null,
    notes: d.do.note ? [{ heading: d.do.note.heading, text: typeof x === 'string' && !x.startsWith('$') ? fill(x, ctx) : String(value(x, ctx) ?? ''), by: ctx.caller }] : [],
    place: p && typeof p === 'object' ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, value(v, ctx)])) : p ?? null };
}

// backlog team new: a fresh item from the item definition under the number the caller took from the counter, then the step "new".
// The number is used only if the caller writes; a refusal leaves the counter alone.
export function create(ctx, seq) {
  const item = { seq, slug: `${String(seq).padStart(3, '0')}-${slugify(ctx.args?.name ?? '')}`, name: ctx.args?.name, team: ctx.team, repository: ctx.session.repository,
    branch: ctx.session.branch, archived: false, body: '', fields: Object.fromEntries(Object.entries(ctx.entry.item).map(([f, d]) => [f, defaultOf(d)])) };
  return step({ ...ctx, step: 'new', item, items: [...ctx.items, item] });
}
