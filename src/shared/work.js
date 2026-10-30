// `backlog work --agent <you>`: the one next-work command of a team member (item 033; spec 2026-10-28-pr1-learnings.md
// section 5). It asks `backlog pop` for the one next action in the team workflow order, marks the item as the agent's
// for that step (claim, refinement start or review start), and prints the whole item with the one instruction. Each step
// is a run of this CLI, so every rule of pop and update applies unchanged; the mark is one locked write of update.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { redact } from './safety.js';
import { folder as repoFolder, load, repoId, resolveHome } from './store.js';
import { teamScope } from './team.js';

const BIN = fileURLToPath(new URL('../../bin/backlog.js', import.meta.url));
const VALUE = ['agent', 'lead', 'roster', 'scope', 'branch'];
const BOOL = ['json', 'all'];
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const say = text => process.stdout.write(`${redact(text)}\n`);
const self = args => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: process.env });

function parse(argv) {
  const a = { pass: [] };
  for (let i = 0; i < argv.length; i++) {
    const [flag, eq] = argv[i].startsWith('--') ? argv[i].slice(2).split(/=(.*)/s) : [null];
    if (BOOL.includes(flag) && eq === undefined) { a[flag] = true; if (flag === 'all') a.pass.push('--all'); continue; }
    if (!VALUE.includes(flag)) throw new Error(`unrecognized arguments: ${argv[i]}`);
    const v = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('-') ? undefined : argv[++i]);
    if (v === undefined) throw new Error(`argument --${flag}: expected one argument`);
    a[flag] = v;
    if (flag !== 'agent') a.pass.push(`--${flag}`, v);
  }
  return a;
}

// The update that marks the item as the agent's for the step, or null when the step needs no mark (the agent holds the
// item already, refines an incomplete item as the lead, or the action has no item).
function mark(p, me) {
  if (p.action === 'review' && !p.instruction.startsWith('continue your review')) return ['update', p.item, '--start-review', '--by', me];
  if (p.action === 'refine' && p.instruction.startsWith('refine it before anyone works on it')) return ['update', p.item, '--refine-start', '--by', me];
  return null;
}

export async function run(argv) {
  let a;
  try { a = parse(argv); } catch (e) { return die(e.message); }
  if (!a.agent) return die('work needs --agent <your name>');
  if (a.lead) process.env.TEAM_LEAD = a.lead; // the marking update knows the same lead as the pop
  const pop = self(['pop', '--agent', a.agent, '--claim-now', '--json', ...a.pass]); // a claim is marked by pop itself
  let p;
  try { p = JSON.parse(pop.stdout); } catch { process.stdout.write(pop.stdout); process.stderr.write(pop.stderr); return pop.status ?? 1; }
  if (![0, 3].includes(pop.status) || !p.action) { process.stdout.write(pop.stdout); process.stderr.write(pop.stderr); return pop.status ?? 1; }
  let marked = p.action === 'claim' && p.claimed ? `claimed for ${a.agent}` : null;
  const step = mark(p, a.agent);
  if (step) {
    const m = self(step);
    if (m.status !== 0) { process.stdout.write(m.stdout); process.stderr.write(m.stderr); return m.status ?? 1; } // taken by another agent meanwhile: ask again
    marked = step.slice(2).join(' ');
    // the instruction after the mark: what is left to do, not the start just done
    p.instruction = p.action === 'review'
      ? p.instruction.replace(`start the review: backlog update ${p.item} --start-review --by ${a.agent}; then `, 'you started the review: ')
      : p.instruction.replace(`refine it before anyone works on it: backlog update ${p.item} --refine-start --by ${a.agent}, `, 'you started refining it: ');
  }
  let item = null;
  let own = '';
  try { own = teamScope().repo || repoId(process.cwd()); } catch { own = ''; }
  if (p.item && p.repository === own) {
    const q = self(['query', '--phase', p.item, '--agent', a.agent]); // the whole item, and the agent's view of it for its next write
    try { item = JSON.parse(q.stdout); } catch { item = null; }
    if (q.status !== 0 || !item) { process.stdout.write(q.stdout); process.stderr.write(q.stderr); return q.status || 1; }
  } else if (p.item) { // chunk work of another repository: its item file in that repository's folder of the backlog repository
    const file = load(repoFolder(resolveHome().home, p.repository)).find(i => i.fm.phase === p.item || i.path.endsWith(`/${p.item}.md`));
    if (!file) return die(`${p.item}: no such item in the backlog of ${p.repository}`, 1);
    item = { front_matter: file.fm, body: file.body };
  }
  const out = { ...p, marked, front_matter: item ? item.front_matter : null, body: item ? item.body : null };
  if (a.json) { process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); return pop.status; }
  say(p.item ? `${p.action} ${p.item}` : p.action);
  if (marked) say(`   marked: ${marked}`);
  say(`   ${p.instruction}`);
  for (const b of p.blocked || []) say(`   blocked ${b.item}: ${b.waiting_on.map(w => (typeof w === 'string' ? w : `waits on ${w.slug ?? w.id} (status ${w.status}, claimed by ${w.claimed_by || 'nobody'})`)).join('; ')}`);
  if (item) {
    say('');
    say(`--- item ${p.item}: front matter ---`);
    for (const [k, v] of Object.entries(item.front_matter || {})) say(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    say(`--- item ${p.item}: body ---`);
    process.stdout.write(`${redact(String(item.body || '').replace(/^\n+/, ''))}${String(item.body || '').endsWith('\n') ? '' : '\n'}`);
  }
  return pop.status;
}
