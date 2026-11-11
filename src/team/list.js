// The list printer of `backlog team query` and `backlog team query filter`: one line per item, or the array of item documents.
import { redact } from '../shared/safety.js';
import { redactDeep, say } from './json-out.js';
import { get } from './rules/expression.js';
import { showItem } from './show.js';

// rows: [{ item, entry, rank }] in print order (rank: the item's place in its team's queue, from 0). all: every team (each line names its team). team: the one team, for the empty answer.
export function printList(rows, { json = false, all = false, team = '' } = {}) {
  if (json) return say(JSON.stringify(redactDeep(rows.map(({ item, entry }) => showItem(item, entry, { json: true })))), true);
  if (!rows.length) return say(all ? 'ℹ️  no open item for any team' : `ℹ️  no open item for team ${team}`);
  return say(rows.map(({ item, entry, rank }) => `P${rank} [${item.seq}] ${item.slug}  ${get(item, 'status', entry)}  ${item.name}${all ? `  (team ${item.team})` : ''}`).map(redact).join('\n'));
}
