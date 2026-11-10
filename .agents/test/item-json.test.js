// The JSON item codec: byte-exact text, fixed order, round trip over the shared fixtures, unreadable cases, history lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromItemJson, toItemJson } from '../../src/shared/item-json.js';
import { parseItem } from '../../src/shared/frontmatter.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/shared/', import.meta.url));

test('a user item with every built-in field gives these exact bytes', () => {
  const fm = {
    phase: '042-add-the-login-form', seq: 42, name: 'Add the login form', repository: 'acme/app', branch: 'main',
    created: '2026-11-09T10:00:00Z', updated: '2026-11-09T11:20:00Z', updated_by: 'ann',
    status: 'pending', objective: 'o', summary: 's', location: 'src/', commit: 'abc123', severity: 'normal', claimed_by: 'ann', claimed_at: '2026-11-09T11:00:00Z',
    owner: 'ann', depends_on: [41], parent: null, estimate_min: 40, complexity: 'low', layer: 'cli', chunk: true, size_score: 3, completed: '',
    events: ['2026-11-09T10:00:00Z new main abc123 first'],
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
    "claimed_by": "ann",
    "claimed_at": "2026-11-09T11:00:00Z",
    "owner": "ann",
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
    { "at": "2026-11-09T10:00:00Z", "by": "", "session": "", "step": "new", "changes": {}, "note": "main abc123 first" }
  ]
}
`);
});

test('a team item puts undeclared keys after the built-in ones, in alphabetical order', () => {
  const fm = { zeta: [1, 'a'], phase: '007-x', seq: 7, name: 'X', team: 'parallel', repository: 'acme/app', branch: 'b', created: null, updated: 'u', updated_by: 'm1', alpha: false, status: 'closed', events: ['t a - - '] };
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
  const a = { phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', created: 'c', updated: 'u', updated_by: 'w', status: 's', owner: 'o', zz: 1, aa: 2, events: ['t e x'] };
  const b = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(toItemJson(a, 'x'), toItemJson(b, 'x'));
});

test('every item file of the shared fixtures reads back as it was given', () => {
  const names = readdirSync(FIXTURES).filter(n => n.endsWith('.md'));
  assert.ok(names.length >= 6);
  for (const n of names) {
    const item = parseItem(readFileSync(FIXTURES + n, 'utf8'));
    const text = toItemJson(item.fm, item.body);
    assert.deepEqual(fromItemJson(text), { fm: item.fm, body: item.body }, n);
    assert.equal(toItemJson(fromItemJson(text).fm, fromItemJson(text).body), text, n);
  }
});

test('a written item with a team, a history and a writer reads back as given', () => {
  const fm = { phase: '042-x', seq: 42, name: 'X', team: 'parallel', repository: 'acme/app', branch: 'main', created: 'c', updated: 'u', updated_by: 'w', status: 'new', k: { n: [1] }, events: ['t1 new main abc note one', 't2 done - -'] };
  assert.deepEqual(fromItemJson(toItemJson(fm, 'b\n')), { fm, body: 'b\n' });
});

test('a missing team, a null created and an empty updated_by give no key', () => {
  const { fm } = fromItemJson(toItemJson({ phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', created: null, updated: 'u', updated_by: '' }, ''));
  for (const k of ['team', 'created', 'updated_by', 'events']) assert.equal(k in fm, false, k);
});

test('one history entry per line, and the line is rebuilt as at + step + note', () => {
  const events = ['2026-11-09T10:00:00Z new main abc a note with  spaces', '2026-11-09T10:01:00Z claim - - '];
  const text = toItemJson({ events }, '');
  assert.equal(text.split('\n').filter(l => l.includes('"at"')).length, 2);
  assert.deepEqual(fromItemJson(text).fm.events, events);
});

const good = () => JSON.parse(toItemJson({ phase: 'p', seq: 1, name: 'n', repository: 'r', branch: 'b', created: 'c', updated: 'u', updated_by: 'w', events: ['t e x'] }, 'b'));
const unreadable = [
  ['not JSON', 'not json', 'file'],
  ['not an object', '[1]', 'file'],
  ['null', 'null', 'file'],
  ...[['seq', '1'], ['slug', 5], ['name', []], ['team', 5], ['repository', {}], ['branch', 1], ['created', 1], ['updated', true], ['updated_by', 1], ['fields', []], ['fields', 'x'], ['body', null], ['history', {}]]
    .map(([k, v]) => [`${k} of the wrong type`, JSON.stringify({ ...good(), [k]: v }), k]),
  ['a missing envelope key', JSON.stringify((({ branch, ...r }) => r)(good())), 'branch'],
  ['a field named like an envelope key', JSON.stringify({ ...good(), fields: { name: 'x' } }), 'fields.name'],
  ['a history entry that is not an object', JSON.stringify({ ...good(), history: ['x'] }), 'history[0]'],
  ['a history entry with a wrong key', JSON.stringify({ ...good(), history: [{ ...good().history[0], step: 3 }] }), 'history[0].step'],
];
for (const [what, text, key] of unreadable) {
  test(`unreadable item: ${what} names ${key}`, () => {
    assert.throws(() => fromItemJson(text), e => e.field === key && e.message.includes(key));
  });
}
