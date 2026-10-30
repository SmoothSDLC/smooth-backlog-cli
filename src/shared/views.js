// Shared-mode team views (cli-parity job 16): `backlog query --claimable | --reviewable | --blocked` with --agent,
// --roster and --scope. Port of query.py:76-153 (scopes, refinement cap, team_rows) and :330-372 (the views),
// lib_db.py:731-742 (review_offer) and :621-624 (job_fields). Rows and dependencies come from the backlog.db mirror as
// in query.js (team.js); the item files of the repository folder give only the front matter the rows do not hold.
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BacklogError, operation } from '../errors.js';
import { missingFields } from './lifecycle.js';
import { assertInside, redact } from './safety.js';
import * as store from './store.js';
import * as team from './team.js';

export const SCOPES = ['branch', 'repo', 'all'];
const RANK = { off: 0, branch: 0, repo: 1, all: 2 };
export const OPEN = "SELECT * FROM phase WHERE handoff_id=? AND status IN ('pending','in_progress') ORDER BY priority ASC, seq ASC";
const JSON_FIELDS = ['chunk', 'review_refs', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer', 'estimate_min', 'complexity', 'layer'];

const refinement = fm => team.isChunk(fm); // query.py _refinement: chunk items, the only work another repository's agents may pick up (--scope all)
const files = dir => new Map(store.load(dir).map(i => [i.path, i]));
const dirs = dir => { try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort(); } catch { return []; } };

// query.py:80-90: refinement_scope from <folder>/backlog.scope, one line 'refinement_scope: off|branch|repo|all' (default branch).
export function refinementCap(folder, repr) {
  const p = join(folder, 'backlog.scope');
  let st; try { st = lstatSync(p); } catch { st = null; }
  operation(!st?.isSymbolicLink(), `Symlink destination is unsupported: ${p}. Resolve it before using backlog.`); // never read outside the home
  const m = st?.isFile() ? /^\s*refinement_scope:\s*(\S+)/m.exec(readFileSync(p, 'utf8')) : null;
  const v = m ? m[1] : 'branch';
  if (!['off', ...SCOPES].includes(v)) throw new BacklogError('INVALID_INPUT', `${p}: refinement_scope ${repr(v)}; use one of off, branch, repo, all`);
  return v;
}

// lib_db.review_offer (owner 2026-10-22/28): any member but the author may review a requested item at once; the item's
// review_refs say how to review it. null = not offered to agent, [] = offered.
export function reviewOffer(fm, agent) {
  if (team.isReviewAuthor(fm, agent) || !team.reviewOpenTo(fm, agent)) return null;
  return [];
}

// query.py:93-129 team_rows: [{r, fm, undone, f}] of the open items within scope, in priority order. branch = the caller's
// repository and branch, repo = every branch of it, all = also the chunk items of every other repository folder.
export async function teamRows({ open, scope, cap, every, excluded, repo, branch, folder, home }) {
  const ref = RANK[scope] <= RANK[cap] ? scope : cap;
  const mine = files(folder);
  const mirror = team.mirrorRows(folder);
  const out = [];
  for (const r of open) {
    if (excluded.has(r.id)) continue;
    if (!every && !((r.repository || '') === repo && (scope !== 'branch' || r.branch === branch))) continue;
    const fm = mine.get(r.path)?.fm ?? {};
    if (!every && refinement(fm) && ['off', 'branch'].includes(ref) && r.branch !== branch) continue; // the cap
    out.push({ r, fm, undone: team.undoneDependencies(folder, fm, mirror), f: repo });
  }
  if (scope !== 'all' || ref !== 'all' || every) return out;
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite'); // loaded (and its warning kept off stderr) by db.connect
  for (const owner of dirs(home)) {
    for (const name of dirs(join(home, owner))) {
      const f = `${owner}/${name}`; const dir = join(home, owner, name);
      if (f === repo || !existsSync(join(dir, 'backlog.db'))) continue;
      try { // another repository's backlog: read, never write; nothing on the way from the home may be a link
        await assertInside(home, join(dir, 'backlog.db'));
        const con = new DatabaseSync(join(dir, 'backlog.db'), { readOnly: true });
        let rows; let theirRows;
        try {
          rows = con.prepare(OPEN).all(con.prepare("SELECT id FROM handoff WHERE status='active' LIMIT 1").get()?.id ?? null).map(x => ({ ...x }));
          theirRows = con.prepare('SELECT * FROM phase ORDER BY id').all().map(x => ({ ...x }));
        } finally { con.close(); }
        const theirs = rows.some(r => r.repository === f) ? files(dir) : new Map();
        for (const r of rows) {
          const fm = r.repository === f ? theirs.get(r.path)?.fm ?? {} : {};
          if (refinement(fm)) out.push({ r, fm, undone: team.undoneDependencies(dir, fm, theirRows), f });
        }
      } catch (e) { process.stderr.write(redact(`ℹ️  ${f}: backlog not read (${e.message})`) + '\n'); }
    }
  }
  return out;
}

// lib_db.py:621-624
const jobFields = fm => [['estimate', fm.estimate_min], ['complexity', fm.complexity], ['layer', fm.layer]]
  .filter(([, v]) => v != null && v !== '').map(([k, v]) => ` ${k}=${v}${k === 'estimate' ? 'm' : ''}`).join('');
export const waitingOn = undone => undone.map(d => ({ id: d.id, slug: d.item ? d.item.slug : null, status: d.item ? d.item.status : 'missing', claimed_by: d.fm.claimed_by || '' }));

// Beyond the oracle (topology item 288): the items that wait in stage review-hitl for an owner decision, with the question
// (the last "Owner decision needed" section of the item), for the morning report. Answer: backlog update <item> --decision.
function decisionsView(found, { a, scope, repo, branch, own, say, dump }) {
  const rows = found.map(({ r, fm }) => ({ ...r, team: fm.team || null, decision_requested_by: fm.decision_requested_by || null,
    decision_requested_at: fm.decision_requested_at || null, question: team.strip(String(fm.decision_question ?? '')) })); // review-hitl came with this build: every decision carries its question
  if (a.json) { dump(rows); return 0; }
  const where = a.all ? '(all)' : scope === 'branch' ? redact(branch) : `(scope ${scope})`;
  say(`📋 ${rows.length} owner decision(s) waiting — ${repo}, branch ${where}; answer with backlog update <item> --decision "<answer>":`);
  for (const x of rows) {
    say(`   P${String(x.priority).padEnd(3)} ${x.slug} (team ${x.team || '-'}) — ${x.name}`);
    say(`        asked by ${x.decision_requested_by || '-'} at ${x.decision_requested_at || '-'}`);
    for (const line of x.question.split('\n')) say(`        ${line}`);
  }
  return 0;
}

// query.py:330-372. io = {say, dump, die, repr} of query.js; hid = the active handoff of the mirror, all = its row reader.
export async function teamView(a, { all, hid, excluded, repo, branch, folder, home, io }) {
  const { say, dump, die, repr } = io;
  try {
    if (a.reviewable && !a.agent) return die('--reviewable needs --agent <you> (the author never reviews its own item)');
    const scope = a.scope || 'branch';
    const inTeam = Boolean(team.teamScope().repo || a.agent);
    const own = files(folder);
    const found = (await teamRows({ open: all(OPEN, hid), scope, cap: refinementCap(folder, repr), every: a.all, excluded, repo, branch, folder, home }))
      .filter(({ r, fm, undone, f }) => {
        if (a.decisions) return f === repo && fm.stage === 'review-hitl' && team.inTeam(fm); // the owner decisions of the morning report (item 036)
        if (inTeam && f === repo) { // an incomplete item is never claimed or reviewed in team mode
          const file = own.get(r.path);
          if (!file || missingFields(file.fm, file.body).length) return false;
        }
        if (!team.offeredTo(fm, f, repo)) return false; // another team's item (TEAM_NAME)
        if (a.claimable) return r.status === 'pending' && !fm.claimed_by && !undone.length && team.isReady(fm) && (f === repo || team.isChunk(fm)); // another repository's items only as chunk work
        return a.reviewable ? reviewOffer(fm, a.agent) !== null && team.isReady(fm) : undone.length > 0; // never a review of an item before ready (036)
      });
    if (a.decisions) return decisionsView(found, { a, scope, repo, branch, own, say, dump });
    if (a.json) {
      dump(found.map(({ r, fm, undone }) => ({ ...r, ...Object.fromEntries(JSON_FIELDS.map(k => [k, fm[k] ?? null])), waiting_on: waitingOn(undone) })));
      return 0;
    }
    const where = a.all ? '(all)' : scope === 'branch' ? redact(branch) : `(scope ${scope})`;
    say(`📋 ${found.length} ${a.claimable ? 'claimable' : a.reviewable ? 'reviewable' : 'blocked'} item(s) — ${repo}, branch ${where}, P0 = next:`);
    for (const { r, fm, undone, f } of found) {
      say(`   P${String(r.priority).padEnd(3)} ${r.slug} (${r.status}) — ${r.name}${f === repo ? '' : `  [repository ${redact(f)}]`}`);
      say(`        review_refs=${team.asList(fm.review_refs).join(',') || '-'} `
        + `claimed_by=${fm.claimed_by || '-'} review=${fm.review_state || 'none'}${fm.reviewer ? ` reviewer=${fm.reviewer}` : ''}${jobFields(fm)}`);
      for (const dep of undone) say(`        waits on ${team.describeDependency(dep)}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof BacklogError) return die(e.message, e.exitCode);
    throw e;
  }
}
