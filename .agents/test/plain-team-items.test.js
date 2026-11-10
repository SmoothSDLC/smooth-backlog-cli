// What the plain commands do with an item that belongs to a team (decision AO, phase 7c-2c). A plain command refuses such an item when it would
// change its team state (status, stage, claim, review, refinement, dependency, place in the team's queue, deletion): one line on standard output,
// exit 1, nothing written. move, archive of a closed item and archive done only file or store it, and keep working.
// Each refusal has an engage test (the team item is refused, nothing is written) and a bite test (an item without a team is not affected).
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, createdSlug, itemPath, sharedBacklog, readItem, archivedPath, GIT_IDENTITY, writeItem } from './shared-fixtures.js';

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
    const made = team ? run(['team', 'new', '--team', 't1', '--agent', 'lead', ...NEW(name)]) : run(['new', ...NEW(name)]);
    assert.equal(made.status, 0, made.stdout + made.stderr);
    const slug = createdSlug(made.stdout);
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

test('done engages on an item with a team: refused, nothing written', () => {
  const f = build(); const team = f.item('Team job', { team: true });
  const before = f.state();
  REFUSED(f.run(['done', team]), 'use backlog team update: a team item is changed only there');
  assert.equal(f.state(), before);
});
test('done bites only on a team item: an item without a team is finished', () => {
  const f = build(); const plain = f.item('Plain job');
  f.ok(['done', plain]);
  assert.equal(f.fm(plain).status, 'closed');
});

test('update --replan engages on a team item it names: refused, nothing written; backlog team update --replan is the door', () => {
  const f = build(); const plain = f.item('Plain job'); const team = f.item('Team job', { team: true });
  const before = f.state();
  REFUSED(f.run(['update', '--replan', `${team},${plain}`]), `use backlog team update --replan: ${team} belongs to a team`);
  assert.equal(f.state(), before);
  f.ok(['team', 'update', '--replan', `${team},${plain}`, '--team', 't1', '--agent', 'lead']);
  assert.deepEqual(JSON.parse(f.ok(['list', '--json']).stdout).phases.map(r => r.slug), [team, plain]);
});
test('update --replan bites only on a team item it names: a replan of items without a team goes through', () => {
  const f = build(); const first = f.item('First'); const second = f.item('Second'); const team = f.item('Team job', { team: true });
  f.ok(['update', '--replan', second]);
  assert.deepEqual(JSON.parse(f.ok(['list', '--json']).stdout).phases.map(r => r.slug), [second, first, team]);
});

test('archive engages on a team item that is not closed, with and without --force: refused, nothing written', () => {
  const f = build(); const team = f.item('Team job', { team: true });
  const before = f.state();
  for (const args of [['archive', team], ['archive', team, '--force'], ['archive', team, '--force', '--dry-run']]) REFUSED(f.run(args), `use backlog team update: ${team} belongs to a team and is not closed`);
  assert.equal(f.state(), before);
});
test('archive bites only on an open team item: --force still archives an open item without a team', () => {
  const f = build(); const plain = f.item('Plain job');
  f.ok(['archive', plain, '--force']);
  assert.equal(f.fm(plain).status, 'pending');
});
test('archive and archive done keep working for a closed team item (finished-item storage)', () => {
  const f = build(); const one = f.item('Closed one', { team: true, closed: true }); const two = f.item('Closed two', { team: true, closed: true });
  f.ok(['archive', one]);
  assert.equal(f.fm(one).status, 'closed');
  assert.match(f.ok(['archive', 'done']).stdout, new RegExp(`archived 1 finished item\\(s\\): ${two}`));
  assert.equal(f.fm(two).status, 'closed');
});

test('move keeps working for an item with a team (it files the item, no team rule): the team fields stay', () => {
  const f = build(); const team = f.item('Team job', { team: true });
  const keys = ['team', 'status', 'claimed_by', 'refiner', 'depends_on'];
  const before = f.fm(team);
  f.ok(['move', team, '--to-branch', 'feature']);
  assert.deepEqual(keys.map(k => f.fm(team)[k]), keys.map(k => before[k]));
  assert.equal(f.fm(team).branch, 'feature');
});

test('import --higher engages on a team item it would place first: refused before anything is moved', () => {
  const f = build(); f.item('Plain on feature', { branch: 'feature' }); const team = f.item('Team on feature', { team: true, branch: 'feature' });
  const before = f.state();
  REFUSED(f.run(['import', '--branch', 'feature', '--higher']), `import --higher: ${team} belongs to a team`);
  assert.equal(f.state(), before);
});
test('import bites only with --higher on a team item: import without it moves the team item, and --higher on items without a team places them first', () => {
  const f = build(); f.item('Here'); const team = f.item('Team on feature', { team: true, branch: 'feature' });
  f.ok(['import', '--branch', 'feature']);
  assert.equal(f.fm(team).branch, 'main');
  const g = build(); g.item('Here'); const there = g.item('There', { branch: 'feature' });
  g.ok(['import', '--branch', 'feature', '--higher']);
  assert.deepEqual(JSON.parse(g.ok(['list', '--json']).stdout).phases.map(r => r.slug)[0], there);
});

test('clean engages on a team item in its scope, archived ones included: refused before the question, nothing written', () => {
  const f = build(); f.item('Plain job'); const team = f.item('Team job', { team: true, closed: true });
  f.ok(['archive', team]);
  const before = f.state();
  REFUSED(f.run(['clean'], { input: 'yes\n' }), `clean: ${team} belongs to a team, and no command deletes a team item`);
  REFUSED(f.run(['clean', 'all-branches'], { input: 'yes\n' }), 'clean: ');
  assert.equal(f.state(), before);
});
test('clean bites only on the scope: a team item on another branch does not stop it', () => {
  const f = build(); f.item('Plain job'); const team = f.item('Team on feature', { team: true, branch: 'feature' });
  assert.match(f.ok(['clean'], { input: 'yes\n' }).stdout, /1 items removed from branch main/);
  assert.ok(f.fm(team));
});
