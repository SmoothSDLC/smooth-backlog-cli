// The read commands that are words of their own: backlog list [new|open|done|archive|branches|critical|all-branches].
// Each is the one reader of query.js (the reader `backlog team query` also runs) with its word spelled as the option.
// shortcut: list still passes an option it does not know to the reader, so the spellings that worked before work; it refuses them once the old spellings go.
import { run as read } from './query.js';

const LIST = { new: ['--only', 'new'], open: ['--only', 'open'], done: ['--only', 'done'], archive: ['--only', 'archive'], branches: ['--branches'], critical: ['--critical'], 'all-branches': ['--all'] };

// The word after the leading --json switches: [word, everything else in order].
function word(argv) {
  let at = 0; while (argv[at] === '--json') at++;
  return argv[at] !== undefined && !argv[at].startsWith('-') ? [argv[at], [...argv.slice(0, at), ...argv.slice(at + 1)]] : [undefined, argv];
}

export async function run([command, ...argv]) {
  if (command === 'list') {
    const [w, rest] = word(argv);
    return w !== undefined && Object.hasOwn(LIST, w) ? read([...LIST[w], ...rest], { branchColumn: w === 'all-branches' }) : read(argv);
  }
  throw new Error(`read.js: no command ${command}`);
}
