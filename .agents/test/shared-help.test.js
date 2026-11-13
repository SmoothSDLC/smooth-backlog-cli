// Tests for the help text: src/help.js, backlog --help, COMMANDS.md.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { HELP, USAGE } from '../../src/help.js';
import { teamHelp } from '../../src/team/help.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// The home clone and a consumer repository, inside one temp dir.
const t = mkdtempSync(join(tmpdir(), 'help-test-'));
dirs.push(t);
sharedBacklog(t);
const cons = consumer(t, 'acme', 'demo', 'main');
const backlog = (...args) => cli(args, { cwd: cons, tmp: t });

const TEAM = ['team', 'team pop', 'team new', 'team update', 'team query', 'team define', 'team workflow', 'team validate', 'team migrate']; // the help of the team code lives with it
const COMMANDS = ['new', 'update', 'list', 'show', 'history', 'changes', 'next', 'next all-branches', 'done', 'fields', ...TEAM, 'move', 'archive', 'archive done', 'import', 'clean'];
const ALL = { ...HELP, ...teamHelp };
const ROUTED = COMMANDS.filter(c => !c.startsWith('team ') && !c.includes(' ')); // the commands of the router (a word of a command has its own help, not its own row)
// Flags this build refuses (query.js TEAM and pop.js); --db is no flag of the CLI (item 058: not in its help).
const REFUSED = {
  update: [],
  new: [], move: [], archive: [],
};
const flagsOf = text => [...new Set((text.match(/--[a-z][\w-]*/g) ?? []).filter(f => !f.endsWith('-')))];
// The block of one flag: its header line `  --flag ...` and the lines indented by six spaces below it.
const block = (text, flag) => new RegExp(`^  --${flag}(?: .*)?\\n((?:      .*\\n)*)`, 'm').exec(text)?.[0];

test('backlog update --claim keeps its refusal conditions; team query help states check and plan as the rules\' answers, with no roster and no old --plan view', () => {
  const claim = block(backlog('update', '--help').stdout, 'claim');
  assert.match(claim, /refuses when another agent holds the item/);
  assert.match(claim, /depends_on\s+is not done/);
  assert.match(claim, /in progress/);
  const text = backlog('team', 'query', '--help').stdout;
  assert.match(text, /backlog team query check <item> <step> --team <name>/);
  assert.match(text, /backlog team query plan --team <name>/);
  assert.match(text, /what\s+backlog\s+team\s+pop\s+would\s+offer\s+each\s+person\s+of\s+the\s+team,\s+in\s+name\s+order/);
  assert.match(text, /The\s+item\s+offered\s+to\s+one\s+person\s+is\s+not\s+offered\s+to\s+the\s+next/);
  assert.doesNotMatch(text, /--plan|--agents|--roster|TEAM_ROSTER/);
});

for (const [command, flags] of Object.entries(REFUSED)) {
  test(`backlog ${command} --help marks exactly the refused flags "Not in this build"`, () => {
    const text = backlog(...command.split(' '), '--help').stdout;
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
  const unknown = /unrecognized arguments: --db/;
  const cases = [
    [['new', '--name', 'n', '--depends-on', 'none', '--db', 'x.db'], unknown],
    [['update', '1', '--note', 'n', '--db', 'x.db'], unknown],
    [['archive', '1', '--force', '--dry-run', '--db', 'x.db'], unknown],
    [['list', '--db', 'x.db'], unknown],
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
  for (const args of [['archive', '1', '--force', '--dry-run'], ['list'], ['update', '1', '--note', 'n', '--dry-run']]) {
    const r = backlog(...args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
  assert.match(backlog('show', '1', '--json').stdout, /"status": "pending"/);
});

test('every command of the router has a help text, a line of backlog --help and a block in COMMANDS.md', async () => {
  const { TABLE } = await import('../../src/shared/router.js');
  assert.deepEqual(Object.keys(TABLE).sort(), ROUTED.sort());
  assert.deepEqual(Object.keys(ALL).sort(), [...COMMANDS, 'setup', 'upgrade'].sort()); // setup and upgrade run before the router
  const top = cli(['--help'], { cwd: cons, tmp: t }).stdout;
  for (const command of Object.keys(TABLE)) {
    assert.match(top, new RegExp(`^ {2}backlog ${command}( |$)`, 'm'), `${command}: backlog --help`);
    assert.equal(backlog(...command.split(' '), '--help').stdout, ALL[command], `${command}: --help`);
  }
});

test('exit code 3 is described for both cases: the update before the command failed, and the change was not pushed', () => {
  for (const command of ['new', 'update', 'list', 'next', 'archive']) {
    const text = backlog(...command.split(' '), '--help').stdout;
    assert.match(text, /^ {2}3 {2}The repository that holds the items could not be synchronised with its origin\./m, command);
    assert.match(text, /update before a\s+change failed: then nothing was changed/, command);
    assert.match(text, /change was not published.*rolled back/, command);
  }
  assert.match(backlog('move', '--help').stdout, /3 the update of the local clone failed before\nthe move \(nothing was changed\), or the move was not published and was rolled back/);
  assert.match(backlog('team', 'pop', '--help').stdout, /^ {2}3 {2}idle: nothing to do now\. Only the idle answer exits 3/m);
  // the build does what the text says: a command that only reads answers from the local copy with the offline warning
  const broken = mkdtempSync(join(tmpdir(), 'help-exit3-'));
  dirs.push(broken);
  sharedBacklog(broken);
  const demo = consumer(broken, 'acme', 'demo', 'main');
  renameSync(join(broken, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`), join(broken, 'origin-gone.git'));
  for (const args of [['list']]) { // team pop --dry-run: team-pop.test.js
    const r = cli(args, { cwd: demo, tmp: broken });
    assert.match(r.stderr, /origin offline, local backlog updates may be behind and need manual remediation later/, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
});

test('every command help has the sections Usage, Options and one Example that names the command', () => {
  for (const command of COMMANDS) {
    const text = backlog(...command.split(' '), '--help').stdout;
    assert.equal(text, ALL[command].endsWith('\n') ? ALL[command] : `${ALL[command]}\n`, `${command}: --help prints the HELP text`);
    assert.match(text, new RegExp(`^backlog ${command} `, 'm'), `${command}: first line`);
    assert.match(text, /^Usage:\n {2}backlog /m);
    assert.match(text, /^Options:\n {2}--/m);
    assert.match(text, new RegExp(`^Example:\\n {2}backlog ${command}( |$)`, 'm'));
    assert.match(text, /^ {2}--help\n/m, `${command}: --help is listed`);
  }
});

test('backlog next --help lists the flags that apply to next', () => {
  const text = backlog('next', '--help').stdout;
  for (const flag of ['json']) assert.ok(block(text, flag), `--${flag}`);
  for (const flag of ['all', 'branch']) assert.equal(block(text, flag), undefined, `--${flag}`);
});

test('the help is written in plain sentences: no internal job numbers, script names or file references', () => {
  for (const command of COMMANDS) assert.doesNotMatch(ALL[command], /\bjob \d+|\.py\b|SKILL\.md|lib_db|update\.js|query\.js/i, command);
});

test('backlog --help names every command and the storage setting, and is the same wherever the items live', () => {
  const r = cli(['--help'], { cwd: cons, tmp: t });
  assert.equal(r.status, 0, r.stderr);
  for (const command of [...COMMANDS, 'list', 'setup']) assert.match(r.stdout, new RegExp(`^ {2}backlog ${command}( |$)`, 'm'), `${command} is missing`);
  assert.match(r.stdout, /backlog <command> --help/, 'how to get the help of one command');
  assert.match(r.stdout, /committed and pushed before the command exits/);
  assert.doesNotMatch(r.stdout, /mode|--use-backlog-repo|--use-local-repo|backlog init/);
  const inside = cli(['--help'], { cwd: cons, tmp: t, env: { SMOOTH_BACKLOG_CLI_HOME: '', SMOOTH_BACKLOG_CLI_ORIGIN_URL: '', XDG_CONFIG_HOME: join(t, 'other-config') } });
  assert.equal(inside.stdout, r.stdout);
});

test('COMMANDS.md has the section "Commands" with the help text of every command, and names no mode', () => {
  const doc = readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8');
  assert.doesNotMatch(doc, /shared mode|local mode|--use-backlog-repo|--use-local-repo/);
  const at = doc.indexOf('\n## Commands\n');
  assert.ok(at >= 0, 'section heading missing');
  const section = doc.slice(at);
  for (const command of COMMANDS) assert.ok(section.includes(`\`\`\`text\n${ALL[command].trimEnd()}\n\`\`\``), `${command}: the help text is not in COMMANDS.md verbatim`);
});

test('096: the update help says the retired classification keys have no effect and are dropped at the next write', () => {
  for (const [name, text] of [['update help', backlog('update', '--help').stdout]]) {
    assert.match(text, /retired classification keys[^.]*have no effect/, name);
    assert.match(text, /next writes/, name);
  }
});

test('the team pop help states the pop table, the JSON keys, the dry run and that only idle exits 3', () => {
  const flat = backlog('team', 'pop', '--help').stdout.replace(/\s+/g, ' ');
  assert.match(flat, /first step of the team's pop table/);
  assert.match(flat, /\{"action", "item", "entry", "rule", "item_file"\}/);
  assert.match(flat, /--dry-run does the same without writing anything/);
  assert.match(flat, /Only the idle answer exits 3/);
  assert.doesNotMatch(flat, /--lead|--scope|--claim-now|marked/);
});

test('the plain help names no team option and ends with the pointer to the team help', () => {
  for (const command of ['new', 'update', 'list', 'next']) {
    const text = backlog(command, '--help').stdout;
    assert.doesNotMatch(text, /TEAM_|teams\.json|team session/, command);
    for (const flag of ['team', 'review-refs', 'refine-start', 'request-review', 'accept-handoff', 'claimable', 'set-team', 'set-review-refs']) assert.equal(block(text, flag), undefined, `${command}: --${flag}`);
  }
  assert.equal(backlog('update', '--help').stdout.trimEnd().split('\n').at(-1), 'Team items: backlog team update --help.');
  assert.equal(backlog('new', '--help').stdout.trimEnd().split('\n').at(-1), 'Team items: backlog team new --help.');
  for (const command of TEAM.slice(1)) assert.match(backlog(...command.split(' '), '--help').stdout, new RegExp(`^backlog ${command} `), command);
});

test('query, next and team help: no headless option, no query --pop', () => {
  for (const command of ['list', 'next', 'team']) assert.doesNotMatch(ALL[command], /--pop\b|--headless|BACKLOG_HEADLESS|next --agent/, command);
});

test('backlog --help and COMMANDS.md name no alias, no first-release spelling and no earlier read command', () => {
  const docs = [USAGE, readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8'), readFileSync(new URL('../../templates/skills/backlog/references/commands.md', import.meta.url), 'utf8'), readFileSync(new URL('../../README.md', import.meta.url), 'utf8')];
  for (const doc of docs) assert.doesNotMatch(doc, /\balias|first release|backlog init\b|init clean|--headless|BACKLOG_HEADLESS/i);
});

test('a command that is a word of its own prints its own help, with no alias line', () => {
  assert.equal(backlog('done', '--help').stdout.trimEnd(), HELP.done.trimEnd());
  assert.equal(backlog('list', '--help').stdout.trimEnd(), HELP.list.trimEnd());
  assert.equal(backlog('list', 'branches', '--help').stdout.trimEnd(), HELP.list.trimEnd());
  assert.equal(backlog('update', '--help').stdout.trimEnd(), HELP.update.trimEnd());
  for (const args of [['init', '--help'], ['branch', '--help'], ['3', 'set', '--help']]) {
    const r = backlog(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /is not a backlog command/);
  }
});

test('backlog team --help lists new, and backlog team new --help has the flags, the exit codes and one example', () => {
  assert.match(backlog('team', '--help').stdout, /^ {2}backlog team new --team <name> --agent <name> --name <text> \[--<argument> <value>\]\.\.\. \[--json\]$/m);
  assert.match(backlog('--help').stdout, /^ {2}backlog team new --team <team> --agent <name> --name <text> \[--<argument> <value>\]\.\.\./m);
  const text = backlog('team', 'new', '--help').stdout;
  for (const flag of ['name', '<argument> VALUE', 'team', 'agent', 'session', 'repository', 'branch', 'json', 'help']) assert.ok(text.includes(`  --${flag}`), `--${flag}`);
  for (const gone of ['review-refs', 'split-from', 'status', 'ask']) assert.ok(!text.includes(`  --${gone}`), `--${gone} is refused, not documented`);
  for (const code of ['0', '1', '2', '3']) assert.match(text, new RegExp(`^ {2}${code} {2}`, 'm'), `exit code ${code}`);
  assert.match(text, /^Example:\n {2}backlog team new /m);
});

test('team migrate help describes the command that exists: its flags, the dry run and the record keys', () => {
  const text = teamHelp['team migrate'];
  assert.doesNotMatch(text, /not available yet|bind them to a team|--ask/);
  for (const flag of ['--team', '--show-all', '--dry-run', '--json', '--repository']) assert.ok(block(text, flag.slice(2)), flag);
  assert.match(text, /migrated_at/); assert.match(text, /migrated_by_version/);
  assert.match(text, /never writes it and reads no template/);
  assert.match(text, /no origin remote the conversion stays committed/);
  assert.match(readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'), /no origin remote the conversion stays committed/);
  for (const code of [0, 1, 2, 3]) assert.match(text, new RegExp(`^  ${code}  `, 'm'));
  assert.doesNotMatch(USAGE, /not available yet/);
});

