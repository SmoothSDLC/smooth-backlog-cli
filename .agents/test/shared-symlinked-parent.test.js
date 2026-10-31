// Regression (backlog item 019): symlinks ABOVE the trusted root are not attacker-controlled and are allowed
// (macOS os.tmpdir() is under /var -> /private/var; a home or clone reached through a link). The whole
// fixture below lives under a symlinked parent, so every path the CLI sees passes through one.
// Refusals for symlinks INSIDE the root stay in the per-module tests (shared-store, -db, -mode, -query).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';
import { assertInside, validateHome } from '../../src/shared/safety.js';

Object.assign(process.env, GIT_IDENTITY);

// <real>/data is reached as <real>/../<name> through a symlink: tmp = <link>/data.
function linked(t) {
  const real = realpathSync(mkdtempSync(join(tmpdir(), 'linked-real-')));
  const link = `${real}-link`;
  mkdirSync(join(real, 'data'));
  symlinkSync(real, link);
  t.after(() => { rmSync(link, { force: true }); rmSync(real, { recursive: true, force: true }); });
  const tmp = join(link, 'data');
  const home = sharedBacklog(tmp);
  const cons = consumer(tmp, 'acme', 'demo', 'main');
  return { tmp, home, cons, folder: join(home, 'acme', 'demo') };
}
const run = (f, args) => cli(args, { cwd: f.cons, tmp: f.tmp });
const ok = (f, args) => { const r = run(f, args); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };

test('store and db: load, write and connect work when the folder is reached through a symlinked parent', t => {
  const f = linked(t);
  const path = join(f.folder, 'phases', '001-a.md');
  store.write({ path, fm: { phase: '001-a', seq: 1, name: 'a', status: 'pending' }, body: 'x\n' });
  assert.equal(store.load(f.folder).length, 1);
  const con = db.connect(f.folder);
  try { db.scan(con, f.folder); } finally { con.close(); }
});

test('safety: validateHome and assertInside accept a path whose ancestors contain a symlink', async t => {
  const f = linked(t);
  assert.equal(await validateHome(f.home), realpathSync(f.home)); // the resolved path
  assert.equal(await assertInside(f.home, join(f.folder, 'backlog.db')), join('acme', 'demo', 'backlog.db'));
});

test('mode switch, new, update, query, archive and move (each commits through sync.js) run under a symlinked parent', t => {
  const f = linked(t);
  ok(f, ['--use-backlog-repo', f.home]);
  assert.equal(readFileSync(join(f.tmp, 'config', 'smoothsdlc-backlog', 'home'), 'utf8'), `${realpathSync(f.home)}\n`);
  for (const name of ['Alpha', 'Beta']) ok(f, ['new', '--name', name, '--objective', `do ${name}`, '--summary', 's', '--depends-on', 'none']);
  ok(f, ['update', '1', '--status', 'in_progress']);
  assert.match(ok(f, ['query', '--status']).stdout, /001-alpha/);
  ok(f, ['archive', '1', '--force']);
  assert.equal(spawnSync('git', ['push', '-q', 'origin', 'HEAD:refs/heads/release'], { cwd: f.cons }).status, 0);
  ok(f, ['move', '2', '--to-branch', 'release']);
  assert.ok(readdirSync(join(f.folder, 'archive')).length > 0);
});

test('inside the root a symlink is still refused even when the root is reached through a symlink', t => {
  const f = linked(t);
  mkdirSync(f.folder, { recursive: true });
  symlinkSync(join(f.tmp, 'config'), join(f.folder, 'phases'));
  assert.throws(() => store.load(f.folder), /Symlink destination is unsupported/);
});
