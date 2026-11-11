// `backlog team query` (the list), `query <item>` and `query filter <name>`: the team's items as the rules read them. Nothing is written in the clone or published;
// the cases of the filters are replayed in team-commands.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as index from '../../src/shared/index.js';
import { tmpdir } from 'node:os';
import { cli } from './shared-fixtures.js';
import { stepArgs, stepNames, stepWords } from '../../src/team/steps.js';
import { TEMPLATES, fileOf, git, putItem, world } from './team-fixture.js';

const ENTRY = TEMPLATES.parallel.parallel;
const BASE = ['--team', 'parallel'];
const item = (seq, fields = {}, extra = {}) => ({ seq, slug: `${String(seq).padStart(3, '0')}-job`, name: `job ${seq}`, team: 'parallel', repository: 'acme/app', branch: 'main', fields: { status: 'ready', estimate: 5, holder: '', checker: '', parent: null, children: [], depends_on: [], handoff: '', rounds: 0, ...fields }, ...extra });
const query = (w, ...rest) => w.run(rest, {}, 'query');
const order = (w, branches) => {
  const entries = list => list.map(i => ({ seq: i.seq, slug: i.slug, name: i.name, status: i.fields.status }));
  index.write(w.folder, { branches: Object.fromEntries(Object.entries(branches).map(([b, l]) => [b, entries(l)])) });
};
function seeded(t, items, branches, teams) {
  const w = world(t, teams);
  for (const i of items) putItem(w.folder, i, i.team === 'scrum' ? TEMPLATES.scrum.scrum : ENTRY);
  if (branches) order(w, branches);
  w.publish('seed');
  return w;
}
const snapshot = dir => Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => [join(e.parentPath, e.name), readFileSync(join(e.parentPath, e.name), 'utf8')]));
const clean = w => assert.equal(git(w.home, 'status', '--porcelain', '-uall'), '');
const TWO = [item(1), item(2, {}, { branch: 'feature/a-b' }), item(3, {}, { branch: 'feature/a-b' }), item(4), item(5, { status: 'closed' })];
const BRANCHES = { 'feature/a-b': [TWO[2], TWO[1]], main: [TWO[3], TWO[0], TWO[4]] };

test('the list prints the open items of every branch in the index\'s key order, and with --branch the queue of that branch only; both leave the clone clean', t => {
  const w = seeded(t, TWO, BRANCHES);
  const before = snapshot(w.folder);
  const all = query(w, ...BASE);
  assert.equal(all.status, 0, all.stdout + all.stderr);
  assert.equal(all.stdout, 'P0 [3] 003-job  ready  job 3\nP1 [2] 002-job  ready  job 2\nP2 [4] 004-job  ready  job 4\nP3 [1] 001-job  ready  job 1\n');
  const one = query(w, ...BASE, '--branch', 'feature/a-b');
  assert.equal(one.stdout, 'P0 [3] 003-job  ready  job 3\nP1 [2] 002-job  ready  job 2\n');
  const main = query(w, ...BASE, '--branch', 'main');
  assert.equal(main.stdout, 'P0 [4] 004-job  ready  job 4\nP1 [1] 001-job  ready  job 1\n');
  assert.deepEqual(snapshot(w.folder), before);
  clean(w);
});

test('the list --json is the array of the item documents in the same order', t => {
  const w = seeded(t, TWO, BRANCHES);
  const r = query(w, ...BASE, '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const docs = JSON.parse(r.stdout);
  assert.deepEqual(docs.map(d => d.seq), [3, 2, 4, 1]);
  for (const d of docs) assert.deepEqual(d, JSON.parse(readFileSync(fileOf(w.folder, d.seq), 'utf8')));
  clean(w);
});

test('an empty queue prints the empty answer, as text and as an empty array', t => {
  const w = seeded(t, [item(1, { status: 'closed' })]);
  assert.equal(query(w, ...BASE).stdout, 'ℹ️  no open item for team parallel\n');
  assert.equal(query(w, ...BASE, '--json').stdout, '[]\n');
});

test('--show-all lists each team of the file in file order, each by its own final statuses, and names the team; --team with it lists that team only', t => {
  const w = seeded(t, [item(1), item(2, { status: 'closed' }), { ...item(3, { status: 'ready' }), team: 'scrum' }, { ...item(4, { status: 'done' }), team: 'scrum' }], null, { ...TEMPLATES.parallel, ...TEMPLATES.scrum });
  const all = query(w, '--show-all');
  assert.equal(all.status, 0, all.stdout + all.stderr);
  assert.equal(all.stdout, 'P0 [1] 001-job  ready  job 1  (team parallel)\nP0 [3] 003-job  ready  job 3  (team scrum)\n');
  const withVariable = w.run(['--show-all'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 'web' }, 'query');
  assert.equal(withVariable.stdout, all.stdout);
  const web = query(w, '--team', 'parallel', '--show-all');
  assert.equal(web.stdout, 'P0 [1] 001-job  ready  job 1\n');
  assert.deepEqual(JSON.parse(query(w, '--show-all', '--json').stdout).map(d => d.team), ['parallel', 'scrum']);
  clean(w);
});

test('--show-all with no open item in any team prints the empty answer, as text and as an empty array', t => {
  const w = seeded(t, [item(1, { status: 'closed' }), { ...item(2, { status: 'done' }), team: 'scrum' }], null, { ...TEMPLATES.parallel, ...TEMPLATES.scrum });
  assert.equal(query(w, '--show-all').stdout, 'ℹ️  no open item for any team\n');
  assert.equal(query(w, '--show-all', '--json').stdout, '[]\n');
});

test('without a team the list is refused with the text of the inputs, exit 2', t => {
  const w = seeded(t, [item(1)]);
  const r = query(w);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^❌ backlog: a team command needs a team: give --team <name>/);
});

test('query <item> prints the same for the number, the padded number and the slug; --json is the item file, equal to what pop printed for it', t => {
  const w = seeded(t, [item(7, { status: 'ready' })]);
  const answers = ['7', '007', '007-job'].map(i => query(w, i, ...BASE));
  for (const a of answers) assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(new Set(answers.map(a => a.stdout)).size, 1);
  assert.match(answers[0].stdout, /^\[7\] 007-job  job 7\nteam parallel  repository acme\/app  branch main\nstatus: ready\n/);
  const popped = JSON.parse(w.run([...BASE, '--agent', 'member-1', '--json'], {}, 'pop').stdout);
  const r = query(w, '7', ...BASE, '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), popped.item_file);
  clean(w);
});

test('an item of another team, an item of no team and an unknown item are exit 1 with the text; --show-all shows any item', t => {
  const w = seeded(t, [item(1), item(2, {}, { team: 'other' }), item(3, {}, { team: '' })]);
  assert.deepEqual([query(w, '2', ...BASE).status, query(w, '2', ...BASE).stdout], [1, '❌ item 2 belongs to team other\n']);
  assert.deepEqual([query(w, '3', ...BASE).status, query(w, '3', ...BASE).stdout], [1, '❌ item 3 belongs to no team\n']);
  assert.deepEqual([query(w, '9', ...BASE).status, query(w, '9', ...BASE).stdout], [1, '❌ no item 9\n']);
  const any = query(w, '2', '--show-all'); // a team the file does not hold: every field prints, as undeclared
  assert.equal(any.status, 0, any.stdout + any.stderr);
  assert.match(any.stdout, /^\[2\] 002-job/);
  for (const line of ['status: ready', 'estimate: 5', 'holder: ""']) assert.ok(any.stdout.split('\n').includes(line), line);
  const none = query(w, '3', '--show-all'); // an item of no team
  assert.equal(none.status, 0, none.stdout + none.stderr);
  for (const line of ['status: ready', 'estimate: 5', 'holder: ""']) assert.ok(none.stdout.split('\n').includes(line), line);
  clean(w);
});

test('an archived item is read, and a number a live and an archived item hold is exit 2 naming both', t => {
  const w = seeded(t, [item(1, {}, { archived: true }), item(2), item(2, {}, { slug: '002-other', archived: true })]);
  assert.equal(query(w, '1', ...BASE).status, 0);
  const r = query(w, '2', ...BASE);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^❌ backlog: number 2 names two items, 002-(job|other) and 002-(job|other); name the item by its slug/);
  assert.equal(query(w, '002-other', ...BASE).status, 0);
});

test('a hand-edited item with the fields events and phase and an undeclared one prints every field, declared and undeclared alike', t => {
  const w = seeded(t, [item(1, { events: ['x'], phase: 'p', zeta: 'z', alpha: 1 })]);
  const r = query(w, '1', ...BASE);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const line of ['status: ready', 'estimate: 5', 'events: ["x"]', 'phase: p', 'zeta: z', 'alpha: 1']) assert.ok(r.stdout.split('\n').includes(line), line);
  assert.ok(r.stdout.indexOf('alpha: 1') < r.stdout.indexOf('events:') && r.stdout.indexOf('events:') < r.stdout.indexOf('zeta:'), 'undeclared fields follow the declared ones, alphabetically');
  const doc = JSON.parse(query(w, '1', ...BASE, '--json').stdout);
  assert.deepEqual(doc.fields.events, ['x']);
  assert.equal(doc.fields.phase, 'p');
  assert.equal(doc.fields.zeta, 'z');
  clean(w);
});

test('filter prints the items the filter selects as the list, with their ranks in the whole queue; an unknown name is exit 1 naming the filters; --show-all is exit 2', t => {
  const w = seeded(t, [item(1), item(2, { children: [3] }), item(3, { parent: 2 })], { main: [item(1), item(2), item(3)] });
  const r = query(w, 'filter', 'waiting', ...BASE);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'P1 [2] 002-job  ready  job 2\n');
  assert.deepEqual(JSON.parse(query(w, 'filter', 'waiting', ...BASE, '--json').stdout).map(d => d.seq), [2]);
  const none = query(w, 'filter', 'nope', ...BASE);
  assert.equal(none.status, 1);
  assert.match(none.stdout, /^❌ team parallel has no filter nope \(filters: .*waiting/);
  const all = query(w, 'filter', 'waiting', '--show-all');
  assert.equal(all.status, 2);
  assert.equal(all.stderr, '❌ backlog: --show-all acts over every team; backlog team query filter acts for one team: give --team <name> instead\n');
  assert.equal(query(w, 'filter', ...BASE).status, 2);
  clean(w);
});

test('the retired views are no longer options: each is exit 2 unrecognized', t => {
  const w = seeded(t, [item(1)]);
  for (const flag of ['--claimable', '--reviewable', '--blocked', '--decisions', '--wip', '--lead', '--scope', '--agents', '--next', '--status', '--phase']) {
    const r = query(w, ...BASE, flag);
    assert.equal(r.status, 2, flag);
    assert.match(r.stderr, /unrecognized arguments/, flag);
  }
});

// What every printer prints passes through the redaction: a URL with credentials, a value that is a user:token pair, and a line break inside a value of the pretty-printed document.
const SECRET = 'https://user:pw-secret@host.example/x';
const rich = () => item(1, { note: 'https://u2:pw-two@h2.example/y', token: 'bob:pw-three@h3' }, { name: `job ${SECRET}`, body: 'see https://u3:pw-four@h3.example\nsecond line\n' });
const NO_SECRET = /pw-secret|pw-two|pw-three|pw-four|user:|u2:|u3:/;

test('the list prints no credential, as text and as JSON, and the JSON keeps its keys', t => {
  const w = seeded(t, [rich()]);
  const text = query(w, ...BASE);
  assert.equal(text.status, 0, text.stdout + text.stderr);
  assert.doesNotMatch(text.stdout, NO_SECRET);
  assert.match(text.stdout, /^P0 \[1\] 001-job {2}ready {2}job https:\/\/host\.example\/x\n$/);
  const json = query(w, ...BASE, '--json');
  assert.doesNotMatch(json.stdout, NO_SECRET);
  const [doc] = JSON.parse(json.stdout);
  assert.equal(doc.name, 'job https://host.example/x');
  assert.deepEqual(Object.keys(doc.fields).filter(k => ['note', 'token'].includes(k)).sort(), ['note', 'token']);
  assert.equal(doc.fields.note, 'https://h2.example/y');
  assert.equal(doc.body, 'see https://h3.example\nsecond line\n');
});

test('query <item> prints no credential, as text and as JSON; an error line that echoes the input prints none either', t => {
  const w = seeded(t, [rich()]);
  const text = query(w, '1', ...BASE);
  assert.equal(text.status, 0, text.stdout + text.stderr);
  assert.doesNotMatch(text.stdout, NO_SECRET);
  assert.match(text.stdout, /^\[1\] 001-job {2}job https:\/\/host\.example\/x\n/);
  assert.match(text.stdout, /\nnote: https:\/\/h2\.example\/y\n/);
  const json = query(w, '1', ...BASE, '--json');
  assert.doesNotMatch(json.stdout, NO_SECRET);
  const doc = JSON.parse(json.stdout);
  assert.equal(doc.fields.note, 'https://h2.example/y');
  assert.equal(doc.body, 'see https://h3.example\nsecond line\n');
  for (const args of [['--bogus=' + SECRET, ...BASE], [SECRET, ...BASE], ['filter', SECRET, ...BASE]]) {
    const r = query(w, ...args);
    assert.notEqual(r.status, 0, args.join(' '));
    assert.doesNotMatch(r.stdout + r.stderr, NO_SECRET, args.join(' '));
    assert.match(r.stdout + r.stderr, /host\.example\/x|bogus/, args.join(' '));
  }
});

const NAMES = Object.keys(TEMPLATES);
const teamOf = name => Object.keys(TEMPLATES[name])[0];

test('query rules prints the team entry as stored, two-space indented, the same bytes as text and as --json, for each shipped template; nothing is written', t => {
  for (const name of NAMES) {
    const team = teamOf(name);
    const w = world(t, TEMPLATES[name]);
    mkdirSync(w.folder, { recursive: true });
    const before = snapshot(w.folder);
    const text = query(w, 'rules', '--team', team);
    assert.equal(text.status, 0, `${name}: ${text.stdout}${text.stderr}`);
    assert.deepEqual(JSON.parse(text.stdout), TEMPLATES[name][team], name);
    assert.equal(text.stdout, `${JSON.stringify(TEMPLATES[name][team], null, 2)}\n`, name);
    const json = query(w, 'rules', '--team', team, '--json');
    assert.equal(json.stdout, text.stdout, name);
    assert.deepEqual(snapshot(w.folder), before);
    clean(w);
  }
});

test('query rules --show-all with no team prints the whole file keyed by team; with --team it prints that entry', t => {
  const both = { ...TEMPLATES.parallel, ...TEMPLATES.scrum };
  const w = world(t, both);
  const all = query(w, 'rules', '--show-all');
  assert.equal(all.status, 0, all.stdout + all.stderr);
  assert.deepEqual(JSON.parse(all.stdout), both);
  assert.deepEqual(Object.keys(JSON.parse(all.stdout)), ['parallel', 'scrum']);
  assert.deepEqual(JSON.parse(query(w, 'rules', '--show-all', '--team', 'scrum').stdout), both.scrum);
});

test('query rules prints no credential, as text and as JSON, and keeps every key', t => {
  const teams = structuredClone(TEMPLATES.parallel);
  teams.parallel.rules.table.find(r => r.id === 'new').do.say = `see ${SECRET}\nnext`;
  const w = world(t, teams);
  for (const args of [[], ['--json']]) {
    const r = query(w, 'rules', ...BASE, ...args);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, NO_SECRET);
    const got = JSON.parse(r.stdout);
    assert.equal(got.rules.table.find(x => x.id === 'new').do.say, 'see https://host.example/x\nnext');
    assert.deepEqual(Object.keys(got), Object.keys(teams.parallel));
  }
});

test('query steps lists every step of the table with its arguments and each matching rule id once, for each shipped template', t => {
  for (const name of NAMES) {
    const team = teamOf(name);
    const entry = TEMPLATES[name][team];
    const w = world(t, TEMPLATES[name]);
    mkdirSync(w.folder, { recursive: true });
    const before = snapshot(w.folder);
    const expected = stepNames(entry).map(s => ({ step: s, args: stepArgs(entry, s), rules: entry.rules.table.filter(r => stepWords(r).some(x => x === '*' || x === s)).map(r => r.id) }));
    assert.ok(expected.length > 1, name);
    assert.deepEqual(JSON.parse(query(w, 'steps', '--team', team, '--json').stdout), expected, name);
    const text = query(w, 'steps', '--team', team);
    assert.equal(text.status, 0, text.stdout + text.stderr);
    assert.equal(text.stdout, expected.map(e => `${e.step}  takes: ${e.args.map(a => `--${a}`).join(', ') || 'no argument'}  rules: ${e.rules.join(', ')}\n`).join(''), name);
    assert.deepEqual(snapshot(w.folder), before);
    clean(w);
  }
  const w = world(t);
  assert.match(query(w, 'steps', ...BASE).stdout, /^adopt {2}takes: no argument {2}rules: /m);
  assert.match(query(w, 'steps', ...BASE).stdout, /^new {2}takes: .*--name.* {2}rules: /m);
});

test('a rule for every step (members-only) is listed under every step, once', t => {
  const rows = JSON.parse(query(world(t), 'steps', ...BASE, '--json').stdout);
  assert.ok(rows.length > 1);
  for (const row of rows) assert.equal(row.rules.filter(id => id === 'members-only').length, 1, row.step);
});

test('query steps prints no credential, as text and as JSON', t => {
  const teams = structuredClone(TEMPLATES.parallel);
  const rule = teams.parallel.rules.table.find(r => r.id === 'new');
  rule.id = SECRET;
  const w = world(t, teams);
  for (const args of [[], ['--json']]) {
    const r = query(w, 'steps', ...BASE, ...args);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, NO_SECRET);
    assert.match(r.stdout, /host\.example\/x/);
  }
});

test('query steps --show-all is the refusal of the one-team forms, exit 2, whatever the team file holds', t => {
  const w = seeded(t, [item(1)]);
  const r = query(w, 'steps', '--show-all');
  assert.equal(r.status, 2);
  assert.equal(r.stderr, '❌ backlog: --show-all acts over every team; backlog team query steps acts for one team: give --team <name> instead\n');
  assert.equal(r.stdout, '');
  clean(w);
});

test('query <item> --show-all with a team file that holds no team falls back to the item without a crash', t => {
  const w = world(t, {});
  putItem(w.folder, item(1, {}, { team: '' }), ENTRY);
  w.publish('seed');
  const r = query(w, '1', '--show-all');
  assert.doesNotMatch(r.stderr, /Cannot read properties/);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\[1\] 001-job/);
});

test('an item named plan, check, filter, rules or steps is reached by its number, and a flag value is no word of the router', t => {
  const w = seeded(t, [item(1)]);
  for (const word of ['rules', 'steps']) assert.equal(query(w, word, ...BASE).status, 0, word);
  assert.match(query(w, '1', ...BASE).stdout, /^\[1\] /);
  assert.equal(query(w, '--branch', 'rules', ...BASE).status, 0);
});

const WORDS = [['new'], ['update'], ['pop'], ['query'], ['query', 'check'], ['query', 'steps'], ['validate'], ['migrate']];
test('--help of every team word prints the help and exits 0 with a broken team file, a missing team file and a broken configuration', t => {
  const cases = {
    'a broken team file': w => writeFileSync(w.teamFile, '{ nope'),
    'a missing team file': w => rmSync(w.teamFile),
    'a broken configuration': w => writeFileSync(join(w.cons, '.backlog', 'config.json'), '{ nope')
  };
  for (const [what, damage] of Object.entries(cases)) {
    const w = world(t);
    damage(w);
    for (const words of WORDS) {
      const r = cli(['team', ...words, '--help'], { cwd: w.cons, tmp: w.tmp, plain: true });
      assert.equal(r.status, 0, `${words.join(' ')} with ${what}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /^backlog team/, `${words.join(' ')} with ${what}`);
    }
  }
});

test('--help of every team word outside any git repository prints the help, exits 0 and creates nothing', t => {
  const dir = mkdtempSync(join(tmpdir(), 'team-help-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, 'home'); const cwd = join(dir, 'plain');
  mkdirSync(home); mkdirSync(cwd);
  for (const words of WORDS) {
    const r = cli(['team', ...words, '--help'], { cwd, tmp: dir, plain: true, env: { SMOOTH_BACKLOG_CLI_HOME: home } });
    assert.equal(r.status, 0, `${words.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^backlog team/, words.join(' '));
  }
  assert.deepEqual(readdirSync(home), []);
  assert.deepEqual(readdirSync(cwd), []);
});

test('query rules and query steps read no item: they succeed with a corrupt item file in the folder, which the list refuses', t => {
  const w = seeded(t, [item(1)]);
  writeFileSync(join(w.folder, 'phases', '002-broken.json'), '{ not an item');
  assert.notEqual(query(w, ...BASE).status, 0);
  for (const word of ['rules', 'steps']) {
    const r = query(w, word, ...BASE);
    assert.equal(r.status, 0, `${word}: ${r.stdout}${r.stderr}`);
  }
});
