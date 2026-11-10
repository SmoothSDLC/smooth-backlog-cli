// Batch B02: where the team file is (the pure resolution), and an unreadable .backlog/config.json that stops every command.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GIT_IDENTITY, cli, consumer } from './shared-fixtures.js';
import { missingText, teamsFile } from '../../src/team/teams-file.js';

const T = 'the default .backlog/teams.json';
const CASES = [
  ['R22-01', { top: '/work/app', home: '/work/app/.backlog', repo: 'local/repository', cfg: { backlog_repository: '.backlog' } }, '/work/app/.backlog/teams.json', T],
  ['R22-02', { top: '/work/app', home: '/work/backlog', repo: 'acme/app', cfg: { backlog_repository: '../backlog' } }, '/work/backlog/acme/app/teams.json', 'the backlog repository folder'],
  ['R22-03', { top: '/work/app', home: '/work/backlog', repo: 'acme/app', cfg: { backlog_repository: '../backlog', teams_file: '../private/web-teams.json' } }, '/work/private/web-teams.json', 'the teams_file key'],
  ['R22-04', { top: '/work/app', home: '/work/app/.backlog', repo: 'local/repository', cfg: { teams_file: 'team/rules.json' } }, '/work/app/team/rules.json', 'the teams_file key'],
  ['R22-06', { top: '/x/app', home: '/x/app/..backlog', repo: 'acme/app', cfg: { backlog_repository: '..backlog' } }, '/x/app/.backlog/teams.json', T],
  ['R22-07', { top: '/work/app', home: '/work/backlog', repo: 'acme/lib', workRepo: 'acme/app', cfg: { backlog_repository: '../backlog', teams_file: 'team/rules.json' } }, '/work/backlog/acme/lib/teams.json', 'the repository input'],
  ['R22-08', { top: '/work/app', home: '/elsewhere/backlog', repo: 'acme/app', cfg: {} }, '/work/app/.backlog/teams.json', T],
];
for (const [id, input, path, how] of CASES) {
  test(`${id}: the team file is ${how}`, () => {
    const got = teamsFile(input);
    assert.equal(got.path, path);
    assert.equal(got.how, how);
    assert.equal(got.shaIn, how === 'the repository input' ? 'record' : 'config');
  });
}
test('R22-05: no team file at the resolved path names the three ways', () => {
  const got = teamsFile({ top: '/work/app', home: '/work/app/.backlog', repo: 'local/repository', cfg: {} });
  assert.equal(missingText(got.path), 'no team file at /work/app/.backlog/teams.json; name one with the "teams_file" key of .backlog/config.json, or put it at <backlog repository>/<owner>/<name>/teams.json when the "backlog_repository" key names a folder outside the repository, else at .backlog/teams.json');
});

test('the location, read from a real configuration file: the teams_file key wins, else a backlog repository outside, else .backlog/teams.json', t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-where-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); mkdirSync(join(top, '.backlog'), { recursive: true });
  const set = c => writeFileSync(join(top, '.backlog', 'config.json'), JSON.stringify(c));
  set({ backlog_repository: '.backlog' });
  assert.equal(teamsFile({ top, home: join(top, '.backlog'), repo: 'local/repository' }).path, join(top, '.backlog', 'teams.json'));
  set({ backlog_repository: '../backlog' });
  assert.equal(teamsFile({ top, home: join(root, 'backlog'), repo: 'acme/app' }).path, join(root, 'backlog', 'acme', 'app', 'teams.json'));
  set({}); // a backlog folder found without the key does not count as defined
  assert.equal(teamsFile({ top, home: join(root, 'backlog'), repo: 'acme/app' }).path, join(top, '.backlog', 'teams.json'));
  set({ backlog_repository: '../backlog', teams_file: '../private/web-teams.json' });
  assert.equal(teamsFile({ top, home: join(root, 'backlog'), repo: 'acme/app' }).path, join(root, 'private', 'web-teams.json'));
  writeFileSync(join(top, '.backlog', 'config.json'), '{"teams_file": "x",}'); // an unreadable configuration is not read as empty
  assert.throws(() => teamsFile({ top, home: join(top, '.backlog'), repo: 'a/b' }), /\.backlog\/config\.json cannot be read/);
});

// ---- an unreadable configuration stops every command and is never written over
function world(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'backlog-config-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = consumer(tmp, 'acme', 'demo', 'main');
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: join(tmp, 'config'), HOME: join(tmp, 'userhome'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '', SMOOTH_BACKLOG_CLI_HOME: '' };
  mkdirSync(env.HOME, { recursive: true });
  const run = args => cli(args, { cwd: repo, env });
  const file = join(repo, '.backlog', 'config.json');
  return { repo, run, file };
}
const STOP = /^❌ backlog: \.backlog\/config\.json cannot be read \(.+\); fix it: no command runs and nothing is written while it cannot be read\n$/;
const BROKEN = [['a trailing comma', '{"backlog_repository": ".backlog",}'], ['a half-written edit', '{"backlog_repository": ".back'], ['an empty file', ''],
  ['a JSON array', '[1, 2]'], ['a JSON string', '"text"'], ['null', 'null']];
for (const [what, bytes] of BROKEN) {
  test(`${what} as .backlog/config.json stops list, a team command and setup with exit 2; the bytes stay`, t => {
    const w = world(t);
    mkdirSync(join(w.repo, '.backlog'), { recursive: true });
    writeFileSync(w.file, bytes);
    for (const args of [['list'], ['next'], ['new', '--name', 'x', '--objective', 'o', '--summary', 's'], ['team', 'query', '--team', 't', '--agent', 'a', '--json'], ['setup'], ['setup', '--ask']]) {
      const r = w.run(args);
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, STOP, args.join(' '));
      assert.equal(r.stdout, '', args.join(' '));
      assert.equal(readFileSync(w.file, 'utf8'), bytes, `${args.join(' ')} left the file as it was`);
    }
    for (const args of [['--help'], ['--version'], ['list', '--help'], ['setup', '--help'], ['team', 'pop', '--help']]) {
      const r = w.run(args);
      assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    }
    assert.equal(readFileSync(w.file, 'utf8'), bytes);
  });
}
test('a broken .backlog/config.json is not replaced by a readable root file of earlier builds', t => {
  const w = world(t);
  mkdirSync(join(w.repo, '.backlog'), { recursive: true });
  writeFileSync(w.file, '{,}');
  writeFileSync(join(w.repo, '.smooth-backlog.json'), JSON.stringify({ backlog_repository: '.backlog' }));
  assert.equal(w.run(['list']).status, 2);
});
test('a missing configuration is an empty one: list works and the file is created as before', t => {
  const w = world(t);
  const r = w.run(['list']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(w.file, 'utf8')), { backlog_repository: '.backlog' });
});
test('setup keeps the team-file keys and an unknown key with their values', t => {
  const w = world(t);
  mkdirSync(join(w.repo, '.backlog'), { recursive: true });
  const keep = { teams_file: 'private/teams.json', teams_file_sha: 'ab12'.repeat(16), migrated_at: '2026-11-12T09:00:00Z', migrated_by_version: '0.0.0-development', unknown_key: { nested: [1, 'two', null] } };
  writeFileSync(w.file, JSON.stringify({ backlog_repository: '.backlog', ...keep }));
  const r = w.run(['setup']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const after = JSON.parse(readFileSync(w.file, 'utf8'));
  for (const [k, v] of Object.entries(keep)) assert.deepEqual(after[k], v, k);
  assert.ok(typeof after.user === 'string' && after.user, 'setup still records the user');
});
