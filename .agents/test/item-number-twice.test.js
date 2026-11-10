// Two items of one folder that hold one number (only a merge made outside the CLI leaves that): a command given the number stops with exit 2 and
// changes nothing; a slug names either item; commands on other items are not affected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archivedPath, cli, consumer, GIT_IDENTITY, itemPath, sharedBacklog, writeItem } from './shared-fixtures.js';

const REFUSAL = (n, a, b) => `❌ backlog: number ${n} names two items, ${a} and ${b}; name the item by its slug\n`;

function world(t, archivedSecond = false) {
  const dir = mkdtempSync(join(tmpdir(), 'num-twice-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = sharedBacklog(dir); const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  const folder = join(home, 'acme', 'demo');
  const git = (...a) => execFileSync('git', a, { cwd: home, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  writeItem(itemPath(folder, '008-a'), { seq: 8, name: 'A', status: 'pending' }, 'Body A.\n');
  writeItem(archivedSecond ? archivedPath(folder, '008-b') : itemPath(folder, '008-b'), { seq: 8, name: 'B', status: archivedSecond ? 'closed' : 'pending' }, 'Body B.\n');
  writeItem(itemPath(folder, '009-c'), { seq: 9, name: 'C', status: 'pending' }, 'Body C.\n');
  git('add', '-A'); git('commit', '-q', '-m', 'items'); git('push', '-q');
  const run = (...args) => cli(args, { cwd: cons, tmp: dir });
  const files = () => ['008-a', '008-b', '009-c'].map(s => { try { return readFileSync(itemPath(folder, s), 'utf8'); } catch { return readFileSync(archivedPath(folder, s), 'utf8'); } });
  return { run, git, folder, files };
}

for (const archived of [false, true]) {
  test(`a number held by two ${archived ? 'items, one of them archived,' : 'live items'} is refused by show, update, archive and new --depends-on: exit 2, nothing changed`, t => {
    const w = world(t, archived);
    const before = w.files();
    for (const args of [['show', '8'], ['update', '8', '--status', 'closed'], ['archive', '8'], ['move', '8', '--to-repository', 'x/y'], ['new', '--name', 'z', '--depends-on', '8']]) {
      const r = w.run(...args);
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.equal(r.stderr, REFUSAL(8, '008-a', '008-b'), args.join(' '));
    }
    assert.deepEqual(w.files(), before);
    assert.equal(w.git('status', '--porcelain'), '');
  });
}

test('a slug names either item, other items and list are unaffected, and --seq renumbers one of the pair', t => {
  const w = world(t);
  for (const slug of ['008-a', '008-b']) { const r = w.run('show', slug); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, new RegExp(slug)); }
  assert.equal(w.run('list').status, 0);
  assert.equal(w.run('show', '9').status, 0);
  assert.equal(w.run('update', '009-c', '--summary', 'ok').status, 0);
  const r = w.run('update', '008-b', '--seq', '20');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(w.run('show', '8').status, 0);
});
