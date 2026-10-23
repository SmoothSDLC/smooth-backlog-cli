// Tests for src/shared/team.js and src/shared/lifecycle.js - cli-parity job 15 (TEAM): the team metadata rules and the
// claim, review, wait and close lifecycle of `backlog update`. Oracle: lib_db.py:528-621 and update.py:26-85, 181-246.
// Port of tests/test_team_lifecycle.py (the query views --blocked/--claimable/--reviewable belong to job 16 and are not
// asserted here), plus twin-fixture parity: the same command runs on a python twin and a node twin, and the printed
// lines, exit status, item files (parsed front matter in key order, body bytes), db rows, events and commits must match.
// Parity tests skip when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';
import * as team from '../../src/shared/team.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const oracle = py('update.py', ['--help']) !== null;

// A shared home with the consuming repository acme/demo on main; the items are made with `new` (python or node).
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const update = (f, args, env) => cli(['update', ...args], { cwd: f.cons, tmp: f.t, env });
const query = (f, args) => cli(['query', ...args], { cwd: f.cons, tmp: f.t });
const item = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));

// A complete team item as conftest.Repos.new makes it: review refs for every review class, an estimate, a definition of done.
const DOD = '## Definition of done\n\n- [ ] the test\'s check holds';
function newArgs(name, extra = []) {
  const has = k => extra.includes(k);
  const out = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  const classes = has('--review-classes') ? extra[extra.indexOf('--review-classes') + 1] : (has('--work-class') ? 'code' : '');
  if (classes && !has('--review-classes')) out.push('--review-classes', classes);
  if (classes && !has('--review-refs')) out.push('--review-refs', classes.split(',').map(c => `references/review/${c}.md`).join(','));
  if (!has('--estimate')) out.push('--estimate', '5', '--complexity', 'low');
  return [...out, '--body', DOD, ...extra];
}
function make(f, side, name, extra = []) {
  const args = newArgs(name, extra);
  const r = side === 'py' ? py('new_phase.py', args, { cwd: f.cons, tmp: f.t }) : cli(['new', ...args], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('created phase phases/')[1].split('.md')[0];
}

test('claim, review and close lifecycle (port of test_claim_review_close_lifecycle)', () => {
  const f = fixture();
  const ok = (...args) => { const r = update(f, args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
  const refused = (...args) => { const r = update(f, args); assert.equal(r.status, 1, r.stdout + r.stderr); return r.stdout; };
  const first = make(f, 'js', 'dependency first', ['--work-class', 'tests']);
  const seq = first.split('-')[0];
  const job = make(f, 'js', 'the job', ['--work-class', 'app-code,tests', '--review-classes', 'code', '--depends-on', seq]);
  let { fm } = item(f, job);
  assert.deepEqual(fm.work_class, ['app-code', 'tests']);
  assert.deepEqual(fm.review_classes, ['code']);
  assert.deepEqual(fm.depends_on, [Number(seq)]);
  assert.equal(fm.claimed_by, '');
  assert.equal(fm.review_state, 'none');

  assert.ok(refused(job, '--claim', 'cody').includes(`${first} (status pending`)); // dependency not done
  ok(first, '--claim', 'archy');
  ok(first, '--request-review', 'any', '--note', 'tests written'); // every complete item is reviewed
  ok(first, '--review', 'pass', '--by', 'cody', '--comments', 'fine per references/review/code.md');
  ok(first, '--close', '--summary', 'tests written');

  ok(job, '--claim', 'cody');
  assert.ok(refused(job, '--claim', 'archy').includes('claimed by cody')); // held by another agent
  assert.ok(refused(job, '--close', '--summary', 'early').includes('after a passing review'));
  ok(job, '--request-review', 'any', '--note', 'commit abc1234, deployed evidence in run 13');
  assert.ok(refused(job, '--review', 'pass', '--by', 'cody', '--comments', 'fine').includes('cannot review its own work'));
  ok(job, '--review', 'changes', '--by', 'archy', '--comments', 'missing a test for the empty input (references/review/code.md)');
  assert.equal(item(f, job).fm.review_state, 'changes-requested');
  ok(job, '--request-review', 'archy', '--note', 'commit def5678 adds the test');
  ok(job, '--review', 'pass', '--by', 'archy', '--comments', 'test present, all green (references/review/code.md)');
  ok(job, '--close', '--summary', 'feature delivered with tests');

  const text = readFileSync(join(f.folder, 'phases', `${job}.md`), 'utf8');
  ({ fm } = item(f, job));
  assert.equal(fm.status, 'done');
  assert.equal(fm.summary, 'feature delivered with tests');
  assert.equal(fm.review_state, 'passed');
  for (const line of ['Claimed by cody at', '## Review requested by cody at', '(reviewer: any)', 'commit abc1234',
    '## Review by archy: CHANGES REQUESTED', 'missing a test for the empty input (references/review/code.md)',
    '## Review by archy: PASS', '## Closed by cody at']) assert.ok(text.includes(line), line);
  const ev = query(f, ['--events', job]).stdout;
  for (const e of ['claimed', 'review_requested', 'reviewed', 'closed']) assert.ok(ev.includes(` ${e} `), `${e}: ${ev}`);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
});

test('team session: TEAM_REPOSITORY binds the repository, a step on another scope is refused', () => {
  const f = fixture();
  const s = make(f, 'js', 'scoped job', ['--work-class', 'app-code']);
  const inScope = { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  const out = update(f, [s, '--claim', 'cody'], { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'other' });
  assert.equal(out.status, 1);
  assert.equal(out.stdout, `❌ ${s}: this item belongs to repository acme/demo branch main, but this team session is bound to acme/demo branch other (TEAM_REPOSITORY/TEAM_BRANCH): a team works only on its own items; read other scopes with query.py --scope, never claim or change them\n`);
  assert.equal(item(f, s).fm.claimed_by, '');
  const ok = update(f, [s, '--claim', 'cody'], inScope);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(readFileSync(join(f.folder, 'phases', `${s}.md`), 'utf8'), /Claimed by cody at \S+ repository=acme\/demo branch=main cwd=/);
  assert.equal(update(f, [s, '--note', 'x'], { TEAM_REPOSITORY: '../x' }).status, 2);
});

test('an incomplete item is only refined: no claim, no note', () => {
  const f = fixture();
  const r = cli(['new', '--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = r.stdout.split('created phase phases/')[1].split('.md')[0];
  const out = update(f, [slug, '--claim', 'cody']);
  assert.equal(out.status, 1);
  assert.match(out.stdout, new RegExp(`^❌ ${slug}: incomplete item, missing work_class, review_classes, review_refs, estimate_min, definition_of_done: in a team nobody claims, reviews or works it \\(--claim refused\\); the team lead refines it only: update\\.py <item> --set-work-class`));
  assert.equal(update(f, [slug, '--release', 'cody']).status, 1); // a release is not work: only its own refusal
  assert.match(update(f, [slug, '--release', 'cody']).stdout, /claimed by nobody, not by cody/);
  assert.equal(update(f, [slug, '--set-estimate', '5']).status, 0); // refining is allowed
});

test('team.js: class vocabularies, lists, review-ref coverage', () => {
  assert.equal(team.WORK_CLASSES.length, 15);
  assert.deepEqual(team.REVIEW_CLASSES, [...team.WORK_CLASSES, 'code']);
  assert.deepEqual(team.asList(' a, b ,,c '), ['a', 'b', 'c']);
  assert.deepEqual(team.asList(' None '), []);
  assert.deepEqual(team.asList(undefined), []);
  assert.deepEqual(team.asList([1, ' x ', '']), ['1', 'x']);
  assert.deepEqual(team.parseClasses('docs,code', team.REVIEW_CLASSES, '--x'), ['docs', 'code']);
  assert.throws(() => team.parseClasses('docs,bogus', team.WORK_CLASSES, '--set-work-class'),
    e => e.exitCode === 2 && e.message.startsWith(`--set-work-class: unknown class bogus; the vocabulary is: ${team.WORK_CLASSES.join(', ')}`));
  assert.deepEqual(team.uncoveredReviewClasses(['code', 'ui', 'tests'], ['a/b/code.md', 'ui.example.md', 'tests']), ['tests']);
});

test('team.js: roster and fallback review', () => {
  const f = fixture();
  assert.deepEqual(team.loadRoster(''), {});
  const file = join(f.t, 'roster.json');
  writeFileSync(file, JSON.stringify({ cody: { work_classes: 'app-code,tests', review_classes: ['code'] }, archy: { work_classes: ['docs'] } }));
  const roster = team.loadRoster(file);
  assert.deepEqual(roster, { cody: [['app-code', 'tests'], ['code']], archy: [['docs'], []] });
  assert.throws(() => team.loadRoster(join(f.t, 'missing.json')), e => e.exitCode === 2 && e.message.startsWith(`roster ${join(f.t, 'missing.json')}:`));
  writeFileSync(file, '[1]');
  assert.throws(() => team.loadRoster(file), e => e.exitCode === 2);
  // no roster member but the claimer holds the review class: any other member may review it
  assert.deepEqual(team.fallbackReview({ review_classes: ['code'], claimed_by: 'cody' }, roster), ['code']);
  assert.deepEqual(team.fallbackReview({ review_classes: ['code'], claimed_by: 'archy' }, roster), []);
  assert.deepEqual(team.fallbackReview({ review_classes: ['code'], claimed_by: 'cody' }, {}), []);
  assert.deepEqual(team.fallbackReview({ claimed_by: 'cody' }, roster), []);
});

// Item files of a folder, then the mirror database scanned from them (the rules read the rows, the files only for metadata).
function seed(f) {
  const put = (seq, name, extra) => store.write({
    path: join(f.folder, `phases/${String(seq).padStart(3, '0')}-${name}.md`),
    fm: { phase: `${String(seq).padStart(3, '0')}-${name}`, seq, name, status: 'pending', priority: seq - 1, depends_on: [], claimed_by: '', ...extra },
    body: '\n',
  }, f.folder);
  const scan = () => { const con = db.connect(f.folder); try { db.scan(con, f.folder); } finally { con.close(); } };
  return { put, scan };
}

test('team.js: held items, the claim rule, undone dependencies on a folder', () => {
  const f = fixture();
  const { put, scan } = seed(f);
  put(1, 'a', { status: 'in_progress', claimed_by: 'cody' });
  put(2, 'b', { status: 'in_progress', claimed_by: 'cody', review_state: 'requested' });
  put(3, 'c', { status: 'in_progress', claimed_by: 'cody', wait_on: 'run 5' });
  put(4, 'd', { status: 'done', claimed_by: 'cody' });
  put(5, 'e', { status: 'in_progress', claimed_by: 'archy' });
  put(6, 'f', { depends_on: [1, '004-d', 'nothing', 5] });
  scan();
  assert.deepEqual(team.heldItems(f.folder, 'cody').map(h => [h.slug, h.state]), [['001-a', 'active'], ['002-b', 'awaiting-review'], ['003-c', 'waiting:run 5']]);
  assert.equal(team.claimRefusal(f.folder, 'cody'), 'cody holds 1 active item(s): 001-a; pull new work only when every item you hold waits (review requested, or update.py <item> --waiting "<what>" --by cody); --force overrides');
  assert.equal(team.claimRefusal(f.folder, 'nobody'), null);
  const undone = team.undoneDependencies(f.folder, { depends_on: [1, '004-d', 'nothing', 5] });
  assert.deepEqual(undone.map(d => team.describeDependency(d)), ['001-a (status in_progress, claimed by cody)', 'nothing (no such item in this backlog)', '005-e (status in_progress, claimed by archy)']);
});

test('team.js: status and identity come from the mirror rows, the files give only the metadata (drift cases, lib_db.py:648-680)', () => {
  const f = fixture();
  const { put, scan } = seed(f);
  put(1, 'a', { status: 'in_progress', claimed_by: 'cody' });
  put(2, 'b', { status: 'done' });
  put(3, 'c', { status: 'pending' });
  put(4, 'd', { status: 'done', claimed_by: 'archy' });
  scan();
  const deps = ids => team.undoneDependencies(f.folder, { depends_on: ids }).map(d => team.describeDependency(d));
  assert.deepEqual(deps([2, 3, 4]), ['003-c (status pending, claimed by nobody)']);
  // a file changed to done before it is scanned: its row still says pending, so the dependency still blocks
  put(3, 'c', { status: 'done' });
  assert.deepEqual(deps([3]), ['003-c (status pending, claimed by nobody)']);
  // a file changed back to pending while its row says done: the dependency is done
  put(2, 'b', { status: 'pending' });
  assert.deepEqual(deps([2, '002-b']), []);
  // a done row whose file is gone is still done (a ghost), not "no such item"
  rmSync(join(f.folder, 'phases', '004-d.md'));
  assert.deepEqual(deps([4, '004-d']), []);
  // an active holding whose file now says done is still held while its row is open
  put(1, 'a', { status: 'done', claimed_by: 'cody' });
  assert.deepEqual(team.heldItems(f.folder, 'cody').map(h => [h.slug, h.state]), [['001-a', 'active']]);
  assert.match(team.claimRefusal(f.folder, 'cody'), /^cody holds 1 active item\(s\): 001-a;/);
  // and a done row is not held even when its file claims to be open
  put(2, 'b', { status: 'in_progress', claimed_by: 'cody' });
  assert.deepEqual(team.heldItems(f.folder, 'cody').map(h => h.slug), ['001-a']);
});

test('twin parity: every lifecycle step prints, refuses and records as update.py', t => {
  if (!oracle) return t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing');
  const o = fixture(); const n = fixture();
  const TS = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g;
  const norm = s => String(s).replace(TS, 'TS').replace(/[0-9a-f]{7}->[0-9a-f]{7}/g, 'SHA->SHA').replace(/cwd=\S+/g, 'cwd=X').replace(/\b[0-9a-f]{40}\b/g, 'SHA40');
  const snapshot = f => {
    const files = {};
    for (const name of readdirSync(join(f.folder, 'phases'))) files[name] = norm(JSON.stringify(parse(readFileSync(join(f.folder, 'phases', name), 'utf8'))));
    const con = db.connect(f.folder);
    const rows = x => con.prepare(x).all().map(r => norm(JSON.stringify({ ...r })));
    const out = {
      files,
      phases: rows('SELECT id, slug, seq, status, priority, branch, commit_sha, completed_at FROM phase ORDER BY id'),
      events: rows("SELECT handoff_id, phase_id, event, branch, commit_sha, note FROM event WHERE event != 'ingested' AND event != 'reingested' ORDER BY id"),
      log: git(f.home, 'log', '--format=%s').split('\n').filter(l => l.includes('update.py')),
      origin: git(f.home, 'rev-parse', 'origin/main') === git(f.home, 'rev-parse', 'HEAD'),
    };
    con.close();
    return out;
  };
  let lastEnd = 0; // a write stamps `updated` to the second: start each command in a fresh second
  const both = (args, env, want) => {
    while (Math.floor(Date.now() / 1000) === lastEnd) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    const ro = py('update.py', args, { cwd: o.cons, tmp: o.t, env });
    const rn = update(n, args, env);
    assert.equal(rn.status, ro.status, `${args.join(' ')}: ${rn.stdout}${rn.stderr}`);
    assert.equal(norm(rn.stdout), norm(ro.stdout), args.join(' '));
    assert.equal(rn.stderr, ro.stderr, args.join(' '));
    assert.deepEqual(snapshot(n), snapshot(o), args.join(' '));
    if (want !== undefined) assert.equal(ro.status, want, `${args.join(' ')}: ${ro.stdout}`);
    lastEnd = Math.floor(Date.now() / 1000);
    return ro;
  };
  const slugs = {};
  for (const [key, name, extra] of [
    ['a', 'dependency first', ['--work-class', 'tests']],
    ['b', 'the job', ['--work-class', 'app-code,tests', '--review-classes', 'code', '--depends-on', '1']],
    ['c', 'third', ['--work-class', 'docs']],
  ]) {
    slugs[key] = make(o, 'py', name, extra);
    assert.equal(make(n, 'js', name, extra), slugs[key]);
  }
  const [A, B, C] = [slugs.a, slugs.b, slugs.c];

  both([B, '--claim', 'cody'], undefined, 1); // dependency not done
  both([A, '--claim', 'archy'], undefined, 0);
  both([A, '--claim', 'cody'], undefined, 1); // held by another agent
  both([C, '--claim', 'archy'], undefined, 1); // archy holds an active item
  both([C, '--claim', 'archy', '--force'], undefined, 0); // recorded in the claim line
  both([C, '--release', 'cody'], undefined, 1);
  both([C, '--release', 'archy'], undefined, 0);
  both([A, '--close', '--summary', 'early'], undefined, 1); // needs a passing review
  both([A, '--request-review', 'any'], undefined, 1); // a note is needed
  both([A, '--request-review', 'any', '--note', 'tests written'], undefined, 0);
  both([A, '--start-review'], undefined, 1);
  both([A, '--start-review', '--by', 'archy'], undefined, 1); // not its own work
  both([A, '--start-review', '--by', 'cody'], undefined, 0);
  both([A, '--start-review', '--by', 'zed'], undefined, 1); // in review by cody
  both([A, '--review', 'pass', '--by', 'cody'], undefined, 1); // comments needed
  both([A, '--review', 'pass', '--by', 'cody', '--comments', 'fine'], undefined, 1); // cites no review ref
  both([A, '--review', 'pass', '--by', 'cody', '--comments', 'fine per references/review/code.md'], undefined, 0);
  both([A, '--waiting', 'workflow run 9', '--by', 'archy'], undefined, 0);
  both([A, '--waiting', 'again', '--by', 'cody'], undefined, 1);
  both([A, '--waiting-done', '--by', 'archy'], undefined, 0);
  both([A, '--waiting', 'workflow run 10', '--by', 'archy'], undefined, 0);
  both([A, '--claim', 'archy', '--release', 'archy'], undefined, 1); // one team step at a time
  both([A, '--close', '--summary', 'tests written'], undefined, 0); // a wait is cleared by the next step
  both([A, '--dry-run', '--waiting-done'], undefined, 0);
  both([B, '--claim', 'cody'], undefined, 0);
  both([B, '--close', '--summary', 'early'], undefined, 1);
  both([B, '--status', 'done'], undefined, 1); // reviewed items finish through --close only
  both([B, '--set-review-refs', 'references/review/ui.md'], undefined, 1); // does not cover class code
  both([B, '--set-review-refs', 'references/review/code.md,x/y.md'], undefined, 0);
  both([B, '--request-review', 'archy', '--note', 'commit def5678'], undefined, 0);
  both([B, '--review', 'changes', '--by', 'archy', '--comments', 'no refs cited'], undefined, 1);
  both([B, '--review', 'changes', '--by', 'archy', '--comments', 'add a test (references/review/code.md)'], undefined, 0);
  both([B, '--waiting', 'ci', '--by', 'cody', '--note', 'x'], undefined, 0);
  both([B, '--note', 'the holder continues'], undefined, 0); // ends the wait
  both([B, '--request-review', 'archy', '--note', 'commit 9999999'], undefined, 0);
  both([B, '--review', 'pass', '--by', 'archy', '--comments', 'good (references/review/code.md)'], undefined, 0); // CLOSE NOW line
  both([B, '--close', '--by', 'archy', '--summary', 'delivered'], undefined, 0);
  both([C, '--close', '--summary', 'x'], undefined, 1); // nobody claimed it
  both([C, '--claim', 'cody', '--note', 'n'], { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'other' }, 1); // outside the team scope
  both([C, '--claim', 'cody'], { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' }, 0);
  both([C, '--release', 'cody'], { TEAM_REPOSITORY: 'acme/demo' }, 0);
  both([C, '--claim', 'archy'], undefined, 0);
  both([C, '--dry-run', '--release', 'archy'], undefined, 0);
  both([C, '--request-review', 'any', '--note', 'ready'], undefined, 0);
  both([C, '--start-review', '--by', 'cody'], undefined, 0);
  both([C, '--start-review', '--by', 'zed'], undefined, 1); // in review by cody
  both([C, '--start-review', '--by', 'zed'], { BACKLOG_REVIEW_STALE_SECONDS: '-1' }, 0); // a stale review is taken over
  both([C, '--claim', 'cody', '--set-work-class', 'docs,bogus'], undefined, 2);
});
