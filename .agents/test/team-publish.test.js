// The publication of a team command's own commit (src/shared/team-publish.js): a real bare origin, two clones of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { GIT_IDENTITY, ENVELOPE, itemPath, sharedBacklog, BACKLOG_OWNER, BACKLOG_NAME } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';
import { publishTeam } from '../../src/shared/team-publish.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const item = (folder, seq, name, more = {}) => store.write({ path: itemPath(folder, `00${seq}-${name}`), fm: { ...ENVELOPE, phase: `00${seq}-${name}`, seq, name, status: 'pending', repository: 'acme/demo', branch: 'main', ...more }, body: '\n# x\n' });
const read = (folder, slug) => store.load(folder).find(i => i.fm.phase === slug)?.fm;
const refuse = bare => { const hook = join(bare, 'hooks', 'pre-receive'); writeFileSync(hook, '#!/bin/sh\necho refused >&2\nexit 1\n'); chmodSync(hook, 0o755); };
const subjects = (cwd, range) => git(cwd, 'log', '--format=%s', ...range.split(' '));

// Two backlog locations, each with two clones (a, b) of one bare origin that holds item 001.
export const modes = {
  'backlog clone': t => {
    const dir = mkdtempSync(join(tmpdir(), 'team-publish-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const a = sharedBacklog(dir); const bare = join(dir, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
    item(join(a, 'acme', 'demo'), 1, 'alpha'); git(a, 'add', '-A'); git(a, 'commit', '-qm', 'seed'); git(a, 'push', '-q');
    const b = join(dir, 'home2'); git(dir, 'clone', '-q', bare, b);
    return clones(dir, bare, [a, a], [b, b], a, b);
  },
  'code repository': t => {
    const dir = mkdtempSync(join(tmpdir(), 'team-publish-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const bare = join(dir, 'origin.git'); const ra = join(dir, 'ra'); const rb = join(dir, 'rb');
    git(dir, 'init', '-q', '--bare', '-b', 'main', bare); git(dir, 'clone', '-q', bare, ra); git(ra, 'checkout', '-q', '-b', 'main');
    put(join(ra, '.backlog', 'config.json'), '{"sha":"one"}\n'); put(join(ra, '.backlog', 'teams.json'), '{"t1":1}\n'); put(join(ra, 'code.js'), 'x\n'); put(join(ra, 'code2.js'), 'y\n');
    item(join(ra, '.backlog', 'acme', 'demo'), 1, 'alpha');
    git(ra, 'add', '-A'); git(ra, 'commit', '-qm', 'seed'); git(ra, 'push', '-q', '-u', 'origin', 'main');
    git(dir, 'clone', '-q', bare, rb);
    return clones(dir, bare, [ra, join(ra, '.backlog')], [rb, join(rb, '.backlog')], ra, rb);
  },
};
function clones(dir, bare, [rootA, homeA], [rootB, homeB]) {
  const make = (root, home) => ({ root, home, folder: join(home, 'acme', 'demo'), watch: relative(root, join(home, 'acme', 'demo')) });
  return { dir, bare, a: make(rootA, homeA), b: make(rootB, homeB) };
}
// The change another clone publishes: written, committed on top of the origin, pushed.
export const publishFrom = (w, write, message = 'other clone') => { git(w.root, 'pull', '-q', '--rebase'); write(w); git(w.root, 'add', '-A'); git(w.root, 'commit', '-qm', message); git(w.root, 'push', '-q'); };
const opts = (w, more = {}) => ({ step: 'claim', watch: [w.watch], attempt: async () => { throw new Error('the command must not run again'); }, ...more });

for (const [mode, make] of Object.entries(modes)) {
  for (const [k, v] of Object.entries(GIT_IDENTITY)) process.env[k] = v;
  const subject = (w, text) => (mode === 'backlog clone' ? `acme/demo: ${text}` : `backlog: ${text}`);

  test(`${mode}: the command's own commit is pushed, only its paths are committed, a person's edit stays`, async t => {
    const { a } = make(t);
    put(join(a.home, 'notes.txt'), 'person\n'); // not an item file of the folder: never staged
    await sync.pull(a.home);
    item(a.folder, 2, 'beta');
    let persisted = 0;
    const r = await publishTeam(a.home, a.folder, 'new beta', opts(a, { persist: () => { persisted++; } }));
    assert.equal(r.published, true);
    assert.equal(persisted, 1);
    assert.equal(subjects(a.root, 'origin/main -1'), subject(a, 'new beta'));
    assert.equal(git(a.root, 'rev-parse', 'HEAD'), git(a.root, 'rev-parse', 'origin/main'));
    assert.equal(git(a.root, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(p => p.endsWith('notes.txt')).length, 0);
    assert.equal(readFileSync(join(a.home, 'notes.txt'), 'utf8'), 'person\n');
    assert.match(git(a.root, 'status', '--porcelain'), /notes\.txt/);
  });

  test(`${mode}: upstream changed only another folder: nothing runs again, only the command's commit is published on top of it`, async t => {
    const { a, b } = make(t);
    await sync.pull(a.home);
    item(a.folder, 2, 'beta');
    publishFrom(b, w => put(join(w.home, 'acme', 'other', 'f.txt'), 'x\n'));
    const r = await publishTeam(a.home, a.folder, 'new beta', opts(a));
    assert.equal(r.published, true);
    git(b.root, 'pull', '-q', '--rebase');
    assert.deepEqual(subjects(b.root, 'HEAD~2..HEAD').split('\n'), [subject(a, 'new beta'), 'other clone']);
    assert.ok(existsSync(itemPath(b.folder, '002-beta')) && existsSync(join(b.home, 'acme', 'other', 'f.txt')));
    assert.equal(git(a.root, 'rev-parse', 'HEAD'), git(a.root, 'rev-parse', 'origin/main'), 'the local commit, the same patch, dropped out of the rebase');
  });

  test(`${mode}: a push the origin refuses while upstream did not move is a failure: the command's paths are put back, a lead's uncommitted files stay`, async t => {
    const { a, bare } = make(t);
    const edits = mode === 'code repository' ? { '.backlog/teams.json': '{"t1":2}\n', '.backlog/config.json': '{"sha":"two"}\n' } : { 'teams.json': '{"lead":1}\n' };
    refuse(bare);
    await sync.pull(a.home);
    for (const [p, text] of Object.entries(edits)) put(join(a.root, p), text);
    item(a.folder, 2, 'beta');
    store.write({ path: itemPath(a.folder, '001-alpha'), fm: { ...ENVELOPE, phase: '001-alpha', seq: 1, name: 'alpha', status: 'done', repository: 'acme/demo', branch: 'main' }, body: '\n# changed\n' });
    const before = git(a.root, 'rev-parse', 'HEAD');
    await assert.rejects(publishTeam(a.home, a.folder, 'two changes', opts(a)), e => e.exitCode === 3 && /change was not published/.test(e.message) && /refused/.test(e.message));
    assert.equal(git(a.root, 'rev-parse', 'HEAD'), before, 'no commit left');
    assert.ok(!existsSync(itemPath(a.folder, '002-beta')), 'the file the command created is gone');
    assert.equal(read(a.folder, '001-alpha').status, 'pending');
    for (const [p, text] of Object.entries(edits)) assert.equal(readFileSync(join(a.root, p), 'utf8'), text, `${p} kept`);
  });

  test(`${mode}: with pushing off the commit stays and nothing is pushed`, async t => {
    const { a } = make(t);
    if (mode === 'code repository') { put(join(a.home, 'config.json'), '{"push-backlog-updates":false}\n'); git(a.root, 'commit', '-qam', 'off'); } else return; // the backlog clone always pushes
    await sync.pull(a.home);
    item(a.folder, 2, 'beta');
    let persisted = 0;
    const r = await publishTeam(a.home, a.folder, 'new beta', opts(a, { persist: () => { persisted++; } }));
    assert.equal(r.published, false);
    assert.equal(persisted, 1);
    assert.equal(subjects(a.root, 'HEAD -1'), subject(a, 'new beta'));
    assert.equal(git(a.root, 'rev-list', '--count', 'origin/main..HEAD'), '2');
  });
}

test('code repository: no origin remote keeps the commit and exits 3', async t => {
  const { a } = modes['code repository'](t);
  git(a.root, 'remote', 'remove', 'origin');
  item(a.folder, 2, 'beta');
  await assert.rejects(publishTeam(a.home, a.folder, 'new beta', opts(a)), e => e.exitCode === 3 && /no origin remote/.test(e.message));
  assert.equal(subjects(a.root, 'HEAD -1'), 'backlog: new beta');
});

test('code repository: a person\'s unpushed commit that changes the same file stops the publication: exit 3, the commit stays, nothing is pushed', async t => {
  const { a } = modes['code repository'](t);
  await sync.pull(a.home);
  item(a.folder, 1, 'alpha', { summary: 'person' }); git(a.root, 'commit', '-qam', 'person edit of alpha');
  item(a.folder, 1, 'alpha', { summary: 'command' });
  const origin = git(a.root, 'rev-parse', 'origin/main');
  await assert.rejects(publishTeam(a.home, a.folder, 'change alpha', opts(a)), e => e.exitCode === 3 && /your unpushed commits change .*001-alpha/.test(e.message));
  assert.equal(subjects(a.root, 'HEAD -1'), 'backlog: change alpha');
  assert.equal(git(a.root, 'rev-parse', 'origin/main'), origin);
  assert.equal(git(a.root, 'ls-remote', 'origin', 'main').split('\t')[0], origin);
});

test('code repository: a person\'s unpushed commit of other files never travels with the command\'s commit', async t => {
  const { a } = modes['code repository'](t);
  await sync.pull(a.home);
  put(join(a.root, 'code.js'), 'person\n'); git(a.root, 'commit', '-qam', 'person code');
  item(a.folder, 2, 'beta');
  const r = await publishTeam(a.home, a.folder, 'new beta', opts(a));
  assert.equal(r.published, true);
  assert.deepEqual(subjects(a.root, 'origin/main -2').split('\n'), ['backlog: new beta', 'seed']);
  assert.deepEqual(subjects(a.root, 'origin/main..HEAD').split('\n'), ['person code'], 'the person\'s commit is still local, on top');
});

test('code repository: a person\'s uncommitted change to a file of the commit blocks the re-run: exit 3 naming the path, the commit stays', async t => {
  const { a, b } = modes['code repository'](t);
  await sync.pull(a.home);
  item(a.folder, 1, 'alpha', { summary: 'command' });
  publishFrom(b, w => item(w.folder, 1, 'alpha', { summary: 'other' }));
  // the person edits the item right after the commit is made (a hook of the clone stands for the person): the edit is uncommitted, on top of the commit
  const file = itemPath(a.folder, '001-alpha'); const hook = join(a.root, '.git', 'hooks', 'post-commit');
  writeFileSync(hook, `#!/bin/sh\n[ -e "${a.dir}/edited" ] || { echo person >> "${file}"; touch "${a.dir}/edited"; }\n`); chmodSync(hook, 0o755);
  await assert.rejects(publishTeam(a.home, a.folder, 'change alpha', opts(a, { step: 'update', persist: () => assert.fail('nothing was published') })),
    e => e.exitCode === 3 && /your uncommitted change to .backlog\/acme\/demo\/phases\/001-alpha\.json blocks the re-run of update; commit or stash it and run the step again/.test(e.message));
  assert.equal(subjects(a.root, 'HEAD -1'), 'backlog: change alpha');
  assert.match(readFileSync(file, 'utf8'), /person\n$/);
});

test('code repository: a pull that fails on the re-run puts the commit back, then the command\'s paths: exit 3, the person\'s unpushed commit stays', async t => {
  const { a, b } = modes['code repository'](t);
  await sync.pull(a.home);
  put(join(a.root, 'code.js'), 'person\n'); git(a.root, 'commit', '-qam', 'person code');
  item(a.folder, 2, 'beta');
  publishFrom(b, w => { put(join(w.root, 'code.js'), 'other\n'); item(w.folder, 3, 'gamma'); }); // conflicts with the person's commit, and changes the folder
  const before = git(a.root, 'rev-parse', 'HEAD');
  await assert.rejects(publishTeam(a.home, a.folder, 'new beta', opts(a)), e => e.exitCode === 3 && /could not update .* from origin\/main/.test(e.message));
  assert.equal(git(a.root, 'rev-parse', 'HEAD'), before);
  assert.ok(!existsSync(itemPath(a.folder, '002-beta')));
  assert.equal(git(a.root, 'status', '--porcelain', '--untracked-files=no'), '');
});

test('code repository: the push succeeded and the rebase afterwards fails: the SHA is persisted once, the commit stays, exit 3 says what to run', async t => {
  const { a, b } = modes['code repository'](t);
  await sync.pull(a.home);
  put(join(a.root, 'code.js'), 'person\n'); git(a.root, 'commit', '-qam', 'person code');
  item(a.folder, 2, 'beta');
  publishFrom(b, w => put(join(w.root, 'code.js'), 'other\n')); // outside the folder: the commit is built on it, the person's commit then conflicts with it
  let persisted = 0;
  await assert.rejects(publishTeam(a.home, a.folder, 'new beta', opts(a, { persist: () => { persisted++; } })),
    e => e.exitCode === 3 && /the change is published; your local branch could not be rebased onto it: run git pull --rebase/.test(e.message));
  assert.equal(persisted, 1);
  assert.equal(subjects(a.root, 'origin/main -1'), 'backlog: new beta');
  assert.equal(subjects(a.root, 'HEAD -1'), 'backlog: new beta', 'the local commit stays');
  assert.ok(!existsSync(join(a.root, '.git', 'rebase-merge')), 'no rebase is left half-done');
});

test('code repository: the origin has no such branch yet: the first push creates it when no unpushed commit of a person lies below', async t => {
  const { a } = modes['code repository'](t);
  git(a.root, 'checkout', '-q', '-b', 'feature');
  item(a.folder, 2, 'beta');
  assert.equal((await publishTeam(a.home, a.folder, 'new beta', opts(a))).published, true);
  assert.equal(git(a.root, 'ls-remote', 'origin', 'feature').split('\t')[0], git(a.root, 'rev-parse', 'HEAD'));
});

test('code repository: the origin has no such branch yet and a person\'s unpushed commit lies below: nothing is published, the commit stays, the text names the branch', async t => {
  const { a } = modes['code repository'](t);
  git(a.root, 'checkout', '-q', '-b', 'feature');
  put(join(a.root, 'code.js'), 'person\n'); git(a.root, 'commit', '-qam', 'person code');
  item(a.folder, 2, 'beta');
  await assert.rejects(publishTeam(a.home, a.folder, 'new beta', opts(a)), e => e.exitCode === 3 && /feature is not on the origin yet.*publish feature first/.test(e.message));
  assert.equal(git(a.root, 'ls-remote', 'origin', 'feature'), '');
  assert.equal(subjects(a.root, 'HEAD -1'), 'backlog: new beta');
});
