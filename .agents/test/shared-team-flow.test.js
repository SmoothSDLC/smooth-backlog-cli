// Item 051: the team workflow end to end through the CLI only, one numbered step per backlog step the team-lead and
// team-member skills and the coding model's review-and-split method name (the step map is in item 051). Each step runs
// the command an agent runs, as that agent (QWEN_CODE_AGENT_ID), and checks what it does. HOME is a temporary folder
// with a fake Qwen team, so the hand-off marker is real; local bare repositories only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const DOD = "## Definition of done\n\n- [ ] the parser test passes";
const STOP = /🛑 (\S+): END THE SESSION NOW/;

test('051: the team workflow through the CLI only, step by step', () => {
  const t = mkdtempSync(join(tmpdir(), 'team-flow-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const user = join(t, 'user');
  const tdir = join(user, '.qwen', 'teams', 't1');
  mkdirSync(tdir, { recursive: true });
  const session = joined => writeFileSync(join(tdir, 'config.json'), JSON.stringify({ name: 't1', members: ['archy', 'zed'].map(name => ({ name, agentId: `${name}@t1`, joinedAt: joined })) }));
  session(1000);
  const roster = join(t, 'team.json');
  writeFileSync(roster, JSON.stringify({ archy: {}, zed: {} }));
  const TEAM = { HOME: user, TEAM_NAME: 't1', TEAM_LEAD: 'lead', TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  const as = (agent, args, want = 0) => {
    const env = { ...TEAM, QWEN_CODE_AGENT_ID: `${agent}@t1` };
    if (args[0] === 'update') cli(['query', '--phase', args[1], '--agent', agent], { cwd: cons, tmp: t, env }); // read before the write
    const r = cli(args, { cwd: cons, tmp: t, env });
    assert.ok([].concat(want).includes(r.status), `${agent}: backlog ${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const json = (agent, args) => JSON.parse(as(agent, args, [0, 3]).stdout); // 3: pop and work with nothing to do now
  const fm = slug => parse(readFileSync(join(home, 'acme', 'demo', 'phases', `${slug}.md`), 'utf8')).fm;
  const slugOf = r => r.stdout.split('created phase phases/')[1].split('.md')[0];
  const steps = [];
  const step = (id, fn) => { fn(); steps.push(id); };

  let w; let c1; let c2;
  step('S01 new work item', () => { w = slugOf(as('lead', ['new', '--name', 'parser work', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md', '--estimate', '90', '--complexity', 'medium', '--body', DOD])); });
  step('S02 runner: --set-team and --claim for the lead', () => { as('lead', ['update', w, '--set-team', 't1']); as('lead', ['update', w, '--claim', 'lead']); assert.equal(fm(w).claimed_by, 'lead'); });
  step('S03 query --status --json', () => { assert.ok(JSON.stringify(json('lead', ['query', '--status', '--json'])).includes(w)); });
  step('S04 split: new --split-from (stage refining)', () => {
    c1 = slugOf(as('lead', ['new', '--name', 'parser child', '--split-from', w, '--depends-on', 'none']));
    c2 = slugOf(as('lead', ['new', '--name', 'printer child', '--split-from', w, '--depends-on', 'none', '--review-refs', 'references/review/code.md',
      '--estimate', '20', '--complexity', 'low', '--body', '## Definition of done\n\n- [ ] the printer prints the sample'])); // complete at creation, still refined
    assert.deepEqual([fm(c1).team, fm(c1).stage], ['t1', 'refining']);
  });
  step('S05 --set-depends-on (the DAG)', () => { as('lead', ['update', c2, '--set-depends-on', c1]); assert.deepEqual(fm(c2).depends_on.map(String), [c1]); });
  step('S06 an owner question: --request-decision holds the item in review-hitl', () => {
    as('lead', ['update', c2, '--request-decision', 'Which printer format? Options: A, B. Recommendation: A.', '--by', 'lead']);
    assert.equal(fm(c2).stage, 'review-hitl');
  });
  step('S07 pop: a member refines first; the lead waits', () => {
    assert.deepEqual([json('archy', ['pop', '--agent', 'archy', '--json']).action], ['refine']);
    assert.equal(json('lead', ['pop', '--agent', 'lead', '--json']).action, 'idle');
  });
  step('S08 work marks --refine-start', () => { const p = json('archy', ['work', '--agent', 'archy', '--json']); assert.equal(p.item, c1); assert.equal(fm(c1).refiner, 'archy'); });
  step('S09 refine: --set-review-refs, --set-estimate, --set-complexity, --append the definition of done', () => {
    as('archy', ['update', c1, '--set-review-refs', 'references/review/code.md,references/review/tests.md', '--set-estimate', '30', '--set-complexity', 'low', '--by', 'archy']);
    as('archy', ['update', c1, '--append', '## Definition of done\n\n- [ ] the parser reads the sample', '--by', 'archy']);
  });
  step('S10 --refine-done', () => { as('archy', ['update', c1, '--refine-done', '--by', 'archy', '--note', 'fields and DoD set']); assert.equal(fm(c1).stage, 'refined'); });
  step('S11 lead: --request-refinement-review', () => { as('lead', ['update', c1, '--request-refinement-review', '--by', 'lead']); assert.equal(fm(c1).stage, 'refinement-review'); });
  step('S12 lead records Codex: --refinement-review pass --by codex', () => { as('lead', ['update', c1, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'checkable (codex thread t-1)']); assert.equal(fm(c1).stage, 'ready'); });
  step('S13 query --plan gives the ready item to one member', () => {
    const p = json('lead', ['query', '--plan', '--roster', roster, '--json']);
    assert.deepEqual(p.filter(e => e.item === c1).map(e => e.action), ['claim']);
  });
  step('S14 pop --roster --claim-now claims the ready item', () => {
    const p = json('zed', ['pop', '--agent', 'zed', '--roster', roster, '--claim-now', '--json']);
    assert.deepEqual([p.action, p.item, p.claimed, fm(c1).claimed_by], ['claim', c1, true, 'zed']);
  });
  step('S15 --waiting and --waiting-done', () => { as('zed', ['update', c1, '--waiting', 'ci run 7', '--by', 'zed']); as('zed', ['update', c1, '--waiting-done', '--by', 'zed']); assert.ok(!fm(c1).wait_on); });
  step('S16 query --blocked names the dependency', () => { assert.ok(json('archy', ['query', '--blocked', '--json']).some(b => b.slug === c2)); });
  step('S17 --append evidence, --request-review: the session ends, the marker is written', () => {
    as('zed', ['update', c1, '--append', 'commit abc: parser and its test', '--by', 'zed']);
    const r = as('zed', ['update', c1, '--request-review', 'any', '--note', 'commit abc', '--by', 'zed']);
    assert.equal(STOP.exec(r.stdout.trim().split('\n').at(-1))?.[1], 'zed');
    assert.ok(existsSync(join(tdir, 'handoff', 'zed.json')));
    assert.equal(json('zed', ['pop', '--agent', 'zed', '--json']).action, 'stop');
  });
  step('S18 query --reviewable for another member', () => { assert.ok(json('archy', ['query', '--reviewable', '--agent', 'archy', '--json']).some(r => r.slug === c1)); });
  step('S19 --start-review, --review changes citing a review_ref', () => {
    as('archy', ['update', c1, '--start-review', '--by', 'archy']);
    assert.match(as('archy', ['update', c1, '--review', 'changes', '--by', 'archy', '--comments', 'add a case'], 1).stdout, /must cite/); // a verdict cites a review_ref
    const r = as('archy', ['update', c1, '--review', 'changes', '--by', 'archy', '--comments', 'add the empty-input case (references/review/tests.md)']);
    assert.equal(STOP.exec(r.stdout)?.[1], 'archy');
  });
  step('S20 a fresh session: rework, --request-review, --review pass', () => {
    session(Date.now() + 1000);
    assert.equal(json('zed', ['pop', '--agent', 'zed', '--json']).item, c1);
    as('zed', ['update', c1, '--request-review', 'any', '--note', 'commit def: empty input', '--by', 'zed']);
    session(Date.now() + 2000);
    as('archy', ['update', c1, '--start-review', '--by', 'archy']);
    const r = as('archy', ['update', c1, '--review', 'pass', '--by', 'archy', '--comments', 'ok per references/review/code.md']);
    assert.match(r.stdout, /CLOSE NOW: zed closes it/);
  });
  step('S21 the claimer closes', () => {
    session(Date.now() + 3000);
    as('archy', ['update', c1, '--close', '--summary', 'x', '--by', 'archy'], 1);
    as('zed', ['update', c1, '--close', '--summary', 'parser done', '--by', 'zed']);
    assert.equal(fm(c1).status, 'done');
  });
  step('S22 query --decisions lists the question; --decision returns the item to the lead', () => {
    assert.ok(json('lead', ['query', '--decisions', '--json']).some(d => d.slug === c2));
    as('lead', ['update', c2, '--decision', 'A']);
    assert.deepEqual([fm(c2).stage, fm(c2).refiner], ['refining', 'lead']);
  });
  step('S23 the lead re-refines with the decision, the review passes, a member works it', () => {
    as('lead', ['update', c2, '--set-review-refs', 'references/review/code.md', '--set-estimate', '20', '--set-complexity', 'low', '--by', 'lead']);
    as('lead', ['update', c2, '--append', '## Definition of done\n\n- [ ] the printer prints format A', '--by', 'lead']);
    as('lead', ['update', c2, '--refine-done', '--by', 'lead', '--note', 'decision A']);
    as('lead', ['update', c2, '--request-refinement-review', '--by', 'lead']);
    as('lead', ['update', c2, '--refinement-review', 'pass', '--by', 'codex', '--comments', 'ok (codex thread t-2)']);
    session(Date.now() + 4000);
    as('archy', ['update', c2, '--claim', 'archy']);
    as('archy', ['update', c2, '--request-review', 'any', '--note', 'commit ghi', '--by', 'archy']);
    session(Date.now() + 5000);
    as('zed', ['update', c2, '--start-review', '--by', 'zed']);
    as('zed', ['update', c2, '--review', 'pass', '--by', 'zed', '--comments', 'ok per references/review/code.md']);
    session(Date.now() + 6000);
    as('archy', ['update', c2, '--close', '--summary', 'printer done', '--by', 'archy']);
  });
  step('S24 every child done: the lead has its work item reviewed and closes it', () => {
    const p = json('lead', ['pop', '--agent', 'lead', '--json']);
    assert.deepEqual([p.action, p.item], ['continue', w]);
    as('lead', ['update', w, '--request-review', 'any', '--note', 'children and their evidence', '--by', 'lead']);
    as('zed', ['update', w, '--start-review', '--by', 'zed']);
    as('zed', ['update', w, '--review', 'pass', '--by', 'zed', '--comments', 'ok per references/review/code.md']);
    as('lead', ['update', w, '--close', '--summary', 'parser and printer done', '--by', 'lead']);
    assert.equal(fm(w).status, 'done');
  });
  assert.equal(steps.length, 24);
});
