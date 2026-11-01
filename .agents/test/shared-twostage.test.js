// Item 088: two review stages on every item - a Cody review first, then an external review by codex or claude on the
// same commit - before any close or --status done; the missing stage is named in the refusal. A Cody pass by the
// author session is refused, a changes verdict re-runs both stages, every split slice needs a codex or claude
// refinement review before it can be claimed, and the owner closes with --by owner --reason, recorded as such.
// Local bare repositories, items made with the CLI in a fixture backlog.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { parse } from '../../src/shared/frontmatter.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'twostage-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none',
  '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { TEAM_LEAD: 'lead' };
// QWEN_CODE_SESSION_ID: empty by default - the driver-N ids of shared-fixtures.js carry no session, so the author
// session comes from the @-part of a named QWEN_CODE_AGENT_ID only (the test environment's own session never leaks in).
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { ...LEAD, QWEN_CODE_SESSION_ID: '', ...env } });
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
// One review round: the claimer requests, the reviewer starts and records the verdict. The stale-view guard
// needs each actor's fresh read of the item first.
const round = (f, slug, { claimer, reviewer, verdict = 'pass', note = 'the work in commit abc', env }) => {
  ok(f, ['query', '--phase', slug, '--agent', claimer], env);
  ok(f, ['update', slug, '--request-review', 'any', '--note', note, '--by', claimer], env);
  ok(f, ['query', '--phase', slug, '--agent', reviewer], env);
  ok(f, ['update', slug, '--start-review', '--by', reviewer], env);
  return ok(f, ['update', slug, '--review', verdict, '--by', reviewer, '--comments', verdict === 'pass'
    ? 'fine per references/review/code.md'
    : 'fix x per references/review/code.md'], env);
};
// The two stages: a Cody pass (a Cody agent, not the author session), then a codex or claude pass on the same commit.
const bothStages = (f, slug, claimer = 'archy', env) => {
  round(f, slug, { claimer, reviewer: 'cody', env });
  round(f, slug, { claimer, reviewer: 'codex', env });
};

test('a close and a --status done without a Cody pass are refused, naming the Cody stage', () => {
  const f = fixture();
  const s = make(f, 'unreviewed item');
  ok(f, ['update', s, '--claim', 'archy']);
  no(f, ['update', s, '--close', '--summary', 'done'], 'missing the Cody review stage');
  no(f, ['update', s, '--status', 'done', '--by', 'archy'], 'missing the Cody review stage');
  assert.equal(fm(f, s).status, 'in_progress');
});

test('a close with a Cody pass but no codex/claude pass is refused, naming the external stage', () => {
  const f = fixture();
  const s = make(f, 'cody-only item');
  ok(f, ['update', s, '--claim', 'archy']);
  round(f, s, { claimer: 'archy', reviewer: 'cody' });
  assert.equal(fm(f, s).cody_pass_commit, fm(f, s).commit); // the Cody pass pinned the current commit
  ok(f, ['query', '--phase', s, '--agent', 'archy']); // the verdict is new to the claimer
  no(f, ['update', s, '--close', '--summary', 'done'], 'missing the external review stage');
  no(f, ['update', s, '--status', 'done', '--by', 'archy'], 'missing the external review stage');
});

test('both stages pass on the same commit: the close and a --status done go through', () => {
  const f = fixture();
  const s = make(f, 'two-stage item');
  ok(f, ['update', s, '--claim', 'archy']);
  bothStages(f, s, 'archy');
  assert.equal(fm(f, s).external_pass_commit, fm(f, s).commit);
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  ok(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy']);
  assert.equal(fm(f, s).status, 'done');
  const t = make(f, 'two-stage status item');
  ok(f, ['update', t, '--claim', 'archy']);
  bothStages(f, t, 'archy');
  ok(f, ['query', '--phase', t, '--agent', 'archy']);
  ok(f, ['update', t, '--status', 'done', '--by', 'archy']);
  assert.equal(fm(f, t).status, 'done');
});

test('an external pass recorded before the Cody pass is refused', () => {
  const f = fixture();
  const s = make(f, 'external-first item');
  ok(f, ['update', s, '--claim', 'archy']);
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'the work in commit abc', '--by', 'archy']);
  ok(f, ['query', '--phase', s, '--agent', 'codex']);
  ok(f, ['update', s, '--start-review', '--by', 'codex']);
  no(f, ['update', s, '--review', 'pass', '--by', 'codex', '--comments', 'fine per references/review/code.md'],
    'after the Cody review passed');
  assert.equal(fm(f, s).review_state, 'in_review'); // the refused verdict records nothing
  assert.equal(fm(f, s).external_pass_commit, undefined);
});

test('a Cody pass in the author session is refused; a Cody pass in a fresh session passes', () => {
  const f = fixture();
  const s = make(f, 'author session item');
  ok(f, ['update', s, '--claim', 'cody-a'], { QWEN_CODE_AGENT_ID: 'cody-a@s1' });
  assert.equal(fm(f, s).author_session, 's1');
  ok(f, ['query', '--phase', s, '--agent', 'cody-a'], { QWEN_CODE_AGENT_ID: 'cody-a@s1' });
  ok(f, ['update', s, '--request-review', 'any', '--note', 'the work in commit abc', '--by', 'cody-a'], { QWEN_CODE_AGENT_ID: 'cody-a@s1' });
  // the reviewer is another Cody card (the claimer never reviews its own item): in the author session it is refused
  ok(f, ['query', '--phase', s, '--agent', 'cody-b'], { QWEN_CODE_AGENT_ID: 'cody-b@s1' });
  ok(f, ['update', s, '--start-review', '--by', 'cody-b'], { QWEN_CODE_AGENT_ID: 'cody-b@s1' });
  no(f, ['update', s, '--review', 'pass', '--by', 'cody-b', '--comments', 'fine per references/review/code.md'],
    'the author session', { QWEN_CODE_AGENT_ID: 'cody-b@s1' });
  ok(f, ['update', s, '--review', 'pass', '--by', 'cody-b', '--comments', 'fine per references/review/code.md'],
    { QWEN_CODE_AGENT_ID: 'cody-b@s2' }); // a fresh session of the author card's session
  assert.equal(fm(f, s).cody_pass_commit, fm(f, s).commit);
  round(f, s, { claimer: 'cody-a', reviewer: 'codex' });
  ok(f, ['query', '--phase', s, '--agent', 'cody-a']);
  ok(f, ['update', s, '--close', '--summary', 'done', '--by', 'cody-a']);
  assert.equal(fm(f, s).status, 'done');
});

test('a changes verdict re-runs both stages: the passes on the older work no longer count', () => {
  const f = fixture();
  const s = make(f, 'rework item');
  ok(f, ['update', s, '--claim', 'archy']);
  bothStages(f, s, 'archy');
  round(f, s, { claimer: 'archy', reviewer: 'cody', verdict: 'changes' }); // the Cody stage asks for changes
  assert.equal(fm(f, s).cody_pass_commit, ''); // the changes verdict clears both stages
  assert.equal(fm(f, s).external_pass_commit, '');
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  no(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy'], 'missing the Cody review stage');
  bothStages(f, s, 'archy'); // after the rework both stages run again
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  ok(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy']);
  assert.equal(fm(f, s).status, 'done');
});

test('codex/claude passes on an older commit do not count after new work', () => {
  const f = fixture();
  const s = make(f, 'new commit item');
  ok(f, ['update', s, '--claim', 'archy']);
  bothStages(f, s, 'archy'); // both passes on the original commit
  const older = fm(f, s).commit;
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  ok(f, ['update', s, '--commit', 'a'.repeat(40), '--by', 'archy']); // new work on the item
  no(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy'], 'missing the Cody review stage');
  assert.equal(fm(f, s).cody_pass_commit, older); // the passes pin the older commit
  bothStages(f, s, 'archy'); // both stages again, on the new commit
  assert.equal(fm(f, s).cody_pass_commit, 'a'.repeat(40));
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  ok(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy']);
  assert.equal(fm(f, s).status, 'done');
});

test('the pass output: a Cody pass asks for the external review, an external pass asks for the close', () => {
  const f = fixture();
  const s = make(f, 'output item');
  ok(f, ['update', s, '--claim', 'archy']);
  const cody = round(f, s, { claimer: 'archy', reviewer: 'cody' });
  assert.match(cody.stdout, /the external review/); // the Cody pass is not the close yet
  assert.doesNotMatch(cody.stdout, /CLOSE NOW/);
  const external = round(f, s, { claimer: 'archy', reviewer: 'codex' });
  assert.match(external.stdout, /CLOSE NOW: archy closes it/);
  assert.match(external.stdout, /if the claimer has not, the team lead closes it when available/);
});

test('a split slice without a codex/claude refinement review cannot be claimed', () => {
  const f = fixture();
  const parent = make(f, 'split parent');
  const child = ok(f, ['new', '--name', 'split slice', '--split-from', parent, '--depends-on', 'none',
    '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  assert.equal(fm(f, child).stage, 'refining'); // a split slice starts in stage refining, with or without a team
  no(f, ['update', child, '--claim', 'archy'], 'it is claimed only when its refinement review passed (stage ready)');
  ok(f, ['update', child, '--refine-start', '--by', 'archy']);
  ok(f, ['update', child, '--refine-done', '--by', 'archy', '--note', 'already complete']);
  ok(f, ['update', child, '--request-refinement-review', '--by', 'lead']);
  ok(f, ['query', '--phase', child, '--agent', 'archy']); // the lead's step is new to archy
  no(f, ['update', child, '--claim', 'archy'], 'refinement review'); // in stage refinement-review: still not claimable
  ok(f, ['update', child, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'checkable (codex thread t-1)']);
  assert.equal(fm(f, child).stage, 'ready');
  ok(f, ['query', '--phase', child, '--agent', 'archy']); // the lead's and codex's steps are new to archy
  ok(f, ['update', child, '--claim', 'archy']); // the refinement review passed: claimable
});

test('a team split slice still needs its refinement review, with or without a team field at creation', () => {
  const f = fixture();
  const parent = make(f, 'team split parent');
  ok(f, ['update', parent, '--set-team', 't1']);
  const child = ok(f, ['new', '--name', 'team split slice', '--split-from', parent, '--depends-on', 'none',
    '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  assert.deepEqual([fm(f, child).team, fm(f, child).stage], ['t1', 'refining']);
  no(f, ['update', child, '--claim', 'archy'], 'it is claimed only when its refinement review passed (stage ready)');
});

test('an owner close with --by owner --reason is accepted and recorded as an owner decision', () => {
  const f = fixture();
  const s = make(f, 'owner item');
  ok(f, ['update', s, '--claim', 'archy']);
  no(f, ['update', s, '--close', '--by', 'owner', '--summary', 'done'], '--reason');
  ok(f, ['query', '--phase', s, '--agent', 'owner']);
  const r = ok(f, ['update', s, '--close', '--by', 'owner', '--reason', 'the deploy evidence is in run 13', '--summary', 'done']);
  assert.match(r.stdout, /Closed by owner at/);
  const doc = readFileSync(join(f.folder, 'phases', `${s}.md`), 'utf8');
  assert.match(doc, /## Closed by owner at .* \(owner decision: the deploy evidence is in run 13\)/);
  assert.equal(fm(f, s).status, 'done');
});

test('an owner close needs no review at all, but no --reason is refused; other closes keep their rules', () => {
  const f = fixture();
  const s = make(f, 'owner unreviewed item'); // no review at all: the owner decides
  ok(f, ['query', '--phase', s, '--agent', 'owner']);
  ok(f, ['update', s, '--close', '--by', 'owner', '--reason', 'the decision is recorded', '--summary', 'done']);
  assert.equal(fm(f, s).status, 'done');
  const t = make(f, 'owner with claimer');
  ok(f, ['update', t, '--claim', 'archy']);
  ok(f, ['update', t, '--request-review', 'any', '--note', 'the work', '--by', 'archy']);
  ok(f, ['query', '--phase', t, '--agent', 'owner']);
  ok(f, ['update', t, '--close', '--by', 'owner', '--reason', 'the decision is recorded', '--summary', 'done']);
  assert.equal(fm(f, t).status, 'done');
  const u = make(f, 'plain close rules');
  ok(f, ['update', u, '--claim', 'archy']);
  bothStages(f, u, 'archy');
  no(f, ['update', u, '--close', '--summary', 'x', '--by', 'zed'], 'only the claimer (archy) closes it, else the team lead (lead); not zed');
  ok(f, ['update', u, '--close', '--summary', 'done', '--by', 'lead']);
  assert.equal(fm(f, u).status, 'done');
});
