import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Refusal } from '../../src/team/rules/expression.js';
import { step } from '../../src/team/rules/step.js';
import { filter, pop, queue } from '../../src/team/rules/pop.js';

const def = { status: { type: 'text', default: 'open', values: ['open', 'doing', 'done'], final: ['done'] }, owner: { type: 'person', default: '' } };
const table = [{ id: 'take', step: 'take', when: { is: ['$item.owner', ''] }, do: { set: { status: 'doing', owner: '$caller' } } }, { id: 'other', step: 'other', do: { set: { status: 'doing' } } }];
const FILTERS = { open: { when: { is: ['$item.status', 'open'] } }, none: { when: { is: ['$item.status', 'doing'] } }, broken: { when: { is: ['$item.status'] } } };
const make = (pop, filters = FILTERS, rules = table) => ({ people: { ann: ['dev'] }, item: def, rules: { table: rules, pop, filters } });
const item = (seq, fields = {}, more = {}) => ({ seq, slug: `${seq}-x`, name: `item ${seq}`, team: 't', repository: 'acme/app', branch: 'main', archived: false, body: '', fields: { status: 'open', owner: '', ...fields }, ...more });
const run = (entry, items, more = {}) => ({ entry, team: 't', caller: 'ann', items, args: {}, session: { repository: 'acme/app' }, now: '2026-11-09T12:00:00Z', ...more });

test('the queue holds open items of the team in the session folder; order and skip shape it', () => {
  const items = [item(1), item(2, { status: 'done' }), item(3, {}, { archived: true }), item(4, {}, { team: 'u' }), item(5, {}, { repository: 'acme/other' }), item(6)];
  const ctx = run(make([]), items);
  assert.deepEqual(queue(ctx).map(i => i.seq), [1, 6]);
  assert.deepEqual(queue({ ...ctx, order: [6, 1, 99] }).map(i => i.seq), [6, 1]);
  assert.deepEqual(queue({ ...ctx, order: [6, 1], skip: new Set([6]) }).map(i => i.seq), [1]);
});

test('an item in the skip set is not offered and the set is not changed; all skipped is idle', () => {
  const ctx = run(make([{ id: 'p', step: 'take' }]), [item(1), item(2)]); const skip = new Set([1]);
  assert.equal(pop({ ...ctx, skip }).item, 2); assert.deepEqual([...skip], [1]);
  assert.deepEqual(pop({ ...ctx, skip: new Set([1, 2]) }), { action: 'idle' });
});

test('the offered item follows the order; an item missing from the order is never offered', () => {
  const ctx = run(make([{ id: 'p', step: 'take' }]), [item(1), item(2), item(3)]);
  assert.equal(pop({ ...ctx, order: [3, 1, 2] }).item, 3);
  assert.equal(pop({ ...ctx, order: [2] }).item, 2);
  assert.deepEqual(pop({ ...ctx, order: [] }), { action: 'idle' });
});

test('a refusal moves to the next item, then to the next entry only after every item failed; a malformed when is exit 2', () => {
  const items = [item(1, { owner: 'ann' }), item(2, { owner: 'ann' }), item(3)];
  // take is refused for items 1 and 2 (they have an owner), so the first entry offers item 3; with item 3 skipped the second entry offers item 1.
  const ctx = run(make([{ id: 'first', step: 'take' }, { id: 'second', step: 'other' }]), items);
  assert.deepEqual([pop(ctx).entry, pop(ctx).item], ['first', 3]);
  assert.equal(pop({ ...ctx, skip: new Set([3]) }).entry, 'second');
  assert.equal(pop({ ...ctx, skip: new Set([3]) }).item, 1);
  assert.throws(() => pop(run(make([{ id: 'bad', step: 'take', when: { is: ['$item.status'] } }]), items)), e => e instanceof Refusal && e.exitCode === 2 && e.message === 'is takes a list of two values');
  const broken = make([{ id: 'p', step: 'take' }], FILTERS, [{ id: 'x', step: 'take', do: 5 }]);
  assert.throws(() => pop(run(broken, [item(1)])), e => e instanceof Refusal && e.exitCode === 2);
});

test('the answer carries the deciding rule and the step result, equal to what step returns', () => {
  const ctx = run(make([{ id: 'p', step: 'take' }]), [item(1)]);
  const got = pop(ctx); const want = step({ ...ctx, item: ctx.items[0], step: 'take' });
  assert.equal(got.rule, 'take');
  assert.deepEqual(got.result, want);
  assert.equal(got.result.items.get(1).fields.owner, 'ann');
});

test('an unknown filter is exit 1; a malformed when is exit 2; the filter follows the order and ignores skip', () => {
  const ctx = run(make([]), [item(1), item(2), item(3, { status: 'doing' })]);
  assert.throws(() => filter(ctx, 'nope'), e => e instanceof Refusal && e.exitCode === 1 && e.message === 'team t has no filter nope (filters: open, none, broken)');
  assert.throws(() => filter(ctx, 'broken'), e => e instanceof Refusal && e.exitCode === 2);
  assert.deepEqual(filter({ ...ctx, order: [2, 1], skip: new Set([2]) }, 'open'), [2, 1]);
});

test('worst case of 300 open items of the parallel template stays under 2 seconds', () => {
  const entry = Object.values(JSON.parse(readFileSync(new URL('../../templates/teams/parallel.json', import.meta.url), 'utf8')))[0];
  const items = Array.from({ length: 300 }, (_, k) => item(k + 1, { status: k < 3 ? 'in progress' : 'ready', holder: k < 3 ? 'member-2' : '', children: [], depends_on: [], handoff: '', checker: '' }));
  const t0 = Date.now(); const got = pop(run(entry, items, { caller: 'member-1' })); const ms = Date.now() - t0;
  assert.deepEqual(got, { action: 'idle' });
  assert.ok(ms < 2000, `pop took ${ms} ms`);
  console.log(`pop of 300 items: ${ms} ms`);
});

const shapeFails = (fn, re) => assert.throws(fn, e => e instanceof Refusal && e.exitCode === 2 && re.test(e.message));

test('a table validation has not seen is exit 2 naming the shape, never a TypeError', () => {
  const ok = make([{ id: 'p', step: 'take' }]); const items = [item(1)];
  for (const pop_ of [undefined, null, 'x', {}, [null], [3]]) shapeFails(() => pop(run(make(pop_), items)), /rules\.pop must be a list/);
  for (const f of [undefined, null, [], { a: null }]) { shapeFails(() => filter(run({ ...ok, rules: { ...ok.rules, filters: f } }, items), 'open'), /rules\.filters must be an object/); }
  const noStatus = { ...ok, item: { owner: def.owner } };
  shapeFails(() => pop(run(noStatus, items)), /no status field/);
  shapeFails(() => filter(run(noStatus, items), 'open'), /no status field/);
  shapeFails(() => queue(run({ ...ok, item: null }, items)), /no status field/);
  shapeFails(() => pop(run({ ...ok, rules: undefined }, items)), /rules\.pop must be a list/);
});

test('a number twice in the order queues the item once', () => {
  const ctx = run(make([]), [item(1), item(2)]);
  assert.deepEqual(queue({ ...ctx, order: [2, 1, 2, 1] }).map(i => i.seq), [2, 1]);
});

test('a pop entry whose step is in no rule is refused by the step and gives idle', () => {
  assert.deepEqual(pop(run(make([{ id: 'p', step: 'ghost' }]), [item(1), item(2)])), { action: 'idle' });
});

test('empty queue and every item refused are idle; a false when moves to the next entry', () => {
  const entries = [{ id: 'never', step: 'take', when: { is: ['$item.status', 'doing'] } }, { id: 'p', step: 'take' }];
  assert.deepEqual(pop(run(make(entries), [])), { action: 'idle' });
  assert.deepEqual(pop(run(make(entries), [item(1, { owner: 'ann' }), item(2, { owner: 'ann' })])), { action: 'idle' });
  const got = pop(run(make(entries), [item(1)]));
  assert.deepEqual([got.entry, got.item], ['p', 1]);
});

test('skip covering every item gives idle with several entries; an order naming a missing item still offers the rest', () => {
  const ctx = run(make([{ id: 'a', step: 'take' }, { id: 'b', step: 'other' }]), [item(1), item(2)]);
  assert.deepEqual(pop({ ...ctx, skip: new Set([1, 2]) }), { action: 'idle' });
  assert.equal(pop({ ...ctx, order: [9, 2] }).item, 2);
  assert.deepEqual(pop({ ...ctx, order: [9] }), { action: 'idle' });
});

test('an item held by the caller is offered when the rules allow it', () => {
  const ctx = run(make([{ id: 'p', step: 'other' }]), [item(1, { owner: 'ann' })]);
  assert.equal(pop(ctx).item, 1);
});

test('a filter on an empty folder and a filter matching nothing give an empty list', () => {
  assert.deepEqual(filter(run(make([]), []), 'open'), []);
  assert.deepEqual(filter(run(make([]), [item(1)]), 'none'), []);
});
