// Tests for the team views of src/shared/query.js (src/shared/views.js) - cli-parity job 16 (VIEWS), part 1.
// Port of tests/test_team_compat.py (2 cases) and of the query --blocked/--claimable/--reviewable assertions of
// tests/test_team_lifecycle.py that job 15 left out of shared-team-lifecycle.test.js. Local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { parse } from '../../src/shared/frontmatter.js';
import * as store from '../../src/shared/store.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-compat-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const run = (f, command, args) => cli([command, ...args], { cwd: f.cons, tmp: f.t });
const ok = (f, ...args) => { const r = run(f, 'update', args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const refused = (f, ...args) => { const r = run(f, 'update', args); assert.equal(r.status, 1, r.stdout + r.stderr); return r.stdout; };
const q = (f, ...args) => { const r = run(f, 'query', [...args, '--json']); assert.equal(r.status, 0, r.stdout + r.stderr); return JSON.parse(r.stdout).map(x => x.slug); };
const item = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8'));

// conftest.Repos.new: a team item names its review classes and refs, an estimate and a definition of done.
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
function make(f, name, extra = []) {
  const has = k => extra.includes(k);
  const args = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  const classes = has('--review-classes') ? extra[extra.indexOf('--review-classes') + 1] : (has('--work-class') ? 'code' : '');
  if (classes && !has('--review-classes')) args.push('--review-classes', classes);
  if (classes && !has('--review-refs')) args.push('--review-refs', classes.split(',').map(c => `references/review/${c}.md`).join(','));
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  const r = run(f, 'new', [...args, '--body', DOD, ...extra]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('created phase phases/')[1].split('.md')[0];
}

test('test_new_item_refusals: refusals at creation, --claimable rejects an unknown class, release only by the holder', () => {
  const f = fixture();
  const count = () => { try { return readdirSync(join(f.folder, 'phases')).length; } catch { return 0; } }; // no folder before the first item
  const before = count();
  const base = ['--name', 'x', '--objective', 'o', '--summary', 's'];
  let p = run(f, 'new', base);
  assert.ok(p.status === 1 && p.stdout.includes('--depends-on is required'), p.stdout + p.stderr);
  p = run(f, 'new', [...base, '--depends-on', 'none', '--work-class', 'app-code,code']); // 'code' is a review class only
  assert.ok(p.status === 2 && p.stderr.includes('unknown class code'), p.stdout + p.stderr);
  p = run(f, 'new', [...base, '--depends-on', 'none', '--review-classes', 'wizardry']);
  assert.ok(p.status === 2 && p.stderr.includes('unknown class wizardry'), p.stdout + p.stderr);
  p = run(f, 'new', [...base, '--depends-on', 'no-such-item']);
  assert.ok(p.status === 1 && p.stdout.includes("no item 'no-such-item'"), p.stdout + p.stderr);
  assert.equal(count(), before);
  const s = make(f, 'released only by its holder', ['--work-class', 'docs', '--depends-on', 'none']);
  assert.ok(run(f, 'query', ['--claimable', '--classes', 'bogus']).stderr.includes('unknown class bogus'));
  // after the first item: a refused creation leaves no backlog (and no empty db) behind, and query needs one
  ok(f, s, '--claim', 'cody');
  assert.ok(refused(f, s, '--release', 'archy').includes('claimed by cody, not by archy'));
  ok(f, s, '--release', 'cody');
  assert.ok(q(f, '--claimable', '--classes', 'docs').includes(s));
});

test('test_item_without_team_fields_keeps_working: an item written before team work stays visible and claimable', () => {
  const f = fixture();
  const s = make(f, 'written before team work');
  const path = join(f.folder, 'phases', `${s}.md`);
  const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer'];
  const { fm, body } = item(f, s);
  store.write({ path, fm: Object.fromEntries(Object.entries(fm).filter(([k]) => !OLD.includes(k))), body }, f.folder); // as an old item looks

  const status = JSON.parse(run(f, 'query', ['--status', '--json']).stdout);
  assert.ok(status.phases.some(p => p.slug === s));
  assert.equal(JSON.parse(run(f, 'query', ['--phase', s]).stdout).slug, s);
  ok(f, s, '--append', 'a note added the old way');
  ok(f, s, '--status', 'in_progress');
  assert.ok(!q(f, '--blocked').includes(s) && !q(f, '--claimable', '--classes', 'docs').includes(s)); // in progress
  ok(f, s, '--status', 'pending');
  assert.ok(q(f, '--claimable', '--classes', 'docs').includes(s)); // no classes, no dependencies
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes('a note added the old way') && !OLD.some(k => text.includes(`\n${k}:`)));
  ok(f, s, '--status', 'done');
});

test('test_claim_review_close_lifecycle: the query views along the lifecycle (the part job 15 left out)', () => {
  const f = fixture();
  const first = make(f, 'dependency first', ['--work-class', 'tests']);
  const seq = first.split('-')[0];
  const job = make(f, 'the job', ['--work-class', 'app-code,tests', '--review-classes', 'code', '--depends-on', seq]);
  assert.ok(q(f, '--blocked').includes(job) && !q(f, '--claimable', '--classes', 'app-code,tests').includes(job));
  assert.ok(refused(f, job, '--claim', 'cody').includes(`${first} (status pending`)); // dependency not done
  ok(f, first, '--claim', 'archy');
  ok(f, first, '--request-review', 'any', '--note', 'tests written'); // every complete item is reviewed
  ok(f, first, '--review', 'pass', '--by', 'cody', '--comments', 'fine per references/review/code.md');
  ok(f, first, '--close', '--summary', 'tests written');
  assert.ok(!q(f, '--blocked').includes(job));
  assert.ok(q(f, '--claimable', '--classes', 'app-code,tests,docs').includes(job));
  assert.ok(!q(f, '--claimable', '--classes', 'tests').includes(job)); // app-code not covered

  ok(f, job, '--claim', 'cody');
  ok(f, job, '--request-review', 'any', '--note', 'commit abc1234, deployed evidence in run 13');
  assert.ok(q(f, '--reviewable', '--classes', 'code').includes(job) && !q(f, '--reviewable', '--classes', 'ui').includes(job));
});

test('--claimable and --reviewable need --classes; the text view lists the item with its dependencies', () => {
  const f = fixture();
  const a = make(f, 'first', ['--work-class', 'tests']);
  const b = make(f, 'second', ['--work-class', 'docs', '--depends-on', a.split('-')[0]]);
  for (const view of ['--claimable', '--reviewable']) {
    const r = run(f, 'query', [view]);
    assert.equal(r.status, 2);
    assert.equal(r.stderr, '❌ backlog: --claimable and --reviewable need --classes <the classes this agent covers>\n');
  }
  const text = run(f, 'query', ['--blocked']);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, `📋 1 blocked item(s) — acme/demo, branch main, P0 = next:\n   P1   ${b} (pending) — second\n`
    + `        work_class=docs review_classes=code claimed_by=- review=none estimate=5m complexity=low\n`
    + `        waits on ${a} (status pending, claimed by nobody)\n`);
  const waiting = JSON.parse(run(f, 'query', ['--blocked', '--json']).stdout)[0].waiting_on;
  assert.deepEqual(waiting, [{ id: String(Number(a.split('-')[0])), slug: a, status: 'pending', claimed_by: '' }]);
});

test('a completed dependency whose file is gone does not hold the dependent item back (the row decides, lib_db.py:648-655)', () => {
  const f = fixture();
  const dep = make(f, 'ghost dependency');
  const job = make(f, 'waits for the ghost', ['--depends-on', dep.split('-')[0]]);
  assert.ok(q(f, '--blocked').includes(job) && !q(f, '--claimable', '--classes', 'docs').includes(job));
  ok(f, dep, '--status', 'done');
  rmSync(join(f.folder, 'phases', `${dep}.md`)); // the row stays done; only the file is missing
  assert.ok(!q(f, '--blocked').includes(job), 'blocked by a done dependency');
  assert.ok(q(f, '--claimable', '--classes', 'docs').includes(job), 'not claimable although its dependency is done');
  assert.deepEqual(JSON.parse(run(f, 'query', ['--blocked', '--json']).stdout).map(x => x.slug), []);
});
