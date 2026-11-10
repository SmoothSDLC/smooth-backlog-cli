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
