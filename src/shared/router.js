// Shared-mode mode switch and command router (cli-parity job 6). Contract sections 1, 2 and 5.
// Both return the exit code; failures print the die() line of lib_db.py:39-42 on stderr.
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assertInside, redact, validateHome } from './safety.js';
import { atomicWrite } from '../storage.js';
import { cloneLocked, resolveHome, setMode } from './store.js';
import { pull } from './sync.js';

// command -> [module relative to this file, ...arguments put in front of the user's argv]
export const TABLE = {
  new: ['./new.js'], update: ['./update.js'], query: ['./query.js'], pop: ['./pop.js'], work: ['./work.js'],
  next: ['./query.js', '--next'], move: ['./move.js'], archive: ['./archive.js'],
};

const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };

// `backlog --use-backlog-repo <path>` (lib_db.py:77-109, set_home.py:33-35) and `backlog --use-local-repo`.
export async function switchMode({ backlogRepo, rest = [] }) {
  const out = rest.length ? process.stderr : process.stdout; // a command follows: keep its stdout clean
  if (backlogRepo === undefined) { setMode('local'); out.write('✅ local mode: the repo-local .backlog store is in use\n'); return 0; }
  let home;
  try { home = await validateHome(resolve(backlogRepo)); } catch (error) { return die(error.message); }
  try { await cloneLocked(home, () => pull(home)); } catch (error) { return die(error.message, error.exitCode ?? 2); } // lock, abort, exit 3 and redaction are sync.js's
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  const record = join(config, 'smoothsdlc-backlog', 'home');
  try {
    await assertInside(config, record); // no symlink on the way to the record
    mkdirSync(dirname(record), { recursive: true });
    await atomicWrite(record, `${home}\n`);
  } catch (error) { return die(error.message); }
  setMode('shared');
  out.write(`✅ shared backlog mode: ${home} (${record})\n`);
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
