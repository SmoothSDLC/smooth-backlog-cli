// Every environment variable the CLI owns is read only under its SMOOTH_BACKLOG_CLI_ name; the old names are not read (no alias).
// Local bare repositories only, items made with the CLI.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// the session's own variables are the only team variables a command sees: whatever the test runner's environment holds is cleared
const CLEARED = Object.fromEntries(['TEAM_NAME', 'TEAM_REPOSITORY', 'TEAM_BRANCH', 'TEAM_LEAD', 'BACKLOG_AGENT', 'BACKLOG_SESSION',
  'SMOOTH_BACKLOG_CLI_TEAM_NAME', 'SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY', 'SMOOTH_BACKLOG_CLI_TEAM_BRANCH', 'SMOOTH_BACKLOG_CLI_TEAM_LEAD',
  'SMOOTH_BACKLOG_CLI_AGENT', 'SMOOTH_BACKLOG_CLI_SESSION'].map(k => [k, '']));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'env-prefix-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ web: { lead: 'a1', members: ['a1'] } }));
  const f = { t, cons };
  const made = cli(['new', '--name', 'first', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: cons, tmp: t, env: CLEARED, plain: true });
  assert.equal(made.status, 0, made.stdout + made.stderr);
  return f;
}
const run = (f, env) => cli(['team', 'pop'], { cwd: f.cons, tmp: f.t, env: { ...CLEARED, ...env }, plain: true });

test('a session that sets only the old names is not seen: team pop answers that no team is set', () => {
  const f = fixture();
  const r = run(f, { TEAM_NAME: 'web', BACKLOG_AGENT: 'a1' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /a team command needs --team <name> \(or SMOOTH_BACKLOG_CLI_TEAM_NAME, or a team in \.backlog\/config\.json\)/);
});

test('the same command with the prefixed names behaves as it did with the old names', () => {
  const f = fixture();
  const r = run(f, { SMOOTH_BACKLOG_CLI_TEAM_NAME: 'web', SMOOTH_BACKLOG_CLI_AGENT: 'a1' });
  assert.equal(r.status, 3, r.stdout + r.stderr); // nothing to offer a1: the idle answer, past the team and agent check
  assert.match(r.stdout, /idle\s+nothing for a1/);
  assert.doesNotMatch(r.stderr, /a team command needs/);
});

test('an old agent name alone is not the caller: the agent is missing too', () => {
  const f = fixture();
  const r = run(f, { SMOOTH_BACKLOG_CLI_TEAM_NAME: 'web', BACKLOG_AGENT: 'a1' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /a team command needs --agent <name> \(or SMOOTH_BACKLOG_CLI_AGENT, /);
});

const OLD = ['TEAM_NAME', 'TEAM_REPOSITORY', 'TEAM_BRANCH', 'TEAM_LEAD', 'BACKLOG_AGENT', 'BACKLOG_SESSION', 'BACKLOG_HOME', 'BACKLOG_ORIGIN_URL',
  'BACKLOG_LOCK_WAIT_MS', 'BACKLOG_PRIVATE_DENYLIST', 'BACKLOG_RUN_HOOK', 'BACKLOG_RUN_LOCK_HELD', 'BACKLOG_REVIEW_STALE_SECONDS', 'BACKLOG_TEST_SELF'];
const sources = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? sources(p) : p.endsWith('.js') ? [p] : [];
});

test('no file of src or bin names an unprefixed variable of the CLI; the prefixed form is allowed', () => {
  const re = new RegExp(`(?<![A-Za-z0-9_])(${OLD.join('|')})(?![A-Za-z0-9_])`);
  const hits = [];
  for (const file of [...sources('src'), 'bin/backlog.js']) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`); });
  }
  assert.deepEqual(hits, []);
  const prefixed = OLD.map(n => `SMOOTH_BACKLOG_CLI_${n.replace(/^BACKLOG_/, '')}`);
  const text = [...sources('src'), 'bin/backlog.js'].map(f => readFileSync(f, 'utf8')).join('\n');
  for (const n of prefixed) assert.ok(text.includes(n) || n.endsWith('PRIVATE_DENYLIST'), `${n} is read nowhere in src or bin`);
});
