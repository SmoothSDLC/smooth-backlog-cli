// Team behaviour lives under `backlog team` only: the plain commands take none of its flags, refuse nothing new, and print none of its output.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseItem as parse } from '../../src/shared/frontmatter.js';
import * as index from '../../src/shared/index.js';
import { TEAM_BOOL, TEAM_VALUE } from '../../src/team/update.js';
import { cli, consumer, createdSlug, intoTeam, sharedBacklog, teamNew } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-boundary-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { lead: 'lead', members: ['ann', 'bob'], review: [] } }));
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = '## Definition of done\n\n- [ ] the check holds';
const BASE = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', DOD];
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, plain: true, env: { BACKLOG_AGENT: '', ...env } });
const file = (f, slug) => join(f.folder, 'phases', `${slug}.md`);
const fm = (f, slug) => parse(readFileSync(file(f, slug), 'utf8')).fm;
const plainItem = (f, name = 'plain item') => createdSlug(run(f, ['new', ...BASE(name)]).stdout);
const teamItem = (f, name = 'team item') => {
  const r = teamNew([...BASE(name), '--team', 't1', '--review-refs', 'references/review/code.md', '--estimate', '5'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return createdSlug(r.stdout);
};

test('a plain update takes none of the team flags and prints no notice of where they moved', () => {
  const f = fixture();
  const s = plainItem(f);
  const before = readFileSync(file(f, s), 'utf8');
  for (const flag of [...TEAM_VALUE, 'set-team', ...TEAM_BOOL]) {
    const r = run(f, ['update', s, `--${flag}`, ...(TEAM_BOOL.includes(flag) ? [] : ['x'])]);
    assert.equal(r.status, 2, `--${flag}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /unrecognized arguments/, `--${flag}`);
    assert.doesNotMatch(r.stderr, /moved:/, `--${flag}`);
  }
  assert.equal(readFileSync(file(f, s), 'utf8'), before);
});

test('a plain list has no team view, no --agents, --scope or --lead, and there is no plain query', () => {
  const f = fixture();
  plainItem(f);
  for (const flag of ['--claimable', '--reviewable', '--blocked', '--decisions', '--plan', '--wip', '--agents', '--scope', '--lead']) {
    const r = run(f, ['list', flag, ...(['--agents', '--scope', '--lead'].includes(flag) ? ['x'] : [])]);
    assert.equal(r.status, 2, `${flag}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /unrecognized arguments/, flag);
  }
  const query = run(f, ['query', '--claimable']);
  assert.equal(query.status, 2);
  assert.match(query.stderr, /query is not a backlog command/);
});

test('a plain new takes no --team and no --review-refs, and still takes the generic item options', () => {
  const f = fixture();
  for (const opt of [['--team', 't1'], ['--review-refs', 'references/review/code.md']]) {
    const r = run(f, ['new', ...BASE('x'), ...opt]);
    assert.equal(r.status, 2, `${opt[0]}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /unrecognized arguments/);
  }
  const ok = run(f, ['new', ...BASE('generic'), '--estimate', '5', '--complexity', 'low', '--layer', '2', '--chunk']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const got = fm(f, createdSlug(ok.stdout));
  assert.deepEqual([got.estimate_min, got.complexity, String(got.layer), got.chunk], [5, 'low', '2', true]);
});

test('a plain query of one item shows no missing-fields list; the team query does', () => {
  const f = fixture();
  const s = plainItem(f);
  const plain = JSON.parse(run(f, ['show', s]).stdout);
  assert.equal('missing' in plain, false);
  const team = JSON.parse(run(f, ['team', 'query', '--team', 't1', '--phase', s]).stdout);
  assert.ok(Array.isArray(team.missing));
});

test('a plain status close writes no hand-off record into the item', () => {
  const f = fixture();
  const s = plainItem(f);
  const r = run(f, ['update', s, '--status', 'closed']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = readFileSync(file(f, s), 'utf8');
  assert.doesNotMatch(text, /DEPENDENCY_HANDOFF/);
  assert.equal('handoffs' in fm(f, s), false);
});

// ---- one door: a team's item is changed by `backlog team update` only (a plain update refuses every change of it)

const OF_A_TEAM = /use backlog team update: a team item is changed only there, and its status moves by its team steps/;
// every generic field flag and plain step of `backlog update`, with a value that is valid for it
const FIELD_FLAGS = [
  ['name', ['--name', 'renamed']], ['objective', ['--objective', 'changed']], ['summary', ['--summary', 'changed']], ['location', ['--location', 'elsewhere']],
  ['commit', ['--commit', 'abc123']], ['size_score', ['--size_score', '3']], ['priority', ['--priority', '0']], ['severity', ['--severity', 'critical']],
  ['append', ['--append', 'more text']], ['note', ['--note', 'a note']], ['section', ['--section', 'Notes', '--add-line', 'one']],
  ['set-estimate', ['--set-estimate', '7']], ['set-complexity', ['--set-complexity', 'high']], ['set-layer', ['--set-layer', '2']],
  ['set-chunk', ['--set-chunk', 'yes']], ['set-depends-on', ['--set-depends-on', 'none']],
];
const PLAIN_ONLY = [['status', ['--status', 'closed']], ['branch', ['--branch', 'other']], ['seq', ['--seq', '9']], ['claim', ['--claim', 'ann']], ['release', ['--release', 'ann']],
  ['close', ['--close', '--summary', 'done', '--by', 'ann']], ['dry-run', ['--dry-run', '--note', 'x']]];
const asTeam = (f, agent, args) => cli(['team', 'update', ...args, '--team', 't1', '--agent', agent], { cwd: f.cons, tmp: f.t, plain: true, env: { BACKLOG_AGENT: '' } });

test('a plain update refuses every field flag and step on a team item, with one line naming backlog team update, and writes nothing', () => {
  const f = fixture();
  const s = teamItem(f);
  const before = readFileSync(file(f, s), 'utf8');
  for (const [flag, args] of [...FIELD_FLAGS, ...PLAIN_ONLY]) {
    const r = run(f, ['update', s, ...args]);
    assert.equal(r.status, 1, `--${flag}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, OF_A_TEAM, `--${flag}`);
    assert.equal(r.stdout.trim().split('\n').length, 1, `--${flag}: one line`);
  }
  assert.equal(readFileSync(file(f, s), 'utf8'), before);
});

test('a plain update still restores an unreadable team item: --restore names no change, it runs before the item is read', () => {
  const f = fixture();
  const s = teamItem(f);
  const edit = asTeam(f, 'ann', [s, '--summary', 'good one']);
  assert.equal(edit.status, 0, edit.stdout + edit.stderr);
  writeFileSync(file(f, s), readFileSync(file(f, s), 'utf8').replace(/^summary: .*$/m, 'summary: "cut'));
  const git = (...a) => execFileSync('git', a, { cwd: f.home, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  git('add', '-A'); git('commit', '-q', '-m', 'damaged'); git('push', '-q');
  const r = run(f, ['update', s, '--restore']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fm(f, s).summary, 'good one');
});

test('backlog team update runs the stage rule on every field flag: in stage refining the lead is refused, as a member is not', () => {
  const f = fixture();
  const s = teamItem(f); // stage refining, no refiner: a member refines it
  const before = readFileSync(file(f, s), 'utf8');
  for (const [flag, args] of FIELD_FLAGS.filter(([k]) => k !== 'set-depends-on')) { // the links between items are the lead's
    const r = asTeam(f, 'lead', [s, ...args]);
    assert.equal(r.status, 1, `--${flag}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /a member, not the team lead, refines in the first round/, `--${flag}`);
  }
  assert.equal(readFileSync(file(f, s), 'utf8'), before, 'nothing was written');
  const st = asTeam(f, 'ann', [s, '--status', 'closed']);
  assert.equal(st.status, 1);
  assert.match(st.stdout, /backlog team update takes no --status: the status of a team item moves by its steps/, 'team update has its own refusal, not the plain-update line');
  assert.doesNotMatch(st.stdout, OF_A_TEAM);
});

test('backlog team update runs the incomplete-item guard on every field flag: a member is refused, the lead may edit', () => {
  const f = fixture();
  const s = intoTeam(plainItem(f), { cwd: f.cons, tmp: f.t }); // a team's item in stage ready that lacks its review documents and estimate
  assert.equal(fm(f, s).team, 't1');
  const before = readFileSync(file(f, s), 'utf8');
  for (const [flag, args] of FIELD_FLAGS) {
    const r = asTeam(f, 'ann', [s, ...args]);
    assert.equal(r.status, 1, `--${flag}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /incomplete item, missing .*only the team lead \(lead\) refines it, not ann/, `--${flag}`);
    assert.equal(readFileSync(file(f, s), 'utf8'), before, `--${flag}: nothing was written`);
  }
  run(f, ['team', 'query', '--team', 't1', '--agent', 'lead', '--phase', s]); // the lead reads the item before it writes
  for (const [flag, args] of FIELD_FLAGS) { // the same edits by the lead, one after the other
    const r = asTeam(f, 'lead', [s, ...args]);
    assert.equal(r.status, 0, `--${flag}: ${r.stdout}${r.stderr}`);
  }
  const got = fm(f, s);
  assert.deepEqual([got.name, got.objective, got.summary, got.location, got.commit, got.size_score, got.severity, got.estimate_min, got.complexity, String(got.layer), got.chunk, got.depends_on],
    ['renamed', 'changed', 'changed', 'elsewhere', 'abc123', 3, 'critical', 7, 'high', '2', true, []]);
  const text = readFileSync(file(f, s), 'utf8');
  assert.ok(text.includes('more text') && text.includes('## Notes') && text.includes('- one'));
});

test('a plain replan names no single item: it reorders a team item like any other and leaves its file as it is', () => {
  const f = fixture();
  const a = plainItem(f, 'first');
  const s = teamItem(f);
  const before = readFileSync(file(f, s), 'utf8');
  assert.equal(index.rank(f.folder, 'main', s), 1);
  const r = run(f, ['update', '--replan', `${s},${a}`]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(index.rank(f.folder, 'main', s), 0, 'the team item is now P0');
  assert.equal(readFileSync(file(f, s), 'utf8'), before, 'its file is not rewritten: the order lives in the index');
});

test('a plain update may not move the status of a team item; the team command says so too', () => {
  const f = fixture();
  const s = teamItem(f);
  const r = run(f, ['update', s, '--status', 'closed']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /use backlog team update: a team item is changed only there, and its status moves by its team steps/);
});

test('a plain new does not split a team item', () => {
  const f = fixture();
  const s = teamItem(f);
  const r = run(f, ['new', '--split-from', s, '--name', 'child', '--depends-on', 'none']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`item ${s} belongs to team t1: a split of a team's item is made by backlog team new`));
});

test('backlog team new needs a team and an agent, refuses a team without an entry, and files the item under its team in its first status', () => {
  const f = fixture();
  const fresh = (...args) => cli(['team', 'new', ...args], { cwd: f.cons, tmp: f.t, plain: true, env: { BACKLOG_AGENT: '' } });
  const refs = ['--review-refs', 'references/review/code.md', '--estimate', '5'];
  const noTeam = fresh(...BASE('x'), '--agent', 'lead');
  assert.equal(noTeam.status, 2, noTeam.stdout + noTeam.stderr);
  assert.match(noTeam.stderr, /needs --team/);
  const noAgent = fresh(...BASE('x'), '--team', 't1');
  assert.equal(noAgent.status, 2, noAgent.stdout + noAgent.stderr);
  assert.match(noAgent.stderr, /needs --agent/);
  const unknown = fresh(...BASE('x'), '--team', 'nope', '--agent', 'lead');
  assert.equal(unknown.status, 1, unknown.stdout + unknown.stderr);
  assert.match(unknown.stdout, /team nope is not configured/);
  const made = fresh(...BASE('x'), ...refs, '--team', 't1', '--agent', 'lead');
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const s = createdSlug(made.stdout);
  assert.deepEqual([fm(f, s).team, fm(f, s).status, fm(f, s).refiner, fm(f, s).estimate_min, fm(f, s).updated_by], ['t1', 'new', '', 5, 'lead']);
  assert.deepEqual(fm(f, s).review_refs, ['references/review/code.md']);
  const child = fresh('--name', 'child', '--split-from', s, '--team', 't1', '--agent', 'lead');
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.deepEqual([fm(f, createdSlug(child.stdout)).team, fm(f, createdSlug(child.stdout)).status], ['t1', 'new']);
  const status = fresh(...BASE('y'), '--status', 'ready', '--team', 't1', '--agent', 'lead');
  assert.equal(status.status, 1);
  assert.match(status.stdout, /--status cannot be combined with --team/);
});

test('a team item is created, claimed and read through the team spellings', () => {
  const f = fixture();
  const s = teamItem(f);
  assert.deepEqual([fm(f, s).team, fm(f, s).status], ['t1', 'new']);
  const r = run(f, ['team', 'update', s, '--team', 't1', '--agent', 'ann', '--refine-start']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fm(f, s).status, 'refining');
});

// ---- the boundary in the code: the plain commands know no team variable, no team file and no team module

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const files = root => readdirSync(root).flatMap(n => { const p = join(root, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []; });
const importsOf = text => [...text.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1] ?? m[2]).filter(p => p.startsWith('.'));
const NAMES = /TEAM_NAME|TEAM_REPOSITORY|TEAM_BRANCH|TEAM_LEAD|teams\.json/;
// the modules outside src/team/ that the team code may import
const SHARED = ['errors.js', 'storage.js', 'shared/dependencies.js', 'shared/frontmatter.js', 'shared/help-parts.js', 'shared/index.js', 'shared/new.js', 'shared/query.js', 'shared/safety.js', 'shared/seam.js',
  'shared/seen.js', 'shared/setup.js', 'shared/status.js', 'shared/store.js', 'shared/sync.js', 'shared/text.js', 'shared/update.js', 'shared/wip-limits.js'];
const NOT_YET = [];

function breaches(root) {
  const out = [];
  for (const file of files(root)) {
    const rel = relative(root, file).split(sep).join('/');
    const text = readFileSync(file, 'utf8');
    if (rel.startsWith('team/')) {
      for (const spec of importsOf(text)) {
        const target = relative(root, resolve(dirname(file), spec)).split(sep).join('/');
        if (!target.startsWith('team/') && !SHARED.includes(target)) out.push(`${rel} imports ${target}, which the team code may not use`);
      }
      continue;
    }
    if (!NOT_YET.includes(rel) && NAMES.test(text)) out.push(`${rel} names a team variable or the team configuration file`);
    if (rel !== 'shared/router.js') for (const spec of importsOf(text)) if (spec.includes('/team/')) out.push(`${rel} imports ${spec}`);
  }
  return out;
}

test('no file outside src/team/ names a team variable or the team file, imports team code (the router apart), and the team code imports only the listed shared modules', () => {
  assert.deepEqual(breaches(SRC), []);
});

test('the guard finds a plain command reading a team variable, a team import, and a team module reaching into a plain one', () => {
  const t = mkdtempSync(join(tmpdir(), 'guard-'));
  dirs.push(t);
  const copy = join(t, 'src');
  cpSync(SRC, copy, { recursive: true });
  assert.deepEqual(breaches(copy), []);
  appendFileSync(join(copy, 'shared', 'store.js'), "\nexport const leaked = process.env.TEAM_NAME;\n");
  appendFileSync(join(copy, 'shared', 'move.js'), "\nimport { teamName } from '../team/team.js';\n");
  appendFileSync(join(copy, 'team', 'pop.js'), "\nimport { move } from '../shared/move.js';\n");
  const found = breaches(copy);
  assert.equal(found.length, 3, found.join('\n'));
  assert.ok(found.some(x => x.startsWith('shared/store.js')) && found.some(x => x.startsWith('shared/move.js')) && found.some(x => x.startsWith('team/pop.js')), found.join('\n'));
});
