// Tests for `backlog pop` (src/team/queue.js) - cli-parity job 20 (POP).
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../../src/shared/store.js';
import { teamHelp } from '../../src/team/help.js';
import { cli, consumer, itemPath, sharedBacklog, readItem, GIT_IDENTITY } from './shared-fixtures.js';

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
  const t = cli(['update', slug, '--set-team', 't1', '--status', 'ready'], { cwd, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '' } }); // team pop acts as its --team: only the items of t1 are in reach (set after creation: no refinement stage, status ready)
  assert.equal(t.status, 0, t.stdout + t.stderr);
  return slug;
}
const item = (f, slug) => readItem(itemPath(f.folder, slug));
// ann is a plain member here; popLead asks as the team lead, who does no chunk work.
const LEAD = { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' };
const popCli = (f, args, opts = {}) => cli(['team', 'pop', '--team', 't1', '--agent', 'ann', ...args], { cwd: f.cons, tmp: f.t, ...opts, env: { ...LEAD, ...opts.env } });

// The JSON of pop: exit 3 exactly when the action is idle.
function pop(f, ...args) { return popAs(f, LEAD, ...args); }
function popLead(f, ...args) { return popAs(f, { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'ann' }, ...args); }
function popAs(f, env, ...args) {
  const r = popCli(f, ['--json', ...args], { env });
  assert.ok([0, 3].includes(r.status), r.stdout + r.stderr);
  assert.equal(r.stderr, '', r.stdout + r.stderr); // the JSON of a successful pop has no stderr
  const out = JSON.parse(r.stdout);
  assert.equal(r.status === 3, out.action === 'idle', r.stdout);
  return out;
}

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

test('--agents without --plan and --critical stay refused with pop', () => {
  const f = fixture();
  make(f, f.cons, 'x', []);
  for (const args of [['list', '--agents', 'a,b'], ['team', 'pop', '--team', 't1', '--agent', 't', '--agents', 'a'], ['team', 'pop', '--team', 't1', '--agent', 't', '--critical']]) {
    const r = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
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

test('--claim-now: the diagnostics of a failed claim are forwarded with its exit code and without credentials', () => {
  const { r } = claimOutcome('exits');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes('fatal: https://host/x'), r.stdout + r.stderr);
  assert.ok(!(r.stdout + r.stderr).includes('hunter2secret'), r.stdout + r.stderr);
});

test('the exit codes of backlog team pop are described: 3 is idle, 1 a claim that failed', () => {
  assert.match(teamHelp['team pop'], /1 {2}A claim was refused or could not be run/);
});

test('pop --scope with an unknown scope exits 2 and names the choices', () => {
  const f = fixture();
  const galaxy = cli(['team', 'pop', '--team', 't1', '--agent', 'x', '--scope', 'galaxy'], { cwd: f.cons, tmp: f.t });
  assert.ok(galaxy.status === 2 && galaxy.stderr.includes("argument --scope: invalid choice: 'galaxy' (choose from 'branch', 'repo', 'all')"), galaxy.stderr);
});

test('--roster is refused by pop and by the plan: unrecognized arguments, exit 2', () => {
  const f = fixture();
  make(f, f.cons, 'roster job');
  for (const args of [['team', 'pop', '--team', 't1', '--agent', 'x', '--roster', join(f.t, 'nope.json')], ['team', 'query', '--team', 't1', '--plan', '--roster', join(f.t, 'nope.json')]]) {
    const gone = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(gone.status, 2, args.join(' '));
    assert.match(gone.stderr, /unrecognized arguments: --roster/);
  }
});

