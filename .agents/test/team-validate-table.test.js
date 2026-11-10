// The last checks of the team file: shadowing, pop entries, filters and the warnings, and the one test that asks whether validate catches what the evaluator refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Refusal, defaultOf } from '../../src/team/rules/expression.js';
import { pop, queue, filter } from '../../src/team/rules/pop.js';
import { create, step, stepArgs } from '../../src/team/rules/step.js';
import { errors, validate } from '../../src/team/rules/validate.js';

const dir = new URL('../../templates/teams/', import.meta.url);
const TEMPLATES = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f, JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]));
const base = (table, extra = {}) => ({ t: { people: { a: ['lead'], b: ['member'] }, item: { status: { type: 'text', description: 's', values: ['open', 'done'], final: ['done'], default: 'open' },
  size: { type: 'number', description: 'n', default: 0 } }, rules: { table, pop: [], filters: {}, ...extra } } });
const go = (extra = {}) => ({ id: 'r', step: 'go', do: {}, ...extra });
const where = (file, severity = 'error') => validate(file).filter(f => f.severity === severity).map(f => `${f.path}: ${f.problem}`);
const is = (f, v) => ({ is: [`$item.${f}`, v] });

test('shadowing: an earlier rule that matches every case of a later one hides it', () => {
  assert.deepEqual(where(base([go({ id: 'a' }), go({ id: 'b', when: is('status', 'open') })])), ['rules.table[1]: rule b can never decide: rule a above it matches every case it matches']);
  assert.deepEqual(where(base([go({ id: 'a', step: '*' }), go({ id: 'b', step: ['go', 'stop'], when: is('status', 'open') })])), ['rules.table[1]: rule b can never decide: rule a above it matches every case it matches']);
  // the same clauses in another key order, and an all that holds the clause of the later rule
  const x = { '>=': ['$item.size', 3] };
  assert.equal(where(base([go({ id: 'a', when: { all: [is('status', 'open'), x] } }), go({ id: 'b', when: { all: [x, is('status', 'open'), { not: is('size', 1) }] } })])).length, 1);
  assert.equal(where(base([go({ id: 'a', when: { in: ['$item.status', ['open', 'done']] } }), go({ id: 'b', when: is('status', 'done') })])).length, 1);
});

test('shadowing: no false error for a rule that can still decide', () => {
  const none = table => assert.deepEqual(where(base(table)), []);
  none([go({ id: 'a', when: is('status', 'open') }), go({ id: 'b', when: is('status', 'done') })]); // same step, other clause
  none([go({ id: 'a', when: { all: [is('status', 'open'), { '>=': ['$item.size', 3] }] } }), go({ id: 'b', when: is('status', 'open') })]); // the earlier rule has one more clause
  none([go({ id: 'a', when: { '>=': ['$item.size', 3] } }), go({ id: 'b', when: { '>=': ['$item.size', 5] } })]); // only logic proves this one
  none([go({ id: 'a', when: { in: ['$item.status', ['open']] } }), go({ id: 'b', when: { in: ['$item.status', ['open', 'done']] } })]);
  none([go({ id: 'a' }), go({ id: 'b', step: 'stop' })]); // another step
  none([go({ id: 'a', step: 'go' }), go({ id: 'b', step: ['go', 'stop'] })]); // the earlier rule misses one step of the later one
  none([go({ id: 'a', step: '*', when: is('status', 'open') }), go({ id: 'b', step: '*', when: is('status', 'done') })]);
  none([go({ id: 'b', when: is('status', 'open') }), go({ id: 'a' })]); // narrow above wide is the way to write it
});

test('shadowing never throws on rules of any shape', () => {
  for (const table of [[null, go()], [go(), 5], [{ step: 5 }, { step: 5 }], [{ step: 'go', when: 3 }, go()], [go({ when: { all: 5 } }), go()], [go({ when: { in: 5 } }), go({ when: { is: 5 } })], [go({ when: { all: [null, 1] } }), go()]]) validate(base(table));
});

test('pop entries: an id of their own, one existing step, a valid condition', () => {
  const pop = (...p) => where(base([go()], { pop: p }));
  assert.deepEqual(pop({ id: 'o', step: 'go' }), []);
  assert.deepEqual(pop({ id: 'o', step: 'claim' }), ['rules.pop[0]: no rule names the step claim']);
  assert.deepEqual(pop({ id: 'o', step: 'go' }, { id: 'o', step: 'go' }), ['rules.pop[1]: the id o is used twice among the pop entries']);
  assert.deepEqual(pop({ step: 'go' }), ['rules.pop[0]: the pop entry has no id']);
  assert.deepEqual(pop({ id: 5, step: 'go' }), ['rules.pop[0]: the id of a pop entry must be a text']);
  assert.deepEqual(pop({ id: 'o', step: '*' }), ['rules.pop[0].step: a pop entry names one step, not *']);
  assert.match(pop({ id: 'o', step: 'new' })[0], /^rules\.pop\[0\]\.step: new creates an item/);
  assert.deepEqual(pop({ id: 'o', step: ['go'] }), ['rules.pop[0].step: a pop entry names one step as a word']);
  assert.deepEqual(pop({ id: 'o', step: 'go', wehn: 1 }), ['rules.pop[0].wehn: wehn is not a key of a pop entry']);
  assert.deepEqual(pop({ id: 'o', step: 'go', when: { is: ['$it.status', 'open'] } }), ['rules.pop[0].when.is[0]: $it.status is used outside every, some, count and related']);
  assert.deepEqual(pop({ id: 'o', step: 'go', when: { is: ['$item.nope', 'open'] } }).length, 1);
  assert.deepEqual(pop(null), ['rules.pop[0]: a pop entry must be an object']);
  // a rule for every step does not name a step: a mistyped pop step is caught even when the file has such a guard
  assert.deepEqual(where(base([{ id: 'g', step: '*', deny: 'x', when: { empty: '$caller.roles' } }, go()], { pop: [{ id: 'o', step: 'claim' }] })), ['rules.pop[0]: no rule names the step claim']);
});

test('filters: a field-style name and a condition that is required and valid', () => {
  const filters = f => where(base([go()], { filters: f }));
  assert.deepEqual(filters({ open: { description: 'd', when: is('status', 'open') } }), []);
  assert.deepEqual(filters({ open: { when: is('status', 'open') } }), []);
  assert.deepEqual(filters({ open: { description: 'd' } }), ['rules.filters.open: the filter has no when']);
  assert.deepEqual(filters({ Open: { when: is('status', 'open') } }), ['rules.filters.Open: Open is not a filter name: lowercase letters, digits, - and _, starting with a letter']);
  assert.deepEqual(filters({ open: 5 }), ['rules.filters.open: a filter must be an object with a when']);
  assert.deepEqual(filters({ open: { when: { is: ['$it.status', 'open'] } } }), ['rules.filters.open.when.is[0]: $it.status is used outside every, some, count and related']);
  assert.deepEqual(filters({ open: { when: { is: 5 } } }), ['rules.filters.open.when.is: is takes a list of two values']);
  assert.deepEqual(filters({ open: { when: is('status', 'open'), extra: 1 } }), ['rules.filters.open.extra: extra is not a key of a filter']);
});

test('shadowing and the pop checks stay fast on a big file', () => {
  const words = Array.from({ length: 500 }, (_, i) => `w${i}`);
  const wide = base(Array.from({ length: 300 }, (_, i) => go({ id: `r${i}`, step: words, when: is('status', `v${i}`) })));
  let t = Date.now(); assert.ok(errors(validate(wide)).length >= 0); assert.ok(Date.now() - t < 1000, `${Date.now() - t} ms`);
  const stars = base(Array.from({ length: 5000 }, (_, i) => ({ id: `s${i}`, step: '*', when: is('size', i), do: { set: { size: '$arg.n' } } })).concat([go({ id: 'g' })]),
    { pop: Array.from({ length: 5000 }, (_, i) => ({ id: `p${i}`, step: i % 2 ? 'go' : `x${i}` })) });
  t = Date.now(); const found = validate(stars); assert.ok(Date.now() - t < 1000, `${Date.now() - t} ms`);
  assert.equal(errors(found).filter(f => /no rule names/.test(f.problem)).length, 2500);
  assert.equal(errors(found).filter(f => /writes it into a field/.test(f.problem)).length, 5000);
});

test('a condition nested 100000 deep in a pop entry or a filter is one finding, never a throw', () => {
  let deep = is('status', 'open'); for (let i = 0; i < 100000; i++) deep = { not: deep };
  assert.equal(errors(validate(base([go()], { pop: [{ id: 'o', step: 'go', when: deep }], filters: { f: { when: deep } } }))).length, 2);
});

test('warnings: unread roles and fields, a step no rule allows, a step pop offers whose condition reads an argument; they never make an error', () => {
  const file = base([go({ id: 'a', when: { all: [{ in: ['lead', '$caller.roles'] }, { empty: '$arg.to' }] } }), { id: 'z', step: 'zap', deny: 'no' }],
    { pop: [{ id: 'o', step: 'go' }, { id: 'p', step: 'zap' }] });
  const w = where(file, 'warning');
  assert.deepEqual(w, ['people.b: the role member is read by no rule, pop entry or filter', 'item.size: size is read by no rule',
    'rules.table[1]: no rule allows the step zap; it is always refused', 'rules.pop[0]: pop cannot give --to to the step go; the pop entry can only be refused']);
  assert.deepEqual(errors(validate(file)), []);
  for (const f of validate(file)) assert.ok(f.fix);
  // reads: a role literal in a filter or a pop condition, a field in a placeholder, in $it and in a filter; status is always read
  const read = base([go({ do: { say: 'size {$item.size}' } })], { filters: { f: { when: { in: ['member', '$caller.roles'] } } } });
  read.t.people.a = ['member'];
  assert.deepEqual(where(read, 'warning'), []);
  assert.deepEqual(where(base([go({ do: { related: [{ items: [], set: { size: '$it.size' } }] } })]), 'warning'), ['people.a: the role lead is read by no rule, pop entry or filter', 'people.b: the role member is read by no rule, pop entry or filter']);
});

test('a pop step whose allowing rule writes an argument into a field is an error: pop passes no arguments', () => {
  const scrum = structuredClone(TEMPLATES['scrum.json']); scrum.scrum.rules.pop.push({ id: 'refine-first', step: 'refine' });
  const found = errors(validate(scrum)).map(f => `${f.path}: ${f.problem}`);
  assert.deepEqual(found.filter(x => x.includes('--acceptance')), [`rules.pop[2]: pop cannot give --acceptance to the step refine, and a rule writes it into a field: the step would stop the command with exit 2 for the whole team`]);
  assert.equal(found.length, 3); // acceptance, points, sprint
  assert.match(errors(validate(scrum))[0].fix, /give the field a value that needs no argument, or remove the step refine from pop/);
  // an argument read only in a deny text or a note is not written into a field: a warning
  const note = base([go({ do: { note: { heading: 'h', text: '$arg.c' } } })], { pop: [{ id: 'o', step: 'go' }] });
  assert.deepEqual(errors(validate(note)), []); assert.equal(where(note, 'warning').filter(x => x.includes('--c')).length, 1);
  // related entries and a rule for every step count too
  const rel = base([go({ do: { related: [{ items: [], set: { size: '$arg.n' } }] } })], { pop: [{ id: 'o', step: 'go' }] });
  assert.equal(errors(validate(rel)).length, 1);
  assert.equal(errors(validate(base([go(), { id: 'all', step: '*', do: { set: { size: '$arg.n' } } }], { pop: [{ id: 'o', step: 'go' }] }))).length, 1);
});

test('a reference written into a typed field is an error when its type is known and does not fit', () => {
  const file = (set, extra = {}) => { const f = base([go({ do: { set } })]); Object.assign(f.t.item, { who: { type: 'person', description: 'w' }, flag: { type: 'boolean', description: 'f' }, tags: { type: 'list', description: 't' },
    other: { type: 'text', description: 'o', values: ['open', 'late'] }, deps: { type: 'items', description: 'd' }, link: { type: 'item', description: 'l' }, ...extra }); return where(f); };
  const one = (set, re) => { const r = file(set); assert.equal(r.length, 1, JSON.stringify(r)); assert.match(r[0], re); };
  one({ size: '$item.who' }, /^rules\.table\[0\]\.do\.set\.size: field size: \$item\.who is a person, and size takes a number$/);
  one({ size: '$caller' }, /\$caller is a person, and size takes a number/);
  one({ flag: '$item.size' }, /is a number, and flag takes a boolean/);
  one({ who: '$caller.roles' }, /is a list, and who takes one person value/);
  one({ status: '$item.tags' }, /is a list, and status takes one text value/);
  one({ who: '$item.size' }, /is a number, and who takes a person/);
  one({ link: '$item.flag' }, /is a boolean, and link takes a item/);
  one({ status: '$item.other' }, /can hold late, which is not among the values of status \(open, done\)/);
  assert.deepEqual(file({ who: '$caller', status: '$item.status', size: '$item.link', tags: '$caller.roles', other: '$item.status' }), ['rules.table[0].do.set.other: field other: $item.status can hold done, which is not among the values of other (open, late)']);
  // not judged: unknown types, arguments, the session, the clock, a text field that may hold anything, a text into a number
  assert.deepEqual(file({ size: '$arg.n', who: '$session.id', status: '$now', other: '$item.who', link: '$item.size' }), []);
  assert.deepEqual(file({ size: '$item.status', who: '$item.status', deps: '$item.link', tags: '$item.deps' }), []);
});

test('the five templates give no error and no shadowing', () => {
  assert.equal(Object.keys(TEMPLATES).length, 5);
  for (const [name, file] of Object.entries(TEMPLATES)) assert.deepEqual(errors(validate(file)), [], name);
});

// The soundness test: one-point mutations of the templates. A file validate accepts must never make the evaluator refuse with exit 2 or throw, in a step, in pop
// or in a filter, where the template itself did not.
const prng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const VALUES = [5, null, [], {}, 'x', '$nope'];
const paths = (x, at = []) => (x && typeof x === 'object' ? Object.keys(x).flatMap(k => [[...at, k], ...paths(x[k], [...at, k])]) : []);
function mutate(file, r) {
  const copy = structuredClone(file); const team = Object.values(copy)[0];
  // Half of the mutations land in the pop entries, which are small; one of them names the step of another rule.
  const all = paths(copy); const inPop = all.filter(p => p.includes('pop'));
  const pool = r() < 0.5 && inPop.length ? inPop : all; const p = pool[Math.floor(r() * pool.length)];
  const parent = p.slice(0, -1).reduce((n, k) => n[k], copy); const k = p.at(-1); const m = Math.floor(r() * (VALUES.length + 2));
  const words = team.rules.table.flatMap(x => x.step);
  if (m === VALUES.length) { if (Array.isArray(parent)) parent.splice(Number(k), 1); else delete parent[k]; } else if (m === VALUES.length + 1) parent[k] = words[Math.floor(r() * words.length)];
  else parent[k] = structuredClone(VALUES[m]);
  return copy;
}
const outcome = fn => { try { fn(); return 'ok'; } catch (e) { return e instanceof Refusal ? `exit ${e.exitCode}` : `throws ${e.name}: ${e.message}`; } };
function probes(entry, team) {
  const out = []; const people = Object.keys(entry.people); const defs = entry.item;
  const seqs = [1, 2]; const status = defs.status.values;
  const items = seqs.map((seq, i) => ({ seq, slug: `${seq}-x`, name: `item ${seq}`, team, repository: 'acme/app', branch: 'main', archived: false, body: '',
    fields: { ...Object.fromEntries(Object.entries(defs).map(([f, d]) => [f, defaultOf(d)])), status: status[i % status.length] } }));
  const ctx = { entry, team, caller: people[0], items, session: { repository: 'acme/app', id: 's', branch: 'main', commit: 'c' }, now: '2026-11-09T12:00:00Z' };
  const steps = [...new Set(entry.rules.table.flatMap(r => (Array.isArray(r.step) ? r.step : [r.step])).filter(s => typeof s === 'string' && s !== '*'))];
  for (const s of steps) for (const item of items) {
    // A value that does not fit a field is refused whatever the file says, so a step passes when some value of the argument is accepted.
    const run = v => () => { const args = Object.fromEntries(stepArgs(entry, s).map(a => [a, v])); return s === 'new' ? create({ ...ctx, args: { ...args, name: 'n' } }, 3) : step({ ...ctx, step: s, item, args }); };
    out.push([`${s}:${item.seq}`, () => { let last = 'ok'; for (const v of ['1', '2', '0', 'x', status[0], status.at(-1), people[0]]) { last = outcome(run(v)); if (last === 'ok' || last === 'exit 1') return; } throw new Error(last); }]);
  }
  out.push(['pop', () => pop(ctx)]);
  for (const name of Object.keys(entry.rules.filters)) out.push([`filter:${name}`, () => filter(ctx, name)]);
  out.push(['queue', () => queue(ctx)]);
  return out;
}

test('soundness: a mutated template that validate accepts is never refused by the evaluator for its own shape', () => {
  const r = prng(20261110); let accepted = 0; let refused = 0; let offeredWrites = 0;
  for (const [name, file] of Object.entries(TEMPLATES)) {
    const team = Object.keys(file)[0]; const baseline = new Map(probes(file[team], team).map(([k, fn]) => [k, outcome(fn)]));
    for (let i = 0; i < 1000; i++) {
      const mutated = mutate(file, r); const found = validate(mutated);
      for (const f of found) assert.ok(f.fix && f.problem, `${name}: a finding without a fix`);
      if (errors(found).length) { refused++; if (errors(found).some(f => /writes it into a field/.test(f.problem))) offeredWrites++; continue; }
      if (!mutated[team]) continue;
      accepted++;
      for (const [k, fn] of probes(mutated[team], team)) {
        const got = outcome(fn);
        if (got === 'exit 2' || got.startsWith('throws')) assert.equal(got, baseline.get(k) ?? 'ok', `${name}: validate accepted ${JSON.stringify(mutated[team]).slice(0, 100000)} but ${k} gives ${got}`);
      }
    }
  }
  assert.ok(accepted > 100 && refused > 100, `${accepted} accepted, ${refused} refused`);
  assert.ok(offeredWrites > 0, 'the mutations reach a pop step that writes an argument');
});
