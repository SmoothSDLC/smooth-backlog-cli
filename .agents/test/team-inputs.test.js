import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS, SHOW_ALL, formOf, resolveInputs } from '../../src/team/inputs.js';

const V = n => `SMOOTH_BACKLOG_CLI_${n}`;
const refused = (input, text) => assert.throws(() => resolveInputs(input), e => e.exitCode === 2 && (text instanceof RegExp ? text.test(e.message) : e.message === text));

test('the repository comes from the flag, else the variable, and is the one the command acts on', () => {
  const base = { command: 'query', flags: { team: 'web' } };
  assert.equal(resolveInputs(base).repository, '');
  assert.equal(resolveInputs({ ...base, env: { [V('TEAM_REPOSITORY')]: 'acme/app' } }).repository, 'acme/app');
  assert.equal(resolveInputs({ ...base, flags: { team: 'web', repository: 'acme/other' }, env: { [V('TEAM_REPOSITORY')]: 'acme/app' } }).repository, 'acme/other');
});

test('a repository that is not owner/name stops the command with the variable named', () => {
  refused({ command: 'query', flags: { team: 'web' }, env: { [V('TEAM_REPOSITORY')]: 'nonsense' } }, `${V('TEAM_REPOSITORY')}='nonsense': expected owner/name`);
  refused({ command: 'query', flags: { team: 'web', repository: 'a/b/c' } }, /expected owner\/name/);
  refused({ command: 'query', flags: { 'show-all': true, repository: 'x' } }, /expected owner\/name/);
});

test('the branch and the session come from the flag, else the variable; the session defaults to empty', () => {
  const r = resolveInputs({ command: 'query', flags: { team: 'web', branch: 'dev' }, env: { [V('TEAM_BRANCH')]: 'main', [V('SESSION')]: 's1' } });
  assert.deepEqual([r.branch, r.session], ['dev', 's1']);
  const none = resolveInputs({ command: 'query', flags: { team: 'web' } });
  assert.deepEqual([none.branch, none.session], ['', '']);
});

test('an empty value counts as not given at the flag, the variable and the configuration', () => {
  const r = resolveInputs({ command: 'update', flags: { team: '', agent: '' }, env: { [V('TEAM_NAME')]: '', [V('AGENT')]: 'a1' }, config: { team: 'cfg' } });
  assert.deepEqual([r.team, r.agent], ['cfg', 'a1']);
  refused({ command: 'query', flags: { team: '' }, env: { [V('TEAM_NAME')]: '' }, config: { team: '' } }, /needs a team/);
});

test('--show-all with the team variable set acts over every team; --team wins when both are given', () => {
  const env = { [V('TEAM_NAME')]: 'web' };
  for (const command of ['query', 'validate', 'migrate']) assert.deepEqual(resolveInputs({ command, flags: { 'show-all': true }, env }).team, null);
  const r = resolveInputs({ command: 'query', flags: { 'show-all': true, team: 'x' }, env });
  assert.deepEqual([r.team, r.all], ['x', false]);
  // with --team given, even a form that refuses --show-all accepts the call
  assert.equal(resolveInputs({ command: 'update', flags: { 'show-all': true, team: 'x', agent: 'a' } }).team, 'x');
});

test('--show-all is refused by the one-team forms, before the agent is asked for', () => {
  for (const command of ['new', 'update', 'pop', 'query plan', 'query check', 'query filter', 'query steps']) refused({ command, flags: { 'show-all': true } }, `--show-all acts over every team; backlog team ${command} acts for one team: give --team <name> instead`);
  for (const command of SHOW_ALL) assert.equal(resolveInputs({ command, flags: { 'show-all': true } }).all, true);
});

test('the agent is required by new, update and pop only, and never comes from the configuration user', () => {
  for (const command of ['new', 'update', 'pop']) refused({ command, flags: { team: 'web' }, config: { user: 'u' } }, /needs the agent/);
  assert.equal(resolveInputs({ command: 'query', flags: { team: 'web' }, config: { user: 'u' } }).agent, '');
});

test('formOf maps the words of a query to its form, with or without the leading team', () => {
  assert.equal(formOf(['team', 'query']), 'query');
  assert.equal(formOf(['query', '--json']), 'query');
  assert.equal(formOf(['team', 'query', '50']), 'query <item>');
  assert.equal(formOf(['team', 'query', 'rules']), 'query rules');
  for (const w of ['plan', 'check', 'filter', 'steps']) assert.equal(formOf(['team', 'query', w]), `query ${w}`);
  assert.equal(formOf(['team', 'update', '50', 'done']), 'update');
});

test('the reserved flag names are one list', () => {
  assert.deepEqual([...FLAGS].sort(), ['agent', 'ask', 'branch', 'dry-run', 'help', 'json', 'repository', 'session', 'show-all', 'team', 'version']);
});
