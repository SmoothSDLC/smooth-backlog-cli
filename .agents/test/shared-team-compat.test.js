// Tests for the team views of src/shared/query.js (src/team/views.js) - cli-parity job 16 (VIEWS), part 1.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, intoTeam, itemPath, sharedBacklog, readItem, readStored } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-compat-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer' }] } })); // t1 asks one peer review of its work
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const run = (f, command, args) => cli([command, ...args], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
const ok = (f, ...args) => { const r = run(f, 'update', args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const COMMIT = 'def45678def45678def45678def45678def45678'; // a 40-hex commit for the hand-off records
// a close with a dependent needs a hand-off recorded by the claimer and accepted by the team lead
const handoff = (f, slug, job, claimer) => {
  ok(f, slug, '--request-review', 'any', '--note', 'commit abc1234');
  ok(f, slug, '--review', 'pass', '--by', 'bob', '--comments', 'fine per docs/review/code.md');
  run(f, 'show', [slug, '--agent', claimer]);
  ok(f, slug, '--handoff', String(Number(job.split('-')[0])), '--handoff-commit', COMMIT, '--handoff-contract', 'c', '--handoff-verification', 'v', '--by', claimer);
  run(f, 'show', [slug, '--agent', 'lead']);
  const r = cli(['update', slug, '--accept-handoff', String(Number(job.split('-')[0])), '--checks', 'verified', '--by', 'lead'], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'lead', SMOOTH_BACKLOG_CLI_SESSION: '', SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
};
const q = (f, ...args) => { const r = run(f, 'team', ['query', '--team', 't1', ...args, '--json']); assert.equal(r.status, 0, r.stdout + r.stderr); return JSON.parse(r.stdout).map(x => x.slug); };
const item = (f, slug) => readItem(itemPath(f.folder, slug));

// conftest.Repos.new: a team item names its review refs, an estimate and a definition of done.
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
function make(f, name, extra = []) {
  const has = k => extra.includes(k);
  const args = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  // A team item names its review documents; the default is docs/review/code.md. '--no-review-refs' (this helper's own flag) makes an item without any.
  const bare = has('--no-review-refs'); extra = extra.filter(x => x !== '--no-review-refs');
  if (!has('--review-refs') && !bare) args.push('--review-refs', 'docs/review/code.md');
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  const r = run(f, 'new', [...args, '--body', DOD, ...extra]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('created phase ')[1].split(' ')[0];
}
const makeTeam = (f, name, extra = []) => intoTeam(make(f, name, extra), { cwd: f.cons, tmp: f.t }); // the team views reach only the items of their team

test('test_item_without_team_fields_keeps_working: an item written before team work stays visible, and in no team view', () => {
  const f = fixture();
  const s = make(f, 'written before team work', ['--no-review-refs']); // outside a team, --status done finishes it
  const path = itemPath(f.folder, s);
  const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer'];
  const { fm, body } = item(f, s);
  store.write({ path, fm: Object.fromEntries(Object.entries(fm).filter(([k]) => !OLD.includes(k))), body }, f.folder); // as an old item looks

  const status = JSON.parse(run(f, 'list', ['--json']).stdout);
  assert.ok(status.phases.some(p => p.slug === s));
  assert.equal(JSON.parse(run(f, 'show', [s]).stdout).slug, s);
  ok(f, s, '--append', 'a note added the old way');
  ok(f, s, '--status', 'in_progress');
  assert.ok(!q(f, '--blocked').includes(s) && !q(f, '--claimable').includes(s)); // in progress, and of no team
  ok(f, s, '--status', 'pending');
  assert.ok(!q(f, '--claimable').includes(s)); // an item of no team is in no team's view
  const stored = readStored(path);
  assert.ok(stored.body.includes('a note added the old way') && !OLD.some(k => Object.hasOwn(stored.fm, k)));
  run(f, 'show', [s, '--agent', 'smooth']); // the actor re-reads
  ok(f, s, '--status', 'done', '--by', 'smooth'); // read and write run as the same explicit actor (the CI runner's USER differs)
});

test('--reviewable needs --agent; the text view lists the item with its dependencies', () => {
  const f = fixture();
  const a = makeTeam(f, 'first', []);
  const b = makeTeam(f, 'second', ['--depends-on', a.split('-')[0]]);
  const r = run(f, 'team', ['query', '--team', 't1', '--reviewable']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, '❌ backlog: --reviewable needs --agent <you> (the author never reviews its own item)\n');
  const text = run(f, 'team', ['query', '--team', 't1', '--blocked']);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, `📋 1 blocked item(s) — acme/demo, branch main, P0 = next:\n   P1   ${b} (ready) — second\n`
    + `        review_refs=docs/review/code.md claimed_by=- review=none estimate=5m complexity=low\n`
    + `        waits on ${a} (status ready, claimed by nobody)\n`);
  const waiting = JSON.parse(run(f, 'team', ['query', '--team', 't1', '--blocked', '--json']).stdout)[0].waiting_on;
  assert.deepEqual(waiting, [{ id: String(Number(a.split('-')[0])), slug: a, status: 'ready', claimed_by: '' }]);
});

