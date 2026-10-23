// Helpers for the run-lock and renumbering regressions (cli-parity review fixes of jobs 10, 11 and 17).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, GIT_IDENTITY } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import * as store from '../../src/shared/store.js';

const BIN = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js'));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const gitIn = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};

// The CLI as a child that does not block this process: { child, done } where done resolves to { status, stdout, stderr }.
export function cliAsync(args, { cwd, tmp }) {
  const child = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, ...env(tmp) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; let exited = false;
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });
  const done = new Promise(res => child.on('close', status => { exited = true; res({ status, stdout, stderr }); }));
  return { done, exited: () => exited };
}

// Holds the run lock of acme/demo (the one every changing command takes), starts the command and checks that it waits:
// after `ms` it has neither finished nor changed `watch()`; once the lock is released it runs to the end.
export async function waitsForRunLock(f, args, watch, ms = 2500) {
  let during; let before; let child;
  await store.runLocked(f.home, 'acme/demo', async () => {
    before = watch();
    child = cliAsync(args, { cwd: f.cons, tmp: f.t });
    await sleep(ms);
    during = { exited: child.exited(), same: watch() === before };
  });
  return { during, result: await child.done, before };
}

// Another clone pushed phases/008-remote.md (item number 8) while this clone holds an untracked phases/008-local.md of the same
// number: the next commit of the folder renumbers the local one (008 -> 009) and the mirror database must follow and be committed.
export function numberClash(f) {
  const other = join(f.t, 'other-clone');
  gitIn(f.t, 'clone', '-q', join(f.t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), other);
  const put = (dir, slug) => store.write({
    path: join(dir, 'phases', `${slug}.md`),
    fm: { phase: slug, seq: 8, name: slug, status: 'pending', repository: 'acme/demo', branch: 'main', priority: 40, created: '2026-10-01T00:00:00Z', updated: '2026-10-01T00:00:00Z' },
    body: `\n# Phase 008\n\n${slug}\n`,
  }, dir);
  put(join(other, 'acme', 'demo'), '008-remote');
  gitIn(other, 'add', '-A'); gitIn(other, 'commit', '-q', '-m', 'remote item'); gitIn(other, 'push', '-q');
  put(f.folder, '008-local'); // untracked: the commit of the command adds it
}

// What a fresh clone of the shared backlog holds after the command: the pushed files and the pushed mirror rows.
export function pushedState(f) {
  const fresh = join(f.t, `fresh-${Date.now()}`);
  gitIn(f.t, 'clone', '-q', join(f.t, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git'), fresh);
  const dir = join(fresh, 'acme', 'demo');
  const con = db.connect(dir);
  try { return { slugs: con.prepare('SELECT slug FROM phase ORDER BY seq, slug').all().map(r => r.slug), files: store.load(dir).map(i => i.path) }; } finally { con.close(); }
}

export const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
