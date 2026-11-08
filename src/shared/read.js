// The read commands that are words of their own: backlog list [new|open|done|archive|branches|critical|all-branches], show, history, changes
// and backlog next [all-branches]. Each is the one reader of query.js (the reader `backlog team query` also runs) with its word spelled as the option.
// shortcut: list and next still pass an option they do not know to the reader, so the spellings that worked before work; they refuse it once the old spellings go.
import { BacklogError } from '../errors.js';
import { run as read } from './query.js';

const LIST = { new: ['--only', 'new'], open: ['--only', 'open'], done: ['--only', 'done'], archive: ['--only', 'archive'], branches: ['--branches'], critical: ['--critical'], 'all-branches': ['--all'] };
const refuse = message => { throw new BacklogError('INVALID_INPUT', message); };

// The word after the leading --json switches: [word, everything else in order].
function word(argv) {
  let at = 0; while (argv[at] === '--json') at++;
  return argv[at] !== undefined && !argv[at].startsWith('-') ? [argv[at], [...argv.slice(0, at), ...argv.slice(at + 1)]] : [undefined, argv];
}

// positional arguments and the options of one command, refused when anything else is given
function take(argv, { value = [], bool = [], max = 1, name }) {
  const out = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const [flag, eq] = argv[i].startsWith('--') ? argv[i].slice(2).split(/=(.*)/s) : [null];
    if (bool.includes(flag) && eq === undefined) out.flags[flag] = true;
    else if (value.includes(flag)) {
      const v = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('-') ? undefined : argv[++i]);
      if (v === undefined) refuse(`argument --${flag}: expected one argument`);
      out.flags[flag] = v;
    } else if (!argv[i].startsWith('-') && out.positional.length < max) out.positional.push(argv[i]);
    else refuse(`unrecognized arguments: ${argv[i]} (usage: ${name})`);
  }
  return out;
}

const USAGE = {
  show: 'backlog show <item>[,<item>...] [--agent <name>] [--json]',
  history: 'backlog history [<item>]',
  changes: 'backlog changes [--agent <name>] [--json]',
};

export async function run([command, ...argv]) {
  if (command === 'list') {
    const [w, rest] = word(argv);
    return w !== undefined && Object.hasOwn(LIST, w) ? read([...LIST[w], ...rest], { branchColumn: w === 'all-branches' }) : read(argv);
  }
  if (command === 'next') {
    const [w, rest] = word(argv);
    return w === 'all-branches' ? read(['--next', '--all', ...rest]) : read(['--next', ...argv]);
  }
  if (command === 'show') { // the item whole, and what this agent has now read of it (the check of its next write)
    const { positional, flags } = take(argv, { value: ['agent'], bool: ['json'], name: USAGE.show });
    if (!positional.length) refuse(`show needs an item (usage: ${USAGE.show})`);
    return read(['--phase', positional[0], ...(flags.agent ? ['--agent', flags.agent] : []), ...(flags.json ? ['--json'] : [])]);
  }
  if (command === 'history') { // the events kept in the item files: one item, or the latest 50 of the backlog
    const { positional, flags } = take(argv, { bool: ['json'], name: USAGE.history });
    if (flags.json) refuse('history prints text only: --json is not available');
    return read(['--events', ...positional]);
  }
  if (command === 'changes') { // what changed since this agent's last use
    const { flags } = take(argv, { value: ['agent'], bool: ['json'], max: 0, name: USAGE.changes });
    return read(['--changed', ...(flags.agent ? ['--agent', flags.agent] : []), ...(flags.json ? ['--json'] : [])]);
  }
  throw new Error(`read.js: no command ${command}`);
}
