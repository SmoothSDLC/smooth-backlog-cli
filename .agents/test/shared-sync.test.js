// Tests for src/shared/sync.js — cli-parity job 8 (SYNC: pull, commit and push of the shared
// backlog repository). Oracle: lib_db.py:101-110 (pull), 275-309 (commit), the pinned ec5b254e.
// Tests use only local bare repos from shared-fixtures.js (job 1), with BACKLOG_HOME and
// XDG_CONFIG_HOME inside the test's temp dir — never the real backlog repository or ~/.config.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumer, env, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

// A fixture: the bare origin, two clones of it (home, home2) and the folder acme/demo in each.
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [k, v] of Object.entries(GIT_IDENTITY)) { const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; }); }
  const home = sharedBacklog(dir);
  const bare = join(dir, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git');
  const home2 = join(dir, 'home2');
  git(dir, 'clone', '-q', bare, home2);
  return { dir, bare, home, home2, folder: join(home, 'acme', 'demo'), folder2: join(home2, 'acme', 'demo') };
}

const pad = n => String(n).padStart(3, '0');
function putItem(folder, seq, name, extra = {}) {
  const phase = `${pad(seq)}-${name}`;
  store.write({
    path: join(folder, 'phases', `${phase}.md`),
    fm: { phase, seq, name, status: 'pending', repository: 'acme/demo', branch: 'main', ...extra },
    body: `\n# Phase ${pad(seq)} — ${name}\n\n**Objective:** x\n`,
  });
  return phase;
}
const seqs = (bare, dir) => { // the phases on the bare's main: [{file, seq}]
  const clone = mkdtempSync(join(dir, 'verify-'));
  git(dir, 'clone', '-q', bare, clone);
  return readdirSync(join(clone, 'acme', 'demo', 'phases')).sort().map(f => ({ file: f, seq: store.load(join(clone, 'acme', 'demo')).find(i => i.path === `phases/${f}`).fm.seq }));
};
const captureStdout = async fn => {
  const write = process.stdout.write; let out = '';
  process.stdout.write = c => { out += c; return true; };
  try { return { result: await fn(), out }; } finally { process.stdout.write = write; }
};
const rejects3 = async (promise, pattern) => {
  const e = await promise.then(() => null, x => x);
  assert.ok(e, 'expected a failure');
  assert.equal(e.exitCode, 3);
  assert.match(e.message, pattern);
  return e;
};

test('pull: fetches what another clone pushed, and the lock file is gone afterwards', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha');
  await sync.commit(f.home2, f.folder2, 'new_phase.py --name alpha');
  await sync.pull(f.home);
  assert.ok(existsSync(join(f.folder, 'phases', '001-alpha.md')));
  assert.equal(existsSync(join(f.home, '.git', 'smooth-backlog-cli.lock')), false);
});

test('pull: a failing pull aborts the rebase and exits 3; an unmergeable local commit is parked on a branch (lib_db.py message, beyond parity)', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'mine');
  mkdirSync(f.folder2, { recursive: true });
  writeFileSync(join(f.folder, 'README'), 'a\n'); writeFileSync(join(f.folder2, 'README'), 'b\n');
  git(f.home2, 'add', '-A'); git(f.home2, 'commit', '-qm', 'b'); git(f.home2, 'push', '-q');
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'a'); // conflicts with b on acme/demo/README
  const e = await rejects3(sync.pull(f.home), /^could not update .* from origin\/main \(.*\); nothing was read or changed, because an unpushed local commit conflicts: .*parked on branch backlog-unmerged-\d{8}T\d{6}Z .*Then run the command again$/s);
  assert.ok(e.message.includes(f.home));
  assert.equal(existsSync(join(f.home, '.git', 'rebase-merge')) || existsSync(join(f.home, '.git', 'rebase-apply')), false);
  assert.equal(existsSync(join(f.home, '.git', 'smooth-backlog-cli.lock')), false);
});

test('commit: commits "<owner>/<name>: <message>" and pushes; nothing staged means no empty commit', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  assert.deepEqual(await sync.commit(f.home, f.folder, 'new_phase.py --name alpha'), []);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new_phase.py --name alpha');
  const before = git(f.bare, 'rev-parse', 'main');
  await sync.commit(f.home, f.folder, 'again');
  assert.equal(git(f.bare, 'rev-parse', 'main'), before);
});

test('commit: stages only the repository folder', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  writeFileSync(join(f.home, 'stray.txt'), 'x');
  await sync.commit(f.home, f.folder, 'm');
  assert.equal(git(f.home, 'ls-files', '--others', '--exclude-standard'), 'stray.txt');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('stray.txt'), false);
});

test('two clones create at once: both items reach the bare with different numbers', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 1, 'beta');
  await Promise.all([sync.commit(f.home, f.folder, 'new alpha'), sync.commit(f.home2, f.folder2, 'new beta')]);
  const got = seqs(f.bare, f.dir);
  assert.equal(got.length, 2);
  assert.deepEqual(got.map(g => g.seq).sort(), [1, 2]);
});

test('renumber: the later pusher gets nextSeq in file name, phase, seq and heading, and says so', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 1, 'beta');
  await sync.commit(f.home, f.folder, 'new alpha');
  const { result, out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'new beta'));
  assert.equal(out, 'renumbered 001 -> 002\n');
  assert.deepEqual(result, [[1, 2]]);
  const beta = store.load(f.folder2).find(i => i.fm.name === 'beta');
  assert.equal(beta.path, 'phases/002-beta.md');
  assert.equal(beta.fm.phase, '002-beta'); assert.equal(beta.fm.seq, 2);
  assert.match(beta.body, /^\n# Phase 002 — beta\n/);
  assert.equal(existsSync(join(f.folder2, 'phases', '001-beta.md')), false);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new beta'); // amended, same message
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '3'); // init, alpha, beta: no extra commit
  assert.deepEqual(seqs(f.bare, f.dir), [{ file: '001-alpha.md', seq: 1 }, { file: '002-beta.md', seq: 2 }]);
});

test('renumber: skips numbers already taken', async t => {
  const f = fixture(t);
  store.write({ path: join(f.folder, 'archive', 'phases', '001-old.md'), fm: { phase: '001-old', seq: 1, name: 'old', status: 'archived' }, body: 'b\n' });
  store.write({ path: join(f.folder, 'phases', '002-two.md'), fm: { phase: '002-two', seq: 2, name: 'two', status: 'pending' }, body: 'b\n' });
  await sync.commit(f.home, f.folder, 'seed');
  await sync.pull(f.home2);
  putItem(f.folder, 3, 'gamma'); await sync.commit(f.home, f.folder, 'gamma'); // 3 is taken on the bare
  putItem(f.folder2, 3, 'delta'); // the clone picked 3 before it saw gamma
  const { out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'delta'));
  assert.equal(out, 'renumbered 003 -> 004\n');
});

test('renumber: a stale creation that collides only with an ARCHIVED item is renumbered', async t => {
  const f = fixture(t);
  store.write({ path: join(f.folder, 'archive', 'phases', '001-old.md'), fm: { phase: '001-old', seq: 1, name: 'old', status: 'archived' }, body: 'b\n' });
  await sync.commit(f.home, f.folder, 'archive old'); // home2 was cloned before this
  putItem(f.folder2, 1, 'delta'); // the stale clone picked 1
  const { result, out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'new delta'));
  assert.equal(out, 'renumbered 001 -> 002\n');
  assert.deepEqual(result, [[1, 2]]);
  const delta = store.load(f.folder2).find(i => i.fm.name === 'delta');
  assert.equal(delta.path, 'phases/002-delta.md');
  assert.equal(delta.fm.phase, '002-delta'); assert.equal(delta.fm.seq, 2);
  assert.match(delta.body, /^\n# Phase 002 — delta\n/);
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main'), 'acme/demo/archive/phases/001-old.md\nacme/demo/phases/002-delta.md');
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new delta');
});

test('a distinct number is left alone: no renumber, nothing printed', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 2, 'beta');
  await sync.commit(f.home, f.folder, 'a');
  const { result, out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'b'));
  assert.deepEqual(result, []); assert.equal(out, '');
});

// --- genuinely overlapping Node and Python (new_phase.py) writers, ordered by a gate in the bare's pre-receive hook:
// the first push to arrive blocks until the test releases it; every later push passes.
function gate(f) {
  const dir = join(f.dir, 'gate'); mkdirSync(dir);
  const hook = join(f.bare, 'hooks', 'pre-receive');
  writeFileSync(hook, `#!/bin/sh\nif mkdir ${JSON.stringify(join(dir, 'entered'))} 2>/dev/null; then\n  while [ ! -e ${JSON.stringify(join(dir, 'release'))} ]; do sleep 0.05; done\nfi\nexit 0\n`);
  chmodSync(hook, 0o755);
  return {
    async entered() { for (let i = 0; i < 400 && !existsSync(join(dir, 'entered')); i++) await sleep(25); assert.ok(existsSync(join(dir, 'entered')), 'a push reached the gate'); },
    release() { writeFileSync(join(dir, 'release'), ''); },
  };
}
const scripts = process.env.SMOOTH_BACKLOG_SCRIPTS || join(process.env.HOME || '', 'git', 'smoothsdlc-backlog', 'skill', 'backlog', 'scripts');
const oracle = () => existsSync(join(scripts, 'new_phase.py')) && spawnSync('python3', ['-c', 'import yaml'], { stdio: 'ignore' }).status === 0;
const pyNewPhase = (f, home, cons) => new Promise(done => { // async: new_phase.py runs while Node is mid-commit; it needs a resolved BACKLOG_HOME (lib_db.py:453)
  const p = spawn('python3', [join(scripts, 'new_phase.py'), '--name', 'Pyitem', '--objective', 'o', '--summary', 's', '--depends-on', 'none'],
    { cwd: cons, env: { ...process.env, ...env(f.dir), BACKLOG_HOME: realpathSync(home) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', c => { out += c; }); p.stderr.on('data', c => { out += c; });
  p.on('close', status => done({ status, out }));
});

test('Python first, overlapping: Node (stale clone) is held at its push while new_phase.py creates and pushes 1; Node ends renumbered to 2', async t => {
  const f = fixture(t);
  if (!oracle()) { t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing'); return; }
  const cons = consumer(f.dir, 'acme', 'demo', 'main');
  const g = gate(f);
  putItem(f.folder2, 1, 'nodeitem');
  const node = sync.commit(f.home2, f.folder2, 'new nodeitem');
  await g.entered(); // Node has committed locally and is inside its first push
  const r = await pyNewPhase(f, f.home, cons);
  assert.equal(r.status, 0, r.out);
  g.release();
  assert.deepEqual(await node, [[1, 2]]);
  assert.deepEqual(seqs(f.bare, f.dir), [{ file: '001-pyitem.md', seq: 1 }, { file: '002-nodeitem.md', seq: 2 }]);
});

test('Node first, overlapping: Node has scanned backlog.db and is held at its push while new_phase.py takes the next number', async t => {
  const f = fixture(t);
  if (!oracle()) { t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing'); return; }
  const cons = consumer(f.dir, 'acme', 'demo', 'main');
  const g = gate(f);
  putItem(f.folder, 1, 'nodeitem');
  const mirror = db.connect(f.folder); try { db.scan(mirror, f.folder); } finally { mirror.close(); } // Python numbers from MAX(seq) of backlog.db
  const node = sync.commit(f.home, f.folder, 'new nodeitem');
  await g.entered();
  const r = await pyNewPhase(f, f.home, cons);
  assert.equal(r.status, 0, r.out);
  g.release();
  assert.deepEqual(await node, []);
  assert.deepEqual(seqs(f.bare, f.dir), [{ file: '001-nodeitem.md', seq: 1 }, { file: '002-pyitem.md', seq: 2 }]);
});

test('a bare that refuses pushes: exit 3 with the committed-but-not-pushed message; the change stays committed; a token URL is never printed', async t => {
  const f = fixture(t);
  const hook = join(f.bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "read-only: see https://user:SECRETTOKEN@example.com/x.git" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  putItem(f.folder, 1, 'alpha');
  const e = await rejects3(sync.commit(f.home, f.folder, 'new alpha'), /^the change is committed in .* but NOT on origin\/main \(push failed: .*read-only.*\)\. It is not recorded until it is pushed: fix the cause and run 'git -C .* pull --rebase && git -C .* push'$/s);
  assert.equal(e.message.includes('SECRETTOKEN'), false);
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), 'acme/demo: new alpha');
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '1');
});

test('an index.lock held for a moment is retried', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  const lock = join(f.home, '.git', 'index.lock');
  writeFileSync(lock, '');
  setTimeout(() => rmSync(lock, { force: true }), 700);
  await sync.commit(f.home, f.folder, 'new alpha');
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new alpha');
});

test('a folder outside the home is refused before git runs', async t => {
  const f = fixture(t);
  await assert.rejects(sync.commit(f.home, join(f.dir, 'elsewhere'), 'm'));
});

// --- review fixes (job 8)
const withFakeGit = (t, dir, failCommand, nth = 1) => { // `git <failCommand>` fails from its nth call on; everything else runs the real git
  if (process.platform === 'win32') return false;
  const bin = join(dir, 'fakebin'); mkdirSync(bin);
  const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nif [ "$1" = "${failCommand}" ]; then\n  n=$(cat "${dir}/count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${dir}/count"\n  if [ "$n" -ge ${nth} ]; then echo "boom" >&2; exit 1; fi\nfi\nexec "${real}" "$@"\n`);
  chmodSync(join(bin, 'git'), 0o755);
  const old = process.env.PATH; process.env.PATH = `${bin}:${old}`; t.after(() => { process.env.PATH = old; });
  return true;
};

test('commit: a folder with wildcard characters stages only itself, not the sibling folders it would match', async t => {
  const f = fixture(t);
  const star = join(f.home, 'acme', '*');
  putItem(star, 1, 'alpha');
  putItem(f.folder, 1, 'sibling'); // acme/demo: changed, but not this commit's folder
  await sync.commit(f.home, star, 'm');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main'), 'acme/*/phases/001-alpha.md');
  assert.equal(git(f.home, 'ls-files', '--others', '--exclude-standard'), 'acme/demo/phases/001-sibling.md');
});

test('commit: a failing git add is an error (exit 3), not a silent push without the change', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  if (!withFakeGit(t, f.dir, 'add')) return t.skip('needs a POSIX shell');
  await rejects3(sync.commit(f.home, f.folder, 'new alpha'), /could not stage acme\/demo in .*boom/s);
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '1');
});

test('renumber: a failing git mv, or a failing git add of the renamed file, is an error (exit 3)', async t => {
  for (const [command, nth, pattern] of [['mv', 1, /could not move .*boom/s], ['add', 2, /could not stage .*boom/s]]) {
    const path = process.env.PATH; t.after(() => { process.env.PATH = path; }); // one fake git per round
    process.env.PATH = path;
    const f = fixture(t);
    putItem(f.folder, 1, 'alpha'); putItem(f.folder2, 1, 'beta');
    await sync.commit(f.home, f.folder, 'new alpha');
    if (!withFakeGit(t, f.dir, command, nth)) return t.skip('needs a POSIX shell');
    await rejects3(sync.commit(f.home2, f.folder2, 'new beta'), pattern);
    assert.equal(git(f.bare, 'rev-list', '--count', 'main'), '2', command); // beta never reached the bare
    process.env.PATH = path;
  }
});

test('add/add: two clones create the same numbered file name with different bodies; both reach the bare, the later one renumbered', async t => {
  const f = fixture(t);
  const make = (folder, body) => store.write({ path: join(folder, 'phases', '001-alpha.md'), fm: { phase: '001-alpha', seq: 1, name: 'alpha', status: 'pending', repository: 'acme/demo', branch: 'main' }, body });
  make(f.folder, '\n# Phase 001 — alpha\n\nfirst body\n');
  make(f.folder2, '\n# Phase 001 — alpha\n\nsecond body\n');
  await sync.commit(f.home, f.folder, 'new alpha');
  const { result, out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'new alpha again'));
  assert.equal(out, 'renumbered 001 -> 002\n');
  assert.deepEqual(result, [[1, 2]]);
  const clone = mkdtempSync(join(f.dir, 'verify-')); git(f.dir, 'clone', '-q', f.bare, clone);
  const items = store.load(join(clone, 'acme', 'demo'));
  assert.deepEqual(items.map(i => [i.path, i.fm.seq, i.fm.phase]), [['phases/001-alpha.md', 1, '001-alpha'], ['phases/002-alpha.md', 2, '002-alpha']]);
  assert.match(items[0].body, /first body/); assert.doesNotMatch(items[0].body, /second body/);
  assert.match(items[1].body, /^\n# Phase 002 — alpha\n\nsecond body\n/);
  assert.equal(git(f.bare, 'log', '-1', '--format=%s', 'main'), 'acme/demo: new alpha again');
  assert.equal(existsSync(join(f.home2, '.git', 'rebase-merge')) || existsSync(join(f.home2, '.git', 'rebase-apply')), false);
});

test('add/add: a conflict on anything else still aborts the rebase and exits 3', async t => {
  const f = fixture(t);
  mkdirSync(f.folder2, { recursive: true }); mkdirSync(f.folder, { recursive: true });
  writeFileSync(join(f.folder, 'README'), 'a\n'); writeFileSync(join(f.folder2, 'README'), 'b\n');
  await sync.commit(f.home, f.folder, 'a');
  await rejects3(sync.commit(f.home2, f.folder2, 'b'), /NOT on origin\/main: it conflicts with origin\/main in .*parked on branch backlog-unmerged-/);
  assert.equal(existsSync(join(f.home2, '.git', 'rebase-merge')) || existsSync(join(f.home2, '.git', 'rebase-apply')), false);
});

test('review: renumbering a local item remaps the LOCAL references to it (number and slug, split-from), never upstream\'s (pull path)', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha'); putItem(f.folder2, 4, 'eta', { depends_on: [1] }); // upstream: its own 1 is alpha
  await sync.commit(f.home2, f.folder2, 'upstream');
  putItem(f.folder, 1, 'beta'); putItem(f.folder, 2, 'gamma', { depends_on: [1] });
  const delta = putItem(f.folder, 3, 'delta', { depends_on: ['001-beta'] });
  store.write({ path: join(f.folder, 'phases', `${delta}.md`), fm: { ...store.load(f.folder).find(i => i.fm.phase === delta).fm }, body: '\n# Phase 003 — delta\n\n## Split from `001-beta`. Inherited context:\n' });
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'acme/demo: local'); // never pushed
  const write = process.stderr.write; process.stderr.write = () => true;
  try { await captureStdout(() => sync.pull(f.home)); } finally { process.stderr.write = write; }
  const by = name => store.load(f.folder).find(i => i.fm.name === name);
  assert.equal(by('beta').fm.seq, 5);
  assert.deepEqual(by('gamma').fm.depends_on, [5]);
  assert.deepEqual(by('delta').fm.depends_on, ['005-beta']);
  assert.match(by('delta').body, /Split from `005-beta`/);
  assert.deepEqual(by('eta').fm.depends_on, [1], "upstream's reference to its own item 1 keeps its number");
  assert.equal(git(f.home, 'status', '--porcelain'), '');
});

test('review: the same remap on the add/add recovery of a push', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha', { summary: 'upstream' });
  await sync.commit(f.home2, f.folder2, 'upstream');
  putItem(f.folder, 1, 'alpha', { summary: 'local' }); // the same file name: add/add
  putItem(f.folder, 2, 'gamma', { depends_on: [1] }); putItem(f.folder, 3, 'delta', { depends_on: ['001-alpha'] });
  const write = process.stdout.write; process.stdout.write = () => true;
  try { await sync.commit(f.home, f.folder, 'local'); } finally { process.stdout.write = write; }
  const by = name => store.load(f.folder).find(i => i.fm.name === name);
  const moved = store.load(f.folder).find(i => i.fm.summary === 'local');
  assert.equal(moved.fm.seq, 4);
  assert.deepEqual(by('gamma').fm.depends_on, [4]);
  assert.deepEqual(by('delta').fm.depends_on, ['004-alpha']);
  assert.equal(by('alpha') ? 1 : 0, 1);
});

test('pull: repairs a sequence collision with an outstanding local commit (message on stderr, stdout stays clean)', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha'); await sync.commit(f.home2, f.folder2, 'new alpha'); // another writer's creation, on the bare
  putItem(f.folder, 1, 'beta');
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'acme/demo: new beta'); // committed locally, never pushed
  const write = process.stderr.write; let err = '';
  process.stderr.write = c => { err += c; return true; };
  let captured;
  try { captured = await captureStdout(() => sync.pull(f.home)); } finally { process.stderr.write = write; }
  assert.equal(captured.out, ''); assert.equal(err, 'renumbered 001 -> 002\n');
  const beta = store.load(f.folder).find(i => i.fm.name === 'beta');
  assert.equal(beta.path, 'phases/002-beta.md'); assert.equal(beta.fm.seq, 2);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  await sync.commit(f.home, f.folder, 'nothing more'); // the outstanding commit is pushed with its repaired number
  assert.deepEqual(seqs(f.bare, f.dir), [{ file: '001-alpha.md', seq: 1 }, { file: '002-beta.md', seq: 2 }]);
});

// Review fixes (second review).
test('add/add: several conflicting additions whose front matter differs are all repaired (markers in another file do not stop the numbering)', async t => {
  const f = fixture(t);
  const make = (folder, seq, name, objective) => store.write({ path: join(folder, 'phases', `${pad(seq)}-${name}.md`), fm: { phase: `${pad(seq)}-${name}`, seq, name, objective, status: 'pending', repository: 'acme/demo', branch: 'main' }, body: `\n# Phase ${pad(seq)} — ${name}\n` });
  for (const [folder, who] of [[f.folder, 'first'], [f.folder2, 'second']]) { make(folder, 1, 'alpha', `${who} alpha`); make(folder, 2, 'beta', `${who} beta`); }
  await sync.commit(f.home, f.folder, 'new alpha and beta');
  const { out } = await captureStdout(() => sync.commit(f.home2, f.folder2, 'new alpha and beta again'));
  assert.equal(out, 'renumbered 001 -> 003\nrenumbered 002 -> 004\n');
  const clone = mkdtempSync(join(f.dir, 'verify-')); git(f.dir, 'clone', '-q', f.bare, clone);
  assert.deepEqual(store.load(join(clone, 'acme', 'demo')).map(i => [i.path, i.fm.seq, i.fm.objective]), [
    ['phases/001-alpha.md', 1, 'first alpha'], ['phases/002-beta.md', 2, 'first beta'], ['phases/003-alpha.md', 3, 'second alpha'], ['phases/004-beta.md', 4, 'second beta']]);
});

test('pull: a collision repair keeps an unstaged working edit uncommitted (and in the working tree)', async t => {
  const f = fixture(t);
  putItem(f.folder2, 1, 'alpha'); await sync.commit(f.home2, f.folder2, 'new alpha');
  putItem(f.folder, 1, 'beta');
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'acme/demo: new beta'); // committed locally, never pushed
  const file = join(f.folder, 'phases', '001-beta.md');
  writeFileSync(file, readFileSync(file, 'utf8') + '\nworking edit, not yet committed\n');
  const write = process.stderr.write; process.stderr.write = () => true;
  try { await sync.pull(f.home); } finally { process.stderr.write = write; }
  assert.equal(git(f.home, 'show', 'HEAD:acme/demo/phases/002-beta.md').includes('working edit'), false, 'the edit must not be in the commit');
  assert.equal(git(f.home, 'status', '--porcelain'), 'M acme/demo/phases/002-beta.md');
  assert.match(readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8'), /seq: 2[\s\S]*working edit, not yet committed/);
  assert.equal(git(f.home, 'stash', 'list'), '');
});

test('review P2: commit takes only the repository folder: a file staged elsewhere stays staged and off origin; deletions in the folder are committed', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'alpha');
  putItem(f.folder, 2, 'beta');
  await sync.commit(f.home, f.folder, 'seed');
  writeFileSync(join(f.home, 'stray.txt'), 'x');
  git(f.home, 'add', 'stray.txt');
  rmSync(join(f.folder, 'phases', '001-alpha.md'));
  putItem(f.folder, 3, 'gamma');
  await sync.commit(f.home, f.folder, 'second');
  const onOrigin = git(f.bare, 'ls-tree', '-r', '--name-only', 'main').split('\n');
  assert.equal(onOrigin.includes('stray.txt'), false, 'the unrelated staged file was pushed');
  assert.equal(onOrigin.includes('acme/demo/phases/001-alpha.md'), false, 'the deletion was not committed');
  assert.equal(onOrigin.includes('acme/demo/phases/003-gamma.md'), true);
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), 'stray.txt', 'still staged locally');
  // only a deletion, nothing else, in the folder
  rmSync(join(f.folder, 'phases', '002-beta.md'));
  await sync.commit(f.home, f.folder, 'third');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('002-beta'), false);
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), 'stray.txt');
});

test('review P2: recovery squashes an unpushed stack without publishing unrelated staged files', async t => {
  const f = fixture(t);
  putItem(f.folder, 1, 'anchor');
  let con = db.connect(f.folder); db.scan(con, f.folder); con.close();
  await sync.commit(f.home, f.folder, 'seed');
  await sync.pull(f.home2);
  for (const [seq, note] of [[2, 'local one'], [3, 'local two']]) {
    putItem(f.folder, seq, `local-${seq}`);
    con = db.connect(f.folder); db.scan(con, f.folder); db.logEvent(con, 'note', { note }); con.close();
    git(f.home, 'add', 'acme/demo'); git(f.home, 'commit', '-qm', note);
  }
  putItem(f.folder2, 4, 'remote');
  con = db.connect(f.folder2); db.scan(con, f.folder2); db.logEvent(con, 'note', { note: 'remote' }); con.close();
  await sync.commit(f.home2, f.folder2, 'remote');
  writeFileSync(join(f.home, 'stray.txt'), 'private staged work');
  git(f.home, 'add', 'stray.txt');
  const staged = git(f.home, 'ls-files', '--stage', '--', 'stray.txt');
  await sync.pull(f.home); // repairs the binary conflict and folds the two local commits into one
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '1');
  await sync.commit(f.home, f.folder, 'publish recovered stack');
  assert.equal(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').includes('stray.txt'), false);
  assert.equal(git(f.home, 'ls-files', '--stage', '--', 'stray.txt'), staged);
  assert.equal(readFileSync(join(f.home, 'stray.txt'), 'utf8'), 'private staged work');
  con = db.connect(f.folder);
  try { assert.deepEqual(con.prepare("SELECT note FROM event WHERE event='note' ORDER BY note").all().map(e => e.note), ['local one', 'local two', 'remote']); }
  finally { con.close(); }
});
