// Tests for the team views of src/shared/query.js (src/shared/views.js) - cli-parity job 16 (VIEWS), part 2.
// Port of tests/test_team_scope.py (--scope branch|repo|all and the refinement cap of <folder>/backlog.scope; its --pop
// assertions are in shared-team-pop.test.js), plus parity with query.py --claimable/--reviewable/--blocked:
// the same fixture is read by the oracle and by the CLI, and stdout, stderr and exit status must be identical. Parity
// tests skip when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const classes = has('--review-classes') ? extra[extra.indexOf('--review-classes') + 1] : (has('--work-class') ? 'code' : '');
  if (classes && !has('--review-classes')) args.push('--review-classes', classes);
  if (classes && !has('--review-refs')) args.push('--review-refs', classes.split(',').map(c => `references/review/${c}.md`).join(','));
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
  const cl = ['--claimable', '--classes'];
  git(f.cons, 'checkout', '-q', '-b', 'scope-a');
  const here = make(f, 'js', f.cons, 'scope impl here', ['--work-class', 'app-code']);
  git(f.cons, 'checkout', '-q', '-b', 'scope-b');
  const there = make(f, 'js', f.cons, 'scope impl other branch', ['--work-class', 'app-code']);
  const docs = make(f, 'js', f.cons, 'scope docs other branch', ['--work-class', 'docs']);
  const chunk = make(f, 'js', f.other, 'scope chunk other repository', ['--work-class', 'chunk']);
  const impl = make(f, 'js', f.other, 'scope impl other repository', ['--work-class', 'app-code']);
  const wait = make(f, 'js', f.cons, 'scope waits', ['--work-class', 'app-code', '--depends-on', there.split('-')[0]]);
  git(f.cons, 'checkout', '-q', 'scope-a');
  assert.ok(!slugs(f, ['--blocked']).includes(wait) && slugs(f, ['--blocked', '--scope', 'repo']).includes(wait));

  assert.deepEqual(slugs(f, [...cl, 'app-code,docs']), [here]);
  assert.deepEqual(slugs(f, [...cl, 'app-code,docs', '--scope', 'branch']), [here]);
  let got = slugs(f, [...cl, 'app-code,docs', '--scope', 'repo']);
  assert.ok(got.includes(here) && got.includes(there) && !got.includes(docs)); // cap branch (default): docs stays out
  assert.ok(!slugs(f, [...cl, 'chunk,docs', '--scope', 'all']).includes(chunk)); // the cap also holds back other repositories
  const r = cli(['query', ...cl, 'app-code', '--scope', 'all'], { cwd: f.cons, tmp: f.t });
  assert.ok(r.status === 2 && r.stderr.includes('implementation items of another repository are never claimed'), r.stderr);
  try {
    writeFileSync(f.cfg, 'refinement_scope: all\n');
    assert.ok(slugs(f, [...cl, 'app-code,docs', '--scope', 'repo']).includes(docs));
    got = slugs(f, [...cl, 'chunk,docs', '--scope', 'all']);
    assert.ok(got.includes(chunk) && got.includes(docs) && !got.includes(impl) && !got.includes(here));
    writeFileSync(f.cfg, 'refinement_scope: repo\n');
    got = slugs(f, [...cl, 'chunk,docs', '--scope', 'all']);
    assert.ok(!got.includes(chunk) && got.includes(docs));
    writeFileSync(f.cfg, 'refinement_scope: off\n');
    assert.ok(!slugs(f, [...cl, 'docs', '--scope', 'repo']).includes(docs));
    writeFileSync(f.cfg, 'refinement_scope: everywhere\n');
    const bad = cli(['query', ...cl, 'docs'], { cwd: f.cons, tmp: f.t });
    assert.ok(bad.status === 2 && bad.stderr.includes("refinement_scope 'everywhere'"), bad.stderr);
  } finally { rmSync(f.cfg, { force: true }); }
});

test('--plan stays refused (--pop is shared-team-pop.test.js)', () => {
  const f = fixture();
  make(f, 'js', f.cons, 'x', ['--work-class', 'docs']);
  for (const args of [['--plan'], ['--agents', 'a,b', '--claimable', '--classes', 'docs']]) {
    const r = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
});

test('--scope takes branch, repo or all', () => {
  const f = fixture();
  make(f, 'js', f.cons, 'x', ['--work-class', 'docs']);
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
  const a = m(f.cons, 'dep first', ['--work-class', 'tests']);
  const b = m(f.cons, 'needs first', ['--work-class', 'app-code,tests', '--depends-on', '1']);
  m(f.cons, 'docs item', ['--work-class', 'docs', '--layer', '3']);
  const d = m(f.cons, 'ui held', ['--work-class', 'ui', '--review-classes', 'ui,code']);
  const ghost = m(f.cons, 'ghost dep', ['--work-class', 'docs']);
  const e = m(f.cons, 'done one', ['--work-class', 'docs']);
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
  m(f.cons, 'side impl', ['--work-class', 'app-code']);
  m(f.cons, 'side waits', ['--work-class', 'docs', '--depends-on', String(Number(b.split('-')[0]))]);
  git(f.cons, 'checkout', '-q', 'main');
  m(f.other, 'other chunk', ['--work-class', 'chunk']);
  m(f.other, 'other docs', ['--work-class', 'docs', '--depends-on', '1']);
  m(f.other, 'other impl', ['--work-class', 'app-code']);
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
  const all = 'app-code,ui,api,tests,iac,network,identity,security,data,delivery,verify,docs,contract,chunk,skills';
  for (const json of [[], ['--json']]) {
    same(['--claimable', '--classes', all, ...json]);
    same(['--claimable', '--classes', 'tests,docs', ...json]);
    same(['--claimable', '--classes', 'tests', '--agent', 'cody', ...json]); // team mode: the incomplete item is skipped
    same(['--claimable', '--classes', all, '--scope', 'repo', ...json]);
    same(['--claimable', '--classes', all, '--all', ...json]);
    same(['--claimable', '--classes', all, '--branch', 'side', ...json]);
    same(['--claimable', '--classes', 'chunk,docs', '--scope', 'all', ...json]);
    same(['--reviewable', '--classes', 'code', ...json]);
    same(['--reviewable', '--classes', 'code', '--agent', 'archy', ...json]);
    same(['--reviewable', '--classes', 'code', '--agent', 'cody', ...json]);
    same(['--reviewable', '--classes', 'ui', '--agent', 'archy', '--roster', roster, ...json]);
    same(['--reviewable', '--classes', 'tests', '--agent', 'archy', '--roster', roster, ...json]);
    same(['--blocked', ...json]);
    same(['--blocked', '--scope', 'repo', ...json]);
    same(['--blocked', '--scope', 'all', ...json]);
    same(['--blocked', '--all', ...json]);
    same(['--blocked', '--classes', 'docs', ...json]);
  }
  const loud = same(['--reviewable', '--classes', 'ui', '--agent', 'archy', '--roster', roster]);
  assert.match(loud.stdout, /reviewable item\(s\)/);
  // refusals
  same(['--claimable']);
  same(['--reviewable']);
  same(['--claimable', '--classes', 'bogus']);
  same(['--blocked', '--classes', 'bogus']);
  same(['--claimable', '--classes', 'app-code', '--scope', 'all']);
  const gone = cli(['query', '--claimable', '--classes', 'tests', '--roster', join(f.t, 'missing.json')], { cwd: f.cons, tmp: f.t });
  assert.equal(gone.status, 2); // the operating system's wording of the error differs from Python's, so no byte comparison
  assert.ok(gone.stderr.startsWith(`❌ backlog: roster ${join(f.t, 'missing.json')}: `), gone.stderr);
  // the cap of backlog.scope
  try {
    for (const cap of ['all', 'repo', 'off', 'branch', 'everywhere']) {
      writeFileSync(f.cfg, `refinement_scope: ${cap}\n`);
      for (const scope of ['branch', 'repo', 'all']) {
        same(['--claimable', '--classes', 'chunk,docs', '--scope', scope, '--json']);
        same(['--blocked', '--scope', scope]);
      }
    }
  } finally { rmSync(f.cfg, { force: true }); }
  // a bound team session
  for (const env of [{ TEAM_REPOSITORY: 'acme/demo' }, { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'side' }, { TEAM_REPOSITORY: 'nonsense' }]) {
    const args = ['--claimable', '--classes', all];
    const o = py('query.py', args, { cwd: f.cons, tmp: f.t, env });
    const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t, env });
    assert.deepEqual([n.status, n.stdout, n.stderr], [o.status, o.stdout, o.stderr], JSON.stringify(env));
  }
  // ../x matches owner/name; Python would look for a backlog outside the home, this build refuses the folder
  const up = cli(['query', '--claimable', '--classes', 'docs'], { cwd: f.cons, tmp: f.t, env: { TEAM_REPOSITORY: '../x' } });
  assert.equal(up.status, 2);
  assert.match(up.stderr, /^❌ backlog: not an owner\/name repository id: \.\.\/x/);
});
