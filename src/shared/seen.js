// Stale-view guard (backlog-cli item 025). Every item write stamps `updated_by` next to `updated`. A command that shows an item to an agent, and
// every write after it succeeds, records what that agent saw (updated, updated_by, the backlog commit) in <clone>/.git/smooth-backlog-cli-views/<agent>.json;
// a write to an item the agent has seen first compares the file with that record and refuses (exit 5) when someone else changed it since.
// An item the agent never saw is written without a check (its first write). Items without updated_by (older files) read as written by nobody.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BacklogError } from '../errors.js';
import { parse } from './frontmatter.js';

export const STALE_EXIT = 5;
let current; // the --by/--agent of the running command
export const setActor = name => { if (name) current = String(name); };
export const actor = () => current || process.env.QWEN_CODE_AGENT_ID || process.env.USER || 'unknown';
const viewsFile = (home, agent) => join(home, '.git', 'smooth-backlog-cli-views', `${agent.replace(/[^\w.-]/g, '_')}.json`);
const homeOf = folder => dirname(dirname(folder)); // <home>/<owner>/<name>

function read(home, agent) { try { return JSON.parse(readFileSync(viewsFile(home, agent), 'utf8')); } catch { return {}; } }

// views: [{slug, path}] (path from the repository folder) of repo, as the agent now sees them. Never fails the command: the cache is a safety net.
// The file's hash is part of the view: `updated` has a resolution of one second, so two changes in one second differ only in content.
const fileView = (folder, path) => { const text = readFileSync(join(folder, path), 'utf8'); return { fm: parse(text).fm, sha: createHash('sha256').update(text).digest('hex') }; };

export function record(folder, repo, agent, views) {
  const home = homeOf(folder);
  try {
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: home, encoding: 'utf8' }).stdout.trim();
    const all = read(home, agent);
    for (const v of views) { // a view may name another repository folder (a cross-repository move leaves the item there)
      const { fm, sha } = fileView(v.folder ?? folder, v.path);
      all[`${v.repo ?? repo}/${v.slug}`] = { updated: fm.updated ?? null, updated_by: fm.updated_by ?? null, sha, commit, path: v.path, folder: v.folder ?? folder };
    }
    for (const e of Object.values(all)) { // what this agent itself rewrote on the side (a reflow re-ranks other items) is not news to it
      try { const now = fileView(e.folder, e.path); if (now.fm.updated_by === agent && now.sha !== e.sha) Object.assign(e, { updated: now.fm.updated ?? null, sha: now.sha, commit }); } catch { /* moved or removed */ }
    }
    const file = viewsFile(home, agent);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 1), { mode: 0o600 });
    renameSync(tmp, file);
  } catch { /* unwritable .git or an unreadable item: the next write is simply unchecked */ }
}

// A command showed the item (a mirror row) to `agent`.
export const view = (agent, folder, repo, row) => record(folder, repo, agent || actor(), [{ slug: row.slug, path: row.path }]);

export function staleError(slug, by, at, was) {
  return new BacklogError('STALE_ITEM', `item ${slug} was changed by ${by || 'someone'} at ${at ?? 'an unknown time (it was moved or removed)'} after you last read it (${was}); read it again (backlog query --phase ${slug}) and retry`, STALE_EXIT);
}

// path: the item file as it is now (after the leading pull).
export function check(folder, repo, agent, slug, path) {
  const seen = read(homeOf(folder), agent)[`${repo}/${slug}`];
  if (!seen) return;
  const { fm, sha } = fileView(folder, path);
  if (seen.sha !== sha) throw staleError(slug, fm.updated_by, fm.updated, `${seen.updated}${seen.updated_by ? ` by ${seen.updated_by}` : ''}`);
}
