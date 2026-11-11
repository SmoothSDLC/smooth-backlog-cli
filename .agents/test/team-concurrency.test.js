// Two clones run a team command at once (function level: a real bare origin, two clones, the command is a closure that writes files):
// the one that publishes second runs again on the files the first published (src/shared/team-publish.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { GIT_IDENTITY, ENVELOPE, itemPath, sharedBacklog, BACKLOG_OWNER, BACKLOG_NAME } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';
import { record } from '../../src/shared/numbers.js';
import { publishTeam } from '../../src/shared/team-publish.js';

for (const [k, v] of Object.entries(GIT_IDENTITY)) process.env[k] = v;
const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const item = (folder, seq, name, more = {}) => store.write({ path: itemPath(folder, `00${seq}-${name}`), fm: { ...ENVELOPE, phase: `00${seq}-${name}`, seq, name, status: 'pending', repository: 'acme/demo', branch: 'main', ...more }, body: '\n# x\n' });
const items = folder => Object.fromEntries(store.load(folder).map(i => [i.fm.phase, i.fm]));
const name = (seq, text) => `00${seq}-${text}`;

// Two clones (a, b) of one origin that holds item 001, in the backlog clone and in the code repository.
const worlds = {
  'backlog clone': t => {
    const dir = mkdtempSync(join(tmpdir(), 'team-concurrency-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const a = sharedBacklog(dir); const bare = join(dir, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
    item(join(a, 'acme', 'demo'), 1, 'alpha'); git(a, 'add', '-A'); git(a, 'commit', '-qm', 'seed'); git(a, 'push', '-q');
    const b = join(dir, 'home2'); git(dir, 'clone', '-q', bare, b);
    return { a: clone(a, a), b: clone(b, b) };
  },
  'code repository': t => {
    const dir = mkdtempSync(join(tmpdir(), 'team-concurrency-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const bare = join(dir, 'origin.git'); const ra = join(dir, 'ra'); const rb = join(dir, 'rb');
    git(dir, 'init', '-q', '--bare', '-b', 'main', bare); git(dir, 'clone', '-q', bare, ra); git(ra, 'checkout', '-q', '-b', 'main');
    put(join(ra, '.backlog', 'config.json'), '{"sha":"one"}\n'); item(join(ra, '.backlog', 'acme', 'demo'), 1, 'alpha');
    git(ra, 'add', '-A'); git(ra, 'commit', '-qm', 'seed'); git(ra, 'push', '-q', '-u', 'origin', 'main'); git(dir, 'clone', '-q', bare, rb);
    return { a: clone(ra, join(ra, '.backlog')), b: clone(rb, join(rb, '.backlog')) };
  },
};
const clone = (root, home) => ({ root, home, folder: join(home, 'acme', 'demo'), watch: relative(root, join(home, 'acme', 'demo')) });
// the files the origin holds, read from a fresh pull of the clone's checkout
const pulled = w => { git(w.root, 'pull', '-q', '--rebase'); return items(w.folder); };

// A team command as the commands will run it: pull, run (a closure that writes files and answers { message } or { refusal }), publish.
// begin() is the part before the publication, so that two commands can be started before either publishes.
async function begin(w, step, body, extra = {}) {
  await sync.pull(w.home);
  const runs = { again: 0 }; let persisted = 0;
  const first = await body(w);
  const publish = () => publishTeam(w.home, w.folder, first.message, {
    step, watch: [w.watch], persist: () => { persisted++; },
    attempt: async () => { runs.again++; return body(w); }, ...extra,
  });
  return { first, publish, runs, persisted: () => persisted };
}
const quick = { sleep: async () => {} };

for (const [mode, make] of Object.entries(worlds)) {
  test(`${mode}: two members claim one item at once: one succeeds, the other is refused by the rule on the published file`, async t => {
    const { a, b } = make(t);
    const claim = who => w => {
      const it = items(w.folder)['001-alpha'];
      if (it.owner) return { refusal: `001-alpha is claimed by ${it.owner}` };
      item(w.folder, 1, 'alpha', { owner: who, status: 'active' });
      return { message: `claim ${who}` };
    };
    const ca = await begin(a, 'claim', claim('a'), quick); const cb = await begin(b, 'claim', claim('b'), quick);
    assert.ok(!ca.first.refusal && !cb.first.refusal, 'both saw a free item');
    assert.equal((await cb.publish()).published, true);
    const r = await ca.publish();
    assert.match(r.refusal, /claimed by b/);
    assert.equal(ca.runs.again, 1);
    assert.equal(ca.persisted(), 0, 'a refusal persists nothing');
    assert.equal(pulled(a)['001-alpha'].owner, 'b');
    assert.equal(git(a.root, 'rev-parse', 'HEAD'), git(a.root, 'rev-parse', 'origin/main'), 'no commit of the refused command is left');
    assert.equal(git(a.root, 'status', '--porcelain'), '');
  });

  test(`${mode}: two children added to one parent: both are in the parent's list, with two numbers`, async t => {
    const { a, b } = make(t);
    const add = who => w => {
      const seq = store.nextSeqFor(w.folder, `-${who}.json`);
      const children = [...(items(w.folder)['001-alpha'].children ?? []), name(seq, who)];
      item(w.folder, seq, who, { parent: '001-alpha' }); item(w.folder, 1, 'alpha', { children });
      return { message: `add ${who}` };
    };
    const ca = await begin(a, 'new', add('a'), quick); const cb = await begin(b, 'new', add('b'), quick);
    assert.equal(ca.first.message && (await cb.publish()).published, true);
    assert.equal((await ca.publish()).published, true);
    assert.equal(ca.runs.again, 1);
    const all = pulled(b);
    assert.deepEqual(all['001-alpha'].children, ['002-b', '003-a']);
    assert.ok(all['002-b'] && all['003-a']);
  });

  test(`${mode}: two claims that pass a limit together: the second is refused by the limit`, async t => {
    const { a, b } = make(t);
    for (const w of [a]) { item(w.folder, 2, 'beta'); git(w.root, 'add', '-A'); git(w.root, 'commit', '-qm', 'beta'); git(w.root, 'push', '-q'); }
    git(b.root, 'pull', '-q', '--rebase');
    const take = slug => w => {
      if (Object.values(items(w.folder)).filter(i => i.status === 'active').length >= 1) return { refusal: 'the limit of 1 active item is reached' };
      item(w.folder, Number(slug[2]), slug.slice(4), { status: 'active' });
      return { message: `claim ${slug}` };
    };
    const ca = await begin(a, 'claim', take('001-alpha'), quick); const cb = await begin(b, 'claim', take('002-beta'), quick);
    assert.equal((await cb.publish()).published, true);
    assert.match((await ca.publish()).refusal, /limit of 1/);
    assert.deepEqual(Object.values(pulled(a)).filter(i => i.status === 'active').map(i => i.phase), ['002-beta']);
  });

  test(`${mode}: two creations at once get two numbers`, async t => {
    const { a, b } = make(t);
    const create = who => w => { const seq = store.nextSeqFor(w.folder, `-${who}.json`); item(w.folder, seq, who); return { message: `new ${who}`, seq }; };
    const ca = await begin(a, 'new', create('a'), quick); const cb = await begin(b, 'new', create('b'), quick);
    assert.equal(ca.first.seq, cb.first.seq, 'both picked the same number');
    await cb.publish(); await ca.publish();
    assert.deepEqual(Object.keys(pulled(b)).sort(), ['001-alpha', '002-b', '003-a']);
  });

  test(`${mode}: an item another clone published and then deleted: the next number is above it`, async t => {
    const { a, b } = make(t);
    const create = w => { const seq = store.nextSeqFor(w.folder, '-a.json'); item(w.folder, seq, 'a'); record(w.folder, seq); return { message: 'new a', seq }; };
    const ca = await begin(a, 'new', create, quick);
    assert.equal(ca.first.seq, 2);
    git(b.root, 'pull', '-q', '--rebase'); // the other clone creates number 2, publishes it, deletes the item and publishes that
    item(b.folder, 2, 'x'); record(b.folder, 2); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', 'x'); git(b.root, 'push', '-q');
    rmSync(itemPath(b.folder, '002-x')); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', 'delete x'); git(b.root, 'push', '-q');
    await ca.publish();
    assert.deepEqual(Object.keys(pulled(b)).sort(), ['001-alpha', '003-a']);
  });

  test(`${mode}: upstream changed only another folder: the command does not run again`, async t => {
    const { a, b } = make(t);
    const ca = await begin(a, 'new', w => { item(w.folder, 2, 'a'); return { message: 'new a' }; }, quick);
    git(b.root, 'pull', '-q', '--rebase'); put(join(b.home, 'acme', 'other', 'f.txt'), 'x\n'); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', 'other'); git(b.root, 'push', '-q');
    assert.equal((await ca.publish()).published, true);
    assert.equal(ca.runs.again, 0);
    assert.ok(pulled(b)['002-a']);
  });

  test(`${mode}: an item that changes past half the time budget: exit 3, nothing published, the command's paths put back`, async t => {
    const { a, b } = make(t);
    const old = process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS; process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS = '2000';
    t.after(() => { if (old === undefined) delete process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS; else process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS = old; });
    let n = 0; // the other clone changes the item again while every run of the command is under way
    const moving = w => { item(w.folder, 2, 'a'); git(b.root, 'pull', '-q', '--rebase'); item(b.folder, 1, 'alpha', { summary: `v${++n}` }); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', `v${n}`); git(b.root, 'push', '-q'); return { message: 'new a' }; };
    let clock = 0;
    const ca = await begin(a, 'claim', moving, { ...quick, now: () => (clock += 400) });
    await assert.rejects(ca.publish(), e => e.exitCode === 3 && /acme\/demo kept changing while claim ran; run it again/.test(e.message));
    assert.ok(ca.runs.again >= 1 && ca.runs.again < 5, `it ran again ${ca.runs.again} times`);
    assert.equal(ca.persisted(), 0);
    assert.ok(!existsSync(itemPath(a.folder, '002-a')), 'the command\'s file is gone');
    assert.ok(!git(b.root, 'ls-tree', '-r', '--name-only', 'origin/main').includes('002-a'), 'nothing of the command is on the origin');
  });
}

test('code repository: the re-run drops the command\'s commit only: a person\'s unpushed commit and uncommitted change stay', async t => {
  const { a, b } = worlds['code repository'](t);
  put(join(a.root, 'code.js'), 'x\n'); git(a.root, 'add', 'code.js'); git(a.root, 'commit', '-qm', 'person code');
  put(join(a.root, 'code2.js'), 'y\n'); git(a.root, 'add', 'code2.js'); git(a.root, 'commit', '-qm', 'person code 2');
  const ca = await begin(a, 'new', w => { item(w.folder, 2, 'a'); return { message: 'new a' }; }, quick);
  put(join(a.root, 'code2.js'), 'uncommitted\n'); // the person's edit after the command started
  git(b.root, 'pull', '-q', '--rebase'); item(b.folder, 1, 'alpha', { summary: 'other' }); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', 'other'); git(b.root, 'push', '-q');
  assert.equal((await ca.publish()).published, true);
  assert.equal(ca.runs.again, 1);
  assert.deepEqual(git(a.root, 'log', '--format=%s', 'origin/main..HEAD').split('\n'), ['person code 2', 'person code'], 'the person\'s commits are still local');
  assert.equal(git(a.root, 'log', '--format=%s', 'origin/main').split('\n').filter(s => s.startsWith('person')).length, 0, 'and were not published');
  assert.equal(git(a.root, 'show', 'HEAD:code2.js'), 'y');
  assert.equal(git(a.root, 'show', 'origin/main:.backlog/acme/demo/phases/002-a.json').length > 0, true);
});
