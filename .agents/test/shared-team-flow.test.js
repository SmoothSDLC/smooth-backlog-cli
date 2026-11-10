// The team workflow end to end through the CLI only, one numbered step per backlog step of a team lead and its members.
// Each step runs the command an agent runs, as that agent (SMOOTH_BACKLOG_CLI_AGENT), and checks what it does. The teams and their
// review rules are the teams.json of the backlog folder; local bare repositories only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseItem as parse } from '../../src/shared/item-file.js';
import { cli, consumer, itemPath, sharedBacklog, readItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const DOD = "## Definition of done\n\n- [ ] the parser test passes";
const STOP = /🛑 (\S+): END THE SESSION NOW/;
const COMMIT = 'def45678def45678def45678def45678def45678'; // a 40-hex commit for the hand-off record

test('the team workflow through the CLI only, step by step', async ctx => {
  const t = mkdtempSync(join(tmpdir(), 'team-flow-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({
    t1: { lead: 'lead', members: ['ann', 'bob', 'zed'], review: [{ team: 't1', count: 1 }, { team: 'reviewers', count: 1 }], refinement_review: [{ team: 'reviewers', count: 1 }] },
    reviewers: { lead: 'rex', members: ['rex', 'ria'] },
  }));
  const TEAM = { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main' };
  const as = (agent, args, want = 0, envExtra = {}) => {
    const env = { ...TEAM, SMOOTH_BACKLOG_CLI_AGENT: agent, SMOOTH_BACKLOG_CLI_SESSION: '', ...envExtra };
    if (args[0] === 'update') cli(['show', args[1], '--agent', agent], { cwd: cons, tmp: t, env }); // read before the write
    const r = cli(args, { cwd: cons, tmp: t, env });
    assert.ok([].concat(want).includes(r.status), `${agent}: backlog ${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const json = (agent, args) => JSON.parse(as(agent, args, [0, 3]).stdout); // 3: pop and work with nothing to do now
  const fm = slug => readItem(itemPath(join(home, 'acme', 'demo'), slug)).fm;
  const slugOf = r => r.stdout.split('created phase ')[1].split(' ')[0];
  const steps = [];
  const step = async (id, fn) => { await ctx.test(id, fn); steps.push(id); }; // one TAP line per step

  let w; let c1; let c2;
  await step('S01 new work item', () => { w = slugOf(as('lead', ['new', '--name', 'parser work', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'docs/review/code.md', '--estimate', '90', '--complexity', 'medium', '--body', DOD])); });
  await step('S02 runner: --set-team and --claim for the lead', () => { as('lead', ['update', w, '--set-team', 't1']); as('lead', ['update', w, '--claim', 'lead']); assert.equal(fm(w).claimed_by, 'lead'); });
  await step('S03 query --status --json', () => { assert.ok(JSON.stringify(json('lead', ['list', '--json'])).includes(w)); });
  await step('S04 split: new --split-from (stage refining)', () => {
    c1 = slugOf(as('lead', ['new', '--name', 'parser child', '--split-from', w, '--depends-on', 'none']));
    c2 = slugOf(as('lead', ['new', '--name', 'printer child', '--split-from', w, '--depends-on', 'none', '--review-refs', 'docs/review/code.md',
      '--estimate', '20', '--complexity', 'low', '--body', '## Definition of done\n\n- [ ] the printer prints the sample'])); // complete at creation, still refined
    assert.deepEqual([fm(c1).team, fm(c1).status], ['t1', 'new']);
  });
  await step('S05 --set-depends-on (the DAG)', () => { as('lead', ['update', c2, '--set-depends-on', c1]); assert.deepEqual(fm(c2).depends_on.map(String), [c1]); });
  await step('S06 an owner question: --request-decision holds the item awaiting a decision', () => {
    as('lead', ['update', c2, '--request-decision', 'Which printer format? Options: A, B. Recommendation: A.', '--by', 'lead']);
    assert.equal(fm(c2).status, 'awaiting decision');
  });
  await step('S07 pop: a member refines first; the lead waits', () => {
    assert.deepEqual([json('ann', ['team', 'pop', '--team', 't1', '--agent', 'ann', '--json']).action], ['refine']);
    assert.equal(json('lead', ['team', 'pop', '--team', 't1', '--agent', 'lead', '--json']).action, 'idle');
  });
  await step('S08 work marks --refine-start', () => { const p = json('ann', ['team', 'pop', '--team', 't1', '--agent', 'ann', '--json']); assert.equal(p.item, c1); assert.equal(fm(c1).refiner, 'ann'); });
  await step('S09 refine: --set-review-refs, --set-estimate, --set-complexity, --append the definition of done', () => {
    as('ann', ['update', c1, '--set-review-refs', 'docs/review/code.md,docs/review/tests.md', '--set-estimate', '30', '--set-complexity', 'low', '--by', 'ann']);
    as('ann', ['update', c1, '--append', '## Definition of done\n\n- [ ] the parser reads the sample', '--by', 'ann']);
  });
  await step('S10 --refine-done', () => { as('ann', ['update', c1, '--refine-done', '--by', 'ann', '--note', 'fields and DoD set']); assert.equal(fm(c1).status, 'refined'); });
  await step('S11 lead: --request-refinement-review', () => { as('lead', ['update', c1, '--request-refinement-review', '--by', 'lead']); assert.equal(fm(c1).status, 'refinement review'); });
  await step('S12 lead records the reviewer: --refinement-review pass --by rex', () => { as('lead', ['update', c1, '--refinement-review', 'pass', '--by', 'rex', '--comments', 'checkable']); assert.equal(fm(c1).status, 'ready'); });
  await step('S13 query --plan gives the ready item to one member', () => {
    const p = json('lead', ['team', 'query', '--team', 't1', '--plan', '--agents', 'ann,zed', '--json']);
    assert.deepEqual(p.filter(e => e.item === c1).map(e => e.action), ['claim']);
  });
  await step('S14 team pop claims the ready item', () => {
    const p = json('zed', ['team', 'pop', '--team', 't1', '--agent', 'zed', '--json']);
    assert.deepEqual([p.action, p.item, p.claimed, fm(c1).claimed_by], ['claim', c1, true, 'zed']);
  });
  await step('S15 --waiting and --waiting-done', () => { as('zed', ['update', c1, '--waiting', 'ci run 7', '--by', 'zed']); as('zed', ['update', c1, '--waiting-done', '--by', 'zed']); assert.ok(!fm(c1).wait_on); });
  await step('S16 query --blocked names the dependency', () => { assert.ok(json('ann', ['team', 'query', '--team', 't1', '--blocked', '--json']).some(b => b.slug === c2)); });
  await step('S17 --append evidence, --request-review: the session ends', () => {
    as('zed', ['update', c1, '--append', 'commit abc: parser and its test', '--by', 'zed']);
    const r = as('zed', ['update', c1, '--request-review', 'any', '--note', 'commit abc', '--by', 'zed']);
    assert.equal(STOP.exec(r.stdout.trim().split('\n').at(-1))?.[1], 'zed');
  });
  await step('S18 query --reviewable for another member', () => { assert.ok(json('ann', ['team', 'query', '--team', 't1', '--reviewable', '--agent', 'ann', '--json']).some(r => r.slug === c1)); });
  await step('S19 --start-review, --review changes citing a review_ref', () => {
    as('ann', ['update', c1, '--start-review', '--by', 'ann']);
    assert.match(as('ann', ['update', c1, '--review', 'changes', '--by', 'ann', '--comments', 'add a case'], 1).stdout, /must cite/); // a verdict cites a review_ref
    const r = as('ann', ['update', c1, '--review', 'changes', '--by', 'ann', '--comments', 'add the empty-input case (docs/review/tests.md)']);
    assert.equal(STOP.exec(r.stdout)?.[1], 'ann');
  });
  const doc = slug => readFileSync(itemPath(join(home, 'acme', 'demo'), slug), 'utf8');
  await step('S20 a fresh session: rework, the dependency hand-off before the final review, --request-review, --review pass', () => {
    assert.equal(json('zed', ['team', 'pop', '--team', 't1', '--agent', 'zed', '--json']).item, c1);
    // the producer records its hand-off in the consumer's item before the final review 
    as('zed', ['update', c2, '--append', `DEPENDENCY_HANDOFF v1 from ${c1} (revision 1): interface parse(text); commit def; tests parser.test (pass); pickup: import parse`, '--by', 'zed']);
    assert.match(doc(c2), /DEPENDENCY_HANDOFF v1 from .*\(revision 1\)/);
    as('zed', ['update', c1, '--request-review', 'any', '--note', 'commit def: empty input; hand-off recorded in the consumer item', '--by', 'zed']);
    as('ann', ['update', c1, '--start-review', '--by', 'ann']);
    as('ann', ['update', c1, '--review', 'pass', '--by', 'ann', '--comments', 'ok per docs/review/code.md']);
    as('rex', ['update', c1, '--start-review', '--by', 'rex']);
    const r = as('rex', ['update', c1, '--review', 'pass', '--by', 'rex', '--comments', 'ok per docs/review/code.md']);
    assert.match(r.stdout, /CLOSE NOW: zed closes it/);
  });
  await step('S20a the lead records HANDOFF_ACCEPTED with actor, time, SHA, consumer and hand-off revision in both items', () => {
    const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const receipt = `HANDOFF_ACCEPTED actor=lead at=${at} producer=${c1} consumer=${c2} sha=def handoff=v1 revision 1`;
    for (const slug of [c1, c2]) as('lead', ['update', slug, '--append', receipt, '--by', 'lead']);
    for (const slug of [c1, c2]) assert.ok(doc(slug).includes(receipt), slug);
  });
  await step('S21 the claimer closes', () => {
    as('ann', ['update', c1, '--close', '--summary', 'x', '--by', 'ann'], 1);
    // the close gate - c1 has a dependent (c2): the claimer records the hand-off, the lead accepts it
    const c2seq = Number(c2.split('-')[0]);
    as('zed', ['update', c1, '--handoff', c2seq, '--handoff-commit', COMMIT, '--handoff-contract', 'interface parse(text); commit def',
      '--handoff-verification', 'parser.test (pass)', '--by', 'zed']);
    as('lead', ['update', c1, '--accept-handoff', c2seq, '--checks', 'the record pins the commit and the contract', '--by', 'lead']);
    // zed wrote c2 in S20, the lead after it: the close re-ranks c2 too, so zed reads c2 again first (stale-view guard)
    as('zed', ['show', c2, '--agent', 'zed']);
    as('zed', ['update', c1, '--close', '--summary', 'parser done', '--by', 'zed']);
    assert.equal(fm(c1).status, 'closed');
  });
  await step('S22 query --decisions lists the question; --decision returns the item to the lead', () => {
    assert.ok(json('lead', ['team', 'query', '--team', 't1', '--decisions', '--json']).some(d => d.slug === c2));
    as('lead', ['update', c2, '--decision', 'A']);
    assert.deepEqual([fm(c2).status, fm(c2).refiner], ['refining', 'lead']);
  });
  await step('S23 the lead re-refines with the decision, the review passes, a member works it', () => {
    as('lead', ['update', c2, '--set-review-refs', 'docs/review/code.md', '--set-estimate', '20', '--set-complexity', 'low', '--by', 'lead']);
    as('lead', ['update', c2, '--append', '## Definition of done\n\n- [ ] the printer prints format A', '--by', 'lead']);
    as('lead', ['update', c2, '--refine-done', '--by', 'lead', '--note', 'decision A']);
    as('lead', ['update', c2, '--request-refinement-review', '--by', 'lead']);
    as('lead', ['update', c2, '--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']);
    as('ann', ['update', c2, '--claim', 'ann']);
    as('ann', ['update', c2, '--request-review', 'any', '--note', 'commit ghi', '--by', 'ann']);
    as('bob', ['update', c2, '--start-review', '--by', 'bob']);
    as('bob', ['update', c2, '--review', 'pass', '--by', 'bob', '--comments', 'ok per docs/review/code.md']);
    as('rex', ['update', c2, '--start-review', '--by', 'rex']);
    as('rex', ['update', c2, '--review', 'pass', '--by', 'rex', '--comments', 'ok per docs/review/code.md']);
    as('ann', ['update', c2, '--close', '--summary', 'printer done', '--by', 'ann']);
  });
  await step('S24 every child done: the lead has its work item reviewed and closes it', () => {
    const p = json('lead', ['team', 'pop', '--team', 't1', '--agent', 'lead', '--json']);
    assert.deepEqual([p.action, p.item], ['continue', w]);
    as('lead', ['update', w, '--request-review', 'any', '--note', 'children and their evidence', '--by', 'lead']);
    as('bob', ['update', w, '--start-review', '--by', 'bob']);
    as('bob', ['update', w, '--review', 'pass', '--by', 'bob', '--comments', 'ok per docs/review/code.md']);
    as('rex', ['update', w, '--start-review', '--by', 'rex']);
    as('rex', ['update', w, '--review', 'pass', '--by', 'rex', '--comments', 'ok per docs/review/code.md']);
    as('lead', ['update', w, '--close', '--summary', 'parser and printer done', '--by', 'lead']);
    assert.equal(fm(w).status, 'closed');
  });
  assert.equal(steps.length, 25);
});
