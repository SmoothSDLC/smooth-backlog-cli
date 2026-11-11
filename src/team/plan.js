// `backlog team query plan`: what `backlog team pop` would offer each person of the team, in name order. An item offered to one person is skipped for the next, so no item is offered
// twice. Nothing is written and nothing is published.
import { BacklogError } from '../errors.js';
import { redact } from '../shared/safety.js';
import { readConfig, topOf } from '../shared/setup.js';
import { cloneLocked, configDir, folder as folderOf, now, repoId, resolveHome } from '../shared/store.js';
import { parseArgs } from './args.js';
import { redactDeep, say } from './json-out.js';
import { VALUE, resolveInputs } from './inputs.js';
import { contextOf } from './item.js';
import { pullFolder } from './pull.js';
import { pop } from './rules/pop.js';
import { sessionOf } from './session.js';
import { loadTeams } from './teams-load.js';

const invalid = text => new BacklogError('INVALID_INPUT', text);

export async function run(argv) {
  try { return await planTeam(argv); } catch (e) {
    if (!(e instanceof BacklogError)) throw e;
    process.stderr.write(`❌ backlog: ${redact(e.message)}\n`);
    return e.exitCode;
  }
}

async function planTeam(argv) {
  const { positionals, flags } = parseArgs(argv, [...VALUE, 'json', 'show-all'], { steps: false });
  if (positionals.length > 1) throw invalid(`unrecognized arguments: ${positionals.slice(1).join(' ')}`); // the first word is `plan`
  const top = topOf(process.cwd());
  if (!top) throw invalid('run this from inside a git repository (the repository whose backlog you want)');
  const inputs = resolveInputs({ command: 'query plan', flags, env: process.env, config: readConfig(top) });
  const workRepo = repoId(process.cwd());
  const repo = inputs.repository || workRepo;
  const session = sessionOf({ inputs, repo });
  const { home } = resolveHome();
  const folder = folderOf(home, repo);

  return cloneLocked(home, async () => {
    await pullFolder(home, folder, { read: true });
    const loaded = loadTeams({ top, home, repo, workRepo, stateDir: configDir(), team: inputs.team, now: new Date().toISOString() });
    const entry = loaded.file[inputs.team];
    const { ctx } = contextOf({ folder, entry, team: inputs.team, caller: '', args: {}, session, now: now(), branch: session.branch });
    const skip = new Set();
    const rows = Object.keys(entry.people).sort().map(person => {
      const offer = pop({ ...ctx, caller: person, skip });
      if (offer.action === 'idle') return { person, action: null, item: null, entry: null, rule: null, slug: null };
      skip.add(offer.item);
      return { person, action: offer.action, item: offer.item, entry: offer.entry, rule: offer.rule, slug: ctx.items.find(i => i.seq === offer.item && i.repository === session.repository).slug };
    });
    if (flags.json) say(JSON.stringify(redactDeep(rows.map(({ slug, ...r }) => r))), true);
    else for (const r of rows) say(r.action === null ? `${r.person}: idle` : `${r.person}: ${r.action} [${r.item}] ${r.slug} (pop entry ${r.entry}, rule ${r.rule})`);
    return 0;
  });
}
