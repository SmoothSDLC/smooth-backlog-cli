// The close gate of an item closes only while every dependent's edge
// is accepted; without dependents the CLI records NONE itself. the module only - the integration slice
// calls it from closeItem and the --status done path; the edge rules it builds on live in./handoff.js.
import { dependentsOf, openEdges } from './handoff.js';

// What an open edge needs: a missing or a rejected edge needs a (new) hand-off record from the producer;
// an unaccepted or a stale edge needs the team lead's acceptance of the record that is there.
const needs = e => (e.state === 'unaccepted' || e.state === 'stale' ? "the team lead's acceptance of the hand-off record" : 'a (new) hand-off record from the producer');

// The close gate's decision for the producer (fm: its front matter, the stored form; folder: its folder
// <home>/<owner>/<name>; repo: its repoId <owner>/<name>; slug: how the CLI names the item). {refuse:...} while a
// dependent's edge is not accepted - every open dependent, its edge state and what it needs; {fm: {handoffs:
// 'none'}, text:...} when the item has no dependents (the CLI records NONE); {} when every edge is accepted -
// nothing to add.
export function closeGate({ fm, folder, repo, slug }) {
  const open = openEdges(folder, repo, fm);
  if (open.length)
    return { refuse: `close refused for ${slug}: ` + open.map(e => `${e.dependent} edge ${e.state}; needs ${needs(e)}`).join(' | ') };
  if (!dependentsOf(folder, repo, fm).length)
    return { fm: { handoffs: 'none' }, text: 'DEPENDENCY_HANDOFF: NONE (no dependent items; checked by the CLI at close)' };
  return {};
}
