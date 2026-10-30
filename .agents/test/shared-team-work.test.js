// Tests for item 033: the backlog CLI as the team members' only view of the backlog (spec 2026-10-28-pr1-learnings.md
// sections 5, 7 and 8): `backlog query --phase` shows the whole item, `backlog work --agent <you>` gives the one next action
// marked as the agent's with the whole item, the hand-off, a changes verdict and a close end the agent's session, and in a
// qwen-code team session a member acts only as itself while only the lead reassigns another agent's work. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-work-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { TEAM_LEAD: 'lead' };
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o); // read before the write (seen.js)
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
const work = (f, agent, env, ...args) => { const r = run(f, ['work', '--agent', agent, '--json', ...args], env); assert.ok([0, 3].includes(r.status), r.stdout + r.stderr); return { ...JSON.parse(r.stdout), status: r.status }; };
const STOP = /🛑 (\S+): END THE SESSION NOW\. Reply with text only and make no further tool call/;

test('query --phase shows the whole item: the row, every front matter field and the body', () => {
  const f = fixture();
  const s = make(f, 'whole item');
  const j = JSON.parse(ok(f, ['query', '--phase', s, '--json']).stdout);
  assert.equal(j.slug, s);
  assert.deepEqual(j.front_matter, fm(f, s));
  for (const k of ['review_refs', 'depends_on', 'estimate_min', 'complexity', 'claimed_by', 'review_state']) assert.ok(k in j.front_matter, k);
  assert.ok(j.body.includes('Body of whole item.') && j.body.includes("- [ ] the test's check holds"), j.body);
  assert.deepEqual(JSON.parse(ok(f, ['query', '--phase', s]).stdout), j); // the text view is the same object
});

test('backlog work: the next action marked as the agent\'s (claim, refinement start, review start) with the whole item', () => {
  const f = fixture();
  const job = make(f, 'plain job');
  let w = work(f, 'archy');
  assert.deepEqual([w.action, w.item, w.marked, fm(f, job).claimed_by], ['claim', job, 'claimed for archy', 'archy']);
  assert.ok(w.body.includes('Body of plain job.') && w.front_matter.claimed_by === 'archy', JSON.stringify(w));
  w = work(f, 'archy');
  assert.deepEqual([w.action, w.item, w.marked], ['continue', job, null]); // its own item: nothing to mark
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy']);
  w = work(f, 'zed');
  assert.deepEqual([w.action, w.item, w.marked, fm(f, job).review_state, fm(f, job).reviewer], ['review', job, `--start-review --by zed`, 'in_review', 'zed']);
  assert.ok(w.instruction.startsWith('you started the review: review the work of archy') && !w.instruction.includes('--start-review'), w.instruction);
  const parent = make(f, 'team work item');
  ok(f, ['update', parent, '--set-team', 't1']);
  const child = make(f, 'child', '--split-from', parent);
  w = work(f, 'cody', { TEAM_NAME: 't1' });
  assert.deepEqual([w.action, w.item, w.marked, fm(f, child).refiner], ['refine', child, '--refine-start --by cody', 'cody']);
  assert.ok(w.instruction.startsWith('you started refining it: complete its team fields') && !w.instruction.includes('--refine-start'), w.instruction);
  const text = run(f, ['work', '--agent', 'cody'], { TEAM_NAME: 't1' });
  assert.equal(text.status, 0, text.stderr);
  assert.ok(text.stdout.startsWith(`refine ${child}\n`) && text.stdout.includes(`--- item ${child}: front matter ---\n`) && text.stdout.includes('refiner: cody')
    && text.stdout.includes(`--- item ${child}: body ---\n`), text.stdout); // the refinement in progress: no new mark
  ok(f, ['update', parent, '--claim', 'lead']);
  const idle = work(f, 'nobody', { TEAM_NAME: 't2' });
  assert.deepEqual([idle.action, idle.status, idle.front_matter], ['chunk', 0, null]); // nothing of its team: chunk work, no item
  const r = run(f, ['work']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /work needs --agent/);
});

test('the hand-off to review, a changes verdict and a close end the agent\'s session; not for the lead, nor with another active item', () => {
  const f = fixture();
  const [a, b] = ['first job', 'second job'].map(n => make(f, n));
  ok(f, ['update', a, '--claim', 'archy']);
  let r = ok(f, ['update', a, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'archy');
  r = ok(f, ['update', a, '--review', 'changes', '--by', 'zed', '--comments', 'fix x per references/review/code.md']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'zed'); // the reviewer's session ends with its verdict
  r = ok(f, ['update', a, '--note', 'fixed x', '--by', 'archy']);
  assert.doesNotMatch(r.stdout, STOP);
  ok(f, ['update', a, '--request-review', 'any', '--note', 'commit def', '--by', 'archy']);
  r = ok(f, ['update', a, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/code.md']);
  assert.doesNotMatch(r.stdout, STOP); // a pass leads to the close, which ends the session
  r = ok(f, ['update', a, '--close', '--summary', 'done', '--by', 'archy']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'archy');
  assert.match(r.stdout.trimEnd().split('\n').pop(), STOP); // the last line: nothing after it asks for more work
  assert.ok(r.stdout.includes('the team lead re-evaluates the order') && !r.stdout.includes('RE-EVALUATE the order now'), r.stdout);
  ok(f, ['update', b, '--claim', 'archy']);
  const c = make(f, 'third job');
  ok(f, ['update', c, '--claim', 'archy', '--force']); // archy holds two active items
  r = ok(f, ['update', b, '--request-review', 'any', '--note', 'commit ghi', '--by', 'archy']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'archy'); // spec section 7: every hand-off ends the session (c being active only spares the lock)
  const d = make(f, "the lead's item");
  ok(f, ['update', d, '--claim', 'lead']);
  r = ok(f, ['update', d, '--request-review', 'any', '--note', 'x', '--by', 'lead']);
  assert.doesNotMatch(r.stdout, STOP); // the lead is no member
});

test('in a team session a member acts only as itself; only the lead reassigns or releases another agent\'s item, with a reason', () => {
  const f = fixture();
  const job = make(f, 'held job');
  const ARCHY = { QWEN_CODE_AGENT_ID: 'archy@t1' }; const CODY = { QWEN_CODE_AGENT_ID: 'cody@t1' }; const LEADS = { QWEN_CODE_AGENT_ID: 'lead@t1' };
  no(f, ['update', job, '--claim', 'cody'], 'you are archy (QWEN_CODE_AGENT_ID): a member acts only as itself, not as cody', ARCHY);
  ok(f, ['update', job, '--claim', 'cody'], CODY);
  no(f, ['update', job, '--release', 'cody'], 'not as cody', ARCHY);
  no(f, ['update', job, '--close', '--summary', 'x'], 'not as cody', ARCHY); // closing cody's item without --by is acting as cody
  no(f, ['update', job, '--reassign', 'archy', '--by', 'archy', '--reason', 'mine now'], '--reassign --by <the team lead>', ARCHY);
  no(f, ['update', job, '--reassign', 'archy', '--by', 'lead'], '--reassign needs --reason', LEADS);
  let r = ok(f, ['update', job, '--reassign', 'archy', '--by', 'lead', '--reason', 'cody is on another team'], LEADS);
  assert.equal(fm(f, job).claimed_by, 'archy');
  assert.ok(readFileSync(join(f.folder, 'phases', `${job}.md`), 'utf8').includes('## Reassigned by lead from cody to archy at'), r.stdout);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy'], ARCHY);
  no(f, ['update', job, '--start-review', '--by', 'zed'], 'not as zed', CODY);
  ok(f, ['update', job, '--start-review', '--by', 'cody'], CODY);
  const other = make(f, 'second job');
  ok(f, ['update', other, '--claim', 'archy', '--force'], ARCHY);
  no(f, ['update', other, '--release', 'archy', '--by', 'lead'], 'only the team lead (lead) does, with --reason', LEADS);
  r = ok(f, ['update', other, '--release', 'archy', '--by', 'lead', '--reason', 'archy is stopped'], LEADS);
  assert.equal(fm(f, other).claimed_by, '');
  assert.ok(readFileSync(join(f.folder, 'phases', `${other}.md`), 'utf8').includes('Released by lead for archy at'));
  no(f, ['update', other, '--claim', 'zed'], 'not as zed', { QWEN_CODE_AGENT_ID: 'archy@t1' });
  ok(f, ['update', other, '--claim', 'zed']); // outside a qwen-code team session the caller is not known: the named agent is taken as given
});

test('a member never takes over another agent\'s stale review; the lead hands it on with a reason', () => {
  const f = fixture();
  const job = make(f, 'reviewed job');
  ok(f, ['update', job, '--claim', 'archy']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy']);
  ok(f, ['update', job, '--start-review', '--by', 'zed']);
  const STALE = { BACKLOG_REVIEW_STALE_SECONDS: '-1' };
  no(f, ['update', job, '--start-review', '--by', 'cody'], 'the review is stale: the team lead hands it on', STALE);
  assert.notEqual(work(f, 'cody', STALE).action, 'review');
  const p = JSON.parse(run(f, ['pop', '--agent', 'lead', '--json'], STALE).stdout);
  assert.deepEqual([p.action, p.item], ['reassign-review', job]);
  no(f, ['update', job, '--reassign-review', 'cody', '--by', 'archy', '--reason', 'x'], '--reassign-review --by <the team lead>');
  no(f, ['update', job, '--reassign-review', 'archy', '--by', 'lead', '--reason', 'x'], 'cannot review its own work');
  ok(f, ['update', job, '--reassign-review', 'cody', '--by', 'lead', '--reason', 'zed is stopped'], STALE);
  assert.deepEqual([fm(f, job).review_state, fm(f, job).reviewer], ['in_review', 'cody']);
  assert.ok(readFileSync(join(f.folder, 'phases', `${job}.md`), 'utf8').includes('## Review reassigned by lead from zed to cody at'));
  ok(f, ['update', job, '--review', 'pass', '--by', 'cody', '--comments', 'fine per references/review/code.md']);
});

test('backlog work on chunk work of another repository prints that item too', () => {
  const f = fixture();
  const other = consumer(f.t, 'other', 'thing', 'main');
  const mine = make(f, 'held here');
  ok(f, ['update', mine, '--claim', 'zed']); // nothing claimable here
  writeFileSync(join(f.folder, 'backlog.scope'), 'refinement_scope: all\n');
  const r = cli(['new', ...NEW('chunk there'), '--chunk'], { cwd: other, tmp: f.t, env: LEAD });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const far = r.stdout.split('created phase phases/')[1].split('.md')[0];
  const w = work(f, 'cody', {}, '--scope', 'all');
  assert.deepEqual([w.action, w.item, w.repository, w.front_matter.phase], ['chunk', far, 'other/thing', far]);
  assert.ok(w.body.includes('Body of chunk there.'), w.body); // the whole item, read from that repository's folder
});

// item 039: the review, close and lead rules (spec sections 2, 6, 8, 9)
test('only the claimer closes its item, else the team lead; the close-now line names the claimer, else the lead, never the reviewer', () => {
  const f = fixture();
  const job = make(f, 'close job');
  ok(f, ['update', job, '--claim', 'archy']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy']);
  const r = ok(f, ['update', job, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/code.md']);
  assert.ok(r.stdout.includes('CLOSE NOW: archy closes it') && r.stdout.includes('if the claimer has not, the team lead closes it when available (--close --by <lead>')
    && !r.stdout.includes('zed closes it'), r.stdout);
  no(f, ['update', job, '--close', '--summary', 'x', '--by', 'zed'], 'only the claimer (archy) closes it, else the team lead (lead); not zed');
  ok(f, ['update', job, '--close', '--summary', 'done', '--by', 'lead']);
  assert.equal(fm(f, job).status, 'done');
});

test("the lead never claims, waits without polling while its team works, keeps its close and rework, and closes the work item when every item is done", () => {
  const f = fixture();
  const T = { TEAM_NAME: 't1' };
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  ok(f, ['update', w, '--claim', 'lead']);
  const pl = () => JSON.parse(run(f, ['pop', '--agent', 'lead', '--json'], T).stdout);
  const kid = make(f, 'ready child'); // a team item without a stage: ready
  ok(f, ['update', kid, '--set-team', 't1']);
  let p = pl();
  assert.deepEqual([p.action, p.item], ['idle', null]); // no claim of kid, no busy continue of the work item
  assert.match(p.instruction, /^your team works on 1 item\(s\) \(\d+\): end your turn now with a text-only reply and no tool call; do not poll/);
  ok(f, ['update', kid, '--claim', 'archy']);
  assert.equal(pl().action, 'idle');
  ok(f, ['update', kid, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  ok(f, ['update', kid, '--review', 'pass', '--by', 'zed', '--comments', 'ok per references/review/code.md']);
  ok(f, ['update', kid, '--close', '--summary', 'kid done', '--by', 'archy']);
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

test('in a team session an item names its review documents at creation, unless it starts in stage refining', () => {
  const f = fixture();
  const team = { TEAM_NAME: 't1', TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  const base = ['new', '--name', 'x', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--body', DOD];
  no(f, base, 'in a team session an item names its review documents at creation', team);
  ok(f, [...base, '--review-refs', 'references/review/code.md'], team);
  ok(f, [...base, '--team', 't1'], team);
  ok(f, base); // outside a team session the item is refined later
  ok(f, base, { TEAM_REPOSITORY: 'acme/demo' }); // TEAM_REPOSITORY alone writes into a repository's folder: no team session
});

test('039: the claimer never reviews its own item; a reviewed item finishes only through --close; an unclaimed team item is closed by the lead', () => {
  const f = fixture();
  const job = make(f, 'reviewed job');
  ok(f, ['update', job, '--claim', 'archy']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  no(f, ['update', job, '--start-review', '--by', 'archy'], 'archy claimed this item and cannot review its own work');
  no(f, ['update', job, '--review', 'pass', '--by', 'archy', '--comments', 'fine per references/review/code.md'], 'cannot review its own work');
  no(f, ['update', job, '--review', 'pass', '--by', 'zed', '--comments', 'fine'], 'must cite at least one of the item');
  ok(f, ['update', job, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/code.md']);
  no(f, ['update', job, '--status', 'done'], 'has review_refs and a passing review; finish it with --close');
  ok(f, ['update', job, '--close', '--summary', 'done', '--by', 'archy']);
  const t = make(f, 'team job');
  ok(f, ['update', t, '--set-team', 't1']);
  ok(f, ['update', t, '--claim', 'archy']);
  ok(f, ['update', t, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  ok(f, ['update', t, '--review', 'pass', '--by', 'zed', '--comments', 'ok per references/review/code.md']);
  ok(f, ['update', t, '--release', 'archy']);
  no(f, ['update', t, '--close', '--summary', 'x', '--by', 'zed'], 'nobody holds this item of team t1: the team lead (lead) closes it; not zed');
  ok(f, ['update', t, '--close', '--summary', 'done', '--by', 'lead']);
});

test("039: the lead's close and rework are never hidden by its team's refinement review or a stale review", () => {
  const f = fixture();
  const T = { TEAM_NAME: 't1' };
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  ok(f, ['update', w, '--claim', 'lead']);
  ok(f, ['update', w, '--request-review', 'any', '--note', 'x', '--by', 'lead']);
  ok(f, ['update', w, '--review', 'pass', '--by', 'zed', '--comments', 'ok per references/review/code.md']);
  const c = make(f, 'child', '--split-from', w);
  for (const step of [['--refine-start', '--by', 'archy'], ['--refine-done', '--by', 'archy', '--note', 'x']]) ok(f, ['update', c, ...step]);
  const p = JSON.parse(run(f, ['pop', '--agent', 'lead', '--json'], T).stdout);
  assert.deepEqual([p.action, p.item], ['continue', w]); // the passed work item's close comes first
  assert.ok(p.instruction.startsWith(`close ${fm(f, w).seq} with --close --summary`), p.instruction);
  ok(f, ['update', w, '--close', '--summary', 'done', '--by', 'lead']);
  assert.equal(JSON.parse(run(f, ['pop', '--agent', 'lead', '--json'], T).stdout).action, 'refinement-review');
});

test('039: in a team session a split from an item without a team names its review documents too', () => {
  const f = fixture();
  const plain = make(f, 'plain parent');
  const team = { TEAM_NAME: 't1', TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  no(f, ['new', '--split-from', plain, '--depends-on', 'none', '--body', DOD], 'in a team session an item names its review documents at creation', team);
  ok(f, ['new', '--split-from', plain, '--depends-on', 'none', '--body', DOD, '--review-refs', 'references/review/code.md'], team);
});

test('the lead waits while only an incomplete item of its team is open', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  ok(f, ['update', w, '--claim', 'lead']);
  const half = NEW('incomplete child').filter((x, i, all) => x !== '--estimate' && all[i - 1] !== '--estimate');
  ok(f, ['new', ...half, '--team', 't1']); // no estimate: incomplete, never dispatched to a member
  const p = JSON.parse(run(f, ['pop', '--agent', 'lead', '--json'], { TEAM_NAME: 't1' }).stdout);
  assert.notDeepEqual([p.action, p.item], ['continue', w], p.instruction); // its team's work is open: no busy continue
});

test('a refinement in progress is active work; an unclaimed hand-off ends the caller\'s session', () => {
  const f = fixture();
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const c = make(f, 'child', '--split-from', w);
  ok(f, ['update', c, '--refine-start', '--by', 'archy']);
  const x = make(f, 'ready team item');
  ok(f, ['update', x, '--set-team', 't1']);
  no(f, ['update', x, '--claim', 'archy'], `archy holds 1 active item(s): ${c}`);
  ok(f, ['update', x, '--claim', 'zed']);
  ok(f, ['update', x, '--request-review', 'any', '--note', 'x', '--by', 'zed']);
  ok(f, ['update', x, '--review', 'pass', '--by', 'cody', '--comments', 'ok per references/review/code.md']);
  const u = make(f, 'unclaimed item');
  const r = ok(f, ['update', u, '--request-review', 'any', '--note', 'y', '--by', 'cody'], { QWEN_CODE_AGENT_ID: 'cody@t1' });
  assert.equal(STOP.exec(r.stdout)?.[1], 'cody');
});

test('a member acts only as itself on an unclaimed item; a request outside a Qwen session ends the session of --by; only the lead refines an incomplete team item; a busy lead gets no chunk', () => {
  const f = fixture();
  const u = make(f, 'unclaimed item');
  no(f, ['update', u, '--request-review', 'any', '--note', 'y', '--by', 'zed'], 'not as zed', { QWEN_CODE_AGENT_ID: 'cody@t1' });
  const r = ok(f, ['update', u, '--request-review', 'any', '--note', 'y', '--by', 'zed']);
  assert.equal(STOP.exec(r.stdout)?.[1], 'zed');
  const half = NEW('incomplete team item').filter((x, i, all) => x !== '--estimate' && all[i - 1] !== '--estimate');
  const inc = ok(f, ['new', ...half]).stdout.split('created phase phases/')[1].split('.md')[0];
  ok(f, ['update', inc, '--set-team', 't1']); // stage-less and incomplete
  no(f, ['update', inc, '--set-estimate', '5'], 'only the team lead (lead) refines it, not archy', { QWEN_CODE_AGENT_ID: 'archy@t1' });
  ok(f, ['update', inc, '--set-estimate', '5'], { QWEN_CODE_AGENT_ID: 'lead@t1' });
  const w = make(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  ok(f, ['update', w, '--claim', 'lead']);
  make(f, 'chunk item', '--chunk');
  const p = JSON.parse(run(f, ['pop', '--agent', 'lead', '--json'], { TEAM_NAME: 't1' }).stdout);
  assert.notEqual(p.action, 'chunk', p.instruction); // its team works on inc: the lead waits
});
