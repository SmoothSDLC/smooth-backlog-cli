// Tests for item 082, slice C: a new session of the same card continues the item its earlier session
// claimed (a rework after review, or the close): the claim records the new session name on the item, with
// no takeover and no lead reassignment, and the self-review block still applies to every earlier session.
// Owner design 2026-10-31: session names <item 3 digits><card id>:<increment 2 digits> (082aa:01), teams
// join their card ids with colons (t07:09:1a). HOME is a temporary folder: the real ~/.qwen/teams is never
// read or written. Local bare repos only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog, GIT_IDENTITY } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';

const TEAM = 't07:09:1a';
const A1 = '082aa:01'; // the session that builds
const A2 = '082aa:02'; // a new session of the same card (the continuation)
const B1 = '082bb:01'; // a session of another card (no continuation)
const REF = 'references/review/code.md';

const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'session-continue-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const user = join(t, 'user'); // HOME: the team folders live under it
  const tdir = join(user, '.qwen', 'teams', TEAM);
  mkdirSync(tdir, { recursive: true });
  return { t, home, cons, user, tdir, folder: join(home, 'acme', 'demo') };
}
const DOD = '## Definition of done\n\n- [ ] the test\'s check holds';
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', REF,
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  // QWEN_CODE_SESSION_ID stays out: these tests pin the continuation rules, not the author-session rule
  // (item 088), which a session id inherited from the running shell would apply to the session-name reviewers
  const o = { cwd: f.cons, tmp: f.t, env: { TEAM_LEAD: 'lead', HOME: f.user, QWEN_CODE_SESSION_ID: '', ...env } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name, ...extra) => { const slug = ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0]; return slug; };
const teamItem = (f, name) => { const s = make(f, name); ok(f, ['update', s, '--set-team', TEAM]); return s; };
const itemFm = (f, slug) => store.load(f.folder).find(i => i.path === `phases/${slug}.md`).fm;
// the item after a review changes verdict and the earlier session's hand-off request: ready for a rework
const reworked = (f, s) => {
  ok(f, ['update', s, '--claim', A1]);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A1]);
  ok(f, ['update', s, '--start-review', '--by', A2]);
  ok(f, ['update', s, '--review', 'changes', '--by', A2, '--comments', `fix per ${REF}`]);
};

test('082: 082aa:02 continues the item 082aa:01 claimed (rework after review): claimed_by is 082aa:02, session_authors holds both', () => {
  const f = fixture();
  const s = teamItem(f, 'continuation after rework');
  reworked(f, s);
  ok(f, ['update', s, '--claim', A2]); // a new session of the same card: the continuation, no takeover
  const fm = itemFm(f, s);
  assert.equal(fm.claimed_by, A2, 'the new session name is recorded on the item');
  assert.deepEqual(fm.session_authors, [A1, A2], 'every earlier session name stays on the item');
  // the continuing session keeps working on the item
  ok(f, ['update', s, '--append', 'CHUNK rework done', '--by', A2]);
});

test('082: a continuation of an item without session_authors keeps the earlier holder blocked', () => {
  const f = fixture();
  const s = teamItem(f, 'continuation of an older item');
  ok(f, ['update', s, '--claim', A1]);
  // an item claimed before session_authors existed: the list is not in the file
  const file = join(f.folder, 'phases', `${s}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^session_authors:\n(?:- .*\n)*/m, ''));
  assert.equal(itemFm(f, s).session_authors, undefined, 'the fixture item has no session_authors');
  ok(f, ['update', s, '--claim', A2]); // the continuation
  const fm = itemFm(f, s);
  assert.equal(fm.claimed_by, A2, 'the new session is recorded as the holder');
  assert.deepEqual(fm.session_authors, [A1, A2], 'the earlier holder is kept in the list by the continuation');
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A2]);
  const r = run(f, ['update', s, '--start-review', '--by', A1]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^❌ ${s}: ${A1}: the same session cannot review its own work; a new session may\\n$`));
});

test('082: 082bb:01 cannot take it over', () => {
  const f = fixture();
  const s = teamItem(f, 'take over from another card');
  ok(f, ['update', s, '--claim', A1]);
  const r = run(f, ['update', s, '--claim', B1]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^❌ ${s}: claimed by ${A1} since \\S+; message ${A1} or pick another item\\n$`));
  assert.equal(itemFm(f, s).claimed_by, A1, 'the refusal changes nothing');
});

test('082: after the continuation 082aa:01 still cannot review', () => {
  const f = fixture();
  const s = teamItem(f, 'block after continuation');
  reworked(f, s);
  ok(f, ['update', s, '--claim', A2]); // the continuation
  ok(f, ['update', s, '--request-review', 'any', '--note', 'reworked', '--by', A2]);
  const r = run(f, ['update', s, '--start-review', '--by', A1]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^❌ ${s}: ${A1}: the same session cannot review its own work; a new session may\\n$`));
  // the self-review block still names the current holder's sessions too
  const r2 = run(f, ['update', s, '--start-review', '--by', A2]);
  assert.equal(r2.status, 1, r2.stdout + r2.stderr);
  assert.match(r2.stdout, new RegExp(`^❌ ${s}: ${A2}: the same session cannot review its own work; a new session may\\n$`));
});

test('082: the hand-off lock of 082aa:01 does not lock 082aa:02', () => {
  const f = fixture();
  writeFileSync(join(f.tdir, 'config.json'), JSON.stringify({
    name: TEAM, leadAgentId: `lead@${TEAM}`,
    members: [
      { name: A1, agentId: `${A1}@${TEAM}`, joinedAt: 1000 },
      { name: A2, agentId: `${A2}@${TEAM}`, joinedAt: 1000 },
    ],
  }));
  const s = teamItem(f, 'hand-off lock and continuation');
  ok(f, ['update', s, '--claim', A1]);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A1]); // writes the hand-off marker for A1
  assert.ok(existsSync(join(f.tdir, 'handoff', `${A1}.json`)), 'the marker of the earlier session exists');
  // the locked session stops; the new session of the same card does not
  assert.equal(JSON.parse(run(f, ['pop', '--agent', A1, '--json'], { TEAM_NAME: TEAM }).stdout).action, 'stop');
  assert.notEqual(JSON.parse(run(f, ['pop', '--agent', A2, '--json'], { TEAM_NAME: TEAM }).stdout).action, 'stop');
  // the lock did not stop the continuing session: its claim goes through
  ok(f, ['update', s, '--claim', A2], { TEAM_NAME: TEAM });
  assert.equal(itemFm(f, s).claimed_by, A2);
});

test('082: query --plan offers the rework to the new session of the card while the earlier session still holds the item', () => {
  const f = fixture();
  const s = teamItem(f, 'plan rework for the new session');
  reworked(f, s); // A1 claims and asks; A2 gives the changes verdict
  const roster = join(f.t, 'roster.json');
  writeFileSync(roster, JSON.stringify({ [A2]: {} })); // only the new session is present
  const out = run(f, ['query', '--plan', '--roster', roster]).stdout;
  const respond = out.split('\n').find(l => l.includes(`respond ${s}`));
  assert.ok(respond, `the plan offers the rework to the new session: ${out}`);
  assert.ok(respond.startsWith(`${A2}: respond ${s}`), respond);
  assert.ok(respond.includes(`--claim ${A2}`), `the rework starts with the continuation claim: ${respond}`);
});

test('082: query --plan offers the close to the new session of the card while the earlier session still holds the item', () => {
  const f = fixture();
  const s = teamItem(f, 'plan close for the new session');
  ok(f, ['update', s, '--claim', A1]);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A1]);
  ok(f, ['update', s, '--start-review', '--by', B1]);
  ok(f, ['update', s, '--review', 'pass', '--by', B1, '--comments', `fine per ${REF}`]);
  // item 088: the close waits for the external review on the same commit
  ok(f, ['update', s, '--request-review', 'codex', '--note', 'the cody pass, external stage', '--by', A1]);
  ok(f, ['update', s, '--start-review', '--by', 'codex']);
  ok(f, ['update', s, '--review', 'pass', '--by', 'codex', '--comments', `fine per ${REF}`]);
  const roster = join(f.t, 'roster.json');
  writeFileSync(roster, JSON.stringify({ [A2]: {} })); // only the new session is present
  const out = run(f, ['query', '--plan', '--roster', roster]).stdout;
  const close = out.split('\n').find(l => l.includes(`close ${s}`));
  assert.ok(close, `the plan offers the close to the new session: ${out}`);
  assert.ok(close.startsWith(`${A2}: close ${s}`), close);
  assert.ok(close.includes(`--claim ${A2}`), `the close is preceded by the continuation claim: ${close}`);
});

test('082: a fresh session of the card is told to claim the item before it reworks it', () => {
  const f = fixture();
  const s = teamItem(f, 'claim before the rework');
  reworked(f, s); // A1 claims and asks; A2 gives the changes verdict
  const w = JSON.parse(run(f, ['pop', '--agent', A2, '--json']).stdout);
  assert.equal(w.action, 'continue', w.instruction);
  assert.ok(w.instruction.includes(`--claim ${A2}`), `the rework instruction starts with the continuation claim: ${w.instruction}`);
  assert.ok(w.instruction.includes('--append'), `the rework steps stay after it: ${w.instruction}`);
});

test('082: a fresh session of the card is told to claim the item before it closes the passed item', () => {
  const f = fixture();
  const s = teamItem(f, 'claim before the close');
  ok(f, ['update', s, '--claim', A1]);
  ok(f, ['update', s, '--request-review', 'any', '--note', 'n', '--by', A1]);
  ok(f, ['update', s, '--start-review', '--by', B1]);
  ok(f, ['update', s, '--review', 'pass', '--by', B1, '--comments', `fine per ${REF}`]);
  // item 088: the close waits for the external review on the same commit
  ok(f, ['update', s, '--request-review', 'codex', '--note', 'the cody pass, external stage', '--by', A1]);
  ok(f, ['update', s, '--start-review', '--by', 'codex']);
  ok(f, ['update', s, '--review', 'pass', '--by', 'codex', '--comments', `fine per ${REF}`]);
  const w = JSON.parse(run(f, ['pop', '--agent', A2, '--json']).stdout);
  assert.equal(w.action, 'continue', w.instruction);
  assert.ok(w.instruction.includes(`--claim ${A2}`), `the close instruction starts with the continuation claim: ${w.instruction}`);
  assert.ok(w.instruction.includes('--close --summary'), `and ends with the close: ${w.instruction}`);
});

test('082: the lead\'s completed-team review-and-close starts with the continuation claim', () => {
  const f = fixture();
  const s = teamItem(f, 'lead continues a completed team');
  ok(f, ['update', s, '--claim', A1]); // the lead's earlier session holds the team's work item
  const w = JSON.parse(run(f, ['pop', '--agent', A2, '--json'], { TEAM_LEAD: A2 }).stdout);
  assert.equal(w.action, 'continue', w.instruction);
  assert.ok(w.instruction.includes(`every item of team ${TEAM} is done`), `the completed-team steps: ${w.instruction}`);
  assert.ok(w.instruction.includes(`--claim ${A2}`), `the completed-team steps start with the continuation claim: ${w.instruction}`);
});
