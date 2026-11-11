// The team and agent levels of the work-in-progress limits, the lead's override, and the read view (backlog team query --wip).
// The overall, repository and branch levels are src/shared/wip-limits.js. The limits file and its shape are described there; the team and
// agent entries read {"team": 3 | {"default": 3, "t1": 4}, "agent": 2 | {"default": 2, "an agent": 1}, "stale_hours": 48}. The team lead lifts the
// team and agent limits for one item with a recorded reason
// (backlog team update <item> --team <team> --agent <lead> --wip-override "<reason>"). One a member is refining (stage refining, a refiner,
// no claimer) is work in progress too.
import { limitOf, limits, limitsFile, num, progressItems, wipRefusal as sharedRefusal } from '../shared/wip-limits.js';
import { heldBy, teamStep } from './team.js';

const holderOf = fm => fm.claimed_by || (fm.stage === 'refining' ? fm.refiner : '') || ''; // a finished refinement holds nothing

// null when the agent may start the item, else why not: the shared levels, then the team's and the agent's.
// extra: items a plan has already given out; self: the item being started where it is now (a move counts it once)
export function wipRefusal(folder, repo, fm, agent, slug, extra = [], self = { repository: repo, slug }) {
  const lifted = String(fm.wip_override ?? '').trim() !== ''; // the lead's recorded override
  const hint = `, or the team lead lifts the limit for this item: ${teamStep('<item>', '<lead>', '--wip-override "<reason>"')}`;
  return sharedRefusal(folder, repo, fm, slug, extra, self, [
    { level: 'team', key: fm.team, of: x => Boolean(fm.team) && x.fm.team === fm.team, skip: !fm.team || lifted, hint },
    // work held by an earlier session of the same card counts against the agent's limit (the continuation)
    { level: 'agent', key: agent, of: x => heldBy(holderOf(x.fm), agent), skip: lifted, hint },
  ]);
}
// The read view (backlog team query --wip): the counts against every limit and the stale in-progress items.
export function wipView(home, { now = Date.now() } = {}) {
  const cfg = limits(home);
  const items = progressItems(home);
  const staleMs = (num(cfg.stale_hours) ?? 48) * 3600 * 1000;
  const count = (f) => items.filter(f).length;
  const group = key => [...new Set(items.map(key).filter(Boolean))].sort();
  const rows = [
    { level: 'overall', key: 'all', count: items.length, limit: limitOf(cfg, 'overall') },
    ...group(x => x.repository).map(r => ({ level: 'repository', key: r, count: count(x => x.repository === r), limit: limitOf(cfg, 'repository', r) })),
    ...group(x => `${x.repository} ${x.fm.branch || ''}`).map(b => ({ level: 'branch', key: b, count: count(x => `${x.repository} ${x.fm.branch || ''}` === b), limit: limitOf(cfg, 'branch', b.replace(' ', ':')) })),
    ...group(x => x.fm.team).map(t => ({ level: 'team', key: t, count: count(x => x.fm.team === t), limit: limitOf(cfg, 'team', t) })),
    ...group(x => holderOf(x.fm)).map(a => ({ level: 'agent', key: a, count: count(x => holderOf(x.fm) === a), limit: limitOf(cfg, 'agent', a) })),
  ];
  const stale = items.filter(x => { const t = Date.parse(x.fm.updated || ''); return Number.isFinite(t) && now - t > staleMs; })
    .map(x => ({ item: `${x.repository}#${x.fm.seq}`, slug: x.slug, holder: holderOf(x.fm) || null, updated: x.fm.updated }));
  return { limits_file: limitsFile(home), stale_hours: staleMs / 3600000, counts: rows, stale };
}
