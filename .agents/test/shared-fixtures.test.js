// Job 1 acceptance test: one consumer plus the shared backlog. backlog new must
// succeed against the local bare origin only, and the real backlog repository
// (~/git/smoothsdlc-backlog) must be untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, env, sharedBacklog } from './shared-fixtures.js';

test('shared fixtures: a new phase lands on the local bare and the real backlog stays untouched', t => {
  const tmp = mkdtempSync(join(tmpdir(), 'backlog-shared-fixtures-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const home = sharedBacklog(tmp);
  const repo = consumer(tmp, 'backlog-test', 'consumer', 'main');
  const bare = join(tmp, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  assert.ok(existsSync(join(home, '.git')), 'the shared clone is a git repository');
  assert.ok(env(tmp).BACKLOG_HOME.startsWith(tmp), 'BACKLOG_HOME stays inside the test temp dir');

  const realHome = join(homedir(), 'git', BACKLOG_NAME);
  const realHead = () => spawnSync('git', ['-C', realHome, 'log', '-1', '--format=%H'], { encoding: 'utf8' }).stdout.trim();
  const before = realHead();

  mkdirSync(join(tmp, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(tmp, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const r = cli(['new', '--name', 'x', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: repo, tmp });
  assert.equal(r.status, 0, `backlog new failed: ${r.stdout}${r.stderr}`);

  const phases = join(home, 'backlog-test', 'consumer', 'phases');
  const made = readdirSync(phases).filter(n => /^\d{3}-x\.md$/.test(n));
  assert.equal(made.length, 1, `no new item file in ${phases}`);
  const phaseFile = join(phases, made[0]);
  assert.ok(existsSync(phaseFile), `phase file ${phaseFile} missing in the shared clone`);
  const inBare = spawnSync('git', ['-C', bare, 'cat-file', '-e', `main:${relative(home, phaseFile)}`], { encoding: 'utf8' });
  assert.equal(inBare.status, 0, 'the new phase commit is not on the local bare origin');

  assert.equal(realHead(), before, 'the real backlog repository head changed');
});
