// B22b: the plan of a folder (readFolder, planFolder) in real temporary git repositories: what converts, every stop, the counter and the refs; it writes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { readFolder, planFolder } from '../../src/team/migrate-plan.js';
import { foreignItem } from '../../src/shared/dependencies.js';
import { load } from '../../src/shared/store.js';
import { toItemJson } from '../../src/shared/item-json.js';
import { readItems } from '../../src/team/item.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout;
};
const commit = (cwd, m = 'c') => { git(cwd, 'add', '-A'); git(cwd, 'commit', '-q', '-m', m); };
const L = 'acme/app';
const pad = n => String(n).padStart(3, '0');
const md = (n, extra = '', name = `${pad(n)}-x`) => `---\nphase: ${name}\nseq: ${n}\nname: N${n}\nstatus: pending\n${extra}---\nbody ${n}\n`;
function setup(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'migrate-plan-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = sharedBacklog(tmp);
  const dir = join(home, 'acme', 'app');
  const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  return { tmp, home, dir, put };
}
const plan = (dir, opts = {}) => planFolder(readFolder(dir), { repo: L, ...opts });
const snapshot = dir => JSON.stringify(readdirSync(dir, { recursive: true }).sort().map(f => { try { return [f, readFileSync(join(dir, f), 'utf8')]; } catch { return [f]; } }));

test('open and archived items convert in place, the plan writes nothing and keeps the header', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1, 'priority: 5\n')); put('archive/2026/002-x.md', md(2)); commit(home);
  const before = snapshot(dir);
  const p = plan(dir);
  assert.deepEqual(p.failures, []);
  assert.deepEqual(p.converted.map(c => [c.from, c.to, c.seq, c.archived]), [['archive/2026/002-x.md', 'archive/2026/002-x.json', 2, true], ['phases/001-x.md', 'phases/001-x.json', 1, false]]);
  const c = p.converted[1];
  assert.equal(c.fm.priority, 5, 'the header stays available for the order of a folder with no index');
  assert.equal(c.item.slug, '001-x'); assert.equal(c.body, 'body 1\n');
  assert.equal(snapshot(dir), before, 'no byte changed');
  assert.equal(git(home, 'status', '--porcelain'), '');
});

test('a .md file without a header is no item', t => {
  const { home, dir, put } = setup(t);
  put('phases/README.md', 'just text\n'); put('phases/001-x.md', md(1)); commit(home);
  const r = readFolder(dir);
  assert.deepEqual(r.items.map(i => i.path), ['phases/001-x.md']);
});

test('an unreadable header stops the migration: every bad file gets its line, with the file as owner/name/path and no absolute path', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', '---\nphase: 001-x\nseq: nope\nname: A\n---\n'); put('archive/002-x.md', md(2).replace('name: N2\n', '')); put('phases/003-x.md', md(3)); commit(home);
  const p = plan(dir);
  assert.equal(p.failures.length, 2);
  assert.match(p.failures[0], /^acme\/app\/archive\/002-x\.md: the header cannot be read \(name is missing\); restore it with git and run backlog team migrate again$/);
  assert.match(p.failures[1], /^acme\/app\/phases\/001-x\.md: the header cannot be read \(seq is missing or not a whole number\)/);
  assert.equal(p.converted.length, 1, 'the good item is still converted in the plan');
  for (const f of p.failures) assert.ok(!f.includes(dir) && !f.includes(tmpdir()), f);
});

test('two items with one number stop the migration, live and archived counted together', t => {
  const { home, dir, put } = setup(t);
  put('phases/004-a.md', md(4, '', '004-a')); put('phases/004-b.md', md(4, '', '004-b')); put('phases/005-c.md', md(5, '', '005-c')); put('archive/005-d.md', md(5, '', '005-d')); commit(home);
  assert.deepEqual(plan(dir).failures, [
    'acme/app: number 4 is held by 004-a and 004-b; give one of them a free number in markdown and run again',
    'acme/app: number 5 is held by 005-c and 005-d; give one of them a free number in markdown and run again',
  ]);
});

test('a markdown item and a JSON item holding one number stop the migration (a branch merged from before the migration)', t => {
  const { home, dir, put } = setup(t);
  put('phases/007-a.json', '{"seq": 7}\n'); put('phases/007-b.md', md(7, '', '007-b')); put('archive/008-z.json', '{}'); put('phases/008-y.md', md(8, '', '008-y')); commit(home);
  const r = readFolder(dir);
  assert.equal(r.jsonCount, 2);
  assert.deepEqual(r.failures, [
    'acme/app: number 7 is held by 007-a and 007-b; give one of them a free number in markdown and run again',
    'acme/app: number 8 is held by 008-y and 008-z; give one of them a free number in markdown and run again',
  ]);
});

test('a JSON file name that is taken stops the migration, and is not also a duplicate number', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1)); put('phases/001-x.json', '{}'); commit(home);
  assert.deepEqual(readFolder(dir).failures, ['acme/app/phases/001-x.json exists; remove it or rename it']);
});

test('a JSON file name that would be too long stops the migration', t => {
  const { home, dir, put } = setup(t);
  const stem = `001-${'a'.repeat(248)}`; // 252 bytes: the .md name is 255, the .json name 257
  put(`phases/${stem}.md`, md(1, '', stem)); commit(home);
  assert.deepEqual(readFolder(dir).failures, [`acme/app/phases/${stem}.md: the JSON file name would be too long; shorten the item's name in markdown and run again`]);
});

test('a symbolic link in a folder stops the migration and is listed with the other cases', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1)); put('phases/002-x.md', '---\nphase: 002-x\nseq: 2\n---\n'); put('target.txt', 't'); symlinkSync('../target.txt', join(dir, 'phases', '003-link.md')); commit(home);
  const p = plan(dir);
  assert.equal(p.failures.length, 2);
  assert.ok(p.failures.some(f => f === 'acme/app/phases/003-link.md: Symlink destination is unsupported. Resolve it before using backlog.'), p.failures.join('|'));
  assert.ok(p.failures.some(f => /002-x\.md: the header cannot be read/.test(f)));
  for (const f of p.failures) assert.ok(!f.includes(dir), f);
});

test('a number above the bound in a file name stops the migration, listed once', t => {
  const { home, dir, put } = setup(t);
  put('phases/2000000000-big.md', md(1, '', '2000000000-big')); put('phases/001-x.md', md(1)); commit(home);
  const p = plan(dir);
  assert.deepEqual(p.failures, ['acme/app/phases/2000000000-big.md: the number in the file name is above 1000000000; rename the file in markdown and run backlog team migrate again']);
  assert.equal(p.failures.length, 1, 'the walk listed it, the counter does not list it again');
});

test('a header number above the bound stops the migration', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1).replace('seq: 1', 'seq: 2000000000')); commit(home);
  assert.match(plan(dir).failures[0], /acme\/app\/phases\/001-x\.md: the header cannot be read \(seq 2000000000 is outside the numbers/);
});

test('a shallow clone stops the migration with the text of the counter, next to the other cases', t => {
  const { tmp, home, dir, put } = setup(t);
  put('phases/001-x.md', md(1)); commit(home); git(home, 'push', '-q'); put('phases/002-x.md', md(2)); commit(home); git(home, 'push', '-q');
  const shallow = join(tmp, 'shallow');
  git(tmp, 'clone', '-q', '--depth', '1', `file://${join(tmp, 'origins', 'acme', 'backlog-repo.git')}`, shallow);
  writeFileSync(join(shallow, 'acme', 'app', 'phases', '009-bad.md'), '---\nphase: 009-bad\n---\n');
  const p = plan(join(shallow, 'acme', 'app'));
  assert.ok(p.failures.includes('the backlog clone is shallow, so numbers cannot be proven unused: run git fetch --unshallow'), p.failures.join('|'));
  assert.ok(p.failures.some(f => /009-bad\.md: the header cannot be read/.test(f)), 'the other cases are listed too');
  assert.equal(p.counter, null);
});

test('the folder gets its counter from its whole history: a deleted item file and a numbers.json above the files', t => {
  const { home, dir, put } = setup(t);
  put('phases/012-gone.md', md(12, '', '012-gone')); put('phases/001-x.md', md(1)); commit(home);
  unlinkSync(join(dir, 'phases', '012-gone.md')); commit(home, 'deleted');
  assert.equal(plan(dir).counter, 12);
  put('numbers.json', '{"last": 40}\n');
  assert.equal(plan(dir).counter, 40);
  assert.equal(plan(dir).converted.length, 1);
});

test('the migration reads only the folder of its repository: a second folder stays untouched byte for byte', t => {
  const { home, dir, put } = setup(t);
  const other = join(home, 'acme', 'other');
  mkdirSync(join(other, 'phases'), { recursive: true }); writeFileSync(join(other, 'phases', '001-o.md'), md(1, '', '001-o')); writeFileSync(join(other, 'phases', '001-bad.md'), '---\nphase: x\n---\n');
  put('phases/001-x.md', md(1)); commit(home);
  const before = snapshot(other);
  const p = plan(dir);
  assert.deepEqual([p.failures, p.converted.map(c => c.from)], [[], ['phases/001-x.md']]);
  assert.equal(snapshot(other), before);
});

test('a folder already in JSON converts nothing and reports its items; hasTeamItem sees JSON and markdown items, not an unbound one', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.json', JSON.stringify({ seq: 1, slug: '001-x', name: 'A', team: 't1', repository: L, branch: '', created: null, updated: '', updated_by: '', fields: {}, body: '', history: [] })); commit(home);
  const r = readFolder(dir);
  const p = planFolder(r, { repo: L });
  assert.deepEqual([p.converted, p.jsonCount, p.failures, r.hasTeamItem, r.items[0].team], [[], 1, [], true, 't1']);
  const { dir: d2, put: put2 } = setup(t);
  put2('phases/001-x.md', md(1, 'team: \n')); put2('phases/002-x.md', md(2, 'team: null\n'));
  assert.equal(readFolder(d2).hasTeamItem, false);
  put2('phases/004-x.md', '---\nphase: 004-x\nteam: web\nseq: [\n---\n');
  assert.equal(readFolder(d2).hasTeamItem, true, 'a header that cannot be read still shows its team line');
  const { dir: d3, put: put3 } = setup(t);
  put3('archive/003-x.md', md(3, 'team: web\n'));
  assert.equal(readFolder(d3).hasTeamItem, true);
});

test('depends_on resolves a slug of the folder (markdown or JSON, live or archived); the others come back as unresolved data and stop nothing', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1, 'depends_on: 002-x, 003-x, ghost, acme/other#4\n')); put('phases/002-x.md', md(2, '', '002-x')); put('archive/003-x.json', '{}'); commit(home);
  const p = plan(dir);
  assert.deepEqual(p.failures, []);
  const c = p.converted.find(x => x.seq === 1);
  assert.deepEqual(c.item.fields.depends_on, [2, 3, 'ghost', 'acme/other#4']);
  assert.deepEqual(p.unresolved, ['acme/app/phases/001-x.md: depends_on ghost names no item of the folder']);
});

test("the team's field order reaches the conversion", t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1, 'team: t1\nzeta: 1\nalpha: 2\n')); commit(home);
  const keys = teams => Object.keys(JSON.parse(plan(dir, { teams }).converted[0].json).fields);
  assert.deepEqual(keys({ t1: { item: { zeta: {}, status: {} } } }), ['zeta', 'status', 'alpha']);
  assert.deepEqual(keys(undefined), ['alpha', 'status', 'zeta']);
});

test('the refs are every ref of the clone, tags included', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1)); commit(home); git(home, 'tag', 'v1'); git(home, 'branch', 'side');
  const refs = plan(dir).refs;
  for (const r of ['main', 'side', 'v1', 'origin/main']) assert.ok(refs.includes(r), refs.join(','));
});

test('a foreign dependency on a folder still in markdown reads as no such item and stops nothing; a markdown item stops the folder commands', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1, 'depends_on: acme/other#1\n'));
  mkdirSync(join(home, 'acme', 'other', 'phases'), { recursive: true }); writeFileSync(join(home, 'acme', 'other', 'phases', '001-o.md'), md(1, '', '001-o')); commit(home);
  assert.equal(foreignItem(dir, 'acme/other#1'), null);
  assert.throws(() => load(dir), e => e.code === 'MARKDOWN_ITEMS');
  assert.deepEqual(plan(dir).failures, []);
});

test('an unreadable markdown file stops store.load and readItems as before (the first header wins) and is one line of the plan, with no absolute path', t => {
  if (process.getuid?.() === 0) return; // root reads a mode 000 file
  const { home, dir, put } = setup(t);
  put('phases/001-a.md', md(1, '', '001-a')); put('phases/002-b.md', md(2, '', '002-b')); commit(home);
  chmodSync(join(dir, 'phases', '002-b.md'), 0);
  try {
    assert.throws(() => load(dir), e => e.code === 'MARKDOWN_ITEMS');
    assert.throws(() => readItems(dir), e => e.code === 'MARKDOWN_ITEMS');
    const p = plan(dir);
    assert.deepEqual(p.failures, ['acme/app/phases/002-b.md: the file cannot be read']);
    assert.equal(p.converted.length, 1);
  } finally { chmodSync(join(dir, 'phases', '002-b.md'), 0o644); }
});

test('an item without a team is written in the order every CLI write uses; a team item in its team order', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1, 'commit: c\nlocation: l\nobjective: o\nsummary: s\n')); commit(home);
  const fm = { seq: 1, phase: '001-x', name: 'N1', repository: L, branch: '', created: null, updated: '', updated_by: '', status: 'pending', commit: 'c', location: 'l', objective: 'o', summary: 's' };
  assert.equal(plan(dir).converted[0].json, toItemJson(fm, 'body 1\n'));
});

test('the counter is the largest number any item holds when the history is lower (an unnumbered file, a JSON item)', t => {
  const { home, dir, put } = setup(t);
  put('phases/foo.md', md(1, '', 'foo').replace('seq: 1', 'seq: 50')); put('phases/002-x.md', md(2)); commit(home);
  assert.equal(plan(dir).counter, 50);
  put('phases/060-j.json', '{"seq": 60}'); // not committed: only the item itself holds the number
  assert.equal(plan(dir).counter, 60);
});

test('three holders of one number give one line per later holder', t => {
  const { home, dir, put } = setup(t);
  put('phases/004-a.md', md(4, '', '004-a')); put('phases/004-b.md', md(4, '', '004-b')); put('archive/004-c.md', md(4, '', '004-c')); commit(home);
  assert.deepEqual(plan(dir).failures, [
    'acme/app: number 4 is held by 004-a and 004-b; give one of them a free number in markdown and run again',
    'acme/app: number 4 is held by 004-a and 004-c; give one of them a free number in markdown and run again',
  ]);
});

test('the plan holds each item to its file name: a seq or phase that differs is a failure; an unnumbered file is counted by its header seq', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(2, '', '001-x')); put('phases/002-y.md', md(2, '', '002-other')); put('phases/foo.md', md(7, '', 'foo')); put('phases/bar.md', md(7, '', 'bar')); commit(home);
  const f = plan(dir).failures;
  assert.ok(f.some(x => /phases\/001-x\.md: the header cannot be read \(seq 2 differs from the file name's number 1\)/.test(x)), f.join('|'));
  assert.ok(f.some(x => /phases\/002-y\.md: the header cannot be read \(phase 002-other differs from the file name\)/.test(x)), f.join('|'));
  assert.ok(f.includes('acme/app: number 7 is held by bar and foo; give one of them a free number in markdown and run again'), f.join('|'));
});

test('a detached HEAD is listed among the refs', t => {
  const { home, dir, put } = setup(t);
  put('phases/001-x.md', md(1)); commit(home); git(home, 'checkout', '-q', '--detach');
  assert.ok(plan(dir).refs.includes('HEAD'));
});

test('a corrupt numbers.json is listed even when a name above the bound stopped the counter', t => {
  const { home, dir, put } = setup(t);
  put('phases/2000000000-big.md', md(1, '', '2000000000-big')); put('numbers.json', 'not json'); commit(home);
  const f = plan(dir).failures;
  assert.equal(f.length, 2);
  assert.match(f[1], /^numbers\.json cannot be read/);
});
