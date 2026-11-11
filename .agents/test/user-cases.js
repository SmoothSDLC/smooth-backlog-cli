// Builds a backlog folder from the items of a rule case and runs the real CLI over it.
//   userCase(dirs, items) -> { run(args, env?) -> { status, stdout, stderr }, folder, slugOf(seq) }
// items: [{ seq, team?, repo?, fields? }]; an item is written as stored by hand (no command runs, so no rule is checked) in repository
// acme/<repo> (default app; the consumer checkout is acme/app), branch main, named "item <seq>", with `team` set when given and `fields` merged over the rest; the folder is committed and pushed.
// dirs: the list of temporary folders the caller removes when its tests end. run() runs from the consumer checkout.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GIT_IDENTITY, cli, consumer, itemPath, sharedBacklog, writeStored } from './shared-fixtures.js';

export const slugOf = seq => `${String(seq).padStart(3, '0')}-item-${seq}`;

export function userCase(dirs, items = []) {
  const t = mkdtempSync(join(tmpdir(), 'user-case-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cwd = consumer(t, 'acme', 'app', 'main');
  const folder = join(home, 'acme', 'app');
  for (const { seq, team, repo = 'app', fields = {} } of items) {
    writeStored(itemPath(join(home, 'acme', repo), slugOf(seq)), { seq, name: `item ${seq}`, repository: `acme/${repo}`, branch: 'main', status: 'pending', ...(team ? { team } : {}), ...fields }, '');
  }
  const git = (...args) => execFileSync('git', args, { cwd: home, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', 'items'); git('push', '-q');
  return { folder, slugOf, run: (args, env) => cli(args, { cwd, tmp: t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'tester', ...env } }) };
}
