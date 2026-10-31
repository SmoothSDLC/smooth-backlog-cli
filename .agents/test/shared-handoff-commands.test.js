// Item 059.2: the hand-off commands' logic (src/shared/handoff-commands.js): recordHandoff is the
// producer's --handoff (only the claimer, only for a real dependent), acceptHandoff and rejectHandoff
// are the team lead's --accept-handoff / --reject-handoff (only the lead, only while a record exists,
// the acceptance only after the producer's review passed). The items are made with the CLI in a
// fixture backlog; their front matter is read with store.load. The functions change nothing on disk.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../../src/shared/store.js';
import * as handoff from '../../src/shared/handoff.js';
import { dump, parse } from '../../src/shared/frontmatter.js';
import { GIT_IDENTITY, cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { recordHandoff, acceptHandoff, rejectHandoff } from '../../src/shared/handoff-commands.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'handoff-commands-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo'), repo: 'acme/demo' };
}

const DOD = '## Definition of done\n\n- [ ] the test\'s check holds';
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { TEAM_LEAD: 'lead' };
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } });
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
const item = (f, seq) => store.load(f.folder).find(i => i.fm.seq === seq);
const ctxOf = (f, seq) => { const it = item(f, seq); return { fm: it.fm, body: it.body, slug: it.fm.phase, folder: f.folder, repo: f.repo }; };

// The producer (seq 1, claimed by cody-card1) and its dependent (seq 2, depends on the producer).
function pair(f) {
  const producer = make(f, 'producer item');
  make(f, 'dependent item', '--depends-on', producer.split('-')[0]);
  ok(f, ['update', producer, '--claim', 'cody-card1']);
  return { f, producer, ctx: ctxOf(f, 1) };
}
const RECORD = { commit: 'b'.repeat(40), contract: 'the exported functions', verification: 'npm test: 0 failures', by: 'cody-card1' };
// recordHandoff reads the CLI session from the environment; the tests pin it and restore it afterwards.
function withSession(value, fn) {
  const saved = process.env.QWEN_CODE_SESSION_ID;
  if (value === undefined) delete process.env.QWEN_CODE_SESSION_ID;
  else process.env.QWEN_CODE_SESSION_ID = value;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.QWEN_CODE_SESSION_ID;
    else process.env.QWEN_CODE_SESSION_ID = saved;
  }
}
const head = cons => spawnSync('git', ['-C', cons, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
// The consumer's root commit: the HEAD the item was created at (its commit front matter, new.js).
const rootCommit = cons => spawnSync('git', ['-C', cons, 'rev-list', '--max-parents=0', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
// The producer's work: one real commit of the consumer checkout (the work the hand-off names), its sha.
function workCommit(f) {
  const p = spawnSync('git', ['-C', f.cons, 'commit', '--allow-empty', '-q', '-m', 'work'], { encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git commit: ${(p.stderr || '').trim()}`);
  return head(f.cons);
}

test('059.2: recordHandoff records the hand-off for a real dependent, in the stored form, with the method\'s block', () => {
  const f = fixture();
  const p = pair(f);
  const r = withSession('cody59/wt-68', () => recordHandoff(p.ctx, { dependent: '2', ...RECORD }));
  assert.ok(!r.refuse, r.refuse);
  assert.equal(r.event, 'handoff');
  assert.ok(Array.isArray(r.fm.handoffs), 'the stored form is a list of JSON strings');
  const rec = handoff.decodeList(r.fm.handoffs)[0];
  assert.equal(rec.dependent, '2');
  assert.equal(rec.commit, RECORD.commit);
  assert.equal(rec.contract, RECORD.contract);
  assert.equal(rec.verification, RECORD.verification);
  assert.equal(rec.outputs, '', 'outputs defaults to empty');
  assert.equal(rec.pickup, '', 'pickup defaults to empty');
  assert.equal(rec.risks, 'NONE', 'risks defaults to NONE');
  assert.equal(rec.by, 'cody-card1');
  assert.match(rec.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(rec.digest, handoff.digest(rec), 'the record carries the sha256 of its own fields');
  // the body block is the method's DEPENDENCY_HANDOFF v1 block, naming the item's real branch and the CLI session (lead ruling 2026-10-30)
  const source = 'acme/demo#1';
  assert.equal(r.text, handoff.recordBlock(rec, source, { branch: p.ctx.fm.branch, session: 'cody59/wt-68' }));
  assert.ok(r.text.includes(`SOURCE_COMMIT: ${RECORD.commit} ; BRANCH: ${p.ctx.fm.branch}`), r.text);
  assert.ok(r.text.includes('PRODUCER_AGENT: cody-card1 ; SESSION: cody59/wt-68'), r.text);
  // the stored form survives the real front-matter codec
  const back = parse(dump({ ...p.ctx.fm, ...r.fm }, p.ctx.body + r.text)).fm;
  assert.deepEqual(handoff.decodeList(back.handoffs), [rec]);
});

test('059.2: the record block names the producing agent as the session when the CLI session id is not set', () => {
  const f = fixture();
  const p = pair(f);
  const r = withSession(undefined, () => recordHandoff(p.ctx, { dependent: '2', ...RECORD }));
  assert.ok(!r.refuse, r.refuse);
  assert.ok(r.text.includes('PRODUCER_AGENT: cody-card1 ; SESSION: cody-card1'), r.text);
});

test('059.2: recordHandoff turns handoffs: none into a list when the producer records its hand-off', () => {
  const f = fixture();
  const p = pair(f);
  const it = item(f, 1);
  // the same stored form the CLI writes for a closed producer without dependents
  writeFileSync(join(f.folder, 'phases', `${p.producer}.md`), dump({ ...it.fm, handoffs: 'none' }, it.body));
  const r = recordHandoff(ctxOf(f, 1), { dependent: '2', ...RECORD });
  assert.ok(!r.refuse, r.refuse);
  assert.ok(Array.isArray(r.fm.handoffs), 'none becomes a list, it is not written back as the string none');
  assert.deepEqual(handoff.decodeList(r.fm.handoffs).map(x => x.dependent), ['2']);
});

test('059.2: a second record for the same dependent replaces the first, changes the digest, and keeps the other dependents\' records', () => {
  const f = fixture();
  const p = pair(f);
  make(f, 'second dependent item', '--depends-on', p.producer.split('-')[0]); // seq 3
  const r1 = recordHandoff(p.ctx, { dependent: '2', ...RECORD, contract: 'the first contract' });
  assert.ok(!r1.refuse, r1.refuse);
  const r2 = recordHandoff({ ...p.ctx, fm: { ...p.ctx.fm, ...r1.fm } }, { dependent: '3', ...RECORD, contract: 'for the second dependent' });
  assert.ok(!r2.refuse, r2.refuse);
  const r3 = recordHandoff({ ...p.ctx, fm: { ...p.ctx.fm, ...r1.fm, ...r2.fm } }, { dependent: '2', ...RECORD, contract: 'the second contract' });
  assert.ok(!r3.refuse, r3.refuse);
  const records = handoff.decodeList(r3.fm.handoffs);
  assert.deepEqual(records.map(x => x.dependent).sort(), ['2', '3'], 'the other dependent\'s record is untouched');
  const forTwo = records.filter(x => x.dependent === '2');
  assert.equal(forTwo.length, 1, 'the second record replaces the first for the same dependent');
  assert.equal(forTwo[0].contract, 'the second contract');
  const firstForTwo = handoff.decodeList(r1.fm.handoffs)[0];
  assert.notEqual(forTwo[0].digest, firstForTwo.digest, 'the replacement record changes the digest');
  assert.equal(forTwo[0].digest, handoff.digest(forTwo[0]), 'and it pins its own fields');
});

test('059.2: recordHandoff refuses without a --by, for an archived item, and for an actor that is not the claimer', () => {
  const f = fixture();
  const p = pair(f);
  const noBy = recordHandoff(p.ctx, { dependent: '2', ...RECORD, by: undefined });
  assert.match(noBy.refuse, /by/);
  const archived = recordHandoff({ ...p.ctx, fm: { ...p.ctx.fm, status: 'archived' } }, { dependent: '2', ...RECORD });
  assert.match(archived.refuse, /archived/);
  const other = recordHandoff(p.ctx, { dependent: '2', ...RECORD, by: 'other-agent' });
  assert.match(other.refuse, /claimed by cody-card1/);
  assert.ok(!other.refuse.includes('not one of'), 'the claimer refusal, not the dependents refusal');
});

test('059.2: recordHandoff refuses a dependent that is not one of the item\'s dependents, and names them', () => {
  const f = fixture();
  const p = pair(f);
  const r = recordHandoff(p.ctx, { dependent: '99', ...RECORD });
  assert.ok(r.refuse, 'a non-dependent is refused');
  assert.match(r.refuse, /'99'/);
  assert.match(r.refuse, /2/, 'the refusal names the item\'s dependents');
});

test('059.2: recordHandoff refuses an empty or non-40-hex commit, and an empty contract or verification', () => {
  const f = fixture();
  const p = pair(f);
  assert.match(recordHandoff(p.ctx, { dependent: '2', ...RECORD, commit: '' }).refuse, /commit/);
  assert.match(recordHandoff(p.ctx, { dependent: '2', ...RECORD, commit: 'a'.repeat(39) }).refuse, /commit/);
  assert.match(recordHandoff(p.ctx, { dependent: '2', ...RECORD, commit: 'g'.repeat(40) }).refuse, /commit/);
  assert.match(recordHandoff(p.ctx, { dependent: '2', ...RECORD, contract: '   ' }).refuse, /contract/);
  assert.match(recordHandoff(p.ctx, { dependent: '2', ...RECORD, verification: '' }).refuse, /verification/);
});

test('059.2: the acceptance receipt records the reviewer, the verdict and the reviewed commit the review reviewed', () => {
  const f = fixture();
  const p = pair(f);
  // the producer's work: a real commit of the consumer checkout (the work the hand-off names)
  const work = workCommit(f);
  // the producer requests the review, naming the work commit (what to review: commits); the review
  // operation stores the verdict and the reviewer, but no reviewed commit (lifecycle.js)
  ok(f, ['update', p.producer, '--request-review', 'codex', '--note', `review work commit ${work} and its contract`, '--by', 'cody-card1']);
  ok(f, ['update', p.producer, '--start-review', '--by', 'codex']);
  ok(f, ['update', p.producer, '--review', 'pass', '--by', 'codex', '--comments', 'the exported functions hold; references/review/code.md']);
  const ctx = ctxOf(f, 1);
  assert.equal(ctx.fm.review_state, 'passed', 'the review operation stored the verdict');
  assert.equal(ctx.fm.reviewer, 'codex', 'the review operation stored the reviewer');
  // no work after the review: the producer records the hand-off at the reviewed commit, not a later one (review r2)
  assert.equal(head(f.cons), work, 'no work after the review: the record names the reviewed commit');
  const rec = recordHandoff(ctx, { dependent: '2', commit: work, contract: 'the exported functions', verification: 'npm test: 0 failures', by: 'cody-card1' });
  assert.ok(!rec.refuse, rec.refuse);
  const r = acceptHandoff({ ...ctx, fm: { ...ctx.fm, ...rec.fm } }, { dependent: '2', checks: 'npm test: 0 failures', by: 'lead', lead: 'lead' });
  assert.ok(!r.refuse, r.refuse);
  assert.equal(r.event, 'handoff-accepted');
  const rcpt = handoff.decodeList(r.fm.handoff_receipts)[0];
  const record = handoff.decodeList(rec.fm.handoffs)[0];
  assert.equal(rcpt.digest, record.digest, 'the receipt pins the current record\'s digest');
  assert.equal(rcpt.result, 'accepted');
  assert.equal(rcpt.by, 'lead');
  assert.equal(rcpt.checks, 'npm test: 0 failures');
  assert.equal(rcpt.reviewer, ctx.fm.reviewer, 'the receipt records the reviewer the review operation stored');
  assert.equal(rcpt.verdict, ctx.fm.review_state, 'the receipt records the verdict the review operation stored');
  assert.equal(rcpt.commit, work, 'the reviewed commit is the commit the review request named and the review reviewed (review r2)');
  assert.match(rcpt.commit, /^[0-9a-f]{40}$/);
  // the evidence in the item: the review request named the work commit, and the review passed on it
  assert.ok(ctx.body.includes(`commit ${work}`), 'the review request named the work commit');
  assert.ok(ctx.body.includes('## Review by codex: PASS'), 'the review passed');
  // the body block: the method's HANDOFF_ACCEPTED v1 block plus the ruling's reviewer, verdict and reviewed
  // commit, directly after the receipt block - no blank line (review r2)
  assert.equal(r.text, handoff.receiptBlock(rcpt, 'acme/demo#1')
    + `REVIEWER: ${rcpt.reviewer} ; VERDICT: ${rcpt.verdict} ; REVIEWED_COMMIT: ${rcpt.commit}\n`, r.text);
  // the stored form survives the real front-matter codec
  const back = parse(dump({ ...ctx.fm, ...rec.fm, ...r.fm }, ctx.body + rec.text + r.text)).fm;
  assert.deepEqual(handoff.decodeList(back.handoff_receipts), [rcpt]);
});

test('059.2: a record without a commit takes the item\'s commit front matter - the creation HEAD the review request named', () => {
  const f = fixture();
  const p = pair(f);
  // no work after the creation: the item's commit front matter is the creation HEAD (new.js)
  const created = rootCommit(f.cons);
  assert.equal(ctxOf(f, 1).fm.commit, created, 'the item\'s commit front matter is the creation HEAD (new.js)');
  // the review request names the creation HEAD (the state the review reviewed) and the review passes
  ok(f, ['update', p.producer, '--request-review', 'codex', '--note', `review commit ${created}`, '--by', 'cody-card1']);
  ok(f, ['update', p.producer, '--start-review', '--by', 'codex']);
  ok(f, ['update', p.producer, '--review', 'pass', '--by', 'codex', '--comments', 'holds; references/review/code.md']);
  const ctx = ctxOf(f, 1);
  // a stored-form record without a commit (the record command makes no such record): the receipt still
  // names a reviewed commit - the item's commit front matter, the creation HEAD the review request named (review r2)
  const bare = { dependent: '2', commit: '', contract: 'c', verification: 'v', outputs: '', pickup: '', risks: 'NONE', by: 'cody-card1', at: '2026-10-31T00:00:00Z', digest: 'd'.repeat(64) };
  const r = acceptHandoff({ ...ctx, fm: { ...ctx.fm, handoffs: [handoff.encode(bare)] } }, { dependent: '2', checks: 'npm test: 0 failures', by: 'lead', lead: 'lead' });
  assert.ok(!r.refuse, r.refuse);
  assert.equal(handoff.decodeList(r.fm.handoff_receipts)[0].commit, created, 'a record without a commit: the item\'s commit front matter (the creation HEAD the review request named) is the reviewed commit');
});

test('059.2: acceptHandoff refuses a missing actor or lead, a non-lead actor, a missing record, empty checks, and a review that has not passed', () => {
  const f = fixture();
  const p = pair(f);
  const rec = recordHandoff(p.ctx, { dependent: '2', ...RECORD });
  assert.ok(!rec.refuse, rec.refuse);
  const fm0 = { ...p.ctx.fm, ...rec.fm, review_state: 'passed', reviewer: 'codex' };
  const ctx = { ...p.ctx, fm: fm0 };
  // review r1: a missing actor or a missing team lead identity is refused on its own - both missing no longer authorizes a receipt
  assert.match(acceptHandoff(ctx, { dependent: '2', checks: 'c', by: undefined, lead: 'lead' }).refuse, /--by <agent> is missing/);
  assert.match(acceptHandoff(ctx, { dependent: '2', checks: 'c', by: 'lead', lead: undefined }).refuse, /team lead identity is missing/);
  assert.match(acceptHandoff(ctx, { dependent: '2', checks: 'c' }).refuse, /--by <agent> is missing/);
  assert.match(acceptHandoff(ctx, { dependent: '2', checks: 'c', by: 'cody-card1', lead: 'lead' }).refuse, /team lead \(lead\)/);
  assert.match(acceptHandoff(p.ctx, { dependent: '2', checks: 'c', by: 'lead', lead: 'lead' }).refuse, /no hand-off record/);
  assert.match(acceptHandoff(ctx, { dependent: '2', checks: '   ', by: 'lead', lead: 'lead' }).refuse, /checks/);
  assert.match(acceptHandoff({ ...ctx, fm: { ...fm0, review_state: 'none' } }, { dependent: '2', checks: 'c', by: 'lead', lead: 'lead' }).refuse, /review_state/);
});

test('059.2: handoff_receipts keeps every receipt: an acceptance, a rejection and a new acceptance all stay', () => {
  const f = fixture();
  const p = pair(f);
  const rec = recordHandoff(p.ctx, { dependent: '2', ...RECORD });
  assert.ok(!rec.refuse, rec.refuse);
  const fm0 = { ...p.ctx.fm, ...rec.fm, review_state: 'passed', reviewer: 'codex' };
  const a1 = acceptHandoff({ ...p.ctx, fm: fm0 }, { dependent: '2', checks: 'the first acceptance', by: 'lead', lead: 'lead' });
  assert.ok(!a1.refuse, a1.refuse);
  const rej = rejectHandoff({ ...p.ctx, fm: { ...fm0, ...a1.fm } }, { dependent: '2', reason: 'the verification did not hold', by: 'lead', lead: 'lead' });
  assert.ok(!rej.refuse, rej.refuse);
  assert.equal(rej.event, 'handoff-rejected');
  const a2 = acceptHandoff({ ...p.ctx, fm: { ...fm0, ...a1.fm, ...rej.fm } }, { dependent: '2', checks: 'the second acceptance', by: 'lead', lead: 'lead' });
  assert.ok(!a2.refuse, a2.refuse);
  const all = handoff.decodeList(a2.fm.handoff_receipts);
  assert.equal(all.length, 3, 'the receipt list is append-only: every receipt stays');
  assert.deepEqual(all.map(x => x.result), ['accepted', 'rejected', 'accepted']);
  assert.deepEqual(all.map(x => x.checks), ['the first acceptance', 'the verification did not hold', 'the second acceptance']);
  // the rejection is the method's HANDOFF_REJECTED v1 block in the body
  const rejRcpt = handoff.decodeList(rej.fm.handoff_receipts).at(-1);
  assert.equal(rej.text, handoff.receiptBlock(rejRcpt, 'acme/demo#1'));
});

test('059.2: rejectHandoff refuses a missing actor or lead, a non-lead actor, a missing record, and an empty reason', () => {
  const f = fixture();
  const p = pair(f);
  const rec = recordHandoff(p.ctx, { dependent: '2', ...RECORD });
  assert.ok(!rec.refuse, rec.refuse);
  const ctx = { ...p.ctx, fm: { ...p.ctx.fm, ...rec.fm } };
  // review r1: a missing actor or a missing team lead identity is refused on its own - both missing no longer authorizes a receipt
  assert.match(rejectHandoff(ctx, { dependent: '2', reason: 'r', by: undefined, lead: 'lead' }).refuse, /--by <agent> is missing/);
  assert.match(rejectHandoff(ctx, { dependent: '2', reason: 'r', by: 'lead', lead: undefined }).refuse, /team lead identity is missing/);
  assert.match(rejectHandoff(ctx, { dependent: '2', reason: 'r' }).refuse, /--by <agent> is missing/);
  assert.match(rejectHandoff(ctx, { dependent: '2', reason: 'r', by: 'cody-card1', lead: 'lead' }).refuse, /team lead \(lead\)/);
  assert.match(rejectHandoff(p.ctx, { dependent: '2', reason: 'r', by: 'lead', lead: 'lead' }).refuse, /no hand-off record/);
  assert.match(rejectHandoff(ctx, { dependent: '2', reason: '', by: 'lead', lead: 'lead' }).refuse, /reason/);
});

test('059.2: the stored form of the records and the receipts round-trips through the front-matter codec', () => {
  const f = fixture();
  const p = pair(f);
  const rec = recordHandoff(p.ctx, { dependent: '2', ...RECORD });
  assert.ok(!rec.refuse, rec.refuse);
  const fm0 = { ...p.ctx.fm, ...rec.fm, review_state: 'passed', reviewer: 'codex' };
  const acc = acceptHandoff({ ...p.ctx, fm: fm0 }, { dependent: '2', checks: 'npm test: 0 failures', by: 'lead', lead: 'lead' });
  assert.ok(!acc.refuse, acc.refuse);
  const final = { ...fm0, ...acc.fm };
  const back = parse(dump(final, p.ctx.body + rec.text + acc.text)).fm;
  assert.deepEqual(handoff.decodeList(back.handoffs), handoff.decodeList(final.handoffs), 'the records survive the codec round-trip');
  assert.deepEqual(handoff.decodeList(back.handoff_receipts), handoff.decodeList(final.handoff_receipts), 'the receipts survive the codec round-trip');
});
