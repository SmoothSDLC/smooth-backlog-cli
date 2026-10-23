// Tests for src/shared/move.js and src/shared/archive.js - cli-parity job 17 (MOVE): `backlog move` and `backlog archive`
// in shared mode. Oracles: move.py and archive.py run on a twin fixture. Both twins are seeded identically, the same command
// runs on each (python on one, the CLI on the other), and the printed lines, exit status, item files (also archive/), db rows
// and events of both folders, and the pushed commits must be identical (timestamps and the shas that hash them aside).
// Parity tests skip when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing. Local bare repos only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';
import { numberClash, pushedState, waitsForRunLock } from './shared-concurrency.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const oracle = py('move.py', ['--help']) !== null && py('archive.py', ['--help']) !== null;

// A shared home with consumer acme/demo (branches main and release on its origin) and seven items: four open (one in
// progress), two done, one foreign (it names other/proj). The folder other/proj holds item 001 already.
function seed({ permuteIds = false } = {}) {
  const t = mkdtempSync(join(tmpdir(), 'move-archive-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  git(cons, 'push', '-q', 'origin', 'HEAD:refs/heads/release');
  const folder = join(home, 'acme', 'demo');
  const other = join(home, 'other', 'proj');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const item = (dir, seq, name, extra = {}) => {
    const num = String(seq).padStart(3, '0');
    store.write({
      path: join(dir, `phases/${num}-${name}.md`),
      fm: {
        phase: `${num}-${name}`, seq, name: `Name ${name}`, objective: `Café ☕ ${name}`, summary: `sum ${name}`, status: 'pending',
        severity: 'normal', priority: seq - 1, repository: dir === folder ? 'acme/demo' : 'other/proj', branch: 'main', commit: '', location: '',
        created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z', depends_on: [], claimed_by: '', claimed_at: '', ...extra,
      },
      body: `\n# Phase ${num}\n\nBody of ${name}.\n`,
    }, dir);
  };
  item(folder, 1, 'alpha');
  item(folder, 2, 'beta');
  item(folder, 3, 'gamma', { status: 'in_progress' });
  item(folder, 4, 'delta', { branch: 'feature/x' });
  item(folder, 5, 'epsilon', { status: 'done', priority: 9, completed: '2026-10-02T00:00:00Z' });
  item(folder, 6, 'zeta', { status: 'done', priority: 9, completed: '2026-10-02T00:00:00Z' });
  item(folder, 7, 'eta', { repository: 'other/proj', priority: 9 });
  item(other, 1, 'first');
  for (const dir of [folder, other]) {
    const con = db.connect(dir);
    db.scan(con, dir);
    if (permuteIds && dir === folder) { // the row id of an item is no longer its number: 1 -> 2, 2 -> 3, 3 -> 1
      con.exec('UPDATE phase SET id = id + 100');
      con.exec('UPDATE phase SET id = CASE seq WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 1 ELSE id END');
    }
    con.close();
  }
  git(home, 'add', '-A');
  git(home, 'commit', '-q', '-m', 'fixture');
  git(home, 'push', '-q');
  return { t, home, cons, folder, other };
}

const TS = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g;
const norm = s => String(s).replace(TS, 'TS').replace(/[0-9a-f]{7}->[0-9a-f]{7}/g, 'SHA->SHA');
// The codec writes strings JSON-quoted (contract section 3) where PyYAML writes them plain: front matter is compared as
// parsed values in key order, the body byte for byte.
const doc = text => norm(JSON.stringify(parse(text)));
const names = (dir, sub) => (existsSync(join(dir, sub)) ? readdirSync(join(dir, sub), { recursive: true }).filter(n => n.endsWith('.md')).sort() : []);

function snapshotFolder(dir) {
  const files = {};
  for (const sub of ['phases', 'archive']) for (const n of names(dir, sub)) files[`${sub}/${n}`] = doc(readFileSync(join(dir, sub, n), 'utf8'));
  const con = db.connect(dir);
  const rows = x => con.prepare(x).all().map(r => norm(JSON.stringify({ ...r })));
  const out = {
    files,
    phases: rows('SELECT id, handoff_id, slug, seq, name, objective, summary, status, severity, priority, path, branch, commit_sha, location, repository, size_score, completed_at FROM phase ORDER BY id'),
    events: rows('SELECT handoff_id, phase_id, event, branch, commit_sha, note FROM event ORDER BY id'),
  };
  con.close();
  return out;
}
const snapshot = f => ({
  demo: snapshotFolder(f.folder),
  other: snapshotFolder(f.other),
  // move.py's scan of the target is a script of its own and commits alone ("other/proj: scan.py"); the CLI commits the move once
  log: git(f.home, 'log', '--format=%s').split('\n').filter(s => !s.endsWith(': scan.py')),
  origin: git(f.home, 'rev-parse', 'origin/main') === git(f.home, 'rev-parse', 'HEAD'),
});

// Runs the same command on both twins; asserts the same exit status, stdout, files, db and commits.
// loose: only the exit status and stdout (argparse texts are python's own).
// A write stamps `updated` to the second: a command that starts in the second of the previous one can rewrite a file
// byte-identically, and then no `reingested` event follows. Start each command in a fresh second.
let lastEnd = 0;
function pair(t, o, n, script, args, { loose = false } = {}) {
  while (Math.floor(Date.now() / 1000) === lastEnd) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  const ro = py(`${script}.py`, args, { cwd: o.cons, tmp: o.t });
  const rn = cli([script, ...args], { cwd: n.cons, tmp: n.t });
  assert.equal(rn.status, ro.status, `${script} ${args.join(' ')}: ${rn.stderr}`);
  assert.equal(norm(rn.stdout), norm(ro.stdout), args.join(' '));
  if (!loose) assert.equal(rn.stderr, ro.stderr, args.join(' '));
  assert.deepEqual(snapshot(n), snapshot(o), `${script} ${args.join(' ')}`);
  lastEnd = Math.floor(Date.now() / 1000);
  return rn;
}
function twins(t) {
  if (!oracle) { t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing'); return null; }
  return [seed(), seed()];
}
const run = (f, script, args) => cli([script, ...args], { cwd: f.cons, tmp: f.t });
const fm = (dir, rel) => parse(readFileSync(join(dir, rel), 'utf8'));
const pyJson = (f, script, args) => JSON.parse(py(script, args, { cwd: f.cons, tmp: f.t }).stdout);

// --- archive

test('archive of a done item matches archive.py: git mv, status stamp, db row, events, reflow', t => {
  const w = twins(t);
  if (!w) return;
  const r = pair(t, ...w, 'archive', ['5']);
  assert.match(r.stdout, /^📦 005-epsilon archived -> archive\/phases\/005-epsilon\.md\n {3}rescan: \d+ \(re\)ingested, 0 missing\n {3}📋 planning event: backlog re-densified to 5 item\(s\) \(P0\.\.P4\)\n$/);
  assert.equal(fm(w[1].folder, 'archive/phases/005-epsilon.md').fm.status, 'archived');
  assert.ok(!existsSync(join(w[1].folder, 'phases/005-epsilon.md')));
  assert.equal(git(w[1].home, 'log', '-1', '--format=%s'), 'acme/demo: archive.py 5');
  assert.equal(git(w[1].home, 'log', '-1', '--follow', '--format=%s', '--', 'acme/demo/archive/phases/005-epsilon.md'), 'acme/demo: archive.py 5');
  pair(t, ...w, 'archive', ['006-zeta']);
});

test('archive --force, an already archived item, refusals and --dry-run match archive.py', t => {
  const w = twins(t);
  if (!w) return;
  pair(t, ...w, 'archive', ['2']); // not done: refused
  pair(t, ...w, 'archive', ['99']);
  pair(t, ...w, 'archive', ['5', '--dry-run']);
  pair(t, ...w, 'archive', ['2', '--force', '--dry-run']);
  pair(t, ...w, 'archive', ['2', '--force']);
  pair(t, ...w, 'archive', ['2']); // already archived: ℹ️ line, exit 0
  pair(t, ...w, 'archive', ['002-beta']);
  pair(t, ...w, 'archive', ['3', '--force']);
  pair(t, ...w, 'archive', [], { loose: true });
  pair(t, ...w, 'archive', ['1', '--bogus'], { loose: true });
});

test('after a Node archive, Python query.py --status no longer lists the item as open and archive/phases holds it', t => {
  if (!oracle) return t.skip('Python backlog skill oracle not configured');
  const f = seed();
  const row = () => pyJson(f, 'query.py', ['--status', '--json']).phases.find(p => p.slug === '002-beta'); // query.py lists archived items last
  assert.deepEqual([row().status, row().path], ['pending', 'phases/002-beta.md']);
  const r = run(f, 'archive', ['2', '--force']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([row().status, row().path], ['archived', 'archive/phases/002-beta.md']);
  assert.ok(py('query.py', ['--next', '--json'], { cwd: f.cons, tmp: f.t }).stdout.indexOf('002-beta') < 0);
  assert.deepEqual(names(f.folder, 'archive'), ['phases/002-beta.md']);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
});

test('archive finds the item by number, never by database row id', () => {
  const f = seed({ permuteIds: true });
  const r = run(f, 'archive', ['1', '--force']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^📦 001-alpha archived/);
  assert.ok(existsSync(join(f.folder, 'archive/phases/001-alpha.md')));
  assert.ok(existsSync(join(f.folder, 'phases/003-gamma.md')));
});

// --- move --to-branch

test('move --to-branch matches move.py; Python query.py --by-branch lists the item', t => {
  const w = twins(t);
  if (!w) return;
  const r = pair(t, ...w, 'move', ['2', '--to-branch', 'release']);
  assert.equal(r.stdout, "✅ 002-beta now belongs to branch 'release'\n");
  assert.match(py('query.py', ['--by-branch', 'release'], { cwd: w[1].cons, tmp: w[1].t }).stdout, /\b002-beta\b/);
  pair(t, ...w, 'move', ['001-alpha', '--to-branch', 'release', '--note', 'ship it ☕']);
  pair(t, ...w, 'move', ['4', '--to-branch=main']);
  pair(t, ...w, 'move', ['5', '--to-branch', 'release']); // a done item moves too
});

test('move --all-open-of-branch matches move.py', t => {
  const w = twins(t);
  if (!w) return;
  const r = pair(t, ...w, 'move', ['--all-open-of-branch', 'main', '--to-branch', 'release']);
  assert.equal(r.stdout, "✅ moved 3 open item(s) of 'main' to 'release'\n");
  pair(t, ...w, 'move', ['--all-open-of-branch', 'nothing', '--to-branch', 'release', '--note', 'x']);
  pair(t, ...w, 'move', ['--all-open-of-branch', 'release'], { loose: true });
});

test('move refusals and argument errors match move.py', t => {
  const w = twins(t);
  if (!w) return;
  pair(t, ...w, 'move', ['99', '--to-branch', 'release']);
  pair(t, ...w, 'move', ['2', '--to-repository']); // same repository
  pair(t, ...w, 'move', ['2', '--to-repository', 'acme/demo']);
  pair(t, ...w, 'move', [], { loose: true });
  pair(t, ...w, 'move', ['2'], { loose: true });
  pair(t, ...w, 'move', ['2', '3', '--to-branch', 'release'], { loose: true });
});

test('a branch missing on the origin of the consuming repository is refused, nothing changes', () => {
  const f = seed();
  const before = snapshot(f);
  const logBefore = git(f.home, 'rev-parse', 'HEAD');
  for (const args of [['2', '--to-branch', 'nope'], ['--all-open-of-branch', 'main', '--to-branch', 'nope']]) {
    const r = run(f, 'move', args);
    assert.equal(r.status, 1, args.join(' '));
    assert.equal(r.stdout, "❌ branch 'nope' does not exist on the origin of acme/demo; push it first or name an existing branch\n");
  }
  assert.deepEqual(snapshot(f), before);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), logBefore);
});

test('an origin that cannot be read refuses the move', () => {
  const f = seed();
  git(f.cons, 'remote', 'set-url', 'origin', join(f.t, 'missing', 'acme', 'demo.git'));
  const r = run(f, 'move', ['2', '--to-branch', 'release']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^❌ could not read the branches of the origin of acme\/demo/);
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.branch, 'main');
});

// --- move --to-repository

test('move --to-repository matches move.py: new number in the target, events copied, source row removed', t => {
  const w = twins(t);
  if (!w) return;
  const r = pair(t, ...w, 'move', ['7', '--to-repository']); // default: the repository the item names
  assert.equal(r.stdout, '✅ 007-eta moved to other/proj as 002-eta\n');
  assert.ok(existsSync(join(w[1].other, 'phases/002-eta.md')));
  assert.ok(!existsSync(join(w[1].folder, 'phases/007-eta.md')));
  const log = git(w[1].home, 'log', '-2', '--format=%s').split('\n');
  assert.deepEqual(log, ['acme/demo: move.py 7 --to-repository', 'other/proj: move.py 007-eta in from acme/demo']);
  assert.equal(git(w[1].home, 'rev-parse', 'origin/main'), git(w[1].home, 'rev-parse', 'HEAD'));
  pair(t, ...w, 'move', ['3', '--to-repository', 'other/proj']);
  pair(t, ...w, 'move', ['4', '--to-repository', 'new/place']); // a folder that does not exist yet
});

test('a target that is not a plain owner/name is refused before anything is written', () => {
  const f = seed();
  const before = snapshot(f);
  for (const target of ['../evil', 'a/b/c', 'solo', '/abs/path', 'a/..', 'a\\b']) {
    const r = run(f, 'move', ['2', '--to-repository', target]);
    assert.equal(r.status, 2, target);
    assert.match(r.stderr, /owner\/name/);
  }
  assert.deepEqual(snapshot(f), before);
  assert.ok(!existsSync(join(f.home, 'evil')));
});

test('diagnostics that echo the input are redacted', () => {
  const f = seed();
  for (const script of ['move', 'archive']) {
    const r = run(f, script, ['https://user:s3cret@host/x']);
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stdout + r.stderr, /s3cret/);
    const u = run(f, script, ['2', '--bogus=user:s3cret@host']);
    assert.equal(u.status, 2);
    assert.doesNotMatch(u.stdout + u.stderr, /s3cret/);
  }
});

// ---------------------------------------------------------------- review fixes (Codex review 2026-10-23, job 17)

test('review P1: a symlink at archive/ or archive/phases/ refuses the archive before anything is moved or stamped', t => {
  for (const nested of [false, true]) {
    const f = seed();
    const outside = join(f.t, 'outside');
    mkdirSync(outside);
    try {
      if (nested) { mkdirSync(join(f.folder, 'archive')); symlinkSync(outside, join(f.folder, 'archive', 'phases')); } else symlinkSync(outside, join(f.folder, 'archive'));
    } catch (e) { t.skip(`cannot create a symlink here: ${e.code}`); return; }
    const source = readFileSync(join(f.folder, 'phases', '005-epsilon.md'), 'utf8');
    const r = run(f, 'archive', ['5']);
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stdout + r.stderr, /Symlink destination is unsupported/);
    assert.deepEqual(readdirSync(outside), [], 'nothing was written outside the repository');
    assert.equal(readFileSync(join(f.folder, 'phases', '005-epsilon.md'), 'utf8'), source, 'the source file stays as it was, unstamped');
  }
});

test('review P1: a database slug that leaves phases/ ("007-../../001-first") is refused before the target is written', () => {
  const f = seed();
  const con = db.connect(f.folder); con.exec("UPDATE phase SET slug='007-../../001-first' WHERE seq=7"); con.close();
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'evil slug'); git(f.home, 'push', '-q');
  const victim = join(f.other, 'phases', '001-first.md');
  const before = readFileSync(victim, 'utf8');
  const r = run(f, 'move', ['7', '--to-repository']);
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stdout + r.stderr, /plain item name/);
  assert.equal(readFileSync(victim, 'utf8'), before, 'the existing item of the target is unchanged');
  assert.deepEqual(names(f.other, 'phases'), ['001-first.md']);
  assert.ok(existsSync(join(f.folder, 'phases', '007-eta.md')), 'the source item stays');
});

test('review P1: archive and move hold the per-repository run lock from the pull to the push', async () => {
  const f = seed();
  const a = await waitsForRunLock(f, ['archive', '5'], () => existsSync(join(f.folder, 'phases', '005-epsilon.md')));
  assert.deepEqual(a.during, { exited: false, same: true }, 'archive waits while another command holds the lock');
  assert.equal(a.result.status, 0, a.result.stderr);
  assert.ok(!existsSync(join(f.folder, 'phases', '005-epsilon.md')) && existsSync(join(f.folder, 'archive', 'phases', '005-epsilon.md')));
  const m = await waitsForRunLock(f, ['move', '2', '--to-branch', 'release'], () => fm(f.folder, 'phases/002-beta.md').fm.branch);
  assert.deepEqual(m.during, { exited: false, same: true }, 'move waits while another command holds the lock');
  assert.equal(m.result.status, 0, m.result.stderr);
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.branch, 'release');
});

for (const [title, script, args] of [['archive', 'archive', ['5']], ['move --to-branch', 'move', ['2', '--to-branch', 'release']]]) {
  test(`review P1: ${title} commits and pushes the rescan after a renumbering (checked from a fresh clone)`, () => {
    const f = seed();
    numberClash(f);
    const r = run(f, script, args);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /renumbered 008 -> 009/);
    assert.equal(git(f.home, 'status', '--porcelain'), '', 'the rescanned backlog.db is committed');
    assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
    const pushed = pushedState(f);
    assert.ok(pushed.slugs.includes('009-local') && !pushed.slugs.includes('008-local'), pushed.slugs.join());
    assert.ok(pushed.files.includes('phases/009-local.md'));
  });
}

test('review P2: archive with a ghost row (a pending mirror row whose file is gone) ranks it like archive.py: the survivors keep their ranks', t => {
  const ghost = f => { git(f.home, 'rm', '-q', 'acme/demo/phases/001-alpha.md'); git(f.home, 'commit', '-q', '-m', 'file gone'); git(f.home, 'push', '-q'); };
  const f = seed(); ghost(f);
  const r = run(f, 'archive', ['5']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.priority, 1, 'the ghost still holds P0');
  assert.deepEqual(['003-gamma', '004-delta', '007-eta'].map(n => fm(f.folder, `phases/${n}.md`).fm.priority), [2, 3, 4]);
  assert.match(r.stdout, /re-densified to 5 item\(s\) \(P0\.\.P4\)/, 'the ghost row is counted');
  const w = twins(t);
  if (!w) return;
  ghost(w[0]); ghost(w[1]);
  pair(t, ...w, 'archive', ['5']);
});

test('review P2: move accepts --note="two words" (an option with a value, not a positional)', () => {
  const f = seed();
  const r = run(f, 'move', ['2', '--to-branch=release', '--note=because it is ready']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.branch, 'release');
});
