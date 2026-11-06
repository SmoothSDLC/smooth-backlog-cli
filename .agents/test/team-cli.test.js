// Tests for `backlog team`: the team steps run under it, the earlier plain spelling still works with a notice, the
// configuration supplies the user and team, and teams and flows are defined from JSON. Local bare repositories only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, createdSlug, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-cli-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { lead: 'lead', members: ['ann', 'bob'], review: [] } }));
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', DOD];
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, notices: true, env: { TEAM_LEAD: 'lead', ...env } });
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
// a refined, ready item of team t1
function ready(f) {
  const s = createdSlug(run(f, ['new', ...NEW('item')]).stdout);
  for (const a of [['--set-team', 't1'], ['--refine-start', '--by', 'ann'], ['--refine-done', '--by', 'ann', '--note', 'r'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'complete', '--by', 'rex', '--comments', 'ok']]) {
    run(f, ['query', '--phase', s, '--agent', a.includes('--by') ? a[a.indexOf('--by') + 1] : 'ann']);
    assert.equal(run(f, ['update', s, ...a]).status, 0);
  }
  return s;
}

test('team update claims for the agent; --team is required', () => {
  const f = fixture();
  const s = ready(f);
  run(f, ['query', '--phase', s, '--agent', 'zz']);
  const missing = run(f, ['team', 'update', s, '--agent', 'ann', '--claim'], { TEAM_NAME: '' });
  assert.equal(missing.status, 2); assert.match(missing.stderr, /--team/);
  assert.equal(fm(f, s).status, 'ready');
  run(f, ['query', '--phase', s, '--agent', 'ann']);
  const c = run(f, ['team', 'update', s, '--team', 't1', '--agent', 'ann', '--claim']);
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.equal(c.stderr, '');
  assert.equal(fm(f, s).status, 'in progress');
  assert.equal(fm(f, s).claimed_by, 'ann');
});

test('the plain update still takes a team step and says where it moved; a status word on a team item is refused', () => {
  const f = fixture();
  const s = createdSlug(run(f, ['new', ...NEW('plain')]).stdout);
  assert.equal(run(f, ['update', s, '--set-team', 't1']).status, 0);
  run(f, ['query', '--phase', s, '--agent', 'ann']);
  const r = run(f, ['update', s, '--refine-start', '--by', 'ann']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /^moved: use backlog team update <item> --team <t> --agent <a> --refine-start$/m);
  const t = run(f, ['team', 'update', s, '--team', 't1', '--agent', 'ann', '--status', 'closed']);
  assert.notEqual(t.status, 0);
  assert.equal(fm(f, s).status, 'refining');
});

test('team update runs a step with the agent and no notice', () => {
  const f = fixture();
  const s = createdSlug(run(f, ['new', ...NEW('step')]).stdout);
  run(f, ['update', s, '--set-team', 't1']);
  run(f, ['query', '--phase', s, '--agent', 'ann']);
  const r = run(f, ['team', 'update', s, '--team', 't1', '--agent', 'ann', '--refine-start']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(fm(f, s).status, 'refining');
  assert.equal(fm(f, s).refiner, 'ann');
});
