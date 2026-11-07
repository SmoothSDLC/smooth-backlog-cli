// `backlog team new`: the options and rules of a team's items on top of `backlog new` (every option of the plain command, plus --review-refs).
// src/shared/new.js creates the item; this module is the `team` object it asks where a team rule applies. Every item made here belongs to the
// command's team (src/team/cli.js passes --team) and starts in stage refining, where a member writes it; a split of a team's item is made here too.
import { run as runNew } from '../shared/new.js';
import { checkRefs } from '../shared/safety.js';
import { asList, strip } from '../shared/text.js';
import { teamRefusal } from './team.js';

export const hooks = {
  options: { 'review-refs': 's', team: 's' },
  begin(a) {
    if (a.status !== undefined) return { refuse: '--status cannot be combined with --team: a team item starts in its own first status' };
    const refs = asList(a.reviewRefs);
    checkRefs(refs); // before the folder is read
    return { refs };
  },
  outside: teamRefusal, // the split logs an event on the parent: refused when it lies outside the session's repository and branch
  mark: (fm, a) => Object.assign(fm, { team: strip(a.team), refiner: '' }),
  reviewRefs(fm, t) { if (t.refs.length) fm.review_refs = t.refs; },
};

export const run = argv => runNew(argv, { team: hooks });
