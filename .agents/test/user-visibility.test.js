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

test('list and list --json show no team item and no team key', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }]);
  const j = c.run(['list', '--json']);
  assert.equal(j.status, 0, j.stdout + j.stderr);
  assert.deepEqual(rows(j).map(r => r.seq), [1, 3]);
  assert.ok(rows(j).every(r => !('team' in r)));
  assert.doesNotMatch(c.run(['list']).stdout, /item 2/);
});

test('the priority of a user item ignores team entries of its branch', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }]);
  assert.deepEqual(rows(c.run(['list', '--json'])).map(r => [r.seq, r.priority]), [[1, 0], [3, 1]]);
});

test('a dependency on a team item reads as missing in next and list', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }, { seq: 5, fields: { depends_on: ['90'] } }]);
  for (const args of [['next'], ['list']]) {
    const r = c.run(args);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /parallel|item 90/);
  }
  const shown = c.run(['show', '5']);
  assert.match(shown.stdout, /90/);
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

test('update --replan leaves team entries in place and writes no history on a team item', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }, { seq: 4 }]);
  const index = () => JSON.parse(readFileSync(join(c.folder, 'index.json'), 'utf8')).branches.main.map(e => e.slug);
  c.run(['list']); // writes the index when the folder had none
  const before = index();
  const teamFile = join(c.folder, 'phases', `${slugOf(2)}.json`);
  const teamBefore = readFileSync(teamFile, 'utf8');
  const r = c.run(['update', '--replan', '4,3']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const after = index();
  assert.equal(after[before.indexOf(slugOf(2))], slugOf(2));
  assert.deepEqual(after.filter(s => s !== slugOf(2)), [slugOf(4), slugOf(3), slugOf(1)]);
  assert.equal(readFileSync(teamFile, 'utf8'), teamBefore);
});
