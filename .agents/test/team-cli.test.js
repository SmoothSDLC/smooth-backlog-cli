// Tests for `backlog team`: the team steps run under it, the earlier plain spelling still works with a notice, the
// configuration supplies the user and team, and teams and flows are defined from JSON. Local bare repositories only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { spawnSync } from 'node:child_process';
import { cli, consumer, createdSlug, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-cli-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { lead: 'lead', members: ['ann', 'bob'], review: [] } }));
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD];
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, notices: true, env: { TEAM_LEAD: 'lead', ...env } });
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
// a refined, ready item of team t1
function ready(f) {
  const s = createdSlug(run(f, ['new', ...NEW('item')]).stdout);
  for (const a of [['--set-team', 't1'], ['--refine-start', '--by', 'ann'], ['--refine-done', '--by', 'ann', '--note', 'r'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'complete', '--by', 'rex', '--comments', 'ok']]) {
    run(f, ['query', '--phase', s, '--agent', a.includes('--by') ? a[a.indexOf('--by') + 1] : 'ann']);
    assert.equal(run(f, ['update', s, ...a]).status, 0);
  }
  return s;
}

test('team update claims for the agent; --team is required', () => {
  const f = fixture();
  const s = ready(f);
  run(f, ['query', '--phase', s, '--agent', 'zz']);
  const missing = run(f, ['team', 'update', s, '--agent', 'ann', '--claim'], { TEAM_NAME: '' });
  assert.equal(missing.status, 2); assert.match(missing.stderr, /--team/);
  assert.equal(fm(f, s).status, 'ready');
  run(f, ['query', '--phase', s, '--agent', 'ann']);
  const c = run(f, ['team', 'update', s, '--team', 't1', '--agent', 'ann', '--claim']);
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.equal(c.stderr, '');
  assert.equal(fm(f, s).status, 'in progress');
  assert.equal(fm(f, s).claimed_by, 'ann');
});

test('the plain update still takes a team step and says where it moved; a status word on a team item is refused', () => {
  const f = fixture();
  const s = createdSlug(run(f, ['new', ...NEW('plain')]).stdout);
  assert.equal(run(f, ['update', s, '--set-team', 't1']).status, 0);
  run(f, ['query', '--phase', s, '--agent', 'ann']);
  const r = run(f, ['update', s, '--refine-start', '--by', 'ann']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /^moved: use backlog team update <item> --team <t> --agent <a> --refine-start$/m);
  const t = run(f, ['team', 'update', s, '--team', 't1', '--agent', 'ann', '--status', 'closed']);
  assert.notEqual(t.status, 0);
  assert.equal(fm(f, s).status, 'refining');
});

test('team update runs a step with the agent and no notice', () => {
  const f = fixture();
  const s = createdSlug(run(f, ['new', ...NEW('step')]).stdout);
  run(f, ['update', s, '--set-team', 't1']);
  run(f, ['query', '--phase', s, '--agent', 'ann']);
  const r = run(f, ['team', 'update', s, '--team', 't1', '--agent', 'ann', '--refine-start']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(fm(f, s).status, 'refining');
  assert.equal(fm(f, s).refiner, 'ann');
});

// ---- backlog team define / workflow
const sh = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
// the configuration is published like in a real backlog: teams.json is a committed file at the root
function published(f) {
  sh(f.home, 'add', '-f', 'teams.json'); sh(f.home, 'commit', '-q', '-m', 'teams'); sh(f.home, 'push', '-q');
}
const defFile = (f, obj, name = 'def.json') => { const p = join(f.t, name); writeFileSync(p, JSON.stringify(obj)); return p; };
const TEAM = { name: 'gold', lead: 'ann', members: ['bob', 'cy'], external_reviewers: ['xia'], review: [{ stage: 'peer', reviewers: 'members', count: 1 }, { stage: 'external', reviewers: 'external_reviewers', count: 1 }], wip: { agent: 1, team: 3 } };
const teams = f => JSON.parse(readFileSync(join(f.home, 'teams.json'), 'utf8'));

test('team define registers a team beside the others, commits it, and another checkout sees it after a pull', () => {
  const f = fixture(); published(f);
  const r = run(f, ['team', 'define', '--file', defFile(f, TEAM)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✅ team gold defined: lead ann, 2 members, flow team/);
  assert.deepEqual(teams(f).t1, { lead: 'lead', members: ['ann', 'bob'], review: [] }); // the hand-written entry is kept as it was
  assert.deepEqual(teams(f).gold, { lead: 'ann', members: ['bob', 'cy'], external_reviewers: ['xia'], review: [{ stage: 'peer', count: 1 }, { stage: 'external', count: 1 }], wip: { agent: 1, team: 3 } });
  assert.match(sh(f.home, 'log', '-1', '--format=%s').stdout, /team gold defined/);
  assert.equal(sh(f.home, 'status', '--porcelain', '--', 'teams.json').stdout, '');
  const other = join(f.t, 'other'); sh(f.t, 'clone', '-q', join(f.t, 'origins', 'acme', 'backlog-repo.git'), other);
  assert.equal(JSON.parse(readFileSync(join(other, 'teams.json'), 'utf8')).gold.lead, 'ann'); // pushed
  const again = run(f, ['team', 'define', '--file', defFile(f, TEAM)]);
  assert.equal(again.status, 0); assert.match(again.stdout, /team gold unchanged/);
  assert.equal(sh(f.home, 'rev-list', '--count', 'HEAD').stdout, sh(other, 'rev-list', '--count', 'HEAD').stdout.replace(/\d+/, n => String(Number(n) + 0))); // no second commit
});

test('team define without review takes the flow default; a bad file is refused naming every field, nothing written', () => {
  const f = fixture(); published(f);
  const before = readFileSync(join(f.home, 'teams.json'), 'utf8');
  const bad = [
    [{ ...TEAM, lead: undefined }, /lead/], [{ ...TEAM, review: [{ stage: 'nonsense', reviewers: 'members', count: 1 }] }, /nonsense/],
    [{ ...TEAM, members: [] }, /members/], [{ ...TEAM, members: ['ann', 'bob'] }, /lead: the lead is not one of the members/],
    [{ ...TEAM, name: 'Bad Name' }, /name/], [{ ...TEAM, workflow: 'ghost' }, /workflow/], [{ ...TEAM, extra: 1 }, /extra/],
    [{ ...TEAM, external_reviewers: [] }, /external_reviewers is empty/],
  ];
  for (const [def, text] of bad) {
    const r = run(f, ['team', 'define', '--file', defFile(f, def)]);
    assert.equal(r.status, 2, JSON.stringify(def) + r.stdout + r.stderr); assert.match(r.stderr, text);
  }
  assert.equal(run(f, ['team', 'define', '--file', defFile(f, [])]).status, 2); // an array is no definition
  writeFileSync(join(f.t, 'junk.json'), 'not json');
  assert.equal(run(f, ['team', 'define', '--file', join(f.t, 'junk.json')]).status, 2);
  assert.equal(readFileSync(join(f.home, 'teams.json'), 'utf8'), before);
  const { review, wip, ...lean } = TEAM;
  assert.equal(run(f, ['team', 'define', '--file', defFile(f, lean)]).status, 0);
  assert.deepEqual(teams(f).gold.review, [{ stage: 'peer', count: 1 }, { stage: 'external', count: 1 }]);
});

test('team define does not replace a team that has open items; it names the count', () => {
  const f = fixture(); published(f);
  const s = createdSlug(run(f, ['new', ...NEW('open')]).stdout);
  assert.equal(run(f, ['update', s, '--set-team', 't1']).status, 0);
  const r = run(f, ['team', 'define', '--file', defFile(f, { name: 't1', lead: 'zed', members: ['y'], review: [] })]);
  assert.equal(r.status, 2); assert.match(r.stderr, /team t1 has 1 open items; register the new composition under another name/);
  assert.equal(teams(f).t1.lead, 'lead');
  assert.equal(run(f, ['team', 'define', '--file', defFile(f, { name: 't1b', lead: 'zed', members: ['y'], review: [] })]).status, 0);
});

test('team workflow registers a flow from JSON, shows it, and refuses a flow that traps items', () => {
  const f = fixture(); published(f);
  const flow = JSON.parse(readFileSync(join(process.cwd(), 'templates', 'workflows', 'team.json'), 'utf8'));
  const two = defFile(f, { ...flow, workflow: 'team-2' }, 'flow.json');
  const r = run(f, ['team', 'workflow', '--file', two]);
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /workflow team-2 registered/);
  assert.equal(JSON.parse(run(f, ['team', 'workflow', '--show', 'team-2']).stdout).workflow, 'team-2');
  assert.equal(JSON.parse(run(f, ['team', 'workflow', '--show', 'team']).stdout).workflow, 'team'); // the shipped flow
  assert.match(run(f, ['team', 'workflow', '--file', two]).stdout, /unchanged/);
  assert.equal(run(f, ['team', 'define', '--file', defFile(f, { ...TEAM, name: 'silver', workflow: 'team-2' })]).status, 0);
  const trap = { ...flow, workflow: 'trap', steps: { ...flow.steps, close: { ...flow.steps.close, from: ['closed'] } } };
  const t = run(f, ['team', 'workflow', '--file', defFile(f, trap, 'trap.json')]);
  assert.equal(t.status, 2); assert.match(t.stderr, /no chain of steps leads from/);
  assert.equal(run(f, ['team', 'workflow', '--show', 'trap']).status, 2);
});

// ---- backlog team query: the team views
test('the team views run under team query; the plain query refuses them and points at it; a team without an entry is refused', () => {
  const f = fixture();
  ready(f);
  for (const view of ['--claimable', '--reviewable', '--blocked', '--decisions', '--plan', '--wip']) {
    const plain = run(f, ['query', view]);
    assert.equal(plain.status, 2, `${view}: ${plain.stdout}${plain.stderr}`);
    assert.match(plain.stderr, new RegExp(`^❌ backlog: ${view} is a team view: use backlog team query --team <team> --agent <name> ${view}`));
    assert.equal(plain.stdout, '');
  }
  const viewed = run(f, ['team', 'query', '--team', 't1', '--claimable', '--json']);
  assert.equal(viewed.status, 0, viewed.stdout + viewed.stderr);
  assert.deepEqual(JSON.parse(viewed.stdout).map(x => x.name), ['item']);
  assert.equal(run(f, ['team', 'query', '--team', 't1', '--agent', 'ann', '--claimable', '--json']).status, 0);
  const ghost = run(f, ['team', 'query', '--team', 'ghost', '--claimable']);
  assert.equal(ghost.status, 1); assert.match(ghost.stdout, /team ghost is not configured in the backlog configuration/);
});
