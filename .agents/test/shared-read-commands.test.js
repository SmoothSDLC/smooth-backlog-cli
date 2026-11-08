// Tests for `backlog show`, `backlog history`, `backlog changes`, `backlog next all-branches` and the bare `backlog` (the help).
// Each runs the one reader (src/shared/query.js) that backlog team query also runs, with its word spelled as the reader's option. Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { HELP, USAGE } from '../../src/help.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// acme/demo on main: Alpha and Beta (one change each in the history); with `onlyFeature` main holds no item and the branch feature holds Feat.
function build(onlyFeature = false) {
  const t = mkdtempSync(`${tmpdir()}/read-test-`);
  dirs.push(t);
  sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const run = (...args) => { const r = cli(args, { cwd: cons, tmp: t }); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
  const add = (name) => run('new', '--name', name, '--objective', `o ${name}`, '--summary', `s ${name}`, '--depends-on', 'none');
  if (onlyFeature) { git(cons, 'checkout', '-q', '-b', 'feature'); add('Feat'); git(cons, 'checkout', '-q', 'main'); } else { add('Alpha'); add('Beta'); run('update', '2', '--append', 'a line'); }
  return { t, cons, run: (...a) => cli(a, { cwd: cons, tmp: t }) };
}
test('show prints one item whole, several as an array, and a refusal for an item that is not there', () => {
  const f = build();
  const one = f.run('show', '1');
  assert.equal(JSON.parse(one.stdout).slug, '001-alpha');
  assert.deepEqual(Object.keys(JSON.parse(one.stdout)).filter(k => ['front_matter', 'body'].includes(k)), ['front_matter', 'body']);
  assert.deepEqual(JSON.parse(f.run('show', '1,002-beta').stdout).map(x => x.slug), ['001-alpha', '002-beta']);
  assert.equal(f.run('show', '1', '--json').stdout, one.stdout);
  const missing = f.run('show', '99');
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /^❌ no phase '99'/);
});

test('show without an item, with a second item or with an option it does not know is refused (exit 2) and reads nothing', () => {
  const f = build();
  for (const [args, text] of [[['show'], /show needs an item \(usage: backlog show <item>/], [['show', '1', '2'], /unrecognized arguments: 2/], [['show', '1', '--events'], /unrecognized arguments: --events/], [['show', '1', '--agent'], /argument --agent: expected one argument/]]) {
    const r = f.run(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '', args.join(' '));
    assert.match(r.stderr, text, args.join(' '));
  }
});

test('an agent that showed an item has read it: its next write is refused when somebody else changed the item since', () => {
  const f = build();
  assert.equal(f.run('show', '1', '--agent', 'amy').status, 0);
  assert.equal(f.run('update', '1', '--append', 'from bob', '--by', 'bob').status, 0);
  const late = f.run('update', '1', '--append', 'from amy', '--by', 'amy');
  assert.equal(late.status, 5, late.stdout + late.stderr);
});

test('history prints the events of the backlog or of one item, newest first', () => {
  const f = build();
  const all = f.run('history');
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /planning_event/);
  const one = f.run('history', '2');
  assert.equal(one.status, 0, one.stderr);
  assert.ok(one.stdout.trim().split('\n').length >= 1 && one.stdout.trim().split('\n').length < all.stdout.trim().split('\n').length);
  assert.equal(f.run('history', '99').status, 1);
});

test('history prints text only: --json and a second item are refused (exit 2)', () => {
  const f = build();
  const json = f.run('history', '--json');
  assert.equal(json.status, 2);
  assert.match(json.stderr, /history prints text only: --json is not available/);
  const two = f.run('history', '1', '2');
  assert.equal(two.status, 2);
  assert.match(two.stderr, /unrecognized arguments: 2/);
});

test('changes: the first use sets the reference, the next report lists what another agent changed', () => {
  const f = build();
  const first = f.run('changes', '--agent', 'amy');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /^no earlier use: reference set now$/m);
  assert.equal(f.run('update', '1', '--append', 'from bob', '--by', 'bob').status, 0);
  const next = JSON.parse(f.run('changes', '--agent', 'amy', '--json').stdout);
  assert.deepEqual(Object.keys(next).sort(), ['agent', 'agents', 'held', 'others', 'reference']);
  assert.deepEqual(next.others.map(x => x.slug), ['001-alpha']);
  const bad = f.run('changes', 'extra');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unrecognized arguments: extra/);
});

test('next all-branches finds the item of a branch other than the one checked out', () => {
  const f = build(true);
  assert.match(f.run('next').stdout, /no actionable item for acme\/demo, branch main/);
  const all = f.run('next', 'all-branches');
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /NEXT: .*001-feat/);
  assert.equal(JSON.parse(f.run('next', 'all-branches', '--json').stdout).slug, '001-feat');
  assert.equal(f.run('next', '--all').status, 2); // the option is gone: all-branches is the word
  assert.equal(f.run('next', 'everything').status, 2); // a word next does not know is refused
});

test('show, history, changes and next all-branches have their own help, with usage, options, exit codes and one example', () => {
  const f = build();
  for (const command of ['show', 'history', 'changes', 'next all-branches']) {
    const r = f.run(...command.split(' '), '--help');
    assert.equal(r.status, 0, command);
    assert.equal(r.stdout, `${HELP[command].trimEnd()}\n`, command);
    assert.match(r.stdout, new RegExp(`^backlog ${command} `, 'm'), command);
    assert.match(r.stdout, new RegExp(`^Usage:\\n {2}backlog ${command}( |$)`, 'm'), command);
    assert.match(r.stdout, /^Options:\n {2}--/m, command);
    assert.match(r.stdout, new RegExp(`^Example:\\n {2}backlog ${command}( |$)`, 'm'), command);
    assert.match(r.stdout, /^Exit codes:/m, command);
    assert.match(USAGE, new RegExp(`^ {2}backlog ${command}( |$)`, 'm'), `${command} is in backlog --help`);
  }
  assert.notEqual(HELP['next all-branches'], HELP.next);
  assert.match(HELP.next, /backlog next all-branches/);
});

test('backlog alone prints the top-level help (exit 0) and writes nothing; backlog --json still prints the next item', () => {
  const f = build();
  const bare = f.run();
  assert.equal(bare.status, 0, bare.stderr);
  assert.equal(bare.stdout, USAGE);
  assert.equal(JSON.parse(f.run('--json').stdout).slug, '001-alpha');
});
