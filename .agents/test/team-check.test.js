// `backlog team query check <item> <step>`: the answer of the team's rules for a step, without taking it. Nothing is written in the clone or published; the cases of the rules
// are replayed in team-commands.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cli } from './shared-fixtures.js';
import { TEMPLATES, git, putItem, world } from './team-fixture.js';

const ENTRY = TEMPLATES.parallel.parallel;
const BASE = ['--team', 'parallel', '--agent', 'member-1'];
const QUIET = Object.fromEntries(['TEAM_NAME', 'TEAM_REPOSITORY', 'TEAM_BRANCH', 'AGENT', 'SESSION'].map(n => [`SMOOTH_BACKLOG_CLI_${n}`, '']));
const item = (seq, fields = {}, extra = {}) => ({ seq, slug: `${String(seq).padStart(3, '0')}-job`, name: 'job', team: 'parallel', repository: 'acme/app', branch: 'main', fields: { status: 'ready', estimate: 5, holder: '', checker: '', parent: null, children: [], depends_on: [], handoff: '', rounds: 0, ...fields }, ...extra });
const check = (w, ...rest) => w.run(['check', ...rest], {}, 'query');
function seeded(t, items = [item(1)]) {
  const w = world(t);
  for (const i of items) putItem(w.folder, i, ENTRY);
  w.publish('seed');
  return w;
}

test('check writes nothing in the clone and publishes nothing, and the answer is the rule\'s allowance with its changes', t => {
  const w = seeded(t);
  const head = git(w.home, 'rev-parse', 'HEAD'); const bare = git(w.bare, 'rev-parse', 'HEAD');
  const r = check(w, '1', 'claim', ...BASE);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'allowed by rule claim: status: ready -> in progress; holder: "" -> member-1\n');
  assert.equal(r.stderr, '');
  assert.equal(git(w.home, 'status', '--porcelain', '-uall'), '');
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), head);
  assert.equal(git(w.bare, 'rev-parse', 'HEAD'), bare);
  assert.equal(w.item(1).fields.status, 'ready');
});

test('a read proceeds like validate: the copy, the record and the SHA are written, even when the answer is a refusal', t => {
  const w = seeded(t);
  const r = check(w, '1', 'release', ...BASE);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^refused by rule release-who: /);
  assert.equal(w.records().length, 2);
  assert.match(w.config().teams_file_sha, /^[0-9a-f]{64}$/);
});

test('a refusal of the rules is "refused by rule <id>: <text>" with exit 0, the text without the rule suffix', t => {
  const w = seeded(t, [item(1, { status: 'in progress', holder: 'member-2' })]);
  const r = check(w, '1', 'release', ...BASE);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^refused by rule release-who: .+\n$/);
  assert.doesNotMatch(r.stdout, /\(rule release-who\)/);
});

test('an archived item, an item of another team, and an argument the step does not take are refused by rule "-"', t => {
  const w = seeded(t, [item(1), item(2, {}, { archived: true }), item(3, {}, { team: 'other' })]);
  assert.match(check(w, '2', 'claim', ...BASE).stdout, /^refused by rule -: item 2 is archived/);
  assert.match(check(w, '3', 'claim', ...BASE).stdout, /^refused by rule -: item 3 belongs to team other/);
  const r = check(w, '1', 'claim', ...BASE, '--x', '1');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'refused by rule -: step claim takes no --x\n');
});

test('an unknown step is exit 2 with the text of team update; --show-all is exit 2 with the text of the inputs; no item is exit 1', t => {
  const w = seeded(t);
  const r = check(w, '1', 'nope', ...BASE);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^❌ backlog: team parallel has no step nope \(steps: /);
  const all = check(w, '1', 'claim', '--show-all');
  assert.equal(all.status, 2);
  assert.equal(all.stderr, '❌ backlog: --show-all acts over every team; backlog team query check acts for one team: give --team <name> instead\n');
  const none = check(w, '9', 'claim', ...BASE);
  assert.equal(none.status, 1);
  assert.equal(none.stdout, '❌ no item 9\n');
});

test('the item by number, padded number or slug gives the same answer; a number two items hold is refused naming both', t => {
  const w = seeded(t);
  const answers = ['1', '001', '001-job'].map(i => check(w, i, 'claim', ...BASE));
  for (const a of answers) assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(new Set(answers.map(a => a.stdout)).size, 1);
  const dup = seeded(t, [item(1), item(1, {}, { slug: '001-other', archived: true })]);
  const r = check(dup, '1', 'claim', ...BASE);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /number 1 names two items, 001-job and 001-other/);
});

test('from a subdirectory of the checkout the answer is the same as from its top', t => {
  const w = seeded(t);
  const top = check(w, '1', 'claim', ...BASE);
  mkdirSync(join(w.cons, 'src'), { recursive: true });
  const sub = cli(['team', 'query', 'check', '1', 'claim', ...BASE], { cwd: join(w.cons, 'src'), tmp: w.tmp, plain: true, env: QUIET });
  assert.equal(sub.status, 0, sub.stdout + sub.stderr);
  assert.equal(sub.stdout, top.stdout);
});

test('without an agent the answer is the rules\' verdict for an empty caller', t => {
  const w = seeded(t);
  const r = check(w, '1', 'claim', '--team', 'parallel');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^refused by rule members-only: /);
});

test('--json: allowed, rule, changes, related and text', t => {
  const w = seeded(t);
  const ok = JSON.parse(check(w, '1', 'claim', ...BASE, '--json').stdout);
  assert.deepEqual(Object.keys(ok), ['allowed', 'rule', 'changes', 'related', 'text']);
  assert.deepEqual([ok.allowed, ok.rule, ok.changes, ok.related], [true, 'claim', { status: ['ready', 'in progress'], holder: ['', 'member-1'] }, {}]);
  assert.equal(ok.text, 'allowed by rule claim: status: ready -> in progress; holder: "" -> member-1');
  const no = JSON.parse(check(w, '1', 'claim', '--team', 'parallel', '--json').stdout);
  assert.deepEqual([no.allowed, no.rule, no.changes, no.related], [false, 'members-only', {}, {}]);
  assert.match(no.text, /^refused by rule members-only: /);
  const coded = JSON.parse(check(w, '1', 'claim', ...BASE, '--x', '1', '--json').stdout);
  assert.deepEqual([coded.allowed, coded.rule, coded.text], [false, null, 'refused by rule -: step claim takes no --x']);
});

test('--json is printed as serialized: a URL value followed by an email value keeps every field as stored', t => {
  const w = seeded(t, [item(1, { status: 'in progress', holder: 'member-1', handoff: 'https://example.com' })]);
  const r = check(w, '1', 'hand-to-check', ...BASE, '--note', 'a@b.c', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.changes.handoff, ['https://example.com', 'a@b.c']);
  assert.equal(out.changes.status[1], 'checking');
});

test('a repository id that leaves the home (../x, a/..) is refused with exit 2, from the variable and from --repository, in check and plan, and nothing is created', t => {
  const w = seeded(t);
  const head = git(w.home, 'rev-parse', 'HEAD');
  const forms = [
    [['check', '1', 'claim', ...BASE], { SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: '../x' }, '../x'],
    [['plan', '--team', 'parallel'], { SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: '../x' }, '../x'],
    [['check', '1', 'claim', ...BASE, '--repository', '../x'], {}, '../x'],
    [['plan', '--team', 'parallel', '--repository', 'a/..'], {}, 'a/..'],
  ];
  for (const [args, env, id] of forms) {
    const r = w.run(args, env, 'query');
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.ok(r.stderr.startsWith(`❌ backlog: not an owner/name repository id: ${id}`), r.stderr);
  }
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), head);
  assert.equal(git(w.home, 'status', '--porcelain', '-uall'), '');
  assert.ok(!existsSync(join(w.tmp, 'x')) && !existsSync(join(w.tmp, 'a')), 'nothing outside the home was created');
});
