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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, createdSlug, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'unrefined-claim-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const roster = join(t, 'team.json');
  writeFileSync(roster, JSON.stringify({ amy: {}, ada: {}, zed: {} })); // the lead (TEAM_LEAD below) is none of them
  return { t, cons, roster, user: join(t, 'user'), folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const T1 = { TEAM_NAME: 't1' };
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '', BACKLOG_SESSION: '', TEAM_LEAD: 'lead', HOME: f.user, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const make = (f, name) => createdSlug(ok(f, ['new', ...NEW(name)]).stdout);
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
const teamItem = f => { const s = make(f, 'unrefined team item'); ok(f, ['update', s, '--set-team', 't1']); return s; }; // team set, no stage
const pop = (f, agent) => JSON.parse(run(f, ['pop', '--agent', agent, '--json'], T1).stdout);
const claimable = (f, env) => JSON.parse(ok(f, ['query', '--claimable', '--json'], env).stdout).map(x => x.slug);
const plan = f => JSON.parse(ok(f, ['query', '--plan', '--agents', 'amy,ada,zed', '--roster', f.roster, '--json'], T1).stdout);

test('a member cannot claim a team item without a stage: the refusal names --refine-start, and nothing is written', () => {
  const f = fixture();
  const s = teamItem(f);
  const r = no(f, ['update', s, '--claim', 'amy'], 'claim needs ready or in progress');
  assert.ok(r.stdout.includes('--refine-start --by <you>') && r.stdout.includes('refine it first'), r.stdout);
  no(f, ['update', s, '--claim', 'amy', '--force'], '--refine-start'); // --force does not pass the stages
  assert.deepEqual([fm(f, s).claimed_by, fm(f, s).stage], ['', undefined]);
});

test("the team lead's own claim of its team's work item is allowed (backlog team pop takes it to split it)", () => {
  const f = fixture();
  const s = teamItem(f);
  ok(f, ['update', s, '--claim', 'lead']);
  assert.equal(fm(f, s).claimed_by, 'lead');
});

test("the team lead's claim of a team split slice without a stage is refused, naming --refine-start", () => {
  const f = fixture();
  const s = make(f, 'legacy split slice');
  ok(f, ['update', s, '--set-team', 't1', '--append', 'Split from `parent-item`. Inherited context: none']);
  no(f, ['update', s, '--claim', 'lead'], '--refine-start');
  assert.equal(fm(f, s).claimed_by, '');
});

test('--refine-start accepts a team item without a stage', () => {
  const f = fixture();
  const s = teamItem(f);
  ok(f, ['update', s, '--refine-start', '--by', 'amy']);
  assert.deepEqual([fm(f, s).status, fm(f, s).refiner], ['refining', 'amy']);
});

test('pop offers an unrefined team item as refine, never as claim; query --claimable and --plan do not offer it', () => {
  const f = fixture();
  const s = teamItem(f);
  const p = pop(f, 'amy');
  assert.deepEqual([p.action, p.item], ['refine', s], JSON.stringify(p));
  assert.ok(p.instruction.includes('--refine-start --by amy'), p.instruction);
  assert.deepEqual(claimable(f, T1), []);
  assert.deepEqual(claimable(f, {}), []);
  assert.deepEqual(plan(f), []);
});

test('an item without a team and without the split marker stays claimable: no stage is solo work, ready', () => {
  const f = fixture();
  const s = make(f, 'solo item');
  assert.deepEqual(claimable(f, {}), [s]);
  ok(f, ['update', s, '--claim', 'amy']);
  assert.equal(fm(f, s).claimed_by, 'amy');
});
