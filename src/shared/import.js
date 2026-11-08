// `backlog import --branch <source> [--higher]`: move the open items of another branch of this backlog to the current branch, oldest first
// (--higher then puts them first in the queue, in their order). It is a sequence of move and update commands (sequence.js); it prints text only.
import { BacklogError } from '../errors.js';
import { run as sequence } from './sequence.js';

const usage = 'usage: import --branch <source> [--higher]';

export function run(argv) {
  if (argv.includes('--json')) throw new BacklogError('INVALID_INPUT', 'import prints text only: --json is not available'); // a JSON caller must not get text
  let source; let higher = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, ...eq] = argv[i].split('=');
    if (flag === '--branch') source = eq.length ? eq.join('=') : argv[++i];
    else if (argv[i] === '--higher') higher = true;
    else throw new BacklogError('INVALID_INPUT', `import: unrecognized argument ${argv[i]} (${usage})`);
  }
  if (!source) throw new BacklogError('INVALID_INPUT', `import needs --branch <source> (${usage})`);
  return sequence({ kind: 'import', source, higher });
}
