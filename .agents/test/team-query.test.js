// `backlog team query` (the list), `query <item>` and `query filter <name>`: the team's items as the rules read them. Nothing is written in the clone or published;
// the cases of the filters are replayed in team-commands.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as index from '../../src/shared/index.js';
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
  const any = query(w, '2', '--show-all');
  assert.equal(any.status, 0, any.stdout + any.stderr);
  assert.match(any.stdout, /^\[2\] 002-job/);
  assert.equal(query(w, '3', '--show-all').status, 0);
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
