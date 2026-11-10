// Tests for the stages before any work: refining, refined, refinement-review and ready.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseItem as parse } from '../../src/shared/frontmatter.js';
import { hasDefinitionOfDone } from '../../src/shared/new.js';
import * as store from '../../src/shared/store.js';
import { cli, consumer, createdSlug, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture(prefix = 'team-stages-') {
  const t = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({
    t1: { lead: 'lead', members: ['ann', 'bob', 'zed'], refinement_review: [{ team: 'reviewers', count: 1 }] },
    reviewers: { lead: 'rex', members: ['rex', 'ria'] },
    t2: { lead: 'lead2', members: ['zed', 'nobody'], review: [] }, // another team, for the tests that ask as one
  }));
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const LEAD = { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' }; // ann, bob and zed are plain members
const T1 = { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1' };
// an agent reads an item before it writes it again (the stale-view guard of seen.js): the agent named by --by, --claim or --release
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['show', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.equal(r.stderr, '', `${args.join(' ')}: ${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const up = (f, slug, ...args) => ok(f, ['update', slug, ...args]);
const make = (f, name, ...extra) => createdSlug(ok(f, ['new', ...NEW(name), ...extra]).stdout);
const doc = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));
const fm = (f, slug) => doc(f, slug).fm;
const pop = (f, agent, env) => { const r = run(f, ['team', 'pop', '--team', env?.SMOOTH_BACKLOG_CLI_TEAM_NAME || 't1', '--agent', agent, '--json'], env?.SMOOTH_BACKLOG_CLI_TEAM_NAME ? { SMOOTH_BACKLOG_CLI_AGENT: agent, ...env } : env); assert.ok([0, 3].includes(r.status), r.stdout + r.stderr); return JSON.parse(r.stdout); };
// a team item is refined (a member, the lead's review request, a reviewer's pass) before anyone claims it
const refined = (f, slug) => [['--refine-start', '--by', 'rfn'], ['--refine-done', '--by', 'rfn', '--note', 'refined'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']].forEach(a => up(f, slug, ...a));
const work = (f, title = 'team work item') => { const w = make(f, title); up(f, w, '--set-team', 't1'); up(f, w, '--claim', 'lead'); return w; }; // the runner, for the lead

test('test_the_team_workflow_from_work_item_to_ready_work: split, member refinement, refinement review, ready, claim by its team only', () => {
  const f = fixture();
  const w = work(f);
  const a = make(f, 'child a', '--split-from', w); const b = make(f, 'child b', '--split-from', w);
  assert.deepEqual([fm(f, a).team, fm(f, a).status], ['t1', 'new']); // inherited, gated
  const other = make(f, "other team's item", '--team', 't2');
  let p = pop(f, 'ann', T1);
  assert.deepEqual([p.action, p.item], ['refine', a]);
  assert.ok(p.marked.includes('--refine-start --agent ann'), p.marked); // team pop starts the refinement it offers
  no(f, ['update', a, '--claim', 'ann'], 'claim needs ready or in progress');
  assert.equal(fm(f, a).refiner, 'ann');
  assert.equal(pop(f, 'bob', T1).item, b); // a is ann's to refine
  p = pop(f, 'ann', T1);
  assert.deepEqual([p.action, p.item], ['refine', a]); // ann continues its refinement
  assert.ok(p.instruction.startsWith(`you are refining ${fm(f, a).seq}`) && p.instruction.includes('--agent ann --refine-done'), p.instruction);
  no(f, ['update', a, '--refine-done', '--by', 'bob', '--note', 'x'], 'refiner is ann'); // not the refiner
  up(f, a, '--refine-done', '--by', 'ann', '--note', 'estimate and definition of done checked');
  assert.equal(fm(f, a).status, 'refined');
  const lp = pop(f, 'lead', T1);
  assert.ok(lp.action === 'refinement-review' && lp.instruction.includes('teams.json'), JSON.stringify(lp));
  up(f, a, '--request-refinement-review', '--by', 'lead');
  no(f, ['update', a, '--refinement-review', 'pass', '--by', 'bob', '--comments', 'fine'], 'reviewed by a member of reviewers'); // only a configured reviewer
  up(f, a, '--refinement-review', 'changes', '--by', 'rex', '--comments', 'estimate missing a test step; thread t-1');
  assert.deepEqual([fm(f, a).status, fm(f, a).refiner], ['refining', '']); // back to refining
  up(f, a, '--refine-start', '--by', 'zed'); up(f, a, '--refine-done', '--by', 'zed', '--note', 'test step added');
  up(f, a, '--request-refinement-review', '--by', 'lead');
  up(f, a, '--refinement-review', 'pass', '--by', 'rex', '--comments', 'ready; session s-2');
  assert.equal(fm(f, a).status, 'ready');
  assert.ok(doc(f, a).body.includes('Refinement review by rex: COMPLETE'));
  assert.equal(fm(f, b).refiner, 'bob'); // b was taken for its first-round refinement by bob's team pop above
  p = pop(f, 'ann', T1);
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', a, true]); // then the ready item
  assert.notEqual(pop(f, 'zed', { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't2' }).item, a); // nor offered to another team
  assert.ok(!JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--claimable', '--json'], T1).stdout).some(x => [b, other].includes(x.slug))); // refining: not claimable
  up(f, w, '--claim', 'lead'); // the work item has no stage: the runner claims it for the lead (idempotent)
});

test('each step refuses out of order, and one step at a time', () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'child', '--split-from', w);
  const plain = make(f, 'no team');
  no(f, ['update', plain, '--refine-start', '--by', 'ann'], 'only an item of a team in stage refining is refined (team none, stage none)');
  // the stage-less work item of a team is unrefined (stage refining); a member does not refine the lead's claimed work item
  no(f, ['update', w, '--refine-start', '--by', 'ann'], 'claimed by lead: the work item itself is refined and split by the team lead, not refined here');
  no(f, ['update', c, '--refine-done', '--by', 'ann', '--note', 'x'], '--refine-done --by <the refiner>: refiner is nobody, stage refining');
  no(f, ['update', c, '--request-refinement-review', '--by', 'lead'], 'only a refined item goes to the refinement review (stage refining)');
  no(f, ['update', c, '--refinement-review', 'pass', '--by', 'rex', '--comments', 'x'], 'no refinement review is requested (stage refining)');
  up(f, c, '--refine-start', '--by', 'ann');
  no(f, ['update', c, '--refine-start', '--by', 'bob'], 'ann is refining it since');
  no(f, ['update', c, '--refine-done', '--by', 'ann'], '--refine-done needs --note "<what you refined>"');
  up(f, c, '--refine-start', '--by', 'ann'); // the refiner again: allowed
  up(f, c, '--refine-done', '--by', 'ann', '--note', 'checked');
  no(f, ['update', c, '--request-refinement-review'], '--request-refinement-review --by <the team lead>');
  no(f, ['update', c, '--request-refinement-review', '--by', 'bob'], 'the lead (lead; SMOOTH_BACKLOG_CLI_TEAM_LEAD) sends a refined item to the refinement review (got bob)');
  up(f, c, '--request-refinement-review', '--by', 'lead');
  no(f, ['update', c, '--refinement-review', 'pass', '--by', 'rex'], '--refinement-review needs --comments');
  no(f, ['update', c, '--refinement-review', 'pass', '--by', 'rex', '--comments', 'x', '--claim', 'ann'], 'one team-work step at a time');
  const r = run(f, ['update', c, '--refinement-review', 'maybe', '--by', 'rex', '--comments', 'x']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const d = make(f, 'claimed child', '--split-from', w);
  no(f, ['update', d, '--claim', 'ann', '--force'], 'claim needs ready or in progress'); // --force does not pass the stages
  const { fm: dfm, body: dbody } = doc(f, d);
  store.write({ path: join(f.folder, 'phases', `${d}.md`), fm: { ...dfm, claimed_by: 'ann' }, body: dbody }, f.folder); // as a hand edit leaves it
  no(f, ['update', d, '--refine-start', '--by', 'bob'], 'claimed by ann: the work item itself is refined and split by the team lead');
  assert.equal(fm(f, plain).stage, undefined);
});

test('the review-hitl stage: an owner decision holds the item and its dependents; --decisions lists it; --decision sends it back to refining', () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'needs a decision', '--split-from', w);
  const dep = make(f, 'waits for it', '--depends-on', c.split('-')[0]);
  up(f, dep, '--set-team', 't1'); refined(f, dep); // a refined item of t1: claimable but for its dependency
  const Q = 'What: keep the old format?\nWhy: the parser needs it.\n## Options\nA keep, B drop.\n## Review by users at 2026-10-01T10:00:00Z\nDECISION 2026-10-01: an earlier answer, quoted\nRecommendation: A.'; // the whole question, its own headings included
  no(f, ['update', c, '--request-decision', ' ', '--by', 'ann'], '--request-decision needs the question');
  no(f, ['update', make(f, 'plain'), '--request-decision', Q, '--by', 'ann'], 'only a team item before ready waits for an owner decision (team none, stage none)');
  no(f, ['update', c, '--decision', 'A'], 'no owner decision is pending (stage refining)');
  up(f, c, '--refine-start', '--by', 'ann');
  up(f, c, '--request-decision', Q, '--by', 'ann');
  assert.deepEqual([fm(f, c).status, fm(f, c).refiner, fm(f, c).decision_requested_by], ['awaiting decision', '', 'ann']);
  no(f, ['update', c, '--claim', 'bob'], 'is awaiting decision; claim needs ready or in progress');
  no(f, ['update', c, '--claim', 'bob', '--force'], 'nobody claims it, --force included');
  no(f, ['update', dep, '--claim', 'bob'], 'dependencies not done');
  for (const agent of ['ann', 'bob', 'lead']) {
    const p = pop(f, agent, T1);
    assert.ok(p.item !== c && p.item !== dep, `${agent}: ${JSON.stringify(p)}`); // never offered, nor what depends on it
  }
  const list = JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--decisions', '--json']).stdout);
  assert.deepEqual(list.map(x => [x.slug, x.team, x.decision_requested_by, x.question]), [[c, 't1', 'ann', Q]]);
  const text = ok(f, ['team', 'query', '--team', 't1', '--decisions']).stdout;
  assert.ok(text.startsWith('📋 1 owner decision(s) waiting — acme/demo, branch main;') && text.includes(`${c} (team t1)`), text);
  for (const line of Q.split('\n')) assert.ok(text.includes(`        ${line}\n`), line);
  assert.deepEqual(JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--decisions', '--json'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't2' }).stdout), []); // another team's decisions are not listed for t2
  up(f, c, '--decision', 'A: keep the old format');
  assert.deepEqual([fm(f, c).status, fm(f, c).refiner], ['refining', 'lead']); // the lead re-refines it with the decision
  assert.match(doc(f, c).body, /\nDECISION \d{4}-\d\d-\d\d: A: keep the old format\n/);
  assert.deepEqual(JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--decisions', '--json']).stdout), []);
  assert.notEqual(pop(f, 'bob', T1).item, c); // not a member's first-round refinement
  assert.deepEqual([pop(f, 'lead', T1).action, pop(f, 'lead', T1).item], ['refine', c]); // the lead re-refines it with the decision
});

test('test_incomplete_items_are_refined_by_the_lead_only: never claimed, reviewed or worked; the lead refines, then any member claims', () => {
  const f = fixture();
  const team = { SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main' };
  const base = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'];
  const newBare = (...args) => createdSlug(ok(f, ['new', ...args]).stdout);
  const gaps = {
    review_refs: newBare(...base('complete no review_refs'), '--estimate', '5', '--complexity', 'low', '--body', DOD),
    estimate_min: newBare(...base('complete no estimate'), '--review-refs', 'references/review/code.md', '--complexity', 'low', '--body', `no estimate here\n\n${DOD}`),
    definition_of_done: newBare(...base('complete placeholder only')), // the placeholder definition of done only (no refs, no estimate)
  };
  const deps = make(f, 'complete no depends_on');
  const path = join(f.folder, 'phases', `${deps}.md`);
  const { fm: dfm, body } = doc(f, deps);
  delete dfm.depends_on;
  store.write({ path, fm: dfm, body }, f.folder); // an item written before depends_on existed
  gaps.depends_on = deps;
  for (const slug of Object.values(gaps)) up(f, slug, '--set-team', 't1'); // team rules apply to the items of a team
  for (const [field, slug] of Object.entries(gaps)) { // a member never claims an item missing any one field
    assert.match(no(f, ['update', slug, '--claim', 'bob'], 'incomplete item, missing ').stdout, new RegExp(`missing [^:]*\\b${field}\\b`));
    no(f, ['update', slug, '--note', 'working on it', '--append', 'x'], 'only the team lead (lead) refines it', team); // `team update` always names its agent
  }
  const cl = JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--claimable', '--agent', 'bob', '--json']).stdout).map(x => x.slug);
  assert.ok(!Object.values(gaps).some(s => cl.includes(s)), cl.join(' '));
  const tn = { ...team, SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1' }; // the team session
  const bobs = run(f, ['team', 'pop', '--team', 't1', '--agent', 'bob', '--json'], { ...tn, SMOOTH_BACKLOG_CLI_AGENT: 'bob' }); // a member is never given an incomplete item to claim or work
  assert.ok(!bobs.stdout.includes('"action": "claim"') && !bobs.stdout.includes('never action it'), bobs.stdout); // the first-round refinement it is offered is refused for an incomplete item: only the lead refines it
  let p;
  p = pop(f, 'ann', { ...tn, SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'ann' }); // the lead is told to refine one, with the gaps
  assert.ok(p.action === 'refine' && Object.values(gaps).includes(p.item) && p.missing.length && p.instruction.includes('never action it'), JSON.stringify(p));
  assert.equal(pop(f, 'bob', { ...tn, SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'bob' }).action, 'refine'); // SMOOTH_BACKLOG_CLI_TEAM_LEAD names the lead
  no(f, ['update', gaps.estimate_min, '--claim', 'ann'], 'missing estimate_min', { ...team, SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'ann' }); // the lead may not claim it either
  ok(f, ['update', gaps.estimate_min, '--append', 'ESTIMATE: 5 min, complexity low. Gap: created without an estimate', '--by', 'lead'], { ...team, SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' }); // an older item's ESTIMATE line still counts
  ok(f, ['update', gaps.review_refs, '--set-review-refs', 'references/review/code.md', '--set-estimate', '9', '--set-layer', '2', '--by', 'lead'], { ...team, SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' });
  ok(f, ['update', gaps.depends_on, '--set-depends-on', 'none', '--by', 'lead'], { ...team, SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' });
  ok(f, ['update', gaps.definition_of_done, '--set-review-refs', 'references/review/code.md', '--set-estimate', '5', '--append', DOD, '--by', 'lead'], { ...team, SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' }); // a definition of done replaces the placeholder
  for (const s of Object.values(gaps)) assert.deepEqual(JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--agent', 'lead', '--phase', s, '--json']).stdout).missing, [], s); // complete now
  ok(f, ['update', gaps.estimate_min, '--claim', 'lead'], { ...tn, SMOOTH_BACKLOG_CLI_AGENT: 'lead' });
});

test('an incomplete item waiting in review-hitl is not offered to the lead for refinement', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  up(f, w, '--set-team', 't1'); up(f, w, '--claim', 'lead'); // the lead holds its work item: nothing comes before the lead's refinement of incomplete items
  const c = createdSlug(ok(f, ['new', '--name', 'bare child', '--split-from', w, '--depends-on', 'none']).stdout); // incomplete
  up(f, c, '--request-decision', 'What: which parser? Options: A, B. Recommendation: A.', '--by', 'ann');
  const env = { ...T1, SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main' };
  assert.deepEqual([pop(f, 'lead', env).action, pop(f, 'lead', env).item], ['idle', null]);
  up(f, c, '--decision', 'A');
  assert.notEqual(pop(f, 'bob', env).item, c);
  const p = pop(f, 'lead', env);
  assert.deepEqual([p.action, p.item], ['refine', c]); // back to refining: the lead re-refines it with the decision
});

test('refine-done is refused while a field or the definition of done is missing; event lines are no definition of done', () => {
  const f = fixture();
  const bare = (...args) => createdSlug(ok(f, ['new', ...args, '--depends-on', 'none']).stdout);
  const w = bare('--name', 'bare work item'); // no definition of done: its split child inherits only the placeholder
  up(f, w, '--set-team', 't1');
  const c = bare('--name', 'bare child', '--split-from', w);
  up(f, c, '--refine-start', '--by', 'ann'); // an incomplete item in refining: its refinement steps are allowed
  up(f, c, '--set-review-refs', 'references/review/code.md', '--by', 'ann');
  no(f, ['update', c, '--refine-done', '--by', 'ann', '--note', 'x'], 'still missing estimate_min, definition_of_done');
  up(f, c, '--set-estimate', '5', '--by', 'ann');
  no(f, ['update', c, '--refine-done', '--by', 'ann', '--note', 'x'], 'still missing definition_of_done: complete it before --refine-done');
  up(f, c, '--note', 'a note while refining', '--by', 'ann');
  no(f, ['update', c, '--refine-done', '--by', 'ann', '--note', 'x'], 'still missing definition_of_done'); // the event lines after the placeholder do not count
  no(f, ['update', c, '--request-review', 'any', '--note', 'x', '--by', 'ann'], 'before stage ready only its refinement steps run (--request-review refused)'); // only refinement steps
  no(f, ['update', c, '--claim', 'ann', '--force'], 'incomplete item, missing definition_of_done');
  no(f, ['update', c, '--status', 'in_progress', '--by', 'ann'], 'backlog team update takes no --status'); // nothing but a refinement while incomplete
  no(f, ['update', c, '--append', 'some notes', '--by', 'ann'], '--append refused'); // text that is no definition of done
  up(f, c, '--append', '  ESTIMATE: 5 min, complexity low', '--by', 'ann'); // an estimate line (indented, too) is refinement, and no definition of done
  no(f, ['update', c, '--refine-done', '--by', 'ann', '--note', 'x'], 'still missing definition_of_done');
  no(f, ['update', c, '--set-team', '', '--status', 'in_progress', '--by', 'ann'], 'backlog team update takes no --status'); // clearing the team does not lift the rule
  no(f, ['update', c, '--set-team', ''], 'an item in stage refining keeps a team'); // nor on its own
  no(f, ['update', c, '--set-team', 't9', '--status', 'in_progress', '--by', 'ann'], 'backlog team update takes no --status'); // another team in the same call: the rule reads the item as it was
  up(f, c, '--summary', 'a better summary', '--by', 'ann'); // the text fields are refinement
  up(f, c, '--append', DOD, '--by', 'ann');
  up(f, c, '--refine-done', '--by', 'ann', '--note', 'definition of done written');
  assert.equal(fm(f, c).status, 'refined');
});

test('a complete team item before stage ready takes only its refinement steps: no work, review, close or status change', () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'complete child', '--split-from', w); // complete, in refining
  no(f, ['update', c, '--status', 'in_progress'], 'backlog team update takes no --status');
  for (const [args, flag] of [[['--request-review', 'any', '--note', 'x'], '--request-review'],
    [['--close', '--summary', 'x', '--by', 'ann'], '--close'], [['--waiting', 'x', '--by', 'ann'], '--waiting']]) {
    no(f, ['update', c, ...args], `team t1 item in stage refining: before stage ready only its refinement steps run (${flag} refused)`);
  }
  up(f, c, '--refine-start', '--by', 'ann'); up(f, c, '--refine-done', '--by', 'ann', '--note', 'x');
  no(f, ['update', c, '--status', 'done'], 'backlog team update takes no --status');
  up(f, c, '--request-decision', 'Q?', '--by', 'ann');
  no(f, ['update', c, '--request-review', 'any', '--note', 'x'], 'item in stage review-hitl');
  up(f, c, '--note', 'notes and text fields stay open', '--summary', 'a better summary');
});

test("the lead never starts a first-round refinement nor is offered a member's child; the parent's definition of done is no child's", () => {
  const f = fixture();
  const w = make(f, 'team work item'); // its body has a definition of done
  up(f, w, '--set-team', 't1'); up(f, w, '--claim', 'lead'); // an unclaimed work item is offered to a member for refinement; the lead holds it
  const c = createdSlug(ok(f, ['new', '--name', 'bare child', '--split-from', w, '--depends-on', 'none']).stdout);
  assert.ok(doc(f, c).body.includes("- [ ] the test's check holds")); // the parent's definition of done, inherited as context
  assert.ok(!hasDefinitionOfDone(doc(f, c).body)); // only the placeholder is the child's own
  no(f, ['update', c, '--refine-start', '--by', 'lead'], 'a member, not the team lead, refines in the first round');
  assert.notEqual(pop(f, 'lead', T1).item, c); // a member's first-round refinement
  assert.deepEqual([pop(f, 'bob', T1).action, pop(f, 'bob', T1).item], ['refine', c]);
});

test('a split of a team item may keep the placeholder; only the lead changes an incomplete item of a bound session', () => {
  const f = fixture();
  const TR = { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main' };
  const w = make(f, 'team work item');
  up(f, w, '--set-team', 't1');
  const c = createdSlug(ok(f, ['new', '--name', 'bare child', '--split-from', w, '--depends-on', 'none']).stdout); // the split may keep the placeholder
  assert.deepEqual([fm(f, c).team, fm(f, c).status], ['t1', 'new']);
  const bare = createdSlug(ok(f, ['new', '--name', 'bare item', '--objective', 'o', '--summary', 's', '--depends-on', 'none']).stdout); // no team field
  no(f, ['update', bare, '--set-estimate', '5'], 'only the team lead (lead) refines it, not bob', { ...TR, SMOOTH_BACKLOG_CLI_AGENT: 'bob' });
  no(f, ['update', bare, '--set-estimate', '5', '--by', 'bob'], 'only the team lead (lead) refines it, not bob', { ...TR, SMOOTH_BACKLOG_CLI_AGENT: 'bob' });
  ok(f, ['update', bare, '--set-estimate', '5', '--by', 'lead'], { ...TR, SMOOTH_BACKLOG_CLI_AGENT: 'lead' });
});

test('backlog work --lead names only the lead the updates know; pop --lead keeps a member\'s lock', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  up(f, w, '--set-team', 't1'); up(f, w, '--claim', 'lead'); // an unclaimed work item is offered to a member for refinement; the lead holds it
  const c = make(f, 'child', '--split-from', w);
  const r = run(f, ['team', 'pop', '--team', 't1', '--agent', 'ann', '--lead', 'zed', '--json'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_AGENT: 'ann' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--lead zed is not the team lead of this session \(lead; SMOOTH_BACKLOG_CLI_TEAM_LEAD\)/);
  const ok2 = run(f, ['team', 'pop', '--team', 't1', '--agent', 'ann', '--lead', 'lead', '--json'], { ...T1, SMOOTH_BACKLOG_CLI_AGENT: 'ann' });
  assert.equal(ok2.status, 0, ok2.stdout + ok2.stderr);
  assert.deepEqual([JSON.parse(ok2.stdout).item, fm(f, c).refiner], [c, 'ann']);
});

test('the lead edits a refining item only as its refiner; an append of ESTIMATE lines plus text is no estimate note', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  up(f, w, '--set-team', 't1');
  const c = make(f, 'child', '--split-from', w);
  no(f, ['update', c, '--set-estimate', '5', '--by', 'lead'], 'a member, not the team lead, refines in the first round');
  const inc = createdSlug(ok(f, ['new', '--name', 'incomplete', '--objective', 'o', '--summary', 's', '--depends-on', 'none']).stdout);
  up(f, inc, '--set-team', 't1');
  const TR = { SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main' };
  no(f, ['update', inc, '--append', 'ESTIMATE: 5 min\nAdditional context', '--by', 'lead'], '--append', TR);
  ok(f, ['update', inc, '--append', 'ESTIMATE: 5 min', '--by', 'lead'], TR);
});

test('a refinement verdict changes nothing else in the same call', () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'child', '--split-from', w);
  up(f, c, '--refine-start', '--by', 'bob');
  up(f, c, '--refine-done', '--by', 'bob', '--note', 'x');
  up(f, c, '--request-refinement-review', '--by', 'lead');
  no(f, ['update', c, '--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok', '--append', '## Definition of done\n- [ ] other'], '--refinement-review records the verdict alone');
  assert.notEqual(fm(f, c).status, 'ready');
});

test('in stage refinement-review the item takes no edit until its verdict', () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'child', '--split-from', w);
  up(f, c, '--refine-start', '--by', 'bob');
  up(f, c, '--refine-done', '--by', 'bob', '--note', 'x');
  up(f, c, '--request-refinement-review', '--by', 'lead');
  no(f, ['update', c, '--append', '## Definition of done\n- [ ] other'], 'in stage refinement-review the item stays as the reviewer reads it');
  no(f, ['update', c, '--set-estimate', '9'], 'in stage refinement-review the item stays as the reviewer reads it');
});

test('the lead edits nothing of a first-round refinement, with a step or without', () => {
  const f = fixture();
  const w = work(f);
  const c = make(f, 'child', '--split-from', w);
  no(f, ['update', c, '--request-decision', 'Q?', '--set-estimate', '9', '--by', 'lead'], 'a member, not the team lead, refines in the first round');
});

test('the successful stage steps print exactly what they record', () => {
  const f = fixture();
  const w = make(f, 'work item');
  assert.equal(up(f, w, '--set-team', 't1').stdout, `✅ ${w} updated (team=t1)\n`);
  const c = make(f, 'child', '--split-from', w);
  const TS = s => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'TS');
  assert.equal(TS(up(f, c, '--refine-start', '--by', 'ann').stdout), `✅ ${c} updated (refine_started=Refinement started by ann at TS)\n`);
  assert.equal(TS(up(f, c, '--refine-done', '--by', 'ann', '--note', 'checked').stdout), `✅ ${c} updated (refined=Refined by ann at TS)\n`);
  assert.equal(TS(up(f, c, '--request-refinement-review', '--by', 'lead').stdout), `✅ ${c} updated (refinement_review_requested=Refinement review requested by lead at TS)\n`);
  assert.equal(TS(up(f, c, '--refinement-review', 'pass', '--by', 'rex', '--comments', 'ready').stdout),
    `✅ ${c} updated (refinement_reviewed=Refinement review by rex: COMPLETE: ready (TS))\n`);
  assert.equal(fm(f, c).status, 'ready');
});
