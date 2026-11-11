// B06d3 re-review: the hand-off exemption follows the path, `new --status archived` is refused, a team-less item reads as stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENVELOPE, GIT_IDENTITY, archivedPath, cli, consumer, itemPath, sharedBacklog, writeItem } from './shared-fixtures.js';
import { undoneDependencies } from '../../src/shared/dependencies.js';
import * as index from '../../src/shared/index.js';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'b06d3-rr-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [k, v] of Object.entries(GIT_IDENTITY)) { const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; }); }
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { dir, cons, folder: join(home, 'acme', 'demo') };
}
const OWES = () => 'owes a hand-off';
const owed = (folder, producerFm, archived) => {
  const dependent = { seq: 9, depends_on: [1] };
  writeItem(archived ? archivedPath(folder, '001-producer', 'phases') : itemPath(folder, '001-producer'), { seq: 1, ...producerFm }, 'x\n');
  return undoneDependencies(folder, dependent, index.rows(folder).rows, OWES).length;
};

test('hand-off exemption: decided by the path, not by the word archived', t => {
  const f = fixture(t);
  // under archive/, stored as done (the file keeps its word): exempt, nothing owed
  assert.equal(owed(f.folder, { status: 'done' }, true), 0);
  // under archive/, stored as an open word: still archived, nothing owed
  assert.equal(owed(f.folder, { status: 'in progress' }, true), 0);
  // live item that stores the word 'archived': not archived by path, the hand-off is owed
  const g = fixture(t);
  assert.equal(owed(g.folder, { status: 'archived' }), 1);
});

test('hand-off exemption: a foreign item decided by its path too', t => {
  const f = fixture(t);
  const other = join(f.folder, '..', '..', 'acme', 'lib');
  writeItem(archivedPath(other, '001-lib', 'phases'), { seq: 1, status: 'done' }, 'x\n');
  writeItem(itemPath(other, '002-live'), { seq: 2, status: 'archived' }, 'x\n');
  const dep = id => undoneDependencies(f.folder, { seq: 9, repository: 'acme/demo', depends_on: [id] }, index.rows(f.folder).rows, OWES).length;
  assert.equal(dep('acme/lib#1'), 0);
  assert.equal(dep('acme/lib#2'), 1);
});

test('new --status archived is refused as update --status archived is, and creates nothing', t => {
  const f = fixture(t);
  const r = cli(['new', '--name', 'A job', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--status', 'archived'], { cwd: f.cons, tmp: f.dir });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "❌ --status 'archived': backlog archive moves a finished item to archive/\n");
  assert.deepEqual(existsSync(join(f.folder, 'phases')) ? readdirSync(join(f.folder, 'phases')).filter(n => n.endsWith('.md')) : [], []);
});

test('an item without a team reads its status as stored in the list and the index view', t => {
  const f = fixture(t);
  writeItem(itemPath(f.folder, '001-stored'), { ...ENVELOPE, repository: 'acme/demo', branch: 'main', seq: 1, status: 'done' }, 'x\n');
  const out = cli(['list', 'done', '--json'], { cwd: f.cons, tmp: f.dir });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout).phases.map(p => [p.seq, p.status]), [[1, 'done']]);
  const one = cli(['show', '001-stored', '--json'], { cwd: f.cons, tmp: f.dir });
  assert.match(one.stdout, /"status": "done"/, one.stdout);
});
