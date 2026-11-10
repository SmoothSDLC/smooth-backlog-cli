// Item 046: backlog update --severity normal|critical changes an item's severity, commits, pushes and records an event;
// another value is refused with the accepted ones named. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, consumer, itemPath, itemRel, sharedBacklog, readItem, itemOfText } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

test('046: --severity changes the field, is published with an event, and refuses another value', () => {
  const t = mkdtempSync(join(tmpdir(), 'severity-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = args => cli(args, { cwd: cons, tmp: t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'tester' } });
  const made = run(['new', '--name', 'loud item', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--severity', 'critical', '--body', '## Definition of done\n\n- [ ] it holds']);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const file = itemPath(join(home, 'acme', 'demo'), '001-loud-item');
  assert.equal(readItem(file).fm.severity, 'critical');
  run(['show', '1', '--agent', 'tester']);
  const r = run(['update', '1', '--severity', 'normal', '--by', 'tester']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /severity=normal/);
  assert.equal(readItem(file).fm.severity, 'normal');
  const bare = spawnSync('git', ['-C', home, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(itemOfText(spawnSync('git', ['--git-dir', bare, 'show', `main:acme/demo/${itemRel('001-loud-item')}`], { encoding: 'utf8' }).stdout).fm.severity, 'normal'); // pushed
  assert.match(run(['history', '1']).stdout, /severity=normal/); // the event
  assert.equal(run(['list', 'critical']).stdout.includes('001-loud-item'), false);
  const bad = run(['update', '1', '--severity', 'urgent', '--by', 'tester']);
  assert.equal(bad.status, 2, bad.stdout + bad.stderr);
  assert.match(bad.stderr + bad.stdout, /invalid choice: 'urgent' \(choose from normal, critical\)/);
});

test('046: --severity is a field edit: refused on another team\'s item like any other', () => {
  const t = mkdtempSync(join(tmpdir(), 'severity-'));
  dirs.push(t);
  sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = (args, env = {}) => cli(args, { cwd: cons, tmp: t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'tester', SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', ...env } });
  assert.equal(run(['new', '--name', 'other team item', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] it holds', '--team', 't2']).status, 0);
  run(['show', '1', '--agent', 'tester']);
  const r = run(['update', '1', '--severity', 'critical', '--by', 'tester'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1' });
  assert.equal(r.status, 1, r.stdout + r.stderr); // another team's item
});
