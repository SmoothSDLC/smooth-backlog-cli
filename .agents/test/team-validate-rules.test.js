// The checks of the rules of a team file, one by one, and their agreement with the evaluator: what validate refuses, the evaluator refuses at run time too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENVELOPE, Refusal, test as evaluate, value } from '../../src/team/rules/expression.js';
import { EFFECTS, step } from '../../src/team/rules/step.js';
import { compile } from '../../src/team/rules/safe-regex.js';
import { FLAGS, FUNCTIONS, TESTS } from '../../src/team/rules/validate-rules.js';
import { KEYS, errors, validate } from '../../src/team/rules/validate.js';

const entry = rules => ({
  people: { a: ['lead'], b: ['member'] },
  item: {
    status: { type: 'text', description: 's', values: ['open', 'done'], final: ['done'] }, estimate: { type: 'number', description: 'e' },
    holder: { type: 'items', description: 'h' }, labels: { type: 'list', description: 'l', values: ['x', 'y'] }, owner: { type: 'person', description: 'o' },
    flag: { type: 'boolean', description: 'f' },
  },
  rules: { table: rules, pop: [], filters: {} },
});
const problems = (...rules) => errors(validate({ t: entry(rules) })).map(f => `${f.path}: ${f.problem}`);
// A key set to undefined is left out, as a file cannot hold it.
const rule = (extra = {}) => Object.fromEntries(Object.entries({ id: 'r', step: 'go', do: {}, ...extra }).filter(([, v]) => v !== undefined));
const one = (extra, ...expected) => assert.deepEqual(problems(rule(extra)), expected);

test('every test and function name of the checks is one the evaluator runs, and an unlisted one is refused', () => {
  const ctx = { entry: { people: {} }, items: [], session: {}, args: {}, now: '2026-01-01T00:00:00Z' };
  const args = { all: [], any: [], not: { all: [] }, is: [1, 1], in: [1, [1]], empty: 1, '>=': [1, 1], '<=': [1, 1], regex: ['a', 'a'], contains: ['a', 'a'], every: { items: [], match: { all: [] } }, some: { items: [], match: { all: [] } } };
  for (const t of TESTS) assert.doesNotThrow(() => evaluate({ [t]: args[t] }, ctx), t);
  assert.deepEqual(Object.keys(args).sort(), [...TESTS].sort());
  assert.throws(() => evaluate({ bogus: 1 }, ctx), /unknown test bogus/);
  const fargs = { count: { items: [] }, length: [], plus: [], age: '2020-01-01', roles_of: 'a', text: 'a' };
  for (const f of FUNCTIONS) assert.doesNotThrow(() => value({ [f]: fargs[f] }, ctx), f);
  assert.deepEqual(Object.keys(fargs).sort(), [...FUNCTIONS].sort());
  assert.throws(() => value({ bogus: 1 }, ctx), /unknown function bogus/);
  assert.deepEqual(KEYS.do, EFFECTS);
});

test('rule: it is an object, has an id that is a text and unique, and only the keys of a rule', () => {
  assert.deepEqual(problems(5, null, 'x', []), ['rules.table[0]: a rule must be an object', 'rules.table[1]: a rule must be an object', 'rules.table[2]: a rule must be an object', 'rules.table[3]: a rule must be an object']);
  one({ id: undefined }, 'rules.table[0]: the rule has no id');
  one({ id: '' }, 'rules.table[0]: the rule has no id');
  one({ id: 5 }, 'rules.table[0].id: the id must be a text');
  assert.deepEqual(problems(rule(), rule()), ['rules.table[1]: the id r is used twice']);
  one({ extra: 1 }, 'rules.table[0].extra: extra is not a key of a rule');
});

test('step: a word, a list of words or *, none of them a flag name of the CLI', () => {
  for (const s of ['go', 'new', '*', ['go', '*'], ['a', 'b-c']]) one({ step: s });
  for (const s of [5, null, [], [5], {}, ['go', 5]]) one({ step: s }, 'rules.table[0].step: step must be a word, a list of words or "*"');
  one({ step: 'Go' }, 'rules.table[0].step: Go is not a step name');
  one({ step: ['go', ''] }, 'rules.table[0].step:  is not a step name');
  for (const f of FLAGS) one({ step: f }, `rules.table[0].step: ${f} is a flag name of the CLI`);
});

test('outcome: exactly one of deny and do; deny and say are texts; do is an object', () => {
  const t = [{ id: 'r', step: 'go' }, { id: 'r', step: 'go', deny: 'x', do: {} }].map((r, i) => ({ ...r, id: `r${i}` }));
  assert.deepEqual(problems(...t), ['rules.table[0]: a rule has exactly one outcome: deny or do', 'rules.table[1]: a rule has exactly one outcome: deny or do']);
  one({ do: undefined, deny: 5 }, 'rules.table[0].deny: deny must be a text');
  one({ do: 5 }, 'rules.table[0].do: do must be an object of effects');
  one({ do: null }, 'rules.table[0].do: do must be an object of effects');
  one({ do: { say: 5 } }, 'rules.table[0].do.say: say must be a text');
  one({ do: { say: 'ok {$item.status} {$arg.who} {$caller} {$now} {$team.name}' } });
  one({ do: { say: '{$it.status}' } }, 'rules.table[0].do.say: {$it.status} in the say text: $it.status is used outside every, some, count and related');
  one({ do: { say: 'waits for {$item.kids}' } }, 'rules.table[0].do.say: {$item.kids} in the say text: $item.kids names no field of the item definition');
});

test('condition: one key, a known test with the right form', () => {
  const when = c => one({ when: c });
  when({ is: ['$item.status', 'open'] });
  one({ when: 'x' }, 'rules.table[0].when: a condition must be an object with exactly one key');
  one({ when: [] }, 'rules.table[0].when: a condition must be an object with exactly one key');
  one({ when: null }, 'rules.table[0].when: a condition must be an object with exactly one key');
  one({ when: {} }, 'rules.table[0].when: a condition has exactly one key (found none)');
  one({ when: { iss: [1, 2] } }, 'rules.table[0].when.iss: unknown test iss');
  assert.equal(errors(validate({ t: entry([rule({ when: { iss: [1, 2] } })]) }))[0].fix, 'did you mean is? (all, any, not, is, in, empty, >=, <=, regex, contains, every, some)');
  for (const k of ['is', 'in', '>=', '<=', 'regex', 'contains']) for (const bad of [1, [1], [1, 2, 3], 'x', {}]) one({ when: { [k]: bad } }, `rules.table[0].when.${k}: ${k} takes a list of two values`);
  one({ when: { all: {} } }, 'rules.table[0].when.all: all takes a list of conditions');
  one({ when: { any: 'x' } }, 'rules.table[0].when.any: any takes a list of conditions');
  one({ when: { all: [{ empty: '$arg.a' }, 5] } }, 'rules.table[0].when.all[1]: a condition must be an object with exactly one key');
  one({ when: { not: [] } }, 'rules.table[0].when.not: not takes one condition');
  one({ when: { not: { all: [] } } });
  one({ when: { empty: { text: '$nope' } } });
});

test('function: one key, a known function, plus takes a list', () => {
  const set = v => one({ do: { set: { estimate: v } } });
  set({ plus: ['$item.estimate', 1] }); set({ length: '$item.holder' }); set({ text: '$literal' }); set({ age: '$now' });
  one({ do: { set: { estimate: { plus: 1, length: 2 } } } }, 'rules.table[0].do.set.estimate: a function has exactly one key (found plus, length)');
  one({ do: { set: { estimate: {} } } }, 'rules.table[0].do.set.estimate: a function has exactly one key (found none)');
  one({ do: { set: { estimate: { sum: [] } } } }, 'rules.table[0].do.set.estimate.sum: unknown function sum');
  one({ do: { set: { estimate: { plus: [{ plus: 'x' }] } } } }, 'rules.table[0].do.set.estimate.plus[0].plus: plus takes a list of values');
});

test('references: the closed list, declared fields, $it only where it is valid, argument names', () => {
  const is = v => ({ when: { is: ['$item.status', v] } });
  for (const r of ['$item.status', '$item.seq', '$item.body', '$caller', '$caller.roles', '$session.id', '$session.commit', '$now', '$team.name', '$team.items', '$arg.note', '$arg.a-b_1']) one({ when: { is: [r, r] } });
  for (const r of ['$nope', '$', '$caller.x', '$now.x', '$team.x', '$session.x', '$item', '$constructor', '$__proto__', '$5']) {
    const found = problems(rule({ when: { is: [r, 'x'] } }));
    assert.equal(found.length, 1, r); assert.match(found[0], /is no reference$|names no field/, r);
  }
  one({ when: { is: ['$item.constructor', 1] } }, 'rules.table[0].when.is[0]: $item.constructor names no field of the item definition');
  one({ when: { is: ['$item.kids', 1] } }, 'rules.table[0].when.is[0]: $item.kids names no field of the item definition');
  one({ when: { is: ['$arg.Note', 1] } }, 'rules.table[0].when.is[0]: Note is not an argument name');
  one({ when: { is: ['$arg.a.b', 1] } }, 'rules.table[0].when.is[0]: a.b is not an argument name');
  for (const f of FLAGS) one({ when: { is: [`$arg.${f}`, 1] } }, `rules.table[0].when.is[0]: --${f} belongs to the CLI`);
  one({ when: { is: ['$it.status', 'open'] } }, 'rules.table[0].when.is[0]: $it.status is used outside every, some, count and related');
  one({ when: { is: ['$it.kids', 1] } }, 'rules.table[0].when.is[0]: $it.kids names no field of the item definition', 'rules.table[0].when.is[0]: $it.kids is used outside every, some, count and related');
  one({ when: { some: { items: '$item.holder', match: { is: ['$it.status', 'open'] } } } });
  one({ do: { related: [{ items: '$item.holder', set: { status: '$it.status' } }] } });
  one(is('$arg.x'));
});

test('quantifiers: items and match, no other key, never inside another one', () => {
  const some = q => ({ when: { some: q } });
  one(some({ items: '$item.holder', match: { empty: '$it.status' } }));
  for (const bad of ['x', [], null, {}, { items: 1 }, { match: { all: [] } }]) one(some(bad), 'rules.table[0].when.some: some takes items and match');
  one({ when: { every: { items: [] } } }, 'rules.table[0].when.every: every takes items and match');
  one(some({ items: [], match: { all: [] }, matcher: 1 }), 'rules.table[0].when.some.matcher: matcher is not a key of some');
  one({ do: { set: { estimate: { count: { items: '$item.holder' } } } } });
  one({ do: { set: { estimate: { count: { items: '$item.holder', match: { is: ['$it.status', 'open'] } } } } } });
  one({ do: { set: { estimate: { count: 5 } } } }, 'rules.table[0].do.set.estimate.count: count takes items and an optional match');
  one({ do: { set: { estimate: { count: { items: [], match: 5 } } } } }, 'rules.table[0].do.set.estimate.count.match: a condition must be an object with exactly one key');
  // inside the match of one: every kind of nesting
  for (const inner of [{ some: { items: [], match: { all: [] } } }, { every: { items: [], match: { all: [] } } }, { is: [{ count: { items: [] } }, 1] }]) {
    const k = Object.keys(inner)[0];
    const found = problems(rule(some({ items: [], match: inner })));
    assert.equal(found.length, 1, k); assert.match(found[0], /inside another every, some or count$/);
  }
  one(some({ items: [], match: { not: { some: { items: [], match: { all: [] } } } } }), 'rules.table[0].when.some.match.not.some: some inside another every, some or count');
  // the items of a quantifier are read before it, so a count there is not nested; one in a related effect is not either
  one(some({ items: { count: { items: '$item.holder' } }, match: { all: [] } }));
  one({ do: { related: [{ items: [], set: { estimate: { count: { items: '$it.holder' } } } }] } });
});

test('regex: a literal pattern that compiles, and the constructs that are most likely mistakes', () => {
  const regex = p => one({ when: { regex: ['$arg.x', p] } });
  for (const p of ['^(a+)+$', '(a*)*', 'a{2,3}', '[a-c]+', '(?:ab)|c', '', '^$', '\\d{3}']) regex(p);
  const bad = [['(', 'a ( group is not closed (at character 2)'], ['a{3,2}', 'a counted repetition has its minimum above its maximum (at character 5)'], ['[a-\\d]', 'the range a-\\ ends with an escape; write the members of the class one by one (at character 2)'],
    ['a**', 'a quantifier cannot follow another quantifier (at character 3)'], ['^*', 'a quantifier cannot repeat ^ or $ (at character 2)'], ['a{2}{3}', 'a quantifier cannot follow another quantifier (at character 7)'],
    ['a'.repeat(201), 'the pattern is longer than 200 characters'], ['(a{100}){100}', 'the pattern is too large (counted repetitions multiply)'], [5, 'the pattern must be text'], [null, 'the pattern must be text']];
  for (const [p, why] of bad) {
    const found = problems(rule({ when: { regex: ['$arg.x', p] } }));
    assert.deepEqual(found, [`rules.table[0].when.regex: not a pattern the CLI runs (${why})`], JSON.stringify(p));
  }
  for (const p of ['$arg.p', '$item.status', '$caller']) one({ when: { regex: ['x', p] } }, `rules.table[0].when.regex: the pattern ${p} is a reference; a pattern is a literal text`);
  regex('$'); regex('a$'); // an anchor alone is a pattern
  one({ when: { regex: ['$arg.x', '(', 'x'] } }, 'rules.table[0].when.regex: regex takes a list of two values');
  one({ when: { regex: ['$nope', 'a'] } }, 'rules.table[0].when.regex[0]: $nope is no reference');
});

test('roles: a role literal read with $caller.roles or roles_of is held by some person', () => {
  one({ when: { in: ['lead', '$caller.roles'] } }); one({ when: { in: ['member', { roles_of: '$caller' }] } });
  one({ when: { in: ['boss', { roles_of: '$arg.who' }] } }, 'rules.table[0].when.in: no person has the role boss');
  one({ when: { in: ['boss', '$caller.roles'] } }, 'rules.table[0].when.in: no person has the role boss');
  one({ when: { in: ['$arg.r', '$caller.roles'] } }); one({ when: { in: ['boss', ['boss']] } });
  one({ when: { is: ['boss', '$caller'] } }); // a person name, not a role: not a role check
});

test('literals compared with a field that has values are among them', () => {
  one({ when: { in: ['$item.status', ['open', 'gone', 'done']] } }, 'rules.table[0].when.in: gone is not a value of status (open, done)');
  one({ when: { is: ['$item.status', 'open'] } }); one({ when: { is: ['$item.status', '$arg.s'] } }); one({ when: { is: ['$item.estimate', 'x'] } });
  one({ when: { some: { items: [], match: { is: ['$it.status', 'doen'] } } } }, 'rules.table[0].when.some.match.is: doen is not a value of status (open, done)');
  const numbers = entry([rule({ when: { in: ['$item.n', [1, '2', 3]] } })]); numbers.item.n = { type: 'number', description: 'n', values: [1, 2] };
  assert.deepEqual(errors(validate({ t: numbers })).map(f => f.problem), ['3 is not a value of n (1, 2)']);
});

test('effects: declared fields, list fields for add and remove, literals that fit', () => {
  const set = (kind, f, v) => one({ do: { [kind]: { [f]: v } } });
  set('set', 'estimate', 5); set('set', 'estimate', '5'); set('set', 'flag', true); set('set', 'flag', 'false'); set('set', 'owner', 'a'); set('set', 'holder', [1, 2]); set('set', 'holder', '1, 2'); set('set', 'status', '$arg.s');
  set('add', 'labels', 'x'); set('add', 'labels', ['x', 'y']); set('remove', 'holder', 3); set('set', 'estimate', { plus: ['$item.estimate', 1] });
  assert.deepEqual(problems(rule({ do: { set: { closer: 1, flag: 'maybe', owner: 'zed', estimate: null, status: 5, holder: ['a'], labels: ['x', 'q'] } } })), [
    'rules.table[0].do.set.closer: closer is no field of the item definition', 'rules.table[0].do.set.flag: field flag: "maybe" is not true or false',
    'rules.table[0].do.set.owner: field owner: "zed" is not a person of the team (a, b)', 'rules.table[0].do.set.estimate: field estimate: null is not a number',
    'rules.table[0].do.set.status: field status: 5 is not one of open, done',
    'rules.table[0].do.set.holder: field holder: ["a"] is not a list of item numbers', 'rules.table[0].do.set.labels: field labels: ["x","q"] is not one of x, y']);
  assert.deepEqual(problems(rule({ do: { add: { estimate: 1, status: 'open' }, remove: { owner: 'a' } } })), ['rules.table[0].do.add.estimate: add needs a list field; estimate is number',
    'rules.table[0].do.add.status: add needs a list field; status is text', 'rules.table[0].do.remove.owner: remove needs a list field; owner is person']);
  assert.deepEqual(problems(rule({ do: { set: 5, add: [], remove: 'x' } })), ['rules.table[0].do.set: set must be an object of field values', 'rules.table[0].do.add: add must be an object of field values', 'rules.table[0].do.remove: remove must be an object of field values']);
  assert.deepEqual(problems(rule({ do: { nope: 1 } })), ['rules.table[0].do.nope: nope is not a key of an effect list']);
});

test('effects: team, archive, delete, branch, note, related and place', () => {
  const d = (x, ...expected) => one({ do: x }, ...expected);
  d({ team: '$team.name' }); d({ team: '' }); d({ archive: true, delete: true }); d({ branch: '$arg.to' }); d({ branch: 'main' }); d({ place: 'first' }); d({ place: 'last' }); d({ place: { before: '$arg.n' } }); d({ place: { after: 3 } });
  for (const v of ['other', '$arg.t', null, 5, ['$team.name'], {}]) d({ team: v }, 'rules.table[0].do.team: the team effect binds only to $team.name or unbinds with ""');
  for (const k of ['archive', 'delete']) for (const v of [false, 'true', 1, null, 'no']) d({ [k]: v }, `rules.table[0].do.${k}: ${k} takes only true`);
  for (const v of ['', 5, true, null, []]) d({ branch: v }, 'rules.table[0].do.branch: the branch effect needs a branch name');
  d({ branch: '$nope' }, 'rules.table[0].do.branch: $nope is no reference');
  for (const v of ['middle', 5, null, [], {}, { before: 1, after: 2 }, { sideways: 1 }, true]) assert.ok(problems(rule({ do: { place: v } })).length, JSON.stringify(v));
  d({ place: { sideways: 1 } }, 'rules.table[0].do.place.sideways: sideways is not a key of a place');
  d({ place: { before: '$nope' } }, 'rules.table[0].do.place.before: $nope is no reference');
  d({ note: { heading: 'h', text: 'a {$arg.n}' } }); d({ note: { heading: 'h', text: '$arg.n' } }); d({ note: { heading: 'h', text: '' } });
  for (const v of ['x', 5, null, [], {}, { heading: 'h' }, { text: 't' }, { heading: 5, text: 't' }]) d({ note: v }, 'rules.table[0].do.note: note must be an object with a heading text and a text');
  d({ note: { heading: 'h', text: 5 } }, 'rules.table[0].do.note.text: note must be a text');
  d({ note: { heading: 'h', text: '$arg.Bad' } }, 'rules.table[0].do.note.text: Bad is not an argument name');
  d({ note: { heading: 'h', text: 'x {$nope}' } }, 'rules.table[0].do.note.text: {$nope} in the note text: $nope is no reference');
  d({ note: { heading: 'h', text: 't', more: 1 } }, 'rules.table[0].do.note.more: more is not a key of a note');
  d({ related: [] }); d({ related: [{ items: '$item.holder', set: { status: 'done' }, add: { labels: 'x' }, remove: { labels: 'y' } }] });
  for (const v of ['x', {}, 5, null, [5], [{}], [{ set: {} }], [null]]) assert.ok(problems(rule({ do: { related: v } })).length, JSON.stringify(v));
  d({ related: [{ items: [], sett: {} }] }, 'rules.table[0].do.related[0].sett: sett is not a key of a related entry');
  d({ related: [{ items: '$nope' }] }, 'rules.table[0].do.related[0].items: $nope is no reference');
  d({ related: [{ items: [], set: { status: 'nope' } }] }, 'rules.table[0].do.related[0].set.status: nope is not a value of status');
  d({ related: [{ items: '$it.holder' }] }, 'rules.table[0].do.related[0].items: $it.holder is used outside every, some, count and related');
});

test('the safe echo: a rule nested 100000 deep is one finding, never a throw', () => {
  let deep = 1; for (let i = 0; i < 100000; i++) deep = [deep];
  let nested = { all: [] }; for (let i = 0; i < 100000; i++) nested = { not: nested };
  for (const r of [rule({ when: nested }), rule({ do: { set: { estimate: deep } } }), rule({ do: { set: { estimate: { plus: deep } } } }), rule({ when: { is: [deep, deep] } }), rule({ do: { related: [{ items: deep }] } })]) {
    const found = errors(validate({ t: entry([r]) }));
    assert.ok(found.length >= 1 && found.every(f => f.problem && f.fix));
  }
});

// What the evaluator refuses at run time and what validate says about the same rule. A rule that the evaluator cannot run must be an error; the rule is placed
// in a team whose other rules are fine, and the step is run on an item it applies to.
const RUNTIME = [
  [{ when: 'x' }, 2], [{ when: { is: ['a'], in: ['a'] } }, 2], [{ when: { iss: [1, 2] } }, 2], [{ when: { is: ['a'] } }, 2], [{ when: { all: {} } }, 2], [{ when: { not: [] } }, 2],
  [{ when: { some: { items: [] } } }, 2], [{ when: { some: { items: [], match: { all: [] } }, every: { items: [], match: { all: [] } } } }, 2],
  [{ when: { some: { items: ['1'], match: { some: { items: [], match: { all: [] } } } } } }, 2], [{ when: { is: [{ count: 5 }, 1] } }, 2], [{ when: { is: [{ sum: [] }, 1] } }, 2],
  [{ when: { is: [{ plus: 1 }, 1] } }, 2], [{ when: { is: ['$nope', 1] } }, 2], [{ when: { regex: ['a', '('] } }, 2], [{ when: { regex: ['a', 5] } }, 2], [{ when: { regex: ['a', { text: 'a' }] } }, 2],
  [{ do: undefined }, 2], [{ deny: 'x' }, 2], [{ do: 5 }, 2], [{ do: { nope: 1 } }, 2], [{ do: { set: 5 } }, 2], [{ do: { say: 5 } }, 2], [{ do: { note: 5 } }, 2], [{ do: { note: { heading: 'h' } } }, 2],
  [{ do: { related: {} } }, 2], [{ do: { related: [{ items: [], x: 1 }] } }, 2], [{ do: { place: 'middle' } }, 2], [{ do: { team: 'other' } }, 2], [{ do: { set: { nofield: 1 } } }, 2],
  [{ do: { add: { estimate: 1 } } }, 2], [{ do: { set: { estimate: 'abc' } } }, 2], [{ do: { set: { status: 'shipped' } } }, 2], [{ do: { set: { owner: 'zed' } } }, 2], [{ do: { set: { holder: ['a'] } } }, 2],
  [{ do: { branch: '' } }, 1], [{ deny: 5, do: undefined }, null], [{ deny: 'x {$nope}', do: undefined }, 2], [{ do: { say: 'x {$nope}' } }, 2],
];
test('a rule the evaluator refuses at run time is an error of validate', () => {
  for (const [patch, code] of RUNTIME) {
    const e = entry([rule(patch)]);
    assert.ok(errors(validate({ t: e })).length, `validate accepts ${JSON.stringify(patch)}`);
    const item = { seq: 1, slug: '001-a', name: 'a', team: 't', repository: 'r', branch: 'b', archived: false, body: '', fields: { status: 'open', estimate: 1, holder: [], labels: [], owner: '', flag: false } };
    const ctx = { entry: e, team: 't', caller: 'a', items: [item, { ...item, seq: 2, slug: '002-b', name: 'b' }], args: {}, session: { repository: 'r', branch: 'b' }, now: '2026-01-01T00:00:00Z', item, step: 'go' };
    assert.throws(() => step(ctx), err => (code === null ? !(err instanceof Refusal) : err instanceof Refusal && err.exitCode === code), JSON.stringify(patch));
  }
});

test('a rule that validate accepts runs: the shapes of every effect', () => {
  const ok = rule({ when: { all: [{ in: ['lead', '$caller.roles'] }, { is: ['$item.status', 'open'] }, { regex: ['$item.status', '^o'] }] }, do: {
    set: { estimate: { plus: ['$item.estimate', 1] }, status: 'done' }, add: { labels: 'x' }, remove: { labels: 'y' }, note: { heading: 'h', text: 'n {$caller}' }, place: 'last', say: 'done {$item.seq}', team: '$team.name', branch: 'main',
    related: [{ items: '$item.holder', set: { status: 'open' } }] } });
  assert.deepEqual(errors(validate({ t: entry([ok]) })), []);
  const e = entry([ok]); const item = { seq: 1, slug: '001-a', name: 'a', team: 't', repository: 'r', branch: 'b', archived: false, body: '', fields: { status: 'open', estimate: 1, holder: [], labels: ['y'], owner: '', flag: false } };
  const out = step({ entry: e, team: 't', caller: 'a', items: [item], args: {}, session: { repository: 'r', branch: 'b' }, now: '2026-01-01T00:00:00Z', item, step: 'go' });
  assert.equal(out.items.get(1).fields.status, 'done');
});

test('the envelope keys of the item are accepted as $item references', () => { for (const k of ENVELOPE) one({ when: { empty: `$item.${k}` } }); });
test('compile still runs the constructs that validate refuses', () => { for (const p of ['a**', '^*', 'a{2}{3}']) assert.doesNotThrow(() => compile(p)); });
