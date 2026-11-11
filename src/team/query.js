// `backlog team query`: every form of the command goes through this one router (the first word check, plan, filter, rules or steps selects the form; no word is the list; any other word is an item).
// check and plan have their own modules; the list (the open items of a team in queue order), `query <item>` (one item, whole), `query filter <name>` (the items a filter selects),
// `query rules` (the team's entry as stored) and `query steps` (each step, its arguments and the rules that decide it) are read here. Nothing is written in the backlog and nothing is
// published; like every read of the team file the command writes the validated copy, the record and the SHA.
import { BacklogError } from '../errors.js';
import { find } from '../shared/index.js';
import { redact } from '../shared/safety.js';
import { readConfig, topOf } from '../shared/setup.js';
import { cloneLocked, configDir, folder as folderOf, now, repoId, resolveHome } from '../shared/store.js';
import { parseArgs } from './args.js';
import { VALUE, formOf, resolveInputs } from './inputs.js';
import { contextOf } from './item.js';
import { redactDeep, say } from './json-out.js';
import { printList } from './list.js';
import { pullFolder } from './pull.js';
import { Refusal } from './rules/expression.js';
import { filter, queue } from './rules/pop.js';
import { sessionOf } from './session.js';
import { showItem } from './show.js';
import { stepArgs, stepNames, stepWords } from './steps.js';
import { loadTeams } from './teams-load.js';

const invalid = text => new BacklogError('INVALID_INPUT', text);

export async function run(argv) {
  const form = formOf(['query', ...argv]);
  if (form === 'query check') return (await import('./check.js')).run(argv);
  if (form === 'query plan') return (await import('./plan.js')).run(argv);
  try { return await read(argv, form); } catch (e) {
    if (!(e instanceof BacklogError)) throw e;
    process.stderr.write(`❌ backlog: ${redact(e.message)}\n`);
    return e.exitCode;
  }
}

async function read(argv, form) {
  const { positionals, flags } = parseArgs(argv, [...VALUE, 'json', 'show-all'], { steps: false });
  const name = form === 'query filter' ? positionals[1] : undefined;
  if (form === 'query filter' && !name) throw invalid('team query filter needs a filter name: backlog team query filter <name> --team <name>');
  const wanted = form === 'query filter' ? 2 : form === 'query' ? 0 : 1;
  if (positionals.length > wanted) throw invalid(`unrecognized arguments: ${positionals.slice(wanted).join(' ')}`);
  const top = topOf(process.cwd());
  if (!top) throw invalid('run this from inside a git repository (the repository whose backlog you want)');
  const inputs = resolveInputs({ command: form, flags, env: process.env, config: readConfig(top) });
  const workRepo = repoId(process.cwd());
  const repo = inputs.repository || workRepo;
  const session = sessionOf({ inputs, repo });
  const { home } = resolveHome();
  const folder = folderOf(home, repo);
  const refused = text => { say(`❌ ${text}`); return 1; };

  return cloneLocked(home, async () => {
    await pullFolder(home, folder, { read: true });
    const loaded = loadTeams({ top, home, repo, workRepo, stateDir: configDir(), team: inputs.team, now: new Date().toISOString() });
    if (form === 'query rules') { // the entry as stored: data, so text and --json print the same bytes
      say(JSON.stringify(redactDeep(inputs.all ? loaded.file : loaded.file[inputs.team]), null, 2), true);
      return 0;
    }
    if (form === 'query steps') {
      const entry = loaded.file[inputs.team];
      const rows = stepNames(entry).map(step => ({ step, args: stepArgs(entry, step), rules: entry.rules.table.filter(r => r !== null && typeof r === 'object' && stepWords(r).some(w => w === '*' || w === step)).map(r => r.id) }));
      if (flags.json) say(JSON.stringify(redactDeep(rows)), true);
      else say(rows.map(r => `${r.step}  takes: ${r.args.map(a => `--${a}`).join(', ')}  rules: ${r.rules.join(', ')}`).join('\n'));
      return 0;
    }
    const contextFor = team => contextOf({ folder, entry: loaded.file[team] ?? { item: {} }, team, caller: inputs.agent, args: {}, session, now: now(), branch: inputs.branch || undefined });
    const teams = inputs.all ? Object.keys(loaded.file) : [inputs.team];

    if (form === 'query <item>') {
      const { own } = contextFor(teams[0] ?? inputs.team);
      const ident = positionals[0];
      const row = find(own.map(i => ({ seq: i.seq, slug: i.slug })), ident);
      if (!row) return refused(`no item ${ident}`);
      const item = own.find(i => i.seq === row.seq && i.slug === row.slug);
      if (!inputs.all && item.team !== inputs.team) return refused(item.team ? `item ${item.seq} belongs to team ${item.team}` : `item ${item.seq} belongs to no team`);
      const entry = loaded.file[item.team] ?? { item: {} }; // an item of no team, or of a team the file does not hold, shows every field as undeclared
      if (flags.json) say(JSON.stringify(redactDeep(showItem(item, entry, { json: true }))), true);
      else say(showItem(item, entry));
      return 0;
    }

    const rows = [];
    for (const team of teams) {
      const { ctx } = contextFor(team);
      const entry = loaded.file[team];
      let items = queue(ctx);
      if (form === 'query filter') {
        let keep;
        try { keep = new Set(filter(ctx, name)); } catch (e) { if (e instanceof Refusal && e.exitCode === 1) return refused(e.message); throw e; }
        items = items.map((item, rank) => ({ item, rank })).filter(r => keep.has(r.item.seq));
      } else items = items.map((item, rank) => ({ item, rank }));
      rows.push(...items.map(r => ({ ...r, entry })));
    }
    printList(rows, { json: flags.json, all: inputs.all, team: inputs.team });
    return 0;
  });
}
