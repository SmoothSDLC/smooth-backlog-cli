// Review rules of a team (teams.json): a team whose work needs one pass by a member of t1 and one by a member of
// reviewers refuses the close until both passes are recorded for the same work commit; a changes verdict clears them.
// Local bare repositories, items made with the CLI in a fixture backlog.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, derivedFm, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'review-rules-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({
    t1: { lead: 'lead', members: ['ann', 'amy'], review: [{ team: 't1', count: 1 }, { team: 'reviewers', count: 1 }] },
    reviewers: { lead: 'rex', members: ['rex', 'ria'] },
  }));
  return { t, cons };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = ['new', '--name', 'ruled item', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--team', 't1',
  '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', `Body.\n\n${DOD}`];
// every call is a session of the team t1 acting as the named agent
const run = (f, who, args) => cli(args, { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main', SMOOTH_BACKLOG_CLI_AGENT: who, SMOOTH_BACKLOG_CLI_SESSION: '' } });
const ok = (f, who, args) => { const r = run(f, who, args); assert.equal(r.status, 0, `${who}: ${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
// the stale-view guard needs each actor's fresh read of the item first
const upd = (f, who, args) => { ok(f, who, ['show', '1', '--agent', who]); return ok(f, who, ['update', '1', ...args]); };
const item = f => { const v = JSON.parse(ok(f, 'ann', ['show', '1', '--json']).stdout); return { ...v, ...derivedFm(v.front_matter) }; };
const close = f => { ok(f, 'ann', ['show', '1', '--agent', 'ann']); return run(f, 'ann', ['update', '1', '--close', '--summary', 'done']); };
const pass = (f, who, verdict = 'pass') => {
  upd(f, who, ['--start-review', '--by', who]);
  upd(f, who, ['--review', verdict, '--by', who, '--comments', 'checked per references/review/code.md']);
};
function ready() {
  const f = fixture();
  ok(f, 'lead', NEW);
  upd(f, 'amy', ['--refine-start', '--by', 'amy']);
  upd(f, 'amy', ['--refine-done', '--by', 'amy', '--note', 'refined']);
  upd(f, 'lead', ['--request-refinement-review', '--by', 'lead']);
  upd(f, 'rex', ['--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']);
  upd(f, 'ann', ['--claim', 'ann']);
  upd(f, 'ann', ['--request-review', 'any', '--note', 'the work', '--by', 'ann']);
  return f;
}

test('the close waits for every review rule of the team on the same work commit', () => {
  const f = ready();
  pass(f, 'amy'); // a member of t1
  const refused = close(f);
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stdout, /review rule not met.*reviewers/);
  upd(f, 'ann', ['--request-review', 'any', '--note', 'for the second rule', '--by', 'ann']);
  pass(f, 'rex'); // a member of reviewers
  assert.equal(item(f).reviews.length, 2);
  assert.equal(close(f).status, 0);
  assert.equal(item(f).status, 'closed');
});

test('a changes verdict clears the passes: the rules run again', () => {
  const f = ready();
  pass(f, 'amy');
  assert.equal([].concat(item(f).reviews).length, 1);
  upd(f, 'ann', ['--request-review', 'any', '--note', 'again', '--by', 'ann']);
  pass(f, 'rex', 'changes');
  assert.deepEqual([].concat(item(f).reviews ?? []).filter(Boolean), []);
  assert.equal(item(f).review_state, 'changes-requested');
  assert.match(close(f).stdout, /review rule not met/);
});
