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

