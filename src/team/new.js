// `backlog team new` (wired by a later round): the options and rules of a team's items on top of `backlog new`. src/shared/new.js creates the
// item; this module is the `team` object it asks where a team rule applies: --team, --review-refs, a split of a team's item, and what a
// named team session must give at creation.
import { run as runNew, hasDefinitionOfDone } from '../shared/new.js';
import { checkRefs } from '../shared/safety.js';
import { asList, strip } from '../shared/text.js';
import { resolveHome } from '../shared/store.js';
import { setTeamsHome, teamName, teamRefusal } from './team.js';

const MODE = "--body must hold a definition of done: a '## Definition of done' heading (or a 'Definition of done:' line) with checkable lines; in team mode no placeholder is written";

export const hooks = {
  options: { 'review-refs': 's', team: 's' },
  begin(a, scope) {
    if (a.status !== undefined && (a.team || (a.splitFrom && teamName()))) return { refuse: '--status cannot be combined with --team: a team item starts in its own first status' };
    const refs = asList(a.reviewRefs);
    checkRefs(refs); // before the folder is read
    // an item of a team (--team, or a split of a team's item) starts in stage refining, where a member writes it
    const intoRefining = a.team || (a.splitFrom && teamName()); // outside a team session a split is a plain item
    if (!hasDefinitionOfDone(a.body) && (scope.repo || refs.length) && !intoRefining) return { refuse: MODE };
    return { refs, intoRefining };
  },
  outside(src) { const why = teamRefusal(src); return why; },
  inherit(a, doc) { a.team = a.team || doc.fm.team || undefined; },
  // in a named team session (TEAM_NAME, set by the team runner) the creator names how the item is reviewed, unless the item starts in stage refining
  // (it has a team, its own or its source's), where the members' refinement gives it its review documents. TEAM_REPOSITORY alone (a write into another
  // repository's folder) is no team session here.
  afterSplit(a, t, scope) {
    if (t.intoRefining && !a.team && !hasDefinitionOfDone(a.body) && scope.repo) return MODE; // the source had no team: no stage refining
    if (teamName() && !t.refs.length && !a.team) return 'in a team session an item names its review documents at creation: --review-refs <review document> (an item of a team, which starts in stage refining, gets them in its refinement)';
    return undefined;
  },
  refining: (a, t) => Boolean(a.team || t.intoRefining),
  mark(fm, a, t) {
    if (a.team) Object.assign(fm, { team: strip(a.team), refiner: '' });
    else if (t.intoRefining) Object.assign(fm, { refiner: '' }); // a slice split in a team session needs its refinement review too
  },
  reviewRefs(fm, t) { if (t.refs.length) fm.review_refs = t.refs; },
};

// The function a later round wires to `backlog team new`; the tests drive it through a script of their own.
export const run = argv => { setTeamsHome(resolveHome().home); return runNew(argv, { team: hooks }); }; // the team configuration is read from the backlog's folder
