// `backlog team update <item> <step>` through the real command: the team's rules decide, an allowance is written, committed as the command's own commit and published, the SHA of the team file
// is persisted only after that, and what a refusal, a wrong word, a bad argument and a failed publication leave behind. The cases of the rules are replayed in team-commands.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHILD_TIMEOUT, TEMPLATES, fileOf, git, inside, putItem, world } from './team-fixture.js';
import { GIT_IDENTITY } from './shared-fixtures.js';
import { stepNames } from '../../src/team/steps.js';
import { validate, errors } from '../../src/team/rules/validate.js';
import * as index from '../../src/shared/index.js';
import { mkdirSync } from 'node:fs';

const PARALLEL = TEMPLATES.parallel; const ENTRY = PARALLEL.parallel;
const BASE = ['--team', 'parallel', '--agent', 'member-1'];
const item = (seq, fields = {}, extra = {}) => ({ seq, slug: `${String(seq).padStart(3, '0')}-job`, name: 'job', team: 'parallel', repository: 'acme/app', branch: 'main', fields: { status: 'ready', estimate: 5, holder: '', checker: '', parent: null, children: [], depends_on: [], handoff: '', rounds: 0, ...fields }, ...extra });
const update = (w, ident, step, rest = BASE, env = {}) => w.run([ident, step, ...rest], env, 'update');
const doc = (w, seq) => JSON.parse(readFileSync(fileOf(w.folder, seq), 'utf8'));
// a world with the items written (as files) and published
function seeded(t, items = [item(1)], teams = PARALLEL) {
  const w = world(t, teams);
  for (const i of items) putItem(w.folder, i, teams.parallel);
  w.publish('seed');
  return w;
}
// Every file under a folder with its bytes
const snapshot = dir => Object.fromEntries(git(dir, 'ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean).map(p => [p, readFileSync(join(dir, p), 'utf8')]));

test('an allowed step: the item and its history are written, committed as team <step> <slug> and pushed, the SHA is persisted, and the lines are printed after that', t => {
  const w = seeded(t);
  const r = update(w, '1', 'claim', [...BASE, '--session', 's-9']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ 001-job: claim (rule claim)\n   status: ready -> in progress\n   holder: "" -> member-1\n');
  assert.equal(r.stderr, '');
  const it = doc(w, 1);
  assert.deepEqual([it.fields.status, it.fields.holder, it.updated_by], ['in progress', 'member-1', 'member-1']);
  assert.deepEqual(it.history.map(h => [h.by, h.session, h.step, h.changes]), [['member-1', 's-9', 'claim', { status: ['ready', 'in progress'], holder: ['', 'member-1'] }]]);
  assert.equal(git(w.home, 'log', '-1', '--format=%s'), 'acme/app: team claim 001-job');
  assert.equal(git(w.bare, 'log', '-1', '--format=%s'), 'acme/app: team claim 001-job'); // published
  assert.equal(git(w.home, 'status', '--short'), '');
  assert.match(w.config().teams_file_sha, /^[0-9a-f]{64}$/);
});

test('the item is found by number or by slug, an archived one too (and refused by the step); --json prints the raw payload and nothing else', t => {
  const w = seeded(t, [item(1), item(2, {}, { archived: true }), item(3)]);
  const r = update(w, '001-job', 'claim', [...BASE, '--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { item: 1, step: 'claim', rule: 'claim', changes: { status: ['ready', 'in progress'], holder: ['', 'member-1'] }, related: {}, say: '' });
  const archived = update(w, '2', 'claim');
  assert.equal(archived.status, 1);
  assert.equal(archived.stdout, '❌ item 2 is archived; archived items take no step\n');
  assert.equal(update(w, '3', 'claim', ['--team', 'parallel', '--agent', 'member-2']).stdout, '✅ 003-job: claim (rule claim)\n   status: ready -> in progress\n   holder: "" -> member-2\n');
});

test('no such item: exit 1 on standard output, nothing written; a number two items hold is exit 2 naming both', t => {
  const w = seeded(t, [item(1), { ...item(7), slug: '007-a' }, { ...item(7), slug: '007-b' }]);
  const before = snapshot(w.home);
  for (const ident of ['99', 'ghost']) {
    const r = update(w, ident, 'claim');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(r.stdout, `❌ no item ${ident}\n`);
    assert.equal(r.stderr, '');
  }
  const two = update(w, '7', 'claim');
  assert.equal(two.status, 2, two.stdout + two.stderr);
  assert.equal(two.stderr, '❌ backlog: number 7 names two items, 007-a and 007-b; name the item by its slug\n');
  assert.deepEqual(snapshot(w.home), before);
  assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
});

test('a refusal prints its text with the rule id on standard output, exits 1 and writes nothing: no item, no SHA, a clean clone', t => {
  const w = seeded(t, [item(1, { status: 'new' })]);
  const before = snapshot(w.home); const head = git(w.home, 'rev-parse', 'HEAD');
  const r = update(w, '1', 'claim');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '❌ only a ready item is claimed (item 1 is new) (rule claim-not-ready)\n');
  assert.equal(r.stderr, '');
  assert.deepEqual(snapshot(w.home), before);
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), head);
  assert.equal(git(w.home, 'status', '--short'), '');
  assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
});

test('the step word: one no rule names is exit 2 with the team\'s steps; a rule for every step names none; the step is the second word, so no option names it', t => {
  const w = seeded(t);
  const r = update(w, '1', 'bogus');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stderr, `❌ backlog: team parallel has no step bogus (steps: ${stepNames(ENTRY).join(', ')})\n`);
  assert.equal(r.stdout, '');
  assert.ok(!stepNames(ENTRY).includes('*') && stepNames(ENTRY).includes('new') && stepNames(ENTRY).includes('hand-to-check'));
  assert.deepEqual(stepNames({ rules: { table: [{ id: 'a', step: ['y', '*'], deny: 'no' }, { id: 'b', step: '*', deny: 'no' }, { id: 'c', step: 'x', do: {} }, { id: 'd', step: 'y', do: {} }] } }), ['new', 'x', 'y']); // sorted, `*` is no step
  const old = update(w, '1', '--claim');
  assert.equal(old.status, 2); assert.match(old.stderr, /^❌ backlog: /);
  assert.equal(git(w.home, 'status', '--short'), '');
});

test('an argument the step does not take is exit 2 with the list of what it takes; a value that does not fit its field is exit 2 from the rules; a repeated argument takes the last value', t => {
  const w = seeded(t);
  const r = update(w, '1', 'claim', [...BASE, '--bogus', 'x']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stderr, '❌ backlog: the step claim of team parallel takes no --bogus (it takes: no argument)\n');
  const rel = update(w, '1', 'release', [...BASE, '--note', 'first', '--note', 'second']); // the holder is empty: refused, but the arguments were accepted
  assert.equal(rel.status, 1, rel.stdout + rel.stderr);
  assert.equal(update(w, '1', 'claim').status, 0);
  const done = update(w, '1', 'release', [...BASE, '--note', 'first', '--note', 'second']);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  assert.match(doc(w, 1).body, /## Released \(member-1, [^)]+\)\n\nsecond\n$/);
  assert.equal(doc(w, 1).history.at(-1).note, 'second');
});

test('the words and flags the command does not take: no item and no step, a third word, --ask, --dry-run and --show-all (without --team) are exit 2 on standard error', t => {
  const w = seeded(t);
  const before = snapshot(w.home);
  for (const args of [[], ['1'], ['1', 'claim', 'extra', ...BASE], ['1', 'claim', ...BASE, '--ask'], ['1', 'claim', ...BASE, '--dry-run']]) {
    const r = w.run(args, {}, 'update');
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^❌ backlog: (team update needs an item and a step|unrecognized arguments)/);
  }
  const all = w.run(['1', 'claim', '--agent', 'member-1', '--show-all'], {}, 'update');
  assert.equal(all.status, 2); assert.match(all.stderr, /--show-all acts over every team; backlog team update acts for one team/);
  assert.deepEqual(snapshot(w.home), before);
});

test('the inputs: no team, no agent, a repository that is no owner/name, and a variable for each', t => {
  const w = seeded(t);
  const none = w.run(['1', 'claim', '--agent', 'member-1'], {}, 'update');
  assert.equal(none.status, 2); assert.match(none.stderr, /a team command needs a team/);
  const noAgent = w.run(['1', 'claim', '--team', 'parallel'], {}, 'update');
  assert.equal(noAgent.status, 2); assert.match(noAgent.stderr, /this team command needs the agent/);
  const bad = w.run(['1', 'claim', ...BASE, '--repository', 'nonsense'], {}, 'update');
  assert.equal(bad.status, 2); assert.match(bad.stderr, /expected owner\/name/);
  const viaEnv = w.run(['1', 'claim'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 'parallel', SMOOTH_BACKLOG_CLI_AGENT: 'member-2' }, 'update');
  assert.equal(viaEnv.status, 0, viaEnv.stdout + viaEnv.stderr);
  assert.equal(doc(w, 1).fields.holder, 'member-2');
});

test('the caller is --agent as it is: a flag against a different variable is not checked, and the config `user` key is never the agent', t => {
  const w = seeded(t);
  writeFileSync(join(w.cons, '.backlog', 'config.json'), '{"user": "member-3", "team": "parallel"}\n');
  const noAgent = w.run(['1', 'claim'], {}, 'update');
  assert.equal(noAgent.status, 2); assert.match(noAgent.stderr, /this team command needs the agent/); // the team came from the configuration, the agent did not
  const r = w.run(['1', 'claim', '--agent', 'member-1'], { SMOOTH_BACKLOG_CLI_AGENT: 'member-2' }, 'update');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(doc(w, 1).fields.holder, 'member-1');
});

test('a team without an entry in the file is exit 1; a file that fails validation in any entry stops the command: exit 2, nothing written, no SHA', t => {
  const w = seeded(t);
  const ghost = update(w, '1', 'claim', ['--team', 'ghost', '--agent', 'a']);
  assert.equal(ghost.status, 1, ghost.stdout + ghost.stderr);
  assert.match(ghost.stderr, /^❌ backlog: team ghost has no entry in /);
  const bad = seeded(t, [item(1)], { ...PARALLEL, ops: { ...ENTRY, rules: { ...ENTRY.rules, table: [{ id: 'bad', step: 'new', do: { set: { status: 'shipped' } } }] } } });
  const before = snapshot(bad.home);
  const r = update(bad, '1', 'claim');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /ops/);
  assert.deepEqual(snapshot(bad.home), before);
  assert.equal(existsSync(join(bad.cons, '.backlog', 'config.json')), false);
});

test('an item of another team and an item without a team the rule does not bind are refused by the engine, nothing written', t => {
  const w = seeded(t, [item(1, {}, { team: 'other' }), item(2, {}, { team: '' })]);
  const other = update(w, '1', 'claim');
  assert.equal(other.status, 1);
  assert.equal(other.stdout, '❌ item 1 belongs to team other; team parallel acts only on its own items and on items without a team\n');
  const none = update(w, '2', 'claim');
  assert.equal(none.status, 1);
  assert.match(none.stdout, /^❌ item 2 belongs to no team; only a rule that binds it to team parallel may change it/);
  assert.equal(git(w.home, 'status', '--short'), '');
});

test('a related item is changed in the same commit and printed on its own line; the json lists it by number', t => {
  const teams = { parallel: { ...ENTRY, rules: { ...ENTRY.rules, table: [ENTRY.rules.table[0], { id: 'bump', step: 'bump', do: { set: { estimate: 9 }, related: [{ items: '$item.parent', set: { estimate: 1 } }] } }, ...ENTRY.rules.table.slice(1)] } } };
  const w = seeded(t, [item(1, { children: [2] }), item(2, { parent: 1 })], teams);
  const r = update(w, '2', 'bump');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ 002-job: bump (rule bump)\n   estimate: 5 -> 9\n   item 1: estimate: 5 -> 1\n');
  assert.deepEqual([doc(w, 1).fields.estimate, doc(w, 2).fields.estimate], [1, 9]);
  assert.deepEqual(git(w.home, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(p => p.startsWith('acme/app/phases')).sort(), ['acme/app/phases/001-job.json', 'acme/app/phases/002-job.json']);
  assert.equal(doc(w, 1).history.at(-1).step, 'bump');
  const j = update(w, '2', 'bump', [...BASE, '--json']);
  assert.deepEqual(JSON.parse(j.stdout).related, { 1: {} }); // nothing changed the second time: the related item is named, with no change
});

test('the say text of the rule is printed after the lines, and is the "say" of --json', t => {
  const teams = { parallel: { ...ENTRY, rules: { ...ENTRY.rules, table: ENTRY.rules.table.map(r => (r.id === 'claim' ? { ...r, do: { ...r.do, say: 'work on {$item.slug}' } } : r)) } } };
  const w = seeded(t, [item(1), item(2)], teams);
  assert.equal(update(w, '1', 'claim').stdout, '✅ 001-job: claim (rule claim)\n   status: ready -> in progress\n   holder: "" -> member-1\nwork on 001-job\n');
  assert.equal(JSON.parse(update(w, '2', 'claim', ['--team', 'parallel', '--agent', 'member-2', '--json']).stdout).say, 'work on 002-job');
});

test('a refused push: exit 3, the folder byte-identical, the SHA not persisted; a later run publishes', t => {
  const w = seeded(t);
  const before = snapshot(w.home);
  w.refuse();
  const r = update(w, '1', 'claim');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /The change was not published/);
  assert.equal(r.stdout, '');
  assert.deepEqual(snapshot(w.home), before);
  assert.equal(git(w.home, 'status', '--short'), '');
  assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
  rmSync(join(w.bare, 'hooks', 'pre-receive'));
  assert.equal(update(w, '1', 'claim').status, 0);
  assert.match(w.config().teams_file_sha, /^[0-9a-f]{64}$/);
});

test('a refused push with the backlog inside the code repository: exit 3, the folder and the lead\'s uncommitted team file as before, no commit left', t => {
  const w = inside(t);
  putItem(w.folder, { ...item(1), repository: 'local/repository' }, ENTRY);
  git(w.ra, 'add', '-A'); git(w.ra, 'commit', '-qm', 'item'); git(w.ra, 'push', '-q');
  const edited = JSON.stringify({ ...PARALLEL, draft: ENTRY });
  writeFileSync(w.teamFile, edited);
  const head = git(w.ra, 'rev-parse', 'HEAD'); const item1 = readFileSync(fileOf(w.folder, 1), 'utf8');
  w.refuse();
  const r = w.run(['1', 'claim', ...BASE], {}, 'update');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.equal(git(w.ra, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(fileOf(w.folder, 1), 'utf8'), item1);
  assert.equal(readFileSync(w.teamFile, 'utf8'), edited);
});

test('a failed pull (the backlog\'s origin unreachable): exit 3 before the rules are read, nothing written', t => {
  const w = seeded(t);
  const away = `${w.bare}.away`;
  renameSync(w.bare, away);
  const before = snapshot(w.home);
  for (const step of ['claim', 'release']) { // an allowed step and one the rules would refuse: the pull comes first
    const r = update(w, '1', step);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^❌ backlog: /);
  }
  assert.deepEqual(snapshot(w.home), before);
  assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
  renameSync(away, w.bare);
  assert.equal(update(w, '1', 'claim').status, 0);
});

// A second clone (rb) publishes into the folder while the command pushes from ra: the hook runs once, before the first push.
function otherPublishes(w, edit) {
  const marker = join(w.dir, 'done');
  const hook = join(w.ra, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE\n[ -e '${marker}' ] && exit 0\ntouch '${marker}'\ncd '${w.rb}' && git pull -q --rebase && ${edit} && git add -A && git commit -qm other && git push -q\n`);
  chmodSync(hook, 0o755);
}
const insideWith = (t, items) => {
  const w = inside(t);
  for (const i of items) putItem(w.folder, { ...i, repository: 'local/repository' }, ENTRY);
  git(w.ra, 'add', '-A'); git(w.ra, 'commit', '-qm', 'items'); git(w.ra, 'push', '-q');
  git(w.rb, 'pull', '-q');
  return w;
};

test('another clone publishes first and changes the item: the step runs again on the new files; refused there, nothing is published and the refusal is printed', t => {
  const w = insideWith(t, [item(1)]);
  const file = join(w.rb, '.backlog', 'local', 'repository', 'phases', '001-job.json');
  otherPublishes(w, `node -e "const f=process.argv[1],fs=require('fs'),d=JSON.parse(fs.readFileSync(f));d.fields.status='new';fs.writeFileSync(f,JSON.stringify(d))" '${file}'`);
  const r = w.run(['1', 'claim', ...BASE], {}, 'update');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '❌ only a ready item is claimed (item 1 is new) (rule claim-not-ready)\n');
  assert.equal(JSON.parse(readFileSync(fileOf(w.folder, 1), 'utf8')).fields.status, 'new'); // the upstream file, not ours
  assert.deepEqual(git(w.bare, 'log', '--format=%s', '-2').split('\n'), ['other', 'items']);
  assert.equal(git(w.ra, 'status', '--short', '-uall').includes('phases'), false);
});

test('another clone publishes first and changes an item the step writes to: the step runs again on the new files and the output is the run on those files', t => {
  const teams = { parallel: { ...ENTRY, rules: { ...ENTRY.rules, table: [ENTRY.rules.table[0], { id: 'bump', step: 'bump', do: { set: { estimate: 9 }, related: [{ items: '$item.parent', set: { estimate: 1 } }] } }, ...ENTRY.rules.table.slice(1)] } } };
  const w = inside(t, teams);
  for (const i of [item(1, { children: [2], estimate: 5 }), item(2, { parent: 1 })]) putItem(w.folder, { ...i, repository: 'local/repository' }, ENTRY);
  git(w.ra, 'add', '-A'); git(w.ra, 'commit', '-qm', 'items'); git(w.ra, 'push', '-q'); git(w.rb, 'pull', '-q');
  const file = join(w.rb, '.backlog', 'local', 'repository', 'phases', '001-job.json');
  otherPublishes(w, `node -e "const f=process.argv[1],fs=require('fs'),d=JSON.parse(fs.readFileSync(f));d.fields.estimate=7;fs.writeFileSync(f,JSON.stringify(d))" '${file}'`);
  const r = w.run(['2', 'bump', ...BASE], {}, 'update');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✅ 002-job: bump (rule bump)\n   estimate: 5 -> 9\n   item 1: estimate: 7 -> 1\n'); // the related item as the other clone left it
  assert.deepEqual(git(w.bare, 'log', '--format=%s', '-3').split('\n'), ['backlog: team bump 002-job', 'other', 'items']);
});

test('another clone publishes first and removes the item: the re-run finds no item, exit 1, nothing of ours published', t => {
  const w = insideWith(t, [item(1), item(2)]);
  otherPublishes(w, `rm '${join(w.rb, '.backlog', 'local', 'repository', 'phases', '001-job.json')}'`);
  const r = w.run(['1', 'claim', ...BASE], {}, 'update');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '❌ no item 1\n');
  assert.equal(git(w.bare, 'log', '-1', '--format=%s'), 'other');
});

test('dispatch level: the update route installs no seam (the old routes do)', t => {
  const w = seeded(t); // a child process: the runner reports through this process's standard output, which a test must not replace
  const code = `import { seam } from ${JSON.stringify(new URL('../../src/shared/seam.js', import.meta.url).href)}; import * as teamCli from ${JSON.stringify(new URL('../../src/team/cli.js', import.meta.url).href)};
    const before = seam.entry; const code = await teamCli.run(JSON.parse(process.env.ARGV));
    process.stdout.write('\\n' + JSON.stringify({ before, code, entry: seam.entry, isMember: seam.isMember, also: seam.alsoActive({ status: 'refining', refiner: 'a' }), scope: seam.inScope({}) }));`;
  const env = { ...process.env, ...GIT_IDENTITY, ...w.env, SMOOTH_BACKLOG_CLI_TEAM_NAME: '', SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: '', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: '', ARGV: JSON.stringify(['update', '1', 'claim', ...BASE]) };
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: w.cons, encoding: 'utf8', env, timeout: CHILD_TIMEOUT });
  assert.equal(r.status, 0, r.stderr);
  const cut = r.stdout.lastIndexOf('\n'); const out = r.stdout.slice(0, cut); const json = r.stdout.slice(cut + 1);
  assert.match(out, /001-job: claim/);
  assert.deepEqual(JSON.parse(json), { before: null, code: 0, entry: null, isMember: null, also: false, scope: true });
});

test('--help is answered by the router before anything is read, and says the step is the second word', t => {
  const w = world(t, '{ not json');
  const r = w.run(['--help'], {}, 'update');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^backlog team update — /);
  assert.match(r.stdout, /backlog team update <item> <step>/);
  assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
});

// A team whose table also has a step for each place a rule can give: first, last, before and after another item.
const PLACING = { parallel: { ...ENTRY, rules: { ...ENTRY.rules, table: [...ENTRY.rules.table, { id: 'top', step: 'top', do: { place: 'first' } }, { id: 'bottom', step: 'bottom', do: { place: 'last' } },
  { id: 'ahead', step: 'ahead', do: { place: { before: '$arg.target' } } }, { id: 'behind', step: 'behind', do: { place: { after: '$arg.target' } } }] } } };

test('the place a rule gives is where index.json puts the item (first, last, before, after), and no allowed step moves numbers.json', t => {
  const w = seeded(t, [item(1), item(2), item(3), item(4)], PLACING);
  const numbers = join(w.folder, 'numbers.json'); mkdirSync(w.folder, { recursive: true });
  writeFileSync(numbers, `${JSON.stringify({ last: 4 })}\n`);
  writeFileSync(index.file(w.folder), index.text({ branches: { main: [1, 2, 3, 4].map(seq => ({ seq, slug: `00${seq}-job`, name: 'job', status: 'ready' })) } }));
  w.publish('seed the order');
  const order = () => index.read(w.folder).branches.main.map(e => e.seq);
  const was = readFileSync(numbers, 'utf8');
  for (const [seq, name, args, want] of [[3, 'top', [], [3, 1, 2, 4]], [1, 'bottom', [], [3, 2, 4, 1]], [4, 'ahead', ['--target', '2'], [3, 4, 2, 1]], [3, 'behind', ['--target', '1'], [4, 2, 1, 3]]]) {
    const r = update(w, String(seq), name, [...BASE, ...args]);
    assert.equal(r.status, 0, `${name}: ${r.stdout}${r.stderr}`);
    assert.deepEqual(order(), want, name);
    assert.equal(readFileSync(numbers, 'utf8'), was, `${name}: the counter is not moved by a step that makes no item`);
  }
  assert.equal(git(w.home, 'status', '--short'), '');
});

test('a step list with anything but words names no step: the same words for the command and for the check of the rules', () => {
  const entry = { ...ENTRY, rules: { ...ENTRY.rules, table: [{ id: 'a', step: ['kept', 5], do: {} }, { id: 'b', step: ['listed', 'also'], do: {} }] } };
  assert.deepEqual(stepNames(entry), ['also', 'listed', 'new']);
  const found = errors(validate({ parallel: entry })).filter(e => /step must be a word/.test(e.problem));
  assert.deepEqual(found.map(e => e.path), ['rules.table[0].step']); // the check of the rules names the same rule as the one that names no step
});

test('a child that never ends is killed at its timeout and fails its test: both runners of the fixture, the backlog beside the code and inside it', t => {
  const hang = join(world(t).cons, '..', 'hang.cjs');
  writeFileSync(hang, 'setInterval(() => {}, 1000);\n'); // the command ends, the process does not
  for (const w of [seeded(t), insideWith(t, [item(1)])]) {
    const started = Date.now();
    const r = w.run(['1', 'claim', ...BASE], { NODE_OPTIONS: `--require ${hang}` }, 'update', 4000);
    assert.ok(r.status === -1 || r.status === null, `killed, no status: ${r.status}`);
    assert.ok(Date.now() - started < 30000, 'killed at the timeout the runner was given');
  }
});

test('--json redacts each value, never the serialized text: a URL value then an email value keep every key', t => {
  const w = seeded(t, [item(1, { status: 'in progress', holder: 'member-1', handoff: 'https://u:p@host.example' })]);
  const r = update(w, '1', 'hand-to-check', [...BASE, '--note', 'a@b.example', '--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), ['item', 'step', 'rule', 'changes', 'related', 'say']);
  assert.deepEqual(out.changes.handoff, ['https://host.example', 'a@b.example']);
  assert.deepEqual(Object.keys(out.changes), ['status', 'handoff']);
  assert.ok(!r.stdout.includes('u:p@'), r.stdout);
});
