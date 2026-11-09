// R21 scenarios of the validation on load, on real files in a temporary folder: node --test teams-load.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTeams, recordPaths } from './teams-load.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/single-agent.json', import.meta.url), 'utf8'));
const T0 = '2026-11-09T12:00:00Z', T1 = '2026-11-10T11:00:00Z', T2 = '2026-11-10T12:30:00Z';
function world(t) {
  const root = mkdtempSync(join(tmpdir(), 'teams-load-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'backlog'); const configDir = join(root, 'config');
  mkdirSync(home, { recursive: true });
  const put = obj => writeFileSync(join(home, 'teams.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));
  return { home, configDir, put, load: (team, now, full) => loadTeams({ home, configDir, team, now, full }) };
}
const twoTeams = (brokenB = false) => ({ solo: example.solo, other: brokenB ? { ...example.solo, rules: { ...example.solo.rules, table: [{ id: 'x', step: 'go', wehn: {}, do: {} }] } } : example.solo });

test('the first command validates and records; within 24 hours a later command uses the validated copy and does not read the file', t => {
  const w = world(t);
  w.put(twoTeams());
  assert.equal(w.load('solo', T0).from, 'disk');
  w.put('{ not json'); // an edit within the 24 hours is not read
  const again = w.load('solo', T1);
  assert.equal(again.from, 'record');
  assert.ok(again.file.solo);
});

test('after 24 hours the file is read and validated again; an invalid file stops the command and the record is not updated', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const before = readFileSync(recordPaths(w.configDir, w.home).record, 'utf8');
  w.put('{ not json');
  assert.throws(() => w.load('solo', T2), e => e.exit === 2 && /teams.json cannot be read/.test(e.message));
  assert.equal(readFileSync(recordPaths(w.configDir, w.home).record, 'utf8'), before);
});

test('backlog team validate always validates in full and refreshes the record, so a later command sees the edit', t => {
  const w = world(t);
  w.put(twoTeams()); w.load('solo', T0);
  const edited = twoTeams(); edited.solo = { ...edited.solo, people: { 'agent-1': ['worker'], 'agent-2': ['worker'] } };
  w.put(edited);
  assert.equal(w.load(null, T1, true).from, 'disk');
  assert.deepEqual(Object.keys(w.load('solo', T1).file.solo.people), ['agent-1', 'agent-2']);
});

test('the record lists the valid teams: a command of a valid team proceeds, a command of an invalid team takes no action', t => {
  const w = world(t);
  w.put(twoTeams(true));
  assert.equal(w.load('solo', T0).from, 'disk');
  assert.throws(() => w.load('other', T0), e => e.exit === 2 && e.message === 'team other fails validation in teams.json; run backlog team validate --team other');
  assert.throws(() => w.load(null, T0), e => /fails validation for other/.test(e.message));
  assert.match(readFileSync(recordPaths(w.configDir, w.home).record, 'utf8'), /"valid_teams":"solo"/);
});

test('a missing teams.json stops the command and writes no record', t => {
  const w = world(t);
  assert.throws(() => w.load('solo', T0), e => e.exit === 2 && /missing or unreadable/.test(e.message));
  assert.throws(() => readFileSync(recordPaths(w.configDir, w.home).record));
});

test('a configuration folder that cannot be written: every command validates in full, silently', t => {
  const w = world(t);
  writeFileSync(`${w.configDir}-file`, 'x'); // a file where the folder should be
  const blocked = { ...w, load: (team, now) => loadTeams({ home: w.home, configDir: `${w.configDir}-file`, team, now }) };
  w.put(twoTeams());
  assert.equal(blocked.load('solo', T0).from, 'disk');
  assert.equal(blocked.load('solo', T1).from, 'disk');
});
