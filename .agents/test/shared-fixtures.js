// Shared test fixtures for the shared-backlog-repository mode (cli-parity job 1).
// Tests run against local bare repositories only: origins under <tmp>/origins,
// clones under <tmp>, with BACKLOG_HOME and XDG_CONFIG_HOME inside the test's
// temp dir - never the real backlog repository or ~/.config.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BACKLOG_OWNER = 'SmoothSDLC';
export const BACKLOG_NAME = 'smoothsdlc-backlog';
export const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_TERMINAL_PROMPT: '0',
};

function git(cwd, ...args) {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${(p.stderr || '').trim()}`);
  return p.stdout.trim();
}

// A local bare origin plus a working clone. The backlog repository is always
// SmoothSDLC/smoothsdlc-backlog as owner/name, which is why
// the shared backlog origin keeps exactly that folder layout.
function originBare(tmp, owner, name, branch) {
  const bare = join(tmp, 'origins', owner, `${name}.git`);
  if (existsSync(bare)) return bare;
  mkdirSync(join(tmp, 'origins', owner), { recursive: true });
  git(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  const seed = join(tmp, 'seed', owner, name);
  mkdirSync(join(tmp, 'seed', owner), { recursive: true });
  git(tmp, 'init', '-q', '-b', 'main', seed);
  git(seed, 'commit', '-q', '--allow-empty', '-m', 'init');
  if (branch && branch !== 'main') {
    git(seed, 'branch', branch);
    git(seed, 'push', '-q', bare, 'main', branch);
  } else {
    git(seed, 'push', '-q', bare, 'main');
  }
  rmSync(join(tmp, 'seed'), { recursive: true, force: true });
  return bare;
}

// The shared backlog repository: bare <tmp>/origins/SmoothSDLC/smoothsdlc-backlog.git
// with one commit on main, cloned to <tmp>/home. The per-repository folders
// (<home>/<owner>/<name>/) live inside that clone.
export function sharedBacklog(tmp) {
  const bare = originBare(tmp, BACKLOG_OWNER, BACKLOG_NAME, 'main');
  const dest = join(tmp, 'home');
  if (!existsSync(dest)) {
    git(tmp, 'clone', '-q', bare, dest);
  }
  return dest;
}

// A consuming repository: bare <tmp>/origins/<owner>/<name>.git plus a clone
// checked out on `branch`, at <tmp>/consumer/<name>.
export function consumer(tmp, owner, name, branch = 'main') {
  const bare = originBare(tmp, owner, name, branch);
  const dest = join(tmp, 'consumer', name);
  if (!existsSync(dest)) {
    mkdirSync(join(tmp, 'consumer'), { recursive: true });
    if (branch === 'main' || !branch) git(tmp, 'clone', '-q', bare, dest);
    else git(tmp, 'clone', '-q', '-b', branch, bare, dest);
  }
  return dest;
}

// The environment every child process must run under: BACKLOG_HOME points at the
// fixture's local clone, XDG_CONFIG_HOME at a temp config dir, git identity set,
// no terminal prompts. Throws when the resulting BACKLOG_HOME is outside tmp.
export function env(tmp) {
  const raw = String(tmp ?? '');
  const t = resolve(raw);
  const home = join(t, 'home');
  if (!raw || !isAbsolute(raw) || !home.startsWith(t + sep)) {
    throw new Error(`BACKLOG_HOME ${home} is outside tmp ${raw || '<empty>'}`);
  }
  return { ...GIT_IDENTITY, BACKLOG_HOME: home, XDG_CONFIG_HOME: join(t, 'config') };
}

// item 76 review: the pids the fixture spawned, by the scenario tmp dir whose BACKLOG_HOME they carry, with the
// ChildProcess retained where the child may still be alive (the async spawn). Where /proc is absent (macOS) the
// scenario cleanup of shared-sync-db.test.js settles them by process group: the children are spawned detached
// (their own group), so the group covers the whole chain of the child's git processes.
const groupAlive = pid => { try { process.kill(-pid, 0); return true; } catch { return false; } };
const spawned = new Map();
export function recordSpawned(tmp, pid, child = undefined) {
  if (!tmp) return;
  const groups = spawned.get(tmp) ?? new Map();
  spawned.set(tmp, groups);
  // item 76 review r5: a group is signalled only while the fixture owns a recorded process of it. A group still
  // alive when the recorded leader died holds the leader's chain (ours); a group dead at the leader's death is a
  // number the fixture owns no live process of - it may have been re-issued to an unrelated same-user group.
  const entry = { child, groupAliveAtLeaderDeath: groupAlive(pid) };
  groups.set(pid, entry);
  if (child) child.on('exit', () => { entry.groupAliveAtLeaderDeath = groupAlive(pid); });
}
export const spawnedPids = tmp => new Set((spawned.get(tmp) ?? new Map()).keys());
// [pid, child, groupAliveAtLeaderDeath] records: child is the retained ChildProcess, undefined for the synchronous
// spawn whose child is reaped when the call returns. The scenario cleanup settles a group only while it can prove
// ownership of the number (item 76 review: a reused group number is an unrelated same-user group).
export const spawnedGroups = tmp => [...(spawned.get(tmp) ?? new Map()).entries()].map(([pid, e]) => [pid, e.child, e.groupAliveAtLeaderDeath]);

let calls = 0;
// Runs node bin/backlog.js (this repository's CLI) from a consumer checkout.
export function cli(args = [], opts = {}) {
  const bin = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js'));
  const p = spawnSync(process.execPath, [bin, ...args], {
    cwd: opts.cwd,
    // a command without a named agent is a different writer each time (QWEN_CODE_AGENT_ID, else USER, would make every call one agent with one stale view)
    env: { ...process.env, QWEN_CODE_AGENT_ID: `driver-${++calls}`, ...(opts.tmp ? env(opts.tmp) : {}), ...opts.env },
    stdin: 'ignore',
    encoding: 'utf8',
    timeout: opts.timeout ?? 60000,
    detached: true, // item 76 review: own process group, so the scenario cleanup can settle the child's git chain without /proc
  });
  recordSpawned(opts.tmp, p.pid);
  return { status: p.status ?? -1, stdout: p.stdout ?? '', stderr: p.stderr ?? '' };
}

// The slug a `new` output names: accepts both "created phase phases/<slug>.md" and "created phase <slug>"
// (057 removes the path from the line; when that lands, this regex is the one place that changes).
export const createdSlug = stdout => {
  const m = String(stdout).match(/created phase (?:phases\/)?([0-9A-Za-z][0-9A-Za-z._-]*?)(?:\.md)?\s+\(/);
  return m ? m[1] : undefined;
};

