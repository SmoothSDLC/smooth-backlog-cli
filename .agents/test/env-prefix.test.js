import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { world } from './team-fixture.js';

// `backlog team pop` on a fixture of the team commands: the session's own variables are the only team variables it sees (the fixture clears them).
const run = (t, env) => world(t).run([], env, 'pop');

test('a session that sets only the old names is not seen: team pop answers that no team is set', t => {
  const r = run(t, { TEAM_NAME: 'parallel', BACKLOG_AGENT: 'a1' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /a team command needs a team: give --team <name>, or set the SMOOTH_BACKLOG_CLI_TEAM_NAME variable, or set the "team" key in \.backlog\/config\.json/);
});

test('the same command with the prefixed names behaves as it did with the old names', t => {
  const r = run(t, { SMOOTH_BACKLOG_CLI_TEAM_NAME: 'parallel', SMOOTH_BACKLOG_CLI_AGENT: 'a1' });
  assert.equal(r.status, 3, r.stdout + r.stderr); // nothing to offer a1: the idle answer, past the team and agent check
  assert.match(r.stdout, /idle: nothing for a1/);
  assert.doesNotMatch(r.stderr, /a team command needs/);
});

test('an old agent name alone is not the caller: the agent is missing too', t => {
  const r = run(t, { SMOOTH_BACKLOG_CLI_TEAM_NAME: 'parallel', BACKLOG_AGENT: 'a1' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable/);
});

const OLD = ['TEAM_NAME', 'TEAM_REPOSITORY', 'TEAM_BRANCH', 'TEAM_LEAD', 'BACKLOG_AGENT', 'BACKLOG_SESSION', 'BACKLOG_HOME', 'BACKLOG_ORIGIN_URL',
  'BACKLOG_LOCK_WAIT_MS', 'BACKLOG_PRIVATE_DENYLIST', 'BACKLOG_RUN_HOOK', 'BACKLOG_RUN_LOCK_HELD', 'BACKLOG_REVIEW_STALE_SECONDS'];
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
