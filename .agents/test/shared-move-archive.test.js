// Tests for src/shared/move.js and src/shared/archive.js - cli-parity job 17 (MOVE): `backlog move` and `backlog archive`.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archivedPath, archivedRel, breakIndex, cli, consumer, itemPath, itemRel, sharedBacklog, GIT_IDENTITY, changeItem, itemNames, itemName, ENVELOPE } from './shared-fixtures.js';
import { cliAsync, numberClash, pushedState, waitsForRunLock } from './shared-concurrency.js';
import * as index from '../../src/shared/index.js';
import { parseItem as parse } from '../../src/shared/item-file.js';
import * as store from '../../src/shared/store.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// A shared home with consumer acme/demo (branches main and release on its origin) and seven items: four open (one in
// progress), two done, one foreign (it names other/proj). The folder other/proj holds item 001 already.
function seed() {
  const t = mkdtempSync(join(tmpdir(), 'move-archive-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  git(cons, 'push', '-q', 'origin', 'HEAD:refs/heads/release');
  const folder = join(home, 'acme', 'demo');
  const other = join(home, 'other', 'proj');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const item = (dir, seq, name, extra = {}) => {
    const num = String(seq).padStart(3, '0');
    store.write({
      path: itemPath(dir, `${num}-${name}`),
      fm: {
        ...ENVELOPE, phase: `${num}-${name}`, seq, name: `Name ${name}`, objective: `Café ☕ ${name}`, summary: `sum ${name}`, status: 'pending',
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
  git(home, 'add', '-A');
  git(home, 'commit', '-q', '-m', 'fixture');
  git(home, 'push', '-q');
  return { t, home, cons, folder, other };
}

const TS = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g;
const norm = s => String(s).replace(TS, 'TS').replace(/,?"updated_by":"[^"]*"/g, '').replace(/[0-9a-f]{7}->[0-9a-f]{7}/g, 'SHA->SHA');
const doc = text => norm(JSON.stringify(parse(text)));
const names = (dir, sub) => itemNames(dir, sub, true);

function snapshotFolder(dir) {
  const files = {};
  for (const sub of ['phases', 'archive']) for (const n of names(dir, sub)) files[`${sub}/${n}`] = doc(readFileSync(join(dir, sub, n), 'utf8'));
  const cols = ['id', 'handoff_id', 'slug', 'seq', 'name', 'objective', 'summary', 'status', 'severity', 'priority', 'path', 'branch', 'commit_sha', 'location', 'repository', 'size_score', 'completed_at'];
  return { files, phases: index.rows(dir).rows.map(r => norm(JSON.stringify(Object.fromEntries(cols.map(c => [c, r[c]]))))) };
}
const rowOf = (dir, slug) => index.rows(dir).rows.find(r => r.slug === slug);
const snapshot = f => ({
  demo: snapshotFolder(f.folder),
  other: snapshotFolder(f.other),
  log: git(f.home, 'log', '--format=%s').split('\n'),
  origin: git(f.home, 'rev-parse', 'origin/main') === git(f.home, 'rev-parse', 'HEAD'),
});

// Runs a backlog command in the consumer checkout.
const run = (f, script, args) => cli([script, ...args], { cwd: f.cons, tmp: f.t });
const fm = (dir, rel) => parse(readFileSync(join(dir, rel), 'utf8'));
// 074 stops naming the python scripts in the subjects: it edits the values here, the assertions go through them.
const SUBJECT = {
  'archive 5': 'acme/demo: archive.py 5',
  'archive 2 --force': 'acme/demo: archive.py 2 --force',
  'move 2 --to-branch': 'acme/demo: move.py 2 --to-branch',
  'move --all-open-of-branch main': 'acme/demo: move.py --all-open-of-branch main',
  'move 7 --to-repository': 'acme/demo, other/proj: move.py 7 --to-repository',
};

// --- archive

test('archive finds the item by number, never by database row id', () => {
  const f = seed();
  const r = run(f, 'archive', ['1', '--force']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^📦 001-alpha archived/);
  assert.ok(existsSync(archivedPath(f.folder, '001-alpha', 'phases')));
  assert.ok(existsSync(itemPath(f.folder, '003-gamma')));
});

test('review P2: a name with --- in it does not hide the closing front-matter delimiter: archive --force stamps the file', () => {
  const f = seed();
  const made = run(f, 'new', ['--name', 'three---dashes', '--objective', 'o --- o', '--summary', 'a---b', '--depends-on', 'none']);
  assert.equal(made.status, 0, made.stderr);
  const slug = made.stdout.split('created phase ')[1].split(' ')[0];
  const r = run(f, 'archive', [slug, '--force']);
  assert.equal(r.status, 0, r.stderr);
  const moved = fm(f.folder, archivedRel(slug, 'phases'));
  assert.equal(moved.fm.status, 'pending');
  assert.equal(moved.fm.name, 'three---dashes');
  assert.equal(rowOf(f.folder, slug).status, 'archived');
});

// --- move --to-branch

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
  const missing = join(f.t, 'missing', 'acme', 'demo.git');
  assert.equal(r.stdout, `❌ could not read the branches of the origin of acme/demo (fatal: '${missing}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.); the target branch 'release' cannot be checked\n`);
  assert.equal(r.stderr, '');
  assert.equal(fm(f.folder, itemRel('002-beta')).fm.branch, 'main');
});

// --- move --to-repository

test('a target that is not a plain owner/name is refused before anything is written', () => {
  const f = seed();
  const before = snapshot(f);
  for (const target of ['../evil', 'a/b/c', 'solo', '/abs/path', 'a/..', 'a\\b']) {
    const r = run(f, 'move', ['2', '--to-repository', target]);
    assert.equal(r.status, 2, target);
    assert.equal(r.stderr, `❌ backlog: not an owner/name repository id: ${target}\n`);
    assert.equal(r.stdout, '');
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

// ---------------------------------------------------------------- review fixes (review fixes 2026-10-23)

test('review P1: a symlink at archive/ or archive/phases/ refuses the archive before anything is moved or stamped', t => {
  for (const nested of [false, true]) {
    const f = seed();
    const outside = join(f.t, 'outside');
    mkdirSync(outside);
    try {
      if (nested) { mkdirSync(join(f.folder, 'archive')); symlinkSync(outside, join(f.folder, 'archive', 'phases')); } else symlinkSync(outside, join(f.folder, 'archive'));
    } catch (e) { t.skip(`cannot create a symlink here: ${e.code}`); return; }
    const source = readFileSync(itemPath(f.folder, '005-epsilon'), 'utf8');
    const r = run(f, 'archive', ['5']);
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stdout + r.stderr, /Symlink destination is unsupported/);
    assert.deepEqual(readdirSync(outside), [], 'nothing was written outside the repository');
    assert.equal(readFileSync(itemPath(f.folder, '005-epsilon'), 'utf8'), source, 'the source file stays as it was, unstamped');
  }
});

test('review P1: archive and move hold the per-repository run lock from the pull to the push', async () => {
  const f = seed();
  const a = await waitsForRunLock(f, ['archive', '5'], () => existsSync(itemPath(f.folder, '005-epsilon')));
  assert.deepEqual(a.during, { exited: false, same: true }, 'archive waits while another command holds the lock');
  assert.equal(a.result.status, 0, a.result.stderr);
  assert.ok(!existsSync(itemPath(f.folder, '005-epsilon')) && existsSync(archivedPath(f.folder, '005-epsilon', 'phases')));
  const m = await waitsForRunLock(f, ['move', '2', '--to-branch', 'release'], () => fm(f.folder, itemRel('002-beta')).fm.branch);
  assert.deepEqual(m.during, { exited: false, same: true }, 'move waits while another command holds the lock');
  assert.equal(m.result.status, 0, m.result.stderr);
  assert.equal(fm(f.folder, itemRel('002-beta')).fm.branch, 'release');
});

for (const [title, script, args] of [['archive', 'archive', ['5']], ['move --to-branch', 'move', ['2', '--to-branch', 'release']]]) {
  test(`review P1: ${title} commits and pushes the rescan after a renumbering (checked from a fresh clone)`, () => {
    const f = seed();
    numberClash(f);
    const r = run(f, script, args);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /renumbered 008 -> 009/);
    assert.equal(git(f.home, 'status', '--porcelain'), '', 'the tree is clean');
    assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
    const pushed = pushedState(f);
    assert.ok(pushed.slugs.includes('009-local') && !pushed.slugs.includes('008-local'), pushed.slugs.join());
    assert.ok(pushed.files.includes(itemRel('009-local')));
  });
}

test('review P2: move accepts --note="two words" (an option with a value, not a positional)', () => {
  const f = seed();
  const r = run(f, 'move', ['2', '--to-branch=release', '--note=because it is ready']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fm(f.folder, itemRel('002-beta')).fm.branch, 'release');
});

test('review P2: move --to-repository refuses an item with depends_on, before any file is written; cleared, it moves', () => {
  const f = seed();
  assert.equal(run(f, 'update', ['3', '--set-depends-on', '1']).status, 0);
  const head = git(f.home, 'rev-parse', 'HEAD');
  const target = names(f.other, 'phases');
  const r = run(f, 'move', ['3', '--to-repository', 'other/proj']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '❌ 003-gamma depends on other items of acme/demo; dependencies are resolved against the target backlog, so clear them first: update 003-gamma --set-depends-on none\n');
  assert.equal(r.stderr, '');
  assert.deepEqual(names(f.other, 'phases'), target);
  assert.equal(existsSync(itemPath(f.folder, '003-gamma')), true);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
  assert.equal(run(f, 'update', ['3', '--set-depends-on', 'none']).status, 0);
  assert.equal(run(f, 'move', ['3', '--to-repository', 'other/proj']).status, 0);
});

test('review P1: move --to-repository whose target index write is refused removes the target copy and leaves the source untouched', () => {
  const f = seed();
  breakIndex(f.home, f.other); // the index of the target cannot be written
  const head = git(f.home, 'rev-parse', 'HEAD');
  const src = readFileSync(itemPath(f.folder, '003-gamma'));
  const rows = () => mirror(f);
  const before = rows();
  const target = names(f.other, 'phases');
  const r = run(f, 'move', ['3', '--to-repository', 'other/proj']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(names(f.other, 'phases'), target, 'no copy is left in the target');
  assert.deepEqual(readFileSync(itemPath(f.folder, '003-gamma')), src);
  assert.equal(rows(), before);
  assert.equal(git(f.home, 'status', '--porcelain', '--untracked-files=all', '--', 'other/proj'), '');
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('review P2: move --to-repository refuses an item other items depend on, by number or slug, before any file is written', () => {
  const f = seed();
  assert.equal(run(f, 'update', ['1', '--set-depends-on', '3']).status, 0);
  assert.equal(run(f, 'update', ['2', '--set-depends-on', '003-gamma']).status, 0);
  const head = git(f.home, 'rev-parse', 'HEAD');
  const target = names(f.other, 'phases');
  const r = run(f, 'move', ['3', '--to-repository', 'other/proj']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '❌ 001-alpha, 002-beta depend on 003-gamma, which would leave their depends_on pointing at nothing; clear them first: update <dependent> --set-depends-on ... (the other dependencies, or none)\n');
  assert.equal(r.stderr, '');
  assert.deepEqual(names(f.other, 'phases'), target);
  assert.equal(existsSync(itemPath(f.folder, '003-gamma')), true);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
  assert.equal(run(f, 'update', ['1', '--set-depends-on', 'none']).status, 0);
  assert.equal(run(f, 'update', ['2', '--set-depends-on', 'none']).status, 0);
  assert.equal(run(f, 'move', ['3', '--to-repository', 'other/proj']).status, 0);
});

const mirror = f => JSON.stringify(['phases', 'archive'].flatMap(sub => names(f.folder, sub).map(n => readFileSync(join(f.folder, sub, n), 'utf8')))); // the item files are the whole state


test('review P1: archive and move --to-branch whose index write is refused put the files back and commit nothing', () => {
  for (const args of [['archive', ['5']], ['move', ['2', '--to-branch', 'release']]]) {
    const f = seed();
    breakIndex(f.home, f.folder);
    const files = () => JSON.stringify([names(f.folder, 'phases'), names(f.folder, 'archive'), readFileSync(itemPath(f.folder, '002-beta'), 'utf8'), readFileSync(itemPath(f.folder, '005-epsilon'), 'utf8')]);
    const before = [files(), mirror(f), git(f.home, 'rev-parse', 'HEAD')];
    const r = run(f, ...args);
    assert.notEqual(r.status, 0, `${args[0]}: ${r.stdout}${r.stderr}`);
    assert.deepEqual([files(), mirror(f), git(f.home, 'rev-parse', 'HEAD')], before, args[0]);
  }
});

test('review P1: a cross-repository move waits for the operation lock of the clone, which also covers the destination backlog', async () => {
  const f = seed();
  let during; let child;
  await store.cloneLocked(f.home, async () => {
    child = cliAsync(['move', '3', '--to-repository', 'other/proj'], { cwd: f.cons, tmp: f.t });
    await new Promise(r => setTimeout(r, 2500));
    during = { exited: child.exited(), source: existsSync(itemPath(f.folder, '003-gamma')), copied: names(f.other, 'phases').length };
  });
  assert.deepEqual(during, { exited: false, source: true, copied: 1 }, 'the move waits for the destination lock');
  assert.equal((await child.done).status, 0);
  assert.deepEqual(names(f.other, 'phases').length, 2);
});

test('review P1: a bare --to-repository (the item names its target) also waits for the destination run lock', async () => {
  const f = seed();
  let during; let child;
  await store.cloneLocked(f.home, async () => {
    child = cliAsync(['move', '7', '--to-repository'], { cwd: f.cons, tmp: f.t });
    await new Promise(r => setTimeout(r, 2500));
    during = { exited: child.exited(), source: existsSync(itemPath(f.folder, '007-eta')) };
  });
  assert.deepEqual(during, { exited: false, source: true });
  assert.equal((await child.done).status, 0);
});

test('review P1: a cross-repository move whose source index write is refused leaves no copy in the destination', () => {
  const f = seed();
  breakIndex(f.home, f.folder);
  const files = () => JSON.stringify([names(f.folder, 'phases'), names(f.other, 'phases'), readFileSync(itemPath(f.folder, '003-gamma'), 'utf8')]);
  const before = [files(), mirror(f), mirror({ folder: f.other }), git(f.home, 'rev-parse', 'HEAD')];
  const r = run(f, 'move', ['3', '--to-repository', 'other/proj']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual([files(), mirror(f), mirror({ folder: f.other }), git(f.home, 'rev-parse', 'HEAD')], before);
});

test('review P1: archive whose index write is refused leaves nothing staged in the git index', () => {
  const f = seed();
  breakIndex(f.home, f.folder);
  const r = run(f, 'archive', ['5']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), '');
});

test('review P2: move of an archived item (--to-branch, --to-repository) is refused and writes nothing', () => {
  const f = seed();
  assert.equal(run(f, 'archive', ['5']).status, 0);
  const file = archivedPath(f.folder, '005-epsilon', 'phases');
  const before = [readFileSync(file, 'utf8'), mirror(f), names(f.other, 'phases'), git(f.home, 'rev-parse', 'HEAD')];
  for (const args of [['5', '--to-branch', 'release'], ['005-epsilon', '--to-repository', 'other/proj']]) {
    const r = run(f, 'move', args);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(r.stdout, '❌ 005-epsilon is archived and cannot be moved (archived items are read-only)\n');
    assert.equal(r.stderr, '');
  }
  assert.deepEqual([readFileSync(file, 'utf8'), mirror(f), names(f.other, 'phases'), git(f.home, 'rev-parse', 'HEAD')], before);
});

test('review P2: after a cross-repository move both queues are dense (the source closes the gap, the copy does not tie in the target)', () => {
  const f = seed();
  const ranks = (dir, branch) => index.open(index.rows(dir).rows).filter(r => r.branch === branch).map(r => r.priority);
  assert.equal(run(f, 'move', ['1', '--to-repository', 'other/proj']).status, 0); // 001-alpha is P0 of acme/demo; other/proj already holds a P0
  for (const [dir, branch] of [[f.folder, 'main'], [f.folder, 'feature/x'], [f.other, 'main']]) assert.deepEqual(ranks(dir, branch), ranks(dir, branch).map((_, i) => i), `${dir} ${branch}`);
  assert.deepEqual(ranks(f.other, 'main'), [0, 1]);
});

test('review P2: move sets the values (branch, repository) of an item that holds them empty, and the item is listed in the index of its new place', () => {
  const f = seed();
  const p = itemPath(f.folder, '002-beta');
  changeItem(p, { fm: { branch: '', repository: '', priority: undefined } }); // the file format requires both keys: an item without values holds them empty
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'no keys'); git(f.home, 'push', '-q');
  assert.equal(run(f, 'move', ['2', '--to-branch', 'release']).status, 0);
  assert.equal(fm(f.folder, itemRel('002-beta')).fm.branch, 'release');
  assert.equal(run(f, 'move', ['2', '--to-repository', 'other/proj']).status, 0);
  const moved = fm(f.other, `phases/${names(f.other, 'phases').find(n => n.endsWith(itemName('-beta')))}`).fm;
  assert.equal(moved.repository, 'other/proj');
  assert.equal(typeof index.rows(f.other).rows.find(r => r.path.endsWith(itemName('-beta'))).priority, 'number');
});

test('075: archive of a done item: git mv, status stamp, reflow, one commit', () => {
  const f = seed();
  const r = run(f, 'archive', ['5']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '📦 005-epsilon archived\n   📋 planning event: backlog re-densified to 4 item(s) (P0..P3)\n');
  assert.equal(r.stderr, '');
  assert.equal(fm(f.folder, archivedRel('005-epsilon', 'phases')).fm.status, 'done');
  assert.ok(!existsSync(itemPath(f.folder, '005-epsilon')));
  const row = () => { const r = rowOf(f.folder, '005-epsilon'); return { status: r.status, path: r.path }; };
  assert.deepEqual(row(), { status: 'archived', path: archivedRel('005-epsilon', 'phases') });
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), SUBJECT['archive 5']);
  assert.equal(git(f.home, 'log', '-1', '--follow', '--format=%s', '--', `acme/demo/${archivedRel('005-epsilon', 'phases')}`), SUBJECT['archive 5']);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'), 'published');
});

test('075: archive --dry-run names the move and changes nothing', () => {
  const f = seed();
  const head = git(f.home, 'rev-parse', 'HEAD');
  const file = readFileSync(itemPath(f.folder, '005-epsilon'), 'utf8');
  const r = run(f, 'archive', ['5', '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ℹ️  [dry-run] would archive 005-epsilon and move it to the archive\n');
  assert.equal(r.stderr, '');
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head, 'no commit');
  assert.equal(readFileSync(itemPath(f.folder, '005-epsilon'), 'utf8'), file, 'the file is untouched');
  assert.ok(!existsSync(join(f.folder, 'archive')), 'no archive folder is created');
  assert.ok(!existsSync(itemPath(f.folder, '005-epsilon')) === false);
});

test('075: archive of an already archived item: an info line, exit 0, nothing changes', () => {
  const f = seed();
  assert.equal(run(f, 'archive', ['5']).status, 0);
  const head = git(f.home, 'rev-parse', 'HEAD');
  const r = run(f, 'archive', ['5']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ℹ️  005-epsilon already archived\n');
  assert.equal(r.stderr, '');
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('075: move --to-branch and --all-open-of-branch print what moved, and the mirror rows and the commit follow', () => {
  const f = seed();
  const r = run(f, 'move', ['2', '--to-branch', 'release']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "✅ 002-beta now belongs to branch 'release'\n");
  assert.equal(r.stderr, '');
  const row = () => { const r = rowOf(f.folder, '002-beta'); return { branch: r.branch, status: r.status }; };
  assert.deepEqual(row(), { branch: 'release', status: 'pending' });
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), SUBJECT['move 2 --to-branch']);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'), 'published');
  const g = seed();
  const all = run(g, 'move', ['--all-open-of-branch', 'main', '--to-branch', 'release']);
  assert.equal(all.status, 0, all.stderr);
  assert.equal(all.stdout, "✅ moved 3 open item(s) of 'main' to 'release'\n");
  assert.equal(all.stderr, '');
  assert.equal(git(g.home, 'log', '-1', '--format=%s'), SUBJECT['move --all-open-of-branch main']);
  const moved = index.rows(g.folder).rows;
  assert.deepEqual(moved.filter(x => x.branch === 'main').map(x => x.slug), ['005-epsilon', '006-zeta', '007-eta'], 'the open items of main are gone; done items and the feature/x item stay');
  assert.equal(moved.filter(x => x.branch === 'release').length, 3, 'the three open items moved to release');
  assert.deepEqual(index.open(moved).filter(x => x.branch === 'release').map(x => [x.slug, x.priority]), [['001-alpha', 0], ['002-beta', 1], ['003-gamma', 2]], 'in the order they had');
});

test('075: move has no --dry-run: argparse refuses it with exit 2 and nothing changes', () => {
  const f = seed();
  const head = git(f.home, 'rev-parse', 'HEAD');
  const r = run(f, 'move', ['2', '--dry-run']);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '❌ backlog: unrecognized arguments: --dry-run\n');
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('move --to-repository: the item brings its own history, once, with no prefix', () => {
  const f = seed();
  const line = store.addEvent(f.folder, itemRel('007-eta'), { event: 'claimed', branch: 'main', note: 'carried note' });
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'a history'); git(f.home, 'push', '-q');
  assert.equal(run(f, 'move', ['7', '--to-repository', 'other/proj']).status, 0);
  const events = fm(f.other, itemRel('002-eta')).fm.events;
  assert.deepEqual(events.filter(l => l.includes('carried note')), [line]);
  assert.ok(events.some(l => l.includes(' moved_in ')), 'the arrival is recorded in the item');
  assert.ok(events.every(l => !l.includes('[from ')), events.join('\n'));
});

test('075: move --to-repository: new number in the target, source file gone, one published commit for both folders', () => {
  const f = seed();
  const r = run(f, 'move', ['7', '--to-repository']); // default: the repository the item names
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '✅ 007-eta moved to other/proj as 002-eta\n');
  assert.equal(r.stderr, '');
  assert.ok(existsSync(itemPath(f.other, '002-eta')));
  assert.ok(!existsSync(itemPath(f.folder, '007-eta')));
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), SUBJECT['move 7 --to-repository']);
  const moved = fm(f.other, itemRel('002-eta')).fm;
  assert.deepEqual([moved.phase, moved.seq, moved.status, moved.repository], ['002-eta', 2, 'pending', 'other/proj']);
  assert.deepEqual(git(f.home, 'show', '--format=', '--name-only', '--no-renames', 'HEAD').split('\n').map(p => p.split('/').slice(0, 2).join('/')).filter((p, i, a) => a.indexOf(p) === i).sort(), ['acme/demo', 'other/proj']);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
});

test('archive --force of an open item: the mirror row says archived, the queue no longer offers it, the change is published', () => {
  const f = seed();
  const row = () => { const r = rowOf(f.folder, '002-beta'); return { status: r.status, path: r.path }; };
  assert.deepEqual(row(), { status: 'pending', path: itemRel('002-beta') });
  const r = run(f, 'archive', ['2', '--force']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(row(), { status: 'archived', path: archivedRel('002-beta', 'phases') });
  assert.ok(cli(['next', '--json'], { cwd: f.cons, tmp: f.t }).stdout.indexOf('002-beta') < 0);
  assert.deepEqual(names(f.folder, 'archive'), [itemRel('002-beta')]);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
});

// --- 075 final review: the move and archive refusals that had no exact check, and the archive --force output

test('075: archive of an unknown item: exit 1, the exact refusal, nothing written or committed', () => {
  const f = seed();
  const before = snapshot(f);
  const r = run(f, 'archive', ['42']);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "❌ no phase '42'\n");
  assert.equal(r.stderr, '');
  assert.deepEqual(snapshot(f), before);
});

test('075: archive of a not-done item without --force: exit 1, the exact refusal, nothing written or committed', () => {
  const f = seed();
  const before = snapshot(f);
  const r = run(f, 'archive', ['2']);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "❌ 002-beta is 'pending', not finished (closed or done) — finish it or pass --force\n");
  assert.equal(r.stderr, '');
  assert.deepEqual(snapshot(f), before);
});

test('075: archive whose target file already exists: exit 1, the exact refusal, nothing written or committed', () => {
  const f = seed();
  mkdirSync(join(f.folder, 'archive', 'phases'), { recursive: true });
  writeFileSync(archivedPath(f.folder, '005-epsilon', 'phases'), readFileSync(itemPath(f.folder, '005-epsilon'), 'utf8'));
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'an archived copy exists already'); git(f.home, 'push', '-q');
  const before = snapshot(f);
  const r = run(f, 'archive', ['005-epsilon']); // by slug: the number is held twice now, which a number refuses
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '❌ an archived item named 005-epsilon already exists; archiving it again would replace that item\n');
  assert.equal(r.stderr, '');
  assert.deepEqual(snapshot(f), before);
});

test('075: move of an unknown item: exit 1, the exact refusal, nothing written or committed', () => {
  const f = seed();
  const before = snapshot(f);
  const r = run(f, 'move', ['42', '--to-branch', 'release']);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "❌ no item '42' in the backlog of acme/demo\n");
  assert.equal(r.stderr, '');
  assert.deepEqual(snapshot(f), before);
});

test('075: move to the item own repository: exit 1, the exact refusal, nothing written or committed', () => {
  const f = seed();
  const before = snapshot(f);
  const r = run(f, 'move', ['2', '--to-repository', 'acme/demo']);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '❌ 002-beta already belongs to acme/demo; name the target repository\n');
  assert.equal(r.stderr, '');
  assert.deepEqual(snapshot(f), before);
});

test('075: archive --force of an open item: the exact output, the stamp, the row, the published commit', () => {
  const f = seed();
  const r = run(f, 'archive', ['2', '--force']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '📦 002-beta archived\n   📋 planning event: backlog re-densified to 3 item(s) (P0..P2)\n');
  assert.equal(r.stderr, '');
  assert.equal(fm(f.folder, archivedRel('002-beta', 'phases')).fm.status, 'pending');
  assert.ok(!existsSync(itemPath(f.folder, '002-beta')));
  const row = () => { const r = rowOf(f.folder, '002-beta'); return { status: r.status, path: r.path }; };
  assert.deepEqual(row(), { status: 'archived', path: archivedRel('002-beta', 'phases') });
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), SUBJECT['archive 2 --force']);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'), 'published');
});

// --- 057: archive and move name an item by its slug and number and never print a file or folder of the backlog
const BACKLOG_PATH = /phases\/|archive\/|\.md\b/;
test('057: archive and move print the slug and no path', () => {
  const f = seed();
  const outputs = [];
  const runs = (script, args) => { const r = run(f, script, args); outputs.push(r.stdout + r.stderr); return r; };
  assert.equal(runs('archive', ['5', '--dry-run']).stdout, 'ℹ️  [dry-run] would archive 005-epsilon and move it to the archive\n');
  assert.match(runs('archive', ['5']).stdout, /^📦 005-epsilon archived\n/);
  assert.equal(runs('archive', ['5']).stdout, 'ℹ️  005-epsilon already archived\n');
  assert.equal(runs('move', ['5', '--to-branch', 'release']).stdout,
    '❌ 005-epsilon is archived and cannot be moved (archived items are read-only)\n');
  mkdirSync(join(f.folder, 'archive', 'phases'), { recursive: true });
  writeFileSync(archivedPath(f.folder, '006-zeta', 'phases'), readFileSync(itemPath(f.folder, '006-zeta'), 'utf8'));
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'an archived copy exists already'); git(f.home, 'push', '-q');
  assert.equal(runs('archive', ['006-zeta']).stdout, '❌ an archived item named 006-zeta already exists; archiving it again would replace that item\n');
  assert.match(runs('move', ['2', '--to-branch', 'release']).stdout, /^✅ 002-beta now belongs to branch 'release'\n/);
  assert.match(runs('move', ['7', '--to-repository', 'other/proj']).stdout, /^✅ 007-eta moved to other\/proj as 002-eta\n/);
  for (const out of outputs) assert.doesNotMatch(out, BACKLOG_PATH, out);
});

test('057: archive whose file move fails names the slug and no path', { skip: process.getuid?.() === 0 && 'root ignores the read-only folder' }, () => {
  const f = seed();
  const target = join(f.folder, 'archive', 'phases');
  mkdirSync(target, { recursive: true });
  spawnSync('chmod', ['555', target]);
  try {
    const r = run(f, 'archive', ['5']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(r.stdout, '❌ could not archive 005-epsilon: the file move failed\n');
    assert.doesNotMatch(r.stdout + r.stderr, BACKLOG_PATH);
  } finally { spawnSync('chmod', ['755', target]); }
});
