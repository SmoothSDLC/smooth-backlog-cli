// The command names of the first release, as aliases of the one command set. `translate` is pure: it answers
// { command, argv } (what to run), { error } (a spelling that is refused with a pointer) or null (not an alias, route as today).
// form: the first-release spelling; runs: what it runs; heads: the spellings whose --help shows this row; help: the command whose help follows it.
export const ALIASES = [
  { form: 'init [name]', runs: 'backlog setup', heads: ['init'], help: 'setup' },
  { form: 'init clean [name]', runs: 'a typed yes, then every item of this repository\'s backlog is removed as one published change, then backlog setup', heads: ['init clean'] },
  { form: 'list new', runs: 'backlog query --only new', heads: ['list new'], help: 'query' },
  { form: 'list open', runs: 'backlog query --only open', heads: ['list open'], help: 'query' },
  { form: 'list done', runs: 'backlog query --only done', heads: ['list done'], help: 'query' },
  { form: 'list archive', runs: 'backlog query --only archive', heads: ['list archive'], help: 'query' },
  { form: 'list branch', runs: 'backlog query --branches', heads: ['list branch'], help: 'query' },
  { form: 'branch', runs: 'backlog query --branches', heads: ['branch'], help: 'query' },
  { form: 'new <name> [--description D] [--state S] [--priority P]', runs: 'backlog new --name <name> --objective D --status S --priority P (--summary is the name unless given; state new = new, open = in progress, done = closed)' },
  { form: 'set <item> name|description|state|summary|priority|branch|commit|location <value>', runs: 'backlog update <item> --name|--objective|--status|--summary|--priority|--branch|--commit|--location <value>', heads: ['set'], help: 'update' },
  { form: 'priority <item> <position>', runs: 'backlog update <item> --priority <position>', heads: ['priority'], help: 'update' },
  { form: 'priority <item>', runs: 'backlog query --phase <item>' },
  { form: 'done <item>', runs: 'backlog update <item> --status done', heads: ['done'], help: 'update' },
  { form: '<item> done', runs: 'backlog update <item> --status done' },
  { form: 'move <item> <branch>', runs: 'backlog move <item> --to-branch <branch>' },
  { form: '<item> set|priority|move …', runs: 'the same command with the item first (backlog 3 done)' },
  { form: '<command> --ask | --headless (or BACKLOG_HEADLESS=1)', runs: 'the command without the switch: it is accepted and ignored (--ask still asks for the folder in setup and init)' },
  { form: 'query --pop, next --agent', runs: 'nothing: it is refused with a pointer to backlog team pop --team <team> --agent <name> (--dry-run only answers)' },
];

const ITEM = /^\d+(-[\w.-]*)?$/;
const FIRST_RELEASE_STATE = { new: 'new', open: 'in progress', done: 'closed' }; // --state and set … state
const own = (table, key) => (Object.hasOwn(table, key) ? table[key] : undefined); // a word such as constructor is no key of a table
const statusOf1x = word => own(FIRST_RELEASE_STATE, word) ?? word;
const SET = { name: '--name', description: '--objective', summary: '--summary', priority: '--priority', branch: '--branch', commit: '--commit', location: '--location' };
const ITEM_FIRST = new Set(['done', 'set', 'priority', 'move']); // the verbs that may follow their item
const POP = '--pop is a team command: use backlog team pop --team <team> --agent <name> (--dry-run only answers)';
const to = (command, argv) => ({ command, argv });

// new <name> [--description D] [--state S] …: the flags the first release spelled differently
function newOf(rest) {
  const out = ['--name', rest[1]]; let summary = false;
  for (let i = 2; i < rest.length; i++) {
    const [flag, ...eq] = rest[i].split('=');
    const value = eq.length ? eq.join('=') : undefined;
    const take = () => value ?? rest[++i];
    if (flag === '--description') out.push('--objective', take());
    else if (flag === '--state') out.push('--status', statusOf1x(take()));
    else { if (flag === '--summary') summary = true; out.push(rest[i]); }
  }
  if (!summary) out.push('--summary', rest[1]);
  return to('new', out);
}

function alias(rest) {
  if (ITEM.test(rest[0] ?? '') && ITEM_FIRST.has(rest[1])) rest = [rest[1], rest[0], ...rest.slice(2)];
  const [head, a, b] = rest;
  switch (head) {
    case 'init': return a === 'backup' ? null : a === 'clean' ? to('init-clean', []) : to('setup', rest.includes('--ask') ? ['--ask'] : []);
    case 'list': return ['new', 'open', 'done', 'archive'].includes(a) ? to('query', ['--only', a, ...rest.slice(2)]) : a === 'branch' ? to('query', ['--branches', ...rest.slice(2)]) : null;
    case 'branch': return to('query', ['--branches', ...rest.slice(1)]);
    case 'new': return a !== undefined && !a.startsWith('-') ? newOf(rest) : null;
    case 'set': return rest.length >= 4 && (own(SET, b) || b === 'state') ? to('update', [a, b === 'state' ? '--status' : own(SET, b), b === 'state' ? statusOf1x(rest[3]) : rest[3], ...rest.slice(4)]) : null;
    case 'priority': { // a --json after the item is the switch of the command, not a position
      const json = rest.includes('--json') ? ['--json'] : []; const words = rest.filter(x => x !== '--json');
      return words.length === 3 ? to('update', [a, '--priority', words[2], ...json]) : words.length === 2 ? to('query', ['--phase', a, ...json]) : null;
    }
    case 'done': return a !== undefined && !a.startsWith('-') ? to('update', [a, '--status', 'done', ...rest.slice(2)]) : null;
    case 'move': return a !== undefined && !a.startsWith('-') && b !== undefined && !b.startsWith('-') ? to('move', [a, '--to-branch', b, ...rest.slice(3)]) : null;
    case 'query': return rest.includes('--pop') ? { error: POP } : null;
    case 'next': return rest.some(x => x === '--agent' || x.startsWith('--agent=')) ? { error: POP } : null;
    default: return null;
  }
}

export function translate(argv) {
  const lead = argv.slice(0, argv.findIndex(x => x !== '--json') === -1 ? argv.length : argv.findIndex(x => x !== '--json'));
  let rest = argv.slice(lead.length);
  const keepAsk = rest[0] === 'setup' || rest[0] === 'init'; // setup --ask asks for the folder: there it means something
  const kept = rest.filter(x => x !== '--headless' && (keepAsk || x !== '--ask'));
  const dropped = kept.length !== rest.length;
  rest = kept;
  const found = alias(rest);
  if (found?.error) return found;
  if (found) return { command: found.command, argv: [...lead, ...found.argv] };
  if (!dropped) return null;
  return rest[0] === undefined || rest[0].startsWith('-') ? to('next', [...lead, ...rest]) : to(rest[0], [...lead, ...rest.slice(1)]);
}

// The alias row a --help belongs to: the two-word spelling first (init clean, list open), then the first word; the head may follow its item.
export function aliasOf(argv) {
  const rest = argv.filter(x => x !== '--json' && x !== '--help');
  const at = ITEM.test(rest[0] ?? '') && ITEM_FIRST.has(rest[1]) ? 1 : 0;
  const words = [`${rest[at]} ${rest[at + 1]}`, rest[at]];
  for (const word of words) { const row = ALIASES.find(r => r.heads?.includes(word)); if (row) return row; }
  return null;
}
