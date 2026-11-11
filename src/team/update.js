// `backlog team update <item> <step> [--<argument> <value>]...`: one step of the team's rules on an existing item. The rules decide; a refusal writes nothing. An allowance
// is applied (src/team/apply.js) and published as the command's own commit (src/shared/team-publish.js), and printed after that.
import { BacklogError } from '../errors.js';
import { find } from '../shared/index.js';
import { redact } from '../shared/safety.js';
import { readConfig, topOf } from '../shared/setup.js';
import { cloneLocked, configDir, folder as folderOf, now, repoId, resolveHome } from '../shared/store.js';
import { publishTeam } from '../shared/team-publish.js';
import { apply } from './apply.js';
import { redactDeep, say } from './json-out.js';
import { parseArgs } from './args.js';
import { VALUE, resolveInputs } from './inputs.js';
import { contextOf } from './item.js';
import { pullFolder, watched } from './pull.js';
import { Refusal } from './rules/expression.js';
import { step } from './rules/step.js';
import { sessionOf } from './session.js';
import { stepNames } from './steps.js';
import { loadTeams } from './teams-load.js';

const invalid = text => new BacklogError('INVALID_INPUT', text);

export async function run(argv) {
  try { return await updateItem(argv); } catch (e) {
    if (!(e instanceof BacklogError)) throw e;
    process.stderr.write(`❌ backlog: ${redact(e.message)}\n`);
    return e.exitCode;
  }
}

const show = v => (typeof v === 'string' ? (v === '' ? '""' : v) : JSON.stringify(v ?? null));
export const lines = (changes, order, indent) => Object.entries(changes)
  .sort(([a], [b]) => (order.indexOf(a) + 1 || order.length + 1) - (order.indexOf(b) + 1 || order.length + 1))
  .map(([f, [before, after]]) => `${indent}${f}: ${show(before)} -> ${show(after)}`);

// What the command prints once the change is published: the line, the item's changes in the definition's order, one line per related item changed, the say text; --json the raw payload.
function printed({ built, result, item, name, entry, json }) {
  const related = Object.fromEntries([...result.changes].filter(([s]) => s !== item.seq));
  const own = result.changes.get(item.seq) ?? {};
  if (json) return JSON.stringify(redactDeep({ item: item.seq, step: name, rule: built.rule, changes: own, related, say: result.say ?? '' }));
  const order = Object.keys(entry.item);
  return [`✅ ${item.slug}: ${name} (rule ${built.rule})`, ...lines(own, order, '   '),
    ...Object.entries(related).filter(([, c]) => Object.keys(c).length).map(([s, c]) => `   item ${s}: ${lines(c, order, '').join('; ')}`),
    ...(result.say ? [result.say] : [])].join('\n');
}

async function updateItem(argv) {
  const { positionals, flags, args } = parseArgs(argv, [...VALUE, 'json', 'show-all']);
  if (positionals.length !== 2) throw invalid(positionals.length < 2 ? 'team update needs an item and a step: backlog team update <item> <step> [--<argument> <value>]...' : `unrecognized arguments: ${positionals.slice(2).join(' ')}`);
  const [ident, name] = positionals;
  const top = topOf(process.cwd());
  if (!top) throw invalid('run this from inside a git repository (the repository whose backlog you want)');
  const inputs = resolveInputs({ command: 'update', flags, env: process.env, config: readConfig(top) });
  const workRepo = repoId(process.cwd());
  const repo = inputs.repository || workRepo;
  const session = sessionOf({ inputs, repo });

  const { home } = resolveHome();
  const folder = folderOf(home, repo);
  return cloneLocked(home, async () => {
    await pullFolder(home, folder);
    let persistSha = () => {}; // the SHA of the team file the latest run read; publishTeam writes it after the last successful publication
    const attempt = async () => {
      const loaded = loadTeams({ top, home, repo, workRepo, stateDir: configDir(), team: inputs.team, now: new Date().toISOString(), deferSha: true });
      persistSha = loaded.persistSha;
      const entry = loaded.file[inputs.team];
      const at = now();
      const { ctx, view, own } = contextOf({ folder, entry, team: inputs.team, caller: inputs.agent, args, session, now: at, branch: session.branch });
      const row = find(own.map(i => ({ seq: i.seq, slug: i.slug })), ident); // every live and archived item of the folder; a number two items hold is refused
      if (!row) return { refusal: `no item ${ident}` };
      const names = stepNames(entry);
      if (!names.includes(name)) throw invalid(`team ${inputs.team} has no step ${name} (steps: ${names.join(', ')})`);
      const item = own.find(i => i.seq === row.seq && i.slug === row.slug);
      let result;
      try { result = step({ ...ctx, step: name, item }); } catch (e) { if (e instanceof Refusal && e.exitCode === 1) return { refusal: e.message }; throw e; }
      const message = `team ${name} ${item.slug}`;
      const built = await apply({ home, folder, repo, branch: session.branch, entry, file: loaded.file, team: inputs.team, view, result, args, caller: inputs.agent, session, now: at, step: name, seq: item.seq, message });
      return { message, print: printed({ built, result, item, name, entry, json: flags.json }) };
    };

    const first = await attempt();
    if (first.refusal) { say(`❌ ${first.refusal}`); return 1; } // nothing was written
    const r = await publishTeam(home, folder, first.message, { step: name, attempt, watch: await watched(home, repo, top, workRepo), persist: () => persistSha() });
    if (r.refusal) { say(`❌ ${r.refusal}`); return 1; } // the step run again on the upstream files was refused
    say((r.result ?? first).print, flags.json);
    return 0;
  });
}
