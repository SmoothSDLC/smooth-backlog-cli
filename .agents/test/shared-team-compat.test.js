// Tests for the team views of src/shared/query.js (src/shared/views.js) - cli-parity job 16 (VIEWS), part 1.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, intoTeam, sharedBacklog } from './shared-fixtures.js';
import { parse } from '../../src/shared/frontmatter.js';
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
const run = (f, command, args) => cli([command, ...args], { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: '', BACKLOG_SESSION: '' } });
const ok = (f, ...args) => { const r = run(f, 'update', args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const COMMIT = 'def45678def45678def45678def45678def45678'; // a 40-hex commit for the hand-off records
// a close with a dependent needs a hand-off recorded by the claimer and accepted by the team lead
const handoff = (f, slug, job, claimer) => {
  ok(f, slug, '--request-review', 'any', '--note', 'commit abc1234');
  ok(f, slug, '--review', 'pass', '--by', 'bob', '--comments', 'fine per docs/review/code.md');
  run(f, 'query', ['--phase', slug, '--agent', claimer]);
  ok(f, slug, '--handoff', String(Number(job.split('-')[0])), '--handoff-commit', COMMIT, '--handoff-contract', 'c', '--handoff-verification', 'v', '--by', claimer);
  run(f, 'query', ['--phase', slug, '--agent', 'lead']);
  const r = cli(['update', slug, '--accept-handoff', String(Number(job.split('-')[0])), '--checks', 'verified', '--by', 'lead'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_AGENT: 'lead', BACKLOG_SESSION: '', TEAM_LEAD: 'lead' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
};
const refused = (f, ...args) => { const r = run(f, 'update', args); assert.equal(r.status, 1, r.stdout + r.stderr); return r.stdout; };
const q = (f, ...args) => { const r = run(f, 'team', ['query', '--team', 't1', ...args, '--json']); assert.equal(r.status, 0, r.stdout + r.stderr); return JSON.parse(r.stdout).map(x => x.slug); };
const item = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));

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

test('test_new_item_refusals: refusals at creation, the class options are gone, release only by the holder', () => {
  const f = fixture();
  const count = () => { try { return readdirSync(join(f.folder, 'phases')).length; } catch { return 0; } }; // no folder before the first item
  const base = ['--name', 'x', '--objective', 'o', '--summary', 's'];
  let p = run(f, 'new', base); // outside a team an item needs no --depends-on
  assert.equal(p.status, 0, p.stdout + p.stderr);
  const before = count();
  for (const flag of ['--work-class', '--review-classes']) { // work and review classes are gone
    p = run(f, 'new', [...base, '--depends-on', 'none', flag, 'docs']);
    assert.ok(p.status === 2 && p.stderr.includes('unrecognized arguments'), p.stdout + p.stderr);
  }
  p = run(f, 'new', [...base, '--depends-on', 'no-such-item']);
  assert.ok(p.status === 1 && p.stdout.includes("no item 'no-such-item'"), p.stdout + p.stderr);
  assert.equal(count(), before);
  const s = makeTeam(f, 'released only by its holder', ['--depends-on', 'none']);
  assert.ok(run(f, 'team', ['query', '--team', 't1', '--reviewable']).stderr.includes('--reviewable needs --agent'));
  // after the first item: a refused creation leaves no backlog (and no empty db) behind, and query needs one
  ok(f, s, '--claim', 'bob');
  assert.ok(refused(f, s, '--release', 'ann').includes('claimed by bob, not by ann'));
  ok(f, s, '--release', 'bob');
  assert.equal(item(f, s).fm.claimed_by, ''); // the release cleared the claim
});

test('test_item_without_team_fields_keeps_working: an item written before team work stays visible, and in no team view', () => {
  const f = fixture();
  const s = make(f, 'written before team work', ['--no-review-refs']); // outside a team, --status done finishes it
  const path = join(f.folder, 'phases', `${s}.md`);
  const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer'];
  const { fm, body } = item(f, s);
  store.write({ path, fm: Object.fromEntries(Object.entries(fm).filter(([k]) => !OLD.includes(k))), body }, f.folder); // as an old item looks

  const status = JSON.parse(run(f, 'query', ['--status', '--json']).stdout);
  assert.ok(status.phases.some(p => p.slug === s));
  assert.equal(JSON.parse(run(f, 'query', ['--phase', s]).stdout).slug, s);
  ok(f, s, '--append', 'a note added the old way');
  ok(f, s, '--status', 'in_progress');
  assert.ok(!q(f, '--blocked').includes(s) && !q(f, '--claimable').includes(s)); // in progress, and of no team
  ok(f, s, '--status', 'pending');
  assert.ok(!q(f, '--claimable').includes(s)); // an item of no team is in no team's view
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes('a note added the old way') && !OLD.some(k => text.includes(`\n${k}:`)));
  run(f, 'query', ['--phase', s, '--agent', 'smooth']); // the actor re-reads
  ok(f, s, '--status', 'done', '--by', 'smooth'); // read and write run as the same explicit actor (the CI runner's USER differs)
});

test('test_claim_review_close_lifecycle: the query views along the lifecycle (the part job 15 left out)', () => {
  const f = fixture();
  const first = makeTeam(f, 'dependency first', []);
  const seq = first.split('-')[0];
  const job = makeTeam(f, 'the job', ['--review-refs', 'docs/review/code.md', '--depends-on', seq]);
  assert.ok(q(f, '--blocked').includes(job) && !q(f, '--claimable').includes(job));
  assert.ok(refused(f, job, '--claim', 'bob').includes(`${first} (status ready`)); // dependency not done
  ok(f, first, '--claim', 'ann');
  run(f, 'query', ['--phase', first, '--agent', 'ann']); // the claimer re-reads; the claimer closes, as the same explicit actor
  handoff(f, first, job, 'ann');
  run(f, 'query', ['--phase', first, '--agent', 'ann']); // the claimer re-reads
  ok(f, first, '--close', '--summary', 'tests written', '--by', 'ann');
  assert.ok(!q(f, '--blocked').includes(job));
  assert.ok(q(f, '--claimable').includes(job));

  ok(f, job, '--claim', 'bob');
  ok(f, job, '--request-review', 'any', '--note', 'commit abc1234, deployed evidence in run 13');
  assert.ok(q(f, '--reviewable', '--agent', 'ann').includes(job) && !q(f, '--reviewable', '--agent', 'bob').includes(job)); // any member but the author
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

test('an item with old work_class and review_classes fields behaves exactly like one without them ', () => {
  const f = fixture();
  const plain = makeTeam(f, 'plain job');
  const old = makeTeam(f, 'old job');
  const path = join(f.folder, 'phases', `${old}.md`);
  // as a class-era item looks: the keys are written straight into the file (store.write drops them)
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^---\n/, '---\nwork_class:\n- chunk\n- docs\nreview_classes:\n- security\n'));
  assert.ok(/^work_class:/m.test(readFileSync(path, 'utf8')) && /^review_classes:/m.test(readFileSync(path, 'utf8')), 'the seeded file carries both keys');
  run(f, 'query', ['--phase', old, '--agent', 'me']); // the file changed behind the CLI: read it again before the writes below
  const pop = agent => JSON.parse(run(f, 'team', ['pop', '--team', 't1', '--agent', agent, '--json']).stdout); // team pop claims what it offers
  // the team view of both items is the same but for identity, rank and time stamps
  const IDENTITY = ['id', 'slug', 'seq', 'name', 'objective', 'summary', 'priority', 'path', 'sha', 'created_at', 'updated_at'];
  const rows = JSON.parse(run(f, 'team', ['query', '--team', 't1', '--claimable', '--json']).stdout).map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !IDENTITY.includes(k))));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], rows[0]);
  assert.deepEqual(q(f, '--claimable'), [plain, old]); // both complete and claimable: no class makes either chunk work
  const first = pop('ann');
  assert.deepEqual([first.action, first.item, first.claimed], ['claim', plain, true]);
  const second = pop('eve'); // work_class chunk does not make it a chunk item
  assert.deepEqual([second.action, second.item, second.claimed], ['claim', old, true]);
  for (const s of [plain, old]) {
    ok(f, s, '--request-review', 'any', '--note', 'ready');
    assert.ok(q(f, '--reviewable', '--agent', 'zed').includes(s), s); // any member but the author reviews; no review class counts
  }
});
