// The checks of the team file that the cases do not pin: totality on any input, the record of a finding, the text of a file, and each check of
// the shape, the people and the item definition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENVELOPE, NAMES, PAIR } from '../../src/team/rules/expression.js';
import { KEYS, closest, errors, readTeamsText, validate } from '../../src/team/rules/validate.js';

const template = n => JSON.parse(readFileSync(new URL(`../../templates/teams/${n}.json`, import.meta.url), 'utf8'));
const NAMES_OF = ['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'];
const good = () => ({ t: { people: { a: ['lead'] }, item: { status: { type: 'text', description: 's', values: ['open', 'done'], final: ['done'] } }, rules: { table: [], pop: [], filters: {} } } });
const problems = file => errors(validate(file)).map(f => `${f.path}: ${f.problem}`);

// A small deterministic generator, so a failure repeats.
function prng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
const NOT_OBJECTS = [null, 7, 'text', [], [1, 'a'], true, {}, { x: 1 }];
function random(r, depth = 0) {
  const k = Math.floor(r() * (depth > 3 ? 5 : 7));
  if (k === 0) return null;
  if (k === 1) return Math.floor(r() * 100) - 5;
  if (k === 2) return ['a', '', 'status', 'people', 'x y', '$item.f', 'open'][Math.floor(r() * 7)];
  if (k === 3) return r() < 0.5;
  if (k === 4) return 1.5;
  if (k === 5) return Array.from({ length: Math.floor(r() * 4) }, () => random(r, depth + 1));
  const o = {}; for (let i = Math.floor(r() * 4); i > 0; i--) o[['people', 'item', 'rules', 'table', 'pop', 'filters', 'status', 'type', 'values', 'final', 'default', 'a', 'id', 'when'][Math.floor(r() * 14)]] = random(r, depth + 1);
  return o;
}
function mutate(r, v) {
  const copy = structuredClone(v); const spots = [];
  (function walk(n) { if (n && typeof n === 'object') for (const k of Object.keys(n)) { spots.push([n, k]); walk(n[k]); } })(copy);
  for (let i = 0; i < 3; i++) { const [n, k] = spots[Math.floor(r() * spots.length)]; if (r() < 0.2) delete n[k]; else n[k] = random(r, 2); }
  return copy;
}
const checkAll = findings => {
  assert.ok(Array.isArray(findings));
  for (const f of findings) {
    assert.deepEqual(Object.keys(f), ['severity', 'team', 'path', 'rule', 'problem', 'fix']);
    assert.ok(['error', 'warning'].includes(f.severity));
    assert.ok(typeof f.problem === 'string' && f.problem && typeof f.fix === 'string' && f.fix, JSON.stringify(f));
  }
};

test('validate never throws: 500 random JSON values and 500 mutated templates', () => {
  const r = prng(12345);
  for (let i = 0; i < 500; i++) checkAll(validate(random(r)));
  for (let i = 0; i < 500; i++) checkAll(validate(mutate(r, template(NAMES_OF[i % 5]))));
  for (let i = 0; i < 500; i++) checkAll(validate({ t: mutate(r, template(NAMES_OF[i % 5]).parallel ?? Object.values(template(NAMES_OF[i % 5]))[0]) }));
});

test('every container holds null, a number, a text, a list or an object without a crash, and a wrong one is an error', () => {
  const spots = [[], ['t'], ['t', 'people'], ['t', 'item'], ['t', 'rules'], ['t', 'rules', 'table'], ['t', 'rules', 'pop'], ['t', 'rules', 'filters'], ['t', 'item', 'status'],
    ['t', 'item', 'status', 'values'], ['t', 'item', 'status', 'final'], ['t', 'people', 'a']];
  for (const spot of spots) for (const bad of NOT_OBJECTS) {
    const file = good(); let n = file; spot.slice(0, -1).forEach(k => { n = n[k]; });
    if (spot.length) n[spot.at(-1)] = bad;
    const found = validate(spot.length ? file : bad);
    checkAll(found);
    if (!spot.length && !(bad && typeof bad === 'object' && !Array.isArray(bad))) assert.equal(found.length, 1, 'a file that is not an object is refused');
  }
  assert.equal(validate(null).length, 1);
  assert.equal(validate([]).length, 1);
  assert.equal(errors(validate(good())).length, 0);
});

test('the templates have no error', () => { for (const n of NAMES_OF) assert.deepEqual(errors(validate(template(n))), [], n); });

test('exports of the evaluator that the checks read', () => {
  assert.ok(ENVELOPE.includes('seq') && PAIR.includes('is') && NAMES.session.includes('id'));
});

test('readTeamsText: the file, or one finding with the parser message', () => {
  assert.deepEqual(readTeamsText('{"a": {}}'), { file: { a: {} } });
  const bad = readTeamsText('{\n"a": 1,\n}');
  assert.equal(bad.finding.severity, 'error');
  assert.equal(bad.finding.team, null);
  assert.match(bad.finding.problem, /^teams\.json is not JSON \(.*line 3 column 1/);
  for (const t of ['[]', '7', 'null', '"x"', '']) { const r = readTeamsText(t); assert.ok(r.finding.problem && r.finding.fix, t); assert.equal(r.file, undefined); }
  checkAll([readTeamsText('x').finding]);
});

test('a team name', () => {
  for (const n of ['web', '1a', 'a_b:c-d']) assert.deepEqual(problems({ [n]: good().t }), [], n);
  for (const n of ['', 'Web', '-a', 'a b', '_a']) assert.equal(problems({ [n]: good().t })[0], `: ${n} is not a team name: lowercase letters, digits, - _ and :, starting with a letter or digit`, n);
});

test('keys of an entry and of rules: the closest valid key and the whole list', () => {
  const f = good(); f.t.peple = {}; f.t.rules.tabel = [];
  const found = errors(validate(f));
  assert.deepEqual(found.map(x => [x.path, x.problem]), [['peple', 'peple is not a key of a team entry'], ['rules.tabel', 'tabel is not a key of rules']]);
  assert.equal(found[0].fix, 'did you mean people? (people, item, rules)');
  assert.equal(found[1].fix, 'did you mean table? (table, pop, filters)');
  assert.equal(closest('zzz', ['a', 'b']), 'a');
  assert.deepEqual(KEYS.entry, ['people', 'item', 'rules']);
});

test('missing keys of rules and the wrong type of table, pop and filters', () => {
  const f = good(); f.t.rules = {}; assert.deepEqual(problems(f), ['rules.table: rules has no table', 'rules.pop: rules has no pop', 'rules.filters: rules has no filters']);
  f.t.rules = { table: {}, pop: 'x', filters: [] };
  assert.deepEqual(problems(f), ['rules.table: rules.table must be a list', 'rules.pop: rules.pop must be a list', 'rules.filters: rules.filters must be an object']);
  f.t.rules = 5; assert.deepEqual(problems(f), ['rules: rules must be an object with table, pop and filters']);
});

test('people: none, a wrong type, a bad name, a role list, a role twice, an empty role', () => {
  const f = good();
  f.t.people = {}; assert.deepEqual(problems(f), ['people: the team has no person']);
  f.t.people = []; assert.deepEqual(problems(f), ['people: people must be an object of person names and role lists']);
  f.t.people = { 'a,b': ['x'], [`${'n'.repeat(65)}`]: ['x'], ok: [], two: ['x', 'x', 'y', 'y'], blank: [''], num: [3] };
  assert.deepEqual(problems(f).map(p => p.replace(/n{65}/g, '<65>')), ['people.a,b: a,b is not a plain name', 'people.<65>: <65> is not a plain name', 'people.ok: ok has no role list',
    'people.two: two has the role x twice', 'people.two: two has the role y twice', 'people.blank: blank has no role list', 'people.num: num has no role list']);
});

test('item definition: field names, types, values, defaults', () => {
  const f = good(); const it = f.t.item;
  it.body = { type: 'text' }; it.Big = { type: 'text' }; it.k = { type: 'colour' }; it.nt = {}; it.f = 5;
  it.n = { type: 'number', description: 'n', values: [1, 1], default: 2 };
  it.b = { type: 'boolean', description: 'b', default: 'yes' };
  it.l = { type: 'list', description: 'l', values: ['a', 'b'], default: ['a', 'c'] };
  it.i = { type: 'item', description: 'i', default: null }; it.is = { type: 'items', description: 'is', default: [3, 'x'] };
  it.v = { type: 'text', description: 'v', values: [] };
  assert.deepEqual(problems(f), ['item.body: body is a key every item has already', 'item.Big: Big is not a field name: lowercase letters, digits, - and _, starting with a letter',
    'item.k.type: unknown type colour', 'item.nt.type: the field nt has no type', 'item.f: the field f must be an object with a type',
    'item.n.values: values must be a non-empty list of distinct number values', 'item.n.default: the default 2 is not one of the values', 'item.b.default: the default "yes" is not a boolean',
    'item.l.default: the default ["a","c"] is not one of the values', 'item.v.values: values must be a non-empty list of distinct text values']);
});

test('item definition: status', () => {
  const f = good(); f.t.item.status.final = ['gone', 'done'];
  assert.deepEqual(problems(f), ['item.status.final: final value gone is not a value of status']);
  f.t.item.status.final = []; assert.deepEqual(problems(f), ['item.status.final: the status field has no final values']);
  f.t.item.status = { type: 'text' }; assert.deepEqual(problems(f), ['item.status: the item definition has no status field with values']);
  f.t.item.status = { type: 'text', values: 'open', final: ['open'] };
  assert.deepEqual(problems(f), ['item.status.values: values must be a non-empty list of distinct text values']);
  f.t.item = 'x'; assert.deepEqual(problems(f), ['item: item must be an object of field definitions', 'item.status: the item definition has no status field with values']);
});

test('a field without a description is a warning, never an error', () => {
  const f = good(); delete f.t.item.status.description;
  const found = validate(f);
  assert.deepEqual(found, [{ severity: 'warning', team: 't', path: 'item.status', rule: null, problem: 'status has no description; agents read the descriptions', fix: 'add "description": "<what the field holds>"' }]);
  assert.deepEqual(errors(found), []);
});

test('the findings of several teams keep the file order and name their team', () => {
  const f = { a: good().t, b: good().t }; f.a.people = {}; f.b.item = {};
  assert.deepEqual(errors(validate(f)).map(x => [x.team, x.path]), [['a', 'people'], ['b', 'item.status']]);
});
