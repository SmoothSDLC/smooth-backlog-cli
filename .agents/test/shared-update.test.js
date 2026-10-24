// Tests for src/shared/update.js - cli-parity job 11 (UPDATE): `backlog update` in shared mode, non-team flags.
// Oracle: update.py:88-257 (no team_action) run on a twin fixture. Both twins are seeded identically, the same
// command runs on each (python on one, the CLI on the other), and the printed lines, exit status, item files, db rows
// and events, and the pushed commits must be identical (timestamps and the shas that hash them aside). Parity tests
// skip when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing. Local bare repos only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';
import { cliAsync, numberClash, pushedState, waitsForRunLock } from './shared-concurrency.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const oracle = py('update.py', ['--help']) !== null;

// A shared home with consumer acme/demo on main and seven items: four open (one in progress, one waiting), one with
// a review class, one done. ids: the mirror db is built by the Node scan; the item files are fixed text.
function seed({ permuteIds = false } = {}) {
  const t = mkdtempSync(join(tmpdir(), 'update-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const folder = join(home, 'acme', 'demo');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const item = (seq, name, extra = {}) => {
    const num = String(seq).padStart(3, '0');
    store.write({
      path: join(folder, `phases/${num}-${name}.md`),
      fm: {
        phase: `${num}-${name}`, seq, name: `Name ${name}`, objective: `Café ☕ ${name}`, summary: `sum ${name}`, status: 'pending',
        severity: 'normal', priority: seq - 1, repository: 'acme/demo', branch: 'main', commit: '', location: '',
        created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z', depends_on: [], claimed_by: '', claimed_at: '', ...extra,
      },
      body: `\n# Phase ${num}\n\nBody of ${name}.\n`,
    }, folder);
  };
  item(1, 'alpha');
  item(2, 'beta');
  item(3, 'gamma', { status: 'in_progress' });
  item(4, 'delta', { wait_on: 'workflow run', wait_since: '2026-10-02T00:00:00Z' });
  item(5, 'epsilon', { review_classes: ['tests'], review_state: '' });
  item(6, 'zeta', { status: 'done', priority: 5, completed: '2026-10-02T00:00:00Z' });
  const con = db.connect(folder);
  db.scan(con, folder);
  if (permuteIds) { // the row id of an item is no longer its number: 1 -> 2, 2 -> 3, 3 -> 1
    con.exec('UPDATE phase SET id = id + 100');
    con.exec('UPDATE phase SET id = CASE seq WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 1 ELSE id END');
  }
  con.close();
  git(home, 'add', '-A');
  git(home, 'commit', '-q', '-m', 'fixture');
  git(home, 'push', '-q');
  return { t, home, cons, folder };
}

const TS = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g;
const norm = s => String(s).replace(TS, 'TS').replace(/[0-9a-f]{7}->[0-9a-f]{7}/g, 'SHA->SHA');

// The codec writes strings JSON-quoted (contract section 3) where PyYAML writes them plain: the front matter is compared
// as parsed values in key order, the body byte for byte.
const doc = text => norm(JSON.stringify(parse(text)));

// Everything a command may have changed: the item files, the mirror rows and events, the commits.
function snapshot(f) {
  const files = {};
  for (const n of readdirSync(join(f.folder, 'phases'))) files[n] = doc(readFileSync(join(f.folder, 'phases', n), 'utf8'));
  const con = db.connect(f.folder);
  const rows = x => con.prepare(x).all().map(r => norm(JSON.stringify({ ...r })));
  const out = {
    files,
    phases: rows('SELECT id, handoff_id, slug, seq, name, objective, summary, status, severity, priority, path, branch, commit_sha, location, repository, size_score, completed_at FROM phase ORDER BY id'),
    events: rows('SELECT handoff_id, phase_id, event, branch, commit_sha, note FROM event ORDER BY id'),
    log: git(f.home, 'log', '--format=%s').split('\n'),
    origin: git(f.home, 'rev-parse', 'origin/main') === git(f.home, 'rev-parse', 'HEAD'),
  };
  con.close();
  return out;
}

// Runs the same command on both twins; asserts the same exit status, stdout, files, db and commits.
// loose: only the exit status and stdout (argparse and traceback texts are python's own).
// A write stamps `updated` to the second: a command that starts in the second of the previous one can rewrite a file
// byte-identically, and then no `reingested` event follows. Start each command in a fresh second.
let lastEnd = 0;
function pair(t, o, n, args, { loose = false } = {}) {
  while (Math.floor(Date.now() / 1000) === lastEnd) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  const ro = py('update.py', args, { cwd: o.cons, tmp: o.t });
  const rn = cli(['update', ...args], { cwd: n.cons, tmp: n.t });
  assert.equal(rn.status, ro.status, `${args.join(' ')}: ${rn.stderr}`);
  assert.equal(norm(rn.stdout), norm(ro.stdout), args.join(' '));
  if (!loose) assert.equal(rn.stderr, ro.stderr, args.join(' '));
  assert.deepEqual(snapshot(n), snapshot(o), args.join(' '));
  lastEnd = Math.floor(Date.now() / 1000);
  return rn;
}
function twins(t) {
  if (!oracle) { t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing'); return null; }
  return [seed(), seed()];
}
const run = (f, args) => cli(['update', ...args], { cwd: f.cons, tmp: f.t });
const fm = (f, name) => parse(readFileSync(join(f.folder, 'phases', name), 'utf8'));

test('field updates (status, location, commit, summary, name, objective, note) match update.py', t => {
  const w = twins(t);
  if (!w) return;
  const r = pair(t, ...w, ['2', '--status', 'in_progress', '--location', 'src/a.js', '--commit', 'abc1234', '--summary', 'Neue Zusammenfassung ☕',
    '--name', 'Beta 2', '--objective', 'Obj: "quoted" it\'s', '--note', 'working on it']);
  assert.match(r.stdout, /^✅ 002-beta updated \(status=in_progress, commit=abc1234, location=src\/a\.js, summary=/);
  pair(t, ...w, ['002-beta', '--seq', '77', '--size_score', '5']);
  pair(t, ...w, ['1', '--note', 'only a note']);
  pair(t, ...w, ['--size_score=3', '1']);
});

test('--append adds the text after a blank line and a final newline, like update.py', t => {
  const w = twins(t);
  if (!w) return;
  pair(t, ...w, ['1', '--append', 'extra line\n\n  indented\n- [ ] item']);
  pair(t, ...w, ['1', '--append', '## Definition of done\n- [ ] checked', '--status', 'in_progress']);
});

test('--priority moves the item to that rank and re-densifies, with a planning_event (match update.py)', t => {
  const w = twins(t);
  if (!w) return;
  pair(t, ...w, ['3', '--priority', '0']);
  pair(t, ...w, ['1', '--priority', '99']);
  pair(t, ...w, ['2', '--priority', '-4']);
  pair(t, ...w, ['004-delta', '--priority', '1', '--note', 'resume']);
  pair(t, ...w, ['6', '--priority', '0']); // a done item is in no queue
});

test('--status done completes, stamps completed, re-prioritizes and prints the planning-event lines (match update.py)', t => {
  const w = twins(t);
  if (!w) return;
  const r = pair(t, ...w, ['2', '--status', 'done']);
  assert.match(r.stdout, /PLANNING EVENT — completing work RE-PRIORITIZES the backlog/);
  assert.match(fm(w[1], '002-beta.md').fm.completed, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  pair(t, ...w, ['1', '--status', 'done', '--note', 'n']);
  pair(t, ...w, ['3', '--status', 'done', '--priority', '0']);
  pair(t, ...w, ['4', '--status', 'done']); // empties the backlog down to item 5
  pair(t, ...w, ['6', '--status', 'done']); // already done: completed stays
});

test('--replan sets the leading order by slug or number, ignores unknown names, and prints the order (match update.py)', t => {
  const w = twins(t);
  if (!w) return;
  const r = pair(t, ...w, ['--replan', '4,002-beta, zzz ,4']);
  assert.match(r.stdout, /^📋 PLANNING EVENT — backlog re-prioritized \(P0 = next\):\n {3}P0 {2}004-delta\n {3}P1 {2}002-beta\n/);
  pair(t, ...w, ['--replan', '3', '--note', 'because']);
  pair(t, ...w, ['--replan', ',']);
  pair(t, ...w, ['--replan', '1', '1', '--status', 'done']); // replan wins over the item (ignored)
});

test('--dry-run prints the plan and changes and commits nothing (match update.py)', t => {
  const w = twins(t);
  if (!w) return;
  const before = snapshot(w[1]);
  const r = pair(t, ...w, ['2', '--status', 'done', '--dry-run']);
  assert.match(r.stdout, /^ℹ️  \[dry-run\] 002-beta: would set \{'status': 'done'\}; COMPLETE -> re-prioritize backlog\n$/);
  pair(t, ...w, ['3', '--priority', '1', '--name', "It's \"x\"", '--seq', '9', '--dry-run']);
  pair(t, ...w, ['3', '--append', 'x', '--dry-run']);
  pair(t, ...w, ['--replan', '3,1', '--dry-run']);
  assert.deepEqual(snapshot(w[1]), before);
});

test('refusals are the oracle\'s: stdout, exit 1, nothing written, nothing committed', t => {
  const w = twins(t);
  if (!w) return;
  const before = snapshot(w[1]);
  for (const args of [['--status', 'done'], ['2', '--branch', 'x'], ['2', '--commit', ''], ['2', '--commit', '  '], ['999', '--status', 'done'],
    ['nosuch'], ['0'], ['5', '--status', 'done'], ['2', '--set-estimate', '0']]) {
    assert.equal(pair(t, ...w, args).status, 1, args.join(' '));
  }
  assert.deepEqual(snapshot(w[1]), before);
});

test('invalid command lines exit 2 or 1 like python (texts are python\'s own)', t => {
  const w = twins(t);
  if (!w) return;
  assert.equal(pair(t, ...w, ['2', '--bogus'], { loose: true }).status, 2);
  assert.equal(pair(t, ...w, ['2', '3'], { loose: true }).status, 2);
  assert.equal(pair(t, ...w, ['2', '--status'], { loose: true }).status, 2);
  assert.equal(pair(t, ...w, ['2', '--set-complexity', 'huge'], { loose: true }).status, 2);
  assert.equal(pair(t, ...w, ['2', '--priority', 'abc'], { loose: true }).status, 1); // python: ValueError traceback
});

test('--note on an item that waits clears the wait with a WAIT DONE line (match update.py)', t => {
  const w = twins(t);
  if (!w) return;
  pair(t, ...w, ['4', '--note', 'workflow finished']);
  assert.equal(fm(w[1], '004-delta.md').fm.wait_on, '');
  assert.match(fm(w[1], '004-delta.md').body, /\n\nWAIT DONE \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ \(next step on the item\)\n$/);
});

test('refinement flags --set-work-class --set-review-classes --set-estimate --set-complexity --set-layer --set-depends-on (match update.py)', t => {
  const w = twins(t);
  if (!w) return;
  pair(t, ...w, ['2', '--set-work-class', 'app-code,skills', '--set-review-classes', 'code,tests', '--set-estimate', '30',
    '--set-complexity', 'high', '--set-layer', '3', '--set-depends-on', '1,003-gamma']);
  pair(t, ...w, ['2', '--set-depends-on', 'none', '--set-layer', 'process']);
  pair(t, ...w, ['2', '--set-depends-on', '99']);
  pair(t, ...w, ['2', '--set-work-class', 'bogus']);
  pair(t, ...w, ['2', '--set-review-classes', 'app-code,nope,more']);
});

test('a bare number is the item number, never the database row id', t => {
  const f = seed({ permuteIds: true });
  const r = run(f, ['2', '--status', 'in_progress']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^✅ 002-beta updated/);
  assert.equal(fm(f, '002-beta.md').fm.status, 'in_progress');
  assert.equal(fm(f, '001-alpha.md').fm.status, 'pending'); // row id 2 is item 1: it must not be touched
  assert.equal(fm(f, '003-gamma.md').fm.updated, '2026-10-01T00:00:00Z');
  const p = run(f, ['3', '--priority', '0']);
  assert.match(p.stdout, /P0/);
  assert.equal(fm(f, '003-gamma.md').fm.priority, 0);
  assert.equal(fm(f, '001-alpha.md').fm.priority, 1);
});

test('order of work: pull first, then change, write, scan the db, log the event, commit and push', () => {
  const f = seed();
  const other = join(f.t, 'other');
  git(f.t, 'clone', '-q', join(f.t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), other);
  const text = readFileSync(join(other, 'acme', 'demo', 'phases', '004-delta.md'), 'utf8').replace('sum delta', 'remote summary');
  writeFileSync(join(other, 'acme', 'demo', 'phases', '004-delta.md'), text);
  git(other, 'commit', '-q', '-am', 'remote edit');
  git(other, 'push', '-q');
  const r = run(f, ['4', '--status', 'in_progress', '--note', 'go']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fm(f, '004-delta.md').fm.summary, 'remote summary'); // the pull happened before the item was read and rewritten
  const log = git(f.home, 'log', '--format=%s', '-1');
  assert.equal(log, 'acme/demo: update.py 4 --status');
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  const con = db.connect(f.folder);
  const p = con.prepare("SELECT status FROM phase WHERE slug='004-delta'").get();
  const e = con.prepare("SELECT event, note FROM event ORDER BY id DESC LIMIT 2").all().map(x => ({ ...x }));
  con.close();
  assert.equal(p.status, 'in_progress');
  assert.deepEqual(e.map(x => x.event), ['reingested', 'state_change']);
  assert.equal(e[1].note, 'go');
  const head = git(f.home, 'show', '--stat', '--format=', 'HEAD');
  assert.match(head, /acme\/demo\/backlog\.db/);
  assert.match(head, /acme\/demo\/phases\/004-delta\.md/);
});

test('a refusal and a dry run make no commit', () => {
  const f = seed();
  const head = git(f.home, 'rev-parse', 'HEAD');
  assert.equal(run(f, ['2', '--branch', 'x']).status, 1);
  assert.equal(run(f, ['2', '--status', 'done', '--dry-run']).status, 0);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), head);
});

test('diagnostics that echo the input are redacted', () => {
  const f = seed();
  const r = run(f, ['https://user:s3cret@host/x']);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr, /s3cret/);
  const u = run(f, ['2', '--bogus=user:s3cret@host']);
  assert.equal(u.status, 2);
  assert.doesNotMatch(u.stdout + u.stderr, /s3cret/);
});

test('a repository without a backlog yet: no phase, exit 1', () => {
  const f = seed();
  rmSync(f.folder, { recursive: true });
  git(f.home, 'add', '-A');
  git(f.home, 'commit', '-q', '-m', 'drop');
  git(f.home, 'push', '-q');
  const r = run(f, ['1', '--status', 'done']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^❌ no phase '1' \(run scan\.py, or new_phase\.py to create it\)\n$/);
});

// ---------------------------------------------------------------- review fixes (Codex review 2026-10-23, job 11)

test('review P1: update holds the per-repository run lock from the pull to the push (a held lock makes it wait)', async () => {
  const f = seed();
  const watch = () => fm(f, '002-beta.md').fm.summary;
  const { during, result, before } = await waitsForRunLock(f, ['update', '2', '--summary', 'locked change'], watch);
  assert.deepEqual(during, { exited: false, same: true }, 'the command must wait while another command holds the lock');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(before, 'sum beta');
  assert.equal(watch(), 'locked change');
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
});

test('review P1: a renumbering during the commit is followed by a rescan that is committed and pushed (db and working tree current)', () => {
  const f = seed();
  numberClash(f);
  const r = run(f, ['2', '--summary', 'with a clash']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /renumbered 008 -> 009/);
  assert.equal(git(f.home, 'status', '--porcelain'), '', 'the rescanned backlog.db is committed');
  assert.equal(git(f.home, 'rev-parse', 'origin/main'), git(f.home, 'rev-parse', 'HEAD'));
  const pushed = pushedState(f);
  assert.ok(pushed.slugs.includes('009-local') && !pushed.slugs.includes('008-local'), pushed.slugs.join());
  assert.ok(pushed.files.includes('phases/009-local.md') && !pushed.files.includes('phases/008-local.md'));
});

test('review P2: --summary="two words" and --append="extra text" are options with a value, not positionals (argparse)', () => {
  const f = seed();
  const a = run(f, ['2', '--summary=two words']);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(fm(f, '002-beta.md').fm.summary, 'two words');
  const b = run(f, ['2', '--append=extra text']);
  assert.equal(b.status, 0, b.stderr);
  assert.match(fm(f, '002-beta.md').body, /\n\nextra text\n$/);
  assert.equal(run(f, ['--summary=two words', '2']).status, 0); // the option may come first
  assert.equal(run(f, ['an item', '--bogus x']).status, 2);       // an unknown option with a space is a positional: two of them are an error
});

// ---------------------------------------------------------------- review fixes (Codex review 2026-10-23, job 15)

// An item that a team can claim: work class, review class and covering ref, estimate and a definition of done.
function claimable(f) {
  const r = run(f, ['2', '--set-work-class', 'app-code', '--set-review-classes', 'tests', '--set-review-refs', 'references/review/tests.md', '--set-estimate', '10', '--append', '## Definition of done\n- [ ] x']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

test('review P1 (job 15): two processes cannot both claim an unclaimed item; a claim waits for the run lock', async () => {
  const f = seed();
  claimable(f);
  const w = await waitsForRunLock(f, ['update', '2', '--claim', 'cody'], () => fm(f, '002-beta.md').fm.claimed_by);
  assert.deepEqual(w.during, { exited: false, same: true }, 'the claim waits while another command holds the lock');
  assert.equal(w.result.status, 0, w.result.stdout + w.result.stderr);
  const g = seed();
  claimable(g);
  const both = await Promise.all(['cody', 'amy'].map(who => cliAsync(['update', '2', '--claim', who], { cwd: g.cons, tmp: g.t }).done));
  assert.deepEqual(both.map(r => r.status).sort(), [0, 1], both.map(r => r.stdout + r.stderr).join('\n'));
  const winner = both[0].status === 0 ? 'cody' : 'amy';
  assert.equal(fm(g, '002-beta.md').fm.claimed_by, winner);
  assert.equal(git(g.home, 'status', '--porcelain'), '');
  assert.equal(git(g.home, 'rev-parse', 'origin/main'), git(g.home, 'rev-parse', 'HEAD'));
});

test('review P2 (job 15): --set-review-refs goes through checkRefs: an absolute or ..-crossing ref is refused and nothing is written', () => {
  const f = seed();
  const before = readFileSync(join(f.folder, 'phases', '005-epsilon.md'), 'utf8');
  const head = git(f.home, 'rev-parse', 'HEAD');
  for (const ref of ['../../outside/tests.md', '/outside/tests.md']) {
    const r = run(f, ['5', '--set-review-refs', ref]);
    assert.notEqual(r.status, 0, ref);
    assert.match(r.stdout + r.stderr, /review ref .* (is absolute|contains '\.\.')/);
  }
  assert.equal(readFileSync(join(f.folder, 'phases', '005-epsilon.md'), 'utf8'), before);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('review P2: update on an archived item is refused for every flag that goes through it, and writes nothing', () => {
  const f = seed();
  assert.equal(cli(['archive', '2', '--force'], { cwd: f.cons, tmp: f.t }).status, 0);
  const file = join(f.folder, 'archive', 'phases', '002-beta.md');
  const before = readFileSync(file, 'utf8');
  const head = git(f.home, 'rev-parse', 'HEAD');
  for (const args of [['002-beta', '--summary', 'new'], ['2', '--status', 'done'], ['002-beta', '--claim', 'me'], ['002-beta', '--request-review', 'codex'], ['002-beta', '--close']]) {
    const r = run(f, args);
    assert.equal(r.status, 1, `${args}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /002-beta is archived and cannot be edited/, args.join(' '));
  }
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('review P1: update whose rescan throws (another item with size_score: []) restores the file and the db, and commits nothing', () => {
  const f = seed();
  const bad = join(f.folder, 'phases', '001-alpha.md');
  writeFileSync(bad, readFileSync(bad, 'utf8').replace('\nseq: 1\n', '\nseq: 1\nsize_score: []\n'));
  const target = join(f.folder, 'phases', '002-beta.md');
  const text = readFileSync(target, 'utf8');
  const rows = () => { const c = db.connect(f.folder); try { return JSON.stringify(c.prepare('SELECT * FROM phase ORDER BY id').all().concat(c.prepare('SELECT * FROM event ORDER BY id').all())); } finally { c.close(); } };
  const before = rows();
  const head = git(f.home, 'rev-parse', 'HEAD');
  const r = run(f, ['2', '--summary', 'REFUSED_EDIT']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(target, 'utf8'), text);
  assert.equal(rows(), before);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('review P2: after two clones picked one number, the merged queue is re-densified (no two items share a priority)', () => {
  const f = seed();
  numberClash(f);
  assert.equal(run(f, ['1', '--summary', 'touch']).status, 0);
  const ranks = readdirSync(join(f.folder, 'phases')).map(n => parse(readFileSync(join(f.folder, 'phases', n), 'utf8')).fm).filter(m => ['pending', 'in_progress'].includes(m.status)).map(m => m.priority).sort((a, b) => a - b);
  assert.deepEqual(ranks, ranks.map((_, i) => i));
});

test('review P1: update of an item of another team (field edit, note, append) is refused and writes nothing', () => {
  const f = seed();
  const text = readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8');
  const head = git(f.home, 'rev-parse', 'HEAD');
  for (const args of [['2', '--summary', 'x'], ['2', '--note', 'x'], ['2', '--append', 'x'], ['2', '--priority', '0']]) {
    const r = cli(['update', ...args], { cwd: f.cons, tmp: f.t, env: { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'release' } });
    assert.equal(r.status, 1, `${args}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /team session is bound/);
  }
  assert.equal(readFileSync(join(f.folder, 'phases', '002-beta.md'), 'utf8'), text);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

for (const [title, args] of [['query', ['query', '--all']], ['next', ['next']], ['pop', ['pop', '--agent', 'cody']]]) {
  test(`review P1: ${title} (a read that pulls) waits while another command holds the operation lock of the clone`, async () => {
    const f = seed();
    const w = await waitsForRunLock(f, args, () => git(f.home, 'rev-parse', 'HEAD'));
    assert.deepEqual(w.during, { exited: false, same: true }, `${title} waits for the lock`);
  });
}

test('review P1: a lock left by a dead process is taken over (said once); a live holder is waited for and, after the configured wait, named in the refusal', async () => {
  const f = seed();
  const lock = join(f.home, '.git', 'smooth-backlog-cli-run.lock');
  const dead = spawnSync(process.execPath, ['-e', '0']).pid; // a pid that was alive a moment ago and is not now
  writeFileSync(lock, JSON.stringify({ pid: dead, host: hostname(), command: 'update' }));
  const r = cli(['query', '--all'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr.split(`took over a stale lock of process ${dead}`).length, 2, r.stderr);
  assert.equal(existsSync(lock), false, 'the lock is released after the command');

  // a live holder: refused after the configured wait, naming pid and command
  let refused;
  await store.cloneLocked(f.home, async () => { refused = cli(['query', '--all'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_LOCK_WAIT_MS: '400' } }); });
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stderr, new RegExp(`locked by another process \\(pid ${process.pid}[,)]`));
  // a holder that finishes inside the configured wait: the command waits and succeeds
  let ok;
  await store.cloneLocked(f.home, async () => {
    const child = cliAsync(['query', '--all'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_LOCK_WAIT_MS: '15000' } });
    await new Promise(res => setTimeout(res, 1500));
    assert.equal(child.exited(), false, 'still waiting while the holder runs');
    ok = child;
  });
  assert.equal((await ok.done).status, 0);
});
