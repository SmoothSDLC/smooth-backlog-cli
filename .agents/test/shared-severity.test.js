// Item 046: backlog update --severity normal|critical changes an item's severity, commits, pushes and records an event;
// another value is refused with the accepted ones named. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

test('046: --severity changes the field, is published with an event, and refuses another value', () => {
  const t = mkdtempSync(join(tmpdir(), 'severity-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = args => cli(args, { cwd: cons, tmp: t, env: { QWEN_CODE_AGENT_ID: 'tester' } });
  const made = run(['new', '--name', 'loud item', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--severity', 'critical', '--body', '## Definition of done\n\n- [ ] it holds']);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const file = join(home, 'acme', 'demo', 'phases', '001-loud-item.md');
  assert.equal(parse(readFileSync(file, 'utf8')).fm.severity, 'critical');
  run(['query', '--phase', '1', '--agent', 'tester']);
  const r = run(['update', '1', '--severity', 'normal', '--by', 'tester']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /severity=normal/);
  assert.equal(parse(readFileSync(file, 'utf8')).fm.severity, 'normal');
  const bare = spawnSync('git', ['-C', home, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
  assert.match(spawnSync('git', ['--git-dir', bare, 'show', 'main:acme/demo/phases/001-loud-item.md'], { encoding: 'utf8' }).stdout, /^severity: "?normal"?$/m); // pushed
  assert.match(run(['query', '--events', '1']).stdout, /severity=normal/); // the event
  assert.equal(run(['query', '--critical']).stdout.includes('001-loud-item'), false);
  const bad = run(['update', '1', '--severity', 'urgent', '--by', 'tester']);
  assert.equal(bad.status, 2, bad.stdout + bad.stderr);
  assert.match(bad.stderr + bad.stdout, /invalid choice: 'urgent' \(choose from normal, critical\)/);
});
