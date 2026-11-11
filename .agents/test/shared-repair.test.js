// An item that cannot be read: the refusal names the key, `update --<key> <value>` sets a wrongly typed key of a valid JSON file again, `update --restore` brings back the earlier version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cli, consumer, itemName, itemPath, itemText, sharedBacklog, readItem, GIT_IDENTITY, damageItem, isDamagedItem, writeDamagedItem } from './shared-fixtures.js';
import { parseItem as parse } from '../../src/shared/item-file.js';
import { setField } from '../../src/shared/repair.js';
import * as store from '../../src/shared/store.js';

function folder(t, files) {
  const home = mkdtempSync(join(tmpdir(), 'repair-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, 'acme', 'demo');
  mkdirSync(join(dir, 'phases'), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'phases', name), text);
  return dir;
}
const item = (over = {}) => itemText({ phase: '001-a', seq: 1, name: 'A', repository: 'acme/demo', branch: 'main', updated: '2026-10-01T00:00:00Z', status: 'pending', ...over }, 'Body.\n');
const asDoc = (text, edit) => { const doc = JSON.parse(text); edit(doc); return JSON.stringify(doc, null, 2); };

test('the codec names the key it cannot read; a file that is not JSON names none', () => {
  assert.throws(() => parse(asDoc(item(), d => { d.name = ['cut']; })), e => e.field === 'name');
  assert.throws(() => parse(asDoc(item(), d => { d.seq = 'x'; })), e => e.field === 'seq');
  assert.throws(() => parse('not json'), e => e.field === undefined);
  assert.throws(() => parse('[]'), e => e.field === undefined);
});

test('load refuses an unreadable item with its name and key, never a path, and offers the two ways out', t => {
  const dir = folder(t, { [itemName('001-a')]: asDoc(item(), d => { d.name = ['cut']; }) });
  const bad = store.unreadable(dir);
  assert.equal(bad.exitCode, 2);
  assert.match(bad.message, /^item 001-a: the key name cannot be read \(is missing or not text\)\. Fix it with backlog update 001-a --name <value>, or restore the item's previous version with backlog update 001-a --restore$/);
  assert.doesNotMatch(bad.message, /phases|\//);
  assert.throws(() => store.load(dir), e => e.message === bad.message);
});

test('a key update cannot repair is not offered; a file that is not JSON offers the restore only', t => {
  const slug = folder(t, { [itemName('001-a')]: asDoc(item(), d => { d.slug = 7; }) });
  assert.match(store.unreadable(slug).message, /^item 001-a: the key slug cannot be read \(.*\)\. Restore the item's previous version with backlog update 001-a --restore$/);
  const fields = folder(t, { [itemName('001-a')]: asDoc(item(), d => { d.fields = []; }) });
  assert.match(store.unreadable(fields).message, /^item 001-a: the key fields cannot be read \(.*\)\. Restore the item's previous version with backlog update 001-a --restore$/);
  const header = folder(t, { [itemName('001-a')]: 'not json' });
  assert.match(store.unreadable(header).message, /^item 001-a: the file is not valid JSON \(.*\)\. Restore the item's previous version with backlog update 001-a --restore$/);
  assert.equal(store.unreadable(folder(t, { [itemName('001-a')]: item() })), null);
});

test('setField sets an envelope key at the top and any other key under fields, keeps the rest, and the file stays the codec text', () => {
  const set = setField(item(), 'name', 'B');
  assert.equal(set, item({ name: 'B' }));
  assert.equal(setField(item(), 'status', 'done'), item({ status: 'done' }));
  assert.equal(setField(item(), 'location', 'here'), item({ location: 'here' }));
  assert.deepEqual(parse(setField(item({ depends_on: [2, 3] }), 'name', 'B')).fm.depends_on, [2, 3]);
  assert.equal(setField(asDoc(item(), d => { d.name = ['cut']; }), 'name', 'B'), item({ name: 'B' }), 'a broken key is set again');
});

// ---- --restore (a repository with a history)
const world = t => {
  const dir = mkdtempSync(join(tmpdir(), 'repair-restore-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = sharedBacklog(dir); const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: home, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  const run = (...args) => cli(args, { cwd: cons, tmp: dir });
  const file = itemPath(join(home, 'acme', 'demo'), '001-alpha-job');
  const publish = m => { git('add', '-A'); git('commit', '-q', '-m', m); git('push', '-q'); };
  return { dir, home, git, run, file, publish };
};
const NEW = ['new', '--name', 'alpha job', '--depends-on', 'none'];

test('restore: the previous committed version comes back, with a restored event, published', t => {
  const w = world(t);
  assert.equal(w.run(...NEW).status, 0);
  assert.equal(w.run('update', '1', '--summary', 'good one').status, 0);
  damageItem(w.file, 'name');
  w.publish('damaged');
  const r = w.run('update', '1', '--restore');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const doc = readItem(w.file);
  assert.equal(doc.fm.summary, 'good one');
  assert.equal(doc.fm.events.at(-1).step, 'repair');
  assert.match(doc.fm.events.at(-1).note, /^restored 001-alpha-job to its version of [0-9a-f]{7}$/);
  assert.equal(w.git('status', '--porcelain'), '');
  assert.equal(w.git('rev-parse', 'HEAD'), w.git('rev-parse', 'origin/main'));
});

test('restore: an unreadable item that was committed unreadable has no earlier version; a second broken key is named in the same refusal', t => {
  const w = world(t);
  mkdirSync(dirname(w.file), { recursive: true });
  writeDamagedItem(w.file, { phase: '001-alpha-job', seq: 1, name: 'also', status: 'cut', repository: 'acme/demo', branch: 'main' }, ['seq', 'name'], 'Body.\n');
  w.publish('born damaged');
  const none = w.run('update', '1', '--restore');
  assert.equal(none.status, 1, none.stdout + none.stderr);
  assert.match(none.stdout, /the item has no earlier version/);
  const half = w.run('update', '1', '--status', 'pending');
  assert.equal(half.status, 2, half.stdout + half.stderr);
  assert.match(half.stderr, /item 001-alpha-job: the key seq cannot be read/);
  assert.ok(isDamagedItem(w.file, 'name'), 'a command that leaves another key unreadable changes nothing');
  const named = w.run('update', '001-alpha-job', '--name', 'alpha job');
  assert.equal(named.status, 2, named.stdout + named.stderr);
  assert.match(named.stderr, /item 001-alpha-job: the key seq cannot be read/, 'a command that sets one key names the other unreadable key');
  assert.ok(isDamagedItem(w.file, 'name'), 'and changes nothing');
});

test('--seq with the number of the item\'s own file name repairs an unreadable seq, with --name in one command, and exits 0', t => {
  const w = world(t);
  assert.equal(w.run(...NEW).status, 0);
  damageItem(w.file, 'name'); damageItem(w.file, 'seq');
  w.publish('damaged');
  const r = w.run('update', '001-alpha-job', '--name', 'alpha job', '--seq', '1');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { fm } = readItem(w.file);
  assert.deepEqual([fm.name, fm.seq], ['alpha job', 1]);
  assert.equal(w.run('show', '1').status, 0);
});

test('--seq on a healthy item with its own number is still refused', t => {
  const w = world(t);
  assert.equal(w.run(...NEW).status, 0);
  assert.equal(w.run('update', '1', '--seq', '1').status, 1);
});

// Only name and seq can be unreadable and repaired (the other repairable keys live under fields, which hold any value). The number is decided
// before anything is written: the number of the item's own file name restores it, any other must be above the mark.
test('--seq far above the mark repairs an unreadable seq with --name in one command', t => {
  const w = world(t);
  assert.equal(w.run(...NEW).status, 0);
  damageItem(w.file, 'name'); damageItem(w.file, 'seq');
  w.publish('damaged');
  const r = w.run('update', '001-alpha-job', '--name', 'alpha job', '--seq', '50');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { fm } = readItem(w.file);
  assert.deepEqual([fm.name, fm.seq], ['alpha job', 50]);
  assert.equal(w.run('show', '50').status, 0);
});

for (const n of [2]) { // the folder holds items 1 and 2, so the mark is 2
  test(`--seq ${n} at or below the mark is refused and the damaged file is left as it was`, t => {
    const w = world(t);
    assert.equal(w.run(...NEW).status, 0);
    assert.equal(w.run('new', '--name', 'beta job', '--depends-on', 'none').status, 0);
    damageItem(w.file, 'name'); damageItem(w.file, 'seq');
    w.publish('damaged');
    const before = readFileSync(w.file, 'utf8');
    const r = w.run('update', '001-alpha-job', '--name', 'alpha job', '--seq', String(n));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(r.stdout + r.stderr, `❌ --seq ${n} is not above the highest number ever used in acme/demo (2); numbers are never reused\n`);
    assert.equal(readFileSync(w.file, 'utf8'), before, 'nothing was written');
    assert.equal(w.git('status', '--porcelain'), '');
  });
}

test('restore takes no other option; an item that is not the unreadable one is refused like every command', t => {
  const w = world(t);
  assert.equal(w.run(...NEW).status, 0);
  assert.equal(w.run('new', '--name', 'beta job', '--depends-on', 'none').status, 0);
  damageItem(w.file, 'name');
  w.publish('damaged');
  const both = w.run('update', '1', '--restore', '--summary', 'x');
  assert.equal(both.status, 1, both.stdout + both.stderr);
  assert.match(both.stdout, /--restore takes no other option/);
  const other = w.run('update', '2', '--summary', 'x');
  assert.equal(other.status, 2, other.stdout + other.stderr);
  assert.match(other.stderr, /item 001-alpha-job: the key name cannot be read/);
});
