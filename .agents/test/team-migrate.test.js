// `backlog team migrate` through the real command: what it converts and publishes, every stop (exit 2, nothing written), the dry run, the record keys and the undo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { missingText } from '../../src/team/teams-file.js';
import { cli } from './shared-fixtures.js';
import { TEMPLATES, git, world as teamWorld } from './team-fixture.js';

const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const TEAM = 'parallel';
const pad = n => String(n).padStart(3, '0');
const md = (n, extra = '', name = `${pad(n)}-x`) => `---\nphase: ${name}\nseq: ${n}\nname: N${n}\nstatus: pending\n${extra}---\nbody ${n}\n`;
const snapshot = dir => JSON.stringify(readdirSync(dir, { recursive: true }).sort().map(f => { try { return [f, readFileSync(join(dir, f), 'utf8')]; } catch { return [f]; } }));

// The backlog clone beside a checkout of acme/app; the team file is the checkout's .backlog/teams.json (teams: null for none).
function world(t, teams = TEMPLATES.parallel) {
  const w = teamWorld(t, teams ?? {}, { prefix: 'team-migrate-' });
  if (teams === null) rmSync(w.teamFile);
  const put = (rel, text, dir = w.folder) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  const migrate = (args = ['--show-all'], extra = {}) => w.run(args, extra, 'migrate');
  const status = () => `${git(w.home, 'status', '--porcelain', '-uall')}\n--\n${git(w.cons, 'status', '--porcelain', '-uall')}`;
  const cfgFile = join(w.cons, '.backlog', 'config.json');
  const cfg = () => (existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {});
  // three items: two open, one archived
  const three = () => { put('phases/001-x.md', md(1)); put('phases/002-x.md', md(2)); put('archive/2026/003-x.md', md(3)); w.publish('seed'); };
  // what a stopped run must leave: both repositories and the folder byte for byte as they were
  const state = () => [status(), git(w.home, 'rev-parse', 'HEAD'), existsSync(join(w.home, 'acme')) ? snapshot(join(w.home, 'acme')) : null, existsSync(cfgFile) ? readFileSync(cfgFile, 'utf8') : null];
  const untouched = () => { const before = state(); return () => assert.deepEqual(state(), before, 'nothing was written'); };
  return { ...w, put, migrate, status, cfg, cfgFile, three, untouched };
}
const names = dir => readdirSync(dir, { recursive: true }).filter(f => /\.(md|json)$/.test(f)).sort();

test('a folder with no team item migrates without a team file', t => {
  const w = world(t, null);
  w.put('phases/001-x.md', md(1)); w.put('archive/2026/002-x.md', md(2)); w.publish('seed');
  const r = w.migrate();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('ℹ️  no team file at .backlog/teams.json; no item of acme/app has a team\n'), r.stdout);
  assert.ok(r.stdout.includes('✅ converted 2 items (1 archived) to JSON in acme/app\n'), r.stdout);
  assert.deepEqual(names(w.folder), ['archive/2026/002-x.json', 'index.json', 'numbers.json', 'phases/001-x.json']);
  assert.equal(git(w.home, 'status', '--porcelain'), '', 'published, nothing left over');
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), git(w.home, 'rev-parse', 'origin/main'));
});

test('no team file with a team item stops the migration, naming the path and the three ways', t => {
  const w = world(t, null);
  w.put('phases/001-x.md', md(1, `team: ${TEAM}\n`)); w.publish('seed');
  const same = w.untouched();
  const r = w.migrate();
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.ok(r.stderr.includes(missingText('.backlog/teams.json')), r.stderr);
  assert.equal(r.stdout, '');
  same();
});

test('an unreadable team file stops the migration, also when no item has a team', t => {
  for (const [extra, mode, text = '{not json', reason = '.+'] of [[`team: ${TEAM}\n`], [''], ['', 0o000], ['', undefined, '[]', 'it is not a JSON object']]) {
    const w = world(t, text);
    if (mode !== undefined) { if (process.getuid() === 0) continue; chmodSync(w.teamFile, mode); } // the administrator reads any file
    w.put('phases/001-x.md', md(1, extra)); w.publish('seed');
    const same = w.untouched();
    const r = w.migrate();
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, new RegExp(`^❌ backlog: \\.backlog/teams\\.json cannot be read \\(${reason}\\); fix it, or write \\{\\} to unbind every team item on purpose\\n$`));
    same();
  }
});

test('an entry in an earlier shape stops the migration once per team and nothing is written', t => {
  const w = world(t, { t: { lead: 'a', members: ['b'] }, u: { lead: 'c', members: [] } });
  w.three();
  const same = w.untouched();
  const r = w.migrate();
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stderr, ['t', 'u'].map(n => `❌ backlog: team ${n} fails validation in .backlog/teams.json; rewrite it and run backlog team validate --team ${n} first\n`).join(''));
  same();
});

test('migrate without a team or --show-all stops with the three ways to name a team; a team with no entry is exit 1', t => {
  const w = world(t);
  w.three();
  const same = w.untouched();
  const r = w.migrate([]);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, '❌ backlog: a team command needs a team: give --team <name>, or set the SMOOTH_BACKLOG_CLI_TEAM_NAME variable, or set the "team" key in .backlog/config.json\n');
  const nope = w.migrate(['--team', 'nope']);
  assert.equal(nope.status, 1, nope.stdout + nope.stderr);
  assert.match(nope.stderr, /^❌ backlog: team nope has no entry in \.backlog\/teams\.json \(teams: parallel\)\n$/);
  same();
});

test('migrated_at records the run; a second run says nothing to convert, keeps migrated_at and refreshes the version and the SHA', t => {
  const w = world(t);
  w.three();
  const first = w.migrate(['--team', TEAM]);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const a = w.cfg();
  assert.match(a.migrated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/);
  assert.equal(a.migrated_by_version, VERSION);
  assert.match(a.teams_file_sha, /^[0-9a-f]{64}$/);
  // an earlier time and version in the configuration: the second run keeps the time and writes its own version
  writeFileSync(w.cfgFile, JSON.stringify({ ...a, migrated_at: '2020-01-01T00:00:00Z', migrated_by_version: '0.0.1', teams_file_sha: 'old' }));
  const before = git(w.home, 'rev-parse', 'HEAD');
  const second = w.migrate(['--team', TEAM]);
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(second.stdout, 'ℹ️  nothing to convert in acme/app\n');
  assert.deepEqual(w.cfg(), { ...a, migrated_at: '2020-01-01T00:00:00Z' });
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), before, 'no commit');
  // a run that converts nothing leaves the index alone and says so; a run that has nothing to record does not rewrite the configuration
  const written = statSync(w.cfgFile).mtimeMs;
  for (const flags of [['--json'], ['--dry-run', '--json']]) {
    const j = JSON.parse(w.migrate(['--team', TEAM, ...flags]).stdout);
    assert.deepEqual([j.converted, j.index_leave, j.index_appended], [0, 0, 0], flags.join(' '));
  }
  assert.equal(statSync(w.cfgFile).mtimeMs, written);
});

test('a folder that never held an item: nothing to convert, and the first run still records migrated_at', t => {
  const w = world(t);
  const r = w.migrate();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'ℹ️  nothing to convert in acme/app\n');
  assert.ok(w.cfg().migrated_at);
  assert.equal(git(w.home, 'status', '--porcelain'), '');
});

test('a repository input naming another repository converts that folder with its own team file and writes no record keys', t => {
  const w = world(t);
  const lib = join(w.home, 'acme', 'lib');
  w.three();
  w.put('phases/001-y.md', md(1, `team: ${TEAM}\n`, '001-y'), lib); w.put('teams.json', JSON.stringify(TEMPLATES.parallel), lib); w.publish('lib');
  const app = snapshot(w.folder); const cfg = existsSync(w.cfgFile);
  const r = w.migrate(['--team', TEAM, '--repository', 'acme/lib']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('✅ converted 1 item (0 archived) to JSON in acme/lib\n'), r.stdout);
  assert.deepEqual(names(lib), ['index.json', 'numbers.json', 'phases/001-y.json', 'teams.json']);
  assert.equal(git(w.home, 'log', '-1', '--format=%s'), 'acme/lib: migrate 1 item to JSON');
  assert.equal(snapshot(w.folder), app, 'the folder of the working copy is untouched byte for byte');
  assert.equal(existsSync(w.cfgFile), cfg, 'no configuration appears in the working copy');
  assert.equal(w.cfg().migrated_at, undefined);
  assert.equal(git(w.cons, 'status', '--porcelain', '-uall'), '?? .backlog/teams.json');
});

test('--dry-run prints the summary and writes nothing in either repository', t => {
  const w = world(t);
  w.three(); w.put('phases/009-x.md', md(9)); w.publish('nine'); rmSync(join(w.folder, 'phases/009-x.md')); w.publish('gone');
  const same = w.untouched();
  const r = w.migrate(['--show-all', '--dry-run']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.startsWith('ℹ️  would convert 3 items (1 archived) to JSON in acme/app; nothing is written\n'), r.stdout);
  assert.match(r.stdout, /^ {3}counter: 9 /m);
  assert.match(r.stdout, /^ {3}index: 0 entries leave, 2 items appended$/m);
  same();
  // an origin that cannot be reached: the dry run still answers from the local copy
  renameSync(w.bare, `${w.bare}.away`);
  assert.equal(w.migrate(['--show-all', '--dry-run']).stdout, r.stdout);
  renameSync(`${w.bare}.away`, w.bare);
  const j = JSON.parse(w.migrate(['--show-all', '--dry-run', '--json']).stdout);
  assert.deepEqual({ ...j, refs: null }, { dry_run: true, converted: 3, archived: 1, counter: 9, refs: null, unresolved: [], index_leave: 0, index_appended: 2, failures: [] });
  assert.ok(j.refs.includes('main'));
  same();
});

test('a refused push undoes the conversion: every markdown file is back and a person\'s uncommitted edits stay', t => {
  const w = world(t);
  w.three();
  writeFileSync(w.cfgFile, '{"note": "mine"}\n');
  const hook = join(w.home, '.git', 'hooks', 'pre-push'); writeFileSync(hook, '#!/bin/sh\nexit 1\n'); chmodSync(hook, 0o755);
  const same = w.untouched();
  const r = w.migrate(['--team', TEAM]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.equal(r.stdout, '');
  same();
});

test('two clones: a markdown item published by the other clone during the run is converted on the re-run, and the items already in JSON keep their index entries', t => {
  const w = world(t);
  w.three();
  const other = join(w.tmp, 'home2'); git(w.tmp, 'clone', '-q', w.bare, other);
  mkdirSync(join(other, 'acme/app/phases'), { recursive: true }); writeFileSync(join(other, 'acme/app/phases/004-x.md'), md(4));
  git(other, 'add', '-A'); git(other, 'commit', '-q', '-m', 'late');
  const mark = join(w.tmp, 'hook-ran'); const hook = join(w.home, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, `#!/bin/sh\n[ -e '${mark}' ] && exit 0\ntouch '${mark}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX\ngit -C '${other}' push -q origin main || exit 1\n`); chmodSync(hook, 0o755);
  const r = w.migrate(['--team', TEAM]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(mark));
  assert.ok(r.stdout.includes('✅ converted 4 items (1 archived) to JSON in acme/app\n'), r.stdout);
  assert.deepEqual(names(w.folder), ['archive/2026/003-x.json', 'index.json', 'numbers.json', 'phases/001-x.json', 'phases/002-x.json', 'phases/004-x.json']);
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), git(w.home, 'rev-parse', 'origin/main'));
  // a markdown item that arrives after the migration: the next run converts it and the JSON items stay in the index, in their order
  writeFileSync(join(w.folder, 'phases/005-x.md'), md(5)); w.publish('after');
  const again = w.migrate(['--team', TEAM]);
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(w.folder, 'index.json'), 'utf8')).branches[''].map(e => e.seq), [1, 2, 4, 5]);
});

test('a re-run that finds the folder already converted by another clone converts nothing and keeps migrated_at', t => {
  const w = world(t, null);
  w.three();
  writeFileSync(w.cfgFile, '{"migrated_at": "2020-01-01T00:00:00Z"}\n');
  // the other clone and its own checkout run the migration while this clone's push is on its way (another author: the two commits differ)
  const home2 = join(w.tmp, 'home2'); git(w.tmp, 'clone', '-q', w.bare, home2);
  const cons2 = join(w.tmp, 'cons2'); git(w.tmp, 'clone', '-q', join(w.tmp, 'origins', 'acme', 'app.git'), cons2);
  const mark = join(w.tmp, 'hook-ran'); const hook = join(w.home, '.git', 'hooks', 'pre-push');
  const bin = join(import.meta.dirname, '..', '..', 'bin', 'backlog.js');
  writeFileSync(hook, `#!/bin/sh\n[ -e '${mark}' ] && exit 0\ntouch '${mark}'\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX\ncd '${cons2}' && GIT_AUTHOR_NAME=other SMOOTH_BACKLOG_CLI_HOME='${home2}' XDG_CONFIG_HOME='${join(w.tmp, 'config2')}' '${process.execPath}' '${bin}' team migrate --show-all >'${mark}.out' 2>&1 || exit 1\n`); chmodSync(hook, 0o755);
  const r = w.migrate();
  assert.equal(r.status, 0, r.stdout + r.stderr + (existsSync(`${mark}.out`) ? readFileSync(`${mark}.out`, 'utf8') : ''));
  assert.ok(r.stdout.endsWith('ℹ️  nothing to convert in acme/app\n'), r.stdout);
  assert.deepEqual(w.cfg(), { migrated_at: '2020-01-01T00:00:00Z', migrated_by_version: VERSION });
  assert.equal(git(w.home, 'status', '--porcelain'), '');
  assert.deepEqual(names(w.folder), ['archive/2026/003-x.json', 'index.json', 'numbers.json', 'phases/001-x.json', 'phases/002-x.json']);
});

test('the commit holds only the JSON files, the removed markdown files, index.json and numbers.json; an untracked markdown file stays unstaged, also after a user publication', t => {
  const w = world(t, null);
  w.three();
  w.put('phases/notes.md', 'a draft with no header\n'); w.put('README.txt', 'mine\n');
  const r = w.migrate();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(w.home, 'log', '-1', '--format=%s'), 'acme/app: migrate 3 items to JSON');
  assert.deepEqual(git(w.home, 'show', '--name-status', '--no-renames', '--format=', 'HEAD').split('\n').sort(), [
    'A\tacme/app/archive/2026/003-x.json', 'A\tacme/app/index.json', 'A\tacme/app/numbers.json', 'A\tacme/app/phases/001-x.json', 'A\tacme/app/phases/002-x.json',
    'D\tacme/app/archive/2026/003-x.md', 'D\tacme/app/phases/001-x.md', 'D\tacme/app/phases/002-x.md']);
  assert.equal(git(w.home, 'status', '--porcelain', '-uall'), '?? acme/app/README.txt\n?? acme/app/phases/notes.md');
  const made = cli(['new', '--name', 'after', '--depends-on', 'none'], { cwd: w.cons, tmp: w.tmp });
  assert.equal(made.status, 0, made.stdout + made.stderr);
  assert.equal(git(w.home, 'status', '--porcelain', '-uall'), '?? acme/app/README.txt\n?? acme/app/phases/notes.md');
});

test('an uncommitted change of an item, of index.json or of numbers.json stops the run; an untracked file that is no item does not', t => {
  const cases = {
    'phases/001-x.md': w => writeFileSync(join(w.folder, 'phases/001-x.md'), md(1, 'summary: edited\n')),
    'phases/007-x.json': w => w.put('phases/007-x.json', '{}\n'),
    'phases/008-x.md': w => w.put('phases/008-x.md', md(8)),
    'index.json': w => w.put('index.json', '{"branches":{}}\n'),
    'numbers.json': w => w.put('numbers.json', '{"last":1}\n'),
    'phases/link.md': w => symlinkSync('nowhere', join(w.folder, 'phases/link.md')), // a file that cannot be read is not passed over as a draft
  };
  for (const [path, change] of Object.entries(cases)) {
    const w = world(t);
    w.three(); w.put('README.txt', 'mine\n'); change(w);
    const same = w.untouched();
    const r = w.migrate();
    assert.equal(r.status, 2, path + r.stdout + r.stderr);
    assert.equal(r.stderr, `❌ backlog: acme/app/${path} has an uncommitted change; commit or stash it, then run backlog team migrate again\n`);
    same();
  }
});

test('--ask and an unknown flag are refused with exit 2 and nothing on standard output', t => {
  const w = world(t);
  for (const flag of ['--ask', '--bogus']) {
    const r = w.migrate(['--team', TEAM, flag]);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, `❌ backlog: unrecognized arguments: ${flag}\n`);
  }
});

test('the counter is above a number the history held before the pull dropped it, and above a deleted item of the history', t => {
  const w = world(t, null);
  w.three(); w.put('phases/007-x.md', md(7)); w.publish('seven'); rmSync(join(w.folder, 'phases/007-x.md')); w.publish('gone');
  const kept = git(w.home, 'rev-parse', 'HEAD');
  assert.equal(JSON.parse(w.migrate(['--show-all', '--dry-run', '--json']).stdout).counter, 7, 'a deleted item of the history counts');
  // item 9 is published, then the origin and this branch are put back to the commit before it: only this clone's record of the origin still holds 9, and the pull drops it
  w.put('phases/009-x.md', md(9)); w.publish('nine');
  git(w.bare, 'update-ref', 'refs/heads/main', kept); git(w.home, 'reset', '-q', '--hard', kept);
  const r = w.migrate();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(w.home, 'log', '--all', '--format=%s').includes('nine'), false, 'no ref holds the commit of item 9 after the pull');
  assert.equal(JSON.parse(readFileSync(join(w.folder, 'numbers.json'), 'utf8')).last, 9);
});

test('a failure with --json prints the failures on standard output, each text redacted as a value', t => {
  const w = world(t, null);
  w.put('phases/001-x.md', '---\nseq: [\n---\n'); w.put('phases/002-u:hunter2@x.md', '---\nseq: [\n---\n'); w.publish('bad');
  const same = w.untouched();
  const r = w.migrate(['--show-all', '--json']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j), ['failures']);
  assert.equal(j.failures.length, 2);
  assert.match(j.failures[0], /^acme\/app\/phases\/001-x\.md: /);
  assert.match(j.failures[1], /^acme\/app\/phases\/x\.md: /, 'a credential in a file name is not printed');
  assert.ok(!r.stdout.includes('hunter2'));
  same();
});

test('an open item of a team with an entry is converted (fields, history, body), and the index lists the open items in number order, never an archived one', t => {
  const w = world(t);
  w.put('phases/002-x.md', md(2, `team: ${TEAM}\npriority: 1\nevents:\n- "2026-01-02T00:00:00Z created"\n`)); w.put('phases/001-x.md', md(1, 'priority: 9\n').replace('pending', 'done'));
  w.put('phases/003-x.md', md(3)); w.put('archive/004-x.md', md(4));
  w.put('phases/005-x.md', md(5, `team: ${TEAM}\n`).replace('pending', 'done')); // done ends an item without a team; this team ends its items with another word, so its item is open
  w.publish('seed');
  const r = w.migrate(['--team', TEAM]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const doc = JSON.parse(readFileSync(join(w.folder, 'phases/002-x.json'), 'utf8'));
  assert.deepEqual([doc.seq, doc.slug, doc.name, doc.team, doc.repository, doc.fields.status, doc.body], [2, '002-x', 'N2', TEAM, 'acme/app', 'pending', 'body 2\n']);
  assert.equal(doc.history.length, 1);
  assert.deepEqual([doc.created, doc.updated_by], [null, ''], 'an absent created is null and an absent updated_by is empty text');
  assert.equal(readFileSync(join(w.folder, 'index.json'), 'utf8'), `{\n  "branches": {\n    "": [\n      ${['{"seq":2,"slug":"002-x","name":"N2","status":"pending"}', '{"seq":3,"slug":"003-x","name":"N3","status":"pending"}', '{"seq":5,"slug":"005-x","name":"N5","status":"done"}', '{"seq":1,"slug":"001-x","name":"N1","status":"done"}'].join(',\n      ')}\n    ]\n  }\n}\n`);
  assert.equal(JSON.parse(readFileSync(join(w.folder, 'numbers.json'), 'utf8')).last, 5);
});

test('every stop of the conversion through the command: exit 2, every case listed, the folder byte for byte as it was', t => {
  const long = `005-${'n'.repeat(247)}`; // a .md name of 254 bytes: its .json name would be 256
  const w = world(t, null);
  w.put('phases/001-x.md', '---\nseq: [\n---\n'); // an unreadable header
  w.put('phases/002-x.md', md(2)); w.put('archive/002-y.md', md(2, '', '002-y')); // two items with one number
  w.put(`phases/${long}.md`, md(5, '', long));
  w.put('phases/006-x.json', 'not json\n'); // an item already in JSON that cannot be read
  w.publish('bad');
  const same = w.untouched();
  const r = w.migrate();
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stdout, 'ℹ️  no team file at .backlog/teams.json; no item of acme/app has a team\n');
  const lines = r.stderr.split('\n').filter(Boolean);
  assert.equal(lines.length, 4, r.stderr);
  assert.ok(lines.includes('❌ backlog: acme/app/phases/006-x.json: the item file cannot be read; restore it with git and run backlog team migrate again'), r.stderr);
  assert.ok(lines.some(l => /^❌ backlog: acme\/app\/phases\/001-x\.md: .*; restore it with git and run backlog team migrate again$/.test(l)), r.stderr);
  assert.ok(lines.includes('❌ backlog: acme/app: number 2 is held by 002-x and 002-y; give one of them a free number in markdown and run again'), r.stderr);
  assert.ok(lines.includes(`❌ backlog: acme/app/phases/${long}.md: the JSON file name would be too long; shorten the item's name in markdown and run again`), r.stderr);
  same();
});

test('a shallow clone stops the migration', t => {
  const w = world(t, null);
  w.three(); w.put('phases/004-x.md', md(4)); w.publish('more');
  const shallow = join(w.tmp, 'shallow'); git(w.tmp, 'clone', '-q', '--depth', '1', `file://${w.bare}`, shallow);
  const before = snapshot(join(shallow, 'acme'));
  const r = w.migrate(['--show-all'], { SMOOTH_BACKLOG_CLI_HOME: shallow });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.ok(r.stderr.includes('❌ backlog: the backlog clone is shallow, so numbers cannot be proven unused: run git fetch --unshallow\n'), r.stderr);
  assert.equal(snapshot(join(shallow, 'acme')), before);
  assert.equal(git(shallow, 'status', '--porcelain'), '');
});
