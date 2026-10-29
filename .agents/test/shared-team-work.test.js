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
  const parent = make(f, 'team work item');
  ok(f, ['update', parent, '--set-team', 't1']);
  const child = make(f, 'child', '--split-from', parent);
  w = work(f, 'cody', { TEAM_NAME: 't1' });
  assert.deepEqual([w.action, w.item, w.marked, fm(f, child).refiner], ['refine', child, '--refine-start --by cody', 'cody']);
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
  ok(f, ['update', b, '--claim', 'archy']);
  const c = make(f, 'third job');
  ok(f, ['update', c, '--claim', 'archy', '--force']); // archy holds two active items
  r = ok(f, ['update', b, '--request-review', 'any', '--note', 'commit ghi', '--by', 'archy']);
  assert.doesNotMatch(r.stdout, STOP); // c is still active: the session goes on
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
