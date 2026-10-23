// Shared-mode mode switch and command router (cli-parity job 6). Contract sections 1, 2 and 5.
// Both return the exit code; failures print the die() line of lib_db.py:39-42 on stderr.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { redact, git, validateHome } from './safety.js';
import { resolveHome, setMode } from './store.js';

// command -> [module relative to this file, ...arguments put in front of the user's argv]
export const TABLE = {
  new: ['./new.js'], update: ['./update.js'], query: ['./query.js'], pop: ['./pop.js'],
  next: ['./query.js', '--next'], move: ['./move.js'], archive: ['./archive.js'],
};

const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${message}\n`); return code; };

// `backlog --use-backlog-repo <path>` (lib_db.py:77-109, set_home.py:33-35) and `backlog --use-local-repo`.
export async function switchMode({ backlogRepo }) {
  if (backlogRepo === undefined) { setMode('local'); process.stdout.write('✅ local mode: the repo-local .backlog store is in use\n'); return 0; }
  let home;
  try { home = await validateHome(resolve(backlogRepo)); } catch (error) { return die(error.message); }
  // shortcut: no lock around the pull; the lock and exit-3 retry rules belong to sync.js (job 8), switch to sync.pull(home) then.
  const pull = await git(['pull', '-q', '--rebase', '--autostash'], home);
  if (pull.code) {
    await git(['rebase', '--abort'], home);
    return die(`could not update ${home} from origin/main (${redact(pull.stderr).trim().slice(0, 300)}); nothing was read or changed, because the local copy may be stale. Fix the cause, then run the command again`, 3);
  }
  const record = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'smoothsdlc-backlog', 'home');
  mkdirSync(dirname(record), { recursive: true });
  writeFileSync(`${record}.tmp`, `${home}\n`); renameSync(`${record}.tmp`, record);
  setMode('shared');
  process.stdout.write(`✅ shared backlog mode: ${home} (${record})\n`);
  return 0;
}

const load = async name => { const url = new URL(name, import.meta.url); return existsSync(url) ? import(url.href) : null; };

// `deps` is a test seam: { table, help } replace TABLE and src/help.js.
export async function run(command, argv, { table = TABLE, help } = {}) {
  if (!Object.hasOwn(table, command)) return die(`${command} is not a shared-mode command (${Object.keys(TABLE).join(', ')}). Use backlog --help.`);
  if (argv.includes('--help')) {
    const text = (help ?? (await load('../help.js'))?.HELP)?.[command];
    if (text) { process.stdout.write(text.endsWith('\n') ? text : `${text}\n`); return 0; }
  }
  // The oracle's order (lib_db.py:77-85): BACKLOG_HOME missing is an error, any other missing home is a question for the user.
  const { home, ask } = resolveHome();
  if (ask && !process.env.BACKLOG_HOME) return die(ask.text, ask.code);
  try { await validateHome(home); } catch (error) { return die(error.message); }
  const [spec, ...lead] = table[command];
  const module = await load(spec);
  if (!module) return die(`not built yet: ${command}`);
  return (await module.run([...lead, ...argv])) ?? 0;
}
