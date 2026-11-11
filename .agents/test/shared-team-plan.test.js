// Tests for the team's dispatch plan (`backlog team query --plan`).
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, createdSlug, intoTeam, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture(prefix = 'team-plan-') {
  const t = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(t);
  const home = sharedBacklog(t);
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer' }], members: ['ann', 'bob', 'zed'] } })); // t1 asks one peer review of its work; the lead (SMOOTH_BACKLOG_CLI_TEAM_LEAD below) is none of the members
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, user: join(t, 'user'), folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '', SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', HOME: f.user, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['show', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const raw = (f, name, ...extra) => createdSlug(ok(f, ['new', ...NEW(name), ...extra]).stdout); // an item as created: no team
const make = (f, name, ...extra) => intoTeam(raw(f, name, ...extra), { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_SESSION: '', HOME: f.user } }); // the plan reaches only the items of t1
const plan = (f, env, agents = 'ann,bob,zed,lead') => JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--plan', '--agents', agents, '--json'], env).stdout);
test('the lead and a review_only member get no claim; the lead refines an incomplete item', () => {
  const f = fixture();
  writeFileSync(join(f.home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer' }], members: ['ann', 'bob', 'zed', 'lead'], review_only: ['bob'] } })); // bob reviews only
  const [a, b] = ['first claim job', 'second claim job'].map(n => make(f, n));
  assert.deepEqual(plan(f).map(e => [e.member, e.action]), [['ann', 'claim'], ['zed', 'claim']]); // bob reviews only, the lead never claims
  const bare = intoTeam(createdSlug(ok(f, ['new', '--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none']).stdout), { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_SESSION: '', HOME: f.user } }, 't1', ''); // an incomplete item of t1
  const r = plan(f).find(e => e.member === 'lead');
  assert.deepEqual([r.action, r.item], ['refine', bare]);
  assert.ok(r.reason.startsWith('incomplete: review_refs,estimate_min,definition_of_done') && r.instruction.includes('never action it'), JSON.stringify(r));
  assert.ok(!plan(f).some(e => e.member !== 'lead' && e.item === bare)); // never dispatched to a member
  assert.ok(a && b);
});

