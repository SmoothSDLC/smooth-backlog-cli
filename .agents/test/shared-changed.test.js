// Item 027: the report of which items changed since the agent's last use, and the agents that use
// the backlog. The reference point is the agent's own last write or its own `query --changed`,
// stored under the reserved `~use` key of the agent's views file; a read never moves it.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const viewCache = (home, agent) => join(home, '.git', 'smooth-backlog-cli-views', `${createHash('sha256').update(agent).digest('hex')}.json`);
const useOf = (home, agent) => { try { return JSON.parse(readFileSync(viewCache(home, agent), 'utf8'))['~use'] ?? null; } catch { return null; } };
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// Two clones of the shared backlog (home = A's, home2 = B's) over one origin, both with acme/demo
// and items 001-alpha, 002-beta, 003-gamma, as in shared-stale.test.js.
function seed(items = ['alpha', 'beta', 'gamma']) {
  const t = mkdtempSync(join(tmpdir(), 'changed-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const folder = join(home, 'acme', 'demo');
  items.forEach((name, i) => store.write({
    path: join(folder, 'phases', `${String(i + 1).padStart(3, '0')}-${name}.md`),
    fm: {
      phase: `${String(i + 1).padStart(3, '0')}-${name}`, seq: i + 1, name: `Name ${name}`, objective: `obj ${name}`, summary: `sum ${name}`, status: 'pending', severity: 'normal',
      priority: i, repository: 'acme/demo', branch: 'main', commit: '', location: '', created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z',
      depends_on: [], claimed_by: '', claimed_at: '',
    },
    body: `\n# Phase ${i + 1}\n\nBody of ${name}.\n`,
  }, folder));
  const con = db.connect(folder); db.scan(con, folder); con.close();
  git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', 'fixture'); git(home, 'push', '-q');
  const home2 = join(t, 'home2');
  git(t, 'clone', '-q', join(t, 'origins', 'acme', 'backlog-repo.git'), home2);
  return { t, home, home2, cons, folder, folder2: join(home2, 'acme', 'demo'), bare: join(t, 'origins', 'acme', 'backlog-repo.git') };
}
// The CLI as the clone `home`; the agent is named by --agent/--by on the command.
const run = (f, home, args, opts = {}) => cli(args, { cwd: opts.cwd ?? f.cons, tmp: f.t, env: { BACKLOG_HOME: home, QWEN_CODE_AGENT_ID: '', USER: 'nobody', ...opts.env } });

test('027: a change another agent makes while this agent is idle appears in its next --changed report, with the reference commit and time', () => {
  const f = seed();
  const first = run(f, f.home, ['query', '--changed', '--agent', 'amy']);
  assert.equal(first.status, 0, first.stderr + first.stdout);
  const reference = git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'); // amy's reference is the clone's HEAD at her last use
  assert.equal(useOf(f.home, 'amy').commit, reference);
  // while amy is idle, bob changes item 2 in his own clone
  const bob = run(f, f.home2, ['update', '2', '--append', 'from bob', '--by', 'bob']);
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  const refAfter = git(f.t, '--git-dir', f.bare, 'rev-parse', 'main');
  const r = run(f, f.home, ['query', '--changed', '--agent', 'amy', '--json']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = JSON.parse(r.stdout);
  assert.equal(out.reference.commit, reference, 'the reference is the agent own last use, never a global timestamp');
  assert.match(out.reference.at, /^\d{4}-\d\d-\d\dT[\d:]+Z$/);
  assert.deepEqual(out.others.map(x => x.slug), ['002-beta']);
  assert.equal(out.others[0].status, 'M');
  assert.equal(out.others[0].updated_by, 'bob');
  assert.deepEqual(out.held, []);
  // the text form of the next report states the reference and the one line per item
  const bob2 = run(f, f.home2, ['update', '3', '--append', 'from bob again', '--by', 'bob']);
  assert.equal(bob2.status, 0, bob2.stderr + bob2.stdout);
  const text = run(f, f.home, ['query', '--changed', '--agent', 'amy']);
  assert.equal(text.status, 0, text.stderr + text.stdout);
  assert.ok(text.stdout.includes(`reference: ${refAfter} at `), text.stdout);
  assert.match(text.stdout, /changed: 003-gamma \(M\) by bob at /);
  // amy's own --changed moved her reference: the same change is not reported twice
  const again = run(f, f.home, ['query', '--changed', '--agent', 'amy', '--json']);
  assert.equal(again.status, 0, again.stderr);
  const second = JSON.parse(again.stdout);
  assert.deepEqual(second.held, []);
  assert.deepEqual(second.others, []);
});

test('027: items the agent holds are listed apart from the other changed items', () => {
  const f = seed();
  assert.equal(run(f, f.home, ['query', '--changed', '--agent', 'amy']).status, 0);
  // the seed items are incomplete for a team claim, so the claim is written as a holder write would be
  const file = join(f.folder, 'phases', '001-alpha.md');
  const doc = parse(readFileSync(file, 'utf8'));
  store.write({ path: file, fm: { ...doc.fm, claimed_by: 'amy', claimed_at: '2026-10-02T00:00:00Z' }, body: doc.body }, f.folder);
  git(f.home, 'add', '-A'); git(f.home, 'commit', '-q', '-m', 'claimed'); git(f.home, 'push', '-q');
  assert.equal(run(f, f.home2, ['update', '1', '--append', 'bob on 1', '--by', 'bob']).status, 0);
  assert.equal(run(f, f.home2, ['update', '2', '--append', 'bob on 2', '--by', 'bob']).status, 0);
  const r = run(f, f.home, ['query', '--changed', '--agent', 'amy', '--json']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.held.map(x => x.slug), ['001-alpha'], 'the item the agent holds is in held');
  assert.deepEqual(out.others.map(x => x.slug), ['002-beta'], 'the item the agent does not hold is in others');
  // the text form of the next report: the same split into held and others
  assert.equal(run(f, f.home2, ['update', '1', '--append', 'bob on 1 again', '--by', 'bob']).status, 0);
  assert.equal(run(f, f.home2, ['update', '2', '--append', 'bob on 2 again', '--by', 'bob']).status, 0);
  const text = run(f, f.home, ['query', '--changed', '--agent', 'amy']);
  assert.equal(text.status, 0, text.stderr + text.stdout);
  const heldSection = text.stdout.slice(text.stdout.indexOf('held:'), text.stdout.indexOf('others:'));
  assert.match(heldSection, /changed: 001-alpha \(M\) by bob at /);
  assert.doesNotMatch(heldSection, /002-beta/, 'the held section holds only the items the agent holds');
  assert.match(text.stdout.slice(text.stdout.indexOf('others:')), /changed: 002-beta \(M\) by bob at /);
});

test('027: no change since the last use gives an empty result that states its reference', () => {
  const f = seed();
  assert.equal(run(f, f.home, ['query', '--changed', '--agent', 'amy']).status, 0);
  const reference = git(f.t, '--git-dir', f.bare, 'rev-parse', 'main');
  const r = run(f, f.home, ['query', '--changed', '--agent', 'amy', '--json']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = JSON.parse(r.stdout);
  assert.equal(out.reference.commit, reference);
  assert.match(out.reference.at, /^\d{4}-\d\d-\d\dT[\d:]+Z$/);
  assert.deepEqual(out.held, []);
  assert.deepEqual(out.others, []);
  const text = run(f, f.home, ['query', '--changed', '--agent', 'amy']);
  assert.equal(text.status, 0, text.stderr + text.stdout);
  assert.ok(text.stdout.includes(`reference: ${reference} at `), text.stdout);
  assert.match(text.stdout, /no changes since the last use/);
  assert.doesNotMatch(text.stdout, /changed: /);
});

test('027: reading an item does not move the reference, the agent own write does', () => {
  const f = seed();
  const first = run(f, f.home, ['query', '--changed', '--agent', 'amy']);
  assert.equal(first.status, 0, first.stderr + first.stdout);
  const before = useOf(f.home, 'amy');
  assert.ok(before && before.commit);
  const read = run(f, f.home, ['query', '--phase', '001-alpha', '--agent', 'amy']);
  assert.equal(read.status, 0, read.stderr + read.stdout);
  assert.deepEqual(useOf(f.home, 'amy'), before, 'a read does not move the reference');
  const write = run(f, f.home, ['update', '1', '--append', 'amy wrote', '--by', 'amy']);
  assert.equal(write.status, 0, write.stderr + write.stdout);
  const after = useOf(f.home, 'amy');
  assert.notEqual(after.commit, before.commit, 'the agent own write moves the reference');
  assert.equal(after.commit, git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'));
});

test('027: the first --changed of an agent prints no earlier use and sets the reference', () => {
  const f = seed();
  assert.equal(existsSync(viewCache(f.home, 'amy')), false);
  const r = run(f, f.home, ['query', '--changed', '--agent', 'amy']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /no earlier use: reference set now/);
  assert.doesNotMatch(r.stdout, /changed: /);
  const use = useOf(f.home, 'amy');
  assert.equal(use.agent, 'amy');
  assert.equal(use.commit, git(f.t, '--git-dir', f.bare, 'rev-parse', 'main'));
  assert.match(use.at, /^\d{4}-\d\d-\d\dT[\d:]+Z$/);
});

test('027: the report lists the other agents with a last-use time', () => {
  const f = seed();
  assert.equal(run(f, f.home, ['query', '--changed', '--agent', 'amy']).status, 0);
  const bob = run(f, f.home, ['update', '2', '--append', 'from bob', '--by', 'bob']); // bob uses this clone
  assert.equal(bob.status, 0, bob.stderr + bob.stdout);
  const r = run(f, f.home, ['query', '--changed', '--agent', 'amy', '--json']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = JSON.parse(r.stdout);
  const byName = Object.fromEntries(out.agents.map(x => [x.name, x.last_use]));
  assert.equal(typeof byName.bob, 'string', 'bob, who used the backlog, is listed with his last-use time');
  assert.match(byName.bob, /^\d{4}-\d\d-\d\dT[\d:]+Z$/);
  assert.equal(byName.amy, useOf(f.home, 'amy').at);
  const text = run(f, f.home, ['query', '--changed', '--agent', 'amy']);
  assert.equal(text.status, 0, text.stderr + text.stdout);
  assert.match(text.stdout, /bob last used \d{4}-\d\d-\d\dT[\d:]+Z/);
});

test('027: --json has the keys agent, reference, held, others, agents', () => {
  const f = seed();
  assert.equal(run(f, f.home, ['query', '--changed', '--agent', 'amy']).status, 0);
  assert.equal(run(f, f.home2, ['update', '2', '--append', 'from bob', '--by', 'bob']).status, 0);
  const r = run(f, f.home, ['query', '--changed', '--agent', 'amy', '--json']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out).sort(), ['agent', 'agents', 'held', 'others', 'reference']);
  assert.equal(out.agent, 'amy');
  assert.deepEqual(Object.keys(out.reference).sort(), ['at', 'commit']);
  assert.match(out.reference.commit, /^[0-9a-f]{40}$/);
  assert.ok(Array.isArray(out.held) && Array.isArray(out.others) && Array.isArray(out.agents));
  assert.ok(out.agents.some(x => x.name === 'amy' && typeof x.last_use === 'string'));
});
