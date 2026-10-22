// Shared test fixtures for the shared-backlog-repository mode (cli-parity job 1).
// Tests run against local bare repositories only: origins under <tmp>/origins,
// clones under <tmp>, with BACKLOG_HOME and XDG_CONFIG_HOME inside the test's
// temp dir - never the real backlog repository or ~/.config.
// Model: the Python skill's tests/conftest.py:1-60.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

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

// A local bare origin plus a working clone. The Python skill accepts only
// SmoothSDLC/smoothsdlc-backlog as owner/name (lib_db.py:69-111), which is why
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
// (<home>/<owner>/<name>/) live inside that clone (lib_db.py:24-26).
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

function scriptsDir() {
  return process.env.SMOOTH_BACKLOG_SCRIPTS
    || join(homedir(), 'git', 'smoothsdlc-backlog', 'skill', 'backlog', 'scripts');
}

let yamlOk;
function pyyamlAvailable() {
  if (yamlOk === undefined) {
    yamlOk = spawnSync('python3', ['-c', 'import yaml'], { stdio: 'ignore' }).status === 0;
  }
  return yamlOk;
}

// Runs python3 <SCRIPTS>/<script>; stdin is ignored. Returns
// { status, stdout, stderr }, or null when the script is absent or PyYAML is
// missing, so suites can skip with that reason.
export function py(script, args = [], opts = {}) {
  const scriptPath = join(scriptsDir(), script);
  if (!existsSync(scriptPath) || !pyyamlAvailable()) return null;
  const p = spawnSync('python3', [scriptPath, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.tmp ? env(opts.tmp) : {}), ...opts.env },
    stdin: 'ignore',
    encoding: 'utf8',
    timeout: opts.timeout ?? 300000,
  });
  return { status: p.status ?? -1, stdout: p.stdout ?? '', stderr: p.stderr ?? '' };
}

// Runs node bin/backlog.js (this repository's CLI) from a consumer checkout.
export function cli(args = [], opts = {}) {
  const bin = resolve(join(__dirname, '..', '..', 'bin', 'backlog.js'));
  const p = spawnSync(process.execPath, [bin, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.tmp ? env(opts.tmp) : {}), ...opts.env },
    stdin: 'ignore',
    encoding: 'utf8',
    timeout: opts.timeout ?? 60000,
  });
  return { status: p.status ?? -1, stdout: p.stdout ?? '', stderr: p.stderr ?? '' };
}
