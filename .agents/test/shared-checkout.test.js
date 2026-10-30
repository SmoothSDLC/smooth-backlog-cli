// Item 025: a write checks the shared backlog database out (the run lock of the clone) and in after its commit; the lock
// names the agent that holds it and since when, an agent behind it waits (bounded) with that diagnostic, and two agents
// writing different items at once both succeed without losing a change. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { cliAsync, gitIn } from './shared-concurrency.js';
import * as store from '../../src/shared/store.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'checkout-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  for (const n of ['alpha', 'beta']) {
    const r = cli(['new', '--name', n, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] x'], { cwd: cons, tmp: t });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
  return { t, home, cons };
}

test('025: the waiting agent is told which agent holds the checkout and since when', async () => {
  const f = fixture();
  const was = process.env.QWEN_CODE_AGENT_ID;
  process.env.QWEN_CODE_AGENT_ID = 'amy@t1';
  let refused;
  try {
    await store.cloneLocked(f.home, async () => {
      refused = cli(['update', '1', '--note', 'n', '--by', 'bob'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_LOCK_WAIT_MS: '400', QWEN_CODE_AGENT_ID: 'bob@t1' } });
    });
  } finally { if (was === undefined) delete process.env.QWEN_CODE_AGENT_ID; else process.env.QWEN_CODE_AGENT_ID = was; }
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /locked by another process \(agent amy@t1, pid \d+, .*since \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\)/);
});

test('025: the record names the --by agent of the holder when it has no QWEN_CODE_AGENT_ID', async () => {
  const f = fixture();
  const [was, argv] = [process.env.QWEN_CODE_AGENT_ID, process.argv];
  delete process.env.QWEN_CODE_AGENT_ID;
  process.argv = [...argv, '--by', 'zoe'];
  let refused;
  try {
    await store.cloneLocked(f.home, async () => {
      refused = cli(['update', '1', '--note', 'n', '--by', 'bob'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_LOCK_WAIT_MS: '400' } });
    });
  } finally { process.argv = argv; if (was !== undefined) process.env.QWEN_CODE_AGENT_ID = was; }
  assert.match(refused.stderr, /locked by another process \(agent zoe, pid \d+/);
});

test('025: a lock that a crash left without its record (empty, older than 30 s) is taken over; a new lock is never empty', () => {
  const f = fixture();
  const lock = join(f.home, '.git', 'smooth-backlog-cli-run.lock');
  writeFileSync(lock, '');
  const old = new Date(Date.now() - 60000); utimesSync(lock, old, old);
  const r = cli(['update', '1', '--append', 'after the crash', '--by', 'amy'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /took over a stale lock with an incomplete record older than 30 s/);
  assert.equal(existsSync(lock), false);
});

test('025: two agents writing different items at once both succeed, and both changes are on the origin', async () => {
  const f = fixture();
  let a, b; const ended = new Set();
  await store.cloneLocked(f.home, async () => { // both start while the checkout is held: each must wait for it
    a = cliAsync(['update', '1', '--append', 'from amy', '--by', 'amy'], { cwd: f.cons, tmp: f.t, env: { QWEN_CODE_AGENT_ID: 'amy@t1' } });
    b = cliAsync(['update', '2', '--append', 'from bob', '--by', 'bob'], { cwd: f.cons, tmp: f.t, env: { QWEN_CODE_AGENT_ID: 'bob@t1' } });
    a.done.then(() => ended.add('a')); b.done.then(() => ended.add('b'));
    await new Promise(res => setTimeout(res, 2000));
    assert.equal(ended.size, 0, 'neither writer goes past a held checkout');
  });
  const [ra, rb] = [await a.done, await b.done];
  assert.equal(ra.status, 0, ra.stdout + ra.stderr);
  assert.equal(rb.status, 0, rb.stdout + rb.stderr);
  const bare = gitIn(f.home, 'remote', 'get-url', 'origin');
  assert.match(gitIn(f.t, '--git-dir', bare, 'show', 'main:acme/demo/phases/001-alpha.md'), /from amy/);
  assert.match(gitIn(f.t, '--git-dir', bare, 'show', 'main:acme/demo/phases/002-beta.md'), /from bob/);
  assert.equal(existsSync(join(f.home, '.git', 'smooth-backlog-cli-run.lock')), false); // checked in: no record left
});
