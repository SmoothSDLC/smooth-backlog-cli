import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIASES, translate } from '../../src/shared/aliases.js';

const t = (input, output) => assert.deepEqual(translate(input), output, input.join(' '));

test('the direct aliases translate to one command', () => {
  t(['init'], { command: 'setup', argv: [] });
  t(['init', 'demo'], { command: 'setup', argv: [] });
  t(['init', 'clean'], { command: 'init-clean', argv: [] });
  t(['init', 'clean', 'demo'], { command: 'init-clean', argv: [] });
  t(['list', 'open'], { command: 'query', argv: ['--only', 'open'] });
  t(['list', 'new'], { command: 'query', argv: ['--only', 'new'] });
  t(['list', 'archive'], { command: 'query', argv: ['--only', 'archive'] });
  t(['list', 'done', '--branch', 'feature'], { command: 'query', argv: ['--only', 'done', '--branch', 'feature'] });
  t(['list', 'branch'], { command: 'query', argv: ['--branches'] });
  t(['branch'], { command: 'query', argv: ['--branches'] });
  t(['new', 'Fix login', '--description', 'users land right', '--state', 'open', '--priority', '0'],
    { command: 'new', argv: ['--name', 'Fix login', '--objective', 'users land right', '--status', 'in progress', '--priority', '0', '--summary', 'Fix login'] });
  t(['new', 'Fix login', '--summary', 'own', '--state', 'done'], { command: 'new', argv: ['--name', 'Fix login', '--summary', 'own', '--status', 'closed'] });
  t(['new', 'X', '--state=new'], { command: 'new', argv: ['--name', 'X', '--status', 'new', '--summary', 'X'] });
  t(['set', '3', 'name', 'Better name'], { command: 'update', argv: ['3', '--name', 'Better name'] });
  t(['set', '3', 'description', 'why'], { command: 'update', argv: ['3', '--objective', 'why'] });
  t(['set', '3', 'state', 'open'], { command: 'update', argv: ['3', '--status', 'in progress'] });
  t(['set', '3', 'state', 'done'], { command: 'update', argv: ['3', '--status', 'closed'] });
  for (const f of ['summary', 'priority', 'branch', 'commit', 'location']) t(['set', '3', f, 'v'], { command: 'update', argv: ['3', `--${f}`, 'v'] });
  t(['priority', '3', '0'], { command: 'update', argv: ['3', '--priority', '0'] });
  t(['priority', '3'], { command: 'query', argv: ['--phase', '3'] });
  t(['done', '3'], { command: 'update', argv: ['3', '--status', 'done'] });
  t(['3', 'done'], { command: 'update', argv: ['3', '--status', 'done'] });
  t(['003-fix-login', 'set', 'name', 'x'], { command: 'update', argv: ['003-fix-login', '--name', 'x'] });
  t(['3', 'priority', '1'], { command: 'update', argv: ['3', '--priority', '1'] });
  t(['move', '3', 'release'], { command: 'move', argv: ['3', '--to-branch', 'release'] });
  t(['3', 'move', 'release'], { command: 'move', argv: ['3', '--to-branch', 'release'] });
  t(['--json', 'list', 'open'], { command: 'query', argv: ['--json', '--only', 'open'] });
});

test('--ask and --headless are accepted and dropped, except where --ask means something', () => {
  t(['list', 'open', '--ask'], { command: 'query', argv: ['--only', 'open'] });
  t(['query', '--headless', '--status'], { command: 'query', argv: ['--status'] });
  t(['update', '3', '--ask', '--note', 'x'], { command: 'update', argv: ['3', '--note', 'x'] });
  t(['--json', '--headless'], { command: 'next', argv: ['--json'] });
  t(['setup', '--ask'], null);
  t(['init', '--ask'], { command: 'setup', argv: ['--ask'] });
  t(['setup', '--headless'], { command: 'setup', argv: [] });
});

test('query --pop and next --agent are refused with a pointer to the team command', () => {
  const pointer = '--pop is a team command: use backlog team pop --team <team> --agent <name> (--dry-run only answers)';
  t(['query', '--pop', '--agent', 'ada', '--claim-now'], { error: pointer });
  t(['next', '--agent', 'ada'], { error: pointer });
  t(['next', '--agent=ada'], { error: pointer });
  t(['--json', 'query', '--pop'], { error: pointer });
});

test('init backup is not a command, and what is not an alias is left to the router', () => {
  for (const argv of [['init', 'backup'], ['query'], ['update', '3', '--status', 'done'], ['new', '--name', 'x'], ['move', '3', '--to-branch', 'b'], ['3'], ['frobnicate'], ['list'], ['list', '--branch', 'b'], ['next'], ['query', '--agent', 'a'], ['setup']]) {
    assert.equal(translate(argv), null, argv.join(' '));
  }
});

test('every row of the table names a form and what it runs', () => {
  assert.ok(ALIASES.length >= 12);
  for (const row of ALIASES) assert.ok(row.form && row.runs, JSON.stringify(row));
});
