// Cross-tool run - cli-parity job 13 (INTEROP): the Python skill and this CLI work one shared backlog, alternating.
// Scenario, once per tool order: A new -> B update --append -> A update --status in_progress -> B new --depends-on <A's item>
// -> A query --status --json == B query --status --json (byte for byte) -> everything is on the bare origin, backlog.db
// committed and agreeing with the item files, no duplicate numbers. Then the same with the tools swapped, and the two
// runs' item files are compared (parsed: the codec writes strings JSON-quoted where PyYAML writes them plain).
// Skips only when python3 or SMOOTH_BACKLOG_SCRIPTS (or PyYAML) is missing. Local bare repos only (shared-fixtures.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const skipReason = process.env.SMOOTH_BACKLOG_SCRIPTS && py('query.py', ['--help']) !== null && spawnSync('python3', ['--version']).status === 0
  ? false : 'needs python3 with PyYAML and SMOOTH_BACKLOG_SCRIPTS (the Python backlog skill scripts)';

const PYTHON = { name: 'python', run: (f, script, args) => py(`${script === 'new' ? 'new_phase' : script}.py`, args, { cwd: f.cons, tmp: f.dir }) };
const NODE = { name: 'node', run: (f, script, args) => cli([script, ...args], { cwd: f.cons, tmp: f.dir }) };

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'interop-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(dir, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { dir, home, cons, bare: join(dir, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git') };
}

// A step must succeed.
function step(f, tool, script, args) {
  const r = tool.run(f, script, args);
  assert.equal(r.status, 0, `${tool.name} ${script} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r;
}

const TS = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g;
// updated_by is per-invocation metadata; the pinned Python writer predates it.
// Compare the shared item contract, with author stamping covered by shared-stale.test.js.
const doc = text => { const { fm, body } = parse(text); return { keys: Object.keys(fm).filter(k => k !== 'updated_by'), fm: JSON.parse(JSON.stringify(fm, (k, v) => k === 'updated_by' ? undefined : v).replace(TS, 'TS').replace(/[0-9a-f]{40}/g, 'SHA')), body }; };

// Right after a changing step the change is committed and pushed, not left for the next command to publish: the working
// home is clean, its HEAD is the bare's main, the bare has one more commit, and the committed item file is as expected.
function published(f, label, commits, file, expect) {
  assert.equal(git(f.home, 'status', '--porcelain'), '', `${label}: the working home has uncommitted changes`);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), git(f.bare, 'rev-parse', 'main'), `${label}: the commit is not on the bare`);
  assert.equal(git(f.bare, 'rev-list', '--count', 'main'), String(commits), `${label}: commits on the bare`);
  expect(parse(git(f.bare, 'show', `main:acme/demo/phases/${file}.md`)), label);
}

// Runs the scenario with tool `a` as the first, third and query side and `b` as the second and fourth. Returns what the
// bare origin holds afterwards, read from a fresh clone of it.
function scenario(t, a, b) {
  const f = fixture(t);
  const sub = ['--name', 'Interop first', '--objective', 'obj Café ☕', '--summary', 'sum first', '--depends-on', 'none'];
  const first = '001-interop-first';
  step(f, a, 'new', sub);
  published(f, 'new', 2, first, ({ fm }, l) => assert.ok(fm.status === 'pending' && fm.seq === 1, l));
  step(f, b, 'update', ['1', '--append', 'Appended by the second tool.\n- [ ] extra']);
  published(f, 'append', 3, first, ({ fm, body }, l) => assert.ok(fm.status === 'pending' && body.includes('Appended by the second tool.\n- [ ] extra'), l));
  step(f, a, 'update', ['1', '--status', 'in_progress']);
  published(f, 'status', 4, first, ({ fm }, l) => assert.equal(fm.status, 'in_progress', l));
  step(f, b, 'new', ['--name', 'Interop second', '--objective', 'obj two', '--summary', 'sum second', '--depends-on', '1']);
  published(f, 'second new', 5, '002-interop-second', ({ fm }, l) => assert.ok(fm.status === 'pending' && fm.depends_on.join() === '1', l));

  const qa = step(f, a, 'query', ['--status', '--json']);
  const qb = step(f, b, 'query', ['--status', '--json']);
  assert.equal(qb.stdout, qa.stdout, 'query --status --json differs between the tools');
  const queue = JSON.parse(qa.stdout);
  assert.ok(JSON.stringify(queue).includes('001-interop-first') && JSON.stringify(queue).includes('002-interop-second'), qa.stdout);

  // Everything is on the bare origin: a fresh clone is the evidence, not the working home.
  const check = join(f.dir, 'check');
  git(f.dir, 'clone', '-q', f.bare, check);
  const folder = join(check, 'acme', 'demo');
  const files = Object.fromEntries(readdirSync(join(folder, 'phases')).sort().map(n => [n, readFileSync(join(folder, 'phases', n), 'utf8')]));
  assert.deepEqual(Object.keys(files), ['001-interop-first.md', '002-interop-second.md']); // no duplicate or skipped number
  const one = parse(files['001-interop-first.md']);
  const two = parse(files['002-interop-second.md']);
  assert.equal(one.fm.status, 'in_progress');
  assert.ok(one.body.includes('Appended by the second tool.\n- [ ] extra'));
  assert.deepEqual(two.fm.depends_on, [1]);
  assert.equal(two.fm.status, 'pending');
  assert.deepEqual([one.fm.priority, two.fm.priority], [0, 1]);

  assert.ok(git(f.bare, 'ls-tree', '-r', '--name-only', 'main').split('\n').includes('acme/demo/backlog.db'), 'backlog.db is not committed');
  const con = db.connect(folder);
  try {
    const stored = con.prepare('SELECT seq, slug, status, priority, path, sha FROM phase ORDER BY seq').all().map(r => ({ ...r }));
    for (const r of stored) { // the stored hash is that of the committed file (lib_db.py:452 sha256_file), whichever tool wrote it
      assert.equal(r.sha, createHash('sha256').update(readFileSync(join(folder, r.path))).digest('hex'), `${r.slug}: sha`);
    }
    const rows = stored.map(({ path, sha, ...r }) => r);
    assert.deepEqual(rows, [
      { seq: 1, slug: '001-interop-first', status: 'in_progress', priority: 0 },
      { seq: 2, slug: '002-interop-second', status: 'pending', priority: 1 },
    ]);
  } finally { con.close(); }

  assert.equal(git(f.home, 'status', '--porcelain'), '', 'the working home has uncommitted changes');
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), git(f.bare, 'rev-parse', 'main'), 'the home is not what the bare holds');
  const subjects = git(f.bare, 'log', '--format=%s', 'main').split('\n');
  assert.equal(subjects.length, 5, subjects.join('\n')); // init + one commit per changing step
  return { files, queue };
}

test('Python and the CLI alternate on one shared backlog (python first)', { skip: skipReason }, t => {
  scenario(t, PYTHON, NODE);
});

test('the same with the tools swapped (CLI first), and both runs leave the same items', { skip: skipReason }, t => {
  const swapped = scenario(t, NODE, PYTHON);
  const first = scenario(t, PYTHON, NODE);
  for (const name of Object.keys(first.files)) assert.deepEqual(doc(swapped.files[name]), doc(first.files[name]), name);
  // sha is the hash of the file text (quoting differs between the codecs) and commit_sha the consumer's HEAD of each fixture
  const norm = q => JSON.parse(JSON.stringify(q, (k, v) => (k === 'sha' || k === 'commit_sha' ? 'X' : k === 'updated_by' ? undefined : v)).replace(TS, 'TS'));
  assert.deepEqual(norm(swapped.queue), norm(first.queue));
});
