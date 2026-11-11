// Item 042: depends_on accepts owner/name#seq, an item of another repository's backlog in the same backlog repository.
// An unknown repository or item is refused; a not-done foreign dependency blocks claim and next-work, a done one does
// not; the status line shows it; and when the work here waits on another repository, pop and work name that item and
// its repository as the work to do first (owner 2026-10-29). Two fixture repositories, local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

test('042: a dependency cycle through another repository, or on the item itself, is refused', () => {
  const t = mkdtempSync(join(tmpdir(), 'foreign-cycle-'));
  dirs.push(t);
  sharedBacklog(t);
  const here = consumer(t, 'acme', 'app', 'main');
  const there = consumer(t, 'acme', 'lib', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = (cwd, args, want = 0) => {
    const r = cli(args, { cwd, tmp: t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'tester' } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] x'];
  run(here, NEW('app item'));
  run(there, NEW('lib item'));
  run(there, ['show', '1', '--agent', 'tester']);
  run(there, ['update', '1', '--set-depends-on', 'acme/app#1', '--by', 'tester']);
  run(here, ['show', '1', '--agent', 'tester']);
  assert.match(run(here, ['update', '1', '--set-depends-on', 'acme/lib#1', '--by', 'tester'], 1).stdout, /dependency cycle through another repository's items back to acme\/app#1/);
  assert.match(run(here, ['update', '1', '--set-depends-on', 'acme/app#1', '--by', 'tester'], 1).stdout, /cycle/);
  // through a local item: app#2 depends on lib#1, which depends on app#1; app#1 -> app#2 closes the cycle
  run(here, ['new', '--name', 'app second', '--objective', 'o', '--summary', 's', '--depends-on', 'acme/lib#1', '--body', '## Definition of done\n\n- [ ] x']);
  run(here, ['show', '1', '--agent', 'tester']);
  assert.match(run(here, ['update', '1', '--set-depends-on', '2', '--by', 'tester'], 1).stdout, /dependency cycle through another repository's items back to acme\/app#1/);
  // an archived item's dependencies are still edges
  run(there, ['archive', '1', '--force']);
  assert.match(run(here, ['update', '1', '--set-depends-on', 'acme/lib#1', '--by', 'tester'], 1).stdout, /dependency cycle through another repository's items back to acme\/app#1/);
});

test('042: two clones that each add one half of a cycle through another repository: the later publication is refused', () => {
  const t = mkdtempSync(join(tmpdir(), 'foreign-race-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const here = consumer(t, 'acme', 'app', 'main');
  const there = consumer(t, 'acme', 'lib', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = (cwd, args, want = 0, env = {}) => {
    const r = cli(args, { cwd, tmp: t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'tester', ...env } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] x'];
  run(here, NEW('app item'));
  run(there, NEW('lib item'));
  const home2 = join(t, 'home2');
  spawnSync('git', ['clone', '-q', join(t, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`), home2]);
  run(there, ['show', '1', '--agent', 'bob'], 0, { SMOOTH_BACKLOG_CLI_HOME: home2 });
  // while tester's push is on its way, bob (the other clone) adds lib#1 -> app#1
  const hook = join(home, '.git', 'hooks', 'pre-push');
  const flag = join(t, 'hook-ran');
  writeFileSync(hook, `#!/bin/sh\n[ -f '${flag}' ] && exit 0\ntouch '${flag}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${there}' && SMOOTH_BACKLOG_CLI_HOME='${home2}' XDG_CONFIG_HOME='${join(t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update 1 --set-depends-on acme/app#1 --by bob >/dev/null 2>&1\nexit 0\n`);
  chmodSync(hook, 0o755);
  run(here, ['show', '1', '--agent', 'tester']);
  const r = run(here, ['update', '1', '--set-depends-on', 'acme/lib#1', '--by', 'tester'], 3);
  assert.match(r.stdout + r.stderr, /dependency cycle through another repository's items back to 001-app-item/);
});

test('042: owner/name#seq across repositories: refused when unknown, blocks claim and next-work until done, shown and named first', () => {
  const t = mkdtempSync(join(tmpdir(), 'foreign-'));
  dirs.push(t);
  sharedBacklog(t);
  const here = consumer(t, 'acme', 'app', 'main');
  const there = consumer(t, 'acme', 'lib', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = (cwd, args, want = 0, env = {}) => {
    const r = cli(args, { cwd, tmp: t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'tester', SMOOTH_BACKLOG_CLI_SESSION: '', ...env } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const NEW = (name, deps) => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', deps, '--body', '## Definition of done\n\n- [ ] it holds'];
  run(there, NEW('library change', 'none'));
  assert.match(run(here, NEW('needs a lost one', 'acme/nowhere#1'), 1).stdout, /no item 'acme\/nowhere#1' in the backlog repository/);
  assert.match(run(here, NEW('needs a missing item', 'acme/lib#9'), 1).stdout, /no item 'acme\/lib#9' in the backlog repository/);
  run(here, NEW('app change', 'acme/lib#1'));
  assert.match(run(here, ['list']).stdout, /⛓ depends on acme\/lib#1 001-library-change \(status pending\)/);
  run(there, ['show', '1']); // the move acts on the item as last read
  const moved = run(there, ['move', '1', '--to-repository', 'acme/third'], 1); // a move would leave it dangling
  assert.equal(moved.stdout, '❌ acme/app#1 of other repositories depends on acme/lib#1 (001-library-change), which would leave them pointing at nothing; clear them first in their repositories: update <dependent> --set-depends-on ...\n');
  assert.equal(moved.stderr, '');
  assert.equal(JSON.parse(run(here, ['next', '--json']).stdout).slug, '001-app-change'); // the work here is named, with the work it waits on first
  assert.match(run(here, ['next']).stdout, /⛓ waits on acme\/lib#1 \(001-library-change, status pending\): do that first in repository acme\/lib/);
  run(here, ['show', '1', '--agent', 'ada']);
  assert.match(run(here, ['update', '1', '--claim', 'ada'], 1).stdout, /dependencies not done: 001-library-change/);
  // the producer is finished: the dependency is done, shown so, and the claim goes through
  run(there, ['update', '1', '--claim', 'tester']);
  run(there, ['show', '1', '--agent', 'tester']);
  run(there, ['update', '1', '--close', '--summary', 'delivered', '--by', 'tester']);
  assert.match(run(here, ['list']).stdout, /⛓ depends on acme\/lib#1 001-library-change \(status closed\)/);
  assert.doesNotMatch(run(here, ['next']).stdout, /waits on/);
  run(here, ['show', '1', '--agent', 'ada']);
  run(here, ['update', '1', '--claim', 'ada']);
  run(here, ['show', '1', '--agent', 'tester']);
  assert.match(run(here, ['update', '1', '--set-depends-on', 'acme/lib#7', '--by', 'tester'], 1).stdout, /no item 'acme\/lib#7' in the backlog repository/);
  run(here, ['update', '1', '--set-depends-on', 'acme/lib#1', '--by', 'tester']);
});
