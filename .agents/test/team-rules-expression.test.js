import test from 'node:test';
import assert from 'node:assert/strict';
import { BacklogError } from '../../src/errors.js';
import { Refusal, patternCacheSize, asList, fill, find, num, same, stepMatches, test as holds, value } from '../../src/team/rules/expression.js';

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
  for (const [v, want] of [[null, true], [false, false], [0, false], [[], true], [' ', true], ['', true], ['x', false], [[0], false]]) assert.equal(t({ empty: v }), want, JSON.stringify(v));
  assert.equal(t({ any: [{ empty: '$arg.none' }, { is: [1, 2] }] }), true);
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
  refuses(() => holds({ is: ['$item.status', 'open'], in: ['a', 'b'] }, c), 2, /^a condition has exactly one key \(found is, in\)$/);
  refuses(() => holds({}, c), 2, /^a condition has exactly one key \(found none\)$/);
  refuses(() => holds({ is: ['a'] }, c), 2, /^is takes a list of two values$/);
  for (const op of ['in', '>=', '<=', 'contains', 'regex']) { refuses(() => holds({ [op]: 'a' }, c), 2, new RegExp(`^${op} takes a list of two values$`)); refuses(() => holds({ [op]: [1, 2, 3] }, c), 2, new RegExp(`^${op} takes a list of two values$`)); }
  refuses(() => holds({ maybe: [1, 2] }, c), 2, /unknown test/);
});

test('the form of all, any, not, every, some, count and a condition: one boundary each, exit 2', () => {
  const c = ctx();
  refuses(() => holds({ all: 5 }, c), 2, /^all takes a list of conditions$/);
  refuses(() => holds({ any: 'x' }, c), 2, /^any takes a list of conditions$/);
  refuses(() => holds({ not: [{ is: [1, 1] }] }, c), 2, /^not takes one condition$/);
  refuses(() => holds({ not: 5 }, c), 2, /^not takes one condition$/);
  refuses(() => holds({ every: 5 }, c), 2, /^every takes an object with items and match$/);
  refuses(() => holds({ every: { items: [1] } }, c), 2, /^every takes an object with items and match$/);
  refuses(() => holds({ some: { match: { all: [] } } }, c), 2, /^some takes an object with items and match$/);
  refuses(() => value({ count: 5 }, c), 2, /^count takes an object with items \(match optional\)$/);
  refuses(() => value({ count: { match: { all: [] } } }, c), 2, /^count takes an object with items \(match optional\)$/);
  refuses(() => holds(null, c), 2, /^a condition must be an object with exactly one key$/);
  refuses(() => holds([{ is: [1, 1] }], c), 2, /^a condition must be an object with exactly one key$/);
  refuses(() => holds({ all: [null] }, c), 2, /^a condition must be an object with exactly one key$/);
  refuses(() => holds({ all: ['x'] }, c), 2, /^a condition must be an object with exactly one key$/);
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
  const before = patternCacheSize();
  for (let i = 0; i < 3; i++) assert.equal(holds({ regex: ['aaa', '^cache-probe-a+$'] }, c), false);
  assert.equal(patternCacheSize(), before + 1);
  holds({ regex: ['aaa', '^cache-probe-b+$'] }, c); assert.equal(patternCacheSize(), before + 2);
  refuses(() => holds({ regex: ['x', '(?=a)'] }, c), 2, /^regex: /); assert.equal(patternCacheSize(), before + 2);
  assert.equal(holds({ regex: ['xabcx', 'abc'] }, c), true);
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

test('literals, envelope keys and item references', () => {
  const c = ctx({ item: item(2, {}, { created: '2026-01-01', updated: '2026-02-02', updated_by: 'bob', body: 'text' }) });
  assert.deepEqual([true, false, null].map(x => value(x, c)), [true, false, null]); assert.equal(value(7, c), 7);
  for (const [k, want] of [['seq', 2], ['slug', '2-x'], ['name', 'item 2'], ['team', 't'], ['repository', 'acme/app'], ['branch', 'main'], ['created', '2026-01-01'], ['updated', '2026-02-02'], ['updated_by', 'bob'], ['archived', false], ['body', 'text']]) assert.equal(value(`$item.${k}`, c), want, k);
  assert.equal(value('$it.name', { ...c, it: item(9) }), 'item 9');
});

test('session, team and now references: the closed list, a misspelled name is exit 2', () => {
  const c = ctx({ session: { id: 's1', repository: 'acme/app', branch: 'b', commit: 'abc' } });
  assert.deepEqual(['id', 'branch', 'commit'].map(n => value(`$session.${n}`, c)), ['s1', 'b', 'abc']);
  assert.equal(value('$session.id', ctx({ session: {} })), ''); assert.equal(value('$session.id', ctx({ session: undefined })), '');
  for (const p of ['$session.brnach', '$team.foo', '$now.x', '$caller.x']) refuses(() => value(p, c), 2, /^unknown reference /);
  refuses(() => fill('x {$session.brnach}', c), 2, /^unknown reference \$session\.brnach$/);
  assert.deepEqual(value('$team.items', ctx({ session: undefined })), []);
  assert.equal(find(ctx({ session: undefined }), 3).missing, true);
});

test('$team.items leaves out archived items and items of other teams', () => {
  const items = [item(1), item(2, {}, { archived: true }), item(3, {}, { team: 'other' }), item(4, {}, { repository: 'acme/lib' }), item(5)];
  assert.deepEqual(value('$team.items', ctx({ items })), [1, 5]);
});

test('$caller.roles of an unknown caller is an empty list', () => {
  assert.deepEqual(value('$caller.roles', ctx({ caller: 'zed' })), []);
});

test('age of an empty value is null, and a comparison on null does not hold', () => {
  const c = ctx();
  assert.equal(value({ age: '' }, c), null); assert.equal(value({ age: '$arg.none' }, c), null);
  assert.equal(holds({ '>=': [{ age: '' }, 60] }, c), false); assert.equal(holds({ '<=': [{ age: '' }, 60] }, c), false);
});

test('a cap is written as not <=: a value that is not a number is refused too', () => {
  const c = ctx(); const cap = { not: { '<=': ['$arg.n', 60] } };
  assert.equal(holds(cap, ctx({ args: { n: 'abc' } })), true); assert.equal(holds(cap, ctx({ args: { n: '61' } })), true); assert.equal(holds(cap, ctx({ args: { n: '60' } })), false);
  assert.equal(holds({ not: { '<=': ['abc', 60] } }, c), true);
});

test('every on an empty list holds, some does not', () => {
  const c = ctx({ item: item(2, { deps: [] }) });
  assert.equal(holds({ every: { items: '$item.deps', match: { is: [1, 2] } } }, c), true);
  assert.equal(holds({ some: { items: '$item.deps', match: { is: [1, 1] } } }, c), false);
  assert.equal(value({ count: { items: '$item.deps' } }, c), 0);
});
