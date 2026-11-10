// An item that cannot be read: the refusal names the field, `update --<field> <value>` sets it again in the raw text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cli, consumer, itemName, itemPath, sharedBacklog, readItem, GIT_IDENTITY } from './shared-fixtures.js';
import { parseItem as parse } from '../../src/shared/frontmatter.js';
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
const item = (extra = '') => `---\nphase: 001-a\nseq: 1\nname: A\n${extra}status: pending\n---\nBody.\n`;

test('the codec names the field it cannot read; a broken line before any key names none', () => {
  assert.throws(() => parse('---\nstatus: "pend\n---\n'), e => e.field === 'status');
  assert.throws(() => parse('---\nseq: 1\nname: "x" y\n---\n'), e => e.field === 'name');
  assert.throws(() => parse('---\nnot a pair\n---\n'), e => e.field === undefined);
});

test('load refuses an unreadable item with its name and field, never a path, and offers the two ways out', t => {
  const dir = folder(t, { [itemName('001-a')]: '---\nphase: 001-a\nstatus: "pend\n---\n' });
  const bad = store.unreadable(dir);
  assert.equal(bad.exitCode, 2);
  assert.match(bad.message, /^item 001-a: the field status cannot be read \(.*not closed\)\. Fix it with backlog update 001-a --status <value>, or restore the item's previous version with backlog update 001-a --restore$/);
  assert.doesNotMatch(bad.message, /phases|\//);
  assert.throws(() => store.load(dir), e => e.message === bad.message);
});

test('a field update cannot repair is not offered; an item with no readable header offers the restore only', t => {
  const events = folder(t, { [itemName('001-a')]: '---\nphase: 001-a\nevents:\n- "x\n---\n' });
  assert.match(store.unreadable(events).message, /^item 001-a: the field events cannot be read \(.*\)\. Restore the item's previous version with backlog update 001-a --restore$/);
  const header = folder(t, { [itemName('001-a')]: '---\nnot a pair\n---\n' });
  assert.match(store.unreadable(header).message, /^item 001-a: the item has no readable header \(.*\)\. Restore the item's previous version with backlog update 001-a --restore$/);
  assert.equal(store.unreadable(folder(t, { [itemName('001-a')]: item() })), null);
});

test('setField replaces the key line and the lines that continue it, keeps the rest byte for byte, and adds a missing key', () => {
  assert.equal(setField(item('summary: "a long\n  folded value"\n'), 'summary', 'short'), item('summary: "short"\n'));
  assert.equal(setField(item(), 'status', 'done'), item().replace('status: pending', 'status: "done"'));
  assert.equal(setField(item(), 'location', 'here'), item('').replace('status: pending\n', 'status: pending\nlocation: "here"\n'));
  const crlf = '﻿' + item().replace(/\n/g, '\r\n');
  assert.equal(setField(crlf, 'seq', 7), crlf.replace('seq: 1', 'seq: 7'));
  assert.deepEqual(parse(setField(item('depends_on:\n- 2\n- 3\n'), 'name', 'B')).fm.depends_on, [2, 3]);
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
  writeFileSync(w.file, readFileSync(w.file, 'utf8').replace(/^summary: .*$/m, 'summary: "cut'));
  w.publish('damaged');
  const r = w.run('update', '1', '--restore');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const doc = readItem(w.file);
  assert.equal(doc.fm.summary, 'good one');
  assert.match(doc.fm.events.at(-1), / restored .*restored 001-alpha-job to its version of [0-9a-f]{7}/);
  assert.equal(w.git('status', '--porcelain'), '');
  assert.equal(w.git('rev-parse', 'HEAD'), w.git('rev-parse', 'origin/main'));
});

test('restore: an unreadable item that was committed unreadable has no earlier version; a second broken field is named in the same refusal', t => {
  const w = world(t);
  mkdirSync(dirname(w.file), { recursive: true });
  writeFileSync(w.file, '---\nphase: 001-alpha-job\nseq: 1\nname: "also\nstatus: "cut\nrepository: acme/demo\nbranch: main\n---\nBody.\n');
  w.publish('born damaged');
  const none = w.run('update', '1', '--restore');
  assert.equal(none.status, 1, none.stdout + none.stderr);
  assert.match(none.stdout, /the item has no earlier version/);
  const half = w.run('update', '1', '--status', 'pending');
  assert.equal(half.status, 2, half.stdout + half.stderr);
  assert.match(half.stderr, /item 001-alpha-job: the field name cannot be read/);
  assert.match(readFileSync(w.file, 'utf8'), /^status: "cut/m, 'a command that leaves another field unreadable changes nothing');
  assert.equal(w.run('update', '1', '--status', 'pending', '--name', 'alpha job').status, 0);
  assert.equal(readItem(w.file).fm.name, 'alpha job');
});

test('restore takes no other option; an item that is not the unreadable one is refused like every command', t => {
  const w = world(t);
  assert.equal(w.run(...NEW).status, 0);
  assert.equal(w.run('new', '--name', 'beta job', '--depends-on', 'none').status, 0);
  writeFileSync(w.file, readFileSync(w.file, 'utf8').replace(/^status: .*$/m, 'status: "cut'));
  w.publish('damaged');
  const both = w.run('update', '1', '--restore', '--summary', 'x');
  assert.equal(both.status, 1, both.stdout + both.stderr);
  assert.match(both.stdout, /--restore takes no other option/);
  const other = w.run('update', '2', '--summary', 'x');
  assert.equal(other.status, 2, other.stdout + other.stderr);
  assert.match(other.stderr, /item 001-alpha-job: the field status cannot be read/);
});
