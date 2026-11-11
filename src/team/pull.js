// Every team command that writes pulls the backlog through this one function (the folder is the one the command acts on), so that the pull can be narrowed to it in one place.
import * as sync from '../shared/sync.js';

export const pullFolder = (home, folder) => sync.pull(home);
