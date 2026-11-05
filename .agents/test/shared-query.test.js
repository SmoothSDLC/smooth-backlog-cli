// Tests for src/shared/query.js - cli-parity job 12 (QUERY): the read views (--next --status --critical --phase --events
// --by-branch --all --branch --json) and `backlog next`. Local bare repos only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
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
// origin (a gone-branch item), and hand-made foreign, untagged and ghost findings. Mode is set to shared.
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
    newItem(f, 'Ghost');
    const item = (seq, name, extra) => store.write({
      path: join(f.folder, `phases/${String(seq).padStart(3, '0')}-${name}.md`),
      fm: { phase: `${String(seq).padStart(3, '0')}-${name}`, seq, name, objective: 'o', summary: 's', status: 'pending', severity: 'normal', priority: 9, repository: 'acme/demo', branch: 'main', commit: 'abc1234', location: '', ...extra },
      body: `\n# Phase ${seq}\n`,
    });
    item(store.nextSeq(f.folder), 'foreign', { repository: 'other/thing' });
    item(store.nextSeq(f.folder), 'untagged', { branch: '' });
    const con = db.connect(f.folder);
    db.scan(con, f.folder);
    con.close();
    rmSync(join(f.folder, 'phases', '006-ghost.md'));
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
const STATUS_FINDINGS = '⚠️  CRITICAL: phases/007-foreign.md says repository other/thing but is in the folder of acme/demo; it is out of the queue. Move it: backlog move 007-foreign --to-repository\n'
  + '⚠️  CRITICAL: item 006-ghost has a database row but its file phases/006-ghost.md is gone (deleted outside the scripts); it is out of the queue. Restore the file from git\n'
  + '⚠️  item 008-untagged records no repository or branch; it is out of the queue until its repository and branch are filled in\n'
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
      "status": "in_progress",
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
      "status": "done",
      "severity": "normal",
      "priority": 3,
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
      "priority": 3,
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
        "id": 7,
        "handoff_id": 1,
        "slug": "007-foreign",
        "seq": 7,
        "name": "foreign",
        "objective": "o",
        "summary": "s",
        "status": "pending",
        "severity": "normal",
        "priority": 9,
        "path": "phases/007-foreign.md",
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
        "id": 8,
        "handoff_id": 1,
        "slug": "008-untagged",
        "seq": 8,
        "name": "untagged",
        "objective": "o",
        "summary": "s",
        "status": "pending",
        "severity": "normal",
        "priority": 9,
        "path": "phases/008-untagged.md",
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
    ],
    "ghost": [
      {
        "id": 6,
        "handoff_id": 1,
        "slug": "006-ghost",
        "seq": 6,
        "name": "Ghost",
        "objective": "Caf\u00e9 \u2615 Ghost",
        "summary": "sum Ghost",
        "status": "pending",
        "severity": "normal",
        "priority": 4,
        "path": "phases/006-ghost.md",
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
        "review_state": ""
      }
    ]
  }
}
`);
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
    + '   🔄 [  3] 003-gamma                    in_progress  P  2  Gamma\n'
    + '        ↳ sum Gamma\n'
    + '   ✅ [  4] 004-delta                    done         P  3  Delta\n'
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
    + '   • [  1] 001-alpha                    pending      P  1  Alpha\n'
    + '        ↳ sum Alpha\n'
    + '   🔄 [  3] 003-gamma                    in_progress  P  2  Gamma\n'
    + '        ↳ sum Gamma\n'
    + '   • [  5] 005-feat                     pending      P  3  Feat\n'
    + '        ↳ sum Feat\n'
    + '   ✅ [  4] 004-delta                    done         P  3  Delta\n'
    + '        ↳ sum Delta\n');
  assert.equal(view(f, ['--status', '--branch', 'feature']).stdout,
    STATUS_FINDINGS
    + '📋 acme/demo — branch feature\n'
    + '   objective: phase anchor (no document)\n'
    + '   phases (1) — work queue order, P0 = next:\n'
    + '   • [  5] 005-feat                     pending      P  3  Feat\n'
    + '        ↳ sum Feat\n');
  const v = JSON.parse(view(f, ['--status', '--all', '--json']).stdout);
  assert.deepEqual(v.phases.map(x => [x.slug, x.branch, x.priority]), [['002-beta', 'main', 0], ['001-alpha', 'main', 1], ['003-gamma', 'main', 2], ['005-feat', 'feature', 3], ['004-delta', 'main', 3]]);
  assert.deepEqual(v.gone_branch_items, [], 'with --all the gone-branch item is in the queue');
  // the branch view's JSON, whole: the handoff, the branch, that branch's queue only, no gone-branch items, and the findings
  assert.deepEqual(normJson(view(f, ['--status', '--branch', 'feature', '--json']).stdout), {
    handoff: { id: 1, slug: 'BACKLOG', title: 'Backlog', objective: 'phase anchor (no document)', path: '', sha: '', status: 'active', source_context: '', created_at: 'TS', updated_at: 'TS' },
    repository: 'acme/demo',
    branch: 'feature',
    phases: [{
      id: 5, handoff_id: 1, slug: '005-feat', seq: 5, name: 'Feat', objective: 'Caf\u00e9 \u2615 Feat', summary: 'sum Feat',
      status: 'pending', severity: 'normal', priority: 3, path: 'phases/005-feat.md', sha: 'SHA', branch: 'feature', commit_sha: 'SHA',
      location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null,
      claimed_by: '', review_state: 'none'
    }],
    gone_branch_items: [],
    findings: {
      foreign: [{ id: 7, handoff_id: 1, slug: '007-foreign', seq: 7, name: 'foreign', objective: 'o', summary: 's', status: 'pending', severity: 'normal', priority: 9, path: 'phases/007-foreign.md', sha: 'SHA', branch: 'main', commit_sha: 'SHA', location: '', repository: 'other/thing', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null, claimed_by: '', review_state: '' }],
      untagged: [{ id: 8, handoff_id: 1, slug: '008-untagged', seq: 8, name: 'untagged', objective: 'o', summary: 's', status: 'pending', severity: 'normal', priority: 9, path: 'phases/008-untagged.md', sha: 'SHA', branch: '', commit_sha: 'SHA', location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null, claimed_by: '', review_state: '' }],
      ghost: [{ id: 6, handoff_id: 1, slug: '006-ghost', seq: 6, name: 'Ghost', objective: 'Caf\u00e9 \u2615 Ghost', summary: 'sum Ghost', status: 'pending', severity: 'normal', priority: 4, path: 'phases/006-ghost.md', sha: 'SHA', branch: 'main', commit_sha: 'SHA', location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null, claimed_by: '', review_state: '' }]
    }
  });
});

test('075: --next --json prints the queue head; --next text prints the findings and the item', () => {
  const f = fx();
  assert.deepEqual(normJson(view(f, ['--next', '--json']).stdout), {
    id: 2, handoff_id: 1, slug: '002-beta', seq: 2, name: 'Beta', objective: 'Caf\u00e9 \u2615 Beta', summary: 'sum Beta',
    status: 'pending', severity: 'critical', priority: 0, path: 'phases/002-beta.md', sha: 'SHA', branch: 'main', commit_sha: 'SHA',
    location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null });
  assert.equal(norm(view(f, ['--next']).stdout), STATUS_FINDINGS + NEXT_HEADER, 'the findings and the item');
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
  assert.match(text, /^⚠️  CRITICAL: phases\/007-foreign\.md says repository other\/thing/);
  assert.ok(text.endsWith('\nℹ️  no actionable item for acme/demo, branch nowhere; --all shows every branch\n'), text);
  assert.equal(view(f, ['--next', '--branch', 'nowhere', '--json']).stdout.trim(), '{}');
});

test('075: --phase prints the full item (row, front matter, body, missing) by slug and by number; not found is exit 1 on stdout', () => {
  const f = fx();
  const beta = { id: 2, handoff_id: 1, slug: '002-beta', seq: 2, name: 'Beta', objective: 'Caf\u00e9 \u2615 Beta', summary: 'sum Beta', status: 'pending', severity: 'critical', priority: 0, path: 'phases/002-beta.md', sha: 'SHA', branch: 'main', commit_sha: 'SHA', location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null,
    front_matter: { phase: '002-beta', seq: 2, name: 'Beta', objective: 'Caf\u00e9 \u2615 Beta', summary: 'sum Beta', status: 'pending', severity: 'critical', priority: 0, repository: 'acme/demo', branch: 'main', commit: 'SHA', location: '', created: 'TS', updated: 'TS', updated_by: 'UPD', depends_on: [], claimed_by: '', claimed_at: '', review_state: 'none', reviewer: '' },
    body: '\n# Phase 002 — Beta\n\n**Objective:** Caf\u00e9 \u2615 Beta\n\n\n## Definition of done\n\n- [ ] <machine-checkable acceptance>\n',
    missing: ['review_refs', 'estimate_min', 'definition_of_done'] };
  assert.deepEqual(normJson(view(f, ['--phase', '002-beta']).stdout), beta, 'by slug');
  const gamma = { ...beta, id: 3, seq: 3, slug: '003-gamma', name: 'Gamma', objective: 'Caf\u00e9 \u2615 Gamma', summary: 'sum Gamma', status: 'in_progress', severity: 'normal', priority: 2, path: 'phases/003-gamma.md',
    front_matter: { ...beta.front_matter, phase: '003-gamma', seq: 3, name: 'Gamma', objective: 'Caf\u00e9 \u2615 Gamma', summary: 'sum Gamma', status: 'in_progress', severity: 'normal', priority: 2 } };
  gamma.body = '\n# Phase 003 — Gamma\n\n**Objective:** Caf\u00e9 \u2615 Gamma\n\n\n## Definition of done\n\n- [ ] <machine-checkable acceptance>\n';
  // the item carries its history (events) in its front matter: compared apart from the rest
  const noEvents = j => { const { events, ...fm } = j.front_matter; return [{ ...j, front_matter: fm }, events]; };
  const [byNumber, events] = noEvents(normJson(view(f, ['--phase', '3']).stdout));
  assert.deepEqual(byNumber, gamma, 'by number');
  assert.equal(events.length, 1);
  assert.match(events[0], /^TS state_change main \S+ set status=in_progress$/);
  assert.deepEqual(noEvents(normJson(view(f, ['--phase', '003']).stdout))[0], gamma, 'zero-padded numbers resolve to the same item');
  assert.match(view(f, ['--phase', 'nope'], 1).stdout, /no phase 'nope'/);
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
  assert.equal(norm(view(f, ['--events']).stdout),
    '  TS  ingested       branch= commit=SHA new phase 008-untagged\n'
    + '  TS  ingested       branch=main commit=SHA new phase 007-foreign\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  planning_event branch= commit= added 006-ghost at rank end; backlog re-densified to 5 item(s)\n'
    + '  TS  ingested       branch=main commit=SHA new phase 006-ghost\n'
    + '  TS  reingested     branch=feature commit=SHA sha drift SHA->SHA\n'
    + '  TS  planning_event branch= commit= added 005-feat at rank end; backlog re-densified to 4 item(s)\n'
    + '  TS  ingested       branch=feature commit=SHA new phase 005-feat\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  planning_event branch= commit= completed 004-delta; backlog re-prioritized to 3 item(s)\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  state_change   branch=main commit=SHA set status=done, handoffs=none\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    // item 088: the fixture completes Delta through both review stages before the done transition; their events are here
    + '  TS  reviewed       branch=main commit=SHA set reviewed=Review by rex: PASS (TS)\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  review_started branch=main commit=SHA set review_started=Review started by rex at TS\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  review_requested branch=main commit=SHA n\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  reviewed       branch=main commit=SHA set reviewed=Review by amy-a: PASS (TS)\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  review_started branch=main commit=SHA set review_started=Review started by amy-a at TS\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  review_requested branch=main commit=SHA n\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  state_change   branch=main commit=SHA set estimate_min=5, review_refs=references/review/code.md\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  state_change   branch=main commit=SHA set status=in_progress\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  planning_event branch= commit= added 004-delta at rank end; backlog re-densified to 4 item(s)\n'
    + '  TS  ingested       branch=main commit=SHA new phase 004-delta\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  planning_event branch= commit= added 003-gamma at rank end; backlog re-densified to 3 item(s)\n'
    + '  TS  ingested       branch=main commit=SHA new phase 003-gamma\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  planning_event branch= commit= added 002-beta at rank 0; backlog re-densified to 2 item(s)\n'
    + '  TS  ingested       branch=main commit=SHA new phase 002-beta\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  planning_event branch= commit= added 001-alpha at rank end; backlog re-densified to 1 item(s)\n'
    + '  TS  ingested       branch=main commit=SHA new phase 001-alpha\n');
  assert.equal(norm(view(f, ['--events', '002-beta']).stdout), '  TS  ingested       branch=main commit=SHA new phase 002-beta\n', 'one item: only its own lines');
  assert.equal(norm(view(f, ['--by-branch', 'main']).stdout),
    '  [  1] 001-alpha                    pending      commit=SHA \n'
    + '  [  2] 002-beta                     pending      commit=SHA \n'
    + '  [  3] 003-gamma                    in_progress  commit=SHA \n'
    + '  [  4] 004-delta                    done         commit=SHA \n'
    + '  [  6] 006-ghost                    pending      commit=SHA \n'
    + '  [  7] 007-foreign                  pending      commit=SHA \n');
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

test('a failed pull stops the read: exit 3 and nothing printed on stdout', t => {
  const f = build(false);
  git(f.home, 'remote', 'set-url', 'origin', join(f.t, 'gone', BACKLOG_OWNER, `${BACKLOG_NAME}.git`));
  const n = cli(['query', '--status'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 3);
  assert.equal(n.stdout, '');
  assert.match(n.stderr, /^❌ backlog: could not update .* from origin\/main/);
});

test('--next with --agent is refused: the next action of an agent is backlog pop', () => {
  const f = fx();
  for (const cmd of [['query', '--next'], ['next']]) {
    const n = cli([...cmd, '--agent', 'ann'], { cwd: f.cons, tmp: f.t });
    assert.equal(n.status, 2, cmd.join(' '));
    assert.equal(n.stdout, '');
    assert.match(n.stderr, /backlog pop --agent/);
  }
});

test('an unknown flag is exit 2', () => {
  const f = fx();
  const n = cli(['query', '--bogus'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 2);
  assert.match(n.stderr, /unrecognized arguments: --bogus/);
});

// --- review fixes (job 12) ---
for (const link of ['repo', 'db', 'owner']) test(`review P1: a symlink at ${{ repo: '<home>/<owner>/<repo>', db: 'backlog.db', owner: '<home>/<owner>' }[link]} is refused and the outside database is not touched`, () => {
  {
    const f = build(false);
    const outside = join(f.t, 'outside');
    const target = link === 'owner' ? join(f.home, 'acme') : link === 'repo' ? f.folder : join(f.folder, 'backlog.db');
    cpSync(target, outside, { recursive: true });
    rmSync(target, { recursive: true, force: true });
    symlinkSync(outside, target);
    const dbFile = link === 'db' ? outside : join(outside, ...(link === 'owner' ? ['demo'] : []), 'backlog.db');
    const before = readFileSync(dbFile);
    const n = cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t });
    assert.notEqual(n.status, 0, link);
    assert.match(n.stdout + n.stderr, /Symlink destination is unsupported|Unsafe path/, link);
    assert.deepEqual(readFileSync(dbFile), before, link);
  }
});

// Points the 001-alpha row (queue head) at `path` and returns the Node view of --next --json / --status --json.
function withRowPath(f, path) {
  const con = db.connect(f.folder);
  con.prepare("UPDATE phase SET path=?, priority=-1 WHERE slug='001-alpha'").run(path);
  con.close();
  return {
    next: JSON.parse(cli(['query', '--next', '--json'], { cwd: f.cons, tmp: f.t }).stdout),
    status: JSON.parse(cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t }).stdout),
  };
}

test('review P2: a row path that leaves the folder (.. or absolute) is a ghost, not an existing file', () => {
  const f = build(false);
  const secret = join(f.t, 'secret.md');
  writeFileSync(secret, 'outside\n');
  for (const path of ['../../../secret.md', secret, '../../../../../../../../../etc/passwd']) {
    const r = withRowPath(f, path);
    assert.notEqual(r.next.slug, '001-alpha', path);
    assert.deepEqual(r.status.findings.ghost.map(x => x.slug), ['001-alpha'], path);
  }
});

test('review P2: a symlink in the item folder is refused, and the file outside it is never read', () => {
  const f = build(false);
  writeFileSync(join(f.t, 'secret.md'), 'outside\n');
  symlinkSync(join(f.t, 'secret.md'), join(f.folder, 'phases', 'link.md'));
  const con = db.connect(f.folder);
  con.prepare("UPDATE phase SET path=?, priority=-1 WHERE slug='001-alpha'").run('phases/link.md');
  con.close();
  const status = cli(['query', '--status', '--json'], { cwd: f.cons, tmp: f.t });
  assert.deepEqual(JSON.parse(status.stdout).findings.ghost.map(x => x.slug), ['001-alpha'], 'the row whose path leaves the folder is a ghost');
  const next = cli(['query', '--next', '--json'], { cwd: f.cons, tmp: f.t }); // reads the item files: the symlink itself is refused
  assert.equal(next.status, 1, next.stdout + next.stderr);
  assert.match(next.stderr, /Symlink destination is unsupported/);
  assert.doesNotMatch(status.stdout + next.stdout + next.stderr, /outside/);
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
  const con = db.connect(f.folder);
  con.prepare("UPDATE phase SET name=? WHERE slug='001-alpha'").run('a\x7fb \x80 é');
  con.close();
  assert.match(view(f, ['--phase', '1', '--json']).stdout, /"name": "a\\u007fb \\u0080 \\u00e9"/);
});

test('review P2 (second): input echoed in a normal result is redacted too (--branch and --agent in every view)', () => {
  const f = build(false);
  const url = 'https://user:review_dummy@host/path';
  for (const args of [['query', '--next', '--branch', url], ['query', '--next', '--branch', url, '--json'], ['query', '--status', '--branch', url], ['query', '--status', '--branch', url, '--json'],
    ['query', '--claimable', '--branch', url], ['query', '--reviewable', '--agent', 'amy', '--branch', url],
    ['pop', '--agent', 'x', '--branch', url], ['pop', '--agent', 'x', '--branch', url, '--json'], ['pop', '--agent', url], ['pop', '--agent', url, '--json']]) {
    const n = cli(args, { cwd: f.cons, tmp: f.t });
    assert.doesNotMatch(n.stdout + n.stderr, /review_dummy|user:/, args.join(' '));
    assert.ok(n.stdout.length > 0, `${args.join(' ')} printed nothing (${n.stderr})`);
  }
});

test('query --pop and --headless are not options; query --plan still answers', () => {
  const f = fx();
  for (const args of [['query', '--pop', '--agent', 'x'], ['query', '--headless'], ['pop', '--headless', '--agent', 'x']]) {
    const r = cli(args, { cwd: f.cons, tmp: f.t });
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /unrecognized arguments: --(pop|headless)/);
  }
  const plan = cli(['query', '--plan', '--json'], { cwd: f.cons, tmp: f.t, env: { TEAM_NAME: '', BACKLOG_AGENT: 'lead' } });
  assert.ok([0, 3].includes(plan.status), plan.stdout + plan.stderr); // the plan view answers or is idle, it is not an unknown flag
});
