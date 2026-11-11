// `backlog team new` through the real command: the step "new" of the team's rules, the number taken only on an allowance, the command's own commit published, the
// SHA of the team file persisted only after that, and what a refusal, a bad argument and a failed publication leave behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, GIT_IDENTITY, cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { toFile } from '../../src/team/item.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const PARALLEL = read('../../templates/teams/parallel.json');
const git = (cwd, ...a) => { const p = spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }); if (p.status) throw new Error(`git ${a.join(' ')}: ${p.stderr}`); return p.stdout.trim(); };
const BASE = ['--team', 'parallel', '--agent', 'member-1'];

// A consumer checkout (origin acme/app) with the team file at .backlog/teams.json, and the backlog clone beside it; the backlog's own origin is a bare repository.
function world(t, teams = PARALLEL) {
  const tmp = mkdtempSync(join(tmpdir(), 'team-new-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = sharedBacklog(tmp); const cons = consumer(tmp, 'acme', 'app');
  const bare = join(tmp, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  mkdirSync(join(cons, '.backlog'), { recursive: true });
  writeFileSync(join(cons, '.backlog', 'teams.json'), JSON.stringify(teams));
  const folder = join(home, 'acme', 'app');
  const run = (args, env = {}) => cli(['team', 'new', ...args], { cwd: cons, tmp, plain: true, env: { SMOOTH_BACKLOG_CLI_AGENT: '', ...env } });
  const files = () => (existsSync(join(folder, 'phases')) ? readdirSync(join(folder, 'phases')).sort() : []);
  const item = slug => JSON.parse(readFileSync(join(folder, 'phases', `${slug}.json`), 'utf8'));
  const config = () => JSON.parse(readFileSync(join(cons, '.backlog', 'config.json'), 'utf8'));
  const sha = () => { try { return config().teams_file_sha; } catch { return undefined; } };
  const log = cwd => git(cwd, 'log', '--format=%s');
  const refuse = () => { const hook = join(bare, 'hooks', 'pre-receive'); writeFileSync(hook, '#!/bin/sh\necho refused >&2\nexit 1\n'); chmodSync(hook, 0o755); };
  return { tmp, home, cons, bare, folder, run, files, item, config, sha, log, refuse };
}

test('an allowed step: the item, its history, the index and the counter are written, committed as team new <slug> and pushed, and the SHA is persisted', t => {
  const w = world(t);
  const r = w.run([...BASE, '--name', 'First job', '--estimate', '45', '--session', 's-9']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ created 001-first-job (seq 1) for team parallel, rule new\n');
  assert.equal(r.stderr, '');
  const it = w.item('001-first-job');
  assert.deepEqual([it.seq, it.slug, it.name, it.team, it.repository, it.branch, it.updated_by, it.body], [1, '001-first-job', 'First job', 'parallel', 'acme/app', 'main', 'member-1', '']);
  assert.deepEqual([it.fields.status, it.fields.estimate, it.fields.holder, it.fields.children], ['new', 45, '', []]);
  assert.equal(it.created, it.updated);
  assert.deepEqual(it.history.map(h => [h.by, h.session, h.step, h.changes, h.note]), [['member-1', 's-9', 'new', { estimate: [0, 45] }, '']]);
  assert.deepEqual(JSON.parse(readFileSync(join(w.folder, 'numbers.json'), 'utf8')), { last: 1 });
  assert.deepEqual(JSON.parse(readFileSync(join(w.folder, 'index.json'), 'utf8')).branches.main.map(e => e.slug), ['001-first-job']);
  assert.equal(w.log(w.home).split('\n')[0], 'acme/app: team new 001-first-job');
  assert.equal(w.log(w.bare).split('\n')[0], 'acme/app: team new 001-first-job'); // published
  assert.equal(git(w.home, 'status', '--short'), '');
  assert.match(w.sha(), /^[0-9a-f]{64}$/);
});

test('--json prints the raw payload and nothing else; a related item is listed with its changes', t => {
  const w = world(t);
  assert.equal(w.run([...BASE, '--name', 'parent', '--estimate', '30']).status, 0);
  const parent = w.item('001-parent');
  assert.equal(w.run([...BASE.slice(2), '--team', 'parallel', '--agent', 'lead-1', '--name', 'p', '--estimate', '5', '--parent', '1']).stdout.trim(), '❌ children are added only to an item in status splitting (item 1) (rule new-child-parent-splitting)');
  assert.equal(parent.fields.status, 'new');
  // the parent is put into splitting by its team step; the test writes it the way the command stores it
  const entry = PARALLEL.parallel;
  writeFileSync(join(w.folder, 'phases', '001-parent.json'), toFile({ ...parent, fields: { ...parent.fields, status: 'splitting' } }, entry));
  git(w.home, 'add', '-A'); git(w.home, 'commit', '-qm', 'split'); git(w.home, 'push', '-q');
  const r = w.run([...BASE, '--name', 'child', '--estimate', '20', '--parent', '1', '--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out, { item: 2, slug: '002-child', rule: 'new-child', changes: { estimate: [0, 20], status: ['new', 'ready'], parent: [null, 1] }, related: { 1: { children: [[], [2]] } }, say: '' });
  assert.deepEqual(w.item('001-parent').fields.children, [2]);
  assert.equal(w.item('001-parent').history.at(-1).step, 'new');
});

test('a refusal prints its text on standard output, exits 1 and writes nothing: no file, no counter, no SHA, a clean clone; the number is not consumed', t => {
  const w = world(t);
  const r = w.run([...BASE, '--name', 'x']);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '❌ a new item needs --estimate <minutes> (rule new-needs-estimate)\n');
  assert.equal(r.stderr, '');
  assert.deepEqual(w.files(), []);
  assert.equal(existsSync(join(w.folder, 'numbers.json')), false);
  assert.equal(w.sha(), undefined);
  assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
  assert.equal(git(w.home, 'status', '--short'), '');
  assert.equal(w.log(w.home), 'init');
  const again = w.run([...BASE, '--name', 'x', '--estimate', '90']); // the size cap
  assert.equal(again.stdout, '❌ an item is at most 60 minutes of work (got 90); split it (rule new-size-cap)\n');
  assert.equal(w.run([...BASE, '--name', 'x', '--estimate', '30']).stdout, '✅ created 001-x (seq 1) for team parallel, rule new\n');
  assert.equal(w.run([...BASE, '--name', 'y']).status, 1);
  assert.equal(w.run([...BASE, '--name', 'y', '--estimate', '30']).stdout, '✅ created 002-y (seq 2) for team parallel, rule new\n'); // a refused step took no number
});

test('a caller that is no person of the team is refused by the team\'s own rule', t => {
  const w = world(t);
  const r = w.run(['--team', 'parallel', '--agent', 'stranger', '--name', 'x', '--estimate', '5']);
  assert.deepEqual([r.status, r.stdout], [1, '❌ stranger is not a person of team parallel (rule members-only)\n']);
});

test('--name is required (missing, empty, spaces): exit 2 on standard error, nothing written', t => {
  const w = world(t);
  for (const args of [[], ['--name', ''], ['--name', '   '], ['--name=']]) {
    const r = w.run([...BASE, ...args, '--estimate', '5']);
    assert.deepEqual([r.status, r.stdout, r.stderr], [2, '', '❌ backlog: --name is required\n'], args.join(' '));
  }
  assert.deepEqual(w.files(), []);
});

test('an argument the step does not take is exit 2 with the list of what it takes; a value that does not fit its field is refused by the rules, exit 1', t => {
  const w = world(t);
  let r = w.run([...BASE, '--name', 'x', '--estimate', '5', '--colour', 'red']);
  assert.deepEqual([r.status, r.stdout, r.stderr], [2, '', '❌ backlog: the step new of team parallel takes no --colour (it takes: --after, --estimate, --name, --parent)\n']);
  r = w.run([...BASE, '--name', 'x', '--estimate', '5', '--parent', 'abc']);
  assert.equal(r.status, 1); // the rule table decides first
  r = w.run([...BASE, '--name', 'x', '--estimate', 'abc']);
  assert.equal(r.status, 1);
  assert.deepEqual(w.files(), []);
});

test('the reserved flags a new item does not take, a word that is no flag, and a flag without its value: exit 2', t => {
  const w = world(t);
  const ok = ['--name', 'x', '--estimate', '5'];
  for (const [args, text] of [
    [[...BASE, ...ok, '--ask'], 'unrecognized arguments: --ask'], [[...BASE, ...ok, '--dry-run'], 'unrecognized arguments: --dry-run'], [[...BASE, ...ok, '--version'], 'unrecognized arguments: --version'],
    [[...BASE, ...ok, 'claim'], 'unrecognized arguments: claim'], [[...BASE, '--estimate', '5', '--name'], 'argument --name: expected one argument'],
    [['--agent', 'member-1', ...ok, '--show-all'], '--show-all acts over every team; backlog team new acts for one team: give --team <name> instead'],
  ]) {
    const r = w.run(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stderr, `❌ backlog: ${text}\n`, args.join(' '));
  }
  assert.deepEqual(w.files(), []);
  assert.equal(w.run([...BASE, ...ok, '--show-all']).status, 0); // with --team given, --show-all is ignored
});

test('the inputs: no team, no agent, a repository that is no owner/name, and a variable for each', t => {
  const w = world(t);
  assert.equal(w.run(['--agent', 'member-1', '--name', 'x']).stderr, '❌ backlog: a team command needs a team: give --team <name>, or set the SMOOTH_BACKLOG_CLI_TEAM_NAME variable, or set the "team" key in .backlog/config.json\n');
  assert.equal(w.run(['--team', 'parallel', '--name', 'x']).stderr, '❌ backlog: this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable\n');
  assert.match(w.run([...BASE, '--name', 'x', '--repository', 'nope']).stderr, /expected owner\/name/);
  const r = w.run(['--name', 'x', '--estimate', '5'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 'parallel', SMOOTH_BACKLOG_CLI_AGENT: 'member-2', SMOOTH_BACKLOG_CLI_SESSION: 'env-1' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual([w.item('001-x').updated_by, w.item('001-x').history[0].session], ['member-2', 'env-1']);
});

test('a team without an entry in the file: exit 1, nothing written', t => {
  const w = world(t);
  const r = w.run(['--team', 'ghost', '--agent', 'a', '--name', 'x']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /team ghost has no entry in \.backlog\/teams\.json \(teams: parallel\)/);
  assert.equal(w.sha(), undefined);
});

test('a team file that fails validation in any entry stops the command: exit 2, nothing written, no SHA', t => {
  const bad = { ...PARALLEL, broken: { ...PARALLEL.parallel, rules: { ...PARALLEL.parallel.rules, table: [{ id: 'x', step: 'new', do: { set: { status: 'shipped' } } }] } } };
  const w = world(t, bad);
  const r = w.run([...BASE, '--name', 'x', '--estimate', '5']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /fails validation for broken; no team command runs until the whole file is valid/);
  assert.deepEqual(w.files(), []);
  assert.equal(w.sha(), undefined);
});

test('the number: one above the counter and above every item, an archived one included; a refused creation after a published one never reuses it', t => {
  const w = world(t);
  mkdirSync(join(w.folder, 'archive'), { recursive: true });
  writeFileSync(join(w.folder, 'numbers.json'), '{"last":100}\n');
  git(w.home, 'add', '-A'); git(w.home, 'commit', '-qm', 'counter'); git(w.home, 'push', '-q');
  assert.equal(w.run([...BASE, '--name', 'a', '--estimate', '5']).stdout, '✅ created 101-a (seq 101) for team parallel, rule new\n');
  const entry = PARALLEL.parallel;
  const old = { seq: 250, slug: '250-old', name: 'old', team: 'parallel', repository: 'acme/app', branch: 'main', created: 'x', updated: 'x', updated_by: 'a', body: '', history: [], fields: { status: 'closed' } };
  writeFileSync(join(w.folder, 'archive', '250-old.json'), toFile(old, entry));
  git(w.home, 'add', '-A'); git(w.home, 'commit', '-qm', 'archived'); git(w.home, 'push', '-q');
  assert.equal(w.run([...BASE, '--name', 'b', '--estimate', '5']).stdout, '✅ created 251-b (seq 251) for team parallel, rule new\n');
});

test('the number skips a name the store holds: an item whose slug 002-x lies in another file name makes the next item 3', t => {
  const w = world(t);
  const old = { seq: 1, slug: '002-x', name: 'x', team: 'parallel', repository: 'acme/app', branch: 'main', created: 'x', updated: 'x', updated_by: 'a', body: '', history: [], fields: { status: 'new', estimate: 5 } };
  mkdirSync(join(w.folder, 'phases'), { recursive: true });
  writeFileSync(join(w.folder, 'phases', '001-y.json'), toFile(old, PARALLEL.parallel));
  git(w.home, 'add', '-A'); git(w.home, 'commit', '-qm', 'odd'); git(w.home, 'push', '-q');
  const r = w.run([...BASE, '--name', 'x', '--estimate', '5']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ created 003-x (seq 3) for team parallel, rule new\n');
});

test('a team field named events or phase is a plain field: the command reads the folder raw and numbers after it', t => {
  const entry = { people: { a: ['lead'] }, item: { status: { type: 'text', values: ['open', 'done'], final: ['done'], default: 'open' }, events: { type: 'text', default: 'e' }, phase: { type: 'text', default: 'p' } }, rules: { table: [{ id: 'new', step: 'new', do: { set: { status: 'open' } } }], pop: [], filters: {} } };
  const w = world(t, { odd: entry });
  const old = { seq: 7, slug: '007-old', name: 'old', team: 'odd', repository: 'acme/app', branch: 'main', created: 'x', updated: 'x', updated_by: 'a', body: '', history: [], fields: { status: 'open', events: 'kept', phase: 'kept too' } };
  mkdirSync(join(w.folder, 'phases'), { recursive: true });
  writeFileSync(join(w.folder, 'phases', '007-old.json'), toFile(old, entry));
  git(w.home, 'add', '-A'); git(w.home, 'commit', '-qm', 'odd'); git(w.home, 'push', '-q');
  const r = w.run(['--team', 'odd', '--agent', 'a', '--name', 'next']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ created 008-next (seq 8) for team odd, rule new\n');
  assert.deepEqual([w.item('008-next').fields.events, w.item('008-next').fields.phase], ['e', 'p']);
  assert.deepEqual([w.item('007-old').fields.events, w.item('007-old').fields.phase], ['kept', 'kept too']);
});

test('a detached HEAD with no branch given is exit 2 with the design text; --branch files the item on that branch', t => {
  const w = world(t);
  git(w.cons, 'commit', '-q', '--allow-empty', '-m', 'c'); git(w.cons, 'checkout', '-q', '--detach');
  const r = w.run([...BASE, '--name', 'x', '--estimate', '5']);
  assert.deepEqual([r.status, r.stderr], [2, '❌ backlog: HEAD is detached: check out a branch, or give --branch <name> (SMOOTH_BACKLOG_CLI_TEAM_BRANCH)\n']);
  assert.deepEqual(w.files(), []);
  assert.equal(w.run([...BASE, '--name', 'x', '--estimate', '5', '--branch', 'topic']).status, 0);
  assert.equal(w.item('001-x').branch, 'topic');
});

test('a refused push: exit 3, the clone as before (no file, no counter, no commit), the SHA not persisted, the counter not consumed; a later run takes the number', t => {
  const w = world(t);
  w.refuse();
  const r = w.run([...BASE, '--name', 'x', '--estimate', '5']);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /The change was not published/);
  assert.equal(r.stdout, '');
  assert.deepEqual(w.files(), []);
  assert.equal(existsSync(join(w.folder, 'numbers.json')), false);
  assert.equal(git(w.home, 'status', '--short'), '');
  assert.equal(w.log(w.home), 'init');
  assert.equal(w.sha(), undefined);
  rmSync(join(w.bare, 'hooks', 'pre-receive'));
  assert.equal(w.run([...BASE, '--name', 'x', '--estimate', '5']).stdout, '✅ created 001-x (seq 1) for team parallel, rule new\n');
  assert.match(w.sha(), /^[0-9a-f]{64}$/);
});

test('a failed pull (the backlog\'s origin unreachable): exit 3 before the rules are read, nothing written, the counter not consumed', t => {
  const w = world(t);
  const away = `${w.bare}.away`;
  renameSync(w.bare, away);
  for (const args of [[...BASE, '--name', 'x', '--estimate', '5'], [...BASE, '--name', 'x']]) { // an allowed step and one the rules would refuse: the pull comes first
    const r = w.run(args);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^❌ backlog: /);
    assert.deepEqual(w.files(), []);
    assert.equal(existsSync(join(w.folder, 'numbers.json')), false);
    assert.equal(git(w.home, 'status', '--short'), '');
    assert.equal(w.log(w.home), 'init');
    assert.equal(w.sha(), undefined);
  }
  renameSync(away, w.bare);
  assert.equal(w.run([...BASE, '--name', 'x', '--estimate', '5']).stdout, '✅ created 001-x (seq 1) for team parallel, rule new\n');
});

// The backlog inside the code repository: the team file lies in the clone, the folder is .backlog/local/repository, a second clone (rb) publishes beside the first (ra).
function inside(t) {
  const dir = mkdtempSync(join(tmpdir(), 'team-new-in-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bare = join(dir, 'origin.git'); const ra = join(dir, 'ra'); const rb = join(dir, 'rb');
  git(dir, 'init', '-q', '--bare', '-b', 'main', bare); git(dir, 'clone', '-q', bare, ra); git(ra, 'checkout', '-q', '-b', 'main');
  mkdirSync(join(ra, '.backlog'), { recursive: true });
  writeFileSync(join(ra, '.backlog', 'config.json'), '{"backlog_repository": ".backlog"}\n');
  writeFileSync(join(ra, '.backlog', 'teams.json'), JSON.stringify(PARALLEL));
  git(ra, 'add', '-A'); git(ra, 'commit', '-qm', 'seed'); git(ra, 'push', '-q', '-u', 'origin', 'main');
  git(dir, 'clone', '-q', bare, rb);
  const folder = join(ra, '.backlog', 'local', 'repository');
  const run = (args, env = {}) => spawnSync(process.execPath, [join(import.meta.dirname, '..', '..', 'bin', 'backlog.js'), 'team', 'new', ...args], { cwd: ra, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY, SMOOTH_BACKLOG_CLI_HOME: '', XDG_CONFIG_HOME: join(dir, 'xdg'), SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_TEAM_NAME: '', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: '', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: '', SMOOTH_BACKLOG_CLI_SESSION: '', ...env } });
  return { dir, bare, ra, rb, folder, run };
}

test('backlog inside the code repository: only the folder\'s own paths are committed, a lead\'s uncommitted edit of the team file stays, and the SHA is persisted', t => {
  const w = inside(t);
  const edited = JSON.stringify({ ...PARALLEL, draft: PARALLEL.parallel });
  writeFileSync(join(w.ra, '.backlog', 'teams.json'), edited); // a lead's draft, not committed
  const r = w.run(BASE.concat(['--name', 'x', '--estimate', '5']));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ created 001-x (seq 1) for team parallel, rule new\n');
  assert.deepEqual(git(w.ra, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['.backlog/.gitignore', '.backlog/local/repository/index.json', '.backlog/local/repository/numbers.json', '.backlog/local/repository/phases/001-x.json']);
  assert.equal(git(w.ra, 'log', '-1', '--format=%s'), 'backlog: team new 001-x');
  assert.equal(git(w.bare, 'log', '-1', '--format=%s'), 'backlog: team new 001-x');
  assert.equal(readFileSync(join(w.ra, '.backlog', 'teams.json'), 'utf8'), edited);
  assert.match(git(w.ra, 'status', '--short'), /^M? ?M \.backlog\/(config|teams)\.json/m);
  assert.match(JSON.parse(readFileSync(join(w.ra, '.backlog', 'config.json'), 'utf8')).teams_file_sha, /^[0-9a-f]{64}$/);
});

test('another clone publishes into the folder while the command pushes: the step runs again on the new files, takes the next number and prints that result', t => {
  const w = inside(t);
  const entry = PARALLEL.parallel;
  const other = { seq: 1, slug: '001-other', name: 'other', team: 'parallel', repository: 'local/repository', branch: 'main', created: 'x', updated: 'x', updated_by: 'member-2', body: '', history: [], fields: { status: 'new', estimate: 5 } };
  const staged = join(w.dir, '001-other.json'); writeFileSync(staged, toFile(other, entry));
  const marker = join(w.dir, 'done');
  const hook = join(w.ra, '.git', 'hooks', 'pre-push');
  const rf = join(w.rb, '.backlog', 'local', 'repository', 'phases');
  writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE\n[ -e '${marker}' ] && exit 0\ntouch '${marker}'\ncd '${w.rb}' && git pull -q --rebase && mkdir -p '${rf}' && cp '${staged}' '${rf}/' && git add -A && git commit -qm other && git push -q\n`);
  chmodSync(hook, 0o755);
  const r = w.run(BASE.concat(['--name', 'mine', '--estimate', '5']));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ created 002-mine (seq 2) for team parallel, rule new\n'); // the output of the run on the upstream files
  assert.deepEqual(readdirSync(join(w.folder, 'phases')).sort(), ['001-other.json', '002-mine.json']);
  assert.deepEqual(JSON.parse(readFileSync(join(w.folder, 'numbers.json'), 'utf8')), { last: 2 });
  assert.deepEqual(git(w.bare, 'log', '--format=%s', '-3').split('\n'), ['backlog: team new 002-mine', 'other', 'seed']);
  assert.match(JSON.parse(readFileSync(join(w.ra, '.backlog', 'config.json'), 'utf8')).teams_file_sha, /^[0-9a-f]{64}$/);
});

// A second clone (rb) publishes a new team file (and nothing else) while the command pushes from ra: the hook runs once, before the first push.
function teamFileUpstream(w, teams) {
  const staged = join(w.dir, 'teams.staged'); writeFileSync(staged, JSON.stringify(teams));
  const marker = join(w.dir, 'done');
  const hook = join(w.ra, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE\n[ -e '${marker}' ] && exit 0\ntouch '${marker}'\ncd '${w.rb}' && git pull -q --rebase && cp '${staged}' .backlog/teams.json && git add -A && git commit -qm 'new rules' && git push -q\n`);
  chmodSync(hook, 0o755);
}
const withRule = (id, change) => ({ ...PARALLEL, parallel: { ...PARALLEL.parallel, rules: { ...PARALLEL.parallel.rules, table: PARALLEL.parallel.rules.table.map(r => (r.id === id ? change(r) : r)) } } });

test('only the team file changes upstream (it lies in the clone): the step runs again under the new rules and prints their say text', t => {
  const w = inside(t);
  teamFileUpstream(w, withRule('new', r => ({ ...r, do: { ...r.do, say: 'file the review for {$item.slug}' } })));
  const r = w.run(BASE.concat(['--name', 'x', '--estimate', '5']));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ created 001-x (seq 1) for team parallel, rule new\nfile the review for 001-x\n');
  assert.deepEqual(git(w.bare, 'log', '--format=%s', '-3').split('\n'), ['backlog: team new 001-x', 'new rules', 'seed']);
});

test('the step run again is refused by the new rules: exit 1 with the refusal on standard output, the item not published, no file, no counter', t => {
  const w = inside(t);
  teamFileUpstream(w, withRule('new-size-cap', r => ({ ...r, when: { not: { '<=': ['$arg.estimate', 3] } }, deny: 'an item is at most 3 minutes (got {$arg.estimate})' })));
  const r = w.run(BASE.concat(['--name', 'x', '--estimate', '5']));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '❌ an item is at most 3 minutes (got 5) (rule new-size-cap)\n');
  assert.equal(r.stderr, '');
  assert.equal(existsSync(join(w.folder, 'phases', '001-x.json')), false);
  assert.equal(existsSync(join(w.folder, 'numbers.json')), false);
  assert.deepEqual(git(w.bare, 'log', '--format=%s', '-2').split('\n'), ['new rules', 'seed']);
  assert.equal(git(w.ra, 'log', '-1', '--format=%s'), 'new rules');
});

test('the say text of the rule is printed after the line, and is the "say" of --json', t => {
  const w = world(t, withRule('new', r => ({ ...r, do: { ...r.do, say: 'file the review for {$item.slug}' } })));
  assert.equal(w.run([...BASE, '--name', 'x', '--estimate', '5']).stdout, '✅ created 001-x (seq 1) for team parallel, rule new\nfile the review for 001-x\n');
  assert.equal(JSON.parse(w.run([...BASE, '--name', 'y', '--estimate', '5', '--json']).stdout).say, 'file the review for 002-y');
});

test('dispatch level: the new route installs no seam (the old routes do)', t => {
  const w = world(t); // a child process: the runner reports through this process's standard output, which a test must not replace
  const code = `import { seam } from ${JSON.stringify(new URL('../../src/shared/seam.js', import.meta.url).href)}; import * as teamCli from ${JSON.stringify(new URL('../../src/team/cli.js', import.meta.url).href)};
    const before = seam.entry; const code = await teamCli.run(JSON.parse(process.env.ARGV));
    process.stdout.write('\\n' + JSON.stringify({ before, code, entry: seam.entry, isMember: seam.isMember, also: seam.alsoActive({ status: 'refining', refiner: 'a' }), scope: seam.inScope({}) }));`;
  const env = { ...process.env, ...GIT_IDENTITY, SMOOTH_BACKLOG_CLI_HOME: w.home, XDG_CONFIG_HOME: join(w.tmp, 'config'), SMOOTH_BACKLOG_CLI_TEAM_NAME: '', SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: '', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: '', ARGV: JSON.stringify(['new', ...BASE, '--name', 'x', '--estimate', '5']) };
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: w.cons, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  const cut = r.stdout.lastIndexOf('\n'); const out = r.stdout.slice(0, cut); const json = r.stdout.slice(cut + 1);
  assert.match(out, /created 001-x/);
  assert.deepEqual(JSON.parse(json), { before: null, code: 0, entry: null, isMember: null, also: false, scope: true });
});

test('--help is answered by the router before anything is read', t => {
  const w = world(t);
  const r = cli(['team', 'new', '--help'], { cwd: w.cons, tmp: w.tmp, plain: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^backlog team new — /);
  assert.match(r.stdout, /--name TEXT\n {6}The title of the item\. Required \(exit 2 without it\)\./);
});
