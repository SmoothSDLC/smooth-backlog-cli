// Item 096 (slice A of 050) dropped the two retired classification keys of older items whenever the CLI wrote the item. Since the
// migration produces items that carry such keys on purpose, store.write keeps every key of every item: these cases pin that an
// item with the keys is written back with them, by the store and by every command that rewrites it. Case 6 is a regression pin. The key names are plain strings here: .agents/test is outside the 049 grep contract.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, consumer, createdSlug, itemPath, sharedBacklog, readStored, writeStored } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const KEYS = ['work_class', 'review_classes'];

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'legacy-fields-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const run = (f, args) => cli(args, { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
const ok = (f, args) => { const r = run(f, args); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const make = (f, name) => createdSlug(ok(f, ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none',
  '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout);
const pathOf = (f, slug) => itemPath(f.folder, slug);
const text = (f, slug) => readFileSync(pathOf(f, slug), 'utf8');
const read = (f, slug) => ok(f, ['show', slug, '--agent', 'me']);
// A class-era item: both keys written straight into the file, bypassing the migration.
function seed(f, slug) {
  const s = readStored(pathOf(f, slug));
  writeStored(pathOf(f, slug), { work_class: ['chunk'], review_classes: ['security'], ...s.fm }, s.body);
  assert.ok(KEYS.every(k => k in readStored(pathOf(f, slug)).fm), 'the seeded file carries both keys');
  read(f, slug); // the file changed behind the CLI's back: the agent reads it again before it writes (the stale-read guard)
}
const has = (f, slug) => KEYS.filter(k => k in readStored(pathOf(f, slug)).fm);

test('096: writing an open item keeps the two retired keys and every other field', () => {
  const f = fixture();
  const s = make(f, 'plain');
  const { fm, body } = readStored(pathOf(f, s));
  store.write({ path: pathOf(f, s), fm: { ...fm, work_class: ['chunk'], review_classes: ['security'] }, body }, f.folder);
  assert.deepEqual(has(f, s), KEYS);
  assert.deepEqual(readStored(pathOf(f, s)).fm, { ...fm, work_class: ['chunk'], review_classes: ['security'] });
});

test('096: backlog update --append on an item that carries both keys leaves them in the file; the commit does not remove them', () => {
  const f = fixture();
  const s = make(f, 'appended');
  seed(f, s);
  // commit the class-era file first: the next commit's diff then holds the removal
  spawnSync('git', ['-C', f.home, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-am', 'seed legacy keys'], { encoding: 'utf8' });
  spawnSync('git', ['-C', f.home, 'push', '-q', 'origin', 'HEAD:main'], { encoding: 'utf8' }); // the CLI refuses unpublished commits
  ok(f, ['update', s, '--append', 'a note', '--by', 'me']);
  assert.deepEqual(has(f, s), KEYS);
  const shown = spawnSync('git', ['-C', f.home, 'show', 'HEAD', '--', '.'], { encoding: 'utf8' }).stdout;
  assert.doesNotMatch(shown, /^-\s+"work_class":/m);
  assert.doesNotMatch(shown, /^-\s+"review_classes":/m);
});

test('096: a priority move rewrites no neighbour, and the neighbour keeps the keys through its own next write', () => {
  const f = fixture();
  const a = make(f, 'first'); const b = make(f, 'second');
  seed(f, a); read(f, b);
  ok(f, ['update', b, '--priority', '0', '--by', 'me']);
  assert.deepEqual(has(f, a), ['work_class', 'review_classes']);
  ok(f, ['update', a, '--append', 'a note', '--by', 'me']);
  assert.deepEqual(has(f, a), ['work_class', 'review_classes']);
});

test('096: a front-matter-only write keeps the keys', () => {
  const f = fixture();
  const s = make(f, 'front matter only');
  seed(f, s);
  const { fm, body } = readStored(pathOf(f, s));
  store.write({ path: pathOf(f, s), fm, body }, f.folder, { frontMatterOnly: true });
  assert.deepEqual(has(f, s), KEYS);
});

test('096: query --phase shows the keys of a legacy item, before and after update --append', () => {
  const f = fixture();
  const s = make(f, 'transition');
  seed(f, s);
  const keys = () => { const j = JSON.parse(ok(f, ['show', s, '--json']).stdout); return KEYS.filter(k => k in (j.front_matter ?? j)); };
  assert.deepEqual(keys(), KEYS);
  ok(f, ['update', s, '--append', 'a note', '--by', 'me']);
  assert.deepEqual(keys(), KEYS);
});

test('a migrated item keeps stage, review_state and its other keys through backlog update, whatever word its status holds', () => {
  const f = fixture();
  const s = make(f, 'migrated');
  const stored = readStored(pathOf(f, s));
  writeStored(pathOf(f, s), { ...stored.fm, status: 'ready', stage: 'refined', review_state: 'none', priority: 7, refiner: 'bob' }, stored.body); // as the migration leaves an item: the order's word and the keys kept as fields
  read(f, s);
  ok(f, ['update', s, '--append', 'a note', '--by', 'me']);
  ok(f, ['update', s, '--summary', 'changed', '--by', 'me']);
  const kept = readStored(pathOf(f, s)).fm;
  assert.deepEqual([kept.status, kept.stage, kept.review_state, kept.priority, kept.refiner], ['ready', 'refined', 'none', 7, 'bob']);
});

test('096 pin: an item without the keys is rewritten byte for byte as before', () => {
  const f = fixture();
  const s = make(f, 'pin');
  const before = text(f, s);
  const { fm, body } = readStored(pathOf(f, s));
  store.write({ path: pathOf(f, s), fm, body }, f.folder);
  assert.equal(text(f, s), before);
});
