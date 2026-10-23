import { input } from './errors.js';
import { texts, lists, guid } from './schema.js';
const booleans = ['json', 'ask', 'help', 'version', 'force', 'top', 'higher'];
const values = ['branch', ...texts, ...lists, 'state', 'priority'];
export function parse(argv) {
  const flags = {}, args = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') { args.push(...argv.slice(i + 1)); break; }
    if (!token.startsWith('--')) { args.push(token); continue; }
    const at = token.indexOf('='); const key = token.slice(2, at < 0 ? undefined : at); const inline = at < 0 ? undefined : token.slice(at + 1);
    input([...booleans, ...values].includes(key), `Unknown option --${key}. Use backlog --help.`);
    input(!(key in flags), `Option --${key} was supplied twice.`);
    if (booleans.includes(key)) { input(inline === undefined, `--${key} does not take a value.`); flags[key] = true; }
    else { const value = inline ?? argv[++i]; input(value !== undefined && !value.startsWith('--'), `--${key} requires a value.`); flags[key] = value; }
  }
  if (flags.help || flags.version) return { command: flags.help ? 'help' : 'version', args: [], flags };
  if (args.length > 1 && (/^\d+$/.test(args[0]) || guid.test(args[0]))) { const selector = args.shift(); const command = args.shift(); args.unshift(command, selector); }
  let command = args.shift() ?? 'next';
  if (command === 'branch' && args[0] === 'import') { args.shift(); command = 'import'; }
  const grammar = { next: [0, 0], init: [0, 2], list: [0, 1], new: [0, 2], set: [2, 3], add: [2, 3], replace: [3, 3], remove: [3, 3], priority: [1, 4], done: [1, 1], move: [2, 2], import: [0, 1], archive: [1, 1], branch: [0, 0], update: [0, 1] };
  input(command in grammar, `Unknown command ${command}. Use backlog --help.`);
  const [min, max] = grammar[command]; input(args.length >= min && args.length <= max, `Invalid arguments for ${command}; use backlog --help.`);
  const allowed = new Set(['json', 'ask']);
  if (['list', 'import'].includes(command)) allowed.add('branch');
  // Branch is also a fallback when Git cannot discover a named branch; context enforces the distinction.
  allowed.add('branch');
  if (command === 'new') for (const key of [...texts.filter(x => x !== 'name'), ...lists, 'state', 'priority']) allowed.add(key);
  if (command === 'set') allowed.add('force');
  if (command === 'add') allowed.add('top');
  if (command === 'import') allowed.add('higher');
  for (const key of Object.keys(flags)) input(allowed.has(key), `--${key} is not supported by ${command}.`);
  return { command, args, flags };
}
// Global mode options (shared mode, job 6). Only the leading options count (before the command name);
// they stand alone. Returns null when absent, else { backlogRepo?: path, local?: true }.
export function modeOptions(argv) {
  const rest = [...argv]; let backlogRepo, local = false;
  for (let i = 0; i < rest.length && rest[i].startsWith('--');) {
    const at = rest[i].indexOf('='); const key = at < 0 ? rest[i] : rest[i].slice(0, at);
    if (key === '--use-local-repo') { input(at < 0 && !local, '--use-local-repo does not take a value and may be given once.'); local = true; rest.splice(i, 1); }
    else if (key === '--use-backlog-repo') {
      const value = at < 0 ? rest[i + 1] : rest[i].slice(at + 1);
      input(backlogRepo === undefined, 'Option --use-backlog-repo was supplied twice.');
      input(value && !value.startsWith('--'), '--use-backlog-repo requires a path.');
      backlogRepo = value; rest.splice(i, at < 0 ? 2 : 1);
    } else i++;
  }
  if (backlogRepo === undefined && !local) return null;
  input(backlogRepo === undefined || !local, '--use-backlog-repo and --use-local-repo exclude each other.');
  input(!rest.length, 'The mode options stand alone; run the command in a second call.');
  return { backlogRepo, local };
}
// Shared mode skips the local grammar: the first word is the command, the rest is the module's own argv.
// null for --help/--version, which stay with the local path.
export function sharedCommand(argv) {
  if (['--help', '--version'].includes(argv[0])) return null;
  return argv[0] && !argv[0].startsWith('-') ? { command: argv[0], argv: argv.slice(1) } : { command: 'next', argv };
}
