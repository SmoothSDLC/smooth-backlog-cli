// Tests for src/shared/index.js: the committed order of a repository folder (one file, one entry per line, the array order is the priority).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as index from '../../src/shared/index.js';
import * as store from '../../src/shared/store.js';
import { itemPath, itemRel, writeItem } from './shared-fixtures.js';

function folder(t) {
  const home = mkdtempSync(join(tmpdir(), 'index-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, 'acme', 'demo');
  mkdirSync(join(dir, 'phases'), { recursive: true });
  return dir;
}
// An item file as an earlier build wrote it, rank included (store.write drops the rank).
const put = (dir, n, extra = {}) => writeItem(itemPath(dir, `00${n}-i${n}`), { phase: `00${n}-i${n}`, seq: n, name: `I${n}`, status: 'pending', repository: 'acme/demo', branch: 'main', ...extra }, `Body ${n}.\n`);
const slugs = (dir, branch = 'main') => index.read(dir).branches[branch].map(e => e.slug);

test('read: a folder without an index has no branches', t => {
  const dir = folder(t);
  assert.deepEqual(index.read(dir), { branches: {} });
  assert.equal(index.exists(dir), false);
});

test('fromItems: the order of the legacy priority field (open items first), then the number; one entry per line', t => {
  const dir = folder(t);
  put(dir, 1, { priority: 2 }); put(dir, 2, { priority: 0 }); put(dir, 3, { priority: 1 }); put(dir, 4, { status: 'done', priority: 0 }); put(dir, 5, { branch: 'other', priority: 0 });
  const idx = index.fromItems(store.load(dir));
  assert.deepEqual(idx.branches.main.map(e => e.slug), ['002-i2', '003-i3', '001-i1', '004-i4']);
  assert.deepEqual(idx.branches.other.map(e => e.slug), ['005-i5']);
  assert.deepEqual(idx.branches.main[0], { seq: 2, slug: '002-i2', name: 'I2', status: 'pending' });
  index.write(dir, idx);
  const lines = readFileSync(index.file(dir), 'utf8').split('\n').filter(l => l.includes('"slug"'));
  assert.equal(lines.length, 5, 'one line per entry');
  assert.ok(lines.every(l => l.trim().startsWith('{"seq":') && l.includes('"name"') && l.includes('"status"')));
});

test('write: the same content gives the same bytes and is not rewritten', t => {
  const dir = folder(t);
  put(dir, 1); put(dir, 2);
  const idx = index.fromItems(store.load(dir));
  assert.equal(index.write(dir, idx), true);
  const bytes = readFileSync(index.file(dir));
  assert.equal(index.write(dir, index.read(dir)), false);
  assert.deepEqual(readFileSync(index.file(dir)), bytes);
  assert.equal(index.text(index.read(dir)), index.text(idx));
});

test('rank: the position of a live item in its branch, -1 when not listed', t => {
  const dir = folder(t);
  put(dir, 1); put(dir, 2); put(dir, 3);
  index.write(dir, index.fromItems(store.load(dir)));
  assert.equal(index.rank(dir, 'main', '002-i2'), 1);
  assert.equal(index.rank(dir, 'main', 'nope'), -1);
});

test('read: an index that is not JSON, or has no list of items per branch, is refused with exit 1 and points at the repository history', t => {
  const dir = folder(t);
  for (const bad of ['{not json', '{"branches": []}', '{"branches": {"main": [{"seq": 1}]}}']) {
    writeFileSync(index.file(dir), bad);
    assert.throws(() => index.read(dir), e => e.exitCode === 1 && /the backlog index cannot be read .*restore it from the repository history/.test(e.message), bad);
  }
});

test('reconcile: items without an entry are appended, entries without an item leave, name and status follow the file, open entries come first', () => {
  const item = (n, extra = {}) => ({ path: itemRel(`00${n}-i${n}`), fm: { phase: `00${n}-i${n}`, seq: n, name: `I${n}`, status: 'pending', branch: 'main', ...extra }, body: '' });
  const idx = { branches: { main: [{ seq: 1, slug: '001-i1', name: 'old', status: 'pending' }, { seq: 9, slug: '009-gone', name: 'G', status: 'pending' }, { seq: 2, slug: '002-i2', name: 'I2', status: 'pending' }] } };
  const { idx: next, order } = index.reconcile(idx, [item(1, { status: 'done', name: 'New' }), item(2), item(3)]);
  assert.deepEqual(next.branches.main, [
    { seq: 2, slug: '002-i2', name: 'I2', status: 'pending' }, { seq: 3, slug: '003-i3', name: 'I3', status: 'pending' }, { seq: 1, slug: '001-i1', name: 'New', status: 'done' },
  ]);
  assert.deepEqual(order, [['002-i2', 0], ['003-i3', 1]]);
});

test('reconcile: a move puts the item at the clamped rank among the open ones; a lead list goes first; an item of another branch leaves the list', () => {
  const item = (n, extra = {}) => ({ path: itemRel(`00${n}-i${n}`), fm: { phase: `00${n}-i${n}`, seq: n, name: `I${n}`, status: 'pending', branch: 'main', ...extra }, body: '' });
  const items = [item(1), item(2), item(3), item(4, { branch: 'b' })];
  const idx = { branches: { main: [{ seq: 4, slug: '004-i4', name: 'I4', status: 'pending' }] } };
  assert.deepEqual(index.reconcile(idx, items).idx.branches.main.map(e => e.slug), ['001-i1', '002-i2', '003-i3']);
  const ordered = index.reconcile(index.reconcile(idx, items).idx, items, { move: { slug: '003-i3', target: 0 } });
  assert.deepEqual(ordered.idx.branches.main.map(e => e.slug), ['003-i3', '001-i1', '002-i2']);
  assert.deepEqual(index.reconcile(ordered.idx, items, { move: { slug: '003-i3', target: 99 } }).idx.branches.main.map(e => e.slug), ['001-i1', '002-i2', '003-i3']);
  assert.deepEqual(index.reconcile(ordered.idx, items, { lead: ['002-i2'] }).idx.branches.main.map(e => e.slug), ['002-i2', '003-i3', '001-i1']);
  assert.deepEqual(index.reconcile(ordered.idx, items, { exclude: ['003-i3'] }).idx.branches.main.map(e => e.slug), ['001-i1', '002-i2']);
});

test('mergeOrders: upstream\'s order stands; the local side\'s moves, additions, removals and stamps are done again on it', () => {
  const e = (n, extra = {}) => ({ seq: n, slug: `00${n}-i${n}`, name: `I${n}`, status: 'pending', ...extra });
  const order = (...n) => ({ branches: { main: n.map(x => (typeof x === 'number' ? e(x) : x)) } });
  const slugs = m => m.branches.main.map(x => x.slug);
  // one item moved to the front on each side, from [1 2 3]
  assert.deepEqual(slugs(index.mergeOrders(order(1, 2, 3), order(3, 1, 2), order(2, 1, 3))), ['002-i2', '003-i3', '001-i1']);
  assert.deepEqual(slugs(index.mergeOrders(order(1, 2, 3), order(2, 1, 3), order(3, 1, 2))), ['003-i3', '002-i2', '001-i1']);
  // an item added at the end on each side: both stay, the local one last
  assert.deepEqual(slugs(index.mergeOrders(order(1), order(1, 2), order(1, 3))), ['001-i1', '002-i2', '003-i3']);
  // an item removed locally leaves; a status changed locally is kept; a renumbered local item keeps its place
  const merged = index.mergeOrders(order(1, 2, 3), order(1, 2, 3, 4), order(1, e(3, { status: 'done' }), 5), new Map([['005-i5', '006-i6']]));
  assert.deepEqual(slugs(merged), ['001-i1', '003-i3', '004-i4', '006-i6'], 'the removed item 2 left, the renumbered one is last as it was');
  assert.equal(merged.branches.main[1].status, 'done');
});

test('rows: the priority of a live item is its position in the index; a folder without an index reads its legacy priority field', t => {
  const dir = folder(t);
  put(dir, 1, { priority: 1 }); put(dir, 2, { priority: 0 }); put(dir, 3, { status: 'done' });
  assert.deepEqual(index.rows(dir).rows.map(r => [r.slug, r.priority]), [['001-i1', 1], ['002-i2', 0], ['003-i3', 2]]);
  assert.equal(existsSync(index.file(dir)), false, 'a read writes nothing');
  index.write(dir, { branches: { main: ['003-i3', '001-i1', '002-i2'].map(s => ({ seq: Number(s.slice(0, 3)), slug: s, name: 'x', status: 'pending' })) } });
  const r = index.rows(dir);
  assert.deepEqual(index.open(r.rows).map(x => [x.slug, x.priority]), [['001-i1', 0], ['002-i2', 1]], 'the item file is the truth for the status');
  assert.equal(r.rows.find(x => x.slug === '003-i3').priority, 2);
});
