// `backlog team <pop|update|query|define|workflow> --team <name> --agent <name>`: the only commands that know a team. The team
// comes from --team, else TEAM_NAME, else the repository configuration's `team`; the agent from --agent (--by), else BACKLOG_AGENT,
// else the configuration's `user`. The team's entry in the backlog configuration (teams.json) governs every step.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig, topOf } from './setup.js';
import { redact } from './safety.js';
import { resolveHome } from './store.js';
import { strip, teamsConfig } from './team.js';
import { loadWorkflow } from './workflow.js';

const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const SUBS = ['pop', 'update', 'query', 'define', 'workflow'];

// Takes --team and --agent out of argv (both forms); the rest is passed on in order.
export function split(argv) {
  const rest = []; const got = {};
  for (let i = 0; i < argv.length; i++) {
    const [flag, eq] = argv[i].startsWith('--') ? argv[i].slice(2).split(/=(.*)/s) : [null];
    if (flag !== 'team' && flag !== 'agent') { rest.push(argv[i]); continue; }
    const v = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? undefined : argv[++i]);
    if (v === undefined) throw new Error(`argument --${flag}: expected one argument`);
    got[flag] = strip(v);
  }
  return { rest, got };
}

// {team, agent}: the flag, else the environment, else the repository configuration; both are required.
export function resolve(got) {
  const top = topOf(process.cwd());
  const cfg = top ? readConfig(top) : {};
  const team = got.team || strip(process.env.TEAM_NAME || '') || strip(String(cfg.team ?? ''));
  const agent = got.agent || strip(process.env.BACKLOG_AGENT || '') || strip(String(cfg.user ?? ''));
  if (!team) throw new Error('a team command needs --team <name> (or TEAM_NAME, or a team in .backlog/config.json)');
  if (!agent) throw new Error('a team command needs --agent <name> (or BACKLOG_AGENT, or a user in .backlog/config.json)');
  return { team, agent };
}

// A bare --claim or --release takes the agent as its value.
function withAgent(rest, agent) {
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    out.push(rest[i]);
    if (['--claim', '--release'].includes(rest[i]) && (rest[i + 1] === undefined || rest[i + 1].startsWith('--'))) out.push(agent);
  }
  return out;
}

async function update(rest, { team, agent }) {
  if (!teamsConfig()[team]) { process.stdout.write(`❌ ${loadWorkflow('team').refusals.team_not_configured.replace('<team>', team)}\n`); return 1; }
  const args = withAgent(rest, agent);
  if (!args.some(x => x === '--by' || x.startsWith('--by=') || x === '--claim' || x === '--release')) args.push('--by', agent);
  return (await import('./update.js')).run(args, { team: true });
}

export async function run(argv) {
  const sub = argv[0];
  if (!SUBS.includes(sub)) return die(`team needs a subcommand (${SUBS.join(', ')}): backlog team ${SUBS.includes(sub) ? sub : 'update'} <item> --team <name> --agent <name> ...`);
  resolveHome(); // reads the team configuration of the backlog
  if (sub === 'pop') return (await import('./teampop.js')).run(argv);
  let split_; let who;
  try { split_ = split(argv.slice(1)); who = sub === 'define' || sub === 'workflow' ? null : resolve(split_.got); } catch (e) { return die(e.message); }
  if (sub === 'update') return update(split_.rest, who);
  return die(`team ${sub} is not available yet`);
}
