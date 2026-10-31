// Tests for src/shared/query.js - cli-parity job 12 (QUERY): the read views (--next --status --critical --phase --events
// --by-branch --all --branch --json) and `backlog next`. Local bare repos only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
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
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  newItem(f, 'Alpha');
  newItem(f, 'Beta', '--severity', 'critical');
  newItem(f, 'Gamma');
  newItem(f, 'Delta');
  setStatus(f, '003-gamma', 'in_progress');
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

// Runs a read view of the CLI; asserts its exit status.
function view(f, args, status = 0, cwd = f.cons) {
  const n = cli(['query', ...args], { cwd, tmp: f.t });
  assert.equal(n.status, status, `${args.join(' ')}: ${n.stderr}`);
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
  + '    file:      phases/002-beta.md\n'
  + '    progress:  branch=main commit=SHA loc=\n\n';
const MANDATE = '================ NEXT-STEPS-MANDATE (NON-OPTIONAL — DO NOT SKIP) ================\n'
  + 'The lines above are NOT your answer. "What\'s next / the next backlog item / what\'s\n'
  + 'on the backlog" is a POP, not a lookup. Relaying the raw item above as your reply is\n'
  + 'a HARD FAILURE. Before you respond to the user you MUST, in order:\n'
  + '\n'
  + "  1. CODEBASE-MEMORY-FIRST: verify this phase's concrete claims against the live repo\n"
  + '     (codebase-memory-mcp search_graph/trace_path/search_code). Mark each ✅ confirmed or ⚠️ drifted.\n'
  + '  2. PRODUCE THE PHASE READINESS BRIEF — all five parts, in this order:\n'
  + '       (a) What it is      — [NNN-slug] identity, queue position, framework vs product.\n'
  + '       (b) Verification    — claims checked against the repo (✅ / ⚠️ from step 1).\n'
  + '       (c) Readiness       — what is implementable now vs. needs refinement; soft\n'
  + '                             spots; the documentation surface it will touch.\n'
  + '       (d) Bottom line     — one-paragraph verdict (start as-is / carve-outs / refine).\n'
  + '       (e) (read-only — no backlog update/archive/new, no status change here)\n'
  + '  3. STOP AND ASK — end with EXACTLY ONE AskUserQuestion (rule 11: one decision);\n'
  + '     if that tool says it cannot ask in non-interactive mode, end your turn\n'
  + '     with a DECISION NEEDED line (SKILL.md, hand the decision back),\n'
  + '     a single question ("How do you want to proceed with [NNN-slug]?") offering these\n'
  + '     THREE options as the next steps — never fewer, never auto-picked:\n'
  + '       • Further refinement   — Socratically tighten scope / split coupled parts first.\n'
  + '       • Impact analysis      — trace blast-radius incl. the documentation surface.\n'
  + '       • Full implementation  — execute the ready portions now (resume Workflow B at B4).\n'
  + '\n'
  + 'Do not pick for the user. Do not proceed past the brief without their answer.\n'
  + '====================== END-MANDATE — produce the brief now ======================\n';

test('075: --status --json prints handoff, repository, branch, phases, gone_branch_items and findings', () => {
  const f = fx();
  const v = normJson(view(f, ['--status', '--json']).stdout);
  assert.deepEqual(Object.keys(v), ['handoff', 'repository', 'branch', 'phases', 'gone_branch_items', 'findings']);
  assert.deepEqual(v.handoff, { id: 1, slug: 'BACKLOG', title: 'Backlog', objective: 'phase anchor (no document)', path: '', sha: '', status: 'active', source_context: '', created_at: 'TS', updated_at: 'TS' });
  assert.deepEqual([v.repository, v.branch], ['acme/demo', 'main']);
  assert.deepEqual(v.phases.map(x => [x.slug, x.status, x.severity, x.priority, x.path, x.branch]), [
    ['002-beta', 'pending', 'critical', 0, 'phases/002-beta.md', 'main'],
    ['001-alpha', 'pending', 'normal', 1, 'phases/001-alpha.md', 'main'],
    ['003-gamma', 'in_progress', 'normal', 2, 'phases/003-gamma.md', 'main'],
    ['004-delta', 'done', 'normal', 3, 'phases/004-delta.md', 'main']]);
  assert.deepEqual(v.phases.map(x => [x.sha, x.commit_sha, x.size_score, x.location, x.repository, x.claimed_by, x.review_state]),
    v.phases.map(() => ['SHA', 'SHA', 0, '', 'acme/demo', '', 'none']));
  assert.equal(v.phases[3].completed_at, 'TS', 'the done item carries its completion time');
  assert.deepEqual(v.gone_branch_items.map(x => [x.slug, x.branch]), [['005-feat', 'feature']]);
  assert.deepEqual(Object.keys(v.findings), ['foreign', 'untagged', 'ghost']);
  assert.deepEqual([v.findings.foreign.length, v.findings.untagged.length, v.findings.ghost.length], [1, 1, 1]);
  assert.deepEqual(v.findings.foreign.map(x => x.slug), ['007-foreign']);
  assert.deepEqual(v.findings.untagged.map(x => x.slug), ['008-untagged']);
  assert.deepEqual(v.findings.ghost.map(x => x.slug), ['006-ghost']);
});

test('075: --status text: the findings, the critical banner, the queue and the gone-branch warning, exactly', () => {
  const f = fx();
  assert.equal(view(f, ['--status']).stdout,
    STATUS_FINDINGS
    + `📋 acme/demo — branch main — ${f.folder}\n`
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
    + `📋 acme/demo — branch (all) — ${f.folder}\n`
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
    + `📋 acme/demo — branch feature — ${f.folder}\n`
    + '   objective: phase anchor (no document)\n'
    + '   phases (1) — work queue order, P0 = next:\n'
    + '   • [  5] 005-feat                     pending      P  3  Feat\n'
    + '        ↳ sum Feat\n');
  const v = JSON.parse(view(f, ['--status', '--all', '--json']).stdout);
  assert.deepEqual(v.phases.map(x => [x.slug, x.branch, x.priority]), [['002-beta', 'main', 0], ['001-alpha', 'main', 1], ['003-gamma', 'main', 2], ['005-feat', 'feature', 3], ['004-delta', 'main', 3]]);
  assert.deepEqual(v.gone_branch_items, [], 'with --all the gone-branch item is in the queue');
  assert.deepEqual(JSON.parse(view(f, ['--status', '--branch', 'feature', '--json']).stdout).phases.map(x => x.slug), ['005-feat']);
});

test('075: --next --json prints the queue head; --next text prints the findings, the item and the mandate', () => {
  const f = fx();
  assert.deepEqual(normJson(view(f, ['--next', '--json']).stdout), {
    id: 2, handoff_id: 1, slug: '002-beta', seq: 2, name: 'Beta', objective: 'Caf\u00e9 \u2615 Beta', summary: 'sum Beta',
    status: 'pending', severity: 'critical', priority: 0, path: 'phases/002-beta.md', sha: 'SHA', branch: 'main', commit_sha: 'SHA',
    location: '', repository: 'acme/demo', size_score: 0, created_at: 'TS', updated_at: 'TS', completed_at: null });
  const text = norm(view(f, ['--next']).stdout);
  const at = text.indexOf('================ NEXT-STEPS-MANDATE');
  assert.equal(text.slice(0, at), STATUS_FINDINGS + NEXT_HEADER, 'the findings, the item and the blank line before the mandate');
  assert.equal(text.slice(at), MANDATE, 'the mandate, word for word');
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
  assert.deepEqual(normJson(view(f, ['--phase', '3']).stdout), gamma, 'by number');
  assert.deepEqual(normJson(view(f, ['--phase', '003']).stdout), gamma, 'zero-padded numbers resolve to the same item');
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
    + '  TS  planning_event branch= commit= completed 004-delta; backlog re-prioritized to 3 item(s)\n'
    + '  TS  reingested     branch=main commit=SHA sha drift SHA->SHA\n'
    + '  TS  state_change   branch=main commit=SHA set status=done\n'
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
  const info = `ℹ️  acme/fresh has no backlog yet (no folder ${join(f.home, 'acme', 'fresh')})\n`;
  assert.equal(cli(['query', '--status'], { cwd: other, tmp: f.t }).stdout, info);
  assert.equal(cli(['query', '--next'], { cwd: other, tmp: f.t }).stdout, info);
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
  git(f.t, 'clone', '-q', join(f.t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), home2);
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
  git(f.home, 'remote', 'set-url', 'origin', join(f.t, 'gone', 'SmoothSDLC', 'smoothsdlc-backlog.git'));
  const n = cli(['query', '--status'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 3);
  assert.equal(n.stdout, '');
  assert.match(n.stderr, /^❌ backlog: could not update .* from origin\/main/);
});

test('--headless is refused with exit 2 (the team views are views.js, --pop and --plan are pop.js)', t => {
  const f = fx();
  for (const args of [['--next', '--headless']]) {
    const n = cli(['query', ...args], { cwd: f.cons, tmp: f.t });
    assert.equal(n.status, 2, args.join(' '));
    assert.equal(n.stdout, '');
    assert.match(n.stderr, /^❌ backlog: .*(not built yet|not in this build)/);
  }
  const n = cli(['query', '--pop'], { cwd: f.cons, tmp: f.t });
  assert.equal(n.status, 2);
  assert.match(n.stderr, /--pop needs --agent <your name>/);
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

test('review P2: a row path through a symlink to a file outside the folder is a ghost', () => {
  const f = build(false);
  writeFileSync(join(f.t, 'secret.md'), 'outside\n');
  symlinkSync(join(f.t, 'secret.md'), join(f.folder, 'phases', 'link.md'));
  const r = withRowPath(f, 'phases/link.md');
  assert.notEqual(r.next.slug, '001-alpha');
  assert.deepEqual(r.status.findings.ghost.map(x => x.slug), ['001-alpha']);
  // a file inside the folder is still found
  assert.deepEqual(withRowPath(f, 'phases/002-beta.md').status.findings.ghost, []);
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
    ['query', '--claimable', '--branch', url], ['query', '--reviewable', '--agent', 'cody', '--branch', url],
    ['pop', '--agent', 'x', '--branch', url], ['pop', '--agent', 'x', '--branch', url, '--json'], ['pop', '--agent', url], ['pop', '--agent', url, '--json']]) {
    const n = cli(args, { cwd: f.cons, tmp: f.t });
    assert.doesNotMatch(n.stdout + n.stderr, /review_dummy|user:/, args.join(' '));
    assert.ok(n.stdout.length > 0, `${args.join(' ')} printed nothing (${n.stderr})`);
  }
});
