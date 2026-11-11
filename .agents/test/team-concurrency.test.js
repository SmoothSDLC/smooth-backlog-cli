// Two clones run a team command at once (function level: a real bare origin, two clones, the command is a closure that writes files):
// the one that publishes second runs again on the files the first published (src/shared/team-publish.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { GIT_IDENTITY, ENVELOPE, itemPath, sharedBacklog, BACKLOG_OWNER, BACKLOG_NAME } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';
import { record } from '../../src/shared/numbers.js';
import { BacklogError } from '../../src/errors.js';
import { publishTeam } from '../../src/shared/team-publish.js';
import { TEMPLATES, inside, putItem } from './team-fixture.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

  test(`${mode}: a person's commit on top of the command's commit while the other clone published the folder: the command does not run again and nothing is dropped`, async t => {
    const { a, b } = make(t);
    const claim = who => w => { item(w.folder, 1, 'alpha', { owner: who, status: 'active' }); return { message: `claim ${who}` }; };
    const ca = await begin(a, 'claim', claim('a'), quick); const cb = await begin(b, 'claim', claim('b'), quick);
    assert.equal((await cb.publish()).published, true);
    const hook = join(a.root, '.git', 'hooks', 'post-commit'); // a hook stands for the person: a commit right after the command's own
    writeFileSync(hook, `#!/bin/sh\ncase "$(git log -1 --format=%s)" in *": claim a") ;; *) exit 0;; esac\nunset GIT_INDEX_FILE\ncd "${a.root}"\n[ -e person.txt ] && exit 0\necho person > person.txt\ngit add person.txt\ngit -c user.name=P -c user.email=p@example.com commit -q -m "person: file" -- person.txt\n`);
    chmodSync(hook, 0o755);
    await assert.rejects(ca.publish(), e => e.exitCode === 3 && /nothing was rolled back/.test(e.message));
    assert.equal(ca.runs.again, 0, 'the command did not run again');
    assert.equal(ca.persisted(), 0);
    assert.match(git(a.root, 'log', '--format=%s', '-2'), /person: file/);
    assert.equal(git(a.root, 'rev-list', '--count', 'origin/main..HEAD'), '2');
  });

  test(`${mode}: upstream changed only another folder: the command does not run again`, async t => {
    const { a, b } = make(t);
    const ca = await begin(a, 'new', w => { item(w.folder, 2, 'a'); return { message: 'new a' }; }, quick);
    git(b.root, 'pull', '-q', '--rebase'); put(join(b.home, 'acme', 'other', 'f.txt'), 'x\n'); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', 'other'); git(b.root, 'push', '-q');
    assert.equal((await ca.publish()).published, true);
    assert.equal(ca.runs.again, 0);
    assert.ok(pulled(b)['002-a']);
  });

  // The clock and the waits are seams: every wait costs `step` ms on the clock, whatever the random draw, and the draw is pinned to its upper end.
  for (const [wait, reruns, step] of [[2000, 3, 450], [4000, 5, 450], [14000, 7, 1000]]) { // the last one reaches the 3200 ms cap
    test(`${mode}: an item that changes again and again: every wait is below min(3200, 50 * 2^attempt) and the loop stops once half of the ${wait} ms lock wait has passed`, async t => {
      const { a, b } = make(t);
      const old = process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS; process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS = String(wait);
      const random = Math.random; Math.random = () => 0.999;
      t.after(() => { Math.random = random; if (old === undefined) delete process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS; else process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS = old; });
      let n = 0; // the other clone changes the item again while every run of the command is under way
      const moving = w => { item(w.folder, 2, 'a'); git(b.root, 'pull', '-q', '--rebase'); item(b.folder, 1, 'alpha', { summary: `v${++n}` }); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', `v${n}`); git(b.root, 'push', '-q'); return { message: 'new a' }; };
      let clock = 0; const waits = [];
      const ca = await begin(a, 'claim', moving, { now: () => clock, sleep: async ms => { waits.push(ms); clock += step; } });
      await assert.rejects(ca.publish(), e => e.exitCode === 3 && /acme\/demo kept changing while claim ran; run it again/.test(e.message));
      assert.equal(ca.runs.again, reruns);
      assert.equal(waits.length, reruns);
      waits.forEach((ms, i) => { const bound = Math.min(3200, 50 * 2 ** (i + 1)); assert.ok(ms < bound && ms > bound * 0.99, `wait ${i + 1} is ${ms}, the bound ${bound}`); });
      assert.equal(ca.persisted(), 0);
      assert.ok(!existsSync(itemPath(a.folder, '002-a')), 'the command\'s file is gone');
      assert.ok(!git(b.root, 'ls-tree', '-r', '--name-only', 'origin/main').includes('002-a'), 'nothing of the command is on the origin');
    });
  }
}

test('code repository: with exit 1, an error of the command itself during the re-run keeps its code and its exit 2', async t => {
  const { a, b } = worlds['code repository'](t);
  let runs = 0;
  const body = w => { if (runs++) throw new BacklogError('INVALID_INPUT', 'the rules refuse this input', 2); item(w.folder, 2, 'a'); return { message: 'new a' }; };
  const ca = await begin(a, 'pop', body, { exit: 1, ...quick });
  git(b.root, 'pull', '-q', '--rebase'); item(b.folder, 1, 'alpha', { summary: 'other' }); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', 'other'); git(b.root, 'push', '-q');
  await assert.rejects(ca.publish(), e => e.code === 'INVALID_INPUT' && e.exitCode === 2);
  assert.ok(!existsSync(itemPath(a.folder, '002-a')), 'the command\'s file is put back');
});

test('code repository: the budget error exits with the option exit (pop exits 1)', async t => {
  const { a, b } = worlds['code repository'](t);
  const old = process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS; process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS = '2000';
  t.after(() => { if (old === undefined) delete process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS; else process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS = old; });
  let n = 0;
  const moving = w => { item(w.folder, 2, 'a'); git(b.root, 'pull', '-q', '--rebase'); item(b.folder, 1, 'alpha', { summary: `v${++n}` }); git(b.root, 'add', '-A'); git(b.root, 'commit', '-qm', `v${n}`); git(b.root, 'push', '-q'); return { message: 'new a' }; };
  let clock = 0;
  const ca = await begin(a, 'pop', moving, { exit: 1, now: () => clock, sleep: async () => { clock += 450; } });
  await assert.rejects(ca.publish(), e => e.exitCode === 1 && /kept changing while pop ran; run it again/.test(e.message));
  assert.ok(!existsSync(itemPath(a.folder, '002-a')), 'nothing of the command is left');
});

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

// ---- The real commands on two clones of one origin (the backlog lives inside the code repository). The second clone (rb) runs its command from a hook of the
// first clone's push, so that it publishes after the first command read the files and before it pushed: no timing is left to chance.
const BIN = fileURLToPath(new URL('../../bin/backlog.js', import.meta.url));
const ENTRY = TEMPLATES.parallel.parallel;
const BASE = ['--team', 'parallel', '--agent', 'member-1'];
const quote = a => `'${String(a).replaceAll("'", "'\\''")}'`;
const job = (seq, fields = {}) => ({ seq, slug: `${String(seq).padStart(3, '0')}-job`, name: 'job', team: 'parallel', repository: 'local/repository', branch: 'main', fields: { status: 'ready', estimate: 5, holder: '', checker: '', parent: null, children: [], depends_on: [], handoff: '', rounds: 0, ...fields } });
function seeded(t, items) {
  const w = inside(t);
  for (const i of items) putItem(w.folder, i, ENTRY);
  git(w.ra, 'add', '-A'); git(w.ra, 'commit', '-qm', 'items'); git(w.ra, 'push', '-q'); git(w.rb, 'pull', '-q');
  return w;
}
// the second clone's command, as shell text for a hook; its exit code and output are left beside the clones
const other = (w, verb, args, env = {}) => `cd ${quote(w.rb)} && env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE XDG_CONFIG_HOME=${quote(join(w.dir, 'xdg-b'))} SMOOTH_BACKLOG_CLI_HOME= ${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' ')} ${quote(process.execPath)} ${quote(BIN)} team ${verb} ${args.map(quote).join(' ')} > ${quote(join(w.dir, 'rb.out'))} 2>&1; echo $? > ${quote(join(w.dir, 'rb.code'))}`;
// a direct change of the other clone's checkout, published; `edit` is shell text run in the clone's top
const otherPublishes = (w, edit) => `cd ${quote(w.rb)} && git pull -q --rebase && ${edit} && git add -A && git commit -qm other && git push -q`;
// the first clone's pre-push hook runs `script` once (`always`: at every push)
function onPush(w, script, always = false) {
  const marker = join(w.dir, 'hook-ran'); const hook = join(w.ra, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE\n${always ? '' : `[ -e ${quote(marker)} ] && exit 0\ntouch ${quote(marker)}\n`}${script}\n`);
  chmodSync(hook, 0o755);
}
const rbCode = w => Number(readFileSync(join(w.dir, 'rb.code'), 'utf8'));
const origin = (w, path) => JSON.parse(git(w.bare, 'show', `main:.backlog/local/repository/${path}`));
const phases = w => git(w.bare, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(f => f.includes('/phases/')).map(f => f.split('/').pop());
const bump = (w, seq) => `node -e "const f=process.argv[1],fs=require('fs'),d=JSON.parse(fs.readFileSync(f));d.fields.estimate=Date.now()%100000;fs.writeFileSync(f,JSON.stringify(d))" ${quote(join(w.rb, '.backlog', 'local', 'repository', 'phases', `00${seq}-job.json`))}`;

test('commands: two clones claim one item at once: the first to publish wins, the other is refused by the rule on the published file', t => {
  const w = seeded(t, [job(1)]);
  onPush(w, other(w, 'update', ['1', 'claim', '--team', 'parallel', '--agent', 'member-2']));
  const r = w.run(['1', 'claim', ...BASE], {}, 'update');
  assert.equal(rbCode(w), 0);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /only a ready item is claimed \(item 1 is in progress\) \(rule claim-not-ready\)/);
  assert.equal(origin(w, 'phases/001-job.json').fields.holder, 'member-2');
  assert.equal(git(w.ra, 'rev-list', '--count', 'origin/main..HEAD'), '0', 'no commit of the refused command is left');
});

test('commands: two clones add a child to one parent at once: the parent lists both', t => {
  const w = seeded(t, [job(1, { status: 'splitting' })]);
  onPush(w, other(w, 'new', ['--team', 'parallel', '--agent', 'member-2', '--name', 'second', '--estimate', '20', '--parent', '1']));
  const r = w.run([...BASE, '--name', 'first', '--estimate', '20', '--parent', '1'], {}, 'new');
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(rbCode(w), 0);
  assert.deepEqual(origin(w, 'phases/001-job.json').fields.children.sort(), [2, 3]);
  assert.equal(phases(w).length, 3);
});

test('commands: two clones start work for the same member at once: the second is refused by the limit', t => {
  const w = seeded(t, [job(1), job(2)]);
  onPush(w, other(w, 'update', ['2', 'claim', ...BASE]));
  const r = w.run(['1', 'claim', ...BASE], {}, 'update');
  assert.equal(rbCode(w), 0);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /member-1 already works on an item.*\(rule claim-limit-person\)/);
  assert.deepEqual([1, 2].map(n => origin(w, `phases/00${n}-job.json`).fields.holder), ['', 'member-1']);
});

test('commands: two clones create an item at once: two different numbers', t => {
  const w = inside(t);
  onPush(w, other(w, 'new', ['--team', 'parallel', '--agent', 'member-2', '--name', 'b', '--estimate', '20']));
  const r = w.run([...BASE, '--name', 'a', '--estimate', '20'], {}, 'new');
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(rbCode(w), 0);
  assert.deepEqual(phases(w).map(f => f.slice(0, 3)).sort(), ['001', '002']);
});

// every push meets an upstream change of another item: the command stops once its budget has passed and publishes nothing
for (const [verb, args, code] of [['update', ['1', 'claim', ...BASE], 3], ['pop', BASE, 1]]) {
  test(`commands: upstream that moves at every push: ${verb} exits ${code} with "kept changing" and publishes nothing`, t => {
    const w = seeded(t, [...[1, 2, 3, 4, 5, 6, 7, 8].map(n => job(n)), job(9, { status: 'new' })]); // enough ready items that pop's skip never empties the queue
    onPush(w, otherPublishes(w, bump(w, 9)), true);
    const r = w.run(args, { SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS: '2000' }, verb);
    assert.equal(r.status, code, r.stdout + r.stderr);
    assert.match(r.stderr, /kept changing while \w+ ran/);
    assert.equal(origin(w, 'phases/001-job.json').fields.holder, '', 'nothing of the command is published');
    assert.equal(git(w.ra, 'rev-list', '--count', 'origin/main..HEAD'), '0', 'no commit of the command is left');
    assert.equal(JSON.parse(readFileSync(join(w.folder, 'phases', '001-job.json'), 'utf8')).fields.holder, '', 'nor a file');
  });
}

test('commands: pop that meets an upstream change of another item runs again and offers the second item of the queue, not the first', t => {
  const w = seeded(t, [job(1), job(2), job(3, { status: 'new' })]);
  onPush(w, otherPublishes(w, bump(w, 3)));
  const r = w.run(BASE, {}, 'pop');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^➡️  claim 002-job /);
  assert.deepEqual([1, 2].map(n => origin(w, `phases/00${n}-job.json`).fields.holder), ['', 'member-1']);
});

test('commands: a person\'s commit on top of the command\'s commit is never taken back, whatever the other clone published', t => {
  const w = seeded(t, [job(1), job(2)]);
  const hook = join(w.ra, '.git', 'hooks', 'post-commit'); // a hook stands for the person: a commit right after the command's own
  writeFileSync(hook, `#!/bin/sh\ncase "$(git log -1 --format=%s)" in *"team claim 001-job") ;; *) exit 0;; esac\nunset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE\n[ -e ${quote(join(w.ra, 'person.txt'))} ] && exit 0\n( ${otherPublishes(w, bump(w, 2))} )\ncd ${quote(w.ra)} && echo person > person.txt && git add person.txt && git -c user.name=P -c user.email=p@example.com commit -q -m "person: file" -- person.txt\n`);
  chmodSync(hook, 0o755);
  const r = w.run(['1', 'claim', ...BASE], {}, 'update');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /nothing was rolled back/);
  assert.deepEqual(git(w.ra, 'log', '--format=%s', '-2').split('\n'), ['person: file', 'backlog: team claim 001-job']);
  assert.equal(JSON.parse(readFileSync(join(w.folder, 'phases', '001-job.json'), 'utf8')).fields.holder, 'member-1', 'the command\'s change is still there');
  assert.equal(origin(w, 'phases/001-job.json').fields.holder, '', 'and nothing of it is published');
});
