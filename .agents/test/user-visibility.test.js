// The user commands do not see items that belong to a team: a read lists none, a reference to one reads as a missing item, the user queue
// ranks only user items, and a reorder leaves the team entries where they are.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { userCase, slugOf } from './user-cases.js';
import { GIT_IDENTITY, archivedPath, itemPath, writeStored } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const rows = r => JSON.parse(r.stdout).phases;

test('COD-06: show of a team item answers no phase', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }]);
  const r = c.run(['show', '90']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /no phase '90'/);
});

test('COD-07: show of an item without a team answers it', () => {
  const c = userCase(dirs, [{ seq: 91 }]);
  const r = c.run(['show', '91']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /item 91/);
});

test('R16-02: new --depends-on a team item is refused as a missing item', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }]);
  const r = c.run(['new', '--name', 't', '--objective', 'o', '--summary', 's', '--depends-on', '90']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /--depends-on: no item '90' in this backlog/);
});

test('list and list --json show no team item', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }]);
  const j = c.run(['list', '--json']);
  assert.equal(j.status, 0, j.stdout + j.stderr);
  assert.deepEqual(rows(j).map(r => r.seq), [1, 3]);
  assert.doesNotMatch(c.run(['list']).stdout, /item 2/);
  assert.doesNotMatch(c.run(['list', 'all-branches']).stdout, /item 2/);
});

test('the priority of a user item ignores team entries of its branch', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }]);
  assert.deepEqual(rows(c.run(['list', '--json'])).map(r => [r.seq, r.priority]), [[1, 0], [3, 1]]);
});

test('a dependency on a team item reads as missing in next and list', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }, { seq: 7, team: 'parallel', repo: 'lib' }, { seq: 5, fields: { depends_on: ['90', 'acme/lib#7'] } }]);
  const list = c.run(['list']);
  assert.equal(list.status, 0, list.stdout + list.stderr);
  assert.match(list.stdout, /depends on acme\/lib#7 \(no such item in the backlog repository\)/);
  assert.doesNotMatch(list.stdout, /item 90|parallel/);
  const next = c.run(['next']);
  assert.equal(next.status, 0, next.stdout + next.stderr);
  assert.match(next.stdout, /NEXT: P0 .*005-item-5/);
  assert.doesNotMatch(next.stdout, /item 90|parallel/);
});

test('a foreign dependency on a team item reads as missing', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 7, team: 'parallel', repo: 'lib' }, { seq: 8, repo: 'lib' }]);
  const NEW = d => ['new', '--name', 't', '--objective', 'o', '--summary', 's', '--depends-on', d];
  const no = c.run(NEW('acme/lib#7'));
  assert.equal(no.status, 1, no.stdout + no.stderr);
  assert.match(no.stdout + no.stderr, /--depends-on: no item 'acme\/lib#7' in the backlog repository/);
  const yes = c.run(NEW('acme/lib#8'));
  assert.equal(yes.status, 0, yes.stdout + yes.stderr);
});

test('update --replan leaves team entries in place', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }, { seq: 4 }]);
  const index = () => JSON.parse(readFileSync(join(c.folder, 'index.json'), 'utf8')).branches.main.map(e => e.slug);
  c.run(['list']); // writes the index when the folder had none
  assert.deepEqual(index(), [slugOf(1), slugOf(2), slugOf(3), slugOf(4)]);
  const r = c.run(['update', '--replan', '4,3']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(index(), [slugOf(4), slugOf(2), slugOf(3), slugOf(1)]);
});

test('the ranks a command prints count the entries it sees only', () => {
  const c = userCase(dirs, [{ seq: 1, team: 'parallel' }, { seq: 2 }, { seq: 3 }]);
  c.run(['list']);
  const r = c.run(['update', '--replan', '3']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /P0 {2}003-item-3\n {3}P1 {2}002-item-2\n?$/);
  assert.doesNotMatch(r.stdout, /001-item-1|P2/);
  const moved = c.run(['update', '3', '--priority', '0']);
  assert.equal(moved.status, 0, moved.stdout + moved.stderr);
  assert.match(moved.stdout, /priority=P0/);
});

test('update --seq on an item an unseen item depends on is refused without naming that item', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel', fields: { depends_on: ['1'] } }]);
  const r = c.run(['update', '1', '--seq', '50']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /an item this command does not see depends on 001-item-1/);
  assert.doesNotMatch(r.stdout + r.stderr, /002-item-2|parallel/);
});

// ---- --show-all on the reading commands and on new

const home = c => dirname(dirname(c.folder));
const git = (c, ...args) => execFileSync('git', args, { cwd: home(c), encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
const publish = c => { git(c, 'add', '-A'); git(c, 'commit', '-q', '-m', 'edit'); git(c, 'push', '-q'); };
const bytes = (c, seq) => readFileSync(itemPath(c.folder, slugOf(seq)));
const indexOf = c => JSON.parse(readFileSync(join(c.folder, 'index.json'), 'utf8')).branches;
const entryOf = (c, seq) => Object.entries(indexOf(c)).flatMap(([branch, l]) => l.filter(e => e.slug === slugOf(seq)).map(e => [branch, e]))[0];
const text = n => Array.from({ length: 30 }, (_, i) => `${n * 7 + i} ${(n * 7 + i) ** 3} line`).join('\n'); // unlike every other item, so git reports an added file, never a rename
const stored = (c, seq, fields) => writeStored(itemPath(c.folder, slugOf(seq)), { seq, name: `item ${seq}`, repository: 'acme/app', branch: 'main', status: 'pending', ...fields }, text(seq));
const NEW = (...more) => ['new', '--name', 't', '--objective', 'o', '--summary', 's', ...more];

test('R16-01: show of a team item with --show-all answers it with its team', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }]);
  const r = c.run(['show', '90', '--show-all', '--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const o = JSON.parse(r.stdout);
  assert.deepEqual([o.seq, o.team, o.status, o.front_matter.team], [90, 'parallel', 'ready', 'parallel']);
});

test('R16-03: new --depends-on a team item with --show-all creates the item with that dependency', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { status: 'ready' } }]);
  c.run(['list']);
  const before = [bytes(c, 90), entryOf(c, 90)];
  const r = c.run(NEW('--depends-on', '90', '--show-all'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /created phase 091-t/);
  const made = JSON.parse(c.run(['show', '91', '--json']).stdout).front_matter;
  assert.deepEqual(made.depends_on, [90]);
  assert.equal(Object.hasOwn(made, 'team'), false);
  assert.equal(Object.hasOwn(made, 'parent'), false);
  assert.deepEqual([bytes(c, 90), entryOf(c, 90)], before);
});

test('new --depends-on a team item of another repository with --show-all is accepted', () => {
  const c = userCase(dirs, [{ seq: 7, team: 'parallel', repo: 'lib' }]);
  assert.equal(c.run(NEW('--depends-on', 'acme/lib#7', '--show-all')).status, 0);
});

test('list shows team items with --show-all: counts, ranks, the team in the rows and the team column', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 2, team: 'parallel' }, { seq: 3 }]);
  const j = rows(c.run(['list', '--show-all', '--json']));
  assert.deepEqual(j.map(r => [r.seq, r.priority]), [[1, 0], [2, 1], [3, 2]]);
  assert.deepEqual(j.map(r => Object.hasOwn(r, 'team')), [false, true, false]);
  assert.equal(j[1].team, 'parallel');
  assert.match(c.run(['list', '--show-all']).stdout, /002-item-2 .*item 2 {2}\(team parallel\)/);
  assert.match(c.run(['list', 'branches']).stdout, /main {2}open 2 {2}done 0/);
  assert.match(c.run(['list', 'branches', '--show-all']).stdout, /main {2}open 3 {2}done 0/);
});

test('list all-branches --show-all names the branch, then the team', () => {
  const c = userCase(dirs, [{ seq: 1, team: 'parallel', fields: { branch: 'feature/a-b' } }]);
  assert.match(c.run(['list', 'all-branches', '--show-all']).stdout, /item 1 {2}\(branch feature\/a-b\) {2}\(team parallel\)/);
  assert.doesNotMatch(c.run(['list', 'all-branches']).stdout, /item 1/);
});

test('next names a team item only with --show-all', () => {
  const c = userCase(dirs, [{ seq: 1, team: 'parallel' }, { seq: 2 }]);
  assert.match(c.run(['next']).stdout, /NEXT: P0 .*002-item-2/);
  assert.match(c.run(['next', '--show-all']).stdout, /NEXT: P0 .*001-item-1/);
  const j = JSON.parse(c.run(['next', '--show-all', '--json']).stdout);
  assert.deepEqual([j.team, j.front_matter.team], ['parallel', 'parallel']);
});

test('history lists the entries of a team item only with --show-all', () => {
  const events = [1, 2].map(n => ({ at: `2026-01-0${n}T00:00:00Z`, by: 'bob', session: '', step: 'update', changes: { status: ['a', 'b'] }, note: `n${n}` }));
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields: { events } }]);
  const no = c.run(['history', '90']);
  assert.equal(no.status, 1, no.stdout + no.stderr);
  assert.match(no.stdout, /no phase '90'/);
  assert.doesNotMatch(c.run(['history']).stdout, /n1/);
  const yes = c.run(['history', '90', '--show-all']);
  assert.equal(yes.status, 0, yes.stdout + yes.stderr);
  assert.match(yes.stdout, /status: a -> b n1/);
  assert.match(yes.stdout, /status: a -> b n2/);
  assert.match(c.run(['history', '--show-all']).stdout, /n2/);
  assert.equal(c.run(['history', '--show-all', '--json']).status, 2);
});

test('changes leaves team items out without --show-all; held is claimed_by of an item without a team', () => {
  const c = userCase(dirs, [{ seq: 8, team: 'parallel' }, { seq: 9, team: 'parallel' }]);
  const watch = a => JSON.parse(c.run(['changes', '--agent', a, '--json', ...(a === 'b1' ? ['--show-all'] : [])]).stdout);
  watch('a1'); watch('b1'); // the reference of each agent
  stored(c, 5, { claimed_by: 'a1' }); stored(c, 6, { reviewer: 'a1' }); stored(c, 7, { team: 'parallel', claimed_by: 'b1' });
  const file = n => itemPath(c.folder, slugOf(n)).split('/').pop();
  git(c, 'rm', '-q', `acme/app/phases/${file(8)}`);
  mkdirSync(dirname(archivedPath(c.folder, slugOf(9))), { recursive: true });
  git(c, 'mv', `acme/app/phases/${file(9)}`, `acme/app/archive/${file(9)}`);
  publish(c);
  const a = watch('a1');
  assert.deepEqual(a.held.map(x => x.slug), [slugOf(5)]);
  assert.deepEqual(a.others.map(x => x.slug), [slugOf(6)]);
  const b = watch('b1');
  assert.deepEqual(b.held, []);
  assert.deepEqual(b.others.map(x => x.slug).sort(), [5, 6, 7, 8, 9].map(slugOf).sort());
});

test('fields and the writing commands refuse --show-all as an unknown option', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 90, team: 'parallel' }]);
  c.run(['list']);
  const before = [bytes(c, 90), entryOf(c, 90)];
  for (const args of [['fields'], ['update', '1'], ['done', '1'], ['move', '1', '--to-branch', 'x'], ['archive', '1'], ['import'], ['clean']]) {
    const r = c.run([...args, '--show-all']);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
  assert.deepEqual([bytes(c, 90), entryOf(c, 90)], before);
});

test('done, archive done and move --to-branch leave every team item and its index entry byte-identical', () => {
  const c = userCase(dirs, [{ seq: 1 }, { seq: 90, team: 'parallel' }, { seq: 2 }, { seq: 91, team: 'parallel' }, { seq: 3 }]);
  c.run(['list']);
  const snap = () => [90, 91].map(n => [bytes(c, n), entryOf(c, n)]);
  execFileSync('git', ['push', '-q', 'origin', 'HEAD:refs/heads/feature/x'], { cwd: join(dirname(home(c)), 'consumer', 'app'), env: { ...process.env, ...GIT_IDENTITY } }); // move names a branch of the origin
  const before = snap();
  for (const args of [['done', '1'], ['archive', 'done'], ['move', '2', '--to-branch', 'feature/x']]) {
    const r = c.run(args, undefined, 'yes\n');
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.deepEqual(snap(), before, args.join(' '));
  }
});

test('a hand-edited team item comes through show --show-all with its stored fields and words', () => {
  const fields = { status: 'done', stage: 'mine', owner: 'zed', extra: { b: 1, a: 2 }, events: [{ at: '2026-01-01T00:00:00Z', by: 'bob', session: '', step: 'update', changes: {}, note: 'x' }] };
  const c = userCase(dirs, [{ seq: 90, team: 'parallel', fields }]);
  const fm = JSON.parse(c.run(['show', '90', '--show-all', '--json']).stdout).front_matter;
  assert.deepEqual([fm.status, fm.stage, fm.owner, fm.extra], ['done', 'mine', 'zed', { b: 1, a: 2 }]);
  assert.equal(fm.events.length, 1);
  assert.equal(Object.hasOwn(fm, 'review_state') || Object.hasOwn(fm, 'refiner'), false);
});

test('reading a team item with --show-all writes no tracked file, and without it records no view', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel' }]);
  const views = () => { const d = join(home(c), '.git', 'smooth-backlog-cli-views'); return readdirSync(d).map(f => readFileSync(join(d, f), 'utf8')).join(''); };
  c.run(['list']);
  const before = bytes(c, 90);
  assert.equal(c.run(['show', '90']).status, 1);
  assert.doesNotMatch((() => { try { return views(); } catch { return ''; } })(), /090-item-90/);
  assert.equal(c.run(['show', '90', '--show-all']).status, 0);
  assert.equal(c.run(['changes', '--show-all']).status, 0);
  assert.match(views(), /090-item-90/);
  assert.equal(git(c, 'status', '--porcelain'), '');
  assert.deepEqual(bytes(c, 90), before);
});

test('new --split-from a team item is refused with --show-all and writes nothing', () => {
  const c = userCase(dirs, [{ seq: 90, team: 'parallel' }]);
  c.run(['list']);
  const before = [bytes(c, 90), git(c, 'rev-parse', 'HEAD')];
  const no = c.run(NEW('--split-from', '90'));
  assert.equal(no.status, 1);
  assert.match(no.stdout, /--split-from: no phase '90'/);
  const r = c.run(NEW('--split-from', '90', '--show-all'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /belongs to team parallel/);
  assert.deepEqual([bytes(c, 90), git(c, 'rev-parse', 'HEAD')], before);
  assert.equal(git(c, 'status', '--porcelain'), '');
});

test('the flag is a switch: an equals form is refused, a team of no name is no team, a comma list with a team item', () => {
  const c = userCase(dirs, [{ seq: 5 }, { seq: 90, team: 'parallel' }, { seq: 6 }]);
  const six = itemPath(c.folder, slugOf(6)); // the writer stores no empty team: the key is written by hand
  writeFileSync(six, JSON.stringify({ ...JSON.parse(readFileSync(six, 'utf8')), team: '' }, null, 2));
  publish(c);
  const eq = c.run(['list', '--show-all=1']);
  assert.equal(eq.status, 2);
  assert.match(eq.stderr, /unrecognized arguments: --show-all=1/);
  const l = rows(c.run(['list', '--json']));
  assert.deepEqual(l.map(r => r.seq), [5, 6]);
  assert.equal(Object.hasOwn(l[1], 'team'), false);
  const none = c.run(['show', '5,90']);
  assert.equal(none.status, 1);
  assert.doesNotMatch(none.stdout, /item 5/);
  assert.equal(JSON.parse(c.run(['show', '5,90', '--show-all']).stdout).length, 2);
  assert.match(c.run(['new', '--s']).stderr + c.run(['new', '--s']).stdout, /ambiguous option: --s could match/);
});

test('next all-branches names a team item of another branch only with --show-all', () => {
  const c = userCase(dirs, [{ seq: 1, team: 'parallel', fields: { branch: 'feature/a-b' } }]);
  assert.doesNotMatch(c.run(['next', 'all-branches']).stdout, /001-item-1/);
  assert.match(c.run(['next', 'all-branches', '--show-all']).stdout, /NEXT: P0 .*001-item-1/);
  assert.equal(JSON.parse(c.run(['next', 'all-branches', '--show-all', '--json']).stdout).team, 'parallel');
});

test('the help of a reading command says team items come with their team only where its output names the team', () => {
  const events = [{ at: '2026-01-01T00:00:00Z', by: 'bob', session: '', step: 'update', changes: { status: ['a', 'b'] }, note: 'n1' }];
  const c = userCase(dirs, [{ seq: 1, team: 'parallel', fields: { events } }]);
  c.run(['changes', '--show-all']); // the reference
  stored(c, 7, { team: 'parallel' });
  publish(c);
  const named = Object.fromEntries([['list'], ['next'], ['show', '1'], ['history', '1'], ['changes']].map(([word, ...item]) => {
    const out = c.run([word, ...item, '--show-all']);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /item[- ][17]|n1/); // the team item is in the output
    return [word, [/parallel/.test(out.stdout), /with their team/.test(c.run([word, '--help']).stdout)]];
  }));
  assert.deepEqual(named, { list: [true, true], next: [true, true], show: [true, true], history: [false, false], changes: [false, false] });
});

test('changes leaves out a removed item whose earlier version cannot be read, unless --show-all is given', () => {
  const c = userCase(dirs, [{ seq: 8, team: 'parallel' }]);
  const watch = (a, ...more) => JSON.parse(c.run(['changes', '--agent', a, '--json', ...more]).stdout);
  watch('a1'); watch('b1', '--show-all'); // the reference of each agent
  const path = `acme/app/phases/${itemPath(c.folder, slugOf(8)).split('/').pop()}`;
  const blob = git(c, 'rev-parse', `HEAD:${path}`).trim();
  git(c, 'rm', '-q', path);
  publish(c);
  rmSync(join(home(c), '.git', 'objects', blob.slice(0, 2), blob.slice(2))); // the earlier version is gone from the clone
  const a = watch('a1');
  assert.deepEqual([a.held, a.others], [[], []]);
  assert.deepEqual(watch('b1', '--show-all').others.map(x => [x.slug, x.status]), [[slugOf(8), 'D']]);
});
