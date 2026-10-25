// Review P1 of PR #3: two real CLI writers in separate clones both change backlog.db (a binary file). The rebase of the second
// writer conflicts on it, and recovery used to refuse before the number collision was repaired. Local bare repos only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

for (const [title, args] of [['query', ['query', '--all']], ['new', NEW('beta job')]]) {
  test(`review P1: ${title} after a pull whose autostash does not apply (exit 0, conflict markers) is refused: nothing ingests or pushes the markers`, t => {
    const [a, b, { bare }] = writers(t);
    assert.equal(cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp }).status, 0);
    assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
    const file = join(b.folder, 'phases', '001-alpha-job.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^summary: .*$/m, 'summary: "LOCAL EDIT"')); // an uncommitted edit of b
    assert.equal(cli(['update', '1', '--summary', 'REMOTE EDIT'], { cwd: a.cons, tmp: a.tmp }).status, 0); // upstream changes the same line
    const head = gitIn(bare, 'rev-parse', 'main');
    const r = cli(args, { cwd: b.cons, tmp: b.tmp });
    assert.equal(r.status, 3, `${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /unresolved conflicts/);
    assert.equal(gitIn(bare, 'rev-parse', 'main'), head, 'nothing was pushed');
    assert.ok(!existsSync(join(b.folder, 'phases', '002-beta-job.md')), 'nothing was created');
  });
}

test('review P1: a number collision in the destination of a cross-repository move renames nothing in the source (no phantom 002-alpha)', async t => {
  const [a, b, { bare }] = writers(t);
  // gamma stays in phases/: if the move emptied the folder, git would carry a's new file along into the target (directory rename detection)
  for (const name of ['alpha job', 'gamma job']) assert.equal(cli(NEW(name), { cwd: a.cons, tmp: a.tmp }).status, 0); // acme/demo 001-alpha-job, 002-gamma-job
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp }); // becomes new/place 001-alpha-job
  await hold.held();
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // the source backlog.db changes too
  const delta = cli([...NEW('delta job'), '--body', '## Definition of done\n- [ ] x'], { cwd: a.cons, tmp: a.tmp, env: { TEAM_REPOSITORY: 'new/place' } }); // new/place 001-delta-job
  assert.equal(delta.status, 0, delta.stdout + delta.stderr);
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const verify = mkdtempSync(join(tmpdir(), 'dbconf-p-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  for (const repo of [['acme', 'demo'], ['new', 'place']]) {
    const dir = join(verify, 'c', ...repo);
    const con = db.connect(dir);
    try {
      const rows = con.prepare('SELECT slug, path FROM phase').all().map(x => ({ ...x }));
      for (const x of rows) assert.ok(existsSync(join(dir, x.path)), `${repo.join('/')}: row ${x.slug} has its file (${JSON.stringify(rows)})`);
      assert.equal(con.prepare("SELECT COUNT(*) AS n FROM event WHERE event='file_missing'").get().n, 0);
    } finally { con.close(); }
  }
  const src = db.connect(join(verify, 'c', 'acme', 'demo'));
  try { assert.ok(!src.prepare('SELECT slug FROM phase').all().some(x => /alpha/.test(x.slug)), 'the moved item has no row in the source'); } finally { src.close(); }
});

test('audit: a move that empties phases/ does not carry another clone\'s new file into the target (directory renames are off)', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // the only item of acme/demo
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // a new file in the folder b just emptied
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);
  const verify = mkdtempSync(join(tmpdir(), 'dbconf-q-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  const files = repo => existsSync(join(verify, 'c', ...repo, 'phases')) ? readdirSync(join(verify, 'c', ...repo, 'phases')) : [];
  assert.deepEqual(files(['acme', 'demo']).filter(f => /beta/.test(f)).length, 1, 'beta stays in acme/demo');
  assert.deepEqual(files(['new', 'place']).filter(f => /beta/.test(f)), [], 'beta is not carried into new/place');
});

// Writer b stops before its first push; writer a runs `aArgs` and pushes first; then b's command (bArgs) rebases onto it.
async function race(t, seedArgs, aArgs, bArgs, { aEnv, bEnv } = {}) {
  const [a, b, { bare }] = writers(t);
  for (const args of seedArgs) assert.equal(cli(args, { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(bArgs, { cwd: b.cons, tmp: b.tmp, env: bEnv });
  await hold.held();
  await sleep(1100); // the two copies of a moved item differ in their `updated` second
  const first = cli(aArgs, { cwd: a.cons, tmp: a.tmp, env: aEnv });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  hold.release();
  return { a, b, bare, result: await second.done };
}
const clone = (t, bare) => {
  const verify = mkdtempSync(join(tmpdir(), 'dbconf-r-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  return join(verify, 'c');
};

test('audit t2: two concurrent reprioritisations (modify/modify on priority and updated) merge: no abort, no stuck local commit, dense ranks', async t => {
  const seed = ['alpha job', 'beta job', 'gamma job'].map(NEW);
  const { a, b, bare, result } = await race(t, seed, ['update', '2', '--priority', '0'], ['update', '3', '--priority', '0']);
  assert.equal(result.status, 0, `exit ${result.status}\n${result.stdout}${result.stderr}`);
  const dir = join(clone(t, bare), 'acme', 'demo');
  const items = store.load(dir);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(i => i.fm.priority).sort(), [0, 1, 2], 'ranks are dense and distinct');
  for (const w of [a, b]) {
    assert.equal(gitIn(w.home, 'status', '--porcelain'), '');
    assert.equal(cli(['query', '--all'], { cwd: w.cons, tmp: w.tmp }).status, 0); // later pulls work
    assert.equal(gitIn(w.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'), 'nothing is left unpushed');
  }
});

test('audit t5 (passes at b14557c too: git merges the identical renames; kept as a regression test): two clones moving the same item to the same repository leave ONE copy there', async t => {
  const seed = ['alpha job', 'gamma job'].map(NEW);
  const mv = ['move', '1', '--to-repository', 'new/place'];
  const { bare, result } = await race(t, seed, mv, mv);
  assert.equal(result.status, 0, `exit ${result.status}\n${result.stdout}${result.stderr}`);
  const root = clone(t, bare);
  assert.deepEqual(store.load(join(root, 'new', 'place')).map(i => i.fm.name), ['alpha job']);
  assert.deepEqual(store.load(join(root, 'acme', 'demo')).map(i => i.fm.name), ['gamma job']);
});

test('audit t2: a conflict nobody can merge parks the local commit on backlog-unmerged-<utc> and resets the clone, which keeps working', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha job')], ['update', '1', '--summary', 'from a'], ['update', '1', '--summary', 'from b']);
  assert.equal(result.status, 3, `${result.stdout}${result.stderr}`);
  const branch = /parked on branch (backlog-unmerged-\d{8}T\d{6}Z)/.exec(result.stderr)?.[1];
  assert.ok(branch, result.stderr);
  assert.match(gitIn(b.home, 'show', `${branch}:acme/demo/phases/001-alpha-job.md`), /from b/, 'nothing is lost');
  assert.equal(gitIn(b.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
  const again = cli(['update', '1', '--summary', 'from b again'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(again.status, 0, again.stdout + again.stderr); // every later pull works
});

test('review P1: origin/main never holds a commit whose backlog.db mirror disagrees with its item files, also while a mirror conflict is recovered', async t => {
  const [a, b, { bare }] = writers(t);
  const hold = holdFirstPush(b);
  const second = cliAsync(NEW('beta job'), { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  assert.equal(cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const tmp = mkdtempSync(join(tmpdir(), 'dbconf-h-')); t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const commits = gitIn(bare, 'rev-list', 'main').split('\n');
  let checked = 0;
  for (const c of commits) {
    const files = gitIn(bare, 'ls-tree', '-r', '--name-only', c).split('\n');
    if (!files.includes('acme/demo/backlog.db')) continue;
    const dbFile = join(tmp, `${c}.db`);
    writeFileSync(dbFile, execFileSync('git', ['show', `${c}:acme/demo/backlog.db`], { cwd: bare, maxBuffer: 1 << 26 }));
    const con = new (await import('node:sqlite')).DatabaseSync(dbFile, { readOnly: true });
    try {
      const rows = con.prepare("SELECT slug FROM phase WHERE status != 'archived' ORDER BY slug").all().map(x => x.slug);
      const names = files.filter(f => /^acme\/demo\/phases\/.+\.md$/.test(f)).map(f => f.replace(/^.*\/|\.md$/g, '')).sort();
      assert.deepEqual(rows, names, `commit ${c.slice(0, 7)} on origin/main: mirror rows differ from item files`);
      checked++;
    } finally { con.close(); }
  }
  assert.ok(checked >= 2);
});

test('review (merge risk): after a failed push the next command\'s leading pull repairs the backlog.db conflict: the local note is kept, nothing is parked, and it reaches origin', async t => {
  const [a, b, { bare }] = writers(t);
  for (const n of ['one', 'two']) assert.equal(cli(NEW(n), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hook = join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "rejected: origin down" >&2\nexit 1\n'); chmodSync(hook, 0o755);
  assert.equal(cli(['update', '1', '--append', 'first note'], { cwd: a.cons, tmp: a.tmp }).status, 3); // committed locally, not pushed
  rmSync(hook);
  assert.equal(cli(NEW('three'), { cwd: b.cons, tmp: b.tmp }).status, 0); // another clone pushes meanwhile
  const q = cli(['query', '--all'], { cwd: a.cons, tmp: a.tmp }); // the leading pull rebases a's unpushed commit onto it
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.doesNotMatch(gitIn(a.home, 'branch', '--list'), /backlog-unmerged/);
  const w = cli(['update', '2', '--append', 'second note'], { cwd: a.cons, tmp: a.tmp });
  assert.equal(w.status, 0, w.stdout + w.stderr);
  const dir = join(clone(t, bare), 'acme', 'demo');
  assert.match(readFileSync(join(dir, 'phases', '001-one.md'), 'utf8'), /first note/);
  assert.match(readFileSync(join(dir, 'phases', '002-two.md'), 'utf8'), /second note/);
  assert.equal(gitIn(a.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
});
