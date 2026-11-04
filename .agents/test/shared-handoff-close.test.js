// Item 059.3: the close gate's logic (src/shared/handoff-close.js, the module the integration slice calls from
// closeItem and the --status done path): an item closes only while every dependent's edge is accepted, the refusal
// naming every open dependent, its edge state and the next command; without dependents the gate records NONE.
// Fixtures are written in the stored form: handoffs and handoff_receipts hold the compact JSON strings encode makes.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as handoff from '../../src/shared/handoff.js';
import { closeGate } from '../../src/shared/handoff-close.js';
import { dump, parse } from '../../src/shared/frontmatter.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// A backlog-repository home: <home>/<owner>/<name>/phases/*.md, written through the codec the CLI itself uses.
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'handoff-close-'));
  dirs.push(t);
  return { home: join(t, 'home'), folder: join(t, 'home', 'acme', 'app') };
}
const REPO = 'acme/app';
const SLUG = '005-producer';
// make writes an item of <home>/<owner>/<name>; the front matter stays in the stored form, so handoffs and
// handoff_receipts hold the compact JSON strings encode makes, exactly as the codec stores them.
const make = (f, owner, name, fm) => {
  const dir = join(f.home, owner, name);
  mkdirSync(join(dir, 'phases'), { recursive: true });
  writeFileSync(join(dir, 'phases', `${fm.phase}.md`), dump(fm, '## Definition of done\n\n- [ ] x\n'));
};
const gate = (f, fm) => closeGate({ fm, folder: f.folder, repo: REPO, slug: SLUG });

const COMMIT = 'a'.repeat(40);
const record = (dependent, contract = 'the exported functions') => handoff.makeRecord({ dependent, commit: COMMIT, contract, verification: 'npm test: 0 failures', by: 'agent-b', at: '2026-10-30T20:00:00Z' });
const receipt = (dependent, digest, result = 'accepted') => handoff.makeReceipt({ dependent, digest, result, by: 'lead', at: '2026-10-30T21:00:00Z', checks: 'npm test: 0 failures' });
// The next commands the refusal must name (item 059's design): missing and rejected edges need (a new) hand-off
// record from the producer; unaccepted and stale edges need the lead's acceptance of the record that is there.
const handoffCommand = (dependent) => `backlog update ${SLUG} --handoff ${dependent} --handoff-commit <sha> --handoff-contract ... --handoff-verification ... --by <claimer>`;
const acceptCommand = (dependent) => `backlog update ${SLUG} --accept-handoff ${dependent} --checks ... --by <lead>`;
const NONE = { fm: { handoffs: 'none' }, text: 'DEPENDENCY_HANDOFF: NONE (no dependent items; checked by the CLI at close)' };

test('059.3: closeGate refuses a missing edge, naming the dependent, the state and the --handoff command', () => {
  const f = fixture();
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [] }; // no handoffs key: no record for the dependent
  make(f, 'acme', 'app', producer);
  make(f, 'acme', 'app', { seq: 6, phase: '006-dep', status: 'pending', depends_on: [5] });
  const res = gate(f, producer);
  assert.deepEqual(Object.keys(res), ['refuse'], 'a refusal carries the refuse text and nothing else');
  assert.ok(res.refuse.includes(`close refused for ${SLUG}`), res.refuse);
  assert.ok(res.refuse.includes('6 edge missing'), res.refuse);
  assert.ok(res.refuse.includes(handoffCommand('6')), res.refuse);
});

test('059.3: closeGate refuses an unaccepted edge in the stored form and names the --accept-handoff command', () => {
  const f = fixture();
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [], handoffs: [handoff.encode(record('6'))] };
  make(f, 'acme', 'app', producer);
  make(f, 'acme', 'app', { seq: 6, phase: '006-dep', status: 'pending', depends_on: [5] });
  const res = gate(f, producer);
  assert.ok(res.refuse.includes('6 edge unaccepted'), res.refuse);
  assert.ok(res.refuse.includes(acceptCommand('6')), res.refuse);
});

test('059.3: closeGate refuses a stale edge (the last receipt pins another digest) and names the --accept-handoff command', () => {
  const f = fixture();
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [], handoffs: [handoff.encode(record('6'))], handoff_receipts: [handoff.encode(receipt('6', 'b'.repeat(64)))] };
  make(f, 'acme', 'app', producer);
  make(f, 'acme', 'app', { seq: 6, phase: '006-dep', status: 'pending', depends_on: [5] });
  const res = gate(f, producer);
  assert.ok(res.refuse.includes('6 edge stale'), res.refuse);
  assert.ok(res.refuse.includes(acceptCommand('6')), res.refuse);
});

test('059.3: closeGate refuses a rejected edge and names a new --handoff as the next command', () => {
  const f = fixture();
  const rec = record('6');
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [], handoffs: [handoff.encode(rec)], handoff_receipts: [handoff.encode(receipt('6', rec.digest, 'rejected'))] };
  make(f, 'acme', 'app', producer);
  make(f, 'acme', 'app', { seq: 6, phase: '006-dep', status: 'pending', depends_on: [5] });
  const res = gate(f, producer);
  assert.ok(res.refuse.includes('6 edge rejected'), res.refuse);
  assert.ok(res.refuse.includes(handoffCommand('6')), res.refuse);
});

test('059.3: closeGate gives {} when every dependent edge is accepted, local and across repositories', () => {
  const f = fixture();
  const rec6 = record('6');
  const recF = record('acme/lib#2');
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [], handoffs: [handoff.encode(rec6), handoff.encode(recF)], handoff_receipts: [handoff.encode(receipt('6', rec6.digest)), handoff.encode(receipt('acme/lib#2', recF.digest))] };
  make(f, 'acme', 'app', producer);
  make(f, 'acme', 'app', { seq: 6, phase: '006-accepted', status: 'pending', depends_on: [5] });
  make(f, 'acme', 'lib', { seq: 2, phase: '002-foreign', status: 'pending', depends_on: ['acme/app#5'] });
  assert.deepEqual(gate(f, producer), {}, 'every edge accepted: nothing to add');
});

test('059.3: closeGate records NONE for an item without dependents', () => {
  const f = fixture();
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [] };
  make(f, 'acme', 'app', producer);
  assert.deepEqual(gate(f, producer), NONE);
});

test('059.3: closeGate records NONE when another repository item depends on a different item', () => {
  const f = fixture();
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [] };
  make(f, 'acme', 'app', producer);
  make(f, 'acme', 'lib', { seq: 3, phase: '003-other', status: 'pending', depends_on: [] });
  make(f, 'acme', 'lib', { seq: 2, phase: '002-foreign', status: 'pending', depends_on: ['acme/lib#3'] }); // a different item, not the producer
  assert.deepEqual(gate(f, producer), NONE);
});

test('059.3: closeGate names every open dependent with its own state and its own next command', () => {
  const f = fixture();
  const recF = record('acme/lib#2');
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [], handoffs: [handoff.encode(record('6')), handoff.encode(recF)], handoff_receipts: [handoff.encode(receipt('acme/lib#2', recF.digest, 'rejected'))] };
  make(f, 'acme', 'app', producer);
  make(f, 'acme', 'app', { seq: 6, phase: '006-unaccepted', status: 'pending', depends_on: [5] });
  make(f, 'acme', 'lib', { seq: 2, phase: '002-rejected', status: 'pending', depends_on: ['acme/app#5'] });
  const res = gate(f, producer);
  assert.ok(res.refuse.includes('6 edge unaccepted'), res.refuse);
  assert.ok(res.refuse.includes('acme/lib#2 edge rejected'), res.refuse);
  assert.ok(res.refuse.includes(acceptCommand('6')), res.refuse);
  assert.ok(res.refuse.includes(handoffCommand('acme/lib#2')), res.refuse);
});

test('059.3: closeGate takes the stored front-matter form straight from the codec round-trip', () => {
  const f = fixture();
  const rec6 = record('6');
  const producer = { seq: 5, phase: SLUG, status: 'pending', depends_on: [], handoffs: [handoff.encode(rec6)], handoff_receipts: [handoff.encode(receipt('6', rec6.digest))] };
  make(f, 'acme', 'app', producer);
  make(f, 'acme', 'app', { seq: 6, phase: '006-accepted', status: 'pending', depends_on: [5] });
  const back = parse(readFileSync(join(f.folder, 'phases', `${SLUG}.md`), 'utf8')).fm;
  assert.deepEqual(gate(f, back), {}, 'the stored form the codec returns satisfies the gate as the in-memory form does');
});
