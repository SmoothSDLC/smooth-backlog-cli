// Tests for the help text: src/help.js, backlog --help, COMMANDS.md.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { HELP, USAGE } from '../../src/help.js';
import { ALIASES } from '../../src/shared/aliases.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// The home clone and a consumer repository, inside one temp dir.
const t = mkdtempSync(join(tmpdir(), 'help-test-'));
dirs.push(t);
sharedBacklog(t);
const cons = consumer(t, 'acme', 'demo', 'main');
const backlog = (...args) => cli(args, { cwd: cons, tmp: t });

const COMMANDS = ['new', 'update', 'query', 'next', 'fields', 'team', 'move', 'archive'];
// Flags this build refuses (query.js TEAM and pop.js); --db is no flag of the CLI (item 058: not in its help).
const REFUSED = {
  update: [],
  query: [],
  new: [], move: [], archive: [],
};
const flagsOf = text => [...new Set((text.match(/--[a-z][\w-]*/g) ?? []).filter(f => !f.endsWith('-')))];
// The block of one flag: its header line `  --flag ...` and the lines indented by six spaces below it.
const block = (text, flag) => new RegExp(`^  --${flag}(?: .*)?\\n((?:      .*\\n)*)`, 'm').exec(text)?.[0];

test('backlog update --claim keeps its refusal conditions, query --roster the shape, default and reviewer rule', () => {
  const claim = block(backlog('update', '--help').stdout, 'claim');
  assert.match(claim, /refuses when another agent holds the item/);
  assert.match(claim, /depends_on\s+is not done/);
  assert.match(claim, /in progress/);
  for (const command of ['team']) {
    const roster = block(backlog(command, '--help').stdout, 'roster');
    assert.match(roster, /\{agent: \{\.\.\.\}\}, the team's members in order/, command);
    assert.match(roster, /TEAM_ROSTER/, command);
    assert.match(roster, /Any session may review an item except the sessions recorded on it/, command);
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
    [['team', 'pop', '--team', 't1', '--agent', 'x', '--agents', 'x'], /^unrecognized arguments: --agents/],
    [['team', 'pop', '--team', 't1', '--agent', 'x', '--db', 'x.db'], unknown],
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

test('every command of the router has a help text, a line of backlog --help and a block in COMMANDS.md', async () => {
  const { TABLE } = await import('../../src/shared/router.js');
  assert.deepEqual(Object.keys(TABLE).sort(), [...COMMANDS, 'list'].sort());
  assert.deepEqual(Object.keys(HELP).sort(), [...COMMANDS, 'setup'].sort()); // setup runs before the router; list prints the query help
  const top = cli(['--help'], { cwd: cons, tmp: t }).stdout;
  for (const command of Object.keys(TABLE)) {
    assert.match(top, new RegExp(`^ {2}backlog ${command}( |$)`, 'm'), `${command}: backlog --help`);
    assert.equal(backlog(command, '--help').stdout, HELP[command === 'list' ? 'query' : command], `${command}: --help`);
  }
});

test('exit code 3 is described for both cases: the update before the command failed, and the change was not pushed', () => {
  for (const command of ['new', 'update', 'query', 'next', 'archive']) {
    const text = backlog(command, '--help').stdout;
    assert.match(text, /^ {2}3 {2}The repository that holds the items could not be synchronised with its origin\./m, command);
    assert.match(text, /update before a\s+change failed: then nothing was changed/, command);
    assert.match(text, /change was not published.*rolled back/, command);
  }
  assert.match(backlog('move', '--help').stdout, /3 the update of the local clone failed before\nthe move \(nothing was changed\), or the move was not published and was rolled back/);
  assert.match(backlog('team', '--help').stdout, /^ {2}3 {2}idle: nothing to do now \(pop\)\. The same code is used when the local clone/m);
  // the build does what the text says: a command that only reads answers from the local copy with the offline warning
  const broken = mkdtempSync(join(tmpdir(), 'help-exit3-'));
  dirs.push(broken);
  sharedBacklog(broken);
  const demo = consumer(broken, 'acme', 'demo', 'main');
  renameSync(join(broken, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`), join(broken, 'origin-gone.git'));
  for (const args of [['query', '--status'], ['team', 'pop', '--team', 't1', '--agent', 'x']]) {
    const r = cli(args, { cwd: demo, tmp: broken });
    assert.match(r.stderr, /origin offline, local backlog updates may be behind and need manual remediation later/, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
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

test('backlog --help names every command and the storage setting, and is the same wherever the items live', () => {
  const r = cli(['--help'], { cwd: cons, tmp: t });
  assert.equal(r.status, 0, r.stderr);
  for (const command of [...COMMANDS, 'list', 'setup']) assert.match(r.stdout, new RegExp(`^ {2}backlog ${command}( |$)`, 'm'), `${command} is missing`);
  assert.match(r.stdout, /backlog <command> --help/, 'how to get the help of one command');
  assert.match(r.stdout, /committed and pushed before the command exits/);
  assert.doesNotMatch(r.stdout.replace(/\nAliases \([\s\S]*?\n\nExit codes/, '\nExit codes'), /mode|--use-backlog-repo|--use-local-repo|backlog init/); // the alias lines name init on purpose
  const inside = cli(['--help'], { cwd: cons, tmp: t, env: { BACKLOG_HOME: '', BACKLOG_ORIGIN_URL: '', XDG_CONFIG_HOME: join(t, 'other-config') } });
  assert.equal(inside.stdout, r.stdout);
});

test('COMMANDS.md has the section "Commands" with the help text of every command, and names no mode', () => {
  const doc = readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8');
  assert.doesNotMatch(doc, /shared mode|local mode|--use-backlog-repo|--use-local-repo/);
  const at = doc.indexOf('\n## Commands\n');
  assert.ok(at >= 0, 'section heading missing');
  const section = doc.slice(at);
  for (const command of COMMANDS) assert.ok(section.includes(`\`\`\`text\n${HELP[command].trimEnd()}\n\`\`\``), `${command}: the help text is not in COMMANDS.md verbatim`);
});

test('096: the update help says the retired classification keys have no effect and are dropped at the next write', () => {
  for (const [name, text] of [['update help', backlog('update', '--help').stdout]]) {
    assert.match(text, /retired classification keys[^.]*have no effect/, name);
    assert.match(text, /next writes/, name);
  }
});

test('127: the team pop help states a refined work item is claimable by members and team pop offers it only while the stage is unset', () => {
  const flat = backlog('team', '--help').stdout.replace(/\s+/g, ' ');
  assert.match(flat, /A refined work item[^.]*is an ordinary item any member may claim/);
  assert.match(flat, /only while its stage is unset/);
  assert.match(flat, /too big for one member/);
});

test('059.V2: the --close and --status help blocks name the hand-off close rule, NONE and the legacy exemption', () => {
  const help = backlog('update', '--help').stdout;
  for (const [name, text] of [['--close', block(help, 'close')], ['--status', block(help, 'status')]]) {
    const flat = text.replace(/\s+/g, ' ');
    assert.match(flat, /each dependent's hand-off is recorded and accepted/, name);
    assert.match(flat, /records handoffs: none/, name);
    assert.match(flat, /already (done|closed) is not checked again/, name);
  }
});

test('query, next and team help: no headless option, no query --pop', () => {
  for (const command of ['query', 'next', 'team']) assert.doesNotMatch(HELP[command], /--pop\b|--headless|BACKLOG_HEADLESS|next --agent/, command);
});

test('every alias row is in backlog --help, in COMMANDS.md and in the skill reference', () => {
  const docs = [USAGE, readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8'), readFileSync(new URL('../../templates/skills/backlog/references/commands.md', import.meta.url), 'utf8'), readFileSync(new URL('../../README.md', import.meta.url), 'utf8')];
  for (const doc of docs) for (const row of ALIASES) { assert.ok(doc.includes(row.form), row.form); assert.ok(doc.includes(row.runs), row.runs); }
});

test('<alias> --help prints the alias line and then the help of the command it runs', () => {
  const done = backlog('done', '--help').stdout;
  assert.ok(done.startsWith('backlog done <item> runs backlog update <item> --status done\n'), done);
  assert.ok(done.includes(HELP.update));
  assert.ok(backlog('list', 'open', '--help').stdout.startsWith('backlog list open runs backlog query --only open\n'));
  assert.ok(backlog('3', 'set', '--help').stdout.includes(HELP.update));
  const init = backlog('init', '--help').stdout;
  assert.ok(init.startsWith('backlog init [name] runs backlog setup\n') && init.includes(HELP.setup));
  assert.ok(backlog('init', 'clean', '--help').stdout.startsWith('backlog init clean [name] runs '));
  assert.equal(backlog('list', '--help').stdout.trimEnd(), HELP.query.trimEnd()); // a bare list is the query command itself
});
