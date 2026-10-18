import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.js';

test('help works outside Git; repository errors preserve the JSON contract', t => {
  const f = fixture(t);
  assert.match(f.raw(['--help'], { cwd: f.dir }).stdout, /backlog/);
  const p = f.raw(['--json'], { cwd: f.dir }); assert.equal(p.status, 1);
  assert.match(JSON.parse(p.stdout).error.message, /outside a git repo/i);
  assert.match(f.fail([], 1).message, /backlog init/);
});
test('initialization detects root from subdirectory and rejects repeated init and force', t => {
  const f = fixture(t); mkdirSync(join(f.root, 'nested'));
  const p = f.raw(['init', '--json'], { cwd: join(f.root, 'nested') }); assert.equal(p.status, 0, p.stdout);
  assert.deepEqual(f.json('backlog_manifest.json'), []);
  assert.equal(f.json('config.json').owner, 'smooth-backlog-cli');
  assert.ok(existsSync(f.file('skills/backlog/SKILL.md')));
  assert.match(p.stderr, /commit/i);
  assert.match(f.fail(['init'], 1).message, /init clean.*init backup/s);
  f.fail(['init', '--force']);
});
test('creation requires planning text, uses GUIDs and appends new items', t => {
  const f = fixture(t); f.cli('init'); f.fail(['new', 'Missing']);
  const a = f.create('First'), b = f.create('Second');
  assert.match(a.id, /^[0-9a-f-]{36}$/); assert.notEqual(a.id, b.id);
  assert.equal(a.priority, 0); assert.equal(b.priority, 1);
  assert.deepEqual(f.cli('list').map(x => x.name), ['First', 'Second']);
  assert.equal(f.cli().id, a.id); assert.equal(f.cli('1', 'set', 'name', 'Renamed').name, 'Renamed');
  f.fail(['new', 'Bad', '{"id":3,"description":"d","ac":"a"}']);
});
test('both command orders support list append, force replacement, removal, and one-based priority', t => {
  const f = fixture(t); f.cli('init'); const a = f.create('Plan');
  f.cli('add', '0', 'tasks', 'First,Goal one'); f.cli('0', 'set', 'tasks', 'Second,Goal two');
  assert.deepEqual(f.cli('priority', '0', 'tasks', '2', '1').tasks.map(x => x.name), ['Second', 'First']);
  f.cli('0', 'remove', 'tasks', '1');
  assert.equal(f.cli('list')[0].tasks[0].name, 'First');
  f.cli('set', '0', 'outcomes', '["a","b"]'); f.cli('add', '0', 'outcomes', 'comma,string', '--top');
  assert.deepEqual(f.cli('list')[0].outcomes, ['comma,string', 'a', 'b']);
  f.cli('set', '0', 'outcomes', '["only"]', '--force');
  assert.deepEqual(f.cli('replace', a.id, 'tasks', '[]').tasks, []);
  f.fail(['priority', '0', 'outcomes', '0', '1']); f.fail(['set', '0', 'name', 'Oops', '--force']);
  f.fail(['archive', '0', '--force']); f.fail(['list', '--force']);
});
test('priority selectors are reused; GUID identity survives completion and reopening', t => {
  const f = fixture(t); f.cli('init'); const a = f.create('A'), b = f.create('B');
  f.cli('1', 'priority', '0'); assert.equal(f.cli().id, b.id);
  const done = f.cli('0', 'done'); assert.equal(done.id, b.id); assert.equal(done.priority, null); assert.ok(done.item_completed_at);
  assert.equal(f.cli().id, a.id);
  assert.equal(f.cli('list', 'done')[0].id, b.id);
  const reopened = f.cli('set', b.id, 'state', 'open'); assert.equal(reopened.priority, 0); assert.equal(reopened.item_completed_at, null);
  assert.deepEqual(f.cli('list').map(x => x.id), [b.id, a.id]);
  f.fail(['priority', '0', '99']);
});
test('done/archive listing uses event timestamps and contains stable GUIDs', t => {
  const f = fixture(t); f.cli('init'); const a = f.create('A'), b = f.create('B');
  f.cli('done', b.id); f.cli('done', a.id);
  const live = f.json('backlog_manifest.json');
  live.find(x => x.id === a.id).item_completed_at = '2025-01-01T00:00:00.000Z';
  live.find(x => x.id === b.id).item_completed_at = '2026-01-01T00:00:00.000Z';
  writeFileSync(f.file('backlog_manifest.json'), JSON.stringify(live));
  assert.deepEqual(f.cli('list', 'done').map(x => x.id), [b.id, a.id]);
  f.cli('archive', 'done'); const archive = f.json('backlog_archive.json');
  archive.find(x => x.id === a.id).item_archived_at = '2026-02-01T00:00:00.000Z';
  archive.find(x => x.id === b.id).item_archived_at = '2026-01-01T00:00:00.000Z';
  writeFileSync(f.file('backlog_archive.json'), JSON.stringify(archive));
  assert.deepEqual(f.cli('list', 'archive').map(x => x.id), [a.id, b.id]);
  assert.deepEqual(f.cli('list', 'archived'), f.cli('list', 'archive'));
  f.fail(['set', a.id, 'state', 'open']); assert.equal(f.cli('archive', a.id).id, a.id);
});
test('branch writes are isolated; list, move and import have explicit cross-branch roles', t => {
  const f = fixture(t); f.cli('init'); const a = f.create('Main'); f.git('switch', '-c', 'feature'); const b = f.create('Feature');
  assert.deepEqual(f.cli('list').map(x => x.id), [b.id]); assert.equal(f.cli('list', '--branch', 'main')[0].id, a.id);
  f.fail(['set', a.id, 'name', 'Forbidden']); f.fail(['archive', 'done', '--branch', 'main']); f.fail(['set', '0', 'branch', 'main']);
  f.cli('move', b.id, 'main'); assert.deepEqual(f.cli('list'), []);
  const imported = f.cli('import', '--branch', 'main'); assert.equal(imported.length, 2);
  assert.deepEqual(f.cli('list').map(x => x.name), ['Main', 'Feature']);
  assert.equal(f.cli('list', 'branch')[0].branch, 'feature');
});
test('import higher keeps source ordering, moves done and leaves archive behind', t => {
  const f = fixture(t); f.cli('init'); const a = f.create('Main'); f.git('switch', '-c', 'source');
  const b = f.create('B'), c = f.create('C'), d = f.create('Done'), e = f.create('Archived');
  f.cli('done', d.id); f.cli('archive', e.id); f.git('switch', 'main');
  f.cli('branch', 'import', 'source', '--higher');
  assert.deepEqual(f.cli('list').map(x => x.id), [b.id, c.id, a.id]);
  assert.equal(f.cli('list', 'done')[0].id, d.id); assert.equal(f.cli('list', 'archive', '--branch', 'source')[0].id, e.id);
});
test('branch fallback works in detached HEAD but an alternate flag does not bypass a named branch', t => {
  const f = fixture(t); f.git('commit', '--allow-empty', '-m', 'root'); f.cli('init'); f.git('checkout', '--detach');
  assert.match(f.fail([], 1).message, /BACKLOG_CLI_BRANCH/);
  assert.equal(f.cli('list', '--branch', 'chosen').length, 0);
  const p = f.raw(['new', 'Fallback', '--description', 'd', '--ac', 'a', '--json'], { env: { ...f.env, BACKLOG_CLI_BRANCH: 'fallback' } });
  assert.equal(p.status, 0, p.stdout); assert.equal(JSON.parse(p.stdout).data.branch, 'fallback');
  f.git('switch', 'main'); f.fail(['new', 'X', '--description', 'd', '--ac', 'a', '--branch', 'other']);
});
test('reads and unchanged writes preserve files and timestamps', t => {
  const f = fixture(t); f.cli('init'); const a = f.create('A'); const before = readFileSync(f.file('backlog_manifest.json'), 'utf8');
  f.cli('list'); f.cli('set', a.id, 'name', 'A'); f.cli('set', a.id, 'state', 'new');
  assert.equal(readFileSync(f.file('backlog_manifest.json'), 'utf8'), before);
});
test('backup preserves live data and existing snapshots; clean resets every branch', t => {
  const f = fixture(t); f.cli('init'); const a = f.create('A'); writeFileSync(f.file('notes.txt'), 'personal');
  const first = f.cli('init', 'backup'); assert.ok(existsSync(join(first.backup, 'backlog_manifest.json')));
  assert.equal(f.cli('list')[0].id, a.id); const second = f.cli('init', 'backup'); assert.notEqual(first.backup, second.backup);
  assert.equal(readFileSync(f.file('notes.txt'), 'utf8'), 'personal');
  f.cli('init', 'clean'); assert.deepEqual(f.cli('list'), []); assert.equal(existsSync(first.backup), false);
});
test('malformed and duplicate data cannot be silently reset or modified', t => {
  const f = fixture(t); f.cli('init'); const a = f.create('A');
  writeFileSync(f.file('backlog_manifest.json'), JSON.stringify([a, a])); f.fail(['list'], 1);
  writeFileSync(f.file('backlog_manifest.json'), '<<<<<<< conflict'); f.fail(['new', 'X', '--description', 'd', '--ac', 'a'], 1);
  assert.equal(readFileSync(f.file('backlog_manifest.json'), 'utf8'), '<<<<<<< conflict');
});
test('unsafe symlink destinations fail without modifying their target', t => {
  const f = fixture(t); symlinkSync(f.dir, join(f.root, '.backlog'), process.platform === 'win32' ? 'junction' : 'dir'); f.fail(['init', 'clean'], 1);
  assert.ok(existsSync(join(f.dir, 'config')));
});
test('parallel writers preserve every GUID and normalize priorities', async t => {
  const f = fixture(t); f.cli('init');
  const items = [];
  for (let round = 0; round < 3; round++) {
    items.push(...await Promise.all(Array.from({ length: 12 }, (_, i) => f.asyncCli(['new', `Item ${round}-${i}`, '--description', 'd', '--ac', 'a']))));
    const stored = f.cli('list');
    assert.equal(new Set(items.map(x => x.id)).size, items.length);
    assert.deepEqual(new Set(stored.map(x => x.id)), new Set(items.map(x => x.id)));
    assert.deepEqual(stored.map(x => x.priority), Array.from({ length: items.length }, (_, i) => i));
  }
});
test('ask without a terminal fails; invalid input does not change data', t => {
  const f = fixture(t); f.cli('init'); f.fail(['new', '--ask']);
  f.fail(['new', 'Bad', '--description', 'd', '--ac', 'a', '--state', 'archived']);
  f.fail(['new', 'Bad', '--description', 'd', '--ac', 'a', '--priority', '-1']);
  f.fail(['new', 'Bad', '--wat']); assert.deepEqual(f.cli('list'), []);
});
test('an interrupted archive transaction recovers exactly once', t => {
  const f = fixture(t); f.cli('init'); const item = f.create('Recover');
  const store = { config: f.json('config.json'), manifest: [], archive: [{ ...item, state: 'archived', priority: null, item_archived_at: '2026-10-16T12:00:00.000Z' }] };
  writeFileSync(f.file('.transaction.json'), JSON.stringify({ version: 1, store }));
  writeFileSync(f.file('backlog_manifest.json'), '[]');
  assert.equal(f.cli('list', 'archive')[0].id, item.id); assert.deepEqual(f.cli('list'), []);
  assert.equal(existsSync(f.file('.transaction.json')), false); assert.equal(f.json('backlog_archive.json').length, 1);
});
test('init clean needs no branch in detached HEAD and resets every branch', t => {
  const f = fixture(t); f.cli('init'); f.create('Reset'); f.git('checkout', '--detach');
  assert.equal(f.cli('init', 'clean').mode, 'clean');
  assert.deepEqual(f.json('backlog_manifest.json'), []);
});
test('JSON creation accepts done with explicit null priority and immutable timestamps', t => {
  const f = fixture(t); f.cli('init');
  const item = f.cli('new', 'Done', JSON.stringify({ description: 'd', ac: 'a', state: 'done', priority: null }));
  assert.equal(item.priority, null); assert.ok(item.item_completed_at);
  assert.equal(f.cli('list', 'done')[0].id, item.id);
});
test('unborn named branches are valid and output escapes control sequences', t => {
  const f = fixture(t); f.git('switch', '--orphan', 'unborn'); f.cli('init');
  f.create('Escape\u001b[31m'); assert.equal(f.cli('list')[0].branch, 'unborn');
  assert.equal(f.raw(['list']).stdout.includes('\u001b'), false);
});
test('scheduled update failure stays on stderr and a cooldown leaves JSON and history untouched', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t); f.cli('init'); const npmDir = join(f.dir, 'fake-npm'); mkdirSync(npmDir);
  writeFileSync(join(npmDir, 'npm'), '#!/usr/bin/env node\nif (process.argv[2] === "config") console.log("undefined"); else process.exit(23);\n', { mode: 0o755 });
  const configPath = join(f.env.XDG_CONFIG_HOME, 'smooth-backlog-cli/config.json'); writeFileSync(configPath, JSON.stringify({ schema_version: 1, weekly: true, auto: false }));
  const env = { ...f.env, PATH: npmDir + ':' + f.env.PATH };
  const first = f.raw(['list', '--json'], { env }); assert.equal(first.status, 0, first.stdout); assert.deepEqual(JSON.parse(first.stdout), { ok: true, data: [] });
  assert.match(first.stderr, /npm config set @smoothsdlc:registry/); const before = readFileSync(configPath, 'utf8');
  const second = f.raw(['list', '--json'], { env }); assert.equal(second.stderr, ''); assert.equal(readFileSync(configPath, 'utf8'), before);
});
test('import source selection does not override the destination branch supplied by environment in detached HEAD', t => {
  const f = fixture(t); f.cli('init'); const item = f.create('Source'); f.git('checkout', '--detach');
  const p = f.raw(['import', '--branch', 'main', '--json'], { env: { ...f.env, BACKLOG_CLI_BRANCH: 'destination' } });
  assert.equal(p.status, 0, p.stdout); assert.equal(JSON.parse(p.stdout).data[0].id, item.id); assert.equal(JSON.parse(p.stdout).data[0].branch, 'destination');
});

test('renamed project writes the new owner marker and reads pre-rename backlog data', t => {
  const f = fixture(t); f.cli('init'); const item = f.create('Existing work');
  const config = f.json('config.json'); assert.equal(config.owner, 'smooth-backlog-cli');
  config.owner = config.owner.replace(/^smooth-/, '');
  writeFileSync(f.file('config.json'), JSON.stringify(config));
  assert.equal(f.cli().id, item.id);
  assert.equal(f.cli(item.id, 'done').id, item.id);
  f.cli('init', 'backup'); assert.equal(f.cli('list', 'done')[0].id, item.id);
});
test('renamed repository lock retains coordination with pre-rename writers', async t => {
  const f = fixture(t); f.cli('init');
  const { repositoryLocked } = await import('../../src/storage.js');
  assert.equal(typeof repositoryLocked, 'function');
  let blocked;
  await repositoryLocked(f.root, async () => {
    const filename = '.smooth-backlog-cli.lock';
    assert.ok(existsSync(join(f.root, filename)));
    assert.ok(existsSync(join(f.root, filename.replace('smooth-', ''))));
    blocked = f.asyncCli(['new', 'Wait for lock', '--description', 'd', '--ac', 'a']);
    let completed = false; blocked.then(() => { completed = true; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(completed, false);
  });
  assert.equal((await blocked).name, 'Wait for lock');
});
