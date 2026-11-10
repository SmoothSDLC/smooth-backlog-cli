// The stored keys of an item in markdown form (kept for the migration) are the owner's words: title, last_updated, last_updated_by, owner and owned_since. A file written with the
// earlier keys (name, updated, updated_by, claimed_by, claimed_at) is read forever and rewritten with the new keys at its next write.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, createdSlug, sharedBacklog } from './shared-fixtures.js';
import { dumpItem as dumpMarkdown, parse as parseMarkdown, parseItem as parseMarkdownItem } from '../../src/shared/frontmatter.js';

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
// the keys the markdown writer stores for a loaded header, and a markdown text as an earlier release wrote it
const stored = fm => parseMarkdown(dumpMarkdown(fm, 'body\n')).fm;
const LOADED = { phase: '001-x', seq: 1, name: 'Fresh', updated: '2026-10-01T00:00:00Z', updated_by: 'me', owner: 'me', claimed_by: '', claimed_at: '' };
const earlier = (text, holder = false) => { const old = text.replace(/^title:/m, 'name:').replace(/^last_updated:/m, 'updated:').replace(/^last_updated_by:/m, 'updated_by:').replace(/^owned_since:/m, 'claimed_at:'); return holder ? old.replace(/^owner:/m, 'claimed_by:') : old; };

test('the markdown writer stores the new keys and none of the earlier ones', () => {
  const fm = stored(LOADED);
  assert.deepEqual(NEW_KEYS.filter(k => !(k in fm)), []);
  assert.deepEqual(OLD_KEYS.filter(k => k in fm), []);
  assert.equal(fm.title, 'Fresh');
  assert.equal(fm.owned_since, ''); // nobody holds it: the owner is the user of the configuration
  assert.equal(fm.owner, 'me');
});

test('a markdown file with the earlier keys is read as it was, and its next write carries only the new keys', () => {
  const text = earlier(dumpMarkdown(LOADED, 'body\n'));
  assert.deepEqual(['title', 'last_updated', 'last_updated_by', 'owned_since'].filter(k => k in parseMarkdown(text).fm), [], 'the earlier names are in the file');
  const loaded = parseMarkdownItem(text);
  assert.equal(loaded.fm.name, 'Fresh');
  assert.equal(loaded.fm.updated, LOADED.updated);
  const after = stored(loaded.fm);
  assert.deepEqual(OLD_KEYS.filter(k => k in after), []);
  assert.equal(after.title, 'Fresh');
  assert.equal(after.owner, 'me');
});

test('a markdown holder in claimed_by and claimed_at becomes owner and owned_since, and a release clears them', () => {
  const holder = { ...LOADED, claimed_by: 'ada', claimed_at: '2026-10-02T00:00:00Z' };
  const held = stored(holder);
  assert.equal(held.owner, 'ada');
  assert.match(held.owned_since, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(OLD_KEYS.filter(k => k in held), []);
  assert.equal(parseMarkdownItem(earlier(dumpMarkdown(holder, ''), true)).fm.claimed_by, 'ada');
  const free = stored({ ...LOADED, claimed_by: '', claimed_at: '', owner: '' });
  assert.deepEqual([free.owner, free.owned_since], ['', '']);
});

test('a markdown file carrying both an earlier key and its new one keeps the new one', () => {
  const text = dumpMarkdown(LOADED, 'b\n').replace(/^title: .*$/m, 'name: "Earlier"\ntitle: "Newer"');
  const loaded = parseMarkdownItem(text);
  assert.equal(loaded.fm.name, 'Newer');
  assert.ok(!('title' in loaded.fm));
});

test('show --json prints the stored spellings of the keys: the new names, none of the earlier ones', () => {
  const f = fixture();
  const shown = JSON.parse(ok(f, ['show', make(f, 'Fresh'), '--json']).stdout);
  assert.deepEqual(NEW_KEYS.filter(k => !(k in shown.front_matter)), []);
  assert.deepEqual(OLD_KEYS.filter(k => k in shown.front_matter), []);
  assert.equal(shown.front_matter.title, 'Fresh');
});

test('backlog fields lists the new keys and no earlier one', () => {
  const f = fixture();
  const keys = JSON.parse(ok(f, ['fields', '--json']).stdout).map(r => r.key);
  assert.deepEqual(NEW_KEYS.filter(k => !keys.includes(k)), []);
  assert.deepEqual(OLD_KEYS.filter(k => keys.includes(k)), []);
});
