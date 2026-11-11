// $session of a team command: the id, the actionable repository, the branch and the HEAD commit of the working copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionOf } from '../../src/team/session.js';

const git = (cwd, ...a) => { const p = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }); if (p.status) throw new Error(p.stderr); return p.stdout.trim(); };
const repo = t => { const d = mkdtempSync(join(tmpdir(), 'team-session-')); t.after(() => rmSync(d, { recursive: true, force: true })); git(d, 'init', '-q', '-b', 'work'); return d; };

test('the branch is the input, else the current branch; the commit is HEAD; no commit yet is empty', t => {
  const d = repo(t);
  assert.deepEqual(sessionOf({ inputs: { session: 's-1', branch: '' }, repo: 'acme/app', cwd: d }), { id: 's-1', repository: 'acme/app', branch: 'work', commit: '' });
  git(d, 'commit', '-q', '--allow-empty', '-m', 'one');
  const head = git(d, 'rev-parse', 'HEAD');
  assert.deepEqual(sessionOf({ inputs: { session: '', branch: '' }, repo: 'acme/app', cwd: d }), { id: '', repository: 'acme/app', branch: 'work', commit: head });
  assert.equal(sessionOf({ inputs: { session: '', branch: 'other' }, repo: 'acme/lib', cwd: d }).branch, 'other');
});

test('a detached HEAD with no branch given stops with the design text (exit 2); a branch given is enough', t => {
  const d = repo(t);
  git(d, 'commit', '-q', '--allow-empty', '-m', 'one');
  git(d, 'checkout', '-q', '--detach');
  assert.throws(() => sessionOf({ inputs: { session: '', branch: '' }, repo: 'acme/app', cwd: d }), e => e.exitCode === 2 && e.message === 'HEAD is detached: check out a branch, or give --branch <name> (SMOOTH_BACKLOG_CLI_TEAM_BRANCH)');
  const s = sessionOf({ inputs: { session: '', branch: 'topic' }, repo: 'acme/app', cwd: d });
  assert.equal(s.branch, 'topic');
  assert.equal(s.commit, git(d, 'rev-parse', 'HEAD'));
});
