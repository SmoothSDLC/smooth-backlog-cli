export const help = `backlog — branch-specific work for people and agents

Usage:
  backlog                              Next active item (priority 0)
  backlog init [repo-name]              Initialize once
  backlog init clean [repo-name]        Reset ALL backlog data/skills, including backups
  backlog init backup [repo-name]       Snapshot data/skills; replace skills only
  backlog list [new|open|done|archive] [--branch name]
  backlog list branch                  Branch names and item counts
  backlog new <name> [JSON] --description <text> --ac <text>
  backlog set <item> <property> <value>  Scalars replace; lists append
  backlog set <item> <list> <JSON-array> --force
  backlog add <item> <list> [entry] [--top]
  backlog replace <item> <list> <JSON-array>
  backlog remove <item> <list> <entry-number>
  backlog priority <item> [position]    Active priorities start at 0
  backlog priority <item> <list> <entry-number> <position>
  backlog <item> done                  Complete and close the priority gap
  backlog move <item> <destination-branch>
  backlog import --branch <source> [--higher]
  backlog archive <item|done>           Current branch only; no force option
  backlog update [check|auto|off|disable]

Item operations accept both orders: backlog set 0 name "Fix login"
and backlog 0 set name "Fix login". An item is its CURRENT active priority
or permanent GUID; done/archive rows show GUIDs. List-entry positions start at 1.
New/moved items append; reopening done work inserts at 0. States: new/open/done/archived.
Creation fields: --description, --ac, --state, --priority, --item-state-description,
--work_item_id, --tasks, --outcomes, --evidence, --references. Lists take JSON arrays.
Global options: --help, --version, --json, --ask. --ask requires a terminal.
Branch fallback: --branch or BACKLOG_CLI_BRANCH when Git cannot name a branch.
--force is valid ONLY for whole-list set replacement. Init clean affects every branch.
JSON emits {ok,data} or {ok,error}. Exit codes: 0 success, 2 invalid input, 1 failure.

Shared backlog repository mode
The items of every repository can live in one Git repository, the backlog repository, instead of in each
repository's own .backlog folder. Two options, put before the command, choose the mode; the choice is kept per user.
  backlog --use-backlog-repo <path>   Use the clone of SmoothSDLC/smoothsdlc-backlog at <path> (shared mode)
  backlog --use-local-repo            Go back to the repository's own .backlog folder (local mode)
  backlog setup [--ask]               Point this repository at the backlog repository (clone it beside it), deploy the skill
Either option may be followed by a command, which then runs in that mode. In shared mode only the commands below
exist; each one pulls the backlog repository first and pushes its change before it exits. An item is its number or
its slug. backlog <command> --help prints every flag of the command, what the flag does, and an example.
  backlog next [--all] [--branch name] [--json]   Show the next actionable item of this repository and branch
  backlog new --name <text> --depends-on <items|none> [options]   Add an item, or split one with --split-from
  backlog update <item> [options]       Change an item (status, priority, fields); --replan re-orders the backlog
  backlog query [--status|--next|--critical|--phase <item>|--events [item]|--by-branch <name>] [--all] [--json]
  backlog pop --agent <name> [options]                          Ask what one agent does next: continue, review, claim, refine, chunk or idle
  backlog work --agent <you> [options]                          A team member's next work: the action, marked as yours, with the whole item
  backlog team pop --team <name> [options]                      The team lead takes its team's next work item, with the whole item
  backlog move <item> --to-branch <name>        Move an item (or --all-open-of-branch) to a branch or --to-repository
  backlog archive <item> [--force] [--dry-run]  Archive a finished item
In shared mode backlog update changes an item; in local mode it updates the CLI. The team flags of update (claim,
review, close, waiting), the team views of query, its dispatch plan (--plan), backlog pop and backlog work work.
`;
const clean = value => String(value ?? '—').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ');
export function human(data) {
  if (data === null) return 'No active backlog item.';
  const rows = Array.isArray(data) ? data : [data];
  if (!rows.length) return 'No matching items.';
  if (!rows[0]?.id) {
    if (rows[0]?.branch) return table(['Branch', 'Active', 'Done', 'Archived', 'Total'], rows.map(x => [x.branch, x.active, x.done, x.archived, x.total]));
    return JSON.stringify(data, null, 2);
  }
  const body = [];
  for (const item of rows) {
    body.push([item.priority, item.state, item.name, item.branch, item.id, item.item_completed_at ?? '', item.item_archived_at ?? '', `description: ${item.description}; ac: ${item.ac}`]);
    for (const property of ['tasks', 'outcomes', 'evidence', 'references']) item[property].forEach((entry, i) => body.push(['', '', '', '', item.id, '', '', `${property} ${i + 1}: ${typeof entry === 'string' ? entry : `${entry.name} → ${entry.goal}`}`]));
  }
  return table(['Priority', 'State', 'Name', 'Branch', 'GUID', 'Completed', 'Archived', 'Details'], body);
}
function table(headers, rows) {
  const all = [headers, ...rows].map(row => row.map(clean)); const widths = headers.map((_, i) => Math.max(...all.map(row => [...row[i]].length)));
  return all.map(row => row.map((cell, i) => cell.padEnd(widths[i])).join(' | ').trimEnd()).join('\n');
}
