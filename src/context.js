import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { BacklogError } from './errors.js';
import { redact } from './shared/safety.js';
export function gitContext(flags, command, cwd = process.cwd()) {
  const git = args => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };
  const root = git(['rev-parse', '--show-toplevel']);
  if (!root) throw new BacklogError('NOT_A_REPOSITORY', 'Git does not detect a repo; smooth-backlog-cli cannot be used outside a git repo. Run from a Git working tree.', 1);
  const detected = git(['branch', '--show-current']);
  const branch = detected || (command === 'import' ? process.env.BACKLOG_CLI_BRANCH : flags.branch || process.env.BACKLOG_CLI_BRANCH);
  if (!branch && command !== 'init') throw new BacklogError('BRANCH_REQUIRED', 'Cannot determine a branch. Supply --branch <name> or set BACKLOG_CLI_BRANCH in your shell. For import, --branch names the source; set BACKLOG_CLI_BRANCH for the destination.', 1);
  if (detected && flags.branch && flags.branch !== detected && !['list', 'import'].includes(command)) {
    throw new BacklogError('BRANCH_SCOPE', `This command operates on checked-out branch ${detected}. Work on that branch instead of overriding it.`);
  }
  const origin = git(['remote', 'get-url', 'origin']);
  const name = origin ? redact(origin).replace(/\/+$/, '').split(/[/:]/).at(-1).replace(/\.git$/, '') : basename(root);
  const defaultRef = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (branch) process.env.BACKLOG_CLI_BRANCH = branch; process.env.BACKLOG_CLI_REPONAME = name;
  return { root, branch, detected, name, defaultBranch: defaultRef ? defaultRef.replace(/^origin\//, '') : null };
}
