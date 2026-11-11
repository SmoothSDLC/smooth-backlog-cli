// The history of an item: one full entry { at, by, session, step, changes, note } per command that changed it, written by store.write,
// and `backlog history` printing it. Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archivedPath, cli, consumer, itemPath, readStored, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function build() {
  const t = mkdtempSync(`${tmpdir()}/history-test-`);
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const run = (args, env = {}) => cli(args, { cwd: cons, tmp: t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'ann', SMOOTH_BACKLOG_CLI_SESSION: '', ...env } });
  const ok = (args, env) => { const r = run(args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
  ok(['new', '--name', 'Alpha', '--objective', 'o', '--summary', 's', '--depends-on', 'none']);
  const file = itemPath(join(home, 'acme', 'demo'), '001-alpha');
  return { run, ok, file, history: () => readStored(file).fm.events };
}

test('a user command writes one whole entry: when, who, session, step, the changed keys before and after, and the note', () => {
  const f = build();
  assert.deepEqual(f.history().map(e => e.step), ['new'], 'the creation is one entry');
  assert.equal(f.history()[0].changes.slug.join(), ',001-alpha', 'a new key reads null before');
  f.ok(['update', '1', '--status', 'in_progress', '--severity', 'critical', '--note', 'going'], { SMOOTH_BACKLOG_CLI_SESSION: 's-7' });
  const e = f.history().at(-1);
  assert.equal(f.history().length, 2, 'one entry for the command, not one per planning sentence');
  assert.match(e.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual({ ...e, at: 0 }, { at: 0, by: 'ann', session: 's-7', step: 'update', changes: { status: ['pending', 'in progress'], severity: ['normal', 'critical'], review_state: ['none', null] }, note: 'going' });
});

test('the session is only SMOOTH_BACKLOG_CLI_SESSION: without it the entry holds none, never the agent name', () => {
  const f = build();
  f.ok(['update', '1', '--summary', 'changed']);
  assert.deepEqual([f.history().at(-1).by, f.history().at(-1).session], ['ann', '']);
});

test('without --note the planning sentence is the note; without either the command writes none', () => {
  const f = build();
  f.ok(['update', '1', '--status', 'done']);
  assert.match(f.history().at(-1).note, /^completed 001-alpha; backlog re-prioritized to 0 item\(s\)$/);
  assert.equal(f.history().filter(e => e.step === 'planning_event').length, 0);
  const n = f.history().length;
  f.ok(['update', '1', '--summary', 'the same']);
  f.ok(['update', '1', '--summary', 'the same']);
  assert.equal(f.history().length, n + 1, 'a write that changes nothing adds no entry');
});

test('updated, updated_by and the history are never listed as changes', () => {
  const f = build();
  f.ok(['update', '1', '--summary', 'x']);
  for (const e of f.history()) for (const k of ['updated', 'updated_by', 'events', 'history']) assert.equal(k in e.changes, false, k);
});

test('backlog history prints the entries: time, step, writer, changes and note; an entry without a writer prints as before', () => {
  const f = build();
  f.ok(['update', '1', '--summary', 'x', '--note', 'why']);
  const lines = f.ok(['history', '1']).stdout.split('\n').filter(Boolean);
  assert.match(lines[0], /^ {2}\d{4}-\d\d-\d\dT\S+ {2}update {9}ann {2}summary: s -> x why$/);
  assert.match(lines[1], /^ {2}\S+ {2}new {12}ann {2}added added 001-alpha at rank end/);
  // an item file of an earlier build: its entries carry no writer, session or changes
  writeFileSync(f.file, JSON.stringify({ ...JSON.parse(readFileSync(f.file, 'utf8')), history: [{ at: '2026-01-01T00:00:00Z', step: 'claimed', note: 'main abc1234567 Claimed by bob' }] }));
  assert.equal(f.ok(['history', '1']).stdout, '  2026-01-01T00:00:00Z  claimed        branch=main commit=abc1234 Claimed by bob\n');
});

test('the step is the command: done, archive and move name themselves', () => {
  const f = build();
  f.ok(['update', '1', '--summary', 'x']);
  f.ok(['done', '1']);
  assert.deepEqual(f.history().map(e => e.step), ['new', 'update', 'done']);
  f.ok(['archive', '1']);
  const arch = readStored(archivedPath(join(f.file, '..', '..'), '001-alpha', 'phases')).fm.events;
  assert.equal(arch.at(-1).step, 'archive');
});

test('backlog history prints a created item as added plus the note, while the entry keeps every key', () => {
  const f = build();
  assert.ok(Object.keys(f.history()[0].changes).length > 5);
  assert.match(f.ok(['history', '1']).stdout, /^ {2}\S+ {2}new {12}ann {2}added added 001-alpha at rank end; backlog re-densified to 1 item\(s\)\n$/);
});
