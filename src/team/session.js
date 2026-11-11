// The session of a team command, as the rules read $session: { id, repository, branch, commit }. repository is the actionable repository (the input, else the
// working copy's); branch is the input, else the working copy's current branch (a detached HEAD with none given stops the command); commit is the working
// copy's HEAD, empty when it has none yet. inputs: what resolveInputs returned.
import { BacklogError } from '../errors.js';
import { git } from '../shared/store.js';

export function sessionOf({ inputs, repo, cwd = process.cwd() }) {
  const branch = inputs.branch || git(['branch', '--show-current'], cwd).stdout.trim();
  if (!branch) throw new BacklogError('INVALID_INPUT', 'HEAD is detached: check out a branch, or give --branch <name> (SMOOTH_BACKLOG_CLI_TEAM_BRANCH)');
  const head = git(['rev-parse', 'HEAD'], cwd);
  return { id: inputs.session, repository: repo, branch, commit: head.code ? '' : head.stdout.trim() };
}
