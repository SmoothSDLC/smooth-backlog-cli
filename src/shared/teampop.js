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
  const me = caller(); // a qwen-code team identity (name@team), as backlog work: a bare QWEN_CODE_AGENT_ID is an actor id, no team member
  if (me && me !== agent) return die(`you are ${me} (QWEN_CODE_AGENT_ID): team pop answers only for yourself, not for ${agent}`);
  if (teamName() && teamName() !== a.team) return die(`this session is team ${teamName()} (TEAM_NAME), not ${a.team}`);
  // every failure of a command it runs is exit 1 with its reason: exit 3 is idle only (Codex review 2 of 056)
  const fail = r => { process.stderr.write(r.stderr); return die(`team pop stopped: ${last(r)}`, 1); };
  const fresh = self(['query', '--status', '--json']); // pulls the backlog clone
  if (fresh.status !== 0) return fail(fresh);
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
  // a refused claim is update's refusal (exit 1, '❌ <item>: <why>' on stdout); any other failure ends the command (Codex review of 056)
  const refused = r => r.status === 1 && /^❌ /m.test(r.stdout) && !/❌ backlog:/.test(r.stderr);
  for (const i of held ? [] : work.filter(x => !strip(x.fm.claimed_by || ''))) {
    const r = read(i.fm.phase);
    if (r.status !== 0) return fail(r);
    const c = self(['update', i.fm.phase, '--claim', agent]);
    if (c.status === 0) { action = 'claim'; item = i.fm.phase; if (c.stderr) process.stderr.write(c.stderr); break; }
    if (!refused(c)) return fail(c);
    skipped.push({ item: i.fm.phase, reason: last(c) });
  }
  let shown = null;
  if (item) {
    const q = read(item);
    try { shown = JSON.parse(q.stdout); } catch { shown = null; }
    if (q.status !== 0 || !shown) return fail(q); // only the reason: the read's own output names the item's file
    const f = shown.front_matter || {};
    if (strip(f.claimed_by || '') !== agent || strip(f.team || '') !== a.team || f.stage || !OPEN.includes(f.status)
      || f.repository !== own || (branch && f.branch !== branch)) {
      return die(`${item} changed before team pop could show it (claimed by ${f.claimed_by || 'nobody'}, status ${f.status}); run backlog team pop again`, 1);
    }
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
