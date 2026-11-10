// `backlog team update`: the item flags of `backlog update` plus the steps of a team (claims, reviews, stages, hand-offs, the lead's
// work-in-progress override). src/shared/update.js runs the edit; this module is the `team` object it asks at each place a team rule applies.
import { checkRefs } from '../shared/safety.js';
import * as store from '../shared/store.js';
import { run as runUpdate } from '../shared/update.js';
import { foreignItem, isForeign } from '../shared/dependencies.js';
import { isArchived, isFinished, isOpen } from '../shared/status.js';
import { inProgress } from '../shared/wip-limits.js';
import { asList, rstrip, strip } from '../shared/text.js';
import { caller, closeNow, headline, missingFields, reviewRefusal, runCloseGate, shutdown, step } from './lifecycle.js';
import { heldBy, teamLead, teamRefusal } from './team.js';
import { wipRefusal } from './wip.js';

export const TEAM_VALUE = ['wip-override', 'waiting', 'set-review-refs', 'request-review', 'review', 'comments', 'refinement-review', 'request-decision', 'decision', 'reassign', 'reassign-review',
  'handoff', 'handoff-commit', 'handoff-contract', 'handoff-verification', 'handoff-outputs', 'handoff-pickup', 'handoff-risks', 'accept-handoff', 'reject-handoff', 'checks'];
export const TEAM_BOOL = ['force', 'waiting-done', 'start-review', 'refine-start', 'refine-done', 'request-refinement-review'];

// A claim the publication checks again against the merged files, because its eligibility depends on other files: the dependencies are done,
// no work-in-progress limit is exceeded by a concurrent start elsewhere, and the agent holds no other active item (unless --force or a reclaim).
// verify answers the reason, or nothing.
const claimOf = (agent, claim) => ({ ...claim, agent, verify({ item, items, folder, name, find, slug }) {
  for (const d of asList(item.fm.depends_on)) {
    const target = isForeign(d) ? foreignItem(folder, d) : find(d);
    if (!target || !(isArchived(target) || isFinished(isForeign(d) ? target.status : target.fm.status))) return `${slug(item)} dependencies not done: ${d}`;
  }
  const wip = claim.reclaim ? null : wipRefusal(folder, name, item.fm, agent, slug(item));
  if (wip) return `${slug(item)}: ${wip}`;
  if (!claim.skipActiveLimit) {
    // items held by an earlier session of the same card count (the continuation keeps the one-active-item rule across the card's sessions)
    const held = items.filter(i => i !== item && i.path.startsWith('phases/') && isOpen(i.fm.status ?? 'pending')
      && heldBy(i.fm.claimed_by, agent) && !['requested', 'in_review'].includes(i.fm.review_state) && !i.fm.wait_on);
    if (held.length) return `${agent} holds ${held.length} active item(s): ${held.map(slug).join(', ')}; pull new work only when every item you hold waits; --force overrides`;
  }
  return undefined;
} });

export const hooks = {
  value: [...TEAM_VALUE, 'set-team'],
  bool: TEAM_BOOL,
  choices: { review: ['complete', 'reject'], 'refinement-review': ['complete', 'reject', 'limit'] },
  // the earlier words of a verdict are synonyms of the two words
  verdict: { flags: ['review', 'refinement-review'], words: { pass: 'complete', changes: 'reject' } },
  refuseOutside: teamRefusal,
  // a new session of the same card reclaims the in-progress item (the continuation, no new work to start); the active-item limit of
  // the other items of the card still applies, checked against heldBy when the claim is published
  claims: (a, fm, folder, row) => (a.claim ? [claimOf(a.claim, { folder, path: row.path, skipActiveLimit: Boolean(a.force) || fm.claimed_by === a.claim, reclaim: heldBy(fm.claimed_by, a.claim) && fm.status === 'in progress' })] : []),
  startRefusal: (a, { folder, repo, fm, slug }) => wipRefusal(folder, repo, { ...fm, team: a['set-team'] !== undefined ? strip(a['set-team']) : fm.team }, fm.claimed_by || a.by || caller(), slug),
  begin: (fm, body) => ({ incomplete: missingFields(fm, body), before: { team: fm.team, stage: fm.stage } }), // as the item is before this call
  // the refusal text, or nothing
  fieldsBefore(a, { fm, folder, repo, slug, changes }) {
    if (a['wip-override'] !== undefined) { // the lead lifts the team and agent limits for this item, with a recorded reason
      const who = a.by || caller();
      if (caller() && caller() !== who) return `${slug}: you are ${caller()} (SMOOTH_BACKLOG_CLI_AGENT): a member acts only as itself, not as ${who}`;
      if (who !== teamLead()) return `${slug}: only the team lead (${teamLead()}) lifts the team and agent work-in-progress limits for an item (got ${who || 'nobody'}; --by <lead>)`;
      const reason = strip(a['wip-override']);
      if (!reason) return `${slug}: --wip-override needs the reason`;
      Object.assign(fm, { wip_override: reason, wip_override_by: who, wip_override_at: store.now() });
      changes.wip_override = reason;
    }
    if (a['set-team'] !== undefined) {
      const name = strip(a['set-team']);
      if (!name && fm.stage) return `${slug}: an item in stage ${fm.stage} keeps a team (the stages are team work); set another team instead`; // beyond the earlier scripts
      if (name && name !== fm.team && inProgress(fm)) { // work in progress joins a team only within its limit
        const full = wipRefusal(folder, repo, { ...fm, team: name }, fm.claimed_by || fm.refiner || '', slug);
        if (full) return `${slug}: in progress, and in team ${name}: ${full}`;
      }
      fm.team = name; changes.team = name || 'none';
    }
    return undefined;
  },
  fieldsAfter(a, { fm, changes }) {
    if (a['set-review-refs'] === undefined) return;
    const refs = asList(a['set-review-refs']);
    checkRefs(refs); // before any assignment
    fm.review_refs = refs;
    changes.review_refs = refs.join(',');
  },
  step(a, ctx) {
    const todo = step(a, { ...ctx, before: ctx.begun.before, incomplete: ctx.begun.incomplete });
    if (todo.text) todo.headline = headline(todo.text);
    return todo;
  },
  after(a, { fm, body, event }) {
    if (fm.wait_on && event !== 'waiting' && (strip(a.note ?? '') || ['review_requested', 'reviewed', 'closed'].includes(event))) { // the holder's next step on the item ends its wait
      fm.wait_on = '';
      return `${rstrip(body)}\n\nWAIT DONE ${store.now()} (next step on the item)\n`;
    }
    return body;
  },
  // --status closed is a close: the review rules of the item's team must be met for the current work commit (as --close); the refusal names the
  // unmet rule. The owner's decision closes with --close --by owner --reason. The close gate runs on the pre-transition status: while a
  // dependent's edge is not accepted the completion is refused the same way as --close; with no dependents the gate records handoffs: none.
  closeStatus({ fm, statusBefore, folder, repo, slug }) {
    const refusal = reviewRefusal(fm);
    if (refusal) return { refuse: `${slug}: ${refusal}` };
    return runCloseGate({ fm, statusBefore, folder, repo, slug });
  },
  notice: (a, { event, fm, slug }) => (event === 'reviewed' && a.review === 'complete' ? (fm.status === 'review complete' ? closeNow(fm, slug) : `   ➡️  NEXT: the item is now ${fm.status}`) : ''),
  // the hand-off to review, a changes verdict and a close end the agent's session (the lead is no member): the agent it ends, or ''
  ender(a, { event, holder }) {
    const e = event === 'review_requested' ? a.by || caller() || holder : event === 'reviewed' && a.review === 'reject' ? a.by : event === 'closed' ? a.by || holder : '';
    return e && e !== teamLead() ? e : '';
  },
  shutdown,
};

export const run = argv => runUpdate(argv, { team: hooks });
