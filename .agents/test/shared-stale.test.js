// Stale-view guard (backlog-cli item 025): updated_by, the per-agent read cache, the refusal (exit 5) and the push race.
// Also: no write by path replaces another item (move/new/archive), and a release ends the holder's wait.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const viewCache = (home, agent) => join(home, '.git', 'smooth-backlog-cli-views', `${createHash('sha256').update(agent).digest('hex')}.json`);
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// Two clones of the shared backlog (home = A's, home2 = B's) over one origin, both with acme/demo and items 001-alpha, 002-beta, 003-gamma.
// An item has no updated_by (as a file written before this change).
function seed(items = ['alpha', 'beta', 'gamma'], repo = 'demo') {
  const t = mkdtempSync(join(tmpdir(), 'stale-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', repo, 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const folder = join(home, 'acme', repo);
  items.forEach((name, i) => store.write({
    path: join(folder, 'phases', `${String(i + 1).padStart(3, '0')}-${name}.md`),
    fm: {
      phase: `${String(i + 1).padStart(3, '0')}-${name}`, seq: i + 1, name: `Name ${name}`, objective: `obj ${name}`, summary: `sum ${name}`, status: 'pending', severity: 'normal',
      priority: i, repository: `acme/${repo}`, branch: 'main', commit: '', location: '', created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z',
      depends_on: [], claimed_by: '', claimed_at: '',
    },
    body: `\n# Phase ${i + 1}\n\nBody of ${name}.\n`,
  }, folder));
  const con = db.connect(folder); db.scan(con, folder); con.close();
  git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', 'fixture'); git(home, 'push', '-q');
  const home2 = join(t, 'home2');
  git(t, 'clone', '-q', join(t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), home2);
  return { t, home, home2, cons, folder, folder2: join(home2, 'acme', repo), bare: join(t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git') };
}
// the CLI as the clone `home`; the agent is named by --agent/--by on the command
const run = (f, home, args, opts = {}) => cli(args, { cwd: opts.cwd ?? f.cons, tmp: f.t, env: { BACKLOG_HOME: home, QWEN_CODE_AGENT_ID: '', USER: 'nobody', ...opts.env } });
const fm = (folder, file) => parse(readFileSync(join(folder, 'phases', file), 'utf8')).fm;
const onOrigin = (f, path) => git(f.t, '--git-dir', f.bare, 'show', `main:${path}`);
const sleepSec = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100); // updated has a resolution of one second

test('every write stamps updated_by next to updated; an item without updated_by is read and written', () => {
  const f = seed();
  assert.equal(fm(f.folder, '001-alpha.md').updated_by, undefined);
  assert.equal(run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']).status, 0); // reads the older file
  const r = run(f, f.home, ['update', '1', '--append', 'x', '--by', 'amy']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const keys = Object.keys(fm(f.folder, '001-alpha.md'));
  assert.equal(fm(f.folder, '001-alpha.md').updated_by, 'amy');
  assert.equal(keys.indexOf('updated_by'), keys.indexOf('updated') + 1);
  const env = run(f, f.home, ['update', '2', '--append', 'y'], { env: { QWEN_CODE_AGENT_ID: 'qwen-7' } });
  assert.equal(env.status, 0, env.stderr);
  assert.equal(fm(f.folder, '002-beta.md').updated_by, 'qwen-7');
});

test('a write to an item another writer changed after the agent read it is refused (exit 5) and changes nothing', () => {
  const f = seed();
  run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']);
  git(f.home, 'pull', '-q', '--rebase');
  const b = run(f, f.home2, ['update', '1', '--append', 'from bob', '--by', 'bob']);
  assert.equal(b.status, 0, b.stderr);
  const originBefore = git(f.t, '--git-dir', f.bare, 'rev-parse', 'main');
  const localBefore = git(f.home, 'rev-parse', 'HEAD');
  const a = run(f, f.home, ['update', '1', '--append', 'from amy', '--by', 'amy']);
  assert.equal(a.status, 5, a.stderr + a.stdout);
  assert.match(a.stderr, /item 001-alpha was changed by bob at \d{4}-\d\d-\d\dT[\d:]+Z after you last read it \(2026-10-01T00:00:00Z\); read it again \(backlog query --phase 001-alpha\) and retry/);
  assert.equal(git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'), originBefore);
  assert.ok(!onOrigin(f, 'acme/demo/phases/001-alpha.md').includes('from amy'));
  assert.ok(!readFileSync(join(f.folder, 'phases', '001-alpha.md'), 'utf8').includes('from amy'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.ok(git(f.home, 'rev-parse', 'HEAD') !== '' && git(f.home, 'merge-base', '--is-ancestor', localBefore, 'HEAD') === '');
  // reading again lifts the refusal
  assert.equal(run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']).status, 0);
  assert.equal(run(f, f.home, ['update', '1', '--append', 'from amy', '--by', 'amy']).status, 0);
});

test('replan refuses a stale ordering after its leading pull without changing Bob\'s priorities', () => {
  const f = seed();
  const read = run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']);
  assert.equal(read.status, 0, read.stderr + read.stdout);
  const cache = viewCache(f.home, 'amy');
  const expected = readFileSync(cache, 'utf8');
  const bob = run(f, f.home2, ['update', '1', '--priority', '1', '--by', 'bob']);
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  const originBefore = git(f.t, '--git-dir', f.bare, 'rev-parse', 'main');

  const amy = run(f, f.home, ['update', '--replan', '1,2', '--by', 'amy']);
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
  assert.match(amy.stderr, /item 001-alpha was changed by bob .* after you last read it/);
  assert.equal(readFileSync(cache, 'utf8'), expected);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), originBefore);
  assert.equal(git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'), originBefore);
  for (const folder of [f.folder, f.folder2]) {
    assert.equal(fm(folder, '001-alpha.md').priority, 1);
    assert.equal(fm(folder, '002-beta.md').priority, 0);
  }
  assert.equal(git(f.home, 'status', '--porcelain'), '');
});

test('replan guards implicitly reordered items against a push race without a cached view', () => {
  const f = seed();
  const before = git(f.home, 'rev-parse', 'HEAD');
  const hook = join(f.home, '.git', 'hooks', 'pre-push');
  const flag = join(f.t, 'hook-ran');
  writeFileSync(hook, `#!/bin/sh\n[ -f '${flag}' ] && exit 0\ntouch '${flag}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${f.cons}' && BACKLOG_HOME='${f.home2}' XDG_CONFIG_HOME='${join(f.t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update 1 --append 'bob won' --by bob >/dev/null 2>&1\nexit 0\n`);
  chmodSync(hook, 0o755);
  const amy = run(f, f.home, ['update', '--replan', '2', '--by', 'amy']);
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
  assert.match(amy.stderr, /item 001-alpha was changed by bob .* after you last read it/);
  assert.match(onOrigin(f, 'acme/demo/phases/001-alpha.md'), /bob won/);
  assert.equal(parse(onOrigin(f, 'acme/demo/phases/001-alpha.md')).fm.priority, 0);
  assert.equal(parse(onOrigin(f, 'acme/demo/phases/002-beta.md')).fm.priority, 1);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.equal(git(f.home, 'branch', '--list').split('\n').filter(Boolean).length, 1);
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  assert.equal(existsSync(viewCache(f.home, 'amy')), false);
});

test('the read cache is a file in .git, survives across commands and is per agent; an unread item is written without a check', () => {
  const f = seed();
  run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']);
  const cache = viewCache(f.home, 'amy');
  const seen = JSON.parse(readFileSync(cache, 'utf8'))['acme/demo/001-alpha'];
  assert.equal(seen.updated, '2026-10-01T00:00:00Z');
  assert.match(seen.commit, /^[0-9a-f]{40}$/);
  assert.equal(existsSync(viewCache(f.home, 'bob')), false);
  // bob never read the item: his first write goes through; amy's cached view is now stale, bob's is the newer
  assert.equal(run(f, f.home, ['update', '1', '--append', 'bob', '--by', 'bob']).status, 0);
  assert.equal(run(f, f.home, ['update', '1', '--append', 'amy', '--by', 'amy']).status, 5);
  sleepSec();
  assert.equal(run(f, f.home, ['update', '1', '--append', 'bob again', '--by', 'bob']).status, 0); // bob's own writes recorded his view
  assert.equal(JSON.parse(readFileSync(viewCache(f.home, 'bob'), 'utf8'))['acme/demo/001-alpha'].updated_by, 'bob');
});

test('two clones update different items concurrently: both succeed and neither loses its change', () => {
  const f = seed();
  for (const [h, who] of [[f.home, 'amy'], [f.home2, 'bob']]) run(f, h, ['query', '--phase', who === 'amy' ? '001-alpha' : '002-beta', '--agent', who]);
  const a = run(f, f.home, ['update', '1', '--append', 'amy was here', '--by', 'amy']);
  const b = run(f, f.home2, ['update', '2', '--append', 'bob was here', '--by', 'bob']);
  assert.equal(a.status, 0, a.stderr); assert.equal(b.status, 0, b.stderr);
  assert.match(onOrigin(f, 'acme/demo/phases/001-alpha.md'), /amy was here/);
  assert.match(onOrigin(f, 'acme/demo/phases/002-beta.md'), /bob was here/);
});

test('push race on the same item: one wins, the other is refused, and its change is neither on origin nor on a side branch', () => {
  const f = seed();
  run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']);
  // while amy's push is on its way, bob pushes his change to the same item
  const hook = join(f.home, '.git', 'hooks', 'pre-push');
  const flag = join(f.t, 'hook-ran');
  writeFileSync(hook, `#!/bin/sh\n[ -f '${flag}' ] && exit 0\ntouch '${flag}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${f.cons}' && BACKLOG_HOME='${f.home2}' XDG_CONFIG_HOME='${join(f.t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update 1 --append 'bob won' --by bob >/dev/null 2>&1\nexit 0\n`);
  chmodSync(hook, 0o755);
  // amy's leading pull already ran when the hook fires, so amy's check passed: only the push-time guard can stop her
  const a = run(f, f.home, ['update', '1', '--append', 'amy lost', '--by', 'amy']);
  assert.equal(a.status, 5, a.stderr + a.stdout);
  assert.match(a.stderr, /item 001-alpha was changed by bob at .* after you last read it/);
  assert.match(onOrigin(f, 'acme/demo/phases/001-alpha.md'), /bob won/);
  assert.ok(!onOrigin(f, 'acme/demo/phases/001-alpha.md').includes('amy lost'));
  assert.equal(git(f.home, 'branch', '--list').split('\n').filter(Boolean).length, 1); // no side branch
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.ok(!readFileSync(join(f.folder, 'phases', '001-alpha.md'), 'utf8').includes('amy lost'));
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
});

test('a move never replaces an item of the target that holds the file name, even after update --seq freed its number', () => {
  const f = seed(['temp', 'beta'], 'dest');
  const src = consumer(f.t, 'acme', 'demo', 'main');
  const sfolder = join(f.home, 'acme', 'demo');
  store.write({ path: join(sfolder, 'phases', '001-beta.md'), fm: { phase: '001-beta', seq: 1, name: 'Source beta', objective: 'src', summary: 's', status: 'pending', severity: 'normal', priority: 0, repository: 'acme/demo', branch: 'main', commit: '', location: '', created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z', depends_on: [], claimed_by: '', claimed_at: '' }, body: '\n# Phase 1\n\nSOURCE BODY\n' }, sfolder);
  const con = db.connect(sfolder); db.scan(con, sfolder); con.close();
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'src'); git(f.home, 'push', '-q');
  const dest = consumer(f.t, 'acme', 'dest', 'main');
  assert.equal(run(f, f.home, ['move', '1', '--to-repository', 'acme/demo'], { cwd: dest }).status, 0);
  assert.equal(run(f, f.home, ['update', '2', '--seq', '1'], { cwd: dest }).status, 0);
  const m = run(f, f.home, ['move', '001-beta', '--to-repository', 'acme/dest'], { cwd: src });
  assert.equal(m.status, 0, m.stderr + m.stdout);
  const files = readdirSync(join(f.home, 'acme', 'dest', 'phases')).sort();
  assert.equal(files.length, 2, files.join());
  assert.match(onOrigin(f, 'acme/dest/phases/002-beta.md'), /Body of beta/); // the destination's own item is intact
  assert.ok(files.some(n => n !== '002-beta.md' && /SOURCE BODY/.test(readFileSync(join(f.home, 'acme', 'dest', 'phases', n), 'utf8'))));
});

test('a release ends the holder\'s wait, so the released item is not offered while it still shows a wait', () => {
  const f = seed();
  const file = join(f.folder, 'phases', '001-alpha.md'); // held by amy and waiting (written as a holder's --waiting would)
  const doc = parse(readFileSync(file, 'utf8'));
  store.write({ path: file, fm: { ...doc.fm, status: 'in_progress', claimed_by: 'amy', claimed_at: '2026-10-02T00:00:00Z', wait_on: 'ci run', wait_since: '2026-10-02T00:00:00Z' }, body: doc.body }, f.folder);
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'held'); git(f.home, 'push', '-q');
  assert.equal(fm(f.folder, '001-alpha.md').wait_on, 'ci run');
  assert.equal(run(f, f.home, ['update', '1', '--release', 'amy']).status, 0);
  assert.equal(fm(f.folder, '001-alpha.md').wait_on, '');
});

test('a change in the same second by the same writer name is still a change: the view includes the content', () => {
  const f = seed();
  run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']);
  const file = join(f.folder2, 'phases', '001-alpha.md');
  writeFileSync(file, readFileSync(file, 'utf8') + '\nedited elsewhere, updated and updated_by untouched\n');
  git(f.home2, 'add', '-A'); git(f.home2, 'commit', '-q', '-m', 'edit'); git(f.home2, 'push', '-q');
  const a = run(f, f.home, ['update', '1', '--append', 'amy', '--by', 'amy']);
  assert.equal(a.status, 5, a.stderr + a.stdout);
});

test('nextSeqFor never returns a number whose file name is held, also by a file without front matter', () => {
  const t = mkdtempSync(join(tmpdir(), 'stale-seq-')); dirs.push(t);
  const folder = join(t, 'acme', 'demo');
  mkdirSync(join(folder, 'phases'), { recursive: true });
  writeFileSync(join(folder, 'phases', '001-x.md'), 'a note, not an item\n');
  assert.equal(store.nextSeqFor(folder, '-x.md'), 2);
  assert.equal(store.nextSeqFor(folder, '-y.md'), 1);
});

test('the creator of an item has seen it: another writer\'s change is refused on her next update', () => {
  const f = seed();
  const made = run(f, f.home, ['new', '--name', 'fresh job', '--depends-on', 'none'], { env: { QWEN_CODE_AGENT_ID: 'amy' } });
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const bob = run(f, f.home2, ['update', '4', '--append', 'bob', '--by', 'bob']);
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  const amy = run(f, f.home, ['update', '4', '--append', 'amy'], { env: { QWEN_CODE_AGENT_ID: 'amy' } });
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
});

test('what the agent itself re-ranked on the side is not news to it: completing item 1 reflows item 2, and her next update of 2 goes through', () => {
  const f = seed();
  for (const slug of ['001-alpha', '002-beta']) run(f, f.home, ['query', '--phase', slug, '--agent', 'amy']);
  const done = run(f, f.home, ['update', '1', '--status', 'done', '--by', 'amy']);
  assert.equal(done.status, 0, done.stderr + done.stdout);
  assert.equal(fm(f.folder, '002-beta.md').priority, 0); // item 2 was rewritten by the reflow
  const next = run(f, f.home, ['update', '2', '--append', 'x', '--by', 'amy']);
  assert.equal(next.status, 0, next.stderr + next.stdout);
});

for (const [name, args] of [
  ['direct write', ['2', '--append', 'from amy']],
  ['completion reflow', ['1', '--status', 'done']],
]) test(`the leading pull preserves Amy's expected version of item 2 before a ${name}`, () => {
  const f = seed();
  const read = run(f, f.home, ['query', '--phase', '002-beta', '--agent', 'amy']);
  assert.equal(read.status, 0, read.stderr + read.stdout);
  const cache = viewCache(f.home, 'amy');
  const expected = readFileSync(cache, 'utf8');
  const bob = run(f, f.home2, ['update', '2', '--append', 'from bob', '--by', 'bob']);
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  const originBefore = git(f.t, '--git-dir', f.bare, 'rev-parse', 'main');
  assert.notEqual(git(f.home, 'rev-parse', 'HEAD'), originBefore);

  const amy = run(f, f.home, ['update', ...args, '--by', 'amy']);
  // The command itself pulled Bob's commit; that must not count as Amy reading it.
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), originBefore);
  assert.match(amy.stderr, /item 002-beta was changed by bob .* after you last read it/);
  assert.equal(readFileSync(cache, 'utf8'), expected);
  assert.equal(git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'), originBefore);
  assert.equal(fm(f.folder, '001-alpha.md').status, 'pending');
  assert.equal(fm(f.folder, '002-beta.md').priority, 1);
  assert.match(readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8'), /from bob/);
  assert.ok(!onOrigin(f, 'acme/demo/phases/002-beta.md').includes('from amy'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
});

function closeFixture() {
  const f = seed();
  const path = join(f.folder, 'phases', '001-alpha.md');
  const doc = parse(readFileSync(path, 'utf8'));
  store.write({ path, fm: { ...doc.fm, work_class: ['tests'], review_classes: ['tests'],
    review_refs: ['references/review/tests.md'], review_state: 'passed', estimate_min: 5 },
    body: doc.body + '\n## Definition of done\n\n- [x] Tested\n' }, f.folder);
  const con = db.connect(f.folder); db.scan(con, f.folder); con.close();
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'ready to close'); git(f.home, 'push', '-q');
  return f;
}

for (const [seq, slug] of [[2, '002-beta'], [3, '003-gamma']]) {
  test(`close validates reflowed item ${seq}'s cached version after its leading pull`, () => {
    const f = closeFixture();
    for (const item of ['001-alpha', '002-beta', '003-gamma']) {
      const r = run(f, f.home, ['query', '--phase', item, '--agent', 'amy']);
      assert.equal(r.status, 0, r.stderr + r.stdout);
    }
    const cache = viewCache(f.home, 'amy');
    const expected = readFileSync(cache, 'utf8');
    const bob = run(f, f.home2, ['update', String(seq), '--append', 'from bob', '--by', 'bob']);
    assert.equal(bob.status, 0, bob.stderr + bob.stdout);
    const originBefore = git(f.t, '--git-dir', f.bare, 'rev-parse', 'main');
    const amy = run(f, f.home, ['update', '1', '--close', '--summary', 'delivered', '--by', 'amy']);
    assert.equal(amy.status, 5, amy.stderr + amy.stdout);
    assert.ok(amy.stderr.includes(`item ${slug} was changed by bob`), amy.stderr);
    assert.equal(git(f.home, 'rev-parse', 'HEAD'), originBefore);
    assert.equal(git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'), originBefore);
    assert.equal(readFileSync(cache, 'utf8'), expected);
    assert.equal(fm(f.folder, '001-alpha.md').status, 'pending');
    assert.equal(fm(f.folder, '002-beta.md').priority, 1);
    assert.equal(fm(f.folder, '003-gamma.md').priority, 2);
    assert.equal(git(f.home, 'status', '--porcelain'), '');
  });

  test(`close guards reflowed item ${seq} against a push race, even without a cached view`, () => {
    const f = closeFixture();
    const before = git(f.home, 'rev-parse', 'HEAD');
    const hook = join(f.home, '.git', 'hooks', 'pre-push');
    const flag = join(f.t, 'hook-ran');
    writeFileSync(hook, `#!/bin/sh\n[ -f '${flag}' ] && exit 0\ntouch '${flag}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${f.cons}' && BACKLOG_HOME='${f.home2}' XDG_CONFIG_HOME='${join(f.t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update ${seq} --append 'bob won' --by bob >/dev/null 2>&1\nexit 0\n`);
    chmodSync(hook, 0o755);
    const amy = run(f, f.home, ['update', '1', '--close', '--summary', 'delivered', '--by', 'amy']);
    assert.equal(amy.status, 5, amy.stderr + amy.stdout);
    assert.ok(amy.stderr.includes(`item ${slug} was changed by bob`), amy.stderr);
    assert.match(onOrigin(f, `acme/demo/phases/${slug}.md`), /bob won/);
    assert.equal(parse(onOrigin(f, 'acme/demo/phases/001-alpha.md')).fm.status, 'pending');
    assert.equal(parse(onOrigin(f, 'acme/demo/phases/002-beta.md')).fm.priority, 1);
    assert.equal(parse(onOrigin(f, 'acme/demo/phases/003-gamma.md')).fm.priority, 2);
    assert.equal(git(f.home, 'rev-parse', 'HEAD'), before);
    assert.equal(git(f.home, 'status', '--porcelain'), '');
    assert.equal(git(f.home, 'branch', '--list').split('\n').filter(Boolean).length, 1);
    assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
    assert.equal(existsSync(viewCache(f.home, 'amy')), false);
  });
}

// Every ranking caller must use the same guard, including the two queues of a move.
for (const [name, args, target] of [
  ['new critical insertion', ['new', '--name', 'urgent', '--severity', 'critical', '--depends-on', 'none']],
  ['archive reflow', ['archive', '1', '--force']],
  ['move source reflow', ['move', '1', '--to-repository', 'acme/dest']],
  ['move destination reflow', ['move', '1', '--to-repository', 'acme/demo'], true],
]) test(`${name} refuses stale item 2 before any ranking write`, () => {
  const f = seed();
  let cwd = f.cons;
  if (target) {
    cwd = consumer(f.t, 'acme', 'source');
    const folder = join(f.home, 'acme', 'source');
    store.write({ path: join(folder, 'phases', '001-source.md'), fm: {
      ...fm(f.folder, '001-alpha.md'), phase: '001-source', repository: 'acme/source',
    }, body: '\nSource item\n' }, folder);
    const con = db.connect(folder); db.scan(con, folder); con.close();
    git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'move source'); git(f.home, 'push', '-q');
  }
  assert.equal(run(f, f.home, ['query', '--phase', '002-beta', '--agent', 'amy']).status, 0);
  const cache = viewCache(f.home, 'amy');
  const expected = readFileSync(cache, 'utf8');
  const bob = run(f, f.home2, ['update', '2', '--append', 'Bob edit survives', '--by', 'bob']);
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  const before = git(f.t, '--git-dir', f.bare, 'rev-parse', 'main');
  const amy = run(f, f.home, args, { cwd, env: { QWEN_CODE_AGENT_ID: 'amy' } });
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
  assert.match(amy.stderr, /item 002-beta was changed by bob/);
  assert.equal(readFileSync(cache, 'utf8'), expected);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'), before);
  assert.match(onOrigin(f, 'acme/demo/phases/002-beta.md'), /Bob edit survives/);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
});

// A timestamp or author is not evidence of a read. The ranking refresh may update
// beta's matching view, but must not sweep an unread change to the done item into it.
for (const [name, args] of [
  ['update priority', ['1', '--priority', '1']],
  ['update completion', ['1', '--status', 'done']],
  ['update close', ['1', '--close', '--summary', 'delivered']],
  ['update reopening', ['1', '--status', 'pending']],
  ['replan', ['--replan', '2,1']],
]) test(`${name} refreshes only matching incidental views`, () => {
  const f = closeFixture();
  const beta = join(f.folder, 'phases', '002-beta.md');
  if (name === 'update reopening') {
    const alpha = join(f.folder, 'phases', '001-alpha.md');
    const a = parse(readFileSync(alpha, 'utf8'));
    store.write({ path: alpha, fm: { ...a.fm, status: 'done' }, body: a.body }, f.folder);
    for (const [slug, priority] of [['002-beta', 0], ['003-gamma', 1]]) {
      const path = join(f.folder, 'phases', `${slug}.md`); const d = parse(readFileSync(path, 'utf8'));
      store.write({ path, fm: { ...d.fm, priority }, body: d.body }, f.folder);
    }
  }
  store.write({ path: join(f.folder, 'phases', '004-done.md'), fm: {
    ...fm(f.folder, '003-gamma.md'), phase: '004-done', seq: 4, status: 'done', updated_by: 'amy',
  }, body: '\nA previously read done item\n' }, f.folder);
  const con = db.connect(f.folder); db.scan(con, f.folder); con.close();
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'cache fixture'); git(f.home, 'push', '-q');
  for (const slug of ['002-beta', '004-done']) {
    const r = run(f, f.home, ['query', '--phase', slug, '--agent', 'amy']);
    assert.equal(r.status, 0, r.stderr + r.stdout);
  }
  const cache = viewCache(f.home, 'amy');
  const expected = JSON.parse(readFileSync(cache, 'utf8'))['acme/demo/004-done'];
  git(f.home2, 'pull', '-q', '--rebase');
  const done = join(f.folder2, 'phases', '004-done.md');
  writeFileSync(done, readFileSync(done, 'utf8') + '\nUnread edit; author and timestamp unchanged\n');
  git(f.home2, 'add', '-A'); git(f.home2, 'commit', '-q', '-m', 'unread edit'); git(f.home2, 'push', '-q');
  const before = readFileSync(beta, 'utf8');
  const amy = run(f, f.home, ['update', ...args, '--by', 'amy']);
  assert.equal(amy.status, 0, amy.stderr + amy.stdout);
  assert.notEqual(readFileSync(beta, 'utf8'), before, 'the caller really reflowed beta');
  assert.deepEqual(JSON.parse(readFileSync(cache, 'utf8'))['acme/demo/004-done'], expected, 'unread content must not be adopted just because updated_by is amy');
  const next = run(f, f.home, ['update', '2', '--append', 'known reflow', '--by', 'amy']);
  assert.equal(next.status, 0, next.stderr + next.stdout);
  const stale = run(f, f.home, ['update', '4', '--append', 'must refuse', '--by', 'amy']);
  assert.equal(stale.status, 5, stale.stderr + stale.stdout);
});

test('database reconciliation validates the entire incidental write set', async () => {
  const f = seed();
  assert.equal(run(f, f.home, ['query', '--phase', '003-gamma', '--agent', 'amy']).status, 0);
  const bob = run(f, f.home2, ['update', '3', '--append', 'Bob edit survives', '--by', 'bob']);
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  git(f.home, 'pull', '-q', '--rebase');
  const alpha = join(f.folder, 'phases', '001-alpha.md');
  const a = parse(readFileSync(alpha, 'utf8'));
  store.write({ path: alpha, fm: { ...a.fm, status: 'done' }, body: a.body }, f.folder);
  const before = ['002-beta.md', '003-gamma.md'].map(n => readFileSync(join(f.folder, 'phases', n), 'utf8'));
  const seen = await import('../../src/shared/seen.js');
  seen.setActor('amy');
  try {
    await assert.rejects(async () => db.reconcileFolders([f.folder], []), { exitCode: 5 });
    assert.deepEqual(['002-beta.md', '003-gamma.md'].map(n => readFileSync(join(f.folder, 'phases', n), 'utf8')), before);
  } finally { seen.setActor('nobody'); }
});

for (const [name, args, target] of [
  ['new insertion', ['new', '--name', 'urgent', '--severity', 'critical', '--depends-on', 'none']],
  ['new with inherited operation lock', ['new', '--name', 'urgent', '--severity', 'critical', '--depends-on', 'none']],
  ['archive', ['archive', '1', '--force']],
  ['move source', ['move', '1', '--to-repository', 'acme/dest']],
  ['move destination', ['move', '1', '--to-repository', 'acme/demo'], true],
]) test(`${name} publishes with a guard for incidental items never read by Amy`, () => {
  const f = seed();
  let cwd = f.cons;
  if (target) {
    cwd = consumer(f.t, 'acme', 'source');
    const folder = join(f.home, 'acme', 'source');
    store.write({ path: join(folder, 'phases', '001-source.md'), fm: {
      ...fm(f.folder, '001-alpha.md'), phase: '001-source', repository: 'acme/source',
    }, body: '\nSource item\n' }, folder);
    const con = db.connect(folder); db.scan(con, folder); con.close();
    git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'move source'); git(f.home, 'push', '-q');
  }
  const before = git(f.home, 'rev-parse', 'HEAD');
  const hook = join(f.home, '.git', 'hooks', 'pre-push'); const flag = join(f.t, 'hook-ran');
  writeFileSync(hook, `#!/bin/sh\n[ -f '${flag}' ] && exit 0\ntouch '${flag}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${f.cons}' && BACKLOG_HOME='${f.home2}' XDG_CONFIG_HOME='${join(f.t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update 2 --append 'bob won' --by bob >/dev/null 2>&1\nexit 0\n`);
  chmodSync(hook, 0o755);
  const amy = run(f, f.home, args, { cwd, env: { QWEN_CODE_AGENT_ID: 'amy',
    ...(name.includes('inherited') ? { BACKLOG_RUN_LOCK_HELD: `${join(f.home, '.git', 'smooth-backlog-cli-run.lock')}:${process.pid}` } : {}),
  } });
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
  assert.match(amy.stderr, /item 002-beta was changed by bob/);
  assert.match(onOrigin(f, 'acme/demo/phases/002-beta.md'), /bob won/);
  assert.equal(parse(onOrigin(f, 'acme/demo/phases/002-beta.md')).fm.priority, 1);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  assert.equal(existsSync(viewCache(f.home, 'amy')), false);
});

for (const cached of [false, true]) test(`reconciliation ${cached ? 'refuses a stale cached view' : 'adds newly discovered incidental writes to the next publication guard'}`, () => {
  const f = seed();
  const cache = viewCache(f.home, 'amy');
  if (cached) assert.equal(run(f, f.home, ['query', '--phase', '003-gamma', '--agent', 'amy']).status, 0);
  const expected = cached ? readFileSync(cache, 'utf8') : null;
  const script = join(f.t, 'bob-reconcile.mjs');
  writeFileSync(script, `import { readFileSync } from 'node:fs';
import * as store from ${JSON.stringify(join(process.cwd(), 'src/shared/store.js'))};
import * as db from ${JSON.stringify(join(process.cwd(), 'src/shared/db.js'))};
import { parse } from ${JSON.stringify(join(process.cwd(), 'src/shared/frontmatter.js'))};
import { setActor } from ${JSON.stringify(join(process.cwd(), 'src/shared/seen.js'))};
setActor('bob');
const path = ${JSON.stringify(join(f.folder2, 'phases', '003-gamma.md'))};
const doc = parse(readFileSync(path, 'utf8'));
store.write({ path, fm: store.stamp({ ...doc.fm, priority: 4 }), body: doc.body + '\\nBob first edit\\n' }, ${JSON.stringify(f.folder2)});
const con = db.connect(${JSON.stringify(f.folder2)}); db.scan(con, ${JSON.stringify(f.folder2)}); con.close();
`);
  const hook = join(f.home, '.git', 'hooks', 'pre-push'); const flag = join(f.t, 'first-push'); const second = join(f.t, 'second-push');
  writeFileSync(hook, `#!/bin/sh
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
if [ ! -f '${flag}' ]; then
  touch '${flag}'
  '${process.execPath}' '${script}' && git -C '${f.home2}' add -A && git -C '${f.home2}' commit -qm 'Bob changes the queue' && git -C '${f.home2}' push -q
elif [ ! -f '${second}' ]; then
  touch '${second}'
  cd '${f.cons}' && BACKLOG_HOME='${f.home2}' XDG_CONFIG_HOME='${join(f.t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update 3 --append 'Bob second edit' --by bob
fi
exit 0
`);
  chmodSync(hook, 0o755);
  const amy = run(f, f.home, ['update', '1', '--append', 'Amy refused', '--by', 'amy']);
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
  assert.match(amy.stderr, /item 003-gamma was changed by bob/);
  assert.equal(existsSync(second), !cached, 'cached staleness refuses before a second push; otherwise the next push is guarded');
  assert.match(onOrigin(f, 'acme/demo/phases/003-gamma.md'), cached ? /Bob first edit/ : /Bob second edit/);
  assert.ok(!onOrigin(f, 'acme/demo/phases/001-alpha.md').includes('Amy refused'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
  if (cached) assert.equal(readFileSync(cache, 'utf8'), expected);
  else assert.equal(existsSync(cache), false);
});

test('review P2: exact agent names keep independent views despite slash, space and Unicode collisions', async () => {
  const f = seed(['alpha']);
  const seen = await import('../../src/shared/seen.js');
  const path = 'phases/001-alpha.md';
  const file = join(f.folder, path);
  const original = readFileSync(file, 'utf8');
  for (const [first, second] of [['team/alice', 'team_alice'], ['team alice', 'team_alice'], ['é', '_'], ['é', 'ø']]) {
    writeFileSync(file, original);
    seen.view(first, f.folder, 'acme/demo', { slug: '001-alpha', path });
    writeFileSync(file, original + '\nchanged after first read\n');
    seen.view(second, f.folder, 'acme/demo', { slug: '001-alpha', path });
    assert.throws(() => seen.check(f.folder, 'acme/demo', first, '001-alpha', path), e => e.code === 'STALE_ITEM', `${first} must keep its stale view after ${second} reads`);
    assert.doesNotThrow(() => seen.check(f.folder, 'acme/demo', second, '001-alpha', path));
  }
});

test('review P2: published write views follow chained renumberings only in their own repository folder', async () => {
  const f = seed(['alpha']);
  const seen = await import('../../src/shared/seen.js');
  const target = join(f.home, 'new', 'place');
  const path = 'archive/phases/003-alpha.md';
  mkdirSync(join(target, 'archive', 'phases'), { recursive: true });
  writeFileSync(join(target, path), readFileSync(join(f.folder, 'phases/001-alpha.md'), 'utf8'));
  const pairs = [Object.assign([1, 2], { folder: target }), Object.assign([2, 3], { folder: target })];
  seen.recordWrites(f.folder, 'acme/demo', 'amy', [
    { slug: '001-alpha', path: 'phases/001-alpha.md' },
    { folder: target, repo: 'new/place', slug: '001-alpha', path: 'archive/phases/001-alpha.md' },
  ], pairs);
  const cache = JSON.parse(readFileSync(viewCache(f.home, 'amy'), 'utf8'));
  assert.equal(cache['acme/demo/001-alpha'].path, 'phases/001-alpha.md', 'the source number is unchanged');
  assert.equal(cache['new/place/003-alpha'].path, path, 'the destination uses its final number and retains its directory');
  writeFileSync(join(target, path), readFileSync(join(target, path), 'utf8') + '\nanother writer\n');
  assert.throws(() => seen.check(target, 'new/place', 'amy', '003-alpha', path), { exitCode: 5 });
});

test('review P2: a renumbered incidental write retains proof of the previously read bytes', async () => {
  const f = seed(['alpha']);
  const seen = await import('../../src/shared/seen.js');
  const old = 'phases/001-alpha.md'; const path = 'phases/003-alpha.md';
  seen.view('amy', f.folder, 'acme/demo', { slug: '001-alpha', path: old });
  seen.setActor('amy');
  try {
    await seen.guarded(() => {
      seen.guardReflow(f.folder, store.load(f.folder));
      renameSync(join(f.folder, old), join(f.folder, path));
      writeFileSync(join(f.folder, path), readFileSync(join(f.folder, path), 'utf8') + '\npublished reflow\n');
      seen.recordWrites(f.folder, 'acme/demo', 'amy', [], [Object.assign([1, 3], { folder: f.folder })]);
    });
    assert.doesNotThrow(() => seen.check(f.folder, 'acme/demo', 'amy', '003-alpha', path));
    writeFileSync(join(f.folder, path), readFileSync(join(f.folder, path), 'utf8') + '\nanother writer\n');
    assert.throws(() => seen.check(f.folder, 'acme/demo', 'amy', '003-alpha', path), { exitCode: 5 });
  } finally { seen.setActor('nobody'); }
});
