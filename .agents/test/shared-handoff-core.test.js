// Item 059.1: the hand-off core of item 059 (src/shared/handoff.js, pure functions, no command yet): the digest that
// pins a producer record, the record and receipt builders, the six edge states, the dependents of a producer across
// the repository folders of the backlog repository, and the DEPENDENCY_HANDOFF / HANDOFF_ACCEPTED / HANDOFF_REJECTED
// body blocks of the item-dependency-handoff method.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as handoff from '../../src/shared/handoff.js';
import * as team from '../../src/shared/team.js';
import { dump } from '../../src/shared/frontmatter.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// A backlog-repository home: <home>/<owner>/<name>/phases/*.md, written through the codec the CLI itself uses.
function store() {
  const t = mkdtempSync(join(tmpdir(), 'handoff-core-'));
  dirs.push(t);
  return join(t, 'home');
}
const item = (home, owner, name, fm) => {
  const dir = join(home, owner, name);
  mkdirSync(join(dir, 'phases'), { recursive: true });
  writeFileSync(join(dir, 'phases', `${String(fm.seq).padStart(3, '0')}-x.md`), dump(fm, '## Definition of done\n\n- [ ] x\n'));
};

const COMMIT = 'a'.repeat(40);
const record = (dependent, contract = 'the exported functions') => handoff.makeRecord({ dependent, commit: COMMIT, contract, verification: 'npm test: 0 failures', by: 'cody-card3', at: '2026-10-30T20:00:00Z' });
const receipt = (dependent, digest, result = 'accepted') => handoff.makeReceipt({ dependent, digest, result, by: 'lead', at: '2026-10-30T21:00:00Z', checks: 'npm test: 0 failures' });

test('059.1: digest is stable, 64 hex, and changes with every one of the seven pinned fields', () => {
  const f = { dependent: '64', commit: COMMIT, contract: 'c', verification: 'v', outputs: 'o', pickup: 'p', risks: 'NONE' };
  const d = handoff.digest(f);
  assert.match(d, /^[0-9a-f]{64}$/);
  // Oracle: the sha256 of the exact JSON.stringify of the seven fields, computed independently of the digest code.
  assert.equal(d, '352dea4b059fbbcce48eebfeb3007b3b59126f50429733da031d2011699dcd72');
  assert.equal(handoff.digest({ ...f }), d, 'the same fields give the same digest');
  for (const [k, v] of Object.entries({ dependent: '65', commit: 'b'.repeat(40), contract: 'c2', verification: 'v2', outputs: 'o2', pickup: 'p2', risks: 'a risk' }))
    assert.notEqual(handoff.digest({ ...f, [k]: v }), d, `changing ${k} changes the digest`);
});

test('059.1: makeRecord pins the digest of the seven fields and defaults outputs, pickup and risks', () => {
  const r = handoff.makeRecord({ dependent: '64', commit: COMMIT, contract: 'c', verification: 'v', by: 'cody-card3', at: '2026-10-30T20:00:00Z' });
  assert.equal(r.outputs, '');
  assert.equal(r.pickup, '');
  assert.equal(r.risks, 'NONE');
  assert.equal(r.digest, handoff.digest(r), 'the record carries its own digest');
  assert.deepEqual(Object.keys(r).sort(), ['at', 'by', 'commit', 'contract', 'dependent', 'digest', 'outputs', 'pickup', 'risks', 'verification']);
  const up = handoff.makeRecord({ dependent: '64', commit: 'A'.repeat(40), contract: 'c', verification: 'v', by: 'cody-card3', at: '2026-10-30T20:00:00Z' });
  assert.equal(up.commit, 'A'.repeat(40), 'a 40-hex commit id is accepted in uppercase');
  assert.equal(up.digest, handoff.digest(up), 'the uppercase commit is pinned as written');
});

test('059.1: makeRecord names the field when dependent, contract or verification is empty, or commit is not 40 hex', () => {
  const base = { dependent: '64', commit: COMMIT, contract: 'c', verification: 'v', by: 'x', at: '2026-10-30T20:00:00Z' };
  for (const [field, bad, pattern] of [
    ['dependent', '', /dependent/],
    ['contract', '', /contract/],
    ['verification', '', /verification/],
    ['commit', 'a'.repeat(39), /commit/],
    ['commit', 'g'.repeat(40), /commit/],
  ]) assert.throws(() => handoff.makeRecord({ ...base, [field]: bad }), pattern, field);
});

test('059.1: makeReceipt takes accepted or rejected with non-empty checks, and names the field otherwise', () => {
  const r = handoff.makeReceipt({ dependent: '64', digest: 'd'.repeat(64), result: 'accepted', by: 'lead', at: '2026-10-30T21:00:00Z', checks: 'npm test: 0 failures' });
  assert.deepEqual(r, { dependent: '64', digest: 'd'.repeat(64), result: 'accepted', by: 'lead', at: '2026-10-30T21:00:00Z', checks: 'npm test: 0 failures' });
  assert.throws(() => handoff.makeReceipt({ ...r, result: 'ok' }), /result/);
  assert.throws(() => handoff.makeReceipt({ ...r, checks: '' }), /checks/);
});

test('059.1: edgeState gives the six edge states of the design', () => {
  const rec = record('64');
  assert.equal(handoff.edgeState({ status: 'done' }, '64'), 'legacy', 'a done producer without a handoffs key predates the rule');
  assert.equal(handoff.edgeState({ status: 'pending' }, '64'), 'missing', 'an open producer without a handoffs key');
  assert.equal(handoff.edgeState({ status: 'done', handoffs: 'none' }, '64'), 'missing', 'handoffs: none holds no record for the dependent');
  assert.equal(handoff.edgeState({ status: 'done', handoffs: [rec] }, '65'), 'missing', 'a list without a record for the dependent');
  assert.equal(handoff.edgeState({ status: 'done', handoffs: [rec] }, '64'), 'unaccepted', 'a record with no receipt');
  assert.equal(handoff.edgeState({ status: 'done', handoffs: [rec], handoff_receipts: [receipt('64', 'b'.repeat(64))] }, '64'), 'stale', 'the last receipt pins another digest');
  assert.equal(handoff.edgeState({ status: 'done', handoffs: [rec], handoff_receipts: [receipt('64', rec.digest, 'rejected')] }, '64'), 'rejected');
  assert.equal(handoff.edgeState({ status: 'done', handoffs: [rec], handoff_receipts: [receipt('64', rec.digest)] }, '64'), 'accepted');
  const pending = { dependent: '64', digest: rec.digest, result: 'pending', by: 'lead', at: '2026-10-30T21:00:00Z', checks: 'npm test: 0 failures' };
  const st = handoff.edgeState({ status: 'done', handoffs: [rec], handoff_receipts: [pending] }, '64');
  assert.notEqual(st, 'accepted', 'a receipt with a result other than accepted does not accept the edge');
  assert.equal(handoff.satisfied(st), false, 'and it does not satisfy the edge');
});

test('059.1: edgeState takes the last receipt and the last record of the dependent', () => {
  const rec = record('64', 'the second contract');
  assert.equal(handoff.edgeState({ status: 'done', handoffs: [rec], handoff_receipts: [receipt('64', rec.digest, 'rejected'), receipt('64', rec.digest)] }, '64'), 'accepted');
  const first = record('64', 'the first contract');
  assert.equal(handoff.edgeState({ status: 'done', handoffs: [first, rec], handoff_receipts: [receipt('64', first.digest)] }, '64'), 'stale', 'a replaced record breaks the pin of the receipt that accepted the old one');
});

test('059.1: satisfied is accepted and legacy only', () => {
  assert.equal(handoff.satisfied('accepted'), true);
  assert.equal(handoff.satisfied('legacy'), true);
  for (const s of ['missing', 'unaccepted', 'stale', 'rejected']) assert.equal(handoff.satisfied(s), false, s);
});

test('059.1: dependentsOf finds the same folder by seq and slug, another folder by owner/name#seq, and skips archived', () => {
  const home = store();
  const producer = { seq: 5, phase: '005-producer', status: 'done', depends_on: [] };
  item(home, 'acme', 'app', producer);
  item(home, 'acme', 'app', { seq: 6, phase: '006-by-seq', status: 'pending', depends_on: [5] });
  item(home, 'acme', 'app', { seq: 7, phase: '007-by-slug', status: 'pending', depends_on: ['005-producer'] });
  item(home, 'acme', 'app', { seq: 8, phase: '008-archived', status: 'archived', depends_on: [5] });
  item(home, 'acme', 'app', { seq: 9, phase: '009-foreign-spelling', status: 'pending', depends_on: ['acme/app#5'] }); // the same folder names the producer by seq or slug only
  item(home, 'acme', 'app', { seq: 10, phase: '010-zero-padded', status: 'pending', depends_on: ['005'] }); // the local seq, zero-padded spelling
  item(home, 'acme', 'lib', { seq: 2, phase: '002-cross-repo', status: 'pending', depends_on: ['acme/app#5'] });
  item(home, 'acme', 'lib', { seq: 3, phase: '003-not-a-dep', status: 'pending', depends_on: ['acme/lib#2'] });
  item(home, 'acme', 'lib', { seq: 4, phase: '004-foreign-zero-padded', status: 'pending', depends_on: ['acme/app#005'] }); // the foreign spelling, zero-padded seq
  assert.deepEqual(handoff.dependentsOf(join(home, 'acme', 'app'), 'acme/app', producer), [
    { id: '6', repository: 'acme/app', seq: 6, slug: '006-by-seq', status: 'pending' },
    { id: '7', repository: 'acme/app', seq: 7, slug: '007-by-slug', status: 'pending' },
    { id: '10', repository: 'acme/app', seq: 10, slug: '010-zero-padded', status: 'pending' },
    { id: 'acme/lib#2', repository: 'acme/lib', seq: 2, slug: '002-cross-repo', status: 'pending' },
    { id: 'acme/lib#4', repository: 'acme/lib', seq: 4, slug: '004-foreign-zero-padded', status: 'pending' },
  ]);
});

test('059.1: dependentsOf propagates a directory-read error of the backlog home, it never skips a repository that vanished', () => {
  const home = store();
  writeFileSync(home, 'a file, not a directory');
  const producer = { seq: 5, phase: '005-producer', status: 'done', depends_on: [] };
  assert.throws(() => handoff.dependentsOf(join(home, 'acme', 'app'), 'acme/app', producer), e => e.code === 'ENOTDIR', 'the unreadable home propagates, so the dependent cannot be missed');
});

test('059.1: dependentsOf propagates a load error of a sibling repository folder, it never skips it', () => {
  const home = store();
  const producer = { seq: 5, phase: '005-producer', status: 'done', depends_on: [] };
  item(home, 'acme', 'app', producer);
  item(home, 'acme', 'app', { seq: 6, phase: '006-dep', status: 'pending', depends_on: [5] });
  mkdirSync(join(home, 'acme', 'lib', 'phases'), { recursive: true });
  writeFileSync(join(home, 'acme', 'lib', 'phases', '004-broken.md'), '---\nnot a pair\n---\nbody\n');
  assert.throws(() => handoff.dependentsOf(join(home, 'acme', 'app'), 'acme/app', producer), /front matter line 1 is not a 'key: value' pair/, 'a folder that cannot be loaded propagates, so its dependents cannot be missed');
});

test('059.1: the zero-padded foreign spelling resolves through the item 042 pattern (team.js foreignItem)', () => {
  const home = store();
  const other = join(home, 'acme', 'lib');
  mkdirSync(join(other, 'phases'), { recursive: true });
  writeFileSync(join(other, 'phases', '004-x.md'), dump({ seq: 4, phase: '004-x', status: 'pending', depends_on: [] }, '## Definition of done\n\n- [ ] x\n'));
  const hit = team.foreignItem(join(home, 'acme', 'app'), 'acme/lib#04');
  assert.equal(hit?.seq, 4, 'owner/name#04 names the item with seq 4, compared numerically');
});

test('059.1: openEdges lists every dependent whose edge is not accepted, with the state that holds it open', () => {
  const home = store();
  const rec6 = record('6');
  const rec7 = record('7');
  const rec8 = record('acme/lib#2');
  const producerFm = { seq: 5, phase: '005-producer', status: 'done', depends_on: [], handoffs: [rec6, rec7, rec8], handoff_receipts: [receipt('7', rec7.digest), receipt('acme/lib#2', rec8.digest, 'rejected')] };
  item(home, 'acme', 'app', { seq: 5, phase: '005-producer', status: 'done', depends_on: [] });
  item(home, 'acme', 'app', { seq: 6, phase: '006-unaccepted', status: 'pending', depends_on: [5] });
  item(home, 'acme', 'app', { seq: 7, phase: '007-accepted', status: 'pending', depends_on: [5] });
  item(home, 'acme', 'lib', { seq: 2, phase: '002-rejected', status: 'pending', depends_on: ['acme/app#5'] });
  assert.deepEqual(handoff.openEdges(join(home, 'acme', 'app'), 'acme/app', producerFm), [
    { dependent: '6', state: 'unaccepted' },
    { dependent: 'acme/lib#2', state: 'rejected' },
  ]);
});

test('059.1: recordBlock is the DEPENDENCY_HANDOFF v1 body block of the method', () => {
  const r = record('64');
  assert.equal(handoff.recordBlock(r, 'SmoothSDLC/smooth-backlog-cli#63'), [
    'DEPENDENCY_HANDOFF v1',
    'SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#63',
    'DEPENDENT_ITEM: 64',
    'PRODUCER_AGENT: cody-card3',
    `SOURCE_COMMIT: ${COMMIT}`,
    'CONTRACT: the exported functions',
    'OUTPUTS: ',
    'VERIFICATION: npm test: 0 failures',
    'REVIEW: pending',
    'PICKUP: ',
    'OPEN_RISKS: NONE',
    'END_DEPENDENCY_HANDOFF',
    '',
  ].join('\n'));
});

test('059.1: receiptBlock is the HANDOFF_ACCEPTED v1 / HANDOFF_REJECTED v1 body block', () => {
  const digest64 = 'd'.repeat(64);
  assert.equal(handoff.receiptBlock(receipt('64', digest64), 'SmoothSDLC/smooth-backlog-cli#63'), [
    'HANDOFF_ACCEPTED v1',
    'SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#63',
    'DEPENDENT_ITEM: 64',
    `DIGEST: ${digest64}`,
    'CHECKS: npm test: 0 failures',
    'BY: lead',
    'AT: 2026-10-30T21:00:00Z',
    'END_HANDOFF_ACCEPTED',
    '',
  ].join('\n'));
  const rej = handoff.makeReceipt({ dependent: '64', digest: digest64, result: 'rejected', by: 'lead', at: '2026-10-30T21:05:00Z', checks: 'npm test failed: 2' });
  assert.equal(handoff.receiptBlock(rej, 'SmoothSDLC/smooth-backlog-cli#63'), [
    'HANDOFF_REJECTED v1',
    'SOURCE_ITEM: SmoothSDLC/smooth-backlog-cli#63',
    'DEPENDENT_ITEM: 64',
    `DIGEST: ${digest64}`,
    'CHECKS: npm test failed: 2',
    'BY: lead',
    'AT: 2026-10-30T21:05:00Z',
    'END_HANDOFF_REJECTED',
    '',
  ].join('\n'));
});
