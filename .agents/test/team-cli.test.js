// Tests for `backlog team`: the router, and teams and flows defined from JSON. Local bare repositories only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { changeStored, cli, consumer, createdSlug, itemPath, sharedBacklog } from './shared-fixtures.js';

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
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--complexity', 'low', '--body', DOD];
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', SMOOTH_BACKLOG_CLI_AGENT: '', ...env } }); // every command here names its agent; a session agent (SMOOTH_BACKLOG_CLI_AGENT) would have to be the same one

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
  changeStored(f.home, itemPath(f.folder, s), { team: 't1', status: 'new', refiner: '' }, 'team item');
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



test('no instruction of the engine tells an agent to run a team step through the plain update', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { TEAM_BOOL, TEAM_VALUE } = await import('./shared-fixtures.js');
  const dir = new URL('../../src/shared/', import.meta.url);
  const step = new RegExp(`backlog update [^\`'"\\n]*--(?:${[...TEAM_BOOL, ...TEAM_VALUE].filter(f => f !== 'by').join('|')})(?![\\w-])`);
  for (const name of readdirSync(dir).filter(n => n.endsWith('.js') && n !== 'aliases.js')) {
    for (const line of readFileSync(new URL(name, dir), 'utf8').split('\n')) if (!line.trimStart().startsWith('//')) assert.doesNotMatch(line, step, name);
  }
});

test('team define keeps review_only, a list of names within the members, in the entry', () => {
  const f = fixture(); published(f);
  const def = extra => run(f, ['team', 'define', '--file', defFile(f, { ...TEAM, ...extra })]);
  const bad = def({ review_only: ['stranger'] });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /review_only: must be a list of member names/);
  assert.equal(def({ review_only: 'bob' }).status, 2);
  const good = def({ review_only: ['bob'] });
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.deepEqual(teams(f)[TEAM.name].review_only, ['bob']);
});

test('the router names the six words for an unknown word, migrate converts a markdown folder, and define and workflow are still routed', () => {
  const f = fixture();
  const unknown = run(f, ['team', 'frobnicate']);
  assert.equal(unknown.status, 2); assert.match(unknown.stderr, /team needs a subcommand \(new, update, pop, query, validate, migrate\)/);
  assert.doesNotMatch(unknown.stderr, /define|workflow/);
  const noTeam = run(f, ['team', 'migrate'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: '' });
  assert.equal(noTeam.status, 2); assert.match(noTeam.stderr, /a team command needs a team/);
  mkdirSync(join(f.folder, 'phases'), { recursive: true });
  writeFileSync(join(f.folder, 'phases', '001-x.md'), '---\nphase: 001-x\nseq: 1\nname: x\n---\nbody\n');
  sh(f.home, 'add', 'acme'); sh(f.home, 'commit', '-q', '-m', 'item'); sh(f.home, 'push', '-q');
  const migrate = run(f, ['team', 'migrate', '--team', 't1']);
  assert.equal(migrate.status, 0, migrate.stdout + migrate.stderr);
  assert.equal(existsSync(join(f.folder, 'phases', '001-x.json')), true);
  const shown = run(f, ['team', 'workflow', '--show', 'team']);
  assert.equal(shown.status, 0, shown.stdout + shown.stderr);
  assert.match(run(f, ['team', 'define']).stderr, /cannot read|no JSON|expected/);
});
