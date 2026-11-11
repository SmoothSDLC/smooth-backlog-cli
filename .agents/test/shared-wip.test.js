// Item 034: work-in-progress limits overall, per repository, per branch, per team and per agent (<backlog home>/
// wip-limits.json), checked by a claim and a refinement start; the lead's recorded override lifts the team and agent
// limits for one item; a renumbering leaves `updated` of the items it only re-ranks. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, itemPath, sharedBacklog, readItem, changeItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture(repos = ['demo']) {
  const t = mkdtempSync(join(tmpdir(), 'wip-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = Object.fromEntries(repos.map(r => [r, consumer(t, 'acme', r, 'main')]));
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = (repo, args, want = 0, env = {}) => {
    const by = args[args.indexOf('--by') + 1] || args[args.indexOf('--claim') + 1];
    if (args[0] === 'update' && (args.includes('--by') || args.includes('--claim'))) cli(['show', args[1], '--agent', by], { cwd: cons[repo], tmp: t, env: { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', ...env } });
    const r = cli(args, { cwd: cons[repo], tmp: t, env: { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', ...env } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const make = (repo, name, ...extra) => run(repo, ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--complexity', 'low', '--body', '## Definition of done\n\n- [ ] x', ...extra]).stdout.split('created phase ')[1].split(' ')[0];
  const limits = l => writeFileSync(join(home, 'wip-limits.json'), JSON.stringify(l));
  return { t, home, cons, run, make, limits };
}

test('034: the overall level refuses a claim and a status change that start work; only the exact word \'in progress\' starts; a limits file that cannot be read holds nobody', () => {
  const f = fixture(['demo', 'other']);
  const a = f.make('demo', 'one');
  const o = f.make('other', 'elsewhere');
  f.run('demo', ['update', a, '--claim', 'amy']);
  f.limits({ overall: 1 });
  assert.match(f.run('other', ['update', o, '--claim', 'dan'], 1).stdout, /the overall work-in-progress limit.* is 1 and 1 item\(s\) are in progress/); // only the owner's file changes overall
  assert.match(f.run('other', ['update', o, '--status', 'in progress', '--by', 'dan'], 1).stdout, /the overall work-in-progress limit.* is 1 and 1 item\(s\) are in progress/); // a status change starts work too
  // only the exact word 'in progress' counts: a typed in_progress is an ordinary open word that starts nothing and counts for nothing
  assert.equal(f.run('other', ['update', o, '--status', 'in_progress', '--by', 'dan']).status, 0);
  assert.equal(readItem(itemPath(join(f.home, 'acme', 'other'), o)).fm.status, 'in_progress');
  // a limits file that cannot be read holds nobody (owner 2026-10-30), and says so
  writeFileSync(join(f.home, 'wip-limits.json'), '{ not json');
  assert.match(f.run('other', ['update', o, '--claim', 'dan']).stderr, /wip-limits\.json cannot be read or is no JSON .*no work-in-progress limit applies until it is fixed/);
});

test('034: a reclaim of an item set back to pending is a start: the repository limit counts it', () => {
  const f = fixture();
  const [a, b] = ['one', 'two'].map(n => f.make('demo', n));
  f.run('demo', ['update', a, '--claim', 'amy']);
  f.run('demo', ['update', a, '--status', 'pending', '--by', 'amy']);
  f.limits({ repository: 1 });
  f.run('demo', ['update', b, '--claim', 'bob']);
  assert.match(f.run('demo', ['update', a, '--claim', 'amy'], 1).stdout, /the repository work-in-progress limit of acme\/demo is 1/);
});

test('034: a renumbering leaves updated of the re-ranked items', () => {
  const f = fixture();
  f.limits({ repository: 5, stale_hours: 1 });
  const [a, b, c] = ['one', 'two', 'three'].map(n => f.make('demo', n));
  f.run('demo', ['update', a, '--claim', 'amy']);
  const file = itemPath(join(f.home, 'acme', 'demo'), a);
  changeItem(file, { fm: { updated: '2026-01-01T00:00:00Z' } }); // old: stale
  const upd = s => readItem(itemPath(join(f.home, 'acme', 'demo'), s)).fm.updated;
  const before = [b, c].map(upd);
  f.run('demo', ['update', '--replan', `${c},${b},${a}`]); // re-ranks b and c only
  assert.deepEqual([b, c].map(upd), before);
});

test('034: a start that another clone made while this one published counts: the later publication is refused', () => {
  const f = fixture();
  const [a, b] = ['one', 'two'].map(n => f.make('demo', n));
  const home2 = join(f.t, 'home2');
  spawnSync('git', ['clone', '-q', join(f.t, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`), home2]);
  f.run('demo', ['show', b, '--agent', 'bob'], 0, { SMOOTH_BACKLOG_CLI_HOME: home2 });
  f.limits({ repository: 1 });
  // while amy's push is on its way, bob (the other clone, which has no limits file) claims the other item
  const hook = join(f.home, '.git', 'hooks', 'pre-push');
  const flag = join(f.t, 'hook-ran');
  writeFileSync(hook, `#!/bin/sh\n[ -f '${flag}' ] && exit 0\ntouch '${flag}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd '${f.cons.demo}' && SMOOTH_BACKLOG_CLI_TEAM_LEAD=lead SMOOTH_BACKLOG_CLI_HOME='${home2}' XDG_CONFIG_HOME='${join(f.t, 'config')}' '${process.execPath}' '${join(process.cwd(), 'bin', 'backlog.js')}' update ${b} --claim bob >/dev/null 2>&1\nexit 0\n`);
  chmodSync(hook, 0o755);
  const r = f.run('demo', ['update', a, '--claim', 'amy'], 3);
  assert.match(r.stdout + r.stderr, /the repository work-in-progress limit of acme\/demo is 1 and 1 item\(s\) are in progress/);
});

test('034: a branch limit is keyed owner/name:branch', () => {
  const f = fixture();
  const [a, b] = ['one', 'two'].map(n => f.make('demo', n));
  f.limits({ branch: { default: 9, 'acme/demo:main': 1 } });
  f.run('demo', ['update', a, '--claim', 'amy']);
  assert.match(f.run('demo', ['update', b, '--claim', 'bob'], 1).stdout, /the branch work-in-progress limit of acme\/demo branch main is 1/);
});

test('034: an item in progress is not moved into a repository past its limit', () => {
  const f = fixture(['demo', 'other']);
  const a = f.make('demo', 'one');
  f.run('demo', ['update', a, '--claim', 'amy']);
  f.limits({ repository: { default: 9, 'acme/other': 0 } });
  assert.match(f.run('demo', ['move', a, '--to-repository', 'acme/other'], 1).stdout, /in progress, and in acme\/other: the repository work-in-progress limit of acme\/other is 0/);
});

