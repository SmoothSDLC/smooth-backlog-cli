// Tests for an item written before team work: it stays visible and works with the user commands.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, itemPath, sharedBacklog, readItem, readStored } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-compat-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const run = (f, command, args) => cli([command, ...args], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
const ok = (f, ...args) => { const r = run(f, 'update', args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const item = (f, slug) => readItem(itemPath(f.folder, slug));

// an item names an estimate and a definition of done.
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
function make(f, name, extra = []) {
  const has = k => extra.includes(k);
  const args = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  const r = run(f, 'new', [...args, '--body', DOD, ...extra]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('created phase ')[1].split(' ')[0];
}

test('test_item_without_team_fields_keeps_working: an item written before team work stays visible', () => {
  const f = fixture();
  const s = make(f, 'written before team work'); // outside a team, --status done finishes it
  const path = itemPath(f.folder, s);
  const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer'];
  const { fm, body } = item(f, s);
  store.write({ path, fm: Object.fromEntries(Object.entries(fm).filter(([k]) => !OLD.includes(k))), body }, f.folder); // as an old item looks

  const status = JSON.parse(run(f, 'list', ['--json']).stdout);
  assert.ok(status.phases.some(p => p.slug === s));
  assert.equal(JSON.parse(run(f, 'show', [s]).stdout).slug, s);
  ok(f, s, '--append', 'a note added the old way');
  ok(f, s, '--status', 'in_progress');
  ok(f, s, '--status', 'pending');
  const stored = readStored(path);
  assert.ok(stored.body.includes('a note added the old way') && !OLD.some(k => Object.hasOwn(stored.fm, k)));
  run(f, 'show', [s, '--agent', 'smooth']); // the actor re-reads
  ok(f, s, '--status', 'done', '--by', 'smooth'); // read and write run as the same explicit actor (the CI runner's USER differs)
});
