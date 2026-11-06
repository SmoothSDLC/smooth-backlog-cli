// Tests for src/shared/query.js - cli-parity job 12 (QUERY): the read views (--next --status --critical --phase --events
// --by-branch --all --branch --json) and `backlog next`. Local bare repos only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { defaultUser } from '../../src/shared/setup.js';
import * as store from '../../src/shared/store.js';

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

const newItem = (f, name, ...more) => {
  const r = cli(['new', '--name', name, '--objective', `Café ☕ ${name}`, '--summary', `sum ${name}`, '--depends-on', 'none', ...more], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r;
};
const setStatus = (f, item, status) => { const r = cli(['update', item, '--status', status], { cwd: f.cons, tmp: f.t }); assert.equal(r.status, 0, r.stdout + r.stderr); };
// item 088: --status done runs only after both review stages passed for the item's commit; the fixture completes
// Delta, so the stages run here (a fresh amy card, then the external reviewer, each with a fresh view). An
// incomplete item takes only the lead's refinement, so the item is completed first (refs, estimate, DoD).
const bothStages = (f, item) => {
  const step = args => { const r = cli(args, { cwd: f.cons, tmp: f.t }); assert.equal(r.status, 0, r.stdout + r.stderr); };
  step(['update', item, '--set-review-refs', 'references/review/code.md', '--set-estimate', '5', '--append', '## Definition of done\n- [ ] it holds']);
  step(['update', item, '--request-review', 'any', '--note', 'n']);
  step(['query', '--phase', item, '--agent', 'amy-a']);
  step(['update', item, '--start-review', '--by', 'amy-a']);
  step(['update', item, '--review', 'pass', '--by', 'amy-a', '--comments', 'fine per references/review/code.md']);
  step(['update', item, '--request-review', 'rex', '--note', 'n']);
  step(['query', '--phase', item, '--agent', 'rex']);
  step(['update', item, '--start-review', '--by', 'rex']);
  step(['update', item, '--review', 'pass', '--by', 'rex', '--comments', 'fine per references/review/code.md']);
};
const commitAll = home => { git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', 'fixture'); git(home, 'push', '-q'); };

// Shared home + consumer acme/demo on main, built with the CLI:
// open items on main (one critical, one in progress), a done item, an item of branch "feature" that is not on the
// origin (a gone-branch item), and hand-made foreign and untagged findings. Mode is set to shared.
function build(withFindings) {
  const t = mkdtempSync(join(tmpdir(), 'query-test-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  const f = { t, home, cons, folder: join(home, 'acme', 'demo') };
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  newItem(f, 'Alpha');
  newItem(f, 'Beta', '--severity', 'critical');
  newItem(f, 'Gamma');
  newItem(f, 'Delta');
  setStatus(f, '003-gamma', 'in_progress');
  bothStages(f, '004-delta');
  setStatus(f, '004-delta', 'done');
  git(cons, 'checkout', '-q', '-b', 'feature');
  newItem(f, 'Feat');
  git(cons, 'checkout', '-q', 'main');
  if (withFindings) {
    const item = (seq, name, extra) => store.write({
      path: join(f.folder, `phases/${String(seq).padStart(3, '0')}-${name}.md`),
      fm: { phase: `${String(seq).padStart(3, '0')}-${name}`, seq, name, objective: 'o', summary: 's', status: 'pending', severity: 'normal', priority: 9, repository: 'acme/demo', branch: 'main', commit: 'abc1234', location: '', ...extra },
      body: `\n# Phase ${seq}\n`,
    });
    item(store.nextSeq(f.folder), 'foreign', { repository: 'other/thing' });
    item(store.nextSeq(f.folder), 'untagged', { branch: '' });
    commitAll(home);
  }
  return f;
}
let shared;
const fx = () => (shared ??= build(true));

// Runs a read view of the CLI; asserts its exit status, and for a successful view the exact (empty) stderr.
function view(f, args, status = 0, cwd = f.cons) {
  const n = cli(['query', ...args], { cwd, tmp: f.t });
  assert.equal(n.status, status, `${args.join(' ')}: ${n.stderr}`);
  if (status === 0) assert.equal(n.stderr, '', `${args.join(' ')}: a successful query prints nothing to stderr`);
  return n;
}
// The parts that differ between runs: timestamps, hex shas (any length, 7 or more chars) and the writing agent id.
const norm = s => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'TS')
  .replace(/commit=[0-9a-f]+/g, 'commit=SHA')
  .replace(/sha drift [0-9a-f]+->[0-9a-f]+/g, 'sha drift SHA->SHA');
const normJson = s => JSON.parse(s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'TS').replace(/"updated_by": "[^"]*"/g, '"updated_by": "UPD"'),
  (k, v) => (typeof v === 'string' && /^[0-9a-f]{7,}$/.test(v) ? 'SHA' : v));
const STATUS_FINDINGS = '⚠️  CRITICAL: phases/006-foreign.md says repository other/thing but is in the folder of acme/demo; it is out of the queue. Move it: backlog move 006-foreign --to-repository\n'
  + '⚠️  item 007-untagged records no repository or branch; it is out of the queue until its repository and branch are filled in\n'
  + '⚠️ ========================================================================\n'
  + '⚠️  1 CRITICAL ITEM(S) ON THE BACKLOG — SURFACE THESE FIRST, DO NOT BURY:\n'
  + '⚠️    P0   [  2] 002-beta — Beta\n'
  + '⚠️ ========================================================================\n';
const NEXT_HEADER = '➡️  NEXT: P0 (rank 0 = next) — [  2] 002-beta  (pending)  ⚠️ CRITICAL\n'
  + '    Beta\n'
  + '    objective: Café ☕ Beta\n'
  + '    summary:   sum Beta\n'
  + '    progress:  branch=main commit=SHA loc=\n';

test('075: --status --json prints handoff, repository, branch, phases, gone_branch_items and findings', () => {
  const f = fx();
  // timestamps, content hashes and the writing agent id differ between runs; the rest of the output is asserted word for word
  const exact = s => s
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'TS')
    .replace(/"(sha|commit_sha)": "[0-9a-f]+"/g, '"$1": "SHA"');
  assert.equal(exact(view(f, ['--status', '--json']).stdout), String.raw`{
  "handoff": {
    "id": 1,
    "slug": "BACKLOG",
    "title": "Backlog",
    "objective": "phase anchor (no document)",
    "path": "",
    "sha": "",
    "status": "active",
    "source_context": "",
    "created_at": "TS",
    "updated_at": "TS"
  },
  "repository": "acme/demo",
  "branch": "main",
  "phases": [
    {
      "id": 2,
      "handoff_id": 1,
      "slug": "002-beta",
      "seq": 2,
      "name": "Beta",
      "objective": "Caf\u00e9 \u2615 Beta",
      "summary": "sum Beta",
      "status": "pending",
      "severity": "critical",
      "priority": 0,
      "path": "phases/002-beta.md",
      "sha": "SHA",
      "branch": "main",
      "commit_sha": "SHA",
      "location": "",
      "repository": "acme/demo",
      "size_score": 0,
      "created_at": "TS",
      "updated_at": "TS",
      "completed_at": null,
      "claimed_by": "",
      "review_state": "none"
    },
    {
      "id": 1,
      "handoff_id": 1,
      "slug": "001-alpha",
      "seq": 1,
      "name": "Alpha",
      "objective": "Caf\u00e9 \u2615 Alpha",
      "summary": "sum Alpha",
      "status": "pending",
      "severity": "normal",
      "priority": 1,
      "path": "phases/001-alpha.md",
      "sha": "SHA",
      "branch": "main",
      "commit_sha": "SHA",
      "location": "",
      "repository": "acme/demo",
      "size_score": 0,
      "created_at": "TS",
      "updated_at": "TS",
      "completed_at": null,
      "claimed_by": "",
      "review_state": "none"
    },
    {
      "id": 3,
      "handoff_id": 1,
      "slug": "003-gamma",
      "seq": 3,
      "name": "Gamma",
      "objective": "Caf\u00e9 \u2615 Gamma",
      "summary": "sum Gamma",
      "status": "in progress",
      "severity": "normal",
      "priority": 2,
      "path": "phases/003-gamma.md",
      "sha": "SHA",
      "branch": "main",
      "commit_sha": "SHA",
      "location": "",
      "repository": "acme/demo",
      "size_score": 0,
      "created_at": "TS",
      "updated_at": "TS",
      "completed_at": null,
      "claimed_by": "",
      "review_state": "none"
    },
    {
      "id": 4,
      "handoff_id": 1,
      "slug": "004-delta",
      "seq": 4,
      "name": "Delta",
      "objective": "Caf\u00e9 \u2615 Delta",
      "summary": "sum Delta",
      "status": "closed",
      "severity": "normal",
      "priority": 4,
      "path": "phases/004-delta.md",
      "sha": "SHA",
      "branch": "main",
      "commit_sha": "SHA",
      "location": "",
      "repository": "acme/demo",
      "size_score": 0,
      "created_at": "TS",
      "updated_at": "TS",
      "completed_at": "TS",
      "claimed_by": "",
      "review_state": "passed"
    }
  ],
  "gone_branch_items": [
    {
      "id": 5,
      "handoff_id": 1,
      "slug": "005-feat",
      "seq": 5,
      "name": "Feat",
      "objective": "Caf\u00e9 \u2615 Feat",
      "summary": "sum Feat",
      "status": "pending",
      "severity": "normal",
      "priority": 0,
      "path": "phases/005-feat.md",
      "sha": "SHA",
      "branch": "feature",
      "commit_sha": "SHA",
      "location": "",
      "repository": "acme/demo",
      "size_score": 0,
      "created_at": "TS",
      "updated_at": "TS",
      "completed_at": null,
      "claimed_by": "",
      "review_state": "none"
    }
  ],
  "findings": {
    "foreign": [
      {
        "id": 6,
        "handoff_id": 1,
        "slug": "006-foreign",
        "seq": 6,
        "name": "foreign",
        "objective": "o",
        "summary": "s",
        "status": "pending",
        "severity": "normal",
        "priority": 3,
        "path": "phases/006-foreign.md",
        "sha": "SHA",
        "branch": "main",
        "commit_sha": "SHA",
        "location": "",
        "repository": "other/thing",
        "size_score": 0,
        "created_at": "TS",
        "updated_at": "TS",
        "completed_at": null,
        "claimed_by": "",
        "review_state": ""
      }
    ],
    "untagged": [
      {
        "id": 7,
        "handoff_id": 1,
        "slug": "007-untagged",
        "seq": 7,
        "name": "untagged",
        "objective": "o",
        "summary": "s",
        "status": "pending",
        "severity": "normal",
        "priority": 0,
        "path": "phases/007-untagged.md",
        "sha": "SHA",
        "branch": "",
        "commit_sha": "SHA",
        "location": "",
        "repository": "acme/demo",
        "size_score": 0,
        "created_at": "TS",
        "updated_at": "TS",
        "completed_at": null,
        "claimed_by": "",
        "review_state": ""
      }
    ]
  }
}
`);
});

test('an item file deleted outside the CLI is simply absent: no ghost, no crash', () => {
  const f = build(true); // a fresh fixture: the shared one is read by other tests
  rmSync(join(f.folder, 'phases', '002-beta.md'));
  const r = cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(r.stdout);
  assert.ok(!v.phases.some(p => p.slug === '002-beta'));
  assert.equal(v.findings.ghost, undefined);
  const text = cli(['query'], { cwd: f.cons, tmp: f.t });
  assert.equal(text.status, 0, text.stderr);
  assert.doesNotMatch(text.stdout, /database row/);
});

test('075: --status text: the findings, the critical banner, the queue and the gone-branch warning, exactly', () => {
  const f = fx();
  assert.equal(view(f, ['--status']).stdout,
    STATUS_FINDINGS
    + '📋 acme/demo — branch main\n'
    + '   objective: phase anchor (no document)\n'
    + '   phases (4) — work queue order, P0 = next:\n'
    + '   • [  2] 002-beta                     pending      P  0 ⚠️CRIT  Beta\n'
    + '        ↳ sum Beta\n'
    + '   • [  1] 001-alpha                    pending      P  1  Alpha\n'
    + '        ↳ sum Alpha\n'
    + '   🔄 [  3] 003-gamma                    in progress  P  2  Gamma\n'
    + '        ↳ sum Gamma\n'
    + '   ✅ [  4] 004-delta                    closed       P  4  Delta\n'
    + '        ↳ sum Delta\n'
    + '   ⚠️  1 open item(s) belong to branches that no longer exist on the origin; they are in no queue. Decide for each: move to a branch (backlog move <item> --to-branch <name>), archive, or remove:\n'
    + '      - 005-feat (branch feature) Feat\n');
});

test('075: --status --all and --branch: every branch in the queue, the gone item in its own branch only', () => {
  const f = fx();
  assert.equal(view(f, ['--status', '--all']).stdout,
    STATUS_FINDINGS
    + '📋 acme/demo — branch (all)\n'
    + '   objective: phase anchor (no document)\n'
    + '   phases (5) — work queue order, P0 = next:\n'
    + '   • [  2] 002-beta                     pending      P  0 ⚠️CRIT  Beta\n'
    + '        ↳ sum Beta\n'
    + '   • [  5] 005-feat                     pending      P  0  Feat\n'
    + '        ↳ sum Feat\n'
    + '   • [  1] 001-alpha                    pending      P  1  Alpha\n'
    + '        ↳ sum Alpha\n'
    + '   🔄 [  3] 003-gamma                    in progress  P  2  Gamma\n'
    + '        ↳ sum Gamma\n'
    + '   ✅ [  4] 004-delta                    closed       P  4  Delta\n'
    + '        ↳ sum Delta\n');
  assert.equal(view(f, ['--status', '--branch', 'feature']).stdout,
    STATUS_FINDINGS
    + '📋 acme/demo — branch feature\n'
    + '   objective: phase anchor (no document)\n'
    + '   phases (1) — work queue order, P0 = next:\n'
    + '   • [  5] 005-feat                     pending      P  0  Feat\n'
    + '        ↳ sum Feat\n');
  const v = JSON.parse(view(f, ['--status', '--all', '--json']).stdout);
  assert.deepEqual(v.phases.map(x => [x.slug, x.branch, x.priority]), [['002-beta', 'main', 0], ['005-feat', 'feature', 0], ['001-alpha', 'main', 1], ['003-gamma', 'main', 2], ['004-delta', 'main', 4]]);
  assert.deepEqual(v.gone_branch_items, [], 'with --all the gone-branch item is in the queue');
  // the branch view's JSON, whole: the handoff, the branch, that branch's queue only, no gone-branch items, and the findings
  assert.deepEqual(normJson(view(f, ['--status', '--branch', 'feature', '--json']).stdout), {
    handoff: { id: 1, slug: 'BACKLOG', title: 'Backlog', objective: 'phase anchor (no document)', path: '', sha: '', status: 'active', source_context: '', created_at: 'TS', updated_at: 'TS' },
    repository: 'acme/demo',
    branch: 'feature',
    phases: [{
      id: 5, handoff_id: 1, slug: '005-feat', seq: 5, name: 'Feat', objective: 'Caf\u00e9 \u2615 Feat', summary: 'sum Feat',
      status: 'pending', severity: 'normal', priority: 0, path: 'phases/005-feat.md', sha: 'SHA', branch: 'feature', commit_sha: 'SHA',
      location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null,
      claimed_by: '', review_state: 'none'
    }],
    gone_branch_items: [],
    findings: {
      foreign: [{ id: 6, handoff_id: 1, slug: '006-foreign', seq: 6, name: 'foreign', objective: 'o', summary: 's', status: 'pending', severity: 'normal', priority: 3, path: 'phases/006-foreign.md', sha: 'SHA', branch: 'main', commit_sha: 'SHA', location: '', repository: 'other/thing', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null, claimed_by: '', review_state: '' }],
      untagged: [{ id: 7, handoff_id: 1, slug: '007-untagged', seq: 7, name: 'untagged', objective: 'o', summary: 's', status: 'pending', severity: 'normal', priority: 0, path: 'phases/007-untagged.md', sha: 'SHA', branch: '', commit_sha: 'SHA', location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null, claimed_by: '', review_state: '' }]
    }
  });
});

test('075: --next --json prints the queue head; --next text prints the findings and the item', () => {
  const f = fx();
  const { front_matter: whole, body, ...row } = normJson(view(f, ['--next', '--json']).stdout); // the whole item: its front matter and its body come with the row
  assert.equal(whole.phase, '002-beta');
  assert.ok(body.includes('# Phase 002'), body);
  assert.deepEqual(row, {
    id: 2, handoff_id: 1, slug: '002-beta', seq: 2, name: 'Beta', objective: 'Caf\u00e9 \u2615 Beta', summary: 'sum Beta',
    status: 'pending', severity: 'critical', priority: 0, path: 'phases/002-beta.md', sha: 'SHA', branch: 'main', commit_sha: 'SHA',
    location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null });
  const shown = norm(view(f, ['--next']).stdout);
  assert.ok(shown.startsWith(STATUS_FINDINGS + NEXT_HEADER), 'the findings and the item');
  assert.ok(shown.includes('--- front matter ---\nphase: 002-beta') && shown.includes('--- body ---\n# Phase 002'), shown);
  view(f, ['--next', '--all']);
  assert.equal(JSON.parse(view(f, ['--next', '--branch', 'feature', '--json']).stdout).slug, '005-feat');
});

test('`backlog next` is --next', () => {
  const f = fx();
  const n = cli(['next'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 0, n.stderr);
  assert.equal(n.stdout, view(f, ['--next']).stdout);
});

test('an empty queue prints {} (JSON) or the info line, exit 0', () => {
  const f = fx();
  const text = view(f, ['--next', '--branch', 'nowhere']).stdout; // the fixture's findings banners come first
  assert.match(text, /^⚠️  CRITICAL: phases\/006-foreign\.md says repository other\/thing/);
  assert.ok(text.endsWith('\nℹ️  no actionable item for acme/demo, branch nowhere; --all shows every branch\n'), text);
  assert.equal(view(f, ['--next', '--branch', 'nowhere', '--json']).stdout.trim(), '{}');
});

test('075: --phase prints the full item (row, front matter, body, missing) by slug and by number; not found is exit 1 on stdout', () => {
  const f = fx();
  const beta = { id: 2, handoff_id: 1, slug: '002-beta', seq: 2, name: 'Beta', objective: 'Caf\u00e9 \u2615 Beta', summary: 'sum Beta', status: 'pending', severity: 'critical', priority: 0, path: 'phases/002-beta.md', sha: 'SHA', branch: 'main', commit_sha: 'SHA', location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null,
    front_matter: { phase: '002-beta', seq: 2, name: 'Beta', objective: 'Caf\u00e9 \u2615 Beta', summary: 'sum Beta', status: 'pending', severity: 'critical', repository: 'acme/demo', branch: 'main', commit: 'SHA', location: '', created: 'TS', updated: 'TS', updated_by: 'UPD', depends_on: [], claimed_by: '', claimed_at: '', review_state: 'none', reviewer: '', owner: defaultUser(f.cons) },
    body: '\n# Phase 002 — Beta\n\n**Objective:** Caf\u00e9 \u2615 Beta\n\n\n## Definition of done\n\n- [ ] <machine-checkable acceptance>\n',
    missing: ['review_refs', 'estimate_min', 'definition_of_done'] };
  // the item carries its history (events) in its front matter: compared apart from the rest
  const noEvents = j => { const { events, ...fm } = j.front_matter; return [{ ...j, front_matter: fm }, events]; };
  const [bySlug, betaEvents] = noEvents(normJson(view(f, ['--phase', '002-beta']).stdout));
  assert.deepEqual(bySlug, beta, 'by slug');
  assert.match(betaEvents[0], /^TS planning_event - - added 002-beta at rank 0/);
  const gamma = { ...beta, id: 3, seq: 3, slug: '003-gamma', name: 'Gamma', objective: 'Caf\u00e9 \u2615 Gamma', summary: 'sum Gamma', status: 'in progress', severity: 'normal', priority: 2, path: 'phases/003-gamma.md',
    front_matter: { ...beta.front_matter, phase: '003-gamma', seq: 3, name: 'Gamma', objective: 'Caf\u00e9 \u2615 Gamma', summary: 'sum Gamma', status: 'in progress', severity: 'normal' } };
  gamma.body = '\n# Phase 003 — Gamma\n\n**Objective:** Caf\u00e9 \u2615 Gamma\n\n\n## Definition of done\n\n- [ ] <machine-checkable acceptance>\n';
  const [byNumber, events] = noEvents(normJson(view(f, ['--phase', '3']).stdout));
  assert.deepEqual(byNumber, gamma, 'by number');
  assert.equal(events.length, 2);
  assert.match(events[0], /^TS planning_event - - added 003-gamma/);
  assert.match(events[1], /^TS state_change main \S+ set status=in progress$/);
  assert.deepEqual(noEvents(normJson(view(f, ['--phase', '003']).stdout))[0], gamma, 'zero-padded numbers resolve to the same item');
  assert.match(view(f, ['--phase', 'nope'], 1).stdout, /no phase 'nope'/);
});

test('query --events reads the item history from the items, newest first, archived items included', () => {
  const f = build(false);
  const run = (...args) => cli(args, { cwd: f.cons, tmp: f.t });
  run('update', '1', '--note', 'first note');
  run('update', '1', '--note', 'second note');
  const one = run('query', '--events', '1');
  assert.equal(one.status, 0, one.stderr);
  const lines = one.stdout.split('\n').filter(Boolean);
  assert.ok(lines[0].includes('second note') && lines.some(l => l.includes('first note')), one.stdout);
  assert.match(lines[0], /^ {2}\d{4}-\d\d-\d\dT\S+ {2}\S.{13} branch=\S* commit=\S* /);
  assert.equal(run('archive', '4').status, 0);
  const arch = run('query', '--events', '4');
  assert.equal(arch.status, 0, arch.stderr);
  assert.match(arch.stdout, /archived/);
  const all = run('query', '--events');
  assert.ok(all.stdout.includes('second note') && all.stdout.includes('archived'), all.stdout);
  // the database is not the source: an event that exists only in a file is listed
  const file = join(f.folder, 'phases', '002-beta.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^events:\n/m, 'events:\n- "2020-01-01T00:00:00Z note - - only in the file"\n'));
  assert.match(run('query', '--events', '2').stdout, /only in the file/);
  assert.equal(run('query', '--events', '99').status, 1);
});

test('075: --critical lists the open critical items (JSON and text) and says so when there are none', () => {
  const f = fx();
  assert.equal(view(f, ['--critical']).stdout,
    '⚠️ ========================================================================\n'
    + '⚠️  1 CRITICAL ITEM(S) ON THE BACKLOG — SURFACE THESE FIRST, DO NOT BURY:\n'
    + '⚠️    P0   [  2] 002-beta — Beta\n'
    + '⚠️ ========================================================================\n');
  assert.deepEqual(normJson(view(f, ['--critical', '--json']).stdout).map(x => [x.slug, x.severity, x.priority]), [['002-beta', 'critical', 0]]);
  const g = build(false);
  bothStages(g, '002-beta');
  setStatus(g, '002-beta', 'done');
  assert.equal(view(g, ['--critical']).stdout, '✅ no open CRITICAL items on the backlog\n');
  assert.deepEqual(normJson(view(g, ['--critical', '--json']).stdout), []);
});

test('075: --events (all, and for one item) and --by-branch: the exact lines', () => {
  const f = fx();
  // the history comes from the items; events logged within one second have no order between items, so the lines are compared as a set
  const sorted = out => norm(out).split('\n').filter(Boolean).sort();
  assert.deepEqual(sorted(view(f, ['--events']).stdout), [
    '  TS  planning_event branch= commit= added 001-alpha at rank end; backlog re-densified to 1 item(s)',
    '  TS  planning_event branch= commit= added 002-beta at rank 0; backlog re-densified to 2 item(s)',
    '  TS  planning_event branch= commit= added 003-gamma at rank end; backlog re-densified to 3 item(s)',
    '  TS  planning_event branch= commit= added 004-delta at rank end; backlog re-densified to 4 item(s)',
    '  TS  planning_event branch= commit= added 005-feat at rank end; backlog re-densified to 1 item(s)',
    '  TS  planning_event branch= commit= completed 004-delta; backlog re-prioritized to 3 item(s)',
    '  TS  review_requested branch=main commit=SHA n',
    '  TS  review_requested branch=main commit=SHA n',
    '  TS  review_started branch=main commit=SHA set review_started=Review started by amy-a at TS',
    '  TS  review_started branch=main commit=SHA set review_started=Review started by rex at TS',
    '  TS  reviewed       branch=main commit=SHA set reviewed=Review by amy-a: COMPLETE (TS)',
    '  TS  reviewed       branch=main commit=SHA set reviewed=Review by rex: COMPLETE (TS)',
    '  TS  state_change   branch=main commit=SHA set estimate_min=5, review_refs=references/review/code.md',
    '  TS  state_change   branch=main commit=SHA set status=closed, handoffs=none',
    '  TS  state_change   branch=main commit=SHA set status=in progress',
  ]);
  assert.match(view(f, ['--events', '002-beta']).stdout, /^ {2}\S+ {2}planning_event branch= commit= added 002-beta at rank 0.*\n$/, 'one item: only its own lines');
  assert.equal(norm(view(f, ['--by-branch', 'main']).stdout),
    '  [  1] 001-alpha                    pending      commit=SHA \n'
    + '  [  2] 002-beta                     pending      commit=SHA \n'
    + '  [  3] 003-gamma                    in progress  commit=SHA \n'
    + '  [  4] 004-delta                    closed       commit=SHA \n'
    + '  [  6] 006-foreign                  pending      commit=SHA \n');
  assert.equal(norm(view(f, ['--by-branch', 'feature']).stdout), '  [  5] 005-feat                     pending      commit=SHA \n');
});

test('075: a repository without a backlog folder prints the info line or {}, exit 0', () => {
  const f = fx();
  const other = consumer(f.t, 'acme', 'fresh', 'main');
  const info = `ℹ️  acme/fresh has no backlog yet\n`;
  const s1 = cli(['query', '--status'], { cwd: other, tmp: f.t });
  assert.equal(s1.status, 0, s1.stdout + s1.stderr);
  assert.equal(s1.stderr, '', 'a successful query prints nothing to stderr');
  assert.equal(s1.stdout, info);
  const s2 = cli(['query', '--next'], { cwd: other, tmp: f.t });
  assert.equal(s2.status, 0, s2.stdout + s2.stderr);
  assert.equal(s2.stderr, '', 'a successful query prints nothing to stderr');
  assert.equal(s2.stdout, info);
  assert.equal(view(f, ['--status', '--json'], 0, other).stdout.trim(), '{}');
  assert.equal(view(f, ['--next', '--json'], 0, other).stdout.trim(), '{}');
});

test('075: a detached HEAD without --branch or --all is exit 2 with the exact refusal', () => {
  const f = fx();
  const head = git(f.cons, 'rev-parse', 'HEAD');
  git(f.cons, 'checkout', '-q', '--detach');
  const refused = '❌ backlog: HEAD is detached: pass --branch <name> (the branch whose queue you want) or --all\n';
  try {
    assert.equal(view(f, ['--next'], 2).stderr, refused);
    assert.equal(view(f, ['--status'], 2).stderr, refused);
    view(f, ['--status', '--all', '--json']);
  } finally { git(f.cons, 'checkout', '-q', 'main'); assert.equal(git(f.cons, 'rev-parse', 'HEAD'), head); }
});

test('a read view pulls first: an item pushed from another clone is shown, and no item or db file is written', () => {
  const f = build(false);
  const home2 = join(f.t, 'home2');
  git(f.t, 'clone', '-q', join(f.t, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`), home2);
  const r = cli(['new', '--name', 'Pushed', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], { cwd: f.cons, tmp: f.t, env: { BACKLOG_HOME: realpathSync(home2) } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const before = git(f.home, 'rev-parse', 'HEAD');
  const n = cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 0, n.stderr);
  assert.ok(JSON.parse(n.stdout).phases.some(p => p.slug === '006-pushed'));
  assert.notEqual(git(f.home, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
  const files = git(f.home, 'ls-files', '-s');
  for (const args of [['--next'], ['--status'], ['--phase', '1'], ['--events'], ['--critical'], ['--by-branch', 'main']]) cli(['query', ...args], { cwd: f.cons, tmp: f.t });
  assert.equal(git(f.home, 'ls-files', '-s'), files);
  assert.equal(git(f.home, 'status', '--porcelain'), '');
});

test('a failed pull does not stop a read: it answers from the local copy with the offline warning; a write is refused with exit 3', t => {
  const f = build(false);
  git(f.home, 'remote', 'set-url', 'origin', join(f.t, 'gone', BACKLOG_OWNER, `${BACKLOG_NAME}.git`));
  const n = cli(['query', '--status'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 0, n.stdout + n.stderr);
  assert.match(n.stderr, /origin offline, local backlog updates may be behind and need manual remediation later/);
  const w = cli(['new', '--name', 'x', '--objective', 'o', '--summary', 's'], { cwd: f.cons, tmp: f.t });
  assert.equal(w.status, 3);
  assert.equal(w.stdout, '');
  assert.match(w.stderr, /^❌ backlog: could not update .* from origin\/main .*nothing was read or changed/s);
});

test('next --agent and query --pop are refused: the next action of an agent is backlog team pop', () => {
  const f = fx();
  for (const cmd of [['query', '--pop'], ['next']]) {
    const n = cli([...cmd, '--agent', 'ann'], { cwd: f.cons, tmp: f.t });
    assert.equal(n.status, 2, cmd.join(' '));
    assert.equal(n.stdout, '');
    assert.match(n.stderr, /--pop is a team command: use backlog team pop --team <team> --agent <name> \(--dry-run only answers\)/);
  }
});

test('--only filters the listing query prints: new, open, done, archive', () => {
  const f = fx();
  const seqs = only => JSON.parse(view(f, ['--only', only, '--json']).stdout).phases.map(p => p.seq).sort();
  assert.deepEqual(seqs('done'), [4]);
  assert.deepEqual(seqs('open'), [1, 2, 3]);
  assert.deepEqual(seqs('new'), [1, 2]);
  assert.deepEqual(seqs('archive'), []);
  const text = view(f, ['--only', 'done']).stdout;
  assert.match(text, /004-delta/);
  assert.doesNotMatch(text, /001-alpha/);
  assert.equal(cli(['query', '--only', 'bogus'], { cwd: f.cons, tmp: f.t }).status, 2);
});

test('--branches counts the open and the done items of each branch of this repository', () => {
  const f = fx();
  assert.deepEqual(JSON.parse(view(f, ['--branches', '--json']).stdout), [{ branch: 'main', open: 3, done: 1 }, { branch: 'feature', open: 1, done: 0 }]);
  assert.match(view(f, ['--branches']).stdout, /^main {2}open 3 {2}done 1\nfeature {2}open 1 {2}done 0\n$/);
});

test('an unknown flag is exit 2', () => {
  const f = fx();
  const n = cli(['query', '--bogus'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 2);
  assert.match(n.stderr, /unrecognized arguments: --bogus/);
});

// --- review fixes (job 12) ---
for (const link of ['repo', 'owner']) test(`review P1: a symlink at ${{ repo: '<home>/<owner>/<repo>', owner: '<home>/<owner>' }[link]} is refused and nothing outside is touched`, () => {
  {
    const f = build(false);
    const outside = join(f.t, 'outside');
    const target = link === 'owner' ? join(f.home, 'acme') : f.folder;
    cpSync(target, outside, { recursive: true });
    rmSync(target, { recursive: true, force: true });
    symlinkSync(outside, target);
    const before = readdirSync(outside, { recursive: true }).sort();
    const n = cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t });
    assert.notEqual(n.status, 0, link);
    assert.match(n.stdout + n.stderr, /Symlink destination is unsupported|Unsafe path/, link);
    assert.deepEqual(readdirSync(outside, { recursive: true }).sort(), before, link);
  }
});

test('review P2: a symlink in the item folder is refused, and the file outside it is never read', () => {
  const f = build(false);
  writeFileSync(join(f.t, 'secret.md'), 'outside\n');
  symlinkSync(join(f.t, 'secret.md'), join(f.folder, 'phases', 'link.md'));
  const next = cli(['query', '--next', '--json'], { cwd: f.cons, tmp: f.t }); // reads the item files: the symlink itself is refused
  assert.equal(next.status, 1, next.stdout + next.stderr);
  assert.match(next.stderr, /Symlink destination is unsupported/);
  assert.doesNotMatch(next.stdout + next.stderr, /outside/);
});

test('review P2: input echoed in a diagnostic is redacted (flags, missing items)', () => {
  const f = build(false);
  const url = 'https://user:review_dummy@host/path';
  for (const args of [[`--bogus=${url}`], ['--phase', url], ['--events', url], [`--branch=${url}`, '--bogus']]) {
    const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
    assert.doesNotMatch(n.stdout + n.stderr, /review_dummy|user:/, args.join(' '));
    assert.notEqual(n.status, 0, args.join(' '));
  }
  assert.match(cli(['query', '--phase', url], { cwd: f.cons, tmp: f.t }).stdout, /^❌ no phase 'https:\/\/host\/path'/);
});

test('review P3: --json escapes U+007F and non-ASCII as \\u escapes', () => {
  const f = build(false);
  const item = store.load(f.folder).find(i => i.fm.phase === '001-alpha');
  store.write({ path: join(f.folder, item.path), fm: { ...item.fm, name: 'a\x7fb \x80 é' }, body: item.body }, f.folder);
  assert.match(view(f, ['--phase', '1', '--json']).stdout, /"name": "a\\u007fb \\u0080 \\u00e9"/);
});

test('review P2 (second): input echoed in a normal result is redacted too (--branch and --agent in every view)', () => {
  const f = build(false);
  const url = 'https://user:review_dummy@host/path';
  for (const args of [['query', '--next', '--branch', url], ['query', '--next', '--branch', url, '--json'], ['query', '--status', '--branch', url], ['query', '--status', '--branch', url, '--json'],
    ['team', 'query', '--team', 't1', '--claimable', '--branch', url], ['team', 'query', '--team', 't1', '--reviewable', '--agent', 'amy', '--branch', url],
    ['team', 'pop', '--team', 't1', '--agent', 'x', '--branch', url], ['team', 'pop', '--team', 't1', '--agent', 'x', '--branch', url, '--json'], ['team', 'pop', '--team', 't1', '--agent', url], ['team', 'pop', '--team', 't1', '--agent', url, '--json']]) {
    const n = cli(args, { cwd: f.cons, tmp: f.t });
    assert.doesNotMatch(n.stdout + n.stderr, /review_dummy|user:/, args.join(' '));
    assert.ok(n.stdout.length > 0, `${args.join(' ')} printed nothing (${n.stderr})`);
  }
});

test('query --pop is refused, --headless is accepted and ignored; query --plan still answers', () => {
  const f = fx();
  const pop = cli(['query', '--pop', '--agent', 'x'], { cwd: f.cons, tmp: f.t });
  assert.equal(pop.status, 2);
  assert.match(pop.stderr, /--pop is a team command/);
  for (const args of [['query', '--headless'], ['team', 'query', '--team', 't1', '--headless', '--plan', '--json']]) {
    const r = cli(args, { cwd: f.cons, tmp: f.t, env: { BACKLOG_HEADLESS: '1' } });
    assert.ok([0, 3].includes(r.status), `${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
  const plan = cli(['team', 'query', '--team', 't1', '--plan', '--json'], { cwd: f.cons, tmp: f.t, env: { TEAM_NAME: '', BACKLOG_AGENT: 'lead' } });
  assert.ok([0, 3].includes(plan.status), plan.stdout + plan.stderr); // the plan view answers or is idle, it is not an unknown flag
});
