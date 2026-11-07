import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIASES, plan, translate } from '../../src/shared/aliases.js';

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

test('a word that names an Object property is no key of the set or state tables', () => {
  for (const word of ['constructor', 'toString', '__proto__']) {
    assert.equal(translate(['set', '3', word, 'v']), null, word);
    t(['set', '3', 'state', word], { command: 'update', argv: ['3', '--status', word] });
    t(['new', 'X', '--state', word], { command: 'new', argv: ['--name', 'X', '--status', word, '--summary', 'X'] });
  }
});

test('a --json after the item of priority is the switch, not the position', () => {
  t(['priority', '3', '--json'], { command: 'query', argv: ['--phase', '3', '--json'] });
  t(['priority', '3', '1', '--json'], { command: 'update', argv: ['3', '--priority', '1', '--json'] });
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

test('the list aliases translate to the section editor', () => {
  t(['add', '3', 'evidence', 'proof', '--top'], { command: 'update', argv: ['3', '--section', 'Evidence', '--add-line', 'proof', '--top'] });
  t(['replace', '3', 'tasks', '["a","b"]'], { command: 'update', argv: ['3', '--section', 'Tasks', '--set-lines', '["a","b"]'] });
  t(['remove', '3', 'references', '2'], { command: 'update', argv: ['3', '--section', 'References', '--remove-line', '2'] });
  t(['priority', '3', 'tasks', '2', '1'], { command: 'update', argv: ['3', '--section', 'Tasks', '--move-line', '2:1'] });
  t(['set', '3', 'ac', '["it works"]', '--force'], { command: 'update', argv: ['3', '--section', 'Definition of done', '--set-lines', '["it works"]'] });
  t(['3', 'add', 'outcomes', 'o'], { command: 'update', argv: ['3', '--section', 'Outcomes', '--add-line', 'o'] });
  t(['new', 'X', '--ac', 'it works', '--tasks', '["t1"]'], { command: 'new', argv: ['--name', 'X', '--summary', 'X', '--body', '## Definition of done\n\n- it works\n\n## Tasks\n\n- t1\n'] });
  t(['add', '3', 'nonsense', 'x'], null);
});

test('import and archive done are sequences, and the other spellings are refused or left alone', () => {
  assert.deepEqual(plan(['import', '--branch', 'feature']), { kind: 'import', source: 'feature', higher: false });
  assert.deepEqual(plan(['import', '--higher', '--branch=feature/x', '--headless']), { kind: 'import', source: 'feature/x', higher: true });
  assert.match(plan(['import']).error, /needs --branch/);
  assert.match(plan(['import', '--branch', 'a', '--force']).error, /unrecognized argument --force/);
  assert.deepEqual(plan(['archive', 'done']), { kind: 'archive-done' });
  assert.match(plan(['--json', 'import', '--branch', 'a']).error, /import prints text only/);
  assert.match(plan(['archive', 'done', '--json']).error, /archive done prints text only/);
  assert.match(plan(['archive', 'done', 'x']).error, /takes no other argument/);
  assert.equal(plan(['archive', '3']), null);
  assert.equal(plan(['archive']), null);
  assert.equal(plan(['query']), null);
});

test('update with no item, or with a self-update word or a version, is the self-update; with an item or an option it is the item command', () => {
  t(['update'], { command: 'upgrade', argv: [] });
  t(['update', 'check'], { command: 'upgrade', argv: ['check'] });
  for (const word of ['auto', 'off', 'disable']) t(['update', word], { command: 'upgrade', argv: [word] });
  t(['update', '1.2.3'], { command: 'upgrade', argv: ['1.2.3'] });
  t(['update', 'v1.2.3'], { command: 'upgrade', argv: ['1.2.3'] });
  t(['--json', 'update', 'check'], { command: 'upgrade', argv: ['--json', 'check'] });
  for (const item of [['3', '--status', 'done'], ['--replan', '1,2'], ['003-fix-login', '--note', 'x'], ['3.1', '--note', 'x'], ['--restore']]) assert.equal(translate(['update', ...item]), null, item.join(' '));
});
