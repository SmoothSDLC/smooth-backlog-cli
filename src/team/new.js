// `backlog team new --name <text> [--<argument> <value>]...`: the step `new` of the team's rules on a fresh item. The number is taken from the counter only when the
// rules allow the step; the item is written, committed and published as the command's own commit (src/shared/team-publish.js), and printed after that.
import { isAbsolute, relative } from 'node:path';
import { realpathSync } from 'node:fs';
import { BacklogError } from '../errors.js';
import { highWater } from '../shared/numbers.js';
import { redact, slugify } from '../shared/safety.js';
import { readConfig, topOf } from '../shared/setup.js';
import { cloneLocked, configDir, folder as folderOf, itemFileName, now, repoId, resolveHome } from '../shared/store.js';
import * as sync from '../shared/sync.js';
import { publishTeam } from '../shared/team-publish.js';
import { apply } from './apply.js';
import { parseArgs } from './args.js';
import { VALUE, resolveInputs } from './inputs.js';
import { contextOf, nextSeqOf } from './item.js';
import { pullFolder } from './pull.js';
import { Refusal } from './rules/expression.js';
import { create } from './rules/step.js';
import { sessionOf } from './session.js';
import { loadTeams, teamsFile } from './teams-load.js';

const say = text => process.stdout.write(`${redact(text)}\n`);
const invalid = text => new BacklogError('INVALID_INPUT', text);

export async function run(argv) {
  try { return await newItem(argv); } catch (e) {
    if (!(e instanceof BacklogError)) throw e;
    process.stderr.write(`❌ backlog: ${redact(e.message)}\n`);
    return e.exitCode;
  }
}

// What the command prints once the item is published: the line, then the say text; --json the raw payload.
function printed({ built, result, number, team, json }) {
  const slug = built.items.find(x => x.seq === number).slug;
  if (json) {
    return JSON.stringify({ item: number, slug, rule: built.rule, changes: result.changes.get(number) ?? {}, related: Object.fromEntries([...result.changes].filter(([s]) => s !== number)), say: result.say ?? '' });
  }
  return [`✅ created ${slug} (seq ${number}) for team ${team}, rule ${built.rule}`, ...(result.say ? [result.say] : [])].join('\n');
}

// The repository-relative paths the command read: its folder and, when it lies inside the clone, the team file (a change of either upstream means the step runs again).
async function watched(home, repo, top, workRepo) {
  const t = await sync.target(home);
  const watch = [`${t.prefix}${repo}`];
  try {
    const rel = relative(realpathSync(t.root), realpathSync(teamsFile({ top, home, repo, workRepo }).path));
    if (!rel.startsWith('..') && !isAbsolute(rel)) watch.push(rel);
  } catch { /* the team file is not in the clone: nothing to watch */ }
  return watch;
}

async function newItem(argv) {
  const { positionals, flags, args } = parseArgs(argv, [...VALUE, 'json', 'show-all']);
  if (positionals.length) throw invalid(`unrecognized arguments: ${positionals.join(' ')}`);
  const top = topOf(process.cwd());
  if (!top) throw invalid('run this from inside a git repository (the repository whose backlog you want)');
  const inputs = resolveInputs({ command: 'new', flags, env: process.env, config: readConfig(top) });
  const workRepo = repoId(process.cwd());
  const repo = inputs.repository || workRepo;
  const session = sessionOf({ inputs, repo });
  if (!String(args.name ?? '').trim()) throw invalid('--name is required');

  const { home } = resolveHome();
  const folder = folderOf(home, repo);
  return cloneLocked(home, async () => {
    const floor = highWater(folder); // before the pull: a number the history held is never handed out again, whatever the pull brings
    await pullFolder(home, folder);
    let persistSha = () => {}; // the SHA of the team file the latest run read; publishTeam writes it after the last successful publication
    const attempt = async () => {
      const loaded = loadTeams({ top, home, repo, workRepo, stateDir: configDir(), team: inputs.team, now: new Date().toISOString(), deferSha: true });
      persistSha = loaded.persistSha;
      const entry = loaded.file[inputs.team];
      const at = now();
      const { ctx, view } = contextOf({ folder, entry, team: inputs.team, caller: inputs.agent, args, session, now: at, branch: session.branch });
      const number = nextSeqOf({ folder, view, tail: itemFileName(`-${slugify(args.name)}`), floor });
      let result;
      try { result = create(ctx, number); } catch (e) { if (e instanceof Refusal && e.exitCode === 1) return { refusal: e.message }; throw e; }
      const message = `team new ${result.items.get(number).slug}`;
      const built = await apply({ home, folder, repo, branch: session.branch, entry, file: loaded.file, team: inputs.team, view, result, args, caller: inputs.agent, session, now: at, step: 'new', number, message });
      return { message, print: printed({ built, result, number, team: inputs.team, json: flags.json }) };
    };

    const first = await attempt();
    if (first.refusal) { say(`❌ ${first.refusal}`); return 1; } // nothing was written: the number is not consumed
    const r = await publishTeam(home, folder, first.message, { step: 'new', attempt, watch: await watched(home, repo, top, workRepo), persist: () => persistSha() });
    if (r.refusal) { say(`❌ ${r.refusal}`); return 1; } // the step run again on the upstream files was refused
    say((r.result ?? first).print);
    return 0;
  });
}
