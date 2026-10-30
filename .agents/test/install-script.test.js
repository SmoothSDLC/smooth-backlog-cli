// Item 044: the skill's install script installs the CLI when it is missing, updates it when the registry has a newer
// release (a pre-release before its release), leaves an up-to-date or newer one alone, says when the registry cannot be
// reached, refuses a different backlog command earlier on PATH, and then runs `backlog setup` with its own arguments.
// A stub npm (its global install is a state file) and a stub backlog record their calls in a fixture repository.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../templates/skills/backlog/scripts/install-backlog-cli.sh', import.meta.url));
const PKG = '@smoothsdlc/smooth-backlog-cli';
const REG = '--registry=https://npm.pkg.github.com';
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// installed: the package's installed version or null; latest: the registry's version, or null when it cannot be reached
function run({ installed, latest, args = [], foreign = null }) {
  const t = mkdtempSync(join(tmpdir(), 'install-cli-')); dirs.push(t);
  const bin = join(t, 'npm-global', 'bin'); mkdirSync(bin, { recursive: true });
  const state = join(t, 'installed'); const log = join(t, 'calls.log');
  const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); chmodSync(path, 0o755); };
  // the CLI: --version prints the installed version; setup records each argument on its own line
  put(join(bin, 'backlog'), `#!/bin/sh\n[ "$1" = --version ] && { cat '${state}'; exit 0; }\necho "backlog" >> '${log}'; for a in "$@"; do echo "  [$a]" >> '${log}'; done\n`);
  if (installed) writeFileSync(state, installed);
  put(join(t, 'tools', 'npm'), `#!/bin/sh
case "$1" in
  ls) if [ -f '${state}' ]; then printf '{"dependencies":{"${PKG}":{"version":"%s"}}}' "$(cat '${state}')"; else echo '{}'; fi ;;
  view) ${latest ? `echo 'npm warn config: a warning on stderr' >&2; echo ${latest}` : "echo 'npm error 401 Unauthorized' >&2; exit 1"} ;;
  prefix) echo '${join(t, 'npm-global')}' ;;
  install) echo "npm $*" >> '${log}'; v=\${3#${PKG}@}; [ "$v" = "$3" ] && v=${latest || '0.0.1'}; printf %s "$v" > '${state}' ;;
esac\n`);
  if (foreign) put(join(t, 'foreign', 'backlog'), `#!/bin/sh\necho ${foreign}\n`);
  const node = dirname(process.execPath);
  const path = [foreign ? join(t, 'foreign') : null, join(t, 'tools'), bin, node, '/usr/bin', '/bin'].filter(Boolean).join(':');
  const repo = join(t, 'repo'); mkdirSync(repo); spawnSync('git', ['init', '-q'], { cwd: repo });
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', env: { PATH: path, HOME: t } });
  return { r, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] };
}
const install = v => `npm install --global ${PKG}@${v} ${REG}`;

test('044: missing -> installed, then backlog setup gets each argument as given', () => {
  const { r, calls } = run({ installed: null, latest: '1.2.0', args: ['--ask', 'a path with spaces', ''] });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(calls, [install('1.2.0'), 'backlog', '  [setup]', '  [--ask]', '  [a path with spaces]', '  []']);
});

test('044: an older release or a pre-release of the latest is updated; an up-to-date or newer one is left alone', () => {
  assert.deepEqual(run({ installed: '1.1.9', latest: '1.2.0' }).calls, [install('1.2.0'), 'backlog', '  [setup]']);
  assert.deepEqual(run({ installed: '1.2.0-beta', latest: '1.2.0' }).calls, [install('1.2.0'), 'backlog', '  [setup]']);
  assert.deepEqual(run({ installed: '1.2.0', latest: '1.2.0', args: ['--ask'] }).calls, ['backlog', '  [setup]', '  [--ask]']);
  assert.deepEqual(run({ installed: '1.10.0', latest: '1.9.0' }).calls, ['backlog', '  [setup]']); // a version order, not text
  assert.deepEqual(run({ installed: '1.2.0-beta.2', latest: '1.2.0-beta.10' }).calls, [install('1.2.0-beta.10'), 'backlog', '  [setup]']); // SemVer pre-releases
  assert.deepEqual(run({ installed: '1.2.0+build.5', latest: '1.2.1' }).calls, [install('1.2.1'), 'backlog', '  [setup]']); // build metadata ignored
});

test('044: an unreachable registry is said; a different backlog command earlier on PATH is refused', () => {
  const kept = run({ installed: '1.2.0', latest: null });
  assert.equal(kept.r.status, 0, kept.r.stderr);
  assert.match(kept.r.stderr, /could not check .* for a newer release, keeping 1\.2\.0: npm error 401 Unauthorized/);
  const none = run({ installed: null, latest: null });
  assert.equal(none.r.status, 1);
  assert.match(none.r.stderr, /cannot reach .* \(authenticate with npm login/);
  const other = run({ installed: '1.2.0', latest: '1.2.0', foreign: '7.0.0' });
  assert.equal(other.r.status, 1);
  assert.match(other.r.stderr, /the backlog command on PATH \(.*foreign\/backlog, version 7\.0\.0\) is not @smoothsdlc\/smooth-backlog-cli 1\.2\.0/);
  assert.deepEqual(other.calls, []); // setup never ran
  const twin = run({ installed: '1.2.0', latest: '1.2.0', foreign: '1.2.0' }); // the same version is not the same command
  assert.equal(twin.r.status, 1);
  assert.match(twin.r.stderr, /foreign\/backlog, version 1\.2\.0\) is not @smoothsdlc\/smooth-backlog-cli 1\.2\.0/);
});
