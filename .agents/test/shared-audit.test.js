// Tests for the full-audit batch of PR #3 (an independent reviewer's reproductions, ported). One clone, one consumer repository acme/demo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { gitIn } from './shared-concurrency.js';

function solo(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = sharedBacklog(tmp);
  const cons = consumer(tmp, 'acme', 'demo', 'main');
  mkdirSync(join(tmp, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(tmp, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = (args, env) => cli(args, { cwd: cons, tmp, env });
  return { tmp, home, cons, folder: join(home, 'acme', 'demo'), run };
}
const NEW = (name, ...more) => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', ...more];
const out = r => `${r.stdout}${r.stderr}`;

test('audit t1/t9: a refused or dry-run command leaves no untracked backlog.db that would block the next pull', t => {
  const s = solo(t);
  for (const args of [['update', '9', '--summary', 'x'], ['update', '9', '--summary', 'x', '--dry-run'], ['archive', '9'], ['archive', '9', '--dry-run'],
    ['move', '9', '--to-repository', 'other/proj'], NEW('x', '--depends-on', '99'), NEW('x', '--dry-run')]) {
    s.run(args);
    assert.equal(existsSync(join(s.folder, 'backlog.db')), false, `${args.join(' ')} left a backlog.db`);
    assert.equal(gitIn(s.home, 'status', '--porcelain'), '', `${args.join(' ')} left untracked files`);
  }
  assert.equal(s.run(NEW('real one')).status, 0); // the db is created and committed by a command that records something
  assert.equal(existsSync(join(s.folder, 'backlog.db')), true);
  assert.equal(s.run(['update', '9', '--summary', 'x']).status, 1); // an existing db stays
  assert.equal(existsSync(join(s.folder, 'backlog.db')), true);
});
