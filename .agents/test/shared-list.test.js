// Tests for `backlog list`: the full stack by default, list new|open|done|archive|branches|critical|all-branches, on the reader that
// `backlog team query` also runs. Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { HELP } from '../../src/help.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// acme/demo: Alpha (pending), Beta (critical), Gamma (in progress), Delta (done), Eps (archived) on main, and Feat on the branch feature.
function build() {
  const t = mkdtempSync(`${tmpdir()}/list-test-`);
  dirs.push(t);
  sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const run = (...args) => { const r = cli(args, { cwd: cons, tmp: t }); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
  const add = (name, ...more) => run('new', '--name', name, '--objective', `o ${name}`, '--summary', `s ${name}`, '--depends-on', 'none', ...more);
  add('Alpha'); add('Beta', '--severity', 'critical'); add('Gamma'); add('Delta'); add('Eps');
  run('update', '3', '--status', 'in progress');
  run('update', '4', '--status', 'closed');
  run('update', '5', '--status', 'closed');
  run('archive', '5');
  git(cons, 'checkout', '-q', '-b', 'feature');
  add('Feat');
  git(cons, 'checkout', '-q', 'main');
  return { t, cons, run: (...a) => cli(a, { cwd: cons, tmp: t }) };
}
// the JSON holds the time of the read in its handoff block (to the second), so two runs differ only there
const norm = text => text.replace(/"handoff": \{[^}]*\}/, '"handoff": {}');
const slugs = r => JSON.parse(r.stdout).phases.map(x => x.slug);

test('list prints the full stack: the open items in queue order, then the finished ones; a leading --json is the switch of the command', () => {
  const f = build();
  assert.deepEqual(slugs(f.run('list', '--json')), ['002-beta', '001-alpha', '003-gamma', '004-delta', '005-eps']);
  assert.equal(norm(f.run('--json', 'list').stdout), norm(f.run('list', '--json').stdout));
  const text = f.run('list').stdout;
  assert.match(text, /^📋 acme\/demo — branch main$/m);
  assert.ok(text.indexOf('002-beta') < text.indexOf('001-alpha') && text.indexOf('003-gamma') < text.indexOf('004-delta'));
  assert.doesNotMatch(text, /\[ {2}6\]/, 'the item of another branch is no row of the stack of main');
});

test('list new, open, done and archive are the filtered stack, in text and in JSON', () => {
  const f = build();
  assert.deepEqual(slugs(f.run('list', 'done', '--json')), ['004-delta']);
  assert.deepEqual(slugs(f.run('list', 'archive', '--json')), ['005-eps']);
  assert.deepEqual(slugs(f.run('list', 'new', '--json')), ['002-beta', '001-alpha']);
  assert.deepEqual(slugs(f.run('list', 'open', '--json')), ['002-beta', '001-alpha', '003-gamma']);
  for (const word of ['new', 'open', 'done', 'archive']) {
    assert.equal(norm(f.run('--json', 'list', word).stdout), norm(f.run('list', word, '--json').stdout), word); // a leading --json belongs to the command
    const text = f.run('list', word).stdout;
    for (const slug of slugs(f.run('list', word, '--json'))) assert.ok(text.includes(slug), `${word}: ${slug}`);
  }
  assert.doesNotMatch(f.run('list', 'done').stdout, /001-alpha/);
});

test('list branches and list critical are the branch counts and the critical items', () => {
  const f = build();
  assert.match(f.run('list', 'branches').stdout, /^main {2}open 3 {2}done 1$/m);
  assert.match(f.run('list', 'branches').stdout, /^feature {2}open 1 {2}done 0$/m);
  assert.deepEqual(JSON.parse(f.run('list', 'branches', '--json').stdout).map(x => x.branch).sort(), ['feature', 'main']);
  assert.deepEqual(JSON.parse(f.run('list', 'critical', '--json').stdout).map(x => x.slug), ['002-beta']);
  assert.match(f.run('list', 'critical').stdout, /1 CRITICAL ITEM\(S\)/);
});

test('list all-branches shows every branch, and every row names its branch', () => {
  const f = build();
  const all = JSON.parse(f.run('list', 'all-branches', '--json').stdout).phases;
  assert.deepEqual([...new Set(all.map(x => x.branch))].sort(), ['feature', 'main']);
  const rowsOf = r => r.stdout.split('\n').filter(l => /^ {3}\S+ \[/.test(l));
  const rows = rowsOf(f.run('list', 'all-branches'));
  assert.equal(rows.length, all.length);
  for (const l of rows) assert.match(l, /\(branch (main|feature)\)/, l);
  // the plain list stays on the branch checked out
  assert.doesNotMatch(f.run('list').stdout, /\[ {2}6\]/); // the item of the branch feature is no row of the queue of main
});

test('list has its own help that names every word', () => {
  const f = build();
  const r = f.run('list', '--help');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `${HELP.list.trimEnd()}\n`);
  for (const word of ['new', 'open', 'done', 'archive', 'branches', 'critical', 'all-branches']) assert.match(HELP.list, new RegExp(`^ {2}backlog list ${word}( |$)`, 'm'), word);
  assert.match(HELP.list, /^Example:\n {2}backlog list /m);
  assert.equal(f.run('list', 'open', '--help').stdout, r.stdout);
});

test('a word list or next does not know is refused, and so is every option of the reader', () => {
  const f = build();
  const bad = f.run('list', 'frobnicate');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unrecognized arguments: frobnicate/);
  assert.equal(f.run('list', 'open', 'done').status, 2);
  for (const args of [['list', 'branch'], ['list', '--branch', 'feature'], ['list', 'open', '--branch', 'feature'], ['list', '--all'], ['list', '--phase', '1'], ['next', '--all'], ['next', '--branch', 'main'], ['next', '--agent', 'ann'], ['next', 'everything']]) {
    const r = f.run(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '', args.join(' '));
    assert.match(r.stderr, /unrecognized arguments: /, args.join(' '));
  }
});

test('list and team query run the one reader', () => {
  const read = file => readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8');
  assert.match(read('team/query.js'), /import \{ run as runQuery \} from '\.\.\/shared\/query\.js'/);
  assert.match(read('shared/read.js'), /from '\.\/query\.js'/);
});
