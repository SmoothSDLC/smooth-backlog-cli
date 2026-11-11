// Only the old team commands read the earlier words of an item: a process that runs anything else reads and writes a team item as stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import * as index from '../../src/shared/index.js';
import { seam } from '../../src/shared/seam.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';
import * as teamCli from '../../src/team/cli.js';
import { installSeam } from '../../src/team/team.js';
import { toFile } from '../../src/team/item.js';

const entry = { item: { status: {}, priority: {}, stage: {} } };
const T = '2026-11-09T10:00:00Z';
const mk = (seq, name, fields) => ({ seq, slug: `${String(seq).padStart(3, '0')}-${name}`, name, team: 'p', repository: 'acme/demo', branch: 'main', created: T, updated: T, updated_by: 'ann', body: `\n# Phase ${String(seq).padStart(3, '0')} — ${name}\n`, fields, history: [] });
const FIELDS = { status: 'done', priority: 3, stage: 'mine', review_state: 'passed' };
const fieldsOf = (folder, slug) => JSON.parse(readFileSync(join(folder, 'phases', `${slug}.json`), 'utf8')).fields;
const put = (folder, item) => { mkdirSync(join(folder, 'phases'), { recursive: true }); writeFileSync(join(folder, 'phases', `${item.slug}.json`), toFile(item, entry)); };
const git = (cwd, ...a) => { const p = spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }); if (p.status) throw new Error(p.stderr); return p.stdout.trim(); };

test('importing the team router installs nothing; the old routes install it', () => {
  assert.equal(typeof teamCli.run, 'function');
  assert.equal(seam.entry, null);
  assert.equal(seam.isMember, null);
});

test('without the seam a team item is read and written as stored by the store, the index and the renumbering of a publication', async t => {
  assert.equal(seam.entry, null);
  const dir = mkdtempSync(join(tmpdir(), 'seam-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [k, v] of Object.entries(GIT_IDENTITY)) { const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; }); }
  const home = sharedBacklog(dir);
  const bare = join(dir, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  const home2 = join(dir, 'home2'); git(dir, 'clone', '-q', bare, home2);
  const [f1, f2] = [join(home, 'acme', 'demo'), join(home2, 'acme', 'demo')];

  put(f1, mk(1, 'alpha', FIELDS)); put(f2, mk(1, 'beta', FIELDS));
  const [a] = store.load(f1);
  assert.deepEqual([a.fm.status, a.fm.priority, a.fm.stage, a.fm.review_state, 'refiner' in a.fm], ['done', 3, 'mine', 'passed', false]);
  store.write({ path: join(f1, a.path), fm: a.fm, body: a.body }, f1);
  assert.deepEqual(fieldsOf(f1, '001-alpha'), FIELDS);
  index.seed(f1); // a folder with items and no index gets one built from the stored words
  assert.equal(index.rows(f1).rows[0].status, 'done');
  assert.equal(JSON.parse(readFileSync(index.file(f1), 'utf8')).branches.main[0].status, 'done');

  await sync.commitSettled(home, f1, 'new alpha');
  const w = process.stdout.write; let out = ''; process.stdout.write = c => { out += c; return true; };
  try { await sync.commitSettled(home2, f2, 'new beta'); } finally { process.stdout.write = w; }
  assert.match(out, /renumbered 001 -> 002/);
  assert.equal(existsSync(join(f2, 'phases', '001-beta.json')), false);
  assert.deepEqual(fieldsOf(f2, '002-beta'), FIELDS, 'the renumbered team item keeps done, priority, stage and review_state');
});

test('the old routes install the earlier-words reading, and it translates', t => {
  const was = { ...seam };
  t.after(() => Object.assign(seam, was));
  installSeam();
  assert.equal(typeof seam.entry, 'function');
  const dir = mkdtempSync(join(tmpdir(), 'seam-old-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const folder = join(dir, 'acme', 'demo'); put(folder, mk(1, 'alpha', { status: 'done' }));
  seam.entry = () => null; // an installed seam that knows no entry: the word is still translated
  assert.equal(store.load(folder)[0].fm.status, 'closed');
});
