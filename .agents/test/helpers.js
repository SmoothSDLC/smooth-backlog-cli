import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
export const bin = resolve('bin/backlog.js');
export function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'backlog-test-'));
  const root = join(dir, 'repo'); mkdirSync(root);
  const configHome = join(dir, 'config'); mkdirSync(join(configHome, 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(configHome, 'smooth-backlog-cli/config.json'), JSON.stringify({ schema_version: 1, weekly: false, auto: false }));
  const env = { ...process.env, XDG_CONFIG_HOME: configHome, APPDATA: configHome, BACKLOG_CLI_BRANCH: '', BACKLOG_CLI_REPONAME: '' };
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => { const p = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); return p.stdout.trim(); };
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'CLI Test'); git('commit', '--allow-empty', '-m', 'fixture root');
  function raw(args, options = {}) { return spawnSync(process.execPath, [bin, ...args], { cwd: root, env, encoding: 'utf8', ...options }); }
  function cli(...args) { const p = raw(['--json', ...args]); assert.equal(p.status, 0, p.stderr || p.stdout); const v = JSON.parse(p.stdout); assert.equal(v.ok, true); return v.data; }
  function fail(args, code = 2) { const p = raw(['--json', ...args]); assert.equal(p.status, code, p.stderr || p.stdout); const v = JSON.parse(p.stdout); assert.equal(v.ok, false); return v.error; }
  function create(name, ...args) { return cli('new', name, '--description', `Description ${name}`, '--ac', `Criteria ${name}`, ...args); }
  function asyncCli(args) { return new Promise((resolve, reject) => { const p = spawn(process.execPath, [bin, '--json', ...args], { cwd: root, env }); let out = '', err = ''; p.stdout.on('data', x => out += x); p.stderr.on('data', x => err += x); p.on('error', reject); p.on('close', code => code === 0 ? resolve(JSON.parse(out).data) : reject(new Error(err || out))); }); }
  const file = name => join(root, '.backlog', name);
  const json = name => JSON.parse(readFileSync(file(name), 'utf8'));
  return { dir, root, env, git, raw, cli, fail, create, asyncCli, file, json };
}
