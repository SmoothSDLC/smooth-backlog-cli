// Stale-view guard (backlog-cli item 025): updated_by, the per-agent read cache, the refusal (exit 5) and the push race.
// Also: no write by path replaces another item (move/new/archive), and a release ends the holder's wait.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import * as index from '../../src/shared/index.js';
import { parseItem as parse } from '../../src/shared/frontmatter.js';
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
  git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', 'fixture'); git(home, 'push', '-q');
  const home2 = join(t, 'home2');
  git(t, 'clone', '-q', join(t, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`), home2);
  return { t, home, home2, cons, folder, folder2: join(home2, 'acme', repo), bare: join(t, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`) };
}
// the CLI as the clone `home`; the agent is named by --agent/--by on the command
const run = (f, home, args, opts = {}) => cli(args, { cwd: opts.cwd ?? f.cons, tmp: f.t, env: { BACKLOG_HOME: home, BACKLOG_AGENT: '', USER: 'nobody', ...opts.env } });
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
  const env = run(f, f.home, ['update', '2', '--append', 'y'], { env: { BACKLOG_AGENT: 'agent-7' } });
  assert.equal(env.status, 0, env.stderr);
  assert.equal(fm(f.folder, '002-beta.md').updated_by, 'agent-7');
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
  assert.match(a.stderr, /item 001-alpha was changed by bob at \d{4}-\d\d-\d\dT[\d:]+Z after you last read it \(2026-10-01T00:00:00Z\); read it again \(backlog query --phase 001-alpha --agent <you>\) and retry/);
  assert.match(a.stdout, /^--- current 001-alpha ---$/m, 'the refusal shows the item as it is now');
  assert.match(a.stdout, /from bob/, "with the other writer's change");
  assert.doesNotMatch(a.stdout, /phases\//, 'and no path');
  assert.equal(git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'), originBefore);
  assert.ok(!onOrigin(f, 'acme/demo/phases/001-alpha.md').includes('from amy'));
  assert.ok(!readFileSync(join(f.folder, 'phases', '001-alpha.md'), 'utf8').includes('from amy'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.ok(git(f.home, 'rev-parse', 'HEAD') !== '' && git(f.home, 'merge-base', '--is-ancestor', localBefore, 'HEAD') === '');
  // reading again lifts the refusal
  assert.equal(run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']).status, 0);
  assert.equal(run(f, f.home, ['update', '1', '--append', 'from amy', '--by', 'amy']).status, 0);
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
  assert.match(a.stdout, /^--- current 001-alpha ---$[^]*bob won/m, 'the item as the push race left it on the origin is shown');
  assert.match(onOrigin(f, 'acme/demo/phases/001-alpha.md'), /bob won/);
  assert.ok(!onOrigin(f, 'acme/demo/phases/001-alpha.md').includes('amy lost'));
  assert.equal(git(f.home, 'branch', '--list').split('\n').filter(Boolean).length, 1); // no side branch
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.ok(!readFileSync(join(f.folder, 'phases', '001-alpha.md'), 'utf8').includes('amy lost'));
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '0');
});

test('053: a publication refusal also names another item the agent read that changed only upstream', () => {
  const f = seed();
  run(f, f.home, ['query', '--phase', '001-alpha,002-beta', '--agent', 'amy']);
  // while amy's push is on its way, bob changes both items she read
  const hook = join(f.home, '.git', 'hooks', 'pre-push');
  const flag = join(f.t, 'hook-ran');
  const bob = n => `BACKLOG_HOME='${f.home2}' XDG_CONFIG_HOME='${join(f.t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update ${n} --append 'bob ${n}' --by bob >/dev/null 2>&1`;
  writeFileSync(hook, `#!/bin/sh\n[ -f '${flag}' ] && exit 0\ntouch '${flag}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${f.cons}' && ${bob(1)} && ${bob(2)}\nexit 0\n`);
  chmodSync(hook, 0o755);
  const a = run(f, f.home, ['update', '1', '--append', 'amy lost', '--by', 'amy']);
  assert.equal(a.status, 5, a.stderr + a.stdout);
  assert.match(a.stderr, /item 001-alpha was changed by bob .*1 other item\(s\) you read changed too \(002-beta\); read them again \(backlog query --phase 001-alpha,002-beta --agent <you>\)/);
});

test('a move never replaces an item of the target that holds the file name, even after update --seq freed its number', () => {
  const f = seed(['temp', 'beta'], 'dest');
  const src = consumer(f.t, 'acme', 'demo', 'main');
  const sfolder = join(f.home, 'acme', 'demo');
  store.write({ path: join(sfolder, 'phases', '001-beta.md'), fm: { phase: '001-beta', seq: 1, name: 'Source beta', objective: 'src', summary: 's', status: 'pending', severity: 'normal', priority: 0, repository: 'acme/demo', branch: 'main', commit: '', location: '', created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z', depends_on: [], claimed_by: '', claimed_at: '' }, body: '\n# Phase 1\n\nSOURCE BODY\n' }, sfolder);
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
  run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']); // the first read publishes the index of the legacy folder
  git(f.home2, 'pull', '-q', '--rebase');
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
  const made = run(f, f.home, ['new', '--name', 'fresh job', '--depends-on', 'none'], { env: { BACKLOG_AGENT: 'amy' } });
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const bob = run(f, f.home2, ['update', '4', '--append', 'bob', '--by', 'bob']);
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  const amy = run(f, f.home, ['update', '4', '--append', 'amy'], { env: { BACKLOG_AGENT: 'amy' } });
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
});

test('053: a cross-repository move refused for its own item also names the changed item it read in the destination', () => {
  const f = seed();
  const cwd = consumer(f.t, 'acme', 'source');
  const folder = join(f.home, 'acme', 'source');
  store.write({ path: join(folder, 'phases', '001-source.md'), fm: { ...fm(f.folder, '001-alpha.md'), phase: '001-source', repository: 'acme/source' }, body: '\nSource item\n' }, folder);
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'move source'); git(f.home, 'push', '-q');
  assert.equal(run(f, f.home, ['query', '--phase', '002-beta', '--agent', 'amy']).status, 0);
  assert.equal(run(f, f.home, ['query', '--phase', '001-source', '--agent', 'amy'], { cwd }).status, 0);
  assert.equal(run(f, f.home2, ['update', '2', '--append', 'bob', '--by', 'bob']).status, 0);
  const src2 = run(f, f.home2, ['update', '1', '--append', 'bob', '--by', 'bob'], { cwd });
  assert.equal(src2.status, 0, src2.stderr + src2.stdout);
  const amy = run(f, f.home, ['move', '1', '--to-repository', 'acme/demo'], { cwd, env: { BACKLOG_AGENT: 'amy' } });
  assert.equal(amy.status, 5, amy.stderr + amy.stdout);
  assert.match(amy.stderr, /item 001-source was changed by bob .*1 other item\(s\) you read changed too \(002-beta of acme\/demo\); read them again \(backlog query --phase 001-source --agent <you>; in repository acme\/demo: backlog query --phase 002-beta --agent <you>\)/);
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

// Item 053: another agent's reflow that changed only ranks is no change for this agent's planning move; a change of an
// item's content still refuses its write, and the refusal names one command that reads every item a move re-ranks.
test('053: after bob closes an item, amy moves another at once; a content change still refuses her write until she reads', () => {
  const f = seed(['alpha', 'beta', 'gamma', 'delta']);
  for (const item of ['002-beta', '003-gamma', '004-delta']) assert.equal(run(f, f.home, ['query', '--phase', item, '--agent', 'amy']).status, 0);
  assert.equal(run(f, f.home2, ['query', '--phase', '001-alpha', '--agent', 'bob']).status, 0);
  const bob = run(f, f.home2, ['update', '1', '--status', 'done', '--by', 'bob']); // the reflow re-ranks beta, gamma and delta
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  const amy = run(f, f.home, ['update', '4', '--priority', '0', '--by', 'amy']); // reranks beta and gamma again
  assert.equal(amy.status, 0, amy.stderr + amy.stdout);
  assert.equal(index.rows(f.folder).rows.find(r => r.slug === '004-delta').priority, 0);
  const content = run(f, f.home2, ['update', '3', '--append', 'from bob', '--by', 'bob']);
  assert.equal(content.status, 0, content.stderr + content.stdout);
  const stale = run(f, f.home, ['update', '3', '--append', 'from amy', '--by', 'amy']);
  assert.equal(stale.status, 5, stale.stderr + stale.stdout);
  assert.match(stale.stderr, /item 003-gamma was changed by bob .*read it again \(backlog query --phase 003-gamma --agent <you>\)/);
  assert.equal(run(f, f.home, ['query', '--phase', '3', '--agent', 'amy']).status, 0);
  const again = run(f, f.home, ['update', '3', '--append', 'from amy', '--by', 'amy']);
  assert.equal(again.status, 0, again.stderr + again.stdout);
});

