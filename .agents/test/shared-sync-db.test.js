// Review P1 of PR #3: two real CLI writers in separate clones both change backlog.db (a binary file). The rebase of the second
// writer conflicts on it, and recovery used to refuse before the number collision was repaired. Local bare repos only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { cliAsync, gitIn, sleep } from './shared-concurrency.js';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';

// Two writers (a, b): separate temp dirs, each with its own clone of ONE backlog bare remote and its own consumer clone of acme/demo.
function writers(t) {
  const dirs = [mkdtempSync(join(tmpdir(), 'dbconf-a-')), mkdtempSync(join(tmpdir(), 'dbconf-b-'))];
  t.after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
  const home = sharedBacklog(dirs[0]);
  const bare = join(dirs[0], 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git');
  gitIn(dirs[1], 'clone', '-q', bare, join(dirs[1], 'home'));
  void home;
  return dirs.map(tmp => {
    const cons = consumer(tmp, 'acme', 'demo', 'main');
    mkdirSync(join(tmp, 'config', 'smooth-backlog-cli'), { recursive: true });
    writeFileSync(join(tmp, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
    return { tmp, cons, home: join(tmp, 'home'), folder: join(tmp, 'home', 'acme', 'demo') };
  }).concat({ bare });
}
const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'];

// Writer b stops right before its first push until `release()`: writer a pushes meanwhile, so b's push is rejected and b rebases.
function holdFirstPush(w) {
  const marker = join(w.tmp, 'pushed-once'); const go = join(w.tmp, 'go');
  const hook = join(w.home, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, `#!/bin/sh\n[ -f '${marker}' ] && exit 0\ntouch '${marker}'\nwhile [ ! -f '${go}' ]; do sleep 0.1; done\n`);
  chmodSync(hook, 0o755);
  return { held: async () => { for (let i = 0; i < 300 && !existsSync(marker); i++) await sleep(100); assert.ok(existsSync(marker), 'b reached its push'); }, release: () => writeFileSync(go, '') };
}

test('two CLI writers creating different items in separate clones: both succeed with distinct numbers and both can pull afterwards', async t => {
  const [a, b, { bare }] = writers(t);
  const hold = holdFirstPush(b);
  const second = cliAsync(NEW('beta job'), { cwd: b.cons, tmp: b.tmp });
  await hold.held(); // b has pulled, created 001-beta-job, written its backlog.db and committed
  const first = cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const verify = mkdtempSync(join(tmpdir(), 'dbconf-v-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  const dir = join(verify, 'c', 'acme', 'demo');
  assert.deepEqual(store.load(dir).map(i => [i.path, i.fm.name]), [['phases/001-alpha-job.md', 'alpha job'], ['phases/002-beta-job.md', 'beta job']]);
  const con = db.connect(dir);
  try { assert.deepEqual(con.prepare('SELECT slug, seq FROM phase ORDER BY seq').all().map(x => ({ ...x })), [{ slug: '001-alpha-job', seq: 1 }, { slug: '002-beta-job', seq: 2 }]); } finally { con.close(); }

  for (const w of [a, b]) { // both clones pull cleanly, are on origin/main and clean, and see both items
    const q = cli(['query', '--all'], { cwd: w.cons, tmp: w.tmp });
    assert.equal(q.status, 0, q.stdout + q.stderr);
    assert.match(q.stdout, /001-alpha-job/); assert.match(q.stdout, /002-beta-job/);
    assert.equal(gitIn(w.home, 'status', '--porcelain'), '');
    assert.equal(gitIn(w.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  }
});

test('review P1: a backlog.db conflict that takes upstream\'s copy keeps the local archive: row archived at its archive path, with its archived event', async t => {
  const [a, b, { bare }] = writers(t);
  // gamma stays in phases/: if the archive moved every file of the folder, git would carry a's new file along into archive/ (directory rename detection)
  for (const name of ['alpha job', 'gamma job']) assert.equal(cli(NEW(name), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0); // b has pulled both
  const hold = holdFirstPush(b);
  const second = cliAsync(['archive', '1', '--force'], { cwd: b.cons, tmp: b.tmp });
  await hold.held(); // b has moved the file to archive/, marked the row archived and committed
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // a pushes a backlog.db without that
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const verify = mkdtempSync(join(tmpdir(), 'dbconf-v-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  const dir = join(verify, 'c', 'acme', 'demo');
  assert.ok(existsSync(join(dir, 'archive', 'phases', '001-alpha-job.md')));
  const con = db.connect(dir);
  try {
    assert.deepEqual(con.prepare('SELECT slug, status, path FROM phase ORDER BY seq').all().map(x => ({ ...x })), [
      { slug: '001-alpha-job', status: 'archived', path: 'archive/phases/001-alpha-job.md' },
      { slug: '002-gamma-job', status: 'pending', path: 'phases/002-gamma-job.md' },
      { slug: '003-beta-job', status: 'pending', path: 'phases/003-beta-job.md' },
    ]);
    assert.equal(con.prepare("SELECT COUNT(*) AS n FROM event WHERE event='archived' AND note LIKE '001-alpha-job%'").get().n, 1);
    assert.equal(con.prepare("SELECT COUNT(*) AS n FROM event WHERE event='file_missing'").get().n, 0);
  } finally { con.close(); }
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
});

test('review P1: a backlog.db conflict that takes upstream\'s copy keeps the local events (a note), once, on its item', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['update', '1', '--note', 'UNIQUE_DELIVERY_EVIDENCE'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const verify = mkdtempSync(join(tmpdir(), 'dbconf-e-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  const con = db.connect(join(verify, 'c', 'acme', 'demo'));
  try {
    const rows = con.prepare("SELECT p.slug, e.event FROM event e JOIN phase p ON p.id = e.phase_id WHERE e.note LIKE '%UNIQUE_DELIVERY_EVIDENCE%'").all().map(x => ({ ...x }));
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.equal(rows[0].slug, '001-alpha-job');
  } finally { con.close(); }
});

test('review P2: a pull whose non-conflict rebase renumbers an unpushed local item renames its mirror row in place (no ghost, no second row)', t => {
  const [a, b] = writers(t);
  const hook = join(b.home, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n'); chmodSync(hook, 0o755);
  assert.notEqual(cli(NEW('beta job'), { cwd: b.cons, tmp: b.tmp }).status, 0); // committed locally with its db, push refused
  rmSync(hook);
  // the other clone pushes the same number as a file only, so backlog.db does not conflict
  store.write({ path: join(a.folder, 'phases', '001-alpha-job.md'), fm: { phase: '001-alpha-job', seq: 1, name: 'alpha job', status: 'pending', repository: 'acme/demo', branch: 'main', priority: 0, created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z' }, body: '\n# Phase 001\n' }, a.folder);
  gitIn(a.home, 'add', 'acme/demo/phases/001-alpha-job.md'); gitIn(a.home, 'commit', '-q', '-m', 'alpha'); gitIn(a.home, 'push', '-q');
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0); // the pull renumbers 001-beta-job to 002
  const r = cli(['update', '2', '--note', 'after the renumbering'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const con = db.connect(b.folder);
  try {
    assert.deepEqual(con.prepare('SELECT slug, seq FROM phase ORDER BY seq').all().map(x => ({ ...x })), [{ slug: '001-alpha-job', seq: 1 }, { slug: '002-beta-job', seq: 2 }]);
    assert.equal(con.prepare("SELECT COUNT(*) AS n FROM event WHERE event='file_missing'").get().n, 0);
  } finally { con.close(); }
});

test('review P1: a backlog.db conflict does not resurrect the source row of an item moved out to another repository', async t => {
  const [a, b, { bare }] = writers(t);
  for (const name of ['alpha job', 'gamma job']) assert.equal(cli(NEW(name), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp });
  await hold.held(); // b has moved the item out and committed both folders
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // a pushes a backlog.db that still has the row
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const verify = mkdtempSync(join(tmpdir(), 'dbconf-m-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  const dir = join(verify, 'c', 'acme', 'demo');
  const con = db.connect(dir);
  try {
    const rows = con.prepare('SELECT slug, path FROM phase ORDER BY seq').all().map(x => ({ ...x }));
    assert.ok(!rows.some(x => x.slug === '001-alpha-job'), JSON.stringify(rows));
    for (const x of rows) assert.ok(existsSync(join(dir, x.path)), `${x.slug} has its file`);
    assert.equal(con.prepare("SELECT COUNT(*) AS n FROM event WHERE event='file_missing'").get().n, 0);
    assert.equal(con.prepare("SELECT COUNT(*) AS n FROM event WHERE event='moved_out'").get().n, 1);
  } finally { con.close(); }
});

test('review P1: a cross-repository move racing another clone is ONE commit of the source and target folders: never the target pushed without the source', async t => {
  const [a, b, { bare }] = writers(t);
  for (const name of ['alpha job', 'gamma job']) assert.equal(cli(NEW(name), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp });
  await hold.held(); // b holds its (only) push: source and target changed, committed together
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // a changes the same source backlog.db
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const verify = mkdtempSync(join(tmpdir(), 'dbconf-1-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  const log = n => gitIn(join(verify, 'c'), 'log', '--format=%H', '--', n).split('\n').filter(Boolean);
  const touched = sha => gitIn(join(verify, 'c'), 'show', '--format=', '--name-only', sha).split('\n');
  const [commit] = log('new/place');
  assert.ok(commit && log('new/place').length === 1, 'the target arrived in one commit');
  assert.ok(touched(commit).some(f => f.startsWith('acme/demo/')), 'the same commit changes the source folder');
  const dir = join(verify, 'c', 'acme', 'demo');
  const con = db.connect(dir);
  try {
    const rows = con.prepare('SELECT slug, path FROM phase').all().map(x => ({ ...x }));
    assert.ok(!rows.some(x => x.slug === '001-alpha-job'), JSON.stringify(rows));
    for (const x of rows) assert.ok(existsSync(join(dir, x.path)));
  } finally { con.close(); }
  assert.ok(existsSync(join(verify, 'c', 'new', 'place', 'phases')));
});
