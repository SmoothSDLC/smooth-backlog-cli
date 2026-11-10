// The built-in definition of an item without a team: one order shared by the item file codec, the defaults, and the output of backlog fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENVELOPE, FIELDS, BUILT_IN_ORDER } from '../../src/shared/item-definition.js';
import { toItemJson } from '../../src/shared/item-json.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog, archivedPath, changeItem, itemPath, readItem, createdSlug } from './shared-fixtures.js';

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
