// Read views: `backlog query` and `backlog next`.
// (--next --status --critical --phase --events --by-branch --all --branch --json) over the rows of the items (index.rows) and the committed index,
// the earlier scripts order: pull, no-backlog check, branch, connect, findings. Output strings and --json match.
// Never writes an item (the rows are built in memory). The team views are views.js, --plan is pop.js.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BacklogError } from '../errors.js';
import { parse as parseItem } from './frontmatter.js';
import * as index from './index.js';
import { assertInside, git, redact } from './safety.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import * as team from './team.js';
import { lifted, teamScope } from './team.js';
import { missingFields } from './lifecycle.js';
import { SCOPES, teamView } from './views.js';
import { wipView } from './wip.js';
import { isFinished, isOpen } from './workflow.js';

const BOOL = ['next', 'status', 'critical', 'json', 'all', 'claimable', 'reviewable', 'blocked', 'decisions', 'plan', 'wip', 'changed', 'branches'];
const VALUE = ['phase', 'by-branch', 'branch', 'agent', 'lead', 'agents', 'scope', 'only'];
const ONLY = { new: r => r.status === 'pending' || r.status === 'new', open: r => isOpen(r.status), done: r => isFinished(r.status) && r.status !== 'archived', archive: r => r.status === 'archived' };

// argparse. --events takes an optional value (const "*"); shortcut: no unique-prefix abbreviations.
function parse(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const [flag, eq] = argv[i].startsWith('--') ? argv[i].slice(2).split(/=(.*)/s) : [null];
    if (BOOL.includes(flag) && eq === undefined) a[flag] = true;
    else if (VALUE.includes(flag)) {
      const v = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('-') ? undefined : argv[++i]);
      if (v === undefined) throw new BacklogError('INVALID_INPUT', `argument --${flag}: expected one argument`);
      if (flag === 'scope' && !SCOPES.includes(v)) throw new BacklogError('INVALID_INPUT', `argument --scope: invalid choice: ${repr(v)} (choose from ${SCOPES.map(repr).join(', ')})`);
      if (flag === 'only' && !Object.hasOwn(ONLY, v)) throw new BacklogError('INVALID_INPUT', `argument --only: invalid choice: ${repr(v)} (choose from ${Object.keys(ONLY).map(repr).join(', ')})`);
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

// over the rows of the folder's items (index.rows).
function findings(rows, repo) {
  const out = { foreign: [], untagged: [] };
  for (const r of rows) {
    if (r.status === 'archived') continue;
    if (!r.repository || !r.branch) out.untagged.push(r);
    else if (r.repository !== repo) out.foreign.push(r);
  }
  return out;
}

//
function findingLines(f, repo) {
  return [
    ...f.foreign.map(r => `⚠️  CRITICAL: ${r.path} says repository ${r.repository} but is in the folder of ${repo}; it is out of the queue. Move it: backlog move ${r.slug} --to-repository`),
    ...(f.bare ?? []).map(p => `⚠️  ${p} has no front matter block; it is not an item, is out of the queue and is never rewritten. Add the front matter or move the file out of phases/`),
    ...f.untagged.map(r => `⚠️  item ${r.slug} records no repository or branch; it is out of the queue until its repository and branch are filled in`),
  ];
}

//
function criticalBanner(crit) {
  if (!crit.length) return 0;
  const bar = `⚠️ ${'='.repeat(72)}`;
  say(bar);
  say(`⚠️  ${crit.length} CRITICAL ITEM(S) ON THE BACKLOG — SURFACE THESE FIRST, DO NOT BURY:`);
  for (const r of crit) say(`⚠️    P${String(r.priority).padEnd(3)} [${pad(r.seq, 3)}] ${r.slug} — ${r.name}`);
  say(bar);
  return crit.length;
}

// which items of this repository folder changed since the calling agent's last use. The
// reference is the agent's own ~use record - its last write or its last --changed, never a global
// timestamp - so a change made while the agent is idle still appears in the agent's next report.
// The report is printed before the reference is written, so a failed output consumes no change
// (the same changes repeat in the next report); on a first use the report is empty and the write
// happens first, so the result states exactly what was stored (the write's value, or null on a
// failed first use). A failed write after an earlier use is stated in the result - the text says
// so, and with --json the line {"reference_write": "failed"} follows the report, the exit is 0 -
// and keeps the previous reference. The result names the reference (also when it is empty) and the
// agents that use the backlog.
function changedReport(home, folder, repo, a) {
  const agent = a.agent || seen.actor();
  const reference = seen.lastUse(home, agent);
  if (!reference) {
    // first use: no comparison point and an empty report; the write happens first, and the result
    // states exactly what was stored - an output can never name a reference that is not there
    const rec = seen.setUse(home, agent);
    if (a.json) { dump({ agent, reference: rec ? { commit: rec.commit, at: rec.at } : null, held: [], others: [], agents: seen.agentsUsing(home) }); return 0; }
    if (rec) {
      say('no earlier use: reference set now');
      say(`reference: ${rec.commit} at ${rec.at}`);
    } else {
      say('no earlier use: the reference could not be set (the write failed)');
    }
    say('agents using the backlog:');
    for (const x of seen.agentsUsing(home)) say(`  ${x.name} last used ${x.last_use}`);
    return 0;
  }
  let report;
  try {
    report = seen.changedSince(home, folder, repo, reference, agent);
  } catch (e) {
    return die(`--changed: ${e.message}`); // the comparison failed: the reference is kept, the change is not lost
  }
  // the whole report first, the reference write after it: a failed output must not consume the changes
  if (a.json) {
    dump({ agent, reference: { commit: reference.commit, at: reference.at }, held: report.held, others: report.others, agents: seen.agentsUsing(home) });
  } else {
    say(`reference: ${reference.commit} at ${reference.at}`);
    if (!report.held.length && !report.others.length) say('no changes since the last use');
    const line = x => `  changed: ${x.slug} (${x.status}) by ${x.updated_by || 'nobody'} at ${x.updated || 'an unknown time'}`;
    if (report.held.length) { say('held:'); for (const x of report.held) say(line(x)); }
    if (report.others.length) { say('others:'); for (const x of report.others) say(line(x)); }
    say('agents using the backlog:');
    for (const x of seen.agentsUsing(home)) say(`  ${x.name} last used ${x.last_use}`);
  }
  const rec = seen.setUse(home, agent);
  if (!rec) {
    // the write failed: the previous reference is kept, the same changes repeat in the next report
    if (a.json) dump({ reference_write: 'failed' });
    else say('reference write failed: the previous reference is kept (the same changes repeat in the next report)');
  }
  return 0;
}

//
const TEAM_VIEWS = ['claimable', 'reviewable', 'blocked', 'decisions', 'plan', 'wip'];
// `fromTeam`: the call of backlog team query, the only place of the team views
export const run = (argv, { fromTeam = false } = {}) => store.cloneLocked(store.resolveHome().home, () => query(argv, fromTeam)); // a read that pulls waits for a writer of the clone
async function query(argv, fromTeam) {
  let a;
  try { a = parse(argv); } catch (e) { return die(e.message); }
  const view = TEAM_VIEWS.find(k => a[k]);
  if (view && !fromTeam) return die(`--${view} is a team view: use backlog team query --team <team> --agent <name> --${view}`);
  if (a.agents && !a.plan) return die('--agents goes with --plan (the team members present)');
  if (a.plan) return (await import('./pop.js')).run(argv); // pop.js repeats the preamble below for its own flags

  const cwd = process.cwd();
  let repo;
  try { repo = teamScope().repo || store.repoId(cwd); } catch (e) { return die(e.message); }
  const { home } = store.resolveHome();
  try { await sync.pull(home, { read: true }); } catch (e) { if (e instanceof BacklogError) return die(e.message, e.exitCode); throw e; }
  if (a.wip) { // the counts against every work-in-progress limit and the stale in-progress items, whole backlog home
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
  if (a.changed) return changedReport(home, folder, repo, a); // what changed since the calling agent's last use
  if (!existsSync(folder)) {
    say(a.json ? '{}' : `ℹ️  ${repo} has no backlog yet`);
    return 0;
  }
  const branch = a.branch || teamScope().branch || (await git(['branch', '--show-current'], cwd)).stdout.trim(); // lib_db.git_branch: TEAM_BRANCH wins
  const plain = a.phase || a.events !== undefined || a['by-branch'] || a.critical || a.branches;
  if (!branch && !a.all && (a.next || !plain)) return die('HEAD is detached: pass --branch <name> (the branch whose queue you want) or --all');

  await assertInside(home, folder); // no symlink between the home and the folder
  await index.ensure(home, folder);
  {
    const { handoff: h, rows, items } = index.rows(folder);
    const critical = () => index.open(rows).filter(r => r.severity === 'critical');
    const bad = findings(rows.filter(r => r.status != null && r.status !== 'archived'), repo);
    const bare = store.bareFiles(folder);
    if (bare.length) bad.bare = bare; // only when there is one: the --json findings keep the earlier scripts three keys
    const excluded = new Set(Object.values(bad).flat().map(r => r.id));
    const lines = findingLines(bad, repo);
    if (!a.json && lines.length && (a.next || !plain)) lines.forEach(say); // findings lead the queue views only

    if (a.critical) {
      const crit = critical();
      if (a.json) dump(crit);
      else if (!criticalBanner(crit)) say('✅ no open CRITICAL items on the backlog');
      return 0;
    }

    if (a.claimable || a.reviewable || a.blocked || a.decisions) return teamView(a, { rows, excluded, repo, branch, folder, home, io: { say, dump, die, repr } });

    if (a.branches) { // one line per branch of this repository: its open and its finished (not archived) items
      const by = {};
      for (const r of rows.filter(x => !excluded.has(x.id) && x.repository === repo && x.branch && x.status !== 'archived')) {
        const c = (by[r.branch] ??= { branch: r.branch, open: 0, done: 0 });
        if (isOpen(r.status)) c.open++; else c.done++;
      }
      const list = Object.values(by);
      if (a.json) dump(list); else for (const c of list) say(`${c.branch}  open ${c.open}  done ${c.done}`);
      return 0;
    }

    if (a.next) {
      const fms = new Map(items.map(i => [i.path, i.fm]));
      // the open item with the best priority, skipping nothing for team reasons (a hand-off that is not accepted is a matter of backlog team pop)
      const r = index.open(rows).find(x => !excluded.has(x.id) && (a.all || ((x.repository || '') === repo && (x.branch || '') === branch))) ?? null;
      if (!r) {
        say(a.json ? '{}' : `ℹ️  no actionable item for ${repo}${a.all ? '' : `, branch ${redact(branch)}; --all shows every branch`}`);
        return 0;
      }
      // the next item may wait on another repository's item: that is named as the work to do first
      const away = team.undoneDependencies(folder, fms.get(r.path) ?? {}, rows).filter(d => d.foreign && d.item && d.item.status !== 'closed')
        .map(d => ({ item: `${d.item.repository}#${d.item.seq}`, repository: d.item.repository, seq: d.item.seq, slug: d.item.slug, status: d.item.status }));
      const file = items.find(i => i.path === r.path); // the whole item: front matter and body
      if (a.json) { dump({ ...r, ...(away.length ? { first: away } : {}), front_matter: file ? file.fm : null, body: file ? file.body : null }); return 0; }
      criticalBanner(critical());
      say(`➡️  NEXT: P${r.priority} (rank 0 = next) — [${pad(r.seq, 3)}] ${r.slug}  (${r.status})${(r.severity || 'normal') === 'critical' ? '  ⚠️ CRITICAL' : ''}`);
      say(`    ${r.name}`);
      say(`    objective: ${r.objective}`);
      say(`    summary:   ${r.summary}`);
      if (r.branch || r.commit_sha || r.location) say(`    progress:  branch=${r.branch} commit=${sha7(r)} loc=${r.location}`);
      for (const x of away) say(`    ⛓ waits on ${x.item} (${x.slug}, status ${x.status}): do that first in repository ${x.repository}`);
      if (file) {
        say('');
        say('--- front matter ---');
        for (const [k, v] of Object.entries(file.fm || {})) say(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
        say('--- body ---');
        say(String(file.body || '').replace(/^\n+/, '').replace(/\n$/, ''));
      }
      return 0;
    }

    if (a.phase && String(a.phase).includes(',')) { // several items at once, one JSON object each, in an array
      const out = [];
      for (const id of String(a.phase).split(',').map(x => x.trim()).filter(Boolean)) {
        const r = index.find(rows, id);
        if (!r) { say(`❌ no phase ${repr(id)}`); return 1; }
        const file = items.find(i => i.path === r.path);
        out.push({ ...r, front_matter: file ? file.fm : null, body: file ? file.body : null, missing: file && Object.keys(file.fm || {}).length ? missingFields(file.fm, file.body) : null });
      }
      dump(out);
      for (const r of out) seen.view(a.agent, folder, repo, r); // read only once all of them are shown
      return 0;
    }
    if (a.phase) {
      const r = index.find(rows, a.phase);
      if (!r) { say(`❌ no phase ${repr(a.phase)}`); return 1; }
      // the earlier scripts row, then the whole item
      const file = items.find(i => i.path === r.path);
      dump({ ...r, front_matter: file ? file.fm : null, body: file ? file.body : null, missing: file && Object.keys(file.fm || {}).length ? missingFields(file.fm, file.body) : null });
      seen.view(a.agent, folder, repo, r); // the agent now holds this version: its next write to the item is checked against it
      return 0;
    }

    if (a.events !== undefined) {
      // the history is kept in the items themselves (archived ones included)
      let path = null;
      if (a.events !== '*') {
        // The oracle crashes on an unknown item here; a refusal like --phase is the same exit status.
        const p = index.find(rows, a.events);
        if (!p) { say(`❌ no phase ${repr(a.events)}`); return 1; }
        path = p.path;
      }
      // newest first: the lines of one item are appended in time order, so reversing first keeps equal timestamps in that order
      const events = items.filter(i => path === null || i.path === path)
        .flatMap(i => team.asList(i.fm.events).map(store.parseEvent)).reverse().sort((x, y) => (x.ts < y.ts ? 1 : x.ts > y.ts ? -1 : 0));
      if (path === null) events.length = Math.min(events.length, 50);
      for (const e of events) say(`  ${e.ts}  ${String(e.event).padEnd(14)} branch=${e.branch} commit=${sha7(e)} ${e.note}`);
      return 0;
    }

    if (a['by-branch']) {
      for (const r of rows.filter(x => x.branch === a['by-branch']).sort((x, y) => x.seq - y.seq)) {
        say(`  [${pad(r.seq, 3)}] ${r.slug.padEnd(28)} ${String(r.status ?? 'None').padEnd(12)} commit=${sha7(r)} ${r.location}`);
      }
      return 0;
    }

    // default / --status: the full stack
    const every = [...rows].sort((x, y) => isFinished(x.status) - isFinished(y.status) || (x.priority ?? Infinity) - (y.priority ?? Infinity) || x.seq - y.seq);
    const shown = every.filter(r => !excluded.has(r.id) && (a.all || ((r.repository || '') === repo && (r.branch || '') === branch)) && (!a.only || ONLY[a.only](r)));
    // F6: open items of another branch that is no longer on the origin wait for a decision, in no queue
    const others = every.filter(r => !excluded.has(r.id) && isOpen(r.status) && r.repository === repo && r.branch !== branch);
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
      // who holds each item and whether it is in review, so no caller reads the item files for them
      const fmOf = r => lifted(parseItem(readFileSync(resolve(folder, String(r.path)), 'utf8'))).fm;
      const teamFields = r => { const f = fmOf(r); return { ...r, claimed_by: f.claimed_by ?? '', review_state: f.review_state ?? '' }; };
      const each = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? teamFields(x) : x)) : v])); // bare files stay paths
      dump({ handoff: h, repository: repo, branch: redact(branch), phases: shown.map(teamFields), gone_branch_items: gone.map(teamFields), findings: each(bad) });
      return 0;
    }
    criticalBanner(critical());
    say(`📋 ${repo} — branch ${a.all ? '(all)' : redact(branch)}`);
    say(`   objective: ${h.objective}`);
    say(`   phases (${shown.length}) — work queue order, P0 = next:`);
    let byPath;
    for (const r of shown) {
      const mark = { closed: '✅', done: '✅', archived: '📦', 'in progress': '🔄' }[r.status] ?? '•';
      const crit = (r.severity || 'normal') === 'critical' && isOpen(r.status) ? ' ⚠️CRIT' : '';
      say(`   ${mark} [${pad(r.seq, 3)}] ${r.slug.padEnd(28)} ${String(r.status ?? 'None').padEnd(12)} P${pad(r.priority ?? '-', 3)}${crit}  ${r.name}`);
      if (r.summary) say(`        ↳ ${r.summary}`);
      // a dependency on another repository's item is shown with its state
      { // every status: a done item still shows what it depended on
        const deps = (byPath ??= new Map(items.map(i => [i.path, i.fm]))).get(r.path)?.depends_on;
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
  }
}
