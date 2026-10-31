// Tests for `backlog pop` and `backlog query --pop` (src/shared/pop.js) - cli-parity job 20 (POP).
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
  const cons = consumer(t, 'acme', 'demo', 'main');
  const other = consumer(t, 'other', 'thing', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, other, folder: join(home, 'acme', 'demo'), cfg: join(home, 'acme', 'demo', 'backlog.scope') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
function make(f, cwd, name, extra = []) {
  const has = k => extra.includes(k);
  const args = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  // owner 2026-10-28: no classes. A team item names its review documents; the default is references/review/code.md
  // (conftest.Repos.new). '--no-review-refs' (this helper's own flag) makes an item without any.
  const bare = has('--no-review-refs'); extra = extra.filter(x => x !== '--no-review-refs');
  if (!has('--review-refs') && !bare) args.push('--review-refs', 'references/review/code.md');
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  args.push('--body', DOD, ...extra);
  const r = cli(['new', ...args], { cwd, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('created phase phases/')[1].split('.md')[0];
}
const item = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));
const ok = (f, slug, ...args) => {
  const who = ['--by', '--claim', '--release'].map(k => args[args.indexOf(k) + 1]).find((v, i) => args.includes(['--by', '--claim', '--release'][i]));
  if (who) cli(['query', '--phase', slug, '--agent', who], { cwd: f.cons, tmp: f.t }); // an agent reads an item before it writes it again (seen.js)
  const r = cli(['update', slug, ...args], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r;
};
const refuse = (f, slug, ...args) => cli(['update', slug, ...args], { cwd: f.cons, tmp: f.t });
// cody is a plain member here; popLead asks as the team lead, who does no chunk work.
const LEAD = { TEAM_LEAD: 'lead' };
const popCli = (f, args, opts = {}) => cli(['query', '--pop', '--agent', 'cody', ...args], { cwd: f.cons, tmp: f.t, ...opts, env: { ...LEAD, ...opts.env } });

// The JSON of --pop: exit 3 exactly when the action is idle. Unless the pop changes the backlog
// (--claim-now), `backlog pop` must print the same thing as `backlog query --pop`.
function pop(f, ...args) { return popAs(f, LEAD, ...args); }
function popLead(f, ...args) { return popAs(f, { TEAM_LEAD: 'cody' }, ...args); }
function popAs(f, env, ...args) {
  const r = popCli(f, ['--json', ...args], { env });
  assert.ok([0, 3].includes(r.status), r.stdout + r.stderr);
  assert.equal(r.stderr, '', r.stdout + r.stderr); // the JSON of a successful pop has no stderr
  const out = JSON.parse(r.stdout);
  assert.equal(r.status === 3, out.action === 'idle', r.stdout);
  if (!args.includes('--claim-now')) {
    const same = cli(['pop', '--agent', 'cody', '--json', ...args], { cwd: f.cons, tmp: f.t, env });
    assert.deepEqual([same.status, same.stdout, same.stderr], [r.status, r.stdout, r.stderr], 'backlog pop == backlog query --pop');
  }
  return out;
}

test('test_pop_precedence_and_claim_now: continue > review > claim > chunk > idle, --claim-now claims', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-a'); // a queue of this test only
  const dep = make(f, f.cons, 'pop dependency', ['--review-refs', 'references/review/tests.md']);
  const blocked = make(f, f.cons, 'pop blocked', ['--depends-on', dep.split('-')[0]]);
  ok(f, dep, '--claim', 'archy');

  let p = popLead(f); // (e) nothing for the lead: idle, with blockers
  assert.ok(p.action === 'idle' && p.item === null);
  assert.deepEqual(p.blocked, [{ item: blocked, waiting_on: [{ id: String(Number(dep.split('-')[0])), slug: dep, status: 'in_progress', claimed_by: 'archy' }] }]);
  const text = popCli(f, [], { env: { TEAM_LEAD: 'cody' } });
  assert.equal(text.status, 3, text.stdout + text.stderr);
  assert.equal(text.stderr, '');
  assert.equal(text.stdout, `idle\n   nothing for cody: message the agents holding the blockers below, or the coordinator\n   blocked ${blocked}: waits on ${dep} (status in_progress, claimed by archy)\n`);
  assert.equal(pop(f).action, 'chunk'); // a member with nothing else: small-chunk work, no item
  const chunk = make(f, f.cons, 'pop chunk', ['--chunk']);
  p = pop(f); // (d) the chunk item is named
  assert.deepEqual([p.action, p.item], ['chunk', chunk]);
  assert.ok(p.instruction.includes('CHUNK <time>'));
  const job = make(f, f.cons, 'pop job', []);
  p = pop(f); // (c) claim beats chunk; not claimed yet
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', job, false]);
  assert.ok(!item(f, job).fm.claimed_by);
  assert.notEqual(popLead(f).action, 'claim'); // the lead never claims
  assert.notEqual(popLead(f, '--claim-now').action, 'claim');
  assert.ok(!item(f, job).fm.claimed_by);
  p = pop(f, '--claim-now'); // --claim-now claims it
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', job, true]);
  assert.equal(item(f, job).fm.claimed_by, 'cody');
  const spare = make(f, f.cons, 'pop spare job', []);
  ok(f, dep, '--request-review', 'any', '--note', 'tests in commit abc');
  const z = JSON.parse(cli(['query', '--pop', '--agent', 'zed', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD }).stdout);
  assert.deepEqual([z.action, z.item], ['review', dep]); // (b) review beats claim; any member but the author
  assert.ok(z.instruction.includes('--review pass|changes --by zed') && spare);
  p = pop(f); // (a) continue beats review
  assert.deepEqual([p.action, p.item], ['continue', job]);
  for (const cmd of [['query', '--next'], ['next']]) { // --next --agent is the same pop
    const n = cli([...cmd, '--agent', 'cody'], { cwd: f.cons, tmp: f.t, env: LEAD });
    assert.ok(n.status === 0 && n.stdout.startsWith(`continue ${job}\n`) && !n.stdout.includes('NEXT-STEPS-MANDATE'), n.stdout + n.stderr);
  }
  ok(f, dep, '--review', 'pass', '--by', 'cody', '--comments', 'fine per references/review/tests.md');
  assert.ok(cli(['query', '--pop'], { cwd: f.cons, tmp: f.t }).stderr.includes('--pop needs --agent'));
  assert.ok(cli(['pop'], { cwd: f.cons, tmp: f.t }).stderr.includes('--pop needs --agent'));
});

test('075: the pop of an idle lead and of a claimable item prints its text and its JSON exactly, with empty stderr', () => {
  const f = fixture();
  const dep = make(f, f.cons, '075 pop dependency', ['--review-refs', 'references/review/tests.md']);
  const blocked = make(f, f.cons, '075 pop blocked', ['--depends-on', dep.split('-')[0]]);
  ok(f, dep, '--claim', 'archy');
  // the lead sees idle with the blocker: the text, word for word
  const idleText = popCli(f, [], { env: { TEAM_LEAD: 'cody' } });
  assert.equal(idleText.status, 3, idleText.stdout + idleText.stderr);
  assert.equal(idleText.stderr, '');
  assert.equal(idleText.stdout, `idle\n   nothing for cody: message the agents holding the blockers below, or the coordinator\n   blocked ${blocked}: waits on ${dep} (status in_progress, claimed by archy)\n`);
  // the same state as the JSON of --pop: the whole document, word for word (the CLI's Python-style separators)
  const idleJson = popCli(f, ['--json'], { env: { TEAM_LEAD: 'cody' } });
  assert.equal(idleJson.status, 3, idleJson.stdout + idleJson.stderr);
  assert.equal(idleJson.stderr, '');
  assert.equal(idleJson.stdout,
    `{"action": "idle", "item": null, "seq": null, "repository": "acme/demo", "branch": "main", "instruction": "nothing for cody: message the agents holding the blockers below, or the coordinator", "claimed": false, "blocked": [{"item": "${blocked}", "waiting_on": [{"id": "1", "slug": "${dep}", "status": "in_progress", "claimed_by": "archy"}]}], "held": []}\n`);
  // the claim the member gets instead: its text and JSON, exit 0
  const job = make(f, f.cons, '075 pop job', []);
  const claimText = popCli(f, [], { env: LEAD });
  assert.equal(claimText.status, 0, claimText.stdout + claimText.stderr);
  assert.equal(claimText.stderr, '');
  assert.equal(claimText.stdout, `claim ${job}\n   claim it: backlog update ${job} --claim cody; definition of done: references/review/code.md (the review-documents repository: load them before working)\n`);
  const claimJson = popCli(f, ['--json'], { env: LEAD });
  assert.equal(claimJson.status, 0, claimJson.stdout + claimJson.stderr);
  assert.equal(claimJson.stderr, '');
  assert.equal(claimJson.stdout,
    `{"action": "claim", "item": "${job}", "seq": 3, "repository": "acme/demo", "branch": "main", "instruction": "claim it: backlog update ${job} --claim cody; definition of done: references/review/code.md (the review-documents repository: load them before working)", "claimed": false, "blocked": [], "held": []}\n`);
});

test('test_pop_held_item_awaiting_review_is_not_continue_and_a_passed_one_is_closed', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'popwait');
  const job = make(f, f.cons, 'wait job', ['--review-refs', 'references/review/tests.md']);
  ok(f, job, '--claim', 'cody');
  ok(f, job, '--request-review', 'any', '--note', 'commit abc, run 1');
  const other = make(f, f.cons, 'wait other', []);
  let p = pop(f); // awaiting a verdict: falls through to claim
  assert.deepEqual([p.action, p.item], ['claim', other]);
  ok(f, other, '--claim', 'archy');
  p = popLead(f); // nothing else for the lead: idle, the wait is reported
  const seq = item(f, job).fm.seq;
  assert.equal(p.action, 'idle');
  assert.deepEqual(p.blocked.find(b => b.item === job), { item: job, waiting_on: [`awaiting review: ${seq}`] });
  const text = popCli(f, [], { env: { TEAM_LEAD: 'cody' } });
  assert.ok(text.status === 3 && text.stdout.includes(`blocked ${job}: awaiting review: ${seq}`), text.stdout);
  ok(f, job, '--review', 'changes', '--by', 'archy', '--comments', 'fix x per references/review/tests.md');
  p = pop(f); // a 'changes' verdict is work: continue
  assert.deepEqual([p.action, p.item], ['continue', job]);
  assert.ok(p.instruction.includes('keep working'));
  ok(f, job, '--request-review', 'any', '--note', 'commit def');
  ok(f, job, '--review', 'pass', '--by', 'archy', '--comments', 'fine per references/review/tests.md');
  p = pop(f); // passed but open: close it
  assert.deepEqual([p.action, p.item], ['continue', job]);
  assert.ok(p.instruction.startsWith(`close ${seq} with --close --summary`));
});

test('test_claim_only_when_every_held_item_waits', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'popwait2');
  const [one, two, three] = ['rule one', 'rule two', 'rule three'].map((n, i) => make(f, f.cons, n, [...(i < 2 ? ['--review-refs', 'references/review/tests.md'] : [])]));
  ok(f, one, '--claim', 'cody');
  let r = refuse(f, two, '--claim', 'cody'); // one active item: no new claim
  assert.ok(r.status === 1 && r.stdout.includes(`holds 1 active item(s): ${one}`), r.stdout);
  let p = pop(f);
  assert.deepEqual([p.action, p.item], ['continue', one]);
  assert.ok(p.held.some(h => h.item === one && h.seq === p.seq && h.state === 'active'));
  ok(f, one, '--waiting', 'run 397 deploy', '--by', 'cody'); // an async wait: claim allowed
  p = pop(f, '--claim-now');
  assert.deepEqual([p.action, p.item, p.claimed], ['claim', two, true]);
  assert.ok(p.held.some(h => h.item === one && h.state === 'waiting:run 397 deploy'));
  ok(f, two, '--request-review', 'any', '--note', 'commit abc'); // two awaits review, one waits
  p = pop(f);
  assert.deepEqual([p.action, p.item], ['claim', three]);
  ok(f, three, '--claim', 'archy');
  p = popLead(f);
  assert.equal(p.action, 'idle');
  assert.ok(p.blocked.some(b => b.item === one && b.waiting_on[0] === 'waiting: run 397 deploy'));
  ok(f, one, '--append', 'CHUNK 10:00 test x ok'); // an append does not end the wait
  assert.equal(item(f, one).fm.wait_on, 'run 397 deploy');
  ok(f, one, '--note', 'run 397 green'); // the next --note ends it: active again
  assert.ok(!item(f, one).fm.wait_on);
  ok(f, two, '--review', 'changes', '--by', 'archy', '--comments', 'fix y per references/review/tests.md');
  const four = make(f, f.cons, 'rule four', []);
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

test('test_review_refs_any_reviewer_and_review_first', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'poprefs');
  const bad = cli(['new', '--name', 'no refs', '--objective', 'o', '--summary', 's', '--depends-on', 'none',
    '--review-refs', 'references/patterns/x.md'], { cwd: f.cons, tmp: f.t });
  assert.ok(bad.status === 1 && bad.stdout.includes('needs at least one review document'), bad.stdout);
  const job = make(f, f.cons, 'refs job', ['--review-refs',
    'references/review/contract.example.md,references/patterns/x.md']);
  let r = cli(['query', '--pop', '--agent', 'archy', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.ok(JSON.parse(r.stdout).instruction.includes('definition of done: references/review/contract.example.md, references/patterns/x.md'), r.stdout + r.stderr);
  ok(f, job, '--claim', 'archy');
  ok(f, job, '--request-review', 'any', '--note', 'commit abc');
  const roster = join(f.t, 'team.json');
  writeFileSync(roster, JSON.stringify({ cody: { work_classes: ['app-code'], review_classes: ['code'] }, archy: {} })); // old class profiles mean nothing
  assert.equal(pop(f).action, 'review'); // any member but the author
  let p = pop(f, '--roster', roster);
  assert.deepEqual([p.action, p.item], ['review', job]);
  assert.ok(!p.instruction.includes('you do not hold'));
  assert.ok(p.instruction.includes('load its review_refs first: references/review/contract.example.md'));
  r = cli(['query', '--reviewable', '--agent', 'cody', '--roster', roster, '--json'], { cwd: f.cons, tmp: f.t });
  assert.deepEqual(JSON.parse(r.stdout).map(x => x.slug), [job]);
  r = refuse(f, job, '--review', 'pass', '--by', 'cody', '--comments', 'looks fine'); // must cite a ref
  assert.ok(r.status === 1 && r.stdout.includes('must cite'), r.stdout);
  r = ok(f, job, '--review', 'pass', '--by', 'cody', '--comments', 'per references/patterns/x.md: fine');
  assert.ok(r.stdout.includes('CLOSE NOW: archy closes it') && r.stdout.includes('if the claimer has not, the team lead closes it') && !r.stdout.includes('cody closes it')); // item 039: never the reviewer
  ok(f, job, '--set-review-refs', 'references/review/contract.md');
  r = refuse(f, job, '--set-review-refs', 'references/patterns/y.md');
  assert.ok(r.status === 1 && r.stdout.includes('needs at least one review document'), r.stdout);
  ok(f, job, '--close', '--summary', 'done');
  // the agent's own work goes before another member's review request, however old (spec section 5)
  const mine = make(f, f.cons, 'own job', []);
  const other = make(f, f.cons, 'other job', ['--review-refs', 'references/review/code.md']);
  ok(f, other, '--claim', 'archy');
  ok(f, other, '--request-review', 'any', '--note', 'commit def');
  ok(f, mine, '--claim', 'cody');
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
  writeFileSync(roster, JSON.stringify({ rev: { review_only: true }, cody: {} }));
  const as = (agent, ...args) => cli(['query', '--pop', '--agent', agent, '--roster', roster, '--json', ...args], { cwd: f.cons, tmp: f.t, env: LEAD });
  for (const args of [[], ['--claim-now']]) assert.equal(JSON.parse(as('rev', ...args).stdout).action, 'idle', args.join(' '));
  assert.ok(!item(f, job).fm.claimed_by);
  assert.deepEqual([JSON.parse(as('cody').stdout).action, JSON.parse(as('cody').stdout).item], ['claim', job]);
  const gone = cli(['query', '--pop', '--agent', 'cody', '--roster', join(f.t, 'missing.json')], { cwd: f.cons, tmp: f.t, env: LEAD });
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
  const q = (...a) => cli(['query', ...a], { cwd: f.cons, tmp: f.t });
  for (const mode of [['--claimable'], ['--reviewable', '--agent', 'cody'], ['--blocked']]) {
    const plain = q(...mode);
    assert.ok(plain.status === 0 && plain.stdout === q(...mode, '--scope', 'branch').stdout);
    assert.ok(plain.stdout.includes('item(s) — acme/demo, branch compat-a, P0 = next:'));
    assert.ok(!plain.stdout.includes(other));
  }
  const c = q('--claimable').stdout;
  assert.ok(c.includes(`   P0   ${s} (pending) — compat job\n        review_refs=references/review/code.md claimed_by=- review=none`), c);
  assert.ok(q('--claimable', '--all').stdout.includes(other)); // --all as before
  const n = q('--next'); // the owner-facing pop keeps its readiness-brief mandate
  assert.ok(n.status === 0 && n.stdout.includes(`NEXT: P0 (rank 0 = next) — [${String(Number(s.split('-')[0])).padStart(3)}] ${s}`), n.stdout);
  assert.ok(n.stdout.includes('NEXT-STEPS-MANDATE'));
});

// The --pop assertions of the scope rules.
test('--pop with --scope all and the refinement_scope cap of backlog.scope', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'scope-a');
  make(f, f.other, 'scope chunk other repository', ['--chunk']);
  const here = make(f, f.cons, 'scope docs here', []);
  ok(f, here, '--claim', 'archy'); // nothing else claimable: the pop has only chunk work
  const t = (...a) => cli(['query', '--pop', '--agent', 't', '--json', ...a], { cwd: f.cons, tmp: f.t, env: LEAD });
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

test('--agents without --plan, --critical and --headless stay refused with --pop', () => {
  const f = fixture();
  make(f, f.cons, 'x', []);
  for (const args of [['query', '--agents', 'a,b'], ['pop', '--agent', 't', '--agents', 'a'], ['pop', '--agent', 't', '--critical'], ['pop', '--agent', 't', '--headless']]) {
    const r = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
});

test('credentials in a wait are redacted in the text and the JSON of the pop (blocked and held)', () => {
  const f = fixture();
  git(f.cons, 'checkout', '-q', '-b', 'pop-secret');
  const held = make(f, f.cons, 'pop waits on a url', []);
  ok(f, held, '--claim', 'cody');
  const { fm, body } = item(f, held);
  store.write({ path: join(f.folder, 'phases', `${held}.md`), fm: { ...fm, wait_on: 'https://user:hunter2secret@host/run' }, body }, f.folder);
  for (const args of [[], ['--json']]) {
    for (const cmd of [['query', '--pop'], ['pop']]) {
      const r = cli([...cmd, '--agent', 'cody', ...args], { cwd: f.cons, tmp: f.t });
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
  const job = make(f, f.cons, 'pop claim fails', []);
  const hook = join(f.t, 'hook.cjs');
  writeFileSync(hook, kind === 'killed'
    ? "if (process.argv[2] === 'update') process.kill(process.pid, 'SIGTERM');\n"
    : kind === 'late' // the claim is saved in the item file; the process is stopped before its commit
    ? "const cp = require('node:child_process'); const run = cp.execFile;\ncp.execFile = function (file, args) { if (process.argv[2] === 'update' && file === 'git' && args.includes('commit')) process.kill(process.pid, 'SIGTERM'); return run.apply(this, arguments); };\n"
    : "if (process.argv[2] === 'update') { process.stderr.write('fatal: https://user:hunter2secret@host/x\\n'); process.exit(1); }\n");
  const env = { ...LEAD, NODE_OPTIONS: `--require=${hook}` }; // cody a member: the lead never claims
  const r = cli(['pop', '--agent', 'cody', '--claim-now', '--json'], { cwd: f.cons, tmp: f.t, env });
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
  make(f, f.cons, 'pop unicode agent', []);
  const agent = 'https://\u00e9user:review_dummy@host/path';
  for (const cmd of [['query', '--pop'], ['pop']]) {
    const r = cli([...cmd, '--agent', agent, '--json'], { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 0, r.stdout + r.stderr); // claim: the instruction names the agent
    const out = JSON.parse(r.stdout); // invalid JSON if the escape \u00e9 was cut
    assert.ok(out.instruction.includes('host/path'), r.stdout);
    assert.ok(!(r.stdout + r.stderr).includes('review_dummy'), r.stdout + r.stderr);
  }
});

test('pop --scope with an unknown scope exits 2 and names the choices', () => {
  const f = fixture();
  const galaxy = cli(['pop', '--agent', 'x', '--scope', 'galaxy'], { cwd: f.cons, tmp: f.t });
  assert.ok(galaxy.status === 2 && galaxy.stderr.includes("argument --scope: invalid choice: 'galaxy' (choose from 'branch', 'repo', 'all')"), galaxy.stderr);
});

test('pop --roster with a missing roster file exits 2 and names the file', () => {
  const f = fixture();
  make(f, f.cons, 'roster job');
  const gone = cli(['pop', '--agent', 'x', '--roster', join(f.t, 'nope.json')], { cwd: f.cons, tmp: f.t });
  assert.equal(gone.status, 2);
  assert.ok(gone.stderr.startsWith(`❌ backlog: roster ${join(f.t, 'nope.json')}: `), gone.stderr);
});

test('--claim-now on an item the agent already holds continues it and does not claim it twice', () => {
  const f = fixture();
  const job = make(f, f.cons, 'claim now held', []);
  const first = cli(['pop', '--agent', 'cody', '--claim-now', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(JSON.parse(first.stdout).claimed, true);
  assert.equal(item(f, job).fm.claimed_by, 'cody');
  const n = cli(['pop', '--agent', 'cody', '--claim-now', '--json'], { cwd: f.cons, tmp: f.t, env: LEAD });
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
  ok(f, a, '--claim', 'archy');
  ok(f, d, '--claim', 'holder');
  ok(f, d, '--request-review', 'any', '--note', 'ready', '--by', 'holder');
  ok(f, g, '--claim', 'busy');
  ok(f, h, '--claim', 'sleepy');
  ok(f, h, '--request-review', 'any', '--note', 'ready', '--by', 'sleepy');
  ok(f, p, '--claim', 'closer');
  ok(f, p, '--request-review', 'any', '--note', 'ready', '--by', 'closer');
  ok(f, p, '--review', 'pass', '--by', 'archy', '--comments', 'ok references/review/code.md');
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
