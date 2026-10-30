// Item 044: the skill's install script installs the CLI when it is missing, updates it when the registry has a newer
// release, leaves an up-to-date one alone, and then runs `backlog setup` with its own arguments. A stub npm and a stub
// backlog on PATH record their calls; the fixture repository is a plain git repository.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../templates/skills/backlog/scripts/install-backlog-cli.sh', import.meta.url));
const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

// installed: null (no backlog command) or its version; latest: the registry's version
function run(installed, latest, args) {
  const t = mkdtempSync(join(tmpdir(), 'install-cli-')); dirs.push(t);
  const bin = join(t, 'bin'); mkdirSync(bin);
  const log = join(t, 'calls.log');
  const backlog = v => `#!/bin/sh\n[ "$1" = --version ] && { echo ${v}; exit 0; }\necho "backlog $*" >> '${log}'\n`;
  const put = (name, text) => { writeFileSync(join(bin, name), text); chmodSync(join(bin, name), 0o755); };
  if (installed) put('backlog', backlog(installed));
  // npm view prints the registry's version; npm install puts a backlog of that version on PATH
  put('npm', `#!/bin/sh\necho "npm $*" >> '${log}'\nif [ "$1" = view ]; then echo ${latest}; exit 0; fi\nprintf '%s' '${backlog(latest).replace(/'/g, "'\\''")}' > '${join(bin, 'backlog')}'; chmod +x '${join(bin, 'backlog')}'\n`);
  const repo = join(t, 'repo'); mkdirSync(repo); spawnSync('git', ['init', '-q'], { cwd: repo });
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin`, HOME: t } });
  let calls = []; try { calls = readFileSync(log, 'utf8').trim().split('\n'); } catch { /* none */ }
  return { r, calls: calls.filter(c => !c.startsWith('npm view')) };
}

test('044: missing -> installed, then backlog setup gets the script\'s arguments', () => {
  const { r, calls } = run(null, '1.2.0', ['--ask']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(calls, ['npm install --global @smoothsdlc/smooth-backlog-cli@1.2.0 --registry=https://npm.pkg.github.com', 'backlog setup --ask']);
});

test('044: an older CLI is updated, an up-to-date or newer one is left alone; setup always runs', () => {
  assert.deepEqual(run('1.1.9', '1.2.0', []).calls, ['npm install --global @smoothsdlc/smooth-backlog-cli@1.2.0 --registry=https://npm.pkg.github.com', 'backlog setup']);
  assert.deepEqual(run('1.2.0', '1.2.0', ['--ask']).calls, ['backlog setup --ask']);
  assert.deepEqual(run('1.10.0', '1.9.0', []).calls, ['backlog setup']); // a version sort, not a text sort
});
