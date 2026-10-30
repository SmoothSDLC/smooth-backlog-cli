// Tests for src/shared/team.js and src/shared/lifecycle.js - cli-parity job 15 (TEAM): the team metadata rules and the
// claim, review, wait and close lifecycle of `backlog update`. Oracle: lib_db.py:528-621 and update.py:26-85, 181-246.
// Port of tests/test_team_lifecycle.py (the query views --blocked/--claimable/--reviewable belong to job 16 and are not
// asserted here), plus twin-fixture parity: the same command runs on a python twin and a node twin, and the printed
// lines, exit status, item files (parsed front matter in key order, body bytes), db rows, events and commits must match.
// Parity tests skip when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, ORACLE_SKIP, py, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';
import { shutdown } from '../../src/shared/lifecycle.js';
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
// The lifecycle parity driver reads the write set as the named agent; stale-view refusals have their own regression suite.
const update = (f, args, env) => {
  const named = ['--by', '--claim', '--release'].map(k => args[args.indexOf(k) + 1]).find((v, i) => args.includes(['--by', '--claim', '--release'][i]));
  const who = named ?? (args.includes('--request-review') ? 'cody' : undefined); // a review is requested by the one working on the item (cody here)
  if (who && args[0] && !args[0].startsWith('-')) {
    const slugs = args.includes('--close') ? readdirSync(join(f.folder, 'phases')).map(n => n.replace(/\.md$/, '')) : [args[0]];
    for (const slug of slugs) cli(['query', '--phase', slug, '--agent', who], { cwd: f.cons, tmp: f.t, env });
  }
  return cli(['update', ...args], { cwd: f.cons, tmp: f.t, env });
};
const query = (f, args) => cli(['query', ...args], { cwd: f.cons, tmp: f.t });
const item = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));

// A complete team item as conftest.Repos.new makes it: review refs, an estimate, a definition of done.
const DOD = '## Definition of done\n\n- [ ] the test\'s check holds';
function newArgs(name, extra = []) {
  const has = k => extra.includes(k);
  const out = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  // owner 2026-10-28: no classes. A team item names its review documents; the default is references/review/code.md
  // (conftest.Repos.new). '--no-review-refs' (this helper's own flag) makes an item without any.
  const bare = has('--no-review-refs'); extra = extra.filter(x => x !== '--no-review-refs');
  if (!has('--review-refs') && !bare) out.push('--review-refs', 'references/review/code.md');
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
  const first = make(f, 'js', 'dependency first', []);
  const seq = first.split('-')[0];
  const job = make(f, 'js', 'the job', ['--review-refs', 'references/review/code.md', '--depends-on', seq]);
  let { fm } = item(f, job);
  assert.deepEqual(fm.review_refs, ['references/review/code.md']);
  assert.ok(!('work_class' in fm) && !('review_classes' in fm)); // no class field is written
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
  const s = make(f, 'js', 'scoped job', []);
  const inScope = { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  const out = update(f, [s, '--claim', 'cody'], { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'other' });
  assert.equal(out.status, 1);
  assert.equal(out.stdout, `❌ ${s}: this item belongs to repository acme/demo branch main, but this team session is bound to acme/demo branch other (TEAM_REPOSITORY/TEAM_BRANCH): a team works only on its own items; read other scopes with backlog query --scope, never claim or change them\n`);
  assert.equal(item(f, s).fm.claimed_by, '');
  const ok = update(f, [s, '--claim', 'cody'], inScope);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(readFileSync(join(f.folder, 'phases', `${s}.md`), 'utf8'), /Claimed by cody at \S+ repository=acme\/demo branch=main cwd=/);
  assert.equal(update(f, [s, '--note', 'x'], { TEAM_REPOSITORY: '../x' }).status, 2);
});

test('team scope guards every mutating update path, not only the team steps (review P1)', () => {
  const f = fixture();
  const s = make(f, 'js', 'scoped edits', []);
  const file = join(f.folder, 'phases', `${s}.md`);
  const outside = { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'other' };
  const inside = { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  const before = readFileSync(file, 'utf8');
  for (const args of [['--summary', 'x'], ['--status', 'in_progress'], ['--status', 'done'], ['--priority', '0'], ['--append', 'more text'],
    ['--set-estimate', '9'], ['--set-chunk', 'yes'], ['--note', 'n'], ['--claim', 'cody']]) {
    const out = update(f, [s, ...args], outside);
    assert.equal(out.status, 1, `${args}: ${out.stdout}${out.stderr}`);
    assert.match(out.stdout, /^❌ .*this item belongs to repository acme\/demo branch main, but this team session is bound to acme\/demo branch other/, args.join(' '));
    assert.equal(update(f, [s, ...args, '--dry-run'], outside).status, 1, `${args} --dry-run`);
    assert.equal(readFileSync(file, 'utf8'), before, `${args}: the file is untouched`);
  }
  assert.equal(update(f, [s, '--summary', 'edited inside'], inside).status, 0);
  assert.equal(update(f, [s, '--append', 'body text'], inside).status, 0);
  assert.equal(item(f, s).fm.summary, 'edited inside');
  assert.ok(readFileSync(file, 'utf8').includes('body text'));
  assert.equal(update(f, [s, '--claim', 'cody'], inside).status, 0);
  assert.match(readFileSync(join(process.cwd(), 'COMMANDS.md'), 'utf8'), /works only on items of that repository and branch/);
});

test('an incomplete item is only refined: no claim, no note', () => {
  const f = fixture();
  const r = cli(['new', '--name', 'bare', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = r.stdout.split('created phase phases/')[1].split('.md')[0];
  const out = update(f, [slug, '--claim', 'cody']);
  assert.equal(out.status, 1);
  assert.match(out.stdout, new RegExp(`^❌ ${slug}: incomplete item, missing review_refs, estimate_min, definition_of_done: in a team nobody claims, reviews or works it \\(--claim refused\\); the team lead refines it only: backlog update <item> --set-review-refs references/review/<type>\\.md`));
  assert.equal(update(f, [slug, '--release', 'cody']).status, 1); // a release is not work: only its own refusal
  assert.match(update(f, [slug, '--release', 'cody']).stdout, /claimed by nobody, not by cody/);
  assert.equal(update(f, [slug, '--set-estimate', '5']).status, 0); // refining is allowed
});

test('team.js: lists, chunk items, review documents', () => {
  assert.deepEqual(team.asList(' a, b ,,c '), ['a', 'b', 'c']);
  assert.deepEqual(team.asList(' None '), []);
  assert.deepEqual(team.asList(undefined), []);
  assert.deepEqual(team.asList([1, ' x ', '']), ['1', 'x']);
  for (const v of [true, 'true', 'yes', '1', 'True']) assert.equal(team.isChunk({ chunk: v }), true, String(v)); // lib_db.is_chunk
  for (const v of [false, 'no', '', undefined]) assert.equal(team.isChunk({ chunk: v }), false, String(v));
  assert.equal(team.isChunk({ work_class: ['chunk'] }), false); // the old class field means nothing
  assert.equal(team.needsReview({ review_refs: ['references/review/code.md'] }), true);
  assert.equal(team.needsReview({ review_classes: ['code'] }), false);
  assert.equal(team.REVIEW_DIR, 'references/review/');
  for (const name of ['WORK_CLASSES', 'REVIEW_CLASSES', 'parseClasses', 'uncoveredReviewClasses', 'fallbackReview']) assert.ok(!(name in team), name);
});

test('team.js: the roster names the members in order; any profile fields are kept and none is a class', () => {
  const f = fixture();
  assert.deepEqual(team.loadRoster(''), {});
  const file = join(f.t, 'roster.json');
  writeFileSync(file, JSON.stringify({ cody: { work_classes: 'app-code,tests', review_classes: ['code'] }, archy: [1] }));
  assert.deepEqual(team.loadRoster(file), { cody: { work_classes: 'app-code,tests', review_classes: ['code'] }, archy: {} }); // lib_db.load_roster
  assert.throws(() => team.loadRoster(join(f.t, 'missing.json')), e => e.exitCode === 2 && e.message.startsWith(`roster ${join(f.t, 'missing.json')}:`));
  writeFileSync(file, '[1]');
  assert.throws(() => team.loadRoster(file), e => e.exitCode === 2);
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
  assert.equal(team.claimRefusal(f.folder, 'cody'), 'cody holds 1 active item(s): 001-a; pull new work only when every item you hold waits (review requested, or backlog update <item> --waiting "<what>" --by cody); --force overrides');
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

test('review P2: a holder whose item file has malformed front matter still blocks a second claim: the error propagates and nothing is written', () => {
  const f = fixture();
  const a = make(f, 'js', 'held job', []);
  const b = make(f, 'js', 'second job', []);
  assert.equal(update(f, [a, '--claim', 'cody']).status, 0);
  const held = join(f.folder, 'phases', `${a}.md`);
  writeFileSync(held, readFileSync(held, 'utf8').replace(/^claimed_by:/m, 'not a pair\nclaimed_by:'));
  assert.throws(() => team.heldItems(f.folder, 'cody'), /not a 'key: value' pair/);
  const files = () => readdirSync(join(f.folder, 'phases')).map(n => readFileSync(join(f.folder, 'phases', n), 'utf8'));
  const events = () => { const d = new DatabaseSync(join(f.folder, 'backlog.db'), { readOnly: true }); try { return d.prepare('SELECT * FROM event ORDER BY id').all().map(r => ({ ...r })); } finally { d.close(); } };
  const [before, evBefore] = [files(), events()];
  const out = update(f, [b, '--claim', 'cody']);
  assert.notEqual(out.status, 0, out.stdout + out.stderr);
  assert.deepEqual(files(), before, 'no item file changed');
  assert.deepEqual(events(), evBefore, 'no event was logged');
  rmSync(held);
  assert.deepEqual(team.heldItems(f.folder, 'cody'), [], 'a genuinely missing file is {} (item_fm: p.exists() else {})');
});

test('twin parity: every lifecycle step prints, refuses and records as update.py', t => {
  if (!oracle) return t.skip(ORACLE_SKIP);
  const o = fixture(); const n = fixture();
  const TS = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g;
  const norm = s => String(s).replace(TS, 'TS').replace(/,?"updated_by":"[^"]*"/g, '').replace(/[0-9a-f]{7}->[0-9a-f]{7}/g, 'SHA->SHA').replace(/cwd=\S+/g, 'cwd=X').replace(/\b[0-9a-f]{40}\b/g, 'SHA40').replace(/,?"review_author":"[^"]*"/g, "");  // review_author: beyond the oracle (who asked for a review survives a release)
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
    // beyond the oracle (item 033, spec section 7): a member's hand-off, changes verdict or close ends with the shutdown
    // line, and a member's close leaves the re-ranking to the lead; everything else is the oracle's
    const ends = args.includes('--request-review') || args.includes('--close') || (args.includes('--review') && args.includes('changes'));
    const line = rn.stdout.match(/\n(🛑 (\w+): .*)\n$/);
    if (line) { // exactly the shutdown text, to a member of the fixture, on a step that ends a session
      assert.ok(ends && ['archy', 'zed'].includes(line[2]), `${args.join(' ')}: an unexpected shutdown line`);
      assert.equal(line[1], shutdown(line[2]));
    }
    const mine = rn.stdout.replace(/\n🛑 \w+: .*\n$/, '\n').replace('      the team lead re-evaluates the order (backlog update --replan, --priority); not you\n',
      '      RE-EVALUATE the order now (it is a planning step even if nothing changes):\n        backlog update <phase> --priority <rank>      # promote/demote one\n        backlog update --replan "<id,id,id,...>"       # set the leading order\n');
    assert.equal(norm(mine), norm(ro.stdout), args.join(' '));
    assert.equal(rn.stderr, ro.stderr, args.join(' '));
    assert.deepEqual(snapshot(n), snapshot(o), args.join(' '));
    if (want !== undefined) assert.equal(ro.status, want, `${args.join(' ')}: ${ro.stdout}`);
    lastEnd = Math.floor(Date.now() / 1000);
    return ro;
  };
  const slugs = {};
  for (const [key, name, extra] of [
    ['a', 'dependency first', []],
    ['b', 'the job', ['--review-refs', 'references/review/code.md', '--depends-on', '1']],
    ['c', 'third', []],
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
  both([B, '--set-review-refs', 'docs/notes.md'], undefined, 1); // not a review document
  both([B, '--set-review-refs', 'references/review/code.md,x/y.md'], undefined, 0);
  both([B, '--request-review', 'archy', '--note', 'commit def5678'], undefined, 0);
  both([B, '--review', 'changes', '--by', 'archy', '--comments', 'no refs cited'], undefined, 1);
  both([B, '--review', 'changes', '--by', 'archy', '--comments', 'add a test (references/review/code.md)'], undefined, 0);
  both([B, '--waiting', 'ci', '--by', 'cody', '--note', 'x'], undefined, 0);
  both([B, '--note', 'the holder continues'], undefined, 0); // ends the wait
  both([B, '--request-review', 'archy', '--note', 'commit 9999999'], undefined, 0);
  both([B, '--review', 'pass', '--by', 'archy', '--comments', 'good (references/review/code.md)'], undefined, 0); // CLOSE NOW line
  // beyond the oracle (item 039): the reviewer never closes (update.py prints the rule but lets it through)
  const byReviewer = update(n, [B, '--close', '--by', 'archy', '--summary', 'delivered']);
  assert.deepEqual([byReviewer.status, byReviewer.stdout], [1, `❌ ${B}: only the claimer (cody) closes it, else the team lead (cody); not archy\n`]);
  assert.deepEqual(snapshot(n), snapshot(o)); // refused: nothing changed
  both([B, '--close', '--by', 'cody', '--summary', 'delivered'], undefined, 0);
  both([C, '--close', '--summary', 'x'], undefined, 1); // nobody claimed it
  both([C, '--claim', 'cody', '--note', 'n'], { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'other' }, 1); // outside the team scope
  both([C, '--claim', 'cody'], { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' }, 0);
  both([C, '--release', 'cody'], { TEAM_REPOSITORY: 'acme/demo' }, 0);
  both([C, '--claim', 'archy'], undefined, 0);
  both([C, '--dry-run', '--release', 'archy'], undefined, 0);
  both([C, '--request-review', 'any', '--note', 'ready'], undefined, 0);
  both([C, '--start-review', '--by', 'cody'], undefined, 0);
  both([C, '--start-review', '--by', 'zed'], undefined, 1); // in review by cody
  // beyond the oracle (item 033): a stale review is handed on by the team lead (--reassign-review), never taken over
  const stale = update(n, [C, '--start-review', '--by', 'zed'], { BACKLOG_REVIEW_STALE_SECONDS: '-1' });
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.match(stale.stdout, new RegExp(`^❌ ${C}: in review by cody since \\S+; review another item \\(the review is stale: the team lead hands it on with backlog update <item> --reassign-review <agent> --by cody --reason "<why>"\\)\\n$`));
  assert.deepEqual(snapshot(n), snapshot(o)); // refused: nothing changed
  // the class options are gone: unrecognized, exit 2 in both (argparse prints its whole usage, the CLI names the option)
  assert.equal(py('update.py', [C, '--claim', 'cody', '--set-work-class', 'docs'], { cwd: o.cons, tmp: o.t }).status, 2);
  const gone = update(n, [C, '--claim', 'cody', '--set-work-class', 'docs']);
  assert.deepEqual([gone.status, gone.stderr], [2, '❌ backlog: unrecognized arguments: --set-work-class\n']);
});
