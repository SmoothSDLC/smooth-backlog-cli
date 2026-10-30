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
import { REFINE_HOW, missingFields } from './lifecycle.js';
import { assertInside, git, redact } from './safety.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import * as team from './team.js';
import { OPEN, SCOPES, refinementCap, reviewOffer, teamRows, waitingOn } from './views.js';

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
const dod = fm => { const refs = team.asList(fm.review_refs); return refs.length ? `; definition of done: ${refs.join(', ')} (cody-coding-model: load them before working)` : ''; };
// query.py:137-148
function reviewSay(slug, fm, me) {
  const refs = team.asList(fm.review_refs);
  let text = fm.review_state === 'in_review' && fm.reviewer === me ? `continue your review (started ${fm.review_started ?? 'None'}): `
    : `start the review: backlog update ${slug} --start-review --by ${me}; then `;
  text += 'review the work of ';
  text += fm.claimed_by || 'its author';
  if (refs.length) text += `; load its review_refs first: ${refs.join(', ')} (cody-coding-model) and cite one in --comments`;
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
  const incomplete = new Map(); // members never claim, review or work an incomplete item
  for (const r of open) {
    if (excluded.has(r.id)) continue;
    const file = files.get(r.path);
    const m = file ? missingFields(file.fm, file.body) : ['the item file'];
    if (m.length) incomplete.set(r.id, m);
  }
  excluded = new Set([...excluded, ...incomplete.keys()]);
  const scope = a.scope || 'branch'; const cap = refinementCap(folder, repr);
  const rows = (s, every) => teamRows({ open, scope: s, cap, every, excluded, repo, branch, folder, home });
  // continue/review/claim stay in the caller's repository: --scope all widens only the chunk search
  const own = (await rows(narrower(scope, 'repo'), a.all)).filter(x => team.inTeam(x.fm)); // query.py:184: only the caller's team's items
  const held = team.heldItems(folder, me);
  // query.py:186-188: this branch's items of the caller's team in stage refining that nobody holds (first-round refinement)
  const here = open.filter(r => (r.repository || '') === repo && r.branch === branch).map(r => ({ r, fm: files.get(r.path)?.fm ?? {} }));
  const teamRefining = here.filter(({ fm }) => fm.team && team.inTeam(fm) && fm.stage === 'refining' && !fm.claimed_by);
  const refineHow = slug => REFINE_HOW.replaceAll('<item>', slug);
  const reviews = [];
  for (const x of own) {
    if (reviewOffer(x.fm, me) !== null && team.isReady(x.fm)) reviews.push({ name: 'review', r: x.r, fm: x.fm, f: x.f, say: reviewSay(x.r.slug, x.fm, me) });
  }
  // spec section 5 and query.py:199: your review in progress comes first; another member's request, however old, comes
  // after your own work (item 033; the review-first window of this build is gone)
  let act = reviews.find(x => x.fm.review_state === 'in_review' && x.fm.reviewer === me);
  if (!lead && team.restarting(me)) act = { name: 'stop', r: null, f: repo, say: team.STOP_TEXT }; // query.py:201-202: handed off, no new work until a fresh session
  // query.py:197-221: the item you work on, your refinement in progress, then your passed and your changes-requested items
  let mine = own.filter(({ fm }) => fm.claimed_by === me && !['requested', 'in_review'].includes(fm.review_state) && !fm.wait_on && team.isReady(fm)); // waiting for a verdict or a run is not work; nor an item before ready
  // query.py:203-211 (item 039, spec section 8): while its team works the split items the lead's work item waits: no busy
  // continue (proof runs 01 and 02 died of qwen-code loop detection while the lead polled), but a passed or
  // changes-requested item of the lead's keeps its action, and items blocked on the lead's own work do not count
  let busy = [];
  if (lead) {
    const leads = new Set(mine.map(x => String(x.r.seq)));
    // every open item of the team on this branch, incomplete ones included: an incomplete split child is the team's work too
    busy = here.filter(x => x.fm.team && team.inTeam(x.fm) && x.fm.claimed_by !== me && x.r.status !== 'done' && !leads.has(String(x.r.seq))
      && !team.undoneDependencies(folder, x.fm).some(d => d.item && leads.has(String(d.item.seq))));
    if (busy.length) mine = mine.filter(x => ['passed', 'changes-requested'].includes(x.fm.review_state));
  }
  // every open item of the team on this branch, incomplete ones included (a split child before its refinement is open work)
  const teamDone = ({ r, fm }) => lead && fm.team && !busy.length && !here.some(x => x.r.slug !== r.slug && x.fm.team === fm.team);
  const cont = ({ r, fm, f }) => (teamDone({ r, fm }) && !['passed', 'changes-requested'].includes(fm.review_state) // item 039: the lead closes the work item when every item of its team is done
    ? { name: 'continue', r, f, say: team.needsReview(fm)
      ? `every item of team ${fm.team} is done: have ${r.seq} reviewed (backlog update ${r.slug} --request-review any --note "<the items and their evidence>"), then close it after the pass`
      : `every item of team ${fm.team} is done: close ${r.seq} (backlog update ${r.slug} --close --summary "<outcome>")` }
    : fm.review_state === 'passed'
    ? { name: 'continue', r, f, say: `close ${r.seq} with --close --summary (backlog update ${r.slug} --close --summary "<outcome>")` }
    : { name: 'continue', r, f, say: `you hold it: keep working and record each step in the item (backlog update ${r.slug} --append "..."), then --request-review or --close${dod(fm)}` });
  const pick = (...states) => mine.find(({ fm }) => states.includes(fm.review_state ?? null));
  if (!act) { const x = pick(null, '', 'none'); if (x) act = cont(x); }
  if (!act) {
    const x = teamRefining.find(({ fm }) => fm.refiner === me);
    if (x) act = { name: 'refine', r: x.r, f: repo, say: `you are refining ${x.r.seq}: complete its team fields and definition of done (${refineHow(x.r.slug)}), then backlog update ${x.r.slug} --refine-done --by ${me} --note "<what you refined>"` };
  }
  if (!act) { const x = pick('passed') ?? mine.find(({ fm }) => !['passed', null, '', 'none', undefined].includes(fm.review_state)); if (x) act = cont(x); }
  if (!act && reviews.length) act = reviews[0];
  if (!act && !noClaim && team.claimRefusal(folder, me) === null) { // query.py:222-227: first-round refinement of a team item, before new work (one active item: spec section 6)
    const x = teamRefining.find(({ fm }) => !fm.refiner);
    if (x) act = { name: 'refine', r: x.r, f: repo, say: `refine it before anyone works on it: backlog update ${x.r.slug} --refine-start --by ${me}, complete its team fields and definition of done (${refineHow(x.r.slug)}), then backlog update ${x.r.slug} --refine-done --by ${me} --note "<what you refined>"` };
  }
  const refusal = act || noClaim ? null : team.claimRefusal(folder, me);
  if (!act && !refusal && !noClaim) {
    for (const { r, fm, undone, f } of own) {
      // chunk items are offered as chunk work below
      if (r.status === 'pending' && !fm.claimed_by && !undone.length && !team.isChunk(fm) && team.isReady(fm)) { // a team's item only in stage ready
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
    const fm = store.load(folder).find(i => i.path === act.r.path)?.fm ?? {};
    act = { ...act, say: `claimed for ${me}: start the work and record each step in the item${dod(fm)}` };
  }
  // the lead's plain work (a continue without a verdict) or a review gives way to its team's refinement review or stale review;
  // its close and rework never do (spec section 8; beyond query.py:247, which let the refinement review go first)
  const plain = () => !act || act.name === 'review' || (act.name === 'continue' && [undefined, null, '', 'none'].includes(own.find(x => x.r.slug === act.r.slug)?.fm.review_state));
  if (lead && plain()) { // query.py:247-258: the refinement review comes before the lead's own work
    const rv = here.filter(({ fm }) => fm.team && team.inTeam(fm) && ['refined', 'refinement-review'].includes(fm.stage));
    if (rv.length) {
      act = { name: 'refinement-review', r: rv[0].r, f: repo, say: `have the refinement of ${rv.map(x => x.r.seq).join(', ')} reviewed before anyone works on them: `
        + `backlog update <item> --request-refinement-review --by ${me} for each refined one; send them to Codex with the codex-agent tool codex `
        + '(Claude with the claude-agent tool claude_code only when Codex answers that its 5-hour usage limit is exceeded; record that answer first: '
        + 'backlog update <item> --refinement-review limit --by codex --comments "<Codex\'s answer>"), asking for a pass or changes verdict per item '
        + "against the team standard (backlog skill 'complete item', the item's review documents); then record each verdict: "
        + 'backlog update <item> --refinement-review pass|changes --by codex|claude --comments "<findings; thread or session id>"' };
    }
  }
  if (lead && plain()) { // item 033: a stale review of its team is the lead's to hand on (members never take it over); before its own plain work, never before its close or rework
    const x = own.find(({ fm }) => team.staleReview(fm) && fm.reviewer !== me);
    if (x) act = { name: 'reassign-review', r: x.r, f: x.f, say: `the review of ${x.r.seq} by ${x.fm.reviewer} is stale (started ${x.fm.review_started}): hand it on: backlog update ${x.r.slug} --reassign-review <member> --by ${me} --reason "<why>"` };
  }
  if (!act && lead) { // the lead refines an incomplete item (never actions it): after complete work, before chunk
    const r = open.find(x => incomplete.has(x.id) && (x.repository || '') === repo && x.branch === branch && team.inTeam(files.get(x.path)?.fm ?? {})
      && !(files.get(x.path)?.fm.stage ?? '')); // only its team's (item 037), outside the refinement stages: there a member refines (036)
    if (r) {
      act = { name: 'refine', r, f: repo, say: `refine ${r.seq}, never action it: set ${incomplete.get(r.id).join(', ')} (${REFINE_HOW.replaceAll('<item>', r.slug)}); an incomplete item means the backlog was not filled properly: once complete, record the gap in the item (backlog update <item> --append "GAP: ...")` };
    }
  }
  if (!act && cap !== 'off' && !(lead && busy.length)) { // a busy team's lead waits (spec section 8)
    const chunks = (await rows(scope, a.all)).filter(({ r, fm, undone, f }) => team.isChunk(fm) && r.status === 'pending' && !fm.claimed_by && !undone.length
      && team.offeredTo(fm, f, repo) && team.isReady(fm)); // never another team's chunk item (item 037), nor one before ready (036)
    if (chunks.length || !noClaim) { // query.py:271: a member with nothing else does small-chunk work; the lead does not
      const { r, f } = chunks[0] ?? { r: null, f: repo };
      const where = f === repo ? '' : ` (repository ${f}: work from its clone)`;
      act = { name: 'chunk', r, f, say: r ? `do one small chunk (<= 10 min) of it${where}, then backlog update ${r.slug} --append "CHUNK <time> <what> <result>"`
        : `no item fits you: do one small chunk (<= 10 min) of refinement or tests on ${team.teamName() ? `the open items of your team ${team.teamName()}` : 'this repository\'s open items'} and append "CHUNK <time> <what> <result>" to the item you touched` };
    }
  }
  const waits = new Map(held.filter(h => h.state !== 'active').map(h => [h.slug, { slug: h.slug, text: h.state === 'awaiting-review' ? `awaiting review: ${h.fm.seq}` : h.state.replace(':', ': ') }]));
  const blocked = act ? [] : [...own.filter(x => x.undone.length && !waits.has(x.r.slug)).map(x => ({ slug: x.r.slug, undone: x.undone })), ...[...waits.values()].map(w => ({ slug: w.slug, text: w.text }))];
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
async function plan(a, { all, hid, excluded, repo, branch, folder, home }) {
  const roster = team.loadRoster(a.roster || process.env.TEAM_ROSTER || '');
  const want = new Set(a.agents ? team.asList(a.agents) : Object.keys(roster));
  const members = Object.keys(roster).filter(m => want.has(m)); // roster order
  const lead = team.teamLead(a.lead);
  const files = new Map(store.load(folder).map(i => [i.path, i]));
  const every0 = await teamRows({ open: all(OPEN, hid), scope: 'branch', cap: 'off', every: false, excluded, repo, branch, folder, home });
  const missing = new Map(every0.map(x => { const file = files.get(x.r.path); return [x.r.id, file ? missingFields(file.fm, file.body) : ['the item file']]; }));
  const every = every0.filter(x => team.inTeam(x.fm)); // only the caller's team's items (TEAM_NAME)
  const rows = every.filter(x => !missing.get(x.r.id).length); // an incomplete item is never dispatched to a member
  const held = Object.fromEntries(members.map(m => [m, team.heldItems(folder, m, { refining: true })]));
  const active = Object.fromEntries(members.map(m => [m, held[m].filter(h => h.state === 'active').length]));
  const busy = new Set([...rows.filter(x => x.fm.review_state === 'in_review' && !team.staleReview(x.fm)).map(x => x.fm.reviewer),
    ...members.filter(m => m !== lead && team.restarting(m))]);
  const out = [];
  const give = (m, action, r, say, reason, key = '') => {
    busy.add(m);
    out.push({ member: m, action, item: r.slug, seq: r.seq, instruction: say, reason, key: `${m} ${action} ${r.seq}${key}` });
  };
  for (const { r, fm } of rows) {
    const m = fm.claimed_by;
    if (!members.includes(m) || busy.has(m) || fm.wait_on || !team.isReady(fm)) continue; // nothing before stage ready (036)
    if (fm.review_state === 'changes-requested') {
      give(m, 'respond', r, `the review by ${fm.reviewer || 'the reviewer'} asked for changes (${fm.reviewed_at || 'time not recorded'}): read its findings in the item, fix them, record each step (backlog update ${r.slug} --append "..."), then backlog update ${r.slug} --request-review any --note "<what changed>"`,
        'claimer', fm.reviewed_at ? ` ${fm.reviewed_at}` : '');
    } else if (fm.review_state === 'passed') give(m, 'close', r, `close ${r.seq} with --close --summary (backlog update ${r.slug} --close --summary "<outcome>")`, 'claimer');
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
  for (const { r, fm, undone } of rows) {
    if (r.status !== 'pending' || fm.claimed_by || undone.length || team.isChunk(fm) || !team.isReady(fm)) continue;
    const free = members.filter(m => !busy.has(m) && canClaim[m]).sort((x, y) => held[x].length - held[y].length || members.indexOf(x) - members.indexOf(y));
    if (free.length) {
      give(free[0], 'claim', r, `claim exactly this item (planned for you; do not pop for another): backlog update ${r.slug} --claim ${free[0]}, then start the work and record each step in the item${dod(fm)}`,
        `free member${free.length > 1 && held[free[0]].length < held[free[1]].length ? '; least loaded' : ''}`);
    }
  }
  if (want.has(lead) && !busy.has(lead)) { // the lead alone refines an incomplete item (one per plan); never one waiting for an owner decision
    const x = every.find(y => missing.get(y.r.id).length && !y.fm.stage); // outside the refinement stages: there a member refines (036)
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
