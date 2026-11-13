// What the user commands do with an item that belongs to a team: they do not see it. A command that names one answers as it does for a
// number or slug no item holds (one line on standard output, exit 1, nothing written), and a command over many items leaves it where it is.
// Each case has a test on the team item (not seen, nothing written) and, where the command has one, a test that an item without a team is
// still served. The two clean tests still hold the refusal of clean, and each is marked: their expectation changes when clean learns --show-all.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cli, consumer, createdSlug, itemPath, sharedBacklog, readItem, archivedPath, GIT_IDENTITY, changeStored, writeItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'];
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }).trim();
// every file below a folder (the .git folder apart), by content hash
function tree(dir, base = dir, out = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) tree(path, base, out); else out[path.slice(base.length)] = createHash('sha1').update(readFileSync(path)).digest('hex');
  }
  return out;
}

// A backlog with a repository checked out on main, and a branch feature that exists on its origin.
function build() {
  const t = mkdtempSync(join(tmpdir(), 'plain-team-items-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  git(cons, 'branch', 'feature'); git(cons, 'push', '-q', 'origin', 'feature');
  const origin = join(t, 'origins', 'acme', 'backlog-repo.git');
  const run = (args, o = {}) => cli(args, { cwd: cons, tmp: t, plain: true, ...o });
  const ok = (args, o) => { const r = run(args, o); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
  const state = () => JSON.stringify({ files: tree(home), consumer: tree(cons), home: [git(home, 'status', '--porcelain'), git(home, 'rev-parse', 'HEAD')], origin: git(origin, 'for-each-ref') });
  const onBranch = (branch, fn) => { git(cons, 'checkout', '-q', branch); try { return fn(); } finally { git(cons, 'checkout', '-q', 'main'); } };
  const item = (name, { team = false, branch = 'main', closed = false } = {}) => onBranch(branch, () => {
    const made = run(['new', ...NEW(name)]);
    assert.equal(made.status, 0, made.stdout + made.stderr);
    const slug = createdSlug(made.stdout);
    if (team) changeStored(home, itemPath(join(home, 'acme', 'demo'), slug), { team: 't1', status: 'new', refiner: '' }, 'team item'); // the item of a team as it is stored
    if (closed) { // a team item closes by its team steps; the file is set here, as a closed item looks
      const file = itemPath(join(home, 'acme', 'demo'), slug);
      const { fm, body } = readItem(file);
      writeItem(file, { ...fm, status: 'closed', completed: '2026-01-02T00:00:00Z' }, body);
      git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', 'closed item'); git(home, 'push', '-q');
    }
    return slug;
  });
  const fm = slug => {
    for (const path of [itemPath(join(home, 'acme', 'demo'), slug), archivedPath(join(home, 'acme', 'demo'), slug, 'phases')]) {
      try { return readItem(path).fm; } catch { /* the other place */ }
    }
    return null;
  };
  return { t, home, cons, run, ok, state, item, fm };
}
const REFUSED = (r, text) => { assert.equal(r.status, 1, r.stdout + r.stderr); assert.equal(r.stdout.trim().split('\n').length, 1, r.stdout); assert.ok(r.stdout.startsWith(`❌ ${text}`), r.stdout); assert.equal(r.stderr, ''); };

test('done does not see an item with a team: no such item, nothing written', () => {
  const f = build(); const team = f.item('Team job', { team: true });
  const before = f.state();
  REFUSED(f.run(['done', team]), `no phase '${team}'`);
  assert.equal(f.state(), before);
});
test('done bites only on a team item: an item without a team is finished', () => {
  const f = build(); const plain = f.item('Plain job');
  f.ok(['done', plain]);
  assert.equal(f.fm(plain).status, 'closed');
});

test('update --replan does not see a team item it names: the team entry keeps its place and its file is not written', () => {
  const f = build(); const plain = f.item('Plain job'); const team = f.item('Team job', { team: true });
  const file = () => JSON.stringify(f.fm(team));
  const before = file();
  f.ok(['update', '--replan', `${team},${plain}`]);
  assert.equal(file(), before);
  assert.deepEqual(JSON.parse(f.ok(['list', '--json']).stdout).phases.map(r => r.slug), [plain]);
  assert.deepEqual(JSON.parse(readFileSync(join(f.home, 'acme', 'demo', 'index.json'), 'utf8')).branches.main.map(e => e.slug), [plain, team]);
});
test('update --replan of items without a team goes through and the team entry keeps its place', () => {
  const f = build(); const first = f.item('First'); const second = f.item('Second'); const team = f.item('Team job', { team: true });
  f.ok(['update', '--replan', second]);
  assert.deepEqual(JSON.parse(f.ok(['list', '--json']).stdout).phases.map(r => r.slug), [second, first]);
  assert.equal(JSON.parse(readFileSync(join(f.home, 'acme', 'demo', 'index.json'), 'utf8')).branches.main.at(-1).slug, team);
});

test('archive does not see a team item, with and without --force: no such item, nothing written', () => {
  const f = build(); const team = f.item('Team job', { team: true });
  const before = f.state();
  for (const args of [['archive', team], ['archive', team, '--force'], ['archive', team, '--force', '--dry-run']]) REFUSED(f.run(args), `no phase '${team}'`);
  assert.equal(f.state(), before);
});
test('archive bites only on an open team item: --force still archives an open item without a team', () => {
  const f = build(); const plain = f.item('Plain job');
  f.ok(['archive', plain, '--force']);
  assert.equal(f.fm(plain).status, 'pending');
});
test('archive and archive done do not see a closed team item: it stays where it is', () => {
  const f = build(); const one = f.item('Closed one', { team: true, closed: true }); f.item('Closed two', { team: true, closed: true });
  const before = f.state();
  REFUSED(f.run(['archive', one]), `no phase '${one}'`);
  assert.match(f.ok(['archive', 'done']).stdout, /no finished item/);
  assert.equal(f.state(), before);
  assert.equal(f.fm(one).status, 'closed');
});

test('move does not see an item with a team: no such item, nothing written', () => {
  const f = build(); const team = f.item('Team job', { team: true });
  const before = f.state();
  REFUSED(f.run(['move', team, '--to-branch', 'feature']), `no item '${team}' in the backlog of acme/demo`);
  assert.equal(f.state(), before);
});

test('import does not see a team item of the other branch: it stays there, with and without --higher', () => {
  const f = build(); const plain = f.item('Plain on feature', { branch: 'feature' }); const team = f.item('Team on feature', { team: true, branch: 'feature' });
  f.ok(['import', '--branch', 'feature', '--higher']);
  assert.equal(f.fm(team).branch, 'feature');
  assert.equal(f.fm(plain).branch, 'main');
  const g = build(); g.item('Here'); const there = g.item('There', { branch: 'feature' });
  g.ok(['import', '--branch', 'feature', '--higher']);
  assert.deepEqual(JSON.parse(g.ok(['list', '--json']).stdout).phases.map(r => r.slug)[0], there);
});

// the expectation of this test changes when clean learns --show-all
test('clean engages on a team item in its scope, archived ones included: refused before the question, nothing written', () => {
  const f = build(); f.item('Plain job'); const team = f.item('Team job', { team: true, closed: true });
  const from = itemPath(join(f.home, 'acme', 'demo'), team); const to = archivedPath(join(f.home, 'acme', 'demo'), team, 'phases'); // the plain archive does not see a team item: it is filed by hand
  mkdirSync(dirname(to), { recursive: true }); renameSync(from, to);
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'archived team item'); git(f.home, 'push', '-q');
  const before = f.state();
  REFUSED(f.run(['clean'], { input: 'yes\n' }), `clean: ${team} belongs to a team, and no command deletes a team item`);
  REFUSED(f.run(['clean', 'all-branches'], { input: 'yes\n' }), 'clean: ');
  assert.equal(f.state(), before);
});
// the expectation of this test changes when clean learns --show-all
test('clean bites only on the scope: a team item on another branch does not stop it', () => {
  const f = build(); f.item('Plain job'); const team = f.item('Team on feature', { team: true, branch: 'feature' });
  assert.match(f.ok(['clean'], { input: 'yes\n' }).stdout, /1 items removed from branch main/);
  assert.ok(f.fm(team));
});
