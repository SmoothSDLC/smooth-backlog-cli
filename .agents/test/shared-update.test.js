// Tests for src/shared/update.js: `backlog update`, non-team flags.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, utimesSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKLOG_NAME, BACKLOG_OWNER, breakIndex, cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { cliAsync, numberClash, pushedState, waitsForRunLock } from './shared-concurrency.js';
import * as index from '../../src/shared/index.js';
import { dump, parseItem as parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';
import { editSection } from '../../src/shared/update.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// A shared home with consumer acme/demo on main and seven items: four open (one in progress, one waiting), one with
// a review class, one done. the item files are fixed text.
function seed() {
  const t = mkdtempSync(join(tmpdir(), 'update-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const folder = join(home, 'acme', 'demo');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const item = (seq, name, extra = {}) => {
    const num = String(seq).padStart(3, '0');
    store.write({
      path: join(folder, `phases/${num}-${name}.md`),
      fm: {
        phase: `${num}-${name}`, seq, name: `Name ${name}`, objective: `Café ☕ ${name}`, summary: `sum ${name}`, status: 'pending',
        severity: 'normal', priority: seq - 1, repository: 'acme/demo', branch: 'main', commit: '', location: '',
        created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z', depends_on: [], claimed_by: '', claimed_at: '', ...extra,
      },
      body: `\n# Phase ${num}\n\nBody of ${name}.\n`,
    }, folder);
  };
  item(1, 'alpha');
  item(2, 'beta');
  item(3, 'gamma', { status: 'in_progress' });
  item(4, 'delta', { wait_on: 'workflow run', wait_since: '2026-10-02T00:00:00Z' });
  item(5, 'epsilon', { review_refs: ['references/review/tests.md'], review_state: '' });
  item(6, 'zeta', { status: 'done', priority: 5, completed: '2026-10-02T00:00:00Z' });
  git(home, 'add', '-A');
  git(home, 'commit', '-q', '-m', 'fixture');
  git(home, 'push', '-q');
  return { t, home, cons, folder };
}

const run = (f, args) => cli(['update', ...args], { cwd: f.cons, tmp: f.t });
const rankOf = (f, slug) => index.rows(f.folder).rows.find(r => r.slug === slug).priority; // the rank is in the index, not in the item
const fm = (f, name) => parse(readFileSync(join(f.folder, 'phases', name), 'utf8'));

test('the class options are gone: --set-work-class and --set-review-classes are unrecognized, nothing is written', () => {
  const f = seed();
  const before = readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8');
  for (const flag of ['--set-work-class', '--set-review-classes']) {
    const r = run(f, ['2', flag, 'docs']);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, new RegExp(`unrecognized arguments: ${flag}`));
  }
  assert.equal(readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8'), before);
});

test('update --priority changes the index and no other item file; the item itself is stamped and records the move', () => {
  const f = seed();
  const files = () => Object.fromEntries(readdirSync(join(f.folder, 'phases')).map(n => [n, readFileSync(join(f.folder, 'phases', n), 'utf8')]));
  assert.equal(run(f, ['1', '--summary', 'first write builds the index']).status, 0);
  const before = files();
  const indexBefore = readFileSync(join(f.folder, 'index.json'), 'utf8');
  const r = run(f, ['2', '--priority', '0']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const after = files();
  for (const n of Object.keys(before).filter(x => !x.startsWith('002'))) assert.equal(after[n], before[n], `${n} was not rewritten`);
  assert.notEqual(readFileSync(join(f.folder, 'index.json'), 'utf8'), indexBefore, 'the order is in the index');
  assert.equal(rankOf(f, '002-beta'), 0);
  assert.equal(rankOf(f, '001-alpha'), 1);
  assert.match(parse(after['002-beta.md']).fm.events.at(-1), / planning_event /);
});

test('a folder whose items carry the rank of an earlier build gets its index at the first write; the items lose the key when they are next written', () => {
  const f = seed();
  for (const [n, rank] of [['001-alpha', 3], ['002-beta', 1], ['003-gamma', 2], ['004-delta', 0], ['005-epsilon', 4], ['006-zeta', 5]]) { // the ranks an earlier build wrote
    const p = join(f.folder, 'phases', `${n}.md`);
    const doc = parse(readFileSync(p, 'utf8'));
    writeFileSync(p, dump({ ...doc.fm, priority: rank }, doc.body));
  }
  rmSync(join(f.folder, 'index.json'), { force: true }); // the fixture's writes made one; an earlier build had none
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'legacy ranks'); git(f.home, 'push', '-q');
  assert.equal(existsSync(join(f.folder, 'index.json')), false);
  assert.equal(fm(f, '003-gamma.md').fm.priority, 2);
  assert.equal(run(f, ['3', '--summary', 'written']).status, 0);
  assert.deepEqual(index.read(f.folder).branches.main.map(e => e.slug), ['004-delta', '002-beta', '003-gamma', '001-alpha', '005-epsilon', '006-zeta'], 'the order the priority fields gave, open items first');
  assert.equal(Object.hasOwn(fm(f, '003-gamma.md').fm, 'priority'), false, 'the written item lost the key');
  assert.equal(fm(f, '002-beta.md').fm.priority, 1, 'an item nobody wrote keeps it, ignored');
  assert.equal(run(f, ['2', '--summary', 'written']).status, 0);
  assert.equal(Object.hasOwn(fm(f, '002-beta.md').fm, 'priority'), false);
});

test('a bare number is the item number, never the database row id', t => {
  const f = seed();
  const r = run(f, ['2', '--status', 'in_progress']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^✅ 002-beta updated/);
  assert.equal(fm(f, '002-beta.md').fm.status, 'in progress');
  assert.equal(fm(f, '001-alpha.md').fm.status, 'pending'); // row id 2 is item 1: it must not be touched
  assert.equal(fm(f, '003-gamma.md').fm.updated, '2026-10-01T00:00:00Z');
  const p = run(f, ['3', '--priority', '0']);
  assert.match(p.stdout, /P0/);
  assert.equal(rankOf(f, '003-gamma'), 0);
  assert.equal(rankOf(f, '001-alpha'), 1);
});

test('order of work: pull first, then change, write, log the event, commit and push', () => {
  const f = seed();
  const other = join(f.t, 'other');
  git(f.t, 'clone', '-q', join(f.t, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`), other);
  const text = readFileSync(join(other, 'acme', 'demo', 'phases', '004-delta.md'), 'utf8').replace('sum delta', 'remote summary');
  writeFileSync(join(other, 'acme', 'demo', 'phases', '004-delta.md'), text);
  git(other, 'commit', '-q', '-am', 'remote edit');
  git(other, 'push', '-q');
  const r = run(f, ['4', '--status', 'in_progress', '--note', 'go']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fm(f, '004-delta.md').fm.summary, 'remote summary'); // the pull happened before the item was read and rewritten
  const log = git(f.home, 'log', '--format=%s', '-1');
  assert.equal(log, 'acme/demo: update 4 --status');
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  const item = fm(f, '004-delta.md').fm;
  assert.equal(item.status, 'in progress');
  const e = store.parseEvent(item.events.at(-1));
  assert.deepEqual([e.event, e.note], ['state_change', 'go']);
  const head = git(f.home, 'show', '--stat', '--format=', 'HEAD');
  assert.doesNotMatch(head, /backlog\.db/);
  assert.match(head, /acme\/demo\/phases\/004-delta\.md/);
});

test('a refusal and a dry run make no commit', () => {
  const f = seed();
  const head = git(f.home, 'rev-parse', 'HEAD');
  assert.equal(run(f, ['2', '--branch', 'x']).status, 1);
  assert.equal(run(f, ['2', '--status', 'done', '--dry-run']).status, 0);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), head);
});

test('diagnostics that echo the input are redacted', () => {
  const f = seed();
  const r = run(f, ['https://user:s3cret@host/x']);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr, /s3cret/);
  const u = run(f, ['2', '--bogus=user:s3cret@host']);
  assert.equal(u.status, 2);
  assert.doesNotMatch(u.stdout + u.stderr, /s3cret/);
});

test('a repository without a backlog yet: no phase, exit 1', () => {
  const f = seed();
  rmSync(f.folder, { recursive: true });
  git(f.home, 'add', '-A');
  git(f.home, 'commit', '-q', '-m', 'drop');
  git(f.home, 'push', '-q');
  const r = run(f, ['1', '--status', 'done']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^❌ no phase '1' \(create it with backlog new\)\n$/);
});

// ---------------------------------------------------------------- review fixes (job 11)

test('review P1: update holds the per-repository run lock from the pull to the push (a held lock makes it wait)', async () => {
  const f = seed();
  const watch = () => fm(f, '002-beta.md').fm.summary;
  const { during, result, before } = await waitsForRunLock(f, ['update', '2', '--summary', 'locked change'], watch);
  assert.deepEqual(during, { exited: false, same: true }, 'the command must wait while another command holds the lock');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(before, 'sum beta');
  assert.equal(watch(), 'locked change');
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
});

test('review P1: a renumbering during the commit is followed by a rescan that is committed and pushed (db and working tree current)', () => {
  const f = seed();
  numberClash(f);
  const r = run(f, ['2', '--summary', 'with a clash']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /renumbered 008 -> 009/);
  assert.equal(git(f.home, 'status', '--porcelain'), '', 'the tree is clean');
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
  const pushed = pushedState(f);
  assert.ok(pushed.slugs.includes('009-local') && !pushed.slugs.includes('008-local'), pushed.slugs.join());
  assert.ok(pushed.files.includes('phases/009-local.md') && !pushed.files.includes('phases/008-local.md'));
});

test('review P2: --summary="two words" and --append="extra text" are options with a value, not positionals (argparse)', () => {
  const f = seed();
  const a = run(f, ['2', '--summary=two words']);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(fm(f, '002-beta.md').fm.summary, 'two words');
  const b = run(f, ['2', '--append=extra text']);
  assert.equal(b.status, 0, b.stderr);
  assert.match(fm(f, '002-beta.md').body, /\n\nextra text\n$/);
  assert.equal(run(f, ['--summary=two words', '2']).status, 0); // the option may come first
  assert.equal(run(f, ['an item', '--bogus x']).status, 2);       // an unknown option with a space is a positional: two of them are an error
});

// ---------------------------------------------------------------- review fixes (job 15)

// An item that a team can claim: a review document, an estimate and a definition of done.
function claimable(f) {
  const r = run(f, ['2', '--set-review-refs', 'references/review/tests.md', '--set-estimate', '10', '--append', '## Definition of done\n- [ ] x']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

test('review P1 (job 15): two processes cannot both claim an unclaimed item; a claim waits for the run lock', async () => {
  const f = seed();
  claimable(f);
  const w = await waitsForRunLock(f, ['update', '2', '--claim', 'ann'], () => fm(f, '002-beta.md').fm.claimed_by);
  assert.deepEqual(w.during, { exited: false, same: true }, 'the claim waits while another command holds the lock');
  assert.equal(w.result.status, 0, w.result.stdout + w.result.stderr);
  const g = seed();
  claimable(g);
  const both = await Promise.all(['ann', 'amy'].map(who => cliAsync(['update', '2', '--claim', who], { cwd: g.cons, tmp: g.t }).done));
  assert.deepEqual(both.map(r => r.status).sort(), [0, 1], both.map(r => r.stdout + r.stderr).join('\n'));
  const winner = both[0].status === 0 ? 'ann' : 'amy';
  assert.equal(fm(g, '002-beta.md').fm.claimed_by, winner);
  assert.equal(git(g.home, 'status', '--porcelain'), '');
  assert.equal(git(g.home, 'rev-parse', 'origin/main'), git(g.home, 'rev-parse', 'HEAD'));
});

test('review P2 (job 15): --set-review-refs goes through checkRefs: an absolute or ..-crossing ref is refused and nothing is written', () => {
  const f = seed();
  const before = readFileSync(join(f.folder, 'phases', '005-epsilon.md'), 'utf8');
  const head = git(f.home, 'rev-parse', 'HEAD');
  for (const ref of ['../../outside/tests.md', '/outside/tests.md']) {
    const r = run(f, ['5', '--set-review-refs', ref]);
    assert.notEqual(r.status, 0, ref);
    assert.match(r.stdout + r.stderr, /review ref .* (is absolute|contains '\.\.')/);
  }
  assert.equal(readFileSync(join(f.folder, 'phases', '005-epsilon.md'), 'utf8'), before);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('review P2: update on an archived item is refused for every flag that goes through it, and writes nothing', () => {
  const f = seed();
  assert.equal(cli(['archive', '2', '--force'], { cwd: f.cons, tmp: f.t }).status, 0);
  const file = join(f.folder, 'archive', 'phases', '002-beta.md');
  const before = readFileSync(file, 'utf8');
  const head = git(f.home, 'rev-parse', 'HEAD');
  for (const args of [['002-beta', '--summary', 'new'], ['2', '--status', 'done'], ['002-beta', '--claim', 'me'], ['002-beta', '--request-review', 'rex'], ['002-beta', '--close']]) {
    const r = run(f, args);
    assert.equal(r.status, 1, `${args}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /002-beta is archived and cannot be edited \(archived items are read-only\)/, args.join(' '));
  }
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('review P1: update whose index write is refused restores the file, and commits nothing', () => {
  const f = seed();
  breakIndex(f.home, f.folder);
  const target = join(f.folder, 'phases', '002-beta.md');
  const text = readFileSync(target, 'utf8');
  const head = git(f.home, 'rev-parse', 'HEAD');
  const r = run(f, ['2', '--priority', '0']); // the item is written, then the order cannot be
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(target, 'utf8'), text);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('review P2: after two clones picked one number, the merged queue is re-densified (no two items share a priority)', () => {
  const f = seed();
  numberClash(f);
  assert.equal(run(f, ['1', '--summary', 'touch']).status, 0);
  const ranks = actionableRanks(f);
  assert.deepEqual(ranks, ranks.map((_, i) => i));
});

test('review P1: update of an item of another team (field edit, note, append) is refused and writes nothing', () => {
  const f = seed();
  const text = readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8');
  const head = git(f.home, 'rev-parse', 'HEAD');
  for (const args of [['2', '--summary', 'x'], ['2', '--note', 'x'], ['2', '--append', 'x'], ['2', '--priority', '0'], ['2', '--section', 'Evidence', '--add-line', 'x']]) {
    const r = cli(['update', ...args], { cwd: f.cons, tmp: f.t, env: { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'release' } });
    assert.equal(r.status, 1, `${args}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /team session is bound/);
  }
  assert.equal(readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8'), text);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

for (const [title, args] of [['query', ['query', '--all']], ['next', ['next']], ['pop', ['team', 'pop', '--team', 't1', '--agent', 'ann']]]) {
  test(`review P1: ${title} (a read that pulls) waits while another command holds the operation lock of the clone`, async () => {
    const f = seed();
    const w = await waitsForRunLock(f, args, () => git(f.home, 'rev-parse', 'HEAD'));
    assert.deepEqual(w.during, { exited: false, same: true }, `${title} waits for the lock`);
  });
}

test('review P1: a lock left by a dead process is taken over (said once); a live holder is waited for and, after the configured wait, named in the refusal', async () => {
  const f = seed();
  const lock = join(f.home, '.git', 'smooth-backlog-cli-run.lock');
  const dead = spawnSync(process.execPath, ['-e', '0']).pid; // a pid that was alive a moment ago and is not now
  writeFileSync(lock, JSON.stringify({ pid: dead, host: hostname(), command: 'update' }));
  const r = cli(['query', '--all'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr.split(`took over a stale lock of process ${dead}`).length, 2, r.stderr);
  assert.equal(existsSync(lock), false, 'the lock is released after the command');

  // a live holder: refused after the configured wait, naming pid and command
  let refused;
  await store.cloneLocked(f.home, async () => { refused = cli(['query', '--all'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_LOCK_WAIT_MS: '400' } }); });
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stderr, new RegExp(`locked by another process \\((agent [^,]+, )?pid ${process.pid}[,)]`));
  assert.match(refused.stderr, /since \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\)/); // item 025: since when
  // a holder that finishes inside the configured wait: the command waits and succeeds
  let ok;
  await store.cloneLocked(f.home, async () => {
    const child = cliAsync(['query', '--all'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_LOCK_WAIT_MS: '15000' } });
    await new Promise(res => setTimeout(res, 1500));
    assert.equal(child.exited(), false, 'still waiting while the holder runs');
    ok = child;
  });
  assert.equal((await ok.done).status, 0);
});

// The takeover of a dead owner's lock is exclusive: several processes racing on one dead lock, with fresh locks created in between, never overlap.
const LOCK_JS = fileURLToPath(new URL('../../src/storage.js', import.meta.url));
const holderScript = dir => {
  const file = join(dir, 'holder.mjs');
  writeFileSync(file, `import { locked } from ${JSON.stringify(LOCK_JS)}; import { appendFileSync } from 'node:fs'; import { setTimeout as sleep } from 'node:timers/promises';
const [lock, log, id, rounds] = process.argv.slice(2);
for (let i = 0; i < Number(rounds); i++) await locked(lock, async () => { appendFileSync(log, 'in ' + id + '\\n'); await sleep(30); appendFileSync(log, 'out ' + id + '\\n'); }, { takeOver: true, wait: 60000 });\n`);
  return file;
};
const runHolder = (file, lock, log, id, rounds) => new Promise(res => { const c = spawn(process.execPath, [file, lock, log, id, rounds], { stdio: ['ignore', 'ignore', 'pipe'] }); let err = ''; c.stderr.on('data', d => { err += d; }); c.on('close', code => res({ code, err })); });

test('review P1: processes racing on one dead lock take it over one at a time: critical sections never overlap, no fresh lock is displaced', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-race-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const [lock, log] = [join(dir, 'run.lock'), join(dir, 'log')];
  writeFileSync(lock, JSON.stringify({ pid: spawnSync(process.execPath, ['-e', '0']).pid, host: hostname(), command: 'update' }));
  const script = holderScript(dir);
  const done = await Promise.all(['a', 'b', 'c', 'd'].map(id => runHolder(script, lock, log, id, 5)));
  for (const d of done) assert.equal(d.code, 0, d.err);
  const lines = readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(lines.length, 40);
  for (let i = 0; i < lines.length; i += 2) assert.deepEqual([lines[i].split(' ')[0], lines[i + 1].split(' ')[0], lines[i].split(' ')[1] === lines[i + 1].split(' ')[1]], ['in', 'out', true], lines.slice(i, i + 4).join('|'));
  assert.equal(done.map(d => d.err).join('').split('took over a stale lock').length - 1, 1, 'taken over once, by exactly one process');
});

test('review P1: a takeover marker held by another waiter keeps the others waiting; one left by a dead process is stale after 30 s', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-marker-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const [lock, log] = [join(dir, 'run.lock'), join(dir, 'log')];
  writeFileSync(lock, JSON.stringify({ pid: spawnSync(process.execPath, ['-e', '0']).pid, host: hostname(), command: 'update' }));
  writeFileSync(`${lock}.takeover`, '');
  const script = holderScript(dir);
  const quick = join(dir, 'quick.mjs');
  writeFileSync(quick, readFileSync(script, 'utf8').replace('wait: 60000', 'wait: 700'));
  const refused = await runHolder(quick, lock, log, 'x', 1);
  assert.notEqual(refused.code, 0, 'a fresh marker: the waiter does not take the lock over');
  assert.equal(existsSync(log), false);
  const old = new Date(Date.now() - 60000);
  utimesSync(`${lock}.takeover`, old, old);
  const taken = await runHolder(script, lock, log, 'y', 1);
  assert.equal(taken.code, 0, taken.err);
  assert.equal(readFileSync(log, 'utf8'), 'in y\nout y\n');
});

const actionableRanks = f => index.open(index.rows(f.folder).rows).map(m => m.priority).sort((a, b) => a - b);

for (const status of ['pending', 'in_progress']) {
  test(`review P2: an item that returns from done to ${status} is ranked again: no two actionable items share a priority`, () => {
    const f = seed();
    const r = run(f, ['6', '--status', status]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const ranks = actionableRanks(f);
    assert.equal(ranks.length, 6);
    assert.deepEqual(ranks, ranks.map((_, i) => i));
  });
}

test('review P1: a bound team session reorders and re-ranks only its own items: --replan naming another team is refused, other files are never written', () => {
  const f = seed();
  git(f.cons, 'push', '-q', 'origin', 'HEAD:refs/heads/release');
  for (const n of ['2', '3']) assert.equal(cli(['move', n, '--to-branch', 'release'], { cwd: f.cons, tmp: f.t }).status, 0); // two items of the team's branch; the rest stay on main
  const team = { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'release' };
  const t = args => cli(['update', ...args], { cwd: f.cons, tmp: f.t, env: team });
  const others = () => JSON.stringify(readdirSync(join(f.folder, 'phases')).filter(n => !/^00[23]/.test(n)).map(n => readFileSync(join(f.folder, 'phases', n), 'utf8')));
  const [before, head] = [others(), git(f.home, 'rev-parse', 'HEAD')];
  const refused = t(['--replan', '1,3']);
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stdout, /001-alpha.*team session is bound to acme\/demo branch release/);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
  const [a, b] = [rankOf(f, '002-beta'), rankOf(f, '003-gamma')];
  assert.equal(t(['--replan', '003-gamma,002-beta']).status, 0);
  assert.deepEqual([rankOf(f, '003-gamma'), rankOf(f, '002-beta')], [a, b], 'the team items trade the ranks they hold');
  Object.assign(process.env, team); // the re-ranks of completion, --priority and the other commands go through store.reflow
  try { store.reflow(f.folder, { slug: '003-gamma', target: 0 }); store.reflow(f.folder); } finally { for (const k of Object.keys(team)) delete process.env[k]; }
  assert.equal(others(), before, 'no file of another team was written');
});

// The item files, the mirror rows and events, and the commits: what a command may change.
const TS = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g;
const norm = s => String(s).replace(TS, 'TS').replace(/,?"updated_by":"[^"]*"/g, '');
function snapshot(f) {
  const files = {};
  for (const n of readdirSync(join(f.folder, 'phases'))) files[n] = norm(JSON.stringify(parse(readFileSync(join(f.folder, 'phases', n), 'utf8'))));
  const cols = ['id', 'handoff_id', 'slug', 'seq', 'name', 'objective', 'summary', 'status', 'severity', 'priority', 'path', 'branch', 'commit_sha', 'location', 'repository', 'size_score', 'completed_at'];
  const out = {
    files,
    phases: index.rows(f.folder).rows.map(r => norm(JSON.stringify(Object.fromEntries(cols.map(c => [c, r[c]]))))),
    log: git(f.home, 'log', '--format=%s').split('\n'),
  };
  return out;
}
// Runs one update; a step either succeeds or is refused, but never crashes.
const step = (f, args) => {
  const r = run(f, args);
  assert.ok([0, 1, 2].includes(r.status), `${args.join(' ')}: exit ${r.status} ${r.stderr}`);
  assert.doesNotMatch(r.stderr, /TypeError|ReferenceError|\n\s+at /, args.join(' '));
  return r;
};

test('field updates (status, location, commit, summary, name, objective, note)', () => {
  const f = seed();
  const r = step(f, ['2', '--status', 'in_progress', '--location', 'src/a.js', '--commit', 'abc1234', '--summary', 'Neue Zusammenfassung ☕',
    '--name', 'Beta 2', '--objective', 'Obj: "quoted" it\'s', '--note', 'working on it']);
  assert.match(r.stdout, /^✅ 002-beta updated \(status=in progress, commit=abc1234, location=src\/a\.js, summary=/);
  step(f, ['002-beta', '--seq', '77', '--size_score', '5']);
  step(f, ['1', '--note', 'only a note']);
  step(f, ['--size_score=3', '1']);
});

test('--append adds the text after a blank line and a final newline', () => {
  const f = seed();
  step(f, ['1', '--append', 'extra line\n\n  indented\n- [ ] item']);
  step(f, ['1', '--append', '## Definition of done\n- [ ] checked', '--status', 'in_progress']);
});

test('--priority moves the item to that rank and re-densifies, with a planning_event', () => {
  const f = seed();
  step(f, ['3', '--priority', '0']);
  step(f, ['1', '--priority', '99']);
  step(f, ['2', '--priority', '-4']);
  step(f, ['004-delta', '--priority', '1', '--note', 'resume']);
  step(f, ['6', '--priority', '0']); // a done item is in no queue
});

test('--status done completes, stamps completed, re-prioritizes and prints the planning-event lines', () => {
  const f = seed();
  const r = step(f, ['2', '--status', 'done']);
  assert.match(r.stdout, /PLANNING EVENT — completing work RE-PRIORITIZES the backlog/);
  assert.match(fm(f, '002-beta.md').fm.completed, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  step(f, ['1', '--status', 'done', '--note', 'n']);
  step(f, ['3', '--status', 'done', '--priority', '0']);
  step(f, ['4', '--status', 'done']); // empties the backlog down to item 5
  step(f, ['6', '--status', 'done']); // already done: completed stays
});

test('--status takes any word on an item outside a team: a free word keeps it in the queue, closed (or done) takes it out', () => {
  const f = seed();
  const queue = () => index.open(index.rows(f.folder).rows).map(r => r.slug);
  assert.ok(queue().includes('001-alpha'));
  assert.equal(step(f, ['1', '--status', 'blocked on vendor']).status, 0);
  assert.equal(fm(f, '001-alpha.md').fm.status, 'blocked on vendor');
  assert.ok(queue().includes('001-alpha'), 'a free-text word is open');
  assert.equal(step(f, ['1', '--status', 'in-progress']).status, 0); // typed with a hyphen, stored as the word
  assert.equal(fm(f, '001-alpha.md').fm.status, 'in progress');
  assert.equal(step(f, ['2', '--status', 'closed']).status, 0);
  assert.ok(!queue().includes('002-beta'));
  assert.equal(step(f, ['1', '--status', 'done']).status, 0); // done is closed
  assert.equal(fm(f, '001-alpha.md').fm.status, 'closed');
  assert.ok(!queue().includes('001-alpha'));
});

test('--status on an item of a team is refused: its status moves by the team steps, and nothing is written', () => {
  const f = seed();
  assert.equal(step(f, ['1', '--set-team', 't1']).status, 0);
  const before = readFileSync(join(f.folder, 'phases', '001-alpha.md'), 'utf8');
  const r = step(f, ['1', '--status', 'closed']);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /use backlog team update: a team item's status moves by its team steps/);
  assert.equal(readFileSync(join(f.folder, 'phases', '001-alpha.md'), 'utf8'), before);
});

test('an item written with the earlier fields reads as the new word, and its first write drops stage and review_state', () => {
  const f = seed();
  const file = join(f.folder, 'phases', '003-gamma.md'); // status in_progress
  const { fm: old, body } = parse(readFileSync(file, 'utf8'));
  store.write({ path: file, fm: { ...old, review_state: 'requested' }, body }, f.folder);
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'an item of an earlier build'); git(f.home, 'push', '-q');
  const read = cli(['query', '--phase', '3', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(JSON.parse(read.stdout).status, 'ready for review');
  assert.equal(step(f, ['3', '--note', 'x']).status, 0);
  const after = fm(f, '003-gamma.md').fm;
  assert.equal(after.status, 'ready for review');
  assert.ok(!('stage' in after) && !('review_state' in after), JSON.stringify(after));
});

test('--replan sets the leading order by slug or number, ignores unknown names, and prints the order', () => {
  const f = seed();
  const r = step(f, ['--replan', '4,002-beta, zzz ,4']);
  assert.match(r.stdout, /^📋 PLANNING EVENT — backlog re-prioritized \(P0 = next\):\n {3}P0 {2}004-delta\n {3}P1 {2}002-beta\n/);
  step(f, ['--replan', '3', '--note', 'because']);
  step(f, ['--replan', ',']);
  step(f, ['--replan', '1', '1', '--status', 'done']); // replan wins over the item (ignored)
});

test('a replan leaves no event; the order itself is the record', () => {
  const f = seed();
  step(f, ['--replan', '3', '--note', 'because']);
  const ev = cli(['query', '--events'], { cwd: f.cons, tmp: f.t });
  assert.equal(ev.status, 0, ev.stderr);
  assert.doesNotMatch(ev.stdout, /replan|because/);
});

test('--dry-run prints the plan and changes and commits nothing', () => {
  const f = seed();
  const before = snapshot(f);
  const r = step(f, ['2', '--status', 'done', '--dry-run']);
  assert.match(r.stdout, /^ℹ️  \[dry-run\] 002-beta: would set \{'status': 'closed'\}; COMPLETE -> re-prioritize backlog\n$/);
  step(f, ['3', '--priority', '1', '--name', "It's \"x\"", '--seq', '9', '--dry-run']);
  step(f, ['3', '--append', 'x', '--dry-run']);
  step(f, ['--replan', '3,1', '--dry-run']);
  assert.deepEqual(snapshot(f), before);
});

test('refusals: exit 1, nothing written, nothing committed', () => {
  const f = seed();
  const before = snapshot(f);
  for (const args of [['--status', 'done'], ['2', '--branch', 'x'], ['2', '--commit', ''], ['2', '--commit', '  '], ['999', '--status', 'done'],
    ['nosuch'], ['0'], ['2', '--set-estimate', '0']]) {
    assert.equal(step(f, args).status, 1, args.join(' '));
  }
  assert.deepEqual(snapshot(f), before);
});

test('invalid command lines exit 2 or 1', () => {
  const f = seed();
  assert.equal(step(f, ['2', '--bogus']).status, 2);
  assert.equal(step(f, ['2', '3']).status, 2);
  assert.equal(step(f, ['2', '--status']).status, 2);
  assert.equal(step(f, ['2', '--set-complexity', 'huge']).status, 2);
  assert.equal(step(f, ['2', '--priority', 'abc']).status, 1); // a priority that is not a number is refused
});

test('--note on an item that waits clears the wait with a WAIT DONE line', () => {
  const f = seed();
  const noted = cli(['update', '4', '--note', 'workflow finished'], { cwd: f.cons, tmp: f.t, team: true }); // the wait is a team's: the note is a step of `backlog team update`
  assert.equal(noted.status, 0, noted.stdout + noted.stderr);
  assert.equal(fm(f, '004-delta.md').fm.wait_on, '');
  assert.match(fm(f, '004-delta.md').body, /\n\nWAIT DONE \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ \(next step on the item\)\n$/);
});

test('refinement flags --set-review-refs --set-chunk --set-estimate --set-complexity --set-layer --set-depends-on', () => {
  const f = seed();
  step(f, ['2', '--set-review-refs', 'references/review/code.md,references/review/tests.md', '--set-chunk', 'yes', '--set-estimate', '30',
    '--set-complexity', 'high', '--set-layer', '3', '--set-depends-on', '1,003-gamma']);
  step(f, ['2', '--set-depends-on', 'none', '--set-layer', 'process']);
  step(f, ['2', '--set-depends-on', '99']);
  step(f, ['2', '--set-chunk', 'no']);
  step(f, ['2', '--set-review-refs', 'docs/notes.md']);
});

test('editSection changes one block and no other byte; a missing block is created at the end', () => {
  const body = '\n# Phase\n\nText.\n\n## Evidence\n\n- a\n- b\n\n## Tasks\n\n- t\n';
  const e = (op, h = 'Evidence') => editSection(body, h, op);
  assert.equal(e({ 'add-line': 'c' }).body, body.replace('- b\n', '- b\n- c\n'));
  assert.equal(e({ 'add-line': 'z', top: true }).body, body.replace('- a\n', '- z\n- a\n'));
  assert.equal(e({ 'remove-line': '1' }).body, body.replace('- a\n', ''));
  assert.equal(e({ 'move-line': '2:1' }).body, body.replace('- a\n- b\n', '- b\n- a\n'));
  assert.equal(e({ 'move-line': '1:9' }).body, body.replace('- a\n- b\n', '- b\n- a\n'), 'a position past the end puts the line last');
  assert.equal(e({ 'set-lines': '["x","y"]' }).body, body.replace('- a\n- b\n', '- x\n- y\n'));
  assert.equal(e({ 'set-lines': 'plain [text' }).body, body.replace('- a\n- b\n', 'plain [text\n'));
  assert.equal(e({ 'add-line': 'n' }, 'Outcomes').body, `${body}\n## Outcomes\n\n- n\n`);
  assert.equal(e({ 'add-line': 'n' }, 'Tasks').body, `${body}- n\n`);
  assert.match(e({ 'remove-line': '3' }).refuse, /no line 3/);
  assert.match(e({ 'move-line': '5:1' }, 'Outcomes').refuse, /no line 5/);
  assert.equal(editSection('', 'Tasks', { 'add-line': 'a' }).body, '## Tasks\n\n- a\n');
});

const ok2 = (f, item) => assert.equal(run(f, [item, '--section', 'Evidence', '--add-line', 'late']).status, 0);

test('update --section edits one body section and nothing else, through every edit option', () => {
  const f = seed();
  const body = () => fm(f, '001-alpha.md').body;
  const before = body();
  const ok = args => { const r = run(f, ['1', '--section', ...args]); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
  ok(['Evidence', '--add-line', 'first proof']);
  ok(['Evidence', '--add-line', 'zeroth proof', '--top']);
  assert.match(body(), /## Evidence\n\n- zeroth proof\n- first proof\n/);
  ok(['Evidence', '--remove-line', '1']);
  ok(['Tasks', '--set-lines', '["a", "b"]']);
  ok(['Tasks', '--move-line', '2:1']);
  assert.match(body(), /## Evidence\n\n- first proof\n\n## Tasks\n\n- b\n- a\n$/);
  assert.ok(body().startsWith(before.trimEnd()), 'the text before the edited sections is byte-identical');
  assert.equal(fm(f, '001-alpha.md').fm.name, 'Name alpha', 'the front matter fields stay');
  assert.match(fm(f, '001-alpha.md').fm.events.at(-1), /set Tasks=move-line/);
  const other = readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8');
  ok2(f, '6'); // a finished item takes the edit too, and no other item is written
  assert.equal(readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8'), other);
  assert.match(fm(f, '006-zeta.md').body, /## Evidence\n\n- late\n$/);
  const dry = run(f, ['1', '--section', 'Tasks', '--add-line', 'never', '--dry-run']);
  assert.equal(dry.status, 0); assert.doesNotMatch(body(), /never/);
});

test('update --section refuses what it cannot do and writes nothing', () => {
  const f = seed();
  const text = () => readFileSync(join(f.folder, 'phases', '001-alpha.md'), 'utf8');
  const before = text(); const head = git(f.home, 'rev-parse', 'HEAD');
  for (const args of [['--section', 'Tasks'], ['--add-line', 'x'], ['--section', 'Tasks', '--add-line', 'x', '--remove-line', '1'], ['--section', 'Tasks', '--top', '--remove-line', '1'],
    ['--section', 'Tasks', '--remove-line', '0'], ['--section', 'Tasks', '--move-line', '1'], ['--section', 'Tasks', '--add-line', 'a\nb'], ['--section', ' ', '--add-line', 'x']]) {
    const r = run(f, ['1', ...args]); assert.equal(r.status, 2, `${args}: ${r.stdout}${r.stderr}`);
  }
  const r = run(f, ['1', '--section', 'Tasks', '--remove-line', '1']);
  assert.equal(r.status, 1); assert.match(r.stdout, /no line 1/);
  assert.equal(text(), before); assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});
