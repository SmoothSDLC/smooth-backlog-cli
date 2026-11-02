// Item 088: two review stages on every item - a Cody review first, then an external review by codex or claude on the
// same commit - before any close or --status done; the missing stage is named in the refusal. A Cody pass by the
// author session is refused, a changes verdict re-runs both stages, every split slice needs a codex or claude
// refinement review before it can be claimed, and the owner closes with --by owner --reason, recorded as such.
// Local bare repositories, items made with the CLI in a fixture backlog.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';
import { stageMissing } from '../../src/shared/lifecycle.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

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
// item 098: a team item is refined (a member, the lead's review request, Codex's pass) before anyone claims it
const refined = (f, slug, lead = 'lead') => [['--refine-start', '--by', 'rfn'], ['--refine-done', '--by', 'rfn', '--note', 'refined'], ['--request-refinement-review', '--by', lead], ['--refinement-review', 'pass', '--by', 'codex', '--comments', 'ok']]
  .forEach(a => { ok(f, ['query', '--phase', slug, '--agent', a[a.indexOf('--by') + 1]], { TEAM_LEAD: lead }); ok(f, ['update', slug, ...a], { TEAM_LEAD: lead }); });
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
  ok(f, ['update', s, '--claim', 'cody-a'], { QWEN_CODE_AGENT_ID: 'cody-a@s1', QWEN_CODE_SESSION_ID: 's1' });
  assert.equal(fm(f, s).author_session, 's1');
  ok(f, ['query', '--phase', s, '--agent', 'cody-a'], { QWEN_CODE_AGENT_ID: 'cody-a@s1', QWEN_CODE_SESSION_ID: 's1' });
  ok(f, ['update', s, '--request-review', 'any', '--note', 'the work in commit abc', '--by', 'cody-a'], { QWEN_CODE_AGENT_ID: 'cody-a@s1', QWEN_CODE_SESSION_ID: 's1' });
  // the reviewer is another Cody card (the claimer never reviews its own item): in the author session it is refused
  ok(f, ['query', '--phase', s, '--agent', 'cody-b'], { QWEN_CODE_AGENT_ID: 'cody-b@s1', QWEN_CODE_SESSION_ID: 's1' });
  ok(f, ['update', s, '--start-review', '--by', 'cody-b'], { QWEN_CODE_AGENT_ID: 'cody-b@s1', QWEN_CODE_SESSION_ID: 's1' });
  no(f, ['update', s, '--review', 'pass', '--by', 'cody-b', '--comments', 'fine per references/review/code.md'],
    'the author session', { QWEN_CODE_AGENT_ID: 'cody-b@s1', QWEN_CODE_SESSION_ID: 's1' });
  ok(f, ['update', s, '--review', 'pass', '--by', 'cody-b', '--comments', 'fine per references/review/code.md'],
    { QWEN_CODE_AGENT_ID: 'cody-b@s2', QWEN_CODE_SESSION_ID: 's2' }); // a fresh session of the author card's session
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

test('a new work commit invalidates the passes on the older commit: both stages run again', () => {
  const f = fixture();
  const s = make(f, 'new commit item');
  ok(f, ['update', s, '--claim', 'archy']);
  bothStages(f, s, 'archy'); // both passes on the original work commit
  const older = fm(f, s).cody_pass_commit;
  assert.equal(older, git(f.cons, 'rev-parse', 'HEAD')); // the pins are the work commit at review time
  git(f.cons, 'commit', '-q', '--allow-empty', '-m', 'unrelated: another item'); // another item's commit moves nothing
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  assert.equal(stageMissing({ ...fm(f, s) }, fm(f, s).work_commit), '');
  git(f.cons, 'commit', '-q', '--allow-empty', '-m', `${Number(s.split('-')[0])}: new work after the passes`); // the item's own new work
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  no(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy'], 'missing the Cody review stage');
  no(f, ['update', s, '--status', 'done', '--by', 'archy'], 'missing the Cody review stage');
  bothStages(f, s, 'archy'); // both stages again, on the new work commit
  assert.equal(fm(f, s).cody_pass_commit, git(f.cons, 'rev-parse', 'HEAD'));
  assert.notEqual(fm(f, s).cody_pass_commit, older);
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

test('an owner close of an incomplete item (no review documents, no estimate) is accepted with its --summary', () => {
  const f = fixture();
  const s = ok(f, ['new', '--name', 'bare item', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  ok(f, ['query', '--phase', s, '--agent', 'owner']);
  ok(f, ['update', s, '--close', '--by', 'owner', '--reason', 'the decision is recorded', '--summary', 'done']);
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

test('the owner closes a team item in its refinement stages on the written decision; the stage gate does not run for the owner', () => {
  const f = fixture();
  const parent = make(f, 'owner team parent');
  ok(f, ['update', parent, '--set-team', 't1']);
  const child = ok(f, ['new', '--name', 'owner team slice', '--split-from', parent, '--depends-on', 'none',
    '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  assert.equal(fm(f, child).stage, 'refining'); // the refinement runs while the owner decides
  no(f, ['update', child, '--claim', 'archy'], 'it is claimed only when its refinement review passed');
  ok(f, ['update', child, '--refine-start', '--by', 'archy']);
  ok(f, ['query', '--phase', child, '--agent', 'owner']);
  const r = ok(f, ['update', child, '--close', '--by', 'owner', '--reason', 'the owner takes it over', '--summary', 'done']);
  assert.match(r.stdout, /Closed by owner at .* \(owner decision: the owner takes it over\)/);
  assert.equal(fm(f, child).status, 'done');
});

// Written as a file edit, committed and pushed, the way another writer would store it (a slice as it was written
// before the stage field existed: no stage, the body's split marker intact).
const legacyWrite = (f, slug, keys) => {
  const file = join(f.folder, 'phases', `${slug}.md`);
  const doc = parse(readFileSync(file, 'utf8'));
  const { stage: _stage, ...rest } = doc.fm; // eslint-disable-line no-unused-vars
  store.write({ path: file, fm: { ...rest, ...keys }, body: doc.body }, f.folder);
  const con = db.connect(f.folder); db.scan(con, f.folder); con.close();
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'legacy slice'], ['push', '-q']]) {
    const p = spawnSync('git', args, { cwd: f.home, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
    assert.equal(p.status, 0, p.stderr);
  }
};

test('a legacy split slice without a stage field is not claimable until its refinement review passed', () => {
  const f = fixture();
  const parent = make(f, 'legacy parent');
  const child = ok(f, ['new', '--name', 'legacy slice', '--split-from', parent, '--depends-on', 'none',
    '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  legacyWrite(f, child, {}); // the stage goes away: a slice as written before the stage existed
  assert.equal(fm(f, child).stage, undefined);
  const r = no(f, ['update', child, '--claim', 'archy'], 'it is claimed only when its refinement review passed (stage ready)');
  assert.ok(r.stdout.includes('stage refining'), r.stdout); // the body's split marker names the stage
  ok(f, ['update', child, '--refine-start', '--by', 'archy']);
  assert.equal(fm(f, child).stage, 'refining'); // the start normalizes the stage
  ok(f, ['update', child, '--refine-done', '--by', 'archy', '--note', 'already complete']);
  ok(f, ['update', child, '--request-refinement-review', '--by', 'lead']);
  ok(f, ['update', child, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'checkable (codex thread t-2)']);
  assert.equal(fm(f, child).stage, 'ready');
  ok(f, ['query', '--phase', child, '--agent', 'archy']); // the lead's and codex's steps are new to archy
  ok(f, ['update', child, '--claim', 'archy']);
});

// The review documents go away: an item as it looks without them (an old item predates them). Written and
// committed and pushed in the fixture's backlog clone, the way another writer would store it.
const withoutRefs = (f, slug) => {
  const file = join(f.folder, 'phases', `${slug}.md`);
  const doc = parse(readFileSync(file, 'utf8'));
  const { review_refs: _refs, ...rest } = doc.fm; // eslint-disable-line no-unused-vars
  store.write({ path: file, fm: rest, body: doc.body }, f.folder);
  const con = db.connect(f.folder); db.scan(con, f.folder); con.close();
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'no review documents'], ['push', '-q']]) {
    const p = spawnSync('git', args, { cwd: f.home, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
    assert.equal(p.status, 0, p.stderr);
  }
};

test('--status done is refused for an item without review documents until both stages pass', () => {
  const f = fixture();
  // the item is claimed and reviewed with the review documents present, then the documents go away (an old
  // item predates them): the gate runs with or without the documents, and passes on the work commit's pins
  const bare = make(f, 'no review docs item');
  ok(f, ['update', bare, '--claim', 'tester']);
  bothStages(f, bare, 'tester');
  withoutRefs(f, bare);
  ok(f, ['query', '--phase', bare, '--agent', 'tester']);
  ok(f, ['update', bare, '--status', 'done', '--by', 'tester']);
  assert.equal(fm(f, bare).status, 'done');
  // a claimed item without the documents and without the passes is refused: the gate does not skip the reviews
  const refused = make(f, 'no review docs refused item');
  ok(f, ['update', refused, '--claim', 'tester']);
  withoutRefs(f, refused);
  ok(f, ['query', '--phase', refused, '--agent', 'tester']);
  no(f, ['update', refused, '--status', 'done', '--by', 'tester'], 'missing the Cody review stage');
});

test('an empty work commit is no commit: a pass pinned to it (or a cleared pin) counts for no stage', () => {
  assert.equal(stageMissing({ cody_pass_commit: '', external_pass_commit: '' }, ''), 'cody'); // empty pins on an empty work commit
  assert.equal(stageMissing({ cody_pass_commit: '', external_pass_commit: '' }, 'h'), 'cody'); // cleared pins, a work commit exists
  assert.equal(stageMissing({ cody_pass_commit: 'h', external_pass_commit: '' }, 'h'), 'external');
  assert.equal(stageMissing({ cody_pass_commit: 'o', external_pass_commit: 'o' }, 'h'), 'cody'); // passes for an older commit
  assert.equal(stageMissing({ cody_pass_commit: 'h', external_pass_commit: 'h' }, 'h'), '');
});

test('a Cody pass by an agent outside the item\'s team counts for no stage; the team\'s own pass pins it', () => {
  const f = fixture();
  const s = make(f, 'team cody item');
  ok(f, ['update', s, '--set-team', 't1']);
  refined(f, s);
  ok(f, ['update', s, '--claim', 'archy']);
  round(f, s, { claimer: 'archy', reviewer: 'cody' }); // recorded from a session with no team
  assert.equal(fm(f, s).cody_pass_commit, undefined); // a pass outside the item's team sets no pin
  round(f, s, { claimer: 'archy', reviewer: 'cody', env: { TEAM_NAME: 't1' } });
  assert.equal(fm(f, s).cody_pass_commit, fm(f, s).commit);
  round(f, s, { claimer: 'archy', reviewer: 'codex', env: { TEAM_NAME: 't1' } });
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  ok(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy']);
  assert.equal(fm(f, s).status, 'done');
});

test('a teamless split slice claimed by a member of a named team joins that team', () => {
  const f = fixture();
  const parent = make(f, 'teamless parent');
  const child = ok(f, ['new', '--name', 'teamless slice claim', '--split-from', parent, '--depends-on', 'none',
    '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  ok(f, ['update', child, '--refine-start', '--by', 'm1'], { TEAM_NAME: 't1' });
  ok(f, ['update', child, '--refine-done', '--by', 'm1', '--note', 'already complete'], { TEAM_NAME: 't1' });
  ok(f, ['update', child, '--request-refinement-review', '--by', 'lead']);
  ok(f, ['update', child, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'checkable (codex thread t-3)']);
  assert.equal(fm(f, child).stage, 'ready');
  ok(f, ['query', '--phase', child, '--agent', 'm1'], { TEAM_NAME: 't1' });
  ok(f, ['update', child, '--claim', 'm1'], { TEAM_NAME: 't1' }); // the team that refined it claims it
  assert.equal(fm(f, child).team, 't1');
  assert.equal(fm(f, child).claimed_by, 'm1');
});

test('a legacy split slice without a stage is offered for its refinement, not for a claim', () => {
  const f = fixture();
  const parent = make(f, 'legacy dispatch parent');
  const child = ok(f, ['new', '--name', 'legacy dispatch slice', '--split-from', parent, '--depends-on', 'none',
    '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  legacyWrite(f, child, {}); // the stage goes away: a slice as written before the stage existed
  const pop = JSON.parse(run(f, ['pop', '--agent', 'm1', '--json'], { TEAM_NAME: 't1' }).stdout);
  assert.deepEqual([pop.action, pop.item], ['refine', child]); // its refinement, not a claim the gate refuses
});

test('a pass from an unrecognized reviewer asks for the Cody review first', () => {
  const f = fixture();
  const s = make(f, 'unrecognized reviewer item');
  ok(f, ['update', s, '--claim', 'archy']);
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'the work in commit abc', '--by', 'archy']);
  ok(f, ['query', '--phase', s, '--agent', 'agent-x']);
  ok(f, ['update', s, '--start-review', '--by', 'agent-x']);
  const r = ok(f, ['update', s, '--review', 'pass', '--by', 'agent-x', '--comments', 'fine per references/review/code.md']);
  assert.equal(fm(f, s).cody_pass_commit, undefined); // the pass is outside both stages: no pin
  assert.equal(fm(f, s).external_pass_commit, undefined);
  assert.match(r.stdout, /the Cody review first/);
  assert.doesNotMatch(r.stdout, /the Cody pass is recorded/);
});

// A team's Qwen folder under HOME: Qwen stores the team under its sanitized name (Blue:Team -> blue-team).
const qwenTeam = (f, folderName, members) => {
  const d = join(f.t, 'qhome', '.qwen', 'teams', folderName);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'config.json'), JSON.stringify({ name: folderName, members: members.map(name => ({ name, joinedAt: Date.now() })) }));
  return { HOME: join(f.t, 'qhome') };
};

test('a registered member of the item\'s team records the Cody stage; a Cody name the team does not list does not', () => {
  const f = fixture();
  const env = { ...qwenTeam(f, 'blue-team', ['rev1']), TEAM_NAME: 'Blue:Team' };
  const s = make(f, 'member cody item');
  ok(f, ['update', s, '--set-team', 'Blue:Team']);
  refined(f, s);
  ok(f, ['update', s, '--claim', 'archy'], env);
  round(f, s, { claimer: 'archy', reviewer: 'cody', env }); // a Cody name, not a registered member
  assert.equal(fm(f, s).cody_pass_commit, undefined);
  round(f, s, { claimer: 'archy', reviewer: 'rev1', env }); // the team's member, found in the sanitized folder
  assert.equal(fm(f, s).cody_pass_commit, fm(f, s).commit);
  round(f, s, { claimer: 'archy', reviewer: 'codex', env });
  ok(f, ['query', '--phase', s, '--agent', 'archy'], env);
  ok(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy'], env);
  assert.equal(fm(f, s).status, 'done');
});

test('an external changes verdict is recorded after the work commit moved, and clears both stages', () => {
  const f = fixture();
  const s = make(f, 'moved commit item');
  ok(f, ['update', s, '--claim', 'archy']);
  round(f, s, { claimer: 'archy', reviewer: 'cody' });
  git(f.cons, 'commit', '-q', '--allow-empty', '-m', 'more work after the Cody pass');
  round(f, s, { claimer: 'archy', reviewer: 'codex', verdict: 'changes' }); // refused before: the pin no longer matched
  assert.equal(fm(f, s).review_state, 'changes-requested');
  assert.equal(fm(f, s).cody_pass_commit, '');
  assert.equal(fm(f, s).external_pass_commit, '');
});

test('a teamless split slice joins the refining team at --refine-start, and the team\'s pop offers its claim', () => {
  const f = fixture();
  const parent = make(f, 'join parent');
  const child = ok(f, ['new', '--name', 'join slice', '--split-from', parent, '--depends-on', 'none',
    '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  ok(f, ['update', child, '--refine-start', '--by', 'm1'], { TEAM_NAME: 't1' });
  assert.equal(fm(f, child).team, 't1');
  ok(f, ['update', child, '--refine-done', '--by', 'm1', '--note', 'complete'], { TEAM_NAME: 't1' });
  ok(f, ['update', child, '--request-refinement-review', '--by', 'lead']);
  ok(f, ['update', child, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'checkable (codex thread t-4)']);
  const pop = JSON.parse(run(f, ['pop', '--agent', 'm2', '--json'], { TEAM_NAME: 't1' }).stdout);
  assert.deepEqual([pop.action, pop.item], ['claim', child]);
});

test('a legacy split slice another member is refining is not offered for a claim', () => {
  const f = fixture();
  const parent = make(f, 'legacy refining parent');
  const child = ok(f, ['new', '--name', 'legacy refining slice', '--split-from', parent, '--depends-on', 'none',
    '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD]).stdout
    .split('created phase phases/')[1].split('.md')[0];
  legacyWrite(f, child, { refiner: 'm2', team: 't1' }); // no stage, refined by another member
  const pop = JSON.parse(run(f, ['pop', '--agent', 'm1', '--json'], { TEAM_NAME: 't1' }).stdout);
  assert.notEqual(pop.action, 'claim');
  const q = JSON.parse(run(f, ['query', '--claimable', '--json'], { TEAM_NAME: 't1' }).stdout || '{}');
  assert.ok(!JSON.stringify(q).includes(child), 'query --claimable lists no legacy slice before its refinement review');
});

test('the team lead, not a listed member, records the Cody stage in a session of the item\'s team', () => {
  const f = fixture();
  const env = { ...qwenTeam(f, 'blue-team', ['rev1']), TEAM_NAME: 'Blue:Team', TEAM_LEAD: 'boss' };
  const s = make(f, 'lead cody item');
  ok(f, ['update', s, '--set-team', 'Blue:Team']);
  refined(f, s, 'boss');
  ok(f, ['update', s, '--claim', 'archy'], env);
  round(f, s, { claimer: 'archy', reviewer: 'boss', env });
  assert.equal(fm(f, s).cody_pass_commit, fm(f, s).commit);
});

test('another item\'s commit on the branch between the two stages moves nothing: the passes pin the item\'s work commit', () => {
  const f = fixture();
  const s = make(f, 'shared branch item');
  ok(f, ['update', s, '--claim', 'archy']);
  round(f, s, { claimer: 'archy', reviewer: 'cody' });
  const work = fm(f, s).work_commit;
  git(f.cons, 'commit', '-q', '--allow-empty', '-m', '999: another item pushed meanwhile');
  round(f, s, { claimer: 'archy', reviewer: 'codex' }); // the external request keeps the work commit
  assert.equal(fm(f, s).work_commit, work);
  assert.equal(fm(f, s).external_pass_commit, work); // pinned to the item's work commit, not the HEAD of the checkout
  ok(f, ['query', '--phase', s, '--agent', 'archy']);
  ok(f, ['update', s, '--close', '--summary', 'done', '--by', 'archy']);
  assert.equal(fm(f, s).status, 'done');
});
