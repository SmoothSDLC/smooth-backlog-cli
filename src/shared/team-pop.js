// `backlog team pop --team <name> --agent <name>`: the one next-action command of a team, answering by the agent's role in the
// team's entry. A member gets the next action of the member order (continue, review, refine, claim, chunk, idle); the lead gets the
// same order plus its team's work item: an open, unclaimed work item (no stage) is claimed for the lead, and the lead's own work item
// is continued. The step the answer offers is marked in one locked write (the claim, the start of a refinement, the start of a review)
// and the whole item is printed. Every step is a run of this CLI, so every rule of `team update` applies unchanged.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as index from './index.js';
import { caller, isSplitSlice, missingFields } from './lifecycle.js';
import { redact } from './safety.js';
import { folder as repoFolder, load, repoId, resolveHome } from './store.js';
import { gitBranch, heldBy, strip, teamLead, teamScope, teamStep, undoneDependencies } from './team.js';
import { isOpen } from './workflow.js';

const clean = v => (typeof v === 'string' ? redact(v) : Array.isArray(v) ? v.map(clean) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v); // redacted before it is serialized
const BIN = () => process.env.BACKLOG_TEST_SELF || fileURLToPath(new URL('../../bin/backlog.js', import.meta.url)); // the test seam: a wrapper that fails on cue
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const say = text => process.stdout.write(`${redact(text)}\n`);
const self = (args, env = {}) => spawnSync(process.execPath, [BIN(), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
const last = r => redact(`${r.stdout}${r.stderr}`.trim().split('\n').filter(Boolean).pop() || `exit ${r.status}`);
const VALUE = ['lead', 'roster', 'scope', 'branch'];
const BOOL = ['json', 'all', 'dry-run']; // --dry-run: the answer only, nothing claimed or marked (a hook that looks before the agent acts)

export function parse(rest) {
  const a = { pass: [] };
  for (let i = 0; i < rest.length; i++) {
    const [flag, eq] = rest[i].startsWith('--') ? rest[i].slice(2).split(/=(.*)/s) : [null];
    if (BOOL.includes(flag) && eq === undefined) { a[flag] = true; if (flag === 'all') a.pass.push('--all'); continue; }
    if (!VALUE.includes(flag)) throw new Error(`unrecognized arguments: ${rest[i]}`);
    const v = eq ?? (rest[i + 1] === undefined || rest[i + 1].startsWith('-') ? undefined : rest[++i]);
    if (v === undefined) throw new Error(`argument --${flag}: expected one argument`);
    a[flag] = v;
    a.pass.push(`--${flag}`, v);
  }
  return a;
}

// The member order of the pop engine (pop.js), its answer read as JSON.
async function engine(args) {
  const write = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = chunk => { out += chunk; return true; };
  let code;
  try { code = await (await import('./pop.js')).run(args); } finally { process.stdout.write = write; }
  return { code, out };
}

export async function run({ team, agent }, rest) {
  let a;
  try { a = parse(rest); } catch (e) { return die(e.message); }
  const own = strip(process.env.TEAM_NAME || '');
  if (own && own !== team) return die(`this session is team ${own} (TEAM_NAME), not ${team}`);
  const me = caller(); // the team session's agent (BACKLOG_AGENT in a team session)
  if (me && me !== agent) return die(`you are ${me} (BACKLOG_AGENT): team pop answers only for yourself, not for ${agent}`);
  if (a.lead && strip(a.lead) !== teamLead()) return die(`--lead ${a.lead} is not the team lead of this session (${teamLead()}; TEAM_LEAD): team pop acts as the lead the updates know`);
  const lead = agent === teamLead();
  let ownRepo; let branch;
  try { ownRepo = teamScope().repo || repoId(process.cwd()); branch = gitBranch(process.cwd()); } catch (e) { return die(e.message); }
  // the clone is brought up to date first: a failed synchronisation is a failure (exit 1), never an idle answer
  const fresh = self(['query', '--status', '--json']);
  if (fresh.status === 2) { process.stderr.write(fresh.stderr); return 2; } // invalid input or place (a detached HEAD)
  if (fresh.status !== 0) { process.stderr.write(fresh.stderr); return die(`team pop stopped: ${last(fresh)}`, 1); }
  const markWith = (item, flag) => ['team', 'update', item, '--team', team, '--agent', agent, flag];
  const dry = Boolean(a['dry-run']);
  let p; let status; let marked = null; let step = null; let shown = null; let skipped = [];
  for (let attempt = 1; ; attempt++) { // the pop and the mark are two commands: a step another agent took meanwhile is asked again
    const pop = await engine(['--agent', agent, ...(dry ? [] : ['--claim-now']), '--json', ...a.pass]); // a claim is marked by the engine itself
    try { p = JSON.parse(pop.out); } catch { process.stdout.write(pop.out); return pop.code ?? 1; }
    if (![0, 3].includes(pop.code) || !p.action) { process.stdout.write(pop.out); return pop.code ?? 1; }
    status = pop.code;
    marked = p.action === 'claim' && p.claimed ? `claimed for ${agent}` : null;
    if (lead && !dry) { // the lead's own work item: continued, or the team's first open unclaimed one claimed
      const w = await workItem({ team, agent, repo: ownRepo, branch, engine: p });
      if (w.fail) return w.fail;
      if (w.out) { p = w.out; status = 0; marked = w.out.marked; skipped = w.out.skipped; shown = { front_matter: w.out.front_matter, body: w.out.body }; step = null; break; }
      skipped = w.skipped;
    }
    step = null;
    if (dry) break;
    if (p.action === 'review' && !p.instruction.startsWith('continue your review')) step = markWith(p.item, '--start-review');
    else if (p.action === 'refine' && p.instruction.startsWith('refine it before anyone works on it')) step = markWith(p.item, '--refine-start');
    if (!step) break;
    const m = self(step);
    if (m.status === 0) { if (m.stderr) process.stderr.write(m.stderr); break; } // the start's warnings reach the agent
    if (attempt === 3) { process.stdout.write(m.stdout); process.stderr.write(m.stderr); return m.status ?? 1; }
  }
  if (step) {
    marked = `${step.at(-1)} --agent ${agent}`; // what was marked: the step
    // the instruction after the mark: what is left to do, not the start just done
    p.instruction = p.action === 'review'
      ? p.instruction.replace(`start the review: ${teamStep(p.item, agent, '--start-review')}; then `, 'you started the review: ')
      : p.instruction.replace(`refine it before anyone works on it: ${teamStep(p.item, agent, '--refine-start')}, `, 'you started refining it: ');
  }
  let item = shown;
  if (!item && p.item && p.repository === ownRepo) {
    const q = self(['query', '--phase', p.item, '--agent', agent]); // the whole item, and the agent's view of it for its next write
    try { item = JSON.parse(q.stdout); } catch { item = null; }
    if (q.status !== 0 || !item) { process.stdout.write(q.stdout); process.stderr.write(q.stderr); return q.status || 1; }
  } else if (!item && p.item) { // chunk work of another repository: its item file in that repository's folder of the backlog repository
    const file = load(repoFolder(resolveHome().home, p.repository)).find(i => i.fm.phase === p.item || i.path.endsWith(`/${p.item}.md`));
    if (!file) return die(`${p.item}: no such item in the backlog of ${p.repository}`, 1);
    item = { front_matter: file.fm, body: file.body };
  }
  const fmNow = item?.front_matter ?? {};
  const holds = { claim: fmNow.claimed_by, review: fmNow.reviewer, refine: fmNow.refiner }[p.action];
  // heldBy matches an earlier session of the same card - the item is not handed on when the card keeps it in a new session
  if (marked && item && !shown && !heldBy(holds ?? '', agent)) { // handed on between the mark and the read
    return die(`${p.item} was handed on before team pop could read it (claimed by ${fmNow.claimed_by || 'nobody'}); run backlog team pop again`, 1);
  }
  const { front_matter: _f, body: _b, marked: _m, skipped: _s, team: _t, ...base } = p; // the keys, in the order of the documentation
  const { action, item: slug, seq, ...others } = base;
  const out = { action, item: slug, seq, team, ...others, marked, skipped, front_matter: item ? item.front_matter : null, body: item ? item.body : null };
  if (a.json) { process.stdout.write(`${JSON.stringify(clean(out), null, 2)}\n`); return status; }
  say(p.item ? `${p.action} ${p.item}` : p.action);
  if (marked) say(`   marked: ${marked}`);
  say(`   ${p.instruction}`);
  for (const b of p.blocked || []) say(`   blocked ${b.item}: ${b.waiting_on.map(w => (typeof w === 'string' ? w : `waits on ${w.slug ?? w.id} (status ${w.status}, claimed by ${w.claimed_by || 'nobody'})`)).join('; ')}`);
  for (const s of skipped) say(`   not taken ${s.item}: ${s.reason}`);
  if (item) {
    say('');
    say(`--- item ${p.item}: front matter ---`);
    for (const [k, v] of Object.entries(item.front_matter || {})) say(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    say(`--- item ${p.item}: body ---`);
    process.stdout.write(`${redact(String(item.body || '').replace(/^\n+/, ''))}${String(item.body || '').endsWith('\n') ? '' : '\n'}`);
  }
  return status;
}

// The lead's own work item of the team: an item of this repository and branch whose team is the team's and that has no stage (the
// items split from it carry a stage and are the members' work). The lead's open work item is continued; else the first open,
// unclaimed one in the work order (priority, then seq) whose claim the CLI accepts is claimed for the lead. {} when the engine's answer
// stands (it has something to do, or there is no work item); { out } the answer about the work item; { skipped } the items not taken.
async function workItem({ team, agent, repo, branch, engine: e }) {
  const fail = (r, text = `team pop stopped: ${last(r)}`) => { process.stderr.write(r.stderr); return { fail: die(text, 1) }; }; // every failure of a command it runs is exit 1 with its reason
  const folder = repoFolder(resolveHome().home, repo);
  const { rows, items } = index.rows(folder);
  const priority = new Map(rows.map(r => [r.path, r.priority ?? 1e9]));
  const order = (x, y) => (priority.get(x.path) - priority.get(y.path)) || (Number(x.fm.seq) - Number(y.fm.seq));
  const ours = f => strip(f.team || '') === team && !f.stage && isOpen(f.status) && f.repository === repo && f.branch === branch;
  const isWork = i => i.path.startsWith('phases/') && ours(i.fm) && !isSplitSlice(i.body); // a slice split off a work item is a member's work
  const work = items.filter(isWork).sort(order);
  const held = work.find(i => heldBy(strip(i.fm.claimed_by || ''), agent));
  // another unclaimed, complete work item of the team that waits on nothing is no part of the held one's work; anything else of the team on the branch is
  const children = w => items.some(i => i.path !== w.path && strip(i.fm.team || '') === team && i.fm.repository === repo && i.fm.branch === branch
    && !(isWork(i) && !strip(i.fm.claimed_by || '') && !missingFields(i.fm, i.body).length && !undoneDependencies(folder, i.fm, rows).length));
  // the engine answers first; a held work item with no other item of the team is continued here (the engine would offer its close)
  if (e.action !== 'idle' && !(held && e.action === 'continue' && e.item === held.fm.phase && !children(held))) return { skipped: [] };
  if (held && children(held)) return { skipped: [] }; // the lead's work item is being worked by its team: the engine's idle answer stands
  if (!branch) return { fail: die('team pop needs a branch: check one out here or set TEAM_BRANCH (a detached HEAD names none)') };
  const read = slug => self(['query', '--phase', slug, '--agent', agent]); // the agent's view of the item for its write
  const claim = slug => self(['team', 'update', slug, '--team', team, '--agent', agent, '--claim'], { TEAM_REPOSITORY: repo, TEAM_BRANCH: branch });
  // a refused claim is update's refusal (exit 1, '❌ <item>: <why>' on stdout); any other failure ends the command
  const refused = r => r.status === 1 && /^❌ /m.test(r.stdout) && !/❌ backlog:/.test(r.stderr);
  const skipped = [];
  let action = null; let item = null;
  if (held) {
    action = 'continue'; item = held.fm.phase;
    if (strip(held.fm.claimed_by || '') !== agent) { // an earlier session of the lead's card holds it: the continuation claim is recorded first
      const q = read(item);
      if (q.status !== 0) return fail(q);
      const c = claim(item);
      if (c.status !== 0) {
        if (!refused(c)) return fail(c);
        return { fail: die(`the continuation claim of ${item} was not recorded: ${last(c)}`, 1) };
      }
      if (c.stderr) process.stderr.write(c.stderr);
    }
  }
  for (const i of held ? [] : work.filter(x => !strip(x.fm.claimed_by || ''))) {
    const r = read(i.fm.phase);
    if (r.status !== 0) return fail(r);
    let f = {};
    try { f = JSON.parse(r.stdout).front_matter || {}; } catch { return fail(r); }
    // changed since the selection: not the team's any more, or taken. The claim is checked against this read
    if (!ours(f) || strip(f.claimed_by || '')) { skipped.push({ item: i.fm.phase, reason: 'changed since it was listed (team, stage, status, branch or holder)' }); continue; }
    const c = claim(i.fm.phase);
    if (c.status === 0) { action = 'claim'; item = i.fm.phase; if (c.stderr) process.stderr.write(c.stderr); break; }
    if (!refused(c)) return fail(c);
    skipped.push({ item: i.fm.phase, reason: last(c) });
  }
  if (!item) return { skipped };
  const q = read(item);
  let shown = null;
  try { shown = JSON.parse(q.stdout); } catch { shown = null; }
  if (q.status !== 0 || !shown) return fail(q); // only the reason: the read's own output names the item's file
  const f = shown.front_matter || {};
  // the final read must find the session this command answers for still holding the item, on every path: a hand-back or a
  // reassignment to another session of the same card between the selection and this read is a change, never a reported success
  if (strip(f.claimed_by || '') !== agent || !ours(f)) {
    return { fail: die(`${item} changed before team pop could show it (claimed by ${f.claimed_by || 'nobody'}, status ${f.status}); run backlog team pop again`, 1) };
  }
  const instruction = `you hold ${item}, the work item of team ${team}: refine it, and split it only when it is too big for one member `
    + `(backlog new --split-from ${item} --depends-on <ids|none> --estimate <minutes> per item; they start in stage refining `
    + `for the members); a refined work item is an ordinary item any member may claim; then run backlog team pop --team ${team} --agent ${agent} for each next step`;
  return { out: { action, item, seq: shown.seq ?? Number(f.seq), repository: repo, branch, instruction, claimed: action === 'claim', blocked: [], held: e.held ?? [],
    marked: action === 'claim' ? `claimed for ${agent}` : null, skipped, front_matter: shown.front_matter, body: shown.body } };
}
