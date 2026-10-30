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
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

test('042: owner/name#seq across repositories: refused when unknown, blocks claim and next-work until done, shown and named first', () => {
  const t = mkdtempSync(join(tmpdir(), 'foreign-'));
  dirs.push(t);
  sharedBacklog(t);
  const here = consumer(t, 'acme', 'app', 'main');
  const there = consumer(t, 'acme', 'lib', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = (cwd, args, want = 0) => {
    const r = cli(args, { cwd, tmp: t, env: { QWEN_CODE_AGENT_ID: 'tester', TEAM_LEAD: 'lead' } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const NEW = (name, deps) => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', deps, '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', '## Definition of done\n\n- [ ] it holds'];
  run(there, ['new', '--name', 'library change', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] it holds']); // no review_refs: closed with --status done
  assert.match(run(here, NEW('needs a lost one', 'acme/nowhere#1'), 1).stdout, /no item 'acme\/nowhere#1' in the backlog repository/);
  assert.match(run(here, NEW('needs a missing item', 'acme/lib#9'), 1).stdout, /no item 'acme\/lib#9' in the backlog repository/);
  run(here, NEW('app change', 'acme/lib#1'));
  assert.match(run(here, ['query', '--status']).stdout, /⛓ depends on acme\/lib#1 001-library-change \(status pending\)/);
  run(here, ['query', '--phase', '1', '--agent', 'archy']);
  assert.match(run(here, ['update', '1', '--claim', 'archy'], 1).stdout, /dependencies not done/);
  const p = JSON.parse(run(here, ['pop', '--agent', 'archy', '--json'], 3).stdout);
  assert.equal(p.action, 'idle');
  assert.deepEqual(p.first, [{ item: 'acme/lib#1', repository: 'acme/lib', seq: 1, slug: '001-library-change', status: 'pending' }]);
  assert.match(p.instruction, /the work here waits on acme\/lib#1 \(001-library-change, status pending\): do that first in repository acme\/lib/);
  assert.equal(p.blocked[0].waiting_on[0].repository, 'acme/lib');
  const lead = run(here, ['pop', '--agent', 'lead'], 3).stdout;
  assert.match(lead, /do that first in repository acme\/lib: end the session here; the team is started in that repository/);
  const w = JSON.parse(run(here, ['work', '--agent', 'archy', '--json'], 3).stdout);
  assert.equal(w.first[0].item, 'acme/lib#1'); // the next-work command names it too
  run(there, ['query', '--phase', '1', '--agent', 'tester']);
  run(there, ['update', '1', '--status', 'done', '--by', 'tester']);
  assert.match(run(here, ['query', '--status']).stdout, /⛓ depends on acme\/lib#1 001-library-change \(status done\)/);
  const offered = JSON.parse(run(here, ['pop', '--agent', 'archy', '--json']).stdout); // done: next-work offers the item
  assert.deepEqual([offered.action, offered.item, offered.first], ['claim', '001-app-change', undefined]);
  run(here, ['query', '--phase', '1', '--agent', 'archy']);
  run(here, ['update', '1', '--claim', 'archy']); // and the claim goes through
  run(here, ['query', '--phase', '1', '--agent', 'tester']);
  assert.match(run(here, ['update', '1', '--set-depends-on', 'acme/lib#7', '--by', 'tester'], 1).stdout, /no item 'acme\/lib#7' in the backlog repository/);
  run(here, ['update', '1', '--set-depends-on', 'acme/lib#1', '--by', 'tester']);
  // a dependency added after the claim: the holder is not told to go on, the other repository's item is named first
  run(there, ['new', '--name', 'library follow up', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] it holds']);
  run(here, ['update', '1', '--set-depends-on', 'acme/lib#2', '--by', 'tester']);
  const held = JSON.parse(run(here, ['pop', '--agent', 'archy', '--json'], 3).stdout);
  assert.equal(held.action, 'idle', JSON.stringify(held));
  assert.equal(held.first[0].item, 'acme/lib#2');
  const roster = join(t, 'roster.json'); writeFileSync(roster, JSON.stringify({ archy: {} }));
  const planned = JSON.parse(run(here, ['query', '--plan', '--roster', roster, '--json']).stdout);
  assert.ok(!planned.some(e => e.item === '001-app-change'), JSON.stringify(planned)); // the plan offers it no more than pop does
  // a requested review of an item that waits on another repository is not offered either: that item is named first
  run(here, NEW('reviewed app change', 'none'));
  run(here, ['query', '--phase', '2', '--agent', 'zed']);
  run(here, ['update', '2', '--claim', 'zed']);
  run(here, ['update', '2', '--request-review', 'any', '--note', 'n', '--by', 'zed']);
  run(here, ['query', '--phase', '2', '--agent', 'tester']);
  run(here, ['update', '2', '--set-depends-on', 'acme/lib#2', '--by', 'tester']);
  const rev = JSON.parse(run(here, ['pop', '--agent', 'rev', '--json'], 3).stdout);
  assert.deepEqual([rev.action, rev.first?.[0]?.item], ['idle', 'acme/lib#2'], JSON.stringify(rev));
});

test('042: a lead whose team items wait only on another repository is told to start the team there, not to wait', () => {
  const t = mkdtempSync(join(tmpdir(), 'foreign-lead-'));
  dirs.push(t);
  sharedBacklog(t);
  const here = consumer(t, 'acme', 'app', 'main');
  const there = consumer(t, 'acme', 'lib', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = (cwd, args, want = 0) => {
    const r = cli(args, { cwd, tmp: t, env: { QWEN_CODE_AGENT_ID: 'tester', TEAM_LEAD: 'lead', TEAM_NAME: 't1' } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const DOD = '## Definition of done\n\n- [ ] it holds';
  run(there, ['new', '--name', 'library change', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]);
  run(here, ['new', '--name', 'work item', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]);
  run(here, ['update', '1', '--set-team', 't1']);
  run(here, ['update', '1', '--claim', 'lead']);
  run(here, ['new', '--name', 'team child', '--objective', 'o', '--summary', 's', '--depends-on', 'acme/lib#1', '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]);
  run(here, ['update', '2', '--set-team', 't1']);
  const p = JSON.parse(run(here, ['pop', '--agent', 'lead', '--json'], 3).stdout);
  assert.deepEqual(p.first?.map(x => x.item), ['acme/lib#1'], JSON.stringify(p));
  assert.match(p.instruction, /end the session here; the team is started in that repository/);
});

test('042: a dependency cycle through another repository, or on the item itself, is refused', () => {
  const t = mkdtempSync(join(tmpdir(), 'foreign-cycle-'));
  dirs.push(t);
  sharedBacklog(t);
  const here = consumer(t, 'acme', 'app', 'main');
  const there = consumer(t, 'acme', 'lib', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = (cwd, args, want = 0) => {
    const r = cli(args, { cwd, tmp: t, env: { QWEN_CODE_AGENT_ID: 'tester' } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] x'];
  run(here, NEW('app item'));
  run(there, NEW('lib item'));
  run(there, ['query', '--phase', '1', '--agent', 'tester']);
  run(there, ['update', '1', '--set-depends-on', 'acme/app#1', '--by', 'tester']);
  run(here, ['query', '--phase', '1', '--agent', 'tester']);
  assert.match(run(here, ['update', '1', '--set-depends-on', 'acme/lib#1', '--by', 'tester'], 1).stdout, /dependency cycle through another repository's items back to acme\/app#1/);
  assert.match(run(here, ['update', '1', '--set-depends-on', 'acme/app#1', '--by', 'tester'], 1).stdout, /cycle/);
  // through a local item: app#2 depends on lib#1, which depends on app#1; app#1 -> app#2 closes the cycle
  run(here, ['new', '--name', 'app second', '--objective', 'o', '--summary', 's', '--depends-on', 'acme/lib#1', '--body', '## Definition of done\n\n- [ ] x']);
  run(here, ['query', '--phase', '1', '--agent', 'tester']);
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
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = (cwd, args, want = 0, env = {}) => {
    const r = cli(args, { cwd, tmp: t, env: { QWEN_CODE_AGENT_ID: 'tester', ...env } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] x'];
  run(here, NEW('app item'));
  run(there, NEW('lib item'));
  const home2 = join(t, 'home2');
  spawnSync('git', ['clone', '-q', join(t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), home2]);
  run(there, ['query', '--phase', '1', '--agent', 'bob'], 0, { BACKLOG_HOME: home2 });
  // while tester's push is on its way, bob (the other clone) adds lib#1 -> app#1
  const hook = join(home, '.git', 'hooks', 'pre-push');
  const flag = join(t, 'hook-ran');
  writeFileSync(hook, `#!/bin/sh\n[ -f '${flag}' ] && exit 0\ntouch '${flag}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${there}' && BACKLOG_HOME='${home2}' XDG_CONFIG_HOME='${join(t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update 1 --set-depends-on acme/app#1 --by bob >/dev/null 2>&1\nexit 0\n`);
  chmodSync(hook, 0o755);
  run(here, ['query', '--phase', '1', '--agent', 'tester']);
  const r = run(here, ['update', '1', '--set-depends-on', 'acme/lib#1', '--by', 'tester'], 3);
  assert.match(r.stdout + r.stderr, /dependency cycle through another repository's items back to 001-app-item/);
});
