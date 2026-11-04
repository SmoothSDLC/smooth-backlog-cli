// Shared-mode agent pop (cli-parity job 20): `backlog pop`, `backlog query --pop` and `--next --agent`. Port of query.py:155-252
// (pop) in the oracle's order: pull, no-backlog check, branch, connect, findings, then the one next action of the agent,
// continue > review > claim > refine > chunk > idle (exit 3), over the backlog.db mirror and the item files (views.js, team.js).
// --claim-now claims through `backlog update --claim` as query.py runs update.py. Never writes an item itself.
// shortcut: parse() and the findings below repeat query.js (not exported there); fold them in when that file is free.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BacklogError } from '../errors.js';
import * as db from './db.js';
import { REFINE_HOW, missingFields, reviewRefusal, stageOf as stageOfItem } from './lifecycle.js';
import { assertInside, git, redact } from './safety.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import * as team from './team.js';
import { OPEN, SCOPES, refinementCap, reviewOffer, teamRows, waitingOn } from './views.js';
import { wipRefusal } from './wip.js';

const BOOL = ['next', 'status', 'critical', 'json', 'all', 'claimable', 'reviewable', 'blocked', 'pop', 'plan', 'claim-now', 'headless'];
const VALUE = ['phase', 'by-branch', 'branch', 'agent', 'lead', 'agents', 'roster', 'scope'];
const RANK = { off: 0, branch: 0, repo: 1, all: 2 };
const narrower = (a, b) => (RANK[a] <= RANK[b] ? a : b);

const repr = s => redact(s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s}'`);
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const say = text => process.stdout.write(`${redact(text)}\n`); // the agent and the branch are echoed input
const clean = v => (typeof v === 'string' ? redact(v) : Array.isArray(v) ? v.map(clean) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v);
// Python json.dumps(): ", " and ": " separators, every non-ASCII UTF-16 unit escaped.
const dumps = v => (v !== null && typeof v === 'object'
  ? (Array.isArray(v) ? `[${v.map(dumps).join(', ')}]` : `{${Object.entries(v).map(([k, x]) => `${dumps(k)}: ${dumps(x)}`).join(', ')}}`)
  : JSON.stringify(v ?? null).replace(/[\u007f-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));

// query.py:367-403 argparse (see query.js)
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

// lib_db.py:302-313 over the mirror rows: the ids of the rows that are out of every queue.
function excludedIds(rows, folder, repo) {
  const present = path => { try { return realpathSync(resolve(folder, String(path))).startsWith(realpathSync(folder) + sep); } catch { return false; } };
  return new Set(rows.filter(r => r.status !== 'archived' && (!present(r.path) || !r.repository || !r.branch || r.repository !== repo)).map(r => r.id));
}

// query.py:132-134
const dod = fm => { const refs = team.asList(fm.review_refs); return refs.length ? `; definition of done: ${refs.join(', ')} (the review-documents repository: load them before working)` : ''; };
// query.py:137-148
function reviewSay(slug, fm, me) {
  const refs = team.asList(fm.review_refs);
  let text = fm.review_state === 'in_review' && fm.reviewer === me ? `continue your review (started ${fm.review_started ?? 'None'}): `
    : `start the review: backlog update ${slug} --start-review --by ${me}; then `;
  text += 'review the work of ';
  text += fm.claimed_by || 'its author';
  if (refs.length) text += `; load its review_refs first: ${refs.join(', ')} (the review-documents repository) and cite one in --comments`;
  return `${text}, then backlog update ${slug} --review pass|changes --by ${me} --comments "<findings>"`;
}

// query.py:155-252. io-free: returns the exit code.
async function pop(a, { all, hid, excluded, repo, branch, folder, home }) {
  const me = a.agent;
  const lead = me === team.teamLead(a.lead);
  // query.py:176-179: the lead never claims an execution item; a roster profile with review_only never claims either
  const noClaim = lead || Boolean(team.loadRoster(a.roster || process.env.TEAM_ROSTER || '')[me]?.review_only);
  const open = all(OPEN, hid);
  const files = new Map(store.load(folder).map(i => [i.path, i]));
  const incomplete = new Map(); // members never claim, review or work an incomplete item of a team; an item without a team has no such fields
  for (const r of open) {
    if (excluded.has(r.id)) continue;
    const file = files.get(r.path);
    const m = !file ? ['the item file'] : file.fm.team || team.teamName() ? missingFields(file.fm, file.body) : [];
    if (m.length) incomplete.set(r.id, m);
  }
  excluded = new Set([...excluded, ...incomplete.keys()]);
  const scope = a.scope || 'branch'; const cap = refinementCap(folder, repr);
  const rows = (s, every) => teamRows({ open, scope: s, cap, every, excluded, repo, branch, folder, home });
  // continue/review/claim stay in the caller's repository: --scope all widens only the chunk search
  const own = (await rows(narrower(scope, 'repo'), a.all)).filter(x => team.inTeam(x.fm)); // query.py:184: only the caller's team's items
  const held = team.heldItems(folder, me);
  // query.py:186-188: this branch's items of the caller's team in stage refining that nobody holds (first-round refinement)
  // item 088: a split slice is in stage refining with or without a team field - a teamless slice's refinement is the caller's
  // team's work too (its refinement review runs through the same stages)
  const here = open.filter(r => (r.repository || '') === repo && r.branch === branch).map(r => { const file = files.get(r.path); return { r, fm: file?.fm ?? {}, body: file?.body ?? '' }; });
  // item 088: a split slice is in stage refining with or without a team field - a teamless slice's refinement is the
  // caller's team's work too; a slice written before the stage field existed has no stage, and the body's split
  // marker names it as refining, so the dispatch offers its refinement, not a claim the gate would refuse.
  const stageOf = x => stageOfItem(x.fm, x.body);
  const teamRefining = here.filter(x => ((x.fm.team && team.inTeam(x.fm)) || !x.fm.team) && stageOf(x) === 'refining' && !x.fm.claimed_by && !waitsAway(folder, x)); // nor one waiting on another repository (042)
  const refineHow = slug => REFINE_HOW.replaceAll('<item>', slug);
  const reviews = [];
  for (const x of own) {
    if (reviewOffer(x.fm, me) !== null && team.isReady(x.fm) && !x.undone.some(d => d.foreign && d.item?.status !== 'done')) reviews.push({ name: 'review', r: x.r, fm: x.fm, f: x.f, say: reviewSay(x.r.slug, x.fm, me) }); // item 042: nor a review that waits on another repository
  }
  // spec section 5 and query.py:199: your review in progress comes first; another member's request, however old, comes
  // after your own work (item 033; the review-first window of this build is gone)
  let act = reviews.find(x => x.fm.review_state === 'in_review' && x.fm.reviewer === me);
  // query.py:197-221: the item you work on, your refinement in progress, then your passed and your changes-requested items
  // item 082: heldBy matches an earlier session of the same card - a new session continues the item
  let mine = own.filter(({ fm, undone }) => team.heldBy(fm.claimed_by, me) && !['requested', 'in_review'].includes(fm.review_state) && !fm.wait_on && team.isReady(fm) // waiting for a verdict or a run is not work; nor an item before ready
    && !undone.some(d => d.foreign && d.item?.status !== 'done')); // item 042: nor one that waits on another repository (named below as the work to do first)
  // query.py:203-211 (item 039, spec section 8): while its team works the split items the lead's work item waits: no busy
  // continue (a polling lead would loop), but a passed or
  // changes-requested item of the lead's keeps its action, and items blocked on the lead's own work do not count
  let busy = [];
  if (lead) {
    const leads = new Set(mine.map(x => String(x.r.seq)));
    // every open item of the team on this branch, incomplete ones included: an incomplete split child is the team's work too
    // item 082: an earlier session of the same card holds the lead's own work, not the team's
    busy = here.filter(x => x.fm.team && team.inTeam(x.fm) && !team.heldBy(x.fm.claimed_by, me) && x.r.status !== 'done' && !leads.has(String(x.r.seq))
      && !team.undoneDependencies(folder, x.fm).some(d => (d.item && !d.foreign && leads.has(String(d.item.seq))) || d.foreign)); // an item that waits on another repository is no work of the team here (item 042)
    // item 042: team items that wait only on other repositories: the lead does not go on here, it is told where to go
    const away = here.filter(x => x.fm.team && team.inTeam(x.fm) && x.r.status !== 'done' && !leads.has(String(x.r.seq)) && team.undoneDependencies(folder, x.fm).some(d => d.foreign));
    if (busy.length || away.length) mine = mine.filter(x => ['passed', 'changes-requested'].includes(x.fm.review_state));
  }
  // every open item of the team on this branch, incomplete ones included (a split child before its refinement is open work)
  const teamDone = ({ r, fm }) => lead && fm.team && !busy.length && !here.some(x => x.r.slug !== r.slug && x.fm.team === fm.team);
  // item 082: the item is mine through an earlier session of the same card when it is held but not named by
  // me - the new session claims the item first (the continuation); the close and the request-review run as
  // the claimer, so the claim comes first
  const cont = ({ r, fm, f }) => {
    const holder = fm.claimed_by || '';
    const claimFirst = holder && holder !== me ? `first claim it as ${me} (backlog update ${r.slug} --claim ${me}), then ` : '';
    return (teamDone({ r, fm }) && !['passed', 'changes-requested'].includes(fm.review_state) // item 039: the lead closes the work item when every item of its team is done
      ? { name: 'continue', r, f, say: reviewRefusal(fm) === ''
        ? `${claimFirst}every item of team ${fm.team} is done: close ${r.seq} (backlog update ${r.slug} --close --summary "<outcome>")`
        : `${claimFirst}every item of team ${fm.team} is done: have ${r.seq} reviewed first (backlog update ${r.slug} --request-review any --note "<the items and their evidence>") - the team's review rules must be met before the close` }
      : fm.review_state === 'passed'
      ? { name: 'continue', r, f, say: reviewRefusal(fm) === ''
        ? `${claimFirst}close ${r.seq} with --close --summary (backlog update ${r.slug} --close --summary "<outcome>")`
        : `${claimFirst}${reviewRefusal(fm)}: request the next review (backlog update ${r.slug} --request-review <reviewer> --note "<the commit>"); after the rules are met, close ${r.seq}` }
      : { name: 'continue', r, f, say: `you hold it: ${claimFirst}keep working and record each step in the item (backlog update ${r.slug} --append "..."), then write the reviewer handoff and --request-review - the team's review rules must be met before the close${dod(fm)}` }); // item 088: every item needs the two stages, with or without review_refs
  };
  const pick = (...states) => mine.find(({ fm }) => states.includes(fm.review_state ?? null));
  if (!act) { const x = pick(null, '', 'none'); if (x) act = cont(x); }
  if (!act) {
    const x = teamRefining.find(({ fm }) => fm.refiner === me);
    if (x) act = { name: 'refine', r: x.r, f: repo, say: `you are refining ${x.r.seq}: complete its team fields and definition of done (${refineHow(x.r.slug)}), then backlog update ${x.r.slug} --refine-done --by ${me} --note "<what you refined>"` };
  }
  if (!act) { const x = pick('passed') ?? mine.find(({ fm }) => !['passed', null, '', 'none', undefined].includes(fm.review_state)); if (x) act = cont(x); }
  if (!act && reviews.length) act = reviews[0];
  if (!act && !noClaim && team.claimRefusal(folder, me) === null) { // query.py:222-227: first-round refinement of a team item, before new work (one active item: spec section 6)
    const x = teamRefining.find(({ r, fm }) => !fm.refiner && !wipRefusal(folder, repo, fm, me, r.slug)); // never past a limit (034)
    if (x) act = { name: 'refine', r: x.r, f: repo, say: `refine it before anyone works on it: backlog update ${x.r.slug} --refine-start --by ${me}, complete its team fields and definition of done (${refineHow(x.r.slug)}), then backlog update ${x.r.slug} --refine-done --by ${me} --note "<what you refined>"` };
  }
  const refusal = act || noClaim ? null : team.claimRefusal(folder, me);
  if (!act && !refusal && !noClaim) {
    for (const { r, fm, undone, f } of own) {
      // chunk items are offered as chunk work below
      if (r.status === 'pending' && !fm.claimed_by && !undone.length && !team.isChunk(fm) && team.isReady({ stage: stageOf({ fm, body: files.get(r.path)?.body }) }) && !wipRefusal(folder, repo, fm, me, r.slug)) { // a team's item only in stage ready; never past a limit (034)
        act = { name: 'claim', r, f, say: `claim it: backlog update ${r.slug} --claim ${me}${dod(fm)}` };
        break;
      }
    }
  }
  if (act?.r && act.f === repo) seen.view(me, folder, repo, act.r); // the pop just showed it: the claim below acts on this view
  if (act?.name === 'claim' && a['claim-now']) {
    const bin = fileURLToPath(new URL('../../bin/backlog.js', import.meta.url));
    const c = spawnSync(process.execPath, [bin, 'update', act.r.slug, '--claim', me], { encoding: 'utf8', env: { ...process.env, ...store.lockEnv(home) } });
    if (c.status !== 0) { // a nonzero exit, a signal or a process that did not start is no claim
      process.stdout.write(redact((c.stdout ?? '') + (c.stderr ?? '')));
      return c.status ?? die(`claim of ${act.r.slug} failed: ${c.error ? c.error.message : `the claim process ended by ${c.signal}`}`, 1);
    }
    if (c.stderr) process.stderr.write(redact(c.stderr)); // the claim's warnings reach the agent
    const fm = store.load(folder).find(i => i.path === act.r.path)?.fm ?? {};
    act = { ...act, say: `claimed for ${me}: start the work and record each step in the item${dod(fm)}` };
  }
  // the lead's plain work (a continue without a verdict) or a review gives way to its team's refinement review or stale review;
  // its close and rework never do (spec section 8; beyond query.py:247, which let the refinement review go first)
  const plain = () => !act || act.name === 'review' || (act.name === 'continue' && [undefined, null, '', 'none'].includes(own.find(x => x.r.slug === act.r.slug)?.fm.review_state));
  if (lead && plain()) { // query.py:247-258: the refinement review comes before the lead's own work
    // item 088: a teamless split slice goes through the same refinement review (the lead requests it and records the verdict)
    const rv = here.filter(x => ((x.fm.team && team.inTeam(x.fm)) || !x.fm.team) && ['refined', 'refinement-review'].includes(x.fm.stage) && !waitsAway(folder, x)); // 042
    if (rv.length) {
      const seqs = xs => xs.map(x => x.r.seq).join(', ');
      act = { name: 'refinement-review', r: rv[0].r, f: repo, say: `have the refinement of ${seqs(rv)} reviewed before anyone works on them: `
        + `backlog update <item> --request-refinement-review --by ${me} for each refined one; have a reviewer of the team's refinement_review rule (teams.json) `
        + "give a pass or changes verdict per item against the team standard (the item's review documents); then record each verdict: "
        + 'backlog update <item> --refinement-review pass|changes --by <reviewer> --comments "<findings; thread or session id>"' };
    }
  }
  if (lead && plain()) { // item 033: a stale review of its team is the lead's to hand on (members never take it over); before its own plain work, never before its close or rework
    const x = own.find(({ fm, undone }) => team.staleReview(fm) && fm.reviewer !== me && !undone.some(d => d.foreign && d.item?.status !== 'done')); // nor one waiting on another repository (042)
    if (x) act = { name: 'reassign-review', r: x.r, f: x.f, say: `the review of ${x.r.seq} by ${x.fm.reviewer} is stale (started ${x.fm.review_started}): hand it on: backlog update ${x.r.slug} --reassign-review <member> --by ${me} --reason "<why>"` };
  }
  if (!act && lead) { // the lead refines an incomplete item (never actions it): after complete work, before chunk
    const r = open.find(x => incomplete.has(x.id) && (x.repository || '') === repo && x.branch === branch && team.inTeam(files.get(x.path)?.fm ?? {})
      && !(files.get(x.path)?.fm.stage ?? '') && !waitsAway(folder, { fm: files.get(x.path)?.fm ?? {} })); // only its team's (item 037), outside the refinement stages: there a member refines (036); nothing waiting on another repository (042)
    if (r) {
      act = { name: 'refine', r, f: repo, say: `refine ${r.seq}, never action it: set ${incomplete.get(r.id).join(', ')} (${REFINE_HOW.replaceAll('<item>', r.slug)}); an incomplete item means the backlog was not filled properly: once complete, record the gap in the item (backlog update <item> --append "GAP: ...")` };
    }
  }
  // item 042 (owner 2026-10-29): when the work here waits on not-done items of other repositories, the answer names them
  // as the work to do first (before any chunk work here); the lead ends the session and the team is started there
  const notOwn = here.filter(x => team.inTeam(x.fm) && x.r.status !== 'done' && !own.some(o => o.r.slug === x.r.slug)); // incomplete or refining team items too
  const first = act || (lead && busy.length) ? [] : [...new Map([...own.filter(x => x.r.status !== 'done').flatMap(x => x.undone), ...notOwn.flatMap(x => team.undoneDependencies(folder, x.fm))] // claimed ones too: a dependency added after the claim
    .filter(d => d.foreign && d.item && d.item.status !== 'done')
    .map(d => [`${d.item.repository}#${d.item.seq}`, { item: `${d.item.repository}#${d.item.seq}`, repository: d.item.repository, seq: d.item.seq, slug: d.item.slug, status: d.item.status }])).values()];
  if (!act && first.length) {
    act = { name: 'idle', r: null, f: repo, say: `the work here waits on ${first.map(x => `${x.item} (${x.slug}, status ${x.status})`).join(', ')}: do that first in ${[...new Set(first.map(x => x.repository))].map(r => `repository ${r}`).join(' and ')}: ${lead ? 'end the session here; the team is started in that repository' : 'tell the team lead'}` };
  }
  if (!act && cap !== 'off' && !(lead && busy.length)) { // a busy team's lead waits (spec section 8)
    const chunks = (await rows(scope, a.all)).filter(({ r, fm, undone, f }) => team.isChunk(fm) && r.status === 'pending' && !fm.claimed_by && !undone.length
      && team.offeredTo(fm, f, repo) && team.isReady({ stage: stageOfItem(fm, '') })); // never another team's chunk item (item 037), nor one before ready (036), nor an unrefined team item (098)
    if (chunks.length || (!noClaim && team.teamName())) { // a team member with nothing else does small-chunk work; the lead does not; outside a team the agent is idle
      const { r, f } = chunks[0] ?? { r: null, f: repo };
      const where = f === repo ? '' : ` (repository ${f}: work from its clone)`;
      act = { name: 'chunk', r, f, say: r ? `do one small chunk (<= 10 min) of it${where}, then backlog update ${r.slug} --append "CHUNK <time> <what> <result>"`
        : `no item fits you: do one small chunk (<= 10 min) of refinement or tests on ${team.teamName() ? `the open items of your team ${team.teamName()}` : 'this repository\'s open items'} and append "CHUNK <time> <what> <result>" to the item you touched` };
    }
  }
  const waits = new Map(held.filter(h => h.state !== 'active').map(h => [h.slug, { slug: h.slug, text: h.state === 'awaiting-review' ? `awaiting review: ${h.fm.seq}` : h.state.replace(':', ': ') }]));
  const blocked = act && !first.length ? [] : [...own.filter(x => x.undone.length && !waits.has(x.r.slug)).map(x => ({ slug: x.r.slug, undone: x.undone })), ...[...waits.values()].map(w => ({ slug: w.slug, text: w.text }))];
  if (!act) {
    act = lead && busy.length ? { name: 'idle', r: null, f: repo, say: `your team works on ${busy.length} item(s) (${busy.map(x => x.r.seq).join(', ')}): end your turn now with a text-only reply and no tool call; do not poll, the dispatcher wakes you` } // spec section 8
      : { name: 'idle', r: null, f: repo, say: `nothing for ${me}: ${blocked.length ? 'message the agents holding the blockers below, or the coordinator' : 'tell the coordinator'}${refusal ? ` (${refusal})` : ''}` };
  }
  const { name, r, f } = act;
  if (r && f === repo) seen.view(me, folder, repo, r); // shown to the agent
  if (a.json) {
    process.stdout.write(`${dumps(clean({ // redact the values before they are escaped: a cut in the escaped text breaks the JSON
      action: name, item: r ? r.slug : null, ...(name === 'refine' ? { missing: incomplete.get(r.id) } : {}), seq: r ? r.seq : null,
      repository: f, branch: r ? r.branch : branch, instruction: act.say, claimed: name === 'claim' && Boolean(a['claim-now']),
      blocked: blocked.map(b => ({ item: b.slug, waiting_on: b.text !== undefined ? [b.text] : waitingOn(b.undone) })),
      ...(first.length ? { first } : {}),
      held: held.map(h => ({ item: h.slug, seq: h.fm.seq, state: h.state })),
    }))}\n`);
  } else {
    say(r ? `${name} ${r.slug}` : name);
    say(`   ${act.say}`);
    for (const b of blocked) say(`   blocked ${b.slug}: ${b.text ?? `waits on ${b.undone.map(team.describeDependency).join('; ')}`}`);
  }
  return name === 'idle' ? 3 : 0;
}

// query.py:303-375 team_plan (item 052): the team's dispatch plan for this branch, one action per member, read-only. The
// team-lead dispatcher sends the lead its refine entry; members take their own work from the pop. Beyond the oracle, the
// plan follows the rules of this build's pop: a stale review is the lead's to hand on (never a member's), a member's own
// work goes before another member's review request, a member waiting for its restart gets nothing, and items before
// stage ready are neither reviewed nor claimed.
// item 042: an item that waits on a not-done item of another repository is offered to nobody here (pop names that first)
const waitsAway = (folder, x) => (x.undone ?? team.undoneDependencies(folder, x.fm)).some(d => d.foreign && d.item?.status !== 'done');
async function plan(a, { all, hid, excluded, repo, branch, folder, home }) {
  const roster = team.loadRoster(a.roster || process.env.TEAM_ROSTER || '');
  const want = new Set(a.agents ? team.asList(a.agents) : Object.keys(roster));
  const members = Object.keys(roster).filter(m => want.has(m)); // roster order
  const lead = team.teamLead(a.lead);
  const files = new Map(store.load(folder).map(i => [i.path, i]));
  const every0 = await teamRows({ open: all(OPEN, hid), scope: 'branch', cap: 'off', every: false, excluded, repo, branch, folder, home });
  const missing = new Map(every0.map(x => { const file = files.get(x.r.path); return [x.r.id, file ? missingFields(file.fm, file.body) : ['the item file']]; }));
  const every = every0.filter(x => team.inTeam(x.fm)); // only the caller's team's items (TEAM_NAME)
  const rows = every.filter(x => !missing.get(x.r.id).length // an incomplete item is never dispatched to a member
    && !(x.undone ?? []).some(d => d.foreign && d.item?.status !== 'done')); // nor one that waits on another repository (042): pop names that first
  const held = Object.fromEntries(members.map(m => [m, team.heldItems(folder, m, { refining: true })]));
  const active = Object.fromEntries(members.map(m => [m, held[m].filter(h => h.state === 'active').length]));
  const busy = new Set([...rows.filter(x => x.fm.review_state === 'in_review' && !team.staleReview(x.fm)).map(x => x.fm.reviewer),
  ]);
  const out = [];
  const give = (m, action, r, say, reason, key = '') => {
    busy.add(m);
    out.push({ member: m, action, item: r.slug, seq: r.seq, instruction: say, reason, key: `${m} ${action} ${r.seq}${key}` });
  };
  for (const { r, fm } of rows) {
    const holder = fm.claimed_by || '';
    // item 082: the holder's card may be in the roster as a new session - the exact holder first, then a
    // continuation; the new session claims the item before the close or the request-review can run as it
    const m = members.includes(holder) ? holder : (holder ? members.find(x => team.sameWorker(x, holder)) : '');
    if (!m || busy.has(m) || fm.wait_on || !team.isReady(fm)) continue; // nothing before stage ready (036)
    if (held[m].some(h => !h.fm.claimed_by && h.fm.refiner === m)) continue; // a refinement in progress comes first (spec section 5)
    const claimFirst = m !== holder ? `first claim it as ${m} (backlog update ${r.slug} --claim ${m}), then ` : '';
    if (fm.review_state === 'changes-requested') {
      give(m, 'respond', r, `the review by ${fm.reviewer || 'the reviewer'} asked for changes (${fm.reviewed_at || 'time not recorded'}): ${claimFirst}read its findings in the item, fix them, record each step (backlog update ${r.slug} --append "..."), then backlog update ${r.slug} --request-review any --note "<what changed>"`,
        'claimer', fm.reviewed_at ? ` ${fm.reviewed_at}` : '');
    } else if (fm.review_state === 'passed') {
      // the plan offers the close only when the team's review rules are met for the current work commit
      if (reviewRefusal(fm) === '') give(m, 'close', r, `${claimFirst}close ${r.seq} with --close --summary (backlog update ${r.slug} --close --summary "<outcome>")`, 'claimer');
      else give(m, 'review-request', r, `${claimFirst}${reviewRefusal(fm)}: request the next review (backlog update ${r.slug} --request-review <reviewer> --note "<the commit>") and close after the rules are met`, 'review rules pending');
    }
  }
  for (const { r, fm } of rows) {
    if (!team.isReady(fm)) continue;
    if (team.staleReview(fm)) {
      if (want.has(lead) && !busy.has(lead)) give(lead, 'reassign-review', r, `the review of ${r.seq} by ${fm.reviewer} is stale (started ${fm.review_started}): hand it on: backlog update ${r.slug} --reassign-review <member> --by ${lead} --reason "<why>"`, 'stale review');
      continue;
    }
    if (fm.review_state !== 'requested') continue;
    const idle = members.filter(m => !team.isReviewAuthor(fm, m) && !busy.has(m) && !active[m]); // a member's own work goes first
    if (idle.length) give(idle[0], 'review', r, reviewSay(r.slug, fm, idle[0]), 'any member but the author');
  }
  const canClaim = Object.fromEntries(members.map(m => [m, m !== lead && !roster[m]?.review_only && team.claimRefusal(folder, m) === null]));
  const planned = []; // item 034: the claims this plan gives out count against the limits of the next ones
  for (const { r, fm, undone } of rows) {
    // item 088: a slice written before the stage field existed has no stage; the body's split marker names it as
    // refining, so the plan offers no claim the gate would refuse (the member's pop offers its refinement)
    if (r.status !== 'pending' || fm.claimed_by || undone.length || team.isChunk(fm)
      || !team.isReady({ stage: stageOfItem(fm, files.get(r.path)?.body ?? '') })) continue;
    const free = members.filter(m => !busy.has(m) && canClaim[m] && !wipRefusal(folder, repo, fm, m, r.slug, planned)).sort((x, y) => held[x].length - held[y].length || members.indexOf(x) - members.indexOf(y));
    if (free.length) {
      planned.push({ repository: repo, slug: r.slug, fm: { ...fm, status: 'in_progress', claimed_by: free[0] } });
      give(free[0], 'claim', r, `claim exactly this item (planned for you; do not pop for another): backlog update ${r.slug} --claim ${free[0]}, then start the work and record each step in the item${dod(fm)}`,
        `free member${free.length > 1 && held[free[0]].length < held[free[1]].length ? '; least loaded' : ''}`);
    }
  }
  if (want.has(lead) && !busy.has(lead)) { // the lead alone refines an incomplete item (one per plan); never one waiting for an owner decision
    const x = every.find(y => missing.get(y.r.id).length && !y.fm.stage && !waitsAway(folder, y)); // outside the refinement stages: there a member refines (036); nothing waiting on another repository (042)
    if (x) {
      const m = missing.get(x.r.id);
      give(lead, 'refine', x.r, `refine ${x.r.seq}, never action it: set ${m.join(', ')} (${REFINE_HOW.replaceAll('<item>', x.r.slug)}); once complete, record the gap in the item`, `incomplete: ${m.join(',')}`, ` ${m.join(',')}`);
    }
  }
  if (a.json) process.stdout.write(`${dumps(clean(out))}\n`);
  else for (const e of out) say(`${e.member}: ${e.action} ${e.item} (${e.reason}) - ${e.instruction}`);
  return 0;
}

// query.py:405-460 up to the call of pop(); argv is that of `backlog query` (with --pop, or --next --agent) or of `backlog pop`.
export const run = argv => store.cloneLocked(store.resolveHome().home, () => popCommand(argv)); // a read that pulls waits for a writer of the clone
async function popCommand(argv) {
  let a;
  try { a = parse(argv); } catch (e) { return die(e.message); }
  if (a.headless) return die('--headless is not in this build');
  if (a.agents && !a.plan) return die('--agents goes with --plan (the team members present)');
  if (a.critical) return die('--critical cannot be combined with --pop in this build');
  if (!a.agent && !a.plan) return die('--pop needs --agent <your name>');
  const cwd = process.cwd();
  let repo;
  try { repo = team.teamScope().repo || store.repoId(cwd); } catch (e) { return die(e.message); }
  const { home } = store.resolveHome();
  try { await sync.pull(home); } catch (e) { if (e instanceof BacklogError) return die(e.message, e.exitCode); throw e; }
  let folder;
  try { folder = store.folder(home, repo); } catch (e) { return die(e.message); }
  if (!existsSync(join(folder, 'backlog.db'))) {
    say(a.json ? '{}' : `ℹ️  ${repo} has no backlog yet (no folder ${folder})`);
    return 0;
  }
  let branch;
  try { branch = a.branch || team.teamScope().branch || (await git(['branch', '--show-current'], cwd)).stdout.trim(); } catch (e) { return die(e.message); }
  const bound = team.teamScope().branch;
  if (bound) { // a bound team pops only its own branch
    if (branch !== bound) return die(`--branch ${branch}: this team session is bound to branch ${bound} (TEAM_BRANCH)`);
    a.scope = 'branch'; a.all = false;
  }
  const plain = a.phase || a.events !== undefined || a['by-branch'];
  if (!branch && !a.all && (a.next || !plain)) return die('HEAD is detached: pass --branch <name> (the branch whose queue you want) or --all');

  await assertInside(home, join(folder, 'backlog.db'));
  const con = db.connect(folder);
  try {
    const all = (sql, ...p) => con.prepare(sql).all(...p).map(r => ({ ...r }));
    const hid = con.prepare("SELECT id FROM handoff WHERE status='active' LIMIT 1").get()?.id ?? null;
    const excluded = excludedIds(all("SELECT * FROM phase WHERE status NOT IN ('archived')"), folder, repo);
    return await (a.plan ? plan : pop)(a, { all, hid, excluded, repo, branch, folder, home });
  } catch (e) {
    if (e instanceof BacklogError) return die(e.message, e.exitCode);
    throw e;
  } finally { con.close(); }
}
