// `backlog team query`: the read views of the reader (src/shared/query.js) plus the views of a team (claimable, reviewable, blocked, decisions, plan, wip).
// src/shared/query.js runs the query; this module is the `team` object it asks.
import { existsSync } from 'node:fs';
import { run as runQuery } from '../shared/query.js';
import { missingFields } from './lifecycle.js';
import { run as plan } from './queue.js';
import { SCOPES, teamView } from './views.js';
import { wipView } from './wip.js';

export const hooks = {
  bool: ['claimable', 'reviewable', 'blocked', 'decisions', 'plan', 'wip'],
  value: ['lead', 'agents', 'scope'],
  choices: { scope: SCOPES },
  early(a, argv, { die }) {
    if (a.agents && !a.plan) return die('--agents goes with --plan (the team members present)');
    if (a.plan) return plan(argv); // queue.js repeats the preamble of the query for its own flags
    return undefined;
  },
  afterPull(a, { home, say, dump }) {
    if (!a.wip) return undefined;
    const v = wipView(home);
    if (a.json) { dump(v); return 0; }
    say(`📊 work in progress — ${v.limits_file}${existsSync(v.limits_file) ? '' : ' (none: no limits)'}`);
    for (const c of v.counts) say(`   ${c.level.padEnd(10)} ${String(c.key).padEnd(48)} ${String(c.count).padStart(3)}${c.limit === null ? '' : ` / ${c.limit}${c.count >= c.limit ? '  ⚠️ at the limit' : ''}`}`);
    say(`   stale (no change of their own for more than ${v.stale_hours} h): ${v.stale.length}`);
    for (const x of v.stale) say(`      - ${x.item} ${x.slug} (${x.holder || 'nobody'}, updated ${x.updated})`);
    return 0;
  },
  view: (a, ctx) => (a.claimable || a.reviewable || a.blocked || a.decisions ? teamView(a, ctx) : undefined),
  missing: file => (file && Object.keys(file.fm || {}).length ? missingFields(file.fm, file.body) : null),
};

export const run = argv => runQuery(argv, { team: hooks });
