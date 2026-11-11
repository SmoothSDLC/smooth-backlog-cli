// The undo of a failed publication restores the command's own paths only (src/shared/sync.js), in both backlog locations:
// the backlog clone, and a backlog folder inside the code repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GIT_IDENTITY, ENVELOPE, itemPath, sharedBacklog, BACKLOG_OWNER, BACKLOG_NAME } from './shared-fixtures.js';
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
  assert.match(e.message, new RegExp(`not published in \\S+.*\\. Your own commit lies on top of the command's commit ${own}, so the command's commit is kept on the branch and nothing was rolled back\\. Either publish both with: git -C \\S+ push origin HEAD:main  or drop the command's commit with: git -C \\S+ revert --no-edit ${own}  and run the command again$`));
  assert.match(git(f.home, 'log', '--format=%s', '-3'), /person: alpha done/);
  assert.equal(readFileSync(alpha, 'utf8'), mine);
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
  rmSync(itemPath(f.folder, '001-alpha')); // the command removes an item
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
