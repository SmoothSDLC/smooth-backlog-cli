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

// conftest.Repos.new: a team item names its review refs, an estimate and a definition of done.
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
function make(f, name, extra = []) {
  const has = k => extra.includes(k);
  const args = ['--name', name, '--objective', 'o', '--summary', 's', ...(has('--depends-on') ? [] : ['--depends-on', 'none'])];
  // owner 2026-10-28: no classes. A team item names its review documents; the default is references/review/code.md
  // (conftest.Repos.new). '--no-review-refs' (this helper's own flag) makes an item without any.
  const bare = has('--no-review-refs'); extra = extra.filter(x => x !== '--no-review-refs');
  if (!has('--review-refs') && !bare) args.push('--review-refs', 'references/review/code.md');
  if (!has('--estimate')) args.push('--estimate', '5', '--complexity', 'low');
  const r = run(f, 'new', [...args, '--body', DOD, ...extra]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('created phase phases/')[1].split('.md')[0];
}

test('test_new_item_refusals: refusals at creation, the class options are gone, release only by the holder', () => {
  const f = fixture();
  const count = () => { try { return readdirSync(join(f.folder, 'phases')).length; } catch { return 0; } }; // no folder before the first item
  const before = count();
  const base = ['--name', 'x', '--objective', 'o', '--summary', 's'];
  let p = run(f, 'new', base);
  assert.ok(p.status === 1 && p.stdout.includes('--depends-on is required'), p.stdout + p.stderr);
  p = run(f, 'new', [...base, '--depends-on', 'none', '--review-refs', 'docs/notes.md']); // not a review document (owner 2026-10-28)
  assert.ok(p.status === 1 && p.stdout.includes('needs at least one review document'), p.stdout + p.stderr);
  for (const flag of ['--work-class', '--review-classes']) { // work and review classes are gone
    p = run(f, 'new', [...base, '--depends-on', 'none', flag, 'docs']);
    assert.ok(p.status === 2 && p.stderr.includes('unrecognized arguments'), p.stdout + p.stderr);
  }
  p = run(f, 'new', [...base, '--depends-on', 'no-such-item']);
  assert.ok(p.status === 1 && p.stdout.includes("no item 'no-such-item'"), p.stdout + p.stderr);
  assert.equal(count(), before);
  const s = make(f, 'released only by its holder', ['--depends-on', 'none']);
  assert.ok(run(f, 'query', ['--reviewable']).stderr.includes('--reviewable needs --agent'));
  assert.ok(run(f, 'update', [s, '--set-review-refs', 'docs/notes.md']).stdout.includes('needs at least one review document'));
  // after the first item: a refused creation leaves no backlog (and no empty db) behind, and query needs one
  ok(f, s, '--claim', 'cody');
  assert.ok(refused(f, s, '--release', 'archy').includes('claimed by cody, not by archy'));
  ok(f, s, '--release', 'cody');
  assert.ok(q(f, '--claimable').includes(s));
});

test('test_item_without_team_fields_keeps_working: an item written before team work stays visible and claimable', () => {
  const f = fixture();
  const s = make(f, 'written before team work', ['--no-review-refs']); // no review: --status done finishes it
  const path = join(f.folder, 'phases', `${s}.md`);
  const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer'];
  const { fm, body } = item(f, s);
  store.write({ path, fm: Object.fromEntries(Object.entries(fm).filter(([k]) => !OLD.includes(k))), body }, f.folder); // as an old item looks

  const status = JSON.parse(run(f, 'query', ['--status', '--json']).stdout);
  assert.ok(status.phases.some(p => p.slug === s));
  assert.equal(JSON.parse(run(f, 'query', ['--phase', s]).stdout).slug, s);
  ok(f, s, '--append', 'a note added the old way');
  ok(f, s, '--status', 'in_progress');
  assert.ok(!q(f, '--blocked').includes(s) && !q(f, '--claimable').includes(s)); // in progress
  ok(f, s, '--status', 'pending');
  assert.ok(q(f, '--claimable').includes(s)); // no dependencies
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes('a note added the old way') && !OLD.some(k => text.includes(`\n${k}:`)));
  ok(f, s, '--status', 'done');
});

test('test_claim_review_close_lifecycle: the query views along the lifecycle (the part job 15 left out)', () => {
  const f = fixture();
  const first = make(f, 'dependency first', []);
  const seq = first.split('-')[0];
  const job = make(f, 'the job', ['--review-refs', 'references/review/code.md', '--depends-on', seq]);
  assert.ok(q(f, '--blocked').includes(job) && !q(f, '--claimable').includes(job));
  assert.ok(refused(f, job, '--claim', 'cody').includes(`${first} (status pending`)); // dependency not done
  ok(f, first, '--claim', 'archy');
  ok(f, first, '--request-review', 'any', '--note', 'tests written'); // every complete item is reviewed
  ok(f, first, '--review', 'pass', '--by', 'cody', '--comments', 'fine per references/review/code.md');
  ok(f, first, '--close', '--summary', 'tests written');
  assert.ok(!q(f, '--blocked').includes(job));
  assert.ok(q(f, '--claimable').includes(job));

  ok(f, job, '--claim', 'cody');
  ok(f, job, '--request-review', 'any', '--note', 'commit abc1234, deployed evidence in run 13');
  assert.ok(q(f, '--reviewable', '--agent', 'archy').includes(job) && !q(f, '--reviewable', '--agent', 'cody').includes(job)); // any member but the author
});

test('--reviewable needs --agent; the text view lists the item with its dependencies', () => {
  const f = fixture();
  const a = make(f, 'first', []);
  const b = make(f, 'second', ['--depends-on', a.split('-')[0]]);
  const r = run(f, 'query', ['--reviewable']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, '❌ backlog: --reviewable needs --agent <you> (the author never reviews its own item)\n');
  const text = run(f, 'query', ['--blocked']);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, `📋 1 blocked item(s) — acme/demo, branch main, P0 = next:\n   P1   ${b} (pending) — second\n`
    + `        review_refs=references/review/code.md claimed_by=- review=none estimate=5m complexity=low\n`
    + `        waits on ${a} (status pending, claimed by nobody)\n`);
  const waiting = JSON.parse(run(f, 'query', ['--blocked', '--json']).stdout)[0].waiting_on;
  assert.deepEqual(waiting, [{ id: String(Number(a.split('-')[0])), slug: a, status: 'pending', claimed_by: '' }]);
});

test('a completed dependency whose file is gone does not hold the dependent item back (the row decides, lib_db.py:648-655)', () => {
  const f = fixture();
  const dep = make(f, 'ghost dependency', ['--no-review-refs']); // no review: --status done finishes it
  const job = make(f, 'waits for the ghost', ['--depends-on', dep.split('-')[0]]);
  assert.ok(q(f, '--blocked').includes(job) && !q(f, '--claimable').includes(job));
  ok(f, dep, '--status', 'done');
  rmSync(join(f.folder, 'phases', `${dep}.md`)); // the row stays done; only the file is missing
  assert.ok(!q(f, '--blocked').includes(job), 'blocked by a done dependency');
  assert.ok(q(f, '--claimable').includes(job), 'not claimable although its dependency is done');
  assert.deepEqual(JSON.parse(run(f, 'query', ['--blocked', '--json']).stdout).map(x => x.slug), []);
});

test('an item with old work_class and review_classes fields behaves exactly like one without them (owner 2026-10-28)', () => {
  const f = fixture();
  const plain = make(f, 'plain job');
  const old = make(f, 'old job');
  const path = join(f.folder, 'phases', `${old}.md`);
  const { fm, body } = item(f, old);
  store.write({ path, fm: { ...fm, work_class: ['chunk', 'docs'], review_classes: ['security'] }, body }, f.folder); // as a class-era item looks
  const pop = agent => JSON.parse(run(f, 'query', ['--pop', '--agent', agent, '--json']).stdout);
  // the team view of both items is the same but for identity, rank and time stamps
  const IDENTITY = ['id', 'slug', 'seq', 'name', 'objective', 'summary', 'priority', 'path', 'sha', 'created_at', 'updated_at'];
  const rows = JSON.parse(run(f, 'query', ['--claimable', '--json']).stdout).map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !IDENTITY.includes(k))));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], rows[0]);
  assert.deepEqual(q(f, '--claimable'), [plain, old]); // both complete and claimable: no class makes either chunk work
  assert.deepEqual([pop('archy').action, pop('archy').item], ['claim', plain]);
  ok(f, plain, '--claim', 'archy');
  assert.deepEqual([pop('eve').action, pop('eve').item], ['claim', old]); // work_class chunk does not make it a chunk item
  for (const s of [plain, old]) {
    if (s === old) ok(f, s, '--claim', 'eve');
    ok(f, s, '--request-review', 'any', '--note', 'ready');
    assert.ok(q(f, '--reviewable', '--agent', 'zed').includes(s), s); // any member but the author reviews; no review class counts
  }
});
