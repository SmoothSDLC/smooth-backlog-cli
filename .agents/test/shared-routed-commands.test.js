// Tests for the commands `backlog done`, `backlog clean`, `backlog import` and `backlog archive done`: each is a command of its own with its own help.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { HELP } from '../../src/help.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// acme/demo on main with the items One, Two, Three; the branch feature exists on the origin.
function build() {
  const t = mkdtempSync(`${tmpdir()}/routed-test-`);
  dirs.push(t);
  sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const run = (...args) => { const r = cli(args, { cwd: cons, tmp: t }); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
  for (const name of ['One', 'Two', 'Three']) run('new', '--name', name, '--objective', `o ${name}`, '--summary', `s ${name}`, '--depends-on', 'none');
  git(cons, 'branch', 'feature'); git(cons, 'push', '-q', 'origin', 'feature');
  const f = { t, cons, run, any: (...a) => cli(a, { cwd: cons, tmp: t }), typed: (answer, ...a) => cli(a, { cwd: cons, tmp: t, input: `${answer}\n` }) };
  f.queue = () => JSON.parse(f.any('list', 'open', '--json').stdout).phases.map(x => x.seq);
  f.status = seq => { const r = f.any('show', String(seq)); return r.status === 0 ? JSON.parse(r.stdout).status : 'none'; };
  return f;
}
// one call on a fresh backlog: the result of the command and the backlog it leaves
function run(args, prepare = () => {}, { input } = {}) {
  const one = build();
  prepare(one);
  const a = input === undefined ? one.any(...args) : one.typed(input, ...args);
  return { one, a };
}

test('done finishes the item like update --status done, passes the other arguments on, and needs an item', () => {
  const { one, a } = run(['done', '2']);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(one.status(2), 'closed');
  assert.deepEqual(one.queue(), [1, 3]);
  const note = build();
  assert.equal(note.any('done', '1', '--note', 'shipped').status, 0);
  assert.equal(note.status(1), 'closed');
  const json = note.any('done', '3', '--json'); // update prints text only, so the option is refused there and here
  assert.equal(json.status, 2);
  assert.match(json.stderr, /unrecognized arguments: --json/);
  assert.equal(note.status(3), 'pending');
  for (const args of [['done'], ['done', '--json'], ['done', '--note', 'x']]) {
    const r = note.any(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /done needs an item \(usage: backlog done <item>\)/);
  }
});

test('done refuses an item that does not exist exactly as update does, and writes nothing', () => {
  const f = build();
  const d = f.any('done', '9'); const u = f.any('update', '9', '--status', 'done');
  assert.equal(d.status, u.status); assert.equal(d.stdout, u.stdout); assert.equal(d.stderr, u.stderr);
  assert.notEqual(d.status, 0);
  assert.deepEqual(f.queue(), [1, 2, 3]);
});

test('clean asks first, removes the items of this branch after a yes', () => {
  const f = build();
  const no = f.typed('no', 'clean');
  assert.equal(no.status, 2);
  assert.match(no.stderr, /This will remove every backlog item of acme\/demo, branch main/);
  assert.match(no.stderr, /not confirmed \(type yes\); nothing changed/);
  assert.deepEqual(f.queue(), [1, 2, 3]);
  assert.equal(f.any('clean').status, 2); // no answer is no
  assert.deepEqual(f.queue(), [1, 2, 3]);
  const yes = f.typed('yes', 'clean');
  assert.equal(yes.status, 0, yes.stdout + yes.stderr);
  assert.match(yes.stdout, /3 items removed from branch main/);
  assert.deepEqual(f.queue(), []);
});

test('clean all-branches removes the items of every branch; a word it does not know is refused and names clean', () => {
  const f = build();
  git(f.cons, 'checkout', '-q', 'feature');
  f.run('new', '--name', 'Feat', '--objective', 'o', '--summary', 's', '--depends-on', 'none');
  git(f.cons, 'checkout', '-q', 'main');
  const one = f.typed('yes', 'clean');
  assert.equal(one.status, 0, one.stderr);
  assert.match(f.any('list', 'all-branches').stdout, /001-feat|feat/i); // the item of the other branch is still there
  assert.match(f.typed('yes', 'clean', 'all-branches').stdout, /items removed from every branch/);
  assert.doesNotMatch(f.any('list', 'all-branches').stdout, /Feat/);
  const bad = f.typed('yes', 'clean', 'everything');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unrecognized arguments: everything \(usage: clean \[all-branches\]\)/);
});

test('import brings the open items of another branch here, oldest first, and --higher puts them first', () => {
  const prepare = f => { f.run('move', '2', '--to-branch', 'feature'); f.run('move', '3', '--to-branch', 'feature'); };
  const plain = run(['import', '--branch', 'feature'], prepare);
  assert.equal(plain.a.status, 0, plain.a.stderr);
  assert.match(plain.a.stdout, /imported 2 open item\(s\) of feature into main: 002-two, 003-three/);
  assert.deepEqual(plain.one.queue(), [1, 2, 3]);
  const higher = run(['import', '--branch', 'feature', '--higher'], prepare);
  assert.deepEqual(higher.one.queue(), [2, 3, 1]);
  assert.equal(higher.one.any('import', '--branch=feature').status, 0);
});

test('import refuses a missing source, an unknown argument, --json and the current branch (exit 2), and says so for a source without open items', () => {
  const f = build();
  for (const [args, text] of [[['import'], /import needs --branch <source> \(usage: import --branch <source> \[--higher\]\)/], [['import', '--branch'], /import needs --branch/], [['import', '--branch', 'feature', '--all'], /import: unrecognized argument --all/], [['import', '--branch', 'feature', '--json'], /import prints text only: --json is not available/], [['import', '--branch', 'main'], /that is the current branch/]]) {
    const r = f.any(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, text, args.join(' '));
  }
  const empty = f.any('import', '--branch', 'feature');
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /nothing to import: branch feature has no open items|no item of branch feature in this backlog \(check the name\)/);
  assert.match(f.any('import', '--branch', 'nosuchbranch').stdout, /check the name/);
  assert.deepEqual(f.queue(), [1, 2, 3]);
});

test('archive done archives every finished item, oldest first, and leaves the open ones', () => {
  const prepare = f => { f.run('done', '1'); f.run('done', '2'); };
  const { one, a } = run(['archive', 'done'], prepare);
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /archived 2 finished item\(s\): 001-one, 002-two/);
  assert.deepEqual(one.queue(), [3]);
  assert.match(one.any('archive', 'done').stdout, /nothing to archive/);
  assert.equal(one.any('archive', 'done', 'extra').status, 2);
  assert.match(one.any('archive', 'done', 'extra').stderr, /archive done takes no other argument \(got extra\)/);
  assert.match(one.any('archive', 'done', '--json').stderr, /archive done prints text only: --json is not available/);
  assert.equal(one.any('archive', '3').status, 1); // archive <item> is untouched: an open item is refused
});

test('done, clean, import and archive done have their own help; backlog archive --help is still the help of archive', () => {
  const f = build();
  for (const command of ['done', 'clean', 'import', 'archive done']) {
    const r = f.any(...command.split(' '), '--help');
    assert.equal(r.status, 0, command);
    assert.equal(r.stdout, `${HELP[command].trimEnd()}\n`, command);
    assert.ok(r.stdout.startsWith(`backlog ${command} — `), `${command}: the help is no alias line`);
    assert.match(r.stdout, new RegExp(`^Usage:\\n {2}backlog ${command}( |$)`, 'm'), command);
    assert.match(r.stdout, /^Exit codes:/m, command);
  }
  assert.equal(f.any('archive', '--help').stdout, `${HELP.archive.trimEnd()}\n`);
  assert.notEqual(HELP['archive done'], HELP.archive);
});
