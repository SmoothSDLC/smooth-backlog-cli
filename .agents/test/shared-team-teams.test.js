// Tests for teams in the CLI : the team field set and cleared by
// update and new, and the offers (pop, --claimable, --reviewable, --blocked).
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture(prefix = 'team-teams-') {
  const t = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const LEAD = { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' }; // ann, bob and zed are plain members
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } });
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
// a team item is refined (a member, the lead's review request, a reviewer's pass) before anyone claims it or is offered it as work
const refined = (f, slug, cwd = f.cons) => [['--refine-start', '--by', 'rfn'], ['--refine-done', '--by', 'rfn', '--note', 'refined'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']].forEach(a => {
  const r = cli(['update', slug, ...a], { cwd, tmp: f.t, env: LEAD }); assert.equal(r.status, 0, r.stdout + r.stderr);
});
const pop = (f, agent, env) => JSON.parse(run(f, ['team', 'pop', '--team', env?.SMOOTH_BACKLOG_CLI_TEAM_NAME || 't1', '--agent', agent, '--json'], env?.SMOOTH_BACKLOG_CLI_TEAM_NAME ? { SMOOTH_BACKLOG_CLI_AGENT: agent, ...env } : env).stdout); // the team of the session, else t1
test('the lead refines only an incomplete item of its own team', () => {
  const f = fixture();
  const bare = name => { const r = ok(f, ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none']); return r.stdout.split('created phase ')[1].split(' ')[0]; };
  const theirs = bare('t2 incomplete'); // first on the branch
  ok(f, ['update', theirs, '--set-team', 't2']);
  const mine = bare('t1 incomplete');
  ok(f, ['update', mine, '--set-team', 't1']);
  const lead = env => pop(f, 'lead', { ...env, SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main' });
  assert.deepEqual([lead({ SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1' }).action, lead({ SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1' }).item], ['refine', mine]);
  assert.deepEqual([lead({ SMOOTH_BACKLOG_CLI_TEAM_NAME: 't2' }).action, lead({ SMOOTH_BACKLOG_CLI_TEAM_NAME: 't2' }).item], ['refine', theirs]);
  assert.equal(lead({}).item, mine); // --team t1 alone scopes the pop the same: never t2's item
});

