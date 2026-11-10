// Where the team file is (chapter 01 section 1.1): a pure resolution from the repository's configuration. Only the configuration
// defines the location; a backlog folder found another way (a variable, the per-user record) does not count. Nothing calls this yet.
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { readConfig } from '../shared/setup.js';

// a path below a root, compared by segments: a folder named "..backlog" is inside
const below = (root, p) => { const r = relative(root, p); return r === '' || !(r === '..' || r.startsWith(`..${sep}`) || isAbsolute(r)); };

// top: the working copy's repository; home: the backlog folder the CLI resolved; repo: owner/name of the actionable repository;
// workRepo: owner/name of the working copy; cfg: the configuration (read from top only when not given). shaIn says where the SHA
// of the team file is kept: the working copy's configuration, or the per-user record for a repository input naming another repository.
export function teamsFile({ top, home, repo, workRepo = repo, cfg }) {
  if (cfg === undefined) cfg = readConfig(top);
  const folder = join(home, ...repo.split('/'), 'teams.json');
  if (repo !== workRepo) return { path: folder, how: 'the repository input', shaIn: 'record' };
  const shaIn = 'config';
  if (typeof cfg.teams_file === 'string' && cfg.teams_file.trim()) return { path: resolve(top, cfg.teams_file.trim()), how: 'the teams_file key', shaIn };
  const named = typeof cfg.backlog_repository === 'string' ? cfg.backlog_repository.trim() : '';
  if (named && !below(top, resolve(top, named))) return { path: folder, how: 'the backlog repository folder', shaIn };
  return { path: join(top, '.backlog', 'teams.json'), how: 'the default .backlog/teams.json', shaIn };
}

export const missingText = path => `no team file at ${path}; name one with the "teams_file" key of .backlog/config.json, or put it at <backlog repository>/<owner>/<name>/teams.json when the "backlog_repository" key names a folder outside the repository, else at .backlog/teams.json`;
