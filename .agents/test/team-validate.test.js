// `backlog team validate` through the real command: the findings of every validate case, the printed lines, the exit codes, what it writes and what it does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { teamHelp } from '../../src/team/help.js';
import { missingText } from '../../src/team/teams-file.js';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, sharedBacklog } from './shared-fixtures.js';

const BIN = resolve(new URL('../../bin/backlog.js', import.meta.url).pathname);
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { cases } = read('./fixtures/team-rules/rule-cases.json');
const TEMPLATES = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, read(`../../templates/teams/${n}.json`)]));
const GOOD = { people: { a: ['lead'], b: ['member'] }, item: { status: { type: 'text', values: ['open', 'done'], final: ['done'], default: 'open' }, depends_on: { type: 'items', description: 'the items this one waits for' } }, rules: { table: [{ id: 'take', step: 'claim', do: { set: { status: 'open' } } }], pop: [], filters: {} } };
const BAD = { ...GOOD, rules: { table: [{ id: 'take', step: 'claim', do: { set: { status: 'shipped' } } }], pop: [], filters: {} } };
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });

// a repository whose backlog lies inside it, with a state folder of its own
function world(t) {
  const root = mkdtempSync(join(tmpdir(), 'team-validate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); const cfgDir = join(root, 'xdg'); const backlog = join(top, '.backlog');
  mkdirSync(backlog, { recursive: true });
  git(top, 'init', '-q', '-b', 'main');
  writeFileSync(join(backlog, 'config.json'), '{"backlog_repository": ".backlog"}\n');
  git(top, 'commit', '-q', '--allow-empty', '-m', 'init');
  const env = { ...process.env, XDG_CONFIG_HOME: cfgDir, SMOOTH_BACKLOG_CLI_HOME: '', SMOOTH_BACKLOG_CLI_TEAM_NAME: '', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: '', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: '', SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '', SMOOTH_BACKLOG_CLI_ORIGIN_URL: '' };
  const run = (args, extra = {}) => { const p = spawnSync(process.execPath, [BIN, 'team', ...args], { cwd: top, env: { ...env, ...extra }, encoding: 'utf8' }); return { status: p.status, stdout: p.stdout, stderr: p.stderr }; };
  const file = join(backlog, 'teams.json');
  const put = obj => writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj));
  const cfg = () => readFileSync(join(backlog, 'config.json'), 'utf8');
  const item = (dir, name, doc) => { mkdirSync(join(backlog, 'local', 'repository', dir), { recursive: true }); writeFileSync(join(backlog, 'local', 'repository', dir, name), typeof doc === 'string' ? doc : JSON.stringify(doc)); };
  return { root, top, backlog, cfgDir, run, put, cfg, file, item };
}
const doc = (seq, team, fields) => ({ seq, slug: `${String(seq).padStart(3, '0')}-x`, name: 'x', team, repository: 'local/repository', branch: 'main', created: null, updated: '2026-11-10T00:00:00Z', updated_by: '', fields, body: '', history: [] });

test('every validate case of the case file gives the same errors through the command, with --show-all and --json', t => {
  const w = world(t);
  const all = cases.filter(c => c.command.run === 'validate');
  assert.equal(all.length, 40);
  for (const c of all) {
    w.put(c.rule_set === 'inline' ? c.given.team_file : TEMPLATES[c.rule_set]);
    const r = w.run(['validate', '--show-all', '--json']);
    const found = JSON.parse(r.stdout);
    assert.equal(r.status, c.expect.exit, `${c.id}: ${r.stdout}${r.stderr}`);
    assert.deepEqual(found.filter(f => f.severity === 'error').map(({ path, rule, problem }) => ({ path, rule, problem })), c.expect.findings, c.id);
    for (const f of found) assert.ok(f.fix, `${c.id}: finding without a fix`);
  }
});

test('the printed lines: the place, the rule, the problem, the fix and the last line', t => {
  const w = world(t);
  w.put(cases.find(c => c.expect.findings?.[0]?.rule === 'only-open').given.team_file);
  const r = w.run(['validate', '--team', 't']);
  assert.equal(r.status, 2);
  const lines = r.stdout.trimEnd().split('\n');
  const at = lines.indexOf('❌ .backlog/teams.json: t.rules.table[1] (rule only-open): rule only-open can never decide: rule take above it matches every case it matches');
  assert.ok(at >= 0, r.stdout);
  assert.match(lines[at + 1], /^ {3}fix: .+/);
  assert.equal(lines.at(-1), '❌ .backlog/teams.json: 1 team, 1 error, 5 warnings');
});

test('a valid file with warnings exits 0, prints the warnings and ends with the check mark line', t => {
  const w = world(t);
  w.put(TEMPLATES.parallel);
  const r = w.run(['validate', '--team', 'parallel']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^⚠️ {2}\.backlog\/teams\.json: parallel\.\S+: .+\n {3}fix: /m);
  assert.match(r.stdout.trimEnd().split('\n').at(-1), /^✅ \.backlog\/teams\.json: 1 team, 0 errors, [1-9]\d* warnings$/);
});

test('--team names the broken other entry in one line and exits 2; the other entry\'s findings are not printed', t => {
  const w = world(t);
  w.put({ good: GOOD, bad: BAD });
  const r = w.run(['validate', '--team', 'good']);
  assert.equal(r.status, 2);
  assert.ok(r.stdout.includes('❌ .backlog/teams.json: the entries of bad have errors; no team command runs until the whole file is valid; run backlog team validate --show-all\n'), r.stdout);
  assert.doesNotMatch(r.stdout, /shipped/);
  assert.match(r.stdout.trimEnd().split('\n').at(-1), /^❌ \.backlog\/teams\.json: 2 teams, 1 error, \d+ warnings?$/); // the real error of the other entry counts; the line about it does not
  const json = JSON.parse(w.run(['validate', '--team', 'good', '--json']).stdout);
  assert.deepEqual(json.filter(f => f.severity === 'error'), [{ severity: 'error', team: null, path: '', rule: null, problem: 'the entries of bad have errors; no team command runs until the whole file is valid', fix: 'run backlog team validate --show-all' }]);
  assert.ok(json.every(f => ['severity', 'team', 'path', 'rule', 'problem', 'fix'].every(k => k in f) && (f.team === null || f.team === 'good')));
  const all = w.run(['validate', '--show-all']);
  assert.equal(all.status, 2);
  assert.match(all.stdout, /bad\.rules\.table\[0\].*shipped is not a value of status/);
});

test('--show-all together with --team: --team decides', t => {
  const w = world(t);
  w.put({ good: GOOD, bad: BAD });
  const r = w.run(['validate', '--show-all', '--team', 'good']);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout, /shipped/);
  assert.match(r.stdout, /the entries of bad have errors/);
});

test('no team: the refusal names the three ways; a team the file does not have is exit 1 naming the teams', t => {
  const w = world(t);
  w.put({ good: GOOD });
  const none = w.run(['validate']);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /a team command needs a team: give --team <name>, or set the SMOOTH_BACKLOG_CLI_TEAM_NAME variable, or set the "team" key in \.backlog\/config\.json/);
  const ghost = w.run(['validate', '--team', 'ghost']);
  assert.equal(ghost.status, 1);
  assert.match(ghost.stderr, /team ghost has no entry in \.backlog\/teams\.json \(teams: good\)/);
  assert.equal(w.run(['validate'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 'good' }).status, 0);
});

test('no team file: exit 2 with the resolved path and the three ways', t => {
  const w = world(t);
  const r = w.run(['validate', '--team', 'good']);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes(missingText('.backlog/teams.json')), r.stderr);
});

test('a file that is not JSON is a finding, exit 2, and nothing is written', t => {
  const w = world(t);
  w.put('{ nope');
  const before = w.cfg();
  const r = w.run(['validate', '--team', 'good']);
  assert.equal(r.status, 2);
  const [first, fix, last, ...rest] = r.stdout.split('\n');
  assert.match(first, /^❌ \.backlog\/teams\.json is not JSON \(Expected property name or '\}' in JSON at position 2.*\)$/);
  assert.equal(fix, '   fix: correct the syntax at that place');
  assert.equal(last, '❌ .backlog/teams.json: 1 error, 0 warnings'); // no team count: the file was not parsed
  assert.deepEqual(rest, ['']);
  assert.equal(w.cfg(), before);
  assert.equal(existsSync(w.cfgDir), false);
});

test('the SHA is written once into the configuration and the record beside it; a second run changes nothing', t => {
  const w = world(t);
  w.put({ good: GOOD });
  assert.equal(w.run(['validate', '--team', 'good']).status, 0);
  const first = w.cfg();
  assert.match(JSON.parse(first).teams_file_sha, /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(first).backlog_repository, '.backlog');
  const stamp = statSync(join(w.backlog, 'config.json')).mtimeMs;
  assert.equal(w.run(['validate', '--team', 'good']).status, 0);
  assert.equal(w.cfg(), first);
  assert.equal(statSync(join(w.backlog, 'config.json')).mtimeMs, stamp);
  // a file with an error writes no SHA
  const w2 = world(t);
  w2.put({ bad: BAD });
  assert.equal(w2.run(['validate', '--team', 'bad']).status, 2);
  assert.equal(JSON.parse(w2.cfg()).teams_file_sha, undefined);
});

test('a team file that is a symbolic link is refused and nothing is written', t => {
  const w = world(t);
  writeFileSync(join(w.root, 'elsewhere.json'), JSON.stringify({ good: GOOD }));
  symlinkSync(join(w.root, 'elsewhere.json'), w.file);
  const before = w.cfg();
  const r = w.run(['validate', '--team', 'good']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /symbolic link/);
  assert.equal(w.cfg(), before);
  assert.equal(existsSync(w.cfgDir), false);
});

test('--help reads nothing: it answers with a broken team file and a broken configuration', t => {
  const w = world(t);
  w.put('{ nope');
  writeFileSync(join(w.backlog, 'config.json'), '{ broken');
  for (const word of ['validate', 'migrate']) {
    const r = w.run([word, '--help']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trimEnd(), teamHelp[`team ${word}`].trimEnd());
  }
  assert.equal(w.run(['validate', '--team', 'good']).status, 2); // without --help the broken configuration stops it
  assert.equal(existsSync(w.cfgDir), false);
});

test('the items of a JSON folder are checked: a seq that differs from the file name is an error, a value outside the definition is an error, a missing reference is a warning', t => {
  const w = world(t);
  w.put({ good: GOOD });
  w.item('phases', '001-x.json', doc(2, 'good', { status: 'open' }));
  w.item('phases', '003-x.json', doc(3, 'good', { status: 'refining', stage: 'x', depends_on: [4, 99, 'local/repository#4', 'local/repository#98'] }));
  w.item('archive/2026', '004-x.json', doc(4, 'good', { status: 'done' }));
  w.item('phases', '005-x.json', doc(5, 'ghost', { status: 'open' }));
  w.item('phases', '006-x.json', doc(6, undefined, { status: 'whatever' }));
  git(w.top, 'add', '-A'); git(w.top, 'commit', '-q', '-m', 'items');
  const r = w.run(['validate', '--team', 'good']);
  const lines = r.stdout.split('\n');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.ok(lines.includes("❌ local/repository/phases/001-x.json: seq 2 differs from the file name's number 1"), r.stdout);
  assert.ok(lines.includes('❌ local/repository/phases/003-x.json: status "refining" is not a value of status of team good'), r.stdout);
  assert.ok(lines.includes('⚠️  local/repository/phases/003-x.json: field stage is not declared by the item definition of team good; rules cannot read it'), r.stdout);
  assert.ok(lines.includes('⚠️  local/repository/phases/003-x.json: field depends_on names no item 99'), r.stdout);
  assert.ok(lines.includes('⚠️  local/repository/phases/003-x.json: field depends_on names no item local/repository#98'), r.stdout);
  assert.doesNotMatch(r.stdout, /names no item (4|"local\/repository#4")/); // an archived item of the folder exists
  assert.doesNotMatch(r.stdout, /005-x|006-x/); // the team of another entry is not asked for; an item of no team is not checked
  const showAll = w.run(['validate', '--show-all']);
  assert.match(showAll.stdout, /❌ local\/repository\/phases\/005-x\.json: team ghost has no entry in teams\.json/);
  const json = JSON.parse(w.run(['validate', '--team', 'good', '--json']).stdout);
  assert.ok(json.every(f => f.fix) && json.some(f => f.path === 'local/repository/phases/001-x.json'));
});

test('a numbers.json below the highest number used is a warning that names the file', t => {
  const w = world(t);
  w.put({ good: GOOD });
  w.item('phases', '005-x.json', doc(5, 'good', { status: 'open' }));
  w.item('.', 'numbers.json', '{"last":1}\n');
  git(w.top, 'add', '-A'); git(w.top, 'commit', '-q', '-m', 'items');
  const r = w.run(['validate', '--team', 'good']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^⚠️ {2}local\/repository\/numbers\.json says 1, but number 5 was used/m);
});

test('an archived item is not checked', t => {
  const w = world(t);
  w.put({ good: GOOD });
  w.item('archive/2026', '001-x.json', doc(7, 'good', { status: 'nonsense', extra: 1 }));
  git(w.top, 'add', '-A'); git(w.top, 'commit', '-q', '-m', 'items');
  const r = w.run(['validate', '--team', 'good']);
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /001-x/);
});

test('markdown items: a note, and the file alone is checked', t => {
  const w = world(t);
  w.put({ good: GOOD });
  w.item('phases', '001-x.md', '---\nname: x\nteam: ghost\n---\nbody\n');
  const r = w.run(['validate', '--team', 'good']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('ℹ️  the items are markdown: run backlog team migrate, then validate checks them too\n'));
  assert.doesNotMatch(r.stdout, /001-x/);
});

test('a repository input naming another repository validates that file and writes only the record', t => {
  const w = world(t);
  const other = join(w.backlog, 'acme', 'other'); mkdirSync(other, { recursive: true });
  writeFileSync(join(other, 'teams.json'), JSON.stringify({ good: GOOD }));
  const before = w.cfg();
  const r = w.run(['validate', '--team', 'good', '--repository', 'acme/other'], { SMOOTH_BACKLOG_CLI_HOME: w.backlog });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(w.cfg(), before);
  assert.equal(existsSync(join(w.cfgDir, 'smooth-backlog-cli', 'teams-validation')), true);
  assert.equal(w.run(['validate', '--team', 'good', '--repository', 'nonsense'], { SMOOTH_BACKLOG_CLI_HOME: w.backlog }).status, 2);
});

test('the router: an unknown word names the six words, migrate resolves its inputs and is not available yet', t => {
  const w = world(t);
  w.put({ good: GOOD });
  const unknown = w.run(['frobnicate']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /team needs a subcommand \(new, update, pop, query, validate, migrate\)/);
  const noTeam = w.run(['migrate']);
  assert.equal(noTeam.status, 2);
  assert.match(noTeam.stderr, /a team command needs a team/);
  const migrate = w.run(['migrate', '--team', 'good']);
  assert.equal(migrate.status, 2);
  assert.match(migrate.stderr, /team migrate is not available yet/);
  assert.equal(w.run(['validate', '--team', 'good', 'extra']).status, 2);
  assert.equal(w.run(['validate', '--team', 'good', '--dry-run']).status, 2);
});

test('unknown arguments are refused with exit 2 on standard error and nothing on standard output', t => {
  const w = world(t);
  w.put({ good: GOOD });
  for (const args of [['validate', '--team', 'good', '--bogus'], ['validate', '--team', 'good', '--ask'], ['migrate', '--team', 'good', '--bogus']]) {
    const r = w.run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
    assert.match(r.stderr, new RegExp(`^❌ backlog: unrecognized arguments: ${args.at(-1)}\\n$`));
  }
});

test('a word that is no flag is refused like an unknown flag', t => {
  const w = world(t);
  w.put({ good: GOOD });
  const r = w.run(['validate', 'word', '--team', 'good']);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^❌ backlog: unrecognized arguments: word\n$/);
});

test('--json carries the item and number findings with the same keys', t => {
  const w = world(t);
  w.put({ good: GOOD });
  w.item('phases', '005-x.json', doc(6, 'good', { status: 'open', stage: 'x' }));
  w.item('.', 'numbers.json', '{"last":1}\n');
  git(w.top, 'add', '-A'); git(w.top, 'commit', '-q', '-m', 'items');
  const r = w.run(['validate', '--team', 'good', '--json']);
  assert.equal(r.status, 2);
  const found = JSON.parse(r.stdout);
  const keys = f => Object.keys(f).join();
  assert.ok(found.every(f => keys(f) === 'severity,team,path,rule,problem,fix'), r.stdout);
  assert.ok(found.some(f => f.severity === 'error' && f.path === 'local/repository/phases/005-x.json' && /^seq 6 differs/.test(f.problem)));
  assert.ok(found.some(f => f.severity === 'warning' && f.path === 'local/repository/numbers.json' && /says 1, but number \d+ was used/.test(f.problem)));
});

test('a markdown file that starts with a horizontal rule is not an item of the old format', t => {
  const w = world(t);
  w.put({ good: GOOD });
  w.item('phases', 'README.md', '---\n\nJust a note under a rule.\n');
  const r = w.run(['validate', '--team', 'good']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /markdown/);
});

// a consumer repository whose backlog is the shared clone, with its own origin to change from a second clone
function shared(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'team-validate-pull-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = sharedBacklog(tmp);
  const cons = consumer(tmp, 'acme', 'demo', 'main');
  mkdirSync(join(cons, '.backlog'), { recursive: true });
  writeFileSync(join(cons, '.backlog', 'config.json'), '{"backlog_repository": "../../home"}\n');
  const bare = join(tmp, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  const other = join(tmp, 'other');
  const id = ['-c', 'user.name=t', '-c', 'user.email=t@t'];
  spawnSync('git', ['clone', '-q', bare, other]);
  const push = (path, text) => {
    mkdirSync(join(other, path, '..'), { recursive: true });
    writeFileSync(join(other, path), text);
    spawnSync('git', [...id, 'add', '-A'], { cwd: other });
    spawnSync('git', [...id, 'commit', '-q', '-m', 'change'], { cwd: other });
    assert.equal(spawnSync('git', ['push', '-q', 'origin', 'HEAD'], { cwd: other }).status, 0);
  };
  return { tmp, home, cons, bare, push, run: args => cli(['team', 'validate', ...args], { cwd: cons, tmp }) };
}

test('validate updates the backlog repository first: a team file and an item that only the origin holds are seen', t => {
  const s = shared(t);
  assert.equal(s.run(['--team', 'good']).status, 2); // nothing yet: no team file
  s.push('acme/demo/teams.json', JSON.stringify({ good: GOOD }));
  s.push('acme/demo/phases/001-x.json', JSON.stringify(doc(2, 'good', { status: 'open' })));
  const r = s.run(['--team', 'good']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^❌ acme\/demo\/phases\/001-x\.json: seq 2 differs from the file name's number 1$/m);
  assert.match(r.stdout, /teams\.json: 1 team, 1 error/);
});

test('when the origin cannot be reached validate warns and answers from the local copy', t => {
  const s = shared(t);
  s.push('acme/demo/teams.json', JSON.stringify({ good: GOOD }));
  assert.equal(s.run(['--team', 'good']).status, 0);
  renameSync(s.bare, `${s.bare}-gone`);
  const r = s.run(['--team', 'good']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /origin offline, local backlog updates may be behind/);
  assert.match(r.stdout, /1 team, 0 errors/);
});
