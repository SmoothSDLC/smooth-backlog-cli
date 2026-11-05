// An item that cannot be read: the refusal names the field, `update --<field> <value>` sets it again in the raw text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
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
  const dir = folder(t, { '001-a.md': '---\nphase: 001-a\nstatus: "pend\n---\n' });
  const bad = store.unreadable(dir);
  assert.equal(bad.exitCode, 2);
  assert.match(bad.message, /^item 001-a: the field status cannot be read \(.*not closed\)\. Fix it with backlog update 001-a --status <value>, or restore the item's previous version with backlog update 001-a --restore$/);
  assert.doesNotMatch(bad.message, /phases|\//);
  assert.throws(() => store.load(dir), e => e.message === bad.message);
});

test('a field update cannot repair is not offered; an item with no readable header offers the restore only', t => {
  const events = folder(t, { '001-a.md': '---\nphase: 001-a\nevents:\n- "x\n---\n' });
  assert.match(store.unreadable(events).message, /^item 001-a: the field events cannot be read \(.*\)\. Restore the item's previous version with backlog update 001-a --restore$/);
  const header = folder(t, { '001-a.md': '---\nnot a pair\n---\n' });
  assert.match(store.unreadable(header).message, /^item 001-a: the item has no readable header \(.*\)\. Restore the item's previous version with backlog update 001-a --restore$/);
  assert.equal(store.unreadable(folder(t, { '001-a.md': item() })), null);
});

test('setField replaces the key line and the lines that continue it, keeps the rest byte for byte, and adds a missing key', () => {
  assert.equal(setField(item('summary: "a long\n  folded value"\n'), 'summary', 'short'), item('summary: "short"\n'));
  assert.equal(setField(item(), 'status', 'done'), item().replace('status: pending', 'status: "done"'));
  assert.equal(setField(item(), 'location', 'here'), item('').replace('status: pending\n', 'status: pending\nlocation: "here"\n'));
  const crlf = '﻿' + item().replace(/\n/g, '\r\n');
  assert.equal(setField(crlf, 'seq', 7), crlf.replace('seq: 1', 'seq: 7'));
  assert.deepEqual(parse(setField(item('depends_on:\n- 2\n- 3\n'), 'name', 'B')).fm.depends_on, [2, 3]);
});
