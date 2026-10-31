// Item 059.4: the offer and claim gate. Claim and every offer treat a done producer whose hand-off is
// not accepted like an unfinished dependency: for missing, unaccepted, stale and rejected, update --claim is
// refused naming the edge state, and pop, work, query --plan, query --claimable and next do not offer the
// dependent; an accepted and a legacy (done, no handoffs key) producer let it be offered and claimed. The
// dependent leads the queue in the unsatisfied cases, so a broken gate offers it first: every command must
// skip it to offer h. Local bare repositories only; the producer's hand-off front matter is written as
// another writer would, committed and pushed in the fixture's backlog clone.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dump, parse } from '../../src/shared/frontmatter.js';
import * as handoff from '../../src/shared/handoff.js';
import { GIT_IDENTITY, cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'handoff-gate-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const LEAD = { TEAM_LEAD: 'lead' };
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } });
const ok = (f, args) => { const r = run(f, args); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const NEW = (name, deps, extra = []) => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', deps,
  '--body', '## Definition of done\n\n- [ ] it holds', ...extra];
const make = (f, name, deps, extra = []) => ok(f, NEW(name, deps, extra)).stdout.split('created phase phases/')[1].split('.md')[0];
// A member item the offers accept: review documents and an estimate, or the views and the claim leave it out.
const COMPLETE = ['--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low'];
// The hand-off front matter as another writer would store it: lists of encode(...) strings, committed and pushed
// in the fixture's backlog clone.
function setFront(f, slug, keys) {
  const file = join(f.folder, 'phases', `${slug}.md`); const d = parse(readFileSync(file, 'utf8'));
  writeFileSync(file, dump({ ...d.fm, ...keys }, d.body));
  for (const a of [['commit', '-qam', `test: ${slug}`], ['push', '-q', 'origin', 'HEAD']]) {
    const p = spawnSync('git', a, { cwd: f.home, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
    assert.equal(p.status, 0, p.stderr);
  }
}
const hex = n => n.toString(16).padStart(40, '0');
// The producer closed, then its hand-off front matter (stored form) set per the edge state under test.
function producerDone(f, p, state, depSeq) {
  ok(f, ['update', p, '--status', 'done', '--by', 'tester']);
  if (state === 'legacy') return; // closed before the rule: done, no handoffs key
  // The dependent as the producer's repository names it: its item number, unpadded (a slug number is a file name, not the seq).
  const who = String(Number(depSeq));
  const rec = handoff.makeRecord({ dependent: who, commit: hex(1), contract: 'the contract', verification: 'the check', by: 'prod', at: '2026-10-30T00:00:00Z' });
  const replaced = handoff.makeRecord({ dependent: who, commit: hex(2), contract: 'the contract', verification: 'the check', by: 'prod', at: '2026-10-30T00:00:00Z' });
  const rcpt = (r, result = 'accepted') => handoff.makeReceipt({ dependent: who, digest: r.digest, result, by: 'lead', at: '2026-10-30T00:00:00Z', checks: 'verified' });
  const keys = { handoffs: state === 'missing' ? 'none' : [handoff.encode(state === 'stale' ? replaced : rec)] };
  if (state === 'unaccepted') return setFront(f, p, keys); // a record, no receipt
  if (state === 'stale') return setFront(f, p, { ...keys, handoff_receipts: [handoff.encode(rcpt(rec))] }); // the acceptance pins the replaced record
  keys.handoff_receipts = state === 'accepted' ? [handoff.encode(rcpt(rec))] : [handoff.encode(rcpt(rec, 'rejected'))];
  setFront(f, p, keys);
}
// The gate over every offer command. With a satisfied edge the dependent (the only open item) is offered by
// every command and claimed by work; with an unsatisfied edge it is refused and never offered - the commands
// offer the other open item, h, and the views name the edge state. The real claim (work --claim-now) runs
// last: it changes what the later offers see.
function gate(f, state, p, d, h) {
  ok(f, ['query', '--phase', d, '--agent', 'archy']); // the claimer reads its item first
  const satisfied = state === 'accepted' || state === 'legacy';
  const nextItem = satisfied ? d : h;
  const pop = JSON.parse(run(f, ['pop', '--agent', 'archy', '--json'], 3).stdout);
  assert.deepEqual([pop.action, pop.item], ['claim', nextItem], `pop's offer for a ${state} edge: ${JSON.stringify(pop)}`);
  if (!satisfied) {
    const claim = run(f, ['update', d, '--claim', 'archy']);
    assert.equal(claim.status, 1, claim.stdout + claim.stderr);
    assert.match(claim.stdout, /dependencies not done/);
    assert.match(claim.stdout, new RegExp(`hand-off ${state}`));
    if (state === 'rejected') assert.match(claim.stdout, /must accept the current record/); // the lead may accept the existing record, not only a new one
    const blockedView = run(f, ['query', '--blocked']).stdout; // the view names the held-back item and the edge state
    assert.match(blockedView, new RegExp(`${d} \\(pending\\)`));
    assert.match(blockedView, new RegExp(`waits on ${p} \\(done, hand-off ${state}:`));
  } else {
    assert.ok(!run(f, ['query', '--blocked']).stdout.includes(d), 'the satisfied dependent is in no blocked view');
  }
  const roster = join(f.t, 'roster.json'); writeFileSync(roster, JSON.stringify({ archy: {} }));
  const plan = JSON.parse(run(f, ['query', '--plan', '--roster', roster, '--json']).stdout);
  assert.deepEqual(plan.map(e => e.item), [nextItem], `query --plan's offer for a ${state} edge: ${JSON.stringify(plan)}`);
  const claimable = JSON.parse(run(f, ['query', '--claimable', '--agent', 'archy', '--json']).stdout);
  assert.equal(claimable.some(r => r.slug === d), satisfied, `query --claimable for a ${state} edge: ${JSON.stringify(claimable.map(r => r.slug))}`);
  const next = JSON.parse(run(f, ['next', '--json']).stdout);
  assert.equal(next.slug, nextItem, `next for a ${state} edge: ${JSON.stringify(next)}`);
  if (satisfied) assert.ok(!('first' in next), 'next names no work to do first: the edge is satisfied');
  const work = JSON.parse(run(f, ['work', '--agent', 'archy', '--json'], 3).stdout);
  assert.deepEqual([work.action, work.item], ['claim', nextItem], `work's offer for a ${state} edge: ${JSON.stringify(work)}`);
  assert.equal(work.claimed, true, 'work claims the item it offers');
  assert.equal(work.front_matter?.claimed_by, 'archy');
}

for (const state of ['missing', 'unaccepted', 'stale', 'rejected']) {
  test(`059.4: a done producer with a ${state} edge is an unfinished dependency: claim refused, the dependent is offered by nothing`, () => {
    const f = fixture();
    const p = make(f, 'hand-off producer', 'none');
    const d = make(f, 'dependent job', p, [...COMPLETE]); // the dependent leads the queue: a broken gate offers it first
    const h = make(f, 'behind the dependent', 'none', [...COMPLETE]); // the work that is not held back, behind it
    producerDone(f, p, state, d.split('-')[0]);
    gate(f, state, p, d, h);
  });
}

test('059.4: a done producer with an accepted edge lets the dependent be offered and claimed', () => {
  const f = fixture();
  const p = make(f, 'hand-off producer', 'none');
  const d = make(f, 'dependent job', p, [...COMPLETE]);
  producerDone(f, p, 'accepted', d.split('-')[0]);
  gate(f, 'accepted', p, d, null);
});

test('059.4: a done producer without a handoffs key (legacy) lets the dependent be offered and claimed', () => {
  const f = fixture();
  const p = make(f, 'hand-off producer', 'none');
  const d = make(f, 'dependent job', p, [...COMPLETE]);
  producerDone(f, p, 'legacy', d.split('-')[0]);
  gate(f, 'legacy', p, d, null);
});
