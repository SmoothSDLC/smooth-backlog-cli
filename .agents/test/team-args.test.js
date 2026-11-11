// The arguments of a team command: the reserved flags taken out by name, every other --name a step argument.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../src/team/args.js';
import { FLAGS, VALUE } from '../../src/team/inputs.js';

const OK = [...VALUE, 'json', 'show-all'];
const fails = (argv, text, accepts = OK) => assert.throws(() => parseArgs(argv, accepts), e => e.exitCode === 2 && e.message === text, argv.join(' '));

test('both forms; the reserved flags and the step arguments are told apart', () => {
  const r = parseArgs(['--name', 'a b', '--team=t', '--estimate=-5', '--json', '--agent', 'x', '--after', '31'], OK);
  assert.deepEqual(r.positionals, []);
  assert.deepEqual({ ...r.flags }, { team: 't', json: true, agent: 'x' });
  assert.deepEqual({ ...r.args }, { name: 'a b', estimate: '-5', after: '31' });
});

test('a word that is no flag is a positional; the value of a flag is not one', () => {
  assert.deepEqual(parseArgs(['7', 'claim', '--note', 'hello', 'x'], OK).positionals, ['7', 'claim', 'x']);
});

test('a reserved flag the command does not take is unrecognized, for every name of the list', () => {
  for (const name of FLAGS.filter(f => !OK.includes(f))) fails([`--${name}`], `unrecognized arguments: --${name}`);
  fails(['--ask'], 'unrecognized arguments: --ask');
  fails(['--dry-run'], 'unrecognized arguments: --dry-run');
  assert.deepEqual({ ...parseArgs(['--dry-run'], [...OK, 'dry-run']).flags }, { 'dry-run': true });
});

test('a command with no step arguments refuses every other --name, with or without a value', () => {
  for (const argv of [['--bogus'], ['--bogus', 'v'], ['--bogus=v']]) assert.throws(() => parseArgs(argv, [], { steps: false }), e => e.exitCode === 2 && e.message === `unrecognized arguments: ${argv[0]}`, argv.join(' '));
  assert.deepEqual({ ...parseArgs(['--json', '7'], ['json'], { steps: false }).flags }, { json: true });
});

test('a flag without its value, a value on a boolean, an empty name', () => {
  fails(['--name'], 'argument --name: expected one argument');
  fails(['--name', '--estimate', '5'], 'argument --name: expected one argument');
  fails(['--team'], 'argument --team: expected one argument');
  fails(['--json=yes'], "argument --json: ignored explicit argument 'yes'");
  fails(['--'], 'unrecognized arguments: --');
  fails(['--=x'], 'unrecognized arguments: --=x');
});

test('an empty value is a value; the last of a repeated name counts; a name like __proto__ is a plain key', () => {
  assert.deepEqual({ ...parseArgs(['--name', '', '--name=x', '--name', 'y'], OK).args }, { name: 'y' });
  assert.equal(parseArgs(['--name', ''], OK).args.name, '');
  const r = parseArgs(['--__proto__', 'x'], OK);
  assert.equal(Object.getPrototypeOf(r.args), Object.prototype);
  assert.deepEqual(Object.keys(r.args), ['__proto__']);
  assert.equal(({}).x, undefined);
});
