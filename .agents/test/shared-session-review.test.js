// Tests for item 082, slice B: the self-review block is per session name. claim and --request-review record the
// session name in a new front-matter list session_authors (kept on release, like review_author); the session that
// claimed or asked cannot review (the refusal says the same session cannot review its own work, a new session may),
// and a new session (a new name) may. Items without session names keep the old agent-name rule. Local bare repos only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, intoTeam, itemPath, itemRel, sharedBacklog, teamMembers, GIT_IDENTITY, changeItem } from './shared-fixtures.js';
import { mkdirSync } from 'node:fs';
import * as store from '../../src/shared/store.js';
import { installSeam } from '../../src/team/team.js';

installSeam(); // this file reads items made by the old team commands in this process, with their earlier words

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

const A1 = '082aa:01'; // the session that builds and asks
const A2 = '082aa:02'; // a new session of the same card
const B1 = '082bb:01'; // a new session of another card

const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'session-review-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer' }] } })); // t1 asks one peer review of its work
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}

const DOD = '## Definition of done\n\n- [ ] the test\'s check holds';
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  // SMOOTH_BACKLOG_CLI_SESSION stays out: these tests pin the agent-name rules, not the author-session rule (item 088),
  // which a session id inherited from the running shell would apply to the session names
  const o = { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', SMOOTH_BACKLOG_CLI_SESSION: '', ...env } };
  if (args[0] === 'update' && reader(args)) cli(['show', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text) => { const r = run(f, args); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
// team: the item belongs to t1, which team pop and the team views need to reach it
const make = (f, team = true) => { const slug = ok(f, ['new', ...NEW('review session')]).stdout.split('created phase ')[1].split(' ')[0]; return team ? intoTeam(slug, { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', SMOOTH_BACKLOG_CLI_SESSION: '' } }) : slug; };
const itemFm = (f, slug) => store.load(f.folder).find(i => i.path === itemRel(slug)).fm;
// the setup of every test: the building session claims and asks for the review
const setup = (f, team = true) => { const s = make(f, team); ok(f, ['update', s, '--claim', A1]); ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A1]); return s; };

test('082: 082aa:01 claims and asks for a review; 082aa:02 starts and passes it', () => {
  const f = fixture();
  const s = setup(f);
  ok(f, ['update', s, '--start-review', '--by', A2]);
  ok(f, ['update', s, '--review', 'pass', '--by', A2, '--comments', 'fine per references/review/code.md']);
  const fm = itemFm(f, s);
  assert.equal(fm.review_state, 'passed');
  assert.equal(fm.review_author, A1); // the one who asked survives
  assert.deepEqual(fm.session_authors, [A1]); // the claiming and asking session, recorded once
});

test('082: 082aa:01 is refused --start-review and --review with the same-session message', () => {
  const f = fixture();
  const s = setup(f);
  no(f, ['update', s, '--start-review', '--by', A1], `${A1}: the same session cannot review its own work; a new session may`);
  no(f, ['update', s, '--review', 'pass', '--by', A1, '--comments', 'fine per references/review/code.md'], `${A1}: the same session cannot review its own work; a new session may`);
  const fm = itemFm(f, s);
  assert.equal(fm.review_state, 'requested'); // neither refusal changed the item
});

test('082: pop, work and query --reviewable offer the review to 082aa:02 and 082bb:01, never to 082aa:01', () => {
  const f = fixture();
  const s = setup(f, true);
  const reviewable = (agent) => run(f, ['team', 'query', '--team', 't1', '--reviewable', '--agent', agent]).stdout;
  assert.ok(reviewable(A2).includes(s), 'offered to the new session of the card');
  assert.ok(reviewable(B1).includes(s), 'offered to the other card');
  assert.ok(!reviewable(A1).includes(s), 'never offered to the asking session');
  // team pop starts the review for the session that asks (so only one of the two new sessions can ask first); 082aa:01 gets no review action
  assert.notEqual(JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', A1, '--json']).stdout).action, 'review');
  // work starts the review for the new session of the card
  const w = JSON.parse(run(f, ['team', 'pop', '--team', 't1', '--agent', A2, '--json']).stdout);
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
  ok(f, ['update', s, '--claim', 'ann']);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', 'ann']);
  no(f, ['update', s, '--start-review', '--by', 'ann'], 'the same session cannot review its own work');
  ok(f, ['update', s, '--start-review', '--by', 'bob']);
  ok(f, ['update', s, '--review', 'pass', '--by', 'bob', '--comments', 'fine per references/review/code.md']);
  const fm = itemFm(f, s);
  assert.equal(fm.review_state, 'passed');
  assert.deepEqual(fm.session_authors, ['ann']);
});

test('082: the lead requests the review of a claimed item: its session is recorded and it cannot review its own request', () => {
  const f = fixture();
  const s = make(f);
  ok(f, ['update', s, '--claim', A1]);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', 'lead']); // a session other than the claimer asks
  const fm = itemFm(f, s);
  assert.equal(fm.review_author, 'lead', 'the one who asked is recorded, not the claimer');
  assert.deepEqual(fm.session_authors, [A1, 'lead'], 'the claimer and the requester are both recorded');
  no(f, ['update', s, '--start-review', '--by', 'lead'], `lead: the same session cannot review its own work; a new session may`);
  no(f, ['update', s, '--review', 'pass', '--by', 'lead', '--comments', 'fine per references/review/code.md'], `lead: the same session cannot review its own work; a new session may`);
  // a new session of the card may review the request
  ok(f, ['update', s, '--start-review', '--by', A2]);
  ok(f, ['update', s, '--review', 'pass', '--by', A2, '--comments', 'fine per references/review/code.md']);
  assert.equal(itemFm(f, s).review_state, 'passed');
});

test('082: a pass by a session-named reviewer is recorded with the work commit', () => {
  const f = fixture();
  const s = setup(f); // A1 claims and asks
  const commit = 'a'.repeat(40);
  ok(f, ['update', s, '--commit', commit]); // the item's commit record: it does not drive the gate
  ok(f, ['update', s, '--start-review', '--by', A2]);
  ok(f, ['update', s, '--review', 'pass', '--by', A2, '--comments', 'fine per references/review/code.md']);
  // the pass is recorded against the work commit - the working repository's HEAD at review time - not the commit record
  assert.deepEqual([].concat(itemFm(f, s).reviews), [`${A2} ${git(f.cons, 'rev-parse', 'HEAD')}`]);
});

test('082: query --plan offers the requested review to the new session of the card, never to the asking session', () => {
  const f = fixture();
  const s = setup(f, true); // A1 claims and asks
  teamMembers(f.home, 't1', [A2, B1, A1]);
  const out = run(f, ['team', 'query', '--team', 't1', '--plan']).stdout;
  const line = out.split('\n').find(l => l.includes(`review ${s}`));
  assert.ok(line, `the plan offers the review: ${out}`);
  assert.ok(line.startsWith(`${A2}: review ${s}`), `offered to the first session that is not an authoring one: ${line}`);
  assert.ok(!out.split('\n').some(l => l.startsWith(`${A1}: review ${s}`)), 'never offered to the asking session');
});

test('082: in a team session the author session is the session name, not the team name', () => {
  const f = fixture();
  const s = make(f);
  ok(f, ['update', s, '--claim', A1], { SMOOTH_BACKLOG_CLI_AGENT: A1 }); // a team session, no session id
  assert.equal(itemFm(f, s).author_session, A1, 'the claim records the session name as the author session, not the team name');
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A1], { SMOOTH_BACKLOG_CLI_AGENT: A1 });
  // a fresh session of the same team: a different session name, the same team in SMOOTH_BACKLOG_CLI_AGENT
  ok(f, ['update', s, '--start-review', '--by', B1], { SMOOTH_BACKLOG_CLI_AGENT: B1 });
  ok(f, ['update', s, '--review', 'pass', '--by', B1, '--comments', 'fine per references/review/code.md'], { SMOOTH_BACKLOG_CLI_AGENT: B1 });
  assert.equal(itemFm(f, s).review_state, 'passed', 'the verdict of a fresh session of the same team is accepted');
});

test('082: a reassignment keeps the former holder blocked: the legacy item keeps its self-review rule', () => {
  const f = fixture();
  const s = make(f);
  ok(f, ['update', s, '--claim', A1]);
  // an item claimed before session_authors existed: the list is not in the file
  const file = itemPath(f.folder, s);
  changeItem(file, { fm: { session_authors: undefined } });
  assert.equal(itemFm(f, s).session_authors, undefined, 'the fixture item has no session_authors');
  ok(f, ['update', s, '--reassign', A2, '--by', 'lead', '--reason', 'the earlier session ended']);
  const fm = itemFm(f, s);
  assert.equal(fm.claimed_by, A2);
  assert.deepEqual(fm.session_authors, [A1, A2], 'the reassignment keeps the former holder and the new holder in the list');
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', 'lead']);
  const r = run(f, ['update', s, '--start-review', '--by', A1]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^❌ ${s}: ${A1}: the same session cannot review its own work; a new session may\\n$`));
});

test('082: a legacy item keeps its original author in session_authors across every holder or review-request write', () => {
  // Each row starts from a legacy item: one claimed by 082aa:01 before session_authors existed, so the list is
  // not in the file. The row runs the one write that changes or clears the holder or records a review request;
  // the write must seed the list from the item's current holder and review requester and add the session it
  // names, so the self-review block of the earlier session survives the transition (a release
  // after a lead's review request erased the original author of such an item).
  const legacy = (f, s) => {
    const file = itemPath(f.folder, s);
    changeItem(file, { fm: { session_authors: undefined } });
    assert.equal(itemFm(f, s).session_authors, undefined, 'the fixture item has no session_authors');
  };
  const refuse = (f, s, by) => no(f, ['update', s, '--start-review', '--by', by], 'the same session cannot review its own work');
  const rows = [
    ['a new claim of an unclaimed item', (f, s) => {
      // the holder released it before the list existed (a released team item in review is not claimed again, so no review is asked for)
      ok(f, ['update', s, '--release', A1]);
      ok(f, ['update', s, '--claim', B1]);
      return [A1, B1];
    }, (f, s) => refuse(f, s, A1)],
    ['a continuation claim', (f, s) => {
      ok(f, ['update', s, '--claim', A2]);
      return [A1, A2];
    }, (f, s) => { ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A2]); refuse(f, s, A1); }],
    ['a reassignment', (f, s) => {
      ok(f, ['update', s, '--reassign', B1, '--by', 'lead', '--reason', 'the earlier session ended']);
      return [A1, B1];
    }, (f, s) => { ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', B1]); refuse(f, s, A1); }],
    ['a release', (f, s) => {
      ok(f, ['update', s, '--release', A1]);
      return [A1];
    }, (f, s) => { ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', 'lead']); refuse(f, s, A1); }],
    ['a review request by the lead', (f, s) => {
      ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', 'lead']);
      return [A1, 'lead'];
    }, (f, s) => refuse(f, s, A1)],
    ['a team pop continuation claim', (f, s) => {
      // the lead's own work item carries no stage (the team's split items do): the pop continues it
      const file = itemPath(f.folder, s); changeItem(file, { fm: { stage: undefined, refiner: undefined } });
      const p = run(f, ['team', 'pop', '--team', 't1', '--json'], { SMOOTH_BACKLOG_CLI_TEAM_LEAD: A2, SMOOTH_BACKLOG_CLI_AGENT: A2 });
      assert.equal(p.status, 0, p.stdout + p.stderr);
      return [A1, A2];
    }, (f, s) => { ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A2]); refuse(f, s, A1); }],
  ];
  const failures = [];
  for (const [name, write, check] of rows) {
    const f = fixture();
    const s = make(f);
    ok(f, ['update', s, '--claim', A1]);
    legacy(f, s);
    try {
      const expected = write(f, s);
      assert.deepEqual(itemFm(f, s).session_authors, expected, `${name}: the list is ${JSON.stringify(itemFm(f, s).session_authors)}`);
      check(f, s);
    } catch (e) { failures.push(`${name}: ${String(e.message).split('\n')[0]}`); }
  }
  assert.deepEqual(failures, [], `rows that lost the original author:\n${failures.join('\n')}`);
});
