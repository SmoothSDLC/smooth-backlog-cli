// Tests for item 082, slice B: the self-review block is per session name. claim and --request-review record the
// session name in a new front-matter list session_authors (kept on release, like review_author); the session that
// claimed or asked cannot review (the refusal says the same session cannot review its own work, a new session may),
// and a new session (a new name) may. Items without session names keep the old agent-name rule. Local bare repos only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { mkdirSync } from 'node:fs';
import * as store from '../../src/shared/store.js';

const A1 = '082k0c:01'; // the session that builds and asks
const A2 = '082k0c:02'; // a new session of the same card
const B1 = '082k03:01'; // a new session of another card

const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'session-review-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}

const DOD = '## Definition of done\n\n- [ ] the test\'s check holds';
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args) => {
  const o = { cwd: f.cons, tmp: f.t, env: { TEAM_LEAD: 'lead' } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args) => { const r = run(f, args); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text) => { const r = run(f, args); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const make = f => { const slug = ok(f, ['new', ...NEW('review session')]).stdout.split('created phase phases/')[1].split('.md')[0]; return slug; };
const itemFm = (f, slug) => store.load(f.folder).find(i => i.path === `phases/${slug}.md`).fm;
// the setup of every test: the building session claims and asks for the review
const setup = f => { const s = make(f); ok(f, ['update', s, '--claim', A1]); ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A1]); return s; };

test('082: 082k0c:01 claims and asks for a review; 082k0c:02 starts and passes it', () => {
  const f = fixture();
  const s = setup(f);
  ok(f, ['update', s, '--start-review', '--by', A2]);
  ok(f, ['update', s, '--review', 'pass', '--by', A2, '--comments', 'fine per references/review/code.md']);
  const fm = itemFm(f, s);
  assert.equal(fm.review_state, 'passed');
  assert.equal(fm.review_author, A1); // the one who asked survives
  assert.deepEqual(fm.session_authors, [A1]); // the claiming and asking session, recorded once
});

test('082: 082k0c:01 is refused --start-review and --review with the same-session message', () => {
  const f = fixture();
  const s = setup(f);
  no(f, ['update', s, '--start-review', '--by', A1], `${A1}: the same session cannot review its own work; a new session may`);
  no(f, ['update', s, '--review', 'pass', '--by', A1, '--comments', 'fine per references/review/code.md'], `${A1}: the same session cannot review its own work; a new session may`);
  const fm = itemFm(f, s);
  assert.equal(fm.review_state, 'requested'); // neither refusal changed the item
});

test('082: pop, work and query --reviewable offer the review to 082k0c:02 and 082k03:01, never to 082k0c:01', () => {
  const f = fixture();
  const s = setup(f);
  const reviewable = (agent) => run(f, ['query', '--reviewable', '--agent', agent]).stdout;
  assert.ok(reviewable(A2).includes(s), 'offered to the new session of the card');
  assert.ok(reviewable(B1).includes(s), 'offered to the other card');
  assert.ok(!reviewable(A1).includes(s), 'never offered to the asking session');
  // pop offers it to both new sessions; 082k0c:01 gets no review action
  assert.equal(JSON.parse(run(f, ['pop', '--agent', A2, '--json']).stdout).action, 'review');
  assert.equal(JSON.parse(run(f, ['pop', '--agent', B1, '--json']).stdout).action, 'review');
  assert.notEqual(JSON.parse(run(f, ['pop', '--agent', A1, '--json']).stdout).action, 'review');
  // work starts the review for the new session of the card
  const w = JSON.parse(run(f, ['work', '--agent', A2, '--json']).stdout);
  assert.equal(w.action, 'review');
  assert.ok(w.marked, 'work marks the review start for the new session');
  assert.equal(itemFm(f, s).reviewer, A2);
});

test('082: a release keeps session_authors', () => {
  const f = fixture();
  const s = setup(f);
  ok(f, ['update', s, '--release', A1]);
  const fm = itemFm(f, s);
  assert.equal(fm.claimed_by, '');
  assert.equal(fm.review_author, A1); // as today
  assert.deepEqual(fm.session_authors, [A1]); // the release does not drop the recorded sessions
});

test('082: an item without session names keeps the old agent-name rule', () => {
  const f = fixture();
  const s = make(f);
  ok(f, ['update', s, '--claim', 'cody-card1']);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', 'cody-card1']);
  no(f, ['update', s, '--start-review', '--by', 'cody-card1'], 'the same session cannot review its own work');
  ok(f, ['update', s, '--start-review', '--by', 'cody-card2']);
  ok(f, ['update', s, '--review', 'pass', '--by', 'cody-card2', '--comments', 'fine per references/review/code.md']);
  const fm = itemFm(f, s);
  assert.equal(fm.review_state, 'passed');
  assert.deepEqual(fm.session_authors, ['cody-card1']);
});
