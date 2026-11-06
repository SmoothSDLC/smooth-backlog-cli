// Tests for the team steps along the status order: who may run a step, the word it leads to, the two verdicts, the review history and the decision wait.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { hasDefinitionOfDone } from '../../src/shared/new.js';
import * as store from '../../src/shared/store.js';
import { cli, consumer, createdSlug, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture(prefix = 'team-stages-') {
  const t = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({
    t1: { lead: 'lead', members: ['ann', 'bob', 'zed'], external_reviewers: ['xia'], refinement_review: [{ team: 'reviewers', count: 1 }] },
    peeronly: { lead: 'lead', members: ['ann', 'bob'], review: [{ stage: 'peer', count: 1 }] },
    noreview: { lead: 'lead', members: ['ann'], review: [] },
    reviewers: { lead: 'rex', members: ['rex', 'ria'] },
  }));
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const LEAD = { TEAM_LEAD: 'lead' }; // ann, bob and zed are plain members
const T1 = { TEAM_NAME: 't1' };
// an agent reads an item before it writes it again (the stale-view guard of seen.js): the agent named by --by, --claim or --release
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['query', '--phase', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.equal(r.stderr, '', `${args.join(' ')}: ${r.stderr}`); return r; };
const no = (f, args, text, env) => { const r = run(f, args, env); assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.ok(r.stdout.includes(text), `${args.join(' ')}: ${r.stdout}`); return r; };
const up = (f, slug, ...args) => ok(f, ['update', slug, ...args]);
const make = (f, name, ...extra) => createdSlug(ok(f, ['new', ...NEW(name), ...extra]).stdout);
const doc = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));
const fm = (f, slug) => doc(f, slug).fm;
const pop = (f, agent, env) => { const r = run(f, ['team', 'pop', '--team', 't1', '--agent', agent, '--json'], env); assert.ok([0, 3].includes(r.status), r.stdout + r.stderr); return JSON.parse(r.stdout); };
// a team item is refined (a member, the lead's review request, a reviewer's pass) before anyone claims it
const refined = (f, slug) => [['--refine-start', '--by', 'rfn'], ['--refine-done', '--by', 'rfn', '--note', 'refined'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']].forEach(a => up(f, slug, ...a));

const item = (f, team) => { const s = make(f, `item of ${team}`); up(f, s, '--set-team', team); return s; };
const refine = (f, s, verdict = 'complete') => [['--refine-start', '--by', 'ann'], ['--refine-done', '--by', 'ann', '--note', 'refined'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', verdict, '--by', 'rex', '--comments', 'checked']].forEach(a => up(f, s, ...a));

test('a team step for a team with no entry in the configuration is refused with the exact text, nothing written', () => {
  const f = fixture();
  const s = item(f, 'ghost');
  const before = readFileSync(join(f.folder, 'phases', `${s}.md`), 'utf8');
  no(f, ['update', s, '--refine-start', '--by', 'ann'], 'team ghost is not configured in the backlog configuration');
  assert.equal(readFileSync(join(f.folder, 'phases', `${s}.md`), 'utf8'), before);
});

test('a claim of an item that is not ready is refused, naming ready; the refinement steps move the word along the order', () => {
  const f = fixture();
  const s = item(f, 't1');
  no(f, ['update', s, '--claim', 'ann'], 'claim needs ready or in progress');
  up(f, s, '--refine-start', '--by', 'ann'); assert.equal(fm(f, s).status, 'refining');
  up(f, s, '--refine-done', '--by', 'ann', '--note', 'refined'); assert.equal(fm(f, s).status, 'refined');
  up(f, s, '--request-refinement-review', '--by', 'lead'); assert.equal(fm(f, s).status, 'refinement review');
  up(f, s, '--refinement-review', 'reject', '--by', 'rex', '--comments', 'estimate missing');
  assert.deepEqual([fm(f, s).status, fm(f, s).refiner], ['refining', '']);
  assert.match(fm(f, s).refinement_reviews.at(-1), / reject rex: estimate missing$/); // the finding is kept
  up(f, s, '--refine-start', '--by', 'zed'); up(f, s, '--refine-done', '--by', 'zed', '--note', 'again');
  up(f, s, '--request-refinement-review', '--by', 'lead');
  up(f, s, '--refinement-review', 'complete', '--by', 'rex', '--comments', 'ok'); assert.equal(fm(f, s).status, 'ready');
  up(f, s, '--claim', 'ann'); assert.equal(fm(f, s).status, 'in progress');
});

test('an entry that lists only the peer stage: one member verdict complete leads straight to review complete', () => {
  const f = fixture();
  const s = item(f, 'peeronly'); refine(f, s);
  up(f, s, '--claim', 'ann');
  up(f, s, '--request-review', 'any', '--note', 'commit abc');
  assert.equal(fm(f, s).status, 'ready for review');
  up(f, s, '--review', 'complete', '--by', 'bob', '--comments', 'references/review/code.md: fine');
  assert.equal(fm(f, s).status, 'review complete');
});

test('an entry with no review stages: a review request leads straight to review complete', () => {
  const f = fixture();
  const s = item(f, 'noreview'); refine(f, s);
  up(f, s, '--claim', 'ann');
  up(f, s, '--request-review', 'any', '--note', 'commit abc');
  assert.equal(fm(f, s).status, 'review complete');
});

test('the default entry reviews in both stages; a reject at the external stage returns the item to in progress, clears both passes and keeps the finding', () => {
  const f = fixture();
  const s = item(f, 't1'); refine(f, s);
  up(f, s, '--claim', 'ann');
  up(f, s, '--request-review', 'any', '--note', 'commit abc');
  up(f, s, '--review', 'complete', '--by', 'bob', '--comments', 'references/review/code.md: peer fine');
  assert.equal(fm(f, s).status, 'ready for external review');
  up(f, s, '--review', 'reject', '--by', 'xia', '--comments', 'references/review/code.md: the edge case is missing');
  const after = fm(f, s);
  assert.equal(after.status, 'in progress');
  assert.deepEqual(after.reviews, []);
  assert.equal(after.review_history.length, 2);
  assert.match(after.review_history[0], /^\S+ peer complete bob \S*: /);
  assert.match(after.review_history[1], /^\S+ external reject xia \S*: references\/review\/code.md: the edge case is missing$/);
  assert.ok(pop(f, 'ann', { ...T1, BACKLOG_AGENT: 'ann' }).instruction.length > 0); // in a team session team pop answers only for the agent itself
});

test('--review pass and changes are synonyms and the printed line says the canonical word; an unknown verdict is refused naming both words', () => {
  const f = fixture();
  const s = item(f, 'peeronly'); refine(f, s);
  up(f, s, '--claim', 'ann'); up(f, s, '--request-review', 'any', '--note', 'commit abc');
  const r = ok(f, ['update', s, '--review', 'changes', '--by', 'bob', '--comments', 'references/review/code.md: no']);
  assert.match(r.stdout, /Review by bob: REJECT/);
  assert.equal(fm(f, s).status, 'in progress');
  up(f, s, '--request-review', 'any', '--note', 'commit abd', '--by', 'ann');
  assert.match(ok(f, ['update', s, '--review', 'pass', '--by', 'bob', '--comments', 'references/review/code.md: ok']).stdout, /Review by bob: COMPLETE/);
  const bad = run(f, ['update', s, '--review', 'approve', '--by', 'bob', '--comments', 'x']);
  assert.equal(bad.status, 2); assert.match(bad.stdout + bad.stderr, /complete, reject/);
});

test('--request-decision waits as awaiting decision and records where it came from; --decision returns the item to refining', () => {
  const f = fixture();
  const s = item(f, 't1');
  up(f, s, '--refine-start', '--by', 'ann');
  up(f, s, '--request-decision', 'What: keep the format?\nWhy: parser.\nOptions: A or B. Recommendation: A.', '--by', 'ann');
  assert.deepEqual([fm(f, s).status, fm(f, s).decision_from], ['awaiting decision', 'refining']);
  no(f, ['update', s, '--claim', 'bob'], 'claim needs ready or in progress');
  up(f, s, '--decision', 'A');
  assert.equal(fm(f, s).status, 'refining'); assert.ok(!('decision_from' in fm(f, s)));
});
