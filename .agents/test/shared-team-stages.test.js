// Tests for the stages before any work (item 036; spec 2026-10-28-pr1-learnings.md section 4): refining, refined,
// refinement-review and ready, the refine and refinement-review steps of `backlog update`, the claim gate on ready, the
// refine and refinement-review actions of the pop, the incomplete-item rule, and the review-hitl stage of topology item 288
// with `backlog query --decisions`. Oracle: PR1 update.py:26-104 and 300-320, query.py:183-266, lib_db STAGES/is_ready.
// PR1 tests and their ports here: test_team_plan.py test_the_team_workflow_from_work_item_to_ready_work (without --plan,
// which this build refuses), test_team_complete.py test_incomplete_items_are_refined_by_the_lead_only, test_team_lifecycle.py
// test_claim_review_close_lifecycle and test_claim_refuses_done_item (shared-team-lifecycle.test.js, shared-audit.test.js t4),
// test_team_scope.py test_scopes_and_refinement_cap (shared-team-scope.test.js). Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';
import { cli, consumer, py, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const oracle = py('update.py', ['--help']) !== null;

function fixture(prefix = 'team-stages-') {
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
const T1 = { TEAM_NAME: 't1' };
// an agent reads an item before it writes it again (the stale-view guard of seen.js): the agent named by --by, --claim or --release
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const up = (f, slug, ...args) => ok(f, ['update', slug, ...args]);
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
const doc = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));
const fm = (f, slug) => doc(f, slug).fm;
const pop = (f, agent, env) => { const r = run(f, ['query', '--pop', '--agent', agent, '--json'], env); assert.ok([0, 3].includes(r.status), r.stdout + r.stderr); return JSON.parse(r.stdout); };
const work = (f, title = 'team work item') => { const w = make(f, title); up(f, w, '--set-team', 't1'); up(f, w, '--claim', 'lead'); return w; }; // the runner, for the lead

test('test_the_team_workflow_from_work_item_to_ready_work: split, member refinement, refinement review, ready, claim by its team only', () => {
  const f = fixture();
  const w = work(f);
  const a = make(f, 'child a', '--split-from', w); const b = make(f, 'child b', '--split-from', w);
  assert.deepEqual([fm(f, a).team, fm(f, a).stage], ['t1', 'refining']); // inherited, gated
  const other = make(f, "other team's item", '--team', 't2');
  let p = pop(f, 'cody', T1);
  assert.deepEqual([p.action, p.item], ['refine', a]);
  assert.ok(p.instruction.includes(`--refine-start --by cody`), p.instruction);
  no(f, ['update', a, '--claim', 'cody'], 'claimed only when its refinement review passed');
  up(f, a, '--refine-start', '--by', 'cody');
  assert.equal(pop(f, 'archy', T1).item, b); // a is cody's to refine
  p = pop(f, 'cody', T1);
  assert.deepEqual([p.action, p.item], ['refine', a]); // cody continues its refinement
  assert.ok(p.instruction.startsWith(`you are refining ${fm(f, a).seq}`) && p.instruction.includes('--refine-done --by cody'), p.instruction);
  no(f, ['update', a, '--refine-done', '--by', 'archy', '--note', 'x'], 'refiner is cody'); // not the refiner
  up(f, a, '--refine-done', '--by', 'cody', '--note', 'estimate and definition of done checked');
  assert.equal(fm(f, a).stage, 'refined');
  const lp = pop(f, 'lead', T1);
  assert.ok(lp.action === 'refinement-review' && lp.instruction.includes('codex-agent') && lp.instruction.includes('5-hour'), JSON.stringify(lp));
  up(f, a, '--request-refinement-review', '--by', 'lead');
  no(f, ['update', a, '--refinement-review', 'pass', '--by', 'archy', '--comments', 'fine'], 'codex|claude'); // only Codex or Claude reviews it
  no(f, ['update', a, '--refinement-review', 'pass', '--by', 'claude', '--comments', 'fine'], "Codex reports its 5-hour limit"); // Claude only after Codex's limit
  up(f, a, '--refinement-review', 'changes', '--by', 'codex', '--comments', 'estimate missing a test step; thread t-1');
  assert.deepEqual([fm(f, a).stage, fm(f, a).refiner], ['refining', '']); // back to refining
  up(f, a, '--refine-start', '--by', 'zed'); up(f, a, '--refine-done', '--by', 'zed', '--note', 'test step added');
  up(f, a, '--request-refinement-review', '--by', 'lead');
  no(f, ['update', a, '--refinement-review', 'limit', '--by', 'claude', '--comments', 'x'], 'only Codex reports its own 5-hour limit');
  up(f, a, '--refinement-review', 'limit', '--by', 'codex', '--comments', "usage limit: 5-hour limit exceeded; thread t-2");
  assert.equal(fm(f, a).stage, 'refinement-review'); // the limit is no verdict
  up(f, a, '--refinement-review', 'pass', '--by', 'claude', '--comments', 'codex limit exceeded; session s-2: ready');
  assert.equal(fm(f, a).stage, 'ready');
  assert.ok(doc(f, a).body.includes('Refinement review by claude: PASS: ready'));
  p = pop(f, 'cody', T1);
  assert.deepEqual([p.action, p.item], ['refine', b]); // first-round refinement before new work
  up(f, b, '--refine-start', '--by', 'zed');
  p = pop(f, 'cody', T1);
  assert.deepEqual([p.action, p.item], ['claim', a]); // then the ready item
  assert.notEqual(pop(f, 'zed', { TEAM_NAME: 't2' }).item, a); // nor offered to another team
  assert.ok(!JSON.parse(ok(f, ['query', '--claimable', '--json'], T1).stdout).some(x => [b, other].includes(x.slug))); // refining: not claimable
  up(f, w, '--claim', 'lead'); // the work item has no stage: the runner claims it for the lead (idempotent)
});

test('each step refuses what update.py refuses, and one step at a time', () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'child', '--split-from', w);
  const plain = make(f, 'no team');
  no(f, ['update', c, '--refine-start'], '--refine-start needs --by <agent>');
  no(f, ['update', plain, '--refine-start', '--by', 'cody'], 'only an item of a team in stage refining is refined (team none, stage none)');
  no(f, ['update', w, '--refine-start', '--by', 'cody'], 'only an item of a team in stage refining is refined (team t1, stage none)');
  no(f, ['update', c, '--refine-done', '--by', 'cody', '--note', 'x'], '--refine-done --by <the refiner>: refiner is nobody, stage refining');
  no(f, ['update', c, '--request-refinement-review', '--by', 'lead'], 'only a refined item goes to the refinement review (stage refining)');
  no(f, ['update', c, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'x'], 'no refinement review is requested (stage refining)');
  up(f, c, '--refine-start', '--by', 'cody');
  no(f, ['update', c, '--refine-start', '--by', 'archy'], 'cody is refining it since');
  no(f, ['update', c, '--refine-done', '--by', 'cody'], '--refine-done needs --note "<what you refined>"');
  up(f, c, '--refine-start', '--by', 'cody'); // the refiner again: allowed
  up(f, c, '--refine-done', '--by', 'cody', '--note', 'checked');
  no(f, ['update', c, '--request-refinement-review'], '--request-refinement-review --by <the team lead>');
  no(f, ['update', c, '--request-refinement-review', '--by', 'archy'], 'the lead (lead; TEAM_LEAD) sends a refined item to the refinement review (got archy)');
  up(f, c, '--request-refinement-review', '--by', 'lead');
  no(f, ['update', c, '--refinement-review', 'pass', '--by', 'codex'], '--refinement-review needs --comments');
  no(f, ['update', c, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'x', '--claim', 'cody'], 'one team-work step at a time');
  const r = run(f, ['update', c, '--refinement-review', 'maybe', '--by', 'codex', '--comments', 'x']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const d = make(f, 'claimed child', '--split-from', w);
  up(f, d, '--claim', 'cody', '--force'); // --force claims before ready
  no(f, ['update', d, '--refine-start', '--by', 'archy'], 'claimed by cody: the work item itself is refined and split by the team lead');
  assert.equal(fm(f, plain).stage, undefined);
});

test('the review-hitl stage: an owner decision holds the item and its dependents; --decisions lists it; --decision sends it back to refining', () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'needs a decision', '--split-from', w);
  const dep = make(f, 'waits for it', '--depends-on', c.split('-')[0]);
  up(f, dep, '--set-team', 't1'); // a work item of t1 without a stage: claimable but for its dependency
  const Q = 'What: keep the old format?\nWhy: the parser needs it.\nOptions: A keep, B drop.\nRecommendation: A.'; // the whole question, every line
  no(f, ['update', c, '--request-decision', Q], '--request-decision needs --by <agent>');
  no(f, ['update', c, '--request-decision', ' ', '--by', 'cody'], '--request-decision needs the question');
  no(f, ['update', make(f, 'plain'), '--request-decision', Q, '--by', 'cody'], 'only a team item before ready waits for an owner decision (team none, stage none)');
  no(f, ['update', c, '--decision', 'A'], 'no owner decision is pending (stage refining)');
  up(f, c, '--refine-start', '--by', 'cody');
  up(f, c, '--request-decision', Q, '--by', 'cody');
  assert.deepEqual([fm(f, c).stage, fm(f, c).refiner, fm(f, c).decision_requested_by], ['review-hitl', '', 'cody']);
  no(f, ['update', c, '--claim', 'archy'], 'stage review-hitl');
  no(f, ['update', c, '--claim', 'archy', '--force'], 'nobody claims it, --force included');
  no(f, ['update', dep, '--claim', 'archy'], 'dependencies not done');
  for (const agent of ['cody', 'archy', 'lead']) {
    const p = pop(f, agent, T1);
    assert.ok(p.item !== c && p.item !== dep, `${agent}: ${JSON.stringify(p)}`); // never offered, nor what depends on it
  }
  const list = JSON.parse(ok(f, ['query', '--decisions', '--json']).stdout);
  assert.deepEqual(list.map(x => [x.slug, x.team, x.decision_requested_by, x.question]), [[c, 't1', 'cody', Q]]);
  const text = ok(f, ['query', '--decisions']).stdout;
  assert.ok(text.startsWith('📋 1 owner decision(s) waiting — acme/demo, branch main;') && text.includes(`${c} (team t1)`), text);
  for (const line of Q.split('\n')) assert.ok(text.includes(`        ${line}\n`), line);
  assert.deepEqual(JSON.parse(ok(f, ['query', '--decisions', '--json'], { TEAM_NAME: 't2' }).stdout), []); // another team's decisions are not listed for t2
  up(f, c, '--decision', 'A: keep the old format');
  assert.deepEqual([fm(f, c).stage, fm(f, c).refiner], ['refining', '']);
  assert.match(doc(f, c).body, /\nDECISION \d{4}-\d\d-\d\d: A: keep the old format\n/);
  assert.deepEqual(JSON.parse(ok(f, ['query', '--decisions', '--json']).stdout), []);
  assert.deepEqual([pop(f, 'archy', T1).action, pop(f, 'archy', T1).item], ['refine', c]); // re-refined with the decision
});

test('test_incomplete_items_are_refined_by_the_lead_only: never claimed, reviewed or worked; the lead refines, then any member claims', () => {
  const f = fixture();
  const team = { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  const base = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'];
  const newBare = (...args) => ok(f, ['new', ...args]).stdout.split('created phase phases/')[1].split('.md')[0];
  const gaps = {
    review_refs: newBare(...base('complete no review_refs'), '--estimate', '5', '--complexity', 'low', '--body', DOD),
    estimate_min: newBare(...base('complete no estimate'), '--review-refs', 'references/review/code.md', '--complexity', 'low', '--body', `no estimate here\n\n${DOD}`),
    definition_of_done: newBare(...base('complete placeholder only')), // the placeholder definition of done only (no refs, no estimate)
  };
  no(f, ['update', gaps.review_refs, '--set-review-refs', 'docs/notes.md'], 'needs at least one review document');
  const deps = make(f, 'complete no depends_on');
  const path = join(f.folder, 'phases', `${deps}.md`);
  const { fm: dfm, body } = doc(f, deps);
  delete dfm.depends_on;
  store.write({ path, fm: dfm, body }, f.folder); // an item written before depends_on existed
  const con = db.connect(f.folder); try { db.scan(con, f.folder); } finally { con.close(); }
  gaps.depends_on = deps;
  for (const [field, slug] of Object.entries(gaps)) { // a member never claims an item missing any one field
    assert.match(no(f, ['update', slug, '--claim', 'archy'], 'incomplete item, missing ').stdout, new RegExp(`missing [^:]*\\b${field}\\b`));
    no(f, ['update', slug, '--note', 'working on it', '--append', 'x'], '--note', team);
  }
  const cl = JSON.parse(ok(f, ['query', '--claimable', '--agent', 'archy', '--json']).stdout).map(x => x.slug);
  assert.ok(!Object.values(gaps).some(s => cl.includes(s)), cl.join(' '));
  let p = pop(f, 'archy', team); // a member is never offered an incomplete item
  assert.deepEqual([p.action, p.item], ['chunk', null]); // only small-chunk work, no item
  p = pop(f, 'cody', { ...team, TEAM_LEAD: 'cody' }); // the lead is told to refine one, with the gaps
  assert.ok(p.action === 'refine' && Object.values(gaps).includes(p.item) && p.missing.length && p.instruction.includes('never action it'), JSON.stringify(p));
  assert.equal(pop(f, 'archy', { ...team, TEAM_LEAD: 'archy' }).action, 'refine'); // TEAM_LEAD names the lead
  no(f, ['update', gaps.estimate_min, '--claim', 'cody'], 'missing estimate_min', { ...team, TEAM_LEAD: 'cody' }); // the lead may not claim it either
  ok(f, ['update', gaps.estimate_min, '--append', 'ESTIMATE: 5 min, complexity low. Gap: created without an estimate'], team); // an older item's ESTIMATE line still counts
  ok(f, ['update', gaps.review_refs, '--set-review-refs', 'references/review/code.md', '--set-estimate', '9', '--set-layer', '2'], team);
  ok(f, ['update', gaps.depends_on, '--set-depends-on', 'none'], team);
  ok(f, ['update', gaps.definition_of_done, '--set-review-refs', 'references/review/code.md', '--set-estimate', '5', '--append', DOD], team); // a definition of done replaces the placeholder
  const now = JSON.parse(ok(f, ['query', '--claimable', '--agent', 'archy', '--json'], team).stdout).map(x => x.slug);
  for (const s of Object.values(gaps)) assert.ok(now.includes(s), s); // complete now: normal work for any member but the lead
  ok(f, ['update', gaps.estimate_min, '--claim', 'archy'], team);
});

test('parity with update.py: the stage steps print, refuse and write the front matter as the oracle', t => {
  if (!oracle) return t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing');
  const KEYS = ['team', 'stage', 'refiner', 'refinement_reviewed_by', 'claimed_by', 'status'];
  const STEPS = [
    ['update.py', 'update', ['1', '--set-team', 't1']], ['update.py', 'update', ['1', '--claim', 'lead']],
    ['new_phase.py', 'new', [...NEW('child'), '--split-from', '1']],
    ['update.py', 'update', ['2', '--claim', 'cody']], ['update.py', 'update', ['2', '--refine-start']],
    ['update.py', 'update', ['2', '--refine-start', '--by', 'cody']], ['update.py', 'update', ['2', '--refine-start', '--by', 'zed']],
    ['update.py', 'update', ['2', '--refine-done', '--by', 'zed', '--note', 'x']], ['update.py', 'update', ['2', '--refine-done', '--by', 'cody']],
    ['update.py', 'update', ['2', '--refine-done', '--by', 'cody', '--note', 'checked']],
    ['update.py', 'update', ['2', '--refinement-review', 'pass', '--by', 'codex', '--comments', 'x']],
    ['update.py', 'update', ['2', '--request-refinement-review', '--by', 'lead']],
    ['update.py', 'update', ['2', '--refinement-review', 'pass', '--by', 'archy', '--comments', 'x']],
    ['update.py', 'update', ['2', '--refinement-review', 'changes', '--by', 'codex', '--comments', 'needs a test; thread t-1']],
    ['update.py', 'update', ['2', '--refine-start', '--by', 'zed']], ['update.py', 'update', ['2', '--refine-done', '--by', 'zed', '--note', 'test']],
    ['update.py', 'update', ['2', '--request-refinement-review', '--by', 'lead']],
    ['update.py', 'update', ['2', '--refinement-review', 'pass', '--by', 'codex', '--comments', 'ready; thread t-2']],
    ['update.py', 'update', ['2', '--claim', 'cody']],
  ];
  const sides = ['py', 'js'].map(side => {
    const f = fixture(`team-stages-${side}-`);
    const out = [];
    for (const [script, command, args] of [['new_phase.py', 'new', NEW('work item')], ...STEPS]) {
      const r = side === 'py' ? py(script, args, { cwd: f.cons, tmp: f.t, env: LEAD }) : run(f, [command, ...args]);
      out.push([r.status, command === 'new' ? '' : r.stdout.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g, 'TS').replaceAll(f.t, '<tmp>')]);
    }
    return { out, items: ['001-work-item', '002-child'].map(s => Object.fromEntries(KEYS.map(k => [k, fm(f, s)[k]]))) };
  });
  sides[1].out.forEach((o, i) => assert.deepEqual(o, sides[0].out[i], `step ${i}: ${JSON.stringify(STEPS[i - 1] ?? 'new')}`));
  assert.deepEqual(sides[1].items, sides[0].items);
});

test('an incomplete item waiting in review-hitl is not offered to the lead for refinement', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  up(f, w, '--set-team', 't1'); // not held by the lead: nothing comes before the lead's refinement of incomplete items
  const c = ok(f, ['new', '--name', 'bare child', '--split-from', w, '--depends-on', 'none']).stdout.split('created phase phases/')[1].split('.md')[0]; // incomplete
  up(f, c, '--request-decision', 'What: which parser? Options: A, B. Recommendation: A.', '--by', 'cody');
  const env = { ...T1, TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  assert.deepEqual([pop(f, 'lead', env).action, pop(f, 'lead', env).item], ['idle', null]);
  up(f, c, '--decision', 'A');
  const p = pop(f, 'archy', env);
  assert.deepEqual([p.action, p.item], ['refine', c]); // back to refining: a member refines it
});

test('refine-done is refused while a field or the definition of done is missing; event lines are no definition of done', () => {
  const f = fixture();
  const bare = (...args) => ok(f, ['new', ...args, '--depends-on', 'none']).stdout.split('created phase phases/')[1].split('.md')[0];
  const w = bare('--name', 'bare work item'); // no definition of done: its split child inherits only the placeholder
  up(f, w, '--set-team', 't1');
  const c = bare('--name', 'bare child', '--split-from', w);
  up(f, c, '--refine-start', '--by', 'cody'); // an incomplete item in refining: its refinement steps are allowed
  up(f, c, '--set-review-refs', 'references/review/code.md', '--set-estimate', '5', '--by', 'cody');
  no(f, ['update', c, '--refine-done', '--by', 'cody', '--note', 'x'], 'still missing definition_of_done: complete it before --refine-done');
  up(f, c, '--note', 'a note while refining', '--by', 'cody');
  no(f, ['update', c, '--refine-done', '--by', 'cody', '--note', 'x'], 'still missing definition_of_done'); // the event lines after the placeholder do not count
  no(f, ['update', c, '--request-review', 'any', '--note', 'x', '--by', 'cody'], 'incomplete item, missing definition_of_done'); // only refinement steps while incomplete
  no(f, ['update', c, '--claim', 'cody', '--force'], 'incomplete item, missing definition_of_done');
  up(f, c, '--append', DOD, '--by', 'cody');
  up(f, c, '--refine-done', '--by', 'cody', '--note', 'definition of done written');
  assert.equal(fm(f, c).stage, 'refined');
});

test("Codex's 5-hour limit authorizes Claude for its round only", () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'child', '--split-from', w);
  const round = () => { up(f, c, '--refine-start', '--by', 'zed'); up(f, c, '--refine-done', '--by', 'zed', '--note', 'x'); up(f, c, '--request-refinement-review', '--by', 'lead'); };
  round();
  up(f, c, '--refinement-review', 'limit', '--by', 'codex', '--comments', '5-hour limit exceeded; thread t-1');
  up(f, c, '--refinement-review', 'changes', '--by', 'claude', '--comments', 'add a test step; session s-1');
  round();
  no(f, ['update', c, '--refinement-review', 'pass', '--by', 'claude', '--comments', 'ok'], 'Codex reports its 5-hour limit'); // a new round: Codex first again
  up(f, c, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'ready; thread t-2');
  assert.equal(fm(f, c).stage, 'ready');
});
