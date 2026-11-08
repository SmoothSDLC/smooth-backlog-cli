import { readFileSync } from 'node:fs';
import { BacklogError } from './errors.js';
import { redact } from './shared/safety.js';
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// One command set, wherever the item files live: setup and upgrade here, everything else through the router. No arguments prints the help.
export async function run() {
  const argv = process.argv.slice(2);
  const finish = process.stderr.isTTY ? (await import('./upgrade.js')).startNotice(argv) : null; // the update notice: only for a person at a terminal
  try {
    if (argv[0] === '--version' || argv[0] === 'version') { process.stdout.write(`${packageInfo.version}\n`); return; }
    if (argv[0] === '--help' || argv[0] === 'help' || argv[0] === '-h') { process.stdout.write((await import('./help.js')).USAGE); return; }
    if (argv.length === 0) { process.stdout.write((await import('./help.js')).USAGE); return; } // no word: the top-level help
    if (argv[0] === 'upgrade') { // the self-update needs no backlog
      if (argv.includes('--help')) { process.stdout.write((await import('./help.js')).HELP.upgrade); return; }
      process.exitCode = await (await import('./upgrade.js')).run(argv.slice(1)); return;
    }
    if (argv[0] === 'setup') { process.exitCode = await (await import('./shared/setup.js')).run(argv.slice(1)); return; }
    let at = 0; while (argv[at] === '--json') at++; // a leading --json belongs to the command
    const named = argv[at] !== undefined && !argv[at].startsWith('-');
    const command = named ? argv[at] : 'next';
    const rest = named ? [...argv.slice(0, at), ...argv.slice(at + 1)] : argv;
    process.exitCode = await (await import('./shared/router.js')).run(command, rest);
  } catch (error) {
    process.stderr.write(`❌ backlog: ${redact(error.message)}\n`);
    process.exitCode = error.exitCode || 2;
  } finally { await finish?.(); }
}
