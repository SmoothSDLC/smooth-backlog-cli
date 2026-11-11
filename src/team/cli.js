// `backlog team <pop|new|update|query|define|workflow> --team <name> --agent <name>`: the only commands that know a team. The team
// comes from --team, else SMOOTH_BACKLOG_CLI_TEAM_NAME, else the repository configuration's `team`; the agent from --agent (--by), else SMOOTH_BACKLOG_CLI_AGENT,
// else the configuration's `user`. The team's entry in the backlog configuration (teams.json) governs every step.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from '../storage.js';
import { BacklogError } from '../errors.js';
import { readConfig, topOf } from '../shared/setup.js';
import { redact } from '../shared/safety.js';
import { cloneLocked, resolveHome } from '../shared/store.js';
import * as sync from '../shared/sync.js';
import { forgetTeamsConfig, installSeam, openItemsOf, setSessionTeam, setTeamsHome, teamEntry, teamsConfig, validateTeam } from './team.js';
import { strip } from '../shared/text.js';
import { redactDeep, say } from './json-out.js';
import { formOf } from './inputs.js';
import { loadWorkflow, validateWorkflow } from './workflow.js';

const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
export const SUBS = ['pop', 'new', 'update', 'query', 'define', 'workflow', 'validate', 'migrate'];
// The words the refusal names; define and workflow stay routed but are not named.
const WORDS = ['new', 'update', 'pop', 'query', 'validate', 'migrate'];

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
export function resolve(got, { agentOptional = false } = {}) {
  const top = topOf(process.cwd());
  const cfg = top ? readConfig(top) : {};
  const team = got.team || strip(process.env.SMOOTH_BACKLOG_CLI_TEAM_NAME || '') || strip(String(cfg.team ?? ''));
  const agent = got.agent || strip(process.env.SMOOTH_BACKLOG_CLI_AGENT || '') || strip(String(cfg.user ?? ''));
  if (!team) throw new Error('a team command needs --team <name> (or SMOOTH_BACKLOG_CLI_TEAM_NAME, or a team in .backlog/config.json)');
  if (!agent && !agentOptional) throw new Error('a team command needs --agent <name> (or SMOOTH_BACKLOG_CLI_AGENT, or a user in .backlog/config.json)');
  return { team, agent };
}

// a team without an entry in the configuration is refused with the text of the workflow
const unconfigured = team => { process.stdout.write(`❌ ${loadWorkflow('team').refusals.team_not_configured.replace('<team>', team)}\n`); return 1; };

// The views of `backlog team query`: the agent is passed on only when it was named, as the views behaved before.
async function query(rest, { team }, got) {
  if (!teamsConfig()[team]) return unconfigured(team);
  return (await import('./query.js')).run([...rest, ...(got.agent ? ['--agent', got.agent] : [])]);
}

export async function run(argv) {
  try { return await dispatch(argv); } catch (e) { if (e instanceof BacklogError) return die(e.message, e.exitCode); throw e; }
}

async function dispatch(argv) {
  const sub = argv[0];
  if (!SUBS.includes(sub)) return die(`team needs a subcommand (${WORDS.join(', ')}): backlog team validate --team <name>`);
  if (sub === 'validate') return (await import('./validate-command.js')).run(argv.slice(1));
  if (sub === 'migrate') return (await import('./validate-command.js')).pending('migrate', argv.slice(1), ['ask']);
  if (sub === 'new') return (await import('./new.js')).run(argv.slice(1)); // the rules engine: the old seam below is not installed for it
  if (sub === 'update') return (await import('./update.js')).run(argv.slice(1)); // the same
  if (sub === 'pop') return (await import('./pop.js')).run(argv.slice(1)); // the rules engine, as new and update
  if (sub === 'query' && ['query check', 'query plan'].includes(formOf(argv))) return (await import('./query.js')).run(argv.slice(1)); // the rules engine: no old seam
  installSeam(); // the routes below are the old commands, which read the earlier words
  setTeamsHome(resolveHome().home); // reads the team configuration of the backlog
  if (sub === 'define') return define(argv.slice(1));
  if (sub === 'workflow') return workflow(argv.slice(1));
  let split_; let who;
  try { split_ = split(argv.slice(1)); who = resolve(split_.got, { agentOptional: sub === 'query' }); } catch (e) { return die(e.message); } // the views read: a named agent switches them to the team rules, none is needed
  setSessionTeam(who.team); // the command's team is the session's: its items are the only ones in reach
  if (sub === 'query') return query(split_.rest, who, split_.got);
  return die(`team ${sub} is not available yet`);
}

// ---- define and workflow: JSON in, a validated entry in a file at the backlog root, committed and pushed

function readJson(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { throw new BacklogError('INVALID_INPUT', `cannot read ${file}: ${e.code ?? e.message}`); }
  try { return JSON.parse(text); } catch (e) { throw new BacklogError('INVALID_INPUT', `${file} is no JSON (${e.message})`); }
}
const objectOr = (v, what) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BacklogError('INVALID_INPUT', `${what} must hold a JSON object`); return v; };

// Changes <home>/<name> to what `change(current)` returns ({ next } or { same } or { refuse: [texts] }) and commits it as `message`.
async function publish(home, name, message, change) {
  return cloneLocked(home, async () => {
    await sync.pull(home);
    const file = join(home, name);
    const prior = existsSync(file) ? readFileSync(file) : null;
    let current = {};
    if (prior !== null) {
      try { current = JSON.parse(prior.toString('utf8')); } catch (e) { throw new BacklogError('INVALID_INPUT', `${file} is no JSON (${e.message})`); }
      objectOr(current, file);
    }
    const r = change(current);
    if (r.refuse || r.same) return r;
    try {
      await atomicWrite(file, `${JSON.stringify(r.next, null, 2)}\n`);
      await sync.commit(home, file, message);
    } catch (e) { if (prior === null) rmSync(file, { force: true }); else await atomicWrite(file, prior); throw e; }
    return r;
  });
}
const refused = (list, json) => {
  if (json) say(JSON.stringify(redactDeep({ ok: false, errors: list })), true);
  else for (const t of list) process.stderr.write(`❌ backlog: ${redact(t)}\n`);
  return 2;
};

async function define(rest) {
  const { file, json } = fileArgs(rest);
  const { home } = resolveHome();
  const def = objectOr(readJson(file), file);
  const errors = validateTeam(def, home);
  if (errors.length) return refused(errors, json);
  const r = await publish(home, 'teams.json', `team ${def.name} defined`, all => {
    const entry = teamEntry(def, home);
    if (JSON.stringify(all[def.name]) === JSON.stringify(entry)) return { same: true };
    const open = all[def.name] ? openItemsOf(home, def.name) : 0;
    if (open) return { refuse: [`team ${def.name} has ${open} open items; register the new composition under another name`] };
    return { next: { ...all, [def.name]: entry }, entry };
  });
  if (r.refuse) return refused(r.refuse, json);
  forgetTeamsConfig();
  const entry = r.entry ?? teamEntry(def, home);
  if (json) say(JSON.stringify(redactDeep({ ok: true, team: def.name, status: r.same ? 'unchanged' : 'defined', entry })), true);
  else say(r.same ? `team ${def.name} unchanged` : `✅ team ${def.name} defined: lead ${entry.lead}, ${entry.members.length} members, flow ${entry.workflow ?? 'team'}`);
  return 0;
}

function fileArgs(rest) {
  const out = { json: false };
  for (let i = 0; i < rest.length; i++) {
    const [flag, eq] = rest[i].startsWith('--') ? rest[i].slice(2).split(/=(.*)/s) : [null];
    if (flag === 'json' && eq === undefined) out.json = true;
    else if (flag === 'file' || flag === 'show') {
      const v = eq ?? (rest[i + 1] === undefined || rest[i + 1].startsWith('--') ? undefined : rest[++i]);
      if (v === undefined) throw new BacklogError('INVALID_INPUT', `argument --${flag}: expected one argument`);
      out[flag] = v;
    } else throw new BacklogError('INVALID_INPUT', `unrecognized arguments: ${rest[i]}`);
  }
  return out;
}

async function workflow(rest) {
  const a = fileArgs(rest);
  const { home } = resolveHome();
  if (a.show !== undefined) { say(JSON.stringify(redactDeep(loadWorkflow(a.show, home)), null, 2), true); return 0; }
  if (!a.file) throw new BacklogError('INVALID_INPUT', 'team workflow needs --file <path.json> (register a flow) or --show <name>');
  const def = objectOr(readJson(a.file), a.file);
  const errors = typeof def.workflow === 'string' && /^[\w.-]+$/.test(def.workflow) ? validateWorkflow(def) : ['workflow: must name the flow (letters, digits, . _ -)'];
  if (errors.length) return refused(errors, a.json);
  const r = await publish(home, 'workflows.json', `workflow ${def.workflow} registered`, all => {
    if (JSON.stringify(all[def.workflow]) === JSON.stringify(def)) return { same: true };
    const users = Object.entries(teamsConfig()).filter(([, e]) => (e?.workflow ?? 'team') === def.workflow);
    const open = all[def.workflow] ? users.reduce((n, [t]) => n + openItemsOf(home, t), 0) : 0;
    if (open) return { refuse: [`workflow ${def.workflow} is used by teams with ${open} open items; register the new flow under another name`] };
    return { next: { ...all, [def.workflow]: def } };
  });
  if (r.refuse) return refused(r.refuse, a.json);
  if (a.json) say(JSON.stringify(redactDeep({ ok: true, workflow: def.workflow, status: r.same ? 'unchanged' : 'registered' })), true);
  else say(r.same ? `workflow ${def.workflow} unchanged` : `✅ workflow ${def.workflow} registered`);
  return 0;
}
