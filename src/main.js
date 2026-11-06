import { readFileSync } from 'node:fs';
import { BacklogError } from './errors.js';
import { translate } from './shared/aliases.js';
import { redact } from './shared/safety.js';
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// One command set, wherever the item files live: setup here, everything else through the router. No arguments means next.
export async function run() {
  let argv = process.argv.slice(2);
  try {
    if (argv[0] === '--version' || argv[0] === 'version') { process.stdout.write(`${packageInfo.version}\n`); return; }
    if (argv[0] === '--help' || argv[0] === 'help' || argv[0] === '-h') { process.stdout.write((await import('./help.js')).USAGE); return; }
    const alias = translate(argv); // the command names of the first release run the command set
    if (alias?.error) throw new BacklogError('INVALID_INPUT', alias.error);
    if (alias) argv = [alias.command, ...alias.argv];
    if (argv[0] === 'init-clean') { process.exitCode = await (await import('./shared/clean.js')).run(); return; }
    if (argv[0] === 'setup') { process.exitCode = await (await import('./shared/setup.js')).run(argv.slice(1)); return; }
    let at = 0; while (argv[at] === '--json') at++; // a leading --json belongs to the command
    const named = argv[at] !== undefined && !argv[at].startsWith('-');
    const command = named ? argv[at] : 'next';
    const rest = named ? [...argv.slice(0, at), ...argv.slice(at + 1)] : argv;
    process.exitCode = await (await import('./shared/router.js')).run(command, rest);
  } catch (error) {
    process.stderr.write(`❌ backlog: ${redact(error.message)}\n`);
    process.exitCode = error.exitCode || 2;
  }
}
