// The status order, the workflow definition the CLI ships and the questions code asks of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUSES, SIDE, isFinished, isOpen, isUnstarted, loadWorkflow, normalise, stageList, statusOf, validateWorkflow } from '../../src/shared/workflow.js';

const SHIPPED = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'workflows', 'team.json'), 'utf8'));
const copy = () => structuredClone(SHIPPED);

test('the ordered statuses are the file\'s', () => assert.deepEqual(STATUSES, ['new', 'refining', 'refined', 'refinement review', 'ready', 'in progress', 'ready for review', 'reviewing', 'ready for external review', 'external review', 'review complete', 'closed', 'archived']));
test('the side status is the wait for a decision', () => assert.deepEqual(Object.keys(SIDE), ['awaiting decision']));
test('finished words', () => {
  for (const w of ['closed', 'done', 'archived']) assert.ok(isFinished(w));
  for (const w of ['blocked on vendor', 'in progress', 'pending', 'review complete']) assert.ok(!isFinished(w));
});
test('normalise', () => {
  assert.equal(normalise('ready-for-review'), 'ready for review');
  assert.equal(normalise('In_Progress'), 'in progress');
  assert.equal(normalise(' custom word '), 'custom word');
  assert.equal(normalise('done'), 'closed');
});
test('stage list follows the team entry', () => {
  assert.deepEqual(stageList({ review: [{ stage: 'peer' }] }), ['peer']);
  assert.deepEqual(stageList({ review: [{ stage: 'external' }, { stage: 'peer' }] }), ['peer', 'external']);
  assert.deepEqual(stageList({ review: [] }), []);
  assert.deepEqual(stageList({}), ['peer', 'external']);
  assert.deepEqual(stageList({ review: [{ team: 'a', count: 1 }, { team: 'b', count: 1 }] }), ['peer', 'external']);
});

test('the shipped definition carries no name of an internal team or agent', () => {
  const text = JSON.stringify(SHIPPED);
  assert.equal(SHIPPED.workflow, 'team');
  assert.ok(!/cody|codex|claude|k03|k08|k0c|k10/i.test(text));
});

test('an unknown workflow is refused with the way to register one', () => {
  assert.throws(() => loadWorkflow('nonesuch'), e => e.exitCode === 2 && /workflow nonesuch is not defined \(backlog team workflow --file <json> registers one\)/.test(e.message));
  assert.equal(loadWorkflow('team').workflow, 'team');
});
test('a flow registered in the backlog is found before the shipped one', t => {
  const home = mkdtempSync(join(tmpdir(), 'wf-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  writeFileSync(join(home, 'workflows.json'), JSON.stringify({ mine: { workflow: 'mine' }, team: { workflow: 'own team' } }));
  assert.equal(loadWorkflow('mine', home).workflow, 'mine');
  assert.equal(loadWorkflow('team', home).workflow, 'own team');
});

test('the shipped definition is valid', () => assert.deepEqual(validateWorkflow(SHIPPED), []));
const broken = (name, change, pattern) => test(`validateWorkflow: ${name}`, () => {
  const d = copy();
  change(d);
  assert.ok(validateWorkflow(d).some(p => pattern.test(p)), `${pattern}: ${JSON.stringify(validateWorkflow(d))}`);
});
broken('statuses must not be empty', d => { d.statuses = []; }, /statuses/);
broken('statuses must be distinct', d => { d.statuses.push('new'); }, /statuses/);
broken('statuses end with closed, archived', d => { d.statuses.reverse(); }, /end with closed, archived/);
broken('finished is a subset of the statuses', d => { d.finished = ['gone']; }, /finished/);
broken('a step needs from', d => { delete d.steps.claim.from; }, /step claim: from/);
broken('from names statuses', d => { d.steps.claim.from = ['nowhere']; }, /step claim: from/);
broken('a step needs to or verdicts', d => { delete d.steps.close.to; }, /step close: to/);
broken('a verdict leads to a status', d => { d.steps['refinement-review'].verdicts.reject.to = 'nowhere'; }, /step refinement-review: to/);
broken('a step needs by', d => { d.steps.close.by = []; }, /step close: by/);
broken('a side status names its steps', d => { d.side_statuses['awaiting decision'].leave = 'nonesuch'; }, /awaiting decision: leave/);
broken('the review stage order lists the stages the review steps use', d => { d.review_stages_order = ['peer']; }, /review_stages_order/);
broken('every open status reaches closed', d => { d.steps.close.from = ['closed']; }, /no chain of steps leads from/);
broken('the refusals have the five keys', d => { delete d.refusals.wrong_actor; }, /refusals must have wrong_actor/);

// ---- the word of an item written before the status order (one row per line of the translation table)
const TEAM_ENTRY = { members: ['m1', 'm2'], external_reviewers: ['x1'], review: [{ stage: 'peer', count: 1 }, { stage: 'external', count: 1 }] };
const ROWS = [
  ['archived', { status: 'archived', stage: 'ready' }, 'archived'],
  ['done', { status: 'done', review_state: 'passed' }, 'closed'],
  ['pending team item with no stage', { status: 'pending', team: 't' }, 'new'],
  ['pending, refining, no refiner', { status: 'pending', stage: 'refining', refiner: '' }, 'new'],
  ['pending, refining, a refiner', { status: 'pending', stage: 'refining', refiner: 'm1' }, 'refining'],
  ['pending, refined', { status: 'pending', stage: 'refined' }, 'refined'],
  ['pending, refinement-review', { status: 'pending', stage: 'refinement-review' }, 'refinement review'],
  ['pending, ready', { status: 'pending', stage: 'ready' }, 'ready'],
  ['waiting for an owner decision', { status: 'pending', stage: 'review-hitl' }, 'awaiting decision'],
  ['in_progress, no review', { status: 'in_progress', review_state: 'none' }, 'in progress'],
  ['in_progress, review requested', { status: 'in_progress', review_state: 'requested' }, 'ready for review'],
  ['in_progress, in review by a member', { status: 'in_progress', review_state: 'in_review', reviewer: 'm2' }, 'reviewing'],
  ['in_progress, in review by an external reviewer', { status: 'in_progress', review_state: 'in_review', reviewer: 'x1' }, 'external review'],
  ['in_progress, changes requested', { status: 'in_progress', review_state: 'changes-requested' }, 'in progress'],
  ['in_progress, passed, a stage still lacks its pass', { status: 'in_progress', review_state: 'passed', reviews: ['m1 abc'], work_commit: 'abc' }, 'ready for external review'],
  ['in_progress, passed, every stage has its pass', { status: 'in_progress', review_state: 'passed', reviews: ['m1 abc', 'x1 abc'], work_commit: 'abc' }, 'review complete'],
  ['pending, no team: free text as stored', { status: 'pending' }, 'pending'],
];
for (const [name, fm, word] of ROWS) test(`statusOf: ${name} reads as ${word}`, () => assert.equal(statusOf({ ...fm }, TEAM_ENTRY), word));
test('statusOf: an item that already carries a word of the order is never translated again', () => {
  for (const w of [...STATUSES, ...Object.keys(SIDE)]) assert.equal(statusOf({ status: w, stage: 'ready', review_state: 'passed' }, TEAM_ENTRY), w);
});
test('statusOf: a free-text word outside the order is kept as written', () => assert.equal(statusOf({ status: 'blocked on vendor' }, null), 'blocked on vendor'));
test('open and unstarted: only closed, done and archived are finished; a started word is not unstarted', () => {
  assert.ok(isOpen('blocked on vendor') && !isOpen('closed') && !isOpen('done') && !isOpen(null));
  assert.ok(isUnstarted('ready') && isUnstarted('new') && isUnstarted('pending') && !isUnstarted('in progress') && !isUnstarted('review complete') && !isUnstarted('closed'));
});
