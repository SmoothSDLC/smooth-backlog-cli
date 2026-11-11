// `backlog done <item>`: finish one item. It runs backlog update <item> --status closed, with every other argument of the call passed on,
// so the refusals and the output are those of update (an item with a team is refused there).
import { BacklogError } from '../errors.js';
import { run as update } from './update.js';

export async function run(argv) {
  let at = 0; while (argv[at] === '--json') at++; // a leading --json belongs to the command
  const item = argv[at];
  if (item === undefined || item.startsWith('-')) throw new BacklogError('INVALID_INPUT', 'done needs an item (usage: backlog done <item>)');
  return update([...argv.slice(0, at), item, '--status', 'closed', ...argv.slice(at + 1)], { step: 'done' });
}
