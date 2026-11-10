// `backlog fields` and the table in `backlog new --help`: the built-in definition of an item without a team (item-definition.js),
// the keys every item file carries first, then the fields.
import { ENVELOPE, FIELDS } from './item-definition.js';

const COLUMNS = ['key', 'type', 'default', 'set by', 'meaning'];
const ROWS = [...ENVELOPE, ...FIELDS].map(([key, type, values, def, setBy, meaning]) => [key, values.length ? `${type}: ${values.join(', ')}` : type, def, setBy, meaning]);
const wide = COLUMNS.map((c, i) => Math.max(c.length, ...ROWS.map(f => f[i].length)));
const line = row => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(wide[i]))).join('  ');

export const table = () => [line(COLUMNS), ...ROWS.map(line)].join('\n');

export async function run(argv) {
  if (argv.includes('--json')) { process.stdout.write(`${JSON.stringify(ROWS.map(f => Object.fromEntries(COLUMNS.map((c, i) => [c, f[i]]))), null, 2)}\n`); return 0; }
  if (argv.length) { process.stderr.write(`❌ backlog: fields takes no argument but --json (got ${argv.join(' ')})\n`); return 2; }
  process.stdout.write(`${table()}\n`);
  return 0;
}
