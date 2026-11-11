// The user commands do not see items that belong to a team: a read lists none, a reference to one reads as a missing item, the user queue
// ranks only user items, and a reorder leaves the team entries where they are.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { userCase, slugOf } from './user-cases.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const rows = r => JSON.parse(r.stdout).phases;

test('COD-06: show of a team item answers no phase', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }]);
  const r = c.run(['show', '90']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /no phase '90'/);
});

test('COD-07: show of an item without a team answers it', () => {
  const c = userCase(dirs, [{ seq: 91 }]);
  const r = c.run(['show', '91']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /item 91/);
});

test('R16-02: new --depends-on a team item is refused as a missing item', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }]);
  const r = c.run(['new', '--name', 't', '--objective', 'o', '--summary', 's', '--depends-on', '90']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /--depends-on: no item '90' in this backlog/);
});

test('list and list --json show no team item', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }]);
  const j = c.run(['list', '--json']);
  assert.equal(j.status, 0, j.stdout + j.stderr);
  assert.deepEqual(rows(j).map(r => r.seq), [1, 3]);
  assert.doesNotMatch(c.run(['list']).stdout, /item 2/);
  assert.doesNotMatch(c.run(['list', 'all-branches']).stdout, /item 2/);
});

test('the priority of a user item ignores team entries of its branch', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }]);
  assert.deepEqual(rows(c.run(['list', '--json'])).map(r => [r.seq, r.priority]), [[1, 0], [3, 1]]);
});

test('a dependency on a team item reads as missing in next and list', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }, { seq: 7, team: 'parallel', repo: 'lib' }, { seq: 5, fields: { depends_on: ['90', 'acme/lib#7'] } }]);
  const list = c.run(['list']);
  assert.equal(list.status, 0, list.stdout + list.stderr);
  assert.match(list.stdout, /depends on acme\/lib#7 \(no such item in the backlog repository\)/);
  assert.doesNotMatch(list.stdout, /item 90|parallel/);
  const next = c.run(['next']);
  assert.equal(next.status, 0, next.stdout + next.stderr);
  assert.match(next.stdout, /NEXT: P0 .*005-item-5/);
  assert.doesNotMatch(next.stdout, /item 90|parallel/);
});

test('a foreign dependency on a team item reads as missing', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 7, team: 'parallel', repo: 'lib' }, { seq: 8, repo: 'lib' }]);
  const NEW = d => ['new', '--name', 't', '--objective', 'o', '--summary', 's', '--depends-on', d];
  const no = c.run(NEW('acme/lib#7'));
  assert.equal(no.status, 1, no.stdout + no.stderr);
  assert.match(no.stdout + no.stderr, /--depends-on: no item 'acme\/lib#7' in the backlog repository/);
  const yes = c.run(NEW('acme/lib#8'));
  assert.equal(yes.status, 0, yes.stdout + yes.stderr);
});

test('update --replan leaves team entries in place', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }, { seq: 4 }]);
  const index = () => JSON.parse(readFileSync(join(c.folder, 'index.json'), 'utf8')).branches.main.map(e => e.slug);
  c.run(['list']); // writes the index when the folder had none
  assert.deepEqual(index(), [slugOf(1), slugOf(2), slugOf(3), slugOf(4)]);
  const r = c.run(['update', '--replan', '4,3']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(index(), [slugOf(4), slugOf(2), slugOf(3), slugOf(1)]);
});

test('the ranks a command prints count the entries it sees only', () => {
  const c = userCase(dirs, [{ seq: 1, team: 'parallel' }, { seq: 2 }, { seq: 3 }]);
  c.run(['list']);
  const r = c.run(['update', '--replan', '3']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /P0 {2}003-item-3\n {3}P1 {2}002-item-2\n?$/);
  assert.doesNotMatch(r.stdout, /001-item-1|P2/);
  const moved = c.run(['update', '3', '--priority', '0']);
  assert.equal(moved.status, 0, moved.stdout + moved.stderr);
  assert.match(moved.stdout, /priority=P0/);
});

test('update --seq on an item an unseen item depends on is refused without naming that item', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel', fields: { depends_on: ['1'] } }]);
  const r = c.run(['update', '1', '--seq', '50']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /an item this command does not see depends on 001-item-1/);
  assert.doesNotMatch(r.stdout + r.stderr, /002-item-2|parallel/);
});
