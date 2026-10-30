// Tests for item 038, the hand-off lock (spec 2026-10-28-pr1-learnings.md section 7; PR1 lib_db.mark_handoff,
// pending_handoff, restarting): a review request or a close by a member of a team writes
// ~/.qwen/teams/<team>/handoff/<agent>.json, and until Qwen registers a newer session of that agent (config.json
// members[].joinedAt) the agent's pop and work answer stop and its claim, refine-start and start-review are refused.
// HOME is a temporary folder: the real ~/.qwen/teams is never read or written. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-handoff-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const user = join(t, 'user'); // HOME: the team folders live under it
  const tdir = join(user, '.qwen', 'teams', 't1');
  mkdirSync(tdir, { recursive: true });
  return { t, home, cons, user, tdir, folder: join(home, 'acme', 'demo') };
}
const config = (f, members) => writeFileSync(join(f.tdir, 'config.json'), JSON.stringify({ name: 't1', leadAgentId: 'lead@t1', members }));
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { TEAM_LEAD: 'lead', HOME: f.user, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
const teamItem = (f, name) => { const s = make(f, name); ok(f, ['update', s, '--set-team', 't1']); return s; }; // a team work item (no stage): claimable
const pop = (f, agent, env) => JSON.parse(run(f, ['pop', '--agent', agent, '--json'], env).stdout);
const marker = f => join(f.tdir, 'handoff', 'archy.json');
const T1 = { TEAM_NAME: 't1' };

test('a review request writes the marker of PR1, and the member gets stop until a newer session registers', () => {
  const f = fixture();
  config(f, [{ name: 'archy', agentId: 'archy@t1', joinedAt: 1000 }, { name: 'zed', agentId: 'zed@t1', joinedAt: 1000 }]);
  const [a, b, c] = ['first', 'second', 'third'].map(n => teamItem(f, n));
  ok(f, ['update', a, '--claim', 'archy']);
  ok(f, ['update', a, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy']);
  const mk = JSON.parse(readFileSync(marker(f), 'utf8'));
  assert.deepEqual(Object.keys(mk).sort(), ['at_ms', 'seq']);
  assert.equal(mk.seq, Number(a.split('-')[0]));
  assert.ok(Math.abs(mk.at_ms - Date.now()) < 60000);
  for (const env of [T1, {}]) { // with TEAM_NAME its folder, without it every team folder
    const p = pop(f, 'archy', env);
    assert.deepEqual([p.action, p.item], ['stop', null]);
    assert.ok(p.instruction.includes('end your turn now with a text-only reply'), p.instruction);
  }
  const w = JSON.parse(run(f, ['work', '--agent', 'archy', '--json'], T1).stdout);
  assert.deepEqual([w.action, w.marked], ['stop', null]);
  no(f, ['update', b, '--claim', 'archy'], '--claim refused: archy is waiting for its restart');
  ok(f, ['update', c, '--claim', 'zed']);
  ok(f, ['update', c, '--request-review', 'any', '--note', 'commit z', '--by', 'zed']); // zed is locked too now
  no(f, ['update', c, '--start-review', '--by', 'archy'], '--start-review refused: archy is waiting for its restart');
  config(f, [{ name: 'archy', agentId: 'archy@t1', joinedAt: mk.at_ms + 1 }, { name: 'zed', agentId: 'zed@t1', joinedAt: 1000 }]); // the fresh session
  assert.notEqual(pop(f, 'archy', T1).action, 'stop');
  ok(f, ['update', b, '--claim', 'archy']);
});

test('owner 2026-10-30: only a valid marker of a registered member stops it; a missing name, an unreadable config.json or a malformed marker stops nobody', () => {
  const f = fixture();
  config(f, [{ name: 'archy', joinedAt: 1000 }, { name: 'zed', joinedAt: 1000 }]);
  const a = teamItem(f, 'job');
  ok(f, ['update', a, '--claim', 'archy']);
  ok(f, ['update', a, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  rmSync(marker(f)); // as if a fresh session had come and the dispatcher had released it
  ok(f, ['update', a, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/code.md']);
  assert.ok(!existsSync(marker(f))); // a verdict writes none
  ok(f, ['update', a, '--close', '--summary', 'done', '--by', 'archy']); // a close writes it
  const at = JSON.parse(readFileSync(marker(f), 'utf8')).at_ms;
  config(f, [{ name: 'archy', joinedAt: at }]); // a session not newer than the hand-off: the one valid stop
  assert.equal(pop(f, 'archy', T1).action, 'stop');
  const roster = join(f.t, 'team.json');
  writeFileSync(roster, JSON.stringify({ archy: {}, zed: {} }));
  for (const [cfg, mk] of [[null, null], ['{ not json', null], [[], null], [[{ name: 'archy', joinedAt: 1 }], 'garbage'], [[{ name: 'archy', joinedAt: 1 }], '{"at_ms":"bad","seq":1}'], [[{ name: 'archy', joinedAt: 'bad' }], 'VALID'], [[{ name: 'archy', joinedAt: 1 }], 'DIR']]) {
    if (cfg === null) config(f, []); else if (typeof cfg === 'string') writeFileSync(join(f.tdir, 'config.json'), cfg); else config(f, cfg);
    const put = () => { if (mk === 'DIR') { rmSync(marker(f), { force: true, recursive: true }); mkdirSync(marker(f), { recursive: true }); } else if (mk === 'VALID') writeFileSync(marker(f), JSON.stringify({ at_ms: Date.now(), seq: 1 })); else if (mk !== null) writeFileSync(marker(f), mk); };
    put();
    const r = run(f, ['pop', '--agent', 'archy', '--json'], T1);
    assert.notEqual(JSON.parse(r.stdout).action, 'stop', JSON.stringify([cfg, mk]));
    assert.match(r.stderr, /stops nobody/, JSON.stringify([cfg, mk])); // every case is named
    const w = run(f, ['work', '--agent', 'archy', '--json'], T1);
    assert.notEqual(JSON.parse(w.stdout).action, 'stop');
    assert.match(w.stderr, /stops nobody/); // work passes the warning on
    const wj = JSON.parse(w.stdout);
    if (wj.action === 'claim') ok(f, ['update', wj.item, '--release', 'archy'], T1); // give back what work claimed
    const [mine, theirs] = ['claim job', 'review job'].map(n => teamItem(f, n));
    ok(f, ['update', mine, '--claim', 'archy'], T1); // no claim refusal
    ok(f, ['update', mine, '--release', 'archy'], T1);
    const plan = JSON.parse(run(f, ['query', '--plan', '--roster', roster, '--agents', 'archy', '--json'], T1).stdout);
    assert.ok(plan.some(e => e.member === 'archy'), JSON.stringify(plan)); // the plan does not leave archy out
    ok(f, ['update', theirs, '--claim', 'zed'], T1);
    ok(f, ['update', theirs, '--request-review', 'any', '--note', 'n', '--by', 'zed'], T1);
    ok(f, ['update', theirs, '--start-review', '--by', 'archy'], T1); // no start-review refusal
    ok(f, ['update', theirs, '--review', 'pass', '--by', 'archy', '--comments', 'ok per references/review/code.md'], T1); // archy is free again
    ok(f, ['update', theirs, '--close', '--summary', 'x', '--by', 'zed'], T1); // and zed too
    if (cfg === null) config(f, []); else if (typeof cfg === 'string') writeFileSync(join(f.tdir, 'config.json'), cfg); else config(f, cfg); // zed's hand-off may have rewritten nothing, but keep the case
    put();
    const w2 = teamItem(f, 'work item');
    const child = make(f, 'child', '--split-from', w2);
    ok(f, ['update', child, '--refine-start', '--by', 'archy'], T1); // no refine-start refusal
    ok(f, ['update', child, '--refine-done', '--by', 'archy', '--note', 'x'], T1);
  }
});
test('no marker for the lead, for a member still active on another item, or for an item without a team', () => {
  const f = fixture();
  config(f, [{ name: 'archy', joinedAt: 1000 }]);
  const [a, b] = ['one', 'two'].map(n => teamItem(f, n));
  ok(f, ['update', a, '--claim', 'archy']);
  ok(f, ['update', b, '--claim', 'archy', '--force']); // archy holds two active items
  ok(f, ['update', a, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  assert.ok(!existsSync(marker(f))); // b is still active: archy keeps its session
  const l = teamItem(f, "lead's item");
  ok(f, ['update', l, '--claim', 'lead']);
  ok(f, ['update', l, '--request-review', 'any', '--note', 'x', '--by', 'lead']);
  assert.ok(!existsSync(join(f.tdir, 'handoff', 'lead.json'))); // the lead is no member
  const plain = make(f, 'no team');
  ok(f, ['update', plain, '--claim', 'zed']);
  ok(f, ['update', plain, '--request-review', 'any', '--note', 'x', '--by', 'zed']);
  assert.ok(!existsSync(join(f.tdir, 'handoff', 'zed.json')));
  assert.notEqual(pop(f, 'lead', T1).action, 'stop'); // the lead is never locked
});

test('the marker is the one PR1 reads: lib_db.restarting sees the lock the CLI wrote, and the CLI the one PR1 wrote', t => {
  const scripts = process.env.SMOOTH_BACKLOG_SCRIPTS || join(process.env.HOME || '', 'git', 'smoothsdlc-backlog', 'skill', 'backlog', 'scripts');
  const pyRestarting = (f, agent) => spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(scripts)}); import lib_db as L; print(L.restarting(${JSON.stringify(agent)}))`],
    { encoding: 'utf8', env: { ...process.env, HOME: f.user, TEAM_NAME: 't1' } });
  const f = fixture();
  config(f, [{ name: 'archy', joinedAt: 1000 }]);
  if (!existsSync(join(scripts, 'lib_db.py')) || spawnSync('python3', ['-c', 'import yaml'], { stdio: 'ignore' }).status !== 0) {
    return t.skip('the PR1 oracle is not here (SMOOTH_BACKLOG_SCRIPTS) or PyYAML is missing');
  }
  const probe = pyRestarting(f, 'archy');
  assert.equal(probe.status, 0, probe.stderr); // an oracle that is here but broken fails the test
  assert.equal(probe.stdout.trim(), 'False');
  const a = teamItem(f, 'job');
  ok(f, ['update', a, '--claim', 'archy']);
  ok(f, ['update', a, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  assert.equal(pyRestarting(f, 'archy').stdout.trim(), 'True'); // the CLI's marker locks PR1's dispatcher view
  const w = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(scripts)}); import lib_db as L; L.mark_handoff('t1', 'zed', 7)`],
    { encoding: 'utf8', env: { ...process.env, HOME: f.user } });
  config(f, [{ name: 'archy', joinedAt: 1000 }, { name: 'zed', joinedAt: 1000 }]);
  const w2 = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(scripts)}); import lib_db as L; L.mark_handoff('t1', 'zed', 7)`],
    { encoding: 'utf8', env: { ...process.env, HOME: f.user } });
  assert.equal(w.status + w2.status, 0, w.stderr + w2.stderr);
  assert.equal(pop(f, 'zed', T1).action, 'stop'); // PR1's marker locks the CLI's pop
});

test('an invalid time stamp stops nobody; the lead is never stopped; a lead closing a member\'s item stops nobody', () => {
  const f = fixture();
  config(f, [{ name: 'archy', joinedAt: 1000 }, { name: 'lead', joinedAt: 1000 }, { name: 'zed', joinedAt: 1000 }]);
  const [a, l, z] = ['job', "lead's job", "zed's job"].map(n => teamItem(f, n));
  ok(f, ['update', a, '--claim', 'archy']);
  ok(f, ['update', a, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  config(f, [{ name: 'archy', joinedAt: 'bad' }, { name: 'lead', joinedAt: 1000 }, { name: 'zed', joinedAt: 1000 }]);
  assert.notEqual(pop(f, 'archy', T1).action, 'stop'); // an invalid joinedAt: no registered session to wait for
  ok(f, ['update', l, '--claim', 'lead']);
  ok(f, ['update', l, '--request-review', 'any', '--note', 'x', '--by', 'lead']);
  assert.ok(!existsSync(join(f.tdir, 'handoff', 'lead.json'))); // the lead, even when it is listed among the members
  writeFileSync(join(f.tdir, 'handoff', 'lead.json'), JSON.stringify({ at_ms: Date.now() + 1e9, seq: 1 }));
  assert.notEqual(pop(f, 'lead', T1).action, 'stop'); // and never stopped
  ok(f, ['update', z, '--claim', 'zed']);
  ok(f, ['update', z, '--request-review', 'any', '--note', 'x', '--by', 'zed']);
  rmSync(join(f.tdir, 'handoff', 'zed.json')); // zed has had its fresh session
  ok(f, ['update', z, '--review', 'pass', '--by', 'archy', '--comments', 'fine per references/review/code.md']);
  ok(f, ['update', z, '--close', '--summary', 'closed for zed', '--by', 'lead']); // the lead closes when the claimer has not
  assert.ok(!existsSync(join(f.tdir, 'handoff', 'zed.json'))); // a lead's close stops nobody
});
test('--refine-start is refused while the member waits for its restart, and . or .. is no team folder', () => {
  const f = fixture();
  config(f, [{ name: 'archy', joinedAt: 1000 }]);
  const w = teamItem(f, 'work item');
  const c = make(f, 'child', '--split-from', w);
  mkdirSync(join(f.tdir, 'handoff'), { recursive: true });
  writeFileSync(join(f.tdir, 'handoff', 'archy.json'), JSON.stringify({ at_ms: Date.now(), seq: 9 }));
  no(f, ['update', c, '--refine-start', '--by', 'archy'], '--refine-start refused: archy is waiting for its restart');
  for (const name of ['.', '..']) assert.notEqual(pop(f, 'archy', { TEAM_NAME: name }).action, 'stop', name); // looked up nowhere
});

test('no marker without a registered session to replace: an unreadable config.json, an invalid time stamp, an agent outside the team', () => {
  const f = fixture();
  config(f, [{ name: 'archy', joinedAt: 1000 }]);
  const [a, b] = ['one', 'two'].map(n => teamItem(f, n));
  ok(f, ['update', a, '--claim', 'archy']);
  writeFileSync(join(f.tdir, 'config.json'), '{ broken');
  ok(f, ['update', a, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  assert.ok(!existsSync(marker(f)));
  config(f, [{ name: 'archy', joinedAt: [9999999999999] }]);
  ok(f, ['update', b, '--claim', 'archy']);
  ok(f, ['update', b, '--request-review', 'any', '--note', 'y', '--by', 'archy']);
  assert.ok(!existsSync(marker(f)));
  config(f, [{ name: 'zed', joinedAt: 1000 }]); // archy is not registered: Claude or Codex working the team's item
  const c = teamItem(f, 'three');
  ok(f, ['update', c, '--claim', 'claude']);
  ok(f, ['update', c, '--request-review', 'any', '--note', 'z', '--by', 'claude']);
  assert.ok(!existsSync(join(f.tdir, 'handoff', 'claude.json')));
});
test('a marker that cannot be written refuses the hand-off; a hand-off that is not published leaves no lock; the shutdown line is last', () => {
  const f = fixture();
  config(f, [{ name: 'archy', agentId: 'archy@t1', joinedAt: 1000 }]);
  const [a, b] = ['first', 'second'].map(n => teamItem(f, n));
  ok(f, ['update', a, '--claim', 'archy']);
  mkdirSync(join(f.tdir, 'handoff'), { recursive: true });
  chmodSync(join(f.tdir, 'handoff'), 0o555); // no marker there, and none can be written
  no(f, ['update', a, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy'], 'the hand-off marker of archy cannot be written');
  assert.equal(JSON.parse(run(f, ['query', '--phase', a, '--agent', 'archy', '--json']).stdout).front_matter.review_state, 'none');
  chmodSync(join(f.tdir, 'handoff'), 0o755);
  const bare = spawnSync('git', ['-C', f.home, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
  const hook = join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const r = run(f, ['update', a, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy']);
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!existsSync(marker(f)), 'an unpublished hand-off locks nobody');
  assert.ok(!r.stdout.includes('END THE SESSION NOW'), r.stdout);
  rmSync(hook);
  const done = ok(f, ['update', a, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy']);
  assert.ok(existsSync(marker(f)));
  const lines = done.stdout.trim().split('\n');
  assert.ok(lines.at(-1).includes('archy: END THE SESSION NOW'), done.stdout); // the shutdown instruction is the last line, after the publication
  void b;
});

test('a marker that cannot be read stops nobody; a failed publication sets aside only the marker it wrote', async () => {
  const f = fixture();
  config(f, [{ name: 'archy', agentId: 'archy@t1', joinedAt: 5000 }]);
  teamItem(f, 'work');
  mkdirSync(marker(f), { recursive: true }); // EISDIR: no marker text to read
  assert.notEqual(pop(f, 'archy', T1).action, 'stop');
  rmSync(marker(f), { recursive: true });
  const home = process.env.HOME;
  process.env.HOME = f.user;
  try {
    const team = await import('../../src/shared/team.js');
    writeFileSync(marker(f), JSON.stringify({ at_ms: 9000, seq: 2 })); // a later hand-off, from another clone
    team.releaseHandoff('t1', 'archy', JSON.stringify({ at_ms: 8000, seq: 1 }));
    assert.ok(existsSync(marker(f)));
    team.releaseHandoff('t1', 'archy', JSON.stringify({ at_ms: 9000, seq: 2 }));
    assert.ok(!existsSync(marker(f)) && existsSync(join(f.tdir, 'handoff', 'archy.released')));
    rmSync(join(f.tdir, 'handoff', 'archy.released'), { recursive: true, force: true });
    mkdirSync(join(f.tdir, 'handoff', 'archy.released', 'x'), { recursive: true }); // a .released folder: the rename onto it fails
    writeFileSync(marker(f), JSON.stringify({ at_ms: 9100, seq: 3 }));
    team.releaseHandoff('t1', 'archy', JSON.stringify({ at_ms: 9100, seq: 3 }));
    assert.ok(!existsSync(marker(f)), 'the unpublished marker is removed even when it cannot be set aside');
  } finally { process.env.HOME = home; }
});
test('a marker without a whole seq, or a session time stamp too large for a number, stops nobody', () => {
  const f = fixture();
  teamItem(f, 'work');
  mkdirSync(join(f.tdir, 'handoff'), { recursive: true });
  for (const [mk, joined] of [[{ at_ms: 1 }, 0], [{ at_ms: 1, seq: {} }, 0], [{ at_ms: 1, seq: 1 }, '9'.repeat(400)]]) {
    writeFileSync(marker(f), JSON.stringify(mk));
    config(f, [{ name: 'archy', agentId: 'archy@t1', joinedAt: joined }]);
    assert.notEqual(pop(f, 'archy', T1).action, 'stop', JSON.stringify([mk, joined]));
  }
});
test('pop --lead keeps the lock of a member that the default lead name would spare; a locked member\'s second hand-off keeps the first marker', () => {
  const f = fixture();
  config(f, [{ name: 'cody', agentId: 'cody@t1', joinedAt: 1000 }, { name: 'archy', agentId: 'archy@t1', joinedAt: 1000 }]);
  teamItem(f, 'work');
  mkdirSync(join(f.tdir, 'handoff'), { recursive: true });
  writeFileSync(join(f.tdir, 'handoff', 'cody.json'), JSON.stringify({ at_ms: Date.now(), seq: 1 }));
  const r = JSON.parse(run(f, ['pop', '--agent', 'cody', '--lead', 'lead', '--json'], { TEAM_LEAD: '', ...T1 }).stdout);
  assert.equal(r.action, 'stop');
  const [a, b] = ['first', 'second'].map(n => teamItem(f, n));
  ok(f, ['update', a, '--claim', 'archy']);
  ok(f, ['update', b, '--claim', 'archy', '--force']);
  ok(f, ['update', a, '--waiting', 'x', '--by', 'archy']);
  ok(f, ['update', b, '--request-review', 'any', '--note', 'n', '--by', 'archy']);
  const first = readFileSync(marker(f), 'utf8');
  ok(f, ['update', a, '--waiting-done', '--by', 'archy']);
  ok(f, ['update', a, '--request-review', 'any', '--note', 'n', '--by', 'archy']); // locked, and permitted
  assert.equal(readFileSync(marker(f), 'utf8'), first);
});

test('a hand-off that also changes the team writes the marker of the team the item had', () => {
  const f = fixture();
  config(f, [{ name: 'archy', agentId: 'archy@t1', joinedAt: 1000 }]);
  const a = teamItem(f, 'job');
  ok(f, ['update', a, '--claim', 'archy']);
  ok(f, ['update', a, '--set-team', '', '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  assert.ok(existsSync(marker(f)));
});
