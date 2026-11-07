// The three steps a person or a single agent takes on an item without a team: claim it, release it, close it with a summary.
// No review, stage or hand-off rule applies; a team's item takes these steps through `backlog team update`.
import { undoneDependencies } from './dependencies.js';
import { actor } from './seen.js';
import { isFinished, stageOfStatus } from './status.js';
import { now } from './store.js';
import { strip } from './text.js';
import { wipRefusal } from './wip-limits.js';

export const TEAM_ITEM = "use backlog team update: a team item's status moves by its team steps";
const STEPS = ['claim', 'release', 'close'];

const dependencyRefusal = (folder, fm) => {
  const undone = undoneDependencies(folder, fm);
  return undone.length ? `dependencies not done: ${undone.map(d => d.item?.slug ?? d.id).join('; ')}` : null;
};

// A claim the publication checks again against the merged files: the dependencies are done and no limit is exceeded by a concurrent start.
export const claimOf = (agent, claim) => ({ ...claim, agent, verify({ item, folder, name, find, slug }) {
  const why = dependencyRefusal(folder, item.fm) ?? (claim.reclaim ? null : wipRefusal(folder, name, item.fm, slug(item)));
  return why ? `${slug(item)}: ${why}` : undefined;
} });

const done = (event, text) => ({ event, text, headline: text.replace(/^[# ]+/, '').split('\n')[0] }); // the headline is what the update line shows

// Returns {refuse} (the text after the "❌ "), or {event, text} (event 'state_change' and no text when no step was asked).
export function plainStep(a, { fm, slug, folder, repo }) {
  const steps = STEPS.filter(k => a[k] !== undefined);
  if (!steps.length) return { event: 'state_change' };
  if (steps.length > 1) return { refuse: `one step at a time (got ${steps.map(k => `--${k}`).join(', ')})` };
  if (fm.team) return { refuse: TEAM_ITEM };
  const who = fm.claimed_by || ''; const t = now();
  const no = why => ({ refuse: `${slug}: ${why}` });
  if (steps[0] === 'claim') {
    if (isFinished(fm.status)) return no(`status is ${fm.status}; a finished item cannot be claimed`);
    if (who && who !== a.claim) return no(`claimed by ${who} since ${fm.claimed_at}; message ${who} or pick another item`);
    const undone = dependencyRefusal(folder, fm);
    if (undone) return no(undone);
    const wip = who === a.claim && fm.status === 'in progress' ? null : wipRefusal(folder, repo, fm, slug);
    if (wip) return no(wip);
    Object.assign(fm, { status: 'in progress', claimed_by: a.claim, claimed_at: t });
    return done('claimed', `Claimed by ${a.claim} at ${t}`);
  }
  if (steps[0] === 'release') {
    if (isFinished(fm.status)) return no(`status is ${fm.status}; a finished item cannot be released into the queue`);
    if (who !== a.release) return no(`claimed by ${who || 'nobody'}, not by ${a.release}`);
    const inReview = Boolean(stageOfStatus(fm.status)) || fm.status === 'review complete'; // an item in a review keeps its word when its holder lets go
    Object.assign(fm, { status: inReview ? fm.status : 'pending', claimed_by: '', claimed_at: '', ...(fm.wait_on ? { wait_on: '' } : {}) }); // a wait belongs to the holder
    return done('released', `Released by ${a.release} at ${t}`);
  }
  if (!strip(a.summary || '')) return no('--close needs --summary "<what was delivered>"');
  const owner = a.by === 'owner'; // the owner closes on a written decision
  if (owner && !strip(a.reason || '')) return no(`--close --by owner needs --reason "<the owner's decision>"`);
  const closer = a.by || who || actor();
  if (!closer) return no('nobody claimed this item: pass --by <agent>');
  if (who && closer !== who && !owner) return no(`only the claimer (${who}) closes it; not ${closer}`);
  fm.status = 'closed';
  return done('closed', `## Closed by ${closer} at ${t}${owner ? ` (owner decision: ${strip(a.reason)})` : ''}\n\n${a.summary}`);
}
