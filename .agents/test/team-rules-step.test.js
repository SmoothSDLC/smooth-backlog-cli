import test from 'node:test';
import assert from 'node:assert/strict';
import { Refusal } from '../../src/team/rules/expression.js';
import { decide, step, stepArgs, typed } from '../../src/team/rules/step.js';

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
