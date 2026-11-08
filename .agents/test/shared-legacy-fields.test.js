// Item 096 (slice A of 050): the CLI drops the two retired classification keys of older items whenever it writes the item
// (store.write, the front-matter-only path, and every command that rewrites another item). Cases 1-5 fail before the change;
// case 6 is a regression pin. The key names are plain strings here: .agents/test is outside the 049 grep contract.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, consumer, createdSlug, sharedBacklog } from './shared-fixtures.js';
import { parse } from '../../src/shared/frontmatter.js';
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
const run = (f, args) => cli(args, { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '', BACKLOG_SESSION: '' } });
const ok = (f, args) => { const r = run(f, args); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const make = (f, name) => createdSlug(ok(f, ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none',
  '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout);
const pathOf = (f, slug) => join(f.folder, 'phases', `${slug}.md`);
const text = (f, slug) => readFileSync(pathOf(f, slug), 'utf8');
const read = (f, slug) => ok(f, ['show', slug, '--agent', 'me']);
// A class-era item: both keys written straight into the file, bypassing the migration.
function seed(f, slug) {
  const s = text(f, slug);
  writeFileSync(pathOf(f, slug), s.replace(/^---\n/, '---\nwork_class:\n- chunk\nreview_classes:\n- security\n'));
  assert.ok(KEYS.every(k => text(f, slug).includes(`${k}:`)), 'the seeded file carries both keys');
  read(f, slug); // the file changed behind the CLI's back: the agent reads it again before it writes (the stale-read guard)
}
const has = (f, slug) => KEYS.filter(k => new RegExp(`^${k}:`, 'm').test(text(f, slug)));

test('096: writing an open item removes the two retired keys and keeps every other field', () => {
  const f = fixture();
  const s = make(f, 'plain');
  const { fm, body } = parse(text(f, s));
  store.write({ path: pathOf(f, s), fm: { ...fm, work_class: ['chunk'], review_classes: ['security'] }, body }, f.folder);
  assert.deepEqual(has(f, s), []);
  assert.deepEqual(parse(text(f, s)).fm, fm);
});

test('096: backlog update --append on an item that carries both keys leaves the file without them; the commit contains the removal', () => {
  const f = fixture();
  const s = make(f, 'appended');
  seed(f, s);
  // commit the class-era file first: the next commit's diff then holds the removal
  spawnSync('git', ['-C', f.home, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-am', 'seed legacy keys'], { encoding: 'utf8' });
  spawnSync('git', ['-C', f.home, 'push', '-q', 'origin', 'HEAD:main'], { encoding: 'utf8' }); // the CLI refuses unpublished commits
  ok(f, ['update', s, '--append', 'a note', '--by', 'me']);
  assert.deepEqual(has(f, s), []);
  const shown = spawnSync('git', ['-C', f.home, 'show', 'HEAD', '--', '.'], { encoding: 'utf8' }).stdout;
  assert.match(shown, /^-work_class:/m);
  assert.match(shown, /^-review_classes:/m);
});

test('096: a priority move rewrites no neighbour: the keys stay in it until its own next write drops them', () => {
  const f = fixture();
  const a = make(f, 'first'); const b = make(f, 'second');
  seed(f, a); read(f, b);
  ok(f, ['update', b, '--priority', '0', '--by', 'me']);
  assert.deepEqual(has(f, a), ['work_class', 'review_classes']);
  ok(f, ['update', a, '--append', 'a note', '--by', 'me']);
  assert.deepEqual(has(f, a), []);
});

test('096: a front-matter-only write drops the keys', () => {
  const f = fixture();
  const s = make(f, 'front matter only');
  seed(f, s);
  const { fm, body } = parse(text(f, s));
  store.write({ path: pathOf(f, s), fm, body }, f.folder, { frontMatterOnly: true });
  assert.deepEqual(has(f, s), []);
});

test('096: query --phase on an unwritten legacy item still shows the keys; after update --append it no longer does', () => {
  const f = fixture();
  const s = make(f, 'transition');
  seed(f, s);
  const keys = () => { const j = JSON.parse(ok(f, ['show', s, '--json']).stdout); return KEYS.filter(k => k in (j.front_matter ?? j)); };
  assert.deepEqual(keys(), KEYS);
  ok(f, ['update', s, '--append', 'a note', '--by', 'me']);
  assert.deepEqual(keys(), []);
});

test('096 pin: an item without the keys is rewritten byte for byte as before', () => {
  const f = fixture();
  const s = make(f, 'pin');
  const before = text(f, s);
  const { fm, body } = parse(before);
  store.write({ path: pathOf(f, s), fm, body }, f.folder);
  assert.equal(text(f, s), before);
});
