// Tests for `backlog pop` and `backlog query --pop` (src/shared/pop.js) - cli-parity job 20 (POP).
// Port of tests/test_team_pop.py (4 cases), tests/test_team_pop_compat.py (1 case) and the --pop assertions of
// tests/test_team_scope.py, plus parity with query.py --pop: one fixture state per action, and stdout, stderr and the
// exit status must be identical. Parity tests skip when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing.
// Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';
import { HELP } from '../../src/help.js';
import { cli, consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const oracle = py('query.py', ['--help']) !== null;
const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-pop-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const other = consumer(t, 'other', 'thing', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, other, folder: join(home, 'acme', 'demo'), cfg: join(home, 'acme', 'demo', 'backlog.scope') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
function make(f, side, cwd, name, extra = []) {
  const has = k => extra.includes(k);
  const args = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  const classes = has('--review-classes') ? extra[extra.indexOf('--review-classes') + 1] : (has('--work-class') ? 'code' : '');
  if (classes && !has('--review-classes')) args.push('--review-classes', classes);
  if (classes && !has('--review-refs')) args.push('--review-refs', classes.split(',').map(c => `references/review/${c}.md`).join(','));
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  args.push('--body', DOD, ...extra);
  const r = side === 'py' ? py('new_phase.py', args, { cwd, tmp: f.t }) : cli(['new', ...args], { cwd, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('created phase phases/')[1].split('.md')[0];
}
const item = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));
const upWith = side => (f, slug, ...args) => {
  const r = (side === 'py' ? py : (s, a, o) => cli([s, ...a], o))(side === 'py' ? 'update.py' : 'update', [slug, ...args], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r;
};
const ok = upWith('js');
const refuse = (f, slug, ...args) => cli(['update', slug, ...args], { cwd: f.cons, tmp: f.t });
const popCli = (f, args, opts = {}) => cli(['query', '--pop', '--agent', 'cody', ...args], { cwd: f.cons, tmp: f.t, ...opts });

// test_team_pop.py:8-14: the JSON of --pop; exit 3 exactly when the action is idle. Unless the pop changes the backlog
// (--claim-now), `backlog pop` must print the same thing as `backlog query --pop`.
function pop(f, ...args) {
  const r = popCli(f, ['--json', ...args]);
  assert.ok([0, 3].includes(r.status), r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(r.status === 3, out.action === 'idle', r.stdout);
  if (!args.includes('--claim-now')) {
    const same = cli(['pop', '--agent', 'cody', '--json', ...args], { cwd: f.cons, tmp: f.t });
    assert.deepEqual([same.status, same.stdout, same.stderr], [r.status, r.stdout, r.stderr], 'backlog pop == backlog query --pop');
  }
  return out;
}

test('test_pop_precedence_and_claim_now: continue > review > claim > chunk > idle, --claim-now claims', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-a'); // a queue of this test only
  const dep = make(f, 'js', f.cons, 'pop dependency', ['--work-class', 'tests', '--review-classes', 'tests']);
  const blocked = make(f, 'js', f.cons, 'pop blocked', ['--work-class', 'app-code', '--depends-on', dep.split('-')[0]]);
  ok(f, dep, '--claim', 'archy');

  let p = pop(f, '--classes', 'app-code'); // (e) nothing for cody: idle, with blockers
  assert.ok(p.action === 'idle' && p.item === null);
  assert.deepEqual(p.blocked, [{ item: blocked, waiting_on: [{ id: String(Number(dep.split('-')[0])), slug: dep, status: 'in_progress', claimed_by: 'archy' }] }]);
  const text = popCli(f, ['--classes', 'app-code']);
  assert.ok(text.status === 3 && text.stdout.startsWith('idle\n') && text.stdout.includes(`blocked ${blocked}: waits on ${dep}`), text.stdout);
  assert.equal(pop(f, '--classes', 'app-code,chunk').action, 'chunk'); // chunk class: small-chunk work, no item
  const chunk = make(f, 'js', f.cons, 'pop chunk', ['--work-class', 'chunk']);
  p = pop(f, '--classes', 'app-code'); // (d) the chunk item is named
  assert.deepEqual([p.action, p.item], ['chunk', chunk]);
  assert.ok(p.instruction.includes('CHUNK <time>'));
  const job = make(f, 'js', f.cons, 'pop job', ['--work-class', 'app-code']);
  p = pop(f, '--classes', 'app-code,chunk'); // (c) claim beats chunk; not claimed yet
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', job, false]);
  assert.ok(!item(f, job).fm.claimed_by);
  ok(f, dep, '--request-review', 'any', '--note', 'tests in commit abc');
  p = pop(f, '--classes', 'app-code', '--review-classes', 'tests'); // (b) review beats claim
  assert.deepEqual([p.action, p.item], ['review', dep]);
  assert.ok(p.instruction.includes('--review pass|changes --by cody'));
  assert.equal(pop(f, '--classes', 'app-code', '--review-classes', 'ui').action, 'claim'); // classes do not meet
  p = pop(f, '--classes', 'app-code', '--claim-now'); // --claim-now claims it
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', job, true]);
  assert.equal(item(f, job).fm.claimed_by, 'cody');
  p = pop(f, '--classes', 'app-code', '--review-classes', 'tests'); // (a) continue beats review
  assert.deepEqual([p.action, p.item], ['continue', job]);
  for (const cmd of [['query', '--next'], ['next']]) { // --next --agent is the same pop
    const n = cli([...cmd, '--agent', 'cody', '--classes', 'app-code'], { cwd: f.cons, tmp: f.t });
    assert.ok(n.status === 0 && n.stdout.startsWith(`continue ${job}\n`) && !n.stdout.includes('NEXT-STEPS-MANDATE'), n.stdout + n.stderr);
  }
  ok(f, dep, '--review', 'pass', '--by', 'cody', '--comments', 'fine per references/review/tests.md');
  assert.ok(cli(['query', '--pop'], { cwd: f.cons, tmp: f.t }).stderr.includes('--pop needs --agent'));
  assert.ok(cli(['pop'], { cwd: f.cons, tmp: f.t }).stderr.includes('--pop needs --agent'));
});

test('test_pop_held_item_awaiting_review_is_not_continue_and_a_passed_one_is_closed', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'popwait');
  const job = make(f, 'js', f.cons, 'wait job', ['--work-class', 'app-code', '--review-classes', 'tests']);
  ok(f, job, '--claim', 'cody');
  ok(f, job, '--request-review', 'any', '--note', 'commit abc, run 1');
  const other = make(f, 'js', f.cons, 'wait other', ['--work-class', 'app-code']);
  let p = pop(f, '--classes', 'app-code'); // awaiting a verdict: falls through to claim
  assert.deepEqual([p.action, p.item], ['claim', other]);
  ok(f, other, '--claim', 'archy');
  p = pop(f, '--classes', 'app-code'); // nothing else: idle, the wait is reported
  const seq = item(f, job).fm.seq;
  assert.equal(p.action, 'idle');
  assert.deepEqual(p.blocked.find(b => b.item === job), { item: job, waiting_on: [`awaiting review: ${seq}`] });
  const text = popCli(f, ['--classes', 'app-code']);
  assert.ok(text.status === 3 && text.stdout.includes(`blocked ${job}: awaiting review: ${seq}`), text.stdout);
  ok(f, job, '--review', 'changes', '--by', 'archy', '--comments', 'fix x per references/review/tests.md');
  p = pop(f, '--classes', 'app-code'); // a 'changes' verdict is work: continue
  assert.deepEqual([p.action, p.item], ['continue', job]);
  assert.ok(p.instruction.includes('keep working'));
  ok(f, job, '--request-review', 'any', '--note', 'commit def');
  ok(f, job, '--review', 'pass', '--by', 'archy', '--comments', 'fine per references/review/tests.md');
  p = pop(f, '--classes', 'app-code'); // passed but open: close it
  assert.deepEqual([p.action, p.item], ['continue', job]);
  assert.ok(p.instruction.startsWith(`close ${seq} with --close --summary`));
});

test('test_claim_only_when_every_held_item_waits', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'popwait2');
  const [one, two, three] = ['rule one', 'rule two', 'rule three'].map((n, i) => make(f, 'js', f.cons, n, ['--work-class', 'app-code', ...(i < 2 ? ['--review-classes', 'tests'] : [])]));
  ok(f, one, '--claim', 'cody');
  let r = refuse(f, two, '--claim', 'cody'); // one active item: no new claim
  assert.ok(r.status === 1 && r.stdout.includes(`holds 1 active item(s): ${one}`), r.stdout);
  let p = pop(f, '--classes', 'app-code');
  assert.deepEqual([p.action, p.item], ['continue', one]);
  assert.ok(p.held.some(h => h.item === one && h.seq === p.seq && h.state === 'active'));
  ok(f, one, '--waiting', 'run 397 deploy', '--by', 'cody'); // an async wait: claim allowed
  p = pop(f, '--classes', 'app-code', '--claim-now');
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', two, true]);
  assert.ok(p.held.some(h => h.item === one && h.state === 'waiting:run 397 deploy'));
  ok(f, two, '--request-review', 'any', '--note', 'commit abc'); // two awaits review, one waits
  p = pop(f, '--classes', 'app-code');
  assert.deepEqual([p.action, p.item], ['claim', three]);
  ok(f, three, '--claim', 'archy');
  p = pop(f, '--classes', 'app-code');
  assert.equal(p.action, 'idle');
  assert.ok(p.blocked.some(b => b.item === one && b.waiting_on[0] === 'waiting: run 397 deploy'));
  ok(f, one, '--append', 'CHUNK 10:00 test x ok'); // an append does not end the wait
  assert.equal(item(f, one).fm.wait_on, 'run 397 deploy');
  ok(f, one, '--note', 'run 397 green'); // the next --note ends it: active again
  assert.ok(!item(f, one).fm.wait_on);
  ok(f, two, '--review', 'changes', '--by', 'archy', '--comments', 'fix y per references/review/tests.md');
  const four = make(f, 'js', f.cons, 'rule four', ['--work-class', 'app-code']);
  r = refuse(f, four, '--claim', 'cody'); // 'changes' verdict counts as active
  assert.ok(r.status === 1 && r.stdout.includes(one) && r.stdout.includes(two), r.stdout);
  ok(f, four, '--claim', 'cody', '--force'); // --force overrides, recorded
  assert.ok(readFileSync(join(f.folder, 'phases', `${four}.md`), 'utf8').includes('--force past the claim rule'));
  ok(f, four, '--release', 'cody');
  ok(f, one, '--waiting', 'x', '--by', 'cody');
  ok(f, one, '--waiting-done', '--by', 'cody');
  assert.ok(!item(f, one).fm.wait_on);
  assert.equal(refuse(f, one, '--waiting', 'x', '--by', 'archy').status, 1); // only the holder records a wait
});

test('test_review_refs_roster_fallback_and_review_first', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'poprefs');
  const bad = cli(['new', '--name', 'no refs', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--work-class', 'iac',
    '--review-classes', 'iac,security', '--review-refs', 'references/review/iac.md'], { cwd: f.cons, tmp: f.t });
  assert.ok(bad.status === 1 && bad.stdout.includes('uncovered: security'), bad.stdout);
  const job = make(f, 'js', f.cons, 'refs job', ['--work-class', 'iac', '--review-classes', 'contract', '--review-refs',
    'references/review/contract.example.md,references/patterns/x.md']);
  let r = cli(['query', '--pop', '--agent', 'archy', '--classes', 'iac', '--json'], { cwd: f.cons, tmp: f.t });
  assert.ok(JSON.parse(r.stdout).instruction.includes('definition of done: references/review/contract.example.md, references/patterns/x.md'), r.stdout + r.stderr);
  ok(f, job, '--claim', 'archy');
  ok(f, job, '--request-review', 'any', '--note', 'commit abc');
  const roster = join(f.t, 'team.json');
  writeFileSync(roster, JSON.stringify({ cody: { work_classes: ['app-code'], review_classes: ['code'] }, archy: { work_classes: ['iac'], review_classes: ['iac', 'contract'] } }));
  assert.notEqual(pop(f, '--classes', 'app-code', '--review-classes', 'code').action, 'review'); // no roster: classes only
  let p = pop(f, '--classes', 'app-code', '--review-classes', 'code', '--roster', roster); // only the claimer holds contract
  assert.deepEqual([p.action, p.item], ['review', job]);
  assert.ok(p.instruction.includes('review per references/review/contract.md (cody-coding-model'));
  assert.ok(p.instruction.includes('load its review_refs first: references/review/contract.example.md'));
  r = cli(['query', '--reviewable', '--classes', 'code', '--agent', 'cody', '--roster', roster, '--json'], { cwd: f.cons, tmp: f.t });
  assert.deepEqual(JSON.parse(r.stdout).map(x => x.slug), [job]);
  r = refuse(f, job, '--review', 'pass', '--by', 'cody', '--comments', 'looks fine'); // must cite a ref
  assert.ok(r.status === 1 && r.stdout.includes('must cite'), r.stdout);
  r = ok(f, job, '--review', 'pass', '--by', 'cody', '--comments', 'per references/patterns/x.md: fine');
  assert.ok(r.stdout.includes('CLOSE NOW: archy closes it') && r.stdout.includes('cody closes it (--close --by cody'));
  ok(f, job, '--set-review-refs', 'references/review/contract.md');
  r = refuse(f, job, '--set-review-refs', 'references/review/iac.md');
  assert.ok(r.status === 1 && r.stdout.includes('no review ref covers contract'), r.stdout);
  ok(f, job, '--close', '--summary', 'done');
  // an old review request goes before the agent's own work
  const mine = make(f, 'js', f.cons, 'own job', ['--work-class', 'app-code']);
  const other = make(f, 'js', f.cons, 'other job', ['--work-class', 'tests', '--review-classes', 'code']);
  ok(f, other, '--claim', 'archy');
  ok(f, other, '--request-review', 'any', '--note', 'commit def');
  ok(f, mine, '--claim', 'cody');
  assert.equal(pop(f, '--classes', 'app-code', '--review-classes', 'code').item, mine); // fresh request: own work first
  const old = popCli(f, ['--classes', 'app-code', '--review-classes', 'code', '--json'], { env: { BACKLOG_REVIEW_FIRST_SECONDS: '0' } });
  p = JSON.parse(old.stdout);
  assert.deepEqual([p.action, p.item], ['review', other]);
});

// test_team_pop_compat.py: without the new flags every query prints what it printed before.
test('test_no_new_flags_unchanged', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'compat-a');
  const s = make(f, 'js', f.cons, 'compat job', ['--work-class', 'docs']);
  git(f.cons, 'checkout', '-q', '-b', 'compat-b');
  const other = make(f, 'js', f.cons, 'compat job of another branch', ['--work-class', 'docs']);
  git(f.cons, 'checkout', '-q', 'compat-a');
  const q = (...a) => cli(['query', ...a], { cwd: f.cons, tmp: f.t });
  for (const mode of [['--claimable', '--classes', 'docs'], ['--reviewable', '--classes', 'docs'], ['--blocked']]) {
    const plain = q(...mode);
    assert.ok(plain.status === 0 && plain.stdout === q(...mode, '--scope', 'branch').stdout);
    assert.ok(plain.stdout.includes('item(s) — acme/demo, branch compat-a, P0 = next:'));
    assert.ok(!plain.stdout.includes(other));
  }
  const c = q('--claimable', '--classes', 'docs').stdout;
  assert.ok(c.includes(`   P0   ${s} (pending) — compat job\n        work_class=docs review_classes=code claimed_by=- review=none`), c);
  assert.ok(q('--claimable', '--classes', 'docs', '--all').stdout.includes(other)); // --all as before
  const n = q('--next'); // the owner-facing pop keeps its readiness-brief mandate
  assert.ok(n.status === 0 && n.stdout.includes(`NEXT: P0 (rank 0 = next) — [${String(Number(s.split('-')[0])).padStart(3)}] ${s}`), n.stdout);
  assert.ok(n.stdout.includes('NEXT-STEPS-MANDATE'));
});

// test_team_scope.py:40-52: the --pop assertions of the scope test.
test('--pop with --scope all and the refinement_scope cap of backlog.scope', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'scope-a');
  make(f, 'js', f.other, 'scope chunk other repository', ['--work-class', 'chunk']);
  make(f, 'js', f.cons, 'scope docs here', ['--work-class', 'docs']);
  const t = (...a) => cli(['query', '--pop', '--agent', 't', '--json', ...a], { cwd: f.cons, tmp: f.t });
  try {
    writeFileSync(f.cfg, 'refinement_scope: all\n');
    let p = t('--classes', 'ui', '--scope', 'all');
    assert.ok(p.status === 0 && JSON.parse(p.stdout).action === 'chunk', p.stdout + p.stderr);
    assert.equal(JSON.parse(p.stdout).repository, 'other/thing');
    assert.ok(JSON.parse(p.stdout).instruction.includes('(repository other/thing: work from its clone)'));
    writeFileSync(f.cfg, 'refinement_scope: off\n');
    p = t('--classes', 'ui,chunk');
    assert.ok(p.status === 3 && JSON.parse(p.stdout).action === 'idle', p.stdout + p.stderr);
  } finally { rmSync(f.cfg, { force: true }); }
});

test('--plan, --agents and --critical stay refused with --pop', () => {
  const f = fixture();
  make(f, 'js', f.cons, 'x', ['--work-class', 'docs']);
  for (const args of [['query', '--plan'], ['query', '--pop', '--agent', 't', '--plan'], ['pop', '--agent', 't', '--plan'],
    ['query', '--agents', 'a,b'], ['pop', '--agent', 't', '--critical'], ['pop', '--agent', 't', '--headless']]) {
    const r = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
});

// A fixture with a state for every action, built with the oracle. Agents: busy (continue), closer (close a passed item),
// rev (review), newbie (claim), lead1 (refine), sleepy (awaits a review, then idle with blockers), waiter (waits, then claim).
function states() {
  const f = fixture();
  const m = (cwd, name, extra) => make(f, 'py', cwd, name, extra);
  const up = (slug, ...args) => upWith('py')(f, slug, ...args);
  const a = m(f.cons, 'dep first', ['--work-class', 'tests']);
  m(f.cons, 'needs first', ['--work-class', 'app-code,tests', '--depends-on', '1']);
  m(f.cons, 'free impl', ['--work-class', 'app-code']);
  const d = m(f.cons, 'ui held', ['--work-class', 'ui', '--review-classes', 'ui,code']);
  const g = m(f.cons, 'busy item', ['--work-class', 'app-code', '--review-classes', 'code']);
  const h = m(f.cons, 'sleepy item', ['--work-class', 'docs']);
  const p = m(f.cons, 'passed item', ['--work-class', 'docs']);
  const w = m(f.cons, 'waiting item', ['--work-class', 'docs']);
  m(f.cons, 'chunk item', ['--work-class', 'chunk']);
  const bare = py('new_phase.py', ['--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t });
  assert.equal(bare.status, 0, bare.stdout);
  up(a, '--claim', 'archy');
  up(d, '--claim', 'holder');
  up(d, '--request-review', 'any', '--note', 'ready');
  up(g, '--claim', 'busy');
  up(h, '--claim', 'sleepy');
  up(h, '--request-review', 'any', '--note', 'ready');
  up(p, '--claim', 'closer');
  up(p, '--request-review', 'any', '--note', 'ready');
  up(p, '--review', 'pass', '--by', 'archy', '--comments', 'ok references/review/code.md');
  up(w, '--claim', 'waiter');
  up(w, '--waiting', 'run 9', '--by', 'waiter');
  git(f.cons, 'checkout', '-q', '-b', 'side');
  m(f.cons, 'side impl', ['--work-class', 'app-code']);
  m(f.cons, 'side chunk', ['--work-class', 'chunk']);
  git(f.cons, 'checkout', '-q', 'main');
  m(f.other, 'other chunk', ['--work-class', 'chunk']);
  m(f.other, 'other impl', ['--work-class', 'app-code']);
  writeFileSync(join(f.t, 'roster.json'), JSON.stringify({ busy: { work_classes: ['app-code'], review_classes: ['code'] }, rev: { work_classes: ['ui'], review_classes: ['ui'] } }));
  return f;
}

test('parity with query.py --pop: every action prints, refuses and exits alike', t => {
  if (!oracle) return t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing');
  const f = states();
  const roster = join(f.t, 'roster.json');
  const actions = new Set();
  const same = (args, env) => {
    const o = py('query.py', args, { cwd: f.cons, tmp: f.t, env });
    for (const cmd of [['query'], ['pop']]) {
      const n = cli([...cmd, ...args.filter(x => !(cmd[0] === 'pop' && x === '--pop'))], { cwd: f.cons, tmp: f.t, env });
      assert.deepEqual([n.status, n.stdout, n.stderr], [o.status, o.stdout, o.stderr], `${cmd[0]} ${args.join(' ')}`);
    }
    if (args.includes('--json') && o.stdout.startsWith('{"action"')) actions.add(JSON.parse(o.stdout).action);
    return o;
  };
  const cases = [
    ['--agent', 'busy', '--classes', 'app-code'], // continue
    ['--agent', 'closer', '--classes', 'docs'], // continue: close
    ['--agent', 'rev', '--classes', 'ui', '--review-classes', 'ui'], // review (class holder)
    ['--agent', 'rev', '--classes', 'ui', '--review-classes', 'ui', '--roster', roster],
    ['--agent', 'busy', '--classes', 'app-code', '--review-classes', 'code', '--roster', roster],
    ['--agent', 'newbie', '--classes', 'app-code,tests'], // claim
    ['--agent', 'newbie', '--classes', 'app-code,chunk'],
    ['--agent', 'lead1', '--lead', 'lead1'], // refine
    ['--agent', 'lead1', '--lead', 'lead1', '--classes', 'chunk'],
    ['--agent', 'x', '--classes', 'chunk'], // chunk
    ['--agent', 'x', '--classes', 'ui', '--scope', 'repo'],
    ['--agent', 'x', '--classes', 'ui', '--scope', 'all'],
    ['--agent', 'x', '--classes', 'ui', '--all'],
    ['--agent', 'x', '--classes', 'app-code', '--branch', 'side'],
    ['--agent', 'idler', '--classes', 'ui'], // idle with blockers
    ['--agent', 'sleepy', '--classes', 'docs'], // awaiting review: claim or idle
    ['--agent', 'waiter', '--classes', 'docs'],
    ['--agent', 'waiter', '--classes', 'app-code'],
    ['--agent', 'nobody'],
  ];
  for (const base of cases) {
    for (const json of [[], ['--json']]) {
      same(['--pop', ...base, ...json]);
    }
  }
  for (const base of cases.slice(0, 5)) same(['--pop', ...base, '--json'], { BACKLOG_REVIEW_FIRST_SECONDS: '0' }); // old review requests go first
  for (const json of [[], ['--json']]) {
    const args = ['--next', '--agent', 'busy', '--classes', 'app-code', ...json];
    const o = py('query.py', args, { cwd: f.cons, tmp: f.t });
    const n = cli(['next', ...args.slice(1)], { cwd: f.cons, tmp: f.t });
    assert.deepEqual([n.status, n.stdout, n.stderr], [o.status, o.stdout, o.stderr]);
    same(args);
  }
  for (const cap of ['all', 'repo', 'off', 'branch', 'everywhere']) {
    writeFileSync(f.cfg, `refinement_scope: ${cap}\n`);
    try {
      for (const scope of ['branch', 'repo', 'all']) {
        same(['--pop', '--agent', 'x', '--classes', 'ui,chunk', '--scope', scope, '--json']);
      }
    } finally { rmSync(f.cfg, { force: true }); }
  }
  for (const a of ['idle', 'continue', 'review', 'claim', 'refine', 'chunk']) assert.ok(actions.has(a), `no fixture state produced ${a}: ${[...actions]}`);
  // refusals
  same(['--pop']);
  same(['--pop', '--agent', 'x', '--classes', 'bogus']);
  same(['--pop', '--agent', 'x', '--review-classes', 'bogus']);
  const galaxy = cli(['pop', '--agent', 'x', '--scope', 'galaxy'], { cwd: f.cons, tmp: f.t }); // argparse usage text is not copied
  assert.ok(galaxy.status === 2 && galaxy.stderr.includes("argument --scope: invalid choice: 'galaxy' (choose from 'branch', 'repo', 'all')"), galaxy.stderr);
  const gone = cli(['pop', '--agent', 'x', '--roster', join(f.t, 'nope.json')], { cwd: f.cons, tmp: f.t });
  assert.equal(gone.status, 2); // the operating system's wording of the error differs from Python's: no byte comparison
  assert.ok(gone.stderr.startsWith(`❌ backlog: roster ${join(f.t, 'nope.json')}: `), gone.stderr);
  for (const env of [{ TEAM_REPOSITORY: 'acme/demo' }, { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'side' }, { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' }, { TEAM_REPOSITORY: 'nonsense' }, { TEAM_ROSTER: roster }, { TEAM_LEAD: 'lead1' }]) {
    same(['--pop', '--agent', 'x', '--classes', 'app-code,chunk', '--json'], env);
    same(['--pop', '--agent', 'x', '--branch', 'side', '--json'], env);
  }
  git(f.cons, 'checkout', '-q', '--detach');
  same(['--pop', '--agent', 'x', '--classes', 'ui']);
  same(['--pop', '--agent', 'x', '--classes', 'ui', '--all']);
  git(f.cons, 'checkout', '-q', 'main');
  // a repository without a backlog yet
  const empty = consumer(f.t, 'acme', 'empty', 'main');
  for (const args of [['--pop', '--agent', 'x'], ['--pop', '--agent', 'x', '--json']]) {
    const o = py('query.py', args, { cwd: empty, tmp: f.t });
    const n = cli(['pop', ...args.slice(1)], { cwd: empty, tmp: f.t });
    assert.deepEqual([n.status, n.stdout, n.stderr], [o.status, o.stdout, o.stderr]);
  }
});

test('--claim-now after the oracle claimed: the held item is continued, not claimed twice', t => {
  if (!oracle) return t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing');
  const f = fixture();
  const job = make(f, 'py', f.cons, 'claim now twin', ['--work-class', 'app-code']);
  // the oracle claims in its own run; the CLI then finds the item held by cody and offers continue, claimed false
  const o = py('query.py', ['--pop', '--agent', 'cody', '--classes', 'app-code', '--claim-now', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(o.status, 0, o.stdout + o.stderr);
  assert.equal(JSON.parse(o.stdout).claimed, true);
  assert.equal(item(f, job).fm.claimed_by, 'cody');
  const n = cli(['pop', '--agent', 'cody', '--classes', 'app-code', '--claim-now', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(JSON.parse(n.stdout).action, 'continue');
  assert.equal(JSON.parse(n.stdout).claimed, false);
});

test('credentials in a wait are redacted in the text and the JSON of the pop (blocked and held)', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-secret');
  const held = make(f, 'js', f.cons, 'pop waits on a url', ['--work-class', 'app-code']);
  ok(f, held, '--claim', 'cody');
  const { fm, body } = item(f, held);
  store.write({ path: join(f.folder, 'phases', `${held}.md`), fm: { ...fm, wait_on: 'https://user:hunter2secret@host/run' }, body }, f.folder);
  for (const args of [[], ['--json']]) {
    for (const cmd of [['query', '--pop'], ['pop']]) {
      const r = cli([...cmd, '--agent', 'cody', '--classes', 'app-code', ...args], { cwd: f.cons, tmp: f.t });
      assert.equal(r.status, 3, r.stdout + r.stderr); // idle: it only waits
      assert.ok(r.stdout.includes('https://host/run'), r.stdout); // the wait is still named
      assert.ok(!(r.stdout + r.stderr).includes('hunter2secret'), `${cmd.join(' ')} ${args}: ${r.stdout}${r.stderr}`);
    }
  }
});

// A preload that makes the `update` subprocess of --claim-now fail (the pop itself is argv[2] pop or query).
function claimOutcome(kind) {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', `pop-${kind}`);
  const job = make(f, 'js', f.cons, 'pop claim fails', ['--work-class', 'app-code']);
  const hook = join(f.t, 'hook.cjs');
  writeFileSync(hook, kind === 'killed'
    ? "if (process.argv[2] === 'update') process.kill(process.pid, 'SIGTERM');\n"
    : kind === 'late' // the claim is saved in the item file; the process is stopped before its commit
    ? "const cp = require('node:child_process'); const run = cp.execFile;\ncp.execFile = function (file, args) { if (process.argv[2] === 'update' && file === 'git' && args.includes('commit')) process.kill(process.pid, 'SIGTERM'); return run.apply(this, arguments); };\n"
    : "if (process.argv[2] === 'update') { process.stderr.write('fatal: https://user:hunter2secret@host/x\\n'); process.exit(1); }\n");
  const env = { NODE_OPTIONS: `--require=${hook}` };
  const r = cli(['pop', '--agent', 'cody', '--classes', 'app-code', '--claim-now', '--json'], { cwd: f.cons, tmp: f.t, env });
  return { f, job, r };
}

test('--claim-now: an interrupted claim process is a failure, not a claim', () => {
  const { f, job, r } = claimOutcome('killed');
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!r.stdout.includes('"claimed": true'), r.stdout);
  assert.match(r.stderr, /claim of .* failed/);
  assert.ok(!item(f, job).fm.claimed_by);
});

test('--claim-now: a claim interrupted after it was saved is reported as a failure but is not undone, and the help does not promise otherwise', () => {
  const { f, job, r } = claimOutcome('late');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /claim of .* failed/);
  assert.equal(item(f, job).fm.claimed_by, 'cody', 'the saved claim stays in the item file');
  assert.doesNotMatch(HELP.pop, /nothing is claimed/);
  assert.match(HELP.pop, /check the item/);
  assert.doesNotMatch(readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8'), /nothing is claimed/);
});

test('--claim-now: the diagnostics of a failed claim are forwarded with its exit code and without credentials', () => {
  const { r } = claimOutcome('exits');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes('fatal: https://host/x'), r.stdout + r.stderr);
  assert.ok(!(r.stdout + r.stderr).includes('hunter2secret'), r.stdout + r.stderr);
});

test('the exit codes of query --pop and next --agent are described: 3 is idle, 1 a claim that failed', () => {
  for (const command of ['query', 'next']) {
    assert.match(HELP[command], /With --pop[^]*exit codes are those of backlog pop[^]*3 the action is idle[^]*1 a --claim-now claim was refused or could not run/, command);
  }
  assert.match(HELP.pop, /1 {2}A --claim-now claim was refused or could not be run/);
});

test('the JSON of the pop stays valid when a credential follows a non-ASCII character (redaction before serialization)', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-unicode');
  make(f, 'js', f.cons, 'pop unicode agent', ['--work-class', 'app-code']);
  const agent = 'https://\u00e9user:review_dummy@host/path';
  for (const cmd of [['query', '--pop'], ['pop']]) {
    const r = cli([...cmd, '--agent', agent, '--classes', 'docs', '--json'], { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 3, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout); // invalid JSON if the escape \u00e9 was cut
    assert.ok(out.instruction.includes('host/path'), r.stdout);
    assert.ok(!(r.stdout + r.stderr).includes('review_dummy'), r.stdout + r.stderr);
  }
});
