// Tests for src/shared/new.js — cli-parity job 10 (`backlog new` in shared mode).
// Oracle: new_phase.py:28-192 and lib_db.py (vocabularies :601-606, review-ref coverage :683-686), the pinned scripts;
// test_team_compat.py:10-22 for the refusals. Oracle-backed tests skip when SMOOTH_BACKLOG_SCRIPTS is not configured or
// PyYAML is missing; the rest check the contract directly. Local bare repos only (shared-fixtures.js, job 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, py, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import { parse } from '../../src/shared/frontmatter.js';
import { hasDefinitionOfDone } from '../../src/shared/new.js';
import * as store from '../../src/shared/store.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

// A fixture: the shared home, a consumer (origin acme/demo, branch main) in shared mode, the item folder.
function fixture(t, prefix = 'new-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [k, v] of Object.entries(GIT_IDENTITY)) { const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; }); }
  const home = sharedBacklog(dir);
  const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(dir, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { dir, home, cons, folder: join(home, 'acme', 'demo'), bare: join(dir, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git') };
}
const node = (f, args, env) => cli(['new', ...args], { cwd: f.cons, tmp: f.dir, env });
const oracle = (t, f, args, env) => {
  const r = py('new_phase.py', args, { cwd: f.cons, tmp: f.dir, env });
  if (!r) t.skip('Python backlog skill oracle not configured (set SMOOTH_BACKLOG_SCRIPTS) or PyYAML missing');
  return r;
};
const BASE = ['--name', 'Alpha job', '--objective', 'do alpha', '--summary', 'sum alpha'];
const NONE = [...BASE, '--depends-on', 'none'];
const items = f => store.load(f.folder).filter(i => i.path.startsWith('phases/'));
// An item without what differs between two runs: the creation and update times and the creating commit.
const bare = ({ fm: { created, updated, updated_by, commit, ...fm }, body, path }) => ({ path, keys: Object.keys(fm), fm, body }); // eslint-disable-line no-unused-vars
const subject = f => git(f.bare, 'log', '-1', '--format=%s', 'main');
const rows = (f, sql) => { const con = db.connect(f.folder); try { return con.prepare(sql).all().map(r => ({ ...r })); } finally { con.close(); } };

// ---------------------------------------------------------------- refusals (test_team_compat.py:10-22)

const REFUSALS = [
  ['no --depends-on', BASE, 1, 'stdout', '--depends-on is required'],
  ['no --name', ['--depends-on', 'none'], 1, 'stdout', '--name is required (or --split-from <phase>)'],
  ['a work class (the classes are gone)', [...NONE, '--work-class', 'docs'], 2, 'stderr', 'unrecognized arguments: --work-class docs'],
  ['a review class (the classes are gone)', [...NONE, '--review-classes', 'code'], 2, 'stderr', 'unrecognized arguments: --review-classes code'],
  ['review refs that name no review document', [...NONE, '--review-refs', 'docs/notes.md', '--body', '## Definition of done\n- [ ] x'], 1, 'stdout', '--review-refs needs at least one review document (references/review/<type>.md in cody-coding-model)'],
  ['a dependency that is not there', [...BASE, '--depends-on', 'no-such-item'], 1, 'stdout', "no item 'no-such-item'"],
  ['a number that is not there', [...BASE, '--depends-on', '99'], 1, 'stdout', "no item '99'"],
  ['--split-from not found', [...NONE, '--split-from', 'nope'], 1, 'stdout', "--split-from: no phase 'nope'"],
  ['review refs without a definition of done', [...NONE, '--review-refs', 'references/review/code.md'], 1, 'stdout', '--body must hold a definition of done'],
  ['an unknown option', [...NONE, '--bogus', 'x'], 2, 'stderr', 'unrecognized arguments: --bogus x'],
  ['an invalid choice', [...NONE, '--severity', 'urgent'], 2, 'stderr', "invalid choice: 'urgent'"],
  ['an invalid integer', [...NONE, '--priority', 'soon'], 2, 'stderr', "invalid int value: 'soon'"],
  ['a missing value', [...NONE, '--summary'], 2, 'stderr', 'expected one argument'],
];

for (const [title, args, code, stream, text] of REFUSALS) {
  test(`refusal: ${title}: exit ${code}, message on ${stream}, nothing written or committed (same as new_phase.py)`, t => {
    const f = fixture(t);
    const before = subject(f);
    const r = node(f, args);
    assert.equal(r.status, code, r.stdout + r.stderr);
    assert.ok(r[stream].includes(text), r.stdout + r.stderr);
    if (stream === 'stdout') assert.ok(r.stdout.startsWith('❌ ') && r.stderr === '');
    else assert.ok(r.stderr.startsWith('❌ backlog: ') && r.stdout === '');
    assert.deepEqual(items(f), []);
    assert.equal(subject(f), before);
    assert.equal(git(f.home, 'status', '--porcelain', '--', 'acme/demo/phases'), '');
    const o = oracle(t, fixture(t, 'new-oracle-'), args); // the same refusal from Python on a second fixture
    if (!o) return;
    assert.equal(r.status, o.status);
    if (title !== 'an unknown option' && !title.startsWith('an invalid') && title !== 'a missing value' && !title.includes('(the classes are gone)')) assert.equal(r[stream], o[stream]); // argparse's own wording is its own
  });
}

test('refusal: a dependency that is in the backlog passes, a split source that is archived or missing is a refusal', t => {
  const f = fixture(t);
  assert.equal(node(f, NONE).status, 0);
  assert.equal(node(f, [...BASE, '--depends-on', '1,001-alpha-job']).status, 0);
  assert.equal(node(f, [...BASE, '--depends-on', '001-alpha-job, none']).status, 1); // 'none' inside a list is a slug nobody has
});

test('a stale mirror cannot hand out a used number: nextSeq looks at the files too', t => {
  const f = fixture(t);
  assert.equal(node(f, NONE).status, 0);
  const second = node(f, NONE);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(items(f).map(i => i.path), ['phases/001-alpha-job.md', 'phases/002-alpha-job.md']);
  // a stale mirror cannot hand out a used number: nextSeq looks at the files too
  const con = db.connect(f.folder); con.exec('DELETE FROM phase'); con.close();
  assert.equal(node(f, NONE).status, 0);
  assert.equal(items(f).length, 3);
});

test('refusal: a detached HEAD dies with exit 2 after the dependency check (new_phase.py:126, lib_db.py:273-277)', t => {
  const f = fixture(t);
  git(f.cons, 'checkout', '-q', '--detach');
  const r = node(f, NONE);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, '❌ backlog: HEAD is detached; check out the branch the item belongs to first\n');
  assert.deepEqual(items(f), []);
  const o = oracle(t, fixture(t, 'new-oracle-'), NONE);
  if (!o) return;
  const f2 = fixture(t, 'new-oracle-'); git(f2.cons, 'checkout', '-q', '--detach');
  const o2 = oracle(t, f2, NONE);
  assert.deepEqual([r.status, r.stderr, r.stdout], [o2.status, o2.stderr, o2.stdout]);
});

test('refusal: a diagnostic that echoes input carries no credential of a URL', t => {
  const f = fixture(t);
  for (const args of [[...NONE, '--work-class', 'https://user:tok3n@host/x'], [...NONE, 'https://user:tok3n@host/x'], [...BASE, '--depends-on', 'https://user:tok3n@host/x']]) {
    const r = node(f, args);
    assert.notEqual(r.status, 0);
    assert.ok(!(r.stdout + r.stderr).includes('tok3n'), r.stdout + r.stderr);
  }
});

// ---------------------------------------------------------------- the item (new_phase.py:111-184)

test('new: writes the item, scans backlog.db, commits as "acme/demo: new --name Alpha job" and pushes (no oracle)', t => {
  const f = fixture(t);
  const r = node(f, NONE);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '✅ created phase phases/001-alpha-job.md (seq 1) — appended, now at P0\n'
    + '   📋 planning event: backlog re-densified to 1 item(s) (P0..P0)\n   rescan: 1 phase(s) tracked, 1 (re)ingested\n');
  const [item] = items(f);
  assert.deepEqual(Object.keys(item.fm), ['phase', 'seq', 'name', 'objective', 'summary', 'status', 'severity', 'priority', 'repository', 'branch', 'commit',
    'location', 'created', 'updated', 'updated_by', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer']);
  assert.deepEqual({ ...item.fm, created: 0, updated: 0, updated_by: 0, commit: 0 }, { phase: '001-alpha-job', seq: 1, name: 'Alpha job', objective: 'do alpha', summary: 'sum alpha',
    status: 'pending', severity: 'normal', priority: 0, repository: 'acme/demo', branch: 'main', commit: 0, location: '', created: 0, updated: 0, updated_by: 0,
    depends_on: [], claimed_by: '', claimed_at: '', review_state: 'none', reviewer: '' });
  assert.equal(item.fm.commit, git(f.cons, 'rev-parse', 'HEAD'));
  assert.equal(item.body, '\n# Phase 001 — Alpha job\n\n**Objective:** do alpha\n\n\n## Definition of done\n\n- [ ] <machine-checkable acceptance>\n');
  assert.equal(subject(f), 'acme/demo: new --name Alpha job');
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), git(f.bare, 'rev-parse', 'main'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.deepEqual(rows(f, 'SELECT slug, seq, priority, status FROM phase'), [{ slug: '001-alpha-job', seq: 1, priority: 0, status: 'pending' }]);
  assert.deepEqual(rows(f, 'SELECT event FROM event ORDER BY id').map(r => r.event), ['ingested', 'planning_event', 'reingested']);
  assert.equal(git(f.cons, 'status', '--porcelain'), '', 'shared mode writes nothing into the consuming repository');
  assert.ok(!existsSync(join(f.cons, '.backlog')));
});

// The same flags on two fixtures, one run by new_phase.py: the item, the output, the commit and the mirror agree.
const SCENARIOS = {
  'every flag, appended': [[], [...NONE, '--context', 'from the ask', '--body', 'Some body\n\n## Definition of done\n- [ ] it works', '--chunk',
    '--review-refs', 'references/review/code.md,references/review/tests.example.md', '--estimate', '30', '--complexity', 'medium', '--layer', '3']],
  'inserted at rank 0 before older work': [[['--name', 'Older', '--depends-on', 'none'], ['--name', 'Oldest', '--depends-on', '1']], [...BASE, '--depends-on', '1,Oldest'.replace('Oldest', '002-oldest'), '--priority', '0']],
  'critical, forced to P0 with the banner': [[['--name', 'Older', '--depends-on', 'none']], [...NONE, '--severity', 'critical']],
  'a rank beyond the end is clamped, a layer of process': [[['--name', 'Older', '--depends-on', 'none']], [...NONE, '--priority', '7', '--layer', 'process', '--complexity', 'high']],
  'the placeholder when the body has none, unicode and quotes': [[], ['--name', 'Ünï "quoted" it\'s: a/b', '--objective', 'x: y # z', '--depends-on', 'none', '--body', 'plain body']],
  'a prefix of an option and --opt=value': [[], ['--depends', 'none', '--name=Abbrev', '--obj', 'o=1', '--summ=s']],
  'a dry run': [[], [...NONE, '--dry-run']],
};
for (const [title, [setup, args]] of Object.entries(SCENARIOS)) {
  test(`parity with new_phase.py: ${title}`, t => {
    const a = fixture(t); const b = fixture(t, 'new-oracle-');
    for (const s of setup) {
      assert.equal(node(a, s).status, 0);
      const o = oracle(t, b, s); if (!o) return;
      assert.equal(o.status, 0, o.stdout + o.stderr);
    }
    const r = node(a, args); const o = oracle(t, b, args); if (!o) return;
    assert.equal(r.status, o.status, r.stderr + o.stderr);
    assert.equal(r.stdout, o.stdout);
    assert.equal(r.stderr, o.stderr);
    assert.deepEqual(items(a).map(bare), items(b).map(bare)); // front matter keys, order and values, body to the byte, file names
    assert.equal(subject(a), subject(b).replace('new_phase.py', 'new')); // the subject names the command (item 010), the oracle its script
    assert.equal(git(a.bare, 'rev-list', '--count', 'main'), git(b.bare, 'rev-list', '--count', 'main'));
    const mirror = 'SELECT slug, seq, name, objective, summary, status, severity, priority, path, branch, repository, location, size_score FROM phase ORDER BY seq';
    assert.deepEqual(rows(a, mirror), rows(b, mirror));
    const events = "SELECT event, branch, CASE WHEN note LIKE 'sha drift%' THEN 'sha drift' ELSE note END AS note FROM event ORDER BY id"; // a sha covers the created time and the creating commit
    assert.deepEqual(rows(a, events), rows(b, events));
  });
}

test('review P2: new --dry-run in a repository without a backlog writes nothing (new --help promises it)', t => {
  const f = fixture(t);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  const r = node(f, [...NONE, '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\] would create phase phases\/001-alpha-job\.md \(seq 1\)/);
  assert.equal(git(f.home, 'status', '--porcelain', '--untracked-files=all'), '');
  assert.equal(existsSync(f.folder), false, 'no folder, no backlog.db');
  const dep = node(f, [...NONE.slice(0, -1), '1', '--dry-run']); // an absent mirror is an empty one: item 1 does not exist
  assert.equal(dep.status, 1);
  assert.match(dep.stdout, /no item '1'/);
  assert.equal(existsSync(f.folder), false);
});

test('parity with new_phase.py: --split-from copies the objective, summary and body of the source and logs a split event', t => {
  const a = fixture(t); const b = fixture(t, 'new-oracle-');
  const first = ['--name', 'Parent', '--objective', 'parent objective', '--summary', 'parent summary', '--depends-on', 'none', '--body', 'Parent body with ünï\n\n## Definition of done\n- [ ] a'];
  const split = ['--split-from', '1', '--depends-on', '1', '--priority', '0'];
  assert.equal(node(a, first).status, 0);
  const o1 = oracle(t, b, first); if (!o1) return;
  const r = node(a, split); const o = oracle(t, b, split);
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, o.stdout);
  assert.deepEqual(items(a).map(bare), items(b).map(bare));
  const [, child] = items(a);
  assert.equal(child.fm.name, '1-cont'); assert.equal(child.fm.objective, 'parent objective'); assert.equal(child.fm.summary, 'parent summary');
  assert.ok(child.body.includes('## Split from `001-parent`. Inherited context:\n\n# Phase 001 — Parent'));
  const events = "SELECT event, note FROM event WHERE event = 'split'";
  assert.deepEqual(rows(a, events), [{ event: 'split', note: 'spawned sibling 002-1-cont' }]);
  assert.deepEqual(rows(a, events), rows(b, events));
  const long = ['--name', 'Long', '--depends-on', 'none', '--body', `${'é'.repeat(900)}\n\n## Definition of done\n- [ ] a`];
  assert.equal(node(a, long).status, 0); oracle(t, b, long);
  assert.equal(node(a, ['--split-from', 'Long'.replace('Long', '003-long'), '--depends-on', 'none']).status, 0); oracle(t, b, ['--split-from', '003-long', '--depends-on', 'none']);
  assert.deepEqual(items(a).map(bare), items(b).map(bare)); // the inherited body is cut at 800 characters
});

test('--split-from takes the body from inside the folder only: a mirror row that points outside is refused', t => {
  const f = fixture(t);
  assert.equal(node(f, NONE).status, 0);
  const con = db.connect(f.folder); con.exec("UPDATE phase SET path='../../../etc/hostname'"); con.close();
  const r = node(f, ['--split-from', '1', '--depends-on', 'none']);
  assert.equal(r.status, 1); assert.match(r.stderr, /^❌ backlog: Unsafe path/);
  assert.equal(items(f).length, 1);
});

test('team mode: TEAM_REPOSITORY binds the repository and TEAM_BRANCH the branch, an item without a definition of done is refused', t => {
  const f = fixture(t); const env = { TEAM_REPOSITORY: 'acme/other', TEAM_BRANCH: 'team-1' };
  const refused = node(f, NONE, env);
  assert.equal(refused.status, 1); assert.match(refused.stdout, /^❌ --body must hold a definition of done/);
  const ok = node(f, [...NONE, '--body', '## Definition of done\n- [ ] x'], env);
  assert.equal(ok.status, 0, ok.stderr);
  const [item] = store.load(join(f.home, 'acme', 'other'));
  assert.equal(item.fm.repository, 'acme/other'); assert.equal(item.fm.branch, 'team-1');
  assert.equal(node(f, NONE, { TEAM_REPOSITORY: '../x' }).status, 2);
  const o = oracle(t, fixture(t, 'new-oracle-'), NONE, env); if (!o) return;
  assert.equal(refused.stdout, o.stdout);
});

test('hasDefinitionOfDone: a heading or a line with checkable content; the placeholder and an empty section do not count', () => {
  for (const [body, want] of [
    [undefined, false], ['', false], ['## Definition of done\n\n- [ ] <machine-checkable acceptance>\n', false], ['## Definition of done\n\n## Next\nx', false],
    ['## Definition of done\n- [ ] x', true], ['Definition of done: tests pass', true], ['**Definition of done** all green', true], ['- DEFINITION OF DONE\n  x', true],
    ['text definition of done here', false], ['### definition of done:\n', false],
    ['## Definition of done\nTBD', false], ['## Definition of done\n- [ ] TODO', false], ['## Definition of done\n- [ ] TODO: the parser test', true],
  ]) assert.equal(hasDefinitionOfDone(body), want, JSON.stringify(body));
});

// ---------------------------------------------------------------- two clones at once (sync.js renumbering)

test('a number two clones picked at once: the later push is renumbered, rescanned and recommitted; the printed slug is the final one', t => {
  const f = fixture(t);
  const other = join(f.dir, 'other');
  git(f.dir, 'clone', '-q', f.bare, other);
  // while this clone commits, the other one pushes an item with the same number
  const hook = join(f.home, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, `#!/bin/sh
[ -e "${f.dir}/hooked" ] && exit 0
touch "${f.dir}/hooked"
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE
mkdir -p "${other}/acme/demo/phases"
printf -- '---\\nphase: 001-bravo\\nseq: 1\\nname: Bravo\\nstatus: pending\\nrepository: acme/demo\\nbranch: main\\n---\\n\\n# Phase 001 — Bravo\\n' > "${other}/acme/demo/phases/001-bravo.md"
git -C "${other}" add -A && git -C "${other}" commit -q -m bravo && git -C "${other}" push -q
`);
  chmodSync(hook, 0o755);
  const r = node(f, NONE);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'renumbered 001 -> 002\n✅ created phase phases/002-alpha-job.md (seq 2) — appended, now at P0\n'
    + '   📋 planning event: backlog re-densified to 1 item(s) (P0..P0)\n   rescan: 1 phase(s) tracked, 1 (re)ingested\n');
  assert.deepEqual(items(f).map(i => [i.path, i.fm.phase, i.fm.seq]), [['phases/001-bravo.md', '001-bravo', 1], ['phases/002-alpha-job.md', '002-alpha-job', 2]]);
  assert.match(items(f)[1].body, /^\n# Phase 002 — Alpha job\n/);
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), git(f.bare, 'rev-parse', 'main'));
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  assert.deepEqual(rows(f, 'SELECT slug, seq FROM phase ORDER BY seq'), [{ slug: '001-bravo', seq: 1 }, { slug: '002-alpha-job', seq: 2 }]); // the stale 001 row moved on to 002, no ghost
  assert.deepEqual(store.findings(f.folder).ghost, []);
});

// ---------------------------------------------------------------- review fixes (Codex review 2026-10-23, job 10)

test('review P1: a symlinked owner folder in the home is refused before any database or item write', t => {
  const f = fixture(t);
  const outside = join(f.dir, 'outside');
  mkdirSync(outside);
  try { symlinkSync(outside, join(f.home, 'acme')); } catch (e) { t.skip(`cannot create a symlink here: ${e.code}`); return; }
  const r = node(f, NONE);
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stdout + r.stderr, /Symlink destination is unsupported/);
  assert.deepEqual(readdirSync(outside), [], 'nothing was written outside the backlog clone');
});

test('review P2: review refs go through checkRefs: an absolute or ..-crossing ref is refused and nothing is persisted', t => {
  const f = fixture(t);
  for (const ref of ['../../outside/code.md', '/outside/code.md']) {
    const r = node(f, [...NONE, '--review-refs', ref, '--body', '## Definition of done\n- [ ] x']);
    assert.equal(r.status, 2, ref);
    assert.match(r.stderr, /review ref .* (is absolute|contains '\.\.')/);
  }
  assert.deepEqual(items(f), []);
  assert.ok(!existsSync(join(f.folder, 'backlog.db')), 'the database is not even opened');
});

test('review P2: a file with the name of the next item is never replaced: the item takes the next free number, with or without --force', t => {
  const f = fixture(t);
  const path = join(f.folder, 'phases', '001-alpha-job.md');
  mkdirSync(join(f.folder, 'phases'), { recursive: true });
  const seeded = '---\nphase: 001-alpha-job\n---\nSEEDED BODY\n'; // no seq and no mirror row: the number 1 is handed out again
  writeFileSync(path, seeded);
  const first = node(f, NONE);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(readFileSync(path, 'utf8').includes('SEEDED BODY'));
  const forced = node(f, [...NONE, '--force']);
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(readFileSync(path, 'utf8').includes('SEEDED BODY'));
  assert.deepEqual(items(f).map(i => i.path).sort(), ['phases/001-alpha-job.md', 'phases/002-alpha-job.md', 'phases/003-alpha-job.md']);
});

test('review P2: a skills.md review document is accepted and persisted; no class field is written', t => {
  const f = fixture(t);
  const r = node(f, [...NONE, '--review-refs', 'references/review/skills.md', '--body', '## Definition of done\n- [ ] x']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const [item] = items(f);
  assert.deepEqual(item.fm.review_refs, ['references/review/skills.md']);
  assert.ok(!('work_class' in item.fm) && !('review_classes' in item.fm) && !('chunk' in item.fm));
  const o = oracle(t, fixture(t, 'new-oracle-'), [...NONE, '--review-refs', 'references/review/skills.md', '--body', '## Definition of done\n- [ ] x']);
  if (o) assert.equal(o.status, 0, o.stdout + o.stderr);
});

test('review P1: new whose rescan throws (an existing phase with size_score: []) removes the file it wrote and commits nothing', t => {
  const f = fixture(t);
  assert.equal(node(f, NONE).status, 0);
  const first = join(f.folder, 'phases', '001-alpha-job.md');
  writeFileSync(first, readFileSync(first, 'utf8').replace('\nseq: 1\n', '\nseq: 1\nsize_score: []\n'));
  const head = git(f.home, 'rev-parse', 'HEAD');
  const r = node(f, NONE);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(existsSync(join(f.folder, 'phases', '002-alpha-job.md')), false, 'the half-created item is gone');
  assert.equal(git(f.home, 'status', '--porcelain', '--untracked-files=all', '--', 'acme/demo/phases/002-alpha-job.md'), '');
  assert.equal(git(f.home, 'rev-parse', 'HEAD'), head);
});

test('review P1: new --split-from whose rescan throws leaves the mirror rows and events as they were (no stray split event)', t => {
  const f = fixture(t);
  assert.equal(node(f, NONE).status, 0);
  assert.equal(node(f, NONE).status, 0);
  const bad = join(f.folder, 'phases', '002-alpha-job.md');
  writeFileSync(bad, readFileSync(bad, 'utf8').replace('\nseq: 2\n', '\nseq: 2\nsize_score: []\n'));
  const rows = () => { const c = db.connect(f.folder); try { return JSON.stringify(c.prepare('SELECT * FROM phase ORDER BY id').all().concat(c.prepare('SELECT * FROM event ORDER BY id').all())); } finally { c.close(); } };
  const before = rows();
  const r = node(f, [...NONE, '--split-from', '1']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(rows(), before);
});

test('review P1: new --split-from an item of another team (TEAM_BRANCH differs) is refused and logs nothing', t => {
  const f = fixture(t);
  assert.equal(node(f, NONE).status, 0); // 001-alpha-job on acme/demo, branch main
  const rows = () => { const c = db.connect(f.folder); try { return JSON.stringify(c.prepare('SELECT * FROM event ORDER BY id').all()); } finally { c.close(); } };
  const before = rows();
  const r = node(f, [...NONE, '--split-from', '1', '--body', '## Definition of done\n- [ ] x'], { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'release' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /team session is bound to acme\/demo branch release/);
  assert.equal(rows(), before);
  assert.deepEqual(readdirSync(join(f.folder, 'phases')), ['001-alpha-job.md']);
});
