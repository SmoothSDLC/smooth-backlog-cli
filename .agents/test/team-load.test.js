// The load of the team file: where it is, the SHA in the configuration, the per-user record and copy, the 24 hours, the refusals that write nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, statSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTeams, missingText, recordPaths } from '../../src/team/teams-load.js';
import { FIRST_USE_CONFIG } from '../../src/shared/store.js';
import { teamsFile } from '../../src/team/teams-file.js';

const solo = Object.values(JSON.parse(readFileSync(new URL('../../templates/teams/single-agent.json', import.meta.url), 'utf8')))[0];
const T0 = '2026-11-09T12:00:00Z', T1 = '2026-11-10T11:00:00Z', T2 = '2026-11-10T12:30:00Z';
const twoTeams = (brokenB = false) => ({ solo, other: brokenB ? { ...solo, bogus: 1 } : solo });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const CFG = ['.backlog', 'config.json'];
// an actionable repository whose backlog is inside it
function world(t, { config = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'teams-load-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); const home = join(top, '.backlog'); const stateDir = join(root, 'state');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(top, ...CFG), JSON.stringify({ backlog_repository: '.backlog', ...config }));
  const file = () => teamsFile({ top, home, repo: 'local/repository' }).path;
  const put = obj => writeFileSync(file(), typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj));
  const cfg = () => JSON.parse(readFileSync(join(top, ...CFG), 'utf8'));
  const paths = () => recordPaths(stateDir, file());
  const rec = () => JSON.parse(readFileSync(paths().record, 'utf8'));
  return { root, top, home, stateDir, file, put, cfg, paths, rec, load: (team, now, full) => loadTeams({ top, home, repo: 'local/repository', stateDir, team, now, full }) };
}
const refused = (code) => e => e.code === 'TEAMS_FILE' && e.exitCode === code;

test('a missing file stops the command with the resolved path and the three ways, and writes nothing', t => {
  const w = world(t);
  assert.throws(() => w.load('solo', T0), e => refused(2)(e) && e.message === missingText(join('.backlog', 'teams.json')));
  assert.equal(w.cfg().teams_file_sha, undefined);
});

test('a team file that is a symbolic link is refused', t => {
  const w = world(t);
  writeFileSync(join(w.root, 'elsewhere.json'), JSON.stringify(twoTeams()));
  symlinkSync(join(w.root, 'elsewhere.json'), w.file());
  assert.throws(() => w.load('solo', T0), e => refused(2)(e) && /symbolic link/.test(e.message));
});

test('a team file reached through a symbolic-link folder inside the repository is refused', t => {
  const w = world(t, { config: { teams_file: '.backlog/link/teams.json' } });
  mkdirSync(join(w.root, 'real'));
  writeFileSync(join(w.root, 'real', 'teams.json'), JSON.stringify(twoTeams()));
  symlinkSync(join(w.root, 'real'), join(w.top, '.backlog', 'link'));
  assert.throws(() => w.load('solo', T0), e => refused(2)(e) && e.message === '.backlog/link is a symbolic link; no folder on the way to the team file may be one');
});

test('the first load writes the SHA into .backlog/config.json and the record; within 24 hours the copy is used', t => {
  const w = world(t);
  w.put(twoTeams());
  assert.equal(w.load('solo', T0).from, 'disk');
  assert.match(w.cfg().teams_file_sha, /^[0-9a-f]{64}$/);
  assert.equal(w.cfg().backlog_repository, '.backlog');
  w.put('{ not json'); // an edit within the 24 hours is not read
  assert.equal(w.load('solo', T1).from, 'record');
});

test('a SHA in the configuration that differs from the record makes the file read and validated again', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const edited = twoTeams(); edited.solo = { ...edited.solo, people: { 'agent-1': ['worker'], 'agent-2': ['worker'] } };
  w.put(edited);
  writeFileSync(join(w.top, ...CFG), JSON.stringify({ ...w.cfg(), teams_file_sha: 'f'.repeat(64) }));
  const got = w.load('solo', T1);
  assert.equal(got.from, 'disk');
  assert.deepEqual(Object.keys(got.file.solo.people), ['agent-1', 'agent-2']);
  assert.notEqual(w.cfg().teams_file_sha, 'f'.repeat(64));
});

test('after 24 hours an invalid file stops the command; the SHA and the record are not updated', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const before = w.cfg().teams_file_sha; const rec = readFileSync(w.paths().record, 'utf8');
  w.put('{ not json');
  assert.throws(() => w.load('solo', T2), e => refused(2)(e) && /cannot be read/.test(e.message) && /run backlog team validate --team solo/.test(e.message));
  assert.equal(w.cfg().teams_file_sha, before);
  assert.equal(readFileSync(w.paths().record, 'utf8'), rec);
});

test('full always reads and validates, refreshes the record and writes the SHA', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const edited = twoTeams(); edited.solo = { ...edited.solo, people: { 'agent-1': ['worker'], 'agent-3': ['worker'] } };
  w.put(edited);
  const before = w.cfg().teams_file_sha;
  const got = w.load(null, T1, true);
  assert.equal(got.from, 'disk'); assert.deepEqual(got.findings.filter(f => f.severity === 'error'), []);
  assert.notEqual(w.cfg().teams_file_sha, before);
  assert.deepEqual(Object.keys(w.load('solo', T1).file.solo.people), ['agent-1', 'agent-3']);
});

test('the whole file must be valid: one broken entry stops every team of the file', t => {
  const w = world(t);
  w.put(twoTeams(true));
  const text = `${join('.backlog', 'teams.json')} fails validation for other; no team command runs until the whole file is valid; run backlog team validate --show-all`;
  for (const team of ['solo', 'other', null]) assert.throws(() => w.load(team, T0), e => refused(2)(e) && e.message === text);
  w.put(twoTeams());
  assert.equal(w.load('solo', T0).from, 'disk');
  assert.throws(() => w.load('nobody', T0), e => refused(1)(e) && /has no entry in \.backlog.teams\.json \(teams: solo, other\)/.test(e.message));
});

test('a read-only checkout and an unwritable state folder: the command proceeds, validating in full each time, silently', t => {
  const w = world(t);
  w.put(twoTeams());
  chmodSync(join(w.top, '.backlog'), 0o555);
  writeFileSync(w.stateDir, 'x'); // a file where the state folder should be
  try {
    assert.equal(w.load('solo', T0).from, 'disk');
    assert.equal(w.load('solo', T1).from, 'disk');
  } finally { chmodSync(join(w.top, '.backlog'), 0o755); }
  assert.equal(w.cfg().teams_file_sha, undefined);
});

test('a refused team command writes nothing: no SHA, no record, no copy', t => {
  const w = world(t);
  w.put(twoTeams(true));
  assert.throws(() => w.load('other', T0), refused(2));
  assert.throws(() => w.load('solo', T0), refused(2));
  assert.ok(w.load(null, T0, true).findings.some(f => f.severity === 'error')); // validate reports and records nothing for an invalid file
  assert.equal(w.cfg().teams_file_sha, undefined);
  assert.equal(existsSync(w.paths().record), false);
  assert.equal(existsSync(w.paths().copy), false);
});

test('an unparsable .backlog/config.json stops every command and is never overwritten', t => {
  const w = world(t);
  w.put(twoTeams());
  const broken = '{"backlog_repository": ".backlog", "team": "solo",}';
  writeFileSync(join(w.top, ...CFG), broken);
  assert.throws(() => w.load('solo', T0), e => e.exitCode === 2 && e.message.startsWith('.backlog/config.json cannot be read'));
  assert.throws(() => w.load(null, T0, true), e => e.exitCode === 2);
  assert.equal(readFileSync(join(w.top, ...CFG), 'utf8'), broken);
});

test('a record dated in the future is stale: the file is read again', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', '2030-01-01T00:00:00Z');
  w.put('{ not json');
  assert.throws(() => w.load('solo', T0), e => refused(2)(e) && /cannot be read/.test(e.message));
});

test('another repository: the SHA goes to the record only, never into the working copy', t => {
  const w = world(t);
  const lib = join(w.home, 'acme', 'lib'); mkdirSync(lib, { recursive: true });
  writeFileSync(join(lib, 'teams.json'), JSON.stringify(twoTeams()));
  const load = now => loadTeams({ top: w.top, home: w.home, repo: 'acme/lib', workRepo: 'local/repository', stateDir: w.stateDir, team: 'solo', now });
  assert.equal(load(T0).from, 'disk');
  assert.equal(w.cfg().teams_file_sha, undefined);
  assert.equal(load(T1).from, 'record');
});

test('another repository: the file is hashed at every load, so an edit is read at once, and a broken edit stops the command', t => {
  const w = world(t);
  const lib = join(w.home, 'acme', 'lib'); mkdirSync(lib, { recursive: true });
  const load = now => loadTeams({ top: w.top, home: w.home, repo: 'acme/lib', workRepo: 'local/repository', stateDir: w.stateDir, team: 'solo', now });
  writeFileSync(join(lib, 'teams.json'), JSON.stringify(twoTeams())); load(T0);
  const edited = twoTeams(); edited.solo = { ...edited.solo, people: { z: ['worker'] } };
  writeFileSync(join(lib, 'teams.json'), JSON.stringify(edited));
  const got = load(T1);
  assert.equal(got.from, 'disk'); assert.deepEqual(Object.keys(got.file.solo.people), ['z']);
  writeFileSync(join(lib, 'teams.json'), JSON.stringify(twoTeams(true)));
  assert.throws(() => load(T1), refused(2));
});

test('without a configuration the team file is .backlog/teams.json and the SHA goes into a new .backlog/config.json', t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-noconf-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); const home = join(root, 'backlog'); const stateDir = join(root, 'state');
  mkdirSync(join(top, '.backlog'), { recursive: true }); mkdirSync(join(home, 'acme', 'app'), { recursive: true });
  writeFileSync(join(home, 'acme', 'app', 'teams.json'), '{ not read');
  writeFileSync(join(top, '.backlog', 'teams.json'), JSON.stringify(twoTeams()));
  const load = now => loadTeams({ top, home, repo: 'acme/app', stateDir, team: 'solo', now });
  assert.equal(load(T0).from, 'disk');
  assert.match(JSON.parse(readFileSync(join(top, ...CFG), 'utf8')).teams_file_sha, /^[0-9a-f]{64}$/);
  assert.equal(load(T1).from, 'record');
});

test('when only the older root configuration exists, its keys are copied into the new .backlog/config.json with the SHA', t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-legacy-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); mkdirSync(join(top, '.backlog'), { recursive: true });
  writeFileSync(join(top, '.smooth-backlog.json'), JSON.stringify({ backlog_repository: '.backlog', backlog_origin_url: 'https://example.com/x.git' }));
  writeFileSync(join(top, '.backlog', 'teams.json'), JSON.stringify(twoTeams()));
  loadTeams({ top, home: join(top, '.backlog'), repo: 'local/repository', stateDir: join(root, 'state'), team: 'solo', now: T0 });
  const cfg = JSON.parse(readFileSync(join(top, ...CFG), 'utf8'));
  assert.equal(cfg.backlog_origin_url, 'https://example.com/x.git'); assert.equal(cfg.backlog_repository, '.backlog');
  assert.match(cfg.teams_file_sha, /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(readFileSync(join(top, '.smooth-backlog.json'), 'utf8')).teams_file_sha, undefined);
});

test('warnings do not stop a command and do not stop the SHA and the record from being written', t => {
  const w = world(t);
  const noDescription = { ...solo, item: { ...solo.item, extra: { type: 'text' } } };
  w.put({ solo: noDescription });
  const got = w.load(null, T0, true);
  assert.ok(got.findings.some(f => f.severity === 'warning'));
  assert.equal(w.load('solo', T0).from, 'record'); // the validation with the warnings wrote the record
  assert.match(w.cfg().teams_file_sha, /^[0-9a-f]{64}$/);
  assert.equal(w.rec().valid_teams, 'solo');
});

test('24 hours: exactly 24 hours is stale, one second less is fresh', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  assert.equal(w.load('solo', '2026-11-10T11:59:59Z').from, 'record');
  assert.equal(w.load('solo', '2026-11-10T12:00:00Z').from, 'disk');
});

test('a damaged record counts as absent: the file is read again', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const good = w.rec();
  for (const bad of ['null', '[]', '"x"', 'not json', JSON.stringify({ ...good, valid_teams: ['solo'] }), JSON.stringify({ ...good, sha: 5 }), JSON.stringify({ ...good, validated_at: 7 })]) {
    writeFileSync(w.paths().record, bad);
    assert.equal(w.load('solo', T1).from, 'disk', bad); // and the load wrote a good record again
    assert.equal(w.load('solo', T1).from, 'record', bad);
  }
});

test('a byte-order mark is accepted and counts in the SHA, which equals the SHA-256 of the file bytes', t => {
  const w = world(t);
  const bytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(JSON.stringify(twoTeams()))]);
  w.put(bytes);
  assert.equal(w.load('solo', T0).from, 'disk');
  assert.equal(w.cfg().teams_file_sha, sha(bytes));
  assert.equal(w.rec().sha, sha(bytes));
  assert.deepEqual(readFileSync(w.paths().copy), bytes);
});

test('a folder where the file should be gives the unreadable text with the reason, not the missing-file text', t => {
  const w = world(t);
  mkdirSync(w.file());
  assert.throws(() => w.load('solo', T0), e => refused(2)(e) && e.message.includes('cannot be read (EISDIR: it is a folder, not a file)') && !e.message.includes('no team file'));
});

test('a corrupted copy, or a team missing from the record, forces a read', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  writeFileSync(w.paths().copy, JSON.stringify({ solo }));
  w.put('{ not json');
  assert.throws(() => w.load('solo', T1), refused(2));
  w.put(twoTeams()); w.load('solo', T1, true);
  writeFileSync(w.paths().record, JSON.stringify({ ...w.rec(), valid_teams: 'solo' }));
  w.put('{ not json');
  assert.throws(() => w.load('other', T1), refused(2));
  assert.equal(w.load('solo', T1).from, 'record');
});

test('messages name the file relative to the repository, or as configured outside it, never an absolute path', t => {
  const w = world(t, { config: { teams_file: '../private/teams.json' } });
  assert.throws(() => w.load('solo', T0), e => e.message === missingText('../private/teams.json') && !e.message.includes(w.root));
  mkdirSync(join(w.root, 'private')); writeFileSync(join(w.root, 'private', 'teams.json'), '{ bad');
  assert.throws(() => w.load('solo', T0), e => e.message.startsWith('../private/teams.json cannot be read') && !e.message.includes(w.root));
  const lib = loadTeams;
  assert.throws(() => lib({ top: w.top, home: w.home, repo: 'acme/lib', workRepo: 'local/repository', stateDir: w.stateDir, team: 'solo', now: T0 }), e => e.message === missingText(join('.backlog', 'acme', 'lib', 'teams.json')));
});

test('the state folder is private (0700) and the record and the copy are 0600', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  assert.equal(statSync(w.paths().dir).mode & 0o777, 0o700);
  assert.equal(statSync(w.paths().record).mode & 0o777, 0o600);
  assert.equal(statSync(w.paths().copy).mode & 0o777, 0o600);
});

test('a load that is not full reads a file with only warnings from disk and lets the command proceed', t => {
  const w = world(t);
  w.put({ solo: { ...solo, item: { ...solo.item, extra: { type: 'text' } } } });
  assert.equal(w.load('solo', T0).from, 'disk');
});

test('with no configuration at all the new .backlog/config.json is what the store writes on first use plus the SHA', t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-first-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); mkdirSync(join(top, '.backlog'), { recursive: true });
  writeFileSync(join(top, '.backlog', 'teams.json'), JSON.stringify(twoTeams()));
  loadTeams({ top, home: join(top, '.backlog'), repo: 'local/repository', stateDir: join(root, 'state'), team: 'solo', now: T0 });
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(top, ...CFG), 'utf8'))), [...Object.keys(JSON.parse(FIRST_USE_CONFIG)), 'teams_file_sha']);
});
