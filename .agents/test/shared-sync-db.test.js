// Review P1 of PR #3: two real CLI writers in separate clones both change backlog.db (a binary file). The rebase of the second
// writer conflicts on it, and recovery used to refuse before the number collision was repaired. Local bare repos only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { cliAsync, gitIn, sleep } from './shared-concurrency.js';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';

// Item 76 (ENOTEMPTY cleanup at 1566552 / 6c031b1): the writer is the child git process of a scenario CLI
// child — the git-push / git-receive-pack chain, and, where a push gate is used, the gate's sh hook and its
// sleep — that outlive the CLI's node child (the fixture's spawnSync timeout kill mid-push, an unsettled
// chain) and still write into the temp folder when the test's cleanup removes it. Every process of the chain
// inherits the CLI child's BACKLOG_HOME env; settleScenarioChildren kills the ones still alive (SIGTERM, then
// SIGKILL) so the removal cannot race with them, and fails loudly if the chain is still alive after the settle.
// Where /proc is absent (macOS, CI), scenarioPids finds nothing and the settle is a no-op, not an error.
function scenarioPids(d, procRoot = '/proc') {
  const mark = `BACKLOG_HOME=${join(d, 'home')}`;
  const out = [];
  let entries;
  try { entries = readdirSync(procRoot); } catch { return out; } // no /proc (macOS, CI): nothing to settle; the cleanup still removes the folders
  for (const pid of entries) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
    let env = '';
    try { env = readFileSync(join(procRoot, pid, 'environ'), 'utf8'); } catch { continue; }
    if (env.includes(mark)) out.push(Number(pid));
  }
  return out;
}
async function settleScenarioChildren(d, rounds = 25) {
  for (let round = 0; round < rounds; round++) {
    const pids = scenarioPids(d);
    if (!pids.length) return;
    for (const p of pids) { try { process.kill(p, round ? 'SIGKILL' : 'SIGTERM'); } catch { /* exited in the meantime */ } }
    await sleep(100);
  }
  const pids = scenarioPids(d); // item 76 review: verify the writers stopped; fail loudly instead of removing the folders silently
  if (pids.length) throw new Error(`the scenario's child processes are still alive after the settle (${rounds} rounds of SIGTERM, then SIGKILL): pids ${pids.join(', ')}`);
}

// Two writers (a, b): separate temp dirs, each with its own clone of ONE backlog bare remote and its own consumer clone of acme/demo.
function writers(t) {
  const dirs = [mkdtempSync(join(tmpdir(), 'dbconf-a-')), mkdtempSync(join(tmpdir(), 'dbconf-b-'))];
  t.after(async () => {
    for (const d of dirs) await settleScenarioChildren(d); // item 76: the child git process of a killed or unsettled CLI child still writes the folder — the ENOTEMPTY writer of the cleanup
    dirs.forEach(d => rmSync(d, { recursive: true, force: true }));
  });
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
  writeFileSync(hook, `#!/bin/sh\n[ -f '${marker}' ] && exit 0\ntouch '${marker}'\nwhile [ ! -f '${go}' ] && [ -d '${w.tmp}' ]; do sleep 0.1; done\n`); // a test that failed before release() removed w.tmp: stop waiting, or the file never ends
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

test('review P2: retrying a rolled-back creation takes the upstream number into account without ghost mirror rows', t => {
  const [a, b] = writers(t);
  const hook = join(b.home, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n'); chmodSync(hook, 0o755);
  assert.notEqual(cli(NEW('beta job'), { cwd: b.cons, tmp: b.tmp }).status, 0); // committed locally with its db, push refused
  rmSync(hook);
  // the other clone pushes the same number as a file only, so backlog.db does not conflict
  store.write({ path: join(a.folder, 'phases', '001-alpha-job.md'), fm: { phase: '001-alpha-job', seq: 1, name: 'alpha job', status: 'pending', repository: 'acme/demo', branch: 'main', priority: 0, created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z' }, body: '\n# Phase 001\n' }, a.folder);
  gitIn(a.home, 'add', 'acme/demo/phases/001-alpha-job.md'); gitIn(a.home, 'commit', '-q', '-m', 'alpha'); gitIn(a.home, 'push', '-q');
  assert.equal(cli(NEW('beta job'), { cwd: b.cons, tmp: b.tmp }).status, 0); // a fresh command allocates 002 after pulling alpha
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
  const beta = cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }); // a pushes a backlog.db that still has the row
  hold.release(); // first: a failed assertion must not leave b's push waiting
  assert.equal(beta.status, 0, beta.stdout + beta.stderr);
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

test('review P2: a destination-renumbered move caches the moved item and refuses a subsequent stale summary overwrite', async t => {
  const [a, b, { bare }] = writers(t);
  const mover = process.env.QWEN_CODE_AGENT_ID || process.env.USER || 'unknown'; // cliAsync uses the inherited actor
  for (const name of ['alpha', 'gamma']) assert.equal(cli([...NEW(name), '--review-refs', 'references/review/code.md',
    '--estimate', '5', '--body', '## Definition of done\n- [ ] x'], { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const move = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  let collision;
  try {
    collision = cli([...NEW('delta'), '--body', '## Definition of done\n- [ ] x'], {
      cwd: a.cons, tmp: a.tmp, env: { TEAM_REPOSITORY: 'new/place' },
    });
  } finally { hold.release(); }
  const moved = await move.done;
  assert.equal(collision.status, 0, collision.stdout + collision.stderr);
  assert.equal(moved.status, 0, moved.stdout + moved.stderr);
  assert.match(moved.stdout, /renumbered 001 -> 002/);
  const path = 'new/place/phases/002-alpha.md';
  assert.match(gitIn(bare, 'show', `main:${path}`), /phase: "002-alpha"/);
  assert.equal(gitIn(b.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));

  const changed = cli(['update', '002-alpha', '--summary', 'remote summary', '--by', 'other-writer'], {
    cwd: a.cons, tmp: a.tmp, env: { TEAM_REPOSITORY: 'new/place' },
  });
  assert.equal(changed.status, 0, changed.stdout + changed.stderr);
  const head = gitIn(bare, 'rev-parse', 'main');
  // Do not query the destination first: the move itself must have recorded what the mover wrote.
  const stale = cli(['update', '002-alpha', '--summary', 'stale summary', '--by', mover], {
    cwd: b.cons, tmp: b.tmp, env: { TEAM_REPOSITORY: 'new/place' },
  });
  assert.equal(stale.status, 5, stale.stdout + stale.stderr);
  assert.match(stale.stderr, /item 002-alpha was changed by other-writer .* after you last read it/);
  assert.equal(gitIn(bare, 'rev-parse', 'main'), head, 'the stale write published nothing');
  assert.match(gitIn(bare, 'show', `main:${path}`), /summary: "remote summary"/);
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
  assert.equal(gitIn(b.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
});

test('review P2: update records its published identity when an added item is renumbered during recovery', async t => {
  const [a, b, { bare }] = writers(t);
  const agent = process.env.QWEN_CODE_AGENT_ID || process.env.USER || 'unknown';
  assert.equal(cli(NEW('anchor'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const [anchor] = store.load(b.folder);
  store.write({ path: join(b.folder, 'phases/002-local.md'), fm: {
    ...anchor.fm, phase: '002-local', seq: 2, name: 'local', priority: 1,
    review_refs: ['references/review/code.md'], estimate_min: 5,
  }, body: '\n## Definition of done\n- [ ] x\n' }, b.folder);
  const con = db.connect(b.folder); try { db.scan(con, b.folder); } finally { con.close(); }
  const hold = holdFirstPush(b);
  const update = cliAsync(['update', '002-local', '--summary', 'local summary'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  let collision;
  try { collision = cli(NEW('delta'), { cwd: a.cons, tmp: a.tmp }); } finally { hold.release(); }
  const published = await update.done;
  assert.equal(collision.status, 0, collision.stdout + collision.stderr);
  assert.equal(published.status, 0, published.stdout + published.stderr);
  assert.match(published.stdout, /renumbered 002 -> 003/);
  const changed = cli(['update', '003-local', '--summary', 'remote summary', '--by', 'other-writer'], { cwd: a.cons, tmp: a.tmp });
  assert.equal(changed.status, 0, changed.stdout + changed.stderr);
  const head = gitIn(bare, 'rev-parse', 'main');
  const stale = cli(['update', '003-local', '--summary', 'stale summary', '--by', agent], { cwd: b.cons, tmp: b.tmp });
  assert.equal(stale.status, 5, stale.stdout + stale.stderr);
  assert.equal(gitIn(bare, 'rev-parse', 'main'), head);
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
  assert.equal(gitIn(b.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
});

// Writer b stops before its first push; writer a runs `aArgs` and pushes first; then b's command (bArgs) rebases onto it.
async function race(t, seedArgs, aArgs, bArgs, { aEnv, bEnv, afterSeed } = {}) {
  const [a, b, { bare }] = writers(t);
  for (const args of seedArgs) assert.equal(cli(args, { cwd: a.cons, tmp: a.tmp }).status, 0);
  afterSeed?.(a);
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

test('review P2: failed create, note and archive each roll back; successful retries retain events exactly once', t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('anchor job'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hook = join(bare, 'hooks', 'pre-receive');
  for (const args of [NEW('local job'), ['update', '2', '--note', 'LOCAL_ARCHIVE_EVIDENCE'], ['archive', '2', '--force']]) {
    const before = state(b.home);
    writeFileSync(hook, '#!/bin/sh\nexit 1\n'); chmodSync(hook, 0o755);
    const failed = cli(args, { cwd: b.cons, tmp: b.tmp });
    assert.equal(failed.status, 3, failed.stdout + failed.stderr);
    assert.deepEqual(state(b.home), before);
    rmSync(hook);
    const retried = cli(args, { cwd: b.cons, tmp: b.tmp });
    assert.equal(retried.status, 0, retried.stdout + retried.stderr);
  }
  const con = db.connect(join(clone(t, bare), 'acme', 'demo'));
  try {
    const row = con.prepare("SELECT * FROM phase WHERE name='local job'").get();
    assert.equal(row.slug, '002-local-job'); assert.equal(row.status, 'archived');
    assert.equal(row.path, 'archive/phases/002-local-job.md');
    assert.equal(con.prepare("SELECT count(*) AS n FROM event WHERE phase_id=? AND event='archived'").get(row.id).n, 1);
    assert.equal(con.prepare("SELECT count(*) AS n FROM event WHERE phase_id=? AND note LIKE '%LOCAL_ARCHIVE_EVIDENCE%'").get(row.id).n, 1);
    assert.equal(con.prepare("SELECT count(*) AS n FROM event WHERE event='file_missing'").get().n, 0);
  } finally { con.close(); }
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
});

test('audit t2: the same item changed by two clones: the second is refused (exit 5), its change is not parked or pushed, and the clone keeps working', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha job')], ['update', '1', '--summary', 'from a'], ['update', '1', '--summary', 'from b']);
  assert.equal(result.status, 5, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /item 001-alpha-job was changed by .* after you last read it/);
  assert.equal(gitIn(b.home, 'branch', '--list').split('\n').filter(Boolean).length, 1, 'no side branch');
  assert.ok(!gitIn(bare, 'show', 'main:acme/demo/phases/001-alpha-job.md').includes('from b'));
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
  assert.equal(gitIn(b.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
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

test('review (merge risk): a failed push is rolled back; a later command never publishes the failed note', async t => {
  const [a, b, { bare }] = writers(t);
  for (const n of ['one', 'two']) assert.equal(cli(NEW(n), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hook = join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "rejected: origin down" >&2\nexit 1\n'); chmodSync(hook, 0o755);
  assert.equal(cli(['update', '1', '--append', 'first note'], { cwd: a.cons, tmp: a.tmp }).status, 3); // rolled back, never left unpublished
  rmSync(hook);
  assert.equal(cli(NEW('three'), { cwd: b.cons, tmp: b.tmp }).status, 0); // another clone pushes meanwhile
  const q = cli(['query', '--all'], { cwd: a.cons, tmp: a.tmp }); // the leading pull rebases a's unpushed commit onto it
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.doesNotMatch(gitIn(a.home, 'branch', '--list'), /backlog-unmerged/);
  const w = cli(['update', '2', '--append', 'second note'], { cwd: a.cons, tmp: a.tmp });
  assert.equal(w.status, 0, w.stdout + w.stderr);
  const dir = join(clone(t, bare), 'acme', 'demo');
  assert.doesNotMatch(readFileSync(join(dir, 'phases', '001-one.md'), 'utf8'), /first note/);
  assert.match(readFileSync(join(dir, 'phases', '002-two.md'), 'utf8'), /second note/);
  assert.equal(gitIn(a.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
});

// Publication must leave no pending commit for a later command to publish.
const state = home => ({
  head: gitIn(home, 'rev-parse', 'HEAD'),
  index: gitIn(home, 'ls-files', '--stage'),
  status: gitIn(home, 'status', '--porcelain'),
  files: gitIn(home, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean)
    .map(p => [p, existsSync(join(home, p)) ? readFileSync(join(home, p)).toString('base64') : null]),
});

test('publication: a legacy unpublished commit is refused without changing files, index or history', t => {
  const [a, , { bare }] = writers(t);
  assert.equal(cli(NEW('one'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  writeFileSync(join(a.home, 'legacy.txt'), 'legacy change');
  gitIn(a.home, 'add', 'legacy.txt'); gitIn(a.home, 'commit', '-qm', 'legacy unpublished change');
  const sha = gitIn(a.home, 'rev-parse', '--short', 'HEAD');
  writeFileSync(join(a.home, 'staged.txt'), 'private index'); gitIn(a.home, 'add', 'staged.txt');
  const before = state(a.home); const remote = gitIn(bare, 'rev-parse', 'main');
  const r = cli(['update', '1', '--append', 'must not run'], { cwd: a.cons, tmp: a.tmp });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /unpublished commit/i); assert.ok(r.stderr.includes(sha));
  assert.match(r.stderr, /legacy unpublished change/); assert.match(r.stderr, /git -C .* push/); assert.match(r.stderr, /git -C .* reset/);
  assert.deepEqual(state(a.home), before);
  assert.equal(gitIn(bare, 'rev-parse', 'main'), remote);
});

for (const [name, args] of [
  ['new', NEW('failed creation')], ['update', ['update', '1', '--append', 'failed note']],
  ['archive', ['archive', '1', '--force']], ['move', ['move', '1', '--to-repository', 'new/place']],
]) test(`publication: permanently rejected ${name} restores history, working files and staging`, t => {
  const [a, , { bare }] = writers(t);
  assert.equal(cli(NEW('one'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  writeFileSync(join(a.home, 'private.txt'), 'staged private content'); gitIn(a.home, 'add', 'private.txt');
  writeFileSync(join(a.home, 'private.txt'), 'unstaged private content');
  writeFileSync(join(a.folder, 'private.md'), 'pre-existing file inside the command folder');
  const item = join(a.folder, 'phases', '001-one.md');
  writeFileSync(item, readFileSync(item, 'utf8') + '\npre-existing staged note\n');
  gitIn(a.home, 'add', 'acme/demo/phases/001-one.md');
  writeFileSync(item, readFileSync(item, 'utf8') + '\npre-existing unstaged note\n');
  const before = state(a.home);
  const hook = join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "permanently read-only" >&2\nexit 1\n'); chmodSync(hook, 0o755);
  const r = cli(args, { cwd: a.cons, tmp: a.tmp });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /change was not published/i);
  assert.deepEqual(state(a.home), before);
  assert.equal(gitIn(a.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  assert.equal(gitIn(a.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  rmSync(hook);
  assert.equal(cli(NEW('later success'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  const files = gitIn(bare, 'ls-tree', '-r', '--name-only', 'main');
  assert.ok(files.includes('acme/demo/phases/001-one.md'));
  assert.doesNotMatch(files, /failed-creation|new\/place|private.txt/);
  assert.doesNotMatch(gitIn(bare, 'show', 'main:acme/demo/phases/001-one.md'), /failed note/);
});

test('publication: legacy two-commit move with destination-only conflict is refused; explicit drop and retry publishes both folders', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('one'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const src = 'acme/demo/phases/001-one.md'; const dst = 'new/place/phases/001-one.md';
  mkdirSync(join(b.home, 'new', 'place', 'phases'), { recursive: true }); gitIn(b.home, 'mv', src, dst);
  let con = db.connect(join(b.home, 'new', 'place')); db.scan(con, join(b.home, 'new', 'place')); con.close();
  gitIn(b.home, 'add', '-A'); gitIn(b.home, 'commit', '-qm', 'legacy cross-repository move');
  con = db.connect(join(b.home, 'new', 'place')); db.logEvent(con, 'note', { note: 'second legacy commit' }); con.close();
  gitIn(b.home, 'add', '-A'); gitIn(b.home, 'commit', '-qm', 'second legacy commit');
  const hashes = gitIn(b.home, 'log', '--format=%h', 'origin/main..HEAD').split('\n');
  con = db.connect(join(a.home, 'new', 'place')); db.logEvent(con, 'note', { note: 'destination-only conflict' }); con.close();
  gitIn(a.home, 'add', 'new/place'); gitIn(a.home, 'commit', '-qm', 'destination only'); gitIn(a.home, 'push', '-q');
  writeFileSync(join(b.home, 'private.txt'), 'do not publish'); gitIn(b.home, 'add', 'private.txt');
  const before = state(b.home); const remote = gitIn(bare, 'rev-parse', 'main');
  const refused = cli(['update', '1', '--append', 'must refuse'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(refused.status, 3, refused.stdout + refused.stderr);
  for (const hash of hashes) assert.ok(refused.stderr.includes(hash));
  assert.deepEqual(state(b.home), before); assert.equal(gitIn(bare, 'rev-parse', 'main'), remote);
  assert.deepEqual(gitIn(bare, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(p => p.endsWith('001-one.md')), [src]);
  // The fixture explicitly drops the legacy stack; the CLI never chooses for the owner.
  gitIn(b.home, 'fetch', '-q', 'origin'); gitIn(b.home, 'reset', '--hard', 'origin/main');
  writeFileSync(join(b.home, 'private.txt'), 'do not publish'); gitIn(b.home, 'add', 'private.txt');
  const staged = gitIn(b.home, 'ls-files', '--stage', '--', 'private.txt');
  const hold = holdFirstPush(b);
  const move = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  try {
    con = db.connect(join(a.home, 'new', 'place')); db.logEvent(con, 'note', { note: 'destination changes again' }); con.close();
    gitIn(a.home, 'add', 'new/place'); gitIn(a.home, 'commit', '-qm', 'destination race'); gitIn(a.home, 'push', '-q');
  } finally { hold.release(); }
  const r = await move.done; assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(gitIn(bare, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(p => p.endsWith('001-one.md')), [dst]);
  assert.equal(gitIn(b.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  assert.equal(gitIn(b.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  assert.equal(gitIn(b.home, 'ls-files', '--stage', '--', 'private.txt'), staged);
  assert.doesNotMatch(gitIn(bare, 'ls-tree', '-r', '--name-only', 'main'), /private.txt/);
  const changed = gitIn(bare, 'diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-r', 'main');
  assert.match(changed, /D\s+acme\/demo\/phases\/001-one.md/); assert.match(changed, /A\s+new\/place\/phases\/001-one.md/);
});

test('publication: permanent failure after a push race removes renumbering and retains all incoming remote files', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('anchor'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  writeFileSync(join(b.home, 'private.txt'), 'private staging'); gitIn(b.home, 'add', 'private.txt');
  const staged = gitIn(b.home, 'ls-files', '--stage', '--', 'private.txt');
  const hold = holdFirstPush(b);
  // Keep the gate, but every attempted push by b fails, including after rebasing.
  const hook = join(b.home, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, readFileSync(hook, 'utf8').replace('&& exit 0', '&& exit 1') + '\nexit 1\n');
  const failed = cliAsync(NEW('failed raced creation'), { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  let collision; let remote;
  try {
    collision = cli(NEW('upstream collision'), { cwd: a.cons, tmp: a.tmp });
    remote = cli([...NEW('other folder'), '--body', '## Definition of done\n- [ ] x'], { cwd: a.cons, tmp: a.tmp, env: { TEAM_REPOSITORY: 'other/repo' } });
  } finally { hold.release(); }
  const r = await failed.done;
  assert.equal(collision.status, 0, collision.stdout + collision.stderr);
  assert.equal(remote.status, 0, remote.stdout + remote.stderr);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /renumbered 002 -> 003/);
  assert.match(r.stderr, /change was not published/i);
  assert.equal(gitIn(b.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  assert.equal(gitIn(b.home, 'diff', '--name-only'), '');
  assert.equal(gitIn(b.home, 'diff', '--cached', '--name-only'), 'private.txt');
  assert.equal(gitIn(b.home, 'ls-files', '--stage', '--', 'private.txt'), staged);
  assert.deepEqual(store.load(b.folder).map(x => x.fm.name), ['anchor', 'upstream collision']);
  assert.equal(store.load(join(b.home, 'other', 'repo'))[0].fm.name, 'other folder');
});


for (const dependency of ['1', '001-alpha']) test(`review P1: publication refuses a repository move after another clone adds dependent ${dependency}`, async t => {
  const { a, b, bare, result } = await race(t, [NEW('alpha')],
    [...NEW('dependent'), '--depends-on', dependency], ['move', '1', '--to-repository', 'acme/dst']);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /002-dependent depends on/);
  assert.equal(gitIn(b.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
  assert.deepEqual(state(b.home), state(clone(t, bare)), 'both files and databases match the winning upstream clone');
  assert.ok(existsSync(join(b.folder, 'phases', '001-alpha.md')));
  assert.ok(!existsSync(join(b.home, 'acme', 'dst', 'phases', '001-alpha.md')));
  for (const w of [a, b]) {
    const q = cli(['query', '--blocked', '--json'], { cwd: w.cons, tmp: w.tmp });
    assert.equal(q.status, 0, q.stdout + q.stderr);
    assert.doesNotMatch(q.stdout, /missing/);
    assert.match(q.stdout, /001-alpha/);
  }
});

test('review P1: publication refuses update --seq when another clone allocates that sequence', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha'), NEW('beta')], NEW('gamma'), ['update', '2', '--seq', '3']);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /seq.*3.*003-gamma|003-gamma.*seq.*3/i);
  assert.equal(gitIn(b.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
  assert.deepEqual(state(b.home), state(clone(t, bare)), 'the rejected sequence and mirror edits are both rolled back');
  assert.deepEqual(store.load(b.folder).map(i => [i.fm.phase, i.fm.seq]), [['001-alpha', 1], ['002-beta', 2], ['003-gamma', 3]]);
  const q = cli(['query', '--all', '--json'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(q.status, 0, q.stdout + q.stderr);
});

test('review P1: publication preflight rejecting an appended conflict marker restores starting files, database and staging', t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('alpha'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const item = join(b.folder, 'phases', '001-alpha.md');
  writeFileSync(item, readFileSync(item, 'utf8') + '\nprior staged note\n');
  gitIn(b.home, 'add', 'acme/demo/phases/001-alpha.md');
  writeFileSync(item, readFileSync(item, 'utf8') + '\nprior unstaged note\n');
  writeFileSync(join(b.home, 'private.txt'), 'private staging');
  gitIn(b.home, 'add', 'private.txt');
  const before = state(b.home); const remote = gitIn(bare, 'rev-parse', 'main');
  const r = cli(['update', '1', '--append', '<<<<<<< example'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /conflicts/i);
  assert.deepEqual(state(b.home), before, 'preflight failure restores Markdown, backlog.db, HEAD and index byte for byte');
  assert.equal(gitIn(bare, 'rev-parse', 'main'), remote, 'nothing was published');
  assert.ok(!existsSync(join(b.home, '.git', 'smooth-backlog-cli-journal.json')));
  const next = cli(['update', '1', '--append', 'valid follow-up'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(next.status, 0, next.stdout + next.stderr);
  assert.doesNotMatch(gitIn(bare, 'show', 'main:acme/demo/phases/001-alpha.md'), /<<<<<<< example/);
});


for (const args of [
  [...NEW('dependent'), '--depends-on', '2'],
  ['update', '1', '--set-depends-on', '2'],
]) test(`review P1: publication validates outgoing dependencies of ${args[0]} against an upstream move`, async t => {
  const { b, bare, result } = await race(t, [NEW('beta'), NEW('alpha')],
    ['move', '2', '--to-repository', 'acme/dst'], args);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /depends on missing item 2/);
  assert.deepEqual(state(b.home), state(clone(t, bare)), 'the entire rejected write set is restored to upstream');
  assert.equal(cli(['query', '--blocked', '--json'], { cwd: b.cons, tmp: b.tmp }).status, 0);
});

test('review P1: publication refuses a sequence change after an upstream clone adds an incoming dependency', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha')],
    [...NEW('dependent'), '--depends-on', '1'], ['update', '1', '--seq', '5']);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /depends on.*1/);
  assert.deepEqual(state(b.home), state(clone(t, bare)));
  assert.equal(store.load(b.folder).find(i => i.fm.phase === '001-alpha').fm.seq, 1);
});

// Each race passes its initial validation, then changes a different file upstream.
// Rejection must remove the entire mutation (including its mirror/events), not park it for the next command.
function rejectedPublication(t, b, bare, result, why) {
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /not published.*rolled back/s);
  assert.match(result.stderr, why);
  assert.equal(gitIn(b.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  assert.deepEqual(state(b.home), state(clone(t, bare)));
}

for (const [forward, reverse] of [['2', '1'], ['002-beta', '001-alpha']]) {
  test(`publication graph: opposing dependencies ${forward}/${reverse} cannot publish a cycle`, async t => {
    const { b, bare, result } = await race(t, [NEW('alpha'), NEW('beta')],
      ['update', '2', '--set-depends-on', reverse], ['update', '1', '--set-depends-on', forward]);
    rejectedPublication(t, b, bare, result, /dependency cycle/);
    assert.deepEqual(store.load(b.folder).map(i => i.fm.depends_on), [[], [/^\d+$/.test(reverse) ? 1 : reverse]]);
  });
}

test('publication graph: transitive cycle through an upstream edge is refused', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha'), NEW('beta'), NEW('gamma'), ['update', '1', '--set-depends-on', '2']],
    ['update', '2', '--set-depends-on', '3'], ['update', '3', '--set-depends-on', '1']);
  rejectedPublication(t, b, bare, result, /dependency cycle/);
});

const COMPLETE = name => [...NEW(name), '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--body', '## Definition of done\n- [ ] verified'];

test('publication graph: a claim is refused when its completed dependency reopens upstream', async t => {
  const { b, bare, result } = await race(t,
    [NEW('dependency'), ['update', '1', '--status', 'done'], [...COMPLETE('work'), '--depends-on', '1']],
    ['update', '1', '--status', 'pending', '--priority', '99'], ['update', '2', '--claim', 'amy']);
  rejectedPublication(t, b, bare, result, /dependencies not done/);
});

for (const force of [false, true]) test(`publication graph: concurrent claims by one agent ${force ? 'respect --force' : 'cannot bypass the active-work limit'}`, async t => {
  const { b, bare, result } = await race(t, [COMPLETE('alpha'), COMPLETE('beta')],
    ['update', '1', '--claim', 'amy'], ['update', '2', '--claim', 'amy', ...(force ? ['--force'] : [])]);
  if (!force) rejectedPublication(t, b, bare, result, /amy holds.*active item/);
  else {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(store.load(b.folder).map(i => i.fm.claimed_by), ['amy', 'amy']);
    assert.equal(gitIn(b.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  }
});

test('publication identity: an upstream archived file cannot duplicate the slug of a written item', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('alpha'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['update', '1', '--append', 'rejected note'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  try {
    const item = store.load(a.folder)[0];
    store.write({ path: join(a.folder, 'archive', '099-other.md'), fm: { ...item.fm, seq: 99, status: 'archived' }, body: item.body }, a.folder);
    gitIn(a.home, 'add', 'acme/demo/archive'); gitIn(a.home, 'commit', '-qm', 'external archived slug collision'); gitIn(a.home, 'push', '-q');
  } finally { hold.release(); }
  rejectedPublication(t, b, bare, await second.done, /slug.*001-alpha.*unique|duplicate.*001-alpha/i);
});

test('publication identity: an upstream slug dependent also prevents changing its target sequence', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha')],
    [...NEW('dependent'), '--depends-on', '001-alpha'], ['update', '1', '--seq', '5']);
  rejectedPublication(t, b, bare, result, /depends on.*001-alpha/);
});

test('item 045: an item without a phase field keeps the identity of its file name: renumbering it is refused while an upstream item depends on that slug', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha')],
    [...NEW('dependent'), '--depends-on', '001-alpha'], ['update', '1', '--seq', '5'], { afterSeed: a => {
      const file = join(a.folder, 'phases', '001-alpha.md');
      writeFileSync(file, readFileSync(file, 'utf8').replace(/^phase: .*\n/m, '')); // an older file: its slug is its file name
      gitIn(a.home, 'commit', '-qam', 'an item without a phase field'); gitIn(a.home, 'push', '-q');
    } });
  rejectedPublication(t, b, bare, result, /depends on.*001-alpha/);
});

test('publication graph: an outgoing slug dependency is rechecked after an upstream move', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha'), NEW('beta')],
    ['move', '2', '--to-repository', 'acme/dst'], ['update', '1', '--set-depends-on', '002-beta']);
  rejectedPublication(t, b, bare, result, /depends on missing item 002-beta/);
});

// File-only publishers are supported peers too; do not rely on a backlog.db conflict to trigger validation.
async function fileRace(t, seed, args, publish, env) {
  const [a, b, { bare }] = writers(t);
  for (const cmd of seed) assert.equal(cli(cmd, { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['query', '--all'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const before = state(b.home);
  const hold = holdFirstPush(b);
  const second = cliAsync(args, { cwd: b.cons, tmp: b.tmp, env });
  await hold.held();
  try {
    publish(a);
    gitIn(a.home, 'add', 'acme/demo'); gitIn(a.home, 'commit', '-qm', 'external file publication'); gitIn(a.home, 'push', '-q');
  } finally { hold.release(); }
  return { b, bare, before, result: await second.done };
}

test('publication identity: an upstream archived sequence colliding with an existing assignment is refused', async t => {
  const { b, bare, result } = await fileRace(t, [NEW('alpha')], ['update', '1', '--seq', '5'], a => {
    store.write({ path: join(a.folder, 'archive', '005-other.md'), fm: { phase: '005-other', seq: 5, status: 'archived' }, body: '\narchived\n' }, a.folder);
  });
  rejectedPublication(t, b, bare, result, /seq.*5.*005-other/);
});

test('publication identity: an upstream mirror-only sequence reservation is not overwritten', async t => {
  const { b, bare, result } = await fileRace(t, [NEW('alpha')], ['update', '1', '--seq', '5'], a => {
    const con = db.connect(a.folder);
    try {
      con.prepare('INSERT INTO phase(handoff_id,slug,seq,status,path) VALUES(?,?,?,?,?)')
        .run(db.ensureAnchor(con), '005-ghost', 5, 'pending', 'phases/005-ghost.md');
    } finally { con.close(); }
  });
  rejectedPublication(t, b, bare, result, /seq.*5.*005-ghost/);
});

test('publication safety: upstream conflict markers abort an otherwise disjoint write', async t => {
  const { b, bare, result } = await fileRace(t, [NEW('alpha')], ['update', '1', '--append', 'rejected note'], a => {
    writeFileSync(join(a.folder, 'conflict.md'), '<<<<<<< upstream\nunfinished\n');
  });
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /unresolved conflicts/);
  assert.deepEqual(state(b.home), state(clone(t, bare)));
});

for (const [name, args, change] of [
  ['required fields', ['update', '1', '--claim', 'amy'], fm => { fm.estimate_min = 0; }],
  ['review state', ['update', '1', '--close', '--by', 'amy', '--summary', 'delivered'], fm => { fm.review_state = 'changes-requested'; }],
  ['claim ownership', ['update', '1', '--claim', 'amy'], fm => { fm.claimed_by = 'bob'; }],
  ['team scope of a split parent', [...COMPLETE('child'), '--split-from', '1'], fm => { fm.branch = 'other'; }],
]) test(`publication read set: concurrent ${name} changes cannot pass earlier validation`, async t => {
  const { b, bare, before, result } = await fileRace(t,
    [COMPLETE('alpha'), ['update', '1', '--request-review', 'any', '--note', 'initial evidence'],
      ['update', '1', '--review', 'pass', '--by', 'bob', '--comments', 'references/review/code.md passed']], args, a => {
      const item = store.load(a.folder)[0];
      change(item.fm);
      store.write({ path: join(a.folder, item.path), fm: item.fm, body: item.body }, a.folder);
    }, { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' });
  assert.equal(result.status, 5, result.stdout + result.stderr);
  assert.match(result.stderr, /changed by.*read it again/s);
  assert.deepEqual(state(b.home), before, 'stale-view rollback retains the established pre-command snapshot');
  assert.equal(gitIn(b.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  assert.doesNotMatch(gitIn(bare, 'log', '-1', '--format=%s'), /update.py|new --name/);
});

test('cleanup: a CLI child killed mid-push leaves its child git process writing the dbconf-* folder; the cleanup settles it, no ENOTEMPTY (item 76)', t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  // A pre-receive gate that keeps a's push in flight and writes a new probe file into the shared bare
  // (inside dbconf-a-*) every millisecond: when the CLI child dies mid-push, its child git process
  // (git-push / git-receive-pack and the gate's sh + sleep) outlives it and keeps creating entries in
  // the folder — the ENOTEMPTY writer of the cleanup (observed at 1566552 and 6c031b1).
  const gate = join(bare, 'hooks', 'pre-receive');
  writeFileSync(gate, `#!/bin/sh\ni=0\nwhile :; do touch ${join(bare, 'refs', 'probe')}-$i 2>/dev/null; i=$((i+1)); sleep 0.001; done\n`);
  chmodSync(gate, 0o755);
  const r = cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp, timeout: 2500 }); // the fixture's spawnSync timeout kills the CLI child mid-push
  assert.notEqual(r.status, 0, `the CLI child must be killed mid-push: ${r.stdout}${r.stderr}`);
  const onProc = existsSync('/proc'); // the chain is visible only where /proc exists (macOS, CI: the cleanup must still work without it)
  // writers' t.after was registered first and runs first (hooks are FIFO): it settles the chain and removes the
  // folders, and only then does this hook check the ABSENCE of the chain — without the settle the chain is still
  // alive after the rmSync and this assertion fails (item 76 review: the absence was never checked)
  t.after(() => { if (onProc) assert.equal(scenarioPids(a.tmp).length, 0, 'the cleanup settled every child process of the killed CLI child (item 76)'); });
  if (!onProc) t.skip('no /proc on this platform: the surviving chain cannot be seen (item 76)');
  assert.ok(scenarioPids(a.tmp).length >= 1, 'the child git process of the killed CLI child is still alive');
  void b;
});

test('cleanup settle: a child process that survives the settle is reported loudly, not removed silently (item 76 review)', async t => {
  const d = mkdtempSync(join(tmpdir(), 'dbconf-s-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  // a node child that traps SIGTERM and carries the fixture env: the settle's first round (SIGTERM) cannot clear it
  const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setTimeout(() => {}, 1000)'],
    { env: { BACKLOG_HOME: join(d, 'home') }, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 50 && !scenarioPids(d).includes(child.pid); i++) await sleep(50);
  assert.ok(scenarioPids(d).includes(child.pid), 'the SIGTERM-surviving child is visible to the settle');
  await assert.rejects(settleScenarioChildren(d, 1), /still alive/);
  child.kill('SIGKILL');
  for (let i = 0; i < 20 && scenarioPids(d).length; i++) await sleep(50);
  assert.equal(scenarioPids(d).length, 0);
});

test('cleanup: scenarioPids sees the processes carrying the fixture env; without /proc (macOS) it sees none (item 76 review)', async t => {
  const d = mkdtempSync(join(tmpdir(), 'dbconf-p-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], { env: { BACKLOG_HOME: join(d, 'home') }, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 50 && !scenarioPids(d).includes(child.pid); i++) await sleep(50);
  assert.ok(scenarioPids(d).includes(child.pid), 'a process carrying the fixture env is found through /proc');
  assert.deepStrictEqual(scenarioPids(d, '/no-such-proc'), [], 'no /proc (macOS, CI): nothing to settle, and no throw');
  child.kill('SIGKILL');
});
