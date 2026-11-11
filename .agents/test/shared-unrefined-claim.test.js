// Item 098 (owner decision 083-A): nothing is implemented before it is refined. A team item without a stage (a team's work
// item, or one written before the stage field existed) is unrefined. The per-command contract:
//   --claim          refuses it for everyone, naming --refine-start; the one exception is the team lead's own claim of the
//                    team's work item (backlog team pop, to split it), never of a split slice
//   --refine-start   accepts it
//   pop              offers its refinement (action refine), never a claim
//   --claimable, --plan   omit it (they list only what can be claimed now)
// An item without a team and without the split marker keeps no stage (solo work) and stays claimable.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, createdSlug, itemPath, sharedBacklog, teamMembers, readItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'unrefined-claim-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  teamMembers(home, 't1', ['amy', 'ada', 'zed']); // the lead (SMOOTH_BACKLOG_CLI_TEAM_LEAD below) is none of them
  return { t, cons, user: join(t, 'user'), folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const T1 = { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1' };
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '', SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', HOME: f.user, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['show', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const make = (f, name) => createdSlug(ok(f, ['new', ...NEW(name)]).stdout);
const fm = (f, slug) => readItem(itemPath(f.folder, slug)).fm;
 // team set, no stage
const pop = (f, agent) => JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', agent, '--json'], T1).stdout);
const claimable = (f, env) => JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--claimable', '--json'], env).stdout).map(x => x.slug);
const plan = f => JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--plan', '--agents', 'amy,ada,zed', '--json'], T1).stdout);

test('an item without a team and without the split marker stays claimable: no stage is solo work, ready; no team view lists it', () => {
  const f = fixture();
  const s = make(f, 'solo item');
  assert.deepEqual(claimable(f, {}), []); // team t1 reaches only its own items
  ok(f, ['update', s, '--claim', 'amy']);
  assert.equal(fm(f, s).claimed_by, 'amy');
});
