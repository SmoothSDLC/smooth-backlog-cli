// Tests for src/shared/move.js and src/shared/archive.js - cli-parity job 17 (MOVE): `backlog move` and `backlog archive`.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { cliAsync, numberClash, pushedState, waitsForRunLock } from './shared-concurrency.js';
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
const norm = s => String(s).replace(TS, 'TS').replace(/,?"updated_by":"[^"]*"/g, '').replace(/[0-9a-f]{7}->[0-9a-f]{7}/g, 'SHA->SHA');
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
  log: git(f.home, 'log', '--format=%s').split('\n'),
  origin: git(f.home, 'rev-parse', 'origin/main') === git(f.home, 'rev-parse', 'HEAD'),
});

// Runs a backlog command in the consumer checkout.
const run = (f, script, args) => cli([script, ...args], { cwd: f.cons, tmp: f.t });
const fm = (dir, rel) => parse(readFileSync(join(dir, rel), 'utf8'));

// --- archive

test('archive finds the item by number, never by database row id', () => {
  const f = seed({ permuteIds: true });
  const r = run(f, 'archive', ['1', '--force']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^📦 001-alpha archived/);
  assert.ok(existsSync(join(f.folder, 'archive/phases/001-alpha.md')));
  assert.ok(existsSync(join(f.folder, 'phases/003-gamma.md')));
});

test('review P2: a name with --- in it does not hide the closing front-matter delimiter: archive --force stamps the file', () => {
  const f = seed();
  const made = run(f, 'new', ['--name', 'three---dashes', '--objective', 'o --- o', '--summary', 'a---b', '--depends-on', 'none']);
  assert.equal(made.status, 0, made.stderr);
  const slug = made.stdout.split('created phase phases/')[1].split('.md')[0];
  const r = run(f, 'archive', [slug, '--force']);
  assert.equal(r.status, 0, r.stderr);
  const moved = fm(f.folder, `archive/phases/${slug}.md`);
  assert.equal(moved.fm.status, 'archived');
  assert.equal(moved.fm.name, 'three---dashes');
  const con = db.connect(f.folder);
  try { assert.equal(con.prepare('SELECT status FROM phase WHERE slug=?').get(slug).status, 'archived'); } finally { con.close(); }
});

test('review P2: a new item does not inherit the events of the moved-away item whose row id it reuses', () => {
  const t = mkdtempSync(join(tmpdir(), 'move-reuse-'));
  dirs.push(t);
  sharedBacklog(t);
  const f = { t, cons: consumer(t, 'acme', 'demo', 'main') };
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const mk = name => {
    const r = run(f, 'new', ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none']);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.split('created phase phases/')[1].split('.md')[0];
  };
  const old = mk('first one');
  assert.equal(run(f, 'move', [old, '--to-repository', 'other/proj']).status, 0);
  const fresh = mk('second one'); // the only row is gone: its INTEGER PRIMARY KEY comes round again
  const ev = run(f, 'query', ['--events', fresh]);
  assert.equal(ev.status, 0, ev.stderr);
  assert.ok(ev.stdout.includes('new phase ' + fresh), ev.stdout);
  assert.ok(!ev.stdout.includes('first') && !ev.stdout.includes('moved_out'), `no event of the moved item:\n${ev.stdout}`);
  const con = db.connect(join(t, 'home', 'acme', 'demo'));
  try { assert.equal(con.prepare('SELECT COUNT(*) n FROM event WHERE note LIKE ?').get('%first-one%').n > 0, true, 'its history is kept, detached'); } finally { con.close(); }
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
  assert.match(r.stdout, /^❌ could not read the branches of the origin of acme\/demo/);
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.branch, 'main');
});

// --- move --to-repository

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

test('review P2: a target backlog.db that is a symlink to a valid database refuses the move before the target item is written', t => {
  const f = seed();
  const real = join(f.t, 'real.db');
  renameSync(join(f.other, 'backlog.db'), real);
  try { symlinkSync(real, join(f.other, 'backlog.db')); } catch (e) { t.skip(`cannot create a symlink here: ${e.code}`); return; }
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'linked target db'); git(f.home, 'push', '-q');
  const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
  const [src, dbSha, target, status] = [snapshotFolder(f.folder), sha(real), names(f.other, 'phases'), git(f.home, 'status', '--porcelain')];
  const r = run(f, 'move', ['7', '--to-repository']);
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stdout + r.stderr, /Symlink destination is unsupported/);
  assert.deepEqual(names(f.other, 'phases'), target, 'no item was created in the target');
  assert.deepEqual(snapshotFolder(f.folder), src, 'the source folder is unchanged');
  assert.equal(sha(real), dbSha, 'the linked database is unchanged');
  assert.equal(git(f.home, 'status', '--porcelain'), status, 'no uncommitted file is left behind');
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

test('review P2: move accepts --note="two words" (an option with a value, not a positional)', () => {
  const f = seed();
  const r = run(f, 'move', ['2', '--to-branch=release', '--note=because it is ready']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.branch, 'release');
});

test('review P2: move --to-repository refuses an item with depends_on, before any file is written; cleared, it moves', () => {
  const f = seed();
  assert.equal(run(f, 'update', ['3', '--set-depends-on', '1']).status, 0);
  const head = git(f.home, 'rev-parse', 'HEAD');
  const target = names(f.other, 'phases');
  const r = run(f, 'move', ['3', '--to-repository', 'other/proj']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /003-gamma depends on other items of acme\/demo.*update 003-gamma --set-depends-on none/);
  assert.deepEqual(names(f.other, 'phases'), target);
  assert.equal(existsSync(join(f.folder, 'phases', '003-gamma.md')), true);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
  assert.equal(run(f, 'update', ['3', '--set-depends-on', 'none']).status, 0);
  assert.equal(run(f, 'move', ['3', '--to-repository', 'other/proj']).status, 0);
});

test('review P1: move --to-repository whose target scan throws removes the target copy and leaves the source untouched', () => {
  const f = seed();
  const first = join(f.other, 'phases', '001-first.md'); // an existing target item the target scan cannot read
  writeFileSync(first, readFileSync(first, 'utf8').replace('\nseq: 1\n', '\nseq: 1\nsize_score: []\n'));
  const head = git(f.home, 'rev-parse', 'HEAD');
  const src = readFileSync(join(f.folder, 'phases', '003-gamma.md'));
  const rows = () => { const c = db.connect(f.folder); try { return JSON.stringify(c.prepare('SELECT * FROM phase ORDER BY id').all().concat(c.prepare('SELECT * FROM event ORDER BY id').all())); } finally { c.close(); } };
  const before = rows();
  const target = names(f.other, 'phases');
  const r = run(f, 'move', ['3', '--to-repository', 'other/proj']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(names(f.other, 'phases'), target, 'no copy is left in the target');
  assert.deepEqual(readFileSync(join(f.folder, 'phases', '003-gamma.md')), src);
  assert.equal(rows(), before);
  assert.equal(git(f.home, 'status', '--porcelain', '--untracked-files=all', '--', 'other/proj'), 'M other/proj/phases/001-first.md');
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
  assert.match(r.stdout, /001-alpha.*002-beta.*depend on 003-gamma.*update <dependent> --set-depends-on/s);
  assert.deepEqual(names(f.other, 'phases'), target);
  assert.equal(existsSync(join(f.folder, 'phases', '003-gamma.md')), true);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
  assert.equal(run(f, 'update', ['1', '--set-depends-on', 'none']).status, 0);
  assert.equal(run(f, 'update', ['2', '--set-depends-on', 'none']).status, 0);
  assert.equal(run(f, 'move', ['3', '--to-repository', 'other/proj']).status, 0);
});

const mirror = f => { const c = db.connect(f.folder); try { return JSON.stringify(c.prepare('SELECT * FROM phase ORDER BY id').all().concat(c.prepare('SELECT * FROM event ORDER BY id').all())); } finally { c.close(); } };
const breakItem = (f, rel) => { const p = join(f.folder, rel); writeFileSync(p, readFileSync(p, 'utf8').replace('\nseq: 1\n', '\nseq: 1\nsize_score: []\n')); };

for (const eol of ['\n', '\r\n', '\r']) {
  test(`review P2: archive replaces a whole escaped multiline status scalar (${JSON.stringify(eol)})`, () => {
    const f = seed();
    const p = join(f.folder, 'phases', '002-beta.md');
    const source = '\uFEFF' + readFileSync(p, 'utf8').replace(/^status: .*$/m, 'status: "pend\\\n  ing"').replace(/\n/g, eol);
    writeFileSync(p, source);
    const before = parse(source);
    assert.equal(before.fm.status, 'pending');
    git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'multiline status'); git(f.home, 'push', '-q');
    const r = run(f, 'archive', ['2', '--force']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const text = readFileSync(join(f.folder, 'archive/phases/002-beta.md'), 'utf8');
    assert.deepEqual(parse(text), { fm: { ...before.fm, status: 'archived' }, body: before.body });
    assert.ok(text.startsWith(`\uFEFF---${eol}`), 'BOM and line endings survive');
    assert.equal(text.slice(text.indexOf(`${eol}---${eol}`) + (eol + '---' + eol).length), source.slice(source.indexOf(`${eol}---${eol}`) + (eol + '---' + eol).length), 'body bytes survive');
    const con = db.connect(f.folder);
    try { assert.equal(con.prepare("SELECT status FROM phase WHERE slug='002-beta'").get().status, parse(text).fm.status); } finally { con.close(); }
  });
}

test('review P2: archive stamps status: archived into an item saved with CRLF line endings', () => {
  const f = seed();
  const p = join(f.folder, 'phases', '005-epsilon.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace(/\n/g, '\r\n'));
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'crlf'); git(f.home, 'push', '-q');
  const r = run(f, 'archive', ['5']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fm(f.folder, 'archive/phases/005-epsilon.md').fm.status, 'archived');
  assert.match(readFileSync(join(f.folder, 'archive/phases/005-epsilon.md'), 'utf8'), /status: "archived"\r\n/);
});

test('review P1: archive and move --to-branch whose rescan throws put the files and the db back and commit nothing', () => {
  for (const args of [['archive', ['5']], ['move', ['2', '--to-branch', 'release']]]) {
    const f = seed();
    breakItem(f, 'phases/001-alpha.md');
    const files = () => JSON.stringify([names(f.folder, 'phases'), names(f.folder, 'archive'), readFileSync(join(f.folder, 'phases/002-beta.md'), 'utf8'), readFileSync(join(f.folder, 'phases/005-epsilon.md'), 'utf8')]);
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
    during = { exited: child.exited(), source: existsSync(join(f.folder, 'phases', '003-gamma.md')), copied: names(f.other, 'phases').length };
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
    during = { exited: child.exited(), source: existsSync(join(f.folder, 'phases', '007-eta.md')) };
  });
  assert.deepEqual(during, { exited: false, source: true });
  assert.equal((await child.done).status, 0);
});

test('review P1: a cross-repository move whose source rescan throws leaves no copy or row in the destination', () => {
  const f = seed();
  breakItem(f, 'phases/001-alpha.md');
  const files = () => JSON.stringify([names(f.folder, 'phases'), names(f.other, 'phases'), readFileSync(join(f.folder, 'phases/003-gamma.md'), 'utf8')]);
  const before = [files(), mirror(f), mirror({ folder: f.other }), git(f.home, 'rev-parse', 'HEAD')];
  const r = run(f, 'move', ['3', '--to-repository', 'other/proj']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual([files(), mirror(f), mirror({ folder: f.other }), git(f.home, 'rev-parse', 'HEAD')], before);
});

test('review P1: archive whose rescan throws leaves nothing staged in the index', () => {
  const f = seed();
  breakItem(f, 'phases/001-alpha.md');
  const r = run(f, 'archive', ['5']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), '');
});

test('review P2: move of an archived item (--to-branch, --to-repository) is refused and writes nothing', () => {
  const f = seed();
  assert.equal(run(f, 'archive', ['5']).status, 0);
  const file = join(f.folder, 'archive', 'phases', '005-epsilon.md');
  const before = [readFileSync(file, 'utf8'), mirror(f), names(f.other, 'phases'), git(f.home, 'rev-parse', 'HEAD')];
  for (const args of [['5', '--to-branch', 'release'], ['005-epsilon', '--to-repository', 'other/proj']]) {
    const r = run(f, 'move', args);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /005-epsilon is archived and cannot be moved/);
  }
  assert.deepEqual([readFileSync(file, 'utf8'), mirror(f), names(f.other, 'phases'), git(f.home, 'rev-parse', 'HEAD')], before);
});

test('review P2: after a cross-repository move both queues are dense (the source closes the gap, the copy does not tie in the target)', () => {
  const f = seed();
  const ranks = dir => readdirSync(join(dir, 'phases')).map(n => fm(dir, `phases/${n}`).fm).filter(m => ['pending', 'in_progress'].includes(m.status)).map(m => m.priority).sort((a, b) => a - b);
  assert.equal(run(f, 'move', ['1', '--to-repository', 'other/proj']).status, 0); // 001-alpha is P0 of acme/demo; other/proj already holds a P0
  for (const dir of [f.folder, f.other]) assert.deepEqual(ranks(dir), ranks(dir).map((_, i) => i), dir);
  const c = db.connect(f.other);
  try { assert.deepEqual(c.prepare("SELECT priority FROM phase WHERE status='pending' ORDER BY priority").all().map(r => r.priority), [0, 1]); } finally { c.close(); }
});

// A team session bound to another branch works only on items of its own repository and branch: archive and both move modes refuse
// an item of another team before anything is written.
const bound = { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'release' }; // seed items are acme/demo on main (004-delta: feature/x)
for (const [title, script, args] of [
  ['archive', 'archive', ['5', '--force']],
  ['move --to-branch', 'move', ['2', '--to-branch', 'release']],
  ['move --to-repository', 'move', ['2', '--to-repository', 'other/proj']],
  ['move --all-open-of-branch', 'move', ['--all-open-of-branch', 'main', '--to-branch', 'release']],
]) {
  test(`review P1: ${title} in a team session bound to another branch is refused and writes nothing`, () => {
    const f = seed();
    const before = [mirror(f), names(f.folder, 'phases'), names(f.folder, 'archive'), names(f.other, 'phases'), git(f.home, 'rev-parse', 'HEAD'), git(f.home, 'status', '--porcelain')];
    const r = cli([script, ...args], { cwd: f.cons, tmp: f.t, env: bound });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /team session is bound to acme\/demo branch release/);
    assert.deepEqual([mirror(f), names(f.folder, 'phases'), names(f.folder, 'archive'), names(f.other, 'phases'), git(f.home, 'rev-parse', 'HEAD'), git(f.home, 'status', '--porcelain')], before);
  });
}

test('review P2: archive inserts status: archived into an item whose front matter has no status key (LF, CRLF, lone CR)', () => {
  for (const eol of ['\n', '\r\n', '\r']) {
    const f = seed();
    const p = join(f.folder, 'phases', '005-epsilon.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^status: .*\n/m, '').replace(/\n/g, eol));
    assert.ok(!/status:/.test(readFileSync(p, 'utf8').split(`${eol}---`)[1]), 'fixture has no status key');
    git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'no status'); git(f.home, 'push', '-q');
    const r = run(f, 'archive', ['5', '--force']);
    assert.equal(r.status, 0, JSON.stringify(eol) + r.stderr);
    const text = readFileSync(join(f.folder, 'archive/phases/005-epsilon.md'), 'utf8');
    assert.equal(parse(text).fm.status, 'archived', JSON.stringify(eol));
    assert.equal(text.split('status:').length, 2);
    assert.ok(text.includes(`${eol}status: "archived"${eol}---${eol}`) || text.includes(`status: "archived"${eol}---`), JSON.stringify(eol));
  }
});

test('review P2: move and the reflow add the keys they set (branch, repository, priority) to an item whose front matter lacks them', () => {
  const f = seed();
  const p = join(f.folder, 'phases', '002-beta.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^(branch|repository|priority): .*\n/gm, ''));
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'no keys'); git(f.home, 'push', '-q');
  assert.equal(run(f, 'move', ['2', '--to-branch', 'release']).status, 0);
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.branch, 'release');
  assert.equal(run(f, 'move', ['2', '--to-repository', 'other/proj']).status, 0);
  const moved = fm(f.other, `phases/${names(f.other, 'phases').find(n => n.endsWith('-beta.md'))}`).fm;
  assert.equal(moved.repository, 'other/proj');
  assert.equal(typeof moved.priority, 'number');
});

test('review P2: archive with a ghost row (a pending mirror row whose file is gone) is still ranked: the survivors keep their ranks', t => {
  const ghost = f => { git(f.home, 'rm', '-q', 'acme/demo/phases/001-alpha.md'); git(f.home, 'commit', '-q', '-m', 'file gone'); git(f.home, 'push', '-q'); };
  const f = seed(); ghost(f);
  const r = run(f, 'archive', ['5']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.priority, 1, 'the ghost still holds P0');
  assert.deepEqual(['003-gamma', '004-delta', '007-eta'].map(n => fm(f.folder, `phases/${n}.md`).fm.priority), [2, 3, 4]);
  assert.match(r.stdout, /re-densified to 5 item\(s\) \(P0\.\.P4\)/, 'the ghost row is counted');
});

test('archive of a done item: git mv, status stamp, reflow, one commit', () => {
  const f = seed();
  const r = run(f, 'archive', ['5']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^📦 005-epsilon archived -> archive\/phases\/005-epsilon\.md\n {3}rescan: \d+ \(re\)ingested, 0 missing\n {3}📋 planning event: backlog re-densified to 5 item\(s\) \(P0\.\.P4\)\n$/);
  assert.equal(fm(f.folder, 'archive/phases/005-epsilon.md').fm.status, 'archived');
  assert.ok(!existsSync(join(f.folder, 'phases/005-epsilon.md')));
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), 'acme/demo: archive.py 5');
  assert.equal(git(f.home, 'log', '-1', '--follow', '--format=%s', '--', 'acme/demo/archive/phases/005-epsilon.md'), 'acme/demo: archive.py 5');
});

test('move --to-branch and --all-open-of-branch print what moved', () => {
  const f = seed();
  const r = run(f, 'move', ['2', '--to-branch', 'release']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "✅ 002-beta now belongs to branch 'release'\n");
  assert.equal(fm(f.folder, 'phases/002-beta.md').fm.branch, 'release');
  const g = seed();
  const all = run(g, 'move', ['--all-open-of-branch', 'main', '--to-branch', 'release']);
  assert.equal(all.status, 0, all.stderr);
  assert.equal(all.stdout, "✅ moved 3 open item(s) of 'main' to 'release'\n");
});

test('move --to-repository: new number in the target, source file gone, one published commit for both folders', () => {
  const f = seed();
  const r = run(f, 'move', ['7', '--to-repository']); // default: the repository the item names
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '✅ 007-eta moved to other/proj as 002-eta\n');
  assert.ok(existsSync(join(f.other, 'phases/002-eta.md')));
  assert.ok(!existsSync(join(f.folder, 'phases/007-eta.md')));
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), 'acme/demo, other/proj: move.py 7 --to-repository');
  assert.deepEqual(git(f.home, 'show', '--format=', '--name-only', 'HEAD').split('\n').map(p => p.split('/').slice(0, 2).join('/')).filter((p, i, a) => a.indexOf(p) === i).sort(), ['acme/demo', 'other/proj']);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
});

test('archive --force of an open item: the mirror row says archived, the queue no longer offers it, the change is published', () => {
  const f = seed();
  const row = () => { const con = db.connect(f.folder); try { return { ...con.prepare("SELECT status, path FROM phase WHERE slug='002-beta'").get() }; } finally { con.close(); } };
  assert.deepEqual(row(), { status: 'pending', path: 'phases/002-beta.md' });
  const r = run(f, 'archive', ['2', '--force']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(row(), { status: 'archived', path: 'archive/phases/002-beta.md' });
  assert.ok(cli(['query', '--next', '--json'], { cwd: f.cons, tmp: f.t }).stdout.indexOf('002-beta') < 0);
  assert.deepEqual(names(f.folder, 'archive'), ['phases/002-beta.md']);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
});
