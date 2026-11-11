// `backlog team query plan`: what each person of the team would be offered by pop, one line per person, without taking anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, git, putItem, world } from './team-fixture.js';

const ENTRY = TEMPLATES.parallel.parallel;
const TEAM = ['--team', 'parallel'];
const item = seq => ({ seq, slug: `${String(seq).padStart(3, '0')}-job`, name: 'job', team: 'parallel', repository: 'acme/app', branch: 'main', fields: { status: 'ready', estimate: 5, holder: '', checker: '', parent: null, children: [], depends_on: [], handoff: '', rounds: 0 } });
const plan = (w, ...rest) => w.run(['plan', ...TEAM, ...rest], {}, 'query');
function seeded(t, seqs) {
  const w = world(t);
  for (const s of seqs) putItem(w.folder, item(s), ENTRY);
  if (seqs.length) w.publish('seed');
  return w;
}

test('three open items and four people: one line per person in name order, no item offered twice, nothing written', t => {
  const w = seeded(t, [1, 2, 3]);
  const head = git(w.home, 'rev-parse', 'HEAD');
  const r = plan(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.trimEnd().split('\n');
  assert.deepEqual(lines.map(l => l.split(':')[0]), ['lead-1', 'member-1', 'member-2', 'member-3']);
  const offered = lines.filter(l => !l.endsWith(': idle')).map(l => l.match(/^\S+: \S+ \[(\d+)\] (\S+) \(pop entry [\w-]+, rule [\w-]+\)$/));
  assert.ok(offered.every(Boolean), r.stdout);
  assert.equal(offered.length, 3, r.stdout);
  assert.equal(new Set(offered.map(m => m[1])).size, offered.length);
  assert.equal(git(w.home, 'status', '--porcelain', '-uall'), '');
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), head);
  assert.equal(w.item(1).fields.status, 'ready');
});

test('--json: a list of { person, action, item, entry, rule }, null for idle', t => {
  const w = seeded(t, [1, 2, 3]);
  const out = JSON.parse(plan(w, '--json').stdout);
  assert.deepEqual(out.map(o => o.person), ['lead-1', 'member-1', 'member-2', 'member-3']);
  for (const o of out) assert.deepEqual(Object.keys(o), ['person', 'action', 'item', 'entry', 'rule']);
  const idle = out.filter(o => o.action === null);
  assert.equal(idle.length, 1);
  assert.deepEqual(Object.values(idle[0]).slice(1), [null, null, null, null]);
  assert.equal(new Set(out.filter(o => o.item !== null).map(o => o.item)).size, 3);
});

test('an empty queue prints every person idle with exit 0, and nothing is written', t => {
  const w = seeded(t, []);
  const r = plan(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'lead-1: idle\nmember-1: idle\nmember-2: idle\nmember-3: idle\n');
  assert.equal(git(w.home, 'status', '--porcelain', '-uall'), '');
  assert.equal(JSON.parse(plan(w, '--json').stdout).every(o => o.action === null && o.item === null), true);
});

test('--show-all is refused like the other one-team forms, and a stray word is unrecognized', t => {
  const w = seeded(t, []);
  assert.equal(w.run(['plan', '--show-all'], {}, 'query').status, 2);
  const r = plan(w, 'extra');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unrecognized arguments: extra/);
});
