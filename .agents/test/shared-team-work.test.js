// Tests for the backlog CLI as the team members' only view of the backlog: `backlog query --phase` shows the whole item, `backlog work --agent <you>` gives the one next action
// marked as the agent's with the whole item, the hand-off, a changes verdict and a close end the agent's session, and in a
// team session a member acts only as itself while only the lead reassigns another agent's work. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseItem as parse, storedFm } from '../../src/shared/frontmatter.js';
import { cli, consumer, createdSlug, intoTeam, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-work-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({
    t1: { lead: 'lead', members: ['ann', 'bob', 'zed'], review: [{ team: 't1', count: 1 }, { team: 'reviewers', count: 1 }], refinement_review: [{ team: 'reviewers', count: 1 }] },
    reviewers: { lead: 'rex', members: ['rex', 'ria'] },
    t3: { lead: 'lead', members: ['ann', 'bob', 'zed'], review: [{ stage: 'peer', count: 1, anyone: true }] }, // one peer review, as an item of no team had
    t2: { lead: 'lead2', members: ['zed', 'nobody'], review: [] }, // another team, for the tests that ask as one
  }));
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { TEAM_LEAD: 'lead' };
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '', BACKLOG_SESSION: '', ...LEAD, ...env } };
  const actor = reader(args);
  if (args[0] === 'update') cli(['query', '--phase', args[1], ...(actor ? ['--agent', actor] : [])], o); // read before the write, as the acting agent or the env actor (seen.js)
  if (args[0] === 'new') { const i = args.indexOf('--split-from'); if (i > -1) cli(['query', '--phase', args[i + 1]], o); } // the split reads the parent's refinement state; the env actor's view of it must be fresh (seen.js)
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase ')[1].split(' ')[0];
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
const work = (f, agent, env, ...args) => { const r = run(f, ['team', 'pop', '--team', env?.TEAM_NAME || 't1', '--agent', agent, '--json', ...args], env?.TEAM_NAME ? { BACKLOG_AGENT: agent, ...env } : env); assert.ok([0, 3].includes(r.status), r.stdout + r.stderr); return { ...JSON.parse(r.stdout), status: r.status }; };
// a team item is refined (a member, the lead's review request, a reviewer's pass) before anyone claims it
const refined = (f, slug) => [['--refine-start', '--by', 'rfn'], ['--refine-done', '--by', 'rfn', '--note', 'refined'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']].forEach(a => ok(f, ['update', slug, ...a]));
// an item of team t1, refined: the team pop reaches only the items of its team
const inT1 = (f, slug) => { ok(f, ['update', slug, '--set-team', 't1']); refined(f, slug); return slug; };
// an item of team t1, ready to be claimed
const inTeam = (f, slug, status = 'ready') => intoTeam(slug, { cwd: f.cons, tmp: f.t, env: LEAD }, 't3', status);
const TM = agent => ({ TEAM_NAME: 't1', BACKLOG_AGENT: agent }); // a team session of the agent
const STOP = /🛑 (\S+): END THE SESSION NOW\. Reply with text only and make no further tool call/;

test('query --phase shows the whole item: the row, every front matter field and the body', () => {
  const f = fixture();
  const s = make(f, 'whole item');
  const j = JSON.parse(ok(f, ['query', '--phase', s, '--json']).stdout);
  assert.equal(j.slug, s);
  assert.deepEqual(j.front_matter, storedFm(fm(f, s)));
  for (const k of ['review_refs', 'depends_on', 'estimate_min', 'complexity', 'owner']) assert.ok(k in j.front_matter, k);
  assert.ok(j.body.includes('Body of whole item.') && j.body.includes("- [ ] the test's check holds"), j.body);
  assert.deepEqual(JSON.parse(ok(f, ['query', '--phase', s]).stdout), j); // the text view is the same object
});

test('backlog work: the next action marked as the agent\'s (claim, refinement start, review start) with the whole item', () => {
  const f = fixture();
  const job = inT1(f, make(f, 'plain job'));
  let w = work(f, 'bob');
  assert.deepEqual([w.action, w.item, w.marked, fm(f, job).claimed_by], ['claim', job, 'claimed for bob', 'bob']);
  assert.ok(w.body.includes('Body of plain job.') && w.front_matter.owner === 'bob', JSON.stringify(w));
  w = work(f, 'bob');
  assert.deepEqual([w.action, w.item, w.marked], ['continue', job, null]); // its own item: nothing to mark
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'bob']);
  w = work(f, 'zed');
  assert.deepEqual([w.action, w.item, w.marked, fm(f, job).status, fm(f, job).reviewer], ['review', job, `--start-review --agent zed`, 'reviewing', 'zed']);
  assert.ok(w.instruction.startsWith('you started the review: review the work of bob') && !w.instruction.includes('--start-review'), w.instruction);
  const parent = make(f, 'team work item');
  ok(f, ['update', parent, '--set-team', 't1']);
  ok(f, ['update', parent, '--claim', 'lead']); // the lead holds its work item; unclaimed, a member would be offered its refinement first
  const child = make(f, 'child', '--split-from', parent);
  w = work(f, 'ann', { TEAM_NAME: 't1' });
  assert.deepEqual([w.action, w.item, w.marked, fm(f, child).refiner], ['refine', child, '--refine-start --agent ann', 'ann']);
  assert.ok(w.instruction.startsWith('you started refining it: complete its team fields') && !w.instruction.includes('--refine-start'), w.instruction);
  const text = run(f, ['team', 'pop', '--team', 't1', '--agent', 'ann'], { TEAM_NAME: 't1' });
  assert.equal(text.status, 0, text.stderr);
  assert.ok(text.stdout.startsWith(`refine ${child}\n`) && text.stdout.includes(`--- item ${child}: front matter ---\n`) && text.stdout.includes('refiner: ann')
    && text.stdout.includes(`--- item ${child}: body ---\n`), text.stdout); // the refinement in progress: no new mark
  const idle = work(f, 'nobody', { TEAM_NAME: 't2' });
  assert.deepEqual([idle.action, idle.status, idle.front_matter], ['chunk', 0, null]); // nothing of its team: chunk work, no item
  const r = run(f, ['team', 'pop'], { BACKLOG_AGENT: '', TEAM_NAME: '' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /needs --team/);
});

test('the hand-off to review, a changes verdict and a close end the agent\'s session; not for the lead, nor with another active item', () => {
  const f = fixture();
  const [a, b] = ['first job', 'second job'].map(n => inTeam(f, make(f, n)));
  ok(f, ['update', a, '--claim', 'bob']);
  let r = ok(f, ['update', a, '--request-review', 'any', '--note', 'commit abc', '--by', 'bob']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'bob');
  r = ok(f, ['update', a, '--review', 'changes', '--by', 'zed', '--comments', 'fix x per references/review/code.md']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'zed'); // the reviewer's session ends with its verdict
  r = ok(f, ['update', a, '--note', 'fixed x', '--by', 'bob']);
  assert.doesNotMatch(r.stdout, STOP);
  ok(f, ['update', a, '--request-review', 'any', '--note', 'commit def', '--by', 'bob']);
  r = ok(f, ['update', a, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/code.md']);
  assert.doesNotMatch(r.stdout, STOP); // a pass leads to the close, which ends the session
  r = ok(f, ['update', a, '--close', '--summary', 'done', '--by', 'bob']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'bob');
  assert.match(r.stdout.trimEnd().split('\n').pop(), STOP); // the last line: nothing after it asks for more work
  assert.ok(r.stdout.includes('the team lead re-evaluates the order') && !r.stdout.includes('RE-EVALUATE the order now'), r.stdout);
  ok(f, ['update', b, '--claim', 'bob']);
  const c = inTeam(f, make(f, 'third job'));
  ok(f, ['update', c, '--claim', 'bob', '--force']); // bob holds two active items
  r = ok(f, ['update', b, '--request-review', 'any', '--note', 'commit ghi', '--by', 'bob']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'bob'); // every hand-off ends the session (c being active only spares the lock)
  const d = createdSlug(cli(['new', '--name', "the lead's item", '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--complexity', 'low', '--body', `Body.\n\n${DOD}`], { cwd: f.cons, tmp: f.t, plain: true, env: { BACKLOG_AGENT: 'lead' } }).stdout); // an item of no team
  ok(f, ['update', d, '--set-review-refs', 'references/review/code.md', '--by', 'lead']); // a review is asked for a complete item
  ok(f, ['update', d, '--claim', 'lead']);
  r = ok(f, ['update', d, '--request-review', 'any', '--note', 'x', '--by', 'lead']);
  assert.doesNotMatch(r.stdout, STOP); // the lead is no member
});

test('in a team session a member acts only as itself; only the lead reassigns or releases another agent\'s item, with a reason', () => {
  const f = fixture();
  const job = make(f, 'held job'); ok(f, ['update', job, '--set-team', 't1']); refined(f, job);
  const BOB = TM('bob'); const ANN = TM('ann'); const LEADS = TM('lead');
  no(f, ['update', job, '--claim', 'ann'], 'you are bob (BACKLOG_AGENT): a member acts only as itself, not as ann', BOB);
  ok(f, ['update', job, '--claim', 'ann'], ANN);
  no(f, ['update', job, '--release', 'ann'], 'not as ann', BOB);
  no(f, ['update', job, '--close', '--summary', 'x'], 'only the claimer (ann) closes it', BOB); // closing ann's item: `team update` acts as the session's agent, bob
  no(f, ['update', job, '--reassign', 'bob', '--by', 'bob', '--reason', 'mine now'], '--reassign --by <the team lead>', BOB);
  no(f, ['update', job, '--reassign', 'bob', '--by', 'lead'], '--reassign needs --reason', LEADS);
  let r = ok(f, ['update', job, '--reassign', 'bob', '--by', 'lead', '--reason', 'ann is on another team'], LEADS);
  assert.equal(fm(f, job).claimed_by, 'bob');
  assert.ok(readFileSync(join(f.folder, 'phases', `${job}.md`), 'utf8').includes('## Reassigned by lead from ann to bob at'), r.stdout);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'bob'], BOB);
  no(f, ['update', job, '--start-review', '--by', 'zed'], 'not as zed', ANN);
  no(f, ['update', job, '--start-review', '--by', 'ann'], 'the same session cannot review its own work', ANN); // ann claimed the job before the reassign (session_authors)
  ok(f, ['update', job, '--start-review', '--by', 'zed']); // a new session starts it
  const other = make(f, 'second job'); ok(f, ['update', other, '--set-team', 't1']); refined(f, other);
  ok(f, ['update', other, '--claim', 'bob', '--force'], BOB);
  no(f, ['update', other, '--release', 'bob', '--by', 'lead'], 'only the team lead (lead) does, with --reason', LEADS);
  r = ok(f, ['update', other, '--release', 'bob', '--by', 'lead', '--reason', 'bob is stopped'], LEADS);
  assert.equal(fm(f, other).claimed_by, '');
  assert.ok(readFileSync(join(f.folder, 'phases', `${other}.md`), 'utf8').includes('Released by lead for bob at'));
  no(f, ['update', other, '--claim', 'zed'], 'not as zed', BOB);
  ok(f, ['update', other, '--claim', 'zed']); // outside a team session the caller is not known: the named agent is taken as given
});

test('a member never takes over another agent\'s stale review; the lead hands it on with a reason', () => {
  const f = fixture();
  const job = inT1(f, make(f, 'reviewed job'));
  ok(f, ['update', job, '--claim', 'bob']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'bob']);
  ok(f, ['update', job, '--start-review', '--by', 'zed']);
  const STALE = { BACKLOG_REVIEW_STALE_SECONDS: '-1' };
  no(f, ['update', job, '--start-review', '--by', 'ann'], 'the review is stale: the team lead hands it on', STALE);
  assert.notEqual(work(f, 'ann', STALE).action, 'review');
  const p = JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', 'lead', '--json'], STALE).stdout);
  assert.deepEqual([p.action, p.item], ['reassign-review', job]);
  no(f, ['update', job, '--reassign-review', 'ann', '--by', 'bob', '--reason', 'x'], '--reassign-review --by <the team lead>');
  no(f, ['update', job, '--reassign-review', 'bob', '--by', 'lead', '--reason', 'x'], 'cannot review its own work');
  ok(f, ['update', job, '--reassign-review', 'ann', '--by', 'lead', '--reason', 'zed is stopped'], STALE);
  assert.deepEqual([fm(f, job).status, fm(f, job).reviewer], ['reviewing', 'ann']);
  assert.ok(readFileSync(join(f.folder, 'phases', `${job}.md`), 'utf8').includes('## Review reassigned by lead from zed to ann at'));
  ok(f, ['update', job, '--review', 'pass', '--by', 'ann', '--comments', 'fine per references/review/code.md']);
});

test('backlog work on chunk work of another repository prints that item too', () => {
  const f = fixture();
  const other = consumer(f.t, 'other', 'thing', 'main');
  const mine = make(f, 'held here');
  ok(f, ['update', mine, '--claim', 'zed']); // nothing claimable here
  writeFileSync(join(f.folder, 'backlog.scope'), 'refinement_scope: all\n');
  const r = cli(['new', ...NEW('chunk there'), '--chunk'], { cwd: other, tmp: f.t, env: LEAD });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const far = r.stdout.split('created phase ')[1].split(' ')[0];
  const w = work(f, 'ann', {}, '--scope', 'all');
  assert.deepEqual([w.action, w.item, w.repository, w.front_matter.phase], ['chunk', far, 'other/thing', far]);
  assert.ok(w.body.includes('Body of chunk there.'), w.body); // the whole item, read from that repository's folder
});

// the review, close and lead rules
test('only the claimer closes its item, else the team lead; the close-now line names the claimer, else the lead, never the reviewer', () => {
  const f = fixture();
  const job = inTeam(f, make(f, 'close job'));
  ok(f, ['update', job, '--claim', 'bob']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'bob']);
  const r = ok(f, ['update', job, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/code.md']);
  assert.ok(r.stdout.includes('CLOSE NOW: bob closes it') && r.stdout.includes('if the claimer has not, the team lead closes it when available (backlog team update')
    && !r.stdout.includes('zed closes it'), r.stdout);
  no(f, ['update', job, '--close', '--summary', 'x', '--by', 'zed'], 'only the claimer (bob) closes it, else the team lead (lead); not zed');
  ok(f, ['update', job, '--close', '--summary', 'done', '--by', 'lead']);
  assert.equal(fm(f, job).status, 'closed');
});

test("the lead never claims, waits without polling while its team works, keeps its close and rework, and closes the work item when every item is done", () => {
  const f = fixture();
  const T = { TEAM_NAME: 't1' };
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  ok(f, ['update', w, '--claim', 'lead']);
  const pl = () => JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', 'lead', '--json'], T).stdout);
  const kid = make(f, 'ready child'); // a team item without a stage is unrefined; refined first, it is ready
  ok(f, ['update', kid, '--set-team', 't1']);
  refined(f, kid);
  let p = pl();
  assert.deepEqual([p.action, p.item], ['idle', null]); // no claim of kid, no busy continue of the work item
  assert.match(p.instruction, /^your team works on 1 item\(s\) \(\d+\): end your turn now with a text-only reply and no tool call; do not poll/);
  ok(f, ['update', kid, '--claim', 'bob']);
  assert.equal(pl().action, 'idle');
  ok(f, ['update', kid, '--request-review', 'any', '--note', 'x', '--by', 'bob']);
  ok(f, ['update', kid, '--review', 'pass', '--by', 'zed', '--comments', 'ok per references/review/code.md']);
  ok(f, ['update', kid, '--start-review', '--by', 'rex']);
  ok(f, ['update', kid, '--review', 'pass', '--by', 'rex', '--comments', 'ok per references/review/code.md']);
  ok(f, ['update', kid, '--close', '--summary', 'kid done', '--by', 'bob']);
  p = pl();
  assert.deepEqual([p.action, p.item], ['continue', w]); // every item of the team is done
  assert.ok(p.instruction.startsWith(`every item of team t1 is done: have ${fm(f, w).seq} reviewed`), p.instruction);
  ok(f, ['update', w, '--request-review', 'any', '--note', 'the items and their evidence', '--by', 'lead']);
  ok(f, ['update', w, '--review', 'changes', '--by', 'zed', '--comments', 'one more test per references/review/code.md']);
  const kid2 = make(f, 'second child');
  ok(f, ['update', kid2, '--set-team', 't1']); // the team works again
  p = pl();
  assert.deepEqual([p.action, p.item], ['continue', w]); // a changes-requested item of the lead's keeps its rework
  assert.ok(p.instruction.startsWith('you hold it'), p.instruction);
});

test('backlog team new files an item of its team in stage refining, in a team session or not; a plain new makes an item of no team', () => {
  const f = fixture();
  const team = { TEAM_NAME: 't1', TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  const base = ['new', '--name', 'x', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--body', DOD];
  const mine = r => fm(f, createdSlug(r.stdout));
  assert.deepEqual([mine(ok(f, [...base, '--team', 't1'], team)).team, mine(ok(f, [...base, '--team', 't1', '--name', 'y'], team)).status], ['t1', 'new']);
  assert.equal(mine(ok(f, [...base, '--name', 'z'])).team, undefined); // outside a team session, and with no --team, the plain command: an item of no team
  assert.equal(mine(ok(f, [...base, '--name', 'w'], { TEAM_REPOSITORY: 'acme/demo' })).team, undefined); // TEAM_REPOSITORY alone: the plain command ignores it
});

test('the claimer never reviews its own item; a reviewed item finishes only through --close; an unclaimed team item is closed by the lead', () => {
  const f = fixture();
  const job = make(f, 'reviewed job');
  ok(f, ['update', job, '--claim', 'bob']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'x', '--by', 'bob']);
  no(f, ['update', job, '--start-review', '--by', 'bob'], 'bob: the same session cannot review its own work; a new session may');
  no(f, ['update', job, '--review', 'pass', '--by', 'bob', '--comments', 'fine per references/review/code.md'], 'cannot review its own work');
  no(f, ['update', job, '--review', 'pass', '--by', 'zed', '--comments', 'fine'], 'must cite at least one of the item');
  ok(f, ['update', job, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/code.md']);
  ok(f, ['update', job, '--close', '--summary', 'done', '--by', 'bob']);
  const t = make(f, 'team job');
  ok(f, ['update', t, '--set-team', 't1']);
  refined(f, t);
  ok(f, ['update', t, '--claim', 'bob']);
  ok(f, ['update', t, '--request-review', 'any', '--note', 'x', '--by', 'bob']);
  ok(f, ['update', t, '--review', 'pass', '--by', 'zed', '--comments', 'ok per references/review/code.md']);
  ok(f, ['update', t, '--start-review', '--by', 'rex']);
  ok(f, ['update', t, '--review', 'pass', '--by', 'rex', '--comments', 'ok per references/review/code.md']);
  ok(f, ['update', t, '--release', 'bob']);
  no(f, ['update', t, '--close', '--summary', 'x', '--by', 'zed'], 'nobody holds this item of team t1: the team lead (lead) closes it; not zed');
  ok(f, ['update', t, '--close', '--summary', 'done', '--by', 'lead']);
});

test("the lead's close and rework are never hidden by its team's refinement review or a stale review", () => {
  const f = fixture();
  const T = { TEAM_NAME: 't1' };
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  ok(f, ['update', w, '--claim', 'lead']);
  ok(f, ['update', w, '--request-review', 'any', '--note', 'x', '--by', 'lead']);
  ok(f, ['update', w, '--review', 'pass', '--by', 'zed', '--comments', 'ok per references/review/code.md']);
  ok(f, ['update', w, '--start-review', '--by', 'rex']);
  ok(f, ['update', w, '--review', 'pass', '--by', 'rex', '--comments', 'ok per references/review/code.md']);
  const c = make(f, 'child', '--split-from', w);
  for (const step of [['--refine-start', '--by', 'bob'], ['--refine-done', '--by', 'bob', '--note', 'x']]) ok(f, ['update', c, ...step]);
  const p = JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', 'lead', '--json'], T).stdout);
  assert.deepEqual([p.action, p.item], ['continue', w]); // the passed work item's close comes first
  assert.ok(p.instruction.startsWith(`close ${fm(f, w).seq} with --close --summary`), p.instruction);
  ok(f, ['update', w, '--close', '--summary', 'done', '--by', 'lead']);
  assert.equal(JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', 'lead', '--json'], T).stdout).action, 'refinement-review');
});

test('the lead waits while only an incomplete item of its team is open', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  ok(f, ['update', w, '--claim', 'lead']);
  const half = NEW('incomplete child').filter((x, i, all) => x !== '--estimate' && all[i - 1] !== '--estimate');
  ok(f, ['new', ...half, '--team', 't1']); // no estimate: incomplete, never dispatched to a member
  const p = JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', 'lead', '--json'], { TEAM_NAME: 't1' }).stdout);
  assert.notDeepEqual([p.action, p.item], ['continue', w], p.instruction); // its team's work is open: no busy continue
});

test('a refinement in progress is active work; an unclaimed hand-off ends the caller\'s session', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const c = make(f, 'child', '--split-from', w);
  ok(f, ['update', c, '--refine-start', '--by', 'bob']);
  const x = make(f, 'ready team item');
  ok(f, ['update', x, '--set-team', 't1']);
  refined(f, x);
  no(f, ['update', x, '--claim', 'bob'], `bob holds 1 active item(s): ${c}`);
  ok(f, ['update', x, '--claim', 'zed']);
  ok(f, ['update', x, '--request-review', 'any', '--note', 'x', '--by', 'zed']);
  ok(f, ['update', x, '--review', 'pass', '--by', 'ann', '--comments', 'ok per references/review/code.md']);
  const u = make(f, 'unclaimed item');
  const r = ok(f, ['update', u, '--request-review', 'any', '--note', 'y', '--by', 'ann'], { BACKLOG_AGENT: 'ann' });
  assert.equal(STOP.exec(r.stdout)?.[1], 'ann');
});

test('a member acts only as itself on an unclaimed item; a request outside a team session ends the session of --by; only the lead refines an incomplete team item; a busy lead gets no chunk', () => {
  const f = fixture();
  const u = make(f, 'unclaimed item');
  no(f, ['update', u, '--request-review', 'any', '--note', 'y', '--by', 'zed'], 'not as zed', TM('ann'));
  const r = ok(f, ['update', u, '--request-review', 'any', '--note', 'y', '--by', 'zed']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'zed');
  const half = NEW('incomplete team item').filter((x, i, all) => x !== '--estimate' && all[i - 1] !== '--estimate');
  const inc = ok(f, ['new', ...half]).stdout.split('created phase ')[1].split(' ')[0];
  ok(f, ['update', inc, '--set-team', 't1']); // stage-less and incomplete
  no(f, ['update', inc, '--set-estimate', '5'], 'only the team lead (lead) refines it, not bob', TM('bob'));
  ok(f, ['update', inc, '--set-estimate', '5'], TM('lead'));
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  ok(f, ['update', w, '--claim', 'lead']);
  make(f, 'chunk item', '--chunk');
  const p = JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', 'lead', '--json'], { TEAM_NAME: 't1' }).stdout);
  assert.notEqual(p.action, 'chunk', p.instruction); // its team works on inc: the lead waits
});

test('an unclaimed team item names who asks for its review, who then never reviews it; an agent with active work is offered no refinement', () => {
  const f = fixture();
  const x = make(f, 'unclaimed team item');
  ok(f, ['update', x, '--set-team', 't1']);
  refined(f, x);
  ok(f, ['update', x, '--request-review', 'any', '--note', 'y', '--by', 'ann']);
  assert.equal(fm(f, x).review_author, 'ann');
  no(f, ['update', x, '--start-review', '--by', 'ann'], 'ann');
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const c = make(f, 'child', '--split-from', w);
  const job = make(f, 'bob job');
  ok(f, ['update', job, '--set-team', 't1']);
  refined(f, job);
  ok(f, ['update', job, '--claim', 'bob']);
  ok(f, ['update', job, '--waiting', 'a run', '--by', 'bob']);
  ok(f, ['update', inTeam(f, make(f, 'other branch work')), '--claim', 'bob', '--force']); // active work
  const p = JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', 'bob', '--json'], { TEAM_NAME: 't1' }).stdout);
  assert.notEqual(p.item, c, p.instruction);
});

test('a review in progress is not requested again by its holder', () => {
  const f = fixture();
  const x = make(f, 'reviewed item');
  ok(f, ['update', x, '--claim', 'bob']);
  ok(f, ['update', x, '--request-review', 'any', '--note', 'n', '--by', 'bob']);
  ok(f, ['update', x, '--start-review', '--by', 'zed']);
  no(f, ['update', x, '--request-review', 'any', '--note', 'again', '--by', 'bob'], 'zed is reviewing it since');
  assert.deepEqual([fm(f, x).status, fm(f, x).reviewer], ['reviewing', 'zed']);
});

test('backlog work answers only for the team caller itself', () => {
  const f = fixture();
  const x = make(f, 'zed job');
  ok(f, ['update', x, '--claim', 'zed']);
  const r = run(f, ['team', 'pop', '--team', 't1', '--agent', 'zed', '--json'], TM('bob'));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /you are bob \(BACKLOG_AGENT\): team pop answers only for yourself, not for zed/);
});

test("the lead asking for the review of a member's item ends no session and locks nobody", () => {
  const f = fixture();
  const x = make(f, 'member job');
  ok(f, ['update', x, '--set-team', 't1']);
  refined(f, x);
  ok(f, ['update', x, '--claim', 'bob']);
  const r = ok(f, ['update', x, '--request-review', 'any', '--note', 'n', '--by', 'lead']);
  assert.doesNotMatch(r.stdout, STOP);
});

test('a member names nobody else as the one asking for a review', () => {
  const f = fixture();
  const x = make(f, 'member job');
  ok(f, ['update', x, '--set-team', 't1']);
  refined(f, x);
  ok(f, ['update', x, '--claim', 'bob']);
  no(f, ['update', x, '--request-review', 'any', '--note', 'n', '--by', 'lead'], 'not as lead', TM('bob'));
  const r = ok(f, ['update', x, '--request-review', 'any', '--note', 'n', '--by', 'bob'], TM('bob'));
  assert.equal(STOP.exec(r.stdout)?.[1], 'bob');
});

test("a member asks for no review of another member's item", () => {
  const f = fixture();
  const x = make(f, 'bob job');
  ok(f, ['update', x, '--claim', 'bob']);
  no(f, ['update', x, '--request-review', 'any', '--note', 'n', '--by', 'zed'], 'bob holds it: only the holder, or the team lead, asks for its review (not zed)');
});
