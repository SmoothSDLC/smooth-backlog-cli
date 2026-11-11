// Team behaviour lives under `backlog team` only: the plain commands take none of its flags, refuse nothing new, and print none of its output.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseItem as parse } from '../../src/shared/item-file.js';
import * as index from '../../src/shared/index.js';
import { TEAM_BOOL, TEAM_VALUE, cli, consumer, createdSlug, changeStored, damageItem, itemPath, readStored, sharedBacklog, writeStored } from './shared-fixtures.js';

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
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, plain: true, env: { SMOOTH_BACKLOG_CLI_AGENT: '', ...env } });
const file = (f, slug) => itemPath(f.folder, slug);
const fm = (f, slug) => parse(readFileSync(file(f, slug), 'utf8')).fm;
const plainItem = (f, name = 'plain item') => createdSlug(run(f, ['new', ...BASE(name)]).stdout);
// an item of a team as it is stored: made by the plain new, then the team, the status, the refiner and the review documents are written into its file and published
const teamItem = (f, name = 'team item') => {
  const r = run(f, ['new', ...BASE(name), '--estimate', '5'], { SMOOTH_BACKLOG_CLI_AGENT: 'lead' }); // the creator is not the agent that acts later: its read of the item is not the later agents'
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = createdSlug(r.stdout);
  changeStored(f.home, file(f, slug), { team: 't1', status: 'new', refiner: '', review_refs: ['references/review/code.md'] }, 'team item');
  return slug;
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

test('a plain show of one item shows no missing-fields list', () => {
  const f = fixture();
  const s = plainItem(f);
  const plain = JSON.parse(run(f, ['show', s]).stdout);
  assert.equal('missing' in plain, false);
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
test('a plain update does not see a team item for any field flag or step: one line, no such item, and nothing is written', () => {
  const f = fixture();
  const s = teamItem(f);
  const before = readFileSync(file(f, s), 'utf8');
  for (const [flag, args] of [...FIELD_FLAGS, ...PLAIN_ONLY]) {
    const r = run(f, ['update', s, ...args]);
    assert.equal(r.status, 1, `--${flag}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, new RegExp(`^❌ no phase '${s}'`), `--${flag}`);
    assert.equal(r.stdout.trim().split('\n').length, 1, `--${flag}: one line`);
  }
  assert.equal(readFileSync(file(f, s), 'utf8'), before);
});

test('a plain replan does not see a team item it names: the team item keeps its place, and items without a team are reordered', () => {
  const f = fixture();
  const a = plainItem(f, 'first');
  const s = teamItem(f);
  const before = readFileSync(file(f, s), 'utf8');
  assert.equal(index.rank(f.folder, 'main', s), 1);
  const r = run(f, ['update', '--replan', `${s},${a}`]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(index.rank(f.folder, 'main', s), 1, 'the team item keeps its place');
  assert.equal(run(f, ['update', '--replan', a]).status, 0);
  assert.equal(readFileSync(file(f, s), 'utf8'), before, 'its file is not rewritten: the order lives in the index');
});

test('a plain update does not see a team item, so it cannot move its status', () => {
  const f = fixture();
  const s = teamItem(f);
  const r = run(f, ['update', s, '--status', 'closed']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, new RegExp(`^❌ no phase '${s}'`));
});

test('a plain new does not see a team item to split', () => {
  const f = fixture();
  const s = teamItem(f);
  const r = run(f, ['new', '--split-from', s, '--name', 'child', '--depends-on', 'none']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`--split-from: no phase '${s}'`));
});

// ---- the boundary in the code: the plain commands know no team variable, no team file and no team module

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const files = root => readdirSync(root).flatMap(n => { const p = join(root, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []; });
const importsOf = text => [...text.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1] ?? m[2]).filter(p => p.startsWith('.'));
const NAMES = /SMOOTH_BACKLOG_CLI_TEAM_NAME|SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY|SMOOTH_BACKLOG_CLI_TEAM_BRANCH|SMOOTH_BACKLOG_CLI_TEAM_LEAD|teams\.json/;
// the modules outside src/team/ that the team code may import
const SHARED = ['errors.js', 'storage.js', 'shared/dependencies.js', 'shared/help-parts.js', 'shared/index.js', 'shared/item-definition.js', 'shared/item-file.js', 'shared/item-json.js', 'shared/new.js', 'shared/numbers.js', 'shared/query.js', 'shared/safety.js', 'shared/seam.js',
  'shared/seen.js', 'shared/setup.js', 'shared/status.js', 'shared/store.js', 'shared/sync.js', 'shared/team-publish.js', 'shared/text.js', 'shared/update.js', 'shared/wip-limits.js'];
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
  appendFileSync(join(copy, 'shared', 'store.js'), "\nexport const leaked = process.env.SMOOTH_BACKLOG_CLI_TEAM_NAME;\n");
  appendFileSync(join(copy, 'shared', 'move.js'), "\nimport { teamName } from '../team/team.js';\n");
  appendFileSync(join(copy, 'team', 'pop.js'), "\nimport { move } from '../shared/move.js';\n");
  const found = breaches(copy);
  assert.equal(found.length, 3, found.join('\n'));
  assert.ok(found.some(x => x.startsWith('shared/store.js')) && found.some(x => x.startsWith('shared/move.js')) && found.some(x => x.startsWith('team/pop.js')), found.join('\n'));
});

test('a plain update still restores an unreadable team item: --restore names no change, it runs before the item is read', () => {
  const f = fixture();
  const s = teamItem(f);
  const git = (...a) => execFileSync('git', a, { cwd: f.home, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  const { fm: was, body } = readStored(file(f, s));
  writeStored(file(f, s), { ...was, summary: 'good one' }, body); // the last good version, committed and published
  git('add', '-A'); git('commit', '-q', '-m', 'good one'); git('push', '-q');
  assert.equal(fm(f, s).summary, 'good one');
  damageItem(file(f, s), 'name');
  git('add', '-A'); git('commit', '-q', '-m', 'damaged'); git('push', '-q');
  const refused = run(f, ['update', s, '--summary', 'other']); // any other command stops at the unreadable item
  assert.notEqual(refused.status, 0, refused.stdout);
  const r = run(f, ['update', s, '--restore']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fm(f, s).summary, 'good one');
  assert.equal(fm(f, s).team, 't1');
});
