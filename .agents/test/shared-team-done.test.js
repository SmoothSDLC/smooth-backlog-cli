// Tests for `backlog update --status done` on reviewed and old items - cli-parity job 15 (TEAM): a reviewed item
// finishes through --close only.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, itemPath, sharedBacklog, readItem, writeItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
 // test_team_compat.OLD

// One shared home with acme/demo and one item made by `new`.
function fixture(name, extra) {
  const t = mkdtempSync(join(tmpdir(), 'team-done-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const args = ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--complexity', 'low',
    '--body', '## Definition of done\n\n- [ ] the test\'s check holds', ...extra];
  const r = cli(['new', ...args], { cwd: cons, tmp: t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = r.stdout.split('created phase ')[1].split(' ')[0];
  return { t, home, cons, slug, file: itemPath(join(home, 'acme', 'demo'), slug) };
}
const update = (f, args) => cli(['update', ...args], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
const status = f => readItem(f.file).fm.status;

const TEAM = { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main' };
test('--status closed on an old teamless item without review_refs closes it without a review', () => {
  const f = fixture('old item without review_refs', []);
  const { fm, body } = readItem(f.file); // as an old item looks: none of the team keys (depends_on is not one)
  for (const k of ['work_class', 'review_classes', 'claimed_by', 'claimed_at', 'review_state', 'reviewer']) delete fm[k];
  writeItem(f.file, fm, body);
  const r = update(f, [f.slug, '--status', 'closed']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(status(f), 'closed');
});
