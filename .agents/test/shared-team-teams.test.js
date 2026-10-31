// Tests for teams in the CLI (item 037; spec 2026-10-28-pr1-learnings.md section 3): the team field set and cleared by
// update and new, and the offers (pop, --claimable, --reviewable, --blocked).
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture(prefix = 'team-teams-') {
  const t = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const LEAD = { TEAM_LEAD: 'lead' }; // cody, archy and zed are plain members
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } });
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
const pop = (f, agent, env) => JSON.parse(run(f, ['query', '--pop', '--agent', agent, '--json'], env).stdout);
const slugs = (f, args, env) => JSON.parse(ok(f, ['query', ...args, '--json'], env).stdout).map(x => x.slug);

test('the runner sets the team on the work item and claims it for the lead; --set-team "" clears it', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  let r = ok(f, ['update', w, '--set-team', ' t1 ']);
  assert.match(r.stdout, /updated \(team=t1\)/);
  ok(f, ['update', w, '--claim', 'lead']);
  assert.deepEqual([fm(f, w).team, fm(f, w).claimed_by, fm(f, w).stage], ['t1', 'lead', undefined]); // a work item has no stage
  r = ok(f, ['update', w, '--set-team', '']);
  assert.match(r.stdout, /updated \(team=none\)/);
  assert.equal(fm(f, w).team, '');
});

test('backlog new --team writes the team and starts the item in stage refining; --split-from inherits the team', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const a = make(f, 'child a', '--split-from', w);
  assert.deepEqual([fm(f, a).team, fm(f, a).stage, fm(f, a).refiner], ['t1', 'refining', '']); // inherited
  assert.notEqual(pop(f, 'lead', { TEAM_NAME: 't1' }).action, 'claim'); // the lead never claims a split item
  const b = make(f, 'child of another team', '--split-from', w, '--team', 't2');
  assert.equal(fm(f, b).team, 't2'); // --team wins over the inherited team
  const c = make(f, 'other team item', '--team', 't2');
  assert.deepEqual([fm(f, c).team, fm(f, c).stage], ['t2', 'refining']);
  const plain = make(f, 'no team');
  assert.ok(!('team' in fm(f, plain)) && !('stage' in fm(f, plain)));
  const s = make(f, 'split of an item without team', '--split-from', plain);
  assert.ok(!('team' in fm(f, s)) && !('stage' in fm(f, s)));
});

test('with TEAM_NAME set, another team\'s item is never offered: pop, --claimable, --reviewable and --blocked', () => {
  const f = fixture();
  const [mine, theirs, none] = ['t1 job', 't2 job', 'job without team'].map(n => make(f, n));
  ok(f, ['update', mine, '--set-team', 't1']);
  ok(f, ['update', theirs, '--set-team', 't2']);
  const T1 = { TEAM_NAME: 't1' }; const T2 = { TEAM_NAME: 't2' };
  assert.deepEqual(slugs(f, ['--claimable'], T1), [mine]);
  assert.deepEqual(slugs(f, ['--claimable'], T2), [theirs]);
  assert.deepEqual(slugs(f, ['--claimable']), [mine, theirs, none]); // without TEAM_NAME every item
  assert.deepEqual([pop(f, 'cody', T2).action, pop(f, 'cody', T2).item], ['claim', theirs]);
  ok(f, ['update', mine, '--claim', 'archy']);
  ok(f, ['update', mine, '--request-review', 'any', '--note', 'commit abc']);
  assert.deepEqual(slugs(f, ['--reviewable', '--agent', 'zed'], T1), [mine]);
  assert.deepEqual(slugs(f, ['--reviewable', '--agent', 'zed'], T2), []);
  const p = pop(f, 'zed', T2); // t2's member: the claim of its own item, never the review of t1's
  assert.deepEqual([p.action, p.item], ['claim', theirs]);
  ok(f, ['update', theirs, '--claim', 'cody']);
  const q = pop(f, 'zed', T2);
  assert.ok(q.item !== mine && q.item !== none, JSON.stringify(q)); // nothing of another team or of no team
  const dep = make(f, 't2 waits', '--depends-on', theirs.split('-')[0]);
  ok(f, ['update', dep, '--set-team', 't2']);
  assert.deepEqual(slugs(f, ['--blocked'], T1), []);
  assert.deepEqual(slugs(f, ['--blocked'], T2), [dep]);
});

test('another team\'s chunk item is never offered, in this repository or (--scope all) in another one', () => {
  const f = fixture();
  const other = consumer(f.t, 'other', 'thing', 'main');
  const theirs = make(f, 't2 chunk here', '--chunk');
  ok(f, ['update', theirs, '--set-team', 't2']);
  writeFileSync(join(f.folder, 'backlog.scope'), 'refinement_scope: all\n');
  const T1 = { TEAM_NAME: 't1' };
  const popAll = env => JSON.parse(run(f, ['query', '--pop', '--agent', 'cody', '--scope', 'all', '--json'], env).stdout);
  const p = pop(f, 'cody', T1);
  assert.deepEqual([p.action, p.item], ['chunk', null]); // small-chunk work, but not t2's item
  const newIn = name => { const r = cli(['new', ...NEW(name), '--chunk'], { cwd: other, tmp: f.t, env: LEAD }); assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout.split('created phase phases/')[1].split('.md')[0]; };
  const far = newIn('t2 chunk there');
  const r = cli(['update', far, '--set-team', 't2'], { cwd: other, tmp: f.t, env: LEAD });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(popAll(T1).item, null);
  assert.deepEqual(slugs(f, ['--claimable', '--scope', 'all'], T1), []);
  const free = newIn('chunk of no team there'); // another repository's chunk work without a team stays open to every team
  assert.equal(popAll(T1).item, free);
  assert.deepEqual(slugs(f, ['--claimable', '--scope', 'all'], T1), [free]);
  assert.deepEqual(slugs(f, ['--claimable', '--scope', 'all']), [theirs, far, free]); // without TEAM_NAME every chunk item
});

test('the lead refines only an incomplete item of its own team', () => {
  const f = fixture();
  const bare = name => { const r = ok(f, ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none']); return r.stdout.split('created phase phases/')[1].split('.md')[0]; };
  const theirs = bare('t2 incomplete'); // first on the branch
  ok(f, ['update', theirs, '--set-team', 't2']);
  const mine = bare('t1 incomplete');
  ok(f, ['update', mine, '--set-team', 't1']);
  const lead = env => pop(f, 'lead', { ...env, TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' });
  assert.deepEqual([lead({ TEAM_NAME: 't1' }).action, lead({ TEAM_NAME: 't1' }).item], ['refine', mine]);
  assert.deepEqual([lead({ TEAM_NAME: 't2' }).action, lead({ TEAM_NAME: 't2' }).item], ['refine', theirs]);
  assert.equal(lead({}).item, theirs); // without TEAM_NAME the first incomplete item
});
