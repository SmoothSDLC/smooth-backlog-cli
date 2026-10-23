// Tests for the shared-mode help text (cli-parity job 18, HELP): src/help.js, the help constant of src/output.js, COMMANDS.md.
// Oracle: `python3 <script> --help` of new_phase.py, update.py, query.py, move.py and archive.py (run on a temporary fixture,
// never on the real backlog); every flag it prints must appear in `backlog <command> --help`. Without python3, PyYAML or
// SMOOTH_BACKLOG_SCRIPTS the oracle comparison is skipped with that reason. Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, py, sharedBacklog } from './shared-fixtures.js';
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
const COMMANDS = ['new', 'update', 'query', 'next', 'move', 'archive'];
// Flags this build refuses (query.js TEAM and --headless); --db is internal to the Python scripts (contract section 2).
const REFUSED = {
  update: ['db'],
  query: ['pop', 'plan', 'lead', 'agents', 'review-classes', 'claim-now', 'headless', 'db'],
  new: ['db'], move: [], archive: ['db'],
};
const flagsOf = text => [...new Set((text.match(/--[a-z][\w-]*/g) ?? []).filter(f => !f.endsWith('-')))];
// The block of one flag: its header line `  --flag ...` and the lines indented by six spaces below it.
const block = (text, flag) => new RegExp(`^  --${flag}(?: .*)?\\n((?:      .*\\n)*)`, 'm').exec(text)?.[0];

for (const [command, script] of Object.entries(SCRIPT)) {
  test(`backlog ${command} --help lists every flag of ${script} --help`, ctx => {
    const o = py(script, ['--help'], { cwd: cons, tmp: t, env: { COLUMNS: '1000' } });
    if (!o) return ctx.skip('oracle not configured (python3 with PyYAML and SMOOTH_BACKLOG_SCRIPTS): flags not compared');
    assert.equal(o.status, 0, o.stderr);
    const r = backlog(command, '--help');
    assert.equal(r.status, 0, r.stderr);
    const flags = flagsOf(o.stdout);
    assert.ok(flags.length > 3, `no flags found in the ${script} help`);
    for (const flag of flags) assert.ok(block(r.stdout, flag.slice(2)), `${command}: ${flag} has no block in the help`);
  });
}

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

test('every refused flag is refused by the command (the help does not promise more than the build does)', () => {
  for (const [command, flags] of Object.entries(REFUSED)) {
    for (const flag of flags.filter(f => command !== 'archive')) {
      const args = command === 'update' ? ['update', 'x', `--${flag}`, 'x'] : [command, `--${flag}`, 'x'];
      const r = backlog(...args);
      assert.notEqual(r.status, 0, `${command} --${flag} was accepted: ${r.stdout}`);
    }
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
