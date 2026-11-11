// Tests for the backlog CLI as the team members' only view of the backlog: `backlog show <item>` shows the whole item, `backlog work --agent <you>` gives the one next action
// marked as the agent's with the whole item, the hand-off, a changes verdict and a close end the agent's session, and in a
// team session a member acts only as itself while only the lead reassigns another agent's work. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storedFm } from '../../src/shared/item-file.js';
import { cli, consumer, itemPath, sharedBacklog, readItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-work-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({
    t1: { lead: 'lead', members: ['ann', 'bob', 'zed'], review: [{ team: 't1', count: 1 }, { team: 'reviewers', count: 1 }], refinement_review: [{ team: 'reviewers', count: 1 }] },
    reviewers: { lead: 'rex', members: ['rex', 'ria'] },
    t3: { lead: 'lead', members: ['ann', 'bob', 'zed'], review: [{ stage: 'peer', count: 1, anyone: true }] }, // one peer review, as an item of no team had
    t2: { lead: 'lead2', members: ['zed', 'nobody'], review: [] }, // another team, for the tests that ask as one
  }));
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' };
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '', ...LEAD, ...env } };
  const actor = reader(args);
  if (args[0] === 'update') cli(['show', args[1], ...(actor ? ['--agent', actor] : [])], o); // read before the write, as the acting agent or the env actor (seen.js)
  if (args[0] === 'new') { const i = args.indexOf('--split-from'); if (i > -1) cli(['show', args[i + 1]], o); } // the split reads the parent's refinement state; the env actor's view of it must be fresh (seen.js)
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase ')[1].split(' ')[0];
const fm = (f, slug) => readItem(itemPath(f.folder, slug)).fm;
// a team item is refined (a member, the lead's review request, a reviewer's pass) before anyone claims it
const refined = (f, slug) => [['--refine-start', '--by', 'rfn'], ['--refine-done', '--by', 'rfn', '--note', 'refined'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']].forEach(a => ok(f, ['update', slug, ...a]));
const TM = agent => ({ SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_AGENT: agent }); // a team session of the agent
test('query --phase shows the whole item: the row, every front matter field and the body', () => {
  const f = fixture();
  const s = make(f, 'whole item');
  const j = JSON.parse(ok(f, ['show', s, '--json']).stdout);
  assert.equal(j.slug, s);
  assert.deepEqual(j.front_matter, storedFm(fm(f, s)));
  for (const k of ['review_refs', 'depends_on', 'estimate_min', 'complexity', 'owner']) assert.ok(k in j.front_matter, k);
  assert.ok(j.body.includes('Body of whole item.') && j.body.includes("- [ ] the test's check holds"), j.body);
  assert.deepEqual(JSON.parse(ok(f, ['show', s]).stdout), j); // the text view is the same object
});


