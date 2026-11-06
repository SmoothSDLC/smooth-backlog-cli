// Tests for the team's dispatch plan (`backlog query --plan`).
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, createdSlug, intoTeam, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture(prefix = 'team-plan-') {
  const t = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(t);
  const home = sharedBacklog(t);
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer' }] } })); // t1 asks one peer review of its work
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const roster = join(t, 'team.json');
  writeFileSync(roster, JSON.stringify({ ann: {}, bob: {}, zed: {} })); // the lead (TEAM_LEAD below) is none of them
  return { t, home, cons, roster, user: join(t, 'user'), folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '', BACKLOG_SESSION: '', TEAM_LEAD: 'lead', HOME: f.user, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const raw = (f, name, ...extra) => createdSlug(ok(f, ['new', ...NEW(name), ...extra]).stdout); // an item as created: no team
const make = (f, name, ...extra) => intoTeam(raw(f, name, ...extra), { cwd: f.cons, tmp: f.t, env: { BACKLOG_SESSION: '', HOME: f.user } }); // the plan reaches only the items of t1
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
const plan = (f, env, agents = 'ann,bob,zed,lead') => JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--plan', '--agents', agents, '--roster', f.roster, '--json'], env).stdout);
const rows = p => p.map(e => [e.member, e.action, e.item]);

test('test_one_claimable_item_goes_to_exactly_one_member', () => {
  const f = fixture();
  const job = make(f, 'shared tests job');
  let p = plan(f);
  assert.deepEqual(rows(p), [['ann', 'claim', job]]);
  assert.ok(p[0].instruction.includes(`backlog update ${job} --claim ann`) && p[0].instruction.includes('do not pop'), p[0].instruction);
  const other = make(f, 'second tests job');
  assert.deepEqual(plan(f).map(e => [e.member, e.item]), [['ann', job], ['bob', other]]); // one per member
  ok(f, ['update', job, '--claim', 'ann']); // ann holds an active item: no claim for him
  p = plan(f);
  assert.deepEqual(p.map(e => [e.member, e.item, e.reason]), [['bob', other, 'free member']]);
  const text = ok(f, ['team', 'query', '--team', 't1', '--plan', '--roster', f.roster]).stdout;
  assert.equal(text, `bob: claim ${other} (free member) - ${p[0].instruction}\n`);
});

test('test_review_goes_to_any_member_but_the_author; a member\'s own work goes first', () => {
  const f = fixture();
  const job = make(f, 'review job');
  ok(f, ['update', job, '--claim', 'zed']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'zed']);
  const p = plan(f);
  assert.deepEqual(p.map(e => [e.member, e.action, e.reason]), [['ann', 'review', 'any member but the author']]);
  assert.ok(p[0].instruction.startsWith(`start the review: backlog update ${job} --start-review --by ann; then review the work of zed`), p[0].instruction);
  const mine = make(f, 'ann busy');
  ok(f, ['update', mine, '--claim', 'ann']);
  ok(f, ['update', make(f, 'bob busy'), '--claim', 'bob']);
  assert.deepEqual(plan(f, { BACKLOG_REVIEW_FIRST_SECONDS: '0' }).filter(e => e.item === job), []); // every member but the author works: nobody
});

test('test_changes_verdict_is_planned_once_per_verdict_for_the_claimer_and_plain_continue_never', () => {
  const f = fixture();
  const job = make(f, 'respond job');
  ok(f, ['update', job, '--claim', 'bob']);
  assert.deepEqual(plan(f).filter(e => e.member === 'bob'), []); // bob works on it: nothing to send
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit 1', '--by', 'bob']);
  ok(f, ['update', job, '--review', 'changes', '--by', 'ann', '--comments', 'missing test (references/review/code.md)']);
  const t1 = fm(f, job).reviewed_at;
  const e = plan(f).filter(x => x.member === 'bob');
  assert.deepEqual(e.map(x => [x.action, x.key, x.reason]), [['respond', `bob respond ${e[0].seq} ${t1}`, 'claimer']]);
  assert.ok(e[0].instruction.includes('asked for changes') && e[0].instruction.includes('--request-review any'));
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit 2', '--by', 'bob']);
  assert.deepEqual(plan(f).filter(x => x.member === 'bob'), []);
  ok(f, ['update', job, '--review', 'pass', '--by', 'ann', '--comments', 'ok (references/review/code.md)']);
  // the reviews of a teamless item need no rule: one pass asks for the close
  assert.deepEqual(plan(f).filter(x => x.member === 'bob').map(x => [x.action, x.key]), [['close', `bob close ${e[0].seq}`]]);
});

test('a review in progress is hidden from the plan; a stale one goes to the lead to hand on', () => {
  const f = fixture();
  const job = make(f, 'review job');
  ok(f, ['update', job, '--claim', 'zed']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'zed']);
  ok(f, ['update', job, '--start-review', '--by', 'bob']);
  assert.deepEqual(plan(f).filter(e => e.item === job), []);
  const p = plan(f, { BACKLOG_REVIEW_STALE_SECONDS: '-1' }).filter(e => e.item === job);
  assert.deepEqual(p.map(e => [e.member, e.action]), [['lead', 'reassign-review']]);
  assert.ok(p[0].instruction.includes(`--reassign-review <member> --by lead`), p[0].instruction);
});

test('the lead and a review_only member get no claim; the lead refines an incomplete item', () => {
  const f = fixture();
  writeFileSync(f.roster, JSON.stringify({ ann: {}, bob: { review_only: true }, zed: {}, lead: {} }));
  const [a, b] = ['first claim job', 'second claim job'].map(n => make(f, n));
  assert.deepEqual(plan(f).map(e => [e.member, e.action]), [['ann', 'claim'], ['zed', 'claim']]); // bob reviews only, the lead never claims
  const bare = intoTeam(createdSlug(ok(f, ['new', '--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none']).stdout), { cwd: f.cons, tmp: f.t, env: { BACKLOG_SESSION: '', HOME: f.user } }, 't1', ''); // an incomplete item of t1
  const r = plan(f).find(e => e.member === 'lead');
  assert.deepEqual([r.action, r.item], ['refine', bare]);
  assert.ok(r.reason.startsWith('incomplete: review_refs,estimate_min,definition_of_done') && r.instruction.includes('never action it'), JSON.stringify(r));
  assert.ok(!plan(f).some(e => e.member !== 'lead' && e.item === bare)); // never dispatched to a member
  assert.ok(a && b);
});

test("with TEAM_NAME another team's item is never planned, and nothing before stage ready is claimed or reviewed", () => {
  const f = fixture();
  const w = raw(f, 'work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const c = raw(f, 'child', '--split-from', w); // refining
  // an unrefined team item is never planned for a claim; refined (member, lead, reviewer), the work item is
  for (const a of [['--refine-start', '--by', 'rfn'], ['--refine-done', '--by', 'rfn', '--note', 'refined'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']]) ok(f, ['update', w, ...a]);
  const theirs = raw(f, "t2's item");
  ok(f, ['update', theirs, '--set-team', 't2']);
  const p = plan(f, { TEAM_NAME: 't1' });
  assert.deepEqual(rows(p), [['ann', 'claim', w]]); // not c (refining), not t2's item
  assert.ok(c);
});

test('test_plan_gives_a_review_to_the_first_idle_member_but_the_author; a member refining an item is not idle', () => {
  const f = fixture();
  const job = make(f, 'plan review job');
  ok(f, ['update', job, '--claim', 'ann']);
  ok(f, ['update', job, '--request-review', 'any', '--note', 'commit abc', '--by', 'ann']);
  const reviewers = () => plan(f).filter(e => e.item === job).map(e => [e.member, e.reason]);
  assert.deepEqual(reviewers(), [['bob', 'any member but the author']]);
  ok(f, ['update', make(f, 'bob busy job'), '--claim', 'bob']); // bob is not idle
  assert.deepEqual(reviewers(), [['zed', 'any member but the author']]);
  const w = raw(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const c = raw(f, 'child', '--split-from', w);
  ok(f, ['update', c, '--refine-start', '--by', 'zed']); // zed refines: active work too
  assert.deepEqual(reviewers(), []);
});

test('two review requests at once go to two members, neither to its author', () => {
  const f = fixture();
  const [a, b] = ['first review job', 'second review job'].map(n => make(f, n));
  ok(f, ['update', b, '--set-review-refs', 'references/review/contract.md']);
  for (const s of [a, b]) { ok(f, ['update', s, '--claim', 'ann']); ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', 'ann']); }
  const p = plan(f).filter(e => e.action === 'review');
  assert.deepEqual(p.map(e => [e.member, e.item]), [['bob', a], ['zed', b]]);
});

test('a member refining an item gets no respond or close in the plan', () => {
  const f = fixture();
  const x = make(f, 'reviewed job');
  ok(f, ['update', x, '--claim', 'zed']);
  ok(f, ['update', x, '--request-review', 'any', '--note', 'n', '--by', 'zed']);
  const w = raw(f, 'team work item');
  ok(f, ['update', w, '--set-team', 't1']);
  const c = raw(f, 'child', '--split-from', w);
  ok(f, ['update', c, '--refine-start', '--by', 'zed']);
  ok(f, ['update', x, '--review', 'pass', '--by', 'ann', '--comments', 'ok per references/review/code.md']);
  assert.ok(!plan(f).some(e => e.member === 'zed' && ['respond', 'close'].includes(e.action)), JSON.stringify(plan(f)));
});

test('the plan through claims, a review, a changes verdict, a close and the lead\'s refinement: every step and plan query prints exactly what it records', () => {
  {
    const f = fixture('team-plan-js-');
    // timestamps and the consumer checkout differ between runs; the rest of the output is asserted word for word
    const TS = s => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'TS').replace(f.cons, '<cwd>');
    // the plan JSON uses the CLI's Python-style dumps: ", " and ": " separators, non-ASCII escaped
    const dumps = v => (v !== null && typeof v === 'object'
      ? (Array.isArray(v) ? `[${v.map(dumps).join(', ')}]` : `{${Object.entries(v).map(([k, x]) => `${dumps(k)}: ${dumps(x)}`).join(', ')}}`)
      : JSON.stringify(v ?? null).replace(/[\u007f-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
    const HINT = 'the review-documents repository'; // the definition-of-done hint the plan cites, pinned word for word
    const claim = (member, item, seq) => ({ member, action: 'claim', item, seq,
      instruction: `claim exactly this item (planned for you; do not pop for another): backlog update ${item} --claim ${member}, then start the work and record each step in the item; definition of done: references/review/code.md (${HINT}: load them before working)`,
      reason: 'free member', key: `${member} claim ${seq}` });
    const step = (script, args) => {
      const r = run(f, [script, ...args]);
      assert.equal(r.status, 0, `${script} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.equal(r.stderr, '', `${script} ${args.join(' ')}: ${r.stderr}`);
      return r.stdout;
    };
    const plan = (agents, expected) => {
      const out = step('team', ['query', '--team', 't1', '--plan', '--agents', agents, '--roster', f.roster, '--json']);
      assert.equal(TS(out), `${dumps(expected)}\n`);
    };
    for (const [i, n] of ['first', 'second', 'third'].entries()) { step('new', NEW(n)); step('update', [`00${i + 1}-${n}`, '--set-team', 't1', '--status', 'ready']); }
    plan('ann,bob,zed', [claim('ann', '001-first', 1), claim('bob', '002-second', 2), claim('zed', '003-third', 3)]);
    step('update', ['1', '--claim', 'zed']); step('update', ['1', '--request-review', 'any', '--note', 'x', '--by', 'zed']);
    plan('ann,bob,zed', [
      { member: 'ann', action: 'review', item: '001-first', seq: 1,
        instruction: `start the review: backlog update 001-first --start-review --by ann; then review the work of zed; load its review_refs first: references/review/code.md (${HINT}) and cite one in --comments, then backlog update 001-first --review pass|changes --by ann --comments "<findings>"`,
        reason: 'any member but the author', key: 'ann review 1' },
      { ...claim('bob', '002-second', 2), reason: 'free member; least loaded' },
      claim('zed', '003-third', 3),
    ]);
    step('update', ['1', '--review', 'changes', '--by', 'ann', '--comments', 'fix (references/review/code.md)']);
    plan('ann,bob,zed', [
      { member: 'zed', action: 'respond', item: '001-first', seq: 1,
        instruction: 'the review by ann asked for changes (TS): read its findings in the item, fix them, record each step (backlog update 001-first --append "..."), then backlog update 001-first --request-review any --note "<what changed>"',
        reason: 'claimer', key: 'zed respond 1 TS' },
      claim('ann', '002-second', 2),
      claim('bob', '003-third', 3),
    ]);
    step('update', ['1', '--request-review', 'any', '--note', 'y', '--by', 'zed']);
    step('update', ['1', '--review', 'pass', '--by', 'ann', '--comments', 'ok (references/review/code.md)']);
    plan('ann,bob,zed', [
      { member: 'zed', action: 'close', item: '001-first', seq: 1,
        instruction: 'close 1 with --close --summary (backlog update 001-first --close --summary "<outcome>")',
        reason: 'claimer', key: 'zed close 1' },
      claim('ann', '002-second', 2),
      claim('bob', '003-third', 3),
    ]);
    writeFileSync(f.roster, JSON.stringify({ ann: {}, bob: {}, zed: {}, lead: {} })); // the lead plans its refinement
    step('new', ['--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none']); // incomplete
    step('update', ['004-bare', '--set-team', 't1']);
    plan('lead', [
      { member: 'lead', action: 'refine', item: '004-bare', seq: 4,
        instruction: "refine 4, never action it: set review_refs, estimate_min, definition_of_done (backlog update 004-bare --set-review-refs <review document>,.. / --set-depends-on <ids|none> / --set-estimate <minutes> --set-complexity low|medium|high [--set-layer 1-5|process] / --append '## Definition of done\\n- [ ] <checkable line>'); once complete, record the gap in the item",
        reason: 'incomplete: review_refs,estimate_min,definition_of_done',
        key: 'lead refine 4 review_refs,estimate_min,definition_of_done' },
    ]);
  }
});
