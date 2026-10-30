// `backlog team pop --team <name>`: the team lead takes its team's next work item (item 056; owner 2026-10-30). A work
// item of a team has front matter team = the team and no stage (its split items carry a stage and are the members'
// work). The lead's open work item of the team is continued; else the first open, unclaimed work item in the work
// order (priority, then seq) whose claim the CLI accepts is claimed for the lead. Every step is a run of this CLI
// (query, update --claim), so every rule of update applies unchanged. The item is shown by its contents, never by a file.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { caller } from './lifecycle.js';
import { redact } from './safety.js';
import { folder as repoFolder, load, repoId, resolveHome } from './store.js';
import { gitBranch, strip, teamLead, teamName, teamScope } from './team.js';

const BIN = fileURLToPath(new URL('../../bin/backlog.js', import.meta.url));
const OPEN = ['pending', 'in_progress'];
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const say = text => process.stdout.write(`${redact(text)}\n`);
const self = args => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: process.env });
const last = r => redact(`${r.stdout}${r.stderr}`.trim().split('\n').filter(Boolean).pop() || `exit ${r.status}`);

function parse(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const [flag, eq] = argv[i].startsWith('--') ? argv[i].slice(2).split(/=(.*)/s) : [null];
    if (flag === 'json' && eq === undefined) { a.json = true; continue; }
    if (!['team', 'agent'].includes(flag)) throw new Error(`unrecognized arguments: ${argv[i]}`);
    const v = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('-') ? undefined : argv[++i]);
    if (v === undefined) throw new Error(`argument --${flag}: expected one argument`);
    a[flag] = strip(v);
  }
  return a;
}

export async function run(argv) {
  if (argv[0] !== 'pop') return die('team needs the subcommand pop: backlog team pop --team <name>');
  let a;
  try { a = parse(argv.slice(1)); } catch (e) { return die(e.message); }
  if (!a.team) return die('team pop needs --team <name>');
  const agent = a.agent || teamLead();
  if (agent !== teamLead()) return die(`only the team lead (${teamLead()}; TEAM_LEAD) takes its team's work item, not ${agent}`);
  const me = caller();
  if (me && me !== agent) return die(`you are ${me} (QWEN_CODE_AGENT_ID): team pop answers only for yourself, not for ${agent}`);
  if (teamName() && teamName() !== a.team) return die(`this session is team ${teamName()} (TEAM_NAME), not ${a.team}`);
  const fresh = self(['query', '--status', '--json']); // pulls the backlog clone
  if (fresh.status !== 0) { process.stdout.write(fresh.stdout); process.stderr.write(fresh.stderr); return fresh.status || 1; }
  let own; let branch;
  try { own = teamScope().repo || repoId(process.cwd()); branch = gitBranch(process.cwd()); } catch (e) { return die(e.message); }
  const order = (x, y) => (Number(x.fm.priority ?? 1e9) - Number(y.fm.priority ?? 1e9)) || (Number(x.fm.seq) - Number(y.fm.seq));
  const work = load(repoFolder(resolveHome().home, own))
    .filter(i => i.path.startsWith('phases/') && strip(i.fm.team || '') === a.team && !i.fm.stage && OPEN.includes(i.fm.status)
      && i.fm.repository === own && (!branch || i.fm.branch === branch))
    .sort(order);
  const read = slug => self(['query', '--phase', slug, '--agent', agent]); // the agent's view of the item for its write
  const skipped = [];
  let action = 'idle'; let item = null;
  const held = work.find(i => strip(i.fm.claimed_by || '') === agent);
  if (held) { action = 'continue'; item = held.fm.phase; }
  for (const i of held ? [] : work.filter(x => x.fm.status === 'pending' && !strip(x.fm.claimed_by || ''))) {
    read(i.fm.phase);
    const c = self(['update', i.fm.phase, '--claim', agent]);
    if (c.status === 0) { action = 'claim'; item = i.fm.phase; if (c.stderr) process.stderr.write(c.stderr); break; }
    skipped.push({ item: i.fm.phase, reason: last(c) });
  }
  let shown = null;
  if (item) {
    const q = read(item);
    try { shown = JSON.parse(q.stdout); } catch { shown = null; }
    if (q.status !== 0 || !shown) { process.stdout.write(q.stdout); process.stderr.write(q.stderr); return q.status || 1; }
  }
  const instruction = item
    ? `you hold ${item}, the work item of team ${a.team}: refine and split it into items of at most 45 minutes `
      + `(backlog new --split-from ${item} --depends-on <ids|none> --estimate <minutes> per item; they start in stage refining `
      + `for the members), then run backlog pop --agent ${agent} for each next step`
    : `no work item of team ${a.team} to take in ${own}${branch ? ` on branch ${branch}` : ''}`;
  const out = { action, item, team: a.team, repository: own, branch, instruction, skipped,
    front_matter: shown ? shown.front_matter : null, body: shown ? shown.body : null };
  if (a.json) { process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); return item ? 0 : 3; }
  say(item ? `${action} ${item}` : action);
  say(`   ${instruction}`);
  for (const s of skipped) say(`   not taken ${s.item}: ${s.reason}`);
  if (shown) {
    say('');
    say(`--- item ${item}: front matter ---`);
    for (const [k, v] of Object.entries(shown.front_matter || {})) say(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    say(`--- item ${item}: body ---`);
    process.stdout.write(`${redact(String(shown.body || '').replace(/^\n+/, ''))}${String(shown.body || '').endsWith('\n') ? '' : '\n'}`);
  }
  return item ? 0 : 3;
}
