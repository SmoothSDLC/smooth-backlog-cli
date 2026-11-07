// The command router: every command but setup. run returns the exit code; a failure prints one ❌ line on stderr.
import { existsSync } from 'node:fs';
import { redact } from './safety.js';
import { resolveHome } from './store.js';

// command -> [module relative to this file, ...arguments put in front of the user's argv]
export const TABLE = {
  new: ['./new.js'], update: ['./update.js'], query: ['./query.js'], list: ['./query.js'], team: ['../team/cli.js'],
  next: ['./query.js', '--next'], fields: ['./fields.js'], move: ['./move.js'], archive: ['./archive.js'],
};
const HELP_OF = { list: 'query' }; // an alias prints the help of the command it stands for

const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };

const load = async name => { const url = new URL(name, import.meta.url); return existsSync(url) ? import(url.href) : null; };

// `deps` is a test seam: { table, help } replace TABLE and src/help.js.
export async function run(command, argv, { table = TABLE, help } = {}) {
  if (!Object.hasOwn(table, command)) return die(`${command} is not a backlog command (${Object.keys(TABLE).join(', ')}, setup). Use backlog --help.`);
  if (argv.includes('--help')) {
    const text = (help ?? (await load('../help.js'))?.HELP)?.[HELP_OF[command] ?? command];
    if (text) { process.stdout.write(text.endsWith('\n') ? text : `${text}\n`); return 0; }
  }
  const { ask } = resolveHome(); // the storage location: a missing configured clone is refused here, before the command runs
  if (ask) return die(ask.text, ask.code);
  const [spec, ...lead] = table[command];
  return (await (await load(spec)).run([...lead, ...argv])) ?? 0;
}
