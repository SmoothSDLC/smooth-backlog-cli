// The JSON item codec: byte-exact text, fixed order, round trip over the shared fixtures, unreadable cases, history entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromItemJson, toItemJson } from '../../src/shared/item-json.js';
import { parseItem } from '../../src/shared/frontmatter.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/shared/', import.meta.url));

const E = (at, step, note) => ({ at, by: '', session: '', step, changes: {}, note }); // an entry that carries no writer and no changes

test('a user item with every built-in field gives these exact bytes', () => {
  const fm = {
    phase: '042-add-the-login-form', seq: 42, name: 'Add the login form', repository: 'acme/app', branch: 'main',
    created: '2026-11-09T10:00:00Z', updated: '2026-11-09T11:20:00Z', updated_by: 'ann',
    status: 'pending', objective: 'o', summary: 's', location: 'src/', commit: 'abc123', severity: 'normal', owner: 'ann', owned_since: '2026-11-09T11:00:00Z',
    depends_on: [41], parent: null, estimate_min: 40, complexity: 'low', layer: 'cli', chunk: true, size_score: 3, completed: '',
    events: [{ at: '2026-11-09T10:00:00Z', by: 'ann', session: 's1', step: 'new', changes: { status: [null, 'pending'], severity: ['low', 'normal'] }, note: 'first' }],
  };
  assert.equal(toItemJson(fm, '# Phase 42\n'), `{
  "seq": 42,
  "slug": "042-add-the-login-form",
  "name": "Add the login form",
  "repository": "acme/app",
  "branch": "main",
  "created": "2026-11-09T10:00:00Z",
  "updated": "2026-11-09T11:20:00Z",
  "updated_by": "ann",
  "fields": {
    "status": "pending",
    "objective": "o",
    "summary": "s",
    "location": "src/",
    "commit": "abc123",
    "severity": "normal",
    "owner": "ann",
    "owned_since": "2026-11-09T11:00:00Z",
    "depends_on": [41],
    "parent": null,
    "estimate_min": 40,
    "complexity": "low",
    "layer": "cli",
    "chunk": true,
    "size_score": 3,
    "completed": ""
  },
  "body": "# Phase 42\\n",
  "history": [
    { "at": "2026-11-09T10:00:00Z", "by": "ann", "session": "s1", "step": "new", "changes": {"status":[null,"pending"],"severity":["low","normal"]}, "note": "first" }
  ]
}
`);
});

test('a team item puts undeclared keys after the built-in ones, in alphabetical order', () => {
  const fm = { zeta: [1, 'a'], phase: '007-x', seq: 7, name: 'X', team: 'parallel', repository: 'acme/app', branch: 'b', created: null, updated: 'u', updated_by: 'm1', alpha: false, status: 'closed', events: [E('t', 'a', '- - ')] };
  assert.equal(toItemJson(fm, ''), `{
  "seq": 7,
  "slug": "007-x",
  "name": "X",
  "team": "parallel",
  "repository": "acme/app",
  "branch": "b",
  "created": null,
  "updated": "u",
  "updated_by": "m1",
  "fields": {
    "status": "closed",
    "alpha": false,
    "zeta": [1,"a"]
  },
  "body": "",
  "history": [
    { "at": "t", "by": "", "session": "", "step": "a", "changes": {}, "note": "- - " }
  ]
}
`);
});

test('an item with no history, a null created and no team', () => {
  assert.equal(toItemJson({ phase: '001-a', seq: 1, name: 'A', team: '', repository: 'r', branch: 'b', updated: 'u' }, 'text'), `{
  "seq": 1,
  "slug": "001-a",
  "name": "A",
  "repository": "r",
  "branch": "b",
  "created": null,
  "updated": "u",
  "updated_by": "",
  "fields": {},
  "body": "text",
  "history": []
}
`);
});

test('the order is fixed whatever the insertion order of the header object', () => {
  const a = { phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', created: 'c', updated: 'u', updated_by: 'w', status: 's', owner: 'o', zz: 1, aa: 2, events: [E('t', 'e', 'x')] };
  const b = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(toItemJson(a, 'x'), toItemJson(b, 'x'));
});

test('every item file of the shared fixtures reads back as it was given', () => {
  const names = readdirSync(FIXTURES).filter(n => n.endsWith('.md'));
  assert.ok(names.length >= 6);
  for (const n of names) {
    const item = parseItem(readFileSync(FIXTURES + n, 'utf8'));
    // The .md fixtures lack the keys the JSON item requires (seq, slug, name, repository, branch, updated); the test supplies them, the codec does not.
    item.fm = { seq: 1, phase: '001-x', name: 'n', repository: 'r', branch: 'b', updated: 'u', ...item.fm };
    if (item.fm.events) item.fm.events = item.fm.events.map(l => { const [at, step, ...note] = l.split(' '); return E(at, step, note.join(' ')); }); // an event line of the markdown fixtures, as an entry
    const text = toItemJson(item.fm, item.body);
    assert.deepEqual(fromItemJson(text), { fm: item.fm, body: item.body }, n);
    assert.equal(toItemJson(fromItemJson(text).fm, fromItemJson(text).body), text, n);
  }
});

test('a written item with a team, a history and a writer reads back as given', () => {
  const fm = { phase: '042-x', seq: 42, name: 'X', team: 'parallel', repository: 'acme/app', branch: 'main', created: 'c', updated: 'u', updated_by: 'w', status: 'new', k: { n: [1] }, events: [E('t1', 'new', 'note one'), { at: 't2', by: 'w', session: 's', step: 'done', changes: { status: ['new', 'closed'] }, note: '' }] };
  assert.deepEqual(fromItemJson(toItemJson(fm, 'b\n')), { fm, body: 'b\n' });
});

test('a missing team, a null created and an empty updated_by give no key', () => {
  const { fm } = fromItemJson(toItemJson({ phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', created: null, updated: 'u', updated_by: '' }, ''));
  for (const k of ['team', 'created', 'updated_by', 'events']) assert.equal(k in fm, false, k);
});

test('one history entry per line, kept whole', () => {
  const events = [{ at: '2026-11-09T10:00:00Z', by: 'ann', session: '', step: 'new', changes: { name: [null, 'n'], depends_on: [[1], []] }, note: 'a note with  spaces' }, E('2026-11-09T10:01:00Z', 'claim', '')];
  const text = toItemJson({ phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', updated: 'u', events }, '');
  assert.equal(text.split('\n').filter(l => l.includes('"at"')).length, 2);
  assert.deepEqual(fromItemJson(text).fm.events, events);
});

test('an entry written without by, session or changes reads with them empty', () => {
  const doc = JSON.parse(toItemJson({ phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', updated: 'u' }, ''));
  doc.history = [{ at: 't', step: 'new', note: 'main abc first' }];
  assert.deepEqual(fromItemJson(JSON.stringify(doc)).fm.events, [E('t', 'new', 'main abc first')]);
});

const good = () => JSON.parse(toItemJson({ phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', created: 'c', updated: 'u', updated_by: 'w', events: [E('t', 'e', 'x')] }, 'b'));
const unreadable = [
  ['not JSON', 'not json', undefined],
  ['not an object', '[1]', undefined],
  ['null', 'null', undefined],
  ...[['seq', '1'], ['slug', 5], ['name', []], ['team', 5], ['repository', {}], ['branch', 1], ['created', 1], ['seq', null], ['slug', null], ['name', null], ['repository', null], ['branch', null], ['updated', null], ['updated_by', null], ['updated', true], ['updated_by', 1], ['fields', []], ['fields', 'x'], ['body', null], ['history', {}]]
    .map(([k, v]) => [`${k} of the wrong type`, JSON.stringify({ ...good(), [k]: v }), k]),
  ['a missing envelope key', JSON.stringify((({ branch, ...r }) => r)(good())), 'branch'],
  ...['seq', 'slug', 'name', 'team', 'repository', 'branch', 'created', 'updated', 'updated_by', 'events']
    .map(k => [`a field named ${k}`, JSON.stringify({ ...good(), fields: { [k]: 'x' } }), `fields.${k}`]),
  ['a field named __proto__', JSON.stringify({ ...good(), fields: JSON.parse('{"__proto__": {"x": 1}}') }).replace('"fields":{}', '"fields":{"__proto__":{"x":1}}'), 'fields.__proto__'],
  ['changes that is a list', JSON.stringify({ ...good(), history: [{ ...good().history[0], changes: [] }] }), 'history[0].changes'],
  ['a history entry that is not an object', JSON.stringify({ ...good(), history: ['x'] }), 'history[0]'],
  ['a history entry with a wrong key', JSON.stringify({ ...good(), history: [{ ...good().history[0], step: 3 }] }), 'history[0].step'],
];
for (const [what, text, key] of unreadable) {
  test(`unreadable item: ${what} names ${key}`, () => {
    assert.throws(() => fromItemJson(text), e => e.field === key && (key === undefined || e.message.includes(key)));
  });
}

test('a field named phase is allowed and cannot replace the slug', () => {
  const doc = { ...good(), fields: { phase: 'x' } };
  assert.equal(fromItemJson(JSON.stringify(doc)).fm.phase, 'p');
});

test('a __proto__ field does not reach the prototype', () => {
  const text = JSON.stringify(good()).replace('"fields":{}', '"fields":{"__proto__":{"polluted":1}}');
  assert.ok(text.includes('__proto__'));
  assert.throws(() => fromItemJson(text), e => e.field === 'fields.__proto__');
  assert.equal({}.polluted, undefined);
});

const header = () => ({ phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', created: null, updated: 'u' });
const refused = [
  ...['seq', 'phase', 'name', 'repository', 'branch', 'updated'].map(k => [`${k} missing`, (({ [k]: _, ...r }) => r)(header()), k === 'phase' ? 'slug' : k]),
  ['seq as text', { ...header(), seq: '007' }, 'seq'], ['seq fractional', { ...header(), seq: 1.5 }, 'seq'],
  ['name a number', { ...header(), name: 2024 }, 'name'], ['team a number', { ...header(), team: 5 }, 'team'],
  ['branch null', { ...header(), branch: null }, 'branch'], ['created a number', { ...header(), created: 3 }, 'created'],
  ['updated_by a number', { ...header(), updated_by: 3 }, 'updated_by'],
  ['a header key named slug', { ...header(), slug: 'x' }, 'slug'],
  ['events not a list', { ...header(), events: 'x' }, 'events'],
  ['an event that is a line of text', { ...header(), events: ['t e x'] }, 'events[0]'],
  ['an entry without a step', { ...header(), events: [{ at: 't', note: '' }] }, 'events[0].step'],
];
for (const [what, h, key] of refused) {
  test(`the writer refuses a header with ${what}`, () => {
    assert.throws(() => toItemJson(h, ''), e => e.field === key && e.message.includes(key));
  });
}

test('a phase key in the header is the slug, never a field', () => {
  assert.equal(JSON.parse(toItemJson(header(), '')).fields.phase, undefined);
});
