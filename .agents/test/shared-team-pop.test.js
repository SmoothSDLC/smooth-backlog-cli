// Tests for `backlog pop` (src/shared/pop.js) - cli-parity job 20 (POP).
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';
import { HELP } from '../../src/help.js';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-pop-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer' }] } })); // t1 asks one peer review of its work, as the items here were reviewed before
  const cons = consumer(t, 'acme', 'demo', 'main');
  const other = consumer(t, 'other', 'thing', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, other, folder: join(home, 'acme', 'demo'), cfg: join(home, 'acme', 'demo', 'backlog.scope') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
function make(f, cwd, name, extra = []) {
  const has = k => extra.includes(k);
  const args = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  // A team item names its review documents; the default is references/review/code.md. '--no-review-refs' (this helper's own flag) makes an item without any.
  const bare = has('--no-review-refs'); extra = extra.filter(x => x !== '--no-review-refs');
  if (!has('--review-refs') && !bare) args.push('--review-refs', 'references/review/code.md');
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  args.push('--body', DOD, ...extra);
  const r = cli(['new', ...args], { cwd, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = r.stdout.split('created phase ')[1].split(' ')[0];
  const t = cli(['update', slug, '--set-team', 't1', '--status', 'ready'], { cwd, tmp: f.t, env: { BACKLOG_AGENT: '' } }); // team pop acts as its --team: only the items of t1 are in reach (set after creation: no refinement stage, status ready)
  assert.equal(t.status, 0, t.stdout + t.stderr);
  return slug;
}
const item = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));
const ok = (f, slug, ...args) => {
  let extra = {};
  const last = args[args.length - 1];
  if (last && typeof last === 'object' && !Array.isArray(last)) extra = args.pop(); // a trailing { env } object
  const who = ['--by', '--claim', '--release'].map(k => args[args.indexOf(k) + 1]).find((v, i) => args.includes(['--by', '--claim', '--release'][i]));
  if (who) cli(['query', '--phase', slug, '--agent', who], { cwd: f.cons, tmp: f.t }); // an agent reads an item before it writes it again (seen.js)
  const r = cli(['update', slug, ...args], { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '', BACKLOG_SESSION: '', ...extra.env } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r;
};
// a release puts a team item back to new, where no claim reaches it: it is taken out of the team and made ready again, as `make` does
const handOver = (f, slug, to) => { ok(f, slug, '--release', 'ann'); ok(f, slug, '--set-team', '', '--by', 'ann'); ok(f, slug, '--status', 'ready', '--set-team', 't1', '--by', 'ann'); ok(f, slug, '--claim', to); };
const refuse = (f, slug, ...args) => cli(['update', slug, ...args], { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '', BACKLOG_SESSION: '' } });
// ann is a plain member here; popLead asks as the team lead, who does no chunk work.
const LEAD = { TEAM_LEAD: 'lead' };
const popCli = (f, args, opts = {}) => cli(['team', 'pop', '--team', 't1', '--agent', 'ann', ...args], { cwd: f.cons, tmp: f.t, ...opts, env: { ...LEAD, ...opts.env } });

// The JSON of pop: exit 3 exactly when the action is idle.
function pop(f, ...args) { return popAs(f, LEAD, ...args); }
function popLead(f, ...args) { return popAs(f, { TEAM_LEAD: 'ann' }, ...args); }
function popAs(f, env, ...args) {
  const r = popCli(f, ['--json', ...args], { env });
  assert.ok([0, 3].includes(r.status), r.stdout + r.stderr);
  assert.equal(r.stderr, '', r.stdout + r.stderr); // the JSON of a successful pop has no stderr
  const out = JSON.parse(r.stdout);
  assert.equal(r.status === 3, out.action === 'idle', r.stdout);
  return out;
}

test('test_pop_precedence_and_claim_now: continue > review > claim > chunk > idle, team pop claims', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-a'); // a queue of this test only
  const dep = make(f, f.cons, 'pop dependency', ['--review-refs', 'references/review/tests.md']);
  const blocked = make(f, f.cons, 'pop blocked', ['--depends-on', dep.split('-')[0]]);
  ok(f, dep, '--claim', 'bob');

  let p = popLead(f); // (e) nothing for the lead: idle, with blockers
  assert.ok(p.action === 'idle' && p.item === null);
  assert.deepEqual(p.blocked, [{ item: blocked, waiting_on: [{ id: String(Number(dep.split('-')[0])), slug: dep, status: 'in progress', claimed_by: 'bob' }] }]);
  const text = popCli(f, [], { env: { TEAM_LEAD: 'ann' } });
  assert.equal(text.status, 3, text.stdout + text.stderr);
  assert.equal(text.stderr, '');
  assert.equal(text.stdout, `idle\n   your team works on 2 item(s) (1, 2): end your turn now with a text-only reply and no tool call; do not poll, the dispatcher wakes you\n   blocked ${blocked}: waits on ${dep} (status in progress, claimed by bob)\n`);
  assert.equal(pop(f).action, 'chunk'); // a team member with nothing else does small chunk work; only the lead is idle
  const chunk = make(f, f.cons, 'pop chunk', ['--chunk']);
  p = pop(f); // (d) the chunk item is named
  assert.deepEqual([p.action, p.item], ['chunk', chunk]);
  assert.ok(p.instruction.includes('CHUNK <time>'));
  const job = make(f, f.cons, 'pop job', []);
  assert.notEqual(popLead(f).action, 'claim'); // the lead never claims
  assert.notEqual(popLead(f).action, 'claim');
  assert.ok(!item(f, job).fm.claimed_by);
  p = pop(f); // (c) claim beats chunk; team pop claims what it offers
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', job, true]);
  assert.equal(item(f, job).fm.claimed_by, 'ann');
  const spare = make(f, f.cons, 'pop spare job', []);
  ok(f, dep, '--request-review', 'any', '--note', 'tests in commit abc');
  const z = JSON.parse(cli(['team', 'pop', '--team', 't1', '--agent', 'zed', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD }).stdout);
  assert.deepEqual([z.action, z.item], ['review', dep]); // (b) review beats claim; any member but the author
  assert.ok(z.instruction.includes('--review pass|changes --by zed') && spare);
  p = pop(f); // (a) continue beats review
  assert.deepEqual([p.action, p.item], ['continue', job]);
  const n = cli(['team', 'pop', '--team', 't1', '--agent', 'ann'], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.ok(n.status === 0 && n.stdout.startsWith(`continue ${job}\n`), n.stdout + n.stderr);
  ok(f, dep, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/tests.md'); // zed's team pop started the review
  assert.ok(cli(['team', 'pop', '--team', 't1'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '' } }).stderr.includes('needs --agent'));
});

test('075: the pop of an idle lead and of a claimable item prints its text and its JSON exactly, with empty stderr', () => {
  const f = fixture();
  const dep = make(f, f.cons, '075 pop dependency', ['--review-refs', 'references/review/tests.md']);
  const blocked = make(f, f.cons, '075 pop blocked', ['--depends-on', dep.split('-')[0]]);
  ok(f, dep, '--claim', 'bob');
  // the lead sees idle with the blocker: the text, word for word
  const idleText = popCli(f, [], { env: { TEAM_LEAD: 'ann' } });
  assert.equal(idleText.status, 3, idleText.stdout + idleText.stderr);
  assert.equal(idleText.stderr, '');
  assert.equal(idleText.stdout, `idle\n   your team works on 2 item(s) (1, 2): end your turn now with a text-only reply and no tool call; do not poll, the dispatcher wakes you\n   blocked ${blocked}: waits on ${dep} (status in progress, claimed by bob)\n`);
  // the same state as JSON: the keys of the document and the blocked entry
  const idleJson = popCli(f, ['--json'], { env: { TEAM_LEAD: 'ann' } });
  assert.equal(idleJson.status, 3, idleJson.stdout + idleJson.stderr);
  assert.equal(idleJson.stderr, '');
  const idle = JSON.parse(idleJson.stdout);
  assert.deepEqual(Object.keys(idle), ['action', 'item', 'seq', 'team', 'repository', 'branch', 'instruction', 'claimed', 'blocked', 'held', 'marked', 'skipped', 'front_matter', 'body']);
  assert.deepEqual([idle.action, idle.item, idle.seq, idle.team, idle.claimed, idle.marked, idle.front_matter, idle.body], ['idle', null, null, 't1', false, null, null, null]);
  assert.deepEqual(idle.blocked, [{ item: blocked, waiting_on: [{ id: String(Number(dep.split('-')[0])), slug: dep, status: 'in progress', claimed_by: 'bob' }] }]);
  // the claim the member gets instead: team pop claims it and prints it, text and JSON, exit 0
  const job = make(f, f.cons, '075 pop job', []);
  const claimText = popCli(f, [], { env: LEAD });
  assert.equal(claimText.status, 0, claimText.stdout + claimText.stderr);
  assert.equal(claimText.stderr, '');
  assert.ok(claimText.stdout.startsWith(`claim ${job}\n   marked: claimed for ann\n   claimed for ann: start the work and record each step in the item; definition of done: references/review/code.md (the review-documents repository: load them before working)\n`), claimText.stdout);
  assert.ok(claimText.stdout.includes(`--- item ${job}: front matter ---\n`) && claimText.stdout.includes(`--- item ${job}: body ---\n`), claimText.stdout);
  const job2 = make(f, f.cons, '075 pop second job', []);
  const claimJson = cli(['team', 'pop', '--team', 't1', '--agent', 'cy', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.equal(claimJson.status, 0, claimJson.stdout + claimJson.stderr);
  assert.equal(claimJson.stderr, '');
  const claim = JSON.parse(claimJson.stdout);
  assert.deepEqual([claim.action, claim.item, claim.seq, claim.claimed, claim.marked, claim.front_matter.claimed_by, claim.skipped], ['claim', job2, 4, true, 'claimed for cy', 'cy', []]);
  assert.equal(item(f, job2).fm.claimed_by, 'cy');
});

test('test_pop_held_item_awaiting_review_is_not_continue_and_a_passed_one_is_closed', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'popwait');
  const job = make(f, f.cons, 'wait job', ['--review-refs', 'references/review/tests.md']);
  ok(f, job, '--claim', 'ann');
  ok(f, job, '--request-review', 'any', '--note', 'commit abc, run 1');
  const other = make(f, f.cons, 'wait other', []);
  let p = pop(f); // awaiting a verdict: falls through to claim
  assert.deepEqual([p.action, p.item], ['claim', other]);
  handOver(f, other, 'bob'); // team pop claimed it for ann: bob takes it over
  p = popLead(f); // nothing else for the lead: idle, the wait is reported
  const seq = item(f, job).fm.seq;
  assert.equal(p.action, 'idle');
  assert.deepEqual(p.blocked.find(b => b.item === job), { item: job, waiting_on: [`awaiting review: ${seq}`] });
  const text = popCli(f, [], { env: { TEAM_LEAD: 'ann' } });
  assert.ok(text.status === 3 && text.stdout.includes(`blocked ${job}: awaiting review: ${seq}`), text.stdout);
  ok(f, job, '--review', 'changes', '--by', 'bob', '--comments', 'fix x per references/review/tests.md');
  p = pop(f); // a 'changes' verdict is work: continue
  assert.deepEqual([p.action, p.item], ['continue', job]);
  assert.ok(p.instruction.includes('keep working'));
  ok(f, job, '--request-review', 'any', '--note', 'commit def');
  ok(f, job, '--review', 'pass', '--by', 'amy', '--comments', 'fine per references/review/tests.md'); // a reviewer other than the author passes
  p = pop(f); // the review passed on the same commit: close it
  assert.deepEqual([p.action, p.item], ['continue', job]);
  assert.ok(p.instruction.startsWith(`close ${seq} with --close --summary`));
});

test('test_claim_only_when_every_held_item_waits', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'popwait2');
  const [one, two, three] = ['rule one', 'rule two', 'rule three'].map((n, i) => make(f, f.cons, n, [...(i < 2 ? ['--review-refs', 'references/review/tests.md'] : [])]));
  ok(f, one, '--claim', 'ann');
  let r = refuse(f, two, '--claim', 'ann'); // one active item: no new claim
  assert.ok(r.status === 1 && r.stdout.includes(`holds 1 active item(s): ${one}`), r.stdout);
  let p = pop(f);
  assert.deepEqual([p.action, p.item], ['continue', one]);
  assert.ok(p.held.some(h => h.item === one && h.seq === p.seq && h.state === 'active'));
  ok(f, one, '--waiting', 'run 397 deploy', '--by', 'ann'); // an async wait: claim allowed
  p = pop(f);
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', two, true]);
  assert.ok(p.held.some(h => h.item === one && h.state === 'waiting:run 397 deploy'));
  ok(f, two, '--request-review', 'any', '--note', 'commit abc'); // two awaits review, one waits
  p = pop(f);
  assert.deepEqual([p.action, p.item], ['claim', three]);
  handOver(f, three, 'bob'); // team pop claimed it for ann: bob takes it over
  p = popLead(f);
  assert.equal(p.action, 'idle');
  assert.ok(p.blocked.some(b => b.item === one && b.waiting_on[0] === 'waiting: run 397 deploy'));
  ok(f, one, '--append', 'CHUNK 10:00 test x ok', '--by', 'ann'); // an append does not end the wait
  assert.equal(item(f, one).fm.wait_on, 'run 397 deploy');
  ok(f, one, '--note', 'run 397 green', '--by', 'ann'); // the next --note ends it: active again
  assert.ok(!item(f, one).fm.wait_on);
  ok(f, two, '--review', 'changes', '--by', 'bob', '--comments', 'fix y per references/review/tests.md');
  const four = make(f, f.cons, 'rule four', []);
  r = refuse(f, four, '--claim', 'ann'); // 'changes' verdict counts as active
  assert.ok(r.status === 1 && r.stdout.includes(one) && r.stdout.includes(two), r.stdout);
  ok(f, four, '--claim', 'ann', '--force'); // --force overrides, recorded
  assert.ok(readFileSync(join(f.folder, 'phases', `${four}.md`), 'utf8').includes('--force past the claim rule'));
  ok(f, four, '--release', 'ann');
  ok(f, one, '--waiting', 'x', '--by', 'ann');
  ok(f, one, '--waiting-done', '--by', 'ann');
  assert.ok(!item(f, one).fm.wait_on);
  assert.equal(refuse(f, one, '--waiting', 'x', '--by', 'bob').status, 1); // only the holder records a wait
});

test('test_review_refs_any_reviewer_and_review_first', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'poprefs');
  const job = make(f, f.cons, 'refs job', ['--review-refs',
    'references/review/contract.example.md,references/patterns/x.md']);
  let r = cli(['team', 'pop', '--team', 't1', '--agent', 'bob', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.ok(JSON.parse(r.stdout).instruction.includes('definition of done: references/review/contract.example.md, references/patterns/x.md'), r.stdout + r.stderr);
  ok(f, job, '--request-review', 'any', '--note', 'commit abc'); // the pop above claimed it for bob
  const roster = join(f.t, 'team.json');
  writeFileSync(roster, JSON.stringify({ ann: { work_classes: ['app-code'], review_classes: ['code'] }, bob: {} })); // old class profiles mean nothing
  assert.equal(pop(f).action, 'review'); // any member but the author
  let p = pop(f, '--roster', roster);
  assert.deepEqual([p.action, p.item], ['review', job]);
  assert.ok(!p.instruction.includes('you do not hold'));
  assert.ok(p.instruction.includes('load its review_refs first: references/review/contract.example.md'));
  r = cli(['team', 'query', '--team', 't1', '--reviewable', '--agent', 'ann', '--roster', roster, '--json'], { cwd: f.cons, tmp: f.t });
  assert.deepEqual(JSON.parse(r.stdout).map(x => x.slug), [job]);
  r = refuse(f, job, '--review', 'pass', '--by', 'ann', '--comments', 'looks fine'); // must cite a ref
  assert.ok(r.status === 1 && r.stdout.includes('must cite'), r.stdout);
  r = ok(f, job, '--review', 'pass', '--by', 'ann', '--comments', 'per references/patterns/x.md: fine');
  assert.ok(r.stdout.includes('CLOSE NOW: bob closes it') && r.stdout.includes('if the claimer has not, the team lead closes it') && !r.stdout.includes('ann closes it')); // never the reviewer
  ok(f, job, '--set-review-refs', 'references/review/contract.md', '--by', 'bob');
  ok(f, job, '--close', '--summary', 'done', '--by', 'bob');
  // the agent's own work goes before another member's review request, however old (spec section 5)
  const mine = make(f, f.cons, 'own job', []);
  const other = make(f, f.cons, 'other job', ['--review-refs', 'references/review/code.md']);
  ok(f, other, '--claim', 'bob');
  ok(f, other, '--request-review', 'any', '--note', 'commit def');
  ok(f, mine, '--claim', 'ann');
  assert.equal(pop(f).item, mine); // fresh request: own work first
  const old = popCli(f, ['--json'], { env: { BACKLOG_REVIEW_FIRST_SECONDS: '0' } });
  p = JSON.parse(old.stdout);
  assert.deepEqual([p.action, p.item], ['continue', mine]);
  ok(f, mine, '--request-review', 'any', '--note', 'commit ghi'); // handed off: now the review comes
  p = pop(f);
  assert.deepEqual([p.action, p.item], ['review', other]);
});

test('a roster member with review_only never claims; a missing roster is an error', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-review-only');
  const job = make(f, f.cons, 'review only job', []);
  const roster = join(f.t, 'team.json');
  writeFileSync(roster, JSON.stringify({ rev: { review_only: true }, ann: {} }));
  const as = (agent, ...args) => cli(['team', 'pop', '--team', 't1', '--agent', agent, '--roster', roster, '--json', ...args], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.equal(JSON.parse(as('rev').stdout).action, 'idle');
  assert.ok(!item(f, job).fm.claimed_by);
  const annPop = JSON.parse(as('ann').stdout);
  assert.deepEqual([annPop.action, annPop.item], ['claim', job]);
  const gone = cli(['team', 'pop', '--team', 't1', '--agent', 'ann', '--roster', join(f.t, 'missing.json')], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.equal(gone.status, 2);
  assert.ok(gone.stderr.startsWith(`❌ backlog: roster ${join(f.t, 'missing.json')}: `), gone.stderr);
});

// Without the new flags every query prints what it printed before.
test('test_no_new_flags_unchanged', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'compat-a');
  const s = make(f, f.cons, 'compat job', []);
  git(f.cons, 'checkout', '-q', '-b', 'compat-b');
  const other = make(f, f.cons, 'compat job of another branch', []);
  git(f.cons, 'checkout', '-q', 'compat-a');
  const q = (...a) => cli(['team', 'query', '--team', 't1', ...a], { cwd: f.cons, tmp: f.t });
  for (const mode of [['--claimable'], ['--reviewable', '--agent', 'ann'], ['--blocked']]) {
    const plain = q(...mode);
    assert.ok(plain.status === 0 && plain.stdout === q(...mode, '--scope', 'branch').stdout);
    assert.ok(plain.stdout.includes('item(s) — acme/demo, branch compat-a, P0 = next:'));
    assert.ok(!plain.stdout.includes(other));
  }
  const c = q('--claimable').stdout;
  assert.ok(c.includes(`   P0   ${s} (ready) — compat job\n        review_refs=references/review/code.md claimed_by=- review=none`), c);
  assert.ok(q('--claimable', '--all').stdout.includes(other)); // --all as before
  const n = q('--next');
  assert.ok(n.status === 0 && n.stdout.includes(`NEXT: P0 (rank 0 = next) — [${String(Number(s.split('-')[0])).padStart(3)}] ${s}`), n.stdout);
});

// The pop assertions of the scope rules.
test('pop with --scope all and the refinement_scope cap of backlog.scope', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'scope-a');
  make(f, f.other, 'scope chunk other repository', ['--chunk']);
  const here = make(f, f.cons, 'scope docs here', []);
  ok(f, here, '--claim', 'bob'); // nothing else claimable: the pop has only chunk work
  const t = (...a) => cli(['team', 'pop', '--team', 't1', '--agent', 't', '--json', ...a], { cwd: f.cons, tmp: f.t, env: LEAD });
  try {
    writeFileSync(f.cfg, 'refinement_scope: all\n');
    let p = t('--scope', 'all');
    assert.ok(p.status === 0 && JSON.parse(p.stdout).action === 'chunk', p.stdout + p.stderr);
    assert.equal(JSON.parse(p.stdout).repository, 'other/thing');
    assert.ok(JSON.parse(p.stdout).instruction.includes('(repository other/thing: work from its clone)'));
    writeFileSync(f.cfg, 'refinement_scope: off\n');
    p = t();
    assert.ok(p.status === 3 && JSON.parse(p.stdout).action === 'idle', p.stdout + p.stderr);
  } finally { rmSync(f.cfg, { force: true }); }
});

test('--agents without --plan and --critical stay refused with pop', () => {
  const f = fixture();
  make(f, f.cons, 'x', []);
  for (const args of [['query', '--agents', 'a,b'], ['team', 'pop', '--team', 't1', '--agent', 't', '--agents', 'a'], ['team', 'pop', '--team', 't1', '--agent', 't', '--critical']]) {
    const r = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
});

test('credentials in a wait are redacted in the text and the JSON of the pop (blocked and held)', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-secret');
  const held = make(f, f.cons, 'pop waits on a url', []);
  ok(f, held, '--claim', 'ann');
  ok(f, make(f, f.cons, 'pop team work', []), '--claim', 'bob'); // the team is at work: the lead has nothing to continue
  const { fm, body } = item(f, held);
  store.write({ path: join(f.folder, 'phases', `${held}.md`), fm: { ...fm, wait_on: 'https://user:hunter2secret@host/run' }, body }, f.folder);
  for (const args of [[], ['--json']]) {
    for (const cmd of [['team', 'pop', '--team', 't1']]) {
      const r = cli([...cmd, '--agent', 'ann', ...args], { cwd: f.cons, tmp: f.t, env: { TEAM_LEAD: 'ann' } }); // the lead, while its team works: idle, the wait reported
      assert.equal(r.status, 3, r.stdout + r.stderr); // idle: it only waits
      assert.ok(r.stdout.includes('https://host/run'), r.stdout); // the wait is still named
      assert.ok(!(r.stdout + r.stderr).includes('hunter2secret'), `${cmd.join(' ')} ${args}: ${r.stdout}${r.stderr}`);
    }
  }
});

// A preload that makes the `update` subprocess of --claim-now fail (a `team update` child of the pop: argv[3]; the pop itself is `team pop`).
function claimOutcome(kind) {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', `pop-${kind}`);
  const job = make(f, f.cons, 'pop claim fails', []);
  const hook = join(f.t, 'hook.cjs');
  writeFileSync(hook, kind === 'killed'
    ? "if (process.argv[3] === 'update') process.kill(process.pid, 'SIGTERM');\n"
    : kind === 'late' // the claim is saved in the item file; the process is stopped before its commit
    ? "const cp = require('node:child_process'); const run = cp.execFile;\ncp.execFile = function (file, args) { if (process.argv[3] === 'update' && file === 'git' && args.includes('commit')) process.kill(process.pid, 'SIGTERM'); return run.apply(this, arguments); };\n"
    : "if (process.argv[3] === 'update') { process.stderr.write('fatal: https://user:hunter2secret@host/x\\n'); process.exit(1); }\n");
  const env = { ...LEAD, NODE_OPTIONS: `--require=${hook}` }; // ann a member: the lead never claims
  const r = cli(['team', 'pop', '--team', 't1', '--agent', 'ann', '--json'], { cwd: f.cons, tmp: f.t, env });
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
  assert.equal(item(f, job).fm.claimed_by, 'ann', 'the saved claim stays in the item file');
  assert.doesNotMatch(HELP.team, /nothing is claimed/);
  assert.match(HELP.team, /check the item/);
  assert.doesNotMatch(readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8'), /nothing is claimed/);
});

test('--claim-now: the diagnostics of a failed claim are forwarded with its exit code and without credentials', () => {
  const { r } = claimOutcome('exits');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes('fatal: https://host/x'), r.stdout + r.stderr);
  assert.ok(!(r.stdout + r.stderr).includes('hunter2secret'), r.stdout + r.stderr);
});

test('the exit codes of backlog team pop are described: 3 is idle, 1 a claim that failed', () => {
  assert.match(HELP.team, /1 {2}A claim was refused or could not be run/);
});

test('the JSON of the pop stays valid when a credential follows a non-ASCII character (redaction before serialization)', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-unicode');
  make(f, f.cons, 'pop unicode agent', []);
  const agent = 'https://\u00e9user:review_dummy@host/path';
  for (const cmd of [['team', 'pop', '--team', 't1']]) {
    const r = cli([...cmd, '--agent', agent, '--json'], { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 0, r.stdout + r.stderr); // claim: the instruction names the agent
    const out = JSON.parse(r.stdout); // invalid JSON if the escape \u00e9 was cut
    assert.ok(out.instruction.includes('host/path'), r.stdout);
    assert.ok(!(r.stdout + r.stderr).includes('review_dummy'), r.stdout + r.stderr);
  }
});

test('pop --scope with an unknown scope exits 2 and names the choices', () => {
  const f = fixture();
  const galaxy = cli(['team', 'pop', '--team', 't1', '--agent', 'x', '--scope', 'galaxy'], { cwd: f.cons, tmp: f.t });
  assert.ok(galaxy.status === 2 && galaxy.stderr.includes("argument --scope: invalid choice: 'galaxy' (choose from 'branch', 'repo', 'all')"), galaxy.stderr);
});

test('pop --roster with a missing roster file exits 2 and names the file', () => {
  const f = fixture();
  make(f, f.cons, 'roster job');
  const gone = cli(['team', 'pop', '--team', 't1', '--agent', 'x', '--roster', join(f.t, 'nope.json')], { cwd: f.cons, tmp: f.t });
  assert.equal(gone.status, 2);
  assert.ok(gone.stderr.startsWith(`❌ backlog: roster ${join(f.t, 'nope.json')}: `), gone.stderr);
});

test('--claim-now on an item the agent already holds continues it and does not claim it twice', () => {
  const f = fixture();
  const job = make(f, f.cons, 'claim now held', []);
  const first = cli(['team', 'pop', '--team', 't1', '--agent', 'ann', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(JSON.parse(first.stdout).claimed, true);
  assert.equal(item(f, job).fm.claimed_by, 'ann');
  const n = cli(['team', 'pop', '--team', 't1', '--agent', 'ann', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.equal(JSON.parse(n.stdout).action, 'continue');
  assert.equal(JSON.parse(n.stdout).claimed, false);
});

// Every pop state in one backlog, built with the CLI: held, requested reviews, a pass, a wait, chunks, other branches and repositories.
function states() {
  const f = fixture();
  const m = (cwd, name, extra) => make(f, cwd, name, extra);
  const a = m(f.cons, 'dep first', []);
  m(f.cons, 'needs first', ['--depends-on', '1']);
  m(f.cons, 'free impl', []);
  const d = m(f.cons, 'ui held', ['--review-refs', 'references/review/ui.md,references/review/code.md']);
  const g = m(f.cons, 'busy item', ['--review-refs', 'references/review/code.md']);
  const h = m(f.cons, 'sleepy item', []);
  const p = m(f.cons, 'passed item', []);
  const w = m(f.cons, 'waiting item', []);
  m(f.cons, 'chunk item', ['--chunk']);
  m(f.cons, 'bare', ['--no-review-refs']);
  ok(f, a, '--claim', 'bob');
  ok(f, d, '--claim', 'holder');
  ok(f, d, '--request-review', 'any', '--note', 'ready', '--by', 'holder');
  ok(f, g, '--claim', 'busy');
  ok(f, h, '--claim', 'sleepy');
  ok(f, h, '--request-review', 'any', '--note', 'ready', '--by', 'sleepy');
  ok(f, p, '--claim', 'closer');
  ok(f, p, '--request-review', 'any', '--note', 'ready', '--by', 'closer');
  ok(f, p, '--review', 'pass', '--by', 'bob', '--comments', 'ok references/review/code.md');
  ok(f, w, '--claim', 'waiter');
  ok(f, w, '--waiting', 'run 9', '--by', 'waiter');
  return f;
}

test('in a backlog with every pop state, the requested reviews are started and the free item is claimed', () => {
  const f = states();
  for (const args of [['004-ui-held', '--start-review', '--by', 'rev'], ['006-sleepy-item', '--start-review', '--by', 'rev2'], ['003-free-impl', '--claim', 'free3']]) {
    const r = cli(['update', ...args], { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
});
