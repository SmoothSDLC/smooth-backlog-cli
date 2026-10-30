// Tests for item 052, the team's dispatch plan (`backlog query --plan`; PR1 query.py team_plan and test_team_plan.py):
// at most one action per member, in roster order, each item to one member, with the reason and the dispatch key. The plan
// follows this build's pop rules (items 033, 036, 038, 039): a stale review is the lead's to hand on, a member's own work
// goes before another member's review request, a member waiting for its restart gets nothing, nothing before stage ready
// is reviewed or claimed, and another team's item or an incomplete one is never planned for a member. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, py, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const oracle = py('query.py', ['--help']) !== null;
function fixture(prefix = 'team-plan-') {
  const t = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const roster = join(t, 'team.json');
  writeFileSync(roster, JSON.stringify({ cody: {}, archy: {}, zed: {} })); // the lead (TEAM_LEAD below) is none of them
  return { t, home, cons, roster, user: join(t, 'user'), folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { TEAM_LEAD: 'lead', HOME: f.user, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
const plan = (f, env, agents = 'cody,archy,zed,lead') => JSON.parse(ok(f, ['query', '--plan', '--agents', agents, '--roster', f.roster, '--json'], env).stdout);
const rows = p => p.map(e => [e.member, e.action, e.item]);

test('test_one_claimable_item_goes_to_exactly_one_member', () => {
  const f = fixture();
  const job = make(f, 'shared tests job');
  let p = plan(f);
  assert.deepEqual(rows(p), [['cody', 'claim', job]]);
  assert.ok(p[0].instruction.includes(`backlog update ${job} --claim cody`) && p[0].instruction.includes('do not pop'), p[0].instruction);
  const other = make(f, 'second tests job');
  assert.deepEqual(plan(f).map(e => [e.member, e.item]), [['cody', job], ['archy', other]]); // one per member
  ok(f, ['update', job, '--claim', 'cody']); // cody holds an active item: no claim for him
  p = plan(f);
  assert.deepEqual(p.map(e => [e.member, e.item, e.reason]), [['archy', other, 'free member']]);
  const text = ok(f, ['query', '--plan', '--roster', f.roster]).stdout;
  assert.equal(text, `archy: claim ${other} (free member) - ${p[0].instruction}\n`);
});

test('test_review_goes_to_any_member_but_the_author; a member\'s own work goes first', () => {
  const f = fixture();
  const job = make(f, 'review job');
  ok(f, ['update', job, '--claim', 'zed']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'zed']);
  const p = plan(f);
  assert.deepEqual(p.map(e => [e.member, e.action, e.reason]), [['cody', 'review', 'any member but the author']]);
  assert.ok(p[0].instruction.startsWith(`start the review: backlog update ${job} --start-review --by cody; then review the work of zed`), p[0].instruction);
  const mine = make(f, 'cody busy');
  ok(f, ['update', mine, '--claim', 'cody']);
  ok(f, ['update', make(f, 'archy busy'), '--claim', 'archy']);
  assert.deepEqual(plan(f, { BACKLOG_REVIEW_FIRST_SECONDS: '0' }).filter(e => e.item === job), []); // every member but the author works: nobody
});

test('test_changes_verdict_is_planned_once_per_verdict_for_the_claimer_and_plain_continue_never', () => {
  const f = fixture();
  const job = make(f, 'respond job');
  ok(f, ['update', job, '--claim', 'archy']);
  assert.deepEqual(plan(f).filter(e => e.member === 'archy'), []); // archy works on it: nothing to send
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit 1', '--by', 'archy']);
  ok(f, ['update', job, '--review', 'changes', '--by', 'cody', '--comments', 'missing test (references/review/code.md)']);
  const t1 = fm(f, job).reviewed_at;
  const e = plan(f).filter(x => x.member === 'archy');
  assert.deepEqual(e.map(x => [x.action, x.key, x.reason]), [['respond', `archy respond ${e[0].seq} ${t1}`, 'claimer']]);
  assert.ok(e[0].instruction.includes('asked for changes') && e[0].instruction.includes('--request-review any'));
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit 2', '--by', 'archy']);
  assert.deepEqual(plan(f).filter(x => x.member === 'archy'), []);
  ok(f, ['update', job, '--review', 'pass', '--by', 'cody', '--comments', 'ok (references/review/code.md)']);
  assert.deepEqual(plan(f).filter(x => x.member === 'archy').map(x => [x.action, x.key]), [['close', `archy close ${e[0].seq}`]]);
});

test('a review in progress is hidden from the plan; a stale one goes to the lead to hand on', () => {
  const f = fixture();
  const job = make(f, 'review job');
  ok(f, ['update', job, '--claim', 'zed']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'zed']);
  ok(f, ['update', job, '--start-review', '--by', 'archy']);
  assert.deepEqual(plan(f).filter(e => e.item === job), []);
  const p = plan(f, { BACKLOG_REVIEW_STALE_SECONDS: '-1' }).filter(e => e.item === job);
  assert.deepEqual(p.map(e => [e.member, e.action]), [['lead', 'reassign-review']]);
  assert.ok(p[0].instruction.includes(`--reassign-review <member> --by lead`), p[0].instruction);
});

test('the lead, a review_only member and a member waiting for its restart get no claim; the lead refines an incomplete item', () => {
  const f = fixture();
  writeFileSync(f.roster, JSON.stringify({ cody: {}, archy: { review_only: true }, zed: {}, lead: {} }));
  const [a, b] = ['first claim job', 'second claim job'].map(n => make(f, n));
  assert.deepEqual(plan(f).map(e => [e.member, e.action]), [['cody', 'claim'], ['zed', 'claim']]); // archy reviews only, the lead never claims
  const tdir = join(f.user, '.qwen', 'teams', 't1');
  mkdirSync(join(tdir, 'handoff'), { recursive: true });
  writeFileSync(join(tdir, 'config.json'), JSON.stringify({ members: [{ name: 'cody', joinedAt: 1000 }] }));
  writeFileSync(join(tdir, 'handoff', 'cody.json'), JSON.stringify({ at_ms: Date.now(), seq: 1 }));
  assert.deepEqual(plan(f).map(e => [e.member, e.item]), [['zed', a]]); // cody waits for its restart
  const bare = ok(f, ['new', '--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none']).stdout.split('created phase phases/')[1].split('.md')[0];
  const r = plan(f).find(e => e.member === 'lead');
  assert.deepEqual([r.action, r.item], ['refine', bare]);
  assert.ok(r.reason.startsWith('incomplete: review_refs,estimate_min,definition_of_done') && r.instruction.includes('never action it'), JSON.stringify(r));
  assert.ok(!plan(f).some(e => e.member !== 'lead' && e.item === bare)); // never dispatched to a member
  assert.ok(b);
});

test("with TEAM_NAME another team's item is never planned, and nothing before stage ready is claimed or reviewed", () => {
  const f = fixture();
  const w = make(f, 'work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const c = make(f, 'child', '--split-from', w); // refining
  const theirs = make(f, "t2's item");
  ok(f, ['update', theirs, '--set-team', 't2']);
  const p = plan(f, { TEAM_NAME: 't1' });
  assert.deepEqual(rows(p), [['cody', 'claim', w]]); // not c (refining), not t2's item
  assert.ok(c);
});

test('parity with query.py --plan where the rules agree: claims, a review, a changes verdict, a close, the lead\'s refinement', t => {
  if (!oracle) return t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing');
  const outs = ['py', 'js'].map(side => {
    const f = fixture(`team-plan-${side}-`);
    const step = (script, args) => {
      const r = side === 'py' ? py(script, args, { cwd: f.cons, tmp: f.t, env: { TEAM_LEAD: 'lead', HOME: f.user } }) : run(f, [script === 'new_phase.py' ? 'new' : script === 'update.py' ? 'update' : 'query', ...args]);
      assert.equal(r.status, 0, `${side} ${script} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
      return r.stdout;
    };
    const plans = [];
    const p = () => plans.push(JSON.parse(step('query.py', ['--plan', '--agents', 'cody,archy,zed', '--roster', f.roster, '--json'])).map(e => ({ ...e, key: e.key.replace(/ \d{4}-\d\d-\d\dT\S+$/, ''), instruction: e.instruction.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g, 'TS') })));
    for (const n of ['first', 'second', 'third']) step('new_phase.py', NEW(n));
    p();
    step('update.py', ['1', '--claim', 'zed']); step('update.py', ['1', '--request-review', 'any', '--note', 'x', '--by', 'zed']);
    p();
    step('update.py', ['1', '--review', 'changes', '--by', 'cody', '--comments', 'fix (references/review/code.md)']);
    p();
    step('update.py', ['1', '--request-review', 'any', '--note', 'y', '--by', 'zed']);
    step('update.py', ['1', '--review', 'pass', '--by', 'cody', '--comments', 'ok (references/review/code.md)']);
    p();
    writeFileSync(f.roster, JSON.stringify({ cody: {}, archy: {}, zed: {}, lead: {} })); // the lead plans its refinement
    step('new_phase.py', ['--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none']); // incomplete
    plans.push(JSON.parse(step('query.py', ['--plan', '--agents', 'lead', '--roster', f.roster, '--json'])));
    return plans;
  });
  outs[1].forEach((p, i) => assert.deepEqual(p, outs[0][i], `plan ${i}`));
});

test('test_plan_gives_a_review_to_the_first_idle_member_but_the_author; a member refining an item is not idle', () => {
  const f = fixture();
  const job = make(f, 'plan review job');
  ok(f, ['update', job, '--claim', 'cody']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'cody']);
  const reviewers = () => plan(f).filter(e => e.item === job).map(e => [e.member, e.reason]);
  assert.deepEqual(reviewers(), [['archy', 'any member but the author']]);
  ok(f, ['update', make(f, 'archy busy job'), '--claim', 'archy']); // archy is not idle
  assert.deepEqual(reviewers(), [['zed', 'any member but the author']]);
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const c = make(f, 'child', '--split-from', w);
  ok(f, ['update', c, '--refine-start', '--by', 'zed']); // zed refines: active work too
  assert.deepEqual(reviewers(), []);
});
