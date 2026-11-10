import test from 'node:test';
import assert from 'node:assert/strict';
import { Refusal } from '../../src/team/rules/expression.js';
import { create, step } from '../../src/team/rules/step.js';

const def = { status: { type: 'text', default: 'open' }, parent: { type: 'item', default: null }, deps: { type: 'items', default: [] }, gate: { type: 'items', default: [] } };
const T = 'acme/app'; const NOW = '2026-11-09T12:00:00Z';
const item = (seq, fields = {}, more = {}) => ({ seq, slug: `${seq}-x`, name: `item ${seq}`, team: 't', repository: T, branch: 'main', archived: false, body: '', fields: { status: 'open', deps: [], gate: [], parent: null, ...fields }, ...more });
const ctx = (table, name, args = {}, items = [item(1), item(2)], seq = 1) => ({ entry: { people: { ann: ['lead'] }, item: def, rules: { table } }, team: 't', caller: 'ann', items, args,
  session: { repository: T, branch: 'main' }, now: NOW, step: name, item: items.find(i => i.seq === seq) });
const go = (...a) => step(ctx(...a));
const refuses = (fn, exit, re) => assert.throws(fn, e => e instanceof Refusal && e.exitCode === exit && re.test(e.message));
const one = do_ => [{ id: 'x', step: 's', do: do_ }];

test('note returns heading, filled text and author; a reference text is read as a value; the item body is untouched', () => {
  const r = go(one({ note: { heading: 'Why', text: 'moved {$arg.to}' } }), 's', {}, undefined);
  assert.deepEqual(r.notes, [{ heading: 'Why', text: 'moved ', by: 'ann' }]);
  assert.deepEqual(go(one({ note: { heading: 'H', text: '$item.status' } }), 's').notes, [{ heading: 'H', text: 'open', by: 'ann' }]);
  assert.equal(r.items.get(1).body, ''); assert.deepEqual(go(one({ set: { status: 'a' } }), 's').notes, []);
  refuses(() => go(one({ note: 'text' }), 's'), 2, /^rule x: note must be an object with a heading text and a text$/);
  refuses(() => go(one({ note: { text: 'a' } }), 's'), 2, /note must be an object/);
});

test('related changes the other items in one change and lists the before and after of each', () => {
  const r = go(one({ set: { status: 'done' }, related: [{ items: '$arg.on', add: { deps: '$item.seq' } }] }), 's', { on: '2' }, [item(1), item(2, { deps: [5] }), item(5)]);
  assert.deepEqual(r.items.get(2).fields.deps, [5, 1]); assert.deepEqual(r.items.get(1).fields.deps, []);
  assert.deepEqual(r.changes.get(2), { deps: [[5], [5, 1]] }); assert.deepEqual(r.changes.get(1), { status: ['open', 'done'] });
});

test('related: the unbinding removes, a second entry on the same item builds on the first, a missing, foreign-team, archived or other-folder item is refused naming it', () => {
  const items = [item(1), item(2, { deps: [1, 3] }), item(3)];
  assert.deepEqual(go(one({ related: [{ items: [2], remove: { deps: 1 } }, { items: [2], add: { gate: 3 } }] }), 's', {}, items).items.get(2).fields, { status: 'open', deps: [3], gate: [3], parent: null });
  refuses(() => go(one({ related: [{ items: [9], add: { deps: 1 } }] }), 's'), 1, /^item 9 does not exist \(rule x\)$/);
  refuses(() => go(one({ related: [{ items: [2], add: { deps: 1 } }] }), 's', {}, [item(1), item(2, {}, { team: 'u' })]), 1, /^item 2 is not an open item of team t in acme\/app; rule x cannot change it$/);
  refuses(() => go(one({ related: [{ items: [2], add: { deps: 1 } }] }), 's', {}, [item(1), item(2, {}, { archived: true })]), 1, /item 2 is not an open item/);
  refuses(() => go(one({ related: [{ items: ['acme/other#2'], add: { deps: 1 } }] }), 's'), 1, /item 2 does not exist|item 2 is not an open item/);
  refuses(() => go(one({ related: [{ items: [2], add: { deps: 7 } }] }), 's'), 2, /^field deps of item 2: no item 7$/);
  refuses(() => go(one({ related: { items: 2 } }), 's'), 2, /related must be a list of objects, each with items/);
});

test('place is returned as written: first, last, before or after a number (values read), null without it; anything else is refused', () => {
  assert.equal(go(one({ place: 'first' }), 's').place, 'first');
  assert.deepEqual(go(one({ place: { before: '$arg.n' } }), 's', { n: '4' }, undefined).place, { before: '4' });
  assert.deepEqual(go(one({ place: { after: 2 } }), 's').place, { after: 2 });
  assert.equal(go(one({ set: { status: 'a' } }), 's').place, null);
  for (const bad of ['middle', { before: 1, after: 2 }, { under: 1 }, 5, null]) refuses(() => go(one({ place: bad }), 's'), 2, /^rule x: place must be/);
});

test('say fills its placeholders; it must be a text', () => {
  assert.equal(go(one({ say: 'item {$item.seq} is {$item.status}' }), 's').say, 'item 1 is open');
  assert.equal(go(one({ set: { status: 'a' } }), 's').say, null);
  refuses(() => go(one({ say: 3 }), 's'), 2, /^rule x: say must be a text$/);
});

test('team binds only to the command team or unbinds with an empty text, never to another team', () => {
  const free = [item(1, {}, { team: '' }), item(2)];
  const r = go(one({ team: 't' }), 's', {}, free);
  assert.equal(r.items.get(1).team, 't'); assert.deepEqual(r.changes.get(1).team, ['', 't']);
  assert.equal(go(one({ team: '' }), 's').items.get(1).team, '');
  refuses(() => go(one({ team: 'u' }), 's'), 2, /^rule x: the team effect binds only to team t or unbinds with "";/);
  refuses(() => go(one({ team: 'u' }), 's', {}, free), 2, /binds only to team t/);
  refuses(() => go(one({ set: { status: 'a' } }), 's', {}, free), 1, /belongs to no team/);
});

test('branch is read as a value and returned as text on the item and in the changes', () => {
  const r = go(one({ branch: '$arg.to' }), 's', { to: 'release' }, undefined);
  assert.equal(r.items.get(1).branch, 'release'); assert.deepEqual(r.changes.get(1), { branch: ['main', 'release'] });
});

test('archive and delete act only on the JSON value true; the item copy is archived, the deletion is data for the caller', () => {
  const r = go(one({ archive: true }), 's');
  assert.equal(r.items.get(1).archived, true); assert.deepEqual(r.changes.get(1), { archived: [false, true] }); assert.equal(r.delete, false);
  for (const v of ['true', 1, 'yes', false, null]) { const q = go(one({ archive: v, delete: v }), 's'); assert.equal(q.items.get(1).archived, false); assert.equal(q.delete, false); }
  assert.equal(go(one({ delete: true }), 's').delete, true);
});

test('a refused step leaves the items as they were, whatever the effects', () => {
  const items = [item(1), item(2)]; const snap = JSON.stringify(items);
  refuses(() => go(one({ set: { status: 'a' }, related: [{ items: [9], add: { deps: 1 } }], archive: true }), 's', {}, items), 1, /item 9/);
  assert.equal(JSON.stringify(items), snap);
});

test('new: the item takes the number it is given, the slug of the name, the defaults, the caller team and folder; the effects of the rule apply', () => {
  const c = ctx([{ id: 'n', step: 'new', do: { set: { status: 'ready', parent: '$arg.parent' }, related: [{ items: '$arg.parent', add: { deps: '$item.seq' } }], place: { before: '$arg.parent' } } }], 'new', { name: 'Child -- A!', parent: '1' });
  const r = create(c, 7);
  const n = r.items.get(7);
  assert.equal(n.slug, '007-child-a'); assert.equal(n.name, 'Child -- A!'); assert.equal(n.team, 't'); assert.equal(n.repository, T); assert.equal(n.branch, 'main');
  assert.deepEqual(n.fields, { status: 'ready', deps: [], gate: [], parent: 1 }); assert.deepEqual(r.items.get(1).fields.deps, [7]); assert.deepEqual(r.place, { before: '1' });
  assert.equal(c.items.length, 2);
  refuses(() => create(ctx([{ id: 'n', step: 'new', deny: 'no' }], 'new', { name: 'a' }), 7), 1, /^no \(rule n\)$/);
  refuses(() => create(ctx(one({ set: { status: 'a' } }), 'new', { name: 'a', extra: 'b' }), 7), 2, /takes no --extra/);
});

test('branch: a value the caller did not give, an empty text or a non-text value is refused (exit 1) and names the rule', () => {
  for (const b of ['$arg.to', '', 5, null, true]) refuses(() => go(one({ branch: b }), 's'), 1, /^the branch to move to is empty \(rule x\)$/);
});

test('related: a key other than items, set, add and remove is refused (exit 2) naming it; an item cannot be related to itself (exit 1)', () => {
  refuses(() => go(one({ related: [{ items: [2], put: { status: 'a' } }] }), 's'), 2, /^rule x: related entry has the key put, which is not items, set, add or remove$/);
  refuses(() => go(one({ related: [{ items: [1], set: { status: 'a' } }] }), 's'), 1, /^an item cannot be related to itself \(rule x\)$/);
});

test('related: an item given in the foreign form of another folder is never the item of this folder, even when that number exists here: it is refused as missing', () => {
  refuses(() => go(one({ related: [{ items: ['acme/other#9'], add: { deps: 1 } }] }), 's'), 1, /^item 9 does not exist \(rule x\)$/);
  refuses(() => go(one({ related: [{ items: ['acme/other#2'], add: { deps: 1 } }] }), 's'), 1, /^item 2 does not exist \(rule x\)$/);
});

test('say with an empty text is an empty text; team takes its value from an argument; delete and archive together with set', () => {
  assert.equal(go(one({ say: '' }), 's').say, null);
  assert.equal(go(one({ team: '$arg.t' }), 's', { t: '' }, undefined).items.get(1).team, '');
  assert.equal(go(one({ team: '$arg.t' }), 's', { t: 't' }, undefined).items.get(1).team, 't');
  refuses(() => go(one({ team: '$arg.t' }), 's', { t: 'u' }, undefined), 2, /binds only to team t/);
  const r = go(one({ set: { status: 'z' }, archive: true, delete: true }), 's');
  assert.equal(r.items.get(1).archived, true); assert.equal(r.items.get(1).fields.status, 'z'); assert.equal(r.delete, true);
  assert.deepEqual(r.changes.get(1), { status: ['open', 'z'], archived: [false, true] });
});

test('new: a name with no letter or digit gives the slug "phase"; a number of 1000 or more is not cut; an empty name is refused by the caller before the evaluator, which then gives the slug "phase"', () => {
  const slug = (name, n) => create(ctx([{ id: 'n', step: 'new', do: {} }], 'new', { name }, []), n).items.get(n).slug;
  assert.equal(slug('!!!', 3), '003-phase');
  assert.equal(slug('x', 1000), '1000-x'); assert.equal(slug('x', 1234), '1234-x');
  assert.equal(slug('', 2), '002-phase');
});
