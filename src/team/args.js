// The arguments of a team command that takes step arguments (`new`, and the words after it): `--name value` and `--name=value`. The reserved flags (the one list of
// inputs.js) are taken out by name; every other `--name` is an argument of the step and takes a value, which may be a negative number or hold spaces. Nothing here
// reads a file, the configuration or git. Returns { positionals, flags, args }: the words that are no flag, the reserved flags (true, or the value of the five
// that take one) and the step arguments, all text.
import { BacklogError } from '../errors.js';
import { FLAGS, VALUE } from './inputs.js';

const bad = text => new BacklogError('INVALID_INPUT', text);

// accepts: the reserved flags the command takes; another reserved flag is `unrecognized arguments`. steps: false is a command with no step arguments: any other --name is
// unrecognized too. A repeated flag or argument: the last one counts.
export function parseArgs(argv, accepts = [], { steps = true } = {}) {
  const positionals = []; const flags = {}; const args = {};
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i];
    if (!word.startsWith('--')) { positionals.push(word); continue; }
    const [name, eq] = word.slice(2).split(/=(.*)/s);
    const reserved = FLAGS.includes(name);
    if (!name || (reserved ? !accepts.includes(name) : !steps)) throw bad(`unrecognized arguments: ${word}`);
    if (reserved && !VALUE.includes(name)) {
      if (eq !== undefined) throw bad(`argument --${name}: ignored explicit argument '${eq}'`);
      flags[name] = true;
      continue;
    }
    const v = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? undefined : argv[++i]);
    if (v === undefined) throw bad(`argument --${name}: expected one argument`);
    Object.defineProperty(reserved ? flags : args, name, { value: v, enumerable: true, writable: true, configurable: true }); // a name like __proto__ is a plain key
  }
  return { positionals, flags, args };
}
