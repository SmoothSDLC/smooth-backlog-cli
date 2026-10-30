// Shared-mode read views (cli-parity job 12): `backlog query` and `backlog next`. Port of query.py:361-619
// (--next --status --critical --phase --events --by-branch --all --branch --json) over the backlog.db mirror,
// the oracle's order: pull, no-backlog check, branch, connect, findings. Output strings and --json match query.py.
// Never writes an item (the db is opened as lib_db.connect does). The team views are views.js, --pop and --plan are pop.js; --headless is refused.
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { BacklogError } from '../errors.js';
import * as db from './db.js';
import { assertInside, git, itemSelector, redact } from './safety.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import * as team from './team.js';
import { teamScope } from './team.js';
import { SCOPES, teamView } from './views.js';
import { wipView } from './wip.js';

const BOOL = ['next', 'status', 'critical', 'json', 'all', 'claimable', 'reviewable', 'blocked', 'decisions', 'pop', 'plan', 'claim-now', 'headless', 'wip'];
const VALUE = ['phase', 'by-branch', 'branch', 'agent', 'lead', 'agents', 'roster', 'scope'];
const ACTIONABLE = ['pending', 'in_progress'];
const OPEN = "SELECT * FROM phase WHERE handoff_id=? AND status IN ('pending','in_progress') ORDER BY priority ASC, seq ASC";

// query.py:367-403 argparse. --events takes an optional value (const "*"); shortcut: no unique-prefix abbreviations.
function parse(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const [flag, eq] = argv[i].startsWith('--') ? argv[i].slice(2).split(/=(.*)/s) : [null];
    if (BOOL.includes(flag) && eq === undefined) a[flag] = true;
    else if (VALUE.includes(flag)) {
      const v = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('-') ? undefined : argv[++i]);
      if (v === undefined) throw new BacklogError('INVALID_INPUT', `argument --${flag}: expected one argument`);
      if (flag === 'scope' && !SCOPES.includes(v)) throw new BacklogError('INVALID_INPUT', `argument --scope: invalid choice: ${repr(v)} (choose from ${SCOPES.map(repr).join(', ')})`);
      a[flag] = v;
    } else if (flag === 'events') a.events = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('-') ? '*' : argv[++i]);
    else throw new BacklogError('INVALID_INPUT', `unrecognized arguments: ${argv[i]}`);
  }
  return a;
}

const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const say = text => process.stdout.write(`${text}\n`);
// Python json.dumps(indent=2): ensure_ascii escapes every non-ASCII UTF-16 unit.
const dump = v => say(JSON.stringify(v, null, 2).replace(/[\u007f-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
const sha7 = r => String(r.commit_sha ?? '').slice(0, 7);
const pad = (v, n) => String(v).padStart(n);
const repr = s => redact(s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s}'`);

// A row's file exists only when it resolves inside the repository folder (no .., absolute path or symlink out).
// The oracle follows such a path; here it counts as gone, since the row is mirror data and not to be trusted.
function present(folder, path) {
  try { return realpathSync(resolve(folder, String(path))).startsWith(realpathSync(folder) + sep); } catch { return false; }
}

// lib_db.py:302-313 over the mirror rows: the file of a row is looked up in the repository folder.
function findings(rows, folder, repo) {
  const out = { foreign: [], untagged: [], ghost: [] };
  for (const r of rows) {
    if (r.status === 'archived') continue;
    if (!present(folder, r.path)) out.ghost.push(r);
    else if (!r.repository || !r.branch) out.untagged.push(r);
    else if (r.repository !== repo) out.foreign.push(r);
  }
  return out;
}

// scan.py:26-38
function findingLines(f, repo) {
  return [
    ...f.foreign.map(r => `⚠️  CRITICAL: ${r.path} says repository ${r.repository} but is in the folder of ${repo}; it is out of the queue. Move it: backlog move ${r.slug} --to-repository`),
    ...f.ghost.map(r => `⚠️  CRITICAL: item ${r.slug} has a database row but its file ${r.path} is gone (deleted outside the scripts); it is out of the queue. Restore the file from git`),
    ...(f.bare ?? []).map(p => `⚠️  ${p} has no front matter block; it is not an item, is out of the queue and is never rewritten. Add the front matter or move the file out of phases/`),
    ...f.untagged.map(r => `⚠️  item ${r.slug} records no repository or branch; it is out of the queue until its repository and branch are filled in`),
  ];
}

// query.py:351-364
function criticalBanner(crit) {
  if (!crit.length) return 0;
  const bar = `⚠️ ${'='.repeat(72)}`;
  say(bar);
  say(`⚠️  ${crit.length} CRITICAL ITEM(S) ON THE BACKLOG — SURFACE THESE FIRST, DO NOT BURY:`);
  for (const r of crit) say(`⚠️    P${String(r.priority).padEnd(3)} [${pad(r.seq, 3)}] ${r.slug} — ${r.name}`);
  say(bar);
  return crit.length;
}

// query.py:42-67, the text --next must emit after the item.
const MANDATE = `
================ NEXT-STEPS-MANDATE (NON-OPTIONAL — DO NOT SKIP) ================
The lines above are NOT your answer. "What's next / the next backlog item / what's
on the backlog" is a POP, not a lookup. Relaying the raw item above as your reply is
a HARD FAILURE. Before you respond to the user you MUST, in order:

  1. CODEBASE-MEMORY-FIRST: verify this phase's concrete claims against the live repo
     (codebase-memory-mcp search_graph/trace_path/search_code). Mark each ✅ confirmed or ⚠️ drifted.
  2. PRODUCE THE PHASE READINESS BRIEF — all five parts, in this order:
       (a) What it is      — [NNN-slug] identity, queue position, framework vs product.
       (b) Verification    — claims checked against the repo (✅ / ⚠️ from step 1).
       (c) Readiness       — what is implementable now vs. needs refinement; soft
                             spots; the documentation surface it will touch.
       (d) Bottom line     — one-paragraph verdict (start as-is / carve-outs / refine).
       (e) (read-only — no backlog update/archive/new, no status change here)
  3. STOP AND ASK — end with EXACTLY ONE AskUserQuestion (rule 11: one decision);
     if that tool says it cannot ask in non-interactive mode, end your turn
     with a DECISION NEEDED line (SKILL.md, hand the decision back),
     a single question ("How do you want to proceed with [NNN-slug]?") offering these
     THREE options as the next steps — never fewer, never auto-picked:
       • Further refinement   — Socratically tighten scope / split coupled parts first.
       • Impact analysis      — trace blast-radius incl. the documentation surface.
       • Full implementation  — execute the ready portions now (resume Workflow B at B4).

Do not pick for the user. Do not proceed past the brief without their answer.
====================== END-MANDATE — produce the brief now ======================`;

// query.py:361-625
export const run = argv => store.cloneLocked(store.resolveHome().home, () => query(argv)); // a read that pulls waits for a writer of the clone
async function query(argv) {
  let a;
  try { a = parse(argv); } catch (e) { return die(e.message); }
  if (a.next && a.agent) a.pop = true;
  if (a.pop && !a.agent) return die('--pop needs --agent <your name>');
  if (a.headless) return die('--headless is not in this build');
  if (a.agents && !a.plan) return die('--agents goes with --plan (the team members present)');
  if (a.pop || a.plan) return (await import('./pop.js')).run(argv); // pop.js repeats the preamble below for its own flags (--plan: item 052)

  const cwd = process.cwd();
  let repo;
  try { repo = teamScope().repo || store.repoId(cwd); } catch (e) { return die(e.message); }
  const { home } = store.resolveHome();
  try { await sync.pull(home); } catch (e) { if (e instanceof BacklogError) return die(e.message, e.exitCode); throw e; }
  if (a.wip) { // item 034: the counts against every work-in-progress limit and the stale in-progress items, whole backlog home
    const v = wipView(home);
    if (a.json) { dump(v); return 0; }
    say(`📊 work in progress — ${v.limits_file}${existsSync(v.limits_file) ? '' : ' (none: no limits)'}`);
    for (const c of v.counts) say(`   ${c.level.padEnd(10)} ${String(c.key).padEnd(48)} ${String(c.count).padStart(3)}${c.limit === null ? '' : ` / ${c.limit}${c.count >= c.limit ? '  ⚠️ at the limit' : ''}`}`);
    say(`   stale (no change of their own for more than ${v.stale_hours} h): ${v.stale.length}`);
    for (const x of v.stale) say(`      - ${x.item} ${x.slug} (${x.holder || 'nobody'}, updated ${x.updated})`);
    return 0;
  }
  let folder;
  try { folder = store.folder(home, repo); } catch (e) { return die(e.message); } // TEAM_REPOSITORY=../x passes the owner/name pattern; the folder must stay inside the home
  if (!existsSync(join(folder, 'backlog.db'))) {
    say(a.json ? '{}' : `ℹ️  ${repo} has no backlog yet (no folder ${folder})`);
    return 0;
  }
  const branch = a.branch || teamScope().branch || (await git(['branch', '--show-current'], cwd)).stdout.trim(); // lib_db.git_branch: TEAM_BRANCH wins
  const plain = a.phase || a.events !== undefined || a['by-branch'] || a.critical;
  if (!branch && !a.all && (a.next || !plain)) return die('HEAD is detached: pass --branch <name> (the branch whose queue you want) or --all');

  await assertInside(home, join(folder, 'backlog.db')); // no symlink between the home and the db (db.connect checks only below the owner)
  const con = db.connect(folder);
  try {
    const all = (sql, ...p) => con.prepare(sql).all(...p).map(r => ({ ...r }));
    const one = (sql, ...p) => { const r = con.prepare(sql).get(...p); return r && { ...r }; };
    const hid = one("SELECT id FROM handoff WHERE status='active' LIMIT 1")?.id ?? null;
    const critical = () => (hid === null ? [] : all("SELECT * FROM phase WHERE handoff_id=? AND status IN ('pending','in_progress') AND severity='critical' ORDER BY priority ASC, seq ASC", hid));
    const bad = findings(all("SELECT * FROM phase WHERE status NOT IN ('archived')"), folder, repo);
    const bare = store.bareFiles(folder);
    if (bare.length) bad.bare = bare; // only when there is one: the --json findings keep the oracle's three keys
    const excluded = new Set(Object.values(bad).flat().map(r => r.id));
    const lines = findingLines(bad, repo);
    if (!a.json && lines.length && (a.next || !plain)) lines.forEach(say); // findings lead the queue views only

    if (a.critical) {
      const crit = critical();
      if (a.json) dump(crit);
      else if (!criticalBanner(crit)) say('✅ no open CRITICAL items on the backlog');
      return 0;
    }

    if (a.claimable || a.reviewable || a.blocked || a.decisions) return teamView(a, { all, hid, excluded, repo, branch, folder, home, io: { say, dump, die, repr } });

    if (a.next) {
      const r = all(OPEN, hid).find(x => !excluded.has(x.id) && (a.all || ((x.repository || '') === repo && (x.branch || '') === branch)));
      if (!r) {
        say(a.json ? '{}' : `ℹ️  no actionable item for ${repo}${a.all ? '' : `, branch ${redact(branch)}; --all shows every branch`}`);
        return 0;
      }
      if (a.json) { dump(r); return 0; }
      if (process.env.BACKLOG_HEADLESS === '1') return die('BACKLOG_HEADLESS=1 is not in this build');
      criticalBanner(critical());
      say(`➡️  NEXT: P${r.priority} (rank 0 = next) — [${pad(r.seq, 3)}] ${r.slug}  (${r.status})${(r.severity || 'normal') === 'critical' ? '  ⚠️ CRITICAL' : ''}`);
      say(`    ${r.name}`);
      say(`    objective: ${r.objective}`);
      say(`    summary:   ${r.summary}`);
      say(`    file:      ${r.path}`);
      if (r.branch || r.commit_sha || r.location) say(`    progress:  branch=${r.branch} commit=${sha7(r)} loc=${r.location}`);
      say(MANDATE);
      return 0;
    }

    if (a.phase && String(a.phase).includes(',')) { // item 053: several items at once, one JSON object each, in an array
      const out = [];
      for (const id of String(a.phase).split(',').map(x => x.trim()).filter(Boolean)) {
        const sel = itemSelector(id);
        const r = sel && (sel.number !== undefined
          ? one("SELECT * FROM phase WHERE seq=? ORDER BY CASE status WHEN 'archived' THEN 1 ELSE 0 END, id", sel.number)
          : one('SELECT * FROM phase WHERE slug=?', sel.slug));
        if (!r) { say(`❌ no phase ${repr(id)}`); return 1; }
        const file = store.load(folder).find(i => i.path === r.path);
        out.push({ ...r, front_matter: file ? file.fm : null, body: file ? file.body : null });
      }
      dump(out);
      for (const r of out) seen.view(a.agent, folder, repo, r); // read only once all of them are shown
      return 0;
    }
    if (a.phase) {
      const sel = itemSelector(a.phase);
      const r = sel && (sel.number !== undefined
        ? one("SELECT * FROM phase WHERE seq=? ORDER BY CASE status WHEN 'archived' THEN 1 ELSE 0 END, id", sel.number)
        : one('SELECT * FROM phase WHERE slug=?', sel.slug));
      if (!r) { say(`❌ no phase ${repr(a.phase)}`); return 1; }
      // the oracle's row, then the whole item (item 033: a member that may use only the CLI reads its item here)
      const file = store.load(folder).find(i => i.path === r.path);
      dump({ ...r, front_matter: file ? file.fm : null, body: file ? file.body : null });
      seen.view(a.agent, folder, repo, r); // the agent now holds this version: its next write to the item is checked against it
      return 0;
    }

    if (a.events !== undefined) {
      let rows;
      if (a.events === '*') rows = all('SELECT * FROM event ORDER BY id DESC LIMIT 50');
      else {
        // The oracle crashes on an unknown item here; a refusal like --phase is the same exit status.
        const sel = itemSelector(a.events);
        const p = sel && (sel.number !== undefined
          ? one("SELECT * FROM phase WHERE seq=? ORDER BY CASE status WHEN 'archived' THEN 1 ELSE 0 END, id", sel.number)
          : one('SELECT * FROM phase WHERE slug=?', sel.slug));
        if (!p) { say(`❌ no phase ${repr(a.events)}`); return 1; }
        rows = all('SELECT * FROM event WHERE phase_id=? ORDER BY id DESC', p.id);
      }
      for (const e of rows) say(`  ${e.ts}  ${String(e.event).padEnd(14)} branch=${e.branch} commit=${sha7(e)} ${e.note}`);
      return 0;
    }

    if (a['by-branch']) {
      for (const r of all('SELECT * FROM phase WHERE branch=? ORDER BY seq', a['by-branch'])) {
        say(`  [${pad(r.seq, 3)}] ${r.slug.padEnd(28)} ${String(r.status ?? 'None').padEnd(12)} commit=${sha7(r)} ${r.location}`);
      }
      return 0;
    }

    // default / --status: the full stack
    const h = one("SELECT * FROM handoff WHERE status='active' LIMIT 1");
    if (!h) { say('ℹ️  backlog not initialized yet (backlog new creates the first item and the phase anchor)'); return 0; }
    const every = all("SELECT * FROM phase WHERE handoff_id=? ORDER BY CASE WHEN status IN ('done','archived') THEN 1 ELSE 0 END, priority ASC, seq ASC", h.id);
    const rows = every.filter(r => !excluded.has(r.id) && (a.all || ((r.repository || '') === repo && (r.branch || '') === branch)));
    // F6: open items of another branch that is no longer on the origin wait for a decision, in no queue
    const others = every.filter(r => !excluded.has(r.id) && ACTIONABLE.includes(r.status) && r.repository === repo && r.branch !== branch);
    let gone = []; let unreadable = false;
    if (others.length && !a.all) {
      const ls = await git(['ls-remote', '--heads', 'origin'], cwd);
      unreadable = ls.code !== 0;
      if (!unreadable) {
        const onOrigin = new Set(ls.stdout.split(/\r?\n/).filter(l => l.includes('refs/heads/')).map(l => l.slice(l.indexOf('refs/heads/') + 11)));
        gone = others.filter(r => !onOrigin.has(r.branch));
      }
    }
    if (a.json) {
      dump({ handoff: h, repository: repo, branch: redact(branch), phases: rows, gone_branch_items: gone, findings: bad });
      return 0;
    }
    criticalBanner(critical());
    say(`📋 ${repo} — branch ${a.all ? '(all)' : redact(branch)} — ${folder}`);
    say(`   objective: ${h.objective}`);
    say(`   phases (${rows.length}) — work queue order, P0 = next:`);
    let byPath;
    for (const r of rows) {
      const mark = { done: '✅', archived: '📦', in_progress: '🔄' }[r.status] ?? '•';
      const crit = (r.severity || 'normal') === 'critical' && ACTIONABLE.includes(r.status) ? ' ⚠️CRIT' : '';
      say(`   ${mark} [${pad(r.seq, 3)}] ${r.slug.padEnd(28)} ${String(r.status ?? 'None').padEnd(12)} P${pad(r.priority, 3)}${crit}  ${r.name}`);
      if (r.summary) say(`        ↳ ${r.summary}`);
      // item 042: a dependency on another repository's item is shown with its state (the items of this backlog keep PR1's line)
      if (ACTIONABLE.includes(r.status)) {
        const deps = (byPath ??= new Map(store.load(folder).map(i => [i.path, i.fm]))).get(r.path)?.depends_on;
        for (const d of team.asList(deps).filter(team.isForeign)) {
          const f = team.foreignItem(folder, d);
          say(`        ⛓ depends on ${d}${f ? ` ${f.slug} (status ${f.status})` : ' (no such item in the backlog repository)'}`);
        }
      }
    }
    if (unreadable) say('   ⚠️  the origin could not be read, so items of other branches were not checked');
    if (gone.length) {
      say(`   ⚠️  ${gone.length} open item(s) belong to branches that no longer exist on the origin; they are in no queue. Decide for each: move to a branch (backlog move <item> --to-branch <name>), archive, or remove:`);
      for (const r of gone) say(`      - ${r.slug} (branch ${r.branch}) ${r.name}`);
    }
    return 0;
  } finally { con.close(); }
}
