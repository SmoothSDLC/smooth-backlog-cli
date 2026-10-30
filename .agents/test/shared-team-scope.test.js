// Tests for the team views of src/shared/query.js (src/shared/views.js) - cli-parity job 16 (VIEWS), part 2.
// Port of tests/test_team_scope.py (--scope branch|repo|all and the refinement cap of <folder>/backlog.scope; its --pop
// assertions are in shared-team-pop.test.js), plus parity with query.py --claimable/--reviewable/--blocked:
// the same fixture is read by the oracle and by the CLI, and stdout, stderr and exit status must be identical. Parity
// tests skip when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';
import { cli, consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const oracle = py('query.py', ['--help']) !== null;
const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

// acme/demo on main plus other/thing on main in one shared home; items are made by `side` (python or node).
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-scope-'));
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
  // owner 2026-10-28: no classes. A team item names its review documents; the default is references/review/code.md
  // (conftest.Repos.new). '--no-review-refs' (this helper's own flag) makes an item without any.
  const bare = has('--no-review-refs'); extra = extra.filter(x => x !== '--no-review-refs');
  if (!has('--review-refs') && !bare) args.push('--review-refs', 'references/review/code.md');
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  args.push('--body', DOD, ...extra);
  const r = side === 'py' ? py('new_phase.py', args, { cwd, tmp: f.t }) : cli(['new', ...args], { cwd, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('created phase phases/')[1].split('.md')[0];
}
const slugs = (f, args, code = 0) => {
  const r = cli(['query', ...args, '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, code, r.stdout + r.stderr);
  return code ? r : JSON.parse(r.stdout).map(x => x.slug);
};

test('test_scopes_and_refinement_cap: --scope and the refinement_scope cap of backlog.scope', () => {
  const f = fixture();
  const cl = ['--claimable'];
  git(f.cons, 'checkout', '-q', '-b', 'scope-a');
  const here = make(f, 'js', f.cons, 'scope impl here', []);
  git(f.cons, 'checkout', '-q', '-b', 'scope-b');
  const there = make(f, 'js', f.cons, 'scope impl other branch', []);
  const chunkb = make(f, 'js', f.cons, 'scope chunk other branch', ['--chunk']);
  const chunk = make(f, 'js', f.other, 'scope chunk other repository', ['--chunk']);
  const impl = make(f, 'js', f.other, 'scope impl other repository', []);
  const wait = make(f, 'js', f.cons, 'scope waits', ['--depends-on', there.split('-')[0]]);
  git(f.cons, 'checkout', '-q', 'scope-a');
  assert.ok(!slugs(f, ['--blocked']).includes(wait) && slugs(f, ['--blocked', '--scope', 'repo']).includes(wait));

  assert.deepEqual(slugs(f, cl), [here]);
  assert.deepEqual(slugs(f, [...cl, '--scope', 'branch']), [here]);
  let got = slugs(f, [...cl, '--scope', 'repo']);
  assert.ok(got.includes(here) && got.includes(there) && !got.includes(chunkb)); // cap branch (default): refinement stays out
  got = slugs(f, [...cl, '--scope', 'all']);
  assert.ok(!got.includes(chunk) && !got.includes(impl)); // the cap also holds back other repositories
  try {
    writeFileSync(f.cfg, 'refinement_scope: all\n');
    assert.ok(slugs(f, [...cl, '--scope', 'repo']).includes(chunkb));
    got = slugs(f, [...cl, '--scope', 'all']);
    assert.ok(got.includes(chunk) && got.includes(chunkb) && got.includes(here) && !got.includes(impl)); // another repository: chunk items only
    for (const [slug, who] of [[here, 'archy'], [there, 'zed']]) { // nothing else claimable: the pop has only chunk work
      const c = cli(['update', slug, '--claim', who], { cwd: f.cons, tmp: f.t });
      assert.equal(c.status, 0, c.stdout + c.stderr);
    }
    let p = cli(['query', '--pop', '--agent', 't', '--scope', 'all', '--json'], { cwd: f.cons, tmp: f.t, env: { TEAM_LEAD: 'lead' } });
    assert.ok(p.status === 0 && JSON.parse(p.stdout).action === 'chunk', p.stdout + p.stderr);
    writeFileSync(f.cfg, 'refinement_scope: repo\n');
    got = slugs(f, [...cl, '--scope', 'all']);
    assert.ok(!got.includes(chunk) && got.includes(chunkb));
    writeFileSync(f.cfg, 'refinement_scope: off\n');
    assert.ok(!slugs(f, [...cl, '--scope', 'repo']).includes(chunkb));
    p = cli(['query', '--pop', '--agent', 't', '--json'], { cwd: f.cons, tmp: f.t, env: { TEAM_LEAD: 'lead' } });
    assert.ok(p.status === 3 && JSON.parse(p.stdout).action === 'idle', p.stdout + p.stderr);
    writeFileSync(f.cfg, 'refinement_scope: everywhere\n');
    const bad = cli(['query', ...cl], { cwd: f.cons, tmp: f.t });
    assert.ok(bad.status === 2 && bad.stderr.includes("refinement_scope 'everywhere'"), bad.stderr);
  } finally { rmSync(f.cfg, { force: true }); }
});

test('--agents goes with --plan only (the plan is shared-team-plan.test.js)', () => {
  const f = fixture();
  make(f, 'js', f.cons, 'x', []);
  for (const args of [['--agents', 'a,b', '--claimable']]) {
    const r = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
});

test('--scope takes branch, repo or all', () => {
  const f = fixture();
  make(f, 'js', f.cons, 'x', []);
  const r = cli(['query', '--blocked', '--scope', 'galaxy'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--scope: invalid choice: 'galaxy' \(choose from 'branch', 'repo', 'all'\)/);
});

// A fixture with every shape the views print: dependencies (open, done, missing), claims, review requests, a second
// branch, a second repository, an incomplete item and an item that was written before team work. Built with the oracle.
function rich() {
  const f = fixture();
  const m = (cwd, name, extra) => make(f, 'py', cwd, name, extra);
  const up = (slug, ...args) => { const r = py('update.py', [slug, ...args], { cwd: f.cons, tmp: f.t }); assert.equal(r.status, 0, r.stdout + r.stderr); };
  const a = m(f.cons, 'dep first', []);
  const b = m(f.cons, 'needs first', ['--depends-on', '1']);
  m(f.cons, 'docs item', ['--layer', '3']);
  const d = m(f.cons, 'ui held', ['--review-refs', 'references/review/ui.md,references/review/code.md']);
  const ghost = m(f.cons, 'ghost dep', []);
  const e = m(f.cons, 'done one', []);
  const bare = py('new_phase.py', ['--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t });
  assert.equal(bare.status, 0, bare.stdout);
  up(d, '--claim', 'cody');
  up(d, '--request-review', 'any', '--note', 'ready');
  up(e, '--claim', 'archy');
  up(e, '--request-review', 'any', '--note', 'ready');
  up(e, '--review', 'pass', '--by', 'cody', '--comments', 'ok references/review/code.md');
  up(e, '--close', '--summary', 'done');
  up(a, '--claim', 'archy');
  git(f.cons, 'checkout', '-q', '-b', 'side');
  m(f.cons, 'side impl', []);
  m(f.cons, 'side waits', ['--depends-on', String(Number(b.split('-')[0]))]);
  git(f.cons, 'checkout', '-q', 'main');
  m(f.other, 'other chunk', ['--chunk']);
  m(f.other, 'other docs', ['--depends-on', '1']);
  m(f.other, 'other impl', []);
  const gp = join(f.folder, 'phases', `${ghost}.md`); // a dependency on an item that does not exist, as a hand edit leaves it
  const g = parse(readFileSync(gp, 'utf8'));
  store.write({ path: gp, fm: { ...g.fm, depends_on: ['no-such-thing'] }, body: g.body }, f.folder);
  writeFileSync(join(f.t, 'roster.json'), JSON.stringify({ cody: { work_classes: ['app-code', 'tests'], review_classes: ['code'] }, archy: { work_classes: ['docs', 'ui'], review_classes: ['ui'] } }));
  return f;
}

test('parity with query.py: --claimable, --reviewable and --blocked print, refuse and exit alike', t => {
  if (!oracle) return t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing');
  const f = rich();
  const roster = join(f.t, 'roster.json');
  const same = args => {
    const o = py('query.py', args, { cwd: f.cons, tmp: f.t });
    const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
    assert.equal(n.status, o.status, `${args.join(' ')}: ${n.stdout}${n.stderr}`);
    assert.equal(n.stdout, o.stdout, args.join(' '));
    assert.equal(n.stderr, o.stderr, args.join(' '));
    return o;
  };
  for (const json of [[], ['--json']]) {
    same(['--claimable', ...json]);
    same(['--claimable', '--agent', 'cody', ...json]); // team mode: the incomplete item is skipped
    same(['--claimable', '--scope', 'repo', ...json]);
    same(['--claimable', '--all', ...json]);
    same(['--claimable', '--branch', 'side', ...json]);
    same(['--claimable', '--scope', 'all', ...json]);
    same(['--reviewable', '--agent', 'archy', ...json]);
    same(['--reviewable', '--agent', 'cody', ...json]);
    same(['--reviewable', '--agent', 'archy', '--roster', roster, ...json]); // a roster with old class profiles
    same(['--blocked', ...json]);
    same(['--blocked', '--scope', 'repo', ...json]);
    same(['--blocked', '--scope', 'all', ...json]);
    same(['--blocked', '--all', ...json]);
  }
  const loud = same(['--reviewable', '--agent', 'archy', '--roster', roster]);
  assert.match(loud.stdout, /reviewable item\(s\)/);
  // refusals
  same(['--reviewable']); // needs --agent
  same(['--claimable', '--roster', join(f.t, 'missing.json')]); // the views read no roster (query.py loads it for --pop and --plan only)
  // the cap of backlog.scope
  try {
    for (const cap of ['all', 'repo', 'off', 'branch', 'everywhere']) {
      writeFileSync(f.cfg, `refinement_scope: ${cap}\n`);
      for (const scope of ['branch', 'repo', 'all']) {
        same(['--claimable', '--scope', scope, '--json']);
        same(['--blocked', '--scope', scope]);
      }
    }
  } finally { rmSync(f.cfg, { force: true }); }
  // a bound team session
  for (const env of [{ TEAM_REPOSITORY: 'acme/demo' }, { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'side' }, { TEAM_REPOSITORY: 'nonsense' }]) {
    const args = ['--claimable'];
    const o = py('query.py', args, { cwd: f.cons, tmp: f.t, env });
    const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t, env });
    assert.deepEqual([n.status, n.stdout, n.stderr], [o.status, o.stdout, o.stderr], JSON.stringify(env));
  }
  // ../x matches owner/name; Python would look for a backlog outside the home, this build refuses the folder
  const up = cli(['query', '--claimable'], { cwd: f.cons, tmp: f.t, env: { TEAM_REPOSITORY: '../x' } });
  assert.equal(up.status, 2);
  assert.match(up.stderr, /^❌ backlog: not an owner\/name repository id: \.\.\/x/);
});

// --scope all reads other repositories' backlogs and backlog.scope: nothing below the home may be a link to outside it.
function otherChunk() {
  const f = fixture();
  const own = make(f, 'js', f.cons, 'scope own impl', []); // the folder of acme/demo exists
  const chunk = make(f, 'js', f.other, 'scope chunk other repository', ['--chunk']);
  writeFileSync(f.cfg, 'refinement_scope: all\n');
  const all = () => cli(['query', '--claimable', '--scope', 'all', '--json'], { cwd: f.cons, tmp: f.t });
  assert.deepEqual(JSON.parse(all().stdout).map(x => x.slug), [own, chunk]); // visible when nothing is linked
  return { f, chunk, all };
}

test('--scope all does not open another repository\'s backlog.db through a symlink', () => {
  const { f, chunk, all } = otherChunk();
  const db = join(f.home, 'other', 'thing', 'backlog.db');
  mkdirSync(join(f.t, 'outside'));
  copyFileSync(db, join(f.t, 'outside', 'backlog.db')); // a database outside the home that holds the chunk item
  rmSync(db);
  symlinkSync(join(f.t, 'outside', 'backlog.db'), db);
  const r = all();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!r.stdout.includes(chunk), r.stdout);
  assert.match(r.stderr, /ℹ️  other\/thing: backlog not read \(Symlink destination is unsupported/);
});

test('the refinement cap file backlog.scope is not followed through a symlink', () => {
  const f = fixture();
  make(f, 'js', f.cons, 'scope own impl', []);
  const chunk = make(f, 'js', f.other, 'scope chunk other repository', ['--chunk']);
  mkdirSync(join(f.t, 'outside'));
  writeFileSync(join(f.t, 'outside', 'scope'), 'refinement_scope: all\n'); // would widen the cap to all
  symlinkSync(join(f.t, 'outside', 'scope'), f.cfg);
  const r = cli(['query', '--claimable', '--scope', 'all', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(!r.stdout.includes(chunk) && r.stderr.includes('Symlink destination is unsupported'), r.stdout + r.stderr);
});

test('the diagnostic of an unreadable backlog of another repository does not print credentials', () => {
  const { f } = otherChunk();
  const odd = join(f.home, 'user:review_dummy@host', 'thing');
  mkdirSync(odd, { recursive: true });
  writeFileSync(join(odd, 'backlog.db'), 'this is not a database'.repeat(100));
  const r = cli(['query', '--claimable', '--scope', 'all'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /backlog not read/); // the diagnostic is still there
  assert.ok(!(r.stdout + r.stderr).includes('review_dummy'), r.stdout + r.stderr);
});

test('any member but the author is offered the review at once; old class profiles in the roster change nothing', () => {
  const f = fixture();
  const job = make(f, 'js', f.cons, 'reviewed by any member', ['--review-refs', 'references/review/code.md']);
  const up = (...a) => { const r = cli(['update', job, ...a], { cwd: f.cons, tmp: f.t }); assert.equal(r.status, 0, r.stdout + r.stderr); };
  up('--claim', 'cody');
  up('--request-review', 'any', '--note', 'ready');
  const roster = (members) => { const p = join(f.t, 'roster.json'); writeFileSync(p, JSON.stringify(members)); return p; };
  const view = (agent, r) => {
    const o = cli(['query', '--reviewable', '--agent', agent, '--roster', r, '--json'], { cwd: f.cons, tmp: f.t });
    assert.equal(o.status, 0, o.stdout + o.stderr);
    return JSON.parse(o.stdout).map(x => x.slug);
  };
  const old = roster({ cody: { review_classes: ['code'] }, dan: { review_classes: ['code'] }, eve: { review_classes: [] } });
  for (const agent of ['eve', 'dan', 'archy']) assert.deepEqual(view(agent, old), [job], agent); // no holder window
  assert.deepEqual(view('cody', old), []); // never the author
  assert.deepEqual(view('eve', roster({ cody: {}, eve: {} })), [job]);
});
