// The status order, the workflow definition the CLI ships and the questions code asks of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUSES, SIDE, isFinished, loadWorkflow, normalise, stageList, validateWorkflow } from '../../src/shared/workflow.js';

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
