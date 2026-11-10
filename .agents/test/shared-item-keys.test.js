// The stored keys of an item are the owner's words: title, last_updated, last_updated_by, owner and owned_since. A file written with the
// earlier keys (name, updated, updated_by, claimed_by, claimed_at) is read forever and rewritten with the new keys at its next write.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, createdSlug, itemPath, sharedBacklog, readStored, writeStored } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const NEW_KEYS = ['title', 'last_updated', 'last_updated_by', 'owner', 'owned_since'];
const OLD_KEYS = ['name', 'updated', 'updated_by', 'claimed_by', 'claimed_at'];

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'item-keys-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'me', SMOOTH_BACKLOG_CLI_SESSION: '', ...env } });
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name) => createdSlug(ok(f, ['new', '--name', name, '--objective', 'o', '--summary', 's']).stdout);
const pathOf = (f, slug) => itemPath(f.folder, slug);
const fmOf = (f, slug) => readStored(pathOf(f, slug)).fm;
// The file as an earlier release wrote it: the five stored keys under their earlier names (and the holder, if any, in claimed_by).
function asEarlier(f, slug) {
  const doc = readStored(pathOf(f, slug));
  const old = Object.fromEntries(Object.entries(doc.fm).flatMap(([k, v]) => {
    if (k === 'owner') return [['claimed_by', doc.fm.owned_since ? v : ''], ...(doc.fm.owned_since ? [] : [['owner', v]])];
    return [[{ title: 'name', last_updated: 'updated', last_updated_by: 'updated_by', owned_since: 'claimed_at' }[k] ?? k, v]];
  }));
  writeStored(pathOf(f, slug), old, doc.body);
}

test('a new item carries the new keys and none of the earlier ones', () => {
  const f = fixture();
  const fm = fmOf(f, make(f, 'Fresh'));
  assert.deepEqual(NEW_KEYS.filter(k => !(k in fm)), []);
  assert.deepEqual(OLD_KEYS.filter(k => k in fm), []);
  assert.equal(fm.title, 'Fresh');
  assert.equal(fm.owned_since, ''); // nobody holds it: the owner is the user of the configuration
  assert.notEqual(fm.owner, '');
});

test('a file with the earlier keys is read as it was, and its next write carries only the new keys', () => {
  const f = fixture();
  const s = make(f, 'Old keys');
  asEarlier(f, s);
  const before = fmOf(f, s);
  assert.deepEqual(NEW_KEYS.filter(k => k !== 'owner' && k in before), []); // the user the item belongs to was already in owner
  const shown = JSON.parse(ok(f, ['show', s, '--json']).stdout);
  assert.equal(shown.front_matter.title, 'Old keys'); // the item as the codec reads it, under the new keys
  assert.equal(shown.name, 'Old keys');
  ok(f, ['update', s, '--append', 'a note']);
  const after = fmOf(f, s);
  assert.deepEqual(OLD_KEYS.filter(k => k in after), []);
  assert.equal(after.title, 'Old keys');
  assert.equal(after.owner, before.owner);
});

test('a holder in claimed_by and claimed_at becomes owner and owned_since, and a release clears them', () => {
  const f = fixture();
  const s = make(f, 'Held');
  ok(f, ['update', s, '--claim', 'ada'], { SMOOTH_BACKLOG_CLI_AGENT: 'ada' });
  const held = fmOf(f, s);
  assert.equal(held.owner, 'ada');
  assert.match(held.owned_since, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(OLD_KEYS.filter(k => k in held), []);
  asEarlier(f, s);
  assert.equal(fmOf(f, s).claimed_by, 'ada');
  ok(f, ['update', s, '--release', 'ada'], { SMOOTH_BACKLOG_CLI_AGENT: 'ada' });
  const free = fmOf(f, s);
  assert.deepEqual([free.owner, free.owned_since], ['', '']);
  assert.deepEqual(OLD_KEYS.filter(k => k in free), []);
});

test('an item carrying both an earlier key and its new one keeps the new one', () => {
  const f = fixture();
  const s = make(f, 'Both');
  const p = pathOf(f, s);
  const doc = readStored(p); writeStored(p, Object.fromEntries(Object.entries(doc.fm).flatMap(([k, v]) => (k === 'title' ? [['name', 'Earlier'], [k, 'Newer']] : [[k, v]]))), doc.body);
  assert.equal(JSON.parse(ok(f, ['show', s, '--json']).stdout).front_matter.title, 'Newer');
  ok(f, ['update', s, '--append', 'x']);
  const after = fmOf(f, s);
  assert.equal(after.title, 'Newer');
  assert.ok(!('name' in after));
});

test('backlog fields lists the new keys and no earlier one', () => {
  const f = fixture();
  const keys = JSON.parse(ok(f, ['fields', '--json']).stdout).map(r => r.key);
  assert.deepEqual(NEW_KEYS.filter(k => !keys.includes(k)), []);
  assert.deepEqual(OLD_KEYS.filter(k => keys.includes(k)), []);
});
