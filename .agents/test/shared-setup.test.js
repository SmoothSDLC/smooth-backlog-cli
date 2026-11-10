// backlog setup writes the repository's .backlog/config.json (a path relative to the repository), clones the
// backlog repository beside it when it is missing, deploys the template skill into every agent folder present and
// --ask asks for the path. Local bare repos only; SMOOTH_BACKLOG_CLI_HOME unset.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKLOG_NAME, BACKLOG_OWNER, consumer, itemPath, sharedBacklog, readHeader } from './shared-fixtures.js';

const BIN = resolve(fileURLToPath(new URL('../../bin/backlog.js', import.meta.url)));
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'setup-'));
  dirs.push(t);
  sharedBacklog(t); // creates the bare origin (and a clone at <t>/home, unused here)
  const app = consumer(t, 'acme', 'app', 'main');
  for (const d of ['.claude', '.qwen']) mkdirSync(join(app, d));
  const env = { HOME: join(t, 'user'), XDG_CONFIG_HOME: join(t, 'config'), SMOOTH_BACKLOG_CLI_HOME: '', SMOOTH_BACKLOG_CLI_ORIGIN_URL: join(t, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`),
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', SMOOTH_BACKLOG_CLI_AGENT: 'tester' };
  const run = (cwd, args, input) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, ...env }, input: input ?? '', encoding: 'utf8' }); return { status: r.status, stdout: r.stdout, stderr: r.stderr }; };
  return { t, app, run };
}
const cfg = app => JSON.parse(readFileSync(join(app, '.backlog', 'config.json'), 'utf8'));
const head = dir => spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

test('043: setup clones beside the repository, writes a relative config, deploys the skill; the path survives a move', () => {
  const { t, app, run } = fixture();
  const r = run(app, ['setup']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /Backlog repository path/); // no prompt without --ask
  const clone = join(t, 'consumer', BACKLOG_NAME);
  assert.ok(existsSync(join(clone, '.git')));
  assert.equal(cfg(app).backlog_repository, `../${BACKLOG_NAME}`);
  for (const d of ['.claude', '.qwen']) assert.ok(existsSync(join(app, d, 'skills', 'backlog', 'SKILL.md')), d);
  const made = run(app, ['new', '--name', 'first', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] x']);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  assert.ok(existsSync(itemPath(join(clone, 'acme', 'app'), '001-first'))); // new used the configured clone
  renameSync(join(t, 'consumer'), join(t, 'moved')); // the repository and its sibling clone move together
  const moved = join(t, 'moved', 'app');
  const q = run(moved, ['show', '1', '--agent', 'tester']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).slug, '001-first');
  run(moved, ['show', '1', '--agent', 'tester']);
  const u = run(moved, ['update', '1', '--append', 'after the move', '--by', 'tester']);
  assert.equal(u.status, 0, u.stdout + u.stderr);
  assert.match(readFileSync(itemPath(join(t, 'moved', BACKLOG_NAME, 'acme', 'app'), '001-first'), 'utf8'), /after the move/);
});

test('043: a second setup leaves the clone, replaces the skill copies and keeps the config; a missing clone names backlog setup', () => {
  const { t, app, run } = fixture();
  assert.equal(run(app, ['setup']).status, 0);
  const clone = join(t, 'consumer', BACKLOG_NAME);
  writeFileSync(join(clone, 'untracked.txt'), 'mine');
  const before = head(clone);
  writeFileSync(join(app, '.claude', 'skills', 'backlog', 'SKILL.md'), 'edited');
  writeFileSync(join(app, '.backlog', 'config.json'), JSON.stringify({ backlog_repository: `../${BACKLOG_NAME}`, note: 'kept' }));
  const again = run(app, ['setup']);
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.equal(head(clone), before);
  assert.equal(readFileSync(join(clone, 'untracked.txt'), 'utf8'), 'mine'); // not cloned again, left unchanged
  assert.notEqual(readFileSync(join(app, '.claude', 'skills', 'backlog', 'SKILL.md'), 'utf8'), 'edited'); // the release's copy
  assert.equal(cfg(app).note, 'kept');
  writeFileSync(join(app, '.backlog', 'config.json'), JSON.stringify({ backlog_repository: '../nowhere' }));
  const missing = run(app, ['list']);
  assert.equal(missing.status, 4, missing.stdout + missing.stderr);
  assert.match(missing.stderr, /backlog setup.*backlog setup --ask/);
  assert.doesNotMatch(missing.stderr, /set_home\.py/);
});

test('043: setup --ask shows the default, uses the answer and records it relative to the repository', () => {
  const { t, app, run } = fixture();
  const elsewhere = join(t, 'clones', 'backlog');
  const r = run(app, ['setup', '--ask'], `${elsewhere}\n`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // the CLI prints the real path (macOS: /var is /private/var)
  assert.match(r.stderr, new RegExp(`Backlog repository path \\[${join(realpathSync(t), 'consumer', BACKLOG_NAME).replace(/[/.]/g, '\\$&')}\\]: `));
  assert.ok(existsSync(join(elsewhere, '.git')));
  assert.equal(cfg(app).backlog_repository, '../../clones/backlog');
  const keep = run(app, ['setup', '--ask'], '\n'); // an empty answer takes the default: the configured clone
  assert.equal(keep.status, 0, keep.stdout + keep.stderr);
  assert.equal(cfg(app).backlog_repository, '../../clones/backlog');
});

test('043: setup removes nothing through a symbolic link in an agent folder', () => {
  const { t, app, run } = fixture();
  const outside = join(t, 'outside');
  mkdirSync(join(outside, 'backlog'), { recursive: true });
  writeFileSync(join(outside, 'backlog', 'keep.txt'), 'keep');
  symlinkSync(outside, join(app, '.claude', 'skills'));
  const r = run(app, ['setup']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /symbolic link on the way: nothing changed/);
  assert.ok(!r.stderr.includes(t), 'no absolute path');
  assert.match(r.stderr, /^❌ backlog: \.claude\/skills\/backlog: Symlink destination is unsupported: \.claude\/skills\./);
  assert.equal(readFileSync(join(outside, 'backlog', 'keep.txt'), 'utf8'), 'keep');
  assert.ok(!existsSync(join(t, 'consumer', BACKLOG_NAME)) && !existsSync(join(app, '.smooth-backlog.json'))); // checked first: nothing changed
});

test('setup records the user (the git user name, else the login name) and an empty team; a second setup keeps what is there', () => {
  const plain = fixture();
  assert.equal(plain.run(plain.app, ['setup']).status, 0);
  assert.equal(cfg(plain.app).user, userInfo().username); // this repository's git has no user.name
  assert.equal(cfg(plain.app).team, '');
  const named = fixture();
  spawnSync('git', ['-C', named.app, 'config', 'user.name', 'Ada Lovelace']);
  assert.equal(named.run(named.app, ['setup']).status, 0);
  assert.equal(cfg(named.app).user, 'Ada Lovelace');
  writeFileSync(join(named.app, '.backlog', 'config.json'), JSON.stringify({ ...cfg(named.app), user: 'Grace', team: 't1' }));
  assert.equal(named.run(named.app, ['setup']).status, 0);
  assert.deepEqual([cfg(named.app).user, cfg(named.app).team], ['Grace', 't1']);
  // an item outside a team records its owner; with no agent named the user writes
  const made = named.run(named.app, ['new', '--name', 'mine', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] x']);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  assert.equal(readHeader(itemPath(join(named.t, 'consumer', BACKLOG_NAME, 'acme', 'app'), '001-mine'), 'owner'), 'Grace');
});

const count = dir => Number(spawnSync('git', ['-C', dir, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).stdout);
const SHIPPED = fileURLToPath(new URL('../../templates/teams/', import.meta.url));
const FIVE = ['extreme-programming.json', 'parallel.json', 'patterns.json', 'scrum.json', 'single-agent.json'];

test('setup copies the five generic templates into .backlog/team-templates, says so and commits them', () => {
  const { app, run } = fixture();
  const r = run(app, ['setup']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✅ team templates copied to \.backlog\/team-templates: scrum, extreme-programming, parallel, single-agent, patterns; copy one to the team file and edit it there\n/);
  assert.deepEqual(readdirSync(join(app, '.backlog', 'team-templates')).sort(), FIVE);
  assert.equal(readFileSync(join(app, '.backlog', 'team-templates', 'scrum.json'), 'utf8'), readFileSync(join(SHIPPED, 'scrum.json'), 'utf8'));
  const tracked = spawnSync('git', ['-C', app, 'ls-files', '.backlog/team-templates'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.deepEqual(tracked.map(f => f.split('/').pop()).sort(), FIVE);
  assert.equal(spawnSync('git', ['-C', app, 'status', '--porcelain'], { encoding: 'utf8' }).stdout, '');
});

test('a second setup replaces an edited copy and removes a file the person added there, as for the skill copy', () => {
  const { app, run } = fixture();
  assert.equal(run(app, ['setup']).status, 0);
  const commits = count(app);
  const dir = join(app, '.backlog', 'team-templates');
  writeFileSync(join(dir, 'scrum.json'), '{"edited": true}');
  writeFileSync(join(dir, 'my-team.json'), '{}');
  const r = run(app, ['setup']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(join(dir, 'scrum.json'), 'utf8'), readFileSync(join(SHIPPED, 'scrum.json'), 'utf8'));
  assert.ok(!readdirSync(dir).includes('my-team.json'));
  assert.equal(count(app), commits);
  assert.equal(spawnSync('git', ['-C', app, 'status', '--porcelain'], { encoding: 'utf8' }).stdout, '');
});

test('a symbolic link as the templates folder stops setup with exit 2, naming the path relative to the repository, and changes nothing', () => {
  const { t, app, run } = fixture();
  mkdirSync(join(app, '.backlog'));
  const outside = join(t, 'elsewhere');
  mkdirSync(outside);
  symlinkSync(outside, join(app, '.backlog', 'team-templates'));
  const before = head(app);
  const r = run(app, ['setup']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /^❌ backlog: Symlink destination is unsupported: \.backlog\/team-templates\. Resolve it before using backlog\. \(a symbolic link/);
  assert.ok(!r.stderr.includes(t), 'no absolute path');
  assert.deepEqual(readdirSync(outside), []);
  assert.equal(head(app), before);
  assert.ok(!existsSync(join(app, '.backlog', 'config.json')));
});
