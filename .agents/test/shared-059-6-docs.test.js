// Tests for item 059.6: the documentation of the dependency hand-off (item 059). The update help (src/help.js) gets a
// block for every new flag, the gate paragraph and the close rule; COMMANDS.md carries the help verbatim (rewritten by
// .agents/scripts/sync-commands-md.mjs); the built-in skill and the CHANGELOG Unreleased section teach the same rules.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { HELP } from '../../src/help.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'handoff-docs-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
// The block of one flag: its header line `  --flag ...` and the lines indented by six spaces below it.
const block = (text, flag) => new RegExp(`^  --${flag}(?: .*)?\\n((?:      .*\\n)*)`, 'm').exec(text)?.[0];
const FLAGS = ['handoff', 'handoff-commit', 'handoff-contract', 'handoff-verification', 'handoff-outputs',
  'handoff-pickup', 'handoff-risks', 'accept-handoff', 'reject-handoff', 'ignore-dependency-lock'];

test('the update help has a non-empty block for every hand-off flag', () => {
  for (const flag of FLAGS) {
    const b = block(HELP.update, flag);
    assert.ok(b, `--${flag} has no block in the update help`);
    assert.ok(b.includes('\n      '), `--${flag} has no description`);
  }
});

test('the --handoff block names its required and optional parts, the real-dependent rule and the replacement', () => {
  const b = block(HELP.update, 'handoff');
  assert.ok(b, 'no --handoff block');
  for (const part of ['--handoff-commit', '--handoff-contract', '--handoff-verification', '--handoff-outputs',
    '--handoff-pickup', '--handoff-risks']) assert.match(b, new RegExp(part), `--handoff does not name ${part}`);
  assert.match(b, /replaces/i, 'a new record for the same dependent replaces the earlier one');
  assert.match(b, /owner\/name#seq/, 'a dependent of another repository');
});

test('the --accept-handoff and --reject-handoff blocks name --checks and the existing --reason', () => {
  const acc = block(HELP.update, 'accept-handoff');
  assert.ok(acc, 'no --accept-handoff block');
  assert.match(acc, /--checks/);
  assert.match(acc, /lead/i);
  const rej = block(HELP.update, 'reject-handoff');
  assert.ok(rej, 'no --reject-handoff block');
  assert.match(rej, /--reason/);
  assert.match(rej, /lead/i);
});

test('the --ignore-dependency-lock block says it goes with --claim, who may use it, and that an unfinished dependency is never passed', () => {
  const b = block(HELP.update, 'ignore-dependency-lock');
  assert.ok(b, 'no --ignore-dependency-lock block');
  assert.match(b, /With --claim/);
  assert.match(b, /owner/i);
  assert.match(b, /never/i);
  assert.match(b, /dependency_lock_overrides/);
});

test('the --close and --status blocks say the close rule and the NONE record', () => {
  const close = block(HELP.update, 'close');
  assert.ok(close, 'no --close block');
  assert.match(close, /not accepted|unaccepted/i, 'the close rule');
  assert.match(close, /NONE/);
  const status = block(HELP.update, 'status');
  assert.ok(status, 'no --status block');
  assert.match(status, /not accepted|unaccepted/i, 'the close rule');
  assert.match(status, /NONE/);
});

test('the update help has the gate paragraph: only accepted and legacy satisfy, and the state is named', () => {
  assert.match(HELP.update, /offered or claimed only/);
  assert.match(HELP.update, /legacy/);
  for (const state of ['accepted', 'legacy', 'missing', 'unaccepted', 'stale', 'rejected']) {
    assert.match(HELP.update, new RegExp(`\\b${state}\\b`), `the edge state ${state} is not named`);
  }
  assert.match(HELP.update, /name the state|names the state/i);
});

test('backlog update --help through the CLI prints the same text with every new flag', () => {
  const f = fixture();
  const r = cli(['update', '--help'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, HELP.update);
  for (const flag of FLAGS) assert.ok(block(r.stdout, flag), `--${flag}`);
});

test('COMMANDS.md carries the update help verbatim (the sync script rewrote it)', () => {
  const doc = readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8');
  assert.ok(doc.includes('```text\n' + HELP.update.trimEnd() + '\n```'), 'the update block of COMMANDS.md is not the help text verbatim');
});

test('the built-in skill teaches the gate: the producer record, the lead receipts, the close rule and the override', () => {
  const text = readFileSync(new URL('../../templates/skills/backlog/SKILL.md', import.meta.url), 'utf8');
  for (const flag of ['--handoff', '--handoff-commit', '--handoff-contract', '--handoff-verification', '--handoff-outputs',
    '--handoff-pickup', '--handoff-risks', '--accept-handoff', '--reject-handoff', '--ignore-dependency-lock']) {
    assert.match(text, new RegExp(flag), `the skill does not teach ${flag}`);
  }
  assert.match(text, /legacy/);
  assert.match(text, /NONE/);
});

test('the CHANGELOG Unreleased section records the gate and the new flags', () => {
  const doc = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  const start = doc.indexOf('## Unreleased');
  assert.ok(start >= 0, 'no Unreleased section');
  const section = doc.slice(start, doc.indexOf('\n## ', start + 1));
  for (const flag of ['--handoff', '--accept-handoff', '--reject-handoff', '--ignore-dependency-lock']) {
    assert.match(section, new RegExp(flag), `the Unreleased section does not record ${flag}`);
  }
  assert.match(section, /legacy/);
});
