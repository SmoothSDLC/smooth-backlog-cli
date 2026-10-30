// Tests for item 038, the hand-off lock (spec 2026-10-28-pr1-learnings.md section 7; PR1 lib_db.mark_handoff,
// pending_handoff, restarting): a review request or a close by a member of a team writes
// ~/.qwen/teams/<team>/handoff/<agent>.json, and until Qwen registers a newer session of that agent (config.json
// members[].joinedAt) the agent's pop and work answer stop and its claim, refine-start and start-review are refused.
// HOME is a temporary folder: the real ~/.qwen/teams is never read or written. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('the lock holds for a missing name, an unreadable config.json and an older session; a malformed marker counts as time 0', () => {
  const f = fixture();
  config(f, [{ name: 'archy', joinedAt: 1000 }, { name: 'zed', joinedAt: 1000 }]);
  const a = teamItem(f, 'job');
  ok(f, ['update', a, '--claim', 'archy']);
  ok(f, ['update', a, '--request-review', 'any', '--note', 'x', '--by', 'archy']);
  rmSync(marker(f)); // as if a fresh session had come and the dispatcher had released it
  ok(f, ['update', a, '--review', 'pass', '--by', 'zed', '--comments', 'fine per references/review/code.md']);
  assert.ok(!existsSync(marker(f))); // a verdict writes none
  ok(f, ['update', a, '--close', '--summary', 'done', '--by', 'archy']); // a close writes it
  assert.ok(existsSync(marker(f)));
  const at = JSON.parse(readFileSync(marker(f), 'utf8')).at_ms;
  config(f, []); // the name is not registered (between its removal and its new spawn)
  assert.equal(pop(f, 'archy', T1).action, 'stop');
  writeFileSync(join(f.tdir, 'config.json'), '{ not json');
  assert.equal(pop(f, 'archy', T1).action, 'stop');
  config(f, [{ name: 'archy', joinedAt: at }]); // not newer than the hand-off
  assert.equal(pop(f, 'archy', T1).action, 'stop');
  writeFileSync(marker(f), 'garbage');
  config(f, [{ name: 'archy', joinedAt: 0 }]);
  assert.equal(pop(f, 'archy', T1).action, 'stop'); // time 0 and a session of time 0: still locked
  config(f, [{ name: 'archy', joinedAt: 5 }]);
  assert.notEqual(pop(f, 'archy', T1).action, 'stop'); // any registered session is newer than time 0
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
  const probe = pyRestarting(f, 'archy');
  if (probe.status !== 0) return t.skip(`the PR1 oracle cannot run here: ${probe.stderr.trim().split('\n').pop()}`);
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
