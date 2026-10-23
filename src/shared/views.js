// Shared-mode team views (cli-parity job 16): `backlog query --claimable | --reviewable | --blocked` with --classes,
// --agent, --roster and --scope. Port of query.py:76-153 (scopes, refinement cap, team_rows) and :330-372 (the views),
// lib_db.py:731-742 (review_offer) and :621-624 (job_fields). Rows come from the backlog.db mirror as in query.js; the
// front matter and the dependencies come from the item files of the repository folder (team.js), which the mirror copies.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BacklogError } from '../errors.js';
import { missingFields } from './lifecycle.js';
import * as store from './store.js';
import * as team from './team.js';

export const SCOPES = ['branch', 'repo', 'all'];
const REFINEMENT = ['chunk', 'docs']; // the only work another repository's agents may pick up (--scope all)
const RANK = { off: 0, branch: 0, repo: 1, all: 2 };
const OPEN = "SELECT * FROM phase WHERE handoff_id=? AND status IN ('pending','in_progress') ORDER BY priority ASC, seq ASC";
const JSON_FIELDS = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer', 'estimate_min', 'complexity', 'layer'];

const refinement = fm => { const wc = team.asList(fm.work_class); return wc.length > 0 && wc.every(c => REFINEMENT.includes(c)); };
const files = dir => new Map(store.load(dir).map(i => [i.path, i]));
const dirs = dir => { try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort(); } catch { return []; } };

// query.py:80-90: refinement_scope from <folder>/backlog.scope, one line 'refinement_scope: off|branch|repo|all' (default branch).
function refinementCap(folder, repr) {
  const p = join(folder, 'backlog.scope');
  const m = existsSync(p) && statSync(p).isFile() ? /^\s*refinement_scope:\s*(\S+)/m.exec(readFileSync(p, 'utf8')) : null;
  const v = m ? m[1] : 'branch';
  if (!['off', ...SCOPES].includes(v)) throw new BacklogError('INVALID_INPUT', `${p}: refinement_scope ${repr(v)}; use one of off, branch, repo, all`);
  return v;
}

// lib_db.py:731-742: null = not offered to agent now; [] = offered as a class holder; the item's review classes = offered
// to a non-holder, after TEAM_REVIEW_HOLDER_PRIORITY_MIN minutes (5) or at once when no other roster member holds one.
function reviewOffer(fm, agent, mine, roster) {
  if ((fm.claimed_by ?? null) === (agent ?? null) || !team.reviewOpenTo(fm, agent)) return null;
  const classes = team.asList(fm.review_classes);
  if (classes.some(c => mine.includes(c))) return [];
  const window = 60 * Number(process.env.TEAM_REVIEW_HOLDER_PRIORITY_MIN ?? 5);
  return team.fallbackReview(fm, roster).length || team.age(fm.review_requested_at) >= window ? classes : null;
}

// query.py:93-129 team_rows: [{r, fm, undone, f}] of the open items within scope, in priority order. branch = the caller's
// repository and branch, repo = every branch of it, all = also the chunk/docs items of every other repository folder.
// shortcut: undoneDependencies reads the folder once per open item; fine for a backlog of hundreds, cache it beyond that.
function teamRows({ open, scope, cap, every, excluded, repo, branch, folder, home }) {
  const ref = RANK[scope] <= RANK[cap] ? scope : cap;
  const mine = files(folder);
  const out = [];
  for (const r of open) {
    if (excluded.has(r.id)) continue;
    if (!every && !((r.repository || '') === repo && (scope !== 'branch' || r.branch === branch))) continue;
    const fm = mine.get(r.path)?.fm ?? {};
    if (!every && refinement(fm) && ['off', 'branch'].includes(ref) && r.branch !== branch) continue; // the cap
    out.push({ r, fm, undone: team.undoneDependencies(folder, fm), f: repo });
  }
  if (scope !== 'all' || ref !== 'all' || every) return out;
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite'); // loaded (and its warning kept off stderr) by db.connect
  for (const owner of dirs(home)) {
    for (const name of dirs(join(home, owner))) {
      const f = `${owner}/${name}`; const dir = join(home, owner, name);
      if (f === repo || !existsSync(join(dir, 'backlog.db'))) continue;
      let rows; // another repository's backlog: read, never write
      try {
        const con = new DatabaseSync(join(dir, 'backlog.db'), { readOnly: true });
        try { rows = con.prepare(OPEN).all(con.prepare("SELECT id FROM handoff WHERE status='active' LIMIT 1").get()?.id ?? null).map(x => ({ ...x })); } finally { con.close(); }
      } catch (e) { process.stderr.write(`ℹ️  ${f}: backlog not read (${e.message})\n`); continue; }
      const theirs = rows.some(r => r.repository === f) ? files(dir) : new Map();
      for (const r of rows) {
        const fm = r.repository === f ? theirs.get(r.path)?.fm ?? {} : {};
        if (refinement(fm)) out.push({ r, fm, undone: team.undoneDependencies(dir, fm), f });
      }
    }
  }
  return out;
}

// lib_db.py:621-624
const jobFields = fm => [['estimate', fm.estimate_min], ['complexity', fm.complexity], ['layer', fm.layer]]
  .filter(([, v]) => v != null && v !== '').map(([k, v]) => ` ${k}=${v}${k === 'estimate' ? 'm' : ''}`).join('');
const waitingOn = undone => undone.map(d => ({ id: d.id, slug: d.item ? d.item.slug : null, status: d.item ? d.item.status : 'missing', claimed_by: d.fm.claimed_by || '' }));

// query.py:330-372. io = {say, dump, die, repr} of query.js; hid = the active handoff of the mirror, all = its row reader.
export function teamView(a, { all, hid, excluded, repo, branch, folder, home, io }) {
  const { say, dump, die, repr } = io;
  try {
    if ((a.claimable || a.reviewable) && !a.classes) return die('--claimable and --reviewable need --classes <the classes this agent covers>');
    const mine = team.parseClasses(a.classes, a.claimable ? team.WORK_CLASSES : team.REVIEW_CLASSES, '--classes');
    const scope = a.scope || 'branch';
    const roster = team.loadRoster(a.roster || process.env.TEAM_ROSTER);
    if (scope === 'all' && a.claimable && !mine.every(c => REFINEMENT.includes(c))) {
      return die(`--scope all offers only chunk/docs refinement work; implementation items of another repository are never claimed (${[...new Set(mine.filter(c => !REFINEMENT.includes(c)))].sort().join(', ')} is implementation). Use --classes chunk,docs with --scope all, or --scope repo|branch for your implementation classes`);
    }
    const inTeam = Boolean(team.teamScope().repo || a.agent);
    const own = files(folder);
    const found = teamRows({ open: all(OPEN, hid), scope, cap: refinementCap(folder, repr), every: a.all, excluded, repo, branch, folder, home })
      .filter(({ r, fm, undone, f }) => {
        if (inTeam && f === repo) { // an incomplete item is never claimed or reviewed in team mode
          const file = own.get(r.path);
          if (!file || missingFields(file.fm, file.body).length) return false;
        }
        if (a.claimable) {
          const wc = team.asList(fm.work_class);
          return r.status === 'pending' && !fm.claimed_by && !undone.length && wc.every(c => mine.includes(c)) && (wc.length > 0 || !inTeam);
        }
        return a.reviewable ? reviewOffer(fm, a.agent, mine, roster) !== null : undone.length > 0;
      });
    if (a.json) {
      dump(found.map(({ r, fm, undone }) => ({ ...r, ...Object.fromEntries(JSON_FIELDS.map(k => [k, fm[k] ?? null])), waiting_on: waitingOn(undone) })));
      return 0;
    }
    const where = a.all ? '(all)' : scope === 'branch' ? branch : `(scope ${scope})`;
    say(`📋 ${found.length} ${a.claimable ? 'claimable' : a.reviewable ? 'reviewable' : 'blocked'} item(s) — ${repo}, branch ${where}, P0 = next:`);
    for (const { r, fm, undone, f } of found) {
      say(`   P${String(r.priority).padEnd(3)} ${r.slug} (${r.status}) — ${r.name}${f === repo ? '' : `  [repository ${f}]`}`);
      say(`        work_class=${team.asList(fm.work_class).join(',') || '-'} review_classes=${team.asList(fm.review_classes).join(',') || '-'} `
        + `claimed_by=${fm.claimed_by || '-'} review=${fm.review_state || 'none'}${fm.reviewer ? ` reviewer=${fm.reviewer}` : ''}${jobFields(fm)}`);
      for (const dep of undone) say(`        waits on ${team.describeDependency(dep)}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof BacklogError) return die(e.message, e.exitCode);
    throw e;
  }
}
