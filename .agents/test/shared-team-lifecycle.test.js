// Tests for src/team/team.js and src/team/lifecycle.js - cli-parity job 15 (TEAM): the team metadata rules and the
// claim, review, wait and close lifecycle of `backlog update`.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, itemPath, sharedBacklog, readItem, itemSlugs, GIT_IDENTITY, ENVELOPE } from './shared-fixtures.js';
import * as index from '../../src/shared/index.js';
import * as store from '../../src/shared/store.js';
import * as team from '../../src/team/team.js';
import { asList } from '../../src/shared/text.js';

team.installSeam(); // this file calls the old team code in this process
const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// A shared home with the consuming repository acme/demo on main; the items are made with `new`.
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer', count: 1, anyone: true }] } })); // every item is a team's: one peer review of its work
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
// update() reads the write set as the named agent first; stale-view refusals have their own regression suite.
const update = (f, args, env) => {
  const named = ['--by', '--claim', '--release'].map(k => args[args.indexOf(k) + 1]).find((v, i) => args.includes(['--by', '--claim', '--release'][i]));
  const who = named ?? (args.includes('--request-review') ? 'ann' : 'smooth'); // a review is requested by the one working on the item (ann here); an un-named write acts as the environment agent (smooth here)
  if (who && args[0] && !args[0].startsWith('-')) {
    const slugs = args.includes('--close') ? itemSlugs(f.folder) : [args[0]];
    for (const slug of slugs) cli(['show', slug, '--agent', named === undefined && args.includes('--close') ? (item(f, slug).fm.claimed_by || who) : who], { cwd: f.cons, tmp: f.t, env: env || { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
  }
  return cli(['update', ...args], { cwd: f.cons, tmp: f.t, env: env || { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
};
const history = (f, item) => cli(['history', item], { cwd: f.cons, tmp: f.t });
const item = (f, slug) => readItem(itemPath(f.folder, slug));

test('team.js: lists, chunk items, review documents', () => {
  assert.deepEqual(asList(' a, b ,,c '), ['a', 'b', 'c']);
  assert.deepEqual(asList(' None '), []);
  assert.deepEqual(asList(undefined), []);
  assert.deepEqual(asList([1, ' x ', '']), ['1', 'x']);
  for (const v of [true, 'true', 'yes', '1', 'True']) assert.equal(team.isChunk({ chunk: v }), true, String(v)); // lib_db.is_chunk
  for (const v of [false, 'no', '', undefined]) assert.equal(team.isChunk({ chunk: v }), false, String(v));
  assert.equal(team.isChunk({ work_class: ['chunk'] }), false); // the old class field means nothing
  assert.equal(team.needsReview({ review_refs: ['references/review/code.md'] }), true);
  assert.equal(team.needsReview({ review_classes: ['code'] }), false);
  for (const name of ['WORK_CLASSES', 'REVIEW_CLASSES', 'parseClasses', 'uncoveredReviewClasses', 'fallbackReview']) assert.ok(!(name in team), name);
});

test('team.js: the team entry names the members in order and the review-only ones; the roster file reader is gone', () => {
  const f = fixture();
  writeFileSync(join(f.home, 'teams.json'), JSON.stringify({ t1: { members: ['ann', 'bob', 'cy'], review_only: ['bob'] }, t2: {} }));
  team.setTeamsHome(f.home);
  assert.deepEqual(team.teamMembers('t1'), ['ann', 'bob', 'cy']);
  assert.deepEqual(team.reviewOnly('t1'), ['bob']);
  assert.deepEqual([team.teamMembers('t2'), team.reviewOnly('t2'), team.reviewOnly('nope')], [[], [], []]);
  assert.ok(!('loadRoster' in team));
});

// Item files of a folder (the rules read the rows built from them, the files only for metadata).
function seed(f) {
  const put = (seq, name, extra) => store.write({
    path: itemPath(f.folder, `${String(seq).padStart(3, '0')}-${name}`),
    fm: { ...ENVELOPE, phase: `${String(seq).padStart(3, '0')}-${name}`, seq, name, status: 'pending', priority: seq - 1, depends_on: [], claimed_by: '', ...extra },
    body: '\n',
  }, f.folder);
  return { put };
}

test('team.js: held items, the claim rule, undone dependencies on a folder', () => {
  const f = fixture();
  const { put } = seed(f);
  put(1, 'a', { status: 'in_progress', claimed_by: 'ann' });
  put(2, 'b', { status: 'in_progress', claimed_by: 'ann', review_state: 'requested' });
  put(3, 'c', { status: 'in_progress', claimed_by: 'ann', wait_on: 'run 5' });
  put(4, 'd', { status: 'done', claimed_by: 'ann' });
  put(5, 'e', { status: 'in_progress', claimed_by: 'bob' });
  put(6, 'f', { depends_on: [1, '004-d', 'nothing', 5] });
  assert.deepEqual(team.heldItems(f.folder, 'ann').map(h => [h.slug, h.state]), [['001-a', 'active'], ['002-b', 'awaiting-review'], ['003-c', 'waiting:run 5']]);
  assert.equal(team.claimRefusal(f.folder, 'ann'), 'ann holds 1 active item(s): 001-a; pull new work only when every item you hold waits (review requested, or what it waits for recorded on the item); --force overrides');
  assert.equal(team.claimRefusal(f.folder, 'nobody'), null);
  const undone = team.undoneDependencies(f.folder, { depends_on: [1, '004-d', 'nothing', 5] });
  assert.deepEqual(undone.map(d => team.describeDependency(d)), ['001-a (status in progress, claimed by ann)', 'nothing (no such item in this backlog)', '005-e (status in progress, claimed by bob)']);
});

