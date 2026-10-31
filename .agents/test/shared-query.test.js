// Tests for src/shared/query.js - cli-parity job 12 (QUERY): the read views (--next --status --critical --phase --events
// --by-branch --all --branch --json) and `backlog next`. Local bare repos only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
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
  const r = cli(['new', '--name', name, '--objective', `Café ☕ ${name}`, '--summary', `sum ${name}`, '--depends-on', 'none', ...more], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r;
};
const setStatus = (f, item, status) => { const r = cli(['update', item, '--status', status], { cwd: f.cons, tmp: f.t }); assert.equal(r.status, 0, r.stdout + r.stderr); };
const commitAll = home => { git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', 'fixture'); git(home, 'push', '-q'); };

// Shared home + consumer acme/demo on main, built with the CLI:
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
  newItem(f, 'Alpha');
  newItem(f, 'Beta', '--severity', 'critical');
  newItem(f, 'Gamma');
  newItem(f, 'Delta');
  setStatus(f, '003-gamma', 'in_progress');
  setStatus(f, '004-delta', 'done');
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

// Runs a read view of the CLI; asserts its exit status.
function view(f, args, status = 0, cwd = f.cons) {
  const n = cli(['query', ...args], { cwd, tmp: f.t });
  assert.equal(n.status, status, `${args.join(' ')}: ${n.stderr}`);
  return n;
}

test('--status --json prints handoff, repository, branch, phases, gone_branch_items and findings', () => {
  const v = JSON.parse(view(fx(), ['--status', '--json']).stdout);
  assert.deepEqual(Object.keys(v), ['handoff', 'repository', 'branch', 'phases', 'gone_branch_items', 'findings']);
  assert.deepEqual(Object.keys(v.findings), ['foreign', 'untagged', 'ghost']);
  assert.deepEqual(v.gone_branch_items.map(x => x.slug), ['005-feat']);
  assert.deepEqual([v.findings.foreign.length, v.findings.untagged.length, v.findings.ghost.length], [1, 1, 1]);
});

test('--status text shows the critical banner', () => {
  assert.match(view(fx(), ['--status']).stdout, /CRITICAL ITEM\(S\) ON THE BACKLOG/);
});

test('--status with no view flag, --all and --branch exit 0', () => {
  const f = fx();
  for (const args of [[], ['--status', '--all'], ['--status', '--all', '--json'], ['--status', '--branch', 'feature'], ['--status', '--branch', 'feature', '--json']]) view(f, args);
});

test('--next --json prints the queue head; --next text prints the item, the banner and the mandate', () => {
  const f = fx();
  assert.equal(JSON.parse(view(f, ['--next', '--json']).stdout).slug, '002-beta');
  const text = view(f, ['--next']).stdout;
  assert.match(text, /NEXT-STEPS-MANDATE/);
  assert.match(text, /END-MANDATE/);
  view(f, ['--next', '--all']);
  view(f, ['--next', '--branch', 'feature', '--json']);
});

test('`backlog next` is --next', () => {
  const f = fx();
  const n = cli(['next'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 0, n.stderr);
  assert.equal(n.stdout, view(f, ['--next']).stdout);
});

test('an empty queue prints {} (JSON) or the info line, exit 0', () => {
  const f = fx();
  assert.notEqual(view(f, ['--next', '--branch', 'nowhere']).stdout, '');
  assert.equal(view(f, ['--next', '--branch', 'nowhere', '--json']).stdout.trim(), '{}');
});

test('--phase prints the item by slug and by number; not found is exit 1 on stdout', () => {
  const f = fx();
  for (const id of ['002-beta', '3', '003']) assert.match(JSON.parse(view(f, ['--phase', id]).stdout).slug, /^00[23]-/);
  assert.match(view(f, ['--phase', 'nope'], 1).stdout, /no phase 'nope'/);
});

test('--critical lists the open critical items (JSON and text) and says so when there are none', () => {
  const f = fx();
  view(f, ['--critical']);
  assert.ok(JSON.stringify(JSON.parse(view(f, ['--critical', '--json']).stdout)).includes('002-beta'));
  const g = build(false);
  setStatus(g, '002-beta', 'done');
  view(g, ['--critical']);
  assert.ok(!JSON.stringify(JSON.parse(view(g, ['--critical', '--json']).stdout)).includes('002-beta'));
});

test('--events (all, and for one item) and --by-branch exit 0', () => {
  const f = fx();
  for (const args of [['--events'], ['--events', '002-beta'], ['--events', '2'], ['--by-branch', 'main'], ['--by-branch', 'feature']]) view(f, args);
});

test('a repository without a backlog folder prints {} or the info line, exit 0', () => {
  const f = fx();
  const other = consumer(f.t, 'acme', 'fresh', 'main');
  for (const args of [['--status'], ['--next', '--json'], ['--status', '--json']]) view(f, args, 0, other);
  assert.equal(view(f, ['--next', '--json'], 0, other).stdout.trim(), '{}');
});

test('a detached HEAD without --branch or --all is exit 2', () => {
  const f = fx();
  const head = git(f.cons, 'rev-parse', 'HEAD');
  git(f.cons, 'checkout', '-q', '--detach');
  try {
    view(f, ['--next'], 2);
    view(f, ['--status'], 2);
    view(f, ['--status', '--all', '--json']);
  } finally { git(f.cons, 'checkout', '-q', 'main'); assert.equal(git(f.cons, 'rev-parse', 'HEAD'), head); }
});

test('a read view pulls first: an item pushed from another clone is shown, and no item or db file is written', () => {
  const f = build(false);
  const home2 = join(f.t, 'home2');
  git(f.t, 'clone', '-q', join(f.t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), home2);
  const r = cli(['new', '--name', 'Pushed', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_HOME: realpathSync(home2) } });
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
  const url = 'https://user:review_dummy@host/path';
  for (const args of [[`--bogus=${url}`], ['--phase', url], ['--events', url], [`--branch=${url}`, '--bogus']]) {
    const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
    assert.doesNotMatch(n.stdout + n.stderr, /review_dummy|user:/, args.join(' '));
    assert.notEqual(n.status, 0, args.join(' '));
  }
  assert.match(cli(['query', '--phase', url], { cwd: f.cons, tmp: f.t }).stdout, /^❌ no phase 'https:\/\/host\/path'/);
});

test('review P3: --json escapes U+007F and non-ASCII as \\u escapes', () => {
  const f = build(false);
  const con = db.connect(f.folder);
  con.prepare("UPDATE phase SET name=? WHERE slug='001-alpha'").run('a\x7fb \x80 é');
  con.close();
  assert.match(view(f, ['--phase', '1', '--json']).stdout, /"name": "a\\u007fb \\u0080 \\u00e9"/);
});

test('review P2 (second): input echoed in a normal result is redacted too (--branch and --agent in every view)', () => {
  const f = build(false);
  const url = 'https://user:review_dummy@host/path';
  for (const args of [['query', '--next', '--branch', url], ['query', '--next', '--branch', url, '--json'], ['query', '--status', '--branch', url], ['query', '--status', '--branch', url, '--json'],
    ['query', '--claimable', '--branch', url], ['query', '--reviewable', '--agent', 'cody', '--branch', url],
    ['pop', '--agent', 'x', '--branch', url], ['pop', '--agent', 'x', '--branch', url, '--json'], ['pop', '--agent', url], ['pop', '--agent', url, '--json']]) {
    const n = cli(args, { cwd: f.cons, tmp: f.t });
    assert.doesNotMatch(n.stdout + n.stderr, /review_dummy|user:/, args.join(' '));
    assert.ok(n.stdout.length > 0, `${args.join(' ')} printed nothing (${n.stderr})`);
  }
});
