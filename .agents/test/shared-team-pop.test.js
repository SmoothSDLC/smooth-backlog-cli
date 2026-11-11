// Tests for `backlog pop` (src/team/queue.js) - cli-parity job 20 (POP).
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { teamHelp } from '../../src/team/help.js';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-pop-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const other = consumer(t, 'other', 'thing', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, other, folder: join(home, 'acme', 'demo'), cfg: join(home, 'acme', 'demo', 'backlog.scope') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
function make(f, cwd, name, extra = []) {
  const has = k => extra.includes(k);
  const args = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  args.push('--body', DOD, ...extra);
  const r = cli(['new', ...args], { cwd, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = r.stdout.split('created phase ')[1].split(' ')[0];
  return slug;
}
test('--agents without --plan and --critical stay refused with pop', () => {
  const f = fixture();
  make(f, f.cons, 'x', []);
  for (const args of [['list', '--agents', 'a,b'], ['team', 'pop', '--team', 't1', '--agent', 't', '--agents', 'a'], ['team', 'pop', '--team', 't1', '--agent', 't', '--critical']]) {
    const r = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
});

test('the exit codes of backlog team pop are described: 3 is idle, 1 a publication or pull that failed', () => {
  assert.match(teamHelp['team pop'], /1 {2}The step could not be published/);
  assert.match(teamHelp['team pop'], /3 {2}idle: nothing to do now\. Only the idle answer exits 3/);
});

test('--roster is refused by pop: unrecognized arguments, exit 2', () => {
  const f = fixture();
  make(f, f.cons, 'roster job');
  for (const args of [['team', 'pop', '--team', 't1', '--agent', 'x', '--roster', join(f.t, 'nope.json')]]) {
    const gone = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(gone.status, 2, args.join(' '));
    assert.match(gone.stderr, /unrecognized arguments: --roster/);
  }
});

