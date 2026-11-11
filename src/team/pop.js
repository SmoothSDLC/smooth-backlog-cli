// `backlog team pop --team <name> --agent <name> [--dry-run] [--json]`: what one agent of a team does next. The pop table of the team's rules offers one step (rules/pop.js);
// it is applied (src/team/apply.js) with the result already evaluated, published as the command's own commit (src/shared/team-publish.js), and the item is printed after
// that. Idle exits 3, and only idle does. --dry-run builds the same answer and writes nothing.
import { BacklogError } from '../errors.js';
import { redact } from '../shared/safety.js';
import { readConfig, topOf } from '../shared/setup.js';
import { cloneLocked, configDir, folder as folderOf, now, repoId, resolveHome } from '../shared/store.js';
import { publishTeam } from '../shared/team-publish.js';
import { apply, build } from './apply.js';
import { redactDeep, say } from './json-out.js';
import { parseArgs } from './args.js';
import { VALUE, resolveInputs } from './inputs.js';
import { contextOf } from './item.js';
import { pullFolder, watched } from './pull.js';
import { pop } from './rules/pop.js';
import { sessionOf } from './session.js';
import { showItem } from './show.js';
import { loadTeams } from './teams-load.js';

const invalid = text => new BacklogError('INVALID_INPUT', text);

export async function run(argv) {
  try { return await popItem(argv); } catch (e) {
    if (!(e instanceof BacklogError)) throw e;
    process.stderr.write(`❌ backlog: ${redact(e.message)}\n`);
    return e.exitCode;
  }
}

// What the command prints once the step is published: the line and the whole item, or the item document; the idle answer when nothing is offered.
function printed({ offer, built, entry, team, agent, json }) {
  if (offer.action === 'idle') return json ? '{"action":"idle"}' : `ℹ️  idle: nothing for ${agent} in team ${team}`;
  const after = built.items.find(x => x.seq === offer.item).doc;
  if (json) return JSON.stringify({ ...redactDeep({ action: offer.action, item: offer.item, entry: offer.entry, rule: offer.rule }), item_file: showItem(after, entry, { json }) });
  return [`➡️  ${offer.action} ${after.slug} (pop entry ${offer.entry}, rule ${offer.rule})`, showItem(after, entry)].join('\n');
}

async function popItem(argv) {
  const { positionals, flags } = parseArgs(argv, [...VALUE, 'json', 'dry-run'], { steps: false });
  if (positionals.length) throw invalid(`unrecognized arguments: ${positionals.join(' ')}`);
  const top = topOf(process.cwd());
  if (!top) throw invalid('run this from inside a git repository (the repository whose backlog you want)');
  const inputs = resolveInputs({ command: 'pop', flags, env: process.env, config: readConfig(top) });
  const workRepo = repoId(process.cwd());
  const repo = inputs.repository || workRepo;
  const session = sessionOf({ inputs, repo });
  const dry = Boolean(flags['dry-run']);

  const { home } = resolveHome();
  const folder = folderOf(home, repo);
  return cloneLocked(home, async () => {
    try { await pullFolder(home, folder, { read: dry }); } catch (e) { // a failed pull is a failure (1), never the idle answer (3)
      if (e instanceof BacklogError && e.code === 'SYNC_FAILED' && e.exitCode === 3) e.exitCode = 1;
      throw e;
    }
    let persistSha = () => {}; // the SHA of the team file the latest run read; publishTeam writes it after the last successful publication
    const attempt = async () => {
      const loaded = loadTeams({ top, home, repo, workRepo, stateDir: configDir(), team: inputs.team, now: new Date().toISOString(), deferSha: true });
      persistSha = loaded.persistSha;
      const entry = loaded.file[inputs.team];
      const at = now();
      const { ctx, view } = contextOf({ folder, entry, team: inputs.team, caller: inputs.agent, args: {}, session, now: at, branch: session.branch });
      const offer = pop({ ...ctx, skip: new Set() });
      const show = built => printed({ offer, built, entry, team: inputs.team, agent: inputs.agent, json: flags.json });
      if (offer.action === 'idle') return { idle: true, print: show() };
      const message = `team ${offer.action} ${view.find(v => v.fm.seq === offer.item && v.path.startsWith('phases/')).fm.phase}`;
      const built = await (dry ? build : apply)({ home, folder, repo, branch: session.branch, entry, file: loaded.file, team: inputs.team, view, result: offer.result, args: {}, caller: inputs.agent, session, now: at, step: offer.action, seq: offer.item, message });
      return { message, step: offer.action, print: show(built) };
    };

    const first = await attempt();
    if (first.idle) { say(first.print, flags.json); return 3; }
    if (dry) { say(first.print, flags.json); return 0; }
    const r = await publishTeam(home, folder, first.message, { step: first.step, attempt, watch: await watched(home, repo, top, workRepo), persist: () => persistSha(), exit: 1 });
    const done = r.result ?? first;
    say(done.print, flags.json);
    return done.idle ? 3 : 0;
  });
}
