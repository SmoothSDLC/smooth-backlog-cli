// Item 034: work-in-progress limits overall, per repository, per branch, per team and per agent (<backlog home>/
// wip-limits.json), checked by a claim and a refinement start; the lead's recorded override lifts the team and agent
// limits for one item; a team limit of three means pop offers no fourth item; query --wip prints the counts and the
// stale items; a renumbering leaves `updated` of the items it only re-ranks. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture(repos = ['demo']) {
  const t = mkdtempSync(join(tmpdir(), 'wip-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = Object.fromEntries(repos.map(r => [r, consumer(t, 'acme', r, 'main')]));
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = (repo, args, want = 0, env = {}) => {
    const by = args[args.indexOf('--by') + 1] || args[args.indexOf('--claim') + 1];
    if (args[0] === 'update' && (args.includes('--by') || args.includes('--claim'))) cli(['query', '--phase', args[1], '--agent', by], { cwd: cons[repo], tmp: t, env: { TEAM_LEAD: 'lead', ...env } });
    const r = cli(args, { cwd: cons[repo], tmp: t, env: { TEAM_LEAD: 'lead', ...env } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const make = (repo, name, ...extra) => run(repo, ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', '## Definition of done\n\n- [ ] x', ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
  const limits = l => writeFileSync(join(home, 'wip-limits.json'), JSON.stringify(l));
  return { t, home, run, make, limits };
}

test('034: each of the five levels refuses the claim past its limit; the lead\'s recorded override lifts team and agent', () => {
  const f = fixture(['demo', 'other']);
  const [a, b, c] = ['one', 'two', 'three'].map(n => f.make('demo', n));
  const o = f.make('other', 'elsewhere');
  f.run('demo', ['update', a, '--claim', 'amy']);
  for (const [level, l, who, item, repo] of [
    ['overall', { overall: 1 }, 'bob', o, 'other'],
    ['repository', { repository: { default: 9, 'acme/demo': 1 } }, 'bob', b, 'demo'],
    ['branch', { branch: 1 }, 'bob', b, 'demo'],
    ['agent', { agent: 1 }, 'amy', b, 'demo'],
  ]) {
    f.limits(l);
    const r = f.run(repo, ['update', item, '--claim', who, ...(level === 'agent' ? ['--force'] : [])], 1);
    assert.match(r.stdout, new RegExp(`the ${level} work-in-progress limit.* is 1 and 1 item\\(s\\) are in progress`), level);
  }
  f.limits({ team: 1 });
  for (const s of [b, c]) f.run('demo', ['update', s, '--set-team', 't1']);
  f.run('demo', ['update', b, '--claim', 'bob']);
  assert.match(f.run('demo', ['update', c, '--claim', 'cat'], 1).stdout, /the team work-in-progress limit of t1 is 1 and 1 item\(s\) are in progress/);
  assert.match(f.run('demo', ['update', c, '--wip-override', 'urgent fix', '--by', 'bob'], 1).stdout, /only the team lead \(lead\) lifts/);
  f.run('demo', ['update', c, '--wip-override', 'the release needs it today', '--by', 'lead']);
  f.run('demo', ['update', c, '--claim', 'cat']); // lifted for this item, recorded
  const fm = parse(readFileSync(join(f.home, 'acme', 'demo', 'phases', `${c}.md`), 'utf8')).fm;
  assert.deepEqual([fm.wip_override, fm.wip_override_by], ['the release needs it today', 'lead']);
  f.limits({ overall: 1 });
  assert.match(f.run('other', ['update', o, '--claim', 'dan'], 1).stdout, /overall work-in-progress limit/); // only the owner's file changes overall
});

test('034: with a team limit of three, pop offers no fourth item while three are in progress', () => {
  const f = fixture();
  f.limits({ team: 3 });
  const items = ['a', 'b', 'c', 'd'].map(n => f.make('demo', `item ${n}`));
  for (const s of items) f.run('demo', ['update', s, '--set-team', 't1']);
  const T = { TEAM_NAME: 't1' };
  ['m1', 'm2', 'm3'].forEach((m, i) => f.run('demo', ['update', items[i], '--claim', m], 0, T));
  const p = JSON.parse(f.run('demo', ['pop', '--agent', 'm4', '--json'], [0, 3], T).stdout);
  assert.notEqual(p.action, 'claim', JSON.stringify(p));
  assert.match(f.run('demo', ['update', items[3], '--claim', 'm4'], 1, T).stdout, /team work-in-progress limit of t1 is 3 and 3/);
});

test('034: query --wip prints the counts and the stale items; a renumbering leaves updated of the re-ranked items', () => {
  const f = fixture();
  f.limits({ repository: 5, stale_hours: 1 });
  const [a, b, c] = ['one', 'two', 'three'].map(n => f.make('demo', n));
  f.run('demo', ['update', a, '--claim', 'amy']);
  const file = join(f.home, 'acme', 'demo', 'phases', `${a}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^updated: .*$/m, 'updated: "2026-01-01T00:00:00Z"')); // old: stale
  const text = f.run('demo', ['query', '--wip']).stdout;
  assert.match(text, /repository +acme\/demo +1 \/ 5/);
  assert.match(text, /stale \(no change of their own for more than 1 h\): 1/);
  const j = JSON.parse(f.run('demo', ['query', '--wip', '--json']).stdout);
  assert.deepEqual(j.stale.map(x => x.slug), [a]);
  const upd = s => parse(readFileSync(join(f.home, 'acme', 'demo', 'phases', `${s}.md`), 'utf8')).fm.updated;
  const before = [b, c].map(upd);
  f.run('demo', ['update', '--replan', `${c},${b},${a}`]); // re-ranks b and c only
  assert.deepEqual([b, c].map(upd), before);
});
