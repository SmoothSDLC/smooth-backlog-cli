import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Refusal } from '../../src/team/rules/expression.js';
import { step } from '../../src/team/rules/step.js';
import { filter, pop, queue } from '../../src/team/rules/pop.js';

const def = { status: { type: 'text', default: 'open', values: ['open', 'doing', 'done'], final: ['done'] }, owner: { type: 'person', default: '' } };
const table = [{ id: 'take', step: 'take', when: { is: ['$item.owner', ''] }, do: { set: { status: 'doing', owner: '$caller' } } }, { id: 'other', step: 'other', do: { set: { status: 'doing' } } }];
const make = (pop, filters = { open: { when: { is: ['$item.status', 'open'] } }, broken: { when: { is: ['$item.status'] } } }) => ({ people: { ann: ['dev'] }, item: def, rules: { table, pop, filters } });
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
  // take is refused for items 1 and 2 (they have an owner): the second entry's step would take item 1 first, but the first entry wins on item 3.
  const ctx = run(make([{ id: 'first', step: 'take' }, { id: 'second', step: 'other' }]), items);
  assert.deepEqual([pop(ctx).entry, pop(ctx).item], ['first', 3]);
  assert.equal(pop({ ...ctx, skip: new Set([3]) }).entry, 'second');
  assert.equal(pop({ ...ctx, skip: new Set([3]) }).item, 1);
  assert.throws(() => pop(run(make([{ id: 'bad', step: 'take', when: { is: ['$item.status'] } }]), items)), e => e instanceof Refusal && e.exitCode === 2 && e.message === 'is takes a list of two values');
  assert.throws(() => pop(run(make([{ id: 'p', step: 'take' }]), [item(1)], { entry: { ...make([{ id: 'p', step: 'take' }]), rules: { table: [{ id: 'x', step: 'take', do: 5 }], pop: [{ id: 'p', step: 'take' }], filters: {} } } })),
    e => e instanceof Refusal && e.exitCode === 2);
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
  assert.throws(() => filter(ctx, 'nope'), e => e instanceof Refusal && e.exitCode === 1 && e.message === 'team t has no filter nope (filters: open, broken)');
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
