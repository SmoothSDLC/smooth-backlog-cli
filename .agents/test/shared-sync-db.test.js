// Review P1 of PR #3: two real CLI writers in separate clones. Whatever the rebase of the second writer meets (a number collision,
// a move of the other clone), the change is repaired or refused and never half-published. Local bare repos only.
import { configUser } from '../../src/shared/setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, itemName, itemPath, itemRel, sharedBacklog, archivedRel, itemNames, archivedPath, reEscape, changeItem, readItem, ENVELOPE } from './shared-fixtures.js';
import { cliAsync, gitIn, sleep } from './shared-concurrency.js';
import * as index from '../../src/shared/index.js';
import * as store from '../../src/shared/store.js';

// Item 76 (ENOTEMPTY cleanup at 1566552 / 6c031b1): the writer is the child git process of a scenario CLI
// child — the git-push / git-receive-pack chain, and, where a push gate is used, the gate's sh hook and its
// sleep — that outlive the CLI's node child (the fixture's spawnSync timeout kill mid-push, an unsettled
// chain) and still write into the temp folder when the test's cleanup removes it. Every process of the chain
// inherits the CLI child's SMOOTH_BACKLOG_CLI_HOME env; settleScenarioChildren kills the ones still alive (SIGTERM, then
// SIGKILL) so the removal cannot race with them, and fails loudly if the chain is still alive after the settle.
// Linux only: the scan needs /proc. macOS is not supported by this suite; its support returns with item 085.
function scenarioPids(d, procRoot = '/proc') {
  const mark = `SMOOTH_BACKLOG_CLI_HOME=${join(d, 'home')}`;
  const out = [];
  let entries;
  try { entries = readdirSync(procRoot); } catch (e) {
    if (e.code === 'ENOENT') return out; // no /proc: nothing to scan (Linux-only suite; macOS returns with item 085)
    throw new Error(`scenarioPids: the process scan of ${procRoot} is unreadable: ${e.message}`); // item 76 review: a failed scan is not verified empty
  }
  for (const pid of entries) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
    let env;
    try { env = readFileSync(join(procRoot, pid, 'environ'), 'utf8'); }
    catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ESRCH') continue; // the process exited between the enumeration and the read: verified gone (ESRCH: the exit is in flight, the CI failure at 95a3db3)
      if (e.code === 'EACCES') continue; // another user's process: only this scenario's own children carry the fixture env (item 76 review)
      throw new Error(`scenarioPids: the environ of pid ${pid} is unreadable: ${e.message}`); // a scan error is not verified empty
    }
    if (env.includes(mark)) out.push(Number(pid));
  }
  return out;
}
async function settleScenarioChildren(d, procRoot = '/proc', rounds = 25) {
  let empty = 0; // item 76: settled only after two consecutive empty scans 100 ms apart - one empty look can fall between two processes of the chain
  for (let round = 0; round < rounds && empty < 2; round++) {
    const pids = scenarioPids(d, procRoot);
    if (!pids.length) empty++;
    else {
      empty = 0;
      for (const p of pids) { try { process.kill(p, round ? 'SIGKILL' : 'SIGTERM'); } catch { /* exited in the meantime */ } }
    }
    await sleep(100);
  }
  if (empty >= 2) return;
  let pids = scenarioPids(d, procRoot); // item 76 review: verify the writers stopped; fail loudly instead of removing the folders silently
  if (!pids.length && empty === 0) { await sleep(100); pids = scenarioPids(d, procRoot); } // the second consecutive empty scan, 100 ms after the first
  if (pids.length) throw new Error(`the scenario's child processes are still alive after the settle (${rounds} rounds of SIGTERM, then SIGKILL): pids ${pids.join(', ')}`);
}
// item 76: remove a scenario folder; if the removal fails, name what is left and which scenario processes are still alive (no retry).
function removeScenario(d) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch (e) {
    let left = [];
    try { left = readdirSync(d, { recursive: true }).slice(0, 20); } catch { /* the listing itself failed */ }
    throw new Error(`cleanup of ${d} failed (${e.code}): left ${left.join(', ') || 'nothing listed'}; scenario processes still alive: ${scenarioPids(d).join(', ') || 'none'}`);
  }
}

// Two writers (a, b): separate temp dirs, each with its own clone of ONE backlog bare remote and its own consumer clone of acme/demo.
function writers(t) {
  const dirs = [mkdtempSync(join(tmpdir(), 'dbconf-a-')), mkdtempSync(join(tmpdir(), 'dbconf-b-'))];
  t.after(async () => {
    for (const d of dirs) await settleScenarioChildren(d); // item 76: the child git process of a killed or unsettled CLI child still writes the folder — the ENOTEMPTY writer of the cleanup
    dirs.forEach(removeScenario);
  });
  const home = sharedBacklog(dirs[0]);
  const bare = join(dirs[0], 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  gitIn(dirs[1], 'clone', '-q', bare, join(dirs[1], 'home'));
  void home;
  return dirs.map(tmp => {
    const cons = consumer(tmp, 'acme', 'demo', 'main');
    mkdirSync(join(tmp, 'config', 'smooth-backlog-cli'), { recursive: true });
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
  await hold.held(); // b has pulled, created 001-beta-job and committed
  const first = cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const verify = mkdtempSync(join(tmpdir(), 'dbconf-v-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  const dir = join(verify, 'c', 'acme', 'demo');
  assert.deepEqual(store.load(dir).map(i => [i.path, i.fm.name]), [[itemRel('001-alpha-job'), 'alpha job'], [itemRel('002-beta-job'), 'beta job']]);
  assert.deepEqual(index.rows(dir).rows.map(x => ({ slug: x.slug, seq: x.seq })).sort((x, y) => x.seq - y.seq), [{ slug: '001-alpha-job', seq: 1 }, { slug: '002-beta-job', seq: 2 }]);
  assert.deepEqual(index.read(dir).branches.main.map(e => e.slug), ['001-alpha-job', '002-beta-job'], 'the published index lists both items once');

  for (const w of [a, b]) { // both clones pull cleanly, are on origin/main and clean, and see both items
    const q = cli(['list', 'all-branches'], { cwd: w.cons, tmp: w.tmp });
    assert.equal(q.status, 0, q.stdout + q.stderr);
    assert.match(q.stdout, /001-alpha-job/); assert.match(q.stdout, /002-beta-job/);
    assert.equal(gitIn(w.home, 'status', '--porcelain'), '');
    assert.equal(gitIn(w.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  }
});

test('review P2: retrying a rolled-back creation takes the upstream number into account', t => {
  const [a, b] = writers(t);
  const hook = join(b.home, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n'); chmodSync(hook, 0o755);
  assert.notEqual(cli(NEW('beta job'), { cwd: b.cons, tmp: b.tmp }).status, 0); // committed locally with its db, push refused
  rmSync(hook);
  // the other clone pushes the same number as a file only
  store.write({ path: itemPath(a.folder, '001-alpha-job'), fm: { ...ENVELOPE, phase: '001-alpha-job', seq: 1, name: 'alpha job', status: 'pending', repository: 'acme/demo', branch: 'main', priority: 0, created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z' }, body: '\n# Phase 001\n' }, a.folder);
  gitIn(a.home, 'add', `acme/demo/${itemRel('001-alpha-job')}`); gitIn(a.home, 'commit', '-q', '-m', 'alpha'); gitIn(a.home, 'push', '-q');
  assert.equal(cli(NEW('beta job'), { cwd: b.cons, tmp: b.tmp }).status, 0); // a fresh command allocates 002 after pulling alpha
  const r = cli(['update', '2', '--note', 'after the renumbering'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(index.rows(b.folder).rows.map(x => ({ slug: x.slug, seq: x.seq })).sort((x, y) => x.seq - y.seq), [{ slug: '001-alpha-job', seq: 1 }, { slug: '002-beta-job', seq: 2 }]);
});

test('review P1: a cross-repository move racing another clone is ONE commit of the source and target folders: never the target pushed without the source', async t => {
  const [a, b, { bare }] = writers(t);
  for (const name of ['alpha job', 'gamma job']) assert.equal(cli(NEW(name), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp });
  await hold.held(); // b holds its (only) push: source and target changed, committed together
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // a changes the source folder too
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
  const rows = index.rows(dir).rows;
  assert.ok(!rows.some(x => x.slug === '001-alpha-job'), JSON.stringify(rows));
  for (const x of rows) assert.ok(existsSync(join(dir, x.path)));
  assert.ok(!Object.values(index.read(dir).branches).flat().some(e => e.slug === '001-alpha-job'), 'the moved item left the order of the source');
  assert.ok(existsSync(join(verify, 'c', 'new', 'place', 'phases')));
});

for (const [title, args] of [['list', ['list', 'all-branches']], ['new', NEW('beta job')]]) {
  test(`review P1: ${title} after a pull whose autostash does not apply (exit 0, conflict markers) is refused: nothing ingests or pushes the markers`, t => {
    const [a, b, { bare }] = writers(t);
    assert.equal(cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp }).status, 0);
    assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
    const file = itemPath(b.folder, '001-alpha-job');
    changeItem(file, { fm: { summary: 'LOCAL EDIT' } }); // an uncommitted edit of b
    assert.equal(cli(['update', '1', '--summary', 'REMOTE EDIT'], { cwd: a.cons, tmp: a.tmp }).status, 0); // upstream changes the same line
    const head = gitIn(bare, 'rev-parse', 'main');
    const r = cli(args, { cwd: b.cons, tmp: b.tmp });
    assert.equal(r.status, 3, `${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /unresolved conflicts/);
    assert.equal(gitIn(bare, 'rev-parse', 'main'), head, 'nothing was pushed');
    assert.ok(!existsSync(itemPath(b.folder, '002-beta-job')), 'nothing was created');
  });
}

test('review P1: a number collision in the destination of a cross-repository move renames nothing in the source (no phantom 002-alpha)', async t => {
  const [a, b, { bare }] = writers(t);
  // gamma stays in phases/: if the move emptied the folder, git would carry a's new file along into the target (directory rename detection)
  for (const name of ['alpha job', 'gamma job']) assert.equal(cli(NEW(name), { cwd: a.cons, tmp: a.tmp }).status, 0); // acme/demo 001-alpha-job, 002-gamma-job
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp }); // becomes new/place 001-alpha-job
  await hold.held();
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // the source folder changes too
  const delta = cli([...NEW('delta job'), '--body', '## Definition of done\n- [ ] x'], { cwd: a.cons, tmp: a.tmp, env: { SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'new/place' } }); // new/place 001-delta-job
  assert.equal(delta.status, 0, delta.stdout + delta.stderr);
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);

  const verify = mkdtempSync(join(tmpdir(), 'dbconf-p-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  for (const repo of [['acme', 'demo'], ['new', 'place']]) {
    const dir = join(verify, 'c', ...repo);
    const rows = index.rows(dir).rows;
    for (const x of rows) assert.ok(existsSync(join(dir, x.path)), `${repo.join('/')}: row ${x.slug} has its file (${JSON.stringify(rows)})`);
  }
  assert.ok(!index.rows(join(verify, 'c', 'acme', 'demo')).rows.some(x => /alpha/.test(x.slug)), 'the moved item has no row in the source');
});

test('audit: a move that empties phases/ does not carry another clone\'s new file into the target (directory renames are off)', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('alpha job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // the only item of acme/demo
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  assert.equal(cli(NEW('beta job'), { cwd: a.cons, tmp: a.tmp }).status, 0); // a new file in the folder b just emptied
  hold.release();
  const r = await second.done;
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}${r.stderr}`);
  const verify = mkdtempSync(join(tmpdir(), 'dbconf-q-')); t.after(() => rmSync(verify, { recursive: true, force: true }));
  gitIn(verify, 'clone', '-q', bare, join(verify, 'c'));
  const files = repo => itemNames(join(verify, 'c', ...repo));
  assert.deepEqual(files(['acme', 'demo']).filter(f => /beta/.test(f)).length, 1, 'beta stays in acme/demo');
  assert.deepEqual(files(['new', 'place']).filter(f => /beta/.test(f)), [], 'beta is not carried into new/place');
});

test('review P2: update records its published identity when an added item is renumbered during recovery', async t => {
  const [a, b, { bare }] = writers(t);
  const agent = process.env.SMOOTH_BACKLOG_CLI_AGENT || configUser(a.cons);
  assert.equal(cli(NEW('anchor'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const [anchor] = store.load(b.folder);
  store.write({ path: itemPath(b.folder, '002-local'), fm: {
    ...ENVELOPE, ...anchor.fm, phase: '002-local', seq: 2, name: 'local', priority: 1,
    review_refs: ['references/review/code.md'], estimate_min: 5,
  }, body: '\n## Definition of done\n- [ ] x\n' }, b.folder);
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
async function race(t, seedArgs, aArgs, bArgs, { aEnv, bEnv, afterSeed, seedEnv, readAs } = {}) { // readAs: the agent whose view each writer holds before the race
  const [a, b, { bare }] = writers(t);
  for (const args of seedArgs) { if (typeof args === 'function') { args(a, b); continue; } const r = cli(args, { cwd: a.cons, tmp: a.tmp, env: seedEnv }); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); }
  afterSeed?.(a);
  if (readAs) assert.equal(cli(['list', 'all-branches'], { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
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
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
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
  const row = store.load(join(clone(t, bare), 'acme', 'demo')).find(i => i.fm.name === 'local job');
  assert.equal(row.fm.phase, '002-local-job'); assert.equal(row.fm.status, 'pending');
  assert.equal(row.path, archivedRel('002-local-job', 'phases'));
  const events = row.fm.events;
  assert.equal(events.filter(e => e.step === 'archive').length, 1);
  assert.equal(events.filter(e => e.note.includes('LOCAL_ARCHIVE_EVIDENCE')).length, 1);
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
});

test('audit t2: the same item changed by two clones: the second is refused (exit 5), its change is not parked or pushed, and the clone keeps working', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha job')], ['update', '1', '--summary', 'from a'], ['update', '1', '--summary', 'from b']);
  assert.equal(result.status, 5, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /item 001-alpha-job was changed by .* after you last read it/);
  assert.equal(gitIn(b.home, 'branch', '--list').split('\n').filter(Boolean).length, 1, 'no side branch');
  assert.ok(!gitIn(bare, 'show', `main:acme/demo/${itemRel('001-alpha-job')}`).includes('from b'));
  assert.equal(gitIn(b.home, 'status', '--porcelain'), '');
  assert.equal(gitIn(b.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  const again = cli(['update', '1', '--summary', 'from b again'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(again.status, 0, again.stdout + again.stderr); // every later pull works
});

test('review (merge risk): a failed push is rolled back; a later command never publishes the failed note', async t => {
  const [a, b, { bare }] = writers(t);
  for (const n of ['one', 'two']) assert.equal(cli(NEW(n), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hook = join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "rejected: origin down" >&2\nexit 1\n'); chmodSync(hook, 0o755);
  assert.equal(cli(['update', '1', '--append', 'first note'], { cwd: a.cons, tmp: a.tmp }).status, 3); // rolled back, never left unpublished
  rmSync(hook);
  assert.equal(cli(NEW('three'), { cwd: b.cons, tmp: b.tmp }).status, 0); // another clone pushes meanwhile
  const q = cli(['list', 'all-branches'], { cwd: a.cons, tmp: a.tmp }); // the leading pull rebases a's unpushed commit onto it
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.doesNotMatch(gitIn(a.home, 'branch', '--list'), /backlog-unmerged/);
  const w = cli(['update', '2', '--append', 'second note'], { cwd: a.cons, tmp: a.tmp });
  assert.equal(w.status, 0, w.stdout + w.stderr);
  const dir = join(clone(t, bare), 'acme', 'demo');
  assert.doesNotMatch(readFileSync(itemPath(dir, '001-one'), 'utf8'), /first note/);
  assert.match(readFileSync(itemPath(dir, '002-two'), 'utf8'), /second note/);
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
  const item = itemPath(a.folder, '001-one');
  changeItem(item, { body: readItem(item).body + '\npre-existing staged note\n' });
  gitIn(a.home, 'add', `acme/demo/${itemRel('001-one')}`);
  changeItem(item, { body: readItem(item).body + '\npre-existing unstaged note\n' });
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
  assert.ok(files.includes(`acme/demo/${itemRel('001-one')}`));
  assert.doesNotMatch(files, /failed-creation|new\/place|private.txt/);
  assert.doesNotMatch(gitIn(bare, 'show', `main:acme/demo/${itemRel('001-one')}`), /failed note/);
});

test('publication: legacy two-commit move with destination-only conflict is refused; explicit drop and retry publishes both folders', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('one'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const src = `acme/demo/${itemRel('001-one')}`; const dst = `new/place/${itemRel('001-one')}`;
  mkdirSync(join(b.home, 'new', 'place', 'phases'), { recursive: true }); gitIn(b.home, 'mv', src, dst);
  gitIn(b.home, 'add', '-A'); gitIn(b.home, 'commit', '-qm', 'legacy cross-repository move');
  store.addEvent(join(b.home, 'new', 'place'), itemRel('001-one'), { event: 'note', note: 'second legacy commit' });
  gitIn(b.home, 'add', '-A'); gitIn(b.home, 'commit', '-qm', 'second legacy commit');
  const hashes = gitIn(b.home, 'log', '--format=%h', 'origin/main..HEAD').split('\n');
  mkdirSync(join(a.home, 'new', 'place'), { recursive: true }); writeFileSync(join(a.home, 'new', 'place', 'upstream.txt'), 'destination-only change\n');
  gitIn(a.home, 'add', 'new/place'); gitIn(a.home, 'commit', '-qm', 'destination only'); gitIn(a.home, 'push', '-q');
  writeFileSync(join(b.home, 'private.txt'), 'do not publish'); gitIn(b.home, 'add', 'private.txt');
  const before = state(b.home); const remote = gitIn(bare, 'rev-parse', 'main');
  const refused = cli(['update', '1', '--append', 'must refuse'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(refused.status, 3, refused.stdout + refused.stderr);
  for (const hash of hashes) assert.ok(refused.stderr.includes(hash));
  assert.deepEqual(state(b.home), before); assert.equal(gitIn(bare, 'rev-parse', 'main'), remote);
  assert.deepEqual(gitIn(bare, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(p => p.endsWith(itemName('001-one'))), [src]);
  // The fixture explicitly drops the legacy stack; the CLI never chooses for the owner.
  gitIn(b.home, 'fetch', '-q', 'origin'); gitIn(b.home, 'reset', '--hard', 'origin/main');
  writeFileSync(join(b.home, 'private.txt'), 'do not publish'); gitIn(b.home, 'add', 'private.txt');
  const staged = gitIn(b.home, 'ls-files', '--stage', '--', 'private.txt');
  const hold = holdFirstPush(b);
  const move = cliAsync(['move', '1', '--to-repository', 'new/place'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  try {
    writeFileSync(join(a.home, 'new', 'place', 'upstream.txt'), 'destination changes again\n');
    gitIn(a.home, 'add', 'new/place'); gitIn(a.home, 'commit', '-qm', 'destination race'); gitIn(a.home, 'push', '-q');
  } finally { hold.release(); }
  const r = await move.done; assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(gitIn(bare, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(p => p.endsWith(itemName('001-one'))), [dst]);
  assert.equal(gitIn(b.home, 'rev-parse', 'HEAD'), gitIn(bare, 'rev-parse', 'main'));
  assert.equal(gitIn(b.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  assert.equal(gitIn(b.home, 'ls-files', '--stage', '--', 'private.txt'), staged);
  assert.doesNotMatch(gitIn(bare, 'ls-tree', '-r', '--name-only', 'main'), /private.txt/);
  const changed = gitIn(bare, 'diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-r', 'main');
  assert.match(changed, new RegExp(`D\\s+${reEscape(`acme/demo/${itemRel('001-one')}`)}`)); assert.match(changed, new RegExp(`A\\s+${reEscape(`new/place/${itemRel('001-one')}`)}`));
});

test('publication: permanent failure after a push race removes renumbering and retains all incoming remote files', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('anchor'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
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
    remote = cli([...NEW('other folder'), '--body', '## Definition of done\n- [ ] x'], { cwd: consumer(a.tmp, 'other', 'repo'), tmp: a.tmp }); // a file of another repository's folder
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
  assert.ok(existsSync(itemPath(b.folder, '001-alpha')));
  assert.ok(!existsSync(itemPath(join(b.home, 'acme', 'dst'), '001-alpha')));
  const set = cli(['update', '002-dependent', '--set-team', 't1'], { cwd: b.cons, tmp: b.tmp }); // the team views reach only the items of their team
  assert.equal(set.status, 0, set.stdout + set.stderr);
  for (const w of [a, b]) {
    writeFileSync(join(w.home, 'teams.json'), '{"t1": {}}'); // the team views need the team in the configuration
    const q = cli(['team', 'query', '--team', 't1', '--blocked', '--json'], { cwd: w.cons, tmp: w.tmp });
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
  assert.deepEqual(state(b.home), state(clone(t, bare)), 'the rejected sequence edit is rolled back');
  assert.deepEqual(store.load(b.folder).map(i => [i.fm.phase, i.fm.seq]), [['001-alpha', 1], ['002-beta', 2], ['003-gamma', 3]]);
  const q = cli(['list', 'all-branches', '--json'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(q.status, 0, q.stdout + q.stderr);
});

test('review P1: publication preflight rejecting a conflict marker restores starting files, database and staging', t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('alpha'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const item = itemPath(b.folder, '001-alpha');
  changeItem(item, { body: readItem(item).body + '\nprior staged note\n' });
  gitIn(b.home, 'add', `acme/demo/${itemRel('001-alpha')}`);
  changeItem(item, { body: readItem(item).body + '\nprior unstaged note\n' });
  writeFileSync(join(b.home, 'private.txt'), 'private staging');
  gitIn(b.home, 'add', 'private.txt');
  const before = state(b.home); const remote = gitIn(bare, 'rev-parse', 'main');
  // an item holds its text in JSON strings, so no text a command writes puts a marker at the start of a line: the marker is in another file of the folder
  writeFileSync(join(b.folder, 'conflict.json'), '<<<<<<< example\n'); gitIn(b.home, 'add', 'acme/demo/conflict.json'); const before2 = state(b.home);
  const r = cli(['update', '1', '--append', 'rejected note'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /conflicts/i);
  assert.deepEqual(state(b.home), before2, 'preflight failure restores the items, HEAD and index byte for byte');
  assert.equal(gitIn(bare, 'rev-parse', 'main'), remote, 'nothing was published');
  assert.ok(!existsSync(join(b.home, '.git', 'smooth-backlog-cli-journal.json')));
  gitIn(b.home, 'rm', '-q', '-f', 'acme/demo/conflict.json');
  const next = cli(['update', '1', '--append', 'valid follow-up'], { cwd: b.cons, tmp: b.tmp });
  assert.equal(next.status, 0, next.stdout + next.stderr);
  assert.doesNotMatch(gitIn(bare, 'show', `main:acme/demo/${itemRel('001-alpha')}`), /rejected note/);
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
  writeFileSync(join(b.home, 'teams.json'), '{"t1": {}}');
  assert.equal(cli(['team', 'query', '--team', 't1', '--blocked', '--json'], { cwd: b.cons, tmp: b.tmp }).status, 0);
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
// Rejection must remove the entire mutation (including its events), not park it for the next command.
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

test('publication identity: an upstream archived file cannot duplicate the slug of a written item', async t => {
  const [a, b, { bare }] = writers(t);
  assert.equal(cli(NEW('alpha'), { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  const hold = holdFirstPush(b);
  const second = cliAsync(['update', '1', '--append', 'rejected note'], { cwd: b.cons, tmp: b.tmp });
  await hold.held();
  try {
    const item = store.load(a.folder)[0];
    store.write({ path: archivedPath(a.folder, '099-other'), fm: { ...item.fm, seq: 99, status: 'archived' }, body: item.body }, a.folder);
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
      const file = itemPath(a.folder, '001-alpha');
      changeItem(file, { fm: { phase: '' } }); // an older file: its slug is its file name
      gitIn(a.home, 'commit', '-qam', 'an item without a phase field'); gitIn(a.home, 'push', '-q');
    } });
  rejectedPublication(t, b, bare, result, /depends on.*001-alpha/);
});

test('publication graph: an outgoing slug dependency is rechecked after an upstream move', async t => {
  const { b, bare, result } = await race(t, [NEW('alpha'), NEW('beta')],
    ['move', '2', '--to-repository', 'acme/dst'], ['update', '1', '--set-depends-on', '002-beta']);
  rejectedPublication(t, b, bare, result, /depends on missing item 002-beta/);
});

 // a team command acts as the session's agent
async function fileRace(t, seed, args, publish, env) {
  const [a, b, { bare }] = writers(t);
  for (const cmd of seed) assert.equal(cli(cmd, { cwd: a.cons, tmp: a.tmp }).status, 0);
  assert.equal(cli(['list', 'all-branches'], { cwd: b.cons, tmp: b.tmp }).status, 0);
  if (args[0] === 'team') copyFileSync(join(a.home, 'teams.json'), join(b.home, 'teams.json')); // the team entries are local configuration of each clone
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
    store.write({ path: archivedPath(a.folder, '005-other'), fm: { ...ENVELOPE, phase: '005-other', seq: 5, status: 'archived' }, body: '\narchived\n' }, a.folder);
  });
  rejectedPublication(t, b, bare, result, /seq.*5.*005-other/);
});

test('publication safety: upstream conflict markers abort an otherwise disjoint write', async t => {
  const { b, bare, result } = await fileRace(t, [NEW('alpha')], ['update', '1', '--append', 'rejected note'], a => {
    writeFileSync(join(a.folder, 'conflict.json'), '<<<<<<< upstream\nunfinished\n');
  });
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /unresolved conflicts/);
  assert.deepEqual(state(b.home), state(clone(t, bare)));
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
  // writers' t.after was registered first and runs first (hooks are FIFO): it settles the chain and removes the
  // folders, and only then does this hook check the ABSENCE of the chain — without the settle the chain is still
  // alive after the rmSync and this assertion fails (item 76 review: the absence was never checked)
  t.after(() => { assert.equal(scenarioPids(a.tmp).length, 0, 'the cleanup settled every child process of the killed CLI child (item 76)'); });
  assert.ok(scenarioPids(a.tmp).length >= 1, 'the child git process of the killed CLI child is still alive');
  void b;
});

test('cleanup settle: a child process that survives the settle is reported loudly, not removed silently (item 76 review)', async t => {
  const d = mkdtempSync(join(tmpdir(), 'dbconf-s-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  // a node child that traps SIGTERM and writes the ready file only after the trap is installed: the parent starts
  // the settle only after the ready file, so the settle's SIGTERM always hits a child that traps it - no start-up
  // race (item 76 review; the CI failure at cbc7324). The child lives until the test's explicit SIGKILL, so it is
  // alive for every assertion - the test controls its lifetime instead of relying on a race.
  const ready = join(d, 'ready');
  const child = spawn(process.execPath, ['-e',
    'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], ""); setTimeout(() => {}, 1e9)',
    ready], { env: { SMOOTH_BACKLOG_CLI_HOME: join(d, 'home') }, stdio: 'ignore' });
  child.unref();
  t.after(() => { try { child.kill('SIGKILL'); } catch {} });
  const exited = new Promise(res => child.once('exit', res));
  for (let i = 0; i < 100 && !existsSync(ready); i++) await sleep(50);
  assert.ok(existsSync(ready), 'the child traps SIGTERM before the settle starts (item 76 review)');
  assert.ok(scenarioPids(d).includes(child.pid), 'the SIGTERM-surviving child is visible to the settle');
  await assert.rejects(settleScenarioChildren(d, '/proc', 1), /still alive/);
  child.kill('SIGKILL');
  await exited;
  assert.equal(scenarioPids(d).length, 0);
});

test('cleanup: scenarioPids sees the processes carrying the fixture env (item 76 review)', async t => {
  const d = mkdtempSync(join(tmpdir(), 'dbconf-p-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  // a scan whose root is not a directory failed - it is not verified empty, it is reported loudly (item 76 review)
  const notADir = join(d, 'not-a-dir');
  writeFileSync(notADir, '');
  assert.throws(() => scenarioPids(d, notADir), /unreadable/, 'a failed process scan is not verified empty');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { env: { SMOOTH_BACKLOG_CLI_HOME: join(d, 'home') }, stdio: 'ignore' });
  child.unref();
  t.after(() => { try { child.kill('SIGKILL'); } catch {} });
  for (let i = 0; i < 100 && !scenarioPids(d).includes(child.pid); i++) await sleep(50);
  assert.ok(scenarioPids(d).includes(child.pid), 'a process carrying the fixture env is found through /proc');
  child.kill('SIGKILL');
});

// item 76: a fake process root for the settle and the scan: <root>/<pid>/environ, NUL-separated like /proc.
// The pid is above Linux's pid_max (4194304), so the settle's signals can never reach a real process.
const FAKE_PID = '9999999';
const fakeProc = (d, withEnv = true) => {
  const root = join(d, 'proc'); mkdirSync(join(root, FAKE_PID), { recursive: true });
  if (withEnv) writeFileSync(join(root, FAKE_PID, 'environ'), `PATH=/bin\0SMOOTH_BACKLOG_CLI_HOME=${join(d, 'home')}\0`);
  return root;
};

test('cleanup: a scan entry whose environ is gone (the process exited between the listing and the read: ENOENT, or ESRCH while the exit is in flight) is skipped, not fatal (item 76)', t => {
  const d = mkdtempSync(join(tmpdir(), 'dbconf-x-')); t.after(() => rmSync(d, { recursive: true, force: true }));
  const root = fakeProc(d, false);
  assert.deepStrictEqual(scenarioPids(d, root), []);
  writeFileSync(join(root, FAKE_PID, 'environ'), `SMOOTH_BACKLOG_CLI_HOME=${join(d, 'home')}\0`);
  assert.deepStrictEqual(scenarioPids(d, root), [Number(FAKE_PID)], 'the same entry with its environ is a scenario process');
});

test('cleanup settle: the settle ends only after two consecutive empty scans 100 ms apart, also when its rounds run out (item 76)', async t => {
  const d = mkdtempSync(join(tmpdir(), 'dbconf-y-')); t.after(() => rmSync(d, { recursive: true, force: true }));
  const root = fakeProc(d);
  setTimeout(() => rmSync(join(root, FAKE_PID), { recursive: true, force: true }), 30); // the process is gone during the first round's wait
  const start = Date.now();
  await settleScenarioChildren(d, root, 1); // one round: it sees the process, waits, then needs two empty scans 100 ms apart
  assert.ok(Date.now() - start >= 195, `the settle returned after ${Date.now() - start} ms: it did not wait for the second empty scan`);
  const start2 = Date.now();
  await settleScenarioChildren(d, root); // nothing to settle: two empty scans, 100 ms apart
  assert.ok(Date.now() - start2 >= 195, 'an empty scenario is settled only after two empty scans 100 ms apart');
});

test('cleanup: a folder the cleanup cannot remove fails loudly, naming what is left and the live scenario processes (item 76)', t => {
  const d = mkdtempSync(join(tmpdir(), 'dbconf-z-'));
  const locked = join(d, 'locked'); mkdirSync(locked); writeFileSync(join(locked, 'probe'), 'x'); chmodSync(locked, 0o500);
  t.after(() => { chmodSync(locked, 0o700); rmSync(d, { recursive: true, force: true }); });
  assert.throws(() => removeScenario(d), e => /^cleanup of .+ failed \(EACCES\): left .*probe.*; scenario processes still alive: none$/.test(e.message));
});
