import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
export const bin = resolve('bin/backlog.js');
// A repository with a bare origin (every backlog change is pushed) and a private config folder; raw runs the CLI in it.
export function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'backlog-test-'));
  const root = join(dir, 'repo'); mkdirSync(root);
  const configHome = join(dir, 'config'); mkdirSync(configHome, { recursive: true });
  const env = { ...process.env, XDG_CONFIG_HOME: configHome, APPDATA: configHome, SMOOTH_BACKLOG_CLI_ORIGIN_URL: '', SMOOTH_BACKLOG_CLI_HOME: '' };
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => { const p = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); return p.stdout.trim(); };
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'CLI Test'); git('commit', '--allow-empty', '-m', 'fixture root');
  spawnSync('git', ['init', '-q', '--bare', join(dir, 'origin.git')]); git('remote', 'add', 'origin', join(dir, 'origin.git')); git('push', '-q', '-u', 'origin', 'main');
  function raw(args, options = {}) { return spawnSync(process.execPath, [bin, ...args], { cwd: root, env, encoding: 'utf8', ...options }); }
  return { dir, root, env, git, raw };
}
