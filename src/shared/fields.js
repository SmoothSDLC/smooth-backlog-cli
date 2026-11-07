// The item template: every field of an item, the name it is shown under, what it means, who sets it and when it is required.
// `backlog fields` prints it and `backlog new --help` carries it, so a user sees the template without reading an item file.
// shortcut: the table documents the keys the item files carry today; a renamed key changes one line here.
export const FIELDS = [
  ['phase', 'slug', 'The slug: the number and the title', 'the CLI', 'always'],
  ['seq', 'number', 'The item\'s number in this repository, never reused', 'the CLI', 'always'],
  ['title', 'title', 'A short title of the item', 'the creator (new --title)', 'always'],
  ['objective', 'objective', 'The result the item delivers, one line', 'the creator (new --objective)', 'always'],
  ['summary', 'summary', 'Several sentences about what the item is for; it routes new work to the right item', 'the creator (new --summary, may repeat or hold newlines)', 'always'],
  ['body', 'description', 'The item\'s text below the front matter, with its definition of done', 'the creator (new --description), then every append', 'a team item needs a definition of done'],
  ['status', 'status', 'Where the item is: a team\'s order, or a free word outside a team (closed, done and archived finish an item)', 'the CLI and update', 'always'],
  ['severity', 'severity', 'normal or critical; a critical item jumps the queue', 'the creator (new --severity)', 'always'],
  ['repository', 'repository', 'The repository the item belongs to', 'the CLI', 'always'],
  ['branch', 'branch', 'The branch the item belongs to', 'the CLI (update --branch moves it)', 'always'],
  ['commit', 'commit', 'The commit the work has reached', 'the CLI and update --commit', 'always'],
  ['location', 'location', 'Free text: where the work is', 'update --location', 'no'],
  ['created', 'created', 'When the item was created', 'the CLI', 'always'],
  ['last_updated', 'last updated', 'When the item last changed', 'the CLI', 'always'],
  ['last_updated_by', 'last updated by', 'Who changed it last: the agent named, else the user of .backlog/config.json', 'the CLI', 'always'],
  ['team', 'team', 'The team that owns the item', 'backlog team new, backlog team update --set-team', 'for team work'],
  ['owner', 'owner', 'The agent working on the item; outside a team, the user the item belongs to (the user of .backlog/config.json)', 'the CLI (new; team update --claim and --release)', 'no'],
  ['owned_since', 'owned since', 'When the agent took the item; empty while nobody holds it', 'the CLI', 'no'],
  ['depends_on', 'depends on', 'The items that must be finished first', 'new --depends-on, update --set-depends-on', 'always (none is a value)'],
  ['review_refs', 'review documents', 'The documents that define a good result', 'backlog team new --review-refs, backlog team update --set-review-refs', 'for team work'],
  ['estimate_min', 'estimate', 'Minutes of work, a whole number', 'new --estimate, update --set-estimate', 'for team work'],
  ['complexity', 'complexity', 'low, medium or high', 'new --complexity, update --set-complexity', 'for team work'],
  ['layer', 'layer', '1 to 5 or process', 'new --layer, update --set-layer', 'no'],
  ['chunk', 'chunk', 'Small pieces of work any member does between items', 'new --chunk, update --set-chunk', 'no'],
];

const COLUMNS = ['key', 'shown as', 'meaning', 'set by', 'required'];
const wide = COLUMNS.map((c, i) => Math.max(c.length, ...FIELDS.map(f => f[i].length)));
const line = row => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(wide[i]))).join('  ');

export const table = () => [line(COLUMNS), ...FIELDS.map(line)].join('\n');

export async function run(argv) {
  if (argv.includes('--json')) { process.stdout.write(`${JSON.stringify(FIELDS.map(f => Object.fromEntries(COLUMNS.map((c, i) => [c, f[i]]))), null, 2)}\n`); return 0; }
  if (argv.length) { process.stderr.write(`❌ backlog: fields takes no argument but --json (got ${argv.join(' ')})\n`); return 2; }
  process.stdout.write(`${table()}\n`);
  return 0;
}
