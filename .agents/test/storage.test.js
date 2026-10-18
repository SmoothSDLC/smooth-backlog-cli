import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
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
  const open = fs.open.bind(fs); let attempts = 0;
  t.mock.method(fs, 'open', async (...args) => {
    if (args[0] === path && ++attempts === 1) throw Object.assign(new Error('Delete pending'), { code: 'EPERM' });
    return open(...args);
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
  t.mock.method(fs, 'open', async () => { attempts++; throw Object.assign(new Error('Permission denied'), { code: 'EPERM' }); });
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
  try { await assert.rejects(locked(join(f.dir, 'denied.lock'), () => assert.fail('must not enter')), { code: 'EPERM' }); assert.equal(attempts, 1); }
  finally { Object.defineProperty(process, 'platform', platform); }
});
test('persistent Windows lock permission errors stop at the retry deadline', async t => {
  const { promises: fs } = await import('node:fs'); const f = fixture(t); let attempts = 0, clock = 0;
  t.mock.method(fs, 'open', async () => { attempts++; throw Object.assign(new Error('Permission denied'), { code: 'EPERM' }); });
  t.mock.method(Date, 'now', () => clock += 20000);
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  try { await assert.rejects(locked(join(f.dir, 'denied.lock'), () => assert.fail('must not enter')), { code: 'EPERM' }); assert.equal(attempts, 1); }
  finally { Object.defineProperty(process, 'platform', platform); }
});
test('failure writing the acquired owner record closes and removes its lock', async t => {
  const { promises: fs } = await import('node:fs'); const f = fixture(t); const path = join(f.dir, 'owner-write.lock');
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args);
    if (args[0] === path) t.mock.method(handle, 'writeFile', async () => { throw Object.assign(new Error('Write failed'), { code: 'EIO' }); });
    return handle;
  });
  await assert.rejects(locked(path, () => assert.fail('must not enter without an owner record')), { code: 'EIO' });
  assert.equal(await fs.stat(path).then(() => true, () => false), false);
});
