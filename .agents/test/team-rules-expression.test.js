import test from 'node:test';
import assert from 'node:assert/strict';
import { BacklogError } from '../../src/errors.js';
import { Refusal, asList, fill, find, num, same, stepMatches, test as holds, value } from '../../src/team/rules/expression.js';

const entry = { people: { ann: ['lead', 'member'], bob: ['member'] }, item: { status: { type: 'text', default: 'open' }, deps: { type: 'items', default: [] }, estimate: { type: 'number', default: 0 } } };
const item = (seq, fields = {}, more = {}) => ({ seq, slug: `${seq}-x`, name: `item ${seq}`, team: 't', repository: 'acme/app', branch: 'main', archived: false, body: '', fields, ...more });
const ctx = (over = {}) => ({ entry, team: 't', caller: 'ann', items: [item(1, { status: 'done' }), item(2, { status: 'open', deps: [1] }), item(3, { status: 'open' })], args: {},
  session: { repository: 'acme/app', branch: 'main' }, now: '2026-11-09T12:00:00Z', item: item(2, { status: 'open', deps: [1] }), ...over });
const refuses = (fn, exit, re) => assert.throws(fn, e => e instanceof Refusal && e instanceof BacklogError && e.exitCode === exit && re.test(e.message));

test('a Refusal is a BacklogError with a rule and a code per exit', () => {
  const r = new Refusal('no', 1, 'r1'); assert.equal(r.rule, 'r1'); assert.equal(r.code, 'RULE_REFUSED'); assert.equal(r.exitCode, 1);
  assert.equal(new Refusal('bad', 2).code, 'RULE_INVALID');
});

test('references: item, envelope, defaults, arg, caller, session, now, team', () => {
  const c = ctx({ args: { x: '5' } });
  assert.equal(value('$item.status', c), 'open'); assert.equal(value('$item.seq', c), 2); assert.equal(value('$item.estimate', c), 0);
  assert.equal(value('$arg.x', c), '5'); assert.equal(value('$arg.none', c), '');
  assert.equal(value('$caller', c), 'ann'); assert.deepEqual(value('$caller.roles', c), ['lead', 'member']);
  assert.equal(value('$session.repository', c), 'acme/app'); assert.equal(value('$now', c), c.now); assert.equal(value('$team.name', c), 't');
  assert.deepEqual(value('$team.items', c), [1, 2, 3]);
  assert.deepEqual(value('$team.items', ctx({ session: { repository: 'acme/other' } })), []);
  refuses(() => value('$nope.x', c), 2, /unknown reference/);
  refuses(() => value('$caller.zzz', c), 2, /unknown reference/);
});

test('functions: text count length plus age roles_of, and the forms refused', () => {
  const c = ctx();
  assert.equal(value({ text: '$item.seq' }, c), '$item.seq');
  assert.equal(value({ count: { items: '$item.deps', match: { is: ['$it.status', 'done'] } } }, c), 1);
  assert.equal(value({ count: { items: '$team.items' } }, c), 3);
  assert.equal(value({ length: '$item.deps' }, c), 1); assert.equal(value({ length: '' }, c), 0);
  assert.equal(value({ plus: [1, '2', 'x', 3] }, c), 6);
  refuses(() => value({ plus: '$item.estimate' }, c), 2, /plus takes a list/);
  assert.equal(value({ age: '2026-11-09T11:00:00Z' }, c), 3600); assert.equal(value({ age: 'nonsense' }, c), null);
  assert.deepEqual(value({ roles_of: 'bob' }, c), ['member']); assert.deepEqual(value({ roles_of: 'zed' }, c), []);
  refuses(() => value({ nope: 1 }, c), 2, /unknown function/);
  refuses(() => value({ plus: [1], length: 1 }, c), 2, /exactly one key/);
  assert.deepEqual(value(['$caller', 7, { text: 'a' }], c), ['ann', 7, 'a']);
});

test('tests: all any not is in empty >= <= regex contains every some', () => {
  const c = ctx(); const t = x => holds(x, c);
  assert.equal(t({ all: [{ is: ['$item.status', 'open'] }, { not: { is: ['$item.status', 'done'] } }] }), true);
  assert.equal(t({ any: [{ is: [1, 2] }, { is: [2, 2] }] }), true);
  assert.equal(t({ is: [2, '2'] }), true); assert.equal(t({ is: ['2', 2] }), true); assert.equal(t({ is: [2, '2.5'] }), false);
  assert.equal(t({ in: ['a', ['a', 'b']] }), true); assert.equal(t({ in: ['1', '$item.deps'] }), true); assert.equal(t({ in: ['', ''] }), false);
  for (const [v, want] of [['', true], [' ', true], [[], true], ['x', false], [0, false]]) assert.equal(t({ empty: { text: v } }) , typeof v === 'string' ? want : t({ empty: v }));
  assert.equal(t({ empty: '$arg.none' }), true); assert.equal(t({ empty: '$item.deps' }), false);
  assert.equal(t({ '>=': ['60', 60] }), true); assert.equal(t({ '<=': ['60.9', 60] }), false); assert.equal(t({ '>=': ['0x3C', 60] }), false); assert.equal(t({ '<=': [' ', 60] }), false);
  assert.equal(t({ regex: ['abc', '^a.c$'] }), true); assert.equal(t({ regex: ['abd', '^a.c$'] }), false);
  assert.equal(t({ contains: ['hello world', 'wor'] }), true); assert.equal(t({ contains: ['hello', ''] }), false); assert.equal(t({ contains: ['hello', ['x', 'ell']] }), true);
  assert.equal(t({ every: { items: '$item.deps', match: { is: ['$it.status', 'done'] } } }), true);
  assert.equal(t({ some: { items: '$team.items', match: { is: ['$it.status', 'done'] } } }), true);
  assert.equal(t({ every: { items: '$team.items', match: { is: ['$it.status', 'done'] } } }), false);
});

test('is compares lists entry by entry', () => {
  assert.equal(same([2], ['2']), true); assert.equal(same([1, 2], [1, 3]), false); assert.equal(same([1], [1, 2]), false); assert.equal(same([], []), true);
  assert.equal(same([1], 1), false); assert.equal(same(null, ''), false);
  assert.equal(holds({ is: ['$item.deps', [1]] }, ctx()), true); assert.equal(holds({ is: ['$item.deps', ['1']] }, ctx()), true);
});

test('forms refused with exit 2: wrong key count, wrong pair, unknown test', () => {
  const c = ctx();
  refuses(() => holds({ is: ['$item.status', 'open'], in: ['a', 'b'] }, c), 2, /exactly one key/);
  refuses(() => holds({}, c), 2, /found none/);
  refuses(() => holds({ is: ['a'] }, c), 2, /list of two values/);
  refuses(() => holds({ regex: 'a' }, c), 2, /list of two values/);
  refuses(() => holds({ maybe: [1, 2] }, c), 2, /unknown test/);
});

test('every, some and count cannot be nested (exit 2 at run time)', () => {
  const c = ctx(); const inner = { some: { items: '$it.deps', match: { is: [1, 1] } } };
  refuses(() => holds({ every: { items: '$team.items', match: inner } }, c), 2, /cannot be nested/);
  refuses(() => value({ count: { items: '$team.items', match: { all: [inner] } } }, c), 2, /cannot be nested/);
  refuses(() => value({ count: { items: '$team.items', match: { is: [{ count: { items: '$it.deps' } }, 0] } } }, c), 2, /cannot be nested/);
  assert.equal(holds({ all: [{ some: { items: '$team.items', match: { all: [] } } }, { every: { items: '$team.items', match: { all: [] } } }] }, c), true);
});

test('decimal literals only: numbers and texts', () => {
  assert.equal(num('60.9'), 60.9); assert.equal(num(' 7 '), 7); assert.equal(num('-3'), -3); assert.ok(Number.isNaN(num('0x3C'))); assert.ok(Number.isNaN(num('1e3')));
  assert.ok(Number.isNaN(num(' '))); assert.ok(Number.isNaN(num(''))); assert.ok(Number.isNaN(num(null)));
});

test('items: other folder, foreign form, a missing item reads with no fields', () => {
  const foreign = item(7, { status: 'closed' }, { repository: 'acme/lib', team: '' });
  const c = ctx({ items: [item(3), foreign] });
  assert.equal(find(c, 3).seq, 3); assert.equal(find(c, '3').seq, 3); assert.equal(find(c, 'acme/lib#7'), foreign); assert.equal(find(c, 7).missing, true);
  const m = find(c, 99); assert.deepEqual([m.missing, m.fields, m.repository], [true, {}, 'acme/app']);
  assert.equal(holds({ some: { items: 'acme/lib#7', match: { is: ['$it.status', 'closed'] } } }, c), true);
  assert.equal(holds({ some: { items: 99, match: { is: ['$it.status', 'open'] } } }, c), false);
  assert.equal(holds({ every: { items: 99, match: { is: ['$it.status', 'open'] } } }, c), false);
  assert.equal(holds({ every: { items: 99, match: { empty: '$it.status' } } }, c), true);
});

test('regex: cached, a bad pattern is exit 2, a backtracking pattern is fast', () => {
  const c = ctx();
  refuses(() => holds({ regex: ['x', '(?=a)'] }, c), 2, /^regex: /);
  refuses(() => holds({ regex: ['x', 5] }, c), 2, /pattern must be text/);
  const t0 = Date.now(); assert.equal(holds({ regex: ['a'.repeat(5000) + 'b', '^(a+)+$'] }, c), false); assert.ok(Date.now() - t0 < 500);
  for (let i = 0; i < 3; i++) assert.equal(holds({ regex: ['aaa', '^a+$'] }, c), true);
});

test('fill and stepMatches', () => {
  const c = ctx({ args: { estimate: '90' } });
  assert.equal(fill('estimate {$arg.estimate} is above {$item.seq} by {$caller}', c), 'estimate 90 is above 2 by ann');
  assert.equal(fill('deps {$item.deps} / {$caller.roles} / [{$arg.none}]', c), 'deps 1 / lead, member / []');
  assert.equal(fill('plain {text} no $ref', c), 'plain {text} no $ref');
  assert.equal(stepMatches('*', 'a'), true); assert.equal(stepMatches(['a', 'b'], 'b'), true); assert.equal(stepMatches('a', 'b'), false); assert.equal(stepMatches(undefined, 'b'), false);
  assert.deepEqual(asList(null), []); assert.deepEqual(asList('x'), ['x']);
});

test('two items of one number are never given to the evaluator: find takes the first', () => {
  assert.equal(find(ctx({ items: [item(5, { status: 'a' }), item(5, { status: 'b' })] }), 5).fields.status, 'a');
});
