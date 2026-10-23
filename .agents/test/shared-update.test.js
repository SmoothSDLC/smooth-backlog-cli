// Tests for src/shared/update.js - cli-parity job 11 (UPDATE): `backlog update` in shared mode, non-team flags.
// Oracle: update.py:88-257 (no team_action) run on a twin fixture. Both twins are seeded identically, the same
// command runs on each (python on one, the CLI on the other), and the printed lines, exit status, item files, db rows
// and events, and the pushed commits must be identical (timestamps and the shas that hash them aside). Parity tests
// skip when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing. Local bare repos only (shared-fixtures.js).
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
