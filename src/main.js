import { readFileSync } from 'node:fs';
import { BacklogError } from './errors.js';
import { aliasOf, plan, translate } from './shared/aliases.js';
import { redact } from './shared/safety.js';
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// One command set, wherever the item files live: setup here, everything else through the router. No arguments means next.
export async function run() {
  let argv = process.argv.slice(2);
  try {
    if (argv[0] === '--version' || argv[0] === 'version') { process.stdout.write(`${packageInfo.version}\n`); return; }
    if (argv[0] === '--help' || argv[0] === 'help' || argv[0] === '-h') { process.stdout.write((await import('./help.js')).USAGE); return; }
    if (argv.includes('--help')) { // an alias prints its own line, then the help of the command it runs
      const row = aliasOf(argv); const { HELP } = await import('./help.js');
      if (row) { process.stdout.write(`backlog ${row.form} runs ${row.runs}\n${row.help ? `\n${HELP[row.help]}\n` : ''}`); return; }
    }
    const sequence = plan(argv); // import and archive done run several commands
    if (sequence?.error) throw new BacklogError('INVALID_INPUT', sequence.error);
    if (sequence) { process.exitCode = await (await import('./shared/sequence.js')).run(sequence); return; }
    if (argv[0] === 'upgrade') { // the self-update needs no backlog
      if (argv.includes('--help')) { process.stdout.write((await import('./help.js')).HELP.upgrade); return; }
      process.exitCode = await (await import('./upgrade.js')).run(argv.slice(1)); return;
    }
    const alias = translate(argv); // the command names of the first release run the command set
    if (alias?.error) throw new BacklogError('INVALID_INPUT', alias.error);
    if (alias?.command === 'upgrade') { // the first release's update, update check, update 1.2.3
      if (argv.includes('--help')) { process.stdout.write((await import('./help.js')).HELP.upgrade); return; }
      process.exitCode = await (await import('./upgrade.js')).run(alias.argv); return;
    }
    if (alias) argv = [alias.command, ...alias.argv];
    if (argv[0] === 'init-clean') { process.exitCode = await (await import('./shared/clean.js')).run(argv.slice(1)); return; }
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
