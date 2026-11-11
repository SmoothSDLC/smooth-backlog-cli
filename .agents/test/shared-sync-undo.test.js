// The undo of a failed publication restores the command's own paths only (src/shared/sync.js), in both backlog locations:
// the backlog clone, and a backlog folder inside the code repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { GIT_IDENTITY, ENVELOPE, holdLock, itemPath, sharedBacklog, BACKLOG_OWNER, BACKLOG_NAME } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';
import * as sync from '../../src/shared/sync.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const put = (path, text) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text); };
const refuse = bare => { const hook = join(bare, 'hooks', 'pre-receive'); writeFileSync(hook, '#!/bin/sh\necho refused >&2\nexit 1\n'); chmodSync(hook, 0o755); };

// Two backlog locations; each yields the backlog folder (home), a command folder and the bare origin.
const modes = {
  'backlog clone': t => {
    const dir = mkdtempSync(join(tmpdir(), 'undo-test-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const home = sharedBacklog(dir);
    return { dir, home, folder: join(home, 'acme', 'demo'), bare: join(dir, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`) };
  },
  'code repository': t => {
    const dir = mkdtempSync(join(tmpdir(), 'undo-test-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const bare = join(dir, 'origin.git'); const repo = join(dir, 'repo');
    git(dir, 'init', '-q', '--bare', '-b', 'main', bare); git(dir, 'clone', '-q', bare, repo);
    git(repo, 'checkout', '-q', '-b', 'main');
    const home = join(repo, '.backlog');
    put(join(home, 'config.json'), '{"sha":"one"}\n'); put(join(home, 'teams.json'), '{"t1":1}\n'); put(join(home, 'notes.txt'), 'notes\n'); put(join(repo, 'code.js'), 'x\n');
    git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'seed'); git(repo, 'push', '-q', '-u', 'origin', 'main');
    return { dir, home, folder: join(home, 'acme', 'demo'), bare };
  },
};

for (const [mode, make] of Object.entries(modes)) {
  const item = (folder, seq, name) => store.write({ path: itemPath(folder, `00${seq}-${name}`), fm: { ...ENVELOPE, phase: `00${seq}-${name}`, seq, name, status: 'pending', repository: 'acme/demo', branch: 'main' }, body: '\n# x\n' });

  test(`${mode}: a person's uncommitted edit of another item stays uncommitted and unpublished`, async t => {
    const f = make(t);
    item(f.folder, 1, 'alpha');
    await sync.commitSettled(f.home, f.folder, 'new alpha');
    const alpha = itemPath(f.folder, '001-alpha');
    const committed = readFileSync(alpha, 'utf8');
    const edited = committed.replace('"status": "pending"', '"status": "done"');
    assert.notEqual(edited, committed);
    writeFileSync(alpha, edited);
    await sync.pull(f.home);
    item(f.folder, 2, 'beta');
    await sync.commitSettled(f.home, f.folder, 'new beta');
    assert.ok(!git(f.home, 'show', '--name-only', '--format=', 'HEAD').split('\n').some(p => p.endsWith('001-alpha.json')), 'the person\'s file is not in the commit');
    assert.equal(readFileSync(alpha, 'utf8'), edited);
    assert.match(git(f.home, 'status', '--porcelain'), /^ ?M .*001-alpha\.json$/m);
  });

  test(`${mode}: a person's edit that git merges with an upstream change of the same item during the publication is not published`, async t => {
    const f = make(t);
    item(f.folder, 1, 'alpha');
    await sync.commitSettled(f.home, f.folder, 'new alpha');
    const alpha = itemPath(f.folder, '001-alpha');
    const top = git(f.home, 'rev-parse', '--show-toplevel');
    const rel = relative(top, alpha).split('\\').join('/');
    const edited = readFileSync(alpha, 'utf8').replace('"status": "pending"', '"status": "done"');
    writeFileSync(alpha, edited); // the person's edit, before the command's pull
    await sync.pull(f.home);
    item(f.folder, 2, 'beta');
    const other = join(f.dir, 'other'); git(f.dir, 'clone', '-q', f.bare, other);
    const up = join(other, rel); writeFileSync(up, readFileSync(up, 'utf8').replace('"updated_by": ""', '"updated_by": "bob"'));
    git(other, 'commit', '-qam', 'other clone'); git(other, 'push', '-q');
    await sync.commitSettled(f.home, f.folder, 'new beta');
    assert.ok(!git(f.home, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes(rel), 'the merged file is not in the command\'s commit');
    assert.match(git(f.home, 'show', `origin/main:${rel}`), /"updated_by": "bob"[\s\S]*"status": "pending"/, 'origin: the upstream change only');
    const work = readFileSync(alpha, 'utf8');
    assert.ok(work.includes('"status": "done"') && work.includes('"updated_by": "bob"'), 'the working file holds both edits');
    assert.match(git(f.home, 'status', '--porcelain'), /^ ?M .*001-alpha\.json$/m);
    assert.match(git(f.home, 'show', `origin/main:${rel.replace('001-alpha', '002-beta')}`), /beta/, 'the command\'s item is published');
  });

  test(`${mode}: the lock held past the wait: LOCKED exit 1, the command's item and its index and numbers are taken back`, async t => {
    const f = make(t);
    item(f.folder, 1, 'alpha');
    await sync.commitSettled(f.home, f.folder, 'new alpha');
    const old = process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS; process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS = '1000';
    t.after(() => { if (old === undefined) delete process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS; else process.env.SMOOTH_BACKLOG_CLI_LOCK_WAIT_MS = old; });
    await sync.pull(f.home);
    item(f.folder, 2, 'beta');
    await holdLock(t, sync.lockFile(f.home));
    await assert.rejects(sync.commitSettled(f.home, f.folder, 'new beta'), e => e.code === 'LOCKED' && e.exitCode === 1);
    assert.equal(existsSync(itemPath(f.folder, '002-beta')), false);
    assert.equal(git(f.home, 'status', '--porcelain', '--', f.folder), '');
  });

  test(`${mode}: a failed, undone publication keeps uncommitted edits outside the command's paths and undoes its own`, async t => {
    const f = make(t);
    item(f.folder, 1, 'alpha');
    await sync.commitSettled(f.home, f.folder, 'new alpha');
    const edits = mode === 'code repository'
      ? { 'teams.json': '{"t1":2}\n', 'config.json': '{"sha":"two"}\n', 'notes.txt': 'my notes\n' }
      : (() => { put(join(f.home, 'teams.json'), '{}\n'); put(join(f.home, '.backlog', 'config.json'), '{"sha":"a"}\n'); put(join(f.home, 'notes.txt'), 'n\n'); git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'files'); git(f.home, 'push', '-q'); return { 'teams.json': '{"lead":1}\n', '.backlog/config.json': '{"sha":"b"}\n', 'notes.txt': 'my notes\n' }; })();
    refuse(f.bare);
    const indexBefore = readFileSync(join(f.folder, 'index.json'), 'utf8');
    const before = git(f.home, 'rev-parse', 'HEAD');
    item(f.folder, 2, 'beta');
    store.write({ path: itemPath(f.folder, '001-alpha'), fm: { ...ENVELOPE, phase: '001-alpha', seq: 1, name: 'alpha', status: 'done', repository: 'acme/demo', branch: 'main' }, body: '\n# changed\n' });
    await sync.pull(f.home); // the starting snapshot of the command is taken here: the edits below come after it
    for (const [p, text] of Object.entries(edits)) writeFileSync(join(f.home, p), text);
    await assert.rejects(sync.commitSettled(f.home, f.folder, 'two changes'), /change was not published/);
    for (const [p, text] of Object.entries(edits)) assert.equal(readFileSync(join(f.home, p), 'utf8'), text, `${p} kept`);
    assert.equal(git(f.home, 'rev-parse', 'HEAD'), before, 'no commit left');
    assert.equal(readFileSync(join(f.folder, 'index.json'), 'utf8'), indexBefore, 'what the command itself wrote (the index) is back');
    assert.ok(existsSync(itemPath(f.folder, '002-beta')), 'the starting edits stay, as before');
    assert.equal(git(f.home, 'diff', '--cached', '--name-only'), '', 'nothing is left staged');
  });
}

// --- a person's own unpushed commit and uncommitted edits are never taken back with the command's commit
test('backlog clone: a refused push takes back only the command\'s commit: a person\'s commit below it and an uncommitted edit stay', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha'); item(f.folder, 3, 'gamma');
  await sync.commitSettled(f.home, f.folder, 'new items');
  refuse(f.bare);
  const alpha = itemPath(f.folder, '001-alpha');
  const mine = readFileSync(alpha, 'utf8').replace('status: pending', 'status: done').replace('"status": "pending"', '"status": "done"');
  assert.notEqual(mine, readFileSync(alpha, 'utf8'));
  const gamma = itemPath(f.folder, '003-gamma');
  const gammaEdit = readFileSync(gamma, 'utf8').replace('# x', '# my uncommitted edit');
  const person = () => { // a commit of the person lands under the command's commit while the command runs
    const own = git(f.home, 'rev-parse', 'HEAD');
    git(f.home, 'reset', '-q', '--soft', 'HEAD~1');
    writeFileSync(alpha, mine);
    git(f.home, 'commit', '-qm', 'person: alpha done', '--only', '--', alpha);
    git(f.home, 'commit', '-qC', own);
  };
  item(f.folder, 2, 'beta');
  writeFileSync(gamma, gammaEdit);
  await assert.rejects(sync.commit(f.home, f.folder, 'add beta', person), /change was not published/);
  assert.match(git(f.home, 'log', '--format=%s', '-3'), /person: alpha done/, 'the person\'s commit is still in history');
  assert.equal(readFileSync(alpha, 'utf8'), mine, 'the person\'s change of an owned path stays');
  assert.equal(readFileSync(gamma, 'utf8'), gammaEdit, 'the uncommitted edit of an owned path stays');
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), '', 'nothing is left staged');
  assert.doesNotMatch(git(f.home, 'log', '--format=%s', '-3'), /add beta/, 'the command\'s commit is gone');
});

test('backlog clone: a person\'s commit on top of the command\'s commit is never dropped by the undo of a refused push', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  refuse(f.bare);
  const alpha = itemPath(f.folder, '001-alpha');
  const mine = readFileSync(alpha, 'utf8').replace('"status": "pending"', '"status": "done"').replace('status: pending', 'status: done');
  assert.notEqual(mine, readFileSync(alpha, 'utf8'));
  item(f.folder, 2, 'beta');
  const person = () => { writeFileSync(alpha, mine); git(f.home, 'commit', '-qm', 'person: alpha done', '--only', '--', alpha); };
  const e = await sync.commit(f.home, f.folder, 'add beta', person).then(() => null, x => x);
  assert.equal(e?.exitCode, 3);
  const own = git(f.home, 'log', '--format=%h %s', '-3').split('\n').find(l => /add beta/.test(l)).split(' ')[0];
  assert.doesNotMatch(e.message, /local branch and working tree were rolled back/);
  assert.match(e.message, new RegExp(`\\. The change was not published; the command's commit ${own} is kept on the branch under your own commit and nothing was rolled back\\. To finish, publish with: git -C \\S+ push origin HEAD:main  or take the command's change back with: git -C \\S+ revert --no-edit ${own}  and then publish with that push \\(if the revert stops on a conflict: git -C \\S+ revert --abort, then publish with the push alone\\)$`));
  assert.doesNotMatch(e.message, /run the command again|reset --keep/);
  assert.match(git(f.home, 'log', '--format=%s', '-3'), /person: alpha done/);
  assert.equal(readFileSync(alpha, 'utf8'), mine);
});

// A person's commit made right after the command's own commit (a hook of the clone stands for the person): `subject` ends the command's subject.
function personOnTop(gitDir, ending, path, personSubject) {
  const hook = join(gitDir, 'hooks', 'post-commit');
  writeFileSync(hook, `#!/bin/sh\ncase "$(git log -1 --format=%s)" in *"${ending}") ;; *) exit 0;; esac\nunset GIT_INDEX_FILE\ncd "$(git rev-parse --show-toplevel)"\n[ -e "${path}" ] && exit 0\nmkdir -p "$(dirname "${path}")"\necho person > "${path}"\ngit add "${path}"\ngit -c user.name=P -c user.email=p@example.com commit -q -m "${personSubject}" -- "${path}"\n`);
  chmodSync(hook, 0o755);
}
const subjects = (home, n = 4) => git(home, 'log', '--format=%s', `-${n}`);
const failure = p => p.then(() => null, x => x);

test('backlog clone: a person\'s commit on top with the command\'s own subject but a path outside its folder is not taken back', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  refuse(f.bare);
  personOnTop(join(f.home, '.git'), ': add beta', 'acme/other/p.txt', 'acme/demo: add beta');
  item(f.folder, 2, 'beta');
  const e = await failure(sync.commitSettled(f.home, f.folder, 'add beta'));
  assert.equal(e?.exitCode, 3);
  assert.equal(readFileSync(join(f.home, 'acme', 'other', 'p.txt'), 'utf8'), 'person\n');
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '2', 'both commits are kept');
  assert.match(e.message, /nothing was rolled back/);
});

test('backlog clone: the stale refusal (exit 5) keeps a person\'s commit on top and says so', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  const home2 = join(f.dir, 'home2'); git(f.dir, 'clone', '-q', f.bare, home2);
  const was = JSON.parse(readFileSync(itemPath(f.folder, '001-alpha'), 'utf8')).updated;
  store.write({ path: itemPath(join(home2, 'acme', 'demo'), '001-alpha'), fm: { ...ENVELOPE, phase: '001-alpha', seq: 1, name: 'alpha', status: 'done', repository: 'acme/demo', branch: 'main' }, body: '\n# theirs\n' });
  git(home2, 'add', '-A'); git(home2, 'commit', '-qm', 'theirs'); git(home2, 'push', '-q');
  personOnTop(join(f.home, '.git'), ': add beta', 'acme/other/p.txt', 'person: other');
  item(f.folder, 2, 'beta');
  const e = await failure(sync.commitSettled(f.home, f.folder, 'add beta', [{ path: 'acme/demo/phases/001-alpha.json', slug: '001-alpha', was }]));
  assert.equal(e?.code, 'STALE_ITEM');
  assert.equal(e.exitCode, 5);
  assert.match(subjects(f.home), /person: other/);
  assert.equal(readFileSync(join(f.home, 'acme', 'other', 'p.txt'), 'utf8'), 'person\n');
  assert.match(e.message, /your own commit lies on top of the command's commit [0-9a-f]+, which is kept unpublished on the branch: read the item again before publishing, then publish with: git -C \S+ push origin HEAD:main  or take the command's change back with: git -C \S+ revert --no-edit [0-9a-f]+/);
});

test('backlog clone: a command that committed nothing never takes back a person\'s commit', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  const person = () => { put(join(f.home, 'acme', 'other', 'p.txt'), 'person\n'); git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'person: other'); throw new Error('stop'); };
  await assert.rejects(sync.commit(f.home, f.folder, 'nothing', person), /stop/);
  assert.match(subjects(f.home), /person: other/);
  assert.equal(readFileSync(join(f.home, 'acme', 'other', 'p.txt'), 'utf8'), 'person\n');
});

test('backlog clone: a command that committed nothing goes to the fetched remote when it fails after upstream moved', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  const home2 = join(f.dir, 'home2'); git(f.dir, 'clone', '-q', f.bare, home2);
  put(join(home2, 'acme', 'other', 'u.txt'), 'upstream\n'); git(home2, 'add', '-A'); git(home2, 'commit', '-qm', 'upstream'); git(home2, 'push', '-q');
  await assert.rejects(sync.commit(f.home, f.folder, 'nothing', () => { throw new Error('stop'); }), /stop/);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), git(f.home, 'rev-parse', 'origin/main'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
});

test('backlog clone: a command text with a newline or edge spaces is one trimmed subject and a refused push still rolls it back', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  refuse(f.bare);
  const before = git(f.home, 'rev-parse', 'HEAD');
  item(f.folder, 2, 'beta');
  const e = await failure(sync.commitSettled(f.home, f.folder, '  add\nbeta  '));
  assert.match(e?.message ?? '', /local branch and working tree were rolled back/);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), before);
});

test('backlog clone: a person\'s commit that appears before the index is made right is kept and the text never advises dropping it', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  item(f.folder, 2, 'beta');
  const person = () => { put(join(f.home, 'acme', 'other', 'p.txt'), 'person\n'); git(f.home, 'add', 'acme/other/p.txt'); git(f.home, 'commit', '-qm', 'person: other', '--', 'acme/other/p.txt'); item(f.folder, 3, 'gamma'); };
  const e = await failure(sync.commit(f.home, f.folder, 'add beta', person));
  assert.equal(e?.exitCode, 3);
  assert.match(subjects(f.home), /person: other/);
  assert.doesNotMatch(e.message, /reset --keep|run the command again|undefined/);
  assert.match(e.message, /your own commit appeared on the branch while the command ran\. The change was not published; the command's commit [0-9a-f]+ is kept/);
});

test('code repository: a person\'s commit made on top of the command\'s commit during the command is kept', async t => {
  const f = modes['code repository'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  refuse(f.bare);
  const repo = join(f.home, '..');
  personOnTop(join(repo, '.git'), ': add beta', 'code2.js', 'person: code');
  item(f.folder, 2, 'beta');
  const e = await failure(sync.commitSettled(f.home, f.folder, 'add beta'));
  assert.equal(e?.exitCode, 3);
  assert.match(subjects(repo), /person: code/);
  assert.equal(readFileSync(join(repo, 'code2.js'), 'utf8'), 'person\n');
  assert.match(e.message, /nothing was rolled back/);
  assert.doesNotMatch(e.message, /undefined/);
});

// The other clone has published item 002 meanwhile: the command's own 002 is renumbered (its commit amended) before the push.
function otherClonePublishes(t) {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  return sync.commitSettled(f.home, f.folder, 'new alpha').then(() => {
    const home2 = join(f.dir, 'home2'); git(f.dir, 'clone', '-q', f.bare, home2);
    item(join(home2, 'acme', 'demo'), 2, 'beta');
    git(home2, 'add', '-A'); git(home2, 'commit', '-qm', 'beta from the other clone'); git(home2, 'push', '-q');
    refuse(f.bare);
    return f;
  });
}

test('backlog clone: a refused push after a renumbering is still rolled back to the remote', async t => {
  const f = await otherClonePublishes(t);
  item(f.folder, 2, 'gamma');
  const e = await failure(sync.commitSettled(f.home, f.folder, 'add gamma'));
  assert.match(e?.message ?? '', /local branch and working tree were rolled back/);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), git(f.home, 'rev-parse', 'origin/main'));
  assert.doesNotMatch(subjects(f.home), /add gamma/);
});

test('backlog clone: a person\'s same-subject commit that touches only the command\'s folder is kept, not taken back as the command\'s', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  refuse(f.bare);
  personOnTop(join(f.home, '.git'), ': add beta', 'acme/demo/note.txt', 'acme/demo: add beta');
  item(f.folder, 2, 'beta');
  const e = await failure(sync.commitSettled(f.home, f.folder, 'add beta'));
  assert.equal(e?.exitCode, 3);
  assert.equal(readFileSync(join(f.folder, 'note.txt'), 'utf8'), 'person\n');
  assert.equal(git(f.home, 'rev-list', '--count', 'origin/main..HEAD'), '2');
  assert.match(e.message, /nothing was rolled back/);
});

test('backlog clone: a person\'s commit that lands on top before the renumbering is not amended', async t => {
  const f = await otherClonePublishes(t);
  personOnTop(join(f.home, '.git'), ': add gamma', 'acme/other/p.txt', 'person: other');
  item(f.folder, 2, 'gamma');
  const e = await failure(sync.commitSettled(f.home, f.folder, 'add gamma'));
  assert.equal(e?.exitCode, 3);
  const person = git(f.home, 'log', '--format=%H', '--grep=^person: other$', '-1');
  assert.equal(git(f.home, 'show', '--format=', '--name-only', person), 'acme/other/p.txt', 'the person\'s commit holds only the person\'s file');
  assert.equal(readFileSync(join(f.home, 'acme', 'other', 'p.txt'), 'utf8'), 'person\n');
});

test('code repository: a person\'s commit on top is not amended when the reconciled index is folded in; the change gets a commit of its own', async t => {
  const f = modes['code repository'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  refuse(f.bare);
  const repo = join(f.home, '..');
  personOnTop(join(repo, '.git'), ': add beta', 'code2.js', 'person: code');
  item(f.folder, 2, 'beta');
  const e = await failure(sync.commit(f.home, f.folder, 'add beta', () => item(f.folder, 3, 'gamma')));
  assert.equal(e?.exitCode, 3);
  const person = git(repo, 'log', '--format=%H', '--grep=^person: code$', '-1');
  assert.equal(git(repo, 'show', '--format=', '--name-only', person), 'code2.js', 'the person\'s commit holds only the person\'s file');
  assert.match(subjects(repo, 6), /index reconciled/);
  assert.match(e.message, /nothing was rolled back/);
});

for (const [mode, other] of [['backlog clone', 'acme/other/p.txt'], ['code repository', 'code2.js']]) {
  test(`${mode}: a person's commit that lands on top of the command's commit is never pushed with it`, async t => {
    const f = modes[mode](t);
    item(f.folder, 1, 'alpha');
    await sync.commitSettled(f.home, f.folder, 'new alpha');
    const repo = mode === 'code repository' ? join(f.home, '..') : f.home;
    personOnTop(join(repo, '.git'), ': add beta', other, 'person: private notes');
    item(f.folder, 2, 'beta');
    store.reflow(f.folder, {}); // the index is right already: nothing is left for the reconcile step to fold in, so only the push could carry the person's commit
    const origin = git(repo, 'ls-remote', 'origin', 'main').split('\t')[0];
    const e = await failure(sync.commit(f.home, f.folder, 'add beta', () => {}));
    assert.equal(e?.exitCode, 3);
    assert.equal(git(repo, 'ls-remote', 'origin', 'main').split('\t')[0], origin, 'nothing reached the origin');
    assert.match(subjects(repo), /person: private notes/);
    assert.equal(git(repo, 'rev-list', '--count', 'origin/main..HEAD'), '2');
    assert.match(e.message, /your own commit appeared on the branch while the command ran\. The command's commit [0-9a-f]+ is kept on the branch under your own commit and nothing was rolled back\. To finish, publish with: /);
  });
}

test('backlog clone: the kept commit named is the command\'s own, never a same-subject commit of a person', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  refuse(f.bare);
  personOnTop(join(f.home, '.git'), ': add beta', 'acme/other/p.txt', 'acme/demo: add beta');
  item(f.folder, 2, 'beta');
  const e = await failure(sync.commitSettled(f.home, f.folder, 'add beta'));
  const named = e.message.match(/the command's commit ([0-9a-f]+) is kept/)[1];
  assert.equal(git(f.home, 'show', '--format=', '--name-only', named).includes('acme/other/p.txt'), false, 'the person\'s commit is not the one named');
  assert.match(git(f.home, 'show', '--format=', '--name-only', named), /acme\/demo\/phases/);
});

test('backlog clone: a renumbering with a dependent item followed by a refused push is rolled back', async t => {
  const f = await otherClonePublishes(t);
  item(f.folder, 2, 'gamma');
  store.write({ path: itemPath(f.folder, '003-delta'), fm: { ...ENVELOPE, phase: '003-delta', seq: 3, name: 'delta', status: 'pending', repository: 'acme/demo', branch: 'main', depends_on: [2] }, body: '\n# x\n' });
  const e = await failure(sync.commitSettled(f.home, f.folder, 'add gamma and delta'));
  assert.match(e?.message ?? '', /local branch and working tree were rolled back/);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), git(f.home, 'rev-parse', 'origin/main'));
  assert.equal(git(f.home, 'status', '--porcelain', '--untracked-files=no'), '');
});

test('backlog clone: a command that committed nothing never publishes a commit of a person that appeared meanwhile', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  const origin = git(f.home, 'ls-remote', 'origin', 'main').split('\t')[0];
  const person = () => { put(join(f.home, 'acme', 'other', 'p.txt'), 'person\n'); git(f.home, 'add', 'acme/other/p.txt'); git(f.home, 'commit', '-qm', 'person: other', '--', 'acme/other/p.txt'); };
  const e = await failure(sync.commit(f.home, f.folder, 'nothing', person));
  assert.equal(e?.exitCode, 3);
  assert.equal(git(f.home, 'ls-remote', 'origin', 'main').split('\t')[0], origin, 'nothing reached the origin');
  assert.match(subjects(f.home), /person: other/);
  assert.match(e.message, /It is kept unpublished and nothing was rolled back\. To finish, publish with: git -C \S+ push origin HEAD:main/);
});

test('code repository: a person\'s commit below the command\'s commit is pushed with it, as the branch is pushed as it is', async t => {
  const f = modes['code repository'](t);
  const repo = join(f.home, '..');
  await sync.pull(f.home);
  put(join(repo, 'code2.js'), 'person\n'); git(repo, 'add', 'code2.js'); git(repo, 'commit', '-qm', 'person: code');
  item(f.folder, 2, 'beta');
  await sync.commitSettled(f.home, f.folder, 'add beta');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), git(repo, 'ls-remote', 'origin', 'main').split('\t')[0], 'the origin has both commits');
  assert.match(subjects(repo, 2), /person: code/);
});

test('code repository: a command that committed nothing still pushes a person\'s pending commit, as before', async t => {
  const f = modes['code repository'](t);
  const repo = join(f.home, '..');
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  put(join(repo, 'code2.js'), 'person\n'); git(repo, 'add', 'code2.js'); git(repo, 'commit', '-qm', 'person: code');
  await sync.commitSettled(f.home, f.folder, 'nothing to do');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), git(repo, 'ls-remote', 'origin', 'main').split('\t')[0]);
});

test('backlog clone: the command\'s change already upstream and a person\'s commit left above the remote: the text says so, nothing is published', async t => {
  const f = modes['backlog clone'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  const home2 = join(f.dir, 'home2'); git(f.dir, 'clone', '-q', f.bare, home2);
  const change = folder => store.write({ path: itemPath(folder, '001-alpha'), fm: { ...ENVELOPE, phase: '001-alpha', seq: 1, name: 'alpha', status: 'done', repository: 'acme/demo', branch: 'main', updated: '2026-11-01T00:00:00Z' }, body: '\n# same\n' });
  change(join(home2, 'acme', 'demo')); git(home2, 'add', '-A'); git(home2, 'commit', '-qm', 'same change'); git(home2, 'push', '-q');
  const origin = git(f.home, 'ls-remote', 'origin', 'main').split('\t')[0];
  personOnTop(join(f.home, '.git'), ': finish alpha', 'acme/other/p.txt', 'person: other');
  change(f.folder);
  const e = await failure(sync.commit(f.home, f.folder, 'finish alpha', () => {}));
  assert.equal(e?.exitCode, 3, e?.message);
  assert.match(e.message, /The command's change is already upstream, your own commit was not published and nothing was rolled back\. To finish, publish your commit with: git -C \S+ push origin HEAD:main$/);
  assert.doesNotMatch(e.message, /could not be identified/);
  assert.equal(git(f.home, 'ls-remote', 'origin', 'main').split('\t')[0], origin);
  assert.match(subjects(f.home), /person: other/);
});

// --- a pull that fails after upstream changed other paths
function conflictSetup(t, personLine) {
  const f = modes['backlog clone'](t);
  const item = (folder, text) => store.write({ path: itemPath(folder, '001-alpha'), fm: { ...ENVELOPE, phase: '001-alpha', seq: 1, name: 'alpha', status: 'pending', repository: 'acme/demo', branch: 'main', summary: text }, body: '\n# x\n' });
  item(f.folder, 'one');
  put(join(f.home, 'acme', 'other', 'notes.txt'), 'l1\nl2\nl3\n'); put(join(f.home, 'acme', 'other', 'plain.txt'), 'p\n');
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-qm', 'seed'); git(f.home, 'push', '-q');
  const home2 = join(f.dir, 'home2'); git(f.dir, 'clone', '-q', f.bare, home2);
  const other = join(f.home, 'acme', 'other');
  writeFileSync(join(other, 'plain.txt'), 'person plain\n'); // a person's uncommitted edit of another folder
  writeFileSync(join(other, 'notes.txt'), personLine);
  return { f, item, home2 };
}
async function failedPull(t, personLine, untracked = false) {
  const { f, item, home2 } = conflictSetup(t, personLine);
  if (untracked) writeFileSync(join(f.home, 'acme', 'other', 'b-new.txt'), 'mine\n'); // a path upstream adds below
  await sync.pull(f.home); // the command's starting snapshot
  item(f.folder, 'mine'); // the command's change of alpha
  // upstream: a conflicting change of alpha, an edit and a new file in the other folder
  item(join(home2, 'acme', 'demo'), 'theirs');
  writeFileSync(join(home2, 'acme', 'other', 'notes.txt'), 'U1\nl2\nl3\n'); writeFileSync(join(home2, 'acme', 'other', 'plain.txt'), 'plain from upstream\n'); writeFileSync(join(home2, 'acme', 'other', 'b-new.txt'), 'b\n');
  git(home2, 'add', '-A'); git(home2, 'commit', '-qm', 'upstream'); git(home2, 'push', '-q');
  const e = await sync.commitSettled(f.home, f.folder, 'change alpha').then(() => null, x => x);
  assert.match(e?.message ?? '', /change was not published/);
  return { f, e };
}

test('backlog clone: a pull that failed after upstream changed other folders leaves no path staged as reverted', async t => {
  const { f } = await failedPull(t, 'l1\nl2\nP3\n');
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), '');
  assert.equal(readFileSync(join(f.home, 'acme', 'other', 'b-new.txt'), 'utf8'), 'b\n');
});

test('backlog clone: a person\'s edit of a path upstream changed is laid over the upstream version', async t => {
  const { f } = await failedPull(t, 'l1\nl2\nP3\n');
  assert.equal(readFileSync(join(f.home, 'acme', 'other', 'notes.txt'), 'utf8'), 'U1\nl2\nP3\n');
  assert.equal(git(f.home, 'status', '--porcelain', '--', 'acme/other/notes.txt'), 'M acme/other/notes.txt');
});

test('backlog clone: a person\'s edit that conflicts with the upstream change is kept in a named stash and said so', async t => {
  const { f, e } = await failedPull(t, 'P1\nl2\nl3\n');
  assert.equal(readFileSync(join(f.home, 'acme', 'other', 'notes.txt'), 'utf8'), 'U1\nl2\nl3\n');
  assert.match(git(f.home, 'stash', 'list'), /your edit of acme\/other\/notes\.txt/);
  assert.match(e.message, /acme\/other\/notes\.txt.* conflicts with the upstream change and is kept in the stash/);
  assert.equal(git(f.home, 'diff', '--cached', '--name-only'), '');
});

test('backlog clone: a person\'s untracked file at a path upstream added stays as a modified file, not a deletion of upstream\'s', async t => {
  const { f } = await failedPull(t, 'l1\nl2\nP3\n', true);
  assert.equal(readFileSync(join(f.home, 'acme', 'other', 'b-new.txt'), 'utf8'), 'mine\n');
  assert.equal(git(f.home, 'status', '--porcelain', '--', 'acme/other/b-new.txt'), 'M acme/other/b-new.txt');
});

test('code repository: a person\'s untracked file at a path upstream added stays untouched after a failed pull', async t => {
  const f = modes['code repository'](t);
  item(f.folder, 1, 'alpha');
  await sync.commitSettled(f.home, f.folder, 'new alpha');
  const repo = join(f.home, '..'); const b = join(f.dir, 'b'); git(f.dir, 'clone', '-q', f.bare, b);
  await sync.pull(f.home);
  writeFileSync(join(repo, 'code2.js'), 'mine\n');
  store.write({ path: itemPath(f.folder, '001-alpha'), fm: { ...ENVELOPE, phase: '001-alpha', seq: 1, name: 'alpha', status: 'pending', repository: 'acme/demo', branch: 'main', summary: 'mine' }, body: '\n# x\n' });
  store.write({ path: itemPath(join(b, '.backlog', 'acme', 'demo'), '001-alpha'), fm: { ...ENVELOPE, phase: '001-alpha', seq: 1, name: 'alpha', status: 'pending', repository: 'acme/demo', branch: 'main', summary: 'theirs' }, body: '\n# x\n' });
  writeFileSync(join(b, 'code2.js'), 'theirs\n'); git(b, 'add', '-A'); git(b, 'commit', '-qm', 'theirs'); git(b, 'push', '-q');
  await assert.rejects(sync.commitSettled(f.home, f.folder, 'change alpha'), /change was not published/);
  assert.equal(readFileSync(join(repo, 'code2.js'), 'utf8'), 'mine\n');
  assert.equal(git(repo, 'status', '--porcelain', '--', 'code2.js'), '?? code2.js');
});

test('code repository: a person\'s edit that conflicts with the pull: the command\'s deleted item comes back and the next step is named', async t => {
  const f = modes['code repository'](t);
  item(f.folder, 1, 'alpha'); item(f.folder, 2, 'beta');
  await sync.commitSettled(f.home, f.folder, 'new items');
  const repo = join(f.home, '..'); const b = join(f.dir, 'b'); git(f.dir, 'clone', '-q', f.bare, b);
  await sync.pull(f.home);
  writeFileSync(join(repo, 'code.js'), 'mine\n');
  store.note(itemPath(f.folder, '001-alpha')); rmSync(itemPath(f.folder, '001-alpha')); // the command removes an item (every command records its removals)
  writeFileSync(join(b, 'code.js'), 'theirs\n'); git(b, 'add', '-A'); git(b, 'commit', '-qm', 'theirs'); git(b, 'push', '-q');
  const e = await sync.commitSettled(f.home, f.folder, 'remove alpha').then(() => null, x => x);
  assert.ok(e, 'the publication failed');
  assert.ok(existsSync(itemPath(f.folder, '001-alpha')), 'the removed item is back');
  assert.match(git(repo, 'stash', 'list'), /autostash/);
  assert.match(e.message, /your own edit is kept in the stash/);
  assert.doesNotMatch(e.message, /then run the command again\), and/);
  assert.match(e.message, /Next: resolve the conflicted files \(git -C \S+ status\), git add them, then run: git -C \S+ reset --soft [0-9a-f]{40}  and then run the command again$/);
});

function item(folder, seq, name) { store.write({ path: itemPath(folder, `00${seq}-${name}`), fm: { ...ENVELOPE, phase: `00${seq}-${name}`, seq, name, status: 'pending', repository: 'acme/demo', branch: 'main' }, body: '\n# x\n' }); }

// --- a person's own bytes of a file the command rewrites come back, in both ways a user command is taken back (code repository)
function personEdit(t) {
  const f = modes['code repository'](t);
  const own = (seq, name, more = {}) => store.write({ path: itemPath(f.folder, `00${seq}-${name}`), fm: { ...ENVELOPE, phase: `00${seq}-${name}`, seq, name, status: 'pending', repository: 'acme/demo', branch: 'main', ...more }, body: '\n# x\n' });
  const repo = join(f.home, '..');
  put(join(repo, 'code.js'), 'x\n'); own(1, 'alpha'); own(2, 'beta');
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'seed'); git(repo, 'push', '-q');
  return { f, own, repo };
}
async function startCommand({ f, own, repo }) {
  await sync.pull(f.home);
  writeFileSync(join(repo, 'code.js'), 'mine\n');
  own(1, 'alpha', { summary: 'person' }); // the person's uncommitted edit of a file the command rewrites
  const person = readFileSync(itemPath(f.folder, '001-alpha'), 'utf8');
  await sync.pull(f.home); // the command's starting snapshot
  own(1, 'alpha', { summary: 'command' }); rmSync(itemPath(f.folder, '002-beta')); own(3, 'gamma');
  return person;
}
const putBackBack = (w, person) => {
  assert.equal(readFileSync(itemPath(w.f.folder, '001-alpha'), 'utf8'), person, 'the person\'s bytes are back');
  assert.ok(existsSync(itemPath(w.f.folder, '002-beta')), 'the deleted item is back');
  assert.ok(!existsSync(itemPath(w.f.folder, '003-gamma')), 'the created item is gone');
};

test('code repository: a refused push puts back the person\'s bytes of a file the command rewrote', async t => {
  const w = personEdit(t);
  const other = join(w.f.dir, 'b'); git(w.f.dir, 'clone', '-q', w.f.bare, other);
  const person = await startCommand(w);
  refuse(w.f.bare);
  await assert.rejects(sync.commitSettled(w.f.home, w.f.folder, 'change'), /change was not published/);
  putBackBack(w, person);
});

test('code repository: an unmerged index after the pull puts back the person\'s bytes and names the next step', async t => {
  const w = personEdit(t);
  const other = join(w.f.dir, 'b'); git(w.f.dir, 'clone', '-q', w.f.bare, other);
  const person = await startCommand(w);
  writeFileSync(join(other, 'code.js'), 'theirs\n'); git(other, 'add', '-A'); git(other, 'commit', '-qm', 'theirs'); git(other, 'push', '-q');
  await assert.rejects(sync.commitSettled(w.f.home, w.f.folder, 'change'), /Next: resolve the conflicted files/);
  putBackBack(w, person);
});
