// R21 and R22 scenarios on real files in a temporary folder: node --test teams-load.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTeams, missingText, recordPaths, teamsFile } from './teams-load.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/single-agent.json', import.meta.url), 'utf8'));
const T0 = '2026-11-09T12:00:00Z', T1 = '2026-11-10T11:00:00Z', T2 = '2026-11-10T12:30:00Z';
const twoTeams = (brokenB = false) => ({ solo: example.solo, other: brokenB ? { ...example.solo, rules: { ...example.solo.rules, table: [{ id: 'x', step: 'go', wehn: {}, do: {} }] } } : example.solo });
// an actionable repository whose backlog is inside it (.backlog), the default of R22
function world(t, { config = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'teams-load-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); const home = join(top, '.backlog'); const stateDir = join(root, 'state');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(top, '.backlog', 'config.json'), JSON.stringify({ backlog_repository: '.backlog', ...config }));
  const file = () => teamsFile({ top, home, repo: 'local/repository' }).path;
  const put = obj => writeFileSync(file(), typeof obj === 'string' ? obj : JSON.stringify(obj));
  const cfg = () => JSON.parse(readFileSync(join(top, '.backlog', 'config.json'), 'utf8'));
  return { root, top, home, stateDir, file, put, cfg, load: (team, now, full) => loadTeams({ top, home, repo: 'local/repository', stateDir, team, now, full }) };
}

test('the location: the teams_file key wins, else the repository folder of a configured backlog repository, else .backlog/teams.json', t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-where-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); mkdirSync(join(top, '.backlog'), { recursive: true });
  const set = c => writeFileSync(join(top, '.backlog', 'config.json'), JSON.stringify(c));
  set({ backlog_repository: '.backlog' });
  assert.equal(teamsFile({ top, home: join(top, '.backlog'), repo: 'local/repository' }).path, join(top, '.backlog', 'teams.json'));
  set({ backlog_repository: '../backlog' });
  assert.equal(teamsFile({ top, home: join(root, 'backlog'), repo: 'acme/app' }).path, join(root, 'backlog', 'acme', 'app', 'teams.json'));
  set({}); // a backlog folder found without the key (the session variable, the per-user record) does not count as defined (R22)
  assert.equal(teamsFile({ top, home: join(root, 'backlog'), repo: 'acme/app' }).path, join(top, '.backlog', 'teams.json'));
  set({ backlog_repository: '../backlog', teams_file: '../private/web-teams.json' });
  assert.equal(teamsFile({ top, home: join(root, 'backlog'), repo: 'acme/app' }).path, join(root, 'private', 'web-teams.json'));
});

test('a missing file stops the command with the resolved path and the three ways, and writes nothing', t => {
  const w = world(t);
  assert.throws(() => w.load('solo', T0), e => e.exit === 2 && e.message === missingText(w.file()));
  const sha = w.cfg().teams_file_sha;
  chmodSync(join(w.top, '.backlog'), 0o755);
  assert.equal(sha, undefined);
});

test('a team file that is a symbolic link is refused', t => {
  const w = world(t);
  writeFileSync(join(w.root, 'elsewhere.json'), JSON.stringify(twoTeams()));
  symlinkSync(join(w.root, 'elsewhere.json'), w.file());
  assert.throws(() => w.load('solo', T0), e => e.exit === 2 && /symbolic link/.test(e.message));
});

test('the first load validates, writes the SHA into .backlog/config.json and the record; within 24 hours the copy is used', t => {
  const w = world(t);
  w.put(twoTeams());
  assert.equal(w.load('solo', T0).from, 'disk');
  assert.match(w.cfg().teams_file_sha, /^[0-9a-f]{64}$/);
  assert.equal(w.cfg().backlog_repository, '.backlog'); // the other keys stay
  w.put('{ not json'); // an edit within the 24 hours is not read
  assert.equal(w.load('solo', T1).from, 'record');
});

test('a SHA in the configuration that differs from the record (another branch, a pull) makes the file read and validated again', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const edited = twoTeams(); edited.solo = { ...edited.solo, people: { 'agent-1': ['worker'], 'agent-2': ['worker'] } };
  w.put(edited);
  const c = w.cfg(); c.teams_file_sha = 'f'.repeat(64); writeFileSync(join(w.top, '.backlog', 'config.json'), JSON.stringify(c)); // as checked out from another branch
  const got = w.load('solo', T1);
  assert.equal(got.from, 'disk');
  assert.deepEqual(Object.keys(got.file.solo.people), ['agent-1', 'agent-2']);
  assert.notEqual(w.cfg().teams_file_sha, 'f'.repeat(64));
});

test('after 24 hours an invalid file stops the command; the SHA and the record are not updated', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const before = w.cfg().teams_file_sha; const rec = readFileSync(recordPaths(w.stateDir, w.file()).record, 'utf8');
  w.put('{ not json');
  assert.throws(() => w.load('solo', T2), e => e.exit === 2 && /cannot be read/.test(e.message));
  assert.equal(w.cfg().teams_file_sha, before);
  assert.equal(readFileSync(recordPaths(w.stateDir, w.file()).record, 'utf8'), rec);
});

test('backlog team validate always validates in full, refreshes the record and writes the SHA, so the lead commits it with the edit', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const edited = twoTeams(); edited.solo = { ...edited.solo, people: { 'agent-1': ['worker'], 'agent-3': ['worker'] } };
  w.put(edited);
  const before = w.cfg().teams_file_sha;
  assert.equal(w.load(null, T1, true).from, 'disk');
  assert.notEqual(w.cfg().teams_file_sha, before);
  assert.deepEqual(Object.keys(w.load('solo', T1).file.solo.people), ['agent-1', 'agent-3']);
});

test('the whole file must be valid: one broken entry stops every team of the file (R18, owner decision 2026-11-09 on question 4)', t => {
  const w = world(t);
  w.put(twoTeams(true));
  const text = `${w.file()} fails validation for other; no team command runs until the whole file is valid; run backlog team validate --show-all`;
  assert.throws(() => w.load('solo', T0), e => e.exit === 2 && e.message === text);
  assert.throws(() => w.load('other', T0), e => e.exit === 2 && e.message === text);
  assert.throws(() => w.load(null, T0), e => e.exit === 2 && e.message === text);
  w.put(twoTeams());
  assert.equal(w.load('solo', T0).from, 'disk');
  assert.throws(() => w.load('nobody', T0), e => e.exit === 1 && /has no entry/.test(e.message));
});

test('a read-only checkout and an unwritable state folder: the command proceeds, validating in full each time, silently', t => {
  const w = world(t);
  w.put(twoTeams());
  chmodSync(join(w.top, '.backlog'), 0o555);
  writeFileSync(`${w.stateDir}`, 'x'); // a file where the state folder should be
  try {
    assert.equal(w.load('solo', T0).from, 'disk');
    assert.equal(w.load('solo', T1).from, 'disk');
  } finally { chmodSync(join(w.top, '.backlog'), 0o755); }
  const sha = w.cfg().teams_file_sha;
  chmodSync(join(w.top, '.backlog'), 0o755);
  assert.equal(sha, undefined);
});

// round 5: the adversarial tests of review C that hold (ADV-01 to ADV-04), and the owner's answers to questions 1 and 6
test('a refused team command writes nothing: no SHA, no record, no copy, also for a team whose own entry is valid (review C H1)', t => {
  const w = world(t);
  w.put(twoTeams(true));
  assert.throws(() => w.load('other', T0), e => e.exit === 2);
  assert.throws(() => w.load('solo', T0), e => e.exit === 2);
  assert.equal(w.load(null, T0, true).findings.length > 0, true); // backlog team validate reports, and records nothing for an invalid file
  assert.equal(w.cfg().teams_file_sha, undefined);
  assert.equal(existsSync(recordPaths(w.stateDir, w.file()).record), false);
  assert.equal(existsSync(recordPaths(w.stateDir, w.file()).copy), false);
  assert.throws(() => w.load(null, T0), e => e.exit === 2);
  assert.equal(w.cfg().teams_file_sha, undefined);
});

test('an unparsable .backlog/config.json stops every command and is never overwritten (review C M10)', t => {
  const w = world(t);
  w.put(twoTeams());
  const broken = '{"backlog_repository": ".backlog", "team": "solo",}';
  writeFileSync(join(w.top, '.backlog', 'config.json'), broken);
  assert.throws(() => w.load('solo', T0), e => e.exit === 2 && e.message.startsWith('.backlog/config.json cannot be read'));
  assert.throws(() => w.load(null, T0, true), e => e.exit === 2);
  assert.equal(readFileSync(join(w.top, '.backlog', 'config.json'), 'utf8'), broken);
});

test('a teams_file reached through a symbolic-link folder inside the repository is refused (review C L2)', t => {
  const w = world(t, { config: { teams_file: '.backlog/link/teams.json' } });
  mkdirSync(join(w.root, 'real'));
  writeFileSync(join(w.root, 'real', 'teams.json'), JSON.stringify(twoTeams()));
  symlinkSync(join(w.root, 'real'), join(w.top, '.backlog', 'link'));
  assert.throws(() => w.load('solo', T0), e => e.exit === 2 && /link is a symbolic link; no folder between/.test(e.message));
});

test('a record dated in the future (clock skew) is stale: the file is read again (review C L1)', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', '2030-01-01T00:00:00Z');
  w.put('{ not json');
  assert.throws(() => w.load('solo', T0), e => e.exit === 2 && /cannot be read/.test(e.message));
});

test('question 1 (owner: A): a repository input names the actionable repository; the SHA goes to the per-user record, never into the working copy', t => {
  const w = world(t);
  const lib = join(w.home, 'acme', 'lib'); mkdirSync(lib, { recursive: true });
  writeFileSync(join(lib, 'teams.json'), JSON.stringify(twoTeams()));
  const load = now => loadTeams({ top: w.top, home: w.home, repo: 'acme/lib', workRepo: 'local/repository', stateDir: w.stateDir, team: 'solo', now });
  assert.equal(load(T0).from, 'disk');
  assert.equal(w.cfg().teams_file_sha, undefined);
  assert.equal(load(T1).from, 'record');
});

test('question 6 (owner: the literal R22): without a configuration the team file is .backlog/teams.json and the SHA goes into a new .backlog/config.json', t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-noconf-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); const home = join(root, 'backlog'); const stateDir = join(root, 'state');
  mkdirSync(join(top, '.backlog'), { recursive: true }); mkdirSync(join(home, 'acme', 'app'), { recursive: true });
  writeFileSync(join(home, 'acme', 'app', 'teams.json'), '{ not read');
  writeFileSync(join(top, '.backlog', 'teams.json'), JSON.stringify(twoTeams()));
  const load = now => loadTeams({ top, home, repo: 'acme/app', stateDir, team: 'solo', now });
  assert.equal(load(T0).from, 'disk');
  assert.match(JSON.parse(readFileSync(join(top, '.backlog', 'config.json'), 'utf8')).teams_file_sha, /^[0-9a-f]{64}$/);
  assert.equal(load(T1).from, 'record');
});
