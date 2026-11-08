// The command router: every command but setup. run returns the exit code; a failure prints one ❌ line on stderr.
import { existsSync } from 'node:fs';
import { redact } from './safety.js';
import { resolveHome } from './store.js';

// command -> [module relative to this file, ...arguments put in front of the user's argv]
export const TABLE = {
  new: ['./new.js'], update: ['./update.js'], query: ['./query.js'], list: ['./read.js', 'list'], team: ['../team/cli.js'],
  next: ['./query.js', '--next'], fields: ['./fields.js'], move: ['./move.js'], archive: ['./archive.js'],
};

// The commands that an alias row also spells (list open) are real commands first: main.js does not translate them.
// A first-release switch (--ask, --headless) is dropped by the alias, so a call that carries one still goes to the alias.
export function own(argv) {
  const at = argv.findIndex(x => x !== '--json');
  if (at < 0 || argv.some(x => x === '--ask' || x === '--headless')) return false;
  return argv[at] === 'list' && argv[at + 1] !== 'branch'; // list branch is the alias of list branches
}

const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };

const load = async name => { const url = new URL(name, import.meta.url); return existsSync(url) ? import(url.href) : null; };

// `deps` is a test seam: { table, help } replace TABLE and src/help.js.
export async function run(command, argv, { table = TABLE, help } = {}) {
  if (!Object.hasOwn(table, command)) return die(`${command} is not a backlog command (${Object.keys(TABLE).join(', ')}, setup). Use backlog --help.`);
  if (argv.includes('--help')) {
    const base = help ?? (await load('../help.js'))?.HELP;
    // backlog team <command> --help prints the help of that command; the team help lives with the team code
    const team = command === 'team' ? (await load('../team/help.js'))?.teamHelp : null;
    const text = team ? team[`team ${argv[0]}`] ?? team.team : base?.[`${command} ${argv[0]}`] ?? base?.[command]; // a command with a word of its own (list open) may have its own text
    if (text) { process.stdout.write(text.endsWith('\n') ? text : `${text}\n`); return 0; }
  }
  const { ask } = resolveHome(); // the storage location: a missing configured clone is refused here, before the command runs
  if (ask) return die(ask.text, ask.code);
  const [spec, ...lead] = table[command];
  return (await (await load(spec)).run([...lead, ...argv])) ?? 0;
}
