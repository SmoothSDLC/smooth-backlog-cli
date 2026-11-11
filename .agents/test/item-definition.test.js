// The built-in definition of an item without a team: one order shared by the item file codec, the defaults, and the output of backlog fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENVELOPE, FIELDS, BUILT_IN_ORDER, FINAL } from '../../src/shared/item-definition.js';
import { isFinished, isOpen } from '../../src/shared/status.js';
import { toItemJson } from '../../src/shared/item-json.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog, archivedPath, changeItem, itemPath, readItem, createdSlug, writeItem } from './shared-fixtures.js';

test('the item file writes the fields in the order of the definition', () => {
  const fm = { phase: '001-a', seq: 1, name: 'a', repository: 'r', branch: 'b', updated: 'u', zz_extra: 1 };
  for (const k of [...BUILT_IN_ORDER].reverse()) fm[k] = 1;
  const keys = [...toItemJson(fm, '').matchAll(/^ {4}"([^"]+)":/gm)].map(m => m[1]);
  assert.deepEqual(keys, [...BUILT_IN_ORDER, 'zz_extra']);
});

test('the definition holds the holder as owner and owned_since, no separate creator, and the defaults', () => {
  assert.deepEqual(BUILT_IN_ORDER.filter(k => /own|claim/.test(k)), ['owner', 'owned_since']);
  const row = k => FIELDS.find(f => f[0] === k);
  assert.equal(row('status')[3], 'pending');
  assert.deepEqual(row('severity').slice(2, 4), [['normal', 'critical'], 'normal']);
  assert.deepEqual(ENVELOPE.map(e => e[0]), ['seq', 'slug', 'name', 'repository', 'branch', 'created', 'updated', 'updated_by']);
});

test('backlog fields and --json print the definition', () => {
  const rows = [...ENVELOPE, ...FIELDS].map(f => f[0]);
  assert.deepEqual(cli(['fields'], {}).stdout.trimEnd().split('\n').slice(1).map(l => l.split(' ')[0]), rows);
  const json = JSON.parse(cli(['fields', '--json'], {}).stdout);
  assert.deepEqual(json.map(x => x.key), rows);
  assert.equal(json.find(x => x.key === 'severity').type, 'text: normal, critical');
});

// Archive writes no status word: an item is archived because its file lies in archive/.
test('archive keeps the status; list, update and archive read "archived" from the path, also for an item archived by an earlier version', () => {
  const t = mkdtempSync(join(tmpdir(), 'item-archive-path-'));
  try {
    const home = sharedBacklog(t); const cons = consumer(t, 'acme', 'demo', 'main'); const folder = join(home, 'acme', 'demo');
    const run = (args) => cli(args, { cwd: cons, tmp: t, plain: true });
    const ok = args => { const r = run(args); assert.equal(r.status, 0, args.join(' ') + r.stdout + r.stderr); return r; };
    const make = name => createdSlug(ok(['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none']).stdout);
    const slug = make('one'); const old = make('two'); const live = make('three');
    ok(['done', slug]); ok(['archive', slug]);
    assert.equal(readItem(archivedPath(folder, slug, 'phases')).fm.status, 'closed'); // no status word written
    const slugs = args => JSON.parse(ok(args).stdout).phases.map(r => r.slug);
    assert.deepEqual(slugs(['list', 'archive', '--json']), [slug]);
    assert.equal(JSON.parse(ok(['list', 'archive', '--json']).stdout).phases[0].status, 'archived');
    assert.ok(!slugs(['list', 'done', '--json']).includes(slug) && !slugs(['list', 'open', '--json']).includes(slug));
    assert.equal(JSON.parse(ok(['show', slug, '--json']).stdout).status, 'archived');
    assert.match(run(['update', slug, '--name', 'x']).stdout, /archived and cannot be edited/);
    assert.match(ok(['archive', slug]).stdout, /already archived/);
    // an item archived before this change holds the status archived in archive/
    ok(['done', old]); ok(['archive', old]);
    changeItem(archivedPath(folder, old, 'phases'), { fm: { status: 'archived' } });
    assert.deepEqual(slugs(['list', 'archive', '--json']).sort(), [slug, old].sort());
    assert.match(ok(['archive', old]).stdout, /already archived/);
    assert.ok(slugs(['list', 'open', '--json']).includes(live) && readItem(itemPath(folder, live)).fm.status === 'pending');
  } finally { rmSync(t, { recursive: true, force: true }); }
});

// backlog new writes the built-in fields only; a status is stored as typed; fields the definition does not declare are kept and shown.
test('new writes no review_state or reviewer, --split-from writes parent, done stores closed, a status word stays as typed, an undeclared field is kept and listed', () => {
  const t = mkdtempSync(join(tmpdir(), 'item-new-done-'));
  try {
    const home = sharedBacklog(t); const cons = consumer(t, 'acme', 'demo', 'main'); const folder = join(home, 'acme', 'demo');
    const run = args => cli(args, { cwd: cons, tmp: t, plain: true });
    const ok = args => { const r = run(args); assert.equal(r.status, 0, args.join(' ') + r.stdout + r.stderr); return r; };
    const make = (name, ...more) => createdSlug(ok(['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', ...more]).stdout);
    const one = make('one'); const two = make('two', '--split-from', '1'); const three = make('three', '--status', 'In_Progress');
    const fmOf = slug => readItem(itemPath(folder, slug)).fm;
    for (const k of ['review_state', 'reviewer']) assert.ok(!(k in fmOf(one)), k);
    assert.ok(!('parent' in fmOf(one)));
    assert.equal(fmOf(two).parent, 1);
    assert.match(readItem(itemPath(folder, two)).body, /Split from `001-one`/);
    assert.equal(fmOf(three).status, 'In_Progress'); // as typed
    assert.match(run(['new', '--name', 'x', '--force']).stderr, /unrecognized arguments: --force/);
    ok(['update', '3', '--status', 'done']);
    assert.equal(fmOf(three).status, 'done'); // as typed, and a finished word that stamps completed
    assert.ok(fmOf(three).completed);
    assert.ok(!fmOf(two).completed && !fmOf(one).completed); // an open word does not
    ok(['update', '2', '--status', 'blocked']); assert.ok(!fmOf(two).completed);
    assert.deepEqual(JSON.parse(ok(['list', 'done', '--json']).stdout).phases.map(r => r.slug), [three]);
    const shownStatus = n => JSON.parse(ok(['show', String(n), '--json']).stdout).status;
    assert.equal(shownStatus(3), 'done'); // shown as stored: done is not read as closed
    ok(['update', '2', '--status', 'in_progress']); assert.equal(shownStatus(2), 'in_progress'); // nor in_progress as in progress
    ok(['update', '2', '--status', 'pending']);
    const fin = createdSlug(ok(['new', '--name', 'born done', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--status', 'done']).stdout);
    assert.ok(fmOf(fin).completed); // started finished: completed when created
    ok(['archive', fin]); // done is a finished word: archive needs no --force
    ok(['update', '2', '--status', 'Done']);
    assert.ok(JSON.parse(ok(['list', 'open', '--json']).stdout).phases.some(r => r.slug === two), 'the finished words are exact: Done is an open word');
    ok(['update', '2', '--status', 'pending']);
    ok(['done', '1']);
    assert.equal(fmOf(one).status, 'closed'); assert.ok(fmOf(one).completed);
    const rowsOf = () => Object.fromEntries(JSON.parse(ok(['list', '--json']).stdout).phases.map(r => [r.slug, r.review_state]));
    assert.equal(rowsOf()[two], ''); // none stored: empty
    changeItem(itemPath(folder, two), { fm: { review_state: 'passed', reviewer: 'rex' } }); // an item of an earlier build
    assert.equal(rowsOf()[two], 'passed');
    const shown = JSON.parse(ok(['show', '2', '--json']).stdout).front_matter;
    assert.equal(shown.review_state, 'passed'); assert.equal(shown.reviewer, 'rex');
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('an item without a team reads its status as stored in the list and in show', () => {
  const t = mkdtempSync(join(tmpdir(), 'item-stored-status-'));
  try {
    const home = sharedBacklog(t); const cons = consumer(t, 'acme', 'demo', 'main'); const folder = join(home, 'acme', 'demo');
    writeItem(itemPath(folder, '001-stored'), { name: '', repository: 'acme/demo', branch: 'main', updated: '2026-10-01T00:00:00Z', seq: 1, status: 'done' }, 'x\n');
    const ok = args => { const r = cli(args, { cwd: cons, tmp: t }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
    assert.deepEqual(ok(['list', 'done', '--json']).phases.map(p => [p.seq, p.status]), [[1, 'done']]);
    assert.equal(ok(['show', '001-stored', '--json']).status, 'done');
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('the finished words are the definition\'s FINAL list and status.js reads it', () => {
  assert.deepEqual(FINAL, ['closed', 'done', 'archived']);
  for (const w of FINAL) { assert.equal(isFinished(w), true, w); assert.equal(isOpen(w), false, w); }
  for (const w of ['pending', 'accepted', 'in progress']) { assert.equal(isFinished(w), false, w); assert.equal(isOpen(w), true, w); }
});
