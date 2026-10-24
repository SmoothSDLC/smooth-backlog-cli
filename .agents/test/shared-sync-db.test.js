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
