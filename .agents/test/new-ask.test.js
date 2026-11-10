// backlog new --ask and backlog team new --ask (decision AP): on a terminal the command asks, on standard error, for each field the call did not
// give; without a terminal it refuses (exit 2) and creates nothing; every other command still rejects --ask except setup.
// The terminal is a reader the test injects (the io seam of src/shared/new.js, driven by new-ask-child.js); the refusal runs the real command with piped input.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bin } from './helpers.js';
import { cli, consumer, env, sharedBacklog, itemNames, readItem, itemPath, slugOfName } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const child = join(dirname(fileURLToPath(import.meta.url)), 'new-ask-child.js');

function build() {
  const t = mkdtempSync(join(tmpdir(), 'new-ask-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const items = () => itemNames(join(home, 'acme', 'demo'));
  const item = () => readItem(itemPath(join(home, 'acme', 'demo'), slugOfName(items()[0])));
  // kind: 'new' or 'team'; answers: what the person types, in order
  const asking = (kind, args, answers) => {
    const r = spawnSync(process.execPath, [child, kind, ...args], { cwd: cons, env: { ...process.env, ...env(t), SMOOTH_BACKLOG_CLI_AGENT: 'driver-ask', ASK_ANSWERS: JSON.stringify(answers) }, encoding: 'utf8', input: '' });
    const asked = r.stderr.split('\n').filter(l => l.startsWith('ASKED ')).map(l => JSON.parse(l.slice(6)));
    return { status: r.status, stdout: r.stdout, stderr: r.stderr.split('\n').filter(l => !l.startsWith('ASKED ')).join('\n'), asked };
  };
  return { t, cons, items, item, asking, plain: (args, opts = {}) => cli(args, { cwd: cons, tmp: t, plain: true, ...opts }) };
}
const REST = ['--depends-on', 'none'];

test('new --ask asks for the title, objective, summary and body, and creates the item they describe; the result is on standard output as without --ask', () => {
  const f = build();
  const r = f.asking('new', ['--ask', ...REST], ['Fix login', 'Cookie handling works', 'Login cookies', 'first line', 'second line', '']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^✅ created phase 001-fix-login \(seq 1\)/);
  assert.deepEqual(r.asked.slice(0, 3), ['Title: ', 'Objective (one line): ', 'Summary: ']);
  assert.deepEqual(r.asked.slice(3), ['Body (finish with an empty line): ', '... ', '... ']);
  const { fm, body } = f.item();
  assert.deepEqual([fm.name, fm.objective, fm.summary], ['Fix login', 'Cookie handling works', 'Login cookies']);
  assert.ok(body.includes('first line\nsecond line'), body);
  assert.equal(fm.team, undefined);
});
test('new --ask does not ask for a field the call gave, and an empty answer leaves a field out', () => {
  const f = build();
  const r = f.asking('new', ['--ask', '--name', '-x title', '--summary', 'given', ...REST], ['', '']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.asked, ['Objective (one line): ', 'Body (finish with an empty line): ']);
  const { fm } = f.item();
  assert.deepEqual([fm.name, fm.objective, fm.summary], ['-x title', '-x title', 'given']); // the objective defaults to the name, as without --ask
});
test('new --ask with an answer that starts with a dash keeps it as the value', () => {
  const f = build();
  assert.equal(f.asking('new', ['--ask', ...REST], ['-5 degrees', '', '', '']).status, 0);
  assert.equal(f.item().fm.name, '-5 degrees');
});
test('team new --ask also asks for the review documents and files the item under the team', () => {
  const f = build();
  const r = f.asking('team', ['--ask', ...REST], ['Parser work', 'The parser reads the sample', 'Parser', '', 'docs/review/code.md']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.asked.map(p => p.split(/ \(|: /)[0]), ['Title', 'Objective', 'Summary', 'Body', 'Review documents']);
  const { fm } = f.item();
  assert.deepEqual([fm.name, fm.team, fm.review_refs], ['Parser work', 't1', ['docs/review/code.md']]);
});
test('new --ask on a real terminal (util-linux script) asks and reads lines typed ahead', t => {
  if (process.platform !== 'linux') return t.skip('needs the script command of util-linux');
  const f = build();
  mkdirSync(join(f.t, 'config', 'smooth-backlog-cli'), { recursive: true }); // a terminal run would check for a new release: the weekly check is off here
  writeFileSync(join(f.t, 'config', 'smooth-backlog-cli', 'config.json'), JSON.stringify({ schema_version: 1, weekly: false, auto: false }));
  const r = spawnSync('script', ['-qec', `'${process.execPath}' '${bin}' new --ask --depends-on none`, '/dev/null'], { cwd: f.cons, env: { ...process.env, ...env(f.t), SMOOTH_BACKLOG_CLI_AGENT: 'driver-ask' }, encoding: 'utf8', input: 'Pty title\nobj\nsum\nbody line\nsecond\n\n' });
  if (!r.stdout?.includes('Title: ')) return t.skip('no pseudo-terminal here');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✅ created phase 001-pty-title \(seq 1\)/);
  const { fm, body } = f.item();
  assert.deepEqual([fm.name, fm.objective, fm.summary], ['Pty title', 'obj', 'sum']);
  assert.ok(body.includes('body line\nsecond'), body);
});

test('--ask answered by the end of the input creates nothing and exits 2', () => {
  const f = build();
  const r = f.asking('new', ['--ask', ...REST], ['Half a title']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^❌ backlog: no answer; nothing was created/);
  assert.deepEqual(f.items(), []);
});

test('without a terminal --ask is refused with one line (exit 2) and nothing is created, for new and for team new', () => {
  const f = build();
  for (const args of [['new', '--name', 'Asked', '--ask', ...REST], ['team', 'new', '--team', 't1', '--agent', 'lead', '--ask', ...REST]]) {
    const r = f.plain(args);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^❌ backlog: --ask needs a terminal \(standard input and standard error\); give the fields as options instead \(backlog new --help\)\n$/);
  }
  assert.deepEqual(f.items(), []);
});
test('new without --ask is not affected: the same call creates the item and asks nothing', () => {
  const f = build();
  const r = f.plain(['new', '--name', 'Plain', '--objective', 'o', '--summary', 's', ...REST]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
});
test('every other command still rejects --ask', () => {
  const f = build();
  assert.equal(f.plain(['new', '--name', 'One', '--objective', 'o', '--summary', 's', ...REST]).status, 0);
  for (const args of [['update', '1', '--ask'], ['list', '--ask'], ['next', '--ask'], ['done', '1', '--ask'], ['show', '1', '--ask']]) {
    const r = f.plain(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /unrecognized arguments?: .*--ask|--ask/, args.join(' '));
  }
});
