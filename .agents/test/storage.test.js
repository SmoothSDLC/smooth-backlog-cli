import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.js';
import { locked } from '../../src/storage.js';
test('stale owner detection never removes a lock acquired by a newer process', async t => {
  const f = fixture(t); const path = join(f.dir, 'race.lock'); const dead = 2147483647;
  writeFileSync(path, JSON.stringify({ pid: dead })); const original = process.kill; let released = false;
  process.kill = (pid, signal) => {
    if (pid === dead) {
      writeFileSync(path, JSON.stringify({ pid: process.pid }));
      setTimeout(() => { released = true; rmSync(path, { force: true }); }, 80);
      throw Object.assign(new Error('Stale owner exited'), { code: 'ESRCH' });
    }
    return original(pid, signal);
  };
  try { await locked(path, () => assert.equal(released, true, 'The newer owner must finish before another callback enters')); }
  finally { process.kill = original; }
});
test('a genuinely abandoned lock fails with recovery instructions and is never silently deleted', async t => {
  const f = fixture(t); const path = join(f.dir, 'abandoned.lock'); writeFileSync(path, JSON.stringify({ pid: 2147483647 }));
  await assert.rejects(locked(path, () => assert.fail('must not enter while a lock exists')), /remove.*then rerun/i);
});

test('Windows delete-pending lock creation waits until the file can be opened', async t => {
  const { promises: fs } = await import('node:fs');
  const f = fixture(t); const path = join(f.dir, 'delete-pending.lock');
  const link = fs.link.bind(fs); let attempts = 0; // item 025: the lock name appears by a link of its complete record
  t.mock.method(fs, 'link', async (...args) => {
    if (args[1] === path && ++attempts === 1) throw Object.assign(new Error('Delete pending'), { code: 'EPERM' });
    return link(...args);
  });
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  try {
    await locked(path, async () => assert.equal(JSON.parse(await fs.readFile(path, 'utf8')).pid, process.pid));
    assert.equal(attempts, 2); assert.equal(await fs.stat(path).then(() => true, () => false), false);
  } finally { Object.defineProperty(process, 'platform', platform); }
});
test('Windows lock inspection tolerates a delete-pending reader until the owner releases', async t => {
  const { promises: fs } = await import('node:fs');
  const f = fixture(t); const path = join(f.dir, 'pending-reader.lock');
  writeFileSync(path, JSON.stringify({ pid: process.pid }));
  const read = fs.readFile.bind(fs); let released = false, denied = false;
  t.mock.method(fs, 'readFile', async (...args) => {
    if (args[0] === path && !denied) { denied = true; throw Object.assign(new Error('Delete pending'), { code: 'EPERM' }); }
    return read(...args);
  });
  const timer = setTimeout(() => { released = true; rmSync(path, { force: true }); }, 80);
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  try { await locked(path, () => assert.equal(released, true)); assert.equal(denied, true); }
  finally { clearTimeout(timer); Object.defineProperty(process, 'platform', platform); }
});
test('non-Windows lock permission errors are reported immediately', async t => {
  const { promises: fs } = await import('node:fs'); const f = fixture(t); let attempts = 0;
  t.mock.method(fs, 'link', async () => { attempts++; throw Object.assign(new Error('Permission denied'), { code: 'EPERM' }); });
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
  try { await assert.rejects(locked(join(f.dir, 'denied.lock'), () => assert.fail('must not enter')), { code: 'EPERM' }); assert.equal(attempts, 1); }
  finally { Object.defineProperty(process, 'platform', platform); }
});
test('persistent Windows lock permission errors stop at the retry deadline', async t => {
  const { promises: fs } = await import('node:fs'); const f = fixture(t); let attempts = 0, clock = 0;
  t.mock.method(fs, 'link', async () => { attempts++; throw Object.assign(new Error('Permission denied'), { code: 'EPERM' }); });
  t.mock.method(Date, 'now', () => clock += 20000);
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  try { await assert.rejects(locked(join(f.dir, 'denied.lock'), () => assert.fail('must not enter')), { code: 'EPERM' }); assert.equal(attempts, 1); }
  finally { Object.defineProperty(process, 'platform', platform); }
});
test('failure writing the owner record leaves no lock and no temp file', async t => {
  const { promises: fs } = await import('node:fs'); const f = fixture(t); const path = join(f.dir, 'owner-write.lock');
  const write = fs.writeFile.bind(fs);
  t.mock.method(fs, 'writeFile', async (...args) => {
    if (String(args[0]).startsWith(`${path}.`)) throw Object.assign(new Error('Write failed'), { code: 'EIO' });
    return write(...args);
  });
  await assert.rejects(locked(path, () => assert.fail('must not enter without an owner record')), { code: 'EIO' });
  assert.equal(await fs.stat(path).then(() => true, () => false), false);
  assert.deepEqual(readdirSync(f.dir).filter(n => n.startsWith('owner-write.lock')), []);
});
test('item 025: no process removes another\'s takeover marker: a gone owner\'s level is passed by the level below it', async t => {
  const { acquireMarker, releaseMarker } = await import('../../src/storage.js');
  const { existsSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { hostname } = await import('node:os');
  const f = fixture(t); const lock = join(f.dir, 'run.lock'); const base = `${lock}.takeover`;
  writeFileSync(base, `${process.ppid}@${hostname()}`); // a live owner: wait
  assert.equal(acquireMarker(lock), null);
  const dead = spawnSync(process.execPath, ['-e', '0']).pid;
  writeFileSync(base, `${dead}@${hostname()}`); // a gone owner: its marker stays, the next level is taken
  const held = acquireMarker(lock);
  assert.equal(held, `${base}.${dead}`);
  assert.equal(acquireMarker(lock), null); // this process holds that level now: another waiter waits
  releaseMarker(lock, held);
  assert.deepEqual([existsSync(held), existsSync(base)], [false, false]); // its level and the gone owners' above it
  assert.deepEqual(readdirSync(f.dir).filter(n => n.startsWith('run.lock')), []);
});
