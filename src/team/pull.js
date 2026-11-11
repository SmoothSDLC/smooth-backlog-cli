// Every team command that writes pulls the backlog through this one function (the folder is the one the command acts on), so that the pull can be narrowed to it in one place.
import { isAbsolute, relative } from 'node:path';
import { realpathSync } from 'node:fs';
import * as sync from '../shared/sync.js';
import { teamsFile } from './teams-load.js';

export const pullFolder = (home, folder) => sync.pull(home);

// The repository-relative paths a team command read: its folder and, when it lies inside the clone, the team file (a change of either upstream means the step runs again).
export async function watched(home, repo, top, workRepo) {
  const t = await sync.target(home);
  const watch = [`${t.prefix}${repo}`];
  try {
    const rel = relative(realpathSync(t.root), realpathSync(teamsFile({ top, home, repo, workRepo }).path));
    if (!rel.startsWith('..') && !isAbsolute(rel)) watch.push(rel);
  } catch { /* the team file is not in the clone: nothing to watch */ }
  return watch;
}
