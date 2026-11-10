// The built-in definition of an item without a team: the keys every item file carries (the envelope) and the fields of the item.
// One source: the item file codec takes its field order from here and `backlog fields` prints it.
// A field is [key, type, values, default, set by, meaning]; values are the words a text field is meant to hold (empty: free text).
export const ENVELOPE = [
  ['seq', 'number', [], 'the next free number', 'the CLI', 'The item\'s number in this repository, never reused'],
  ['slug', 'text', [], 'the number and the title', 'the CLI', 'The name an item is addressed by in every command'],
  ['name', 'text', [], 'none, always given', 'backlog new --title, backlog update --name', 'A short title of the item'],
  ['repository', 'text', [], 'the repository of the folder', 'the CLI', 'The repository the item belongs to'],
  ['branch', 'text', [], 'the branch of the caller', 'the CLI, backlog move', 'The branch the item belongs to'],
  ['created', 'time', [], 'the time of creation', 'the CLI', 'When the item was created'],
  ['updated', 'time', [], 'the time of the last change', 'the CLI', 'When the item last changed'],
  ['updated_by', 'text', [], 'the agent named, else the user of the configuration', 'the CLI', 'Who changed the item last'],
];

export const FIELDS = [
  ['status', 'text', [], 'pending', 'backlog new --status, backlog update --status, backlog update --claim and --release, backlog done', 'Where the item is, a free word stored as typed; closed, done and archived finish an item'],
  ['objective', 'text', [], 'the title', 'backlog new --objective, backlog update --objective', 'The result the item delivers, one line'],
  ['summary', 'text', [], 'empty', 'backlog new --summary, backlog update --summary', 'Several sentences about what the item is for; it routes new work to the right item'],
  ['location', 'text', [], 'empty', 'backlog update --location', 'Free text: where the work is'],
  ['commit', 'text', [], 'the commit of HEAD at creation', 'the CLI, backlog update --commit', 'The commit the work has reached'],
  ['severity', 'text', ['normal', 'critical'], 'normal', 'backlog new --severity, backlog update --severity', 'A critical item is placed first'],
  ['owner', 'text', [], 'the user of the configuration', 'the CLI, backlog update --claim and --release', 'The agent working on the item; outside a team, the user the item belongs to'],
  ['owned_since', 'time', [], 'empty', 'the CLI', 'When the agent took the item; empty while nobody holds it'],
  ['depends_on', 'items', [], 'empty list', 'backlog new --depends-on, backlog update --set-depends-on', 'The items that must be finished first'],
  ['parent', 'item', [], 'none', 'backlog new --split-from (written from the split-link batch on; not written yet)', 'The item this one was split from'],
  ['estimate_min', 'number', [], 'empty', 'backlog new --estimate, backlog update --set-estimate', 'Minutes of work, a whole number'],
  ['complexity', 'text', [], 'empty', 'backlog new --complexity, backlog update --set-complexity', 'low, medium or high'],
  ['layer', 'text', [], 'empty', 'backlog new --layer, backlog update --set-layer', '1 to 5 or process'],
  ['chunk', 'boolean', [], 'empty', 'backlog new --chunk, backlog update --set-chunk', 'Small pieces of work any member does between items'],
  ['size_score', 'number', [], 'empty', 'backlog update --size_score', 'A whole number that sizes the item'],
  ['completed', 'time', [], 'empty', 'backlog done, backlog update --close', 'When the item was closed'],
];

// The field keys in order: the order the item file writes them in.
export const BUILT_IN_ORDER = FIELDS.map(f => f[0]);
