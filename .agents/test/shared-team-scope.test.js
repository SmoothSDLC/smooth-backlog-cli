// Tests for the team views of src/shared/query.js (src/team/views.js) - cli-parity job 16 (VIEWS), part 2.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, intoTeam, itemPath, sharedBacklog, itemRel, GIT_IDENTITY, writeUnreadableItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

// acme/demo on main plus other/thing on main in one shared home.
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-scope-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer' }] } })); // t1 asks one peer review of its work
  const cons = consumer(t, 'acme', 'demo', 'main');
  const other = consumer(t, 'other', 'thing', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
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
  return intoTeam(r.stdout.split('created phase ')[1].split(' ')[0], { cwd, tmp: f.t }); // the team views reach only the items of their team
}
const slugs = (f, args, code = 0) => {
  const r = cli(['team', 'query', '--team', 't1', ...args, '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, code, r.stdout + r.stderr);
  return code ? r : JSON.parse(r.stdout).map(x => x.slug);
};

test('test_scopes_and_refinement_cap: --scope and the refinement_scope cap of backlog.scope', () => {
  const f = fixture();
  const cl = ['--claimable'];
  git(f.cons, 'checkout', '-q', '-b', 'scope-a');
  const here = make(f, f.cons, 'scope impl here', []);
  git(f.cons, 'checkout', '-q', '-b', 'scope-b');
  const there = make(f, f.cons, 'scope impl other branch', []);
  const chunkb = make(f, f.cons, 'scope chunk other branch', ['--chunk']);
  const chunk = make(f, f.other, 'scope chunk other repository', ['--chunk']);
  const impl = make(f, f.other, 'scope impl other repository', []);
  const wait = make(f, f.cons, 'scope waits', ['--depends-on', there.split('-')[0]]);
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
    for (const [slug, who] of [[here, 'ada'], [there, 'zed']]) { // nothing else claimable: the pop has only chunk work
      const c = cli(['update', slug, '--claim', who], { cwd: f.cons, tmp: f.t });
      assert.equal(c.status, 0, c.stdout + c.stderr);
    }
    let p = cli(['team', 'pop', '--team', 't1', '--agent', 't', '--scope', 'all', '--json'], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' } });
    assert.ok(p.status === 0 && JSON.parse(p.stdout).action === 'chunk', p.stdout + p.stderr);
    writeFileSync(f.cfg, 'refinement_scope: repo\n');
    got = slugs(f, [...cl, '--scope', 'all']);
    assert.ok(!got.includes(chunk) && got.includes(chunkb));
    writeFileSync(f.cfg, 'refinement_scope: off\n');
    assert.ok(!slugs(f, [...cl, '--scope', 'repo']).includes(chunkb));
    p = cli(['team', 'pop', '--team', 't1', '--agent', 't', '--json'], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' } });
    assert.ok(p.status === 3 && JSON.parse(p.stdout).action === 'idle', p.stdout + p.stderr);
    writeFileSync(f.cfg, 'refinement_scope: everywhere\n');
    const bad = cli(['team', 'query', '--team', 't1', ...cl], { cwd: f.cons, tmp: f.t });
    assert.ok(bad.status === 2 && bad.stderr.includes("refinement_scope 'everywhere'"), bad.stderr);
  } finally { rmSync(f.cfg, { force: true }); }
});

test('--agents goes with --plan only (the plan is shared-team-plan.test.js)', () => {
  const f = fixture();
  make(f, f.cons, 'x', []);
  for (const args of [['--agents', 'a,b', '--claimable']]) {
    const r = cli(['team', 'query', '--team', 't1', ...args], { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
});

test('--scope takes branch, repo or all', () => {
  const f = fixture();
  make(f, f.cons, 'x', []);
  const r = cli(['team', 'query', '--team', 't1', '--blocked', '--scope', 'galaxy'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--scope: invalid choice: 'galaxy' \(choose from 'branch', 'repo', 'all'\)/);
});

// --scope all reads other repositories' backlogs and backlog.scope: nothing below the home may be a link to outside it.
function otherChunk() {
  const f = fixture();
  const own = make(f, f.cons, 'scope own impl', []); // the folder of acme/demo exists
  const chunk = make(f, f.other, 'scope chunk other repository', ['--chunk']);
  writeFileSync(f.cfg, 'refinement_scope: all\n');
  const all = () => cli(['team', 'query', '--team', 't1', '--claimable', '--scope', 'all', '--json'], { cwd: f.cons, tmp: f.t });
  assert.deepEqual(JSON.parse(all().stdout).map(x => x.slug), [own, chunk]); // visible when nothing is linked
  return { f, chunk, all };
}

test('--scope all does not read another repository\'s backlog through a symlink', () => {
  const { f, chunk, all } = otherChunk();
  const dir = join(f.home, 'other', 'thing');
  mkdirSync(join(f.t, 'outside'));
  renameSync(dir, join(f.t, 'outside', 'thing')); // a folder outside the home that holds the chunk item
  symlinkSync(join(f.t, 'outside', 'thing'), dir);
  const r = all();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!r.stdout.includes(chunk), r.stdout);
});

test('the refinement cap file backlog.scope is not followed through a symlink', () => {
  const f = fixture();
  make(f, f.cons, 'scope own impl', []);
  const chunk = make(f, f.other, 'scope chunk other repository', ['--chunk']);
  mkdirSync(join(f.t, 'outside'));
  writeFileSync(join(f.t, 'outside', 'scope'), 'refinement_scope: all\n'); // would widen the cap to all
  symlinkSync(join(f.t, 'outside', 'scope'), f.cfg);
  const r = cli(['team', 'query', '--team', 't1', '--claimable', '--scope', 'all', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(!r.stdout.includes(chunk) && r.stderr.includes('Symlink destination is unsupported'), r.stdout + r.stderr);
});

test('the diagnostic of an unreadable backlog of another repository does not print credentials', () => {
  const { f } = otherChunk();
  const odd = join(f.home, 'user:review_dummy@host', 'thing');
  mkdirSync(odd, { recursive: true });
  mkdirSync(join(odd, 'phases'));
  writeUnreadableItem(itemPath(odd, '001-x')); // an item file that cannot be read
  const r = cli(['team', 'query', '--team', 't1', '--claimable', '--scope', 'all'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /backlog not read/); // the diagnostic is still there
  assert.ok(!(r.stdout + r.stderr).includes('review_dummy'), r.stdout + r.stderr);
});

test('any member but the author is offered the review at once; the reviewable view needs no member list', () => {
  const f = fixture();
  const job = make(f, f.cons, 'reviewed by any member', ['--review-refs', 'references/review/code.md']);
  const up = (...a) => { const r = cli(['update', job, ...a], { cwd: f.cons, tmp: f.t }); assert.equal(r.status, 0, r.stdout + r.stderr); };
  up('--claim', 'amy');
  up('--request-review', 'any', '--note', 'ready');
  const view = agent => {
    const o = cli(['team', 'query', '--team', 't1', '--reviewable', '--agent', agent, '--json'], { cwd: f.cons, tmp: f.t });
    assert.equal(o.status, 0, o.stdout + o.stderr);
    return JSON.parse(o.stdout).map(x => x.slug);
  };
  for (const agent of ['eve', 'dan', 'ada']) assert.deepEqual(view(agent), [job], agent); // no holder window
  assert.deepEqual(view('amy'), []); // never the author
});

test('a team session whose repository id leaves the home (../x) is refused with exit 2', () => {
  const f = fixture();
  make(f, f.cons, 'scope bound', []);
  const up = cli(['team', 'query', '--team', 't1', '--claimable'], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: '../x' } });
  assert.equal(up.status, 2);
  assert.match(up.stderr, /^❌ backlog: not an owner\/name repository id: \.\.\/x/);
});

test('075: the claimable, reviewable and blocked views print their exact rows, and the blocked JSON names the edge it waits on', () => {
  const f = fixture();
  const here = make(f, f.cons, 'scope here', []);
  const held = make(f, f.cons, 'scope held job', []);
  const blocked = make(f, f.cons, 'scope blocked job', ['--depends-on', held.split('-')[0]]);
  const up = (...a) => { const r = cli(['update', held, ...a], { cwd: f.cons, tmp: f.t }); assert.equal(r.status, 0, r.stdout + r.stderr); };
  up('--claim', 'ada');
  up('--request-review', 'any', '--note', 'ready');
  let r = cli(['team', 'query', '--team', 't1', '--claimable'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout,
    `📋 1 claimable item(s) — acme/demo, branch main, P0 = next:\n   P0   ${here} (ready) — scope here\n        review_refs=references/review/code.md claimed_by=- review=none estimate=5m complexity=low\n`);
  r = cli(['team', 'query', '--team', 't1', '--reviewable', '--agent', 'amy'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout,
    `📋 1 reviewable item(s) — acme/demo, branch main, P0 = next:\n   P1   ${held} (ready for review) — scope held job\n        review_refs=references/review/code.md claimed_by=ada review=requested reviewer=any estimate=5m complexity=low\n`);
  r = cli(['team', 'query', '--team', 't1', '--blocked'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout,
    `📋 1 blocked item(s) — acme/demo, branch main, P0 = next:\n   P2   ${blocked} (ready) — scope blocked job\n        review_refs=references/review/code.md claimed_by=- review=none estimate=5m complexity=low\n        waits on ${held} (status ready for review, claimed by ada)\n`);
  r = cli(['team', 'query', '--team', 't1', '--blocked', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  // timestamps and content hashes differ between runs; the rest of the output is asserted word for word
  const exact = s => s
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'TS')
    .replace(/"(sha|commit_sha)": "[0-9a-f]+"/g, '"$1": "SHA"');
  assert.equal(exact(r.stdout), `[
  {
    "id": 3,
    "handoff_id": 1,
    "slug": "${blocked}",
    "seq": 3,
    "name": "scope blocked job",
    "objective": "o",
    "summary": "s",
    "status": "ready",
    "severity": "normal",
    "priority": 2,
    "path": "${itemRel(blocked)}",
    "sha": "SHA",
    "branch": "main",
    "commit_sha": "SHA",
    "location": "",
    "repository": "acme/demo",
    "size_score": 0,
    "created_at": "TS",
    "updated_at": "TS",
    "completed_at": null,
    "chunk": null,
    "review_refs": [
      "references/review/code.md"
    ],
    "depends_on": [
      ${Number(held.split('-')[0])}
    ],
    "claimed_by": "",
    "claimed_at": "",
    "review_state": "none",
    "reviewer": "",
    "estimate_min": 5,
    "complexity": "low",
    "layer": null,
    "waiting_on": [
      {
        "id": "${Number(held.split('-')[0])}",
        "slug": "${held}",
        "status": "ready for review",
        "claimed_by": "ada"
      }
    ]
  }
]
`);
});
