// Tests for item 077 (059.V1): `backlog update` records, accepts and rejects dependency hand-offs, end to end
// through the CLI (item 059: the CLI enforces dependency hand-offs). Local bare repositories, items made with
// the CLI in a fixture backlog; the stored front matter is read with parse and decoded with 059.1's decodeList.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { decodeList, edgeState } from '../../src/shared/handoff.js';
import { parse } from '../../src/shared/frontmatter.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'handoff-e2e-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'work'); // a branch the item front matter must name in the record block
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}

const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { TEAM_LEAD: 'lead' };
const C1 = '0123456789abcdef0123456789abcdef01234567';
const C2 = 'fedcba9876543210fedcba9876543210fedcba98';
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '', BACKLOG_SESSION: '', ...LEAD, ...env } });
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase ')[1].split(' ')[0];
const seq = slug => Number(slug.split('-')[0]);
const itemFile = (f, slug) => join(f.folder, 'phases', `${slug}.md`);
const fm = (f, slug) => parse(readFileSync(itemFile(f, slug), 'utf8')).fm;
const body = (f, slug) => parse(readFileSync(itemFile(f, slug), 'utf8')).body;
const handoffs = (f, slug) => decodeList(fm(f, slug).handoffs) ?? [];
const receipts = (f, slug) => decodeList(fm(f, slug).handoff_receipts) ?? [];
// The producer, claimed, with its hand-off recorded for its dependent: the stored record and the CLI call that
// wrote it come back for the assertions.
function producerWithHandoff(f, commit, session) {
  const p = make(f, 'producer item');
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  ok(f, ['update', p, '--claim', 'producer']);
  const record = ok(f, ['update', p, '--handoff', seq(d), '--handoff-commit', commit, '--handoff-contract', 'the update steps of item 059.V1',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js', '--handoff-outputs', 'src/shared/update.js',
    '--handoff-pickup', 'the next vertical slice wires the close gate', '--handoff-risks', 'NONE', '--by', 'producer'],
    { BACKLOG_SESSION: session });
  return { p, d, record };
}
// The producer's review passing, through the CLI (by = the claimer who requests).
function reviewPass(f, p, by = 'producer') {
  ok(f, ['update', p, '--request-review', 'rex', '--note', 'the hand-off wiring', '--by', by]);
  ok(f, ['query', '--phase', p, '--agent', 'rex']);
  ok(f, ['update', p, '--start-review', '--by', 'rex']);
  ok(f, ['update', p, '--review', 'pass', '--by', 'rex', '--comments', 'PASS (references/review/code.md)']);
  ok(f, ['query', '--phase', p, '--agent', by]); // the claimer's view is stale after the pass; the claimer reads it before handing on
}

test('059.V1: the producer records its hand-off for its dependent; the block names the item branch and the session', () => {
  const f = fixture();
  const { p, d, record } = producerWithHandoff(f, C1, 'e2e-77-session');
  assert.match(record.stdout, /handoff=DEPENDENCY_HANDOFF v1/);
  const records = handoffs(f, p);
  assert.equal(records.length, 1);
  assert.deepEqual([records[0].dependent, records[0].commit, records[0].by, records[0].risks], [String(seq(d)), C1, 'producer', 'NONE']);
  assert.match(records[0].digest, /^[0-9a-f]{64}$/);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'unaccepted');
  const text = body(f, p);
  assert.ok(text.includes('DEPENDENCY_HANDOFF v1'));
  assert.ok(text.includes(`SOURCE_ITEM: acme/demo#${seq(p)}`));
  assert.ok(text.includes(`DEPENDENT_ITEM: ${seq(d)}`));
  assert.ok(text.includes('PRODUCER_AGENT: producer ; SESSION: e2e-77-session'));
  assert.ok(text.includes(`SOURCE_COMMIT: ${C1} ; BRANCH: work`)); // the item's branch, not a default
  assert.ok(text.includes('END_DEPENDENCY_HANDOFF'));
});

test('059.V1: an acceptance before the producer review passed is refused and stores no receipt', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-77-session');
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  const r = run(f, ['update', p, '--accept-handoff', seq(d), '--checks', 'checked the contract', '--by', 'lead']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /the producer's review has not passed \(review_state none\); the hand-off is accepted only after it/);
  assert.equal(receipts(f, p).length, 0);
});

test('059.V1: after the review passes the lead accepts the hand-off and the receipt is stored', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-77-session');
  const record = handoffs(f, p)[0];
  reviewPass(f, p);
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  const accept = ok(f, ['update', p, '--accept-handoff', seq(d), '--checks', 'the record pins a 40-hex commit', '--by', 'lead']);
  assert.match(accept.stdout, /handoff-accepted=HANDOFF_ACCEPTED v1/);
  const receipt = receipts(f, p)[0];
  assert.deepEqual([receipt.result, receipt.by, receipt.digest, receipt.checks], ['accepted', 'lead', record.digest, 'the record pins a 40-hex commit']);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'accepted');
  const text = body(f, p);
  assert.ok(text.includes('HANDOFF_ACCEPTED v1'));
  assert.ok(text.includes(`HANDOFF_REVISION: ${record.digest}`));
  assert.ok(text.includes('REVIEWER_LEAD: lead'));
  assert.ok(text.includes(`REVIEWER: rex ; VERDICT: passed ; HANDOFF_COMMIT: ${C1}`));
});

test('059.V1: a re-recorded hand-off makes the old receipt stale', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-77-session');
  reviewPass(f, p);
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  ok(f, ['update', p, '--accept-handoff', seq(d), '--checks', 'checked', '--by', 'lead']);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'accepted');
  const oldRecord = handoffs(f, p)[0];
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  ok(f, ['update', p, '--handoff', seq(d), '--handoff-commit', C2, '--handoff-contract', 'the update steps of item 059.V1',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js', '--by', 'producer']);
  const records = handoffs(f, p);
  assert.equal(records.length, 1); // the new record replaces the old one
  assert.equal(records[0].commit, C2);
  assert.notEqual(records[0].digest, oldRecord.digest);
  const rs = receipts(f, p);
  assert.equal(rs.length, 1); // append-only: the earlier receipt stays and is the only one
  assert.equal(rs[0].digest, oldRecord.digest); // it pins the replaced record
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'stale');
});

test('059.V1: a rejection is stored with its reason', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-77-session');
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  const reject = ok(f, ['update', p, '--reject-handoff', seq(d), '--reason', 'the contract names the wrong module', '--by', 'lead']);
  assert.match(reject.stdout, /handoff-rejected=HANDOFF_REJECTED v1/);
  const record = handoffs(f, p)[0];
  const receipt = receipts(f, p)[0];
  assert.deepEqual([receipt.result, receipt.by, receipt.digest, receipt.checks], ['rejected', 'lead', record.digest, 'the contract names the wrong module']);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'rejected');
  const text = body(f, p);
  assert.ok(text.includes('HANDOFF_REJECTED v1'));
  assert.ok(text.includes('CHECKS: the contract names the wrong module'));
  assert.ok(text.includes('RESULT: REJECTED'));
});

test('059.V1: a member cannot accept or reject a hand-off', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-77-session');
  const accept = run(f, ['update', p, '--accept-handoff', seq(d), '--checks', 'checked', '--by', 'producer']);
  assert.equal(accept.status, 1, accept.stdout + accept.stderr);
  assert.match(accept.stdout, /a hand-off is accepted by the team lead \(lead\), not by producer/);
  const reject = run(f, ['update', p, '--reject-handoff', seq(d), '--reason', 'why not', '--by', 'producer']);
  assert.equal(reject.status, 1, reject.stdout + reject.stderr);
  assert.match(reject.stdout, /a hand-off is rejected by the team lead \(lead\), not by producer/);
  assert.equal(receipts(f, p).length, 0);
});

// Review round 1 (round 1): the hand-off steps resolve the actor before the identity check, so a
// member in a team session (BACKLOG_AGENT) without --by acts as itself, never as another claimer - and
// the accept and reject need the lead's --by.

test('059.V1: the claimer records its hand-off without --by; the record is by the claimer', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  ok(f, ['update', p, '--claim', 'producer']);
  const record = ok(f, ['update', p, '--handoff', seq(d), '--handoff-commit', C1, '--handoff-contract', 'the update steps of item 059.V1',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js'],
    { BACKLOG_AGENT: 'producer' });
  assert.match(record.stdout, /handoff=DEPENDENCY_HANDOFF v1/);
  const records = handoffs(f, p);
  assert.equal(records.length, 1);
  assert.equal(records[0].by, 'producer'); // the claimer acts as itself without --by
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'unaccepted');
});

test('059.V1: a member without --by cannot record another claimer\'s hand-off', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  ok(f, ['update', p, '--claim', 'producer']);
  const r = run(f, ['update', p, '--handoff', seq(d), '--handoff-commit', C1, '--handoff-contract', 'the update steps of item 059.V1',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js'],
    { BACKLOG_AGENT: 'other', TEAM_NAME: 't1' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /you are other \(BACKLOG_AGENT\): a member acts only as itself, not as producer/);
  assert.equal(handoffs(f, p).length, 0);
});

test('059.V1: a member without --by cannot accept or reject as the lead claimer', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  ok(f, ['update', p, '--claim', 'lead']);
  ok(f, ['update', p, '--handoff', seq(d), '--handoff-commit', C1, '--handoff-contract', 'the update steps of item 059.V1',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js', '--by', 'lead']);
  reviewPass(f, p, 'lead');
  const accept = run(f, ['update', p, '--accept-handoff', seq(d), '--checks', 'checked'], { BACKLOG_AGENT: 'other' });
  assert.equal(accept.status, 1, accept.stdout + accept.stderr);
  assert.match(accept.stdout, /--accept-handoff needs --by <the team lead>/);
  const reject = run(f, ['update', p, '--reject-handoff', seq(d), '--reason', 'why not'], { BACKLOG_AGENT: 'other' });
  assert.equal(reject.status, 1, reject.stdout + reject.stderr);
  assert.match(reject.stdout, /--reject-handoff needs --by <the team lead>/);
  assert.equal(receipts(f, p).length, 0);
});

// Review round 2 (round 2): the stale-view check must run against the effective actor of the step.
// A --handoff without --by records as the claimer, so the claimer's view is the one that must be fresh; the
// environment actor's fresh view must not let the write through (update.js chose the actor before the item
// loaded and substituted the claimer only for --request-review).

test('059.V1: a hand-off recorded without --by is checked against the claimer\'s view, not the environment actor\'s', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  ok(f, ['update', p, '--claim', 'producer']);
  ok(f, ['query', '--phase', p, '--agent', 'producer']); // the claimer's view of the item as it stands
  ok(f, ['update', p, '--append', 'a note from the lead', '--by', 'lead']); // someone else changes it: the claimer's view is now stale
  const r = run(f, ['update', p, '--handoff', seq(d), '--handoff-commit', C1, '--handoff-contract', 'the update steps of item 059.V1',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js'],
    { BACKLOG_AGENT: 'lead' });
  assert.equal(r.status, 5, r.stdout + r.stderr);
  assert.match(r.stderr, /was changed by lead at .* after you last read it/);
  assert.equal(handoffs(f, p).length, 0);
  ok(f, ['query', '--phase', p, '--agent', 'producer']); // the claimer reads the change, then the same call succeeds
  const record = ok(f, ['update', p, '--handoff', seq(d), '--handoff-commit', C1, '--handoff-contract', 'the update steps of item 059.V1',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js'],
    { BACKLOG_AGENT: 'lead' });
  assert.match(record.stdout, /handoff=DEPENDENCY_HANDOFF v1/);
  assert.equal(handoffs(f, p).length, 1);
  assert.equal(handoffs(f, p)[0].by, 'producer'); // the record is by the claimer, checked against its view
});

// Review round 3 (rounds 3 and 4): the hand-off flags are detected by presence, not
// truthiness - an empty value selects the action and is refused, instead of falling through to a
// successful state change (parse accepts the empty value).

test('059.V1: an empty hand-off value is refused for the record, the accept and the reject', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-77-session');
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  const record = run(f, ['update', p, '--handoff', '', '--handoff-commit', C1, '--handoff-contract', 'the update steps of item 059.V1',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js', '--by', 'producer']);
  assert.equal(record.status, 1, record.stdout + record.stderr);
  assert.match(record.stdout, /--handoff needs the dependent/);
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  const accept = run(f, ['update', p, '--accept-handoff', '', '--checks', 'checked', '--by', 'lead']);
  assert.equal(accept.status, 1, accept.stdout + accept.stderr);
  assert.match(accept.stdout, /--accept-handoff needs the dependent/);
  const reject = run(f, ['update', p, '--reject-handoff', '', '--reason', 'why not', '--by', 'lead']);
  assert.equal(reject.status, 1, reject.stdout + reject.stderr);
  assert.match(reject.stdout, /--reject-handoff needs the dependent/);
  assert.equal(handoffs(f, p).length, 1); // the original record stays, untouched by the empty calls
  assert.equal(handoffs(f, p)[0].commit, C1);
  assert.equal(receipts(f, p).length, 0);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'unaccepted');
});

// Item 078 (059.V2): the close gate (059.3's closeGate, wired into --close and --status done). A producer with
// dependents is refused while any dependent's edge is not accepted; owner 2026-11-01: the CLI teaches its own
// rules - every refused state change lists each rule that failed and how to resolve it, a missing hand-off says
// the hand-off is required and where the hand-off command's help is. The gate runs on the pre-transition status
// in both close paths; an item without dependents records handoffs: none itself; an item already done is not
// re-checked (a producer closed before the rule has no handoffs key: legacy).

function reviewed(f, p) {
  reviewPass(f, p);
  ok(f, ['query', '--phase', p, '--agent', 'producer']); // fresh view: the reviews changed the item
}

test('059.V2: a producer with a dependent is refused --close when the edge is missing', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['update', p, '--claim', 'producer']);
  reviewed(f, p);
  const r = run(f, ['update', p, '--close', '--summary', 'the close gate wiring', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge missing/);
  assert.match(r.stdout, new RegExp(`--handoff ${seq(d)} --handoff-commit`));
  assert.match(r.stdout, /A hand-off is required/);
  assert.match(r.stdout, /backlog update --help/);
  assert.equal(fm(f, p).status, 'review complete'); // the item is still open
  assert.equal(handoffs(f, p).length, 0); // the refusal records nothing
});

test('059.V2: a producer with a dependent is refused --close when the edge is unaccepted', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-78-session');
  reviewed(f, p);
  const r = run(f, ['update', p, '--close', '--summary', 'the close gate wiring', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge unaccepted/);
  assert.match(r.stdout, new RegExp(`--accept-handoff ${seq(d)} --checks`));
  assert.equal(fm(f, p).status, 'review complete');
  assert.equal(receipts(f, p).length, 0);
});

test('059.V2: a producer with a dependent is refused --close when it is stale after a re-recorded hand-off', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-78-session');
  reviewPass(f, p);
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  ok(f, ['update', p, '--accept-handoff', seq(d), '--checks', 'checked', '--by', 'lead']);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'accepted');
  // the re-record (after the producer reads the acceptance) changes the record's digest: the receipt pins the old one
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  ok(f, ['update', p, '--handoff', seq(d), '--handoff-commit', C2, '--handoff-contract', 'the close gate wiring',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js', '--by', 'producer']);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'stale');
  const r = run(f, ['update', p, '--close', '--summary', 'the close gate wiring', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge stale/);
  assert.match(r.stdout, new RegExp(`--accept-handoff ${seq(d)} --checks`));
  assert.equal(fm(f, p).status, 'review complete');
});

test('059.V2: a producer with a dependent is refused --close when it is rejected', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-78-session');
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  ok(f, ['update', p, '--reject-handoff', seq(d), '--reason', 'the contract is incomplete', '--by', 'lead']);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'rejected');
  ok(f, ['query', '--phase', p, '--agent', 'producer']); // the lead's rejection changed the item: the claimer re-reads
  reviewed(f, p); // the close also needs the 088 review gate to have passed
  const r = run(f, ['update', p, '--close', '--summary', 'the close gate wiring', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge rejected/);
  assert.match(r.stdout, new RegExp(`--handoff ${seq(d)} --handoff-commit`));
  assert.equal(fm(f, p).status, 'review complete');
});

test('059.V2: a producer with a dependent is refused --status done when the edge is missing', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['update', p, '--claim', 'producer']);
  reviewed(f, p);
  const r = run(f, ['update', p, '--status', 'done', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge missing/);
  assert.match(r.stdout, new RegExp(`--handoff ${seq(d)} --handoff-commit`));
  assert.match(r.stdout, /A hand-off is required/);
  assert.match(r.stdout, /backlog update --help/);
  assert.equal(fm(f, p).status, 'review complete'); // the item is still open
  assert.equal(handoffs(f, p).length, 0);
});

test('059.V2: a producer with a dependent is refused --status done when the edge is unaccepted', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-78-session');
  reviewed(f, p);
  const r = run(f, ['update', p, '--status', 'done', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge unaccepted/);
  assert.match(r.stdout, new RegExp(`--accept-handoff ${seq(d)} --checks`));
  assert.equal(fm(f, p).status, 'review complete');
});

test('059.V2: a producer with a dependent is refused --status done when it is stale after a re-recorded hand-off', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-78-session');
  reviewPass(f, p);
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  ok(f, ['update', p, '--accept-handoff', seq(d), '--checks', 'checked', '--by', 'lead']);
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  ok(f, ['update', p, '--handoff', seq(d), '--handoff-commit', C2, '--handoff-contract', 'the close gate wiring',
    '--handoff-verification', 'node --test .agents/test/shared-handoff-e2e.test.js', '--by', 'producer']);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'stale');
  const r = run(f, ['update', p, '--status', 'done', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge stale/);
  assert.match(r.stdout, new RegExp(`--accept-handoff ${seq(d)} --checks`));
  assert.equal(fm(f, p).status, 'review complete');
});

test('059.V2: a producer with a dependent is refused --status done when it is rejected', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-78-session');
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  ok(f, ['update', p, '--reject-handoff', seq(d), '--reason', 'the contract is incomplete', '--by', 'lead']);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'rejected');
  ok(f, ['query', '--phase', p, '--agent', 'producer']); // the lead's rejection changed the item: the claimer re-reads
  reviewed(f, p);
  const r = run(f, ['update', p, '--status', 'done', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge rejected/);
  assert.match(r.stdout, new RegExp(`--handoff ${seq(d)} --handoff-commit`));
  assert.equal(fm(f, p).status, 'review complete');
});

test('059.V2: after the lead accepts the hand-off the producer closes', () => {
  const f = fixture();
  const { p, d } = producerWithHandoff(f, C1, 'e2e-78-session');
  reviewPass(f, p);
  ok(f, ['query', '--phase', p, '--agent', 'lead']);
  const accept = ok(f, ['update', p, '--accept-handoff', seq(d), '--checks', 'the record pins a 40-hex commit', '--by', 'lead']);
  assert.match(accept.stdout, /handoff-accepted=HANDOFF_ACCEPTED v1/);
  assert.equal(edgeState(fm(f, p), String(seq(d))), 'accepted');
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  const close = ok(f, ['update', p, '--close', '--summary', 'the close gate wiring', '--by', 'producer']);
  assert.match(close.stdout, /updated/);
  assert.equal(fm(f, p).status, 'closed');
  const rs = receipts(f, p);
  assert.equal(rs.length, 1); // the lead's acceptance is the receipt that let the close through
  assert.equal(rs[0].result, 'accepted');
});

test('059.V2: an item without dependents closes and records NONE (the item shows handoffs: none and the closed event text names it)', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  ok(f, ['update', p, '--claim', 'producer']);
  reviewPass(f, p);
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  const close = ok(f, ['update', p, '--close', '--summary', 'the close gate wiring', '--by', 'producer']);
  assert.match(close.stdout, /updated/);
  assert.equal(fm(f, p).handoffs, 'none'); // the stored form: the string none
  // the NONE line is part of the closed event text, not a separate append
  assert.match(body(f, p), /## Closed by producer at [^\n]*\n\nthe close gate wiring\n\nDEPENDENCY_HANDOFF: NONE \(no dependent items; checked by the CLI at close\)/);
});

test('059.V2: a producer closed before this rule (no handoffs key) is not re-checked', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  ok(f, ['update', p, '--claim', 'producer']);
  reviewPass(f, p);
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  ok(f, ['update', p, '--close', '--summary', 'closed while the rule did not exist', '--by', 'producer']);
  assert.equal(fm(f, p).status, 'closed');
  // a producer closed before the rule has no handoffs key: remove the one this rule records, to stand in for it
  const path = itemFile(f, p);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^handoffs:.*\n/m, ''));
  assert.ok(!('handoffs' in fm(f, p)));
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['query', '--phase', p, '--agent', 'producer']);
  const r = ok(f, ['update', p, '--close', '--summary', 're-checked after the rule existed', '--by', 'producer']);
  assert.match(r.stdout, /updated/); // the done producer is not re-checked by the close gate
  assert.equal(fm(f, p).status, 'closed');
  assert.ok(!('handoffs' in fm(f, p))); // still no key: the gate added nothing
});

test('059.V2: an open producer with a dependent and no handoffs key is refused naming the edge state missing, not legacy', () => {
  const f = fixture();
  const p = make(f, 'producer item');
  const d = make(f, 'dependent item', '--depends-on', seq(p));
  ok(f, ['update', p, '--claim', 'producer']);
  reviewed(f, p);
  // the --status done path never calls closeItem: the gate must still see the pre-transition status
  let r = run(f, ['update', p, '--status', 'done', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge missing/);
  assert.doesNotMatch(r.stdout, /edge legacy/);
  assert.equal(fm(f, p).status, 'review complete');
  // the same call with both flags: --close is gated too, on the pre-transition status
  r = run(f, ['update', p, '--status', 'done', '--close', '--summary', 'the close gate wiring', '--by', 'producer']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /edge missing/);
  assert.doesNotMatch(r.stdout, /edge legacy/);
  assert.equal(fm(f, p).status, 'review complete');
  assert.equal(handoffs(f, p).length, 0);
});
