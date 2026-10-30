// Tests for src/shared/query.js - cli-parity job 12 (QUERY): the read views of query.py:361-619 and `backlog next`.
// Oracle: query.py (--next --status --critical --phase --events --by-branch --all --branch --json, the findings
// banner :328-329) run on the same temporary fixture; stdout and exit status must be identical. Parity tests skip
// when SMOOTH_BACKLOG_SCRIPTS is not configured or PyYAML is missing. Local bare repos only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withoutTeamFields, cli, consumer, GIT_IDENTITY, ORACLE_SKIP, py, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

const newItem = (f, name, ...more) => {
  const r = py('new_phase.py', ['--name', name, '--objective', `Café ☕ ${name}`, '--summary', `sum ${name}`, '--depends-on', 'none', ...more], { cwd: f.cons, tmp: f.t });
  if (!r) return null;
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r;
};
const commitAll = home => { git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', 'fixture'); git(home, 'push', '-q'); };

// Shared home + consumer acme/demo on main. Built with the Python scripts so the mirror database is the real one:
// open items on main (one critical, one in progress), a done item, an item of branch "feature" that is not on the
// origin (a gone-branch item), and hand-made foreign, untagged and ghost findings. Mode is set to shared.
function build(withFindings) {
  const t = mkdtempSync(join(tmpdir(), 'query-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const f = { t, home, cons, folder: join(home, 'acme', 'demo') };
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  if (!newItem(f, 'Alpha')) return { ...f, noOracle: true };
  newItem(f, 'Beta', '--severity', 'critical');
  newItem(f, 'Gamma');
  newItem(f, 'Delta');
  assert.equal(py('update.py', ['003-gamma', '--status', 'in_progress'], { cwd: cons, tmp: t }).status, 0);
  assert.equal(py('update.py', ['004-delta', '--status', 'done'], { cwd: cons, tmp: t }).status, 0);
  git(cons, 'checkout', '-q', '-b', 'feature');
  newItem(f, 'Feat');
  git(cons, 'checkout', '-q', 'main');
  if (withFindings) {
    newItem(f, 'Ghost');
    const item = (seq, name, extra) => store.write({
      path: join(f.folder, `phases/${String(seq).padStart(3, '0')}-${name}.md`),
      fm: { phase: `${String(seq).padStart(3, '0')}-${name}`, seq, name, objective: 'o', summary: 's', status: 'pending', severity: 'normal', priority: 9, repository: 'acme/demo', branch: 'main', commit: 'abc1234', location: '', ...extra },
      body: `\n# Phase ${seq}\n`,
    });
    item(store.nextSeq(f.folder), 'foreign', { repository: 'other/thing' });
    item(store.nextSeq(f.folder), 'untagged', { branch: '' });
    const con = db.connect(f.folder);
    db.scan(con, f.folder);
    con.close();
    rmSync(join(f.folder, 'phases', '006-ghost.md'));
    commitAll(home);
  }
  return f;
}
let shared;
const fx = () => (shared ??= build(true));

// Runs the oracle and the Node view on the same fixture; null (and a skip) without the oracle.
function both(t, f, args) {
  if (f.noOracle) return t.skip(ORACLE_SKIP);
  const o = py('query.py', args, { cwd: f.cons, tmp: f.t });
  const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
  return { o, n };
}
// --phase prints the oracle's row and then the whole item (front_matter and body, item 033): the row part is the oracle's.
const rowOnly = (args, out) => {
  if (!args.includes('--phase') || !out.startsWith('{')) return out;
  const { front_matter: _f, body: _b, missing: _m, ...row } = JSON.parse(out); // eslint-disable-line no-unused-vars
  return `${JSON.stringify(row, null, 2)}\n`;
};
function same(t, f, args) {
  const r = both(t, f, args);
  if (!r) return null;
  assert.equal(r.n.status, r.o.status, `${args.join(' ')}: ${r.n.stderr}`);
  assert.equal(withoutTeamFields(rowOnly(args, r.n.stdout)), args.includes('--phase') && r.o.stdout.startsWith('{') ? `${JSON.stringify(JSON.parse(r.o.stdout), null, 2)}\n` : r.o.stdout);
  assert.equal(r.n.stderr, r.o.stderr);
  return r;
}

test('--status --json prints the same JSON as query.py (handoff, phases, gone_branch_items, findings)', t => {
  const f = fx();
  const r = same(t, f, ['--status', '--json']);
  if (!r) return;
  const v = JSON.parse(r.n.stdout);
  assert.deepEqual(Object.keys(v), ['handoff', 'repository', 'branch', 'phases', 'gone_branch_items', 'findings']);
  assert.deepEqual(Object.keys(v.findings), ['foreign', 'untagged', 'ghost']);
  assert.deepEqual(v.gone_branch_items.map(x => x.slug), ['005-feat']);
  assert.deepEqual([v.findings.foreign.length, v.findings.untagged.length, v.findings.ghost.length], [1, 1, 1]);
});

test('--status text (findings banner, critical banner, queue, gone-branch warning) is byte-identical to query.py', t => {
  const r = same(t, fx(), ['--status']);
  if (r) assert.match(r.n.stdout, /CRITICAL ITEM\(S\) ON THE BACKLOG/);
});

test('--status with no view flag, --all and --branch', t => {
  const f = fx();
  same(t, f, []);
  same(t, f, ['--status', '--all']);
  same(t, f, ['--status', '--all', '--json']);
  same(t, f, ['--status', '--branch', 'feature']);
  same(t, f, ['--status', '--branch', 'feature', '--json']);
});

test('--next --json prints the same row as query.py; --next text prints the item, the banner and the mandate', t => {
  const f = fx();
  const r = same(t, f, ['--next', '--json']);
  if (!r) return;
  assert.equal(JSON.parse(r.n.stdout).slug, '002-beta');
  const text = same(t, f, ['--next']);
  assert.match(text.n.stdout, /NEXT-STEPS-MANDATE/);
  assert.match(text.n.stdout, /END-MANDATE/);
  same(t, f, ['--next', '--all']);
  same(t, f, ['--next', '--branch', 'feature', '--json']);
});

test('`backlog next` is --next', t => {
  const f = fx();
  const r = both(t, f, ['--next', '--json']);
  if (!r) return;
  const n = cli(['next'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 0, n.stderr);
  assert.equal(n.stdout, py('query.py', ['--next'], { cwd: f.cons, tmp: f.t }).stdout);
});

test('an empty queue prints {} (JSON) or the info line, exit 0', t => {
  const f = fx();
  same(t, f, ['--next', '--branch', 'nowhere']);
  same(t, f, ['--next', '--branch', 'nowhere', '--json']);
});

test('--phase prints the same row as query.py, by slug and by number; not found is exit 1 on stdout', t => {
  const f = fx();
  same(t, f, ['--phase', '002-beta']);
  same(t, f, ['--phase', '3']);
  same(t, f, ['--phase', '003']);
  const r = same(t, f, ['--phase', 'nope']);
  if (r) assert.equal(r.n.status, 1);
});

test('--critical lists the open critical items (JSON and text) and says so when there are none', t => {
  const f = fx();
  same(t, f, ['--critical']);
  same(t, f, ['--critical', '--json']);
  const g = build(false);
  if (g.noOracle) return;
  assert.equal(py('update.py', ['002-beta', '--status', 'done'], { cwd: g.cons, tmp: g.t }).status, 0);
  same(t, g, ['--critical']);
  same(t, g, ['--critical', '--json']);
});

test('--events (all, and for one item) and --by-branch match query.py', t => {
  const f = fx();
  same(t, f, ['--events']);
  same(t, f, ['--events', '002-beta']);
  same(t, f, ['--events', '2']);
  same(t, f, ['--by-branch', 'main']);
  same(t, f, ['--by-branch', 'feature']);
});

test('a repository without a backlog folder prints {} or the info line, exit 0', t => {
  const f = fx();
  if (f.noOracle) return t.skip(ORACLE_SKIP);
  const other = consumer(f.t, 'acme', 'fresh', 'main');
  for (const args of [['--status'], ['--next', '--json'], ['--status', '--json']]) {
    const o = py('query.py', args, { cwd: other, tmp: f.t });
    const n = cli(['query', ...args], { cwd: other, tmp: f.t });
    assert.equal(n.status, o.status);
    assert.equal(n.stdout, o.stdout);
  }
});

test('a detached HEAD without --branch or --all is exit 2 with the oracle message', t => {
  const f = fx();
  if (f.noOracle) return t.skip(ORACLE_SKIP);
  const head = git(f.cons, 'rev-parse', 'HEAD');
  git(f.cons, 'checkout', '-q', '--detach');
  try {
    same(t, f, ['--next']);
    same(t, f, ['--status']);
    const r = same(t, f, ['--status', '--all', '--json']);
    assert.equal(r.n.status, 0);
    same(t, f, ['--phase', '002-beta']);
  } finally { git(f.cons, 'checkout', '-q', 'main'); assert.equal(git(f.cons, 'rev-parse', 'HEAD'), head); }
});

test('a read view pulls first: an item pushed from another clone is shown, and no item or db file is written', t => {
  const f = build(false);
  if (f.noOracle) return t.skip(ORACLE_SKIP);
  const home2 = join(f.t, 'home2');
  git(f.t, 'clone', '-q', join(f.t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), home2);
  const r = py('new_phase.py', ['--name', 'Pushed', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_HOME: realpathSync(home2) } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const before = git(f.home, 'rev-parse', 'HEAD');
  const n = cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 0, n.stderr);
  assert.ok(JSON.parse(n.stdout).phases.some(p => p.slug === '006-pushed'));
  assert.notEqual(git(f.home, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  const files = git(f.home, 'ls-files', '-s');
  for (const args of [['--next'], ['--status'], ['--phase', '1'], ['--events'], ['--critical'], ['--by-branch', 'main']]) cli(['query', ...args], { cwd: f.cons, tmp: f.t });
  assert.equal(git(f.home, 'ls-files', '-s'), files);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
});

test('a failed pull stops the read: exit 3 and nothing printed on stdout', t => {
  const f = build(false);
  git(f.home, 'remote', 'set-url', 'origin', join(f.t, 'gone', 'SmoothSDLC', 'smoothsdlc-backlog.git'));
  const n = cli(['query', '--status'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 3);
  assert.equal(n.stdout, '');
  assert.match(n.stderr, /^❌ backlog: could not update .* from origin\/main/);
});

test('--headless is refused with exit 2 (the team views are views.js, --pop and --plan are pop.js)', t => {
  const f = fx();
  for (const args of [['--next', '--headless']]) {
    const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
    assert.equal(n.status, 2, args.join(' '));
    assert.equal(n.stdout, '');
    assert.match(n.stderr, /^❌ backlog: .*(not built yet|not in this build)/);
  }
  const n = cli(['query', '--pop'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 2);
  assert.match(n.stderr, /--pop needs --agent <your name>/);
});

test('an unknown flag is exit 2', () => {
  const f = fx();
  const n = cli(['query', '--bogus'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 2);
  assert.match(n.stderr, /unrecognized arguments: --bogus/);
});

// --- review fixes (job 12) ---
for (const link of ['repo', 'db', 'owner']) test(`review P1: a symlink at ${{ repo: '<home>/<owner>/<repo>', db: 'backlog.db', owner: '<home>/<owner>' }[link]} is refused and the outside database is not touched`, () => {
  {
    const f = build(false);
    if (f.noOracle) return;
    const outside = join(f.t, 'outside');
    const target = link === 'owner' ? join(f.home, 'acme') : link === 'repo' ? f.folder : join(f.folder, 'backlog.db');
    cpSync(target, outside, { recursive: true });
    rmSync(target, { recursive: true, force: true });
    symlinkSync(outside, target);
    const dbFile = link === 'db' ? outside : join(outside, ...(link === 'owner' ? ['demo'] : []), 'backlog.db');
    const before = readFileSync(dbFile);
    const n = cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t });
    assert.notEqual(n.status, 0, link);
    assert.match(n.stdout + n.stderr, /Symlink destination is unsupported|Unsafe path/, link);
    assert.deepEqual(readFileSync(dbFile), before, link);
  }
});

// Points the 001-alpha row (queue head) at `path` and returns the Node view of --next --json / --status --json.
function withRowPath(f, path) {
  const con = db.connect(f.folder);
  con.prepare("UPDATE phase SET path=?, priority=-1 WHERE slug='001-alpha'").run(path);
  con.close();
  return {
    next: JSON.parse(cli(['query', '--next', '--json'], { cwd: f.cons, tmp: f.t }).stdout),
    status: JSON.parse(cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t }).stdout),
  };
}

test('review P2: a row path that leaves the folder (.. or absolute) is a ghost, not an existing file', () => {
  const f = build(false);
  if (f.noOracle) return;
  const secret = join(f.t, 'secret.md');
  writeFileSync(secret, 'outside\n');
  for (const path of ['../../../secret.md', secret, '../../../../../../../../../etc/passwd']) {
    const r = withRowPath(f, path);
    assert.notEqual(r.next.slug, '001-alpha', path);
    assert.deepEqual(r.status.findings.ghost.map(x => x.slug), ['001-alpha'], path);
  }
});

test('review P2: a row path through a symlink to a file outside the folder is a ghost', () => {
  const f = build(false);
  if (f.noOracle) return;
  writeFileSync(join(f.t, 'secret.md'), 'outside\n');
  symlinkSync(join(f.t, 'secret.md'), join(f.folder, 'phases', 'link.md'));
  const r = withRowPath(f, 'phases/link.md');
  assert.notEqual(r.next.slug, '001-alpha');
  assert.deepEqual(r.status.findings.ghost.map(x => x.slug), ['001-alpha']);
  // a file inside the folder is still found
  assert.deepEqual(withRowPath(f, 'phases/002-beta.md').status.findings.ghost, []);
});

test('review P2: input echoed in a diagnostic is redacted (flags, missing items)', () => {
  const f = build(false);
  if (f.noOracle) return;
  const url = 'https://user:review_dummy@host/path';
  for (const args of [[`--bogus=${url}`], ['--phase', url], ['--events', url], [`--branch=${url}`, '--bogus']]) {
    const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
    assert.doesNotMatch(n.stdout + n.stderr, /review_dummy|user:/, args.join(' '));
    assert.notEqual(n.status, 0, args.join(' '));
  }
  assert.match(cli(['query', '--phase', url], { cwd: f.cons, tmp: f.t }).stdout, /^❌ no phase 'https:\/\/host\/path'/);
});

test('review P3: --json escapes U+007F like json.dumps', t => {
  const f = build(false);
  if (f.noOracle) return t.skip(ORACLE_SKIP);
  const con = db.connect(f.folder);
  con.prepare("UPDATE phase SET name=? WHERE slug='001-alpha'").run('a\x7fb \x80 é');
  con.close();
  const r = same(t, f, ['--phase', '1', '--json']);
  assert.match(r.n.stdout, /"name": "a\\u007fb \\u0080 \\u00e9"/);
});

test('review P2 (second): input echoed in a normal result is redacted too (--branch and --agent in every view)', () => {
  const f = build(false);
  if (f.noOracle) return;
  const url = 'https://user:review_dummy@host/path';
  for (const args of [['query', '--next', '--branch', url], ['query', '--next', '--branch', url, '--json'], ['query', '--status', '--branch', url], ['query', '--status', '--branch', url, '--json'],
    ['query', '--claimable', '--branch', url], ['query', '--reviewable', '--agent', 'cody', '--branch', url],
    ['pop', '--agent', 'x', '--branch', url], ['pop', '--agent', 'x', '--branch', url, '--json'], ['pop', '--agent', url], ['pop', '--agent', url, '--json']]) {
    const n = cli(args, { cwd: f.cons, tmp: f.t });
    assert.doesNotMatch(n.stdout + n.stderr, /review_dummy|user:/, args.join(' '));
    assert.ok(n.stdout.length > 0, `${args.join(' ')} printed nothing (${n.stderr})`);
  }
});
