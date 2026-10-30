// Tests for the shared-mode help text (cli-parity job 18, HELP): src/help.js, the help constant of src/output.js, COMMANDS.md.
// Oracle: `python3 <script> --help` of new_phase.py, update.py, query.py, move.py and archive.py (run on a temporary fixture,
// never on the real backlog); every flag it prints must appear in `backlog <command> --help`. Without python3, PyYAML or
// SMOOTH_BACKLOG_SCRIPTS the oracle comparison is skipped with that reason. Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, ORACLE_SKIP, py, sharedBacklog } from './shared-fixtures.js';
import { HELP } from '../../src/help.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// A shared-mode setup: the home clone, a consumer repository and mode.json = shared, all inside one temp dir.
const t = mkdtempSync(join(tmpdir(), 'help-test-'));
dirs.push(t);
sharedBacklog(t);
const cons = consumer(t, 'acme', 'demo', 'main');
mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
const backlog = (...args) => cli(args, { cwd: cons, tmp: t });

const SCRIPT = { new: 'new_phase.py', update: 'update.py', query: 'query.py', move: 'move.py', archive: 'archive.py' };
const COMMANDS = ['new', 'update', 'query', 'next', 'pop', 'work', 'move', 'archive'];
// Flags this build refuses (query.js TEAM, pop.js and --headless); --db is internal to the Python scripts (contract section 2).
const REFUSED = {
  update: ['db'],
  query: ['headless', 'db'],
  new: ['db'], move: [], archive: ['db'], pop: [],
};
const flagsOf = text => [...new Set((text.match(/--[a-z][\w-]*/g) ?? []).filter(f => !f.endsWith('-')))];
// The block of one flag: its header line `  --flag ...` and the lines indented by six spaces below it.
const block = (text, flag) => new RegExp(`^  --${flag}(?: .*)?\\n((?:      .*\\n)*)`, 'm').exec(text)?.[0];

for (const [command, script] of Object.entries(SCRIPT)) {
  test(`backlog ${command} --help lists every flag of ${script} --help`, ctx => {
    const o = py(script, ['--help'], { cwd: cons, tmp: t, env: { COLUMNS: '1000' } });
    if (!o) return ctx.skip(`${ORACLE_SKIP}: flags not compared`);
    assert.equal(o.status, 0, o.stderr);
    const r = backlog(command, '--help');
    assert.equal(r.status, 0, r.stderr);
    const flags = flagsOf(o.stdout);
    assert.ok(flags.length > 3, `no flags found in the ${script} help`);
    for (const flag of flags) assert.ok(block(r.stdout, flag.slice(2)), `${command}: ${flag} has no block in the help`);
  });
}

// The flag descriptions of an argparse --help: { '--flag': description text } (wrapped lines joined).
function oracleDescriptions(text) {
  const out = {}; let flag = null;
  for (const line of text.split('\n')) {
    const m = /^ {2}(--[\w-]+)(?: \S+)?(?: {2,}(\S.*))?$/.exec(line);
    if (m) { flag = m[1]; out[flag] = m[2] ?? ''; } else if (flag && /^ {20,}\S/.test(line)) out[flag] += ` ${line.trim()}`;
    else if (!/^ {2}-/.test(line)) flag = null;
  }
  return out;
}
// What a description must keep, in any wording: numbers, quoted words, identifiers (snake_case, ENV_NAMES, paths), --flags.
const IGNORED = /\.py$|^SKILL\.md$|^--db$|^slugs\/ids$|^e\.g$|^folder>/;
const tokensOf = d => [...new Set([...d.replace(/See SKILL\.md '[^']*'\./, '').matchAll(/'([^']+)'|(--[a-z][\w-]*)|(\b[A-Za-z][\w.<>/-]*[_/.][\w.<>/-]*\b)|(\b\d+\b)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? m[4]).filter(x => !IGNORED.test(x) && !/^'?SKILL/.test(x)))];

for (const [command, script] of Object.entries(SCRIPT)) {
  test(`backlog ${command} --help keeps the description of every flag of ${script} --help (numbers, defaults, rules, shapes)`, ctx => {
    const o = py(script, ['--help'], { cwd: cons, tmp: t, env: { COLUMNS: '1000' } });
    if (!o) return ctx.skip(`${ORACLE_SKIP}: descriptions not compared`);
    const text = backlog(command, '--help').stdout;
    const missing = [];
    for (const [flag, d] of Object.entries(oracleDescriptions(o.stdout))) {
      const mine = block(text, flag.slice(2));
      for (const token of tokensOf(d)) if (!(mine?.includes(token) || mine?.includes(token.replaceAll('_', ' ')) || mine?.includes(token.replaceAll('/', ' and ')))) missing.push(`${flag}: ${token}`);
    }
    assert.deepEqual(missing, [], `${command}: tokens of the oracle descriptions missing from the help`);
  });
}

test('backlog update --claim keeps its refusal conditions, query --roster the shape, default and reviewer rule (update.py:117-118, query.py:428-429)', () => {
  const claim = block(backlog('update', '--help').stdout, 'claim');
  assert.match(claim, /refuses when another agent holds the item/);
  assert.match(claim, /depends_on\s+is not done/);
  assert.match(claim, /in progress/);
  for (const command of ['query', 'pop']) {
    const roster = block(backlog(command, '--help').stdout, 'roster');
    assert.match(roster, /\{agent: \{\.\.\.\}\}, the team's members in order/, command);
    assert.match(roster, /TEAM_ROSTER/, command);
    assert.match(roster, /Any member but the author may review/, command);
    assert.doesNotMatch(roster, /class|HOLDER/, command); // no class profiles, no holder window
  }
});

for (const [command, flags] of Object.entries(REFUSED)) {
  test(`backlog ${command} --help marks exactly the refused flags "Not in this build"`, () => {
    const text = backlog(command, '--help').stdout;
    for (const flag of flagsOf(text).filter(f => block(text, f.slice(2)))) {
      const marked = /Not in this build/.test(block(text, flag.slice(2)));
      assert.equal(marked, flags.includes(flag.slice(2)), `${command} ${flag}: marked=${marked}`);
    }
    for (const flag of flags) assert.ok(block(text, flag), `${command}: refused flag --${flag} is not listed`);
  });
}

test('every refused flag is refused with its own diagnostic and exit 2, on an invocation that is otherwise valid', () => {
  const made = backlog('new', '--name', 'Help fixture', '--depends-on', 'none');
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const roster = join(t, 'roster.json');
  writeFileSync(roster, '{"x": {}}');
  const unknown = /unrecognized arguments: --db/;
  const cases = [
    [['new', '--name', 'n', '--depends-on', 'none', '--db', 'x.db'], unknown],
    [['update', '1', '--note', 'n', '--db', 'x.db'], unknown],
    [['archive', '1', '--force', '--dry-run', '--db', 'x.db'], unknown],
    [['query', '--status', '--db', 'x.db'], unknown],
    [['query', '--agents', 'x', '--roster', roster], /^--agents goes with --plan/],
    [['query', '--headless'], /^--headless is not in this build$/],
    [['pop', '--agent', 'x', '--agents', 'x'], /^--agents goes with --plan/],
    [['pop', '--agent', 'x', '--headless'], /^--headless is not in this build$/],
    [['pop', '--agent', 'x', '--db', 'x.db'], unknown],
  ];
  for (const [args, diagnostic] of cases) {
    const r = backlog(...args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, '', args.join(' '));
    assert.match(r.stderr.replace(/^❌ backlog: /, '').trimEnd(), diagnostic, args.join(' '));
  }
  // the same invocations without the refused flag are accepted, and the refusals changed nothing
  for (const args of [['archive', '1', '--force', '--dry-run'], ['query', '--status'], ['update', '1', '--note', 'n', '--dry-run']]) {
    const r = backlog(...args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
  assert.match(backlog('query', '--phase', '1', '--json').stdout, /"status": "pending"/);
});

test('every command of the router has a help text, the shared section of backlog --help and a block in COMMANDS.md', async () => {
  const { TABLE } = await import('../../src/shared/router.js');
  assert.deepEqual(Object.keys(TABLE).sort(), [...COMMANDS].sort());
  assert.deepEqual(Object.keys(HELP).sort(), [...COMMANDS, 'setup'].sort()); // setup (item 043) runs before the router, in either mode
  const top = cli(['--help'], { cwd: cons, tmp: t }).stdout;
  for (const command of Object.keys(TABLE)) {
    assert.match(top, new RegExp(`^ {2}backlog ${command}( |$)`, 'm'), `${command}: backlog --help`);
    assert.equal(backlog(command, '--help').stdout, HELP[command], `${command}: --help`);
  }
});

test('exit code 3 is described for both cases: the update before the command failed, and the change was not pushed', () => {
  for (const command of ['new', 'update', 'query', 'next', 'archive']) {
    const text = backlog(command, '--help').stdout;
    assert.match(text, /^ {2}3 {2}The local clone of the backlog repository could not be synchronised with its origin\./m, command);
    assert.match(text, /update before the\s+command failed: then nothing was read or changed/, command);
    assert.match(text, /change was not published.*rolled back/, command);
  }
  assert.match(backlog('move', '--help').stdout, /3 the update of the local clone failed before\nthe move \(nothing was changed\), or the move was not published and was rolled back/);
  assert.match(backlog('pop', '--help').stdout, /^ {2}3 {2}The action is idle: nothing is left for the agent\. The same code is used when the local clone/m);
  assert.match(backlog('pop', '--help').stdout, /--claim-now claim was not published and was rolled back/);
  for (const command of ['query', 'next']) assert.match(backlog(command, '--help').stdout, /a --claim-now claim could not be pushed/, command);
  // the build does what the text says: an origin that cannot be reached fails the update, exit 3, and nothing is read
  const broken = mkdtempSync(join(tmpdir(), 'help-exit3-'));
  dirs.push(broken);
  sharedBacklog(broken);
  const demo = consumer(broken, 'acme', 'demo', 'main');
  mkdirSync(join(broken, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(broken, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  renameSync(join(broken, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), join(broken, 'origin-gone.git'));
  for (const args of [['query', '--status'], ['pop', '--agent', 'x']]) {
    const r = cli(args, { cwd: demo, tmp: broken });
    assert.equal(r.status, 3, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /nothing was read or changed/);
  }
});

test('every command help has the sections Usage, Options and one Example that names the command', () => {
  for (const command of COMMANDS) {
    const text = backlog(command, '--help').stdout;
    assert.equal(text, HELP[command].endsWith('\n') ? HELP[command] : `${HELP[command]}\n`, `${command}: --help prints the HELP text`);
    assert.match(text, new RegExp(`^backlog ${command} `, 'm'), `${command}: first line`);
    assert.match(text, /^Usage:\n {2}backlog /m);
    assert.match(text, /^Options:\n {2}--/m);
    assert.match(text, new RegExp(`^Example:\\n {2}backlog ${command}( |$)`, 'm'));
    assert.match(text, /^ {2}--help\n/m, `${command}: --help is listed`);
  }
});

test('backlog next --help lists the flags that apply to next', () => {
  const text = backlog('next', '--help').stdout;
  for (const flag of ['all', 'branch', 'json']) assert.ok(block(text, flag), `--${flag}`);
});

test('the help is written in plain sentences: no internal job numbers, script names or file references', () => {
  for (const command of COMMANDS) assert.doesNotMatch(HELP[command], /\bjob \d+|\.py\b|SKILL\.md|lib_db|update\.js|query\.js/i, command);
});

test('backlog --help names both mode options and every shared command', () => {
  const r = cli(['--help'], { cwd: cons, tmp: t });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--use-backlog-repo <path>/);
  assert.match(r.stdout, /--use-local-repo/);
  for (const command of COMMANDS) assert.match(r.stdout, new RegExp(`^ {2}backlog ${command}( |$)`, 'm'), `${command} is missing from the shared section`);
  assert.match(r.stdout, /backlog <command> --help/, 'how to get the help of one command');
});

test('backlog --help is the same in local mode and keeps the local commands', () => {
  const r = cli(['--help'], { cwd: cons, tmp: t, env: { XDG_CONFIG_HOME: join(t, 'other-config') } });
  assert.match(r.stdout, /backlog init \[repo-name\]/);
  assert.match(r.stdout, /--use-backlog-repo/);
});

test('COMMANDS.md has the section "Shared backlog repository mode" with the help text of every command', () => {
  const doc = readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8');
  const at = doc.indexOf('\n## Shared backlog repository mode\n');
  assert.ok(at >= 0, 'section heading missing');
  const next = doc.indexOf('\n## ', at + 5);
  const section = doc.slice(at, next < 0 ? undefined : next);
  assert.match(section, /--use-backlog-repo <path>/);
  assert.match(section, /--use-local-repo/);
  for (const command of COMMANDS) assert.ok(section.includes(`\`\`\`text\n${HELP[command].trimEnd()}\n\`\`\``), `${command}: the help text is not in COMMANDS.md verbatim`);
});
