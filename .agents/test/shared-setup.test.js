// Item 043: backlog setup writes the repository's .smooth-backlog.json (a path relative to the repository), clones the
// backlog repository beside it when it is missing, deploys the template skill into every agent folder present and
// switches on shared mode; --ask asks for the path. Local bare repos only; BACKLOG_HOME unset.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consumer, sharedBacklog } from './shared-fixtures.js';

const BIN = resolve(fileURLToPath(new URL('../../bin/backlog.js', import.meta.url)));
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'setup-'));
  dirs.push(t);
  sharedBacklog(t); // creates the bare origin (and a clone at <t>/home, unused here)
  const app = consumer(t, 'acme', 'app', 'main');
  for (const d of ['.claude', '.qwen']) mkdirSync(join(app, d));
  const env = { HOME: join(t, 'user'), XDG_CONFIG_HOME: join(t, 'config'), BACKLOG_HOME: '', BACKLOG_ORIGIN_URL: join(t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'),
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', QWEN_CODE_AGENT_ID: 'tester' };
  const run = (cwd, args, input) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, ...env }, input: input ?? '', encoding: 'utf8' }); return { status: r.status, stdout: r.stdout, stderr: r.stderr }; };
  return { t, app, run };
}
const cfg = app => JSON.parse(readFileSync(join(app, '.smooth-backlog.json'), 'utf8'));
const head = dir => spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

test('043: setup clones beside the repository, writes a relative config, deploys the skill; the path survives a move', () => {
  const { t, app, run } = fixture();
  const r = run(app, ['setup']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /Backlog repository path/); // no prompt without --ask
  const clone = join(t, 'consumer', 'smoothsdlc-backlog');
  assert.ok(existsSync(join(clone, '.git')));
  assert.deepEqual(cfg(app), { backlog_repository: '../smoothsdlc-backlog' });
  for (const d of ['.claude', '.qwen']) assert.ok(existsSync(join(app, d, 'skills', 'backlog', 'SKILL.md')), d);
  const made = run(app, ['new', '--name', 'first', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] x']);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  assert.ok(existsSync(join(clone, 'acme', 'app', 'phases', '001-first.md'))); // new used the configured clone
  renameSync(join(t, 'consumer'), join(t, 'moved')); // the repository and its sibling clone move together
  const moved = join(t, 'moved', 'app');
  const q = run(moved, ['query', '--phase', '1', '--agent', 'tester']);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal(JSON.parse(q.stdout).slug, '001-first');
  run(moved, ['query', '--phase', '1', '--agent', 'tester']);
  const u = run(moved, ['update', '1', '--append', 'after the move', '--by', 'tester']);
  assert.equal(u.status, 0, u.stdout + u.stderr);
  assert.match(readFileSync(join(t, 'moved', 'smoothsdlc-backlog', 'acme', 'app', 'phases', '001-first.md'), 'utf8'), /after the move/);
});

test('043: a second setup leaves the clone, replaces the skill copies and keeps the config; a missing clone names backlog setup', () => {
  const { t, app, run } = fixture();
  assert.equal(run(app, ['setup']).status, 0);
  const clone = join(t, 'consumer', 'smoothsdlc-backlog');
  writeFileSync(join(clone, 'untracked.txt'), 'mine');
  const before = head(clone);
  writeFileSync(join(app, '.claude', 'skills', 'backlog', 'SKILL.md'), 'edited');
  writeFileSync(join(app, '.smooth-backlog.json'), JSON.stringify({ backlog_repository: '../smoothsdlc-backlog', note: 'kept' }));
  const again = run(app, ['setup']);
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.equal(head(clone), before);
  assert.equal(readFileSync(join(clone, 'untracked.txt'), 'utf8'), 'mine'); // not cloned again, left unchanged
  assert.notEqual(readFileSync(join(app, '.claude', 'skills', 'backlog', 'SKILL.md'), 'utf8'), 'edited'); // the release's copy
  assert.equal(cfg(app).note, 'kept');
  writeFileSync(join(app, '.smooth-backlog.json'), JSON.stringify({ backlog_repository: '../nowhere' }));
  const missing = run(app, ['query', '--status']);
  assert.equal(missing.status, 4, missing.stdout + missing.stderr);
  assert.match(missing.stderr, /backlog setup.*backlog setup --ask/);
  assert.doesNotMatch(missing.stderr, /set_home\.py/);
});

test('043: setup --ask shows the default, uses the answer and records it relative to the repository', () => {
  const { t, app, run } = fixture();
  const elsewhere = join(t, 'clones', 'backlog');
  const r = run(app, ['setup', '--ask'], `${elsewhere}\n`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, new RegExp(`Backlog repository path \\[${join(t, 'consumer', 'smoothsdlc-backlog').replace(/[/.]/g, '\\$&')}\\]: `));
  assert.ok(existsSync(join(elsewhere, '.git')));
  assert.deepEqual(cfg(app), { backlog_repository: '../../clones/backlog' });
  const keep = run(app, ['setup', '--ask'], '\n'); // an empty answer takes the default: the configured clone
  assert.equal(keep.status, 0, keep.stdout + keep.stderr);
  assert.deepEqual(cfg(app), { backlog_repository: '../../clones/backlog' });
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
  assert.equal(readFileSync(join(outside, 'backlog', 'keep.txt'), 'utf8'), 'keep');
  assert.ok(!existsSync(join(t, 'consumer', 'smoothsdlc-backlog')) && !existsSync(join(app, '.smooth-backlog.json'))); // checked first: nothing changed
});
