import test from 'node:test';
import assert from 'node:assert/strict';
import { Refusal } from '../../src/team/rules/expression.js';
import { EFFECTS, SUPPORTED, decide, step, stepArgs, typed } from '../../src/team/rules/step.js';

const def = { status: { type: 'text', default: 'open', values: ['open', 'done'] }, owner: { type: 'person' }, estimate: { type: 'number', default: 0 }, flag: { type: 'boolean', default: false },
  parent: { type: 'item', default: null }, deps: { type: 'items', default: [] }, tags: { type: 'list', default: [] } };
const table = [
  { id: 'big', step: 'estimate', when: { '>=': ['$arg.estimate', 9] }, deny: 'estimate {$arg.estimate} is above the limit' },
  { id: 'est', step: 'estimate', do: { set: { estimate: '$arg.estimate' } } },
  { id: 'dep', step: 'link', do: { add: { deps: '$arg.on' }, set: { status: 'done' } } },
  { id: 'unlink', step: 'unlink', do: { remove: { deps: '$arg.on' } } },
  { id: 'par', step: 'parent', do: { set: { parent: '$arg.to' } } },
  { id: 'bind', step: 'bind', do: { team: 't' } },
];
const entry = { people: { ann: ['lead'] }, item: def, rules: { table } };
const item = (seq, fields = {}, more = {}) => ({ seq, slug: `${seq}-x`, name: `item ${seq}`, team: 't', repository: 'acme/app', branch: 'main', archived: false, body: '',
  fields: { status: 'open', estimate: 0, deps: [], flag: false, parent: null, tags: [], ...fields }, ...more });
const run = (name, args, items = [item(1), item(2)], seq = 1) => step({ entry, team: 't', caller: 'ann', items, args, session: { repository: 'acme/app' }, now: '2026-11-09T12:00:00Z', step: name,
  item: items.find(i => i.seq === seq) });
const refuses = (fn, exit, re) => assert.throws(fn, e => e instanceof Refusal && e.exitCode === exit && re.test(e.message));

test('items are never changed and the result holds changed copies with before and after', () => {
  const items = [item(1), item(2)]; const snap = JSON.stringify(items);
  const r = run('link', { on: '2' }, items);
  assert.equal(JSON.stringify(items), snap);
  assert.deepEqual(r.items.get(1).fields.deps, [2]); assert.equal(r.rule, 'dep');
  assert.deepEqual(r.changes.get(1), { deps: [[], [2]], status: ['open', 'done'] });
});

test('a refusal writes nothing and names the rule; a step no rule allows is refused by default', () => {
  const items = [item(1), item(2)]; const snap = JSON.stringify(items);
  refuses(() => run('estimate', { estimate: '12' }, items), 1, /^estimate 12 is above the limit \(rule big\)$/);
  refuses(() => run('nothing', {}, items), 1, /no rule of team t allows the step nothing on item 1/);
  assert.equal(JSON.stringify(items), snap);
  assert.equal(decide({ entry, team: 't', step: 'estimate', item: items[0], args: { estimate: '3' }, session: {} }).rule, 'est');
});

test('the coded checks: archived item, other team, item without a team no rule binds', () => {
  refuses(() => run('link', { on: '2' }, [item(1, {}, { archived: true }), item(2)]), 1, /archived/);
  refuses(() => run('link', { on: '2' }, [item(1, {}, { team: 'other' }), item(2)]), 1, /belongs to team other/);
  refuses(() => run('link', { on: '2' }, [item(1, {}, { team: '' }), item(2)]), 1, /belongs to no team/);
});

test('the arguments of a step: bare, inside a longer text, and refused when unknown (exit 2)', () => {
  assert.deepEqual(stepArgs(entry, 'estimate'), ['estimate']);
  assert.deepEqual(stepArgs(entry, 'link'), ['on']);
  assert.deepEqual(stepArgs(entry, 'new'), ['name']);
  refuses(() => run('link', { on: '2', x: '1' }), 2, /takes no --x \(it takes: --on\)/);
  refuses(() => run('bind', { on: '2' }), 2, /takes no --on \(it takes: no argument\)/);
});

test('typed gives each of the eight types its value and refuses a wrong one with exit 2', () => {
  assert.equal(typed(entry, 'estimate', '3', 'acme/app'), 3);
  refuses(() => typed(entry, 'estimate', 'x', 'acme/app'), 2, /is not a number/);
  assert.equal(typed(entry, 'flag', 'true', 'acme/app'), true);
  refuses(() => typed(entry, 'flag', 'yes', 'acme/app'), 2, /is not true or false/);
  assert.equal(typed(entry, 'parent', '', 'acme/app'), null); assert.equal(typed(entry, 'parent', '4', 'acme/app'), 4);
  refuses(() => typed(entry, 'parent', 'q', 'acme/app'), 2, /is not an item number/);
  assert.deepEqual(typed(entry, 'deps', '1, 2', 'acme/app'), [1, 2]);
  refuses(() => typed(entry, 'deps', 'a', 'acme/app'), 2, /is not a list of item numbers/);
  assert.deepEqual(typed(entry, 'tags', 'a, b', 'acme/app'), ['a', 'b']);
  assert.equal(typed(entry, 'owner', 'ann', 'acme/app'), 'ann');
  refuses(() => typed(entry, 'owner', 'zed', 'acme/app'), 2, /is not a person of the team \(ann\)/);
  refuses(() => typed(entry, 'status', 'late', 'acme/app'), 2, /is not one of open, done/);
  assert.equal(typed(entry, 'status', 'done', 'acme/app'), 'done');
  refuses(() => typed(entry, 'nope', 'x', 'acme/app'), 2, /not a field/);
});

test('add keeps a list without doubles and remove drops entries', () => {
  const items = [item(1, { deps: [2] }), item(2), item(3)];
  assert.deepEqual(run('link', { on: '3' }, items).items.get(1).fields.deps, [2, 3]);
  assert.deepEqual(run('link', { on: '2' }, items).items.get(1).fields.deps, [2]);
  assert.deepEqual(run('unlink', { on: '2' }, items).items.get(1).fields.deps, []);
});

test('a written reference names an existing item other than itself; a foreign form of the own folder is a local number', () => {
  refuses(() => run('parent', { to: '9' }), 2, /field parent of item 1: no item 9/);
  refuses(() => run('parent', { to: '1' }), 2, /cannot name itself/);
  refuses(() => run('parent', { to: 'acme/app#1' }), 2, /cannot name itself/);
  refuses(() => run('parent', { to: 'acme/app#9' }), 2, /no item 9/);
  assert.deepEqual(run('link', { on: 'acme/other#9' }).items.get(1).fields.deps, ['acme/other#9']);
  refuses(() => run('parent', { to: 'acme/other#9' }), 2, /is not an item number/);
  assert.equal(run('parent', { to: 'acme/app#2' }).items.get(1).fields.parent, 2);
  assert.deepEqual(run('link', { on: 'acme/app#2' }).items.get(1).fields.deps, [2]);
});

// ---- review fixes: malformed rules, unsupported effects, typed edges, boundaries ----
const T = 'acme/app';
const def2 = { ...def, when: { type: 'time' }, note: { type: 'text', default: '' }, cost: { type: 'number', default: 0 }, kids: { type: 'items', default: [] } };
const mk = (table, items) => ({ entry: { people: { ann: ['lead'] }, item: def2, rules: { table } }, items });
const go = (table, name, args = {}, items = [item(1), item(2)], seq = 1) => {
  const e = { people: { ann: ['lead'] }, item: def2, rules: { table } };
  return step({ entry: e, team: 't', caller: 'ann', items, args, session: { repository: T }, now: '2026-11-09T12:00:00Z', step: name, item: items.find(i => i.seq === seq) });
};
const rule = (e, exit, re, id) => assert.throws(e, x => x instanceof Refusal && x.exitCode === exit && re.test(x.message) && x.rule === id);

test('add and remove on a field that is not a list field are refused (exit 2)', () => {
  refuses(() => go([{ id: 'a', step: 's', do: { add: { status: 'x' } } }], 's'), 2, /^field status is not a list field$/);
  refuses(() => go([{ id: 'a', step: 's', do: { remove: { estimate: 1 } } }], 's'), 2, /^field estimate is not a list field$/);
  refuses(() => go([{ id: 'a', step: 's', do: { add: { nope: 1 } } }], 's'), 2, /not a field of the item definition/);
});

test('malformed rules are refused (exit 2) and name the rule', () => {
  rule(() => go([{ id: 'x', step: 's', do: { zap: {} } }], 's'), 2, /zap is not an effect/, 'x');
  rule(() => go([{ id: 'x', step: 's' }], 's'), 2, /exactly one of deny and do/, 'x');
  rule(() => go([{ id: 'x', step: 's', deny: 'no', do: {} }], 's'), 2, /exactly one of deny and do/, 'x');
  for (const bad of [[], 'x', null, 3]) rule(() => go([{ id: 'x', step: 's', do: bad }], 's'), 2, /do must be an object/, 'x');
  for (const k of ['set', 'add', 'remove']) for (const bad of [[], 'x', null]) rule(() => go([{ id: 'x', step: 's', do: { [k]: bad } }], 's'), 2, new RegExp(`${k} must be an object`), 'x');
});

test('an effect not implemented yet is refused (exit 2) through the one SUPPORTED list', () => {
  assert.deepEqual(SUPPORTED, ['set', 'add', 'remove']);
  for (const k of EFFECTS.filter(k => !SUPPORTED.includes(k))) rule(() => go([{ id: 'x', step: 's', do: { [k]: k === 'say' ? 'hi' : true } }], 's'), 2, new RegExp(`^effect ${k} is not supported yet`), 'x');
});

test('typed person: only own keys of people ("constructor" is no person)', () => {
  refuses(() => typed(entry, 'owner', 'constructor', T), 2, /is not a person of the team/);
  refuses(() => typed(entry, 'owner', '__proto__', T), 2, /is not a person/);
  assert.equal(typed(entry, 'owner', '', T), '');
});

test('an array for a text, person or time field is refused, not coerced', () => {
  for (const f of ['status', 'owner', 'when']) refuses(() => typed({ ...entry, item: def2 }, f, ['open'], T), 2, /is a list, and this field takes one value/);
  assert.equal(typed({ ...entry, item: def2 }, 'when', '2026-11-09T12:00:00Z', T), '2026-11-09T12:00:00Z');
});

test('typed: negative and decimal numbers, true and false, an items array, a foreign entry of another folder', () => {
  assert.equal(typed(entry, 'estimate', '-5', T), -5); assert.equal(typed(entry, 'estimate', '60.9', T), 60.9); assert.equal(typed(entry, 'estimate', 2.5, T), 2.5);
  refuses(() => typed(entry, 'estimate', ' 7', T), 2, /is not a number/); refuses(() => typed(entry, 'estimate', '7 ', T), 2, /is not a number/);
  assert.equal(typed(entry, 'flag', 'false', T), false); assert.equal(typed(entry, 'flag', true, T), true); assert.equal(typed(entry, 'flag', false, T), false);
  assert.deepEqual(typed(entry, 'deps', [1, '2'], T), [1, 2]);
  assert.deepEqual(typed(entry, 'deps', ['acme/other#9', 3], T), ['acme/other#9', 3]);
  assert.deepEqual(typed(entry, 'deps', 'acme/other#9, 4', T), ['acme/other#9', 4]);
});

test('list splitting: set splits a comma-joined text, add and remove do not', () => {
  const t = (kind, v, fields) => go([{ id: 'x', step: 's', do: { [kind]: { tags: v } } }], 's', {}, [item(1, fields)]).items.get(1).fields.tags;
  assert.deepEqual(t('set', 'a, b', {}), ['a', 'b']);
  assert.deepEqual(t('add', 'a, b', {}), ['a, b']);
  assert.deepEqual(t('remove', 'a, b', { tags: ['a', 'b', 'a, b'] }), ['a', 'b']);
  refuses(() => go([{ id: 'x', step: 's', do: { add: { kids: '1, 2' } } }], 's', {}, [item(1), item(2)]), 2, /is not a list of item numbers/);
});

test('first match decides: an earlier rule whose when fails is skipped; step as a list and "*"', () => {
  const table = [{ id: 'a', step: 'go', when: { is: ['$item.status', 'done'] }, deny: 'done' }, { id: 'b', step: ['x', 'go'], do: { set: { cost: 1 } } }, { id: 'c', step: '*', deny: 'star' }];
  assert.equal(go(table, 'go').rule, 'b'); assert.equal(go(table, 'x').rule, 'b');
  rule(() => go(table, 'go', {}, [item(1, { status: 'done' })]), 1, /^done \(rule a\)$/, 'a');
  rule(() => go(table, 'other'), 1, /^star \(rule c\)$/, 'c');
});

test('an item without a team that a rule binds takes the defaults; the binding effect itself waits for B08c', () => {
  rule(() => go([{ id: 'adopt', step: 's', do: { team: 't', set: { cost: 1 } } }], 's', {}, [item(1, { cost: undefined }, { team: '', fields: {} })]), 2, /effect team is not supported yet/, 'adopt');
});

test('remove of an absent value changes nothing; add of a foreign entry keeps it; a dangling number stays and other steps work', () => {
  const r = go([{ id: 'x', step: 's', do: { remove: { deps: 7 } } }], 's', {}, [item(1, { deps: [2] }), item(2)]);
  assert.deepEqual(r.items.get(1).fields.deps, [2]); assert.deepEqual(r.changes.get(1), {});
  assert.deepEqual(go([{ id: 'x', step: 's', do: { add: { deps: 'acme/other#9' } } }], 's', {}, [item(1, { deps: [2] }), item(2)]).items.get(1).fields.deps, [2, 'acme/other#9']);
  const d = [item(1, { deps: [99] }), item(2)]; // 99 is gone: the step wrote cost only, so deps is not checked
  assert.equal(go([{ id: 'x', step: 's', do: { set: { cost: 3 } } }], 's', {}, d).items.get(1).fields.cost, 3);
  // a step that writes the list checks the whole list, so a dangling number already in it is named (exit 2); removing it is the way out
  refuses(() => go([{ id: 'x', step: 's', do: { add: { deps: 2 } } }], 's', {}, d), 2, /field deps of item 1: no item 99/);
  assert.deepEqual(go([{ id: 'x', step: 's', do: { remove: { deps: 99 } } }], 's', {}, d).items.get(1).fields.deps, []);
});

test('a reference to an archived item is allowed', () => {
  assert.equal(go([{ id: 'x', step: 's', do: { set: { parent: 2 } } }], 's', {}, [item(1), item(2, {}, { archived: true })]).items.get(1).fields.parent, 2);
});

test('unchanged fields are absent from the changes Map', () => {
  const r = go([{ id: 'x', step: 's', do: { set: { cost: 0, status: 'done' } } }], 's');
  assert.deepEqual(r.changes.get(1), { status: ['open', 'done'] });
});

test('stepArgs with a "*" rule, and an argument used only in a deny or a when', () => {
  const table = [{ id: 'w', step: 's', when: { is: ['$arg.mode', 'x'] }, deny: 'no {$arg.why}' }, { id: 'all', step: '*', do: { set: { cost: '$arg.n' } } }, { id: 'o', step: 'other', do: { set: { cost: '$arg.m' } } }];
  assert.deepEqual(stepArgs({ rules: { table } }, 's'), ['mode', 'n', 'why']);
  assert.deepEqual(stepArgs({ rules: { table } }, 'other'), ['m', 'n']);
  rule(() => go(table, 's', { mode: 'x', why: 'later' }), 1, /^no later \(rule w\)$/, 'w');
});

test('the .rule of each refusal kind', () => {
  const table = [{ id: 'd', step: 'deny', deny: 'no' }, { id: 'a', step: 'bad', do: { set: { cost: 'x' } } }, { id: 'b', step: 'bind', do: { set: { cost: 1 } } }];
  rule(() => go(table, 'deny'), 1, /\(rule d\)/, 'd');
  rule(() => go(table, 'none'), 1, /no rule of team t allows/, null);
  rule(() => go(table, 'deny', {}, [item(1, {}, { archived: true })]), 1, /archived/, null);
  rule(() => go(table, 'deny', {}, [item(1, {}, { team: 'o' })]), 1, /belongs to team o/, null);
  rule(() => go(table, 'bind', {}, [item(1, {}, { team: '' })]), 1, /belongs to no team/, 'b');
  rule(() => go(table, 'bad'), 2, /is not a number/, null);
  rule(() => go(table, 'deny', { q: 1 }), 2, /takes no --q/, null);
  rule(() => go(table, 'deny', {}, []), 1, /^the item does not exist$/, null);
});

test('step with no item is refused (exit 1)', () => {
  refuses(() => step({ entry, team: 't', caller: 'ann', items: [], args: {}, session: { repository: T }, now: '', step: 'link', item: undefined }), 1, /^the item does not exist$/);
});
